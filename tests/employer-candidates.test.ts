import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkEmployers, importEmployerData, SNAPSHOT_ORIGIN } from '../src/employers';
import { t } from '../src/i18n';

/** The review note states how many candidates were found and how many are shown. */
const candidateNote = (count: number, shown = Math.min(count, 5)) =>
  t('errors.employerCandidates', { count, shown });

const source = {
  format: 'json' as const,
  sourceDate: '2026-09-19',
  snapshotSourceUrl: `${SNAPSHOT_ORIGIN}/snapshots/2026-09-19/employers.csv`,
  generatedAt: Date.parse('2026-09-19T09:00:00Z'),
};
function row(name: string, index = 0, trading = '') {
  return {
    employer_name: name,
    trading_name: trading,
    nzbn: String(9429000000000 + index),
    expiry_date_of_accreditation: '2027-01-01',
    last_verified_at: '2026-09-19T09:00:00Z',
  };
}
beforeEach(async () => {
  await deleteDB('seek-filter-employers');
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-19T10:00:00Z'));
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network request');
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('incomplete employer names', () => {
  it('permits exact two-letter names without guessing identities from two-letter initials', async () => {
    await importEmployerData(JSON.stringify([row('QX'), row('Quirky Xenon Limited', 1)]), source);
    expect((await checkEmployers(['QX']))[0]?.status).toBe('matched');
    await importEmployerData(JSON.stringify([row('Quirky Xenon Limited', 1)]), source);
    expect((await checkEmployers(['QX']))[0]?.status).toBe('not_found');
  });

  it('keeps distinct punctuation variants separate in the batch cache', async () => {
    await importEmployerData(JSON.stringify([row('Smith and Finch Limited')]), source);
    const result = await checkEmployers(['Smith & Finch', 'Smith Finch']);
    expect(result.map(({ status }) => status)).toEqual(['ambiguous', 'not_found']);
  });

  it.each([false, true])(
    'preserves exact identities for ampersand and word variants in either query order (%s)',
    async (reverse) => {
      await importEmployerData(
        JSON.stringify([row('Smith & Finch Limited'), row('Smith and Finch Limited', 1)]),
        source,
      );
      const queries = ['Smith & Finch Ltd', 'Smith and Finch Ltd'];
      if (reverse) queries.reverse();
      for (const result of await checkEmployers(queries)) {
        expect(result.status).toBe('matched');
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0]?.nzbn).toBe(
          result.query.includes('&') ? row('').nzbn : row('', 1).nzbn,
        );
        expect(result.matches[0]?.candidateMatch).toBeUndefined();
      }
    },
  );

  it.each([false, true])(
    'does not promote an ampersand suggestion into an exact match through the batch cache (%s)',
    async (reverse) => {
      await importEmployerData(JSON.stringify([row('Smith and Finch Limited')]), source);
      const queries = ['Smith & Finch Ltd', 'Smith and Finch Ltd'];
      if (reverse) queries.reverse();
      for (const result of await checkEmployers(queries)) {
        expect(result.status).toBe(result.query.includes('&') ? 'ambiguous' : 'matched');
      }
    },
  );

  it.each([
    ['Acme Limited', '', 'Acme', 'name_variant'],
    ['Acme New Zealand Limited', '', 'Acme NZ', 'name_variant'],
    ['Acme (NZ) Limited', '', 'Acme New Zealand', 'name_variant'],
    ['Smith and Finch Limited', '', 'Smith & Finch', 'name_variant'],
    ['Acme-Cloud Limited', '', 'AcmeCloud', 'name_variant'],
    ['The Acme Company Limited', '', 'Acme Company', 'name_variant'],
    ['Acme Cloud Services Limited', '', 'Acme Cloud', 'short_name'],
    ['Acme Cloud Services Limited', '', 'Acme', 'short_name'],
    ['Acme Cloud Services Limited', '', 'ACS', 'initials'],
    ['Synthetic Legal Limited', 'Acme Cloud / Finch Works', 'Finch Works', 'name_variant'],
    ['Synthetic Legal Limited', 'Acme Cloud; Finch Works', 'Acme Cloud', 'name_variant'],
    ['Synthetic Legal Limited', 'Synthetic Legal t/a Acme Cloud', 'Acme Cloud', 'name_variant'],
  ])('suggests %s / %s for %s, always requiring review', async (legal, trading, query, reason) => {
    await importEmployerData(JSON.stringify([row(legal, 0, trading)]), source);
    const result = (await checkEmployers([query]))[0]!;
    expect(result.status).toBe('ambiguous');
    expect(result.note).toBe(candidateNote(1));
    expect(result.matches[0]).toMatchObject({ employerName: legal, candidateMatch: reason });
    expect(result.note).toContain('仅名称相近');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains brand collisions and bounds the displayed candidates without implying uniqueness', async () => {
    await importEmployerData(
      JSON.stringify(Array.from({ length: 8 }, (_, i) => row(`Acme Division ${i} Limited`, i))),
      source,
    );
    const result = (await checkEmployers(['Acme']))[0]!;
    expect(result.status).toBe('ambiguous');
    expect(result.note).toBe(candidateNote(8));
    expect(result.matches).toHaveLength(5);
    expect(result.note).toContain('找到 8');
    expect(result.note).toContain('显示 5');
  });

  it('deduplicates legal/trading suggestions and prefers their strongest explanation', async () => {
    await importEmployerData(
      JSON.stringify([row('Acme Cloud Limited', 0, 'Acme Cloud / Acme Works')]),
      source,
    );
    const result = (await checkEmployers(['Acme Cloud']))[0]!;
    expect(result.note).toBe(candidateNote(1));
    expect(result.matches[0]?.candidateMatch).toBe('name_variant');
  });

  it('keeps exact matches ahead of speculative brand and initials candidates', async () => {
    await importEmployerData(
      JSON.stringify([
        row('Acme', 0),
        row('Acme Cloud Limited', 1),
        row('ACS', 2),
        row('Acme Cloud Services Limited', 3),
      ]),
      source,
    );
    for (const result of await checkEmployers(['Acme', 'ACS'])) {
      expect(result.status).toBe('matched');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.candidateMatch).toBeUndefined();
      expect(result.note).toBe(t('errors.employerMatchNote'));
    }
  });

  it('does not suggest arbitrary substrings, generic prefixes or unrelated geographic names', async () => {
    await importEmployerData(
      JSON.stringify([
        row('Acme Cloud Limited', 0),
        row('Bank of Synthetic Limited', 1),
        row('Acme Australia Limited', 2),
      ]),
      source,
    );
    for (const result of await checkEmployers([
      'Cloud',
      'Bank',
      'New Zealand',
      'Services',
      'Acme NZ',
      'Acne',
      'Acm',
    ])) {
      expect(result.status).toBe('not_found');
      expect(result.matches).toEqual([]);
    }
  });

  it('does not confirm a candidate even when its snapshot record has expired', async () => {
    await importEmployerData(
      JSON.stringify([{ ...row('Acme Limited'), expiry_date_of_accreditation: '2026-09-01' }]),
      source,
    );
    expect((await checkEmployers(['Acme']))[0]).toMatchObject({
      status: 'ambiguous',
      matches: [{ expiryDate: '2026-09-01' }],
    });
  });

  it('rebuilds suggestions after replacing the local snapshot', async () => {
    await importEmployerData(JSON.stringify([row('Acme Cloud Limited')]), source);
    expect((await checkEmployers(['Acme']))[0]?.note).toBe(candidateNote(1));
    await importEmployerData(JSON.stringify([row('Finch Works Limited')]), source);
    expect((await checkEmployers(['Acme']))[0]?.status).toBe('not_found');
    expect((await checkEmployers(['Finch']))[0]?.note).toBe(candidateNote(1));
  });
});
