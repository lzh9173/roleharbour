/** An extension page opened as a tab has sender.tab too; authenticate its URL. */
export function isTrustedSender(
  sender: Pick<chrome.runtime.MessageSender, 'id' | 'url'>,
  extensionId: string,
): boolean {
  return (
    sender.id === extensionId && sender.url === `chrome-extension://${extensionId}/sidepanel.html`
  );
}

/** A payload-free broadcast such as 'employers:updated' from this extension's worker. Tabs
 * reach the same onMessage listeners, so anything sent from a content script is ignored. */
export function isWorkerNotice(
  message: unknown,
  sender: Pick<chrome.runtime.MessageSender, 'id' | 'tab'>,
  type: string,
  extensionId: string | undefined,
): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === type &&
    typeof sender.id === 'string' &&
    sender.id === extensionId &&
    !sender.tab
  );
}
