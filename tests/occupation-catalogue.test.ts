import { describe, expect, it } from 'vitest';
import catalogue from '../data/occupations/anzsco-v1.3.json';
import { occupations, CATALOGUE_METADATA } from '../data/occupations';

describe('official ANZSCO v1.3 import integrity', () => {
  it('includes all active occupations across the eight major groups, without duplicates', () => {
    expect(occupations).toHaveLength(1023);
    expect(new Set(occupations.map(({ code }) => code)).size).toBe(1023);
    expect(new Set(occupations.map(({ id }) => id)).size).toBe(1023);
    const counts = Array.from(
      { length: 8 },
      (_, index) => occupations.filter(({ code }) => code.startsWith(String(index + 1))).length,
    );
    expect(counts).toEqual([99, 318, 179, 105, 80, 37, 77, 128]);
    expect(new Set(occupations.map(({ code }) => code.slice(0, 4))).size).toBe(358);
  });

  it('excludes retired and residual codes and retains source and context provenance', () => {
    for (const occupation of occupations) {
      expect(occupation.code).toMatch(/^[1-8]\d{5}$/);
      expect(occupation.code.endsWith('000')).toBe(false);
      expect(CATALOGUE_METADATA.excludedRetiredCodes).not.toContain(occupation.code);
      expect(occupation.title).not.toMatch(/code retired/i);
      expect(occupation.descriptionKind).toBe('official_directory_context');
      expect(occupation.description).toContain('not an official duties definition');
      expect(occupation.sourceUrl).toMatch(/^https:\/\/www\.abs\.gov\.au\//);
      expect(occupation.nzSkillLevel).toBeGreaterThanOrEqual(1);
      expect(occupation.nzSkillLevel).toBeLessThanOrEqual(5);
    }
    expect(CATALOGUE_METADATA.excludedRetiredCodes).toHaveLength(9);
    expect(CATALOGUE_METADATA.license).toBe('CC BY 4.0');
    expect(
      Object.values(CATALOGUE_METADATA.sha256).every((hash) => /^[a-f0-9]{64}$/.test(hash)),
    ).toBe(true);
  });

  it('preserves official alternative names without index markers or blank aliases', () => {
    const aliases = catalogue.occupations.flatMap(({ aliases }) => aliases);
    expect(aliases).toHaveLength(2219);
    expect(aliases.every((alias) => alias.trim().length > 0 && !/\([PASN]\)$/.test(alias))).toBe(
      true,
    );
    expect(occupations.find(({ code }) => code === '111111')?.keywords).toContain(
      'Chief Executive Officer',
    );
    expect(occupations.find(({ code }) => code === '111211')?.keywords).toContain(
      'Kaiwhakahaere (NZ)',
    );
  });

  it('uses the New Zealand skill level when the Australian value differs', () => {
    for (const [code, level] of [
      ['211412', 2],
      ['351411', 4],
      ['411213', 1],
      ['421112', 3],
    ] as const) {
      expect(occupations.find((occupation) => occupation.code === code)?.nzSkillLevel).toBe(level);
    }
  });
});
