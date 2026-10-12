# 0001 · 桌面运行时与 Nuomi 复用边界

状态：采用；日期：2026-10-12。

采用 Electron + React + TypeScript，npm workspaces 管理 `apps/desktop` 与 `packages/runtime`。React Flow 与 Zustand 已锁定为后续画布实现依赖，本阶段不提供画布或持久化的占位实现。

渲染进程开启 contextIsolation / sandbox，关闭 nodeIntegration。preload 只公开 `commerceCanvas.health()`；主进程仅接受主 frame 请求，并拒绝导航和新窗口。utility process 执行 node:sqlite 内存建表写入读取、Sharp PNG 编码与读取尺寸，不阻塞 UI。健康结果来自真实能力探测，失败显示原始诊断，不伪造成功。

图片生成将直接接入 GRSai，见 [接入说明](../integrations/grsai.md)。没有自建中转站、号池或收费服务；UI 不展示金额账单。DeepSeek、Codex 与 WorkBuddy 属于后续 Agent 接入，当前尚未实现。

## 版本选择

Electron 44.7.0；electron-vite 5.0.0；Vite 7.3.7；Vitest 3.2.7；TypeScript 5.9.3；React 19.3.0；Playwright 1.64.0；Sharp 0.35.5。依赖精确版本与传递依赖记录于 package-lock.json。

electron-vite 5 的 peer 范围为 Vite 5/6/7，因此未采用 Vite 8。以实际构建和 Electron utility 探测验证组合，不通过强制忽略 peer 约束安装。

## 只参考，不整库迁移

本轮核对 Nuomi 本地 HEAD：`d4f9e688ba6a4df88ea048d0db9857739361b1cb`，根目录 `/Users/liuyuxiang05/Liu/Nuomi-drama-factory`。

| 参考文件（相对 Nuomi 根） | 可复用边界 |
| --- | --- |
| frontend/src/features/canvas/ui/CanvasNodeImage.tsx | 图片展示与交互边界；须拆除原 store 耦合 |
| frontend/src/features/canvas/snap-align/computeSnapAlign.ts 与相邻模块 | 吸附计算与参考线；先适配独立节点模型 |
| frontend/src/features/canvas/application/autoLayout.ts | 布局计算；不带入原业务节点类型 |
| frontend/src/features/freezone/canvasSaveCoordinator.ts | 保存协调状态机思想；另行实现新持久化契约 |
| frontend/src/features/canvas/Canvas.tsx（4890 行） | 仅参考行为，不整体复制 |
| frontend/src/stores/canvasStore.ts（3904 行） | 仅参考边界，不整体复制 |

以上核对文件带有 `SPDX-License-Identifier: Elastic-2.0` 和 `Copyright (c) 2026 ClaymoreLab`；前端许可证位于 `frontend/LICENSE`。本轮没有复制 Nuomi 源码。未来若移植，必须保留许可、版权、归属标识，并复核 Elastic-2.0 对托管服务与许可保护的限制；不得将该许可当作 MIT/Apache。

版本和运行时依据：[Electron releases](https://releases.electronjs.org/?channel=stable)、[utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)、[electron-vite](https://electron-vite.org/guide/)。
