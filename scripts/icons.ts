import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Haru's smiling face on a sky tile. See brand/haru/README.md for the artwork.
const face = 'brand/haru/face-smile.png';
const sky = '#CFE8FF';
// Compose large and scale down so the rounded corners are anti-aliased at 16 px.
const canvas = 512;
// Regions of face-smile.png (153 × 220). Large icons show the whole head. Toolbar sizes
// show eyes, fringe and beret inside a sky rim, so the tile edge stays visible on dark
// toolbars and the face does not shrink to a dot.
const head = { left: 0, top: 4, width: 153, height: 153 };
const close = { left: 22, top: 38, width: 110, height: 110 };
const rim = Math.round(canvas * 0.09);

function roundedMask(size: number, radius: number) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`,
  );
}

async function art(small: boolean) {
  if (!small)
    return sharp(face).extract(head).resize(canvas, canvas, { kernel: 'lanczos3' }).toBuffer();
  const inner = canvas - 2 * rim;
  const cropped = await sharp(face)
    .extract(close)
    .resize(inner, inner, { kernel: 'lanczos3' })
    .toBuffer();
  const rounded = await sharp(cropped)
    .composite([{ input: roundedMask(inner, canvas * 0.17), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: sky } })
    .composite([{ input: rounded, left: rim, top: rim }])
    .png()
    .toBuffer();
}

async function tile(small: boolean) {
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: sky } })
    .composite([
      { input: await art(small) },
      { input: roundedMask(canvas, canvas * 0.234), blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

await mkdir('public/icon', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(await tile(size <= 32))
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(`public/icon/${size}.png`);
}

// The Chrome Web Store icon: the tile at 96 px inside 16 px of transparent padding, as the
// store's image guidelines ask. It is uploaded to the listing, not packaged.
await mkdir('brand/store', { recursive: true });
await sharp(await tile(false))
  .resize(96, 96, { kernel: 'lanczos3' })
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: '#0000' })
  .png()
  .toFile('brand/store/icon-128.png');
