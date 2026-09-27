import { t } from '../src/i18n';
import { startBackgroundLanguage } from '../src/i18n/background';
import { getLanguagePreference } from '../src/i18n/preference';
import { defineBackground } from 'wxt/utils/define-background';
import { analyze } from '../src/core/analyze';
import { settingsMessageSchema } from '../src/core/schema';
import { getPagePreferences, restrictKeyAccess, setAutoAnalyze } from '../src/storage/settings';
import { isTrustedSender } from '../src/core/messages';
import {
  isSeekPublicSender,
  isSeekPageSender,
  pageMessageSchema,
  validateCurrentPageAnalysis,
  type PageSender,
} from '../src/core/page-messages';
import { checkEmployers, getEmployerCacheStatus } from '../src/employers';
import { startEmployerSnapshotSchedule } from '../src/employers/schedule';

export default defineBackground(() => {
  const { ready: languageReady } = startBackgroundLanguage();
  const controllers = new Map<
    string,
    {
      controller: AbortController;
      tabId: number;
      documentId?: string;
    }
  >();
  const pageRequests = new Map<number, string>();
  const isCurrentPublicPage = async (sender: PageSender) => {
    const current = await chrome.tabs.get(sender.tab!.id!);
    return (
      current.id === sender.tab!.id &&
      !!current.url &&
      new URL(current.url).origin === new URL(sender.url!).origin &&
      isSeekPublicSender({ ...sender, url: current.url }, chrome.runtime.id)
    );
  };
  const employerSchedule = startEmployerSnapshotSchedule({
    onUpdated: async () => {
      // Invalidate views without exposing the list or company queries in a broadcast.
      const notice = { type: 'employers:updated' };
      await chrome.runtime.sendMessage(notice).catch(() => undefined);
      const tabs = await chrome.tabs.query({
        url: ['https://nz.seek.com/*', 'https://www.seek.co.nz/*'],
      });
      await Promise.all(
        tabs.map(async (tab) => {
          if (
            !isSeekPublicSender(
              { id: chrome.runtime.id, frameId: 0, url: tab.url, tab },
              chrome.runtime.id,
            )
          )
            return;
          await chrome.tabs.sendMessage(tab.id!, notice, { frameId: 0 }).catch(() => undefined);
        }),
      );
    },
  });
  void restrictKeyAccess();
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });
  // setPanelBehavior persists; also repair it after an unpacked extension reload.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.runtime.onMessage.addListener((input: unknown, sender, sendResponse) => {
    const trusted = isTrustedSender(sender, chrome.runtime.id);
    if (!trusted && !isSeekPageSender(sender, chrome.runtime.id)) return false;
    const parsed = trusted
      ? settingsMessageSchema.safeParse(input)
      : pageMessageSchema.safeParse(input);
    if (!parsed.success) {
      sendResponse({ ok: false, error: t('errors.requestInvalid') });
      return false;
    }
    const message = parsed.data;
    if (message.type === 'employers:refresh') {
      void languageReady
        .then(() => employerSchedule.refresh())
        .then(
          (cache) => sendResponse({ ok: true, cache }),
          () => sendResponse({ ok: false, error: t('page.listReadError') }),
        );
      return true;
    }
    if (
      message.type === 'page:language' ||
      message.type === 'page:preferences' ||
      message.type === 'page:auto' ||
      message.type === 'page:employers'
    ) {
      void (async () => {
        const supported = await isCurrentPublicPage(sender);
        await languageReady;
        if (!supported) throw new Error(t('errors.pageUnsupported'));
        if (message.type === 'page:language')
          return { ok: true, preference: getLanguagePreference() };
        if (message.type === 'page:employers')
          return {
            ok: true,
            employers: await checkEmployers(message.names, { refresh: false }),
            cache: await getEmployerCacheStatus(),
          };
        return {
          ok: true,
          preferences:
            message.type === 'page:auto'
              ? await setAutoAnalyze(message.enabled, message.provider ?? 'jev')
              : await getPagePreferences(),
        };
      })().then(sendResponse, (error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : t('errors.configCacheRead'),
        }),
      );
      return true;
    }
    if (message.type === 'page:open-workspace') {
      void chrome.tabs
        .create({
          url: chrome.runtime.getURL(
            message.section === 'settings' ? 'sidepanel.html#settings' : 'sidepanel.html',
          ),
        })
        .then(
          () => sendResponse({ ok: true }),
          () => sendResponse({ ok: false, error: t('errors.settingsOpen') }),
        );
      return true;
    }
    if (message.type === 'page:cancel') {
      const request = controllers.get(message.requestId);
      if (
        !request ||
        request.tabId !== sender.tab!.id ||
        request.documentId !== sender.documentId
      ) {
        sendResponse({ ok: false, error: t('errors.pageTaskMissing') });
        return false;
      }
      request.controller.abort();
      sendResponse({ ok: true });
      return false;
    }
    if (pageRequests.has(sender.tab!.id!)) {
      sendResponse({ ok: false, error: t('errors.pageTaskRunning') });
      return false;
    }
    if (controllers.has(message.requestId)) {
      sendResponse({ ok: false, error: t('errors.taskRunning') });
      return false;
    }
    const controller = new AbortController();
    const tabId = sender.tab!.id!;
    controllers.set(message.requestId, {
      controller,
      tabId,
      documentId: sender.documentId,
    });
    pageRequests.set(tabId, message.requestId);
    // Reserve before the first await: concurrent page requests and cancellations
    // must observe this task while Chrome resolves the current SPA URL.
    const run = async () => {
      const currentTab = await chrome.tabs.get(tabId);
      await languageReady;
      if (!validateCurrentPageAnalysis(message, sender, currentTab, chrome.runtime.id)) {
        return { ok: false, error: t('errors.jobPageMismatch') };
      }
      if (message.automatic) {
        const preferences = await getPagePreferences();
        if (!preferences.autoAnalyze || !preferences.ready)
          return { ok: false, error: t('errors.autoNotReady') };
      }
      if (controller.signal.aborted) return { ok: false, error: t('errors.taskStopped') };
      // The content UI also rechecks its full JD snapshot before sending and
      // before rendering, and cancels on unmount; no message-provided URL is trusted.
      return analyze(message.requestId, message.draft, message.mode, controller.signal, {
        automatic: message.automatic,
        force: message.force,
        onRetry: (attempt) => {
          void chrome.tabs
            .sendMessage(
              tabId,
              { type: 'page:analysis-retry', requestId: message.requestId, attempt },
              sender.documentId ? { documentId: sender.documentId } : { frameId: 0 },
            )
            .catch(() => undefined);
        },
      });
    };
    void run()
      .then(sendResponse, () => sendResponse({ ok: false, error: t('errors.analysisIncomplete') }))
      .finally(() => {
        controllers.delete(message.requestId);
        if (pageRequests.get(tabId) === message.requestId) pageRequests.delete(tabId);
      });
    return true;
  });
});
