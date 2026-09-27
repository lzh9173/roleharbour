import { t } from '../i18n';

// Shared across extension windows and the worker; module-local queues cannot protect
// credentials and consent stored in two independently asynchronous storage areas.
const KEY_SETTINGS_LOCK = 'roleharbour-key-settings';

export interface KeyState {
  configured: boolean;
  remembered: boolean;
  consent: boolean;
}
export interface PagePreferences {
  autoAnalyze: boolean;
  ready: boolean;
  provider?: AnalysisProvider;
}
export type AnalysisProvider = 'jev';

// Upgrade once under the credential lock. Local/Codex/Qwen automatic consent
// must never become authorization for paid JEV requests. Preserve JEV opt-in.
async function migrateAnalysisSettings(): Promise<void> {
  const stored = await chrome.storage.local.get('analysisProvider');
  if (stored.analysisProvider === 'jev') return;
  await restrictKeyAccess();
  await chrome.storage.local.set({ analysisProvider: 'jev', autoAnalyze: false });
  await chrome.storage.local.remove(['codexConsent', 'qwenEnabled']);
}

export async function getAnalysisProvider(): Promise<AnalysisProvider> {
  await navigator.locks.request(KEY_SETTINGS_LOCK, migrateAnalysisSettings);
  return 'jev';
}

export async function getPagePreferences(): Promise<PagePreferences> {
  await getAnalysisProvider();
  return readPagePreferences();
}

async function readPagePreferences(): Promise<PagePreferences> {
  const [stored, state, permission] = await Promise.all([
    chrome.storage.local.get('autoAnalyze'),
    getKeyState(),
    chrome.permissions.contains({ origins: ['https://api.typesafe.ai/*'] }),
  ]);
  return {
    provider: 'jev',
    autoAnalyze: stored.autoAnalyze === true,
    ready: state.configured && state.consent && permission,
  };
}
export async function setAutoAnalyze(
  enabled: boolean,
  expectedProvider?: AnalysisProvider,
): Promise<PagePreferences> {
  return navigator.locks.request(KEY_SETTINGS_LOCK, async (): Promise<PagePreferences> => {
    await migrateAnalysisSettings();
    if (expectedProvider && expectedProvider !== 'jev') throw new Error(t('errors.autoNotReady'));
    if (enabled && !(await readPagePreferences()).ready)
      throw new Error(t('errors.keyAccessRequired'));
    await chrome.storage.local.set({ autoAnalyze: enabled });
    return readPagePreferences();
  });
}

export class AnalysisAuthorizationError extends Error {
  constructor(reason: 'provider' | 'consent') {
    super(t(reason === 'provider' ? 'errors.autoNotReady' : 'errors.consentRequired'));
  }
}

/** Check current authorization atomically with starting a provider request, not its response. */
export async function dispatchAuthorizedAnalysis<T>(
  provider: 'jev',
  automatic: boolean,
  dispatch: () => Promise<T>,
): Promise<T> {
  const { result } = await navigator.locks.request(KEY_SETTINGS_LOCK, async () => {
    await migrateAnalysisSettings();
    const stored = await chrome.storage.local.get(['autoAnalyze', 'jevConsent']);
    if (provider !== 'jev' || (automatic && stored.autoAnalyze !== true))
      throw new AnalysisAuthorizationError('provider');
    if (stored.jevConsent !== true) throw new AnalysisAuthorizationError('consent');
    const result = dispatch();
    // Observe an immediate rejection before the lock result reaches our caller.
    void result.catch(() => undefined);
    // Returning the promise directly would hold the settings lock for the entire request.
    return { result };
  });
  return result;
}

export async function restrictKeyAccess() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
export async function getApiKey(): Promise<string | undefined> {
  const session = await chrome.storage.session.get('jevKey');
  if (typeof session.jevKey === 'string') return session.jevKey;
  const local = await chrome.storage.local.get('jevKey');
  return typeof local.jevKey === 'string' ? local.jevKey : undefined;
}
export async function getKeyState(): Promise<KeyState> {
  const local = await chrome.storage.local.get(['jevKey', 'jevConsent']);
  return {
    configured: Boolean(await getApiKey()),
    remembered: typeof local.jevKey === 'string',
    consent: local.jevConsent === true,
  };
}
export async function saveApiKey(key: string, remember: boolean, consent: boolean): Promise<void> {
  if (!consent) throw new Error(t('errors.consentRequired'));
  const normalized = key.trim();
  // Reject header-invalid keys before replacing a working stored credential.
  if (!/^[\x21-\x7e]{1,512}$/.test(normalized) || key.length > 512 || /[\r\n]/.test(key))
    throw new Error(t('errors.keyInvalid'));
  return navigator.locks.request(KEY_SETTINGS_LOCK, async (): Promise<void> => {
    await restrictKeyAccess();
    // Keep the previous credential until its replacement has been written.
    if (remember) {
      await chrome.storage.local.set({ jevKey: normalized, jevConsent: true });
      await chrome.storage.session.remove('jevKey');
    } else {
      await chrome.storage.session.set({ jevKey: normalized });
      await chrome.storage.local.set({ jevConsent: true });
      await chrome.storage.local.remove('jevKey');
    }
  });
}
export async function clearApiKey(): Promise<void> {
  return navigator.locks.request(KEY_SETTINGS_LOCK, async (): Promise<void> => {
    await chrome.storage.session.remove('jevKey');
    await chrome.storage.local.remove(['jevKey', 'jevConsent', 'autoAnalyze']);
  });
}
