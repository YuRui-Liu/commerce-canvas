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
import { ImageGenerationRepository } from './imageGeneration/repository';
import { ImageGenerationResults } from './imageGeneration/results';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
export class RuntimeService {
  private readonly db; readonly projects; readonly assets; readonly settings; readonly canvases; readonly generations; readonly generationResults;
  constructor(root: string) {
    mkdirSync(root, { recursive: true }); this.db = openDatabase(join(root, 'commercecanvas.sqlite'));
    this.projects = new ProjectRepository(this.db); this.assets = new AssetService(this.db, root); this.settings = new SettingsRepository(this.db);
    this.canvases = new CanvasRepository(this.db);
    this.generations=new ImageGenerationRepository(this.db);this.generationResults=new ImageGenerationResults(this.db,this.assets,this.generations);
  }
  async dispatch(request: unknown): Promise<unknown> {
    const { method, payload } = RpcRequestSchema.parse(request);
    // Each branch reparses to retain precise types after the envelope validation.
    switch (method) {
      case 'prepareImageGeneration':return this.generations.prepare(internalSchemas.prepareImageGeneration.parse(payload));
      case 'confirmImageGeneration':{const p=internalSchemas.confirmImageGeneration.parse(payload);return this.generations.confirm(p.projectId,p.runId);}
      case 'listImageGenerations':{const p=internalSchemas.listImageGenerations.parse(payload);this.projects.get(p.projectId);return this.generations.list(p.projectId).filter(r=>r.canvasId===p.canvasId);}
      case 'stopImageGeneration':{const p=internalSchemas.stopImageGeneration.parse(payload);return this.generations.stop(p.projectId,p.runId);}
      case 'adaptImageGenerationOutput':return this.generationResults.adapt(internalSchemas.adaptImageGenerationOutput.parse(payload));
      case 'generationGet':{const p=internalSchemas.generationGet.parse(payload);return this.generations.get(p.projectId,p.runId);}
      case 'generationRecover':return this.generations.recoverInterrupted();
      case 'generationRecoverable':return this.generations.listRecoverable();
      case 'generationClaim':{const p=internalSchemas.generationClaim.parse(payload);this.generations.get(p.projectId,p.runId);return this.generations.claim(p.runId,p.slotIndex);}
      case 'generationRecordRemote':{const p=internalSchemas.generationRecordRemote.parse(payload);this.generations.get(p.projectId,p.runId);return this.generations.recordRemote(p.runId,p.slotIndex,p.remoteId);}
      case 'generationUpdateSlot':{const p=internalSchemas.generationUpdateSlot.parse(payload);this.generations.get(p.projectId,p.runId);return this.generations.updateSlot(p.runId,p.slotIndex,p);}
      case 'generationRecordResult':{const p=internalSchemas.generationRecordResult.parse(payload);this.generations.recordResult(p.projectId,p.runId,p.slotIndex,p.url);return null;}
      case 'generationResultUrl':{const p=internalSchemas.generationResultUrl.parse(payload);return this.generations.resultUrl(p.projectId,p.runId,p.slotIndex);}
      case 'generationBind':{const p=internalSchemas.generationBind.parse(payload);return this.generations.bindUnknown(p.projectId,p.runId,p.slotIndex,p.remoteId);}
      case 'generationArchive':return this.generationResults.archive(internalSchemas.generationArchive.parse(payload));
      case 'generationRecoverOutput':return this.generationResults.recover(internalSchemas.generationRecoverOutput.parse(payload));
      case 'generationInputBytes':{
        const p=internalSchemas.generationInputBytes.parse(payload),run=this.generations.get(p.projectId,p.runId),inputs=run.inputs.filter(i=>i.kind==='image').sort((a,b)=>a.imageIndex!-b.imageIndex!);
        if(inputs.length>4)throw new DomainError('INVALID_IMAGE','Too many reference images');
        const images:string[]=[];
        for(const input of inputs){
          const version=this.assets.repository.get(input.versionId,p.projectId),bytes=await this.assets.read(input.versionId,'original',p.projectId);
          if(version.kind!=='image'||bytes.length>15*1024*1024||createHash('sha256').update(bytes).digest('hex')!==input.hash)throw new DomainError('INVALID_IMAGE','Reference bytes changed or too large');
          const decoder=sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'}),metadata=await decoder.metadata();
          if(!['png','jpeg','webp'].includes(metadata.format??'')||(metadata.pages??1)!==1)throw new DomainError('INVALID_IMAGE','Unsupported reference image');
          await decoder.raw().toBuffer();const data=`data:image/${metadata.format};base64,${bytes.toString('base64')}`;
          if(data.length>20*1024*1024)throw new DomainError('INVALID_IMAGE','Encoded reference exceeds 20 MB');images.push(data);
        }
        return images;
      }
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
      case 'listAssets': {const p=internalSchemas.listAssets.parse(payload);return this.assets.repository.list(p.projectId,p.trashed);}
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
