# GRSai 直接接入契约

核验日期：2026-10-12。状态：公开接口已核对，尚未使用用户凭证真实出图。

来源为 [GRSai 公告](https://grsai.ai/zh/dashboard/announcements) 链接的 [生成接口](https://qmy27nhsd9.apifox.cn/452409160e0) 及其 [OpenAPI 文本](https://qmy27nhsd9.apifox.cn/452409160e0.md)，[查询接口](https://qmy27nhsd9.apifox.cn/452409577e0)。公告关联的 [ComfyUI 客户端](https://github.com/31702160136/ComfyUI-GrsAI/blob/main/api_client.py) 可交叉核对。

## 协议

- 官方节点：https://grsaiapi.com（全球），https://grsai.dakka.com.cn（国内）。不引入自有中转服务。
- Authorization: Bearer API_KEY；Content-Type: application/json。
- POST /v1/api/generate：model、prompt 必填；images 支持 base64 或 URL；aspectRatio、quality、replyType，后者使用 async。
- GET /v1/api/result?id=REMOTE_ID：按远端 ID 查询。
- 返回 id、status、可选 progress（0–100）、results[].url、error。running 为执行中，succeeded 为成功，failed/violation 为失败。
- HTTP 400 也可能返回任务 ID：应保存 ID，再分类错误，不可笼统视为未受理。

## 模型差异

gpt-image-2 默认 quality=auto，可使用比例或 1K 像素规格。vip 使用像素尺寸、quality=medium；透明背景在文档中仅列于 vip/2.5-flare/2.5-sunburst。高级能力须按模型校验。

mask 文档仅示例 HTTPS PNG 地址，未明确本地 base64 掩膜支持或掩膜方向；真实验收前不能声明已支持。普通 images 的 base64 支持已明确，传输包装需实际验证。参考图数量和大小上限文档未明确，客户端限制应标作本地限制。

## 本地可靠性约束

本地 attempt/slot/round 唯一约束防重复调度，不能冒充上游幂等能力。提交前落盘 submitting；有 ID 只恢复查询，断线无 ID 保留 unknown，不自动重发。未查到幂等 key 查询或取消接口，不实现虚构路径。取消只停止未提交队列，已在远端执行的继续回收结果。

每槽位单独提交。下载校验后保存不可变资产；下载失败只重试下载。API Key 经系统加密保存，不进入模型提示词、渲染器查询返回或日志。没有价格、余额、账单数据模型。

## 实际验收待办

配置用户 API Key 后验证 base64 图片、异步 ID、查询、下载，以及各模型局部编辑能力。契约 fixture 不替代真实供应商验收。真实结果记录在 docs/evidence/grsai.md。
