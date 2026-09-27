import { t } from '../i18n';
import { classifyJob, JevError, JEV_MODEL } from '../providers/jev';
import { retrieveOccupations, RULES_VERSION, TAXONOMY_VERSION } from '../rules';
import { claimTask, getJobById, putJob, updateTask } from '../storage/db';
import {
  getApiKey,
  getKeyState,
  dispatchAuthorizedAnalysis,
  AnalysisAuthorizationError,
} from '../storage/settings';
import {
  draftSchema,
  jobSchema,
  redactContacts,
  type JobDraft,
  type SavedJob,
  type ResultMessage,
} from './schema';

// Bump when normalization/orchestration or provider questions change. Versions
// partition persisted results so a new interpretation cannot overwrite the old one.
const ANALYSIS_VERSION = 'analysis-2026-09-26.1';
const JEV_PROMPT_VERSION = 'classification-2026-09-21.2';

export interface AnalysisOptions {
  automatic?: boolean;
  force?: boolean;
  onRetry?: (attempt: number) => void;
}

const maxValidationRetries = 2;

function waitForRetry(signal: AbortSignal, delay: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      reject(new JevError('aborted', true));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve();
    }, delay);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export async function analyze(
  requestId: string,
  input: JobDraft,
  mode: 'jev',
  signal: AbortSignal,
  options: AnalysisOptions = {},
): Promise<ResultMessage> {
  let claimed = false;
  let dispatched = false;
  try {
    if (mode !== 'jev') throw new Error(t('errors.requestInvalid'));
    if (options.automatic && options.force) throw new Error(t('errors.autoForce'));
    const draft = draftSchema.parse(input);
    const body = redactContacts(draft.body);
    const sourceUrl = draft.sourceUrl ? new URL(draft.sourceUrl) : null;
    if (sourceUrl) {
      sourceUrl.search = '';
      sourceUrl.hash = '';
    }
    // Storage preference is not job content. The content identity stays stable
    // across settings and bundled policy/catalogue updates.
    const { retainBody: _retainBody, ...jobInput } = draft;
    const contentHash = await sha256({ ...jobInput, body, sourceUrl: sourceUrl?.href ?? '' });
    const recordId = await sha256({
      contentHash,
      mode,
      analysisVersion: ANALYSIS_VERSION,
      model: JEV_MODEL,
      promptVersion: JEV_PROMPT_VERSION,
      taxonomyVersion: TAXONOMY_VERSION,
      rulesVersion: RULES_VERSION,
    });
    if (!options.force && !signal.aborted) {
      const cached = await getJobById(
        recordId,
        options.automatic ? undefined : { retainBody: draft.retainBody, body },
      );
      if (signal.aborted) throw new Error(t('errors.localStopped'));
      if (cached?.mode === 'jev') return { ok: true, job: jobSchema.parse(cached), cached: true };
    }
    // Interrupted remote requests must not be repeated automatically.
    await claimTask(requestId, recordId, {
      automatic: options.automatic === true,
    });
    claimed = true;
    const candidates = retrieveOccupations(draft.title, body, 8);
    if (signal.aborted) throw new Error(t('errors.localStopped'));
    let jev: SavedJob['jev'];
    const state = await getKeyState();
    const apiKey = await getApiKey();
    if (!apiKey || !state.consent) throw new Error(t('errors.keyAnalysisRequired'));
    if (!(await chrome.permissions.contains({ origins: ['https://api.typesafe.ai/*'] })))
      throw new Error(t('errors.apiPermission'));
    if (signal.aborted) throw new Error(t('errors.localStopped'));
    // Retry only a received, inconsistent choice, within this task's ownership.
    // Valid results keep their cache identity; provider/evaluation calls stay single-shot.
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) throw new JevError('aborted', dispatched);
      await updateTask(requestId, { status: 'sent', expiresAt: Date.now() + 30_000 });
      if (signal.aborted) throw new JevError('aborted', dispatched);
      try {
        jev = await dispatchAuthorizedAnalysis('jev', options.automatic === true, () => {
          if (signal.aborted) throw new JevError('aborted', dispatched);
          dispatched = true;
          return classifyJob({
            apiKey,
            title: redactContacts(draft.title),
            body,
            candidates,
            signal,
          });
        });
        break;
      } catch (error) {
        if (signal.aborted) throw new JevError('aborted', dispatched);
        const retryable =
          error instanceof JevError &&
          error.code === 'invalid_response' &&
          error.diagnostic?.stage === 'choice_not_maximum';
        if (!retryable || attempt >= maxValidationRetries) {
          if (attempt > 0 && error instanceof JevError && error.code !== 'aborted')
            throw new JevError('retry_failed', true, error.diagnostic);
          throw error;
        }
        options.onRetry?.(attempt + 1);
        await waitForRetry(signal, 1_000 * (attempt + 1));
      }
    }
    if (signal.aborted) throw new JevError('aborted', dispatched);
    const evidence = [
      ...new Map(
        [
          ...[jev.occupation, jev.sponsorship, jev.workRights, jev.residency].flatMap(
            (d) => d.evidence,
          ),
          ...(jev.requirements
            ? [...jev.requirements.skills, ...jev.requirements.experience].map(
                (item) => item.evidence,
              )
            : []),
          ...(jev.requirements?.experienceEstimate?.evidence ?? []),
        ].map((s) => [s.id, s]),
      ).values(),
    ];
    const job = await putJob(
      {
        id: recordId,
        contentHash,
        title: draft.title,
        employer: draft.employer,
        location: draft.location,
        salary: draft.salary,
        sourceUrl: sourceUrl?.href ?? '',
        body: draft.retainBody ? body : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        bookmarked: false,
        mode,
        candidateIds: candidates.map((c) => c.id),
        jev,
        evidence,
        dataVersion: RULES_VERSION,
      },
      requestId,
      signal,
    );
    return { ok: true, job: jobSchema.parse(job) };
  } catch (error) {
    if (signal.aborted && error instanceof DOMException && error.name === 'AbortError')
      error = new JevError('aborted', dispatched);
    const providerError = error instanceof JevError ? error : null;
    const authorizationError = error instanceof AnalysisAuthorizationError ? error : null;
    const outcomeUnknown = authorizationError
      ? false
      : providerError
        ? providerError.outcomeUnknown
        : dispatched;
    const message = authorizationError
      ? authorizationError.message
      : providerError
        ? providerError.message
        : error instanceof Error && !dispatched
          ? error.message
          : t('errors.resultSave');
    if (claimed)
      await updateTask(requestId, {
        status: outcomeUnknown ? 'outcome_unknown' : signal.aborted ? 'interrupted' : 'failed',
        message,
      }).catch(() => undefined);
    return { ok: false, error: message, outcomeUnknown };
  }
}
