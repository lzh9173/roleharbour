import { z } from 'zod';
import type { JevClassification } from '../src/providers/jev';

const level = z.enum(['required', 'preferred', 'unclear']);
const statement = z.object({ text: z.string().min(1), level });
const experience = statement
  .extend({
    minYears: z.number().min(0).max(60).nullable(),
    maxYears: z.number().min(0).max(60).nullable(),
  })
  .refine(
    (item) => item.minYears === null || item.maxYears === null || item.minYears <= item.maxYears,
    'Experience bounds must be ordered.',
  );

export const benchmarkSchema = z.object({
  schemaVersion: z.literal(1),
  cases: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        sector: z.string().min(1),
        title: z.string().min(1).max(240),
        body: z.string().min(40).max(24_000),
        expected: z.object({
          occupationIds: z.array(z.string()).min(1),
          sponsorship: z.enum(['supported', 'not_supported', 'not_mentioned', 'conflict']),
          workRights: z.enum(['required', 'not_required', 'not_mentioned', 'conflict']),
          residency: z.enum(['citizen_or_resident_only', 'not_mentioned', 'conflict']),
          skills: z.array(statement),
          experience: z.array(experience),
          estimate: z.enum(['must_abstain', 'not_scored']),
        }),
      }),
    )
    .min(1),
});

export type BenchmarkCase = z.infer<typeof benchmarkSchema>['cases'][number];
type Statement = z.infer<typeof statement>;
type Experience = z.infer<typeof experience>;

/** Only formatting differences are ignored; qualifiers and source scope must survive. */
export function quoteKey(text: string): string {
  return text
    .trim()
    .replace(/^[-*•●▪]\s*/, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function assertBenchmark(cases: BenchmarkCase[], occupationIds: Set<string>): void {
  if (new Set(cases.map((item) => item.id)).size !== cases.length)
    throw new Error('Duplicate benchmark case IDs.');
  for (const item of cases) {
    if (item.expected.occupationIds.some((id) => !occupationIds.has(id) && id !== 'insufficient'))
      throw new Error(`Unknown reference occupation in ${item.id}.`);
    for (const kind of ['skills', 'experience'] as const) {
      const statements = item.expected[kind];
      if (new Set(statements.map((entry) => quoteKey(entry.text))).size !== statements.length)
        throw new Error(`Duplicate ${kind} reference in ${item.id}.`);
      for (const entry of statements) {
        if (!item.body.includes(entry.text))
          throw new Error(`Reference quote absent from ${item.id}.`);
        if (item.body.indexOf(entry.text) !== item.body.lastIndexOf(entry.text))
          throw new Error(`Ambiguous repeated reference quote in ${item.id}.`);
      }
    }
  }
}

export interface StatementScore {
  expected: number;
  predicted: number;
  matched: number;
  correct: number;
  levelCorrect: number;
  numericExpected: number;
  numericCorrect: number;
  missing: string[];
  unexpected: string[];
  mismatches: Array<{ text: string; field: 'level' | 'duration' }>;
}

function sameNumber(actual: number | null, expected: number | null): boolean {
  return (
    actual === expected ||
    (actual !== null && expected !== null && Math.abs(actual - expected) < 1e-8)
  );
}

/** One prediction can satisfy at most one complete reference statement. */
export function scoreStatements(
  expected: Array<Statement | Experience>,
  predicted: Array<Statement | Experience>,
): StatementScore {
  const remaining = new Set(expected.map((_item, index) => index));
  const result: StatementScore = {
    expected: expected.length,
    predicted: predicted.length,
    matched: 0,
    correct: 0,
    levelCorrect: 0,
    numericExpected: expected.filter(
      (item) => 'minYears' in item && (item.minYears !== null || item.maxYears !== null),
    ).length,
    numericCorrect: 0,
    missing: [],
    unexpected: [],
    mismatches: [],
  };
  for (const actual of predicted) {
    const index = [...remaining].find(
      (candidate) => quoteKey(expected[candidate]!.text) === quoteKey(actual.text),
    );
    if (index === undefined) {
      result.unexpected.push(actual.text);
      continue;
    }
    remaining.delete(index);
    const reference = expected[index]!;
    result.matched++;
    const sameLevel = actual.level === reference.level;
    if (sameLevel) result.levelCorrect++;
    else result.mismatches.push({ text: reference.text, field: 'level' });
    const sameDuration =
      !('minYears' in reference) ||
      ('minYears' in actual &&
        sameNumber(actual.minYears, reference.minYears) &&
        sameNumber(actual.maxYears, reference.maxYears));
    if (!sameDuration) result.mismatches.push({ text: reference.text, field: 'duration' });
    if (sameLevel && sameDuration) {
      result.correct++;
      if ('minYears' in reference && (reference.minYears !== null || reference.maxYears !== null))
        result.numericCorrect++;
    }
  }
  result.missing = [...remaining].map((index) => expected[index]!.text);
  return result;
}

export function scoreCase(item: BenchmarkCase, result?: JevClassification) {
  return {
    occupation: !!result && item.expected.occupationIds.includes(result.occupation.choice),
    sponsorship: result?.sponsorship.choice === item.expected.sponsorship,
    workRights: result?.workRights.choice === item.expected.workRights,
    residency: result?.residency.choice === item.expected.residency,
    skills: scoreStatements(item.expected.skills, result?.requirements.skills ?? []),
    experience: scoreStatements(item.expected.experience, result?.requirements.experience ?? []),
    // Delivery failures do not count as successful abstention.
    estimateAbstained:
      item.expected.estimate === 'must_abstain'
        ? !!result && !result.requirements.experienceEstimate
        : null,
  };
}

export const ratio = (correct: number, total: number): number | null =>
  total > 0 ? correct / total : null;

export function aggregateStatements(scores: StatementScore[]) {
  const sum = (
    key:
      | 'expected'
      | 'predicted'
      | 'matched'
      | 'correct'
      | 'levelCorrect'
      | 'numericExpected'
      | 'numericCorrect',
  ) => scores.reduce((total, score) => total + score[key], 0);
  const expected = sum('expected');
  const predicted = sum('predicted');
  const matched = sum('matched');
  const correct = sum('correct');
  return {
    expected,
    predicted,
    matched,
    correct,
    detectionPrecision: ratio(matched, predicted),
    detectionRecall: ratio(matched, expected),
    strictPrecision: ratio(correct, predicted),
    strictRecall: ratio(correct, expected),
    strictF1: ratio(2 * correct, predicted + expected),
    levelAgreementOnMatched: ratio(sum('levelCorrect'), matched),
    numericCorrect: sum('numericCorrect'),
    numericExpected: sum('numericExpected'),
    numericRecall: ratio(sum('numericCorrect'), sum('numericExpected')),
  };
}
