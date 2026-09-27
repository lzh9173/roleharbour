import { emptyDraft } from './fixtures/job';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze } from '../src/core/analyze';
import { JevError, JEV_MODEL, type JevClassification } from '../src/providers/jev';
import { AnalysisAuthorizationError } from '../src/storage/settings';
import { type JobDraft, type SavedJob } from '../src/core/schema';

const mocks = vi.hoisted(() => ({
  classifyJob: vi.fn(),
  dispatchAuthorized: vi.fn(),
  claimTask: vi.fn(),
  getJobById: vi.fn(),
  putJob: vi.fn(),
  updateTask: vi.fn(),
  getApiKey: vi.fn(),
  getKeyState: vi.fn(),
  retrieveOccupations: vi.fn(),
  permission: vi.fn(),
  rulesVersion: 'rules-v1',
  taxonomyVersion: 'catalogue-v1',
}));
vi.mock('../src/providers/jev', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/providers/jev')>()),
  classifyJob: mocks.classifyJob,
}));
vi.mock('../src/rules', () => ({
  retrieveOccupations: mocks.retrieveOccupations,
  get RULES_VERSION() {
    return mocks.rulesVersion;
  },
  get TAXONOMY_VERSION() {
    return mocks.taxonomyVersion;
  },
}));
vi.mock('../src/storage/db', () => ({
  claimTask: mocks.claimTask,
  getJobById: mocks.getJobById,
  putJob: mocks.putJob,
  updateTask: mocks.updateTask,
}));
vi.mock('../src/storage/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/storage/settings')>()),
  dispatchAuthorizedAnalysis: mocks.dispatchAuthorized,
  getApiKey: mocks.getApiKey,
  getKeyState: mocks.getKeyState,
}));

const draft: JobDraft = {
  ...emptyDraft,
  title: 'Systems Administrator',
  employer: 'Example Employer',
  location: 'Auckland',
  body: 'Maintain Linux servers and automate production deployments. Contact hiring@example.org about the role.',
  sourceUrl: 'https://nz.seek.com/job/123?tracking=secret#fragment',
};
const candidate = {
  id: 'anzsco-262113',
  title: 'Systems Administrator',
  description: 'Maintains computer systems and servers.',
};
const decision = <T extends string>(choice: T) => ({
  choice,
  confidence: 0.9,
  probabilities: { [choice]: 1 },
  evidence: [],
});
const classified: JevClassification = {
  model: JEV_MODEL,
  occupation: decision(candidate.id),
  sponsorship: decision('not_mentioned'),
  workRights: decision('not_mentioned'),
  residency: decision('not_mentioned'),
  requirements: { skills: [], experience: [], truncated: false },
  usage: { inputTokens: 1000, outputTokens: 0 },
};
const signal = () => new AbortController().signal;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rulesVersion = 'rules-v1';
  mocks.taxonomyVersion = 'catalogue-v1';
  mocks.claimTask.mockResolvedValue(undefined);
  mocks.getJobById.mockResolvedValue(undefined);
  mocks.updateTask.mockResolvedValue(undefined);
  mocks.putJob.mockImplementation(async (job: SavedJob) => job);
  mocks.retrieveOccupations.mockReturnValue([candidate]);
  mocks.classifyJob.mockResolvedValue(classified);
  mocks.dispatchAuthorized.mockImplementation(async (_provider, _automatic, dispatch) =>
    dispatch(),
  );
  mocks.getApiKey.mockResolvedValue('private-test-key');
  mocks.getKeyState.mockResolvedValue({ configured: true, consent: true, remembered: false });
  mocks.permission.mockResolvedValue(true);
  vi.stubGlobal('chrome', { permissions: { contains: mocks.permission } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('analysis orchestration', () => {
  it.each(['jev'] as const)(
    'checks current authorization before the first %s dispatch',
    async (provider) => {
      const denied = new AnalysisAuthorizationError('provider');
      mocks.dispatchAuthorized.mockRejectedValue(denied);
      expect(
        await analyze('authorization-revoked', draft, provider, signal(), { automatic: true }),
      ).toEqual({
        ok: false,
        error: denied.message,
        outcomeUnknown: false,
      });
      expect(mocks.dispatchAuthorized).toHaveBeenCalledWith(provider, true, expect.any(Function));
      expect(mocks.classifyJob).not.toHaveBeenCalled();
      expect(mocks.putJob).not.toHaveBeenCalled();
      expect(mocks.updateTask).toHaveBeenLastCalledWith('authorization-revoked', {
        status: 'failed',
        message: denied.message,
      });
    },
  );

  it.each(['provider', 'consent'] as const)(
    'rechecks %s authorization before a JEV validation retry',
    async (reason) => {
      vi.useFakeTimers();
      const denied = new AnalysisAuthorizationError(reason);
      mocks.dispatchAuthorized
        .mockImplementationOnce(async (_provider, _automatic, dispatch) => dispatch())
        .mockRejectedValue(denied);
      mocks.classifyJob.mockRejectedValueOnce(
        new JevError('invalid_response', true, {
          stage: 'choice_not_maximum',
          questionId: 'experience_estimate_evidence',
        }),
      );
      const onRetry = vi.fn();
      const pending = analyze('retry-authorization-revoked', draft, 'jev', signal(), {
        automatic: true,
        onRetry,
      });
      await vi.waitFor(() => expect(onRetry).toHaveBeenCalledWith(1));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await pending).toEqual({ ok: false, error: denied.message, outcomeUnknown: false });
      expect(mocks.dispatchAuthorized).toHaveBeenCalledTimes(2);
      expect(mocks.classifyJob).toHaveBeenCalledOnce();
      expect(mocks.putJob).not.toHaveBeenCalled();
    },
  );

  it.each(['jev'] as const)(
    'rechecks cancellation after waiting for the final %s authorization lock',
    async (provider) => {
      const controller = new AbortController();
      mocks.dispatchAuthorized.mockImplementation(async (_provider, _automatic, dispatch) => {
        controller.abort();
        return dispatch();
      });
      expect(
        await analyze('cancel-before-dispatch', draft, provider, controller.signal),
      ).toMatchObject({
        ok: false,
        outcomeUnknown: false,
      });
      expect(mocks.dispatchAuthorized).toHaveBeenCalledWith(provider, false, expect.any(Function));
      expect(mocks.classifyJob).not.toHaveBeenCalled();
    },
  );

  const mismatch = () =>
    new JevError('invalid_response', true, {
      stage: 'choice_not_maximum',
      questionId: 'experience_estimate_evidence',
    });

  it('retries an inconsistent response within the same task and saves only the valid result', async () => {
    vi.useFakeTimers();
    mocks.classifyJob.mockRejectedValueOnce(mismatch()).mockResolvedValue(classified);
    const onRetry = vi.fn();
    const pending = analyze('retry-success', draft, 'jev', signal(), { onRetry });
    await vi.waitFor(() => expect(onRetry).toHaveBeenCalledWith(1));
    expect(mocks.putJob).not.toHaveBeenCalled();
    expect(mocks.classifyJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toMatchObject({ ok: true });
    expect(mocks.classifyJob).toHaveBeenCalledTimes(2);
    expect(mocks.classifyJob.mock.calls[1]![0]).toEqual(mocks.classifyJob.mock.calls[0]![0]);
    expect(mocks.claimTask).toHaveBeenCalledTimes(1);
    expect(mocks.putJob).toHaveBeenCalledTimes(1);
    expect(
      mocks.updateTask.mock.calls.filter(([, change]) => change.status === 'sent'),
    ).toHaveLength(2);
  });

  it('stops after two delayed retries and returns a friendly error without raw diagnostics', async () => {
    vi.useFakeTimers();
    mocks.classifyJob.mockRejectedValue(mismatch());
    const onRetry = vi.fn();
    const pending = analyze('retry-exhausted', draft, 'jev', signal(), { onRetry });
    await vi.waitFor(() => expect(onRetry).toHaveBeenCalledWith(1));
    await vi.advanceTimersToNextTimerAsync();
    expect(onRetry).toHaveBeenLastCalledWith(2);
    expect(mocks.classifyJob).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(mocks.classifyJob).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, outcomeUnknown: true });
    expect(result.error).toBe(new JevError('retry_failed', true).message);
    expect(result.error).not.toContain('choice_not_maximum');
    expect(mocks.classifyJob).toHaveBeenCalledTimes(3);
    expect(mocks.putJob).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels during backoff without sending or leaving retry timers behind', async () => {
    vi.useFakeTimers();
    mocks.classifyJob.mockRejectedValue(mismatch());
    const controller = new AbortController();
    const onRetry = vi.fn();
    const pending = analyze('retry-cancelled', draft, 'jev', controller.signal, { onRetry });
    await vi.waitFor(() => expect(onRetry).toHaveBeenCalledWith(1));
    controller.abort();
    expect(await pending).toMatchObject({
      ok: false,
      outcomeUnknown: true,
      error: new JevError('aborted', true).message,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.classifyJob).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry a later network failure or claim that no retry was made', async () => {
    vi.useFakeTimers();
    mocks.classifyJob
      .mockRejectedValueOnce(mismatch())
      .mockRejectedValue(new JevError('network_error', true));
    const onRetry = vi.fn();
    const pending = analyze('retry-network', draft, 'jev', signal(), { onRetry });
    await vi.waitFor(() => expect(onRetry).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toMatchObject({
      ok: false,
      outcomeUnknown: true,
      error: new JevError('retry_failed', true).message,
    });
    expect(mocks.classifyJob).toHaveBeenCalledTimes(2);
  });

  it('checks persisted task ownership again before dispatching a retry', async () => {
    vi.useFakeTimers();
    mocks.classifyJob.mockRejectedValue(mismatch());
    const onRetry = vi.fn();
    const pending = analyze('retry-deleted', draft, 'jev', signal(), { onRetry });
    await vi.waitFor(() => expect(onRetry).toHaveBeenCalled());
    mocks.updateTask.mockRejectedValue(new Error('Task deleted'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toMatchObject({ ok: false, outcomeUnknown: true });
    expect(mocks.classifyJob).toHaveBeenCalledTimes(1);
    expect(mocks.putJob).not.toHaveBeenCalled();
  });

  it('returns a fresh cached result without credentials, task creation or another provider call', async () => {
    const initial = await analyze('first', draft, 'jev', signal());
    mocks.getJobById.mockResolvedValue(initial.job);
    mocks.classifyJob.mockClear();
    mocks.claimTask.mockClear();
    mocks.getApiKey.mockClear();
    const cached = await analyze('next', draft, 'jev', signal(), { automatic: true });
    expect(cached).toEqual({ ok: true, job: initial.job, cached: true });
    expect(mocks.classifyJob).not.toHaveBeenCalled();
    expect(mocks.claimTask).not.toHaveBeenCalled();
    expect(mocks.getApiKey).not.toHaveBeenCalled();
    expect(mocks.getJobById).toHaveBeenLastCalledWith(initial.job!.id, undefined);
  });

  it('allows manual force to bypass cache but never permits automatic force', async () => {
    const forced = await analyze('manual', draft, 'jev', signal(), { force: true });
    expect(forced.ok).toBe(true);
    expect(mocks.getJobById).not.toHaveBeenCalled();
    expect(mocks.classifyJob).toHaveBeenCalledTimes(1);
    const refused = await analyze('automatic', draft, 'jev', signal(), {
      automatic: true,
      force: true,
    });
    expect(refused.ok).toBe(false);
    expect(mocks.classifyJob).toHaveBeenCalledTimes(1);
    expect(mocks.claimTask).toHaveBeenCalledTimes(1);
  });

  it('still extracts requirements when no occupation is recalled and merges their source evidence', async () => {
    mocks.retrieveOccupations.mockReturnValue([]);
    const text = 'Maintain Linux servers';
    const evidence = { id: 'segment-0-22', text, start: 0, end: text.length };
    mocks.classifyJob.mockResolvedValue({
      ...classified,
      occupation: decision('none'),
      requirements: {
        skills: [{ text, evidence, level: 'required', confidence: 0.9 }],
        experience: [],
        truncated: false,
      },
    });
    const result = await analyze('requirements', draft, 'jev', signal());
    expect(result.ok, result.error).toBe(true);
    expect(mocks.classifyJob.mock.calls[0]![0].candidates).toEqual([]);
    expect(result.job!.candidateIds).toEqual([]);
    expect(result.job!.evidence).toEqual([evidence]);
  });

  it('persists an experience estimate with merged source evidence and reuses it without another provider call', async () => {
    const skillText = 'Maintain Linux servers';
    const skillEvidence = { id: 'segment_1', text: skillText, start: 0, end: skillText.length };
    const quote = 'Maintain Linux servers and automate production deployments.';
    const estimateEvidence = { id: 'segment_2', text: quote, start: 0, end: quote.length };
    const experienceEstimate = {
      band: 'three_to_five',
      minYears: 3,
      maxYears: 5,
      confidence: 0.82,
      evidence: [estimateEvidence],
    };
    mocks.classifyJob.mockResolvedValue({
      ...classified,
      requirements: {
        skills: [{ text: skillText, evidence: skillEvidence, level: 'required', confidence: 0.9 }],
        experience: [],
        experienceEstimate,
        truncated: false,
      },
    });
    let stored: SavedJob | undefined;
    mocks.putJob.mockImplementation(async (record: SavedJob) => {
      stored = record;
      return record;
    });
    mocks.getJobById.mockImplementation(async () => stored);
    const retainedDraft = { ...draft, retainBody: true };
    const initial = await analyze('estimate-first', retainedDraft, 'jev', signal());
    expect(initial.ok, initial.error).toBe(true);
    expect(stored?.jev?.requirements?.experienceEstimate).toEqual(experienceEstimate);
    expect(stored?.evidence).toEqual([skillEvidence, estimateEvidence]);
    expect(stored?.body?.slice(estimateEvidence.start, estimateEvidence.end)).toBe(quote);

    const cached = await analyze('estimate-cached', retainedDraft, 'jev', signal(), {
      automatic: true,
    });
    expect(cached).toEqual({ ok: true, job: stored, cached: true });
    expect(mocks.classifyJob).toHaveBeenCalledTimes(1);
    expect(mocks.claimTask).toHaveBeenCalledTimes(1);
    expect(mocks.putJob).toHaveBeenCalledTimes(1);
  });

  it('versions results without changing content identity or letting retention preferences create duplicate calls', async () => {
    const initial = await analyze('one', draft, 'jev', signal());
    const retained = await analyze('two', { ...draft, retainBody: true }, 'jev', signal());
    expect(initial.job!.id).toBe(retained.job!.id);
    expect(initial.job!.contentHash).toBe(retained.job!.contentHash);
    expect(initial.job!.body).toBeUndefined();
    expect(retained.job!.body).not.toContain('hiring@example.org');
    mocks.rulesVersion = 'rules-v2';
    const newerRules = await analyze('three', draft, 'jev', signal());
    expect(newerRules.job!.id).not.toBe(initial.job!.id);
    expect(newerRules.job!.contentHash).toBe(initial.job!.contentHash);
    mocks.taxonomyVersion = 'catalogue-v2';
    const newerCatalogue = await analyze('four', draft, 'jev', signal());
    expect(newerCatalogue.job!.id).not.toBe(newerRules.job!.id);
    expect(newerCatalogue.job!.contentHash).toBe(initial.job!.contentHash);
  });

  it('sends redacted title/body only after durable sent state, and uses atomic result completion', async () => {
    const events: string[] = [];
    mocks.updateTask.mockImplementation(async (_id, update: { status: string }) => {
      events.push(update.status);
    });
    mocks.classifyJob.mockImplementation(async () => {
      events.push('provider');
      return classified;
    });
    mocks.putJob.mockImplementation(async (job: SavedJob) => {
      events.push('save');
      return job;
    });
    const result = await analyze(
      'one',
      { ...draft, title: 'Systems administrator hiring@example.org' },
      'jev',
      signal(),
    );
    expect(result.ok).toBe(true);
    expect(events).toEqual(['sent', 'provider', 'save']);
    expect(mocks.putJob.mock.calls[0]![1]).toBe('one');
    const sent = mocks.classifyJob.mock.calls[0]![0];
    expect(sent.body).not.toContain('hiring@example.org');
    expect(sent.title).not.toContain('hiring@example.org');
    expect(Object.keys(sent).sort()).toEqual(['apiKey', 'body', 'candidates', 'signal', 'title']);
    expect(result.job!.sourceUrl).toBe('https://nz.seek.com/job/123');
    expect(JSON.stringify(result)).not.toContain('private-test-key');
  });

  it.each([
    ['unauthorized', false, 'failed'],
    ['rate_limited', false, 'failed'],
    ['network_error', true, 'outcome_unknown'],
    ['timeout', true, 'outcome_unknown'],
    ['invalid_response', true, 'outcome_unknown'],
  ] as const)(
    'preserves provider %s outcome and never retries',
    async (code, outcomeUnknown, status) => {
      mocks.classifyJob.mockRejectedValue(new JevError(code, outcomeUnknown));
      const result = await analyze('one', draft, 'jev', signal());
      expect(result).toMatchObject({ ok: false, outcomeUnknown });
      expect(mocks.updateTask).toHaveBeenLastCalledWith('one', expect.objectContaining({ status }));
      expect(mocks.classifyJob).toHaveBeenCalledTimes(1);
      expect(mocks.putJob).not.toHaveBeenCalled();
    },
  );

  it('never sends when persisting sent state fails', async () => {
    mocks.updateTask.mockImplementation(async (_id, update: { status: string }) => {
      if (update.status === 'sent') throw new Error('Task storage unavailable');
    });
    const result = await analyze('one', draft, 'jev', signal());
    expect(result).toMatchObject({ ok: false, outcomeUnknown: false });
    expect(mocks.classifyJob).not.toHaveBeenCalled();
    expect(mocks.updateTask).toHaveBeenLastCalledWith(
      'one',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('marks a result persistence failure after dispatch as unknown with no retry', async () => {
    mocks.putJob.mockRejectedValue(new Error('Storage quota exceeded'));
    const result = await analyze('one', draft, 'jev', signal());
    expect(result).toMatchObject({ ok: false, outcomeUnknown: true });
    expect(mocks.updateTask).toHaveBeenLastCalledWith(
      'one',
      expect.objectContaining({ status: 'outcome_unknown' }),
    );
    expect(mocks.classifyJob).toHaveBeenCalledTimes(1);
  });

  it('blocks a second claimed task before the provider runs', async () => {
    mocks.claimTask.mockRejectedValue(new Error('Already running'));
    const result = await analyze('two', draft, 'jev', signal());
    expect(result).toMatchObject({ ok: false, outcomeUnknown: false });
    expect(mocks.classifyJob).not.toHaveBeenCalled();
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it('does not dispatch with no consent or no permission', async () => {
    mocks.getKeyState.mockResolvedValueOnce({
      configured: true,
      consent: false,
      remembered: false,
    });
    expect(await analyze('one', draft, 'jev', signal())).toMatchObject({
      ok: false,
      outcomeUnknown: false,
    });
    mocks.permission.mockResolvedValueOnce(false);
    expect(await analyze('two', draft, 'jev', signal())).toMatchObject({
      ok: false,
      outcomeUnknown: false,
    });
    expect(mocks.classifyJob).not.toHaveBeenCalled();
  });

  it('marks cancellation before dispatch as interrupted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await analyze('one', draft, 'jev', controller.signal);
    expect(result).toMatchObject({ ok: false, outcomeUnknown: false });
    expect(mocks.classifyJob).not.toHaveBeenCalled();
    expect(mocks.updateTask).toHaveBeenLastCalledWith(
      'one',
      expect.objectContaining({ status: 'interrupted' }),
    );
  });

  it('marks cancellation after dispatch as unknown, preserving possible remote processing', async () => {
    const controller = new AbortController();
    mocks.classifyJob.mockImplementation(async () => {
      controller.abort();
      throw new JevError('aborted', true);
    });
    const result = await analyze('one', draft, 'jev', controller.signal);
    expect(result).toMatchObject({ ok: false, outcomeUnknown: true });
    expect(mocks.updateTask).toHaveBeenLastCalledWith(
      'one',
      expect.objectContaining({ status: 'outcome_unknown' }),
    );
    expect(mocks.putJob).not.toHaveBeenCalled();
  });

  it('does not persist a result when cancellation arrives as the provider settles', async () => {
    const controller = new AbortController();
    mocks.classifyJob.mockImplementation(async () => {
      controller.abort();
      return classified;
    });
    const result = await analyze('settled-cancellation', draft, 'jev', controller.signal);
    expect(result).toMatchObject({
      ok: false,
      outcomeUnknown: true,
      error: new JevError('aborted', true).message,
    });
    expect(mocks.putJob).not.toHaveBeenCalled();
    expect(mocks.updateTask).toHaveBeenLastCalledWith(
      'settled-cancellation',
      expect.objectContaining({ status: 'outcome_unknown' }),
    );
  });
});

it('preserves the pre-refactor JEV cache identity for the fixed draft and versions', async () => {
  const result = await analyze('compatible-cache', draft, 'jev', signal());
  expect(result.ok).toBe(true);
  expect(result.job?.contentHash).toBe(
    'a457277298bbe8e63e62d2db6ce50ec7c36742e05bbd894d582eee7fa7ee79f9',
  );
  expect(result.job?.id).toBe('7912842e857520cc80ffd0d78e349a971a45d09e5dc8577e6f5ace54501fd604');
});

it.each(['local', 'codex', 'qwen'])(
  'rejects a retired %s caller before cache access, claiming a task or dispatching',
  async (mode) => {
    const result = await analyze('retired-engine', draft, mode as 'jev', signal());
    expect(result).toMatchObject({ ok: false, outcomeUnknown: false });
    expect(mocks.getJobById).not.toHaveBeenCalled();
    expect(mocks.claimTask).not.toHaveBeenCalled();
    expect(mocks.classifyJob).not.toHaveBeenCalled();
    expect(mocks.putJob).not.toHaveBeenCalled();
  },
);
