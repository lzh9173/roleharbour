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

  it('matches default (General) units, NZ names and plural titles', () => {
    expect(
      retrieveOccupations(
        'Electrician',
        'Install and test wiring, switchboards and lighting in homes and offices.',
      )[0]?.code,
    ).toBe('341111');
    expect(
      retrieveOccupations(
        'Receptionist / Administrator',
        'Greet visitors at the front desk, answer phones and manage room bookings.',
      ).map(({ code }) => code),
    ).toContain('542111');
    expect(
      retrieveOccupations('Welder', 'Weld steel structures and read fabrication drawings.').map(
        ({ code }) => code,
      ),
    ).toContain('322313');
    expect(
      retrieveOccupations('Electricians wanted', 'Residential wiring and switchboard installs.')[0]
        ?.code,
    ).toBe('341111');
  });

  it('normalises spelling variants and standard job-ad abbreviations', () => {
    expect(
      retrieveOccupations(
        'HR Advisor',
        'Advise managers on employment relations, policies and recruitment.',
      ).map(({ code }) => code),
    ).toContain('223111');
  });

  it('ignores occupations named only as excluded work', () => {
    const codes = retrieveOccupations(
      'Learning Facilitator',
      'Teach physics to secondary school pupils and mark assessments. This is not an early childhood or adult training role.',
    ).map(({ code }) => code);
    expect(codes[0]).toBe('241411');
    expect(codes).not.toContain('241111');
    // "not only" and "not just" are emphasis, not an exclusion.
    expect(
      retrieveOccupations(
        'Team member',
        'The chef will not only prepare and cook meals in a restaurant kitchen but also plan menus and supervise food preparation.',
      ).map(({ code }) => code),
    ).toContain('351311');
    expect(
      retrieveOccupations(
        'Team member',
        'Not just a job, a career as a chef: prepare and cook meals in a restaurant kitchen, plan menus and supervise food preparation.',
      ).map(({ code }) => code),
    ).toContain('351311');
  });

  it('uses a distinctive title word only after better-supported candidates', () => {
    expect(
      retrieveOccupations(
        'Payroll Administrator',
        'Process fortnightly payroll, maintain employee records and calculate holiday pay.',
      ).map(({ code }) => code),
    ).toContain('551311');
    const care = retrieveOccupations(
      'Caregiver - Rest Home',
      'Provide personal cares to elderly residents in a rest home, including showering and dressing.',
    ).map(({ code }) => code);
    const carer = care.findIndex((code) => code === '423111' || code === '423313');
    expect(carer).toBeGreaterThanOrEqual(0);
    const unrelated = care.indexOf('821412');
    expect(unrelated === -1 || unrelated > carer).toBe(true);
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

  it('returns catalogue records unchanged, bounds counts and reports how the title matched', () => {
    const before = occupations.map(({ description }) => description);
    const longRecord = occupations.find(({ description }) => description.length > 500)!;
    const match = retrieveOccupations(longRecord.title, '').find(({ id }) => id === longRecord.id)!;
    expect(match.description).toBe(longRecord.description);
    expect(Math.floor(match.titleRank)).toBe(4);
    const results = retrieveOccupations(
      'Engineer',
      'Design software and hardware systems. Develop applications and administer network infrastructure.',
      100,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(8);
    expect(
      Math.floor(retrieveOccupations('Chef', 'Cook meals for a busy restaurant.', 1)[0]!.titleRank),
    ).toBe(4);
    expect(
      retrieveOccupations('Team Member', 'Cook meals for a busy restaurant.', 8).every(
        ({ titleRank }) => titleRank < 2,
      ),
    ).toBe(true);
    expect(occupations.map(({ description }) => description)).toEqual(before);
    expect(retrieveOccupations('Chef', '', 0)).toEqual([]);
    expect(retrieveOccupations('Chef', '', Number.NaN)).toEqual([]);
    expect(retrieveOccupations('Chef', '', 1)).toHaveLength(1);
  });
});

describe('everyday titles', () => {
  it('recognises O*NET title synonyms of catalogue occupations', () => {
    expect(
      retrieveOccupations(
        'Bartender',
        'Pour beer and wine, mix cocktails and keep the bar clean during busy weekend shifts.',
      )[0]?.code,
    ).toBe('431111');
    expect(
      retrieveOccupations('Head Chef', 'Lead the kitchen team and design seasonal menus.')[0]?.code,
    ).toBe('351311');
  });

  it('uses synonyms as title evidence only, not when the body mentions other roles', () => {
    const codes = retrieveOccupations(
      'Warehouse Worker',
      'Pick and pack orders. During events you will support our bartenders and mixologists with stock.',
    ).map(({ code }) => code);
    expect(codes).not.toContain('431111');
  });

  it('splits "X or Y" catalogue names into both everyday titles', () => {
    expect(
      retrieveOccupations(
        'Call Centre Operator',
        'Answer inbound customer calls, resolve billing questions and log each call.',
      )[0]?.code,
    ).toBe('541112');
    expect(
      retrieveOccupations(
        'Aged Carer',
        'Support elderly residents with showering, dressing and meals in our rest home.',
      )[0]?.code,
    ).toBe('423111');
  });
});

describe('advertised title wording', () => {
  const top = (title: string, body = '') => retrieveOccupations(title, body)[0]?.code;
  const codes = (title: string, body = '') =>
    retrieveOccupations(title, body).map(({ code }) => code);

  it('ignores urgency, seniority, schedule and place words around the role', () => {
    expect(top('Diesel Mechanic Wanted – Immediate Start, Hamilton')).toBe('321212');
    expect(top('Barista (Part Time) – Wellington CBD')).toBe('431112');
    expect(top('Senior Accountant – Fixed Term')).toBe('221111');
    expect(retrieveOccupations('Wanted – Immediate Start', '')).toEqual([]);
  });

  it('ranks the advertised role above the person or place it serves', () => {
    const assistant = codes(
      'Personal Assistant to the Managing Director',
      'Manage the diary, prepare board papers and coordinate travel for the managing director.',
    );
    expect(assistant[0]).toBe('521111');
    expect(assistant.indexOf('111111')).not.toBe(0);
    expect(top('PA to our CFO')).toBe('521111');
  });

  it('reads words after to, for, at, with or in as context rather than the role', () => {
    // "builders" names who the labourer works for; the bare title "Builder" is a carpenter.
    const labourer = codes('Labourer for builders in Taupō');
    expect(labourer[0]).toBe('821111');
    expect(labourer.indexOf('331212')).toBeGreaterThan(0);
    expect(top('Chef for busy cafe in Ponsonby')).toBe('351311');
  });

  it('reads a qualifier after a dash as part of the role name', () => {
    expect(top('Housekeeper – Motel')).toBe('811411');
    expect(top('Manager – Sales')).toBe('131112');
    expect(
      top(
        'Support Worker – Community Mental Health',
        'Walk alongside tangata whaiora in the community and support their recovery goals.',
      ),
    ).toBe('411711');
  });

  it('prefers the longest matching title phrase and treats possessives as plurals', () => {
    expect(top("Builder's Offsider")).toBe('821111');
    expect(top('Plumbers Assistant')).toBe('821114');
    expect(top("Plumber's Assistant")).toBe('821114');
    expect(codes("Builder's Offsider").indexOf('331212')).not.toBe(0);
  });

  it('keeps both roles of a slash title', () => {
    expect(codes('Gardener / Landscaper')).toEqual(expect.arrayContaining(['362211', '362213']));
    expect(codes('Cook / Kitchen Hand')).toEqual(expect.arrayContaining(['351411', '851311']));
  });

  it('ranks a role named in the title above a name assembled from its qualifier', () => {
    // "Interiors" qualifies the painting work; it does not make the role an Interior Decorator.
    expect(top('Decorator / Brush Hand – Interiors')).toBe('332211');
  });

  it('matches names written with or without macrons and accents', () => {
    expect(top('Kaiāwhina Kōhanga Reo')).toBe('422113');
    expect(top('Kaiawhina Kohanga Reo')).toBe('422113');
    expect(top('Café Manager')).toBe('141111');
  });

  it('needs a te reo or Māori cue in the title before ranking a Māori-medium unit first', () => {
    const body =
      'Plan play-based learning for children aged 3 to 5 at our kindergarten. We are a bicultural centre: te reo Māori and partnership with whānau are part of every day.';
    expect(top('Teacher', body)).toBe('241111');
    expect(top('Kaiako – Kōhanga Reo', body)).toBe('241112');
  });

  it('expands common job-ad abbreviations', () => {
    expect(top('Auto Tech')).toBe('321211');
    expect(top('Tyre Tech – Retail Store')).toBe('899415');
    expect(top('Stock Agent Rep')).toBe('611112');
    expect(top('Web Dev')).toBe('261212');
    expect(top('Kindy Teacher')).toBe('241111');
  });

  it('matches informal "-ie" and "-y" spellings of the same title', () => {
    expect(top('Posty')).toBe('561212');
    expect(top('Forky')).toBe('721311');
    expect(top('Kitchy')).toBe('851311');
  });

  it('uses common New Zealand bare trade titles', () => {
    expect(top('Builder', 'Frame, clad and fit out new homes with our residential crew.')).toBe(
      '331212',
    );
    expect(top('Tiler')).toBe('333411');
    expect(
      codes(
        'Business Analyst',
        'Gather requirements for our software systems, write user stories and support testing.',
      )[0],
    ).toBe('261111');
    expect(codes('Business Analyst', '')).toContain('224711');
  });
});
