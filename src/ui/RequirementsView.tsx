import { useState } from 'react';
import { formatNumber, t } from '../i18n';
import { summarizeRequirements, type RequirementSummaryInput } from './requirement-summary';

const initialSkillCount = 8;

export function RequirementsView({ requirements }: { requirements?: RequirementSummaryInput }) {
  const [expanded, setExpanded] = useState(false);
  if (!requirements) return null;
  const summary = summarizeRequirements(requirements);
  const total = summary.groups.reduce((count, group) => count + group.skills.length, 0);
  const visibleLimit = Math.max(initialSkillCount, summary.groups.length);
  let remaining = visibleLimit;
  return (
    <div className="requirements mt-3 text-rh-text">
      <div className="experience-line grid grid-cols-[minmax(100px,0.34fr)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-[14px] leading-[1.5]">
        <span className="font-bold text-rh-muted">{t('page.experience')}</span>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <strong className="min-w-0 max-w-full font-bold tracking-normal [overflow-wrap:anywhere]">
            {summary.experience}
          </strong>
          {summary.experienceEstimated && (
            <span className="experience-estimate-tag rounded-[5px] bg-rh-info-bg px-[6px] py-[2px] text-[11px] font-medium text-rh-link">
              {t('page.aiEstimate')}
            </span>
          )}
        </div>
      </div>
      {summary.groups.length > 0 && (
        <div className="mt-4 grid gap-4 border-t border-rh-border pt-4">
          {summary.groups.map((group, index) => {
            // Leave room for each present group, with eight chips across the main view.
            const count = expanded
              ? group.skills.length
              : Math.min(
                  group.skills.length,
                  Math.max(1, remaining - (summary.groups.length - index - 1)),
                );
            remaining -= count;
            return (
              <section className="grid min-w-0 gap-2" key={`${group.category}-${group.level}`}>
                {summary.groups[index - 1]?.category !== group.category && (
                  <h3 className="text-[13px] leading-[1.5] font-bold text-rh-text">
                    {group.categoryLabel}
                  </h3>
                )}
                <div className="grid min-w-0 gap-2">
                  <p className="text-[11px] leading-[1.5] font-medium text-rh-muted">
                    {group.label}
                  </p>
                  <ul className="m-0 flex min-w-0 list-none flex-wrap gap-2 p-0">
                    {group.skills.slice(0, count).map((skill) => (
                      <li
                        className="skill-chip inline-flex max-w-full items-center rounded-[7px] border border-rh-border bg-rh-surface px-[10px] py-[5px] text-[13px] leading-[1.55] font-medium text-rh-text [overflow-wrap:anywhere]"
                        key={skill}
                      >
                        {skill}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}
      {total > visibleLimit && (
        <button
          className="mt-3 min-h-[32px] cursor-pointer rounded-[6px] border-0 bg-transparent px-1 py-1 text-[12px] text-rh-link hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-rh-focus focus-visible:outline-offset-[3px]"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? t('page.fewerSkills')
            : t('page.moreSkills', { count: formatNumber(total - visibleLimit) })}
        </button>
      )}
    </div>
  );
}
