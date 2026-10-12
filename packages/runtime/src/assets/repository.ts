import type { DatabaseSync } from 'node:sqlite';
import { AssetVersionSchema, DomainError, IdSchema, type AssetVersion } from '../../../contracts/src';
export type Orientation = { orientation: number; originalWidth: number; originalHeight: number } | null;
export class AssetRepository {
  constructor(readonly db: DatabaseSync) {}
  requireProject(projectId: string) {
    if (!this.db.prepare('SELECT id FROM projects WHERE id = ?').get(IdSchema.parse(projectId))) throw new DomainError('NOT_FOUND', 'Project does not exist');
  }
  insert(version: AssetVersion, fileName: string, orientation: Orientation): AssetVersion {
    const value = AssetVersionSchema.parse(version);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.requireProject(value.projectId);
      this.db.prepare('INSERT INTO assets (id, project_id, file_name) VALUES (?, ?, ?)').run(value.assetId, value.projectId, fileName.slice(0, 255));
      this.db.prepare('INSERT INTO asset_versions (id, asset_id, project_id, hash, metadata, orientation) VALUES (?, ?, ?, ?, ?, ?)').run(value.id, value.assetId, value.projectId, value.hash, JSON.stringify(value), JSON.stringify(orientation));
      this.db.exec('COMMIT'); return value;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(versionId: string, projectId?: string): AssetVersion {
    const row = this.db.prepare('SELECT metadata, project_id FROM asset_versions WHERE id = ?').get(IdSchema.parse(versionId));
    if (!row || (projectId !== undefined && row.project_id !== projectId)) throw new DomainError('NOT_FOUND', 'Asset version does not exist');
    return AssetVersionSchema.parse(JSON.parse(String(row.metadata)));
  }
  orientation(versionId: string): Orientation {
    this.get(versionId);
    return JSON.parse(String(this.db.prepare('SELECT orientation FROM asset_versions WHERE id = ?').get(versionId)!.orientation));
  }
  list(projectId: string): AssetVersion[] {
    this.requireProject(projectId);
    return this.db.prepare('SELECT v.metadata FROM asset_versions v JOIN assets a ON a.id = v.asset_id WHERE v.project_id = ? AND a.trashed_at IS NULL ORDER BY v.rowid').all(projectId).map(row => AssetVersionSchema.parse(JSON.parse(String(row.metadata))));
  }
  addReference(input: { projectId: string; versionId: string; ownerId: string; kind: 'canvas' | 'run'; active?: boolean }) {
    const version = this.get(input.versionId, input.projectId);
    if (!input.ownerId || input.ownerId.length > 200) throw new DomainError('INVALID_INPUT', 'Invalid reference owner');
    if (this.db.prepare('SELECT trashed_at FROM assets WHERE id = ?').get(version.assetId)!.trashed_at) throw new DomainError('ASSET_TRASHED', 'Restore the asset before referencing it');
    this.db.prepare('INSERT INTO asset_references VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id, version_id, owner_id) DO UPDATE SET kind=excluded.kind, active=excluded.active').run(input.projectId, input.versionId, input.ownerId, input.kind, Number(input.active ?? false));
  }
  removeReference(projectId: string, ownerId: string, versionId: string) {
    this.get(versionId, projectId);
    this.db.prepare('DELETE FROM asset_references WHERE project_id = ? AND owner_id = ? AND version_id = ?').run(projectId, ownerId, versionId);
  }
  hasHash(hash: string) { return Boolean(this.db.prepare('SELECT 1 FROM asset_versions WHERE hash = ? LIMIT 1').get(hash)); }
}
