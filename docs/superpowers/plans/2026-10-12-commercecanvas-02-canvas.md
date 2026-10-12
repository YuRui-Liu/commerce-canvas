# 商品画布与双主题实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务执行，用复选框跟踪。

**目标：** 将获批界面转化为可拖入、编辑、保存和恢复的真实商品画布。

**架构：** React Flow 只负责图形交互，独立 canvas store 保存节点与引用；业务状态由 runtime 推送，组件不能调用图片服务。检查器与总控对话共享选中上下文，但各自保留编辑状态。

**技术栈：** React、React Flow、Zustand、CSS variables、Vitest、Playwright。

---

依赖 F1–F4。文件路径相对项目根；浏览器测试通过 `npm run test:e2e -- <file>` 执行，桌面桥由 E2E 测试适配器提供。生产运行不得使用该适配器。

## C1 视觉系统与工作区布局

**创建：** `packages/ui/src/theme/tokens.css`、`ThemeProvider.tsx`、`Button.tsx`、`Dialog.tsx`；`apps/desktop/src/renderer/workspace/Workspace.tsx`、`ProjectSwitcher.tsx`、`LeftRail.tsx`、`RightPanel.tsx`、`SettingsPanel.tsx`；`tests/e2e/workspace.spec.ts`。

- [ ] 实现主题变量并接入 F4 的 `getTheme/setTheme`；仅两个主题可选，未配置默认 studio。

```css
:root,[data-theme="studio"]{--panel:#fff;--canvas:#f0f2f5;--ink:#20242d;--muted:#626978;--accent:#3659df;--line:#e2e5eb}
[data-theme="editorial"]{--panel:#fffefd;--canvas:#eeecea;--ink:#272326;--muted:#72696b;--accent:#a9344e;--line:#e5dfe0}
```

- [ ] 布局默认 56 px 左工具栏、224 px 素材面板、可伸缩画布、320 px 右面板。低于 1280 px 时素材面板可折叠；右侧配置与对话切换保留草稿。图标采用统一线性 SVG，危险操作与主要执行按钮有不同语义，禁止把瓶身示意色作为 UI 主题。
- [ ] 实现商品项目创建、切换、事实编辑、SKU 和品牌表单，调用 F2 repository 对应桥接；切换项目前提交草稿，保存冲突显示重载／另存，不覆盖远端较新 revision。
- [ ] 浏览器检查 1440×960、1280×800、1024×768，A／B 各一张截图。实际点击主题切换、重启恢复、折叠侧栏、键盘进入对话和配置，验证文字可读与焦点可见。主题变化前后同一资产版本 hash 必须相同。
- [ ] 提交 `git add packages/ui apps/desktop/src/renderer/workspace tests/e2e/workspace.spec.ts`，`git commit -m "feat: build themed product workspace"`。

## C2 图结构、连线和 Nuomi 部件抽取

**创建：** `packages/contracts/src/canvas.ts`；`packages/canvas/src/Canvas.tsx`、`store.ts`、`graph.ts`、`layout.ts`、`snapAlign.ts`、`nodes/AssetNode.tsx`、`nodes/TextNode.tsx`、`nodes/AgentNode.tsx`、`nodes/OutputNode.tsx`、`nodes/GroupNode.tsx`；测试 `packages/canvas/test/graph.test.ts`、`history.test.ts`。

- [ ] 定义节点引用与连线角色；节点不包含图片 Base64，不复制商品全文。

```ts
export interface CanvasNode {
  id: string; kind: 'asset'|'text'|'agent'|'output'|'group';
  position: {x:number;y:number}; parentId?: string;
  assetVersionId?: string; agentDefinitionId?: string; runId?: string;
}
export interface CanvasEdge { id:string; source:string; target:string; role:InputRole }
export interface CanvasDocument {
  id:string; projectId:string|null; revision:number;
  nodes:CanvasNode[]; edges:CanvasEdge[]; viewport:{x:number;y:number;zoom:number};
}
```

- [ ] `canConnect(nodes, edges, source, target)` 测试自连、循环、跨画布、源缺失、重复角色输入；DFS 从 target 到 source 可达即拒绝。`descendants(edges, nodeId)` 返回受影响下游而非全部节点。

```ts
expect(canConnect(nodes, [{id:'e',source:'a',target:'b',role:'product'}], 'b', 'a')).toBe(false);
expect(descendants([{id:'e',source:'a',target:'b',role:'product'}], 'a')).toEqual(['b']);
```

- [ ] 运行 `npm test -- packages/canvas/test/graph.test.ts packages/canvas/test/history.test.ts` 确认失败，再实现图算法与命令历史。拖动开始至结束记录一个撤销操作，运行状态事件不进入布局撤销栈；撤销节点删除恢复连线，绝不删除资产库文件。
- [ ] 用 React Flow `selectionOnDrag`、空格／中键平移、触控板平移和缩放、fitView 实现基础交互。Nuomi 吸附和布局算法只引用通用 `position/size` 适配类型；查看器入口改成回调，去除对 Nuomi 全局 store 的引用。记录复制的文件与许可证，禁止导入 `novelvideo` 或短剧节点类型。
- [ ] 图像节点优先使用缩略图，离屏卸载大图；大批导入分帧添加。构造 200 节点、300 边的交互样例，记录机器与拖动耗时，不宣称未测 FPS。
- [ ] 提交 `git add packages/contracts/src/canvas.ts packages/canvas docs/decisions/0001-runtime-and-reuse.md`，`git commit -m "feat: add revisioned canvas graph and interactions"`。

## C3 导入、资产角色与图像查看

**创建：** `packages/canvas/src/AssetDropZone.tsx`、`inputBindings.ts`；`packages/ui/src/ImageViewer.tsx`、`ImageCompare.tsx`；`apps/desktop/src/renderer/workspace/AssetLibrary.tsx`、`AssetInspector.tsx`、`TextInspector.tsx`；测试 `tests/e2e/asset-input.spec.ts`。

- [ ] 先写 E2E：画布移动和缩放后拖入文件，节点出现在光标对应位置；粘贴文本产生文本节点，输入框内粘贴只修改文本；同一图片分别连到两个 Agent 可选不同角色。

```ts
await page.getByRole('textbox',{name:'商品文案'}).fill('30 ml');
await page.getByRole('button',{name:'保存文案'}).click();
await expect(page.getByTestId('selected-text-node')).toContainText('30 ml');
```

- [ ] 运行 `npm run test:e2e -- tests/e2e/asset-input.spec.ts` 确认行为缺失。drop 使用 `screenToFlowPosition({x:event.clientX,y:event.clientY})`，不能减两次容器偏移。外部文件先复制到受管存储，上传进度和失败各有节点状态；批量导入保留每个文件的结果。
- [ ] 角色写入 `CanvasEdge.role`，不修改共享 AssetVersion。事实与任务要求分开提供给 Agent；缺少商品依据时展示补充入口。图片查看器支持 fit、实际像素、并排／滑杆对比；两图按相同缩放基准，保留原始纵横比。
- [ ] 文案编辑保存新文本版本并标记下游需要更新。双击图片不触发节点拖动，输入框 Delete 不删除节点；支持 Esc 关闭对比并返回原焦点。
- [ ] 运行指定 E2E；手动验证中文输入法候选期间 Enter 不发送。提交 `git add packages/canvas/src/AssetDropZone.tsx packages/canvas/src/inputBindings.ts packages/ui/src/ImageViewer.tsx packages/ui/src/ImageCompare.tsx apps/desktop/src/renderer/workspace tests/e2e/asset-input.spec.ts`，`git commit -m "feat: connect canvas assets and contextual inspectors"`。

## C4 保存、恢复与右侧上下文

**创建：** `packages/runtime/src/canvases/repository.ts`；`packages/canvas/src/saveCoordinator.ts`、`useCanvasSync.ts`；`apps/desktop/src/renderer/workspace/panelState.ts`、`ConversationPanel.tsx`；测试 `packages/canvas/test/saveCoordinator.test.ts`、`tests/e2e/canvas-reopen.spec.ts`。

- [ ] 测试保存期间又拖动节点：旧保存完成不得清空新 dirty revision；过期响应不得覆盖新视口。关闭重开后节点、边、分组和视口恢复。

```ts
expect(acknowledge({localRevision:4,savedRevision:2},3))
  .toEqual({localRevision:4,savedRevision:3});
```

- [ ] 运行 `npm test -- packages/canvas/test/saveCoordinator.test.ts` 确认缺少函数失败。实现 `acknowledge` 忽略超过本地或落后于已保存的响应；保存队列串行，拖动结束合并保存，退出前 flush。先写本地事务，再向 renderer 确认。
- [ ] 定义 `PanelState` 的 chatDraft、inspectorDrafts（按 node ID）、activeTab、selectedIds。总控收到的引用在发送时快照，随后选中其他节点不改变已发任务输入。
- [ ] ConversationPanel 先只展示真实持久化消息和运行事件，A4 接入执行；没有运行适配器时显示未连接，不播放假成功。桥接增加 `loadCanvas/saveCanvas/listCanvases`，带 expectedRevision。
- [ ] 运行 `npm run test:e2e -- tests/e2e/canvas-reopen.spec.ts`、指定单元测试与 typecheck。提交 `git add packages/runtime/src/canvases packages/canvas apps/desktop/src/renderer/workspace packages/contracts/src/bridge.ts tests/e2e/canvas-reopen.spec.ts`，`git commit -m "feat: recover canvas drafts and context"`。
