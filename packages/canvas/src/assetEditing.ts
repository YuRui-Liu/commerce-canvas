import type {CanvasDocument} from '../../contracts/src/canvas';
import type {InputRole} from '../../contracts/src/domain';
import {canConnect,descendants} from './graph';
export function replaceNodeVersion(doc:CanvasDocument,id:string,versionId:string):CanvasDocument{
 if(!doc.nodes.some(n=>n.id===id)||doc.nodes.find(n=>n.id===id)?.assetVersionId===versionId)return doc;
 const affected=descendants(doc,id);
 return {...doc,nodes:doc.nodes.map(n=>n.id===id?{...n,assetVersionId:versionId}:affected.has(n.id)?{...n,stale:true}:n)};
}
export function changeEdgeRole(doc:CanvasDocument,id:string,role:InputRole):CanvasDocument{
 const edge=doc.edges.find(e=>e.id===id);if(!edge||edge.role===role)return doc;
 if(!canConnect({...doc,edges:doc.edges.filter(e=>e.id!==id)},edge.source,edge.target,role))return doc;
 return {...doc,edges:doc.edges.map(e=>e.id===id?{...e,role}:e)};
}
