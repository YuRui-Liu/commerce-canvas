import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('secure desktop displays capabilities verified inside Electron utility process', async () => {
  const packagedExecutable = process.env.COMMERCECANVAS_EXECUTABLE;
  const app = await electron.launch(packagedExecutable ? { executablePath: packagedExecutable, args: [] } : { args: [resolve('apps/desktop/dist/main/index.js')] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('本地引擎已就绪')).toBeVisible();
    const result = await page.evaluate(() => window.commerceCanvas.health());
    expect(result.sqlite).toMatchObject({ ok: true, value: 'commercecanvas' });
    expect(result.sharp).toMatchObject({ ok: true, width: 2, height: 2 });
    expect(result.processType).toBe('utility');
    expect(result.electron).toBeTruthy();
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    const preferences = await app.evaluate(({ BrowserWindow }) => (BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences());
    expect(preferences).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false });
    console.log('UTILITY_HEALTH', JSON.stringify(result));
    await page.screenshot({ path: 'apps/desktop/dist/foundation-desktop.png' });
    await page.getByRole('button', { name: '纸白莓红' }).click();
    await expect(page.getByRole('button', { name: '纸白莓红' })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'apps/desktop/dist/foundation-desktop-editorial.png' });
  } finally { await app.close(); }
});
