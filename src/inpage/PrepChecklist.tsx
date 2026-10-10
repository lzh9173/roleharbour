import { useState, type ReactNode } from 'react';
import { formatNumber, t } from '../i18n';
import type { MessageKey } from '../i18n';
import type {
  PrepChecklist as Checklist,
  PrepEntry,
  PrepKind,
  PrepLevel,
} from '../local-engine/prep';
import type { LocalExperienceEstimate } from '../local-engine/types';
import { evidenceToggleStyle, focusRing, hint, stripBullet } from './styles';

const kinds: Array<[PrepKind, MessageKey]> = [
  ['language', 'page.kindLanguage'],
  ['tool', 'page.kindTool'],
  ['knowledge', 'page.kindKnowledge'],
  ['spoken', 'page.kindSpoken'],
  ['qualification', 'page.kindQualification'],
  ['personal', 'page.kindPersonal'],
];
const bandYears: Record<LocalExperienceEstimate['band'], [number, number | null]> = {
  zero_to_one: [0, 1],
  one_to_three: [1, 3],
  three_to_five: [3, 5],
  five_to_eight: [5, 8],
  eight_plus: [8, null],
};

/** "At least 3 years", "6–12 months": stated durations, in months only when years are fractional. */
function durationLabel(min: number | null, max: number | null): string | null {
  const values = [min, max].filter((value): value is number => value !== null);
  if (!values.length) return null;
  const months = values.some((value) => !Number.isInteger(value));
  const unit = months ? 'month' : 'year';
  const scale = (value: number) => (months ? Math.round(value * 12) : value);
  const amount = (value: number) => ({ [`${unit}s`]: formatNumber(scale(value)) });
  const one = (value: number) => scale(value) === 1;
  if (min !== null && max !== null && min !== max)
    return t(months ? 'page.monthsRange' : 'page.yearsRange', {
      min: formatNumber(scale(min)),
      max: formatNumber(scale(max)),
    });
  if (min !== null && max !== null)
    return t(`page.${unit}${one(min) ? '' : 's'}Exact` as MessageKey, amount(min));
  if (min !== null)
    return t(`page.${unit}${one(min) ? '' : 's'}Minimum` as MessageKey, amount(min));
  return t(`page.${unit}${one(max!) ? '' : 's'}Maximum` as MessageKey, amount(max!));
}

/** Stated experience wins; otherwise the local estimate, labelled as such. */
export function experienceSummary(prep: Checklist): { label: string; estimated: boolean } {
  const stated = [
    ...new Set(
      prep.experience.flatMap((item) => {
        const label = durationLabel(item.minYears, item.maxYears);
        return label ? [label + (item.level === 'preferred' ? t('page.preferredSuffix') : '')] : [];
      }),
    ),
  ];
  if (stated.length) return { label: stated.join(' / '), estimated: false };
  if (!prep.estimate) return { label: t('page.experienceNotStated'), estimated: false };
  const [min, max] = bandYears[prep.estimate.band];
  return {
    label:
      max === null
        ? t('page.yearsPlus', { years: formatNumber(min) })
        : t('page.yearsRange', { min: formatNumber(min), max: formatNumber(max) }),
    estimated: true,
  };
}

const chipBase =
  'inline-flex max-w-full items-center gap-1 rounded-[6px] px-2 py-[3px] text-[13px] leading-[1.45] [overflow-wrap:anywhere]';
const skillChip = `${chipBase} bg-rh-info-bg font-medium text-rh-link`;
const chipStyle: Record<PrepKind, string> = {
  language: skillChip,
  tool: skillChip,
  knowledge: skillChip,
  spoken: skillChip,
  qualification: `${chipBase} bg-rh-positive-bg font-medium text-rh-positive`,
  personal: `${chipBase} bg-rh-surface text-rh-text`,
};

function entryLabel(entry: PrepEntry): string {
  return entry.terms.join(t('page.prepOr'));
}

function Row({
  label,
  quote,
  children,
}: {
  label: string;
  /** The source sentence of the chip the reader opened, shown under the chips. */
  quote?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(96px,0.28fr)_minmax(0,1fr)] items-start gap-x-3 max-[520px]:grid-cols-1 max-[520px]:gap-y-1">
      <span className="pt-[3px] text-[12px] leading-[1.5] text-rh-muted [overflow-wrap:anywhere]">
        {label}
      </span>
      <div className="min-w-0">
        <ul className="m-0 flex min-w-0 list-none flex-wrap gap-[6px] p-0">{children}</ul>
        {quote && (
          <q className="mt-1 block text-[11px] leading-[1.5] text-rh-muted [overflow-wrap:anywhere]">
            {quote}
          </q>
        )}
      </div>
    </div>
  );
}

function Section({ title, entries }: { title: string; entries: PrepEntry[] }) {
  // One opened chip per section: its source sentence shows under that row.
  const [opened, setOpened] = useState<string | null>(null);
  if (!entries.length) return null;
  return (
    <section className="grid gap-[10px]">
      <h3 className="m-0 text-[13px] font-bold text-rh-navy">{title}</h3>
      {kinds.map(([kind, key]) => {
        const items = entries.filter((entry) => entry.kind === kind);
        if (!items.length) return null;
        const chipKey = (entry: PrepEntry, index: number) =>
          `${kind}:${index}:${entry.terms.join('|')}`;
        const openEntry = items.find((entry, index) => chipKey(entry, index) === opened);
        return (
          <Row key={kind} label={t(key)} quote={openEntry && hint(openEntry.source.text)}>
            {items.map((entry, index) => {
              const id = chipKey(entry, index);
              return (
                <li key={id} className={chipStyle[kind]} title={hint(entry.source.text)}>
                  <button
                    type="button"
                    className={evidenceToggleStyle}
                    aria-expanded={opened === id}
                    onClick={() => setOpened((value) => (value === id ? null : id))}
                  >
                    {entryLabel(entry)}
                  </button>
                  {entry.level === 'unclear' && (
                    <span className="text-[11px] font-normal text-rh-muted">
                      {t('page.unclearSuffix')}
                    </span>
                  )}
                </li>
              );
            })}
          </Row>
        );
      })}
    </section>
  );
}

/** The ad's asks as a preparation checklist, built by on-device rules. */
export function PrepChecklist({ prep }: { prep: Checklist }) {
  const atLevel = (levels: PrepLevel[]) =>
    prep.entries.filter((entry) => levels.includes(entry.level));
  return (
    <div className="prep-checklist grid gap-5 text-[13px] leading-[1.6] text-rh-text">
      <Section title={t('page.prepMust')} entries={atLevel(['required', 'unclear'])} />
      {prep.materials.length > 0 && (
        <section className="grid gap-[10px]">
          <h3 className="m-0 text-[13px] font-bold text-rh-navy">{t('page.prepMaterials')}</h3>
          <ul className="m-0 grid list-none gap-[6px] p-0">
            {prep.materials.map((material) => (
              <li
                key={material.key}
                className="rounded-[8px] border border-rh-warning-border bg-rh-warning-bg px-3 py-2 [overflow-wrap:anywhere]"
              >
                <b className="block font-semibold text-rh-warning">{material.label}</b>
                <span className="text-[12px] text-rh-text">
                  {stripBullet(material.source.text)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Section title={t('page.prepPreferred')} entries={atLevel(['preferred'])} />
      {prep.other.length > 0 && (
        <details>
          <summary className={`cursor-pointer text-[13px] font-bold text-rh-navy ${focusRing}`}>
            {t('page.prepOther')} ({formatNumber(prep.other.length)})
          </summary>
          <ul className="mt-2 mb-0 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
            {prep.other.map((item) => (
              <li key={item.id}>
                {stripBullet(item.text)}
                {item.level === 'preferred' && (
                  <span className="text-[12px] text-rh-muted">{t('page.preferredSuffix')}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
