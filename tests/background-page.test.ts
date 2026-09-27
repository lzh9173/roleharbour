import { emptyDraft } from './fixtures/job';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageAnalysisMessage, PageSender } from '../src/core/page-messages';
import { applyLanguagePreference } from '../src/i18n/preference';
import { t } from '../src/i18n';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  restrict: vi.fn(),
  listJobs: vi.fn(),
  preferences: vi.fn(),
  setAuto: vi.fn(),
  employers: vi.fn(),
  employerCache: vi.fn(),
  refreshSnapshot: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock('../src/core/analyze', () => ({ analyze: mocks.analyze }));
vi.mock('../src/storage/settings', () => ({
  restrictKeyAccess: mocks.restrict,
  getPagePreferences: mocks.preferences,
  setAutoAnalyze: mocks.setAuto,
}));
vi.mock('../src/employers', () => ({
  checkEmployers: mocks.employers,
  getEmployerCacheStatus: mocks.employerCache,
}));
vi.mock('../src/employers/schedule', () => ({
  startEmployerSnapshotSchedule: mocks.schedule,
}));
vi.mock('../src/storage/db', () => ({ listJobs: mocks.listJobs }));
vi.mock('wxt/utils/define-background', () => ({ defineBackground: (main: () => void) => main }));
vi.mock('../src/i18n/background', () => ({
  startBackgroundLanguage: () => ({ ready: Promise.resolve(), dispose: () => {} }),
}));
import background from '../entrypoints/background';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const firstId = '118a5967-d0b1-42c2-bf6b-0cc001f02a14';
const secondId = 'df4d4520-7644-45e4-af56-27effa8195ad';
const sender: PageSender = {
  id: extensionId,
  url: 'https://nz.seek.com/jobs',
  origin: 'https://nz.seek.com',
  frameId: 0,
  tab: { id: 10 },
  documentId: 'same-spa-document',
};
const currentTab = { id: 10, url: 'https://nz.seek.com/jobs?jobId=12340004' };
const message: PageAnalysisMessage = {
  type: 'page:analyze',
  requestId: firstId,
  surface: 'page',
  mode: 'jev',
  draft: {
    ...emptyDraft,
    title: 'Systems Administrator',
    body: 'Maintain production Linux systems and automate deployment processes for internal teams.',
    sourceUrl: 'https://nz.seek.com/job/12340004',
  },
};
type Listener = (
  input: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
) => boolean;
let listener: Listener;
let getTab: ReturnType<typeof vi.fn>;
let containsPermission: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;
function send(input: unknown, from: PageSender = sender) {
  const response = vi.fn();
  const asynchronous = listener(input, from as chrome.runtime.MessageSender, response);
  return { response, asynchronous };
}

beforeEach(() => {
  mocks.analyze.mockReset().mockResolvedValue({ ok: true, job: { id: 'local-result' } });
  mocks.restrict.mockReset().mockResolvedValue(undefined);
  mocks.listJobs.mockReset().mockResolvedValue([]);
  mocks.preferences.mockReset().mockResolvedValue({ autoAnalyze: false, ready: true });
  mocks.setAuto.mockReset().mockResolvedValue({ autoAnalyze: true, ready: true });
  mocks.employers.mockReset().mockResolvedValue([]);
  mocks.employerCache.mockReset().mockResolvedValue({ recordCount: 0 });
  mocks.refreshSnapshot.mockReset().mockResolvedValue({ recordCount: 2 });
  mocks.schedule.mockReset().mockReturnValue({ refresh: mocks.refreshSnapshot, dispose: vi.fn() });
  getTab = vi.fn().mockResolvedValue(currentTab);
  containsPermission = vi.fn().mockResolvedValue(true);
  requestPermission = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      id: extensionId,
      getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
      onInstalled: { addListener: vi.fn() },
      onMessage: {
        addListener: (callback: Listener) => {
          listener = callback;
        },
      },
    },
    sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
    tabs: {
      get: getTab,
      create: vi.fn().mockResolvedValue({ id: 11 }),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    permissions: { contains: containsPermission, request: requestPermission },
  });
  (background as unknown as () => void)();
});
afterEach(() => vi.unstubAllGlobals());

it('sends retry progress only to the requesting document and tolerates a closed tab', async () => {
  vi.mocked(chrome.tabs.sendMessage).mockRejectedValue(new Error('Tab closed'));
  mocks.analyze.mockImplementation(async (_id, _draft, _mode, _signal, options) => {
    options.onRetry(1);
    return { ok: true };
  });
  const call = send(message);
  await vi.waitFor(() => expect(call.response).toHaveBeenCalledWith({ ok: true }));
  expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
    10,
    {
      type: 'page:analysis-retry',
      requestId: firstId,
      attempt: 1,
    },
    { documentId: sender.documentId },
  );
});

describe('full employer list refresh boundary', () => {
  const settingsSender = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/sidepanel.html#settings`,
  };

  it('routes only a trusted settings request through the shared update schedule', async () => {
    const call = send({ type: 'employers:refresh' }, settingsSender);
    expect(call.asynchronous).toBe(true);
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith({ ok: true, cache: { recordCount: 2 } }),
    );
    expect(mocks.refreshSnapshot).toHaveBeenCalledExactlyOnceWith();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('rejects page-triggered refreshes, retired queries and arbitrary download URLs', () => {
    for (const input of [
      { type: 'employers:refresh' },
      { type: 'page:employer-online', name: 'Synthetic Employer' },
      { type: 'page:employer-cache', name: 'Synthetic Employer' },
    ])
      expect(send(input).response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(
      send({ type: 'employers:refresh', url: 'https://evil.example/' }, settingsSender).response,
    ).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(mocks.refreshSnapshot).not.toHaveBeenCalled();
  });

  it('returns a safe error when the worker cannot read the local list', async () => {
    mocks.refreshSnapshot.mockRejectedValue(new Error('private storage path'));
    const call = send({ type: 'employers:refresh' }, settingsSender);
    await vi.waitFor(() => expect(call.response).toHaveBeenCalled());
    expect(call.response.mock.calls[0]![0]).toEqual({ ok: false, error: t('page.listReadError') });
  });

  it('broadcasts only an invalidation to extension views and supported public SEEK pages', async () => {
    const sendView = vi.fn().mockRejectedValue(new Error('No extension view open'));
    const sendTab = vi.fn().mockResolvedValue(undefined);
    Object.assign(chrome.runtime, { sendMessage: sendView });
    Object.assign(chrome.tabs, {
      sendMessage: sendTab,
      query: vi.fn().mockResolvedValue([
        { id: 10, url: 'https://nz.seek.com/jobs' },
        { id: 11, url: 'https://www.seek.co.nz/job/123' },
        { id: 12, url: 'https://nz.seek.com/profile' },
        { id: 13, url: 'https://evil.example/jobs' },
      ]),
    });
    await mocks.schedule.mock.calls[0]![0].onUpdated({ recordCount: 123 });
    expect(sendView).toHaveBeenCalledWith({ type: 'employers:updated' });
    expect(sendTab.mock.calls).toEqual([
      [10, { type: 'employers:updated' }, { frameId: 0 }],
      [11, { type: 'employers:updated' }, { frameId: 0 }],
    ]);
  });
});

describe('background analysis across SEEK SPA navigation', () => {
  it('passes exact two-letter company names through the page message boundary', async () => {
    const call = send({ type: 'page:employers', names: ['QX'] });
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: true })),
    );
    expect(mocks.employers).toHaveBeenCalledExactlyOnceWith(['QX'], { refresh: false });
    expect(send({ type: 'page:employers', names: ['Q'] }).response).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
  });

  it('routes page employer checks to local data and rejects forced remote refreshes', async () => {
    const normal = send({ type: 'page:employers', names: ['Acme Limited'] });
    await vi.waitFor(() =>
      expect(normal.response).toHaveBeenCalledWith({
        ok: true,
        employers: [],
        cache: { recordCount: 0 },
      }),
    );
    expect(mocks.employers).toHaveBeenCalledExactlyOnceWith(['Acme Limited'], { refresh: false });
    const forced = send({ type: 'page:employers', names: ['Acme Limited'], force: true });
    expect(forced.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(mocks.employers).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSnapshot).not.toHaveBeenCalled();
    expect(containsPermission).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('fails closed when Chrome does not expose the current tab URL', async () => {
    getTab.mockResolvedValue({ id: 10 });
    const call = send(message);
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it.each(['profile', 'saved-jobs', 'my-jobs', 'recommended-jobs', 'apply'])(
    'rejects a matching job identity on the private /%s surface',
    async (path) => {
      getTab.mockResolvedValue({
        id: 10,
        url: `https://nz.seek.com/${path}?selectedjob=12340004`,
      });
      const call = send(message);
      await vi.waitFor(() =>
        expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
      );
      expect(mocks.analyze).not.toHaveBeenCalled();
    },
  );

  it('uses the current tab identity when sender.url is still the initial search page', async () => {
    const call = send(message);
    expect(call.asynchronous).toBe(true);
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith({ ok: true, job: { id: 'local-result' } }),
    );
    expect(getTab).toHaveBeenCalledWith(10);
    expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(
      firstId,
      message.draft,
      'jev',
      expect.any(AbortSignal),
      { automatic: undefined, force: undefined, onRetry: expect.any(Function) },
    );
  });

  it('does not use a valid current tab URL to bypass invalid original sender metadata', async () => {
    for (const invalid of [
      { ...sender, origin: 'https://evil.example' },
      { ...sender, url: 'https://evil.example/jobs' },
      { ...sender, frameId: 1 },
    ]) {
      expect(send(message, invalid).asynchronous).toBe(false);
    }
    expect(getTab).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();

    getTab.mockResolvedValue({ ...currentTab, url: 'https://evil.example/jobs?jobId=12340004' });
    const changedOrigin = send(message);
    await vi.waitFor(() =>
      expect(changedOrigin.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('cancels a reserved request while current tab validation is pending and then releases its slot', async () => {
    let resolveTab!: (value: typeof currentTab) => void;
    getTab.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTab = resolve;
        }),
    );
    const call = send(message);
    expect(call.asynchronous).toBe(true);
    expect(mocks.analyze).not.toHaveBeenCalled();
    const cancel = send({ type: 'page:cancel', requestId: firstId });
    expect(cancel.response).toHaveBeenCalledWith({ ok: true });
    resolveTab(currentTab);
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(mocks.analyze).not.toHaveBeenCalled();

    const retry = send({ ...message, requestId: secondId });
    await vi.waitFor(() =>
      expect(retry.response).toHaveBeenCalledWith(expect.objectContaining({ ok: true })),
    );
    expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(
      secondId,
      message.draft,
      'jev',
      expect.any(AbortSignal),
      { automatic: undefined, force: undefined, onRetry: expect.any(Function) },
    );
  });

  it('reserves one tab slot before awaiting URL lookup and refuses cross-tab cancellation', async () => {
    let resolveTab!: (value: typeof currentTab) => void;
    getTab.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTab = resolve;
        }),
    );
    const first = send(message);
    const duplicate = send({ ...message, requestId: secondId });
    expect(duplicate.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(getTab).toHaveBeenCalledTimes(1);
    const foreignCancel = send(
      { type: 'page:cancel', requestId: firstId },
      { ...sender, tab: { id: 99 } },
    );
    expect(foreignCancel.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    resolveTab(currentTab);
    await vi.waitFor(() =>
      expect(first.response).toHaveBeenCalledWith(expect.objectContaining({ ok: true })),
    );
    expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(
      firstId,
      message.draft,
      'jev',
      expect.any(AbortSignal),
      { automatic: undefined, force: undefined, onRetry: expect.any(Function) },
    );
    expect((mocks.analyze.mock.calls[0]![3] as AbortSignal).aborted).toBe(false);
  });
});

describe('page automatic analysis preference boundary', () => {
  it('does not create an automatic task when the saved preference is on but API access is no longer ready', async () => {
    mocks.preferences.mockResolvedValue({ provider: 'jev', autoAnalyze: true, ready: false });
    const call = send({ ...message, mode: 'jev', automatic: true });
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('refuses automatic analysis until enabled and then passes the flag to the orchestrator', async () => {
    const automatic = { ...message, mode: 'jev', automatic: true };
    const disabled = send(automatic);
    await vi.waitFor(() =>
      expect(disabled.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(mocks.analyze).not.toHaveBeenCalled();

    mocks.preferences.mockResolvedValue({ provider: 'jev', autoAnalyze: true, ready: true });
    const enabled = send({ ...automatic, requestId: secondId });
    await vi.waitFor(() =>
      expect(enabled.response).toHaveBeenCalledWith(expect.objectContaining({ ok: true })),
    );
    expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(
      secondId,
      message.draft,
      'jev',
      expect.any(AbortSignal),
      { automatic: true, force: undefined, onRetry: expect.any(Function) },
    );
  });

  it('returns only preferences and refuses preference changes after navigating to a private surface', async () => {
    const view = send({ type: 'page:preferences' });
    await vi.waitFor(() =>
      expect(view.response).toHaveBeenCalledWith({
        ok: true,
        preferences: { autoAnalyze: false, ready: true },
      }),
    );
    const enable = send({ type: 'page:auto', enabled: true });
    await vi.waitFor(() =>
      expect(enable.response).toHaveBeenCalledWith({
        ok: true,
        preferences: { autoAnalyze: true, ready: true },
      }),
    );
    expect(mocks.setAuto).toHaveBeenCalledExactlyOnceWith(true, 'jev');

    getTab.mockResolvedValue({ id: 10, url: 'https://nz.seek.com/profile' });
    const blocked = send({ type: 'page:auto', enabled: true });
    await vi.waitFor(() =>
      expect(blocked.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(mocks.setAuto).toHaveBeenCalledTimes(1);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});

describe('page language preference boundary', () => {
  it.each(['auto', 'zh-CN', 'en', 'zh-TW', 'ja', 'ko'] as const)(
    'projects only the allowlisted %s preference to the current public page',
    async (preference) => {
      applyLanguagePreference(preference);
      const call = send({ type: 'page:language' });
      expect(call.asynchronous).toBe(true);
      await vi.waitFor(() =>
        expect(call.response).toHaveBeenCalledExactlyOnceWith({ ok: true, preference }),
      );
      expect(getTab).toHaveBeenCalledExactlyOnceWith(10);
      expect(mocks.preferences).not.toHaveBeenCalled();
      expect(mocks.listJobs).not.toHaveBeenCalled();
      expect(mocks.analyze).not.toHaveBeenCalled();
    },
  );

  it.each([
    { preference: 'en' },
    { key: 'test-secret' },
    { jevKey: 'test-secret' },
    { apiKey: 'test-secret' },
    { locale: 'ja' },
    { sourceUrl: 'https://nz.seek.com/' },
  ])('rejects extra page:language fields before lookup %#', (extra) => {
    const call = send({ type: 'page:language', ...extra });
    expect(call.asynchronous).toBe(false);
    expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(getTab).not.toHaveBeenCalled();
  });

  it.each([
    { ...sender, url: 'https://evil.example/jobs', origin: 'https://evil.example' },
    { ...sender, id: 'another-extension' },
    { ...sender, frameId: 1 },
  ])('does not grant a language response to an untrusted sender %#', (from) => {
    const call = send({ type: 'page:language' }, from);
    expect(call.asynchronous).toBe(false);
    expect(call.response).not.toHaveBeenCalled();
    expect(getTab).not.toHaveBeenCalled();
  });

  it.each([
    'https://nz.seek.com/profile',
    'https://nz.seek.com/my-jobs',
    'https://nz.seek.com/job/12340004/apply',
    'https://evil.example/jobs',
  ])('rejects a stale public sender after navigating to %s', async (url) => {
    getTab.mockResolvedValue({ id: 10, url });
    const call = send({ type: 'page:language' });
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(call.response.mock.calls[0]![0]).not.toHaveProperty('preference');
    expect(mocks.preferences).not.toHaveBeenCalled();
  });
});

describe('removed resume functionality', () => {
  it.each(['page:resume-status', 'page:resume-match', 'resume:status', 'resume:match'])(
    'rejects retired %s messages without dispatching analysis',
    (type) => {
      const input = type.endsWith('status')
        ? { type }
        : {
            type,
            requestId: firstId,
            draft: message.draft,
            consent: true,
            ...(type.startsWith('page:') ? { surface: 'page' } : {}),
          };
      const from: PageSender = type.startsWith('page:')
        ? sender
        : {
            id: extensionId,
            url: `chrome-extension://${extensionId}/sidepanel.html#settings`,
          };
      const call = send(input, from);
      expect(call.asynchronous).toBe(false);
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
      expect(getTab).not.toHaveBeenCalled();
      expect(mocks.analyze).not.toHaveBeenCalled();
    },
  );
});
