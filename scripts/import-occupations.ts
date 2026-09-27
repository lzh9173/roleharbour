/** Build-time only: import the pinned official ANZSCO v1.3 workbooks. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readSheet } from 'read-excel-file/node';

const base = 'https://www.abs.gov.au/AUSSTATS/subscriber.nsf/log?openagent&';
const sources = {
  structure: `${base}1220.0%20anzsco%20version%201.3%20structure%20v1.xlsx&1220.0&Data%20Cubes&57FF3E8EFF92B344CA2584A8000FF375&0&2013,%20Version%201.3&05.11.2019&Latest`,
  index: `${base}12200%20anzsco%20version%201.3%20index%20of%20principal%20titles,%20alternative%20titles%20and%20specialisations%20v1.xlsx&1220.0&Data%20Cubes&F829B444DF59FFEECA2584A8000FF61F&0&2013,%20Version%201.3&05.11.2019&Latest`,
};
const cacheDir = resolve(process.argv[2] ?? '.cache/anzsco-v1.3');
const expectedHashes = {
  structure: 'cea1f6cbfd2077742259f447f861f0661b57a14a47acb1d68a4db59451cebc0a',
  index: '97119ed3b5d2b8231f21f7aa9151d07b455d88017f5bd940d74c8012a52748ce',
};
await mkdir(cacheDir, { recursive: true });
const hashes: Record<string, string> = {};
async function workbook(name: keyof typeof sources): Promise<Buffer> {
  const path = resolve(cacheDir, `${name}.xlsx`);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const response = await fetch(sources[name], { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 2).toString() !== 'PK') throw new Error(`${name}: not an XLSX`);
    await writeFile(path, bytes);
  }
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  if (hashes[name] !== expectedHashes[name])
    throw new Error(`${name}: source checksum changed; review before importing.`);
  return bytes;
}
const [structure, index] = await Promise.all([
  workbook('structure').then((bytes) => readSheet(bytes, 'Table 5')),
  workbook('index').then((bytes) => readSheet(bytes, 'Table 2')),
]);
const clean = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const aliases = new Map<string, Set<string>>();
let indexEntries = 0;
for (const row of index) {
  const code = clean(row[0]);
  const title = clean(row[1]);
  if (!/^\d{6}$/.test(code) || !/\([PASN]\)$/.test(title)) continue;
  const name = title.replace(/\s*\([PASN]\)$/, '').trim();
  if (!name) throw new Error(`Empty index title: ${code}`);
  const names = aliases.get(code) ?? new Set<string>();
  names.add(name);
  aliases.set(code, names);
  indexEntries += 1;
}
const hierarchy: string[] = [];
const unitGroups = new Set<string>();
const retiredCodes: string[] = [];
const occupations: {
  code: string;
  title: string;
  aliases: string[];
  groups: string[];
  nzSkillLevel: number;
}[] = [];
for (const row of structure) {
  for (let level = 0; level < 4; level += 1) {
    const code = clean(row[level]);
    if (new RegExp(`^\\d{${level + 1}}$`).test(code)) {
      hierarchy[level] = clean(row[level + 1]);
      hierarchy.length = level + 1;
      if (level === 3) unitGroups.add(code);
      break;
    }
  }
  const code = clean(row[4]);
  if (!/^\d{6}$/.test(code)) continue;
  const title = clean(row[5]);
  if (/code retired/i.test(title)) {
    retiredCodes.push(code);
    continue;
  }
  const level = clean(row[6]);
  const nzSkillLevel = Number(level.match(/([1-5])\s*NZ/)?.[1] ?? level);
  if (
    !title ||
    hierarchy.length !== 4 ||
    !Number.isInteger(nzSkillLevel) ||
    nzSkillLevel < 1 ||
    nzSkillLevel > 5
  )
    throw new Error(`Invalid occupation or NZ skill level: ${code}`);
  const names = aliases.get(code);
  if (!names?.size) throw new Error(`Missing title index: ${code}`);
  occupations.push({
    code,
    title,
    aliases: [...names].filter((name) => name !== title),
    groups: [...hierarchy].reverse(),
    nzSkillLevel,
  });
}
if (
  occupations.length !== 1023 ||
  new Set(occupations.map(({ code }) => code)).size !== 1023 ||
  retiredCodes.length !== 9 ||
  unitGroups.size !== 358
)
  throw new Error('Official v1.3 catalogue counts changed; review the source before publishing.');
const result = {
  metadata: {
    classification: 'ANZSCO',
    version: '1.3',
    publishedAt: '2019-11-05',
    sourceUrl:
      'https://www.abs.gov.au/AUSSTATS/abs@.nsf/DetailsPage/1220.02013,%20Version%201.3?OpenDocument=',
    attribution: 'Australian Bureau of Statistics and Stats NZ. ANZSCO Version 1.3 (2019).',
    license: 'CC BY 4.0',
    licenseUrl: 'https://www.abs.gov.au/website-privacy-copyright-and-disclaimer',
    sources,
    sha256: hashes,
    occupationCount: occupations.length,
    unitGroupCount: unitGroups.size,
    titleIndexEntries: indexEntries,
    aliasCount: occupations.reduce((sum, occupation) => sum + occupation.aliases.length, 0),
    excludedRetiredCodes: retiredCodes,
    transformations:
      'Active six-digit occupations only. Excludes retired and operational/residual codes. Removes terminal P/A/S/N index markers; retains alternative titles, specialisations and nec examples. Uses New Zealand skill levels. Group labels are directory context, not duties definitions.',
  },
  occupations,
};
const output = resolve('data/occupations/anzsco-v1.3.json');
await writeFile(`${output}.tmp`, `${JSON.stringify(result, null, 2)}\n`);
await rename(`${output}.tmp`, output);
console.log(
  `Imported ${occupations.length} occupations, ${result.metadata.aliasCount} aliases and ${unitGroups.size} unit groups into ${output}`,
);
