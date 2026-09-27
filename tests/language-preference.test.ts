import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatNumber, getLocale, t } from '../src/i18n';
import {
  applyLanguagePreference,
  getLanguagePreference,
  isLanguagePreference,
  LANGUAGE_STORAGE_KEY,
  loadLanguagePreference,
  saveLanguagePreference,
  subscribeLanguage,
  watchLanguagePreference,
  type LanguagePreference,
} from '../src/i18n/preference';

type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

let browserLanguage: string;
let saved: Record<string, unknown>;
let changes: Set<ChangeListener>;
let cleanup: (() => void)[];
let local: {
  get: ReturnType<typeof vi.fn<(key: string) => Promise<Record<string, unknown>>>>;
  set: ReturnType<typeof vi.fn<(values: Record<string, unknown>) => Promise<void>>>;
};
let onChanged: {
  addListener: ReturnType<typeof vi.fn<(listener: ChangeListener) => void>>;
  removeListener: ReturnType<typeof vi.fn<(listener: ChangeListener) => void>>;
};

function emit(values: Record<string, chrome.storage.StorageChange>, area = 'local') {
  for (const listener of changes) listener(values, area);
}

function watch() {
  const dispose = watchLanguagePreference();
  cleanup.push(dispose);
  return dispose;
}

beforeEach(() => {
  applyLanguagePreference('auto');
  browserLanguage = 'en-NZ';
  saved = {};
  changes = new Set();
  cleanup = [];
  local = {
    get: vi.fn(async (key: string) => ({ [key]: saved[key] })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(saved, values);
    }),
  };
  onChanged = {
    addListener: vi.fn((listener: ChangeListener) => {
      changes.add(listener);
    }),
    removeListener: vi.fn((listener: ChangeListener) => {
      changes.delete(listener);
    }),
  };
  vi.stubGlobal('chrome', {
    i18n: { getUILanguage: () => browserLanguage },
    storage: { local, onChanged },
  });
});

afterEach(() => {
  cleanup.forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('manual language selection', () => {
  it.each([
    ['zh-CN', '设置'],
    ['en', 'Settings'],
    ['zh-TW', '設定'],
    ['ja', '設定'],
    ['ko', '설정'],
  ] as const)('uses selected %s instead of the browser language', async (locale, title) => {
    browserLanguage = locale === 'en' ? 'zh-CN' : 'en-NZ';
    await saveLanguagePreference(locale);
    expect(getLanguagePreference()).toBe(locale);
    expect(getLocale()).toBe(locale);
    expect(t('settings.title')).toBe(title);
  });

  it('formats dates and numbers in the selected language', async () => {
    browserLanguage = 'en-US';
    await saveLanguagePreference('ko');
    expect(formatDate('2026-09-21')).toBe(
      new Date('2026-09-21T00:00:00Z').toLocaleDateString('ko', { timeZone: 'UTC' }),
    );
    expect(formatNumber(30261.5)).toBe(new Intl.NumberFormat('ko').format(30261.5));
  });

  it('returns to browser language and regional formatting when auto is selected', async () => {
    await saveLanguagePreference('ko');
    browserLanguage = 'en-GB';
    await saveLanguagePreference('auto');
    expect(getLanguagePreference()).toBe('auto');
    expect(getLocale()).toBe('en');
    expect(formatDate('2026-09-21')).toBe('21/09/2026');
    browserLanguage = 'zh-Hant-HK';
    expect(getLocale()).toBe('zh-TW');
    expect(t('settings.title')).toBe('設定');
  });

  it('persists only uiLanguage without reading or changing API Key storage', async () => {
    saved = { apiKey: 'test-only-sentinel', consent: true, uiLanguage: 'en' };
    await saveLanguagePreference('ja');
    expect(LANGUAGE_STORAGE_KEY).toBe('uiLanguage');
    expect(local.set).toHaveBeenCalledExactlyOnceWith({ uiLanguage: 'ja' });
    expect(local.get).not.toHaveBeenCalled();
    expect(saved).toEqual({ apiKey: 'test-only-sentinel', consent: true, uiLanguage: 'ja' });
  });

  it('restores the saved selection after in-memory state is reset for a reload', async () => {
    await saveLanguagePreference('ko');
    applyLanguagePreference('auto');
    expect(getLocale()).toBe('en');
    await loadLanguagePreference();
    expect(local.get).toHaveBeenCalledExactlyOnceWith('uiLanguage');
    expect(getLanguagePreference()).toBe('ko');
    expect(t('settings.title')).toBe('설정');
  });

  it('keeps the current selection when a save fails', async () => {
    applyLanguagePreference('ja');
    const listener = vi.fn();
    cleanup.push(subscribeLanguage(listener));
    local.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(saveLanguagePreference('ko')).rejects.toThrow('Storage unavailable');
    expect(getLanguagePreference()).toBe('ja');
    expect(getLocale()).toBe('ja');
    expect(listener).not.toHaveBeenCalled();
  });

  it.each(['fr', 'zh-HK', '', null, 42, {}])(
    'rejects unsupported saved values: %j',
    async (value) => {
      applyLanguagePreference('ko');
      expect(isLanguagePreference(value)).toBe(false);
      await expect(saveLanguagePreference(value as LanguagePreference)).rejects.toThrow(RangeError);
      expect(local.set).not.toHaveBeenCalled();
      expect(getLanguagePreference()).toBe('ko');
    },
  );
});

describe('language changes across extension windows', () => {
  it('applies local uiLanguage events and notifies subscribers', () => {
    watch();
    const listener = vi.fn();
    cleanup.push(subscribeLanguage(listener));
    emit({ uiLanguage: { oldValue: 'auto', newValue: 'ko' } });
    expect(getLanguagePreference()).toBe('ko');
    expect(t('settings.title')).toBe('설정');
    expect(listener).toHaveBeenCalledOnce();
    expect(local.get).not.toHaveBeenCalled();
    expect(local.set).not.toHaveBeenCalled();
  });

  it('ignores other storage keys and storage areas', () => {
    applyLanguagePreference('ja');
    watch();
    const listener = vi.fn();
    cleanup.push(subscribeLanguage(listener));
    emit({ apiKey: { newValue: 'test-only-sentinel' }, consent: { newValue: true } });
    emit({ uiLanguage: { newValue: 'ko' } }, 'session');
    emit({ uiLanguage: { newValue: 'zh-CN' } }, 'sync');
    expect(getLanguagePreference()).toBe('ja');
    expect(listener).not.toHaveBeenCalled();
    expect(local.get).not.toHaveBeenCalled();
    expect(local.set).not.toHaveBeenCalled();
  });

  it.each([undefined, 'unsupported'])(
    'uses browser language after a removed or invalid value: %s',
    (value) => {
      applyLanguagePreference('ja');
      watch();
      emit({ uiLanguage: { oldValue: 'ja', newValue: value } });
      expect(getLanguagePreference()).toBe('auto');
      expect(getLocale()).toBe('en');
    },
  );

  it('removes the storage listener when disposed', () => {
    const dispose = watch();
    const registered = onChanged.addListener.mock.calls[0]![0];
    expect(changes.has(registered)).toBe(true);
    dispose();
    expect(onChanged.removeListener).toHaveBeenCalledWith(registered);
    expect(changes.size).toBe(0);
    emit({ uiLanguage: { newValue: 'ko' } });
    expect(getLanguagePreference()).toBe('auto');
  });

  it('does not replace a newer window selection when an older save finishes', async () => {
    watch();
    const pending = deferred<void>();
    local.set.mockReturnValueOnce(pending.promise);
    const saving = saveLanguagePreference('ja');
    emit({ uiLanguage: { newValue: 'ko' } });
    pending.resolve(undefined);
    await saving;
    expect(getLanguagePreference()).toBe('ko');
  });
});

describe('language initialisation races', () => {
  it('does not overwrite a newly saved selection with a delayed initial read', async () => {
    const pending = deferred<Record<string, unknown>>();
    local.get.mockReturnValueOnce(pending.promise);
    const loading = loadLanguagePreference();
    await saveLanguagePreference('ko');
    pending.resolve({ uiLanguage: 'ja' });
    await loading;
    expect(getLanguagePreference()).toBe('ko');
  });

  it('ignores a delayed initial read after returning to auto with the same value event', async () => {
    watch();
    const listener = vi.fn();
    cleanup.push(subscribeLanguage(listener));
    const pending = deferred<Record<string, unknown>>();
    local.get.mockReturnValueOnce(pending.promise);
    const loading = loadLanguagePreference();
    emit({ uiLanguage: { oldValue: 'ja', newValue: 'auto' } });
    expect(listener).not.toHaveBeenCalled();
    pending.resolve({ uiLanguage: 'ko' });
    await loading;
    expect(getLanguagePreference()).toBe('auto');
    expect(getLocale()).toBe('en');
  });

  it('ignores a delayed initial read after saving auto when already following the browser', async () => {
    const pending = deferred<Record<string, unknown>>();
    local.get.mockReturnValueOnce(pending.promise);
    const loading = loadLanguagePreference();
    await saveLanguagePreference('auto');
    pending.resolve({ uiLanguage: 'ko' });
    await loading;
    expect(getLanguagePreference()).toBe('auto');
  });

  it('keeps the new selection when the initial read finishes while its save is pending', async () => {
    const initialRead = deferred<Record<string, unknown>>();
    const pendingSave = deferred<void>();
    local.get.mockReturnValueOnce(initialRead.promise);
    local.set.mockReturnValueOnce(pendingSave.promise);
    const loading = loadLanguagePreference();
    const saving = saveLanguagePreference('ko');
    initialRead.resolve({ uiLanguage: 'ja' });
    await loading;
    pendingSave.resolve(undefined);
    await saving;
    expect(getLanguagePreference()).toBe('ko');
  });

  it('preserves the current selection if initial storage access fails', async () => {
    applyLanguagePreference('ko');
    local.get.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(loadLanguagePreference()).resolves.toBeUndefined();
    expect(getLanguagePreference()).toBe('ko');
  });

  it('uses the browser language for missing or invalid persisted values', async () => {
    for (const value of [undefined, 'not-a-language', null]) {
      applyLanguagePreference('ko');
      saved = { uiLanguage: value };
      await loadLanguagePreference();
      expect(getLanguagePreference()).toBe('auto');
      expect(getLocale()).toBe('en');
    }
  });

  it('loads and disposes safely when extension storage is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);
    await expect(loadLanguagePreference()).resolves.toBeUndefined();
    expect(() => watchLanguagePreference()()).not.toThrow();
    expect(getLocale()).toBe('zh-CN');
  });
});
