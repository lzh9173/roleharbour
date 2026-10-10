/** Everything the page panel shows, computed on-device in the extension worker so SEEK
 * pages load no vocabulary or catalogue. */
import { buildPrepChecklist, type PrepChecklist } from '../local-engine/prep';
import { classifyVisa } from '../local-engine/visa';
import type { LocalVisaDecisions } from '../local-engine/types';
import { retrieveOccupations } from '../rules/occupations';
import { redactContacts } from './schema';

export interface LocalReading {
  /** Shown only when the advertised title itself names the occupation. */
  occupationTitle?: string;
  visa: LocalVisaDecisions;
  prep: PrepChecklist;
}

const visaWording =
  /\b(?:visas?|work rights|right to (?:live|work)|citizens?|residen(?:t|ts|cy)|sponsor\w*|AEWV|accredited employer|immigration)\b/i;
/** "Pass a drug test and hold NZ work rights": a second, non-visa ask in the same line. */
function asksMore(text: string): boolean {
  return text
    .split(/;|\band (?=(?:hold|have|be|pass|obtain|possess)\b)/i)
    .some(
      (clause) =>
        !visaWording.test(clause) &&
        /\b(?:pass|hold|have|complete|obtain|possess|own)\b/i.test(clause) &&
        clause.trim().split(/\s+/).length >= 4,
    );
}

export function localAnalysis(title: string, body: string): LocalReading {
  const [cleanTitle, cleanBody] = [redactContacts(title), redactContacts(body)];
  const [top] = retrieveOccupations(cleanTitle, cleanBody, 1);
  const visa = classifyVisa(cleanBody);
  const prep = buildPrepChecklist(cleanTitle, cleanBody);
  // Visa wording already has its own cells; do not repeat it under "other requirements".
  // A line that also asks something else ("pass a drug test and hold NZ work rights") stays.
  const quoted = [visa.sponsorship, visa.workRights, visa.residency].flatMap((d) => d.evidence);
  const covered = (item: { start: number; end: number }) =>
    quoted.reduce(
      (sum, quote) =>
        sum + Math.max(0, Math.min(quote.end, item.end) - Math.max(quote.start, item.start)),
      0,
    );
  prep.other = prep.other.filter(
    (item) => covered(item) < 0.6 * (item.end - item.start) || asksMore(item.text),
  );
  return { ...(top && top.titleRank >= 2 && { occupationTitle: top.title }), visa, prep };
}
