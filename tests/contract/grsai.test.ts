import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { GrsaiClient } from '../../packages/runtime/src/providers/grsai/client';
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
async function fixture(status: number, body: unknown, disconnect = false) {
  const calls: { url: string; method: string; auth: string | undefined; body: string }[] = [];
  const server = createServer(async (req, res) => {
    let input = ''; for await (const chunk of req) input += chunk;
    calls.push({ url: req.url!, method: req.method!, auth: req.headers.authorization, body: input });
    if (disconnect) { req.socket.destroy(); return; }
    res.writeHead(status, { 'content-type': 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  servers.push(server); await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address() as { port: number };
  // Explicit test-only transport redirects the official URL to the fixture.
  const transport: typeof fetch = (url, options) => fetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}${new URL(String(url)).search}`, options);
  return { client: new GrsaiClient({ apiKey: 'private-test-secret', transport }), calls };
}
const request = { model: 'gpt-image-2', prompt: 'Generic product', aspectRatio: '1024x1024', quality: 'auto' } as const;
describe('direct GRSai contract', () => {
  it('submits once with async and queries exact encoded ID, returning only allowed fields', async () => {
    const { client, calls } = await fixture(200, { id: 'task-1', status: 'succeeded', progress: 100, results: [{ url: 'https://images.example/test.png' }], balance: 12 });
    expect(await client.submit(request)).toEqual({ id: 'task-1', status: 'succeeded', progress: 100, results: [{ url: 'https://images.example/test.png' }] });
    await client.get('task-1');
    expect(calls[0].auth).toBe('Bearer private-test-secret'); expect(JSON.parse(calls[0].body)).toEqual({ ...request, replyType: 'async' });
    expect(calls[1].url).toBe('/v1/api/result?id=task-1'); expect(calls[1].method).toBe('GET');
  });
  it.each([401, 429])('sanitizes HTTP %s and never retries POST', async status => {
    const { client, calls } = await fixture(status, { error: 'private-test-secret', balance: 12 });
    await expect(client.submit(request)).rejects.toMatchObject({ code: `HTTP_${status}`, remoteId: undefined }); expect(calls).toHaveLength(1);
  });
  it('retains known remote ID on HTTP 400', async () => {
    const { client } = await fixture(400, { id: 'failed-task', status: 'failed', error: 'private-test-secret' });
    await expect(client.submit(request)).rejects.toMatchObject({ code: 'HTTP_400', remoteId: 'failed-task' });
  });
  it.each(['not JSON', { id: 'x', status: 'future' }, { id: 'x', status: 'succeeded', results: [] }])('rejects invalid response without raw server text', async body => {
    const { client } = await fixture(200, body); await expect(client.submit(request)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('network failure is unknown and does not retry', async () => {
    const { client, calls } = await fixture(200, {}, true); await expect(client.submit(request)).rejects.toMatchObject({ code: 'NETWORK_UNKNOWN' }); expect(calls).toHaveLength(1);
  });
  it('rejects unsupported arguments and unofficial base before network', async () => {
    const { client, calls } = await fixture(200, {});
    await expect(client.submit({ ...request, mask: 'x' } as never)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(client.submit({ ...request, quality: 'high' } as never)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(() => new GrsaiClient({ apiKey: 'x', baseUrl: 'https://proxy.example' as never })).toThrow('INVALID_BASE_URL'); expect(calls).toHaveLength(0);
  });
});
