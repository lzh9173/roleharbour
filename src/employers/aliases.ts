import { normalizeEmployerName } from './data';

/** Public identity mappings only. Accreditation always comes from the local snapshot. */
const employerAliases = [
  {
    aliases: ['BNZ', 'B.N.Z.'],
    employerName: 'BANK OF NEW ZEALAND',
    nzbn: '9429039342188',
    sourceUrl:
      'https://www.bnz.co.nz/about-us/governance/terms-and-conditions/developer-terms-for-use-of-bnzs-sandbox-apis',
  },
] as const;

// Resolve at query time so existing downloads and imported backups need no migration.
export function findEmployerAliases(normalizedName: string) {
  return employerAliases.filter((entry) =>
    entry.aliases.some((alias) => normalizeEmployerName(alias) === normalizedName),
  );
}
