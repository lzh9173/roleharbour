import { t } from '../i18n';
import type { PageMessage } from './page-messages';

export function isPageRuntimeAvailable(): boolean {
  try {
    return !!globalThis.chrome?.runtime?.id;
  } catch {
    return false;
  }
}

/** Chrome may throw before returning a Promise after an extension reload. */
export async function sendPageMessage(message: PageMessage) {
  if (!isPageRuntimeAvailable()) throw new Error(t('page.refreshExtension'));
  const response = await chrome.runtime.sendMessage(message);
  if (!isPageRuntimeAvailable()) throw new Error(t('page.refreshExtension'));
  return response;
}
