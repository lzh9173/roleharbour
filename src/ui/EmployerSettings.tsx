import { t, formatNumber, type MessageKey } from '../i18n';
import { useEffect, useRef, useState } from 'react';
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
  const [message, setMessage] = useState<{ key: MessageKey; values?: { error: string } } | null>(
    null,
  );
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
        }
      } catch {
        if (mounted.current && revision === statusRevision.current) setReadFailed(true);
      }
    };
    const onFocus = () => void readStatus();
    const onUpdated = (event: unknown) => {
      if (
        event &&
        typeof event === 'object' &&
        'type' in event &&
        event.type === 'employers:updated'
      )
        void readStatus();
    };
    onFocus();
    window.addEventListener('focus', onFocus);
    chrome.runtime.onMessage.addListener(onUpdated);
    return () => {
      mounted.current = false;
      statusRevision.current++;
      window.removeEventListener('focus', onFocus);
      chrome.runtime.onMessage.removeListener(onUpdated);
    };
  }, []);
  function begin(action: Action) {
    if (!mounted.current || active.current) return false;
    active.current = true;
    statusRevision.current++;
    setBusy(action);
    setMessage(null);
    setReadFailed(false);
    return true;
  }
  function finish() {
    active.current = false;
    if (mounted.current) setBusy(null);
  }
  async function refresh() {
    if (!begin('refresh')) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'employers:refresh' });
      if (!mounted.current) return;
      if (!response?.ok || !response.cache)
        throw new Error(response?.error || t('settings.tryAgain'));
      const status: EmployerCacheStatus = response.cache;
      setCache(status);
      setMessage(
        status.error
          ? { key: 'settings.employerUpdateFailed', values: { error: status.error } }
          : { key: 'settings.employerUpdated' },
      );
    } catch (error) {
      if (mounted.current)
        setMessage({
          key: 'settings.employerUpdateFailed',
          values: { error: error instanceof Error ? error.message : t('settings.tryAgain') },
        });
    } finally {
      finish();
    }
  }
  async function exportList() {
    if (!begin('export')) return;
    try {
      const content = await exportEmployerBackup();
      if (!mounted.current) return;
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `roleharbour-employers-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage({ key: 'settings.employerExported' });
    } catch (error) {
      if (mounted.current)
        setMessage({
          key: 'settings.employerExportFailed',
          values: { error: error instanceof Error ? error.message : t('settings.tryAgain') },
        });
    } finally {
      finish();
    }
  }
  async function importList(file: File) {
    if (!begin('import')) return;
    try {
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
    } catch (error) {
      if (mounted.current)
        setMessage({
          key: 'settings.employerImportFailed',
          values: { error: error instanceof Error ? error.message : t('settings.fileUnreadable') },
        });
    } finally {
      finish();
    }
  }
  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>{t('settings.employerList')}</h2>
      <p className={styles.muted}>{t('settings.employerListHint')}</p>
      <p className="my-2 leading-[1.8]">
        {t('settings.employerListDate', {
          date: cache?.snapshotDate ?? t('settings.noEmployerList'),
          count: formatNumber(cache?.recordCount ?? 0),
        })}
      </p>
      <div className={styles.buttonRow}>
        <button
          className={styles.secondary}
          disabled={busy !== null}
          onClick={() => void refresh()}
        >
          {t(busy === 'refresh' ? 'settings.checkingUpdates' : 'settings.checkUpdates')}
        </button>
        <button
          className={styles.secondary}
          disabled={busy !== null || !cache?.recordCount}
          onClick={() => void exportList()}
        >
          {busy === 'export' ? t('settings.exporting') : t('settings.exportList')}
        </button>
        <button
          className={styles.secondary}
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
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
      <p className={styles.muted}>
        {t('settings.employerImportHint', {
          size: formatNumber(EMPLOYER_BACKUP_MAX_BYTES / 1024 / 1024),
        })}
      </p>
      {(message || readFailed) && (
        <p className={styles.notice} role="status">
          {message ? t(message.key, message.values) : t('settings.employerStatusFailed')}
        </p>
      )}
      <p className={styles.muted}>{t('settings.employerCaveat')}</p>
      {currentSource && (
        <a className={styles.link} href={currentSource} target="_blank" rel="noopener noreferrer">
          {t('settings.employerSource')}
        </a>
      )}
    </section>
  );
}
