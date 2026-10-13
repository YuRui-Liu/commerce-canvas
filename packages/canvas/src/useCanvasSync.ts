import { useCallback, useRef, useState } from 'react';
import type { CanvasRecord, CanvasDocument, PanelState, CanvasSummary } from '../../contracts/src/canvas';
import type { DesktopBridge } from '../../contracts/src/bridge';
import { SaveCoordinator } from './saveCoordinator';

export function useCanvasSync(bridge: DesktopBridge) {
  const [record, setRecord] = useState<CanvasRecord>();
  const [list, setList] = useState<CanvasSummary[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [status, setStatus] = useState('');
  const [savedMessages, setSavedMessages] = useState<PanelState['messages']>([]);
  const queue = useRef<SaveCoordinator<CanvasRecord> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadEpoch = useRef(0);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    await queue.current?.flush();
  }, []);
  const retry = useCallback(async () => { await queue.current?.retry(); }, []);
  const install = useCallback((next: CanvasRecord) => {
    const coordinator = new SaveCoordinator(next, next.document.revision, async (snapshot, revision) => {
      const saved = await bridge.saveCanvas({ projectId: snapshot.document.projectId!, document: snapshot.document, panel: snapshot.panel, expectedRevision: revision });
      if (queue.current === coordinator) setSavedMessages(saved.panel.messages);
      return saved.document.revision;
    }, () => {
      if (queue.current !== coordinator) return;
      setStatus(coordinator.error ? '画布保存失败：草稿已保留，请重新载入或另存副本。' : coordinator.dirty ? '画布有未保存修改' : '画布已保存');
    });
    queue.current = coordinator;
    setRecord(next); setSavedMessages(next.panel.messages); setEpoch(value => value + 1); setStatus('画布已保存');
  }, [bridge]);
  const loadProject = useCallback(async (projectId: string, canvasId?: string) => {
    await flush();
    const ticket = ++loadEpoch.current;
    let items = await bridge.listCanvases({ projectId });
    const selected = canvasId ?? await bridge.getSelectedCanvas({ projectId });
    const next = selected && items.some(c => c.id === selected)
      ? await bridge.loadCanvas({ projectId, canvasId: selected })
      : items.length ? await bridge.loadCanvas({ projectId, canvasId: items[0].id }) : await bridge.createCanvas({ projectId, name: '画布 1' });
    if (ticket !== loadEpoch.current) return;
    if (!items.length) items = await bridge.listCanvases({ projectId });
    await bridge.selectCanvas({ projectId, canvasId: next.document.id });
    setList(items); install(next);
  }, [bridge, flush, install]);
  const edit = useCallback((patch: { document?: CanvasDocument; panel?: PanelState }) => {
    const coordinator = queue.current;
    if (!coordinator) return;
    const next = { ...coordinator.value, ...patch };
    coordinator.edit(next); setRecord(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void coordinator.flush().catch(() => undefined); }, 400);
  }, []);
  const editPanel = useCallback((update: (panel: PanelState) => PanelState) => {
    const panel = queue.current?.value.panel;
    if (!panel) return;
    const next = update(panel);
    if (JSON.stringify(next) !== JSON.stringify(panel)) edit({ panel: next });
  }, [edit]);
  const reload = useCallback(async () => {
    const current = queue.current?.value;
    if (!current) return;
    const next = await bridge.loadCanvas({ projectId: current.document.projectId!, canvasId: current.document.id });
    clearTimeout(timer.current); install(next);
  }, [bridge, install]);
  const copy = useCallback(async () => {
    const current = queue.current?.value;
    if (!current) return;
    clearTimeout(timer.current);
    const projectId = current.document.projectId!;
    const created = await bridge.createCanvas({ projectId, name: `${current.name.slice(0, 180)} · 草稿副本` });
    const saved = await bridge.saveCanvas({ projectId, document: { ...current.document, id: created.document.id }, panel: current.panel, expectedRevision: 1 });
    await bridge.selectCanvas({ projectId, canvasId: saved.document.id });
    setList(await bridge.listCanvases({ projectId })); install(saved);
  }, [bridge, install]);
  const create = useCallback(async (projectId: string) => {
    await flush();
    const created = await bridge.createCanvas({ projectId, name: `画布 ${list.length + 1}` });
    await loadProject(projectId, created.document.id);
  }, [bridge, flush, list.length, loadProject]);
  return { record, list, epoch, status, savedMessages, failed: !!queue.current?.error, conflict: String(queue.current?.error).includes('REVISION_CONFLICT'), edit, editPanel, flush, retry, loadProject, reload, copy, create };
}
