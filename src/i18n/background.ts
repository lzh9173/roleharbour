import { t } from './index';
import { loadLanguagePreference, subscribeLanguage, watchLanguagePreference } from './preference';
import { broadcastToSeekTabs } from '../core/page-messages';

export function startBackgroundLanguage() {
  const setTitle = () => chrome.action?.setTitle({ title: t('settings.openSettings') });
  const notify = async () => {
    await setTitle();
    // Only an invalidation signal crosses the bridge. Each page reads the latest
    // allowlisted preference, so delayed notifications cannot restore old values.
    await broadcastToSeekTabs({ type: 'language:changed' });
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
