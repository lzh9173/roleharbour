// Fail if any UI string the video shows differs from the extension's English copy.
// Usage: node promo/check-strings.mjs
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/i18n/page.ts', import.meta.url), 'utf8');
const strings = JSON.parse(await readFile(new URL('data/strings.json', import.meta.url), 'utf8'));
const problems = [];
for (const [key, value] of Object.entries(strings)) {
  if (key.startsWith('_')) continue;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Entries look like 'page.key': ['中文', 'English'], possibly over several lines.
  const match = source.match(
    new RegExp(`'${escaped}':\\s*\\[\\s*'(?:[^'\\\\]|\\\\.)*',\\s*'((?:[^'\\\\]|\\\\.)*)'`),
  );
  if (!match) problems.push(`${key}: not found in src/i18n/page.ts`);
  else if (match[1].replace(/\\'/g, "'") !== value)
    problems.push(`${key}: video has "${value}", extension has "${match[1]}"`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`${Object.keys(strings).length - 1} strings match src/i18n/page.ts`);
