/** Structural type permits security tests without loading Electron in Node. */
export function validateSender(event: { sender: unknown; senderFrame: unknown }, expected: { mainFrame: { url: string } }, allowedUrl: string) {
  if (event.sender !== expected || event.senderFrame !== expected.mainFrame || expected.mainFrame.url !== allowedUrl) throw new Error('UNTRUSTED_SENDER');
}
