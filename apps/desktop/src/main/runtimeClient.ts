import { randomUUID } from 'node:crypto';
import { RpcRequestSchema } from '../../../../packages/contracts/src/bridge';
interface Child { postMessage(message: unknown): void; on(event: 'message', listener: (message: any) => void): unknown; on(event: 'exit', listener: (code: number) => void): unknown }
export class RuntimeClient {
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private exited = false;
  constructor(private child: Child, private timeoutMs = 30_000) {
    child.on('message', message => {
      if (!message || typeof message.id !== 'string' || typeof message.ok !== 'boolean') return;
      const item = this.pending.get(message.id); if (!item) return;
      clearTimeout(item.timer); this.pending.delete(message.id);
      if (message.ok) item.resolve(message.result); else item.reject(new Error(typeof message.code === 'string' && /^[A-Z_]+$/.test(message.code) ? message.code : 'RUNTIME_ERROR'));
    });
    child.on('exit', () => { this.exited = true; for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('RUNTIME_EXITED')); } this.pending.clear(); });
  }
  request(method: string, payload: unknown = {}): Promise<any> {
    if (this.exited) return Promise.reject(new Error('RUNTIME_EXITED'));
    const request = RpcRequestSchema.parse({ id: randomUUID(), method, payload });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(request.id); reject(new Error('RUNTIME_TIMEOUT')); }, this.timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      try { this.child.postMessage(request); } catch { clearTimeout(timer); this.pending.delete(request.id); reject(new Error('RUNTIME_UNAVAILABLE')); }
    });
  }
}
