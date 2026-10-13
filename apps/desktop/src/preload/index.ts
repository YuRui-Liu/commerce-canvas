import { contextBridge, ipcRenderer } from 'electron';
import { parseRequest, requestSchemas, type DesktopBridge, type Method } from '../../../../packages/contracts/src/bridge';
const bridge = Object.fromEntries(Object.keys(requestSchemas).map(method => [method, (payload: unknown = {}) => {
  const parsed = parseRequest(method, payload);
  return ipcRenderer.invoke('commerce:request', method as Method, parsed);
}])) as unknown as DesktopBridge;
let flushHandler: (() => Promise<void>) | undefined;
let pendingFlush: string | undefined;
function deliverFlush(id: string) {
  const handler = flushHandler;
  if (!handler) { pendingFlush = id; return; }
  let result: Promise<void>;
  try { result = handler(); }
  catch { ipcRenderer.send('commerce:flush-result', { id, ok: false }); return; }
  void Promise.resolve(result).then(
    () => ipcRenderer.send('commerce:flush-result', { id, ok: flushHandler === handler }),
    () => ipcRenderer.send('commerce:flush-result', { id, ok: false }),
  );
}
// Subscribe during preload, before React starts. Immediate startup-close must not
// lose its request while the workspace is still registering its flush callback.
ipcRenderer.on('commerce:flush-request', (_event, id: unknown) => {
  if (typeof id === 'string' && id.length <= 200) deliverFlush(id);
});
bridge.onFlushRequested = handler => {
  flushHandler = handler;
  if (pendingFlush) { const id = pendingFlush; pendingFlush = undefined; deliverFlush(id); }
  return () => { if (flushHandler === handler) flushHandler = undefined; };
};
contextBridge.exposeInMainWorld('commerceCanvas', Object.freeze(bridge));
