import type { JobRequirements, RequirementLevel, SkillRequirement } from '../core/requirements';
import { formatNumber, t } from '../i18n';
import { requirementTags, type RequirementCategory } from './requirement-tags';

type RequirementItem = Pick<SkillRequirement, 'text' | 'level' | 'evidence'>;
export interface RequirementSummaryInput {
  skills: RequirementItem[];
  experience: Array<RequirementItem & { minYears: number | null; maxYears: number | null }>;
  truncated: boolean;
  experienceEstimate?: JobRequirements['experienceEstimate'];
}

export interface RequirementGroup {
  category: RequirementCategory;
  categoryLabel: string;
  level: RequirementLevel;
  label: string;
  skills: string[];
}
export interface RequirementSummary {
  experience: string;
  experienceEstimated: boolean;
  groups: RequirementGroup[];
}

const groups = [
  ['required', 'page.requirementRequired'],
  ['preferred', 'page.requirementPreferred'],
  ['unclear', 'page.requirementUnclear'],
] as const;
const negation =
  /\b(?:no|not|without|(?:is|are|do|does|ca|could|would|should|was|were|need)n['’]t|won['’]t|cannot)\b/i;
const categories = [
  ['skills', 'page.categorySkillsTools'],
  ['qualifications', 'page.categoryQualifications'],
  ['personal', 'page.categoryPersonalTeam'],
] as const;

/** Keep source wording, including qualifiers, rather than choosing from a skill dictionary. */
function compactPhrase(text: string): string {
  let value = text
    .trim()
    .replace(/^[·•●▪*\-–—\s]+/, '')
    .replace(/\s+/g, ' ');
  if (!negation.test(value)) {
    const contrast = value.match(
      /^(while|whereas|but)\s+([^,;:]+?)\s+(?:is|are)\s+(?:required|essential|preferred|desirable)[.!]?$/i,
    );
    if (
      contrast &&
      !/\b(?:if|when|unless|until|provided)\b/i.test(contrast[2]!) &&
      !(
        contrast[1]!.toLowerCase() === 'while' &&
        /^(?:\S+ing|on|at|in|during|you|we|they)\b/i.test(contrast[2]!)
      )
    )
      value = value.replace(/^(?:while|whereas|but)\s+/i, '');
    // Only remove grammatical framing. Adjectives, licence classes, current/valid
    // conditions and shared list qualifiers are meaningful requirements.
    for (let i = 0; i < 4; i++) {
      const next = value.replace(
        /^(?:(?:has|have)\s+|(?:you (?:will |should |must )?(?:have|bring|need)|(?:must|should) have)\s+|(?:experience (?:with|in)|knowledge of|familiarity with|proficiency in|exposure to|ability to|understanding of)\s+)/i,
        '',
      );
      if (next === value) break;
      value = next;
    }
    value = value.replace(/\s+(?:is|are)\s+(?:required|essential|preferred|desirable)[.!]?$/i, '');
  }
  // Do not truncate: the end of a phrase may contain a mandatory qualification
  // or limit. The source candidate limit and the eight-chip view bound display.
  return value.replace(/[.!?;:,]+$/, '').trim() || text.trim();
}

const experienceNumber =
  '(?:\\d+(?:\\.\\d+)?|(?:twenty|thirty|forty|fifty|sixty)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)';

function pureExperience(text: string): boolean {
  return new RegExp(
    `^(?:(?:at least|a minimum of|minimum(?: of)?|at most|maximum(?: of)?|up to|over|more than|between)\\s+)?${experienceNumber}(?:\\s*(?:[-–—]|to|and)\\s*${experienceNumber})?\\s*(?:\\+|or more)?\\s*(?:years?|yrs?|months?)['’]?(?:\\s+of)?\\s+(?:(?:relevant|prior|previous|professional)\\s+)?experience$`,
    'i',
  ).test(
    compactPhrase(text)
      .replace(/\s+(?:required|essential|preferred|desirable)$/i, '')
      .replace(/\s+with the technologies listed in this role$/i, ''),
  );
}

function equivalentExperience(text: string): string | null {
  if (negation.test(text)) return null;
  const alternative = text.match(
    /\bor (?:equivalent|comparable)(?: practical|relevant)? experience\b/i,
  );
  if (!alternative) return null;
  const durations = [
    ...text.matchAll(
      new RegExp(
        `\\b(?:(?:around|about|approximately|at least|a minimum of|minimum(?: of)?|at most|maximum(?: of)?|up to|over|more than|between)\\s+)?${experienceNumber}(?:\\s*(?:[-–—]|to|and)\\s*${experienceNumber})?\\s*(?:\\+|or more)?\\s*(?:years?|yrs?|months?|mos?)\\b`,
        'gi',
      ),
    ),
  ];
  if (!durations.length) return null;
  const duration = durations[0];
  // Only compact an unqualified role scope. Other conditions remain visible.
  if (
    durations.length !== 1 ||
    !duration ||
    text
      .slice(alternative.index! + alternative[0].length)
      .replace(/[.!?;:,]+$/, '')
      .trim() ||
    /\b(?:if|unless|provided|subject to|certifi\w*|licen[cs]\w*|degree|qualification)\b/i.test(text)
  )
    return compactPhrase(text);
  return `${duration[0]} ${alternative[0]}`;
}

/** Repair only adjoining cached fragments whose exact offsets prove continuity. */
function displayStatements(items: RequirementItem[]): string[] {
  const ordered = [...items].sort((a, b) => a.evidence.start - b.evidence.start);
  const statements: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i]!;
    let text = item.text;
    let end = item.evidence.end;
    while (ordered[i + 1]?.evidence.start === end) {
      const next = ordered[i + 1]!;
      const continuation =
        (/\b(?:Node|Next|Vue|React)\.$/i.test(text) && /^js\b/i.test(next.text)) ||
        (/(?:^|[\s/])\.$/.test(text) && /^NET(?=\b|\d)/i.test(next.text));
      if (!continuation) break;
      text += next.text;
      end = next.evidence.end;
      i++;
    }
    // Some cached candidates contain an entire bullet list. Split only explicit
    // independent bullets, never a shared introduction or an indented continuation.
    const lines = text
      .trim()
      .split(/\n\s*\n|\r?\n/)
      .filter((line) => line.trim());
    const bullet = /^\s*[·•●▪*\-–—]\s+/;
    statements.push(
      ...(lines.length > 1 &&
      lines.every(
        (line) =>
          bullet.test(line) &&
          line.match(/^\s*/)?.[0] === lines[0]!.match(/^\s*/)?.[0] &&
          !/[:,(]$|\b(?:and|or)$/i.test(line.trim()) &&
          !/^(?:either|neither|nor|or)\b/i.test(line.replace(bullet, '')) &&
          (line.match(/\(/g)?.length ?? 0) === (line.match(/\)/g)?.length ?? 0) &&
          !/^(?:not )?(?:required|preferred|essential|desirable)$/i.test(
            line.replace(bullet, '').trim(),
          ),
      )
        ? lines.map((line) => line.replace(bullet, '').trim())
        : [text]),
    );
  }
  return statements;
}

export function summarizeRequirements(requirements: RequirementSummaryInput): RequirementSummary {
  const years = requirements.experience.flatMap(({ minYears, maxYears, level, text }) => {
    const suffix =
      level === 'preferred'
        ? t('page.preferredSuffix')
        : level === 'unclear'
          ? t('page.unclearSuffix')
          : '';
    const row = (label: string) => [{ label: label + suffix, text, suffix }];
    const equivalent = equivalentExperience(text);
    if (equivalent) return row(equivalent);
    const bounds = [minYears, maxYears].filter((value): value is number => value !== null);
    if (!bounds.length) return [];
    // Fractional years from explicit month requirements should not appear as
    // rounded decimals. Keep years when conversion would imply a partial month.
    const useMonths =
      bounds.some((value) => !Number.isInteger(value)) &&
      bounds.every((value) => Math.abs(value * 12 - Math.round(value * 12)) < 1e-7);
    const min = minYears === null ? null : useMonths ? Math.round(minYears * 12) : minYears;
    const max = maxYears === null ? null : useMonths ? Math.round(maxYears * 12) : maxYears;
    const unit = useMonths ? 'month' : 'year';
    const amount = (value: number) => ({ [useMonths ? 'months' : 'years']: formatNumber(value) });
    if (min === null && max !== null)
      return row(t(max === 1 ? `page.${unit}Maximum` : `page.${unit}sMaximum`, amount(max)));
    if (max === null && min !== null)
      return row(t(min === 1 ? `page.${unit}Minimum` : `page.${unit}sMinimum`, amount(min)));
    if (min === null || max === null) return [];
    return row(
      min === max
        ? t(min === 1 ? `page.${unit}Exact` : `page.${unit}sExact`, amount(min))
        : t(useMonths ? 'page.monthsRange' : 'page.yearsRange', {
            min: formatNumber(min),
            max: formatNumber(max),
          }),
    );
  });
  const distinctScopes = new Set(
    years
      .filter((item) => !pureExperience(item.text))
      .map((item) => compactPhrase(item.text).toLowerCase()),
  );
  const preserveScopes =
    new Set(years.map((item) => item.label)).size > 1 || distinctScopes.size > 1;
  const scopedRanges = new Set(
    years.filter((item) => !pureExperience(item.text)).map((item) => item.label),
  );
  const yearLabels = years.flatMap((item) => {
    if (!preserveScopes) return [item.label];
    if (!pureExperience(item.text)) return [compactPhrase(item.text) + item.suffix];
    return scopedRanges.has(item.label) ? [] : [item.label];
  });
  const estimate = years.length ? undefined : requirements.experienceEstimate;
  const estimatedYears = estimate
    ? estimate.maxYears === null
      ? t('page.yearsPlus', { years: formatNumber(estimate.minYears) })
      : t('page.yearsRange', {
          min: formatNumber(estimate.minYears),
          max: formatNumber(estimate.maxYears),
        })
    : t('page.experienceNotStated');
  const tags = groups.flatMap(([level]) =>
    displayStatements(requirements.skills.filter((item) => item.level === level)).flatMap(
      (text) => {
        const experience = requirements.experience.find(
          (item) => compactPhrase(item.text) === compactPhrase(text),
        );
        if (
          experience &&
          ((equivalentExperience(text) &&
            !/\b(?:certifi\w*|licen[cs]\w*|degree|qualification)\b/i.test(text)) ||
            ((experience.minYears !== null || experience.maxYears !== null) &&
              pureExperience(text)))
        )
          return [];
        return requirementTags(compactPhrase(text), level);
      },
    ),
  );
  return {
    experience: [...new Set(yearLabels)].join(' / ') || estimatedYears,
    experienceEstimated: !!estimate,
    groups: categories.flatMap(([category, categoryKey]) =>
      groups.flatMap(([level, labelKey]) => {
        const seen = new Set<string>();
        const skills = tags
          .filter((tag) => tag.level === level && tag.category === category)
          .map((tag) => tag.text)
          .filter((value) => {
            const key = value.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        return skills.length
          ? [{ category, categoryLabel: t(categoryKey), level, label: t(labelKey), skills }]
          : [];
      }),
    ),
  };
}
