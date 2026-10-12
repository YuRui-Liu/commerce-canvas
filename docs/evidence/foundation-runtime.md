# F1 运行时验证记录

日期：2026-10-12 至 2026-10-13；环境：macOS arm64；开发 Node 22.23.2 / npm 10.9.8。

## 已验证

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 1 个真实 SQLite/Sharp round-trip 测试通过 |
| `npm run build` | main、preload、renderer 构建通过 |
| `npm run test:e2e` | 实际 Electron 桌面通过，1 测试，1.9 秒 |
| `npm run package:desktop` | 成功生成 macOS arm64 `.app` |
| `COMMERCECANVAS_EXECUTABLE="$PWD/dist/packages/CommerceCanvas-darwin-arm64/CommerceCanvas.app/Contents/MacOS/CommerceCanvas" npm run test:e2e` | packaged app 通过，1 测试，3.4 秒；包含 A/B 主题切换 |
| `git diff --check` | 通过 |

两种实际 Electron 启动方式均返回：

```json
{"sqlite":{"ok":true,"value":"commercecanvas"},"sharp":{"ok":true,"width":2,"height":2},"node":"24.21.0","electron":"44.7.0","processType":"utility"}
```

探测在 Electron utility process 执行，SQLite 使用内存数据库建表、参数化写入并读回字符串；Sharp 创建 2×2 图像、编码 PNG 并重新读取尺寸。不是仅使用系统 Node 测试的结论。E2E 还检查 renderer 无 require、contextIsolation/sandbox 开启、nodeIntegration 关闭。

本地产物（忽略、不提交）：

- `apps/desktop/dist/foundation-desktop.png`：A 主题桌面截图，已人工查看布局与健康状态。
- `apps/desktop/dist/foundation-desktop-editorial.png`：B 主题截图。
- `dist/packages/CommerceCanvas-darwin-arm64/CommerceCanvas.app`：本地应用包。

## 失败与修复证据

1. RED：实现前 `npm test` 报 `expected undefined to match object`，期望 SQLite 与 Sharp 的真实探测结果；实现后 GREEN。
2. 最初 Vite 8 与 electron-vite 5 peer 范围冲突，改用 Vite 7.3.7；未使用 force/legacy-peer-deps。
3. E2E 首次运行下载 Electron 二进制耗时导致超时；下载完成后重新执行通过。
4. 首次 packaged E2E 显示 SQLite 成功、Sharp `ERR_DLOPEN_FAILED`。packager 默认 asar 只解包 `.node`，libvips dylib 留在归档，原生链接器找不到 `libvips-cpp.8.18.7.dylib`。增加 `--asar.unpackDir=node_modules/@img`，同时解包 Sharp 与 libvips 后重打包、重测通过。

## 范围与未验证项

只验证本机 macOS arm64，未验证 Windows、Linux、macOS x64；未做发行签名、公证、安装器、自动更新。`npm run dev` 的热更新循环未单独验证，已验证 build 产物和 packaged 桌面。

尚未实现磁盘数据库、项目保存、图片导入、React Flow 画布、Agent、GRSai 请求；没有模拟生成结果。健康探测数据库不保存用户数据。

系统 Node 单测输出 SQLite experimental warning；Playwright 输出 NO_COLOR/FORCE_COLOR 环境提示，不影响结果。首次 binary 下载可发生在 Electron 首次使用时，CI 应预下载后再跑计时测试。

自审：没有复制 Nuomi 源码；没有中转站/号池/收费服务；没有写入其他代理拥有的计划文档。当前阶段提供可运行工程壳，不声称已交付完整产品。

## 规格审查修复 · 2026-10-13

- 新增 packaged URL 注入回归：旧应用在设置 `ELECTRON_RENDERER_URL=data:text/html,<h1>Injected development page</h1>` 后实际加载该地址，测试因期望本地 `file:…/renderer/index.html` 失败（RED）。
- 主进程增加 `!app.isPackaged` 门槛，打包应用始终加载本地 renderer。重新打包后，健康检查与 URL 注入防护两项 E2E 全部通过（2 passed，3.7 秒），注入场景仍显示真实引擎就绪。
- 修复后 `npm run typecheck`、`npm test`、build 与 macOS arm64 package 均通过；第一次重打包发生临时 `fetch failed`，相同权限命令重试成功。
- A/B 实际桌面截图已归档到受版本控制的 `docs/design/screenshots/`，在视觉系统文档中展示。ADR 已补充三组 Nuomi 具体导入链和适配策略。
