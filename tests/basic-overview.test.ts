import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { buildRequirementCandidates } from '../src/core/requirements';
import { BasicOverview } from '../src/inpage/BasicOverview';
import { t } from '../src/i18n';

const basic = (body: string) => buildRequirementCandidates(body, { explicitOnly: true });

describe('basic overview without an analysis service', () => {
  it('quotes requirement sections and explicit experience with exact source offsets', () => {
    const body =
      'Welcome to our team.\nRequirements:\n- Linux and PostgreSQL\nAt least three years of engineering experience required.\nBenefits:\nWe offer training and 5 weeks annual leave.';
    const result = basic(body);
    expect(result.skills.map((item) => item.text)).toEqual([
      '- Linux and PostgreSQL',
      'At least three years of engineering experience required.',
    ]);
    expect(result.experience).toHaveLength(1);
    for (const item of [...result.skills, ...result.experience])
      expect(body.slice(item.start, item.end)).toBe(item.text);
  });

  it('leaves broad AI candidate retrieval unchanged', () => {
    const body = 'Create new products.\nA friendly workplace.\nPython skills required.';
    expect(buildRequirementCandidates(body).skills).toHaveLength(3);
    expect(basic(body).skills.map((item) => item.text)).toEqual(['Python skills required.']);
  });

  it.each([
    'Our company brings 20 years of experience.',
    'We offer training and a competitive salary.',
    'Benefits:\nTraining and qualifications provided.',
    'About us:\nWe have experience with complex projects.',
    'Build something great with a friendly team.',
  ])('does not promote employer background or benefits to requirements: %s', (body) => {
    expect(basic(body).skills).toEqual([]);
    expect(basic(body).experience).toEqual([]);
  });

  it('preserves negation, alternatives and mixed year scopes as complete quotations', () => {
    const body =
      'No previous experience required.\nA degree or equivalent experience is preferred.\nFive years of experience, including two years leading teams.';
    const html = renderToStaticMarkup(createElement(BasicOverview, { body }));
    expect(html).toContain('No previous experience required.');
    expect(html).toContain('A degree or equivalent experience is preferred.');
    expect(html).toContain('Five years of experience');
    expect(html).toContain('including two years leading teams.');
    expect(html).not.toContain(t('page.aiEstimate'));
  });

  it('deduplicates experience quotations and redacts contacts without inventing confidence', () => {
    const html = renderToStaticMarkup(
      createElement(BasicOverview, {
        body: 'Three years of engineering experience required.\nMust have Python skills; contact hiring@example.org or 021 123 4567.',
      }),
    );
    expect(html.split('Three years of engineering experience required.')).toHaveLength(2);
    expect(html).not.toContain('hiring@example.org');
    expect(html).not.toContain('021 123 4567');
    expect(html).not.toMatch(/confidence|probabilities|AI 推测/);
  });

  it('states extraction limits and keeps additional excerpts accessible', () => {
    const body = Array.from({ length: 30 }, (_, i) => `Skill ${i} required.`).join('\n');
    const html = renderToStaticMarkup(createElement(BasicOverview, { body }));
    expect(basic(body).truncated).toBe(true);
    expect(html).toContain('<details');
    expect(html).toContain('Skill 23 required.');
    expect(html).not.toContain('Skill 24 required.');
    expect(html).toContain(t('page.basicTruncated'));
  });

  it('hides the overview when no requirement excerpts are available', () => {
    const html = renderToStaticMarkup(createElement(BasicOverview, { body: 'Join our team.' }));
    expect(html).toBe('');
  });
});
