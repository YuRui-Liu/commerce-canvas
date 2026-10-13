# GRSai 直接接入契约

核验日期：2026-10-13。状态：公开接口已核对；真实图生图调用成功，但请求 1024×1024 返回 1254×1254，精确尺寸验收不通过，详见 `docs/evidence/grsai.md`。

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

## 单次真实验证入口（2026-10-13）

实现了 G1 最小 `ImageProviderPort` 和主进程专用验证入口，尚不代表生产 G2/G3 调度、资产归档或 Agent 流程完成。当前支持 gpt-image-2 / vip 的保守参数子集；掩膜、透明背景、取消、上游幂等能力明确为未支持。普通参考图本地限制 4 张、单张字符串 20 MiB，属于客户端限制。

用户在正常桌面设置里保存凭证后，使用同一应用身份的最新打包可执行文件运行：

```sh
"/absolute/path/CommerceCanvas.app/Contents/MacOS/CommerceCanvas" --verify-grsai --verification-dir "/absolute/path/CommerceCanvas/data/grsai-verification-20261013"
```

入口不创建 BrowserWindow、utility process 或项目数据库，不启动渲染器，不关闭已打开的正常应用。主进程只解密 GRSai 凭证，直接连接官方国内节点。固定仅一次 gpt-image-2 / 1024x1024 / auto 请求，参考图为程序生成的 CC TEST 蓝瓶，通过 PNG data URL 发送；不使用用户素材。

私有目录保存 `journal.json`（恢复所需完整远端 ID/结果 URL，0600）、合成参考图、下载图片，以及不含原始 ID/URL/凭证的 `evidence.json`。提交前原子落盘并 fsync；并发入口使用排他锁。存在 submitting 且无 ID 时拒绝重新提交；有 ID 时只查询。查询最多 15 分钟，正常超时释放锁，可用**同一目录和同一命令**恢复。下载失败只重新下载。验收要求图片完整解码、PNG/JPEG/WebP、1024×1024、最多 50 MiB，并记录 SHA-256。标准输出仅含脱敏结果与本地路径。

若进程被强杀留下 `verification.lock`，入口返回 VERIFICATION_LOCKED。先读取锁内 PID，并由操作人员确认该验证进程已退出，再仅移除该目录的锁文件，保持 `journal.json` 原样后重跑。同 PID 被系统复用时须核对命令；不能盲删锁、删除 journal 或换新目录来绕过未知提交保护。出现无 ID 的未知提交须人工检查供应商任务，不自动重试。

契约测试使用显式注入的本地 HTTP fixture；验证器测试使用显式依赖注入。生产入口没有模拟成功回退，也不会输出服务端原始错误、计费或余额字段。真实供应商调用由主任务在审查后执行，本次实现提交本身未发起真实调用。
