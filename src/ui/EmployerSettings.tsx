import { RefreshCw, ArrowDownToLine, Upload, Building2 } from 'lucide-react';
import { t, formatDate, formatNumber, type MessageKey } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../core/errors';
import { isWorkerNotice } from '../core/messages';
import { downloadJson } from './download';
import { settingsStyles as styles } from './styles';
import {
  EMPLOYER_BACKUP_MAX_BYTES,
  exportEmployerBackup,
  getEmployerCacheStatus,
  importEmployerBackup,
  type EmployerCacheStatus,
} from '../employers';

type Action = 'refresh' | 'export' | 'import';

function httpsSource(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function EmployerSettings() {
  const [cache, setCache] = useState<EmployerCacheStatus | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<{
    key: MessageKey;
    values?: { error: string };
    error?: boolean;
  } | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const mounted = useRef(false);
  const statusRevision = useRef(0);
  const currentSource = httpsSource(cache?.snapshotSourceUrl);
  useEffect(() => {
    mounted.current = true;
    const readStatus = async () => {
      if (active.current) return;
      const revision = ++statusRevision.current;
      try {
        const status = await getEmployerCacheStatus();
        if (mounted.current && revision === statusRevision.current) {
          setCache(status);
          setReadFailed(false);
          // A newer background failure replaces an older notice from this page.
          if (status.error) setMessage(null);
        }
      } catch {
        if (mounted.current && revision === statusRevision.current) setReadFailed(true);
      }
    };
    const onFocus = () => void readStatus();
    const onUpdated = (input: unknown, sender: chrome.runtime.MessageSender) => {
      if (isWorkerNotice(input, sender, 'employers:updated', chrome.runtime.id)) void readStatus();
    };
    onFocus();
    window.addEventListener('focus', onFocus);
    chrome.runtime.onMessage.addListener(onUpdated);
    return () => {
      mounted.current = false;
      // A counter, not a DOM node: bumping it on unmount is the point.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      statusRevision.current++;
      window.removeEventListener('focus', onFocus);
      chrome.runtime.onMessage.removeListener(onUpdated);
    };
  }, []);
  /** One action at a time; a failure is reported as `failed` with the error or `fallback`. */
  async function run(
    action: Action,
    failed: MessageKey,
    fallback: MessageKey,
    work: () => Promise<void>,
  ) {
    if (!mounted.current || active.current) return;
    active.current = true;
    statusRevision.current++;
    setBusy(action);
    setMessage(null);
    setReadFailed(false);
    try {
      await work();
    } catch (error) {
      if (mounted.current)
        setMessage({
          error: true,
          key: failed,
          values: { error: errorMessage(error, t(fallback)) },
        });
    } finally {
      active.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  const refresh = () =>
    run('refresh', 'settings.employerUpdateFailed', 'settings.tryAgain', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'employers:refresh' });
      if (!mounted.current) return;
      if (!response?.ok || !response.cache)
        throw new Error(response?.error || t('settings.tryAgain'));
      const status: EmployerCacheStatus = response.cache;
      setCache(status);
      setMessage(
        status.error
          ? { key: 'settings.employerUpdateFailed', values: { error: status.error }, error: true }
          : { key: 'settings.employerUpdated' },
      );
    });
  const exportList = () =>
    run('export', 'settings.employerExportFailed', 'settings.tryAgain', async () => {
      const content = await exportEmployerBackup();
      if (!mounted.current) return;
      downloadJson('roleharbour-employers', content);
      setMessage({ key: 'settings.employerExported' });
    });
  const importList = (file: File) =>
    run('import', 'settings.employerImportFailed', 'settings.fileUnreadable', async () => {
      if (file.size > EMPLOYER_BACKUP_MAX_BYTES)
        throw new Error(
          t('settings.employerFileTooLarge', {
            size: formatNumber(EMPLOYER_BACKUP_MAX_BYTES / 1024 / 1024),
          }),
        );
      const content = await file.text();
      if (!mounted.current) return;
      const status = await importEmployerBackup(content);
      if (!mounted.current) return;
      setCache(status);
      setMessage({ key: 'settings.employerUpdated' });
    });
  const notice = message
    ? { text: t(message.key, message.values), error: !!message.error }
    : readFailed
      ? { text: t('settings.employerStatusFailed'), error: true }
      : null;
  return (
    <section className={styles.panel} data-testid="employer-settings">
      <h2 className={styles.heading}>
        <Building2 size={18} aria-hidden="true" />
        {t('settings.employerList')}
      </h2>
      <p className={styles.muted}>{t('settings.employerListHint')}</p>
      <dl className="my-3 grid grid-cols-2 gap-2">
        <div className={styles.stat}>
          <dt className={styles.statLabel}>{t('settings.listDate')}</dt>
          <dd className={styles.statValue}>
            {cache === null
              ? readFailed
                ? '—'
                : '…'
              : cache.snapshotDate
                ? formatDate(cache.snapshotDate)
                : t('settings.noEmployerList')}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>{t('settings.records')}</dt>
          <dd className={styles.statValue}>
            {cache === null ? (readFailed ? '—' : '…') : formatNumber(cache.recordCount)}
          </dd>
        </div>
      </dl>
      {cache?.lastAttemptAt && (
        <p className="m-0 text-[12px] text-rh-muted">
          {t('settings.lastChecked', { date: formatDate(cache.lastAttemptAt) })}
        </p>
      )}
      {cache?.error && !message && (
        <p className="mt-1 mb-0 text-[12px] text-rh-warning">
          {t('settings.autoSyncFailed', { error: cache.error })}
        </p>
      )}
      <div className={`${styles.buttonRow} mt-4`}>
        <button className={styles.primary} disabled={busy !== null} onClick={() => void refresh()}>
          <RefreshCw size={15} aria-hidden="true" />
          {t(busy === 'refresh' ? 'settings.checkingUpdates' : 'settings.checkUpdates')}
        </button>
        <button
          className={styles.secondary}
          disabled={busy !== null || !cache?.recordCount}
          onClick={() => void exportList()}
        >
          <ArrowDownToLine size={15} aria-hidden="true" />
          {busy === 'export' ? t('settings.exporting') : t('settings.exportList')}
        </button>
        <button
          className={styles.secondary}
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={15} aria-hidden="true" />
          {busy === 'import' ? t('settings.importing') : t('settings.importList')}
        </button>
        <input
          ref={fileInput}
          type="file"
          aria-label={t('settings.chooseEmployerBackup')}
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importList(file);
          }}
        />
      </div>
      <p className={notice?.error ? styles.error : styles.success} role="status" aria-live="polite">
        {notice?.text ?? ''}
      </p>
      <details className="mt-1">
        <summary className={styles.summary}>{t('settings.aboutList')}</summary>
        <p className={styles.muted}>
          {t('settings.employerImportHint', {
            size: formatNumber(EMPLOYER_BACKUP_MAX_BYTES / 1024 / 1024),
          })}
        </p>
        <p className={styles.muted}>{t('settings.employerCaveat')}</p>
        {currentSource && (
          <a className={styles.link} href={currentSource} target="_blank" rel="noopener noreferrer">
            {t('settings.employerSource')}
          </a>
        )}
      </details>
    </section>
  );
}
