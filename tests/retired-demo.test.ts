import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { draftSchema, redactContacts } from '../src/core/schema';
import type { ArchivedJob as SavedJob } from '../src/storage/archive-schema';
import { RULES_VERSION } from '../src/rules';
import {
  clearAllJobs,
  getJobById,
  importJobs,
  listJobs,
  listTasks,
  putJob,
  serializeJobs,
} from '../src/storage/db';
import { legacySampleJob } from './fixtures/job';

const legacyHash = '5fb178a10623910a2557fc93210e0ed20a260fe5966031612a842679d15da553';
function retiredDemo(id = 'legacy-demo', changes: Partial<SavedJob> = {}): SavedJob {
  const { retainBody: _retainBody, body: _body, ...draft } = legacySampleJob;
  return {
    ...draft,
    id,
    contentHash: legacyHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bookmarked: true,
    mode: 'local',
    candidateIds: [],
    evidence: [],
    dataVersion: RULES_VERSION,
    ...changes,
  };
}
const backup = (jobs: SavedJob[]) => JSON.stringify({ format: 'seek-filter', version: 1, jobs });
async function seedOldRecords(jobs: SavedJob[], tasks: unknown[] = []) {
  const db = await openDB('seek-filter', 1);
  try {
    const tx = db.transaction(['jobs', 'tasks'], 'readwrite');
    for (const job of jobs) await tx.objectStore('jobs').put(job);
    for (const task of tasks) await tx.objectStore('tasks').put(task);
    await tx.done;
  } finally {
    db.close();
  }
}
function task(id: string, hash: string, jobId?: string) {
  return {
    id,
    hash,
    jobId,
    status: 'sent',
    startedAt: Date.now(),
    expiresAt: Date.now() + 30000,
  };
}

beforeEach(async () => clearAllJobs());

describe('retired product demo cleanup', () => {
  it('pins the published content identity including jobs that did not retain their JD', async () => {
    const draft = draftSchema.parse(legacySampleJob);
    const { retainBody: _retainBody, ...jobInput } = draft;
    const content = { ...jobInput, body: redactContacts(draft.body), sourceUrl: '' };
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content))),
      ),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    expect(hash).toBe(legacyHash);
  });

  it('removes bookmarked legacy examples and only their associated tasks before any read', async () => {
    const demo = retiredDemo();
    await seedOldRecords(
      [demo],
      [
        task('same-analysis', demo.id),
        task('linked-result', 'other-hash', demo.id),
        task('actual-job', 'actual-analysis'),
      ],
    );
    expect((await listTasks()).map((value) => value.id)).toEqual(['actual-job']);
    expect(await getJobById(demo.id)).toBeUndefined();
    expect(await listJobs()).toEqual([]);
  });

  it('recognizes edited copies only when the explicit synthetic declaration was retained', async () => {
    await seedOldRecords([
      retiredDemo('edited-demo', {
        contentHash: 'edited-content',
        body: `${legacySampleJob.body}\nExtra demo details.`,
      }),
    ]);
    expect(await listJobs()).toEqual([]);
  });

  it('preserves actual jobs, ambiguous names, and unmarked custom drafts', async () => {
    const keep = [
      retiredDemo('actual-link', { sourceUrl: 'https://www.seek.co.nz/job/12345678' }),
      retiredDemo('real-company', { employer: 'Koru Labs' }),
      retiredDemo('same-title', { employer: 'Actual Engineering Ltd', sourceUrl: '' }),
      retiredDemo('custom-draft', { contentHash: 'changed-without-demo-evidence' }),
      retiredDemo('different-title', { title: 'Principal DevOps Engineer' }),
    ];
    await seedOldRecords(keep);
    expect((await listJobs()).map((value) => value.id).sort()).toEqual(
      keep.map((value) => value.id).sort(),
    );
  });

  it('filters retired demos out of imported and exported backups while retaining actual records', async () => {
    const demo = retiredDemo();
    const actual = retiredDemo('actual-job', { employer: 'Actual Engineering Ltd' });
    expect(await importJobs(backup([demo, actual]))).toBe(1);
    expect(await listJobs()).toEqual([actual]);
    expect(JSON.parse(serializeJobs([demo, actual])).jobs).toEqual([actual]);
  });

  it('prevents a late result from restoring the removed demo', async () => {
    const demo = retiredDemo();
    await seedOldRecords([demo], [task('pending-demo', demo.id)]);
    expect(await listJobs()).toEqual([]);
    await expect(putJob(demo, 'pending-demo')).rejects.toThrow('此示例已移除');
    expect(await listJobs()).toEqual([]);
    expect(await listTasks()).toEqual([]);
  });
});
