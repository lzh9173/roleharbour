import { t } from '../i18n';
import { z } from 'zod';
import {
  EXPERIENCE_ESTIMATE_RANGES,
  MAX_EXPERIENCE_CANDIDATES,
  MAX_REQUIREMENT_TEXT,
  MAX_SKILL_CANDIDATES,
  MIN_EXPERIENCE_ESTIMATE_CONFIDENCE,
  type ExperienceEstimateBand,
} from './requirements';

const amount = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,4})?$/, { error: () => t('reference.validation.amount') });
export const salarySchema = z
  .object({
    min: amount.nullable(),
    max: amount.nullable(),
    currency: z.literal('NZD'),
    period: z.enum(['annual', 'hourly', 'weekly', 'fortnightly', 'monthly']),
    hoursPerWeek: amount.nullable(),
  })
  .refine((v) => !v.min || !v.max || Number(v.min) <= Number(v.max), {
    error: () => t('reference.validation.salaryRange'),
  });
export const draftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { error: () => t('reference.validation.title') })
    .max(240),
  employer: z.string().trim().max(240),
  location: z.string().trim().max(100),
  body: z
    .string()
    .trim()
    .min(40, { error: () => t('reference.validation.body') })
    .max(24000),
  sourceUrl: z.union([
    z.literal(''),
    z.url().refine(
      (value) => {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password;
      },
      { error: () => t('reference.validation.url') },
    ),
  ]),
  salary: salarySchema,
  retainBody: z.boolean(),
});
export type JobDraft = z.infer<typeof draftSchema>;
export const segmentSchema = z.object({
  id: z.string(),
  text: z.string().max(24000),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
const decision = z.object({
  choice: z.string(),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
  confidence: z.number().min(0).max(1),
  evidence: z.array(segmentSchema),
});
export const requirementEntry = z.object({
  text: z.string().min(1).max(MAX_REQUIREMENT_TEXT),
  level: z.enum(['required', 'preferred', 'unclear']),
  evidence: segmentSchema,
  confidence: z.number().finite().min(0).max(1),
});
export const exactRequirementQuote = (
  value: Pick<z.infer<typeof requirementEntry>, 'text' | 'evidence'>,
) =>
  value.text === value.evidence.text &&
  value.evidence.end <= 24000 &&
  value.evidence.end - value.evidence.start === value.text.length;
export const years = z.number().finite().min(0).max(60).nullable();
export const experienceEstimateSchema = z
  .object({
    band: z.enum(
      Object.keys(EXPERIENCE_ESTIMATE_RANGES) as [
        ExperienceEstimateBand,
        ...ExperienceEstimateBand[],
      ],
    ),
    minYears: z.number().finite().min(0).max(8),
    maxYears: z.number().finite().min(1).max(8).nullable(),
    confidence: z.number().finite().min(MIN_EXPERIENCE_ESTIMATE_CONFIDENCE).max(1),
    evidence: z
      .array(
        segmentSchema
          .extend({
            id: z.string().regex(/^segment_[1-9]\d{0,2}$/),
            text: z.string().min(1).max(800),
          })
          .refine((value) => value.end <= 24000 && value.end - value.start === value.text.length, {
            error: () => t('reference.validation.estimateQuote'),
          }),
      )
      .min(1)
      .max(1),
  })
  .refine(
    (value) => {
      const range = EXPERIENCE_ESTIMATE_RANGES[value.band];
      return value.minYears === range.minYears && value.maxYears === range.maxYears;
    },
    { error: () => t('reference.validation.estimateRange') },
  );
export const jobRequirementsSchema = z
  .object({
    skills: z
      .array(
        requirementEntry.refine(exactRequirementQuote, {
          error: () => t('reference.validation.requirementQuote'),
        }),
      )
      .max(MAX_SKILL_CANDIDATES),
    experience: z
      .array(
        requirementEntry
          .extend({ minYears: years, maxYears: years })
          .refine(exactRequirementQuote, {
            error: () => t('reference.validation.requirementQuote'),
          })
          .refine(
            (value) =>
              value.minYears === null ||
              value.maxYears === null ||
              value.minYears <= value.maxYears,
            { error: () => t('reference.validation.experienceRange') },
          ),
      )
      .max(MAX_EXPERIENCE_CANDIDATES),
    experienceEstimate: experienceEstimateSchema.optional(),
    truncated: z.boolean(),
  })
  .refine(
    (value) =>
      !value.experienceEstimate ||
      !value.experience.some((entry) => entry.minYears !== null || entry.maxYears !== null),
    { error: () => t('reference.validation.explicitExperience') },
  );
export const jevSchema = z.object({
  model: z.string(),
  occupation: decision,
  sponsorship: decision.extend({
    choice: z.enum(['supported', 'not_supported', 'not_mentioned', 'conflict']),
  }),
  workRights: decision.extend({
    choice: z.enum(['required', 'not_required', 'not_mentioned', 'conflict']),
  }),
  residency: decision.extend({
    choice: z.enum(['citizen_or_resident_only', 'not_mentioned', 'conflict']),
  }),
  requirements: jobRequirementsSchema.optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
});
export const jobSchema = z.object({
  id: z.string(),
  title: z.string().max(240),
  employer: z.string().max(240),
  location: z.string().max(100),
  sourceUrl: z.string(),
  salary: salarySchema,
  body: z.string().max(24000).optional(),
  contentHash: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  bookmarked: z.boolean(),
  mode: z.literal('jev'),
  candidateIds: z.array(z.string()).max(12),
  jev: jevSchema,
  evidence: z.array(segmentSchema).max(100),
  dataVersion: z.string(),
});
export type SavedJob = z.infer<typeof jobSchema>;
export const settingsMessageSchema = z.object({ type: z.literal('employers:refresh') }).strict();
export type TaskStatus =
  'running' | 'sent' | 'completed' | 'failed' | 'outcome_unknown' | 'interrupted';
export interface AnalysisTask {
  id: string;
  hash: string;
  status: TaskStatus;
  startedAt: number;
  expiresAt: number;
  jobId?: string;
  message?: string;
}
export interface ResultMessage {
  ok: boolean;
  cached?: boolean;
  job?: SavedJob;
  error?: string;
  outcomeUnknown?: boolean;
}

// Preserve positions so citations still point to the supplied text.
export function redactContacts(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (s) => '•'.repeat(s.length))
    .replace(/(?:\+64[\s()-]*|\b0[2-9][\s()-]*)\d[\d\s()-]{6,}\d\b/g, (s) => '•'.repeat(s.length));
}
