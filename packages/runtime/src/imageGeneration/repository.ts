import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { CanvasRepository } from '../canvases/repository';
import { AssetRepository } from '../assets/repository';
import { DomainError } from '../../../contracts/src/errors';
import { GenerationSettingsSchema, type GenerationBinding, type GenerationRun, type GenerationSlot, type GenerationStatus } from '../../../contracts/src/imageGeneration';
import { resolveGenerationSettings } from './settings';
import { compileGenerationPrompt } from './prompt';

const terminal=new Set<GenerationStatus>(['succeeded','failed','cancelled']);
function invalid(message:string):never {throw new DomainError('INVALID_INPUT',message);}
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export class ImageGenerationRepository {
  constructor(private readonly db:DatabaseSync) {}
  private transaction<T>(operation:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=operation();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  private context(target:{projectId:string;canvasId:string;nodeId:string}) {
    const {document}=new CanvasRepository(this.db).load(target.projectId,target.canvasId);
    const node=document.nodes.find(n=>n.id===target.nodeId);
    if(node?.kind!=='generation'||!node.generation)invalid('Configured generation node required');
    const settings=GenerationSettingsSchema.parse(node.generation), assets=new AssetRepository(this.db);
    const inputs:GenerationBinding[]=[];let imageIndex=0;
    for(const edge of document.edges.filter(e=>e.target===node.id).sort((a,b)=>a.role.localeCompare(b.role))){
      const source=document.nodes.find(n=>n.id===edge.source);
      if(!source?.assetVersionId)invalid('Input requires an archived asset version');
      const asset=assets.get(source.assetVersionId,target.projectId);
      if(this.db.prepare('SELECT trashed_at FROM assets WHERE id=?').get(asset.assetId)?.trashed_at)invalid('Input asset is trashed');
      inputs.push({role:edge.role,assetId:asset.assetId,versionId:asset.id,kind:asset.kind,hash:asset.hash,...(asset.kind==='text'?{text:asset.text!}:{imageIndex:++imageIndex})});
    }
    if(imageIndex>4)invalid('At most 4 reference images are supported');
    const facts=JSON.parse(String(this.db.prepare('SELECT facts FROM projects WHERE id=?').get(target.projectId)!.facts)) as Record<string,string>;
    const request={...resolveGenerationSettings(settings),prompt:compileGenerationPrompt(settings,facts,inputs)};
    const contextHash=createHash('sha256').update(canonical({settings,inputs,facts})).digest('hex');
    return {settings,inputs,facts,request,contextHash};
  }
  prepare(target:{projectId:string;canvasId:string;nodeId:string}):GenerationRun {
    return this.transaction(()=>{
      const c=this.context(target),id=randomUUID(),now=new Date().toISOString();
      this.db.prepare('INSERT INTO image_runs (id,project_id,canvas_id,node_id,settings,inputs,facts,request,context_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,target.projectId,target.canvasId,target.nodeId,JSON.stringify(c.settings),JSON.stringify(c.inputs),JSON.stringify(c.facts),JSON.stringify(c.request),c.contextHash,'queued',now,now);
      for(const input of c.inputs)this.db.prepare("INSERT OR IGNORE INTO asset_references VALUES (?,?,?,'run',1)").run(target.projectId,input.versionId,id);
      return this.get(target.projectId,id);
    });
  }
  confirm(projectId:string,runId:string):GenerationRun {
    return this.transaction(()=>{
      const run=this.get(projectId,runId);if(run.approvedAt)return run;
      if(run.stopRequested)invalid('Stopped plan cannot be confirmed');
      const current=this.context(run);if(current.contextHash!==run.contextHash)invalid('Generation context changed; prepare a new plan');
      const now=new Date().toISOString();
      this.db.prepare('UPDATE image_runs SET approved_at=?,updated_at=? WHERE id=?').run(now,now,runId);
      for(let index=0;index<run.settings.count;index++)this.db.prepare("INSERT INTO image_slots (run_id,slot_index,attempt_id,output_asset_id,output_version_id,status) VALUES (?,?,?,?,?,'queued')").run(runId,index,randomUUID(),randomUUID(),randomUUID());
      this.db.prepare("UPDATE asset_references SET active=1 WHERE owner_id=? AND kind='run'").run(runId);
      return this.get(projectId,runId);
    });
  }
  get(projectId:string,runId:string):GenerationRun {
    const r=this.db.prepare('SELECT * FROM image_runs WHERE id=? AND project_id=?').get(runId,projectId);
    if(!r)throw new DomainError('NOT_FOUND','Generation run not found');
    return {id:String(r.id),projectId:String(r.project_id),canvasId:String(r.canvas_id),nodeId:String(r.node_id),settings:JSON.parse(String(r.settings)),inputs:JSON.parse(String(r.inputs)),facts:JSON.parse(String(r.facts)),request:JSON.parse(String(r.request)),contextHash:String(r.context_hash),approvedAt:r.approved_at===null?null:String(r.approved_at),status:r.status as GenerationStatus,stopRequested:Boolean(r.stop_requested),createdAt:String(r.created_at),updatedAt:String(r.updated_at),slots:this.slots(runId)};
  }
  list(projectId:string):GenerationRun[]{return this.db.prepare('SELECT id FROM image_runs WHERE project_id=? ORDER BY created_at,id').all(projectId).map(r=>this.get(projectId,String(r.id)));}
  listRecoverable():GenerationRun[]{return this.db.prepare("SELECT id,project_id FROM image_runs WHERE approved_at IS NOT NULL AND status NOT IN ('succeeded','failed','cancelled') ORDER BY created_at,id").all().map(r=>this.get(String(r.project_id),String(r.id)));}
  /** Invoke only after acquiring exclusive executor ownership, never on ordinary DB open. */
  recoverInterrupted():GenerationRun[]{return this.transaction(()=>{
    const affected=this.db.prepare("SELECT DISTINCT run_id FROM image_slots WHERE status='submitting'").all();
    this.db.exec("UPDATE image_slots SET status='unknown',error='Submission interrupted before remote ID was saved' WHERE status='submitting' AND remote_id IS NULL; UPDATE image_slots SET status='running' WHERE status='submitting' AND remote_id IS NOT NULL;");
    for(const row of affected)this.refresh(String(row.run_id));return this.listRecoverable();
  });}
  private slots(runId:string):GenerationSlot[]{return this.db.prepare('SELECT run_id AS runId,slot_index AS slotIndex,attempt_id AS attemptId,output_asset_id AS outputAssetId,output_version_id AS outputVersionId,remote_id AS remoteId,status,error,progress,result_version_id AS resultVersionId,actual_width AS actualWidth,actual_height AS actualHeight,warning FROM image_slots WHERE run_id=? ORDER BY slot_index').all(runId).map(row=>({...row,derivatives:this.db.prepare('SELECT version_id AS versionId,source_version_id AS sourceVersionId,fit,background,width,height FROM generation_outputs WHERE run_id=? AND slot_index=? AND source_version_id IS NOT NULL ORDER BY derivative_key').all(runId,Number(row.slotIndex))})) as unknown as GenerationSlot[];}
  resultUrl(projectId:string,runId:string,index:number):string|null {
    this.get(projectId,runId);this.slot(runId,index);
    const row=this.db.prepare('SELECT result_url FROM image_slots WHERE run_id=? AND slot_index=?').get(runId,index)!;
    return row.result_url===null?null:String(row.result_url);
  }
  recordResult(projectId:string,runId:string,index:number,url:string):void {
    const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)invalid('Invalid result URL');
    this.transaction(()=>{this.get(projectId,runId);const slot=this.slot(runId,index);
      if(!slot.remoteId||!['running','unknown','downloading'].includes(slot.status))invalid('Result requires a known task');
      const prior=this.resultUrl(projectId,runId,index);if(prior&&prior!==url)invalid('Result URL already recorded');
      this.db.prepare("UPDATE image_slots SET status='downloading',result_url=?,error=NULL WHERE run_id=? AND slot_index=?").run(url,runId,index);this.refresh(runId);
    });
  }
  private slot(runId:string,index:number):GenerationSlot {const slot=this.slots(runId).find(s=>s.slotIndex===index);if(!slot)throw new DomainError('NOT_FOUND','Generation slot not found');return slot;}
  private refresh(runId:string){
    const slots=this.slots(runId);if(!slots.length)return;
    const status:GenerationStatus=slots.every(s=>terminal.has(s.status))?(slots.every(s=>s.status==='succeeded')?'succeeded':slots.some(s=>s.status==='failed')?'failed':'cancelled'):slots.some(s=>s.status==='unknown')?'unknown':slots.some(s=>s.status==='downloading')?'downloading':slots.some(s=>s.status==='running')?'running':slots.some(s=>s.status==='submitting')?'submitting':'queued';
    this.db.prepare('UPDATE image_runs SET status=?,updated_at=? WHERE id=?').run(status,new Date().toISOString(),runId);
    this.db.prepare("UPDATE asset_references SET active=? WHERE owner_id=? AND kind='run'").run(Number(!terminal.has(status)),runId);
  }
  claim(runId:string,slotIndex:number):GenerationSlot|null {
    return this.transaction(()=>{
      const changed=this.db.prepare("UPDATE image_slots SET status='submitting' WHERE run_id=? AND slot_index=? AND status='queued' AND EXISTS(SELECT 1 FROM image_runs WHERE id=? AND stop_requested=0 AND approved_at IS NOT NULL)").run(runId,slotIndex,runId);
      if(!changed.changes)return null;this.refresh(runId);return this.slot(runId,slotIndex);
    });
  }
  recordRemote(runId:string,slotIndex:number,remoteId:string):GenerationSlot {
    return this.transaction(()=>{const slot=this.slot(runId,slotIndex);
      if(slot.remoteId===remoteId&&slot.status!=='queued')return slot;
      if(slot.status!=='submitting'||slot.remoteId)invalid('Remote ID can only be recorded for a submitting slot');
      this.setRemote(runId,slotIndex,remoteId);return this.slot(runId,slotIndex);
    });
  }
  /** Caller must validate the task with provider GET before binding. This never submits. */
  bindUnknown(projectId:string,runId:string,slotIndex:number,remoteId:string):GenerationSlot {
    return this.transaction(()=>{this.get(projectId,runId);const slot=this.slot(runId,slotIndex);if(slot.status!=='unknown'||slot.remoteId)invalid('Only unknown slots without a remote ID can be bound');this.setRemote(runId,slotIndex,remoteId);this.db.prepare("UPDATE image_slots SET warning='BOUND_TASK_INPUTS_UNVERIFIED' WHERE run_id=? AND slot_index=?").run(runId,slotIndex);return this.slot(runId,slotIndex);});
  }
  private setRemote(runId:string,index:number,id:string){if(!id.trim()||id.length>500)invalid('Invalid remote ID');this.db.prepare("UPDATE image_slots SET remote_id=?,status='running',error=NULL WHERE run_id=? AND slot_index=?").run(id,runId,index);this.refresh(runId);}
  updateSlot(runId:string,slotIndex:number,update:{status:GenerationStatus;progress?:number;error?:string}):GenerationSlot {
    return this.transaction(()=>{
      const slot=this.slot(runId,slotIndex);
      const allowed:Record<GenerationStatus,GenerationStatus[]>={queued:[],submitting:['unknown','failed'],running:['running','downloading','failed','unknown'],downloading:['downloading','failed','unknown'],unknown:['running','downloading','failed'],succeeded:[],failed:[],cancelled:[]};
      if(!allowed[slot.status].includes(update.status)||(update.status==='running'||update.status==='downloading')&&!slot.remoteId)invalid('Invalid slot transition');
      if(update.progress!==undefined&&(!Number.isFinite(update.progress)||update.progress<0||update.progress>100))invalid('Invalid progress');
      this.db.prepare('UPDATE image_slots SET status=?,progress=?,error=? WHERE run_id=? AND slot_index=?').run(update.status,update.progress??slot.progress,update.error?.slice(0,2000)??null,runId,slotIndex);this.refresh(runId);return this.slot(runId,slotIndex);
    });
  }
  complete(projectId:string,runId:string,slotIndex:number,versionId:string):GenerationSlot {
    return this.transaction(()=>{this.get(projectId,runId);const slot=this.slot(runId,slotIndex);
      if(slot.status==='succeeded'&&slot.resultVersionId===versionId)return slot;
      if(slot.status!=='downloading')invalid('Only downloading slots can complete');
      const version=new AssetRepository(this.db).get(versionId,projectId);
      if(version.kind!=='image'||version.id!==slot.outputVersionId||version.assetId!==slot.outputAssetId)invalid('Output must use preallocated image IDs');
      if(this.db.prepare('SELECT trashed_at FROM assets WHERE id=?').get(version.assetId)?.trashed_at)invalid('Output is trashed');
      const request=this.get(projectId,runId).request;
      const warning=[slot.warning,version.width!==request.width||version.height!==request.height?'DIMENSIONS_DIFFER':null].filter(Boolean).join(';')||null;
      this.db.prepare("UPDATE image_slots SET status='succeeded',result_version_id=?,actual_width=?,actual_height=?,progress=100,error=NULL,warning=? WHERE run_id=? AND slot_index=?").run(version.id,version.width,version.height,warning,runId,slotIndex);
      this.db.prepare("INSERT INTO asset_references VALUES (?,?,?,'run',1) ON CONFLICT(project_id,version_id,owner_id) DO UPDATE SET active=1").run(projectId,version.id,runId);this.refresh(runId);return this.slot(runId,slotIndex);
    });
  }
  stop(projectId:string,runId:string):GenerationRun {
    return this.transaction(()=>{this.get(projectId,runId);this.db.prepare('UPDATE image_runs SET stop_requested=1,updated_at=? WHERE id=?').run(new Date().toISOString(),runId);this.db.prepare("UPDATE image_slots SET status='cancelled' WHERE run_id=? AND status='queued'").run(runId);this.refresh(runId);if(!this.slots(runId).length){this.db.prepare("UPDATE image_runs SET status='cancelled' WHERE id=?").run(runId);this.db.prepare("UPDATE asset_references SET active=0 WHERE owner_id=? AND kind='run'").run(runId);}return this.get(projectId,runId);});
  }
}
