import {_electron as electron,expect,test} from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {defaultGenerationSettings} from '../../../packages/contracts/src/imageGeneration';

test('deleted library assets retain canvas content across restart and can be restored',async()=>{
  const root=mkdtempSync(join(tmpdir(),'commercecanvas-e2e-delete-'));
  const launch=()=>electron.launch({args:[resolve('apps/desktop/dist/main/index.js')],env:{...process.env,COMMERCECANVAS_TEST_USER_DATA:root}});
  let app=await launch();
  try{
    let page=await app.firstWindow();
    await page.getByRole('button',{name:'创建项目',exact:true}).first().click();
    await page.getByLabel('项目名称').fill('素材删除与恢复');
    await page.getByRole('button',{name:'创建',exact:true}).click();
    await page.locator('.graph-workspace').evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','保留原始商品资料');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
    await expect(page.locator('.graph-text')).toContainText('保留原始商品资料');
    await page.getByRole('button',{name:'删除素材',exact:true}).click();
    await expect(page.locator('.asset-card')).toHaveCount(0);
    await expect(page.locator('.graph-text')).toContainText('保留原始商品资料');
    await page.locator('.react-flow__node-text header').click();
    await expect(page.getByRole('button',{name:'保存文本新版本'})).toBeDisabled();
    await expect(page.getByRole('button',{name:'恢复此素材'})).toBeVisible();
    await page.getByRole('button',{name:'撤销删除',exact:true}).click();
    await expect(page.locator('.asset-card')).toHaveCount(1);
    await page.getByRole('button',{name:'删除素材',exact:true}).click();
    await expect(page.locator('.asset-card')).toHaveCount(0);
    const originalProject=await page.evaluate(()=>window.commerceCanvas.getCurrentProject());
    await page.getByRole('button',{name:'创建项目',exact:true}).first().click();
    await page.getByLabel('项目名称').fill('另一个独立项目');
    await page.getByRole('button',{name:'创建',exact:true}).click();
    await expect(page.getByLabel('商品项目',{exact:true}).locator('option:checked')).toHaveText('另一个独立项目');
    await page.getByRole('button',{name:/已删除/}).click();
    await expect(page.locator('.asset-card')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'撤销删除',exact:true})).toHaveCount(0);
    await page.getByLabel('商品项目',{exact:true}).selectOption(originalProject!);
    await app.close();
    app=await launch();page=await app.firstWindow();
    await expect(page.locator('.graph-text')).toContainText('保留原始商品资料');
    await page.getByRole('button',{name:/已删除/}).click();
    await expect(page.locator('.asset-card')).toContainText('保留原始商品资料');
    await page.getByRole('button',{name:'恢复素材',exact:true}).click();
    await page.getByRole('button',{name:'全部素材',exact:true}).click();
    await expect(page.locator('.asset-card')).toHaveCount(1);
    await expect(page.locator('.graph-text')).toContainText('保留原始商品资料');
    // Prepare only: no confirmation, credentials, provider request or generation cost.
    const pending=await page.evaluate(async settings=>{
      const bridge=window.commerceCanvas,projectId=(await bridge.getCurrentProject())!;
      const asset=(await bridge.listAssets({projectId}))[0];
      const record=await bridge.createCanvas({projectId,name:'引用保护测试'});
      const nodeId=crypto.randomUUID(),sourceId=crypto.randomUUID();
      await bridge.saveCanvas({projectId,expectedRevision:record.document.revision,panel:record.panel,document:{...record.document,nodes:[{id:sourceId,kind:'text',assetVersionId:asset.id,position:{x:0,y:0}},{id:nodeId,kind:'generation',generation:settings,position:{x:400,y:0}}],edges:[{id:crypto.randomUUID(),source:sourceId,target:nodeId,role:'instruction'}]}});
      return bridge.prepareImageGeneration({projectId,canvasId:record.document.id,nodeId});
    },defaultGenerationSettings());
    await page.getByRole('button',{name:'删除素材',exact:true}).click();
    await expect(page.locator('.statusbar')).toContainText('素材正在被生成任务使用');
    await expect(page.locator('.asset-card')).toHaveCount(1);
    await page.evaluate(run=>window.commerceCanvas.stopImageGeneration({projectId:run.projectId,runId:run.id}),pending);
    await page.getByRole('button',{name:'删除素材',exact:true}).click();
    await expect(page.locator('.asset-card')).toHaveCount(0);
  }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
