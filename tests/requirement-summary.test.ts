import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { JobRequirements, RequirementLevel, SkillRequirement } from '../src/core/requirements';
import { RequirementsView } from '../src/ui/RequirementsView';
import { summarizeRequirements, type RequirementSummaryInput } from '../src/ui/requirement-summary';
import { t } from '../src/i18n';

function skill(text: string, level: RequirementLevel = 'required', start = 0): SkillRequirement {
  return {
    text,
    level,
    confidence: 0.9,
    evidence: { id: `source-${start}`, text, start, end: start + text.length },
  };
}
function requirements(overrides: Partial<JobRequirements> = {}): JobRequirements {
  return { skills: [], experience: [], truncated: false, ...overrides };
}
function renderRequirements(source: JobRequirements): DocumentFragment {
  return JSDOM.fragment(
    renderToStaticMarkup(createElement(RequirementsView, { requirements: source })),
  );
}

describe('source-based requirement summaries', () => {
  it('renders source requirements without inferred experience', () => {
    const text = 'JavaScript is required';
    const source: RequirementSummaryInput = {
      skills: [
        {
          text,
          level: 'required',
          evidence: { id: 'local-skill', text, start: 0, end: text.length },
        },
      ],
      experience: [],
      truncated: false,
    };
    const original = structuredClone(source);
    const summary = summarizeRequirements(source);
    expect(summary.experience).toBe(t('page.experienceNotStated'));
    expect(summary.experienceEstimated).toBe(false);
    const markup = JSDOM.fragment(
      renderToStaticMarkup(createElement(RequirementsView, { requirements: source })),
    );
    expect(markup.textContent).toContain('JavaScript');
    expect(markup.textContent).toContain(t('page.experienceNotStated'));
    expect(markup.querySelector('.experience-estimate-tag')).toBeNull();
    expect(source).toEqual(original);
    expect(source.skills[0]).not.toHaveProperty('confidence');
  });

  it.each(['individual', 'block'])(
    'renders cached %s bullets as concise tags without changing source data or version constraints',
    (shape) => {
      const experience = '1-2 years of experience with the technologies listed in this role';
      const source = requirements({
        skills: [
          ...[
            experience,
            'Must have strong, hands-on experience with C#, .NET 8+, and SQL',
            'Must have strong, hands-on experience with Angular 18+ and TypeScript',
            'Good HTML and CSS skills',
            'Proficient with GitHub Copilot and/or Claude as part of daily development practice',
            'Logical, analytical thinker with high attention to detail',
            'Strong data analysis and troubleshooting skills — tenacious in solving problems',
            'Able to learn and adapt quickly',
            'Good verbal and written communication skills',
            'Good organisational skills with a focus on quality and product improvement; able to work effectively in JIRA or similar',
          ]
            .map((line) => `· ${line}`)
            .reduce<string[]>((items, line, index) => {
              if (shape === 'block' && index > 0 && index < 3) items[0] += `\n\n${line}`;
              else items.push(line);
              return items;
            }, [])
            .map((line) => skill(line)),
          skill(
            '· Some industrial or operational technology (OT) knowledge is an advantage but not required',
            'preferred',
          ),
        ],
        experience: [{ ...skill(experience), minYears: 1, maxYears: 2 }],
      });
      const original = structuredClone(source);
      const summary = summarizeRequirements(source);
      expect(summary.experience).toBe('1–2 年');
      expect(summary.groups).toMatchObject([
        {
          category: 'skills',
          level: 'required',
          skills: [
            'Hands-on: C#',
            'Hands-on: .NET 8+',
            'Hands-on: SQL',
            'Hands-on: Angular 18+',
            'Hands-on: TypeScript',
            'HTML',
            'CSS',
            'GitHub Copilot and/or Claude (daily use)',
            'Data analysis',
            'Troubleshooting',
            'JIRA or similar',
          ],
        },
        {
          category: 'skills',
          level: 'preferred',
          skills: ['industrial or operational technology (OT) knowledge'],
        },
        {
          category: 'personal',
          level: 'required',
          skills: [
            'Logical thinking',
            'Analytical thinking',
            'Attention to detail',
            'Persistent problem-solving',
            'Learning & adaptability',
            'Verbal & written communication',
            'Organisational skills',
            'Quality & product improvement',
          ],
        },
      ]);
      expect(source).toEqual(original);
    },
  );

  it.each([
    'Not required:\n· First aid certificate\n· Driver licence',
    '· Either a diploma\n  or equivalent practical experience\n· Customer service',
    '· Current certificates in:\n· First aid\n· Food safety',
    '· Neither a degree\n· nor a diploma is required',
    '· Clinical systems (such as\n· patient records)\n· Teamwork',
  ])('preserves a shared heading or continuation in a cached list: %s', (text) => {
    const labels = summarizeRequirements(requirements({ skills: [skill(text)] })).groups.flatMap(
      (group) => group.skills,
    );
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('·');
  });

  it('turns a mixed graduate-role JD into categorized tags while retaining alternatives and levels', () => {
    const experience =
      "Around 1–2 years' experience in a technical, analytical, software-related or IT role, or equivalent practical experience.";
    const required = [
      experience,
      "A Bachelor's degree in Computer Science, Software Engineering, Information Systems, Engineering, Science or a related discipline.",
      'Strong analytical and problem-solving skills.',
      'A genuine interest in software engineering, systems and technology.',
      'Confident, practical experience with AI tools and their application in a professional setting.',
      'Curiosity and a willingness to learn unfamiliar technologies and business domains.',
      'Good verbal and written communication skills.',
      'work collaboratively within a team environment.',
      'Strong attention to detail and pride in producing quality work.',
    ];
    const preferred = [
      'Nice to havedatabases and data structures and how data is organized.',
      'Source control and Git familiarity for version management.',
      'Working knowledge of APIs and data formats such as JSON and XML.',
      'software delivery practices across the development lifecycle.',
      'enterprise software and business systems.',
      'Agile delivery approaches and iterative delivery.',
    ];
    const source = requirements({
      skills: [
        ...required.map((text, index) => skill(text, 'required', index * 300)),
        ...preferred.map((text, index) => skill(text, 'preferred', 3000 + index * 300)),
      ],
      experience: [{ ...skill(experience), minYears: null, maxYears: null }],
    });
    const original = JSON.stringify(source);
    const summary = summarizeRequirements(source);
    expect(summary.experience).toBe('Around 1–2 years or equivalent practical experience');
    expect(summary.experienceEstimated).toBe(false);
    expect(summary.groups).toMatchObject([
      { category: 'skills', level: 'required', skills: ['AI tools (professional use)'] },
      {
        category: 'skills',
        level: 'preferred',
        skills: [
          'Databases',
          'Data structures',
          'Source control (Git)',
          'APIs',
          'Data formats (e.g. JSON and XML)',
          'Software development lifecycle',
          'enterprise software',
          'business systems',
          'Agile delivery',
          'Iterative delivery',
        ],
      },
      {
        category: 'qualifications',
        level: 'required',
        skills: [
          "Bachelor's degree — Computer Science, Software Engineering, Information Systems, Engineering, Science or a related discipline",
        ],
      },
      {
        category: 'personal',
        level: 'required',
        skills: [
          'Analytical thinking',
          'Problem-solving',
          'Interest: software engineering, systems and technology',
          'Curiosity',
          'Willingness to learn',
          'Verbal & written communication',
          'Teamwork',
          'Attention to detail',
          'Quality focus',
        ],
      },
    ]);
    expect(summary.groups.flatMap((group) => group.skills)).not.toContain(experience);
    const rendered = renderRequirements(source);
    expect([...rendered.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
      '技能与工具',
      '学历与资质',
      '个人与协作能力',
    ]);
    expect(rendered.textContent).not.toContain('Nice to have');
    expect(rendered.textContent).not.toContain('Strong analytical and problem-solving skills');
    expect(JSON.stringify(source)).toBe(original);
  });

  it('uses an explicit preferred heading without displaying it as a skill', () => {
    const summary = summarizeRequirements(
      requirements({
        skills: [
          skill('Nice to have'),
          skill('Nice to have: first aid certification'),
          skill('Nice to havedatabases and data structures and how data is organized'),
        ],
      }),
    );
    expect(summary.groups).toMatchObject([
      { category: 'skills', level: 'preferred', skills: ['Databases', 'Data structures'] },
      { category: 'qualifications', level: 'preferred', skills: ['first aid certification'] },
    ]);
  });

  it('keeps technical learning, communication, interest and certificate operations out of personal traits', () => {
    const names = [
      'Machine learning',
      'Learning management systems',
      'Communication protocols',
      'Interest rate modelling',
      'Independent audit',
      'TLS certificate management',
    ];
    const summary = summarizeRequirements(
      requirements({ skills: names.map((text) => skill(text)) }),
    );
    expect(summary.groups).toMatchObject([
      { category: 'skills', level: 'required', skills: names },
    ]);
  });

  it('preserves an equivalent-experience alternative when numeric bounds were supplied', () => {
    const text = '1–2 years of experience or equivalent practical experience.';
    const summary = summarizeRequirements(
      requirements({
        skills: [skill(text)],
        experience: [{ ...skill(text), minYears: 1, maxYears: 2 }],
      }),
    );
    expect(summary.experience).toBe('1–2 years or equivalent practical experience');
    expect(summary.groups).toEqual([]);
  });

  it('keeps a degree-or-experience qualification without replacing the AI year estimate', () => {
    const text = "A Bachelor's degree or equivalent practical experience.";
    const source = requirements({
      skills: [skill(text)],
      experience: [{ ...skill(text), minYears: null, maxYears: null }],
      experienceEstimate: {
        band: 'one_to_three',
        minYears: 1,
        maxYears: 3,
        confidence: 0.8,
        evidence: [skill('Build application services.').evidence],
      },
    });
    expect(summarizeRequirements(source)).toMatchObject({
      experience: '1–3 年',
      experienceEstimated: true,
      groups: [
        {
          category: 'qualifications',
          skills: ["A Bachelor's degree or equivalent practical experience"],
        },
      ],
    });
  });

  it.each([
    'preventive and corrective maintenance',
    'financial and management reporting',
    'structural and civil engineering',
    'AI coding tools (e.g. Cursor only)',
    'AI coding tools (e.g. Cursor, not unapproved cloud tools)',
  ])('retains shared scope or an example restriction in %s', (text) => {
    expect(
      summarizeRequirements(requirements({ skills: [skill(text)] })).groups[0]!.skills,
    ).toEqual([text]);
  });

  it.each([
    [
      'five years of experience or equivalent practical experience.',
      'five years or equivalent practical experience',
    ],
    [
      'Between five and seven years of experience or equivalent practical experience.',
      'Between five and seven years or equivalent practical experience',
    ],
    [
      '1.5 years of experience or equivalent practical experience.',
      '1.5 years or equivalent practical experience',
    ],
    [
      '5 years of nursing experience, including 2 years of leadership, or equivalent practical experience.',
      '5 years of nursing experience, including 2 years of leadership, or equivalent practical experience',
    ],
  ])('retains decimal and multiple duration scope in %s', (text, expected) => {
    expect(
      summarizeRequirements(
        requirements({ experience: [{ ...skill(text), minYears: null, maxYears: null }] }),
      ).experience,
    ).toBe(expected);
  });

  it.each([
    ['First aid certification if required.', 'First aid certification if required'],
    ['First aid certification may be required.', 'First aid certification may be required'],
    ['First aid certification sometimes required.', 'First aid certification sometimes required'],
    ['Nursing registration isn’t required.', 'Nursing registration isn’t required'],
    ['Applicants don’t need a forklift licence.', 'Applicants don’t need a forklift licence'],
    [
      'Current certificates in first aid; advanced life support are required.',
      'Current certificates in first aid; advanced life support',
    ],
  ])('preserves the condition or shared credential scope in %s', (text, expected) => {
    const result = summarizeRequirements(requirements({ skills: [skill(text, 'unclear')] }));
    expect(result.groups[0]?.skills).toEqual([expected]);
  });

  it('keeps different experience scopes even when their numeric durations are equal', () => {
    const result = summarizeRequirements(
      requirements({
        experience: [
          { ...skill('2 years of nursing experience.'), minYears: 2, maxYears: null },
          { ...skill('2 years of supervisory experience.'), minYears: 2, maxYears: null },
        ],
      }),
    );
    expect(result.experience).toBe(
      '2 years of nursing experience / 2 years of supervisory experience',
    );
    expect(result.experienceEstimated).toBe(false);
  });

  it('keeps older results without an estimate compatible and clearly unestimated', () => {
    const old = requirements({
      experience: [
        {
          ...skill('Experience maintaining production systems.'),
          minYears: null,
          maxYears: null,
        },
      ],
    });
    expect(summarizeRequirements(old)).toMatchObject({
      experience: '未注明',
      experienceEstimated: false,
    });
    expect(renderRequirements(old).querySelector('.experience-estimate-tag')).toBeNull();
  });

  it.each([
    ['zero_to_one', 0, 1, '0–1 年'],
    ['one_to_three', 1, 3, '1–3 年'],
    ['three_to_five', 3, 5, '3–5 年'],
    ['five_to_eight', 5, 8, '5–8 年'],
    ['eight_plus', 8, null, '8+ 年'],
  ] as const)(
    'shows the %s estimate with only a separate AI label',
    (band, minYears, maxYears, label) => {
      const evidence = skill(
        'Build and maintain application services with the engineering team.',
      ).evidence;
      const source = requirements({
        experienceEstimate: { band, minYears, maxYears, confidence: 0.7, evidence: [evidence] },
      });
      expect(summarizeRequirements(source)).toMatchObject({
        experience: label,
        experienceEstimated: true,
      });
      const main = renderRequirements(source);
      const row = main.querySelector('.experience-line')!;
      expect(row.querySelector('strong')?.textContent).toBe(label);
      expect(row.querySelectorAll('.experience-estimate-tag')).toHaveLength(1);
      expect(row.querySelector('span.experience-estimate-tag')?.textContent).toBe('AI 预估');
      expect(main.textContent).not.toContain('不是雇主明确要求');
      expect(main.textContent).not.toContain(evidence.text);
      expect(main.textContent).not.toContain('经验预估依据');
      expect(source.experienceEstimate!.evidence).toEqual([evidence]);
    },
  );

  it('always prefers explicit numeric experience, including preferred years, over an estimate', () => {
    const source = requirements({
      experience: [
        {
          ...skill('Five years of experience is preferred.', 'preferred'),
          minYears: 5,
          maxYears: 5,
        },
      ],
      experienceEstimate: {
        band: 'one_to_three',
        minYears: 1,
        maxYears: 3,
        confidence: 0.9,
        evidence: [skill('Build application services.').evidence],
      },
    });
    expect(summarizeRequirements(source)).toMatchObject({
      experience: '5 年（加分）',
      experienceEstimated: false,
    });
    expect(renderRequirements(source).querySelector('.experience-estimate-tag')).toBeNull();
  });

  it('deduplicates explicit years in one line and preserves preferred versus required labels', () => {
    const result = summarizeRequirements(
      requirements({
        experience: [
          { ...skill('At least 3 years of experience.'), minYears: 3, maxYears: null },
          { ...skill('3+ years of development experience.'), minYears: 3, maxYears: null },
          { ...skill('Experience working with APIs.'), minYears: null, maxYears: null },
          { ...skill('5 years of experience preferred.', 'preferred'), minYears: 5, maxYears: 5 },
        ],
      }),
    );
    expect(result.experience).toBe('3+ years of development experience / 5 年（加分）');
    expect(result.groups).toEqual([]);
    expect(
      summarizeRequirements(
        requirements({
          experience: [{ ...skill('Has experience with APIs.'), minYears: null, maxYears: null }],
        }),
      ).experience,
    ).toBe('未注明');
  });

  it('separates technical tools from communication without inventing a stack', () => {
    const result = summarizeRequirements(
      requirements({
        skills: [
          skill('Excellent communication skills are required.'),
          skill(
            'Experience with TypeScript, React, Node.js, Python, PostgreSQL, AWS, Git and AI tools.',
          ),
        ],
      }),
    );
    expect(result.groups.map(({ category, skills }) => ({ category, skills }))).toEqual([
      {
        category: 'skills',
        skills: [
          'TypeScript',
          'React',
          'Node.js',
          'Python',
          'PostgreSQL',
          'AWS',
          'Git',
          'AI tools',
        ],
      },
      { category: 'personal', skills: ['Communication'] },
    ]);
    expect(JSON.stringify(result)).not.toContain('JavaScript');
    expect(JSON.stringify(result)).not.toContain('Kubernetes');
    expect(result.groups[0]!.skills).not.toContain('SQL');
  });

  it('keeps punctuation and versions in C#, .NET and SQL labels', () => {
    expect(
      summarizeRequirements(
        requirements({ skills: [skill('C#/.NET8+/SQL skills are essential.')] }),
      ).groups[0]!.skills,
    ).toEqual(['C#/.NET8+/SQL skills']);
  });

  it('makes generic labels and a short literal fallback without inventing a stack', () => {
    const result = summarizeRequirements(
      requirements({
        skills: [
          skill('Has experience with APIs, databases and integrations.'),
          skill('Has experience with complex enterprise workflows.', 'unclear'),
        ],
      }),
    );
    expect(result.groups).toMatchObject([
      {
        category: 'skills',
        level: 'required',
        label: '必需',
        skills: ['APIs', 'databases', 'integrations'],
      },
      {
        category: 'skills',
        level: 'unclear',
        label: '其他',
        skills: ['complex enterprise workflows'],
      },
    ]);
  });

  it('repairs only exactly adjoining old Node.js and .NET fragments while preserving every original', () => {
    const nodePrefix = 'Has experience with Node.';
    const netPrefix = 'C# and .';
    const source = requirements({
      skills: [
        skill(nodePrefix, 'required', 0),
        skill('js and PostgreSQL.', 'required', nodePrefix.length),
        skill(netPrefix, 'preferred', 100),
        skill('NET8+ and SQL Server.', 'preferred', 100 + netPrefix.length),
      ],
    });
    const snapshot = JSON.stringify(source);
    const result = summarizeRequirements(source);
    expect(result.groups[0]!.skills).toEqual(['Node.js', 'PostgreSQL']);
    expect(result.groups[1]!.skills).toEqual(['C#', '.NET8+', 'SQL Server']);
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('does not join unrelated fragments or convert negative wording to a positive named skill', () => {
    const result = summarizeRequirements(
      requirements({
        skills: [
          skill('Experience with Node.', 'required', 0),
          skill('js experience.', 'required', 100),
          skill('No AWS experience is required.'),
        ],
      }),
    );
    expect(result.groups[0]!.skills).not.toContain('Node.js');
    expect(result.groups[0]!.skills).not.toContain('AWS');
    expect(result.groups[0]!.skills.some((value) => value.startsWith('No AWS'))).toBe(true);
  });

  it('groups explicit alternatives and avoids repeating a pure years statement as a skill', () => {
    const years = skill('At least 3 years of experience.');
    const result = summarizeRequirements(
      requirements({
        skills: [
          skill('Experience with React or Angular.'),
          skill('GitHub Copilot, ChatGPT or similar tools are preferred.', 'preferred'),
          years,
        ],
        experience: [{ ...years, minYears: 3, maxYears: null }],
      }),
    );
    expect(result.groups[0]!.skills).toEqual(['React or Angular']);
    expect(result.groups[1]!.skills).toEqual(['GitHub Copilot, ChatGPT or similar tools']);
    expect(result.experience).toBe('至少 3 年');
  });

  it('keeps Claude Code, Cursor and Codex as alternative examples of AI coding tools', () => {
    const text =
      'Has experience with AI coding tools (e.g. Claude Code, Cursor, Codex, or similar tools)';
    const source = requirements({ skills: [skill(text)] });
    const summary = summarizeRequirements(source);
    expect(summary.groups).toMatchObject([
      {
        level: 'required',
        category: 'skills',
        label: '必需',
        skills: ['AI coding tools'],
      },
    ]);
    // The source requires experience with this kind of tool, not all three brands.
    expect(summary.groups[0]!.skills).not.toContain('Claude Code');
    expect(summary.groups[0]!.skills).not.toContain('Cursor');
    expect(summary.groups[0]!.skills).not.toContain('Codex');
    expect(source.skills[0]!.evidence.text).toBe(text);
  });

  it.each([
    [
      'nursing',
      [
        'Current Nursing Council registration and a valid Annual Practising Certificate are required.',
        'Experience with medication administration, infection prevention and AWS.',
      ],
      [
        'Current Nursing Council registration and a valid Annual Practising Certificate',
        'medication administration',
        'infection prevention',
        'AWS',
      ],
    ],
    [
      'trades',
      [
        'A Level 4 electrical qualification or overseas equivalent is required.',
        'Current EWRB registration and a valid practising licence are essential.',
      ],
      [
        'A Level 4 electrical qualification or overseas equivalent',
        'Current EWRB registration and a valid practising licence',
      ],
    ],
    [
      'teaching',
      [
        'Current Teaching Council registration and a full practising certificate are essential.',
        'Ability to support learners with additional needs (including autism and dyslexia).',
      ],
      [
        'Current Teaching Council registration and a full practising certificate',
        'support learners with additional needs (including autism and dyslexia)',
      ],
    ],
    [
      'logistics',
      [
        'A valid Class 2 or 4 driver licence is required.',
        'Current forklift, first aid and dangerous goods certificates are essential.',
      ],
      [
        'A valid Class 2 or 4 driver licence',
        'Current forklift, first aid and dangerous goods certificates',
      ],
    ],
    [
      'hospitality',
      ['Food safety certification; allergen management; barista experience.'],
      ['Food safety certification', 'allergen management', 'barista experience'],
    ],
    [
      'finance',
      ['CA or CPA qualification (or equivalent); financial reporting and Xero experience.'],
      ['CA or CPA qualification (or equivalent); financial reporting and Xero experience'],
    ],
    [
      'customer service',
      ['Excellent communication skills; experience with complaints resolution; cash handling.'],
      ['Communication', 'complaints resolution', 'cash handling'],
    ],
    [
      'mixed IT and non-IT',
      ['Experience with AWS, clinical assessment and current nursing registration.'],
      ['AWS', 'clinical assessment', 'current nursing registration'],
    ],
  ])('preserves all %s qualifications and abilities', (_industry, statements, expected) => {
    const source = requirements({ skills: statements.map((text) => skill(text)) });
    const unchanged = JSON.stringify(source);
    expect(
      summarizeRequirements(source)
        .groups.flatMap((group) => group.skills)
        .sort(),
    ).toEqual([...expected].sort());
    expect(JSON.stringify(source)).toBe(unchanged);
  });

  it('retains long qualifiers, negation and shared examples without truncating them', () => {
    const statements = [
      'No prior customer service or AWS experience is required.',
      'Current nursing registration is required, but AWS experience is not required.',
      'You must have experience supporting people with complex needs in a residential care setting and a current Level 4 Health and Wellbeing certificate.',
      'Current first aid certification (CPR; AED; paediatric first aid) is required.',
    ];
    const source = requirements({ skills: statements.map((text) => skill(text)) });
    expect(
      summarizeRequirements(source)
        .groups.flatMap((group) => group.skills)
        .sort(),
    ).toEqual(
      [
        'No prior customer service or AWS experience is required',
        'Current nursing registration is required, but AWS experience is not required',
        'experience supporting people with complex needs in a residential care setting and a current Level 4 Health and Wellbeing certificate',
        'Current first aid certification (CPR; AED; paediatric first aid)',
      ].sort(),
    );
  });

  it('preserves compound skills and alternatives instead of inventing independent requirements', () => {
    const source = requirements({
      skills: [
        skill('Knowledge of health and safety.'),
        skill('One of the following: nursing registration; a paramedic qualification.'),
        skill('Experience with Microsoft 365 (Word, Excel and Teams).'),
        skill('A current Class 2, 4 or 5 licence is essential.'),
      ],
    });
    expect(
      summarizeRequirements(source)
        .groups.flatMap((group) => group.skills)
        .sort(),
    ).toEqual(
      [
        'health and safety',
        'One of the following: nursing registration; a paramedic qualification',
        'Microsoft 365 (Word, Excel and Teams)',
        'A current Class 2, 4 or 5 licence',
      ].sort(),
    );
  });

  it('removes only grammatical contrast connectors from independent requirement clauses', () => {
    const source = requirements({
      skills: [
        skill('while forklift certification is preferred.', 'preferred'),
        skill('whereas first aid certification is essential.'),
        skill('but a current practising certificate is required.'),
        skill('While working offshore, a current medical certificate is required.'),
        skill('While on duty a valid licence is required.'),
        skill('but only if working offshore certification is required.'),
      ],
    });
    expect(summarizeRequirements(source).groups).toMatchObject([
      {
        level: 'required',
        category: 'qualifications',
        label: '必需',
        skills: [
          'first aid certification',
          'a current practising certificate',
          'While working offshore, a current medical certificate',
          'While on duty a valid licence',
          'but only if working offshore certification',
        ],
      },
      {
        category: 'qualifications',
        level: 'preferred',
        label: '加分',
        skills: ['forklift certification'],
      },
    ]);
    expect(source.skills[0]!.text).toBe('while forklift certification is preferred.');
  });

  it('does not split shared list qualifiers or ordinary line wrapping', () => {
    const source = requirements({
      skills: [
        skill('Current certificates in: first aid; CPR; ACLS.'),
        skill('A valid practising certificate and\ncurrent Nursing Council registration.'),
        skill('Valid certificates for First Aid; CPR; AED.'),
      ],
    });
    expect(summarizeRequirements(source).groups[0]!.skills).toEqual([
      'Current certificates in: first aid; CPR; ACLS',
      'A valid practising certificate and current Nursing Council registration',
      'Valid certificates for First Aid; CPR; AED',
    ]);
  });

  it('keeps domain context when separate explicit experience requirements use different years', () => {
    const source = requirements({
      experience: [
        { ...skill('At least 5 years of engineering experience.'), minYears: 5, maxYears: null },
        { ...skill('At least 2 years of leadership experience.'), minYears: 2, maxYears: null },
      ],
    });
    expect(summarizeRequirements(source).experience).toBe(
      'At least 5 years of engineering experience / At least 2 years of leadership experience',
    );
  });

  it('does not drop a qualification combined with numeric experience', () => {
    const text = 'At least 3 years of nursing experience and a current practising certificate.';
    const source = requirements({
      skills: [skill(text)],
      experience: [{ ...skill(text), minYears: 3, maxYears: null }],
    });
    expect(summarizeRequirements(source)).toMatchObject({
      experience: '至少 3 年',
      groups: [{ skills: [text.slice(0, -1)] }],
    });
  });

  it('limits the main view with an explicit expansion control and omits redundant evidence paragraphs', () => {
    const source = requirements({
      skills: [
        skill(
          'Experience with TypeScript, React, Node.js, Python, PostgreSQL, AWS, Git, Docker, Kubernetes and Linux.',
        ),
      ],
      truncated: true,
    });
    const main = renderRequirements(source);
    const chips = main.querySelectorAll('.skill-chip');
    expect(chips).toHaveLength(8);
    expect(Array.from(chips, (chip) => chip.textContent)).toEqual([
      'TypeScript',
      'React',
      'Node.js',
      'Python',
      'PostgreSQL',
      'AWS',
      'Git',
      'Docker',
    ]);
    expect(main.querySelector('button[aria-expanded="false"]')?.textContent).toBe('+2 项');
    expect(main.querySelector('details')).toBeNull();
    expect(main.textContent).not.toContain(source.skills[0]!.text);
    expect(main.textContent).not.toContain('部分条目未分析');
    expect(main.textContent).not.toContain('加分技能');
    for (const redundant of [
      '经验原文',
      '技能原文',
      '经验预估依据',
      '部分条目未分析',
      'AI 筛选的 JD 原文',
    ])
      expect(main.textContent).not.toContain(redundant);
    expect(source.truncated).toBe(true);
    expect(source.skills[0]!.evidence.text).toBe(source.skills[0]!.text);
  });
});
