// Render the Chrome Web Store screenshots and promo tiles from their HTML sources.
// Usage: pnpm site:build && node brand/scripts/render-store.mjs
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { launchChrome } from '../../promo/lib/chrome.mjs';
import { serveDirectory } from '../../promo/lib/serve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// The screenshots picture the promotional site's demo, so it must be built first.
if (!existsSync(`${root}output/site/index.html`))
  throw new Error('output/site is missing; run pnpm site:build first');

const server = await serveDirectory(root);
const chrome = await launchChrome({ width: 1400, height: 900 });

/** The store wants JPEG or 24-bit PNG: drop any alpha channel. */
async function save(png, out) {
  const info = await sharp(png).removeAlpha().png().toFile(out);
  console.log(`${out} ${info.width}x${info.height}`);
}

async function capture(page, element, out) {
  const box = await page.evaluate(
    `(() => { const r = document.getElementById('${element}').getBoundingClientRect();
      return { x: r.x, y: r.y, width: Math.round(r.width), height: Math.round(r.height) }; })()`,
  );
  await save(await page.screenshot({ clip: box }), out);
}

try {
  for (const shot of [1, 2, 3, 4]) {
    const page = await chrome.open(`${server.url}brand/store/screenshot.html?shot=${shot}`, {
      width: 1280,
      height: 800,
    });
    await page.evaluate('window.shotReady');
    await capture(page, 'shot', `brand/store/screenshot-${shot}.png`);
    await page.close();
  }
  const tiles = await chrome.open(`${server.url}brand/store/tiles.html`, {
    width: 1400,
    height: 900,
  });
  await tiles.evaluate('window.fontsReady');
  await capture(tiles, 'small', 'brand/store/tile-small.png');
  await capture(tiles, 'marquee', 'brand/store/tile-marquee.png');
} finally {
  await chrome.close();
  await server.close();
}
