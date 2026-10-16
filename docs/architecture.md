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
- 部署有两种信任模式（10.1 节）：本机使用（LOCAL）时一切在一个进程中；带登录的共享部署（SHARED）只支持随仓库的 compose 布局，持有第三方凭据的 gateway（`presmium gateway`）与运行 agent、编译时代码的 agent-host（`presmium agent-host`）是另外两个容器中的进程，`presmium serve` 中不运行任何由文稿决定的代码。

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
│   ├── server/              @presmium/server                    服务端：挂载服务端贡献、登录与权限、确认、控制通道、反向代理；gateway（presmium gateway）（Node）
│   ├── mcp/                 @presmium/mcp                       agent 环境：MCP 工具与资源；presmium-mcp（stdio）
│   ├── workspace/           @presmium/workspace                 工作区服务 presmium serve：文档管理、修改历史（REVISIONS）、成员、编辑模式；agent-host（presmium agent-host）
│   ├── addon-exec-wasi/     @presmium/slidev-addon-exec-wasi    WebAssembly 后端（Runno）
│   ├── addon-exec-webgpu/   @presmium/slidev-addon-exec-webgpu  浏览器 GPU 后端（WGSL、jax-js），构建时在 Chromium 中录制
│   ├── addon-exec-jupyter/  @presmium/slidev-addon-exec-jupyter 远端环境（Jupyter 内核协议）与浏览器终端
│   ├── addon-assistant/     @presmium/slidev-addon-assistant    agent 运行时（ACP 客户端，默认启动随包的 DeepSeek Harness）、问答、批注与对话修改、修改审阅（内置的 git 实现）；dsh 配置模板；gateway 中的模型代理
│   ├── addon-deltabox/      @presmium/slidev-addon-deltabox     修改审阅与进程沙箱的 deltabox-lite 实现（只有 Node 端，随 CLI 安装的运营者插件）
│   ├── addon-lecture/       @presmium/slidev-addon-lecture      讲授轨、录制、回放、lecture 渲染端、{cue}/{say}、导出视频（presmium-lecture）
│   └── addon-speech/        @presmium/slidev-addon-speech       语音网关、引擎适配、合成缓存（presmium-speech）
├── templates/
│   ├── env/                 远端环境：compose/（compose.yaml、compose.gpu.yaml、compose.gvisor.yaml、devcontainer.json）、kubernetes/（文档）
│   ├── workspace/           工作区部署：compose/（serve、gateway、sandbox 三个容器，oauth2-proxy、课堂服务；共享部署唯一支持的布局）、kubernetes/（按同一布局的参考文档）
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
| `packages/server/`、`packages/mcp/`（整个包都是 Node 端） | `@presmium/kernel`、`@presmium/compiler`、Node 库；`server` 另可依赖 `@presmium/mcp`；`mcp` 另用 `@presmium/viewer/domain` 的纯函数（WP-78，读取文稿与搜索） | vue 与 `@vue/*`、`@slidev/*`、vitepress；`mcp` 不依赖 `@presmium/server` |

此外：只有 `addon-core` 可以在组件与 `src/client/` 中使用 `@slidev/client`，这两处不用 `@slidev/*` 的其他包（`web` 的组件与 `src/client/` 同样不用 `@slidev/client`）；只有 `web` 可以使用 vitepress；任何包（测试除外）都不引用插件包 `@presmium/slidev-addon-*`，渲染端与 IR 运行时也不例外，相对路径不离开本包，共用的契约放在 `@presmium/kernel` 或 `@presmium/host`。`scripts/check-layering.mjs` 检查以上全部规则，扫描 `.ts`、`.tsx`、`.vue`、`.js`、`.jsx`、`.mjs`、`.cjs`、`.mts` 文件，静态 `import`、`export ... from`、动态 `import()` 与 `require()` 都算引用。

v0.8 新增的规则：

- `@presmium/server` 只由 `cli` 与 `workspace` 引用。插件经 `ServerContext`、`RequestContext`、`APPROVALS` 与 `MCP_ENDPOINT` 使用服务端，浏览器端经 `@presmium/host` 的 `useServer()`。
- `@presmium/mcp` 只由 `server` 引用（挂载 `/mcp`）。MCP 服务需要的宿主能力由它自己声明为接口 `McpHost`（`@presmium/mcp` 的类型：文档列表、编译结果与诊断、检查、构建、运行代码块、放映位置与课堂状态、确认），服务端在 `ServerHost` 与控制通道之上实现它，`presmium-mcp` 直接在编译器上实现它；`mcp` 不引用 `server`，两者之间没有循环依赖（10.2 节）。
- 插件包（`addon-*`）不引用 `@presmium/server`、`@presmium/mcp`、`@presmium/workspace` 与 `@presmium/web`；`workspace` 与 `mcp` 也不引用插件包（已有的“没有包引用插件”规则）。
- 外部协议与厂商的客户端各只在一个适配器中：`@modelcontextprotocol/*` 只在 `mcp`（各包的 `test/` 另算）；`@agentclientprotocol/sdk` 只在 `addon-assistant/src/node/`；`@jupyterlab/services` 与 `@xterm/*` 只在 `addon-exec-jupyter`；`mediabunny` 只在 `addon-lecture`；`deltabox-lite` 只在 `addon-deltabox/src/node/`；`simple-git` 只在各包的 `src/node/`。DeepSeek Harness（`@deepseek-ai/dsh`）是助手插件的依赖，只以子进程启动，任何包都不引用它。语音服务提供方没有 SDK，它们的接口只出现在 `addon-speech/src/node/engines/`，由代码评审守护。
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
| `gateway(ctx)` | gateway 贡献：只在 `presmium gateway` 中挂载、使用第三方凭据的路由与反向代理，例如语音引擎、远端环境与模型的代理（4.7 节、10.9 节） |
| `operator` | 运营者插件：列在运营者设置 `settings.presmium.workspace.plugins` 中时，每份文档都加载它（所有命令），文稿不必写进 `plugins`。`addon-deltabox` 随 CLI 安装，不必列出也在所有命令中加载，排在列表中的插件之后（运营者列出的同一令牌的实现因此优先；运营者可以在 `settings.presmium.deltabox` 中关闭它的服务，4.6 节、10.6 节） |

插件从哪里加载（D14，10.2 节）：`presmium dev`、`build`、`check` 按文稿的 `plugins` 从文稿目录向上查找 `node_modules`，也接受相对于文稿的路径，替换渲染端的 `renderers.<id>.package`（`ir.md` 2.1 节）同样如此；`presmium serve` 只加载运营者控制的包，即安装在工作区根目录（`<工作区>/node_modules/<包名>`）并列在 `settings.presmium.workspace.plugins` 中的包，以及随 CLI 安装的 Presmium 自己的包（渲染端与 `addon-deltabox`）。`presmium serve` 中文稿的 `plugins` 或 `renderers.<id>.package` 写了相对路径或绝对路径、写了没有列出的包，或该包只能从文稿目录的 `node_modules` 找到时，编译器不加载它，并给出错误级诊断 `presmium.plugins`。gateway 与 agent-host 同样只加载这个列表中的包。

- 编译步骤 `IRPass` 可以声明 `after: 'execute'`，在编译时执行之后运行，此时代码节点已有 `outputs`（执行插件以此把编译时输出写进执行面板的 `fallback`）。渲染端 `Renderer` 可以提供 `prepare(doc, ctx)`：只生成工作目录、不构建（幻灯片渲染端写出 Slidev 文稿），编译器在 `build` 旁导出 `prepare(compilation, { to, outDir, base })`，发布插件的导出与视觉差异用它（`base` 换掉渲染端的站点路径：`slidev export` 在根路径服务生成的文稿，导出时传 `/`）。构建报告的每个输出给出 `outDir`、`workDir` 与站点路径 `base`。
- 渲染上下文 `RenderContext` 另有 `lang`（文稿语言）、`pluginDirs`（编译器加载的插件目录）、`extensionFor(node)`（各渲染端选中同一插件的扩展）、`portable(value, from)`、`localAsset(source, url)`（本地文件）、`renderers` 与 `base`（站点路径）、`vitePlugins`，见 `ir.md` 第 6 节。
- `@presmium/kernel` 还导出插件共用的纯函数：`irBlocks`、`docBlocks`（遍历块，含组件的子块）、`nodeMdast`、`errorMessage`、`isRecord`、`failedRun`、`languageId`（`py`、`python3`、`ipython*` 归为 `python`，`js`、`mjs` 归为 `javascript`，`ts` 归为 `typescript`）、`lowerMyst`（MyST 降为标准 Markdown；卡片、栅格与选项卡按选项 `cards` 保留结构或降为小标题，`ir.md` 第 6 节）与 `deckLocale`。各包不再自带这些函数的副本。
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

**课堂的写入规则。** 课堂的共享集合（`ClassroomStore`，契约中的 JSDoc 写明同样的规则）由课堂服务端把关：主讲可以写任何条目；学员只能写自己的条目，键中含有自己的参与者 ID（如 `<测验>:<参与者>`、`<参与者>:<提问>`），值是在 `participant` 或 `author` 字段中写明自己的对象；`quizzes` 集合只有主讲能写。服务端只接受能完整并入房间文档的更新：更新依赖服务端没有的内容、删除集超出房间已有的内容，或违反上述规则时，整个更新被拒绝，服务端以应用定义的关闭码关闭该连接，会话插件丢弃本地文档并用新文档重连，提示学员这次写入被拒绝，被拒的写入不会在之后的写入中残留。Yjs 的结构以客户端 ID 与时钟标识，所以一个客户端 ID 属于最先写入它的结构的一方（主讲的各窗口算一方，每个参与者各算一方），在参与者名单中最先声明某个客户端 ID 的连接，也让该 ID 属于自己一方；归属在房间存在期间一直保留，连接断开后也不变（主讲还没写入就短暂断线，重连前学员也不能用它的客户端 ID 写入或出现在名单中）：学员的更新含有别人的客户端的结构（例如主讲下一个时钟的结构）时被拒绝，否则主讲随后对这个时钟的真实写入会被每份文档当作重复而忽略。`put` 不报告失败，所以存放学员数据的插件必须给数据这样的形状，读取集合时也先按类型守卫过滤（学员可能写入形状不对的值）。参与者名单（awareness）同样校验：一个连接只能声明自己的参与者，学员不能自称主讲。

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
| `presmium.status`（`STATUS`） | 宿主适配 | 登记：课堂插件的汇总（`presmium.classroom`：课堂状态 `status`、在线学习者人数 `learners`、提问数与未回答数 `questions`，按位置给出的 `quizzes`（各选项人数、作答与答对人数）、`predictions`（各选项人数、预测人数）、`pulse`（各档人数）、`exercises`（提交与通过人数）；不含昵称、参与者 ID 与学习者写下的文字）；读取：控制通道（送给 MCP 的 `get_classroom`） |
| `presmium.editMode`（`EDIT_MODE`） | 工作区的浏览器插件 | 助手插件（批注与对话）、讲授插件（转写回写） |
| `presmium.speech`（`SPEECH`） | 语音插件：浏览器端经语音网关，Node 端直接调用引擎 | 讲授插件（转写、合成、构建时合成）、讲授插件贡献的 agent 工具 |
| `presmium.agent`（`AGENT`，浏览器） | 助手插件 | 课堂插件（课堂中的 AI 回答）、讲授插件（转写回写）、工作区的浏览器插件（新建文档时由 agent 起草） |
| `presmium.agentRuntime`（`AGENT_RUNTIME`，Node） | 助手插件 | 助手自己的服务端路由；以后的批处理任务 |
| `presmium.revisions`（`REVISIONS`，Node） | 工作区（`presmium serve` 为每份文档登记） | 助手插件（每个修改任务一次提交）、工作区的文档管理 |
| `presmium.approvals`（`APPROVALS`，Node） | 服务端（按 `ApprovalScope` 分发：`content` 给发起的成员，`workspace` 只给所有者） | MCP 服务（操作类与计费类工具）、助手插件（agent 的权限请求与超出范围的写入）、语音插件（计费的合成）、工作区（SHARED 模式中的编译时执行） |
| `presmium.mcpEndpoint`（`MCP_ENDPOINT`，Node） | 服务端（挂载 `/mcp` 时） | 助手插件：为每个 agent 会话签发绑定成员与模式的 MCP 令牌，放进 ACP `session/new` 的 `mcpServers` |
| `presmium.changeReview`（`CHANGE_REVIEW`，Node） | `addon-deltabox`（随 CLI 安装，主机满足条件时登记）；SHARED 模式中 serve 里是工作区给出的 agent-host 客户端 | 助手插件：修改任务的审阅与回滚；没有这个服务时助手用内置的 git 实现（4.8 节、10.7 节） |
| `presmium.processSandbox`（`PROCESS_SANDBOX`，Node） | `addon-deltabox`（随 CLI 安装，主机满足条件时登记） | 编译器：放进 `RunContext.sandbox`，执行插件的子进程经它运行（4.6 节、10.6 节） |

内核契约中的令牌（`executor`、`session`、`classroomStore`、`presenterPanels`，以及 v0.8 的 `speech`、`agent`、`agentRuntime`、`revisions`、`approvals`、`mcpEndpoint`、`changeReview`、`processSandbox`）定义在 `packages/kernel/src/contracts.ts`；宿主层的令牌（`syncTransports`、`navigation`、`toolbar`，以及 v0.8 的 `operations`、`status`、`editMode`）定义在 `packages/host/src/types.ts`。服务替换时，提供方与使用方都不需要改动。Node 端的令牌（`agentRuntime`、`revisions`、`approvals`、`mcpEndpoint`、`changeReview`、`processSandbox`）登记在编译器为每份文稿建立的 Node 端服务注册表中（`PresmiumNodePlugin.services`，服务端与工作区另行登记自己的实现），规则与浏览器端相同：一个令牌只有一个实现。SHARED 模式中工作区为 serve 的注册表登记 `AGENT_RUNTIME`、`CHANGE_REVIEW` 的 agent-host 客户端，并把这两个令牌交给编译器作为宿主保留的令牌：插件在 serve 中对它们的实现不登记（它们在 agent-host 中登记，10.8 节）。

`executor`、`session`、`classroomStore` 的接口（`RunRequest`、`SessionService`、`Role` 等）是业务契约。它们放在内核包中是有意的：提供方与使用方是不同的插件，插件之间不互相引用（第 3 节），契约只能放在双方都依赖的共享内核中。内核的运行时（服务注册、启动、锚点、检查）不使用这些概念。见第 9.2 节。

### 4.6 v0.8 的契约增补：执行环境、会话与富输出

4.6 至 4.10 节是 v0.8 新增范围（执行环境、智能体、工作区、讲授与 M9）的契约，设计依据见 `design-v0.7.md`。全部是兼容扩展：只增加可选字段、可选参数（`Executor.run` 的第三个参数 `ctx`）、新类型、新函数与新的服务令牌，已有的字段与参数不变，`IR_VERSION` 仍为 1，现有插件与文稿不受影响。WP-73a 已把它们写入 `contracts.ts`、`ir.ts` 与 `host/src/types.ts`（`HostStart`、`StartOptions` 的增补写在它们所在的 `host/src/kernel.ts`，`KernelOptions` 的增补写在 `kernel/src/kernel.ts`）；之后的工作包只实现，不再改这些文件（需要改时在交付报告中提出，由验收者决定，只能增加）。业务契约按领域拆在 `packages/kernel/src/contracts/` 中：`service.ts`（`ServiceToken`、`defineService`，其他模块只从这里取运行时的值，没有循环引用）、`execution.ts`（执行、进程沙箱、具名环境与 `environmentExecutor`）、`server.ts`（成员、路由、信任模式、两种 Node 端上下文、确认与 `eventStream`、MCP 访问、gateway）、`speech.ts`、`agent.ts`（智能体、修改审阅与修改历史）、`operations.ts`；`contracts.ts` 保留插件、锚点、检查与课堂的契约并统一再导出，入口 `@presmium/kernel/contracts` 不变（9.2 节）。内核另导出 `withProp(props, path, value)`（按 `.` 分隔的属性路径设置组件属性，渲染端改写 `ComponentNode.assets` 用）与 `roleMark(node)`（角色的标记 `〔名 value〕`），`lowerMyst` 增加选项 `roles: 'marks'`。

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

/** 编译时一次运行的上下文：由编译器给出；浏览器中与编译器之外的调用没有它 */
export interface RunContext {
  /**
   * 被执行的代码能得到的全部环境变量（见下文“执行的环境变量”与第 11 节）。执行器不读 `process.env`：
   * 子进程以它为环境；`docker` 与 devcontainer 命令行以它加上 Docker 客户端的变量为环境（10.6 节）；
   * 容器、WASI 程序、WebGPU 录制所用的 Chromium 与内核至多得到其中的变量
   */
  env: Readonly<Record<string, string>>
  /**
   * 进程沙箱：Node 端服务中有 `PROCESS_SANDBOX` 时编译器给出。启动子进程的执行器（执行插件的
   * `python3`、`node`）经它运行代码，输入与结果经运行目录中的文件传递；没有时照旧启动子进程（10.6 节）
   */
  sandbox?: ProcessSandbox
  /**
   * SHARED 模式中 agent-host 为这次运行给出的 gateway 访问（serve 签发的限定令牌，4.7 节）：
   * 需要第三方凭据的执行器（远端环境）经 gateway 连接；LOCAL 模式中省略，凭据经 `EnvironmentContext.secret` 读取
   */
  gateway?: GatewayAccess
  /**
   * 文稿的语言（头部的 `lang`，没有时为 `zh-CN`；WP-79e2 增加）：执行器自己写进录制的文字（如 WebGPU
   * 运行的摘要）按它（`deckLocale`），与编译时写入产物的其他文字一样（5.7 节）
   */
  lang?: string
}

/** 进程沙箱中的一次运行（D13）：命令在一个新的运行目录中执行，输入与结果都经这个目录中的文件传递 */
export interface SandboxRun {
  /** 命令与参数；命令按 `env.PATH` 查找 */
  argv: string[]
  /** 写进运行目录的文件，键为相对路径；运行目录是命令的工作目录，也是它唯一能写的目录 */
  files: Record<string, string | Uint8Array>
  /** 运行结束后从运行目录读回的文件（相对路径） */
  collect: string[]
  /** 命令得到的全部环境变量（`RunContext.env`）；启动沙箱的辅助进程自己只带 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR`（10.6 节） */
  env: Readonly<Record<string, string>>
  /** 运行目录之外可以读的绝对路径，例如解释器的安装目录与文稿目录；都只读 */
  read: string[]
  timeoutMs: number
  signal?: AbortSignal
}

export interface SandboxResult {
  /** 超时或被中止时为 null */
  exitCode: number | null
  stdout: string
  stderr: string
  /** `collect` 中运行结束时存在的文件 */
  files: Record<string, Uint8Array>
}

export interface ProcessSandbox {
  /** 隔离方式，写进构建报告与诊断，例如 `deltabox cbcow-through` */
  readonly kind: string
  /**
   * 在隔离中运行：网络全部拒绝；看不到沙箱之外的进程（读不到它们的 `/proc/<pid>/environ`）与 Unix 套接字；
   * 只能写运行目录。命令自己的子进程同样在其中
   */
  run(request: SandboxRun): Promise<SandboxResult>
}

/**
 * Node 端服务：`addon-deltabox`（随 CLI 安装的运营者插件）在主机满足条件时登记（10.6 节）；
 * 编译器把它放进 `RunContext.sandbox`
 */
export const PROCESS_SANDBOX = defineService<ProcessSandbox>('presmium.processSandbox')

export interface Executor {
  // ……已有字段……
  /**
   * 已有的方法增加第三个可选参数 `ctx`，旧的实现与调用方不受影响。
   * 没有 `ctx` 时执行器只给代码 `PATH`、`LANG` 与一个临时的 `HOME`
   */
  run(request: RunRequest, signal?: AbortSignal, ctx?: RunContext): Promise<RunResult>
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
   * 没有时为 undefined。提供方只把凭据发往同一对中的地址。SHARED 模式中 serve 与 agent-host 都没有第三方凭据
   */
  secret(name: string): string | undefined
  /**
   * SHARED 模式中 serve 的 gateway 访问（服务令牌）：`probe` 经 gateway 中本插件的代理连接环境；
   * agent-host 中省略（运行用 `RunContext.gateway`），LOCAL 模式中省略
   */
  gateway?: GatewayAccess
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
  /** 文稿声明的具名环境（来自 `KernelOptions.environments`）；提供方插件为自己 `kind` 的环境登记浏览器端执行器 */
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
  /** 进程所在的信任模式（4.7 节、10.1 节） */
  trust: TrustMode
  /**
   * 进程的环境变量（LOCAL 中的凭据，以及 `PRESMIUM_AGENT_COMMAND` 这类运营者的设置）；没有时为 undefined。
   * SHARED 模式中 serve 与 agent-host 的环境里没有第三方凭据
   */
  secret(name: string): string | undefined
  /**
   * SHARED 模式中 gateway 的访问：serve 中为服务令牌，agent-host 中为 serve 为这次构建或运行签发的限定令牌；
   * 需要第三方凭据的服务（语音）经它调用 gateway 中本插件的贡献。LOCAL 模式中省略
   */
  gateway?: GatewayAccess
  /**
   * LOCAL 模式中运营者目录的绝对路径（同意记录等运营者数据，10.5 节）：用户状态目录中按工作区区分，
   * 在任何工作区与文档目录之外。SHARED 模式中省略：运营者目录只在 gateway 中（`GatewayContext.operatorDir`）
   */
  operatorDir?: string
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
  /** gateway 贡献：只在 `presmium gateway` 中挂载，那里才有第三方凭据（4.7 节、10.9 节） */
  gateway?(ctx: GatewayContext): GatewayContribution | Promise<GatewayContribution>
  /**
   * 运营者插件：列在 `settings.presmium.workspace.plugins` 中时每份文档都加载它（所有命令），
   * 文稿不必写进 `plugins`；例如提供 `CHANGE_REVIEW` 与 `PROCESS_SANDBOX` 的 `addon-deltabox`（随 CLI 安装，不必列出）
   */
  operator?: boolean
}
```

`packages/kernel/src/kernel.ts` 与 `packages/host/src/kernel.ts`：宿主把 IR 的 `config.execute.environments` 一路交给每个插件的 `PluginContext.environments`（`HostStart` → `StartOptions` → `KernelOptions`）：

```ts
// packages/kernel/src/kernel.ts
export interface KernelOptions {
  // ……已有字段……
  /** 交给每个插件的 `PluginContext.environments` */
  environments?: Record<string, EnvironmentSpec>
}

// packages/host/src/kernel.ts
export interface StartOptions {
  // ……已有字段……
  /** 交给 `KernelOptions.environments` */
  environments?: Record<string, EnvironmentSpec>
}

export interface HostStart {
  // ……已有字段（`server` 见 4.7 节）……
  /** IR 的 `config.execute.environments`；两种宿主适配都给出（幻灯片形态从 Slidev 头部读取） */
  environments?: Record<string, EnvironmentSpec>
}
```

要点：

- **执行器的选择**：浏览器中的 IR 运行时、执行面板与编译时执行都把代码块的 `run.executor` 放进 `RunRequest.executor`，由路由精确选择（`review-round2.md` 决定 5）。IR 运行时不再自己挑选首选执行器。
- **会话 ID**：浏览器中由代码块的 `:session:` 加上页面实例的标识组成（每个页面、每个学习者各自一份）；编译时由文稿与 `:session:` 组成，构建结束时对每个用过的会话调用 `endSession`。
- **富输出**：执行器把输出写入 `outputs`，同时照旧拼接 `stdout`、`stderr`。渲染见 `ir.md` 第 6 节；HTML 输出在显示前清洗（第 11 节）。
- **环境的登记**：编译器为头部声明的每个环境找到 `kind` 对应的提供方，创建执行器并加入编译时的执行器列表；没有提供方的 `kind` 与未声明的环境名都是错误级诊断。浏览器端由同一插件在 `setup` 中按 `ctx.environments` 为同类环境登记执行器，ID 相同。
- **执行的环境变量**（N-08）：编译时执行的代码由文稿的编辑者或 agent 写出，不应拿到服务端的凭据。清理环境变量挡住的是代码经自己的环境拿到凭据（例如打印全部环境变量的代码把凭据写进录制）；同一 uid 的代码仍能读进程信息（`/proc/<pid>/environ`），这由信任模式处理（10.1 节、10.6 节）。编译器为每次运行给出 `RunContext.env`：`presmium build`、`check`、`dev` 与语言服务中，是进程的环境去掉全部 `PRESMIUM_` 开头的变量，以及名字（不分大小写）以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量；`presmium serve` 中只有允许列表：`PATH`、`LANG` 与 `LC_*`、`TZ`、`TMPDIR`，以及 `HOME`（每个工作区一个临时目录）。两种情况都再加上运营者设置 `settings.presmium.exec.passEnv` 列出的变量（取进程中的值，即使名字像凭据）。执行插件的子进程、WASI 程序、WebGPU 录制所启动的 Chromium 与远端内核都只得到其中的变量，执行器不读 `process.env`；本地环境插件的 `docker` 与 devcontainer 命令行以它加上 Docker 客户端需要的几个变量为环境（容器定义中的 `${localEnv:…}` 因此取不到被去掉的变量），容器里的代码至多得到 `RunContext.env` 中的变量（10.6 节）。
- **进程沙箱**（D13，10.6 节）：Node 端服务中有 `PROCESS_SANDBOX`（随 CLI 安装的运营者插件 `addon-deltabox` 在主机满足条件时登记，默认启用）时，编译器把它放进每次运行的 `RunContext.sandbox`。执行插件的 `python3`、`node` 执行器经它运行：代码、参数与输入写进运行目录，结果由运行器写进运行目录中的文件（不经标准输入与额外的文件描述符，`ir.md` 第 4 节），文稿目录与解释器的安装目录只读；同一 `:session:` 的代码块在同一次运行中依次执行（会话有一块未命中时本来就从头重新执行）。本地环境插件的容器（要用 Docker 的套接字）、WASI 程序（在 WebAssembly 的沙箱中）与 WebGPU 的录制（在 Chromium 中）不经进程沙箱。
- **执行选项**（N-08，10.6 节）：编译器的执行选项（编译器自己的接口，不是内核契约）由宿主给出：`env`（`local` 或 `serve`，决定上一条的规则）、`admit`（未命中缓存的运行交给它判断：放行的执行，其余按没有执行处理，显示录制输出或降级内容，并列在编译结果中）与 `remote`（一个函数：编译器不在本进程中运行任何执行器，而是把每次运行的执行器 ID、`RunRequest` 与 `RunContext.env` 交给它，会话的结束同样交给它；SHARED 模式中由工作区给出，交给 agent-host 执行，10.8 节）。宿主的 `ServerHost` 运行单个代码块（MCP 的 `run_code`）与构建时使用同一套选项（10.6 节）。`presmium build`、`check`、`dev` 与 LOCAL 模式的 `presmium serve` 不给 `admit` 与 `remote`，全部在本进程中执行（有进程沙箱时经它）；SHARED 模式的 `presmium serve` 给出 `remote`，并按运营者设置 `settings.presmium.exec.compile` 给出 `admit`。

实现（WP-73b）：

- **执行选项的形状**：`CompilerOptions.execution`（`@presmium/compiler` 导出 `ExecutionOptions`）为 `{ env?: 'local' | 'serve', admit?(runs: PendingRun[]): PendingRun[] | Promise<PendingRun[]>, remote?: RemoteExecution }`。`admit` 在一次编译中只调用一次，参数是全部未命中缓存的运行（章节、块、源码位置、执行器 ID 与 `RunRequest`），返回放行的那些；一个会话只在它的全部运行都放行时执行。没有放行的块显示别的环境的录制（有时），给出信息级诊断，并列在 `Compilation.runs.refused` 中。`remote` 是 `{ run(executor, request, env, signal?), endSession(executor, session) }` 两个函数（文中“一个函数”的具体形状），有它时编译器不在本进程中调用任何执行器的 `run`，但仍用本进程中的执行器对象选择执行器、计算环境指纹与缓存键。`Compilation` 另给出 `executors`（插件的与具名环境的）、`runContext`、`environments`（供 `presmium check --env`）与 `run(node, signal)`（以同一套选项运行一个代码块，不读写录制；会话中的块先在一个新会话中依次运行它前面的块，`presmium dev` 的 `ServerHost.run` 用它）。`RunStats` 增加 `refused` 与 `sandbox`（构建报告的 `code runs: … isolated by <kind>`）。
- **`RunContext.env`** 由 `runEnvironment(rules, passEnv, workspaceRoot)` 计算（`execute.ts`）；`serve` 规则的 `HOME` 是 `<tmpdir>/presmium-home-<工作区根目录的哈希>`。`RunContext.sandbox` 取 Node 端服务中的 `PROCESS_SANDBOX`，`RunContext.gateway` 取 `CompilerOptions.gateway`，`RunContext.lang` 是文稿的语言。执行选项 `remote` 只收到 `RunContext.env`，SHARED 模式中 agent-host 里的执行器没有 `lang`（按英文录制）。录制的缓存键不含文稿的语言：改了 `lang` 之后，已有的录制在代码或环境改变之前保持原来的文字。
- **会话**：编译器按文稿顺序把同一 `:session:` 的块编成一组，会话 ID 为 `<入口文件>:<会话名>`；有一块未命中时先 `endSession`，再把整组请求一次发出（不在其间等待），执行器按请求顺序执行，结束后对每个用过的会话调用 `endSession`。执行插件的本机执行器把一起到达的同一会话的请求放进一次运行（同一个子进程，或进程沙箱中的一次 `run`）；之后单独到达的同一会话的请求先重新运行该会话此前的请求，所以状态总是一致（`packages/addon-exec/src/node/child.ts`）。浏览器中会话 ID 由执行路由加上页面实例的标识（路由在页面中创建），Pyodide 的会话是 Worker 中常驻的全局命名空间，`endSession` 丢弃它；代码块旁的“重置会话”调用路由的 `endSession`。本地环境插件的容器执行器每次运行一个新容器，不共享会话的状态（不支持会话的执行器忽略它）。
- **运行目录的协议**：执行插件的子进程（与进程沙箱）中，运行器读运行目录中的 `.presmium/request.json`（`{ session?, runs: [{ code, args, stdin, files, lang }], path? }`），每完成一个请求写 `.presmium/result-<i>.json`（先写临时文件再改名），超时被杀死时已完成的请求的结果仍在；一组请求的超时是各自超时之和。Python 的命令是 `python3 -c <运行器>`（`read` 为解释器的 `sys.prefix` 与 `sys.base_prefix`），JavaScript 是 `node --input-type=module -e <主程序>`（`read` 为执行插件的包、Sucrase 与 Node 的安装目录）；文稿目录由进程沙箱自己加入只读路径（它的 Node 端服务知道文稿目录，`SandboxRun` 中没有它）。容器执行器把同样的 `request.json` 写进挂载的运行目录，在容器中运行同一个运行器。
- **共享的运行器**（`@presmium/kernel/runner.py`）另提供 `display()`（不必导入）、`IPython` 与 `IPython.display`（`display`、`Markdown`、`HTML`、`Latex`、`SVG`、`JSON`、`Image`；安装了的 IPython 不被使用，浏览器与编译时一致）和 matplotlib 的后端 `module://_presmium_matplotlib`（Agg 绘制，`plt.show()` 与运行结束时把打开的图写成 `image/png` 输出；运行期间 `MPLBACKEND` 指向它）。错误的回溯同时是 `error` 输出与 `stderr` 的文本。
- **容器的环境**：容器里的代码得到 `RunContext.env` 中除 `PATH`、`HOME`、`TMPDIR`（主机上的路径）之外的变量；`TMPDIR` 是文中没有列出、实现另外去掉的。
- **`run` 操作**：由 IR 运行时报告与重放（`@presmium/viewer` 的代码块：报告 `{ section, block, result }`，`result` 为 `live`，或运行没能进行而显示录制时为 `freeze:<缓存键>`；重放时显示录制的输出），而不是执行插件：块 ID 只有 IR 运行时知道，执行插件经 `executor` 服务收到的请求中没有它；`OPERATIONS.onReplay` 每类操作只有一个处理者，所以由 IR 运行时统一处理。执行面板暂不报告 `run`。
- **浏览器中运行失败**：路由对指定了执行器而没有登记（或不支持该语言）的请求返回 `failedRun`（`exitCode` 为 null）；IR 运行时的代码块对 `exitCode` 为 null 的失败显示录制的输出并在说明中写出原因，程序自己的错误（如 `NameError`）照常显示为现场的输出。
- **幻灯片中的现场代码**：Slidev 53 只读到代码块属性中第一个 `}`（9.3 节），所以执行器、会话与超时写在生成文稿头部的 `presmiumRuns`（键为 `<章节 ID>/<块 ID>`），代码块写成 ```` ```python {monaco-run} {autorun:false,height:'auto',runnerOptions:$slidev.configs.presmiumRuns['<键>']} ````，不在显示时自动运行，录制的输出显示在它下方；有高亮步骤或多版本的代码块仍是普通代码块。写成 `{monaco-run}` 的语言是 Python、JavaScript、TypeScript 与 C、C++、Ruby、SQL（WP-79e2；别名写成 code runner 认识的名字：`c++`、`cc`、`cxx` 为 `cpp`，`rb` 为 `ruby`，`sqlite` 为 `sql`），执行插件的 `setup/code-runners.ts` 为这些语言登记同一个经 `executor` 服务运行的 code runner，C 等语言因此由 WASI 执行器或环境的执行器运行。生成的头部另有 `presmiumEnvironments`（IR 的 `config.execute.environments`），`addon-core` 交给 `startHost`。

实现（WP-74，WebAssembly 后端，P-103）：

- **一份运行器，两处运行**：`addon-exec-wasi` 的 `src/runner.mjs`（纯 JavaScript，同执行插件的 `runner.mjs`）定义语言（`c`、`cpp`、`ruby`、`sql` 及别名）、每个运行时的文件与命令行，并在 `@runno/wasi` 的 WASI 系统中运行请求：C 与 C++ 先由 `clang.wasm` 编译、`wasm-ld.wasm` 链接（sysroot 为 `clang-fs.tar.gz`），再运行得到的 WASI 程序；Ruby 与 SQLite 解释程序。浏览器中由页面的一个常驻 Worker 运行（模块只编译一次，超时或中止时结束 Worker），编译时由每次运行一个的 Node 工作线程运行（`worker_threads`，超时即结束线程），二进制相同，所以录制与现场输出一致。程序的文件系统在内存中（`RunRequest.files` 放在根目录，文件时间固定），标准输出与标准错误按写入顺序成为 `stream` 输出；不支持 `args` 与会话。
- **环境变量**：编译时 WASI 程序的环境就是 `RunContext.env`（没有 `ctx` 时为空）；编译器与链接器没有环境，工作线程以空的 `process.env` 启动；浏览器中程序没有环境变量。WASI 程序在 WebAssembly 的沙箱中运行，不经进程沙箱。
- **执行器与环境**：按语言选择的执行器 ID 为 `presmium.wasi`（浏览器与编译时相同）；`kind: wasi` 的环境以 `presmium.env.<名>` 登记同一实现，按环境的 `languages` 限定语言；`probe` 报告不支持的语言与缺少的运行时文件。环境指纹为 `wasi <运行时> sha256:<该运行时全部文件的哈希前 16 位>`，每个进程只计算一次。
- **运行时的发布**：二进制取自已安装的 `@runno/sandbox` 的 `dist/langs`（沿模块查找路径找到，它的 `exports` 不导出 `package.json`）。编译步骤 `presmium.execWasi.runtimes` 把浏览器中运行的代码（`run.when` 为 `live` 或 `both`，含组件的子块，执行器为 `presmium.wasi`、`kind: wasi` 的环境或未指定）需要的运行时写进 IR 中插件配置的 `runtimes`；网页经 `PresmiumNodePlugin.vitePlugins`、幻灯片经插件的 `setup/vite-plugins.ts`（读生成头部的 `presmium`）把这些运行时复制到 `<base>wasi/`（服务端渲染的构建不复制），开发服务器提供全部运行时。网页的 Service Worker 预缓存产物中的全部文件（9.2 节），幻灯片的（发布插件的 `OFFLINE_MANIFEST`）预缓存其中的 `.wasm` 与 `.gz`，所以运行时在两种形态中都离线可用。幻灯片中 C、C++、Ruby、SQL 的现场代码块是 `{monaco-run}`（上文“幻灯片中的现场代码”，WP-79e2）。发布运行时的同时发布它们的许可证说明 `<base>wasi/LICENSES`（包中的 `LICENSES`：Runno 的 MIT 许可证，LLVM 8 的 University of Illinois/NCSA 许可证，wasi-libc 与 LLVM 9 以后的 Apache 2.0 加 LLVM 例外，Ruby 的 2-clause BSD，SQLite 的公有领域声明），开发服务器同样提供。
实现（WP-75，浏览器 GPU 后端，P-104；契约没有改动）：

- **`wgsl` 执行器**：`@presmium/slidev-addon-exec-webgpu` 在浏览器与编译时都以 `presmium.webgpu` 登记（`kind: webgpu` 的环境另以 `presmium.env.<名>` 登记，浏览器端由插件在 `setup` 中按 `ctx.environments` 登记）。计算核心是纯 JavaScript 的 `src/gpu.mjs`，浏览器中在每次运行一个的专用 Worker 里运行，编译时在 Playwright 的 Chromium 中运行同一份文件，所以录制与现场的输出一致。请求由 `src/domain/params.ts` 从着色器与 `:params:` 得出（`ir.md` 2.7 节）：缓冲区按着色器中变量的名字给出数据或大小，组、绑定、存储的读写与值的类型取自着色器的声明，可写的存储缓冲区读回并显示；显式的绑定布局（入口函数不用的缓冲区也绑定）；按缓冲区的大小请求设备的 `requiredLimits`。结果是 `stdout` 的文本（同时是一个 `stream` 输出）：每个读回的缓冲区一行（长的显示首尾各 4 个值与最小、最大、平均）、每次派发的中位时间（有 `timestamp-query` 时用 GPU 时间戳，否则为提交到队列完成的时间；回退适配器上注明“CPU 模拟”）与适配器。浏览器中按界面语言，编译时按文稿的语言（`RunContext.lang`，WP-79e2；没有上下文时为英文）。
- **回退**：浏览器没有 WebGPU、没有适配器、适配器缺少特性或限制、设备丢失、超时，结果是没能进行的运行（`exitCode` 为 null，原因在 `stderr`），代码块与执行面板显示编译时录制的输出与原因；着色器的编译错误、WebGPU 的校验错误与写错的 `:params:` 是程序自己的错误（`exitCode` 为 1）。超时（请求的超时，默认 10 秒）时 Worker 先销毁设备再被结束；运行的规模上限为全部缓冲区 128 MiB、`repeat` 至多 1000。
- **编译时的录制**（`src/node/recorder.ts`）：Chromium 以 `RunContext.env` 为环境（没有上下文时只有 `PATH`、`LANG` 与临时的 `HOME`），页面经 `page.route` 从 `https://webgpu.presmium.invalid/` 提供（WebGPU 要安全上下文，不占端口），每次运行启动并关闭一次浏览器（执行器没有供编译结束时关闭的钩子）。环境的选项 `adapter`：`auto`（默认，先以 `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan` 用显卡，没有适配器时用 SwiftShader）、`gpu`、`swiftshader`。环境指纹为 `chromium <版本>; <厂商> <架构>`，回退适配器加 ` (fallback)`。没有安装 Chromium 时执行器不支持 `wgsl`（录制照常使用）；没有适配器（指纹）或适配器不能运行（缺少特性或限制、设备丢失）时抛出错误而不返回结果，编译器沿用已有的录制并警告，没有录制时报错，失败不会作为录制留下。`presmium check --env` 的 `probe` 启动 Chromium 请求该适配器。
- **执行面板**（`addon-exec`）：`{run-panel}` 接受任何有执行器的语言；Python、JavaScript、TypeScript 之外的语言的 `:params:` 可以是任意的 YAML 映射（列表与映射以 JSON 字符串放进 `RunRequest.args`，面板的表单中可以改）。执行插件的 `presmium.exec.fallbacks` 把编译时录制的成功输出写进面板的属性 `compiledOutput`；现场运行没能进行（`exitCode` 为 null）而面板没有 `:recorded:` 时，面板显示它并在标记中写出原因（如“预录输出 · 没有可用的 GPU 适配器”）。
- **Python 桥**（`addon-exec` 的 `src/client/presmium_gpu.py`）：Pyodide Worker 把它写进 `/presmium` 并加入 `sys.path`。`await presmium_gpu.run(着色器, buffers=…, dispatch=…, entry=…, repeat=…, features=…)` 经 Pyodide 的 JavaScript 桥调用 `navigator.gpu`，参数与 `wgsl` 的 `:params:` 相同，返回读回的缓冲区（`dict`，另有 `timing` 与 `adapter`，`print` 给出与 `wgsl` 执行器相同格式的英文摘要）；不能运行时抛出 `GPUUnavailable`（`requestDevice` 失败也是），WebGPU 拒绝时抛出 `GPUError`。规模限制与 `wgsl` 执行器相同（全部缓冲区 128 MiB、`repeat` 至多 1000，`dispatch` 为 1 到 3 个正整数；WP-79e2）：超出或写错时在请求适配器之前抛出 `ValueError`，文字与执行器的英文消息相同。插件包之间不互相引用，所以这两个上限在 Python 中另写一份（`_MAX_BYTES`、`_MAX_REPEAT`）。代码块顶层的 `await` 由 `src/client/run_await.py` 的 `_pm_run_await` 支持（与共享运行器的 `_pm_run` 相同的输出、会话与隔离，以 `PyCF_ALLOW_TOP_LEVEL_AWAIT` 编译，Worker 等待它）。有 JSPI 时 Worker 以 `callPromising` 运行其他代码块，`presmium_gpu.run_sync(…)` 与 `pyodide.ffi.run_sync` 因此可用。
- **jax-js**：脚本 Worker 没有导入映射，执行插件的 `SCRIPT_IMPORTS`（`@jax-js/jax` → `<base>presmium/jax-js/index.js`）由脚本执行器解析为地址交给 Worker，`runner.mjs` 的 `prepare` 把代码中 `import … from`、`export … from`、`import '…'` 与 `import('…')` 的这些名字改写为地址（Node 中的编译时执行没有这张表，导入 jax-js 的代码写 `:run: live`）。jax-js 的 ES 模块构建（互相导入的 5 个文件）由 WebGPU 插件的 Vite 插件（`vite.config.ts`，`src/node/jax.ts`）在开发服务器中提供、在构建中原样复制到 `presmium/jax-js/`，第一次导入时才加载；没有 WebGPU 插件的文稿不带它。Slidev 构建时为 `{monaco-run}` 中导入的包查找类型，找不到（jax-js 只在 WebGPU 插件的依赖里）时构建失败；幻灯片渲染端因此在现场的 JavaScript、TypeScript 代码导入了从生成文稿的目录找不到的包时，在生成文稿的头部写 `monacoTypesSource: none`（WP-79e2，9.3 节；`renderers.slides.monacoTypesSource` 优先）。
实现（WP-76，远端环境 `addon-exec-jupyter`）：

- **包内结构**：除 `src/domain`、`src/node`、`src/client` 外另有 `src/jupyter/`：Node 与浏览器共用的 `@jupyterlab/services` 客户端（`kernels.ts` 的内核池与运行、`terminals.ts` 的终端），它不引用 Node 内置模块与 vue，两端各自给出连接的设置（`src/node/connection.ts`：`ws` 的 WebSocket 与带请求头的 `fetch`；`src/client/environments.ts`：浏览器的 `fetch` 与 `WebSocket`）。`@jupyterlab/services` 在第一次运行时才加载。
- **凭据规则**（`src/domain/connection.ts` 的 `operatorConnection`）：`none` 连接文稿的 `url`，不带令牌；`env`、`proxy`、`prompt` 在服务端（构建、代理、`probe`）都用运营者的一对 `PRESMIUM_ENV_<名>_URL`、`_TOKEN`（构建时没有学习者，`prompt` 的录制同样用运营者的令牌）；名字转为大写，其他字符变为 `_`。没有地址时不连接（运行失败并说明），文稿的 `url` 与地址不同源时提供方的 `create` 抛错，编译器给出 `presmium.execute` 的错误诊断，代理同样不挂载。SHARED 模式中连接是 gateway 中本插件的代理 `<gateway>/presmium.execJupyter/env/<名>/`，带 gateway 的令牌（`RunContext.gateway`，否则 `EnvironmentContext.gateway`）。令牌以 `Authorization: token …` 请求头发送，Node 端的 WebSocket 同样带请求头，令牌不进地址。
- **运行**：一个会话是一个内核（`endSession` 关闭它），没有会话的运行用一个之后关闭的内核；同一会话的运行按请求的顺序排队。启动内核的请求只有内核名与路径 `presmium-runs/<id>/kernel`（jupyter_server 以它的目录为内核的工作目录，`files` 经 Contents API 写进这个目录），不带任何环境变量。内核关闭之后，这个目录连同代码写下的文件经 Contents API 删除（WP-79e2；先删其中的文件与子目录，因为服务器只在送进回收站或设置了 `always_delete_dir` 时删除非空目录；服务器不列出的隐藏文件留下）。`args` 先作为一段静默执行的赋值运行；`stdin` 按行回答 `input_request`；超时或中止时经 REST 中断内核，5 秒内没有停下的内核被关闭。环境指纹为 `jupyter image=<文稿的 image> kernelspec=<内核名>:sha256:<内核规格的哈希> kernel=<kernel_info 的实现与版本、语言与版本>`，启动一个内核读 `kernel_info` 得出，60 秒内复用。`languages` 省略时按内核规格的语言判断，不符的运行失败。
- **开发服务器的预打包**：页面在第一次远端运行时才加载 `@jupyterlab/services`，`{terminal}` 加载 xterm；开发服务器到那时才发现的依赖会让 Vite 重新优化并重新加载页面，正在进行的运行因此丢失。插件的 Vite 插件（`src/node/vite.ts` 的 `prebundled`）在开发服务器启动时把它们放进 `optimizeDeps.include`（经本插件包，写成 `@presmium/slidev-addon-exec-jupyter > @jupyterlab/services`，从 Vite 的根目录找不到本插件包时不加）；执行插件同样预打包执行面板的 `diff`（WP-79e2）。
- **浏览器**：客户端插件为每个 `kind: jupyter` 的环境登记执行器 `presmium.env.<名>`，并提供 `PmTerminal` 用的 `JUPYTER_ENVIRONMENTS`。`proxy` 经 `/__presmium/presmium.execJupyter/env/<名>/`：HTTP 带 `Presmium-Document`，WebSocket 不能带请求头，文档放在查询参数 `document` 中（由 `hello` 得知）。`prompt` 第一次运行时弹出对话框，令牌存在 `sessionStorage` 的 `presmium.execJupyter.token:<名>` 中，以 `?token=` 带在 WebSocket 地址中（只发往这个服务器），服务器拒绝（401、403）时忘掉它；`url` 中的 `{user}` 由 `<hub>/hub/api/user` 给出。HTML 与 SVG 输出在执行器中先经 DOMPurify 清洗。
- **服务端与 gateway**：服务端贡献的代理随编译器最近一次为该文稿创建的环境变化（`proxies`、`routes` 是读取时计算的属性），只为 `auth: proxy` 的环境挂载，角色为 `reader`；代理设置目标的 `Host` 与 `Origin`（以服务端为 Jupyter 的客户端；Jupyter 校验 WebSocket 的来源），不能挂载时同一路径回答 502 与原因。gateway 中的贡献按进程环境中的 `PRESMIUM_ENV_<名>_URL` 挂载 `env/<小写名>/`（它不读文稿），没有地址的环境没有代理（404）。SHARED 模式中 serve 的代理以 gateway 为目标并设置 gateway 的 `Host`，但浏览器的 `Origin` 会随请求转发，而 gateway 只接受不带 `Origin` 的请求（10.9 节）：`ProxySpec` 没有去掉请求头的字段，`@presmium/server` 现在只去掉登录代理的密钥，所以这一路径要等服务端在转发到 gateway 时去掉 `Origin`（WP-76 的交付报告中提出，归 `@presmium/server` 的拥有者）。
- **站点的服务端渲染**：Rollup 会加载死分支中的动态导入，网页的服务端渲染因此也打包插件的浏览器模块；`@jupyterlab/services` 只在非浏览器环境 `require('ws')`（包的 `browser` 字段把它换成垫片），服务端渲染的打包没有这一字段，会连 `ws` 与 Node 内置模块一起打包而失败。插件的 `vite.config.ts` 用一个 Vite 插件（`src/node/vite.ts`）在每次打包中把这一处 `ws` 解析为该包自己的垫片。

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
  /**
   * 能调用的最低角色，默认 `editor`；学习者可用的路由写 `reader`。`owner` 的路由在 SHARED 模式中
   * 只挂在所有者控制台的源上，在工作区站点的源上得到 404（10.4 节）
   */
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

/**
 * 信任模式（D13，10.1 节）。`local`：`presmium dev`、`build`、`check` 与只监听本机、没有登录的 `presmium serve`，
 * 唯一的用户就是运营者，被执行的代码与 agent 以这个用户的身份受信任；`shared`：带登录的 `presmium serve`，
 * 只支持随仓库的 compose 布局（serve、gateway、sandbox 三个容器）
 */
export type TrustMode = 'local' | 'shared'

export interface ServerContext {
  deckDir: string
  workspaceRoot: string
  /** 本插件的 `presmium.<插件 ID>` 配置（文稿的内容） */
  config: Record<string, unknown>
  /** 运营者给本插件的设置，同 `NodeServiceContext.settings`；不来自文稿 */
  settings: Record<string, unknown>
  lang?: string
  /** 同 `NodeServiceContext.trust` */
  trust: TrustMode
  /** Node 端服务：插件的 `services`，以及服务端的 `APPROVALS`、`MCP_ENDPOINT`，工作区的 `REVISIONS`（SHARED 中另有 agent-host 的客户端） */
  service<T>(token: ServiceToken<T>): T | undefined
  /** 服务端进程的环境变量，同 `NodeServiceContext.secret`；SHARED 模式中没有第三方凭据 */
  secret(name: string): string | undefined
  /** SHARED 模式中 gateway 的访问（serve 的服务令牌），例如远端环境的代理以它为目标；LOCAL 模式中省略 */
  gateway?: GatewayAccess
  /** 同 `NodeServiceContext.operatorDir`：LOCAL 模式中运营者目录的绝对路径，SHARED 模式中省略 */
  operatorDir?: string
  log: Logger
}

export type ApprovalKind = 'operate' | 'spend' | 'write' | 'agent'

/**
 * 确认的范围，决定谁能回答（10.4 节）。`content`：只涉及发起成员自己的文档与会话
 * （任务的文档目录中的文件、MCP 的操作类与计费类工具），发给 `member`；
 * `workspace`：工作区配置 `presmium.workspace.yaml`（成员、确认策略、运营者设置）、同意记录、
 * 文档目录之外的任何路径、agent 的 shell 与网络权限请求、SHARED 模式中执行编辑者或 agent
 * 写的代码（没有录制的编译时执行；`compile: approve` 时 MCP 的 `run_code`，10.6 节），只发给所有者
 */
export type ApprovalScope = 'content' | 'workspace'

export interface ApprovalRequest {
  kind: ApprovalKind
  /** 默认 `workspace`：没有标明范围的请求只由所有者回答 */
  scope?: ApprovalScope
  /** 一句话说明要做什么，按文稿语言，例如“运行 merge 一节的 code-1” */
  title: string
  detail?: string
  /** 发起方：插件 ID，或 `agent:<任务 ID>` */
  from: string
  /**
   * 代表哪位成员发起。`content` 范围的确认只发给这位成员的窗口（没有时发给全部编辑者与所有者）；
   * `workspace` 范围的确认发给全部所有者，这位成员只作为发起人显示，即使是编辑者也不能回答
   */
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
  /**
   * 本进程的 `/mcp`：LOCAL 模式中是服务端的本机地址（agent 子进程与服务端在同一台机器上）；
   * SHARED 模式中是 gateway 转发 `/mcp` 的地址（sandbox 的网络只到 gateway，10.9 节）
   */
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

// gateway（D13，10.9 节）---------------------------------------------------------------

/** 访问 gateway：插件的路由在 `<url>/<插件 ID>/` 下 */
export interface GatewayAccess {
  /** gateway 的内部地址（compose 中 serve 与 sandbox 都用它，如 `http://gateway:4320`） */
  url: string
  /** `Authorization: Bearer` 令牌：serve 的服务令牌，或 serve 为一次运行、构建或一个 agent 会话签发的限定令牌 */
  token: string
}

/** 一个令牌的授权，gateway 校验令牌后交给路由 */
export interface GatewayGrant {
  /** `service`：serve 的服务令牌；`scoped`：限定令牌 */
  kind: 'service' | 'scoped'
  /** 限定令牌能访问的插件 ID（服务令牌能访问全部） */
  plugins: string[]
  /** 签发的用途，如 `agent:<任务 ID>`、`run:<文档>`，写进 gateway 的日志 */
  purpose: string
  /** 代表的成员 ID */
  member?: string
  /** ISO 8601；过期或作废后请求得到 401 */
  expires: string
}

export interface GatewayRequestContext {
  grant: GatewayGrant
  /** `/*` 路由中路由键之后的路径 */
  rest: string
}

export interface GatewayRoute {
  /** 只接受 serve 的服务令牌（例如所有者登记同意记录）；默认也接受包含本插件的限定令牌 */
  service?: boolean
  handle(request: Request, ctx: GatewayRequestContext): Response | Promise<Response>
}

export interface GatewayProxy {
  /** 挂在 `<url>/<插件 ID>/<path>/` 下；HTTP 与 WebSocket 都转发 */
  path: string
  target: string
  /** 转发时加上的请求头（第三方凭据）；调用方看不到 */
  headers?: Record<string, string>
}

export interface GatewayContribution {
  routes?: Record<string, GatewayRoute>
  proxies?: GatewayProxy[]
  close?(): void | Promise<void>
}

export interface GatewayContext {
  /** 运营者给本插件的设置：gateway 启动时读取的工作区配置 `presmium.workspace.yaml` 中的 `settings.<插件 ID>` */
  settings: Record<string, unknown>
  /** gateway 进程的环境变量：SHARED 模式中第三方凭据只在这里 */
  secret(name: string): string | undefined
  /** 运营者目录（同意记录等运营者数据）：只挂在 gateway 容器中，文稿、agent 与被执行的代码都访问不到 */
  operatorDir: string
  log: Logger
}
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
  // ……已有字段（`environments` 见 4.6 节）……
  server?: ServerClient
}
```

宿主层的实现（WP-73a）：`useServer()` 返回一个始终可用的代理，读它的 `available` 是响应式的，宿主适配给出客户端之前渲染的组件在之后自动更新；宿主适配经 `startHost({ server })` 给出客户端，也可以更早调用 `provideServer(client)`（网页形态在创建应用时调用）。`createServerClient({ document })` 是两种形态共用的客户端：请求头 `Presmium-Document` 的值是 URI 编码的文档目录（请求头只能是 Latin-1），`EventSource` 不能带请求头，所以 `events()` 把文档目录放在查询参数 `document` 中。网页形态在 `presmium dev` 中由生成的 VitePress 配置写 `themeConfig.presmium.server`，幻灯片形态由生成的 Slidev 头部写 `presmiumServer: true`，两者据此创建客户端；静态构建两者都没有。有服务端时 `startHost` 在工具栏登记确认入口 `PmApprovals`（`@presmium/host` 导出），并连接控制通道（10.4 节）。

服务端怎样挂载这些契约、怎样认证与确认，见第 10 节。`settings` 与 `config` 的区别：`config` 是文稿头部的内容，任何能编辑文稿的人（包括 agent）都能改；`settings` 只由运营者设置，确认策略之外的安全相关设置（工作区的插件列表、agent 的替换命令与模型的服务提供方、修改的审阅、编译时执行的策略与传入的环境变量、录音的去处、是否允许克隆音色、同意记录的目录）都在这里或在环境变量中（第 11 节）。

gateway 的契约只给插件写 `gateway()` 贡献用：gateway 怎样签发与校验令牌、怎样转发 `/mcp`，见 10.9 节。插件在 serve 与 agent-host 中经 `NodeServiceContext.gateway`、`ServerContext.gateway`、`EnvironmentContext.gateway`、`RunContext.gateway` 调用自己在 gateway 中的贡献（`<url>/<插件 ID>/…`）；这些字段只在 SHARED 模式中出现，LOCAL 模式中插件在本进程中经 `secret` 读取凭据，不经 gateway。

### 4.8 语音、智能体与修改历史

`packages/kernel/src/contracts.ts`：

```ts
// 语音（P-132、P-133）---------------------------------------------------------

/** 秒；中文为单字 */
export interface SpeechWord { text: string, start: number, end: number }

export interface Synthesis {
  /** 浏览器中为 Blob；Node 中为合成缓存中文件的路径 */
  audio: Blob | string
  /**
   * 引擎返回的格式，缓存不重新编码：语音服务向引擎请求 Ogg/Opus（`audio/ogg`），
   * 只给出其他格式的引擎按其格式保存（假引擎为 `audio/wav`）。AI 生成的标识由语音服务写进它的元数据
   */
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
  /**
   * 服务提供方的名字，界面据此标明（N-08）。来自运营者的配置，在任何请求之前就已知：
   * 运营者定义的引擎为 `PRESMIUM_SPEECH_<ID>_PROVIDER`（必需）；`volcengine` 为“火山引擎”
   * （英文界面为 `Volcengine`，按请求的 `Accept-Language`）
   */
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
  /**
   * 克隆某人的音色：只在运营者设置 `cloned: true`、且运营者目录中的同意记录目录（`consentDir`，ir.md 第 10 节）
   * 中有本人的同意记录时可以合成（N-08）；文稿目录中的记录不算。SHARED 模式中这个目录只在 gateway 容器中
   */
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
  /**
   * 运营者定义了、因而可用的引擎：LOCAL 模式中地址与凭据成对出现在本进程的环境变量中；
   * SHARED 模式中它们只在 gateway 的环境中，列表（含服务提供方）取自 gateway
   */
  engines(): Promise<SpeechEngineInfo[]>
  voices(engine: string, lang?: string): Promise<VoiceInfo[]>
  /**
   * 先查合成缓存，命中时不发请求；缺失时调用引擎，在音频的元数据中加入 AI 生成的标识后写入缓存。
   * 引擎不可用时、克隆音色没有开启或没有有效的同意记录时拒绝（抛出带原因的错误）
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

/**
 * `question` 只读；其余是修改任务（`chat` 也用于起草新文档），助手按同一条规则处理：
 * 一文档一任务、结束时经 `REVISIONS` 提交一次、可以撤销、超出范围的写入经确认
 */
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
  /** 工具调用的进度：`call` 是 ACP 的 `toolCallId`，`status` 为 `completed` 时助手记一个审阅的检查点 */
  | { type: 'progress', text: string, tool?: string, call?: string, status?: 'running' | 'completed' | 'failed' }
  | { type: 'message', text: string, citations?: Citation[] }
  | { type: 'approval', id: string, request: ApprovalRequest }
  | { type: 'annotation', id: string, status: AnnotationStatus, note?: string }
  /** 一个工具调用之后的检查点（修改任务） */
  | { type: 'step', step: ReviewStep }
  /** 修改任务结束、等待发起人审阅（`settings.presmium.assistant.review: required`）：整个任务的改动与各步 */
  | { type: 'review', engine: string, changes: ReviewChange[], steps: ReviewStep[] }
  | { type: 'done', revision?: string }
  | { type: 'error', message: string }

/** 发起人对一个修改任务的审阅决定 */
export type ReviewDecision =
  /** 接受；`reject` 中的文件（相对于工作区根目录）恢复为任务开始时的内容，任务新建的文件删除 */
  | { accept: true, reject?: string[] }
  /** 全部拒绝：恢复任务开始时的状态 */
  | { accept: false }

export interface AgentTask {
  readonly id: string
  readonly events: AsyncIterable<AgentEvent>
  cancel(): void
  /** 回答 `review` 事件；只有发起任务的成员与所有者可以回答 */
  review(decision: ReviewDecision): Promise<void>
}

/** 浏览器端：页面向服务端的助手提交任务 */
export interface AgentClient {
  /** 服务端有 agent 运行时（运营者配置了模型访问，或给出了替换的运行时），且当前成员可以提交这类任务 */
  available(kind: AgentTaskKind): boolean
  /** 模型的服务提供方，如 `DeepSeek`，来自运营者的设置；提问与对话的界面据此标明（N-08）。不可用时为 undefined */
  provider(): string | undefined
  /** agent 运行时的名字与版本（`AgentRuntime.runtime`），与服务提供方分开显示；agent 启动之前为 undefined */
  runtime(): string | undefined
  submit(request: AgentTaskRequest): AgentTask
}

export const AGENT = defineService<AgentClient>('presmium.agent')

export interface AgentSessionOptions {
  /**
   * ACP `session/new` 的 `cwd`，也是 agent 文件工具可写的根目录：修改任务为 `ChangeReview.root`
   * （文档目录，或它的 deltabox 视图）；问答为文档目录。写到它之外经 agent 的权限请求，属于 `workspace` 范围
   */
  cwd: string
  /** `author` 可以写源码；`tutor` 只读，没有操作类工具 */
  mode: AgentMode
  member: Member
  /**
   * Presmium 的 MCP 服务，写进 ACP `session/new` 的 `mcpServers`（HTTP 方式，带 `Authorization` 头）。
   * 调用方经 `MCP_ENDPOINT.issue(member, mode)` 取得，会话关闭后 `revoke`；省略时 agent 没有 Presmium 的工具
   */
  mcp?: McpAccess
  /**
   * SHARED 模式中模型的访问：gateway 上 Messages 兼容的地址（`<gateway>/presmium.assistant/model`）与 serve
   * 为这个会话签发的限定令牌；DeepSeek Harness 以它们为 `DEEPSEEK_BASE_URL` 与 `DEEPSEEK_API_KEY`，从不拿到
   * 模型服务的密钥。LOCAL 模式中省略：运行时用运营者在本进程环境中给出的模型凭据（随包的 DeepSeek Harness
   * 怎样得到它们见下文“agent 的启用”）
   */
  model?: GatewayAccess
  /** agent 自身的权限请求（ACP `session/request_permission`）交给它确认 */
  approve(request: ApprovalRequest): Promise<boolean>
}

export interface AgentSession {
  prompt(request: AgentTaskRequest, signal?: AbortSignal): AsyncIterable<AgentEvent>
  cancel(): Promise<void>
  close(): Promise<void>
}

/** Node 端：驱动一个 agent；唯一的实现是 ACP 客户端（SHARED 模式中 serve 里是 agent-host 的客户端） */
export interface AgentRuntime {
  /**
   * 模型的服务提供方，启动前就已知：随包的 DeepSeek Harness 取自运营者配置的模型访问（`DEEPSEEK_API_KEY` 为
   * `DeepSeek`，或 `PRESMIUM_MODEL_PROVIDER`；SHARED 模式中由 gateway 给出）；替换的运行时取
   * `settings.presmium.assistant.provider` 或 `PRESMIUM_AGENT_PROVIDER`。没有时不登记 `AGENT_RUNTIME`
   */
  readonly provider: string
  /** agent 在 ACP `initialize` 中报告的名字与版本（`agentInfo`，如 `DeepSeek Harness 0.2.0`）；第一次启动 agent 之前为 undefined */
  readonly runtime?: string
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

// 修改审阅（P-113 至 P-115，D12）---------------------------------------------------------

export type ReviewChangeKind = 'added' | 'modified' | 'deleted'

/** 一个文件相对于比较基准的改动 */
export interface ReviewChange {
  /** 相对于工作区根目录 */
  path: string
  kind: ReviewChangeKind
  binary: boolean
  /** 增加与删除的行数；二进制文件为 0 */
  added: number
  removed: number
  /** 统一差异格式的文字；二进制文件与过大的差异省略 */
  diff?: string
}

/** 一个工具调用之后的检查点：自上一个检查点以来的改动 */
export interface ReviewStep {
  id: string
  /** 工具调用的标题 */
  label: string
  /** 工具名 */
  tool?: string
  /** ISO 8601 */
  at: string
  changes: ReviewChange[]
}

/** 一个修改任务的审阅：从任务开始到接受或拒绝 */
export interface ChangeReview {
  /** 交给 agent 的工作目录（`AgentSessionOptions.cwd`）：deltabox 为文档目录的会话视图，git 为文档目录本身 */
  readonly root: string
  /** `immediate`：改动在审阅之前已在文档目录中（预览随之更新）；`on-commit`：接受之后才写入文档目录 */
  readonly visibility: 'immediate' | 'on-commit'
  /** 记一个检查点，返回自上一个检查点以来的改动；助手在每个工具调用完成时调用（至多 100 个，之后并入最后一步） */
  step(label: string, tool?: string): Promise<ReviewStep>
  steps(): readonly ReviewStep[]
  /** 整个任务相对于任务开始时的快照的改动 */
  diff(): Promise<ReviewChange[]>
  /**
   * 接受：改动留在（`on-commit` 时写入）文档目录，审阅结束；`reject` 中的文件恢复为任务开始时快照中的内容，
   * 快照中没有的（任务新建的）删除。返回留下改动的文件，交给 `REVISIONS.commit`
   */
  accept(reject?: string[]): Promise<string[]>
  /** 全部拒绝：恢复任务开始时的状态，任务新建的文件删除；审阅结束 */
  rollback(): Promise<void>
  /** 释放资源；仍未接受时等于 `rollback()` */
  close(): Promise<void>
}

export interface ChangeReviewService {
  /** 实现的名字，界面据此显示，如 `deltabox`（git 实现在助手中，不经这个令牌） */
  readonly engine: string
  /** 为一个修改任务开始审阅并记下任务开始时的快照；同一文档目录同一时间至多一个 */
  open(options: { document: string, task: string, member: Member }): Promise<ChangeReview>
}

/** Node 端服务：`addon-deltabox` 在主机满足条件时登记；SHARED 模式中 serve 里是 agent-host 的客户端（10.7、10.8 节） */
export const CHANGE_REVIEW = defineService<ChangeReviewService>('presmium.changeReview')

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
  /** 把这些文件的改动提交为一个提交（git 的钩子关闭）；没有改动时为 undefined */
  commit(change: { files: string[], message: string, origin: RevisionOrigin }): Promise<Revision | undefined>
  history(filter?: { document?: string, task?: string, limit?: number }): Promise<Revision[]>
  /** `git revert`；有冲突时不提交、工作树复原，返回冲突的文件 */
  revert(id: string, member: Member): Promise<RevertResult>
}

export const REVISIONS = defineService<RevisionService>('presmium.revisions')
```

要点：

- 提交说明的格式：第一行是摘要；正文列出批注（或对话摘要）与 agent 的说明；尾注 `Presmium-Task: <任务 ID>`、`Presmium-Origin: agent|document|editor` 与 `Co-authored-by`（发起人）。作者字段取登录身份。修改历史按尾注筛选，所以不依赖服务端的数据库。工作区的 git 命令都关闭钩子与 fsmonitor（`-c core.hooksPath=/dev/null -c core.fsmonitor=false`），提交与撤销不执行仓库中的任何脚本。
- 语音的 `lang` 是 BCP 47 标签而不是界面语言 `Locale`：文稿可以是 Presmium 界面没有翻译的语言，语音引擎照样支持。
- **agent 的启用（D11）与 MCP 访问**：DeepSeek Harness 是助手插件的依赖（精确固定的版本），运营者配置了模型访问时助手就以子进程启动它（ACP over stdio，随包的配置模板关闭会话日志上传与遥测，并以 `DSH_TELEMETRY_MODE=DISABLED` 启动），不需要另外安装或给出命令。模型访问是 `DEEPSEEK_API_KEY`（DeepSeek 的官方地址，服务提供方为 `DeepSeek`），或运营者定义的 Messages 兼容服务 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 与 `PRESMIUM_MODEL_PROVIDER`（三者都要有，凭据只发往这个地址；设置了它们时优先于 `DEEPSEEK_API_KEY`）。LOCAL 模式中随包的 DeepSeek Harness 的环境是助手进程的环境去掉全部 `PRESMIUM_` 开头的变量与 `DEEPSEEK_BASE_URL` 之后，加上模型访问与 `DSH_TELEMETRY_MODE=DISABLED`：`DEEPSEEK_API_KEY` 原样传入，不设 `DEEPSEEK_BASE_URL`（DeepSeek Harness 因此只连 DeepSeek 的官方地址）；`PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 改名为 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY` 传入（DeepSeek Harness 读这两个变量，它的 DeepSeek 适配说 Messages 协议）。SHARED 模式中这些变量只在 gateway 中，助手经 gateway 得知服务提供方，agent 只得到 `AgentSessionOptions.model`。`PRESMIUM_AGENT_COMMAND`（`tutor` 模式为 `PRESMIUM_AGENT_TUTOR_COMMAND`）或 `settings.presmium.assistant.command`、`tutor` 只用来替换运行时（Claude、Codex、Gemini 的 ACP 适配），这时服务提供方取 `PRESMIUM_AGENT_PROVIDER` 或 `settings.presmium.assistant.provider`，运行时用它自己在环境中的凭据；替换只在 LOCAL 模式中生效（sandbox 中没有凭据，SHARED 模式只运行随包的 DeepSeek Harness）。既没有模型访问也没有替换的运行时，或替换的运行时没有服务提供方时，不登记 `AGENT_RUNTIME`，`AGENT.available()` 为 false，不启动任何进程，启动日志说明缺少的设置（N-08 的“显式开启”）。助手的服务端路由为每个 agent 会话调用 `ctx.service(MCP_ENDPOINT).issue(member, mode)`，把得到的 `McpAccess` 放进 `AgentSessionOptions.mcp`，会话关闭时 `revoke`。
- **修改任务**：`annotations`、`chat`（含起草）与 `transcript` 由助手按同一条规则处理（WP-81）：同一文档一次一个；开始时打开一个审阅（`CHANGE_REVIEW`，没有时用助手内置的 git 实现，10.7 节），agent 的工作目录是审阅的 `root`；每个工具调用完成时记一个检查点（`step` 事件）；结束时按运营者设置 `settings.presmium.assistant.review` 处理：`required`（默认）发出 `review` 事件，等发起人逐个文件查看差异后全部接受、全部拒绝或拒绝某些文件，接受时提交为一个修改（说明列出批注、对话摘要或讲授轨 ID，与 agent 的说明）；`auto` 直接全部接受并提交（审阅之前的行为）。接受之后的撤销仍是 `git revert`。提交任务的一方（编辑模式的面板、工作区的新建表单、讲授面板）只构造请求。
- **确认的范围**：agent 的文件工具以审阅的 `root`（文档目录）为可写的根目录，写到它之外由 agent 发出权限请求。助手把 agent 的权限请求按 `ApprovalScope` 分类（10.4 节）：编辑任务的文档目录中的文件属于 `content`，由发起任务的成员确认，而修改任务的发送就是这类写入的确认（N-08），所以助手直接允许，不再逐次询问；shell、网络与文档目录之外的路径属于 `workspace`，只有所有者能允许（SHARED 模式中在所有者控制台上，10.4 节），发起任务的编辑者不能；对运营者目录（10.5 节）的请求一律拒绝，不发给任何人。`question` 任务的权限请求一律拒绝。
- **agent 的工具按信任模式（D15）**：LOCAL 模式中作者的 agent 用模板 `presmium`：保留 shell，沙箱为 `workspace-write`（根目录是审阅的 `root`），权限策略为询问。SHARED 模式中用模板 `presmium-shared`：关闭 DeepSeek Harness 的 shell、命令执行与联网工具，agent 只有文件工具与 Presmium 的 MCP 工具，代码只经 MCP 的 `run_code` 在 agent-host 中执行（10.6 节）。`tutor` 模式用模板 `presmium-tutor`：只读，没有 shell、网络与写文件的工具。
- **服务提供方的标明**（N-08）：问答与对话的面板写明 `AGENT.provider()`，另写明运行时 `AGENT.runtime()`（已知时）；转写与合成的入口写明引擎的 `SpeechEngineInfo.provider`；本机引擎（`local: true`）写明不外发。服务提供方都来自运营者的配置，界面在第一个请求之前就能显示。

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

`createOperations()` 是两种宿主共用的实现（`startHost` 提供它与 `STATUS`）：`replay` 调用登记的重放后，`replaying` 保持为 true 到下一个任务，期间同步发生的报告被丢弃。IR 运行时的部分是 `@presmium/viewer` 的 `followOperations(viewer, operations)`：位置或视图变化时同步报告 `go`（数据 `{ section, step, view }`，章节是 ID），重放 `go` 时先切到它的视图（隐藏的演讲者视图除外）再到达位置；网页主题在每次内核启动后接上它。

报告的分工（插件之间不互相引用，词汇是内核的共享契约）：IR 运行时报告 `go`（章节、步骤、视图）；执行插件报告 `run`（块与结果的缓存键）；引导插件报告 `spot`、`hint`；讲授插件自己报告指针 `point`（`elementFromPoint` → 最近的 `[data-block]` → 块内相对坐标，约 20 Hz，简化后保存）与工具栏的激光笔、荧光笔 `ink`。回放某一时刻：`clear()`，再按时间依次 `replay(…, true)` 此前的事件，最后一个事件不快进。

实际交付（WP-77）：引导插件新增内核插件 `src/client/plugin.ts`（两种形态都登记 `spot`、`hint` 的重放）与视图插件 `src/client/viewer.ts`（放映视图与演讲者窗口中 `s`、`h` 给指针下的块加上或取消聚光、提示并报告）；这种聚光持续到位置离开它的章节或步骤（`span`），由 `NAVIGATION.position` 的同步观察者结束，所以现场、依次重放与跳转后的折叠一致。讲授插件 `@presmium/slidev-addon-lecture`：`src/domain/`（讲授轨的读写与每项一行的格式、`at` 的时刻、章节、漂移分级、块指纹与 IR 哈希、VTT、路径简化、重录一节的拼接）、`src/node/`（服务端路由、检查项 `presmium.lecture`、站点渲染端 `lecture`）、`src/client/`（内核插件登记 `point`、`ink` 的重放；视图 `lecture`；放映视图上的录制与播放两个图层；`SilentClock`、`MediaClock`；Mediabunny 只在 `src/client/media.ts` 中）。与设计不同之处：视图插件只以类型引用 `@presmium/viewer`，拿不到章节上下文（`SECTION_CONTEXT`），自己画不出按步骤显示的幻灯片，所以回放的“真实页面”是放映视图：`lecture` 视图切到放映视图并保留 URL 的 `track` 参数，播放器是放映视图上的图层，重放 `go` 时去掉 `view`。若以后要独立的讲授视图，需要视图插件的上下文提供放映视图的组件或章节上下文（只增加，由验收者决定）。`run` 的重放没有 `clear`（`packages/viewer/src/code.ts`），跳回运行之前的时刻时已显示的录制输出不消失。

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
| agent | ACP 协议的确定性测试 agent（`packages/addon-assistant/test/fixtures/scripted-agent.mjs`，用 `@agentclientprotocol/sdk` 的 agent 端写成的真实子进程）：按测试给出的脚本读取 MCP 工具、修改文件、请求权限、给出带引用的回答；助手按 `PRESMIUM_AGENT_COMMAND` 或 `settings.presmium.assistant.command` 启动它（替换运行时的同一条路）。随包的 DeepSeek Harness 不调用模型的部分（启动、`initialize`、`session/new`、`--dump-config` 校验三份模板）用假的 `DEEPSEEK_API_KEY` 对固定版本运行；真正调用模型的用例需要凭据，默认跳过 |
| 信任模式 | LOCAL：一个 `presmium serve` 或 `presmium dev` 进程。SHARED 的协议：同一台机器上分别启动 `presmium serve`（带登录代理的共享密钥与控制台的主机名）、`presmium gateway` 与 `presmium agent-host` 三个进程，经 `PRESMIUM_GATEWAY_URL`、`PRESMIUM_AGENT_HOST_URL` 与各自的令牌连接；所有者控制台与工作区站点以请求的 `Host` 区分（浏览器用例中两个主机名都解析到本机）；SHARED 模式只运行随包的 DeepSeek Harness，它的用例以测试起的 Messages 兼容假模型服务为 gateway 的上游（真实的 HTTP 服务，按脚本返回回答与工具调用，同假语音引擎的做法）；SHARED 的隔离（三个容器、不同的 uid、sandbox 的网络、数据卷的权限）只在 compose 模板的部署用例中验证，需要 Docker |
| gateway | `presmium gateway` 的真实进程：模型代理的上游是测试起的 Messages 兼容 HTTP 监听器，语音的上游是假引擎，远端环境的上游是 compose 模板的 Jupyter；用例检查上游收到的凭据、serve 与 agent-host 的环境中没有凭据，以及限定令牌在会话结束后得到 401 |
| 修改审阅 | git 实现：临时目录中的真实 git 仓库；deltabox 实现：真实的 `deltabox-lite`（Node 绑定），不满足条件（平台、glibc、FUSE、Landlock）时跳过并说明原因 |
| 语音 | 确定性的假引擎（`presmium-speech fake`）：真实的 HTTP 服务，同一协议，测试经 `PRESMIUM_SPEECH_FAKE_URL` 与 `PRESMIUM_SPEECH_FAKE_PROVIDER=Presmium fake` 把它定义为引擎 `fake`（与真实引擎同一条配置路径）；中文每字 220 ms、拉丁字母每字 60 ms、词间 80 ms，合成的 WAV 中嵌入文字与音色，合成后再转写可以精确往返；音色列表中有一个克隆音色，用于同意记录的用例；用例数它收到的请求，验证缓存命中时不再合成。火山引擎与 Groq 的冒烟用例只在设置了 `PRESMIUM_TEST_VOLCENGINE_KEY`、`PRESMIUM_TEST_GROQ_KEY` 时运行 |
| 讲授 | 录制：Chromium 的假麦克风播放假引擎合成的音频（`--use-fake-ui-for-media-stream`、`--use-fake-device-for-media-stream`、`--use-file-for-fake-audio-capture=<wav>%noloop`，以 `test.use({ launchOptions })` 只加在讲授的用例上），讲授轨中有 `go` 与 `point`，回放到时刻 t 显示正确的章节与步骤（WP-77 的 `e2e/lecture.spec.ts` 用假设备自带的音调与假摄像头，不加 `--use-file-for-fake-audio-capture`：假引擎由同时进行的 WP-82 交付；回放的测试讲授轨带一段构建前写入的静音 WAV，所以走 `MediaClock`）；脚本化：用假引擎构建测试讲义，检查片段、VTT 与提示标记的时刻 |
| 工作区 | 临时目录中的真实 git 仓库：文档操作与撤销各形成正确的提交（读 `git log` 与尾注）；部署模板的冒烟用例需要 Docker，没有时跳过 |

服务端的用例（WP-73a）：`packages/server/test/server.test.ts` 对测试文稿运行 `presmium dev`；`presmium serve` 由 WP-79 交付，在那之前 `serve` 模式的用例由测试用的宿主 `packages/server/test/fixtures/serve-host.ts` 启动（以子进程调用真实的 `startServer`，文档用真实的编译器编译），`e2e/server.spec.ts` 的所有者控制台用例同样用它，并在前面放一个测试用的登录代理（保留 `Host`，加上共享密钥与身份）。浏览器不允许 `fetch` 设置 `Host`，Node 端的用例用 `node:http` 发送原样的请求头。

这些用例的启动参数只加在各自的 spec 中，`playwright.config.ts` 不为它们增加项目。需要 Docker、GPU 或模型凭据的用例跳过时打印原因与启用方法，不算失败。

辅助命令（插件包与服务包的可执行文件）：

| 命令 | 包 | 选项 | 作用 |
|---|---|---|---|
| `presmium-export [deck]` | `@presmium/slidev-addon-publish` | `--format pdf\|png`、`--output <file>`、`--with-clicks`（每步一页）、`--range <1,3-5>`、`--dark`、`--wait <ms>`（打印页加载后再等待的时间，默认 1000）、`--timeout <ms>`（打印页的加载时限，默认 120000）、`--json` | 准备幻灯片渲染端的 Slidev 文稿（不完整构建）后运行 `slidev export`（`--wait-until networkidle`）；`slidev export` 在根路径服务文稿，所以文稿按 `base` 为 `/` 准备（`prepare` 的 `base` 选项），不论幻灯片构建时的站点路径。`slidev export` 在打印页还没显示全部幻灯片时截图也以 0 退出（机器繁忙，或文稿第一次导出时 Vite 优化依赖并重新加载页面）：导出缺少某张幻灯片的页（PNG 中没有它的图片，PDF 的页数少于幻灯片数）时报错退出（退出码 2）并提示加大 `--wait`。每张幻灯片的页数按 Slidev 的点击数，不按 IR 的步骤数（导出中组件显示静态的 `fallback`，没有自己的步骤）。PDF 导出后检查每个链接仍是链接（PNG 报告链接无法检查） |
| `presmium-diff <refA> <refB> [deck]` | 同上 | `--out <dir>`、`--threshold <ratio>`、`--wait <ms>`、`--install`、`--json` | 两个提交的视觉差异：幻灯片逐页，网页逐页（文档视图）与逐节（放映视图）截图比较，报告写在 `.presmium/diff/` |
| `presmium-classroom-server` | `@presmium/classroom-server` | `--port <n>`（默认 1234，`0` 取空闲端口）、`--host <address>`（默认全部网卡）、`--deck <dir>`（归档写到 `<dir>/.presmium/classroom/`） | 课堂服务（y-websocket）；启动后打印服务地址与局域网地址 |
| `presmium-language-server` | `@presmium/language-server` | `--stdio`、`--node-ipc`、`--socket=<port>` | 语言服务，VS Code 扩展启动它 |
| `presmium-mcp [deck]` | `@presmium/mcp` | `--allow operate`（不加时不提供操作类工具） | 以 stdio 提供与 `/mcp` 相同的读取类工具，供编辑器中的 agent（Claude Code、Codex、VS Code）使用；没有放映位置与课堂（WP-78） |
| `presmium-lecture export [deck]` | `@presmium/slidev-addon-lecture` | `--track <id>`、`--out <file>`（`.webm` 或 `.mp4`）、`--size <宽x高>`、`--fps <n>` | 用 Playwright 播放讲授并与音频合成为视频文件（P-135，WP-83） |
| `presmium-speech fake` | `@presmium/slidev-addon-speech` | `--port <n>` | 确定性的假引擎（WP-82）。单独运行的语音网关已由 `presmium gateway` 代替（`ir.md` 第 7 节） |
| `presmium-speech consent` | `@presmium/slidev-addon-speech` | `<引擎> <音色> <记录文件>`、`--operator-dir <目录>`（默认为当前工作区在 LOCAL 模式中的运营者目录，10.5 节） | 运营者登记克隆音色的同意记录（WP-82），写入运营者目录中的 `consentDir`；SHARED 模式中在 gateway 容器中运行（`docker compose exec gateway presmium-speech consent …`）。与所有者经语音插件路由的登记效果相同（第 11 节） |

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
| K-08 Node 端服务、服务端贡献、运营者设置与运营者插件、gateway、行内角色、N-08 本机检查 | server、compiler、cli、host、viewer | `server/test/server.test.ts`、`server/test/gateway.test.ts`、`e2e/server.spec.ts`、`cli/test/roles.test.ts`、`cli/test/assets.test.ts`、`cli/test/plugins.test.ts`（WP-73a） |
| P-46 卡片、栅格、选项卡、按钮 | compiler、kernel、viewer | `e2e/content.spec.ts`、`render-notebook/test/cards.test.ts`（WP-85） |
| P-42 增补 封面与字幕轨 | addon-content | `e2e/content.spec.ts`、`addon-content/test/media.test.ts`（WP-85） |
| P-54 发布检查、P-55 受众范围 | compiler、cli、workspace | `cli/test/publish-checks.test.ts`、`cli/test/audience.test.ts`（WP-87；含 `presmium serve` 中读者看到的学生视图） |
| P-68 先预测再揭示 | addon-classroom | `e2e/predict.spec.ts`（文档视图与放映视图用静态产物；课堂用例在 `presmium dev` 中运行，同时检查页面经控制通道报告的课堂汇总）、`addon-classroom/test/predict.test.ts`（WP-88） |
| P-78、P-79、P-123，P-122 增补 | web、workspace、render-slides、render-notebook、compiler | `e2e/site.spec.ts`、`web/test/translations.test.ts`（WP-86） |
| P-100 至 P-102 | compiler、addon-exec、addon-exec-local、viewer、render-slides、render-notebook | `e2e/exec-env.spec.ts`、`addon-exec/test/session.test.ts`、`addon-exec/test/sandbox.test.ts`（经 `PROCESS_SANDBOX` 运行）、`addon-exec/test/secrets.test.ts`、`render-notebook/test/outputs.test.ts`、`cli/test/env.test.ts`、`addon-exec-local/test/local-env.test.ts`（`kind: devcontainer` 的环境，需要 Docker）（WP-73b） |
| P-103 | addon-exec-wasi | `e2e/exec-wasi.spec.ts`、`addon-exec-wasi/test/compile.test.ts`（WP-74） |
| P-104 | addon-exec-webgpu、addon-exec | `e2e/exec-webgpu.spec.ts`、`addon-exec-webgpu/test/record.test.ts`（WP-75） |
| P-105 至 P-107 | addon-exec-jupyter、templates/env | `e2e/exec-remote.spec.ts`、`addon-exec-jupyter/test/remote.test.ts`、`addon-exec-jupyter/test/credentials.test.ts`、`addon-exec-jupyter/test/gateway.test.ts`（WP-76） |
| P-110 | mcp | `mcp/test/mcp.test.ts`、`e2e/mcp.spec.ts`（WP-78） |
| P-111、P-112 | addon-assistant、addon-classroom | `addon-assistant/test/acp.test.ts`、`addon-assistant/test/dsh.test.ts`、`addon-assistant/test/shared.test.ts`（SHARED 模式）、`e2e/assistant.spec.ts`（WP-80） |
| P-113 至 P-115 | addon-assistant、workspace、addon-deltabox | `e2e/assistant-edit.spec.ts`（WP-81，含修改审阅：逐个文件的差异、全部接受、全部拒绝、拒绝一个文件）、`workspace/test/documents.test.ts`（WP-79）、`addon-deltabox/test/review.test.ts`（WP-90） |
| P-120 至 P-122、N-09 | workspace、web、cli、addon-assistant | `workspace/test/documents.test.ts`、`workspace/test/site.test.ts`、`workspace/test/deploy.test.ts`、`cli/test/serve.test.ts`、`e2e/workspace.spec.ts`（WP-79）；P-121 中由 agent 起草见 `e2e/assistant-edit.spec.ts`（WP-81） |
| P-90、P-130、P-131、P-137 | addon-lecture、addon-guide | `e2e/lecture.spec.ts`、`addon-lecture/test/track.test.ts`（WP-77）；由 agent 生成译文见 `e2e/lecture-writeback.spec.ts`（WP-84） |
| P-132、P-133 | addon-speech、addon-lecture | `addon-speech/test/speech.test.ts`、`addon-speech/test/engines.test.ts`、`addon-speech/test/gateway.test.ts`（WP-82）；讲授轨中的转写与换音色见 `e2e/lecture-script.spec.ts`（WP-83） |
| P-134、P-135 | addon-lecture | `e2e/lecture-script.spec.ts`、`addon-lecture/test/script.test.ts`、`addon-lecture/test/video.test.ts`（WP-83） |
| P-136 | addon-lecture | `e2e/lecture-writeback.spec.ts`（WP-84） |
| N-08 安全基线 | server、compiler、addon-exec、mcp、addon-assistant、workspace、addon-speech、addon-exec-jupyter、addon-lecture、addon-deltabox | 各工作包的拒绝用例：外来 `Host` 与 `Origin`、缺令牌、缺登录、读者调用编辑者的路由、`presmium gateway` 不带令牌或带作废的限定令牌、SHARED 模式的 serve 在环境中有第三方凭据或缺少 gateway、agent-host 与控制台的主机名时拒绝启动（`server/test/server.test.ts`，WP-73a）；所有者控制台：工作区站点的源上没有所有者路由、收不到也不能回答 `workspace` 范围的确认，控制台只接受来自自己的源的回答，站点页面中的组件以所有者的身份发出的回答被拒绝（`server/test/server.test.ts`、`e2e/server.spec.ts`，WP-73a）；编译时执行的代码经自己的环境拿不到凭据（`addon-exec/test/secrets.test.ts`，WP-73b）；进程沙箱中的代码读不到父进程环境中的秘密、连不上网络、写不了运行目录之外，没有工作区配置的 `presmium build` 默认经它运行（`addon-deltabox/test/sandbox.test.ts`，WP-90）；SHARED 模式中未录制的代码等所有者确认、只在 agent-host 中执行且不重复请求、`off` 不执行，`presmium serve` 拒绝文稿相对路径与文稿目录 `node_modules` 中的插件与渲染端包，文稿组件引用的 VitePress 数据加载器只在 agent-host 中运行，指向工作区之外的符号链接不被读取（`cli/test/serve.test.ts`，WP-79）；compose 布局的隔离：三个容器的 uid 不同、sandbox 只连得到 gateway、serve 只在内部网络上、serve 的环境中没有第三方凭据与它自己的令牌、sandbox 写不了 `.git/` 与工作区配置（`workspace/test/deploy.test.ts`，WP-79，需要 Docker）；未确认的操作类工具、作废的会话令牌（WP-78）；`tutor` 模式的写入、SHARED 模式中编辑者的令牌调用 `run_code` 只由所有者在控制台上确认、agent 只拿到会话的模型令牌且会话结束后作废、LOCAL 模式中 agent 的环境没有 `PRESMIUM_` 开头的变量而模型访问改名传入（WP-80）；编辑者不能回答自己 agent 的工作区范围的确认，agent 对运营者目录的权限请求直接被拒绝，被拒绝的文件恢复为任务开始时的内容，单份文稿的仓库中审阅里的工作区配置要所有者另行允许（`e2e/assistant-edit.spec.ts`，WP-81）；文稿把凭据引向别的地址（WP-76、WP-82）；没有同意记录的克隆音色、写在文稿中的同意记录、SHARED 模式中写在工作区里的记录（gateway 只认自己运营者目录中的记录），所有者路由只在控制台的源上（WP-82）。服务提供方的标明：`e2e/assistant.spec.ts`（WP-80）、`e2e/assistant-edit.spec.ts`（WP-81）、`addon-speech/test/speech.test.ts`（WP-82）、`e2e/lecture-script.spec.ts`（WP-83）。AI 合成的标识：`e2e/lecture-script.spec.ts`（播放界面，WP-83）、`addon-speech/test/speech.test.ts`（音频与 `<键>.json` 的元数据，WP-82）（第 11 节） |

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
| Slidev 的 Monaco Runner 的内部 DOM：运行之前的提示（“Click the play button to run the code”）是 `.slidev-monaco-container` 中 UnoCSS 类 `.opacity-50` 的元素，不透明度 0.5 时对比度低于 AA；幻灯片样式把它提高到 0.75（WP-73b，带 `live` 或 `both` 的代码块写成 `{monaco-run}` 之后） | `packages/render-slides/src/deck/style.css` | `e2e/publish.spec.ts`“every slide reaches WCAG AA” | Slidev 提供运行器提示的样式变量后改用 |
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
| 幻灯片形态的控制台报 “Failed to patch FloatingVue: TypeError: Cannot read properties of undefined (reading 'Popper')”：构建产物（`presmium build` 生成的 `dist/slides`）与 Slidev 的开发服务器（`presmium dev --to slides`、`slidev export` 与 `presmium-export`）中都出现，每次打开页面一条 | Slidev 53 的 `setup/main.ts` 在每份文稿中安装 `@shikijs/vitepress-twoslash` 4.5 的 Twoslash 弹出层；它对 floating-vue 菜单组件的补丁按旧的组件结构查找 `components.Popper`，而 Slidev 依赖的 floating-vue 5.4 的菜单组件已没有这个结构（三者都是 npm 上的最新版本） | 只影响在 Twoslash 弹出层上拖动时不弹出，生成的文稿不含 Twoslash 代码；错误被它自己捕获并打印，不影响页面。不打补丁，等上游修复 | `e2e/smoke.spec.ts`“the slides open … with no error in the console”：控制台没有其他错误 |
| 代码块属性中的对象不能嵌套：```` ```ts {monaco} { editorOptions: { wordWrap:'on'} } ```` 这类写法（`vendor/docs/slidev/custom/config-monaco.md` 的例子）在 `slidev build` 中报 “Error parsing JavaScript expression” | Slidev 53 从代码围栏的信息串中读属性时只读到第一个 `}`（WP-73b 的先行验证） | 幻灯片渲染端不在信息串中写嵌套的对象：`{monaco-run}` 的 `runnerOptions` 引用生成文稿头部中的值（`$slidev.configs.presmiumRuns[…]`，4.6 节） | `e2e/exec-env.spec.ts`“in the slides, Python code with :run: live runs in the Monaco Runner” |
| 幻灯片中导入 jax-js 的现场代码（`{monaco-run}`）使 `slidev build` 报 “Package "@jax-js/jax" not found in …/.presmium/slides” | Slidev 为 Monaco 代码块中导入的包从生成的文稿目录查找类型（`monacoTypesSource: local`，`vendor/docs/slidev/custom/config-monaco.md`）；pnpm 布局中 jax-js 只在 WebGPU 插件的依赖里（WP-75 的先行验证） | 现场的 JavaScript、TypeScript 代码导入了从生成文稿的目录找不到的包时，渲染端在生成文稿的头部写 `monacoTypesSource: none`（WP-79e2；`renderers.slides.monacoTypesSource` 优先），编辑器中不显示这些包的类型；运行不受影响 | `e2e/exec-webgpu.spec.ts`（测试文稿不写这个选项，幻灯片照常构建） |
| 测试中的幻灯片控制台报 “Wake Lock permission request denied” | Slidev 的 `wakeLock` 选项（默认开启）在放映时请求屏幕常亮，Playwright 驱动的浏览器拒绝请求 | 被拒绝时只多这一条错误，页面照常；讲者的浏览器允许时屏幕在放映中保持常亮，所以不关闭该选项 | 同上 |

### 9.4 残余风险（D13、D16）

> 共享部署（SHARED 模式）在 WP-91 通过专门的安全评审之前是实验性的；本节列出的问题由 WP-91 处理。

两种信任模式（10.1 节）的措施之后仍然存在的风险。这里写明哪些秘密是拿得到的，第 11 节的措施不声称挡住它们。

LOCAL 模式（`presmium dev`、`build`、`check` 与只监听本机、没有登录的 `presmium serve`）：唯一的用户就是运营者，下列代码都以这个用户的 uid 运行，能读写这个用户能读写的一切，清理环境变量只挡住无意的泄露：

| 代码 | 拿得到什么 | 已有的纵深防御 |
|---|---|---|
| 编译时执行的代码（没有进程沙箱时） | `presmium` 进程与 agent 进程的 `/proc/<pid>/environ`：`DEEPSEEK_API_KEY` 或 `PRESMIUM_MODEL_KEY`、`PRESMIUM_SPEECH_<ID>_KEY`、`PRESMIUM_ENV_<名>_TOKEN`、设置了的 `PRESMIUM_PROXY_SECRET`；`~/.ssh`、`~/.config` 等用户文件；Docker 的套接字（用户在 `docker` 组中时等于 root）与 D-Bus 会话总线；任意网络；运营者目录（可以伪造同意记录）；任何文档目录 | `RunContext.env` 只有清理过的变量；主机满足条件时（Linux，10.6 节）默认经进程沙箱运行：看不到沙箱外的进程与 Unix 套接字，网络全部拒绝，只能写运行目录。进程沙箱中 `/tmp` 仍可读（deltabox 固定允许），文稿目录与解释器的安装目录只读 |
| agent（DeepSeek Harness）与它的 shell 命令 | 同上：DeepSeek Harness 的沙箱只管文件的写入（`workspace-write`），不隐藏进程与网络；agent 自己的环境中有模型的密钥 | 写到工作目录之外、shell 与网络的权限请求经所有者（本机用户）确认；修改经审阅后才提交，可以全部或逐个文件拒绝 |
| agent 写进被 `.gitignore` 忽略的路径 | git 实现的审阅不含被忽略的文件：agent 写进文稿目录的 `node_modules/` 或 `.presmium/` 中工作目录的文件不出现在差异中，拒绝时也不恢复；`presmium dev` 加载文稿目录 `node_modules` 中的插件，这样写入的包在下一次启动时在 `presmium` 进程中运行 | 无（LOCAL 中 agent 本来就有 shell，能直接做同样的事） |
| 文稿声明的本地容器（`kind: devcontainer`） | 容器定义来自文稿，可以挂载主机的任意路径或以特权运行，等于用户的 Docker 权限 | 命令行只得到 `RunContext.env` 与 Docker 客户端的变量；不经进程沙箱（要用 Docker 的套接字） |
| 文稿目录中的 Node 插件与渲染端包（`presmium dev`、`build`、`check` 接受相对路径与文稿目录的 `node_modules`） | 在 `presmium` 进程中运行，拿得到进程的全部环境 | 无；`presmium serve` 不加载它们（D14） |
| 文稿的组件与原始 HTML（浏览器中） | 以开发服务器的源运行，能以本机作者（所有者）的身份调用 `/__presmium/` 路由，包括回答确认、接受审阅（同源，`Origin` 检查不挡） | 浏览器的沙箱；`/mcp` 另要求令牌。LOCAL 中没有所有者控制台（10.4 节） |

此外，任务进行中作者对同一文档目录的改动：git 实现以整个文档目录与快照比较，作者的改动出现在审阅的差异中，与 agent 的改动一起被接受或拒绝；deltabox（cbcow-through）只记录经视图的写入，作者直接写文档目录的改动不在差异中，全部拒绝（`abort`）之后仍然保留，但拒绝某个文件时从任务开始时的快照恢复，会覆盖作者对这个文件的改动；作者与 agent 改同一个文件时结果没有保证（deltabox 不支持这种竞争）。macOS 上的审阅与进程沙箱还没有实测，先行验证通过之前不启用（10.7 节）。

SHARED 模式（compose 布局）：第三方凭据只在 gateway 中。serve 与 gateway 中不运行由文稿决定的代码：编译时执行、构建与工作区站点的开发服务器（Vite 在 Node 中加载的模块，如 VitePress 的数据加载器）都在 sandbox 中（10.2 节）；serve 只把文档当作数据读取；它自己的令牌取自只有 root 可读的文件、降权后不在它的环境中（10.1 节），serve 的 uid 能读的文件里也没有秘密（10.5 节），所以文档目录中的符号链接即使让 serve 读到别处的文件，也读不到秘密；编译器另外只读真实路径在工作区之内的文件（10.2 节）。仍然存在的风险：

| 风险 | 说明与限度 |
|---|---|
| sandbox 容器中的同 uid 进程互相可见 | 被执行的代码（`run_code`、编译时的代码）以 sandbox 的 uid 运行，能读同一容器中每个 DeepSeek Harness 进程的环境，也就是全部进行中的会话（包括其他成员与所有者的会话）的模型令牌：拿到它就能以那个会话的名义经 gateway 的模型代理调用模型，直到会话结束、令牌作废。内核允许读同 uid 进程的内存时（主机的 Yama `ptrace_scope` 为 0；Ubuntu 默认为 1，只允许读自己的后代，被执行的代码不是 DeepSeek Harness 的后代），还能读到这些会话的 MCP 令牌，包括所有者的：以它可以读全部文档，并以所有者的名义发出 `content` 范围的确认请求（所有者仍要回答；`workspace` 范围的确认只在控制台上回答）。agent-host 自己的令牌读不到：它以 root 启动、读取只有 root 可读的令牌文件后降权，降权后的进程不可转储（内核的 `fs.suid_dumpable` 不为 1 时）。启用 deltabox 的覆盖配置时编译时的代码与 `run_code` 在进程沙箱中运行，看不到这些进程 |
| sandbox 能写全部文档目录 | 没有 deltabox 的覆盖配置时，编译时的代码与 `run_code` 能改动任何文档的目录。目标文档没有进行中的修改任务时，改动作为未提交的改动留在工作树里，下一个任务开始时进入它的快照；有进行中的任务时，git 实现以整个文档目录与快照比较，别的成员的代码写入的文件会出现在这个任务的审阅中，发起人接受时以发起人的名义提交：逐个文件查看差异是唯一的关口。agent 的文件工具以任务的文档目录为根目录，写到外面要所有者确认 |
| agent 写进被 `.gitignore` 忽略的路径 | git 实现的审阅不含被忽略的文件（如文稿目录的 `node_modules/`）。serve、gateway 与 agent-host 都不从文稿目录加载插件（D14），这些文件不在服务端运行；工作区站点的开发服务器会把组件引用的包打包进页面，组件本身的改动仍在审阅中 |
| 文稿的组件与原始 HTML 在阅读者的浏览器中以工作区站点的源运行 | 编辑者（或 agent）写的组件在其他成员打开该文档时，能以那位成员的身份调用站点上的路由：提交修改任务、接受或拒绝审阅、回答 `content` 范围的确认、撤销修改，提交的署名因此可能被冒用。所有者独有的操作不在这个源上：`workspace` 范围的确认与所有者路由（如登记同意记录）只在所有者控制台的源上（10.4 节），那里不显示文稿的任何内容，站点上的组件读不到它的响应，也发不出它接受的请求 |
| 审阅之前的改动对读者可见 | git 实现与 Linux 上的 deltabox（cbcow-through）下，agent 的改动在接受之前已在文档目录中，编辑者的页面随之更新（P-113），读者的站点也会显示；被拒绝时撤回 |
| deltabox 覆盖配置削弱 sandbox 容器 | cbcow 模式（审阅与进程沙箱都用它）需要 `/dev/fuse`、`SYS_ADMIN` 与 `apparmor:unconfined`；在会话中执行命令（进程沙箱）另需 `SYS_PTRACE`（Docker 的 seccomp 只在有它时允许 `pidfd_getfd`）。默认的 compose 布局不加这些权限，只有运营者启用覆盖配置时才加 |
| gateway 持有全部第三方凭据 | gateway 只加载运营者的插件，不运行文稿的代码；工作区的数据卷以只读挂载，它只读取工作区配置与根目录的插件，不读文档；它被攻破就失去全部凭据 |
| deltabox 0.1.x 的成熟度 | 上游问题见 9.5 节；我们不在会话的项目目录中设置拒绝规则（避开引擎故障），逐个文件的拒绝用任务开始时的快照恢复，不依赖 deltabox 撤回单个文件 |

### 9.5 依赖的上游问题（D16）

deltabox 的先行验证（`design-v0.7.md` 第 11 节）发现的五个上游问题。它们都还没有提交，验收者先征得用户同意再提交：

| 问题 | 上游 | 影响与处理 |
|---|---|---|
| 被沙箱的 `rm -rf` 删除一个以绝对路径拒绝的目录时，会话进入“引擎须重新打开”的故障；之前有待提交的删除时 `run --abort` 失败、会话仍挂载，被删的文件留在主机上（未入库的文件因此丢失），只有杀掉 helper 进程再 `abort` 才恢复 | deltabox-lite | 数据丢失。`addon-deltabox` 不在会话的项目中设置拒绝规则；启动时为残留的会话杀掉 helper 并 `abort` |
| 拒绝列表的缺口：与拒绝模式匹配的新文件、被拒绝目录中的新文件（`commit` 照样接受）、删除被拒绝的文件都被允许；相对的 `.git`、`.git/**` 规则被完全忽略；绝对路径的拒绝仍允许 `rm` 一个文件 | deltabox-lite | 不依赖拒绝列表：审阅会话的项目就是文档目录，进程沙箱的项目是临时的运行目录，其余路径本来就不可写 |
| `filesystem.write` 在项目内部不收窄：项目中的任何路径（含 `.git/config`、`.git/hooks/`）都可写 | deltabox-lite | 同上，以项目目录本身划定可写范围 |
| copy-private 模式中被执行的代码的父进程是带着调用者全部环境的 `deltabox` 命令行，`/proc/<ppid>/environ` 中有调用者的秘密 | deltabox-lite | 不用 copy-private（审阅与进程沙箱都用 cbcow 模式）；`addon-deltabox` 另在一个只带 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR` 的辅助进程中使用 deltabox 的 Node 绑定，deltabox 的进程都是它的后代，从它继承的环境中没有秘密（10.6 节） |
| `dsh-acp` 只把带 `callId` 的 `approval/request` 转为 ACP 的 `session/request_permission`，并且不带原因；dsh-deltabox 的任务审阅没有 `callId`，在 ACP 下落到失败关闭，agent 空闲时修改被静默回滚 | DeepSeek Harness（`dsh-acp`） | 不采用 dsh-deltabox（方案 A），由 Presmium 自己持有 deltabox 会话（方案 C）；上游修复后再评估 |


## 10. 服务端与部署

### 10.1 信任模式、进程与拓扑

**信任模式**（D13，`TrustMode`）明确写出谁受信任：

| 模式 | 命令 | 受信任的 | 隔离 |
|---|---|---|---|
| LOCAL | `presmium dev`、`build`、`check`；只监听本机、没有配置登录的 `presmium serve` | 唯一的用户就是运营者：被执行的代码与 agent 以这个用户的身份受信任 | 只做纵深防御：子进程的环境清理（`RunContext.env`）；编译时的代码在主机满足条件时默认经 deltabox 的进程沙箱运行（网络全部拒绝，deltabox 的进程从环境只有 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR` 的辅助进程启动，10.6 节）；agent 用 `workspace-write` 加询问；修改先审阅再提交。同一 uid 的代码能读这个用户能读的一切（9.4 节） |
| SHARED | 配置了登录（`PRESMIUM_PROXY_SECRET` 或 `--trust-proxy-from`）的 `presmium serve` | 运营者与所有者；编辑者与 agent 写的代码不受信任 | 只支持随仓库的 compose 布局：`serve`、`gateway`、`sandbox` 三个容器，uid 各不相同（10.5 节）。由文稿决定的代码（编译时与 `run_code` 执行的代码、构建中的服务端渲染、工作区站点的开发服务器在 Node 中加载的模块（如 VitePress 的数据加载器）、agent 与它调用的工具）只在 `sandbox` 中运行，从不在 `serve` 或 `gateway` 中运行，serve 只把文档当作数据读取（10.2 节）；第三方凭据只在 `gateway` 中；所有者独有的操作只在不显示文稿内容的所有者控制台的源上（10.4 节） |

SHARED 模式的 `presmium serve` 在下列情况拒绝启动：没有 `PRESMIUM_GATEWAY_URL` 与 gateway 的服务令牌，或没有 `PRESMIUM_AGENT_HOST_URL` 与 agent-host 的令牌；没有所有者控制台的主机名 `PRESMIUM_CONSOLE_HOST`（10.4 节）；工作区根目录本身是一份文档（单份文稿的仓库，SHARED 模式不支持，10.5 节）；环境中有名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量（Presmium 自己的三个令牌除外），或有 `PRESMIUM_SPEECH_VOLCENGINE_APPID` 这类第三方凭据的变量。serve 自己的三个秘密（gateway 的服务令牌、agent-host 的令牌、登录代理的共享密钥）同 agent-host 一样取自只有 root 可读的文件（`PRESMIUM_GATEWAY_TOKEN_FILE`、`PRESMIUM_AGENT_HOST_TOKEN_FILE`、`PRESMIUM_PROXY_SECRET_FILE`）：compose 中 serve 以 root 启动，读取它们后降为 uid `serve`（`--user`），它的环境（`/proc/<pid>/environ`）中因此没有它们，降权后的进程也不可转储；不以 root 启动时（测试）取自同名的环境变量 `PRESMIUM_GATEWAY_TOKEN`、`PRESMIUM_AGENT_HOST_TOKEN`、`PRESMIUM_PROXY_SECRET`。

| 进程 | 作用 | 何时需要 |
|---|---|---|
| `presmium dev` 或 `presmium serve` | 编译（SHARED 中只做不执行代码的部分）、实时推送、服务端（插件的服务端贡献、MCP、agent 适配、修改提交、控制通道；SHARED 中另有所有者控制台）；LOCAL 模式中也执行编译时的代码、运行 agent 与工作区站点的开发服务器 | 编辑、agent、远端环境的代理模式、语音 |
| agent（默认随包的 DeepSeek Harness，子进程，ACP over stdio） | agent | 使用助手时；SHARED 模式中由 agent-host 启动 |
| `presmium gateway`（SHARED） | 持有全部第三方凭据（模型、语音、远端环境）与运营者数据（同意记录、服务提供方的名字）；挂载插件的 `gateway()` 贡献；签发与校验限定令牌；把 `/mcp` 转发到 serve（10.9 节） | SHARED 模式 |
| `presmium agent-host`（SHARED） | 助手的 ACP 客户端与 DeepSeek Harness 子进程、全部编译时执行与构建、工作区站点的开发服务器、deltabox 的审阅会话；没有秘密，网络只到 gateway（10.8 节） | SHARED 模式 |
| 课堂服务 `presmium-classroom-server` | 课堂同步（P-61），不变 | 开课时 |
| Jupyter Server（容器或集群） | 远端执行 | 使用远端环境时 |

```
presmium dev（一份文稿，本机，LOCAL）
  浏览器 ──► 网页开发服务器（VitePress 子进程）──┐
         ──► 幻灯片开发服务器（Slidev）─────────┤ Vite 的 server.proxy：/__presmium/（含 WebSocket）
                                               ▼
                       Presmium 服务端（presmium dev 的主进程，127.0.0.1:<空闲端口>）
                       ├ /__presmium/<插件 ID>/…          插件的路由与反向代理
                       ├ /__presmium/presmium.server/…    握手（hello）、控制通道（control）
                       └ /mcp                             MCP（令牌）

presmium serve（工作区；LOCAL 时只监听本机，一个进程）
  浏览器 ──► Presmium 服务端（唯一对外的端口）
             ├ /__presmium/…、/mcp      同上，按成员与角色
             └ 其余路径 ──► 工作区站点的网页开发服务器（VitePress 子进程，只监听本机，含 HMR 的 WebSocket）：
                            编辑者与所有者 → 完整的站点；读者 → 学生视图的站点（第一位读者访问时启动）

presmium serve（SHARED，compose 布局）
  浏览器 ──► oauth2-proxy ──► serve 容器（presmium serve：没有第三方凭据，不运行文稿的代码）
             （站点与控制台      ├ 站点的主机名：/__presmium/…、/mcp；其余路径 ──► sandbox 中的工作区站点
              两个主机名）      ├ 控制台的主机名：所有者控制台（workspace 范围的确认、所有者路由），不显示文稿内容
                                ├──► gateway 容器（presmium gateway）──► 模型服务、语音服务、远端 Jupyter（第三方凭据）
                                │      serve 用服务令牌：签发限定令牌、语音、远端环境的代理
                                └──► sandbox 容器（presmium agent-host、它启动的 DeepSeek Harness 与工作区站点的开发服务器）
                                       agent 会话、执行、构建、站点、审阅，都由 serve 发起（HTTP/SSE，令牌）
                                       sandbox 只能连到 gateway：模型与远端环境（限定令牌）、/mcp（gateway 转发到 serve）
```

服务端在主进程中，而不是作为 Vite 中间件挂在开发服务器里：网页的开发服务器是 VitePress 命令行起的子进程（`packages/web/src/node/vitepress.ts`），编译结果、执行器、MCP 与 agent 适配都在主进程中。渲染端只需在开发服务器的 Vite 配置中加一条代理（`RenderContext.server`）：网页渲染端写进生成的 VitePress 配置，幻灯片渲染端写进生成的 Slidev 项目的 `vite.config.ts`（Slidev 文档化的配置文件）。浏览器因此总是同源访问 `/__presmium/`，没有跨域请求，登录代理的 Cookie 也照常带上。

静态构建产物不依赖服务端：渲染端不写服务端地址，`useServer().available` 为 false。浏览器内执行（Pyodide、WASI、WebGPU）、预先合成的讲授音频与录制输出照常可用；agent、远端环境的代理模式与实时转写隐藏或降级。

### 10.2 挂载

- **路径**：插件 `server(ctx)` 的贡献挂在 `/__presmium/<插件 ID>/` 下；服务端自己的路由在 `/__presmium/presmium.server/`：`hello`（成员、文档、可用的功能，读者可用）与 `control`（控制通道，10.4 节）；MCP 在 `/mcp`。
- **请求**：路由处理函数用标准 Fetch API 写，不绑定服务器框架；Node 的请求与 Fetch 之间由 `@hono/node-server` 的 `getRequestListener` 转换。流式结果用 SSE（`eventStream`，4.7 节）。
- **文档**：`useServer().fetch` 带上请求头 `Presmium-Document: <文档目录>`，服务端据此给出 `RequestContext.document`，并把请求交给该文档的插件实例。
- **反向代理**：`ProxySpec` 由 `http-proxy-3` 实现，HTTP 与 WebSocket 升级都加上 `headers`（例如远端环境的 `Authorization`），浏览器拿不到这些头。
- **宿主进程的接口**：启动服务端的命令给它一个 `ServerHost`（`@presmium/server` 自己的类型，不是内核契约）：文档列表、编译结果与诊断、运行检查、构建、运行一个代码块（MCP 的 `run_code`）；构建与运行代码块使用与该宿主的编译相同的执行选项（4.6 节，10.6 节）。编译结果按视图给出：`full`（完整的文稿）或 `student`（按受众 `student` 编译，P-55）；读者成员与 `tutor` 令牌只得到 `student` 视图（10.3 节）。`presmium dev` 由 CLI 在它的编译器上实现，`presmium serve` 由工作区实现；控制通道经它读取文稿。
- **转发**：`presmium serve` 中其余路径的转发目标由工作区按成员给出（`startServer` 的转发选项是成员到地址的函数）：编辑者与所有者转发到完整的工作区站点，读者转发到学生视图的站点，HMR 的 WebSocket 同样按成员转发。LOCAL 模式中站点是 serve 的子进程；SHARED 模式中站点在 agent-host 中（10.8 节），目标是它在内部网络 `agents` 上的地址。所有者控制台的主机名上不转发（10.4 节）。
- **MCP 的挂载**：`@presmium/mcp` 声明自己需要的宿主接口 `McpHost`（文档列表、编译结果与诊断、检查、构建、运行代码块、放映位置及其变化、课堂状态、跳转与开关课堂、确认），导出 `createPresmiumMcp(host)`。服务端引用 `@presmium/mcp`，在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost` 并把它挂在 `/mcp`；`presmium-mcp` 在编译器上实现它（没有放映位置与课堂）。`mcp` 不引用 `server`（第 3 节），依赖只有 `server → mcp` 一个方向。
- **MCP 的实现（WP-78）**：
  - `@presmium/mcp` 导出 `createPresmiumMcp(host)`（`fetch(request, caller)`、`close()`）、`serveMcpStdio(host, caller)`，以及类型 `McpHost`：`documents()`、`compile(document, view)`、`check`、`build(document, { to, view })`、`run(document, { section, block }, signal)`、`approve(request, signal)`、`offers(kind)`（种类的策略为 `off` 时不列出对应的工具），可选的 `runCode(document)`（`run_code` 的确认范围，或 `off`：`settings.presmium.exec.compile` 是整个工作区的设置，任一文档为 `off` 时都不列出 `run_code`），`tools(document?)`（插件的 `AgentTool` 与它们的服务），`positions(document?, member)`（`McpPosition` 带窗口所属成员的 `member`）、`watchPositions(listener)`、`classroom(document)`、`navigate(document, { slide, step }, member)`、`session(document, action, name)`。`caller` 是令牌所绑定的成员与模式（`McpCaller`），由宿主校验令牌后给出。
  - 基于 MCP TypeScript SDK v2（`@modelcontextprotocol/server` 2.3.1，协议版本 2026-07-28）的 `createMcpHandler`：工厂按调用方为每个请求新建一个服务器实例（调用方经 `authInfo` 传入），没有会话。2025 年协议的客户端以同一个工厂无状态地服务，工具与资源照常可用，但没有接收通知的通道。`presmium://position` 的订阅是 2026-07-28 的 `subscriptions/listen`（SDK 的客户端以 `versionNegotiation: { mode: 'auto' }` 连接，再 `client.listen({ resourceSubscriptions })`），窗口报告新的位置时服务端 `notify.resourceUpdated`，订阅者收到 `notifications/resources/updated`。服务端自己校验 `Host`、`Origin` 与令牌，挂载时不需要 `@modelcontextprotocol/node`（第 12 节）。
  - 工具：读取类 `list_documents`、`deck_info`、`list_sections`、`get_section`、`get_step`、`search`、`get_code_ref`、`get_outputs`、`get_diagnostics`、`locate_source`、`get_position`、`get_classroom`（后两个只在有页面窗口的宿主中）；操作类 `navigate`、`run_code`、`build`、`classroom_start`、`classroom_end` 只给 `author` 令牌且成员是编辑者或所有者，调用时先经 `approve` 确认（`content` 范围，`member` 为令牌的成员，`from` 为 `presmium.mcp`，说明按文稿语言，如“放映跳转到「第三节」”“运行「合并」一节的 code-1”，`run_code` 的 `detail` 是代码），被拒绝时返回错误结果。`tutor` 令牌与读者成员只有读取类工具，读 `student` 视图（`get_diagnostics` 这时只给编译的诊断，不运行检查）。插件的 `AgentTool` 以自己的名字登记（与内置工具同名的忽略），输入的 JSON Schema 增加可选的 `document`；`operate`、`spend` 类先确认。有多份文档时以 `document` 指定，只有一份时可以省略。路径相对于文稿目录（agent 修改源码的目录）。不提供写文件的工具。
  - 资源：`presmium://documents`、`presmium://deck`、`presmium://sections`、`presmium://sections/{section}`、`presmium://sections/{section}/steps/{step}`、`presmium://sections/{section}/outputs`、`presmium://diagnostics`、`presmium://ir`（调用方视图中的 IR）、`presmium://position`（可订阅）、`presmium://classroom`。有多份文档时，一份文档的资源在 URI 后加 `?document=<文档目录>`（资源模板 `presmium://deck{?document}`、`presmium://sections/{section}{?document}` 等），不加时与工具一样只在只有一份文档时可读；`presmium://documents` 与 `presmium://position`（任一文档的位置，订阅只用这个 URI）没有这种形式。服务说明（instructions）列出该令牌实际得到的读取类与操作类工具（含插件的）和资源：只读的令牌写明只读，有操作类工具时写明它们可能先要等人允许，种类的策略都为 `off`（或 `presmium-mcp` 没有 `--allow`）时写明不提供操作。
  - `search` 使用与网页搜索相同的索引：每节一个文档（标题、所在章的标题、各块的文字，`@presmium/viewer/domain` 的 `chapters` 与 `blockText`），MiniSearch，同样的分词与 VitePress 的搜索选项。分词函数是 `@presmium/web/domain` 中 `tokenize` 的副本：`mcp` 依赖 `web` 会使 pnpm 的符号链接成环（`web` 的开发依赖有 `cli`，`cli → server → mcp`），所以 `mcp` 只依赖 `@presmium/viewer`（`./domain`）与 `minisearch`；把 `tokenize` 与 `searchDocuments` 移到 `@presmium/viewer/domain` 共用由验收者决定。
  - 服务端：没有给出 `ServerOptions.mcp` 时，`startServer` 在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost`（`packages/server/src/mcp.ts`）并挂在 `/mcp`。控制通道的 `positions`、`go`、`session`、`status` 可以按文档筛选；`watch` 在窗口报告新的位置时通知；`ask` 在种类的策略为 `allow` 时仍然询问，供 SHARED 模式中 `compile: approve` 的 `run_code`（10.6 节，`runCode` 按 `settings.presmium.exec.compile` 给出 `workspace`、`content` 或 `off`）。`get_position` 先取该成员放映与演讲者窗口的位置，再取其他窗口的；`navigate` 只向该成员的窗口发 `go`，该成员没有窗口显示文稿时（其他成员的窗口不算）不发出确认就返回错误。一份文档第一次被请求时还没有编译结果（`presmium dev` 刚启动）的，下一次请求再加载。
  - `presmium-mcp [文稿] [--allow <种类>]`（`@presmium/mcp` 的可执行文件）：在编译器上实现 `McpHost`，源文件（含 `{include}` 与编译的依赖）改动后在下一次调用时重新编译，编译器的 `bundled` 是 `@presmium/mcp` 的包目录（它随 CLI 安装；`presmium check` 用 CLI 的包目录），随 CLI 安装的渲染端与 `addon-deltabox` 从那里向上解析，检查同 `presmium check`；没有页面窗口，不列出 `get_position`、`get_classroom`、`navigate` 与课堂工具；也没有页面可以询问，所以只提供并直接允许 `--allow` 列出的种类（`operate` 给出 `run_code` 与 `build`）。标准输出只用于 MCP，插件的日志改到标准错误。编辑器的 MCP 配置写命令 `node <仓库>/packages/mcp/bin/presmium-mcp.mjs <文稿目录>`。
  - 已知缺口：网页形态的放映视图与演讲者视图以 `position: fixed` 的覆盖层盖住了 VitePress 导航栏，工具栏中的确认入口在这两个视图中点不到；放映时由作者在文档视图的另一个窗口中回答（`e2e/mcp.spec.ts`）。在放映视图的控制条中加入确认入口属于 `viewer` 与 `host`，交给验收者。
- **运营者设置**：`startServer` 接受 `settings`（插件 ID 到设置），交给各插件的 `ServerContext.settings` 与 `NodeServiceContext.settings`。`presmium dev`、`build`、`check` 读取工作区根目录 `presmium.workspace.yaml` 的 `settings`（没有该文件时为空），`presmium serve` 由工作区读取同一个键；都只在进程启动时读取一次，运行中改动配置文件不生效，直到运营者重启（`ir.md` 第 10 节）。
- **生命周期**：`presmium dev` 启动时为文稿创建一次各插件的贡献，头部的 `plugins` 变化时照旧提示重启；`presmium serve` 在一份文档第一次被请求时创建它的贡献。Node 端服务（`services`）与贡献使用同一份文稿配置与运营者设置；服务端另外登记 `APPROVALS` 与 `MCP_ENDPOINT`，工作区登记 `REVISIONS`（SHARED 模式中另登记 agent-host 的客户端，4.5 节）。
- **插件的来源**（D14，4.2 节）：`presmium serve` 只加载安装在工作区根目录、列在 `settings.presmium.workspace.plugins` 中的 Node 插件（另加随 CLI 安装的渲染端与 `addon-deltabox`）；文稿的 `plugins` 与替换渲染端的 `renderers.<id>.package` 中的相对路径、文稿目录 `node_modules` 中的包与没有列出的包都不加载，编译给出错误级诊断 `presmium.plugins`。列表中声明了 `operator: true` 的插件每份文档都加载。`presmium dev`、`build`、`check` 照旧按文稿的 `plugins` 与 `renderers.<id>.package` 加载，另加运营者插件（列表中的，与随 CLI 安装的 `addon-deltabox`）。
- **编译器的宿主选项（WP-73a）**：`new Compiler(deck, options)` 的 `CompilerOptions`：`settings`（默认读取工作区根目录 `presmium.workspace.yaml` 的 `settings`，每个进程每个文件一次；文件读不出时是错误级诊断 `presmium.workspace`）、`trust`、`services`（宿主的 Node 端服务，先于插件的登记）、`reserved`（宿主保留的令牌）、`policy`（插件策略）、`scope`（读取范围，`ReadScope`：入口、`{include}`、`ctx.src`、执行缓存与 `localAsset` 的真实路径在工作区根目录之内且不在 `.git/` 中，否则错误级诊断 `presmium.files`）、`bundled`（随 CLI 安装的 Presmium 自己的包从哪里解析：CLI 的包目录）、`operatorDir`、`gateway`、`secret`。运营者插件排在文稿的插件之前（同一令牌以运营者的实现为准；没有加入 IR 的 `config.plugins`，所以 IR 不变，渲染端也不加载它们的浏览器部分），文稿也列出的同一个包只加载一次。各插件的 `services(ctx)` 在插件加载时调用一次，用当时文稿的配置；`presmium dev` 中改动头部的 `presmium.<插件 ID>` 要重启才进入服务（同 `plugins`）。LOCAL 的运营者目录由编译器按 10.5 节的规则得出（`operatorDir(root, given)`，`@presmium/compiler` 导出），`presmium dev`、`build`、`check` 读 `PRESMIUM_OPERATOR_DIR`；目录不创建，在工作区之中时是错误级诊断。
- **SHARED 模式中 serve 不运行文稿的代码，只把文档当作数据读取**：编译时执行交给 agent-host（编译器的 `remote` 选项）；构建（含网页渲染端的服务端渲染，它会运行文稿的组件）与 MCP 的 `build` 交给 agent-host；工作区站点的开发服务器（两个视图）同样在 agent-host 中运行（网页渲染端的 `devSite`，10.8 节）。Vite 与 VitePress 在开发服务器的 Node 进程中会加载文稿决定的模块：文稿组件引用的 VitePress 数据加载器（`*.data.*`，开发中同样运行它的 `load()`）、配置文件、样式预处理器的插件；它们因此只在 sandbox 中运行，生成的站点项目与 Vite 的缓存也在 sandbox 容器自己的目录中，serve 不读它们。serve 只做编译中不执行代码的部分（解析 MyST、运行运营者插件的编译步骤），把编译结果经 agent-host 的接口交给站点；浏览器的其余请求（含 HMR 的 WebSocket）由 serve 转发到那里。serve 中的编译器读取文档目录中的文件（源码、被引用的文件、执行缓存）时先解析真实路径，真实路径不在工作区根目录之内或在 `.git/` 之中的（例如指向 `/proc/self/environ` 的符号链接）不读取，给出错误级诊断 `presmium.files`；这是纵深防御，serve 的环境与它的 uid 能读的文件中本来就没有秘密（10.1、10.5 节）。git 命令关闭钩子与 fsmonitor（4.8 节）。
- **端口**：`presmium dev` 的服务端默认取空闲端口（`--server-port` 指定），启动时在渲染端的地址之后打印 `server  <地址>` 与 `mcp  <地址>/mcp`；`presmium serve` 用 `--port`（默认 4310）与 `--host`（默认 `127.0.0.1`）。
- **实现（WP-73a）**：`startServer(options)`（`@presmium/server`）的选项：`mode`（`dev` 或 `serve`）、`host`、`port`、`document(dir)`（文档目录到 `ServedDocument`：编译器加载的插件及其配置、Node 端服务、运营者设置与运营者目录，`servedDocument(compilation)` 由编译结果得出；第一次请求该文档时创建贡献）、`serverHost`（`ServerHost`：`documents()`、`compile(document, view)`、`check(document)`、`build(document, { to, view })`、`run(document, { section, block }, signal)`；`presmium dev` 的实现在 `packages/cli/src/host.ts`，以开发循环最近一次的编译为准）、`settings`、`approvals`（种类到 `off`、`ask`、`allow`）、`trustProxyFrom`、`roles(identity)`、`forward(member)`、`operatorDir`、`user`、`stateFile`、`mcp`（WP-78 挂载 MCP 服务；没有时带有效令牌的请求得到 501）、`env`。返回值的 `services`（`APPROVALS`、`MCP_ENDPOINT`）由宿主交给编译器（`CompilerOptions.services`），`control` 给出窗口的位置、`go`、`session` 与状态摘要（供 WP-78 的 MCP）。请求经 Node 的请求先判断（身份、代理、转发），其余交给 `@hono/node-server` 转换为 Fetch API；路由处理函数出错时返回 500 与原因。
- **实现（WP-79）**：`presmium serve` 在 `@presmium/workspace` 中（`serveWorkspace`）。每份文档一个按需创建的编译会话（`src/node/session.ts`：第一次被请求时编译，此后监听它读过的文件，编译依次进行），编译器选项为插件策略（两种模式）、SHARED 的读取范围与 `remote`、`execution.env: 'serve'`、宿主服务（服务端的 `APPROVALS`、`MCP_ENDPOINT`，工作区的 `REVISIONS`；SHARED 中保留 `AGENT_RUNTIME`、`CHANGE_REVIEW`，agent-host 有时登记它的客户端）；`renderers.<id>.package` 按同一策略检查，被拒绝时同样是 `presmium.plugins` 错误（编译器只在构建时加载渲染端，所以由工作区在每次编译后补上）。工作区的路由作为一个只有服务端贡献的插件 `presmium.workspace` 挂在每份文档（与首页，文档 `''`）上：`GET documents`（读者）、`POST documents`（编辑者：`{ op: create | rename | copy | delete, dir, to?, title?, template? }`）、`GET revisions`（文档页面默认只列出本文档的修改）、`POST revisions/revert`（冲突时 409 与文件）、`GET`/`POST execution`（编译确认的状态与“请求执行”）。工作区站点：网页渲染端的 `devSite` 是一个路由，按路径中最长的文档目录把请求（含 HMR 的 WebSocket）交给该文档自己的 VitePress 开发服务器（`base` 为 `/<目录>/`，第一次请求时以 `compile` 的 IR 启动），其余路径交给首页的开发服务器；`buildSite` 先构建首页再把每份文档构建到 `<out>/<目录>/`，所以每份文档各有自己的搜索索引（跨文稿搜索与前后导航在 WP-86）。文档的插件由 IR 的 `config.plugins` 给出：工作区把它换成编译器实际加载的包目录（绝对路径），站点只加载这些（D14）；站点自己的插件（`RenderContext.plugins`）是工作区的浏览器插件。站点的开发服务器不在工作区中生成项目（serve 与 agent-host 各自的缓存目录），设 `server.allowedHosts: true` 与 `server.fs.allow`，IR 端点在文档的 `base` 下（`<base>@presmium/ir`）。LOCAL 中 `forward` 给出本进程中站点路由的地址；SHARED 中 `forward(member)` 只知道成员，不知道路径，所以 serve 为每个视图起一个本机的小路由：先编译请求所在的文档并把 IR 送到 agent-host，再把请求与 WebSocket 转发到 agent-host 中该视图的站点。启动时 serve 自己也调用 `sharedSetup` 读取 agent-host 的令牌（`PresmiumServer` 只给出 gateway 的访问），读取之后把三个秘密从进程的环境中删去，子进程（git 等）不再继承。以 root 启动并给出 `--user` 时先 `initgroups`，降权后的进程保留该用户的附加组（文档目录的组）。SHARED 且 `compile: approve` 时交给服务端的 `approvals.operate` 若为 `allow` 则改为 `ask`（服务端的策略按种类，否则会放行编译确认）。

### 10.3 登录与权限

- **`presmium dev`**：只监听本机。服务端检查 `Host` 是 `localhost`、`127.0.0.1` 或 `[::1]`（任何端口），`Origin` 缺省或同样是本机的地址（任何端口，因为页面来自渲染端的开发服务器，经它的代理转发），挡住 DNS 重绑定与其他网站的请求（MCP SDK 的 `localhostAllowedHostnames`、`localhostAllowedOrigins` 做法相同）。成员是本机作者，角色为所有者。`/mcp` 另外要求 `Authorization: Bearer <令牌>`，接受两种令牌：每个进程随机生成的令牌，打印在终端并写入 `<文稿>/.presmium/server.json`（权限 0600，不入库），供作者在编辑器中使用的 agent（Claude Code、Codex 等）连接，模式为 `author`；以及服务端经 `MCP_ENDPOINT` 为助手的每个 agent 会话签发的令牌（见下）。
- **`presmium serve`**：默认只监听本机，本机使用不需要登录，这时是 LOCAL 模式，唯一的成员是本机作者（所有者）。监听其他地址时必须配置登录代理，否则拒绝启动：服务端只信任带共享密钥请求头 `X-Presmium-Proxy-Secret`（值来自环境变量 `PRESMIUM_PROXY_SECRET`，或 `PRESMIUM_PROXY_SECRET_FILE` 指向的文件，10.1 节）的请求，或来自 `--trust-proxy-from <地址>` 的请求。身份取自代理传来的请求头（oauth2-proxy 的 `X-Forwarded-User`、`X-Forwarded-Email`、`X-Forwarded-Preferred-Username`、`X-Forwarded-Groups`）。配置了登录就是 SHARED 模式（不论监听的地址），只支持 compose 布局（10.1 节）。
- **角色**：读者只能阅读与提问；编辑者可以进入编辑模式、修改与撤销、回答发给自己的 `content` 范围的确认；所有者另管工作区设置，并且是唯一能回答 `workspace` 范围确认的角色（SHARED 模式中只在所有者控制台上，10.4 节）。角色来自 `presmium.workspace.yaml` 的 `members`（按邮箱或代理传来的组），登录的其他成员是读者。
- **读者看到学生视图**（P-55）：读者是学习者，看到的文稿按受众 `student` 编译：页面、IR、搜索索引与读者的问答都没有只给教师的章节与块；读者的 MCP 令牌与所有 `tutor` 令牌经 `ServerHost` 的 `student` 视图读取文稿。编辑者与所有者看到全部内容。`presmium dev` 中只有本机作者（所有者），但问答的 `tutor` 令牌同样只读学生视图。
- **路由的角色**：挂载点按 `Route.role`、`ProxySpec.role`（默认 `editor`）检查；不满足时返回 403，插件不各自检查。
- **实现（WP-73a）**：`presmium dev` 的 `.presmium/server.json`（权限 0600）记 `{ url, mcp, token, pid }`。`serve` 模式中共享密钥的请求头是 `X-Presmium-Proxy-Secret`（常数时间比较），`--trust-proxy-from` 按连接的来源地址比较（去掉 IPv4 映射前缀）；身份按 `X-Forwarded-Email`、`X-Forwarded-User`、`X-Forwarded-Preferred-Username`、`X-Forwarded-Groups` 读出，`roles(identity)` 没有给出角色的成员是读者，没有身份的请求得到 401，不经登录代理的请求得到 403。SHARED 模式中站点上改变状态的请求（`GET`、`HEAD` 以外）带的 `Origin` 与请求的 `Host` 不是同一个主机名时得到 403。插件的反向代理与站点的转发都去掉 `X-Presmium-Proxy-Secret`；`ServerContext.secret` 从不返回服务端自己的三个秘密（及其 `_FILE` 变量）。
- **MCP 的身份**：助手的服务端路由经 `MCP_ENDPOINT.issue(member, mode)` 为每个 agent 会话取得令牌，令牌绑定成员与模式（`author` 或 `tutor`），放进 ACP `session/new` 的 `mcpServers`，会话关闭时作废。`presmium serve` 中 `/mcp` 只接受这种令牌（没有每进程的令牌），以令牌认证，不经登录代理。签发的地址：LOCAL 模式中是服务端的本机地址，agent 子进程直接访问；SHARED 模式中是 gateway 的 `/mcp`，gateway 原样转发到 serve，令牌由 serve 校验（sandbox 的网络只到 gateway，10.9 节）。`tutor` 令牌只看得到读取类工具。工具的范围由令牌决定，不由请求参数决定。

### 10.4 控制通道与确认

- **控制通道**：`useServer().available` 时，宿主在 `startHost` 中连接 `/__presmium/presmium.server/control`（SSE 接收，POST 报告）。页面报告：自己的位置（`navigation` 服务的位置与视图）、视图角色，以及 `STATUS` 中各插件的摘要（变化时，至多每秒一次）。服务端发来：`go`（经 `navigation.go` 跳转）、`session`（经 `session` 服务开始或结束课堂）、`approval`（确认请求）。MCP 的 `get_position` 返回该成员处于放映或演讲者视图的窗口最近报告的位置，没有时返回任一窗口的位置；`navigate` 向这些窗口发出 `go`，听众视图照旧经已有的通道跟随。
- **确认**：`APPROVALS` 按种类的策略处理：`off` 时这类操作不提供（MCP 不列出对应的工具），`ask`（默认）时经控制通道发出请求；任一有资格的窗口回答即生效，50 秒内（低于 DeepSeek Harness 调用 MCP 工具的 60 秒超时）没有回答视为拒绝。`allow` 只能由本机作者用 `presmium dev --allow <种类,…>` 或工作区所有者在 `presmium.workspace.yaml` 的 `approvals` 中设置，文稿不能设置。
- **按范围分发**（`ApprovalScope`，4.7 节）：`content` 范围的请求发给 `member` 的窗口（没有指定成员时发给全部编辑者与所有者）；`workspace` 范围的请求（工作区配置、成员、确认策略、运营者设置、同意记录、文档目录之外的路径、agent 的 shell 与网络权限请求、SHARED 模式中执行没有录制的代码与 `compile: approve` 时 MCP 的 `run_code`，10.6 节）只发给所有者的窗口（SHARED 模式中只发给所有者控制台的窗口，见下），发起它的编辑者看不到，也不能回答：服务端只接受所有者对它的回答，其他成员的回答得到 403。没有标明范围的请求按 `workspace` 处理。`presmium dev` 与 LOCAL 模式的 `presmium serve` 中唯一的成员是所有者，两种范围都发给本机作者。
- **确认界面**：宿主在 `PmToolbar` 中加入一个只在有待确认请求时出现的入口，两种形态都显示：说明、发起方、允许与拒绝。SHARED 模式中 `workspace` 范围的确认不在这里，而在所有者控制台上。
- **所有者控制台**（SHARED）：工作区站点上运行着文稿的组件与原始 HTML，也就是编辑者与 agent 写的代码；它们在所有者的浏览器中以站点的源、带着登录代理的 Cookie 运行，发出的同源请求与所有者自己的请求无法区分。所以所有者独有的操作放在另一个源上：serve 在主机名 `PRESMIUM_CONSOLE_HOST`（如 `console.course.example.edu`，必须与站点的主机名不同；登录代理把两个主机名都转发给 serve，Cookie 的域覆盖两者，登录一次即可）上提供所有者控制台。
  - 控制台只有 `@presmium/server` 自带的页面（静态的 HTML 与脚本，响应头 `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'` 与 `Cross-Origin-Opener-Policy: same-origin`，站点页面既不能嵌入它，也拿不到它打开的窗口），不显示文稿的任何内容：不渲染组件、原始 HTML 与富输出，确认的说明、待执行的代码与文件的差异都以纯文字显示。这个主机名上不转发到工作区站点，也没有 `/mcp` 与插件的其他路由。
  - 控制台上有：它自己的控制通道（只有所有者能连接）、`workspace` 范围的确认的列表与回答、插件的所有者路由（`Route.role` 为 `owner`，如语音插件登记同意记录的 `consent/<引擎>/<音色>`；页面列出这些路由，可以把一个文件作为请求体发给所选的路由）。
  - 控制台上会改变状态的请求必须带主机名为控制台主机名的 `Origin`（如 `https://console.course.example.edu`）与请求头 `Presmium-Console: 1`；后者不在 CORS 的安全列表中，站点页面跨源发出这样的请求时浏览器先发预检，serve 从不允许，不带它的表单提交则被拒绝。不满足的请求得到 403。
  - 站点的主机名上：所有者路由得到 404；`workspace` 范围的确认不发给任何站点窗口（所有者的站点窗口只收到待回答的数量与控制台的地址），对它们的回答得到 403。
  - LOCAL 模式中没有控制台：唯一的用户在站点上回答全部确认，站点上的组件能以他的身份回答（9.4 节）。
- **控制通道的消息（WP-73a）**：`GET /__presmium/presmium.server/control?window=<窗口 ID>&document=<文档>` 是 SSE，事件有 `ready`（`{ window }`）、`approval`（`{ id, request }`，打开时补发这个窗口可以回答的、仍在等待的确认）、`settled`（`{ id, allow }`）、`pending`（SHARED 中所有者的站点窗口：`{ count, console }`，`console` 是控制台的地址）、`go`（`{ slide, step, view }`）与 `session`（`{ action: 'start' | 'end', name }`）。`POST` 同一路径：`{ window, type: 'report', position, role, status }`（窗口未知或属于其他成员时 404）与 `{ window, type: 'answer', id, allow }`（200；没有这个确认 404；这位成员不能在这里回答 403）。`hello` 返回 `{ member, document, trust }`，SHARED 中所有者在站点上另有 `console`。页面读完每个 `POST` 的响应体（否则浏览器一直算它在进行中，`design-v0.7.md` 第 11 节）。控制台的页面在 `/`，脚本在 `/__presmium/presmium.server/console.js`，所有者路由的列表在 `/__presmium/presmium.server/routes`（只列出已经被请求过的文档），它的控制通道带 `console=1`；控制台的主机名上其余路径得到 404，响应都带控制台的安全头。一个确认 50 秒（`approvalTimeoutMs`）没有回答视为拒绝，服务端关闭时全部视为拒绝。
- **发送即确认**：编辑模式中发送一批批注或一条对话消息，就是对这次任务在文档目录中的写入的确认（N-08），助手不再逐个文件询问；这些写入在提交之前还要经发起人的审阅（10.7 节）。写入超出当前文档目录或改动工作区配置时仍以 `write` 确认，它属于 `workspace` 范围，只有所有者能允许；单份文稿的仓库（只在 LOCAL 模式中）里工作区配置在文档目录之中，审阅中出现它的改动时接受前另需所有者的 `write` 确认（第 11 节）。agent 对运营者目录（同意记录等，10.5 节）的权限请求一律拒绝，不发给任何人。运营者目录在任何工作区与文档目录之外（LOCAL 模式中在用户的状态目录中，SHARED 模式中只在 gateway 容器中），agent 的文件工具以文档目录为根，写不到它而不发出请求；LOCAL 模式中同一 uid 的代码绕过工具直接写它是 9.4 节的残余风险，SHARED 模式中 sandbox 访问不到它。

### 10.5 部署（N-09）

- **本机（LOCAL）**：`presmium serve [目录]` 一条命令启动工作区服务；目录中没有 `presmium.workspace.yaml` 而有 `lecture.md` 时，作为只有一份文档的工作区（单份文稿的仓库只在 LOCAL 模式中支持）。工作区必须在 git 仓库中，否则编辑功能不可用并提示 `git init`。
- **运营者目录**：存放运营者的数据（默认的同意记录目录 `consent/`），在任何工作区与文档目录之外，不属于任何文档，`REVISIONS` 从不提交它。LOCAL 模式中是用户的状态目录 `${XDG_STATE_HOME:-~/.local/state}/presmium/operator/<工作区标识>/`（标识是工作区根目录真实路径的 sha256 的前 16 位十六进制数），`presmium dev`、`build`、`check`、`serve` 与 `presmium-speech consent` 按同一规则找到它，`--operator-dir` 或 `PRESMIUM_OPERATOR_DIR` 可以另行指定（同样不能在工作区之中）；插件经 `NodeServiceContext.operatorDir`、`ServerContext.operatorDir` 得到它，agent 对它的权限请求一律拒绝（10.4 节）。SHARED 模式中运营者目录是 gateway 容器的 `operator` 数据卷（`presmium gateway --operator-dir`），只挂在 gateway 中。
- **docker compose（SHARED 唯一支持的布局，D13）**：`templates/workspace/compose/compose.yaml`：

  | 服务 | 进程与 uid | 数据卷 | 网络 | 环境 |
  |---|---|---|---|---|
  | `oauth2-proxy` | 登录代理：站点与所有者控制台两个主机名都转发给 serve（保留 `Host`），Cookie 的域覆盖两者 | — | `public`（发布端口、连接身份提供方）、`edge` | 身份提供方的设置、共享密钥 |
  | `serve` | `presmium serve --host <edge 上的地址> --user serve`：以 root 启动，读取令牌文件后降为 uid `serve` | `workspace`（读写；仓库属于 `serve`） | `edge`（只在这里的地址上监听）、`agents`（不监听，只发起连接） | `PRESMIUM_GATEWAY_URL`、`PRESMIUM_AGENT_HOST_URL`、`PRESMIUM_CONSOLE_HOST`；令牌文件 `gateway_token`、`agent_host_token`、`proxy_secret`（只有 root 可读，10.1 节）；没有第三方凭据（有则拒绝启动） |
  | `gateway` | `presmium gateway --operator-dir /operator`，uid `gateway` | `operator`（读写）、`workspace`（只读，只读工作区配置与工作区根目录的插件） | `edge`、`agents`、`egress` | 全部第三方凭据（`.env`）、`PRESMIUM_GATEWAY_TOKEN` |
  | `sandbox` | `presmium agent-host --user sandbox`：以 root 启动、读取令牌文件后降为 uid `sandbox`；它启动的 DeepSeek Harness、工作区站点的开发服务器与被执行的代码都是这个 uid | `workspace`（读写，但文件权限只允许写文档目录） | `agents` | `PRESMIUM_GATEWAY_URL`；令牌文件 `agent_host_token`（只有 root 可读）；没有任何凭据 |
  | `classroom` | `presmium-classroom-server` | — | `edge` | — |

  - **数据卷的权限**：工作区仓库属于 `serve` 的 uid，`.git/` 只有它可读写（git 的配置中不放凭据，工作区服务不推送），工作区根目录的文件（`presmium.workspace.yaml`、`package.json`、`node_modules/`）`sandbox` 只能读；文档目录属于 `serve` 的 uid 与共享组 `presmium-docs`（setgid，组可写），`sandbox` 的 uid 在这个组中，所以它只能写文档目录。文档目录必须是工作区根目录的子目录：单份文稿的仓库中文档目录就是工作区根目录，sandbox 能写它就能改工作区配置与 `node_modules/`，所以 SHARED 模式不支持这种布局（serve 拒绝启动，10.1 节）。serve 新建文档时按此设置；sandbox 中的进程以 `umask 002` 运行，它们新建的文件 serve 也能改。
  - **网络**：`edge` 与 `agents` 是内部网络（`internal: true`，不能连外网）；能连外网的只有 `public`（其中只有 oauth2-proxy，它在这里发布唯一的端口并连接身份提供方）与 `egress`（其中只有 gateway）。serve 与课堂服务因此连不到外网。`sandbox` 只在 `agents` 上，那里监听的只有 gateway 与 sandbox 自己（serve 只在 `edge` 上的地址监听，在 `agents` 上只发起到 agent-host 与 sandbox 中站点的连接），所以 sandbox 能连到的只有 gateway；gateway 把 `/mcp` 经 `edge` 转发到 serve。
  - **镜像**：三个服务用同一个镜像（Ubuntu 24.04 或 Debian trixie 为基础，满足 deltabox-lite 对 glibc 2.39 的要求），其中装有 Presmium（含随 CLI 安装的 `addon-deltabox`）、DeepSeek Harness 与运营者的插件；文档目录中的 `node_modules` 不被加载（D14）。
  - **deltabox 的覆盖配置** `compose.deltabox.yaml`（可选）：给 `sandbox` 加 `devices: [/dev/fuse]`、`cap_add: [SYS_ADMIN, SYS_PTRACE]` 与 `security_opt: [apparmor:unconfined]`，agent-host 中默认加载的 `addon-deltabox` 因此能登记审阅与进程沙箱；这些权限削弱外层的容器（9.4 节），所以默认不加。
  - 课堂服务与 `templates/env/compose/` 共用覆盖配置的 Jupyter 环境照旧；远端 Jupyter 的令牌只在 gateway 中。
  - **实现（WP-79）**：`templates/workspace/compose/`（`compose.yaml`、`compose.deltabox.yaml`、`Dockerfile`、`init.sh`、`env.example`、`oauth2-proxy.env.example`、`README.md`）。镜像基于 `node:22-trixie-slim`（固定摘要），另装 Python 与 git，用户 `serve` 1001、`gateway` 1002、`sandbox` 1003、`classroom` 1004，`serve` 与 `sandbox` 在组 `presmium-docs`（1100）中；构建上下文是已 `pnpm install` 的检出，运营者的插件就是镜像中装好的包，`init.sh` 把工作区根目录的 `node_modules` 链接到它们。一次性的 `init` 服务以 root 准备数据卷：从 `./seed` 复制工作区（数据卷为空时）、必要时 `git init`，并设置上面的权限；工作区根目录本身有 `lecture.md` 时失败。serve、gateway 与 sandbox 都以 root 启动、读取 compose 的文件型 `secrets`（主机上 0600 的文件，容器中只有 root 可读）后降为各自的用户（gateway 也有 `--user`）。oauth2-proxy 由它在 `edge` 上的固定地址被信任（`--trust-proxy-from`；它只能经 alpha 配置加固定的请求头，所以模板不用共享密钥），serve 只监听它在 `edge` 上的固定地址（`PRESMIUM_EDGE`，默认 `172.31.79`），gateway 与 agent-host 以 `--hostname gateway`、`sandbox` 接受经服务名的请求。serve 新建、复制、重命名的文档目录交给 `PRESMIUM_DOCUMENTS_GROUP`（`presmium-docs`），setgid 并组可写。`packages/workspace/test/deploy.test.ts` 启动这个模板检查上述布局。
- **Kubernetes**：`templates/workspace/kubernetes/README.md` 与 `templates/env/kubernetes/README.md` 只给文档与清单片段（工作区：按 compose 布局的三个容器、不同的 uid、只允许 sandbox 连 gateway 的 NetworkPolicy、带 oauth2-proxy 的入口（站点与控制台两个主机名）与仓库的 PVC；远端环境：Zero to JupyterHub 的 `values.yaml` 片段，按 CPU、GPU、MIG 划分的配置，gVisor 的 `runtimeClassName`，回收设置，以及 agent-sandbox 的模板），不维护 Helm chart。工作区的 Kubernetes 文档是按同一布局的参考，不经测试，SHARED 模式支持的只有 compose 布局。集群、GPU Operator、gVisor 或 Kata 的安装、入口与证书、身份提供方由用户负责。
- 静态构建产物仍可发布到任意静态托管。

### 10.6 编译时执行的信任模型

编译时执行的代码由文稿的编辑者或受提示注入的 agent 写出。两种信任模式（10.1 节）的处理不同，实现见 4.6 节的 `RunContext`、`PROCESS_SANDBOX` 与编译器的执行选项：

- **环境变量**（两种模式）：每个 Node 端执行器（执行插件的子进程、本地环境插件的容器、WASI 与 Jupyter 的编译时客户端、WebGPU 录制所启动的 Chromium）只给代码清理过的环境 `RunContext.env`。`presmium build`、`check`、`dev`：进程的环境去掉全部 `PRESMIUM_` 开头的变量与名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量；`presmium serve`（两种模式，SHARED 中在 agent-host 里计算）：只有 `PATH`、`LANG` 与 `LC_*`、`TZ`、`TMPDIR` 与 `HOME`（每个工作区一个临时目录）。两者都加上运营者设置 `settings.presmium.exec.passEnv` 列出的变量。这只挡住代码经自己的环境拿到凭据；同一 uid 的进程信息见下两条。
- **容器命令行的环境**：`docker` 与 devcontainer 命令行是执行器调用的工具，它们读的容器定义（`${localEnv:…}`）却来自文稿，所以同样以 `RunContext.env` 为基础，只另加 Docker 客户端需要的变量：进程中的 `DOCKER_HOST`、`DOCKER_CONTEXT`、`DOCKER_CONFIG`、`DOCKER_CERT_PATH`、`DOCKER_TLS_VERIFY`、`XDG_RUNTIME_DIR`，以及进程真实的 `HOME`（Docker 从 `~/.docker/` 读取上下文与镜像仓库的登录）。这些都不是凭据，运营者不必经 `passEnv` 传入。容器里的代码经命令行只得到 `RunContext.env` 中的变量（逐个传入，不传主机上的路径 `PATH`、`HOME`）。容器定义本身可以挂载主机路径，这是 LOCAL 模式的残余风险（9.4 节）；SHARED 模式的 sandbox 中没有 Docker 的套接字，`kind: devcontainer` 的环境不可用。
- **LOCAL 模式**：全部执行，不经确认（被执行的代码以运营者的身份受信任）。纵深防御是进程沙箱，主机满足条件时默认启用（D13 的“可用时”）：`addon-deltabox` 随 CLI 安装（`@presmium/cli` 只在 `package.json` 中依赖它，源码不引用它，编译器按包名经插件加载器加载，第 3 节的规则不变），在所有命令中作为运营者插件加载，不必列在工作区配置中，主机满足条件时登记 `PROCESS_SANDBOX`，编译器把它放进 `RunContext.sandbox`，执行插件的子进程在 deltabox 中运行。条件：Linux（x64、arm64），glibc 2.39 以上，能以 `--require-fs-mode` 启动 cbcow-through（FUSE 与 Landlock），且 `degraded_protections` 为空；macOS 在先行验证通过之前不登记（10.7 节）。运营者可以用 `settings.presmium.deltabox.sandbox: false` 关闭它，用 `settings.presmium.deltabox.read` 另列只读的路径（例如 `~/.local` 中的 Python 包）。做法：
  - **启动方式**：插件不在 `presmium` 进程中加载 deltabox 的 Node 绑定，而是启动一个辅助进程（`node <插件>/src/node/helper.ts`），它的环境只有 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR`，由它调用绑定的 `loadNative()`；审阅与进程沙箱的请求经它的标准输入输出（JSON 行）转发。deltabox 的文件系统 helper、命令 helper 与被执行的命令都是这个辅助进程的后代，沿父进程链读到的环境中没有秘密（先行验证中 copy-private 的命令能读到带着调用者全部环境的父进程，这里既不用 copy-private，父进程也不是带秘密的进程）。
  - **隔离方式**：每次编译一个预热的会话，模式 cbcow-through（`--require-fs-mode`），隔离为 sandlock；项目是一个临时的运行目录（`mkdtemp`），网络 `deny_all`（含本机回环）。每次运行前把输入写进运行目录，命令结束后从运行目录读回 `collect` 的文件（through 模式中写入立即可见），再 `abort` 回到空目录。文稿目录、解释器的安装目录（按 `RunContext.env.PATH` 解析到的解释器的前缀，例如 nvm 或 conda 的目录）与 `settings.presmium.deltabox.read` 列为只读；会话的项目中不设拒绝规则（9.5 节）。
  - 主机不满足条件或运营者关闭时照旧启动子进程；构建报告写明隔离方式或没有进程沙箱的原因。LOCAL 模式中拿得到什么见 9.4 节。
- **SHARED 模式**：serve 不运行任何执行器。编译器的 `remote` 选项把每次运行交给 agent-host（10.8 节），代码在 sandbox 容器中运行：那里没有第三方凭据，网络只到 gateway；需要远端环境时 agent-host 用 serve 为这次运行签发的限定令牌经 gateway 连接（`RunContext.gateway`）。agent-host 同样默认加载 `addon-deltabox`，启用 deltabox 的覆盖配置时（10.5 节）主机条件满足，代码同样经进程沙箱运行。执行缓存（`.presmium/freeze/`）中已有录制的代码照常使用录制；没有录制的代码按运营者设置 `settings.presmium.exec.compile` 处理：
  - `approve`（默认）：一次编译中待执行的代码合为一个 `operate` 确认（`workspace` 范围，只在所有者控制台上，列出章节、块与代码）；确认之前与被拒绝时按没有执行处理，显示 `:recorded:` 的录制输出或降级内容，并给出信息级诊断；所有者允许后工作区重新编译，这些代码交给 agent-host 执行。这个确认只由 `compile` 决定，`approvals.operate` 的 `allow` 不放行它。
  - `trusted`：不确认，交给 agent-host 执行（运营者信任全部编辑者）。
  - `off`：不执行，也不记录，只显示录制输出或降级内容。
- **编译确认的生命周期**（SHARED）：编译不等待确认，照常以录制输出或降级内容完成。一份文档同一时间至多一个待回答的编译确认，它照常有 50 秒的超时（10.4 节）。确认列出的代码（按缓存键）在等待中、被拒绝或超时之后，不再自动请求：再次编译、其他成员打开文档、读者的访问都不重复发出（读者的学生视图从不发出编译确认）。代码改动后（缓存键变化），下一次编译为改动后的代码发出新的确认；编辑者或所有者也可以在文档页面上那条信息级诊断的“请求执行”中再次发出（工作区的路由）。这些记录只在内存中，服务重启后清空。
- **构建**（SHARED）：构建会运行文稿的代码（编译时执行，以及网页渲染端在服务端渲染文稿的组件），所以 `ServerHost.build`（MCP 的 `build`）与工作区的构建都交给 agent-host，产物写在共享数据卷上的文档目录中；构建中没有录制的代码同样经上面的编译确认。
- **MCP 的 `run_code` 与 `build`**：这两个工具也执行文稿中的代码（`run_code` 经 `ServerHost` 以编译器的执行器重新运行一个代码块，不读也不写录制；`build` 构建文档），使用与同一宿主的编译相同的执行选项。SHARED 模式中它们在 agent-host 中执行，确认的范围随 `compile`：
  - `approve`：`run_code` 的确认是 `workspace` 范围的 `operate`，只在所有者控制台上，令牌所绑定的编辑者看不到也不能回答，所有者的允许同时放行这次执行（不再另经编译确认）；它同样只由 `compile` 决定，`approvals.operate` 的 `allow` 不放行它。`build` 的确认仍是 `content` 范围：构建中没有录制的代码照常经上面的编译确认，没有允许时按没有执行处理。
  - `trusted`：两者都是 `content` 范围，发给令牌所绑定的成员。
  - `off`：MCP 不列出 `run_code`；`build` 不执行没有录制的代码。

  LOCAL 模式（`presmium dev`、LOCAL 的 `presmium serve` 与 `presmium-mcp`）中两者都是 `content` 范围，全部执行（有进程沙箱时经它）。
- **agent 的代码执行**（D15）：SHARED 模式中作者的 agent 没有 shell 与命令执行的工具，代码只经 MCP 的 `run_code` 在 agent-host 中执行，按上面的规则确认；LOCAL 模式中 agent 保留 shell（`workspace-write` 加询问，4.8 节）。

### 10.7 修改审阅（D12）

agent 的修改在提交之前由发起人审阅。契约是 4.8 节的 `CHANGE_REVIEW`，有两个实现：

| 实现 | 在哪里 | 做法 |
|---|---|---|
| deltabox（`addon-deltabox`，Linux；macOS 待先行验证） | LOCAL：`presmium` 进程经插件的辅助进程（10.6 节）；SHARED：启用覆盖配置时在 agent-host 中，serve 经工作区的客户端调用 | Presmium 持有文档目录上的一个 deltabox 会话（方案 C），经 `deltabox-lite` 的 Node 绑定开始审阅、记检查点、取差异、`commit` 与 `abort`。会话以 `require_fs_mode` 启动：Linux 用 cbcow-through（`root` 是文档目录的 FUSE 视图，改动立即可见，`presmium serve` 的监听照常看到，页面随修改更新，P-113）；copy-private 不跟踪视图之外的写入者，不使用。macOS 上 cbcow-through 假定 deltabox 是唯一的写入者，计划用 cbcow-private（修改在接受之后才进入文档目录），但先行验证只在 Linux 上做过：在 macOS 主机上确认不在沙箱中的写入者（DeepSeek Harness）对私有 `LIVE` 树的写入被记录之前，插件在 macOS 上不登记 `CHANGE_REVIEW` 与 `PROCESS_SANDBOX`，助手用 git 实现（WP-90 的先行验证）。DeepSeek Harness 不在 deltabox 中运行，只以视图为 `cwd`，它的写入照样进入会话的记录。会话的状态目录（`DELTABOX_STATE_DIR`）在工作区之外、同一文件系统上；同一文档目录同一时间只有一个会话 |
| git（助手内置） | serve 进程（两种模式） | 没有 `CHANGE_REVIEW` 服务时使用。开始时以临时索引把文档目录写成一个树对象（任务开始时的快照，含未提交与未跟踪的文件，不碰 `HEAD` 与真实的索引）；检查点同样写树并与上一个比较；差异是文档目录与快照的比较；拒绝时把这些路径恢复为快照中的内容，快照中没有的文件删除。`root` 就是文档目录，`visibility` 为 `immediate`。被 `.gitignore` 忽略的文件（产物、工作目录、文稿目录的 `node_modules/`）不在审阅中（9.4 节） |

流程（助手，WP-81）：

1. 修改任务开始时 `open`（同一文档一次一个任务），agent 会话的 `cwd` 是审阅的 `root`。deltabox 实现在打开会话之前把文档目录复制到状态目录（同一文件系统上用 reflink），作为任务开始时的快照。
2. 每个工具调用完成（ACP 的 `tool_call_update` 为 `completed`）时 `step`，页面收到 `step` 事件。检查点在收到通知时记下，紧接着开始的下一个工具调用的早期写入可能算进这一步；每步的差异只供查看，决定以文件为单位。至多 100 个检查点（deltabox 的上限），之后的改动并入最后一步。
3. agent 结束时：`settings.presmium.assistant.review` 为 `required`（默认）时发出 `review` 事件，助手面板逐个文件显示差异（文字的统一差异，二进制文件只标出），可以全部接受、全部拒绝或拒绝某些文件；为 `auto` 时直接全部接受。
4. 接受：`accept(reject)`。deltabox 不能撤回单个文件，所以先 `commit` 全部改动，再把被拒绝的文件从任务开始时的快照恢复（快照中没有的删除）。然后 `REVISIONS.commit({ files, message, origin })` 把留下的文件提交为一个修改（尾注照旧，git 的钩子关闭），最后 `done{revision}`。
5. 全部拒绝：`rollback()` 恢复任务开始时的状态，`done{}`。
6. 接受之后的撤销仍是 `git revert`（P-115）。待审阅的任务只在内存中：进程退出时关闭审阅（等于全部拒绝）；deltabox 实现启动时清理崩溃留下的会话（杀掉 helper 并 `abort`）。

写到 `root` 之外的路径不在审阅中：它们本来就要经 `workspace` 范围的确认（10.4 节）。任务进行中作者对同一文档目录的改动：git 实现把它们算进审阅，deltabox 不记录它们，但拒绝同一个文件时快照会覆盖它们（9.4 节）。

### 10.8 agent-host（SHARED，D13）

`presmium agent-host`（`@presmium/workspace`）在 sandbox 容器中运行，宿主 serve 交给它的全部会运行文稿代码的工作：编译时执行、构建、工作区站点的开发服务器、agent 会话与 deltabox 的审阅。它没有秘密：compose 中它以 root 启动，读取只有 root 可读的令牌文件（`PRESMIUM_AGENT_HOST_TOKEN_FILE`）后降为 sandbox 的 uid（`--user`），降权后的进程不可转储（内核的 `fs.suid_dumpable` 不为 1 时），同一 uid 的子进程读不到它的环境与内存；不以 root 启动时（测试）令牌取自 `PRESMIUM_AGENT_HOST_TOKEN`。它加载与 serve 相同的运营者插件（`settings.presmium.workspace.plugins` 中的，与随 CLI 安装的 `addon-deltabox`），为每份文档建立 Node 端服务注册表，`NodeServiceContext.trust` 为 `shared`。

serve 经认证的 HTTP/SSE 接口调用它（`Authorization: Bearer <PRESMIUM_AGENT_HOST_TOKEN>`；请求都由 serve 发起，sandbox 从不连接 serve）。工作区在 serve 中把它包装为同一套契约：`AGENT_RUNTIME`、`CHANGE_REVIEW`（agent-host 中有 deltabox 时）、编译器的 `remote` 选项与工作区站点的转发目标；LOCAL 模式中同样的契约在 serve 进程中直接运行（站点是 serve 的子进程）：

| 接口 | 作用 |
|---|---|
| `GET /v1/info` | agent-host 中可用的审阅实现与进程沙箱、agent 运行时的名字与版本 |
| `POST /v1/documents/<文档>/run`、`…/end-session` | 运行一次（执行器 ID、`RunRequest`、`RunContext.env`、可选的 `gateway`），返回 `RunResult`；结束一个执行会话 |
| `POST /v1/documents/<文档>/build` | 构建（渲染端、站点路径、受众、可选的 `gateway`），返回构建报告；产物写在共享数据卷上 |
| `POST /v1/sites`、`PUT /v1/sites/<id>/documents/<文档>`、`DELETE /v1/sites/<id>` | 工作区站点的开发服务器：以 `SiteSpec`（不含 IR）与视图（`full` 或 `student`）启动网页渲染端的 `devSite`，返回它在 `agents` 网络上的地址，serve 把浏览器的其余请求（含 HMR 的 WebSocket）转发到那里；serve 每次编译或重新编译一份文档后送来它的 IR（`SiteDevServer.update`），页面请求尚未送来的文档时 `devSite` 的 `compile` 回调等到 serve 送来（serve 在转发某文档的第一个请求之前先编译它）。生成的站点项目与 Vite 的缓存在 sandbox 容器自己的目录中，不在工作区数据卷上 |
| `POST /v1/sessions` | 打开 agent 会话（文档、模式、成员、`cwd`、`McpAccess`、`model`），返回会话 ID |
| `POST /v1/sessions/<id>/prompt` | 提交任务，以 SSE 返回 `AgentEvent`；agent 的权限请求作为 `approval` 事件送回 serve |
| `POST /v1/sessions/<id>/approvals/<请求 ID>`、`…/cancel`、`DELETE /v1/sessions/<id>` | 回答权限请求（serve 先经 `APPROVALS` 按范围确认）、取消、关闭 |
| `POST /v1/reviews`、`…/<id>/step`、`GET …/<id>/diff`、`POST …/<id>/accept`、`…/rollback`、`DELETE …/<id>` | deltabox 的审阅（同 `ChangeReview`） |

serve 为每个 agent 会话向 gateway 签发一个只含 `presmium.assistant` 的限定令牌（`model`），为每次运行与构建签发只含所需插件的限定令牌（`gateway`），会话或运行结束时作废。agent-host 为每个 agent 会话启动一个 DeepSeek Harness 进程（模板 `presmium-shared`，环境中只有 `DEEPSEEK_BASE_URL`、会话令牌 `DEEPSEEK_API_KEY`、`DSH_TELEMETRY_MODE=DISABLED` 与清理过的基本变量）。

**实现（WP-79）**：`presmium agent-host [工作区] --host --port --hostname --user`（`startAgentHost`，`@presmium/workspace`）。每个请求要求 `Authorization: Bearer`，`Host` 是本机、`--host` 或 `--hostname` 给出的名字（compose 中为 `sandbox`），带 `Origin` 的请求得到 403。令牌读取之后从进程的环境中删去，以 root 启动时随后降为 `--user`（附加组随之，`umask 002`）。每份文档一个只编译、不自行执行的编译器（插件策略、读取范围），它的执行器、Node 端服务与 `RunContext` 供下列接口使用：`run` 以 agent-host 自己按 `serve` 规则算出的 `RunContext.env` 运行（serve 送来的 `env` 不用），加上 serve 为这次运行签发的 `gateway`；`build` 只在 serve 说 `run: all`（`compile: trusted`）时运行没有录制的代码，否则只用录制；`POST /v1/sites` 返回 `{ id, port }`（站点在 agent-host 的地址上），另有 `PUT /v1/sites/<id>`（`{ site }`，文档列表变化时 serve 送来，站点在下一个请求时读它）；`POST /v1/sessions/<id>/prompt` 以 SSE 送回 `AgentEvent`，agent 的权限请求作为 `approval` 事件送回，serve 经 `APPROVALS` 确认后 `POST …/approvals/<请求 ID>`；`GET /v1/info` 列出运营者插件登记的 `CHANGE_REVIEW`、`PROCESS_SANDBOX` 与 `AGENT_RUNTIME`。agent 会话与审阅的转发写好了接口，验收在 WP-80、WP-81、WP-90（那时才有这些服务）。

### 10.9 gateway（SHARED，D13）

`presmium gateway [工作区目录]`（`@presmium/server`）是 SHARED 模式中唯一持有第三方凭据的进程：模型（`DEEPSEEK_API_KEY` 或 `PRESMIUM_MODEL_URL`、`_KEY`、`_PROVIDER`）、语音（`PRESMIUM_SPEECH_<ID>_*`）、远端环境（`PRESMIUM_ENV_<名>_URL`、`_TOKEN`）。运营者数据（同意记录）在它的运营者目录（`--operator-dir`）中，服务提供方的名字来自它的环境。它不加载文稿，不运行文稿的代码：

- **挂载**：启动时读取工作区配置，加载 `settings.presmium.workspace.plugins` 中的包，把每个插件的 `gateway(ctx)` 贡献挂在 `/<插件 ID>/` 下（`GatewayContext` 带 `secret`、`settings` 与 `operatorDir`）。贡献由各插件实现：助手的模型代理 `presmium.assistant/model`（Messages 兼容，DeepSeek Harness 的 `DEEPSEEK_BASE_URL`；转发到运营者的模型地址并换上真正的密钥，`GET presmium.assistant/info` 给出服务提供方），语音插件的 `presmium.speech/v1/…`（同语音网关的协议，含同意记录的检查与所有者的登记），远端环境插件的 `presmium.execJupyter/env/<名>/`（HTTP 与 WebSocket，令牌只发往同一对中的地址）。
- **令牌**：每个请求要求 `Authorization: Bearer`。serve 用服务令牌 `PRESMIUM_GATEWAY_TOKEN`；serve 经 `POST /tokens`（只接受服务令牌）签发限定令牌（插件 ID、用途、成员、期限），`DELETE /tokens/<id>` 作废；限定令牌不能签发令牌，也不能调用 `service: true` 的路由。令牌只在 gateway 的内存中，重启后全部作废。
- **`/mcp` 的转发**：gateway 把 `/mcp` 原样转发到 serve（`--serve <地址>`），不加也不看凭据，MCP 令牌由 serve 校验；sandbox 因此只需连到 gateway。
- **实现（WP-73a）**：`GET /info`（任何有效令牌）返回 `{ plugins }`，serve 启动时以它与 agent-host 的 `GET /v1/info` 确认两者可达（只记日志，不阻止启动）。`POST /tokens` 的请求体是 `{ plugins, purpose, member?, ttlSeconds? }`（默认一小时），返回 201 与 `{ id, token, expires }`。gateway 的反向代理去掉调用方的 `Authorization`，只带插件给出的请求头。插件经 `@presmium/compiler` 的插件加载器按插件策略加载（`startGateway` 在 `@presmium/server` 中）。
- **本机检查**：默认只监听 `127.0.0.1`（`--host` 指定其他地址）；校验 `Host` 是本机或 `--host` 给出的名字（compose 中为 `gateway`）；只接受不带 `Origin` 的请求（serve、agent-host 与 agent 的请求都不带，serve 转发浏览器经代理的请求时去掉它），不发送 CORS 响应头。这些规则代替了原先单独运行的语音网关 `presmium-speech serve`（D9）。

## 11. 安全（N-08）

措施按信任模式（10.1 节）区分：LOCAL 模式中被执行的代码与 agent 以运营者的身份受信任，下表的措施是纵深防御；SHARED 模式中它们不受信任，隔离来自 compose 布局。措施之后仍然拿得到的东西写在 9.4 节。

| 风险 | 措施 |
|---|---|
| 本机端点被其他网站或进程调用 | 默认只监听本机；校验 `Host` 与 `Origin`；MCP 要求每个进程独有的令牌；`presmium gateway` 同样默认只监听本机、校验 `Host`、只接受不带 `Origin` 的请求，并要求令牌（10.9 节） |
| 部署时绕过登录 | 监听非本机地址时必须配置登录代理；只信任带共享密钥或来自固定地址的请求；配置了登录即为 SHARED 模式，只支持 compose 布局，serve 的端口不发布，只有 oauth2-proxy 发布端口 |
| agent 误改或越权 | 只写工作区中的源码：agent 的工作目录是任务的文档目录，写到外面要确认；修改先经发起人审阅（D12，`settings.presmium.assistant.review: required`）：逐个文件查看差异，全部接受、全部拒绝或拒绝某些文件，被拒绝的文件恢复为任务开始时的内容，接受后才提交为一个修改，可撤销；操作类与计费类工具、agent 自身的权限请求都要确认；确认的关口在我们的服务端。确认按范围分发（10.4 节）：工作区配置、成员、运营者设置、同意记录、文档目录之外的路径与 agent 的 shell、网络权限请求只由所有者确认，编辑者不能批准自己的 agent 的这类请求；SHARED 模式中这些确认只在不显示文稿内容的所有者控制台上回答，站点上运行的文稿组件不能以所有者的身份回答它们 |
| 文稿关闭安全设置 | 工作区的插件列表、确认策略、agent 的替换命令与模型的服务提供方、修改的审阅、编译时执行的策略（`settings.presmium.exec`）、录音的去处、是否允许克隆音色与同意记录的目录都不从文稿读取，只来自命令行、环境变量与工作区配置（插件经 `settings` 得到，4.7 节）；工作区配置只在进程启动时读取，改动要等运营者重启才生效。agent 写工作区配置要所有者的 `write` 确认（`workspace` 范围）：它在文档目录之外时由 agent 的权限请求发出；单份文稿的仓库（只在 LOCAL 模式中支持）中它在文档目录里，审阅中出现它的改动时，接受前另需所有者允许，没有允许时它作为被拒绝的文件恢复 |
| 文稿中的 Node 插件在服务端运行（D14） | `presmium serve` 只加载安装在工作区根目录、列在 `settings.presmium.workspace.plugins` 中的插件（另加随 CLI 安装的渲染端与 `addon-deltabox`）；文稿的 `plugins` 与 `renderers.<id>.package` 中相对路径的包与文稿目录 `node_modules` 中的包被拒绝（错误级诊断 `presmium.plugins`）；gateway 与 agent-host 同样只加载这个列表。SHARED 的 compose 布局中 sandbox 写不了工作区根目录（文档目录必须是它的子目录，10.5 节），所以也换不掉这些包 |
| 编辑者或 agent 写的代码在服务端运行 | 两种模式：代码只得到清理过的环境变量（`RunContext.env`，4.6 节），`presmium serve` 中只有允许列表。LOCAL：全部执行；可用时经 deltabox 的进程沙箱（网络拒绝、看不到其他进程与套接字、只写运行目录）。SHARED：serve 与 gateway 中从不运行文稿的代码；编译时执行、构建、工作区站点的开发服务器（Vite 在 Node 中加载的模块，如 VitePress 的数据加载器）与 MCP 的 `run_code` 都在 sandbox 容器的 agent-host 中进行，那里没有第三方凭据、网络只到 gateway；serve 的环境与它能读的文件中没有秘密，编译器另外不读指向工作区之外的符号链接（10.2 节）；没有录制的代码经所有者在控制台上的 `operate` 确认才执行（`settings.presmium.exec.compile`：`approve`、`trusted`、`off`），确认不重复发出，`approve` 时 `run_code` 只由所有者确认；作者的 agent 没有 shell（D15），代码只经 `run_code` 执行（10.6 节） |
| 同一 uid 的代码读其他进程的环境与内存 | LOCAL：不声称挡住（9.4 节），只有进程沙箱在可用时隐藏其他进程。SHARED：持有秘密的进程（serve、gateway）在不同的容器与 uid 中，sandbox 看不到它们，它们自己又不运行文稿的代码；serve 的令牌取自只有 root 可读的文件，降权后不在它的环境中；sandbox 中 agent-host 降权后不可转储。sandbox 中被执行的代码仍能读同一容器中每个 DeepSeek Harness 进程的环境（全部进行中会话的模型令牌），内核允许时还能读它们的内存（会话的 MCP 令牌，包括所有者的），这些令牌都有期限、会话结束即作废（9.4 节） |
| 文稿把服务端的凭据引向别的地址 | 文稿只写环境与引擎的名字，不能决定哪个凭据发往哪个地址：凭据与它的地址由运营者在持有凭据的进程（LOCAL 为 `presmium` 进程，SHARED 为 gateway）的环境变量中成对给出。远端环境：`PRESMIUM_ENV_<名>_TOKEN` 只发往 `PRESMIUM_ENV_<名>_URL`，文稿中的 `url` 与它不同源时不连接并给出错误诊断，不回退到通用的变量（如 `JUPYTER_TOKEN`）；没有给出地址时不发送令牌。语音：引擎 `<ID>` 的地址与凭据是 `PRESMIUM_SPEECH_<ID>_URL` 与 `PRESMIUM_SPEECH_<ID>_KEY`（火山引擎的地址固定在适配器中），文稿只用 `engine`、`voice` 选择引擎与音色；文稿中出现 `url`、`keyEnv` 这类字段时是错误，不被使用。模型：`DEEPSEEK_API_KEY` 只发往 DeepSeek 的官方地址，`PRESMIUM_MODEL_KEY` 只发往 `PRESMIUM_MODEL_URL` |
| 提示注入（学习者的问题、远端输出、网页内容） | 学习者的问题用 `tutor` 运行时：只读，没有 shell、网络、写文件与操作类工具；回答在课堂中公开前可以要求主讲确认。SHARED 模式中作者的 agent 也没有 shell、命令执行与联网工具（D15） |
| 凭据泄露 | 凭据不写入文稿、IR 与产物；代理代加凭据；`presmium check` 对文稿头部中像凭据的字段告警（字段名含 `token`、`secret`、`password`、`key` 且值不是环境变量名，或值形如常见的密钥前缀）；编译时执行的代码只得到清理过的环境（见上）；启动 agent 子进程时去掉全部 `PRESMIUM_` 开头的变量。LOCAL：凭据在 `presmium` 进程与 agent 的环境中（同一 uid 拿得到，9.4 节）。SHARED：第三方凭据只在 gateway 中，serve 发现自己的环境中有第三方凭据时拒绝启动，sandbox 中只有绑定会话或运行、有期限、用后作废的限定令牌（同一容器中的代码互相读得到，9.4 节），DeepSeek Harness 经 gateway 访问模型，从不拿到模型的密钥 |
| 数据外发 | DeepSeek Harness 的会话日志上传与遥测由配置模板关闭，并以 `DSH_TELEMETRY_MODE=DISABLED` 启动；语音与模型的服务提供方在界面上标明（问答与对话面板写明 `AGENT.provider()`，另写明运行时 `AGENT.runtime()`；转写与合成的入口写明 `SpeechEngineInfo.provider`），服务提供方的名字来自运营者的配置（模型访问、`settings.presmium.assistant.provider`、`PRESMIUM_SPEECH_<ID>_PROVIDER`；SHARED 模式中由 gateway 给出），在任何请求之前就已知，没有时助手或引擎不可用；运营者没有配置模型访问（或替换的运行时）时助手不可用、不启动任何进程，没有定义的引擎不发出请求；录音只在显式“转写”时发出 |
| 不可信的富输出 | 执行输出中的 HTML 用 DOMPurify 清洗后显示（去掉脚本与事件属性）；幻灯片中以没有脚本权限的沙箱 iframe 显示 |
| 文稿的组件在阅读者的浏览器中运行 | 组件与原始 HTML 是文稿的一部分，以工作区站点的源运行，能以打开它的成员的身份调用站点上的路由。SHARED 模式中所有者独有的操作（`workspace` 范围的确认、所有者路由，如登记同意记录）只在所有者控制台的源上：控制台不显示文稿的任何内容，只接受带它自己的 `Origin` 与 `Presmium-Console` 请求头的请求，站点上的所有者路由得到 404、对 `workspace` 范围确认的回答得到 403（10.4 节）。内容范围的操作（提交修改任务、接受审阅、`content` 范围的确认）仍可能被站点上的组件以打开它的成员的身份发出，列为残余风险（9.4 节） |
| 仓库中的脚本被 git 执行 | 工作区的 git 命令关闭钩子与 fsmonitor（`-c core.hooksPath=/dev/null -c core.fsmonitor=false`）；SHARED 的 compose 布局中 `.git/` 只有 serve 的 uid 能读写，sandbox 改不了 git 的配置 |
| GPU 被学习者代码拖垮 | 限制派发规模与重复次数；超时就销毁设备并结束 Worker；监听设备丢失，避免浏览器把站点列入 GPU 黑名单；可以只给录制输出 |
| 生成的产物被 agent 修改 | 幻灯片渲染端在生成的 Slidev 文稿头部写 `mcp: false`，关闭 Slidev 53 开发服务器自带的、会修改生成文稿的 `/__mcp` 端点（原则 6） |
| 音色滥用 | 克隆音色默认关闭：只在运营者设置 `settings.presmium.speech.cloned: true` 时可用，且每个克隆音色要有本人的同意记录 `<consentDir>/<引擎>/<音色>.json`（说话人、范围、日期、同意声明录音的 sha256），语音服务在合成前检查，缺一即拒绝。同意记录是运营者的数据，在运营者目录中，不在文稿里：只有所有者经语音插件的路由（`role: owner`，SHARED 模式中只在所有者控制台的源上）登记，或运营者用 `presmium-speech consent` 登记；文稿目录中的同意记录被忽略，文档的提交不包含它们。SHARED 模式中运营者目录只挂在 gateway 容器中，agent 与被执行的代码都访问不到，语音的关口也在 gateway 中；LOCAL 模式中它在工作区之外的用户状态目录中（10.5 节），agent 对它的权限请求一律拒绝，同一 uid 的代码绕过工具写它是残余风险（9.4 节）。合成的音频在播放界面与元数据中标明由 AI 生成（GB 45438-2025、《人工智能生成合成内容标识办法》）：元数据由语音服务在写入缓存时加入，不依赖引擎 |
| 只给教师的内容到达学习者 | `presmium build --audience student` 的产物扫描泄漏（P-55）；`presmium serve` 中读者看到学生视图，读者与 `tutor` 令牌经 MCP 也只读学生视图（10.3 节） |

## 12. 依赖选型（v0.8 新增）

依赖准则沿用 `requirements.md` 5.4 节：只用公开接口，不 fork，不引入 AGPL；版本精确固定，遵守 `pnpm-workspace.yaml` 的最短发布时间。版本是 2026-10 调研时的版本，实现时取当时满足准则的版本。

| 组件 | 版本 | 许可证 | 用途 | 包 |
|---|---|---|---|---|
| `@modelcontextprotocol/server`；测试用 `@modelcontextprotocol/client` | 2.3.1 | Apache-2.0（既有代码 MIT） | MCP 服务（`createMcpHandler`、`serveStdio`、`fromJsonSchema`）与测试中的客户端；服务端自己校验 Host 与 Origin，实现中没有用到原计划的 `@modelcontextprotocol/node`（WP-78） | mcp |
| `minisearch` | 7.2.0 | MIT | `search` 工具的索引（与网页渲染端相同的版本与参数，WP-78） | mcp |
| `@agentclientprotocol/sdk` | 1.8 | Apache-2.0 | ACP 客户端（助手）与测试 agent | addon-assistant |
| DeepSeek Harness（`@deepseek-ai/dsh`） | 精确固定的预览版（先行验证用过 0.2.0-rc.2，本地文档为 0.2.1-alpha.4；实现时取满足最短发布时间的一个版本） | MIT | 默认的 agent 运行时（D11）：助手插件的依赖，运营者配置了模型访问时以子进程启动（ACP over stdio），不作为库引用，用户不必另外安装。它要求 Node 22.19 以上，根目录的 `engines` 因此要提高（WP-80） | addon-assistant |
| deltabox-lite（`deltabox-lite` 与平台包 `deltabox-lite-<os>-<arch>`） | 0.1.1（精确固定） | Apache-2.0（内含 sandlock-core 0.9，Apache-2.0；fuser，MIT） | 修改审阅与进程沙箱（D12、D13），在插件的辅助进程中经 Node 绑定使用，命令行只用于诊断；有 Linux 与 macOS 的 x64、arm64 预编译，本期只在 Linux 上启用（macOS 待先行验证，10.7 节）。Linux 上要求 glibc 2.39 以上；cbcow 模式要 FUSE（`/dev/fuse`、`fusermount3`）与 Landlock，没有降级的保护（`degraded_protections` 为空）才登记服务 | addon-deltabox（随 CLI 安装） |
| Runno（`@runno/wasi`、`@runno/sandbox`） | 0.10.0、0.10.2（精确固定） | MIT（二进制：clang 8.0.1 与 wasm-ld 为 LLVM 8 的 University of Illinois/NCSA 许可，LLVM 9 起为 Apache-2.0 加 LLVM 例外；sysroot 中的 wasi-libc 为 Apache-2.0 加 LLVM 例外或 MIT；Ruby 3.2.0 为 Ruby 许可或 BSD-2-Clause，SQLite 为公有领域；发布时附 `<base>wasi/LICENSES`，WP-79e2） | `@runno/wasi` 是浏览器与 Node 共用的 WASI 系统；`@runno/sandbox` 只提供 C、C++、Ruby、SQLite 的二进制（`dist/langs`），它的 Node 接口不用（`design-v0.7.md` 第 11 节） | addon-exec-wasi |
| jax-js（`@jax-js/jax`） | 0.1.25（精确固定；没有依赖） | MIT | JS/TS 中的张量代码与自动微分，WebGPU 后端；ES 模块构建原样随产物发布，第一次导入时加载（WP-75；`@jax-js/optax` 没有用到） | addon-exec-webgpu |
| playwright-chromium | 与仓库一致（1.64.1） | Apache-2.0 | 构建时在 Chromium 中录制 WebGPU 输出（录制时才加载）；导出讲授视频 | addon-exec-webgpu、addon-lecture |
| `@jupyterlab/services` | 7.6（WP-76 取 7.6.4） | BSD-3-Clause | Jupyter 内核与终端协议的客户端，浏览器与 Node 共用 | addon-exec-jupyter |
| `@xterm/xterm`、`@xterm/addon-fit` | 5.x（WP-76 取当时的 6.0.0 与 0.11.0） | MIT | 浏览器终端（P-107） | addon-exec-jupyter |
| `ws` | 8.x | MIT | Node 端连接内核与终端的 WebSocket（能带请求头，令牌不进地址；`@jupyterlab/services` 本身也依赖它） | addon-exec-jupyter |
| Runno（`@runno/wasi` 等） | 当前版本 | MIT | 浏览器内的 WASI 运行时与 C、C++、Ruby、SQLite 的二进制；Node 端用同一份二进制（先行验证） | addon-exec-wasi |
| jax-js（`@jax-js/jax`、`@jax-js/optax`） | 0.1 | MIT | JS/TS 中的张量代码与自动微分，WebGPU 后端；按需加载 | addon-exec-webgpu |
| Mediabunny（`mediabunny`） | 1.61.3（WP-77 精确固定） | MPL-2.0（文件级） | 录音为 Ogg/Opus（WebCodecs），摄像头与屏幕录为 WebM；导出视频时合成音视频；`@mediabunny/server` 附带的 FFmpeg 的许可证先行验证 | addon-lecture |
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
| 工作区镜像的基础：Ubuntu 24.04 或 Debian trixie | 固定摘要 | 各发行版的许可 | serve、gateway、sandbox 三个容器共用的镜像；glibc 2.39 以上，deltabox-lite 的预编译二进制与 `deltabox.node` 才能运行（`node:22-bookworm` 不行） | templates/workspace |

语音服务没有采用 SDK：火山引擎没有 npm SDK，OpenAI 音频接口形态的服务用 `fetch` 即可；网关的适配器直接调用 HTTP 与 WebSocket 接口。

不采用：dsh-deltabox（MIT，但没有公开的源码仓库，只支持 dsh 的两个预览版，在 ACP 下修改会被静默回滚，9.5 节）、ffmpeg.wasm（核心为 GPL）、Remotion（超过 3 人的公司需要商业许可）、Motion Canvas（2024 年底起停止维护）、TensorFlow.js 的 WebGPU 后端与 webgpu-torch（停更）、Jupyter Kernel Gateway（停更，浏览器跨域有缺陷）、Daytona 等 AGPL 许可的沙箱平台、edge-tts（非官方接口）、在进程内 mock 语音或模型的测试库。
