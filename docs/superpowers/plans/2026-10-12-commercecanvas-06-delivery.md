# 检查、导出与桌面交付实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务执行，用复选框跟踪。

**目标：** 让产物可检查、有限返修、正确导出，并以真实证据完成桌面首版验收。

**架构：** 检查结果以结构化问题关联产物版本，返修仍走获批 Run 的次数约束；导出消费不可变资产版本及文字层。桌面包不包含示例密钥、测试网关或浏览器原型服务器。

**技术栈：** TypeScript、Sharp、授权中文字体、结构化视觉适配器、SQLite backup、Electron 打包工具、Vitest、Playwright。

---

依赖 F、C、A、G、S 全部计划；每个文件路径相对项目根。

## D1 检查结果与局部返修

**创建：** `packages/contracts/src/quality.ts`；`packages/runtime/src/quality/checks.ts`、`ocr.ts`、`vision.ts`、`repair.ts`；`apps/desktop/src/renderer/quality/IssuePanel.tsx`；测试 `packages/runtime/test/quality.test.ts`、`repair.test.ts`；`tests/e2e/quality.spec.ts`。

- [ ] 检查不能只返回笼统 pass/fail，定义带版本和区域的结果：

```ts
export interface InspectionIssue {
  id:string; outputVersionId:string; check:string;
  status:'pass'|'fail'|'unverified'; severity:'blocking'|'review';
  region?:Region; expected:string; observed:string; evidence:string[];
}
```

- [ ] 写测试：OCR 检出包装“30 ml”变“50 ml”为 fail；视觉工具不可用为 unverified，不能是 pass；旧版本的问题不能在新版本标成已修复；修正次数耗尽不能提交新生成。

```ts
expect(compareExactCopy(['30 ml'], ['50 ml']).status).toBe('fail');
expect(checkAvailability(false)).toEqual({status:'unverified',reason:'VISION_NOT_CONFIGURED'});
```

- [ ] 运行 `npm test -- packages/runtime/test/quality.test.ts packages/runtime/test/repair.test.ts` 确认失败。实现 compareExactCopy（允许规范化空白，数字和品牌不能模糊匹配），检查尺寸／格式用确定性工具，材质／形状／人体关系用配置的视觉 adapter，明确保留不确定结果。
- [ ] OCR 工具定义 `recognize(assetVersionId): {text,region,confidence}[]`，返回 sourceVersion；候选实现使用可本地运行 OCR 或有权限的视觉适配器，必须验证中文包装小字和许可证。未识别不当成空白通过；用户可修订源文后重新检查。
- [ ] repair 从具体 issue region 创建局部修改参数，保留其他保护区域，调用 A3 reserve 的对应 slot 下一 round。失败保持原版本；成功创建新版本、重新检查并等待选用。自动检查耗时单独展示，不能无限自我返修。
- [ ] IssuePanel 在图片上标问题区域，点击定位；显示“待人工核验”“建议修改”等明确状态。仅剩 review 项时允许人工确认并记录原因；未核验的尺寸／结构依据必须补资料，不能自动放行称真实。
- [ ] 运行 `npm run test:e2e -- tests/e2e/quality.spec.ts`，验证单区域返修、对比、用尽次数后的确认流程。提交 `git add packages/contracts/src/quality.ts packages/runtime/src/quality apps/desktop/src/renderer/quality packages/runtime/test/quality.test.ts packages/runtime/test/repair.test.ts tests/e2e/quality.spec.ts`，`git commit -m "feat: inspect and repair versioned product artwork"`。

## D2 图像、文字层、套图与长图导出

**创建：** `packages/runtime/src/exports/images.ts`、`text.ts`、`detailPage.ts`、`bundle.ts`、`manifest.ts`；`apps/desktop/src/renderer/exports/ExportDialog.tsx`；`tests/fixtures/fonts/`（许可与字体或生成引用）；测试 `packages/runtime/test/export.test.ts`、`tests/e2e/export.spec.ts`。

- [ ] 构造宽度相同的两张带明确色块的样例及中文 TextLayer。测试拼图高度等于各屏高度加间距，屏序与选中版本准确；导出结果不依赖主题；用户输入 `<script>` 作为文字渲染而不是代码执行。

```ts
const bytes = await composeDetail([{bytes:screenA},{bytes:screenB}],{width:750,gap:0});
const meta = await sharp(bytes).metadata();
expect({width:meta.width,height:meta.height}).toEqual({width:750,height:2000});
```

- [ ] 运行 `npm test -- packages/runtime/test/export.test.ts` 确认失败。实现 composeDetail：各屏按原比例缩放到目标宽度、累计 top、先创建透明／指定背景、Sharp composite；长图超过图像编码器最大尺寸时提示拆分导出，禁止静默截断。
- [ ] TextLayer 经过 Unicode 转义、安全 SVG／确定性排版和授权字体渲染，字号按输出像素计算。字体缺失报错，不能悄悄用导致错版的回退字体；输出渲染前检测边界溢出。图片按 sRGB 导出，透明 PNG 与不透明 JPEG 路径分开。
- [ ] ExportDialog 支持当前选中图片、整套 SKU／屏幕、长详情页、平台尺寸预设。为每个文件选择当前已选 outputVersion，而非最新一次失败版本；命名清理路径分隔符、重复文件名加稳定后缀；已有文件先确认覆盖或自动另存。
- [ ] 套图生成 manifest，含文件名、输入版本、Agent／Skill 版本和导出参数，不含凭证、临时 URL 或账单。临时目录写完再移动交付目录；部分失败列出失败文件，可只重导出该文件，不重新生成图片。
- [ ] `npm run test:e2e -- tests/e2e/export.spec.ts` 验证导出后真正读取输出文件、尺寸、透明通道、中文文字和拼图顺序，不只断言成功提示。提交 `git add packages/runtime/src/exports apps/desktop/src/renderer/exports tests/fixtures/fonts packages/runtime/test/export.test.ts tests/e2e/export.spec.ts`，`git commit -m "feat: export accurate product image deliverables"`。

## D3 备份、打包与全量验收

**创建：** `packages/runtime/src/backup/service.ts`；`apps/desktop/electron-builder.yml`；`scripts/acceptance.mjs`、`docs/evidence/release-matrix.md`、`docs/user-guide.md`；测试 `packages/runtime/test/backup.test.ts`、`tests/e2e/desktop-recovery.spec.ts`。

- [ ] 备份测试复制数据库快照及对应资产清单，restore 到新的临时 dataRoot 后每个引用都可读取；进行中的任务恢复为待核对，不在 restore 时立刻重发。缺文件的备份拒绝覆盖当前数据库。
- [ ] 运行 `npm test -- packages/runtime/test/backup.test.ts` 确认失败。使用 SQLite backup／一致性快照与资产 hash 清单；备份不包含网关 Token 和本机 Agent 登录文件。恢复先校验到新目录，成功后切换，保留原数据直到用户确认。
- [ ] 配置 Electron 打包：renderer、preload、utility 入口正确定位，Sharp 原生依赖与字体包含在包内；CSP、外链和导航边界有效。本机 CLI 检測使用应用路径与显式设置，不能依赖从终端启动时才有的 PATH。
- [ ] 在 macOS 从 Finder 冷启动包，验证创建项目、图片导入、A／B 偏好、凭证读取、Codex／WorkBuddy 探测、运行恢复和导出。对打包凭证访问检查稳定签名；签名／公证凭证没有提供时只交付本机开发构建，不宣称可无提示分发。其他操作系统未验收不标记支持。
- [ ] 自动验证命令与通过条件：

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run package:desktop
node scripts/acceptance.mjs --evidence docs/evidence/release-matrix.md
```

- [ ] acceptance 检查 evidence 记录完整、对应当前 Git revision、有输出文件 hash；不能只检查 Markdown 中是否出现“通过”。真实验证矩阵包含 DeepSeek、Codex、WorkBuddy、用户图片网关及 S1–S8 每个场景。授权不足、能力缺失、未提供网关契约等均列出具体未通过项。
- [ ] `desktop-recovery.spec.ts` 覆盖提交后关闭窗口／runtime 退出／进程重启、部分完成、取消竞态、旧计划批准失效。手动验证 200 节点流畅度、触控板、中文输入法、A／B 色彩、1024 px 窗口与焦点流向，记录截图和机器条件。
- [ ] docs/user-guide 写商家操作：配置自己的 Token／Agent → 建商品 → 拖素材 → 选场景 → 确认张数 → 检查返修 → 导出；无费用和账单模块。故障页区分额度不足、Token 无效、网络待核对与输入缺失。
- [ ] 提交 `git add packages/runtime/src/backup apps/desktop/electron-builder.yml scripts/acceptance.mjs docs/evidence/release-matrix.md docs/user-guide.md packages/runtime/test/backup.test.ts tests/e2e/desktop-recovery.spec.ts`，`git commit -m "feat: package and verify CommerceCanvas delivery"`。

## 首版完成判据

- [ ] F、C、A、G、S、D 每项任务具备当前代码和指定验证证据。
- [ ] 8 类场景均完成真实素材输入、结果检查、修正与导出，而非仅测试夹具。
- [ ] API 与两个本机 Agent 真实接入记录完整，没有把 IDE 启动器当作 Agent CLI。
- [ ] 未知远端状态不会触发新图片请求；所有图片调用都经过批准次数约束。
- [ ] 原始资产、历史产物、已选版本和主题偏好可恢复，备份可在新目录验证。
- [ ] UI 无计费与账单展示，失败信息准确，用户能完成主路径。
- [ ] 未满足项明确报告，不能用已打包／测试通过替代完整功能交付。
