import { forwardRef,type ReactNode } from 'react';
import type { AssetVersion, Project } from '../../../../../packages/contracts/src/domain';
import type { CanvasDocument, CanvasRecord, CanvasSummary, CanvasNode } from '../../../../../packages/contracts/src/canvas';
import { Canvas, type CanvasHandle } from '../../../../../packages/canvas/src/Canvas';
import { Button } from '../../../../../packages/ui/src/Button';
import { Icon } from './LeftRail';
import type { AssetInput } from '../../../../../packages/canvas/src/AssetDropZone';

export const CanvasRegion = forwardRef<CanvasHandle, {
  project?: Project; record?: CanvasRecord; canvases: CanvasSummary[]; epoch: number;
  selectCanvas: (id: string) => void; createCanvas: () => void;
  assets: AssetVersion[]; onView: (asset: AssetVersion) => void; right: boolean; busy: boolean;
  toggleRight: () => void; upload: () => void; addText: () => void; create: () => void;
  onAssetInput: (input: AssetInput, position: { x: number; y: number }) => void;
  onSelectionChange: (ids: string[]) => void; onDocumentChange: (doc: CanvasDocument) => void;
  renderGeneration?:(node:CanvasNode)=>ReactNode;generationStatus?:(id:string)=>string;
}>(function CanvasRegion({ project, record, canvases, epoch, selectCanvas, createCanvas, assets, onView, right, busy, toggleRight, upload, addText, create, onAssetInput, onSelectionChange, onDocumentChange,renderGeneration,generationStatus }, ref) {
  return <main className="canvas-main">
    <div className="canvas-toolbar">
      <div><strong>{project?.name ?? '商品创作工作区'}</strong><small>画布</small></div>
      {record && <><select aria-label="当前画布" disabled={busy} value={record.document.id} onChange={event => selectCanvas(event.target.value)}>{canvases.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button disabled={busy} onClick={createCanvas}>新建画布</Button></>}
      <Button variant="quiet" aria-pressed={right} onClick={toggleRight}>{right ? '收起助手' : '展开助手'}</Button>
    </div>
    <div className="canvas-surface">
      {project && record && record.document.projectId === project.id && <Canvas key={`${record.document.id}:${epoch}`} ref={ref} document={record.document} initialSelection={record.panel.selectedIds} disabled={busy} assets={assets} onView={onView} onAssetInput={onAssetInput} onSelectionChange={onSelectionChange} onChange={onDocumentChange} renderGeneration={renderGeneration} generationStatus={generationStatus} />}
      {!record?.document.nodes.length && <div className="canvas-empty" style={{ pointerEvents: 'none', position: 'relative', zIndex: 2 }}>
        <span className="canvas-emblem"><Icon kind="assets" /></span><p className="eyebrow">你的下一张商品图，从这里开始</p>
        <h1>{project ? '给商品一个新的表达。' : '把商品与灵感，放在一起。'}</h1>
        <p>{project ? '上传商品图片或添加文本，为创作准备素材。' : '创建商品项目，把图片、SKU 和品牌资料放在一起。'}</p>
        <div className="empty-actions" style={{ pointerEvents: 'auto' }}>{project ? <><Button variant="primary" disabled={busy} onClick={upload}><Icon kind="upload" />上传图片</Button><Button onClick={addText} disabled={busy}>添加文本</Button></> : <Button variant="primary" disabled={busy} onClick={create}>创建项目</Button>}</div>
        <small>{project ? '从素材库添加到画布，连接输入来组织创作。' : '图片保持原始色彩，素材保存在本机。'}</small>
      </div>}
    </div>
  </main>;
});
