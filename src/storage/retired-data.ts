/** Data written by the retired AI analysis (TypeSafe JEV) and its saved-job archive.
 * Removed on every worker start so a stored API key never outlives the feature; the
 * cleanup is idempotent and cheap once nothing is left. */
const RETIRED_STORAGE_KEYS = [
  'jevKey',
  'jevConsent',
  'autoAnalyze',
  'analysisProvider',
  'codexConsent',
  'qwenEnabled',
] as const;
const RETIRED_DATABASE = 'seek-filter';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // An open settings tab from the previous version may hold a connection; deletion
    // completes once it closes, so do not wait for it.
    request.onblocked = () => resolve();
  });
}

export async function removeRetiredData(): Promise<void> {
  await Promise.all([
    chrome.storage.local.remove([...RETIRED_STORAGE_KEYS]),
    chrome.storage.session.remove([...RETIRED_STORAGE_KEYS]),
    deleteDatabase(RETIRED_DATABASE),
  ]);
}
