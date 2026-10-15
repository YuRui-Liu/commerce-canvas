import {_electron as electron,expect,test} from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {defaultGenerationSettings} from '../../../packages/contracts/src/imageGeneration';


test('image-first nodes expose one editor, visual settings and real scenario configuration',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-redesign-'));
 const app=await electron.launch({args:[resolve('apps/desktop/dist/main/index.js')],env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try{
 const page=await app.firstWindow();
 page.setDefaultTimeout(5000);page.on('pageerror',error=>console.log('redesign page error',error.message));
 await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('交互验收');await page.getByRole('button',{name:'创建',exact:true}).click();
 await page.getByRole('button',{name:'添加出图节点',exact:true}).click();
 await page.screenshot({path:'apps/desktop/dist/redesign-first.png'});
 await expect(page.locator('.generation-image-body')).toBeVisible();
 await expect(page.getByLabel('画面描述',{exact:true})).toHaveCount(1);
 await page.getByLabel('画面描述',{exact:true}).fill('保留原始草稿');
 await page.getByRole('button',{name:'画幅与尺寸',exact:true}).click();
 await page.getByRole('button',{name:'画幅 3:4',exact:true}).click();await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'画幅与尺寸',exact:true})).toBeFocused();
 await expect(page.getByRole('button',{name:'画幅与尺寸',exact:true})).toContainText('1:1');
 await page.getByRole('button',{name:'画幅与尺寸',exact:true}).click();await page.getByRole('button',{name:'画幅 3:4',exact:true}).click();await page.getByRole('button',{name:'应用尺寸'}).click();await expect(page.getByRole('button',{name:'画幅与尺寸',exact:true})).toContainText('3:4');
 await page.getByRole('button',{name:'摄影与灯光',exact:true}).click();
 await page.getByRole('button',{name:'镜头 微距',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'摄影与灯光',exact:true}).click();await expect(page.getByRole('button',{name:'镜头 自动',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');
 await page.getByLabel('画面描述',{exact:true}).focus();await page.keyboard.press('Backspace');await expect(page.locator('.generation-card')).toHaveCount(1);
 await page.getByRole('button',{name:'场景',exact:true}).click();await page.screenshot({path:'apps/desktop/dist/redesign-scenarios.png'});await page.getByRole('button',{name:'使用 白底主图',exact:true}).click();
 await expect(page.locator('.generation-card')).toHaveCount(2);await expect(page.getByLabel('画面描述',{exact:true})).toHaveCount(1);await expect(page.getByLabel('画面描述',{exact:true})).toHaveValue(/主体任务/);
 await page.getByRole('button',{name:'生成图片',exact:true}).click();const review=page.getByRole('dialog',{name:'确认图片生成'});await review.getByText('查看完整生成指令',{exact:true}).click();await expect(review).toContainText('白底商品主图');await review.getByRole('button',{name:'取消',exact:true}).click();
 for(const [name,content,ratio] of [['生活场景','生活方式商品场景图','4:3'],['材质细节','商品材质细节图','3:4'],['卖点海报','商品卖点海报','3:4']]){
  await page.getByRole('button',{name:'场景',exact:true}).click();await page.getByRole('button',{name:`使用 ${name}`,exact:true}).click();await expect(page.getByLabel('画面描述')).toHaveValue(new RegExp(content));await expect(page.getByRole('button',{name:'画幅与尺寸'})).toContainText(ratio);
  await page.getByRole('button',{name:'生成图片',exact:true}).click();await review.getByText('查看完整生成指令',{exact:true}).click();await expect(review).toContainText(content);await review.getByRole('button',{name:'取消',exact:true}).click();
 }
 const prompts=await page.evaluate(async()=>{const b=window.commerceCanvas,projectId=(await b.getCurrentProject())!,canvasId=(await b.getSelectedCanvas({projectId}))!;return (await b.loadCanvas({projectId,canvasId})).document.nodes.map(n=>n.generation?.prompt);});expect(prompts[0]).toContain('保留原始草');expect(new Set(prompts).size).toBe(5);
 expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.isVisible()))).toEqual([false]);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('references, multi-selection, low zoom, nested Escape and wheel remain usable',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-redesign-graph-'));
 const app=await electron.launch({args:[resolve('apps/desktop/dist/main/index.js')],env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(5000);
  await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('参考与缩放');await page.getByRole('button',{name:'创建',exact:true}).click();
  await expect(page.getByLabel('当前画布',{exact:true})).toBeVisible();
  await page.evaluate(async settings=>{const b=window.commerceCanvas,projectId=(await b.getCurrentProject())!,canvasId=(await b.getSelectedCanvas({projectId}))!,record=await b.loadCanvas({projectId,canvasId}),asset=await b.saveText({projectId,text:'必须保留原始颜色'});await b.saveCanvas({projectId,expectedRevision:record.document.revision,panel:{...record.panel,selectedIds:['g1']},document:{...record.document,nodes:[{id:'text',kind:'text',assetVersionId:asset.id,position:{x:0,y:30}},{id:'g1',kind:'generation',generation:settings,position:{x:290,y:30}},{id:'g2',kind:'generation',generation:settings,position:{x:680,y:30}}],edges:[]}});},defaultGenerationSettings());
  await page.reload();await expect(page.getByLabel('画面描述')).toHaveCount(1);
  const first=page.locator('[data-id="g1"]'),second=page.locator('[data-id="g2"]');
  const anchors=()=>first.locator('.react-flow__handle.target').evaluateAll(handles=>handles.map(el=>{const r=el.getBoundingClientRect(),p=el.closest('.generation-card')!.getBoundingClientRect();return [r.x-p.x,r.y-p.y];}));
  const before=await anchors();await second.locator('header').click({modifiers:['Shift']});await expect(page.getByLabel('画面描述')).toHaveCount(0);expect(await anchors()).toEqual(before);
  await first.locator('header').click();await expect(page.getByLabel('画面描述')).toHaveCount(1);
  await page.locator('[data-id="text"] .source').click();await first.locator('[data-handleid="instruction"]').click();await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await first.locator('header').click();await page.getByRole('button',{name:'解绑指令参考'}).click();await expect(page.locator('.react-flow__edge')).toHaveCount(0);await expect(page.locator('[data-id="text"]')).toHaveCount(1);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  const transform=()=>page.locator('.react-flow__viewport').evaluate(el=>getComputedStyle(el).transform);
  const beforeWheel=await transform();await page.getByLabel('画面描述').hover();await page.mouse.wheel(0,100);expect(await transform()).toBe(beforeWheel);
  await page.getByLabel('画面描述').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true})));await expect(page.getByLabel('画面描述')).toHaveCount(1);
  await page.getByLabel('画面描述').press('Escape');await expect(page.getByLabel('画面描述')).toHaveCount(0);await first.locator('header').click();
  await page.getByRole('button',{name:'展开编辑器',exact:true}).click();const expanded=page.getByRole('dialog',{name:'编辑图片生成',exact:true});await expect(expanded).toBeVisible();
  await expanded.getByRole('button',{name:'摄影与灯光',exact:true}).click();await page.keyboard.press('Escape');await expect(expanded).toBeVisible();await expect(expanded.getByRole('button',{name:'摄影与灯光'})).toBeFocused();await page.keyboard.press('Escape');await expect(expanded).toHaveCount(0);await expect(page.getByLabel('画面描述')).toHaveCount(1);
  await page.getByRole('button',{name:'适合视图',exact:true}).click();await page.locator('.react-flow__controls-zoomout').click();await page.locator('.react-flow__controls-zoomout').click();
  await expect(page.locator('.compact-editor')).toBeVisible();await page.locator('.compact-editor button').click();await expect(expanded.getByLabel('画面描述')).toBeVisible();await page.screenshot({path:'apps/desktop/dist/redesign-low-zoom.png'});await page.keyboard.press('Escape');
  for(let i=0;i<10;i++)await page.locator('.react-flow__controls-zoomin').click();await expect(page.locator('.compact-editor button')).toBeVisible();const entry=await page.locator('.compact-editor button').boundingBox(),surface=await page.locator('.react-flow').boundingBox();expect(entry!.x).toBeGreaterThanOrEqual(surface!.x);expect(entry!.x+entry!.width).toBeLessThanOrEqual(surface!.x+surface!.width);expect(entry!.y+entry!.height).toBeLessThanOrEqual(surface!.y+surface!.height);await page.locator('.compact-editor button').click();await expect(expanded.getByLabel('画面描述')).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'适合视图',exact:true}).click();
  await first.locator('header').click({modifiers:['Shift']});await expect(page.getByRole('dialog')).toHaveCount(0);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
