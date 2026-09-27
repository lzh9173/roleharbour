import { messages, type MessageKey } from './catalog';
import { jaMessages } from './ja';
import { koMessages } from './ko';
import { zhTWMessages } from './zh-TW';
import { getLanguagePreference, type Locale } from './preference';
export { messages, type MessageKey } from './catalog';
export type { Locale } from './preference';
export const additionalMessages = { 'zh-TW': zhTWMessages, ja: jaMessages, ko: koMessages };
type Values = Readonly<Record<string, string | number>>;

/** Match the browser UI, not the language of the SEEK document. */
function browserLanguage(): string {
  try {
    const language = globalThis.chrome?.i18n?.getUILanguage?.();
    if (typeof language === 'string' && language.trim()) return language;
  } catch {
    // A local preview or an invalidated extension context may not expose Chrome.
  }
  return globalThis.navigator?.language || globalThis.navigator?.languages?.[0] || 'en';
}

export function resolveLocale(language: string | null | undefined): Locale {
  const parts = (language?.trim() ?? '').toLowerCase().replaceAll('_', '-').split('-');
  if (parts[0] === 'zh') {
    if (parts.includes('hans')) return 'zh-CN';
    return parts.some((part) => ['hant', 'tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN';
  }
  if (parts[0] === 'ja') return 'ja';
  if (parts[0] === 'ko') return 'ko';
  return 'en';
}

export function getLocale(): Locale {
  const preference = getLanguagePreference();
  return preference === 'auto' ? resolveLocale(browserLanguage()) : preference;
}

export function translate(locale: Locale, key: MessageKey, values: Values = {}): string {
  const template =
    locale === 'en' || locale === 'zh-CN'
      ? messages[key][locale === 'zh-CN' ? 0 : 1]
      : additionalMessages[locale][key];
  // The callback keeps user-supplied dollar signs literal. React escapes the result.
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

export function t(key: MessageKey, values: Values = {}): string {
  return translate(getLocale(), key, values);
}

function formatLocale(): string {
  const preference = getLanguagePreference();
  if (preference !== 'auto') return preference;
  const language = browserLanguage().trim().replaceAll('_', '-');
  if (/^(?:en|zh|ja|ko)(?:-|$)/i.test(language)) {
    try {
      return Intl.getCanonicalLocales(language)[0] ?? getLocale();
    } catch {
      // Invalid locale tags cannot break the settings or job panel.
    }
  }
  return getLocale();
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(formatLocale(), options).format(value);
}

export function formatDate(value: string | number | Date): string {
  // Published list dates are calendar dates, not UTC instants. Keep their day
  // unchanged for browsers west of UTC as well as New Zealand browsers.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Date(`${value}T00:00:00Z`).toLocaleDateString(formatLocale(), { timeZone: 'UTC' });
  return new Date(value).toLocaleDateString(formatLocale());
}
