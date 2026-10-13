import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { AssetVersion, Project } from '../../../../../packages/contracts/src/domain';
import type { CanvasDocument } from '../../../../../packages/contracts/src/canvas';
import { Canvas, type CanvasHandle } from '../../../../../packages/canvas/src/Canvas';
import { Button } from '../../../../../packages/ui/src/Button';
import { Icon } from './LeftRail';
export const CanvasRegion=forwardRef<CanvasHandle,{
  project?:Project;assets:AssetVersion[];onView:(asset:AssetVersion)=>void;right:boolean;busy:boolean;
  toggleRight:()=>void;upload:()=>void;addText:()=>void;create:()=>void;
}>(function CanvasRegion({project,assets,onView,right,busy,toggleRight,upload,addText,create},ref){
  const [documents,setDocuments]=useState<Record<string,CanvasDocument>>({});
  const canvas=useRef<CanvasHandle>(null);
  const id=project?.id??'unassigned';
  const document=documents[id]??{id,projectId:project?.id??null,revision:1,nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}};
  useImperativeHandle(ref,()=>({addAssets:(items,position)=>canvas.current?.addAssets(items,position),getDocument:()=>canvas.current?.getDocument()??document}),[document]);
  return <main className="canvas-main">
    <div className="canvas-toolbar"><div><strong>{project?.name??'商品创作工作区'}</strong><small>画布</small></div><Button variant="quiet" aria-pressed={right} onClick={toggleRight}>{right?'收起助手':'展开助手'}</Button></div>
    <div className="canvas-surface">
      {project&&<Canvas key={id} ref={canvas} document={document} assets={assets} onView={onView} onChange={next=>setDocuments(d=>({...d,[id]:next}))}/>}
      {!document.nodes.length&&<div className="canvas-empty" style={{pointerEvents:'none',position:'relative',zIndex:2}}>
        <span className="canvas-emblem"><Icon kind="assets"/></span><p className="eyebrow">你的下一张商品图，从这里开始</p>
        <h1>{project?'给商品一个新的表达。':'把商品与灵感，放在一起。'}</h1>
        <p>{project?'上传商品图片或添加文本，为创作准备素材。':'创建商品项目，把图片、SKU 和品牌资料放在一起。'}</p>
        <div className="empty-actions" style={{pointerEvents:'auto'}}>{project?<><Button variant="primary" disabled={busy} onClick={upload}><Icon kind="upload"/>上传图片</Button><Button onClick={addText} disabled={busy}>添加文本</Button></>:<Button variant="primary" disabled={busy} onClick={create}>创建项目</Button>}</div>
        <small>{project?'从素材库添加到画布，连接输入来组织创作。':'图片保持原始色彩，素材保存在本机。'}</small>
      </div>}
    </div>
  </main>;
});
