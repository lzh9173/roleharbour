import { t } from '../i18n';
import type { JobDraft } from '../core/schema';
import { errorMessage } from '../core/errors';
import { sendPageMessage } from '../core/page-runtime';

/** The same advert: anything else (advertiser, location) may update in place. */
export function sameJob(a: JobDraft, b: JobDraft): boolean {
  return a.sourceUrl === b.sourceUrl && a.title === b.title && a.body === b.body;
}

/** Only a real click acts; SEEK scripts cannot trigger extension actions. */
export function isUserAction(event: { isTrusted: boolean }): boolean {
  return event.isTrusted;
}

/** Asks the worker to show the settings tab; resolves to '' or a localised error to display. */
export async function openSettings(): Promise<string> {
  try {
    const response = await sendPageMessage({ type: 'page:open-settings' });
    return response?.ok ? '' : (response?.error ?? t('page.openToolbar'));
  } catch (error) {
    return errorMessage(error, t('page.openToolbar'));
  }
}
