# CommerceCanvas 实现计划总览

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实现；执行方式由用户选择。用 `- [ ]` 跟踪进度。

**目标：** 交付已批准规格中的独立电商图片客户端，包括全场景、双主题和三种 Agent 接入。

**架构：** Electron 主进程负责窗口、凭证、IPC 与资产读取；独立 utility process 负责 SQLite、任务调度和图像处理。React 渲染器只通过类型化桥接访问业务服务，图片生成只走用户网关。

**技术栈：** TypeScript、Electron、Vite、React、React Flow、Zustand、Zod、Node SQLite、Sharp、Vitest、Playwright。正式依赖采用执行时兼容的稳定版本并锁定；先验证 Electron 内置 Node 支持 `node:sqlite`，不凭系统 Node 版本推断。

---

## 范围与执行规则

工作根目录固定为 `/Users/liuyuxiang05/Liu/CommerceCanvas`。本目录只含设计文档和忽略的视觉原型，不含产品代码。本计划所列代码路径均相对此根目录。Nuomi 仅作为只读参考，不直接修改。

规格：[产品设计](../specs/2026-10-12-commercecanvas-design.md)。视觉依据：`.superpowers/brainstorm/97603-1791816444/content/visual-directions-v3.html`；将获批 A／B 视觉记录保存到仓库文档，原型服务器及 C 主题不进入生产代码。

这是多个子系统，拆成 6 份独立计划。每份完成后都有可演示的成果，但只有全部验收后才能称首版完成。

| 顺序 | 计划 | 依赖 | 可验收交付 |
| --- | --- | --- | --- |
| 1 | [本地基础](2026-10-12-commercecanvas-01-foundation.md) | 无 | 桌面启动、项目／资产持久化、凭证隔离 |
| 2 | [画布与双主题](2026-10-12-commercecanvas-02-canvas.md) | 1 | 真正可编辑、保存和恢复的商品画布 |
| 3 | [Agent 与编排](2026-10-12-commercecanvas-03-agents.md) | 1、2 | 预设／自定义 Agent、三个运行适配器、确认与次数控制 |
| 4 | [图片网关与恢复](2026-10-12-commercecanvas-04-gateway.md) | 1、3 | 真网关提交、找回任务、保存产物、部分成功 |
| 5 | [全部电商场景](2026-10-12-commercecanvas-05-scenarios.md) | 2、3、4 | 八类场景的专门编辑与验收 |
| 6 | [检查、导出与发布](2026-10-12-commercecanvas-06-delivery.md) | 1–5 | 检查闭环、可用文件、桌面打包和真实验收证据 |

并行时只分配已解耦模块，共享类型由单一任务维护；不让多个工作者同时改同一入口。规划阶段不启动实施 Agent。

每个任务按“契约／有意义的失败测试 → 实现 → 指定验证 → 小提交”进行。布局、文案、主题不编写镜像实现的单元测试，采用浏览器检查；并发、持久化、版本和异常恢复必须有自动测试。文档内代码用于固定类型、算法和断言，UI 细节按已批准视觉实现，不复制原型模拟行为。

## 文件边界

```text
apps/desktop/src/main/          窗口、凭证、协议、IPC
apps/desktop/src/preload/       类型化桥接，不能暴露任意 invoke/文件读取
apps/desktop/src/renderer/      React 入口、主题与页面组合
packages/contracts/src/        跨进程数据类型、Zod 解析、错误码
packages/runtime/src/db/       SQLite、迁移、事务
packages/runtime/src/projects/ 商品事实、SKU、品牌
packages/runtime/src/assets/   导入、版本、本地文件与缩略图
packages/runtime/src/agents/   定义、Skill 编译、DeepSeek/Codex/WorkBuddy
packages/runtime/src/runs/     计划、批准、次数预占、事件与恢复
packages/runtime/src/gateway/  唯一图片生成入口、上传与查询
packages/runtime/src/scenes/   场景配方、输入校验和预设
packages/runtime/src/quality/  检查结果与返修约束
packages/runtime/src/exports/  拼接、尺寸、文件与清单
packages/canvas/src/           画布状态、节点、交互和同步
packages/ui/src/               复用控件、主题、查看器
tests/contract/                接入与限额契约测试
tests/e2e/                     真实 UI 行为和桌面流程
tests/fixtures/                人工构造或授权样例，不包含凭证
docs/evidence/                 脱敏的接入、视觉和场景验收
```

## 工程决策与已核验事实

1. 采用 Electron，以复用 React 前端并启动本机 Agent；业务运行在独立进程避免数据库与图像处理阻塞界面。最先在当前 macOS 机器验收；系统路径、凭证与进程取消封装为平台边界，不把其他平台未验证误报为支持。
2. Nuomi 的 `Canvas.tsx` 为 4,890 行，`canvasStore.ts` 为 3,904 行。抽取低耦合算法与 UI 部件，不复制总入口及短剧状态。
3. 可参考 `CanvasNodeImage.tsx`、`computeSnapAlign.ts`、`autoLayout.ts`、保存协调器；实际复制文件记录原始提交和 SPDX，若许可不适合分发则依据行为用 React Flow 公共接口独立实现。
4. 本机 `codex exec --help` 已确认支持 stdin、JSONL、output-schema、ephemeral、read-only 等。未进行付费调用。
5. `/Users/liuyuxiang05/.codebuddy/bin/buddy` 是编辑器启动器，不能当作 WorkBuddy 无头 CLI。已找到 `/Applications/WorkBuddy AI.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`，其 help 确認 print、JSON 输出、禁用 tools、输入格式及模型参数。Nuomi 的 `text_task_runtime/workbuddy.py` 记录了大输出管道截断与“退出 0 但响应为空”的处理经验；不直接搬入其禁用 Skill 的产品限制。
6. API、Codex、WorkBuddy 统一使用“模型产生结构化动作，本地受控工具执行”的循环。Skills 在本地编译为每轮上下文；不要求把 Skill 安装进用户全局 Agent 配置。这样三种模式都能受同一计划限额控制。
7. 图片网关 URL、实际接口格式和 Token 尚未提供。可先实现逻辑端口与测试适配器；真实 HTTP 映射以用户接口文档为依据，不臆造 GRSai 直连接口。

## 跨计划共享规则

- 业务 ID 均为 UUID 字符串；资产版本和计划 revision 不可变。日期用 UTC ISO，显示按本地时区。
- 执行输出统一 `RunEvent`，持久化递增序号，断线从序号恢复。
- UI 不展示价格、金额、账单、充值促销，不返回供应商原始费用字段。
- 任务次数由事务预占，按输出槽位计数；未知远端状态不释放额度、不创建新请求。
- 数据源与主题无关；图像输出模块不得读取应用主题。
- 网关 Token 不发给 Agent 进程；只在可信本地网关适配器使用。
- 模型来源、Skills 版本、输入版本必须保留在产物记录，用户可检查。

## 规格覆盖矩阵

| 规格章节 | 对应任务 |
| --- | --- |
| 1 定位与部署 | F1、D3 |
| 2 商品与资产 | F2、F3、C3 |
| 3 无限画布与双入口 | C1–C4、A4 |
| 4 工作区与主题 | C1、C4、D3 |
| 5 Agent / Skills | A1–A4 |
| 6 全场景 | S1–S8 |
| 7 次数确认 | A3、A4、G2 |
| 8 网关 | G1–G4 |
| 9 模块与存储 | F1–F4，各子计划接口 |
| 10 Nuomi 复用 | F1、C2 |
| 11 恢复保护 | F3、F4、G2–G4、D3 |
| 12 验收 | 各任务验证、D3 |
| 13 来源 | A1、S1 |

## 文档与外部依据

- Electron：[隔离上下文](https://www.electronjs.org/docs/latest/tutorial/context-isolation)、[utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)、[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)。凭证 API 依锁定版本验证，不能混用不同版本签名。
- React Flow：[坐标转换](https://reactflow.dev/api-reference/types/react-flow-instance)、[画布操作](https://reactflow.dev/learn/concepts/the-viewport)。
- DeepSeek：[工具调用](https://api-docs.deepseek.com/guides/tool_calls/)。
- WorkBuddy：[无头运行](https://www.workbuddy.ai/docs/cli/headless)。以安装版本 help 和实际输出夹具验证。
- Sharp：[合成接口](https://sharp.pixelplumbing.com/api-composite/)。

## 完成边界

界面模拟通过、契约测试通过、真实供应商接入通过是三种不同证据。WorkBuddy、Codex、图片网关或任一必需场景未真实验收时，明确列出缺项，不称首版全部交付。无需为尚未发生的正常本地编辑重复征询许可；真实付费任务在产品和当前会话授权范围内执行。

## 计划自检

- 规格 1–13 节均已映射到任务；6 份子计划共 27 项任务，无重复任务 ID。
- 全部内部文档链接存在；每项任务列出目标文件、行为验证、实现边界和提交范围。
- 统一使用 AssetVersion、AssetRef、AgentDefinition、RunPlan、OutputSlot、RunEvent；所有出图场景最终进入同一 reserve/outbox 流程。
- 限制统一为张数／修正次数；主题统一为 studio/editorial；未增加账单、GRSai 直连或 C 主题。
- 外部依赖有明确取得与验收步骤：用户网关协议／Token、真实模型连接、字体与打包凭证。缺失项不阻止独立模块开发，但阻止对应的真实验收通过。
- 当前只完成计划文档，没有安装依赖或编写产品实现；文档中的测试命令是实施时执行的检查，不是已通过的测试。
