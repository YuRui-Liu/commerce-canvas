import {Button} from '../../../../../packages/ui/src/Button';
export function TextInspector({value,onChange,onSave,busy}:{value:string;onChange:(value:string)=>void;onSave:()=>void;busy:boolean}){
 return <section><label>节点文本草稿<textarea className="nodrag nowheel" value={value} onChange={e=>onChange(e.target.value)} maxLength={1000000} rows={8} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.keyCode===229)e.stopPropagation();}}/></label><Button disabled={busy} onClick={onSave}>保存文本新版本</Button><small>保存会创建同一素材的新版本，并标记下游需要更新。旧版本仍可读取。</small></section>;
}
