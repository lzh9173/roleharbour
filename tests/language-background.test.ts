import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBackgroundLanguage } from '../src/i18n/background';
import { applyLanguagePreference, getLanguagePreference } from '../src/i18n/preference';

type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
let changes: Set<ChangeListener>;
let cleanup: (() => void) | undefined;
let localGet: ReturnType<typeof vi.fn>;
let query: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;
let setTitle: ReturnType<typeof vi.fn>;
let removeListener: ReturnType<typeof vi.fn>;

const candidateTabs = [
  { id: 1, url: 'https://nz.seek.com/' },
  { id: 2, url: 'https://www.seek.co.nz/jobs?jobId=12345' },
  { id: 3, url: 'https://nz.seek.com/job/12345' },
  { id: 4, url: 'https://nz.seek.com/software-engineer-jobs/in-All-Auckland' },
  { id: 5, url: 'https://nz.seek.com/profile' },
  { id: 6, url: 'https://nz.seek.com/profile/resume' },
  { id: 7, url: 'https://nz.seek.com/saved-jobs' },
  { id: 8, url: 'https://nz.seek.com/my-jobs' },
  { id: 9, url: 'https://nz.seek.com/my-activity' },
  { id: 10, url: 'https://nz.seek.com/job/12345/apply' },
  { id: 11, url: 'https://example.com/jobs' },
  { id: 12, url: 'https://seek.com.au/jobs' },
  { id: 13, url: 'http://nz.seek.com/jobs' },
  { id: 14, url: 'https://user:password@nz.seek.com/jobs' },
  { id: 15, url: 'https://nz.seek.com:8443/jobs' },
  { id: 16 },
  { url: 'https://nz.seek.com/jobs' },
];

function emit(changed: Record<string, chrome.storage.StorageChange>, area = 'local') {
  changes.forEach((listener) => listener(changed, area));
}

async function settle() {
  // Drain the load, title, query and per-tab notification promise chain.
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

beforeEach(() => {
  changes = new Set();
  localGet = vi.fn().mockResolvedValue({ uiLanguage: 'en' });
  query = vi.fn().mockResolvedValue(candidateTabs);
  sendMessage = vi.fn().mockResolvedValue(undefined);
  setTitle = vi.fn().mockResolvedValue(undefined);
  removeListener = vi.fn((listener: ChangeListener) => changes.delete(listener));
  vi.stubGlobal('chrome', {
    runtime: { id: extensionId },
    i18n: { getUILanguage: () => 'zh-CN' },
    action: { setTitle },
    tabs: { query, sendMessage },
    storage: {
      local: { get: localGet },
      onChanged: {
        addListener: vi.fn((listener: ChangeListener) => changes.add(listener)),
        removeListener,
      },
    },
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

describe('background language notifications', () => {
  it('reads only the language preference and signals only public SEEK top frames', async () => {
    localGet.mockResolvedValue({ uiLanguage: 'en', jevKey: 'private-key-test-sentinel' });
    const background = startBackgroundLanguage();
    cleanup = background.dispose;
    await background.ready;
    await settle();
    expect(localGet).toHaveBeenCalledExactlyOnceWith('uiLanguage');
    expect(query).toHaveBeenCalledExactlyOnceWith({
      url: ['https://nz.seek.com/*', 'https://www.seek.co.nz/*'],
    });
    expect(sendMessage.mock.calls).toEqual(
      [1, 2, 3, 4].map((id) => [id, { type: 'language:changed' }, { frameId: 0 }]),
    );
    expect(JSON.stringify(sendMessage.mock.calls)).not.toContain('private-key-test-sentinel');
    expect(JSON.stringify(sendMessage.mock.calls)).not.toContain('preference');
    expect(JSON.stringify(sendMessage.mock.calls)).not.toContain('uiLanguage');
    expect(setTitle).toHaveBeenLastCalledWith({ title: 'Open settings' });
  });

  it('continues notifying other tabs when one content script is unavailable', async () => {
    sendMessage.mockImplementation((id: number) =>
      id === 2 ? Promise.reject(new Error('Receiving end does not exist')) : Promise.resolve(),
    );
    const background = startBackgroundLanguage();
    cleanup = background.dispose;
    await background.ready;
    await settle();
    expect(sendMessage.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 4]);
    expect(getLanguagePreference()).toBe('en');

    sendMessage.mockClear();
    emit({ uiLanguage: { oldValue: 'en', newValue: 'ja' } });
    await settle();
    expect(sendMessage.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 4]);
    expect(setTitle).toHaveBeenLastCalledWith({ title: '設定を開く' });
  });

  it.each([
    ['zh-CN', '打开设置'],
    ['en', 'Open settings'],
    ['zh-TW', '開啟設定'],
    ['ja', '設定を開く'],
    ['ko', '설정 열기'],
  ] as const)('uses the saved %s preference in the toolbar title', async (preference, title) => {
    localGet.mockResolvedValue({ uiLanguage: preference });
    const background = startBackgroundLanguage();
    cleanup = background.dispose;
    await background.ready;
    await settle();
    expect(getLanguagePreference()).toBe(preference);
    expect(setTitle).toHaveBeenLastCalledWith({ title });
  });

  it('does not broadcast for other storage keys, other areas or an unchanged preference', async () => {
    const background = startBackgroundLanguage();
    cleanup = background.dispose;
    await background.ready;
    await settle();
    sendMessage.mockClear();
    query.mockClear();
    setTitle.mockClear();
    emit({ jevKey: { newValue: 'private-key-test-sentinel' }, jevConsent: { newValue: true } });
    emit({ uiLanguage: { newValue: 'ko' } }, 'session');
    emit({ uiLanguage: { newValue: 'ja' } }, 'sync');
    emit({ uiLanguage: { oldValue: 'en', newValue: 'en' } });
    await settle();
    expect(getLanguagePreference()).toBe('en');
    expect(query).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(setTitle).not.toHaveBeenCalled();
  });

  it('returns to the browser language when the saved value is removed', async () => {
    const background = startBackgroundLanguage();
    cleanup = background.dispose;
    await background.ready;
    await settle();
    sendMessage.mockClear();
    emit({ uiLanguage: { oldValue: 'en' } });
    await settle();
    expect(getLanguagePreference()).toBe('auto');
    expect(setTitle).toHaveBeenLastCalledWith({ title: '打开设置' });
    expect(sendMessage).toHaveBeenCalledTimes(4);
  });

  it('removes both subscriptions on dispose', async () => {
    const background = startBackgroundLanguage();
    cleanup = background.dispose;
    await background.ready;
    await settle();
    const registered = [...changes][0]!;
    background.dispose();
    cleanup = undefined;
    expect(removeListener).toHaveBeenCalledExactlyOnceWith(registered);
    expect(changes.size).toBe(0);
    sendMessage.mockClear();
    query.mockClear();
    setTitle.mockClear();
    emit({ uiLanguage: { newValue: 'ja' } });
    expect(getLanguagePreference()).toBe('en');
    applyLanguagePreference('ko');
    await settle();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(setTitle).not.toHaveBeenCalled();
  });
});
