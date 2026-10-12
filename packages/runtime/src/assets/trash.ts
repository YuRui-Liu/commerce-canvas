import { DomainError, IdSchema } from '../../../contracts/src';
import type { AssetRepository } from './repository';
export function setAssetTrashed(repository: AssetRepository, projectId: string, assetId: string, trashed: boolean): void {
  const db = repository.db;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT id FROM assets WHERE project_id = ? AND id = ?').get(IdSchema.parse(projectId), IdSchema.parse(assetId))) throw new DomainError('NOT_FOUND', 'Asset does not exist');
    if (db.prepare("SELECT 1 FROM asset_references r JOIN asset_versions v ON v.id = r.version_id WHERE v.asset_id = ? AND r.kind = 'run' AND r.active = 1 LIMIT 1").get(assetId)) throw new DomainError('ACTIVE_REFERENCE', 'Asset is used by an active run');
    db.prepare('UPDATE assets SET trashed_at = ? WHERE id = ?').run(trashed ? new Date().toISOString() : null, assetId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
