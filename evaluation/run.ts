import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { classifyJob, JevError, JEV_MODEL, type JevClassification } from '../src/providers/jev';
import { buildRequirementCandidates } from '../src/core/requirements';
import { redactContacts } from '../src/core/schema';
import { occupations, retrieveOccupations, TAXONOMY_VERSION } from '../src/rules/occupations';
import {
  aggregateStatements,
  assertBenchmark,
  benchmarkSchema,
  quoteKey,
  ratio,
  scoreCase,
  type BenchmarkCase,
} from './scoring';

const sourceFiles = [
  'src/providers/jev.ts',
  'src/core/requirements.ts',
  'src/core/schema.ts',
  'src/core/analyze.ts',
  'src/rules/occupations.ts',
  'data/occupations/index.ts',
  'data/occupations/anzsco-v1.3.json',
  'data/occupations/it.ts',
  'evaluation/scoring.ts',
  'evaluation/run.ts',
  'scripts/evaluate-jev.mjs',
];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const percent = (value: number | null) => (value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`);

interface Observation {
  reference: BenchmarkCase;
  shortlist: ReturnType<typeof retrieveOccupations>;
  local: {
    occupationIncluded: boolean;
    skillCandidates: { covered: number; expected: number };
    experienceCandidates: { covered: number; expected: number };
    truncated: boolean;
  };
  status: 'pending' | 'success' | 'failed';
  elapsedMs?: number;
  result?: JevClassification;
  error?: { code: string; outcomeUnknown: boolean; diagnostic?: JevError['diagnostic'] };
}

function candidateCoverage(expected: Array<{ text: string }>, actual: Array<{ text: string }>) {
  const keys = new Set(actual.map((item) => quoteKey(item.text)));
  return {
    covered: expected.filter((item) => keys.has(quoteKey(item.text))).length,
    expected: expected.length,
  };
}

/** Round-robin sectors so a small bounded run does not contain only one industry. */
function selectCases(cases: BenchmarkCase[], limit: number): BenchmarkCase[] {
  const groups = [...new Set(cases.map((item) => item.sector))].map((sector) =>
    cases.filter((item) => item.sector === sector),
  );
  const selected: BenchmarkCase[] = [];
  for (let index = 0; selected.length < Math.min(limit, cases.length); index++) {
    for (const group of groups) {
      if (group[index] && selected.length < limit) selected.push(group[index]!);
    }
  }
  return selected;
}

function summarize(observations: Observation[], mode: 'local' | 'live') {
  const attempted = observations.filter((item) => item.status !== 'pending');
  const valid = attempted.filter((item) => item.status === 'success');
  const scored = attempted.map((item) => ({ item, score: scoreCase(item.reference, item.result) }));
  const determinate = (item: Observation) =>
    !item.reference.expected.occupationIds.includes('insufficient');
  const localDeterminate = observations.filter(determinate);
  const conditional = scored.filter(
    ({ item }) => item.local.occupationIncluded && item.status === 'success' && determinate(item),
  );
  const metric = (correct: number, total: number) => ({
    correct,
    total,
    rate: ratio(correct, total),
  });
  const localCoverage = (kind: 'skillCandidates' | 'experienceCandidates') =>
    metric(
      observations.reduce((total, item) => total + item.local[kind].covered, 0),
      observations.reduce((total, item) => total + item.local[kind].expected, 0),
    );
  const visa = Object.fromEntries(
    (['sponsorship', 'workRights', 'residency'] as const).map((field) => {
      const confusion: Record<string, Record<string, number>> = {};
      for (const item of attempted) {
        const expected = item.reference.expected[field];
        const actual = item.result?.[field].choice ?? 'delivery_failure';
        confusion[expected] ??= {};
        confusion[expected][actual] = (confusion[expected][actual] ?? 0) + 1;
      }
      const perState = Object.fromEntries(
        Object.entries(confusion).map(([expected, counts]) => [
          expected,
          metric(
            counts[expected] ?? 0,
            Object.values(counts).reduce((a, b) => a + b, 0),
          ),
        ]),
      );
      return [
        field,
        {
          ...metric(scored.filter(({ score }) => score[field]).length, attempted.length),
          perState,
          confusion,
        },
      ];
    }),
  );
  const abstention = scored.filter(({ score }) => score.estimateAbstained !== null);
  const times = attempted.map((item) => item.elapsedMs!).sort((a, b) => a - b);
  const failures: Record<string, number> = {};
  for (const item of attempted.filter((entry) => entry.error)) {
    const key = [
      item.error!.code,
      item.error!.diagnostic?.stage,
      item.error!.diagnostic?.questionId,
    ]
      .filter(Boolean)
      .join(':');
    failures[key] = (failures[key] ?? 0) + 1;
  }
  return {
    selectedCases: observations.length,
    sectors: [...new Set(observations.map((item) => item.reference.sector))],
    local: {
      occupationRecallAt8: metric(
        localDeterminate.filter((item) => item.local.occupationIncluded).length,
        localDeterminate.length,
      ),
      skillCandidateRecall: localCoverage('skillCandidates'),
      experienceCandidateRecall: localCoverage('experienceCandidates'),
      truncatedCases: observations.filter((item) => item.local.truncated).length,
    },
    live:
      mode === 'local'
        ? null
        : {
            attempted: attempted.length,
            unattempted: observations.length - attempted.length,
            validResponses: metric(valid.length, attempted.length),
            failures,
            occupationEndToEnd: metric(
              scored.filter(({ score }) => score.occupation).length,
              attempted.length,
            ),
            occupationConditional: metric(
              conditional.filter(({ score }) => score.occupation).length,
              conditional.length,
            ),
            skills: aggregateStatements(scored.map(({ score }) => score.skills)),
            experience: aggregateStatements(scored.map(({ score }) => score.experience)),
            visa,
            requiredEstimateAbstention: metric(
              abstention.filter(({ score }) => score.estimateAbstained).length,
              abstention.length,
            ),
            emittedEstimates: valid.filter((item) => item.result!.requirements.experienceEstimate)
              .length,
            forecastAccuracy: null,
            observedUsageOnValidResponsesOnly: valid.reduce(
              (total, item) => ({
                inputTokens: total.inputTokens + item.result!.usage.inputTokens,
                outputTokens: total.outputTokens + item.result!.usage.outputTokens,
              }),
              { inputTokens: 0, outputTokens: 0 },
            ),
            latencyMs: {
              median: times.length ? times[Math.floor((times.length - 1) / 2)] : null,
              p95: times.length ? times[Math.ceil(times.length * 0.95) - 1] : null,
            },
            bySector: Object.fromEntries(
              [...new Set(attempted.map((item) => item.reference.sector))].map((sector) => {
                const group = scored.filter(({ item }) => item.reference.sector === sector);
                return [
                  sector,
                  {
                    attempted: group.length,
                    valid: group.filter(({ item }) => item.status === 'success').length,
                    occupationCorrect: group.filter(({ score }) => score.occupation).length,
                    skills: aggregateStatements(group.map(({ score }) => score.skills)),
                    experience: aggregateStatements(group.map(({ score }) => score.experience)),
                  },
                ];
              }),
            ),
          },
  };
}

type Summary = ReturnType<typeof summarize>;

function markdown(
  summary: Summary,
  observations: Observation[],
  fingerprint: string,
  stopReason: string | null,
): string {
  const measure = (item: { correct: number; total: number; rate: number | null }) =>
    `${item.correct}/${item.total} (${percent(item.rate)})`;
  const live = summary.live;
  return [
    '# Jev evaluation',
    '',
    live
      ? '**Live API benchmark.**'
      : '**Local pipeline benchmark only. No Jev API requests were made.**',
    '',
    `${summary.selectedCases} synthetic cases across ${summary.sectors.length} sectors. Reference labels are AI-agent authored and independently reviewed, not human-expert ground truth or a representative sample of SEEK.`,
    '',
    `Model: ${JEV_MODEL}. Frozen benchmark SHA-256: \`${fingerprint}\`.`,
    '',
    '| Local retrieval measure | Result |',
    '| --- | --- |',
    `| Occupation shortlist recall at 8 | ${measure(summary.local.occupationRecallAt8)} |`,
    `| Complete skill statement candidate recall | ${measure(summary.local.skillCandidateRecall)} |`,
    `| Complete experience statement candidate recall | ${measure(summary.local.experienceCandidateRecall)} |`,
    `| Cases with bounded/truncated candidate extraction | ${summary.local.truncatedCases} |`,
    '',
    ...(live
      ? [
          '| Live measure | Result |',
          '| --- | --- |',
          `| Valid delivery / attempted calls | ${measure(live.validResponses)} |`,
          `| Occupation agreement, all attempted cases | ${measure(live.occupationEndToEnd)} |`,
          `| Occupation agreement, correct shortlist + valid delivery only | ${measure(live.occupationConditional)} |`,
          `| Skills strict precision / recall / F1 | ${percent(live.skills.strictPrecision)} / ${percent(live.skills.strictRecall)} / ${percent(live.skills.strictF1)} |`,
          `| Experience strict precision / recall / F1 | ${percent(live.experience.strictPrecision)} / ${percent(live.experience.strictRecall)} / ${percent(live.experience.strictF1)} |`,
          `| Explicit duration with correct scope and level / reference durations | ${live.experience.numericCorrect}/${live.experience.numericExpected} (${percent(live.experience.numericRecall)}) |`,
          ...Object.entries(live.visa).map(
            ([name, result]) => `| ${name} exact state agreement | ${measure(result)} |`,
          ),
          `| Delivered abstention where required | ${measure(live.requiredEstimateAbstention)} |`,
          `| Emitted inferred experience ranges | ${live.emittedEstimates} (accuracy not measurable from these labels) |`,
          '',
          `Attempted: ${live.attempted}; unattempted: ${live.unattempted}. Stop reason: ${stopReason ?? 'completed'}.`,
          '',
          `Observed tokens on valid responses only: ${live.observedUsageOnValidResponsesOnly.inputTokens} input / ${live.observedUsageOnValidResponsesOnly.outputTokens} output. Failed requests may still be billed; this is not a cost statement. Median / p95 attempted latency: ${live.latencyMs.median ?? 'N/A'} / ${live.latencyMs.p95 ?? 'N/A'} ms.`,
          '',
        ]
      : ['**Jev accuracy remains unmeasured. Local recall is not model accuracy.**', '']),
    '## Case review',
    '',
    '| Case | Shortlist contains reference | Status | Occupation output | Skill correct/reference | Experience correct/reference |',
    '| --- | --- | --- | --- | --- | --- |',
    ...observations.map((item) => {
      const score = item.status === 'pending' ? undefined : scoreCase(item.reference, item.result);
      return `| ${item.reference.id} | ${item.local.occupationIncluded ? 'yes' : 'no'} | ${item.error ? `${item.error.code}:${item.error.diagnostic?.stage ?? ''}` : item.status} | ${item.result?.occupation.choice ?? '—'} | ${score ? `${score.skills.correct}/${score.skills.expected}` : '—'} | ${score ? `${score.experience.correct}/${score.experience.expected}` : '—'} |`;
    }),
    '',
    '## Interpretation',
    '',
    '- Exact source statements are matched one to one, ignoring only bullets, whitespace and final punctuation. Strict scores also require the correct requirement level and, for experience, numeric bounds. Broad paraphrases or missing qualifiers do not count as correct.',
    '- Delivery failures contribute missing references to recall and zero correct categorical decisions. Unattempted cases are listed separately, never presented as successful calls. Precision is N/A when no statements are delivered.',
    '- Candidate recall is measured before Jev. Model conditional agreement excludes retrieval misses and failed delivery; end-to-end agreement includes both. They must not be confused.',
    '- Inferred years have no objective label here. Abstention checks observe the delivered production result, including its local suppression rules; they do not prove the model itself abstained.',
    '- This small, deliberately varied English-language synthetic set is diagnostic. It does not establish real-world accuracy, language coverage, repeatability, calibrated confidence, or immigration eligibility. JSON includes failure reasons, visa confusion tables and per-case mismatches for review.',
    '- Production prompts and retrieval code are not tuned during a benchmark run. New iterations must keep source hashes and use a fresh holdout before claiming an improvement.',
    '',
  ].join('\n');
}

export async function evaluate(options: { live: boolean; limit: number; apiKey?: string }) {
  if (options.live && !options.apiKey?.trim()) throw new Error('missing_key');
  const raw = await readFile('evaluation/jev-benchmark.json', 'utf8');
  const benchmark = benchmarkSchema.parse(JSON.parse(raw));
  assertBenchmark(benchmark.cases, new Set(occupations.map((item) => item.id)));
  const selected = selectCases(benchmark.cases, options.limit);
  const observations: Observation[] = selected.map((reference) => {
    const body = redactContacts(reference.body);
    // Reference offsets and wording must describe exactly what is submitted.
    if (body !== reference.body || redactContacts(reference.title) !== reference.title)
      throw new Error(`Synthetic reference unexpectedly needs redaction: ${reference.id}`);
    const shortlist = retrieveOccupations(reference.title, body, 8);
    const requirements = buildRequirementCandidates(body);
    return {
      reference,
      shortlist,
      local: {
        occupationIncluded: shortlist.some((item) =>
          reference.expected.occupationIds.includes(item.id),
        ),
        skillCandidates: candidateCoverage(reference.expected.skills, requirements.skills),
        experienceCandidates: candidateCoverage(
          reference.expected.experience,
          requirements.experience,
        ),
        truncated: requirements.truncated,
      },
      status: 'pending',
    };
  });
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [file, sha256(await readFile(file, 'utf8'))]),
    ),
  );
  const startedAt = new Date().toISOString();
  const mode = options.live ? 'live' : 'local';
  const directory = resolve(
    'output/jev-eval',
    `${startedAt.replace(/[:.]/g, '-')}-${mode}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  let stopReason: string | null = null;
  const persist = async () => {
    const summary = summarize(observations, mode);
    const report = {
      schemaVersion: 1,
      mode,
      startedAt,
      updatedAt: new Date().toISOString(),
      model: JEV_MODEL,
      taxonomyVersion: TAXONOMY_VERSION,
      benchmarkSha256: sha256(raw),
      sourceHashes,
      requestLimit: options.limit,
      stopReason,
      summary,
      cases: observations.map((item) => ({
        id: item.reference.id,
        sector: item.reference.sector,
        shortlist: item.shortlist.map(({ id, title }) => ({ id, title })),
        local: item.local,
        status: item.status,
        elapsedMs: item.elapsedMs,
        error: item.error,
        result: item.result,
        score: item.status === 'pending' ? null : scoreCase(item.reference, item.result),
      })),
    };
    await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
    });
    await writeFile(
      resolve(directory, 'report.md'),
      markdown(summary, observations, sha256(raw), stopReason),
      { mode: 0o600 },
    );
    return summary;
  };
  // Freeze synthetic input and metadata before the first paid request.
  await writeFile(resolve(directory, 'benchmark.json'), raw, { mode: 0o600 });
  await persist();
  process.on('SIGINT', interrupt);
  try {
    let consecutiveFailures = 0;
    if (options.live)
      for (const observation of observations) {
        if (controller.signal.aborted) {
          stopReason = 'interrupted';
          break;
        }
        const start = performance.now();
        try {
          observation.result = await classifyJob({
            apiKey: options.apiKey!,
            title: redactContacts(observation.reference.title),
            body: redactContacts(observation.reference.body),
            candidates: observation.shortlist,
            signal: controller.signal,
          });
          observation.status = 'success';
          consecutiveFailures = 0;
        } catch (error) {
          observation.status = 'failed';
          observation.error =
            error instanceof JevError
              ? {
                  code: error.code,
                  outcomeUnknown: error.outcomeUnknown,
                  diagnostic: error.diagnostic,
                }
              : { code: 'runner_error', outcomeUnknown: true };
          consecutiveFailures++;
          if (
            [
              'unauthorized',
              'forbidden',
              'rate_limited',
              'aborted',
              'invalid_input',
              'runner_error',
            ].includes(observation.error.code)
          )
            stopReason = observation.error.code;
          else if (consecutiveFailures >= 3) stopReason = 'three_consecutive_failures';
        }
        observation.elapsedMs = Math.round(performance.now() - start);
        console.log(
          `${observation.reference.id}: ${observation.error?.code ?? 'success'} (${observation.elapsedMs} ms)`,
        );
        await persist();
        if (stopReason) break;
      }
    const summary = await persist();
    console.log(
      JSON.stringify({ mode, report: resolve(directory, 'report.md'), summary }, null, 2),
    );
    return summary;
  } finally {
    process.off('SIGINT', interrupt);
  }
}
