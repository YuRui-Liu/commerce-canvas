# Nuomi 式出图交互实现计划

> 面向 AI 代理的工作者：使用 subagent-driven-development 或 executing-plans 逐任务执行。遵守本仓库单实现 Agent 与独立规格/质量审查要求。

**目标：** 图像为主体的画布、就地参数编辑、可恢复的素材删除、实际参与出图的场景模板。

**架构：** 复用当前 Electron IPC、不可变资产、画布历史与 GRSai 执行链路。只读参考 Nuomi，独立实现交互组件。场景模板输出现有 GenerationSettings，不引入第二套任务执行。

**技术栈：** React、React Flow、TypeScript、Zod、Vitest、隐藏 Electron Playwright。

## 1. 完成素材删除闭环

文件：`apps/desktop/src/renderer/workspace/{Workspace,AssetLibrary}.tsx`、`packages/contracts/src/bridge.ts`、`packages/runtime/src/{assets/repository,service}.ts`、`packages/runtime/test/assets.test.ts`、`apps/desktop/tests/asset-deletion.spec.ts`。

- [x] 接入软删除、已删除列表、恢复、撤销；画布加载已删除引用，删除整份素材的版本关系明确。
- [x] 回归删除、重开、恢复、跨项目隔离及活动任务保护。
- [x] `npm run typecheck` 与 runtime assets 测试及隐藏 Electron 测试通过。

## 2. 图片主体与选中编辑器

文件：`packages/canvas/src/nodes/ImageGenerationNode.tsx`、`packages/canvas/src/Canvas.tsx`、`packages/canvas/src/canvas.css`、`apps/desktop/src/renderer/generation/{GenerationControls,GenerationInspector}.tsx`、`generation.css`。

- [x] 节点增加结果预览、无结果占位和结果数量；单选时展开绝对定位编辑器，输入端口位置保持稳定。
- [x] 编辑器按参考图、提示词、参数栏排列；参考图提供解绑回调，删除对应 edge 并进入撤销历史。
- [x] 右侧删除重复配置表单，保留历史、恢复和产物操作。输入区消费快捷键，不抢焦点。
- [x] 隐藏 Electron 验证未选中无表单、单选可编辑、多选不重叠、解绑及撤销、连线锚点稳定。

## 3. 参数与摄影

文件：`apps/desktop/src/renderer/generation/GenerationControls.tsx`、`PhotographyDialog.tsx`，可按职责提取小组件。

- [x] 模型、尺寸、摄影、数量改紧凑摘要按钮和按需弹层；尺寸用比例按钮与分辨率选择，保留模型能力校验与自定义像素。
- [x] 摄影分组为器材、构图、灯光，使用可视选择项；应用/取消使用独立草稿。
- [x] 弹层使用屏幕尺寸布局，边缘限高可滚动；Esc 分层关闭并返回焦点，输入法组合期间不提交。
- [x] 验证尺寸联动、摄影取消、Delete 保护和低缩放编辑。

## 4. 画布操作与场景模板

文件：`packages/canvas/src/Canvas.tsx`、`apps/desktop/src/renderer/workspace/{LeftRail,Workspace}.tsx`；新建独立场景数据和选择组件，测试 colocated。

- [x] 使用 `panOnScroll={!locked}`、`zoomOnScroll={false}`、`zoomOnDoubleClick={false}`；保留捏合缩放与空格/中键拖动。普通素材只显示输出，保留已有历史连接锚点兼容。
- [x] 工具栏分为常用与选中操作，画布删除明确命名“移除节点”。
- [x] 场景入口展示白底主图、生活场景、材质细节、卖点海报；各模板包含六段结构化指令、摄影默认值、来源信息，实际创建已配置出图节点。
- [x] 单元测试确保四模板指令不同、配置通过 schema、现有用户输入不被静默覆盖。隐藏 Electron 点选模板验证节点配置和待确认请求。

## 5. 验收与交付

- [x] `npm run typecheck`、`npm test`、`npm run build`。运行受影响的隐藏 Electron E2E；测试选择器随明确的新交互更新，不降低断言。
- [x] 获取 1440 与 1024 窗口下双主题、选中节点与摄影配置截图，UI Agent 实际查看并审查。
- [x] 独立审查规格与代码质量，修复可重现问题后重跑相关测试。
- [x] 记录具体来源到实际交互/模板的映射以及验证证据；提供最新构建产物，不将旧包视为新界面。

每次编辑前遵守 Weaver 路径策略；使用非 Bash 编辑工具由 hook 采集。隐藏测试不得弹出窗口或修改用户正常资料。

完成核验见 `docs/evidence/interaction-redesign.md`。父 Agent 独立通过 127 项单测、3 项交互/删除桌面测试和 2 项打包应用检查。开发 Agent 的全量首轮曾有 3 项失败，修复后相应 9 项回归通过；不将其表述为完整套件重新全跑通过。
