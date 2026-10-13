import { describe, expect, it } from 'vitest';
import { canConnect, descendants, groupNodes, ungroupNodes, layout } from './graph';
import { createHistory, commit, undo, redo } from './history';
import type { CanvasDocument } from '../../contracts/src/canvas';
import { CanvasDocumentSchema } from '../../contracts/src/canvas';
const doc = (): CanvasDocument => ({ id: 'canvas', projectId: null, revision: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: ['a','b','c','d'].map((id,i) => ({ id, kind:'agent', position:{x:i*300,y:20} })), edges: [{id:'ab',source:'a',target:'b',role:'product'},{id:'bc',source:'b',target:'c',role:'style'}] });
describe('graph invariants', () => {
  it('rejects cycles, missing/cross-document nodes, self links and occupied single roles', () => {
    const d=doc();
    expect(canConnect(d,'c','a','product')).toBe(false);
    expect(canConnect(d,'a','a','style')).toBe(false);
    expect(canConnect(d,'foreign','a','style')).toBe(false);
    expect(canConnect(d,'d','b','product')).toBe(false);
    expect(canConnect(d,'d','b','style')).toBe(true);
    expect(canConnect(d,'a','b','style')).toBe(true);
  });
  it('limits invalidation to downstream nodes', () => expect([...descendants(doc(),'b')]).toEqual(['c']));
  it('groups and ungroups preserving absolute positions after group movement', () => {
    const d=doc(); const grouped=groupNodes(d,['a','b'],'g');
    const group=grouped.nodes.find(n=>n.id==='g')!; group.position.x+=100;
    const restored=ungroupNodes(grouped,['g']);
    expect(restored.nodes.find(n=>n.id==='a')!.position).toEqual({x:100,y:20});
    expect(restored.edges).toEqual(d.edges);
  });
  it('ungroups a nested group into its surviving parent',()=>{
    const d=groupNodes(groupNodes(doc(),['a','b'],'inner'),['inner','c'],'outer');
    const result=ungroupNodes(d,['inner']);
    expect(result.nodes.find(n=>n.id==='a')!.parentId).toBe('outer');
  });
  it('lays out a DAG with sources left of targets',()=>{ const d=layout(doc()); for(const e of d.edges) expect(d.nodes.find(n=>n.id===e.source)!.position.x).toBeLessThan(d.nodes.find(n=>n.id===e.target)!.position.x); });
  it('validates graph hierarchy, duplicate roles and bounded viewport at the contract boundary',()=>{
    expect(CanvasDocumentSchema.safeParse(doc()).success).toBe(true);
    expect(CanvasDocumentSchema.safeParse({...doc(),edges:[...doc().edges,{id:'ca',source:'c',target:'a',role:'scene'}]}).success).toBe(false);
    expect(CanvasDocumentSchema.safeParse({...doc(),nodes:[{id:'g',kind:'group',position:{x:0,y:0},parentId:'g'}]}).success).toBe(false);
    expect(CanvasDocumentSchema.safeParse({...doc(),viewport:{x:0,y:0,zoom:0}}).success).toBe(false);
  });
});
describe('layout history',()=>{
  it('commits one drag gesture and restores deleted nodes with their edges',()=>{
    const initial=doc(); let h=createHistory(initial);
    const moved={...initial,nodes:initial.nodes.map(n=>n.id==='a'?{...n,position:{x:90,y:100}}:n)};
    h=commit(h,moved); expect(h.past).toHaveLength(1);
    h=commit(h,{...moved,nodes:moved.nodes.filter(n=>n.id!=='b'),edges:[]});
    h=undo(h); expect(h.present).toEqual(moved); h=undo(h); expect(h.present).toEqual(initial);
    expect(redo(h).present).toEqual(moved);
  });
  it('ignores no-op commands and clears redo after new edits',()=>{let h=commit(createHistory(doc()),doc());expect(h.past).toHaveLength(0);h=commit(h,{...h.present,nodes:[]});h=undo(h);h=commit(h,{...h.present,edges:[]});expect(h.future).toHaveLength(0);});
});
