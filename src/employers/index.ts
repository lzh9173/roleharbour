import { t } from '../i18n';
import { aucklandDate, normalizeEmployerName, parseEmployerData, validDate } from './data';
import { employerDatabase, replaceEmployerSnapshot, snapshotGeneration } from './store';
import { findEmployerAliases } from './aliases';
import { buildEmployerCandidateIndex } from './candidates';
import { readBoundedBody, sha256Hex } from '../core/bytes';
import { errorMessage } from '../core/errors';
import {
  EMPLOYER_REFRESH_INTERVAL_MS,
  EMPLOYER_RETRY_INTERVAL_MS,
  EMPLOYER_BACKUP_MAX_BYTES,
  SNAPSHOT_CATALOG_URL,
  SNAPSHOT_ORIGIN,
  type EmployerCacheStatus,
  type EmployerCheck,
  type EmployerRefreshOptions,
  type EmployerMatch,
  type EmployerRevision,
  type SnapshotMetadata,
  type SyncState,
} from './types';
export * from './types';
export { normalizeEmployerName, parseEmployerData } from './data';

const CATALOG_MAX_BYTES = 256 * 1024;
const SNAPSHOT_MAX_BYTES = 12 * 1024 * 1024;

let refreshInFlight: Promise<EmployerCacheStatus> | null = null;
// Memory only, keyed to one committed snapshot. Any import or refresh, in this or
// another extension context, changes the key; nothing is persisted.
let candidateIndex: { key: string; find: ReturnType<typeof buildEmployerCandidateIndex> } | null =
  null;

async function metadata() {
  const db = await employerDatabase();
  try {
    const tx = db.transaction('metadata');
    const [snapshot, sync] = await Promise.all([tx.store.get('snapshot'), tx.store.get('sync')]);
    return {
      snapshot: snapshot as SnapshotMetadata | undefined,
      sync: sync as SyncState | undefined,
    };
  } finally {
    db.close();
  }
}

export async function getEmployerCacheStatus(): Promise<EmployerCacheStatus> {
  const { snapshot, sync } = await metadata();
  return {
    snapshotDate: snapshot?.sourceDate ?? null,
    downloadedAt: snapshot?.importedAt ?? null,
    recordCount: snapshot?.count ?? 0,
    ...(sync?.lastError ? { error: sync.lastError } : {}),
    snapshotSourceUrl: snapshot?.snapshotSourceUrl ?? null,
    lastAttemptAt: sync?.lastAttemptAt ?? null,
  };
}

async function limitedDownload(
  url: string,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.origin !== SNAPSHOT_ORIGIN || parsed.username || parsed.password)
    throw new Error(t('errors.snapshotDomain'));
  const response = await fetch(url, {
    signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok || !response.body)
    throw new Error(t('errors.snapshotDownload', { status: response.status }));
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new Error(t('errors.snapshotSize'));
  return readBoundedBody(response.body, limit, () => new Error(t('errors.snapshotSize')));
}

interface Release {
  snapshot_date: string;
  generated_at: string;
  row_count: number;
  byte_size: number;
  sha256: string;
  csv_path: string;
  schema_version: number;
}
function latestRelease(value: unknown): Release {
  if (!value || typeof value !== 'object') throw new Error(t('errors.snapshotCatalogue'));
  const catalog = value as Record<string, unknown>;
  if (
    catalog.schema_version !== 1 ||
    !Array.isArray(catalog.snapshots) ||
    !catalog.snapshots.length ||
    catalog.snapshots.length > 1000
  )
    throw new Error(t('errors.snapshotCatalogueVersion'));
  const releases = catalog.snapshots as Release[];
  for (const item of releases) {
    if (
      !item ||
      item.schema_version !== 1 ||
      typeof item.snapshot_date !== 'string' ||
      !validDate(item.snapshot_date) ||
      typeof item.generated_at !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(item.generated_at) ||
      !validDate(item.generated_at.slice(0, 10)) ||
      !Number.isFinite(Date.parse(item.generated_at)) ||
      Date.parse(item.generated_at) > Date.now() + 300_000 ||
      aucklandDate(Date.parse(item.generated_at)) !== item.snapshot_date ||
      item.snapshot_date > aucklandDate(Date.now()) ||
      !Number.isSafeInteger(item.row_count) ||
      item.row_count < 1 ||
      item.row_count > 100_000 ||
      !Number.isSafeInteger(item.byte_size) ||
      item.byte_size < 1 ||
      item.byte_size > SNAPSHOT_MAX_BYTES ||
      typeof item.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      item.csv_path !== `/snapshots/${item.snapshot_date}/employers.csv`
    )
      throw new Error(t('errors.snapshotCatalogueFields'));
  }
  return [...releases].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]!;
}

/** Public downloadable snapshots, verified 2026-09-19 against the publisher's schema/catalog.
 * https://nzaei.zemo.bio/open-data/ — independent dated observations, not a live INZ register.
 * INZ's website lookup endpoint is deliberately not called; employer names never leave this module.
 */
export function refreshEmployerSnapshot(
  options: EmployerRefreshOptions = {},
): Promise<EmployerCacheStatus> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = syncSnapshot(options).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function syncSnapshot(options: EmployerRefreshOptions): Promise<EmployerCacheStatus> {
  const now = Date.now();
  let revision = 0;
  if (options.signal?.aborted) return getEmployerCacheStatus();
  const db = await employerDatabase();
  try {
    const tx = db.transaction('metadata', 'readwrite');
    revision = ((await tx.store.get('revision')) as EmployerRevision | undefined)?.revision ?? 0;
    const previous = (await tx.store.get('sync')) as SyncState | undefined;
    const interval = previous?.lastError
      ? EMPLOYER_RETRY_INTERVAL_MS
      : EMPLOYER_REFRESH_INTERVAL_MS;
    if (!options.force && previous && now - previous.lastAttemptAt < interval) {
      await tx.done;
      return getEmployerCacheStatus();
    }
    // Persist attempts before networking so restarts do not retry in a loop; a failed attempt
    // is retried after the shorter interval instead of waiting a week.
    await tx.store.put({ lastAttemptAt: now, lastError: null }, 'sync');
    await tx.done;
  } finally {
    db.close();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let error: string | null = null;
  try {
    const bytes = await limitedDownload(SNAPSHOT_CATALOG_URL, CATALOG_MAX_BYTES, controller.signal);
    const release = latestRelease(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    const { snapshot } = await metadata();
    if (snapshot && release.snapshot_date < snapshot.sourceDate)
      throw new Error(t('errors.snapshotOlder'));
    if (!snapshot || snapshot.sha256 !== release.sha256) {
      const url = `${SNAPSHOT_ORIGIN}${release.csv_path}`;
      const csv = await limitedDownload(url, release.byte_size, controller.signal);
      if (csv.byteLength !== release.byte_size) throw new Error(t('errors.snapshotFileSize'));
      const checksum = await sha256Hex(csv as BufferSource);
      if (checksum !== release.sha256) throw new Error(t('errors.snapshotChecksum'));
      const records = parseEmployerData(
        new TextDecoder('utf-8', { fatal: true }).decode(csv),
        'csv',
        release.row_count,
      );
      if (
        records.some(
          (record) =>
            !record.expiryDate ||
            record.lastVerifiedAt === undefined ||
            record.lastVerifiedAt > Date.parse(release.generated_at),
        )
      )
        throw new Error(t('errors.snapshotDatesMissing'));
      if (controller.signal.aborted) throw new Error(t('errors.snapshotCancelled'));
      const committedRevision = await replaceEmployerSnapshot(
        records,
        {
          count: records.length,
          sourceDate: release.snapshot_date,
          snapshotSourceUrl: url,
          importedAt: Date.now(),
          generatedAt: Date.parse(release.generated_at),
          sha256: release.sha256,
        },
        { expectedRevision: revision },
      );
      if (committedRevision !== null) revision = committedRevision;
    }
  } catch (cause) {
    error = errorMessage(cause, t('errors.snapshotSync'));
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
  const finalDb = await employerDatabase();
  try {
    const tx = finalDb.transaction('metadata', 'readwrite');
    const currentRevision =
      ((await tx.store.get('revision')) as EmployerRevision | undefined)?.revision ?? 0;
    // A concurrent import/update owns its new metadata, including the cleared sync error.
    if (currentRevision === revision)
      await tx.store.put({ lastAttemptAt: now, lastError: error }, 'sync');
    await tx.done;
  } finally {
    finalDb.close();
  }
  return getEmployerCacheStatus();
}

export async function importEmployerData(
  input: string,
  options: {
    format: 'csv' | 'json';
    sourceDate: string;
    snapshotSourceUrl: string;
    generatedAt: number;
  },
): Promise<EmployerCacheStatus> {
  const source = validateSourceMetadata(options);
  const records = parseEmployerData(input, options.format);
  validateRecordTimes(records, source.generatedAt);
  await replaceEmployerSnapshot(
    records,
    {
      count: records.length,
      ...source,
      importedAt: Date.now(),
      sha256: '',
    },
    { clearSync: true },
  );
  return getEmployerCacheStatus();
}

type BackupSource = Pick<SnapshotMetadata, 'sourceDate' | 'snapshotSourceUrl' | 'generatedAt'>;

function validateSourceMetadata(value: unknown): BackupSource {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(t('errors.importMetadata'));
  const source = value as Record<string, unknown>;
  if (
    typeof source.snapshotSourceUrl !== 'string' ||
    source.snapshotSourceUrl.length > 2000 ||
    typeof source.sourceDate !== 'string' ||
    !validDate(source.sourceDate) ||
    source.sourceDate > aucklandDate(Date.now()) ||
    typeof source.generatedAt !== 'number' ||
    !Number.isSafeInteger(source.generatedAt) ||
    source.generatedAt < 0 ||
    source.generatedAt > Date.now() + 300_000 ||
    aucklandDate(source.generatedAt) !== source.sourceDate
  )
    throw new Error(t('errors.importMetadata'));
  const url = new URL(source.snapshotSourceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error(t('errors.importMetadata'));
  return {
    sourceDate: source.sourceDate,
    snapshotSourceUrl: url.href,
    generatedAt: source.generatedAt,
  };
}

function validateRecordTimes(records: EmployerMatch[], generatedAt: number): void {
  if (
    records.some(
      (record) => record.lastVerifiedAt !== undefined && record.lastVerifiedAt > generatedAt,
    )
  )
    throw new Error(t('errors.verificationAfterSnapshot'));
}

function assertBackupSize(input: string): void {
  if (
    input.length > EMPLOYER_BACKUP_MAX_BYTES ||
    new TextEncoder().encode(input).byteLength > EMPLOYER_BACKUP_MAX_BYTES
  )
    throw new Error(t('errors.employerBackupSize'));
}

function onlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

/** A local, versioned backup. CSV download checksums and internal indexes are not exported. */
export async function exportEmployerBackup(): Promise<string> {
  const db = await employerDatabase();
  try {
    const tx = db.transaction(['employers', 'metadata']);
    const [snapshot, stored] = await Promise.all([
      tx.objectStore('metadata').get('snapshot') as Promise<SnapshotMetadata | undefined>,
      tx.objectStore('employers').getAll(),
    ]);
    await tx.done;
    if (!snapshot || !stored.length) throw new Error(t('errors.employerBackupEmpty'));
    const source = validateSourceMetadata(snapshot);
    const records = stored.map(
      ({ employerName, tradingName, nzbn, expiryDate, lastVerifiedAt }) => ({
        employerName,
        tradingName,
        nzbn,
        ...(expiryDate !== undefined ? { expiryDate } : {}),
        ...(lastVerifiedAt !== undefined ? { lastVerifiedAt } : {}),
      }),
    );
    const recordText = JSON.stringify(records);
    assertBackupSize(recordText);
    parseEmployerData(recordText, 'json', snapshot.count);
    validateRecordTimes(records, source.generatedAt);
    const backup = JSON.stringify({
      schema: 'seek-filter-employers',
      version: 1,
      metadata: source,
      records,
    });
    assertBackupSize(backup);
    return backup;
  } finally {
    db.close();
  }
}

export async function importEmployerBackup(input: string): Promise<EmployerCacheStatus> {
  assertBackupSize(input);
  const backup: unknown = JSON.parse(input);
  if (
    !onlyKeys(backup, ['schema', 'version', 'metadata', 'records']) ||
    backup.schema !== 'seek-filter-employers' ||
    backup.version !== 1 ||
    !onlyKeys(backup.metadata, ['sourceDate', 'snapshotSourceUrl', 'generatedAt']) ||
    !Array.isArray(backup.records) ||
    !backup.records.length ||
    backup.records.length > 100_000
  )
    throw new Error(t('errors.employerBackupFormat'));
  const source = validateSourceMetadata(backup.metadata);
  for (const record of backup.records) {
    if (
      !onlyKeys(record, ['employerName', 'tradingName', 'nzbn', 'expiryDate', 'lastVerifiedAt']) ||
      (record.expiryDate !== undefined &&
        (typeof record.expiryDate !== 'string' || !validDate(record.expiryDate))) ||
      (record.lastVerifiedAt !== undefined &&
        (typeof record.lastVerifiedAt !== 'number' ||
          !Number.isSafeInteger(record.lastVerifiedAt) ||
          record.lastVerifiedAt < 0))
    )
      throw new Error(t('errors.employerBackupFields'));
  }
  // Rebuild the names index from validated public fields, then commit all records and metadata together.
  return importEmployerData(JSON.stringify(backup.records), { format: 'json', ...source });
}

/** Local lookups only: page checks never trigger a download (the worker's schedule does). */
export async function checkEmployers(names: string[]): Promise<EmployerCheck[]> {
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string'))
    throw new Error(t('errors.employerNameInput'));
  if (names.length === 0) return [];
  const db = await employerDatabase();
  const local = new Map<string, EmployerCheck>();
  try {
    // One read transaction keeps names and their source metadata on the same snapshot
    // even when another context completes a refresh during a batch.
    const tx = db.transaction(['employers', 'metadata']);
    const [snapshotValue, syncValue, revisionValue] = await Promise.all([
      tx.objectStore('metadata').get('snapshot'),
      tx.objectStore('metadata').get('sync'),
      tx.objectStore('metadata').get('revision'),
    ]);
    const snapshot = snapshotValue as SnapshotMetadata | undefined;
    const sync = syncValue as SyncState | undefined;
    const indexKey = JSON.stringify([
      snapshotGeneration(),
      (revisionValue as EmployerRevision | undefined)?.revision ?? 0,
      snapshot?.importedAt,
      snapshot?.count,
      snapshot?.sha256,
    ]);
    const result: EmployerCheck[] = [];
    let findCandidates = candidateIndex?.key === indexKey ? candidateIndex.find : undefined;
    for (const query of names) {
      const key = normalizeEmployerName(query);
      // Suggestions expand '&', but exact identities do not. Cache both inputs so
      // a previous suggestion or a distinct legal name cannot supply an exact match.
      const cacheKey = JSON.stringify([key, normalizeEmployerName(query.replace(/&/g, ' and '))]);
      const base: EmployerCheck = {
        query,
        status: 'unavailable',
        matches: [],
        checkedAt: null,
        snapshotSourceUrl: snapshot?.snapshotSourceUrl,
        sourceDate: snapshot?.sourceDate,
      };
      if (key.length < 2 || query.length > 500) {
        result.push({ ...base, note: t('errors.employerNameLength') });
        continue;
      }
      const prior = local.get(cacheKey);
      if (prior) {
        result.push({ ...prior, query });
        continue;
      }
      if (!snapshot) {
        result.push({ ...base, note: sync?.lastError ?? t('errors.snapshotNotDownloaded') });
        continue;
      }
      const records = await tx.objectStore('employers').index('names').getAll(key);
      let matches: EmployerMatch[] = records.map(({ names: _names, ...record }) => record);
      for (const alias of findEmployerAliases(key)) {
        const record = await tx.objectStore('employers').get(alias.nzbn);
        // Both identifiers must agree. Never transfer a parent's match to a subsidiary,
        // invent a missing record, or hide an exact-name collision with another NZBN.
        if (
          record &&
          normalizeEmployerName(record.employerName) ===
            normalizeEmployerName(alias.employerName) &&
          !matches.some((match) => match.nzbn === record.nzbn)
        ) {
          const { names: _names, ...match } = record;
          matches.push({
            ...match,
            aliasMatch: { alias: alias.aliases[0], sourceUrl: alias.sourceUrl },
          });
        }
      }
      let candidateCount = 0;
      if (matches.length === 0 && key.length >= 3 && findEmployerAliases(key).length === 0) {
        // Build inside the same snapshot transaction, then reuse it until the snapshot changes.
        if (!findCandidates) {
          findCandidates = buildEmployerCandidateIndex(await tx.objectStore('employers').getAll());
          candidateIndex = { key: indexKey, find: findCandidates };
        }
        const candidates = findCandidates(query);
        candidateCount = candidates.length;
        matches = candidates.slice(0, 5);
      }
      const verified = matches.map((m) => m.lastVerifiedAt ?? 0);
      const checkedAt = matches.length ? Math.min(...verified) || null : snapshot.generatedAt;
      const resolved: EmployerCheck = {
        ...base,
        matches,
        checkedAt,
        status: matches.length > 1 ? 'ambiguous' : matches.length === 0 ? 'not_found' : 'matched',
        note: t('errors.employerMatchNote'),
      };
      if (matches.length === 0) resolved.note = t('errors.employerNoMatch');
      if (matches.length > 1) resolved.note = t('errors.employerMultipleMatches');
      if (candidateCount) {
        resolved.status = 'ambiguous';
        resolved.note = t('errors.employerCandidates', {
          count: candidateCount,
          shown: matches.length,
        });
      }
      if (
        !candidateCount &&
        matches.length === 1 &&
        (!matches[0]!.expiryDate || matches[0]!.expiryDate! <= aucklandDate(Date.now()))
      ) {
        resolved.status = 'unavailable';
        resolved.note = t('errors.employerExpiry');
      }
      local.set(cacheKey, resolved);
      result.push(resolved);
    }
    await tx.done;
    return result;
  } finally {
    db.close();
  }
}
