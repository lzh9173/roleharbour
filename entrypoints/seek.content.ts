import { defineContentScript } from 'wxt/utils/define-content-script';
import { SEEK_MATCHES } from '../src/core/seek-url';
import { mountSeekIntegration } from '../src/inpage/mount';

export default defineContentScript({
  matches: SEEK_MATCHES,
  excludeMatches: [
    'https://nz.seek.com/profile/*',
    'https://nz.seek.com/my-activity/*',
    'https://nz.seek.com/job/*/apply*',
    'https://www.seek.co.nz/profile/*',
    'https://www.seek.co.nz/my-activity/*',
    'https://www.seek.co.nz/job/*/apply*',
  ],
  runAt: 'document_idle',
  main(ctx) {
    mountSeekIntegration(ctx);
  },
});
