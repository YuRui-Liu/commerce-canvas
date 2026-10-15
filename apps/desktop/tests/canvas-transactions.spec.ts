import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function launchCanvas(name:string){
  const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-transactions-'));
  const app=await electron.launch({...(process.env.COMMERCECANVAS_EXECUTABLE?{executablePath:process.env.COMMERCECANVAS_EXECUTABLE,args:[]}:{args:[resolve('apps/desktop/dist/main/index.js')]}),env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
  const page=await app.firstWindow();
  await page.getByRole('button',{name:'创建项目',exact:true}).first().click();
  await page.getByLabel('项目名称').fill(name);await page.getByRole('button',{name:'创建',exact:true}).click();
  await page.locator('.graph-more summary').click();await expect(page.getByRole('button',{name:'添加 Agent',exact:true})).toBeVisible();
  return {app,page,root};
}

test('canvas keyboard position command undo preserves its node',async()=>{
  const {app,page,root}=await launchCanvas('键盘移动');
  try{
    await page.getByRole('button',{name:'添加 Agent',exact:true}).click();
    const node=page.locator('.react-flow__node-agent');await node.click({position:{x:80,y:20}});await node.focus();
    const before=await node.evaluate(el=>(el as HTMLElement).style.transform);
    await page.keyboard.press('ArrowRight');
    await expect.poll(()=>node.evaluate(el=>(el as HTMLElement).style.transform)).not.toBe(before);
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await expect(node).toHaveCount(1);await expect.poll(()=>node.evaluate(el=>(el as HTMLElement).style.transform)).toBe(before);
  }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('canvas batch commands serialize, lock edits, and cancel unfinished work on unmount',async()=>{
  const {app,page,root}=await launchCanvas('批次原项目');
  try{
    const original=await page.evaluate(()=>window.commerceCanvas.getCurrentProject());
    await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('批次第二项目');await page.getByRole('button',{name:'创建',exact:true}).click();
    await expect(page.getByLabel('商品项目', {exact:true}).locator('option:checked')).toHaveText('批次第二项目');
    const other=await page.evaluate(()=>window.commerceCanvas.getCurrentProject());
    await page.getByLabel('商品项目',{exact:true}).selectOption(original!);
    await expect(page.getByLabel('商品项目', {exact:true}).locator('option:checked')).toHaveText('批次原项目');
    await page.locator('.graph-more summary').click();
    await page.getByRole('button',{name:'添加 Agent',exact:true}).click();
    await page.evaluate(async()=>{
      const asset=await window.commerceCanvas.saveText({projectId:(await window.commerceCanvas.getCurrentProject())!,text:'真实测试素材'});
      const element=document.querySelector('.react-flow')!;const key=Object.keys(element).find(k=>k.startsWith('__reactFiber'))!;
      let fiber=(element as any)[key];while(fiber&&!fiber.ref?.current?.addAssets)fiber=fiber.return;
      const handle=fiber.ref.current;
      const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;let id=0;const callbacks=new Map<number,FrameRequestCallback>();
      window.requestAnimationFrame=callback=>{callbacks.set(++id,callback);return id;};window.cancelAnimationFrame=frame=>{callbacks.delete(frame);};
      const before=handle.getDocument().nodes[0];
      (window as any).__batchTest={handle,asset,before,flush(){for(let frame=0;callbacks.size&&frame<20;frame++){const entries=[...callbacks.values()];callbacks.clear();for(const callback of entries)callback(performance.now());}},restore(){window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;}};
      handle.addAssets(Array(26).fill(asset));handle.addAssets(Array(26).fill(asset));
      // Invoke the actual component callback while rAF is paused: a disabled UI
      // alone must not allow an in-flight gesture to leak into this transaction.
      let flow=(element as any)[key];while(flow&&!flow.memoizedProps?.onNodesChange)flow=flow.return;
      flow.memoizedProps.onNodesChange([{type:'position',id:before.id,position:{x:999,y:999}}]);
    });
    await expect(page.getByRole('button',{name:'添加 Agent',exact:true})).toBeDisabled();
    await page.evaluate(()=>{(window as any).__batchTest.flush();(window as any).__batchTest.restore();});
    await expect(page.getByRole('button',{name:'添加 Agent',exact:true})).toBeEnabled();
    expect(await page.evaluate(()=>{const t=(window as any).__batchTest;const d=t.handle.getDocument();return {assets:d.nodes.filter((n:any)=>n.kind==='text').length,position:d.nodes.find((n:any)=>n.id===t.before.id).position,initial:t.before.position};})).toEqual(expect.objectContaining({assets:52}));
    const positions=await page.evaluate(()=>{const t=(window as any).__batchTest;return {actual:t.handle.getDocument().nodes.find((n:any)=>n.id===t.before.id).position,expected:t.before.position};});expect(positions.actual).toEqual(positions.expected);
    await page.getByRole('button',{name:'添加 Agent',exact:true}).click();
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    expect(await page.evaluate(()=>(window as any).__batchTest.handle.getDocument().nodes.length)).toBe(53);
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    expect(await page.evaluate(()=>(window as any).__batchTest.handle.getDocument().nodes.length)).toBe(27);
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    expect(await page.evaluate(()=>(window as any).__batchTest.handle.getDocument().nodes.length)).toBe(1);
    // Hold the next batch across a real project switch/unmount. Its provisional
    // chunk must neither publish partial state nor finish after the mount dies.
    await page.evaluate(()=>{const t=(window as any).__batchTest;const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;const callbacks=new Map<number,FrameRequestCallback>();let id=0;window.requestAnimationFrame=cb=>{callbacks.set(++id,cb);return id;};window.cancelAnimationFrame=frame=>{callbacks.delete(frame);};t.finishCancelled=()=>{window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;for(const cb of callbacks.values())cb(performance.now());};t.handle.addAssets(Array(26).fill(t.asset));});
    await page.getByLabel('商品项目',{exact:true}).selectOption(other!);
    await expect(page.getByLabel('商品项目',{exact:true}).locator('option:checked')).toHaveText('批次第二项目');
    await page.evaluate(()=>(window as any).__batchTest.finishCancelled());
    await page.getByLabel('商品项目',{exact:true}).selectOption(original!);
    await expect(page.locator('.graph-status')).toContainText('1 个节点');
  }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
