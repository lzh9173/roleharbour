import { useEffect, useId, useState, type ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { t } from '../i18n';
import type { JobDraft } from '../core/schema';
import type { LocalReading } from '../core/local-analysis';
import type { LocalDecision } from '../local-engine/types';
import type { EmployerCheck } from '../employers';
import { isPageRuntimeAvailable, sendPageMessage } from '../core/page-runtime';
import { EmployerDetails, EmployerTag } from './EmployerBadge';
import { PrepChecklist, experienceSummary } from './PrepChecklist';
import { evidenceToggleStyle, focusRing, hint, pillStyle, quietButtonStyle } from './styles';
import { isUserAction, openSettings } from './actions';

/** Collapsed jobs survive SEEK re-rendering the detail pane (which remounts the panel). */
const collapsedJobs = new Set<string>();
const pending = <span className="font-normal text-rh-muted">…</span>;
const unreadable = () => <span className="font-normal text-rh-muted">{t('page.unreadable')}</span>;

type Tone = 'positive' | 'caution' | 'quiet';
const toneStyle: Record<Tone, string> = {
  positive: pillStyle.positive,
  caution: pillStyle.warning,
  quiet: 'font-normal text-rh-muted',
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact grid min-w-0 content-start gap-[2px] rounded-[10px] bg-rh-surface px-3 py-[9px]">
      <dt className="text-[11px] leading-[1.5] text-rh-muted">{label}</dt>
      <dd className="m-0 min-w-0 text-[13px] leading-[1.5] font-semibold text-rh-text [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

/** One visa dimension as a coloured verdict; the ad's wording is a hover hint, not more text. */
function VisaFact<C extends string>({
  label,
  decision,
  names,
  tones,
  missing,
}: {
  label: string;
  decision?: LocalDecision<C | 'not_mentioned' | 'conflict'>;
  names: Record<C | 'not_mentioned' | 'conflict', string>;
  tones: Partial<Record<C, Tone>>;
  /** Shown while there is no reading: "…" while loading, "unavailable" after a failure. */
  missing: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!decision) return <Fact label={label}>{missing}</Fact>;
  const { choice } = decision;
  const tone: Tone =
    choice === 'not_mentioned'
      ? 'quiet'
      : choice === 'conflict'
        ? 'caution'
        : (tones[choice as C] ?? 'caution');
  const quote = hint(decision.evidence[0]?.text);
  if (!quote)
    return (
      <Fact label={label}>
        <span className={toneStyle[tone]}>{names[choice]}</span>
      </Fact>
    );
  // The ad's wording is a hover hint and, for keyboard and touch, a click-to-show line.
  return (
    <Fact label={label}>
      <button
        type="button"
        className={`${evidenceToggleStyle} ${toneStyle[tone]}`}
        title={quote}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {names[choice]}
      </button>
      {open && (
        <q className="mt-1 block text-[11px] leading-[1.5] font-normal text-rh-muted">{quote}</q>
      )}
    </Fact>
  );
}

export function InlinePanel({
  draft,
  employerCheck,
}: {
  draft: JobDraft;
  employerCheck?: EmployerCheck;
}) {
  const jobId = draft.sourceUrl;
  const [settingsError, setSettingsError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(() => !collapsedJobs.has(jobId));
  const bodyId = useId();
  // The result is keyed to the request it answers, so a new job or retry shows "…" again
  // without resetting state inside the effect.
  const request = `${attempt}\n${draft.title}\n${draft.body}`;
  const [result, setResult] = useState<{
    request: string;
    reading: LocalReading | null;
    error: string;
  } | null>(null);
  const reading = result?.request === request ? result.reading : null;
  const readError = result?.request === request ? result.error : '';

  useEffect(() => {
    let current = true;
    if (!isPageRuntimeAvailable()) return;
    void sendPageMessage({ type: 'page:local', title: draft.title, body: draft.body }).then(
      (response) => {
        if (!current) return;
        if (response?.ok && response.reading)
          setResult({ request, reading: response.reading as LocalReading, error: '' });
        // The worker's message is already localised; anything else means a stale script.
        else
          setResult({
            request,
            reading: null,
            error: response?.error ?? t('page.refreshExtension'),
          });
      },
      () => {
        if (current) setResult({ request, reading: null, error: t('page.refreshExtension') });
      },
    );
    return () => {
      current = false;
    };
  }, [request, draft.title, draft.body]);

  function toggle() {
    const next = !expanded;
    if (next) collapsedJobs.delete(jobId);
    else collapsedJobs.add(jobId);
    setExpanded(next);
  }

  const experience = reading && experienceSummary(reading.prep);
  const missing = readError ? unreadable() : pending;
  return (
    <section
      className="my-5 overflow-hidden rounded-[14px] border border-rh-border bg-white shadow-[0_5px_22px_#051a4908]"
      aria-label={t('page.panelLabel')}
    >
      <header className="flex items-center justify-between gap-3 border-b border-rh-border px-5 py-3 max-[480px]:px-[14px]">
        <h2 className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-[10px] text-[15px] leading-[1.5] font-bold text-rh-navy">
          RoleHarbour
          <span className="text-[12px] font-medium text-rh-muted">{t('page.overview')}</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={`${quietButtonStyle} inline-flex items-center gap-1 px-2`}
            onClick={(event) => {
              if (isUserAction(event.nativeEvent)) void openSettings().then(setSettingsError);
            }}
          >
            <Settings size={14} aria-hidden="true" />
            {t('page.settings')}
          </button>
          <button
            type="button"
            className={`${quietButtonStyle} px-2`}
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls={bodyId}
          >
            {expanded ? t('page.collapse') : t('page.expand')}
          </button>
        </div>
      </header>
      {settingsError && (
        <p className="m-0 px-5 pt-2 text-[12px] text-rh-warning" role="alert">
          {settingsError}
        </p>
      )}
      <div id={bodyId} hidden={!expanded}>
        {expanded && (
          <div className="panel-body grid gap-5 px-5 pt-4 pb-4 max-[480px]:px-[14px]">
            <dl className="facts m-0 grid grid-cols-3 gap-2 max-[640px]:grid-cols-2">
              <Fact label={t('page.occupationReference')}>
                {reading
                  ? (reading.occupationTitle ?? (
                      <span className="font-normal text-rh-muted">{t('page.undetermined')}</span>
                    ))
                  : missing}
              </Fact>
              <Fact label={t('page.experience')}>
                {experience ? (
                  <span className="inline-flex flex-wrap items-baseline gap-x-2">
                    {experience.label}
                    {experience.estimated && (
                      <span className="experience-estimate-tag rounded-[5px] bg-rh-info-bg px-[6px] py-[1px] text-[11px] font-medium text-rh-link">
                        {t('page.localEstimate')}
                      </span>
                    )}
                  </span>
                ) : (
                  missing
                )}
              </Fact>
              <Fact label={t('page.accreditedList')}>
                <EmployerTag employer={draft.employer} check={employerCheck} />
              </Fact>
              <VisaFact
                label={t('page.visaSupport')}
                decision={reading?.visa.sponsorship}
                names={{
                  supported: t('page.visaSupported'),
                  not_supported: t('page.visaUnsupported'),
                  not_mentioned: t('page.notMentioned'),
                  conflict: t('page.conflicting'),
                }}
                tones={{ supported: 'positive' }}
                missing={missing}
              />
              <VisaFact
                label={t('page.workRights')}
                decision={reading?.visa.workRights}
                names={{
                  required: t('page.required'),
                  not_required: t('page.notRequired'),
                  not_mentioned: t('page.notMentioned'),
                  conflict: t('page.conflicting'),
                }}
                tones={{ not_required: 'positive' }}
                missing={missing}
              />
              <VisaFact
                label={t('page.residency')}
                decision={reading?.visa.residency}
                names={{
                  citizen_or_resident_only: t('page.residencyRestricted'),
                  not_mentioned: t('page.notMentioned'),
                  conflict: t('page.conflicting'),
                }}
                tones={{}}
                missing={missing}
              />
            </dl>
            {readError && (
              <p
                className="m-0 flex flex-wrap items-center gap-x-3 text-[12px] text-rh-warning"
                role="alert"
              >
                {readError}
                <button
                  type="button"
                  className={`${quietButtonStyle} px-2 text-rh-link`}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {t('page.retry')}
                </button>
              </p>
            )}
            {!reading && !readError && (
              <p className="m-0 text-[12px] text-rh-muted" role="status">
                {t('page.prepLoading')}
              </p>
            )}
            {reading && <PrepChecklist prep={reading.prep} />}
            {reading?.prep.truncated && (
              <p className="m-0 text-[12px] text-rh-muted">{t('page.prepTruncated')}</p>
            )}
            <div className="grid gap-1 border-t border-rh-border pt-2 text-[12px]">
              <details className="list-details">
                <summary className={`cursor-pointer py-1 text-rh-muted ${focusRing}`}>
                  {t('page.listDetails')}
                </summary>
                <div className="pt-1 [overflow-wrap:anywhere]">
                  <EmployerDetails check={employerCheck} />
                </div>
              </details>
              <p className="m-0 pt-1 text-[11px] text-rh-muted">{t('page.localNote')}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
