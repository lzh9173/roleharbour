import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobRequirements, RequirementLevel, SkillRequirement } from '../src/core/requirements';
import { RequirementsView } from '../src/ui/RequirementsView';
import { summarizeRequirements } from '../src/ui/requirement-summary';
import { employerLabel } from '../src/inpage/EmployerBadge';

function skill(text: string, level: RequirementLevel = 'required'): SkillRequirement {
  return {
    text,
    level,
    confidence: 0.9,
    evidence: { id: 'source-0', text, start: 0, end: text.length },
  };
}

function requirements(overrides: Partial<JobRequirements> = {}): JobRequirements {
  return { skills: [], experience: [], truncated: false, ...overrides };
}

describe('browser language in job requirements', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'en-NZ' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['zh-CN', ['技能与工具', '学历与资质', '个人与协作能力'], ['必需', '加分', '必需']],
    [
      'en',
      ['Skills & tools', 'Qualifications & licences', 'Personal & teamwork skills'],
      ['Required', 'Preferred', 'Required'],
    ],
    ['zh-TW', ['技能與工具', '學歷與資格', '個人與協作能力'], ['必需', '加分', '必需']],
    ['ja', ['スキルとツール', '学歴・資格', '個人スキルとチームワーク'], ['必須', '歓迎', '必須']],
    ['ko', ['기술 및 도구', '학력 및 자격', '개인 역량 및 협업'], ['필수', '우대', '필수']],
  ] as const)('localizes all tag categories and levels in %s', (locale, categories, levels) => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => locale } });
    const source = requirements({
      skills: [
        skill('Git is required.'),
        skill('A valid Class 2 driver licence is preferred.', 'preferred'),
        skill('Excellent communication skills.'),
      ],
    });
    const original = JSON.stringify(source);
    const summary = summarizeRequirements(source);
    expect(summary.groups.map((group) => group.categoryLabel)).toEqual(categories);
    expect(summary.groups.map((group) => group.label)).toEqual(levels);
    expect(summary.groups.map((group) => group.skills)).toEqual([
      ['Git'],
      ['A valid Class 2 driver licence'],
      ['Communication'],
    ]);
    expect(JSON.stringify(source)).toBe(original);
  });

  it('translates experience labels while preserving source skills and cached data', () => {
    const source = requirements({
      experience: [
        { ...skill('One year of experience is preferred.', 'preferred'), minYears: 1, maxYears: 1 },
        { ...skill('At least three years of experience.'), minYears: 3, maxYears: null },
      ],
      skills: [skill('Has experience with TypeScript and React.')],
    });
    const unchanged = JSON.stringify(source);
    expect(summarizeRequirements(source)).toMatchObject({
      experience: '1 year (preferred) / At least 3 years',
      experienceEstimated: false,
      groups: [
        {
          category: 'skills',
          categoryLabel: 'Skills & tools',
          level: 'required',
          label: 'Required',
          skills: ['TypeScript', 'React'],
        },
      ],
    });
    expect(JSON.stringify(source)).toBe(unchanged);
    const html = renderToStaticMarkup(createElement(RequirementsView, { requirements: source }));
    expect(html).toContain('Experience');
    expect(html).toContain('Required');
    expect(html).toContain('Skills &amp; tools');
    expect(html).not.toMatch(/经验年限|必需技能/);
  });

  it('keeps AI estimates distinct from stated years in English', () => {
    const source = requirements({
      experienceEstimate: {
        band: 'one_to_three',
        minYears: 1,
        maxYears: 3,
        confidence: 0.8,
        evidence: [skill('Build application services.').evidence],
      },
    });
    const html = renderToStaticMarkup(createElement(RequirementsView, { requirements: source }));
    expect(html).toContain('1–3 years');
    expect(html).toContain('AI estimate');
    expect(summarizeRequirements(requirements()).experience).toBe('Not stated');
  });

  it('uses the current browser language on every summary and employer label call', () => {
    const source = requirements({ skills: [skill('Python is preferred.', 'preferred')] });
    expect(summarizeRequirements(source).groups[0]?.label).toBe('Preferred');
    expect(employerLabel()).toBe('Checking');
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'zh-TW' } });
    expect(summarizeRequirements(source).groups[0]?.label).toBe('加分');
    expect(employerLabel()).toBe('查詢中');
  });

  it.each([
    [null, 1, 'Up to 1 year'],
    [null, 2, 'Up to 2 years'],
    [1, null, 'At least 1 year'],
    [1.5, null, 'At least 18 months'],
    [2, 4, '2–4 years'],
  ])('formats %s to %s years without changing their meaning', (minYears, maxYears, expected) => {
    const source = requirements({
      experience: [{ ...skill('Source experience requirement.'), minYears, maxYears }],
    });
    expect(summarizeRequirements(source).experience).toBe(expected);
  });

  it.each([
    [1 / 12, 1 / 12, '1 month'],
    [1 / 12, null, 'At least 1 month'],
    [null, 1 / 12, 'Up to 1 month'],
    [0.5, null, 'At least 6 months'],
    [null, 0.5, 'Up to 6 months'],
    [1.5, 1.5, '18 months'],
    [0.5, 1.5, '6–18 months'],
    [0.5, 2, '6–24 months'],
    [0.08333333333333334, 1 / 6, '1–2 months'],
    [0.1, null, 'At least 0.1 years'],
    [1, 1, '1 year'],
  ])('renders explicit bounds %s to %s with an accurate unit', (minYears, maxYears, expected) => {
    const source = requirements({
      experience: [{ ...skill('Source experience requirement.'), minYears, maxYears }],
    });
    const unchanged = JSON.stringify(source);
    expect(summarizeRequirements(source).experience).toBe(expected);
    expect(JSON.stringify(source)).toBe(unchanged);
  });

  it.each([
    ['zh-CN', '1 个月', '至少 1 个月', '最多 1 个月', '6–18 个月'],
    ['en', '1 month', 'At least 1 month', 'Up to 1 month', '6–18 months'],
    ['zh-TW', '1 個月', '至少 1 個月', '最多 1 個月', '6–18 個月'],
    ['ja', '1 か月', '1 か月以上', '1 か月以下', '6–18 か月'],
    ['ko', '1개월', '최소 1개월', '최대 1개월', '6–18개월'],
  ])('localizes explicit month requirements in %s', (locale, exact, minimum, maximum, range) => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => locale } });
    const summary = (minYears: number | null, maxYears: number | null) =>
      summarizeRequirements(
        requirements({
          experience: [{ ...skill('Source experience requirement.'), minYears, maxYears }],
        }),
      );
    expect(summary(1 / 12, 1 / 12).experience).toBe(exact);
    expect(summary(1 / 12, null).experience).toBe(minimum);
    expect(summary(null, 1 / 12).experience).toBe(maximum);
    expect(summary(0.5, 1.5).experience).toBe(range);
    expect(summary(0.5, 1.5).experienceEstimated).toBe(false);
  });

  it('keeps explicit month preference separate from an AI year forecast', () => {
    const source = requirements({
      experience: [
        {
          ...skill('One month of experience is preferred.', 'preferred'),
          minYears: 1 / 12,
          maxYears: 1 / 12,
        },
      ],
      experienceEstimate: {
        band: 'one_to_three',
        minYears: 1,
        maxYears: 3,
        confidence: 0.8,
        evidence: [skill('Support the team with customer enquiries.').evidence],
      },
    });
    expect(summarizeRequirements(source)).toMatchObject({
      experience: '1 month (preferred)',
      experienceEstimated: false,
    });
    expect(summarizeRequirements({ ...source, experience: [] })).toMatchObject({
      experience: '1–3 years',
      experienceEstimated: true,
    });
  });
});
