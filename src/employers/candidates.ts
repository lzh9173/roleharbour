import { normalizeEmployerName } from './data';
import type { EmployerMatch, StoredEmployer } from './types';

type Reason = NonNullable<EmployerMatch['candidateMatch']>;
const genericWords = new Set(
  'a an the and of for in at nz new zealand limited ltd company co group services service solutions international holdings holding bank'.split(
    ' ',
  ),
);

/** These transformations retrieve suggestions only; they never establish employer identity. */
function comparableName(value: string): string {
  return normalizeEmployerName(value.replace(/&/g, ' and '))
    .replace(/\bnew zealand\b/g, 'nz')
    .replace(/\bn z\b/g, 'nz')
    .replace(/\s+(?:limited|ltd|incorporated|inc|corporation|corp)$/g, '')
    .replace(/^the\s+/, '');
}

function nameParts(record: StoredEmployer): string[] {
  // Only Trading Name may contain a list of brands or an explicit trading-as name.
  return [
    record.employerName,
    record.tradingName,
    ...record.tradingName.split(/\s*(?:;|\/|\||\n|\bt\s*\/\s*a\b|\btrading as\b)\s*/i),
  ].filter(Boolean);
}

export function buildEmployerCandidateIndex(records: StoredEmployer[]) {
  const index = new Map<string, Map<string, EmployerMatch>>();
  const rank: Record<Reason, number> = { name_variant: 0, short_name: 1, initials: 2 };
  const add = (key: string, record: StoredEmployer, reason: Reason) => {
    if (!key) return;
    let bucket = index.get(key);
    if (!bucket) index.set(key, (bucket = new Map()));
    const prior = bucket.get(record.nzbn);
    if (prior && rank[prior.candidateMatch!] <= rank[reason]) return;
    const { names: _names, ...match } = record;
    bucket.set(record.nzbn, { ...match, candidateMatch: reason });
  };
  for (const record of records) {
    for (const name of new Set(nameParts(record))) {
      const comparable = comparableName(name);
      const words = comparable.split(' ').filter(Boolean);
      add(`name:${comparable.replaceAll(' ', '')}`, record, 'name_variant');
      // Whole leading words only. Generic names such as "Bank" cannot retrieve everything.
      for (let length = 1; length < words.length; length++) {
        const prefix = words.slice(0, length);
        if (prefix.some((word) => word.length >= 4 && !genericWords.has(word)))
          add(`prefix:${prefix.join(' ')}`, record, 'short_name');
      }
      const initials = words
        .filter((word) => !['a', 'an', 'the', 'and', 'of', 'for', 'in', 'at'].includes(word))
        .map((word) => (word === 'nz' ? 'nz' : word[0]))
        .join('');
      if (/^[a-z]{3,6}$/.test(initials)) add(`initials:${initials}`, record, 'initials');
    }
  }
  return (query: string) => {
    const comparable = comparableName(query);
    const compact = comparable.replaceAll(' ', '');
    if (!comparable.split(' ').some((word) => !genericWords.has(word))) return [];
    const candidates = new Map<string, EmployerMatch>();
    for (const key of [`name:${compact}`, `prefix:${comparable}`, `initials:${compact}`]) {
      for (const [nzbn, match] of index.get(key) ?? []) {
        if (!candidates.has(nzbn)) candidates.set(nzbn, match);
      }
    }
    return [...candidates.values()].sort(
      (a, b) => rank[a.candidateMatch!] - rank[b.candidateMatch!] || a.nzbn.localeCompare(b.nzbn),
    );
  };
}
