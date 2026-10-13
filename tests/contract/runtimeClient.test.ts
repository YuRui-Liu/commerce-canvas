import { it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { RuntimeClient } from '../../apps/desktop/src/main/runtimeClient';
class Child extends EventEmitter { messages: any[] = []; postMessage(message: unknown) { this.messages.push(message); } }
it('correlates out-of-order responses and rejects all pending work on exit', async () => {
  const child = new Child(), client = new RuntimeClient(child, 100);
  const a = client.request('health'), b = client.request('getTheme');
  child.emit('message', { id: child.messages[1].id, ok: true, result: 'studio' });
  child.emit('message', { id: child.messages[0].id, ok: true, result: 'health' });
  expect(await a).toBe('health'); expect(await b).toBe('studio');
  const pending = client.request('health'); const assertion = expect(pending).rejects.toThrow('RUNTIME_EXITED');
  child.emit('exit', 1); await assertion; await expect(client.request('health')).rejects.toThrow('RUNTIME_EXITED');
});
it('times out without waiting forever', async () => { await expect(new RuntimeClient(new Child(), 10).request('health')).rejects.toThrow('RUNTIME_TIMEOUT'); });
