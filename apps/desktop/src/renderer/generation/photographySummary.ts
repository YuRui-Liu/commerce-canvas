import type {Photography} from '../../../../../packages/contracts/src/imageGeneration';
export function photographySummary(value:Photography):string {
 const configured=Object.entries(value).filter(([key,item])=>{
  if(key==='customCamera')return value.camera==='custom'&&typeof item==='string'&&!!item.trim();
  return item!==null&&item!==undefined&&item!=='auto';
 }).length;
 return configured?`${configured} 项已配置`:'自动';
}
