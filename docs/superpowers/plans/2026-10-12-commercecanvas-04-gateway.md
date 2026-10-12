# 图片网关与恢复实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务执行，用复选框跟踪。

**目标：** 接入用户封装的图片服务，可靠保存图片和任务，不展示计费，不因重试重复出图。

**架构：** 唯一 GatewayPort 隔离实际 HTTP 协议。A3 的事务 outbox 在调用前落盘，按幂等键找回任务，下载结果后才关联资产版本。

**技术栈：** TypeScript、fetch、SQLite、Sharp、Vitest、受控 HTTP 测试服务器。依赖 F1–F4、A3。

---

## G1 逻辑端口、服务契约与测试服务器

**创建：** `packages/contracts/src/gateway.ts`；`packages/runtime/src/gateway/client.ts`、`httpAdapter.ts`、`capabilities.ts`；`tests/fixtures/gateway/server.ts`；`tests/contract/gateway.test.ts`；`docs/integrations/image-gateway.md`。

- [ ] 确定客户端端口，无价格、余额金额或账单字段：

```ts
export interface ImageRequest {
  clientTaskId:string; idempotencyKey:string; model:string;
  prompt:string; inputs:AssetRef[]; count:number;
  parameters:Record<string,unknown>;
}
export interface RemoteTask {
  id:string; state:'queued'|'running'|'partial'|'succeeded'|'failed'|'cancelled';
  outputs:Array<{id:string;slotId:string;url:string;mime:string}>;
  failure?:Failure;
}
export interface GatewayPort {
  capabilities():Promise<{models:Array<{id:string;features:string[];maxInputs:number}>}>;
  submit(request:ImageRequest):Promise<RemoteTask>;
  findByKey(key:string):Promise<RemoteTask|null>;
  get(taskId:string):Promise<RemoteTask>;
  cancel(taskId:string):Promise<{supported:boolean;state:RemoteTask['state']}>;
}
```

- [ ] 测试服务器只用于 contract/E2E，以客户端 idempotencyKey 记录请求并控制行为：正常、断连接、重复响应、429、部分成功、取消不支持。写测试相同 key 两次提交只建立一个任务，不同任务不会误共用 key；不支持的 mask、多图、尺寸参数在提交前拒绝。
- [ ] 运行 `npm test -- tests/contract/gateway.test.ts` 确认失败，实现客户端请求／响应 Zod 校验及能力检查。实际 URL 路径、鉴权头、上传模式、参数映射、错误码、任务找回与取消映射必须从用户服务文档填写到 `image-gateway.md`，测试服务器协议不能自动成为真实服务协议。
- [ ] 获取真实网关契约前，可以交付 Port 与测试适配器；真实适配器必须保持“未配置”，不得退回 GRSai 直连。提供接入表单供用户填写 baseURL、Token 和模型，Token 交给 F4 安全存储。
- [ ] 运行指定测试与 typecheck。提交 `git add packages/contracts/src/gateway.ts packages/runtime/src/gateway tests/fixtures/gateway tests/contract/gateway.test.ts docs/integrations/image-gateway.md`，`git commit -m "feat: define controlled image gateway boundary"`。

## G2 上传、提交与未知状态恢复

**创建：** `packages/runtime/src/gateway/assetTransport.ts`、`dispatch.ts`、`reconcile.ts`；`packages/runtime/src/db/migrations/003-gateway.sql`；测试 `tests/contract/gateway-recovery.test.ts`。

- [ ] 定义 `AssetTransport.prepare(versionId)` 将本地图片、mask 转成服务支持的上传引用；以已解码 MIME 和尺寸校验，不把本地路径直接传给远端。上传失败不标记图片生成成功，不记录包含 Token 的签名 URL 日志。
- [ ] 构造“远端已创建任务，响应前断开”的测试；关闭本地 DB 重开，再执行 `reconcile(attemptId)`：必须调用 findByKey 而不是创建新 key。

```ts
expect(remote.createdTasks).toBe(1);
expect(localAttempt.state).toBe('unknown');
await reconciler.reconcile(localAttempt.id);
expect(remote.createdTasks).toBe(1);
expect(repository.getAttempt(localAttempt.id).remoteId).toBe(remote.tasks[0].id);
```

- [ ] 运行 `npm test -- tests/contract/gateway-recovery.test.ts` 确认失败。实现 outbox worker：领取持久化 attempt → 准备资产 → submit 固定 key → 落 remote ID。失败分为明确未受理、已受理和未知；仅网关明确保证未受理时才能按策略重新请求，不能用超时推断未受理。
- [ ] 对网关不支持按 key 查找的情况返回 `RECOVERY_NOT_SUPPORTED` 并暂停，保留已提交记录供核对；此状态不通过首版恢复验收。429 按 Retry-After 延后，同一任务保持 key；401 不重试，提示更新 Token。
- [ ] 测试 worker 崩溃后租约到期接管、重复完成事件去重、过期上传引用刷新但不改变生成 key。提交 `git add packages/runtime/src/gateway packages/runtime/src/db/migrations/003-gateway.sql tests/contract/gateway-recovery.test.ts`，`git commit -m "feat: recover image submissions by idempotency key"`。

## G3 产物归档、部分失败与远端取消

**创建：** `packages/runtime/src/gateway/results.ts`、`cancel.ts`；`packages/runtime/src/runs/outputRepository.ts`；测试 `tests/contract/gateway-results.test.ts`。

- [ ] 写测试远端成功但下载中断：任务不能出现可导出的虚假资产；重新下载不得重新生成。同一 output ID 被推送两次只创建一个 OutputVersion。
- [ ] 运行 `npm test -- tests/contract/gateway-results.test.ts` 确认失败。下载图片到临时文件，校验尺寸／MIME／hash，原子移动后写资产版本与 output 关联。链接过期通过查询任务刷新，不使用旧 URL 无限重试。
- [ ] 输出数量或 slotId 不符合请求时标记 `OUTPUT_CONTRACT_MISMATCH`，保留诊断，不随意把 SKU 图按随机顺序分配。单张请求可按唯一槽位归属；批量服务无可靠映射时分槽提交。
- [ ] 取消先阻止未提交 outbox；调用 remote cancel 返回不支持时显示远端仍在执行，不报告取消成功。远端结果到达后仍归档，用户可保留或丢弃。部分成功允许选择成功图片导出，只对失败槽位创建新的获批重跑。
- [ ] 测试 remote 成功与 cancel 竞态，确保最终不丢产物。提交 `git add packages/runtime/src/gateway packages/runtime/src/runs/outputRepository.ts tests/contract/gateway-results.test.ts`，`git commit -m "feat: archive image outputs and partial outcomes"`。

## G4 UI 接入、错误文案与真实验收

**创建：** `apps/desktop/src/renderer/settings/ImageGatewaySettings.tsx`；`packages/ui/src/RunError.tsx`；`tests/e2e/gateway-errors.spec.ts`；`docs/evidence/image-gateway.md`。

- [ ] 表单展示连接状态、模型列表和操作能力；不展示余额、价格、消费或账单。真实服务如果返回 billing 元数据，在 adapter 投影时剔除，不存入 RunEvent。
- [ ] 错误文案映射固定：`AUTH_FAILED` 更新 Token；`QUOTA_EXHAUSTED` 联系服务方或补充额度；`UNSUPPORTED_CAPABILITY` 更换模型或任务；`NETWORK_UNCERTAIN` 正在核对远端状态；`DOWNLOAD_FAILED` 重新获取结果。
- [ ] E2E 验证错误分类、修复入口、部分结果可用；检查任务面板 DOM 不含服务方原始金额字段。运行 `npm run test:e2e -- tests/e2e/gateway-errors.spec.ts`。
- [ ] 用获准的最小真实任务验证上传、提交、找回、下载以及幂等重放；保存脱敏 task ID、状态和文件元信息到 evidence，遮蔽 Token 和可复用下载签名。没有真实网关资料或调用授权时将证据标为未执行，并列出具体依赖，不将 fixture 测试视作通过。
- [ ] 提交 `git add apps/desktop/src/renderer/settings packages/ui/src/RunError.tsx tests/e2e/gateway-errors.spec.ts docs/evidence/image-gateway.md`，`git commit -m "feat: expose image service status without billing UI"`。
