import { describe, expect, it } from 'vitest';
import {
  aggregateStatements,
  assertBenchmark,
  benchmarkSchema,
  quoteKey,
  scoreCase,
  scoreStatements,
  type BenchmarkCase,
} from '../evaluation/scoring';
import { JEV_MODEL, type JevClassification, type JevDecision } from '../src/providers/jev';

function reference(): BenchmarkCase {
  const registration = 'Current registration is required.';
  const experience = 'At least 18 months of experience is required.';
  return {
    id: 'synthetic-registration',
    sector: 'synthetic',
    title: 'Synthetic registration role',
    body: `${registration} ${experience} Work alongside the team to provide support.`,
    expected: {
      occupationIds: ['synthetic-occupation'],
      sponsorship: 'not_mentioned',
      workRights: 'not_mentioned',
      residency: 'not_mentioned',
      skills: [{ text: registration, level: 'required' }],
      experience: [{ text: experience, level: 'required', minYears: 1.5, maxYears: null }],
      estimate: 'must_abstain',
    },
  };
}

function decision<T extends string>(choice: T): JevDecision<T> {
  return { choice, confidence: 1, probabilities: { [choice]: 1 }, evidence: [] };
}

function delivered(item: BenchmarkCase = reference()): JevClassification {
  const evidence = (text: string) => ({
    text,
    id: 'synthetic-source',
    start: item.body.indexOf(text),
    end: item.body.indexOf(text) + text.length,
  });
  return {
    model: JEV_MODEL,
    occupation: decision(item.expected.occupationIds[0]!),
    sponsorship: decision(item.expected.sponsorship),
    workRights: decision(item.expected.workRights),
    residency: decision(item.expected.residency),
    requirements: {
      skills: item.expected.skills.map((entry) => ({
        ...entry,
        confidence: 1,
        evidence: evidence(entry.text),
      })),
      experience: item.expected.experience.map((entry) => ({
        ...entry,
        confidence: 1,
        evidence: evidence(entry.text),
      })),
      truncated: false,
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

const allowedOccupations = new Set(['synthetic-occupation']);

describe('Jev benchmark scoring without provider calls', () => {
  it('ignores formatting differences while retaining source words and qualifiers', () => {
    expect(quoteKey('  • Current  registration\nis required.  ')).toBe(
      'Current registration is required',
    );
    const expected = reference().expected.skills;
    const result = scoreStatements(expected, [
      { text: '* Current registration\nis required!', level: 'required' },
    ]);
    expect(result).toMatchObject({ matched: 1, correct: 1, missing: [], unexpected: [] });
  });

  it.each([
    'Current registration',
    'Registration is required.',
    'Current registration is required or equivalent experience is accepted.',
  ])('does not award complete quote credit to a different claim: %s', (text) => {
    const expected = reference().expected.skills;
    const result = scoreStatements(expected, [{ text, level: 'required' }]);
    expect(result).toMatchObject({
      matched: 0,
      correct: 0,
      missing: [expected[0]!.text],
      unexpected: [text],
    });
  });

  it('does not double count duplicate predictions', () => {
    const expected = reference().expected.skills;
    const result = scoreStatements(expected, [expected[0]!, { ...expected[0]! }]);
    expect(result).toMatchObject({
      expected: 1,
      predicted: 2,
      matched: 1,
      correct: 1,
      missing: [],
      unexpected: [expected[0]!.text],
    });
    expect(aggregateStatements([result])).toMatchObject({
      detectionPrecision: 0.5,
      detectionRecall: 1,
      strictPrecision: 0.5,
      strictRecall: 1,
      strictF1: 2 / 3,
    });
  });

  it('counts a wrong requirement level as detected but strictly incorrect', () => {
    const expected = reference().expected.skills;
    const result = scoreStatements(expected, [{ ...expected[0]!, level: 'preferred' }]);
    expect(result).toMatchObject({
      matched: 1,
      correct: 0,
      levelCorrect: 0,
      missing: [],
      unexpected: [],
      mismatches: [{ text: expected[0]!.text, field: 'level' }],
    });
    expect(aggregateStatements([result])).toMatchObject({
      detectionRecall: 1,
      strictPrecision: 0,
      strictRecall: 0,
      levelAgreementOnMatched: 0,
    });
  });

  it('accepts floating point month conversions only within numeric tolerance', () => {
    const expected = [
      {
        text: 'One month of experience.',
        level: 'required' as const,
        minYears: 1 / 12,
        maxYears: null,
      },
    ];
    const close = scoreStatements(expected, [{ ...expected[0]!, minYears: 1 / 12 + 1e-10 }]);
    expect(close).toMatchObject({
      correct: 1,
      numericCorrect: 1,
      numericExpected: 1,
      mismatches: [],
    });
    const wrong = scoreStatements(expected, [{ ...expected[0]!, minYears: 1 / 12 + 1e-6 }]);
    expect(wrong).toMatchObject({
      matched: 1,
      correct: 0,
      numericCorrect: 0,
      mismatches: [{ text: expected[0]!.text, field: 'duration' }],
    });
  });

  it('does not treat open bounds, missing duration or swapped bounds as equivalent', () => {
    const expected = reference().expected.experience;
    const predictions = [
      { ...expected[0]!, maxYears: 1.5 },
      { ...expected[0]!, minYears: null, maxYears: 1.5 },
      { text: expected[0]!.text, level: expected[0]!.level },
    ];
    for (const prediction of predictions) {
      expect(scoreStatements(expected, [prediction])).toMatchObject({
        matched: 1,
        correct: 0,
        numericCorrect: 0,
        mismatches: [{ text: expected[0]!.text, field: 'duration' }],
      });
    }
  });

  it('requires the original experience scope as well as matching numeric bounds', () => {
    const expected = [
      {
        text: 'Five years of engineering experience.',
        level: 'required' as const,
        minYears: 5,
        maxYears: null,
      },
      {
        text: 'Two years of leadership experience.',
        level: 'required' as const,
        minYears: 2,
        maxYears: null,
      },
    ];
    const result = scoreStatements(expected, [
      { ...expected[0]!, text: 'Five years of experience.' },
      { ...expected[1]!, text: 'Two years of engineering experience.' },
    ]);
    expect(result).toMatchObject({ matched: 0, correct: 0, numericExpected: 2, numericCorrect: 0 });
    expect(result.missing).toEqual(expected.map((entry) => entry.text));
    expect(aggregateStatements([result]).numericRecall).toBe(0);
  });

  it('requires the correct level before awarding duration credit', () => {
    const expected = reference().expected.experience;
    const result = scoreStatements(expected, [{ ...expected[0]!, level: 'preferred' }]);
    expect(result).toMatchObject({ matched: 1, correct: 0, numericCorrect: 0, numericExpected: 1 });
  });

  it('reports undefined precision and zero recall when references receive no predictions', () => {
    const summary = aggregateStatements([scoreStatements(reference().expected.experience, [])]);
    expect(summary).toMatchObject({
      expected: 1,
      predicted: 0,
      strictPrecision: null,
      detectionPrecision: null,
      strictRecall: 0,
      detectionRecall: 0,
      strictF1: 0,
      levelAgreementOnMatched: null,
      numericRecall: 0,
    });
  });

  it('uses micro totals instead of averaging per-case percentages', () => {
    const statement = reference().expected.skills[0]!;
    const correct = scoreStatements([statement], [statement]);
    const missed = scoreStatements(
      [
        { text: 'A current certificate.', level: 'required' },
        { text: 'A valid licence.', level: 'required' },
        { text: 'A relevant qualification.', level: 'required' },
      ],
      [],
    );
    expect(aggregateStatements([correct, missed])).toMatchObject({
      expected: 4,
      predicted: 1,
      correct: 1,
      strictPrecision: 1,
      strictRecall: 0.25,
      strictF1: 0.4,
    });
  });

  it('does not turn missing provider delivery into successful labels or abstention', () => {
    const score = scoreCase(reference());
    expect(score).toMatchObject({
      occupation: false,
      sponsorship: false,
      workRights: false,
      residency: false,
      estimateAbstained: false,
      skills: { expected: 1, predicted: 0, correct: 0 },
      experience: { expected: 1, predicted: 0, correct: 0 },
    });
  });

  it('separates delivered abstention from an unscored forecast', () => {
    const item = reference();
    const result = delivered(item);
    expect(scoreCase(item, result)).toMatchObject({
      occupation: true,
      sponsorship: true,
      workRights: true,
      residency: true,
      estimateAbstained: true,
    });
    result.requirements.experienceEstimate = {
      band: 'one_to_three',
      minYears: 1,
      maxYears: 3,
      confidence: 0.8,
      evidence: [],
    };
    expect(scoreCase(item, result).estimateAbstained).toBe(false);
    item.expected.estimate = 'not_scored';
    expect(scoreCase(item, result).estimateAbstained).toBeNull();
    expect(scoreCase(item).estimateAbstained).toBeNull();
  });
});

describe('benchmark reference validation', () => {
  it('accepts complete synthetic references and explicit insufficient occupation labels', () => {
    const item = reference();
    const parsed = benchmarkSchema.parse({ schemaVersion: 1, cases: [item] });
    expect(() => assertBenchmark(parsed.cases, allowedOccupations)).not.toThrow();
    item.expected.occupationIds = ['insufficient'];
    expect(() => assertBenchmark([item], new Set())).not.toThrow();
  });

  it('rejects duplicate case IDs and unknown occupations', () => {
    expect(() => assertBenchmark([reference(), reference()], allowedOccupations)).toThrow(
      'Duplicate benchmark case IDs',
    );
    expect(() => assertBenchmark([reference()], new Set())).toThrow('Unknown reference occupation');
  });

  it('rejects normalized duplicate references before they can inflate recall', () => {
    const item = reference();
    item.expected.skills.push({
      ...item.expected.skills[0]!,
      text: '* Current registration is required!',
    });
    expect(() => assertBenchmark([item], allowedOccupations)).toThrow('Duplicate skills reference');
  });

  it('rejects missing source quotes and ambiguous repeated source quotes', () => {
    const absent = reference();
    absent.expected.skills[0]!.text = 'A qualification not present in the synthetic body.';
    expect(() => assertBenchmark([absent], allowedOccupations)).toThrow('Reference quote absent');
    const repeated = reference();
    repeated.body += ` ${repeated.expected.experience[0]!.text}`;
    expect(() => assertBenchmark([repeated], allowedOccupations)).toThrow(
      'Ambiguous repeated reference quote',
    );
  });

  it('rejects malformed reference states and negative durations', () => {
    const item = reference();
    item.expected.experience[0]!.minYears = -1;
    expect(benchmarkSchema.safeParse({ schemaVersion: 1, cases: [item] }).success).toBe(false);
    expect(
      benchmarkSchema.safeParse({
        schemaVersion: 1,
        cases: [
          { ...reference(), expected: { ...reference().expected, workRights: 'invented-state' } },
        ],
      }).success,
    ).toBe(false);
    expect(benchmarkSchema.safeParse({ schemaVersion: 1, cases: [] }).success).toBe(false);
  });

  it('rejects contradictory duration bounds in reference data', () => {
    const item = reference();
    item.expected.experience[0]!.minYears = 3;
    item.expected.experience[0]!.maxYears = 1;
    expect(benchmarkSchema.safeParse({ schemaVersion: 1, cases: [item] }).success).toBe(false);
  });
});
