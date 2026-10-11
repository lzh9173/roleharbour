import type { ReactNode } from 'react';
import { t } from '../../src/i18n';
import { languageNames, locales } from '../../src/i18n/preference';
import type { EmployerCheck } from '../../src/employers/types';
import { EmployerBadge } from '../../src/inpage/EmployerBadge';
import { pillStyle } from '../../src/inpage/styles';
import type { Copy } from './copy';
import { job, reading } from './demo-data';

// Specimens use the extension's own labels and styles, so each row shows what the panel shows.
const chip =
  'inline-flex items-center rounded-[6px] bg-rh-info-bg px-2 py-[3px] text-[13px] leading-[1.45] font-medium text-rh-link';
const matched: EmployerCheck = {
  query: job.employer,
  status: 'matched',
  matches: [],
  checkedAt: null,
};
const review: EmployerCheck = { ...matched, status: 'ambiguous' };

function Specimen({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-rh-border bg-white px-4 py-3 text-[13px] leading-[1.5]">
      {children}
    </div>
  );
}

function FactValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="grid gap-[2px]">
      <span className="text-[11px] text-rh-muted">{label}</span>
      <span className="text-[13px] font-semibold text-rh-text">{children}</span>
    </span>
  );
}

export function Features({ text }: { text: Copy['features'] }) {
  const tools = reading.prep.entries.filter((entry) => entry.level === 'required').slice(1, 5);
  const rows: Array<[keyof Copy['features']['items'], ReactNode]> = [
    [
      'checklist',
      <Specimen>
        {tools.map((entry) => (
          <span key={entry.terms.join()} className={chip}>
            {entry.terms.join(t('page.prepOr'))}
          </span>
        ))}
      </Specimen>,
    ],
    [
      'visa',
      <Specimen>
        <span className={pillStyle.positive}>{t('page.visaSupported')}</span>
        <span className={pillStyle.warning}>{t('page.residencyRestricted')}</span>
      </Specimen>,
    ],
    [
      'employer',
      <Specimen>
        <div className="grid gap-2">
          <EmployerBadge employer={job.employer} check={matched} />
          <EmployerBadge employer={job.employer} check={review} />
        </div>
      </Specimen>,
    ],
    [
      'occupation',
      <Specimen>
        <FactValue label={t('page.occupationReference')}>{reading.occupationTitle}</FactValue>
      </Specimen>,
    ],
    [
      'experience',
      <Specimen>
        <FactValue label={t('page.experience')}>
          <span className="inline-flex flex-wrap items-baseline gap-x-2">
            {t('page.yearsRange', { min: 1, max: 3 })}
            <span className="rounded-[5px] bg-rh-info-bg px-[6px] py-[1px] text-[11px] font-medium text-rh-link">
              {t('page.localEstimate')}
            </span>
          </span>
        </FactValue>
      </Specimen>,
    ],
    [
      'languages',
      <Specimen>
        {locales.map((locale) => (
          <span key={locale} lang={locale} className={pillStyle.neutral}>
            {languageNames[locale]}
          </span>
        ))}
      </Specimen>,
    ],
  ];
  return (
    <section id="features" className="border-t border-rh-border bg-white">
      <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
        <h2 className="display m-0 max-w-[720px] text-[clamp(32px,4.4vw,48px)] leading-[1.08] font-black tracking-[-0.03em] text-rh-navy">
          {text.title}
        </h2>
        <dl className="mt-12 mb-0 grid">
          {rows.map(([key, specimen]) => (
            <div
              key={key}
              className="grid gap-x-10 gap-y-3 border-t border-rh-border py-7 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-start"
            >
              <dt className="text-[20px] leading-snug font-bold text-rh-navy">
                {text.items[key].name}
              </dt>
              <dd className="m-0 text-[16px] text-rh-text">{text.items[key].body}</dd>
              <dd className="m-0 md:justify-self-end">{specimen}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
