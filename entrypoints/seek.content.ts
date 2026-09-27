import { defineContentScript } from 'wxt/utils/define-content-script';
import { mountSeekIntegration } from '../src/inpage/mount';

export default defineContentScript({
  matches: ['https://nz.seek.com/*', 'https://www.seek.co.nz/*'],
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
