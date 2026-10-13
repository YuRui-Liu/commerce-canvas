import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let userData: string;
test.beforeEach(() => { userData = mkdtempSync(join(tmpdir(), 'commercecanvas-e2e-')); });
test.afterEach(() => { rmSync(userData, { recursive: true, force: true }); });

test('secure desktop displays capabilities verified inside Electron utility process', async () => {
  const packagedExecutable = process.env.COMMERCECANVAS_EXECUTABLE;
  const app = await electron.launch({ ...(packagedExecutable ? { executablePath: packagedExecutable, args: [] } : { args: [resolve('apps/desktop/dist/main/index.js')] }), env: { ...process.env, COMMERCECANVAS_TEST_USER_DATA: userData } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByText('诊断', { exact: true }).click();
    await expect(page.getByText('本地引擎已就绪')).toBeVisible();
    const result = await page.evaluate(() => window.commerceCanvas.health());
    expect(result.sqlite).toMatchObject({ ok: true, value: 'commercecanvas' });
    expect(result.sharp).toMatchObject({ ok: true, width: 2, height: 2 });
    expect(result.processType).toBe('utility');
    expect(result.electron).toBeTruthy();
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    const preferences = await app.evaluate(({ BrowserWindow }) => (BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences());
    expect(preferences).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.webContents.getBackgroundThrottling()))).toEqual([false]);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ visible: window.isVisible(), focused: window.isFocused() })))).toEqual([{ visible: false, focused: false }]);
    const pickerError = await page.evaluate(async () => {
      const project = await window.commerceCanvas.createProject({ name: '隐藏选择框验证' });
      try { await window.commerceCanvas.importAssetsBatch({ projectId: project.id }); return 'UNEXPECTED_SUCCESS'; }
      catch (error) { return String(error); }
    });
    expect(pickerError).toContain('NATIVE_DIALOG_DISABLED_IN_TEST');
    console.log('UTILITY_HEALTH', JSON.stringify(result));
    await page.screenshot({ path: 'apps/desktop/dist/foundation-desktop.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '纸白莓红' }).click();
    await expect(page.getByRole('button', { name: '纸白莓红' })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'apps/desktop/dist/foundation-desktop-editorial.png' });
  } finally { await app.close(); }
});

test('packaged app ignores an injected development renderer URL', async () => {
  const executablePath = process.env.COMMERCECANVAS_EXECUTABLE;
  test.skip(!executablePath, 'Requires the packaged application');
  const app = await electron.launch({ executablePath, args: [], env: { ...process.env, COMMERCECANVAS_TEST_USER_DATA: userData, ELECTRON_RENDERER_URL: 'data:text/html,<h1>Injected development page</h1>' } });
  try {
    const page = await app.firstWindow();
    await expect(page).toHaveURL(/^file:.*\/renderer\/index\.html$/);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByText('诊断', { exact: true }).click();
    await expect(page.getByText('本地引擎已就绪')).toBeVisible();
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
  } finally { await app.close(); }
});
