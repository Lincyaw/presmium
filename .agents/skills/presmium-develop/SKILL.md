---
name: presmium-develop
description: "Presmium 仓库开发者指南：包结构与限界上下文、分层规则与 scripts/check-layering.mjs、契约（packages/kernel/src/contracts.ts、ir.ts，packages/host/src/types.ts）、新增插件（指令 DirectiveSpec 转 IR、编译步骤、只经 @presmium/host 的 Vue 组件、src/client/viewer.ts 视图插件、幻灯片与 notebook 的渲染端扩展和 fallback、zh-CN 与 en 文本、浮层 layer）、新增渲染端、只写集成测试（@presmium/cli/testing、e2e/fixtures、端口环境变量、Firefox 与 WebKit 冒烟、性能用例 --no-deps）、pnpm test、demo、e2e、verify、docs:fetch 命令、依赖政策、提交约定与常见陷阱。Use when developing the Presmium monorepo: adding or changing a plugin, directive, pass, component, renderer, host adapter, or test; fixing layering or skill-check failures; running or debugging pnpm test, pnpm e2e, Playwright fixtures; committing or merging work packages."
---

# 开发 Presmium

先读 `CLAUDE.md`（约定与命令），再按需读：`docs/requirements.md`（需求）、`docs/ir.md`（源语法、IR、编译步骤、渲染端）、`docs/domain-model.md`（限界上下文与通用语言）、`docs/architecture.md`（分层、契约、插件约定、测试策略、已知风险）、`docs/wbs.md`（工作包与验收标准）。文档与代码不一致时以契约源码为准，并把不一致报告出来。

写讲义见 presmium-author 技能，放映与课堂见 presmium-present 技能。

## 1. 包与限界上下文

| 上下文 | 包（`packages/`） | 职责 |
|---|---|---|
| 内核 | `kernel` → `@presmium/kernel` | 纯 TS：插件清单、服务注册、锚点、检查、步骤、IR 契约，及插件共用的服务契约（`EXECUTOR`、`SESSION`、`CLASSROOM_STORE`、`PRESENTER_PANELS`） |
| 编译 | `compiler`、`cli` → `@presmium/compiler`、`@presmium/cli` | MyST 解析、编译步骤、编译时执行与缓存、IR、检查、Node 端服务注册表、行内角色、运营者插件与插件的来源；命令 `presmium build | dev | ir | check | gateway` |
| 服务端 | `server` → `@presmium/server` | `presmium dev` 的服务端与工作区服务所用的 `serve` 模式（插件的路由与代理、登录与角色、确认、控制通道、所有者控制台、`/mcp` 的挂载），以及 `presmium gateway`；只由 `cli` 与 `workspace` 引用 |
| 智能体 | `mcp` → `@presmium/mcp` | agent 环境：文稿的 MCP 工具（读取类与需要确认的操作类、插件的 `tools`）、只读资源（`presmium://position` 可订阅）与服务说明，基于 MCP SDK v2；它自己声明宿主接口 `McpHost`，服务端在 `ServerHost`、控制通道与 `APPROVALS` 之上实现并挂在 `/mcp`；`presmium-mcp`（stdio）在编译器上实现。只由 `server` 引用 |
| 编译 | `compiler`、`cli` → `@presmium/compiler`、`@presmium/cli` | MyST 解析、编译步骤、编译时执行与缓存、IR、检查、Node 端服务注册表、行内角色、运营者插件与插件的来源；命令 `presmium build | dev | ir | check | serve | gateway | agent-host` |
| 服务端 | `server` → `@presmium/server` | `presmium dev` 的服务端与工作区服务所用的 `serve` 模式（插件的路由与代理、登录与角色、确认、控制通道、所有者控制台），以及 `presmium gateway`；只由 `cli` 与 `workspace` 引用 |
| 工作区 | `workspace` → `@presmium/workspace` | `presmium serve`（按需编译、成员与角色、`REVISIONS`、文档操作与修改历史的路由、编译时执行的确认、LOCAL 中本进程的工作区站点、SHARED 中 agent-host 的客户端与按视图的路由）、`presmium agent-host`、工作区的构建；浏览器插件（`src/client/plugin.ts`：`EDIT_MODE`、工具栏的编辑、文档管理、修改历史与“请求执行”）是工作区站点自己的插件；`src/node/audience.ts` 决定视图怎样编译（WP-87 接入受众） |
| 渲染 | `viewer`、`web`、`render-slides`、`render-notebook` | IR 运行时与运行时视图；网页（VitePress 外壳）、幻灯片（生成 Slidev 文稿）、notebook 渲染端 |
| 宿主适配 | `host`、`addon-core`、`web` | 形态无关的宿主接口（`@presmium/host`）及 Slidev（`@presmium/slidev-addon-core`）、VitePress（`@presmium/web`）两个实现 |
| 讲台 | `addon-stage` | 黑屏、冻结、圈画、脚注就近 |
| 代码引用 | `addon-code` | `{code-ref}`、锚点解析、锁定、漂移、永久链接 |
| 代码执行 | `addon-exec`、`addon-exec-local`、`addon-exec-wasi`、`addon-exec-webgpu`、`addon-exec-jupyter` | 执行服务（Pyodide、脚本 Worker、本机进程、容器、WebAssembly 中的 C/C++/Ruby/SQL）、执行面板、分步执行、环境复刻；浏览器 GPU 后端（WGSL 计算着色器、Python 桥 `presmium_gpu`、jax-js，构建时在 Playwright 的 Chromium 中录制）；远端环境（`kind: jupyter`：Jupyter 内核、服务端代理、gateway 中的代理、`{terminal}`，`src/jupyter/` 是 Node 与浏览器共用的 `@jupyterlab/services` 客户端） |
| 引导 | `addon-guide` | 模拟光标、聚光、交互提示 |
| 富内容 | `addon-content` | 思维导图、媒体、PlantUML |
| 发布 | `addon-publish` | 离线、高对比度、`presmium-export`、`presmium-diff` |
| 课堂 | `addon-session`、`addon-classroom`、`classroom-server` | 会话与同步、测验、练习、提问、理解度、先预测再揭示、笔记；y-websocket 课堂服务 |
| 讲授 | `addon-lecture` | 讲授轨（`lectures/<id>/track.json`）、放映视图中的录制（Mediabunny 录 Ogg/Opus，只在 `src/client/media.ts`）、视图 `lecture` 的回放（`OPERATIONS` 折叠出 `state(t)`）、检查项 `presmium.lecture`、站点渲染端 `lecture` 与 VTT 导出 |
| 编辑 | `language-server`、`vscode` | 语言服务；VS Code 扩展（唯一预打包的包） |

插件包名为 `@presmium/slidev-addon-<上下文>`，每个插件包本身就是一个 Slidev 插件。`examples/demo` 是示例讲义（BPE 分词），`examples/sample-repo` 是它引用的代码。

## 2. 分层

规则见 `docs/architecture.md` 第 3 节，表格版见 `references/plugin.md` 第 2 节。要点：`src/domain` 为纯 TS（不引用 vue 与 `@vue/*`）；组件与 `src/client` 只经 `@presmium/host` 取得步骤状态与服务，不用 `@slidev/*`（只有 `addon-core` 可用 `@slidev/client`，`web` 也不行）；只在幻灯片形态加载的 `setup/` 与全局图层只能用 Slidev 的 `@slidev/client` 公开导出与 `@slidev/types`；只有 `web` 用 vitepress；任何包（测试除外）都不引用插件包 `@presmium/slidev-addon-*`；不引用框架内部路径。

`scripts/check-layering.mjs` 扫描 `packages/*` 中所有 `.ts`、`.tsx`、`.vue`、`.js`、`.jsx`、`.mjs` 等文件的静态 `import`、`export … from`、动态 `import()` 与 `require()`（注释里的也算）。通过时打印 `layering ok`；失败时逐行打印 `<文件>: <被引用的模块>  (<规则名>)` 并以 1 退出。

## 3. 契约

唯一来源是源码；改签名先改 `docs/architecture.md`（`contracts.ts` 文件头的规定）。

- `packages/kernel/src/contracts.ts`：`defineService`、`PluginDefinition`（`manifest`、`setup(ctx)`、`dispose`）、`PluginContext`（含 `environments`）、`StartReport`、锚点（`AnchorString`、`AnchorResolver`、`Resolution`、锁定文件 `AnchorLockFile`）、检查（`Check`、`Finding`、`CheckContext`，含 `service`）、`PresmiumNodePlugin`（含 `version`、`kernel`、`vitePlugins`，v0.8 的 `services`、`environments`、`server`、`roles`、`tools`、`gateway`、`operator`）、`SessionService`、`ClassroomStore`（JSDoc 写明课堂的写入规则）、`PresenterPanels`、`localeOf`、`deckLocale`。v0.8 的业务契约按领域分在 `packages/kernel/src/contracts/`（`execution.ts`：`Executor`、`RunRequest`、`RunContext`、`PROCESS_SANDBOX`、具名环境；`server.ts`：`Member`、`Route`、`ServerContext`、`NodeServiceContext`、`APPROVALS`、`eventStream`、`MCP_ENDPOINT`、gateway；`speech.ts`；`agent.ts`：智能体、修改审阅、`REVISIONS`；`operations.ts`），都由 `contracts.ts` 再导出，入口不变。WP-73a 之后契约只能增加，由验收者决定。
- `packages/kernel/src/ir.ts`：`IRDocument`、`IRSection`、`IRBlock`、节点（`markdown`、`code`、`component`）、`DirectiveSpec`、`IRPass`（`after: 'execute'`）、`Renderer`（`site`、`prepare`）、`RenderContext`（`lang`、`pluginDirs`、`extensionFor`、`portable`、`localAsset`、`base`、`vitePlugins` 等）、`RendererExtension`。只允许加可选字段；其他改动要提升 `IR_VERSION`。
- `@presmium/kernel` 的共用纯函数：`irBlocks`、`docBlocks`（遍历块，含组件的子块）、`nodeMdast`、`withProp`（按属性路径设置组件属性，`assets` 的 `captions.en` 这类键）、`errorMessage`、`isRecord`、`failedRun`、`languageId`、`lowerMyst`（`roles: 'marks'` 写出没有子内容的角色的标记；`cards: 'element'` 把卡片、栅格写成带 `pm-grid`、`pm-card` 类的 `<div>`，`headings` 写成小标题加段落并列为降级，不写时随 `iframes`）、`roleMark`、`deckLocale`、`environmentExecutor`、`eventStream`。用它们，不要在包里另写副本。
- `packages/host/src/types.ts`：`HostAdapter`、`SharedStateScope`、`SyncTransport`、`Navigation`、`Toolbar`、`ServerClient`、`Operations`、`StatusRegistry`、`EditMode` 与令牌 `SYNC_TRANSPORTS`、`NAVIGATION`、`TOOLBAR`、`OPERATIONS`、`STATUS`、`EDIT_MODE`。组合式函数从 `@presmium/host` 导出（`useStepState`、`useStepScope`、`PmBoundary`、`useMessages`、`currentLocale`、`useSectionConfig`、`useSharedState`、`useService`、`useServer`、`useSessionSnapshot`、`claimFirst`、`startHost` 等）。组件经 `useServer()` 调用插件的服务端路由，`available` 为 false（静态产物）时降级。

## 4. 新增插件

完整步骤见 `references/plugin.md`：包结构与 `package.json`、`./presmium` 的 `version` 与 `kernel`、指令（`DirectiveSpec` → IR 节点与 `span`）、编译步骤（含 `after: 'execute'`）、执行器、检查项、`vitePlugins`、只经 `@presmium/host` 的组件（`useStepState`、`useMessages`，不自包装 `PmBoundary`，浮层用 `layer: 'overlay'`）、`src/client/plugin.ts` 与 `setup/main.ts`、`src/client/viewer.ts`、`rendererExtensions.slides` 与 `.notebook`、`fallback`、测试与文档。新指令要写进 `.agents/skills/presmium-author/references/directives.md`，`./presmium` 要声明 `version` 与 `kernel`，否则 `pnpm test` 中的技能检查或插件检查失败。

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
- `RenderContext`：`deckDir`、`workspaceRoot`、`outDir`（`<out>/<id>`）、`workDir`（`build` 中为 `<文稿>/.presmium/<id>`，渲染端自己创建并保持不入库；`dev` 中等于 `outDir`）、`config`（`renderers.<id>`）、`extensions`（各插件的 `rendererExtensions[<id>]`，已绑定本 `ctx`）与 `extensionFor(node)`、`plugins` 与 `pluginDirs`、`lang`、`renderers`、`base`（声明 `site: true` 的渲染端的站点路径）、`vitePlugins`、`localAsset(source, url)`、`portable(value, from)`、`report`。
- 发布插件配置时用 `ctx.portable` 把位于 `workspaceRoot` 内的绝对路径改为相对路径，产物不随检出位置变化（`docs/architecture.md` 4.2 节）；块中引用的本地文件用 `ctx.localAsset` 找到并随产物发布；编译时写进产物的文本按 `deckLocale(ctx.lang)`。
- 插件组件外面包 `PmBoundary`（错误隔离是渲染端的事，`docs/architecture.md` 5.4 节）；可以只生成工作目录时提供 `prepare(doc, ctx)`。
- 范例：`packages/render-notebook`（只有 `build`）、`packages/cli/test/fixtures/addons/render/presmium.ts`（最小的 `build` 与 `dev`）。

## 6. 测试

只写集成测试：真实运行 CLI、构建产物、服务与浏览器，不写单元测试，不 mock 宿主框架；每条验收标准一到两个用例。需要专用文稿的端到端用例把文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中构建（`useFixture`）。写法、辅助函数、端口与浏览器项目见 `references/testing.md`。

## 7. 命令

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装依赖；加包、改依赖或合并后锁文件冲突时运行 |
| `pnpm test` | 分层检查、技能检查（`scripts/check-skills.mjs`）、插件声明检查（`scripts/check-plugins.mjs`）与 Vitest 集成测试（`packages/<pkg>/test/`） |
| `pnpm demo:check`、`pnpm demo:build`、`pnpm demo:ir` | 示例文稿的 `presmium check`、`presmium build`（产物在 `examples/demo/dist/<渲染端>/`）、`presmium ir` |
| `pnpm e2e` | Playwright 端到端测试（先 `pnpm demo:build`）；`PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT` 指定端口，`PRESMIUM_E2E_BROWSERS` 指定冒烟用例的其他浏览器（默认 `firefox,webkit`，未安装或无法启动的跳过并提示） |
| `pnpm exec playwright test e2e/perf.spec.ts --no-deps` | 单独运行性能用例 |
| `pnpm verify` | 以上全部 |
| `pnpm docs:fetch` | 拉取框架文档到 `vendor/docs/slidev`、`vendor/docs/vitepress`（`vendor/` 不入库） |

`pnpm test` 中的 `scripts/check-skills.mjs` 检查：`.claude/skills` 是指向 `../.agents/skills` 的软链接、`AGENTS.md` 是指向 `CLAUDE.md` 的软链接；每个技能的 frontmatter（`name` 与目录同名、`description` 非空）；编译器内置指令与各包 `./presmium` 入口声明的指令都写进了 `presmium-author/references/directives.md`；技能中出现的 `presmium <命令>` 及其选项是 CLI 真有的。改了指令或 CLI 后同步更新技能。`scripts/check-plugins.mjs` 检查每个导出 `./presmium` 的包都声明了 `version`（与 `package.json` 一致）和当前内核满足的 `kernel` 范围。

## 8. 依赖与源码

- 依赖优先：能用现成组件就用，通过公开接口定制；不 fork、不打补丁、不引用 Slidev 或 VitePress 的内部路径。查框架接口先读 `vendor/docs/slidev`、`vendor/docs/vitepress`（缺失时 `pnpm docs:fetch`），不读框架的编译产物。仍在使用的未文档化接口及守护它们的用例列在 `docs/architecture.md` 9.1 节，升级框架前先跑这些用例。
- 版本固定：Slidev 53.0.0、VitePress 1.6.4，由 `pnpm-lock.yaml` 锁定。不引入 AGPL 依赖；跨设备功能只用课堂的同步通道。
- 源码以 `.ts`、`.vue` 直接发布，不预编译（CLI 通过 jiti 加载）；相对导入写 `.ts` 扩展名。只有 `vscode` 预打包。
- 界面文本：每个包维护自己的 zh-CN 与 en 文本（位置自定，如 `src/domain/messages.ts`）。浏览器端一律经 `@presmium/host`：组件中 `useMessages(CATALOG)`，组件外 `CATALOG[currentLocale()]`；不要自己判断语言或观察 `<html lang>`。编译时写入产物的文本用指令、编译步骤、渲染上下文的 `lang` 与 `deckLocale(lang)`（`@presmium/kernel`）。

## 9. 提交

- 提交信息：`<类型>(<范围>[,<范围>…]): <小写的要点>; <要点> (WP-xx)`，类型取 `feat`、`fix`、`docs`、`test`、`refactor`、`chore`，范围是包或上下文的短名（`viewer`、`exec`、`e2e`、`docs` 等）。正文可选。代理提交以环境给出的 `Co-Authored-By` 署名行结尾。
- 工作包在自己的 worktree 中完成，只改自己拥有的路径（`docs/wbs.md` 各工作包的“拥有”），合并前 `pnpm test` 与全部 Playwright 用例通过。合并提交写 `merge WP-xx <描述>`；合并后补锁文件写 `chore: lockfile after WP-xx`。

## 10. 常见陷阱

- **锁文件冲突**：不要手工合并 `pnpm-lock.yaml`；取任一侧后运行 `pnpm install` 重新生成，再单独提交。
- **静态服务器缓存**：sirv 启动时读取文件列表，重新构建后必须重启，否则新文件 404。
- **e2e 服务器**：不要复用别人的服务器（`reuseExistingServer: false`，端口被占用就报错）；并行工作时换一对端口。也不要停掉别人的服务器。
- **不要在 shell 中用 `pkill -f`、`killall`**：`pkill -f <模式>` 也匹配执行它的 shell 自己的命令行和别的代理的服务器。启动时记下 PID，按 PID 停自己的进程（`kill <pid>`）。
- **IR 运行时的标记是契约**：课堂笔记按 `.pm-section[data-section]`、`.pm-block[data-block]` 定位，改 IR 运行时的 DOM 要同时改笔记图层（`docs/architecture.md` 9.2 节）。
- **生成的块 ID 会移动**：`<kind>-<n>` 随前面插入同类块而变，并且按章节编号（两个章节的第一个代码块都是 `code-1`）；测试与挂载点用标签 `(name)=`。
- **编译步骤默认在编译时执行之前运行**：要用代码的 `outputs`，声明 `after: 'execute'`。
- **插件状态要在 `dispose` 中释放**：页面从往返缓存恢复时内核会再次启动插件，没有释放的 Worker、定时器会留下第二份。
- **notebook 共用一个解释器**：同一份测试文稿也会被 notebook 的测试（`render-notebook/test/demo.test.ts`）在 Jupyter 中从头运行；只演示浏览器行为的块放进 `{only} web, slides`。
- **残留的测试文稿**：中断的端到端运行可能留下 `examples/demo/.presmium/e2e-*`，它们不入库，可以删除。
