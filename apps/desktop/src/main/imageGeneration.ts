import { requestSchemas, remoteTaskIdSchema } from '../../../../packages/contracts/src/bridge';
import type { GenerationRun, GenerationSlot } from '../../../../packages/contracts/src/imageGeneration';
import type { ImageProviderPort, ImageRequest, ImageTask } from '../../../../packages/contracts/src/imageProvider';
import { GrsaiClient, GrsaiError } from '../../../../packages/runtime/src/providers/grsai/client';
import { imageRequestSchema } from '../../../../packages/runtime/src/providers/grsai/capabilities';
import { downloadGenerationImage } from './imageGenerationDownload';
interface Runtime {request(method:string,payload?:unknown):Promise<any>}
type Target={projectId:string;runId:string};
type SlotTarget=Target&{slotIndex:number};
interface Options {
  /** Explicit dependency injection for contract tests only; production constructs the default GRSai client. */
  providerFactory?:(apiKey:string)=>ImageProviderPort;
  download?:(url:string)=>Promise<Uint8Array>;
  pollDelayMs?:number;maxPolls?:number;
}
export class ImageGenerationCoordinator {
  private active=new Map<string,Promise<void>>();
  private stopped=false;
  private owned=false;
  private wake=new Set<()=>void>();
  constructor(private runtime:Runtime,private credentials:{resolveGrsai():string},private options:Options={}){}
  async start(exclusiveOwnership:boolean){
    if(!exclusiveOwnership)throw Error('EXECUTOR_OWNERSHIP_REQUIRED');
    if(this.owned)throw Error('EXECUTOR_ALREADY_STARTED');
    this.owned=true;
    await this.runtime.request('generationRecover');
    const runs:GenerationRun[]=await this.runtime.request('generationRecoverable');
    for(const run of runs){
      // A missing credential leaves recoverable tasks untouched for explicit resume.
      try{await this.resume({projectId:run.projectId,runId:run.id});}catch{/* Preflight never implies a network submission. */}
    }
  }
  private ready(){if(!this.owned||this.stopped)throw Error('EXECUTOR_UNAVAILABLE');}
  prepare(payload:unknown){this.ready();return this.runtime.request('prepareImageGeneration',requestSchemas.prepareImageGeneration.parse(payload)) as Promise<GenerationRun>;}
  list(payload:unknown){return this.runtime.request('listImageGenerations',requestSchemas.listImageGenerations.parse(payload)) as Promise<GenerationRun[]>;}
  stop(payload:unknown){return this.runtime.request('stopImageGeneration',requestSchemas.stopImageGeneration.parse(payload)) as Promise<GenerationRun>;}
  adapt(payload:unknown){this.ready();return this.runtime.request('adaptImageGenerationOutput',requestSchemas.adaptImageGenerationOutput.parse(payload));}
  private provider(){return (this.options.providerFactory??(apiKey=>new GrsaiClient({apiKey})))(this.credentials.resolveGrsai());}
  private async request(run:GenerationRun):Promise<ImageRequest>{
    const images:string[]=await this.runtime.request('generationInputBytes',{projectId:run.projectId,runId:run.id});
    const {model,prompt,aspectRatio,quality}=run.request;
    const parsed=imageRequestSchema.safeParse({model,prompt,aspectRatio,quality,...(images.length?{images}:{})});
    if(!parsed.success)throw Error('INVALID_GENERATION_REQUEST');
    return parsed.data;
  }
  async confirm(payload:unknown):Promise<GenerationRun>{
    this.ready();const p=requestSchemas.confirmImageGeneration.parse(payload),run:GenerationRun=await this.runtime.request('generationGet',p);
    if(run.approvedAt)return this.resume(p);
    // All deterministic checks happen before approval/claim; their failures are never ambiguous.
    const provider=this.provider(),request=await this.request(run);
    this.ready();const confirmed:GenerationRun=await this.runtime.request('confirmImageGeneration',p);
    this.schedule(confirmed,provider,request);return confirmed;
  }
  async resume(payload:unknown):Promise<GenerationRun>{
    this.ready();const p=requestSchemas.resumeImageGeneration.parse(payload),run:GenerationRun=await this.runtime.request('generationGet',p);
    if(!run.approvedAt)return run;
    // Collection is independent of submission preflight. Losing a key or an input
    // must not block already downloaded / downloadable successes in another slot.
    this.schedule({...run,slots:run.slots.filter(s=>s.status==='downloading')});
    const queued=run.slots.some(s=>s.status==='queued'&&!run.stopRequested);
    const queries=run.slots.some(s=>(s.status==='running'||s.status==='unknown')&&s.remoteId);
    const provider=queued||queries?this.provider():undefined;
    if(queries)this.schedule({...run,slots:run.slots.filter(s=>s.status==='running'||s.status==='unknown')},provider);
    const request=queued?await this.request(run):undefined;
    this.ready();if(queued)this.schedule({...run,slots:run.slots.filter(s=>s.status==='queued')},provider,request);return run;
  }
  async bind(payload:unknown):Promise<GenerationRun>{
    this.ready();const p=requestSchemas.bindImageGenerationTask.parse(payload),run:GenerationRun=await this.runtime.request('generationGet',pRun(p));
    const slot=run.slots.find(s=>s.slotIndex===p.slotIndex);
    if(!slot||slot.status!=='unknown'||slot.remoteId)throw Error('INVALID_TASK_BINDING');
    const provider=this.provider(),task=await provider.get(p.remoteId);this.validateTask(task,p.remoteId);
    this.ready();await this.runtime.request('generationBind',p);
    // GET proves task existence only, never that its inputs match this snapshot.
    const updated:GenerationRun=await this.runtime.request('generationGet',pRun(p));this.schedule(updated,provider);return updated;
  }
  private schedule(run:GenerationRun,provider?:ImageProviderPort,request?:ImageRequest){
    if(this.stopped)return;
    for(const slot of run.slots){
      if(!['queued','running','unknown','downloading'].includes(slot.status)||slot.status==='unknown'&&!slot.remoteId||slot.status==='queued'&&run.stopRequested)continue;
      const key=`${run.id}:${slot.slotIndex}`;if(this.active.has(key))continue;
      const work=this.execute(run,slot,provider,request).catch(()=>{/* Storage failure leaves the durable claim for recovery. Never retry POST. */}).finally(()=>this.active.delete(key));
      this.active.set(key,work);
    }
  }
  private async update(p:SlotTarget,status:'running'|'downloading'|'unknown'|'failed',error?:string,progress?:number){return this.runtime.request('generationUpdateSlot',{...p,status,...(error?{error}:{}),...(progress!==undefined?{progress}:{})});}
  private validateTask(task:ImageTask,id:string){
    if(task.id!==id)throw Error('RESULT_ID_MISMATCH');
    if(!['running','failed','violation','succeeded'].includes(task.status))throw Error('INVALID_PROVIDER_RESULT');
    if(task.status==='succeeded'&&(task.results?.length!==1||!task.results[0]?.url))throw Error('INVALID_PROVIDER_RESULT');
  }
  private async execute(run:GenerationRun,initial:GenerationSlot,provider?:ImageProviderPort,request?:ImageRequest){
    const p={projectId:run.projectId,runId:run.id,slotIndex:initial.slotIndex};let slot=initial,task:ImageTask|undefined;
    if(this.stopped)return;
    if(slot.status==='queued'){
      if(!provider||!request)return;
      const claimed=await this.runtime.request('generationClaim',p) as GenerationSlot|null;if(!claimed)return;slot=claimed;
      // Once claimed, this process must resolve that single attempt even if stop is requested.
      try{
        task=await provider.submit(request);
        remoteTaskIdSchema.parse(task.id);
        slot=await this.runtime.request('generationRecordRemote',{...p,remoteId:task.id});
      }catch(error){
        if(error instanceof GrsaiError&&error.remoteId){
          slot=await this.runtime.request('generationRecordRemote',{...p,remoteId:error.remoteId});
        }else{await this.update(p,'unknown','SUBMISSION_UNKNOWN_DO_NOT_RESUBMIT');return;}
      }
    }
    let url:string|null=await this.runtime.request('generationResultUrl',p);
    if(!url&&slot.remoteId){
      if(!provider)return;
      try{
        for(let attempt=0;attempt<(this.options.maxPolls??120);attempt++){
          if(this.stopped)return;
          task??=await provider.get(slot.remoteId);this.validateTask(task,slot.remoteId);
          if(task.status==='failed'||task.status==='violation'){await this.update(p,'failed',task.status==='violation'?'PROVIDER_VIOLATION':'PROVIDER_FAILED');return;}
          if(task.status==='succeeded'){
            url=task.results![0].url;await this.runtime.request('generationRecordResult',{...p,url});break;
          }
          await this.update(p,'running',undefined,task.progress);task=undefined;await this.delay();
        }
        if(!url){await this.update(p,'unknown','POLLING_PAUSED_RESUME_TO_QUERY');return;}
      }catch{await this.update(p,'unknown','QUERY_FAILED_RESUME_TO_QUERY');return;}
    }
    if(!url||this.stopped)return;
    try{
      if(await this.runtime.request('generationRecoverOutput',p))return;
      const bytes=await (this.options.download??downloadGenerationImage)(url);
      // Runtime performs full bounded decode + content hash before stable-ID archival.
      await this.runtime.request('generationArchive',{...p,bytes:new Uint8Array(bytes)});
    }catch{await this.update(p,'downloading','DOWNLOAD_FAILED_RESUME_DOWNLOAD');}
  }
  private delay(){return new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);this.wake.delete(finish);resolve();};const timer=setTimeout(finish,this.options.pollDelayMs??2000);this.wake.add(finish);if(this.stopped)finish();});}
  async drain(){while(this.active.size)await Promise.all([...this.active.values()]);}
  async shutdown(){this.stopped=true;for(const finish of [...this.wake])finish();await this.drain();}
}
function pRun(p:Target):Target{return {projectId:p.projectId,runId:p.runId};}
