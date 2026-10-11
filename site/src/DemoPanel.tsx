/**
 * The extension's job panel, fed the demo reading. The checklist, employer tag and details are
 * the extension's own components; the facts grid and header repeat InlinePanel.tsx, which
 * fetches its reading from the extension worker and so cannot run on a web page.
 */
import { useId, useState, type ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { t } from '../../src/i18n';
import type { LocalDecision } from '../../src/local-engine/types';
import { EmployerDetails, EmployerTag } from '../../src/inpage/EmployerBadge';
import { PrepChecklist, experienceSummary } from '../../src/inpage/PrepChecklist';
import {
  evidencePillToggleStyle,
  focusRing,
  hint,
  pillStyle,
  quietButtonStyle,
} from '../../src/inpage/styles';
import { employerCheck, job, reading } from './demo-data';

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

function VisaFact<C extends string>({
  label,
  decision,
  names,
  tones,
}: {
  label: string;
  decision: LocalDecision<C | 'not_mentioned' | 'conflict'>;
  names: Record<C | 'not_mentioned' | 'conflict', string>;
  tones: Partial<Record<C, Tone>>;
}) {
  const [open, setOpen] = useState(false);
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
  return (
    <Fact label={label}>
      <button
        type="button"
        className={`${evidencePillToggleStyle} ${toneStyle[tone]}`}
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

export function DemoPanel() {
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  const experience = experienceSummary(reading.prep);
  return (
    <section
      className="overflow-hidden rounded-[14px] border border-rh-border bg-white text-[14px] leading-[1.5] text-rh-text shadow-[0_5px_22px_#051a4908]"
      aria-label={t('page.panelLabel')}
    >
      <header className="flex items-center justify-between gap-3 border-b border-rh-border px-5 py-3 max-[480px]:px-[14px]">
        <h3 className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-[10px] text-[15px] leading-[1.5] font-bold text-rh-navy">
          RoleHarbour
          <span className="text-[12px] font-medium text-rh-muted">{t('page.overview')}</span>
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {/* Settings open the extension's own page, which a web page cannot do. */}
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[12px] leading-[1.4] text-rh-muted">
            <Settings size={14} aria-hidden="true" />
            {t('page.settings')}
          </span>
          <button
            type="button"
            className={`${quietButtonStyle} px-2`}
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={bodyId}
          >
            {expanded ? t('page.collapse') : t('page.expand')}
          </button>
        </div>
      </header>
      <div id={bodyId} hidden={!expanded}>
        {expanded && (
          <div className="panel-body grid gap-5 px-5 pt-4 pb-4 max-[480px]:px-[14px]">
            <dl className="facts m-0 grid grid-cols-3 gap-2 max-[640px]:grid-cols-2">
              <Fact label={t('page.occupationReference')}>
                {reading.occupationTitle ?? (
                  <span className="font-normal text-rh-muted">{t('page.undetermined')}</span>
                )}
              </Fact>
              <Fact label={t('page.experience')}>
                <span className="inline-flex flex-wrap items-baseline gap-x-2">
                  {experience.label}
                  {experience.estimated && (
                    <span className="rounded-[5px] bg-rh-info-bg px-[6px] py-[1px] text-[11px] font-medium text-rh-link">
                      {t('page.localEstimate')}
                    </span>
                  )}
                </span>
              </Fact>
              <Fact label={t('page.accreditedList')}>
                <EmployerTag employer={job.employer} check={employerCheck} />
              </Fact>
              <VisaFact
                label={t('page.visaSupport')}
                decision={reading.visa.sponsorship}
                names={{
                  supported: t('page.visaSupported'),
                  not_supported: t('page.visaUnsupported'),
                  not_mentioned: t('page.notMentioned'),
                  conflict: t('page.conflicting'),
                }}
                tones={{ supported: 'positive' }}
              />
              <VisaFact
                label={t('page.workRights')}
                decision={reading.visa.workRights}
                names={{
                  required: t('page.required'),
                  not_required: t('page.notRequired'),
                  not_mentioned: t('page.notMentioned'),
                  conflict: t('page.conflicting'),
                }}
                tones={{ not_required: 'positive' }}
              />
              <VisaFact
                label={t('page.residency')}
                decision={reading.visa.residency}
                names={{
                  citizen_or_resident_only: t('page.residencyRestricted'),
                  not_mentioned: t('page.notMentioned'),
                  conflict: t('page.conflicting'),
                }}
                tones={{}}
              />
            </dl>
            <PrepChecklist prep={reading.prep} />
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
