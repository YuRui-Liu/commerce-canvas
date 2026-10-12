# 本地基础实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实施，用复选框记录。

**目标：** 提供可启动的桌面壳和可恢复的商品、资产与凭证存储。

**架构：** 渲染器经 preload 白名单调用主进程，主进程转发业务请求到 utility process。SQLite 保存实体与引用，文件保存图片，主进程管理加密凭证。

**技术栈：** npm workspaces、TypeScript、Electron、Vite、React、Zod、node:sqlite、Sharp、Vitest、Playwright。

---

路径相对 `/Users/liuyuxiang05/Liu/CommerceCanvas`，操作该目录前读取其策略。此计划不修改 Nuomi。

## F1 工程入口与复用记录

**创建文件及职责：** `package.json`、`package-lock.json`（锁定依赖）；`tsconfig.json`、`vitest.config.ts`（检查）；`apps/desktop/electron.vite.config.ts`（main/preload/renderer 构建）；`apps/desktop/src/main/index.ts`（窗口）；`apps/desktop/src/preload/index.ts`（桥接）；`apps/desktop/src/renderer/main.tsx`、`index.html`（UI 入口）；`packages/runtime/src/entry.ts`（业务进程）；`docs/decisions/0001-runtime-and-reuse.md`（依据）。

- [ ] 核对 Nuomi 复用文件的提交、许可与导入链，记录可复制部件和独立实现部件。保存 A／B 设计截图和色值到 `docs/design/visual-system.md`，不复制原型的模拟执行。
- [ ] 建立 npm workspace：`apps/*`、`packages/*`。每个包用 `@commercecanvas/` 前缀；添加命令 `dev`、`build`、`typecheck`、`test`、`test:e2e`、`package:desktop`。锁定执行时稳定版本，不升级 Nuomi 依赖。
- [ ] 桌面窗口使用下列明确设置，preload 在 renderer 编译产物之外；开发地址仅开发模式可加载。

```ts
const options = {
  width: 1440, height: 960, minWidth: 1024, minHeight: 720,
  webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
};
```

- [ ] 在实际 Electron utility process 验证 `import('node:sqlite')`、建表与读写；验证 Sharp 在打包后可加载。功能不可用时先调整兼容依赖版本，不用内存存储冒充持久化。
- [ ] 运行 `npm run build`、`npm run typecheck`。启动桌面，观察 renderer 无 Node 权限、runtime 能返回健康状态。将结果写入 `docs/evidence/foundation-runtime.md`。
- [ ] 提交：`git add package.json package-lock.json tsconfig.json vitest.config.ts apps packages docs/decisions docs/design docs/evidence/foundation-runtime.md`，`git commit -m "chore: establish desktop runtime boundaries"`。

## F2 共享契约与商品存储

**创建：** `packages/contracts/src/domain.ts`、`packages/contracts/src/errors.ts`、`packages/contracts/src/index.ts`；`packages/runtime/src/db/open.ts`、`migrations/001-foundation.sql`；`packages/runtime/src/projects/repository.ts`；测试 `packages/runtime/test/projects.test.ts`。

- [ ] 定义跨计划引用的基础形状并用 Zod 校验外部输入；日期、数量、字符串长度不能仅依赖 TypeScript。

```ts
export type InputRole = 'product' | 'scene' | 'style' | 'facts' | 'instruction' | 'copy';
export type RuntimeKind = 'deepseek' | 'codex' | 'workbuddy';
export type Theme = 'studio' | 'editorial';
export interface AssetRef { assetId: string; versionId: string; role: InputRole }
export interface Project { id: string; name: string; revision: number; facts: Record<string,string> }
export interface AssetVersion {
  id: string; assetId: string; projectId: string; kind: 'image' | 'text';
  hash: string; mime: string; relativePath: string | null; text: string | null;
  width: number | null; height: number | null; createdAt: string;
}
export interface Failure { code: string; message: string; retryable: boolean }
```

- [ ] 写入实际 SQLite 测试：创建项目、更新事实使用预期 revision、关闭后重开数据仍存在；旧 revision 更新抛出 `REVISION_CONFLICT`。测试项目使用临时目录，并在结束关闭连接。

```ts
expect(repository.updateFacts(project.id, 1, { capacity: '30 ml' }).revision).toBe(2);
expect(() => repository.updateFacts(project.id, 1, {})).toThrow('REVISION_CONFLICT');
```

- [ ] 运行 `npm test -- packages/runtime/test/projects.test.ts`，确认因 repository 未实现失败。实现 `openDatabase(file)`、`ProjectRepository.create(name)`、`updateFacts(id, expectedRevision, facts)`、`get(id)`；使用参数化 SQL、foreign_keys、事务迁移与 revision 条件更新。SKU、品牌规范分别存表，以 project_id 外键关联。
- [ ] 同一测试加入事务回滚：非法 SKU 不能留下半个项目更新。重复运行迁移不重复执行。运行上述测试及 `npm run typecheck`。
- [ ] 提交：`git add packages/contracts packages/runtime/src/db packages/runtime/src/projects packages/runtime/test/projects.test.ts`，`git commit -m "feat: persist product projects and revisioned facts"`。

## F3 资产导入、版本与缩略图

**创建：** `packages/runtime/src/assets/import.ts`、`repository.ts`、`thumbnails.ts`、`trash.ts`；`apps/desktop/src/main/assetProtocol.ts`；测试 `packages/runtime/test/assets.test.ts`。

- [ ] 创建授权 PNG 和 JPEG 夹具到 `tests/fixtures/assets/`。测试同文件重复导入复用内容哈希，但任务引用保持独立；文本不写成图片；删除节点引用后素材仍存在；非法图片字节拒绝导入。

```ts
const first = await service.importImage({ projectId, bytes, fileName: 'a.png' });
const second = await service.importImage({ projectId, bytes, fileName: 'b.png' });
expect(first.hash).toBe(second.hash);
expect(await service.read(first.id)).toEqual(bytes);
await expect(service.importImage({ projectId, bytes: Buffer.from('not image'), fileName: 'x.png' }))
  .rejects.toThrow('INVALID_IMAGE');
```

- [ ] 运行 `npm test -- packages/runtime/test/assets.test.ts`，确认缺少实现时失败。实现 `AssetService.importImage`、`importText`、`read(versionId)`；先用 Sharp 解码和读取 EXIF 方向，再计算持久化字节哈希，保留原图与显示方向信息；文件写临时名、原子重命名后落引用。受管文件限定在 runtime dataRoot，不按用户文件名拼接路径。
- [ ] 缩略图排队异步生成，画布优先读取缩略图；详情加载原图。注册 `commerce-asset://` 协议，以版本 ID 查路径，不接受任意本地路径或 `..`。
- [ ] `trashAsset(assetId)` 在有活动任务引用时拒绝；无活动引用时软删除，`restoreAsset(assetId)` 恢复。延迟清理仅删除不再引用的文件。增加引用检查和路径穿越测试。
- [ ] 执行指定测试、导入含 EXIF 旋转图进行视觉检查。提交 `git add packages/runtime/src/assets apps/desktop/src/main/assetProtocol.ts packages/runtime/test/assets.test.ts tests/fixtures/assets`，`git commit -m "feat: manage immutable local asset versions"`。

## F4 类型化桥接、凭证与设置

**创建：** `packages/contracts/src/bridge.ts`；`apps/desktop/src/main/ipc.ts`、`credentials.ts`；修改 preload；`packages/runtime/src/settings/repository.ts`；测试 `tests/contract/ipc.test.ts`、`tests/contract/credentials.test.ts`。

- [ ] 定义固定方法集，renderer 不获得通用 IPC、任意文件读取或解密函数。

```ts
export interface DesktopBridge {
  listProjects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;
  importAssets(projectId: string): Promise<AssetVersion[]>;
  saveText(projectId: string, text: string): Promise<AssetVersion>;
  setTheme(theme: Theme): Promise<void>;
  getTheme(): Promise<Theme>;
  storeCredential(service: string, secret: string): Promise<{ credentialId: string }>;
}
```

- [ ] 写测试拒绝非本应用 origin 的 IPC、未知方法、超长文本、非法主题；凭证存储返回 ID 而不是明文，runtime 日志不能包含输入 secret。运行 `npm test -- tests/contract/ipc.test.ts tests/contract/credentials.test.ts` 观察失败。
- [ ] 凭证仅主进程解密，经锁定 Electron 版本的 safeStorage 加密保存；未提供安全存储时显示 `SECURE_STORAGE_UNAVAILABLE`，禁止静默明文回退。用户在设置表单中填写 Token，提交后清空明文输入；查询配置只返回脱敏尾号。
- [ ] utility process 的消息同样解析 method、payload、request ID，按请求 ID 关联回复；退出时拒绝 pending 请求并提示恢复。业务请求只包含 credentialId，图片服务临时使用凭证后不写日志。
- [ ] 运行指定测试、重启客户端验证主题与设置恢复。提交 `git add packages/contracts/src/bridge.ts apps/desktop/src/main apps/desktop/src/preload packages/runtime/src/settings tests/contract`，`git commit -m "feat: isolate desktop bridge and credentials"`。
