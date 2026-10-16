---
name: presmium-develop
description: "Presmium 仓库开发者指南：包结构与限界上下文、分层规则与 scripts/check-layering.mjs、契约（packages/kernel/src/contracts.ts、ir.ts，packages/host/src/types.ts）、新增插件（指令 DirectiveSpec 转 IR、编译步骤、只经 @presmium/host 的 Vue 组件、src/client/viewer.ts 视图插件、幻灯片与 notebook 的渲染端扩展和 fallback、zh-CN 与 en 文本、pm-overlay）、新增渲染端、只写集成测试（e2e/fixtures、端口环境变量、Firefox 冒烟、性能用例 --no-deps）、pnpm test、demo、e2e、verify、docs:fetch 命令、依赖政策、提交约定与常见陷阱。Use when developing the Presmium monorepo: adding or changing a plugin, directive, pass, component, renderer, host adapter, or test; fixing layering or skill-check failures; running or debugging pnpm test, pnpm e2e, Playwright fixtures; committing or merging work packages."
---

# 开发 Presmium

先读 `CLAUDE.md`（约定与命令），再按需读：`docs/requirements.md`（需求）、`docs/ir.md`（源语法、IR、编译步骤、渲染端）、`docs/domain-model.md`（限界上下文与通用语言）、`docs/architecture.md`（分层、契约、插件约定、测试策略、已知风险）、`docs/wbs.md`（工作包与验收标准）。文档与代码不一致时以契约源码为准，并把不一致报告出来。

写讲义见 presmium-author 技能，放映与课堂见 presmium-present 技能。

## 1. 包与限界上下文

| 上下文 | 包（`packages/`） | 职责 |
|---|---|---|
| 内核 | `kernel` → `@presmium/kernel` | 纯 TS：插件清单、服务注册、锚点、检查、步骤、IR 契约，及插件共用的服务契约（`EXECUTOR`、`SESSION`、`CLASSROOM_STORE`、`PRESENTER_PANELS`） |
| 编译 | `compiler`、`cli` → `@presmium/compiler`、`@presmium/cli` | MyST 解析、编译步骤、编译时执行与缓存、IR、检查；命令 `presmium build | dev | ir | check` |
| 渲染 | `viewer`、`web`、`render-slides`、`render-notebook` | IR 运行时与运行时视图；网页（VitePress 外壳）、幻灯片（生成 Slidev 文稿）、notebook 渲染端 |
| 宿主适配 | `host`、`addon-core`、`web` | 形态无关的宿主接口（`@presmium/host`）及 Slidev（`@presmium/slidev-addon-core`）、VitePress（`@presmium/web`）两个实现 |
| 讲台 | `addon-stage` | 黑屏、冻结、圈画、脚注就近 |
| 代码引用 | `addon-code` | `{code-ref}`、锚点解析、锁定、漂移、永久链接 |
| 代码执行 | `addon-exec`、`addon-exec-local` | 执行服务（Pyodide、脚本 Worker、本机进程、容器）、执行面板、分步执行、环境复刻 |
| 引导 | `addon-guide` | 模拟光标、聚光、交互提示 |
| 富内容 | `addon-content` | 思维导图、媒体、PlantUML |
| 发布 | `addon-publish` | 离线、高对比度、`presmium-export`、`presmium-diff` |
| 课堂 | `addon-session`、`addon-classroom`、`classroom-server` | 会话与同步、测验、练习、提问、理解度、笔记；y-websocket 课堂服务 |
| 编辑 | `language-server`、`vscode` | 语言服务；VS Code 扩展（唯一预打包的包） |

插件包名为 `@presmium/slidev-addon-<上下文>`，每个插件包本身就是一个 Slidev 插件。`examples/demo` 是示例讲义（BPE 分词），`examples/sample-repo` 是它引用的代码。

## 2. 分层

规则见 `docs/architecture.md` 第 3 节，表格版见 `references/plugin.md` 第 2 节。要点：`src/domain` 为纯 TS；组件与 `src/client` 只经 `@presmium/host` 取得步骤状态与服务，不用 `@slidev/*`（`addon-core` 除外，可用 `@slidev/client`）；只在幻灯片形态加载的 `setup/` 与全局图层可以用 `@slidev/client` 的公开导出；只有 `web` 用 vitepress；插件包之间不互相引用；不引用框架内部路径。

`scripts/check-layering.mjs` 扫描 `packages/*` 中所有 `.ts`、`.vue`、`.mjs` 等文件的静态 `import`、`export … from`、动态 `import()` 与 `require()`（注释里的也算）。通过时打印 `layering ok`；失败时逐行打印 `<文件>: <被引用的模块>  (<规则名>)` 并以 1 退出。

## 3. 契约

唯一来源是源码；改签名先改 `docs/architecture.md`（`contracts.ts` 文件头的规定）。

- `packages/kernel/src/contracts.ts`：`defineService`、`PluginDefinition`（`manifest`、`setup(ctx)`、`dispose`）、`PluginContext`、`StartReport`、锚点（`AnchorString`、`AnchorResolver`、`Resolution`、锁定文件 `AnchorLockFile`）、检查（`Check`、`Finding`、`CheckContext`）、`PresmiumNodePlugin`、`Executor` 与 `RunRequest`、`SessionService`、`ClassroomStore`、`PresenterPanels`、`localeOf`。
- `packages/kernel/src/ir.ts`：`IRDocument`、`IRSection`、`IRBlock`、节点（`markdown`、`code`、`component`）、`DirectiveSpec`、`IRPass`、`Renderer`、`RenderContext`、`RendererExtension`。只允许加可选字段；其他改动要提升 `IR_VERSION`。
- `packages/host/src/types.ts`：`HostAdapter`、`SharedStateScope`、`SyncTransport`、`Navigation`、`Toolbar` 与令牌 `SYNC_TRANSPORTS`、`NAVIGATION`、`TOOLBAR`。组合式函数从 `@presmium/host` 导出（`useStepState`、`useStepScope`、`PmBoundary`、`useMessages`、`useSectionConfig`、`useSharedState`、`useService` 等）。

## 4. 新增插件

完整步骤见 `references/plugin.md`：包结构与 `package.json`、指令（`DirectiveSpec` → IR 节点与 `span`）、编译步骤、执行器、检查项、只经 `@presmium/host` 的组件（`PmBoundary`、`useStepState`、`useMessages`、`pm-overlay`）、`src/client/plugin.ts` 与 `setup/main.ts`、`src/client/viewer.ts`、`rendererExtensions.slides` 与 `.notebook`、`fallback`、测试与文档。新指令要写进 `.agents/skills/presmium-author/references/directives.md`，否则 `pnpm test` 中的技能检查失败。

## 5. 新增渲染端

渲染端是某个包 `./presmium` 入口的 `renderer` 字段（`docs/ir.md` 第 6 节）：

```ts
const plugin: PresmiumNodePlugin = {
  id: 'presmium.handout',
  renderer: {
    id: 'handout',
    support: (node, extensions) => node.type === 'component' && !extensions.some(e => e.components?.[node.name]) ? 'degraded' : 'full',
    async build(doc, ctx) {
      // 写到 ctx.outDir；中间文件放 ctx.workDir
      return { outDir: ctx.outDir, skipped: [] }
    },
    // dev?(doc, ctx) => { url, update(doc), close() }：presmium dev 用；没有时 dev 只给警告
  },
}
```

- 选择：`presmium build --to <id>`，否则文稿头部 `renderers` 的键，否则全部已安装的渲染端。`web`、`slides`、`notebook` 默认由 `packages/compiler/src/renderers.ts` 的 `DEFAULT_RENDERER_PACKAGES` 找包；其他 ID 要在 `plugins` 中列出该包，或写 `renderers.<id>.package`。
- `build` 收到的 IR 已去掉 `only` 排除的块；`support` 返回 `none` 的块由编译器列入构建报告；`degraded` 的组件由渲染端渲染其 `fallback`，没有时写一行说明并附网页版链接。
- `RenderContext`：`deckDir`、`workspaceRoot`、`outDir`（`<out>/<id>`）、`workDir`（`build` 中为 `<文稿>/.presmium/<id>`，渲染端自己创建并保持不入库；`dev` 中等于 `outDir`）、`config`（`renderers.<id>`）、`extensions`（各插件的 `rendererExtensions[<id>]`，已绑定本 `ctx`）、`plugins`、`report`。
- 发布插件配置时把位于 `workspaceRoot` 内的绝对路径改为相对路径，产物不随检出位置变化（`docs/architecture.md` 4.2 节）；编译时写进产物的文本按文稿的 `lang`。
- 范例：`packages/render-notebook`（只有 `build`）、`packages/cli/test/fixtures/addons/render/presmium.ts`（最小的 `build` 与 `dev`）。

## 6. 测试

只写集成测试：真实运行 CLI、构建产物、服务与浏览器，不写单元测试，不 mock 宿主框架；每条验收标准一到两个用例。需要专用文稿的端到端用例把文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中构建（`useFixture`）。写法、辅助函数、端口与浏览器项目见 `references/testing.md`。

## 7. 命令

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装依赖；加包、改依赖或合并后锁文件冲突时运行 |
| `pnpm test` | 分层检查、技能检查（`scripts/check-skills.mjs`）与 Vitest 集成测试（`packages/<pkg>/test/`） |
| `pnpm demo:check`、`pnpm demo:build`、`pnpm demo:ir` | 示例文稿的 `presmium check`、`presmium build`（产物在 `examples/demo/dist/<渲染端>/`）、`presmium ir` |
| `pnpm e2e` | Playwright 端到端测试（先 `pnpm demo:build`）；`PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT` 指定端口，`PRESMIUM_E2E_BROWSERS` 指定冒烟用例的其他浏览器 |
| `pnpm exec playwright test e2e/perf.spec.ts --no-deps` | 单独运行性能用例 |
| `pnpm verify` | 以上全部 |
| `pnpm docs:fetch` | 拉取框架文档到 `vendor/docs/slidev`、`vendor/docs/vitepress`（`vendor/` 不入库） |

`pnpm test` 中的 `scripts/check-skills.mjs` 检查：`.claude/skills` 是指向 `../.agents/skills` 的软链接、`AGENTS.md` 是指向 `CLAUDE.md` 的软链接；每个技能的 frontmatter（`name` 与目录同名、`description` 非空）；编译器内置指令与各包 `./presmium` 入口声明的指令都写进了 `presmium-author/references/directives.md`；技能中出现的 `presmium <命令>` 及其选项是 CLI 真有的。改了指令或 CLI 后同步更新技能。

## 8. 依赖与源码

- 依赖优先：能用现成组件就用，通过公开接口定制；不 fork、不打补丁、不引用 Slidev 或 VitePress 的内部路径。查框架接口先读 `vendor/docs/slidev`、`vendor/docs/vitepress`（缺失时 `pnpm docs:fetch`），不读框架的编译产物。仍在使用的未文档化接口及守护它们的用例列在 `docs/architecture.md` 9.1 节，升级框架前先跑这些用例。
- 版本固定：Slidev 53.0.0、VitePress 1.6.4，由 `pnpm-lock.yaml` 锁定。不引入 AGPL 依赖；跨设备功能只用课堂的同步通道。
- 源码以 `.ts`、`.vue` 直接发布，不预编译（CLI 通过 jiti 加载）；相对导入写 `.ts` 扩展名。只有 `vscode` 预打包。
- 界面文本：每个包维护自己的 zh-CN 与 en 文本（位置自定，如 `src/domain/messages.ts`），按 `<html lang>` 选择，组件用 `useLocale`、`useMessages(catalog)`；编译时写入产物的文本按文稿的 `lang`。

## 9. 提交

- 提交信息：`<类型>(<范围>[,<范围>…]): <小写的要点>; <要点> (WP-xx)`，类型取 `feat`、`fix`、`docs`、`test`、`refactor`、`chore`，范围是包或上下文的短名（`viewer`、`exec`、`e2e`、`docs` 等）。正文可选。代理提交以环境给出的 `Co-Authored-By` 署名行结尾。
- 工作包在自己的 worktree 中完成，只改自己拥有的路径（`docs/wbs.md` 各工作包的“拥有”），合并前 `pnpm test` 与全部 Playwright 用例通过。合并提交写 `merge WP-xx <描述>`；合并后补锁文件写 `chore: lockfile after WP-xx`。

## 10. 常见陷阱

- **锁文件冲突**：不要手工合并 `pnpm-lock.yaml`；取任一侧后运行 `pnpm install` 重新生成，再单独提交。
- **静态服务器缓存**：sirv 启动时读取文件列表，重新构建后必须重启，否则新文件 404。
- **e2e 服务器**：不要复用别人的服务器（`reuseExistingServer: false`，端口被占用就报错）；并行工作时换一对端口。也不要停掉别人的服务器。
- **不要在 shell 中用 `pkill -f`、`killall`**：`pkill -f <模式>` 也匹配执行它的 shell 自己的命令行和别的代理的服务器。启动时记下 PID，按 PID 停自己的进程（`kill <pid>`）。
- **网页宿主的共享状态是副本**：`packages/web/src/client/shared.ts` 复制了 `@presmium/host` 的 `createSharedStates`，改其中一处要同时改另一处（`docs/architecture.md` 4.4、9.5 节）。
- **IR 运行时的标记是契约**：课堂笔记按 `.pm-section[data-section]`、`.pm-block[data-block]` 定位，改 IR 运行时的 DOM 要同时改笔记图层（9.2 节）。
- **生成的块 ID 会移动**：`<kind>-<n>` 随前面插入同类块而变；测试与挂载点用标签 `(name)=`。
- **执行插件的 `fallback` 没有编译时输出**：插件的编译步骤在编译时执行之前运行（9.2、9.3 节）。
- **残留的测试文稿**：中断的端到端运行可能留下 `examples/demo/.presmium/e2e-*`，它们不入库，可以删除。
