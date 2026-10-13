# 画布出图节点实现计划

> **面向 AI 代理的工作者：** 使用 subagent-driven-development，每任务单个实现者，随后规格审查和质量审查。用户已选择该执行方式，无需重复询问。

**目标：** 将可持久化的 Nuomi 式参数节点接入真实 GRSai，完成摄影配置、确认生成、恢复查询、输出回填和精确尺寸派生。

**架构：** contracts 定义摄影配置及不可变计划，utility 中 SQLite 保存计划/槽位/产物；主进程解析凭证并执行直连 HTTP。画布只通过固定桥接创建/确认计划和读取状态，摄影参数编入提示词，尺寸进入供应商字段。

**技术栈：** Electron、React Flow、Zod、node:sqlite、Sharp、Vitest、Playwright。目录为当前 implementation worktree。不得改动 Nuomi 源码；继续双主题及隐藏自动测试。

---

## 文件边界与顺序

1. N1：`packages/contracts/src/imageGeneration.ts`；`packages/runtime/src/imageGeneration/{settings,prompt,repository}.ts`；迁移 `005-image-generation.sql`；修改 canvas schema、DB 迁移与 run 引用检查。测试 `packages/runtime/test/imageGeneration.test.ts`。
2. N2：`apps/desktop/src/main/imageGeneration.ts`（协调器及生命周期）；`packages/runtime/src/imageGeneration/{results,adapt}.ts`；修改主进程固定桥接、utility service、contracts/bridge、AssetService 的幂等产物导入。测试 `tests/contract/image-generation-execution.test.ts`、`packages/runtime/test/imageGenerationResults.test.ts`。
3. N3：`packages/canvas/src/nodes/ImageGenerationNode.tsx`；`apps/desktop/src/renderer/generation/{GenerationControls,PhotographyDialog,GenerationReview,GenerationInspector,useGenerationRuns}.tsx/ts`；修改 Canvas、CanvasRegion、Workspace 接入点与节点样式。测试 `apps/desktop/tests/image-generation.spec.ts`。
4. N4：父任务执行新包完整回归与一次真实画布操作、图像核验，记录 `docs/evidence/canvas-image-generation.md`。不批量调用真实服务来代替契约测试。

## N1：配置、提示词与事务计划

- [ ] 先写测试并观察失败：1K/2K/4K 模型组合、VIP 像素约束、自动摄影参数不注入虚构值、外部文本不变执行权限、同一确认两次只能创建一组槽位、输入/config/facts 改变拒绝旧确认、跨项目资产引用拒绝、重开 DB 后 submitting 无 ID 进入 unknown。

```ts
const plan = repository.prepare({ projectId, canvasId, nodeId });
expect(repository.confirm(projectId, plan.id).slots).toHaveLength(2);
expect(repository.confirm(projectId, plan.id).slots).toHaveLength(2);
expect(repository.claim(plan.id, 0)).toBeTruthy();
expect(repository.claim(plan.id, 0)).toBeNull();
```

- [ ] 定义严格 schema：

```ts
type GenerationSettings = {
  prompt: string; model: 'gpt-image-2' | 'gpt-image-2-vip';
  ratio: '1:1'|'3:4'|'4:3'|'2:3'|'3:2'|'9:16'|'16:9';
  resolution: '1K'|'2K'|'4K'|'custom'; width?: number; height?: number;
  count: number; photography: PhotographySettings;
};
type PhotographySettings = {
  lighting: string; direction: string; softness: string; temperature: string;
  shadow: string; camera: string; lens: string; focalLength: number|null;
  aperture: string; angle: string; framing: string;
};
type SlotStatus = 'queued'|'submitting'|'running'|'downloading'|'succeeded'|'failed'|'unknown'|'cancelled';
```

摄影字段用明确枚举或限制长度的自定义描述，不能接受任意执行参数。count 1–4，自动修正固定 0。导出 defaults、预设表、解析目标宽高及提示编译函数。模型原生映射复用 G1 whitelist；补足合法的比例像素预设，不伪装支持不存在的选项。

- [ ] CanvasNode 新增 `kind='generation'` 和可选 `generation` 配置；输出沿用 output kind。配置持久化不改变普通节点行为，旧文档无需迁移 JSON。此节点不得使用尚未实现的 agentDefinitionId。
- [ ] `resolveGenerationSettings` 返回 `{model, quality, width, height, aspectRatio}`；1K 普通模型支持的固定像素表以官方文档为准。VIP 方图 1024/2048/2880，16:9 为 1280×720/2048×1152/3840×2160，其他比例用已核实且通过像素约束的值。普通模型 2K/4K/custom 提交前拒绝。
- [ ] `compileGenerationPrompt(settings, facts, bindings)` 分离用户要求、已知商品事实、角色输入、摄影要求。自动值不追加描述，预设转换是可查看的文字要求；不添加 GRSai 未支持的 JSON 字段。图片 roles 与顺序明确，文本角色使用实际文本内容，不把本地路径当远端地址。
- [ ] 005 迁移创建 image_runs / image_slots。runs 保存 project/canvas/node、settings/input/facts/request 快照、contextHash、approved 状态、stopRequested；slots 主键 `(run_id,slot_index)`，包括本地 attempt UUID、预分配 outputAssetId/outputVersionId、remoteId、状态/error/progress、输出引用与实际尺寸。输入引用写入 asset_references(kind=run)，不得因切画布或删除节点而删除任务。
- [ ] `prepare` 从已保存画布读取节点、直接输入连接与真实资产，拒绝未落地的输入节点；快照哈希只含影响生成的内容，不因单纯移动节点失效。`confirm` BEGIN IMMEDIATE 内校验当前 contextHash，创建唯一槽位并预占，重复同一确认返回原记录。`claim` queued→submitting 条件更新，先持久化才允许 POST；恢复时 submitting/noID→unknown，knownID 只可查询。
- [ ] 添加 stop/get/list/state transition/output reference 方法；停止只取消 queued；active 输入引用覆盖 queued/submitting/running/downloading/unknown，terminal 释放 active 标记但保留历史来源。CanvasRepository 接受同项目真实 image_runs 引用，不放开任意 runId。
- [ ] 运行 `npm test -- packages/runtime/test/imageGeneration.test.ts`、`npm run typecheck`，审查后提交 N1。

## N2：执行、归档与桥接

- [ ] 先写显式 fake provider 契约测试（生产不会选择 fake）：已受理后断线无 ID，不重复 POST；已知 ID 重启只 GET；四槽位部分成功保留；stop 在 claim 前/后语义；下载失败仅下载重试；缺凭证不访问网络；返回 ID 错配拒绝。

```ts
await runner.resume();
expect(provider.submitCalls).toBe(1);
expect(repository.get(projectId, runId).slots[0].status).toBe('unknown');
await runner.resume();
expect(provider.submitCalls).toBe(1);
```

- [ ] 增加 renderer 固定桥接 `prepareImageGeneration({projectId,canvasId,nodeId})`、`confirmImageGeneration({projectId,runId})`、`listImageGenerations({projectId,canvasId})`、`stopImageGeneration({projectId,runId})`、`resumeImageGeneration({projectId,runId})`、`bindImageGenerationTask({projectId,runId,slotIndex,remoteId})`、`adaptImageGenerationOutput({projectId,runId,slotIndex,fit,background})`。所有 schema 严格且 sender 校验复用现有规则。内部存储/读取字节/状态转换 RPC 不作为 renderer 可调用方法暴露。
- [ ] 主进程执行器只在已批准 plan 的 queued 槽位运行；CredentialStore 解析 GRSai Key，不返回 renderer。输入版本经 utility 读取，验证 PNG/JPEG/WebP、大小/像素上限后转 data URL。成功 claim 后一次 POST，拿 ID 立即落盘。G1 `get(id)` 核验响应 ID。无 ID 错误保留 unknown，不自动换节点地址或模型重发。
- [ ] 独立循环查询已知 ID；单进程使用 per-slot in-flight 去重，持久化 claim 再次防重。超时可以暂停查询后显式恢复，不释放生成次数。启动恢复从 DB 枚举未终止任务。关闭可停止本地轮询并保留 DB，不能将已提交任务取消为未发生。
- [ ] 手动绑定仅适用于 unknown/noID，先查询实际远端 ID 验证格式/存在/状态，再存绑定；UI 要求用户确认这就是自己的任务。不能凭 provider ID 推断输入一致，文案不做该保证。
- [ ] 下载绝不带 Authorization，HTTPS、限制跳转/私网目的地址、大小/超时、真实解码，记录 hash/实际尺寸。尺寸不符保留可用原图并显示警告，不重发。上游无结果 succeeded 和超出张数拒绝虚假成功。
- [ ] 使用 slots 预分配 outputAssetId/outputVersionId 幂等导入：已存在同项目同 hash/version 则重用，不同内容拒绝。先写内容寻址文件，再事务保存资产/引用，任务完成重试不产生多份元数据。记录输出与 slot 的一对一来源；复用缩略图生成及安全资源协议。
- [ ] `adapt` 用 Sharp 从已归档原始版本创建派生版本：精确计划 width/height；fit contain 默认、cover 可选，背景由用户给定，保留原图。PNG 输出完整解码、sRGB；保存来源、目标、fit/background 与 hash，重复相同适配复用结果；不声称上采样增加细节。关联版本可用于新输出节点。
- [ ] 测试原图 hash 不变、目标宽高、contain/cover 明显不同、重复恢复不产生重复槽位或产物、项目切换/节点删除不污染其他项目。运行 N2 指定测试和 typecheck，独立双审后提交。

## N3：Nuomi 式节点与结果回填

- [ ] UI Designer 实现单个任务，沿用现有主题变量和可访问组件，不新增相冲突色板。把 Canvas 内的 generation card 抽到专用文件，既有 Card 保持素材用途，不将所有摄影逻辑堆进 Canvas/Workspace。
- [ ] 工具栏添加“添加出图节点”。节点含提示词、输入缩略图、状态、模型/比例/分辨率/摄影/灯光/张数 chips 与生成按钮。摄影弹层 draft/apply/cancel/reset；相机、镜头、焦距、光圈、机位、景别和灯光细调完整可选。三个电商预设不覆盖原始用户提示。自定义机身描述不冒充实际 EXIF。
- [ ] 右侧 generation inspector 与素材 inspector 分流，展示相同配置、最终编译提示词、历史任务参数、逐槽位进度/失败及实际尺寸。缺 Key 提供现有设置入口，设置文案删除 GRSai“执行尚未接入”，DeepSeek 未接入状态保持真实。
- [ ] 点生成先 flush 图配置再 prepare；打开确认对话框，未确认不 submit。确认按钮同步 pending 防双点；服务端重复确认也幂等。运行参数变化不改任务快照；再次出图需要新 plan/确认。
- [ ] 状态读取限定 project/canvas，切换时取消旧订阅/忽略过期响应；不使用消息文字推断任务状态。完成槽位用确定性输出 node/edge ID 幂等插入当前画布、连接源 generation node；原节点已删则只保留素材/历史，主动恢复不会复活已删除节点。已插入后用户删除输出节点也不反复自动添加。
- [ ] 尺寸不符明确警告；“适配为目标尺寸”选择 contain/cover/background，生成派生输出节点，原始输出保留。图片查看、拖动、分组、复制、撤销及原有角色连线兼容。
- [ ] 新增隐藏 E2E：所有参数可操作和保存重开；输入不会拖动/删除节点；弹层不出屏，Esc 回焦；确认前零 POST/双确认一次；既有成功项不被失败覆盖；unknown 不自动重试；输出来源/尺寸适配。fixture 只在测试进程显式注入主进程 provider，生产 UI 无假结果。
- [ ] A/B、1440/1024 截图并实际查看；原生窗口保持隐藏。运行 `npm run test:e2e -- image-generation.spec.ts`、typecheck 及相关单测，双审后提交。

## N4：整体验收与交付

- [ ] 全量 unit/typecheck，构建独立新包，执行所有隐藏 Electron E2E。失败按根因修复，不靠删除断言或无意义 sleep。
- [ ] 用户已授权真实验证：使用实际画布入口、新的测试商品项目和本地合成参考图，选择 1 张、gpt-image-2 1K、明确摄影参数，经确认生成一次。不重用旧 journal 伪装画布端到端通过；不修改用户现有项目。
- [ ] 查看实际原始结果与本地适配输出，记录脱敏 ID 指纹、原图/派生 hash、请求/实际/适配尺寸、时间与构建 commit。真实视觉结果和模型执行精度单独说明。
- [ ] 更新实施进度和新证据；用户需要时打开新包供使用，不改旧包路径/不关闭用户原窗口，交付说明如何添加出图节点。
