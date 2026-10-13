import { contextBridge, ipcRenderer } from 'electron';
import { parseRequest, requestSchemas, type DesktopBridge, type Method } from '../../../../packages/contracts/src/bridge';
const bridge = Object.fromEntries(Object.keys(requestSchemas).map(method => [method, (payload: unknown = {}) => {
  const parsed = parseRequest(method, payload);
  return ipcRenderer.invoke('commerce:request', method as Method, parsed);
}])) as DesktopBridge;
contextBridge.exposeInMainWorld('commerceCanvas', Object.freeze(bridge));
