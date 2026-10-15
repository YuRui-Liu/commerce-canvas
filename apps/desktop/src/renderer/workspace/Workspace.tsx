import { useCallback, useEffect, useRef, useState } from 'react';
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
import {AssetLibrary} from './AssetLibrary';
import {AssetInspector} from './AssetInspector';
import {ImageViewer} from '../../../../../packages/ui/src/ImageViewer';
import {ImageCompare} from '../../../../../packages/ui/src/ImageCompare';
import type {AssetInput} from '../../../../../packages/canvas/src/AssetDropZone';
import type {CanvasDocument} from '../../../../../packages/contracts/src/canvas';
import { emptyPanel, type PanelState } from '../../../../../packages/contracts/src/canvas';
import { useCanvasSync } from '../../../../../packages/canvas/src/useCanvasSync';
import { recordRequirement } from './panelState';
import type {AssetImportResult} from '../../../../../packages/contracts/src/bridge';
import {defaultGenerationSettings} from '../../../../../packages/contracts/src/imageGeneration';
import {GenerationControls} from '../generation/GenerationControls';
import {GenerationInspector} from '../generation/GenerationInspector';
import {GenerationReview} from '../generation/GenerationReview';
import {useGenerationRuns,runLabel} from '../generation/useGenerationRuns';
import {latestApprovedGeneration} from '../generation/generationSelection';
import {ScenarioDialog} from '../generation/ScenarioDialog';
import {scenarioSettings} from '../generation/scenarios';
const bridge = window.commerceCanvas;
export function Workspace() {
  const canvas=useRef<CanvasHandle>(null);
  const sync = useCanvasSync(bridge);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [assets, setAssets] = useState<AssetVersion[]>([]);
  const [trashedAssets, setTrashedAssets] = useState<AssetVersion[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<AssetVersion | null>(null);
  const allAssets = [...assets, ...trashedAssets];
  const [busy, setBusy] = useState(true);
  const lock = useRef(true);
  const [status, setStatus] = useState('正在载入工作区');
  const [conflict, setConflict] = useState(false);
  const productState = useRef({ project, draft, dirty, conflict });
  productState.current = { project, draft, dirty, conflict };
  const [library, setLibrary] = useState(() => innerWidth >= 1280);
  const [right, setRight] = useState(true);
  const [modal, setModal] = useState<'create' | 'rename' | 'text' | 'settings' | null>(null);
  const [value, setValue] = useState('');
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<AssetVersion | null>(null);
  const [comparison,setComparison]=useState<AssetVersion[]>([]);
  const [generationHistory,setGenerationHistory]=useState(false);
  const [scenariosOpen,setScenariosOpen]=useState(false);
  const graph = sync.record?.document;
  const panel = sync.record?.panel ?? emptyPanel();
  const selection = panel.selectedIds;
  const textDrafts = panel.inspectorDrafts;
  const editPanel = useCallback((update: (panel: PanelState) => PanelState) => { if (!lock.current) sync.editPanel(update); }, [sync.editPanel]);
  const setSelection = useCallback((selectedIds: string[]) => editPanel(previous => JSON.stringify(previous.selectedIds) === JSON.stringify(selectedIds) ? previous : ({ ...previous, selectedIds, activeTab: selectedIds.length ? 'config' : previous.activeTab })), [editPanel]);
  const onCanvasSelection=useCallback((ids:string[])=>{setGenerationHistory(false);setSelection(ids);},[setSelection]);
  const setGraph = useCallback((document: CanvasDocument) => sync.edit({ document }), [sync.edit]);
  const [importResults,setImportResults]=useState<AssetImportResult[]>([]);
  const { error: themeError } = useTheme();
  const refresh = async () => setProjects(await bridge.listProjects());
  async function load(id: string) {
    canvas.current?.cancelPending();
    await sync.flush();
    const data = await bridge.getProject({ projectId: id });
    if (!data)
      throw Error('NOT_FOUND');
    const nextAssets = await bridge.listAssets({ projectId: id });
    const nextTrashed = await bridge.listAssets({ projectId: id, trashed:true });
    const prepared = await sync.prepareProject(id);
    const nextDraft = {
      facts: { ...data.project.facts },
      skus: data.skus.map(({ projectId: _, ...s }) => s),
      brand: data.brand ? { name: data.brand.name, description: data.brand.description, guidelines: data.brand.guidelines } : null,
    };
    // No fallible asynchronous work remains after committing the asset-access context.
    await bridge.selectCanvas({ projectId: id, canvasId: prepared.next.document.id });
    await bridge.setCurrentProject({ projectId: id });
    sync.installProject(prepared);
    productState.current = { project: data.project, draft: nextDraft, dirty: false, conflict: false };
    setProject(data.project);
    setProjects(list => list.map(p => p.id === id ? data.project : p));
    setDraft(nextDraft);
    setView(null);setComparison([]);setImportResults([]);
    setDirty(false);
    setConflict(false);
    setAssets(nextAssets);
    setTrashedAssets(nextTrashed);setShowDeleted(false);setLastDeleted(null);
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
  const closeHandler = useRef<() => Promise<void>>(async () => {});
  closeHandler.current = async () => {
    const start = Date.now();
    while (lock.current) {
      if (Date.now() - start > 10000) throw Error('WORKSPACE_BUSY');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    lock.current = true; setBusy(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => { await canvas.current?.flushPending(); await sync.flush(); if (!await save()) throw Error('PROJECT_SAVE_FAILED'); })(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error('FLUSH_TIMEOUT')), 12000); }),
      ]);
    } catch (error) { setStatus('关闭前保存失败，草稿已保留。'); throw error; }
    finally { clearTimeout(timeout); lock.current = false; setBusy(false); }
  };
  useEffect(() => bridge.onFlushRequested(() => closeHandler.current()), []);
  async function save(): Promise<boolean> {
    // Read after any operation-lock wait, never from the close request's old render.
    const { project, draft, dirty, conflict } = productState.current;
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
      if (productState.current.project?.id !== project.id) return true;
      productState.current = { ...productState.current, project: result, dirty: false };
      setProject(result);
      setProjects(list => list.map(p => p.id === result.id ? result : p));
      setDirty(false);
      setStatus('已保存');
      return true;
    }
    catch (e) {
      if (productState.current.project?.id !== project.id) return false;
      if (String(e).includes('REVISION_CONFLICT')) {
        productState.current = { ...productState.current, conflict: true };
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
  async function changeAssetTrash(asset: AssetVersion, trashed: boolean) {
    if (!project || asset.projectId !== project.id) return;
    await perform(async () => {
      try {
        await bridge[trashed ? 'trashAsset' : 'restoreAsset']({projectId:project.id,assetId:asset.assetId});
        const [active,deleted] = await Promise.all([bridge.listAssets({projectId:project.id}),bridge.listAssets({projectId:project.id,trashed:true})]);
        setAssets(active);setTrashedAssets(deleted);
        setLastDeleted(trashed?asset:null);
        setComparison(previous=>previous.filter(item=>item.assetId!==asset.assetId));
        setStatus(trashed?'素材已移到已删除；画布引用和历史版本保留':'素材已恢复');
      } catch (error) {
        setStatus(String(error).includes('ACTIVE_REFERENCE')?'素材正在被生成任务使用，请等待任务结束再删除。':'素材操作失败，请重试。');
      }
    });
  }
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
        const imported = await bridge.importAssetsBatch({ projectId: project.id });
        setImportResults(imported);
        setStatus(imported.length ? `已导入 ${imported.filter(r=>r.ok).length} 张图片，失败 ${imported.filter(r=>!r.ok).length} 项` : '已取消导入');
      } catch {
        setStatus('部分图片导入失败，请检查文件格式或大小；已导入素材已保留。');
      } finally {
        setAssets(await bridge.listAssets({ projectId: project.id }));
        setLibrary(true);
      }
    });
  }
  async function receiveAsset(input:AssetInput,position:{x:number;y:number}){
    if(!project)return;
    if(input.versionId){const asset=assets.find(a=>a.id===input.versionId);if(asset)canvas.current?.addAssets([asset],position);return;}
    await perform(async()=>{
      setStatus('正在复制素材到本机受管存储…');setImportResults([]);
      if(input.files){
        if(input.files.length>100){setStatus('一次最多导入 100 个文件');return;}
        const results:AssetImportResult[]=[];
        for(const [index,file] of input.files.entries()){
          setStatus(`正在导入 ${index+1} / ${input.files.length}：${file.name}`);
          if(file.size>50*1024*1024){results.push({name:file.name,ok:false,error:'INVALID_IMAGE'});continue;}
          try{results.push(...await bridge.importImages({projectId:project.id,files:[{name:file.name,bytes:new Uint8Array(await file.arrayBuffer())}]}));}
          catch{results.push({name:file.name,ok:false,error:'IMPORT_FAILED'});}
          setImportResults([...results]);
        }
        setImportResults(results);setAssets(await bridge.listAssets({projectId:project.id}));
        canvas.current?.addAssets(results.flatMap(r=>r.ok?[r.version]:[]),position);
        setStatus(`导入完成：${results.filter(r=>r.ok).length} 成功，${results.filter(r=>!r.ok).length} 失败`);
      }else if(input.text){const asset=await bridge.saveText({projectId:project.id,text:input.text});setAssets(await bridge.listAssets({projectId:project.id}));canvas.current?.addAssets([asset],position);setStatus('文本已保存并添加到画布');}
    });
  }
  const selectedNode=graph?.nodes.find(n=>n.id===selection[0]);
  const selectedAsset=allAssets.find(a=>a.id===selectedNode?.assetVersionId);
  const draftKey=selectedNode?.id??'';
  async function saveNodeText(){
    if(!project||!selectedNode||selectedAsset?.kind!=='text')return;
    const nodeId=selectedNode.id,assetId=selectedAsset.assetId,text=textDrafts[draftKey]??selectedAsset.text??'';
    await perform(async()=>{const version=await bridge.saveTextVersion({projectId:project.id,assetId,text});setAssets(await bridge.listAssets({projectId:project.id}));canvas.current?.replaceVersion(nodeId,version.id);setStatus('已保存文本新版本；下游需要更新');});
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
  const generation=useGenerationRuns({projectId:project?.id,canvasId:graph?.id,canvas,sync,blocked:busy,setAssets,saveProduct:save});
  const generationSelected=selectedNode?.kind==='generation';
  const rightVisible=right&&(!generationSelected||generationHistory);
  const generationRuns=generationHistory?generation.runs:generation.runs.filter(r=>r.nodeId===selectedNode?.id||r.id===selectedNode?.runId);
  const approvedGeneration=(id:string)=>latestApprovedGeneration(generation.runs,id,graph?.nodes.find(n=>n.id===id)?.runId);
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
      <Button variant="quiet" disabled={!project||busy} onClick={()=>{setGenerationHistory(true);setRight(true);}}>生成历史</Button>
      <Button variant="quiet" onClick={() => open('settings')}>设置</Button>
    </header>
    <div className={`workspace-grid ${library ? '' : 'library-closed'} ${rightVisible ? '' : 'right-closed'}`}>
      <LeftRail library={library} toggleLibrary={() => setLibrary(!library)} openSettings={() => open('settings')} openScenarios={()=>{if(!busy){if(project)setScenariosOpen(true);else open('create');}}} onNotice={setNotice} />
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
        <div className="asset-actions" aria-label="素材分类"><Button aria-pressed={!showDeleted} onClick={()=>setShowDeleted(false)}>全部素材</Button><Button aria-pressed={showDeleted} onClick={()=>setShowDeleted(true)}>已删除（{new Set(trashedAssets.map(a=>a.assetId)).size}）</Button></div>
        {lastDeleted&&<p role="status">已删除素材，画布引用保留。<Button disabled={busy} onClick={()=>void changeAssetTrash(lastDeleted,false)}>撤销删除</Button></p>}
        {showDeleted&&<p className="muted">删除会收起该素材的全部版本；恢复后可继续编辑与生成。</p>}
        {(showDeleted?trashedAssets:assets).length === 0 ? <div className="library-empty">
          <Icon kind="assets" />
          <h3>{showDeleted?'没有已删除素材':'为创作备好素材'}</h3>
          <p>商品图片、参考图和文本，<br />都会保存在这里。</p>
          <small>PNG、JPG、WebP</small>
        </div> : <AssetLibrary assets={showDeleted?trashedAssets:assets} trashed={showDeleted} busy={busy} onView={setView} onAdd={a=>canvas.current?.addAssets([a])} onCompare={a=>setComparison(previous=>previous.length===1?[previous[0],a]:[a])} onDelete={a=>void changeAssetTrash(a,true)} onRestore={a=>void changeAssetTrash(a,false)}/>}
        {comparison.length===1&&<p role="status">已选 1 张，请再选择一张对比。<Button onClick={()=>setComparison([])}>取消对比</Button></p>}
        {!!importResults.length&&<ul className="import-results" aria-label="逐文件导入结果">{importResults.map((result,index)=><li key={index}>{result.name}：{result.ok?'成功':'失败（请检查格式、大小或文件）'}</li>)}</ul>}
        <div className="library-foot">素材保存在本机</div>
      </aside>}
      <CanvasRegion ref={canvas} project={project} record={sync.record} canvases={sync.list} epoch={sync.epoch}
        selectCanvas={id => void perform(async () => { canvas.current?.cancelPending(); await sync.loadProject(project!.id, id); })}
        createCanvas={() => void perform(async () => { canvas.current?.cancelPending(); await sync.create(project!.id); })}
        assets={allAssets} onView={setView} right={rightVisible} busy={busy} toggleRight={() => {if(generationSelected){setGenerationHistory(!generationHistory);setRight(true);}else setRight(!right);}} upload={() => void importImages()} addText={() => open('text')} create={() => open('create')} onAssetInput={(input,position)=>void receiveAsset(input,position)} onDocumentChange={setGraph} onSelectionChange={onCanvasSelection}
        renderGeneration={node=><GenerationControls value={node.generation??defaultGenerationSettings()} onChange={value=>canvas.current?.setGeneration(node.id,value)} onGenerate={()=>void generation.prepare(node.id)} busy={busy||generation.pending}/>}
        generationRun={approvedGeneration} generationStatus={id=>runLabel(approvedGeneration(id)??generation.runs.find(r=>r.id===graph?.nodes.find(n=>n.id===id)?.runId))}/>
      {rightVisible && ((generationSelected||generationHistory)?<GenerationInspector key={generationHistory?'all':selectedNode?.id} node={generationHistory?undefined:selectedNode} runs={generationRuns} busy={busy||generation.pending} error={generation.error} onChange={value=>{if(selectedNode)canvas.current?.setGeneration(selectedNode.id,value);}} onGenerate={()=>{if(selectedNode)void generation.prepare(selectedNode.id);}} onClose={()=>setGenerationHistory(false)} onAct={(...args)=>void generation.act(...args)} onAdapt={(...args)=>void generation.adapt(...args)}/>:selectedNode&&graph&&panel.activeTab!=='chat'?<AssetInspector node={selectedNode} asset={selectedAsset} document={graph} draft={textDrafts[draftKey]??selectedAsset?.text??''}
        trashed={trashedAssets.some(a=>a.id===selectedAsset?.id)} onRestore={()=>{if(selectedAsset)void changeAssetTrash(selectedAsset,false);}}
        onDraft={text=>editPanel(p=>({...p,inspectorDrafts:{...p.inspectorDrafts,[draftKey]:text}}))}
        onSave={()=>void saveNodeText()} onRole={(id,role)=>{if(!lock.current)canvas.current?.setEdgeRole(id,role);}} onChat={()=>editPanel(p=>({...p,activeTab:'chat'}))}
        onClose={()=>{if(!lock.current)canvas.current?.clearSelection();}} onFacts={()=>{if(lock.current)return;canvas.current?.clearSelection();editPanel(p=>({...p,activeTab:'config'}));requestAnimationFrame(()=>document.querySelector<HTMLTextAreaElement>('.right-panel textarea')?.focus());}} busy={busy}/>
        :<RightPanel draft={draft} change={d => { if(lock.current)return;productState.current={...productState.current,draft:d,dirty:true};setDraft(d); setDirty(true); setStatus('有未保存修改'); }} disabled={busy} save={() => void perform(async () => { await save(); })}
          panel={panel} savedMessages={sync.savedMessages} changePanel={next=>editPanel(()=>next)}
          saveRequirement={()=>void perform(async()=>{if(graph){sync.editPanel(p=>recordRequirement(p,graph));await sync.flush();}})} settings={() => open('settings')} />)}
    </div>
    <footer className="statusbar">
      <span role="status">{themeError || (!generation.review&&generation.error) || status}{project && !conflict ? ` · 修订 ${project.revision}` : ''}</span>
      <span>{sync.status || '本地优先 · 自由创作'}</span>
    </footer>
    {scenariosOpen&&<ScenarioDialog onClose={()=>setScenariosOpen(false)} onChoose={template=>{canvas.current?.addGeneration(scenarioSettings(template));setScenariosOpen(false);setStatus(`已创建${template.name}节点，请连接商品参考并调整要求。`);}}/>}
    {sync.failed && <div className="conflict-banner" role="alert"><strong>画布保存失败或发生修订冲突</strong><span>当前草稿已保留；重新载入会舍弃本画布草稿，另存会保留为新画布。</span>{!sync.conflict&&<Button disabled={busy} onClick={()=>void perform(sync.retry)}>重试画布保存</Button>}<Button disabled={busy} onClick={()=>void perform(sync.reload)}>重新载入画布</Button><Button disabled={busy} onClick={()=>void perform(sync.copy)}>另存画布副本</Button></div>}
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
    {generation.review&&<GenerationReview run={generation.review} pending={generation.pending} error={generation.error} onConfirm={()=>void generation.confirm()} onCancel={()=>void generation.cancel()} onSettings={()=>open('settings')}/>}
    {modal && modal !== 'settings' && <Dialog title={modal === 'create' ? '创建商品项目' : modal === 'rename' ? '重命名项目' : '添加文本素材'} onClose={() => {
      if (!busy)
        setModal(null);
    }}>
      <form onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.keyCode===229)){e.preventDefault();e.stopPropagation();}}} onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label>{modal === 'text' ? '文本内容' : '项目名称'}{modal === 'text' ? <textarea autoFocus rows={6} maxLength={1000000} value={value} onChange={e => setValue(e.target.value)} /> : <input autoFocus maxLength={200} value={value} onChange={e => setValue(e.target.value)} />}</label>{modalError && <p role="alert" className="error">{modalError}</p>}<div className="dialog-actions">
          <Button disabled={busy} onClick={() => setModal(null)}>取消</Button>
          <Button type="submit" variant="primary" disabled={busy}>{modal === 'create' ? '创建' : modal === 'rename' ? '保存名称' : '添加到素材库'}</Button>
        </div>
      </form>
    </Dialog>}
    {view?.kind==='image'&&<ImageViewer asset={view} onClose={()=>setView(null)}/>}
    {view?.kind==='text'&&<Dialog title="文本素材" onClose={()=>setView(null)}><p className="text-full">{view.text}</p></Dialog>}
    {comparison.length===2&&<ImageCompare assets={[comparison[0],comparison[1]]} onClose={()=>setComparison([])}/>}
  </div>;
}
