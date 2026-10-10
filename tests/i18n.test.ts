import { emptyDraft } from './fixtures/job';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDate,
  formatNumber,
  getLocale,
  messages,
  additionalMessages,
  resolveLocale,
  t,
  translate,
} from '../src/i18n';
import { draftSchema } from '../src/core/schema';

afterEach(() => vi.unstubAllGlobals());

describe('browser language selection and translation integrity', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh_TW', 'zh-TW'],
    ['zh-Hant-HK', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-MO', 'zh-TW'],
    ['zh-Hans-TW', 'zh-CN'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['ZH-hans', 'zh-CN'],
    ['en-NZ', 'en'],
    ['en_GB', 'en'],
    ['fr-FR', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ] as const)('resolves %s to the supported %s interface', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });

  it('uses Chrome UI language ahead of navigator and reads it at call time', () => {
    let language = 'en-NZ';
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => language } });
    expect(navigator.language).toBe('zh-CN');
    expect(getLocale()).toBe('en');
    expect(t('settings.title')).toBe('Settings');
    language = 'zh-CN';
    expect(t('settings.title')).toBe('设置');
  });

  it('falls back safely outside Chrome and without a browser navigator', () => {
    vi.stubGlobal('chrome', undefined);
    expect(getLocale()).toBe('zh-CN');
    vi.stubGlobal('chrome', {
      i18n: {
        getUILanguage: () => {
          throw new Error('unavailable');
        },
      },
    });
    expect(getLocale()).toBe('zh-CN');
    vi.stubGlobal('navigator', undefined);
    expect(t('settings.title')).toBe('Settings');
  });

  it('has nonempty translations with matching placeholders for every message', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [key, [zh, en]] of Object.entries(messages)) {
      expect(zh.trim(), key).not.toBe('');
      expect(en.trim(), key).not.toBe('');
      expect(en, key).not.toMatch(/\p{Script=Han}/u);
      expect(placeholders(en), key).toEqual(placeholders(zh));
    }
    for (const [locale, catalog] of Object.entries(additionalMessages)) {
      expect(Object.keys(catalog).sort(), locale).toEqual(Object.keys(messages).sort());
      for (const [key, text] of Object.entries(catalog)) {
        expect(text.trim(), `${locale}: ${key}`).not.toBe('');
        expect(placeholders(text), `${locale}: ${key}`).toEqual(
          placeholders(messages[key as keyof typeof messages][1]),
        );
      }
    }
  });

  it('interpolates replacement characters literally without altering source text', () => {
    expect(translate('en', 'page.occupationReference')).toBe(
      messages['page.occupationReference'][1],
    );
    expect(translate('en', 'page.jobCount', { count: '$& {name}' })).toBe(
      'Employer list matching · $& {name} jobs',
    );
  });

  it('formats region-specific dates and numbers and preserves date-only calendar days', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'en-GB' } });
    expect(formatDate('2026-09-21')).toBe('21/09/2026');
    expect(formatNumber(30261)).toBe('30,261');
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'en-US' } });
    expect(formatDate('2026-09-21')).toBe('9/21/2026');
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'en-invalid-@' } });
    expect(() => formatDate('2026-09-21')).not.toThrow();
  });

  it('localises runtime validation messages', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'en' } });
    const result = draftSchema.safeParse(emptyDraft);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain('Enter a job title');
      expect(result.error.message).not.toMatch(/\p{Script=Han}/u);
    }
  });

  it('no longer ships copy for the retired remote provider, API key or job backups', () => {
    const catalogs = [
      ...Object.values(messages).flat(),
      ...Object.values(additionalMessages).flatMap((catalog) => Object.values(catalog)),
    ];
    for (const text of catalogs) {
      expect(text).not.toMatch(/TypeSafe|\bJEV\b|API\s*Key/i);
    }
    expect(
      Object.keys(messages).filter((key) => /jev|apiKey|consent|jobBackup/i.test(key)),
    ).toEqual([]);
  });

  it('ships native extension names and toolbar labels for all five languages', () => {
    const titles = {
      en: 'Open settings',
      zh_CN: '打开设置',
      zh_TW: '開啟設定',
      ja: '設定を開く',
      ko: '설정 열기',
    };
    for (const [locale, expectedTitle] of Object.entries(titles)) {
      const catalog = JSON.parse(
        readFileSync(
          new URL(`../public/_locales/${locale}/messages.json`, import.meta.url),
          'utf8',
        ),
      );
      expect(Object.keys(catalog).sort()).toEqual([
        'extensionDescription',
        'extensionName',
        'openSettings',
      ]);
      expect(catalog.openSettings.message).toBe(expectedTitle);
    }
  });
});
