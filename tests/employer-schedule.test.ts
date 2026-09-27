import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPLOYER_REFRESH_INTERVAL_MS,
  SNAPSHOT_CATALOG_URL,
  SNAPSHOT_ORIGIN,
  getEmployerCacheStatus,
  refreshEmployerSnapshot,
} from '../src/employers';
import {
  EMPLOYER_SNAPSHOT_ALARM,
  EMPLOYER_SNAPSHOT_PERIOD_MINUTES,
  startEmployerSnapshotSchedule,
  type EmployerSnapshotSchedule,
} from '../src/employers/schedule';

const now = Date.parse('2026-09-19T10:00:00Z');
const csvUrl = `${SNAPSHOT_ORIGIN}/snapshots/2026-09-19/employers.csv`;
let schedules: EmployerSnapshotSchedule[];

function event<Args extends unknown[]>() {
  const listeners = new Set<(...args: Args) => void>();
  return {
    addListener: vi.fn((listener: (...args: Args) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (...args: Args) => void) => listeners.delete(listener)),
    fire: (...args: Args) => listeners.forEach((listener) => listener(...args)),
    listeners,
  };
}

function browser() {
  const onAlarm = event<[chrome.alarms.Alarm]>();
  const onStartup = event<[]>();
  const onInstalled = event<[]>();
  let alarm: chrome.alarms.Alarm | undefined;
  const get = vi.fn(async () => alarm);
  const create = vi.fn(async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
    alarm = {
      name,
      scheduledTime: info.when!,
      periodInMinutes: info.periodInMinutes,
      persistAcrossSessions: true,
    };
  });
  vi.stubGlobal('chrome', {
    alarms: { get, create, onAlarm },
    runtime: { onStartup, onInstalled },
  });
  return { get, create, onAlarm, onStartup, onInstalled, alarm: () => alarm };
}

async function snapshot() {
  const csv =
    'employer_name,trading_name,nzbn,expiry_date_of_accreditation,last_verified_at\nAcme Limited,Acme Cloud,9429000000001,2027-01-01,2026-09-19T09:00:00Z\n';
  const bytes = new TextEncoder().encode(csv);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
  const catalog = {
    schema_version: 1,
    snapshots: [
      {
        schema_version: 1,
        snapshot_date: '2026-09-19',
        generated_at: '2026-09-19T09:59:00Z',
        row_count: 1,
        byte_size: bytes.byteLength,
        sha256,
        csv_path: '/snapshots/2026-09-19/employers.csv',
      },
    ],
  };
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(url === SNAPSHOT_CATALOG_URL ? JSON.stringify(catalog) : csv),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

function start(options: Parameters<typeof startEmployerSnapshotSchedule>[0] = {}) {
  const schedule = startEmployerSnapshotSchedule(options);
  schedules.push(schedule);
  return schedule;
}

beforeEach(async () => {
  await deleteDB('seek-filter-employers');
  vi.spyOn(Date, 'now').mockReturnValue(now);
  schedules = [];
});
afterEach(() => {
  for (const schedule of schedules) schedule.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('weekly employer snapshot schedule', () => {
  it('downloads the full snapshot at first worker initialization and creates a weekly alarm', async () => {
    const chrome = browser();
    const fetcher = await snapshot();
    const onUpdated = vi.fn();
    start({ onUpdated });
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledOnce());
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([SNAPSHOT_CATALOG_URL, csvUrl]);
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ recordCount: 1 }));
    expect(chrome.create).toHaveBeenCalledWith(EMPLOYER_SNAPSHOT_ALARM, {
      when: now + EMPLOYER_REFRESH_INTERVAL_MS,
      periodInMinutes: 10_080,
    });
    expect(EMPLOYER_SNAPSHOT_PERIOD_MINUTES).toBe(10_080);
  });

  it('restores a lost alarm without downloading before the persisted weekly due time', async () => {
    const fetcher = await snapshot();
    await refreshEmployerSnapshot();
    vi.mocked(Date.now).mockReturnValue(now + 2 * 86_400_000);
    const chrome = browser();
    start();
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledOnce());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(chrome.alarm()?.scheduledTime).toBe(now + EMPLOYER_REFRESH_INTERVAL_MS);
  });

  it('checks a due snapshot on startup or installation without downloading the same file again', async () => {
    const chrome = browser();
    const fetcher = await snapshot();
    const onUpdated = vi.fn();
    start({ onUpdated });
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledOnce());
    vi.mocked(Date.now).mockReturnValue(now + EMPLOYER_REFRESH_INTERVAL_MS);
    chrome.onStartup.fire();
    chrome.onInstalled.fire();
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      SNAPSHOT_CATALOG_URL,
      csvUrl,
      SNAPSHOT_CATALOG_URL,
    ]);
    expect(onUpdated).toHaveBeenCalledOnce();
    expect(chrome.alarm()?.scheduledTime).toBe(now + 2 * EMPLOYER_REFRESH_INTERVAL_MS);
  });

  it('uses only its named alarm and persists failed attempts for a full week', async () => {
    const chrome = browser();
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    start();
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledOnce());
    expect((await getEmployerCacheStatus()).lastAttemptAt).toBe(now);
    chrome.onAlarm.fire({ name: 'unrelated', scheduledTime: now, persistAcrossSessions: true });
    chrome.onStartup.fire();
    await vi.waitFor(() => expect(chrome.get).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenCalledOnce();
    vi.mocked(Date.now).mockReturnValue(now + EMPLOYER_REFRESH_INTERVAL_MS);
    chrome.onAlarm.fire({
      name: EMPLOYER_SNAPSHOT_ALARM,
      scheduledTime: Date.now(),
      persistAcrossSessions: true,
    });
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(chrome.alarm()?.scheduledTime).toBe(now + 2 * EMPLOYER_REFRESH_INTERVAL_MS);
  });

  it('manual refresh bypasses the weekly gate and moves the next automatic check', async () => {
    const chrome = browser();
    const fetcher = await snapshot();
    const schedule = start();
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledOnce());
    vi.mocked(Date.now).mockReturnValue(now + 86_400_000);
    const result = await schedule.refresh();
    expect(result.error).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(chrome.alarm()?.scheduledTime).toBe(now + 86_400_000 + EMPLOYER_REFRESH_INTERVAL_MS);
  });

  it('manual refresh during a gated startup check still performs one explicit catalog request', async () => {
    const fetcher = await snapshot();
    await refreshEmployerSnapshot();
    const chrome = browser();
    const schedule = start();
    await schedule.refresh();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(chrome.alarm()?.scheduledTime).toBe(now + EMPLOYER_REFRESH_INTERVAL_MS);
  });

  it('keeps the previous local snapshot when a manual update fails and rearms from that attempt', async () => {
    const chrome = browser();
    await snapshot();
    const onUpdated = vi.fn();
    const schedule = start({ onUpdated });
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledOnce());
    vi.mocked(Date.now).mockReturnValue(now + 86_400_000);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await schedule.refresh()).toMatchObject({ recordCount: 1, error: 'offline' });
    expect(onUpdated).toHaveBeenCalledOnce();
    expect(chrome.alarm()?.scheduledTime).toBe(now + 86_400_000 + EMPLOYER_REFRESH_INTERVAL_MS);
  });

  it('disposes listeners without deleting the alarm needed by the next worker', async () => {
    const chrome = browser();
    const fetcher = await snapshot();
    const schedule = start();
    await vi.waitFor(() => expect(chrome.create).toHaveBeenCalledOnce());
    schedule.dispose();
    expect(chrome.onAlarm.listeners.size).toBe(0);
    expect(chrome.onStartup.listeners.size).toBe(0);
    expect(chrome.onInstalled.listeners.size).toBe(0);
    expect(chrome.alarm()?.name).toBe(EMPLOYER_SNAPSHOT_ALARM);
    vi.mocked(Date.now).mockReturnValue(now + EMPLOYER_REFRESH_INTERVAL_MS);
    chrome.onStartup.fire();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
