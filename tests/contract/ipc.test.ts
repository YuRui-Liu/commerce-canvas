import { describe, it, expect } from 'vitest';
import { parseRequest } from '../../packages/contracts/src/bridge';
import { validateSender } from '../../apps/desktop/src/main/ipc';
describe('IPC trust boundary', () => {
  it('rejects unknown methods, oversized text, invalid themes and extra fields', () => {
    for (const [method, payload] of [['decrypt', {}], ['setTheme', { theme: 'bad' }], ['health', { path: '/etc/passwd' }], ['saveText', { projectId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', text: 'x'.repeat(1_000_001) }]]) {
      expect(() => parseRequest(method, payload)).toThrow();
    }
  });
  it('requires exact window, main frame and URL', () => {
    const frame = { url: 'file:///app/index.html' }, sender = { mainFrame: frame };
    expect(() => validateSender({ sender, senderFrame: frame }, sender, frame.url)).not.toThrow();
    for (const event of [{ sender: {}, senderFrame: frame }, { sender, senderFrame: { ...frame } }, { sender, senderFrame: { url: 'https://evil.test' } }]) expect(() => validateSender(event, sender, frame.url)).toThrow();
    expect(() => validateSender({ sender, senderFrame: frame }, sender, 'file:///other.html')).toThrow();
  });
});
