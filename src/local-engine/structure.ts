/** Document structure for the on-device requirement rules: section headings, list lead-ins
 * ("You will need:") and the context that governs each statement of a body.
 */
import type { SourceSegment } from '../core/source';

export type Strength = 'required' | 'preferred';
type SectionKind = 'requirements' | 'duties' | 'benefits' | 'company' | 'apply' | 'none';
export interface Context {
  kind: SectionKind;
  level?: Strength;
  /** "You'll be:" / "You will:" lead-ins: each item's own verb decides duty versus attribute. */
  byVerb?: 'be' | 'will';
}
export interface Statement {
  start: number;
  end: number;
  text: string;
  /** Section headings and list lead-ins are structure, not statements. */
  structural: boolean;
  section: Context;
  leadIn?: Context;
  /** Consecutive list items share an id. */
  list?: number;
}

/** List markers: punctuation bullets, arrows, ticks, emoji used as bullets and "1." numbering. */
export const BULLET =
  /^(?:[-•●▪◦‣–—✔✓☑►▶➤➢→⇒◆◇♦★☆✦✧]|\*(?!\*)|>(?=\s)|\d{1,2}[.)](?=\s)|\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*(?=\s))\s*/u;
/** Punctuation bullets only: an emoji-prefixed short line can still be a heading. */
const PUNCT_BULLET = /^(?:[-•●▪◦‣–—✔✓☑►▶➤➢→⇒◆◇♦★☆✦✧]|\*(?!\*)|>(?=\s)|\d{1,2}[.)](?=\s))\s*/u;
export const AP = "['’]";

// Section headings and lead-in lines ("You will need:").

const requirementNoun =
  '(?:skills?|experience|qualifications?|requirements?|criteria|attributes|competenc(?:y|ies)|credentials|licen[cs]es?|certifications?|knowledge|abilities|extras?|points|traits|qualities)';
const nounTail = `(?:\\s+(?:${requirementNoun}|but not (?:essential|required)|(?:&|and|/|,)))*`;
const preferredHeading = new RegExp(
  `^(?:(?:desirable|desired|preferred|preferable|bonus|advantageous|beneficial|nice[- ]to[- ]haves?|good[- ]to[- ]haves?|great[- ]to[- ]haves?|highly regarded|ideally|optional)${nounTail}|bonus points?(?: if.*)?|(?:it would be )?(?:great|nice|awesome|ideal|a bonus) if.*|even better if.*|extra (?:points|credit).*|what (?:would )?sets? you apart|(?:the )?(?:icing on the cake|cherry on top)|plus(?:es)?|it${AP}s a (?:bonus|plus) if.*|(?:you${AP}?(?:ll| will) (?:have|get)|it${AP}?s|it is|it would be) an? (?:advantage|edge|head start|bonus|plus)(?: if.*)?)$`,
  'i',
);
const requiredHeading = new RegExp(
  `^(?:(?:essential|mandatory|required|minimum|must[- ]haves?|key|core|job|role)${nounTail}|(?:essential|mandatory|minimum|must[- ]haves?)|must[- ]haves?|non[- ]negotiables?|the essentials|what you (?:must|need to) (?:have|bring)|what we (?:need|require|expect)(?: from you)?|what you${AP}?(?:ll| will)? need(?: to (?:have|bring|succeed))?|you${AP}?(?:ll| will) need|requirements?)$`,
  'i',
);
const neutralRequirementHeading = new RegExp(
  `^(?:about you|who you are|you|your (?:profile|background|skills|experience|qualifications|attributes)|${requirementNoun}(?:\\s*(?:&|and|/|,)\\s*${requirementNoun})*|(?:your |the )?(?:skills|experience|qualifications?|knowledge)(?:,? (?:&|and|/)? ?\\w+){0,3}|what you(?:${AP}ll| will)? bring(?: to the (?:role|team|table))?|what you have|you have|you bring|(?:what|who) (?:we${AP}re|we are) looking for|we${AP}re looking for|looking for|what we look for|what we(?:${AP}d| would) (?:like|love)(?: to see)?(?: from you)?|your (?:qualities|attributes|strengths)|(?:the |our )?ideal (?:candidate|applicant|person)|(?:the )?person specification|about the (?:person|candidate)|the person|to be successful(?: in this role)?|(?:the )?successful (?:candidate|applicant)|is this you|are you|selection criteria|the right (?:person|candidate)|what it takes)$`,
  'i',
);
const dutyNoun =
  '(?:role|job|position|opportunity|responsibilities|duties|tasks|accountabilities|work)';
const dutiesHeading = new RegExp(
  `^(?:(?:(?:the|your|about the|about this|key|main)\\s+)*${dutyNoun}(?:\\s*(?:&|and|/)\\s*${dutyNoun})*(?: overview| description| summary| details)?|what you(?:${AP}ll| will)? (?:be )?do(?:ing)?|(?:a )?day[- ]to[- ]day|a (?:typical )?day in the life|what the (?:role|job) (?:involves|looks like)|what (?:your|a) (?:typical )?day (?:could |will |might |would )?looks? like|(?:the )?role (?:includes|involves))$`,
  'i',
);
const benefitsHeading = new RegExp(
  `^(?:(?:(?:the|our|your|employee|staff|key)\\s+)*(?:benefits|perks|package|rewards?|remuneration|salary|pay)(?:\\s*(?:&|and)\\s*(?:benefits|perks|rewards?|culture|package))*|what we (?:can )?offer(?: you)?|we offer|(?:what${AP}?s )?on offer|in return|what${AP}?s? (?:is )?in it for you|why (?:join|work (?:for|with|at)) (?:us|[\\w&'’.-]+(?: [\\w&'’.-]+){0,3})|how you(?:${AP}ll| will) grow|your (?:growth|development|career(?: path)?)|career (?:growth|development|progression)|why you${AP}ll love.*|what you(?:${AP}ll| will)? get|the package|our offer)$`,
  'i',
);
const companyHeading =
  /^(?:us|about us|about the (?:company|business|organisation|organization|team|employer|client|school|practice|clinic)|who we are|our (?:company|story|team|culture|values|business|organisation|organization|client|clinic|school)|company (?:overview|profile)|the (?:company|business|team|client)|how we work|the way we work|our ways? of working)$/i;
const applyHeading =
  /^(?:how to apply|to apply|apply now|apply today|(?:come (?:and )?)?join (?:us|our team|the team)|next steps|(?:the )?application process|ready to apply|interested|what['’]?s next|keen|sounds? like you|(?:does )?this sound like you)$/i;

function headingLabel(text: string): string {
  return text
    .replace(/^[\p{Extended_Pictographic}\p{So}\uFE0F\u200D\s#*_]+/u, '')
    .replace(/[\p{Extended_Pictographic}\p{So}\uFE0F\u200D\s*_:?!.\-–—]+$/u, '')
    .trim();
}

export function classifyHeading(text: string): Context | null {
  if (PUNCT_BULLET.test(text) || text.length > 70) return null;
  // A sentence that ends with a full stop is prose, not a heading.
  if (/[.;]$/.test(text) && !/:$/.test(text)) return null;
  const label = headingLabel(text);
  if (!label || label.split(/\s+/).length > 9) return null;
  if (preferredHeading.test(label)) return { kind: 'requirements', level: 'preferred' };
  if (requiredHeading.test(label)) return { kind: 'requirements', level: 'required' };
  if (neutralRequirementHeading.test(label)) {
    if (preferredLeadIn.test(label)) return { kind: 'requirements', level: 'preferred' };
    if (/\b(?:essential|mandatory|required|minimum|must|need)\b/i.test(label))
      return { kind: 'requirements', level: 'required' };
    return { kind: 'requirements' };
  }
  if (benefitsHeading.test(label)) return { kind: 'benefits' };
  // "Why this role matters", "Why our team loves working at X": the employer's pitch, which
  // otherwise leaves a preceding requirements list open until the end of the advert.
  if (/^why\s+\S/i.test(label)) return { kind: 'benefits' };
  if (dutiesHeading.test(label)) return { kind: 'duties' };
  if (companyHeading.test(label)) return { kind: 'company' };
  if (applyHeading.test(label)) return { kind: 'apply' };
  // "About Northern Freight" introduces the employer, unlike "About you" or "About the role".
  if (
    /^About\s+(?!(?:you|the\s+(?:role|job|position|opportunity|person|candidate))\b)\p{Lu}\S*(?:\s+\S+){0,4}$/u.test(
      label,
    )
  )
    return { kind: 'company' };
  return null;
}

const preferredLeadIn = new RegExp(
  `\\b(?:ideally|bonus|great if|even better|would be (?:nice|great|good|ideal|an advantage|beneficial|helpful|useful|a plus|a bonus)|advantage\\w*|desirable|preferred|preferabl[ey]|nice to have|nice[- ]to[- ]have|a plus|highly regarded|(?:not|isn${AP}t) (?:essential|required|mandatory)|none (?:of (?:these|them|which) )?(?:is|are) (?:essential|required|mandatory)|strengthen (?:an?|your) application|set(?:s)? you apart|stand out|extra points)\\b`,
  'i',
);

function classifyLeadIn(text: string): Context | null {
  if (PUNCT_BULLET.test(text) || !/:\s*$/.test(text)) return null;
  const label = headingLabel(text);
  if (label.split(/\s+/).length > 22) return null;
  if (preferredLeadIn.test(label)) return { kind: 'requirements', level: 'preferred' };
  if (
    /\b(?:we (?:offer|provide)|offer(?:ing)?|benefits?|perks|in return|you['’]?(?:ll| will) (?:get|receive|enjoy)|in it for you|package includes)\b/i.test(
      label,
    )
  )
    return { kind: 'benefits' };
  if (/\b(?:must|essential|required|requirements?|need|needs|minimum|mandatory)\b/i.test(label))
    return { kind: 'requirements', level: 'required' };
  // An optional scope prefix ("For the nursing role, you will be:") keeps the lead-in's meaning.
  const core = label.replace(/^(?:for|in|as) (?:the|this|our|a|an) [^,]{1,40},\s*/i, '');
  if (/^(?:you['’]?(?:ll| will) be|you are|you['’]re)(?: someone who| a person who)?$/i.test(core))
    return { kind: 'requirements', byVerb: 'be' };
  if (/^you['’]?(?:ll| will)$/i.test(core)) return { kind: 'duties', byVerb: 'will' };
  if (
    /\b(?:responsib\w*|duties|tasks|day[- ]to[- ]day|you['’]?(?:ll| will) be|involve\w*|includ\w*|opportunity to|you will|you['’]ll|your role|the role|this role will)\b/i.test(
      label,
    ) &&
    !/\b(?:successful|ideal|good fit|right fit|suited|looking for|have|hold|bring|skills|experience|qualifications?)\b/i.test(
      label,
    )
  )
    return { kind: 'duties' };
  if (
    /\b(?:have|hold|bring|skills|experience|qualifications?|looking for|ideal|successful|good fit|right fit|suited|you are|you['’]re|attributes|background|candidate|applicant|person|succeed|someone)\b/i.test(
      label,
    )
  )
    return { kind: 'requirements' };
  return null;
}

let cachedBody: string | undefined;
let cachedStatements: Statement[] = [];

/** Statements with the section and lead-in that govern them. Cached for repeated calls per body. */
export function analyzeBody(body: string): Statement[] {
  if (cachedBody === body) return cachedStatements;
  const statements: Statement[] = [];
  let section: Context = { kind: 'none' };
  let leadIn: Context | undefined;
  let leadInBullets = 0;
  let previousEnd = 0;
  let list = 0;
  let inList = false;
  for (const span of statementSpans(body)) {
    const raw = body.slice(span.start, span.end);
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const start = span.start + leading;
    const end = start + text.length;
    const between = body.slice(previousEnd, start);
    const paragraphBreak = /\n[^\S\n]*\n/.test(between);
    previousEnd = end;
    const heading = classifyHeading(text);
    if (heading) {
      section = heading;
      leadIn = undefined;
      inList = false;
      statements.push({ start, end, text, structural: true, section });
      continue;
    }
    const lead = classifyLeadIn(text);
    if (lead) {
      leadIn = lead;
      leadInBullets = 0;
      inList = false;
      statements.push({ start, end, text, structural: true, section });
      continue;
    }
    const bullet = BULLET.test(text) || /[•●▪]/.test(between);
    if (leadIn && !bullet && (leadInBullets > 0 || paragraphBreak)) leadIn = undefined;
    if (leadIn && bullet) leadInBullets += 1;
    if (bullet && !inList) list += 1;
    inList = bullet;
    statements.push({
      start,
      end,
      text,
      structural: false,
      section,
      leadIn,
      list: bullet ? list : undefined,
    });
  }
  cachedBody = body;
  cachedStatements = statements;
  return statements;
}

export function contextOf(excerpt: SourceSegment, body: string): Statement | undefined {
  const statements = analyzeBody(body);
  let found: Statement | undefined;
  for (const statement of statements) {
    if (statement.start > excerpt.start) break;
    found = statement;
  }
  return found && excerpt.start < found.end ? found : undefined;
}

/** Statement boundaries: lines, bullets and sentence ends, keeping parenthesised examples
 * and abbreviations such as "e.g." or ".NET" intact. */
export function statementSpans(body: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  // Protect balanced examples, including line-wrapped ones. Unclosed parentheses
  // must not turn all later bullets into a single, oversized statement.
  const openings: number[] = [];
  const parentheses: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '(') openings.push(index);
    else if (body[index] === ')' && openings.length) {
      const start = openings.pop()!;
      // A wrapped example spans at most one line break; a stray "(" closed by a later ":)"
      // must not merge separate lines or bullets into one statement.
      const inner = body.slice(start, index);
      const breaks = inner.match(/\n/g)?.length ?? 0;
      if (breaks === 0 || (breaks === 1 && inner.length <= 160 && !/\n\s*[-*•●▪]/.test(inner)))
        parentheses.push({ start, end: index });
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
