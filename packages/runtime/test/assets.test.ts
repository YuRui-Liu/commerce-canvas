import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { openDatabase } from '../src/db/open';
import { ProjectRepository } from '../src/projects/repository';
import { AssetService } from '../src/assets/import';
import { createAssetHandler, registerAssetProtocol } from '../../../apps/desktop/src/main/assetProtocol';
let directory: string, db: ReturnType<typeof openDatabase>, service: AssetService, projectId: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'cc-assets-')); db = openDatabase(join(directory, 'db')); projectId = new ProjectRepository(db).create('Test').id; service = new AssetService(db, directory); });
afterEach(async () => { await service?.thumbnails.drain(); db?.close(); rmSync(directory, { recursive: true, force: true }); });
const image = () => sharp({ create: { width: 80, height: 40, channels: 3, background: 'red' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
it('deduplicates immutable original bytes with independent references under concurrency', async () => {
  const bytes = await image(); const [a,b] = await Promise.all([service.importImage({ projectId, bytes, fileName: '../../evil' }),service.importImage({ projectId, bytes, fileName: 'other.jpg' })]);
  expect(a.hash).toBe(b.hash); expect(a.assetId).not.toBe(b.assetId); expect(a.id).not.toBe(b.id); expect(await service.read(a.id)).toEqual(bytes);
  expect(readdirSync(join(directory, 'assets', 'originals'))).toHaveLength(1);
  await service.thumbnails.drain(); const meta = await sharp(await service.read(a.id, 'thumbnail')).metadata(); expect(meta.width).toBe(40); expect(meta.height).toBe(80);
  expect(service.repository.orientation(a.id)).toMatchObject({ orientation: 6, originalWidth: 80, originalHeight: 40 });
});
it('rejects invalid images and missing projects without database references', async () => {
  await expect(service.importImage({ projectId, bytes: Buffer.from('fake'), fileName: 'x.png' })).rejects.toThrow();
  await expect(service.importImage({ projectId: '00000000-0000-4000-8000-000000000000', bytes: await image(), fileName: 'x' })).rejects.toThrow();
  expect(db.prepare('SELECT * FROM asset_versions').all()).toHaveLength(0);
});
it('stores text as text and guards references, trash and project isolation', async () => {
  const a = service.importText({ projectId, text: '文字 🐈' }); expect((await service.read(a.id)).toString()).toBe('文字 🐈');
  service.repository.addReference({ projectId, versionId: a.id, ownerId: 'node-1', kind: 'canvas' });
  service.repository.removeReference(projectId, 'node-1', a.id); expect(await service.read(a.id)).toBeDefined();
  service.repository.addReference({ projectId, versionId: a.id, ownerId: 'run-1', kind: 'run', active: true });
  expect(() => service.trashAsset(projectId, a.assetId)).toThrow(/ACTIVE_REFERENCE/);
  service.repository.removeReference(projectId, 'run-1', a.id); service.trashAsset(projectId, a.assetId); service.restoreAsset(projectId, a.assetId);
  const other = new ProjectRepository(db).create('Other').id;
  expect(() => service.trashAsset(other, a.assetId)).toThrow(/NOT_FOUND/);
  expect(() => service.repository.addReference({ projectId: other, versionId: a.id, ownerId: 'x', kind: 'canvas' })).toThrow(/NOT_FOUND/);
});
it('protocol rejects traversal, unknown ids, foreign projects and invalid variants', async () => {
  const a = service.importText({ projectId, text: 'hello' }); const handler = createAssetHandler(service, () => projectId);
  expect((await handler({ url: `commerce-asset://asset/${a.id}/original` })).status).toBe(200);
  for (const url of ['commerce-asset://asset/../original', `commerce-asset://asset/${a.id}/../../x`, `commerce-asset://asset/${a.id}/evil`, 'commerce-asset://asset/00000000-0000-4000-8000-000000000000/original']) expect((await handler({ url })).status).toBeGreaterThanOrEqual(400);
  expect((await createAssetHandler(service, () => '00000000-0000-4000-8000-000000000000')({ url: `commerce-asset://asset/${a.id}/original` })).status).toBe(404);
});
it('soft deletion and cleanup preserve another reference to the same content', async () => {
  const bytes = await image(); const a = await service.importImage({ projectId, bytes, fileName: 'a' }); const b = await service.importImage({ projectId, bytes, fileName: 'b' });
  service.trashAsset(projectId, a.assetId); await service.cleanupUnreferenced(); expect(await service.read(b.id)).toEqual(bytes); service.restoreAsset(projectId, a.assetId); expect(await service.read(a.id)).toEqual(bytes);
});
it('rolls back failed inserts and cleans orphan bytes only after their retention period', async () => {
  db.exec("CREATE TRIGGER reject_asset BEFORE INSERT ON asset_versions BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  await expect(service.importImage({ projectId, bytes: await image(), fileName: 'x' })).rejects.toThrow(/injected failure/);
  expect(db.prepare('SELECT * FROM assets').all()).toHaveLength(0);
  expect(db.prepare('SELECT * FROM asset_versions').all()).toHaveLength(0);
  expect(await service.cleanupUnreferenced()).toBe(0);
  expect(await service.cleanupUnreferenced(0)).toBe(1);
});
it('rejects symlinked managed directories and truncated images', async () => {
  const bytes = await image();
  await expect(service.importImage({ projectId, bytes: bytes.subarray(0, bytes.length - 80), fileName: 'bad.jpg' })).rejects.toThrow();
  rmSync(join(directory, 'assets', 'originals'), { recursive: true });
  const elsewhere = mkdtempSync(join(tmpdir(), 'cc-elsewhere-'));
  try { symlinkSync(elsewhere, join(directory, 'assets', 'originals'));
    await expect(service.importImage({ projectId, bytes, fileName: 'x' })).rejects.toThrow(/INVALID_PATH/);
    expect(readdirSync(elsewhere)).toHaveLength(0);
  } finally { rmSync(elsewhere, { recursive: true }); }
});
it('bounds size and pixels and exposes a testable protocol registration boundary', async () => {
  await expect(service.importImage({ projectId, bytes: Buffer.alloc(50 * 1024 * 1024 + 1), fileName: 'big' })).rejects.toThrow(/INVALID_IMAGE/);
  const large = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: 'white' } }).png().toBuffer();
  await expect(service.importImage({ projectId, bytes: large, fileName: 'pixels' })).rejects.toThrow(/pixel limit/);
  let registered = ''; registerAssetProtocol({ handle: scheme => { registered = scheme; } }, service, () => projectId); expect(registered).toBe('commerce-asset');
});
it('prevents a new run reference while an asset is trashed', async () => {
  const a = await service.importImage({ projectId, bytes: await image(), fileName: 'orientation.jpg' });
  await service.thumbnails.drain();
  service.trashAsset(projectId, a.assetId);
  expect(() => service.repository.addReference({ projectId, versionId: a.id, ownerId: 'run', kind: 'run', active: true })).toThrow(/ASSET_TRASHED/);
  // Defend restore as well when legacy/imported records contain an active reference.
  db.prepare('INSERT INTO asset_references VALUES (?, ?, ?, ?, ?)').run(projectId, a.id, 'legacy-run', 'run', 1);
  expect(() => service.restoreAsset(projectId, a.assetId)).toThrow(/ACTIVE_REFERENCE/);
});
