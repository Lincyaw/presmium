# Presmium

讲义与演示系统：MyST 源码由 `@presmium/compiler` 编译为中间表示（IR），由可插拔的渲染端生成网页（主媒介，VitePress 外壳 + IR 运行时 `@presmium/viewer`）、幻灯片（Slidev）、notebook 等媒介，支持实时渲染。插件组件在网页与幻灯片两种形态中共用。

## 必读

- 源语法与 IR：`docs/ir.md`
- 领域模型（DDD）：`docs/domain-model.md`
- 架构、契约、测试策略：`docs/architecture.md`
- 工作台（基于 DeepSeek Harness）的设计：`docs/design-dsh.md`
- 公开接口与版本规则：`docs/api.md`
- 契约源码：`packages/kernel/src/contracts.ts`、`packages/kernel/src/ir.ts`、`packages/host/src/types.ts`

## 约定

- 依赖优先：能用现成组件就用，通过公开接口定制；不 fork、不打补丁、不引用 Slidev 或 VitePress 的内部路径。
- 查框架接口先读本地文档 `vendor/docs/slidev`、`vendor/docs/vitepress`（缺失时运行 `pnpm docs:fetch`），不读框架的编译产物。
- 分层（`docs/architecture.md` 第 3 节，`scripts/check-layering.mjs` 检查）：`src/domain` 为纯 TS；组件与 `src/client` 只通过 `@presmium/host` 获取步骤状态与服务，不用 `@slidev/*`（`addon-core` 除外）；只在幻灯片形态加载的 `setup/` 与全局图层可以用 `@slidev/client` 的公开导出；只有 `web` 使用 vitepress；插件包之间不互相引用。
- 界面文本有中文与英文（`docs/architecture.md` 5.7 节）：每个包维护自己的 zh-CN 与 en 文本，按 `<html lang>`（由文稿头部的 `lang` 决定，默认 `zh-CN`）选择，没有对应文本时看 `navigator.language`；组件可以用 `@presmium/host` 的 `useLocale`、`useMessages(catalog)`。编译时写入产物的文本按文稿的 `lang`。
- 步骤可逆：组件的视觉状态是步骤的纯函数。
- 技能：面向讲义作者、讲者与开发者的技能在 `.agents/skills`（Codex 读取），`.claude/skills` 是指向它的软链接，`AGENTS.md` 是指向本文件的软链接；改动指令、命令或开发流程时同步更新技能，`scripts/check-skills.mjs` 检查二者一致。
- 源码以 `.ts`、`.vue` 直接发布，不预编译；相对导入写 `.ts` 扩展名。
- 测试：只写集成测试（真实运行 CLI、构建产物、服务、浏览器），不写单元测试，不 mock 宿主框架；每个行为一到两个用例。需要专用文稿的端到端用例把测试文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中构建。

## 命令

- `pnpm test`：分层检查 + 技能检查（`scripts/check-skills.mjs`，技能在 `.agents/skills`）+ 插件声明检查（`scripts/check-plugins.mjs`）+ 包的发布检查（`scripts/check-packages.mjs`，按 `.changeset/README.md` 的表）+ 集成测试（Vitest，`packages/<pkg>/test/`，含消费者安装测试 `packages/cli/test/consumer.test.ts`；运行 `slidev export` 的用例是 `export` 项目，在其他用例之后运行，单独运行用 `pnpm exec vitest run --project export`）
- `pnpm demo:build`、`pnpm demo:check`、`pnpm demo:ir`：示例文稿的构建（`presmium build`，产物在 `examples/demo/dist/<渲染端>/`；`dist/` 是一个站点，网页在 `/web/`，幻灯片在 `/slides/`）、检查、输出 IR
- `pnpm e2e`：Playwright 端到端测试（先 `pnpm demo:build`）。全部用例在 Chromium 中运行，冒烟用例另在 `PRESMIUM_E2E_BROWSERS`（默认 `firefox,webkit`；没有安装或无法启动的跳过并提示）列出的浏览器中运行。并行工作时用 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT` 指定各自的端口。性能用例 `e2e/perf.spec.ts` 在全部 Chromium 用例之后运行；单独运行它要加 `--no-deps`（`pnpm exec playwright test e2e/perf.spec.ts --no-deps`），否则会先运行全部 Chromium 用例
- `pnpm verify`：全部
- `pnpm changeset`（记录一次改动）、`pnpm release:check`（`pnpm -r publish --dry-run`，不实际发布）、`pnpm consumer [<目录>] [--studio]`（打包后在单仓之外用 npm 安装，得到一个消费者项目；`--studio` 另装 `presmium studio`，约 865 MB）
- 工作台（实验性，`docs/design-dsh.md`）：`presmium studio [目录]` 启动 DeepSeek Harness 加 Presmium 的 bundle 与工作区服务，只打印一个网址；在单仓中运行 `node packages/studio/bin/presmium-studio.mjs [目录]`（`@presmium/cli` 的 `presmium studio` 只找已安装的 `@presmium/studio`）
