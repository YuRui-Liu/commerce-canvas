import type {AssetVersion,InputRole} from '../../../../../packages/contracts/src/domain';
import {InputRoleSchema} from '../../../../../packages/contracts/src/domain';
import type {CanvasDocument,CanvasNode} from '../../../../../packages/contracts/src/canvas';
import {canConnect} from '../../../../../packages/canvas/src/graph';
import {TextInspector} from './TextInspector';
import {Button} from '../../../../../packages/ui/src/Button';
const labels:Record<InputRole,string>={product:'商品',scene:'场景',style:'风格',facts:'资料依据',instruction:'任务指令',copy:'文案'};
export function AssetInspector({node,asset,document,draft,onDraft,onSave,onRole,onClose,onFacts,busy}:{node:CanvasNode;asset?:AssetVersion;document:CanvasDocument;draft:string;onDraft:(value:string)=>void;onSave:()=>void;onRole:(edgeId:string,role:InputRole)=>void;onClose:()=>void;onFacts:()=>void;busy:boolean}){
 return <aside className="right-panel asset-inspector" aria-label="素材检查器"><div className="panel-heading"><h2>素材检查器</h2><Button onClick={onClose}>商品资料</Button></div><div className="panel-scroll">
 <p>{asset?.kind==='text'?'文本素材':asset?.kind==='image'?`${asset.width} × ${asset.height}`:'Agent 输入'}{node.stale?' · 需要更新':''}</p>
 {asset?.kind==='text'&&<TextInspector value={draft} onChange={onDraft} onSave={onSave} busy={busy}/>}
 <h3>连接角色</h3><p>角色仅作用于这条连接。资料依据描述商品事实；任务指令描述本次操作。</p>
 {document.edges.filter(e=>e.source===node.id||e.target===node.id).map(edge=><label key={edge.id}>连接 {edge.id.slice(0,8)}<select aria-label={`连接角色 ${edge.id}`} value={edge.role} disabled={busy} onChange={e=>onRole(edge.id,e.target.value as InputRole)}>{InputRoleSchema.options.map(role=><option key={role} value={role} disabled={role!==edge.role&&!canConnect({...document,edges:document.edges.filter(e=>e.id!==edge.id)},edge.source,edge.target,role)}>{labels[role]}</option>)}</select></label>)}
 {!document.edges.some(e=>e.target===node.id&&(e.role==='facts'||e.role==='product'))&&<div><p>尚未连接商品依据，请补充商品资料或连接商品、资料素材。</p><Button onClick={onFacts}>补充商品依据</Button></div>}
 </div></aside>;
}
