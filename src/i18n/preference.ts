export const locales = ['zh-CN', 'en', 'zh-TW', 'ja', 'ko'] as const;
export type Locale = (typeof locales)[number];
export type LanguagePreference = Locale | 'auto';
export const LANGUAGE_STORAGE_KEY = 'uiLanguage';
export const languageNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
};

let preference: LanguagePreference = 'auto';
let revision = 0;
const listeners = new Set<() => void>();

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || locales.some((locale) => locale === value);
}

export function getLanguagePreference(): LanguagePreference {
  return preference;
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** In-memory update only. Content scripts receive this value through the safe bridge. */
export function applyLanguagePreference(value: LanguagePreference): void {
  if (!isLanguagePreference(value)) return;
  revision++;
  if (value === preference) return;
  preference = value;
  listeners.forEach((listener) => listener());
}

/** Only trusted extension pages and the background worker read local storage. */
export async function loadLanguagePreference(): Promise<void> {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) return;
  const started = revision;
  try {
    const stored = await storage.get(LANGUAGE_STORAGE_KEY);
    if (started === revision)
      applyLanguagePreference(
        isLanguagePreference(stored[LANGUAGE_STORAGE_KEY]) ? stored[LANGUAGE_STORAGE_KEY] : 'auto',
      );
  } catch {
    // Keep the current/browser language when local storage is temporarily unavailable.
  }
}

/** Watch just this preference; never send storage records or keys to a webpage. */
export function watchLanguagePreference(): () => void {
  const event = globalThis.chrome?.storage?.onChanged;
  if (!event) return () => {};
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !Object.hasOwn(changes, LANGUAGE_STORAGE_KEY)) return;
    const value: unknown = changes[LANGUAGE_STORAGE_KEY]?.newValue;
    applyLanguagePreference(isLanguagePreference(value) ? value : 'auto');
  };
  event.addListener(changed);
  return () => event.removeListener(changed);
}

export async function saveLanguagePreference(value: LanguagePreference): Promise<void> {
  if (!isLanguagePreference(value)) throw new RangeError('Invalid language preference');
  // Reserve before awaiting storage: an older initialization read must not
  // replace a selection whose save is already underway.
  const started = ++revision;
  await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: value });
  // Storage events can arrive before set() resolves, including a newer selection
  // from another settings window. Do not overwrite that newer state.
  if (started === revision) applyLanguagePreference(value);
}
