import {expect,test} from 'vitest';
import {replaceNodeVersion,changeEdgeRole} from './assetEditing';
import type {CanvasDocument} from '../../contracts/src/canvas';
const doc:CanvasDocument={id:'c',projectId:null,revision:1,viewport:{x:0,y:0,zoom:1},nodes:['a','b','c','unrelated'].map(id=>({id,kind:'agent',position:{x:0,y:0}})),edges:[{id:'ab',source:'a',target:'b',role:'facts'},{id:'bc',source:'b',target:'c',role:'instruction'}]};
test('text revision changes one reference and marks only descendants stale',()=>{const next=replaceNodeVersion(doc,'a','new');expect(next.nodes[0].assetVersionId).toBe('new');expect(next.nodes.filter(n=>n.stale).map(n=>n.id)).toEqual(['b','c']);expect(next.nodes[3]).toBe(doc.nodes[3]);expect(doc.nodes[0].assetVersionId).toBeUndefined();});
test('edge role belongs to the connection, duplicate target role rejected',()=>{const shared={...doc,edges:[...doc.edges,{id:'ac',source:'a',target:'c',role:'style' as const}]};expect(changeEdgeRole(shared,'ab','product').edges[0].role).toBe('product');expect(changeEdgeRole(shared,'ab','product').edges[2].role).toBe('style');expect(changeEdgeRole(shared,'ac','instruction')).toBe(shared);});
