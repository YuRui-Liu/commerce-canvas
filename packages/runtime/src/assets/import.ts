import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { DomainError, type AssetVersion } from '../../../contracts/src';
import { AssetRepository } from './repository';
import { ThumbnailQueue } from './thumbnails';
import { setAssetTrashed } from './trash';
export type AssetVariant = 'original' | 'thumbnail';
const hashBytes = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export class AssetService {
  readonly repository: AssetRepository;
  readonly thumbnails = new ThumbnailQueue();
  readonly dataRoot: string;
  constructor(db: DatabaseSync, dataRoot: string) {
    if (!isAbsolute(dataRoot)) throw new DomainError('INVALID_PATH', 'Data root must be absolute');
    mkdirSync(dataRoot, { recursive: true }); this.dataRoot = realpathSync(dataRoot);
    this.repository = new AssetRepository(db);
    for (const directory of ['assets', 'assets/originals', 'assets/thumbnails']) {
      const path = join(this.dataRoot, directory);
      if (!existsSync(path)) mkdirSync(path);
      if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new DomainError('INVALID_PATH', 'Unsafe asset directory');
    }
  }
  private path(hash: string, variant: AssetVariant): string {
    if (!/^[a-f0-9]{64}$/.test(hash) || !['original', 'thumbnail'].includes(variant)) throw new DomainError('INVALID_PATH', 'Invalid asset path');
    const directory = join(this.dataRoot, 'assets', variant === 'original' ? 'originals' : 'thumbnails');
    if (realpathSync(directory) !== resolve(directory)) throw new DomainError('INVALID_PATH', 'Unsafe asset directory');
    const path = join(directory, hash);
    if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw new DomainError('INVALID_PATH', 'Unsafe asset file');
    return path;
  }
  private store(hash: string, variant: AssetVariant, bytes: Buffer) {
    const target = this.path(hash, variant);
    if (existsSync(target)) {
      if (variant === 'original' && hashBytes(readFileSync(target)) !== hash) throw new DomainError('CORRUPT_ASSET', 'Stored content hash mismatch');
      return;
    }
    const temporary = `${target}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 }); renameSync(temporary, target); }
    finally { rmSync(temporary, { force: true }); }
  }
  async importImage(input: { projectId: string; bytes: Uint8Array; fileName: string }): Promise<AssetVersion> {
    this.repository.requireProject(input.projectId);
    if (input.bytes.byteLength === 0 || input.bytes.byteLength > 50 * 1024 * 1024) throw new DomainError('INVALID_IMAGE', 'Image must be between 1 byte and 50 MB');
    const bytes = Buffer.from(input.bytes);
    const decoder = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const metadata = await decoder.metadata();
    const mimes: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', heif: 'image/heif', tiff: 'image/tiff', gif: 'image/gif' };
    const mime = metadata.format && mimes[metadata.format];
    if (!mime || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || metadata.width > 100_000 || metadata.height > 100_000) throw new DomainError('INVALID_IMAGE', 'Unsupported image');
    // Metadata alone does not verify a complete image. Force a full bounded decode.
    await decoder.clone().raw().toBuffer();
    this.repository.requireProject(input.projectId);
    const hash = hashBytes(bytes), orientation = metadata.orientation ?? 1;
    const swap = orientation >= 5 && orientation <= 8;
    const version: AssetVersion = { id: randomUUID(), assetId: randomUUID(), projectId: input.projectId, kind: 'image', hash, mime, relativePath: `assets/originals/${hash}`, text: null, width: swap ? metadata.height : metadata.width, height: swap ? metadata.width : metadata.height, createdAt: new Date().toISOString() };
    // Commit managed bytes before the SQLite reference. A failed insert can leave only an orphan,
    // which delayed cleanup handles; it must never remove content shared with another version.
    this.store(hash, 'original', bytes);
    const result = this.repository.insert(version, input.fileName, { orientation, originalWidth: metadata.width, originalHeight: metadata.height });
    this.thumbnails.enqueue(hash, () => readFileSync(this.path(hash, 'original')), thumbnail => this.store(hash, 'thumbnail', thumbnail));
    return result;
  }
  importText(input: { projectId: string; text: string; fileName?: string }): AssetVersion {
    if (typeof input.text !== 'string' || input.text.length > 1_000_000) throw new DomainError('INVALID_INPUT', 'Text is too large');
    return this.repository.insert({ id: randomUUID(), assetId: randomUUID(), projectId: input.projectId, kind: 'text', hash: hashBytes(Buffer.from(input.text)), mime: 'text/plain', relativePath: null, text: input.text, width: null, height: null, createdAt: new Date().toISOString() }, input.fileName ?? 'Text', null);
  }
  async read(versionId: string, variant: AssetVariant = 'original', projectId?: string): Promise<Buffer> {
    if (variant !== 'original' && variant !== 'thumbnail') throw new DomainError('INVALID_INPUT', 'Unknown asset variant');
    const version = this.repository.get(versionId, projectId);
    if (version.kind === 'text') {
      if (variant !== 'original') throw new DomainError('NOT_FOUND', 'Text has no thumbnail');
      return Buffer.from(version.text!);
    }
    return readFileSync(this.path(version.hash, variant));
  }
  trashAsset(projectId: string, assetId: string) { setAssetTrashed(this.repository, projectId, assetId, true); }
  restoreAsset(projectId: string, assetId: string) { setAssetTrashed(this.repository, projectId, assetId, false); }
  async cleanupUnreferenced(minimumAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
    if (!Number.isFinite(minimumAgeMs) || minimumAgeMs < 0) throw new DomainError('INVALID_INPUT', 'Invalid cleanup age');
    await this.thumbnails.drain(); let removed = 0;
    for (const variant of ['original', 'thumbnail'] as const) {
      const directory = join(this.dataRoot, 'assets', variant === 'original' ? 'originals' : 'thumbnails');
      for (const hash of readdirSync(directory)) {
        if (!/^[a-f0-9]{64}$/.test(hash)) continue;
        const path = this.path(hash, variant);
        if (!this.repository.hasHash(hash) && Date.now() - statSync(path).mtimeMs >= minimumAgeMs) { rmSync(path); removed++; }
      }
    }
    return removed;
  }
}
