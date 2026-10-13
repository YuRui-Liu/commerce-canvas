import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('canvas graph drag history, connections, grouping and viewport survive UI changes',async()=>{
  const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-canvas-'));
  const app=await electron.launch({...(process.env.COMMERCECANVAS_EXECUTABLE?{executablePath:process.env.COMMERCECANVAS_EXECUTABLE,args:[]}:{args:[resolve('apps/desktop/dist/main/index.js')]}),env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
  try{
    const page=await app.firstWindow();
    page.setDefaultTimeout(5000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('图交互验证');await page.getByRole('button',{name:'创建',exact:true}).click();
    await page.getByRole('button',{name:'添加 Agent',exact:true}).click();
    const node=page.locator('.react-flow__node-agent').first();await expect(node).toBeVisible();
    const initial=await node.evaluate(el=>(el as HTMLElement).style.transform);
    const box=await node.boundingBox();await page.mouse.move(box!.x+80,box!.y+20);await page.mouse.down();await page.mouse.move(box!.x+160,box!.y+100,{steps:12});await page.mouse.up();
    await expect.poll(()=>node.evaluate(el=>(el as HTMLElement).style.transform)).not.toBe(initial);
    await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(()=>node.evaluate(el=>(el as HTMLElement).style.transform)).toBe(initial);
    await page.getByRole('button',{name:'重做',exact:true}).click();
    await page.getByRole('button',{name:'添加 Agent',exact:true}).click();await page.getByRole('button',{name:'自动布局',exact:true}).click();await page.getByRole('button',{name:'适合视图',exact:true}).click();
    await expect(page.locator('.react-flow__node-agent')).toHaveCount(2);
    await page.screenshot({path:'apps/desktop/dist/c2-before-connect.png'});
    const source=page.locator('.react-flow__node-agent').nth(0).locator('.source');const target=page.locator('.react-flow__node-agent').nth(1).locator('[data-handleid="product"]');
    await source.click();await target.click();await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await page.locator('.react-flow__edge-textbg').click();await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);
    await page.locator('.react-flow__edge').focus();await page.keyboard.press('Delete');await expect(page.locator('.react-flow__edge')).toHaveCount(0);await expect(page.locator('.react-flow__node-agent')).toHaveCount(2);
    await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await page.locator('.react-flow__edge-textbg').click();await page.getByRole('button',{name:'删除所选',exact:true}).click();await expect(page.locator('.react-flow__edge')).toHaveCount(0);await expect(page.locator('.react-flow__node-agent')).toHaveCount(2);
    await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    const reverseSource=await page.locator('.react-flow__node-agent').nth(1).locator('.source').boundingBox();const reverseTarget=await page.locator('.react-flow__node-agent').nth(0).locator('[data-handleid="style"]').boundingBox();
    await page.mouse.move(reverseSource!.x+reverseSource!.width/2,reverseSource!.y+reverseSource!.height/2);await page.mouse.down();await page.mouse.move(reverseTarget!.x+reverseTarget!.width/2,reverseTarget!.y+reverseTarget!.height/2,{steps:10});await page.mouse.up();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await page.locator('.react-flow__node-agent').nth(1).click({position:{x:80,y:20}});await page.keyboard.press('Delete');await expect(page.locator('.react-flow__node-agent')).toHaveCount(1);await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.react-flow__node-agent')).toHaveCount(2);await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await page.getByLabel('商品名称',{exact:true}).fill('Delete保留节点');await page.keyboard.press('Delete');await expect(page.locator('.react-flow__node-agent')).toHaveCount(2);
    for(const editable of ['', 'plaintext-only']){
      await page.locator('.react-flow__node-agent').nth(0).click({position:{x:80,y:20}});
      await page.evaluate(value=>{const editor=document.createElement('div');editor.setAttribute('contenteditable',value);editor.id='test-editable';editor.style.cssText='position:absolute;top:100px;left:10px;z-index:100';editor.innerHTML='<span tabindex="0">保留节点</span>';document.querySelector('.graph-workspace')!.append(editor);(editor.firstElementChild as HTMLElement).focus();},editable);
      await page.keyboard.press('Delete');await expect(page.locator('.react-flow__node-agent')).toHaveCount(2);
      await page.evaluate(()=>document.querySelector('#test-editable')!.remove());
    }
    const viewport=await page.locator('.react-flow__viewport').getAttribute('style');
    await page.getByRole('button',{name:'纸白莓红',exact:true}).click();await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style',viewport!);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1200,850));await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style',viewport!);
    await page.getByRole('button',{name:'素材库',exact:true}).click();
    await page.getByRole('button',{name:'适合视图',exact:true}).click();
    await page.screenshot({path:'apps/desktop/dist/c2-resized.png'});
    await page.locator('.react-flow__node-agent').nth(0).click({position:{x:80,y:20}});await page.keyboard.down('Shift');await page.locator('.react-flow__node-agent').nth(1).click({position:{x:80,y:20}});await page.keyboard.up('Shift');
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
    await page.screenshot({path:'apps/desktop/dist/c2-selected.png'});
    await page.getByRole('button',{name:'分组',exact:true}).click();await expect(page.locator('.react-flow__node-group')).toHaveCount(1);
    await page.getByRole('button',{name:'适合视图',exact:true}).click();
    await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
    await page.locator('.graph-group-label').click({position:{x:20,y:10}});
    const groupedBefore=await page.locator('.react-flow__node-agent').first().boundingBox();const groupBox=await page.locator('.graph-group-label').boundingBox();
    await page.mouse.move(groupBox!.x+40,groupBox!.y+20);await page.mouse.down();await page.mouse.move(groupBox!.x+88,groupBox!.y+52,{steps:8});await page.mouse.up();
    const groupedAfter=await page.locator('.react-flow__node-agent').first().boundingBox();expect(groupedAfter!.x).toBeGreaterThan(groupedBefore!.x+20);
    await page.getByRole('button',{name:'解组',exact:true}).click();await expect(page.locator('.react-flow__node-group')).toHaveCount(0);
    const ungrouped=await page.locator('.react-flow__node-agent').first().boundingBox();expect(Math.abs(ungrouped!.x-groupedAfter!.x)).toBeLessThan(2);expect(Math.abs(ungrouped!.y-groupedAfter!.y)).toBeLessThan(2);
    await page.screenshot({path:'apps/desktop/dist/c2-canvas-editorial.png'});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,768));
    const toolbar=await page.locator('.graph-tools').boundingBox(),surface=await page.locator('.canvas-surface').boundingBox();expect(toolbar!.x).toBeGreaterThanOrEqual(surface!.x);expect(toolbar!.x+toolbar!.width).toBeLessThanOrEqual(surface!.x+surface!.width);
    await page.screenshot({path:'apps/desktop/dist/c2-canvas-1024.png'});
    expect(errors).toEqual([]);
  }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
test('canvas benchmark 200 nodes 300 edges real Electron drag and layout',async()=>{
  const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-canvas-perf-'));
  const app=await electron.launch({...(process.env.COMMERCECANVAS_EXECUTABLE?{executablePath:process.env.COMMERCECANVAS_EXECUTABLE,args:[]}:{args:[resolve('apps/desktop/dist/main/index.js')]}),env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
  try{
    const page=await app.firstWindow();await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('仅测试性能');await page.getByRole('button',{name:'创建',exact:true}).click();
    await expect(page.getByRole('button',{name:'添加 Agent',exact:true})).toBeVisible();
    await page.evaluate(async()=>{const add=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='添加 Agent')!;for(let i=0;i<200;i++){add.click();if(i%25===24)await new Promise(requestAnimationFrame);}});
    await expect(page.locator('.graph-status')).toContainText('200 个节点');
    // Test-only fixture injection through the rendered component's public connection callback.
    // No benchmark route, global, fake asset, or test data ships in the application.
    await page.evaluate(()=>{
      const element=document.querySelector('.react-flow')!;const key=Object.keys(element).find(k=>k.startsWith('__reactFiber'))!;
      let fiber=(element as any)[key];while(fiber&&!fiber.memoizedProps?.onConnect)fiber=fiber.return;
      const props=fiber.memoizedProps;const ids=props.nodes.map((n:any)=>n.id);
      for(let i=0;i<199;i++)props.onConnect({source:ids[i],target:ids[i+1],targetHandle:'product',sourceHandle:'output'});
      for(let i=0;i<101;i++)props.onConnect({source:ids[i],target:ids[i+2],targetHandle:'style',sourceHandle:'output'});
    });
    const layoutMs=await page.evaluate(async()=>{const start=performance.now();Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='自动布局')!.click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return performance.now()-start;});
    await page.getByRole('button',{name:'适合视图',exact:true}).click();
    await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});
    const nodeId=await page.evaluate(()=>{const surface=document.querySelector('.react-flow')!.getBoundingClientRect();return Array.from(document.querySelectorAll('.react-flow__node-agent')).find(el=>{const b=el.getBoundingClientRect();return b.x>surface.x+60&&b.right<surface.right-60;})!.getAttribute('data-id');});
    const visible=page.locator(`.react-flow__node-agent[data-id="${nodeId}"]`);await expect(visible).toBeVisible();const before=await visible.evaluate(el=>(el as HTMLElement).style.transform);const box=await visible.boundingBox();const start=performance.now();await page.mouse.move(box!.x+5,box!.y+5);await page.mouse.down();await page.mouse.move(box!.x+60,box!.y+50,{steps:20});await page.mouse.up();const dragMs=performance.now()-start;
    await expect.poll(()=>visible.evaluate(el=>(el as HTMLElement).style.transform)).not.toBe(before);
    console.log(JSON.stringify({benchmark:'Electron 200 unconfigured Agent nodes / 300 role edges',layoutTwoAnimationFramesMs:layoutMs,playwright20StepDragWallMs:dragMs}));
    await page.screenshot({path:'apps/desktop/dist/c2-performance.png'});
  }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
