import { beforeEach, vi } from 'vitest';
import { applyLanguagePreference } from '../src/i18n/preference';

// Existing fixtures assert Chinese copy explicitly. Locale tests override these
// getters or provide chrome.i18n, independent of the test machine's language.
beforeEach(() => {
  applyLanguagePreference('auto');
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
});
