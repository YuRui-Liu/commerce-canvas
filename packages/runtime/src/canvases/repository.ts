import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { CanvasDocumentSchema, PanelStateSchema, emptyPanel, type CanvasDocument, type CanvasRecord, type CanvasSummary, type PanelState } from '../../../contracts/src/canvas';
import { IdSchema, NameSchema, RevisionSchema } from '../../../contracts/src/domain';
import { DomainError } from '../../../contracts/src/errors';

export class CanvasRepository {
  constructor(private readonly db: DatabaseSync) {}
  private project(id: string) {
    IdSchema.parse(id);
    if (!this.db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw new DomainError('NOT_FOUND', 'Project not found');
  }
  list(projectId: string): CanvasSummary[] {
    this.project(projectId);
    return this.db.prepare('SELECT id,name,revision FROM canvases WHERE project_id=? ORDER BY rowid').all(projectId) as CanvasSummary[];
  }
  load(projectId: string, id: string): CanvasRecord {
    this.project(projectId);
    const row = this.db.prepare('SELECT * FROM canvases WHERE id=? AND project_id=?').get(id, projectId);
    if (!row) throw new DomainError('NOT_FOUND', 'Canvas not found');
    return { name: String(row.name), document: CanvasDocumentSchema.parse(JSON.parse(String(row.document))), panel: PanelStateSchema.parse(JSON.parse(String(row.panel))) };
  }
  create(projectId: string, name: string): CanvasRecord {
    this.project(projectId); name = NameSchema.parse(name);
    const document: CanvasDocument = { id: randomUUID(), projectId, revision: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const panel = emptyPanel();
    this.db.prepare('INSERT INTO canvases VALUES (?,?,?,?,?,?)').run(document.id, projectId, name, 1, JSON.stringify(document), JSON.stringify(panel));
    return { name, document, panel };
  }
  selected(projectId: string): string | null {
    this.project(projectId);
    const row = this.db.prepare('SELECT canvas_id FROM canvas_selection WHERE project_id=?').get(projectId);
    return row ? String(row.canvas_id) : null;
  }
  select(projectId: string, id: string) {
    this.load(projectId, id);
    this.db.prepare('INSERT INTO canvas_selection VALUES (?,?) ON CONFLICT(project_id) DO UPDATE SET canvas_id=excluded.canvas_id').run(projectId, id);
    return id;
  }
  save(projectId: string, input: CanvasDocument, context: PanelState, expectedRevision: number): CanvasRecord {
    this.project(projectId); RevisionSchema.parse(expectedRevision);
    const document = CanvasDocumentSchema.parse(input), panel = PanelStateSchema.parse(context);
    if (document.projectId !== projectId) throw new DomainError('INVALID_REFERENCE', 'Canvas project mismatch');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.load(projectId, document.id);
      if (existing.document.revision !== expectedRevision) throw new DomainError('REVISION_CONFLICT', 'Canvas changed; keep the draft or reload');
      const versions = new Set([...document.nodes, ...panel.messages.flatMap(m => m.selectedNodes)].flatMap(n => n.assetVersionId ? [n.assetVersionId] : []));
      for(const node of [...document.nodes,...panel.messages.flatMap(m=>m.selectedNodes)]) {
        if(node.agentDefinitionId)throw new DomainError('INVALID_REFERENCE','Agent definition is unavailable');
        if(node.runId){
          const run=this.db.prepare('SELECT canvas_id,node_id FROM image_runs WHERE id=? AND project_id=?').get(node.runId,projectId);
          if(!run||run.canvas_id!==document.id||(node.kind!=='output'&&(node.kind!=='generation'||run.node_id!==node.id)))throw new DomainError('INVALID_REFERENCE','Run must belong to this canvas and generation node');
          if(node.kind==='output'&&node.assetVersionId&&!this.db.prepare('SELECT 1 FROM generation_outputs WHERE run_id=? AND version_id=? AND project_id=?').get(node.runId,node.assetVersionId,projectId))throw new DomainError('INVALID_REFERENCE','Output version must belong to run');
        }
      }
      for (const id of versions) {
        if (!this.db.prepare('SELECT id FROM asset_versions WHERE id=? AND project_id=?').get(id, projectId)) throw new DomainError('INVALID_REFERENCE', 'Asset version must belong to this project');
      }
      const next = { ...document, revision: expectedRevision + 1 };
      this.db.prepare('UPDATE canvases SET revision=?,document=?,panel=? WHERE id=? AND project_id=?').run(next.revision, JSON.stringify(next), JSON.stringify(panel), document.id, projectId);
      this.db.prepare("DELETE FROM asset_references WHERE project_id=? AND owner_id=? AND kind='canvas'").run(projectId, document.id);
      for (const id of versions) this.db.prepare("INSERT INTO asset_references VALUES (?,?,?,'canvas',1)").run(projectId, id, document.id);
      this.db.exec('COMMIT');
      return { name: existing.name, document: next, panel };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
