import { emptyDraft } from './fixtures/job';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSeekJobId,
  isSeekPublicSender,
  isSeekPageSender,
  pageMessageSchema,
  validateCurrentPageAnalysis,
  validatePageAnalysis,
  type PageAnalysisMessage,
  type PageSender,
} from '../src/core/page-messages';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const requestId = '118a5967-d0b1-42c2-bf6b-0cc001f02a14';
const nextRequestId = 'df4d4520-7644-45e4-af56-27effa8195ad';
const sender: PageSender = {
  id: extensionId,
  url: 'https://nz.seek.com/job/12345678',
  origin: 'https://nz.seek.com',
  frameId: 0,
  tab: { id: 10 },
  documentId: 'doc-a',
};
const message: PageAnalysisMessage = {
  type: 'page:analyze',
  requestId,
  mode: 'jev',
  surface: 'page',
  draft: {
    ...emptyDraft,
    title: 'Systems Administrator',
    body: 'Maintain production Linux systems and automate deployment processes for internal teams.',
    sourceUrl: 'https://nz.seek.com/job/12345678',
  },
};

describe('SEEK page message boundary', () => {
  it.each(['page:employer-online', 'page:employer-cache', 'employers:refresh'])(
    'rejects retired or privileged employer action %s from a content page',
    (type) => {
      expect(pageMessageSchema.safeParse({ type, name: 'Synthetic Employer' }).success).toBe(false);
      expect(pageMessageSchema.safeParse({ type }).success).toBe(false);
    },
  );

  it('accepts only the finite content message schemas', () => {
    expect(pageMessageSchema.safeParse(message).success).toBe(true);
    expect(pageMessageSchema.safeParse({ type: 'page:cancel', requestId }).success).toBe(true);
    expect(pageMessageSchema.safeParse({ type: 'page:open-workspace' }).success).toBe(true);
    expect(
      pageMessageSchema.safeParse({ type: 'page:open-workspace', section: 'settings' }).success,
    ).toBe(true);
    for (const invalid of [
      { ...message, apiKey: 'secret' },
      { ...message, surface: undefined },
      { ...message, draft: { ...message.draft, endpoint: 'https://evil.example/' } },
      { ...message, requestId: 'not-a-uuid' },
      { type: 'analyze', requestId, draft: message.draft, mode: 'jev' },
      { type: 'read-key' },
      { type: 'export-library' },
      { type: 'page:open-workspace', url: 'https://evil.example/' },
      { type: 'page:open-workspace', section: 'https://evil.example/' },
      { type: 'page:employers', names: ['Acme Limited'], force: true },
    ])
      expect(pageMessageSchema.safeParse(invalid).success).toBe(false);
  });

  it('requires the same extension, top frame, tab and exact allowed HTTPS hosts', () => {
    expect(isSeekPageSender(sender, extensionId)).toBe(true);
    expect(
      isSeekPageSender(
        { ...sender, url: 'https://www.seek.co.nz/job/12345678', origin: 'https://www.seek.co.nz' },
        extensionId,
      ),
    ).toBe(true);
    for (const invalid of [
      { ...sender, id: 'another-extension' },
      { ...sender, frameId: 1 },
      { ...sender, frameId: undefined },
      { ...sender, tab: undefined },
      { ...sender, tab: { id: -1 } },
      { ...sender, tab: { id: 0.5 } },
      { ...sender, url: 'http://nz.seek.com/job/12345678' },
      { ...sender, url: 'https://nz.seek.com.evil.example/job/12345678' },
      { ...sender, url: 'https://seek.com/job/12345678' },
      { ...sender, url: 'https://user@nz.seek.com/job/12345678' },
      { ...sender, url: 'https://nz.seek.com:444/job/12345678' },
      { ...sender, origin: 'null' },
      { ...sender, origin: 'https://evil.example' },
    ])
      expect(isSeekPageSender(invalid, extensionId)).toBe(false);
  });

  it('extracts an unambiguous job identity and rejects summary-only URLs', () => {
    expect(getSeekJobId('https://nz.seek.com/job/12345678?tracking=1')).toBe('12345678');
    expect(getSeekJobId('https://nz.seek.com/devops-jobs?selectedjob=12345678')).toBe('12345678');
    expect(getSeekJobId('https://nz.seek.com/job/12345678?selectedjob=12345678')).toBe('12345678');
    for (const url of [
      'https://nz.seek.com/devops-jobs',
      'https://nz.seek.com/',
      'https://nz.seek.com/devops-jobs?selectedjob=oops',
      'https://nz.seek.com/devops-jobs?selectedjob=12345678&selectedjob=12345678',
      'https://nz.seek.com/job/12345678?selectedjob=87654321',
      'https://evil.example/job/12345678',
    ])
      expect(getSeekJobId(url)).toBeNull();
  });

  it('requires canonical source and matching full-detail page identity', () => {
    expect(validatePageAnalysis(message, sender, extensionId)).toBe(true);
    expect(
      validatePageAnalysis(
        message,
        { ...sender, url: 'https://nz.seek.com/devops-jobs?selectedjob=12345678' },
        extensionId,
      ),
    ).toBe(true);
    expect(
      validatePageAnalysis(
        message,
        { ...sender, url: 'https://nz.seek.com/job/87654321' },
        extensionId,
      ),
    ).toBe(false);
    expect(
      validatePageAnalysis(
        message,
        { ...sender, url: 'https://nz.seek.com/devops-jobs' },
        extensionId,
      ),
    ).toBe(false);
    for (const sourceUrl of [
      '',
      'https://nz.seek.com/job/12345678/',
      'https://nz.seek.com/job/12345678?tracking=1',
      'https://nz.seek.com/job/12345678#fragment',
      'https://nz.seek.com/jobs?selectedjob=12345678',
      'https://evil.example/job/12345678',
      'https://nz.seek.com/job/87654321',
    ])
      expect(
        validatePageAnalysis(
          { ...message, draft: { ...message.draft, sourceUrl } },
          sender,
          extensionId,
        ),
      ).toBe(false);
  });

  it('accepts jobId search details only when every supplied identity agrees', () => {
    for (const url of [
      'https://nz.seek.com/jobs?jobId=12345678&type=promoted',
      'https://nz.seek.com/devops-jobs?selectedjob=12345678&jobId=12345678',
      'https://nz.seek.com/job/12345678?selectedjob=12345678&jobId=12345678',
    ]) {
      expect(getSeekJobId(url)).toBe('12345678');
      expect(validatePageAnalysis(message, { ...sender, url }, extensionId)).toBe(true);
    }
    for (const url of [
      'https://nz.seek.com/jobs?jobId=12345678&jobId=12345678',
      'https://nz.seek.com/jobs?jobId=12345678&jobId=87654321',
      'https://nz.seek.com/jobs?selectedjob=87654321&jobId=12345678',
      'https://nz.seek.com/job/87654321?jobId=12345678',
      'https://nz.seek.com/job/invalid?jobId=12345678',
      'https://nz.seek.com/jobs?jobId=',
      'https://nz.seek.com/jobs?jobId=123abc',
    ]) {
      expect(getSeekJobId(url)).toBeNull();
      expect(validatePageAnalysis(message, { ...sender, url }, extensionId)).toBe(false);
    }
  });

  it('validates the browser current tab URL against the authenticated original document origin', () => {
    const initial = { ...sender, url: 'https://nz.seek.com/jobs' };
    expect(
      validateCurrentPageAnalysis(
        message,
        initial,
        { id: 10, url: 'https://nz.seek.com/jobs?jobId=12345678' },
        extensionId,
      ),
    ).toBe(true);
    for (const current of [
      { id: 11, url: 'https://nz.seek.com/jobs?jobId=12345678' },
      { id: 10, url: 'https://evil.example/jobs?jobId=12345678' },
      { id: 10, url: 'https://www.seek.co.nz/jobs?jobId=12345678' },
      { id: 10, url: 'https://nz.seek.com/jobs?jobId=999' },
      { id: 10 },
    ])
      expect(validateCurrentPageAnalysis(message, initial, current, extensionId)).toBe(false);
  });

  it('permits an explicit homepage dialog only on the supported homepage surface', () => {
    const dialog: PageAnalysisMessage = { ...message, surface: 'dialog' };
    expect(
      validatePageAnalysis(dialog, { ...sender, url: 'https://nz.seek.com/' }, extensionId),
    ).toBe(true);
    expect(
      validatePageAnalysis(message, { ...sender, url: 'https://nz.seek.com/' }, extensionId),
    ).toBe(false);
    for (const url of [
      'https://nz.seek.com/devops-jobs',
      'https://nz.seek.com/?search=1',
      'https://nz.seek.com/#other',
    ]) {
      expect(validatePageAnalysis(dialog, { ...sender, url }, extensionId)).toBe(false);
    }
  });

  it('accepts only public job browsing surfaces', () => {
    for (const url of [
      'https://nz.seek.com/',
      'https://nz.seek.com/job/123',
      'https://nz.seek.com/devops-jobs/in-All-Auckland',
      'https://nz.seek.com/jobs',
    ]) {
      expect(isSeekPublicSender({ ...sender, url }, extensionId)).toBe(true);
    }
    for (const path of [
      '/profile',
      '/account',
      '/saved-jobs',
      '/my-jobs',
      '/candidate/profile',
      '/job-application/123',
    ]) {
      expect(
        isSeekPublicSender({ ...sender, url: `https://nz.seek.com${path}` }, extensionId),
      ).toBe(false);
    }
  });
});

const backgroundMocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  restrict: vi.fn(),
}));
vi.mock('../src/core/analyze', () => ({ analyze: backgroundMocks.analyze }));
vi.mock('../src/storage/settings', () => ({ restrictKeyAccess: backgroundMocks.restrict }));
vi.mock('../src/employers/schedule', () => ({
  startEmployerSnapshotSchedule: () => ({ refresh: vi.fn(), dispose: vi.fn() }),
}));
vi.mock('../src/i18n/background', () => ({
  startBackgroundLanguage: () => ({ ready: Promise.resolve(), dispose: () => {} }),
}));
vi.mock('wxt/utils/define-background', () => ({ defineBackground: (main: () => void) => main }));
import background from '../entrypoints/background';

type Listener = (
  input: unknown,
  from: chrome.runtime.MessageSender,
  respond: (response: unknown) => void,
) => boolean;
let listener: Listener;
let createTab = vi.fn();
function send(input: unknown, from: PageSender = sender) {
  const response = vi.fn();
  const async = listener(input, from as chrome.runtime.MessageSender, response);
  return { response, async };
}

beforeEach(() => {
  backgroundMocks.analyze.mockReset();
  backgroundMocks.restrict.mockReset().mockResolvedValue(undefined);
  createTab = vi.fn().mockResolvedValue({ id: 100 });
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
    tabs: { create: createTab, get: vi.fn().mockResolvedValue({ id: 10, url: sender.url }) },
  });
  (background as unknown as () => void)();
});
afterEach(() => vi.unstubAllGlobals());

describe('background page request ownership', () => {
  it('routes only a validated page job and returns only its result', async () => {
    const result = { ok: true, job: { id: 'this-job' } };
    backgroundMocks.analyze.mockResolvedValue(result);
    const call = send(message);
    expect(call.async).toBe(true);
    await vi.waitFor(() => expect(call.response).toHaveBeenCalledWith(result));
    expect(backgroundMocks.analyze).toHaveBeenCalledWith(
      requestId,
      message.draft,
      'jev',
      expect.any(AbortSignal),
      { automatic: undefined, force: undefined, onRetry: expect.any(Function) },
    );
  });

  it('rejects messages requesting privileged functionality or mismatched jobs', async () => {
    for (const input of [{ type: 'export-library' }, { type: 'read-key' }])
      expect(send(input).response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    const mismatch = send({
      ...message,
      draft: { ...message.draft, sourceUrl: 'https://nz.seek.com/job/999' },
    });
    await vi.waitFor(() =>
      expect(mismatch.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect(backgroundMocks.analyze).not.toHaveBeenCalled();
  });

  it('keeps one analysis per page tab and only permits the owning document to cancel', async () => {
    backgroundMocks.analyze.mockImplementation(() => new Promise(() => {}));
    send(message);
    await vi.waitFor(() => expect(backgroundMocks.analyze).toHaveBeenCalledTimes(1));
    const activeSignal = backgroundMocks.analyze.mock.calls[0]![3] as AbortSignal;
    expect(send({ ...message, requestId: nextRequestId }).response).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
    expect(backgroundMocks.analyze).toHaveBeenCalledTimes(1);
    const cancel = { type: 'page:cancel', requestId };
    expect(send(cancel, { ...sender, tab: { id: 11 } }).response).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
    expect(send(cancel, { ...sender, documentId: 'new-document' }).response).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
    expect(activeSignal.aborted).toBe(false);
    expect(send(cancel).response).toHaveBeenCalledWith({ ok: true });
    expect(activeSignal.aborted).toBe(true);
  });

  it('releases the page slot on completion', async () => {
    backgroundMocks.analyze.mockResolvedValue({ ok: true });
    const first = send(message);
    await vi.waitFor(() => expect(first.response).toHaveBeenCalled());
    send({ ...message, requestId: nextRequestId });
    await vi.waitFor(() => expect(backgroundMocks.analyze).toHaveBeenCalledTimes(2));
  });

  it('opens only the packaged workspace and refuses an arbitrary URL', async () => {
    const call = send({ type: 'page:open-workspace' });
    expect(createTab).toHaveBeenCalledWith({
      url: `chrome-extension://${extensionId}/sidepanel.html`,
    });
    await vi.waitFor(() => expect(call.response).toHaveBeenCalledWith({ ok: true }));
    expect(
      send({ type: 'page:open-workspace', url: 'https://evil.example/' }).response,
    ).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(createTab).toHaveBeenCalledTimes(1);
  });

  it('opens the local settings section without accepting an arbitrary destination', async () => {
    const call = send({ type: 'page:open-workspace', section: 'settings' });
    expect(createTab).toHaveBeenCalledExactlyOnceWith({
      url: `chrome-extension://${extensionId}/sidepanel.html#settings`,
    });
    await vi.waitFor(() => expect(call.response).toHaveBeenCalledWith({ ok: true }));
  });

  it('rejects retired workspace analysis/cancel messages and unauthenticated website senders', () => {
    backgroundMocks.analyze.mockImplementation(() => new Promise(() => {}));
    const trusted = {
      id: extensionId,
      url: `chrome-extension://${extensionId}/sidepanel.html`,
      tab: { id: 99 },
    };
    for (const input of [
      { type: 'analyze', requestId, draft: message.draft, mode: 'jev' },
      { type: 'cancel', requestId },
    ]) {
      const call = send(input, trusted);
      expect(call.async).toBe(false);
      expect(call.response).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    }
    const malicious = send(message, { ...sender, id: undefined });
    expect(malicious.async).toBe(false);
    expect(malicious.response).not.toHaveBeenCalled();
    expect(backgroundMocks.analyze).not.toHaveBeenCalled();
  });
});

it.each(['local', 'codex', 'qwen', 'unknown'])(
  'rejects retired %s analysis and automatic-analysis messages',
  (provider) => {
    expect(pageMessageSchema.safeParse({ ...message, mode: provider }).success).toBe(false);
    expect(
      pageMessageSchema.safeParse({ type: 'page:auto', enabled: true, provider }).success,
    ).toBe(false);
  },
);
