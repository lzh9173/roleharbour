/** Requirement statement selection and stated-duration parsing for the local engine. */
import type { SourceSegment } from '../core/source';
import { asksApplicationMaterial } from './markers';
import { AP, classifyHeading, statementSpans } from './structure';

export const MAX_SKILL_CANDIDATES = 24;
export const MAX_EXPERIENCE_CANDIDATES = 12;
export const MAX_REQUIREMENT_TEXT = 600;
/** A real statement has a handful of clauses; beyond this the split would be quadratic. */
const MAX_CLAUSE_DELIMITERS = 40;

export interface CandidateLimits {
  skills: number;
  experience: number;
  /** Longer "statements" are unbroken paragraphs, not one requirement. */
  text: number;
}
/** The experience estimate was tuned on these bounds; keep them unless re-evaluated blind. */
const DEFAULT_LIMITS: CandidateLimits = {
  skills: MAX_SKILL_CANDIDATES,
  experience: MAX_EXPERIENCE_CANDIDATES,
  text: MAX_REQUIREMENT_TEXT,
};
/** Nothing leaves the device, so the checklist can cover every requirement of a long advert. */
export const CHECKLIST_LIMITS: CandidateLimits = {
  skills: 120,
  experience: 120,
  text: 1_200,
};

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
/** A duration number: digits or written words up to sixty-nine. */
export const numberToken = `(?:\\d+(?:\\.\\d+)?|(?:twenty|thirty|forty|fifty|sixty)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|${numberWords})`;
const experienceLanguage =
  /\b(?:experience|experienced|exposure|background|worked|working|track record|professional practice)\b/i;
// A keyword joined by a hyphen modifies another word ("mixed-ability class"), so it is not
// requirement language on its own.
const requirementLanguage =
  /(?<![-‐‑])\b(?:must|required|essential|minimum|ability|able to|skills?|knowledge|proficien\w*|familiar\w*|experience|qualifications?|certifi\w*|preferred|desirable|advantage\w*|competenc\w*|licen[cs](?:e[ds]?|ing)|registr(?:ation|ations|ered)|accredit(?:ed|ation)|apprenticeships?|trade[ -]qualified|endorsements?|diplomas?|degrees?|clearances?|practising|practicing|trained|training|memberships?)\b/i;
/** Explicit strength wording; outside a requirements section only these lines are quoted. */
const strongRequirement =
  /(?<![-‐‑])\b(?:must|required|requires|essential|mandatory|minimum|preferred|preferen(?:ce|tial)|desirable|advantage\w*|nice[- ]to[- ]have|you(?:['’]ll| will)? need|(?:is|are) needed)\b/i;
const benefitLanguage =
  /\b(?:we (?:offer|provide)|you will receive|annual leave|parental leave|paid leave|salary|remuneration)\b/i;
/** Training, equipment or support the employer supplies, rather than something applicants need. */
const employerProvision =
  /\b(?:(?:is|are|will be|being)\s+(?:provided|supplied|included|covered|arranged|given)\b|(?:we|the (?:company|employer|business))\s+(?:will\s+)?(?:supply|supplies|arrange|arranges|cover|covers|pay|pays|fund|funds)\b|training (?:covers|includes)\b)/i;

type Section = 'requirements' | 'duties' | 'benefits' | 'company' | 'apply';
const requirementTopic =
  '(?:requirements?|skills|experience|qualifications?|credentials|licen[cs]es|registrations?|certifications?|competenc(?:y|ies)|criteria|attributes)';
const dutyTopic =
  '(?:role|job|position|opportunity|responsibilities|duties|tasks|accountabilities)';
const sectionHeadings: Array<[Section, RegExp]> = [
  [
    'requirements',
    new RegExp(
      `^(?:(?:(?:key|essential|required|preferred|desirable|minimum|mandatory|core|your|the|job|role)\\s+)*${requirementTopic}(?:\\s*(?:&|and|/|,)\\s*(?:(?:key|essential|required|preferred|desirable|minimum)\\s+)?${requirementTopic})*|about you|who you are|what you(?:${AP}ll| will)? (?:need|bring|have)|(?:what|who) (?:we${AP}re|we are) looking for|(?:the |our )?ideal candidate|you(?:${AP}ll| will)? (?:need|have|bring)|must[- ]haves?|nice[- ]to[- ]haves?|person specification|desirable|desired|preferred|(?:the )?essentials?|bonus(?: points)?(?: if you (?:have|bring))?|ideally(?: you(?:${AP}ll| will)? have)?|even better(?: if you (?:have|bring))?|what (?:will )?sets? you apart|(?:great|good) to have|what would be (?:great|nice))$`,
      'i',
    ),
  ],
  [
    'duties',
    new RegExp(
      `^(?:(?:(?:the|your|about the|key|main)\\s+)*${dutyTopic}(?:\\s*(?:&|and|/)\\s*${dutyTopic})*(?: overview| description)?|what you(?:${AP}ll| will)? (?:be )?do(?:ing)?|(?:a )?day[- ]to[- ]day|a day in the life)$`,
      'i',
    ),
  ],
  [
    'benefits',
    new RegExp(
      `^(?:(?:(?:the|our|your|employee|staff|key)\\s+)*(?:benefits|perks|package|rewards?)(?:\\s*(?:&|and)\\s*(?:benefits|perks|rewards?|culture))*|what we (?:can )?offer(?: you)?|we offer|what${AP}?s? (?:is )?in it for you|why (?:join|work (?:for|with)) us|why you${AP}ll love (?:working )?(?:here|with us|us)|what you(?:${AP}ll| will)? get)$`,
      'i',
    ),
  ],
  [
    'company',
    /^(?:about us|about the (?:company|business|organisation|organization|team|employer|client)|who we are|our (?:company|story|team|culture|values|business|organisation|organization)|company (?:overview|profile))$/i,
  ],
  [
    'apply',
    /^(?:how to apply|to apply|apply now|next steps|(?:the )?application process|ready to apply|interested|sounds? like you|is this you)$/i,
  ],
];

/** Short standalone section titles. Bullets and ordinary sentences are never headings. */
function sectionHeading(text: string): Section | null {
  // One heading vocabulary for selection and context: "Is this you?", "What it takes".
  const known = classifyHeading(text);
  if (known && known.kind !== 'none') return known.kind;
  if (/^[-*•●▪]/.test(text) || text.length > 90) return null;
  const label = text
    .replace(/^[\p{Extended_Pictographic}\p{So}\s]+/u, '')
    .replace(/\s*[:?!]+$/, '')
    .trim();
  for (const [section, pattern] of sectionHeadings) if (pattern.test(label)) return section;
  // "About Northern Freight" introduces the employer, unlike "About you" or "About the role".
  if (
    /^About\s+(?!(?:you|the\s+(?:role|job|position|opportunity))\b)\p{Lu}\S*(?:\s+\S+){0,4}$/u.test(
      label,
    )
  )
    return 'company';
  // A lead-in such as "To be successful in this role you will have:" introduces a list.
  if (!text.endsWith(':') || label.split(/\s+/).length > 14) return null;
  if (/\b(?:offer|benefits?|perks|in it for you)\b/i.test(label)) return 'benefits';
  // "You'll be a good fit if:" describes the person, not the work.
  if (/\b(?:good fit|right fit|suited|successful|ideal)\b/i.test(label)) return 'requirements';
  if (
    /\b(?:opportunity to|responsib\w*|duties|tasks|day[- ]to[- ]day|you(?:['’]ll| will) be)\b/i.test(
      label,
    )
  )
    return 'duties';
  if (
    /\b(?:need|have|bring|hold|require\w*|skills|experience|qualifications?|looking for|ideal|successful)\b/i.test(
      label,
    )
  )
    return 'requirements';
  if (/\byou(?:['’]ll| will)$/i.test(label)) return 'duties';
  return null;
}

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
  // Benefits and tenure are not applicant work experience; the sentence can still be read
  // as a skills statement.
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
    if (first > second) return unknown;
    // "1–2+ years": the plus leaves the range open, so it is a minimum.
    return { minYears: first, maxYears: match[5] ? null : second };
  }
  if (prefix === 'between') return unknown;
  if (/^(?:at most|maximum|up to|(?:no|not) more than)/i.test(match[1] ?? ''))
    return { minYears: null, maxYears: first };
  return { minYears: first, maxYears: null };
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
  const delimiters = /[,;]\s*|(?<!\s)\s+(?=(?:while|whereas|but|including|of which|and)\b)/gi;
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
  const found = [...text.matchAll(delimiters)];
  if (found.length > MAX_CLAUSE_DELIMITERS) return [span];
  let parenthesisDepth = 0;
  let scanned = 0;
  for (const delimiter of found) {
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

/** Candidate selection is lexical only; the local engine judges each exact statement in
 * context. The checklist uses the stricter `explicitOnly` subset of full statements, so a quoted
 * clause keeps its qualifiers; the experience estimate also sees contrasting clauses split.
 */
export function buildRequirementCandidates(
  body: string,
  {
    explicitOnly = false,
    limits = DEFAULT_LIMITS,
  }: { explicitOnly?: boolean; limits?: CandidateLimits } = {},
): RequirementCandidates {
  let truncated = false;
  let section: Section | undefined;
  const seen = new Set<string>();
  const statements: Array<{
    evidence: SourceSegment;
    priority: number;
    experienceContext?: boolean;
  }> = [];
  const spans: RequirementSpan[] = statementSpans(body);
  for (const span of explicitOnly
    ? spans
    : spans.flatMap((span) => splitRequirementClauses(body, span))) {
    const raw = body.slice(span.start, span.end);
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    const heading = sectionHeading(text);
    if (heading) {
      section = heading;
      continue;
    }
    // Repeated summaries add no new requirement.
    const key = text
      .replace(/^[-*•●▪]\s*/, '')
      .replace(/[.!?]+$/, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const inRequirements = section === 'requirements';
    const years = parseExperienceYears(text);
    const strong =
      strongRequirement.test(text) || years.minYears !== null || years.maxYears !== null;
    // Duties, perks and application steps are quoted only when they state an explicit
    // condition; employer background never is.
    const quotable = !(
      section === 'company' ||
      employerTenure(text) ||
      benefitLanguage.test(text) ||
      (employerProvision.test(text) && !strong) ||
      ((section === 'duties' || section === 'benefits') && !strong) ||
      (section === 'apply' && !strong && !asksApplicationMaterial(text)) ||
      (!inRequirements && !requirementLanguage.test(text) && !asksApplicationMaterial(text))
    );
    if (explicitOnly && !quotable) continue;
    if (text.length > limits.text) {
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
        Number(quotable) * 4 +
        Number(requirementLanguage.test(text)) * 3 +
        Number(inRequirements) * 2 +
        Number(/^[-*•●▪]/.test(text)),
    });
  }
  const ranked = [...statements].sort(
    (a, b) => b.priority - a.priority || a.evidence.start - b.evidence.start,
  );
  const allExperience = ranked.filter(
    ({ evidence, experienceContext }) => experienceContext || isExperienceStatement(evidence.text),
  );
  if (ranked.length > limits.skills || allExperience.length > limits.experience) truncated = true;
  const top = (items: typeof statements, limit: number): SourceSegment[] =>
    items
      .slice(0, limit)
      .map(({ evidence }) => evidence)
      .sort((a, b) => a.start - b.start);
  const experience = top(allExperience, limits.experience).map((evidence) => ({
    ...evidence,
    ...(allExperience.find((item) => item.evidence === evidence)?.experienceContext
      ? parseDurationYears(evidence.text)
      : parseExperienceYears(evidence.text)),
  }));
  const skills = top(ranked, limits.skills);
  return { skills, experience, truncated };
}
