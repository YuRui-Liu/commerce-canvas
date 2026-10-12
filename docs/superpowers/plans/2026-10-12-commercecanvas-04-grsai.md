# GRSai 直连与恢复实现计划

> 使用 subagent-driven-development 逐任务实现、测试与审查。

**目标：** 客户端直接接入 GRSai；无自建中转站、Token 包装、号池或计费模块。UI 无价格、余额和账单。
**架构：** 本地 ImageProviderPort 封装 HTTP 协议。调用前 SQLite outbox 落盘；已有远端 ID 时恢复查询，无 ID 的不确定提交暂停，绝不自动重新生成。

## G1 直接接入契约与测试服务器

**创建：** `packages/contracts/src/imageProvider.ts`；`packages/runtime/src/providers/grsai/client.ts`、`capabilities.ts`；`tests/fixtures/grsai/server.ts`；`tests/contract/grsai.test.ts`；`docs/integrations/grsai.md`。

- [ ] ImageProviderPort 提供 submit/get 与明确的能力描述；不假设上游支持 findByKey、幂等请求、取消或模型发现。参数白名单校验，不支持的参数提交前拒绝。
- [ ] 固定统一异步协议：Bearer API Key；POST /v1/api/generate，replyType=async；GET /v1/api/result?id=...。映射 model/prompt/images/aspectRatio/quality 与 status/progress/results[].url。参考 GRSai 官方资料及其公告关联的 ComfyUI-GrsAI 客户端，记录核验日期与来源。不得混用旧 draw/result 协议。
- [ ] 配置仅 GRSai 官方 API 地址、API Key 和模型；凭证由 F4 安全存储。无配置保持未连接，不能退回模拟生成。
- [ ] 写契约测试：正常、401、429、断连接、非法响应、未知状态和无结果成功；脱敏日志，不把 billing 数据存入事件。测试服务器只在显式测试模式使用。
- [ ] 运行上述测试、typecheck，提交 G1。

## G2 图片传输、提交与未知状态恢复

**创建：** `packages/runtime/src/providers/grsai/assetTransport.ts`、`dispatch.ts`、`reconcile.ts`；`packages/runtime/src/db/migrations/003-grsai.sql`；`tests/contract/grsai-recovery.test.ts`。

- [ ] AssetTransport 校验解码 MIME、尺寸、大小，仅使用已验证的 GRSai 图片格式；不能把本地路径当作远端 URL，不添加自有托管服务。
- [ ] outbox worker 在事务中领取 attempt，准备图片，再标记 submitting 并提交；成功立即保存远端 ID。已开始提交的租约过期不能重新 submit。
- [ ] RED 测试远端创建后断线且未返回 ID：关闭并重开 DB 后 reconcile 仍为 unknown，remote.createdTasks 保持 1。UI 显示需核对 GRSai 任务，可手动绑定经查询确认的远端 ID；绝不凭空声称可按本地 key 找回。
- [ ] RED 测试已持久化 ID 的重启：只调用 GET 查询；轮询超时不会触发重新生成。明确未提交的本地校验失败可重试；401 停止；429 仅在协议明确未受理时延后提交，未知是否受理一律暂停。
- [ ] 本地唯一 attempt/slot/round 约束防并发重复；未知状态保留次数预占。通过测试后提交 G2。

## G3 归档、部分失败与取消

**创建：** `packages/runtime/src/providers/grsai/results.ts`、`cancel.ts`；`packages/runtime/src/runs/outputRepository.ts`；`tests/contract/grsai-results.test.ts`。

- [ ] 先写下载中断、重复结果、错误尺寸和过期 URL 测试。下载临时文件校验 MIME/尺寸/hash 后原子落盘，创建不可变版本；下载重试不能重新出图。
- [ ] 每个槽位单独提交并用远端 ID 映射结果，禁止靠不可靠批量返回顺序映射 SKU。结果数量不符保留诊断，不显示虚假完成。
- [ ] 取消停止未提交队列；没有已验证远端取消 API 时明确远端仍在运行，继续回收产物。成功槽位可导出；失败项新出图需新批准。
- [ ] 测试取消与完成竞态、恢复归档去重，通过后提交 G3。

## G4 接入 UI 与真实验收

**创建：** `apps/desktop/src/renderer/settings/GrsaiSettings.tsx`；`packages/ui/src/RunError.tsx`；`tests/e2e/grsai-errors.spec.ts`；`docs/evidence/grsai.md`。

- [ ] 设置页标明直接连接 GRSai，API Key 密码输入及保存状态、模型与能力；无价格、余额、消费或账单。不虚构无凭证时的连接成功。
- [ ] 分类显示鉴权失败、额度不足、参数不支持、网络不确定、下载失败；缺 ID 的未知状态文案为“提交状态待核对，请到 GRSai 确认任务”，不显示正在自动找回。
- [ ] E2E 验证错误入口、部分成果、未知状态暂停以及不出现收费字段。真实服务返回 billing 信息仅在适配层丢弃。
- [ ] 获准且凭证已配置后，用最小真实任务验证输入传输、提交、查询和下载。记录脱敏任务 ID、输出 hash、环境与版本。不得为验证假设不存在的幂等重放接口。没有凭证则标记真实出图未验证，fixture 不替代。
- [ ] 提交 G4。
