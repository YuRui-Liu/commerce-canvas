import type {AssetVersion} from '../../../../../packages/contracts/src/domain';
import {ASSET_DRAG_TYPE} from '../../../../../packages/canvas/src/inputBindings';
import {Button} from '../../../../../packages/ui/src/Button';
export function AssetLibrary({assets,busy,onView,onAdd,onCompare,onDelete,onRestore,trashed=false}:{assets:AssetVersion[];busy:boolean;onView:(asset:AssetVersion)=>void;onAdd:(asset:AssetVersion)=>void;onCompare:(asset:AssetVersion)=>void;onDelete:(asset:AssetVersion)=>void;onRestore:(asset:AssetVersion)=>void;trashed?:boolean}){
 return <div className="asset-list">{assets.map((a,i)=><div className="library-asset" key={a.id}>
  <button className="asset-card" draggable={!busy&&!trashed} onDragStart={e=>{e.dataTransfer.setData(ASSET_DRAG_TYPE,a.id);e.dataTransfer.effectAllowed='copy';}} onClick={()=>onView(a)}>{a.kind==='image'?<img draggable={false} src={`commerce-asset://asset/${a.id}/thumbnail`} alt={`素材图片 ${i+1}`}/>:<div className="text-preview">{a.text}</div>}<span>{a.kind==='image'?`图片 ${i+1}`:`文本 ${i+1}`}</span><small>{a.kind==='image'?`${a.width} × ${a.height}`:'文本版本'}</small></button>
  {trashed?<Button onClick={()=>onRestore(a)} disabled={busy}>恢复素材</Button>:<><Button onClick={()=>onAdd(a)} disabled={busy}>添加到画布</Button>{a.kind==='image'&&<Button onClick={()=>onCompare(a)}>选择对比</Button>}<Button onClick={()=>onDelete(a)} disabled={busy} title="移到已删除，保留画布引用与历史版本">删除素材</Button></>}
 </div>)}</div>;
}
