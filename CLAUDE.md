# Presmium

讲义与演示系统：MyST 源码由 `@lincyaw/compiler` 编译为中间表示（IR），由可插拔的渲染端生成网页（主媒介：预先打包的查看器，即网站外壳 + IR 运行时 `@lincyaw/viewer`，文稿是数据）、幻灯片（同一个查看器的幻灯片页）、notebook 等媒介，支持实时渲染。插件组件在网页与幻灯片两种形态中共用。

## 必读

- 源语法与 IR：`docs/ir.md`
- 领域模型（DDD）：`docs/domain-model.md`
- 架构、契约、测试策略：`docs/architecture.md`
- 工作台（基于 DeepSeek Harness）的设计：`docs/design-dsh.md`
- 工作台 UI/UX 决策与验收：`docs/rfc-workbench-uiux.md`（覆盖旧界面方案，区分目标与已实现行为）
- 契约源码：`packages/kernel/src/contracts/`（`contracts.ts` 汇总导出）、`packages/kernel/src/ir.ts`、`packages/host/src/contracts.ts`

## 约定

- 依赖优先：能用现成组件就用，通过公开接口定制；不 fork、不打补丁、不引用依赖的内部路径。
- 查框架接口先读本地文档 `vendor/docs/`（DeepSeek Harness 与 MCP TypeScript SDK 的文档，缺失时运行 `pnpm docs:fetch`），不读框架的编译产物。
- 分层（`docs/architecture.md` 第 3 节，`scripts/check-layering.mjs` 检查）：`src/domain` 为纯 TS；组件与 `src/client` 只通过 `@lincyaw/host` 获取步骤状态与服务；任何包都不用 `vitepress` 与 `@slidev/*`（网页与幻灯片两种形态都是查看器）；插件包之间不互相引用。
- 界面文本有中文与英文（`docs/architecture.md` 5.7 节）：每个包维护自己的 zh-CN 与 en 文本，按 `<html lang>`（由文稿头部的 `lang` 决定，默认 `zh-CN`）选择，没有对应文本时看 `navigator.language`；组件可以用 `@lincyaw/host` 的 `useLocale`、`useMessages(catalog)`。编译时写入产物的文本按文稿的 `lang`。
- 前端样式（与 aegis-ui 相同的纪律）：设计令牌是视觉的唯一来源，在 `packages/design/src/tokens.css`（颜色令牌的名字另在 `tokens.ts` 的 `COLORS`，表在 `docs/architecture.md` 的设计系统一节）。组件与界面的 CSS 不写原始颜色（十六进制、`rgb()` 等）、px 与 ms/s，px 只出现在 `@media` 断点中；颜色混合、控件与图标尺寸、栏高与窗格宽、圆角、阴影、时长都引用令牌，没有合适的先在 `tokens.css` 加一个，暗色只覆盖颜色与阴影。React 组件中图标与标志的大小由 CSS 的尺寸令牌决定，不在组件里写数字。`scripts/check-tokens.mjs` 检查工作台与 studio 外框的样式，其他包的旧样式改动时迁入它的范围。
- 先修组件再修页面：界面问题先看 `@lincyaw/design` 的 `pm-ui-*`、工作台的通用组件（`packages/workbench/src/components.tsx`）是否缺能力，补在那里，不在单个页面或面板中另写一套。界面改动在亮色与暗色、桌面与 768 px 以下的四种组合中看过才算完成。
- 步骤可逆：组件的视觉状态是步骤的纯函数。
- 技能：面向讲义作者、讲者与开发者的技能在 `.agents/skills`（Codex 读取），`.claude/skills` 是指向它的软链接，`AGENTS.md` 是指向本文件的软链接；改动指令、命令或开发流程时同步更新技能，`scripts/check-skills.mjs` 检查二者一致。
- 源码以 `.ts`、`.tsx` 直接发布，不预编译；相对导入写 `.ts` 扩展名。
- 测试：只写集成测试（真实运行 CLI、构建产物、服务、浏览器），不写单元测试，不 mock 宿主框架；每个行为一到两个用例。需要专用文稿的端到端用例把测试文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中构建。
- 测试成本：日常开发只运行改动直接涉及的定向集成测试，以及相关的轻量结构检查；默认单个 worker，只构建用例需要的文稿与媒介。定向验证通过后停止，不自动扩大测试范围。除非用户明确要求全量验证，不运行 `pnpm test`、`pnpm verify`、完整 `pnpm e2e` 或全部 17 讲的 demo 构建与检查，也不以收尾或合并前检查为由自动运行它们。报告实际通过、跳过和未运行的范围。

## 命令

- `pnpm studio [目录]`：启动浏览器编辑工作台，首次自动在 `.presmium/example-workspace` 准备示例 `examples/animations` 的独立副本（自己的 git 仓库，带合成缓存与给 AI 的 `AGENTS.md`），后续复用；可指定讲义或工作区，支持 `--port`、`--host`、`--help`。打开终端打印的完整网址，`Ctrl+C` 停止；编辑和预览不需要模型。设置 `PRESMIUM_TELEMETRY_URL`（运营者的 OTLP/HTTP 日志地址）后，作者在工作台的操作与每个会话的 AI 轨迹持续上传并可互相关联（`docs/design-dsh.md` 6.7 节）；不设置时不采集。

- `pnpm test`：分层检查 + 技能检查（`scripts/check-skills.mjs`，技能在 `.agents/skills`）+ 插件声明检查（`scripts/check-plugins.mjs`）+ 包的发布检查（`scripts/check-packages.mjs`，按 `.changeset/README.md` 的表）+ 令牌检查（`scripts/check-tokens.mjs`，工作台与 studio 外框的 CSS 不写原始颜色、px 与时长）+ 类型检查（`scripts/check-types.mjs`，`tsconfig.json` 与 `packages/workbench/tsconfig.json`，不报依赖包源码内部的错误）+ 集成测试（Vitest，`packages/<pkg>/test/`，含消费者安装测试 `packages/cli/test/consumer.test.ts`；在 Chromium 中打印幻灯片的用例（`presmium-export`、`presmium-diff`）是 `export` 项目，在其他用例之后运行，单独运行用 `pnpm exec vitest run --project export`）
- `pnpm demo:build`、`pnpm demo:check`、`pnpm demo:ir`：构建、检查和输出唯一公开示例 `examples/animations` 的两讲（冒泡排序、代码写成的动画）；站点在 `examples/animations/dist/web/`，每讲的幻灯片、notebook 与讲授汇入 `<讲义>/slides/`、`<讲义>/notebook/`、`<讲义>/lecture/`。讲解的语音从随讲义提交的合成缓存（`<讲义>/.presmium/speech/`）取得，构建不需要语音引擎；改过的句子要配置引擎重新合成。
- `pnpm e2e`：构建私有回归文稿后运行 Playwright。功能专用文稿放在 `e2e/fixtures/<组>/`；旧 BPE 文稿只保留在 `e2e/fixtures/regression/` 用于回归验证。Chromium 运行全部用例，冒烟另在 `PRESMIUM_E2E_BROWSERS`（默认 `firefox,webkit`）中已安装且能启动的浏览器运行。并行测试用 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT` 指定端口。性能用例最后运行，单独运行时加 `--no-deps`。
- `pnpm verify`：全部
- `pnpm changeset`（记录一次改动）、`pnpm release:check`（`pnpm -r publish --dry-run`，不实际发布）、`pnpm consumer [<目录>] [--studio]`（打包后在单仓之外用 pnpm 安装 `presmium`，得到一个消费者项目；`--studio` 另装 `presmium studio`，约 865 MB）
- 从源码使用命令：`pnpm add -g ./packages/presmium` 之后的全局 `presmium` 就是这份源码（`presmium new`、`check`、`dev`、`build`、`serve`）。面向使用者的命令只写 pnpm 与 `presmium`，不写 npm、npx 与单仓中的路径
- 工作台（实验性，`docs/design-dsh.md`）：`presmium-studio [目录]`（`pnpm add -g ./packages/studio`）启动 DeepSeek Harness 加 Presmium 的 bundle 与工作区服务，只打印一个网址；项目里装了 `@lincyaw/studio` 时 `presmium studio` 相同
