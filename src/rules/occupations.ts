import { occupations, type Occupation } from '../../data/occupations';
import { itKeywords } from '../../data/occupations/it';

export { occupations, TAXONOMY_VERSION } from '../../data/occupations';
export type { Occupation } from '../../data/occupations';

export interface OccupationCandidate extends Occupation {
  /** Ranking heuristic only; not a confidence or eligibility probability. */
  retrievalScore: number;
  matchedKeywords: string[];
}

const stopWords = new Set(
  'a an and are as at be been being by can for from has have in into is it its may of on or other our s than that the their these they this to under up using was we which who will with within you your nec not elsewhere classified job jobs role work working team opportunity new zealand join friendly competitive pay flexible hours apply now experience required including includes include such official anzsco catalog catalogue context occupation occupations classification title titles alias aliases alternative specialisation specialisations specialization specializations group groups unit major minor definition duties'.split(
    ' ',
  ),
);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Light inflection matching, without expanding unrelated words or inventing synonyms. */
function tokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((term) => term.length > 1 && !stopWords.has(term))
    .map((term) => {
      if (term.length > 5 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
      if (term.length > 4 && term.endsWith('s') && !/(ss|us|is)$/.test(term))
        return term.slice(0, -1);
      return term;
    });
}

function containsPhrase(text: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

const documents = occupations.map((occupation) => {
  const officialNames = new Set([occupation.title, ...occupation.keywords].map(normalize));
  const keywords = [
    ...new Set([occupation.title, ...occupation.keywords, ...(itKeywords[occupation.code] ?? [])]),
  ];
  const phrases = keywords.map((keyword) => ({
    keyword,
    normalized: normalize(keyword),
    supplemental: !officialNames.has(normalize(keyword)),
    terms: new Set(tokens(keyword)),
  }));
  const nameTerms = new Set(phrases.flatMap((phrase) => [...phrase.terms]));
  const frequencies = new Map<string, number>();
  const descriptionTerms = tokens(occupation.description);
  for (const term of descriptionTerms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  return { occupation, phrases, nameTerms, frequencies, length: descriptionTerms.length };
});
const documentFrequency = new Map<string, number>();
for (const document of documents) {
  for (const term of new Set([...document.nameTerms, ...document.frequencies.keys()])) {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
}
const averageLength =
  documents.reduce((total, document) => total + document.length, 0) / Math.max(1, documents.length);
const idf = (term: string): number => {
  const count = documentFrequency.get(term) ?? 0;
  return Math.log(1 + (documents.length - count + 0.5) / (count + 0.5));
};

function boundedDescription(description: string): string {
  if (description.length <= 500) return description;
  let end = 499;
  const previous = description.charCodeAt(end - 1);
  if (previous >= 0xd800 && previous <= 0xdbff) end -= 1;
  return `${description.slice(0, end).trimEnd()}…`;
}

/** Local lexical shortlist, not a classification. Weak or absent evidence returns no candidates. */
export function retrieveOccupations(title: string, body: string, limit = 8): OccupationCandidate[] {
  if (!Number.isInteger(limit) || limit < 1) return [];
  const normalizedTitle = normalize(title.slice(0, 240));
  const normalizedBody = normalize(body.slice(0, 24_000));
  const titleTerms = new Set(tokens(normalizedTitle));
  const queryTerms = new Set([...titleTerms, ...tokens(normalizedBody)]);
  if (!queryTerms.size) return [];

  const ranked = documents.map((document) => {
    let titleRank = 0;
    const matchedKeywords: string[] = [];
    // General words such as "service" must not activate an unrelated IT alias.
    // Official catalogue terms remain available even without a complete phrase match.
    const activePhrases = document.phrases.filter(
      (phrase) =>
        !phrase.supplemental ||
        containsPhrase(normalizedTitle, phrase.normalized) ||
        containsPhrase(normalizedBody, phrase.normalized),
    );
    const activeNameTerms = new Set(activePhrases.flatMap((phrase) => [...phrase.terms]));
    for (const phrase of activePhrases) {
      if (!phrase.terms.size) continue;
      if (normalizedTitle === phrase.normalized) titleRank = Math.max(titleRank, 4);
      else if (containsPhrase(normalizedTitle, phrase.normalized))
        titleRank = Math.max(titleRank, 3);
      else if (phrase.terms.size >= 2 && [...phrase.terms].every((term) => titleTerms.has(term)))
        titleRank = Math.max(titleRank, 2);
      if (
        containsPhrase(normalizedTitle, phrase.normalized) ||
        containsPhrase(normalizedBody, phrase.normalized)
      )
        matchedKeywords.push(phrase.keyword);
    }
    let score = 0;
    let substantiveMatches = 0;
    let shortTitleMatch = false;
    let matchesTitle = false;
    for (const term of queryTerms) {
      const frequency = document.frequencies.get(term) ?? 0;
      const inName = activeNameTerms.has(term);
      if (!frequency && !inName) continue;
      if (titleTerms.has(term)) matchesTitle = true;
      const weight = idf(term);
      if (weight >= 1.7) substantiveMatches += 1;
      if (inName && titleTerms.has(term) && !normalizedTitle.includes(' ') && weight >= 2.5)
        shortTitleMatch = true;
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
      shortTitleMatch,
      matchesTitle,
    };
  });
  // A bare title such as Cleaner may recall a family. When the text narrows that family,
  // omit candidates supported only by the same single title word (for example Network Planner).
  const hasContextualTitleMatch = ranked.some(
    (candidate) => candidate.supported && candidate.matchesTitle,
  );
  return ranked
    .filter(
      (candidate) => candidate.supported || (!hasContextualTitleMatch && candidate.shortTitleMatch),
    )
    .sort(
      (a, b) =>
        b.titleRank - a.titleRank ||
        b.score - a.score ||
        a.document.occupation.code.localeCompare(b.document.occupation.code),
    )
    .slice(0, Math.min(limit, 8))
    .map(({ document, titleRank, score, matchedKeywords }) => ({
      ...document.occupation,
      // Eight titles (<=240) plus eight excerpts (<=500) stay below the API's 6000-character budget.
      title: document.occupation.title.slice(0, 240),
      description: boundedDescription(document.occupation.description),
      retrievalScore: titleRank * 1_000 + score,
      matchedKeywords,
    }));
}
