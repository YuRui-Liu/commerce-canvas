import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { GrsaiClient, GrsaiError } from '../../../../packages/runtime/src/providers/grsai/client';
import type { ImageProviderPort, ImageTask } from '../../../../packages/contracts/src/imageProvider';

const journalSchema = z.object({ version: z.literal(1), startedAt: z.string(), state: z.enum(['submitting', 'running', 'succeeded', 'failed', 'violation', 'archived']), remoteId: z.string().optional(), url: z.string().optional(), output: z.string().optional() }).strict();
type Journal = z.infer<typeof journalSchema>;
export class VerificationError extends Error { constructor(readonly code: string) { super(code); } }
async function atomicJson(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { const file = await open(temp, 'wx', 0o600); try { await file.writeFile(JSON.stringify(value, null, 2)); await file.sync(); } finally { await file.close(); } await rename(temp, path); const directory = await open(dirname(path), 'r'); try { await directory.sync(); } finally { await directory.close(); } }
  finally { await unlink(temp).catch(() => {}); }
}
async function readJournal(path: string): Promise<Journal | undefined> {
  try { return journalSchema.parse(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new VerificationError('INVALID_VERIFICATION_JOURNAL'); }
}
async function download(url: string, transport: typeof fetch) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new VerificationError('INVALID_OUTPUT_URL');
  // No API credentials or cookies are passed to the independent image host.
  const response = await transport(url, { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new VerificationError('DOWNLOAD_FAILED');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const result = await reader.read(); if (result.done) break; length += result.value.length; if (length > 50 * 1024 * 1024) throw new VerificationError('OUTPUT_TOO_LARGE'); chunks.push(result.value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks);
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new VerificationError('INVALID_OUTPUT_IMAGE');
  if (metadata.width !== 1024 || metadata.height !== 1024) throw new VerificationError('OUTPUT_DIMENSIONS_MISMATCH');
  await image.stats(); // Decode all pixels; metadata alone accepts truncated images.
  return { bytes, width: metadata.width, height: metadata.height, format: metadata.format!, hash: createHash('sha256').update(bytes).digest('hex') };
}
/** Explicit operator verification only; this is not the production task outbox. */
export async function runGrsaiVerification(directory: string, apiKey: string, dependencies: { provider?: ImageProviderPort; transport?: typeof fetch; sleep?: (ms: number) => Promise<void>; timeoutMs?: number } = {}) {
  if (!isAbsolute(directory)) throw new VerificationError('INVALID_VERIFICATION_DIRECTORY');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, 'verification.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch { throw new VerificationError('VERIFICATION_LOCKED'); }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid })); await lock.sync();
    const path = join(directory, 'journal.json');
    let journal = await readJournal(path);
    if (journal?.state === 'archived') return { status: 'archived', output: journal.output };
    if (journal && !journal.remoteId) throw new VerificationError('SUBMISSION_UNKNOWN_NO_RESUBMIT');
    const provider = dependencies.provider ?? new GrsaiClient({ apiKey });
    const update = async (task: ImageTask) => {
      if (journal?.remoteId && journal.remoteId !== task.id) throw new VerificationError('REMOTE_ID_MISMATCH');
      journal = { version: 1, startedAt: journal!.startedAt, state: task.status, remoteId: task.id, ...(task.results?.[0] ? { url: task.results[0].url } : {}) };
      await atomicJson(path, journal);
    };
    if (!journal) {
      const reference = await sharp(Buffer.from('<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#eeeeee"/><rect x="360" y="240" width="304" height="590" rx="55" fill="#3659df"/><rect x="415" y="170" width="194" height="110" rx="18" fill="#20242d"/><rect x="385" y="425" width="254" height="160" rx="12" fill="white"/><text x="512" y="520" text-anchor="middle" font-family="Arial" font-size="48" fill="#20242d">CC TEST</text></svg>')).png().toBuffer();
      await writeFile(join(directory, 'reference.png'), reference, { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      journal = { version: 1, state: 'submitting', startedAt: new Date().toISOString() };
      await atomicJson(path, journal); // Durable before any potentially accepted POST.
      try {
        await update(await provider.submit({ model: 'gpt-image-2', quality: 'auto', aspectRatio: '1024x1024', prompt: 'Create one clean ecommerce product photo from the provided reference. Preserve the blue bottle shape and the exact label CC TEST. Place it on a warm white studio background with a soft natural contact shadow. Keep the complete bottle centered, no additional text, one image.', images: [`data:image/png;base64,${reference.toString('base64')}`] }));
      } catch (error) {
        if (error instanceof GrsaiError && error.remoteId) { journal = { ...journal, state: 'running', remoteId: error.remoteId }; await atomicJson(path, journal); }
        throw new VerificationError(error instanceof GrsaiError ? error.code : 'SUBMISSION_UNKNOWN_NO_RESUBMIT');
      }
    }
    const deadline = Date.now() + (dependencies.timeoutMs ?? 15 * 60 * 1000);
    const sleep = dependencies.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    while (journal!.state === 'running' || journal!.state === 'submitting') {
      if (Date.now() >= deadline) throw new VerificationError('POLL_TIMEOUT_RESUME_SAME_DIRECTORY');
      await sleep(5000);
      try { await update(await provider.get(journal!.remoteId!)); }
      catch (error) {
        if (error instanceof GrsaiError && error.code === 'NETWORK_UNKNOWN') continue;
        throw new VerificationError(error instanceof GrsaiError ? error.code : 'QUERY_FAILED');
      }
    }
    if (journal!.state !== 'succeeded' || !journal!.url) throw new VerificationError(`REMOTE_${journal!.state.toUpperCase()}`);
    const output = await download(journal!.url, dependencies.transport ?? fetch);
    const outputPath = join(directory, `output.${output.format === 'jpeg' ? 'jpg' : output.format}`);
    const temp = `${outputPath}.${randomUUID()}.tmp`;
    try { await writeFile(temp, output.bytes, { mode: 0o600, flag: 'wx' }); await rename(temp, outputPath); }
    finally { await unlink(temp).catch(() => {}); }
    await atomicJson(join(directory, 'evidence.json'), { model: 'gpt-image-2', startedAt: journal!.startedAt, completedAt: new Date().toISOString(), status: 'archived', remoteIdFingerprint: createHash('sha256').update(journal!.remoteId!).digest('hex').slice(0,12), outputSha256: output.hash, width: output.width, height: output.height, mime: `image/${output.format}`, referenceTransport: 'data:image/png;base64', outputCount: 1 });
    journal = { ...journal!, state: 'archived', output: outputPath }; await atomicJson(path, journal);
    return { status: 'archived', output: outputPath, sha256: output.hash, width: output.width, height: output.height };
  } catch (error) { if (error instanceof VerificationError) throw error; throw new VerificationError('VERIFICATION_FAILED'); }
  finally { await lock.close(); await unlink(lockPath); }
}
