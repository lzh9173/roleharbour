import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#051a49"/><g stroke="white" stroke-width="8" stroke-linecap="round" fill="#051a49"><path d="M30 39h68M30 64h68M30 89h68"/><circle cx="52" cy="39" r="9"/><circle cx="78" cy="64" r="9"/><circle cx="52" cy="89" r="9"/></g></svg>`;
await mkdir('public/icon', { recursive: true });
for (const size of [16, 32, 48, 128])
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icon/${size}.png`);
