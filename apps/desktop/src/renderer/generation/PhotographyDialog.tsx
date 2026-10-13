import {useState} from 'react';
import {defaultPhotography,photographyPresets,PhotographySchema,type Photography} from '../../../../../packages/contracts/src/imageGeneration';
import {Dialog} from '../../../../../packages/ui/src/Dialog';
const fields: {key:keyof Photography;label:string;options:string[][]}[]=[
 {key:'camera',label:'相机',options:[['auto','自动'],['fullframe','全画幅'],['mediumformat','中画幅'],['phone','手机'],['cinema','电影机'],['custom','自定义']]},
 {key:'lens',label:'镜头',options:[['auto','自动'],['standard','标准'],['macro','微距'],['wide','广角'],['telephoto','长焦']]},
 {key:'aperture',label:'光圈',options:['auto','f1.4','f2','f2.8','f4','f5.6','f8','f11','f16'].map(v=>[v,v==='auto'?'自动':v])},
 {key:'angle',label:'拍摄角度',options:[['auto','自动'],['front','正面'],['45','45°'],['side','侧面'],['top','俯拍'],['low','低机位']]},
 {key:'framing',label:'取景',options:[['auto','自动'],['full','全景'],['close','特写'],['detail','细节']]},
 {key:'lighting',label:'灯光方案',options:[['auto','自动'],['softbox','柔光箱'],['window','窗光'],['highkey','高调光'],['hard','硬光'],['side','侧光'],['rim','轮廓光'],['jewelry','珠宝光']]},
 {key:'direction',label:'光线方向',options:[['auto','自动'],['front','正面'],['left45','左侧 45°'],['right45','右侧 45°'],['side','侧面'],['top','顶部'],['back','背面']]},
 {key:'softness',label:'柔硬程度',options:[['auto','自动'],['soft','柔光'],['hard','硬光']]},
 {key:'temperature',label:'色温',options:[['auto','自动'],['warm','暖色'],['neutral','中性'],['cool','冷色']]},
 {key:'shadow',label:'阴影强度',options:[['auto','自动'],['light','浅'],['medium','中'],['strong','强']]},
];
export function PhotographyDialog({value,onApply,onClose}:{value:Photography;onApply:(value:Photography)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState(()=>({...value}));const [customFocal,setCustomFocal]=useState(draft.focalLength!==null&&![24,35,50,85,100,135,200].includes(draft.focalLength));
 return <Dialog title="摄影与灯光" onClose={onClose}><div className="photography-dialog nodrag nowheel nopan" onKeyDown={e=>e.stopPropagation()}>
  <p className="muted">这些参数用于定义生成画面的摄影风格，不代表真实相机或 EXIF 信息。</p>
  <div className="generation-presets">{([['white-product','白底商品'],['lifestyle','生活方式'],['macro','微距细节']] as const).map(([key,name])=><button key={key} onClick={()=>{setDraft({...defaultPhotography(),...photographyPresets[key]});setCustomFocal(false);}}>{name}</button>)}</div>
  <div className="generation-field-grid">{fields.map(field=><label key={field.key}>{field.label}<select aria-label={field.label} value={String(draft[field.key]??'auto')} onChange={e=>setDraft({...draft,[field.key]:e.target.value})}>{field.options.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>)}
   <label>焦距<select aria-label="焦距" value={customFocal?'custom':draft.focalLength??'auto'} onChange={e=>{setCustomFocal(e.target.value==='custom');setDraft({...draft,focalLength:e.target.value==='auto'?null:e.target.value==='custom'?50:Number(e.target.value)});}}><option value="auto">自动</option>{[24,35,50,85,100,135,200].map(v=><option key={v} value={v}>{v} mm</option>)}<option value="custom">自定义 8–300 mm</option></select></label>
   {customFocal&&<label>自定义焦距 mm<input type="number" min={8} max={300} value={draft.focalLength??50} onChange={e=>setDraft({...draft,focalLength:Number(e.target.value)})}/></label>}
  </div>
  {draft.camera==='custom'&&<label>相机风格描述<input maxLength={200} value={draft.customCamera??''} onChange={e=>setDraft({...draft,customCamera:e.target.value})}/></label>}
  <div className="dialog-actions"><button className="button" onClick={()=>{setDraft(defaultPhotography());setCustomFocal(false);}}>重置为自动</button><button className="button" onClick={onClose}>取消</button><button className="button primary" disabled={!PhotographySchema.safeParse(draft).success} onClick={()=>onApply(draft)}>应用摄影设置</button></div>
 </div></Dialog>;
}
