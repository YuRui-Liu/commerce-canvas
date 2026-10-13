import {useEffect,useRef,useState,type RefObject} from 'react';
import type {CanvasHandle} from '../../../../../packages/canvas/src/Canvas';
import type {useCanvasSync} from '../../../../../packages/canvas/src/useCanvasSync';
import {deliverGenerationResults} from '../../../../../packages/canvas/src/generationDelivery';
import type {AssetVersion} from '../../../../../packages/contracts/src/domain';
import type {GenerationRun} from '../../../../../packages/contracts/src/imageGeneration';
const bridge=window.commerceCanvas;
export function generationError(error:unknown){const text=String(error);
 if(/CREDENTIAL_NOT_FOUND|SECURE_STORAGE_UNAVAILABLE/.test(text))return '请先在设置中保存 GRSai 凭证，再确认生成。当前计划已保留。';
 if(/STALE|CHANGED|CONTEXT/.test(text))return '输入或商品资料已变化，请取消并重新准备生成。';
 if(/INVALID|DIMENSION/.test(text))return '参数或输入无效，请检查尺寸、素材连接与摄影设置。';
 if(/SAVE|CONFLICT/.test(text))return '画布尚未成功保存，请先处理保存提示。';
 return '操作未完成，请稍后重试。已有结果和任务记录已保留。';
}
export function runLabel(run?:GenerationRun){if(!run)return '待生成';if(!run.approvedAt)return run.status==='cancelled'?'已取消':'待确认';const ok=run.slots.filter(s=>s.status==='succeeded').length;const failed=run.slots.filter(s=>s.status==='failed').length;if(ok===run.slots.length&&ok)return `已完成 ${ok} 张`;if(failed&&ok)return `${ok} 成功 · ${failed} 失败`;return ({queued:'排队中',submitting:'提交中',running:'生成中',downloading:'归档中',succeeded:'已完成',failed:'生成失败',unknown:'状态待确认',cancelled:'已停止'})[run.status];}
type Args={projectId?:string;canvasId?:string;canvas:RefObject<CanvasHandle|null>;sync:ReturnType<typeof useCanvasSync>;blocked:boolean;setAssets:(assets:AssetVersion[])=>void;saveProduct:()=>Promise<boolean>};
export function useGenerationRuns(args:Args){
 const latest=useRef(args);latest.current=args;
 const scope=`${args.projectId??''}:${args.canvasId??''}:${args.sync.epoch}`;const scopeRef=useRef(scope);scopeRef.current=scope;
 const [runs,setRuns]=useState<GenerationRun[]>([]),[review,setReview]=useState<GenerationRun>(),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const pendingRef=useRef(false),polling=useRef(false);
 const current=(ticket:string)=>scopeRef.current===ticket;
 async function refresh(ticket=scopeRef.current){
  const a=latest.current;if(!a.projectId||!a.canvasId||a.blocked||polling.current)return;
  polling.current=true;
  try{
   const next=await bridge.listImageGenerations({projectId:a.projectId,canvasId:a.canvasId});if(!current(ticket))return;
   setRuns(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
   const receipts=new Set(latest.current.sync.getRecord()?.panel.generationDeliveries??[]);
   if(!next.some(run=>run.slots.some(slot=>slot.resultVersionId&&!receipts.has(slot.resultVersionId)||slot.derivatives.some(d=>!receipts.has(d.versionId)))))return;
   // Wait for the canvas batch, then read the latest coordinator snapshot. No old
   // renderer closure may overwrite an edit that occurred during IPC.
   const assets=await bridge.listAssets({projectId:a.projectId});if(!current(ticket)||latest.current.blocked)return;
   await latest.current.canvas.current?.flushPending();if(!current(ticket)||latest.current.blocked)return;
   const now=latest.current,record=now.sync.getRecord(),handle=now.canvas.current;
   if(!record||!handle||record.document.id!==a.canvasId)return;
   now.setAssets(assets);
   const delivery=deliverGenerationResults(handle.getDocument(),record.panel,next);
   if(delivery.panel.generationDeliveries.length!==record.panel.generationDeliveries.length){
    // A single synchronous mutation produces both graph + receipt persistence.
    // The canvas deliberately does not publish a second graph-only autosave.
    if(!handle.applyDocument(delivery.document,false))return;
    now.sync.edit(delivery);await now.sync.flush();
   }
  }catch(cause){if(current(ticket))setError(generationError(cause));}finally{polling.current=false;}
 }
 useEffect(()=>{setRuns([]);setReview(undefined);setError('');void refresh(scope);const timer=setInterval(()=>void refresh(scope),900);return()=>clearInterval(timer);},[scope]);
 async function operation(action:(ticket:string)=>Promise<void>){if(pendingRef.current||latest.current.blocked)return;pendingRef.current=true;setPending(true);setError('');const ticket=scopeRef.current;try{await action(ticket);}catch(cause){if(current(ticket))setError(generationError(cause));}finally{pendingRef.current=false;setPending(false);}}
 function prepare(nodeId:string){return operation(async ticket=>{
  const a=latest.current;if(!a.projectId||!a.canvasId)return;
  await a.canvas.current?.flushPending();await a.sync.flush();if(!await a.saveProduct())throw Error('SAVE_FAILED');if(!current(ticket))return;
  const plan=await bridge.prepareImageGeneration({projectId:a.projectId,canvasId:a.canvasId,nodeId});
  if(!current(ticket)){await bridge.stopImageGeneration({projectId:a.projectId,runId:plan.id});return;}
  const handle=latest.current.canvas.current;if(handle){const doc=handle.getDocument();handle.applyDocument({...doc,nodes:doc.nodes.map(n=>n.id===nodeId?{...n,runId:plan.id}:n)});}
  setReview(plan);setRuns(previous=>[plan,...previous.filter(r=>r.id!==plan.id)]);
 });}
 function confirm(){return operation(async ticket=>{if(!review)return;const run=await bridge.confirmImageGeneration({projectId:review.projectId,runId:review.id});if(!current(ticket))return;setRuns(previous=>[run,...previous.filter(r=>r.id!==run.id)]);setReview(undefined);void refresh(ticket);});}
 function cancel(){return operation(async ticket=>{if(!review)return;await bridge.stopImageGeneration({projectId:review.projectId,runId:review.id});if(current(ticket)){setReview(undefined);void refresh(ticket);}});}
 function act(run:GenerationRun,action:'resume'|'stop'|'bind',slotIndex?:number,remoteId?:string){return operation(async ticket=>{const target={projectId:run.projectId,runId:run.id};await (action==='resume'?bridge.resumeImageGeneration(target):action==='stop'?bridge.stopImageGeneration(target):bridge.bindImageGenerationTask({...target,slotIndex:slotIndex!,remoteId:remoteId!}));if(current(ticket))await refresh(ticket);});}
 function adapt(run:GenerationRun,slotIndex:number,fit:'contain'|'cover',background:string){return operation(async ticket=>{await bridge.adaptImageGenerationOutput({projectId:run.projectId,runId:run.id,slotIndex,fit,background});if(current(ticket))await refresh(ticket);});}
 return {runs,review,error,pending,prepare,confirm,cancel,act,adapt,refresh};
}
