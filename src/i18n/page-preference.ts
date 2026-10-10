import { isWorkerNotice } from '../core/messages';
import { isPageRuntimeAvailable, sendPageMessage } from '../core/page-runtime';
import { applyLanguagePreference, isLanguagePreference } from './preference';

/** Content scripts cannot read extension storage (restricted to trusted contexts); the worker
 * reports the language preference instead. */
export function connectPageLanguage(): () => void {
  let active = true;
  let disposed = false;
  let request = 0;
  let extensionId: string | undefined;
  let messages: typeof chrome.runtime.onMessage | undefined;
  const refresh = () => {
    if (!active) return;
    const current = ++request;
    void sendPageMessage({ type: 'page:language' })
      .then((response) => {
        if (
          active &&
          current === request &&
          response?.ok &&
          isLanguagePreference(response.preference)
        )
          applyLanguagePreference(response.preference);
      })
      .catch((error: unknown) => {
        // Invalidated contexts cannot recover without a page refresh. Temporary
        // port failures may recover on a later focus or language notification.
        const invalidated =
          !isPageRuntimeAvailable() ||
          (error instanceof Error && /extension context invalidated/i.test(error.message));
        if (active && current === request && invalidated) stop();
      });
  };
  const changed = (message: unknown, sender: chrome.runtime.MessageSender) => {
    if (active && isWorkerNotice(message, sender, 'language:changed', extensionId)) refresh();
  };
  function stop() {
    if (disposed) return;
    disposed = true;
    active = false;
    request++;
    // Chrome's invalidated event object may throw even during removal.
    window.removeEventListener('focus', refresh);
    try {
      messages?.removeListener(changed);
    } catch {
      // Any retained callback is guarded by the inactive flag above.
    }
  }
  try {
    extensionId = globalThis.chrome?.runtime?.id;
    messages = globalThis.chrome?.runtime?.onMessage;
    if (!extensionId) {
      stop();
      return stop;
    }
    messages?.addListener(changed);
  } catch {
    stop();
    return stop;
  }
  window.addEventListener('focus', refresh);
  refresh();
  return stop;
}
