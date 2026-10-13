import {memo,type ReactNode} from 'react';
import {Handle,Position,type Node,type NodeProps} from '@xyflow/react';
import type {CanvasNode} from '../../../contracts/src/canvas';
import type {AssetVersion,InputRole} from '../../../contracts/src/domain';
export type GenerationNodeData={node:CanvasNode;inputs:{role:InputRole;asset?:AssetVersion}[];renderGeneration?:(node:CanvasNode)=>ReactNode;generationStatus?:string};
const names:Record<InputRole,string>={product:'商品',scene:'场景',style:'风格',facts:'资料',instruction:'指令',copy:'文案'};
export const ImageGenerationNode=memo(function ImageGenerationNode({data}:NodeProps<Node<GenerationNodeData>>){return <article className="generation-card">
 <header><span className="generation-symbol">✦</span><div><strong>图片生成</strong><small>IMAGE STUDIO</small></div><span className="generation-state">{data.generationStatus||'待生成'}</span></header>
 <div className="generation-inputs">{(['product','scene','style','facts','instruction','copy'] as InputRole[]).map(role=>{const input=data.inputs.find(i=>i.role===role);return <div key={role} className={input?'connected':''}><Handle type="target" position={Position.Left} id={role} aria-label={`${names[role]}输入`}/>{input?.asset?.kind==='image'&&<img src={`commerce-asset://asset/${input.asset.id}/thumbnail`} alt={names[role]+'参考图'}/>}<span>{names[role]}</span><small>{input?'已连接':'＋'}</small></div>;})}</div>
 {data.renderGeneration?.(data.node)}<Handle type="source" position={Position.Right} id="output" aria-label="生成输出"/>
 </article>;});
