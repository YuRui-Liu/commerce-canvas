import { app, BrowserWindow, ipcMain, utilityProcess, protocol, dialog, safeStorage } from 'electron';
import { join, resolve, isAbsolute, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { RuntimeClient } from './runtimeClient';
import { CredentialStore } from './credentials';
import { validateSender } from './ipc';
import { parseRequest, requestSchemas } from '../../../../packages/contracts/src/bridge';
import { assetScheme } from './assetProtocol';
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
const rendererUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : pathToFileURL(join(__dirname, '../renderer/index.html')).href;
function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 720, title: 'CommerceCanvas', backgroundColor: '#ffffff', webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => { window = null; currentProject = null; });
  void window.loadURL(rendererUrl);
}
void app.whenReady().then(async () => {
  const child = utilityProcess.fork(join(__dirname, 'utility.js'), [app.getPath('userData')], { serviceName: 'CommerceCanvas Runtime' });
  runtime = new RuntimeClient(child);
  const credentials = new CredentialStore(app.getPath('userData'), safeStorage);
  await runtime.request('setCredentialMetadata', { credentials: credentials.list() });
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
      currentProject = projectId; return currentProject;
    }
    if (method === 'importAssets') {
      const { projectId } = requestSchemas.importAssets.parse(payload);
      if (!await runtime.request('getProject', { projectId })) throw new Error('NOT_FOUND');
      const selected = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (selected.canceled) return [];
      if (selected.filePaths.length > 100) throw new Error('TOO_MANY_FILES');
      const result = [];
      for (const file of selected.filePaths) {
        if ((await stat(file)).size > 50 * 1024 * 1024) throw new Error('INVALID_IMAGE');
        result.push(await runtime.request('importImageBytes', { projectId, bytes: new Uint8Array(await readFile(file)), name: basename(file).slice(0, 200) }));
      }
      return result;
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
  dialog.showErrorBox('CommerceCanvas 启动失败', `本地引擎暂时无法启动（${code}）。请退出后重新打开应用。`);
  app.exit(1);
});
let quitting = false;
app.on('before-quit', event => {
  if (quitting || !runtime) return;
  event.preventDefault(); quitting = true;
  void runtime.request('shutdown').catch(() => undefined).finally(() => app.quit());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
