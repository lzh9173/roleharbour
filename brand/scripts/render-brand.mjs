// Render the wordmark lockup and the README banner from their HTML sources.
// Usage: node brand/scripts/render-brand.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../../promo/lib/chrome.mjs';
import { serveDirectory } from '../../promo/lib/serve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await serveDirectory(root);
const chrome = await launchChrome({ width: 1280, height: 640 });

async function capture(path, element, scale, out, transparent) {
  const page = await chrome.open(`${server.url}${path}`, { width: 1280, height: 640, scale });
  await page.evaluate('window.fontsReady');
  const box = await page.evaluate(
    `(() => { const r = document.getElementById('${element}').getBoundingClientRect();
      return { x: r.x, y: r.y, width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`,
  );
  await writeFile(out, await page.screenshot({ transparent, clip: box }));
  console.log(`${out} ${box.width * scale}x${box.height * scale}`);
}

try {
  await capture('brand/logo/lockup.html', 'lockup', 1, 'brand/logo/lockup.png', true);
  await capture('brand/logo/lockup.html', 'lockup', 2, 'brand/logo/lockup@2x.png', true);
  await capture('brand/banner.html', 'banner', 1, 'brand/banner.png', false);
} finally {
  await chrome.close();
  await server.close();
}
