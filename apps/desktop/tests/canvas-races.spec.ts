import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

async function launch() {
  const root = mkdtempSync(join(tmpdir(), 'commercecanvas-e2e-races-'));
  const app = await electron.launch({ ...(process.env.COMMERCECANVAS_EXECUTABLE ? { executablePath: process.env.COMMERCECANVAS_EXECUTABLE, args: [] } : { args: [resolve('apps/desktop/dist/main/index.js')] }), env: { ...process.env, COMMERCECANVAS_TEST_USER_DATA: root } });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '创建项目', exact: true }).first().click();
  await page.getByLabel('项目名称').fill('竞态 A');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('当前画布', { exact: true })).toBeVisible();
  return { root, app, page };
}
async function gate(app: ElectronApplication, method: string, after = false) {
  await app.evaluate(({ ipcMain }, { method, after }) => {
    const handlers = (ipcMain as any)._invokeHandlers;
    const original = handlers.get('commerce:request');
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    (globalThis as any).__race = { calls: 0, release, hit: false };
    handlers.set('commerce:request', async (...args: any[]) => {
      if (args[1] !== method) return original(...args);
      const state = (globalThis as any).__race; state.calls++; state.hit = true;
      if (after) { const result = await original(...args); await waiting; return result; }
      await waiting; return original(...args);
    });
  }, { method, after });
}
async function release(app: ElectronApplication) { await app.evaluate(() => (globalThis as any).__race.release()); }

test('C4 freezes inspector drafts during delayed copy, including direct input handlers', async () => {
  const { root, app, page } = await launch();
  try {
    await page.locator('.graph-workspace').evaluate(el => { const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'original'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true })); });
    await page.locator('.react-flow__node-text header').click();
    await page.getByLabel('节点文本草稿').fill('copy this draft');
    await expect(page.locator('.statusbar')).toContainText('画布已保存');
    await page.evaluate(async () => {
      const b = window.commerceCanvas, projectId = (await b.getCurrentProject())!, canvasId = (await b.getSelectedCanvas({ projectId }))!;
      const c = await b.loadCanvas({ projectId, canvasId });
      await b.saveCanvas({ projectId, document: c.document, panel: c.panel, expectedRevision: c.document.revision });
    });
    await page.getByLabel('节点文本草稿').fill('retained draft');
    await page.getByLabel('节点文本草稿').evaluate(el => {
      const key = Object.keys(el).find(key => key.startsWith('__reactProps'))!;
      (window as any).__oldDraftHandler = (el as any)[key].onChange;
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await gate(app, 'createCanvas');
    await page.getByRole('button', { name: '另存画布副本' }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).__race.hit)).toBe(true);
    await expect(page.getByLabel('节点文本草稿')).toBeDisabled();
    await page.evaluate(() => (window as any).__oldDraftHandler({ target: { value: 'must reject while copying' } }));
    await release(app);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('节点文本草稿')).toHaveValue('retained draft');
  } catch (error) { await release(app).catch(() => {}); app.process().kill('SIGKILL'); throw error; }
  finally { if (!app.process().killed) await app.close(); rmSync(root, { recursive: true, force: true }); }
});

test('C4 close waits for an ongoing product save and never resubmits its old revision', async () => {
  const { root, app, page } = await launch();
  try {
    await page.getByLabel('商品名称', { exact: true }).fill('Saved once');
    await gate(app, 'updateProject', true);
    await page.getByRole('button', { name: '保存资料', exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).__race.hit)).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await release(app);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
    expect(await app.evaluate(() => (globalThis as any).__race.calls)).toBe(1);
  } catch (error) { await release(app).catch(() => {}); app.process().kill('SIGKILL'); throw error; }
  finally { if (!app.process().killed) await app.close(); rmSync(root, { recursive: true, force: true }); }
});

test('C4 failed target canvas preparation leaves the current project and drafts usable', async () => {
  const { root, app, page } = await launch();
  try {
    const png = [...await sharp({ create: { width: 3, height: 4, channels: 4, background: '#99aaff' } }).png().toBuffer()];
    const ids = await page.evaluate(async bytes => {
      const b = window.commerceCanvas, a = (await b.getCurrentProject())!;
      const other = await b.createProject({ name: '竞态 B' });
      await b.createCanvas({ projectId: other.id, name: 'B canvas' });
      const asset = await b.importImageBytes({ projectId: a, name: 'A.png', bytes: new Uint8Array(bytes) });
      return { a, b: other.id, versionId: asset.id };
    }, png);
    await page.reload(); await expect(page.getByLabel('商品名称', { exact: true })).toBeEnabled();
    for (const method of ['listCanvases', 'loadCanvas']) {
      await app.evaluate(({ ipcMain }, { method, target }) => {
        const handlers = (ipcMain as any)._invokeHandlers, original = handlers.get('commerce:request');
        let fail = true;
        handlers.set('commerce:request', (...args: any[]) => {
          if (fail && args[1] === method && args[2].projectId === target) { fail = false; throw Error('INJECTED_LOAD_FAILURE'); }
          return original(...args);
        });
      }, { method, target: ids.b });
      await page.getByLabel('商品项目', { exact: true }).selectOption(ids.b);
      await expect(page.getByRole('status')).toContainText('操作失败');
      expect(await page.evaluate(() => window.commerceCanvas.getCurrentProject())).toBe(ids.a);
      await expect(page.getByLabel('商品项目', { exact: true })).toHaveValue(ids.a);
      expect(await page.evaluate(versionId => new Promise(resolve => {
        const image = new Image(); image.onload = () => resolve(image.naturalWidth); image.onerror = () => resolve(0);
        image.src = `commerce-asset://asset/${versionId}/original`;
      }), ids.versionId)).toBe(3);
      await page.getByLabel('商品名称', { exact: true }).fill(`A survives ${method}`);
      await page.getByRole('button', { name: '保存资料', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('已保存');
      await page.getByLabel('商品项目', { exact: true }).selectOption(ids.b);
      await expect(page.getByLabel('商品项目', { exact: true })).toHaveValue(ids.b);
      await page.getByLabel('商品项目', { exact: true }).selectOption(ids.a);
      await expect(page.getByLabel('商品名称', { exact: true })).toHaveValue(`A survives ${method}`);
    }
  } catch (error) { app.process().kill('SIGKILL'); throw error; }
  finally { if (!app.process().killed) await app.close(); rmSync(root, { recursive: true, force: true }); }
});

test('C4 closing freezes existing inspector handlers while product persistence is pending', async () => {
  const { root, app, page } = await launch();
  try {
    await page.getByLabel('商品名称', { exact: true }).fill('close-time product');
    await page.locator('.graph-workspace').evaluate(el => { const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'source'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true })); });
    await page.locator('.react-flow__node-text header').click();
    await page.getByLabel('节点文本草稿').fill('before closing');
    await page.getByLabel('节点文本草稿').evaluate(el => {
      const key = Object.keys(el).find(key => key.startsWith('__reactProps'))!;
      (window as any).__oldDraftHandler = (el as any)[key].onChange;
    });
    await gate(app, 'updateProject');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect.poll(() => app.evaluate(() => (globalThis as any).__race.hit)).toBe(true);
    await expect(page.getByLabel('节点文本草稿')).toBeDisabled();
    await page.evaluate(() => (window as any).__oldDraftHandler({ target: { value: 'late unaccepted input' } }));
    await expect(page.getByLabel('节点文本草稿')).toHaveValue('before closing');
    const panel = await page.evaluate(async () => {
      const b = window.commerceCanvas, projectId = (await b.getCurrentProject())!, canvasId = (await b.getSelectedCanvas({ projectId }))!;
      return (await b.loadCanvas({ projectId, canvasId })).panel;
    });
    expect(Object.values(panel.inspectorDrafts)).toEqual(['before closing']);
    await release(app);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
  } catch (error) { await release(app).catch(() => {}); app.process().kill('SIGKILL'); throw error; }
  finally { if (!app.process().killed) await app.close(); rmSync(root, { recursive: true, force: true }); }
});
