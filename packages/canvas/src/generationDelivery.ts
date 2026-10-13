import type {CanvasDocument,PanelState} from '../../contracts/src/canvas';
import type {GenerationRun} from '../../contracts/src/imageGeneration';
/** Receipts live in PanelState, deliberately outside Canvas undo history. */
export function deliverGenerationResults(document:CanvasDocument,panel:PanelState,runs:GenerationRun[]){
 const seen=new Set(panel.generationDeliveries??[]),nodes=[...document.nodes],edges=[...document.edges];
 for(const run of runs)for(const slot of run.slots){
  for(const versionId of [slot.resultVersionId,...slot.derivatives.map(d=>d.versionId)].filter((id):id is string=>!!id)){
   if(seen.has(versionId))continue;seen.add(versionId);
   const source=nodes.find(n=>n.id===run.nodeId);if(!source)continue;
   const id=`generation-result:${versionId}`;
   if(nodes.some(n=>n.id===id))continue;
   const right=Math.max(source.position.x+420,...nodes.filter(n=>n.kind!=='group').map(n=>n.position.x+280));
   nodes.push({id,kind:'output',assetVersionId:versionId,runId:run.id,position:{x:right,y:source.position.y}});
   edges.push({id:`generation-edge:${versionId}`,source:run.nodeId,target:id,role:'product'});
  }
 }
 return {document:{...document,nodes,edges},panel:{...panel,generationDeliveries:[...seen]}};
}
