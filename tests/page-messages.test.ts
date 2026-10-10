import { describe, expect, it } from 'vitest';
import { canonicalSeekJobUrl, getSeekJobId } from '../src/core/seek-url';
import {
  isSeekPublicSender,
  isSeekPageSender,
  pageMessageSchema,
  type PageSender,
} from '../src/core/page-messages';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const requestId = '118a5967-d0b1-42c2-bf6b-0cc001f02a14';
const sender: PageSender = {
  id: extensionId,
  url: 'https://nz.seek.com/job/12345678',
  origin: 'https://nz.seek.com',
  frameId: 0,
  tab: { id: 10 },
  documentId: 'doc-a',
};
const title = 'Systems Administrator';
const body =
  'Maintain production Linux systems and automate deployment processes for internal teams.';
const local = { type: 'page:local', title, body };
const draft = {
  title,
  body,
  employer: '',
  location: '',
  sourceUrl: 'https://nz.seek.com/job/12345678',
};

describe('SEEK page message boundary', () => {
  it.each(['page:employer-online', 'page:employer-cache', 'employers:refresh'])(
    'rejects retired or privileged employer action %s from a content page',
    (type) => {
      expect(pageMessageSchema.safeParse({ type, name: 'Synthetic Employer' }).success).toBe(false);
      expect(pageMessageSchema.safeParse({ type }).success).toBe(false);
    },
  );

  it('accepts only the four finite content message schemas', () => {
    for (const valid of [
      { type: 'page:language' },
      { type: 'page:open-settings' },
      { type: 'page:employers', names: ['Acme Limited', 'QX'] },
      { type: 'page:employers', names: [] },
      local,
    ])
      expect(pageMessageSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...local, apiKey: 'secret' },
      { ...local, sourceUrl: draft.sourceUrl },
      { ...local, employer: 'Synthetic Employer' },
      { ...local, endpoint: 'https://evil.example/' },
      { ...local, title: 'N' },
      { ...local, body: 'Too short to read.' },
      { ...local, body: 'a'.repeat(24001) },
      { type: 'page:local', title },
      { type: 'page:local', body },
      { type: 'read-key' },
      { type: 'export-library' },
      { type: 'page:language', preference: 'en' },
      { type: 'page:open-workspace' },
      { type: 'page:open-settings', url: 'https://evil.example/' },
      { type: 'page:open-settings', section: 'settings' },
      { type: 'page:open-settings', section: 'https://evil.example/' },
      { type: 'page:employers', names: ['Acme Limited'], force: true },
      { type: 'page:employers', names: ['Q'] },
      { type: 'page:sample-status', sourceUrl: 'https://nz.seek.com/job/1' },
      { type: 'page:employers', names: Array.from({ length: 21 }, (_, i) => `Employer ${i}`) },
    ])
      expect(pageMessageSchema.safeParse(invalid).success).toBe(false);
  });

  it('reads job links up to 20 digits and nothing longer', () => {
    const longest = `https://nz.seek.com/job/${'9'.repeat(20)}`;
    expect(canonicalSeekJobUrl(longest)).toBe(longest);
    expect(canonicalSeekJobUrl(`https://nz.seek.com/job/${'9'.repeat(21)}`)).toBeNull();
  });

  it.each([
    { type: 'page:analyze', requestId, draft, mode: 'jev', surface: 'page' },
    { type: 'page:analyze', requestId, draft, mode: 'jev', surface: 'dialog', automatic: true },
    { type: 'page:cancel', requestId },
    { type: 'page:preferences' },
    { type: 'page:auto', enabled: true },
    { type: 'page:auto', enabled: true, provider: 'jev' },
    { type: 'page:analysis-retry', requestId, attempt: 1 },
    { type: 'analyze', requestId, draft, mode: 'jev' },
  ])('rejects the removed AI analysis message %j', (input) => {
    expect(pageMessageSchema.safeParse(input).success).toBe(false);
  });

  it('requires the same extension, top frame, tab and exact allowed HTTPS hosts', () => {
    expect(isSeekPageSender(sender, extensionId)).toBe(true);
    expect(
      isSeekPageSender(
        { ...sender, url: 'https://www.seek.co.nz/job/12345678', origin: 'https://www.seek.co.nz' },
        extensionId,
      ),
    ).toBe(true);
    for (const invalid of [
      { ...sender, id: 'another-extension' },
      { ...sender, frameId: 1 },
      { ...sender, frameId: undefined },
      { ...sender, tab: undefined },
      { ...sender, tab: { id: -1 } },
      { ...sender, tab: { id: 0.5 } },
      { ...sender, url: 'http://nz.seek.com/job/12345678' },
      { ...sender, url: 'https://nz.seek.com.evil.example/job/12345678' },
      { ...sender, url: 'https://seek.com/job/12345678' },
      { ...sender, url: 'https://user@nz.seek.com/job/12345678' },
      { ...sender, url: 'https://nz.seek.com:444/job/12345678' },
      { ...sender, origin: 'null' },
      { ...sender, origin: 'https://evil.example' },
    ])
      expect(isSeekPageSender(invalid, extensionId)).toBe(false);
  });

  it('extracts an unambiguous job identity and rejects summary-only URLs', () => {
    expect(getSeekJobId('https://nz.seek.com/job/12345678?tracking=1')).toBe('12345678');
    expect(getSeekJobId('https://nz.seek.com/devops-jobs?selectedjob=12345678')).toBe('12345678');
    expect(getSeekJobId('https://nz.seek.com/job/12345678?selectedjob=12345678')).toBe('12345678');
    for (const url of [
      'https://nz.seek.com/devops-jobs',
      'https://nz.seek.com/',
      'https://nz.seek.com/devops-jobs?selectedjob=oops',
      'https://nz.seek.com/devops-jobs?selectedjob=12345678&selectedjob=12345678',
      'https://nz.seek.com/job/12345678?selectedjob=87654321',
      'https://evil.example/job/12345678',
    ])
      expect(getSeekJobId(url)).toBeNull();
  });

  it('accepts jobId search details only when every supplied identity agrees', () => {
    for (const url of [
      'https://nz.seek.com/jobs?jobId=12345678&type=promoted',
      'https://nz.seek.com/devops-jobs?selectedjob=12345678&jobId=12345678',
      'https://nz.seek.com/job/12345678?selectedjob=12345678&jobId=12345678',
    ])
      expect(getSeekJobId(url)).toBe('12345678');
    for (const url of [
      'https://nz.seek.com/jobs?jobId=12345678&jobId=12345678',
      'https://nz.seek.com/jobs?jobId=12345678&jobId=87654321',
      'https://nz.seek.com/jobs?selectedjob=87654321&jobId=12345678',
      'https://nz.seek.com/job/87654321?jobId=12345678',
      'https://nz.seek.com/job/invalid?jobId=12345678',
      'https://nz.seek.com/jobs?jobId=',
      'https://nz.seek.com/jobs?jobId=123abc',
    ])
      expect(getSeekJobId(url)).toBeNull();
  });

  it('accepts only public job browsing surfaces', () => {
    for (const url of [
      'https://nz.seek.com/',
      'https://nz.seek.com/job/123',
      'https://nz.seek.com/devops-jobs/in-All-Auckland',
      'https://nz.seek.com/jobs',
    ]) {
      expect(isSeekPublicSender({ ...sender, url }, extensionId)).toBe(true);
    }
    for (const path of [
      '/profile',
      '/account',
      '/saved-jobs',
      '/my-jobs',
      '/candidate/profile',
      '/job-application/123',
    ]) {
      expect(
        isSeekPublicSender({ ...sender, url: `https://nz.seek.com${path}` }, extensionId),
      ).toBe(false);
    }
  });
});
