import { getEmployerCacheStatus, refreshEmployerSnapshot } from './index';
import { EMPLOYER_REFRESH_INTERVAL_MS, type EmployerCacheStatus } from './types';

export const EMPLOYER_SNAPSHOT_ALARM = 'roleharbour-employer-snapshot-weekly';
export const EMPLOYER_SNAPSHOT_PERIOD_MINUTES = 10_080;

export interface EmployerSnapshotSchedule {
  refresh(): Promise<EmployerCacheStatus>;
  dispose(): void;
}

/** The background worker owns this schedule. Page lookups remain strictly local. */
export function startEmployerSnapshotSchedule(
  options: { onUpdated?: (status: EmployerCacheStatus) => void | Promise<void> } = {},
): EmployerSnapshotSchedule {
  let disposed = false;
  let running: Promise<{ status: EmployerCacheStatus; attempted: boolean }> | null = null;
  const controller = new AbortController();

  async function ensureAlarm(status?: EmployerCacheStatus): Promise<void> {
    if (disposed) return;
    const now = Date.now();
    // Re-anchor after manual checks too, so an earlier alarm cannot delay a due check
    // for a second week. A small delay avoids an immediate loop if storage is unavailable.
    const when = Math.max(
      now + 60_000,
      (status?.lastAttemptAt ?? now) + EMPLOYER_REFRESH_INTERVAL_MS,
    );
    const existing = await chrome.alarms.get(EMPLOYER_SNAPSHOT_ALARM);
    if (
      disposed ||
      (existing?.periodInMinutes === EMPLOYER_SNAPSHOT_PERIOD_MINUTES &&
        Math.abs(existing.scheduledTime - when) < 1000)
    )
      return;
    await chrome.alarms.create(EMPLOYER_SNAPSHOT_ALARM, {
      when,
      periodInMinutes: EMPLOYER_SNAPSHOT_PERIOD_MINUTES,
    });
  }

  async function run(force: boolean): Promise<{ status: EmployerCacheStatus; attempted: boolean }> {
    let status: EmployerCacheStatus | undefined;
    try {
      const before = await getEmployerCacheStatus();
      if (disposed) return { status: before, attempted: false };
      status = await refreshEmployerSnapshot({ force, signal: controller.signal });
      if (
        !disposed &&
        !status.error &&
        status.recordCount > 0 &&
        status.downloadedAt !== before.downloadedAt
      )
        await Promise.resolve()
          .then(() => options.onUpdated?.(status!))
          .catch(() => undefined);
      return { status, attempted: force || status.lastAttemptAt !== before.lastAttemptAt };
    } finally {
      await ensureAlarm(status).catch(() => undefined);
    }
  }

  function launch(force: boolean): Promise<{ status: EmployerCacheStatus; attempted: boolean }> {
    if (running) return running;
    running = run(force).finally(() => {
      running = null;
    });
    return running;
  }
  function check(): void {
    if (disposed) return;
    // A storage/browser failure must not create an unhandled background rejection.
    void launch(false).catch(() => undefined);
  }
  function onAlarm(alarm: chrome.alarms.Alarm): void {
    if (alarm.name === EMPLOYER_SNAPSHOT_ALARM) check();
  }

  chrome.alarms.onAlarm.addListener(onAlarm);
  chrome.runtime.onStartup.addListener(check);
  chrome.runtime.onInstalled.addListener(check);
  // Runs on every worker initialization as Chrome may discard alarms between sessions.
  check();

  return {
    async refresh() {
      // Share a download already under way, but a gated automatic check must not
      // swallow a user's explicit retry request.
      if (running) {
        const result = await running;
        if (result.attempted || disposed) return result.status;
      }
      return (await launch(true)).status;
    },
    dispose() {
      disposed = true;
      controller.abort();
      chrome.alarms.onAlarm.removeListener(onAlarm);
      chrome.runtime.onStartup.removeListener(check);
      chrome.runtime.onInstalled.removeListener(check);
    },
  };
}
