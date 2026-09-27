import { t } from '../i18n';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import type { AnalysisTask, TaskStatus } from '../core/schema';
import { archiveJobSchema, type ArchivedJob } from './archive-schema';

interface SeekDB extends DBSchema {
  jobs: { key: string; value: ArchivedJob };
  tasks: { key: string; value: AnalysisTask };
}
const retentionMs = 30 * 24 * 60 * 60 * 1000;
const maxBackupBytes = 5_000_000;
const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const taskStatus = z.enum([
  'running',
  'sent',
  'completed',
  'failed',
  'outcome_unknown',
  'interrupted',
]);
const taskSchema = z
  .object({
    id: identifier,
    hash: identifier,
    status: taskStatus,
    startedAt: timestamp,
    expiresAt: timestamp,
    jobId: identifier.optional(),
    message: z.string().max(1000).optional(),
  })
  .refine((task) => task.expiresAt >= task.startedAt);
const taskChangeSchema = z
  .object({
    status: taskStatus.optional(),
    expiresAt: timestamp.optional(),
    jobId: identifier.optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();

// Backups and old IndexedDB values are runtime input, not trusted TypeScript types.
// Zod's object parsing strips unknown properties, including accidentally attached Keys.
const storedJobSchema = archiveJobSchema.superRefine((job, context) => {
  const invalid = (message: string) => context.addIssue({ code: 'custom', message });
  for (const value of [job.id, job.contentHash, job.dataVersion, ...job.candidateIds]) {
    if (!identifier.safeParse(value).success) invalid(t('errors.recordIdentifier'));
  }
  if (!job.title.trim()) invalid(t('errors.jobTitleRequired'));
  if (
    !timestamp.safeParse(job.createdAt).success ||
    !timestamp.safeParse(job.updatedAt).success ||
    job.updatedAt < job.createdAt
  )
    invalid(t('errors.recordTime'));
  if (job.sourceUrl) {
    try {
      const url = new URL(job.sourceUrl);
      if (
        job.sourceUrl.length > 2048 ||
        /[\u0000-\u0020\u007f]/.test(job.sourceUrl) ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password
      )
        invalid(t('errors.sourceHttps'));
    } catch {
      invalid(t('errors.sourceUrl'));
    }
  }
  if ((job.mode === 'jev' || job.mode === 'codex') && !job.jev) invalid(t('errors.modelMissing'));
  if (job.mode === 'qwen' && (!job.qwen || !job.local)) invalid(t('errors.modelMissing'));
  if (
    (job.local && job.mode !== 'local' && job.mode !== 'qwen') ||
    (job.qwen && job.mode !== 'qwen') ||
    (job.mode === 'qwen' && job.jev)
  )
    invalid(t('errors.modelRange'));
  const decisions = job.jev
    ? [job.jev.occupation, job.jev.sponsorship, job.jev.workRights, job.jev.residency]
    : [];
  if (job.jev && (job.jev.model.length > 100 || !job.jev.model.trim()))
    invalid(t('errors.modelName'));
  for (const decision of decisions) {
    if (
      !identifier.safeParse(decision.choice).success ||
      Object.keys(decision.probabilities).length > 100 ||
      decision.evidence.length > 100
    )
      invalid(t('errors.modelRange'));
    if (Object.keys(decision.probabilities).some((key) => !identifier.safeParse(key).success))
      invalid(t('errors.modelChoiceId'));
  }
  const requirements = job.jev?.requirements;
  const local = job.local;
  const qwenDecisions = job.qwen
    ? [job.qwen.occupation, job.qwen.sponsorship, job.qwen.workRights, job.qwen.residency].filter(
        (decision) => decision !== undefined,
      )
    : [];
  if (job.qwen) {
    const occupation = job.qwen.occupation;
    if (occupation && !['none', 'unclear', ...job.candidateIds].includes(occupation.choice))
      invalid(t('errors.modelChoiceId'));
    for (const axis of ['sponsorship', 'workRights', 'residency'] as const) {
      const decision = job.qwen[axis];
      if (decision && decision.choice !== 'unclear' && decision.choice !== local?.[axis].choice)
        invalid(t('errors.modelRange'));
    }
    const cited = new Map<string, (typeof qwenDecisions)[number]['evidence'][number]>();
    for (const decision of qwenDecisions) {
      if (new Set(decision.evidence.map((source) => source.id)).size !== decision.evidence.length)
        invalid(t('errors.evidencePosition'));
      for (const [index, source] of decision.evidence.entries()) {
        const previous = cited.get(source.id);
        if (
          (previous &&
            (previous.start !== source.start ||
              previous.end !== source.end ||
              previous.text !== source.text)) ||
          (index > 0 && decision.evidence[index - 1]!.start > source.start)
        )
          invalid(t('errors.evidencePosition'));
        cited.set(source.id, source);
      }
    }
  }
  const segments = [
    ...job.evidence,
    ...decisions.flatMap((decision) => decision.evidence),
    ...qwenDecisions.flatMap((decision) => decision.evidence),
    ...(requirements
      ? [...requirements.skills, ...requirements.experience].map((item) => item.evidence)
      : []),
    ...(requirements?.experienceEstimate?.evidence ?? []),
    ...(local
      ? [
          ...[local.sponsorship, local.workRights, local.residency].flatMap(
            (decision) => decision.evidence,
          ),
          ...[...local.requirements.skills, ...local.requirements.experience].map(
            (item) => item.evidence,
          ),
        ]
      : []),
  ];
  for (const segment of segments) {
    if (
      !identifier.safeParse(segment.id).success ||
      segment.end > 24000 ||
      segment.end <= segment.start ||
      segment.end - segment.start !== segment.text.length
    )
      invalid(t('errors.evidencePosition'));
    if (job.body !== undefined && job.body.slice(segment.start, segment.end) !== segment.text)
      invalid(t('errors.evidenceBody'));
  }
});

// Only remove the retired product demo, never arbitrary jobs with a similar
// title or no URL. The hash identifies the published demo even without its JD.
const retiredDemoHash = '5fb178a10623910a2557fc93210e0ed20a260fe5966031612a842679d15da553';
const retiredDemoDeclaration =
  'This is a synthetic job advertisement created for testing SEEK FILTER. Koru Labs is a fictional employer.';
function isRetiredDemo(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const job = value as Partial<ArchivedJob>;
  return (
    job.title === 'Senior DevOps Engineer' &&
    job.employer === 'Koru Labs · 合成示例' &&
    job.sourceUrl === '' &&
    (job.contentHash === retiredDemoHash ||
      (typeof job.body === 'string' && job.body.startsWith(retiredDemoDeclaration)))
  );
}

async function removeRetiredDemo(db: IDBPDatabase<SeekDB>): Promise<void> {
  const tx = db.transaction(['jobs', 'tasks'], 'readwrite');
  const removed = new Set<string>();
  for (
    let cursor = await tx.objectStore('jobs').openCursor();
    cursor;
    cursor = await cursor.continue()
  ) {
    if (isRetiredDemo(cursor.value)) {
      removed.add(cursor.primaryKey);
      await cursor.delete();
    }
  }
  if (removed.size) {
    for (
      let cursor = await tx.objectStore('tasks').openCursor();
      cursor;
      cursor = await cursor.continue()
    ) {
      const parsed = taskSchema.safeParse(cursor.value);
      if (
        parsed.success &&
        (removed.has(parsed.data.hash) || (parsed.data.jobId && removed.has(parsed.data.jobId)))
      )
        await cursor.delete();
    }
  }
  await tx.done;
}

async function database<T>(operation: (db: IDBPDatabase<SeekDB>) => Promise<T>): Promise<T> {
  const db = await openDB<SeekDB>('seek-filter', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
    },
  });
  try {
    await removeRetiredDemo(db);
    return await operation(db);
  } finally {
    db.close();
  }
}

async function abortTransaction(tx: { abort(): void; done: Promise<void> }): Promise<void> {
  // Synchronous IndexedDB errors do not automatically abort earlier writes.
  try {
    tx.abort();
  } catch {
    /* The transaction may already have aborted. */
  }
  await tx.done.catch(() => undefined);
}

function active(status: TaskStatus): boolean {
  return status === 'running' || status === 'sent';
}
function recoveredTask(task: AnalysisTask, now: number): AnalysisTask {
  if (task.expiresAt > now || !active(task.status)) return task;
  return {
    ...task,
    status: task.status === 'sent' ? 'outcome_unknown' : 'interrupted',
    message: task.status === 'sent' ? t('errors.taskUnconfirmed') : t('errors.localInterrupted'),
  };
}

export async function listJobs(): Promise<ArchivedJob[]> {
  return database(async (db) => {
    const tx = db.transaction('jobs', 'readwrite');
    const jobs: ArchivedJob[] = [];
    const now = Date.now();
    for (let cursor = await tx.store.openCursor(); cursor; cursor = await cursor.continue()) {
      const parsed = storedJobSchema.safeParse(cursor.value);
      if (
        !parsed.success ||
        (!parsed.data.bookmarked && parsed.data.updatedAt <= now - retentionMs)
      )
        await cursor.delete();
      else jobs.push(parsed.data);
    }
    await tx.done;
    return jobs.sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

/** Fresh versioned result lookup. Cache reads never extend the 30-day lifetime. */
export async function getJobById(
  id: string,
  bodyPreference?: { retainBody: boolean; body: string },
): Promise<ArchivedJob | undefined> {
  identifier.parse(id);
  return database(async (db) => {
    const tx = db.transaction('jobs', 'readwrite');
    const parsed = storedJobSchema.safeParse(await tx.store.get(id));
    if (!parsed.success) {
      await tx.store.delete(id);
      await tx.done;
      return undefined;
    }
    const job = parsed.data;
    if (job.updatedAt <= Date.now() - retentionMs) {
      if (!job.bookmarked) await tx.store.delete(id);
      await tx.done;
      return undefined;
    }
    // A manual storage-preference change does not require another provider call.
    // Read and update in one transaction so deletion can never be undone here.
    const next = bodyPreference
      ? storedJobSchema.parse({
          ...job,
          body: bodyPreference.retainBody ? bodyPreference.body : undefined,
        })
      : job;
    if (next.body !== job.body) await tx.store.put(next);
    await tx.done;
    return next;
  });
}

/** Result and completion commit together; a revoked task cannot resurrect data. */
export async function putJob(
  job: ArchivedJob,
  taskId: string,
  signal?: AbortSignal,
): Promise<ArchivedJob> {
  const validJob = storedJobSchema.parse(job);
  if (isRetiredDemo(validJob)) throw new Error(t('errors.demoRemoved'));
  identifier.parse(taskId);
  const stopped = () => new DOMException(t('errors.localStopped'), 'AbortError');
  if (signal?.aborted) throw stopped();
  return database(async (db) => {
    if (signal?.aborted) throw stopped();
    const tx = db.transaction(['jobs', 'tasks'], 'readwrite');
    // An abort may reject done while a request is still awaited below.
    void tx.done.catch(() => undefined);
    let cancelled = false;
    const cancel = () => {
      try {
        tx.abort();
        cancelled = true;
      } catch {
        // A completed transaction remains successful even if cancellation arrives late.
      }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const jobs = tx.objectStore('jobs');
      const tasks = tx.objectStore('tasks');
      const parsed = taskSchema.safeParse(await tasks.get(taskId));
      const task = parsed.success ? recoveredTask(parsed.data, Date.now()) : null;
      // task.hash is the versioned analysis identity; contentHash is the JD identity.
      if (!task || !active(task.status) || task.hash !== validJob.id) {
        if (task && parsed.success && task.status !== parsed.data.status) await tasks.put(task);
        await tx.done;
        throw new Error(t('errors.taskInactive'));
      }
      const previous = storedJobSchema.safeParse(await jobs.get(validJob.id));
      const next = storedJobSchema.parse({
        ...validJob,
        bookmarked: previous.success ? previous.data.bookmarked : validJob.bookmarked,
        createdAt: previous.success ? previous.data.createdAt : validJob.createdAt,
      });
      await jobs.put(next);
      await tasks.put({ ...task, status: 'completed', jobId: next.id });
      await tx.done;
      return next;
    } catch (error) {
      await abortTransaction(tx);
      throw cancelled ? stopped() : error;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  });
}

export async function clearAllJobs(): Promise<void> {
  await database(async (db) => {
    const tx = db.transaction(['jobs', 'tasks'], 'readwrite');
    try {
      await tx.objectStore('jobs').clear();
      await tx.objectStore('tasks').clear();
      await tx.done;
    } catch (error) {
      await abortTransaction(tx);
      throw error;
    }
  });
}

/** Reserve atomically; automatic attempts may never repeat retained task history. */
export async function claimTask(
  id: string,
  hash: string,
  options: { automatic?: boolean } = {},
): Promise<void> {
  identifier.parse(id);
  identifier.parse(hash);
  await database(async (db) => {
    const tx = db.transaction('tasks', 'readwrite');
    const now = Date.now();
    let duplicateId = false;
    let duplicateActiveHash = false;
    let previousAutomaticHash = false;
    for (let cursor = await tx.store.openCursor(); cursor; cursor = await cursor.continue()) {
      if (cursor.primaryKey === id) duplicateId = true;
      const parsed = taskSchema.safeParse(cursor.value);
      if (!parsed.success || parsed.data.startedAt <= now - retentionMs) {
        await cursor.delete();
        continue;
      }
      const task = recoveredTask(parsed.data, now);
      if (task.status !== parsed.data.status) await cursor.update(task);
      if (task.hash === hash && active(task.status)) duplicateActiveHash = true;
      if (task.hash === hash && options.automatic) previousAutomaticHash = true;
    }
    if (duplicateId || duplicateActiveHash || previousAutomaticHash) {
      await tx.done;
      throw new Error(
        duplicateId
          ? t('errors.taskSubmitted')
          : duplicateActiveHash
            ? t('errors.sameJobRunning')
            : t('errors.autoTaskExists'),
      );
    }
    await tx.store.add({ id, hash, status: 'running', startedAt: now, expiresAt: now + 30000 });
    await tx.done;
  });
}

export async function updateTask(id: string, change: Partial<AnalysisTask>): Promise<void> {
  identifier.parse(id);
  const validChange = taskChangeSchema.parse(change);
  await database(async (db) => {
    const tx = db.transaction('tasks', 'readwrite');
    const parsed = taskSchema.safeParse(await tx.store.get(id));
    if (!parsed.success) {
      await tx.done;
      throw new Error(t('errors.taskMissing'));
    }
    const task = recoveredTask(parsed.data, Date.now());
    if (task.status !== parsed.data.status) await tx.store.put(task);
    const nextStatus = validChange.status ?? task.status;
    const invalidTransition =
      (!active(task.status) &&
        (nextStatus !== task.status ||
          (validChange.jobId !== undefined && validChange.jobId !== task.jobId))) ||
      (task.status === 'sent' && nextStatus === 'running') ||
      (active(task.status) && nextStatus === 'completed');
    if (invalidTransition) {
      await tx.done;
      throw new Error(t('errors.taskStateChanged'));
    }
    await tx.store.put(taskSchema.parse({ ...task, ...validChange }));
    await tx.done;
  });
}

export async function listTasks(): Promise<AnalysisTask[]> {
  return database(async (db) => {
    const tx = db.transaction('tasks', 'readwrite');
    const now = Date.now();
    const results: AnalysisTask[] = [];
    for (let cursor = await tx.store.openCursor(); cursor; cursor = await cursor.continue()) {
      const parsed = taskSchema.safeParse(cursor.value);
      if (!parsed.success || parsed.data.startedAt <= now - retentionMs) {
        await cursor.delete();
        continue;
      }
      const task = recoveredTask(parsed.data, now);
      if (task.status !== parsed.data.status) await cursor.update(task);
      results.push(task);
    }
    await tx.done;
    return results.sort((a, b) => b.startedAt - a.startedAt);
  });
}

export function serializeJobs(jobs: ArchivedJob[]): string {
  if (jobs.length > 1000) throw new Error(t('errors.jobBackupCount'));
  const text = JSON.stringify(
    {
      format: 'seek-filter',
      version: 1,
      exportedAt: new Date().toISOString(),
      jobs: jobs.map((job) => storedJobSchema.parse(job)).filter((job) => !isRetiredDemo(job)),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(text).byteLength > maxBackupBytes)
    throw new Error(t('errors.jobBackupSize'));
  return text;
}

export async function importJobs(text: string): Promise<number> {
  if (text.length > maxBackupBytes || new TextEncoder().encode(text).byteLength > maxBackupBytes)
    throw new Error(t('errors.jobBackupSize'));
  const envelope = z.object({
    format: z.literal('seek-filter'),
    version: z.literal(1),
    jobs: z.array(storedJobSchema).max(1000),
  });
  const input = envelope.parse(JSON.parse(text));
  if (new Set(input.jobs.map((job) => job.id)).size !== input.jobs.length)
    throw new Error(t('errors.jobBackupDuplicate'));
  const jobs = input.jobs.filter((job) => !isRetiredDemo(job));
  // Validate all records before any write, then commit the import atomically.
  return database(async (db) => {
    const tx = db.transaction('jobs', 'readwrite');
    try {
      for (const job of jobs) await tx.store.put(job);
      await tx.done;
    } catch (error) {
      await abortTransaction(tx);
      throw error;
    }
    return jobs.length;
  });
}
