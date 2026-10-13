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
  it('validates dedicated batch and immutable text methods without paths or generic IPC',()=>{
    const projectId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    expect(()=>parseRequest('importImages',{projectId,files:[{name:'x.png',bytes:new Uint8Array([1])}]})).not.toThrow();
    expect(()=>parseRequest('saveTextVersion',{projectId,assetId:projectId,text:'new'})).not.toThrow();
    expect(()=>parseRequest('importImages',{projectId,files:[{name:'x.png',bytes:new Uint8Array([1]),path:'/tmp/private'}]})).toThrow();
    expect(()=>parseRequest('importImages',{projectId,files:Array.from({length:101},()=>({name:'x',bytes:new Uint8Array([1])}))})).toThrow();
    expect(()=>parseRequest('saveTextVersion',{projectId,assetId:projectId,text:'x'.repeat(1_000_001)})).toThrow();
  });
});
