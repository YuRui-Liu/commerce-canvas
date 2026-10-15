import {useState} from 'react';
import type {GenerationSettings} from '../../../../../packages/contracts/src/imageGeneration';
import {resolveGenerationSettings} from '../../../../../packages/runtime/src/imageGeneration/settings';
import {Dialog} from '../../../../../packages/ui/src/Dialog';
import {PhotographyDialog} from './PhotographyDialog';
import {photographySummary} from './photographySummary';
import {SizePicker} from './SizePicker';
import './generation.css';
export function GenerationControls({value,onChange,onGenerate,busy=false}:{value:GenerationSettings;onChange:(value:GenerationSettings)=>void;onGenerate:()=>void;busy?:boolean}){
 const [panel,setPanel]=useState<'model'|'size'|'photo'|'count'|null>(null),[anchor,setAnchor]=useState<DOMRect>();
 const patch=(p:Partial<GenerationSettings>)=>{if(!busy)onChange({...value,...p});};
 const open=(kind:typeof panel,button:HTMLButtonElement)=>{setAnchor(button.getBoundingClientRect());setPanel(kind);};
 let dimensions='',error='';try{const size=resolveGenerationSettings(value);dimensions=`${size.width} × ${size.height} px`;}catch{error='尺寸无效：VIP 边长须为 16 的倍数，面积 655,360–8,294,400 px，最长边 3840，比例不超过 3:1。';}
 return <fieldset disabled={busy} className="generation-controls nodrag nowheel nopan" onKeyDown={e=>{if(e.key!=='Escape'||e.nativeEvent.isComposing)e.stopPropagation();}} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
  <label className="prompt-label"><textarea aria-label="画面描述" rows={3} maxLength={6000} placeholder="描述画面、环境，以及需要保留的商品细节…" value={value.prompt} onChange={e=>patch({prompt:e.target.value})}/></label>
  <div className="generation-parameter-bar">
   <button type="button" className="parameter-chip" aria-label="选择模型" onClick={e=>open('model',e.currentTarget)}>{value.model==='gpt-image-2-vip'?'Image 2 VIP':'Image 2'} <span>⌄</span></button>
   <button type="button" className="parameter-chip" aria-label="画幅与尺寸" onClick={e=>open('size',e.currentTarget)}><span className="mini-frame"/>{value.resolution==='custom'?`${value.width}×${value.height}`:`${value.ratio} · ${value.resolution}`} <span>⌄</span></button>
   <button type="button" className="parameter-chip" aria-label="摄影与灯光" title={photographySummary(value.photography)} onClick={e=>open('photo',e.currentTarget)}>◎ 摄影 <span className="photo-count">{photographySummary(value.photography)}</span></button>
   <button type="button" className="parameter-chip" aria-label="生成数量" onClick={e=>open('count',e.currentTarget)}>{value.count} 张 ⌄</button>
   <button type="button" className="button primary generation-submit" disabled={busy||!!error} onClick={onGenerate}>{busy?'准备…':'生成图片'} <span aria-hidden="true">↑</span></button>
  </div>
  {error&&<p className="error" role="alert">{error}</p>}
  {panel==='photo'&&<PhotographyDialog value={value.photography} onApply={photography=>{patch({photography});setPanel(null);}} onClose={()=>setPanel(null)}/>}
  {panel&&panel!=='photo'&&<Dialog title={panel==='model'?'选择模型':panel==='size'?'画幅与尺寸':'生成数量'} anchor={anchor} onClose={()=>setPanel(null)}><div className="parameter-options">
   {panel==='model'&&<div className="model-options">{(['gpt-image-2','gpt-image-2-vip'] as const).map(model=><button key={model} aria-pressed={value.model===model} onClick={()=>{patch({model,resolution:'1K',width:undefined,height:undefined});setPanel(null);}}><strong>{model==='gpt-image-2'?'GPT Image 2':'GPT Image 2 VIP'}</strong><small>{model==='gpt-image-2'?'1K · 适合快速创作':'1K–4K · 支持自定义尺寸'}</small></button>)}</div>}
   {panel==='size'&&<SizePicker value={value} onCancel={()=>setPanel(null)} onApply={next=>{patch(next);setPanel(null);}}/>}
   {panel==='count'&&<><p className="muted">每张结果独立归档，提交前会再次确认。</p><div className="choice-options">{[1,2,3,4].map(count=><button key={count} aria-pressed={value.count===count} onClick={()=>{patch({count});setPanel(null);}}>{count} 张</button>)}</div></>}
  </div></Dialog>}
 </fieldset>;
}
