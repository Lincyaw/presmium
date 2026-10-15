# Presmium

演示系统：同一份 Markdown 文稿生成幻灯片形态（Slidev）与网页形态（VitePress）。

## 必读

- 需求：`docs/requirements.md`
- 领域模型（DDD）：`docs/domain-model.md`
- 架构、契约、测试策略：`docs/architecture.md`
- 工作分解与验收标准：`docs/wbs.md`
- 契约源码：`packages/kernel/src/contracts.ts`、`packages/host/src/types.ts`

## 约定

- 依赖优先：能用现成组件就用，通过公开接口定制；不 fork、不打补丁、不引用 Slidev 或 VitePress 的内部路径。
- 查框架接口先读本地文档 `vendor/docs/slidev`、`vendor/docs/vitepress`（缺失时运行 `pnpm docs:fetch`），不读框架的编译产物。
- 分层：`src/domain` 为纯 TS；组件只通过 `@presmium/host` 获取步骤状态与服务；只有 `addon-core` 使用 `@slidev/client`，只有 `web` 使用 vitepress。
- 步骤可逆：组件的视觉状态是步骤的纯函数。
- 源码以 `.ts`、`.vue` 直接发布，不预编译；相对导入写 `.ts` 扩展名。
- 测试：只写集成测试（真实运行 CLI、构建产物、服务、浏览器），不写单元测试，不 mock 宿主框架；每条验收标准一到两个用例。

## 命令

- `pnpm test`：分层检查 + 集成测试（Vitest，`packages/<pkg>/test/`）
- `pnpm demo:build`、`pnpm demo:web`、`pnpm demo:check`：示例文稿的幻灯片构建、网页构建、检查
- `pnpm e2e`：Playwright 端到端测试（先构建）
- `pnpm verify`：全部
