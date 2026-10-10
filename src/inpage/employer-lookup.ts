import { t } from '../i18n';
import type { EmployerCacheStatus, EmployerCheck } from '../employers';
import { errorMessage } from '../core/errors';
import { sendPageMessage } from '../core/page-runtime';

const BATCH = 20;

const unavailable = (query: string): EmployerCheck => ({
  query,
  status: 'unavailable',
  matches: [],
  checkedAt: null,
});

export interface EmployerLookupState {
  busy: boolean;
  message: string;
  cache?: EmployerCacheStatus;
}

/**
 * Page-side cache of accredited-list checks. Each visible employer name is asked for once
 * per revision; `reset` starts a new revision (focus, list updated) and drops late replies.
 */
export function createEmployerLookup(options: { isActive: () => boolean; onChange: () => void }) {
  const checks = new Map<string, EmployerCheck>();
  const requested = new Set<string>();
  let revision = 0;
  let busy = 0;
  let message = '';
  let cache: EmployerCacheStatus | undefined;
  const current = (asked: number) => options.isActive() && asked === revision;

  async function request(names: string[]) {
    if (!options.isActive()) return;
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    // Names the worker would reject are settled here, so no badge waits on "checking" forever.
    for (const query of unique)
      if ((query.length < 2 || query.length > 240) && !checks.has(query))
        checks.set(query, unavailable(query));
    const queries = unique.filter((n) => n.length >= 2 && n.length <= 240 && !requested.has(n));
    if (!queries.length) return;
    queries.forEach((n) => requested.add(n));
    const asked = revision;
    busy++;
    options.onChange();
    try {
      for (let i = 0; i < queries.length; i += BATCH) {
        if (!current(asked)) return;
        const response = await sendPageMessage({
          type: 'page:employers',
          names: queries.slice(i, i + BATCH),
        });
        if (!current(asked)) return;
        if (!response?.ok) throw new Error(response?.error ?? t('page.listReadError'));
        for (const check of response.employers as EmployerCheck[]) checks.set(check.query, check);
        cache = response.cache;
        message = '';
        options.onChange();
      }
    } catch (error) {
      if (!current(asked)) return;
      message = errorMessage(error, t('page.listReadError'));
      for (const query of queries)
        if (!checks.has(query)) {
          checks.set(query, unavailable(query));
          // Ask again on the next pass instead of waiting for focus or a list update.
          requested.delete(query);
        }
      options.onChange();
    } finally {
      busy--;
      if (options.isActive()) options.onChange();
    }
  }

  return {
    request,
    get: (name: string) => checks.get(name.trim()),
    state: (): EmployerLookupState => ({ busy: busy > 0, message, cache }),
    /** Re-ask every name on the next request; replies to older requests are ignored. */
    reset() {
      revision++;
      requested.clear();
    },
  };
}
