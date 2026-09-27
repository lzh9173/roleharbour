import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchivedJob as SavedJob } from '../src/storage/archive-schema';
import { RULES_VERSION } from '../src/rules';
import {
  claimTask,
  clearAllJobs,
  getJobById,
  importJobs,
  listJobs,
  listTasks,
  putJob,
  serializeJobs,
  updateTask,
} from '../src/storage/db';

const now = 1_800_000_000_000;
const retention = 30 * 24 * 60 * 60 * 1000;
function job(id = 'analysis-a', overrides: Partial<SavedJob> = {}): SavedJob {
  return {
    id,
    contentHash: `content-${id}`,
    title: 'DevOps Engineer',
    employer: 'Example Ltd',
    location: 'Auckland',
    sourceUrl: 'https://example.com/jobs/devops',
    salary: {
      min: '150000.1234',
      max: null,
      currency: 'NZD',
      period: 'annual',
      hoursPerWeek: null,
    },
    createdAt: now - 1000,
    updatedAt: now,
    bookmarked: false,
    mode: 'local',
    candidateIds: ['anzsco-261313'],
    evidence: [],
    dataVersion: RULES_VERSION,
    ...overrides,
  };
}
function backup(jobs: unknown[]): string {
  return JSON.stringify({ format: 'seek-filter', version: 1, jobs });
}
const qwenBody = 'Build and maintain software systems. Collaborate with the engineering team.';
const qwenSource = {
  id: 's1',
  text: 'Build and maintain software systems.',
  start: 0,
  end: 36,
};
const qwenSecondSource = {
  id: 's2',
  text: 'Collaborate with the engineering team.',
  start: 37,
  end: qwenBody.length,
};
function qwenJob(id = 'qwen-result'): SavedJob {
  return job(id, {
    body: qwenBody,
    mode: 'qwen',
    local: {
      version: 'legacy-local-fixture',
      requirements: { skills: [], experience: [], truncated: false },
      sponsorship: { choice: 'not_mentioned', evidence: [] },
      workRights: { choice: 'not_mentioned', evidence: [] },
      residency: { choice: 'not_mentioned', evidence: [] },
    },
    qwen: {
      model: 'onnx-community/Qwen3-0.6B-ONNX',
      revision: 'da1453100cf3ff33ef56d17983fc7a8648706db6',
      dtype: 'q4f16',
      promptVersion: 'qwen-trial-v1',
      validationVersion: 'qwen-fields-v2',
      occupation: { choice: 'anzsco-261313', evidence: [qwenSource] },
      sponsorship: { choice: 'not_mentioned', evidence: [] },
      workRights: { choice: 'not_mentioned', evidence: [] },
      residency: { choice: 'not_mentioned', evidence: [] },
      issues: {},
      normalizations: ['occupation_title'],
      usage: { inputTokens: 1105, outputTokens: 96 },
      inferenceMs: 2064.3,
    },
  });
}
async function rawPut(store: 'jobs' | 'tasks', value: unknown): Promise<void> {
  const db = await openDB('seek-filter', 1);
  try {
    await db.put(store, value);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  await clearAllJobs();
  vi.spyOn(Date, 'now').mockReturnValue(now);
});
afterEach(() => vi.restoreAllMocks());

describe('saved Qwen analysis boundaries', () => {
  it('commits and round-trips complete and partial results with independent local requirements', async () => {
    const complete = qwenJob();
    const partial = qwenJob('qwen-partial');
    delete partial.qwen!.residency;
    partial.qwen!.issues.residency = 'unverified_evidence';
    await claimTask('qwen-task', complete.id);
    await expect(putJob(complete, 'qwen-task')).resolves.toEqual(complete);
    expect((await listTasks())[0]?.status).toBe('completed');
    const exported = serializeJobs([complete, partial, job('legacy-local')]);
    await clearAllJobs();
    await expect(importJobs(exported)).resolves.toBe(3);
    expect(await getJobById(complete.id)).toEqual(complete);
    expect(await getJobById(partial.id)).toEqual(partial);
    expect((await getJobById(partial.id))?.qwen?.residency).toBeUndefined();
    expect((await getJobById(partial.id))?.local?.residency.choice).toBe('not_mentioned');
    expect(await getJobById('legacy-local')).toBeDefined();
  });

  it('preserves fully withheld and abstained results without filling them from rules', async () => {
    const withheld = qwenJob('qwen-withheld');
    for (const field of ['occupation', 'sponsorship', 'workRights', 'residency'] as const) {
      delete withheld.qwen![field];
      withheld.qwen!.issues[field] = 'invalid_json';
    }
    withheld.qwen!.normalizations = [];
    const abstained = qwenJob('qwen-abstained');
    abstained.qwen!.occupation = { choice: 'unclear', evidence: [] };
    abstained.qwen!.sponsorship = { choice: 'unclear', evidence: [] };
    abstained.qwen!.normalizations = [];
    await importJobs(serializeJobs([withheld, abstained]));
    expect(await getJobById(withheld.id)).toEqual(withheld);
    expect(await getJobById(abstained.id)).toEqual(abstained);
  });

  it('strips raw outputs, confidence and unknown credential fields from stored Qwen data', async () => {
    const record = qwenJob();
    const extra = {
      ...record,
      qwen: {
        ...record.qwen!,
        output: 'must-not-store',
        apiKey: 'must-not-store',
        confidence: 0.99,
        occupation: { ...record.qwen!.occupation!, confidence: 0.99, probabilities: { x: 1 } },
      },
    };
    const exported = serializeJobs([extra]);
    expect(exported).not.toContain('must-not-store');
    expect(exported).not.toContain('confidence');
    expect(exported).not.toContain('probabilities');
    await importJobs(backup([extra]));
    expect(await getJobById(record.id)).toEqual(record);
  });

  it('checks nested Qwen citations even without top-level evidence or previously retained body', async () => {
    const record = qwenJob();
    expect(record.evidence).toEqual([]);
    const privateRecord = { ...record, body: undefined };
    await importJobs(serializeJobs([privateRecord]));
    expect(await getJobById(record.id)).toEqual(privateRecord);
    await expect(
      getJobById(record.id, { retainBody: true, body: 'x'.repeat(qwenBody.length) }),
    ).rejects.toThrow('证据不匹配');
    expect((await getJobById(record.id))?.body).toBeUndefined();
    await expect(getJobById(record.id, { retainBody: true, body: qwenBody })).resolves.toEqual(
      record,
    );
  });

  const invalidCases: Array<[string, (record: SavedJob) => void]> = [
    [
      'missing Qwen data',
      (record) => {
        delete record.qwen;
      },
    ],
    [
      'missing local rules',
      (record) => {
        delete record.local;
      },
    ],
    [
      'wrong mode',
      (record) => {
        record.mode = 'local';
      },
    ],
    [
      'missing result and issue',
      (record) => {
        delete record.qwen!.residency;
      },
    ],
    [
      'result and issue together',
      (record) => {
        record.qwen!.issues.residency = 'invalid_shape';
      },
    ],
    [
      'unknown candidate',
      (record) => {
        record.qwen!.occupation!.choice = 'anzsco-999999';
      },
    ],
    [
      'unmapped occupation title',
      (record) => {
        record.qwen!.occupation!.choice = 'Developer Programmer';
      },
    ],
    [
      'definite decision without evidence',
      (record) => {
        record.qwen!.occupation!.evidence = [];
      },
    ],
    [
      'absence with evidence',
      (record) => {
        record.qwen!.residency!.evidence = [qwenSource];
      },
    ],
    [
      'rule disagreement',
      (record) => {
        record.qwen!.sponsorship = { choice: 'supported', evidence: [qwenSource] };
      },
    ],
    [
      'empty metadata',
      (record) => {
        record.qwen!.validationVersion = ' ';
      },
    ],
    [
      'negative tokens',
      (record) => {
        record.qwen!.usage.inputTokens = -1;
      },
    ],
    [
      'fractional tokens',
      (record) => {
        record.qwen!.usage.outputTokens = 1.5;
      },
    ],
    [
      'invalid timing',
      (record) => {
        record.qwen!.inferenceMs = -1;
      },
    ],
    [
      'invented normalization',
      (record) => {
        record.qwen!.occupation = { choice: 'unclear', evidence: [] };
      },
    ],
    [
      'duplicate normalization',
      (record) => {
        record.qwen!.normalizations.push('occupation_title');
      },
    ],
    [
      'repeated citation',
      (record) => {
        record.qwen!.occupation!.evidence.push(qwenSource);
      },
    ],
    [
      'source order',
      (record) => {
        record.qwen!.occupation!.evidence = [qwenSecondSource, qwenSource];
      },
    ],
    [
      'inconsistent source ID',
      (record) => {
        record.qwen!.sponsorship = {
          choice: 'unclear',
          evidence: [{ ...qwenSecondSource, id: 's1' }],
        };
      },
    ],
    [
      'fabricated citation',
      (record) => {
        record.body = 'x'.repeat(qwenBody.length);
      },
    ],
    [
      'invalid citation range',
      (record) => {
        record.qwen!.occupation!.evidence = [{ ...qwenSource, end: 35 }];
      },
    ],
    [
      'invalid source identifier',
      (record) => {
        record.qwen!.occupation!.evidence = [{ ...qwenSource, id: 'sentence1' }];
      },
    ],
    [
      'too many citations',
      (record) => {
        record.qwen!.occupation!.evidence = Array.from({ length: 9 }, (_, index) => ({
          ...qwenSource,
          id: `s${index + 1}`,
        }));
      },
    ],
  ];
  it.each(invalidCases)(
    'rejects %s atomically without changing existing jobs',
    async (_name, alter) => {
      const existing = qwenJob('existing-qwen');
      await importJobs(backup([existing, job('legacy-local')]));
      const invalid = structuredClone(qwenJob('invalid-qwen'));
      alter(invalid);
      expect(() => serializeJobs([invalid])).toThrow();
      await expect(importJobs(backup([qwenJob('valid-new'), invalid]))).rejects.toThrow();
      expect(await getJobById('valid-new')).toBeUndefined();
      expect(await getJobById(existing.id)).toEqual(existing);
      expect(await getJobById('legacy-local')).toBeDefined();
    },
  );

  it('rejects unknown issue labels and unexpected field names', async () => {
    const record = qwenJob();
    const invalid = { ...record, qwen: { ...record.qwen!, issues: { location: 'invalid_shape' } } };
    await expect(importJobs(backup([invalid]))).rejects.toThrow();
    await expect(
      importJobs(
        backup([
          {
            ...record,
            qwen: { ...record.qwen!, issues: { residency: 'ignored' }, residency: undefined },
          },
        ]),
      ),
    ).rejects.toThrow();
    expect(await listJobs()).toEqual([]);
  });
});

describe('atomic local analysis ownership', () => {
  it('validates local evidence on backup import while keeping legacy local records readable', async () => {
    const text = 'TypeScript proficiency is essential.';
    const evidence = { id: 'local_1', text, start: 0, end: text.length };
    const local: NonNullable<SavedJob['local']> = {
      version: 'local-evidence-v1',
      requirements: {
        skills: [{ text, level: 'required', evidence }],
        experience: [],
        truncated: false,
      },
      sponsorship: { choice: 'not_mentioned', evidence: [] },
      workRights: { choice: 'not_mentioned', evidence: [] },
      residency: { choice: 'not_mentioned', evidence: [] },
    };
    const record = job('local-rules', { body: text, local, evidence: [evidence] });
    await importJobs(backup([record, job('legacy-local')]));
    expect(await getJobById('local-rules')).toEqual(record);
    expect(await getJobById('legacy-local')).toBeDefined();
    const invalid = structuredClone(record);
    invalid.local!.requirements.skills[0]!.evidence.text = 'A different, fabricated requirement.';
    await expect(importJobs(backup([invalid]))).rejects.toThrow();
    const mismatch = structuredClone(record);
    mismatch.body = 'x'.repeat(text.length);
    await expect(importJobs(backup([mismatch]))).rejects.toThrow();
    const unsupportedDecision = structuredClone(record);
    unsupportedDecision.local!.sponsorship.choice = 'supported';
    await expect(importJobs(backup([unsupportedDecision]))).rejects.toThrow();
  });
  it('round-trips Codex results without inventing probabilities and rejects missing model data', async () => {
    const decision = <T extends string>(choice: T) => ({
      choice,
      confidence: 0.8,
      probabilities: {},
      evidence: [],
    });
    const record = job('codex-result', {
      mode: 'codex',
      jev: {
        model: 'gpt-5.6-sol',
        occupation: decision('insufficient'),
        sponsorship: decision('not_mentioned'),
        workRights: decision('not_mentioned'),
        residency: decision('not_mentioned'),
        requirements: { skills: [], experience: [], truncated: false },
        usage: { inputTokens: 10, outputTokens: 20 },
      },
    });
    await importJobs(backup([record]));
    expect((await listJobs())[0]).toEqual(record);
    expect(
      JSON.parse(serializeJobs(await listJobs())).jobs[0].jev.occupation.probabilities,
    ).toEqual({});
    await expect(importJobs(backup([job('missing-codex', { mode: 'codex' })]))).rejects.toThrow();
  });

  it('keeps retry ownership past the original lease and prevents concurrent dispatch', async () => {
    await claimTask('first', 'analysis-a');
    await updateTask('first', { status: 'sent' });
    vi.mocked(Date.now).mockReturnValue(now + 21_000);
    await updateTask('first', { status: 'sent', expiresAt: now + 51_000 });
    vi.mocked(Date.now).mockReturnValue(now + 40_000);
    expect((await listTasks())[0]?.status).toBe('sent');
    await expect(claimTask('duplicate', 'analysis-a')).rejects.toThrow();
    await expect(putJob(job(), 'first')).resolves.toBeDefined();
    expect((await listTasks())[0]?.status).toBe('completed');
  });

  it.each(['failed', 'outcome_unknown', 'interrupted'] as const)(
    'blocks automatic retry of persisted %s history while allowing a new manual attempt',
    async (status) => {
      await claimTask('first', 'analysis-a', { automatic: true });
      await updateTask('first', { status });
      await expect(claimTask('auto-again', 'analysis-a', { automatic: true })).rejects.toThrow(
        '自动分析不会重试',
      );
      await expect(claimTask('manual-retry', 'analysis-a')).resolves.toBeUndefined();
    },
  );

  it('blocks automatic retry of an expired sent task without depending on a recovery read', async () => {
    await claimTask('first', 'analysis-a', { automatic: true });
    await updateTask('first', { status: 'sent' });
    vi.mocked(Date.now).mockReturnValue(now + 30000);
    await expect(claimTask('auto-again', 'analysis-a', { automatic: true })).rejects.toThrow(
      '自动分析不会重试',
    );
    expect((await listTasks())[0]?.status).toBe('outcome_unknown');
  });

  it('lets only one panel claim the same versioned analysis concurrently', async () => {
    const outcomes = await Promise.allSettled([
      claimTask('request-a', 'analysis-a'),
      claimTask('request-b', 'analysis-a'),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect((await listTasks()).filter((task) => task.status === 'running')).toHaveLength(1);
  });

  it('commits result and completed task atomically while allowing a different JD hash', async () => {
    await claimTask('request-a', 'analysis-a');
    const saved = await putJob(job(), 'request-a');
    expect(saved.contentHash).not.toBe(saved.id);
    expect((await listTasks())[0]).toMatchObject({
      id: 'request-a',
      jobId: saved.id,
      status: 'completed',
    });
    expect(await listJobs()).toEqual([saved]);
    await expect(
      updateTask('request-a', { status: 'completed', jobId: saved.id }),
    ).resolves.toBeUndefined();
    await expect(claimTask('request-a', 'analysis-a')).rejects.toThrow('此任务已提交');
  });

  it('rolls back the saved result when writing task completion fails synchronously', async () => {
    const original = job('analysis-a', { bookmarked: true, createdAt: now - 50000 });
    await importJobs(backup([original]));
    await claimTask('request-a', original.id);
    const originalPut = IDBObjectStore.prototype.put;
    const intercepted = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'tasks' && (value as { status?: string }).status === 'completed')
        throw new DOMException('Storage full', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    });
    await expect(
      putJob(job('analysis-a', { title: 'Replacement result' }), 'request-a'),
    ).rejects.toThrow('Storage full');
    intercepted.mockRestore();
    expect(await listJobs()).toEqual([original]);
    expect((await listTasks())[0]?.status).toBe('running');
  });

  it('rolls back a written result when cancelled before transaction commit and removes its listener', async () => {
    const original = job('analysis-a', { bookmarked: true, createdAt: now - 50000 });
    await importJobs(backup([original]));
    await claimTask('request-a', original.id);
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const originalPut = IDBObjectStore.prototype.put;
    const intercepted = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key);
      if (this.name === 'jobs')
        request.addEventListener('success', () => controller.abort(), { once: true });
      return request;
    });
    await expect(
      putJob(job('analysis-a', { title: 'Replacement result' }), 'request-a', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    intercepted.mockRestore();
    expect(await listJobs()).toEqual([original]);
    expect((await listTasks())[0]?.status).toBe('running');
    expect(removed).toHaveBeenCalledExactlyOnceWith('abort', added.mock.calls[0]![1]);
  });

  it('keeps an already committed result successful when cancellation arrives on completion', async () => {
    await claimTask('request-a', 'analysis-a');
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const originalPut = IDBObjectStore.prototype.put;
    const intercepted = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'tasks')
        this.transaction.addEventListener('complete', () => controller.abort(), { once: true });
      return originalPut.call(this, value, key);
    });
    await expect(putJob(job(), 'request-a', controller.signal)).resolves.toEqual(job());
    intercepted.mockRestore();
    expect(controller.signal.aborted).toBe(true);
    expect(await listJobs()).toEqual([job()]);
    expect((await listTasks())[0]?.status).toBe('completed');
    expect(removed).toHaveBeenCalledExactlyOnceWith('abort', added.mock.calls[0]![1]);
  });

  it('does not restart expired sent requests, while a new explicit attempt is allowed', async () => {
    await claimTask('request-a', 'analysis-a');
    await updateTask('request-a', { status: 'sent' });
    vi.mocked(Date.now).mockReturnValue(now + 30000);
    expect((await listTasks())[0]?.status).toBe('outcome_unknown');
    await expect(updateTask('request-a', { status: 'sent' })).rejects.toThrow();
    await expect(claimTask('request-a', 'analysis-a')).rejects.toThrow();
    await expect(putJob(job(), 'request-a')).rejects.toThrow();
    await expect(claimTask('explicit-retry', 'analysis-a')).resolves.toBeUndefined();
    expect((await listTasks()).find((task) => task.id === 'request-a')?.status).toBe(
      'outcome_unknown',
    );
  });

  it('interrupts an expired unsent lease before it can dispatch', async () => {
    await claimTask('request-a', 'analysis-a');
    vi.mocked(Date.now).mockReturnValue(now + 30000);
    await expect(updateTask('request-a', { status: 'sent' })).rejects.toThrow();
    expect((await listTasks())[0]?.status).toBe('interrupted');
  });

  it('does not let a caller change identity or complete without a saved result', async () => {
    await claimTask('request-a', 'analysis-a');
    await expect(updateTask('request-a', { id: 'request-b' })).rejects.toThrow();
    await expect(updateTask('request-a', { hash: 'analysis-b' })).rejects.toThrow();
    await expect(updateTask('request-a', { status: 'completed' })).rejects.toThrow();
    await expect(putJob(job('analysis-b'), 'request-a')).rejects.toThrow();
    expect(await listJobs()).toEqual([]);
  });

  it('preserves an existing bookmark and creation date on a fresh analysis', async () => {
    const original = job('analysis-a', { bookmarked: true, createdAt: now - 50000 });
    await importJobs(backup([original]));
    await claimTask('request-a', original.id);
    const saved = await putJob(job(), 'request-a');
    expect(saved).toMatchObject({ bookmarked: true, createdAt: original.createdAt });
  });
});

describe('deletion revokes outstanding writes from other panels', () => {
  it('rolls back deleted records when clearing their task ownership fails', async () => {
    const original = job();
    await importJobs(backup([original]));
    await claimTask('request-a', original.id);
    const originalClear = IDBObjectStore.prototype.clear;
    const intercepted = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (
      this: IDBObjectStore,
    ) {
      if (this.name === 'tasks') throw new DOMException('Storage unavailable', 'UnknownError');
      return originalClear.call(this);
    });
    await expect(clearAllJobs()).rejects.toThrow('Storage unavailable');
    intercepted.mockRestore();
    expect(await listJobs()).toEqual([original]);
    expect((await listTasks())[0]?.status).toBe('running');
  });

  it('does not resurrect a deleted job when its provider response arrives late', async () => {
    await importJobs(backup([job()]));
    await claimTask('request-a', 'analysis-a');
    await updateTask('request-a', { status: 'sent' });
    await clearAllJobs();
    await expect(putJob(job(), 'request-a')).rejects.toThrow();
    await expect(updateTask('request-a', { status: 'sent' })).rejects.toThrow();
    expect(await listJobs()).toEqual([]);
  });

  it('clearing all records blocks every already claimed result', async () => {
    await claimTask('request-a', 'analysis-a');
    await claimTask('request-b', 'analysis-b');
    await clearAllJobs();
    await expect(putJob(job(), 'request-a')).rejects.toThrow();
    await expect(putJob(job('analysis-b'), 'request-b')).rejects.toThrow();
    expect(await listTasks()).toEqual([]);
    expect(await listJobs()).toEqual([]);
  });

  it('serializes a clear racing with a result commit without leaving the record', async () => {
    await importJobs(backup([job()]));
    await claimTask('request-a', 'analysis-a');
    await Promise.allSettled([putJob(job(), 'request-a'), clearAllJobs()]);
    expect(await listJobs()).toEqual([]);
  });
});

describe('retention and validated backup boundaries', () => {
  it('round-trips optional experience estimates and checks their nested evidence against retained body', async () => {
    const quote = 'Lead production deployments and coach engineers.';
    const evidence = { id: 'segment_1', text: quote, start: 0, end: quote.length };
    const decision = <T extends string>(choice: T) => ({
      choice,
      confidence: 1,
      probabilities: { [choice]: 1 },
      evidence: [],
    });
    const record = job('estimate', {
      mode: 'jev',
      body: quote,
      jev: {
        model: 'jev-1.13.0',
        occupation: decision('none'),
        sponsorship: decision('not_mentioned'),
        workRights: decision('not_mentioned'),
        residency: decision('not_mentioned'),
        requirements: {
          skills: [],
          experience: [],
          truncated: false,
          experienceEstimate: {
            band: 'three_to_five',
            minYears: 3,
            maxYears: 5,
            confidence: 0.84,
            evidence: [evidence],
          },
        },
        usage: { inputTokens: 10, outputTokens: 0 },
      },
    });
    // Empty top-level evidence must not exempt the nested estimate from validation.
    expect(record.evidence).toEqual([]);
    await claimTask('estimate-task', record.id);
    await putJob(record, 'estimate-task');
    expect((await getJobById(record.id))?.jev?.requirements?.experienceEstimate).toEqual(
      record.jev?.requirements?.experienceEstimate,
    );
    const legacy = job('legacy', {
      mode: 'jev',
      jev: { ...record.jev!, requirements: { skills: [], experience: [], truncated: false } },
    });
    const exported = serializeJobs([record, legacy]);
    await clearAllJobs();
    expect(await importJobs(exported)).toBe(2);
    expect((await getJobById(record.id))?.jev?.requirements?.experienceEstimate).toEqual(
      record.jev?.requirements?.experienceEstimate,
    );
    expect((await getJobById(legacy.id))?.jev?.requirements?.experienceEstimate).toBeUndefined();

    const forged = { ...record, body: 'A different role and unrelated source description.' };
    await expect(importJobs(backup([forged]))).rejects.toThrow('证据不匹配');
    expect(() => serializeJobs([forged])).toThrow('证据不匹配');
    await expect(getJobById(record.id, { retainBody: true, body: forged.body })).rejects.toThrow(
      '证据不匹配',
    );
    expect((await getJobById(record.id))?.body).toBe(quote);
  });

  it('validates requirement evidence against retained text even when the top-level evidence array is empty', async () => {
    const quote = 'Linux experience is required.';
    const evidence = { id: 'requirement-0', text: quote, start: 0, end: quote.length };
    const decision = <T extends string>(choice: T) => ({
      choice,
      confidence: 1,
      probabilities: { [choice]: 1 },
      evidence: [],
    });
    const record = job('requirements', {
      mode: 'jev',
      body: quote,
      jev: {
        model: 'jev-1.13.0',
        occupation: decision('none'),
        sponsorship: decision('not_mentioned'),
        workRights: decision('not_mentioned'),
        residency: decision('not_mentioned'),
        requirements: {
          skills: [{ text: quote, evidence, level: 'required', confidence: 1 }],
          experience: [],
          truncated: false,
        },
        usage: { inputTokens: 10, outputTokens: 0 },
      },
    });
    await expect(importJobs(backup([record]))).resolves.toBe(1);
    expect((await getJobById(record.id))?.jev?.requirements?.skills[0]?.evidence).toEqual(evidence);
    await expect(
      importJobs(backup([{ ...record, body: 'Different source description' }])),
    ).rejects.toThrow('证据不匹配');
    expect((await getJobById(record.id))?.body).toBe(quote);
  });

  it('returns fresh cached jobs without renewing their age and excludes even bookmarked stale results', async () => {
    await importJobs(
      backup([
        job('fresh'),
        job('expired', { createdAt: now - retention, updatedAt: now - retention }),
        job('bookmarked-stale', {
          createdAt: now - retention,
          updatedAt: now - retention,
          bookmarked: true,
        }),
      ]),
    );
    expect(await getJobById('fresh')).toEqual(job('fresh'));
    expect(await getJobById('expired')).toBeUndefined();
    expect(await getJobById('bookmarked-stale')).toBeUndefined();
    expect((await listJobs()).map((value) => value.id)).toEqual(['fresh', 'bookmarked-stale']);
    vi.mocked(Date.now).mockReturnValue(now + retention);
    expect(await getJobById('fresh')).toBeUndefined();
  });

  it('updates a manual cache retention preference without changing timestamps or restoring a deletion', async () => {
    await importJobs(backup([job()]));
    const preference = {
      retainBody: true,
      body: 'This is the supplied source description for the cached role.',
    };
    const cached = await getJobById('analysis-a', preference);
    expect(cached).toMatchObject({ body: preference.body, createdAt: now - 1000, updatedAt: now });
    expect(
      (await getJobById('analysis-a', { ...preference, retainBody: false }))?.body,
    ).toBeUndefined();
    await clearAllJobs();
    expect(await getJobById('analysis-a', preference)).toBeUndefined();
    expect(await listJobs()).toEqual([]);
  });

  it('accepts the actual bundled policy version through import and export', async () => {
    const record = job();
    expect(record.dataVersion).toBe(RULES_VERSION);
    await expect(importJobs(backup([record]))).resolves.toBe(1);
    const exported = JSON.parse(serializeJobs(await listJobs())) as { jobs: SavedJob[] };
    expect(exported.jobs[0]?.dataVersion).toBe(RULES_VERSION);
  });

  it.each([
    ['ASCII', 'x', 200, 210],
    ['multibyte UTF-8', '界', 65, 70],
  ] as const)(
    'only exports restorable large %s backups',
    async (_name, character, within, over) => {
      const records = Array.from({ length: over }, (_, index) =>
        job(`large-${index}`, { body: character.repeat(24000) }),
      );
      const exported = serializeJobs(records.slice(0, within));
      await expect(importJobs(exported)).resolves.toBe(within);
      const restored = await listJobs();
      expect(restored).toHaveLength(within);
      expect(restored.every((record) => record.body === records[0]!.body)).toBe(true);
      expect(() => serializeJobs(records)).toThrow('5 MB');
      expect(await listJobs()).toEqual(restored);
    },
  );

  it('removes expired unbookmarked jobs exactly at 30 days, preserving bookmarks', async () => {
    await importJobs(
      backup([
        job('expired', { createdAt: now - retention, updatedAt: now - retention }),
        job('kept', {
          createdAt: now - retention - 1,
          updatedAt: now - retention - 1,
          bookmarked: true,
        }),
        job('recent'),
      ]),
    );
    expect((await listJobs()).map((record) => record.id)).toEqual(['recent', 'kept']);
  });

  it('cleans corrupt old records without trusting their types or identifiers', async () => {
    await rawPut('jobs', { id: 'broken', title: 17 });
    await rawPut('tasks', { id: 'broken-task', status: 'sent', startedAt: -1 });
    expect(await listJobs()).toEqual([]);
    expect(await listTasks()).toEqual([]);
  });

  it('drops expired task history instead of reviving it', async () => {
    await rawPut('tasks', {
      id: 'old-request',
      hash: 'analysis-a',
      status: 'sent',
      startedAt: now - retention,
      expiresAt: now - retention + 30000,
    });
    expect(await listTasks()).toEqual([]);
  });

  it('strips unknown properties and Key fields during export and import', async () => {
    const withSecrets = {
      ...job(),
      jevKey: 'must-not-export',
      apiKey: 'must-not-export',
      salary: { ...job().salary, apiKey: 'must-not-export' },
    };
    const text = serializeJobs([withSecrets]);
    expect(text).not.toContain('must-not-export');
    await importJobs(backup([withSecrets]));
    expect(JSON.stringify(await listJobs())).not.toContain('must-not-export');
  });

  it('rejects an entire import if any record is invalid without partial writes', async () => {
    await importJobs(backup([job('existing')]));
    await expect(
      importJobs(backup([job('valid-new'), job('bad', { sourceUrl: 'javascript:alert(1)' })])),
    ).rejects.toThrow();
    expect((await listJobs()).map((record) => record.id)).toEqual(['existing']);
  });

  it('rolls back earlier writes if storage fails midway through an import', async () => {
    await importJobs(backup([job('existing')]));
    const originalPut = IDBObjectStore.prototype.put;
    const intercepted = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if ((value as { id?: string }).id === 'quota-failure')
        throw new DOMException('Storage full', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    });
    await expect(importJobs(backup([job('written-first'), job('quota-failure')]))).rejects.toThrow(
      'Storage full',
    );
    intercepted.mockRestore();
    expect((await listJobs()).map((record) => record.id)).toEqual(['existing']);
  });

  it.each([
    { sourceUrl: 'https://user:password@example.com/job' },
    { sourceUrl: 'http://example.com/job' },
    { sourceUrl: `https://example.com/${'a'.repeat(2100)}` },
    { createdAt: -1 },
    { updatedAt: -1 },
    { title: 'x'.repeat(241) },
    { body: 'x'.repeat(24001) },
    { salary: { ...job().salary, min: '-1' } },
    { evidence: [{ id: 'evidence-a', start: 1, end: 2, text: 'mismatched' }] },
    { body: 'actual body', evidence: [{ id: 'evidence-a', start: 0, end: 5, text: 'other' }] },
  ])('rejects unsafe or invalid record data: %j', async (invalid) => {
    await expect(importJobs(backup([job('bad', invalid)]))).rejects.toThrow();
    expect(await listJobs()).toEqual([]);
  });

  it('rejects duplicate IDs, invalid JSON and over-limit UTF-8 backups', async () => {
    await expect(importJobs(backup([job(), job()]))).rejects.toThrow('重复');
    await expect(importJobs('{')).rejects.toThrow();
    await expect(importJobs(`{"padding":"${'中'.repeat(1_666_667)}"}`)).rejects.toThrow('5 MB');
    await expect(
      importJobs(backup(Array.from({ length: 1001 }, (_, index) => job(`job-${index}`)))),
    ).rejects.toThrow();
    expect(() =>
      serializeJobs(Array.from({ length: 1001 }, (_, index) => job(`job-${index}`))),
    ).toThrow('1000');
    expect(await listJobs()).toEqual([]);
  });
});
