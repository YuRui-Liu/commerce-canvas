import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { AssetService } from '../assets/import';
import { ImageGenerationRepository } from './repository';
import { DomainError } from '../../../contracts/src/errors';
import { requestSchemas } from '../../../contracts/src/bridge';
type Target={projectId:string;runId:string;slotIndex:number};
function stableId(key:string){const h=createHash('sha256').update(key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
export class ImageGenerationResults {
  constructor(private db:DatabaseSync,private assets:AssetService,private runs:ImageGenerationRepository){}
  private context(p:Target){const run=this.runs.get(p.projectId,p.runId),slot=run.slots.find(s=>s.slotIndex===p.slotIndex);if(!slot)throw new DomainError('NOT_FOUND','Generation slot not found');return {run,slot};}
  async archive(p:Target&{bytes:Uint8Array}){
    const {slot}=this.context(p);if(!['downloading','succeeded'].includes(slot.status))throw new DomainError('INVALID_INPUT','Slot has no downloadable result');
    const version=await this.assets.importImage({projectId:p.projectId,bytes:p.bytes,fileName:`Generation ${p.slotIndex+1}`},{assetId:slot.outputAssetId,versionId:slot.outputVersionId});
    this.context(p);
    this.db.prepare('INSERT OR IGNORE INTO generation_outputs (version_id,project_id,run_id,slot_index,derivative_key,width,height) VALUES (?,?,?,?,?,?,?)').run(version.id,p.projectId,p.runId,p.slotIndex,`original:${p.runId}:${p.slotIndex}`,version.width,version.height);
    this.runs.complete(p.projectId,p.runId,p.slotIndex,version.id);return version;
  }
  async recover(p:Target){
    const {slot}=this.context(p);
    if(!this.db.prepare('SELECT id FROM asset_versions WHERE id=?').get(slot.outputVersionId))return null;
    const bytes=await this.assets.read(slot.outputVersionId,'original',p.projectId);
    return this.archive({...p,bytes});
  }
  async adapt(input:Target&{fit?:'contain'|'cover';background?:string}){
    const p=requestSchemas.adaptImageGenerationOutput.parse(input),{run,slot}=this.context(p);
    if(slot.status!=='succeeded'||!slot.resultVersionId)throw new DomainError('INVALID_INPUT','Original output must be archived first');
    const source=this.assets.repository.get(slot.resultVersionId,p.projectId),{width,height}=run.request;
    const key=JSON.stringify({source:source.id,hash:source.hash,fit:p.fit,background:p.background,width,height,format:'png-srgb-v1'});
    const id=stableId(key),existing=this.db.prepare('SELECT version_id FROM generation_outputs WHERE derivative_key=? AND project_id=?').get(key,p.projectId);
    if(existing)return this.assets.repository.get(String(existing.version_id),p.projectId);
    const bytes=await this.assets.read(source.id,'original',p.projectId);
    if(createHash('sha256').update(bytes).digest('hex')!==source.hash)throw new DomainError('CORRUPT_ASSET','Original content changed');
    const adapted=await sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().resize(width,height,{fit:p.fit,background:p.background}).toColourspace('srgb').png().toBuffer();
    this.context(p);
    const version=await this.assets.importImage({projectId:p.projectId,bytes:adapted,fileName:`Adapted ${p.slotIndex+1} (${p.fit})`},{assetId:stableId(`asset:${key}`),versionId:id});
    this.db.prepare('INSERT OR IGNORE INTO generation_outputs (version_id,project_id,run_id,slot_index,derivative_key,source_version_id,fit,background,width,height) VALUES (?,?,?,?,?,?,?,?,?,?)').run(version.id,p.projectId,p.runId,p.slotIndex,key,source.id,p.fit,p.background,width,height);
    return version;
  }
  provenance(versionId:string,projectId:string){this.assets.repository.get(versionId,projectId);return this.db.prepare('SELECT run_id AS runId,slot_index AS slotIndex,source_version_id AS sourceVersionId,fit,background,width,height FROM generation_outputs WHERE version_id=? AND project_id=?').get(versionId,projectId);}
}
