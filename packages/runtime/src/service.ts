import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from './db/open';
import { ProjectRepository } from './projects/repository';
import { AssetService } from './assets/import';
import { SettingsRepository } from './settings/repository';
import { CanvasRepository } from './canvases/repository';
import { probeRuntime } from './index';
import { internalSchemas, RpcRequestSchema } from '../../contracts/src/bridge';
import { DomainError } from '../../contracts/src/errors';
export class RuntimeService {
  private readonly db; readonly projects; readonly assets; readonly settings; readonly canvases;
  constructor(root: string) {
    mkdirSync(root, { recursive: true }); this.db = openDatabase(join(root, 'commercecanvas.sqlite'));
    this.projects = new ProjectRepository(this.db); this.assets = new AssetService(this.db, root); this.settings = new SettingsRepository(this.db);
    this.canvases = new CanvasRepository(this.db);
  }
  async dispatch(request: unknown): Promise<unknown> {
    const { method, payload } = RpcRequestSchema.parse(request);
    // Each branch reparses to retain precise types after the envelope validation.
    switch (method) {
      case 'listCanvases': return this.canvases.list(internalSchemas.listCanvases.parse(payload).projectId);
      case 'createCanvas': { const p = internalSchemas.createCanvas.parse(payload); return this.canvases.create(p.projectId, p.name); }
      case 'loadCanvas': { const p = internalSchemas.loadCanvas.parse(payload); return this.canvases.load(p.projectId, p.canvasId); }
      case 'saveCanvas': { const p = internalSchemas.saveCanvas.parse(payload); return this.canvases.save(p.projectId, p.document, p.panel, p.expectedRevision); }
      case 'getSelectedCanvas': return this.canvases.selected(internalSchemas.getSelectedCanvas.parse(payload).projectId);
      case 'selectCanvas': { const p = internalSchemas.selectCanvas.parse(payload); return this.canvases.select(p.projectId, p.canvasId); }
      case 'getCurrentProject': return this.settings.getCurrentProject();
      case 'setCurrentProject': return this.settings.setCurrentProject(internalSchemas.setCurrentProject.parse(payload).projectId);
      case 'health': return probeRuntime();
      case 'listProjects': return this.projects.list();
      case 'createProject': return this.projects.create(internalSchemas.createProject.parse(payload).name);
      case 'getProject': { const p = internalSchemas.getProject.parse(payload); const project = this.projects.get(p.projectId); return project && { project, skus: this.projects.listSkus(p.projectId), brand: this.projects.getBrandProfile(p.projectId) }; }
      case 'updateProject': { const p = internalSchemas.updateProject.parse(payload); return this.projects.updateProduct(p.projectId, p.expectedRevision, p.update); }
      case 'renameProject': { const p = internalSchemas.renameProject.parse(payload); return this.projects.rename(p.projectId, p.expectedRevision, p.name); }
      case 'deleteProject': { const p = internalSchemas.deleteProject.parse(payload); this.projects.delete(p.projectId, p.expectedRevision); return null; }
      case 'listAssets': return this.assets.repository.list(internalSchemas.listAssets.parse(payload).projectId);
      case 'saveText': return this.assets.importText(internalSchemas.saveText.parse(payload));
      case 'saveTextVersion': return this.assets.saveTextVersion(internalSchemas.saveTextVersion.parse(payload));
      case 'importImages': return this.assets.importImages(internalSchemas.importImages.parse(payload));
      case 'importImageBytes': { const p = internalSchemas.importImageBytes.parse(payload); return this.assets.importImage({ projectId: p.projectId, bytes: p.bytes, fileName: p.name }); }
      case 'trashAsset': case 'restoreAsset': { const p = internalSchemas[method].parse(payload); this.assets[method](p.projectId, p.assetId); return null; }
      case 'getTheme': return this.settings.getTheme();
      case 'setTheme': return this.settings.setTheme(internalSchemas.setTheme.parse(payload).theme);
      case 'getSettings': return this.settings.getSettings();
      case 'setCredentialMetadata': this.settings.setCredentials(internalSchemas.setCredentialMetadata.parse(payload).credentials); return null;
      case 'getAssetResponse': { const p = internalSchemas.getAssetResponse.parse(payload); const version = this.assets.repository.get(p.versionId, p.projectId); return { bytes: new Uint8Array(await this.assets.read(p.versionId, p.variant, p.projectId)), mime: p.variant === 'thumbnail' ? 'image/webp' : version.mime }; }
      default: throw new DomainError('INVALID_REQUEST', 'Unsupported runtime method');
    }
  }
  async close() { await this.assets.thumbnails.drain(); this.db.close(); }
}
