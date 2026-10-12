import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';
import { join } from 'node:path';
import type { RuntimeHealth } from '../../../../packages/runtime/src/index';

let health: Promise<RuntimeHealth>;
function startHealthProbe(): Promise<RuntimeHealth> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(join(__dirname, 'utility.js'), [], { serviceName: 'CommerceCanvas Runtime' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Runtime check timed out')); }, 15_000);
    child.once('message', (message: RuntimeHealth) => { clearTimeout(timer); resolve(message); child.kill(); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Runtime process exited (${code})`)); });
  });
}
function createWindow() {
  const window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 720, title: 'CommerceCanvas', backgroundColor: '#ffffff', webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
}
void app.whenReady().then(() => {
  health = startHealthProbe();
  void health.catch(() => undefined);
  ipcMain.handle('runtime:health', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted health request');
    return health;
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
