import type { SourceSegment } from '../providers/jev';

export type RequirementLevel = 'required' | 'preferred' | 'unclear';
export interface SkillRequirement {
  /** Exact source statement, never a generated or inferred skill name. */
  text: string;
  level: RequirementLevel;
  evidence: SourceSegment;
  confidence: number;
}
export interface ExperienceRequirement extends SkillRequirement {
  minYears: number | null;
  maxYears: number | null;
}
export const EXPERIENCE_ESTIMATE_RANGES = {
  zero_to_one: { minYears: 0, maxYears: 1 },
  one_to_three: { minYears: 1, maxYears: 3 },
  three_to_five: { minYears: 3, maxYears: 5 },
  five_to_eight: { minYears: 5, maxYears: 8 },
  eight_plus: { minYears: 8, maxYears: null },
} as const;
export const MIN_EXPERIENCE_ESTIMATE_CONFIDENCE = 0.6;
export type ExperienceEstimateBand = keyof typeof EXPERIENCE_ESTIMATE_RANGES;
export interface ExperienceEstimate {
  band: ExperienceEstimateBand;
  minYears: number;
  maxYears: number | null;
  confidence: number;
  /** Source context for an estimate, not an explicit employer year requirement. */
  evidence: SourceSegment[];
}
export interface JobRequirements {
  skills: SkillRequirement[];
  experience: ExperienceRequirement[];
  experienceEstimate?: ExperienceEstimate;
  truncated: boolean;
}

export const MAX_SKILL_CANDIDATES = 24;
export const MAX_EXPERIENCE_CANDIDATES = 12;
export const MAX_REQUIREMENT_TEXT = 600;
const MAX_QUOTED_REQUIREMENT_CHARS = 12_000;

export interface RequirementCandidates {
  skills: SourceSegment[];
  experience: Array<SourceSegment & { minYears: number | null; maxYears: number | null }>;
  truncated: boolean;
}

const smallNumbers: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
};
const numberWords =
  'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const numberToken = `(?:\\d+(?:\\.\\d+)?|(?:twenty|thirty|forty|fifty|sixty)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|${numberWords})`;
const experienceLanguage =
  /\b(?:experience|experienced|background|worked|working|track record|professional practice)\b|工作经验|相关经验|从业经验/i;
const requirementLanguage =
  /\b(?:must|required|essential|minimum|ability|able to|skills?|knowledge|proficien\w*|familiar\w*|experience|qualifications?|certifi\w*|preferred|desirable|advantage\w*|competenc\w*|licen[cs](?:e[ds]?|ing)|registr(?:ation|ations|ered)|accredit(?:ed|ation)|apprenticeships?|trade[ -]qualified|endorsements?|diplomas?|degrees?|clearances?|practising|practicing|trained|training|memberships?)\b|要求|熟悉|掌握|优先/i;
const heading =
  /^(?:(?:(?:essential|required|preferred|desirable|minimum)\s+)?(?:requirements|skills(?:\s*(?:&|and)\s*experience)?|experience|qualifications|credentials|licen[cs]es|registrations|certifications)|about you|what (?:you(?:'|’)ll (?:bring|need)|we(?:'|’)re looking for)|your (?:skills|experience|qualifications)|benefits|about us|about the (?:company|role))\s*:?$/i;
const durationExpression = new RegExp(
  `\\b(?:(at least|minimum(?: of)?|at most|maximum(?: of)?|up to|(?:no|not) (?:more|less|fewer) than|more than|over|between)\\s+)?(${numberToken})(?:\\s*([-–—]|to|and)\\s*(${numberToken}))?\\s*(\\+|or more)?\\s*\\)?\\s*-?\\s*(years?|yrs?|months?|mos?)\\b`,
  'gi',
);

function numberValue(raw: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 720 ? value : null;
  }
  const parts = raw.toLowerCase().split(/[- ]/);
  if (parts.some((part) => smallNumbers[part] === undefined)) return null;
  const value = parts.reduce((sum, part) => sum + smallNumbers[part]!, 0);
  return value <= 60 ? value : null;
}

function employerTenure(text: string): boolean {
  if (/\b(?:you|applicants?|candidates?|require[ds]?|must|needs?|looking for)\b/i.test(text))
    return false;
  return (
    /\b(?:founded|established)\s+(?:in\s+)?(?:19|20)\d{2}\b/i.test(text) ||
    /\b(?:our|the)\s+(?:company|business|organisation|organization|team)\b.{0,80}\b(?:years?|yrs?|months?|mos?)\b/i.test(
      text,
    ) ||
    new RegExp(
      `\\bwe (?:have|bring) (?:over |more than )?${numberToken} (?:years?|months?)\\b`,
      'i',
    ).test(text)
  );
}

function isExperienceStatement(text: string): boolean {
  if (!experienceLanguage.test(text) || employerTenure(text)) return false;
  // Benefits/tenure are not applicant work experience; a source sentence may still
  // be considered by the independent skills question, which can reject it.
  return !/\b(?:annual leave|parental leave|paid leave|holiday allowance|(?:years?|months?) of service)\b/i.test(
    text,
  );
}

/** Conservative numeric extraction. Ambiguous multi-number statements keep their quote and null bounds. */
export function parseExperienceYears(text: string): {
  minYears: number | null;
  maxYears: number | null;
} {
  if (!isExperienceStatement(text)) return { minYears: null, maxYears: null };
  return parseDurationYears(text);
}

function parseDurationYears(text: string): { minYears: number | null; maxYears: number | null } {
  const unknown = { minYears: null, maxYears: null };
  const matches = [...text.matchAll(durationExpression)];
  if (matches.length !== 1) return unknown;
  const match = matches[0]!;
  // "A three-year degree/course" describes education length even if the sentence
  // also says "experience". An unqualified "three years course development
  // experience" still names work, so require the education noun phrase's article.
  if (
    /\b(?:a|an|the)\s+$/i.test(text.slice(0, match.index)) &&
    /^\s+(?:degree|diploma|(?:training\s+)?course)\b/i.test(
      text.slice(match.index + match[0].length),
    )
  )
    return unknown;
  // Do not accept the recognised tail of an unsupported written number.
  if (
    /\b(?:hundred|thousand|seventy|eighty|ninety)(?:\s+and)?\s*$/i.test(text.slice(0, match.index))
  )
    return unknown;
  const unit = /^mo/i.test(match[6]!) ? 12 : 1;
  const toYears = (value: string): number | null => {
    const number = numberValue(value);
    return number !== null && number / unit <= 60 ? number / unit : null;
  };
  const first = toYears(match[2]!);
  const second = match[4] ? toYears(match[4]) : null;
  if (first === null || (match[4] && second === null)) return unknown;
  const prefix = match[1]?.toLowerCase();
  if (
    /\b(?:about|approximately|around|circa|(?:less|fewer) than)\s*$/i.test(
      text.slice(Math.max(0, match.index! - 24), match.index),
    )
  )
    return unknown;
  if (second !== null) {
    if (
      (match[3]?.toLowerCase() === 'and' && prefix !== 'between') ||
      (prefix && prefix !== 'between')
    )
      return unknown;
    return first <= second ? { minYears: first, maxYears: second } : unknown;
  }
  if (prefix === 'between') return unknown;
  if (/^(?:at most|maximum|up to|(?:no|not) more than)/i.test(match[1] ?? ''))
    return { minYears: null, maxYears: first };
  return { minYears: first, maxYears: null };
}

export function statementSpans(body: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  // Protect balanced examples, including line-wrapped ones. Unclosed parentheses
  // must not turn all later bullets into a single, oversized statement.
  const openings: number[] = [];
  const parentheses: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '(') openings.push(index);
    else if (body[index] === ')' && openings.length) {
      parentheses.push({ start: openings.pop()!, end: index });
    }
  }
  parentheses.sort((a, b) => a.start - b.start);
  // Preserve dots in decimals, .NET, Node.js and abbreviated technologies.
  // Semicolons can share a credential modifier; split them only as qualified clauses.
  const separator = /[\r\n]+|[•●▪]+|[!?](?=\s|$)|\.(?=\s+[A-Z]|\s*$)/g;
  const abbreviation =
    /(?:\b(?:e\.g|i\.e|incl|approx|vs|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|B\.Sc|M\.Sc|Ph\.D)|\b(?:[A-Za-z]\.)+[A-Za-z])\.$/i;
  let start = 0;
  let parenthesisIndex = 0;
  for (const match of body.matchAll(separator)) {
    const position = match.index!;
    while (parentheses[parenthesisIndex] && parentheses[parenthesisIndex]!.end < position)
      parenthesisIndex += 1;
    const parenthesis = parentheses[parenthesisIndex];
    if (parenthesis && parenthesis.start < position && position < parenthesis.end) continue;
    if (
      match[0] === '.' &&
      abbreviation.test(body.slice(Math.max(start, position - 32), position + 1))
    )
      continue;
    const end = position + (/^[.!?;]/.test(match[0]) ? 1 : 0);
    spans.push({ start, end });
    start = position + match[0].length;
  }
  if (start < body.length) spans.push({ start, end: body.length });
  return spans;
}

interface RequirementSpan {
  start: number;
  end: number;
  /** A scoped duration can inherit experience context from its original sentence. */
  experienceContext?: boolean;
}

function splitRequirementClauses(body: string, span: RequirementSpan): RequirementSpan[] {
  const text = body.slice(span.start, span.end);
  // Keep negation and alternatives attached to the statement they qualify.
  if (
    /\b(?:no|not|without|neither|unless|(?:is|are|do|does|ca|could|would|should|was|were|need)n['’]t|won['’]t|either|or(?! more\b))\b/i.test(
      text,
    )
  )
    return [span];
  const delimiters = /[,;]\s*|\s+(?=(?:while|whereas|but|including|of which|and)\b)/gi;
  const polarity = (value: string): 'required' | 'preferred' | undefined => {
    const required = /\b(?:required|essential|mandatory|must)\b/i.test(value);
    const preferred =
      /\b(?:preferred|desirable|optional|bonus|advantageous|nice[ -]to[ -]have)\b/i.test(value);
    return required === preferred ? undefined : required ? 'required' : 'preferred';
  };
  const hasDuration = (value: string) => {
    const bounds = parseDurationYears(value);
    return bounds.minYears !== null || bounds.maxYears !== null;
  };
  const nonExperienceDuration = (value: string) =>
    /\b(?:annual leave|parental leave|paid leave|(?:years?|months?) of service)\b/i.test(value) ||
    /\b(?:years?|yrs?|months?|mos?)(?:\s+of)?\s+(?:(?:fixed[ -]term\s+)?contract\b(?!\s+(?:management|administration))|tenure\b|(?:full[ -]time\s+)?(?:study|education|coursework)\b|(?:academic|vocational|classroom|formal)\s+training\b|training\s+course\b|(?:a\s+)?(?:degree|diploma)\b)/i.test(
      value,
    );
  let parenthesisDepth = 0;
  let scanned = 0;
  for (const delimiter of text.matchAll(delimiters)) {
    for (; scanned < delimiter.index!; scanned++) {
      if (text[scanned] === '(') parenthesisDepth++;
      else if (text[scanned] === ')') parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    }
    if (parenthesisDepth) continue;
    const left = text.slice(0, delimiter.index).trim();
    const rightStart = delimiter.index! + delimiter[0].length;
    const right = text.slice(rightStart).trim();
    if (!left || !right) continue;
    const leftPolarity = polarity(left);
    const rightPolarity = polarity(right);
    const contrast = !!leftPolarity && !!rightPolarity && leftPolarity !== rightPolarity;
    const scopedExperience =
      (span.experienceContext || isExperienceStatement(text)) &&
      /^(?:and|including|of which)\b/i.test(right) &&
      !nonExperienceDuration(left) &&
      !nonExperienceDuration(right) &&
      hasDuration(left) &&
      hasDuration(right);
    if (!contrast && !scopedExperience) continue;
    const experienceContext = span.experienceContext || scopedExperience || undefined;
    return [
      ...splitRequirementClauses(body, {
        start: span.start,
        end: span.start + delimiter.index!,
        experienceContext,
      }),
      ...splitRequirementClauses(body, {
        start: span.start + rightStart,
        end: span.end,
        experienceContext,
      }),
    ];
  }
  return [span];
}

/** Candidate selection is lexical only; Jev judges each exact statement in context.
 * The basic overview uses the stricter subset as quotes, never as classified requirements.
 */
export function buildRequirementCandidates(
  body: string,
  { explicitOnly = false }: { explicitOnly?: boolean } = {},
): RequirementCandidates {
  let truncated = false;
  let inRequirements = false;
  let inCompanySection = false;
  const statements: Array<{
    evidence: SourceSegment;
    priority: number;
    experienceContext?: boolean;
  }> = [];
  // The basic view shows full statements so a quoted clause keeps its qualifiers.
  const spans: RequirementSpan[] = statementSpans(body);
  for (const span of explicitOnly
    ? spans
    : spans.flatMap((span) => splitRequirementClauses(body, span))) {
    const raw = body.slice(span.start, span.end);
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    if (heading.test(text)) {
      inRequirements = !/^(?:benefits|about us|about the (?:company|role))/i.test(text);
      inCompanySection = !inRequirements;
      continue;
    }
    if (
      explicitOnly &&
      (inCompanySection ||
        employerTenure(text) ||
        /\b(?:we (?:offer|provide)|you will receive|annual leave|parental leave|paid leave|salary|remuneration)\b/i.test(
          text,
        ) ||
        (!inRequirements && !requirementLanguage.test(text)))
    )
      continue;
    if (text.length > MAX_REQUIREMENT_TEXT) {
      truncated = true;
      continue;
    }
    const start = span.start + leading;
    statements.push({
      evidence: {
        id: `requirement_${statements.length + 1}`,
        text,
        start,
        end: start + text.length,
      },
      experienceContext: span.experienceContext,
      priority:
        Number(requirementLanguage.test(text)) * 3 +
        Number(inRequirements) * 2 +
        Number(/^[-*]/.test(text)),
    });
  }
  const ranked = [...statements].sort(
    (a, b) => b.priority - a.priority || a.evidence.start - b.evidence.start,
  );
  const allExperience = ranked.filter(
    ({ evidence, experienceContext }) => experienceContext || isExperienceStatement(evidence.text),
  );
  if (ranked.length > MAX_SKILL_CANDIDATES || allExperience.length > MAX_EXPERIENCE_CANDIDATES)
    truncated = true;
  let budget = MAX_QUOTED_REQUIREMENT_CHARS;
  const withinBudget = (items: typeof statements, limit: number): SourceSegment[] => {
    const selected: SourceSegment[] = [];
    for (const { evidence } of items.slice(0, limit)) {
      if (evidence.text.length > budget) {
        truncated = true;
        continue;
      }
      budget -= evidence.text.length;
      selected.push(evidence);
    }
    return selected.sort((a, b) => a.start - b.start);
  };
  const experience = withinBudget(allExperience, MAX_EXPERIENCE_CANDIDATES).map((evidence) => ({
    ...evidence,
    ...(allExperience.find((item) => item.evidence === evidence)?.experienceContext
      ? parseDurationYears(evidence.text)
      : parseExperienceYears(evidence.text)),
  }));
  const skills = withinBudget(ranked, MAX_SKILL_CANDIDATES);
  return { skills, experience, truncated };
}
