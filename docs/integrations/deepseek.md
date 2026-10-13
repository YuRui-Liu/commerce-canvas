# DeepSeek 接入依据

核验日期：2026-10-13。仅文档核验，尚未使用真实凭证调用。

## 官方当前协议

- [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)：POST `/chat/completions`；当前模型枚举 `deepseek-flash`、`deepseek-v4-pro`。非流式基础路径使用 `response_format: {type: "json_object"}`；本地仍须校验业务 schema，并处理空内容、截断和非正常结束。不要把 Chat Completions 的 JSON object 与 Responses API 的 JSON schema 参数混用。
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode/)：提示中明确要求 JSON 并提供结构示例，设置合理输出上限。官方也说明可能返回空内容，因此 HTTP 200 不等于有效 Agent 决策。
- [Vision](https://api-docs.deepseek.com/guides/vision/)：`deepseek-flash` 支持图片，当前旧实验模型名已由最新 Flash 承接。Chat 路径优先使用 user 消息中的 `image_url` data URL；支持 JPEG/PNG/GIF/WebP。文档限制含 48 MiB 请求体、32 MiB 单张内联图、边长通常不超过 8192 px（15 张起为 4096 px）。不据此推断其他模型支持视觉。
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)：携带 tools 的多轮请求需要保留供应商要求的 `reasoning_content`。此页正文读取超时，官方检索摘要仍可核对该规则；实施原生 tool calling 前再次读取完整文档。基础方案可先使用无 tools 参数的结构化决策，由本地受控循环执行。

## 本产品决定

模型名称允许用户明确配置；能力来自已核验模型映射、探测或用户声明，未知模型不能默认获得视觉能力。图片只按本次任务获准引用发送，必要的降采样保留原图与衍生参数记录。JSON 通过本地校验后仍只是待执行决策，不能视为图片已完成。

GRSai 图片凭证不进入 DeepSeek 请求。设置不查询余额，不显示计费字段。网络错误与模型格式错误保持可区分，不把认证失败当作能力探测成功。
