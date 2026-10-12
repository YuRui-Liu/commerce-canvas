# Agent 与任务编排实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务执行，用复选框跟踪。

**目标：** 支持自定义 LLM + Skills、DeepSeek／Codex／WorkBuddy，以及受确认次数约束的统一执行。

**架构：** 各模型适配器只返回结构化决策，runtime 校验后执行命名工具。画布与聊天共享 RunPlan 和事件，模型不能直接持有图片网关凭证或绕过生成限制。

**技术栈：** TypeScript、Zod、fetch、child_process、SQLite 事务、Vitest。依赖 F1–F4、C1–C4；真实图片交付由 G1–G4 接续。

---

## A1 Agent 定义、Skills 与能力

**创建：** `packages/contracts/src/agents.ts`；`packages/runtime/src/agents/registry.ts`、`skillLoader.ts`、`skillCompiler.ts`；`apps/desktop/src/renderer/agents/AgentEditor.tsx`、`SkillLibrary.tsx`；测试 `packages/runtime/test/skills.test.ts`。

- [ ] 固定定义：

```ts
export interface AgentDefinition {
  id:string; version:number; name:string; instruction:string;
  runtime:RuntimeKind; model:string; credentialId?:string;
  skillIds:string[]; allowedTools:string[]; defaultRepairs:number;
}
export interface SkillDefinition {
  id:string; version:string; name:string; instructions:string;
  source:string; license:string; requiredRoles:InputRole[];
  requiredCapabilities:string[]; outputSchema:Record<string,unknown>;
}
export interface AgentDecision {
  message:string;
  actions:Array<{id:string;tool:string;arguments:Record<string,unknown>}>;
}
```

- [ ] 测试 Skill 相对引用不得跳出选定目录；重复 ID＋版本但内容不同拒绝；更新 Agent 后既有任务快照 hash 不变。外部 Skill 里的“执行 shell”不扩大 allowedTools。
- [ ] 运行 `npm test -- packages/runtime/test/skills.test.ts` 确认失败，再实现清单校验、文件大小上限、版本 hash 与来源保留。`compileSkills(skills, facts, bindings)` 生成明确区分指令和不可信素材的上下文，并检查 requiredRoles 与 requiredCapabilities。
- [ ] AgentEditor 支持复制预设、修改运行方式／模型／Skills、查看所需输入与能力；实例编辑默认仅保存任务参数，另存为 Agent 是独立操作。模型能力以探测或用户配置显式声明，不能默认 DeepSeek 可看图。
- [ ] 检查 UI 输入与版本测试；提交 `git add packages/contracts/src/agents.ts packages/runtime/src/agents apps/desktop/src/renderer/agents packages/runtime/test/skills.test.ts`，`git commit -m "feat: version agent definitions and skill inputs"`。

## A2 三种运行适配器与受控工具循环

**创建：** `packages/runtime/src/agents/adapter.ts`、`deepseek.ts`、`codex.ts`、`workbuddy.ts`、`processRunner.ts`、`toolLoop.ts`、`tools.ts`；测试 `tests/contract/deepseek.test.ts`、`codex.test.ts`、`workbuddy.test.ts`、`tool-loop.test.ts`；夹具 `tests/fixtures/agents/`。

- [ ] 统一端口，函数返回的是决策，不是虚构已完成图片：

```ts
export interface AgentAdapter {
  probe():Promise<{available:boolean;capabilities:string[];reason?:string}>;
  decide(request:{prompt:string;images:AssetVersion[];signal:AbortSignal}):Promise<AgentDecision>;
}
```

- [ ] 构造明确夹具：有效 JSON、未知 action、格式错、超时、退出非零、退出 0 空结果、超过 64 KiB 输出。工具循环测试未知工具和未批准的 `image.generate` 不执行；action ID 重放不产生第二次副作用。运行 `npm test -- tests/contract/tool-loop.test.ts tests/contract/codex.test.ts tests/contract/workbuddy.test.ts tests/contract/deepseek.test.ts` 确认失败。
- [ ] DeepSeek 通过用户模型与 API 地址调用；支持非流式结构化 JSON 决策作为基础路径，用 Zod 校验。若接入工具调用模式，保留供应商所需 message 字段和 tool_call_id，不能截断 reasoning_content 导致后续轮次失败。协议解析失败返回 `AGENT_OUTPUT_INVALID`，不生成图片。
- [ ] Codex 检查真实 `exec --help` 的参数与 feature 支持；无 shell 拼接，spawn 使用 argv 数组和 stdin。每次结构化决策在隔离临时工作目录运行，使用 `--ephemeral --ignore-user-config --ignore-rules --sandbox read-only --skip-git-repo-check --color never --output-schema <schema> --output-last-message <output> -`。按当前版本禁用 shell、apps、plugins、MCP 等非授权执行入口；验证禁用有效才启用此适配器，不使用 bypass 标志。
- [ ] WorkBuddy 优先检测用户明确配置的路径，其次 `workbuddy/codebuddy`，再检测应用内置 CLI；不得误用 `buddy` 编辑器启动器。当前核实的 argv 基础为：

```ts
const args = ['--print','--output-format','json','--tools','',
  '--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
  '--setting-sources','user','--max-turns','3','--model',model];
```

- [ ] WorkBuddy 带图时按能力改为 stream-json 输入输出。禁用工具后不依赖其可能使用内部工具的 json-schema 模式；提示输出 schema 并由本地 Zod 验证。stdout 定向临时文件避免管道截断；读取严格有大小限制；处理 stderr 非空但退出 0 的失败结果。Nuomi `_json_payload` 仅作参考，字符串内花括号不能用简单倒序计数解析。
- [ ] `processRunner` 限制超时与输出大小，退出/取消终止整棵已启动子进程；不给进程图片网关 Token，工作目录只提供获准资产和编译后的 Skill 内容。工具循环最大轮数默认 12，可按任务配置降低；耗尽返回 `AGENT_STEP_LIMIT`，保留历史。
- [ ] 在 settings 增加“不出图连接验证”，真实运行三种 adapter 各返回简单 JSON，记录脱敏版本与结果到 `docs/evidence/agent-adapters.md`。真实模型调用的账号授权需有效；未获准或不可用记录阻塞，不伪造结果。
- [ ] 运行全部指定契约测试、typecheck，提交 `git add packages/runtime/src/agents tests/contract tests/fixtures/agents docs/evidence/agent-adapters.md`，`git commit -m "feat: unify API and local agent decisions"`。

## A3 计划、批准与次数事务

**创建：** `packages/contracts/src/runs.ts`；`packages/runtime/src/db/migrations/002-runs.sql`；`packages/runtime/src/runs/plans.ts`、`limits.ts`、`events.ts`、`scheduler.ts`；测试 `packages/runtime/test/run-limits.test.ts`、`run-revisions.test.ts`。

- [ ] 定义输出槽位与修正次数；批量任务拆成槽位后再合并供应商请求。

```ts
export interface OutputSlot { id:string; nodeId:string; maxRepairs:number }
export interface RunPlan {
  id:string; revision:number; projectId:string; inputs:AssetRef[];
  slots:OutputSlot[]; agentSnapshots:AgentDefinition[]; approvedRevision:number|null;
}
export type RunStatus = 'draft'|'awaiting_confirmation'|'queued'|'running'|'checking'|
  'repairing'|'partial'|'succeeded'|'failed'|'needs_input'|'cancelling'|'cancelled'|'unknown';
export interface RunEvent {runId:string;seq:number;type:string;payload:Record<string,unknown>;createdAt:string}
```

- [ ] 实际 SQLite 并发测试：两个 worker 同时预占同一槽位只能一个成功；2 个槽位每个修正 1 次总计最多 4 次出图；相同 idempotencyKey 重复预占返回同一个 attempt；计划 revision 变更使旧批准失效。

```ts
const outcomes = await Promise.allSettled([
  reserve({runId,slotId:'hero',round:0,key:'request-a'}),
  reserve({runId,slotId:'hero',round:0,key:'request-b'}),
]);
expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
```

- [ ] 运行 `npm test -- packages/runtime/test/run-limits.test.ts packages/runtime/test/run-revisions.test.ts`。实现 `reserve` 在 BEGIN IMMEDIATE 内验证 approvedRevision、槽位与 round 范围、唯一 `(run_id,slot_id,round)`；插入 attempt 和 outbox 同一事务，提交后才可调用网关。调用不明时保留预占，不自动释放。
- [ ] 调度器按 DAG 可运行节点启动，生成失败保留同组成功产物，阻塞依赖失败节点，允许用户仅重试失败项。输入改变创建新 revision，旧 Run 继续使用快照；新旧产物均可追溯。
- [ ] `events.append` 与状态更新同事务，`events.listAfter(runId,seq)` 可重放，renderer 按 seq 去重。不以聊天文字推断状态。
- [ ] 通过测试后提交 `git add packages/contracts/src/runs.ts packages/runtime/src/runs packages/runtime/src/db/migrations/002-runs.sql packages/runtime/test/run-*.test.ts`，`git commit -m "feat: enforce approved output slots atomically"`。

## A4 总控、任务节点和用户确认

**创建：** `packages/runtime/src/agents/planner.ts`；`apps/desktop/src/renderer/runs/PlanReview.tsx`、`RunProgress.tsx`、`RunHistory.tsx`；修改 ConversationPanel、AgentNode 和桥接；测试 `tests/e2e/agent-run.spec.ts`。

- [ ] E2E 先验证：用户选择素材并发送目标，显示方案而不出图；确认后才执行；追加张数要求新确认；切换节点不改变任务输入；重启恢复同一 Run 的进度。

```ts
await page.getByRole('button',{name:'发送'}).click();
await expect(page.getByRole('dialog',{name:'确认制作方案'})).toBeVisible();
await expect(page.getByText('等待确认')).toBeVisible();
await page.getByRole('button',{name:'确认并制作'}).click();
await expect(page.getByTestId('run-status')).toHaveText('制作中');
```

- [ ] 运行 `npm run test:e2e -- tests/e2e/agent-run.spec.ts` 确认失败。Planner 将用户目标转为 schema 约束的 slots、required inputs 和依赖；无法识别商品事实时使用 needs_input，不补造参数。确认页展示张数与每张修正次数，含批量 SKU 合计，不展示费用。
- [ ] 引用输入、Agent 版本和计划 revision 展示在任务详情。AgentNode 显示当前状态、成功／失败张数、停止原因和单独重跑。状态从事件同步，重跑创建新的计划批准而非重写历史。
- [ ] 复用 C4 右侧对话／检查器状态；任务完成后新增产物节点并连线，不覆盖原始节点。由 G3 完成下载后才显示可导出。
- [ ] 运行指定 E2E；无真实网关时只在显式测试模式使用假适配器，生产 UI 明确未连接。提交 `git add packages/runtime/src/agents/planner.ts apps/desktop/src/renderer/runs apps/desktop/src/renderer/workspace packages/canvas/src/nodes/AgentNode.tsx packages/contracts/src/bridge.ts tests/e2e/agent-run.spec.ts`，`git commit -m "feat: coordinate chat and canvas runs"`。
