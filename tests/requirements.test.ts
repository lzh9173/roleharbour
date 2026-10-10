import { describe, expect, it } from 'vitest';
import {
  buildRequirementCandidates,
  MAX_EXPERIENCE_CANDIDATES,
  MAX_REQUIREMENT_TEXT,
  MAX_SKILL_CANDIDATES,
  parseExperienceYears,
} from '../src/local-engine/candidates';

describe('experience years from source text', () => {
  it.each([
    ['1–2 years of commercial experience', 1, 2],
    ['One to two years of work experience', 1, 2],
    ['Minimum 3 years of software engineering experience.', 3, null],
    ['At least three years of relevant experience.', 3, null],
    ['Five years’ experience with production systems.', 5, null],
    ['3+ years of development experience.', 3, null],
    ['three or more years of relevant experience.', 3, null],
    ['1.5 years of professional experience.', 1.5, null],
    ['Up to two years of experience is preferred.', null, 2],
    ['At most 3 years of experience.', null, 3],
    ['No more than two years of experience.', null, 2],
    ['Not more than 18 months of customer service experience.', null, 1.5],
    ['No less than three years of relevant experience.', 3, null],
    ['Not less than three years of relevant experience.', 3, null],
    ['No fewer than six months of professional experience.', 0.5, null],
    ['At least three years of contract negotiation experience is required.', 3, null],
    ['Five years of contract law experience is required.', 5, null],
    ['Minimum two years of study coordination experience is required.', 2, null],
    ['At least three years course development experience is required.', 3, null],
    ['At least three years course-design experience is required.', 3, null],
    ['twenty-five years of specialist experience.', 25, null],
    ['Five (5) years of experience.', 5, null],
    ['Between three and five years of work experience.', 3, 5],
    ['A 3-year background in nursing.', 3, null],
    ['Our team requires five years of commercial experience.', 5, null],
    ['Minimum 18 months of professional experience.', 1.5, null],
    ['Six months of customer service experience.', 0.5, null],
    ['Between six and eighteen months of care experience.', 0.5, 1.5],
    ['Up to 6 months of hospitality experience is preferred.', null, 0.5],
    ['A 6-month background in nursing.', 0.5, null],
    ['72 months of professional experience.', 6, null],
  ] as const)('parses %s', (text, minYears, maxYears) => {
    expect(parseExperienceYears(text)).toEqual({ minYears, maxYears });
  });

  it.each([
    'Our company was founded in 2001 and brings many years of experience.',
    'Our company has twenty years of experience.',
    'We have 30 years of experience serving local clients.',
    'Benefits include five weeks annual leave and a great employee experience.',
    'A three year contract.',
    'Proven experience with customer service.',
    'Three years of development experience and two years of leadership experience.',
    '2–1 years of relevant experience.',
    '100 years of relevant experience.',
    'One hundred twenty years of relevant experience.',
    'Seventy two months of relevant experience.',
    'One year and six months of relevant experience.',
    'Around eighteen months of relevant experience.',
    'Our company has eighteen months of experience.',
    'We have 30 months of experience serving local clients.',
    'Around five years of relevant experience.',
    'At least 3–5 years of relevant experience.',
    'Three and five years of commercial experience.',
    'Less than three years of relevant experience.',
    'Fewer than six months of professional experience.',
    'Experience from a three-year degree is sufficient.',
    'Experience gained during a six-month training course is sufficient.',
  ])('keeps unsupported or non-applicant numbers unknown: %s', (text) => {
    expect(parseExperienceYears(text)).toEqual({ minYears: null, maxYears: null });
  });
});

describe('bounded exact-source requirement candidates', () => {
  it.each([
    'Current certificates in first aid; advanced life support are required.',
    'Nursing registration isn’t required, while first aid is preferred.',
  ])('keeps shared credential modifiers and typographic negation attached: %s', (body) => {
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.map((item) => item.text)).toEqual([body]);
    expect(candidates.skills[0]).toMatchObject({ start: 0, end: body.length });
  });

  it.each([
    'Has experience with AI coding tools (e.g. Claude Code, Cursor, Codex, or similar tools).',
    'Has experience with AI coding tools, e.g. Claude Code, Cursor or Codex.',
    'Requires cloud experience, i.e. AWS or Azure.',
    'B.Sc. Computer Science qualification is preferred.',
    'Has experience supporting U.S. Customers.',
    'Has experience with AI tools (e.g. Claude Code (Anthropic); Cursor; Codex).',
    'Has experience with AI tools (e.g.\nClaude Code, Cursor or Codex).',
  ])('keeps abbreviations and parenthesized examples intact: %s', (statement) => {
    const body = `Requirements\n• ${statement} SQL skills are essential.\n• AWS skills are preferred.`;
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.map((item) => item.text)).toEqual([
      statement,
      'SQL skills are essential.',
      'AWS skills are preferred.',
    ]);
    for (const item of [...candidates.skills, ...candidates.experience])
      expect(body.slice(item.start, item.end)).toBe(item.text);
    expect(candidates.truncated).toBe(false);
    expect(buildRequirementCandidates(body)).toEqual(candidates);
  });

  it('keeps ordinary sentence boundaries after parenthesized examples', () => {
    const body =
      'Experience with tooling (SQL; Node.js) is essential. At least 1.5 years of experience.\n.NET skills are preferred.';
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.map((item) => item.text)).toEqual([
      'Experience with tooling (SQL; Node.js) is essential.',
      'At least 1.5 years of experience.',
      '.NET skills are preferred.',
    ]);
    expect(candidates.experience[1]).toMatchObject({ minYears: 1.5, maxYears: null });
  });

  it('does not let unclosed examples swallow later requirements', () => {
    const body =
      'Experience with tooling (SQL is preferred.\nPython skills are essential.\nAt least two years of experience.';
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills).toHaveLength(3);
    expect(candidates.skills[1]!.text).toBe('Python skills are essential.');
    expect(candidates.experience.some((item) => item.minYears === 2)).toBe(true);
  });

  it('omits an oversized intact example instead of returning a misleading fragment', () => {
    const body = `Experience with AI tools (e.g. ${'Tool, '.repeat(110)}Codex) is preferred.\nSQL skills are essential.`;
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.map((item) => item.text)).toEqual(['SQL skills are essential.']);
    expect(candidates.truncated).toBe(true);
    expect(candidates.skills.every((item) => item.text.length <= MAX_REQUIREMENT_TEXT)).toBe(true);
  });

  it('preserves zero-year and unnumbered experience for the consumer to display appropriately', () => {
    const body =
      'Zero years of commercial experience required.\nHas experience with AI coding tools (e.g. Claude Code, Cursor or Codex).';
    const candidates = buildRequirementCandidates(body);
    expect(candidates.experience).toHaveLength(2);
    expect(candidates.experience[0]).toMatchObject({ minYears: 0, maxYears: null });
    expect(candidates.experience[1]).toMatchObject({ minYears: null, maxYears: null });
  });

  it('preserves each sentence/bullet and does not infer skill names', () => {
    const body =
      'About you\n• TypeScript, SQL and Node.js skills are required.\n• At least three years of experience.\n• AWS certification is preferred.\nBenefits\nFour weeks of annual leave.\nOur company was founded in 1999.';
    const candidates = buildRequirementCandidates(body);
    expect(candidates.truncated).toBe(false);
    expect(
      candidates.skills.some(
        (item) => item.text === 'TypeScript, SQL and Node.js skills are required.',
      ),
    ).toBe(true);
    expect(candidates.experience).toHaveLength(1);
    expect(candidates.experience[0]).toMatchObject({ minYears: 3, maxYears: null });
    for (const candidate of [...candidates.skills, ...candidates.experience]) {
      expect(body.slice(candidate.start, candidate.end)).toBe(candidate.text);
      expect(candidate.text).not.toContain('Python');
    }
  });

  it('limits the candidate count and marks omitted candidates', () => {
    const body = Array.from(
      { length: 80 },
      (_, index) =>
        `Required experience ${index}: at least three years of relevant work experience.`,
    ).join('\n');
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.length).toBeLessThanOrEqual(MAX_SKILL_CANDIDATES);
    expect(candidates.experience.length).toBeLessThanOrEqual(MAX_EXPERIENCE_CANDIDATES);
    expect(candidates.truncated).toBe(true);
  });

  it('does not silently chop long statements into a changed requirement', () => {
    const body = `Experience with ${'specialist tooling '.repeat(40)}is preferred.\nSQL skills are essential.`;
    const candidates = buildRequirementCandidates(body);
    expect(candidates.truncated).toBe(true);
    expect(candidates.skills).toHaveLength(1);
    expect(candidates.skills[0]!.text).toBe('SQL skills are essential.');
  });

  it('retains genuine requirements ahead of excess background prose', () => {
    const body =
      Array.from({ length: 30 }, (_, index) => `Our workplace introduction ${index}.`).join('\n') +
      '\nRequirements\nSQL skills are essential.\nFive years of commercial experience.';
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.some((item) => item.text === 'SQL skills are essential.')).toBe(true);
    expect(candidates.experience.some((item) => item.minYears === 5)).toBe(true);
    expect(candidates.truncated).toBe(true);
  });

  it('prioritises professional and practical credentials across industries', () => {
    const qualifications = [
      'Current practising certificate and Nursing Council registration.',
      'Full Class 2 driver licence with a passenger endorsement.',
      'A recognised teaching qualification.',
      'Completed electrical apprenticeship and trade-qualified status.',
      'Food handling and hygiene training.',
      'Chartered accountant membership.',
    ];
    const body = [
      ...Array.from({ length: 30 }, (_, index) => `Our workplace introduction ${index}.`),
      ...qualifications,
    ].join('\n');
    const candidates = buildRequirementCandidates(body);
    for (const statement of qualifications)
      expect(candidates.skills.map((item) => item.text)).toContain(statement);
    expect(candidates.truncated).toBe(true);
  });

  it.each(['Licences', 'Required credentials', 'Preferred qualifications', 'What you’ll need'])(
    'recognises the cross-industry requirements heading %s',
    (section) => {
      const body = [
        ...Array.from({ length: 30 }, (_, index) => `Our workplace introduction ${index}.`),
        section,
        'Class 2 and a current first-aid ticket.',
      ].join('\n');
      const candidates = buildRequirementCandidates(body);
      expect(candidates.skills.map((item) => item.text)).toContain(
        'Class 2 and a current first-aid ticket.',
      );
      expect(candidates.skills.map((item) => item.text)).not.toContain(section);
    },
  );

  it.each([
    [
      'A forklift licence is required, while first aid is preferred.',
      ['A forklift licence is required', 'while first aid is preferred.'],
    ],
    [
      'Current registration is essential but ward experience is desirable.',
      ['Current registration is essential', 'but ward experience is desirable.'],
    ],
    [
      'Bookkeeping is required, payroll knowledge is a bonus.',
      ['Bookkeeping is required', 'payroll knowledge is a bonus.'],
    ],
    [
      'Bookkeeping is required; payroll knowledge is preferred.',
      ['Bookkeeping is required', 'payroll knowledge is preferred.'],
    ],
  ])('separates independently qualified clauses: %s', (body, expected) => {
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.map((item) => item.text)).toEqual(expected);
    expect(candidates.truncated).toBe(false);
    for (const item of candidates.skills) expect(body.slice(item.start, item.end)).toBe(item.text);
  });

  it('recovers independently qualified clauses from long prose without inventing fragments', () => {
    const required = `Practical experience with ${'specialist equipment and '.repeat(15)}safe handling is required`;
    const preferred = `while ${'specialist equipment and '.repeat(15)}maintenance experience is preferred.`;
    const body = `${required}, ${preferred}`;
    expect(body.length).toBeGreaterThan(MAX_REQUIREMENT_TEXT);
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.map((item) => item.text)).toEqual([required, preferred]);
    expect(candidates.truncated).toBe(false);
    for (const item of candidates.skills) expect(body.slice(item.start, item.end)).toBe(item.text);
  });

  it.each([
    'At least 5 years of engineering experience, including 2 years of leadership experience.',
    'At least 5 years of engineering experience including 24 months of leadership.',
    'At least 5 years of engineering experience and 2 years of leadership experience.',
  ])('preserves separately scoped durations and their relationship: %s', (body) => {
    expect(parseExperienceYears(body)).toEqual({ minYears: null, maxYears: null });
    const candidates = buildRequirementCandidates(body);
    expect(candidates.experience).toHaveLength(2);
    expect(candidates.experience.map((item) => item.minYears)).toEqual([5, 2]);
    expect(candidates.experience[0]!.text).toContain('engineering experience');
    expect(candidates.experience[1]!.text).toMatch(/^(?:including|and) /);
    expect(candidates.experience[1]!.text).toContain('leadership');
    for (const item of [...candidates.skills, ...candidates.experience])
      expect(body.slice(item.start, item.end)).toBe(item.text);
    expect(candidates.truncated).toBe(false);
  });

  it.each([
    '5 years of customer service experience, including 2 years of customer service management.',
    '5 years of hospitality experience, including 2 years of staff training.',
  ])('does not mistake a professional scope for employee tenure or coursework: %s', (body) => {
    const candidates = buildRequirementCandidates(body);
    expect(candidates.experience).toHaveLength(2);
    expect(candidates.experience.map((item) => item.minYears)).toEqual([5, 2]);
    expect(candidates.experience[1]!.text).toMatch(/^including /);
    for (const item of candidates.experience)
      expect(body.slice(item.start, item.end)).toBe(item.text);
  });

  it.each([
    'Registration is required (while specialist certification is preferred).',
    'Either nursing registration is required or a teaching qualification is preferred.',
    'First aid is not required, while food hygiene training is preferred.',
    'Five years of nursing experience or two years of specialist clinical experience.',
    'Five years of nursing experience, including 2 years of paid leave.',
    'A five-year contract, including two years of relevant experience.',
    'Five years of experience, including two years of vocational training.',
  ])('keeps qualifications, alternatives and negation attached: %s', (body) => {
    const candidates = buildRequirementCandidates(body);
    expect(candidates.skills.map((item) => item.text)).toEqual([body]);
    expect(candidates.truncated).toBe(false);
    for (const item of [...candidates.skills, ...candidates.experience])
      expect(body.slice(item.start, item.end)).toBe(item.text);
  });
});

describe('basic overview excerpt precision', () => {
  const basic = (body: string) =>
    buildRequirementCandidates(body, { explicitOnly: true }).skills.map((item) => item.text);

  it('follows common job-ad sections instead of quoting duties, perks or application steps', () => {
    const body = [
      'About Northern Freight',
      'We have supplied hardware stores for over 30 years and value skills development.',
      'What you’ll be doing',
      '• Help train new team members on our scanning system',
      '• Keep certification records up to date',
      '• You must follow site safety rules at all times',
      'You’ll need a current Class 2 licence for site visits.',
      'To be successful in this role you will have:',
      '• Your own hand tools and reliable transport',
      '• A current forklift licence',
      'What’s in it for you?',
      '• Ongoing training and development opportunities',
      '• Career progression and skills development',
      'How to apply',
      'Click apply and include your CV.',
      'Applicants must have the right to work in New Zealand.',
    ].join('\n');
    expect(basic(body)).toEqual([
      'You must follow site safety rules at all times',
      'You’ll need a current Class 2 licence for site visits.',
      'Your own hand tools and reliable transport',
      'A current forklift licence',
      'Applicants must have the right to work in New Zealand.',
    ]);
    const broad = buildRequirementCandidates(body).skills.map((item) => item.text);
    for (const heading of ['What’s in it for you?', 'How to apply', 'What you’ll be doing'])
      expect(broad).not.toContain(heading);
    expect(broad).toContain('Ongoing training and development opportunities');
  });

  it.each(['Perks', 'Why join us?', 'The package', 'What we offer:', 'Benefits include:'])(
    'treats %s as a benefits heading',
    (heading) => {
      expect(basic(`${heading}\nLearning budget and professional training.`)).toEqual([]);
    },
  );

  it.each([
    'Strong TypeScript skills',
    '- Skills and experience',
    'Experience with the following tools is essential.',
  ])('does not mistake a requirement line for a heading: %s', (line) => {
    expect(basic(line)).toEqual([line]);
  });

  it('omits training and equipment the employer provides unless a requirement is stated', () => {
    expect(
      basic(
        [
          'Product training and till induction are provided before independent shifts.',
          'A vehicle and scheduled technical training are included in the role.',
          'Training covers the stock system and our filing process.',
          'We are appointing a teacher for a mixed-ability class.',
          'No previous experience is required because training is provided.',
          'Training will be provided, but a current first aid certificate is essential.',
          'Preference will be given to applicants with a forklift licence.',
        ].join('\n'),
      ),
    ).toEqual([
      'No previous experience is required because training is provided.',
      'Training will be provided, but a current first aid certificate is essential.',
      'Preference will be given to applicants with a forklift licence.',
    ]);
  });

  it('quotes a repeated statement once in both modes', () => {
    const body =
      'A current Class 2 licence is required.\nDeliver goods safely.\n• A current Class 2 licence is required';
    expect(basic(body)).toEqual(['A current Class 2 licence is required.']);
    expect(buildRequirementCandidates(body).skills.map((item) => item.text)).toEqual([
      'A current Class 2 licence is required.',
      'Deliver goods safely.',
    ]);
  });
});
