# F4 桥接验证

日期：2026-10-13。实现提交：124e136。环境：macOS arm64，Electron 44.7.0 / 内置 Node 24.21.0。

实现者记录：typecheck 通过，35 项单元测试通过，开发态桌面 2 项通过（仅打包场景跳过），macOS arm64 打包成功。

父代理独立运行完整打包及 packaged E2E：

```sh
npm run package:desktop && COMMERCECANVAS_EXECUTABLE='/Users/liuyuxiang05/Liu/CommerceCanvas/.worktrees/implementation/dist/packages/CommerceCanvas-darwin-arm64/CommerceCanvas.app/Contents/MacOS/CommerceCanvas' npm run test:e2e
```

退出码 0，3 项通过，10.7 秒：

- 类型化桥接创建并恢复项目、图片、文本和主题；实际协议显示图片，新请求跨项目拒绝。
- 实际 utility process 的 SQLite 与 Sharp 健康检查；renderer 隔离边界。
- 打包应用忽略注入的开发 renderer URL。

桌面测试使用临时 userData。跨项目拒绝测试刷新页面，避免已解码图片内存缓存；这不表示能撤回已经读入 renderer 的字节。正式 UI 切换项目必须清空旧项目视图。

凭证测试以 safeStorage stub 验证加密接口、文件权限、无明文以及安全存储不可用时拒绝。真实 macOS Keychain 尚未验证；也没有真实 GRSai 或 LLM 调用。本记录不代表完整产品交付。
