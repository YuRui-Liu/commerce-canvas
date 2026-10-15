# 交互重设计验收记录

设计确认：2026-10-13。完成验证：2026-10-14（Asia/Shanghai）。

## 已落实的参考

| 来源 | 实际代码 | 可操作结果 |
| --- | --- | --- |
| Nuomi `frontend/src/features/canvas/nodes/ImageGenNode.tsx` 的图片主体、选中下浮面板、参考解绑 | `packages/canvas/src/nodes/ImageGenerationNode.tsx`、`Canvas.tsx` | 单选才编辑，多图结果切换，解绑可撤销，输入端口锚点稳定 |
| Nuomi 画布滚动语义与摄影选择分层 | `Canvas.tsx`、`GenerationControls.tsx`、`SizePicker.tsx`、`PhotographyDialog.tsx` | 滚动平移、捏合缩放；紧凑参数按钮；尺寸/摄影草稿应用与取消；器材、构图、灯光分组 |
| 上游 Style Library 的六段提示词与商品、摄影、海报模板分类 | `apps/desktop/src/renderer/generation/scenarios.ts`、`ScenarioDialog.tsx` | 四个场景创建真实出图节点，参数可改，进入现有生成确认快照 |
| 现有资产回收站能力 | `AssetLibrary.tsx`、`AssetInspector.tsx`、`Workspace.tsx`、资产 repository/bridge | 删除、撤销、已删除列表、恢复；重开仍保留画布引用；已删除文本恢复后才可编辑 |

Nuomi 只读对照，未移植其源码或图片。GitHub 来源在 2026-10-13 重新核验：

- [Style Library 结构](https://github.com/freestylefly/awesome-gpt-image-2/blob/main/agents/skills/gpt-image-2-style-library/SKILL.md)
- [模板分类与指导](https://github.com/freestylefly/awesome-gpt-image-2/blob/main/data/style-library.json)

中文模板独立编写，未使用上游示例图片。输出规格遵循当前节点参数，避免用户修改画幅后被旧模板比例锁定。

## 验证与修复

父 Agent 独立运行 `npm run typecheck` 成功，`npm test` 的 25 个文件、127 个测试全部通过。`git diff --check` 无输出。

父 Agent 在实现冻结和打包后独立运行：

- `npx playwright test -c apps/desktop/playwright.config.ts apps/desktop/tests/interaction-redesign.spec.ts apps/desktop/tests/asset-deletion.spec.ts`：3/3 通过，使用源码构建。
- 指定 `COMMERCECANVAS_EXECUTABLE` 为新包内可执行文件，运行 `desktop.spec.ts`：2/2 通过。验证打包应用启动、SQLite/Sharp utility process、本地渲染与隐藏窗口策略。

开发 Agent 的全量桌面首轮为 26 通过、1 项仅打包适用测试跳过、3 失败。失败修复后，相关素材/画布/复杂交互 9 项全部通过；另生成/删除/基础交互 9 项通过。没有把分组重跑描述为完整套件重新全跑通过。

最新产物：`dist/packages/CommerceCanvas-darwin-arm64/CommerceCanvas.app`。打包检查使用隔离测试资料，没有启动用户正常资料的可见窗口。

隐藏 Electron 回归覆盖素材删除/恢复/重启/跨项目隔离/活动任务保护，四模板真实 prepare、原草稿保留，尺寸取消/应用，摄影分组，输入法与快捷键保护，嵌套弹层焦点，多选回到单选，角色连线与解绑撤销，低/高缩放编辑，双主题 1440/1024 窗口。

验收中发现并修复：已删除文本仍允许保存、尺寸取消仍写入节点、摄影 Esc 传播异常、更多菜单外部点击不关闭、边缘编辑器按钮被状态栏截断。补充按钮完整位于画布边界内的断言；摄影改为字段区单层滚动，操作按钮独立显示。

专业 UI Agent 实际查看两种窗口尺寸的最终截图，确认参数与生成按钮完整可见。独立代码质量审查确认尺寸取消及删除态编辑问题已闭环，未发现新增阻断问题。

## 截图

- `apps/desktop/dist/generation-studio-1440.png`
- `apps/desktop/dist/generation-editorial-1024.png`
- `apps/desktop/dist/generation-photo-studio-1024.png`
- `apps/desktop/dist/redesign-scenarios.png`
- `apps/desktop/dist/redesign-low-zoom.png`

截图来自隔离测试资料的隐藏 Electron 窗口。生成执行回归使用受控服务 fixture，本轮未新增真实远端出图请求，不能将其描述为新一轮真实商品出图质量验收。

本轮提供四种场景的单节点出图工作流，完整 Agent 编排仍未接入；其占位入口已弱化并移出主创作路径。
