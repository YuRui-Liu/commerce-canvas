import { app, BrowserWindow, ipcMain, utilityProcess, protocol, dialog, safeStorage } from 'electron';
import { join, resolve, isAbsolute, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { RuntimeClient } from './runtimeClient';
import { CredentialStore } from './credentials';
import { validateSender } from './ipc';
import { parseRequest, requestSchemas, type AssetImportResult } from '../../../../packages/contracts/src/bridge';
import { assetScheme } from './assetProtocol';
import { assertNativeDialogAllowed } from './nativeDialogPolicy';
import { runGrsaiVerification } from './grsaiVerification';
const verification = process.argv.includes('--verify-grsai');
const nativeOpenDialog = dialog.showOpenDialog;
protocol.registerSchemesAsPrivileged([assetScheme]);
const isolated = process.env.COMMERCECANVAS_TEST_USER_DATA;
if (isolated) {
  const root = resolve(tmpdir());
  if (!isAbsolute(isolated) || !resolve(isolated).startsWith(`${root}/commercecanvas-e2e-`)) throw new Error('INVALID_TEST_DIRECTORY');
  app.setPath('userData', isolated);
}
let runtime: RuntimeClient;
let window: BrowserWindow | null = null;
let currentProject: string | null = null;
let closing: Promise<void> | undefined;
let quitting = false;
let quitRequested = false;
let flushReply: { id: string; resolve: (ok: boolean) => void } | undefined;
function reportError(title: string, message: string) {
  // Isolated tests must never open a native dialog or steal desktop focus.
  // Both arguments are fixed application copy / sanitized error codes only.
  if (isolated || verification) console.error(title, message);
  else dialog.showErrorBox(title, message);
}
async function flushRenderer() {
  if (!window || window.isDestroyed()) return;
  const id = randomUUID();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { flushReply = undefined; reject(Error('FLUSH_TIMEOUT')); }, 15000);
    flushReply = { id, resolve: ok => { clearTimeout(timeout); flushReply = undefined; ok ? resolve() : reject(Error('FLUSH_FAILED')); } };
    window!.webContents.send('commerce:flush-request', id);
  });
}
function closeSafely() {
  if (closing) return;
  closing = (async () => {
    try {
      await flushRenderer();
      if (quitRequested) {
        await runtime.request('shutdown');
        quitting = true;
      }
      window?.destroy();
      if (quitRequested) app.quit();
    } catch {
      quitRequested = false;
      reportError('未能安全关闭', '本地保存尚未完成、发生冲突或引擎无响应。窗口和草稿已保留，请处理画布保存提示后再次关闭。');
    } finally { closing = undefined; }
  })();
}
const rendererUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : pathToFileURL(join(__dirname, '../renderer/index.html')).href;
function createWindow() {
  window = new BrowserWindow({ show: !isolated, width: 1440, height: 960, minWidth: 1024, minHeight: 720, title: 'CommerceCanvas', backgroundColor: '#ffffff', webPreferences: { backgroundThrottling: !isolated, preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => { if (!quitting) { event.preventDefault(); closeSafely(); } });
  window.on('closed', () => { window = null; currentProject = null; });
  void window.loadURL(rendererUrl);
}
void app.whenReady().then(async () => {
  if ((isolated || verification) && process.platform === 'darwin') { app.dock?.hide(); app.setActivationPolicy('prohibited'); }
  if (verification) {
    const index = process.argv.indexOf('--verification-dir');
    const directory = index >= 0 ? process.argv[index + 1] : undefined;
    if (!directory || !isAbsolute(directory) || isolated) throw new Error('INVALID_VERIFICATION_DIRECTORY');
    const credentials = new CredentialStore(app.getPath('userData'), safeStorage);
    try { console.log(JSON.stringify(await runGrsaiVerification(directory, credentials.resolveGrsai()))); app.exit(0); }
    catch (error) { console.error(JSON.stringify({ status: 'failed', code: error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'VERIFICATION_FAILED' })); app.exit(1); }
    return;
  }
  const child = utilityProcess.fork(join(__dirname, 'utility.js'), [app.getPath('userData')], { serviceName: 'CommerceCanvas Runtime' });
  runtime = new RuntimeClient(child);
  const credentials = new CredentialStore(app.getPath('userData'), safeStorage);
  await runtime.request('setCredentialMetadata', { credentials: credentials.list() });
  currentProject = await runtime.request('getCurrentProject');
  ipcMain.on('commerce:flush-result', (event, result: unknown) => {
    if (!window) return;
    try { validateSender(event, window.webContents, rendererUrl); } catch { return; }
    if (typeof result !== 'object' || result === null) return;
    const reply = result as { id?: unknown; ok?: unknown };
    if (reply.id === flushReply?.id && typeof reply.ok === 'boolean') flushReply?.resolve(reply.ok);
  });
  ipcMain.handle('commerce:request', async (event, method: unknown, payload: unknown) => {
    if (!window) throw new Error('UNTRUSTED_SENDER');
    validateSender(event, window.webContents, rendererUrl);
    parseRequest(method, payload);
    if (method === 'storeCredential') {
      const p = requestSchemas.storeCredential.parse(payload);
      const metadata = credentials.store(p.service, p.secret);
      await runtime.request('setCredentialMetadata', { credentials: credentials.list() }); return metadata;
    }
    if (method === 'listCredentialMetadata') return credentials.list();
    if (method === 'removeCredential') { credentials.remove(requestSchemas.removeCredential.parse(payload).credentialId); await runtime.request('setCredentialMetadata', { credentials: credentials.list() }); return null; }
    if (method === 'getCurrentProject') return currentProject;
    if (method === 'setCurrentProject') {
      const { projectId } = requestSchemas.setCurrentProject.parse(payload);
      if (projectId && !await runtime.request('getProject', { projectId })) throw new Error('NOT_FOUND');
      await runtime.request('setCurrentProject', { projectId });
      currentProject = projectId; return currentProject;
    }
    if (method === 'importAssets' || method === 'importAssetsBatch') {
      const { projectId } = requestSchemas.importAssets.parse(payload);
      if (!await runtime.request('getProject', { projectId })) throw new Error('NOT_FOUND');
      assertNativeDialogAllowed(!!isolated, dialog.showOpenDialog, nativeOpenDialog);
      const selected = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (selected.canceled) return [];
      if (selected.filePaths.length > 100) throw new Error('TOO_MANY_FILES');
      const result:AssetImportResult[] = [];
      for (const file of selected.filePaths) {
        const name=basename(file).slice(0,200);
        try{
          if ((await stat(file)).size > 50 * 1024 * 1024){result.push({name,ok:false,error:'INVALID_IMAGE'});continue;}
          const imported=await runtime.request('importImages',{projectId,files:[{name,bytes:new Uint8Array(await readFile(file))}]}) as AssetImportResult[];
          result.push(...imported);
        }catch{result.push({name,ok:false,error:'IMPORT_FAILED'});}
      }
      return method==='importAssetsBatch'?result:result.flatMap(r=>r.ok?[r.version]:[]);
    }
    const result = await runtime.request(method as string, payload);
    if (method === 'deleteProject' && requestSchemas.deleteProject.parse(payload).projectId === currentProject) currentProject = null;
    return result;
  });
  protocol.handle('commerce-asset', async request => {
    const match = /^commerce-asset:\/\/asset\/([0-9a-f-]+)\/(original|thumbnail)$/.exec(request.url);
    if (!match) return new Response('Invalid asset URL', { status: 400 });
    if (!currentProject) return new Response('No project', { status: 403 });
    const projectId = currentProject;
    try {
      const result = await runtime.request('getAssetResponse', { projectId, versionId: match[1], variant: match[2] });
      if (currentProject !== projectId) return new Response('Project changed', { status: 403 });
      return new Response(new Uint8Array(result.bytes), { headers: { 'Content-Type': result.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'no-store' } });
    } catch { return new Response('Asset unavailable', { status: 404 }); }
  });
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
}).catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'INITIALIZATION_FAILED';
  console.error('CommerceCanvas startup:', code);
  reportError('CommerceCanvas 启动失败', `本地引擎暂时无法启动（${code}）。请退出后重新打开应用。`);
  app.exit(1);
});
app.on('before-quit', event => {
  if (quitting || !runtime) return;
  event.preventDefault(); quitRequested = true; closeSafely();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
