import { z } from 'zod';
import type { ImageProviderPort, ImageRequest, ImageTask } from '../../../../contracts/src/imageProvider';
import { imageRequestSchema } from './capabilities';
export const officialBases = ['https://grsaiapi.com', 'https://grsai.dakka.com.cn'] as const;
const remoteId = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/);
const taskSchema = z.object({ id: remoteId, status: z.enum(['running', 'succeeded', 'failed', 'violation']), progress: z.number().min(0).max(100).optional(), results: z.array(z.object({ url: z.string().url().refine(value => new URL(value).protocol === 'https:') })).max(1).optional() }).refine(task => task.status !== 'succeeded' || task.results?.length === 1);
export class GrsaiError extends Error {
  constructor(readonly code: string, readonly remoteId?: string) { super(code); this.name = 'GrsaiError'; }
}
export class GrsaiClient implements ImageProviderPort {
  private readonly transport: typeof fetch;
  private readonly base: string;
  constructor(private readonly options: { apiKey: string; baseUrl?: typeof officialBases[number]; transport?: typeof fetch }) {
    this.base = options.baseUrl ?? officialBases[1];
    if (!(officialBases as readonly string[]).includes(this.base)) throw new GrsaiError('INVALID_BASE_URL');
    if (!options.apiKey.trim()) throw new GrsaiError('CREDENTIAL_NOT_FOUND');
    this.transport = options.transport ?? fetch;
  }
  async submit(request: ImageRequest): Promise<ImageTask> {
    const parsed = imageRequestSchema.safeParse(request);
    if (!parsed.success) throw new GrsaiError('INVALID_REQUEST');
    return this.request('/v1/api/generate', { method: 'POST', body: JSON.stringify({ ...parsed.data, replyType: 'async' }) });
  }
  async get(id: string): Promise<ImageTask> {
    if (!remoteId.safeParse(id).success) throw new GrsaiError('INVALID_REMOTE_ID');
    const result=await this.request(`/v1/api/result?id=${encodeURIComponent(id)}`, { method: 'GET' });
    if(result.id!==id)throw new GrsaiError('RESULT_ID_MISMATCH');
    return result;
  }
  private async request(path: string, init: RequestInit): Promise<ImageTask> {
    let response: Response;
    let raw: unknown;
    try {
      response = await this.transport(this.base + path, { ...init, redirect: 'error', headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000) });
      const reader = response.body?.getReader();
      if (!reader) throw new GrsaiError('INVALID_RESPONSE');
      const chunks: Uint8Array[] = []; let length = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 1024 * 1024) throw new GrsaiError('INVALID_RESPONSE'); chunks.push(value); } }
      finally { await reader.cancel().catch(() => {}); }
      try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new GrsaiError(response.ok ? 'INVALID_RESPONSE' : `HTTP_${response.status}`); }
    } catch (error) { if (error instanceof GrsaiError) throw error; throw new GrsaiError('NETWORK_UNKNOWN'); }
    const id = z.object({ id: remoteId }).safeParse(raw);
    if (!response.ok) throw new GrsaiError(`HTTP_${response.status}`, id.success ? id.data.id : undefined);
    const parsed = taskSchema.safeParse(raw);
    if (!parsed.success) throw new GrsaiError('INVALID_RESPONSE', id.success ? id.data.id : undefined);
    return parsed.data;
  }
}
