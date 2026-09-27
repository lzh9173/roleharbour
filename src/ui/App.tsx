import { t, formatNumber, getLocale } from '../i18n';
import {
  getLanguagePreference,
  subscribeLanguage,
  saveLanguagePreference,
  isLanguagePreference,
  locales,
  languageNames,
} from '../i18n/preference';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDownToLine, Check, Database, KeyRound, Trash2, Upload, X } from 'lucide-react';
import type { AnalysisTask } from '../core/schema';
import type { ArchivedJob } from '../storage/archive-schema';
import { clearAllJobs, importJobs, listJobs, listTasks, serializeJobs } from '../storage/db';
import {
  clearApiKey,
  getKeyState,
  saveApiKey,
  getPagePreferences,
  setAutoAnalyze,
  type PagePreferences,
  type KeyState,
} from '../storage/settings';
import { EmployerSettings } from './EmployerSettings';
import { settingsStyles as styles } from './styles';

export function App() {
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguagePreference,
    getLanguagePreference,
  );
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [jobs, setJobs] = useState<ArchivedJob[]>([]);
  const [tasks, setTasks] = useState<AnalysisTask[]>([]);
  const [keyState, setKeyState] = useState<KeyState>({
    configured: false,
    remembered: false,
    consent: false,
  });
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [pagePreferences, setPagePreferences] = useState<PagePreferences>({
    autoAnalyze: false,
    ready: false,
  });
  const [consent, setConsent] = useState(false);
  const configured = keyState.configured;
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [notification, setNotification] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const settingsActive = useRef(false);
  const mounted = useRef(false);
  const refreshRevision = useRef(0);
  const report = (error: unknown) =>
    setNotification({
      text: error instanceof Error ? error.message : t('settings.operationFailed'),
      error: true,
    });
  const notify = (text: string) => setNotification({ text, error: false });
  useEffect(() => {
    document.documentElement.lang = getLocale();
    document.title = t('settings.title');
    setNotification(null);
  }, [language]);
  const refresh = async () => {
    const revision = ++refreshRevision.current;
    try {
      const [records, state, pending, preferences] = await Promise.all([
        listJobs(),
        getKeyState(),
        listTasks(),
        getPagePreferences(),
      ]);
      if (!mounted.current || revision !== refreshRevision.current) return;
      setJobs(records);
      setKeyState(state);
      setTasks(pending);
      setPagePreferences(preferences);
    } catch (error) {
      if (mounted.current && revision === refreshRevision.current) throw error;
    }
  };
  useEffect(() => {
    mounted.current = true;
    const onFocus = () => {
      if (!settingsActive.current)
        void refresh().catch((error) => {
          if (mounted.current && !settingsActive.current) report(error);
        });
    };
    onFocus();
    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      refreshRevision.current++;
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  async function changeSettings(action: () => Promise<void>) {
    // Guard synchronously: consecutive clicks can precede React's next render.
    if (!mounted.current || settingsActive.current) return;
    settingsActive.current = true;
    refreshRevision.current++;
    setSettingsBusy(true);
    setNotification(null);
    try {
      await action();
    } catch (error) {
      if (mounted.current) report(error);
    } finally {
      settingsActive.current = false;
      if (mounted.current) setSettingsBusy(false);
    }
  }
  function exportData() {
    try {
      const blob = new Blob([serializeJobs(jobs)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `roleharbour-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(t('settings.exportedJobs'));
    } catch (error) {
      report(error);
    }
  }
  async function enableKey() {
    if (!consent || !key.trim()) {
      report(new Error(t('settings.keyConsentRequired')));
      return;
    }
    await changeSettings(async () => {
      const allowed = await chrome.permissions.request({ origins: ['https://api.typesafe.ai/*'] });
      if (!allowed) throw new Error(t('settings.apiPermissionRequired'));
      await saveApiKey(key, remember, consent);
      if (!mounted.current) return;
      setKey('');
      await refresh();
      if (mounted.current) notify(t('settings.keySavedNotice'));
    });
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-[1120px] flex-col">
      <main className="flex-1 px-[34px] pb-[34px] max-[740px]:px-[22px] max-[740px]:pb-7 max-[410px]:px-4 max-[410px]:pb-6">
        {notification && (
          <div
            className={`my-4 flex items-center justify-between gap-2.5 rounded-[10px] border px-[15px] py-3 text-[11px] leading-[1.8] ${notification.error ? 'border-rh-danger-border bg-rh-danger-bg text-rh-danger' : 'border-rh-positive-border bg-rh-positive-bg text-rh-positive'}`}
            role={notification.error ? 'alert' : 'status'}
          >
            <span>{notification.text}</span>
            <button
              className={styles.iconButton}
              aria-label={t('settings.dismissNotice')}
              onClick={() => setNotification(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <section
          className="mx-auto max-w-[760px]"
          data-testid="settings-page"
          aria-label={t('settings.title')}
        >
          <h1 className="mt-5 mb-3.5 text-[21px] font-[650]">{t('settings.title')}</h1>
          <p className="mb-4 text-[12px] leading-[1.7] text-rh-muted">
            {t('settings.basicAvailable')}
          </p>
          <section className={styles.panel} data-testid="basic-settings">
            <div className="mb-3 flex items-center justify-between gap-2.5">
              <h2 className={styles.heading}>
                <KeyRound size={19} />
                {t('settings.basic')}
              </h2>
              <span
                className={`rounded-[5px] px-2 py-[5px] text-[9px] leading-[1.4] font-medium whitespace-nowrap max-[410px]:text-[8px] ${configured ? 'bg-rh-positive-bg text-rh-positive' : 'bg-rh-surface text-rh-muted'}`}
              >
                {t(configured ? 'settings.keySaved' : 'settings.notConfigured')}
              </span>
            </div>
            <label className={`${styles.label} mt-3.5`} data-testid="language-setting">
              {t('settings.language')}
              <select
                className={`${styles.field} appearance-auto`}
                value={language}
                disabled={savingLanguage}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!isLanguagePreference(value)) return;
                  setSavingLanguage(true);
                  void saveLanguagePreference(value)
                    .catch(() => report(new Error(t('settings.languageSaveFailed'))))
                    .finally(() => setSavingLanguage(false));
                }}
              >
                <option value="auto">{t('settings.followBrowser')}</option>
                {locales.map((locale) => (
                  <option value={locale} key={locale} lang={locale}>
                    {languageNames[locale]}
                  </option>
                ))}
              </select>
            </label>
            <>
              {!keyState.configured && (
                <ol
                  className="my-3.5 list-decimal rounded-lg bg-rh-surface py-3 pr-3 pl-8 text-[12px] text-rh-link [&>li+li]:mt-1"
                  aria-label={t('settings.getStarted')}
                >
                  <li>
                    <a
                      className={styles.link}
                      href="https://console.typesafe.ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('settings.signIn')}
                    </a>
                  </li>
                  <li>
                    <a
                      className={styles.link}
                      href="https://console.typesafe.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('settings.createKey')}
                    </a>
                  </li>
                  <li>{t('settings.pasteSaveKey')}</li>
                </ol>
              )}
              <label className={styles.label}>
                {t('settings.optionalKey')}
                <input
                  className={styles.field}
                  type="password"
                  disabled={settingsBusy}
                  value={key}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={
                    keyState.configured ? t('settings.replaceKey') : t('settings.pasteKey')
                  }
                />
              </label>
              <label className={styles.checkRow}>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  disabled={settingsBusy}
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="flex-1">
                  {t('settings.rememberKey')}
                  <small className={styles.checkHint}>{t('settings.sessionKeyHint')}</small>
                </span>
              </label>
              <label className={styles.checkRow}>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  disabled={settingsBusy}
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span className="flex-1">{t('settings.consent')}</span>
              </label>
              <div className={styles.buttonRow}>
                <button
                  className={styles.primary}
                  disabled={settingsBusy}
                  onClick={() => {
                    void enableKey();
                  }}
                >
                  <Check size={16} />
                  {t('settings.saveKey')}
                </button>
                <button
                  className={styles.secondary}
                  disabled={settingsBusy || !keyState.configured}
                  onClick={() => {
                    void changeSettings(async () => {
                      await clearApiKey();
                      await refresh();
                      if (mounted.current) notify(t('settings.keyCleared'));
                    });
                  }}
                >
                  {t('settings.clearKey')}
                </button>
              </div>
              {!keyState.configured && <p className={styles.muted}>{t('settings.saveKeyHint')}</p>}
            </>
            <label className={`${styles.checkRow} mb-0 border-t border-rh-border pt-3.5`}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={pagePreferences.autoAnalyze}
                disabled={settingsBusy || (!pagePreferences.ready && !pagePreferences.autoAnalyze)}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  void changeSettings(async () => {
                    const preferences = await setAutoAnalyze(enabled, 'jev');
                    if (mounted.current) setPagePreferences(preferences);
                  });
                }}
              />
              <span className="flex-1">
                {t('settings.autoAnalyze')}
                <small className={styles.checkHint}>
                  {t(
                    pagePreferences.ready
                      ? 'settings.autoAnalyzeHint'
                      : 'settings.autoAnalyzeUnavailable',
                  )}
                </small>
              </span>
            </label>
          </section>
          <details className="group mt-4 mb-3.5 border-t border-rh-border">
            <summary className="cursor-pointer list-none py-[13px] text-[11px] font-semibold text-rh-muted before:inline-block before:w-[17px] before:text-[14px] before:text-rh-muted before:content-['+'] group-open:mb-[3px] group-open:before:content-['−'] focus-visible:outline-3 focus-visible:outline-rh-focus focus-visible:outline-offset-3 [&::-webkit-details-marker]:hidden">
              {t('settings.more')}
            </summary>
            <div className="grid grid-cols-2 items-start gap-4 max-[740px]:grid-cols-1">
              <EmployerSettings />
              <section className={styles.panel}>
                <h2 className={styles.heading}>
                  <Database size={19} />
                  {t('settings.jobBackup')}
                </h2>
                <div className="mt-2.5 mb-[13px] flex items-baseline gap-2.5">
                  <strong className="text-[27px] font-[450] text-rh-link">
                    {formatNumber(jobs.length)}
                  </strong>
                  <span className="mr-2.5 text-[10px] text-rh-muted">
                    {t('settings.savedJobs')}
                  </span>
                  <strong className="text-[27px] font-[450] text-rh-link">
                    {formatNumber(jobs.filter((j) => j.bookmarked).length)}
                  </strong>
                  <span className="mr-2.5 text-[10px] text-rh-muted">
                    {t('settings.bookmarks')}
                  </span>
                </div>
                <p className={styles.muted}>{t('settings.jobRetention')}</p>
                <div className={styles.buttonRow}>
                  <button className={styles.secondary} onClick={exportData} disabled={!jobs.length}>
                    <ArrowDownToLine size={16} />
                    {t('settings.exportBackup')}
                  </button>
                  <button className={styles.secondary} onClick={() => importInput.current?.click()}>
                    <Upload size={16} />
                    {t('settings.importBackup')}
                  </button>
                  <input
                    ref={importInput}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      if (file.size > 5_000_000) {
                        report(new Error(t('settings.backupTooLarge')));
                        return;
                      }
                      void file
                        .text()
                        .then(importJobs)
                        .then(async (count) => {
                          await refresh();
                          notify(t('settings.importedJobs', { count: formatNumber(count) }));
                        })
                        .catch(report);
                    }}
                  />
                </div>
                <div className="mt-7 border-t border-rh-border pt-5">
                  {confirmClear ? (
                    <>
                      <p className="mb-[13px] text-[11px] leading-[1.8] text-rh-danger">
                        {t('settings.clearJobsConfirm')}
                      </p>
                      <div className={styles.buttonRow}>
                        <button
                          className={styles.danger}
                          onClick={() => {
                            void clearAllJobs()
                              .then(async () => {
                                setConfirmClear(false);
                                await refresh();
                                notify(t('settings.jobsCleared'));
                              })
                              .catch(report);
                          }}
                        >
                          {t('settings.confirmClear')}
                        </button>
                        <button className={styles.secondary} onClick={() => setConfirmClear(false)}>
                          {t('settings.cancel')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      className={styles.textDanger}
                      disabled={!jobs.length && !tasks.length}
                      onClick={() => setConfirmClear(true)}
                    >
                      <Trash2 size={14} />
                      {t('settings.clearJobs')}
                    </button>
                  )}
                </div>
              </section>
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
