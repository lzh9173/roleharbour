// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectPageLanguage } from '../src/i18n/page-preference';
import { applyLanguagePreference, getLanguagePreference } from '../src/i18n/preference';

type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => void;
const extensionId = 'test-extension-id';
let listeners: Set<Listener>;
let send: ReturnType<typeof vi.fn>;
let storageAccess: ReturnType<typeof vi.fn<() => never>>;
let removeListener: ReturnType<typeof vi.fn>;
let cleanup: (() => void) | undefined;

function notify(message: unknown, sender: chrome.runtime.MessageSender = { id: extensionId }) {
  listeners.forEach((listener) => listener(message, sender));
}
async function settle() {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
}
function deferred() {
  let resolve!: (response: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  applyLanguagePreference('zh-CN');
  listeners = new Set();
  send = vi.fn().mockResolvedValue({ ok: true, preference: 'en' });
  storageAccess = vi.fn(() => {
    throw new Error('Content scripts must not access private extension storage');
  });
  removeListener = vi.fn((listener: Listener) => listeners.delete(listener));
  const chromeMock = {
    runtime: {
      id: extensionId,
      sendMessage: send,
      onMessage: {
        addListener: vi.fn((listener: Listener) => listeners.add(listener)),
        removeListener,
      },
    },
  };
  Object.defineProperty(chromeMock, 'storage', { get: storageAccess });
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

describe('content-script language bridge', () => {
  it('reads only page:language through the background and never accesses storage', async () => {
    cleanup = connectPageLanguage();
    await settle();
    expect(getLanguagePreference()).toBe('en');
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(send.mock.calls).toEqual([[{ type: 'page:language' }], [{ type: 'page:language' }]]);
    expect(storageAccess).not.toHaveBeenCalled();
  });

  it('accepts only notifications from this extension background and rereads the safe preference', async () => {
    cleanup = connectPageLanguage();
    await settle();
    send.mockResolvedValue({ ok: true, preference: 'ja' });
    for (const sender of [
      {},
      { id: 'another-extension' },
      { id: extensionId, tab: { id: 1 } as chrome.tabs.Tab },
    ])
      notify({ type: 'language:changed', preference: 'ko' }, sender);
    notify(null);
    notify('language:changed');
    notify({ type: 'other:changed' });
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(getLanguagePreference()).toBe('en');

    // The notification payload is never trusted as the stored preference.
    notify({ type: 'language:changed', preference: 'ko' });
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ type: 'page:language' });
    expect(getLanguagePreference()).toBe('ja');
    expect(storageAccess).not.toHaveBeenCalled();
  });

  it('does not let an older read overwrite a newer language notification result', async () => {
    const oldRead = deferred();
    send.mockReturnValueOnce(oldRead.promise);
    cleanup = connectPageLanguage();
    send.mockResolvedValue({ ok: true, preference: 'ko' });
    notify({ type: 'language:changed' });
    await settle();
    expect(getLanguagePreference()).toBe('ko');
    oldRead.resolve({ ok: true, preference: 'en' });
    await settle();
    expect(getLanguagePreference()).toBe('ko');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('invalidates older reads as soon as a newer notification starts a read', async () => {
    const oldRead = deferred();
    const newRead = deferred();
    send.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    cleanup = connectPageLanguage();
    notify({ type: 'language:changed' });
    oldRead.resolve({ ok: true, preference: 'en' });
    await settle();
    expect(getLanguagePreference()).toBe('zh-CN');
    newRead.resolve({ ok: true, preference: 'ja' });
    await settle();
    expect(getLanguagePreference()).toBe('ja');
  });

  it('does not deactivate a healthy newer read when an older request rejects', async () => {
    const oldRead = deferred();
    send.mockReturnValueOnce(oldRead.promise);
    cleanup = connectPageLanguage();
    send.mockResolvedValue({ ok: true, preference: 'ja' });
    notify({ type: 'language:changed' });
    await settle();
    oldRead.reject(new Error('The older request failed'));
    await settle();
    expect(getLanguagePreference()).toBe('ja');
    send.mockResolvedValue({ ok: true, preference: 'ko' });
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(getLanguagePreference()).toBe('ko');
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('removes both listeners and ignores a late response after cleanup', async () => {
    const response = deferred();
    const removeFocus = vi.spyOn(window, 'removeEventListener');
    send.mockReturnValueOnce(response.promise);
    cleanup = connectPageLanguage();
    const listener = [...listeners][0];
    cleanup();
    cleanup = undefined;
    expect(removeListener).toHaveBeenCalledWith(listener);
    expect(listeners.size).toBe(0);
    expect(removeFocus).toHaveBeenCalledWith('focus', expect.any(Function));
    notify({ type: 'language:changed' });
    window.dispatchEvent(new Event('focus'));
    response.resolve({ ok: true, preference: 'ja' });
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(getLanguagePreference()).toBe('zh-CN');
    expect(storageAccess).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false, preference: 'ja' },
    { ok: true, preference: 'unsupported' },
    { ok: true },
    null,
  ])('keeps the current language for an invalid response: %j', async (response) => {
    send.mockResolvedValue(response);
    cleanup = connectPageLanguage();
    await settle();
    expect(getLanguagePreference()).toBe('zh-CN');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps the current language on a rejected request without retrying', async () => {
    send.mockRejectedValue(new Error('Extension context invalidated'));
    cleanup = connectPageLanguage();
    await settle();
    expect(getLanguagePreference()).toBe('zh-CN');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('can refresh on user focus after a transient port rejection without automatically retrying', async () => {
    send.mockRejectedValueOnce(
      new Error('The message port closed before a response was received.'),
    );
    cleanup = connectPageLanguage();
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(getLanguagePreference()).toBe('zh-CN');
    expect(listeners.size).toBe(1);
    send.mockResolvedValue({ ok: true, preference: 'ja' });
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(getLanguagePreference()).toBe('ja');
  });

  it('handles synchronous send failures without throwing or retrying on later events', async () => {
    send.mockImplementation(() => {
      throw new Error('Extension context invalidated');
    });
    expect(() => {
      cleanup = connectPageLanguage();
    }).not.toThrow();
    const listener = [...listeners][0]!;
    await settle();
    expect(getLanguagePreference()).toBe('zh-CN');
    expect(send).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    listener({ type: 'language:changed' }, { id: extensionId });
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it('stays inactive when startup listener registration throws, even after partial registration', async () => {
    const addListener = vi.mocked(chrome.runtime.onMessage.addListener);
    let retained!: Listener;
    addListener.mockImplementation((listener) => {
      retained = listener as Listener;
      listeners.add(retained);
      throw new Error('Extension context invalidated');
    });
    expect(() => {
      cleanup = connectPageLanguage();
    }).not.toThrow();
    window.dispatchEvent(new Event('focus'));
    retained({ type: 'language:changed' }, { id: extensionId });
    await settle();
    expect(send).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    expect(getLanguagePreference()).toBe('zh-CN');
  });

  it('detaches focus and ignores late callbacks when Chrome throws during listener removal', async () => {
    const response = deferred();
    send.mockReturnValueOnce(response.promise);
    cleanup = connectPageLanguage();
    const retained = [...listeners][0]!;
    removeListener.mockImplementation(() => {
      throw new Error('Extension context invalidated');
    });
    const removeFocus = vi.spyOn(window, 'removeEventListener');
    expect(() => cleanup?.()).not.toThrow();
    expect(removeFocus).toHaveBeenCalledWith('focus', expect.any(Function));
    window.dispatchEvent(new Event('focus'));
    retained({ type: 'language:changed' }, { id: extensionId });
    response.resolve({ ok: true, preference: 'ko' });
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(getLanguagePreference()).toBe('zh-CN');
    expect(() => cleanup?.()).not.toThrow();
  });

  it('never registers or sends with an absent extension runtime ID', async () => {
    const addListener = vi.mocked(chrome.runtime.onMessage.addListener);
    Object.defineProperty(chrome.runtime, 'id', { value: undefined, configurable: true });
    expect(() => {
      cleanup = connectPageLanguage();
    }).not.toThrow();
    window.dispatchEvent(new Event('focus'));
    notify({ type: 'language:changed' });
    await settle();
    expect(addListener).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(getLanguagePreference()).toBe('zh-CN');
  });

  it('does not send after the runtime ID disappears while the page remains open', async () => {
    cleanup = connectPageLanguage();
    await settle();
    expect(getLanguagePreference()).toBe('en');
    Object.defineProperty(chrome.runtime, 'id', { value: undefined, configurable: true });
    window.dispatchEvent(new Event('focus'));
    await settle();
    window.dispatchEvent(new Event('focus'));
    notify({ type: 'language:changed' });
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(getLanguagePreference()).toBe('en');
    expect(listeners.size).toBe(0);
  });
});
