import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { t } from '../i18n';
import type { JobDraft, ResultMessage, SavedJob } from '../core/schema';
import { occupations } from '../rules';
import type { PagePreferences } from '../storage/settings';
import type { EmployerCheck } from '../employers';
import { RequirementsView } from '../ui/RequirementsView';
import { BasicOverview } from './BasicOverview';
import { EmployerBadge, EmployerDetails } from './EmployerBadge';
import { readSeekDetail } from './seek';
import { buttonStyle, focusRing, primaryButtonStyle, quietButtonStyle } from './styles';
import { isPageRuntimeAvailable, sendPageMessage } from '../core/page-runtime';
import { analysisRetryMessageSchema } from '../core/page-messages';

export function sameSnapshot(a: JobDraft | null, b: JobDraft): boolean {
  return (
    !!a &&
    a.sourceUrl === b.sourceUrl &&
    a.title === b.title &&
    a.body === b.body &&
    a.employer === b.employer &&
    a.location === b.location
  );
}
export function isUserAction(event: { isTrusted: boolean }): boolean {
  return event.isTrusted;
}
export async function openWorkspace(section?: 'settings') {
  const response = await sendPageMessage({
    type: 'page:open-workspace',
    ...(section ? { section } : {}),
  });
  if (!response?.ok) throw new Error(response?.error ?? t('page.openToolbar'));
}

export function InlinePanel({
  draft,
  employerCheck,
}: {
  draft: JobDraft;
  employerCheck?: EmployerCheck;
}) {
  const [job, setJob] = useState<SavedJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [message, setMessage] = useState('');
  const [hasError, setHasError] = useState(false);
  const [allowCloud, setAllowCloud] = useState(false);
  const [preferences, setPreferences] = useState<PagePreferences | null>(null);
  const canAnalyze = !!preferences?.ready && (allowCloud || !!preferences.autoAnalyze);
  const decisions = job?.jev;
  const requirements = decisions?.requirements;
  const [savingAuto, setSavingAuto] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const pending = useRef<string | null>(null);
  const preferencesRevision = useRef(0);
  const preferencesChanging = useRef(false);
  const alive = useRef(true);
  const autoAttempted = useRef(false);
  const runRef = useRef<(automatic?: boolean, force?: boolean) => Promise<void>>(
    async () => undefined,
  );
  const jobId = draft.sourceUrl.split('/').pop()!;

  useEffect(() => {
    const onRetry = (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (
        !alive.current ||
        !isPageRuntimeAvailable() ||
        sender.id !== chrome.runtime.id ||
        sender.tab
      )
        return;
      const parsed = analysisRetryMessageSchema.safeParse(message);
      if (
        parsed.success &&
        parsed.data.requestId === pending.current &&
        sameSnapshot(readSeekDetail(document, jobId), draft)
      )
        setRetryAttempt(parsed.data.attempt);
    };
    const messages = chrome.runtime.onMessage;
    messages?.addListener(onRetry);
    return () => {
      try {
        messages?.removeListener(onRetry);
      } catch {
        // Extension reloads can invalidate the listener API during unmount.
      }
    };
  }, [draft, jobId]);

  useEffect(() => {
    alive.current = true;
    const load = () => {
      if (!alive.current || !isPageRuntimeAvailable() || preferencesChanging.current) return;
      const revision = ++preferencesRevision.current;
      void sendPageMessage({ type: 'page:preferences' })
        .then((response) => {
          if (!alive.current || revision !== preferencesRevision.current) return;
          if (!response?.ok || !response.preferences)
            throw new Error(response?.error ?? t('page.settingsReadError'));
          setPreferences(response.preferences);
        })
        .catch((error) => {
          if (alive.current && revision === preferencesRevision.current) {
            setMessage(error instanceof Error ? error.message : t('page.refreshExtension'));
            setHasError(true);
          }
        });
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      alive.current = false;
      preferencesRevision.current++;
      window.removeEventListener('focus', load);
      if (pending.current && isPageRuntimeAvailable())
        void sendPageMessage({ type: 'page:cancel', requestId: pending.current }).catch(
          () => undefined,
        );
    };
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      clearTimeout(timer);
      if (
        preferences?.autoAnalyze &&
        preferences.ready &&
        !autoAttempted.current &&
        document.visibilityState === 'visible'
      ) {
        timer = setTimeout(() => {
          if (
            !alive.current ||
            !isPageRuntimeAvailable() ||
            autoAttempted.current ||
            pending.current ||
            document.visibilityState !== 'visible'
          )
            return;
          autoAttempted.current = true;
          void runRef.current(true);
        }, 700);
      }
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', start);
    };
  }, [preferences?.autoAnalyze, preferences?.ready]);

  async function run(automatic = false, force = false) {
    if (
      !alive.current ||
      !isPageRuntimeAvailable() ||
      pending.current ||
      !preferences?.ready ||
      !(automatic || allowCloud || preferences.autoAnalyze)
    )
      return;
    if (!sameSnapshot(readSeekDetail(document, jobId), draft)) {
      setMessage(t('page.jobChanged'));
      setHasError(true);
      return;
    }
    const requestId = crypto.randomUUID();
    pending.current = requestId;
    setBusy(true);
    setRetryAttempt(0);
    setMessage('');
    setHasError(false);
    try {
      const surface = new URL(location.href).pathname === '/' ? 'dialog' : 'page';
      const response = (await sendPageMessage({
        type: 'page:analyze',
        requestId,
        draft,
        mode: 'jev',
        surface,
        automatic,
        force,
      })) as ResultMessage;
      if (!alive.current || !sameSnapshot(readSeekDetail(document, jobId), draft)) return;
      if (!response?.ok || !response.job)
        throw new Error(response?.error ?? t('page.refreshConnection'));
      setJob(response.job);
    } catch (error) {
      if (alive.current) {
        setMessage(error instanceof Error ? error.message : t('page.analysisFailed'));
        setHasError(true);
      }
    } finally {
      pending.current = null;
      if (alive.current) setBusy(false);
    }
  }
  runRef.current = run;
  function analyze(event: MouseEvent, force = false) {
    if (isUserAction(event.nativeEvent)) {
      autoAttempted.current = true;
      void run(false, force);
    }
  }
  async function toggleAuto(event: MouseEvent) {
    if (
      !isUserAction(event.nativeEvent) ||
      !alive.current ||
      !isPageRuntimeAvailable() ||
      preferencesChanging.current
    )
      return;
    preferencesChanging.current = true;
    setSavingAuto(true);
    const enabled = !preferences?.autoAnalyze;
    const revision = ++preferencesRevision.current;
    try {
      const response = await sendPageMessage({ type: 'page:auto', enabled, provider: 'jev' });
      if (!alive.current || revision !== preferencesRevision.current) return;
      if (!response?.ok) throw new Error(response?.error ?? t('page.settingsFailed'));
      setPreferences(response.preferences);
      if (enabled) autoAttempted.current = false;
      else if (pending.current)
        await sendPageMessage({ type: 'page:cancel', requestId: pending.current });
    } catch (error) {
      if (!alive.current || revision !== preferencesRevision.current) return;
      setMessage(error instanceof Error ? error.message : t('page.settingsFailed'));
      setHasError(true);
    } finally {
      preferencesChanging.current = false;
      if (alive.current) setSavingAuto(false);
    }
  }
  function manage(event: MouseEvent) {
    if (isUserAction(event.nativeEvent))
      void openWorkspace('settings').catch((error) => {
        if (!alive.current) return;
        setMessage(String(error.message ?? error));
        setHasError(true);
      });
  }
  return (
    <section
      className="panel my-5 overflow-hidden rounded-[14px] border border-rh-border bg-white shadow-[0_5px_22px_#051a4908]"
      aria-label={t('page.panelLabel')}
    >
      <header className="panel-top flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rh-border bg-rh-surface px-5 py-3 max-[480px]:px-[14px]">
        <span className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-[10px] gap-y-1 text-[15px] leading-[1.5] font-bold tracking-normal text-rh-navy">
          RoleHarbour
          <small className="text-[12px] font-medium tracking-normal text-rh-muted">
            {t('page.overview')}
          </small>
        </span>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-1 gap-y-1">
          {preferences && !preferences.ready ? (
            <button
              className={`${buttonStyle} min-h-[32px] max-w-full px-3 whitespace-normal [overflow-wrap:anywhere]`}
              onClick={manage}
            >
              {t('page.configureAi')}
            </button>
          ) : (
            <button
              type="button"
              className={`${primaryButtonStyle} min-h-[32px] max-w-full px-3 whitespace-normal [overflow-wrap:anywhere]`}
              // Keep focus inside SEEK's dialog while a request is pending. Native
              // disabled blurs this button and can make its focus trap scroll away.
              disabled={!canAnalyze}
              aria-disabled={busy || !canAnalyze}
              title={t('page.apiUsage')}
              onClick={(event) => analyze(event, !!job?.jev)}
            >
              {t(job?.jev ? 'page.reanalyse' : 'page.analyse')}
            </button>
          )}
          <button
            className={`${quietButtonStyle} min-h-[32px] max-w-full px-2 whitespace-normal [overflow-wrap:anywhere]`}
            onClick={manage}
          >
            {t('page.settings')}
          </button>
          <button
            className={`${quietButtonStyle} min-h-[32px] max-w-full px-2 whitespace-normal [overflow-wrap:anywhere]`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? t('page.collapse') : t('page.expand')}
          </button>
        </div>
      </header>
      {expanded && (
        <div className="panel-body px-5 pt-5 pb-3 max-[480px]:px-[14px] max-[480px]:pt-4">
          <EmployerBadge employer={draft.employer} check={employerCheck} />
          {busy && (
            <div className="my-3 flex items-center justify-between gap-3 text-[12px]" role="status">
              <span>
                {retryAttempt ? t('page.retrying', { attempt: retryAttempt }) : t('page.analysing')}
              </span>
              <button
                className={`${quietButtonStyle} shrink-0 px-0 whitespace-nowrap`}
                onClick={(event) => {
                  if (isUserAction(event.nativeEvent) && pending.current)
                    void sendPageMessage({
                      type: 'page:cancel',
                      requestId: pending.current,
                    }).catch((error) => {
                      if (!alive.current) return;
                      setMessage(
                        error instanceof Error ? error.message : t('page.refreshExtension'),
                      );
                      setHasError(true);
                    });
                }}
              >
                {t('page.stop')}
              </button>
            </div>
          )}
          {requirements ? (
            <RequirementsView requirements={requirements} />
          ) : (
            <BasicOverview body={draft.body} />
          )}
          {decisions && (
            <section
              className="occupation-visa mt-5 border-t border-rh-border pt-4 text-[13px] leading-[1.6]"
              aria-label={t('page.occupationVisa')}
            >
              <h3 className="mb-2 text-[13px] font-bold text-rh-text">
                {t('page.occupationVisa')}
              </h3>
              <p className="mb-3 text-rh-muted [overflow-wrap:anywhere]">
                {t('page.occupationReference')}
                <strong className="font-semibold text-rh-text">
                  {occupations.find((o) => o.id === job?.jev?.occupation.choice)?.title ??
                    t('page.undetermined')}
                </strong>
              </p>
              <div className="decisions grid gap-2 rounded-[8px] bg-rh-surface px-3 py-[10px] text-[12px]">
                {[
                  [
                    t('page.visaSupport'),
                    {
                      supported: t('page.visaSupported'),
                      not_supported: t('page.visaUnsupported'),
                      not_mentioned: t('page.notMentioned'),
                      conflict: t('page.conflicting'),
                    }[decisions.sponsorship.choice],
                  ],
                  [
                    t('page.workRights'),
                    {
                      required: t('page.required'),
                      not_required: t('page.notRequired'),
                      not_mentioned: t('page.notMentioned'),
                      conflict: t('page.conflicting'),
                    }[decisions.workRights.choice],
                  ],
                  [
                    t('page.residency'),
                    {
                      citizen_or_resident_only: t('page.residencyRestricted'),
                      not_mentioned: t('page.notMentioned'),
                      conflict: t('page.conflicting'),
                    }[decisions.residency.choice],
                  ],
                ].map(([label, value]) => (
                  <span
                    key={label}
                    className="grid grid-cols-[minmax(100px,0.34fr)_minmax(0,1fr)] items-baseline gap-x-4 text-rh-muted"
                  >
                    {label}
                    <b className="font-semibold text-rh-text [overflow-wrap:anywhere]">{value}</b>
                  </span>
                ))}
              </div>
            </section>
          )}
          {hasError && (
            <div
              className="my-3 flex items-center justify-between gap-3 text-[12px] text-rh-warning"
              role="alert"
            >
              <span>{message || t('page.analysisIncomplete')}</span>
              <button
                className={`${buttonStyle} shrink-0 text-[12px]`}
                disabled={busy || !canAnalyze}
                title={t('page.retryUsage')}
                onClick={(event) => analyze(event, !!job?.jev)}
              >
                {t('page.retry')}
              </button>
            </div>
          )}
          {preferences && !preferences.ready && (
            <div className="my-3 flex items-center justify-between gap-3 rounded-[8px] bg-rh-surface p-3 text-[12px] max-[480px]:flex-wrap">
              <span>{t('page.connectPrompt')}</span>
            </div>
          )}
          {preferences?.ready && !preferences.autoAnalyze && (
            <div className="my-3 flex items-center justify-between gap-3 rounded-[8px] bg-rh-surface p-3 text-[12px] max-[480px]:flex-wrap">
              <div>
                <b>{t('page.automaticAnalysis')}</b>
                <p className="mt-1 text-rh-muted">{t('page.automaticConsent')}</p>
              </div>
              <button
                className={`${buttonStyle} shrink-0 text-[12px]`}
                disabled={savingAuto}
                onClick={(event) => void toggleAuto(event)}
              >
                {t('page.agreeEnable')}
              </button>
            </div>
          )}
          {preferences?.ready && !preferences.autoAnalyze && (
            <label className="my-3 flex items-start gap-2 text-[12px] text-rh-muted">
              <input
                type="checkbox"
                className={`mt-[3px] h-[15px] w-[15px] shrink-0 accent-rh-accent ${focusRing}`}
                checked={allowCloud}
                disabled={busy}
                onChange={(event) => {
                  if (isUserAction(event.nativeEvent)) setAllowCloud(event.target.checked);
                }}
              />
              {t('page.analysisConsent')}
            </label>
          )}
          <details className="panel-details mt-4 border-t border-rh-border pt-2 text-[12px]">
            <summary className={`cursor-pointer py-2 text-[12px] text-rh-muted ${focusRing}`}>
              {t('page.listDetails')}
            </summary>
            <div className="pt-1 [overflow-wrap:anywhere]">
              <EmployerDetails check={employerCheck} />
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
