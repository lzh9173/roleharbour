import { t } from './index';
import { loadLanguagePreference, subscribeLanguage, watchLanguagePreference } from './preference';
import { isSeekPublicSender } from '../core/page-messages';

export function startBackgroundLanguage() {
  const setTitle = () => chrome.action?.setTitle({ title: t('settings.openSettings') });
  const notify = async () => {
    await setTitle();
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
        // Only an invalidation signal crosses the bridge. Each page reads the latest
        // allowlisted preference, so delayed notifications cannot restore old values.
        await chrome.tabs
          .sendMessage(tab.id!, { type: 'language:changed' }, { frameId: 0 })
          .catch(() => undefined);
      }),
    );
  };
  const stopStorage = watchLanguagePreference();
  const stopState = subscribeLanguage(() => {
    void notify().catch(() => undefined);
  });
  const ready = loadLanguagePreference();
  void ready.then(setTitle).catch(() => undefined);
  return {
    ready,
    dispose: () => {
      stopStorage();
      stopState();
    },
  };
}
