import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { RuntimeService } from '../src/service';
import { defaultGenerationSettings } from '../../contracts/src/imageGeneration';
let root:string, runtime:RuntimeService;
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'generation-results-'));runtime=new RuntimeService(root);});
afterEach(async()=>{await runtime.close();rmSync(root,{recursive:true,force:true});});
async function setup(){
 const project=runtime.projects.create('results'),canvas=runtime.canvases.create(project.id,'canvas');
 runtime.canvases.save(project.id,{...canvas.document,nodes:[{id:'g',kind:'generation',position:{x:0,y:0},generation:defaultGenerationSettings()}]},canvas.panel,1);
 const run=runtime.generations.prepare({projectId:project.id,canvasId:canvas.document.id,nodeId:'g'});
 runtime.generations.confirm(project.id,run.id);runtime.generations.claim(run.id,0);runtime.generations.recordRemote(run.id,0,'task');runtime.generations.recordResult(project.id,run.id,0,'https://images.example/result.png');
 const bytes=await sharp({create:{width:80,height:40,channels:3,background:'#ff0000'}}).png().toBuffer();
 return {project,canvas,run,bytes,target:{projectId:project.id,runId:run.id,slotIndex:0}};
}
it('archives stable IDs once, keeps actual dimensions, and rejects different bytes at the same slot',async()=>{
 const s=await setup();const first=await runtime.generationResults.archive({...s.target,bytes:s.bytes});
 expect(first).toMatchObject({width:80,height:40,id:runtime.generations.get(s.project.id,s.run.id).slots[0].outputVersionId});
 expect(await runtime.generationResults.archive({...s.target,bytes:s.bytes})).toEqual(first);
 expect(runtime.assets.repository.list(s.project.id)).toHaveLength(1);
 expect(runtime.generations.get(s.project.id,s.run.id).slots[0]).toMatchObject({status:'succeeded',warning:'DIMENSIONS_DIFFER'});
 const other=await sharp(s.bytes).negate().png().toBuffer();
 await expect(runtime.generationResults.archive({...s.target,bytes:other})).rejects.toThrow();
});
it('adapts contain/cover to requested pixels with stable provenance and preserves original bytes',async()=>{
 const s=await setup(),original=await runtime.generationResults.archive({...s.target,bytes:s.bytes});
 const contain=await runtime.generationResults.adapt({...s.target,fit:'contain',background:'#ffffff'});
 const cover=await runtime.generationResults.adapt({...s.target,fit:'cover',background:'#ffffff'});
 expect(contain).toMatchObject({width:1024,height:1024,mime:'image/png'});expect(cover.hash).not.toBe(contain.hash);
 expect(await runtime.generationResults.adapt({...s.target,fit:'contain',background:'#ffffff'})).toEqual(contain);
 expect(await runtime.assets.read(original.id,'original',s.project.id)).toEqual(s.bytes);
 expect(runtime.assets.repository.get(original.id,s.project.id).hash).toBe(original.hash);
 expect(runtime.assets.repository.list(s.project.id)).toHaveLength(3);
 expect(runtime.generationResults.provenance(contain.id,s.project.id)).toMatchObject({sourceVersionId:original.id,fit:'contain',background:'#ffffff',width:1024,height:1024});
 const loaded=runtime.canvases.load(s.project.id,s.canvas.document.id);
 expect(()=>runtime.canvases.save(s.project.id,{...loaded.document,nodes:[...loaded.document.nodes,{id:'derived',kind:'output',runId:s.run.id,assetVersionId:contain.id,position:{x:400,y:0}}]},loaded.panel,loaded.document.revision)).not.toThrow();
});
it('guards projects and finishes safely after the source node is deleted',async()=>{
 const s=await setup(),foreign=runtime.projects.create('foreign');
 await expect(runtime.generationResults.archive({...s.target,projectId:foreign.id,bytes:s.bytes})).rejects.toThrow();
 runtime.canvases.save(s.project.id,{...s.canvas.document,nodes:[]},s.canvas.panel,2);
 await runtime.generationResults.archive({...s.target,bytes:s.bytes});
 await expect(runtime.generationResults.adapt({...s.target,projectId:foreign.id,fit:'contain',background:'#ffffff'})).rejects.toThrow();
 expect(runtime.generations.get(s.project.id,s.run.id).slots[0].status).toBe('succeeded');
});
it('rejects incomplete and unsupported downloaded images before any asset metadata is committed',async()=>{
 const s=await setup();
 await expect(runtime.generationResults.archive({...s.target,bytes:s.bytes.subarray(0,50)})).rejects.toThrow();
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>');
 await expect(runtime.generationResults.archive({...s.target,bytes:svg})).rejects.toThrow();expect(runtime.assets.repository.list(s.project.id)).toHaveLength(0);
});
