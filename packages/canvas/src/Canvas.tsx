import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, applyNodeChanges, type Node, type NodeProps, type ReactFlowInstance, type Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CanvasDocument, CanvasNode } from '../../contracts/src/canvas';
import { InputRoleSchema, type AssetVersion, type InputRole } from '../../contracts/src/domain';
import { canConnect, groupNodes, ungroupNodes, layout, alignLeft } from './graph';
import { commit, createHistory, undo, redo } from './history';
import './canvas.css';
const roleNames:Record<InputRole,string>={product:'商品',scene:'场景',style:'风格',facts:'资料',instruction:'指令',copy:'文案'};
type NodeData={node:CanvasNode;asset?:AssetVersion;view:(a:AssetVersion)=>void};
const Card=memo(function Card({data}:NodeProps<Node<NodeData>>){
  const {node,asset,view}=data;
  if(node.kind==='group')return <div className="graph-group-label">素材分组</div>;
  return <article className="graph-card">
    <header>{node.kind==='agent'?'Agent':node.kind==='output'?'输出':asset?.kind==='text'?'文本素材':'图片素材'}<small>{node.kind==='agent'?'未配置':node.kind==='output'?'尚无产物':'本地引用'}</small></header>
    {asset?.kind==='image'?<button className="nodrag nowheel graph-preview" onClick={()=>view(asset)} aria-label="查看原始素材"><img loading="lazy" src={`commerce-asset://asset/${asset.id}/thumbnail`} alt="商品素材"/></button>:asset?.kind==='text'?<button className="nodrag nowheel graph-text" onClick={()=>view(asset)}>{asset.text?.slice(0,200)}</button>:<p>{node.kind==='agent'?'连接输入素材，配置能力后再运行。':node.kind==='output'?'运行结果将以资产引用展示。':'素材不可用，请检查当前项目。'}</p>}
    <div className="graph-inputs">{InputRoleSchema.options.map(role=><div key={role}><Handle type="target" position={Position.Left} id={role} aria-label={`${roleNames[role]}输入`}/><span>{roleNames[role]}</span></div>)}</div>
    <Handle type="source" position={Position.Right} id="output" aria-label="输出连接"/>
  </article>;
});
const nodeTypes={asset:Card,text:Card,agent:Card,output:Card,group:Card};
export type CanvasHandle={addAssets:(assets:AssetVersion[],position?:{x:number;y:number})=>void;getDocument:()=>CanvasDocument};
// document is the initial document for this mount. Use a load epoch/key for explicit
// replacement; revisions emitted by onChange must not remount/reset gesture history.
export type CanvasProps={document:CanvasDocument;assets:AssetVersion[];onChange:(doc:CanvasDocument)=>void;onView:(asset:AssetVersion)=>void;onSelectionChange?:(ids:string[])=>void};
export const Canvas=forwardRef<CanvasHandle,CanvasProps>(function Canvas({document,assets,onChange,onView,onSelectionChange},ref){
  const [history,setHistory]=useState(()=>createHistory(document));const current=useRef(document);const hist=useRef(history);hist.current=history;
  const [selection,setSelection]=useState<string[]>([]);const [message,setMessage]=useState('');const [snap,setSnap]=useState(true);
  const [edgeSelection,setEdgeSelection]=useState<string[]>([]);
  const flow=useRef<ReactFlowInstance<Node<NodeData>>|null>(null);const dragStart=useRef<CanvasDocument|null>(null);
  // Parent keys the component by document ID; viewport is never reset for resize/theme.
  const update=useCallback((next:CanvasDocument,record=true)=>{current.current=next;setHistory(h=>record?commit(h,next):{...h,present:next});onChange(next);},[onChange]);
  const addAssets=useCallback((items:AssetVersion[],position?:{x:number;y:number})=>{
    const start=position??flow.current?.screenToFlowPosition({x:innerWidth/2,y:innerHeight/2})??{x:0,y:0};
    let index=0;const before=current.current;
    const nextBatch=()=>{const batch=items.slice(index,index+25);const offset=index;index+=batch.length;
      update({...current.current,nodes:[...current.current.nodes,...batch.map((a,i):CanvasNode=>({id:crypto.randomUUID(),kind:a.kind==='text'?'text':'asset',assetVersionId:a.id,position:{x:start.x+((offset+i)%4)*280,y:start.y+Math.floor((offset+i)/4)*280}}))]},false);
      if(index<items.length)requestAnimationFrame(nextBatch);else setHistory(h=>commit({...h,present:before},current.current));};
    if(items.length)nextBatch();
  },[update]);
  useImperativeHandle(ref,()=>({addAssets,getDocument:()=>current.current}),[addAssets]);
  const data=history.present;
  const assetMap=useMemo(()=>new Map(assets.map(a=>[a.id,a])),[assets]);
  const nodes=useMemo(()=>data.nodes.map(n=>({id:n.id,type:n.kind,position:n.position,parentId:n.parentId,selected:selection.includes(n.id),style:n.kind==='group'?{width:n.width,height:n.height}:undefined,data:{node:n,asset:n.assetVersionId?assetMap.get(n.assetVersionId):undefined,view:onView}})),[data.nodes,selection,assetMap,onView]);
  const edges=useMemo(()=>data.edges.map(e=>({...e,selected:edgeSelection.includes(e.id),targetHandle:e.role,sourceHandle:'output',label:roleNames[e.role]})),[data.edges,edgeSelection]);
  const selectionChanged=useCallback(({nodes:chosen}:{nodes:Node[]})=>{onSelectionChange?.(chosen.map(n=>n.id));},[onSelectionChange]);
  const connect=useCallback((c:Connection)=>{const role=InputRoleSchema.safeParse(c.targetHandle);if(!role.success||!canConnect(current.current,c.source,c.target,role.data)){setMessage('无法连接：检查循环、输入角色是否已占用。');return;}update({...current.current,edges:[...current.current.edges,{id:crypto.randomUUID(),source:c.source,target:c.target,role:role.data}]});setMessage('已连接');},[update]);
  const historyAction=(action:typeof undo)=>{const result=action(hist.current);const next={...result,present:{...result.present,viewport:current.current.viewport}};setHistory(next);current.current=next.present;onChange(next.present);};
  const remove=()=>{const deleted=new Set(selection);let changed=true;while(changed){changed=false;for(const n of current.current.nodes)if(n.parentId&&deleted.has(n.parentId)&&!deleted.has(n.id)){deleted.add(n.id);changed=true;}}
    update({...current.current,nodes:current.current.nodes.filter(n=>!deleted.has(n.id)),edges:current.current.edges.filter(e=>!deleted.has(e.source)&&!deleted.has(e.target)&&!edgeSelection.includes(e.id))});setSelection([]);setEdgeSelection([]);};
  return <div className="graph-workspace" tabIndex={0} aria-label="无限画布" onKeyDown={event=>{
    const el=event.target as HTMLElement;if(event.nativeEvent.isComposing||el.isContentEditable||el.closest('input,textarea,select'))return;
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();remove();}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();historyAction(event.shiftKey?redo:undo);}
    if(event.key==='Escape'){setSelection([]);setEdgeSelection([]);onSelectionChange?.([]);}
  }}>
    <div className="graph-tools" role="toolbar" aria-label="画布工具">
      <button onClick={()=>historyAction(undo)} disabled={!history.past.length}>撤销</button><button onClick={()=>historyAction(redo)} disabled={!history.future.length}>重做</button>
      <button onClick={()=>flow.current?.fitView({padding:.2})}>适合视图</button>
      <button disabled={!selection.length&&!edgeSelection.length} title="仅从画布移除，保留素材文件" onClick={remove}>删除所选</button>
      <button disabled={selection.length<2} onClick={()=>{const id=crypto.randomUUID();const next=groupNodes(current.current,selection,id);if(next!==current.current){update(next);setSelection([id]);}}}>分组</button>
      <button disabled={!data.nodes.some(n=>n.kind==='group'&&selection.includes(n.id))} onClick={()=>update(ungroupNodes(current.current,selection))}>解组</button>
      <button disabled={selection.length<2} onClick={()=>update(alignLeft(current.current,selection))}>左对齐</button>
      <button disabled={!data.nodes.length} onClick={()=>update(layout(current.current))}>自动布局</button>
      <button aria-pressed={snap} onClick={()=>setSnap(!snap)}>吸附</button>
      <button onClick={()=>update({...current.current,nodes:[...current.current.nodes,{id:crypto.randomUUID(),kind:'agent',position:flow.current?.screenToFlowPosition({x:innerWidth/2,y:innerHeight/2})??{x:0,y:0}}]})}>添加 Agent</button>
    </div>
    <ReactFlow<Node<NodeData>> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={instance=>{flow.current=instance;}} defaultViewport={document.viewport}
      minZoom={.1} maxZoom={4} selectionOnDrag multiSelectionKeyCode="Shift" panOnDrag={[1,2]} panActivationKeyCode="Space" panOnScroll zoomOnPinch snapToGrid={snap} snapGrid={[16,16]} deleteKeyCode={null} onlyRenderVisibleElements
      onMoveEnd={(_,viewport)=>{const next={...current.current,viewport};current.current=next;setHistory(h=>({...h,present:next}));onChange(next);}}
      onSelectionChange={selectionChanged}
      onEdgesChange={changes=>{const selected=changes.filter(change=>change.type==='select');if(selected.length)setEdgeSelection(previous=>{const ids=new Set(previous);for(const change of selected){if(change.selected)ids.add(change.id);else ids.delete(change.id);}return [...ids];});}}
      onNodesChange={changes=>{const selected=changes.filter(c=>c.type==='select');if(selected.length)setSelection(previous=>{const ids=new Set(previous);for(const change of selected){if(change.selected)ids.add(change.id);else ids.delete(change.id);}return [...ids];});const positions=changes.filter(c=>c.type==='position');if(!positions.length)return;const changed=applyNodeChanges(positions,nodes);update({...current.current,nodes:current.current.nodes.map(n=>{const moved=changed.find(x=>x.id===n.id);return moved?{...n,position:moved.position}:n;})},false);}}
      onNodeDragStart={()=>{dragStart.current=current.current;}}
      onNodeDragStop={()=>{if(dragStart.current){const before=dragStart.current;setHistory(h=>commit({...h,present:before},current.current));dragStart.current=null;}}}
      onConnect={connect} isValidConnection={c=>{const role=InputRoleSchema.safeParse(c.targetHandle);return role.success&&canConnect(current.current,c.source,c.target,role.data);}}
      onEdgesDelete={removed=>update({...current.current,edges:current.current.edges.filter(e=>!removed.some(r=>r.id===e.id))})}>
      <Background gap={24}/><Controls showInteractive={false}/>
    </ReactFlow>
    <div className="graph-status" aria-live="polite">{message||`${data.nodes.length} 个节点 · 空格 / 中键平移 · Shift 多选`}</div>
  </div>;
});
