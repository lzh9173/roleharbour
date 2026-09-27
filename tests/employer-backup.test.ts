import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkEmployers,
  EMPLOYER_BACKUP_MAX_BYTES,
  exportEmployerBackup,
  getEmployerCacheStatus,
  importEmployerBackup,
  importEmployerData,
  refreshEmployerSnapshot,
  SNAPSHOT_CATALOG_URL,
  SNAPSHOT_ORIGIN,
} from '../src/employers';
import { employerDatabase, replaceEmployerSnapshot } from '../src/employers/store';

const now = Date.parse('2026-09-19T10:00:00Z');
const source = {
  sourceDate: '2026-09-19',
  snapshotSourceUrl: `${SNAPSHOT_ORIGIN}/snapshots/2026-09-19/employers.csv`,
  generatedAt: now - 60_000,
};
const record = {
  employerName: 'Acme Limited',
  tradingName: 'Acme Cloud',
  nzbn: '9429000000001',
  expiryDate: '2027-01-01',
  lastVerifiedAt: now - 3_600_000,
};
const backup = (records: unknown[] = [record], metadata: unknown = source) =>
  JSON.stringify({ schema: 'seek-filter-employers', version: 1, metadata, records });

beforeEach(async () => {
  await deleteDB('seek-filter-employers');
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected network call')));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('local employer backups', () => {
  it('round-trips sources and verification times offline, rebuilding normalized names', async () => {
    await importEmployerData(JSON.stringify([record]), { format: 'json', ...source });
    const exported = await exportEmployerBackup();
    expect(JSON.parse(exported)).toEqual({
      schema: 'seek-filter-employers',
      version: 1,
      metadata: source,
      records: [record],
    });
    expect(exported).not.toContain('sha256');
    expect(exported).not.toContain('names');
    expect(exported).not.toContain('sync');
    await deleteDB('seek-filter-employers');
    vi.mocked(Date.now).mockReturnValue(now + 3_600_000);
    const status = await importEmployerBackup(exported);
    expect(status).toMatchObject({
      snapshotDate: source.sourceDate,
      snapshotSourceUrl: source.snapshotSourceUrl,
      downloadedAt: now + 3_600_000,
      recordCount: 1,
    });
    expect(JSON.parse(await exportEmployerBackup()).metadata).toEqual(source);
    const checks = await checkEmployers(['ＡＣＭＥ LTD.', 'Acme Cloud', 'Acme']);
    expect(checks.map(({ status }) => status)).toEqual(['matched', 'matched', 'ambiguous']);
    expect(checks[0]?.checkedAt).toBe(record.lastVerifiedAt);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not invent dates or certification for legacy records with missing expiry', async () => {
    const { expiryDate: _expiry, lastVerifiedAt: _verified, ...legacy } = record;
    await importEmployerBackup(backup([legacy]));
    expect((await checkEmployers(['Acme Ltd']))[0]).toMatchObject({
      status: 'unavailable',
      stale: true,
    });
    expect(JSON.parse(await exportEmployerBackup()).records).toEqual([legacy]);
  });

  it('clears old synchronization errors only after a successful import', async () => {
    await importEmployerBackup(backup());
    await refreshEmployerSnapshot({ force: true });
    expect((await getEmployerCacheStatus()).error).toBe('unexpected network call');
    await importEmployerBackup(backup());
    const status = await getEmployerCacheStatus();
    expect(status.error).toBeUndefined();
    expect(status.lastAttemptAt).toBeNull();
    expect((await checkEmployers(['Acme Ltd']))[0]?.stale).toBe(false);
  });

  it.each([
    { ...source, sourceDate: '2026-09-18' },
    { ...source, generatedAt: -1 },
    { ...source, generatedAt: now + 600_000 },
    { ...source, snapshotSourceUrl: 'http://example.com/data.csv' },
    { ...source, snapshotSourceUrl: 'javascript:alert(1)' },
    { ...source, snapshotSourceUrl: 'https://user:secret@example.com/data.csv' },
    { ...source, snapshotSourceUrl: 'https://example.com/data.csv#fragment' },
    { ...source, sha256: '0'.repeat(64) },
  ])(
    'rejects invalid source metadata without replacing the local snapshot: %j',
    async (metadata) => {
      await importEmployerBackup(backup());
      await expect(
        importEmployerBackup(backup([{ ...record, employerName: 'Replacement' }], metadata)),
      ).rejects.toThrow();
      expect((await checkEmployers(['Acme Ltd']))[0]?.status).toBe('matched');
    },
  );

  it.each([
    { ...record, names: ['unrelated company'] },
    { ...record, accredited: true },
    { ...record, status: 'certified' },
    { ...record, expiryDate: '2026-02-30' },
    { ...record, lastVerifiedAt: now },
    { ...record, lastVerifiedAt: -1 },
  ])('rejects forged or inconsistent records before any write: %j', async (invalid) => {
    await importEmployerBackup(backup());
    await expect(
      importEmployerBackup(backup([{ ...record, nzbn: '9429000000002' }, invalid])),
    ).rejects.toThrow();
    expect((await getEmployerCacheStatus()).recordCount).toBe(1);
    expect((await checkEmployers(['unrelated company']))[0]?.status).toBe('not_found');
  });

  it('rejects duplicate IDs, unknown versions, invalid JSON, too many records and oversized UTF-8', async () => {
    await expect(importEmployerBackup(backup([record, record]))).rejects.toThrow('重复');
    await expect(
      importEmployerBackup(backup().replace('"version":1', '"version":2')),
    ).rejects.toThrow('版本');
    await expect(importEmployerBackup('{')).rejects.toThrow();
    await expect(
      importEmployerBackup(backup(Array.from({ length: 100_001 }, () => ({})))),
    ).rejects.toThrow('格式');
    await expect(
      importEmployerBackup(
        JSON.stringify('中'.repeat(Math.floor(EMPLOYER_BACKUP_MAX_BYTES / 3) + 1)),
      ),
    ).rejects.toThrow('12 MiB');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not export an empty database or a file too large to import', async () => {
    await expect(exportEmployerBackup()).rejects.toThrow('没有雇主名单');
    const largeRecords = Array.from({ length: 4500 }, (_, index) => ({
      ...record,
      nzbn: String(9429000000001 + index),
      employerName: '中'.repeat(500),
      tradingName: '文'.repeat(500),
      names: [],
    }));
    await replaceEmployerSnapshot(largeRecords, {
      ...source,
      count: largeRecords.length,
      importedAt: now,
      sha256: '',
    });
    await expect(exportEmployerBackup()).rejects.toThrow('12 MiB');
  });

  it('rolls back records and metadata together if a write fails after replacement starts', async () => {
    await importEmployerBackup(backup());
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'employers' && (value as typeof record).employerName === 'Reject')
        throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(
      importEmployerBackup(
        backup([
          { ...record, employerName: 'First', nzbn: '9429000000002' },
          { ...record, employerName: 'Reject', nzbn: '9429000000003' },
        ]),
      ),
    ).rejects.toThrow('Storage full');
    expect((await checkEmployers(['Acme Ltd']))[0]?.status).toBe('matched');
    expect((await getEmployerCacheStatus()).recordCount).toBe(1);
  });
});

describe('snapshot import versus in-flight updates', () => {
  it.each(['success', 'failure'] as const)(
    'keeps an import when an older update in another module context finishes with %s',
    async (outcome) => {
      const csv =
        'employer_name,trading_name,nzbn,expiry_date_of_accreditation,last_verified_at\nOld Remote Limited,Remote,9429000000001,2027-01-01,2026-09-19T09:00:00Z\n';
      const bytes = new TextEncoder().encode(csv);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      const catalog = {
        schema_version: 1,
        snapshots: [
          {
            schema_version: 1,
            snapshot_date: source.sourceDate,
            generated_at: new Date(source.generatedAt).toISOString(),
            row_count: 1,
            byte_size: bytes.byteLength,
            sha256: [...new Uint8Array(hash)]
              .map((value) => value.toString(16).padStart(2, '0'))
              .join(''),
            csv_path: '/snapshots/2026-09-19/employers.csv',
          },
        ],
      };
      let finish!: (response: Response) => void;
      const pending = new Promise<Response>((resolve) => {
        finish = resolve;
      });
      const fetcher = vi.fn((url: string) =>
        url === SNAPSHOT_CATALOG_URL
          ? Promise.resolve(new Response(JSON.stringify(catalog)))
          : pending,
      );
      vi.stubGlobal('fetch', fetcher);
      vi.resetModules();
      const otherContext = await import('../src/employers');
      const update = otherContext.refreshEmployerSnapshot({ force: true });
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      await importEmployerBackup(
        backup([{ ...record, employerName: 'Imported Limited', tradingName: 'Imported' }]),
      );
      finish(outcome === 'success' ? new Response(csv) : new Response('failed', { status: 503 }));
      await update;
      expect(
        (await checkEmployers(['Imported Ltd', 'Old Remote Limited'])).map(({ status }) => status),
      ).toEqual(['matched', 'not_found']);
      const status = await getEmployerCacheStatus();
      expect(status.error).toBeUndefined();
      expect(status).toMatchObject({
        lastAttemptAt: null,
        recordCount: 1,
      });
      const db = await employerDatabase();
      expect(await db.get('metadata', 'revision')).toEqual({ revision: 1 });
      db.close();
    },
  );
});
