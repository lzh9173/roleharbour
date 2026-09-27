import { t } from '../i18n';
import { EMPLOYER_BACKUP_MAX_BYTES, type StoredEmployer } from './types';

export function normalizeEmployerName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bltd$/, 'limited');
}

export function aucklandDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);
}

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error(t('errors.csvQuoteFormat'));
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell);
      cell = '';
      closed = false;
      if (char !== ',') {
        if (char === '\r' && input[i + 1] === '\n') i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw new Error(t('errors.csvAfterQuote'));
      cell += char;
    }
  }
  if (quoted) throw new Error(t('errors.csvUnclosedQuote'));
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers || new Set(headers).size !== headers.length) throw new Error(t('errors.csvHeaders'));
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error(t('errors.csvColumns'));
    return Object.fromEntries(headers.map((name, i) => [name, values[i]!]));
  });
}

/** Accepts only a bounded public snapshot, never an accreditation boolean. */
export function parseEmployerData(
  input: string,
  format: 'csv' | 'json',
  expectedRows?: number,
): StoredEmployer[] {
  if (new TextEncoder().encode(input).byteLength > EMPLOYER_BACKUP_MAX_BYTES)
    throw new Error(t('errors.snapshotSize'));
  const raw: unknown = format === 'csv' ? parseCsv(input) : JSON.parse(input);
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.length > 100_000 ||
    (expectedRows !== undefined && raw.length !== expectedRows)
  )
    throw new Error(t('errors.snapshotRows'));
  const seen = new Set<string>();
  return raw.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(t('errors.employerRecord'));
    const item = value as Record<string, unknown>;
    const field = (...keys: string[]) =>
      keys.map((key) => item[key]).find((v) => v !== undefined && v !== null);
    const name = field('employer_name', 'employerName');
    const trading = field('trading_name', 'tradingName') ?? '';
    const nzbn = field('nzbn');
    const expiry = field('expiry_date_of_accreditation', 'expiryDate', 'expiryDateOfAccreditation');
    const verified = field('last_verified_at', 'lastVerifiedAt');
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 500 ||
      typeof trading !== 'string' ||
      trading.length > 500 ||
      typeof nzbn !== 'string' ||
      !/^\d{13}$/.test(nzbn) ||
      seen.has(nzbn)
    )
      throw new Error(t('errors.employerIdentity'));
    seen.add(nzbn);
    const expiryDate = typeof expiry === 'string' && validDate(expiry) ? expiry : undefined;
    let lastVerifiedAt: number | undefined;
    if (typeof verified === 'number') lastVerifiedAt = verified;
    else if (
      typeof verified === 'string' &&
      /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(verified)
    ) {
      // Date.parse silently rolls dates such as February 30 into the next month.
      if (!validDate(verified.slice(0, 10))) throw new Error(t('errors.employerVerificationTime'));
      lastVerifiedAt = Date.parse(verified);
    }
    if (
      lastVerifiedAt !== undefined &&
      (!Number.isSafeInteger(lastVerifiedAt) ||
        lastVerifiedAt < 0 ||
        lastVerifiedAt > Date.now() + 300_000)
    )
      throw new Error(t('errors.employerVerificationTime'));
    return {
      employerName: name.trim(),
      tradingName: trading.trim(),
      nzbn,
      ...(expiryDate ? { expiryDate } : {}),
      ...(lastVerifiedAt !== undefined ? { lastVerifiedAt } : {}),
      names: [
        ...new Set([normalizeEmployerName(name), normalizeEmployerName(trading)].filter(Boolean)),
      ],
    };
  });
}
