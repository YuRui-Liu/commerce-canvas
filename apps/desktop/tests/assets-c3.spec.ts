import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
test('C3 clipboard text creates a real immutable asset and inspector preserves node drafts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-c3-'));
 const app=await electron.launch({...(process.env.COMMERCECANVAS_EXECUTABLE?{executablePath:process.env.COMMERCECANVAS_EXECUTABLE,args:[]}:{args:[resolve('apps/desktop/dist/main/index.js')]}),env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try {const page=await app.firstWindow();page.setDefaultTimeout(5000);
 await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('C3 素材');await page.getByRole('button',{name:'创建',exact:true}).click();
 for(const tag of ['input','textarea','div']){await page.locator('.graph-workspace').evaluate((el,tag)=>{const editor=document.createElement(tag);if(tag==='div')editor.contentEditable='true';el.append(editor);const dt=new DataTransfer();dt.setData('text/plain','输入内粘贴');editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));editor.remove();},tag);await expect(page.locator('.react-flow__node')).toHaveCount(0);}
 await page.locator('.graph-workspace').evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','商品依据：棉');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await expect(page.locator('.react-flow__node-text')).toHaveCount(1);
 await page.locator('.react-flow__node-text header').click();
 await page.getByLabel('节点文本草稿').fill('商品依据：纯棉');await page.getByRole('button',{name:'保存文本新版本'}).click();
 await expect(page.locator('.graph-text')).toContainText('商品依据：纯棉');
 const versions=await page.evaluate(async()=>{const id=await window.commerceCanvas.getCurrentProject();return window.commerceCanvas.listAssets({projectId:id!});});
 expect(versions.filter(v=>v.kind==='text').map(v=>v.text)).toEqual(expect.arrayContaining(['商品依据：棉','商品依据：纯棉']));
 expect(new Set(versions.map(v=>v.assetId)).size).toBe(1);
 await page.getByLabel('节点文本草稿').fill('未保存草稿');await page.getByRole('button',{name:'添加 Agent',exact:true}).click();await page.getByRole('button',{name:'自动布局',exact:true}).click();await page.getByRole('button',{name:'适合视图',exact:true}).click();
 await page.locator('.react-flow__node-agent header').click();await page.locator('.react-flow__node-text header').click();await expect(page.getByLabel('节点文本草稿')).toHaveValue('未保存草稿');
 await page.getByLabel('节点文本草稿').evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','只编辑');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await expect(page.locator('.react-flow__node-text')).toHaveCount(1);
 await page.getByLabel('节点文本草稿').focus();await page.keyboard.press('Delete');await expect(page.locator('.react-flow__node-text')).toHaveCount(1);
 await page.getByRole('button',{name:'添加 Agent',exact:true}).click();await page.getByRole('button',{name:'添加 Agent',exact:true}).click();await page.getByRole('button',{name:'自动布局',exact:true}).click();await page.getByRole('button',{name:'适合视图',exact:true}).click();
 const source=page.locator('.react-flow__node-text .source');
 await source.click();await page.locator('.react-flow__node-agent').nth(0).locator('[data-handleid="facts"]').click();
 await source.click();await page.locator('.react-flow__node-agent').nth(1).locator('[data-handleid="instruction"]').click();
 await expect(page.locator('.react-flow__edge')).toHaveCount(2);
 await page.locator('.react-flow__node-text header').click();const roles=page.locator('.asset-inspector select');await expect(roles).toHaveCount(2);await roles.nth(0).selectOption('product');await expect(roles.nth(1)).toHaveValue('instruction');
 await page.getByLabel('节点文本草稿').fill('新版本，标记下游');await page.getByRole('button',{name:'保存文本新版本'}).click();await expect(page.locator('.react-flow__node-agent header small').filter({hasText:'需要更新'})).toHaveCount(2);await expect(page.locator('.react-flow__node-agent header small').filter({hasText:'未配置'})).toHaveCount(1);
 const graphNodes=await page.locator('.react-flow').evaluate(el=>{const key=Object.keys(el).find(k=>k.startsWith('__reactFiber'))!;let fiber=(el as any)[key];while(fiber&&!fiber.memoizedProps?.onConnect)fiber=fiber.return;return fiber.memoizedProps.nodes.map((n:any)=>n.data.node);});expect(JSON.stringify(graphNodes)).not.toContain('新版本，标记下游');
 await page.getByRole('button',{name:'添加文本',exact:true}).first().click();await page.getByLabel('文本内容').fill('输入法尚未结束');await page.getByLabel('文本内容').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true})));await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
 const originalProject=await page.evaluate(()=>window.commerceCanvas.getCurrentProject());await page.getByLabel('节点文本草稿').fill('切换项目仍保留草稿');
 await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('另一个项目');await page.getByRole('button',{name:'创建',exact:true}).click();await expect(page.getByLabel('商品项目',{exact:true}).locator('option:checked')).toHaveText('另一个项目');
 await page.getByLabel('商品项目',{exact:true}).selectOption(originalProject!);await page.locator('.react-flow__node-text header').click();await expect(page.getByLabel('节点文本草稿')).toHaveValue('切换项目仍保留草稿');
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
test('C3 native import picker reports each bad file and keeps the good file',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-c3-native-'));
 const valid=join(root,'good.png'),invalid=join(root,'broken.png');writeFileSync(valid,await sharp({create:{width:40,height:80,channels:4,background:'#765c3f'}}).png().toBuffer());writeFileSync(invalid,'invalid png');
 const app=await electron.launch({...(process.env.COMMERCECANVAS_EXECUTABLE?{executablePath:process.env.COMMERCECANVAS_EXECUTABLE,args:[]}:{args:[resolve('apps/desktop/dist/main/index.js')]}),env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try{const page=await app.firstWindow();await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('原生文件批量导入');await page.getByRole('button',{name:'创建',exact:true}).click();
 // Only the user's picker selection is supplied. Main-process reads and real runtime storage execute normally.
 await app.evaluate(({dialog},paths)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:paths});},[invalid,valid]);
 await page.getByRole('button',{name:'上传图片',exact:true}).first().click();await expect(page.getByLabel('逐文件导入结果')).toContainText('broken.png：失败');await expect(page.getByLabel('逐文件导入结果')).toContainText('good.png：成功');
 const imported=await page.evaluate(async()=>window.commerceCanvas.listAssets({projectId:(await window.commerceCanvas.getCurrentProject())!}));expect(imported).toHaveLength(1);expect(imported[0].width).toBe(40);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
test('C3 dropped files preserve partial successes at transformed coordinates and viewers share pixel geometry',async()=>{
 const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-c3-images-'));
 const app=await electron.launch({...(process.env.COMMERCECANVAS_EXECUTABLE?{executablePath:process.env.COMMERCECANVAS_EXECUTABLE,args:[]}:{args:[resolve('apps/desktop/dist/main/index.js')]}),env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
 try{const page=await app.firstWindow();page.setDefaultTimeout(5000);
 await page.getByRole('button',{name:'创建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('C3 测试商品图片');await page.getByRole('button',{name:'创建',exact:true}).click();
 // Generated local fixture, no product or advertising claims. Real image decoder + managed storage.
 const png=Array.from(await sharp({create:{width:1200,height:600,channels:4,background:'#b14639'}}).png().toBuffer());
 const portrait=Array.from(await sharp({create:{width:600,height:1200,channels:4,background:'#64947d'}}).png().toBuffer());
 await page.locator('.react-flow__controls-zoomin').click();await page.locator('.react-flow__controls-zoomin').click();
 const surface=await page.locator('.react-flow').boundingBox();await page.mouse.move(surface!.x+150,surface!.y+150);await page.mouse.down({button:'middle'});await page.mouse.move(surface!.x+200,surface!.y+180,{steps:8});await page.mouse.up({button:'middle'});
 const point={x:surface!.x+100,y:surface!.y+150};
 const expected=await page.locator('.react-flow__viewport').evaluate((el,p)=>{const m=new DOMMatrix(getComputedStyle(el).transform);const bounds=el.closest('.react-flow')!.getBoundingClientRect();return {x:(p.x-bounds.x-m.e)/m.a,y:(p.y-bounds.y-m.f)/m.d};},point);
 await page.locator('.graph-workspace').evaluate((el,{png,point})=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([1,2,3])],'broken.png',{type:'image/png'}));dt.items.add(new File([new Uint8Array(png)],'fixture-wide.png',{type:'image/png'}));el.dispatchEvent(new DragEvent('drop',{clientX:point.x,clientY:point.y,dataTransfer:dt,bubbles:true,cancelable:true}));},{png,point});
 await expect(page.locator('.react-flow__node-asset')).toHaveCount(1);await expect(page.getByLabel('逐文件导入结果')).toContainText('broken.png：失败');await expect(page.getByLabel('逐文件导入结果')).toContainText('fixture-wide.png：成功');
 const position=await page.locator('.react-flow__node-asset').evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return {x:m.e,y:m.f};});expect(position.x).toBeCloseTo(expected.x,1);expect(position.y).toBeCloseTo(expected.y,1);
 const first=await page.evaluate(async()=>{const projectId=(await window.commerceCanvas.getCurrentProject())!;return (await window.commerceCanvas.listAssets({projectId}))[0];});
 await page.locator('.graph-workspace').evaluate((el,{id,point})=>{const dt=new DataTransfer();dt.setData('application/x-commercecanvas-asset-version',id);el.dispatchEvent(new DragEvent('drop',{clientX:point.x+100,clientY:point.y+100,dataTransfer:dt,bubbles:true,cancelable:true}));},{id:first.id,point});
 await expect(page.locator('.react-flow__node-asset')).toHaveCount(2);
 expect(await page.evaluate(async()=>window.commerceCanvas.listAssets({projectId:(await window.commerceCanvas.getCurrentProject())!}))).toHaveLength(1);
 await page.locator('.graph-workspace').evaluate((el,pixels)=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(pixels)],'fixture-tall.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},portrait);
 await expect(page.locator('.react-flow__node-asset')).toHaveCount(3);
 const trigger=page.locator('.asset-card').first();await trigger.click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'实际像素 1:1'}).click();await expect(page.locator('.image-stage')).toHaveAttribute('data-scale','1');
 const dimensions=await page.locator('.image-stage img').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,filter:getComputedStyle(el).filter};});expect(dimensions.width).toBe(1200);expect(dimensions.height).toBe(600);expect(dimensions.filter).toBe('none');
 await page.getByRole('button',{name:'适合窗口'}).click();expect(Number(await page.locator('.image-stage').getAttribute('data-scale'))).toBeLessThan(1);await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 await page.getByRole('button',{name:'选择对比'}).nth(0).click();await page.getByRole('button',{name:'选择对比'}).nth(1).click();await page.getByRole('button',{name:'实际像素 1:1'}).click();
 const sizes=await page.locator('.image-stage img').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return [r.width,r.height];}));expect(sizes).toEqual([[1200,600],[600,1200]]);
 await page.getByRole('button',{name:'放大图片'}).click();const transforms=await page.locator('.image-stage img').evaluateAll(elements=>elements.map(el=>(el as HTMLElement).style.transform));expect(transforms[0]).toBe(transforms[1]);
 const stage=await page.locator('.image-stage').boundingBox();await page.mouse.move(stage!.x+100,stage!.y+100);await page.mouse.down();await page.mouse.move(stage!.x+140,stage!.y+130);await page.mouse.up();const pans=await page.locator('.image-stage img').evaluateAll(elements=>elements.map(el=>(el as HTMLElement).style.transform));expect(pans[0]).toBe(pans[1]);expect(pans[0]).toContain('40px, 30px');
 await page.getByRole('button',{name:'滑杆',exact:true}).click();await page.getByLabel('对比滑杆',{exact:true}).fill('30');await expect(page.locator('.image-pane').nth(1)).toHaveCSS('clip-path','inset(0px 70% 0px 0px)');
 await page.getByRole('button',{name:'并排',exact:true}).click();await page.getByRole('button',{name:'适合窗口'}).click();await page.screenshot({path:'apps/desktop/dist/c3-compare.png'});await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'选择对比'}).nth(1)).toBeFocused();
 await expect.poll(()=>page.locator('.asset-card img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
 await page.getByRole('button',{name:'自动布局',exact:true}).click();await page.getByRole('button',{name:'适合视图',exact:true}).click();
 const beforeDouble=await page.locator('.react-flow__node-asset').first().evaluate(el=>(el as HTMLElement).style.transform);await page.locator('.react-flow__node-asset .graph-preview').first().dblclick();await page.keyboard.press('Escape');expect(await page.locator('.react-flow__node-asset').first().evaluate(el=>(el as HTMLElement).style.transform)).toBe(beforeDouble);
 await page.getByRole('button',{name:'自动布局',exact:true}).click();await page.getByRole('button',{name:'适合视图',exact:true}).click();await page.screenshot({path:'apps/desktop/dist/c3-studio.png'});await page.getByRole('button',{name:'纸白莓红',exact:true}).click();await page.screenshot({path:'apps/desktop/dist/c3-editorial.png'});
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
