import { describe, expect, it } from 'vitest';
import { experienceEstimateSchema, jobRequirementsSchema } from '../src/core/schema';
import { EXPERIENCE_ESTIMATE_RANGES } from '../src/core/requirements';

const text = 'Independently owns complex production systems and mentors other engineers.';
const estimate = {
  band: 'five_to_eight',
  minYears: 5,
  maxYears: 8,
  confidence: 0.8,
  evidence: [{ id: 'segment_1', text, start: 0, end: text.length }],
};
const requirements = { skills: [], experience: [], truncated: false };

describe('stored inferred experience validation', () => {
  it('accepts all fixed ranges and legacy records without an estimate', () => {
    expect(jobRequirementsSchema.safeParse(requirements).success).toBe(true);
    for (const [band, range] of Object.entries(EXPERIENCE_ESTIMATE_RANGES)) {
      expect(
        jobRequirementsSchema.safeParse({
          ...requirements,
          experienceEstimate: { ...estimate, band, ...range },
        }).success,
      ).toBe(true);
    }
  });

  it.each([
    { ...estimate, band: 'unknown' },
    { ...estimate, minYears: 4 },
    { ...estimate, maxYears: null },
    { ...estimate, confidence: 0.59 },
    { ...estimate, confidence: 1.1 },
    { ...estimate, evidence: [] },
    { ...estimate, evidence: [...estimate.evidence, ...estimate.evidence] },
    { ...estimate, evidence: [{ ...estimate.evidence[0], id: 'invented' }] },
    { ...estimate, evidence: [{ ...estimate.evidence[0], text: 'Invented quote' }] },
    { ...estimate, evidence: [{ ...estimate.evidence[0], start: -1 }] },
    {
      ...estimate,
      evidence: [{ ...estimate.evidence[0], start: 24000, end: 24000 + text.length }],
    },
  ])('rejects altered bounds, confidence or source coordinates %#', (value) => {
    expect(experienceEstimateSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    { minYears: 0, maxYears: null },
    { minYears: null, maxYears: 2 },
  ])('rejects an estimate when explicit years are also present: %j', (years) => {
    const quote = 'Up to two years of experience.';
    const experience = [
      {
        text: quote,
        level: 'preferred',
        confidence: 0.8,
        ...years,
        evidence: { id: 'requirement_1', text: quote, start: 0, end: quote.length },
      },
    ];
    expect(
      jobRequirementsSchema.safeParse({ ...requirements, experience, experienceEstimate: estimate })
        .success,
    ).toBe(false);
  });
});
