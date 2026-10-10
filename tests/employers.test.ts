import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkEmployers,
  getEmployerCacheStatus,
  importEmployerData,
  normalizeEmployerName,
  parseEmployerData,
  refreshEmployerSnapshot,
  SNAPSHOT_CATALOG_URL,
  SNAPSHOT_ORIGIN,
  EMPLOYER_REFRESH_INTERVAL_MS,
  EMPLOYER_RETRY_INTERVAL_MS,
} from '../src/employers';

const now = Date.parse('2026-09-19T10:00:00Z');
const row = {
  employer_name: 'Acme Limited',
  trading_name: 'Acme Cloud',
  nzbn: '9429000000001',
  expiry_date_of_accreditation: '2027-01-01',
  last_verified_at: '2026-09-19T09:00:00Z',
};
const source = {
  format: 'json' as const,
  sourceDate: '2026-09-19',
  snapshotSourceUrl: `${SNAPSHOT_ORIGIN}/snapshots/2026-09-19/employers.csv`,
  generatedAt: now - 60_000,
};
// Public identity from the alias registry; verification/expiry values are test data.
const bnz = {
  ...row,
  employer_name: 'BANK OF NEW ZEALAND',
  trading_name: 'Bank of New Zealand',
  nzbn: '9429039342188',
};

async function payload(overrides: Record<string, unknown> = {}, record = row) {
  const headers = Object.keys(record);
  const csv = '\uFEFF' + headers.join(',') + '\r\n' + Object.values(record).join(',') + '\r\n';
  const bytes = new TextEncoder().encode(csv);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const sha = [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, '0')).join('');
  const catalog = {
    schema_version: 1,
    snapshots: [
      {
        schema_version: 1,
        snapshot_date: '2026-09-19',
        generated_at: '2026-09-19T09:59:00Z',
        row_count: 1,
        byte_size: bytes.byteLength,
        sha256: sha,
        csv_path: '/snapshots/2026-09-19/employers.csv',
        ...overrides,
      },
    ],
  };
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(url === SNAPSHOT_CATALOG_URL ? JSON.stringify(catalog) : csv),
  );
  vi.stubGlobal('fetch', fetcher);
  return { csv, catalog, fetcher };
}

beforeEach(async () => {
  await deleteDB('seek-filter-employers');
  vi.spyOn(Date, 'now').mockReturnValue(now);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('local employer matching', () => {
  it('resolves sourced aliases against an existing local snapshot without networking', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await importEmployerData(JSON.stringify([bnz]), source);
    const results = await checkEmployers(['BNZ', 'bnz', 'ＢＮＺ', 'B.N.Z.', 'Bank of New Zealand']);
    expect(results.map(({ status }) => status)).toEqual(Array(5).fill('matched'));
    for (const result of results.slice(0, 4)) {
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        employerName: bnz.employer_name,
        nzbn: bnz.nzbn,
        expiryDate: bnz.expiry_date_of_accreditation,
        aliasMatch: { alias: 'BNZ', sourceUrl: expect.stringContaining('https://www.bnz.co.nz/') },
      });
      expect(result.checkedAt).toBe(Date.parse(bnz.last_verified_at));
    }
    expect(results[4]?.matches[0]?.aliasMatch).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires the mapped NZBN and legal name and never fabricates a missing record', async () => {
    expect((await checkEmployers(['BNZ']))[0]?.status).toBe('unavailable');
    for (const record of [
      row,
      { ...bnz, nzbn: row.nzbn },
      { ...bnz, employer_name: 'Synthetic Subsidiary Limited' },
    ]) {
      await importEmployerData(JSON.stringify([record]), source);
      expect((await checkEmployers(['BNZ']))[0]).toMatchObject({
        status: 'not_found',
        matches: [],
      });
    }
  });

  it('does not infer identities from similar names, substrings or unverified initials', async () => {
    await importEmployerData(JSON.stringify([bnz, row]), source);
    const results = await checkEmployers([
      'BNZ Partners',
      'BNZ Investments Limited',
      'BNZZ',
      'ACL',
    ]);
    expect(results.every(({ status }) => status === 'not_found')).toBe(true);
  });

  it('retains exact-name collisions with alias targets and deduplicates the same NZBN', async () => {
    await importEmployerData(JSON.stringify([bnz, { ...row, trading_name: 'BNZ' }]), source);
    const result = (await checkEmployers(['BNZ']))[0]!;
    expect(result.status).toBe('ambiguous');
    expect(result.matches.map(({ nzbn }) => nzbn).sort()).toEqual([row.nzbn, bnz.nzbn].sort());
    await importEmployerData(JSON.stringify([{ ...bnz, trading_name: 'BNZ' }]), source);
    const exact = (await checkEmployers(['BNZ']))[0]!;
    expect(exact.status).toBe('matched');
    expect(exact.matches).toHaveLength(1);
    expect(exact.matches[0]?.aliasMatch).toBeUndefined();
  });

  it.each(['2026-09-18', '2026-09-19', 'unknown'])(
    'preserves the expiry guard for aliases with expiry %s',
    async (expiry) => {
      await importEmployerData(
        JSON.stringify([{ ...bnz, expiry_date_of_accreditation: expiry }]),
        source,
      );
      expect((await checkEmployers(['BNZ']))[0]?.status).toBe('unavailable');
    },
  );

  it('keeps the old verification date of an alias record', async () => {
    await importEmployerData(
      JSON.stringify([{ ...bnz, last_verified_at: '2026-07-27T00:00:00Z' }]),
      source,
    );
    expect((await checkEmployers(['BNZ']))[0]).toMatchObject({
      status: 'matched',
      checkedAt: Date.parse('2026-07-27T00:00:00Z'),
    });
  });

  it('does not fetch or invent a status on default queries before a snapshot is present', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect((await checkEmployers(['Acme Limited']))[0]?.status).toBe('unavailable');
    expect(await getEmployerCacheStatus()).toMatchObject({
      recordCount: 0,
      snapshotDate: null,
      lastAttemptAt: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('confirms whole normalized names and marks shortened names for review without networking', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await importEmployerData(JSON.stringify([row]), source);
    const result = await checkEmployers(['ＡＣＭＥ LTD.', 'Acme Cloud', 'Acme', 'acme ltd']);
    expect(result.map((r) => r.status)).toEqual(['matched', 'matched', 'ambiguous', 'matched']);
    expect(result[0]?.checkedAt).toBe(Date.parse(row.last_verified_at));
    expect(result[2]?.note).toContain('不代表雇主未认证');
    expect(fetcher).not.toHaveBeenCalled();
    expect(normalizeEmployerName('Acme NZ Limited')).not.toBe(
      normalizeEmployerName('Acme Limited'),
    );
  });

  it('reuses the review-candidate index for one snapshot and rebuilds it after a replacement', async () => {
    await importEmployerData(JSON.stringify([row]), source);
    const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const first = await checkEmployers(['Acme']);
    const second = await checkEmployers(['Acme']);
    expect(first[0]?.matches.map((m) => m.nzbn)).toEqual([row.nzbn]);
    expect(second[0]?.matches).toEqual(first[0]?.matches);
    const fullReads = () => getAll.mock.calls.filter((args) => args.length === 0).length;
    expect(fullReads()).toBe(1);

    const replacement = { ...row, employer_name: 'Acme Freight Limited', nzbn: '9429000000002' };
    await importEmployerData(JSON.stringify([replacement]), source);
    const after = await checkEmployers(['Acme']);
    expect(after[0]?.matches.map((m) => m.nzbn)).toEqual([replacement.nzbn]);
    expect(fullReads()).toBe(2);
  });

  it('uses an old local snapshot without a network check after more than a week by default', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await importEmployerData(JSON.stringify([row]), source);
    vi.mocked(Date.now).mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);

    expect((await checkEmployers(['Acme Ltd']))[0]).toMatchObject({
      status: 'matched',
      checkedAt: Date.parse(row.last_verified_at),
    });
    expect((await getEmployerCacheStatus()).lastAttemptAt).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires review if an exact legal/trading name belongs to multiple NZBNs', async () => {
    await importEmployerData(
      JSON.stringify([
        row,
        {
          ...row,
          employer_name: 'Other Limited',
          trading_name: row.employer_name,
          nzbn: '9429000000002',
        },
      ]),
      source,
    );
    expect((await checkEmployers(['Acme Limited']))[0]?.status).toBe('ambiguous');
  });

  it('reports the per-record verification date rather than the snapshot date', async () => {
    await importEmployerData(
      JSON.stringify([{ ...row, last_verified_at: '2026-07-27T00:00:00Z' }]),
      source,
    );
    const match = (await checkEmployers(['Acme Ltd']))[0]!;
    expect(match.status).toBe('matched');
    expect(match.checkedAt).toBe(Date.parse('2026-07-27T00:00:00Z'));
  });

  it.each(['2026-09-18', '2026-09-19', '2026-02-30', 'unknown'])(
    'does not certify expiry %s',
    async (expiry) => {
      await importEmployerData(
        JSON.stringify([{ ...row, expiry_date_of_accreditation: expiry }]),
        source,
      );
      expect((await checkEmployers(['Acme Ltd']))[0]?.status).toBe('unavailable');
    },
  );

  it('does not clear the previous database when imported rows fail validation', async () => {
    await importEmployerData(JSON.stringify([row]), source);
    await expect(importEmployerData(JSON.stringify([row, row]), source)).rejects.toThrow('重复');
    expect((await getEmployerCacheStatus()).recordCount).toBe(1);
    expect((await checkEmployers(['Acme Ltd']))[0]?.status).toBe('matched');
  });

  it('parses escaped CSV fields and rejects malformed row boundaries', () => {
    const csv =
      'employer_name,trading_name,nzbn,expiry_date_of_accreditation,last_verified_at\n"Smith, \"\"Cloud\"\" Ltd",Cloud,9429000000001,2027-01-01,2026-09-19T09:00:00Z\n';
    expect(parseEmployerData(csv, 'csv')[0]?.employerName).toBe('Smith, "Cloud" Ltd');
    expect(() => parseEmployerData(csv + 'bad,row\n', 'csv')).toThrow('列数');
    expect(() => parseEmployerData(csv + '"broken', 'csv')).toThrow('未闭合');
  });

  it('rejects impossible calendar dates instead of normalizing verification timestamps', async () => {
    await importEmployerData(JSON.stringify([row]), source);
    await expect(
      importEmployerData(
        JSON.stringify([{ ...row, last_verified_at: '2026-02-30T09:00:00Z' }]),
        source,
      ),
    ).rejects.toThrow();
    expect((await checkEmployers(['Acme Ltd']))[0]?.checkedAt).toBe(
      Date.parse(row.last_verified_at),
    );
  });
});

describe('public snapshot synchronization', () => {
  it('rejects an impossible generated date before downloading a snapshot', async () => {
    const { fetcher } = await payload(
      {
        snapshot_date: '2026-03-02',
        generated_at: '2026-02-30T09:59:00Z',
        csv_path: '/snapshots/2026-03-02/employers.csv',
      },
      { ...row, last_verified_at: '2026-02-28T09:00:00Z' },
    );
    const status = await refreshEmployerSnapshot();
    expect(status.error).toBeTruthy();
    expect(status.recordCount).toBe(0);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('deduplicates concurrent refreshes, checks files, and limits non-forced checks to once per elapsed week', async () => {
    const { fetcher } = await payload();
    await Promise.all([refreshEmployerSnapshot(), refreshEmployerSnapshot()]);
    const results = await checkEmployers(['Acme Ltd', 'Acme Cloud']);
    expect(results.every((r) => r.status === 'matched')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await refreshEmployerSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const status = await getEmployerCacheStatus();
    expect(status).toMatchObject({
      recordCount: 1,
      snapshotDate: '2026-09-19',
      downloadedAt: now,
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      SNAPSHOT_CATALOG_URL,
      source.snapshotSourceUrl,
    ]);
  });

  it('explicit force downloads a changed snapshot even before the automatic weekly check is due', async () => {
    const initial = await payload();
    await refreshEmployerSnapshot();
    expect(initial.fetcher).toHaveBeenCalledTimes(2);

    const updated = await payload({}, { ...row, trading_name: 'Acme Digital' });
    await refreshEmployerSnapshot({ force: true });
    expect((await checkEmployers(['Acme Digital']))[0]?.status).toBe('matched');
    expect(updated.fetcher.mock.calls.map(([url]) => url)).toEqual([
      SNAPSHOT_CATALOG_URL,
      source.snapshotSourceUrl,
    ]);
    expect((await checkEmployers(['Acme Cloud']))[0]?.status).toBe('not_found');
    expect(updated.fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed weekly attempt, preserves old records, and permits explicit retry', async () => {
    await importEmployerData(JSON.stringify([row]), source);
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    await refreshEmployerSnapshot();
    await refreshEmployerSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await checkEmployers(['Acme Ltd']))[0]?.status).toBe('matched');
    expect((await getEmployerCacheStatus()).error).toBe('offline');
    await refreshEmployerSnapshot({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    { sha256: '0'.repeat(64) },
    { row_count: 2 },
    { byte_size: 1 },
    { csv_path: 'https://attacker.example/employers.csv' },
    { schema_version: 2 },
  ])('rejects invalid release metadata/file without destroying cache: %j', async (bad) => {
    await importEmployerData(JSON.stringify([row]), source);
    await payload(bad);
    const result = await refreshEmployerSnapshot();
    expect(result.error).toBeTruthy();
    expect(result.recordCount).toBe(1);
    expect((await checkEmployers(['Acme Ltd']))[0]?.matches[0]?.nzbn).toBe(row.nzbn);
  });

  it('only checks the catalog when its checksum is unchanged', async () => {
    const { fetcher } = await payload();
    await refreshEmployerSnapshot();
    await refreshEmployerSnapshot({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('persists the attempt before fetching and retries a failure after the retry interval, even across a module restart', async () => {
    const fetcher = vi.fn(async () => {
      expect((await getEmployerCacheStatus()).lastAttemptAt).toBe(now);
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetcher);
    await refreshEmployerSnapshot();
    vi.resetModules();
    const restarted = await import('../src/employers');
    vi.mocked(Date.now).mockReturnValue(now + EMPLOYER_RETRY_INTERVAL_MS - 1);
    await restarted.refreshEmployerSnapshot();
    expect(fetcher).toHaveBeenCalledOnce();
    expect((await restarted.getEmployerCacheStatus()).error).toBe('offline');
    vi.mocked(Date.now).mockReturnValue(now + EMPLOYER_RETRY_INTERVAL_MS);
    await restarted.refreshEmployerSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('waits seven elapsed days, regardless of Auckland midnight, and checks at the boundary', async () => {
    const { fetcher } = await payload();
    await refreshEmployerSnapshot();
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-09-19T12:01:00Z'));
    await refreshEmployerSnapshot();
    vi.mocked(Date.now).mockReturnValue(now + EMPLOYER_REFRESH_INTERVAL_MS - 1);
    await refreshEmployerSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.mocked(Date.now).mockReturnValue(now + EMPLOYER_REFRESH_INTERVAL_MS);
    await refreshEmployerSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect((await getEmployerCacheStatus()).lastAttemptAt).toBe(now + EMPLOYER_REFRESH_INTERVAL_MS);
  });

  it('cancels an active download and records the failure without retrying all week', async () => {
    const fetcher = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const work = refreshEmployerSnapshot({ signal: controller.signal });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort();
    const status = await work;
    expect(status.error).toBe('Aborted');
    await refreshEmployerSnapshot();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not start a request when already cancelled', async () => {
    const { fetcher } = await payload();
    const controller = new AbortController();
    controller.abort();
    await refreshEmployerSnapshot({ signal: controller.signal });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await getEmployerCacheStatus()).lastAttemptAt).toBeNull();
  });
});
