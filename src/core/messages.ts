/** An extension page opened as a tab has sender.tab too; authenticate its URL. */
export function isTrustedSender(
  sender: Pick<chrome.runtime.MessageSender, 'id' | 'url'>,
  extensionId: string,
): boolean {
  const workspace = `chrome-extension://${extensionId}/sidepanel.html`;
  return (
    sender.id === extensionId &&
    (sender.url === workspace || sender.url === `${workspace}#settings`)
  );
}
