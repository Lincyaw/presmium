# Presmium 架构

本文档定义工程结构、分层规则、跨上下文契约、插件约定与测试策略。领域概念见 `domain-model.md`，任务拆分见 `wbs.md`。

## 1. 编译管线

```
MyST 源码 + 真实代码文件
      │  @presmium/compiler：解析 → 指令 → 角色 → 步骤 → 插件步骤 → 执行（缓存）→ 校验
      ▼
     IR（packages/kernel/src/ir.ts）
      │
      ├── @presmium/web              网页：VitePress 外壳 + @presmium/viewer（IR 运行时，动态渲染，实时更新）
      ├── @presmium/render-slides    幻灯片：生成 Slidev 项目（可选的高保真渲染端）
      ├── @presmium/render-notebook  Jupyter .ipynb
      └── 插件提供的渲染端            例如 lecture：讲授计划与合成的音频（addon-lecture）
```

- 编辑只在源码中进行。渲染端只读 IR。
- 网页与幻灯片在浏览器中运行同一批插件组件，组件只依赖 `@presmium/host`；两个渲染端各自提供宿主适配（VitePress 版在 `web`，Slidev 版在 `addon-core`）。
- 源语法、IR、编译步骤、渲染端接口的完整定义见 `ir.md`。
- `presmium dev` 与 `presmium serve` 的进程中另有一个服务端 `@presmium/server`：挂载插件的服务端贡献（远端环境的代理、语音网关、助手、讲授的上传）、MCP 端点与控制通道，统一处理身份、权限、凭据与确认（第 10 节）。静态构建产物不依赖它：需要服务端的功能在静态产物中隐藏或降级。

## 2. 仓库结构

```
presmium/
├── packages/
│   ├── kernel/              @presmium/kernel                    纯 TS 共享内核：契约、服务注册、锚点、检查
│   ├── host/                @presmium/host                      形态无关的宿主接口与组合式函数（Vue）
│   ├── compiler/            @presmium/compiler                  MyST 解析、编译步骤、执行缓存、IR
│   ├── cli/                 @presmium/cli                       presmium build | dev | ir | check | serve；./testing 供各包的集成测试运行 CLI
│   ├── render-slides/       @presmium/render-slides             幻灯片渲染端（生成 Slidev 项目）
│   ├── render-notebook/     @presmium/render-notebook           notebook 渲染端（.ipynb）
│   ├── addon-core/          @presmium/slidev-addon-core         宿主适配：Slidev 实现
│   ├── viewer/              @presmium/viewer                    IR 运行时：动态渲染、运行时视图、实时更新
│   ├── web/                 @presmium/web                       网页渲染端：VitePress 外壳与宿主适配
│   ├── addon-stage/         @presmium/slidev-addon-stage
│   ├── addon-code/          @presmium/slidev-addon-code
│   ├── addon-exec/          @presmium/slidev-addon-exec
│   ├── addon-exec-local/    @presmium/slidev-addon-exec-local   容器执行、回写、环境复刻
│   ├── addon-guide/         @presmium/slidev-addon-guide
│   ├── addon-content/       @presmium/slidev-addon-content
│   ├── addon-publish/       @presmium/slidev-addon-publish
│   ├── addon-session/       @presmium/slidev-addon-session      会话与网络同步
│   ├── addon-classroom/     @presmium/slidev-addon-classroom
│   ├── classroom-server/    @presmium/classroom-server          y-websocket 服务
│   ├── language-server/     @presmium/language-server           语言服务（诊断、跳转、悬停、补全、预览同步）
│   ├── vscode/              presmium-vscode                     VS Code 扩展（唯一预打包的包）
│   ├── server/              @presmium/server                    服务端：挂载服务端贡献、登录与权限、确认、控制通道、反向代理（Node）
│   ├── mcp/                 @presmium/mcp                       agent 环境：MCP 工具与资源；presmium-mcp（stdio）
│   ├── workspace/           @presmium/workspace                 工作区服务 presmium serve：文档管理、修改历史（REVISIONS）、成员、编辑模式
│   ├── addon-exec-wasi/     @presmium/slidev-addon-exec-wasi    WebAssembly 后端（Runno）
│   ├── addon-exec-webgpu/   @presmium/slidev-addon-exec-webgpu  浏览器 GPU 后端（WGSL、jax-js），构建时在 Chromium 中录制
│   ├── addon-exec-jupyter/  @presmium/slidev-addon-exec-jupyter 远端环境（Jupyter 内核协议）与浏览器终端
│   ├── addon-assistant/     @presmium/slidev-addon-assistant    agent 运行时（ACP 客户端）、问答、批注与对话修改；dsh 配置模板
│   ├── addon-lecture/       @presmium/slidev-addon-lecture      讲授轨、录制、回放、lecture 渲染端、{cue}/{say}、导出视频（presmium-lecture）
│   └── addon-speech/        @presmium/slidev-addon-speech       语音网关、引擎适配、合成缓存（presmium-speech）
├── templates/
│   ├── env/                 远端环境：compose/（compose.yaml、compose.gpu.yaml、compose.gvisor.yaml、devcontainer.json）、kubernetes/（文档）
│   ├── workspace/           工作区部署：compose/（工作区服务、oauth2-proxy、课堂服务）、kubernetes/（文档）
│   └── document/            新建文档的模板
├── examples/
│   ├── demo/                示例文稿，端到端测试的对象
│   └── sample-repo/         被示例文稿引用的“业务代码”
├── e2e/                     Playwright 测试，每个上下文一个 spec；测试文稿在 e2e/fixtures/<组>/
├── scripts/                 结构检查：check-layering.mjs、check-skills.mjs、check-plugins.mjs
├── .agents/skills/          仓库技能（P-82）：presmium-author、presmium-present、presmium-develop
└── docs/
```

## 3. 包内分层

每个插件包本身就是一个 Slidev 插件（addon），目录如下：

```
packages/addon-<ctx>/
├── package.json          keywords 含 slidev-addon；exports 见下
├── src/
│   ├── domain/           领域层：纯 TS，不得引用 vue、@slidev/*、vitepress、node:*
│   ├── node/             Node 适配器：指令、编译步骤、执行器、渲染端扩展、检查项、Vite 插件
│   └── client/           浏览器适配器：plugin.ts（内核插件）、viewer.ts（IR 运行时扩展）、服务实现、组合式函数
├── components/           自动注册的组件：Slidev 约定；网页形态由 web 包注册同一批组件
├── setup/                Slidev 约定：main.ts、code-runners.ts、vite-plugins.ts 等
└── global-top.vue 等     Slidev 约定：全局图层（仅幻灯片形态）
```

依赖规则：

| 位置 | 可以依赖 | 不得依赖 |
|---|---|---|
| `src/domain/` | `@presmium/kernel`、纯计算库 | vue 与 `@vue/*`、`@slidev/*`、vitepress、`@presmium/host`、Node 内置模块（`node:fs` 与 `fs` 都算）、`src/domain/` 之外的相对路径 |
| `components/`、`src/client/` | `src/domain/`、`@presmium/kernel`、`@presmium/host`、vue | `@slidev/*`、vitepress |
| `setup/`、全局图层（`global-top.vue`、`global-bottom.vue`、`custom-nav-controls.vue`、`slide-top.vue`、`slide-bottom.vue`） | 以上全部，加 `@slidev/client` 公开导出与 `@slidev/types` | Slidev 的其他包（如 `@slidev/parser`）、vitepress |
| `src/node/` | `src/domain/`、`@presmium/kernel`、Node 库 | vue 与 `@vue/*` |
| `packages/server/`、`packages/mcp/`（整个包都是 Node 端） | `@presmium/kernel`、`@presmium/compiler`、Node 库；`server` 另可依赖 `@presmium/mcp` | vue 与 `@vue/*`、`@slidev/*`、vitepress；`mcp` 不依赖 `@presmium/server` |

此外：只有 `addon-core` 可以在组件与 `src/client/` 中使用 `@slidev/client`，这两处不用 `@slidev/*` 的其他包（`web` 的组件与 `src/client/` 同样不用 `@slidev/client`）；只有 `web` 可以使用 vitepress；任何包（测试除外）都不引用插件包 `@presmium/slidev-addon-*`，渲染端与 IR 运行时也不例外，相对路径不离开本包，共用的契约放在 `@presmium/kernel` 或 `@presmium/host`。`scripts/check-layering.mjs` 检查以上全部规则，扫描 `.ts`、`.tsx`、`.vue`、`.js`、`.jsx`、`.mjs`、`.cjs`、`.mts` 文件，静态 `import`、`export ... from`、动态 `import()` 与 `require()` 都算引用。

v0.8 新增的规则：

- `@presmium/server` 只由 `cli` 与 `workspace` 引用。插件经 `ServerContext`、`RequestContext`、`APPROVALS` 与 `MCP_ENDPOINT` 使用服务端，浏览器端经 `@presmium/host` 的 `useServer()`。
- `@presmium/mcp` 只由 `server` 引用（挂载 `/mcp`）。MCP 服务需要的宿主能力由它自己声明为接口 `McpHost`（`@presmium/mcp` 的类型：文档列表、编译结果与诊断、检查、构建、放映位置与课堂状态、确认），服务端在 `ServerHost` 与控制通道之上实现它，`presmium-mcp` 直接在编译器上实现它；`mcp` 不引用 `server`，两者之间没有循环依赖（10.2 节）。
- 插件包（`addon-*`）不引用 `@presmium/server`、`@presmium/mcp`、`@presmium/workspace` 与 `@presmium/web`；`workspace` 与 `mcp` 也不引用插件包（已有的“没有包引用插件”规则）。
- 外部协议与厂商的客户端各只在一个适配器中：`@modelcontextprotocol/*` 只在 `mcp`（各包的 `test/` 另算）；`@agentclientprotocol/sdk` 只在 `addon-assistant/src/node/`；`@jupyterlab/services` 与 `@xterm/*` 只在 `addon-exec-jupyter`；`mediabunny` 只在 `addon-lecture`；`simple-git` 只在各包的 `src/node/`。语音服务提供方没有 SDK，它们的接口只出现在 `addon-speech/src/node/engines/`，由代码评审守护。
- `workspace` 的 `src/client/` 与 `components/` 同插件组件的规则。

`scripts/check-layering.mjs` 相应增加五条规则（WP-73a）：`node packages are framework-free`（`server`、`mcp` 的 `src/` 不引用 vue、`@slidev/*`、vitepress）；`only cli and workspace use the server`；`only the server uses mcp`（`@presmium/mcp` 只出现在 `server` 中，各包的 `test/` 另算）；`plugins use contracts, not the hosts`（`addon-*` 不引用上述四个包）；`protocol clients stay in their adapter`（上一条列表中的包名只出现在给定的目录中）。

`package.json` 的 `exports`：

| 入口 | 指向 | 用途 |
|---|---|---|
| `./domain` | `src/domain/index.ts` | 领域层 |
| `./client` | `src/client/index.ts` | 浏览器端 API |
| `./presmium` | `src/node/presmium.ts` | Node 端插件入口，默认导出 `PresmiumNodePlugin` |

源码直接以 `.ts`、`.vue` 发布，不预编译。Slidev、VitePress 与 Vitest 直接处理 TS；CLI 通过 jiti 加载 TS。

## 4. 跨上下文契约

契约的唯一来源是 `packages/kernel/src/contracts.ts`（内核）与 `packages/host/src/types.ts`（宿主）。以下为要点。

### 4.1 插件与服务

- `defineService<T>(id)` 创建服务令牌；`PluginDefinition = { manifest, setup(ctx), dispose? }`。
- 清单声明 `provides`、`requires`（可选依赖标记 `optional`）、兼容的内核版本范围 `kernel`、所需能力 `capabilities`（只声明，不强制）。
- `PluginContext` 提供 `config`、`provide`、`get`、`tryGet`、`events`、`log`、`mode`。

### 4.2 Node 端插件

各插件包的 `./presmium` 入口默认导出 `PresmiumNodePlugin`（定义在 `contracts.ts`）：

| 字段 | 作用 |
|---|---|
| `directives` | MyST 指令规格，把源码转换为 IR 节点 |
| `passes` | IR 编译步骤 |
| `executors` | 编译时执行用的 Node 端执行器 |
| `resolvers`、`anchors`、`checks` | 锚点解析器、文稿引用的锚点、检查项 |
| `renderer` | 本插件提供的渲染端（网页、幻灯片、notebook 各是一个插件） |
| `rendererExtensions` | 本插件为其他渲染端提供的组件转换，例如 notebook 中组件如何变成单元格 |
| `vitePlugins(ctx)` | 运行 Vite 的渲染端在开发服务器与构建中加入的 Vite 插件；`ctx` 为 `{ deckDir, workspaceRoot, config }`，`config` 是本插件的 `presmium.<插件 ID>`（编译步骤写回的值也在其中）。例如本地环境插件以此给两种形态的开发服务器加上自己的端点 |
| `version`、`kernel` | 插件的版本（与 `package.json` 一致）与兼容的内核版本范围；编译器不加载范围不含当前内核的插件。字段在契约中是可选的，官方插件都声明，`scripts/check-plugins.mjs` 检查（并入 `pnpm test`） |
| `roles` | MyST 行内角色规格（`RoleSpec`，4.10 节），例如讲授插件的 `{cue}`、`{say}` |
| `services(ctx)` | Node 端服务实现，例如语音插件的 `SPEECH`、助手插件的 `AGENT_RUNTIME`；编译步骤、渲染端、检查项与服务端贡献经 `service(token)` 使用（4.6 节）。`ctx.settings` 是运营者给本插件的设置（4.7 节），不来自文稿 |
| `environments` | 具名环境的提供方，键为环境的 `kind`（4.6 节） |
| `server(ctx)` | 服务端贡献：挂在 `/__presmium/<插件 ID>/` 下的路由与反向代理（4.7 节、第 10 节） |
| `tools` | agent 工具，MCP 服务以工具暴露（4.8 节） |

- 编译步骤 `IRPass` 可以声明 `after: 'execute'`，在编译时执行之后运行，此时代码节点已有 `outputs`（执行插件以此把编译时输出写进执行面板的 `fallback`）。渲染端 `Renderer` 可以提供 `prepare(doc, ctx)`：只生成工作目录、不构建（幻灯片渲染端写出 Slidev 文稿），编译器在 `build` 旁导出 `prepare(compilation, { to, outDir, base })`，发布插件的导出与视觉差异用它（`base` 换掉渲染端的站点路径：`slidev export` 在根路径服务生成的文稿，导出时传 `/`）。构建报告的每个输出给出 `outDir`、`workDir` 与站点路径 `base`。
- 渲染上下文 `RenderContext` 另有 `lang`（文稿语言）、`pluginDirs`（编译器加载的插件目录）、`extensionFor(node)`（各渲染端选中同一插件的扩展）、`portable(value, from)`、`localAsset(source, url)`（本地文件）、`renderers` 与 `base`（站点路径）、`vitePlugins`，见 `ir.md` 第 6 节。
- `@presmium/kernel` 还导出插件共用的纯函数：`irBlocks`、`docBlocks`（遍历块，含组件的子块）、`nodeMdast`、`errorMessage`、`isRecord`、`failedRun`、`languageId`（`py`、`python3`、`ipython*` 归为 `python`，`js`、`mjs` 归为 `javascript`，`ts` 归为 `typescript`）、`lowerMyst`（MyST 降为标准 Markdown）与 `deckLocale`。各包不再自带这些函数的副本。
- 指令与编译步骤的上下文提供 `watch(...files)`：声明 `ctx.src`、`ctx.resolvers` 之外读取的文件，`presmium dev` 在它们变化时重新编译（`ir.md` 第 5 节）。
- 组件转换函数为 `(node, block, ctx)`，`ctx` 是所服务渲染端的 `RenderContext`；插件据此得到输出目录与工作目录（例如幻灯片渲染端生成的 Slidev 文稿所在目录），不为此依赖渲染端的包。
- `RenderContext.workspaceRoot` 与指令、编译步骤上下文中的同名字段相同：文稿所在 git 仓库的根目录，不在仓库中时为文稿目录。渲染端发布插件配置（全局的 `presmium` 与各章节的 `{config}`）时按它改写路径：位于仓库内的绝对路径（例如编译步骤解析出的工作区目录）改为相对路径，网页形态相对于文稿目录，幻灯片形态相对于生成的 Slidev 文稿所在的目录（Slidev 与插件在那里解析路径）；仓库外的路径与其他字符串（例如站点路径 `/web`）保持原样。产物因此不随检出位置变化（K-13）。
- 检查项的 `CheckContext` 带有编译好的 IR（`ir`），v0.8 起另有 Node 端服务 `service(token)`（4.6 节；例如讲授的检查经 `SPEECH` 判断合成所需的引擎是否可用）。

### 4.3 锚点与检查

- 锚点写作 `scheme:target`，例如 `region:src/a.py#add`、`symbol:src/a.py#Parser.parse`。
- 解析结果为 `exact`、`moved`、`fuzzy`、`lost` 之一；只有前两种可直接渲染，后两种必须产生诊断。
- 指纹记录保存在文稿目录的 `.presmium/anchors.lock.json`，由 `presmium check --update-lock` 生成，随文稿提交。
- 文稿 `.presmium/` 中随文稿提交的还有执行缓存 `freeze/`、本地化的远程图片 `assets/`（如 PlantUML 图，见发布插件）与圈画标注 `drawings/`，新检出的文稿因此构建时不访问远程服务、不重新执行代码（K-13）。渲染端的工作目录（`slides/`、`web/` 等）不提交，根目录的 `.gitignore` 按此配置；新增一个本地化资源后要把它提交。
- 执行缓存中同一段代码的录制若来自另一个运行环境（执行器的环境指纹不同，例如另一个解释器版本），构建默认沿用这份录制并给出警告，人人构建得到相同的输出；文稿头部写 `execute: { rerun: environment }` 时，这类代码重新执行并替换录制（`ir.md` 第 4 节）。
- 检查项 `Check.run(ctx)` 返回 `Finding[]`，诊断带源码位置。

### 4.4 宿主接口

宿主契约的唯一来源是 `packages/host/src/types.ts`：

```ts
type PresentationMode = 'slides' | 'document'
type ViewRole = 'audience' | 'presenter' | 'reader'
type SharedStateScope = 'view' | 'local' | 'remote'

interface HostAdapter {
  readonly mode: PresentationMode
  /** 文稿的语言标签（如 `en-US`），供没有页面的渲染使用；浏览器中由 `<html lang>` 携带 */
  readonly lang?: string
  useCursor(): Readonly<Ref<Cursor>>       // { slide, step }
  /** 渲染该组件的页或章节的当前步骤（绝对步骤，不是块内步骤）；全部展开的文档视图为 Infinity */
  useStep(): Readonly<Ref<number>>
  useViewRole(): Readonly<Ref<ViewRole>>
  /** 形态正在渲染静态副本（幻灯片打印 PDF、PNG）时为 true，组件显示 IR 的 fallback */
  useStaticRender(): Readonly<Ref<boolean>>
  /** 插件 pluginId 在调用组件所在页或章节的配置：全局配置之上合并该章节的 `{config}` */
  useSectionConfig(pluginId: string): Readonly<Ref<Record<string, unknown>>>
  /** 按 key 共享的状态（key 以插件 ID 开头，值为 JSON 数据），可在组件外调用 */
  useSharedState<T>(key: string, initial: T, scope: SharedStateScope): Ref<T>
  getService<T>(token: ServiceToken<T>): T | undefined
  /** 内核启动报告；内核启动之前为 undefined */
  startReport(): StartReport | undefined
}
```

两个宿主适配器在应用初始化时通过 `installHost(app, adapter)` 注入实现。组件不直接读 `useStep()`：`useStepState(range)` 用宿主的绝对步骤减去所在步骤作用域的 `at`（`useStepScope()`，渲染端按块的 `at` 用 `PmStepScope` 提供），得到块内第 k 个状态是否已到达。组件自己再减一次 `at` 会算错。

`@presmium/host` 导出的组合式函数与组件：

| 名称 | 作用 |
|---|---|
| `useStepState`、`useStepScope`、`PmStepScope` | 块内步骤的状态与步骤作用域（见上） |
| `useCursor`、`useViewRole`、`usePresentationMode` | 当前位置、视图角色、形态 |
| `useService`、`useStartReport` | 服务实现与内核启动报告，内核启动后才有值 |
| `usePrefersReducedMotion` | 系统“减少动态效果”设置（5.5 节） |
| `PmBoundary` | 错误边界（5.4 节）；属性 `resetKey` 变化时清除错误，组件修好后不刷新即恢复 |
| `PmToolbar`、`PmPresenterPanels` | 宿主显示 `toolbar`、`presenterPanels` 服务内容的位置 |
| `useSectionConfig(pluginId)` | 插件在当前章节的配置：全局配置合并章节的 `{config}`（5.2 节） |
| `useSharedState(key, initial, { scope })` | 插件状态的共享范围：`view` 只在本视图，`local`（默认）在本机所有窗口，`remote` 经 `syncTransports` 跨设备（K-06）。两种形态的实现相同：本机窗口之间用 BroadcastChannel（`joinWindows`），`remote` 另经同步传输端口 |
| `createSharedStates(deck)`、`joinWindows(name, receive, known)`、`deckChannel(name)` | 宿主适配实现 `useSharedState` 的构件，见下文“共享状态” |
| `useLocale()`、`useMessages(catalog)` | 界面语言 `'zh-CN'` 或 `'en'`，与按语言选取的文本（5.7 节） |
| `useStaticRender()` | 静态导出（PDF、PNG）时为 true：幻灯片形态取自 Slidev 的打印模式，网页形态恒为 false（5.8 节） |
| `registerPresmiumPlugin`、`startPresmium`、`stopPresmium` | 注册浏览器端插件、启动与停止内核；两个宿主在页面卸载（`pagehide`）与热更新替换时调用 `stopPresmium`，各插件的 `dispose` 因此会执行，页面从往返缓存恢复时再启动内核。持有资源的插件在 `dispose` 中释放它们（例如执行插件结束 Pyodide 的 Worker），再次启动时不留下第二份 |
| `startHost({ mode, config, navigation, transports })` | 宿主适配启动内核的共同部分：提供 `presenterPanels`、`syncTransports`、`navigation`、`toolbar` 四个宿主服务，并接上 `pagehide` |
| `useSessionSnapshot()`、`claimFirst(group)` | 会话快照（`session` 服务的订阅），与“同一组中第一个实例拥有”的判断，会话与课堂插件共用 |
| `currentLocale()` | 组件之外的界面语言，按 `CATALOG[currentLocale()]` 取文本 |
| `useServer()` | 服务端的访问（4.7 节）：`available`、当前成员、`fetch(plugin, path)`、`events(plugin, path)`；静态产物中 `available` 为 false，组件据此隐藏或降级。可在组件外调用 |
| `OPERATIONS`、`STATUS`、`EDIT_MODE` | 宿主层的服务令牌：操作的报告与重放（4.9 节）、插件的状态摘要、编辑模式（4.7 节） |

**共享状态。** `createSharedStates(deck)` 返回适配器的 `useSharedState` 实现与同步传输的接入点（`transports.add`，`syncTransports` 服务把每个传输交给它），`deck` 是文稿标题。两种形态的宿主适配都用它，跨窗口、跨设备的状态只有这一套实现：

- `local` 与 `remote` 状态经 `joinWindows` 在本机的窗口之间传递。BroadcastChannel 只送达加入之后的变化，所以新窗口加入时向其他窗口询问，状态改变过的窗口回答，中途打开的演讲者窗口因此从当前状态开始。
- BroadcastChannel 对同源的全部页面可见。`joinWindows` 用 `deckChannel(name)` 给通道名加上文稿的基础路径（Vite 的 `import.meta.env.BASE_URL`，两种形态都由 Vite 构建），通道名形如 `presmium.shared:<文稿标题>:local:<key> @ /web/`，同一站点上同名的两份文稿因此不会串。同一文稿的网页与幻灯片基础路径不同，本机窗口之间的状态也不互通。IR 运行时的放映位置同样经 `deckChannel` 与 `joinWindows` 在窗口之间传递；视图插件的共享状态（例如舞台插件的黑屏）用 `useSharedState`，在两种形态中都是 `remote` 状态，课堂中会到达学员的设备。
- `remote` 状态另是名为 `presmium.shared:<文稿标题>:remote:<key>` 的同步通道，由每个同步传输接入（例如课堂）。两种形态的通道名相同，课堂中幻灯片与网页的设备共享同一份状态。
- 变化按到达的顺序生效并立即发布：来自其他窗口或设备的变化在本窗口生效，以 `fromRemote` 发布，传输不会再把它发出去；紧接着的本地变化照常作为本地变化发布。

幻灯片形态（`addon-core`）用 `createSharedStates`，不用 Slidev 的 `createSyncState`：后者忽略在本地变化的同一个任务中到达的远端值，又把同一个任务中紧跟在远端值之后的本地变化当作远端变化发布，传输因此不把它发出去。

**课堂的写入规则。** 课堂的共享集合（`ClassroomStore`，契约中的 JSDoc 写明同样的规则）由课堂服务端把关：主讲可以写任何条目；学员只能写自己的条目，键中含有自己的参与者 ID（如 `<测验>:<参与者>`、`<参与者>:<提问>`），值是在 `participant` 或 `author` 字段中写明自己的对象；`quizzes` 集合只有主讲能写。服务端只接受能完整并入房间文档的更新：更新依赖服务端没有的内容、删除集超出房间已有的内容，或违反上述规则时，整个更新被拒绝，服务端以应用定义的关闭码关闭该连接，会话插件丢弃本地文档并用新文档重连，提示学员这次写入被拒绝，被拒的写入不会在之后的写入中残留。Yjs 的结构以客户端 ID 与时钟标识，所以一个客户端 ID 属于最先写入它的结构的一方（主讲的各窗口算一方，每个参与者各算一方），参与者名单中某个连接持有的客户端 ID 也属于该连接的一方：学员的更新含有别人的客户端的结构（例如主讲下一个时钟的结构）时被拒绝，否则主讲随后对这个时钟的真实写入会被每份文档当作重复而忽略。`put` 不报告失败，所以存放学员数据的插件必须给数据这样的形状，读取集合时也先按类型守卫过滤（学员可能写入形状不对的值）。参与者名单（awareness）同样校验：一个连接只能声明自己的参与者，学员不能自称主讲。

**覆盖视图的控制条。** 网页形态的放映与演讲者视图挂载时在 `<html>` 上设置 CSS 变量 `--pm-overlay-bar`（视图控制条的高度，像素），卸载时移除。插件固定在页面上的元素用它避开控制条，例如课堂徽章的 `bottom: calc(var(--pm-overlay-bar, 0px) + 1rem)`；没有覆盖视图时（以及幻灯片形态）变量不存在，取默认值。

### 4.5 公共服务令牌

| 令牌 | 提供方 | 使用方 |
|---|---|---|
| `presmium.executor` | 代码执行：浏览器中的 Pyodide（Python）与脚本 Worker（JavaScript、TypeScript），两种形态的开发服务器下的本地容器；由路由按语言与优先级选择。每个执行器都按 `RunRequest` 的约定运行：`files` 写在程序的工作目录中，`args` 成为变量，`stdin` 是程序的标准输入；浏览器中的 Python 每次运行有自己的工作目录，运行改动的解释器状态（递归限制、`sys.path`、新导入的模块、内置函数）在运行后恢复 | 代码块的现场执行、执行面板、课堂（练习校验） |
| `presmium.session` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.classroomStore` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.presenterPanels` | 宿主适配（两种形态；网页形态在放映视图的演讲者窗口中显示） | 需要演讲者面板的插件 |
| `presmium.syncTransports` | 宿主适配（两种形态：`remote` 共享状态；幻灯片形态另有 Slidev 经 `addSyncMethod` 同步的导航与圈画） | 会话（课堂的网络传输） |
| `presmium.navigation` | 宿主适配（两种形态） | 会话（读取与设置位置：章节、步骤、视图） |
| `presmium.toolbar` | 宿主适配（两种形态，由 `PmToolbar` 显示） | 需要工具栏入口的插件（如会话状态） |
| `presmium.operations`（`OPERATIONS`） | 宿主适配（两种形态，`@presmium/host` 的实现） | 报告：IR 运行时（`go`）、执行插件（`run`）、引导插件（`spot`、`hint`）、讲授插件（`point`、`ink`）；录制与重放：讲授插件 |
| `presmium.status`（`STATUS`） | 宿主适配 | 登记：课堂插件的汇总；读取：控制通道（送给 MCP 的 `get_classroom`） |
| `presmium.editMode`（`EDIT_MODE`） | 工作区的浏览器插件 | 助手插件（批注与对话）、讲授插件（转写回写） |
| `presmium.speech`（`SPEECH`） | 语音插件：浏览器端经语音网关，Node 端直接调用引擎 | 讲授插件（转写、合成、构建时合成）、讲授插件贡献的 agent 工具 |
| `presmium.agent`（`AGENT`，浏览器） | 助手插件 | 课堂插件（课堂中的 AI 回答）、讲授插件（转写回写）、工作区的浏览器插件（新建文档时由 agent 起草） |
| `presmium.agentRuntime`（`AGENT_RUNTIME`，Node） | 助手插件 | 助手自己的服务端路由；以后的批处理任务 |
| `presmium.revisions`（`REVISIONS`，Node） | 工作区（`presmium serve` 为每份文档登记） | 助手插件（每个修改任务一次提交）、工作区的文档管理 |
| `presmium.approvals`（`APPROVALS`，Node） | 服务端 | MCP 服务（操作类与计费类工具）、助手插件（agent 的权限请求）、语音插件（计费的合成） |
| `presmium.mcpEndpoint`（`MCP_ENDPOINT`，Node） | 服务端（挂载 `/mcp` 时） | 助手插件：为每个 agent 会话签发绑定成员与模式的 MCP 令牌，放进 ACP `session/new` 的 `mcpServers` |

内核契约中的令牌（`executor`、`session`、`classroomStore`、`presenterPanels`，以及 v0.8 的 `speech`、`agent`、`agentRuntime`、`revisions`、`approvals`、`mcpEndpoint`）定义在 `packages/kernel/src/contracts.ts`；宿主层的令牌（`syncTransports`、`navigation`、`toolbar`，以及 v0.8 的 `operations`、`status`、`editMode`）定义在 `packages/host/src/types.ts`。服务替换时，提供方与使用方都不需要改动。Node 端的令牌（`agentRuntime`、`revisions`、`approvals`、`mcpEndpoint`）登记在编译器为每份文稿建立的 Node 端服务注册表中（`PresmiumNodePlugin.services`，服务端与工作区另行登记自己的实现），规则与浏览器端相同：一个令牌只有一个实现。

`executor`、`session`、`classroomStore` 的接口（`RunRequest`、`SessionService`、`Role` 等）是业务契约。它们放在内核包中是有意的：提供方与使用方是不同的插件，插件之间不互相引用（第 3 节），契约只能放在双方都依赖的共享内核中。内核的运行时（服务注册、启动、锚点、检查）不使用这些概念。见第 9.2 节。

### 4.6 v0.8 的契约增补：执行环境、会话与富输出

4.6 至 4.10 节是 v0.8 新增范围（执行环境、智能体、工作区、讲授与 M9）的契约，设计依据见 `design-v0.7.md`。全部是兼容扩展：只增加可选字段、新类型、新函数与新的服务令牌，不改变已有签名，`IR_VERSION` 仍为 1，现有插件与文稿不受影响。WP-73a 把它们写入 `contracts.ts`、`ir.ts` 与 `host/src/types.ts`（`HostStart` 的增补写在它所在的 `host/src/kernel.ts`）；之后的工作包只实现，不再改这些文件（需要改时在交付报告中提出）。业务契约较多，`contracts.ts` 可以拆为几个模块（执行、服务端、语音、智能体），由它统一再导出，入口 `@presmium/kernel/contracts` 不变（9.2 节）。

`packages/kernel/src/contracts.ts`：

```ts
export interface RunRequest {
  // ……已有字段……
  /**
   * 指定的执行器（IR 的 `RunSpec.executor`；`:env:` 编译为 `environmentExecutor(name)`）。
   * 路由只把请求交给这个执行器；它没有登记或不支持该语言时返回失败的结果
   * （`failedRun`），由预录输出回退（P-24），不改用其他执行器。省略时按语言与优先级选择。
   */
  executor?: string
  /** 执行会话：同一会话的运行共享解释器状态，按请求顺序执行；不支持会话的执行器忽略它 */
  session?: string
}

/** nbformat v4 的单元格输出（结构复制，内核不依赖 nbformat 包） */
export type RunOutput =
  | { output_type: 'stream', name: 'stdout' | 'stderr', text: string }
  | { output_type: 'display_data' | 'execute_result', data: Record<string, unknown>, metadata?: Record<string, unknown> }
  | { output_type: 'error', ename: string, evalue: string, traceback: string[] }

export interface RunResult {
  // ……已有字段……
  /** 富输出，按产生的顺序；`stdout`、`stderr` 仍是文本流的拼接，只读文本的使用方不受影响 */
  outputs?: RunOutput[]
}

export interface Executor {
  // ……已有字段……
  /** 丢弃会话的状态（重启或关闭解释器、内核）；“重置会话”与构建结束时调用 */
  endSession?(session: string): Promise<void>
}

/** 凭据方式（P-105）；凭据本身只在服务端 */
export type EnvironmentAuth = 'none' | 'env' | 'proxy' | 'prompt' | 'hub'

/** 文稿头部 `execute.environments` 的一项（P-100）；不含凭据 */
export interface EnvironmentSpec {
  /** 提供方类型：`jupyter`、`devcontainer`、`wasi`、`webgpu`，或其他插件登记的类型 */
  kind: string
  /**
   * 服务地址（`jupyter`）。带服务端凭据的连接（`env`、`proxy`）只去运营者在
   * `PRESMIUM_ENV_<名>_URL` 中给出的地址；这里的地址与它不同源时不连接（第 11 节）
   */
  url?: string
  /** 内核规格名（`jupyter`，默认 `python3`） */
  kernel?: string
  /** 可用语言；省略时由提供方决定 */
  languages?: string[]
  /** 默认 `none`；`jupyter` 默认 `env` */
  auth?: EnvironmentAuth
  /** 镜像摘要 `name@sha256:…`，进入环境指纹 */
  image?: string
  /** 定义所在的目录（`devcontainer`），相对于文稿目录 */
  path?: string
  /** 提供方自己的选项 */
  [option: string]: unknown
}

/** 文稿头部的 `execute`，编译器写入 IR 的 `config.execute` */
export interface ExecuteConfig {
  /** 有 `:run:` 而不写 `:env:` 的代码块的环境；省略或为保留名 `browser` 时按语言路由 */
  env?: string
  environments?: Record<string, EnvironmentSpec>
  /** `environment`：另一运行环境的录制重新执行（4.3 节） */
  rerun?: 'environment'
}

/** 具名环境的执行器 ID：`presmium.env.<name>` */
export function environmentExecutor(name: string): string

export interface EnvironmentContext {
  deckDir: string
  workspaceRoot: string
  /**
   * 服务端的环境变量，例如 `secret('PRESMIUM_ENV_GPU_TOKEN')` 与同它成对的 `secret('PRESMIUM_ENV_GPU_URL')`；
   * 没有时为 undefined。提供方只把凭据发往同一对中的地址
   */
  secret(name: string): string | undefined
  log: Logger
}

export interface EnvironmentProvider {
  /** 为一个声明的环境创建编译时执行器，其 ID 为 `environmentExecutor(name)` */
  create(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Executor | Promise<Executor>
  /** `presmium check --env`：连接环境；可达时为 undefined，否则返回原因 */
  probe?(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Promise<string | undefined>
}

export interface PluginContext {
  // ……已有字段……
  /** 文稿声明的具名环境；提供方插件为自己 `kind` 的环境登记浏览器端执行器 */
  environments?: Readonly<Record<string, EnvironmentSpec>>
}

export interface NodeServiceContext {
  deckDir: string
  workspaceRoot: string
  /** 本插件的 `presmium.<插件 ID>` 配置（文稿的内容） */
  config: Record<string, unknown>
  /**
   * 运营者给本插件的设置：工作区根目录 `presmium.workspace.yaml` 的 `settings.<插件 ID>`，
   * 进程启动时读取一次；没有时为 `{}`。不来自文稿（`ir.md` 第 10 节）
   */
  settings: Record<string, unknown>
  lang?: string
  /** 服务端进程的环境变量（凭据，以及 `PRESMIUM_AGENT_COMMAND` 这类运营者的设置）；没有时为 undefined */
  secret(name: string): string | undefined
  log: Logger
}

export interface CheckContext {
  // ……已有字段……
  /** Node 端服务；编译器总是提供，可选只是为了兼容 */
  service?<T>(token: ServiceToken<T>): T | undefined
}

export interface PresmiumNodePlugin {
  // ……已有字段……
  /** Node 端服务实现，例如 `[[SPEECH, speech]]`；一个令牌只有一个实现，后加载的插件的重复实现被忽略并报告 */
  services?(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][]
  /** 具名环境的提供方，键为 `EnvironmentSpec.kind` */
  environments?: Record<string, EnvironmentProvider>
  /** 服务端贡献；`presmium dev` 中每份文稿一次，`presmium serve` 中每份被访问的文档一次（第 10 节） */
  server?(ctx: ServerContext): ServerContribution | Promise<ServerContribution>
  /** MyST 行内角色（4.10 节，`ir.md` 2.8 节） */
  roles?: RoleSpec[]
  /** agent 工具，MCP 服务以工具暴露（4.8 节） */
  tools?: AgentTool[]
}
```

要点：

- **执行器的选择**：浏览器中的 IR 运行时、执行面板与编译时执行都把代码块的 `run.executor` 放进 `RunRequest.executor`，由路由精确选择（`review-round2.md` 决定 5）。IR 运行时不再自己挑选首选执行器。
- **会话 ID**：浏览器中由代码块的 `:session:` 加上页面实例的标识组成（每个页面、每个学习者各自一份）；编译时由文稿与 `:session:` 组成，构建结束时对每个用过的会话调用 `endSession`。
- **富输出**：执行器把输出写入 `outputs`，同时照旧拼接 `stdout`、`stderr`。渲染见 `ir.md` 第 6 节；HTML 输出在显示前清洗（第 11 节）。
- **环境的登记**：编译器为头部声明的每个环境找到 `kind` 对应的提供方，创建执行器并加入编译时的执行器列表；没有提供方的 `kind` 与未声明的环境名都是错误级诊断。浏览器端由同一插件在 `setup` 中按 `ctx.environments` 为同类环境登记执行器，ID 相同。

### 4.7 服务端契约

`packages/kernel/src/contracts.ts`：

```ts
export type MemberRole = 'reader' | 'editor' | 'owner'

export interface Member {
  id: string
  name: string
  email?: string
  roles: MemberRole[]
}

export interface RequestContext {
  /** 发起请求的成员；`presmium dev` 中是本机作者（`owner`） */
  member: Member
  /** 请求所属文档的目录，相对于工作区根目录；`presmium dev` 中为 '' */
  document: string
  /** `/*` 路由中路由键之后的路径（不以 `/` 开头）；其他路由为 '' */
  rest: string
}

export type RouteHandler = (request: Request, ctx: RequestContext) => Response | Promise<Response>

export interface Route {
  /** 能调用的最低角色，默认 `editor`；学习者可用的路由写 `reader` */
  role?: MemberRole
  handle: RouteHandler
}

export interface ProxySpec {
  /** 挂在 `/__presmium/<插件 ID>/<path>/` 下；HTTP 与 WebSocket 都转发 */
  path: string
  target: string
  /** 转发时加上的请求头，例如凭据；浏览器看不到 */
  headers?: Record<string, string>
  /** 默认 `editor` */
  role?: MemberRole
}

export interface ServerContribution {
  /** 键为挂在 `/__presmium/<插件 ID>/` 之后的路径，如 `tasks`；以 `/*` 结尾时匹配其下的全部路径。流式结果用 SSE */
  routes?: Record<string, Route>
  proxies?: ProxySpec[]
  /** 服务端关闭时调用 */
  close?(): void | Promise<void>
}

export interface ServerContext {
  deckDir: string
  workspaceRoot: string
  /** 本插件的 `presmium.<插件 ID>` 配置（文稿的内容） */
  config: Record<string, unknown>
  /** 运营者给本插件的设置，同 `NodeServiceContext.settings`；不来自文稿 */
  settings: Record<string, unknown>
  lang?: string
  /** Node 端服务：插件的 `services`，以及服务端的 `APPROVALS`、`MCP_ENDPOINT`，工作区的 `REVISIONS` */
  service<T>(token: ServiceToken<T>): T | undefined
  /** 服务端进程的环境变量，同 `NodeServiceContext.secret` */
  secret(name: string): string | undefined
  log: Logger
}

export type ApprovalKind = 'operate' | 'spend' | 'write' | 'agent'

export interface ApprovalRequest {
  kind: ApprovalKind
  /** 一句话说明要做什么，按文稿语言，例如“运行 merge 一节的 code-1” */
  title: string
  detail?: string
  /** 发起方：插件 ID，或 `agent:<任务 ID>` */
  from: string
  /** 代表哪位成员发起；确认只发给这位成员的窗口，没有时发给全部编辑者与所有者 */
  member?: string
}

export interface Approvals {
  /** 按确认策略放行、拒绝或询问；询问时等到有人回答、`signal` 中止或超时（视为拒绝） */
  request(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean>
}

/** Node 端服务，由服务端提供 */
export const APPROVALS = defineService<Approvals>('presmium.approvals')

/** SSE 响应：每个事件写成 `event:` 与 `data:`（JSON）行；`signal` 中止或事件结束时关闭 */
export function eventStream(events: AsyncIterable<{ event?: string, data: unknown }>, signal?: AbortSignal): Response

/** agent 运行时的模式：`author` 可以写源码；`tutor` 只读，没有操作类工具 */
export type AgentMode = 'author' | 'tutor'

/** 一个 agent 会话访问本进程 MCP 端点的凭证 */
export interface McpAccess {
  /** 本进程的 `/mcp`，服务端的本机地址（agent 子进程与服务端在同一台机器上） */
  url: string
  /** `Authorization: Bearer` 令牌，绑定成员与模式；工具的范围由它决定 */
  token: string
}

export interface McpGrant extends McpAccess {
  /** 作废令牌；会话关闭时调用，之后用它的请求得到 401 */
  revoke(): void
}

export interface McpEndpoint {
  /** 为一位成员与一种模式签发令牌：`tutor` 令牌只看得到读取类工具 */
  issue(member: Member, mode: AgentMode): McpGrant
}

/** Node 端服务，由服务端在挂载 `/mcp` 时提供（`presmium dev` 与 `presmium serve`）；`presmium build` 中没有 */
export const MCP_ENDPOINT = defineService<McpEndpoint>('presmium.mcpEndpoint')
```

`packages/host/src/types.ts`：

```ts
export interface ServerClient {
  /** 页面由 `presmium dev` 或 `presmium serve` 提供时为 true；静态产物与服务端渲染中为 false */
  readonly available: boolean
  /** 当前成员；握手之后才有值 */
  readonly member: Readonly<Ref<Member | undefined>>
  /** 调用插件的路由 `/__presmium/<plugin>/<path>`；自动带上文档目录（`Presmium-Document`）与界面语言（`Accept-Language`） */
  fetch(plugin: string, path: string, init?: RequestInit): Promise<Response>
  /** 订阅插件的 SSE 路由 */
  events(plugin: string, path: string): EventSource
}

/** 服务端的访问；可在组件外调用。宿主适配在 `startHost({ server })` 中给出，省略时不可用 */
export function useServer(): ServerClient

export interface StatusProvider {
  /** 插件 ID */
  id: string
  /** JSON 数据，不含学习者身份 */
  read(): unknown
}

export interface StatusRegistry {
  register(provider: StatusProvider): Unsubscribe
  list(): StatusProvider[]
}

/** 宿主服务（两种形态）：插件的状态摘要，经控制通道送到服务端 */
export const STATUS = defineService<StatusRegistry>('presmium.status')

export interface EditMode {
  readonly active: Readonly<Ref<boolean>>
  /** 当前成员可以进入编辑模式（编辑者与所有者） */
  readonly allowed: Readonly<Ref<boolean>>
  enter(): void
  leave(): void
}

/** 由工作区的浏览器插件提供；`presmium dev` 与静态产物中没有 */
export const EDIT_MODE = defineService<EditMode>('presmium.editMode')
```

`packages/host/src/kernel.ts`（`HostStart` 定义在这里，由 `index.ts` 再导出）：

```ts
export interface HostStart {
  // ……已有字段……
  server?: ServerClient
}
```

服务端怎样挂载这些契约、怎样认证与确认，见第 10 节。`settings` 与 `config` 的区别：`config` 是文稿头部的内容，任何能编辑文稿的人（包括 agent）都能改；`settings` 只由运营者设置，确认策略之外的安全相关设置（agent 的命令、录音的去处、是否允许克隆音色）都在这里或在环境变量中（第 11 节）。

### 4.8 语音、智能体与修改历史

`packages/kernel/src/contracts.ts`：

```ts
// 语音（P-132、P-133）---------------------------------------------------------

/** 秒；中文为单字 */
export interface SpeechWord { text: string, start: number, end: number }

export interface Synthesis {
  /** 浏览器中为 Blob；Node 中为合成缓存中文件的路径 */
  audio: Blob | string
  mime: string
  /** 秒 */
  duration: number
  words?: SpeechWord[]
  /** 合成缓存的键 */
  key: string
  engine: string
  model: string
  voice: string
  synthetic: true
}

export interface TranscriptSegment { start: number, end: number, text: string, words: SpeechWord[] }

export interface Transcript {
  lang: string
  /** 秒 */
  duration: number
  text: string
  segments: TranscriptSegment[]
}

export interface SpeechEngineInfo {
  id: string
  /** 服务提供方的名字，界面据此标明（N-08） */
  provider: string
  stt: boolean
  tts: boolean
  /** 合成时给出逐字或逐词时间 */
  wordTimes: boolean
  /** 不把数据发给第三方 */
  local: boolean
}

export interface VoiceInfo {
  id: string
  label: string
  lang: string[]
  /** 克隆某人的音色：只在运营者设置 `cloned: true` 且有本人的同意记录时可以合成（N-08） */
  cloned?: boolean
}

export interface SynthesisRequest {
  engine?: string
  voice: string
  text: string
  /** BCP 47 语言标签 */
  lang: string
  rate?: number
  style?: string
  /** 读音词典：写法到读法 */
  lexicon?: Record<string, string>
}

export interface TranscriptionRequest {
  engine?: string
  audio: Blob
  lang?: string
  /** 热词，例如文稿的术语 */
  hints?: string[]
}

export interface SpeechService {
  /** 运营者定义了、因而可用的引擎（地址与凭据成对出现在服务端的环境变量中） */
  engines(): SpeechEngineInfo[]
  voices(engine: string, lang?: string): Promise<VoiceInfo[]>
  /**
   * 先查合成缓存，命中时不发请求；缺失时调用引擎并写入缓存。引擎不可用时、
   * 克隆音色没有开启或没有同意记录时拒绝（抛出带原因的错误）
   */
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<Synthesis>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
}

export const SPEECH = defineService<SpeechService>('presmium.speech')

// 智能体（P-110 至 P-114、P-136）-------------------------------------------------

export interface SourceRange { file: string, startLine: number, endLine: number }

export interface AgentContext {
  /** 文档目录，相对于工作区根目录 */
  document: string
  section?: string
  step?: number
  block?: string
  view?: string
  /** 选中的文字 */
  selection?: string
  source?: SourceRange
}

export type AgentTaskKind = 'question' | 'annotations' | 'chat' | 'transcript'

export type AnnotationStatus = 'draft' | 'sent' | 'done' | 'failed'

export interface Annotation {
  id: string
  section: string
  block: string
  source: SourceRange
  /** 被批注的源码摘录 */
  excerpt: string
  /** 要求 */
  request: string
  status: AnnotationStatus
  /** agent 的说明 */
  note?: string
}

export interface AgentTaskRequest {
  kind: AgentTaskKind
  /** 问题、对话消息或整体要求 */
  prompt: string
  context: AgentContext
  /** `annotations` 任务的批注 */
  annotations?: Annotation[]
  /** `transcript` 任务的讲授轨 ID */
  track?: string
}

export interface Citation {
  /** 显示的文字 */
  label: string
  section: string
  step?: number
  block?: string
}

export type AgentEvent =
  | { type: 'progress', text: string, tool?: string }
  | { type: 'message', text: string, citations?: Citation[] }
  | { type: 'approval', id: string, request: ApprovalRequest }
  | { type: 'annotation', id: string, status: AnnotationStatus, note?: string }
  | { type: 'done', revision?: string }
  | { type: 'error', message: string }

export interface AgentTask {
  readonly id: string
  readonly events: AsyncIterable<AgentEvent>
  cancel(): void
}

/** 浏览器端：页面向服务端的助手提交任务 */
export interface AgentClient {
  /** 服务端有 agent 运行时（运营者给出了 agent 命令），且当前成员可以提交这类任务 */
  available(kind: AgentTaskKind): boolean
  /** 模型的服务提供方，如 `DeepSeek`；提问与对话的界面据此标明（N-08）。不可用时为 undefined */
  provider(): string | undefined
  submit(request: AgentTaskRequest): AgentTask
}

export const AGENT = defineService<AgentClient>('presmium.agent')

export interface AgentSessionOptions {
  /** 工作区根目录，即 ACP `session/new` 的 `cwd` */
  cwd: string
  /** `author` 可以写源码；`tutor` 只读，没有操作类工具 */
  mode: AgentMode
  member: Member
  /**
   * Presmium 的 MCP 服务，写进 ACP `session/new` 的 `mcpServers`（HTTP 方式，带 `Authorization` 头）。
   * 调用方经 `MCP_ENDPOINT.issue(member, mode)` 取得，会话关闭后 `revoke`；省略时 agent 没有 Presmium 的工具
   */
  mcp?: McpAccess
  /** agent 自身的权限请求（ACP `session/request_permission`）交给它确认 */
  approve(request: ApprovalRequest): Promise<boolean>
}

export interface AgentSession {
  prompt(request: AgentTaskRequest, signal?: AbortSignal): AsyncIterable<AgentEvent>
  cancel(): Promise<void>
  close(): Promise<void>
}

/** Node 端：驱动一个 agent；唯一的实现是 ACP 客户端 */
export interface AgentRuntime {
  /** 模型的服务提供方：运营者设置的 `provider`（4.7 节的 `settings`），没有时为 agent 在 ACP `initialize` 中报告的名字 */
  readonly provider: string
  open(options: AgentSessionOptions): Promise<AgentSession>
}

export const AGENT_RUNTIME = defineService<AgentRuntime>('presmium.agentRuntime')

export type AgentToolKind = 'read' | 'operate' | 'spend'

export interface AgentToolContext {
  document: string
  member: Member
  service<T>(token: ServiceToken<T>): T | undefined
  signal: AbortSignal
}

export interface AgentTool {
  /** MCP 工具名，小写加下划线，如 `lecture_preview` */
  name: string
  description: string
  /** 输入的 JSON Schema（对象） */
  input: Record<string, unknown>
  /** `operate`、`spend` 由 MCP 服务先经 `APPROVALS` 确认再调用 */
  kind: AgentToolKind
  /** 返回 JSON 数据或文字，作为工具结果 */
  run(input: Record<string, unknown>, ctx: AgentToolContext): Promise<unknown>
}

// 修改历史（P-115、P-121）----------------------------------------------------------

export interface RevisionOrigin {
  kind: 'agent' | 'document' | 'editor'
  /** agent 任务的 ID */
  task?: string
  member?: Member
}

export interface Revision {
  /** 提交的哈希 */
  id: string
  message: string
  author: string
  /** ISO 8601 */
  date: string
  origin: RevisionOrigin
  /** 改动的文件，相对于工作区根目录 */
  files: string[]
  /** 撤销这次修改的提交 */
  revertedBy?: string
}

export type RevertResult = { ok: true, revision: Revision } | { ok: false, conflicts: string[] }

export interface RevisionService {
  /** 把这些文件的改动提交为一个提交；没有改动时为 undefined */
  commit(change: { files: string[], message: string, origin: RevisionOrigin }): Promise<Revision | undefined>
  history(filter?: { document?: string, task?: string, limit?: number }): Promise<Revision[]>
  /** `git revert`；有冲突时不提交、工作树复原，返回冲突的文件 */
  revert(id: string, member: Member): Promise<RevertResult>
}

export const REVISIONS = defineService<RevisionService>('presmium.revisions')
```

要点：

- 提交说明的格式：第一行是摘要；正文列出批注（或对话摘要）与 agent 的说明；尾注 `Presmium-Task: <任务 ID>`、`Presmium-Origin: agent|document|editor` 与 `Co-authored-by`（发起人）。作者字段取登录身份。修改历史按尾注筛选，所以不依赖服务端的数据库。
- 语音的 `lang` 是 BCP 47 标签而不是界面语言 `Locale`：文稿可以是 Presmium 界面没有翻译的语言，语音引擎照样支持。
- **agent 的启用与 MCP 访问**：助手插件只在运营者给出 agent 命令时（环境变量 `PRESMIUM_AGENT_COMMAND`，或 `settings.presmium.assistant.command`）登记 `AGENT_RUNTIME`，没有命令时 `AGENT.available()` 为 false，不启动任何进程（N-08 的“显式开启”）。助手的服务端路由为每个 agent 会话调用 `ctx.service(MCP_ENDPOINT).issue(member, mode)`，把得到的 `McpAccess` 放进 `AgentSessionOptions.mcp`，会话关闭时 `revoke`。
- **服务提供方的标明**（N-08）：问答与对话的面板写明 `AGENT.provider()`；转写与合成的入口写明引擎的 `SpeechEngineInfo.provider`；本机引擎（`local: true`）写明不外发。

### 4.9 操作与讲授轨

`packages/kernel/src/contracts.ts`：

```ts
/** 一次语义化的操作，以章节、块与锚点为坐标（词汇见 `ir.md` 9.2 节） */
export interface Operation {
  /** 内置类型（`go`、`point`……）或以插件 ID 开头的类型 */
  type: string
  data: Record<string, unknown>
}

/** 讲授轨中的事件：`[自讲授开始的毫秒, 类型, 数据]` */
export type TrackEvent = [t: number, type: string, data: Record<string, unknown>]

/** 事件数据中的 `at`：[语音段 ID, 字偏移] */
export type UtteranceAnchor = [utterance: string, offset: number]
```

`packages/host/src/types.ts`：

```ts
export interface ReplayHandler {
  /** 应用一次操作；`seeking` 为 true 时是跳转中的快进，不播放动画 */
  apply(data: Record<string, unknown>, seeking: boolean): void
  /** 回到没有这类操作的状态；跳转前调用 */
  clear?(): void
}

export interface Operations {
  /** 插件报告用户做的操作；`replaying` 为 true 时报告被丢弃 */
  report(operation: Operation): void
  /** 收到每个报告的操作（录制者） */
  subscribe(listener: (operation: Operation) => void): Unsubscribe
  /** 登记一类操作的重放 */
  onReplay(type: string, handler: ReplayHandler): Unsubscribe
  /** 重放一个操作；没有插件重放这类操作时返回 false，回放者忽略它 */
  replay(operation: Operation, seeking?: boolean): boolean
  /** 调用每个重放的 `clear` */
  clear(): void
  /** 回放者应用操作期间置为 true，画面稳定后置回 false */
  readonly replaying: Ref<boolean>
}

/** 宿主服务（两种形态） */
export const OPERATIONS = defineService<Operations>('presmium.operations')
```

报告的分工（插件之间不互相引用，词汇是内核的共享契约）：IR 运行时报告 `go`（章节、步骤、视图）；执行插件报告 `run`（块与结果的缓存键）；引导插件报告 `spot`、`hint`；讲授插件自己报告指针 `point`（`elementFromPoint` → 最近的 `[data-block]` → 块内相对坐标，约 20 Hz，简化后保存）与工具栏的激光笔、荧光笔 `ink`。回放某一时刻：`clear()`，再按时间依次 `replay(…, true)` 此前的事件，最后一个事件不快进。

### 4.10 IR 与渲染端的增补

`packages/kernel/src/ir.ts`：

```ts
export interface IRDocument {
  meta: {
    // ……已有字段……
    /** 本文稿是译本时：原文的入口文件（相对于文稿目录）与译本所依据的原文摘要（P-123） */
    translationOf?: { entry: string, digest: string }
  }
  config: {
    // ……已有字段……
    /** 头部的 `execute`，不含凭据 */
    execute?: ExecuteConfig
    /** 头部的 `translations`：语言到译本的入口文件 */
    translations?: Record<string, string>
  }
}

export interface IRSection {
  /** 只给这些受众，如 `['teacher']`；省略时对所有受众（P-55） */
  audience?: string[]
}

export interface IRBlock {
  audience?: string[]
}

export interface RunSpec {
  /** 执行会话（`:session:`） */
  session?: string
}

export interface CodeNode {
  /** `false`：不显示代码与运行控件，只显示输出；`text/markdown` 输出按正文显示（P-102） */
  echo?: false
}

// RecordedRun extends RunResult：继承 `outputs`

export interface ComponentNode {
  /** 键可以是属性路径，如 `captions.en`：按 `.` 逐层进入对象属性 */
  assets?: Record<string, string>
}

/** 行内角色的输入：{name key=value}`value` */
export interface RoleInput {
  name: string
  /** 反引号中的内容 */
  value: string
  options: Record<string, unknown>
}

export interface RoleSpec {
  name: string
  options?: Record<string, DirectiveOptionType>
  /** 角色节点的子内容；省略时为一个内容是 `value` 的文本节点。`{cue}` 返回空数组，命令写在 `options.value` 中 */
  children?(input: RoleInput, ctx: DirectiveContext): MdastNode[]
}

/** IR 中登记过的角色（`markdown` 节点的 mdast 中）；不认识它的渲染端只显示 `children` */
export interface PresmiumRoleNode extends MdastNode {
  type: 'presmiumRole'
  /** 登记该角色的插件 ID */
  plugin: string
  name: string
  /** 选项，以及 `value`（反引号中的内容） */
  options: Record<string, unknown>
  children: MdastNode[]
}

export interface PassContext {
  // ……已有字段……
  /** Node 端服务；编译器总是提供，可选只是为了兼容（插件写 `ctx.service?.(SPEECH)`） */
  service?<T>(token: ServiceToken<T>): T | undefined
}

export interface RenderContext {
  // ……已有字段……
  /** 同 `PassContext.service` */
  service?<T>(token: ServiceToken<T>): T | undefined
  /** 头部声明的译本，编译器另行编译（语言，IR）；网页渲染端使用 */
  translations?: { lang: string, doc: IRDocument }[]
  /** `presmium dev` 中服务端的地址，开发服务器把 `/__presmium/` 代理到它；构建中省略 */
  server?: { url: string }
}

/** 工作区站点中的一份文档（P-122） */
export interface SiteDocument {
  /** 目录，相对于工作区根目录；文档的页面在 `<base><dir>/` 下 */
  dir: string
  title: string
  lang?: string
  tags?: string[]
  /** 编译好的 IR；开发中尚未访问的文档没有 */
  doc?: IRDocument
}

export interface SiteSpec {
  title: string
  /** 按工作区配置的顺序，也是文稿之间前后导航的顺序 */
  documents: SiteDocument[]
  /** 作为首页的文档目录；省略时首页是文档列表 */
  home?: string
  /** 工作区配置的 `site`：与 `renderers.web` 的站点外壳选项相同 */
  config: Record<string, unknown>
}

export interface SiteDevServer {
  url: string
  /** 一份文档编译或重新编译之后调用 */
  update(dir: string, doc: IRDocument): Promise<void>
  close(): Promise<void>
}

export interface Renderer {
  // ……已有字段……
  /** 把多份文档构建为一个站点（P-122）；只有网页渲染端实现 */
  buildSite?(site: SiteSpec, ctx: RenderContext): Promise<RenderOutput>
  /** 工作区站点的开发服务器；页面请求一份尚未编译的文档时调用 `compile` */
  devSite?(site: SiteSpec, ctx: RenderContext, compile: (dir: string) => Promise<IRDocument>): Promise<SiteDevServer>
}
```

源语法与这些字段的对应、各渲染端的处理见 `ir.md`（2.7 至 2.14 节、第 6 节、第 9、10 节）。媒介 ID `lecture` 不是新的 IR 字段：它是讲授插件的渲染端 ID，`{only} lecture` 照常经 `only` 字段生效。

## 5. 插件约定

### 5.1 浏览器端注册

插件包在浏览器端有三个约定入口。网页与幻灯片两个宿主都从这里注册，插件不必为两种形态各写一份：

| 入口 | 内容 | 幻灯片形态 | 网页形态 |
|---|---|---|---|
| `src/client/plugin.ts` | 默认导出内核插件定义 `PluginDefinition`：提供的服务与启动时的初始化 | 插件包的 `setup/main.ts` 导入它，调用 `registerPresmiumPlugin`（`@presmium/host`） | `web` 渲染端导入 `plugins` 中每个包的这个文件并注册 |
| `components/*.vue` | 组件，文件名即组件名，对应 `component` 节点的 `name` | Slidev 自动注册 | `web` 渲染端按文件名注册到 IR 运行时；文稿自己的 `components/` 覆盖同名组件 |
| `./presmium` 的 `vitePlugins` | 开发服务器的端点等 Vite 插件（4.2 节） | 幻灯片渲染端生成的 Slidev 项目不加入它们，插件包用 Slidev 的 `setup/vite-plugins.ts` 注册（薄适配） | `web` 渲染端在 VitePress 的开发与构建中加入 |

文稿自己的组件：文稿目录下的 `components/*.vue` 由编译器以插件 ID `deck` 登记（与网页的规则相同），`{component}` 可以使用它们，`presmium check` 与编辑器不再报告“没有插件注册该组件”，补全中也有它们；幻灯片渲染端把这个目录链接到生成的 Slidev 项目的 `components/`（Slidev 文档化的目录），组件在幻灯片中照常渲染并保留内部步骤。这些组件同插件组件一样只能引用 `@presmium/host`、`@presmium/kernel` 与 vue；文稿目录要能解析 `@presmium/host`，所以文稿的 `package.json` 要依赖它（否则网页构建报 Rollup 无法解析）。
| `src/client/viewer.ts` | 默认导出视图插件 `ViewerPlugin`（类型来自 `@presmium/viewer`） | 不使用 | `web` 渲染端在 IR 运行时启动前调用一次 |

宿主适配在应用初始化时启动内核：按依赖顺序初始化全部已注册的插件，启动报告在演讲者视图中显示。两种形态注册的是同一批插件，启动报告一致。没有浏览器端服务的插件可以不提供 `plugin.ts`。

视图插件是一个函数 `(ctx) => void`，`ctx` 提供：

| 成员 | 作用 |
|---|---|
| `registerView({ id, label, kind, component, hidden? })` | 注册运行时视图（`ir.md` 8.2 节）。`kind: 'page'` 的视图在页面正文中渲染本页的章节，组件得到属性 `sections`；`'overlay'` 的视图覆盖全屏、贯穿全文；`hidden` 的视图不出现在视图菜单中。同一 ID 后注册的替换先注册的 |
| `registerNodeRenderer(key, component)` | 为一类块注册渲染器。`key` 为节点类型（`markdown`、`code`、`component`）、`code:<语言>` 或组件名；渲染器得到属性 `block`、`section`、`step` |
| `registerComponent(name, component)` | 注册渲染 `component` 节点的 Vue 组件，用于 `components/` 约定之外的组件 |
| `registerAction({ id, keys, run, views? })` | 注册按键动作：`keys` 为 `KeyboardEvent.key` 的值（不含 Ctrl、Alt、Meta），`run(viewer)` 返回 `false` 时按键交给其他处理；`views` 默认是放映视图与演讲者窗口。例如舞台插件的 `b`、`f` |
| `registerLayer({ id, component, views? })` | 注册画在覆盖视图之上的图层，组件得到属性 `view`；`views` 默认同上。例如舞台插件的黑屏 |
| `useViewer()` | 在组件的 `setup` 中取得运行时状态：文档、当前视图与位置 |
| `SectionView`、`BlockView` | 组成视图的构件：一个章节（含版式），一个块在某一步的状态 |

视图插件抛错时只记录错误并跳过它，其余插件照常安装。视图与渲染器同插件组件一样，只依赖 `@presmium/host`、`@presmium/kernel` 与 vue；`@presmium/viewer` 只引用类型。

幻灯片形态不运行视图插件；组件写进 Slidev 文稿的方式由 Node 端的 `rendererExtensions.slides` 决定（4.2 节），没有扩展时生成组件标签。

### 5.2 配置

插件配置有三个作用域，键都是插件 ID：

| 作用域 | 写法 | 读取 |
|---|---|---|
| 全局 | 文稿头部 `presmium: { <插件 ID>: {...} }` | `PluginContext.config`，指令与编译步骤上下文的 `config` |
| 章节 | 章节内的 `{config}` 指令，正文为 YAML，键为插件 ID | 编译器存为 `IRSection.config`；在该章节的指令与编译步骤上下文中合并在全局配置之上；浏览器端用 `useSectionConfig(<插件 ID>)` 读取合并后的配置 |
| 单个节点 | 指令选项或组件属性 | 组件属性 |

````md
(exec-slow)=
## 一个慢的例子

```{config}
presmium.exec: { timeoutMs: 30000 }
```
````

官方插件中读取章节配置的选项：执行插件的 `presmium.exec.timeoutMs`（上例中这一节的代码在编译时与浏览器中运行的超时；指令的 `:timeout:` 优先），代码引用插件的 `presmium.code.repo`（这一节 `{code-ref}` 的永久链接所用的仓库）。插件的其他选项只读全局配置。

幻灯片渲染端把章节配置写入该页 frontmatter 的 `presmium` 键。封面例外：封面页的 frontmatter 就是 Slidev 文稿的头部，其中的 `presmium` 已是全局配置，所以封面章节自己的配置写在 `presmiumSection` 键。幻灯片宿主依次合并全局配置、该页的 `presmium` 与 `presmiumSection`；网页宿主从当前章节的 IR 读取。

### 5.3 步骤可逆

插件组件的视觉状态必须是步骤的纯函数。组件在模板中用 `v-click` 标记向 Slidev 登记步骤，用 `useStepState` 读取状态。网页形态中 `v-click` 由兼容层处理：文档式直接显示，滚动叙事式随滚动显示。

本地步骤：宿主以全部展开的最终状态渲染组件时（文档视图，`useHost().useStep()` 为无穷大），有内部步骤的组件可以给读者一个自己的步进控件，例如分步执行的上一步、下一步与滑块。读者选的本地步骤与执行结果一样是读者的输入，不写回宿主的步骤；组件的视觉状态是（章节步骤，本地步骤）的纯函数，仍然可逆。滚动叙事中没有讲解的步骤（组件的内部步骤）每步只占四分之一屏，读者不必滚过大片空白。

### 5.4 错误隔离

渲染端隔离组件：网页的 IR 运行时与幻灯片渲染端都在每个插件组件外面包一层 `PmBoundary`（幻灯片中包括扩展的输出与 `PmStaticFallback`），组件自己的 `setup` 或模板抛错也只影响它自己：显示占位与错误信息，演讲者视图的错误计数同时提示，页面其余内容照常渲染。组件不在自己的模板中再包 `PmBoundary`（Vue 的 `errorCaptured` 只接住后代的错误，自包装接不住组件自身的错误）。IR 运行时按组件的属性与子块给边界一个 `resetKey`，作者修好组件后不刷新页面即恢复。幻灯片渲染端的组件扩展抛错时，在块的位置报告警告，改为写组件标签或 `fallback`。

### 5.5 减少动态效果

所有动画读取 `usePrefersReducedMotion()`，开启时直接显示终态。

### 5.6 媒介限定与排版提示

只出现在部分媒介中的内容用 `{only}` 指令声明（`ir.md` 2.5 节），例如 `:::{only} web, notebook`。编译器把限定写入块的 `only` 字段，每个渲染端只收到属于自己的块。各渲染端的排版提示用 `{hints}` 声明。早期的 `<div doc-only>`、`<div slide-only>` 标记已不再使用。

### 5.7 界面语言

N-07 要求界面文本有中文与英文：

- 文稿的语言只由头部的 `lang` 声明，例如 `lang: en-US`，默认 `zh-CN`。编译器总是把它写入 IR 的 `meta.lang`，两种形态都据此设置 `<html lang>`：幻灯片渲染端写入 Slidev 头部的 `htmlAttrs`，网页渲染端设置站点语言。渲染端的配置不能另设语言。
- 浏览器中的界面语言为 `'zh-CN'` 或 `'en'`：`<html lang>` 以 `zh` 开头时为中文，以 `en` 开头时为英文；其他语言（如 `fr`）看 `navigator.language`，仍无法确定时为英文。各包一律经 `@presmium/host` 取语言：组件中用 `useMessages(CATALOG)`，组件之外用 `CATALOG[currentLocale()]`，`CATALOG` 是包自己的 `{ 'zh-CN': …, en: … }`。只有 `@presmium/host` 跟随 `<html lang>` 的变化（Slidev 在应用启动之后才写入 `htmlAttrs`），各包不自己判断语言，也不各自观察 `<html lang>`。
- 每个包维护自己的 zh-CN 与 en 文本，文件位置由包自定（例如 `src/domain/messages.ts` 或 `src/client/messages.ts`）。
- 开发服务器的端点（如本地环境插件的端点）按请求的 `Accept-Language` 回答，浏览器端在请求中带上界面语言。
- 编译时写入产物的文本按文稿的语言：指令、编译步骤与渲染上下文都带 `lang`，`deckLocale(lang)`（`@presmium/kernel`）给出 `'zh-CN'` 或 `'en'`（没有对应文本的语言为英文），例如 notebook 中指向网页版的说明、练习单元格的标签、导出环境中的说明文件、聚光灯的降级文字。编译时执行器写入录制输出的消息（例如超时）与解释器自身的报错一样为英文，也不含构建机器的路径。
- 框架自身的界面文字：网页渲染端按文稿语言设置 VitePress 文档列出的全部主题标签（`themeConfig` 的大纲、目录、翻页、明暗切换、回到顶部、跳到正文、侧栏菜单等标签与本地搜索的 `translations`）以及 404 页。VitePress 默认主题中不在 `themeConfig` 里的两个屏幕阅读器标签（侧栏的 “Sidebar Navigation”、上下章链接的 “Pager”）由网页主题在页面渲染后按文稿语言改写（9.1 节）。其他没有公开配置接口的文字保持框架的英文：幻灯片形态中 Slidev 自己的界面（导航栏按钮的提示、演讲者视图、绘图工具与设置菜单）只有英文。N-07 的“界面文本”指 Presmium 自己的界面，不含这些文字。

### 5.8 静态导出

PDF、PNG 等静态导出中，插件组件显示 IR 的 `fallback`，不显示交互界面：幻灯片宿主在打印模式（`useStaticRender()` 为 true）下把带 `fallback` 的组件换成降级内容。插件负责让降级内容完整：执行面板的降级内容是先给参数赋值的代码，加上编译时的输出（构建时没有执行、执行失败或超时的用 `:recorded:` 的录制输出），由执行插件在编译时执行之后的步骤（`after: 'execute'`）写入。notebook 渲染端有自己的扩展时用扩展，否则使用 `fallback`（`ir.md` 第 6 节）。

### 5.9 浮层组件与组件拥有的代码

在页面上绘制在其他内容之上、自身不占版面的组件（例如引导的光标），由指令把组件节点标为 `layer: 'overlay'`。渲染端不给它单独的位置：网页的文档视图把浮层块放在板书之外，不会出现空卡片，服务端渲染与首帧的版面也不跳动；幻灯片渲染端不给没有降级内容的浮层组件写空的 `PmStaticFallback`。

组件拥有的代码：组件的子块中的代码块（例如执行面板、分步执行、本地环境包着的代码）属于组件。两种形态都不给它们运行控件，也不显示它们的录制输出：网页由 IR 运行时实现，幻灯片渲染端把它们写成组件插槽中的普通代码块（照常做语言映射）。组件运行的代码由指令放在组件的属性中（如执行面板的 `code`），不从渲染后的 DOM 读回。

## 6. 示例文稿约定

示例文稿 `examples/demo` 是一份面向初学者的完整讲义“BPE 分词：从字节到词元”：入口 `lecture.md`（MyST）写头部与封面，各章在 `pages/` 下（`tokens.md`、`idea.md`、`implement.md`、`encode.md`、`wrapup.md`），引用的代码在 `examples/sample-repo/src/bpe.py`。讲义中不出现插件 ID、内部机制这类调试性文字。

插件的功能性演示不放在示例讲义中：每组功能有自己的测试文稿 `e2e/fixtures/<组>/`，端到端用例在 `beforeAll` 中构建它们（7 节）；示例讲义只由冒烟用例 `e2e/smoke.spec.ts` 使用（三种媒介都能无警告地构建，网页与幻灯片都能打开并翻页）。构建产物位于 `examples/demo/dist/<渲染端 ID>/`。`lang` 是文稿的语言，决定两种形态的界面语言（5.7 节）。示例文稿的 `.presmium/` 中只提交执行缓存 `freeze/` 与锚点锁定文件（4.3 节）。

## 7. 测试策略

只写集成测试，不写单元测试：测试在真实组装的系统上运行，不对单个函数做隔离测试，不用 mock 替代宿主框架。每条验收标准对应一到两个用例。

| 层级 | 工具 | 范围 | 命令 |
|---|---|---|---|
| 结构检查 | `scripts/check-layering.mjs`、`scripts/check-skills.mjs`、`scripts/check-plugins.mjs` | 第 3 节的分层规则；技能与代码一致（指令、命令及其选项）；每个 Node 插件声明 `version` 与当前内核满足的 `kernel` 范围（4.2 节） | `pnpm test` |
| 集成 | Vitest | 真实运行 CLI、构建产物检查、服务端（`packages/<pkg>/test/`）；运行 `slidev export` 的用例是单独的项目 `export`，在其他用例之后运行 | `pnpm test` |
| 构建 | `presmium build` | 示例文稿编译并生成全部媒介（网页、幻灯片、notebook） | `pnpm demo:build` |
| 检查 | `presmium check` | 示例文稿全部检查项通过 | `pnpm demo:check` |
| 端到端 | Playwright | 构建产物上的行为（`e2e/`）：全部用例在 Chromium 中运行，冒烟用例另在 Firefox 与 WebKit 中运行 | `pnpm e2e` |
| 全部 | | 以上依次执行 | `pnpm verify` |

端到端测试的约定：

- 示例文稿的产物 `dist/` 是一个站点（网页在 `/web/`，幻灯片在 `/slides/`，2.1 节的默认 `base`），服务在 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT`（默认 4173、4174）。同时构建两种形态的测试文稿同样把 `dist/` 作为一个站点服务（`serve(dir, '/slides/')`，`buildFixture` 自动这样做）。并行的检出各用一对端口；端口被占用时报错，不复用别处的服务。幻灯片通过 `/<页号>?clicks=<步骤>` 定位，演讲者视图为 `/presenter/<页号>`。
- 需要专用文稿的用例（宿主适配、另一种界面语言、性能、课堂服务）在 `beforeAll` 中把测试文稿写到 `examples/demo/.presmium/e2e-*`（不入库，插件从示例文稿的依赖中解析），用真实的 `presmium build` 构建，再在空闲端口上服务产物。测试文稿放在 `e2e/fixtures/<组>/`。
- 性能用例（`e2e/perf.spec.ts`，N-01、N-02）是单独的 Playwright 项目，依赖 Chromium 项目，在其他用例结束后运行，计时不与其他用例争用机器。单独运行它要加 `--no-deps`：`pnpm exec playwright test e2e/perf.spec.ts --no-deps`；不加时 Playwright 先运行全部 Chromium 用例。
- 其他浏览器：`PRESMIUM_E2E_BROWSERS` 列出冒烟用例另外运行的浏览器，默认 `firefox,webkit`。没有安装，或在本机无法启动的浏览器（WebKit 需要很多 Linux 主机缺少的系统库）被跳过，并提示安装命令（`pnpm exec playwright install <浏览器>`、`pnpm exec playwright install-deps <浏览器>`）；WebKit 也可以在 Playwright 的 Docker 镜像中运行（`browsers.md`）。真实的 Safari、Edge 与前一个大版本在发布前按 `browsers.md` 手工检查并记录。
- 集成测试分两个 Vitest 项目（`vitest.config.ts`）：`integration` 与 `export`。`export` 是运行 `slidev export` 的三个测试文件（`render-slides/test/slides.test.ts`、`addon-publish/test/export.test.ts`、`diff.test.ts`），在 `integration` 结束后运行：`slidev export` 用 Slidev 的开发服务器服务文稿，等浏览器空闲后打印，机器被其他用例的构建占满时它会在页面就绪前截图或超时。单独运行一组：`pnpm exec vitest run --project export`。
- 集成测试运行 CLI 用 `@presmium/cli/testing` 的 `presmium(cwd, args, env?)`：它去掉 Vitest 设置的 `NODE_ENV=test`，构建与作者、端到端用例在同一模式下运行。端到端的测试文稿与服务用 `e2e/fixtures/deck.ts` 的 `useFixture`、`buildFixture`、`serve`、`startDev`、`openSlide` 等。
- 手工起的静态服务器在重新构建后要重启：sirv 启动时读取一次文件列表，之后新生成的文件（带哈希的 `assets/`）它找不到，页面报 404 或白屏；经常重建时用 `sirv --dev` 启动，它每次请求都查找文件。

v0.8 的外部服务一律用说同一协议的真实实现来测试，不 mock 宿主框架，也不在进程内替换被测的边界：

| 对象 | 测试方式 |
|---|---|
| 服务端 | 对测试文稿真正运行 `presmium dev` 与 `presmium serve`，用 `fetch` 访问渲染端开发服务器代理过来的 `/__presmium/` 路由；部署时的登录由测试请求带上登录代理会加的请求头（`X-Forwarded-User` 等与共享密钥）模拟，不带的请求必须被拒绝 |
| 远端环境 | `templates/env/compose/` 的模板起一个真实的 `jupyter_server`，浏览器与编译时都在其中运行代码；会话隔离用两个浏览器上下文验证。本机没有 Docker 时这些用例跳过并说明原因（同本地环境插件） |
| WebAssembly | 真实的 WASI 运行时；编译时把构建机的 `PATH` 换成不含 C 工具链的目录，证明不需要本机工具链；断网（`context.setOffline(true)`）验证离线 |
| WebGPU | 默认的无头 Chromium 没有 GPU 适配器，正好验证回退；用例另以 `test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] } })` 验证执行路径与“CPU 模拟”的计时标注 |
| MCP | MCP SDK 的客户端（`@modelcontextprotocol/client`）连接 `/mcp` 与 `presmium-mcp`，逐个调用工具；确认经控制通道回答 |
| agent | ACP 协议的确定性测试 agent（`packages/addon-assistant/test/fixtures/scripted-agent.mjs`，用 `@agentclientprotocol/sdk` 的 agent 端写成的真实子进程）：按测试给出的脚本读取 MCP 工具、修改文件、请求权限、给出带引用的回答；助手按 `PRESMIUM_AGENT_COMMAND` 或 `settings.presmium.assistant.command` 启动它，与启动 DeepSeek Harness 走同一条路。真实 DeepSeek Harness 的用例需要模型凭据，默认跳过；`dsh --dump-config` 校验配置模板的用例对固定版本运行 |
| 语音 | 确定性的假引擎（`presmium-speech fake`）：真实的 HTTP 服务，同一协议，测试经 `PRESMIUM_SPEECH_FAKE_URL` 把它定义为引擎 `fake`（与真实引擎同一条配置路径）；中文每字 220 ms、拉丁字母每字 60 ms、词间 80 ms，合成的 WAV 中嵌入文字与音色，合成后再转写可以精确往返；音色列表中有一个克隆音色，用于同意记录的用例；用例数它收到的请求，验证缓存命中时不再合成。火山引擎与 Groq 的冒烟用例只在设置了 `PRESMIUM_TEST_VOLCENGINE_KEY`、`PRESMIUM_TEST_GROQ_KEY` 时运行 |
| 讲授 | 录制：Chromium 的假麦克风播放假引擎合成的音频（`--use-fake-ui-for-media-stream`、`--use-fake-device-for-media-stream`、`--use-file-for-fake-audio-capture=<wav>%noloop`，以 `test.use({ launchOptions })` 只加在讲授的用例上），讲授轨中有 `go` 与 `point`，回放到时刻 t 显示正确的章节与步骤；脚本化：用假引擎构建测试讲义，检查片段、VTT 与提示标记的时刻 |
| 工作区 | 临时目录中的真实 git 仓库：文档操作与撤销各形成正确的提交（读 `git log` 与尾注）；部署模板的冒烟用例需要 Docker，没有时跳过 |

这些用例的启动参数只加在各自的 spec 中，`playwright.config.ts` 不为它们增加项目。需要 Docker、GPU 或模型凭据的用例跳过时打印原因与启用方法，不算失败。

辅助命令（插件包与服务包的可执行文件）：

| 命令 | 包 | 选项 | 作用 |
|---|---|---|---|
| `presmium-export [deck]` | `@presmium/slidev-addon-publish` | `--format pdf\|png`、`--output <file>`、`--with-clicks`（每步一页）、`--range <1,3-5>`、`--dark`、`--timeout <ms>`、`--json` | 准备幻灯片渲染端的 Slidev 文稿（不完整构建）后运行 `slidev export`；`slidev export` 在根路径服务文稿，所以文稿按 `base` 为 `/` 准备（`prepare` 的 `base` 选项），不论幻灯片构建时的站点路径；PDF 导出后检查每个链接仍是链接（PNG 报告链接无法检查） |
| `presmium-diff <refA> <refB> [deck]` | 同上 | `--out <dir>`、`--threshold <ratio>`、`--wait <ms>`、`--install`、`--json` | 两个提交的视觉差异：幻灯片逐页，网页逐页（文档视图）与逐节（放映视图）截图比较，报告写在 `.presmium/diff/` |
| `presmium-classroom-server` | `@presmium/classroom-server` | `--port <n>`（默认 1234，`0` 取空闲端口）、`--host <address>`（默认全部网卡）、`--deck <dir>`（归档写到 `<dir>/.presmium/classroom/`） | 课堂服务（y-websocket）；启动后打印服务地址与局域网地址 |
| `presmium-language-server` | `@presmium/language-server` | `--stdio`、`--node-ipc`、`--socket=<port>` | 语言服务，VS Code 扩展启动它 |
| `presmium-mcp [deck]` | `@presmium/mcp` | `--allow operate`（不加时不提供操作类工具） | 以 stdio 提供与 `/mcp` 相同的读取类工具，供编辑器中的 agent（Claude Code、Codex、VS Code）使用；没有放映位置与课堂（WP-78） |
| `presmium-lecture export [deck]` | `@presmium/slidev-addon-lecture` | `--track <id>`、`--out <file>`（`.webm` 或 `.mp4`）、`--size <宽x高>`、`--fps <n>` | 用 Playwright 播放讲授并与音频合成为视频文件（P-135，WP-83） |
| `presmium-speech fake`、`presmium-speech serve` | `@presmium/slidev-addon-speech` | `--port <n>`；`serve` 另有 `--engine <id>` | 确定性的假引擎；单独运行的语音网关（WP-82） |

## 8. 需求覆盖

“验证”一栏给出验收用例所在的文件：`e2e/` 下为端到端用例，其余为 `packages/` 下的集成用例。

| 需求 | 包 | 验证 |
|---|---|---|
| K-01 文稿源码模型 | compiler | `cli/test/ir.test.ts`、`cli/test/build.test.ts`（章节 ID、源码位置、`{include}`） |
| K-02 语法扩展点 | compiler、各插件 | 插件指令的集成用例（如 `addon-exec/test/compile.test.ts`）与端到端用例 |
| K-03 渲染管线 | viewer、render-slides | `e2e/web.spec.ts`（示例文稿的每个插件组件在网页中渲染）、`e2e/content.spec.ts`（Web 组件） |
| K-04 步骤时间轴 | host、addon-core、viewer | `e2e/core.spec.ts`（跳到第 N 步与顺序前进的 DOM 一致）、`e2e/exec.spec.ts`、`e2e/guide.spec.ts` |
| K-05 视图 | addon-core、viewer | `e2e/core.spec.ts`（演讲者面板只在演讲者视图出现）、`e2e/viewer.spec.ts`（放映视图与演讲者窗口） |
| K-06 状态与事件 | host、addon-core、web、addon-session | `e2e/session.spec.ts`（两种形态的跨设备跟随）、`e2e/web.spec.ts` 与 `e2e/core.spec.ts`（网页与幻灯片形态的 `useSharedState`：跨窗口与后开的窗口，`remote` 经同步传输往返；幻灯片形态中本地变化与远端值在同一个任务中先后到达时按顺序生效；同源同名、基础路径不同的文稿不共享窗口通道） |
| K-07 插件宿主 | kernel、host、addon-core、web、compiler | `e2e/core.spec.ts`、`e2e/web.spec.ts`（启动报告、降级、出错组件的隔离、章节配置、生命周期）、`scripts/check-plugins.mjs`（Node 插件声明内核范围） |
| K-08 服务注册 | kernel | `e2e/core.spec.ts`（依赖方拿到提供方的实现；缺少必需服务的插件被禁用） |
| K-09 工作区访问 | compiler、addon-exec-local、addon-stage | `e2e/viewer.spec.ts`（`presmium dev` 跟随读取过的文件）、`addon-exec-local/test/local-env.test.ts`（两种形态的开发服务器端点）、`addon-stage/test/drawings.test.ts`（标注写回） |
| K-10 锚点接口 | kernel、addon-code | `addon-code/test/check.test.ts`、`cli/test/check.test.ts` |
| K-11 实时预览 | compiler、cli、viewer | `e2e/viewer.spec.ts`（300 ms 内更新，保持视图、步骤与滚动位置） |
| K-12 构建与导出 | render-slides、addon-publish | `addon-publish/test/export.test.ts`（按步骤导出 PDF，保留链接）、`render-slides/test/slides.test.ts`（静态导出显示降级内容） |
| K-13 可复现性 | 全部 | `cli/test/build.test.ts`（在不同目录构建的产物一致）、`addon-exec-local/test/local-env.test.ts`（产物不含工作区的本机路径）、`addon-exec/test/compile.test.ts`（没有运行环境时使用已提交的缓存） |
| K-14 主题与布局 | render-slides、web | `e2e/stage.spec.ts`、`e2e/web.spec.ts` |
| K-15 输入映射 | addon-stage | `e2e/stage.spec.ts`（`b`、`f` 快捷键） |
| K-16 诊断与检查 | cli | `cli/test/check.test.ts`（失效锚点使退出码非零，诊断带源码位置） |
| K-17 中间表示 | kernel、compiler | `cli/test/ir.test.ts`（schema 校验、重复编译一致） |
| K-18 可插拔渲染端 | compiler、render-notebook | `cli/test/build.test.ts`、`render-notebook/test/notebook.test.ts`（MyST 节点写成 Jupyter 能显示的 Markdown，无法转换的节点列入构建报告） |
| K-19 编译时执行与缓存 | compiler、addon-exec | `addon-exec/test/compile.test.ts` |
| K-20 运行时视图 | viewer | `e2e/viewer.spec.ts` |
| N-01 启动性能 | 全部 | `e2e/perf.spec.ts`（100 个章节的文稿：首张幻灯片、网页的第一个章节与放映视图在 2 s 内可见） |
| N-02 翻页性能 | 全部 | `e2e/perf.spec.ts`（幻灯片的点击与翻页、网页放映视图的一步在 100 ms 内渲染） |
| N-03 离线 | addon-publish、web | `e2e/publish.spec.ts`、`e2e/web.spec.ts`（断网后放映与搜索）、`addon-publish/test/offline.test.ts`、`web/test/offline.test.ts` |
| N-04 浏览器 | — | 全部端到端用例在 Chromium 中运行，`e2e/smoke.spec.ts` 另在 Firefox 与 WebKit 中运行（WebKit 无法在本机启动时在 Playwright 的 Docker 镜像中运行）；WebKit 的全量运行结果与 Safari、Edge 的手工检查见 `browsers.md` |
| N-05 显示 | web、viewer | `e2e/web.spec.ts`（手机视口无横向滚动） |
| N-06 无障碍基线 | host、addon-guide、addon-publish、web | `e2e/core.spec.ts`、`e2e/guide.spec.ts`（减少动态效果、键盘操作）、`e2e/publish.spec.ts`（高对比度达到 WCAG AA）、`e2e/web.spec.ts`（字号缩放） |
| N-07 界面语言 | 全部 | en-US 测试文稿上的英文界面：`e2e/core.spec.ts`、`e2e/web.spec.ts`（`e2e/fixtures/core/deck`：`<html lang>`、启动报告、两种形态的外壳与互相链接）、`e2e/viewer.spec.ts`（`e2e/fixtures/viewer/en`：放映视图、演讲者窗口、黑屏与代码块控件）、`e2e/classroom.spec.ts`“an English deck”（会话面板、加入表单与测验）、`e2e/exec.spec.ts`（`e2e/fixtures/exec/english`，`lang: fr`，Presmium 没有对应文本的语言：执行面板、本地环境、高对比度开关随浏览器为英文）；开发服务器端点的回答与导出环境的说明文件见 `addon-exec-local/test/local-env.test.ts` |
| P-01 至 P-04 | addon-stage | `e2e/stage.spec.ts` |
| P-10 至 P-16 | addon-code | `addon-code/test/check.test.ts`、`e2e/code.spec.ts`（两种形态） |
| P-20、P-21、P-23、P-24 | addon-exec | `e2e/exec.spec.ts`（Python、JavaScript、TypeScript，两种形态；定时器稍后的输出与稍后的 Promise 拒绝在编译时与浏览器中一致；浏览器中的运行互不影响；放映视图与手机上的版面；文档视图中分步执行的步进控件）、`addon-exec/test/compile.test.ts`（编译时执行；章节配置的超时；失败或超时的运行显示预录输出；执行面板的降级内容含参数与编译时输出；任意语言的执行面板生成幻灯片） |
| P-22、P-25、P-26 | addon-exec-local | `addon-exec-local/test/local-env.test.ts`（没有 Docker 时跳过容器用例；容器中的请求带文件与参数；镜像构建超时后下一次重新构建；一份文稿一个工作区）、`e2e/exec-local.spec.ts`；P-25 的编辑回写端点已移出范围（WP-44） |
| P-30 至 P-32 | addon-guide | `e2e/guide.spec.ts` |
| P-40 至 P-43 | addon-content | `e2e/content.spec.ts`（两种形态） |
| P-50 | addon-publish | `addon-publish/test/export.test.ts`（`{code-ref}` 生成的永久链接在每个步骤页上都是链接） |
| P-51 | addon-publish | `addon-publish/test/offline.test.ts`、`e2e/publish.spec.ts` |
| P-52 | addon-publish | `e2e/publish.spec.ts`（每个页面的工具栏开关、每张幻灯片达到 AA） |
| P-53 | addon-publish | `addon-publish/test/diff.test.ts`（含 `--install` 的宿主或插件升级回归） |
| P-60 至 P-67 | addon-session、classroom-server、addon-classroom | `e2e/session.spec.ts`、`e2e/classroom.spec.ts`（真实课堂服务，多个浏览器上下文接入同一课堂）、`classroom-server/test/server.test.ts`、`addon-classroom/test/notebook.test.ts` |
| P-70 至 P-74 | web、viewer | `e2e/web.spec.ts`、`e2e/viewer.spec.ts` |
| P-75 | render-notebook、addon-exec | `render-notebook/test/notebook.test.ts`、`render-notebook/test/demo.test.ts`（示例文稿的 notebook 从头到尾运行）、`addon-exec/test/compile.test.ts`（执行面板的单元格带编译时输出或预录输出） |
| P-76 | render-slides | `render-slides/test/slides.test.ts`、幻灯片形态的端到端用例 |
| P-77 | viewer | `e2e/viewer.spec.ts` |
| P-80、P-81 | language-server、vscode | `language-server/test/lsp.test.ts`、`vscode/test/build.test.ts` |

v0.8 新增需求的验证由各工作包写入（`wbs.md`），以下是计划中的位置，合并后照实更新：

| 需求 | 包 | 验证（工作包） |
|---|---|---|
| K-08 Node 端服务、服务端贡献、运营者设置、行内角色、N-08 本机检查 | server、compiler、cli、host、viewer | `server/test/server.test.ts`、`e2e/server.spec.ts`、`cli/test/roles.test.ts`、`cli/test/assets.test.ts`（WP-73a） |
| P-46 卡片、栅格、选项卡、按钮 | compiler、kernel、viewer | `e2e/content.spec.ts`、`render-notebook/test/cards.test.ts`（WP-85） |
| P-42 增补 封面与字幕轨 | addon-content | `e2e/content.spec.ts`、`addon-content/test/media.test.ts`（WP-85） |
| P-54 发布检查、P-55 受众范围 | compiler、cli | `cli/test/publish-checks.test.ts`、`cli/test/audience.test.ts`（WP-87） |
| P-68 先预测再揭示 | addon-classroom | `e2e/predict.spec.ts`、`addon-classroom/test/predict.test.ts`（WP-88） |
| P-78、P-79、P-123，P-122 增补 | web、workspace、render-slides、render-notebook、compiler | `e2e/site.spec.ts`、`web/test/translations.test.ts`（WP-86） |
| P-100 至 P-102 | compiler、addon-exec、addon-exec-local、viewer、render-slides、render-notebook | `e2e/exec-env.spec.ts`、`addon-exec/test/session.test.ts`、`render-notebook/test/outputs.test.ts`、`cli/test/env.test.ts`（WP-73b） |
| P-103 | addon-exec-wasi | `e2e/exec-wasi.spec.ts`、`addon-exec-wasi/test/compile.test.ts`（WP-74） |
| P-104 | addon-exec-webgpu、addon-exec | `e2e/exec-webgpu.spec.ts`、`addon-exec-webgpu/test/record.test.ts`（WP-75） |
| P-105 至 P-107 | addon-exec-jupyter、templates/env | `e2e/exec-remote.spec.ts`、`addon-exec-jupyter/test/remote.test.ts`、`addon-exec-jupyter/test/credentials.test.ts`（WP-76） |
| P-110 | mcp | `mcp/test/mcp.test.ts`、`e2e/mcp.spec.ts`（WP-78） |
| P-111、P-112 | addon-assistant、addon-classroom | `addon-assistant/test/acp.test.ts`、`addon-assistant/test/dsh.test.ts`、`e2e/assistant.spec.ts`（WP-80） |
| P-113 至 P-115 | addon-assistant、workspace | `e2e/assistant-edit.spec.ts`（WP-81）、`workspace/test/documents.test.ts`（WP-79） |
| P-120 至 P-122、N-09 | workspace、web、cli、addon-assistant | `workspace/test/documents.test.ts`、`workspace/test/site.test.ts`、`workspace/test/deploy.test.ts`、`cli/test/serve.test.ts`、`e2e/workspace.spec.ts`（WP-79）；P-121 中由 agent 起草见 `e2e/assistant-edit.spec.ts`（WP-81） |
| P-90、P-130、P-131、P-137 | addon-lecture、addon-guide | `e2e/lecture.spec.ts`、`addon-lecture/test/track.test.ts`（WP-77）；由 agent 生成译文见 `e2e/lecture-writeback.spec.ts`（WP-84） |
| P-132、P-133 | addon-speech、addon-lecture | `addon-speech/test/speech.test.ts`、`addon-speech/test/engines.test.ts`（WP-82）；讲授轨中的转写与换音色见 `e2e/lecture-script.spec.ts`（WP-83） |
| P-134、P-135 | addon-lecture | `e2e/lecture-script.spec.ts`、`addon-lecture/test/script.test.ts`、`addon-lecture/test/video.test.ts`（WP-83） |
| P-136 | addon-lecture | `e2e/lecture-writeback.spec.ts`（WP-84） |
| N-08 安全基线 | server、mcp、addon-assistant、workspace、addon-speech、addon-exec-jupyter、addon-lecture | 各工作包的拒绝用例：外来 `Host`、`Origin`、缺令牌、缺登录、读者调用编辑者的路由、未确认的操作类工具、作废的会话令牌、`tutor` 模式的写入、文稿把凭据引向别的地址（WP-76、WP-82）、没有同意记录的克隆音色（WP-82）；服务提供方的标明：`e2e/assistant.spec.ts`（WP-80）、`addon-speech/test/speech.test.ts`（WP-82）、`e2e/lecture-script.spec.ts`（WP-83）（第 11 节） |

## 9. 已知风险

### 9.1 仍在使用的框架内部接口

下表列出代码仍依赖、而框架文档没有写明的接口，以及升级框架后会暴露变化的用例。升级 Slidev 或 VitePress 时先运行这些用例。

| 内部接口 | 位置 | 守护用例 | 后续 |
|---|---|---|---|
| VitePress 1.6 本地搜索的虚拟模块 `/@localSearchIndex`、`/@localSearchIndexroot`，以及搜索框对索引模块的热更新：开发与构建中都拦截这两个模块，换成网页渲染端从 IR 生成的索引（与 VitePress 同样的 MiniSearch 索引，每个章节一个文档，按文稿顺序加入）。构建中索引因此确定，产物与 Service Worker 的缓存版本在每次构建中相同（VitePress 并发建索引，顺序取决于页面完成的先后）；开发中索引随编辑更新（VitePress 1.6 开发模式只在启动时建索引） | `packages/web/src/node/vite.ts` | `e2e/web.spec.ts`“a Chinese keyword is found within 300 ms”与“search keeps working offline”（构建）、`e2e/viewer.spec.ts`“a keyword written while the server runs can be searched”（开发）、`cli/test/repro.test.ts`（重复构建的字节一致） | VitePress 固定为 1.6.4；VitePress 提供确定的构建索引与开发中的索引更新后移除拦截 |
| Slidev 的根组件钩子 `setup/root.ts`（`defineRootSetup` 只出现在 `@slidev/types` 的类型中，文档没有列出），以及它在全部 `setup/main.ts` 之后运行的顺序：幻灯片形态在这里启动内核，发布插件在这里读取打印模式 | `packages/addon-core/setup/root.ts`、`packages/addon-publish/setup/root.ts` | `e2e/core.spec.ts`（启动报告与服务依赖）、`addon-publish/test/export.test.ts` 与 `diff.test.ts`（打印与视觉差异的样式） | 改用文档化的钩子或全局图层 |
| Slidev 幻灯片内容层的类名 `.slidev-slide-content`：冻结画面复制它的各层 | `packages/addon-stage/global-top.vue` | `e2e/stage.spec.ts`“f freezes the audience view” | 改用全局图层自己的结构 |
| Slidev 演讲者备注的类名 `.slidev-note-with-clicks`、`.slidev-note-fade`：突出当前步骤的备注 | `packages/addon-stage/style.css` | `e2e/stage.spec.ts`“presenter notes highlight the current step” | 没有文档化的替代，由用例守护 |
| Slidev 绘图的状态 `drawingState`（`@slidev/client` 导出，形状为页号到该页 SVG 的映射，文档没有描述）与开发服务器保存标注的文件名 `<页号>.svg`：舞台插件把标注写回文稿的 `.presmium/drawings/`，删除一页的全部标注时删去该文件 | `packages/addon-stage/setup/main.ts`、`packages/addon-stage/setup/vite-plugins.ts` | `addon-stage/test/drawings.test.ts` | Slidev 提供写回标注的钩子后改用 |
| VitePress 默认主题给侧栏与上下章链接的屏幕阅读器标签的元素 ID `sidebar-aria-label`、`doc-footer-aria-label`（主题配置没有这两个标签）：网页主题在页面渲染后与每次换页后按文稿语言改写它们的文字（5.7 节） | `packages/web/src/client/theme.ts` | `e2e/web.spec.ts`“a zh-CN deck speaks Chinese around the content” | VitePress 提供对应的主题配置后改用 |
| VitePress 默认主题的内部 DOM（文档只给出 CSS 变量、布局插槽与主题配置）：网页样式中导航栏标题的 `.VPNavBar .container > .title`、`.VPNavBarTitle a.title > span`（长标题换行而不压住导航），侧栏一级条目的 `.VPSidebarItem.level-1 > .item .text`（章的字重）。能改用 CSS 变量、布局插槽或侧栏项的 `class` 的选择器已经改掉，这里列出的是保留的 | `packages/web/src/client/style.css` | `e2e/web.spec.ts` 的长标题用例与侧栏字重的断言 | VitePress 提供对应的 CSS 变量或插槽后改用 |

已经去掉的依赖：高对比度主题原先按 Slidev 的类名 `.slidev-code-dishonored` 提高被代码步骤淡化的行的不透明度。现在发布插件读取代码行（Shiki 输出的 `.line`）的计算不透明度，给低于 0.6 的行加上自己的 `data-pm-dimmed` 属性（`packages/addon-publish/src/client/code-lines.ts`），由 `e2e/publish.spec.ts`“every slide reaches WCAG AA”守护。

### 9.2 设计取舍与扩展点缺口

以下取舍原先留给 WP-72（`review-round2.md` 决定 8），WP-72 与 v0.8 的设计一起做出决定，由表中的工作包实现：

| 事项 | 现状与理由 | 决定 |
|---|---|---|
| 共享内核中的业务契约 | `@presmium/kernel` 除元能力外还定义了几个插件共用的业务服务契约：`EXECUTOR` 与 `RunRequest`、`SessionService`、`Role`、`ClassroomStore`，以及代码节点的 `run` 与 `outputs`。这是 4.5 节有意的选择：服务的提供方与使用方分属不同插件，契约只能放在双方都依赖的包中；设计原则 2 已据此修订 | 保留在内核包中。v0.8 又增加语音、智能体、修改历史、确认与操作词汇，`contracts.ts` 按领域拆为几个模块并统一再导出，入口 `@presmium/kernel/contracts` 不变（WP-73a）。全部包都是私有的，移到单独的契约包成本很低，留到 v0.8 的契约稳定之后（K 波次之后再评估） |
| 网页的 Service Worker 手写 | 网页渲染端在 VitePress 构建完成后生成约 70 行的 Service Worker（`packages/web/src/node/offline.ts`）：此时页面、搜索索引与 Pyodide 运行时都已写出，按产物内容计算缓存版本，并把无扩展名的页面地址对应到 `.html`。`vite-plugin-pwa` 只用于幻灯片形态：VitePress 在 Vite 客户端构建之后才渲染 HTML 页面，在 Vite 构建中生成的预缓存清单拿不到这些页面，需要专门的 `@vite-pwa/vitepress` 集成 | 保留手写的 Service Worker：它预缓存产物中的全部文件，所以 v0.8 新增的 WASI 运行时、发布的文件（P-79）与同站点下讲授的片段都在离线范围内，不需要新的机制。不再计划换成 `@vite-pwa/vitepress` |
| 网页按插件 ID 读取发布插件的配置 | `packages/web/src/domain/config.ts` 读取 `presmium.publish` 的 `offline` 决定是否生成 Service Worker：网页渲染端因此知道一个插件的配置键 | 保留。这是一个只读的配置键，代价小于为此增加渲染端扩展点；v0.8 中没有第二个插件需要参与网页构建（P-79 的文件发布属于网页渲染端自己） |
| 幻灯片形态中的现场执行代码块 | 带 `:run: live` 或 `:run: both` 的普通代码块在网页形态中有运行按钮；幻灯片渲染端把它写成普通代码块，没有运行按钮，只有执行面板能在幻灯片中运行代码。`setup/code-runners.ts` 已经通过 `executor` 服务支持 Slidev 的 Monaco Runner（Python、JavaScript、TypeScript），但 MyST 源码无法写出 `{monaco-run}` | 幻灯片渲染端把带 `live` 或 `both` 的代码块写成 Slidev 文档化的 `{monaco-run}` 代码块，执行插件的 code runner 把 `executor`、`session` 放进请求，富输出按 Slidev code runner 的 HTML 输出显示（WP-73b） |
| 课堂笔记依赖 IR 运行时的标记 | 课堂插件的笔记图层按 `.pm-section[data-section]`、`.pm-block[data-block]` 定位章节与块。这两个属性因此是 IR 运行时对外的契约，修改时须同时修改笔记图层 | 正式作为 IR 运行时对外的标记契约：讲授的指针录制与编辑模式的批注同样据此定位，`domain-model.md` 第 9 节列出，`e2e/web.spec.ts`（每个块渲染为 `.pm-section[data-section] .pm-block[data-block]`）与 `e2e/classroom.spec.ts`（笔记按这两个属性定位）守护。不另加挂载点接口 |
| 首选执行器 | 代码块的 `:executor:` 在浏览器中只是首选：指定的执行器没有注册或不支持该语言时，由路由按语言与优先级另选 | `RunRequest.executor` 精确匹配，指定的执行器不可用时返回失败，由 P-24 显示录制输出，不回退到其他执行器（`review-round2.md` 决定 5，WP-73b） |
| 本地环境的 Python 运行器 | 容器执行器在容器中运行自己的 Python 运行器（`packages/addon-exec-local/src/node/runner.py`），按 `RunRequest` 的约定处理参数、标准输入与文件，与执行插件的运行器（`packages/addon-exec/src/runner.py`）规则相同。两个插件包不互相引用（第 3 节），所以各有一份 | 运行器作为共享内核的资源发布（`@presmium/kernel/runner.py`，`package.json` 的 `exports` 指向文件；内核不读它，只发布），两个插件共用，会话与富输出也只实现一次（WP-73b） |

### 9.3 框架的已知问题

| 问题 | 来源 | 影响与处理 | 守护用例 |
|---|---|---|---|
| 幻灯片形态在 Slidev 的开发服务器中（`presmium dev --to slides`、`slidev export` 与 `presmium-export`）控制台报 “Failed to patch FloatingVue: TypeError: Cannot read properties of undefined (reading 'Popper')”；构建产物中不出现 | Slidev 53 的 `setup/main.ts` 在每份文稿中安装 `@shikijs/vitepress-twoslash` 4.5 的 Twoslash 弹出层；它对 floating-vue 菜单组件的补丁按旧的组件结构查找 `components.Popper`，而 Slidev 依赖的 floating-vue 5.4 的菜单组件已没有这个结构（三者都是 npm 上的最新版本） | 只影响在 Twoslash 弹出层上拖动时不弹出，生成的文稿不含 Twoslash 代码；错误被它自己捕获并打印，不影响页面。不打补丁，等上游修复 | `e2e/smoke.spec.ts`“the slides open … with no error in the console”：控制台没有其他错误 |
| 测试中的幻灯片控制台报 “Wake Lock permission request denied” | Slidev 的 `wakeLock` 选项（默认开启）在放映时请求屏幕常亮，Playwright 驱动的浏览器拒绝请求 | 被拒绝时只多这一条错误，页面照常；讲者的浏览器允许时屏幕在放映中保持常亮，所以不关闭该选项 | 同上 |


## 10. 服务端与部署

### 10.1 进程与拓扑

| 进程 | 作用 | 何时需要 |
|---|---|---|
| `presmium dev` 或 `presmium serve` | 编译、实时推送、服务端（插件的服务端贡献、MCP、agent 适配、修改提交、控制通道） | 编辑、agent、远端环境的代理模式、语音 |
| agent（默认 DeepSeek Harness，子进程，ACP over stdio） | agent | 使用助手时 |
| 课堂服务 `presmium-classroom-server` | 课堂同步（P-61），不变 | 开课时 |
| Jupyter Server（容器或集群） | 远端执行 | 使用远端环境时 |

```
presmium dev（一份文稿，本机）
  浏览器 ──► 网页开发服务器（VitePress 子进程）──┐
         ──► 幻灯片开发服务器（Slidev）─────────┤ Vite 的 server.proxy：/__presmium/（含 WebSocket）
                                               ▼
                       Presmium 服务端（presmium dev 的主进程，127.0.0.1:<空闲端口>）
                       ├ /__presmium/<插件 ID>/…          插件的路由与反向代理
                       ├ /__presmium/presmium.server/…    握手（hello）、控制通道（control）
                       └ /mcp                             MCP（令牌）

presmium serve（工作区，部署时在登录代理之后）
  浏览器 ──► 登录代理（oauth2-proxy）──► Presmium 服务端（唯一对外的端口）
                                        ├ /__presmium/…、/mcp      同上，按成员与角色
                                        └ 其余路径 ──► 工作区站点的网页开发服务器（VitePress 子进程，只监听本机，含 HMR 的 WebSocket）
```

服务端在主进程中，而不是作为 Vite 中间件挂在开发服务器里：网页的开发服务器是 VitePress 命令行起的子进程（`packages/web/src/node/vitepress.ts`），编译结果、执行器、MCP 与 agent 适配都在主进程中。渲染端只需在开发服务器的 Vite 配置中加一条代理（`RenderContext.server`）：网页渲染端写进生成的 VitePress 配置，幻灯片渲染端写进生成的 Slidev 项目的 `vite.config.ts`（Slidev 文档化的配置文件）。浏览器因此总是同源访问 `/__presmium/`，没有跨域请求，登录代理的 Cookie 也照常带上。

静态构建产物不依赖服务端：渲染端不写服务端地址，`useServer().available` 为 false。浏览器内执行（Pyodide、WASI、WebGPU）、预先合成的讲授音频与录制输出照常可用；agent、远端环境的代理模式与实时转写隐藏或降级。

### 10.2 挂载

- **路径**：插件 `server(ctx)` 的贡献挂在 `/__presmium/<插件 ID>/` 下；服务端自己的路由在 `/__presmium/presmium.server/`：`hello`（成员、文档、可用的功能，读者可用）与 `control`（控制通道，10.4 节）；MCP 在 `/mcp`。
- **请求**：路由处理函数用标准 Fetch API 写，不绑定服务器框架；Node 的请求与 Fetch 之间由 `@hono/node-server` 的 `getRequestListener` 转换。流式结果用 SSE（`eventStream`，4.7 节）。
- **文档**：`useServer().fetch` 带上请求头 `Presmium-Document: <文档目录>`，服务端据此给出 `RequestContext.document`，并把请求交给该文档的插件实例。
- **反向代理**：`ProxySpec` 由 `http-proxy-3` 实现，HTTP 与 WebSocket 升级都加上 `headers`（例如远端环境的 `Authorization`），浏览器拿不到这些头。
- **宿主进程的接口**：启动服务端的命令给它一个 `ServerHost`（`@presmium/server` 自己的类型，不是内核契约）：文档列表、编译结果与诊断、运行检查、构建。`presmium dev` 由 CLI 在它的编译器上实现，`presmium serve` 由工作区实现；控制通道经它读取文稿。
- **MCP 的挂载**：`@presmium/mcp` 声明自己需要的宿主接口 `McpHost`（文档列表、编译结果与诊断、检查、构建、放映位置及其变化、课堂状态、跳转与开关课堂、确认），导出 `createPresmiumMcp(host)`。服务端引用 `@presmium/mcp`，在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost` 并把它挂在 `/mcp`；`presmium-mcp` 在编译器上实现它（没有放映位置与课堂）。`mcp` 不引用 `server`（第 3 节），依赖只有 `server → mcp` 一个方向。
- **运营者设置**：`startServer` 接受 `settings`（插件 ID 到设置），交给各插件的 `ServerContext.settings` 与 `NodeServiceContext.settings`。`presmium dev`、`build`、`check` 读取工作区根目录 `presmium.workspace.yaml` 的 `settings`（没有该文件时为空），`presmium serve` 由工作区读取同一个键；都只在进程启动时读取一次，运行中改动配置文件不生效，直到运营者重启（`ir.md` 第 10 节）。
- **生命周期**：`presmium dev` 启动时为文稿创建一次各插件的贡献，头部的 `plugins` 变化时照旧提示重启；`presmium serve` 在一份文档第一次被请求时创建它的贡献。Node 端服务（`services`）与贡献使用同一份文稿配置与运营者设置；服务端另外登记 `APPROVALS` 与 `MCP_ENDPOINT`，工作区登记 `REVISIONS`。
- **端口**：`presmium dev` 的服务端默认取空闲端口（`--server-port` 指定），启动时打印 MCP 地址；`presmium serve` 用 `--port`（默认 4310）与 `--host`（默认 `127.0.0.1`）。

### 10.3 登录与权限

- **`presmium dev`**：只监听本机。服务端检查 `Host` 是 `localhost`、`127.0.0.1` 或 `[::1]`（任何端口），`Origin` 缺省或同样是本机的地址（任何端口，因为页面来自渲染端的开发服务器，经它的代理转发），挡住 DNS 重绑定与其他网站的请求（MCP SDK 的 `localhostAllowedHostnames`、`localhostAllowedOrigins` 做法相同）。成员是本机作者，角色为所有者。`/mcp` 另外要求 `Authorization: Bearer <令牌>`，接受两种令牌：每个进程随机生成的令牌，打印在终端并写入 `<文稿>/.presmium/server.json`（权限 0600，不入库），供作者在编辑器中使用的 agent（Claude Code、Codex 等）连接，模式为 `author`；以及服务端经 `MCP_ENDPOINT` 为助手的每个 agent 会话签发的令牌（见下）。
- **`presmium serve`**：默认只监听本机，本机使用不需要登录。监听其他地址时必须配置登录代理，否则拒绝启动：服务端只信任带共享密钥请求头 `X-Presmium-Proxy-Secret`（值来自环境变量 `PRESMIUM_PROXY_SECRET`）的请求，或来自 `--trust-proxy-from <地址>` 的请求。身份取自代理传来的请求头（oauth2-proxy 的 `X-Forwarded-User`、`X-Forwarded-Email`、`X-Forwarded-Preferred-Username`、`X-Forwarded-Groups`）。
- **角色**：读者只能阅读与提问；编辑者可以进入编辑模式、修改与撤销、回答确认；所有者另管工作区设置。角色来自 `presmium.workspace.yaml` 的 `members`（按邮箱或代理传来的组），登录的其他成员是读者。
- **路由的角色**：挂载点按 `Route.role`、`ProxySpec.role`（默认 `editor`）检查；不满足时返回 403，插件不各自检查。
- **MCP 的身份**：助手的服务端路由经 `MCP_ENDPOINT.issue(member, mode)` 为每个 agent 会话取得令牌，令牌绑定成员与模式（`author` 或 `tutor`），放进 ACP `session/new` 的 `mcpServers`，会话关闭时作废。`presmium serve` 中 `/mcp` 只接受这种令牌（没有每进程的令牌）；签发的地址是服务端的本机地址，agent 子进程直接访问，以令牌认证，不经登录代理。`tutor` 令牌只看得到读取类工具。工具的范围由令牌决定，不由请求参数决定。

### 10.4 控制通道与确认

- **控制通道**：`useServer().available` 时，宿主在 `startHost` 中连接 `/__presmium/presmium.server/control`（SSE 接收，POST 报告）。页面报告：自己的位置（`navigation` 服务的位置与视图）、视图角色，以及 `STATUS` 中各插件的摘要（变化时，至多每秒一次）。服务端发来：`go`（经 `navigation.go` 跳转）、`session`（经 `session` 服务开始或结束课堂）、`approval`（确认请求）。MCP 的 `get_position` 返回该成员处于放映或演讲者视图的窗口最近报告的位置，没有时返回任一窗口的位置；`navigate` 向这些窗口发出 `go`，听众视图照旧经已有的通道跟随。
- **确认**：`APPROVALS` 按种类的策略处理：`off` 时这类操作不提供（MCP 不列出对应的工具），`ask`（默认）时把请求经控制通道发给该成员的窗口，没有指定成员时发给全部编辑者与所有者；任一窗口回答即生效，50 秒内（低于 DeepSeek Harness 调用 MCP 工具的 60 秒超时）没有回答视为拒绝。`allow` 只能由本机作者用 `presmium dev --allow <种类,…>` 或工作区所有者在 `presmium.workspace.yaml` 的 `approvals` 中设置，文稿不能设置。
- **确认界面**：宿主在 `PmToolbar` 中加入一个只在有待确认请求时出现的入口，两种形态都显示：说明、发起方、允许与拒绝。
- **发送即确认**：编辑模式中发送一批批注或一条对话消息，就是对这次任务的写入的确认（N-08），助手不再逐个文件询问；写入超出当前文档目录时仍以 `write` 确认。

### 10.5 部署（N-09）

- **本机**：`presmium serve [目录]` 一条命令启动工作区服务；目录中没有 `presmium.workspace.yaml` 而有 `lecture.md` 时，作为只有一份文档的工作区。工作区必须在 git 仓库中，否则编辑功能不可用并提示 `git init`。
- **docker compose**：`templates/workspace/compose/compose.yaml`：oauth2-proxy（唯一发布端口的服务）、工作区服务（不发布端口，只信任代理）、课堂服务，以及与 `templates/env/compose/` 共用覆盖配置的 Jupyter 环境；数据卷是工作区仓库；凭据经 `.env` 传给各容器。
- **Kubernetes**：`templates/workspace/kubernetes/README.md` 与 `templates/env/kubernetes/README.md` 只给文档与清单片段（工作区：带 oauth2-proxy 边车的 Deployment、仓库的 PVC、Service 与 Ingress；远端环境：Zero to JupyterHub 的 `values.yaml` 片段，按 CPU、GPU、MIG 划分的配置，gVisor 的 `runtimeClassName`，回收设置，以及 agent-sandbox 的模板），不维护 Helm chart。集群、GPU Operator、gVisor 或 Kata 的安装、入口与证书、身份提供方由用户负责。
- 静态构建产物仍可发布到任意静态托管。

## 11. 安全（N-08）

| 风险 | 措施 |
|---|---|
| 本机端点被其他网站或进程调用 | 默认只监听本机；校验 `Host` 与 `Origin`；MCP 要求每个进程独有的令牌 |
| 部署时绕过登录 | 监听非本机地址时必须配置登录代理；只信任带共享密钥或来自固定地址的请求；工作区服务的端口在 compose 模板中不发布 |
| agent 误改或越权 | 只写工作区中的源码；超出当前文档目录要确认；一批一提交，可撤销；操作类与计费类工具、agent 自身的权限请求都要确认；确认的关口在我们的服务端 |
| 文稿关闭安全设置 | 确认策略、agent 的启动命令与模型、录音的去处、是否允许克隆音色都不从文稿读取，只来自命令行、环境变量与工作区配置（插件经 `settings` 得到，4.7 节）；工作区配置只在进程启动时读取，改动要等运营者重启才生效；agent 改动它总要以 `write` 确认（即使单份文稿的仓库中它在文档目录里），被拒绝时助手复原该文件 |
| 文稿把服务端的凭据引向别的地址 | 文稿只写环境与引擎的名字，不能决定哪个凭据发往哪个地址：凭据与它的地址由运营者在服务端的环境变量中成对给出。远端环境：`PRESMIUM_ENV_<名>_TOKEN` 只发往 `PRESMIUM_ENV_<名>_URL`，文稿中的 `url` 与它不同源时不连接并给出错误诊断，不回退到通用的变量（如 `JUPYTER_TOKEN`）；没有给出地址时不发送令牌。语音：引擎 `<ID>` 的地址与凭据是 `PRESMIUM_SPEECH_<ID>_URL` 与 `PRESMIUM_SPEECH_<ID>_KEY`（火山引擎的地址固定在适配器中），文稿只用 `engine`、`voice` 选择引擎与音色；文稿中出现 `url`、`keyEnv` 这类字段时是错误，不被使用 |
| 提示注入（学习者的问题、远端输出、网页内容） | 学习者的问题用 `tutor` 运行时：只读，没有 shell、网络、写文件与操作类工具；回答在课堂中公开前可以要求主讲确认 |
| 凭据泄露 | 凭据只在服务端（环境变量、agent 自己的凭据存储）；代理代加凭据；IR 与产物不含凭据；`presmium check` 对文稿头部中像凭据的字段告警（字段名含 `token`、`secret`、`password`、`key` 且值不是环境变量名，或值形如常见的密钥前缀）；启动 agent 子进程时只传入清理过的环境变量 |
| 数据外发 | DeepSeek Harness 的会话日志上传与遥测由配置模板关闭，并以 `DSH_TELEMETRY_MODE=DISABLED` 启动；语音与模型的服务提供方在界面上标明（问答与对话面板写明 `AGENT.provider()`，转写与合成的入口写明 `SpeechEngineInfo.provider`）；运营者没有给出 agent 命令时助手不可用，没有定义的引擎不发出请求；录音只在显式“转写”时发出 |
| 不可信的富输出 | 执行输出中的 HTML 用 DOMPurify 清洗后显示（去掉脚本与事件属性）；幻灯片中以没有脚本权限的沙箱 iframe 显示 |
| GPU 被学习者代码拖垮 | 限制派发规模与重复次数；超时就销毁设备并结束 Worker；监听设备丢失，避免浏览器把站点列入 GPU 黑名单；可以只给录制输出 |
| 生成的产物被 agent 修改 | 幻灯片渲染端在生成的 Slidev 文稿头部写 `mcp: false`，关闭 Slidev 53 开发服务器自带的、会修改生成文稿的 `/__mcp` 端点（原则 6） |
| 音色滥用 | 克隆音色默认关闭：只在运营者设置 `settings.presmium.speech.cloned: true` 时可用，且每个克隆音色要有本人的同意记录 `.presmium/speech/consent/<引擎>/<音色>.json`（说话人、范围、日期、同意声明录音的 sha256），语音服务在合成前检查，缺一即拒绝；合成的音频在播放界面与元数据中标明由 AI 生成（GB 45438-2025、《人工智能生成合成内容标识办法》） |

## 12. 依赖选型（v0.8 新增）

依赖准则沿用 `requirements.md` 5.4 节：只用公开接口，不 fork，不引入 AGPL；版本精确固定，遵守 `pnpm-workspace.yaml` 的最短发布时间。版本是 2026-10 调研时的版本，实现时取当时满足准则的版本。

| 组件 | 版本 | 许可证 | 用途 | 包 |
|---|---|---|---|---|
| `@modelcontextprotocol/server`、`@modelcontextprotocol/node`；测试用 `@modelcontextprotocol/client` | 2.3 | Apache-2.0（既有代码 MIT） | MCP 服务（`createMcpHandler`、`serveStdio`、Host 与 Origin 校验）与测试中的客户端 | mcp |
| `@agentclientprotocol/sdk` | 1.8 | Apache-2.0 | ACP 客户端（助手）与测试 agent | addon-assistant |
| DeepSeek Harness（`@deepseek-ai/dsh`） | 精确固定的预览版（如 0.2.0-rc.2） | MIT | 默认的 agent 运行时，作为子进程用命令启动，不作为库引用；只是开发依赖（测试 `--dump-config`），用户自行安装。它要求 Node 22.19 以上 | addon-assistant |
| `@jupyterlab/services` | 7.6 | BSD-3-Clause | Jupyter 内核与终端协议的客户端，浏览器与 Node 共用 | addon-exec-jupyter |
| `@xterm/xterm`、`@xterm/addon-fit` | 5.x | MIT | 浏览器终端（P-107） | addon-exec-jupyter |
| Runno（`@runno/wasi` 等） | 当前版本 | MIT | 浏览器内的 WASI 运行时与 C、C++、Ruby、SQLite 的二进制；Node 端用同一份二进制（先行验证） | addon-exec-wasi |
| jax-js（`@jax-js/jax`、`@jax-js/optax`） | 0.1 | MIT | JS/TS 中的张量代码与自动微分，WebGPU 后端；按需加载 | addon-exec-webgpu |
| playwright-chromium | 与仓库一致 | Apache-2.0 | 构建时在 Chromium 中录制 WebGPU 输出；导出讲授视频 | addon-exec-webgpu、addon-lecture |
| Mediabunny（`mediabunny`） | 1.6x | MPL-2.0（文件级） | 录音为 Ogg/Opus（WebCodecs）；导出视频时合成音视频；`@mediabunny/server` 附带的 FFmpeg 的许可证先行验证 | addon-lecture |
| simple-git | 已用 | MIT | 修改历史的提交、撤销与按尾注筛选 | workspace |
| `@hono/node-server` | 当前版本 | MIT | Node 请求与 Fetch API 之间的转换 | server |
| http-proxy-3 | 当前版本 | MIT | HTTP 与 WebSocket 反向代理（远端环境、工作区站点） | server |
| DOMPurify | 3.x | Apache-2.0 或 MPL-2.0 | 清洗执行输出中的 HTML | viewer |
| ansi_up | 6.x | MIT | 把回溯与输出中的 ANSI 转义转为样式 | viewer |
| mdast-util-from-markdown、mdast-util-gfm、micromark-extension-gfm | 当前版本 | MIT | 浏览器中把现场运行的 `text/markdown` 输出转为 mdast | viewer |
| myst-ext-card、myst-ext-grid、myst-ext-tabs、myst-ext-button | 与 myst-parser 同一发行 | MIT | 卡片、栅格、选项卡、按钮（P-46） | compiler |
| VitePress 的 `locales`、`sitemap`、`themeConfig.nav`、`footer`、`head` | 已用 | MIT | 站点外壳与译本（P-78、P-123） | web |
| lychee | 用户安装的命令 | MIT 或 Apache-2.0 | 可选的外部链接检查（P-54） | cli |
| 镜像：docker-stacks、`jupyter_server`、oauth2-proxy；可选 gVisor | 固定摘要 | BSD-3-Clause、MIT、Apache-2.0 | 部署模板 | templates |

语音服务没有采用 SDK：火山引擎没有 npm SDK，OpenAI 音频接口形态的服务用 `fetch` 即可；网关的适配器直接调用 HTTP 与 WebSocket 接口。

不采用：ffmpeg.wasm（核心为 GPL）、Remotion（超过 3 人的公司需要商业许可）、Motion Canvas（2024 年底起停止维护）、TensorFlow.js 的 WebGPU 后端与 webgpu-torch（停更）、Jupyter Kernel Gateway（停更，浏览器跨域有缺陷）、Daytona 等 AGPL 许可的沙箱平台、edge-tts（非官方接口）、在进程内 mock 语音或模型的测试库。
