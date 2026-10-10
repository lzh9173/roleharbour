import { z } from 'zod';
import { draftSchema } from './schema';

import { SEEK_MATCHES, isSeekPublicPage, parseSeekUrl as seekUrl } from './seek-url';

/** This bridge never accepts credentials, arbitrary tools, URLs to fetch, or library requests. */
export const pageMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('page:language') }).strict(),
  z.object({ type: z.literal('page:open-settings') }).strict(),
  z
    .object({
      type: z.literal('page:employers'),
      names: z.array(z.string().trim().min(2).max(240)).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal('page:local'),
      title: draftSchema.shape.title,
      body: draftSchema.shape.body,
    })
    .strict(),
]);
export type PageMessage = z.infer<typeof pageMessageSchema>;
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

/** Sends a payload-free notice to every open public SEEK page; closed or private tabs are skipped. */
export async function broadcastToSeekTabs(message: { type: string }): Promise<void> {
  const tabs = await chrome.tabs.query({ url: SEEK_MATCHES });
  await Promise.all(
    tabs.map(async (tab) => {
      if (
        !isSeekPublicSender(
          { id: chrome.runtime.id, frameId: 0, url: tab.url, tab },
          chrome.runtime.id,
        )
      )
        return;
      await chrome.tabs.sendMessage(tab.id!, message, { frameId: 0 }).catch(() => undefined);
    }),
  );
}
