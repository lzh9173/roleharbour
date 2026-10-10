/** On-device requirement strength and inferred experience range.
 *
 * Pure, synchronous rules over the exact submitted body. Every evidence segment quotes the body
 * exactly (body.slice(start, end) === text). The estimate (./experience) abstains (null) whenever
 * the advert states an explicit applicant duration or the evidence is weak or contradictory.
 */
import type { SourceSegment } from '../core/source';
import { negatedRequirement, preferredMarker, requiredMarker } from './markers';
import {
  analyzeBody,
  AP,
  BULLET,
  contextOf,
  type Context,
  type Statement,
  type Strength,
} from './structure';
import type { LocalRequirementLevel } from './types';

// ---------------------------------------------------------------------------
// Statement-level strength.

const employerProvision = new RegExp(
  `\\b(?:(?:full|paid|free|on[- ]the[- ]job|comprehensive|ongoing|structured|supervised|in[- ]house|extensive|thorough|initial) (?:\\w+ ){0,2}(?:training|induction|orientation)|training (?:is |will be |can be )?(?:provided|given|available|included|offered|supplied)|training (?:covers|includes)|(?:is|are|will be|can be|being) (?:provided|supplied|included|covered|arranged|given|offered|paid for|funded)|(?:we|the (?:company|employer|business|team))(?:${AP}ll| will| can)? (?:also )?(?:train|teach|show|support|provide|supply|pay|cover|fund|arrange|help)\\b|\\b(?:put|take) you through\\b|\\btraining\\b[^.]{0,30}\\b(?:with|through) us\\b|(?:includes?|receive|offers?) (?:a |an )?(?:paid |supervised |structured )?(?:induction|orientation|training)|new starters receive|you will receive|you${AP}ll receive)`,
  'i',
);
const benefitLanguage = new RegExp(
  `\\b(?:we offer|we provide|on offer|salary|remuneration|pay rate|hourly rate|per hour|per annum|\\$\\s?\\d|kiwisaver|annual leave|parental leave|sick leave|paid leave|leave entitlements?|staff discounts?|discounts?|bonus scheme|performance bonus|incentives?|(?:staff |employee |team )(?:wellbeing|wellness)|(?:wellbeing|wellness) (?:programmes?|programs?|support|allowance|initiatives?|days?|leave|benefits?|budget|subsidy|package|hub)|health insurance|medical insurance|life insurance|free (?:parking|meals|lunch)|staff meals|car park|company (?:car|vehicle|phone|laptop)|career (?:progression|development|growth|pathway)|professional development|study support|employee assistance|social club|team (?:events|lunches)|flexible (?:working|hours|work)|work[- ]life balance)\\b`,
  'i',
);
/** Employer-side subject: what we offer, provide or arrange is never an applicant requirement. */
const employerSubject = new RegExp(
  `^\\s*(?:(?:and|but|plus)\\s+)?(?:we|we${AP}(?:ll|re|ve)|our|the (?:company|employer|business|team) (?:will|offers|provides)|you${AP}?(?:ll| will) (?:receive|get|enjoy))\\b(?!\\s+(?:need|require|are looking|are seeking|want|expect))`,
  'i',
);
const workRightsLanguage =
  /\b(?:(?:required|necessary|immigration) permission|permission to work|work rights|right to work|entitled to work|eligib\w+ to work|legally (?:able|entitled) to work|work (?:visa|permit)|visas?|sponsor\w*|citizen\w*|permanent resid\w*|residency|resident class)\b/i;
/** Text addressed to a machine reader ("ignore previous instructions") asks nothing of
 * applicants. Job words such as "assistant" or "LLM" are ordinary role vocabulary. */
const injectionLanguage =
  /\b(?:ignore (?:all |any |the |previous |prior )+(?:instructions|rules)|system prompt)\b/i;
const companyLanguage =
  /\b(?:founded|established) (?:in )?(?:19|20)\d{2}\b|\bwe(?:['’]ve| have) been\b|\b(?:our|the) (?:company|business|organisation|organization|team|clinic|practice|school) (?:is|has|was|prides|values|operates)\b/i;
const capabilityLanguage =
  /(?<![-‐‑])\b(?:experience[ds]?|skills?|skilled|knowledge|knowledgeable|abilit(?:y|ies)|able to|capable|proficien\w*|familiar\w*|fluen\w*|competen\w*|licen[cs](?:e[ds]?|ing)|certificat\w*|certified|qualifi\w*|degree|diploma|registration|registered|accredit\w*|understanding of|background in|track record|confident (?:with|in|using)|comfortable (?:with|using)|endorsement|clearance|vetting|police check|first aid|tertiary|trade[- ]qualified|apprenticeship|passion\w*|attitude|communicat\w*|attention to detail|work ethic|reliab\w*|motivated|team player|literate|numerate|literacy|numeracy|friendly|enthusiastic|hard[- ]?working|honest|punctual|organi[sz]ed|self[- ]motivated|customer[- ](?:focused|focussed)|physically fit|energetic|caring|compassionate|empathetic|adaptable|resilient|proactive)\b/i;
const applicantSubject = new RegExp(
  `^(?:[-*•●▪]\\s*)?(?:(?:you|applicants?|candidates?|(?:the|our) (?:successful|ideal|right) (?:candidate|applicant|person)|(?:we${AP}re|we are) (?:looking for|seeking|after)|(?:we${AP}d|we would) love)\\b[^.]{0,40}\\b(?:have|hold|has|possess|bring|be (?:a|an|able|confident|comfortable|proficient|skilled|experienced|familiar|competent|qualified|registered|licensed|fluent|highly)|are (?:a|an|able|confident|comfortable|proficient|skilled|experienced|familiar|competent|qualified|registered|licensed|fluent|highly)|someone|a person|candidates?|people|individuals?|should|with)\\b)`,
  'i',
);
const capabilityPhrase =
  /^(?:(?:strong|good|great|excellent|proven|solid|sound|demonstrated|relevant|previous|prior|current|valid|full|working|basic|advanced|high|some|in[- ]depth|hands[- ]on|practical|commercial|a|an)\s+)*(?:[\w./+#&-]+\s+){0,3}?(?:experience|skills?|knowledge|abilit(?:y|ies)|proficiency|familiarity|understanding|licen[cs]e|certificate|certification|qualification|degree|diploma|registration|endorsement|clearance|fluency|track record)\b/i;
/** "Xero experience is welcome" prefers a capability; "Graduates are welcome to apply" does not. */
const welcomeCapability =
  /\b(?:experience|knowledge|skills?|familiarity|qualifications?|licen[cs]es?|certificat\w+|exposure)\b[^.]{0,80}\b(?:is|are|would be|also) (?:very |most |highly )?welcome(?:d)?\b(?! to apply)/i;
/** The vacancy itself being "needed" is not an applicant requirement. */
const vacancyAnnouncement =
  /^(?:[-*•●▪]\s*)?(?:(?:an?|the|two|several|\d+)\s+(?:[\w-]+\s+){0,6}(?:is|are)\s+(?:urgently\s+)?(?:needed|required|wanted|sought)\b(?!\s+to\s+(?:have|hold|be|possess))|we (?:urgently )?(?:need|require) (?:an?|two|several|\d+)\s)/i;
/** Calls to action under a requirements heading ("Apply now with your CV"). */
const callToAction =
  /^(?:[-*•●▪]\s*)?(?:apply|please|send|email|submit|click|contact|call|get in touch|to apply|if this sounds)\b/i;
/** "This role would suit someone with some X experience" describes fit, not a stated status. */
const roleSuitability =
  /^(?:[-*•●▪]\s*)?(?:this|the|our) (?:\w+ )?(?:role|position|job|opportunity) (?:would |will |may |could )?(?:best |ideally )?suits? (?:someone|a person|people|candidates?|applicants?|an? [\w-]+(?: [\w-]+)?) (?:with|who)\b/i;
/** Possessions the applicant brings ("Your own tools", "Own transport"). */
const ownPossession =
  /^(?:[-*•●▪]\s*)?(?:(?:have|has|with|bring) )?(?:(?:your|their) own|own (?:reliable )?(?:transport|vehicle|car|tools?|gear|equipment|kit|ppe|boots|laptop))\b/i;
/** A future-tense description of the job itself, not something asked of the applicant. */
const roleDescription = new RegExp(
  `^(?:[-*•●▪]\\s*)?(?:(?:the|our) (?:successful|ideal|right) (?:candidate|applicant|person) will (?:also )?(?!(?:need|have|hold|be|possess|bring|demonstrate|show|ideally|preferably|require|already|must|enjoy|thrive)\\b)[a-z]+\\b|you(?:${AP}ll| will) (?:also )?(?:get to|be (?:working|joining|part of|responsible|involved|based|reporting)|join|work (?:with|alongside|closely|in|on|from)|report to|learn|receive|have (?:the )?(?:opportunity|chance|input|access|support)))\\b`,
  'i',
);
/** "X experience is good, but we're happy to train": a concessive training offer makes the
 * capability optional. */
const concessiveTraining = new RegExp(
  `\\b(?:but|though|although|however)\\b[^.]{0,20}?\\b(?:we${AP}?(?:re| are)? (?:happy|willing|keen|able) to (?:train|teach)|we(?:${AP}ll| will| can| do) (?:\\w+ )?(?:train|teach)|(?:full |on[- ]the[- ]job )?training (?:is |will be |can be )?(?:provided|available|given|offered))\\b`,
  'i',
);
/** A trailing "ideally ..." clause, or a parenthetical that carries its own preference. */
const refinement =
  /(?:[,;]\s*|\s[-–—]\s*|\s)(?:and |but |or )?(?:ideally|preferably)\b[^.;()]*$|\s*\(([^()]*)\)\s*\.?$/i;
const preferredMarkerAll = new RegExp(preferredMarker.source, 'gi');
const refinementFiller =
  /\b(?:ideally|preferably|with|on|in|at|a|an|the|is|are|be|would|will|and|but|or|of|for|some|any|also|very|highly|definitely|really|big|huge|real|nice|great|plus|bonus|advantage|advantageous|desirable|desired|preferred|preferable|beneficial|helpful|useful|valued|welcome|handy|regarded|well|considered|it|that|this|if|you|have)\b/gi;

/** "Full driver licence, ideally with a heavy vehicle class" and "A driver licence (Class 2
 * preferred)": a capability followed by a closing preference that names something narrower.
 * The refinement does not change the status of the head capability. A bare annotation such as
 * "(an advantage)" names nothing new and applies to the whole item instead. */
function preferenceRefinesHead(content: string): boolean {
  const match = refinement.exec(content);
  if (!match || !match.index) return false;
  const head = content.slice(0, match.index);
  const tail = match[1] ?? match[0];
  if (!capabilityLanguage.test(head) || preferredMarker.test(head) || welcomeCapability.test(head))
    return false;
  if (!preferredMarker.test(tail)) return false;
  // "(preferred but not essential)" annotates the whole item; it narrows nothing.
  if (negatedRequirement.test(tail)) return false;
  const residue = tail
    .replace(preferredMarkerAll, ' ')
    .replace(refinementFiller, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return residue.length > 0;
}

type ClauseSignal = Strength | 'negated' | 'provision' | 'none';

function clauseSignal(clause: string): ClauseSignal {
  if (workRightsLanguage.test(clause)) return 'none';
  if (negatedRequirement.test(clause)) return 'negated';
  const required =
    requiredMarker.test(clause) &&
    !(vacancyAnnouncement.test(clause) && !capabilityLanguage.test(clause));
  const preferred = preferredMarker.test(clause) || welcomeCapability.test(clause);
  const provision = employerProvision.test(clause);
  const benefit = benefitLanguage.test(clause);
  if ((provision || benefit) && employerSubject.test(clause)) return 'provision';
  // "All required PPE is supplied": the marker describes what the employer provides.
  if (provision && /\b(?:all|any|the) (?:required|necessary|essential)\b/i.test(clause))
    return 'provision';
  if (provision && !required && !preferred) return 'provision';
  if (benefit && !capabilityLanguage.test(clause)) return 'provision';
  if (required && preferred) return 'none';
  return required ? 'required' : preferred ? 'preferred' : 'none';
}

const clauseSplitter =
  /[,;()[\]]|\s[-–—]\s|\s(?=(?:but|and|although|though|however|because|since|while|whereas|as|so|plus|with)\s)/i;

function statementSignals(text: string): Set<ClauseSignal> {
  const signals = new Set<ClauseSignal>();
  const clauses = text.split(clauseSplitter).filter((clause) => /\p{L}/u.test(clause));
  for (const clause of clauses) signals.add(clauseSignal(clause));
  // A marker split across clauses ("Need to pass a drug and alcohol test") still counts.
  if (![...signals].some((signal) => signal !== 'none') && clauses.length > 1) {
    const whole = clauseSignal(clauses.join(' '));
    if (whole === 'required') signals.add(whole);
  }
  // Mixed strength inside one unsplittable clause also counts as mixed.
  const relevant = clauses.filter((clause) => !workRightsLanguage.test(clause)).join(' ');
  if (
    requiredMarker.test(relevant) &&
    (preferredMarker.test(relevant) || welcomeCapability.test(relevant)) &&
    !negatedRequirement.test(relevant) &&
    !(signals.has('provision') && !signals.has('required'))
  ) {
    signals.add('required');
    signals.add('preferred');
  }
  return signals;
}

/** True when a statement is only about work rights, visas or residency (asked separately). */
function onlyWorkRights(text: string): boolean {
  if (!workRightsLanguage.test(text)) return false;
  const clauses = text.split(clauseSplitter).filter((clause) => /\p{L}/u.test(clause));
  return !clauses.some(
    (clause) => !workRightsLanguage.test(clause) && capabilityLanguage.test(clause),
  );
}

/** "-ing" adjectives that describe a person rather than an activity. */
const ingAdjective =
  /^(?:willing|outgoing|caring|loving|hard[- ]?working|easy[- ]?going|engaging|understanding|outstanding|forward[- ]thinking|enterprising|amazing|interesting|inspiring|motivating|enduring|accommodating|uncompromising|unwavering|thriving|growing|aspiring)$/i;
/** Possession and state verbs describe the applicant, not an activity of the job. */
const stativeItem =
  /^(?:have|has|having|hold|holds|holding|possess|possessing|be|being|bring|know|speak|can|are|is)\b/i;

/** Lead-ins such as "You'll be:" and "You will:" are decided by each list item's own verb.
 * "You'll be: milking cows" lists duties; "You'll be: a registered nurse" lists attributes.
 * "You will: hold a licence" states a requirement; "You will: plan menus" a duty. */
function verbDecided(content: string, governing: Context): Context {
  const first = /^[\p{L}'’-]+/u.exec(content)?.[0] ?? '';
  if (governing.byVerb === 'be') {
    const activity = /ing$/i.test(first) && !ingAdjective.test(first) && !stativeItem.test(first);
    return activity ? { kind: 'duties' } : { kind: 'requirements', level: governing.level };
  }
  if (
    governing.byVerb === 'will' &&
    stativeItem.test(first) &&
    !/^be (?:responsible|working|involved|part of|based|reporting|joining)\b/i.test(content)
  )
    return { kind: 'requirements' };
  return governing;
}

const rankedCache = new WeakMap<Statement, boolean>();

/** An explicit required or preferred wording that marks a list item as an applicant requirement. */
function explicitlyRanked(statement: Statement): boolean {
  const cached = rankedCache.get(statement);
  if (cached !== undefined) return cached;
  const content = statement.text.replace(BULLET, '');
  const signals = onlyWorkRights(content) ? new Set<ClauseSignal>() : statementSignals(content);
  const ranked = signals.has('required') || signals.has('preferred');
  rankedCache.set(statement, ranked);
  return ranked;
}

/** The context that decides an unmarked statement: lead-in, then section, then the list itself.
 * A list without any heading whose other items say "must", "required" or "preferred" is a list
 * of requirements, so its unmarked items share that reading. */
function governingContext(
  content: string,
  base: Context,
  statement: Statement | undefined,
  body: string,
): Context {
  const governing = verbDecided(content, base);
  if (governing.kind !== 'none' || statement?.list === undefined) return governing;
  const siblings = analyzeBody(body).filter(
    (item) => item.list === statement.list && item !== statement,
  );
  return siblings.some(explicitlyRanked) ? { kind: 'requirements' } : governing;
}

/** Headings, lead-ins, work-rights-only and injected text are never requirements. */
function outOfScope(text: string, content: string, context: Statement | undefined): boolean {
  if (context?.structural || (/:\s*$/.test(text) && content.split(/\s+/).length <= 22)) return true;
  return onlyWorkRights(content) || injectionLanguage.test(text);
}

/** Company prose without required or preferred wording of its own. */
function companyOnly(text: string, section: Context): boolean {
  return (
    (section.kind === 'company' || companyLanguage.test(text)) &&
    !requiredMarker.test(text) &&
    !preferredMarker.test(text)
  );
}

/** Inline labels such as "Desirable: forklift licence". */
function labelledLevel(content: string): LocalRequirementLevel | undefined {
  const inline =
    /^(essential|required|requirements?|mandatory|must[- ]haves?|minimum|desirable|preferred|nice[- ]to[- ]haves?|bonus(?: points)?|advantageous|highly regarded|an advantage)\s*[:–—-]\s*\S/i.exec(
      content,
    );
  if (!inline) return undefined;
  return /^(?:desirable|preferred|nice|bonus|advantageous|highly|an advantage)/i.test(inline[1]!)
    ? 'preferred'
    : 'required';
}

/** A capability softened by fit wording ("would suit someone with") or a training concession. */
function softenedLevel(content: string): LocalRequirementLevel | undefined {
  if (
    roleSuitability.test(content) &&
    capabilityLanguage.test(content) &&
    !requiredMarker.test(content) &&
    !preferredMarker.test(content)
  )
    return 'unclear';
  const concession = concessiveTraining.exec(content);
  if (
    concession &&
    capabilityLanguage.test(content.slice(0, concession.index)) &&
    !negatedRequirement.test(content.slice(0, concession.index))
  )
    return 'preferred';
  return undefined;
}

/** "Minimum two years of driving, ideally on heavy trucks": the preference only narrows. */
function mixedLevel(content: string): LocalRequirementLevel {
  const head = content.slice(0, refinement.exec(content)?.index ?? 0);
  return preferenceRefinesHead(content) && requiredMarker.test(head) ? 'required' : 'unclear';
}

/** A preference that only refines a capability its context already expects stays required. */
function preferredLevel(
  content: string,
  governing: Context,
  section: Context,
): LocalRequirementLevel {
  const defaultRequired =
    (governing.kind === 'requirements' &&
      (governing.level ?? section.level ?? 'required') === 'required') ||
    (governing.kind === 'none' && applicantSubject.test(content));
  return defaultRequired && preferenceRefinesHead(content) ? 'required' : 'preferred';
}

/** The statement's own required or preferred markers, negations and employer provisions. */
function markedLevel(
  content: string,
  governing: Context,
  section: Context,
): LocalRequirementLevel | undefined {
  const signals = statementSignals(content);
  const required = signals.has('required');
  const preferred = signals.has('preferred');
  if (required && preferred) return mixedLevel(content);
  if (required) return 'required';
  if (preferred) return preferredLevel(content, governing, section);
  if (signals.has('negated') || signals.has('provision')) return 'not_requirement';
  // Clause splitting can separate "training" from "with us"; check the whole statement too.
  if (employerProvision.test(content)) return 'not_requirement';
  if (benefitLanguage.test(content) && !capabilityLanguage.test(content)) return 'not_requirement';
  return undefined;
}

/** An unmarked item under a requirements heading or lead-in. */
function listedLevel(
  content: string,
  governing: Context,
  section: Context,
  leadIn: Context | undefined,
): LocalRequirementLevel {
  if (callToAction.test(content) && !capabilityLanguage.test(content)) return 'not_requirement';
  if (roleDescription.test(content) && !capabilityLanguage.test(content)) return 'not_requirement';
  if (
    !applicantSubject.test(content) &&
    /^(?:we|our|this role|the role|this position|you will be responsible)\b/i.test(content)
  )
    return capabilityLanguage.test(content) ? 'unclear' : 'not_requirement';
  return governing.level ?? (leadIn && section.level ? section.level : 'required');
}

/** Unsectioned prose: an applicant-addressed capability reads as expected of applicants. */
function proseLevel(content: string): LocalRequirementLevel {
  if (ownPossession.test(content)) return 'required';
  if (applicantSubject.test(content) && capabilityLanguage.test(content)) return 'required';
  if (/^(?:[-*•●▪]\s*)?(?:you|applicants?|candidates?)\s+(?:should|shall)\b/i.test(content))
    return 'required';
  // A bare capability phrase ("Experience with Xero.") states a capability without its status.
  if (capabilityPhrase.test(content) && content.split(/\s+/).length <= 20) return 'unclear';
  return 'not_requirement';
}

/** No explicit wording: the governing lead-in, then the section heading decide. */
function contextLevel(
  content: string,
  governing: Context,
  section: Context,
  leadIn: Context | undefined,
): LocalRequirementLevel {
  if (governing.kind === 'requirements') return listedLevel(content, governing, section, leadIn);
  if (governing.kind !== 'none') return 'not_requirement';
  return proseLevel(content);
}

/** Decide the strength of one candidate statement using its own wording and its context in body. */
export function classifyRequirementLevel(
  excerpt: SourceSegment,
  body: string,
): LocalRequirementLevel {
  const text = excerpt.text.trim();
  const content = text.replace(BULLET, '');
  if (!/[\p{L}\p{N}]/u.test(content)) return 'not_requirement';
  const context = contextOf(excerpt, body);
  if (outOfScope(text, content, context)) return 'not_requirement';
  const section: Context = context?.section ?? { kind: 'none' };
  if (companyOnly(text, section)) return 'not_requirement';
  const leadIn = context?.leadIn;
  const governing = governingContext(content, leadIn ?? section, context, body);
  return (
    labelledLevel(content) ??
    softenedLevel(content) ??
    markedLevel(content, governing, section) ??
    contextLevel(content, governing, section, leadIn)
  );
}
