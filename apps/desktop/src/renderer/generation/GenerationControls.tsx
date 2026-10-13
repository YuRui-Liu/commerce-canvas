import {useState} from 'react';
import type {GenerationSettings} from '../../../../../packages/contracts/src/imageGeneration';
import {resolveGenerationSettings} from '../../../../../packages/runtime/src/imageGeneration/settings';
import {PhotographyDialog} from './PhotographyDialog';
import './generation.css';
export function GenerationControls({value,onChange,onGenerate,busy=false}:{value:GenerationSettings;onChange:(value:GenerationSettings)=>void;onGenerate:()=>void;busy?:boolean}){
 const [photo,setPhoto]=useState(false);
 const patch=(p:Partial<GenerationSettings>)=>{if(!busy)onChange({...value,...p});};
 let dimensions='',error='';try{const size=resolveGenerationSettings(value);dimensions=`${size.width} × ${size.height} px`;}catch{error='尺寸无效：VIP 边长须为 16 的倍数，面积 655,360–8,294,400 px，最长边 3840，比例不超过 3:1。';}
 return <fieldset disabled={busy} className="generation-controls nodrag nowheel nopan" onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
  <label>画面描述<textarea rows={4} maxLength={6000} placeholder="描述商品画面、环境与需要保留的细节…" value={value.prompt} onChange={e=>patch({prompt:e.target.value})}/></label>
  <div className="generation-field-grid">
   <label>模型<select aria-label="模型" value={value.model} onChange={e=>patch({model:e.target.value as GenerationSettings['model'],resolution:'1K',width:undefined,height:undefined})}><option value="gpt-image-2">GPT Image 2</option><option value="gpt-image-2-vip">GPT Image 2 VIP</option></select></label>
   <label>画幅比例<select aria-label="画幅比例" value={value.ratio} onChange={e=>patch({ratio:e.target.value as GenerationSettings['ratio']})}>{['1:1','3:4','4:3','2:3','3:2','9:16','16:9'].map(r=><option key={r}>{r}</option>)}</select></label>
   <label>分辨率<select aria-label="分辨率" value={value.resolution} onChange={e=>patch({resolution:e.target.value as GenerationSettings['resolution'],width:e.target.value==='custom'?1024:undefined,height:e.target.value==='custom'?1024:undefined})}>{['1K','2K','4K','custom'].map(r=><option key={r} value={r} disabled={value.model==='gpt-image-2'&&r!=='1K'}>{r==='custom'?'自定义':r}{value.model==='gpt-image-2'&&r!=='1K'?' · 仅 VIP':''}</option>)}</select></label>
   <label>生成数量<select aria-label="生成数量" value={value.count} onChange={e=>patch({count:Number(e.target.value)})}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} 张</option>)}</select></label>
  </div>
  {value.resolution==='custom'&&<div className="generation-field-grid"><label>宽度 px<input type="number" min={16} max={3840} step={16} value={value.width??''} onChange={e=>patch({width:Number(e.target.value)>0?Math.floor(Number(e.target.value)):undefined})}/></label><label>高度 px<input type="number" min={16} max={3840} step={16} value={value.height??''} onChange={e=>patch({height:Number(e.target.value)>0?Math.floor(Number(e.target.value)):undefined})}/></label></div>}
  <p className="generation-dimensions">{dimensions||'请调整尺寸'}{value.model==='gpt-image-2'&&<small>普通模型仅支持 1K</small>}</p>
  <button type="button" className="generation-photo-button" onClick={()=>setPhoto(true)}>摄影与灯光<span>{value.photography.camera==='auto'&&value.photography.lighting==='auto'?'自动':'已配置'} ↗</span></button>
  {error&&<p className="error" role="alert">{error}</p>}
  <button className="button primary generation-submit" disabled={busy||!!error} onClick={onGenerate}>{busy?'正在准备…':'生成图片'}<span aria-hidden="true">↗</span></button>
  <small>先确认参数，再提交至 GRSai。</small>
  {photo&&<PhotographyDialog value={value.photography} onApply={photography=>{patch({photography});setPhoto(false);}} onClose={()=>setPhoto(false)}/>}
 </fieldset>;
}
