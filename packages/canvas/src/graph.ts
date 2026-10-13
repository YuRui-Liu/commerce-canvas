import type { CanvasDocument, CanvasNode } from '../../contracts/src/canvas';
import type { InputRole } from '../../contracts/src/domain';
export function descendants(doc:CanvasDocument,id:string):Set<string>{
  const children=new Map<string,string[]>();for(const e of doc.edges)children.set(e.source,[...(children.get(e.source)??[]),e.target]);
  const found=new Set<string>();const queue=[id];for(let i=0;i<queue.length;i++)for(const child of children.get(queue[i])??[])if(child!==id&&!found.has(child)){found.add(child);queue.push(child);}return found;
}
// Every role has one source per target. A source may fill different roles explicitly.
export function canConnect(doc:CanvasDocument,source:string,target:string,role:InputRole):boolean{
  if(source===target||!doc.nodes.some(n=>n.id===source&&n.kind!=='group')||!doc.nodes.some(n=>n.id===target&&n.kind!=='group'))return false;
  return !doc.edges.some(e=>e.target===target&&e.role===role)&&!descendants(doc,target).has(source);
}
export function absolutePosition(doc:CanvasDocument,node:CanvasNode):{x:number;y:number}{
  const p={...node.position};let parent=node.parentId;const seen=new Set([node.id]);while(parent&&!seen.has(parent)){seen.add(parent);const n=doc.nodes.find(n=>n.id===parent);if(!n)break;p.x+=n.position.x;p.y+=n.position.y;parent=n.parentId;}return p;
}
export function alignLeft(doc:CanvasDocument,ids:string[]):CanvasDocument{
  // Selected containers move as a unit. Descendants of any selected ancestor
  // keep their local coordinates instead of receiving the same translation twice.
  const selected=new Set(ids);
  const byId=new Map(doc.nodes.map(node=>[node.id,node]));
  const chosen=doc.nodes.filter(node=>{
    if(!selected.has(node.id))return false;
    let parentId=node.parentId;
    while(parentId){if(selected.has(parentId))return false;parentId=byId.get(parentId)?.parentId;}
    return true;
  });
  if(chosen.length<2)return doc;
  const roots=new Set(chosen.map(node=>node.id));
  const x=Math.min(...chosen.map(n=>absolutePosition(doc,n).x));
  return {...doc,nodes:doc.nodes.map(n=>roots.has(n.id)?{...n,position:{...n.position,x:n.position.x+x-absolutePosition(doc,n).x}}:n)};
}
export function groupNodes(doc:CanvasDocument,ids:string[],id:string):CanvasDocument{
  const selected=doc.nodes.filter(n=>ids.includes(n.id)&&!n.parentId);if(selected.length<2)return doc;
  const x=Math.min(...selected.map(n=>n.position.x))-24,y=Math.min(...selected.map(n=>n.position.y))-48;
  const width=Math.max(...selected.map(n=>n.position.x+(n.width??240)))-x+24,height=Math.max(...selected.map(n=>n.position.y+(n.height??220)))-y+24;
  return {...doc,nodes:[{id,kind:'group',position:{x,y},width,height},...doc.nodes.map(n=>selected.includes(n)?{...n,parentId:id,position:{x:n.position.x-x,y:n.position.y-y}}:n)]};
}
export function ungroupNodes(doc:CanvasDocument,ids:string[]):CanvasDocument{
  const groups=new Set(doc.nodes.filter(n=>n.kind==='group'&&ids.includes(n.id)).map(n=>n.id));
  return {...doc,nodes:doc.nodes.filter(n=>!groups.has(n.id)).map(n=>{
    if(!n.parentId||!groups.has(n.parentId))return n;
    let parentId:string|undefined=n.parentId;while(parentId&&groups.has(parentId))parentId=doc.nodes.find(p=>p.id===parentId)?.parentId;
    const position=absolutePosition(doc,n);const parent=doc.nodes.find(p=>p.id===parentId);const origin=parent?absolutePosition(doc,parent):{x:0,y:0};
    return {...n,parentId,position:{x:position.x-origin.x,y:position.y-origin.y}};
  }),edges:doc.edges.filter(e=>!groups.has(e.source)&&!groups.has(e.target))};
}
export function layout(doc:CanvasDocument):CanvasDocument{
  // Flatten containers explicitly before DAG layout so child coordinates stay unambiguous.
  const d=ungroupNodes(doc,doc.nodes.filter(n=>n.kind==='group').map(n=>n.id));
  const levels=new Map(d.nodes.map(n=>[n.id,0]));const pending=new Map(d.nodes.map(n=>[n.id,0]));
  for(const e of d.edges)pending.set(e.target,(pending.get(e.target)??0)+1);
  const queue=d.nodes.filter(n=>pending.get(n.id)===0).map(n=>n.id);
  for(let i=0;i<queue.length;i++)for(const e of d.edges.filter(e=>e.source===queue[i])){levels.set(e.target,Math.max(levels.get(e.target)??0,(levels.get(e.source)??0)+1));pending.set(e.target,pending.get(e.target)!-1);if(pending.get(e.target)===0)queue.push(e.target);}
  if(queue.length!==d.nodes.length)return doc;
  const rows=new Map<number,number>();return {...d,nodes:d.nodes.map(n=>{const level=levels.get(n.id)!;const row=rows.get(level)??0;rows.set(level,row+1);return {...n,position:{x:level*340,y:row*300}};})};
}
