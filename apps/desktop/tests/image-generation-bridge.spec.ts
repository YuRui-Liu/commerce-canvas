import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultGenerationSettings } from '../../../packages/contracts/src/imageGeneration';

test('generation bridge prepares immutable plans and fails missing-key preflight without exposing internals',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-generation-'));
 const app=await electron.launch({...(process.env.COMMERCECANVAS_EXECUTABLE?{executablePath:process.env.COMMERCECANVAS_EXECUTABLE,args:[]}:{args:[resolve('apps/desktop/dist/main/index.js')]}),env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try{
  const page=await app.firstWindow();await expect(page.getByRole('status')).toHaveText('本地工作区');
  const result=await page.evaluate(async settings=>{
   const bridge=window.commerceCanvas,project=await bridge.createProject({name:'generation bridge'}),canvas=await bridge.createCanvas({projectId:project.id,name:'generation'});
   await bridge.saveCanvas({projectId:project.id,document:{...canvas.document,nodes:[{id:'g',kind:'generation',position:{x:0,y:0},generation:settings}]},panel:canvas.panel,expectedRevision:canvas.document.revision});
   const run=await bridge.prepareImageGeneration({projectId:project.id,canvasId:canvas.document.id,nodeId:'g'});
   let error='';try{await bridge.confirmImageGeneration({projectId:project.id,runId:run.id});}catch(cause){error=String(cause);}
   const listed=await bridge.listImageGenerations({projectId:project.id,canvasId:canvas.document.id});
   const stopped=await bridge.stopImageGeneration({projectId:project.id,runId:run.id});
   return {error,listed,stopped,exposed:Object.keys(bridge)};
  },defaultGenerationSettings());
  expect(result.error).toMatch(/CREDENTIAL_NOT_FOUND|SECURE_STORAGE_UNAVAILABLE/);
  expect(result.listed).toHaveLength(1);expect(result.listed[0]).toMatchObject({approvedAt:null,status:'queued',slots:[]});expect(result.stopped.status).toBe('cancelled');
  for(const internal of ['generationRecover','generationClaim','generationInputBytes','generationArchive','resolveGrsai'])expect(result.exposed).not.toContain(internal);
  expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.isVisible()))).toEqual([false]);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
