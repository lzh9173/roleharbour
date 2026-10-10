import { describe, expect, it } from 'vitest';
import { isTrustedSender } from '../src/core/messages';

describe('trusted extension sender', () => {
  const id = 'abcdefghijklmnopabcdefghijklmnop';
  it('accepts both sidepanel and extension tabs with the exact packaged URL', () => {
    expect(isTrustedSender({ id, url: `chrome-extension://${id}/sidepanel.html` }, id)).toBe(true);
    const sender = { id, url: `chrome-extension://${id}/sidepanel.html`, tab: { id: 10 } };
    expect(isTrustedSender(sender, id)).toBe(true);
  });
  it('rejects content scripts, other extensions and missing sender fields', () => {
    expect(isTrustedSender({ id, url: 'https://nz.seek.com/' }, id)).toBe(false);
    expect(
      isTrustedSender({ id: 'other', url: `chrome-extension://${id}/sidepanel.html` }, id),
    ).toBe(false);
    expect(isTrustedSender({}, id)).toBe(false);
    expect(
      isTrustedSender({ id, url: `chrome-extension://${id}/sidepanel.html?proxy=true` }, id),
    ).toBe(false);
    for (const hash of ['#settings', '#unknown'])
      expect(
        isTrustedSender({ id, url: `chrome-extension://${id}/sidepanel.html${hash}` }, id),
      ).toBe(false);
  });
});
