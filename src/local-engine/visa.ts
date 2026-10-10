/** On-device visa sponsorship, existing work-rights and citizen/resident-only classification.
 * Pure rules over exact source statements; precision is preferred over recall because a wrong
 * visa label misleads migrants. The three dimensions are independent. */
import { statementSpans } from './structure';
import type { SourceSegment } from '../core/source';
import type {
  LocalDecision,
  LocalVisaDecisions,
  ResidencyChoice,
  SponsorshipChoice,
  WorkRightsChoice,
} from './types';

type Dimension = 'sponsorship' | 'workRights' | 'residency';
type Polarity = 'positive' | 'negative';

const MAX_EVIDENCE_PER_SIDE = 3;
/** Long unpunctuated statements are quoted at clause level instead. */
const MAX_STATEMENT_EVIDENCE = 320;
const MAX_TERMS_PER_CLAUSE = 8;

const NZ = String.raw`(?:new\s+zealand|nz|aotearoa)`;

/** Cheap gate so ordinary statements skip all further work. */
const RELEVANT =
  /visa|sponsor|work(?:ing)?\s+rights?|rights?\s+to\s+(?:live\s+and\s+)?work|to\s+work|(?:already|legally|lawfully)\s+work|work\s+(?:eligibility|entitlement|authori[sz]ation)|citizen|residen|\bPR\b|AEWV|accredited\s+employer|immigration|work\s+permit|regardless|non[-\s]?(?:residents?|citizens?|NZers)|international|overseas|offshore|abroad|foreign|migrant/i;

/** Litotes read as possibility: "sponsorship is not out of the question". Same length keeps offsets. */
const LITOTES =
  /\bnot\s+(?:out\s+of\s+the\s+question|off\s+the\s+table|ruled\s+out|impossible)\b/gi;

/** Phrases replaced by spaces (offsets preserved) before any polarity test. */
const MASKS: RegExp[] = [
  // Negators that do not negate anything visa-related.
  /\b(?:no|not)\s+(?:problem|problems|matter|only|just|later|more|less|fewer|exception|doubt|worries|stone\s+unturned|two\s+days)\b/gi,
  // "Not guaranteed" qualifies an offer instead of refusing it.
  /\b(?:(?:is|are|will\s+be)\s+)?not\s+guaranteed\b|\b(?:cannot|can['’]t|can\s+not)\s+(?:be\s+)?guarantee(?:d)?\b|\bno\s+guarantees?\b/gi,
  // Payment-card Visa.
  /\bvisa\s*(?:\/|,|&|and|or)\s*(?:master\s*card|amex|eftpos|american\s+express)\b|\b(?:master\s*card|amex|eftpos)\s*(?:\/|,|&|and|or)\s*visa\b|\bvisa\s+(?:card|cards|debit|credit|payments?|pay\s*wave|paywave|checkout|inc|network|gift)\b/gi,
];

/** Text addressed to a machine reader is never evidence. Job words such as "LLM" or
 * "classifier" are ordinary role vocabulary and do not count. */
const INJECTION =
  /\bignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier|preceding)\b|\b(?:set|mark|classify|label|return)\s+(?:this\s+(?:job|role|ad)|(?:the\s+)?(?:visa|sponsorship|work\s+rights|residency))\b|\bsystem\s+prompt\b/i;

/** First-person answer options of SEEK screening questions. */
const ANSWER_OPTION = /^(?:I['’]m|I\s+am|I\s+have|I\s+hold|I\s+require|I\s+need|I\s+do)\b/i;

const NEGATION = /(?:\b(?:not|no|never|cannot|unable|nor|neither|nil)\b|n['’]t\b)/i;
const NEG_CONSEQUENCE =
  /\b(?:(?:please\s+)?(?:do\s+not|don['’]t)\s+apply|need\s+not\s+apply|(?:will|would|can|could)\s+not\s+be\s+(?:considered|accepted|progressed|shortlisted|processed|assessed|reviewed)|(?:cannot|can['’]t|won['’]t)\s+be\s+(?:processed|assessed|reviewed)|(?:will|would)\s+be\s+(?:declined|rejected|disregarded)|(?:cannot|can['’]t|can\s+not|unable\s+to|not\s+able\s+to|won['’]t|will\s+not|wouldn['’]t|would\s+not)\s+(?:be\s+)?(?:able\s+to\s+)?(?:consider|accept|progress|shortlist)\w*|(?:are|is)\s+not\s+eligible|ineligible|unsuccessful|unfortunately)\b/i;
/** An explicit exclusion of some applicants (narrower than NEG_CONSEQUENCE: no "unfortunately").
 * The strict form leaves out "only", which may restrict an offer instead of excluding anyone. */
const STRICT_EXCLUSION =
  /\b(?:(?:please\s+)?(?:do\s+not|don['’]t)\s+apply|need\s+not\s+apply|(?:will|would|can|could)\s+not\s+be\s+(?:considered|accepted|progressed|shortlisted|eligible|processed|assessed|reviewed)|(?:won['’]t|wouldn['’]t|can['’]t|cannot)\s+be\s+(?:considered|accepted|progressed|shortlisted|processed|assessed|reviewed)|(?:will|would)\s+be\s+(?:declined|rejected|disregarded)|\bnot\s+open\s+to|(?:cannot|can['’]t|can\s+not|unable\s+to|not\s+able\s+to|won['’]t|will\s+not|wouldn['’]t|would\s+not)\s+(?:be\s+)?(?:able\s+to\s+)?(?:consider|accept|progress|shortlist|hire|employ|take\s+on)\w*|(?:are|is)\s+not\s+(?:eligible|suitable|open\s+to)|ineligible)/i;
const EXCLUSION = new RegExp(String.raw`${STRICT_EXCLUSION.source}|\b(?:only|solely)\b`, 'i');
/** Wording that waives a lack of work rights ("won't rule you out", "not a barrier"). */
const WAIVER_CUE =
  /\b(?:(?:won['’]t|will\s+not|doesn['’]t|does\s+not|don['’]t|do\s+not|shouldn['’]t|should\s+not|need\s+not|needn['’]t)\s+(?:\w+\s+){0,2}?(?:rule\s+(?:you|anyone|them)\s+out|exclude|stop|prevent|disqualify|hold\s+(?:you|anyone)\s+back)|(?:is|are|isn['’]t|aren['’]t)\s+(?:not\s+)?(?:a|an)?\s*(?:barrier|obstacle|deal[-\s]?breaker)|not\s+(?:a|an)\s+(?:barrier|obstacle|issue|problem|deal[-\s]?breaker)|(?:can|may)\s+still\s+(?:apply|be\s+considered))\b/i;
/** Conditions that make a work-rights or visa mention a requirement. */
const CONDITION =
  /\b(?:provided(?:\s+that)?|providing|as\s+long\s+as|so\s+long\s+as|subject\s+to|on\s+(?:the\s+)?condition|(?:conditional|contingent|dependent)\s+(?:up)?on)\b/i;
const PREFERRED =
  /\b(?:prefer(?:red|able|ably|ence)?|ideal(?:ly)?|desir(?:ed|able)|advantage(?:ous)?|bonus|nice\s+to\s+have|beneficial|helpful|plus)\b/i;
const WELCOME =
  /\b(?:welcome[sd]?|encourag\w*|invite[sd]?|(?:can|may)\s+(?:still\s+|also\s+)?apply|eligible\s+to\s+apply|also\s+(?:apply|eligible|be\s+considered)|(?:will|may|can)\s+(?:still\s+|also\s+)?be\s+considered|happy\s+to\s+(?:hear|receive|consider)|open\s+to\s+(?:\w+\s+){0,2}?(?:applicants|candidates|applications|people|those))\b/i;
const STRONG_REQUIREMENT =
  /\b(?:must|required?|requires|requirement|essential|mandatory|need\s+to|needs\s+to|have\s+to|has\s+to|only|prerequisite|a\s+must|necessary|should|will\s+need|condition|eligibility\s+criteria)\b/i;
const WEAK_REQUIREMENT =
  /\b(?:you\s+(?:will\s+)?(?:have|hold|possess)|(?:the\s+)?(?:successful\s+)?(?:applicants?|candidates?|person|appointee)\s+will\s+(?:have|hold|possess|need)|you['’]ll\s+(?:need|have|hold)|(?:applicants?|candidates?)\s+(?:will\s+)?need|(?:applicants?|candidates?|people|those)\s+(?:with|who\s+(?:have|hold|already)|holding)|please\s+(?:only\s+)?apply|(?:looking|searching)\s+for\s+(?:someone|a\s+person|people|candidates?|applicants?)|to\s+be\s+(?:considered|eligible)|to\s+apply|proof\s+of|evidence\s+of)\b/i;

// ---------------------------------------------------------------------------
// Terms

const SPONSOR_TERM = new RegExp(
  [
    String.raw`\b(?<sponsor>sponsor(?:s|ed|ing|ship|ships)?)\b`,
    String.raw`\b(?<support>(?:visa|immigration)\s+(?:application\s+)?(?:support|assistance|help|advice|guidance))\b`,
    String.raw`\b(?<supportVerb>(?:(?:support|assist|help)(?:s|ed|ing|ance)?|(?:organi[sz]|arrang|sort)(?:e|es|ed|ing)(?:\s+out)?|tak(?:e|es|ing)\s+care\s+of)\s+(?:(?:you|with|in|to|obtain(?:ing)?|secur(?:e|ing)|apply(?:ing)?|for|your|the|a|an|their|any|work|working|successful|candidates?['’]?s?|applicants?['’]?s?|relevant|appropriate|necessary|new|employees?['’]?s?|staff|process(?:ing)?|of|and|or|relocation|relocating|moving|through|immigration|get(?:ting)?|future|many|our|right|suitable|chosen|selected|preferred|person|people|hires?|overseas|international|migrant|applications?)\s+){0,6}(?:AEWV|visas?|work\s+permits?|residen(?:ce|cy)\s+(?:visa\s+)?applications?|(?:visa|immigration)\s+(?:paperwork|process(?:es)?|applications?|documentation|requirements))(?:\s+applications?)?)\b`,
    String.raw`\b(?<cost>(?:cover|covers|covering|pay|pays|paying|reimburse\w*|fund|funds|funding)\s+(?:for\s+)?(?:(?:the|all|your|any|their)\s+)*(?:(?:costs?|fees?|expenses?)\s+(?:of|for)\s+(?:(?:your|the|their|a|any|work)\s+)*visas?(?:\s+applications?)?|(?:work\s+)?visa(?:\s+application)?\s+(?:costs?|fees?|expenses?)))\b`,
    // Passive or packaged costs: "visa costs will be covered", "package including visa fees".
    // Travel, tourist or business-trip visas are expenses, not immigration support.
    String.raw`\b(?<costNoun>(?<!\b(?:travel|tourist|visitor|transit|business|conference)\s+)(?:(?:work|AEWV)\s+)?visa(?:\s+application)?\s+(?:costs?|fees?|expenses?)\s+(?:(?:will\s+be|are|is|can\s+be|may\s+be)\s+)?(?:covered|paid|reimbursed|funded|included|met)(?![^.]{0,60}\b(?:conferences?|business\s+trips?|travel)\b)|(?:includ(?:e|es|ed|ing)|cover(?:s|ed|ing)?|contribut\w+\s+(?:to|towards))\s+(?:[\w,]+\s+){0,4}?(?:(?:work|AEWV)\s+)?visa(?:\s+application)?\s+(?:costs?|fees?|expenses?))\b`,
    // An invitation to discuss: "talk to us about sponsorship", "happy to talk visas".
    String.raw`\b(?<discuss>(?:talk|chat|speak)\s+(?:to|with)\s+us\s+about\s+(?:(?:your|a|any|the|work|visa)\s+){0,2}(?:sponsorship|visas?|visa\s+options|immigration)|(?:happy|open|willing|keen)\s+to\s+(?:talk|discuss|chat\s+(?:about|through))\s+(?:(?:your|a|any|the|work|visa)\s+){0,2}(?:sponsorship|visas?|visa\s+options|immigration))\b`,
    String.raw`\b(?<pathway>pathway\s+to\s+(?:permanent\s+)?residen(?:ce|cy))\b`,
    String.raw`\b(?<aewv>AEWV|accredited\s+employer\s+work\s+visa)\b`,
    String.raw`\b(?<accredited>accredited\s+employer|employer\s+accreditation)\b`,
  ].join('|'),
  'gi',
);

const SPONSOR_PRESENT = new RegExp(SPONSOR_TERM.source, 'i');

/** Non-immigration sponsorship: events, brands, projects, study. */
const SPONSOR_DISTRACTOR =
  /\b(?:events?|sponsors\b|sponsored\s+by|brand\w*|partnerships?|partners|sport\w*|festivals?|fundrais\w*|charit\w*|naming\s+rights|commercial|marketing|clubs?|teams?\s+sponsor|awards?|conferences?|gala|activation|relationships?|opportunit\w*|deals?|agreements?|portfolio|packages?|proposals?|revenue|sales|campaigns?|(?:project|executive|business|programme|program|senior|key|clinical|study|trial|research)\s+sponsors?|training|stud(?:y|ies)|courses?|qualifications?|certifications?|degrees?|apprenticeships?|memberships?|professional\s+development|children|child|teams?|local|community|schools?|athlet\w*|hockey|rugby|netball|football|cricket|races?|shows?)\b|\b(?:secur|sell|manag|grow|develop|deliver|negotiat|activat|leverag|sourc|attract|retain|renew|coordinat|pitch|identif)\w*\s+(?:\w+\s+){0,3}sponsor/i;
const VISA_CONTEXT =
  /\b(?:visas?|immigration|AEWV|work\s+permits?|work(?:ing)?\s+rights?|rights?\s+to\s+(?:live\s+and\s+)?work|migrants?|migration|overseas|offshore|international\s+(?:applicants|candidates)|relocat\w*|INZ)\b/i;
const SPONSOR_CUE =
  /\b(?:offer(?:s|ed|ing)?|provid(?:e|es|ed|ing)|availab(?:le|ility)|support(?:s|ed|ing)?|assist(?:s|ed|ing|ance)?|help(?:s|ed|ing)?|consider(?:s|ed|ing|ation)?|open\s+to|happy\s+to|willing|able\s+to|can|could|may|might|possible|welcome[sd]?|on\s+offer|includ(?:e|es|ed|ing)|eligible|we\s+will|we['’]ll|will\s+(?:be\s+)?(?:offer|provid|sponsor|support|assist|consider)\w*|(?:we|employer|company)\s+(?:can\s+|will\s+|may\s+)?sponsor)\b/i;
/** Without visa wording, only unambiguous employer offers count. */
const SPONSOR_STRONG_CUE =
  /\b(?:offer(?:s|ed|ing)?|possib(?:le|ility)|provid(?:e|es|ed|ing)|availab(?:le|ility)|consider(?:s|ed|ing|ation)?|open\s+to|happy\s+to|willing|able\s+to|eligible|on\s+offer|we\s+(?:can|will|may|could)|we['’]ll|(?:we|company|employer)\s+sponsor|(?:can|will|may|could|would)\s+(?:also\s+)?(?:consider\s+)?sponsor(?:ing)?)\b/i;
const EMPLOYER_OFFER =
  /\bwe\s+(?:can|will|may|could|would|are\s+(?:happy|able|willing|open))\s+(?:to\s+)?(?:\w+\s+){0,2}?(?:offer|provid|support|consider|sponsor|help|assist|discuss)\w*/i;
const AEWV_CUE =
  /\b(?:support\w*|sponsor\w*|assist\w*|help\w*|offer\w*|provid\w*|eligible|available|approved|(?:apply|applying)\s+for|accredited|can|will|able\s+to|happy\s+to|willing|consider\w*)\b/i;

const WORK_RIGHTS_TERM = new RegExp(
  [
    String.raw`\b(?:legal\s+)?rights?\s+to\s+(?:live\s+and\s+)?work(?!\s+(?:from|flexib\w*|remote\w*|hybrid|part|on\b|with\b|alongside|across|closely|independently|overtime|weekends?|shifts?|hours|in\s+(?:a|an|the|our)\b))`,
    String.raw`\bwork(?:ing)?\s+rights?\b`,
    String.raw`\b(?:eligib\w*|entitle\w*|authori[sz]\w*|permitted|allowed|able)\s+to\s+(?:live\s+and\s+)?(?:legally\s+)?work\s+(?:legally\s+)?(?:in|within)\s+${NZ}`,
    String.raw`\b(?:legal|lawful)(?:ly)?\s+(?:entitled|eligible|able|allowed|permitted|authori[sz]ed|right)\w*\s+(?:to\s+)?(?:live\s+and\s+)?work\b`,
    String.raw`\b(?:legally|lawfully)\s+work\b`,
    String.raw`\b(?:months?|years?)\s+(?:remaining|left)\s+on\s+(?:your|their|a|the)\s+(?:work\s+)?visa\b`,
    String.raw`\b(?:eligibility|entitlement|authori[sz]ation|permission)\s+to\s+work\b`,
    String.raw`\bwork(?:ing)?\s+(?:visas?|permits?|authori[sz]ation|eligibility|entitlement)\b`,
    String.raw`\b(?:valid|current|appropriate|relevant|suitable|existing)\s+(?:${NZ}\s+)?(?:working\s+holiday\s+|open\s+|partner\s+|student\s+|temporary\s+)?visas?\b`,
    String.raw`\b${NZ}\s+(?:work(?:ing)?\s+)?visas?\b`,
    // A visa whose conditions must allow the work: "your visa must permit part-time work".
    String.raw`\bvisas?\s+(?:that\s+|which\s+)?(?:(?:must|should|needs?\s+to|has\s+to|will\s+need\s+to|will|does|do)\s+)?(?:allows?|permits?|lets|entitles?|enables?)\s+(?:you\s+|them\s+|him\s+|her\s+|holders?\s+|the\s+holder\s+)?(?:to\s+)?(?:legally\s+)?(?:(?:full|part)[-\s]?time\s+)?work`,
    // A visa that must stay valid: "your visa must be valid for the contract", "as long as it's valid".
    String.raw`\bvisas?\s+(?:must|should|needs?\s+to|has\s+to|will\s+need\s+to)\s+(?:be|remain|stay)\s+(?:valid|current)\b`,
    String.raw`\bvisas?\b[^.;!?]{0,40}?\b(?:as|so)\s+long\s+as\s+(?:it['’]s|it\s+is|it\s+remains|it\s+stays|(?:your|the)\s+visa\s+(?:is|remains|stays))\s+(?:still\s+)?(?:valid|current)\b`,
    // Already able to work: "only apply if you can already work here".
    String.raw`\b(?:already|currently)\s+(?:be\s+)?(?:legally\s+)?(?:able|allowed|permitted|entitled|eligible)\s+to\s+(?:legally\s+)?work\s+(?:here|in\s+${NZ})\b`,
    String.raw`\bcan\s+(?:already\s+(?:legally\s+)?|legally\s+)work\s+(?:here|in\s+${NZ})\b`,
    String.raw`\b(?:residency|residence|citizenship)\s+or\s+(?:a\s+)?(?:valid\s+)?(?:${NZ}\s+)?work`,
  ].join('|'),
  'gi',
);

const RESIDENCY_TERM = new RegExp(
  [
    String.raw`\b(?:${NZ}|kiwi|australian)\s+(?:or\s+australian\s+)?(?:citizens?(?:hip)?|(?:permanent\s+)?residen(?:ts?|cy|ce)(?:\s+visa)?)\b`,
    String.raw`\bcitizens?(?:hip)?\s*(?:,|or|and|\/|&|and\/or)\s*(?:(?:${NZ}|permanent)\s+)?residen(?:ts?|cy|ce)\b`,
    String.raw`\b(?:permanent\s+)?residen(?:ts?|cy|ce)(?:\s+visas?)?\s*(?:,|or|and|\/|&|and\/or)\s*(?:${NZ}\s+)?citizens?(?:hip)?\b`,
    // A permanent right to stay is residency: "the right to live and work in NZ permanently".
    String.raw`\b(?:permanent\s+)?rights?\s+to\s+live\s+and\s+work\s+(?:in\s+${NZ}\s+)?(?:permanently|indefinitely)\b|\bpermanent\s+right\s+to\s+(?:live\s+and\s+)?work\b`,
    String.raw`\bpermanent\s+residen(?:ts?|cy|ce)\b`,
    String.raw`\bcitizens?\s+only\b`,
  ].join('|'),
  'gi',
);
/** "PR" must stay upper case: "pr" is often public relations. */
const PR_TERM = /\bPR\b(?:\s+(?:holders?|status|visa))?/g;

const RESIDENCY_RESTRICTION =
  /\b(?:only|(?:applicants?|candidates?)\s+(?:will\s+)?need|must|required?|requires|essential|mandatory|restricted|restrict\w*|limited|exclusively|(?:will\s+)?needs?\s+to\s+(?:be|have|hold)|(?:have|has)\s+to\s+(?:be|have|hold)|should\s+(?:be|have|hold)|open\s+to|available\s+to|eligib\w*|to\s+be\s+considered|condition|prerequisite|(?:will|can)\s+(?:only\s+)?(?:be\s+)?consider\w*)\b/i;
const APPLICANT_CONTEXT =
  /\b(?:applicants?|applications?|candidates?|you|your|apply|applying|considered|hire|hiring|employ\w*|role|position|job|vacancy|eligib\w*)\b/i;
/** A citizen/resident list that also admits visa holders is a work-rights condition. */
const ALT_WORK_RIGHTS =
  /\b(?:visas?|work\s+permits?|work(?:ing)?\s+rights?|rights?\s+to\s+(?:live\s+and\s+)?work|eligible\s+to\s+work|entitled\s+to\s+work)\b/gi;
const LIST_CONNECTOR =
  /^(?:[\s,/\-–—]|\b(?:or|and|any|hold|holds|holding|have|has|having|those|people|applicants|candidates|with|a|an|the|valid|current|appropriate|relevant|eligible|holders?|of|nz|new|zealand|temporary|open|partner|student|working|holiday|work|legal|full|existing|permanent|citizens?|citizenship|residents?|residency|PR|be|are|is|already|secured|obtained|gained)\b)*$/i;

const VISA_HOLDERS =
  /\b(?:(?:temporary|open|partner(?:ship)?|working\s+holiday|student|post[-\s]?study|work|skilled|essential\s+skills|AEWV|all|other|any)\s+(?:work\s+)?visas?(?:\s+(?:holders?|types?))?|visa\s+holders?|holders?\s+of\s+(?:\w+\s+){0,3}visas?|non[-\s]?(?:residents?|citizens?|NZers)|(?:international|overseas|offshore|foreign|migrant)\s+(?:applicants?|candidates?|applications?|workers?|nationals?|talent)|(?:applicants?|candidates?|applications?)\s+(?:from|based)\s+(?:overseas|offshore|abroad))\b/gi;

// ---------------------------------------------------------------------------
// Helpers

interface Clause {
  start: number;
  end: number;
}

const CLAUSE_BREAK =
  /;|\s[-–—]\s(?!(?:or|and|and\/or)\b)|\b(?:but|however|although|though|whereas|nevertheless|otherwise)\b|,\s*(?=(?:while|yet)\b)/gi;

function splitClauses(text: string): Clause[] {
  const clauses: Clause[] = [];
  let start = 0;
  for (const match of text.matchAll(CLAUSE_BREAK)) {
    if (match.index! > start) clauses.push({ start, end: match.index! });
    start = match.index! + match[0].length;
  }
  if (start < text.length) clauses.push({ start, end: text.length });
  return clauses;
}

const COORDINATED_SCOPE =
  /\b(?:and|so)\s+(?=(?:only|must|we|you|applicants?|candidates?|please)\b)/gi;

/** Up to `words` words immediately before `index`, stopping at punctuation. */
function windowBefore(text: string, index: number, words = 7): string {
  const head = text.slice(Math.max(0, index - 120), index);
  const cut = Math.max(...[',', ':', '(', '!', '—', '–'].map((mark) => head.lastIndexOf(mark)));
  let tail = cut >= 0 ? head.slice(cut + 1) : head;
  // A coordinated new requirement starts a fresh scope: "we don't sponsor and only accept ...".
  const joined = [...tail.matchAll(COORDINATED_SCOPE)].pop();
  if (joined) tail = tail.slice(joined.index! + joined[0].length);
  return tail.split(/\s+/).filter(Boolean).slice(-words).join(' ');
}

/** Up to `words` words immediately after `index`, stopping at punctuation or a relative clause. */
function windowAfter(text: string, index: number, words = 6): string {
  let tail = text.slice(index, index + 120).replace(/^\s*[:\-–—]+/, ' ');
  const stop = tail.search(
    /[,:(.!?—–]|\b(?:who|which|that|if|when|where|so|because|since|as|for\s+(?:candidates|applicants|people|those|anyone))\b/i,
  );
  if (stop >= 0) tail = tail.slice(0, stop);
  return tail.split(/\s+/).filter(Boolean).slice(0, words).join(' ');
}

const CASEWORK =
  /\b(?:assess|process|lodg|prepar|compil|draft|review|manag|handl|administ)\w*(?:\s+\w+){0,3}\s*$/i;

const DUTY =
  /\b(?:you\s+will|you['’]ll|you\s+would|responsib\w+|duties|experience|ability|skills?\s+in|knowledge\s+of|(?:role|position|job|work)\s+(?:also\s+)?(?:includes?|involves?))\b/i;

const SPONSORSHIP_HEADING = /^(?:(?:work\s+)?visa\s+)?sponsorship\s*:?$/i;
/** Group 1 marks a refusal. */
const HEADING_ANSWER =
  /^(?:(no\b|none\b|n\/a\b|not\s+(?:available|offered|provided|possible|supported)\b|unavailable\b)|(?:yes|available|offered|provided)\b)/i;

const NEG_AFTER =
  /(?:\b(?:not|never|unavailable|nil)\b|n['’]t\b)|^\s*(?:is|are)?\s*(?:no|none)\b|^\s*:\s*no\b/i;

function mask(body: string): string {
  let masked = body.replace(LITOTES, (value) => 'possible'.padEnd(value.length, ' '));
  for (const pattern of MASKS)
    masked = masked.replace(pattern, (value) => ' '.repeat(value.length));
  return masked;
}

/** Real statements hold a handful of terms; bounding them keeps pathological input linear. */
function take<T>(items: Iterable<T>, limit = MAX_TERMS_PER_CLAUSE): T[] {
  const taken: T[] = [];
  for (const item of items) {
    taken.push(item);
    if (taken.length >= limit) break;
  }
  return taken;
}

function firstMatchGroup(match: RegExpMatchArray): string {
  for (const [key, value] of Object.entries(match.groups ?? {})) if (value) return key;
  return 'sponsor';
}

// ---------------------------------------------------------------------------
// Per-clause classifiers. `text` is the masked statement; `clause` limits the scope.

function sponsorshipPolarity(statement: string, clause: string): Polarity | undefined {
  if (excludesSponsorNeeders(clause)) return 'negative';
  let result: Polarity | undefined;
  for (const match of take(clause.matchAll(SPONSOR_TERM))) {
    const kind = firstMatchGroup(match);
    const index = match.index!;
    const before = windowBefore(clause, index);
    const after = windowAfter(clause, index + match[0].length);
    const visaContext = VISA_CONTEXT.test(clause) || VISA_CONTEXT.test(statement);
    if (kind === 'sponsor') {
      if (SPONSOR_DISTRACTOR.test(clause) && !VISA_CONTEXT.test(clause)) continue;
    }
    // Immigration-adviser and HR duties ("prepare accreditation applications for INZ").
    if (
      (kind === 'aewv' || kind === 'accredited') &&
      (DUTY.test(before) || /\b(?:clients?|customers?)\b/i.test(clause) || CASEWORK.test(before))
    )
      continue;
    let polarity: Polarity | undefined;
    const negBefore = NEGATION.test(before);
    const negAfter = NEG_AFTER.test(after);
    if (kind === 'pathway') {
      // Only an employer's own offer of a residence pathway counts; a refusal is too indirect.
      if (!negBefore && !negAfter && EMPLOYER_OFFER.test(clause)) result = result ?? 'positive';
      continue;
    }
    const withoutNeed =
      /\bwithout\b/i.test(before) ||
      /(?:\b(?:not|no|never)\b|n['’]t\b)\s+(?:\w+\s+){0,2}?(?:requir|need)\w*/i.test(before);
    if (withoutNeed || negBefore || negAfter) polarity = 'negative';
    else if (kind === 'discuss') polarity = 'positive';
    else if (
      kind === 'support' ||
      kind === 'supportVerb' ||
      kind === 'cost' ||
      kind === 'costNoun'
    ) {
      // Nominalised casework: "assisting with visa processing for our offices".
      if (
        /^\s*(?:processing|administration|compliance|records|reporting|queries|enquiries|files)\b/i.test(
          after,
        )
      )
        continue;
      // Immigration-adviser duties ("you will assist clients with visa applications").
      if (DUTY.test(before) || /\b(?:clients?|customers?|students?|patients?)\b/i.test(clause))
        continue;
      polarity = 'positive';
    } else if (kind === 'aewv') polarity = AEWV_CUE.test(clause) ? 'positive' : undefined;
    else if (kind === 'accredited') {
      // Accreditation counts only as an immigration statement, not e.g. Living Wage.
      if (/\b(?:living\s+wage|rainbow|tick|iso|training)\b/i.test(clause)) continue;
      // Accreditation with Immigration NZ exists to employ migrants on an AEWV.
      if (/\b(?:immigration|INZ|AEWV)\b/i.test(clause)) polarity = 'positive';
      else if (
        /\b(?:visas?|migrants?|sponsor\w*|overseas|work(?:ing)?\s+rights?|rights?\s+to\s+work)\b/i.test(
          clause,
        ) &&
        (AEWV_CUE.test(clause.replace(/accredited/gi, '')) || WELCOME.test(clause))
      )
        polarity = 'positive';
    } else {
      // Work on other people's sponsorships: immigration advisers, HR administrators.
      if (DUTY.test(before) || /\b(?:clients?|customers?)\b/i.test(clause) || CASEWORK.test(before))
        continue;
      // "Tell us if you require sponsorship so we can plan" asks; it does not offer.
      if (
        /\b(?:if|whether)\s+(?:you|they|candidates?|applicants?)\s+(?:\w+\s+){0,3}?(?:require|need)\w*(?:\s+\w+){0,2}\s*$/i.test(
          before,
        ) &&
        !EMPLOYER_OFFER.test(clause)
      )
        continue;
      const cue = visaContext ? SPONSOR_CUE : SPONSOR_STRONG_CUE;
      if (cue.test(clause)) polarity = 'positive';
      else if (cue.test(statement) && !NEGATION.test(statement)) polarity = 'positive';
      else if (/^\s*[-*•●▪]\s*(?:visa\s+)?sponsorship\b/i.test(statement)) polarity = 'positive';
      else if (
        /^\s*[:\-–—]\s*(?:yes|available|offered)\b/i.test(clause.slice(index + match[0].length))
      )
        polarity = 'positive';
    }
    if (polarity === 'negative') return 'negative';
    if (polarity) result = polarity;
  }
  return result;
}

const WORKSITE_PERMIT =
  /\b(?:hot\s+work|confined\s+spaces?|permit[-\s]to[-\s]work|isolations?|lock[-\s]?out|excavations?|scaffold\w*|heights?|on[-\s]?site|site|forklifts?|machinery|plant\s+operat\w*|equipment|works?\s+begin\w*|before\s+(?:any|starting|work))\b/i;

/** Applicants who need sponsorship or a visa: "candidates requiring sponsorship". */
const SPONSOR_NEEDER =
  /\b(?:applicants?|candidates?|anyone|anybody|those|people|persons?|individuals|you)(?:['’](?:d|ll))?\s+(?:who\s+|that\s+)?(?:(?:will|would|currently|may|might|do|does|now)\s+)?(?:requir(?:e|es|ing)|need(?:s|ing)?)\s+(?:(?:(?:a|an|any|visa|work|employer|employment|immigration|future|ongoing|their|employer[-\s]sponsored|sponsored)\s+){0,3}(?:sponsorship|sponsor|visas?)|(?:us|the\s+(?:company|employer|business))\s+to\s+sponsor)\b/i;

/** "We can't consider candidates who require sponsorship" refuses sponsorship. */
function excludesSponsorNeeders(clause: string): boolean {
  const needer = SPONSOR_NEEDER.exec(clause);
  if (!needer) return false;
  const rest = clause.slice(needer.index + needer[0].length);
  if (!/sponsor/i.test(needer[0]) && !/^\s*(?:\w+\s+){0,2}?sponsor\w*/i.test(rest)) return false;
  return STRICT_EXCLUSION.test(rest) || STRICT_EXCLUSION.test(clause.slice(0, needer.index));
}
/** Applicants who must not need sponsorship: "only candidates who do not require sponsorship". */
const NO_SPONSOR_NEEDED =
  /\b(?:who|that|applicants?|candidates?|you)\s+(?:do\s+not|don['’]t|does\s+not|doesn['’]t|will\s+not|won['’]t)\s+(?:now\s+or\s+in\s+the\s+future\s+)?(?:require|need)\s+(?:(?:a|an|any|visa|work|employer)\s+){0,2}(?:sponsorship|visas?)\b/i;
const MUST_NOT_NEED_SPONSOR =
  /\b(?:must|should)\s+not\s+(?:now\s+or\s+in\s+the\s+future\s+)?(?:require|need)\s+(?:(?:a|an|any|visa|work|employer)\s+){0,2}(?:sponsorship|visas?)\b/i;
/** "You don't need to already hold a visa"; the term itself is not a work-rights phrase. */
const VISA_NOT_NEEDED = new RegExp(
  String.raw`(?:\b(?:do|does|will)\s+not|\b(?:don|doesn|won)['’]t|\bno)\s+(?:need\s+(?:to\s+)?|have\s+to\s+)(?:already\s+|currently\s+|yet\s+)?(?:be\s+(?:\w+\s+){1,4}?(?:or|and)\s+)?(?:(?:hold|have|possess|obtain|secure|get)\s+)?(?:(?:a|an|any|your)\s+)?(?:(?:existing|current|valid)\s+)?(?:${NZ}\s+)?(?:work(?:ing)?\s+)?(?:visa|work\s+permit)\b(?!\s+(?:sponsor|support|assist|application|help))`,
  'i',
);

/** "A visa is not required to apply"; exemptions for named groups are not waivers. */
const VISA_NOT_REQUIRED = new RegExp(
  String.raw`\b(?:a|an|any|your)\s+(?:(?:valid|current|existing|work|${NZ})\s+)*visa\s+(?:is\s+not|isn['’]t)\s+(?:required|needed|necessary|essential)\b`,
  'i',
);

/** Exclusion or waiver statements phrased around sponsorship or a visa rather than work rights. */
function sponsorNeedPolarity(clause: string): Polarity | undefined {
  if (MUST_NOT_NEED_SPONSOR.test(clause)) return 'positive';
  const notNeeded = NO_SPONSOR_NEEDED.exec(clause);
  if (notNeeded && EXCLUSION.test(clause)) return 'positive';
  const needer = SPONSOR_NEEDER.exec(clause);
  if (needer) {
    const rest = clause.slice(needer.index + needer[0].length);
    const head = clause.slice(0, needer.index);
    // "Sponsorship is only available to candidates who need a visa" restricts an offer.
    if (STRICT_EXCLUSION.test(rest) || STRICT_EXCLUSION.test(head)) return 'positive';
  }
  if (VISA_NOT_REQUIRED.test(clause) && !/\b(?:citizens?|australians?|passport)\b/i.test(clause))
    return 'negative';
  const waiver = VISA_NOT_NEEDED.exec(clause);
  if (waiver) {
    const before = windowBefore(clause, waiver.index, 4);
    if (/\b(?:who|that|if|whether|unless)\b/i.test(before)) return undefined;
    return 'negative';
  }
  return undefined;
}

const NEGATED_NEED =
  /(?:\b(?:not|no|never)\b|n['’]t\b)\s+(?:\w+\s+){0,2}?(?:need(?:ed|s)?|require[ds]?|necessary|essential|mandatory|have\s+to|has\s+to)\b(?:\s+to\b)?/gi;

function workRightsPolarity(statement: string, clause: string): Polarity | undefined {
  let result: Polarity | undefined = sponsorNeedPolarity(clause);
  if (result === 'positive') return result;
  // "You don't need to have ..." waives; its "need to" is not a requirement cue.
  const affirmative = clause.replace(NEGATED_NEED, (value) => ' '.repeat(value.length));
  const strong = STRONG_REQUIREMENT.test(affirmative) || CONDITION.test(affirmative);
  const welcome = WELCOME.test(clause);
  const consequence = NEG_CONSEQUENCE.test(clause) || /\bonly\b/i.test(clause);
  const sponsorSpans = [...clause.matchAll(SPONSOR_TERM)].map((match) => ({
    start: match.index!,
    end: match.index! + match[0].length,
  }));
  for (const match of take(clause.matchAll(WORK_RIGHTS_TERM))) {
    const index = match.index!;
    const before = windowBefore(clause, index, 9);
    const after = windowAfter(clause, index + match[0].length, 6);
    // A term inside a sponsorship phrase ("work visa sponsorship") is not a work-rights condition.
    if (/^\s*(?:sponsor\w*|support|assistance|applications?)\b/i.test(after)) continue;
    // Site safety permits ("a hot work permit must be issued") are not immigration permits.
    if (/permit/i.test(match[0]) && WORKSITE_PERMIT.test(clause)) continue;
    const end = index + match[0].length;
    if (sponsorSpans.some((span) => span.start < end && index < span.end)) continue;
    if (
      /(?:\b(?:not|no|never)\b|n['’]t\b)\s+(?:\w+\s+){0,2}?(?:need|require|necessar|have\s+to|has\s+to)\w*\b/i.test(
        before,
      ) ||
      /^(?:(?:\w+\s+){0,3}?(?:is|are|be)\s+not|(?:\w+\s+){0,2}?(?:not|isn['’]t|aren['’]t))\s+(?:required|necessary|needed|essential|mandatory|a\s+(?:requirement|prerequisite|must|barrier|obstacle))\b/i.test(
        after,
      ) ||
      // "No (existing) NZ work visa required to apply".
      (/\bno(?:\s+(?:existing|current|prior|valid))*\s*$/i.test(before) &&
        /^\s*(?:is\s+|are\s+)?(?:required|necessary|needed|essential)\b/i.test(after))
    ) {
      if (consequence) return 'positive';
      result = 'negative';
      continue;
    }
    const negHave =
      /(?:\b(?:not|no|never)\b|n['’]t\b)\s+(?:\w+\s+){0,2}?(?:have|having|hold|holding|possess\w*)\b/i.test(
        before,
      ) ||
      /\b(?:without|lack(?:s|ing)?(?:\s+of)?|absence\s+of)\b/i.test(before) ||
      // The term itself states the entitlement: "who are not (yet) eligible to work in NZ".
      (/^(?:(?:already|currently)\s+(?:be\s+)?)?(?:eligib|entitle|authori|permitted|allowed|able|legal|lawful)/i.test(
        match[0],
      ) &&
        /(?:\b(?:not|never)|n['’]t)(?:\s+(?:yet|already|currently|legally|be))*\s*$/i.test(before));
    if (negHave) {
      // "Not having work rights won't rule you out" waives; "... will not be considered" requires.
      if (WAIVER_CUE.test(clause)) {
        result = result ?? 'negative';
        continue;
      }
      if (
        NEG_CONSEQUENCE.test(clause) ||
        /\bonly\b/i.test(clause) ||
        /\brule[sd]?\s+(?:you\s+)?out\b/i.test(clause)
      )
        return 'positive';
      if (welcome || WELCOME.test(statement) || /\b(?:we\s+(?:can|will|may)|sponsor)/i.test(clause))
        result = result ?? 'negative';
      continue;
    }
    if (NEGATION.test(before)) continue;
    if (PREFERRED.test(clause)) continue;
    // "Students may apply if their visa permits part-time work" makes the visa a condition.
    const conditionalVisa =
      /\b(?:allow|permit|lets|entitle|enable|valid)/i.test(match[0]) && /\bif\b/i.test(before);
    if (/\bif\s+you\b/i.test(clause) && !strong && !conditionalVisa) continue;
    if (welcome && !strong && !conditionalVisa) continue;
    if (strong || conditionalVisa || WEAK_REQUIREMENT.test(clause)) return 'positive';
    // A short list item such as "Valid NZ work visa" in a requirements list.
    const words = statement
      .trim()
      .replace(/^[-*•●▪]\s*/, '')
      .split(/\s+/).length;
    if (
      words <= 8 &&
      !SPONSOR_PRESENT.test(statement) &&
      !NEGATION.test(statement) &&
      // Duties about other people's rights: "You'll help migrants understand their work rights".
      !DUTY.test(statement) &&
      !/\b(?:their|clients?|customers?|migrants?|students?|employees?|staff|workers)\b/i.test(
        statement,
      )
    )
      return 'positive';
    // "Current eligibility to work in New Zealand and availability to work full-time": an item
    // that opens with the entitlement asks for it, however long the item is.
    if (
      /^\s*(?:[-*•●▪]\s*)?(?:(?:the|a|an|current|valid|existing|full|legal|ongoing)\s+){0,3}$/i.test(
        statement.slice(0, statement.indexOf(match[0])),
      ) &&
      !SPONSOR_PRESENT.test(statement) &&
      !NEGATION.test(statement) &&
      !DUTY.test(statement)
    )
      return 'positive';
  }
  return result;
}

function residencyPolarity(clause: string): Polarity | undefined {
  let result: Polarity | undefined;
  const matches = [...take(clause.matchAll(RESIDENCY_TERM)), ...take(clause.matchAll(PR_TERM))];
  if (!matches.length) return undefined;
  const alternatives = [...clause.matchAll(ALT_WORK_RIGHTS)];
  for (const match of matches) {
    const index = match.index!;
    const end = index + match[0].length;
    if (match[0].startsWith('PR') && !/\b(?:citizen\w*|residen\w*|visa|holders?)\b/i.test(clause))
      continue;
    const alternative = alternatives.some((alt) => {
      const altStart = alt.index!;
      const altEnd = altStart + alt[0].length;
      if (altStart >= end) {
        const between = clause.slice(end, altStart);
        return (
          between.length < 80 && LIST_CONNECTOR.test(between) && /\b(?:or|and)\b|\//i.test(between)
        );
      }
      if (altEnd <= index) {
        const between = clause.slice(altEnd, index);
        return (
          between.length < 60 &&
          /^\s*(?:holders?\s+)?(?:,|or|and|and\/or|\/)\s*(?:(?:hold|have|a|an|the|be|being)\s+)*$/i.test(
            between,
          )
        );
      }
      return false;
    });
    if (alternative) continue;
    const before = windowBefore(clause, index, 8);
    const after = windowAfter(clause, end, 6);
    const negated =
      NEGATION.test(before) ||
      /^(?:(?:\w+\s+){0,3}?(?:is|are|be)\s+not|(?:\w+\s+){0,2}?(?:not|isn['’]t|aren['’]t))\s+(?:required|necessary|needed|essential|mandatory|a\s+(?:requirement|prerequisite|must))\b/i.test(
        after,
      );
    if (negated) {
      if (NEG_CONSEQUENCE.test(clause)) return 'positive';
      if (/\b(?:need|required?|necessary|have\s+to|must|limited|restricted|only)\b/i.test(clause))
        result = result ?? 'negative';
      continue;
    }
    // "Preference is restricted to citizens" still restricts; a mere preference does not.
    if (PREFERRED.test(clause) && !/\b(?:restricted|limited|confined)\s+to\b/i.test(clause))
      continue;
    if (
      RESIDENCY_RESTRICTION.test(clause) &&
      (APPLICANT_CONTEXT.test(clause) ||
        /\bonly\b/i.test(clause) ||
        // Requirement list items: "Visa: Must have NZ residency/citizenship."
        (clause.trim().split(/\s+/).length <= 12 &&
          /\b(?:must|required?|essential|mandatory)\b/i.test(clause)))
    )
      return 'positive';
  }
  return result;
}

function otherVisaHoldersWelcome(clause: string): boolean {
  for (const match of take(clause.matchAll(VISA_HOLDERS))) {
    if (NEGATION.test(windowBefore(clause, match.index!, 6))) continue;
    if (NEG_AFTER.test(windowAfter(clause, match.index! + match[0].length, 6))) continue;
    if (
      WELCOME.test(clause) ||
      /\b(?:accept\w*|may\s+(?:also\s+)?apply|can\s+(?:also\s+)?apply|considered)\b/i.test(clause)
    )
      return true;
  }
  return /\bregardless\s+of\s+(?:your\s+|their\s+)?(?:current\s+)?(?:visa|immigration|residency|citizenship)/i.test(
    clause,
  );
}

// ---------------------------------------------------------------------------

interface Signal {
  dimension: Dimension;
  polarity: Polarity;
  segment: SourceSegment;
}

/** "No NZ work rights?" / "Don't have a visa yet?" asked rhetorically. */
const LACK_QUESTION = new RegExp(
  String.raw`^(?:[-*•●▪]\s*)?(?:no|(?:don['’]t|do\s+not)\s+(?:yet\s+)?(?:have|hold)|not\s+(?:yet\s+)?(?:holding|having)|(?:[\w'’]+\s+){0,3}?(?:without|lacking))\s+(?:(?:a|an|any|current|existing|valid|the)\s+)*(?:${NZ}\s+)?(?:work(?:ing)?\s+rights?|work\s+visa|visa|right\s+to\s+work)(?:\s+(?:in|within)\s+${NZ})?(?:\s+(?:yet|already))?\s*\?$`,
  'i',
);
const REASSURANCE =
  /^(?:no\s+(?:problem|worries|stress|drama)|not\s+a\s+problem|(?:don['’]t|do\s+not)\s+worry|that['’]s\s+(?:ok|okay|fine|no\s+problem)|we(?:\s+can|\s+will|['’]ll)?\s+(?:still\s+)?(?:help|sponsor|support|assist|sort|consider)|(?:you\s+)?(?:can|may)\s+still\s+apply|apply\s+(?:anyway|regardless))/i;

/** A contrasted clause waiving the requirement just stated: "..., although this is not essential". */
const ANAPHORIC_WAIVER =
  /^\s*(?:this|that|it|the\s+requirement)\s+(?:(?:is|may\s+be|can\s+be)\s+(?:waived|negotiable|flexible)|(?:is\s+not|isn['’]t|may\s+not\s+be)\s+(?:essential|required|necessary|mandatory|a\s+(?:must|requirement|deal[-\s]?breaker)))\b/i;

function segmentFor(body: string, start: number, end: number): SourceSegment | undefined {
  let from = start;
  let to = end;
  while (from < to && /[\s\-*•●▪]/.test(body[from]!)) from += 1;
  while (to > from && /\s/.test(body[to - 1]!)) to -= 1;
  if (to <= from) return undefined;
  return { id: `visa_${from}`, text: body.slice(from, to), start: from, end: to };
}

function decide<T extends string>(
  signals: Signal[],
  dimension: Dimension,
  labels: { positive: T; negative?: T; none: T; conflict: T },
): LocalDecision<T> {
  const pick = (polarity: Polarity) => {
    const seen = new Set<string>();
    return signals
      .filter((signal) => signal.dimension === dimension && signal.polarity === polarity)
      .map((signal) => signal.segment)
      .filter((segment) => (seen.has(segment.id) ? false : (seen.add(segment.id), true)))
      .slice(0, MAX_EVIDENCE_PER_SIDE);
  };
  const positive = pick('positive');
  const negative = pick('negative');
  if (positive.length && negative.length)
    return {
      choice: labels.conflict,
      evidence: [...positive, ...negative].sort((a, b) => a.start - b.start),
    };
  if (positive.length) return { choice: labels.positive, evidence: positive };
  if (negative.length && labels.negative) return { choice: labels.negative, evidence: negative };
  return { choice: labels.none, evidence: [] };
}

export function classifyVisa(body: string): LocalVisaDecisions {
  const masked = mask(body);
  const signals: Signal[] = [];
  // Start of a bare "Visa sponsorship" heading whose answer is on the next line.
  let heading: number | undefined;
  // Start of a "No work rights?" question that a reassurance may answer.
  let lackQuestion: number | undefined;
  for (const span of statementSpans(body)) {
    const statement = masked.slice(span.start, span.end);
    const trimmed = statement.trim().replace(/^[-*•●▪]\s*/, '');
    if (!trimmed) continue;
    if (lackQuestion !== undefined) {
      // Masking blanks "No problem", so the reassurance is read from the source text.
      const raw = body.slice(span.start, span.end).trim();
      const segment = REASSURANCE.test(raw) && segmentFor(body, lackQuestion, span.end);
      if (segment) signals.push({ dimension: 'workRights', polarity: 'negative', segment });
      lackQuestion = undefined;
    }
    if (LACK_QUESTION.test(body.slice(span.start, span.end).trim())) lackQuestion = span.start;
    if (heading !== undefined) {
      const answer = HEADING_ANSWER.exec(trimmed);
      const segment = answer && segmentFor(body, heading, span.end);
      if (answer && segment)
        signals.push({
          dimension: 'sponsorship',
          polarity: answer[1] ? 'negative' : 'positive',
          segment,
        });
      heading = undefined;
      if (answer) continue;
    }
    if (SPONSORSHIP_HEADING.test(trimmed)) {
      heading = span.start;
      continue;
    }
    if (!RELEVANT.test(statement)) continue;
    if (trimmed.endsWith('?') || ANSWER_OPTION.test(trimmed)) continue;
    if (INJECTION.test(statement)) continue;
    const longStatement = span.end - span.start > MAX_STATEMENT_EVIDENCE;
    // Requirements stated by the previous clause, for "although this is not essential".
    let required: Dimension[] = [];
    for (const clause of splitClauses(statement)) {
      const text = statement.slice(clause.start, clause.end);
      const segment = longStatement
        ? segmentFor(body, span.start + clause.start, span.start + clause.end)
        : segmentFor(body, span.start, span.end);
      if (!segment) continue;
      const relevant = RELEVANT.test(text);
      if (required.length && !relevant && ANAPHORIC_WAIVER.test(text))
        for (const dimension of required)
          signals.push({ dimension, polarity: 'negative', segment });
      required = [];
      if (!relevant) continue;
      const add = (dimension: Dimension, polarity: Polarity | undefined) => {
        if (polarity) signals.push({ dimension, polarity, segment });
        if (polarity === 'positive' && dimension !== 'sponsorship') required.push(dimension);
      };
      add('sponsorship', sponsorshipPolarity(statement, text));
      add('workRights', workRightsPolarity(statement, text));
      const residency = residencyPolarity(text);
      add('residency', residency ?? (otherVisaHoldersWelcome(text) ? 'negative' : undefined));
    }
  }
  const sponsorship = decide<SponsorshipChoice>(signals, 'sponsorship', {
    positive: 'supported',
    negative: 'not_supported',
    none: 'not_mentioned',
    conflict: 'conflict',
  });
  const workRights = decide<WorkRightsChoice>(signals, 'workRights', {
    positive: 'required',
    negative: 'not_required',
    none: 'not_mentioned',
    conflict: 'conflict',
  });
  // A statement that other visa holders may apply only matters against a restriction.
  const residency = decide<ResidencyChoice>(signals, 'residency', {
    positive: 'citizen_or_resident_only',
    none: 'not_mentioned',
    conflict: 'conflict',
  });
  return { sponsorship, workRights, residency };
}
