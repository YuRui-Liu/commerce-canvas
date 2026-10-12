import sharp from 'sharp';
/** Serialized background work, bounded decoding, and an explicit drain for shutdown/tests. */
export class ThumbnailQueue {
  private pending: Promise<void> = Promise.resolve();
  readonly errors = new Map<string, Error>();
  enqueue(hash: string, read: () => Buffer, write: (bytes: Buffer) => void) {
    this.pending = this.pending.then(async () => {
      try {
        const bytes = await sharp(read(), { limitInputPixels: 40_000_000, failOn: 'warning' }).rotate().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
        write(bytes); this.errors.delete(hash);
      } catch (error) { this.errors.set(hash, error instanceof Error ? error : new Error(String(error))); }
    });
  }
  drain() { return this.pending; }
}
