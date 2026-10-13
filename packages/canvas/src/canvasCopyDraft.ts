import type {CanvasNode,CanvasRecord} from '../../contracts/src/canvas';
const withoutRun=({runId: _runId,...node}:CanvasNode):CanvasNode=>node;
// Runs and delivery receipts belong to the original canvas; assets remain project-scoped.
export function canvasCopyDraft(source:CanvasRecord,canvasId:string):CanvasRecord {
 return {...source,document:{...source.document,id:canvasId,nodes:source.document.nodes.map(withoutRun)},panel:{...source.panel,generationDeliveries:[],messages:source.panel.messages.map(message=>({...message,selectedNodes:message.selectedNodes.map(withoutRun)}))}};
}
