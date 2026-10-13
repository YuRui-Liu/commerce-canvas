import { it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { runGrsaiVerification } from '../../apps/desktop/src/main/grsaiVerification';
import { GrsaiError } from '../../packages/runtime/src/providers/grsai/client';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function directory() { const path = await mkdtemp(join(tmpdir(), 'cc-grsai-')); directories.push(path); return path; }
it('durably records before POST, archives verified bytes without sending key to image host, and never submits twice', async () => {
  const path = await directory();
  const bytes = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#3659df' } }).png().toBuffer();
  const provider = { submit: vi.fn(async (request: unknown) => { expect(JSON.parse(await readFile(join(path, 'journal.json'), 'utf8')).state).toBe('submitting'); expect(request).toMatchObject({ images: [expect.stringMatching(/^data:image\/png;base64,/)] }); return { id: 'remote-test-id', status: 'running' as const }; }), get: vi.fn(async () => ({ id: 'remote-test-id', status: 'succeeded' as const, results: [{ url: 'https://images.example/test.png' }] })) };
  const transport = vi.fn(async (_url, options) => { expect(options.headers).toBeUndefined(); return new Response(bytes); }) as unknown as typeof fetch;
  const deps = { provider, transport, sleep: async () => {} };
  const result = await runGrsaiVerification(path, 'private-secret', deps);
  expect(result).toMatchObject({ status: 'archived', width: 1024, height: 1024 });
  expect(await readFile(result.output!)).toEqual(bytes);
  const evidence = await readFile(join(path, 'evidence.json'), 'utf8');
  expect(evidence).not.toContain('private-secret'); expect(evidence).not.toContain('remote-test-id'); expect(evidence).not.toContain('images.example');
  await runGrsaiVerification(path, 'private-secret', deps); expect(provider.submit).toHaveBeenCalledTimes(1);
});
it('ambiguous submit cannot be retried on restart', async () => {
  const path = await directory(); const provider = { submit: vi.fn(async () => { throw new GrsaiError('NETWORK_UNKNOWN'); }), get: vi.fn() };
  await expect(runGrsaiVerification(path, 'x', { provider })).rejects.toThrow('NETWORK_UNKNOWN');
  await expect(runGrsaiVerification(path, 'x', { provider })).rejects.toThrow('SUBMISSION_UNKNOWN_NO_RESUBMIT'); expect(provider.submit).toHaveBeenCalledTimes(1);
});
it('HTTP failure with known ID resumes query only and respects terminal failure', async () => {
  const path = await directory(); const provider = { submit: vi.fn(async () => { throw new GrsaiError('HTTP_400', 'known-id'); }), get: vi.fn(async () => ({ id: 'known-id', status: 'failed' as const })) };
  await expect(runGrsaiVerification(path, 'x', { provider })).rejects.toThrow('HTTP_400');
  await expect(runGrsaiVerification(path, 'x', { provider, sleep: async () => {} })).rejects.toThrow('REMOTE_FAILED'); expect(provider.submit).toHaveBeenCalledTimes(1); expect(provider.get).toHaveBeenCalledTimes(1);
});
it('an exclusive lock prevents concurrent submissions', async () => {
  const path = await directory(); await writeFile(join(path, 'verification.lock'), '{}');
  const provider = { submit: vi.fn(), get: vi.fn() };
  await expect(runGrsaiVerification(path, 'x', { provider })).rejects.toThrow('VERIFICATION_LOCKED'); expect(provider.submit).not.toHaveBeenCalled();
});
it('failed image download retains the task and resumes download without resubmission', async () => {
  const path = await directory(); const provider = { submit: vi.fn(async () => ({ id: 'image-id', status: 'succeeded' as const, results: [{ url: 'https://images.example/image' }] })), get: vi.fn() };
  const transport = vi.fn(async () => new Response('not an image')) as unknown as typeof fetch;
  await expect(runGrsaiVerification(path, 'x', { provider, transport })).rejects.toThrow('VERIFICATION_FAILED');
  await expect(runGrsaiVerification(path, 'x', { provider, transport })).rejects.toThrow('VERIFICATION_FAILED'); expect(provider.submit).toHaveBeenCalledTimes(1); expect(provider.get).not.toHaveBeenCalled();
});
it('wrong output dimensions cannot be accepted as successful validation', async () => {
  const path = await directory(); const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
  const provider = { submit: vi.fn(async () => ({ id: 'wrong-size-id', status: 'succeeded' as const, results: [{ url: 'https://images.example/image' }] })), get: vi.fn() };
  await expect(runGrsaiVerification(path, 'x', { provider, transport: async () => new Response(bytes) })).rejects.toThrow('OUTPUT_DIMENSIONS_MISMATCH');
  expect(JSON.parse(await readFile(join(path, 'journal.json'), 'utf8'))).toMatchObject({ state: 'succeeded', remoteId: 'wrong-size-id' });
});
it('poll timeout leaves known ID resumable with no additional POST', async () => {
  const path = await directory(); const provider = { submit: vi.fn(async () => ({ id: 'waiting-id', status: 'running' as const })), get: vi.fn(async () => ({ id: 'waiting-id', status: 'violation' as const })) };
  await expect(runGrsaiVerification(path, 'x', { provider, timeoutMs: 0 })).rejects.toThrow('POLL_TIMEOUT_RESUME_SAME_DIRECTORY');
  await expect(runGrsaiVerification(path, 'x', { provider, sleep: async () => {} })).rejects.toThrow('REMOTE_VIOLATION'); expect(provider.submit).toHaveBeenCalledTimes(1);
});
