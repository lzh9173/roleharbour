import { z } from 'zod';
import { draftSchema } from './schema';

import { getSeekJobId, isSeekPublicPage, parseSeekUrl as seekUrl } from './seek-url';
export { getSeekJobId } from './seek-url';

export const analysisRetryMessageSchema = z
  .object({
    type: z.literal('page:analysis-retry'),
    requestId: z.uuid(),
    attempt: z.number().int().min(1).max(2),
  })
  .strict();

/** This bridge never accepts credentials, arbitrary tools, URLs to fetch, or library requests. */
export const pageMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('page:language') }).strict(),
  z
    .object({
      type: z.literal('page:analyze'),
      requestId: z.uuid(),
      draft: draftSchema.strict(),
      mode: z.literal('jev'),
      surface: z.enum(['page', 'dialog']),
      automatic: z.boolean().optional(),
      force: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal('page:cancel'), requestId: z.uuid() }).strict(),
  z
    .object({ type: z.literal('page:open-workspace'), section: z.literal('settings').optional() })
    .strict(),
  z.object({ type: z.literal('page:preferences') }).strict(),
  z
    .object({
      type: z.literal('page:auto'),
      enabled: z.boolean(),
      provider: z.literal('jev').optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('page:employers'),
      names: z.array(z.string().trim().min(2).max(240)).max(20),
    })
    .strict(),
]);
export type PageMessage = z.infer<typeof pageMessageSchema>;
export type PageAnalysisMessage = Extract<PageMessage, { type: 'page:analyze' }>;
export type PageSender = Pick<
  chrome.runtime.MessageSender,
  'id' | 'url' | 'origin' | 'frameId' | 'documentId'
> & {
  tab?: Pick<chrome.tabs.Tab, 'id'>;
};

/** Authenticate browser-supplied sender metadata; never trust fields in the message. */
export function isSeekPageSender(sender: PageSender, extensionId: string): boolean {
  const url = seekUrl(sender.url);
  return (
    sender.id === extensionId &&
    sender.frameId === 0 &&
    Number.isInteger(sender.tab?.id) &&
    sender.tab!.id! >= 0 &&
    url !== null &&
    (sender.origin === undefined || sender.origin === url.origin)
  );
}

/** Extension actions are limited to public browsing surfaces, never profile/account pages. */
export function isSeekPublicSender(sender: PageSender, extensionId: string): boolean {
  return isSeekPageSender(sender, extensionId) && isSeekPublicPage(sender.url!);
}

/** Checks identity only: the content adapter must separately extract full JD details. */
export function validatePageAnalysis(
  message: PageAnalysisMessage,
  sender: PageSender,
  extensionId: string,
): boolean {
  if (!isSeekPublicSender(sender, extensionId)) return false;
  const pageId = getSeekJobId(sender.url);
  const source = seekUrl(message.draft.sourceUrl);
  if (!source || source.search || source.hash) return false;
  const sourceId = /^\/job\/([0-9]{1,20})$/.exec(source.pathname)?.[1];
  if (!sourceId || message.draft.sourceUrl !== `${source.origin}/job/${sourceId}`) return false;
  if (pageId) return sourceId === pageId;
  // Homepage recommendations open a full modal without changing the URL.
  // The trusted content adapter, not this metadata check, verifies its heading
  // and application link before allowing the user's explicit analysis click.
  const page = seekUrl(sender.url)!;
  return message.surface === 'dialog' && page.pathname === '/' && !page.search && !page.hash;
}

/** SPA navigation can leave sender.url at the document's initial address. */
export function validateCurrentPageAnalysis(
  message: PageAnalysisMessage,
  sender: PageSender,
  currentTab: Pick<chrome.tabs.Tab, 'id' | 'url'>,
  extensionId: string,
): boolean {
  if (!isSeekPageSender(sender, extensionId) || currentTab.id !== sender.tab?.id) return false;
  const original = seekUrl(sender.url);
  const current = seekUrl(currentTab.url);
  if (!original || !current || current.origin !== original.origin) return false;
  return validatePageAnalysis(message, { ...sender, url: current.href }, extensionId);
}
