import {describe,it,expect} from 'vitest';
import {deliverGenerationResults} from './generationDelivery';
import {emptyPanel, type CanvasDocument} from '../../contracts/src/canvas';
import {defaultGenerationSettings,type GenerationRun} from '../../contracts/src/imageGeneration';
const document:CanvasDocument={id:'c',projectId:null,revision:1,nodes:[{id:'g',kind:'generation',position:{x:0,y:0},generation:defaultGenerationSettings()}],edges:[],viewport:{x:0,y:0,zoom:1}};
const run={id:'r',nodeId:'g',slots:[{slotIndex:0,resultVersionId:'v',derivatives:[]}]} as unknown as GenerationRun;
describe('generation delivery receipts',()=>{
 it('delivers once and does not resurrect an intentionally removed result',()=>{
  const first=deliverGenerationResults(document,emptyPanel(),[run]);
  expect(first.document.nodes).toHaveLength(2);
  expect(first.document.edges[0]).toMatchObject({source:'g',target:'generation-result:v'});
  const second=deliverGenerationResults({...first.document,nodes:document.nodes,edges:[]},first.panel,[run]);
  expect(second.document.nodes).toHaveLength(1);
 });
 it('receipts results without recreating a removed source',()=>{
  const result=deliverGenerationResults({...document,nodes:[]},emptyPanel(),[run]);
  expect(result.document.nodes).toHaveLength(0);
  expect(result.panel.generationDeliveries).toEqual(['v']);
 });
 it('adds derivatives without replacing originals',()=>{
  const derived={...run,slots:[{...run.slots[0],derivatives:[{versionId:'d'}]}]} as GenerationRun;
  const result=deliverGenerationResults(document,emptyPanel(),[derived]);
  expect(result.document.nodes.map(n=>n.assetVersionId).filter(Boolean)).toEqual(['v','d']);
 });
});
