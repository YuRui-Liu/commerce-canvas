import { expect, it } from 'vitest';
import { acknowledge, SaveCoordinator } from './saveCoordinator';
it('acknowledges a committed local sequence without clearing later edits', () => {
  expect(acknowledge({ localRevision: 4, savedRevision: 2 }, 3)).toEqual({ localRevision: 4, savedRevision: 3 });
  expect(acknowledge({ localRevision: 4, savedRevision: 3 }, 5).savedRevision).toBe(3);
  expect(acknowledge({ localRevision: 4, savedRevision: 3 }, 2).savedRevision).toBe(3);
});
it('serializes delayed saves, keeps newest snapshot, and separates storage revision', async () => {
  const calls: { value: string; expected: number; done: (revision: number) => void }[] = [];
  const queue = new SaveCoordinator('initial', 9, (value, expected) => new Promise<number>(done => calls.push({ value, expected, done })));
  queue.edit('first'); const flush = queue.flush();
  queue.edit('latest viewport');
  expect(calls).toHaveLength(1);
  calls[0].done(10); await Promise.resolve(); await Promise.resolve();
  expect(queue.state).toEqual({ localRevision: 2, savedRevision: 1 });
  expect(calls[1]).toMatchObject({ value: 'latest viewport', expected: 10 });
  calls[1].done(11); await flush;
  expect(queue.dirty).toBe(false);
});
it('retains draft on conflict and does not retry or overwrite', async () => {
  let calls = 0;
  const queue = new SaveCoordinator('old', 1, async () => { calls++; throw Error('REVISION_CONFLICT'); });
  queue.edit('draft');
  await expect(queue.flush()).rejects.toThrow(/REVISION_CONFLICT/);
  await expect(queue.retry()).rejects.toThrow(/REVISION_CONFLICT/);
  await expect(queue.flush()).rejects.toThrow(/REVISION_CONFLICT/);
  expect(calls).toBe(1); expect(queue.dirty).toBe(true); expect(queue.value).toBe('draft');
});
it('requires an explicit retry after a transient failure and still uses expected revision', async () => {
  let calls = 0;
  const queue = new SaveCoordinator('old', 8, async (_value, revision) => {
    expect(revision).toBe(8); if (++calls === 1) throw Error('RUNTIME_TIMEOUT'); return 9;
  });
  queue.edit('draft'); await expect(queue.flush()).rejects.toThrow(/RUNTIME_TIMEOUT/);
  expect(calls).toBe(1); await queue.retry(); expect(queue.dirty).toBe(false);
});
