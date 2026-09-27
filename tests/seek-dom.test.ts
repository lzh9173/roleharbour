import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalSeekJobUrl,
  findSeekCards,
  findSeekDetailAnchor,
  isSeekPublicPage,
  readSeekDetail,
} from '../src/inpage/seek';
import { isSeekPublicSender } from '../src/core/page-messages';

const description =
  'Design and maintain software systems, review application changes and diagnose production incidents with the engineering team.';
function page(html: string, url = 'https://nz.seek.com/developer-jobs'): Document {
  return new JSDOM(html, { url }).window.document;
}
function detail(id = '12345678', body = description): string {
  return `<main><section data-testid="job-detail" data-job-id="${id}">
    <h1 data-automation="job-detail-title">Software Engineer</h1>
    <span data-automation="advertiser-name">Example Employer</span>
    <span data-automation="job-detail-location">Auckland</span>
    <div data-automation="jobAdDetails"><p>${body}</p></div>
    <a data-automation="job-detail-apply" href="/job/${id}/apply">Apply</a>
  </section></main>`;
}

describe('public NZ SEEK job URL identity', () => {
  it('uses the same public browsing allowlist as the background sender gate', () => {
    for (const [path, allowed] of [
      ['/', true],
      ['/jobs', true],
      ['/developer-jobs/in-All-Auckland', true],
      ['/job/123', true],
      ['/profile', false],
      ['/my-activity', false],
      ['/saved-jobs', false],
      ['/my-jobs', false],
      ['/recommended-jobs', false],
      ['/job/123/apply', false],
      ['/apply/123', false],
      ['/recruiter', false],
      ['/profile?selectedjob=123', false],
    ] as const) {
      const url = `https://nz.seek.com${path}`;
      expect(isSeekPublicPage(url)).toBe(allowed);
      expect(isSeekPublicPage(url)).toBe(
        isSeekPublicSender(
          { id: 'extension', url, origin: 'https://nz.seek.com', frameId: 0, tab: { id: 1 } },
          'extension',
        ),
      );
    }
    expect(isSeekPublicPage('https://www.seek.com.au/jobs')).toBe(false);
    expect(isSeekPublicPage('http://nz.seek.com/jobs')).toBe(false);
  });

  it('accepts only the two NZ HTTPS hosts and strips tracking', () => {
    expect(canonicalSeekJobUrl('/job/12345678?ref=test#detail', 'https://nz.seek.com/jobs')).toBe(
      'https://nz.seek.com/job/12345678',
    );
    expect(canonicalSeekJobUrl('https://www.seek.co.nz/job/12345678/')).toBe(
      'https://nz.seek.com/job/12345678',
    );
    for (const url of [
      'http://nz.seek.com/job/1',
      'https://www.seek.com.au/job/1',
      'https://nz.seek.com.evil.test/job/1',
      'https://user@nz.seek.com/job/1',
      'https://nz.seek.com:8443/job/1',
      'https://nz.seek.com/job/not-a-number',
      'https://nz.seek.com/job/1/apply',
      'https://nz.seek.com/job/123456789012345678901',
      'javascript:alert(1)',
    ]) {
      expect(canonicalSeekJobUrl(url)).toBeNull();
    }
  });
});

describe('visible SEEK cards', () => {
  it('reads the observed recommended-homepage overlay variant', () => {
    const doc = page(
      `<ul data-automation="feedJobs"><li><div><div id="actual-card">
      <a data-automation="recommendedJobLink_0" aria-label="Platform Engineer" href="/job/12340001?ref=home"></a>
      <div><h3><span data-automation="jobTitle">Platform Engineer</span></h3><span data-automation="jobAdvertiser">Example Ltd</span><span>Auckland</span></div>
    </div></div></li></ul>`,
      'https://nz.seek.com/',
    );
    const cards = findSeekCards(doc);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      jobId: '12340001',
      url: 'https://nz.seek.com/job/12340001',
      title: 'Platform Engineer',
      employer: 'Example Ltd',
      location: '',
    });
    expect(cards[0]?.element.id).toBe('actual-card');
  });

  it('binds title, employer and location to each card and deduplicates links', () => {
    const doc =
      page(`<article data-testid="job-card"><h3><a data-automation="jobTitle" href="/job/11">Developer</a></h3><a data-automation="jobTitle" href="/job/11?ref=again">Developer</a><span data-automation="jobCompany">First Ltd</span><span data-automation="jobLocation">Auckland</span></article>
      <article><h2><a href="/job/22">Tester</a></h2><span data-automation="jobAdvertiser">Second Ltd</span></article>`);
    expect(
      findSeekCards(doc).map(({ jobId, title, employer, location }) => ({
        jobId,
        title,
        employer,
        location,
      })),
    ).toEqual([
      { jobId: '11', title: 'Developer', employer: 'First Ltd', location: 'Auckland' },
      { jobId: '22', title: 'Tester', employer: 'Second Ltd', location: '' },
    ]);
  });

  it('does not assign nested job links to outer cards or guess among different IDs', () => {
    const doc =
      page(`<article data-testid="job-card"><span data-automation="jobCompany">Wrong outer employer</span><article data-testid="job-card"><h3><a href="/job/33">Correct Engineer</a></h3><span data-automation="jobCompany">Actual Employer</span></article></article>
      <article data-testid="job-card"><h3><a href="/job/44">One</a><a href="/job/55">Another</a></h3></article>`);
    const cards = findSeekCards(doc);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ jobId: '33', employer: 'Actual Employer' });
  });

  it('ignores hidden, injected and foreign-host cards', () => {
    const card =
      '<article data-testid="job-card"><h3><a href="/job/11">Developer</a></h3></article>';
    const doc = page(
      `<div hidden>${card}</div><div style="display:none">${card}</div><div aria-hidden="true">${card}</div><div data-seek-filter>${card}</div><noscript>${card}</noscript><article data-testid="job-card"><h3><a href="https://www.seek.com.au/job/22">Australian role</a></h3></article>`,
    );
    expect(findSeekCards(doc)).toEqual([]);
    expect(findSeekCards(page(card, 'https://example.com/'))).toEqual([]);
  });
});

describe('identity-bound rendered detail extraction', () => {
  it('extracts visible text and leaves salary unknown, with canonical source URL', () => {
    const doc = page(
      detail(
        '12345678',
        `${description}<span hidden>hidden text</span><span data-seek-filter>extension output</span><script type="application/json">{"salary":"999999"}</script>`,
      ),
      'https://www.seek.co.nz/job/12345678?ref=source',
    );
    expect(readSeekDetail(doc, '12345678')).toMatchObject({
      title: 'Software Engineer',
      employer: 'Example Employer',
      location: 'Auckland',
      body: description,
      sourceUrl: 'https://nz.seek.com/job/12345678',
      retainBody: false,
      salary: { min: null, max: null, currency: 'NZD', period: 'annual', hoursPerWeek: null },
    });
  });

  it('keeps related-card employer and location metadata out of the selected job', () => {
    const html = detail()
      .replace('<span data-automation="advertiser-name">Example Employer</span>', '')
      .replace('<span data-automation="job-detail-location">Auckland</span>', '')
      .replace(
        '</section>',
        `<article data-testid="job-card"><h3><a href="/job/999">Related role</a></h3><span data-automation="jobCompany">Other Employer</span><span data-automation="jobLocation">Wellington</span></article></section>`,
      );
    expect(readSeekDetail(page(html, 'https://nz.seek.com/job/12345678'))).toMatchObject({
      title: 'Software Engineer',
      employer: '',
      location: '',
      sourceUrl: 'https://nz.seek.com/job/12345678',
    });
  });

  it('requires the selectedjob URL and independently identified panel to agree', () => {
    expect(
      readSeekDetail(
        page(detail('12345678'), 'https://nz.seek.com/jobs?selectedjob=12345678'),
        '12345678',
      ),
    ).not.toBeNull();
    expect(
      readSeekDetail(
        page(detail('12345678'), 'https://nz.seek.com/jobs?selectedjob=87654321'),
        '87654321',
      ),
    ).toBeNull();
    expect(
      readSeekDetail(page(detail('12345678'), 'https://nz.seek.com/job/12345678'), '87654321'),
    ).toBeNull();
    expect(
      readSeekDetail(
        page(detail('12345678'), 'https://nz.seek.com/job/12345678?selectedjob=87654321'),
      ),
    ).toBeNull();
  });

  it('binds the observed jobId search parameter and rejects conflicting or malformed selections', () => {
    const html = detail('12340003');
    for (const url of [
      'https://nz.seek.com/jobs?jobId=12340003&type=promoted',
      'https://nz.seek.com/jobs?selectedjob=12340003&jobId=12340003',
      'https://nz.seek.com/job/12340003?jobId=12340003',
    ]) {
      expect(readSeekDetail(page(html, url), '12340003')?.sourceUrl).toBe(
        'https://nz.seek.com/job/12340003',
      );
    }
    for (const url of [
      'https://nz.seek.com/jobs?jobId=12340003&jobId=12340003',
      'https://nz.seek.com/jobs?jobId=12340003&jobId=1',
      'https://nz.seek.com/jobs?selectedjob=1&jobId=12340003',
      'https://nz.seek.com/jobs?selectedjob=12340003&selectedjob=12340003&jobId=12340003',
      'https://nz.seek.com/jobs?jobId=',
      'https://nz.seek.com/jobs?jobId=invalid',
      'https://nz.seek.com/jobs?selectedjob=12340003&jobId=invalid',
      'https://nz.seek.com/jobs?jobId=123456789012345678901',
      'https://nz.seek.com/job/1?jobId=12340003',
    ]) {
      expect(readSeekDetail(page(html, url))).toBeNull();
      expect(findSeekDetailAnchor(page(html, url))).toBeNull();
    }
    expect(readSeekDetail(page(detail('1'), 'https://nz.seek.com/jobs?jobId=12340003'))).toBeNull();
  });

  it('does not infer selection from a card or an unbound split-view body', () => {
    const unbound = `<main><h1 data-automation="job-detail-title">Software Engineer</h1><div data-automation="jobAdDetails">${description}</div></main>`;
    expect(
      readSeekDetail(page(unbound, 'https://nz.seek.com/jobs?selectedjob=12345678')),
    ).toBeNull();
    expect(readSeekDetail(page(detail()))).toBeNull();
    expect(
      readSeekDetail(
        page(
          `<article data-testid="job-card"><h1>Role</h1><div data-automation="jobAdDetails">${description}</div></article>`,
          'https://nz.seek.com/job/12345678',
        ),
      ),
    ).toBeNull();
  });

  it('rejects incomplete, oversized, duplicate or hidden descriptions without truncation', () => {
    for (const html of [
      detail('12345678', 'Short summary'),
      detail('12345678', 'a'.repeat(24001)),
      `${detail()}${detail()}`,
      `<div hidden>${detail()}</div>`,
      `<div data-seek-filter>${detail()}</div>`,
    ]) {
      expect(readSeekDetail(page(html, 'https://nz.seek.com/job/12345678'))).toBeNull();
    }
  });

  it('uses an apply link to identify a selected detail without data-job-id', () => {
    const html = detail().replace(' data-job-id="12345678"', '');
    expect(readSeekDetail(page(html, 'https://nz.seek.com/jobs?selectedjob=12345678'))?.title).toBe(
      'Software Engineer',
    );
  });

  it('requires independent panel identity even on a direct job URL', () => {
    const html = `<main><h1 data-automation="job-detail-title">Software Engineer</h1><div data-automation="jobAdDetails">${description}</div></main>`;
    expect(readSeekDetail(page(html, 'https://nz.seek.com/job/12345678'))).toBeNull();
    const linked = html.replace(
      '</main>',
      '<a data-automation="job-detail-apply" href="/job/12345678/apply">Apply</a></main>',
    );
    expect(readSeekDetail(page(linked, 'https://nz.seek.com/job/12345678'))?.sourceUrl).toBe(
      'https://nz.seek.com/job/12345678',
    );
    expect(readSeekDetail(page(detail('87654321'), 'https://nz.seek.com/job/12345678'))).toBeNull();
    expect(
      readSeekDetail(
        page(detail(), 'https://nz.seek.com/jobs?selectedjob=12345678&selectedjob=12345678'),
      ),
    ).toBeNull();
  });

  it('stops extraction and mounting on account or application pages after SPA navigation', () => {
    const doc = page(
      `<article data-testid="job-card"><h3><a href="/job/12345678">Software Engineer</a></h3></article>${detail()}`,
      'https://nz.seek.com/job/12345678',
    );
    expect(findSeekCards(doc)).toHaveLength(1);
    expect(findSeekDetailAnchor(doc)).not.toBeNull();
    for (const path of [
      '/profile',
      '/my-activity',
      '/job/12345678/apply',
      '/recruiter',
      '/saved-jobs?selectedjob=12345678',
    ]) {
      doc.defaultView!.history.pushState({}, '', path);
      expect(findSeekCards(doc)).toEqual([]);
      expect(findSeekDetailAnchor(doc)).toBeNull();
      expect(readSeekDetail(doc)).toBeNull();
    }
  });

  it('checks each element style once per scan and rechecks visibility on later scans', () => {
    const doc = page(detail(), 'https://nz.seek.com/job/12345678');
    const style = vi.spyOn(doc.defaultView!, 'getComputedStyle');
    expect(readSeekDetail(doc)).not.toBeNull();
    const calls = new Map<Element, number>();
    for (const [element] of style.mock.calls) calls.set(element, (calls.get(element) ?? 0) + 1);
    expect([...calls.values()].every((count) => count === 1)).toBe(true);
    const panel = doc.querySelector<HTMLElement>('[data-testid="job-detail"]')!;
    panel.style.display = 'none';
    expect(readSeekDetail(doc)).toBeNull();
    panel.style.display = 'block';
    expect(readSeekDetail(doc)).not.toBeNull();
  });

  it('binds the observed homepage modal through matching title and apply links', () => {
    const doc = page(
      `<div role="dialog"><section><h1 data-automation="job-detail-title"><a href="/job/12340001?ref=home">Platform Engineer</a></h1><span data-automation="advertiser-name">Example Ltd</span><span data-automation="job-detail-location">Auckland</span><a data-automation="job-detail-apply" href="/job/12340001/apply">Apply</a><div><div data-automation="jobAdDetails">${description}</div></div><div data-automation="company-profile">Company information must not enter the JD.</div></section></div>`,
      'https://nz.seek.com/',
    );
    expect(readSeekDetail(doc, '12340001')).toMatchObject({
      title: 'Platform Engineer',
      body: description,
      sourceUrl: 'https://nz.seek.com/job/12340001',
    });
    expect(findSeekDetailAnchor(doc)?.getAttribute('data-automation')).toBe('jobAdDetails');
    expect(readSeekDetail(doc, '12340002')).toBeNull();
  });

  it('rejects modal identity mismatch, incomplete identity and multiple visible job dialogs', () => {
    const modal = (applyId = '11') =>
      `<div role="dialog"><h1 data-automation="job-detail-title"><a href="/job/11">Platform Engineer</a></h1><a data-automation="job-detail-apply" href="/job/${applyId}/apply">Apply</a><div data-automation="jobAdDetails">${description}</div></div>`;
    expect(readSeekDetail(page(modal('22'), 'https://nz.seek.com/'))).toBeNull();
    expect(
      readSeekDetail(
        page(modal().replace('data-automation="job-detail-apply"', ''), 'https://nz.seek.com/'),
      ),
    ).toBeNull();
    expect(readSeekDetail(page(modal() + modal(), 'https://nz.seek.com/'))).toBeNull();
    expect(
      readSeekDetail(page(`<div hidden>${modal('22')}</div>${modal()}`, 'https://nz.seek.com/'))
        ?.sourceUrl,
    ).toBe('https://nz.seek.com/job/11');
  });
});
