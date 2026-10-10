/** Inferred experience band when the advert states no applicant duration. */
import type { SourceSegment } from '../core/source';
import { buildRequirementCandidates, numberToken, parseExperienceYears } from './candidates';
import { negatedRequirement, preferredMarker, requiredMarker } from './markers';
import { analyzeBody, AP, BULLET, statementSpans, type Statement } from './structure';
import type { LocalExperienceEstimate } from './types';

const numberWord = numberToken;
const durationNearExperience = new RegExp(
  `\\b${numberWord}\\s*\\+?\\s*(?:\\(\\d+\\)\\s*)?(?:or more\\s+)?[-–]?\\s*(?:years?|yrs?|months?|mths?)${AP}?\\b[^.\\n]{0,80}\\b(?:experience|experienced|background|working|worked|in (?:a|the|an) (?:similar|related)|post[- ]qualification|industry|practice|in the trade|on the tools|track record)\\b|\\b(?:experience|experienced|background)\\b[^.\\n]{0,60}\\b${numberWord}\\s*\\+?\\s*(?:years?|yrs?|months?)\\b`,
  'i',
);
const nonApplicantDuration =
  /\b(?:annual leave|parental leave|paid leave|weeks? (?:of )?leave|founded|established|years? of service|(?:fixed[- ]term|month|year) contract|contract (?:of|for)|over the (?:last|past|next)|for over|in business|in operation|serving)\b/i;

/** "Minimum 5 years as a chef", "- 2 years post-registration": an applicant duration even
 * without the word "experience". */
const requiredDuration = new RegExp(
  `\\b(?:minimum(?: of)?|at least|min\\.?|over|more than)\\s+${numberWord}\\s*\\+?\\s*(?:years?|yrs?|months?)\\b|^[-*•●▪]?\\s*${numberWord}\\s*\\+?\\s*(?:years?|yrs?)\\b(?!\\s*old)|\\b${numberWord}\\s*\\+?\\s*(?:years?|yrs?)${AP}?\\s+post[- ]?(?:registration|qualification|graduation|graduate)\\b`,
  'i',
);

function hasExplicitDuration(body: string): boolean {
  const candidates = buildRequirementCandidates(body);
  if (candidates.experience.some((item) => item.minYears !== null || item.maxYears !== null))
    return true;
  for (const item of candidates.skills) {
    const years = parseExperienceYears(item.text);
    if (years.minYears !== null || years.maxYears !== null) return true;
  }
  // Conservative fallback for multi-duration sentences the strict parser leaves unbounded.
  for (const { start, end } of statementSpans(body)) {
    const text = body.slice(start, end);
    if (
      (durationNearExperience.test(text) || requiredDuration.test(text.trim())) &&
      !nonApplicantDuration.test(text) &&
      !/\b(?:years? old|aged?|age of)\b/i.test(text)
    )
      return true;
  }
  return false;
}

type Band = LocalExperienceEstimate['band'];
interface Signal {
  band: Band | 'entry_support' | 'contra_entry' | 'senior_support' | 'independent' | 'guided';
  statement: Statement;
}

const negatedRole =
  /\b(?:not|isn['’]t|n['’]t|no|unsuitable|unlikely)\s+(?:\w+\s+){0,3}(?:an?\s+)?(?:entry[- ]level|graduate|junior|senior|trainee|apprentice\w*|suitable for)\b/i;
/** Statements that waive prior experience; "preferred" wording beside them still values it. */
const experienceWaiver = [
  /\bno (?:previous |prior |formal |paid |industry |relevant |\w+ ){0,3}(?:work )?experience (?:is |are )?(?:required|necessary|needed|essential)\b/i,
  /\b(?:previous |prior )?experience\b[^.]{0,30}\b(?:not|isn['’]t)\s+(?:required|necessary|needed|essential)\b/i,
  /\b(?:don['’]t|do not) (?:need|require) (?:any )?(?:previous |prior )?experience\b/i,
  /\bno experience\??\s*(?:[-–—,]\s*)?no (?:problem|worries)\b/i,
];
/** Entry-level roles, graduate and apprenticeship pathways, on-the-job training. */
const entryPathway = [
  /\bentry[- ]level\b/i,
  /\b(?:recent|new) (?:graduates?|grads?)\b|\bgraduate (?:role|position|programme|program|opportunity|intake|scheme)\b|\bschool[- ]leavers?\b/i,
  /\b(?:this|an?|the|your|our|paid) (?:\w+ ){0,2}(?:apprenticeship|traineeship|cadetship|internship)\b|\b(?:start|begin|kick[- ]?start)\w* (?:your|an?) (?:\w+ )?(?:apprenticeship|traineeship)\b|\bas an? (?:\w+ )?(?:apprentice|trainee|intern|cadet)\b|\b(?:apprentice|trainee)s? (?:role|position|opportunity)\b|\b(?:apprentices|trainees|graduates|students|beginners|career changers) (?:are |is )?(?:welcome|encouraged)\b/i,
  /\bwe(?:['’]ll| will)? (?:fully |happily )?(?:train|teach) you\b|\bwe (?:can|will) teach you (?:everything|all)\b/i,
  /\b(?:start|starting|begin|beginning|launch|kick[- ]?start)\w* (?:your|their|a) (?:\w+ )?career\b|\bfirst (?:job|role) in\b|\bno (?:previous |prior )?(?:industry )?experience\b[^.]{0,30}\b(?:welcome|fine|ok)\b/i,
];
/** Background experience that is explicitly optional: "Retail experience is preferred but not
 * essential", "Previous experience preferred, but we're happy to train". Tool-specific experience
 * ("Experience with Xero ...") is excluded: waiving one tool says nothing about career stage. */
const optionalExperience = new RegExp(
  `^(?=[^.]*\\bexperience\\b)(?![^.]*\\bexperience (?:with|using|of|on)\\b)[^.]*\\b(?:(?:not|isn${AP}t|aren${AP}t) (?:\\w+ )?(?:essential|required|necessary|needed|mandatory|compulsory|a must|a requirement)|(?:we${AP}re |we are |we${AP}ll |we will |we can )?(?:happy|willing|keen) to train|we(?:${AP}ll| will| can) (?:fully )?train)\\b`,
  'i',
);
/** A waiver limited to one group in a multi-role advert ("No experience necessary for shedhands"). */
const scopedWaiver =
  /\b(?:required|necessary|needed|essential)\s+for\s+(?!(?:this|the|our|these|any|anyone|someone|you|all)\b)[\w-]+/i;
/** "Some helpdesk experience" asks for a little prior experience, more than none. */
const someExperience =
  /(?<!\b(?:gain|get|build|develop|give you|giving you|offer|provide)\s+)\bsome (?:[\w-]+ ){0,3}experience\b/i;
const entryWeak =
  /\b(?:full|comprehensive|paid|on[- ]the[- ]job|structured|supervised) (?:\w+ )?training\b|\b(?:close|direct) supervision\b|\bunder (?:the )?supervision\b|\bwith (?:guidance|support) from\b|\bbuddy\b|\bmentor(?:ed|s)? (?:will|by)\b|\bmentor (?:checks|supports|guides)\b|\bwill be mentored\b/i;
const entryRoleContext =
  /\b(?:supervis\w*|mentor\w*|train(?:ing|s)?|manag\w*|oversee\w*|overseeing|lead(?:ing)?|coach\w*|guid\w*|support(?:ing)?|assess\w*|teach\w*|employ\w*|recruit\w*)\s+(?:\w+\s+){0,3}(?:apprentices|trainees|graduates|interns|cadets|junior\w*)\b|\bcomplet\w+ (?:an?|your|their) (?:\w+ )?(?:apprenticeship|traineeship)\b|\b(?:must be|you are|you['’]re|already|fully) (?:fully |trade[- ])?qualified\b|\b(?:post[- ]apprenticeship|finished (?:an?|your) apprenticeship)\b/i;
const contraEntry =
  /\b(?:proven|extensive|significant|substantial|considerable|demonstrated|solid|strong|previous|prior|relevant|proven track record)\s+(?:\w+\s+){0,3}(?:experience|track record)\b[^.]{0,80}\b(?:must|required|essential|necessary|need)\b|\b(?:must|required|essential|need)\b[^.]{0,40}\b(?:proven|extensive|significant|substantial|considerable)\s+(?:\w+\s+){0,2}experience\b|\b(?:extensive|significant|substantial|considerable) experience\b|\bexperienced (?:\w+ ){0,2}(?:professional|practitioner|leader|manager)\b|\bexperience\b[^.]{0,60}\b(?:is|are) (?:essential|required|a must|mandatory)\b|\b(?:must|need to|will) (?:have|hold|bring) (?:\w+ ){0,2}experience\b/i;
const seniorDuty =
  /\b(?:mentor|mentoring|mentors|coach|coaching)\s+(?:and \w+\s+)?(?:\w+\s+){0,2}(?:junior|other|less experienced|graduates?|team|staff|apprentices|engineers|developers|nurses|teachers|colleagues|coordinators|members|analysts|consultants|technicians|others)\b|\breview(?:ing|s)? (?:the )?work of\b|\bsupervis(?:e|es|ing) (?:a team|the team|junior|other|staff|a crew)\b|\b(?:technical|clinical|professional|team) leadership\b|\blead(?:ing|s)? (?:the |a |our |multiple |several )?(?:[\w-]+ ){0,3}(?:team|teams|crew|function|department|practice|design|architecture|strategy|programme|program|projects?|school|organisation|organization|business|division|unit|service|region)\b|\blead(?:ing|s)? (?:technical|complex|the development of|the delivery of)\b|\bsubject matter expert\b|\bhighly complex\b|\b(?:own|owning|owns|set|sets|setting|shape|shaping) (?:the |our )?(?:[\w-]+ ){0,2}(?:architecture|direction|strategy|roadmap|vision)\b/i;
const independence =
  /\b(?:independently|autonomously|autonomous|minimal (?:supervision|guidance)|without (?:close )?supervision|self[- ]directed|own (?:your|their) (?:own )?(?:work|caseload|projects?|portfolio)|end[- ]to[- ]end|manage (?:your|their) own|manag(?:e|ing) (?:a|your own|their own) (?:portfolio|caseload|book))\b/i;
const guided =
  /\b(?:under (?:the )?(?:guidance|supervision|direction)|with (?:guidance|support|mentoring)|supported by|mentored by|close supervision|learn from (?:our |the )?(?:senior|experienced))\b/i;
const seniorHireLanguage =
  /\b(?:looking for|seeking|seeks|searching for|recruiting|hiring|we need|we want) (?:an? |our |the )?(?:experienced )?senior(?:[- ]level)?\b/i;
const plainManagerTitle = /\bmanager\b/i;
const seniorTitleQualifier =
  /\b(?:senior|snr|sr|general|head|chief|executive|director|national|regional|group|principal|assistant|associate|trainee|junior|graduate|deputy|account|relationship|case|property)\b/i;
const roleNoun = '(?:role|position|level|post|appointment|opportunity|vacancy|hire)';

function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 3 &&
        !/^(?:senior|junior|intermediate|principal|head|lead|chief|level|with|from|based|full|time|part|contract|permanent|temporary|role|position|auckland|wellington|christchurch|hamilton|tauranga|dunedin|zealand)$/.test(
          word,
        ),
    );
}

/** A level word refers to this role when the body uses it with a role noun or the title's own words. */
function levelRefersToRole(text: string, level: string, words: string[]): boolean {
  const pattern = new RegExp(
    `\\b${level}\\b[- ]?(?:\\w+[- ]){0,2}?(?:${roleNoun}|${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '(?!x)x'})s?\\b|\\bas (?:an? |the |our )?${level}\\b|\\b${level}[- ]level\\b`,
    'i',
  );
  return pattern.test(text);
}

/** Experience waived as optional ("preferred but not essential") with no other hard marker. */
function optionalOnly(text: string): boolean {
  return (
    optionalExperience.test(text.replace(BULLET, '')) &&
    !requiredMarker.test(
      text.replace(
        /\bnot (?:\w+ )?(?:essential|required|necessary|needed|mandatory|compulsory|a must|a requirement)\b/gi,
        '',
      ),
    )
  );
}

/** Entry signals from any statement: they may sit under benefits ("No experience needed - we
 * will train you"). */
function entryBands(text: string): Signal['band'][] {
  const bands: Signal['band'][] = [];
  const negated = negatedRole.test(text);
  // "Experience is preferred but not required" still values experience: not an entry signal.
  const waiver = experienceWaiver.some((pattern) => pattern.test(text));
  const strong = waiver || entryPathway.some((pattern) => pattern.test(text));
  const preferredExperience = waiver && preferredMarker.test(text);
  if (
    !negated &&
    !entryRoleContext.test(text) &&
    !scopedWaiver.test(text) &&
    ((strong && !preferredExperience) || optionalOnly(text))
  )
    bands.push('zero_to_one');
  else if (!negated && entryWeak.test(text)) bands.push('entry_support');
  if (negated && /\b(?:entry[- ]level|graduate|junior|trainee|apprentice)/i.test(text))
    bands.push('contra_entry');
  return bands;
}

/** "Junior" names this role, not junior staff or students, nor the people the role develops. */
function juniorRole(text: string, words: string[]): boolean {
  return (
    levelRefersToRole(text, 'junior', words) &&
    !/\bjunior (?:school|students?|classes|science|syndicate|staff|team members?|colleagues|members)\b/i.test(
      text,
    ) &&
    !/\b(?:mentor\w*|supervis\w*|lead\w*|manag\w*|coach\w*|guid\w*|support\w*|train\w*)\s+(?:\w+\s+){0,2}junior/i.test(
      text,
    )
  );
}

/** "Some X experience" asked for firmly, not preferred, waived or offered. */
function someExperienceAsked(text: string): boolean {
  return (
    someExperience.test(text) &&
    !preferredMarker.test(text) &&
    !negatedRequirement.test(text) &&
    !optionalExperience.test(text)
  );
}

function intermediateRole(text: string, words: string[]): boolean {
  return (
    (levelRefersToRole(text, 'intermediate', words) ||
      levelRefersToRole(text, 'mid[- ]level', words)) &&
    !/\bintermediate (?:excel|english|level of|skills?|knowledge|proficiency|word|computer)\b/i.test(
      text,
    ) &&
    // "Mentor intermediate engineers" describes the people this role develops.
    !/\b(?:mentor\w*|supervis\w*|lead\w*|manag\w*|coach\w*|guid\w*|support\w*|train\w*|review\w*|by|of)\s+(?:\w+\s+){0,2}intermediate/i.test(
      text,
    )
  );
}

/** "Senior" names this role and the title or the body confirms a senior hire. */
function seniorRole(text: string, title: string, words: string[]): boolean {
  const senior =
    levelRefersToRole(text, 'senior', words) &&
    !/\bsenior (?:leadership|management|managers?|leaders?|executives?|staff|citizens|students?|school|classes|team(?! lead)|colleagues|clinicians?|nurses? (?:will|are)|developers? (?:will|are)|engineers? (?:will|are)|members)\b/i.test(
      text,
    ) &&
    !/\b(?:report\w*|support\w*|assist\w*|under|with|from|by|to)\s+(?:\w+\s+){0,2}senior\b/i.test(
      text,
    );
  // The body names the hire itself as senior ("seeking a senior-level engineer").
  const seniorHire = seniorHireLanguage.test(text) && !negatedRole.test(text);
  return senior && (/\b(?:senior|snr|sr)\b/i.test(title) || seniorHire);
}

/** A principal, head-of or chief title that the body confirms. */
function topRole(text: string, title: string, words: string[]): boolean {
  return (
    /\b(?:principal|head of|chief|lead architect)\b/i.test(title) &&
    (levelRefersToRole(text, 'principal', words) ||
      /\bhead of\b/i.test(text) ||
      /\bchief\b/i.test(text) ||
      /\blead architect\b/i.test(text)) &&
    !/\bprincipal (?:duties|responsibilities|tasks|place of|purpose|activities|contact)\b/i.test(
      text,
    ) &&
    !/\b(?:report\w*|support\w*|assist\w*|under|with|from|by|to)\s+(?:the\s+)?(?:\w+\s+){0,1}(?:principal|head of|chief)\b/i.test(
      text,
    )
  );
}

/** Level and scope signals from a statement about the role itself. */
function roleBands(text: string, title: string, words: string[]): Signal['band'][] {
  if (negatedRole.test(text)) return [];
  const bands: Signal['band'][] = [];
  if (contraEntry.test(text) && !negatedRequirement.test(text)) bands.push('contra_entry');
  if (seniorDuty.test(text)) bands.push('senior_support');
  if (independence.test(text)) bands.push('independent');
  if (guided.test(text)) bands.push('guided');
  if (juniorRole(text, words)) bands.push('one_to_three');
  if (someExperienceAsked(text)) bands.push('one_to_three');
  if (intermediateRole(text, words)) bands.push('three_to_five');
  if (seniorRole(text, title, words)) bands.push('five_to_eight');
  if (topRole(text, title, words)) bands.push('eight_plus');
  return bands;
}

/** Company, benefits and apply sections say nothing about the role's level. */
function describesRole(statement: Statement): boolean {
  return (
    statement.section.kind !== 'company' &&
    statement.section.kind !== 'benefits' &&
    statement.section.kind !== 'apply'
  );
}

/** All entry signals in body order, then all role signals in body order. */
function collectSignals(title: string, body: string): Signal[] {
  const statements = analyzeBody(body).filter((statement) => !statement.structural);
  const words = titleWords(title);
  const signals: Signal[] = [];
  for (const statement of statements)
    for (const band of entryBands(statement.text)) signals.push({ band, statement });
  for (const statement of statements.filter(describesRole))
    for (const band of roleBands(statement.text, title, words)) signals.push({ band, statement });
  return signals;
}

/** Up to three distinct statements behind the given signal kinds, in signal order. */
function evidenceFor(signals: Signal[], kinds: Signal['band'][]): SourceSegment[] {
  const seen = new Set<number>();
  const evidence: SourceSegment[] = [];
  for (const signal of signals) {
    if (!kinds.includes(signal.band) || seen.has(signal.statement.start)) continue;
    seen.add(signal.statement.start);
    const { start, end, text } = signal.statement;
    evidence.push({ id: `estimate_${evidence.length + 1}`, text, start, end });
    if (evidence.length >= 3) break;
  }
  return evidence;
}

interface Tally {
  bands: Set<Band>;
  has: (band: Signal['band']) => boolean;
  /** The band with evidence from the given signal kinds; null without evidence. */
  result: (band: Band, ...kinds: Signal['band'][]) => LocalExperienceEstimate | null;
}

function tally(signals: Signal[]): Tally {
  const bands = new Set(
    signals
      .map((signal) => signal.band)
      .filter((band): band is Band =>
        ['zero_to_one', 'one_to_three', 'three_to_five', 'five_to_eight', 'eight_plus'].includes(
          band,
        ),
      ),
  );
  const has = (band: Signal['band']) => signals.some((signal) => signal.band === band);
  const result = (band: Band, ...kinds: Signal['band'][]): LocalExperienceEstimate | null => {
    const evidence = evidenceFor(signals, kinds);
    return evidence.length ? { band, evidence } : null;
  };
  return { bands, has, result };
}

/** Entry level: junior and entry signals agree on zero_to_one. */
function entryEstimate({ bands, has, result }: Tally): LocalExperienceEstimate | null {
  if (
    has('contra_entry') ||
    bands.has('three_to_five') ||
    bands.has('five_to_eight') ||
    bands.has('eight_plus') ||
    has('senior_support')
  )
    return null;
  // A junior title with "graduates welcome" still reads as entry level.
  return result('zero_to_one', 'zero_to_one', 'one_to_three');
}

/** A first-line manager (no senior/general/head qualifier) who leads a team and must bring
 * prior experience: established, but not senior-level, practice. */
function firstLineManager(title: string, { bands, has }: Tally): boolean {
  return (
    bands.size === 0 &&
    plainManagerTitle.test(title) &&
    !seniorTitleQualifier.test(title) &&
    has('senior_support') &&
    has('contra_entry') &&
    !has('guided')
  );
}

/** One band signalled: scope signals confirm, shift or veto it. */
function singleBandEstimate(band: Band, { has, result }: Tally): LocalExperienceEstimate | null {
  if (band === 'one_to_three') {
    if (has('senior_support')) return null;
    return result('one_to_three', 'one_to_three');
  }
  if (band === 'three_to_five') {
    if (has('independent') && !has('guided'))
      return result('three_to_five', 'three_to_five', 'independent');
    // An intermediate role that also leads small projects or supervises graduates works
    // without close guidance.
    if (has('senior_support') && !has('guided'))
      return result('three_to_five', 'three_to_five', 'senior_support');
    if (has('guided') && !has('independent'))
      return result('one_to_three', 'three_to_five', 'guided');
    return null;
  }
  if (band === 'five_to_eight') {
    // A senior title confirmed in the body still needs senior-level scope.
    if (!has('senior_support') && !has('independent')) return null;
    return result('five_to_eight', 'five_to_eight', 'senior_support', 'independent');
  }
  if (band === 'eight_plus') {
    if (!has('senior_support') && !has('independent')) return null;
    return result('eight_plus', 'eight_plus', 'senior_support');
  }
  return null;
}

/** Conservative inferred band; null whenever an explicit duration exists or evidence is weak. */
export function estimateExperience(title: string, body: string): LocalExperienceEstimate | null {
  if (!body.trim() || hasExplicitDuration(body)) return null;
  const signals = tally(collectSignals(title, body));
  if (signals.bands.has('zero_to_one')) return entryEstimate(signals);
  if (firstLineManager(title, signals))
    return signals.result('three_to_five', 'senior_support', 'contra_entry');
  if (signals.bands.size !== 1) return null;
  const [band] = [...signals.bands] as [Band];
  return singleBandEstimate(band, signals);
}
