import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { getLocale } from '../i18n';
import { subscribeLanguage } from '../i18n/preference';
import { connectPageLanguage } from '../i18n/page-preference';
import type { JobDraft } from '../core/schema';
import { isWorkerNotice } from '../core/messages';
import { isPageRuntimeAvailable } from '../core/page-runtime';
import { findSeekCards, readSeekDetailAt, type SeekCard } from './seek';
import { InlinePanel } from './InlinePanel';
import { openSettings, sameJob } from './actions';
import { CardLabel, insertCardLabel } from './CardLabel';
import { Toolbar } from './Toolbar';
import { createMount, type Mount } from './shadow-mount';
import { createEmployerLookup } from './employer-lookup';
import { debounce, isOwnMutation, observedAttributes } from './dom-changes';

/** Reconciles only visible public job DOM. Nothing here sends job text off the device. */
export function mountSeekIntegration(
  context?: Pick<ContentScriptContext, 'isInvalid' | 'onInvalidated'>,
): () => void {
  const cards = new Map<HTMLElement, { mount: Mount; card: SeekCard }>();
  let toolbar: Mount | undefined;
  let detail: { mount: Mount; draft: JobDraft; anchor: HTMLElement } | undefined;
  let cardCount = 0;
  let stopped = false;
  let lastUrl = location.href;
  let scrolledJob: string | undefined;
  // Set when a mutation lands inside the description, so unrelated page churn skips re-reading it.
  let detailTouched = true;
  let settingsError = '';
  let observer: MutationObserver | undefined;
  let urlTimer: ReturnType<typeof setInterval> | undefined;
  let stopLanguage = () => {};
  let stopPageLanguage = () => {};
  let stopEmployerUpdates = () => {};
  let stopContext = () => {};
  const pass = debounce(() => reconcile(), 200, 1000);
  const schedule = () => {
    if (!stopped) pass.schedule();
  };
  // A reply only changes what is painted; it never needs another DOM pass.
  const employers = createEmployerLookup({ isActive: active, onChange: paintAll });

  function stop() {
    if (stopped) return;
    stopped = true;
    employers.reset();
    observer?.disconnect();
    clearInterval(urlTimer);
    pass.cancel();
    window.removeEventListener('focus', recheckEmployers);
    document.removeEventListener('visibilitychange', visible);
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
      <CardLabel card={entry.card} employerCheck={employers.get(entry.card.employer)} />,
    );
  }
  function paintDetail() {
    if (stopped || !detail) return;
    detail.mount.container.lang = getLocale();
    detail.mount.root.render(
      <InlinePanel draft={detail.draft} employerCheck={employers.get(detail.draft.employer)} />,
    );
  }
  function paintToolbar() {
    if (stopped || !toolbar) return;
    toolbar.container.lang = getLocale();
    toolbar.root.render(
      <Toolbar
        count={cardCount}
        lookup={employers.state()}
        settingsError={settingsError}
        onSettings={() => {
          settingsError = '';
          void openSettings().then((error) => {
            settingsError = error;
            paintToolbar();
          });
        }}
      />,
    );
  }
  function paintAll() {
    cards.forEach(paintCard);
    paintDetail();
    paintToolbar();
  }

  function reconcileCards(): SeekCard[] {
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
    return currentCards;
  }
  function reconcileToolbar(currentCards: SeekCard[]) {
    cardCount = currentCards.length;
    if (toolbar && (!toolbar.host.isConnected || !cardCount)) {
      toolbar.destroy();
      toolbar = undefined;
    }
    if (!toolbar && cardCount) {
      toolbar = createMount('toolbar');
      const first = currentCards[0]!.element;
      (first.closest('ul') ?? first).before(toolbar.host);
    }
    paintToolbar();
  }
  function reconcileDetail(): JobDraft | null {
    const read = readSeekDetailAt(
      document,
      undefined,
      detail && !detailTouched ? { anchor: detail.anchor, body: detail.draft.body } : undefined,
    );
    detailTouched = false;
    if (detail && (!read || !sameJob(detail.draft, read.draft))) {
      detail.mount.destroy();
      detail = undefined;
    }
    if (!read) return null;
    const { draft, anchor } = read;
    if (detail) {
      // Same job: SEEK re-rendered the pane or filled in the advertiser late. Keep the panel,
      // its reading, open sections and focus; move it beside the new description if needed.
      if (!detail.mount.host.isConnected || detail.anchor !== anchor)
        anchor.before(detail.mount.host);
      const changed = detail.draft.employer !== draft.employer;
      detail.anchor = anchor;
      detail.draft = draft;
      if (changed) paintDetail();
      return draft;
    }
    const mount = createMount('detail');
    mount.host.id = 'seek-filter';
    anchor.before(mount.host);
    detail = { mount, draft, anchor };
    paintDetail();
    // Scroll for the card's "view" link once per job, not on every re-render of the pane.
    if (location.hash === '#seek-filter' && scrolledJob !== draft.sourceUrl) {
      scrolledJob = draft.sourceUrl;
      mount.host.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    return draft;
  }
  function reconcile() {
    if (!active()) return;
    const currentCards = reconcileCards();
    reconcileToolbar(currentCards);
    const draft = reconcileDetail();
    if (document.visibilityState === 'visible')
      void employers.request([
        ...currentCards.map((c) => c.employer),
        ...(draft ? [draft.employer] : []),
      ]);
  }

  function visible() {
    if (document.visibilityState === 'visible') schedule();
  }
  function recheckEmployers() {
    if (!active()) return;
    employers.reset();
    schedule();
  }
  const employerUpdated = (message: unknown, sender: chrome.runtime.MessageSender) => {
    if (isWorkerNotice(message, sender, 'employers:updated', chrome.runtime.id)) recheckEmployers();
  };

  // Register before startup so invalidation also cleans up a partially mounted page.
  stopContext = context?.onInvalidated(stop) ?? (() => {});
  if (!active()) return stop;
  try {
    observer = new MutationObserver((records) => {
      if (records.every(isOwnMutation)) return;
      if (!detailTouched)
        detailTouched = !detail || records.some((record) => detail!.anchor.contains(record.target));
      schedule();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: observedAttributes,
    });
    urlTimer = setInterval(() => {
      if (active() && lastUrl !== location.href) {
        lastUrl = location.href;
        schedule();
      }
    }, 500);
    window.addEventListener('focus', recheckEmployers);
    // Lookups wait while the tab is hidden; a tab opened in the background catches up here.
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('popstate', schedule);
    stopLanguage = subscribeLanguage(() => {
      if (!active()) return;
      paintAll();
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
