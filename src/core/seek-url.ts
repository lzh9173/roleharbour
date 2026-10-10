const seekHosts = new Set(['nz.seek.com', 'www.seek.co.nz']);
const jobIdPattern = /^[0-9]{1,20}$/;

/** Extension match patterns for the two NZ SEEK hosts (content script, permissions, tab queries). */
export const SEEK_MATCHES = [...seekHosts].map((host) => `https://${host}/*`);

/** Shared URL policy for DOM extraction and authenticated background requests. */
export function parseSeekUrl(value: string | undefined, base?: string): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      seekHosts.has(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Normalize public job links across NZ hosts and remove source tracking. */
export function canonicalSeekJobUrl(value: string, base?: string): string | null {
  const url = parseSeekUrl(value, base);
  const id = url?.pathname.match(/^\/job\/([0-9]{1,20})\/?$/)?.[1];
  return id ? `https://nz.seek.com/job/${id}` : null;
}

export function isSeekPublicPage(value: string): boolean {
  const url = parseSeekUrl(value);
  if (!url) return false;
  if (url.pathname === '/' || /^\/job\/[0-9]{1,20}\/?$/.test(url.pathname)) return true;
  if (/^\/(?:saved-jobs|my-jobs|recommended-jobs)(?:\/|$)/i.test(url.pathname)) return false;
  return /^\/(?:jobs|[a-z0-9][a-z0-9%_-]*-jobs)(?:\/[^?#]*)?$/i.test(url.pathname);
}

/** Search results need a single selected detail identity; reject ambiguous selections. */
export function getSeekJobId(value: string | undefined): string | null {
  const url = parseSeekUrl(value);
  if (!url) return null;
  const pathId = /^\/job\/([0-9]{1,20})\/?$/.exec(url.pathname)?.[1];
  if (/^\/job(?:\/|$)/.test(url.pathname) && !pathId) return null;
  const identities = pathId ? [pathId] : [];
  for (const parameter of ['selectedjob', 'jobId']) {
    const values = url.searchParams.getAll(parameter);
    if (values.length > 1 || (values.length === 1 && !jobIdPattern.test(values[0]!))) return null;
    if (values[0]) identities.push(values[0]);
  }
  if (new Set(identities).size !== 1) return null;
  return identities[0]!;
}
