import {_electron as electron,expect,test} from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {ElectronApplication,Page} from '@playwright/test';
const launchTarget=process.env.COMMERCECANVAS_EXECUTABLE?{executablePath:process.env.COMMERCECANVAS_EXECUTABLE,args:[]}:{args:[resolve('apps/desktop/dist/main/index.js')]};
test('generation revision conflict copies prepared node and chat snapshot without old run ownership',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-generation-copy-'));
 const app=await electron.launch({...launchTarget,env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try{
  const page=await app.firstWindow();await expect(page.getByRole('status')).toHaveText('本地工作区');await create(page);
  const card=page.locator('.generation-card');await card.getByLabel('画面描述').fill('保留生成草稿');await card.getByRole('button',{name:'生成图片',exact:true}).click();await page.getByRole('dialog',{name:'确认图片生成'}).getByRole('button',{name:'取消',exact:true}).click();await page.waitForTimeout(600);
  await page.evaluate(async()=>{const b=window.commerceCanvas,projectId=(await b.getCurrentProject())!,canvasId=(await b.getSelectedCanvas({projectId}))!,c=await b.loadCanvas({projectId,canvasId});await b.saveCanvas({projectId,document:c.document,panel:{...c.panel,messages:[{id:crypto.randomUUID(),role:'user',text:'历史生成上下文',selectedNodes:c.document.nodes,createdAt:new Date().toISOString()}]},expectedRevision:c.document.revision});});
  await page.reload();await expect(card.getByLabel('画面描述')).toHaveValue('保留生成草稿');const original=await saved(page);
  await page.evaluate(async()=>{const b=window.commerceCanvas,projectId=(await b.getCurrentProject())!,canvasId=(await b.getSelectedCanvas({projectId}))!,c=await b.loadCanvas({projectId,canvasId});await b.saveCanvas({projectId,document:c.document,panel:c.panel,expectedRevision:c.document.revision});});
  await card.getByLabel('画面描述').fill('冲突中的新草稿');await expect(page.getByRole('alert')).toContainText('修订冲突');await page.getByRole('button',{name:'另存画布副本'}).click();await expect(page.getByRole('alert')).toHaveCount(0);
  const copy=await saved(page);expect(copy.document.id).not.toBe(original.document.id);expect(copy.document.nodes[0].generation?.prompt).toBe('冲突中的新草稿');expect(copy.document.nodes[0].runId).toBeUndefined();expect(copy.panel.messages[0].selectedNodes[0].runId).toBeUndefined();expect(copy.panel.messages[0].text).toBe('历史生成上下文');expect(copy.panel.generationDeliveries).toEqual([]);expect(original.document.nodes[0].runId).toBeTruthy();
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
async function create(page:Page,name='商品摄影'){
 await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill(name);await page.getByRole('button',{name:'创建',exact:true}).click();
 await page.getByRole('button',{name:'添加出图节点',exact:true}).click();await expect(page.locator('.generation-card')).toBeVisible();
}
async function fixtureState(app:ElectronApplication,patch:Record<string,unknown>={}){return app.evaluate((_,patch)=>{const state=(globalThis as any).commerceCanvasGenerationFixture;Object.assign(state,patch);return {...state};},patch);}
async function saved(page:Page){return page.evaluate(async()=>{const b=window.commerceCanvas,projectId=(await b.getCurrentProject())!,canvasId=(await b.getSelectedCanvas({projectId}))!;return b.loadCanvas({projectId,canvasId});});}
test('generation configuration, photography and missing credential review remain durable',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-generation-ui-'));
 const app=await electron.launch({...launchTarget,env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try{
 const page=await app.firstWindow();await expect(page.getByRole('status')).toHaveText('本地工作区');
 await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('出图工作室');await page.getByRole('button',{name:'创建',exact:true}).click();
 await page.getByRole('button',{name:'添加出图节点',exact:true}).click();
 const card=page.locator('.generation-card');await expect(card).toBeVisible();
 await card.getByLabel('画面描述').fill('保留商品标签，白色背景');
 await card.getByLabel('画面描述').press('Delete');await expect(card).toBeVisible();
 await card.getByRole('button',{name:'摄影与灯光'}).click();
 const photo=page.getByRole('dialog',{name:'摄影与灯光'});await photo.getByLabel('相机').selectOption('fullframe');await photo.getByLabel('镜头').selectOption('macro');
 await photo.getByLabel('灯光方案').selectOption('window');await photo.getByRole('button',{name:'应用摄影设置'}).click();
 await card.getByRole('button',{name:'摄影与灯光'}).click();await expect(photo.getByLabel('相机')).toHaveValue('fullframe');await photo.press('Escape');
 await expect(card.getByRole('button',{name:'摄影与灯光'})).toBeFocused();
 await card.getByRole('button',{name:'生成图片',exact:true}).click();const review=page.getByRole('dialog',{name:'确认图片生成'});await expect(review).toContainText('1024 × 1024');
  await review.getByRole('button',{name:'确认生成',exact:true}).click();await expect(review).toContainText('凭证');
  await review.getByRole('button',{name:'打开设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'设置',exact:true});await expect(settings).toContainText('图片生成节点直接连接 GRSai');await settings.getByRole('button',{name:'关闭弹窗',exact:true}).click();await expect(review).toBeVisible();
 await review.getByRole('button',{name:'取消',exact:true}).click();
 await page.waitForTimeout(600);await page.reload();await expect(page.locator('.generation-card').getByLabel('画面描述')).toHaveValue('保留商品标签，白色背景');
 expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.isVisible()))).toEqual([false]);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('fixture exercises confirmation, partial/unknown recovery, derivatives and durable delivery receipts',async()=>{
 test.setTimeout(60000);
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-generation-results-'));
 const app=await electron.launch({...launchTarget,env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root,COMMERCECANVAS_GENERATION_FIXTURE:'1'}});
 try{
  const page=await app.firstWindow();await expect(page.getByRole('status')).toHaveText('本地工作区');await fixtureState(app,{mode:'partial'});await create(page);
  const card=page.locator('.generation-card');await card.getByLabel('画面描述').fill('保留商品，柔光白底');await card.getByLabel('生成数量').selectOption('3');
  await card.getByRole('button',{name:'生成图片',exact:true}).click();const review=page.getByRole('dialog',{name:'确认图片生成'});await expect(review).toBeVisible();expect((await fixtureState(app)).submits).toBe(0);
  await review.getByRole('button',{name:'确认生成',exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  const inspector=page.locator('.generation-inspector');await expect(inspector.getByText('1 成功 · 1 失败',{exact:true})).toBeVisible();await expect(inspector.getByRole('button',{name:'绑定已有任务 ID'})).toBeVisible();expect((await fixtureState(app)).submits).toBe(3);
  await expect.poll(async()=>(await saved(page)).panel.generationDeliveries.length).toBe(1);
  await inspector.getByRole('button',{name:'绑定已有任务 ID'}).click();const bind=page.getByRole('dialog',{name:'绑定已有任务',exact:true});await expect(bind).toContainText('不能保证');await bind.getByLabel('任务 ID').fill('fixture-4');await bind.getByLabel('我确认需要关联这个已有任务').check();await bind.getByRole('button',{name:'确认绑定'}).click();
  await expect.poll(async()=>(await saved(page)).panel.generationDeliveries.length).toBe(2);expect((await fixtureState(app)).submits).toBe(3);
  const slot=inspector.locator('.generation-slot').first();await expect(slot).toContainText('实际 800 × 600');await expect(slot).toContainText('实际尺寸与请求尺寸不同');await slot.getByText('适配为目标尺寸',{exact:true}).click();await expect(slot.getByLabel('适配方式')).toHaveValue('contain');await slot.getByRole('button',{name:'创建适配版本'}).click();
  await expect.poll(async()=>(await saved(page)).panel.generationDeliveries.length).toBe(3);await expect(slot.locator('.generation-derivative')).toContainText('1024 × 1024');
  const before=await saved(page);const resultId=before.document.nodes.find(n=>n.kind==='output')!.id;
  await page.getByRole('button',{name:'适合视图',exact:true}).click();await page.locator(`[data-id="${resultId}"] header`).click();await page.getByRole('button',{name:'删除所选',exact:true}).click();
  await expect.poll(async()=>(await saved(page)).document.nodes.some(n=>n.id===resultId)).toBe(false);await page.waitForTimeout(1100);await page.reload();await expect(page.getByRole('button',{name:'添加出图节点',exact:true})).toBeVisible();
  await page.waitForTimeout(1100);const after=await saved(page);expect(after.document.nodes.some(n=>n.id===resultId)).toBe(false);expect(after.panel.generationDeliveries).toHaveLength(3);expect((await fixtureState(app)).submits).toBe(3);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('all photography groups, exact VIP sizes and themes fit hidden 1440/1024 windows',async()=>{
 test.setTimeout(60000);const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-generation-design-'));
 const app=await electron.launch({...launchTarget,env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try{
  const page=await app.firstWindow();await expect(page.getByRole('status')).toHaveText('本地工作区');await create(page);const card=page.locator('.generation-card');await card.getByLabel('画面描述').fill('玻璃香水瓶，保留品牌文字与瓶身比例，柔和自然光。');
  await expect(card.getByLabel('分辨率').locator('option[value="4K"]')).toHaveAttribute('disabled','');await card.getByLabel('模型',{exact:true}).selectOption('gpt-image-2-vip');await card.getByLabel('分辨率').selectOption('4K');await expect(card).toContainText('2880 × 2880 px');
  await card.getByRole('button',{name:'摄影与灯光'}).click();const photo=page.getByRole('dialog',{name:'摄影与灯光'});
  for(const [label,value] of [['相机','custom'],['镜头','macro'],['光圈','f8'],['拍摄角度','45'],['取景','detail'],['灯光方案','jewelry'],['光线方向','left45'],['柔硬程度','soft'],['色温','neutral'],['阴影强度','light'],['焦距','custom']])await photo.getByLabel(label,{exact:true}).selectOption(value);
  await photo.getByLabel('相机风格描述').fill('复古商业摄影');await photo.getByLabel('自定义焦距 mm').fill('120');await photo.getByRole('button',{name:'应用摄影设置'}).click();
  await expect.poll(async()=>(await saved(page)).document.nodes.find(n=>n.kind==='generation')?.generation?.photography).toMatchObject({camera:'custom',customCamera:'复古商业摄影',lens:'macro',focalLength:120,aperture:'f8',angle:'45',framing:'detail',lighting:'jewelry',direction:'left45',softness:'soft',temperature:'neutral',shadow:'light'});
  await page.waitForTimeout(500);await page.reload();await expect(page.locator('.generation-card').getByLabel('分辨率')).toHaveValue('4K');await page.locator('.generation-card').getByRole('button',{name:'摄影与灯光'}).click();await expect(photo.getByLabel('相机风格描述')).toHaveValue('复古商业摄影');await expect(photo.getByLabel('自定义焦距 mm')).toHaveValue('120');await photo.getByRole('button',{name:'重置为自动'}).click();await photo.getByRole('button',{name:'取消',exact:true}).click();
  for(const width of [1440,1024]){
   await app.evaluate(({BrowserWindow},width)=>{BrowserWindow.getAllWindows()[0].setSize(width,900);},width);
   if(width<1280&&await page.getByRole('button',{name:'素材库',exact:true}).getAttribute('aria-pressed')==='true')await page.getByRole('button',{name:'素材库',exact:true}).click();
   for(const [theme,name] of [['studio','白瓷钴蓝'],['editorial','纸白莓红']]){
    await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'适合视图',exact:true}).click();await page.waitForTimeout(250);await page.screenshot({path:`apps/desktop/dist/generation-${theme}-${width}.png`});
    await page.locator('.generation-card').getByRole('button',{name:'摄影与灯光'}).click();await expect(photo).toBeVisible();const bounds=await photo.boundingBox();expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(901);await page.screenshot({path:`apps/desktop/dist/generation-photo-${theme}-${width}.png`});await photo.press('Escape');
   }
  }
  expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.isVisible()))).toEqual([false]);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('deleted source stays absent while history collects known tasks without resubmission',async()=>{
 test.setTimeout(60000);const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-generation-source-'));
 const app=await electron.launch({...launchTarget,env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root,COMMERCECANVAS_GENERATION_FIXTURE:'1'}});
 try{
  const page=await app.firstWindow();await expect(page.getByRole('status')).toHaveText('本地工作区');await fixtureState(app,{mode:'slow'});await create(page);
  await page.locator('.generation-card').getByRole('button',{name:'生成图片',exact:true}).click();await page.getByRole('button',{name:'确认生成',exact:true}).click();await expect(page.locator('.generation-inspector .generation-run-state')).toHaveText('状态待确认');
  await page.getByRole('button',{name:'删除所选',exact:true}).click();await expect(page.locator('.generation-card')).toHaveCount(0);await page.getByRole('button',{name:'生成历史',exact:true}).click();await fixtureState(app,{mode:'success'});await page.getByRole('button',{name:'继续查询 / 收取结果'}).click();
  await expect.poll(async()=>(await saved(page)).panel.generationDeliveries.length).toBe(1);expect((await saved(page)).document.nodes).toHaveLength(0);expect((await fixtureState(app)).submits).toBe(1);
  await create(page,'另一个商品');await page.waitForTimeout(1200);expect((await saved(page)).document.nodes.every(n=>n.kind==='generation')).toBe(true);expect((await saved(page)).panel.generationDeliveries).toHaveLength(0);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('latest config is flushed, review cancellation never submits, undo and late IPC cannot resurrect results',async()=>{
 test.setTimeout(60000);const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-generation-races-'));
 const app=await electron.launch({...launchTarget,env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root,COMMERCECANVAS_GENERATION_FIXTURE:'1'}});
 try{
  const page=await app.firstWindow();await expect(page.getByRole('status')).toHaveText('本地工作区');await create(page);
  const card=page.locator('.generation-card');await card.getByLabel('画面描述').fill('最后一刻修改的指令');await card.getByRole('button',{name:'生成图片',exact:true}).click();const review=page.getByRole('dialog',{name:'确认图片生成'});await review.getByText('查看完整生成指令',{exact:true}).click();await expect(review).toContainText('最后一刻修改的指令');await review.getByRole('button',{name:'取消',exact:true}).click();expect((await fixtureState(app)).submits).toBe(0);
  await card.getByRole('button',{name:'生成图片',exact:true}).click();await review.getByRole('button',{name:'确认生成',exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});await expect.poll(async()=>(await saved(page)).panel.generationDeliveries.length).toBe(1);expect((await fixtureState(app)).submits).toBe(1);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(async()=>(await saved(page)).document.nodes.filter(n=>n.kind==='output').length).toBe(0);await page.waitForTimeout(1000);expect((await saved(page)).document.nodes.filter(n=>n.kind==='output')).toHaveLength(0);
  const count=(await fixtureState(app,{listDelayMs:1800})).lists;await expect.poll(async()=>(await fixtureState(app)).lists).toBeGreaterThan(count);
  await create(page,'迟到响应隔离');await page.waitForTimeout(2200);const next=await saved(page);expect(next.panel.generationDeliveries).toHaveLength(0);expect(next.document.nodes.filter(n=>n.kind==='output')).toHaveLength(0);await page.getByRole('button',{name:'生成历史',exact:true}).click();await expect(page.locator('.generation-inspector')).toContainText('还没有生成记录');expect((await fixtureState(app)).submits).toBe(1);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('closed inspector card distinguishes approved snapshot and next-run photography edits',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-generation-snapshot-'));
 const app=await electron.launch({...launchTarget,env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root,COMMERCECANVAS_GENERATION_FIXTURE:'1'}});
 try{
  const page=await app.firstWindow();await expect(page.getByRole('status')).toHaveText('本地工作区');await fixtureState(app,{mode:'slow',delay:900});await create(page);await page.getByRole('button',{name:'收起助手',exact:true}).click();
  const card=page.locator('.generation-card');await card.getByRole('button',{name:'摄影与灯光'}).click();const photo=page.getByRole('dialog',{name:'摄影与灯光'});await photo.getByLabel('镜头',{exact:true}).selectOption('macro');await photo.getByLabel('焦距',{exact:true}).selectOption('100');await photo.getByRole('button',{name:'应用摄影设置'}).click();
  await expect(card.getByRole('button',{name:'摄影与灯光'})).toContainText('2 项已配置');
  await card.getByRole('button',{name:'生成图片',exact:true}).click();await page.getByRole('button',{name:'确认生成',exact:true}).click();
  const snapshot=card.getByLabel('本次生成快照');await expect(snapshot).toContainText('gpt-image-2');await expect(snapshot).toContainText('1024 × 1024');await expect(snapshot).toContainText('1 张');await expect(card.locator('.generation-state')).toContainText(/提交中|生成中/);
  await card.getByLabel('模型',{exact:true}).selectOption('gpt-image-2-vip');await card.getByLabel('分辨率',{exact:true}).selectOption('4K');await card.getByLabel('生成数量',{exact:true}).selectOption('2');
  await expect(snapshot).toContainText('gpt-image-2 · 1024 × 1024 px · 1 张');await expect(snapshot).toContainText('参数已修改，仅影响下一次生成');await expect(card).toContainText('2880 × 2880 px');await expect(page.locator('.generation-inspector')).toHaveCount(0);
  expect((await fixtureState(app)).submits).toBe(1);expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.isVisible()))).toEqual([false]);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
