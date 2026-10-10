import { occupations, type Occupation } from '../../data/occupations';
import { itKeywords } from '../../data/occupations/it';
import { nzTitles } from '../../data/occupations/nz-titles';
import onet from '../../data/occupations/onet-synonyms.json';

/** Everyday job titles (project-authored NZ titles, then O*NET), matched only against the
 * advertised title. */
const onetTitles: Readonly<Record<string, readonly string[]>> = onet.synonyms;
const titleSynonyms = (code: string): readonly string[] => [
  ...(nzTitles[code] ?? []),
  ...(onetTitles[code] ?? []),
];

export { occupations } from '../../data/occupations';
export type { Occupation } from '../../data/occupations';

export interface OccupationCandidate extends Occupation {
  /** How the advertised title names this occupation: 0 none, 1 trailing context only,
   * 2 every word in the title, 3 within the role, 4 the whole role; the fraction prefers
   * more specific names. */
  titleRank: number;
  matchedKeywords: string[];
}

const stopWords = new Set(
  'a an and are as at be been being by can for from has have in into is it its may of on or other our s than that the their these they this to under up using was we which who will with within you your nec not elsewhere classified job jobs role work working team opportunity new zealand join friendly competitive pay flexible hours apply now experience required including includes include such official anzsco catalog catalogue context occupation occupations classification title titles alias aliases alternative specialisation specialisations specialization specializations group groups unit major minor definition duties'.split(
    ' ',
  ),
);

// Spelling variants and standard job-ad abbreviations of catalogue words; not synonyms.
const variants: Readonly<Record<string, string>> = {
  advisor: 'adviser',
  advisors: 'advisers',
  center: 'centre',
  centers: 'centres',
  labor: 'labour',
  laborer: 'labourer',
  laborers: 'labourers',
  airconditioning: 'air conditioning',
  hr: 'human resource',
  auto: 'automotive',
  tech: 'technician',
  techs: 'technicians',
  rep: 'representative',
  reps: 'representatives',
  mgr: 'manager',
  asst: 'assistant',
  dev: 'developer',
  devs: 'developers',
  kindy: 'kindergarten',
};

function normalize(value: string): string {
  return (
    value
      // Macrons and accents are often omitted in ads (Kaiāwhina, Kaiawhina).
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      // A possessive names the same role as the plural ("Plumber's Assistant", "Plumbers Assistant").
      .replace(/(\p{L})['’]s\b/gu, '$1s')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(' ')
      .map(
        (word) =>
          variants[word] ??
          word.replace(/^(\p{L}{3,})iz(e|es|ed|ing|er|ers|ation|ations)$/u, '$1is$2'),
      )
      .join(' ')
  );
}

/** Light inflection matching, without expanding unrelated words or inventing synonyms. */
function stem(term: string): string {
  if (term.length > 5 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
  // Informal titles are spelt both ways ("Postie", "Posty"; "Forkie", "Forky"), and "-ies"
  // plurals already reduce to "-y".
  if (term.length >= 5 && term.endsWith('ie')) return `${term.slice(0, -2)}y`;
  if (term.length > 4 && term.endsWith('s') && !/(ss|us|is)$/.test(term)) return term.slice(0, -1);
  return term;
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((term) => term.length > 1 && !stopWords.has(term))
    .map(stem);
}

/** Word order is kept (including stop words) so plural forms still match a complete name. */
function phraseText(value: string): string {
  return normalize(value).split(' ').map(stem).join(' ');
}

/** ANZSCO marks the default unit as "(General)" and regional names as "(NZ)"/"(Aus)", and
 * "Call or Contact Centre Operator" names both "Call Centre Operator" and "Contact Centre
 * Operator". Lists with commas are left whole. */
function nameVariants(name: string): string[] {
  // Te reo names carry an English gloss: "Kaiawhina Kohanga Reo (Maori Language Nest Assistant)".
  const regional = name
    .replace(/\s*\((?:NZ|Aus)\)/g, '')
    .replace(/^(.+?)\s*\(Maori\b[^)]*\)$/, '$1')
    .trim();
  const general = regional.replace(/\s*\(General\)$/, '').trim();
  const alternative = /^(.*?)\b([\w-]+) or ([\w-]+)\b(.*)$/.exec(general);
  const alternatives =
    alternative && !general.includes(',')
      ? [
          `${alternative[1]}${alternative[2]}${alternative[4]}`,
          `${alternative[1]}${alternative[3]}${alternative[4]}`,
        ]
      : [];
  return [...new Set([name, regional, general, ...alternatives].filter(Boolean))];
}

/** Text in a contrastive negation ("not an adult training role", "rather than X") or a
 * "No X required" clause describes work or credentials the job excludes. */
function withoutNegatedScopes(text: string): string {
  return text
    .replace(/\bno\b[^.;!?\n]{0,80}?\b(?:required|needed|necessary)\b/gi, ' ')
    .replace(
      /(?:\b(?:not(?!\s+(?:only|just)\b)|never|rather than|instead of)\b|n['’]t\b)[^.;!?\n—–]*?(?=[.;!?\n—–]|,?\s+(?:but|while|whereas|however)\b|$)/gi,
      ' ',
    );
}

function containsPhrase(text: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

/** Ad wording around a role name: urgency, seniority, schedule, contract type and NZ places.
 * Matched against normalised (lower-case, macron-free) text before stemming. */
const titleNoise = new RegExp(
  `(?:^| )(?:${[
    'urgently',
    'urgent',
    'wanted',
    'required',
    'needed',
    'immediate start',
    'start immediately',
    'start asap',
    'start now',
    'asap',
    'now hiring',
    'hiring now',
    'hiring',
    'senior',
    'snr',
    'sr',
    'junior',
    'jnr',
    'jr',
    'intermediate',
    'experienced',
    'qualified',
    'night shift',
    'day shift',
    'afternoon shift',
    'nightshift',
    'nights',
    'weekends',
    'weekend',
    'part time',
    'full time',
    'parttime',
    'fulltime',
    'fixed term',
    'permanent',
    'temporary',
    'temp',
    'casual',
    'contract',
    'seasonal',
    'ongoing',
    'fte',
    'maternity cover',
    'parental leave cover',
    'multiple positions',
    'multiple roles',
    'nationwide',
    'new zealand',
    'nz',
    'cbd',
    'based',
    'auckland',
    'north shore',
    'wellington',
    'hutt valley',
    'lower hutt',
    'upper hutt',
    'porirua',
    'kapiti',
    'christchurch',
    'canterbury',
    'hamilton',
    'waikato',
    'tauranga',
    'bay of plenty',
    'rotorua',
    'taupo',
    'dunedin',
    'otago',
    'queenstown',
    'wanaka',
    'invercargill',
    'southland',
    'napier',
    'hastings',
    'hawkes bay',
    'nelson',
    'tasman',
    'blenheim',
    'marlborough',
    'palmerston north',
    'manawatu',
    'whanganui',
    'new plymouth',
    'taranaki',
    'gisborne',
    'whangarei',
    'northland',
    'timaru',
    'wairarapa',
    'west coast',
  ].join('|')})(?= |$)`,
  'g',
);

function withoutTitleNoise(normalized: string): string {
  let previous = '';
  let current = ` ${normalized} `;
  // Adjacent noise words share a space, so repeat until stable.
  while (current !== previous) {
    previous = current;
    current = current.replace(titleNoise, ' ');
  }
  return current.replace(/\s+/g, ' ').trim();
}

const segmentText = (value: string): string =>
  withoutTitleNoise(normalize(value)).split(' ').filter(Boolean).map(stem).join(' ');

interface TitleViews {
  /** Whole title, noise-free title and the role segment with its "/" alternatives: a phrase
   * equal to one of these names the role. */
  exact: Set<string>;
  /** Space-padded whole title (with and without noise words). */
  whole: string[];
  /** Space-padded role segments: the title without trailing context. */
  role: string[];
  /** Space-padded context segments ("for builders", "in Rolleston", "to the CEO"). */
  context: string[];
}

/** Ads append qualifiers after a dash, bar, comma or parenthesis ("Housekeeper – Motel",
 * "Chef (Qualified)"); the first non-empty segment names the role. */
const qualifierBreak = /\s+[-–—|:]\s+|\s*[–—|•()[\]]\s*|,\s*/;
/** A preposition introduces context: who or where the role serves ("EA to the CEO",
 * "Labourer for builders in Rolleston"). */
const contextBreak = /\s+(?:to|for|at|with|in|@)\s+(?:(?:the|our|a|an)\s+)?/i;

function titleViews(title: string): TitleViews {
  const segments = title
    .split(qualifierBreak)
    .flatMap((part) =>
      part.split(contextBreak).map((raw, index) => ({
        raw,
        text: segmentText(raw),
        context: index > 0,
      })),
    )
    .filter((segment) => segment.text);
  const full = phraseText(title);
  const clean = segments.map((segment) => segment.text).join(' ');
  const head = segments[0];
  // "/" separates alternative roles ("Cook / Kitchen Hand").
  const heads = head
    ? [
        head.text,
        ...head.raw
          .split(/\s*\/\s*/)
          .map(segmentText)
          .filter(Boolean),
      ]
    : [];
  const pad = (texts: string[]) => [...new Set(texts)].map((text) => ` ${text} `);
  const texts = (context: boolean) =>
    segments
      .filter((segment) => segment.context === context)
      .flatMap((segment) => [segment.text, phraseText(segment.raw)]);
  return {
    exact: new Set([full, clean, ...heads]),
    whole: pad([full, clean]),
    role: pad(texts(false)),
    context: pad(texts(true)),
  };
}

/** 4: the phrase names the role ("EA" in "EA to the CEO"); 3: it appears in the role part of
 * the title; 2: all of its words appear in the title; 1: it appears only in trailing context
 * ("CEO" there, "builders" in "Labourer for builders"). Within a level a longer phrase is more
 * specific ("Plumber's Offsider" over "Plumber"), so it ranks first. */
const specificity = (normalized: string): number =>
  Math.min(normalized.split(' ').length, 20) / 100;

function titleLevel(
  views: TitleViews,
  titleTerms: ReadonlySet<string>,
  phrase: { normalized: string; terms: ReadonlySet<string> },
): number {
  const { normalized } = phrase;
  if (!normalized) return 0;
  if (views.exact.has(normalized)) return 4 + specificity(normalized);
  const needle = ` ${normalized} `;
  const inWhole = views.whole.some((text) => text.includes(needle));
  const inContext = inWhole && views.context.some((text) => text.includes(needle));
  // A phrase spanning a role and its context ("Learn to Swim Instructor") is still the role.
  if (inWhole && (!inContext || views.role.some((text) => text.includes(needle))))
    return 3 + specificity(normalized);
  if (phrase.terms.size >= 2 && [...phrase.terms].every((term) => titleTerms.has(term)))
    return 2 + specificity(normalized);
  return inContext ? 1 + specificity(normalized) : 0;
}

/** Title words that place a role in a te reo Maori or kaupapa Maori setting. */
const maoriCues = new Set([
  'maori',
  'reo',
  'kohanga',
  'kura',
  'kaupapa',
  'kaiako',
  'pouako',
  'kaiawhina',
  'hauora',
  'wharekura',
  'rumaki',
  'rongoa',
]);
type Corpus = {
  documents: Array<{
    occupation: Occupation;
    phrases: Array<{
      keyword: string;
      normalized: string;
      supplemental: boolean;
      titleOnly: boolean;
      terms: Set<string>;
    }>;
    nameTerms: Set<string>;
    frequencies: Map<string, number>;
    length: number;
    maoriSpecific: boolean;
  }>;
  averageLength: number;
  idf: (term: string) => number;
};
let corpus: Corpus | undefined;

/** Built on first retrieval, not at import: the worker also wakes for employer and language
 * messages that never need the catalogue. */
function buildCorpus(): Corpus {
  const documents = occupations.map((occupation) => {
    const names = [occupation.title, ...occupation.keywords].flatMap(nameVariants);
    const officialNames = new Set(names.map(phraseText));
    const keywords = [...new Set([...names, ...(itKeywords[occupation.code] ?? [])])];
    const phrases = keywords.map((keyword) => ({
      keyword,
      normalized: phraseText(keyword),
      supplemental: !officialNames.has(phraseText(keyword)),
      titleOnly: false,
      terms: new Set(tokens(keyword)),
    }));
    // Body text often names other roles ("report to the Sales Manager", "visa sponsor"), so
    // a synonym is evidence only in the advertised title. It also stays out of term
    // statistics so thousands of synonyms cannot reweight the official catalogue.
    const nameTerms = new Set(phrases.flatMap((phrase) => [...phrase.terms]));
    for (const synonym of titleSynonyms(occupation.code)) {
      const normalized = phraseText(synonym);
      if (
        officialNames.has(normalized) ||
        phrases.some((phrase) => phrase.normalized === normalized)
      )
        continue;
      phrases.push({
        keyword: synonym,
        normalized,
        supplemental: true,
        titleOnly: true,
        terms: new Set(tokens(synonym)),
      });
    }
    const frequencies = new Map<string, number>();
    const descriptionTerms = tokens(occupation.description);
    for (const term of descriptionTerms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    return {
      occupation,
      phrases,
      nameTerms,
      frequencies,
      length: descriptionTerms.length,
      // Kaiako Kohanga Reo, Kaiawhina (Hauora) and similar units are defined by te reo Maori
      // or kaupapa Maori settings.
      maoriSpecific: /\bMaori\b/.test(occupation.title),
    };
  });
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of new Set([...document.nameTerms, ...document.frequencies.keys()])) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const averageLength =
    documents.reduce((total, document) => total + document.length, 0) /
    Math.max(1, documents.length);
  const idf = (term: string): number => {
    const count = documentFrequency.get(term) ?? 0;
    return Math.log(1 + (documents.length - count + 0.5) / (count + 0.5));
  };
  return { documents, averageLength, idf };
}

/** Local lexical shortlist, not a classification. Weak or absent evidence returns no candidates. */
export function retrieveOccupations(title: string, body: string, limit = 8): OccupationCandidate[] {
  if (!Number.isInteger(limit) || limit < 1) return [];
  const normalizedTitle = phraseText(title.slice(0, 240));
  const views = titleViews(title.slice(0, 240));
  const normalizedBody = phraseText(withoutNegatedScopes(body.slice(0, 24_000)));
  const titleTerms = new Set(tokens(normalizedTitle));
  const bodyTerms = new Set(tokens(normalizedBody));
  const queryTerms = new Set([...titleTerms, ...bodyTerms]);
  // Mainstream NZ ads (an ECE teacher, a health assistant) mention te reo and whanau in the
  // body, so a Maori-specific unit outranks the general one only when the title says so.
  const maoriCue = [...titleTerms].some((term) => maoriCues.has(term));
  if (!queryTerms.size) return [];
  const { documents, averageLength, idf } = (corpus ??= buildCorpus());

  const ranked = documents.map((document) => {
    let titleRank = 0;
    const matchedKeywords: string[] = [];
    // General words such as "service" must not activate an unrelated IT alias.
    // Official catalogue terms remain available even without a complete phrase match.
    const activePhrases: (typeof document.phrases)[number][] = [];
    for (const phrase of document.phrases) {
      const level = titleLevel(views, titleTerms, phrase);
      let inBody: boolean | undefined;
      const bodyMatch = () => (inBody ??= containsPhrase(normalizedBody, phrase.normalized));
      if (phrase.supplemental && !level && (phrase.titleOnly || !bodyMatch())) continue;
      activePhrases.push(phrase);
      if (phrase.terms.size) titleRank = Math.max(titleRank, level);
      if (level >= 3 || bodyMatch()) matchedKeywords.push(phrase.keyword);
    }
    const activeNameTerms = new Set(activePhrases.flatMap((phrase) => [...phrase.terms]));
    let score = 0;
    let substantiveMatches = 0;
    let shortTitleMatch = false;
    let titleNameMatch = false;
    let matchesTitle = false;
    for (const term of queryTerms) {
      const frequency = document.frequencies.get(term) ?? 0;
      const inName = activeNameTerms.has(term);
      if (!frequency && !inName) continue;
      if (titleTerms.has(term)) matchesTitle = true;
      const weight = idf(term);
      if (weight >= 1.7) substantiveMatches += 1;
      if (inName && titleTerms.has(term) && weight >= 2.5) {
        if (normalizedTitle.includes(' ')) titleNameMatch ||= bodyTerms.has(term);
        else shortTitleMatch = true;
      }
      // BM25-style saturation limits repetition in definitions or catalogue context.
      const bm25 = frequency
        ? (frequency * 2.2) /
          (frequency + 1.2 * (0.25 + (0.75 * document.length) / Math.max(1, averageLength)))
        : 0;
      score += weight * (bm25 + (inName ? 0.5 : 0)) * (titleTerms.has(term) ? 2.5 : 1);
    }
    score += matchedKeywords.length;
    const supported = titleRank > 0 || (substantiveMatches >= 2 && score >= 7);
    return {
      document,
      titleRank,
      score,
      matchedKeywords,
      supported,
      // A distinctive advertised title word that the text repeats and an occupation name
      // contains (Payroll in "Payroll Administrator") is weaker evidence; it only fills slots
      // left by supported candidates because setting words ("Rest Home") match unrelated names.
      titleNameOnly: !supported && titleNameMatch && score >= 7,
      shortTitleMatch,
      matchesTitle,
      uncued: document.maoriSpecific && !maoriCue,
    };
  });
  // A bare title such as Cleaner may recall a family. When the text narrows that family,
  // omit candidates supported only by the same single title word (for example Network Planner).
  const hasContextualTitleMatch = ranked.some(
    (candidate) => candidate.supported && candidate.matchesTitle,
  );
  return ranked
    .filter(
      (candidate) =>
        candidate.supported ||
        candidate.titleNameOnly ||
        (!hasContextualTitleMatch && candidate.shortTitleMatch),
    )
    .sort(
      (a, b) =>
        b.titleRank - a.titleRank ||
        Number(a.titleNameOnly) - Number(b.titleNameOnly) ||
        Number(a.uncued) - Number(b.uncued) ||
        b.score - a.score ||
        a.document.occupation.code.localeCompare(b.document.occupation.code),
    )
    .slice(0, Math.min(limit, 8))
    .map(({ document, titleRank, matchedKeywords }) => ({
      ...document.occupation,
      titleRank,
      matchedKeywords,
    }));
}
