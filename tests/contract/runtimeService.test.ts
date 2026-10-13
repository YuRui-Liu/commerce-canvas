import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeService } from '../../packages/runtime/src/service';
it('persists settings, rejects malformed RPC and returns structured project aggregates', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'cc-runtime-'));
  let service = new RuntimeService(directory);
  const call = (method: string, payload = {}) => service.dispatch({ id: randomUUID(), method, payload });
  try {
    await call('setTheme', { theme: 'editorial' });
    const project = await call('createProject', { name: 'Persistent' }) as { id: string };
    await expect(call('updateProject', { projectId: project.id, expectedRevision: 1, update: { facts: { color: 'red' } } })).resolves.toMatchObject({ revision: 2 });
    await expect(call('getProject', { projectId: project.id })).resolves.toMatchObject({ project: { facts: { color: 'red' } }, skus: [], brand: null });
    await expect(call('setTheme', { theme: 'wrong' })).rejects.toThrow();
    await expect(service.dispatch({ id: 'invalid', method: 'health', payload: {} })).rejects.toThrow();
    await expect(call('decrypt')).rejects.toThrow();
    await service.close(); service = new RuntimeService(directory);
    await expect(call('getTheme')).resolves.toBe('editorial');
    await expect(call('listProjects')).resolves.toHaveLength(1);
  } finally { await service.close(); rmSync(directory, { recursive: true, force: true }); }
});
