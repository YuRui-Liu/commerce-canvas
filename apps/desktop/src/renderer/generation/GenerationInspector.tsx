import {useState} from 'react';
import type {CanvasNode} from '../../../../../packages/contracts/src/canvas';
import {defaultGenerationSettings,type GenerationRun,type GenerationSettings,type GenerationSlot} from '../../../../../packages/contracts/src/imageGeneration';
import {GenerationControls} from './GenerationControls';
import {runLabel} from './useGenerationRuns';
import {Dialog} from '../../../../../packages/ui/src/Dialog';
type Actions={onAct:(run:GenerationRun,action:'resume'|'stop'|'bind',slotIndex?:number,remoteId?:string)=>void;onAdapt:(run:GenerationRun,slot:number,fit:'contain'|'cover',background:string)=>void};
const slotNames={queued:'等待提交',submitting:'正在提交',running:'正在生成',downloading:'正在归档',succeeded:'已归档',failed:'失败',unknown:'状态待确认',cancelled:'已停止'};
function Slot({run,slot,busy,onAct,onAdapt}:Actions&{run:GenerationRun;slot:GenerationSlot;busy:boolean}){
 const [bind,setBind]=useState(false),[remote,setRemote]=useState(''),[accepted,setAccepted]=useState(false),[fit,setFit]=useState<'contain'|'cover'>('contain'),[background,setBackground]=useState('#ffffff');
 return <article className="generation-slot"><div className="section-title"><strong>图片 {slot.slotIndex+1}</strong><span>{slotNames[slot.status]}{slot.progress!==null?` · ${slot.progress}%`:''}</span></div>
  {slot.resultVersionId&&<img className="generation-result-preview" src={`commerce-asset://asset/${slot.resultVersionId}/thumbnail`} alt={`生成结果 ${slot.slotIndex+1}`}/>}
  {slot.actualWidth&&<p>实际 {slot.actualWidth} × {slot.actualHeight} px<br/><small>请求 {run.request.width} × {run.request.height} px</small></p>}
  {slot.warning?.includes('DIMENSIONS_DIFFER')&&<p className="generation-warning">实际尺寸与请求尺寸不同，原图已保留。</p>}
  {slot.warning?.includes('BOUND_TASK_INPUTS_UNVERIFIED')&&<p className="generation-warning">此任务由手动绑定，无法核实与输入快照一致。</p>}
  {slot.error&&<p className="error">{slot.status==='unknown'?'提交或查询状态尚未确认，不会自动重新提交。':slot.status==='downloading'?'下载尚未完成，可以继续收取结果。':'这张图片未成功生成；其他成功结果已保留。'}</p>}
  {slot.status==='unknown'&&!slot.remoteId&&<button className="button" disabled={busy} onClick={()=>setBind(true)}>绑定已有任务 ID</button>}
  {slot.resultVersionId&&<details><summary>适配为目标尺寸</summary><label>适配方式<select value={fit} onChange={e=>setFit(e.target.value as 'contain'|'cover')}><option value="contain">完整保留 · 留白</option><option value="cover">填满画幅 · 裁切</option></select></label><label>背景颜色<input type="color" value={background} onChange={e=>setBackground(e.target.value)}/></label><p className="muted">将保存一个新版本，原始图片保持不变。</p><button className="button" disabled={busy} onClick={()=>onAdapt(run,slot.slotIndex,fit,background)}>创建适配版本</button></details>}
  {slot.derivatives.map(d=><div className="generation-derivative" key={d.versionId}><img src={`commerce-asset://asset/${d.versionId}/thumbnail`} alt="适配版本"/><span>{d.width} × {d.height}<small>{d.fit==='contain'?'完整保留':'裁切'} · 新版本</small></span></div>)}
  {bind&&<Dialog title="绑定已有任务" onClose={()=>setBind(false)}><p>仅验证服务端存在此任务，不能保证它与当前输入、提示词相匹配。绑定后只查询并收取结果，不重新提交。</p><label>任务 ID<input value={remote} maxLength={200} onChange={e=>setRemote(e.target.value)}/></label><label className="generation-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>我确认需要关联这个已有任务</label><div className="dialog-actions"><button className="button" onClick={()=>setBind(false)}>取消</button><button className="button primary" disabled={!accepted||!remote.trim()||busy} onClick={()=>{onAct(run,'bind',slot.slotIndex,remote.trim());setBind(false);}}>确认绑定</button></div></Dialog>}
 </article>;
}
export function GenerationInspector({node,runs,busy,error,onChange,onGenerate,onClose,onAct,onAdapt}:Actions&{node?:CanvasNode;runs:GenerationRun[];busy:boolean;error:string;onChange:(settings:GenerationSettings)=>void;onGenerate:()=>void;onClose:()=>void}){
 const [historyId,setHistoryId]=useState<string>();const current=runs.find(r=>r.id===(historyId??node?.runId))??runs[0];
 return <aside className="right-panel generation-inspector"><div className="panel-heading"><h2>{node?'图片生成':'生成历史'}</h2><button className="button" onClick={onClose}>关闭</button></div><div className="generation-inspector-body">
  {node?.kind==='generation'&&<><p className="muted">连接商品与参考素材，调整画面表达。</p><GenerationControls value={node.generation??defaultGenerationSettings()} onChange={onChange} onGenerate={onGenerate} busy={busy}/></>}
  <section className="generation-history"><h3>生成记录 <small>{runs.length} 次</small></h3>{!runs.length?<p className="muted">还没有生成记录。每次确认后的参数与输入都会保留。</p>:<label>历史任务<select value={current?.id??''} onChange={e=>setHistoryId(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString('zh-CN')} · {runLabel(r)}</option>)}</select></label>}
  {current&&<><p className="generation-run-state">{runLabel(current)}</p>{node?.generation&&JSON.stringify(node.generation)!==JSON.stringify(current.settings)&&<p className="generation-warning">参数已修改，仅影响下一次生成。</p>}
   <details><summary>本次参数与输入快照</summary><p>{current.request.model} · {current.request.width} × {current.request.height} · {current.settings.count} 张</p><pre className="generation-prompt">{JSON.stringify(current.settings.photography,null,2)}</pre>{current.inputs.map((i,index)=><div key={index} className="generation-derivative">{i.kind==='image'&&<img src={`commerce-asset://asset/${i.versionId}/thumbnail`} alt={`${i.role} 历史输入`}/>}<span>{i.role} · {i.kind==='text'?i.text:i.versionId}</span></div>)}</details>
   <details><summary>完整生成指令</summary><pre className="generation-prompt">{current.request.prompt}</pre></details>
   {!current.approvedAt&&current.status==='queued'&&<button className="button" disabled={busy} onClick={()=>onAct(current,'stop')}>取消未提交计划</button>}
   {current.approvedAt&&<div className="generation-run-actions">{current.slots.some(s=>s.status==='downloading'||s.remoteId&&['running','unknown'].includes(s.status))&&<button className="button" disabled={busy} onClick={()=>onAct(current,'resume')}>继续查询 / 收取结果</button>}{current.slots.some(s=>s.status==='queued')&&!current.stopRequested&&<><button className="button" disabled={busy} onClick={()=>onAct(current,'stop')}>停止未提交任务</button><small>已提交的任务仍会继续查询并收取。</small></>}</div>}
   {current.slots.map(slot=><Slot key={`${current.id}:${slot.slotIndex}`} run={current} slot={slot} busy={busy} onAct={onAct} onAdapt={onAdapt}/>)}</>}
  </section>{error&&<p role="alert" className="error">{error}</p>}
 </div></aside>;
}
