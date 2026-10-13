import { z } from 'zod';
import { IdSchema, InputRoleSchema, RevisionSchema } from './domain';
const Key = z.string().min(1).max(200);
const Position = z.object({ x:z.number().finite(), y:z.number().finite() }).strict();
export const CanvasNodeSchema = z.object({
  id:Key, kind:z.enum(['asset','text','agent','output','group']), position:Position,
  parentId:Key.optional(), assetVersionId:IdSchema.optional(), agentDefinitionId:Key.optional(), runId:Key.optional(),
  stale:z.boolean().optional(),
  width:z.number().positive().max(100000).optional(), height:z.number().positive().max(100000).optional(),
}).strict();
export const CanvasEdgeSchema = z.object({id:Key,source:Key,target:Key,role:InputRoleSchema}).strict();
export const CanvasDocumentSchema = z.object({
  id:Key, projectId:IdSchema.nullable(), revision:RevisionSchema,
  nodes:z.array(CanvasNodeSchema).max(10000), edges:z.array(CanvasEdgeSchema).max(30000),
  viewport:Position.extend({zoom:z.number().min(.1).max(4)}),
}).strict().superRefine((doc,ctx)=>{
  const nodes=new Map(doc.nodes.map(n=>[n.id,n])); const edgeIds=new Set<string>(); const inputs=new Set<string>();
  const issue=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
  if(nodes.size!==doc.nodes.length) issue('Duplicate node ID');
  const adjacency=new Map<string,string[]>();
  for(const n of doc.nodes){const seen=new Set([n.id]);let p=n.parentId;while(p){if(seen.has(p)||nodes.get(p)?.kind!=='group'){issue('Invalid group hierarchy');break;}seen.add(p);p=nodes.get(p)?.parentId;}}
  for(const e of doc.edges){
    const input=`${e.target}\0${e.role}`;
    if(edgeIds.has(e.id)||inputs.has(input)||e.source===e.target||!nodes.has(e.source)||!nodes.has(e.target)||nodes.get(e.source)?.kind==='group'||nodes.get(e.target)?.kind==='group') issue('Invalid or duplicate edge/input');
    edgeIds.add(e.id);inputs.add(input);adjacency.set(e.source,[...(adjacency.get(e.source)??[]),e.target]);
  }
  const degree=new Map([...nodes.keys()].map(id=>[id,0]));
  for(const e of doc.edges)degree.set(e.target,(degree.get(e.target)??0)+1);
  const queue=[...nodes.keys()].filter(id=>degree.get(id)===0);
  for(let i=0;i<queue.length;i++)for(const child of adjacency.get(queue[i])??[]){degree.set(child,degree.get(child)!-1);if(degree.get(child)===0)queue.push(child);}
  if(queue.length!==nodes.size)issue('Graph must be acyclic');
});
export type CanvasNode=z.infer<typeof CanvasNodeSchema>;
export type CanvasEdge=z.infer<typeof CanvasEdgeSchema>;
export type CanvasDocument=z.infer<typeof CanvasDocumentSchema>;

// Only creative context belongs here. Credentials and product forms have separate stores.
export const PanelStateSchema = z.object({
  chatDraft: z.string().max(100000),
  inspectorDrafts: z.record(Key, z.string().max(1000000)),
  activeTab: z.enum(['config', 'chat']),
  selectedIds: z.array(Key).max(10000),
  messages: z.array(z.object({
    id: IdSchema, role: z.literal('user'), text: z.string().min(1).max(100000),
    selectedNodes: z.array(CanvasNodeSchema).max(10000),
    createdAt: z.string().datetime(),
  }).strict()).max(1000),
}).strict();
export type PanelState = z.infer<typeof PanelStateSchema>;
export const emptyPanel = (): PanelState => ({ chatDraft: '', inspectorDrafts: {}, activeTab: 'config', selectedIds: [], messages: [] });
export type CanvasRecord = { name: string; document: CanvasDocument; panel: PanelState };
export type CanvasSummary = { id: string; name: string; revision: number };
