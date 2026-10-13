import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('C4 restores multiple canvases, graph, drafts and viewport after close flush', async () => {
  test.setTimeout(60000);
  const root = mkdtempSync(join(tmpdir(), 'commercecanvas-e2e-c4-'));
  const launch = () => electron.launch({ ...(process.env.COMMERCECANVAS_EXECUTABLE ? { executablePath: process.env.COMMERCECANVAS_EXECUTABLE, args: [] } : { args: [resolve('apps/desktop/dist/main/index.js')] }), env: { ...process.env, COMMERCECANVAS_TEST_USER_DATA: root } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const seeded = await page.evaluate(async () => {
      const b = window.commerceCanvas;
      const a = await b.createProject({ name: 'C4 恢复验证' });
      const other = await b.createProject({ name: '隔离项目' });
      const text = await b.saveText({ projectId: a.id, text: '原始商品描述' });
      const c = await b.createCanvas({ projectId: a.id, name: '持久创作画布' });
      const saved = await b.saveCanvas({ projectId: a.id, expectedRevision: 1, document: {
        ...c.document,
        nodes: [
          { id: 'group', kind: 'group', position: { x: 40, y: 40 }, width: 600, height: 400 },
          { id: 'text', kind: 'text', parentId: 'group', assetVersionId: text.id, position: { x: 20, y: 50 } },
          { id: 'agent', kind: 'agent', parentId: 'group', stale: true, position: { x: 310, y: 50 } },
        ], edges: [{ id: 'edge', source: 'text', target: 'agent', role: 'instruction' }], viewport: { x: 25, y: 35, zoom: 0.75 },
      }, panel: { ...c.panel, selectedIds: ['text'], inspectorDrafts: { text: '恢复的节点草稿' }, chatDraft: '恢复的需求草稿' } });
      await b.selectCanvas({ projectId: a.id, canvasId: c.document.id });
      await b.setCurrentProject({ projectId: a.id });
      return { projectId: a.id, other: other.id, canvasId: c.document.id, document: saved.document };
    });
    await page.reload();
    await expect(page.getByLabel('节点文本草稿')).toHaveValue('恢复的节点草稿');
    await expect(page.locator('.react-flow__node-group')).toHaveCount(1);
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    const viewport = await page.locator('.react-flow__viewport').evaluate(el => (el as HTMLElement).style.transform);
    await page.getByRole('button', { name: '商品资料', exact: true }).click();
    await page.locator('.react-flow__node-text').click({ position: { x: 60, y: 20 } });
    await expect(page.getByLabel('节点文本草稿')).toHaveValue('恢复的节点草稿');
    await page.getByRole('button', { name: '引用所选写需求' }).click();
    await page.getByLabel('创作需求', { exact: true }).fill('使用当前文本版本');
    await page.getByRole('button', { name: '保存需求', exact: true }).click();
    await expect(page.getByLabel('已保存需求')).toContainText('1 个输入快照');
    await page.getByLabel('创作需求', { exact: true }).fill('未发送的当前画布草稿');
    await page.getByRole('button', { name: '新建画布' }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    await page.getByRole('tab', { name: '对话', exact: true }).click();
    await expect(page.getByLabel('创作需求', { exact: true })).toHaveValue('');
    await page.getByLabel('创作需求', { exact: true }).fill('第二画布独立草稿');
    const second = await page.getByLabel('当前画布', { exact: true }).inputValue();
    await page.getByLabel('当前画布', { exact: true }).selectOption(seeded.canvasId);
    await expect(page.getByLabel('创作需求', { exact: true })).toHaveValue('未发送的当前画布草稿');
    await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', expect.stringContaining(viewport));
    await page.getByLabel('商品项目', { exact: true }).selectOption(seeded.other);
    await page.getByRole('tab', { name: '对话', exact: true }).click();
    await expect(page.getByLabel('创作需求', { exact: true })).toHaveValue('');
    await page.getByLabel('商品项目', { exact: true }).selectOption(seeded.projectId);
    await expect(page.getByLabel('创作需求', { exact: true })).toHaveValue('未发送的当前画布草稿');
    // Immediately close before the debounce fires. Main must await the renderer's DB ack.
    await page.getByLabel('创作需求', { exact: true }).fill('关闭握手必须保存这条草稿');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(seeded.canvasId);
    await expect(page.getByLabel('创作需求', { exact: true })).toHaveValue('关闭握手必须保存这条草稿');
    const restored = await page.evaluate(({ projectId, canvasId }) => window.commerceCanvas.loadCanvas({ projectId, canvasId }), seeded);
    expect(restored.document.nodes).toEqual(seeded.document.nodes);
    expect(restored.document.edges).toEqual(seeded.document.edges);
    expect(restored.document.viewport).toEqual(seeded.document.viewport);
    expect(restored.panel.inspectorDrafts.text).toBe('恢复的节点草稿');
    expect(restored.panel.messages[0].selectedNodes[0].assetVersionId).toBe(seeded.document.nodes[1].assetVersionId);
    expect(restored.panel.messages[0].role).toBe('user');
    await page.screenshot({ path: 'apps/desktop/dist/c4-restored.png' });
    await page.getByLabel('当前画布', { exact: true }).selectOption(second);
    await expect(page.getByLabel('创作需求', { exact: true })).toHaveValue('第二画布独立草稿');
  } catch (error) {
    if (app.windows()[0]) console.log(await app.windows()[0].locator('body').innerText().catch(() => 'no body'));
    app.process().kill('SIGKILL'); throw error;
  } finally { if (app.process().exitCode === null && !app.process().killed) await app.close(); rmSync(root, { recursive: true, force: true }); }
});

test('C4 conflict keeps draft, blocks close and saves a separate canvas without overwriting', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commercecanvas-e2e-c4-conflict-'));
  const app = await electron.launch({ ...(process.env.COMMERCECANVAS_EXECUTABLE ? { executablePath: process.env.COMMERCECANVAS_EXECUTABLE, args: [] } : { args: [resolve('apps/desktop/dist/main/index.js')] }), env: { ...process.env, COMMERCECANVAS_TEST_USER_DATA: root } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '创建项目', exact: true }).first().click();
    await page.getByLabel('项目名称').fill('冲突保留');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByLabel('当前画布', { exact: true })).toBeVisible();
    const remote = await page.evaluate(async () => {
      const b = window.commerceCanvas, projectId = (await b.getCurrentProject())!;
      const canvasId = (await b.getSelectedCanvas({ projectId }))!;
      const c = await b.loadCanvas({ projectId, canvasId });
      return b.saveCanvas({ projectId, document: { ...c.document, viewport: { x: 999, y: 20, zoom: 1 } }, panel: c.panel, expectedRevision: c.document.revision });
    });
    await page.getByRole('button', { name: '添加 Agent', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('修订冲突');
    await app.evaluate(() => {
      const original = console.error;
      console.error = (...args: unknown[]) => { (globalThis as any).__closeError = args.join(' '); original(...args); };
    });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect.poll(() => app.evaluate(() => (globalThis as any).__closeError)).toContain('草稿已保留');
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(await page.evaluate(c => window.commerceCanvas.loadCanvas({ projectId: c.document.projectId!, canvasId: c.document.id }), remote)).toEqual(remote);
    await page.getByRole('button', { name: '另存画布副本' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.react-flow__node-agent')).toHaveCount(1);
    await expect(page.getByLabel('当前画布', { exact: true })).not.toHaveValue(remote.document.id);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
});
