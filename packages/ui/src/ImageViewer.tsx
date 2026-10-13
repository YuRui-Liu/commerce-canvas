import {useLayoutEffect,useRef,useState} from 'react';
import type {AssetVersion} from '../../contracts/src/domain';
import {Dialog} from './Dialog';
import {fitScale} from './imageViewport';
import './images.css';
export function ImageViewport({assets,compare=false}:{assets:AssetVersion[];compare?:boolean}){
 const [mode,setMode]=useState<'side'|'slider'>('side');const [scale,setScale]=useState(1);const [fit,setFit]=useState(true);const [split,setSplit]=useState(50);const [pan,setPan]=useState({x:0,y:0});
 const stage=useRef<HTMLDivElement>(null);const drag=useRef<{x:number;y:number;pan:{x:number;y:number}}|null>(null);
 useLayoutEffect(()=>{const element=stage.current!;const resize=()=>{if(fit){setScale(fitScale(assets.map(a=>({width:a.width!,height:a.height!})),{width:element.clientWidth,height:element.clientHeight},compare&&mode==='side'));setPan({x:0,y:0});}};resize();const observer=new ResizeObserver(resize);observer.observe(element);return ()=>observer.disconnect();},[assets,compare,mode,fit]);
 const image=(asset:AssetVersion)=><img draggable={false} src={`commerce-asset://asset/${asset.id}/original`} alt="原始商品素材" style={{width:asset.width!,height:asset.height!,transform:`translate(-50%,-50%) translate(${pan.x}px,${pan.y}px) scale(${scale})`}}/>;
 return <><div className="image-tools"><button onClick={()=>{setFit(true);setPan({x:0,y:0});}}>适合窗口</button><button onClick={()=>{setFit(false);setScale(1);setPan({x:0,y:0});}}>实际像素 1:1</button><button aria-label="缩小图片" onClick={()=>{setFit(false);setScale(s=>Math.max(.01,s/1.25));}}>−</button><output aria-label="图片缩放">{Math.round(scale*100)}%</output><button aria-label="放大图片" onClick={()=>{setFit(false);setScale(s=>Math.min(8,s*1.25));}}>+</button>{compare&&<><button aria-pressed={mode==='side'} onClick={()=>setMode('side')}>并排</button><button aria-pressed={mode==='slider'} onClick={()=>setMode('slider')}>滑杆</button></>}</div>
 <div className={`image-stage ${compare&&mode==='side'?'image-side':''}`} ref={stage} data-scale={scale} onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,pan};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current){setFit(false);setPan({x:drag.current.pan.x+e.clientX-drag.current.x,y:drag.current.pan.y+e.clientY-drag.current.y});}}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onWheel={e=>{setFit(false);setScale(s=>Math.min(8,Math.max(.01,s*(e.deltaY<0?1.1:1/1.1))));}}>
 {assets.map((asset,index)=><div className="image-pane" key={`${asset.id}-${index}`} style={compare&&mode==='slider'?{position:'absolute',inset:0,clipPath:index===1?`inset(0 ${100-split}% 0 0)`:undefined}:undefined}>{image(asset)}</div>)}
 </div>{compare&&mode==='slider'&&<label>对比滑杆<input aria-label="对比滑杆" type="range" min={0} max={100} value={split} onChange={e=>setSplit(Number(e.target.value))}/></label>}<small>原始图片 · 同一像素缩放与平移基准 · {assets.map(a=>`${a.width} × ${a.height}`).join(' / ')}</small></>;
}
export function ImageViewer({asset,onClose}:{asset:AssetVersion;onClose:()=>void}){return <Dialog title="原始图片" onClose={onClose}><ImageViewport assets={[asset]}/></Dialog>;}
