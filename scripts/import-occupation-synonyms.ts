/** Build-time only: derive everyday job-title synonyms for ANZSCO occupations from
 * O*NET titles, bridged through ISCO-08 by two pinned official crosswalks. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import readXlsxFile from 'read-excel-file/node';

const onetBase = 'https://www.onetcenter.org';
const sources = {
  occupations: `${onetBase}/dl_files/database/db_31_0_csv/occupation_data.csv`,
  reportedTitles: `${onetBase}/dl_files/database/db_31_0_csv/sample_of_reported_titles.csv`,
  jobTitles: `${onetBase}/dl_files/database/db_31_0_csv/job_titles.csv`,
  escoCrosswalk: `${onetBase}/crosswalks/esco/ESCO_to_ONET-SOC.xlsx`,
  anzscoIsco:
    'https://www.abs.gov.au/AUSSTATS/subscriber.nsf/log?openagent&1220.0%20anzsco%20version%201.3%20correspondence%20to%20isco-08%20v1.xlsx&1220.0&Data%20Cubes&EDA6BEDD198E7D49CA2584A8000FF686&0&2013,%20Version%201.3&05.11.2019&Latest',
};
const expectedHashes: Record<keyof typeof sources, string> = {
  occupations: 'a09eae1d6609686e44e05b7290993a1c8b523d8ca224bc0eedc194c855c3ee02',
  reportedTitles: '5d76040b7b0602ea217660648f8363e7980edd1870f96574a2eeaa6a822d2666',
  jobTitles: '75a3b46d6edc5996117c10c9ed488c9a06f7495d02969e9d12873ab14a21540c',
  escoCrosswalk: 'bf6c854f7ffc935eba67a296d6d7fa4d40b70fb26bcdb5ecb5621374bca6f35b',
  anzscoIsco: '27d49ed162d69a459f168e20ba63e387605665deffaa660991c67bc73b87918b',
};
const cacheDir = resolve(process.argv[2] ?? '.cache/onet-31.0');
await mkdir(cacheDir, { recursive: true });
const hashes: Record<string, string> = {};

async function source(name: keyof typeof sources): Promise<Buffer> {
  const path = resolve(cacheDir, name);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const response = await fetch(sources[name], { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  if (hashes[name] !== expectedHashes[name])
    throw new Error(`${name}: source checksum changed; review before importing.`);
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
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}
const csv = async (name: keyof typeof sources) =>
  parseCsv((await source(name)).toString('utf8')).slice(1);
const sheet = async (name: keyof typeof sources, title: (name: string) => boolean) => {
  const sheets = (await readXlsxFile(await source(name))) as Array<{
    sheet: string;
    data: unknown[][];
  }>;
  const found = sheets.find((item) => title(item.sheet));
  if (!found) throw new Error(`${name}: expected worksheet is missing`);
  return found.data;
};

const catalogue = JSON.parse(
  await readFile(resolve('data/occupations/anzsco-v1.3.json'), 'utf8'),
) as { occupations: Array<{ code: string; title: string; aliases: string[] }> };
const active = new Map(catalogue.occupations.map((occupation) => [occupation.code, occupation]));

// Normalisation for matching only; published synonyms keep their source wording.
const generic = new Set(
  'a an and the of for in at to on or with by as manager assistant associate worker officer clerk specialist technician operator helper staff member team lead leader senior junior head chief general other all services service representative coordinator consultant agent administrator supervisor director trainee apprentice intern entry level i ii iii iv nz us new zealand'.split(
    ' ',
  ),
);
// US spellings in O*NET; the retriever applies the same variants at runtime.
const spelling: Record<string, string> = {
  center: 'centre',
  centers: 'centres',
  labor: 'labour',
  laborer: 'labourer',
  laborers: 'labourers',
  advisor: 'adviser',
  advisors: 'advisers',
};
const stem = (word: string) =>
  word.length > 4 && word.endsWith('s') && !/(ss|us|is)$/.test(word) ? word.slice(0, -1) : word;
const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => spelling[word] ?? word.replace(/^([a-z]{3,})iz(e|es|ed|ing|er|ers)$/, '$1is$2'))
    .map(stem);
// Spacing differs between sources ("Cabinet Maker" / "Cabinetmaker").
const key = (value: string) => words(value).join('');

// "Call or Contact Centre Operator" names two everyday titles; keep in step with the retriever.
const orVariants = (name: string) => {
  const match = /^(.*?)\b([\w-]+) or ([\w-]+)\b(.*)$/.exec(name);
  return match && !name.includes(',')
    ? [name, `${match[1]}${match[2]}${match[4]}`, `${match[1]}${match[3]}${match[4]}`]
    : [name];
};
const officialNames = new Map<string, Set<string>>();
for (const occupation of active.values())
  for (const name of [occupation.title, ...occupation.aliases].flatMap(orVariants)) {
    const names = officialNames.get(key(name)) ?? new Set<string>();
    names.add(occupation.code);
    officialNames.set(key(name), names);
  }
// Words that name a specific occupation; a synonym using another occupation's word is unsafe.
const ownersOfWord = new Map<string, Set<string>>();
for (const occupation of active.values())
  for (const word of new Set([occupation.title, ...occupation.aliases].flatMap(words))) {
    if (generic.has(word)) continue;
    const owners = ownersOfWord.get(word) ?? new Set<string>();
    owners.add(occupation.code);
    ownersOfWord.set(word, owners);
  }
const MAX_LAY_TITLES = 12;
const nameWords = new Map(
  [...active.values()].map((occupation) => [
    occupation.code,
    new Set([occupation.title, ...occupation.aliases].flatMap(words)),
  ]),
);

// ANZSCO v1.3 occupation -> ISCO-08 unit group (ABS Table 1), restricted to active codes.
const iscoToAnzsco = new Map<string, Set<string>>();
let current: string | null = null;
for (const row of await sheet('anzscoIsco', (name) => name.startsWith('ANZSCO Version 1.3 to'))) {
  const anzsco = row[0] == null ? null : String(row[0]);
  if (anzsco && /^\d{6}$/.test(anzsco)) current = anzsco;
  else if (anzsco) current = null;
  const isco = row[2] == null ? '' : String(row[2]).padStart(4, '0');
  if (!current || !active.has(current) || !/^\d{4}$/.test(isco)) continue;
  const codes = iscoToAnzsco.get(isco) ?? new Set<string>();
  codes.add(current);
  iscoToAnzsco.set(isco, codes);
}

// O*NET-SOC 2019 -> ISCO-08 through the ESCO crosswalk: an ESCO code starts with its ISCO group.
const onetIsco = new Map<string, Set<string>>();
for (const [esco, , onet] of (
  await sheet('escoCrosswalk', (name) => name.includes('Crosswalk'))
).slice(4)) {
  const isco = String(esco ?? '').slice(0, 4);
  if (!/^\d{4}$/.test(isco) || typeof onet !== 'string') continue;
  const groups = onetIsco.get(onet) ?? new Set<string>();
  groups.add(isco);
  onetIsco.set(onet, groups);
}

type Source = 'occupation' | 'reported' | 'lay';
const onetTitles = new Map<string, Array<{ title: string; source: Source }>>();
const addTitle = (code: string | undefined, title: string | undefined, source: Source) => {
  if (!code || !title) return;
  const titles = onetTitles.get(code) ?? [];
  titles.push({ title, source });
  onetTitles.set(code, titles);
};
for (const [code, title] of await csv('occupations')) addTitle(code, title, 'occupation');
for (const [code, , title] of await csv('reportedTitles')) addTitle(code, title, 'reported');
for (const [code, , title] of await csv('jobTitles')) addTitle(code, title, 'lay');

function disambiguate(title: string, codes: Set<string>): string | null {
  if (codes.size === 1) return [...codes][0]!;
  const distinctive = words(title).filter((word) => !generic.has(word));
  const ranked = [...codes]
    .map((code) => ({
      code,
      overlap: distinctive.filter((word) => nameWords.get(code)!.has(word)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap);
  return ranked[0]!.overlap > 0 && ranked[0]!.overlap > (ranked[1]?.overlap ?? 0)
    ? ranked[0]!.code
    : null;
}

// An O*NET occupation corresponds to an ANZSCO occupation only when ISCO-08 links them AND
// one of its O*NET titles is exactly an official ANZSCO name of that occupation.
const votes = new Map<string, { title: string; lay: boolean; codes: Map<string, number> }>();
let anchored = 0;
for (const [onet, titles] of onetTitles) {
  const bridged = new Set(
    [...(onetIsco.get(onet) ?? [])].flatMap((isco) => [...(iscoToAnzsco.get(isco) ?? [])]),
  );
  const anchors = new Set(
    titles.flatMap(({ title }) =>
      [...(officialNames.get(key(title)) ?? [])].filter((code) => bridged.has(code)),
    ),
  );
  if (!anchors.size) continue;
  anchored += 1;
  for (const { title, source } of titles) {
    const clean = title
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const titleWords = words(clean);
    const normalized = key(clean);
    if (
      !normalized ||
      clean.length > 50 ||
      titleWords.length > (source === 'lay' ? 3 : 4) ||
      // A one-word lay title ("Sponsor", "Liquidator") is too often a different role, and a
      // single catalogue word ("Driver", "Laborer") would outrank the specific occupation.
      (titleWords.length < 2 && (source === 'lay' || ownersOfWord.has(titleWords[0]!))) ||
      /\d/.test(normalized) ||
      titleWords.every((word) => generic.has(word)) ||
      officialNames.has(normalized)
    )
      continue;
    const code = disambiguate(clean, anchors);
    if (!code) continue;
    // "Cabinet Maker" or "Bid Analyst" use words that name other ANZSCO occupations.
    if (
      titleWords.some((word) => {
        const owners = ownersOfWord.get(word);
        return owners && !owners.has(code);
      })
    )
      continue;
    const vote = votes.get(normalized) ?? {
      title: clean,
      lay: source === 'lay',
      codes: new Map<string, number>(),
    };
    vote.lay &&= source === 'lay';
    vote.codes.set(code, (vote.codes.get(code) ?? 0) + 1);
    votes.set(normalized, vote);
  }
}

// A title claimed by several ANZSCO occupations is not evidence for any one of them.
const synonyms = new Map<string, Array<{ title: string; lay: boolean; support: number }>>();
let ambiguous = 0;
for (const { title, lay, codes } of votes.values()) {
  if (codes.size > 1) {
    ambiguous += 1;
    continue;
  }
  const [code, support] = [...codes][0]!;
  synonyms.set(code, [...(synonyms.get(code) ?? []), { title, lay, support }]);
}
// Curated occupation/reported titles are kept; the long tail of lay titles is capped per
// occupation, preferring titles listed by several sources and then shorter titles.
const sorted = Object.fromEntries(
  [...synonyms]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, entries]) => {
      const lay = entries
        .filter((entry) => entry.lay)
        .sort(
          (a, b) =>
            b.support - a.support ||
            a.title.length - b.title.length ||
            a.title.localeCompare(b.title),
        )
        .slice(0, MAX_LAY_TITLES);
      const titles = [...entries.filter((entry) => !entry.lay), ...lay].map(({ title }) => title);
      return [code, [...new Set(titles)].sort((a, b) => a.localeCompare(b))];
    }),
);
const synonymCount = Object.values(sorted).reduce((sum, titles) => sum + titles.length, 0);
if (anchored < 300 || synonymCount < 2_000)
  throw new Error('Unexpectedly small synonym mapping; review the sources before publishing.');

const result = {
  metadata: {
    attribution:
      'This product includes information from O*NET 31.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under the CC BY 4.0 license. O*NET® is a trademark of USDOL/ETA. RoleHarbour has modified all or some of this information. USDOL/ETA has not approved, endorsed, or tested these modifications. ANZSCO to ISCO-08 correspondence: Australian Bureau of Statistics and Stats NZ, CC BY 4.0.',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sources,
    sha256: hashes,
    anchoredOnetOccupations: anchored,
    ambiguousTitlesExcluded: ambiguous,
    occupationCount: Object.keys(sorted).length,
    synonymCount,
    transformations:
      'O*NET-SOC 2019 occupations are linked to ANZSCO v1.3 occupations through ISCO-08 unit groups (the ESCO crosswalk code prefix and the ABS correspondence), and only where an O*NET title exactly equals an official ANZSCO name. Titles are de-parenthesised and limited in length; titles that are already official ANZSCO names, generic, numeric or claimed by several occupations are excluded. ESCO labels are not included. Synonyms are retrieval keywords, not official ANZSCO titles.',
  },
  synonyms: sorted,
};
const output = resolve('data/occupations/onet-synonyms.json');
await writeFile(`${output}.tmp`, `${JSON.stringify(result, null, 2)}\n`);
await rename(`${output}.tmp`, output);
console.log(
  `Mapped ${synonymCount} synonyms to ${result.metadata.occupationCount} occupations (${anchored} anchored O*NET occupations, ${ambiguous} ambiguous titles excluded) into ${output}`,
);
