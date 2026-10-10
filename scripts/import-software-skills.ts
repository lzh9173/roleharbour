/** Build-time only: derive the software/tool names an ad may ask for from the O*NET
 * Software Skills examples, with the short forms ads actually use ("LabVIEW", "SQL"). */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = 'https://www.onetcenter.org/dl_files/database/db_31_0_csv/software_skills.csv';
const expectedHash = '6aabb96b464288db849580e6510530efff3f80e25dde2bb23f1fc36bb526b016';
const cacheDir = resolve(process.argv[2] ?? '.cache/onet-31.0');
// A local word list marks ordinary English words ("Excel", "Word", "React") that must keep
// their product capitalisation to match. Without one, every one-word alias is case-sensitive.
const wordList = process.env.WORD_LIST ?? '/usr/share/dict/words';

async function download(): Promise<Buffer> {
  await mkdir(cacheDir, { recursive: true });
  const path = resolve(cacheDir, 'softwareSkills');
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`softwareSkills: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error('softwareSkills: source checksum changed; review.');
  return bytes;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((cell) => cell));
}

const commonWords = await readFile(wordList, 'utf8')
  .then((text) => new Set(text.split('\n').filter((word) => /^[a-z]+$/.test(word))))
  .catch(() => null);
const isCommon = (word: string) => {
  const lower = word.toLowerCase();
  return (
    !commonWords ||
    commonWords.has(lower) ||
    (lower.endsWith('s') && commonWords.has(lower.slice(0, -1))) ||
    (lower.endsWith('es') && commonWords.has(lower.slice(0, -2)))
  );
};
// One-word product names that are also English words match only for these well-known tools,
// and only capitalised mid-sentence; other such names ("Teams", "Survey", "Chef") keep their
// full vendor name ("Microsoft Teams").
const commonWordTools = new Set([
  'Android',
  'Angular',
  'Azure',
  'Bash',
  'Blender',
  'Bootstrap',
  'Chrome',
  'Confluence',
  'Docker',
  'Excel',
  'Git',
  'Outlook',
  'Python',
  'React',
  'Selenium',
]);

const [header, ...rows] = parseCsv((await download()).toString('utf8'));
const column = (name: string) => header!.indexOf(name);
const [exampleAt, socAt, hotAt, demandAt] = [
  column('Workplace Example'),
  column('O*NET-SOC Code'),
  column('Hot Technology'),
  column('In Demand'),
];
const examples = new Map<string, { occupations: Set<string>; notable: boolean }>();
for (const row of rows) {
  const name = row[exampleAt]!.trim();
  const entry = examples.get(name) ?? { occupations: new Set(), notable: false };
  entry.occupations.add(row[socAt]!);
  entry.notable ||= row[hotAt] === 'Y' || row[demandAt] === 'Y';
  examples.set(name, entry);
}

// Names used across occupations or flagged hot/in demand; single-occupation niche products
// rarely appear in NZ ads and add false matches.
const kept = [...examples].filter(([, e]) => e.notable || e.occupations.size >= 2).map(([n]) => n);

// Vendors: leading one- or two-word prefixes shared by several product names.
const prefixCounts = new Map<string, number>();
for (const name of examples.keys()) {
  const words = name.split(/\s+/);
  for (const size of [1, 2])
    if (words.length > size)
      prefixCounts.set(
        words.slice(0, size).join(' '),
        (prefixCounts.get(words.slice(0, size).join(' ')) ?? 0) + 1,
      );
}
const vendor = (prefix: string) =>
  (prefixCounts.get(prefix) ?? 0) >= 4 && prefix.split(' ').every((word) => /^[A-Z]/.test(word));

/** A short form is distinctive enough to match on its own. */
const genericNouns = new Set(
  'database databases server servers cloud analytics studio suite platform manager system systems online enterprise office portal desktop mobile web network designer developer toolkit toolbox workbench framework library viewer editor reader'.split(
    ' ',
  ),
);
function distinctive(alias: string): boolean {
  if (alias.length < 2) return false;
  const words = alias.split(/\s+/);
  if (words.length > 1) return !words.every((word) => isCommon(word) || /^software$/i.test(word));
  // Product names are capitalised; generic nouns left after a vendor ("Oracle Database",
  // "Client databases") name no product.
  if (!/^[A-Z0-9.]|[A-Z+#]/.test(alias) || genericNouns.has(alias.toLowerCase())) return false;
  return alias.length >= 3 || /[+#]/.test(alias) || /^[A-Z]{2}$/.test(alias);
}

type Alias = string; // "=" prefix: case-sensitive; "!" prefix: case-sensitive and not sentence-initial.
const ambiguous = (alias: string) =>
  !alias.includes(' ') && isCommon(alias) && !commonWordTools.has(alias);
function encode(alias: string): Alias {
  const words = alias.split(/\s+/);
  if (words.length === 1 && isCommon(alias)) return `!${alias}`;
  if (words.length === 1 && alias.length <= 3) return `=${alias}`;
  return alias;
}

const tools: Array<[string, ...Alias[]]> = [];
for (const name of kept.sort((a, b) => a.localeCompare(b))) {
  // Generic category descriptions ("Spreadsheet software") are not named tools.
  if (/^[A-Z][a-z]+(?: [a-z][\w-]*)* software$/.test(name) && !/[A-Z]/.test(name.slice(1)))
    continue;
  const aliases = new Set<string>();
  let label = name.replace(/\s+software$/i, '');
  // "Structured query language SQL": an expanded name followed by its acronym.
  const acronym = label.match(/^(.*\S)\s+([A-Z][A-Z0-9+#./-]{1,})$/);
  if (acronym) {
    const initials = acronym[1]!
      .split(/[\s-]+/)
      .map((word) => word[0]!.toUpperCase())
      .join('');
    if (initials.endsWith(acronym[2]!.replace(/[^A-Z]/g, '')) || initials.includes(acronym[2]!)) {
      label = acronym[2]!;
      aliases.add(acronym[2]!);
      if (acronym[1]!.split(/\s+/).length >= 2) aliases.add(acronym[1]!);
    }
  }
  aliases.add(label);
  // "National Instruments LabVIEW" -> "LabVIEW"; "Microsoft Excel" -> "Excel".
  const words = label.split(/\s+/);
  for (const size of [2, 1]) {
    if (words.length <= size || !vendor(words.slice(0, size).join(' '))) continue;
    const rest = words.slice(size).join(' ');
    if (distinctive(rest)) {
      aliases.add(rest);
      if (label === name.replace(/\s+software$/i, '') && rest.split(/\s+/).length <= 2)
        label = rest;
    }
    break;
  }
  const usable = [...aliases].filter((alias) => distinctive(alias) && !ambiguous(alias));
  if (!usable.length) continue;
  // Show the short form only when it is itself matchable.
  if (!usable.includes(label)) label = usable.reduce((a, b) => (b.length < a.length ? b : a));
  tools.push([label, ...usable.map(encode)]);
}

const output = {
  source: 'O*NET 31.0 Database, Software Skills (Workplace Example)',
  sourceUrl: source,
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution:
    'Derived from the O*NET 31.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under CC BY 4.0. Names shortened and filtered; USDOL/ETA has not approved, endorsed, or tested these modifications.',
  sha256: expectedHash,
  tools,
};
const target = resolve('data/skills/onet-software.json');
await mkdir(resolve('data/skills'), { recursive: true });
await writeFile(`${target}.tmp`, `${JSON.stringify(output)}\n`);
await rename(`${target}.tmp`, target);
console.log(`${tools.length} tools from ${kept.length} kept of ${examples.size} examples`);
