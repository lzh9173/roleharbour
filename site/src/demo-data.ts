/** The demo's job ad and the extension's real reading of it, plus the link between a result
 * the reader points at and the sentence in the ad it was read from. */
import type { LocalReading } from '../../src/core/local-analysis';
import type { EmployerCheck } from '../../src/employers/types';
import { hint, stripBullet } from '../../src/inpage/styles';
import jobFile from '../../promo/data/job.json';
import readingFile from '../../promo/data/reading.json';

export const job = {
  title: jobFile.title,
  employer: jobFile.employer,
  location: jobFile.location,
  body: jobFile.body,
};
/** Output of localAnalysis() for this ad, captured for the promo video and never hand-edited. */
export const reading = readingFile.reading as unknown as LocalReading;

/** Illustrative: the demo does not download the employer list. Labelled as such on the page. */
export const employerCheck: EmployerCheck = {
  query: job.employer,
  status: 'matched',
  matches: [{ employerName: job.employer, tradingName: '', nzbn: '' }],
  checkedAt: null,
};

export interface Span {
  start: number;
  end: number;
}
interface Source extends Span {
  text: string;
}

const sources: Source[] = [
  reading.visa.sponsorship,
  reading.visa.workRights,
  reading.visa.residency,
].flatMap((decision) => decision.evidence);
sources.push(
  ...reading.prep.entries.map((entry) => entry.source),
  ...reading.prep.materials.map((material) => material.source),
  ...reading.prep.other,
  ...reading.prep.experience,
);

/** The sponsorship sentence: highlighted before the reader points at anything. */
export const initialSpan: Span | null = reading.visa.sponsorship.evidence[0] ?? null;

/**
 * The ad sentence behind a panel element. Verdicts and chips carry their sentence as a hover
 * hint (`title`); a material card shows it as text.
 */
export function sourceOf(element: Element, boundary: Element): Span | null {
  for (let node: Element | null = element; node && node !== boundary; node = node.parentElement) {
    const title = node.getAttribute('title');
    if (title) {
      const found = sources.find((source) => hint(source.text) === title);
      if (found) return found;
    }
    if (node.tagName === 'LI') {
      const text = node.textContent ?? '';
      return sources.find((source) => text.includes(stripBullet(source.text))) ?? null;
    }
  }
  return null;
}

export interface AdBlock extends Span {
  kind: 'heading' | 'bullet' | 'paragraph';
}

/** Splits the ad into headings, list items and paragraphs, keeping offsets into the body. */
export function adBlocks(body: string): AdBlock[] {
  const blocks: AdBlock[] = [];
  let offset = 0;
  for (const line of body.split('\n')) {
    const start = offset;
    offset += line.length + 1;
    if (!line.trim()) continue;
    const bullet = /^[-*•●▪]\s*/.exec(line);
    if (bullet)
      blocks.push({ kind: 'bullet', start: start + bullet[0].length, end: start + line.length });
    else if (line.length <= 40 && !/[.!?]$/.test(line))
      blocks.push({ kind: 'heading', start, end: start + line.length });
    else blocks.push({ kind: 'paragraph', start, end: start + line.length });
  }
  return blocks;
}

/** A block's text in up to three pieces: before, inside and after the highlighted span. */
export function splitBlock(
  body: string,
  block: Span,
  mark: Span | null,
): Array<{ text: string; marked: boolean }> {
  const text = (from: number, to: number) => body.slice(from, to);
  if (!mark || mark.end <= block.start || mark.start >= block.end)
    return [{ text: text(block.start, block.end), marked: false }];
  const from = Math.max(block.start, mark.start);
  const to = Math.min(block.end, mark.end);
  return [
    { text: text(block.start, from), marked: false },
    { text: text(from, to), marked: true },
    { text: text(to, block.end), marked: false },
  ].filter((piece) => piece.text);
}
