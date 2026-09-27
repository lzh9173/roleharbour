import { describe, expect, it } from 'vitest';
import { occupations, retrieveOccupations } from '../src/rules/occupations';

describe('full occupation catalogue retrieval', () => {
  it.each([
    [
      'Registered Nurse',
      'Provide nursing care, administer medicines and monitor patients in a hospital ward.',
      /^2544/,
    ],
    [
      'Carpenter',
      'Construct timber framing, read building plans, install doors, windows and joinery.',
      /^331212$/,
    ],
    [
      'Accountant',
      'Prepare financial statements, reconcile accounts, tax returns, budgeting and audits.',
      /^221111$/,
    ],
    [
      'Primary School Teacher',
      'Teach literacy and numeracy to children in a primary school classroom.',
      /^241213$/,
    ],
    [
      'Chef',
      'Plan menus, prepare and cook meals, and supervise the restaurant kitchen.',
      /^351311$/,
    ],
    [
      'Dairy Cattle Farmer',
      'Manage a dairy cattle herd, milking, animal health and pasture on the farm.',
      /^121313$/,
    ],
    [
      'Electrician (General)',
      'Install, test and repair electrical wiring, switches and lighting systems.',
      /^341111$/,
    ],
    [
      'Commercial Cleaner',
      'Clean office floors, wash bathrooms, vacuum carpets and remove rubbish.',
      /^811211$/,
    ],
    [
      'Truck Driver (General)',
      'Drive heavy trucks, deliver goods and inspect loads and vehicle safety.',
      /^733111$/,
    ],
    [
      'Class 5 Driver',
      'Transport freight, drive heavy articulated trucks, inspect loads and maintain logbooks.',
      /^733111$/,
    ],
    [
      'Software Engineer',
      'Design and develop software applications, implement backend services and test systems.',
      /^261313$/,
    ],
  ])('recalls %s without restricting work to IT', (title, body, expectedCode) => {
    expect(
      retrieveOccupations(title, body).some((candidate) => expectedCode.test(candidate.code)),
    ).toBe(true);
  });

  it('prioritizes a complete occupation name over repeated partial-name duties', () => {
    const results = retrieveOccupations(
      'Primary School Teacher',
      'Early childhood teachers support children in childcare. '.repeat(60),
    );
    expect(results[0]?.code).toBe('241213');
  });

  it('retains useful legacy IT aliases and multiple plausible platform candidates', () => {
    const support = retrieveOccupations(
      'IT Support Engineer',
      'Resolve service desk user tickets and provide desktop support.',
    );
    expect(support[0]?.code).toBe('313112');
    expect(support[0]?.matchedKeywords).toEqual(
      expect.arrayContaining(['service desk', 'desktop support']),
    );
    expect(support.map(({ code }) => code)).toContain('313199');
    expect(
      retrieveOccupations(
        'Platform Engineer',
        'Develop software architecture and operate Linux Kubernetes infrastructure.',
      ).map(({ code }) => code),
    ).toEqual(expect.arrayContaining(['261313', '262113']));
    expect(
      retrieveOccupations('Senior Frontend Developer', 'Build React interfaces with TypeScript.')[0]
        ?.code,
    ).toBe('261312');
  });

  it('does not let an unmatched IT alias displace a customer service candidate', () => {
    const title = 'Customer Service Representative';
    const body =
      'Answer customer calls, resolve complaints, process orders and provide product information.';
    const codes = retrieveOccupations(title, body).map(({ code }) => code);
    expect(codes).toContain('541112');
    expect(codes).not.toContain('313112');

    // An earlier IT job must not leave its supplemental terms active for the next job.
    retrieveOccupations('IT Support Engineer', 'Resolve service desk user tickets.');
    expect(retrieveOccupations(title, body).map(({ code }) => code)).toEqual(codes);
  });

  it('recalls explicit occupation names in the body when the title is generic', () => {
    const results = retrieveOccupations(
      'Team member',
      'The chef will prepare and cook meals in a restaurant kitchen, plan menus and supervise food preparation.',
    );
    expect(results.map(({ code }) => code)).toContain('351311');
  });

  it('abstains on missing, unknown or generic recruitment text', () => {
    expect(retrieveOccupations('', '')).toEqual([]);
    expect(retrieveOccupations('Xylazoom Qvaxp', 'Qvaxp xylazoom.')).toEqual([]);
    expect(
      retrieveOccupations(
        'Great opportunity',
        'Join our friendly team. We offer competitive pay and flexible hours. Apply now.',
      ),
    ).toEqual([]);
    expect(
      retrieveOccupations('Planner', 'Manage landscape planning.').some((item) =>
        /^(?:261|262|263|313)/.test(item.code),
      ),
    ).toBe(false);
  });

  it('bounds model excerpts and counts without changing the complete catalogue', () => {
    const before = occupations.map(({ description }) => description);
    const longRecord = occupations.find(({ description }) => description.length > 500)!;
    expect(longRecord).toBeDefined();
    const excerpt = retrieveOccupations(longRecord.title, '').find(
      ({ id }) => id === longRecord.id,
    )!;
    expect(excerpt.description.length).toBeLessThanOrEqual(500);
    expect(excerpt.description).toContain('not an official duties definition');
    expect(excerpt.descriptionKind).toBe(longRecord.descriptionKind);
    expect(longRecord.description.length).toBeGreaterThan(500);
    const results = retrieveOccupations(
      'Engineer',
      'Design software and hardware systems. Develop applications and administer network infrastructure.',
      100,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(8);
    expect(
      results.every(({ description }) => description.length > 0 && description.length <= 500),
    ).toBe(true);
    expect(
      results.reduce(
        (sum, candidate) => sum + candidate.title.length + candidate.description.length,
        0,
      ),
    ).toBeLessThanOrEqual(6_000);
    expect(occupations.map(({ description }) => description)).toEqual(before);
    expect(retrieveOccupations('Chef', '', 0)).toEqual([]);
    expect(retrieveOccupations('Chef', '', Number.NaN)).toEqual([]);
    expect(retrieveOccupations('Chef', '', 1)).toHaveLength(1);
  });
});
