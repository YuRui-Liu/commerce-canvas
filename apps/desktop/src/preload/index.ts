import { contextBridge, ipcRenderer } from 'electron';
import { parseRequest, requestSchemas, type DesktopBridge, type Method } from '../../../../packages/contracts/src/bridge';
const bridge = Object.fromEntries(Object.keys(requestSchemas).map(method => [method, (payload: unknown = {}) => {
  const parsed = parseRequest(method, payload);
  return ipcRenderer.invoke('commerce:request', method as Method, parsed);
}])) as unknown as DesktopBridge;
bridge.onFlushRequested = handler => {
  const listener = (_event: unknown, id: string) => {
    void Promise.resolve().then(handler).then(
      () => ipcRenderer.send('commerce:flush-result', { id, ok: true }),
      () => ipcRenderer.send('commerce:flush-result', { id, ok: false }),
    );
  };
  ipcRenderer.on('commerce:flush-request', listener);
  return () => ipcRenderer.removeListener('commerce:flush-request', listener);
};
contextBridge.exposeInMainWorld('commerceCanvas', Object.freeze(bridge));
