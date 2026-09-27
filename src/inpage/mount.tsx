import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { formatDate, formatNumber, getLocale, t } from '../i18n';
import { subscribeLanguage } from '../i18n/preference';
import { connectPageLanguage } from '../i18n/page-preference';
import type { JobDraft } from '../core/schema';
import { findSeekCards, findSeekDetailAnchor, readSeekDetail, type SeekCard } from './seek';
import { InlinePanel, isUserAction, openWorkspace, sameSnapshot } from './InlinePanel';
import css from './style.css?inline';
import { EmployerBadge } from './EmployerBadge';
import type { EmployerCheck, EmployerCacheStatus } from '../employers';
import { brandStyle, buttonStyle, focusRing, linkStyle } from './styles';
import { isPageRuntimeAvailable, sendPageMessage } from '../core/page-runtime';

interface Mount {
  host: HTMLElement;
  container: HTMLElement;
  root: Root;
  destroy: () => void;
}

function createMount(name: string): Mount {
  const host = document.createElement('div');
  host.dataset.seekFilter = name;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = css;
  const container = document.createElement('div');
  container.lang = getLocale();
  shadow.append(style, container);
  // Keep host-site delegated card clicks from intercepting extension controls.
  // React's handlers run at container before the event reaches this boundary.
  for (const event of ['click', 'pointerdown', 'keydown'])
    shadow.addEventListener(event, (e) => e.stopPropagation());
  const root = createRoot(container);
  return {
    host,
    container,
    root,
    destroy: () => {
      root.unmount();
      host.remove();
    },
  };
}

function CardLabel({ card, employerCheck }: { card: SeekCard; employerCheck?: EmployerCheck }) {
  return (
    <div className="mt-[var(--roleharbour-card-margin-top)] flex flex-wrap items-center gap-2 border-t border-rh-border pt-[13px]">
      <span className="text-[10px] font-extrabold tracking-[0.7px] whitespace-nowrap text-rh-navy">
        RoleHarbour
      </span>
      <div className="flex flex-wrap items-center gap-[6px] text-[12px]">
        <EmployerBadge employer={card.employer} check={employerCheck} compact />
      </div>
      <a
        className={`card-action ml-auto rounded-[7px] bg-rh-info-bg px-[10px] py-[6px] text-[12px] font-[650] text-rh-link no-underline hover:underline max-[480px]:ml-0 ${focusRing}`}
        href={`${card.url}#seek-filter`}
      >
        {t('page.viewRequirements')}
      </a>
    </div>
  );
}

function insertCardLabel(card: SeekCard, host: HTMLElement) {
  const recommended = card.element.querySelector(
    ':scope > a[data-automation^="recommendedJobLink_"]',
  );
  const content = recommended
    ? Array.from(card.element.children).find((child) =>
        child.querySelector('[data-automation="jobTitle"]'),
      )
    : undefined;
  if (content) {
    // Feed actions are absolutely positioned at the card's bottom edge. Keep
    // SEEK's existing time/status row last so those actions retain their space.
    host.dataset.seekFilterPlacement = 'feed';
    const footer = content.lastElementChild;
    if (
      content.children.length > 1 &&
      footer &&
      !footer.querySelector('[data-automation="jobTitle"]')
    )
      footer.before(host);
    else content.prepend(host);
  } else card.element.append(host);
}

/** Reconciles only visible public job DOM. Nothing here initiates a model request. */
export function mountSeekIntegration(
  context?: Pick<ContentScriptContext, 'isInvalid' | 'onInvalidated'>,
): () => void {
  const cards = new Map<HTMLElement, { mount: Mount; card: SeekCard }>();
  let toolbar: Mount | undefined;
  let detail: { mount: Mount; draft: JobDraft; anchor: HTMLElement } | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastUrl = location.href;
  const employers = new Map<string, EmployerCheck>();
  const requestedEmployers = new Set<string>();
  let employerCache: EmployerCacheStatus | undefined;
  let employerBusy = 0;
  let employerMessage = '';
  let employerRevision = 0;
  let observer: MutationObserver | undefined;
  let urlTimer: ReturnType<typeof setInterval> | undefined;
  let stopLanguage = () => {};
  let stopPageLanguage = () => {};
  let stopEmployerUpdates = () => {};
  let stopContext = () => {};

  function stop() {
    if (stopped) return;
    stopped = true;
    employerRevision++;
    observer?.disconnect();
    clearInterval(urlTimer);
    clearTimeout(timer);
    window.removeEventListener('focus', focus);
    window.removeEventListener('popstate', schedule);
    stopContext();
    stopLanguage();
    stopPageLanguage();
    stopEmployerUpdates();
    cards.forEach((entry) => entry.mount.destroy());
    cards.clear();
    toolbar?.destroy();
    detail?.mount.destroy();
  }

  function active(): boolean {
    if (stopped) return false;
    // WXT detects a Chrome reload lazily when isInvalid is read.
    if (context?.isInvalid || !isPageRuntimeAvailable()) stop();
    return !stopped;
  }

  function paintCard(entry: { mount: Mount; card: SeekCard }) {
    if (stopped) return;
    entry.mount.container.lang = getLocale();
    entry.mount.root.render(
      <CardLabel card={entry.card} employerCheck={employers.get(entry.card.employer.trim())} />,
    );
  }
  function paintDetail() {
    if (!stopped && detail) {
      detail.mount.container.lang = getLocale();
      detail.mount.root.render(
        <InlinePanel
          draft={detail.draft}
          employerCheck={employers.get(detail.draft.employer.trim())}
        />,
      );
    }
  }
  async function refreshEmployers(names: string[]) {
    if (!active()) return;
    const queries = [
      ...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2 && n.length <= 240)),
    ].filter((n) => !requestedEmployers.has(n));
    if (!queries.length) return;
    queries.forEach((n) => requestedEmployers.add(n));
    const revision = employerRevision;
    employerBusy++;
    schedule();
    try {
      for (let i = 0; i < queries.length; i += 20) {
        if (!active() || revision !== employerRevision) return;
        const response = await sendPageMessage({
          type: 'page:employers',
          names: queries.slice(i, i + 20),
        });
        if (!active() || revision !== employerRevision) return;
        if (!response?.ok) throw new Error(response?.error ?? t('page.listReadError'));
        for (const check of response.employers as EmployerCheck[])
          employers.set(check.query, check);
        employerCache = response.cache;
        employerMessage = '';
        cards.forEach(paintCard);
        paintDetail();
        schedule();
      }
    } catch (error) {
      if (!active() || revision !== employerRevision) return;
      employerMessage = error instanceof Error ? error.message : t('page.listReadError');
      for (const query of queries)
        if (!employers.has(query))
          employers.set(query, {
            query,
            status: 'unavailable',
            matches: [],
            checkedAt: null,
            stale: true,
          });
      cards.forEach(paintCard);
      paintDetail();
    } finally {
      employerBusy--;
      if (!stopped) schedule();
    }
  }
  function reconcile() {
    if (!active()) return;
    const currentCards = findSeekCards(document);
    const present = new Set(currentCards.map((c) => c.element));
    for (const [element, entry] of cards)
      if (!present.has(element) || !element.isConnected) {
        entry.mount.destroy();
        cards.delete(element);
      }
    for (const card of currentCards) {
      let entry = cards.get(card.element);
      if (entry && (!entry.mount.host.isConnected || entry.card.url !== card.url)) {
        entry.mount.destroy();
        cards.delete(card.element);
        entry = undefined;
      }
      if (!entry) {
        const mount = createMount('card');
        insertCardLabel(card, mount.host);
        entry = { mount, card };
        cards.set(card.element, entry);
        paintCard(entry);
      } else if (entry.card.title !== card.title || entry.card.employer !== card.employer) {
        entry.card = card;
        paintCard(entry);
      }
    }
    if (toolbar && (!toolbar.host.isConnected || !currentCards.length)) {
      toolbar.destroy();
      toolbar = undefined;
    }
    if (!toolbar && currentCards.length) {
      toolbar = createMount('toolbar');
      const first = currentCards[0]!.element;
      const list = first.closest('ul');
      (list ?? first).before(toolbar.host);
    }
    if (toolbar) toolbar.container.lang = getLocale();
    toolbar?.root.render(
      <div className="my-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-rh-border bg-rh-surface px-4 py-[13px]">
        <span className={`${brandStyle} whitespace-nowrap`}>RoleHarbour</span>
        <div className="min-w-[170px] flex-1">
          <p className="m-0 text-[12px] text-rh-muted">
            {t('page.jobCount', { count: formatNumber(currentCards.length) })}
          </p>
          <details className="mt-[3px] text-[11px]">
            <summary className={`cursor-pointer text-rh-muted ${focusRing}`}>
              {employerBusy
                ? t('page.readingList')
                : employerMessage
                  ? t('page.listReadError')
                  : t('page.listInformation')}
            </summary>
            {employerMessage && <p className="mt-2 text-[12px] text-rh-muted">{employerMessage}</p>}
            <p className="mt-2 text-[12px] text-rh-muted">
              {employerCache?.snapshotDate
                ? t('page.localListSummary', {
                    date: formatDate(employerCache.snapshotDate),
                    count: formatNumber(employerCache.recordCount),
                  })
                : t('page.noLocalList')}
            </p>
            <p className="mt-2 text-[12px] text-rh-muted">{t('page.listMatchNote')}</p>
            <a
              className={linkStyle}
              href={employerCache?.snapshotSourceUrl ?? 'https://nzaei.zemo.bio/open-data/'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('page.listSource')}
            </a>
          </details>
        </div>
        <button
          className={`${buttonStyle} text-[12px]`}
          disabled={employerBusy > 0}
          onClick={(event) => {
            if (isUserAction(event.nativeEvent))
              void openWorkspace('settings').catch((error: unknown) => {
                employerMessage =
                  error instanceof Error ? error.message : t('page.openListSettingsError');
                schedule();
              });
          }}
        >
          {t('page.updateList')}
        </button>
        <button
          className={`${buttonStyle} text-[12px]`}
          onClick={(event) => {
            if (isUserAction(event.nativeEvent))
              void openWorkspace('settings').catch(() => undefined);
          }}
        >
          {t('page.settings')}
        </button>
      </div>,
    );
    const draft = readSeekDetail(document);
    const anchor = draft ? findSeekDetailAnchor(document) : null;
    if (
      detail &&
      (!anchor ||
        !detail.mount.host.isConnected ||
        detail.anchor !== anchor ||
        !sameSnapshot(draft, detail.draft))
    ) {
      detail.mount.destroy();
      detail = undefined;
    }
    if (draft && anchor && !detail) {
      const mount = createMount('detail');
      mount.host.id = 'seek-filter';
      anchor.before(mount.host);
      detail = { mount, draft, anchor };
      paintDetail();
      if (location.hash === '#seek-filter')
        mount.host.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    if (document.visibilityState === 'visible')
      void refreshEmployers([
        ...currentCards.map((c) => c.employer),
        ...(draft ? [draft.employer] : []),
      ]);
  }
  function schedule() {
    if (timer || stopped) return;
    timer = setTimeout(() => {
      timer = undefined;
      reconcile();
    }, 250);
  }
  const focus = () => {
    if (!active()) return;
    employerRevision++;
    requestedEmployers.clear();
    schedule();
  };
  const employerUpdated = (message: unknown, sender: chrome.runtime.MessageSender) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      message.type !== 'employers:updated' ||
      !active() ||
      sender.id !== chrome.runtime.id ||
      sender.tab
    )
      return;
    employerRevision++;
    requestedEmployers.clear();
    schedule();
  };
  // Register before startup so invalidation also cleans up a partially mounted page.
  stopContext = context?.onInvalidated(stop) ?? (() => {});
  if (!active()) return stop;
  try {
    observer = new MutationObserver((records) => {
      if (
        records.some((record) => {
          if (
            (record.target instanceof Element
              ? record.target
              : record.target.parentElement
            )?.closest('[data-seek-filter]')
          )
            return false;
          if (
            record.type === 'childList' &&
            record.addedNodes.length &&
            !record.removedNodes.length &&
            Array.from(record.addedNodes).every(
              (n) => n instanceof Element && n.matches('[data-seek-filter]'),
            )
          )
            return false;
          return true;
        })
      )
        schedule();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'href',
        'hidden',
        'aria-hidden',
        'class',
        'style',
        'data-job-id',
        'data-jobid',
      ],
    });
    urlTimer = setInterval(() => {
      if (!active()) return;
      if (lastUrl !== location.href) {
        lastUrl = location.href;
        schedule();
      }
    }, 500);
    window.addEventListener('focus', focus);
    window.addEventListener('popstate', schedule);
    stopLanguage = subscribeLanguage(() => {
      if (!active()) return;
      cards.forEach(paintCard);
      paintDetail();
      reconcile();
    });
    stopPageLanguage = connectPageLanguage();
    if (chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(employerUpdated);
      stopEmployerUpdates = () => {
        try {
          chrome.runtime.onMessage.removeListener(employerUpdated);
        } catch {
          // Chrome may have invalidated this script before cleanup runs.
        }
      };
    }
    reconcile();
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
