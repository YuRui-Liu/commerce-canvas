import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
test('typed bridge persists projects, assets and theme and isolates asset access', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commercecanvas-e2e-'));
  const launch = () => electron.launch({ ...(process.env.COMMERCECANVAS_EXECUTABLE ? { executablePath: process.env.COMMERCECANVAS_EXECUTABLE, args: [] } : { args: [resolve('apps/desktop/dist/main/index.js')] }), env: { ...process.env, COMMERCECANVAS_TEST_USER_DATA: root } });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    const image = [...await sharp({ create: { width: 3, height: 4, channels: 4, background: '#f00' } }).png().toBuffer()];
    const ids = await page.evaluate(async bytes => {
      const bridge = window.commerceCanvas;
      const project = await bridge.createProject({ name: 'Persistent project' });
      await bridge.setCurrentProject({ projectId: project.id });
      await bridge.saveText({ projectId: project.id, text: 'Product facts' });
      const asset = await bridge.importImageBytes({ projectId: project.id, bytes: new Uint8Array(bytes), name: 'Product.png' });
      await bridge.setTheme({ theme: 'editorial' });
      return { projectId: project.id, versionId: asset.id };
    }, image);
    const url = `commerce-asset://asset/${ids.versionId}/original`;
    expect(await page.evaluate(url => new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img.naturalWidth); img.onerror = () => resolve(0); img.src = url; document.body.append(img); }), url)).toBe(3);
    await page.evaluate(async () => { const p = await window.commerceCanvas.createProject({ name: 'Other' }); await window.commerceCanvas.setCurrentProject({ projectId: p.id }); });
    // Reload releases decoded Image resources; verify a new protocol request, not a DOM memory-cache hit.
    await page.reload();
    expect(await page.evaluate(url => new Promise(resolve => { const img = new Image(); img.onload = () => resolve('loaded'); img.onerror = () => resolve('denied'); img.src = url; }), url)).toBe('denied');
    await app.close(); app = await launch();
    const restored = await app.firstWindow();
    expect(await restored.evaluate(() => window.commerceCanvas.getTheme({}))).toBe('editorial');
    expect(await restored.evaluate(id => window.commerceCanvas.listAssets({ projectId: id }), ids.projectId)).toHaveLength(2);
    expect(await restored.evaluate(() => window.commerceCanvas.getCurrentProject({}))).toBeNull();
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
});
