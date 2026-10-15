import {memo,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Handle,Position,useViewport,type Node,type NodeProps} from '@xyflow/react';
import type {CanvasNode} from '../../../contracts/src/canvas';
import type {AssetVersion,InputRole} from '../../../contracts/src/domain';
import {GenerationSettingsSchema,type GenerationRun} from '../../../contracts/src/imageGeneration';
import {Dialog} from '../../../ui/src/Dialog';
export type GenerationNodeData={node:CanvasNode;inputs:{edgeId:string;role:InputRole;asset?:AssetVersion}[];editorVisible:boolean;connecting:boolean;detach:(edgeId:string)=>void;closeEditor:()=>void;view:(asset:AssetVersion)=>void;results:AssetVersion[];renderGeneration?:(node:CanvasNode)=>ReactNode;generationStatus?:string;generationRun?:GenerationRun};
const names:Record<InputRole,string>={product:'商品',scene:'场景',style:'风格',facts:'资料',instruction:'指令',copy:'文案'};
export const ImageGenerationNode=memo(function ImageGenerationNode({data}:NodeProps<Node<GenerationNodeData>>){
 const run=data.generationRun,[expanded,setExpanded]=useState(false),{zoom,x:viewportX,y:viewportY}=useViewport();
 const compact=zoom<.65||zoom>1.5;
 const cardRef=useRef<HTMLElement>(null),editorRef=useRef<HTMLDivElement>(null),[offset,setOffset]=useState({x:0,y:0});
 useLayoutEffect(()=>{
  if(!data.editorVisible||expanded)return;const card=cardRef.current,editor=editorRef.current,surface=card?.closest('.react-flow');if(!card||!editor||!surface)return;
  const position=()=>{const body=card.getBoundingClientRect(),panel=editor.getBoundingClientRect(),bounds=surface.getBoundingClientRect(),baseY=body.bottom+14*zoom,baseX=body.x+body.width/2;
   const y=(Math.max(bounds.top+12,Math.min(baseY,bounds.bottom-panel.height-12))-baseY)/zoom;
   const x=(Math.max(bounds.left+panel.width/2+12,Math.min(baseX,bounds.right-panel.width/2-12))-baseX)/zoom;
   setOffset(previous=>Math.abs(previous.x-x)<.1&&Math.abs(previous.y-y)<.1?previous:{x,y});};
  position();const observer=new ResizeObserver(position);observer.observe(editor);observer.observe(surface);window.addEventListener('resize',position);return()=>{observer.disconnect();window.removeEventListener('resize',position);};
 },[data.editorVisible,expanded,zoom,viewportX,viewportY,data.node.position.x,data.node.position.y]);
 const [resultIndex,setResultIndex]=useState(0);
 useEffect(()=>{if(!data.editorVisible)setExpanded(false);},[data.editorVisible]);
 useEffect(()=>setResultIndex(0),[run?.id]);
 const parsed=GenerationSettingsSchema.safeParse(data.node.generation);
 const modified=!!run&&(!parsed.success||JSON.stringify(parsed.data)!==JSON.stringify(run.settings));
 const outputIds=run?.slots.flatMap(s=>s.resultVersionId?[s.resultVersionId]:[])??[];
 const result=outputIds[Math.min(resultIndex,Math.max(0,outputIds.length-1))],resultAsset=data.results.find(a=>a.id===result);
 const references=<div className="generation-references" aria-label="参考素材">{data.inputs.length?data.inputs.map(input=><div className="reference-chip" key={input.edgeId}>{input.asset?.kind==='image'?<img src={`commerce-asset://asset/${input.asset.id}/thumbnail`} alt={`${names[input.role]}参考图`}/>:<span className="reference-text-icon">T</span>}<span>{names[input.role]}<small>{input.asset?.kind==='text'?input.asset.text?.slice(0,16):'已连接'}</small></span><button aria-label={`解绑${names[input.role]}参考`} title="仅移除连接，保留素材" onClick={()=>data.detach(input.edgeId)}>×</button></div>):<span className="reference-empty">从素材的输出点连接商品、场景或文字参考</span>}</div>;
 const editor=<>{references}{data.renderGeneration?.(data.node)}</>;
 return <article ref={cardRef} className={`generation-card ${data.editorVisible?'editing':''}`}>
 <header><span className="generation-symbol">✦</span><div><strong>图片生成</strong><small>IMAGE STUDIO</small></div><span className="generation-state">{data.generationStatus||'待生成'}</span></header>
 <div className={`generation-ports ${data.editorVisible||data.connecting?'ports-visible':''}`}>{(['product','scene','style','facts','instruction','copy'] as InputRole[]).map((role,index)=><div className="generation-port" key={role} style={{top:68+index*30}}><Handle type="target" position={Position.Left} id={role} aria-label={`${names[role]}输入`}/><span>{names[role]}</span></div>)}</div>
 <div className="generation-image-body">{result?<button className="generation-main-preview nodrag" aria-label="查看生成原图" disabled={!resultAsset} onDoubleClick={()=>resultAsset&&data.view(resultAsset)} onClick={()=>resultAsset&&data.view(resultAsset)}><img src={`commerce-asset://asset/${result}/thumbnail`} alt="最新生成结果"/></button>:<div className="generation-placeholder"><svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="8" y="8" width="32" height="32" rx="7" stroke="currentColor"/><path d="m9 32 10-10 8 8 6-5 7 7" stroke="currentColor"/><circle cx="31" cy="17" r="3" stroke="currentColor"/></svg><strong>{run?'等待生成结果':'让想法成为画面'}</strong><small>{data.inputs.length?`${data.inputs.length} 份参考已连接`:'选择节点，写下你的画面描述'}</small></div>}</div>
 {outputIds.length>1&&<div className="generation-result-navigation nodrag"><button aria-label="上一张结果" onClick={()=>setResultIndex(i=>(i-1+outputIds.length)%outputIds.length)}>‹</button><span>{resultIndex+1} / {outputIds.length}</span><button aria-label="下一张结果" onClick={()=>setResultIndex(i=>(i+1)%outputIds.length)}>›</button></div>}
 <div className="generation-image-caption"><span>{data.node.generation?.ratio??'1:1'} · {data.node.generation?.resolution??'1K'}</span><span>{run?.slots.filter(s=>s.resultVersionId).length??0} 张结果</span></div>
 {run&&<section className="generation-card-snapshot" aria-label="本次生成快照"><p>{run.request.model} · {run.request.width} × {run.request.height} px · {run.settings.count} 张</p>{modified&&<small className="generation-card-modified">参数已修改，仅影响下一次生成。</small>}</section>}
 {data.editorVisible&&!expanded&&<div ref={editorRef} style={{transform:`translate(calc(-50% + ${offset.x}px), ${offset.y}px)`}} className={`generation-floating-editor nodrag nowheel nopan ${compact?'compact-editor':''}`} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'&&!e.nativeEvent.isComposing)data.closeEditor();}} onWheel={e=>e.stopPropagation()}>{compact?<button className="button primary" style={{fontSize:13/zoom,minHeight:36/zoom,padding:`${6/zoom}px ${12/zoom}px`}} onClick={()=>setExpanded(true)}>展开编辑器 ↗</button>:<><div className="editor-heading"><span>创作设置</span><button aria-label="展开编辑器" onClick={()=>setExpanded(true)}>↗</button></div>{editor}</>}</div>}
 {data.editorVisible&&expanded&&<Dialog title="编辑图片生成" onClose={()=>setExpanded(false)}><div className="expanded-generation-editor nodrag nowheel nopan">{editor}</div></Dialog>}
 <Handle type="source" position={Position.Right} id="output" aria-label="生成输出"/>
 </article>;});
