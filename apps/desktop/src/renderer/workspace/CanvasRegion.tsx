import type { Project } from '../../../../../packages/contracts/src/domain';
import { Button } from '../../../../../packages/ui/src/Button';
import { Icon } from './LeftRail';
/** C2 will replace the empty surface with the canvas graph without owning project persistence. */
export function CanvasRegion({ project, right, busy, toggleRight, upload, addText, create }: {
  project?: Project; right: boolean; busy: boolean;
  toggleRight: () => void; upload: () => void; addText: () => void; create: () => void;
}) {
  return <main className="canvas-main">
    <div className="canvas-toolbar">
      <div><strong>{project?.name ?? '商品创作工作区'}</strong><small>画布</small></div>
      <Button variant="quiet" aria-pressed={right} onClick={toggleRight}>{right ? '收起助手' : '展开助手'}</Button>
    </div>
    <div className="canvas-surface">
      <div className="canvas-empty">
        <span className="canvas-emblem"><Icon kind="assets"/></span>
        <p className="eyebrow">你的下一张商品图，从这里开始</p>
        <h1>{project ? '给商品一个新的表达。' : '把商品与灵感，放在一起。'}</h1>
        <p>{project ? '上传商品图片或添加文本，为创作准备素材。' : '创建商品项目，把图片、SKU 和品牌资料放在一起。'}</p>
        <div className="empty-actions">{project ? <>
          <Button variant="primary" disabled={busy} onClick={upload}><Icon kind="upload"/>上传图片</Button>
          <Button onClick={addText} disabled={busy}>添加文本</Button>
        </> : <Button variant="primary" disabled={busy} onClick={create}>创建项目</Button>}</div>
        <small>当前可整理本地资料与素材，画布编排即将接入。</small>
      </div>
      <div className="canvas-caption">本地工作空间 <span>·</span> 图片保持原始色彩</div>
    </div>
  </main>;
}
