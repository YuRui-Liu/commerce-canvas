# commerce-canvas

基于 Electron、React 和无限画布的电商图片创作工具，直接接入 GRSai。

## 开发

需要 Node.js 22.13+（22.x）或 24+。

```sh
npm install
npm run dev
```

## 验证与打包

```sh
npm test
npm run typecheck
npm run test:e2e
npm run package:desktop
```

在应用设置中保存 GRSai Token，然后在画布中添加出图节点。凭证保存在本机系统安全存储支持的加密文件中，不应提交到仓库。

实现进度与验证记录见 [docs/implementation-progress.md](docs/implementation-progress.md)。
