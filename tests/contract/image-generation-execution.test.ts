import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { RuntimeService } from '../../packages/runtime/src/service';
import { defaultGenerationSettings } from '../../packages/contracts/src/imageGeneration';
import { ImageGenerationCoordinator } from '../../apps/desktop/src/main/imageGeneration';
import { GrsaiClient } from '../../packages/runtime/src/providers/grsai/client';
import { parseRequest } from '../../packages/contracts/src/bridge';
import type { ImageProviderPort } from '../../packages/contracts/src/imageProvider';
let root:string,runtime:RuntimeService,coordinator:ImageGenerationCoordinator;
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'generation-execution-'));runtime=new RuntimeService(root);});
afterEach(async()=>{await coordinator?.shutdown();await runtime.close();rmSync(root,{recursive:true,force:true});});
const rpc={request:(method:string,payload:unknown={})=>runtime.dispatch({id:randomUUID(),method,payload}) as Promise<any>};
async function setup(count=1,options:Record<string,unknown>={}){
 const project=runtime.projects.create('execution'),canvas=runtime.canvases.create(project.id,'canvas');
 runtime.canvases.save(project.id,{...canvas.document,nodes:[{id:'g',kind:'generation',position:{x:0,y:0},generation:{...defaultGenerationSettings(),count}}]},canvas.panel,1);
 const bytes=await sharp({create:{width:32,height:32,channels:3,background:'red'}}).png().toBuffer();
 let next=0;const provider:ImageProviderPort={submit:vi.fn(async()=>({id:`task-${++next}`,status:'running'})),get:vi.fn(async id=>({id,status:'succeeded',results:[{url:'https://images.example/result.png'}]}))};
 coordinator=new ImageGenerationCoordinator(rpc,{resolveGrsai:()=> 'test-secret'},{providerFactory:()=>provider,download:async()=>bytes,pollDelayMs:0,maxPolls:2,...options});
 await coordinator.start(true);
 const target={projectId:project.id,canvasId:canvas.document.id,nodeId:'g'},run=await coordinator.prepare(target);
 return {provider,project,run,target,bytes};
}
it('persists a claim before accepted/disconnected POST, never rePOSTs an unknown slot',async()=>{
 const s=await setup();vi.mocked(s.provider.submit).mockImplementation(async()=>{expect(runtime.generations.get(s.project.id,s.run.id).slots[0].status).toBe('submitting');throw Error('connection lost secret');});
 await coordinator.confirm({projectId:s.project.id,runId:s.run.id});await coordinator.drain();
 expect(runtime.generations.get(s.project.id,s.run.id).slots[0]).toMatchObject({status:'unknown',remoteId:null});
 await coordinator.resume({projectId:s.project.id,runId:s.run.id});await coordinator.drain();expect(s.provider.submit).toHaveBeenCalledTimes(1);
});
it('known IDs recover through GET only and four slots can partially succeed',async()=>{
 const s=await setup(4);runtime.generations.confirm(s.project.id,s.run.id);runtime.generations.claim(s.run.id,0);runtime.generations.recordRemote(s.run.id,0,'already-known');
 vi.mocked(s.provider.get).mockImplementation(async id=>id==='task-2'?{id,status:'failed'}:{id,status:'succeeded',results:[{url:'https://images.example/result.png'}]});
 await coordinator.resume({projectId:s.project.id,runId:s.run.id});await coordinator.drain();
 expect(s.provider.submit).toHaveBeenCalledTimes(3);expect(s.provider.get).toHaveBeenCalledWith('already-known');
 expect(runtime.generations.get(s.project.id,s.run.id).slots.map(s=>s.status)).toEqual(['succeeded','succeeded','failed','succeeded']);
 await coordinator.resume({projectId:s.project.id,runId:s.run.id});await coordinator.drain();expect(runtime.assets.repository.list(s.project.id)).toHaveLength(3);
});
it('stop before claim cancels, while stop after claim collects the submitted result',async()=>{
 const s=await setup();runtime.generations.confirm(s.project.id,s.run.id);await coordinator.stop({projectId:s.project.id,runId:s.run.id});await coordinator.resume({projectId:s.project.id,runId:s.run.id});await coordinator.drain();expect(s.provider.submit).not.toHaveBeenCalled();
 const run=await coordinator.prepare(s.target);let release!:(value:any)=>void;
 vi.mocked(s.provider.submit).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 await coordinator.confirm({projectId:s.project.id,runId:run.id});
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));await coordinator.stop({projectId:s.project.id,runId:run.id});release({id:'stopped-after-claim',status:'running'});await coordinator.drain();
 expect(runtime.generations.get(s.project.id,run.id).slots[0].status).toBe('succeeded');
});
it('download failure resumes from persisted URL without POST or GET',async()=>{
 const download=vi.fn().mockRejectedValueOnce(Error('download failed'));const s=await setup(1,{download});download.mockResolvedValue(s.bytes);
 // Preserve the first explicit failure despite the subsequent fallback value.
 await coordinator.confirm({projectId:s.project.id,runId:s.run.id});await coordinator.drain();expect(runtime.generations.get(s.project.id,s.run.id).slots[0].status).toBe('downloading');
 await coordinator.resume({projectId:s.project.id,runId:s.run.id});await coordinator.drain();expect(s.provider.submit).toHaveBeenCalledTimes(1);expect(s.provider.get).toHaveBeenCalledTimes(1);expect(download).toHaveBeenCalledTimes(2);
});
it('missing credentials fail preflight with zero network and no claimed slot',async()=>{
 const s=await setup();await coordinator.shutdown();
 coordinator=new ImageGenerationCoordinator(rpc,{resolveGrsai:()=>{throw Error('CREDENTIAL_NOT_FOUND');}},{providerFactory:()=>s.provider});await coordinator.start(true);
 await expect(coordinator.confirm({projectId:s.project.id,runId:s.run.id})).rejects.toThrow('CREDENTIAL_NOT_FOUND');expect(s.provider.submit).not.toHaveBeenCalled();expect(runtime.generations.get(s.project.id,s.run.id).approvedAt).toBeNull();
});
it('rejects mismatched GET IDs at the G1 boundary',async()=>{
 const client=new GrsaiClient({apiKey:'test',transport:async()=>new Response(JSON.stringify({id:'another',status:'running'}))});
 await expect(client.get('wanted')).rejects.toMatchObject({code:'RESULT_ID_MISMATCH'});
});
it('binds only verified unknown IDs, and exposes only strict generation bridge methods',async()=>{
 const s=await setup();runtime.generations.confirm(s.project.id,s.run.id);runtime.generations.claim(s.run.id,0);runtime.generations.updateSlot(s.run.id,0,{status:'unknown'});
 await expect(coordinator.bind({projectId:s.project.id,runId:s.run.id,slotIndex:0,remoteId:'bound'})).resolves.toBeDefined();await coordinator.drain();expect(s.provider.submit).not.toHaveBeenCalled();
 for(const method of ['generationClaim','generationGet','generationArchive','generationRecover','generationInputBytes'])expect(()=>parseRequest(method,{})).toThrow();
 expect(()=>parseRequest('confirmImageGeneration',{projectId:s.project.id,runId:s.run.id,apiKey:'secret'})).toThrow();
 const source=readFileSync(join(process.cwd(),'apps/desktop/src/main/index.ts'),'utf8');expect(source).not.toMatch(/FakeProvider|fakeProvider|providerFactory/);expect(source).toContain('requestSingleInstanceLock');
});
it('restart recovers a no-ID claim as unknown and a known ID by query only',async()=>{
 const s=await setup(2);runtime.generations.confirm(s.project.id,s.run.id);runtime.generations.claim(s.run.id,0);runtime.generations.claim(s.run.id,1);runtime.generations.recordRemote(s.run.id,1,'saved-task');
 await coordinator.shutdown();await runtime.close();runtime=new RuntimeService(root);
 coordinator=new ImageGenerationCoordinator(rpc,{resolveGrsai:()=> 'test'},{providerFactory:()=>s.provider,download:async()=>s.bytes,pollDelayMs:0,maxPolls:1});
 await coordinator.start(true);await coordinator.drain();
 expect(s.provider.submit).not.toHaveBeenCalled();expect(s.provider.get).toHaveBeenCalledWith('saved-task');
 expect(runtime.generations.get(s.project.id,s.run.id).slots.map(s=>s.status)).toEqual(['unknown','succeeded']);
});
it('requires exclusive ownership before recovery mutates a submitting slot',async()=>{
 const s=await setup();runtime.generations.confirm(s.project.id,s.run.id);runtime.generations.claim(s.run.id,0);
 const unowned=new ImageGenerationCoordinator(rpc,{resolveGrsai:()=> 'test'});
 await expect(unowned.start(false)).rejects.toThrow('EXECUTOR_OWNERSHIP_REQUIRED');expect(runtime.generations.get(s.project.id,s.run.id).slots[0].status).toBe('submitting');
});
it('does not overlap same-slot execution and drains callbacks before runtime shutdown',async()=>{
 const s=await setup();let release!:(value:any)=>void;vi.mocked(s.provider.submit).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 await coordinator.confirm({projectId:s.project.id,runId:s.run.id});await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 await Promise.all([coordinator.resume({projectId:s.project.id,runId:s.run.id}),coordinator.resume({projectId:s.project.id,runId:s.run.id})]);
 const shutdown=coordinator.shutdown();release({id:'late-accepted',status:'running'});await shutdown;
 expect(s.provider.submit).toHaveBeenCalledTimes(1);expect(runtime.generations.get(s.project.id,s.run.id).slots[0]).toMatchObject({remoteId:'late-accepted',status:'running'});
 await expect(coordinator.resume({projectId:s.project.id,runId:s.run.id})).rejects.toThrow('EXECUTOR_UNAVAILABLE');
});
it('rejects mismatched binding and a success without exactly one image',async()=>{
 const s=await setup();runtime.generations.confirm(s.project.id,s.run.id);runtime.generations.claim(s.run.id,0);runtime.generations.updateSlot(s.run.id,0,{status:'unknown'});
 vi.mocked(s.provider.get).mockResolvedValue({id:'different',status:'running'});
 await expect(coordinator.bind({projectId:s.project.id,runId:s.run.id,slotIndex:0,remoteId:'wanted'})).rejects.toThrow('RESULT_ID_MISMATCH');expect(runtime.generations.get(s.project.id,s.run.id).slots[0].remoteId).toBeNull();
 runtime.generations.bindUnknown(s.project.id,s.run.id,0,'wanted');vi.mocked(s.provider.get).mockResolvedValue({id:'wanted',status:'succeeded',results:[]});
 await coordinator.resume({projectId:s.project.id,runId:s.run.id});await coordinator.drain();expect(runtime.assets.repository.list(s.project.id)).toHaveLength(0);expect(runtime.generations.get(s.project.id,s.run.id).slots[0].status).toBe('unknown');
});
it('recovers a locally archived original after an interrupted completion without downloading again',async()=>{
 const download=vi.fn();const s=await setup(1,{download});download.mockResolvedValue(s.bytes);
 const complete=vi.spyOn(runtime.generations,'complete').mockImplementationOnce(()=>{throw Error('interrupted completion');});
 await coordinator.confirm({projectId:s.project.id,runId:s.run.id});await coordinator.drain();
 expect(runtime.assets.repository.list(s.project.id)).toHaveLength(1);complete.mockRestore();
 download.mockRejectedValue(Error('expired URL'));
 await coordinator.resume({projectId:s.project.id,runId:s.run.id});await coordinator.drain();
 expect(runtime.generations.get(s.project.id,s.run.id).slots[0].status).toBe('succeeded');expect(download).toHaveBeenCalledTimes(1);
});
it('validates immutable reference bytes before any POST and sends only strict snapshot provider fields',async()=>{
 const s=await setup(),image=await runtime.assets.importImage({projectId:s.project.id,bytes:s.bytes,fileName:'input.png'});
 const canvas=runtime.canvases.load(s.project.id,s.target.canvasId);
 runtime.canvases.save(s.project.id,{...canvas.document,nodes:[...canvas.document.nodes,{id:'ref',kind:'asset',position:{x:0,y:0},assetVersionId:image.id}],edges:[{id:'e',source:'ref',target:'g',role:'product'}]},canvas.panel,canvas.document.revision);
 const run=await coordinator.prepare(s.target);await coordinator.confirm({projectId:s.project.id,runId:run.id});await coordinator.drain();
 const posted=vi.mocked(s.provider.submit).mock.calls[0][0];expect(Object.keys(posted).sort()).toEqual(['aspectRatio','images','model','prompt','quality']);expect(posted.images).toEqual([`data:image/png;base64,${s.bytes.toString('base64')}`]);
 const bad=await coordinator.prepare(s.target);writeFileSync(join(root,'assets/originals',image.hash),Buffer.from('corrupt'));
 await expect(coordinator.confirm({projectId:s.project.id,runId:bad.id})).rejects.toThrow();expect(s.provider.submit).toHaveBeenCalledTimes(1);expect(runtime.generations.get(s.project.id,bad.id).approvedAt).toBeNull();
});
it('collects a persisted download even when another queued slot is blocked by missing credentials',async()=>{
 const s=await setup(2);runtime.generations.confirm(s.project.id,s.run.id);runtime.generations.claim(s.run.id,0);runtime.generations.recordRemote(s.run.id,0,'saved');runtime.generations.recordResult(s.project.id,s.run.id,0,'https://images.example/saved');
 await coordinator.shutdown();coordinator=new ImageGenerationCoordinator(rpc,{resolveGrsai:()=>{throw Error('CREDENTIAL_NOT_FOUND');}},{download:async()=>s.bytes});
 await coordinator.start(true);await coordinator.drain();
 expect(runtime.generations.get(s.project.id,s.run.id).slots.map(s=>s.status)).toEqual(['succeeded','queued']);expect(s.provider.submit).not.toHaveBeenCalled();
});
