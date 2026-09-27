import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  clearApiKey,
  getApiKey,
  saveApiKey,
  setAutoAnalyze,
  getPagePreferences,
  getAnalysisProvider,
  dispatchAuthorizedAnalysis,
  AnalysisAuthorizationError,
} from '../src/storage/settings';

let local: Record<string, unknown>;
let session: Record<string, unknown>;
beforeEach(() => {
  local = { analysisProvider: 'jev', jevKey: 'previous-test-key', jevConsent: true };
  session = {};
  const area = (values: Record<string, unknown>) => ({
    get: vi.fn(async () => ({ ...values })),
    set: vi.fn(async (change: Record<string, unknown>) => Object.assign(values, change)),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    }),
    setAccessLevel: vi.fn(async () => undefined),
  });
  vi.stubGlobal('chrome', {
    storage: { local: area(local), session: area(session) },
    permissions: { contains: vi.fn(async () => true) },
  });
  // Extension windows share a LockManager even when their module instances differ.
  const queues = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, callback: () => Promise<unknown>) => {
    const result = (queues.get(name) ?? Promise.resolve()).then(callback);
    queues.set(
      name,
      result.catch(() => undefined),
    );
    return result;
  });
  vi.stubGlobal(
    'navigator',
    Object.defineProperty(Object.create(navigator), 'locks', { value: { request } }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Let another window's unblocked storage work settle while the first operation is paused.
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

it.each(['test key', 'test\tkey', 'test\u0000key', 'test密钥', 'test\nkey', ' ', 'x'.repeat(513)])(
  'rejects a malformed key without destroying the previous credential: %#',
  async (key) => {
    await expect(saveApiKey(key, false, true)).rejects.toThrow();
    expect(await getApiKey()).toBe('previous-test-key');
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(chrome.storage.session.remove).not.toHaveBeenCalled();
    expect(local.jevConsent).toBe(true);
  },
);

it('trims a valid header key and stores it only in the selected area', async () => {
  await saveApiKey(' new-test-key ', false, true);
  expect(await getApiKey()).toBe('new-test-key');
  expect(local.jevKey).toBeUndefined();
  expect(session.jevKey).toBe('new-test-key');
});

it.each([false, true])(
  'keeps the previous key if replacement storage fails (remember=%s)',
  async (remember) => {
    if (remember) {
      delete local.jevKey;
      session.jevKey = 'previous-test-key';
    }
    vi.mocked((remember ? chrome.storage.local : chrome.storage.session).set).mockRejectedValueOnce(
      new Error('Synthetic write failure'),
    );
    await expect(saveApiKey('new-test-key', remember, true)).rejects.toThrow(
      'Synthetic write failure',
    );
    expect(await getApiKey()).toBe('previous-test-key');
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(chrome.storage.session.remove).not.toHaveBeenCalled();
  },
);

it('replaces a session key with a remembered key without leaving a stale session override', async () => {
  session.jevKey = 'previous-session-key';
  await saveApiKey('new-test-key', true, true);
  expect(await getApiKey()).toBe('new-test-key');
  expect(local.jevKey).toBe('new-test-key');
  expect(session.jevKey).toBeUndefined();
});

it('serializes remembered and session-only saves from separate settings windows', async () => {
  vi.resetModules();
  const otherWindow = await import('../src/storage/settings');
  const started = deferred();
  const resume = deferred();
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(async (change) => {
    Object.assign(local, change);
    started.resolve();
    await resume.promise;
  });
  const first = saveApiKey('remembered-test-key', true, true);
  await started.promise;
  const second = otherWindow.saveApiKey('session-test-key', false, true);
  await nextTurn();
  resume.resolve();
  await Promise.all([first, second]);
  expect(await getApiKey()).toBe('session-test-key');
  expect(local.jevKey).toBeUndefined();
  expect(session.jevKey).toBe('session-test-key');
  expect(local.jevConsent).toBe(true);
});

it('does not recreate a key after another window clears an earlier in-flight save', async () => {
  vi.resetModules();
  const otherWindow = await import('../src/storage/settings');
  const started = deferred();
  const resume = deferred();
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(async (change) => {
    started.resolve();
    await resume.promise;
    Object.assign(local, change);
  });
  const save = saveApiKey('replacement-test-key', true, true);
  await started.promise;
  const clear = otherWindow.clearApiKey();
  await nextTurn();
  resume.resolve();
  await Promise.all([save, clear]);
  expect(await getApiKey()).toBeUndefined();
  expect(local.jevConsent).toBeUndefined();
});

it('does not restore auto-analysis after a concurrent key clear', async () => {
  vi.resetModules();
  const otherWindow = await import('../src/storage/settings');
  const started = deferred();
  const resume = deferred();
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(async (change) => {
    started.resolve();
    await resume.promise;
    Object.assign(local, change);
  });
  const enable = setAutoAnalyze(true);
  await started.promise;
  const clear = otherWindow.clearApiKey();
  await nextTurn();
  resume.resolve();
  await Promise.all([enable, clear]);
  expect(await getApiKey()).toBeUndefined();
  expect(local.autoAnalyze).toBeUndefined();
});

it('checks readiness after a pending key clear before enabling auto-analysis', async () => {
  vi.resetModules();
  const otherWindow = await import('../src/storage/settings');
  const started = deferred();
  const resume = deferred();
  vi.mocked(chrome.storage.session.remove).mockImplementationOnce(async () => {
    started.resolve();
    await resume.promise;
    delete session.jevKey;
  });
  const clear = clearApiKey();
  await started.promise;
  // Attach rejection handling before releasing the clear to avoid unhandled rejections.
  const enable = otherWindow.setAutoAnalyze(true).then(
    () => null,
    (error: unknown) => error,
  );
  await nextTurn();
  resume.resolve();
  await clear;
  expect(await enable).toBeInstanceOf(Error);
  expect(local.autoAnalyze).toBeUndefined();
});

it.each(['jev'] as const)(
  'keeps manual %s available after auto-off while blocking automatic dispatch',
  async (provider) => {
    local.analysisProvider = provider;
    local.autoAnalyze = true;
    await setAutoAnalyze(false, provider);
    const classify = vi.fn().mockResolvedValue('result');
    await expect(dispatchAuthorizedAnalysis(provider, true, classify)).rejects.toBeInstanceOf(
      AnalysisAuthorizationError,
    );
    expect(classify).not.toHaveBeenCalled();
    await expect(dispatchAuthorizedAnalysis(provider, false, classify)).resolves.toBe('result');
    expect(classify).toHaveBeenCalledOnce();
  },
);

it.each(['jev'] as const)(
  'blocks queued manual %s work after its credentials or consent are revoked',
  async (provider) => {
    local.analysisProvider = provider;
    const revoke = clearApiKey();
    const classify = vi.fn().mockResolvedValue('should not run');
    const pending = dispatchAuthorizedAnalysis(provider, false, classify);
    await revoke;
    await expect(pending).rejects.toThrow(new AnalysisAuthorizationError('consent').message);
    expect(classify).not.toHaveBeenCalled();
  },
);

it('releases the settings lock while a provider response is pending', async () => {
  const response = deferred();
  const classify = vi.fn(() => response.promise);
  const pending = dispatchAuthorizedAnalysis('jev', false, classify);
  await nextTurn();
  expect(classify).toHaveBeenCalledOnce();
  await setAutoAnalyze(false, 'jev');
  expect(local.autoAnalyze).toBe(false);
  response.resolve();
  await expect(pending).resolves.toBeUndefined();
});

it('observes immediate provider rejection while lock completion is delayed', async () => {
  vi.stubGlobal(
    'navigator',
    Object.defineProperty(Object.create(navigator), 'locks', {
      value: {
        request: async (_name: string, callback: () => Promise<unknown>) => {
          const result = await callback();
          await nextTurn();
          return result;
        },
      },
    }),
  );
  const failure = new Error('Synthetic provider rejection');
  await expect(
    dispatchAuthorizedAnalysis('jev', false, () => Promise.reject(failure)),
  ).rejects.toBe(failure);
});

it.each(['local', 'codex', 'qwen', 'invalid', undefined])(
  'migrates %s to JEV without carrying automatic paid-request authorization',
  async (previous) => {
    local.analysisProvider = previous;
    local.autoAnalyze = true;
    local.codexConsent = true;
    local.qwenEnabled = true;
    const dispatch = vi.fn(async () => 'result');
    await expect(dispatchAuthorizedAnalysis('jev', true, dispatch)).rejects.toBeInstanceOf(
      AnalysisAuthorizationError,
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(await getAnalysisProvider()).toBe('jev');
    expect(await getPagePreferences()).toEqual({
      provider: 'jev',
      autoAnalyze: false,
      ready: true,
    });
    expect(local.jevKey).toBe('previous-test-key');
    expect(local.jevConsent).toBe(true);
    expect(local.codexConsent).toBeUndefined();
    expect(local.qwenEnabled).toBeUndefined();
    await setAutoAnalyze(true, 'jev');
    await expect(dispatchAuthorizedAnalysis('jev', true, dispatch)).resolves.toBe('result');
  },
);

it('preserves an existing JEV automatic-analysis opt-in across repeated initialization', async () => {
  local.autoAnalyze = true;
  await Promise.all([getAnalysisProvider(), getPagePreferences(), getPagePreferences()]);
  expect(local.autoAnalyze).toBe(true);
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('requires a key, consent and API permission before enabling JEV automatic analysis', async () => {
  delete local.jevKey;
  expect(await getPagePreferences()).toEqual({ provider: 'jev', autoAnalyze: false, ready: false });
  await expect(setAutoAnalyze(true)).rejects.toThrow();
  local.jevKey = 'test-key';
  local.jevConsent = false;
  await expect(setAutoAnalyze(true)).rejects.toThrow();
  local.jevConsent = true;
  vi.stubGlobal('chrome', { ...chrome, permissions: { contains: vi.fn(async () => false) } });
  await expect(setAutoAnalyze(true)).rejects.toThrow();
  expect(local.autoAnalyze).not.toBe(true);
});
