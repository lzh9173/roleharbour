import { t } from '../src/i18n';
import { startBackgroundLanguage } from '../src/i18n/background';
import { getLanguagePreference } from '../src/i18n/preference';
import { defineBackground } from 'wxt/utils/define-background';
import { localAnalysis } from '../src/core/local-analysis';
import { settingsMessageSchema } from '../src/core/schema';
import { restrictStorageAccess } from '../src/storage/access';
import { removeRetiredData } from '../src/storage/retired-data';
import { isTrustedSender } from '../src/core/messages';
import {
  broadcastToSeekTabs,
  isSeekPublicSender,
  isSeekPageSender,
  pageMessageSchema,
  type PageSender,
} from '../src/core/page-messages';
import { checkEmployers, getEmployerCacheStatus } from '../src/employers';
import { startEmployerSnapshotSchedule } from '../src/employers/schedule';

/** Brings an already open settings tab forward instead of stacking new ones. */
/** A localised message meant for the page; any other error stays in the worker. */
class PageError extends Error {}
const pageError = (error: unknown, fallback: string) =>
  error instanceof PageError ? error.message : fallback;

async function openSettings(): Promise<void> {
  const url = chrome.runtime.getURL('sidepanel.html');
  const contexts = await chrome.runtime
    .getContexts?.({
      contextTypes: ['TAB', 'SIDE_PANEL'] as chrome.runtime.ContextType[],
      documentUrls: [url],
    })
    .catch(() => []);
  // A side panel context has windowId but no tab of its own; focus its window.
  const open = contexts?.find((context) => context.tabId >= 0 || context.windowId >= 0);
  if (open) {
    if (open.tabId >= 0) await chrome.tabs.update(open.tabId, { active: true });
    if (open.windowId >= 0) await chrome.windows.update(open.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
}

export default defineBackground(() => {
  const { ready: languageReady } = startBackgroundLanguage();
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
      await broadcastToSeekTabs(notice);
    },
  });
  void restrictStorageAccess();
  void removeRetiredData().catch(() => undefined);
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
          () => sendResponse({ ok: false, error: t('settings.tryAgain') }),
        );
      return true;
    }
    if (
      message.type === 'page:language' ||
      message.type === 'page:employers' ||
      message.type === 'page:local'
    ) {
      void (async () => {
        const supported = await isCurrentPublicPage(sender);
        await languageReady;
        if (!supported) throw new PageError(t('errors.pageUnsupported'));
        if (message.type === 'page:language')
          return { ok: true, preference: getLanguagePreference() };
        // Internal errors stay in the worker; the page only learns which step failed.
        if (message.type === 'page:employers')
          try {
            return {
              ok: true,
              employers: await checkEmployers(message.names),
              cache: await getEmployerCacheStatus(),
            };
          } catch {
            throw new PageError(t('page.listReadError'));
          }
        try {
          return { ok: true, reading: localAnalysis(message.title, message.body) };
        } catch {
          throw new PageError(t('errors.localReading'));
        }
      })().then(sendResponse, (error: unknown) =>
        sendResponse({
          ok: false,
          error: pageError(error, t('errors.requestFailed')),
        }),
      );
      return true;
    }
    if (message.type === 'page:open-settings') {
      void openSettings().then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false, error: t('errors.settingsOpen') }),
      );
      return true;
    }
    return false;
  });
});
