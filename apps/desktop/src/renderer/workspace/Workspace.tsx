import { useEffect, useRef, useState } from 'react';
import type { AssetVersion, Project } from '../../../../../packages/contracts/src/domain';
import { ProductUpdateSchema } from '../../../../../packages/contracts/src/domain';
import { Button } from '../../../../../packages/ui/src/Button';
import { Dialog } from '../../../../../packages/ui/src/Dialog';
import { useTheme } from '../../../../../packages/ui/src/theme/ThemeProvider';
import { ProjectSwitcher } from './ProjectSwitcher';
import { Icon, LeftRail } from './LeftRail';
import { RightPanel, toUpdate, type Draft } from './RightPanel';
import { SettingsPanel, ThemeChoices } from './SettingsPanel';
import { CanvasRegion } from './CanvasRegion';
import type { CanvasHandle } from '../../../../../packages/canvas/src/Canvas';
import './workspace.css';
const bridge = window.commerceCanvas;
export function Workspace() {
  const canvas=useRef<CanvasHandle>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [assets, setAssets] = useState<AssetVersion[]>([]);
  const [busy, setBusy] = useState(true);
  const lock = useRef(true);
  const [status, setStatus] = useState('正在载入工作区');
  const [conflict, setConflict] = useState(false);
  const [library, setLibrary] = useState(() => innerWidth >= 1280);
  const [right, setRight] = useState(true);
  const [modal, setModal] = useState<'create' | 'rename' | 'text' | 'settings' | null>(null);
  const [value, setValue] = useState('');
  const [modalError, setModalError] = useState('');
  const [conversations, setConversations] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<AssetVersion | null>(null);
  const { error: themeError } = useTheme();
  const refresh = async () => setProjects(await bridge.listProjects());
  async function load(id: string) {
    // Release decoded images before changing the main process asset-access context.
    setAssets([]);
    setView(null);
    const data = await bridge.getProject({ projectId: id });
    if (!data)
      throw Error('NOT_FOUND');
    await bridge.setCurrentProject({ projectId: id });
    setProject(data.project);
    setProjects(list => list.map(p => p.id === id ? data.project : p));
    setDraft({
      facts: { ...data.project.facts },
      skus: data.skus.map(({ projectId: _, ...s }) => s),
      brand: data.brand ? { name: data.brand.name, description: data.brand.description, guidelines: data.brand.guidelines } : null,
    });
    setDirty(false);
    setConflict(false);
    setAssets(await bridge.listAssets({ projectId: id }));
    setStatus('已保存');
  }
  useEffect(() => {
    void (async () => {
      try {
        setProjects(await bridge.listProjects());
        const current = await bridge.getCurrentProject();
        if (current)
          await load(current);
        else
          setStatus('本地工作区');
      }
      catch {
        setStatus('读取失败，请重新打开应用。');
      }
      finally {
        lock.current = false;
        setBusy(false);
      }
    })();
  }, []);
  async function save(): Promise<boolean> {
    if (!project || !draft || !dirty)
      return true;
    if (conflict)
      return false;
    const update = toUpdate(draft);
    if ((draft.brand?.description.trim() && !draft.brand.name.trim()) || !ProductUpdateSchema.safeParse(update).success) {
      setStatus('保存失败：请填写品牌名称、SKU 编码与名称，并检查资料长度。');
      return false;
    }
    setStatus('保存中');
    try {
      const result = await bridge.updateProject({ projectId: project.id, expectedRevision: project.revision, update });
      setProject(result);
      setProjects(list => list.map(p => p.id === result.id ? result : p));
      setDirty(false);
      setStatus('已保存');
      return true;
    }
    catch (e) {
      if (String(e).includes('REVISION_CONFLICT')) {
        setConflict(true);
        setStatus('内容已在另一处更新');
      }
      else
        setStatus('保存失败，请重试。');
      return false;
    }
  }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } catch {
      setStatus('操作失败，请重试。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const switchProject = (id: string) => void perform(async () => {
    if (await save()) await load(id);
  });
  function open(kind: typeof modal) {
    if (lock.current && kind !== 'settings') return;
    setModalError('');
    setValue(kind === 'rename' ? project?.name ?? '' : '');
    setModal(kind);
  }
  async function submit() {
    await perform(async () => {
      if (!value.trim()) {
        setModalError('请输入内容。');
        return;
      }
      try {
        if (modal === 'create') {
          if (!await save()) {
            setModalError('请先处理当前项目的保存问题，再创建新项目。');
            return;
          }
          const created = await bridge.createProject({ name: value.trim() });
          await refresh();
          await load(created.id);
        }
        if (modal === 'rename' && project) {
          const expectedRevision = project.revision + (dirty ? 1 : 0);
          if (!await save()) {
            setModalError('请先处理当前项目的保存问题。');
            return;
          }
          const renamed = await bridge.renameProject({ projectId: project.id, expectedRevision, name: value.trim() });
          setProject(renamed);
          await refresh();
          setStatus('已保存');
        }
        if (modal === 'text' && project) {
          await bridge.saveText({ projectId: project.id, text: value });
          setAssets(await bridge.listAssets({ projectId: project.id }));
          setStatus('文本已添加到素材库');
        }
        setModal(null);
      }
      catch (e) {
        if (String(e).includes('REVISION_CONFLICT')) {
          setConflict(true);
          setStatus('内容已在另一处更新');
          setModalError('内容已在另一处更新，请关闭弹窗后处理。');
        }
        else
          setModalError('操作失败，请检查输入后重试。');
      }
    });
  }
  async function importImages() {
    if (!project) {
      open('create');
      return;
    }
    await perform(async () => {
      try {
        const imported = await bridge.importAssets({ projectId: project.id });
        setStatus(imported.length ? `已导入 ${imported.length} 张图片` : '已取消导入');
      } catch {
        setStatus('部分图片导入失败，请检查文件格式或大小；已导入素材已保留。');
      } finally {
        setAssets(await bridge.listAssets({ projectId: project.id }));
        setLibrary(true);
      }
    });
  }
  async function saveCopy() {
    await perform(async () => {
      if (!draft || !project)
        return;
      const update = toUpdate(draft);
      if ((draft.brand?.description.trim() && !draft.brand.name.trim()) || !ProductUpdateSchema.safeParse(update).success) {
        setStatus('另存失败：请检查商品资料。');
        return;
      }
      // SKU ids are globally unique, while their codes are scoped to each project.
      update.skus = update.skus?.map(sku => ({ ...sku, id: crypto.randomUUID() }));
      const copy = await bridge.createProject({ name: `${project.name.slice(0, 190)} · 草稿副本` });
      try {
        await bridge.updateProject({ projectId: copy.id, expectedRevision: copy.revision, update });
      }
      catch (error) {
        // Remove only our still-empty revision; never delete a populated or externally updated copy.
        await bridge.deleteProject({ projectId: copy.id, expectedRevision: copy.revision }).catch(() => undefined);
        throw error;
      }
      await refresh();
      await load(copy.id);
      setStatus('资料已另存为新项目；素材仍在原项目。');
    });
  }
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">C</span>
        <strong>CommerceCanvas</strong>
      </div>
      <div className="top-divider" />
      <ProjectSwitcher projects={projects} current={project} disabled={busy} onSelect={switchProject} onCreate={() => open('create')} onRename={() => open('rename')} />
      <div className="top-spacer" />
      <ThemeChoices />
      <Button variant="quiet" onClick={() => open('settings')}>设置</Button>
    </header>
    <div className={`workspace-grid ${library ? '' : 'library-closed'} ${right ? '' : 'right-closed'}`}>
      <LeftRail library={library} toggleLibrary={() => setLibrary(!library)} openSettings={() => open('settings')} onNotice={setNotice} />
      {library && <aside className="asset-panel">
        <div className="panel-heading">
          <h2>素材库</h2>
          <small>{assets.length} 项</small>
        </div>
        <div className="asset-actions">
          <Button onClick={() => void importImages()} disabled={busy}>
            <Icon kind="upload" />上传图片</Button>
          <Button onClick={() => project ? open('text') : open('create')} disabled={busy}>添加文本</Button>
        </div>
        <div className="asset-list">{assets.length === 0 ? <div className="library-empty">
          <Icon kind="assets" />
          <h3>为创作备好素材</h3>
          <p>商品图片、参考图和文本，<br />都会保存在这里。</p>
          <small>PNG、JPG、WebP</small>
        </div> : assets.map((a, i) => <div key={`${project?.id}-${a.id}`}><button className="asset-card" onClick={() => setView(a)}>{a.kind === 'image' ? <img src={`commerce-asset://asset/${a.id}/thumbnail`} alt={`素材图片 ${i + 1}`} /> : <div className="text-preview">{a.text}</div>}<span>{a.kind === 'image' ? `图片 ${i + 1}` : `文本 ${i + 1}`}</span>
          <small>{a.kind === 'image' ? `${a.width} × ${a.height}` : '文本素材'}</small>
        </button><Button onClick={()=>canvas.current?.addAssets([a])} disabled={busy}>添加到画布</Button></div>)}</div>
        <div className="library-foot">素材保存在本机</div>
      </aside>}
      <CanvasRegion ref={canvas} project={project} assets={assets} onView={setView} right={right} busy={busy} toggleRight={() => setRight(!right)} upload={() => void importImages()} addText={() => open('text')} create={() => open('create')} />
      {right && <RightPanel draft={draft} change={d => { setDraft(d); setDirty(true); setStatus('有未保存修改'); }} disabled={busy} save={() => void perform(async () => { await save(); })} conversation={conversations[project?.id ?? 'none'] ?? ''} setConversation={text => setConversations(c => ({ ...c, [project?.id ?? 'none']: text }))} settings={() => open('settings')} />}
    </div>
    <footer className="statusbar">
      <span role="status">{themeError || status}{project && !conflict ? ` · 修订 ${project.revision}` : ''}</span>
      <span>本地优先 · 自由创作</span>
    </footer>
    {conflict && <div className="conflict-banner" role="alert">
      <strong>内容已在另一处更新</strong>
      <span>重新载入会舍弃当前资料草稿；另存会创建资料副本。</span>
      <Button disabled={busy} onClick={() => void perform(async () => {
        if (project)
          await load(project.id);
      })}>重新载入</Button>
      <Button disabled={busy} onClick={() => void saveCopy()}>另存资料副本</Button>
    </div>}
    {notice && <Dialog title="功能说明" onClose={() => setNotice('')}>
      <p>{notice}</p>
      <Button onClick={() => setNotice('')}>知道了</Button>
    </Dialog>}
    {modal === 'settings' && <SettingsPanel onClose={() => setModal(null)} />}
    {modal && modal !== 'settings' && <Dialog title={modal === 'create' ? '创建商品项目' : modal === 'rename' ? '重命名项目' : '添加文本素材'} onClose={() => {
      if (!busy)
        setModal(null);
    }}>
      <form onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label>{modal === 'text' ? '文本内容' : '项目名称'}{modal === 'text' ? <textarea autoFocus rows={6} maxLength={1000000} value={value} onChange={e => setValue(e.target.value)} /> : <input autoFocus maxLength={200} value={value} onChange={e => setValue(e.target.value)} />}</label>{modalError && <p role="alert" className="error">{modalError}</p>}<div className="dialog-actions">
          <Button disabled={busy} onClick={() => setModal(null)}>取消</Button>
          <Button type="submit" variant="primary" disabled={busy}>{modal === 'create' ? '创建' : modal === 'rename' ? '保存名称' : '添加到素材库'}</Button>
        </div>
      </form>
    </Dialog>}
    {view && <Dialog title={view.kind === 'image' ? '原始图片' : '文本素材'} onClose={() => setView(null)}>{view.kind === 'image' ? <img className="asset-viewer" src={`commerce-asset://asset/${view.id}/original`} alt="原始商品素材" /> : <p className="text-full">{view.text}</p>}<small>原始素材 · {view.kind === 'image' ? `${view.width} × ${view.height}` : '文本'}</small>
    </Dialog>}
  </div>;
}
