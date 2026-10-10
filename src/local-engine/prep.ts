/** On-device "application preparation" checklist: the languages, tools, knowledge areas,
 * qualifications, personal qualities and application materials a job ad asks for.
 * Every entry keeps the exact source statement it came from; nothing is inferred beyond
 * vocabulary matches in that statement. */
import onetSoftware from '../../data/skills/onet-software.json';
import {
  knowledgeAreas,
  materials,
  programmingLanguages,
  softSkills,
  spokenLanguages,
  supplementalTools,
} from '../../data/skills/vocabulary';
import { CHECKLIST_LIMITS, buildRequirementCandidates } from './candidates';
import type { SourceSegment } from '../core/source';
import { estimateExperience } from './experience';
import { asksApplicationMaterial, negatedRequirement, preferredMarker } from './markers';
import { classifyRequirementLevel } from './requirements';
import type { LocalExperienceEstimate, RequirementLevel } from './types';

export type PrepLevel = RequirementLevel;
export type PrepKind = 'language' | 'tool' | 'knowledge' | 'spoken' | 'qualification' | 'personal';

export interface PrepEntry {
  kind: PrepKind;
  level: PrepLevel;
  /** Display labels in English, like the ad; more than one means alternatives. */
  terms: string[];
  source: SourceSegment;
}

export interface PrepMaterial {
  key: string;
  level: PrepLevel;
  /** English, like the chips. */
  label: string;
  source: SourceSegment;
}

export interface PrepChecklist {
  entries: PrepEntry[];
  materials: PrepMaterial[];
  /** Requirement statements that matched no vocabulary, so nothing is silently dropped. */
  other: Array<SourceSegment & { level: PrepLevel }>;
  experience: Array<
    SourceSegment & { level: PrepLevel; minYears: number | null; maxYears: number | null }
  >;
  estimate: LocalExperienceEstimate | null;
  /** Some statements exceeded the extraction limits, so the checklist may be incomplete. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Vocabulary index

interface Term {
  kind: Exclude<PrepKind, 'qualification'>;
  label: string;
  /** Ordinary English words: only capitalised and not at the start of a statement. */
  midSentence?: boolean;
  /** Letters and words such as "C", "R" or "Go" count only beside another named technology. */
  needsContext?: boolean;
  /** More specific vocabulary wins ties on equal spans. */
  rank: number;
  /** "Japanese" is a language only in language wording, not in "Japanese cars". */
  languageContext?: boolean;
}

interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
}

/** Words, with the symbols that belong to technology names: C++, C#, .NET, Node.js. */
const tokenPattern =
  /(?<![\p{L}\p{N}])\.?[\p{L}\p{N}](?:[\p{L}\p{N}]|['’.](?=[\p{L}\p{N}]))*[+#]*/gu;
function tokenize(text: string): Token[] {
  return [...text.matchAll(tokenPattern)].map((match) => {
    // "Python's ecosystem": the possessive is not part of the name.
    const word = match[0].replace(/(?<=\p{L}{2})['’]s$/u, '');
    return {
      text: word,
      lower: word.toLowerCase(),
      start: match.index!,
      end: match.index! + word.length,
    };
  });
}

interface Phrase {
  tokens: string[];
  caseSensitive: boolean;
  /** The ad must capitalise it: "NetWorker" the product, not "a natural networker". */
  capitalised?: boolean;
  term: Term;
}

function buildIndex(): Map<string, Phrase[]> {
  const index = new Map<string, Phrase[]>();
  const add = (alias: string, caseSensitive: boolean, term: Term, capitalised = false) => {
    // "jQuery", "iMovie": a lowercase-first name is distinctive only in its own casing.
    if (capitalised && /^\p{Ll}+\p{Lu}/u.test(alias)) {
      caseSensitive = true;
      capitalised = false;
    }
    const parts = tokenize(alias);
    // Separators may differ ("F&B", "health & safety"), but "Act!" or "@Risk" would match the
    // bare words "Act" and "Risk", so names whose own characters are dropped are skipped.
    if (
      !parts.length ||
      parts.map((token) => token.text).join(' ') !== alias.replace(/[\s/&,;:()-]+/g, ' ').trim()
    )
      return;
    const tokens = parts.map((token) => (caseSensitive ? token.text : token.lower));
    const key = tokens[0]!.toLowerCase();
    const phrase: Phrase = { tokens, caseSensitive, term };
    if (capitalised && tokens.length === 1) phrase.capitalised = true;
    index.set(key, [...(index.get(key) ?? []), phrase]);
  };
  for (const language of programmingLanguages) {
    const caseSensitive = !!language.caseSensitive;
    for (const alias of [language.label, ...language.aliases])
      add(alias, caseSensitive, {
        kind: 'language',
        label: language.label,
        rank: 0,
        needsContext: caseSensitive,
        midSentence: caseSensitive && alias.length > 2,
      });
  }
  for (const language of spokenLanguages)
    for (const alias of [language.label, ...language.aliases])
      add(
        alias,
        false,
        {
          kind: 'spoken',
          label: language.label,
          rank: 1,
          languageContext: !language.standalone,
        },
        !language.standalone,
      );
  for (const tool of supplementalTools)
    for (const alias of [tool.label, ...tool.aliases])
      add(alias, !!tool.caseSensitive, { kind: 'tool', label: tool.label, rank: 1 });
  for (const area of knowledgeAreas)
    for (const pattern of area.patterns)
      add(pattern, false, { kind: 'knowledge', label: area.label, rank: 2 });
  const languageLabels = new Set(
    programmingLanguages.map((language) => language.label.toLowerCase()),
  );
  for (const [label, ...aliases] of onetSoftware.tools as string[][]) {
    if (languageLabels.has(label!.toLowerCase())) continue;
    for (const encoded of aliases) {
      const flag = encoded[0];
      const alias = flag === '=' || flag === '!' ? encoded.slice(1) : encoded;
      // O*NET's one-word names are often English words (Maven, Workspace, Basecamp).
      add(
        alias,
        flag === '=' || flag === '!',
        { kind: 'tool', label: label!, rank: 3, midSentence: flag === '!' },
        true,
      );
    }
  }
  for (const skill of softSkills)
    for (const pattern of skill.patterns)
      add(pattern, false, {
        kind: 'personal',
        label: skill.label,
        rank: 4,
      });
  return index;
}

let phraseIndex: Map<string, Phrase[]> | undefined;

const languageWording =
  /\b(?:speak\w*|spoken|fluen\w*|bilingual|multilingual|languages?|communicat\w*|written|verbal|oral|conversational|native|proficien\w*|interpret\w*|translat\w*|read(?:ing)? and writ\w*)\b/i;
/** "Japanese cars", "Chinese clients": a nationality adjective, not a language. */
const nationalityNoun =
  /^\s+(?:and\s+\w+\s+)?(?:cars?|vehicles?|makes?|brands?|cuisine|food|dishes|cooking|restaurants?|markets?|clients?|customers?|students?|patients?|culture|communit(?:y|ies)|tourists?|visitors?|companies|company|owned|style|knives)\b/i;

interface Match {
  term: Term;
  start: number;
  end: number;
}

function findTerms(text: string): Match[] {
  phraseIndex ??= buildIndex();
  const tokens = tokenize(text);
  const found: Match[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const phrase of phraseIndex.get(tokens[i]!.lower) ?? []) {
      const last = i + phrase.tokens.length - 1;
      if (last >= tokens.length) continue;
      if (
        !phrase.tokens.every(
          (expected, offset) =>
            (phrase.caseSensitive ? tokens[i + offset]!.text : tokens[i + offset]!.lower) ===
            expected,
        )
      )
        continue;
      if (phrase.capitalised && !/^[\p{Lu}\p{N}.]/u.test(tokens[i]!.text)) continue;
      if (
        phrase.term.languageContext &&
        (!languageWording.test(text) || nationalityNoun.test(text.slice(tokens[last]!.end)))
      )
        continue;
      // "code quality, testing" is two list items, not "quality testing".
      let joined = true;
      for (let k = i; k < last && joined; k++)
        joined = /^[ \t/&-]*$/.test(text.slice(tokens[k]!.end, tokens[k + 1]!.start));
      if (!joined) continue;
      const start = tokens[i]!.start;
      const end = tokens[last]!.end;
      const term = phrase.term;
      // A list item ("- React and TypeScript") may start with the name itself.
      const opensStatement = i === 0 && !/^\s*[-*•●▪]/.test(text);
      const before = text.slice(0, start);
      if (
        term.midSentence &&
        (opensStatement ||
          (/[.!?:]\s*$/.test(before) && !/\b(?:e\.g|i\.e|etc|incl)\.\s*$/i.test(before)))
      )
        continue;
      // "Hands-on experience with Azure", "flexible hours", "motivated people": the word
      // describes something else, not a personal quality.
      if (
        term.kind === 'personal' &&
        /^\s+(?:(?:(?!(?:for|with|to|in|of|and|or|at|on)\b)[\w-]+\s+){0,2}?(?:experience|exposure|knowledge)|hours|shifts?|rosters?|people|candidates?|applicants?|individuals?)\b/i.test(
          text.slice(end),
        )
      )
        continue;
      // "Class C licence", "R&D", "C-suite".
      if (
        term.needsContext &&
        (/\b(?:class|grade|level|type|vitamin|plan|section|part)\s*$/i.test(text.slice(0, start)) ||
          /^[&-]/.test(text.slice(end)))
      )
        continue;
      found.push({ term, start, end });
    }
  }
  const named = found.some(
    (m) => !m.term.needsContext && (m.term.kind === 'language' || m.term.kind === 'tool'),
  );
  const candidates = named ? found : found.filter((m) => !m.term.needsContext);
  // Longest match wins; on equal spans prefer the more specific vocabulary.
  candidates.sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.term.rank - b.term.rank || a.start - b.start,
  );
  const kept: Match[] = [];
  for (const match of candidates)
    if (!kept.some((other) => match.start < other.end && other.start < match.end)) kept.push(match);
  return kept.sort((x, y) => x.start - y.start);
}

// ---------------------------------------------------------------------------
// Statement analysis

const credential =
  /\b(?:degree(?! of)|bachelor['’]?s?|master['’]?s?|diploma|certificat(?:e|es|ion|ions)|licen[cs]e[sd]?|registration|registered|practising certificate|qualifications?|qualified(?! (?:leads?|prospects?|candidates?|applicants?|people|opportunities))|(?<!\b(?:support|service|helpdesk|desk|incident|customer|jira|log|logging|raise|raising|resolve|resolving|close|closing|manage|managing)\s)tickets?|endorsements?|(?:security|police) clearance|NZQA|(?<!\bteach(?:ing)? )NCEA|WSET)\b/i;
/** "Experience in X" and similar wording that names no credential despite the word "certified". */
const notCredential = /\b(?:certificate (?:management|rotation)|software licen[cs]ing)\b/i;
// "e.g." keeps its final dot inside the marker; a trailing \b would stop before it.
// "Would like" and "like-minded" introduce no examples.
const exampleMarker =
  /\b(?:(?:such as|eg|including|(?<!\bwould |['’]d )like(?![-‐])|for example|for instance)\b|e\.g\.?)[:,]?\s*/i;
/** Where an example list stops: "(e.g. AWS or Azure), plus Python or Go". */
const exampleEnd = /[.;)]|\b(?:plus|as well as|and also|along with)\b/i;
const between = (text: string, a: Match, b: Match) => text.slice(a.end, b.start);

/** Short qualification wording: strip framing, keep conditions such as "current" or classes. */
function qualificationLabel(text: string): string {
  let value = text
    .replace(/^[^\p{L}\p{N}(]+/u, '')
    .replace(
      /^(?:(?:you(?:['’]ll| will)?|applicants?|candidates?)\s+(?:must |should |will |need to )?(?:have|hold|possess|bring|be)|(?:must|need to|should) (?:have|hold|possess|be)|have|hold|holds|possess|be)\s+/i,
      '',
    )
    .replace(/^(?:a|an|the)\s+/i, '')
    // "NZ citizen or permanent resident with a current Class 2 licence": residency has its
    // own cell; the credential is the licence.
    .replace(
      /^.*?\b(?:citizens?|(?:permanent )?residents?|residency|work rights|work visa)\b.*?\b(?:with|holding|and (?:hold|have))\s+(?:a |an |the )?/i,
      '',
    )
    // "A degree in X, or equivalent practical experience": the credential is the degree.
    .replace(/,?\s+(?:or|and)\s+(?:an?\s+|the\s+)?equivalent\b.*$/i, '')
    .replace(/[.;:!]+$/, '')
    .trim();
  // The section already says required or preferred: drop the trailing level clause, unless
  // it sits inside a parenthesis that qualifies only part ("licence (Class 2 preferred)").
  const level =
    /[\s,]+(?:(?:is|are|would be|will be)\s+)?(?:(?:highly|strongly|very)\s+)?(?:required|essential|mandatory|preferred|desirable|desired|an advantage|advantageous|a bonus|a plus|useful|beneficial|regarded|valued|nice to have)\b.*$/i.exec(
      value,
    );
  if (level && level.index > 0) {
    const before = value.slice(0, level.index);
    if ((before.match(/\(/g)?.length ?? 0) === (before.match(/\)/g)?.length ?? 0))
      value = before.trim();
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Where a closing preference starts: "PHP, ideally with Laravel", "a public cloud (GCP
 * preferred)". Only a tail that names something of its own narrows; "(preferred but not
 * essential)" annotates the whole item. */
const closingPreference =
  /(?:[,;]\s*|\s[-–—]\s*|\s)(?:and |but |or )?(?:ideally|preferably)\b|\s*\((?=[^()]*\b(?:preferred|desirable|ideally|preferably|an advantage|a plus|a bonus)\b)[^()]*\)/i;

function statementEntries(
  segment: SourceSegment,
  level: PrepLevel,
  classify: (head: SourceSegment) => PrepLevel | 'not_requirement',
): PrepEntry[] {
  const text = segment.text;
  const entries: PrepEntry[] = [];
  const matches = findTerms(text);
  const technicalAt = matches.filter((m) => m.term.kind !== 'personal');
  const closing = closingPreference.exec(text);
  let headLevel = level;
  const split =
    closing &&
    technicalAt.some((m) => m.start >= closing.index) &&
    technicalAt.some((m) => m.end <= closing.index)
      ? closing.index
      : -1;
  if (split > 0) {
    const head = text.slice(0, split).trimEnd();
    const found = classify({ ...segment, text: head, end: segment.start + head.length });
    if (found !== 'not_requirement') headLevel = found;
  }
  const levelAt = (start: number): PrepLevel =>
    split < 0 ? level : start >= split ? 'preferred' : headLevel;
  // "4 years' experience in licensed ECE services": an adjective, not a held credential.
  const adjectiveOnly =
    /\b\d+\+?\s*(?:years?|yrs?)\b/i.test(text) &&
    !/\b(?:degree|diploma|certificat\w*|licen[cs]e|registration|ticket|endorsement|qualification)\b/i.test(
      text,
    );
  const isCredential = credential.test(text) && !notCredential.test(text) && !adjectiveOnly;
  // "A degree in civil engineering" is one qualification, not also a separate field chip.
  if (isCredential)
    for (let i = matches.length - 1; i >= 0; i--)
      if (matches[i]!.term.kind === 'knowledge') matches.splice(i, 1);
  const technical = matches.filter((m) => m.term.kind !== 'personal');
  if (isCredential) {
    const label = qualificationLabel(text);
    if (label.length <= 90)
      entries.push({ kind: 'qualification', level: headLevel, terms: [label], source: segment });
  }
  // "Database knowledge such as SQL Server, MySQL or similar": each example is its own chip
  // under its kind, never an "A or B" alternative, and the family ("Databases") stays a chip.
  const marker = exampleMarker.exec(text);
  const after = marker ? marker.index + marker[0].length : 0;
  const examples = marker
    ? technical.filter((m) => m.start >= after && !exampleEnd.test(text.slice(after, m.start)))
    : [];
  // "SQL Server, MySQL or other databases": the generic family word closing a list of named
  // products is not one more example.
  const named = examples.some((m) => m.term.kind !== 'knowledge');
  for (const m of examples)
    if (!named || m.term.kind !== 'knowledge')
      entries.push({
        kind: m.term.kind,
        level: levelAt(m.start),
        terms: [m.term.label],
        source: segment,
      });
  const remaining = technical.filter((m) => !examples.includes(m));
  // "C++ or LabVIEW", "Revit/ArcGIS": direct alternatives.
  for (let i = 0; i < remaining.length; i++) {
    const group = [remaining[i]!];
    while (
      remaining[i + 1] &&
      /^\s*(?:,\s*)?(?:or|\/|or a|or an)\s*$/i.test(between(text, group.at(-1)!, remaining[i + 1]!))
    )
      group.push(remaining[++i]!);
    entries.push({
      kind: group[0]!.term.kind,
      level: levelAt(group[0]!.start),
      terms: [...new Set(group.map((m) => m.term.label))],
      source: segment,
    });
  }
  for (const match of matches.filter((m) => m.term.kind === 'personal'))
    entries.push({
      kind: 'personal',
      level: levelAt(match.start),
      terms: [match.term.label],
      source: segment,
    });
  return entries;
}

const materialPatterns = new Map(
  materials.map((material) => [
    material.key,
    material.patterns.map((pattern) => new RegExp(pattern, 'i')),
  ]),
);
const levelRank: Record<PrepLevel, number> = { required: 0, unclear: 1, preferred: 2 };

/** Perk lines written as imperatives: "Receive the tools and support you need to succeed". */
const perk = /^\W*(?:[\w ,&'’-]{1,40}:\s*)?(?:receive|enjoy|get access to|access)\b/i;
/** Lines that reach the requirement list but ask nothing of the applicant: how to apply,
 * pay and perks, hours of the role, or a bare list number. */
const notAnAsk = [
  /^[^\p{L}]*$/u,
  /^\W*(?:any )?questions\??\W*$/iu,
  // A short rhetorical question ("No experience?") or a named contact ("Text Craig with ...").
  /^[^.!]{0,30}\?\W*$/u,
  /^\W*(?:text|call|phone|ring|message|email) \p{Lu}\p{Ll}+\b/u,
  /^\W*(?:text|call|phone|ring|message|email) (?:us|me|your name)\b|\bcome (?:in|by|and see us) for a (?:look|chat|coffee)\b/iu,
  /\b(?:can|could|will) earn\b/iu,
  // An unrecognised heading: "How You Work Matters Here".
  /^\W*(?:\p{Lu}[\p{L}'’-]*\s+){1,5}\p{Lu}[\p{L}'’-]*\W*$/u,
  /\b(?:applications?|applicants) (?:close|closing|via|to|will be (?:considered|contacted|reviewed))\b|\blate applications\b|\binterviews? (?:this|next|will)\b|\b(?:apply|text or call|call|email) (?:now|today|online|us)\b|\b(?:send|email) (?:us |her |him |them )?(?:your|an email|a cv)\b|\bbring your cv\b|\bfor (?:more information|a confidential (?:chat|discussion))\b|\bregister (?:your )?interest\b|\bk[oō]rero with\b|\btrial (?:day|shift)\b.*\b(?:on|at)\b/iu,
  /^\W*(?:pay(?:\s*:|\s+(?:is|rate|range|of|will be))|wages?|salary|rates? (?:is|are|depends?)|the pay rate|piece rates|hours are|shifts are|staff (?:get|benefits)|hours(?=\s*:|\s+\d)|benefits include|the package includes|the (?:practice|company|business|team) offers|role is paid|this is a (?:full|part)[- ]time)\b/iu,
  /\$\s?\d[\d,.]*\s*(?:k\b|-|–|to|per|an?\s+(?:hour|year)|\/\s*(?:hr|hour|h)\b|p\.?h\b)/iu,
  /\b(?:are|is) (?:all )?provided\.?$/iu,
];

/** Equal-opportunity and accessibility statements describe the employer, not the role:
 * "reasonable accommodations for … mental health", "committed to inclusion and diversity". */
const employerStatement =
  /\b(?:equal (?:employment )?opportunit(?:y|ies)(?: employer)?|EEO|reasonable (?:accommodations?|adjustments?)|regardless of (?:race|gender|age|religion|ethnicity|disability|background|sexual)|we (?:welcome|encourage) (?:applications|applicants|candidates|people) from|(?:committed to|value|celebrate|champion) (?:a )?(?:diversity|inclusion|equity|an inclusive))\b/i;

const directAsk = /\b(?:must|(?:need|needs|required) to|you(?:['’]ll| will)? need|essential)\b/i;

/** Build the checklist from an ad body (already redacted by the caller). */
export function buildPrepChecklist(title: string, body: string): PrepChecklist {
  const candidates = buildRequirementCandidates(body, {
    explicitOnly: true,
    limits: CHECKLIST_LIMITS,
  });
  // Only statements with stated years are summarised as years; the rest stay visible.
  const experienceIds = new Set(
    candidates.experience
      .filter((item) => item.minYears !== null || item.maxYears !== null)
      .map((item) => item.id),
  );
  const level = (segment: SourceSegment) => classifyRequirementLevel(segment, body);
  const byKey = new Map<string, PrepEntry>();
  const prepMaterials = new Map<string, PrepMaterial>();
  const other: PrepChecklist['other'] = [];
  for (const segment of candidates.skills) {
    if (employerStatement.test(segment.text)) continue;
    const classified = level(segment);
    // "Apply with your cover letter and CV" is logistics to the level classifier, but the
    // material it names is still something to prepare.
    const material =
      classified === 'not_requirement' &&
      asksApplicationMaterial(segment.text) &&
      !negatedRequirement.test(segment.text);
    if (classified === 'not_requirement' && !material) continue;
    const found: PrepLevel =
      classified === 'not_requirement'
        ? preferredMarker.test(segment.text)
          ? 'preferred'
          : 'required'
        : classified;
    let matched = false;
    for (const material of materials)
      if (materialPatterns.get(material.key)!.some((pattern) => pattern.test(segment.text))) {
        matched = true;
        const current = prepMaterials.get(material.key);
        if (!current || levelRank[found] < levelRank[current.level])
          prepMaterials.set(material.key, {
            key: material.key,
            level: found,
            label: material.label,
            source: segment,
          });
      }
    if (classified === 'not_requirement') continue;
    const entries = statementEntries(segment, found, level);
    for (const entry of entries) {
      matched = true;
      const key = `${entry.kind}:${entry.terms.map((term) => term.toLowerCase()).join('|')}`;
      const current = byKey.get(key);
      if (!current || levelRank[entry.level] < levelRank[current.level]) byKey.set(key, entry);
    }
    // Experience statements are summarised separately as years.
    // "You must complete a paid trial shift": an explicit ask outranks logistics wording.
    const logistics =
      perk.test(segment.text) ||
      (!directAsk.test(segment.text) && notAnAsk.some((p) => p.test(segment.text)));
    if (!matched && !experienceIds.has(segment.id) && !logistics)
      other.push({ ...segment, level: found });
  }
  return {
    entries: [...byKey.values()],
    materials: [...prepMaterials.values()],
    other,
    experience: candidates.experience.flatMap((segment) => {
      const found = level(segment);
      return found === 'not_requirement' ? [] : [{ ...segment, level: found }];
    }),
    estimate: estimateExperience(title, body),
    truncated: candidates.truncated,
  };
}
