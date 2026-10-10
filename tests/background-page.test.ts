import { sampleJob } from './fixtures/job';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageSender } from '../src/core/page-messages';
import { applyLanguagePreference } from '../src/i18n/preference';
import { t } from '../src/i18n';

const mocks = vi.hoisted(() => ({
  localAnalysis: vi.fn(),
  restrict: vi.fn(),
  removeRetired: vi.fn(),
  employers: vi.fn(),
  employerCache: vi.fn(),
  refreshSnapshot: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock('../src/core/local-analysis', () => ({ localAnalysis: mocks.localAnalysis }));
vi.mock('../src/storage/access', () => ({ restrictStorageAccess: mocks.restrict }));
vi.mock('../src/storage/retired-data', () => ({ removeRetiredData: mocks.removeRetired }));
vi.mock('../src/employers', () => ({
  checkEmployers: mocks.employers,
  getEmployerCacheStatus: mocks.employerCache,
}));
vi.mock('../src/employers/schedule', () => ({
  startEmployerSnapshotSchedule: mocks.schedule,
}));
vi.mock('wxt/utils/define-background', () => ({ defineBackground: (main: () => void) => main }));
vi.mock('../src/i18n/background', () => ({
  startBackgroundLanguage: () => ({ ready: Promise.resolve(), dispose: () => {} }),
}));
import background from '../entrypoints/background';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const requestId = '118a5967-d0b1-42c2-bf6b-0cc001f02a14';
const sender: PageSender = {
  id: extensionId,
  url: 'https://nz.seek.com/jobs',
  origin: 'https://nz.seek.com',
  frameId: 0,
  tab: { id: 10 },
  documentId: 'same-spa-document',
};
const settingsSender = {
  id: extensionId,
  url: `chrome-extension://${extensionId}/sidepanel.html`,
};
const currentTab = { id: 10, url: 'https://nz.seek.com/jobs?jobId=12340004' };
const local = { type: 'page:local', title: sampleJob.title, body: sampleJob.body };
const reading = {
  visa: { sponsorship: { choice: 'not_mentioned', evidence: [] } },
  prep: { entries: [] },
};
type Listener = (
  input: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
) => boolean;
let listener: Listener;
let getTab: ReturnType<typeof vi.fn>;
let createTab: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;
function send(input: unknown, from: PageSender = sender) {
  const response = vi.fn();
  const asynchronous = listener(input, from as chrome.runtime.MessageSender, response);
  return { response, asynchronous };
}

beforeEach(() => {
  mocks.localAnalysis.mockReset().mockReturnValue(reading);
  mocks.restrict.mockReset().mockResolvedValue(undefined);
  mocks.removeRetired.mockReset().mockResolvedValue(undefined);
  mocks.employers.mockReset().mockResolvedValue([]);
  mocks.employerCache.mockReset().mockResolvedValue({ recordCount: 0 });
  mocks.refreshSnapshot.mockReset().mockResolvedValue({ recordCount: 2 });
  mocks.schedule.mockReset().mockReturnValue({ refresh: mocks.refreshSnapshot, dispose: vi.fn() });
  getTab = vi.fn().mockResolvedValue(currentTab);
  createTab = vi.fn().mockResolvedValue({ id: 11 });
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
      create: createTab,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    permissions: { contains: vi.fn().mockResolvedValue(true), request: requestPermission },
  });
  (background as unknown as () => void)();
});
afterEach(() => vi.unstubAllGlobals());

describe('worker start', () => {
  it('restricts storage to trusted contexts and removes retired AI data once per start', () => {
    expect(mocks.restrict).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.removeRetired).toHaveBeenCalledExactlyOnceWith();
  });

  it('keeps routing messages when retired-data cleanup fails', async () => {
    mocks.removeRetired.mockReset().mockRejectedValue(new Error('IndexedDB unavailable'));
    (background as unknown as () => void)();
    await Promise.resolve();
    const call = send({ type: 'page:language' });
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: true })),
    );
  });
});

describe('full employer list refresh boundary', () => {
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
    expect(call.response.mock.calls[0]![0]).toEqual({ ok: false, error: t('settings.tryAgain') });
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

describe('on-device page reading across SEEK SPA navigation', () => {
  it('passes exact two-letter company names through the page message boundary', async () => {
    const call = send({ type: 'page:employers', names: ['QX'] });
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: true })),
    );
    expect(mocks.employers).toHaveBeenCalledExactlyOnceWith(['QX']);
    expect(send({ type: 'page:employers', names: ['Q'] }).response).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
  });

  it('answers page:local with only the on-device reading', async () => {
    const call = send(local);
    expect(call.asynchronous).toBe(true);
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledExactlyOnceWith({ ok: true, reading }),
    );
    expect(mocks.localAnalysis).toHaveBeenCalledExactlyOnceWith(sampleJob.title, sampleJob.body);
    expect(mocks.employers).not.toHaveBeenCalled();
    expect(createTab).not.toHaveBeenCalled();
  });

  it('validates page:local title and body before computing anything', () => {
    for (const input of [
      { type: 'page:local', title: 'Nurse', body: 'short' },
      { type: 'page:local', title: 'N', body: sampleJob.body },
      { type: 'page:local', title: sampleJob.title, body: 'a'.repeat(24001) },
      { type: 'page:local', title: sampleJob.title },
    ]) {
      const call = send(input);
      expect(call.asynchronous).toBe(false);
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    }
    expect(getTab).not.toHaveBeenCalled();
    expect(mocks.localAnalysis).not.toHaveBeenCalled();
  });

  it('returns an error instead of a reading when the local rules throw', async () => {
    mocks.localAnalysis.mockImplementation(() => {
      throw new Error('rules failed');
    });
    const call = send(local);
    await vi.waitFor(() => expect(call.response).toHaveBeenCalled());
    expect(call.response.mock.calls[0]![0]).toMatchObject({ ok: false });
    expect(call.response.mock.calls[0]![0]).not.toHaveProperty('reading');
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
    expect(mocks.employers).toHaveBeenCalledExactlyOnceWith(['Acme Limited']);
    const forced = send({ type: 'page:employers', names: ['Acme Limited'], force: true });
    expect(forced.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(mocks.employers).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSnapshot).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('reports a localised list error instead of an internal employer lookup failure', async () => {
    mocks.employers.mockRejectedValue(new Error('IndexedDB private path'));
    const call = send({ type: 'page:employers', names: ['Acme Limited'] });
    await vi.waitFor(() => expect(call.response).toHaveBeenCalled());
    expect(call.response.mock.calls[0]![0]).toEqual({ ok: false, error: t('page.listReadError') });
  });

  it('fails closed when Chrome does not expose the current tab URL', async () => {
    getTab.mockResolvedValue({ id: 10 });
    const call = send(local);
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(mocks.localAnalysis).not.toHaveBeenCalled();
  });

  it.each(['profile', 'saved-jobs', 'my-jobs', 'recommended-jobs', 'apply'])(
    'rejects reading and list checks on the private /%s surface',
    async (path) => {
      getTab.mockResolvedValue({
        id: 10,
        url: `https://nz.seek.com/${path}?selectedjob=12340004`,
      });
      const reading = send(local);
      const list = send({ type: 'page:employers', names: ['Acme Limited'] });
      await vi.waitFor(() => {
        expect(reading.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
        expect(list.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
      });
      expect(mocks.localAnalysis).not.toHaveBeenCalled();
      expect(mocks.employers).not.toHaveBeenCalled();
    },
  );

  it('uses the current tab identity when sender.url is still the initial search page', async () => {
    const call = send(local);
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: true })),
    );
    expect(getTab).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('does not use a valid current tab URL to bypass invalid original sender metadata', async () => {
    for (const invalid of [
      { ...sender, origin: 'https://evil.example' },
      { ...sender, url: 'https://evil.example/jobs' },
      { ...sender, frameId: 1 },
      { ...sender, id: undefined },
    ]) {
      const call = send(local, invalid);
      expect(call.asynchronous).toBe(false);
      expect(call.response).not.toHaveBeenCalled();
    }
    expect(getTab).not.toHaveBeenCalled();
    expect(mocks.localAnalysis).not.toHaveBeenCalled();

    getTab.mockResolvedValue({ ...currentTab, url: 'https://evil.example/jobs?jobId=12340004' });
    const changedOrigin = send(local);
    await vi.waitFor(() =>
      expect(changedOrigin.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(mocks.localAnalysis).not.toHaveBeenCalled();
  });
});

describe('internal errors', () => {
  it('keeps tab lookup errors inside the worker', async () => {
    getTab.mockRejectedValueOnce(new Error('No tab with id: 10'));
    const reading = send(local);
    await vi.waitFor(() =>
      expect(reading.response).toHaveBeenCalledWith({
        ok: false,
        error: t('errors.requestFailed'),
      }),
    );
  });
});

describe('settings link', () => {
  it('opens only the packaged settings page and refuses an arbitrary URL or section', async () => {
    const call = send({ type: 'page:open-settings' });
    expect(call.asynchronous).toBe(true);
    await vi.waitFor(() => expect(call.response).toHaveBeenCalledWith({ ok: true }));
    expect(createTab).toHaveBeenCalledExactlyOnceWith({
      url: `chrome-extension://${extensionId}/sidepanel.html`,
    });
    for (const input of [
      { type: 'page:open-settings', url: 'https://evil.example/' },
      { type: 'page:open-settings', section: 'settings' },
    ])
      expect(send(input).response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(createTab).toHaveBeenCalledTimes(1);
  });

  it('brings an open settings tab forward instead of opening another', async () => {
    const getContexts = vi.fn().mockResolvedValue([{ tabId: 7, windowId: 3 }]);
    const updateTab = vi.fn().mockResolvedValue({});
    const updateWindow = vi.fn().mockResolvedValue({});
    Object.assign(chrome.runtime, { getContexts });
    Object.assign(chrome.tabs, { update: updateTab });
    Object.assign(chrome, { windows: { update: updateWindow } });
    const call = send({ type: 'page:open-settings' });
    await vi.waitFor(() => expect(call.response).toHaveBeenCalledWith({ ok: true }));
    expect(getContexts).toHaveBeenCalledWith({
      contextTypes: ['TAB', 'SIDE_PANEL'],
      documentUrls: [`chrome-extension://${extensionId}/sidepanel.html`],
    });
    expect(updateTab).toHaveBeenCalledExactlyOnceWith(7, { active: true });
    expect(updateWindow).toHaveBeenCalledExactlyOnceWith(3, { focused: true });
    expect(createTab).not.toHaveBeenCalled();
  });

  it('reports a failure to open settings', async () => {
    createTab.mockRejectedValue(new Error('Tabs unavailable'));
    const call = send({ type: 'page:open-settings' });
    await vi.waitFor(() =>
      expect(call.response).toHaveBeenCalledWith({ ok: false, error: t('errors.settingsOpen') }),
    );
  });
});

describe('removed AI analysis messages', () => {
  const draft = { ...sampleJob, sourceUrl: 'https://nz.seek.com/job/12340004' };
  it.each([
    { type: 'page:analyze', requestId, draft, mode: 'jev', surface: 'page' },
    { type: 'page:analyze', requestId, draft, mode: 'jev', surface: 'page', automatic: true },
    { type: 'page:cancel', requestId },
    { type: 'page:auto', enabled: true },
    { type: 'page:auto', enabled: true, provider: 'jev' },
    { type: 'page:preferences' },
    { type: 'page:analysis-retry', requestId, attempt: 1 },
    { type: 'page:employers', names: ['Acme Limited'], refresh: true },
    { type: 'page:employers', names: ['Acme Limited'], jevKey: 'private-test-key' },
    { ...local, sourceUrl: draft.sourceUrl },
    { ...local, employer: draft.employer },
    { ...local, apiKey: 'private-test-key' },
    { type: 'page:sample-save', draft },
    { type: 'page:sample-status', sourceUrl: draft.sourceUrl },
    { type: 'export-library' },
    { type: 'read-key' },
  ])('rejects %j before any lookup or computation', (input) => {
    const call = send(input);
    expect(call.asynchronous).toBe(false);
    expect(call.response).toHaveBeenCalledExactlyOnceWith({
      ok: false,
      error: t('errors.requestInvalid'),
    });
    expect(getTab).not.toHaveBeenCalled();
    expect(mocks.localAnalysis).not.toHaveBeenCalled();
    expect(mocks.employers).not.toHaveBeenCalled();
    expect(createTab).not.toHaveBeenCalled();
  });

  it('rejects retired workspace analysis/cancel messages from trusted extension pages', () => {
    for (const input of [
      { type: 'analyze', requestId, draft, mode: 'jev' },
      { type: 'cancel', requestId },
      { type: 'page:local', title: sampleJob.title, body: sampleJob.body },
    ]) {
      const call = send(input, { ...settingsSender, tab: { id: 99 } });
      expect(call.asynchronous).toBe(false);
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    }
    expect(mocks.localAnalysis).not.toHaveBeenCalled();
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
      expect(mocks.localAnalysis).not.toHaveBeenCalled();
      expect(mocks.employers).not.toHaveBeenCalled();
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
  });
});

describe('removed resume functionality', () => {
  it.each(['page:resume-status', 'page:resume-match', 'resume:status', 'resume:match'])(
    'rejects retired %s messages',
    (type) => {
      const input = type.endsWith('status')
        ? { type }
        : {
            type,
            requestId,
            draft: sampleJob,
            consent: true,
            ...(type.startsWith('page:') ? { surface: 'page' } : {}),
          };
      const from: PageSender = type.startsWith('page:') ? sender : settingsSender;
      const call = send(input, from);
      expect(call.asynchronous).toBe(false);
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
      expect(getTab).not.toHaveBeenCalled();
      expect(mocks.localAnalysis).not.toHaveBeenCalled();
    },
  );
});
