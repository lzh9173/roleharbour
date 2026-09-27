export const INZ_EMPLOYER_SOURCE =
  'https://www.immigration.govt.nz/work/requirements-for-work-visas/approved-employers/accredited-employer-list/';
export const SNAPSHOT_ORIGIN = 'https://data.nzaei.zemo.bio';
export const SNAPSHOT_CATALOG_URL = `${SNAPSHOT_ORIGIN}/catalog.json`;
export const EMPLOYER_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;
export const EMPLOYER_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const EMPLOYER_BACKUP_MAX_BYTES = 12 * 1024 * 1024;

export interface EmployerMatch {
  employerName: string;
  tradingName: string;
  nzbn: string;
  expiryDate?: string;
  lastVerifiedAt?: number;
  aliasMatch?: { alias: string; sourceUrl: string };
  candidateMatch?: 'name_variant' | 'short_name' | 'initials';
}

export interface EmployerCheck {
  query: string;
  status: 'matched' | 'ambiguous' | 'not_found' | 'unavailable';
  matches: EmployerMatch[];
  candidateCount?: number;
  checkedAt: number | null;
  stale: boolean;
  snapshotSourceUrl?: string;
  sourceDate?: string;
  note?: string;
}

export interface EmployerCacheStatus {
  snapshotDate: string | null;
  downloadedAt: number | null;
  recordCount: number;
  error?: string;
  snapshotSourceUrl: string | null;
  lastAttemptAt: number | null;
}

export interface EmployerCheckOptions {
  force?: boolean;
  /** Only true permits a weekly snapshot check. Omitted/false means local lookups only. */
  refresh?: boolean;
  signal?: AbortSignal;
}

export interface StoredEmployer extends EmployerMatch {
  names: string[];
}

export interface SnapshotMetadata {
  count: number;
  sourceDate: string;
  snapshotSourceUrl: string;
  importedAt: number;
  generatedAt: number;
  sha256: string;
}

export interface SyncState {
  lastAttemptAt: number;
  lastError: string | null;
}

export interface EmployerRevision {
  revision: number;
}
