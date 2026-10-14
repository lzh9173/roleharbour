// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../site/src/App';
import { copy } from '../site/src/copy';
import { adBlocks, job, reading, sourceOf, splitBlock } from '../site/src/demo-data';
import { renderDoc } from '../site/docs';

const sources = [
  ...[reading.visa.sponsorship, reading.visa.workRights, reading.visa.residency].flatMap(
    (decision) => decision.evidence,
  ),
  ...reading.prep.entries.map((entry) => entry.source),
  ...reading.prep.materials.map((material) => material.source),
  ...reading.prep.other,
  ...reading.prep.experience,
];

describe('site demo', () => {
  it('quotes every source sentence from the ad at its offsets, within one block', () => {
    const blocks = adBlocks(job.body);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(job.body.slice(source.start, source.end)).toBe(source.text);
      expect(blocks.some((block) => block.start <= source.start && source.end <= block.end)).toBe(
        true,
      );
    }
  });

  it('reads the ad as headings, list items and paragraphs', () => {
    const blocks = adBlocks(job.body);
    const text = (kind: string) =>
      blocks
        .filter((block) => block.kind === kind)
        .map((block) => job.body.slice(block.start, block.end));
    expect(text('heading')).toEqual([
      "What you'll do",
      "What you'll bring",
      'Nice to have:',
      'Visa',
      'How to apply',
    ]);
    // List items lose their bullet; the page draws its own.
    expect(text('bullet')).toContain('PostgreSQL');
  });

  it('marks only the part of a block inside the highlighted span', () => {
    const block = { start: 0, end: 10 };
    expect(splitBlock('abcdefghij', block, { start: 3, end: 6 })).toEqual([
      { text: 'abc', marked: false },
      { text: 'def', marked: true },
      { text: 'ghij', marked: false },
    ]);
    expect(splitBlock('abcdefghij', block, { start: 12, end: 20 })).toEqual([
      { text: 'abcdefghij', marked: false },
    ]);
  });

  it('finds the sentence behind a chip hint or a material card', () => {
    const skills = reading.prep.entries.find((entry) => entry.terms[0] === 'React')!.source;
    const letter = reading.prep.materials[0]!.source;
    document.body.innerHTML = `<div id="panel">
      <ul><li title="${skills.text}"><button id="chip">React</button></li></ul>
      <ul><li><b>Cover letter</b><span id="card">${letter.text}</span></li></ul>
      <p id="other">Show less</p></div>`;
    const panel = document.getElementById('panel')!;
    expect(sourceOf(document.getElementById('chip')!, panel)).toMatchObject({
      start: skills.start,
      end: skills.end,
    });
    expect(sourceOf(document.getElementById('card')!, panel)).toMatchObject({
      start: letter.start,
    });
    expect(sourceOf(document.getElementById('other')!, panel)).toBeNull();
  });
});

describe('site copy', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('gives the Chinese page the same strings as the English one', () => {
    const shape = (value: unknown, path: string, other: unknown) => {
      if (typeof value === 'string') {
        expect(typeof other, path).toBe('string');
        expect((other as string).trim(), path).not.toBe('');
      } else if (Array.isArray(value)) {
        expect((other as unknown[]).length, path).toBe(value.length);
        value.forEach((item, index) =>
          shape(item, `${path}[${index}]`, (other as unknown[])[index]),
        );
      } else
        for (const [key, item] of Object.entries(value as object))
          shape(item, `${path}.${key}`, (other as Record<string, unknown>)[key]);
    };
    shape(copy.en, 'copy', copy.zh);
  });

  it('switches the page and the demo panel together', () => {
    const english = renderToStaticMarkup(createElement(App));
    expect(english).toContain(copy.en.hero.titleMarked);
    expect(english).toContain('Support mentioned');

    window.history.replaceState(null, '', '/?lang=zh');
    const chinese = renderToStaticMarkup(createElement(App));
    expect(chinese).toContain(copy.zh.hero.titleMarked);
    expect(chinese).toContain('提及支持');
    expect(chinese).not.toContain('Support mentioned');
  });
});

describe('site pages', () => {
  const hrefs = (html: string) =>
    [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]!);

  it('links to its own privacy notice and changelog, and to the source repository', () => {
    const links = hrefs(renderToStaticMarkup(createElement(App)));
    expect(links).toContain('./privacy.html');
    expect(links).toContain('./changelog.html');
    expect(links).toContain('https://github.com/lzh9173/roleharbour');
  });

  it('renders the privacy notice and changelog from the repository', () => {
    const privacy = renderDoc('docs/PRIVACY.md');
    expect(privacy).toContain('<h1>Privacy notice</h1>');
    expect(privacy).toContain('<table>');
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(renderDoc('CHANGELOG.md')).toContain(`<h2>${version}</h2>`);
  });

  it('publishes documents whose links all work outside the repository', () => {
    for (const path of ['docs/PRIVACY.md', 'CHANGELOG.md'])
      for (const link of hrefs(renderDoc(path))) {
        expect(link, path).toMatch(/^https:\/\//);
        expect(link, path).not.toContain('github.com');
      }
  });
});
