import catalogue from './anzsco-v1.3.json';

export interface Occupation {
  id: string;
  code: string;
  system: 'ANZSCO';
  title: string;
  /** Official names and hierarchy, not an official duties definition. */
  description: string;
  descriptionKind: 'official_directory_context';
  keywords: readonly string[];
  sourceUrl: string;
  nzSkillLevel: number;
}

export const TAXONOMY_VERSION = 'anzsco-v1.3-full-2026-09-21.1';
export const CATALOGUE_METADATA = catalogue.metadata;
export const occupations: readonly Occupation[] = catalogue.occupations.map((record) => ({
  id: `anzsco-${record.code}`,
  code: record.code,
  system: 'ANZSCO',
  title: record.title,
  description: [
    'Catalogue context (not an official duties definition).',
    `Occupation: ${record.title}.`,
    `Groups: ${record.groups.join(' > ')}.`,
    ...(record.aliases.length ? [`Other indexed titles: ${record.aliases.join('; ')}.`] : []),
  ].join(' '),
  descriptionKind: 'official_directory_context',
  keywords: record.aliases,
  sourceUrl: catalogue.metadata.sourceUrl,
  nzSkillLevel: record.nzSkillLevel,
}));
