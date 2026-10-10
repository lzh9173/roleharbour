/** Chrome lets content scripts read storage.local by default. Settings stay readable only by
 * extension pages and the worker; SEEK pages ask the worker for the values they need. */
export async function restrictStorageAccess(): Promise<void> {
  // Apply both independently: one failing area must not leave the other open.
  await Promise.allSettled([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}
