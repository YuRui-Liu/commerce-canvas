import { expect, test } from 'vitest';
import { probeRuntime } from './index';

test('probes a real SQLite round trip and Sharp pixel pipeline', async () => {
  const health = await probeRuntime();
  expect(health).toMatchObject({
    sqlite: { ok: true, value: 'commercecanvas' },
    sharp: { ok: true, width: 2, height: 2 },
  });
});
