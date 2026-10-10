import { describe, expect, it } from 'vitest';
import { buildPrepChecklist, type PrepChecklist } from '../src/local-engine/prep';
import { localAnalysis } from '../src/core/local-analysis';

const ad = (lines: string[]) =>
  `About the role\nYou will build internal tools for our lab team.\n\nWhat you'll bring\n${lines
    .map((line) => `• ${line}`)
    .join('\n')}\n\nHow to apply\nApply online with your CV.`;
const chips = (prep: PrepChecklist) =>
  prep.entries.map((entry) => `${entry.level}:${entry.kind}:${entry.terms.join('|')}`);

describe('buildPrepChecklist', () => {
  it('separates languages, direct alternatives and illustrative examples', () => {
    const prep = buildPrepChecklist(
      'Software Developer',
      ad([
        'Strong Go skills, combined with Rust or C++ experience',
        'UI experience such as Vue, Angular or similar frameworks',
        'An understanding of databases and APIs',
      ]),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:language:Go',
        'required:language:Rust|C++',
        'required:tool:Vue',
        'required:tool:Angular',
        'required:knowledge:Databases',
        'required:knowledge:APIs',
      ]),
    );
  });

  it('splits example lists into chips, drops a closing family word, keeps full AI names', () => {
    const prep = buildPrepChecklist(
      'Software Developer',
      ad([
        'Sound database knowledge such as SQL Server, MySQL or other databases',
        'Cloud experience (e.g. AWS, Azure)',
        'Exposure to AI tools such as GitHub Copilot and Azure OpenAI',
      ]),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:knowledge:Databases',
        'required:tool:Microsoft SQL Server',
        'required:tool:MySQL',
        'required:tool:AWS',
        'required:tool:Azure',
        'required:knowledge:Artificial intelligence',
        'required:tool:GitHub Copilot',
        'required:tool:Azure OpenAI',
      ]),
    );
    // Examples are never shown as "A or B" alternatives, and "other databases" adds nothing.
    expect(chips(prep).join('\n')).not.toMatch(/\||:GitHub$/m);
    expect(chips(prep).filter((chip) => chip.endsWith(':Databases'))).toHaveLength(1);
  });

  it('keeps only asks under other requirements', () => {
    const body = ad([
      'Own transport and basic tools',
      '1.',
      'Pay: $28 per hour, paid weekly',
      'Hours are 7am to 3.30pm, Monday to Friday.',
      'Applications close Friday 30 October.',
      'Text or call now or apply online.',
      'Gear and gumboots are all provided.',
      'You do not need NZ work rights, as we are an accredited employer and can sponsor overseas applicants.',
    ]);
    const reading = localAnalysis('Labourer', body);
    expect(reading.visa.sponsorship.choice).toBe('supported');
    expect(reading.prep.other.map((item) => item.text.replace(/^• /, ''))).toEqual([
      'Own transport and basic tools',
    ]);
  });

  it('lists examples without a family name as separate chips', () => {
    const prep = buildPrepChecklist(
      'Developer',
      ad(['Hands-on work across our modern product stack, e.g. TypeScript, Python or C#']),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:language:TypeScript',
        'required:language:Python',
        'required:language:C#',
      ]),
    );
  });

  it('covers every requirement of a long advert without the old 24-statement cap', () => {
    const tools = ['Xero', 'MYOB', 'Excel', 'Jira', 'Confluence', 'Docker', 'Terraform', 'Git'];
    const lines = Array.from(
      { length: 40 },
      (_, i) => `Hands-on experience with ${tools[i % tools.length]} for project ${i + 1}`,
    );
    lines.push('Experience with Kubernetes is required');
    const prep = buildPrepChecklist('Engineer', ad(lines));
    expect(prep.truncated).toBe(false);
    expect(chips(prep)).toContain('required:tool:Kubernetes');
  });

  it('keeps statements whole around redacted contact details', () => {
    const reading = localAnalysis(
      'Civil Labourer',
      ad([
        'Must be available to start Monday; call Jane on 021 555 1234 to discuss the start date and roster',
        'Questions? Call Sam on 09 555 1234\n5 years experience in civil construction required',
      ]),
    );
    expect(reading.prep.other.map((item) => item.text)).not.toContain(
      'to discuss the start date and roster',
    );
    expect(reading.prep.experience.some((item) => item.minYears === 5)).toBe(true);
  });

  it('does not read ordinary phrases as qualifications or tools', () => {
    const prep = buildPrepChecklist(
      'Sales Representative',
      ad([
        'Must be able to work with a high degree of accuracy',
        'Proven ability to convert qualified leads into sales',
        'Experience resolving Level 2 and Level 3 support tickets',
        'You are a natural networker who enjoys a shared workspace',
        'A maven of social selling',
      ]),
    );
    expect(chips(prep).filter((chip) => /:(?:qualification|tool):/.test(chip))).toEqual([]);
  });

  it('keeps explicit asks that mention pay, provisions or a trial shift', () => {
    const prep = buildPrepChecklist(
      'Builder',
      ad([
        'Must hold public liability insurance of at least $2 million',
        'Must bring your own hand tools; PPE is provided.',
        'Pay close attention to safety procedures on every shift',
        'You must complete a paid trial shift at our Ponsonby store',
      ]),
    );
    expect(prep.other).toHaveLength(4);
  });

  it('ends an example list at a bracket or "plus" and ignores "would like"', () => {
    const prep = buildPrepChecklist(
      'Developer',
      ad([
        'Front-end frameworks (e.g. React or Vue), plus Python or Go',
        'We would like you to know Java or Kotlin',
      ]),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:tool:React',
        'required:tool:Vue',
        'required:language:Python|Go',
        // "We would like" reads as a preference, and Java or Kotlin stay one alternative.
        'preferred:language:Java|Kotlin',
      ]),
    );
  });

  it('keeps the credential, not the residency wording, and reads possessives', () => {
    const prep = buildPrepChecklist(
      'Truck Driver',
      ad([
        'Must be a NZ citizen or permanent resident with a current Class 2 licence',
        "Comfortable with Python's data tooling",
      ]),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining(['required:qualification:Current Class 2 licence']),
    );
    expect(chips(prep).some((chip) => chip.endsWith(':Python'))).toBe(true);
  });

  it('keeps a line that only partly concerns visas', () => {
    const reading = localAnalysis(
      'Labourer',
      ad(['You must be able to pass a pre-employment drug test and hold NZ work rights']),
    );
    expect(reading.visa.workRights.choice).toBe('required');
    expect(reading.prep.other).toHaveLength(1);
  });

  it('reads real-advert section wording for nice-to-haves and perks', () => {
    const body = [
      'Why join Example Co?',
      '• Grow your career: Develop your skills across automation and DevOps.',
      'What you will bring',
      '• Hands-on commercial experience with Python and SQL.',
      '• Experience with TypeScript (preferred but not essential).',
      '• Current eligibility to work in New Zealand and availability to work full-time.',
      '• Solid working knowledge of ReactJS and Laravel',
      '• A practical approach to code quality, testing and debugging.',
      'Nice to have',
      'The following will strengthen an application, but none is mandatory:',
      '• Deeper Azure experience.',
      "You'll have an advantage if you also have",
      '• Experience with GitHub Copilot or Azure OpenAI.',
      'How You Work Matters Here',
      '• You bring a low ego, team-first style',
    ].join('\n');
    const reading = localAnalysis('Software Developer', body);
    const prep = reading.prep;
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:language:Python',
        'preferred:language:TypeScript',
        'preferred:tool:Azure',
        'preferred:tool:GitHub Copilot|Azure OpenAI',
        'required:tool:React',
        'required:tool:Laravel',
      ]),
    );
    // Perks are not asks; adjectives do not turn "hands-on commercial experience" into a
    // quality; list items are not joined across commas ("quality, testing").
    expect(chips(prep).join('\n')).not.toMatch(/DevOps|Quality control/);
    expect(chips(prep).filter((chip) => chip.endsWith('Hands-on approach'))).toEqual([
      'required:personal:Hands-on approach',
    ]);
    expect(prep.other.map((item) => item.text)).not.toContain('How You Work Matters Here');
    expect(reading.visa.workRights.choice).toBe('required');
  });

  it('lists spoken languages only in language wording', () => {
    const prep = buildPrepChecklist(
      'Developer',
      ad([
        'The ability to communicate effectively in both English and Mandarin',
        'Fluency in Japanese or Korean would be an advantage',
        'Strong diagnostic skills on modern European and Japanese cars',
        'Confident using te reo Māori in the classroom',
      ]),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:spoken:English',
        'required:spoken:Mandarin',
        'preferred:spoken:Japanese|Korean',
        'required:spoken:Te reo Māori',
      ]),
    );
    expect(chips(prep).filter((chip) => chip === 'required:spoken:Japanese')).toEqual([]);
  });

  it('splits a closing preference that names something of its own', () => {
    const prep = buildPrepChecklist(
      'Developer',
      ad([
        'Solid working knowledge of PHP, ideally with the Laravel framework.',
        'Experience with TypeScript (preferred but not essential).',
      ]),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:language:PHP',
        'preferred:tool:Laravel',
        'preferred:language:TypeScript',
      ]),
    );
  });

  it('reads an open range as a minimum and keeps yearless experience visible', () => {
    const prep = buildPrepChecklist(
      'Platform Engineer',
      ad([
        '1–2+ years of exposure to cloud or DevOps',
        'Experience operating excavators on civil sites',
        'No experience?',
        'Be supported: Receive the tools, training and support you need to succeed.',
      ]),
    );
    expect(prep.experience.find((item) => item.minYears === 1)?.maxYears).toBeNull();
    expect(prep.other.map((item) => item.text.replace(/^• /, ''))).toEqual([
      'Experience operating excavators on civil sites',
    ]);
  });

  it('ends the requirement list at pitch headings such as "Why this role matters" and "Join our team"', () => {
    const body = [
      'What you will bring',
      '• A degree in Computer Science, Software Engineering, Mechatronics, or equivalent practical experience',
      '• A builder mindset, with enjoyment in improving internal tools and making systems easier to operate',
      '',
      'Why this role matters',
      'This is a role where you will have a direct impact every day, both by helping solve urgent issues for farmers, and by building internal tooling.',
      'Join our team',
      'Halter is committed to promoting a diverse and inclusive workplace — a place where we can each be ourselves.',
      'If you think you have what it takes but don’t necessarily tick every requirement on this job description, please still get in touch and apply.',
      'We’d love to chat to see if you’ll be an epic fit!',
      'If this opportunity sounds like you, please apply below by sending through your cover letter explaining why you’re excited about this role, along with your CV.',
      'Why our team loves working at Halter:',
      '',
      "• Work that genuinely matters. You'll be thrown into the deep end, tackling complex challenges.",
      "• You'll grow here. This isn't easy, and we love that it's hard.",
    ].join('\n');
    const prep = buildPrepChecklist('Junior Software Engineer', body);
    expect(prep.other.map((item) => item.text.replace(/^• /, ''))).toEqual([
      'A builder mindset, with enjoyment in improving internal tools and making systems easier to operate',
    ]);
    // "Or equivalent experience" is a hover detail, not part of the credential chip.
    expect(chips(prep)).toContain(
      'required:qualification:Degree in Computer Science, Software Engineering, Mechatronics',
    );
    // Application materials are asked for under the apply pitch, not the requirement list.
    expect(prep.materials.map((material) => `${material.level}:${material.key}`)).toEqual([
      'required:cover_letter',
    ]);
  });

  it('keeps a qualification as one short credential without its level clause', () => {
    const prep = buildPrepChecklist(
      'Electrician',
      ad([
        'A registered electrician with a current practising licence',
        'A Class 2 licence would be an advantage',
      ]),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:qualification:Registered electrician with a current practising licence',
        'preferred:qualification:Class 2 licence',
      ]),
    );
  });

  it('does not read ordinary words or credential adjectives as tools or credentials', () => {
    const prep = buildPrepChecklist(
      'Kitchen Hand',
      ad([
        'Chef experience is not needed, we will train you',
        'Must be safety checked under the Children’s Act',
        'At least 2 years in a licensed early learning centre',
        'A Class C trailer endorsement is not needed',
      ]),
    );
    const labels = prep.entries.flatMap((entry) => entry.terms);
    expect(labels).not.toContain('Chef');
    expect(labels).not.toContain('Act!');
    expect(labels).not.toContain('C');
    expect(prep.entries.some((entry) => /licensed early learning/i.test(entry.terms[0]!))).toBe(
      false,
    );
  });

  it('names personal qualities in English and ignores them when they describe something else', () => {
    const prep = buildPrepChecklist(
      'Technician',
      ad([
        'A curious mindset and great attention to detail',
        'Hands-on experience with PLC programming',
      ]),
    );
    const personal = prep.entries.filter((entry) => entry.kind === 'personal');
    expect(personal.map((entry) => entry.terms[0])).toEqual(
      expect.arrayContaining(['Curiosity', 'Attention to detail']),
    );
    expect(personal.map((entry) => entry.terms[0])).not.toContain('Hands-on approach');
  });

  it('lists application materials and keeps unmatched requirements visible', () => {
    const prep = buildPrepChecklist(
      'Designer',
      ad([
        'A portfolio showing recent packaging work',
        'Willing to travel to Hamilton once a month',
      ]),
    );
    expect(prep.materials.map((material) => material.key)).toContain('portfolio');
    expect(prep.other.some((item) => item.text.includes('Willing to travel to Hamilton'))).toBe(
      true,
    );
    for (const entry of prep.entries)
      expect(entry.source.text).toBe(
        ad([
          'A portfolio showing recent packaging work',
          'Willing to travel to Hamilton once a month',
        ]).slice(entry.source.start, entry.source.end),
      );
  });

  it('keeps preferred items apart from required ones', () => {
    const prep = buildPrepChecklist(
      'Accounts Assistant',
      ad(['Xero experience is essential', 'MYOB experience would be a bonus']),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining(['required:tool:Xero', 'preferred:tool:MYOB']),
    );
  });

  it('reads lowercase-first names and common web stack tools in their own casing', () => {
    const prep = buildPrepChecklist(
      'Web Developer',
      ad([
        'Very good knowledge of PHP, jQuery and Symfony',
        'Experience with Redux, Webpack and Node',
        'Git and Spring in Agile ceremonies',
        'Working with Spark NZ customers',
      ]),
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:tool:jQuery',
        'required:tool:Symfony',
        'required:tool:Redux',
        'required:tool:Webpack',
        'required:tool:Node.js',
        'required:tool:Git',
        'required:tool:Spring',
        'required:knowledge:Agile delivery',
      ]),
    );
    // The telco is not Apache Spark.
    expect(chips(prep).some((chip) => /Spark/.test(chip))).toBe(false);
  });

  it.each([
    'Is this you?',
    'Your profile',
    'To be successful',
    'What it takes',
    'Selection criteria',
    "You'll be a good fit if:",
  ])('reads the list under "%s" as requirements', (heading) => {
    const prep = buildPrepChecklist(
      'Storeperson',
      `About the role\nYou will drive our forklifts in the warehouse.\n\n${heading}\n- Current forklift licence\n- Experience with Excel\n\nHow to apply\nApply online.`,
    );
    expect(chips(prep)).toEqual(
      expect.arrayContaining([
        'required:qualification:Current forklift licence',
        'required:tool:Excel',
      ]),
    );
  });

  it('ends the requirement list at an "Us:" section and skips contact lines', () => {
    const prep = buildPrepChecklist(
      'Landscaper',
      'You:\n• Have a drivers licence\n• Know your native plants\n\nUs:\n• Work boots and uniform supplied\n• A fun team that finishes early on Fridays\n\nText your name and a good time to talk. Come in for a look around any time.',
    );
    expect(prep.other.map((item) => item.text)).toEqual(['Know your native plants']);
  });

  it('keeps role words such as "assistant" that once marked machine-directed text', () => {
    const prep = buildPrepChecklist(
      'Dental Assistant',
      'Requirements\n- Previous experience as a dental assistant who can answer patient calls is required\n',
    );
    expect(prep.experience).toHaveLength(1);
  });

  it('ignores equal-opportunity and accessibility statements', () => {
    const prep = buildPrepChecklist(
      'Software Developer',
      ad([
        'Strong Python skills',
        'We make reasonable accommodations for any mental health or physical disability',
        'We are an equal opportunity employer committed to diversity and inclusion',
      ]),
    );
    expect(chips(prep)).toEqual(['required:language:Python']);
    expect(prep.other).toEqual([]);
  });

  it('builds a long advert quickly', () => {
    const body = ad(Array.from({ length: 40 }, (_, i) => `Experience with Python and Excel ${i}`));
    const started = performance.now();
    buildPrepChecklist('Analyst', body);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
