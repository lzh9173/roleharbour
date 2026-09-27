import { z } from 'zod';
import {
  segmentSchema,
  requirementEntry,
  exactRequirementQuote,
  years,
  jobSchema,
  jevSchema,
} from '../core/schema';
import { MAX_SKILL_CANDIDATES, MAX_EXPERIENCE_CANDIDATES } from '../core/requirements';

// Read-only legacy backup compatibility. These formats never enable an analysis
// engine and are never displayed or reused as JEV results.
// Local rules quote explicit source statements. They do not produce model
// probabilities, confidence estimates, token usage or inferred experience bands.
const localRequirementEntry = requirementEntry.omit({ confidence: true });
const localDecision = z.object({ evidence: z.array(segmentSchema).max(20) });
const localAnalysisSchema = z
  .object({
    version: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/),
    requirements: z.object({
      skills: z
        .array(localRequirementEntry.refine(exactRequirementQuote))
        .max(MAX_SKILL_CANDIDATES),
      experience: z
        .array(
          localRequirementEntry
            .extend({ minYears: years, maxYears: years })
            .refine(exactRequirementQuote)
            .refine(
              (value) =>
                value.minYears === null ||
                value.maxYears === null ||
                value.minYears <= value.maxYears,
            ),
        )
        .max(MAX_EXPERIENCE_CANDIDATES),
      truncated: z.boolean(),
    }),
    sponsorship: localDecision.extend({
      choice: z.enum(['supported', 'not_supported', 'not_mentioned', 'conflict', 'unclear']),
    }),
    workRights: localDecision.extend({
      choice: z.enum(['required', 'not_required', 'not_mentioned', 'conflict', 'unclear']),
    }),
    residency: localDecision.extend({
      choice: z.enum(['citizen_or_resident_only', 'not_mentioned', 'conflict', 'unclear']),
    }),
  })
  .refine((value) =>
    [value.sponsorship, value.workRights, value.residency].every(
      (decision) => decision.choice === 'not_mentioned' || decision.evidence.length > 0,
    ),
  );
// Saved Qwen results contain only accepted decisions and explicit reasons for
// withheld fields. The model's raw response and invented confidence are not stored.
const qwenDecision = z.object({
  choice: z.string().min(1).max(80),
  evidence: z.array(segmentSchema.extend({ id: z.string().regex(/^s[1-9]\d*$/) })).max(8),
});
const qwenIssue = z.enum([
  'invalid_json',
  'invalid_shape',
  'unknown_candidate',
  'missing_evidence',
  'invalid_evidence',
  'unexpected_evidence',
  'unverified_evidence',
  'rule_disagreement',
]);
const qwenVersion = z.string().trim().min(1).max(128);
const qwenAnalysisSchema = z
  .object({
    occupation: qwenDecision.optional(),
    sponsorship: qwenDecision
      .extend({
        choice: z.enum(['supported', 'not_supported', 'not_mentioned', 'conflict', 'unclear']),
      })
      .optional(),
    workRights: qwenDecision
      .extend({
        choice: z.enum(['required', 'not_required', 'not_mentioned', 'conflict', 'unclear']),
      })
      .optional(),
    residency: qwenDecision
      .extend({
        choice: z.enum(['citizen_or_resident_only', 'not_mentioned', 'conflict', 'unclear']),
      })
      .optional(),
    issues: z
      .object({
        occupation: qwenIssue.optional(),
        sponsorship: qwenIssue.optional(),
        workRights: qwenIssue.optional(),
        residency: qwenIssue.optional(),
      })
      .strict(),
    normalizations: z.array(z.literal('occupation_title')).max(1),
    model: qwenVersion,
    revision: qwenVersion,
    dtype: qwenVersion,
    promptVersion: qwenVersion,
    validationVersion: qwenVersion,
    usage: z.object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    }),
    inferenceMs: z.number().finite().nonnegative(),
  })
  .refine((value) =>
    (['occupation', 'sponsorship', 'workRights', 'residency'] as const).every(
      (field) => Boolean(value[field]) !== Boolean(value.issues[field]),
    ),
  )
  .refine((value) =>
    [value.occupation, value.sponsorship, value.workRights, value.residency].every(
      (decision) =>
        !decision ||
        (decision.choice === 'not_mentioned'
          ? decision.evidence.length === 0
          : decision.choice === 'unclear' || decision.evidence.length > 0),
    ),
  )
  .refine(
    (value) =>
      value.normalizations.length === 0 ||
      (value.occupation !== undefined && !['none', 'unclear'].includes(value.occupation.choice)),
  );
// Preserve old records and backup validation without exposing retired engines.
export const archiveJobSchema = jobSchema.extend({
  mode: z.enum(['local', 'jev', 'codex', 'qwen']),
  jev: jevSchema.optional(),
  local: localAnalysisSchema.optional(),
  qwen: qwenAnalysisSchema.optional(),
});
export type ArchivedJob = z.infer<typeof archiveJobSchema>;
