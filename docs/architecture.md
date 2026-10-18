# Presmium 架构

本文档定义工程结构、分层规则、跨上下文契约、插件约定与测试策略。领域概念见 `domain-model.md`，源语法与 IR 见 `ir.md`，公开接口与版本规则见 `api.md`，工作台的设计见 `design-dsh.md`。

**定位**：Presmium 是组件库与工具链，不是托管产品。它像一个增强的 JupyterLab：作者在自己的机器（或自己的容器）中编写、预览、讲授与发布文稿，读者阅读构建出的静态站点；分享就是分享文件（源码仓库或构建产物），协作通过 git。

- 核心（编译器、IR、渲染端、IR 运行时、CLI、静态产物）与产物离开模型也能工作，不引用 DeepSeek Harness。不改动源码的功能（放映、演讲者视图、课堂、运行代码、读者用自己的模型问答、放映中的讲授录制）属于产物；改动源码的功能属于工作台。
- 工作台是作者在浏览器中编写文稿的界面，实验性，不在语义化版本的承诺之内：工作台的包（`@presmium/workbench`、`@presmium/dsh`、`@presmium/studio`）为 0.x，DeepSeek Harness 发布正式版、并且升级闸门（13.5 节）在连续两个版本上通过之后才纳入 1.x 的承诺（`api.md`）。
- 工作区服务与工作台只供一个用户在自己的机器上使用，这个用户就是运营者，被执行的代码与 agent 以他的身份运行；安全措施只做纵深防御，不承担多个用户之间的隔离（10.1 节、第 11 节）。多人使用时每人一个容器，由 hub（例如 JupyterHub）为每个用户启动他自己的工作台，资源限额、空闲回收与模型用量由 hub 与模型网关管理；Presmium 自己不做多用户部署。
- 读者得到静态站点（可以是只给学生的版本）；读者向 AI 提问用他自己填写的模型服务，在他的浏览器中完成，站点不需要服务端（4.8 节）。
- 不在范围：账号与登录、成员与角色、按文档分享与授权、计费与用量结算、多租户托管、内容目录与审核、LMS 对接。这些由在 Presmium 之上构建的产品负责。

**设计原则**：

1. **依赖优先**：能由现成组件满足的，直接依赖它，通过公开的扩展接口定制；没有合适的组件才自研。不 fork、不打补丁、不做二次开发（第 12 节的依赖准则）。
2. **微内核**：内核只补齐宿主框架缺少的元能力：服务注册、锚点、检查命令、故障隔离；内核的运行时不认识“代码”“学生”“课堂”这类业务概念。多个插件共用的业务服务契约（如 `executor` 的 `RunRequest`、`session` 的 `SessionService`）放在内核包中：提供方与使用方是不同的插件，插件之间不互相引用，契约只能放在双方都依赖的包中，内核自身不使用它们（4.5、9.2 节）。被多个插件或宿主共用、而内核运行时不使用的纯函数、纯数据与资源（原始 HTML 的地址改写、分词、git 的隔离配置、编译时与浏览器共用的 `runner.py`）同样放在内核包中：它们没有状态，不登记服务。
3. **一切业务功能都是插件**：身份与课堂会话、代码引用、代码执行、测验、导出都是插件；官方插件与第三方插件用同一套接口。
4. **插件之间经服务接口协作**：插件依赖的是服务接口（例如 `session`），不是另一个插件；同一接口可以有多个实现，可以替换。
5. **纯文本，可复现**：文稿、动画、交互、插件配置都以纯文本声明；依赖版本由锁文件固定，同一提交在任何时间检出，渲染结果一致。
6. **源码即产品，IR 为中心**：源码是唯一的事实来源。所有修改都落在源码上，由作者在编辑器中修改，或在工作区中经批注与对话由 agent 修改，并由 git 记录；浏览器不直接修改渲染结果。源码编译为 IR，所有媒介由渲染端从 IR 生成；网页是能力最完备的主媒介。
7. **边界是标准协议**：远端执行用 Jupyter 内核协议，agent 读写文稿用 MCP，旧工作台驱动 agent 用 ACP，富输出用 nbformat 的输出模型，字幕与章节用 WebVTT，修改历史用 git。Presmium 对每种边界只实现一个客户端，不按平台或厂商写插件；厂商专有的接口只出现在一个适配器中（第 3 节）。

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
- `presmium dev` 与 `presmium serve` 的进程中另有一个服务端 `@presmium/server`：挂载插件的服务端贡献（远端环境的代理、语音服务、助手、讲授的上传、课堂同步）、MCP 端点与控制通道，统一处理请求来源、凭据与确认（第 10 节）。静态构建产物不依赖它：需要服务端的功能在静态产物中隐藏或降级。
- 服务端只供运行它的那个用户使用（上文“定位”，10.1 节）：一切在一个进程中，凭据在这个进程的环境里，没有登录。`presmium serve --host` 可以让这个用户在局域网中的其他设备上使用；多人使用时每人一个容器。
- 核心与产物不依赖模型，也不引用 DeepSeek Harness（dsh）。面向作者的工作台是 dsh 的一个定制发行版 `presmium studio`，产物经预览协议嵌入其中（设计见 `design-dsh.md`，结构与契约见第 13 节）。`presmium serve` 的浏览器界面与 `presmium dev --edit` 的编辑模式是旧工作台，实验性（13.6 节）。

## 2. 仓库结构

```
presmium/
├── packages/
│   ├── kernel/              @presmium/kernel                    纯 TS 共享内核：契约、服务注册、锚点、检查
│   ├── host/                @presmium/host                      形态无关的宿主接口与组合式函数（Vue）
│   ├── compiler/            @presmium/compiler                  MyST 解析、编译步骤、执行缓存、IR
│   ├── cli/                 @presmium/cli                       presmium build | dev | ir | check | serve | studio；./testing 供各包的集成测试运行 CLI
│   ├── create-presmium/     create-presmium                     pnpm create presmium：新建讲义、工作区或插件项目（模板在打包时从仓库复制）
│   ├── render-slides/       @presmium/render-slides             幻灯片渲染端（生成 Slidev 项目）
│   ├── render-notebook/     @presmium/render-notebook           notebook 渲染端（.ipynb）
│   ├── addon-core/          @presmium/slidev-addon-core         宿主适配：Slidev 实现
│   ├── viewer/              @presmium/viewer                    IR 运行时：动态渲染、运行时视图、实时更新
│   ├── web/                 @presmium/web                       网页渲染端：VitePress 外壳与宿主适配
│   ├── addon-stage/         @presmium/slidev-addon-stage
│   ├── addon-code/          @presmium/slidev-addon-code
│   ├── addon-exec/          @presmium/slidev-addon-exec
│   ├── addon-exec-local/    @presmium/slidev-addon-exec-local   容器执行、环境复刻
│   ├── addon-guide/         @presmium/slidev-addon-guide
│   ├── addon-content/       @presmium/slidev-addon-content
│   ├── addon-publish/       @presmium/slidev-addon-publish
│   ├── addon-session/       @presmium/slidev-addon-session      会话与网络同步
│   ├── addon-classroom/     @presmium/slidev-addon-classroom
│   ├── classroom-server/    @presmium/classroom-server          y-websocket 服务
│   ├── language-server/     @presmium/language-server           语言服务（诊断、跳转、悬停、补全、预览同步）
│   ├── vscode/              presmium-vscode                     VS Code 扩展（预打包）
│   ├── server/              @presmium/server                    服务端：挂载服务端贡献、请求来源的检查、确认、控制通道、反向代理（Node）
│   ├── mcp/                 @presmium/mcp                       agent 环境：MCP 工具与资源；presmium-mcp（stdio）
│   ├── workspace/           @presmium/workspace                 工作区服务 presmium serve：文档管理、修改历史（REVISIONS）、审阅、编辑模式（presmium dev 也用它；浏览器部分属于旧工作台）；templates/document/ 是随包发布的文档模板
│   ├── addon-exec-wasi/     @presmium/slidev-addon-exec-wasi    WebAssembly 后端（Runno）
│   ├── addon-exec-webgpu/   @presmium/slidev-addon-exec-webgpu  浏览器 GPU 后端（WGSL、jax-js），构建时在 Chromium 中录制
│   ├── addon-exec-jupyter/  @presmium/slidev-addon-exec-jupyter 远端环境（Jupyter 内核协议）与浏览器终端
│   ├── addon-assistant/     @presmium/slidev-addon-assistant    agent 运行时（ACP 客户端，默认启动随包的 DeepSeek Harness）、模型设置、读者问答（浏览器中经读者自己的模型服务）、批注与对话修改（审阅经 `CHANGE_REVIEW`）；dsh 配置模板。读者问答之外属于旧工作台（13.6 节）
│   ├── addon-deltabox/      @presmium/slidev-addon-deltabox     修改审阅与进程沙箱的 deltabox-lite 实现（只有 Node 端，随 CLI 安装的运营者插件）
│   ├── addon-lecture/       @presmium/slidev-addon-lecture      讲授轨、录制、回放、lecture 渲染端、{cue}/{say}、导出视频（presmium-lecture）
│   ├── addon-speech/        @presmium/slidev-addon-speech       语音服务（v1/* 的语音协议）、引擎适配、合成缓存（presmium-speech）
│   ├── design/              @presmium/design                    令牌、pm-ui-* 的类、字体与图标，产物与工作台共用，没有框架
│   ├── workbench/           @presmium/workbench                 工作台的 React 面板，工作区服务的客户端，预览协议的工作台一侧
│   ├── dsh/                 @presmium/dsh                       dsh 的 bundle（宿主部分与预编译的客户端部分）
│   └── studio/              @presmium/studio                    presmium studio，组装 profile，启动与监管 dsh 和工作区服务
├── templates/
│   ├── env/                 远端环境：compose/（compose.yaml、compose.gpu.yaml、compose.gvisor.yaml、devcontainer.json）、kubernetes/（文档）
│   ├── workspace/           工作区：presmium.workspace.yaml 与 .gitignore 的模板
│   └── plugin/              插件项目的模板（create-presmium 用）
├── examples/
│   ├── demo/                示例文稿，端到端测试的对象
│   └── sample-repo/         被示例文稿引用的“业务代码”
├── site/                    文档站：一个 Presmium 工作区，用 Presmium 自己构建（中英双语，接口参考由 TypeDoc 生成）
├── e2e/                     Playwright 测试，每个上下文一个 spec；测试文稿在 e2e/fixtures/<组>/
├── scripts/                 结构检查：check-layering.mjs、check-skills.mjs、check-plugins.mjs、check-packages.mjs（发布的包）；consumer.ts（消费者安装）
├── .changeset/              版本与发布（changesets，预发布模式 rc）；README.md 是哪些包公开发布的表
├── .github/workflows/       CI（ci.yml）
├── .agents/skills/          仓库技能：presmium-author、presmium-present、presmium-develop（.claude/skills 是指向它的软链接，AGENTS.md 是指向 CLAUDE.md 的软链接）
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
| `packages/server/`、`packages/mcp/`（整个包都是 Node 端） | `@presmium/kernel`、`@presmium/compiler`、Node 库；`server` 另可依赖 `@presmium/mcp` | vue 与 `@vue/*`、`@slidev/*`、vitepress、浏览器端的包（`@presmium/viewer`、`@presmium/web`、`@presmium/host`）；`mcp` 不依赖 `@presmium/server` |

读取编译结果的纯函数在 `@presmium/kernel`（`src/reading.ts`：`chapters`、`isChapterTitle`、`blockVisible`、`blockState`、`narrationAt`、`sectionNarration`、`mdastText`、`blockText` 与搜索的分词 `tokenize`），IR 运行时、网页渲染端与 MCP 都从内核引用，`mcp` 因此不依赖 IR 运行时。

此外：只有 `addon-core` 可以在组件与 `src/client/` 中使用 `@slidev/client`，这两处不用 `@slidev/*` 的其他包（`web` 的组件与 `src/client/` 同样不用 `@slidev/client`）；只有 `web` 可以使用 vitepress；任何包（测试除外）都不引用插件包 `@presmium/slidev-addon-*`，渲染端与 IR 运行时也不例外，相对路径不离开本包，共用的契约放在 `@presmium/kernel` 或 `@presmium/host`。`scripts/check-layering.mjs` 检查以上全部规则，扫描 `.ts`、`.tsx`、`.vue`、`.js`、`.jsx`、`.mjs`、`.cjs`、`.mts` 文件，静态 `import`、`export ... from`、动态 `import()` 与 `require()` 都算引用。

服务端、MCP 与外部协议的规则：

- `@presmium/server` 只由 `cli` 与 `workspace` 引用。插件经 `ServerContext`、`RequestContext`、`APPROVALS` 与 `MCP_ENDPOINT` 使用服务端，浏览器端经 `@presmium/host` 的 `useServer()`。
- `@presmium/mcp` 只由 `server` 引用（挂载 `/mcp`）。MCP 服务需要的宿主能力由它自己声明为接口 `McpHost`（`@presmium/mcp` 的类型：文档列表、编译结果与诊断、检查、构建、运行代码块、放映位置与课堂状态、确认），服务端在 `ServerHost` 与控制通道之上实现它，`presmium-mcp` 直接在编译器上实现它；`mcp` 不引用 `server`，两者之间没有循环依赖（10.2 节）。
- 插件包（`addon-*`）不引用 `@presmium/server`、`@presmium/mcp`、`@presmium/workspace` 与 `@presmium/web`；`workspace` 与 `mcp` 也不引用插件包（已有的“没有包引用插件”规则）。
- 外部协议与厂商的客户端各只在一个适配器中：`@modelcontextprotocol/*` 只在 `mcp`（各包的 `test/` 另算）；`@agentclientprotocol/sdk` 只在 `addon-assistant/src/node/`；`@jupyterlab/services` 与 `@xterm/*` 只在 `addon-exec-jupyter`；`mediabunny` 只在 `addon-lecture`；`deltabox-lite` 只在 `addon-deltabox/src/node/`；`simple-git` 只在各包的 `src/node/`。DeepSeek Harness（`@deepseek-ai/dsh`）在旧工作台中是助手插件的依赖，只以子进程启动，不引用它的模块（工作台的规则见下）。语音服务提供方没有 SDK，它们的接口只出现在 `addon-speech/src/node/engines/`，由代码评审守护。
- `workspace` 的 `src/client/` 与 `components/` 同插件组件的规则。

`scripts/check-layering.mjs` 中对应的五条规则：`node packages are framework-free`（`server`、`mcp` 的 `src/` 不引用 vue、`@slidev/*`、vitepress）；`only cli and workspace use the server`；`only the server uses mcp`（`@presmium/mcp` 只出现在 `server` 中，各包的 `test/` 另算）；`plugins use contracts, not the hosts`（`addon-*` 不引用上述四个包）；`protocol clients stay in their adapter`（上一条列表中的包名只出现在给定的目录中）。

工作台的规则（`design-dsh.md` 3.2 节）：

- **产物不认识工作台**：产物的包（`web`、`viewer`、`render-*`、`addon-core`、各插件的 `src/client` 与 `components`）不引用 `EDIT_MODE`、工作台的槽位与 `@presmium/workbench`。旧工作台的引用（`design-dsh.md` 13.3 节）列在白名单中（13.6 节）。
- **dsh 只在一处**：`@deepseek-ai/*` 只出现在 `packages/dsh`、`packages/studio` 与旧工作台的 `addon-assistant` 中。
- **面板不认识宿主**：`@presmium/workbench` 不引用 vue、`@presmium/host` 与 `@deepseek-ai/*`；`@presmium/design` 不引用任何包。
- **mcp 的使用者**：“只有 server 使用 mcp”放宽为“server 与 dsh 使用 mcp”；`@modelcontextprotocol/*` 仍只在 `mcp` 中，bundle 经 `@presmium/mcp` 导出的客户端一侧使用 MCP。

`check-layering.mjs` 的规则 `only the server and the dsh bundle use mcp`、`DeepSeek Harness only in dsh and studio`、`the workbench's panels know no host`、`the design system uses no package`、`outputs do not use the workbench` 检查模块引用；另有两项检查不看引用：产物的代码（`web`、`viewer`、`addon-core`、`render-*` 的全部，各插件的 `src/client` 与 `components`，去掉注释之后）中不出现 `EDIT_MODE` 与工作台的槽位（`slot: '<槽位>'`、`bySlot('<槽位>')`、`slots.value.has('<槽位>')`），白名单 `OLD_WORKBENCH` 列出旧工作台的 7 个文件（`design-dsh.md` 13.3 节第 4 至 7、12、14 行）；各包 `package.json` 的依赖（含开发与对等依赖）中 `@deepseek-ai/*` 只出现在 `dsh`、`studio` 与 `addon-assistant` 中。`check-packages.mjs` 让 `@presmium/workbench`、`@presmium/dsh`、`@presmium/studio` 有自己的 0.x 版本（不计入统一版本），`package.json` 的 `presmium.generated` 列出打包时才生成、不入库却在 `files` 中的路径（`@presmium/dsh` 的 `skills` 与预编译的客户端）。

`package.json` 的 `exports`：

| 入口 | 指向 | 用途 |
|---|---|---|
| `./domain` | `src/domain/index.ts` | 领域层 |
| `./client` | `src/client/index.ts` | 浏览器端 API |
| `./presmium` | `src/node/presmium.ts` | Node 端插件入口，默认导出 `PresmiumNodePlugin` |

源码直接以 `.ts`、`.vue` 发布，不预编译；例外是 `presmium-vscode` 与 `@presmium/dsh` 的客户端部分（dsh 的客户端运行时只加载它的工厂格式，`design-dsh.md` 7.8 节）。Slidev、VitePress 与 Vitest 直接处理 TS；CLI 通过 jiti 加载 TS；插件自己以 TS 写的子进程（`addon-deltabox` 的辅助进程）以 `node --import <jiti/register>` 启动，因为装在 `node_modules` 中的 `.ts` 不被 Node 剥离类型。

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
| `version`、`kernel` | 插件的版本（与 `package.json` 一致，官方插件在 Node 端与浏览器端都读 `package.json`）与兼容的内核版本范围；内核版本 `KERNEL_VERSION` 是插件契约的版本，与包的版本分开，现在为 `1.0.0`，契约有不兼容的改动时升主版本（`api.md` 第 1 节）。编译器不加载范围不含当前内核的插件，渲染端也不使用它（幻灯片不把它作为 Slidev 插件，网页不注册它）。字段在契约中是可选的，官方插件都声明，`scripts/check-plugins.mjs` 检查（并入 `pnpm test`） |
| `roles` | MyST 行内角色规格（`RoleSpec`，4.10 节），例如讲授插件的 `{cue}`、`{say}` |
| `services(ctx)` | Node 端服务实现，例如语音插件的 `SPEECH`、助手插件的 `AGENT_RUNTIME`；编译步骤、渲染端、检查项与服务端贡献经 `service(token)` 使用（4.6 节）。`ctx.settings` 是运营者给本插件的设置（4.7 节），不来自文稿 |
| `environments` | 具名环境的提供方，键为环境的 `kind`（4.6 节） |
| `server(ctx)` | 服务端贡献：挂在 `/__presmium/<插件 ID>/` 下的路由与反向代理（4.7 节、第 10 节） |
| `tools` | agent 工具，MCP 服务以工具暴露（4.8 节） |
| `operator` | 运营者插件：列在运营者设置 `settings.presmium.workspace.plugins` 中时，每份文档都加载它（所有命令），文稿不必写进 `plugins`。`addon-deltabox` 随 CLI 安装，不必列出也在所有命令中加载，排在列表中的插件之后（运营者列出的同一令牌的实现因此优先；运营者可以在 `settings.presmium.deltabox` 中关闭它的服务，4.6 节、10.6 节） |

插件的 `package.json` 以 `peerDependencies` 声明它支持的 Presmium 版本：插件共用应用中的 `@presmium/kernel`、`host`、`viewer`、`compiler`，这些只作为对等依赖，不作为依赖（`scripts/check-packages.mjs` 检查官方插件）。加载器在导入插件之前比较已安装的版本，不满足时不导入它（导入本身可能失败），报告 `presmium.plugins` 的错误（`plugin "X" (name ver) is not loaded: it needs @presmium/kernel ^9.0.0 (peerDependencies),and 1.0.0-rc.0 is installed`），构建不崩溃，只是没有这个插件；`kernel` 范围不满足时同样如此。

从 npm 仓库安装时：Presmium 的包以 TypeScript 源码发布，Node 不剥离 `node_modules` 中 `.ts` 的类型，渲染端以 `--import` 加载 `@presmium/kernel/node` 的 `TYPESCRIPT_IMPORT`（`strip-types.mjs`）启动 VitePress 与 Slidev；Vite 不查看依赖的导入，`preBundle(root, packageDirs)` 从渲染端与文稿插件的包出发，列出它们浏览器代码导入的依赖（`optimizeDeps.include` 的 `<包> > <导入>`），并把这些包链接进 Vite 根目录的 `node_modules`（`presmium serve` 的站点在状态目录中，`presmium dev --out` 可以在任何地方）；从单仓链接的包与文稿自己的目录由 Vite 自己扫描。站点在 `<base>presmium/fonts/LICENSE` 带上字体的许可证（OFL）。消费者安装测试见第 7 节。

插件从哪里加载（10.2 节）：`presmium dev`、`serve`、`build`、`check` 都按文稿的 `plugins` 从文稿目录向上查找 `node_modules`，也接受相对于文稿的路径，替换渲染端的 `renderers.<id>.package`（`ir.md` 2.1 节）同样如此；随 CLI 安装的 Presmium 自己的包（渲染端与 `addon-deltabox`）在找不到时从 CLI 加载。运营者插件另列在工作区配置的 `settings.presmium.workspace.plugins` 中，安装在工作区根目录，每份文档与工作区首页都加载它们。

- 编译步骤 `IRPass` 可以声明 `after: 'execute'`，在编译时执行之后运行，此时代码节点已有 `outputs`（执行插件以此把编译时输出写进执行面板的 `fallback`）。渲染端 `Renderer` 可以提供 `prepare(doc, ctx)`：只生成工作目录、不构建（幻灯片渲染端写出 Slidev 文稿），编译器在 `build` 旁导出 `prepare(compilation, { to, outDir, base })`，发布插件的导出与视觉差异用它（`base` 换掉渲染端的站点路径：`slidev export` 在根路径服务生成的文稿，导出时传 `/`）。构建报告的每个输出给出 `outDir`、`workDir` 与站点路径 `base`。
- 渲染上下文 `RenderContext` 另有 `lang`（文稿语言）、`pluginDirs`（编译器加载的插件目录）、`extensionFor(node)`（各渲染端选中同一插件的扩展）、`portable(value, from)`、`localAsset(source, url)`（本地文件）、`renderers` 与 `base`（站点路径）、`vitePlugins`，见 `ir.md` 第 6 节。
- `@presmium/kernel` 还导出插件共用的纯函数：`irBlocks`、`docBlocks`（遍历块，含组件的子块）、`nodeMdast`、`errorMessage`、`isRecord`、`failedRun`、`languageId`（`py`、`python3`、`ipython*` 归为 `python`，`js`、`mjs` 归为 `javascript`，`ts` 归为 `typescript`）、`lowerMyst`（MyST 降为标准 Markdown；卡片、栅格与选项卡按选项 `cards` 保留结构或降为小标题，`ir.md` 第 6 节）与 `deckLocale`。各包不再自带这些函数的副本。
- 指令与编译步骤的上下文提供 `watch(...files)`：声明 `ctx.src`、`ctx.resolvers` 之外读取的文件，`presmium dev` 在它们变化时重新编译（`ir.md` 第 5 节）。
- 组件转换函数为 `(node, block, ctx)`，`ctx` 是所服务渲染端的 `RenderContext`；插件据此得到输出目录与工作目录（例如幻灯片渲染端生成的 Slidev 文稿所在目录），不为此依赖渲染端的包。
- `RenderContext.workspaceRoot` 与指令、编译步骤上下文中的同名字段相同：文稿所在 git 仓库的根目录，不在仓库中时为文稿目录。渲染端发布插件配置（全局的 `presmium` 与各章节的 `{config}`）时按它改写路径：位于仓库内的绝对路径（例如编译步骤解析出的工作区目录）改为相对路径，网页形态相对于文稿目录，幻灯片形态相对于生成的 Slidev 文稿所在的目录（Slidev 与插件在那里解析路径）；仓库外的路径与其他字符串（例如站点路径 `/web`）保持原样。产物因此不随检出位置变化。
- 检查项的 `CheckContext` 带有编译好的 IR（`ir`），另有 Node 端服务 `service(token)`（4.6 节；例如讲授的检查经 `SPEECH` 判断合成所需的引擎是否可用）。

### 4.3 锚点与检查

- 锚点写作 `scheme:target`，例如 `region:src/a.py#add`、`symbol:src/a.py#Parser.parse`。
- 解析结果为 `exact`、`moved`、`fuzzy`、`lost` 之一；只有前两种可直接渲染，后两种必须产生诊断。
- 指纹记录保存在文稿目录的 `.presmium/anchors.lock.json`，由 `presmium check --update-lock` 生成，随文稿提交。
- 文稿 `.presmium/` 中随文稿提交的还有执行缓存 `freeze/`、本地化的远程图片 `assets/`（如 PlantUML 图，见发布插件）与圈画标注 `drawings/`，新检出的文稿因此构建时不访问远程服务、不重新执行代码。渲染端的工作目录（`slides/`、`web/` 等）不提交，根目录的 `.gitignore` 按此配置；新增一个本地化资源后要把它提交。
- 执行缓存中同一段代码的录制若来自另一个运行环境（执行器的环境指纹不同，例如另一个解释器版本），构建默认沿用这份录制并给出警告，人人构建得到相同的输出；文稿头部写 `execute: { rerun: environment }` 时，这类代码重新执行并替换录制（`ir.md` 第 4 节）。执行器自己的代码的修订（`Executor.revision`，如 Python 运行器的摘要）不同的录制不沿用：执行器可用时重新执行（4.6 节“执行器的修订”）。
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
| `useSharedState(key, initial, { scope })` | 插件状态的共享范围：`view` 只在本视图，`local`（默认）在本机所有窗口，`remote` 经 `syncTransports` 跨设备。两种形态的实现相同：本机窗口之间用 BroadcastChannel（`joinWindows`），`remote` 另经同步传输端口 |
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

**课堂的写入规则。** 课堂的共享集合（`ClassroomStore`，契约中的 JSDoc 写明同样的规则）由课堂服务端把关：主讲可以写任何条目；学员只能写自己的条目：参与者 ID 在键中由集合决定的位置（`answers`、`pulse`、`submissions`、`predictions` 等为最后一个 `:` 之后，`<测验>:<参与者>`；`questions` 为第一个 `:` 之前，`<参与者>:<提问>`；条目 ID 是 `<章节>/<块>`，章节 ID 本身可以含 `:`，如 `sec:intro`，参与者 ID 不能含 `:`），值是在 `participant` 或 `author` 字段中写明自己的对象；键上已有的值写明另一参与者（或是主讲写的）时，学员不能改写也不能删除它；`quizzes` 集合只有主讲能写。服务端只接受能完整并入房间文档的更新：更新依赖服务端没有的内容、删除集超出房间已有的内容，或违反上述规则时，整个更新被拒绝，服务端以应用定义的关闭码关闭该连接，会话插件丢弃本地文档并用新文档重连，提示学员这次写入被拒绝，被拒的写入不会在之后的写入中残留。Yjs 的结构以客户端 ID 与时钟标识，所以一个客户端 ID 属于最先写入它的结构的一方（主讲的各窗口算一方，每个参与者各算一方），在参与者名单中最先声明某个客户端 ID 的连接，也让该 ID 属于自己一方；归属在房间存在期间一直保留，连接断开后也不变（主讲还没写入就短暂断线，重连前学员也不能用它的客户端 ID 写入或出现在名单中）：学员的更新含有别人的客户端的结构（例如主讲下一个时钟的结构）时被拒绝，否则主讲随后对这个时钟的真实写入会被每份文档当作重复而忽略。`put` 不报告失败，所以存放学员数据的插件必须给数据这样的形状，读取集合时也先按类型守卫过滤（学员可能写入形状不对的值）。参与者名单（awareness）同样校验：一个连接只能声明自己的参与者，学员不能自称主讲。

**覆盖视图的控制条。** 网页形态的放映与演讲者视图挂载时在 `<html>` 上设置 CSS 变量 `--pm-overlay-bar`（视图控制条的高度，像素），卸载时移除。插件固定在页面上的元素用它避开控制条，例如课堂徽章的 `bottom: calc(var(--pm-overlay-bar, 0px) + 1rem)`；没有覆盖视图时（以及幻灯片形态）变量不存在，取默认值。

### 4.5 公共服务令牌

| 令牌 | 提供方 | 使用方 |
|---|---|---|
| `presmium.executor` | 代码执行：浏览器中的 Pyodide（Python）与脚本 Worker（JavaScript、TypeScript），两种形态的开发服务器下的本地容器；由路由按语言与优先级选择。每个执行器都按 `RunRequest` 的约定运行：`files` 写在程序的工作目录中，`args` 成为变量，`stdin` 是程序的标准输入；浏览器中的 Python 每次运行有自己的工作目录，运行改动的解释器状态（递归限制、`sys.path`、新导入的模块、内置函数）在运行后恢复 | 代码块的现场执行、执行面板、课堂（练习校验） |
| `presmium.session` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.classroomStore` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.presenterPanels` | 宿主适配（两种形态；网页形态在放映视图的演讲者窗口中显示） | 需要演讲者面板的插件 |
| `presmium.syncTransports` | 宿主适配（两种形态：`remote` 共享状态；幻灯片形态另有 Slidev 经 `addSyncMethod` 同步的导航与圈画，其中按幻灯片序号记的页码、步号与圈画经传输时按章节 ID 与块 ID 换算，完整版与学生版之间因此对得上） | 会话（课堂的网络传输） |
| `presmium.navigation` | 宿主适配（两种形态） | 会话（读取与设置位置：章节序号、步骤、视图与章节 ID `section`；两种形态另报告按 ID 的位置 `trail`（已到达的步骤的键）与 `back`（只给部分受众的章节：没有它的版本回退到的章节，即它之前最近的、学习者版本也有的章节，只给学生的章节也算；只给学生的章节则为之前最近的、所有版本都有的章节），`@presmium/viewer` 的 `FollowAnchor`；`go` 按章节 ID 定位、按 `trail` 求自己版本中的步号，版本中没有这一节时到 `back` 那一节的最后一步，也没有时停在原处，没有章节 ID 的位置按序号，`ir.md` 2.11 节） |
| `presmium.toolbar` | 宿主适配（两种形态，由 `PmToolbar` 显示） | 需要工具栏入口的插件（如会话状态） |
| `presmium.operations`（`OPERATIONS`） | 宿主适配（两种形态，`@presmium/host` 的实现） | 报告：IR 运行时（`go`）、执行插件（`run`）、引导插件（`spot`、`hint`）、讲授插件（`point`、`ink`）；录制与重放：讲授插件 |
| `presmium.status`（`STATUS`） | 宿主适配 | 登记：课堂插件的汇总（`presmium.classroom`：课堂状态 `status`、在线学习者人数 `learners`、提问数与未回答数 `questions`，按位置给出的 `quizzes`（各选项人数、作答与答对人数）、`predictions`（各选项人数、预测人数）、`pulse`（各档人数）、`exercises`（提交与通过人数）；不含昵称、参与者 ID 与学习者写下的文字）；读取：控制通道（送给 MCP 的 `get_classroom`） |
| `presmium.editMode`（`EDIT_MODE`，旧工作台） | 工作区的浏览器插件 | 助手插件（批注与对话）、讲授插件（转写回写） |
| `presmium.speech`（`SPEECH`） | 语音插件：浏览器端经语音插件的路由（语音协议 `v1/*`），Node 端直接调用引擎 | 讲授插件（转写、合成、构建时合成）、讲授插件贡献的 agent 工具 |
| `presmium.agent`（`AGENT`，浏览器，旧工作台） | 助手插件 | 讲授插件（转写回写）、工作区的浏览器插件（新建文档时由 agent 起草） |
| `presmium.ask`（`ASK`，浏览器） | 助手插件（每个页面，静态产物也有） | 提问面板、课堂插件（课堂中的 AI 回答，用主讲自己的设置） |
| `presmium.agentRuntime`（`AGENT_RUNTIME`，Node，旧工作台） | 助手插件 | 助手自己的服务端路由 |
| `presmium.revisions`（`REVISIONS`，Node） | 工作区（`presmium serve` 为每份文档登记；`presmium dev` 为 git 仓库中的文稿登记，10.2 节） | 助手插件（每个修改任务一次提交）、工作区的文档管理 |
| `presmium.documentFiles`（`DOCUMENT_FILES`，Node） | 工作区（`presmium serve`；`presmium dev`，被 git 忽略、在另一个仓库中的文稿除外，10.2 节） | git 审阅（回退与恢复，在工作区服务中，13.4 节）、讲授插件的录制与讲授轨、语音插件的合成缓存；在 serve 与 dev 中写文档目录的插件都应经它（10.2 节）。例外：课堂服务的归档直接写文稿的 `.presmium/classroom/`（10.2 节“课堂同步”） |
| `presmium.documentLocks`（`DOCUMENT_LOCKS`，Node） | 工作区（`presmium serve` 与 `presmium dev`） | 文档操作、修改历史的撤销、源码编辑器的保存、审阅与助手的修改任务：一份文档同一时间只有一个写入方（4.8 节） |
| `presmium.approvals`（`APPROVALS`，Node） | 服务端（按 `ApprovalScope` 分发：`content` 给发起的成员，`workspace` 只给所有者） | MCP 服务（操作类与计费类工具）、助手插件（agent 的权限请求与超出范围的写入）、语音插件（计费的合成）、本地环境插件（运行） |
| `presmium.mcpEndpoint`（`MCP_ENDPOINT`，Node） | 服务端（挂载 `/mcp` 时） | 助手插件：为每个 agent 会话签发绑定成员与模式的 MCP 令牌，放进 ACP `session/new` 的 `mcpServers` |
| `presmium.changeReview`（`CHANGE_REVIEW`，Node） | `addon-deltabox`（随 CLI 安装，主机满足条件时登记） | 助手插件：修改任务的审阅与回滚；没有这个服务时助手用内置的 git 实现（4.8 节、10.7 节） |
| `presmium.processSandbox`（`PROCESS_SANDBOX`，Node） | `addon-deltabox`（随 CLI 安装，主机满足条件时登记） | 编译器：放进 `RunContext.sandbox`，执行插件的子进程经它运行（4.6 节、10.6 节） |

内核契约中的令牌（`executor`、`session`、`classroomStore`、`presenterPanels`、`speech`、`agent`、`ask`、`agentRuntime`、`revisions`、`documentFiles`、`documentLocks`、`approvals`、`mcpEndpoint`、`changeReview`、`processSandbox`）定义在 `packages/kernel/src/contracts.ts` 与它再导出的 `contracts/` 模块中；宿主层的令牌（`syncTransports`、`navigation`、`toolbar`、`operations`、`status`、`editMode`）定义在 `packages/host/src/types.ts`。服务替换时，提供方与使用方都不需要改动。Node 端的令牌（`speech` 的 Node 实现、`agentRuntime`、`revisions`、`documentFiles`、`documentLocks`、`approvals`、`mcpEndpoint`、`changeReview`、`processSandbox`）登记在编译器为每份文稿建立的 Node 端服务注册表中（`PresmiumNodePlugin.services`，服务端与工作区另行登记自己的实现），规则与浏览器端相同：一个令牌只有一个实现。

`executor`、`session`、`classroomStore` 的接口（`RunRequest`、`SessionService`、`Role` 等）是业务契约。它们放在内核包中是有意的：提供方与使用方是不同的插件，插件之间不互相引用（第 3 节），契约只能放在双方都依赖的共享内核中。内核的运行时（服务注册、启动、锚点、检查）不使用这些概念。见第 9.2 节。

### 4.6 执行环境、会话与富输出

4.6 至 4.10 节是执行环境、智能体、工作区与讲授的契约，全部是兼容扩展：只增加可选字段、可选参数（`Executor.run` 的第三个参数 `ctx`）、新类型、新函数与新的服务令牌，`IR_VERSION` 仍为 1。它们写在 `contracts.ts`、`ir.ts` 与 `host/src/types.ts`（`HostStart`、`StartOptions` 在 `host/src/kernel.ts`，`KernelOptions` 在 `kernel/src/kernel.ts`），按语义化版本的承诺变化（`docs/api.md`）。业务契约按领域拆在 `packages/kernel/src/contracts/` 中：`service.ts`（`ServiceToken`、`defineService`，其他模块只从这里取运行时的值，没有循环引用）、`execution.ts`（执行、进程沙箱、具名环境与 `environmentExecutor`）、`server.ts`（成员、路由、两种 Node 端上下文、确认与 `eventStream`、MCP 访问）、`speech.ts`、`agent.ts`（智能体、修改审阅与修改历史）、`operations.ts`；`contracts.ts` 保留插件、锚点、检查与课堂的契约并统一再导出，入口 `@presmium/kernel/contracts` 不变（9.2 节）。内核另导出 `withProp(props, path, value)`（按 `.` 分隔的属性路径设置组件属性，渲染端改写 `ComponentNode.assets` 用）与 `roleMark(node)`（角色的标记 `〔名 value〕`），`lowerMyst` 增加选项 `roles: 'marks'`。

`packages/kernel/src/contracts.ts`：

```ts
export interface RunRequest {
  // ……已有字段……
  /**
   * 指定的执行器（IR 的 `RunSpec.executor`；`:env:` 编译为 `environmentExecutor(name)`）。
   * 路由只把请求交给这个执行器；它没有登记或不支持该语言时返回失败的结果
   * （`failedRun`），由预录输出回退，不改用其他执行器。省略时按语言与优先级选择。
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
   * 文稿的语言（头部的 `lang`，没有时为 `zh-CN`）：执行器自己写进录制的文字（如 WebGPU
   * 运行的摘要）按它（`deckLocale`），与编译时写入产物的其他文字一样（5.7 节）
   */
  lang?: string
}

/** 进程沙箱中的一次运行：命令在一个新的运行目录中执行，输入与结果都经这个目录中的文件传递 */
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

/** 凭据方式；凭据本身只在服务端 */
export type EnvironmentAuth = 'none' | 'env' | 'proxy' | 'prompt' | 'hub'

/** 文稿头部 `execute.environments` 的一项；不含凭据 */
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
  /** 进程的环境变量（凭据，以及 `PRESMIUM_AGENT_COMMAND` 这类运营者的设置）；没有时为 undefined */
  secret(name: string): string | undefined
  /**
   * 运营者目录的绝对路径（同意记录等运营者数据，10.5 节）：用户状态目录中按工作区区分，
   * 在任何工作区与文档目录之外
   */
  operatorDir?: string
  /** 调用时文稿的 Node 端服务（宿主的，如工作区的 `DOCUMENT_FILES`，与插件的）；可选只是为了兼容 */
  service?<T>(token: ServiceToken<T>): T | undefined
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

- **执行器的选择**：浏览器中的 IR 运行时、执行面板与编译时执行都把代码块的 `run.executor` 放进 `RunRequest.executor`，由路由精确选择。IR 运行时不再自己挑选首选执行器。
- **会话 ID**：浏览器中由代码块的 `:session:` 加上页面实例的标识组成（每个页面、每个学习者各自一份）；编译时由文稿与 `:session:` 组成，构建结束时对每个用过的会话调用 `endSession`。
- **富输出**：执行器把输出写入 `outputs`，同时照旧拼接 `stdout`、`stderr`。渲染见 `ir.md` 第 6 节；HTML 输出在显示前清洗（第 11 节）。
- **环境的登记**：编译器为头部声明的每个环境找到 `kind` 对应的提供方，创建执行器并加入编译时的执行器列表；没有提供方的 `kind` 与未声明的环境名都是错误级诊断。浏览器端由同一插件在 `setup` 中按 `ctx.environments` 为同类环境登记执行器，ID 相同。
- **执行的环境变量**：编译时执行的代码由文稿的编辑者或 agent 写出，不应拿到服务端的凭据。清理环境变量挡住的是代码经自己的环境拿到凭据（例如打印全部环境变量的代码把凭据写进录制）；同一 uid 的代码仍能读进程信息（`/proc/<pid>/environ`），这由进程沙箱处理（10.6 节，9.4 节的残余风险）。编译器为每次运行给出 `RunContext.env`：`presmium build`、`check`、`dev` 与语言服务中，是进程的环境去掉全部 `PRESMIUM_` 开头的变量，以及名字（不分大小写）以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量；`presmium serve` 中只有允许列表：`PATH`、`LANG` 与 `LC_*`、`TZ`、`TMPDIR`，以及 `HOME`（每个工作区一个临时目录）。两种情况都再加上运营者设置 `settings.presmium.exec.passEnv` 列出的变量（取进程中的值，即使名字像凭据）。执行插件的子进程、WASI 程序、WebGPU 录制所启动的 Chromium 与远端内核都只得到其中的变量，执行器不读 `process.env`；本地环境插件的 `docker` 与 devcontainer 命令行以它加上 Docker 客户端需要的几个变量为环境（容器定义中的 `${localEnv:…}` 因此取不到被去掉的变量），容器里的代码至多得到 `RunContext.env` 中的变量（10.6 节）。
- **进程沙箱**（10.6 节）：Node 端服务中有 `PROCESS_SANDBOX`（随 CLI 安装的运营者插件 `addon-deltabox` 在主机满足条件时登记，默认启用）时，编译器把它放进每次运行的 `RunContext.sandbox`。执行插件的 `python3`、`node` 执行器经它运行：代码、参数与输入写进运行目录，结果由运行器写进运行目录中的文件（不经标准输入与额外的文件描述符，`ir.md` 第 4 节），文稿目录与解释器的安装目录只读；同一 `:session:` 的代码块在同一次运行中依次执行（会话有一块未命中时本来就从头重新执行）。本地环境插件的容器（要用 Docker 的套接字）、WASI 程序（在 WebAssembly 的沙箱中）与 WebGPU 的录制（在 Chromium 中）不经进程沙箱。
- **执行选项**（10.6 节）：编译器的执行选项（编译器自己的接口，不是内核契约）由宿主给出：`env`（`local` 或 `serve`，决定上一条的规则）。宿主的 `ServerHost` 运行单个代码块（MCP 的 `run_code`）与构建时使用同一套选项（10.6 节）。全部命令都在本进程中执行（有进程沙箱时经它）。

实现：

- **执行选项的形状**：`CompilerOptions.execution`（`@presmium/compiler` 导出 `ExecutionOptions`）为 `{ env?: 'local' | 'serve' }`。`Compilation` 另给出 `executors`（插件的与具名环境的）、`runContext`、`environments`（供 `presmium check --env`）与 `run(node, signal)`（以同一套选项运行一个代码块，不读写录制；会话中的块先在一个新会话中依次运行它前面的块，`presmium dev` 与 `presmium serve` 的 `ServerHost.run` 用它）。`RunStats` 增加 `sandbox`（构建报告的 `code runs: … isolated by <kind>`）。同一进程中编译的两份文稿（`presmium serve`）即使写了同名的 `:session:`，各自也有自己的解释器：编译器在每次编译的会话 ID 前加上这次编译自己的标识。
- **`RunContext.env`** 由 `runEnvironment(rules, passEnv, workspaceRoot)` 计算（`execute.ts`）；`serve` 规则的 `HOME` 是本用户状态目录中的 `presmium/run-home/<工作区根目录的哈希>`（`XDG_STATE_HOME` 或 `~/.local/state`；0700，不是本用户的目录或是链接时拒绝），并设置 `PYTHONNOUSERSITE=1`；不用共享的临时目录，那里其他本机用户可以抢先创建或放入链接（最终审计）。`RunContext.sandbox` 取 Node 端服务中的 `PROCESS_SANDBOX`，`RunContext.lang` 是文稿的语言。录制的缓存键不含文稿的语言：改了 `lang` 之后，已有的录制在代码或环境改变之前保持原来的文字。
- **执行器的修订**：`Executor` 另有可选的 `revision?(lang)`，是执行器自己影响输出的代码的修订，例如执行插件的本地 Python 执行器为 `runner <runner.py 的 sha256 前 16 位>`。它与环境指纹一起进入缓存键（没有修订的执行器的键不变），并记在录制中（`.presmium/freeze/<键>.json` 的 `revision`）。另一环境的录制照旧沿用，另一修订的录制则已过时，不沿用：执行器可用时重新执行并替换它，所以运行器改变输出的方式之后（如末尾表达式的值），已缓存的录制在下一次构建时更新；没有执行器时仍显示原有的录制。示例讲义的 Python 录制随之重新生成。
- **会话**：编译器按文稿顺序把同一 `:session:` 的块编成一组，会话 ID 为 `<入口文件>:<会话名>`；有一块未命中时先 `endSession`，再把整组请求一次发出（不在其间等待），执行器按请求顺序执行，结束后对每个用过的会话调用 `endSession`。执行插件的本机执行器把一起到达的同一会话的请求放进一次运行（同一个子进程，或进程沙箱中的一次 `run`）；之后单独到达的同一会话的请求先重新运行该会话此前的请求，所以状态总是一致（`packages/addon-exec/src/node/child.ts`）。浏览器中会话 ID 由执行路由加上页面实例的标识（路由在页面中创建），Pyodide 的会话是 Worker 中常驻的全局命名空间，`endSession` 丢弃它；代码块旁的“重置会话”调用路由的 `endSession`。本地环境插件的容器执行器每次运行一个新容器，不共享会话的状态（不支持会话的执行器忽略它）。
- **运行目录的协议**：执行插件的子进程（与进程沙箱）中，运行器读运行目录中的 `.presmium/request.json`（`{ session?,runs: [{ code,args,stdin,files,lang }],path? }`），每完成一个请求写 `.presmium/result-<i>.json`（先写临时文件再改名），超时被杀死时已完成的请求的结果仍在；一组请求的超时是各自超时之和。Python 的命令是 `python3 -c <运行器>`（`read` 为解释器的 `sys.prefix` 与 `sys.base_prefix`），JavaScript 是 `node --input-type=module -e <主程序>`（`read` 为执行插件的包、Sucrase 与 Node 的安装目录）；文稿目录由进程沙箱自己加入只读路径（它的 Node 端服务知道文稿目录，`SandboxRun` 中没有它）。容器执行器把同样的 `request.json` 写进挂载的运行目录，在容器中运行同一个运行器。
- **共享的运行器**（`@presmium/kernel/runner.py`）另提供 `display()`（不必导入）、`IPython` 与 `IPython.display`（`display`、`Markdown`、`HTML`、`Latex`、`SVG`、`JSON`、`Image`；安装了的 IPython 不被使用，浏览器与编译时一致）和 matplotlib 的后端 `module://_presmium_matplotlib`（Agg 绘制，`plt.show()` 与运行结束时把打开的图写成 `image/png` 输出；运行期间 `MPLBACKEND` 指向它；matplotlib 要装在运行代码的环境中：编译时的 Python、远端环境；浏览器的 Pyodide 只加载核心发行版，只有标准库）。代码块最后一条语句是表达式时，它的值（不为 `None`）以 `display` 的格式成为 `execute_result` 输出，与 Jupyter 一致（分步执行不变）。错误的回溯同时是 `error` 输出与 `stderr` 的文本。参数（`RunRequest.args` 是字符串）由运行器读回：先按 Python 字面量，再按 JSON（`true`、`false`、`null`），否则保留字符串；Jupyter 内核得到同一规则的读回代码。
- **容器的环境**：容器里的代码得到 `RunContext.env` 中除 `PATH`、`HOME`、`TMPDIR`（主机上的路径）之外的变量；`TMPDIR` 是文中没有列出、实现另外去掉的。
- **`run` 操作**：由 IR 运行时报告与重放（`@presmium/viewer` 的代码块：报告 `{ section,block,result }`，`result` 为 `live`，或运行没能进行而显示录制时为 `freeze:<缓存键>`；重放时显示录制的输出），而不是执行插件：块 ID 只有 IR 运行时知道，执行插件经 `executor` 服务收到的请求中没有它；`OPERATIONS.onReplay` 每类操作只有一个处理者，所以由 IR 运行时统一处理。执行面板暂不报告 `run`。
- **浏览器中运行失败**：路由对指定了执行器而没有登记（或不支持该语言）的请求返回 `failedRun`（`exitCode` 为 null）；IR 运行时的代码块对 `exitCode` 为 null 的失败显示录制的输出并在说明中写出原因，程序自己的错误（如 `NameError`）照常显示为现场的输出。
- **幻灯片中的现场代码**：Slidev 53 只读到代码块属性中第一个 `}`（9.3 节），所以执行器、会话与超时写在生成文稿头部的 `presmiumRuns`（键为 `<章节 ID>/<块 ID>`），代码块写成 ```` ```python {monaco-run} {autorun:false,height:'auto',runnerOptions:$slidev.configs.presmiumRuns['<键>']} ````，不在显示时自动运行，录制的输出显示在它下方；有高亮步骤或多版本的代码块仍是普通代码块。写成 `{monaco-run}` 的语言是 Python、JavaScript、TypeScript 与 C、C++、Ruby、SQL（别名写成 code runner 认识的名字：`c++`、`cc`、`cxx` 为 `cpp`，`rb` 为 `ruby`，`sqlite` 为 `sql`），执行插件的 `setup/code-runners.ts` 为这些语言登记同一个经 `executor` 服务运行的 code runner，C 等语言因此由 WASI 执行器或环境的执行器运行。生成的头部另有 `presmiumEnvironments`（IR 的 `config.execute.environments`），`addon-core` 交给 `startHost`。

实现（WebAssembly 后端）：

- **一份运行器，两处运行**：`addon-exec-wasi` 的 `src/runner.mjs`（纯 JavaScript，同执行插件的 `runner.mjs`）定义语言（`c`、`cpp`、`ruby`、`sql` 及别名）、每个运行时的文件与命令行，并在 `@runno/wasi` 的 WASI 系统中运行请求：C 与 C++ 先由 `clang.wasm` 编译、`wasm-ld.wasm` 链接（sysroot 为 `clang-fs.tar.gz`），再运行得到的 WASI 程序；Ruby 与 SQLite 解释程序。浏览器中由页面的一个常驻 Worker 运行（模块只编译一次，超时或中止时结束 Worker），编译时每次运行一个子进程（其中的工作线程运行它；有进程沙箱时这个进程在沙箱中，没有时直接启动；WebAssembly 内存的上限为 1024 MiB，即 `MEMORY_LIMIT_MB`，超出时程序的分配失败，编译器的内存不受影响），二进制相同，所以录制与现场输出一致。程序的文件系统在内存中（`RunRequest.files` 放在根目录，文件时间固定），标准输出与标准错误按写入顺序成为 `stream` 输出；不支持 `args` 与会话。
- **环境变量**：编译时 WASI 程序的环境就是 `RunContext.env`（没有 `ctx` 时为空）；编译器与链接器没有环境，工作线程以空的 `process.env` 启动；浏览器中程序没有环境变量。WASI 程序在 WebAssembly 的沙箱中运行，不经进程沙箱。
- **执行器与环境**：按语言选择的执行器 ID 为 `presmium.wasi`（浏览器与编译时相同）；`kind: wasi` 的环境以 `presmium.env.<名>` 登记同一实现，按环境的 `languages` 限定语言；`probe` 报告不支持的语言与缺少的运行时文件。环境指纹为 `wasi <运行时> sha256:<该运行时全部文件的哈希前 16 位>`，每个进程只计算一次。
- **运行时的发布**：二进制取自已安装的 `@runno/sandbox` 的 `dist/langs`（沿模块查找路径找到，它的 `exports` 不导出 `package.json`）。编译步骤 `presmium.execWasi.runtimes` 把浏览器中运行的代码（`run.when` 为 `live` 或 `both`，含组件的子块，执行器为 `presmium.wasi`、`kind: wasi` 的环境或未指定）需要的运行时写进 IR 中插件配置的 `runtimes`；两种形态都经 `PresmiumNodePlugin.vitePlugins`（幻灯片渲染端把它们写进生成文稿的 `vite.config.ts`）把这些运行时复制到 `<base>wasi/`（服务端渲染的构建不复制），开发服务器提供全部运行时。网页的 Service Worker 预缓存产物中的全部文件（9.2 节），幻灯片的（发布插件的 `OFFLINE_MANIFEST`）预缓存其中的 `.wasm` 与 `.gz`，所以运行时在两种形态中都离线可用。幻灯片中 C、C++、Ruby、SQL 的现场代码块是 `{monaco-run}`（上文“幻灯片中的现场代码”）。发布运行时的同时发布它们的许可证说明 `<base>wasi/LICENSES`（包中的 `LICENSES`：Runno 的 MIT 许可证，LLVM 8 的 University of Illinois/NCSA 许可证，wasi-libc 与 LLVM 9 以后的 Apache 2.0 加 LLVM 例外，Ruby 的 2-clause BSD，SQLite 的公有领域声明），开发服务器同样提供。
实现（浏览器 GPU 后端；契约没有改动）：

- **`wgsl` 执行器**：`@presmium/slidev-addon-exec-webgpu` 在浏览器与编译时都以 `presmium.webgpu` 登记（`kind: webgpu` 的环境另以 `presmium.env.<名>` 登记，浏览器端由插件在 `setup` 中按 `ctx.environments` 登记）。计算核心是纯 JavaScript 的 `src/gpu.mjs`，浏览器中在每次运行一个的专用 Worker 里运行，编译时在 Playwright 的 Chromium 中运行同一份文件，所以录制与现场的输出一致。请求由 `src/domain/params.ts` 从着色器与 `:params:` 得出（`ir.md` 2.7 节）：缓冲区按着色器中变量的名字给出数据或大小，组、绑定、存储的读写与值的类型取自着色器的声明，可写的存储缓冲区读回并显示；显式的绑定布局（入口函数不用的缓冲区也绑定）；按缓冲区的大小请求设备的 `requiredLimits`。结果是 `stdout` 的文本（同时是一个 `stream` 输出）：每个读回的缓冲区一行（长的显示首尾各 4 个值与最小、最大、平均）、每次派发的中位时间（有 `timestamp-query` 时用 GPU 时间戳，否则为提交到队列完成的时间；回退适配器上注明“CPU 模拟”）与适配器。浏览器中按界面语言，编译时按文稿的语言（`RunContext.lang`；没有上下文时为英文）。
- **回退**：浏览器没有 WebGPU、没有适配器、适配器缺少特性或限制、设备丢失、超时，结果是没能进行的运行（`exitCode` 为 null，原因在 `stderr`），代码块与执行面板显示编译时录制的输出与原因；着色器的编译错误、WebGPU 的校验错误与写错的 `:params:` 是程序自己的错误（`exitCode` 为 1）。超时（请求的超时，默认 10 秒）时 Worker 先销毁设备再被结束；运行的规模上限为全部缓冲区 128 MiB、`repeat` 至多 1000。
- **编译时的录制**（`src/node/recorder.ts`）：Chromium 以 `RunContext.env` 为环境（没有上下文时只有 `PATH`、`LANG` 与临时的 `HOME`），页面经 `page.route` 从 `https://webgpu.presmium.invalid/` 提供（WebGPU 要安全上下文，不占端口），每次运行启动并关闭一次浏览器（执行器没有供编译结束时关闭的钩子）。环境的选项 `adapter`：`auto`（默认，先以 `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan` 用显卡，没有适配器时用 SwiftShader）、`gpu`、`swiftshader`。环境指纹为 `chromium <版本>; <厂商> <架构>`，回退适配器加 ` (fallback)`。没有安装 Chromium 时执行器不支持 `wgsl`（录制照常使用）；没有适配器（指纹）或适配器不能运行（缺少特性或限制、设备丢失）时抛出错误而不返回结果，编译器沿用已有的录制并警告，没有录制时报错，失败不会作为录制留下。`presmium check --env` 的 `probe` 启动 Chromium 请求该适配器。
- **执行面板**（`addon-exec`）：`{run-panel}` 接受任何有执行器的语言；Python、JavaScript、TypeScript 之外的语言的 `:params:` 可以是任意的 YAML 映射（列表与映射以 JSON 字符串放进 `RunRequest.args`，面板的表单中可以改）。执行插件的 `presmium.exec.fallbacks` 把编译时录制的成功输出写进面板的属性 `compiledOutput`；现场运行没能进行（`exitCode` 为 null）而面板没有 `:recorded:` 时，面板显示它并在标记中写出原因（如“预录输出 · 没有可用的 GPU 适配器”）。
- **Python 桥**（`addon-exec` 的 `src/client/presmium_gpu.py`）：Pyodide Worker 把它写进 `/presmium` 并加入 `sys.path`。`await presmium_gpu.run(着色器, buffers=…, dispatch=…, entry=…, repeat=…, features=…)` 经 Pyodide 的 JavaScript 桥调用 `navigator.gpu`，参数与 `wgsl` 的 `:params:` 相同，返回读回的缓冲区（`dict`，另有 `timing` 与 `adapter`，`print` 给出与 `wgsl` 执行器相同格式的英文摘要）；不能运行时抛出 `GPUUnavailable`（`requestDevice` 失败也是），WebGPU 拒绝时抛出 `GPUError`。规模限制与 `wgsl` 执行器相同（全部缓冲区 128 MiB、`repeat` 至多 1000，`dispatch` 为 1 到 3 个正整数）：超出或写错时在请求适配器之前抛出 `ValueError`，文字与执行器的英文消息相同。插件包之间不互相引用，所以这两个上限在 Python 中另写一份（`_MAX_BYTES`、`_MAX_REPEAT`）。代码块顶层的 `await` 由 `src/client/run_await.py` 的 `_pm_run_await` 支持（与共享运行器的 `_pm_run` 相同的输出、会话与隔离，以 `PyCF_ALLOW_TOP_LEVEL_AWAIT` 编译，Worker 等待它）。有 JSPI 时 Worker 以 `callPromising` 运行其他代码块，`presmium_gpu.run_sync(…)` 与 `pyodide.ffi.run_sync` 因此可用。
- **jax-js**：脚本 Worker 没有导入映射，执行插件的 `SCRIPT_IMPORTS`（`@jax-js/jax` → `<base>presmium/jax-js/index.js`）由脚本执行器解析为地址交给 Worker，`runner.mjs` 的 `prepare` 把代码中 `import … from`、`export … from`、`import '…'` 与 `import('…')` 的这些名字改写为地址（Node 中的编译时执行没有这张表，导入 jax-js 的代码写 `:run: live`）。jax-js 的 ES 模块构建（互相导入的 5 个文件）由 WebGPU 插件的 Vite 插件（`PresmiumNodePlugin.vitePlugins`，`src/node/jax.ts`）在开发服务器中提供、在构建中原样复制到 `presmium/jax-js/`，第一次导入时才加载；没有 WebGPU 插件的文稿不带它。Slidev 构建时为 `{monaco-run}` 中导入的包查找类型，找不到（jax-js 只在 WebGPU 插件的依赖里）时构建失败；幻灯片渲染端因此在现场的 JavaScript、TypeScript 代码导入了从生成文稿的目录找不到的包时，在生成文稿的头部写 `monacoTypesSource: none`（9.3 节；`renderers.slides.monacoTypesSource` 优先）。
实现（远端环境 `addon-exec-jupyter`）：

- **包内结构**：除 `src/domain`、`src/node`、`src/client` 外另有 `src/jupyter/`：Node 与浏览器共用的 `@jupyterlab/services` 客户端（`kernels.ts` 的内核池与运行、`terminals.ts` 的终端），它不引用 Node 内置模块与 vue，两端各自给出连接的设置（`src/node/connection.ts`：`ws` 的 WebSocket 与带请求头的 `fetch`；`src/client/environments.ts`：浏览器的 `fetch` 与 `WebSocket`）。`@jupyterlab/services` 在第一次运行时才加载。
- **凭据规则**（`src/domain/connection.ts` 的 `operatorConnection`）：`none` 连接文稿的 `url`，不带令牌；`env`、`proxy`、`prompt` 在服务端（构建、代理、`probe`）都用运营者的一对 `PRESMIUM_ENV_<名>_URL`、`_TOKEN`（构建时没有学习者，`prompt` 的录制同样用运营者的令牌）；名字转为大写，其他字符变为 `_`。没有地址时不连接（运行失败并说明），文稿的 `url` 与地址不同源时提供方的 `create` 抛错，编译器给出 `presmium.execute` 的错误诊断，代理同样不挂载。令牌以 `Authorization: token …` 请求头发送，Node 端的 WebSocket 同样带请求头，令牌不进地址。
- **运行**：一个会话是一个内核（`endSession` 关闭它），没有会话的运行用一个之后关闭的内核；同一会话的运行按请求的顺序排队。启动内核的请求只有内核名与路径 `presmium-runs/<id>/kernel`（jupyter_server 以它的目录为内核的工作目录，`files` 经 Contents API 写进这个目录），不带任何环境变量。内核关闭之后，这个目录连同代码写下的文件经 Contents API 删除（先删其中的文件与子目录，因为服务器只在送进回收站或设置了 `always_delete_dir` 时删除非空目录；服务器不列出的隐藏文件留下）。`args` 先作为一段静默执行的赋值运行；`stdin` 按行回答 `input_request`；超时或中止时经 REST 中断内核，5 秒内没有停下的内核被关闭。环境指纹为 `jupyter image=<文稿的 image> kernelspec=<内核名>:sha256:<内核规格的哈希> kernel=<kernel_info 的实现与版本、语言与版本>`，启动一个内核读 `kernel_info` 得出，60 秒内复用。`languages` 省略时按内核规格的语言判断，不符的运行失败。
- **开发服务器的预打包**：页面在第一次远端运行时才加载 `@jupyterlab/services`，`{terminal}` 加载 xterm；开发服务器到那时才发现的依赖会让 Vite 重新优化并重新加载页面，正在进行的运行因此丢失。插件的 Vite 插件（`src/node/vite.ts` 的 `prebundled`）在开发服务器启动时把它们放进 `optimizeDeps.include`（经本插件包，写成 `@presmium/slidev-addon-exec-jupyter > @jupyterlab/services`，从 Vite 的根目录找不到本插件包时不加）；执行插件同样预打包执行面板的 `diff`。
- **浏览器**：客户端插件为每个 `kind: jupyter` 的环境登记执行器 `presmium.env.<名>`，并提供 `PmTerminal` 用的 `JUPYTER_ENVIRONMENTS`。`proxy` 经 `/__presmium/presmium.execJupyter/env/<名>/`：HTTP 带 `Presmium-Document`，WebSocket 不能带请求头，文档放在查询参数 `document` 中（由 `hello` 得知）。`prompt` 第一次运行时弹出对话框，令牌存在 `sessionStorage` 的 `presmium.execJupyter.token:<名>` 中，以 `?token=` 带在 WebSocket 地址中（只发往这个服务器），服务器拒绝（401、403）时忘掉它；`url` 中的 `{user}` 由 `<hub>/hub/api/user` 给出。HTML 与 SVG 输出在执行器中先经 DOMPurify 清洗。
- **服务端**：服务端贡献的代理随编译器最近一次为该文稿创建的环境变化（`proxies`、`routes` 是读取时计算的属性），只为 `auth: proxy` 的环境挂载，角色为 `reader`；代理设置目标的 `Host` 与 `Origin`（以服务端为 Jupyter 的客户端；Jupyter 校验 WebSocket 的来源），不能挂载时同一路径回答 502 与原因。
- **站点的服务端渲染**：Rollup 会加载死分支中的动态导入，网页的服务端渲染因此也打包插件的浏览器模块；`@jupyterlab/services` 只在非浏览器环境 `require('ws')`（包的 `browser` 字段把它换成垫片），服务端渲染的打包没有这一字段，会连 `ws` 与 Node 内置模块一起打包而失败。插件经 `PresmiumNodePlugin.vitePlugins` 给出一个 Vite 插件（`src/node/vite.ts`），在每次打包中把这一处 `ws` 解析为该包自己的垫片。

的补充：

- **一条 Vite 通道**：插件只经 `./presmium` 入口的 `vitePlugins` 加入 Vite 插件；网页渲染端在 VitePress 的开发与构建中加入，幻灯片渲染端写进生成文稿的 `vite.config.ts`。执行插件、Jupyter 与 WebGPU 插件包根目录的 `vite.config.ts` 与 `setup/vite-plugins.ts` 已删除，网页渲染端也不再读插件包根目录的 `vite.config.ts`。
- **执行器在哪里运行**：`Executor` 另有可选的 `runsIn?: 'browser' | 'machine'`，执行面板的顶栏据此写“浏览器中运行”或“本机运行”，没有时只写语言（5.12 节的运行面板）。
- **执行面板的参数显示**：`Executor` 另有可选的 `params?(lang): ParamsDisplay | undefined`（浏览器端的执行器），`ParamsDisplay` 为 `{ labels: Record<string, string>; fields?: string[]; summary?(args): string }`：面板按它显示参数的标签（按界面语言），映射类型的参数每个键一个输入框（写回为 YAML 的流式映射），运行记录显示摘要而不是 JSON；没有它或没有命名的参数显示名字与值。WebGPU 执行器给出缓冲区、工作组数、入口函数、重复次数与所需特性。
- **浏览器中的 Python 只有标准库**：`presmium check` 对在浏览器中运行（`:run: live` 或 `both`）的 Python 代码块、执行面板与分步执行中导入标准库之外的模块给出警告 `presmium.exec`；`pyodide`、`js`、`IPython`、`presmium_gpu` 允许，带 `:env:` 的块不检查。
- **分步执行的步数**：`presmium build` 与 `presmium check` 在 `:steps:` 与追踪得到的执行行数不同时，在指令处警告（追踪在进程沙箱中运行）；组件的提示只在演讲者视图与开发服务器中显示。
- **幻灯片中的运行器输出**：不是 base64 的图片数据被丢弃并说明原因；HTML 输出经 DOMPurify（去掉 `<style>`）清洗后直接显示在幻灯片中，写进 Slidev 文稿的录制输出在构建时以 jsdom 与 DOMPurify 同样清洗（`render-slides` 的 `src/node/html.ts`）；Jupyter 客户端同样丢弃不是 base64 的图片。
- **放映中的执行面板**：幻灯片与放映视图中面板的代码占满幻灯片的剩余高度，较长时在面板中滚动，参数、运行按钮与输出留在幻灯片上。放映中参数与运行按钮的字号与代码相同（网页的表单控件不再取浏览器的 13.3 px），输出在代码旁边占去一半宽度时，过长的代码行在面板中换行而不被截断；幻灯片中现场代码的 Monaco 运行器（规则在生成的 Slidev 文稿自己的样式 `render-slides/src/deck/style.css` 中，对任何主题都有效）在编辑器高过 15em 时于其中滚动，输出区高过 7.5em 时滚动，所以长代码不再靠幻灯片的 `zoom` 缩小（示例讲义的 `extend-c`、`extend-train` 去掉了 `zoom`）。
- **导出**：`presmium-export` 与 `presmium-diff` 写的导出文稿带渲染端选项 `renderers.slides.liveCode: false`：可运行的代码写成静态的高亮代码加录制输出，不写 `{monaco-run}`；打印时每张幻灯片裁到自己的页面，一张溢出的幻灯片不再缩小整份 PDF；`--range` 的页数与 PDF 不符时以 2 退出（此前只是警告）。打印模式下的现场代码在每一页（含点击的各步）显示录制的输出。
- **本地环境插件**：回写删去，没有提交按钮与路由，状态中不再有 `git`；端点改为服务端路由 `/__presmium/presmium.execLocal/{status,run,replicate}`，只给编辑者，运行先经 `operate` 确认（测试与 `presmium dev` 用 `--allow operate`）；默认的工作区是工作区根目录而不是 git 的根目录；容器的运行目录在一个私有（0700）的父目录中，文件以独占方式新建，从不经链接。插件只声明 `exec` 与 `fs` 两种能力。
- **高对比度**：高对比度开关把滚动叙事中淡化的讲解的不透明度提到 0.6，网页的放映与滚动叙事视图同样达到 AA（`e2e/publish.spec.ts`）。
- **离开页面时关闭 Jupyter 终端**；**浏览器中没有 GPU**：Pyodide 中抛出 `GPUUnavailable` 的 Python 按没能进行的运行处理，说明“没有可用的 GPU 适配器”，不显示回溯。
- **离线**：网页的 Service Worker 安装时只预缓存外壳与内容；`pyodide/`、`wasi/` 与 `presmium/jax-js/`（许可证文件除外）放在自己的缓存 `presmium-web-runtimes-<哈希>` 中，第一次使用时缓存、之后优先取缓存，运行时不变的构建之间保留；发布插件的工具栏“保存以便离线使用”（`OFFLINE_MESSAGES`：`presmium:offline-runtimes`、`presmium:save-offline`）在 Service Worker 应答之后出现，一次下载全部运行时。幻灯片照旧预缓存全部文件。

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
  /** 发起请求的成员：本机作者（`owner`，`LOCAL_AUTHOR`），`presmium dev` 与 `presmium serve` 都是 */
  member: Member
  /** 请求所属文档的目录，相对于工作区根目录；`presmium dev` 中为 '' */
  document: string
  /** `/*` 路由中路由键之后的路径（不以 `/` 开头）；其他路由为 '' */
  rest: string
}

export type RouteHandler = (request: Request, ctx: RequestContext) => Response | Promise<Response>

export interface Route {
  /** 能调用的最低角色，默认 `editor`；学习者可用的路由写 `reader`（10.3 节） */
  role?: MemberRole
  handle: RouteHandler
  /**
   * 能接受的最大请求体（字节），默认 1 MiB（`MAX_BODY`）。`Content-Length` 超过时服务端在处理函数运行之前
   * 回答 413，分块传输的请求体读到上限即截断并回答 413。413 不带 `Connection: close`：
   * 服务端读完并丢弃多出的请求体再关闭（RFC 9112 9.6），客户端读得到 413 而不是连接被重置；无尽的请求体片刻之后被断开
   */
  maxBody?: number
}

/** 路由默认接受的请求体：1 MiB */
export const MAX_BODY = 1 << 20

/** JSON 回答，带 `Cache-Control: no-store`；`problem(status, message)` 是 `{ error: message }` 的错误回答 */
export function json(data: unknown, status?: number, headers?: Record<string, string>): Response

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
  /** Node 端服务：插件的 `services`，以及服务端的 `APPROVALS`、`MCP_ENDPOINT`，工作区的 `REVISIONS`、`DOCUMENT_FILES`、`DOCUMENT_LOCKS` */
  service<T>(token: ServiceToken<T>): T | undefined
  /** 服务端进程的环境变量，同 `NodeServiceContext.secret` */
  secret(name: string): string | undefined
  /** 同 `NodeServiceContext.operatorDir`：运营者目录的绝对路径 */
  operatorDir?: string
  /** `presmium serve` 的工作区首页，不是文档：`deckDir` 与 `workspaceRoot` 是工作区之外的一个空目录，插件在那里只回答不需要文档的请求 */
  home?: boolean
  log: Logger
}

export type ApprovalKind = 'operate' | 'spend' | 'write' | 'agent'

/**
 * 确认的范围，决定谁能回答（10.4 节）。`content`：只涉及发起成员自己的文档与会话
 * （任务的文档目录中的文件、MCP 的操作类与计费类工具），发给 `member`；
 * `workspace`：工作区配置 `presmium.workspace.yaml`（确认策略、运营者设置）、同意记录、
 * 文档目录之外的任何路径、agent 的 shell 与网络权限请求，只发给所有者（本机作者就是所有者）
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

/** MCP 令牌签发时的模式：`author`，可以写源码；每个令牌都读完整的文稿 */
export type AgentMode = 'author'

/** 一个 agent 会话访问本进程 MCP 端点的凭证 */
export interface McpAccess {
  /** 本进程的 `/mcp`：服务端的本机地址（agent 子进程与服务端在同一台机器上） */
  url: string
  /** `Authorization: Bearer` 令牌，绑定成员与模式；工具的范围由它决定 */
  token: string
}

export interface McpGrant extends McpAccess {
  /** 作废令牌；会话关闭时调用，之后用它的请求得到 401 */
  revoke(): void
}

export interface McpEndpoint {
  /** 为一位成员与一种模式签发令牌：成员的角色决定有哪些工具（读者只有读取类工具） */
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

/** 由工作区的浏览器插件提供（`presmium serve`，与 的 `presmium dev`）；静态产物中没有 */
export const EDIT_MODE = defineService<EditMode>('presmium.editMode')
```

`packages/host/src/kernel.ts`（`HostStart` 定义在这里，由 `index.ts` 再导出）：

```ts
export interface HostStart {
  // ……已有字段（`environments` 见 4.6 节）……
  server?: ServerClient
}
```

宿主层的实现：`useServer()` 返回一个始终可用的代理，读它的 `available` 是响应式的，宿主适配给出客户端之前渲染的组件在之后自动更新；宿主适配经 `startHost({ server })` 给出客户端，也可以更早调用 `provideServer(client)`（网页形态在创建应用时调用）。`createServerClient({ document })` 是两种形态共用的客户端：请求头 `Presmium-Document` 的值是 URI 编码的文档目录（请求头只能是 Latin-1），`EventSource` 不能带请求头，所以 `events()` 把文档目录放在查询参数 `document` 中。网页形态在 `presmium dev` 中由生成的 VitePress 配置写 `themeConfig.presmium.server`，幻灯片形态由生成的 Slidev 头部写 `presmiumServer: true`，两者据此创建客户端；静态构建两者都没有。有服务端时 `startHost` 在工具栏登记确认入口 `PmApprovals`（`@presmium/host` 导出），并连接控制通道（10.4 节）。

服务端怎样挂载这些契约、怎样认证与确认，见第 10 节。`settings` 与 `config` 的区别：`config` 是文稿头部的内容，任何能编辑文稿的人（包括 agent）都能改；`settings` 只由运营者设置，确认策略之外的安全相关设置（工作区的插件列表、agent 的替换命令与模型的服务提供方、修改的审阅、编译时执行传入的环境变量、录音的去处、是否允许克隆音色、同意记录的目录）都在这里或在环境变量中（第 11 节）。插件在本进程中经 `secret` 读取凭据。

### 4.8 语音、智能体与修改历史

> **工作台**：`AGENT_RUNTIME` 的 ACP 实现、`AGENT` 的浏览器客户端与“AI 修改”的任务流程属于旧工作台，1.0 中为实验性，随旧工作台删去；`Annotation` 与 `AgentContext` 增加 `focus`，`MCP_ENDPOINT.issue` 增加会话令牌（主机已确认的模式，第 13 节）。语音与修改历史的契约不变。

`packages/kernel/src/contracts.ts`：

```ts
// 语音---------------------------------------------------------

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
   * 服务提供方的名字，界面据此标明。来自运营者的配置，在任何请求之前就已知：
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
   * 中有本人的同意记录时可以合成；文稿目录中的记录不算
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
  /** 运营者定义了、因而可用的引擎：地址与凭据成对出现在本进程的环境变量中 */
  engines(): Promise<SpeechEngineInfo[]>
  voices(engine: string, lang?: string): Promise<VoiceInfo[]>
  /**
   * 先查合成缓存，命中时不发请求；缺失时调用引擎，在音频的元数据中加入 AI 生成的标识后写入缓存。
   * 引擎不可用时、克隆音色没有开启或没有有效的同意记录时拒绝（抛出带原因的错误）
   */
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<Synthesis>
  /**
   * 按键取合成缓存中的一个片段，与 `synthesize` 命中缓存时一样检查音色：克隆音色要有开启的设置与有效的同意记录。
   * 不请引擎合成：缓存没有这个键时为 undefined，音色不能用时拒绝。Node 端的服务有它（讲授的片段按键给出与发布）
   */
  cached?(key: string, signal?: AbortSignal): Promise<Synthesis | undefined>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
}

export const SPEECH = defineService<SpeechService>('presmium.speech')

// 智能体-------------------------------------------------

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
 * 修改任务（`chat` 也用于起草新文档），助手按同一条规则处理：一文档一任务、结束时经 `REVISIONS` 提交一次、
 * 可以撤销、超出范围的写入经确认。读者问答不是服务端的任务：页面直接问读者自己的模型服务（`ASK`）
 */
export type AgentTaskKind = 'annotations' | 'chat' | 'transcript'

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
  /** 对话消息或整体要求 */
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
  /**
   * 任务 `done` 之后撤销它的提交：经 `REVISIONS` 的 `git revert`，或给出冲突的文件、不提交。
   * 不能撤销时（任务没有提交、这份文档有进行中的修改任务）以服务端的原因抛错（
   * 浏览器端经助手自己的 `revert` 路由实现）
   */
  revert(): Promise<TaskRevertResult>
}

export type TaskRevertResult = { ok: true, revision: string } | { ok: false, conflicts: string[] }

/** 浏览器端：页面向服务端的助手提交任务 */
export interface AgentClient {
  /** 服务端有 agent 运行时（运营者配置了模型访问，或给出了替换的运行时），且当前成员可以提交这类任务 */
  available(kind: AgentTaskKind): boolean
  /** 模型的服务提供方，如 `DeepSeek`，来自运营者的设置；修改的面板据此标明。不可用时为 undefined */
  provider(): string | undefined
  /** agent 运行时的名字与版本（`AgentRuntime.runtime`），与服务提供方分开显示；agent 启动之前为 undefined */
  runtime(): string | undefined
  submit(request: AgentTaskRequest): AgentTask
}

export const AGENT = defineService<AgentClient>('presmium.agent')

/**
 * 浏览器端：读者自己填写的模型服务，由页面直接请求，从不经站点的服务端：
 * OpenAI 兼容的 Chat Completions，地址、密钥与模型名保存在本站点的浏览器存储中。助手在每个页面上提供它，
 * 静态产物也有；课堂的“AI 回答”用主讲自己的设置
 */
export interface AskClient {
  /** 面板标明的服务提供方，取自地址；读者填写之前为 undefined */
  provider(): string | undefined
  /**
   * 就文稿提问：上下文是位置（`section`、`step`、`block`、选中的文字），页面另加上那里显示的内容（这一节的文字、
   * 章节目录）。回答边生成边逐段给出，引用写作 `[标签](presmium://sections/<章节 ID>)`；出错时抛出服务给的原因；
   * `signal` 中止时结束
   */
  ask(question: string, context: AgentContext, signal?: AbortSignal): AsyncIterable<string>
}

export const ASK = defineService<AskClient>('presmium.ask')

export interface AgentSessionOptions {
  /**
   * ACP `session/new` 的 `cwd`，也是 agent 文件工具可写的根目录：`ChangeReview.root`
   * （文档目录，或它的 deltabox 视图）。写到它之外经 agent 的权限请求，属于 `workspace` 范围
   */
  cwd: string
  member: Member
  /**
   * Presmium 的 MCP 服务，写进 ACP `session/new` 的 `mcpServers`（HTTP 方式，带 `Authorization` 头）。
   * 调用方经 `MCP_ENDPOINT.issue(member, 'author')` 取得，会话关闭后 `revoke`；省略时 agent 没有 Presmium 的工具
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

/**
 * Node 端：驱动一个 agent；唯一的实现是 ACP 客户端。运行时用运营者给出的模型凭据：本进程的环境变量，或页面中的
 * 模型设置（保存后下一个会话即用，不必重启；随包的 DeepSeek Harness 怎样得到它们见下文“agent 的启用”）
 */
export interface AgentRuntime {
  /**
   * 模型的服务提供方，启动前就已知：随包的 DeepSeek Harness 取自运营者配置的模型访问（`DEEPSEEK_API_KEY` 为
   * `DeepSeek`，`PRESMIUM_MODEL_PROVIDER`，或页面的模型设置）；替换的运行时取
   * `settings.presmium.assistant.provider` 或 `PRESMIUM_AGENT_PROVIDER`。都没有配置时为 undefined，`open` 失败
   */
  readonly provider: string | undefined
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

// 修改审阅---------------------------------------------------------

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
   * 回到某一步之前：文档目录回到 `stepId` 之前那个检查点（第一步时为任务开始时的快照），
   * 这一步与之后的各步从 `steps()` 中去掉，审阅继续。可选：没有它的实现不提供回到某一步之前
   */
  restoreTo?(stepId: string): Promise<void>
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

/** Node 端服务：`addon-deltabox` 在主机满足条件时登记（10.7 节） */
export const CHANGE_REVIEW = defineService<ChangeReviewService>('presmium.changeReview')

// 修改历史----------------------------------------------------------

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

// 写文档的文件---------------------------------------------------------

/**
 * 文档目录中一个文件将成为的样子：内容、符号链接，或删除。路径相对于工作区根目录。
 * 有 `at` 时内容写在文件的这个字节位置，文件的其他字节不变（分段上传的录制）；文件不在时新建，
 * 那里是链接时先换成空文件
 */
export type DocumentFileChange =
  | { path: string, content: Uint8Array, executable?: boolean, at?: number }
  | { path: string, link: string }
  | { path: string, remove: true }

/**
 * 写文档目录中的文件（10.2 节）：路径都在某个文档目录之中；途中的符号链接被替换，从不被跟随；
 * 删除留下的空目录随之删除，直到文档目录
 */
export interface DocumentFiles {
  write(changes: DocumentFileChange[]): Promise<void>
}

/**
 * Node 端服务：`presmium serve` 与 `presmium dev` 中由工作区登记（被 git 忽略、在另一个仓库中的文稿除外：
 * 它的工作区根目录不是编辑器的）。插件写自己文稿的文件时，宿主有它就经它写
 * （`ServerContext.service`、`NodeServiceContext.service`、`PassContext.service`），没有时（`presmium build` 与上面除外的文稿）才在本进程中写
 */
export const DOCUMENT_FILES = defineService<DocumentFiles>('presmium.documentFiles')

/** 一份文档同一时间只有一个写入方：文档操作（重命名、复制、删除）、修改历史的撤销或 agent 的修改任务（） */
export interface DocumentLockService {
  /** 以 `holder`（如 `agent:<任务 ID>`、`document:rename`）取得文档的锁：返回释放它的函数；别人持有时为 undefined */
  claim(document: string, holder: string): (() => void) | undefined
  holder(document: string): string | undefined
}

/**
 * Node 端服务：`presmium serve` 与 `presmium dev` 由工作区提供，文档操作、撤销、源码编辑器的保存与助手的修改任务经它加锁
 * （持锁文档的操作得到 409）；`presmium dev` 中插件称文稿为 `''`（它的文档）。没有它时助手用自己的表
 */
export const DOCUMENT_LOCKS = defineService<DocumentLockService>('presmium.documentLocks')
```

要点：

- 提交说明的格式：第一行是摘要；正文列出批注（或对话摘要）与 agent 的说明；尾注 `Presmium-Task: <任务 ID>`、`Presmium-Origin: agent|document|editor` 与 `Co-authored-by`（发起人）。作者字段取发起的成员（本机作者）。修改历史按尾注筛选，所以不依赖服务端的数据库。工作区的 git 命令都关闭钩子与 fsmonitor（`-c core.hooksPath=/dev/null -c core.fsmonitor=false`），提交与撤销不执行仓库中的任何脚本。
- 语音的 `lang` 是 BCP 47 标签而不是界面语言 `Locale`：文稿可以是 Presmium 界面没有翻译的语言，语音引擎照样支持。
- **agent 的启用与 MCP 访问**：DeepSeek Harness 是助手插件的依赖（精确固定的版本），运营者配置了模型访问时助手就以子进程启动它（ACP over stdio，随包的配置模板关闭会话日志上传与遥测，并以 `DSH_TELEMETRY_MODE=DISABLED` 启动），不需要另外安装或给出命令。模型访问是 `DEEPSEEK_API_KEY`（DeepSeek 的官方地址，服务提供方为 `DeepSeek`），或运营者定义的 Messages 兼容服务 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 与 `PRESMIUM_MODEL_PROVIDER`（三者都要有，凭据只发往这个地址；设置了它们时优先于 `DEEPSEEK_API_KEY`）。随包的 DeepSeek Harness 的环境是助手进程的环境去掉全部 `PRESMIUM_` 开头的变量与 `DEEPSEEK_BASE_URL` 之后，加上模型访问与 `DSH_TELEMETRY_MODE=DISABLED`：`DEEPSEEK_API_KEY` 原样传入，不设 `DEEPSEEK_BASE_URL`（DeepSeek Harness 因此只连 DeepSeek 的官方地址）；`PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 改名为 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY` 传入（DeepSeek Harness 读这两个变量，它的 DeepSeek 适配说 Messages 协议）。`PRESMIUM_AGENT_COMMAND` 或 `settings.presmium.assistant.command` 只用来替换运行时（Claude、Codex、Gemini 的 ACP 适配），这时服务提供方取 `PRESMIUM_AGENT_PROVIDER` 或 `settings.presmium.assistant.provider`，运行时用它自己在环境中的凭据。模型访问也可以在页面的“模型设置”中填写（见下文）。优先顺序：替换的运行时（环境变量先于工作区设置），然后是环境变量中的模型访问，最后是页面的模型设置；页面因此改不了运营者启动进程时给出的设置。三者都没有，或替换的运行时没有服务提供方时，`AGENT_RUNTIME.provider` 为 undefined，`AGENT.available()` 为 false，不启动任何进程，`info` 的 `missing` 与启动日志说明缺少的设置（显式开启）。`missing`（`MissingItem`，`src/domain/config.ts`）是代码与参数，页面按代码给出页面语言的说明（`src/client/messages.ts` 的 `missingText`），不按英文句子匹配：`{ code: 'model', variables? }` 没有模型访问（`variables` 是只设置了一部分的 `PRESMIUM_MODEL_*` 中缺少的变量名），`{ code: 'provider' }` 替换的运行时没有服务提供方，`{ code: 'harness' }` 有模型访问但随包的 DeepSeek Harness 没有安装；启动日志与错误中的英文由 `missingSentence` 给出。用例：`packages/addon-assistant/test/acp.test.ts`（服务端：每个代码一个），`e2e/assistant.spec.ts`（页面：没有模型时的 `model`；再让 `info` 依次回答 `model` 及缺少的 `variables`、`provider`、`harness`，每个代码的中文与英文说明）。助手的服务端路由为每个 agent 会话调用 `ctx.service(MCP_ENDPOINT).issue(member, 'author')`，把得到的 `McpAccess` 放进 `AgentSessionOptions.mcp`，会话关闭时 `revoke`。
- **模型设置**：工作区服务与 `presmium dev` 的页面可以填写助手的模型：服务提供方、地址（留空为 DeepSeek 的官方地址，或 Messages 兼容服务的地址，这时要写服务提供方）、密钥、模型名（没有时用固定版本的 DeepSeek Harness 的默认模型）。路由 `settings`（只给所有者）：`GET` 给出当前生效的来源（`source`：`environment`、`workspace`、`page` 或 `none`）、服务提供方、生效的变量名（`from`）、缺少什么（`missing`）、页面保存的设置（`saved`，密钥只给出是否已设置）与文件的路径；`POST`（`{ provider?,url?,key?,model? }`，每项至多 2000 字，地址要是 http(s)，模型名只含模型 ID 的字符）写到用户配置目录的 `$XDG_CONFIG_HOME/presmium/assistant.json`（没有时 `~/.config/presmium/`；文件 0600，目录 0700，先写临时文件再改名），不进工作区与文稿；`DELETE` 删去它。保存时不带密钥的，只在服务提供方与地址都没变时保留已存的密钥，换了服务或地址就要新的密钥（缺少时 400），所以一个服务的密钥不会发往另一个服务。助手每次启动 agent 时重新读这个文件，所以保存后下一个会话就用新设置，不重启服务；随包的 DeepSeek Harness 经 `DSH_PRESMIUM_MODEL` 与模板的 `acp` 一行得到模型名。页面只显示密钥是否已设置，从不回显密钥，并写明当前生效的来源；环境变量优先。读者问答的浏览器端设置与它分开（见下文“读者问答”）。
- **“AI 修改”的入口与启动时的状态行**：工具栏的“AI 修改”出现在服务提供的每个页面上（`presmium serve` 的文档与首页、`presmium dev`），不论是否配置了模型：在提交修改的文档上（`presmium serve` 的文档，或 git 仓库中的 `presmium dev` 的文稿）它打开编辑模式与批注、对话面板；别处或没有模型时它说明缺少什么（要设置的环境变量并重启，或模型设置）与 AI 修改怎样进行（不在 git 仓库中的文稿：修改要提交到 git，先 `git init` 再重新启动），模型设置从这里以对话框打开。`GET info` 回答 `{ provider?, runtime?, source?, missing?, kinds, changes, home? }`：`source` 是生效的来源，`missing` 是不可用时缺少的设置（代码与参数，见上文），`changes` 表示这里提交修改（有 `REVISIONS`：文稿在 git 仓库中，`presmium serve` 与 `presmium dev` 都是），`home` 表示首页（不是文档）。助手的 Node 部分加载时在日志中写一行状态：可用时写服务提供方、运行时与来源（`the assistant is available: provider <服务提供方>,<运行时> (from <变量或页面的模型设置>)`），不可用时写缺少的设置，每个进程一次。工作区把助手列为运营者插件时（`templates/workspace`、`examples/workspace` 都这样写），首页加载它，状态行在 `presmium serve` 启动时打印；单份文稿的仓库在启动时就编译它的文档（同 `presmium dev`），所以状态行同样在启动时打印，不等第一次打开文档。
- **读者问答**：提问在浏览器中完成，不经站点的服务端，静态站点也能用。助手在每个页面上提供浏览器服务 `ASK`（`src/client/ask.ts`）：读者在“提问”面板中填写自己的 OpenAI 兼容服务（地址、密钥、模型名），保存在本站点的 `localStorage`（键 `presmium.assistant.ask`；存储被禁用时只在这个页面中有效）；面板写明同一站点的脚本能读到密钥，填写之后在提问之前写明服务（地址的主机）与模型。提问以流式的 `POST <地址>/chat/completions` 直接发往这个服务，请求不带站点的 Cookie 与来源（`credentials: 'omit'`、`referrerPolicy: 'no-referrer'`）。上下文取自页面：网页形态是页面中文档的 IR（学生版站点的 IR 本来就没有教师内容），给出当前章节的讲解与块的文字、选中的文字，以及章节目录（ID 与标题）供回答引用；幻灯片形态没有 IR 运行时，给出当前一页的文字（Slidev 文档化的 `.slidev-page-<页>` 类），引用只到它所在的页。回答边生成边显示，引用 `[标签](presmium://sections/<章节>)` 是能点的链接。没有填写时面板说明提问怎样进行并请读者填写。
- **修改任务**：`annotations`、`chat`（含起草）与 `transcript` 由助手按同一条规则处理：同一文档一次一个；开始时打开一个审阅（`CHANGE_REVIEW`，没有时或 agent 是随包的 DeepSeek Harness 时用助手内置的 git 实现，10.7 节、9.5 节），agent 的工作目录是审阅的 `root`；每个工具调用完成时记一个检查点（`step` 事件）；结束时按运营者设置 `settings.presmium.assistant.review` 处理：`required`（默认）发出 `review` 事件，等发起人逐个文件查看差异后全部接受、全部拒绝或拒绝某些文件，接受时提交为一个修改（说明列出批注、对话摘要或讲授轨 ID，与 agent 的说明）；`auto` 直接全部接受并提交（审阅之前的行为）。接受之后的撤销仍是 `git revert`。提交任务的一方（编辑模式的面板、工作区的新建表单、讲授面板）只构造请求。工作区的新建表单提交起草任务后留在首页跟随它的事件：显示进度，`review` 事件时列出改动的文件并给出接受与拒绝（`AgentTask.review`），任务以 `done` 结束（起草已提交）之后才打开新文档；`error` 时显示原因与新文档的链接（先前提交任务后立即跳转，页面离开后任务的事件与审阅无人接收）。
- **确认的范围**：agent 的文件工具以审阅的 `root`（文档目录）为可写的根目录，写到它之外由 agent 发出权限请求。助手把 agent 的权限请求按 `ApprovalScope` 分类（10.4 节）：编辑任务的文档目录中的文件属于 `content`，由发起任务的成员确认，而修改任务的发送就是这类写入的确认，所以助手直接允许，不再逐次询问；shell、网络与文档目录之外的路径属于 `workspace`，只有所有者能允许（本机作者就是所有者，10.4 节）；对运营者目录（10.5 节）的请求一律拒绝，不发给任何人。
- **agent 的工具**：agent 用模板 `presmium`：保留 shell，沙箱为 `workspace-write`（根目录是审阅的 `root`），权限策略为询问。
- **服务提供方的标明**：批注与对话的面板写明 `AGENT.provider()`，另写明运行时 `AGENT.runtime()`（已知时）；读者的提问面板写明 `ASK.provider()`（读者填写的地址的主机）与模型；转写与合成的入口写明引擎的 `SpeechEngineInfo.provider`；本机引擎（`local: true`）写明不外发。运营者的服务提供方都来自运营者的配置（环境变量或页面的模型设置），界面在第一个请求之前就能显示。
- **讲授插件的 agent 工具**：`lecture_preview`（`read`，可选参数 `section`）给出讲授计划：每节每步要说的文字（与读出的文字不同时另给出）、其中的提示标记（命令、它之前的几个字与操作的数据）、`pause`、音色、`gap` 与问题；`lecture_synthesize`（`spend`）以文稿的音色合成讲授（缓存缺的片段才发给引擎），返回时长、语音段与事件的数目；`track_transcribe`（`spend`，参数 `track`）转写一份录制的讲授并写回它的 `track.json`，返回服务提供方与语音段。工具经讲授插件自己的 Node 服务 `presmium.lecture.deck`（文稿目录）找到文稿，按最近一次编译的 IR 计划；两个 `spend` 工具由 MCP 先经 `APPROVALS` 确认（`packages/addon-lecture/src/node/tools.ts`）。转写回写另有两个 `read` 工具：`track_narration`（参数 `track`、可选 `section`）给出录制讲授的逐字稿按章节与步骤拼成的讲解草稿，绑定到字的操作在那个字之前写成 `{cue}`，并给出每一步讲解在源码中的位置；`track_translations`（参数 `track`、`lang`）给出每句的原文与译文要记下的摘要（`ir.md` 9.5 节）。它们不写文件：写入由修改任务中的 agent 完成，所以在审阅之中。
- 助手插件 `@presmium/slidev-addon-assistant`（插件 ID `presmium.assistant`，`operator: true`：列在 `settings.presmium.workspace.plugins` 中时每份文档都加载它的 Node 部分；浏览器部分照旧只在文稿的 `plugins` 列出它时加载）。
  - **Node 端**（`src/node/`）：`services.ts` 按 `runtimeChoice` 登记 `AGENT_RUNTIME`（`src/domain/config.ts`；替换命令先于模型访问，环境变量先于设置，命令按空白与引号切分，不经 shell）。`runtime.ts` 是 ACP 客户端（`@agentclientprotocol/sdk` 1.8.0 的 `client()`、`connect()`）：每个会话一个 agent 进程（`node <dsh>/lib/bin.js --profile acp --patch <模板>`，或替换命令），`initialize` 的 `agentInfo`（`title` 或 `name` 加 `version`）成为 `runtime`，`session/new` 的 `cwd` 为 `AgentSessionOptions.cwd`，`mcpServers` 为一个 HTTP 项 `presmium`（`Authorization: Bearer <令牌>`）；提示是一段文字（`src/domain/prompt.ts`：读文稿的 MCP 工具、引用的写法、一行 `presmium-context:` 的 JSON 上下文、问题），要求按文稿的 `lang` 回答；`agent_message_chunk` 累积到下一个工具调用或提示结束时成为一个 `message` 事件，其中的 `[标签](presmium://sections/<章节>[/steps/<步>][#<块>])` 解析为 `citations`（`src/domain/citations.ts`）；`tool_call` 与 `tool_call_update`（`completed`、`failed`）成为带 `call` 的 `progress` 事件；`session/cancel` 在任务的 `AbortSignal` 中止时发出；关闭时先 `session/close`（agent 声明支持时，至多 3 秒），再关闭标准输入，3 秒后 `SIGTERM`，6 秒后 `SIGKILL`。同一个 `DSH_HOME` 的第一个 DeepSeek Harness 独自完成 profile 的初始化，其余的等它。权限请求：DeepSeek Harness 的 `session/request_permission` 只带工具调用的 ID，助手以它先前在 `tool_call` 中报告的标题、种类、输入与位置分类（`permissions.ts`）：有路径的文件工具在 `cwd` 之内为 `content`（`write`），之外为 `workspace`（`write`），运营者目录之内直接拒绝；shell（`bash`、`execute` 种类或带 `command` 的输入）、网络（`web_*`、`fetch` 种类或带 `url` 的输入）与其他工具为 `workspace`（`agent`）；只选一次性的选项（`allow_once`、`reject_once`）。
  - **启动与环境**（`launch.ts`）：DeepSeek Harness 从本包的依赖解析（`@deepseek-ai/dsh` 0.2.1-alpha.4，`bin.dsh`）。它的 `DSH_HOME` 是 Presmium 自己的 `${XDG_STATE_HOME:-~/.local/state}/presmium/dsh`：用户自己的 `~/.dsh` 中的补丁（可能重新打开会话日志上传或遥测）与存储的凭据（DeepSeek Harness 中它们先于环境变量，会把用户的官方密钥发往 `PRESMIUM_MODEL_URL`）都不生效。随包的运行时：进程的环境去掉 `PRESMIUM_*`、`DSH_*`、`DEEPSEEK_BASE_URL` 与 `DEEPSEEK_SEARCH_BASE_URL`，加上模型访问、`DSH_TELEMETRY_MODE=DISABLED` 与 `DSH_HOME`；用 `PRESMIUM_MODEL_*` 时另设 `DEEPSEEK_SEARCH_BASE_URL=<PRESMIUM_MODEL_URL>/v1`：DeepSeek Harness 的网页搜索带着同一个 `DEEPSEEK_API_KEY` 访问自己的地址（默认 DeepSeek 的官方地址，只读 `DEEPSEEK_SEARCH_BASE_URL`），不设时运营者服务的密钥会发往 DeepSeek（实测）。替换的运行时：进程的环境去掉 `PRESMIUM_*` 与 `DEEPSEEK_BASE_URL`。
  - **服务端路由**（`server.ts`，`role: reader`）：`GET info`（上文“AI 修改”的入口）、`POST tasks`（请求体是 `AgentTaskRequest` 加页面取的 `id`；上下文的 `document` 以请求所属的文档为准；修改任务见下文“实现”）、`GET tasks/<id>/events`（SSE，每次连接从第一个事件发起，只给提交任务的成员与所有者）、`POST tasks/<id>/cancel`；`settings`（所有者，上文“模型设置”）。终止事件（`done` 或 `error`）在 MCP 令牌作废、会话关闭之后才发出；取消的任务以 `done` 结束。修改任务的权限请求中 `content` 范围的直接允许（发送即确认），其余以 `agent:<任务 ID>` 的名义交给 `APPROVALS` 并发出 `approval` 事件。
  - **浏览器端**（`src/client/`）：`plugin.ts` 在每个页面上提供 `ASK`，在服务端可用时另提供 `AGENT`（`agent.ts`：`info` 在启动时与每个任务结束后取得，所以运行时在第一次回答之后显示；`submit` 在页面中取任务 ID，事件经 `EventSource` 读取，重连时跳过已收到的）；在工具栏登记“提问”（`presmium.assistant`，`AssistantToolbar.vue`，首页不显示）与“AI 修改”（`presmium.assistant.edit`，`EditPanel.vue` 与模型设置的对话框 `ModelSettings.vue`，只在服务提供的页面上），在演讲者面板登记同一个提问面板（`AskPanel.vue`）；读者在文稿的章节中选中的文字（`selectionchange`，记下所在的 `data-section` 与 `data-block`）随问题一起发出。`viewer.ts`（网页形态的视图插件）让引用以 IR 运行时的 `show` 跳到章节与步骤（文档视图中跳到它所在的页面）；幻灯片形态中引用跳到章节所在的页，`setup/main.ts` 注册同一个插件（演讲者面板中的提问）。
  - **课堂中的 AI 回答**（`addon-classroom/src/client/ai.ts`）：主讲的“互动”总览中每个提问有“AI 回答（<服务提供方>）”，经 `ASK` 问主讲自己在提问面板中填写的服务（没有填写时总览请主讲先填写）；回答是主讲窗口中的草稿，主讲点“发给课堂”后写成提问的 `reply`（`{ text,provider,at }`；引用改为其标签的纯文字），学习者在自己的提问下看到它。
- 修改任务（`annotations`、`chat` 与起草、`transcript`）在助手插件中，同一条规则（`src/node/changes.ts`）。
  - **路由**：`GET info` 的 `kinds` 对编辑者与所有者另有 `annotations`、`chat`、`transcript`，条件是服务端有 `REVISIONS`（`presmium serve`，与文稿在 git 仓库中的 `presmium dev`；没有时修改任务得到 501，读者得到 403）。`POST tasks` 的修改任务一文档一个：同一文档已有进行中或等待审阅的修改任务时得到 409 与原因；`annotations` 要有 1 至 50 条批注（`id`、`section`、`block`、`source`、`excerpt`、`request`），`transcript` 要有 `track` 且文档中有 `lectures/<track>/track.json`（否则 400）。`POST tasks/<id>/review`（`ReviewDecision`，只有发起人与所有者）回答 `review` 事件，没有待审阅时 409。`POST revert`（`{ task }`，编辑者）按尾注找到这个任务尚未撤销的提交，经 `REVISIONS.revert` 撤销，冲突时 409 与 `{ ok: false, conflicts }`。`GET excerpt?file=&start=&end=`（编辑者）读文档目录中一个文件的几行（至多 60 行、4000 字，真实路径在文档目录之内），作为批注的摘录。
  - **流程**：打开审阅（`CHANGE_REVIEW` 的 `open({ document, task, member })`；没有时是工作区服务的 git 审阅（由服务作为 `CHANGE_REVIEW` 的退路提供，13.4 节）；agent 是随包的 DeepSeek Harness 时（没有替换的运行时）总用工作区的 git 审阅 `GIT_REVIEW`：它的写入使 deltabox-lite 0.1.1 的审阅出错，9.5 节；服务端有 `CHANGE_REVIEW` 时启动日志写明这一点），批注逐条发出 `annotation`（`sent`）；agent 的会话以 `author` 模式、`cwd` 为审阅的 `root`；每个 `progress` 为 `completed` 的工具调用之后 `step`，发出 `step` 事件；agent 结束后按回答中的 `presmium-annotation <id>: <说明>`（或 `… <id> failed: <原因>`）发出各批注的 `done`（或 `failed`）与说明；没有改动时直接 `done`。`review: required`（默认）发出 `review { engine, changes, steps }` 等发起人决定，`auto` 直接全部接受。接受：审阅中有工作区根目录的 `presmium.workspace.yaml`（只有单份文稿的仓库的文档目录包含它）且没有被拒绝时，先以 `agent:<任务>` 的名义请求 `write`、`workspace` 范围的确认（只发给所有者），没有允许时把它加入拒绝（等待所有者时任务被取消或服务端关闭则回滚，不提交）；`accept(reject)` 之后，留下的文件与所有者允许的、文档目录之外（工作区之内、不在 `.git/` 中）的写入一起经 `REVISIONS.commit` 提交（`origin: { kind: 'agent',task,member }`），`done { revision }`。全部拒绝、取消、失败或服务端关闭（`ServerContribution.close` 中止全部任务并等它们回滚）时 `rollback`，批注变为 `failed`。提交说明按文稿语言：第一行是“批注修改：处理 N 条批注”“对话修改：<消息>”“起草：<要求>”（上下文只有文档的 `chat`）或“转写回写：讲授轨 <ID>”，正文列出批注（文件与行、章节与块、要求与 agent 的说明）、对话消息或讲授轨与它的文件，再列出 agent 的说明（去掉批注的报告行）。
  - **权限请求**：`classify` 给写入的确认附上绝对路径（`AgentApproval.path`，不是契约的字段，交给 `APPROVALS` 之前去掉），所有者允许的写入记在任务上，接受时一并提交。工作目录之内 `.git/` 中的写入（单份文稿的仓库中文档目录就是仓库的根目录）属于 `workspace`：git 不跟踪它，审阅中看不到，git 会执行其中的配置与钩子。随包的 DeepSeek Harness 在工作目录之内写入不发权限请求（它的 `workspace-write` 沙箱允许），所以 git 审阅另外看守仓库的 git 目录（10.7 节）。
  - **提示**（`src/domain/prompt.ts`）：修改任务说明只改工作目录中的源码、保留头部；批注以一行 `presmium-annotations: <JSON>`（`id`、`section`、`block`、`file`、`startLine`、`endLine`、`excerpt`、`request`）给出，并要求每条批注一行报告；`transcript` 给出讲授轨的 ID 与 `lectures/<ID>/track.json`；起草要求在 `lecture.md` 中写出全篇。
  - **浏览器端**：`AGENT.submit` 在请求的上下文写明文档（如工作区新建表单起草的新文档）时把任务发往那份文档的路由（`@presmium/host` 的 `createServerClient({ document })`），否则发往页面自己的文档。编辑模式（`EDIT_MODE`，工作区的浏览器插件提供；助手插件不在 `requires` 中声明它，两者互相可选依赖会成环）中工具栏的“AI 修改”打开面板（`EditPanel.vue`，`Teleport` 到 `body`）：在页面上点选 `[data-block]`（不含链接、按钮与表单）作为批注的块，源码位置取自 IR 中块的 `source`（经视图插件 `viewer.ts` 的 `block`），摘录取自 `excerpt` 路由；批注与对话两处都写明服务提供方；对话带上当前章节、步骤、选中的文字与块，以及章节的源码行。这个窗口发出的修改任务（`edit.ts`，最新的在前，`ChangeTask.vue`）显示进度与各步、审阅（逐个文件的勾选、统一差异，二进制文件只标出，“全部接受”“接受其余（拒绝 N 个文件）”“全部拒绝”）、提交与“撤销这次修改”。
  - **与设计不同之处**：git 审阅的检查点在收到 `completed` 通知后才写树，紧接着的下一个工具调用的早期写入可能算进这一步。随包的 DeepSeek Harness 的修改任务不用 `CHANGE_REVIEW`，用 git 审阅（9.5 节；上游修复后去掉 `server.ts` 中的这个判断）。

- **集成**：
  - **审阅由服务端保存**：任务记下它的请求，页面跟随它的事件时计数（`tasks.ts`）。`GET tasks` 把文档进行中或等待审阅的修改任务（`PendingChange`：ID、种类、消息、批注、讲授轨、发起人）交给发起人与所有者，编辑模式的面板在页面加载时据此接上它（`edit.ts` 的 `resume`，经 `agent.ts` 的 `pending` 与 `attach`，二者不在契约中），从第一个事件重放，所以审阅、接受与全部拒绝照常可用。等待审阅而没有任何页面跟随的任务在 `settings.presmium.assistant.reviewTimeoutMs`（默认 30 分钟）之后中止，即回滚并释放文档，服务端日志写明。服务端崩溃时留下的 git 审阅在下一个进程挂载这份文档时回滚（10.7 节的记录；由工作区服务在启动时回滚）；deltabox 的由它的辅助进程恢复（10.7 节）。
  - **回到某一步之前**：契约增补可选的 `ChangeReview.restoreTo(stepId)`（）。`POST tasks/<id>/restore`（`{ step }`）只在等待审阅时可用（否则 409，审阅没有这个方法时 501）；回到之后服务端再发一次 `review` 事件（当前的改动与剩下的各步），审阅面板每一步有“回到这一步之前”。决定在回到的过程中到达时等它完成；接受时的改动按当前的审阅重新取得（工作区配置的确认据此判断）。
  - **git 目录与写入范围**：git 目录的看守扩大到 git 借以执行代码或找到配置的全部文件（`git-guard.ts`：git 目录中除对象库（`objects/info/` 除外）、`refs/`、`logs/`、`lfs/`、索引与锁文件之外的一切，含 `commondir`、`gitdir`、`config.worktree`、`HEAD`、`modules/`、`worktrees/` 与 agent 新建的项）；git 审阅的命令另以 `GIT_DIR`、`GIT_COMMON_DIR`、`GIT_WORK_TREE` 固定为打开时的目录（看守恢复之前写下的 `.git/commondir` 也不起作用；改为审阅自己的 git 目录与仓库的对象库，10.7 节）。接受时 git 目录中的改动（deltabox 的审阅会列出它们）一律拒绝。权限请求的范围按真实路径判断（`permissions.ts` 的 `realPath`：最近的已存在的上级目录解析符号链接）：文档目录中指向别处的链接下的文件属于 `workspace`，确认的标题写真实路径，所有者允许的这类写入按真实路径提交。
  - **撤销与修改任务互斥**：`POST revert` 在文档有进行中或等待审阅的修改任务时得到 409；撤销进行中时同一文档的修改任务也得到 409。撤销只找这份文档的提交（`history({ task,document })`）。工作区自己的修改历史撤销与文档操作不经助手，不在这个互斥之内；起它们都经 `DOCUMENT_LOCKS` 加锁：修改任务在运行与等待审阅时持有文档的锁，这时对它的重命名、删除、复制（也作为复制源）与涉及它的撤销得到 409，文档操作或撤销进行时助手拒绝这份文档的新任务。撤销与文档操作之后，serve 经唯一的入口 `documentsChanged({ removed, added })` 关闭被删除文档的会话与确认、卸下它们的服务端贡献（`PresmiumServer.unmount`），并刷新站点的文档列表，所以首页随即列出还原的文档、不再列出撤销掉的文档。修改历史按提交尾注中的来源显示本地化的标签（提交标题本身不变），日期按界面语言格式化。
  - **首页**：工作区首页挂载运营者插件时，助手在首页（文档 `''`：工作区根目录，没有文稿入口）只应答 `info`，`kinds` 为可以发往文档的修改任务；首页上的 `POST tasks`、`revert`、`excerpt` 得到 400（首页不是文档），起草照旧发往新文档的路由。`e2e/assistant-edit.spec.ts` 不再替身。

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

`createOperations()` 是两种宿主共用的实现（`startHost` 提供它与 `STATUS`）：`replay` 调用登记的重放后，`replaying` 保持为 true 到下一个任务，期间同步发生的报告被丢弃。IR 运行时的部分是 `@presmium/viewer` 的 `followOperations(viewer, operations)`：位置或视图变化时同步报告 `go`（数据 `{ section,step,view }`，章节是 ID），重放 `go` 时先切到它的视图（隐藏的演讲者视图除外）再到达位置；网页主题在每次内核启动后接上它。

报告的分工（插件之间不互相引用，词汇是内核的共享契约）：IR 运行时报告 `go`（章节、步骤、视图）；执行插件报告 `run`（块与结果的缓存键）；引导插件报告 `spot`、`hint`；讲授插件自己报告指针 `point`（`elementFromPoint` → 最近的 `[data-block]` → 块内相对坐标，约 20 Hz，简化后保存）与工具栏的激光笔、荧光笔 `ink`。回放某一时刻：`clear()`，再按时间依次 `replay(…, true)` 此前的事件，最后一个事件不快进。

引导插件新增内核插件 `src/client/plugin.ts`（两种形态都登记 `spot`、`hint` 的重放）与视图插件 `src/client/viewer.ts`（放映视图与演讲者窗口中 `s`、`h` 给指针下的块加上或取消聚光、提示并报告）；这种聚光持续到位置离开它的章节或步骤（`span`），由 `NAVIGATION.position` 的同步观察者结束，所以现场、依次重放与跳转后的折叠一致。讲授插件 `@presmium/slidev-addon-lecture`：`src/domain/`（讲授轨的读写与每项一行的格式、`at` 的时刻、章节、漂移分级、块指纹与 IR 哈希、VTT、路径简化、重录一节的拼接）、`src/node/`（服务端路由、检查项 `presmium.lecture`、站点渲染端 `lecture`）、`src/client/`（内核插件登记 `point`、`ink` 的重放；视图 `lecture`；放映视图上的录制与播放两个图层；`SilentClock`、`MediaClock`；Mediabunny 只在 `src/client/media.ts` 中）。与设计不同之处：视图插件只以类型引用 `@presmium/viewer`，拿不到章节上下文（`SECTION_CONTEXT`），自己画不出按步骤显示的幻灯片，所以回放的“真实页面”是放映视图：`lecture` 视图切到放映视图并保留 URL 的 `track` 参数，播放器是放映视图上的图层，重放 `go` 时去掉 `view`。若以后要独立的讲授视图，需要视图插件的上下文提供放映视图的组件或章节上下文（只增加）。`run` 的重放没有 `clear`（`packages/viewer/src/code.ts`），跳回运行之前的时刻时已显示的录制输出不消失。

讲授插件的 `src/domain/` 增加讲解的读法（`narration.ts`：显示与说的两份文字、`{cue}` 的位置、命令与时长）、讲授计划（`plan.ts`：每节每步的段落、在 `pause` 处切开的语音段、提示标记的目标与操作数据，单独的脚本代替所在章节的讲解）、合成的时间线（`synthesis.ts`：`scriptTrack`）、逐字的处理（`words.ts`：分词、把说的文字的逐字时间换回显示的文字、改文字后的重新对齐、换音色后的字锚换算）与讲授轨的编辑（`editing.ts`：转写得到语音段并绑定事件、改一句、换音色重新合成）；`Utterance.clip` 与合成音色的 `provider`。`src/node/` 增加行内角色 `{cue}`、`{say}`（`roles.ts`）、读单独的脚本（`script.ts`）、讲授计划与最近一次编译的 IR（`plan.ts`：编译步骤 `presmium.lecture.keep` 在编译时执行之后记下每个文稿目录的 IR，服务端的路由与 agent 工具由此得到 IR，因为 `ServerContext` 与 `AgentToolContext` 没有编译结果）、经 `SPEECH` 的合成与转写（`speak.ts`、`lecture.ts`：合成缓存中的片段、没有逐字时间时的转写对齐 `<键>.align.json`、锁定文件的清理）、站点渲染端的 `script` 与 `clips/`、检查项的计划部分、编辑的路由、agent 工具（`tools.ts`）与 `presmium-lecture export`（`export.ts`、`cli.ts`）。`src/client/` 增加 `ClipClock`（`MediaClock` 以每个语音段的片段为文件）、播放器的 `advanceTo`（按时间应用事件，播放与导出共用）、导出模式（地址加 `&export`：没有控件，`window.presmiumLecture.advance(t)`）、编辑面板 `TrackEditor.vue` 与逐字稿中每句的修改。与设计不同或设计没写明之处：转写与合成的确认是页面上写明服务提供方的确认框，不经 `APPROVALS`（编辑者点按钮就是确认；agent 的计费工具仍经 MCP 的确认）；`presmium serve` 在进程内编译文稿，所以 `script` 在那里同样按需合成（`ir.md` 6.3 节）；合成音色的讲授中改一句要先确认，确认框写明服务提供方；路由、agent 工具与检查都按讲授渲染端的视图（`viewFor(doc,'lecture')`，讲授插件已依赖编译器）计划，与构建一致；`presmium check` 只查找，不向语音引擎发请求；合成讲授的 `go` 由讲授视图的步号经它的 `stepMap` 换回 IR 的步号，所以只在网页形态不压缩步骤时（没有只在幻灯片或 notebook 中显示的上屏块）就是网页的步号；要总是准确，渲染端需要得到网页视图的步号（只增加）。

讲授插件只构造请求，修改任务的执行、审阅、提交与撤销都由助手完成（4.8 节“实现”）。`src/domain/writeback.ts`：由事件写回提示标记（`cueFor`）、逐字稿拼成的讲解草稿（`narrationDraft`）、一步讲解在源码中的位置（`narrationPlace`，取自讲授计划，所以单独的讲授脚本中的段落同样找得到）、要翻译的语音段与摘要（`translationItems`）。`src/node/tools.ts` 的 `track_narration`、`track_translations`。`src/client/`：内核插件 `plugin.ts` 在工具栏登记“讲授回写”（`WritebackPanel.vue`，编辑模式中、页面有 `AGENT` 时显示），`writeback.ts` 提交 `transcript` 任务与上下文写明讲授轨文件的 `chat` 任务、跟随事件、以 `AgentTask.review` 全部接受或全部拒绝、经助手的 `revert` 路由撤销（插件之间不互相引用，所以以路由的协议而不是以包调用助手）。与设计不同或设计没写明之处：译文的 `chat` 任务把讲授轨的文件写在上下文的 `selection` 中，因为助手把上下文只有文档的 `chat` 当作起草（`isDraft` 不看 `source` 与 `view`）；审阅在讲授面板中只有全部接受与全部拒绝（逐个文件的拒绝在助手的“AI 修改”面板中）；面板中的任务只属于这个窗口，刷新后由助手的面板接上待审阅的修改。服务端还没有合成 `script` 时播放器显示提示；合成音色的讲授中改一句时，确认写明运营者现在给这个引擎的服务提供方（`GET speech?engine=`）；`{only} lecture`、转写对齐与按字数估算有用例（`script.test.ts`）；单独脚本的诊断指向段落所在的行。

### 4.10 IR 与渲染端的扩展

`packages/kernel/src/ir.ts`：

```ts
export interface IRDocument {
  meta: {
    // ……已有字段……
    /** 本文稿是译本时：原文的入口文件（相对于文稿目录）与译本所依据的原文摘要 */
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
  /** 只给这些受众，如 `['teacher']`；省略时对所有受众 */
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
  /** `false`：不显示代码与运行控件，只显示输出；`text/markdown` 输出按正文显示 */
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

/** 工作区站点中的一份文档 */
export interface SiteDocument {
  /** 目录，相对于工作区根目录；文档的页面在 `<base><dir>/` 下 */
  dir: string
  title: string
  lang?: string
  tags?: string[]
  /** 编译好的 IR；开发中尚未访问的文档没有 */
  doc?: IRDocument
  /** 头部声明的译本，像单独构建文档那样编译（语言，IR），同 `RenderContext.translations`；站点把每个译本发布在 `<base><dir>/<lang>/` */
  translations?: { lang: string, doc: IRDocument }[]
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
  /** 把多份文档构建为一个站点；只有网页渲染端实现 */
  buildSite?(site: SiteSpec, ctx: RenderContext): Promise<RenderOutput>
  /** 工作区站点的开发服务器；页面请求一份尚未编译的文档时调用 `compile` */
  devSite?(site: SiteSpec, ctx: RenderContext, compile: (dir: string) => Promise<IRDocument>): Promise<SiteDevServer>
}
```

源语法与这些字段的对应、各渲染端的处理见 `ir.md`（2.7 至 2.14 节、第 6 节、第 9、10 节）。媒介 ID `lecture` 不是新的 IR 字段：它是讲授插件的渲染端 ID，`{only} lecture` 照常经 `only` 字段生效。

**实现**：契约没有变化，以下是写明之外的做法。

- `RenderContext.localAsset` 的结果也可以是目录（`ir.md` 6.2 节）：编译器（`renderers.ts`）与工作区站点的上下文（`packages/workspace/src/node/site.ts`）把文稿之内的目录准备为带文件清单页的副本，渲染端以 `cpSync(…, { recursive: true })` 发布它，与文件相同；不能发布的本地引用由这两处报告 `presmium.links`（构建报告去掉各渲染端重复的报告）。工作区站点的上下文另拒绝工作区之外的文件。
- 译本的过期检查在 `translations.ts` 的 `applyTranslations(doc, fields)` 中：`compiler.ts` 只把 IR 交给它，而编译器在编译结束时一次写入 `doc.diagnostics`，所以检查结果以 `doc.diagnostics` 上的一次性存取器并入这次写入（写入之后它是普通属性）。提议：`compiler.ts` 把 `report` 与 `source.files` 交给 `applyTranslations`，之后去掉存取器、摘要的文件取自 `source.files`。
- 译本的编译同样受 `compiler.ts` 的限制：编译器只从入口文件的头部读取文稿配置，`compileTranslations` 因此在原文旁写一个临时入口（原文的插件与渲染端配置，加上译本自己的头部，正文以 `{include}` 引入译本），编译选项取自原文的编译结果（运营者设置、随 CLI 安装的包与运营者目录；宿主服务没有记录在编译结果中，译本的编译没有它们）。提议：`CompilerOptions` 增加入口头部的默认值，届时不再写临时文件。
- 网页主题用 VitePress 文档化的路由钩子：`onBeforePageLoad` 在页面载入之前按页面的 locale 换上原文或译本的 IR（服务端渲染中同样，按页面路径），`onBeforeRouteChange` 让指向站内页面之外的链接整页载入。工作区首页的主题同样处理指向文档的链接。
- `presmium serve` 的工作区站点中，文档开发服务器的上一章、下一章与其他文档的搜索内容按当时已编译的文档给出，在该文档下一次更新时写入。

**整合**：契约没有变化；上面两条提议已在编译器中做完，另有以下做法。

- 过期检查：`applyTranslations(doc, fields, report)` 经编译器的 `report` 报告，在去掉受众内容之前（摘要的文件仍取完整 IR 中出现的文件，所以学生版的构建按同一摘要检查）；不再有 `doc.diagnostics` 上的存取器。
- 译本从自己的入口编译：`CompilerOptions` 增加 `headmatter`（替换入口头部的字段，值为 `undefined` 的去掉；译本取原文的 `plugins`、`presmium`、`renderers`、`execute`、`sectionDepth`、`checks`，没有 `lang`、`title` 时取声明的语言与原文标题，去掉 `translations`）与 `deckDir`（文稿目录不是入口所在目录时：译本在原文的文稿目录中编译，插件、`public/`、组件、锚点锁与执行缓存都是这份文稿的）。`Compilation.options` 记录编译选项，译本的编译取它（宿主服务也在其中），原文为某个受众编译、或构建某个受众的视图时（`Compilation.audience`）译本同样按该受众编译；`presmium dev` 中译本的编译器在头部或受众变化时换新。文稿目录中不写任何文件。
- `build(compilation, { outDir, to, audience?, quote?, scan? })`：`audience` 构建完整编译的该受众视图（`forAudience`、`audienceOf`），译本按该受众编译；为某个受众编译或构建时，构建结束后扫描输出，被去掉的句子包括各译本的（不含原文或任一译本自己也有的句子），`quote: false` 时诊断不引用句子。`scan` 默认 `outDir`，读输出目录中的每个文件（`presmium build --audience`：此前完整构建留在同一目录中的其他渲染端目录同样被检查）；`written` 只读这次写出的 `ir.json` 与各渲染端的目录，`presmium dev` 与 `presmium serve` 的 `ServerHost.build` 用它（文稿的 `dist/` 中同时有完整版的构建）。`presmium build --audience` 与 `ServerHost.build` 都经它。
- 发布文件的共用代码：`packages/compiler/src/published.ts`（`fileHash` 按大小、inode、修改时间与状态改变时间缓存文件的哈希，两秒之内改过的文件不缓存（同 git 对“racily clean”的处理：时间戳的精度之内同样大小的改动看不出来），`publishesDirectory`、`directoryAsset` 拒绝隐藏目录与 `node_modules`，`lineOf`、`inside`，`htmlAttributes` 以 parse5 找出原始 HTML 的属性），由 `@presmium/compiler` 导出，工作区站点的上下文引用它，`portable` 同样。三个渲染端改写原始 HTML 的 `mapHtmlUrls` 也改用 parse5，各在自己的包中（渲染端不互相引用，也不依赖编译器；合为一份要放进 kernel，不在本工作包中）。网页的 `mapHtmlUrls` 从 `src/domain` 移到 `src/node/html.ts`（只有构建用它，不进浏览器）。
- 工作区站点的译本：工作区根目录的 `presmium build` 以 `packages/workspace/src/node/site.ts` 的 `siteTranslations`（编译器的 `compileTranslations`）编译每份文档的译本，放进 `SiteDocument.translations`，网页渲染端的 `sites.ts` 把它们交给文档的 `RenderContext.translations` 并为首页生成每种语言的 locale（`ir.md` 2.12 节）。`presmium serve` 的预览不编译译本：`untranslated` 为声明了译本的文档给出警告 `presmium.translations`，写进该文档的诊断。
- 首页的运营者插件：编译器的 `workspacePlugins(root, options)` 按文档编译的同一选项加载运营者插件（`settings.presmium.workspace.plugins` 中声明 `operator: true` 的，另加随 CLI 安装的 `addon-deltabox`）并登记它们的 Node 服务。`presmium serve` 在服务端启动之后加载一次，首页（文档 `''`）的 `ServedDocument` 带上它们的服务端部分与服务（宿主的服务在前），所以它们的路由在首页应答。首页不是文档：它的 `ServerContext.deckDir` 与 `workspaceRoot` 都是 serve 在系统临时目录中建的一个空目录（关闭时删去），不是工作区根目录，所以插件的路由在首页读不到也改不了工作区中的文件；插件按 `ServerContext.home` 认出首页（服务端从首页的 `ServedDocument.home` 得到它；`presmium dev` 的文稿在仓库的根目录、入口不叫 `lecture.md` 时也是文档，所以不能按目录猜），那里只回答不需要文档的请求，文档的列出与新建经工作区的路由（`presmium.workspace`）。它们的 Node 服务仍按工作区创建（`workspacePlugins` 的上下文是工作区根目录）。站点上下文的 `config.homePlugins`（包名到目录）让网页渲染端只在首页加载它们的浏览器部分（`src/client/plugin.ts`、`viewer.ts`、`components/`），例如助手的 `AGENT`，文档管理的“由 agent 起草”因此出现；文档的页面仍只加载其文稿列出的插件。

## 5. 插件约定

### 5.1 浏览器端注册

插件包在浏览器端有三个约定入口。网页与幻灯片两个宿主都从这里注册，插件不必为两种形态各写一份：

| 入口 | 内容 | 幻灯片形态 | 网页形态 |
|---|---|---|---|
| `src/client/plugin.ts` | 默认导出内核插件定义 `PluginDefinition`：提供的服务与启动时的初始化 | 插件包的 `setup/main.ts` 导入它，调用 `registerPresmiumPlugin`（`@presmium/host`） | `web` 渲染端导入 `plugins` 中每个包的这个文件并注册 |
| `components/*.vue` | 组件，文件名即组件名，对应 `component` 节点的 `name` | Slidev 自动注册 | `web` 渲染端按文件名注册到 IR 运行时；文稿自己的 `components/` 覆盖同名组件 |
| `./presmium` 的 `vitePlugins` | 开发服务器的端点等 Vite 插件（4.2 节） | 幻灯片渲染端写进生成的 Slidev 项目的 `vite.config.ts` | `web` 渲染端在 VitePress 的开发与构建中加入 |

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

界面文本有中文与英文：

- 文稿的语言只由头部的 `lang` 声明，例如 `lang: en-US`，默认 `zh-CN`。编译器总是把它写入 IR 的 `meta.lang`，两种形态都据此设置 `<html lang>`：幻灯片渲染端写入 Slidev 头部的 `htmlAttrs`，网页渲染端设置站点语言。渲染端的配置不能另设语言。
- 浏览器中的界面语言为 `'zh-CN'` 或 `'en'`：`<html lang>` 以 `zh` 开头时为中文，以 `en` 开头时为英文；其他语言（如 `fr`）看 `navigator.language`，仍无法确定时为英文。各包一律经 `@presmium/host` 取语言：组件中用 `useMessages(CATALOG)`，组件之外用 `CATALOG[currentLocale()]`，`CATALOG` 是包自己的 `{ 'zh-CN': …, en: … }`。只有 `@presmium/host` 跟随 `<html lang>` 的变化（Slidev 在应用启动之后才写入 `htmlAttrs`），各包不自己判断语言，也不各自观察 `<html lang>`。
- 每个包维护自己的 zh-CN 与 en 文本，文件位置由包自定（例如 `src/domain/messages.ts` 或 `src/client/messages.ts`）。
- 开发服务器的端点（如本地环境插件的端点）按请求的 `Accept-Language` 回答，浏览器端在请求中带上界面语言。
- 编译时写入产物的文本按文稿的语言：指令、编译步骤与渲染上下文都带 `lang`，`deckLocale(lang)`（`@presmium/kernel`）给出 `'zh-CN'` 或 `'en'`（没有对应文本的语言为英文），例如 notebook 中指向网页版的说明、练习单元格的标签、导出环境中的说明文件、聚光灯的降级文字。编译时执行器写入录制输出的消息（例如超时）与解释器自身的报错一样为英文，也不含构建机器的路径。
- 框架自身的界面文字：网页渲染端按文稿语言设置 VitePress 文档列出的全部主题标签（`themeConfig` 的大纲、目录、翻页、明暗切换、回到顶部、跳到正文、侧栏菜单等标签与本地搜索的 `translations`）以及 404 页。VitePress 默认主题中不在 `themeConfig` 里的屏幕阅读器标签（侧栏的 “Sidebar Navigation”、上下章链接的 “Pager”，导航栏中打开手机导航菜单的按钮 “mobile navigation” 与平板宽度下更多菜单的按钮 “extra navigation”）由网页主题在页面渲染后按文稿语言改写（9.1 节）。其他没有公开配置接口的文字保持框架的英文：幻灯片形态中 Slidev 自己的界面（导航栏按钮的提示、演讲者视图、绘图工具与设置菜单）只有英文。这里的“界面文本”指 Presmium 自己的界面，不含这些文字。

### 5.8 静态导出

PDF、PNG 等静态导出中，插件组件显示 IR 的 `fallback`，不显示交互界面：幻灯片宿主在打印模式（`useStaticRender()` 为 true）下把带 `fallback` 的组件换成降级内容。插件负责让降级内容完整：执行面板的降级内容是先给参数赋值的代码，加上编译时的输出（构建时没有执行、执行失败或超时的用 `:recorded:` 的录制输出），由执行插件在编译时执行之后的步骤（`after: 'execute'`）写入。notebook 渲染端有自己的扩展时用扩展，否则使用 `fallback`（`ir.md` 第 6 节）。

打印页自己说明何时可以截图（发布插件的 `setup/print.ts`、`setup/root.ts` 与 `index.html`）。`slidev export` 等打印页的网络空闲 500 毫秒（`--wait-until networkidle`），再等它此时在页面上找到的东西（加载中的幻灯片、Mermaid），再等 `--wait` 毫秒后截图。

- 机器繁忙时，浏览器还在执行页面的模块、应用还没挂载，网络已经空闲：导出找不到要等的东西，打印出空白页（链接丢失）。所以打印模式（`?print`）的页面从一开始就保持一个请求不结束、`body` 不可见，直到每张幻灯片的组件都已加载（`SlideRoute.load`）、页面显示了它们；这个请求只有 `slidev export` 的服务器（插件的 Vite 插件，只在 `export` 模式加入）不回答，别处（构建产物、开发服务器）一回答页面就不再保持。等待的上限是导出自己的 `--timeout`（`presmium-export` 默认 120 秒）。
- 页面的请求可能失败：主机的网络变化时（别的进程启动 Docker 容器）Chromium 以 `net::ERR_NETWORK_CHANGED` 中止进行中的请求，Vite 重新打包依赖后对旧的请求回答 “Outdated Optimize Dep”。入口的模块载入失败时应用不会启动，导出等不到页面的 `body`（Slidev 固定等 30 秒）；某张幻灯片载入失败时打印出它的错误页。所以入口的模块或某张幻灯片载入失败时页面重新载入，最多三次；重新载入之前先等服务器能回答（网络还在变化时载入会得到浏览器的错误页）。
- 只对列出发布插件的文稿生效；`e2e/smoke.spec.ts` 用测试文稿 `e2e/fixtures/print` 检查两种情形（插件让应用在模块加载后停 5 秒，并让页面对它的一个模块的第一次请求失败）。

### 5.9 浮层组件与组件拥有的代码

在页面上绘制在其他内容之上、自身不占版面的组件（例如引导的光标），由指令把组件节点标为 `layer: 'overlay'`。渲染端不给它单独的位置：网页的文档视图把浮层块放在板书之外，不会出现空卡片，服务端渲染与首帧的版面也不跳动；幻灯片渲染端不给没有降级内容的浮层组件写空的 `PmStaticFallback`。

组件拥有的代码：组件的子块中的代码块（例如执行面板、分步执行、本地环境包着的代码）属于组件。两种形态都不给它们运行控件，也不显示它们的录制输出：网页由 IR 运行时实现，幻灯片渲染端把它们写成组件插槽中的普通代码块（照常做语言映射）。组件运行的代码由指令放在组件的属性中（如执行面板的 `code`），不从渲染后的 DOM 读回。

### 5.10 设计系统

> **工作台**：令牌、`pm-ui-*` 的类、字体与图标在 `@presmium/design`（`packages/design/src/`；`@presmium/host` 引用它，Vue 组件与 `useTheme` 留在 `host`），工作台的 React 面板（`@presmium/workbench` 的 `components.tsx`）用同一层，dsh 自己的面板经它的 `--dsw-*` 令牌映射（`design-dsh.md` 7.5 节，第 13 节）。本节中的工作区首页的工作台、编辑模式与工作台的槽位（`home`、`create`、`files`、`tabs`、`source`、`dock`）属于旧工作台，1.0 中为实验性，随旧工作台删去；`tools`、`settings`、`status` 留给产物。

用户选定的设计（`docs/design/`）是工作台的布局与编辑方式、书卷的样式。`@presmium/host` 提供设计令牌与通用组件；网页形态的外壳（工作区首页的工作台、阅读页、编辑模式）与插件都用它们，不各自定义颜色与控件。插件界面与幻灯片的默认主题见 5.12 节。

**令牌**：CSS 自定义属性，在 `packages/design/src/tokens.css`（颜色令牌的名字另由 `@presmium/design` 的 `COLORS`、`color(name)` 给出）。`:root` 为亮色；`<html>` 有 `dark` 类时为暗色（VitePress 的外观开关与 Slidev 的暗色模式都设这个类）。

| 组 | 令牌 | 说明 |
|---|---|---|
| 颜色 | `--pm-color-bg`、`surface`、`sunk`、`code`、`ink`、`muted`、`line`、`line-strong`、`accent`、`accent-soft`、`on-accent`、`selected`、`ok`、`ok-soft`、`warn`、`warn-soft`、`danger`、`danger-soft`、`add`、`del`、`gutter`、`syntax-key`、`syntax-string`、`syntax-keyword` | 取值见 `docs/design/README.md`，`line-strong` 对应其中的 `line2`。三处与参考稿不同：亮色的 `ok` 由 `#2F7D4F` 加深为 `#2B7449`，使它在 `ok-soft` 上达到 AA；`line-strong` 由亮 `#A39C8E`、暗 `#6F6A60` 加深为亮 `#8C8577`、暗 `#78736A`，使它在 `bg`、`surface`、`sunk` 上达到 3:1（WCAG 1.4.11），参考稿的取值留作 `gutter`（源码编辑器的行号用 `muted`，5.11 节）；`danger` 与 `danger-soft` 是新增的，`danger` 与 `del` 同色 |
| 字体 | `--pm-font-sans`、`--pm-font-serif`、`--pm-font-mono` | IBM Plex Sans、Source Serif 4、IBM Plex Mono，后接中文的系统字体 |
| 字号 | `--pm-text-xs`、`sm`、`md`、`lg`、`reading`、`title`、`display` | 12、13、14（界面）、16、17（阅读）、20、32 px，以 rem 表示，跟随读者的字号 |
| 行高 | `--pm-leading-tight`、`ui`、`reading` | 1.25、1.6、1.85 |
| 间距 | `--pm-space-1` 至 `--pm-space-10` | 4 px 网格 |
| 圆角 | `--pm-radius-control`、`small`、`card`、`panel`、`chip`、`pill` | 8、6、12、14、4、999 px |
| 阴影 | `--pm-shadow`、`--pm-shadow-float` | 只用于分段控件的选中项与浮层；不用渐变 |
| 动效 | `--pm-duration-fast`、`--pm-duration`、`--pm-ease` | 系统要求减少动态效果时时长为 0 |
| 外壳 | `--pm-activity-width`、`--pm-sidebar-width`、`--pm-statusbar-height`、`--pm-z-popover`、`--pm-z-dialog` | 工作台的列宽、状态栏高与浮层的层级 |

**字体**：三种西文字体的拉丁子集随 `@presmium/design` 发布（`fonts.css`；`@presmium/host` 也列出这三个包，站点的字体许可证由它们写出，Fontsource 的 `@fontsource/ibm-plex-sans`、`@fontsource/source-serif-4`、`@fontsource/ibm-plex-mono`，SIL OFL 1.1），打包进产物，不从网络加载。中文先用系统字体：黑体为 PingFang SC、Microsoft YaHei、Noto Sans CJK SC，宋体为 Songti SC、Noto Serif CJK SC、Source Han Serif SC。网页形态的主题改为扩展 `vitepress/theme-without-fonts`，不再打包 VitePress 的 Inter。

**加载**：`@presmium/host` 的入口引入 `src/design/design.css`（它引入 `@presmium/design/design.css`：字体、令牌与组件的类），用到宿主的页面都有它们；宿主之外的页面可以单独引入 `@presmium/host/design.css` 或 `@presmium/design/design.css`。

**通用组件**（`packages/host/src/design/components.ts`，样式在 `@presmium/design` 的 `components.css`，类名以 `pm-ui-` 开头；插件也可以直接用这些类；工作台的 React 版在 `@presmium/workbench`，同名同类）：

| 组件 | 用途 |
|---|---|
| `PmIcon` | 线性图标（`ICONS`，24 px 网格，1.7 px 描边，不用 emoji 与 ◀ ▶ ✓ 这类字形）；框架把文字当 HTML 显示的地方（幻灯片代码运行器的提示）用 `iconMarkup` 得到同样的 SVG |
| `PmButton` | 按钮：`primary`（墨色底、纸色字，主操作）、`accent`（打开的开关）、`ghost`、`danger`，可加 `small` 与 `icon`；`aria-pressed="true"` 的按钮显示为打开 |
| `PmIconButton` | 只有图标的按钮，`label` 是它的可访问名称与提示 |
| `PmField` | 带标签的输入、选择与文本框（类 `pm-ui-input`、`pm-ui-select`、`pm-ui-textarea`，边框为 `line-strong`）；`inline` 用于复选框 |
| `PmBadge` | 徽标：`accent`、`ok`、`warn`、`danger`、`outline`，`pill` 为圆端的来源标签 |
| `PmCard` | 卡片：`interactive`（通向别处）、`dashed`（新建一样东西） |
| `PmSegmented` | 分段控件：选中项凸起，边框为 `line-strong` |
| `PmTabs` | 标签页与所选标签的面板（默认插槽，得到所选的 `value`；面板以它的标签为名）；方向键切换并移动焦点，到头时回到另一端 |
| `PmPopover` | 依附于触发器的弹层；会超出窗口时横向移入，离窗口两侧 1 rem（如手机上 VitePress 导航屏中的工具栏项） |
| `PmDrawer` | 活动栏旁、与窗口等高的面板 |
| `PmDialog` | 对话框：不是模态的，页面仍可操作；移到文档末尾，不受工具栏的布局影响 |
| `PmMenu` | 菜单：打开时焦点在第一项，方向键移动，到头时回到另一端；选中一项或按 Escape 后焦点回到按钮；同样留在窗口内 |
| `PmEmpty` | 空状态 |
| `PmNotice` | 提示，`status`，失败时为 `alert` |
| `PmToolbarEntry` | 打开面板的工具栏项：在活动栏中是图标按钮与抽屉，在其他位置是带文字的按钮与弹层（状态栏中向上弹出） |

弹层、抽屉、对话框与菜单按 Escape 关闭，焦点回到触发器；弹层、抽屉与菜单在外部按下时关闭，对话框不关。文字对背景达到 WCAG AA（1.4.3）；标识控件与状态的图形达到 3:1（1.4.11）：输入框与搜索框由边框标识，分段控件的选中项由边框标识，都用 `line-strong`；按钮由文字标识，边框可以用 `line`；复选框由浏览器绘制，颜色取 `accent`。另有 `pm-ui-search`（搜索框）、`pm-ui-kbd`、`pm-ui-heading`（卡片与分区的小标题）、`pm-ui-list`、`pm-ui-dot`（状态点）、`pm-ui-code`、`pm-ui-link` 等类。

`useTheme()` 给出当前是否为暗色与切换的方法。宿主适配可以提供 `HostAdapter.useDarkMode`（网页形态为 VitePress 的外观开关），这样切换被记住，与读者自己切换一样；没有时 `useTheme` 直接设 `<html>` 的 `dark` 类。

**外壳中的位置**：工具栏项（`ToolbarItem`）可以声明 `slot` 与 `icon`。`PmToolbar` 按 `filter` 显示一处的项，并告诉它们所在的位置（`useToolbarPlace()`：`bar`、`activity`、`status`、`home`、`pane`）；`PmToolbarEntry` 据此选择样式。

| `slot` | 页面的工具栏（网页的导航栏，幻灯片的导航控件） | 工作区首页（工作台） | 编辑模式 |
|---|---|---|---|
| `tools`（默认） | 显示 | 有 `icon` 的在活动栏，其余在启动台的顶栏 | 顶栏的末端 |
| `settings` | 显示 | 活动栏底部（使用说明、模型设置） | 顶栏的末端 |
| `status` | — | 状态栏 | 状态栏 |
| `home` | — | 文档卡片下方的卡片（最近修改） | — |
| `create` | — | 文档卡片之后（由 AI 起草一份文档） | — |
| `files` | — | 工作区侧栏：文件树（工作区的项） | — |
| `tabs` | — | 编辑器打开时在启动台的位置之上：打开的文件 | 顶栏中文档名之后：打开的文件 |
| `source` | — | 编辑器打开时在启动台的位置：源码编辑器 | 左栏：源码编辑器（5.11 节） |
| `dock` | — | — | 右侧停靠：AI 修改等面板 |

**网页形态的外壳**（`packages/web/src/client`）：

- **工作区首页**：`presmium serve` 中是工作台（`docs/design/home.dc.html`）。最前是“跳到内容”的链接（键盘到达时才显示，指向启动台的内容）。最左是活动栏：标志、文档、搜索，之后是插件的项，底部是 `settings` 的项。其次是工作区侧栏：工作区名是页面唯一的 `h1`，其下是 `files` 的项（工作区插件的文件树），没有时列出文档目录与 `presmium.workspace.yaml`。中间是启动台：顶栏有搜索框和 `tools` 中没有图标的项；其下是文档卡片，卡片有衬线标题、目录、语言、标签，站点数据带有说明、页数与检查结果时也显示它们；再下是 `home` 的卡片与“连接外部 agent（MCP）”的卡片（地址与复制按钮）。底部是状态栏：`status` 的项，右端是明暗切换。宽度小于 1024 px 时侧栏隐藏，工作区名的 `h1` 移到启动台的顶栏，活动栏在“搜索”之后多一项“工作区文件”，在抽屉中打开文件树（同样是 `files` 的项，选中一个文件后抽屉关上）；小于 768 px 时活动栏横排在顶部，抽屉在它下方打开、占满宽度（`--pm-drawer-top`），活动栏一直可用。工作区插件的编辑器打开时（首页的 `EDIT_MODE`，打开 `presmium.workspace.yaml`），启动台的位置换成 `tabs` 与 `source` 的项；活动栏的“文档”回到启动台。静态的工作区站点保留默认主题的页面（导航与页脚），文档同样显示为卡片，搜索框只过滤卡片。
- **启动台的搜索**：`Ctrl K`（⌘ K）聚焦。输入时在框下列出找到的文档、章节与命令（组合框与列表，方向键选择，Enter 执行）；文档卡片照旧，不随搜索筛选（搜索一个章节不会清空卡片）。章节来自站点的文档列表（`@presmium/documents.json`）：已编译的文档带有它的章节与链接；搜索框第一次聚焦时以 `?compile=1` 请求列表，还没编译的文档在后台依次编译，编译完成前列表带 `compiling`，页面每秒再读一次。命令是首页上画出的 `tools`、`settings` 与 `create` 的项，以项的 `title` 为名，执行时按下它的第一个控件（新建文档、管理文档、修改历史、使用说明、模型设置、由 AI 起草一份文档），另有外壳自己的“切换明暗”。
- **外壳的文字**：工作台、编辑模式的顶栏与启动台的文字和网页形态的其他文字一样在 `packages/web/src/domain/messages.ts` 的 `WEB_MESSAGES`（中英文）。
- **阅读页**：VitePress 的颜色与字体变量取自令牌，IR 运行时与插件跟随这些变量，因此也用书卷的颜色。标题与 Markdown 块用衬线体，阅读正文 17 px、行高 1.85；组件保持界面的无衬线体。
- **编辑模式**（工作区的 `EDIT_MODE`，`docs/design/edit.dc.html`）：占满窗口的应用布局，`<html>` 有 `pm-editing` 类。顶栏代替 VitePress 的导航栏（导航栏、本地导航、章节侧栏、页面的页脚与上一章、下一章都不显示，导航栏的工具栏移到顶栏的末端，仍是同一组项的实例，打开的面板与它们对编辑模式的观察都保留；进入编辑模式时先关上手机的导航屏）：标志，位置（工作区名 / 文档名，工作区名取自首页的文档列表），`tabs` 的项，预览视图（分段控件“文档”“放映”，文稿有幻灯片形态时另有“幻灯片”的链接），`tools` 与 `settings` 的项。有 `source` 项时为左右分栏：`pm-edit-split` 类，左栏宽 `--pm-edit-source-width`；有 `dock` 项时右侧停靠：`pm-edit-docked` 类，宽 `--pm-edit-dock-width`；页面本身是中间的预览（`surface` 底色），仍由窗口滚动。状态栏在窗口底部：`status` 的项，右端是明暗切换。放映视图显示在预览的位置；它是模态的，所以顶栏、两栏与状态栏的 `z-index` 在它之上，仍可操作。宽度小于 960 px（VitePress 的侧栏收起的宽度）时两栏放不下，按参考稿换行的方式上下排列：顶栏换行在最上，源码在预览之上，停靠栏在预览之下，宽度占满，高 `--pm-edit-pane-height`（默认 60vh）。

**工作区插件的项**（`packages/workspace/src/client`）：

- 首页：“管理文档”（按钮与对话框：新建、由 agent 起草、重命名、复制、删除）与“新建文档”两个项；“由 AI 起草一份文档”的虚线卡片（`create`，有助手时）；“最近修改”卡片（`home`，来源标签 AI、编辑、文档）；使用说明（`settings`：管理文档、编辑模式、AI 修改、模型设置、修改历史、用 MCP 连接外部 agent，文档站发布后加上它的链接）；文件树（`files`，5.11 节）。
- 首页与文档页：修改历史（有图标，首页在活动栏，文档页在工具栏），顶部是未提交的修改（5.11 节）。撤销显示为“撤销「…」”，撤销的撤销显示为“重做「…」”；判断依据是列表中 `reverts` 的链，链出了列表时看提交标题的嵌套。撤销项的按钮是“重做”，被重做后标为“已重做”。状态栏中的 git 状态（`status`：分支与未提交的文件数）。源码编辑器的项（`tabs`、`source`、状态栏中的语言、编码与光标所在行）。
- 文档页：“编辑”开关，打开时为强调色；编辑模式中有未提交的修改时，“提交 N 处修改”（`tools`）。

**验收**：`e2e/design.spec.ts`：工作台的各部分与字体（只从本站加载）、唯一的 `h1` 与“跳到内容”、启动台搜索中的文档、章节与命令（键盘操作；文档卡片不随之减少）、平板（900 px）与手机宽度下活动栏的“工作区文件”在抽屉中打开文件树、明暗切换、有助手时的虚线卡片、撤销与重做的标签、使用说明、编辑模式的顶栏（位置、文件标签、预览视图）、两栏、停靠栏与状态栏占满窗口，放映视图在预览的位置，测试插件在停靠栏中用的标签页、菜单与分段控件（键盘操作），手机宽度（390 px）下抽屉在活动栏之下、导航屏中的弹层留在屏幕内、编辑模式上下排列，以及明暗两套下首页、启动台的搜索结果、文件树、修改历史、对话框、使用说明、文档页与编辑模式（源码编辑器与问题面板）的文字达到 WCAG AA、输入框与分段控件选中项的边框达到 3:1。对比度的检查只有一份（`e2e/fixtures/contrast.ts`，插件界面与远端环境的用例同样用它）。测试插件（`e2e/fixtures/design/plugins`）还代替助手提供 `AGENT`，可以起草。

### 5.11 浏览器中的源码编辑

> **工作台**：本节描述旧工作台的编辑模式（1.0 中为实验性）。浏览器中的源码编辑改在工作台（`presmium studio`）中：编辑器、问题与预览面板是 React 写的，使用本节的同一组路由与预览协议（第 13 节）；`presmium dev` 的编辑模式要加 `--edit`，随旧工作台删去。

编辑模式中，作者不经 agent 直接改源码（布局见 `docs/design/edit.dc.html`）。在 `presmium serve` 与 `presmium dev` 中（工作区的浏览器插件与路由；`presmium dev` 见 10.2 节的“`presmium dev` 的编辑模式”）。

**源码编辑器**：CodeMirror 6（MIT，`@codemirror/*` 与 `@lezer/highlight`，`packages/workspace/src/client/editor.ts`），随源码面板加载。Markdown 文件按 MyST：头部是 YAML，指令的围栏、选项、标签与角色用设计的 `syntax-key` 等颜色标出；`.yaml` 按 YAML。每个打开的文件有自己的编辑状态（撤销历史、光标），一次显示一个。`Ctrl S`（⌘ S）保存。行号用 `muted`（参考稿的 `gutter` 对 `code` 只有 2.6:1）。Tab 不缩进，焦点照常移出编辑器。

**位置与项**（5.10 节）：

- `source`：源码面板。上方是当前文件的提示，中间是编辑器，下方是问题面板。问题来自服务的编译结果：页面所跟随的 IR 的 `diagnostics`（每次保存后服务重新编译，实时更新带来新的诊断），列出文件、行与说明，点一项打开文件到那一行；编辑器中在行上标出（lint 的下划线与行号旁的标记）。
- `tabs`：打开的文件（`tablist`，方向键切换），未保存的有圆点；“打开文件”菜单列出本页范围内的文件，末项关闭当前文件。
- `status`：语言（MyST、YAML 等）、`UTF-8`、光标所在行。
- `tools`：“提交 N 处修改”，弹层中是未提交的修改。
- `files`（首页）：文件树。每份文档是可以展开的文件夹，其下是它的文件与目录；最后是 `presmium.workspace.yaml`。文档的文件在它的页面中以编辑模式打开（`<文档>/?edit=<文档中的路径>`，页面读后从地址中去掉），`presmium.workspace.yaml` 在首页的编辑器中打开（所有者；`serve` 启动时读它，保存后提示重新启动）。

**预览与源码的双向定位**：块与章节的源码范围来自 IR 的源码位置（`SourcePos`：文稿目录中的文件、起止行）。工作区的视图插件（`src/client/viewer.ts`）让编辑器取得 IR 运行时的 viewer。在预览中点选一块（不在链接、按钮与输入框上，没有选中文字时），打开它的文件，光标到它的首行，它的行在编辑器中标出（`selected` 底色、左侧强调色），预览中它被强调色框出。光标在源码中移动（停 150 ms），预览跟随：包含该行的最内层的块，否则是章节；不在当前页时由 viewer 打开它所在的页（VitePress 换页时把焦点移到页首，编辑器取回焦点），不在视野中时滚动到它。实时更新后标记重新加上。

**路由**（`/__presmium/presmium.workspace/`，编辑者与所有者，`packages/workspace/src/node/source.ts`、`routes.ts`）：路径都相对于工作区根目录。文档页的范围是它的文档目录；首页（文档 `''`，不是单文档仓库时）的范围是每份文档与 `presmium.workspace.yaml`（所有者）。不经符号链接，不进 `.git`、`node_modules`、`dist`、`.presmium`，文件最大 2 MiB。

| 路由 | 作用 |
|---|---|
| `GET files` | 范围内的文件（`binary` 的只列出、不打开），首页另给文档目录；最多 2000 个 |
| `GET source?path=` | UTF-8 文本与它的版本（字节的散列） |
| `POST source` `{ path, content, base }` | 文件仍是 `base` 版本时写入，经 `DOCUMENT_FILES` 的写入器（与 agent 的写入同一条路），回答新的版本；文件在打开之后被改过（agent、磁盘上的编辑器）时 409，带现在的内容与版本（`conflict`）；保存持有文档的锁（`DOCUMENT_LOCKS`，`editor:save`），锁被别的写入者持有时 409，带锁（`locked`） |
| `GET changes` | 范围内未提交的文件（`git status`）：新增、修改、删除，增删的行数 |
| `POST changes/commit` `{ message, paths? }` | 一次提交（`REVISIONS.commit`，`Presmium-Origin: editor`），持有所涉文档的锁 |
| `POST changes/discard` `{ paths? }` | 文件写回最近一次提交的样子（最近一次提交没有的删除），经写入器，持有所涉文档的锁 |

**与 agent 的修改共存**：agent 的修改任务从开始到审阅结束持有文档的锁，期间保存被拒绝：编辑器提示“AI 的修改任务正在进行或等待审阅，现在不能保存”，作者的文字留在编辑器中（审阅的回滚不会覆盖作者的保存）。打开的文件在每次实时更新、窗口回到前台、提交、放弃与撤销之后与磁盘比较：没有改过的文件直接换成磁盘上的内容；改过的提示“在打开之后被修改了”，可以合并或重新载入（锁的提示在时保留它，再次保存时得到冲突）。合并是按行的三方合并（`node-diff3`，`src/domain/merge.ts`），从两边共同的起点：两边只在同一处新增时都保留（磁盘的在前），改了同样的行时用 git 的冲突标记标出，任何一方的修改都不丢失；合并的结果留在编辑器中，保存后写入。合并或重新载入之后焦点回到编辑器（按下的按钮随提示一起消失）；焦点在源码面板中任何地方（提示的按钮、问题面板）时 `Ctrl S` 都保存，编辑器中由它自己的按键处理。离开编辑模式时没有保存的文字留在页面中，离开页面前浏览器提示。

**未提交的修改**：列在修改历史的顶部与“提交 N 处修改”的弹层中，写一句说明后提交（提交出现在历史中，可以撤销），或放弃（确认后写回）。任务开始时没有提交的修改照常保留（审阅的快照包含它们）。

**依赖与开发服务器**：Vite 在启动后才发现的依赖会重新优化并重新载入页面（会离开编辑模式）。编辑器的依赖（CodeMirror 6 与它引用的包、`node-diff3`，都是 ES 模块）由工作区的 `vite.config.ts` 排除在优化之外（`optimizeDeps.exclude`）；网页渲染端把站点自身的插件的 `vite.config.ts` 用在每份文档与首页的开发服务器中（`packages/web/src/node/sites.ts`）。

**验收**：`e2e/editing.spec.ts`（`e2e/fixtures/editing`，助手与脚本化的测试 agent）：点选一段，源码跳到它的行；改一个词保存，页面不刷新即更新；问题面板列出诊断并在行上标出，光标在被包含的文件中移动时预览换到它所在的页并标出该块，编辑器保留焦点；新增一节保存，目录随之更新；未提交的修改在修改历史顶部，写一句说明提交后历史中出现这一项，可以撤销；放弃后内容复原；agent 的修改等待审阅时保存给出提示，审阅之后合并保留双方的修改；磁盘上的编辑器在打开之后改了文件：保存给出提示，重新载入换成磁盘的内容，或合并保留双方的修改，之后焦点回到编辑器，在问题面板中按 `Ctrl S` 也保存；首页的文件树在编辑模式中打开文档的文件，在首页的编辑器中打开 `presmium.workspace.yaml`。路由的拒绝由 `packages/workspace/test/source.test.ts` 对真实的 `presmium serve` 检查：范围之外的路径（400）、经符号链接的文件、别的文档的文件与工作区配置（403）、二进制与非 UTF-8 的文件（415）、别的站点的 `Origin`（403）、过期的版本（409，带磁盘上的内容与版本），都不写入。


### 5.12 插件界面与幻灯片的默认主题

> **工作台**：助手插件中属于工作台的面板（“AI 修改”、停靠面板、任务与审阅、模型设置与状态）与讲授插件的回写由工作台取代，随旧工作台删去；读者问答、运行面板、课堂、讲授的播放与录制等产物中的界面不变（`design-dsh.md` 13.3 节）。

插件的界面与幻灯片的默认主题用 5.10 节的设计系统，参考稿是 `docs/design/edit.dc.html` 与 `slide.dc.html`；插件中的字形用宿主的图标。

**插件界面**：助手、课堂、讲授、运行面板、测验与练习、课堂会话、发布、引导与讲台的组件和面板只用 5.10 节的令牌与通用组件。

- 颜色、字体、圆角与阴影取令牌，不写死颜色，暗色随令牌切换。发布插件的高对比度模式把令牌映射为它的两种颜色。保留固定颜色的只有含义固定的几处：黑屏、终端、二维码、指针、激光笔与荧光笔。
- 控件用 `pm-ui-*` 类或 `Pm*` 组件：主操作是 `pm-ui-button--primary`（墨色），其余用默认或 `ghost`；开关用 `aria-pressed`；输入框用 `pm-ui-input`、`pm-ui-select`、`pm-ui-textarea`，边框为 `line-strong`；徽标用 `pm-ui-badge`。
- 文稿中的组件（测验、预测、练习、运行面板、分步执行、提问框、课堂反馈等）在根元素上把 `--pm-text-sm`、`--pm-text-md` 设为 em，控件随幻灯片与放映视图的字号缩放。工具栏的弹层、演讲者面板与停靠面板保持宿主的字号。
- 工具栏的弹层用浏览器自己的 `popover`，在顶层，不被幻灯片的导航栏裁掉。它画成宿主的浮层：`surface` 底、`line` 边框、卡片圆角与 `shadow-float`。
- 幻灯片形态中，Slidev 的重置样式（Tailwind 的 preflight）把 `button`、`[type=button]`、`[type=submit]` 设为透明。它的特异性与宿主的类相同，又排在其后，所以 `addon-core` 的 `style.css` 为 `pm-ui-button` 的各种状态补回填充。
- 远端环境的令牌对话框（`auth: prompt`，`addon-exec-jupyter` 的 `token.ts`）是浏览器的模态 `<dialog>`，保留模态与居中；标题栏、字段与按钮用宿主的 `pm-ui-dialog__*`、`pm-ui-field`、`pm-ui-input`、`pm-ui-button` 类，面板的底色、边框、圆角与阴影取令牌。
- 图标是宿主的线性图标（`PmIcon`）：分步执行的上一步、下一步，讲授的过时字幕与改写，高对比度开关，练习每条检查的对错，录制中的标记，源码面板中问题的严重程度（`error`、`warning`、`info`）；幻灯片代码运行器的提示“按 [运行图标] 运行这段代码”用 `iconMarkup`。插件与工作区的界面中没有 ◀ ▶ ⚠ ✎ ◐ ✓ ✗ ● ▲ ○ 这类字形。
- 状态靠颜色而不靠不透明度区分，以保持 AA：核心插件的演示步进组件中已完成的步骤用 `muted`（原来 0.6 的不透明度只有 4.4:1）。

**运行面板**（`addon-exec` 的 `PmRunPanel.vue`，`docs/design/slide.dc.html`）：一张卡片（`surface`、`line` 边框、面板圆角），顶栏写语言与在哪里运行（“Python · 浏览器中运行”），参数与墨色的运行按钮也在顶栏，窄处换行时参数与按钮一起到第二行；其下是代码，代码块自己的边框、圆角与外边距去掉（幻灯片的 `--slidev-code-margin`、`--slidev-code-radius` 设为 0）。在哪里运行由执行器自己说明（`Executor.runsIn`：`'browser'` 或 `'machine'`，可选；`src/client/place.ts`）：Pyodide、脚本 worker、WASI 与 WebGPU 的执行器在浏览器中，本地环境插件的执行器在本机（服务所在的机器）；`:env:` 的具名环境的执行器没有说明（或还没有登记）时按头部为它声明的 `kind`（`jupyter` 为远端环境，`devcontainer` 为本机，`wasi`、`webgpu` 为浏览器，其他写环境名）；没有说明的执行器只写语言。运行之前写路由器会选的执行器，运行之后写实际运行的（`RunResult.executorId`）。运行后输出在 `sunk` 的面板中，标题是“输出 · <秒数> 秒”（`RunResult.durationMs`；录制的输出只写“输出”），幻灯片与放映视图中宽度够时在代码旁边，窄处（网页的正文栏、手机）在代码之下；运行之前代码占满宽度。网页、放映视图与幻灯片是同一个组件。

**图表**：网页与放映视图中的 Mermaid（IR 运行时的 `PmMermaid`）用 Mermaid 的 `base` 主题，主题变量取宿主的令牌（纸、墨、强调色，明暗随页面），连线标签在 `surface` 上用 `ink`；页面没有令牌时用 Mermaid 自己的 `default`、`dark`。书卷的幻灯片中 Slidev 画图（在 shadow root 中），主题的 `setup/mermaid.ts` 用 Mermaid 的 `themeCSS` 让连线标签取令牌（令牌经 shadow root 继承，随暗色切换）；Mermaid 自己的暗色主题把标签画在 4.4:1，达不到 AA。

**助手的界面**：

- 编辑模式中，“批注与对话”是停靠在右侧的面板（`EditDock.vue`）。它经工具栏的 `dock` 槽位在显示时注册、收起时注销，外壳只在它显示时留出右栏（`dock.ts`）。
- 工具栏的“AI 修改”是这个面板的开关（`aria-pressed`）：在编辑者可以修改的文档中，它进入编辑模式并显示面板。进入编辑模式时面板自动显示，退出时隐藏。面板顶部是标题、模型的服务提供方、模型设置与收起按钮，中间是修改任务与批注，底部是对话的输入框（Enter 发送，Shift+Enter 换行）。
- 在别处（工作区首页、不在 git 仓库中的文稿、没有模型、不能编辑），“AI 修改”打开一个弹层，写明不可用的原因与要设置什么。服务端的 `info.missing` 是代码与参数（`MissingItem`，4.8 节），页面按代码给出页面语言的说明（`src/client/messages.ts` 的 `missingText`）：模型服务、`PRESMIUM_MODEL_*` 中没设的变量、替换运行时的服务提供方、没有安装的随包运行时。
- 工作区首页与编辑模式的状态栏显示模型与它的来源（`status` 槽位，`ModelStatus.vue`）：`info.source` 为环境变量、工作区配置或模型设置；没有模型时为“模型未配置”。点它打开模型设置。
- 模型设置是宿主的对话框（`PmDialog`）。服务、服务提供方或地址与已保存的不同时，密钥必填；“已设置，留空则不变”只在三者都没变时出现，与服务端的规则一致。配置文件的路径与环境变量名这类长词在任意处换行，手机宽度下对话框与其中的输入框不超出屏幕。
- 首页的“由 AI 起草一份文档”是工作区插件的 `create` 卡片，用助手提供的 `AGENT`：运营者把助手列为工作区插件、助手可以对话时显示。
- 讲授插件的“讲授回写”同样停靠在右侧（`dock` 槽位，在“AI 修改”之下），工具栏的“讲授回写”是它的开关。

**幻灯片的默认主题“书卷”**（`packages/render-slides/theme/`）：

- 文稿的 `renderers.slides.theme` 不写时，幻灯片渲染端把这个本地主题写进生成的 Slidev 文稿，写成相对于生成的文稿目录的路径（Slidev 把头部的配置连同主题名打进产物，产物中不能有本机的路径；Slidev 找不到本地主题时不报错，`e2e/plugin-ui.spec.ts` 的版式断言会失败）；`theme: default` 是 Slidev 自己的默认主题。主题只用 Slidev 的公开接口：`layouts/`（`default`、`cover`）、`styles/index.ts`、`setup/shiki.ts`、`setup/mermaid.ts`（上文的图表）、`setup/vite-plugins.ts`，以及 `package.json` 中的 `slidev.colorSchema: both` 和 `slidev.defaults`（三种西文字体随包，`provider: none`）。
- 样式取宿主的令牌（主题引入 `@presmium/host/design.css`）。Slidev 的暗色模式在 `<html>` 上设 `dark` 类，令牌随之切换。画布仍是 980 px 宽：标题 40 px，用衬线体；正文 18 px，讲义自己的段落与列表用衬线体，组件保持无衬线体；代码 14 px，幻灯片占满 1280 px 宽的屏幕时为 18 px 以上。代码的颜色是令牌中的 `syntax-*`，写成明暗两个 Shiki 主题，Slidev 的 Monaco 编辑器也用它们。
- `default` 版式：标题上方是这一节所在的章，底部是讲义标题、步骤条与页码。
  - 章名由渲染端写进每页 frontmatter 的 `presmiumChapter`，取比这一节层级高的、最外层的非封面章节的标题。
  - 步骤条取 `useSlideContext()` 的 `$clicksContext`，每步一段，已到的为强调色，其余为 `line-strong`；它的可访问名称是“第 n 步，共 m 步”。
  - 底部的位置由版式的 `padding-bottom` 留出，运行面板按幻灯片测得的剩余高度不会盖住它。
- `cover` 版式：标题大而靠下，上方一条强调色的短线；底部只有页码。Slidev 的其他内置版式（`center`、`two-cols` 等）取同一套颜色与字体。
- 代码按步骤高亮行时（`{code-ref}` 的 `:steps:`、`:emphasize-lines:`），Slidev 把其余的行设为 30% 的不透明度，对比度只有 1.6 至 2.5:1。书卷改为把这些行统一画成墨色与 `surface` 按 62% 混合的灰色，不带语法颜色：亮色约 4.8:1，暗色约 6.1:1，达到 AA，同时仍比高亮的行淡。
- 主题把 `--slidev-theme-background`（Slidev 以 `--slidev-theme-*` 命名主题的颜色）设为 `surface`，供画在幻灯片之外的界面取用：宿主的演讲者面板（`PresenterPanels.vue`）以它为底色，因此书卷的演讲者视图中面板随暗色切换。面板直接用令牌，任何主题下都是如此。
- `setup/vite-plugins.ts` 把每个根目录（文稿、主题与插件）在页面中运行的 setup（`main`、`code-runners`、`mermaid` 等，不含 `vite-plugins` 这类在 Node 中运行的）、`components/` 与 `layouts/` 加进 Vite 的 `optimizeDeps.entries`。Slidev 的入口只经虚拟模块到达插件的 setup 与组件，Vite 的扫描不跟进去，插件引用的包（yjs、driver.js、markmap-view 等）于是在第一个页面加载时才被发现，分几轮打包，每一轮之后重新载入页面（打印页因此也会重新载入，见 5.8 节）。加进入口后它们在服务器启动时一次打包。插件装在 `node_modules` 中时 Vite 的入口不含那里的文件，这时仍是旧的行为（渲染端为生成的文稿写的 `vite.config.ts` 可以列出插件的这些目录，交给以后的工作包）。
- 生成的文稿自己的样式 `src/deck/style.css`（代码的来源、录制的输出、卡片与栅格、现场代码的运行器、打印）不论主题都写进文稿，颜色同样用令牌。运行器（Monaco Runner）的编辑器高过 15em、输出高过 7.5em 时在其中滚动；这两条规则原在执行插件的 `styles/index.css`。

**验收**：`e2e/plugin-ui.spec.ts`（测试文稿 `e2e/fixtures/plugin-ui`，工作区 `e2e/fixtures/plugin-ui-workspace`）：

- 书卷的幻灯片：纸色底、衬线标题、章名、步骤条、页码、代码的字号与封面；
- 每一页的文字（插件组件、按步骤高亮之外的代码行、演示步进组件已完成的步骤与 Mermaid 的连线标签在内）在明暗两套下达到 WCAG AA，输入框的边框达到 3:1；演讲者视图的面板（课堂会话与课堂互动，创建课堂前后）、网页形态中的组件、图表与提问面板同样；
- 运行面板：顶栏写“Python · 浏览器中运行”并有运行按钮，在代码之上；运行后输出写“输出 · <秒数> 秒”，在幻灯片上位于代码旁边；网页与放映视图中的顶栏相同；
- 练习的对错标记、高对比度开关与分步执行的上一步、下一步是宿主的线性图标，没有字形（源码面板中问题的严重程度见 `e2e/editing.spec.ts`）；
- 工作区中，“AI 修改”停靠与收起面板，状态栏显示模型与来源，模型设置中换了服务或地址后密钥必填、在手机宽度下不超出屏幕，首页的卡片由 agent 起草。

`e2e/exec-remote.spec.ts` 另外检查令牌对话框用宿主的字段并达到 AA（需要 Docker）。`e2e/smoke.spec.ts` 的 PDF 导出与示例讲义的构建写同一个 `.presmium/slides`，用 Playwright 的测试锁（`lock`）不同时运行。这个导出在全套运行的负载下曾失败（空白的 PDF 丢失链接，或等不到页面的 `body`），原因与改法见 5.8 节：打印页在网络空闲时还没挂载应用，或页面的请求因主机的网络变化而失败；不靠重试。

示例讲义两种形态的逐页截图人工对比。

## 6. 示例文稿约定

示例文稿 `examples/demo` 是一份面向初学者的完整讲义“BPE 分词：从字节到词元”：入口 `lecture.md`（MyST）写头部与封面，各章在 `pages/` 下（`tokens.md`、`idea.md`、`implement.md`、`encode.md`、`extend.md`、`wrapup.md`），引用的代码在 `examples/sample-repo/src/bpe.py`。讲义中不出现插件 ID、内部机制这类调试性文字。“延伸”一章（`extend.md`）用上执行环境与讲授的写法，同时是讲义的一部分：同一个统计相邻对的函数用 C 在 WebAssembly 中运行，WGSL 计算着色器在 GPU 上统计字节对，Python 的会话跨三个代码块（先训练，再由只显示输出的代码块生成规则表，最后编码），“下一次合并哪一对？”的先预测再揭示，“延伸阅读”的卡片与栅格，讲解中的 `{cue}` 与 `{say}`。头部的 `renderers` 列出讲授渲染端 `lecture`（不写音色），`pnpm demo:build` 只构建网页、幻灯片与 notebook（`presmium build --to web,slides,notebook`），合成讲授的做法写在 `examples/demo/README.md`。示例工作区 `examples/workspace` 有两份文档：示例讲义的副本 `bpe/`（由 `sync.mjs` 从 `examples/demo` 复制，头部另外列出助手插件）与短文档 `glance/`，用于体验 `presmium serve`；工作区要是 git 仓库的根目录，`try.mjs` 把它复制成一个独立的仓库（带上 `examples/sample-repo` 与讲义锁定的提交，`node_modules` 链接到示例工作区安装的插件）。

功能的测试不依赖示例讲义：每组功能有自己的测试文稿 `e2e/fixtures/<组>/`，端到端用例在 `beforeAll` 中构建它们（7 节）。示例讲义由冒烟用例 `e2e/smoke.spec.ts`（三种媒介都能无警告地构建，网页与幻灯片都能打开并翻页）与 `e2e/demo.spec.ts`（“延伸”一章在两种形态中打开，C 程序在浏览器中的输出与构建时的录制相同，着色器在 WebGPU 适配器上得到录制的结果）使用；`e2e/demo-workspace.spec.ts` 检查 `presmium serve examples/workspace` 的首页列出两份文档、`bpe/` 与示例讲义一致，并在 `try.mjs` 做出的副本上打开两份文档。构建产物位于 `examples/demo/dist/<渲染端 ID>/`。`lang` 是文稿的语言，决定两种形态的界面语言（5.7 节）。示例文稿的 `.presmium/` 中只提交执行缓存 `freeze/` 与锚点锁定文件（4.3 节）。

## 7. 测试策略

只写集成测试，不写单元测试：测试在真实组装的系统上运行，不对单个函数做隔离测试，不用 mock 替代宿主框架。每条验收标准对应一到两个用例。

| 层级 | 工具 | 范围 | 命令 |
|---|---|---|---|
| 结构检查 | `scripts/check-layering.mjs`、`scripts/check-skills.mjs`、`scripts/check-plugins.mjs`、`scripts/check-packages.mjs` | 第 3 节的分层规则；技能与代码一致（指令、命令及其选项）；每个 Node 插件声明 `version` 与当前内核满足的 `kernel` 范围（4.2 节）；每个包按 `.changeset/README.md` 的表公开或私有，公开的包有许可证、同一版本、`engines`、元数据与只含发布所需的 `files`，插件以对等依赖使用共用的包 | `pnpm test` |
| 消费者安装 | Vitest、Playwright | `scripts/consumer.ts` 用 pnpm 打包全部公开的包，在单仓之外的临时目录中用 npm 安装（另加一个从自己的压缩包安装的第三方插件）；`packages/cli/test/consumer.test.ts` 在其中运行 `check`、三种形态的 `build`、`dev`、`serve`（站点在项目之外，从随包的模板新建文档）与不兼容插件的诊断，`e2e/consumer.spec.ts` 在浏览器中看插件的组件 | `pnpm test`、`pnpm e2e` |
| 集成 | Vitest | 真实运行 CLI、构建产物检查、服务端（`packages/<pkg>/test/`）；运行 `slidev export` 的用例是单独的项目 `export`，在其他用例之后运行 | `pnpm test` |
| 构建 | `presmium build` | 示例文稿编译并生成全部媒介（网页、幻灯片、notebook） | `pnpm demo:build` |
| 检查 | `presmium check` | 示例文稿全部检查项通过 | `pnpm demo:check` |
| 端到端 | Playwright | 构建产物上的行为（`e2e/`）：全部用例在 Chromium 中运行，冒烟用例另在 Firefox 与 WebKit 中运行 | `pnpm e2e` |
| 升级闸门 | Vitest、Playwright | 五组与 dsh 相关的用例：行 ID、经 bundle 的假模型用例、客户端的启动审计、Host API 的 schema、工作台的端到端用例（`design-dsh.md` 第 12 节）；用例名带 `[gate]` 或标签 `@gate` | 随 `pnpm test` 与 `pnpm e2e` 运行，升级 dsh 时单独运行 |
| 全部 | | 以上依次执行 | `pnpm verify` |

端到端测试的约定：

- 示例文稿的产物 `dist/` 是一个站点（网页在 `/web/`，幻灯片在 `/slides/`，2.1 节的默认 `base`），服务在 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT`（默认 4173、4174）。同时构建两种形态的测试文稿同样把 `dist/` 作为一个站点服务（`serve(dir,'/slides/')`，`buildFixture` 自动这样做）。并行的检出各用一对端口；端口被占用时报错，不复用别处的服务。幻灯片通过 `/<页号>?clicks=<步骤>` 定位，演讲者视图为 `/presenter/<页号>`。
- 需要专用文稿的用例（宿主适配、另一种界面语言、性能、课堂服务）在 `beforeAll` 中把测试文稿写到 `examples/demo/.presmium/e2e-*`（不入库，插件从示例文稿的依赖中解析），用真实的 `presmium build` 构建，再在空闲端口上服务产物。测试文稿放在 `e2e/fixtures/<组>/`。
- 性能用例（`e2e/perf.spec.ts`）是单独的 Playwright 项目，依赖 Chromium 项目，在其他用例结束后运行，计时不与其他用例争用机器。单独运行它要加 `--no-deps`：`pnpm exec playwright test e2e/perf.spec.ts --no-deps`；不加时 Playwright 先运行全部 Chromium 用例。
- 其他浏览器：`PRESMIUM_E2E_BROWSERS` 列出冒烟用例另外运行的浏览器，默认 `firefox,webkit`。没有安装，或在本机无法启动的浏览器（WebKit 需要很多 Linux 主机缺少的系统库）被跳过，并提示安装命令（`pnpm exec playwright install <浏览器>`、`pnpm exec playwright install-deps <浏览器>`）；WebKit 也可以在 Playwright 的 Docker 镜像中运行（`browsers.md`）。真实的 Safari、Edge 与前一个大版本在发布前按 `browsers.md` 手工检查并记录。
- 集成测试分两个 Vitest 项目（`vitest.config.ts`）：`integration` 与 `export`。`export` 是运行 `slidev export` 的三个测试文件（`render-slides/test/slides.test.ts`、`addon-publish/test/export.test.ts`、`diff.test.ts`），在 `integration` 结束后运行：`slidev export` 用 Slidev 的开发服务器服务文稿，等浏览器空闲后打印，机器被其他用例的构建占满时它会在页面就绪前截图或超时。单独运行一组：`pnpm exec vitest run --project export`。
- 集成测试运行 CLI 用 `@presmium/cli/testing` 的 `presmium(cwd, args, env?)`：它去掉 Vitest 设置的 `NODE_ENV=test`，构建与作者、端到端用例在同一模式下运行。端到端的测试文稿与服务用 `e2e/fixtures/deck.ts` 的 `useFixture`、`buildFixture`、`serve`、`startDev`、`openSlide` 等。
- 手工起的静态服务器在重新构建后要重启：sirv 启动时读取一次文件列表，之后新生成的文件（带哈希的 `assets/`）它找不到，页面报 404 或白屏；经常重建时用 `sirv --dev` 启动，它每次请求都查找文件。

外部服务一律用说同一协议的真实实现来测试，不 mock 宿主框架，也不在进程内替换被测的边界：

| 对象 | 测试方式 |
|---|---|
| 服务端 | 对测试文稿真正运行 `presmium dev` 与 `presmium serve`，用 `fetch` 访问渲染端开发服务器代理过来的 `/__presmium/` 路由；请求来源的检查由 Node 端的用例以原样的 `Host` 与 `Origin` 请求头验证：别的名字与其他站点的页面被拒绝，`presmium serve --host` 时本机的局域网地址与名字被接受 |
| 远端环境 | `templates/env/compose/` 的模板起一个真实的 `jupyter_server`，浏览器与编译时都在其中运行代码；会话隔离用两个浏览器上下文验证。本机没有 Docker 时这些用例跳过并说明原因（同本地环境插件） |
| WebAssembly | 真实的 WASI 运行时；编译时把构建机的 `PATH` 换成不含 C 工具链的目录，证明不需要本机工具链；断网（`context.setOffline(true)`）验证离线 |
| WebGPU | 默认的无头 Chromium 没有 GPU 适配器，正好验证回退；用例另以 `test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] } })` 验证执行路径与“CPU 模拟”的计时标注 |
| MCP | MCP SDK 的客户端（`@modelcontextprotocol/client`）连接 `/mcp` 与 `presmium-mcp`，逐个调用工具；确认经控制通道回答 |
| agent | ACP 协议的确定性测试 agent（`packages/addon-assistant/test/fixtures/scripted-agent.mjs`，用 `@agentclientprotocol/sdk` 的 agent 端写成的真实子进程）：按问题中的指令行事（默认以给它的 MCP 服务列出工具、`get_section` 后给出带引用的回答，`#cite <章节>` 改引用的章节，`#write <文件>` 请求写文件的权限，`#wait` 等到 `session/cancel`），`SCRIPTED_AGENT_LOG` 给出时把它的环境、`session/new` 的参数、列出的工具、权限的结果与取消写进这个文件；助手按 `PRESMIUM_AGENT_COMMAND` 或 `settings.presmium.assistant.command` 启动它（替换运行时的同一条路）。随包的 DeepSeek Harness 不调用模型的部分（启动、`initialize`、`session/new`、`--dump-config` 校验三份模板）用假的 `DEEPSEEK_API_KEY` 对固定版本运行（测试另以 `HTTPS_PROXY` 指向一个只记录的代理，确认没有请求发出）；要回答的用例以测试起的 Messages 兼容服务（`@presmium/cli/testing` 的 `fakeModel`，源码 `packages/cli/src/fake-model.ts`；按脚本给出文字或工具调用的 SSE，只有提供工具的请求即 agent 的 turn 按脚本走，会话标题等其他请求另有固定的回答，可以暂缓回答）为 `PRESMIUM_MODEL_URL` 运行真正的 DeepSeek Harness；调用 DeepSeek 真实模型的用例需要 `DEEPSEEK_API_KEY`，默认跳过 |
| 修改审阅 | git 实现：临时目录中的真实 git 仓库；deltabox 实现：真实的 `deltabox-lite`（Node 绑定），不满足条件（平台、glibc、FUSE、Landlock）时跳过并说明原因 |
| 语音 | 确定性的假引擎（`presmium-speech fake`）：真实的 HTTP 服务，同一协议，测试经 `PRESMIUM_SPEECH_FAKE_URL` 与 `PRESMIUM_SPEECH_FAKE_PROVIDER=Presmium fake` 把它定义为引擎 `fake`（与真实引擎同一条配置路径）；中文每字 220 ms、拉丁字母每字 60 ms、词间 80 ms，合成的 WAV 中嵌入文字与音色，合成后再转写可以精确往返；音色列表中有一个克隆音色，用于同意记录的用例；用例数它收到的请求，验证缓存命中时不再合成。火山引擎与 Groq 的冒烟用例只在设置了 `PRESMIUM_TEST_VOLCENGINE_KEY`、`PRESMIUM_TEST_GROQ_KEY` 时运行 |
| 讲授 | 录制：Chromium 的假麦克风播放假引擎合成的音频（`--use-fake-ui-for-media-stream`、`--use-fake-device-for-media-stream`、`--use-file-for-fake-audio-capture=<wav>%noloop`，以 `test.use({ launchOptions })` 只加在讲授的用例上），讲授轨中有 `go` 与 `point`，回放到时刻 t 显示正确的章节与步骤（`e2e/lecture.spec.ts` 用假设备自带的音调与假摄像头，不加 `--use-file-for-fake-audio-capture`；回放的测试讲授轨带一段构建前写入的静音 WAV，所以走 `MediaClock`）；脚本化：用假引擎构建测试讲义，检查片段、VTT 与提示标记的时刻 |
| dsh | 锁定版本的真实 dsh（headless、acp 与 web 载体），每个用例自己的 `DSH_HOME` 与 `HOME`；模型是 `@presmium/cli/testing` 的脚本化 Messages 兼容假模型，断言请求体中没有上传的字段、技能目录中没有用户的技能、测试目录之外没有写入。`packages/dsh/test/harness.ts`（端到端用例也用它）：`testHome(prefix)` 在临时目录中给出 `HOME`、`XDG_*`、`DSH_HOME` 与干净的环境，`profile(carrier)` 按 `@presmium/dsh/launch` 写 profile 并链接 bundle，`dump(carrier)`、`headless(cwd, prompt, { model })`、`acp(cwd)`、`web(cwd, port, { model })`（`api()` 以令牌换 cookie，`call(endpoint,args)` 调 Host API，`fetch(path)` 带 cookie）、`serve(root)`（`presmium serve` 加服务令牌，`env` 是交给 dsh 的 `PRESMIUM_SERVICE_URL` 等），`homeEntries()`；`workspace(prefix, files, link)` 在 `examples/demo/.presmium/` 中建一个自己的 git 仓库（dsh 的项目根因此是它，不是本仓库与它的 `.agents/skills`）；`turns(model)`、`toolResults(model)` 读假模型收到的 agent 请求与工具结果 |
| 工作区 | 临时目录中的真实 git 仓库：文档操作与撤销各形成正确的提交（读 `git log` 与尾注）；局域网访问与课堂同步在 `presmium serve --host 0.0.0.0` 上，浏览器以本机的局域网地址打开页面（本机没有局域网地址时跳过） |

服务端的用例：`packages/server/test/server.test.ts` 对测试文稿运行 `presmium dev`；`serve` 模式的用例由测试用的宿主 `packages/server/test/fixtures/serve-host.ts` 启动（以子进程调用真实的 `startServer`，文档用真实的编译器编译），`presmium serve` 本身的用例在 `cli/test/serve.test.ts` 与 `e2e/workspace.spec.ts`。浏览器不允许 `fetch` 设置 `Host`，Node 端的用例用 `node:http` 发送原样的请求头。

这些用例的启动参数只加在各自的 spec 中，`playwright.config.ts` 不为它们增加项目。需要 Docker、GPU 或模型凭据的用例跳过时打印原因与启用方法，不算失败。

辅助命令（插件包与服务包的可执行文件）：

| 命令 | 包 | 选项 | 作用 |
|---|---|---|---|
| `presmium-export [deck]` | `@presmium/slidev-addon-publish` | `--format pdf\|png`、`--output <file>`、`--with-clicks`（每步一页）、`--range <1,3-5>`、`--dark`、`--wait <ms>`（打印页加载后再等待的时间，默认 1000）、`--timeout <ms>`（打印页的加载时限，默认 120000）、`--json` | 准备幻灯片渲染端的 Slidev 文稿（不完整构建）后运行 `slidev export`（`--wait-until networkidle`）；`slidev export` 在根路径服务文稿，所以文稿按 `base` 为 `/` 准备（`prepare` 的 `base` 选项），不论幻灯片构建时的站点路径。`slidev export` 在打印页还没显示全部幻灯片时截图也以 0 退出（机器繁忙，或文稿第一次导出时 Vite 优化依赖并重新加载页面）：导出缺少某张幻灯片的页（PNG 中没有它的图片，PDF 的页数少于幻灯片数）时报错退出（退出码 2）并提示加大 `--wait`。每张幻灯片的页数按 Slidev 的点击数，不按 IR 的步骤数（导出中组件显示静态的 `fallback`，没有自己的步骤）。PDF 导出后检查每个链接仍是链接（PNG 报告链接无法检查） |
| `presmium-diff <refA> <refB> [deck]` | 同上 | `--out <dir>`、`--threshold <ratio>`、`--wait <ms>`、`--install`、`--json` | 两个提交的视觉差异：幻灯片逐页，网页逐页（文档视图）与逐节（放映视图）截图比较，报告写在 `.presmium/diff/` |
| `presmium-classroom-server` | `@presmium/classroom-server` | `--port <n>`（默认 1234，`0` 取空闲端口）、`--host <address>`（默认全部网卡）、`--deck <dir>`（归档写到 `<dir>/.presmium/classroom/`） | 课堂服务（y-websocket）；启动后打印服务地址与局域网地址。发布到静态托管的文稿用它（头部的 `presmium.session.server`）；`presmium dev` 与 `presmium serve` 在自己的端口上提供同一协议的课堂同步，不必另起进程（10.2 节） |
| `presmium-language-server` | `@presmium/language-server` | `--stdio`、`--node-ipc`、`--socket=<port>` | 语言服务，VS Code 扩展启动它 |
| `presmium-mcp [deck]` | `@presmium/mcp` | `--allow operate`（不加时不提供操作类工具） | 以 stdio 提供与 `/mcp` 相同的读取类工具，供编辑器中的 agent（Claude Code、Codex、VS Code）使用；没有放映位置与课堂 |
| `presmium-lecture export [deck]` | `@presmium/slidev-addon-lecture` | `--track <id>`（默认合成的讲授 `script`，否则唯一的录制讲授）、`--out <file>`（只能是 `.webm`，默认 `<deck>/dist/<id>.webm`；不导出 MP4）、`--size <宽x高>`（默认 1280x720）、`--fps <n>`（默认 10） | 构建网页与讲授（工作目录 `.presmium/lecture-export`，结束后删除），用 Playwright 的 Chromium 逐帧播放讲授并截图，在另一个页面中用 Mediabunny 的 WebCodecs 路径把画面与音频（合成的片段或录音，各在其时刻）合成为 WebM（VP9 或 VP8、Opus）；合成的声音在文件的标签中带 `AIGC` 标识。退出码 0 完成，2 用法错误或失败 |
| `presmium-speech fake` | `@presmium/slidev-addon-speech` | `--port <n>`（默认取空闲端口）、`--host <地址>`（默认 `127.0.0.1`） | 确定性的假引擎，打印 `fake  <地址>`（`http://…/v1`，作为 `PRESMIUM_SPEECH_FAKE_URL`）。OpenAI 音频接口的形态加 Presmium 的扩展：`audio/voices`（音色 `alpha`、`beta` 与克隆音色 `cloned-lin`）、`audio/speech`、`audio/speech/timestamps`、`audio/transcriptions`；合成的 WAV（8 kHz，每词一个音调）在 `pmfk` 块中嵌入文字、音色与逐字时间，转写读回它们；`GET /requests` 列出收到的请求（方法、路径、`Authorization`），供用例计数 |
| `presmium-speech consent` | `@presmium/slidev-addon-speech` | `<引擎> <音色> <记录文件>`、`--operator-dir <目录>`（默认为当前工作区的运营者目录或 `PRESMIUM_OPERATOR_DIR`，10.5 节；同样不能在工作区之中） | 运营者登记克隆音色的同意记录：记录是 JSON `{ speaker, scope, date, statementSha256 }`，校验后写入运营者目录中的 `<consentDir>/<引擎>/<音色>.json`（`consentDir` 取当前工作区配置的 `settings.presmium.speech.consentDir`，权限 0600）。与所有者经语音插件路由的登记效果相同（第 11 节） |

## 8. 用例的分布

每个包的集成用例在 `packages/<包>/test/`，端到端用例在 `e2e/`，按功能命名；需要专用文稿的用例把文稿放在 `e2e/fixtures/<组>/` 或 `packages/<包>/test/fixtures/`（第 7 节）。

## 9. 已知风险

### 9.1 仍在使用的框架内部接口

下表列出代码仍依赖、而框架文档没有写明的接口，以及升级框架后会暴露变化的用例。升级 Slidev 或 VitePress 时先运行这些用例。

| 内部接口 | 位置 | 守护用例 | 后续 |
|---|---|---|---|
| VitePress 1.6 本地搜索的虚拟模块 `/@localSearchIndex`、`/@localSearchIndexroot`（有译本时另有每种语言的 `/@localSearchIndex<语言>`），以及搜索框对索引模块的热更新：开发与构建中都拦截这些模块，换成网页渲染端从 IR 生成的索引（与 VitePress 同样的 MiniSearch 索引，每个章节一个文档，按文稿顺序加入；工作区站点中另有其他文档的章节）。构建中索引因此确定，产物与 Service Worker 的缓存版本在每次构建中相同（VitePress 并发建索引，顺序取决于页面完成的先后）；开发中索引随编辑更新（VitePress 1.6 开发模式只在启动时建索引） | `packages/web/src/node/vite.ts` | `e2e/web.spec.ts`“a Chinese keyword is found within 300 ms”与“search keeps working offline”（构建）、`e2e/viewer.spec.ts`“a keyword written while the server runs can be searched”（开发）、`e2e/site.spec.ts`“a word only another document holds is found”（工作区站点）、`cli/test/repro.test.ts`（重复构建的字节一致） | VitePress 固定为 1.6.4；VitePress 提供确定的构建索引与开发中的索引更新后移除拦截 |
| Slidev 的根组件钩子 `setup/root.ts`（`defineRootSetup` 只出现在 `@slidev/types` 的类型中，文档没有列出），以及它在全部 `setup/main.ts` 之后运行的顺序：幻灯片形态在这里启动内核，发布插件在这里读取打印模式 | `packages/addon-core/setup/root.ts`、`packages/addon-publish/setup/root.ts` | `e2e/core.spec.ts`（启动报告与服务依赖）、`addon-publish/test/export.test.ts` 与 `diff.test.ts`（打印与视觉差异的样式） | 改用文档化的钩子或全局图层 |
| Slidev 幻灯片内容层的类名 `.slidev-slide-content`：冻结画面复制它的各层 | `packages/addon-stage/global-top.vue` | `e2e/stage.spec.ts`“f freezes the audience view” | 改用全局图层自己的结构 |
| Slidev 演讲者备注的类名 `.slidev-note-with-clicks`、`.slidev-note-fade`：突出当前步骤的备注 | `packages/addon-stage/style.css` | `e2e/stage.spec.ts`“presenter notes highlight the current step” | 没有文档化的替代，由用例守护 |
| Slidev 绘图的状态 `drawingState`（`@slidev/client` 导出，形状为页号到该页 SVG 的映射，文档没有描述）与开发服务器保存标注的文件名 `<页号>.svg`：舞台插件把标注写回文稿的 `.presmium/drawings/`，删除一页的全部标注时删去该文件 | `packages/addon-stage/setup/main.ts`、`packages/addon-stage/setup/vite-plugins.ts` | `addon-stage/test/drawings.test.ts` | Slidev 提供写回标注的钩子后改用 |
| VitePress 默认主题给侧栏与上下章链接的屏幕阅读器标签的元素 ID `sidebar-aria-label`、`doc-footer-aria-label`，与导航栏菜单按钮的类名 `.VPNavBarHamburger`、`.VPNavBarExtra > button`（它们的 `aria-label` 写死为英文；主题配置没有这些标签）：网页主题在页面渲染后与每次换页后按文稿语言改写它们的文字与 `aria-label`（5.7 节） | `packages/web/src/client/theme.ts` | `e2e/web.spec.ts`“a zh-CN deck speaks Chinese around the content” | VitePress 提供对应的主题配置后改用 |
| Slidev 的 Monaco Runner 的内部 DOM：运行之前的提示（“Click the play button to run the code”）是 `.slidev-monaco-container` 中 UnoCSS 类 `.opacity-50` 的元素，不透明度 0.5 时对比度低于 AA；幻灯片样式把它提高到 0.75（带 `live` 或 `both` 的代码块写成 `{monaco-run}` 之后） | `packages/render-slides/src/deck/style.css` | `e2e/publish.spec.ts`“every slide reaches WCAG AA” | Slidev 提供运行器提示的样式变量后改用 |
| VitePress 默认主题的内部 DOM（文档只给出 CSS 变量、布局插槽与主题配置）：网页样式中导航栏标题的 `.VPNavBar .container > .title`、`.VPNavBarTitle a.title > span`（长标题换行而不压住导航），侧栏一级条目的 `.VPSidebarItem.level-1 > .item .text`（章的字重）。能改用 CSS 变量、布局插槽或侧栏项的 `class` 的选择器已经改掉，这里列出的是保留的 | `packages/web/src/client/style.css` | `e2e/web.spec.ts` 的长标题用例与侧栏字重的断言 | VitePress 提供对应的 CSS 变量或插槽后改用 |

已经去掉的依赖：高对比度主题原先按 Slidev 的类名 `.slidev-code-dishonored` 提高被代码步骤淡化的行的不透明度。现在发布插件读取代码行（Shiki 输出的 `.line`）的计算不透明度，给低于 0.6 的行加上自己的 `data-pm-dimmed` 属性（`packages/addon-publish/src/client/code-lines.ts`），由 `e2e/publish.spec.ts`“every slide reaches WCAG AA”守护。

dsh 的客户端接口中没有文档的部分（客户端包的工厂格式 `__ModuleLoader__.load`、ui-slots 与 client-store 的类型、外壳的模块表），以及只有 README 描述的布局契约（`root` 的子槽位与 `ctx.layout`），只出现在 `@presmium/dsh` 的客户端部分，由升级闸门的第 3 组用例守护（第 13 节）。

### 9.2 设计取舍与扩展点缺口

已经做出的取舍：

| 事项 | 现状与理由 | 决定 |
|---|---|---|
| 共享内核中的业务契约 | `@presmium/kernel` 除元能力外还定义了几个插件共用的业务服务契约：`EXECUTOR` 与 `RunRequest`、`SessionService`、`Role`、`ClassroomStore`，以及代码节点的 `run` 与 `outputs`。这是 4.5 节有意的选择：服务的提供方与使用方分属不同插件，契约只能放在双方都依赖的包中；契约放在内核 | 保留在内核包中。契约还有语音、智能体、修改历史、确认与操作词汇，`contracts.ts` 按领域拆为几个模块并统一再导出，入口 `@presmium/kernel/contracts` 不变。移到单独的契约包成本很低，契约稳定之后再评估 |
| 网页的 Service Worker 手写 | 网页渲染端在 VitePress 构建完成后生成约 70 行的 Service Worker（`packages/web/src/node/offline.ts`）：此时页面、搜索索引与 Pyodide 运行时都已写出，按产物内容计算缓存版本，并把无扩展名的页面地址对应到 `.html`。`vite-plugin-pwa` 只用于幻灯片形态：VitePress 在 Vite 客户端构建之后才渲染 HTML 页面，在 Vite 构建中生成的预缓存清单拿不到这些页面，需要专门的 `@vite-pwa/vitepress` 集成 | 保留手写的 Service Worker：它预缓存产物中的全部文件，所以 WASI 运行时、发布的文件与同站点下讲授的片段都在离线范围内，不需要新的机制。不再计划换成 `@vite-pwa/vitepress`。网页形态的 Service Worker 改为在安装时只预缓存站点与内容，执行运行时（`wasi/`、`pyodide/`、jax-js）在第一次使用时缓存，另有“保存以离线使用”一次取得；幻灯片形态照旧全部预缓存。发布的文件按 `publishedUrl` 的写法（每段一个 URL 组件）列入缓存，与页面请求它们的地址一致。网页一侧的改动在 `packages/web/src/node/offline.ts` |
| 网页按插件 ID 读取发布插件的配置 | `packages/web/src/domain/config.ts` 读取 `presmium.publish` 的 `offline` 决定是否生成 Service Worker：网页渲染端因此知道一个插件的配置键 | 保留。这是一个只读的配置键，代价小于为此增加渲染端扩展点；没有第二个插件需要参与网页构建（文件发布属于网页渲染端自己） |
| 幻灯片形态中的现场执行代码块 | 带 `:run: live` 或 `:run: both` 的普通代码块在网页形态中有运行按钮；幻灯片渲染端把它写成普通代码块，没有运行按钮，只有执行面板能在幻灯片中运行代码。`setup/code-runners.ts` 已经通过 `executor` 服务支持 Slidev 的 Monaco Runner（Python、JavaScript、TypeScript），但 MyST 源码无法写出 `{monaco-run}` | 幻灯片渲染端把带 `live` 或 `both` 的代码块写成 Slidev 文档化的 `{monaco-run}` 代码块，执行插件的 code runner 把 `executor`、`session` 放进请求，富输出按 Slidev code runner 的 HTML 输出显示 |
| 课堂笔记依赖 IR 运行时的标记 | 课堂插件的笔记图层按 `.pm-section[data-section]`、`.pm-block[data-block]` 定位章节与块。这两个属性因此是 IR 运行时对外的契约，修改时须同时修改笔记图层 | 正式作为 IR 运行时对外的标记契约：讲授的指针录制与编辑模式的批注同样据此定位，`domain-model.md` 第 9 节列出，`e2e/web.spec.ts`（每个块渲染为 `.pm-section[data-section] .pm-block[data-block]`）与 `e2e/classroom.spec.ts`（笔记按这两个属性定位）守护。不另加挂载点接口 |
| 首选执行器 | 代码块的 `:executor:` 在浏览器中只是首选：指定的执行器没有注册或不支持该语言时，由路由按语言与优先级另选 | `RunRequest.executor` 精确匹配，指定的执行器不可用时返回失败，显示录制输出，不回退到其他执行器 |
| 本地环境的 Python 运行器 | 容器执行器在容器中运行自己的 Python 运行器（`packages/addon-exec-local/src/node/runner.py`），按 `RunRequest` 的约定处理参数、标准输入与文件，与执行插件的运行器（`packages/addon-exec/src/runner.py`）规则相同。两个插件包不互相引用（第 3 节），所以各有一份 | 运行器作为共享内核的资源发布（`@presmium/kernel/runner.py`，`package.json` 的 `exports` 指向文件；内核不读它，只发布），两个插件共用，会话与富输出也只实现一次 |

### 9.3 框架的已知问题

| 问题 | 来源 | 影响与处理 | 守护用例 |
|---|---|---|---|
| 幻灯片形态的控制台报 “Failed to patch FloatingVue: TypeError: Cannot read properties of undefined (reading 'Popper')”：构建产物（`presmium build` 生成的 `dist/slides`）与 Slidev 的开发服务器（`presmium dev --to slides`、`slidev export` 与 `presmium-export`）中都出现，每次打开页面一条 | Slidev 53 的 `setup/main.ts` 在每份文稿中安装 `@shikijs/vitepress-twoslash` 4.5 的 Twoslash 弹出层；它对 floating-vue 菜单组件的补丁按旧的组件结构查找 `components.Popper`，而 Slidev 依赖的 floating-vue 5.4 的菜单组件已没有这个结构（三者都是 npm 上的最新版本） | 只影响在 Twoslash 弹出层上拖动时不弹出，生成的文稿不含 Twoslash 代码；错误被它自己捕获并打印，不影响页面。不打补丁，等上游修复 | `e2e/smoke.spec.ts`“the slides open … with no error in the console”：控制台没有其他错误 |
| 代码块属性中的对象不能嵌套：```` ```ts {monaco} { editorOptions: { wordWrap:'on'} } ```` 这类写法（`vendor/docs/slidev/custom/config-monaco.md` 的例子）在 `slidev build` 中报 “Error parsing JavaScript expression” | Slidev 53 从代码围栏的信息串中读属性时只读到第一个 `}`（实测） | 幻灯片渲染端不在信息串中写嵌套的对象：`{monaco-run}` 的 `runnerOptions` 引用生成文稿头部中的值（`$slidev.configs.presmiumRuns[…]`，4.6 节） | `e2e/exec-env.spec.ts`“in the slides, Python code with :run: live runs in the Monaco Runner” |
| 幻灯片中导入 jax-js 的现场代码（`{monaco-run}`）使 `slidev build` 报 “Package "@jax-js/jax" not found in …/.presmium/slides” | Slidev 为 Monaco 代码块中导入的包从生成的文稿目录查找类型（`monacoTypesSource: local`，`vendor/docs/slidev/custom/config-monaco.md`）；pnpm 布局中 jax-js 只在 WebGPU 插件的依赖里（实测） | 现场的 JavaScript、TypeScript 代码导入了从生成文稿的目录找不到的包时，渲染端在生成文稿的头部写 `monacoTypesSource: none`（`renderers.slides.monacoTypesSource` 优先），编辑器中不显示这些包的类型；运行不受影响 | `e2e/exec-webgpu.spec.ts`（测试文稿不写这个选项，幻灯片照常构建） |
| 测试中的幻灯片控制台报 “Wake Lock permission request denied” | Slidev 的 `wakeLock` 选项（默认开启）在放映时请求屏幕常亮，Playwright 驱动的浏览器拒绝请求 | 被拒绝时只多这一条错误，页面照常；讲者的浏览器允许时屏幕在放映中保持常亮，所以不关闭该选项 | 同上 |

### 9.4 残余风险

服务端只供运行它的那个用户使用（10.1 节）。这里写明这个用户自己的代码、文稿与 agent 之外的措施之后仍然存在的风险，哪些秘密是拿得到的；第 11 节的措施不声称挡住它们。没有多人共用一个服务端的部署。

`presmium dev`、`build`、`check` 与 `presmium serve`：唯一的用户就是运营者，下列代码都以这个用户的 uid 运行，能读写这个用户能读写的一切，清理环境变量只挡住无意的泄露：

| 代码 | 拿得到什么 | 已有的纵深防御 |
|---|---|---|
| 编译时执行的代码（没有进程沙箱时） | `presmium` 进程与 agent 进程的 `/proc/<pid>/environ`：`DEEPSEEK_API_KEY` 或 `PRESMIUM_MODEL_KEY`、`PRESMIUM_SPEECH_<ID>_KEY`、`PRESMIUM_ENV_<名>_TOKEN`；`~/.ssh`、`~/.config` 等用户文件；Docker 的套接字（用户在 `docker` 组中时等于 root）与 D-Bus 会话总线；任意网络；运营者目录（可以伪造同意记录）；任何文档目录 | `RunContext.env` 只有清理过的变量；主机满足条件时（Linux，10.6 节）默认经进程沙箱运行：看不到沙箱外的进程与 Unix 套接字，网络全部拒绝，只能写运行目录。进程沙箱中 `/tmp` 仍可读（deltabox 固定允许），文稿目录、解释器的安装目录与执行器的包所在的最外层 `node_modules` 只读；代码留下的子进程（含以 `setsid` 离开进程组的）在运行结束、超时或中止时被结束；既改了工作目录又不再持有命令输出的分离进程除外，它留在沙箱中直到自己退出 |
| agent（DeepSeek Harness）与它的 shell 命令 | 同上：DeepSeek Harness 的沙箱只管文件的写入（`workspace-write`），不隐藏进程与网络，`workspace-write` 另允许写它的临时区域（Linux 上 `/tmp` 之下的路径，不询问）；agent 自己的环境中有模型的密钥 | 写到工作目录之外、shell 与网络的权限请求经所有者（本机用户）确认；修改经审阅后才提交，可以全部或逐个文件拒绝 |
| agent 写进被 `.gitignore` 忽略的路径 | git 实现的审阅不含被忽略的文件：agent 写进文稿目录的 `node_modules/` 或 `.presmium/` 中工作目录的文件不出现在差异中，拒绝时也不恢复；`presmium dev` 加载文稿目录 `node_modules` 中的插件，这样写入的包在下一次启动时在 `presmium` 进程中运行 | 无（agent 本来就有 shell，能直接做同样的事） |
| 文稿声明的本地容器（`kind: devcontainer`） | 容器定义来自文稿，可以挂载主机的任意路径或以特权运行，等于用户的 Docker 权限 | 命令行只得到 `RunContext.env` 与 Docker 客户端的变量；不经进程沙箱（要用 Docker 的套接字） |
| 文稿目录中的 Node 插件与渲染端包（`presmium dev`、`serve`、`build`、`check` 都接受相对路径与文稿目录的 `node_modules`） | 在 `presmium` 进程中运行，拿得到进程的全部环境 | 无 |
| 文稿的组件与原始 HTML（浏览器中） | 以开发服务器的源运行，能以本机作者（所有者）的身份调用 `/__presmium/` 路由，包括回答确认、接受审阅（同源，`Origin` 检查不挡） | 浏览器的沙箱；`/mcp` 另要求令牌 |

此外，任务进行中作者对同一文档目录的改动：git 实现以整个文档目录与快照比较，作者的改动出现在审阅的差异中，与 agent 的改动一起被接受或拒绝；deltabox（cbcow-through）只记录经视图的写入，作者直接写文档目录的改动不在差异中，全部拒绝（`abort`）之后仍然保留，但拒绝某个文件时从任务开始时的快照恢复，会覆盖作者对这个文件的改动；作者与 agent 改同一个文件时结果没有保证（deltabox 不支持这种竞争）。macOS 上的审阅与进程沙箱还没有实测，不启用（10.7 节）。

`presmium serve --host`（局域网访问）另有：

| 风险 | 说明与限度 |
|---|---|
| 局域网中到得了这个端口的人就是本机作者 | 没有登录：任何能连上 `--host` 的地址与端口的设备都以本机作者（所有者）的身份使用工作区，能改文档、撤销修改、运行代码、回答确认、开启 agent 的修改任务。`Host` 与 `Origin` 的检查只挡住其他站点的页面（DNS 重绑定、跨站请求），挡不住直接访问。启动时在标准错误上写明这一点；不加 `--host` 时只监听本机。只在信任的网络上使用（例如自己的设备之间），或经 SSH 隧道 |
| 课堂的学习者经同一个端口加入 | 文稿没有设置 `presmium.session.server` 时，课堂同步在服务自己的端口上（10.2 节）：学习者的设备打开的是这个服务，因此同样以本机作者的身份到达它的全部路由。课堂服务本身只让学习者写自己的条目（`classroom-server` 的规则照旧），但服务的其他部分不区分学习者。给不信任的学习者上课时，用为学生构建的静态站点（`presmium build --audience student`）与单独的 `presmium-classroom-server` |

### 9.5 依赖中已知的问题

deltabox-lite 与 DeepSeek Harness 中已知的问题，以及 Presmium 怎样绕开：

| 问题 | 上游 | 影响与处理 |
|---|---|---|
| 被沙箱的 `rm -rf` 删除一个以绝对路径拒绝的目录时，会话进入“引擎须重新打开”的故障；之前有待提交的删除时 `run --abort` 失败、会话仍挂载，被删的文件留在主机上（未入库的文件因此丢失），只有杀掉 helper 进程再 `abort` 才恢复 | deltabox-lite | 数据丢失。`addon-deltabox` 不在会话的项目中设置拒绝规则；启动时为残留的会话杀掉 helper 并 `abort` |
| 拒绝列表的缺口：与拒绝模式匹配的新文件、被拒绝目录中的新文件（`commit` 照样接受）、删除被拒绝的文件都被允许；相对的 `.git`、`.git/**` 规则被完全忽略；绝对路径的拒绝仍允许 `rm` 一个文件 | deltabox-lite | 不依赖拒绝列表：审阅会话的项目就是文档目录，进程沙箱的项目是临时的运行目录，其余路径本来就不可写 |
| `filesystem.write` 在项目内部不收窄：项目中的任何路径（含 `.git/config`、`.git/hooks/`）都可写 | deltabox-lite | 同上，以项目目录本身划定可写范围 |
| copy-private 模式中被执行的代码的父进程是带着调用者全部环境的 `deltabox` 命令行，`/proc/<ppid>/environ` 中有调用者的秘密 | deltabox-lite | 不用 copy-private（审阅与进程沙箱都用 cbcow 模式）；`addon-deltabox` 另在一个只带 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR` 的辅助进程中使用 deltabox 的 Node 绑定，deltabox 的进程都是它的后代，从它继承的环境中没有秘密（10.6 节） |
| `dsh-acp` 只把带 `callId` 的 `approval/request` 转为 ACP 的 `session/request_permission`，并且不带原因；dsh-deltabox 的任务审阅没有 `callId`，在 ACP 下落到失败关闭，agent 空闲时修改被静默回滚 | DeepSeek Harness（`dsh-acp`） | 不采用 dsh-deltabox（方案 A），由 Presmium 自己持有 deltabox 会话（方案 C）；上游修复后再评估 |

| `session.stop` 之后会话的运行时目录（`/tmp/deltabox-<uid>/deltabox-lite/<会话>/`）与项目在状态目录 `projects/` 中的登记都留在原处 | deltabox-lite | 每次编译都新建运行目录，会越积越多：`addon-deltabox` 停止会话之后自己删去（运行时目录在确认视图已卸载之后） |
| Node 绑定的 `exec` 没有取消与超时 | deltabox-lite | `addon-deltabox` 按命令行中的会话 ID 找到会话的 worker，结束它之下与它进程组中的进程 |

| cbcow-through 会话中，经视图删除（`unlink`）一个位于会话中新建的目录里的文件得到 `EIO`，会话进入“engine must be reopened after an injected fault”，之后的 `diff`、检查点、`commit` 与 `abort` 都失败（最小复现：经 `root` 依次 `mkdir d`、写 `d/t`、删 `d/t`；在根目录中新建再删除、`rename`、硬链接、`fsync`、`chmod` 都正常） | deltabox-lite 0.1.1 | DeepSeek Harness 的每次写入都这样做（目标旁边的暂存目录 `.<名>.<进程>.<UUID>.tmpdir/` 中写临时文件，`link` 或 `rename` 到目标后删去暂存目录），所以以 deltabox 审阅时随包的 agent 第一次写入就使任务失败：助手报告错误，回滚失败，文档目录中留下 agent 已写的文件与暂存目录，这份文档在进程重启之前不能再开修改任务（审阅的会话仍占着目录；出错的会话从审阅自己的快照恢复并释放目录，10.7 节）。测试 agent 直接写文件，不受影响。所以在上游修复之前，agent 是随包的 DeepSeek Harness 时助手不用 `CHANGE_REVIEW`，用自己的 git 审阅（有替换的运行时才用 deltabox），`e2e/assistant-edit.spec.ts` 中有随包的 DeepSeek Harness 在默认设置下连续两个修改任务的用例 |


DeepSeek Harness 的其他限制见 `design-dsh.md` 第 16 节。

## 10. 服务端与部署

### 10.1 进程与拓扑

> **工作台**：`presmium studio` 另有启动器与 dsh 宿主两个进程，工作区服务以 `presmium serve --headless` 运行在回环上（第 13 节）。下表中经 ACP 启动的 agent 子进程属于旧工作台，随旧工作台删去。

服务端只供运行它的那个用户使用：`presmium dev`、`build`、`check` 与 `presmium serve` 中，唯一的用户就是运营者，被执行的代码与 agent 以这个用户的身份受信任，没有登录。隔离只做纵深防御：子进程的环境清理（`RunContext.env`）；编译时的代码在主机满足条件时默认经 deltabox 的进程沙箱运行（网络全部拒绝，deltabox 的进程从环境只有 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR` 的辅助进程启动，10.6 节）；agent 用 `workspace-write` 加询问；修改先审阅再提交。同一 uid 的代码能读这个用户能读的一切（9.4 节）。多人使用时每人一个工作区（hub 托管模板）。

没有多人共用一个服务端的部署：没有登录与成员、信任模式、持有第三方凭据的另一个进程与容器编排的工作区模板。

**局域网访问**：`presmium serve` 默认只监听本机（`127.0.0.1`）。`--host <地址>`（`0.0.0.0`、`::` 或本机某个网卡的地址）让同一个用户在局域网中的其他设备上使用它：启动时在标准输出的 `serve  <地址>` 之后为每个局域网地址打印 `network  http://<地址>:<端口>/`，并在标准错误警告没有登录（任何到得了这个端口的人都以本机作者的身份使用工作区，9.4 节）；请求的 `Host` 与 `Origin` 另可以是这个地址（`0.0.0.0`、`::` 时为本机每个网卡的地址）与本机的名字（`os.hostname()` 与 `<名字>.local`），其他名字与其他站点的页面照旧被拒绝（10.3 节）。服务自己的地址（`serve` 一行，`PresmiumServer.url`）在 `0.0.0.0`、`::` 时是本机回环的地址，给出某个网卡的地址时就是那个地址。`presmium dev` 只监听本机，没有 `--host`。从别处使用也可以经 SSH 转发端口（`ssh -L <端口>:127.0.0.1:<端口> <本机>`）。

| 进程 | 作用 | 何时需要 |
|---|---|---|
| `presmium dev` 或 `presmium serve` | 编译与编译时执行、实时推送、服务端（插件的服务端贡献、MCP、agent 适配、修改提交、控制通道、课堂同步）、工作区站点的开发服务器 | 编辑、agent、远端环境的代理模式、语音、课堂 |
| agent（默认随包的 DeepSeek Harness，子进程，ACP over stdio） | agent | 使用助手时 |
| 课堂服务 `presmium-classroom-server` | 课堂同步，协议与 `presmium dev`、`serve` 自带的相同 | 发布到静态托管的文稿开课时（头部写 `presmium.session.server`） |
| Jupyter Server（容器或集群） | 远端执行 | 使用远端环境时 |

```
presmium dev（一份文稿，本机）
  浏览器 ──► 网页开发服务器（VitePress 子进程）──┐
         ──► 幻灯片开发服务器（Slidev）─────────┤ Vite 的 server.proxy：/__presmium/（含 WebSocket）
                                               ▼
                       Presmium 服务端（presmium dev 的主进程，127.0.0.1:<空闲端口>）
                       ├ /__presmium/<插件 ID>/…          插件的路由与反向代理（含课堂同步 presmium.session/sync）
                       ├ /__presmium/presmium.server/…    握手（hello）、控制通道（control）
                       └ /mcp                             MCP（令牌）

presmium serve（工作区，一个进程；默认只监听本机，--host 时也在局域网上）
  浏览器 ──► Presmium 服务端（唯一的端口，默认 4310）
             ├ /__presmium/…、/mcp      同上
             └ 其余路径 ──► 工作区站点的路由与各文档的网页开发服务器（VitePress 子进程，只监听本机，含 HMR 的 WebSocket）
```

服务端在主进程中，而不是作为 Vite 中间件挂在开发服务器里：网页的开发服务器是 VitePress 命令行起的子进程（`packages/web/src/node/vitepress.ts`），编译结果、执行器、MCP 与 agent 适配都在主进程中。渲染端只需在开发服务器的 Vite 配置中加一条代理（`RenderContext.server`）：网页渲染端写进生成的 VitePress 配置，幻灯片渲染端写进生成的 Slidev 项目的 `vite.config.ts`（Slidev 文档化的配置文件）。浏览器因此总是同源访问 `/__presmium/`，没有跨域请求。

静态构建产物不依赖服务端：渲染端不写服务端地址，`useServer().available` 为 false。浏览器内执行（Pyodide、WASI、WebGPU）、预先合成的讲授音频与录制输出照常可用；agent、远端环境的代理模式与实时转写隐藏或降级，课堂要有头部写明的课堂服务。

### 10.2 挂载

- **路径**：插件 `server(ctx)` 的贡献挂在 `/__presmium/<插件 ID>/` 下；服务端自己的路由在 `/__presmium/presmium.server/`：`hello`（`{ member,document }`）与 `control`（控制通道，10.4 节）；MCP 在 `/mcp`。
- **请求**：路由处理函数用标准 Fetch API 写，不绑定服务器框架；Node 的请求与 Fetch 之间由 `@hono/node-server` 的 `getRequestListener` 转换。流式结果用 SSE（`eventStream`，4.7 节）。
- **文档**：`useServer().fetch` 带上请求头 `Presmium-Document: <文档目录>`，服务端据此给出 `RequestContext.document`，并把请求交给该文档的插件实例。
- **反向代理**：`ProxySpec` 由 `http-proxy-3` 实现，HTTP 与 WebSocket 升级都加上 `headers`（例如远端环境的 `Authorization`），浏览器拿不到这些头。
- **宿主进程的接口**：启动服务端的命令给它一个 `ServerHost`（`@presmium/server` 自己的类型，不是内核契约）：文档列表、编译结果与诊断、运行检查、构建、运行一个代码块（MCP 的 `run_code`）；构建与运行代码块使用与该宿主的编译相同的执行选项（4.6 节，10.6 节）。编译结果是完整的文稿（没有学生视图：服务只供本机作者使用，读者得到学生版的构建）。`presmium dev` 由 CLI 在它的编译器上实现，`presmium serve` 由工作区实现；控制通道经它读取文稿。
- **转发**：`presmium serve` 中其余路径（含 HMR 的 WebSocket）转发到工作区站点（`startServer` 的 `forward()` 给出本进程中站点路由的地址）。来自局域网名字的请求以站点自己的本机名字为 `Host` 转发（10.3 节）。
- **MCP 的挂载**：`@presmium/mcp` 声明自己需要的宿主接口 `McpHost`（文档列表、编译结果与诊断、检查、构建、运行代码块、放映位置及其变化、课堂状态、跳转与开关课堂、确认），导出 `createPresmiumMcp(host)`。服务端引用 `@presmium/mcp`，在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost` 并把它挂在 `/mcp`；`presmium-mcp` 在编译器上实现它（没有放映位置与课堂）。`mcp` 不引用 `server`（第 3 节），依赖只有 `server → mcp` 一个方向。
- **MCP 的实现**：
  - `@presmium/mcp` 导出 `createPresmiumMcp(host)`（`fetch(request,caller)`、`close()`）、`serveMcpStdio(host, caller)`，以及类型 `McpHost`：`documents()`、`compile(document)`、`check`、`build(document, { to })`、`run(document, { section, block }, signal)`、`approve(request, signal)`、`offers(kind)`（种类的策略为 `off` 时不列出对应的工具），`tools(document?)`（插件的 `AgentTool` 与它们的服务），`positions(document?, member)`（`McpPosition` 带窗口所属成员的 `member`、章节 ID `section` 与窗口报告的 `trail`）、`watchPositions(listener)`、`classroom(document)`、`navigate(document, { slide, step, section, trail }, member)`、`session(document, action, name)`。`caller` 是令牌所绑定的成员与模式（`McpCaller`），由宿主校验令牌后给出。每个令牌都读完整的文稿（没有学生视图）。
  - 基于 MCP TypeScript SDK v2（`@modelcontextprotocol/server` 2.3.1，协议版本 2026-07-28）的 `createMcpHandler`：工厂按调用方为每个请求新建一个服务器实例（调用方经 `authInfo` 传入），没有会话。2025 年协议的客户端以同一个工厂无状态地服务，工具与资源照常可用，但没有接收通知的通道。`presmium://position` 的订阅是 2026-07-28 的 `subscriptions/listen`（SDK 的客户端以 `versionNegotiation: { mode: 'auto' }` 连接，再 `client.listen({ resourceSubscriptions })`），窗口报告新的位置时服务端 `notify.resourceUpdated`，订阅者收到 `notifications/resources/updated`。服务端自己校验 `Host`、`Origin` 与令牌，挂载时不需要 `@modelcontextprotocol/node`（第 12 节）。
  - 工具：读取类 `list_documents`、`deck_info`、`list_sections`、`get_section`、`get_step`、`search`、`get_code_ref`、`get_outputs`、`get_diagnostics`、`locate_source`、`get_position`、`get_classroom`（后两个只在有页面窗口的宿主中）；操作类 `navigate`、`run_code`、`build`、`classroom_start`、`classroom_end` 只给 `author` 令牌且成员是编辑者或所有者，调用时先经 `approve` 确认（`content` 范围，`member` 为令牌的成员，`from` 为 `presmium.mcp`，说明按文稿语言，如“放映跳转到「第三节」”“运行「合并」一节的 code-1”，`run_code` 的 `detail` 是代码），被拒绝时返回错误结果。读者成员的令牌只有读取类工具（本机的服务中唯一的成员是所有者）。插件的 `AgentTool` 以自己的名字登记（与内置工具同名的忽略），输入的 JSON Schema 增加可选的 `document`；`operate`、`spend` 类先确认。有多份文档时以 `document` 指定，只有一份时可以省略。路径相对于文稿目录（agent 修改源码的目录）。不提供写文件的工具。
  - 资源：`presmium://documents`、`presmium://deck`、`presmium://sections`、`presmium://sections/{section}`、`presmium://sections/{section}/steps/{step}`、`presmium://sections/{section}/outputs`、`presmium://diagnostics`、`presmium://ir`（完整文稿的 IR）、`presmium://position`（可订阅）、`presmium://classroom`。有多份文档时，一份文档的资源在 URI 后加 `?document=<文档目录>`（资源模板 `presmium://deck{?document}`、`presmium://sections/{section}{?document}` 等），不加时与工具一样只在只有一份文档时可读；`presmium://documents` 与 `presmium://position`（任一文档的位置，订阅只用这个 URI）没有这种形式。模板的匹配只看路径与查询参数 `document`：其他查询参数与参数的顺序不影响匹配（`?x=1&document=a` 同 `?document=a`，`?x=1` 同不带查询；SDK 的 `UriTemplate` 只接受模板写出的查询，`@presmium/mcp` 以它的子类 `DocumentTemplate` 覆盖 `match`）。服务说明（instructions）列出该令牌实际得到的读取类与操作类工具（含插件的）和资源：只读的令牌写明只读，有操作类工具时写明它们可能先要等人允许（在页面中），种类的策略都为 `off`（或 `presmium-mcp` 没有 `--allow`）时写明不提供操作；源码改动怎样到达工具按进程写明（`presmium dev` 保存后重新编译，`presmium serve` 在文档的文件改动后重新编译，`presmium-mcp` 在文件改动后的下一次调用时重新编译；宿主经 `McpHost.process` 给出）。
  - `search` 使用与网页搜索相同的索引：每节一个文档（标题、所在章的标题、各块的文字），MiniSearch，同样的分词与 VitePress 的搜索选项。`chapters`、`blockText` 与分词 `tokenize` 都是 `@presmium/kernel` 的纯函数（第 3 节），网页渲染端用的是同一份（生成的 VitePress 配置从 `@presmium/kernel/reading` 引入 `tokenize`），`mcp` 只依赖内核、编译器与 `minisearch`。
  - 服务端：没有给出 `ServerOptions.mcp` 时，`startServer` 在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost`（`packages/server/src/mcp.ts`）并挂在 `/mcp`。经 `MCP_ENDPOINT` 签发的令牌被 `revoke` 时，它打开着的事件流（`subscriptions/listen` 的订阅）随即结束，客户端的订阅以 `remote` 关闭。控制通道的 `positions`、`go`、`session`、`status` 可以按文档筛选；`watch` 在窗口报告新的位置时通知。MCP 的 `run_code` 的确认总是 `content` 范围。`get_position` 先取该成员放映与演讲者窗口的位置，再取其他窗口的；`navigate` 只向该成员的窗口发 `go`，该成员没有窗口显示文稿时（其他成员的窗口不算）不发出确认就返回错误。步号按调用方（完整文稿）的编号：窗口报告它在本节已到达的步骤的键（`trail`，内核的 `stepTrail`；控制通道的 `WindowPosition.trail`，至多 10000 个），另一种编号的窗口（幻灯片形态中只给其他渲染端的块不占步骤）由 `trailStep` 换算为完整文稿中这些键到达的最后一步；`navigate` 发出的 `go` 也带上到这一步为止的键，另一种编号的窗口据此找到对应的步骤。一份文档第一次被请求时还没有编译结果（`presmium dev` 刚启动）的，下一次请求再加载。
  - `presmium-mcp [文稿] [--allow <种类>]`（`@presmium/mcp` 的可执行文件）：在编译器上实现 `McpHost`，源文件（含 `{include}` 与编译的依赖）改动后在下一次调用时重新编译；与 CLI 一样带上随 CLI 安装的渲染端与 `addon-deltabox`：编译器的 `bundled` 是 CLI 的包目录（`bundledDir`：文稿项目中安装的 `@presmium/cli`，从文稿目录向上的 `node_modules` 中找；没有时是 `presmium-mcp` 随之安装的 CLI；都没有时是 `@presmium/mcp` 自己的目录），检查同 `presmium check`；没有页面窗口，不列出 `get_position`、`get_classroom`、`navigate` 与课堂工具；也没有页面可以询问，所以只提供并直接允许 `--allow` 列出的种类（`operate` 给出 `run_code` 与 `build`）。标准输出只用于 MCP，插件的日志改到标准错误。编辑器的 MCP 配置写命令 `node <仓库>/packages/mcp/bin/presmium-mcp.mjs <文稿目录>`。
  - 放映时的确认：网页形态的放映视图与演讲者视图以 `position: fixed` 的覆盖层盖住了 VitePress 导航栏中的工具栏，所以两个视图的控制条各有确认入口（`@presmium/host` 的 `PmApprovals`，放映视图的控制条在底部，面板向上打开，`placement: 'above'`）；只开放映视图时也能回答 `navigate` 等的确认（`e2e/mcp.spec.ts`）。
- **运营者设置**：`startServer` 接受 `settings`（插件 ID 到设置），交给各插件的 `ServerContext.settings` 与 `NodeServiceContext.settings`。`presmium dev`、`build`、`check` 读取工作区根目录 `presmium.workspace.yaml` 的 `settings`（没有该文件时为空），`presmium serve` 由工作区读取同一个键；都只在进程启动时读取一次，运行中改动配置文件不生效，直到运营者重启（`ir.md` 第 10 节）。
- **生命周期**：`presmium dev` 启动时为文稿创建一次各插件的贡献，头部的 `plugins` 变化时照旧提示重启；`presmium serve` 在一份文档第一次被请求时创建它的贡献。Node 端服务（`services`）与贡献使用同一份文稿配置与运营者设置；服务端另外登记 `APPROVALS` 与 `MCP_ENDPOINT`，工作区登记 `REVISIONS`、`DOCUMENT_FILES` 与 `DOCUMENT_LOCKS`（4.5 节；`presmium dev` 中也登记，见下面的“`presmium dev` 的编辑模式”）。
- **插件的来源**（4.2 节）：`presmium dev`、`serve`、`build`、`check` 都按文稿的 `plugins` 与 `renderers.<id>.package` 加载，另加运营者插件（`settings.presmium.workspace.plugins` 中声明了 `operator: true` 的，与随 CLI 安装的 `addon-deltabox`），每份文档都加载它们。
- **编译器的宿主选项**：`new Compiler(deck, options)` 的 `CompilerOptions`：`settings`（默认读取工作区根目录 `presmium.workspace.yaml` 的 `settings`，每个进程每个文件一次；文件读不出时是错误级诊断 `presmium.workspace`）、`services`（宿主的 Node 端服务，先于插件的登记）、`bundled`（随 CLI 安装的 Presmium 自己的包从哪里解析：CLI 的包目录）、`operatorDir`、`secret`。多人共用服务端时的 `trust`、`reserved`、`policy`、`scope`（读取范围）与凭据代理的选项已删除：`{include}`、`{literalinclude}`、链接与资源按真实文件读取，跟随符号链接，与 `presmium dev`、`build` 相同。运营者插件排在文稿的插件之前（同一令牌以运营者的实现为准；没有加入 IR 的 `config.plugins`，所以 IR 不变，渲染端也不加载它们的浏览器部分），文稿也列出的同一个包只加载一次。各插件的 `services(ctx)` 在插件加载时调用一次，用当时文稿的配置；`presmium dev` 中改动头部的 `presmium.<插件 ID>` 要重启才进入服务（同 `plugins`）。运营者目录由编译器按 10.5 节的规则得出（`operatorDir(root,given)`，`@presmium/compiler` 导出），`presmium dev`、`build`、`check` 读 `PRESMIUM_OPERATOR_DIR`；目录不创建，在工作区之中时是错误级诊断。
- **端口**：`presmium dev` 的服务端默认取空闲端口（`--server-port` 指定），启动时在渲染端的地址之后打印 `server  <地址>` 与 `mcp  <地址>/mcp (its token is in <状态文件>)`；`presmium serve` 用 `--port`（默认 4310）与 `--host`（默认 `127.0.0.1`，10.1 节），打印 `serve  <地址>`、局域网地址（有 `--host` 时）、`workspace  <根目录>` 与 `mcp  <地址>/mcp (its token is in <状态文件>)`。两者的助手在可用时与不可用时都打印一行状态（4.8 节）。
- `startServer(options)`（`@presmium/server`）的选项：`mode`（`dev` 或 `serve`）、`host`、`port`、`document(dir)`（文档目录到 `ServedDocument`：编译器加载的插件及其配置、Node 端服务、运营者设置与运营者目录，`servedDocument(compilation)` 由编译结果得出；第一次请求该文档时创建贡献）、`serverHost`（`ServerHost`：`documents()`、`compile(document)`、`check(document)`、`build(document,{ to })`、`run(document,{ section,block },signal)`；`presmium dev` 的实现在 `packages/cli/src/host.ts`，以开发循环最近一次的编译为准）、`settings`、`approvals`（种类到 `off`、`ask`、`allow`）、`forward()`、`operatorDir`、`stateFile`、`mcp`（挂载 MCP 服务；没有时带有效令牌的请求得到 501）、`env`。`mode` 为 `dev` 时 `host` 只能是本机的地址，否则启动失败。返回值的 `services`（`APPROVALS`、`MCP_ENDPOINT`）由宿主交给编译器（`CompilerOptions.services`），`control` 给出窗口的位置、`go`、`session` 与状态摘要（供 MCP）。请求经 Node 的请求先判断（来源、代理、转发），其余交给 `@hono/node-server` 转换为 Fetch API；路由处理函数出错时返回 500 与原因。
- `presmium serve` 在 `@presmium/workspace` 中（`serveWorkspace`）。每份文档一个按需创建的编译会话（`src/node/session.ts`：第一次被请求时编译，此后监听它读过的文件，编译依次进行），编译器选项为 `execution.env: 'serve'` 与宿主服务（服务端的 `APPROVALS`、`MCP_ENDPOINT`，工作区的 `REVISIONS`、`DOCUMENT_FILES`、`DOCUMENT_LOCKS`）。工作区的路由作为一个只有服务端贡献的插件 `presmium.workspace` 挂在每份文档（与首页，文档 `''`）上：`GET documents`（读者）、`POST documents`（编辑者：`{ op: create | rename | copy | delete,dir,to?,title?,template? }`）、`GET revisions`（文档页面默认只列出本文档的修改；每项另有文档操作 `operation`、撤销的提交 `reverts`，撤销一次撤销的另标 `redo: true`）、`POST revisions/revert`（冲突时 409 与文件）。工作区站点：网页渲染端的 `devSite` 是一个路由，按路径中最长的文档目录把请求（含 HMR 的 WebSocket）交给该文档自己的 VitePress 开发服务器（`base` 为 `/<目录>/`，第一次请求时以 `compile` 的 IR 启动），其余路径交给首页的开发服务器；`buildSite` 先构建首页再把每份文档构建到 `<out>/<目录>/`，每份文档有自己的搜索索引，其中另含其他文档的章节。文档的插件由 IR 的 `config.plugins` 给出：工作区把它换成编译器实际加载的包目录（绝对路径），站点只加载这些；站点自己的插件（`RenderContext.plugins`）是工作区的浏览器插件。站点的开发服务器不在工作区中生成项目（serve 的缓存目录），设 `server.allowedHosts: true` 与 `server.fs.allow`，IR 端点在文档的 `base` 下（`<base>@presmium/ir`）。`forward()` 给出本进程中站点路由的地址。：文档操作与撤销经 `DOCUMENT_LOCKS` 加锁，锁的持有者为 `agent:<任务 ID>`、`document:<操作>`、`revision:revert` 或 `assistant:revert`；文档被别人持有时 `documents` 与 `revisions/revert` 回答 409，回答体在 `error` 旁另有 `locked: { document, holder }`，页面按界面语言说明是谁持有。复制文档时一并复制 `.presmium/` 中属于文档的部分（执行的录制 `freeze/`、圈画 `drawings/`、`assets/`、合成缓存 `speech/` 与 `speech.lock.json`、`anchors.lock.json`），逐字节相同，生成的工作目录不复制。文档操作的提交尾注 `Presmium-Origin` 写明操作与目录（`document rename guide manual`；目录中的空白与 `%` 按百分号编码），撤销的尾注写它撤销的操作，历史面板据此显示本地化的标签，日期按界面语言格式化；撤销一次撤销的提交在 `GET revisions` 中标为 `redo: true`（面板显示“重做”标签）。在磁盘上新建或删除的文档在下一次请求站点时被发现（至多每秒检查一次）。`PRESMIUM_DEBUG` 让 `presmium serve` 与 `presmium dev` 的服务端与插件写出调试行（标准错误）。
- **`presmium dev` 的编辑模式**（旧工作台：要加 `--edit`，随旧工作台删去）：`presmium dev` 也有浏览器中的源码编辑（5.11 节）。CLI 用 `@presmium/workspace` 的 `deckEditing(entry)`（`src/node/dev.ts`）为这一份文稿建一个只有它的工作区：工作区的路由（插件 `presmium.workspace`，挂在文稿的 `ServedDocument` 上，在 `RequestContext.document` 之外固定为文稿的目录，没有文档操作，`POST documents` 回答 409）、文稿的写入器（`DOCUMENT_FILES`）、文档的锁（`DOCUMENT_LOCKS`）与修改历史（`REVISIONS`），后三者由 CLI 交给编译器（`CompilerOptions.services`），文稿的插件（助手、讲授）因此与 `presmium serve` 中一样写文件、加锁、提交（插件按服务端的文档称文稿为 `''`，编辑器的路由按它的目录，交给插件的 `DOCUMENT_LOCKS` 把 `''` 换成文稿的目录，所以助手的修改任务进行中保存被拒绝）；加 `--edit` 时（默认没有），开发循环 `dev(compiler, { sitePlugins })` 让网页形态的开发服务器另外加载工作区的浏览器插件（`RenderContext.plugins` 与 `pluginDirs`，编辑模式、文件标签、问题面板、修改历史）；不加时页面只是实时预览，工作区的路由与上述服务照旧（文稿的插件照样写文件、加锁、提交），也不加载预览代理（13.3 节）。工作区的根目录与编译器的工作区根目录相同：文稿所在 git 工作树的顶层（文稿可以在它的子目录中，路径相对于顶层，修改历史、未提交的修改与状态栏的计数只看文稿目录），不在 git 仓库中时是文稿目录。文稿不在 git 仓库中，或被 git 忽略时，可以保存，不能提交：没有 `REVISIONS`，`changes/commit` 回答 409，历史为空，状态栏写“不是 git 仓库”，启动时在标准错误说明；助手的 `info` 的 `changes` 为 false，“AI 修改”说明要在 git 仓库中（4.8 节）。被 git 忽略的文稿（例如在另一个仓库的忽略目录中）的编辑根目录是文稿目录，与编译器的工作区根目录（外面仓库的顶层）不同，所以不登记 `DOCUMENT_FILES`，插件像以前一样自己写文件。`GET documents` 的 `uncommitted` 只数本页范围（文档目录；首页是每份文档与 `presmium.workspace.yaml`）中未提交的文件，`presmium serve` 中也是如此。`.presmium/` 中生成的文件（属于文档的内容之外的，`src/node/files.ts` 的 `generatedPath`，与复制文档时不复制的相同）不论仓库的 `.gitignore` 怎样写，都不列在未提交的修改中、不计数、不被编辑器提交：`presmium dev` 的 MCP 令牌 `.presmium/server.json` 就在文稿的 `.presmium/` 中，仓库没有忽略它时也不会被“提交”带进 git 历史；git 不忽略它时启动时在标准错误提示把 `**/.presmium/server.json` 写进 `.gitignore`（作者自己的 `git add` 仍会带上它），不在 git 仓库中时的提示与“AI 修改”的说明也写明这一行。文稿在仓库的根目录、入口不叫 `lecture.md` 时仍是文档（助手按 `ServerContext.home` 认首页，4.10 节）。用例：`packages/cli/test/dev-editing.test.ts`（git 仓库的子目录中的文稿：列出、保存、过期版本的 409、重新编译、未提交的修改与计数、提交与历史、助手的修改任务进行中保存得到 409 与锁；没有 `.gitignore` 的仓库根目录中的 `talk.md`：令牌不列出、不计数、不提交，助手把它当文档；不在 git 仓库中的文稿：保存，不能提交，助手也不能），`e2e/assistant.spec.ts`（开发服务器的页面中的编辑模式：源码面板、保存后页面不刷新即更新、不在 git 仓库中时没有提交的入口）。
- **课堂同步**（一个端口）：会话插件（`@presmium/slidev-addon-session`）的服务端贡献在本机回环的空闲端口上启动一个课堂服务（`@presmium/classroom-server` 的 `startClassroomServer`，归档写到文稿的 `.presmium/classroom/`；这是插件写文档目录不经 `DOCUMENT_FILES` 的唯一例外（编译器的执行录制 `.presmium/freeze/` 也直接写，它不是插件的写入）：课堂服务是独立的包，与单独运行的 `presmium-classroom-server` 同一份代码，以 `node:fs` 写归档文件，不替换途中的符号链接。归档是生成的数据，不属于文稿的源码，工作区的 `.gitignore`（`templates/workspace/.gitignore`）忽略 `.presmium/classroom/`，它不进入修改历史；`presmium dev` 与 `presmium serve` 只供本机的一个用户使用，经链接写到的地方也是这个用户本来就能写的，所以只记下这个例外），由服务端的反向代理挂在 `/__presmium/presmium.session/sync/` 下（HTTP 与 WebSocket，角色 `reader`），协议与 `presmium-classroom-server` 相同：房间是路径的最后一段，`POST <sync>/archive/<房间>` 归档。路由 `GET classroom` 回答 `{ path, document }`。文稿头部没有 `presmium.session.server` 时，页面在服务端可用（`useServer().available`）时取这条路由，连到 `ws(s)://<页面的主机>/__presmium/presmium.session/sync`，每个请求带查询参数 `document`（WebSocket 不能带 `Presmium-Document` 请求头），课堂入口随之出现；所以 `presmium dev` 与 `presmium serve` 中开课不必另起进程，`--host` 时局域网中的学习者也经同一个端口加入。两种形态的开发服务器都把 `/__presmium/` 连同 WebSocket 代理到服务端。头部写了课堂服务时照旧连到它；发布到静态托管的文稿没有服务端，要用单独的课堂服务。每份文档一个课堂服务，文档卸下（`unmount`）或服务端关闭时关闭，其中的课堂随之结束。
### 10.3 请求来源与权限

- **`presmium dev`**：只监听本机。服务端检查 `Host` 是 `localhost`、`127.0.0.1` 或 `[::1]`（任何端口），`Origin` 缺省或同样是本机的地址（任何端口，因为页面来自渲染端的开发服务器，经它的代理转发），挡住 DNS 重绑定与其他网站的请求（MCP SDK 的 `localhostAllowedHostnames`、`localhostAllowedOrigins` 做法相同）。成员是本机作者，角色为所有者。`/mcp` 另外要求 `Authorization: Bearer <令牌>`，接受两种令牌：每个进程随机生成的令牌，写入 `<文稿>/.presmium/server.json`（权限 0600，不入库：编辑模式从不列出与提交它，git 不忽略它时启动时提示，10.2 节；启动时打印它所在的文件），供作者在编辑器中使用的 agent（Claude Code、Codex 等）连接，模式为 `author`；以及服务端经 `MCP_ENDPOINT` 为助手的每个 agent 会话签发的令牌（见下）。
- **`presmium serve`**：同样的检查，唯一的成员是本机作者（所有者），没有登录。`--host` 时（10.1 节）`Host` 与 `Origin` 另可以是监听的地址与本机的名字；同站的 `Origin` 检查照旧，另一站点的页面发来的请求得到 403。转发到工作区站点的请求来自局域网的名字时，服务端以站点自己的本机名字为 `Host`（与 `Origin`）转发，站点的路由与开发服务器只接受本机名字的请求。`/mcp` 与 `presmium dev` 一样接受两种令牌：每个进程随机生成的令牌（模式为 `author`，供本机作者的外部 agent 连接），写入 serve 的状态目录中的 `server.json`（`$XDG_CACHE_HOME/presmium/serve/<工作区的哈希>/server.json`，权限 0600，在工作区之外），启动时打印 `mcp  <地址>/mcp (its token is in <这个文件>)`；以及经 `MCP_ENDPOINT` 签发的令牌。`--host` 时局域网中的设备不经令牌访问不了 `/mcp`。
- **角色**：契约保留成员与角色（`Member`、`MemberRole`、`Route.role`）：路由与代理按角色检查，本机作者是所有者，满足全部角色；工作区配置的 `members` 不再读取。只为读者存在的分支（讲授路由的读者视图、MCP 中读者到学生视图的映射、`ServerHost` 与 MCP 的学生视图）已删除。
- **学习者的内容**：读者得到内容的途径是学生版的构建（`presmium build --audience student`），发布为静态站点；服务端与 MCP 只给出完整的文稿。编译器另有 `Compilation.forAudience(name)`：在完整编译的文稿上做同样的筛选（去掉受众不含它的章节、块、块中标了受众的节点与位于被去掉的章节与块中的诊断，压缩步骤，章节重新编号，块 ID 不变，在视图中重新解析交叉引用，`ir.md` 2.11 节），`build` 的 `audience` 选项用它构建一份完整编译的学生版并扫描写出的文件（诊断不引用被去掉的内容），译本同样去掉教师内容（4.10 节）。因为这时插件的编译步骤与编译时执行已经运行，插件与代码从教师内容派生、写到别处的文字不在筛选之内：`forAudience` 因此按泄漏扫描的句子检查留下的块，含有它们的块也去掉，并在视图的诊断中报告位置；插件的编译步骤写进 `hints.slides` 的幻灯片跟随的键按视图改写（`ir.md` 2.11 节）；`presmium build --audience student` 在编译步骤之前筛选并扫描产物。用例：`cli/test/audience.test.ts`、`compiler/test/audience.test.ts`。
- **路由的角色**：挂载点按 `Route.role`、`ProxySpec.role`（默认 `editor`）检查；不满足时返回 403，插件不各自检查。
- `presmium dev` 的 `.presmium/server.json` 与 `presmium serve` 状态目录中的 `server.json`（权限 0600）记 `{ url, mcp, token, pid }`（`startServer` 的 `stateFile`）。`Host` 与 `Origin` 的检查在 `packages/server/src/auth.ts`（`authenticate`，本机的名字由 `machineHosts(监听的地址)` 给出）；主机名不分大小写、去掉端口，不带方括号的 IPv6 地址（如监听地址 `::1`）读作 `[::1]`。`ServerContext.secret` 读服务端进程的环境。
- **MCP 的身份**：助手的服务端路由经 `MCP_ENDPOINT.issue(member, 'author')` 为每个 agent 会话取得令牌，令牌绑定成员与模式，放进 ACP `session/new` 的 `mcpServers`，会话关闭时作废。签发的地址是服务端的本机地址，agent 子进程直接访问。工具的范围由令牌的成员的角色决定，不由请求参数决定；每个令牌都读完整的文稿。

### 10.4 控制通道与确认

- **控制通道**：`useServer().available` 时，宿主在 `startHost` 中连接 `/__presmium/presmium.server/control`（SSE 接收，POST 报告）。页面报告：自己的位置（`navigation` 服务的位置与视图）、视图角色，以及 `STATUS` 中各插件的摘要（变化时，至多每秒一次）。服务端发来：`go`（经 `navigation.go` 跳转）、`session`（经 `session` 服务开始或结束课堂）、`approval`（确认请求）。MCP 的 `get_position` 返回该成员处于放映或演讲者视图的窗口最近报告的位置，没有时返回任一窗口的位置；`navigate` 向这些窗口发出 `go`，听众视图照旧经已有的通道跟随。：位置带章节 ID（`NavigationPosition.section`），`get_position` 按 ID 找章节（文稿中已没有这一节时 `section` 为 null），不用窗口的章节序号，步号按完整文稿的编号（窗口报告的 `trail`，10.2 节）；编辑者与所有者的放映窗口排在其他窗口之前，读者声称的 `presenter` 角色只对他自己算数；`get_classroom` 只取编辑者与所有者窗口报告的课堂摘要（演讲者窗口优先），读者的页面报告的空闲状态不覆盖教师的。两种形态的位置都带章节 ID：网页形态取 IR 运行时的章节，幻灯片形态取每张幻灯片 frontmatter 的 `presmiumId`（addon-core 的编译步骤写入，`ir.md` 2.11 节）。
- **确认**：`APPROVALS` 按种类的策略处理：`off` 时这类操作不提供（MCP 不列出对应的工具），`ask`（默认）时经控制通道发出请求；任一有资格的窗口回答即生效，50 秒内（低于 DeepSeek Harness 调用 MCP 工具的 60 秒超时）没有回答视为拒绝。`allow` 只能由本机作者用 `presmium dev --allow <种类,…>` 或工作区所有者在 `presmium.workspace.yaml` 的 `approvals` 中设置，文稿不能设置。
- **按范围分发**（`ApprovalScope`，4.7 节）：`content` 范围的请求发给 `member` 的窗口（没有指定成员时发给全部编辑者与所有者）；`workspace` 范围的请求（工作区配置、确认策略、运营者设置、同意记录、文档目录之外的路径、agent 的 shell 与网络权限请求）只发给所有者的窗口，服务端只接受所有者对它的回答。没有标明范围的请求按 `workspace` 处理。`presmium dev` 与 `presmium serve` 中唯一的成员是所有者，两种范围都发给本机作者的窗口（`--host` 时也包括局域网中其他设备上的窗口）。
- **确认界面**：宿主在 `PmToolbar` 中加入一个只在有待确认请求时出现的入口，两种形态都显示：说明、发起方、允许与拒绝。
- **控制通道的消息**：`GET /__presmium/presmium.server/control?window=<窗口 ID>&document=<文档>` 是 SSE，事件有 `ready`（`{ window }`）、`approval`（`{ id,request }`，打开时补发这个窗口可以回答的、仍在等待的确认）、`settled`（`{ id,allow }`）、`go`（`{ slide,step,view }`）与 `session`（`{ action: 'start' | 'end',name }`）。`POST` 同一路径：`{ window, type: 'report', position, role, status }`（窗口未知或属于其他成员时 404）与 `{ window, type: 'answer', id, allow }`（200；没有这个确认 404；这位成员不能在这里回答 403）。`hello` 返回 `{ member, document }`。页面读完每个 `POST` 的响应体（否则浏览器一直算它在进行中）。一个确认 50 秒（`approvalTimeoutMs`）没有回答视为拒绝，服务端关闭时全部视为拒绝。
- **发送即确认**：编辑模式中（在工作台中，dsh 会话的确认见第 13 节）发送一批批注或一条对话消息，就是对这次任务在文档目录中的写入的确认，助手不再逐个文件询问；这些写入在提交之前还要经发起人的审阅（10.7 节）。写入超出当前文档目录或改动工作区配置时仍以 `write` 确认，它属于 `workspace` 范围，只有所有者能允许；单份文稿的仓库里工作区配置在文档目录之中，审阅中出现它的改动时接受前另需所有者的 `write` 确认（第 11 节）。agent 对运营者目录（同意记录等，10.5 节）的权限请求一律拒绝，不发给任何人。运营者目录在任何工作区与文档目录之外（用户的状态目录中），agent 的文件工具以文档目录为根，写不到它而不发出请求；同一 uid 的代码绕过工具直接写它是 9.4 节的残余风险。

### 10.5 部署

- **本机**：`presmium serve [目录]` 一条命令启动工作区服务；目录中没有 `presmium.workspace.yaml` 而有 `lecture.md` 时，作为只有一份文档的工作区。工作区必须在 git 仓库中，否则编辑功能不可用并提示 `git init`。`--host` 让同一用户在局域网中的其他设备上使用（10.1 节）。
- **运营者目录**：存放运营者的数据（默认的同意记录目录 `consent/`），在任何工作区与文档目录之外，不属于任何文档，`REVISIONS` 从不提交它。它是用户的状态目录 `${XDG_STATE_HOME:-~/.local/state}/presmium/operator/<工作区标识>/`（标识是工作区根目录真实路径的 sha256 的前 16 位十六进制数），`presmium dev`、`build`、`check`、`serve` 与 `presmium-speech consent` 按同一规则找到它，`--operator-dir` 或 `PRESMIUM_OPERATOR_DIR` 可以另行指定（同样不能在工作区之中）；插件经 `NodeServiceContext.operatorDir`、`ServerContext.operatorDir` 得到它，agent 对它的权限请求一律拒绝（10.4 节）。
- **多人使用**：每人一个工作区，由 hub 托管模板给出（1.1）。容器编排与 Kubernetes 的工作区部署模板已删除。
- **远端环境**：`templates/env/compose/` 与 `templates/env/kubernetes/README.md`（Zero to JupyterHub 的 `values.yaml` 片段，按 CPU、GPU、MIG 划分的配置，gVisor 的 `runtimeClassName`，回收设置，以及 agent-sandbox 的模板）只给文档与清单片段，不维护 Helm chart。集群、GPU Operator、gVisor 或 Kata 的安装、入口与证书由用户负责。
- 静态构建产物（含学生版）仍可发布到任意静态托管；课堂用单独的 `presmium-classroom-server`。

### 10.6 编译时执行的信任模型

编译时执行的代码由文稿的编辑者或受提示注入的 agent 写出，以本机用户的身份运行（10.1 节）。实现见 4.6 节的 `RunContext`、`PROCESS_SANDBOX` 与编译器的执行选项：

- **环境变量**：每个 Node 端执行器（执行插件的子进程、本地环境插件的容器、WASI 与 Jupyter 的编译时客户端、WebGPU 录制所启动的 Chromium）只给代码清理过的环境 `RunContext.env`。`presmium build`、`check`、`dev`：进程的环境去掉全部 `PRESMIUM_` 开头的变量与名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量；`presmium serve`：只有 `PATH`、`LANG` 与 `LC_*`、`TZ`、`TMPDIR` 与 `HOME`（每个工作区一个临时目录）。两者都加上运营者设置 `settings.presmium.exec.passEnv` 列出的变量。这只挡住代码经自己的环境拿到凭据；同一 uid 的进程信息见下两条。
- **容器命令行的环境**：`docker` 与 devcontainer 命令行是执行器调用的工具，它们读的容器定义（`${localEnv:…}`）却来自文稿，所以同样以 `RunContext.env` 为基础，只另加 Docker 客户端需要的变量：进程中的 `DOCKER_HOST`、`DOCKER_CONTEXT`、`DOCKER_CONFIG`、`DOCKER_CERT_PATH`、`DOCKER_TLS_VERIFY`、`XDG_RUNTIME_DIR`，以及进程真实的 `HOME`（Docker 从 `~/.docker/` 读取上下文与镜像仓库的登录）。这些都不是凭据，运营者不必经 `passEnv` 传入。容器里的代码经命令行只得到 `RunContext.env` 中的变量（逐个传入，不传主机上的路径 `PATH`、`HOME`）。容器定义本身可以挂载主机路径，这是 9.4 节的残余风险。
- **执行与进程沙箱**：全部执行，不经确认（被执行的代码以运营者的身份受信任）。纵深防御是进程沙箱，主机满足条件时默认启用：`addon-deltabox` 随 CLI 安装（`@presmium/cli` 只在 `package.json` 中依赖它，源码不引用它，编译器按包名经插件加载器加载，第 3 节的规则不变），在所有命令中作为运营者插件加载，不必列在工作区配置中，主机满足条件时登记 `PROCESS_SANDBOX`，编译器把它放进 `RunContext.sandbox`，执行插件的子进程在 deltabox 中运行。条件：Linux（x64、arm64），glibc 2.39 以上，能以 `--require-fs-mode` 启动 cbcow-through（FUSE 与 Landlock），且 `degraded_protections` 为空；macOS 上不登记（10.7 节）。运营者可以用 `settings.presmium.deltabox.sandbox: false` 关闭它，用 `settings.presmium.deltabox.read` 另列只读的路径（例如 `~/.local` 中的 Python 包）。做法：
  - **启动方式**：插件不在 `presmium` 进程中加载 deltabox 的 Node 绑定，而是启动一个辅助进程（`node <插件>/src/node/helper.ts`），它的环境只有 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR`，由它调用绑定的 `loadNative()`；审阅与进程沙箱的请求经它的标准输入输出（JSON 行）转发。deltabox 的文件系统 helper、命令 helper 与被执行的命令都是这个辅助进程的后代，沿父进程链读到的环境中没有秘密（copy-private 的命令能读到带着调用者全部环境的父进程，这里既不用 copy-private，父进程也不是带秘密的进程）。
  - **隔离方式**：每次编译一个预热的会话，模式 cbcow-through（`--require-fs-mode`），隔离为 sandlock；项目是一个临时的运行目录（`mkdtemp`），网络 `deny_all`（含本机回环）。每次运行前把输入写进运行目录，命令结束后从运行目录读回 `collect` 的文件（through 模式中写入立即可见），再 `abort` 回到空目录。文稿目录、解释器的安装目录（按 `RunContext.env.PATH` 解析到的解释器的前缀，例如 nvm 或 conda 的目录）与 `settings.presmium.deltabox.read` 列为只读；会话的项目中不设拒绝规则（9.5 节）。
  - 主机不满足条件或运营者关闭时照旧启动子进程；构建报告写明隔离方式或没有进程沙箱的原因。拿得到什么见 9.4 节。
  - **实现**：`packages/addon-deltabox/src/node/`（`presmium.ts` 插件与设置，`client.ts` 辅助进程的客户端，`helper.ts` 辅助进程，`sandbox.ts`，`review.ts`，`records.ts` 会话的记录，`messages.ts` 中英文）。与上面不同或上面没有写明之处：
    - 辅助进程以 `node --import <jiti/register> <插件>/src/node/helper.ts` 启动（源码以 `.ts` 发布，装在 `node_modules` 中时 Node 不剥离类型），在自己的进程组中，所以终端的 Ctrl-C 只到 `presmium`。`presmium` 没有别的事要做时（`beforeExit`）关闭它的标准输入并等它回滚审阅、停止会话（至多 30 秒）；`presmium` 被信号结束时，辅助进程在标准输入关闭后自行收尾。
    - 可用性由 `helper.ts probe` 判断（会话的 `isolation_provider` 须为 sandlock，另 `exec` 一次 `true`，确认 sandlock 能启动命令），每个进程每个状态目录问一次；满足条件的结果按开机（`/proc/sys/kernel/random/boot_id`）与两个包的版本记在状态目录的 `presmium/probe.json` 中，同一次开机中不再探测，除非有崩溃留下的会话（之后会话启动失败时，这次运行按失败处理，显示录制输出）。macOS 不探测，直接不登记。
    - 状态目录默认是 `${XDG_STATE_HOME:-~/.local/state}/presmium/deltabox`，各工作区共用；`settings.presmium.deltabox.stateDir`（相对于工作区根目录，可写 `~/`）在工作区之内时两项服务都不登记。审阅的快照复制整个文档目录，含 `dist/`、`.presmium/` 与媒体文件：状态目录与文档目录在同一个支持 reflink 的文件系统上（btrfs、XFS）时几乎不占时间与空间，否则（例如 ext4，或不在同一文件系统上）是完整的复制，打开审阅的时间与状态目录占用的空间随文档目录的大小增长。
    - 运行会话按只读路径的集合分组（不同执行器的路径不同），每组至多 4 个预热的会话，同时到达的运行并行；空闲 60 秒的会话停止，下一次运行再启动一个。只读路径另有系统目录（`/usr`、`/bin`、`/sbin`、`/lib`、`/lib32`、`/lib64`、`/etc` 中存在的），以及位于 `node_modules` 中的路径所在的最外层 `node_modules`（包的依赖装在它旁边，pnpm 放在 `.pnpm` 中；执行插件的 JavaScript 运行器只列出 Sucrase 自己的目录）。
    - 命令的 `HOME`、`TMPDIR`、`XDG_CACHE_HOME`、`XDG_CONFIG_HOME` 是 deltabox 给会话的临时目录，`RunContext.env` 中这四个变量不传入（主机上的那些目录在沙箱中不可写）；其余变量照传。
    - 输入经会话写入、`collect` 的文件经会话读回：deltabox 拒绝穿过符号链接的读取，代码不能用链接把运行目录之外的文件带进录制。标准错误中的运行目录路径换成 `.`。命令结束、超时与中止时结束命令留下的进程：会话的 worker 之下的进程、worker 进程组中余下的进程，以及以 `setsid` 离开进程组之后仍持有命令输出的管道（worker 读这些管道，deltabox 的 `exec` 等它们关闭才返回）或工作目录在会话的运行时目录中的进程；worker 保持预热。既改了工作目录又不再持有输出的分离进程不在其中（9.4 节）。
    - 每个会话在状态目录的 `presmium/sessions/` 中有一条记录（辅助进程的 pid 与启动时刻，所以 pid 被重用或共用状态目录的另一份安装的辅助进程都不会被当成同一个）。辅助进程启动与探测时恢复辅助进程已不在的会话：结束会话的 deltabox 进程，`abort`，停止。会话停止之后另删去 deltabox 留下的运行时目录（确认视图已卸载之后）与运行目录在 `projects/` 中的登记；停止失败时结束剩下的 deltabox 进程并卸载视图（`fusermount3 -u -z`）。
    - 构建报告：有进程沙箱时 CLI 照旧写 `isolated by deltabox cbcow-through`（编译器在 `RunContext.sandbox` 存在时就写，WASI 与 Jupyter 等不经它的运行也算在内）；没有进程沙箱（也没有别的插件提供）而文稿有编译时执行的代码时，插件的编译步骤（`after: 'execute'`）给出信息级诊断 `presmium.deltabox`，写明原因与启用方法。启动日志（`[presmium.deltabox]`，标准错误）写明不登记的服务与原因，以及清理了哪些崩溃留下的审阅。文字按文稿的 `lang`。
- **构建**：`presmium serve` 中 MCP 的 `build` 把产物写在 serve 的状态目录中（`$XDG_CACHE_HOME/presmium/serve/<工作区的哈希>/builds/<文档>/<视图>/`）、文档目录之外，并在结果中给出这个路径（写在文档目录中的产物会作为 agent 的修改出现在审阅中）；渲染端是文稿能加载的那些。
- **MCP 的 `run_code` 与 `build`**：这两个工具也执行文稿中的代码（`run_code` 经 `ServerHost` 以编译器的执行器重新运行一个代码块，不读也不写录制；`build` 构建文档），使用与同一宿主的编译相同的执行选项。`presmium dev`、`presmium serve` 与 `presmium-mcp` 中两者的确认都是 `content` 范围，全部执行（有进程沙箱时经它）。
- **agent 的代码执行**：agent 保留 shell（`workspace-write` 加询问，4.8 节）。
- 多人共用服务端时的编译确认（`settings.presmium.exec.compile`）、经另一进程的执行与录制已删除。

### 10.7 修改审阅

> **工作台**：git 实现在工作区服务中（`review` 路由），一次审阅覆盖一个 dsh 会话在审阅期间的全部 turn，提交的尾注另带 `Presmium-Session` 与 `Presmium-Turn`，审阅记录在 dsh 宿主重启后仍在（`design-dsh.md` 6.5 节）。下面的流程中经 ACP 的部分属于旧工作台。

agent 的修改在提交之前由发起人审阅。契约是 4.8 节的 `CHANGE_REVIEW`，有两个实现：

| 实现 | 在哪里 | 做法 |
|---|---|---|
| deltabox（`addon-deltabox`，Linux） | `presmium` 进程经插件的辅助进程（10.6 节） | Presmium 持有文档目录上的一个 deltabox 会话（方案 C），经 `deltabox-lite` 的 Node 绑定开始审阅、记检查点、取差异、`commit` 与 `abort`。会话以 `require_fs_mode` 启动：Linux 用 cbcow-through（`root` 是文档目录的 FUSE 视图，改动立即可见，`presmium serve` 的监听照常看到，页面随修改更新）；copy-private 不跟踪视图之外的写入者，不使用。macOS 上 cbcow-through 假定 deltabox 是唯一的写入者，计划用 cbcow-private（修改在接受之后才进入文档目录），但只在 Linux 上验证过：在 macOS 主机上确认不在沙箱中的写入者（DeepSeek Harness）对私有 `LIVE` 树的写入被记录之前，插件在 macOS 上不登记 `CHANGE_REVIEW` 与 `PROCESS_SANDBOX`，助手用 git 实现（实测）。DeepSeek Harness 不在 deltabox 中运行，只以视图为 `cwd`，它的写入照样进入会话的记录。会话的状态目录（`DELTABOX_STATE_DIR`）在工作区之外、同一文件系统上；同一文档目录同一时间只有一个会话 |
| git（助手内置） | `presmium dev`、`serve` 的进程 | 没有 `CHANGE_REVIEW` 服务时使用；agent 是随包的 DeepSeek Harness 时也用它（9.5 节）。开始时以临时索引把文档目录写成一个树对象（任务开始时的快照，含未提交与未跟踪的文件，不碰 `HEAD` 与真实的索引）；检查点同样写树并与上一个比较；差异是文档目录与快照的比较；拒绝时把这些路径恢复为快照中的内容，快照中没有的文件删除。`root` 就是文档目录，`visibility` 为 `immediate`。被 `.gitignore` 忽略的文件（产物、工作目录、文稿目录的 `node_modules/`）不在审阅中（9.4 节） |

流程（助手）：

1. 修改任务开始时 `open`（同一文档一次一个任务），agent 会话的 `cwd` 是审阅的 `root`。deltabox 实现在打开会话之前把文档目录复制到状态目录（同一文件系统上用 reflink），作为任务开始时的快照。
2. 每个工具调用完成（ACP 的 `tool_call_update` 为 `completed`）时 `step`，页面收到 `step` 事件。检查点在收到通知时记下，紧接着开始的下一个工具调用的早期写入可能算进这一步；决定以文件为单位；待审阅时可以回到某一步之前（`restoreTo`）。至多 100 个检查点（deltabox 的上限），之后的改动并入最后一步。
3. agent 结束时：`settings.presmium.assistant.review` 为 `required`（默认）时发出 `review` 事件，助手面板逐个文件显示差异（文字的统一差异，二进制文件只标出），可以全部接受、全部拒绝或拒绝某些文件；为 `auto` 时直接全部接受。
4. 接受：`accept(reject)`。deltabox 不能撤回单个文件，所以先 `commit` 全部改动，再把被拒绝的文件从任务开始时的快照恢复（快照中没有的删除）。然后 `REVISIONS.commit({ files, message, origin })` 把留下的文件提交为一个修改（尾注照旧，git 的钩子关闭），最后 `done{revision}`。
5. 全部拒绝：`rollback()` 恢复任务开始时的状态，`done{}`。
6. 接受之后的撤销仍是 `git revert`。待审阅时发起人可以回到某一步之前（`restoreTo`），再审阅。待审阅的任务由服务端保存：刷新后的页面经 `GET tasks` 接上它；没有页面跟随时在 `reviewTimeoutMs` 之后回滚；进程正常退出时关闭审阅（等于全部拒绝）；崩溃时 git 实现由下一个进程按记录回滚，deltabox 实现启动时清理崩溃留下的会话（杀掉 helper 并 `abort`，`abort` 失败时从快照恢复）。

写到 `root` 之外的路径不在审阅中：它们本来就要经 `workspace` 范围的确认（10.4 节）。任务进行中作者对同一文档目录的改动：git 实现把它们算进审阅，deltabox 不记录它们，但拒绝同一个文件时快照会覆盖它们（9.4 节）。

**git 实现**：`src/node/git-review.ts`，在 `presmium` 进程中（移到 `@presmium/workspace` 的 `src/node/review/`，记录与看守随之移去，13.4 节）。快照与检查点都是以临时索引（`GIT_INDEX_FILE` 指向系统临时目录中的文件）`git add -A -- <文档目录>` 再 `git write-tree` 得到的树对象，不碰 `HEAD` 与真实的索引；差异是 `git diff --no-renames --no-ext-diff --no-textconv` 两棵树的 `--name-status`、`--numstat` 与逐个文件的统一差异（至多 200 个文件带差异文字，单个超过 256 KB 时省略），路径从 git 的顶层换算为相对于工作区根目录；恢复以临时索引 `read-tree` 快照再 `checkout-index -f` 被拒绝的路径，快照中没有的删除（连同因此变空、在文档目录之内的目录）。全部命令带 `-c core.hooksPath=/dev/null -c core.fsmonitor=false` 与 `GIT_LITERAL_PATHSPECS=1`（`notes[1].md` 这样的文件名不是通配）。审阅的 git 命令不读仓库的 git 目录，只用它的对象库：`GIT_DIR` 是审阅自己的 git 目录（在它的临时目录中，没有钩子），`GIT_OBJECT_DIRECTORY` 与 `GIT_WORK_TREE` 是打开时找到的仓库的对象库与工作树（`.git/commondir` 或途中写下的 `.git` 文件都不改变它们）。这个 git 目录的配置只有打开时（agent 运行之前）从仓库的配置中取的读文件的方式（`core.filemode`、`symlinks`、`ignorecase`、`precomposeunicode`、`autocrlf`、`eol`、`safecrlf`、`excludesFile` 与 `extensions.objectFormat`），另有仓库的 `info/exclude`；所以无论 agent 在审阅运行 git 时往仓库的配置或属性里写了什么（过滤驱动、外部差异、文本转换、钩子），审阅的 git 都不会执行，git 目录的恢复与运行 git 之间没有可以钻的空隙（原先 `e2e/assistant-edit.spec.ts` 在负载下偶尔失败的原因）。文档目录包含仓库的 git 目录时（单份文稿的仓库），打开时记下其中 git 借以执行代码或找到配置的文件（为 git 目录中除对象库（`objects/info/` 除外）、`refs/`、`logs/`、`lfs/`、索引与锁文件之外的一切：`config`、`commondir`、`gitdir`、`HEAD`、`hooks/`、`info/`、`modules/`、`worktrees/` 等，`src/node/git-guard.ts`），`step`、`diff`、`restoreTo`、`accept`、`rollback` 与 `close` 在运行 git 之前把它们恢复原样（agent 新建的删除；为了作者与工作区之后运行的 git），并在服务端日志中写明；git 目录被替换（不再是原来的目录）时这些方法报错，任务失败。`refs/` 与 `logs/` 不在看守之内，作者在任务进行中自己的提交不受影响；任务进行中切换分支（`HEAD`）会被恢复。工作区的 `REVISIONS.commit` 自己运行 git，不在这个看守之内，但它只在 agent 结束、看守恢复之后运行。`restoreTo(step)` 把文档目录恢复为这一步之前的检查点的树（与之不同的路径从那棵树检出，它没有的删除），去掉这一步与之后的各步。同一文档目录在一个进程中至多一个审阅（打开第二个时报错）；`close()` 在没有接受或拒绝时等于 `rollback()`。审阅打开时在 `${XDG_STATE_HOME:-~/.local/state}/presmium/reviews/` 中写一份记录（文档目录、git 目录、快照的树、任务、进程与它的启动时间、看守的内容），结束时删去（`src/node/review-record.ts`）；进程崩溃后，下一个进程挂载这份文档（或在它上面打开审阅）时，记录的进程已不在，就先按记录恢复 git 目录，再把文档目录恢复为快照，删去记录，并在日志中写明。有 `DOCUMENT_FILES` 时（`presmium serve`）恢复、回到某一步之前与崩溃后的恢复不再 `checkout-index`：要写回的文件以 `ls-tree`、`cat-file` 从 git 读出，经它写入（途中的符号链接被替换，从不被跟随）。

**deltabox 实现**：审阅在插件的辅助进程中（10.6 节）。`open` 把文档目录（真实路径）的文件、目录与链接以 `COPYFILE_FICLONE` 复制到状态目录的 `presmium/snapshots/<ID>/`，再以没有拒绝规则、网络 `deny_all` 的策略启动 cbcow-through 会话，`root` 是它的视图（`/tmp/deltabox-<uid>/deltabox-lite/<会话>/mount`），`visibility` 为 `immediate`；同一文档目录已有审阅时（本进程的，或另一进程的会话占着 deltabox 对目录的租约，`session busy`）`open` 失败。`step` 先取上一个检查点以来的差异（`diff --from`）再记检查点，步骤的 ID 是检查点的 ID；第 100 步之后的 `step` 不再记检查点，把最后一步换成倒数第二个检查点以来的差异。deltabox 的差异也列出目录（两个大小都为空），辅助进程把它们去掉，所以步骤、差异与 `accept` 的返回值只有文件与链接，任务新建或删去的目录本身不出现，返回值可以直接交给 `REVISIONS.commit`。`accept(reject)` 取整个任务的差异，`commit`，停止会话，再把被拒绝的文件（只限差异列出的文件，目录与没有改动的路径被忽略）从快照复制回来，快照中没有的删除（连同任务新建、已空的目录），返回其余改动的文件；`rollback` 为 `abort` 再停止。`restoreTo(step)``abort` 到这一步之前的检查点（第一步时到会话开始），会话继续。会话出错、`abort` 失败时，`rollback` 改为从审阅自己的快照恢复：先停止会话，结束它的进程、卸载视图，把文档目录做成快照的样子（快照没有的删除，不同的复制回来；出错的会话已不能说出哪些路径是 agent 改的，所以任务进行中作者直接写进文档目录的改动也回到快照），再删去 deltabox 对这个目录的登记（`<状态目录>/projects/<路径的 SHA-256>`，出错的会话一直占着其中的独占租约），所以目录随即可以开新的审阅；辅助进程退出时与恢复崩溃留下的会话时同样处理。路径在契约中相对于工作区根目录，在辅助进程中相对于文档目录。`presmium` 正常退出时辅助进程回滚进行中的审阅；崩溃之后，下一个 `presmium` 进程加载插件时恢复文档目录并在启动日志中写明。已知的缺口：恢复发生在编译器读过文稿头部之后，所以崩溃之后 `presmium dev` 的第一次编译用的是 agent 改过的内容，监听随即看到恢复并重新编译；被改过的是头部中的插件或渲染端时要重启 `presmium dev`。

## 11. 安全

服务端只供运行它的那个用户使用（10.1 节）：被执行的代码与 agent 以这个用户的身份受信任，下表的措施是纵深防御。措施之后仍然拿得到的东西写在 9.4 节。

| 风险 | 措施 |
|---|---|
| 本机端点被其他网站或进程调用 | 默认只监听本机；校验 `Host` 与 `Origin`（`presmium serve --host` 时另接受监听的地址与本机的名字，其他名字与其他站点的页面照旧被拒绝，10.3 节）；MCP 要求令牌；插件代理的路径不能越出目标（`.`、`..` 与编码的分隔符得到 400） |
| 局域网中的其他设备 | `presmium serve` 没有登录，只供运行它的那个用户使用：`--host` 时到得了这个端口的设备都以本机作者的身份使用工作区，启动时在标准错误上写明（9.4 节）；默认只监听本机；多人使用时每人一个工作区（hub 托管模板） |
| agent 误改或越权 | 只写工作区中的源码：agent 的工作目录是任务的文档目录，写到外面要确认；修改先经发起人审阅（`settings.presmium.assistant.review: required`）：逐个文件查看差异，全部接受、全部拒绝或拒绝某些文件，被拒绝的文件恢复为任务开始时的内容，接受后才提交为一个修改，可撤销；操作类与计费类工具、agent 自身的权限请求都要确认；确认的关口在我们的服务端。确认按范围分发（10.4 节）：工作区配置、运营者设置、同意记录、文档目录之外的路径与 agent 的 shell、网络权限请求属于 `workspace` 范围，只由所有者（本机作者）确认 |
| 文稿关闭安全设置 | 工作区的插件列表、确认策略、agent 的替换命令与模型的服务提供方、修改的审阅、编译时执行传入的环境变量（`settings.presmium.exec.passEnv`）、录音的去处、是否允许克隆音色与同意记录的目录都不从文稿读取，只来自命令行、环境变量与工作区配置（插件经 `settings` 得到，4.7 节）；工作区配置只在进程启动时读取，改动要等运营者重启才生效。agent 写工作区配置要所有者的 `write` 确认（`workspace` 范围）：它在文档目录之外时由 agent 的权限请求发出；单份文稿的仓库中它在文档目录里，审阅中出现它的改动时，接受前另需所有者允许，没有允许时它作为被拒绝的文件恢复 |
| 文稿中的 Node 插件在服务端运行 | 文稿列出的插件与文稿目录中的包在 `presmium` 进程中运行，等于运行文稿的代码：`presmium serve` 与 `presmium dev` 相同；只打开信任的文稿与工作区（9.4 节） |
| 编辑者或 agent 写的代码在服务端运行 | 代码只得到清理过的环境变量（`RunContext.env`，4.6 节），`presmium serve` 中只有允许列表；全部执行，可用时经 deltabox 的进程沙箱（网络拒绝、看不到其他进程与套接字、只写运行目录，10.6 节）；agent 保留 shell，权限请求经确认 |
| 同一 uid 的代码读其他进程的环境与内存 | 不声称挡住（9.4 节），只有进程沙箱在可用时隐藏其他进程 |
| 文稿把服务端的凭据引向别的地址 | 文稿只写环境与引擎的名字，不能决定哪个凭据发往哪个地址：凭据与它的地址由运营者在持有凭据的 `presmium` 进程的环境变量中成对给出。远端环境：`PRESMIUM_ENV_<名>_TOKEN` 只发往 `PRESMIUM_ENV_<名>_URL`，文稿中的 `url` 与它不同源时不连接并给出错误诊断，不回退到通用的变量（如 `JUPYTER_TOKEN`）；没有给出地址时不发送令牌。语音：引擎 `<ID>` 的地址与凭据是 `PRESMIUM_SPEECH_<ID>_URL` 与 `PRESMIUM_SPEECH_<ID>_KEY`（火山引擎的地址固定在适配器中），文稿只用 `engine`、`voice` 选择引擎与音色；文稿中出现 `url`、`keyEnv` 这类字段时是错误，不被使用。模型：`DEEPSEEK_API_KEY` 只发往 DeepSeek 的官方地址，`PRESMIUM_MODEL_KEY` 只发往 `PRESMIUM_MODEL_URL` |
| 提示注入（学习者的问题、远端输出、网页内容） | 学习者的问题不到达任何 agent 与服务端：页面把问题与页面中的文字发给读者自己填写的模型服务，回答只是显示的文字与跳转的链接（`presmium://sections/<章节>`），不调用任何工具；回答在课堂中公开前由主讲确认（“发给课堂”）。作者的 agent 读到的文稿与远端输出照旧可能含有注入的指令，它的写入经审阅、shell 与网络经确认（上一行） |
| 凭据泄露 | 凭据不写入文稿、IR 与产物；代理代加凭据；`presmium check` 对文稿头部中像凭据的字段告警（字段名含 `token`、`secret`、`password`、`key` 且值不是环境变量名，或值形如常见的密钥前缀）；编译时执行的代码只得到清理过的环境（见上）；启动 agent 子进程时去掉全部 `PRESMIUM_` 开头的变量。凭据在 `presmium` 进程与 agent 的环境中（同一 uid 拿得到，9.4 节） |
| 数据外发 | DeepSeek Harness 的会话日志上传与遥测由配置模板关闭，并以 `DSH_TELEMETRY_MODE=DISABLED` 启动；语音与模型的服务提供方在界面上标明（批注与对话面板写明 `AGENT.provider()`，另写明运行时 `AGENT.runtime()`；读者的提问面板写明读者自己填写的服务与模型；转写与合成的入口写明 `SpeechEngineInfo.provider`），运营者的服务提供方的名字来自运营者的配置（模型访问、页面的模型设置、`settings.presmium.assistant.provider`、`PRESMIUM_SPEECH_<ID>_PROVIDER`），在任何请求之前就已知，没有时助手或引擎不可用；运营者没有配置模型访问（或替换的运行时）时助手不可用、不启动任何进程，没有定义的引擎不发出请求；录音只在显式“转写”时发出；读者的问题只发往读者自己填写的服务，不带站点的 Cookie 与来源 |
| 不可信的富输出 | 执行输出中的 HTML 用 DOMPurify 清洗后显示（去掉脚本与事件属性）；幻灯片中同样清洗（另去掉 `<style>`），写进幻灯片的录制输出在构建时以 jsdom 与 DOMPurify 清洗；幻灯片中 Monaco 运行器的图片输出只接受 base64 数据，属性值经 `escapeHtml` 转义，远端内核的图片同样校验 |
| 文稿的组件在浏览器中运行 | 组件与原始 HTML 是文稿的一部分，以开发服务器或工作区站点的源运行，能以本机作者的身份调用路由（提交修改任务、接受审阅、回答确认），列为残余风险（9.4 节）；`/mcp` 另要求令牌 |
| 仓库中的脚本被 git 执行 | 工作区的 git 命令关闭钩子与 fsmonitor（`-c core.hooksPath=/dev/null -c core.fsmonitor=false`）；助手的 git 审阅的命令在审阅自己的 git 目录中运行，只用仓库的对象库与工作树，不读仓库 git 目录中的配置与钩子（工作树的 `.gitattributes` 照常读，但它点名的过滤驱动没有定义，不会运行，10.7 节），并在运行 git 之前恢复 agent 写进仓库 git 目录的钩子与配置，留给作者与工作区之后的 git 命令（4.8 节）。任务进行中工作区自己的 git 命令（状态栏的 `git status`）仍读仓库的配置：单份文稿的仓库中，agent 在任务进行中写进 `.git/config` 的过滤驱动可能被它执行，直到看守在下一步恢复它；这与 agent 本来就能以作者的身份运行命令（经确认的 shell）属于同一个信任边界 |
| 文档目录中的符号链接让服务端写到别处或读到别处 | 服务端写文档目录都经 `DOCUMENT_FILES`（审阅的回退与恢复、文档操作改写的链接、撤销，讲授与语音插件的写入）：途中的符号链接被替换而不被跟随（4.8 节）；课堂服务的归档是插件写入中唯一的例外，直接写 `.presmium/classroom/`（10.2 节），编译器的执行录制 `.presmium/freeze/` 也直接写；讲授插件的路由读文件时不跟随链接、不等待 FIFO（`addon-lecture/test/files.test.ts`） |
| GPU 被学习者代码拖垮 | 限制派发规模与重复次数；超时就销毁设备并结束 Worker；监听设备丢失，避免浏览器把站点列入 GPU 黑名单；可以只给录制输出 |
| 生成的产物被 agent 修改 | 幻灯片渲染端在生成的 Slidev 文稿头部写 `mcp: false`，关闭 Slidev 53 开发服务器自带的、会修改生成文稿的 `/__mcp` 端点（原则 6） |
| 音色滥用 | 克隆音色默认关闭：只在运营者设置 `settings.presmium.speech.cloned: true` 时可用，且每个克隆音色要有本人的同意记录 `<consentDir>/<引擎>/<音色>.json`（说话人、范围、日期、同意声明录音的 sha256），语音服务在合成前检查，缺一即拒绝；合成缓存命中时同样检查，同意撤回之后服务端的讲授路由也不再给出已合成的讲授与它的片段。同意记录是运营者的数据，在运营者目录中，不在文稿里：只有所有者经语音插件的路由（`role: owner`）登记，或运营者用 `presmium-speech consent` 登记；文稿目录中的同意记录被忽略，文档的提交不包含它们。运营者目录在工作区之外的用户状态目录中（10.5 节），agent 对它的权限请求一律拒绝，同一 uid 的代码绕过工具写它是残余风险（9.4 节）。合成的音频在播放界面与元数据中标明由 AI 生成（GB 45438-2025、《人工智能生成合成内容标识办法》）：元数据由语音服务在写入缓存时加入，不依赖引擎 |
| 只给教师的内容到达学习者 | 学习者只得到学生版的构建（`presmium build --audience student`），它的产物扫描泄漏；读者问答的上下文取自页面中的 IR，学生版站点的 IR 本来就没有教师内容。：教师专用指令中的脚注留在指令之中，受众标记范围内的块随之去掉；任何构建都不发布文档的源码（指向另一份文档 `lecture.md` 的链接在工作区站点中改写为它的页面，`ir.md` 6.2 节）。学生版的构建只发布录制的讲授中摘要与录制时相同的章节的话语与音视频；完整编译的学生视图中幻灯片跟随的键不含教师专用块的标签 |
| 请求体耗尽服务端的内存 | 插件路由的请求体默认至多 1 MiB（`Route.maxBody` 可放大，讲授录制的分块为 `MAX_CHUNK`）：`Content-Length` 超过时在处理函数运行之前回答 413，分块传输读到上限即截断 |
| 提问耗尽资源与模型预算 | 读者的问题不占用服务端与运营者的模型：每位读者用自己的服务与密钥，费用由读者自己承担；主讲在课堂中生成“AI 回答”用的是主讲自己填写的服务。运营者的模型只用于作者自己的修改任务（一文档一个） |
| 学习者改写别人的课堂条目 | 课堂服务按集合在键中找参与者 ID 的位置（作答等在最后一个 `:` 之后，提问在第一个 `:` 之前；参与者 ID 不能含 `:`），已写明他人的条目不能改写或删除（4.4 节“课堂的写入规则”） |
| 插件读到不该读的文件 | `{code-ref}` 读工作树经编译器的读取器（`PassContext.src`），只有读提交时用自己的 git 读取器，锚点不能指向 `.git`；讲授插件的媒体路由以 `O_NOFOLLOW`、`O_NONBLOCK` 打开文件后按文件描述符核对真实路径，再从这个描述符读出，检查与打开之间没有竞态 |

## 12. 依赖选型

依赖准则：只用公开接口，不 fork，不引入 AGPL；版本精确固定，遵守 `pnpm-workspace.yaml` 的最短发布时间。版本是 2026-10 调研时的版本，实现时取当时满足准则的版本。

| 组件 | 版本 | 许可证 | 用途 | 包 |
|---|---|---|---|---|
| `@modelcontextprotocol/server`；测试用 `@modelcontextprotocol/client` | 2.3.1 | Apache-2.0（既有代码 MIT） | MCP 服务（`createMcpHandler`、`serveStdio`、`fromJsonSchema`）与测试中的客户端；服务端自己校验 Host 与 Origin，实现中没有用到原计划的 `@modelcontextprotocol/node` | mcp |
| `minisearch` | 7.2.0 | MIT | `search` 工具的索引（与网页渲染端相同的版本与参数） | mcp |
| `@agentclientprotocol/sdk` | 1.8.0（精确固定） | Apache-2.0 | ACP 客户端（助手，`client()` 与 `connect()`）与测试 agent（`agent()`）；随旧工作台在 随旧工作台删去 | addon-assistant |
| DeepSeek Harness（`@deepseek-ai/dsh`） | 0.2.1-alpha.4（精确固定，与本地文档同一版本） | MIT | 默认的 agent 运行时：助手插件的依赖，运营者配置了模型访问时以子进程启动（ACP over stdio），不作为库引用，用户不必另外安装。它要求 Node 22.19 以上，根目录的 `engines` 因此要提高。它的依赖中 `@deepseek-ai/dsh-subprocess-local`、`node-pty`、`koffi`、`protobufjs`、`@google/genai` 的安装脚本不运行（`pnpm-workspace.yaml` 的 `allowBuilds`）：Linux 上 `node-pty` 用随包的预编译二进制，脚本只为 macOS 的辅助程序加可执行位与下载预编译件 | addon-assistant |
| deltabox-lite（`deltabox-lite` 与平台包 `deltabox-lite-<os>-<arch>`） | 0.1.1（精确固定） | Apache-2.0（内含 sandlock-core 0.9，Apache-2.0；fuser，MIT） | 修改审阅与进程沙箱，在插件的辅助进程中经 Node 绑定使用，命令行只用于诊断；有 Linux 与 macOS 的 x64、arm64 预编译，只在 Linux 上启用（10.7 节）。Linux 上要求 glibc 2.39 以上；cbcow 模式要 FUSE（`/dev/fuse`、`fusermount3`）与 Landlock，没有降级的保护（`degraded_protections` 为空）才登记服务 | addon-deltabox（随 CLI 安装） |
| Runno（`@runno/wasi`、`@runno/sandbox`） | 0.10.0、0.10.2（精确固定） | MIT（二进制：clang 8.0.1 与 wasm-ld 为 LLVM 8 的 University of Illinois/NCSA 许可，LLVM 9 起为 Apache-2.0 加 LLVM 例外；sysroot 中的 wasi-libc 为 Apache-2.0 加 LLVM 例外或 MIT；Ruby 3.2.0 为 Ruby 许可或 BSD-2-Clause，SQLite 为公有领域；发布时附 `<base>wasi/LICENSES`） | `@runno/wasi` 是浏览器与 Node 共用的 WASI 系统；`@runno/sandbox` 只提供 C、C++、Ruby、SQLite 的二进制（`dist/langs`），它的 Node 接口不用 | addon-exec-wasi |
| jax-js（`@jax-js/jax`） | 0.1.25（精确固定；没有依赖） | MIT | JS/TS 中的张量代码与自动微分，WebGPU 后端；ES 模块构建原样随产物发布，第一次导入时加载（`@jax-js/optax` 没有用到） | addon-exec-webgpu |
| playwright-chromium | 与仓库一致（1.64.1） | Apache-2.0 | 构建时在 Chromium 中录制 WebGPU 输出（录制时才加载）；导出讲授视频（讲授插件的可选 peer 依赖，导出时先用文稿自己的） | addon-exec-webgpu、addon-lecture |
| `@jupyterlab/services` | 7.6.4 | BSD-3-Clause | Jupyter 内核与终端协议的客户端，浏览器与 Node 共用 | addon-exec-jupyter |
| `@xterm/xterm`、`@xterm/addon-fit` | 6.0.0 与 0.11.0 | MIT | 浏览器终端 | addon-exec-jupyter |
| `ws` | 8.x | MIT | Node 端连接内核与终端的 WebSocket（能带请求头，令牌不进地址；`@jupyterlab/services` 本身也依赖它） | addon-exec-jupyter |
| `@noble/hashes` | 2.4.0 | MIT | 讲授的播放器在浏览器中计算译文原文的 SHA-256（不依赖安全上下文中的 `crypto.subtle`，过期的译文在任何浏览器中都能标出） | addon-lecture |
| jsdom、DOMPurify（Node 端） | 29.1.1、3.4.17 | MIT、Apache-2.0 或 MPL-2.0 | 构建时清洗写进幻灯片的 HTML 输出（jsdom 是 DOMPurify 在 Node 中支持的 DOM；30.x 要 Node 22.22.2） | render-slides |
| Mediabunny（`mediabunny`） | 1.61.3（精确固定） | MPL-2.0（文件级） | 录音为 Ogg/Opus（WebCodecs），摄像头与屏幕录为 WebM；导出视频时在 Chromium 页面中合成音视频（WebM）。`@mediabunny/server` 附带的 FFmpeg 是 GPL（实测），不用它，不导出 MP4 | addon-lecture |
| simple-git | 已用 | MIT | 代码引用读取 git 中的文件、本地环境的仓库（工作区的修改历史原先也用它；工作区直接运行 git，固定 git 目录并关闭钩子，simple-git 4 的环境守卫不让设置这些变量） | addon-code、addon-exec-local |
| DeepSeek Harness（`@deepseek-ai/dsh` 与 bundle 用到的 `@deepseek-ai/dsh-*`） | 最新的 0.2.x 预发布版或正式版，精确固定；每次升级单独一个工作包，先过升级闸门 | MIT（`libreoffice-kit`、`libreoffice-kit-wasm` 为 MPL-2.0，`node-addon-system` 为 BSD-3-Clause） | 工作台的 agent、会话、确认、模型设置与客户端运行时（第 13 节） | dsh、studio |
| React | 18.3.1（由 dsh 的外壳提供，Presmium 不自带） | MIT | 工作台的面板（对等依赖） | workbench、dsh |
| esbuild | 仓库已用的版本 | MIT | 把 `@presmium/dsh` 的客户端部分构建为 dsh 的工厂格式 | dsh |
| `@hono/node-server` | 当前版本 | MIT | Node 请求与 Fetch API 之间的转换 | server |
| http-proxy-3 | 当前版本 | MIT | HTTP 与 WebSocket 反向代理（远端环境、工作区站点） | server |
| DOMPurify | 3.x | Apache-2.0 或 MPL-2.0 | 清洗执行输出中的 HTML | viewer |
| ansi_up | 6.x | MIT | 把回溯与输出中的 ANSI 转义转为样式 | viewer |
| mdast-util-from-markdown、mdast-util-gfm、micromark-extension-gfm | 当前版本 | MIT | 浏览器中把现场运行的 `text/markdown` 输出转为 mdast；讲授插件读单独的讲授脚本（只用 mdast-util-from-markdown 2.1.0） | viewer、addon-lecture |
| myst-ext-card、myst-ext-grid、myst-ext-tabs、myst-ext-button | 与 myst-parser 同一发行 | MIT | 卡片、栅格、选项卡、按钮 | compiler |
| VitePress 的 `locales`、`sitemap`、`themeConfig.nav`、`footer`、`head` | 已用 | MIT | 站点外壳与译本 | web |
| lychee | 用户安装的命令 | MIT 或 Apache-2.0 | 可选的外部链接检查 | cli |
| 镜像：docker-stacks、`jupyter_server`；可选 gVisor | 固定摘要 | BSD-3-Clause、Apache-2.0 | 远端环境的模板 | templates/env |

随网页与幻灯片产物再分发的运行时带上许可证声明：WebAssembly 运行时为 `<base>wasi/LICENSES`；Pyodide 为 `<base>pyodide/LICENSES`（Pyodide 的 MPL-2.0 全文与源码地址、编译为 WebAssembly 的 CPython 的 PSF 许可证、`pyodide-lock.json` 中随运行时发布的包的许可证）；jax-js 为 `<base>presmium/jax-js/LICENSE`（取自 `@jax-js/jax` 包）。它们与运行时一同发出，开发服务器中也提供，并在离线缓存的范围内。

语音服务没有采用 SDK：火山引擎没有 npm SDK，OpenAI 音频接口形态的服务用 `fetch` 即可；语音插件的适配器直接调用 HTTP 与 WebSocket 接口。

不采用：dsh-deltabox（MIT，但没有公开的源码仓库，只支持 dsh 的两个预览版，在 ACP 下修改会被静默回滚，9.5 节）、ffmpeg.wasm（核心为 GPL）、Remotion（超过 3 人的公司需要商业许可）、Motion Canvas（2024 年底起停止维护）、TensorFlow.js 的 WebGPU 后端与 webgpu-torch（停更）、Jupyter Kernel Gateway（停更，浏览器跨域有缺陷）、Daytona 等 AGPL 许可的沙箱平台、edge-tts（非官方接口）、在进程内 mock 语音或模型的测试库。

## 13. 工作台与 dsh

设计与取舍在 `design-dsh.md`，概念对照与 `Focus` 在 `domain-model.md` 第 16 节。本节列出实现依赖的结构与契约。

### 13.1 三层与进程

| 层 | 包 | 框架 | 依赖 dsh | 版本 |
|---|---|---|---|---|
| 核心 | `kernel`、`compiler`、`cli`、`server`、`mcp`、`language-server`、`workspace` 的 Node 部分（工作区服务）、`classroom-server`、`create-presmium`、`presmium-vscode` | TS、Node | 否 | 1.x |
| 产物 | `web`、`viewer`、`render-slides`、`addon-core`、`render-notebook`、各插件的组件与 `src/client`、`host` | Vue | 否 | 1.x |
| 工作台 | `design`（与产物共用）、`workbench`、`dsh`、`studio` | React 18（由 dsh 的外壳提供） | 只有 `dsh` 与 `studio` | 0.x（`design` 随 `host` 为 1.x） |

```
浏览器标签页
┌ 工作台：dsh 的客户端运行时 ─────────────────────────────────────────────────────────┐
│ Presmium 的根布局插件（替换 dsh 的 ui-layout）与面板（@presmium/workbench，React）      │
│ dsh 的插件：对话、确认卡片、修改卡片与 Review、会话、模型设置、终端、jobs                 │
│ 预览 iframe ══ 预览协议（postMessage）══ 产物页面（Vue：VitePress 网页、Slidev 幻灯片）   │
└──────┬────────────────────────────────────────────────────────┬────────────────────────┘
       │ /api/presmium/*（dsh 的 cookie 与 Host、Origin 栅栏）        │ 另一个源，直接访问
       ▼                                                         ▼
dsh 宿主（studio 启动；Presmium 自己的 DSH_HOME 与 profile）       工作区服务（presmium serve --headless，回环）
├ agent 循环、工具、沙箱、确认、会话、模型与凭据                       ├ 编译会话、IR、诊断、产物的开发服务器（带预览代理）
└ @presmium/dsh 的宿主部分：工具、确认策略、上下文、技能、             ├ 文档、源码、修改历史、审阅、焦点
  文档的工作区登记、turn 与审阅、/api/presmium/* ── 回环 HTTP、/mcp ──► └ /mcp（Claude Code、Codex 也连这里）
```

`presmium studio` 的启动器启动并监管 dsh 宿主与工作区服务（各在自己的进程组中，有父进程退出的看门狗），只打印 dsh 宿主的一个网址。文稿的代码只在工作区服务中运行，不进 dsh 宿主（`design-dsh.md` 第 2、11 节）。

实现：

- **包与命令**：`@presmium/studio`（0.1.0；依赖精确版本的 `@deepseek-ai/dsh` 0.2.1-alpha.4、`@presmium/dsh` 与 `@presmium/cli`）：`src/cli.ts` 的 `main`（`presmium studio [目录] [--port <端口>] [--host <地址>]`；命令 `presmium-studio` 相同）、`src/studio.ts` 的 `startStudio`（启动器）、`src/model.ts`（模型的环境变量与 `assistant.json` 的导入）。`@presmium/cli` 不依赖它：`presmium studio` 从 CLI 的包目录（同一个 `node_modules`，全局安装时也是）或当前项目解析 `@presmium/studio`，用 jiti 加载并转交，带上 CLI 自己的 `bin/presmium.mjs` 作为工作区服务的命令；没装时说明怎样安装（`npm install --save-dev @presmium/studio`，或与全局的 CLI 一起 `--global`），以 2 退出。目录的规则同 `presmium serve`。
- **目录与 profile**：`DSH_HOME` 是 `$XDG_STATE_HOME/presmium/studio`（没有这个变量时是 `~/.local/state/presmium/studio`），从不用环境中的 `DSH_HOME` 或用户自己的 `~/.dsh`。每次启动用 `@presmium/dsh/launch` 的 `writeProfile` 写 profile `presmium-studio`（web 载体；保留 profile 自己的 `cordis.patch.yml`，即用户在界面中的改动），以 `launchArgs` 传入 `web.patch.yml` 与 `profile.patch.yml`，环境中加 `launchEnv`。两个进程的输出写进其中的 `presmium-studio.log`（0600，每行带进程名；过 16 MB 时另起，旧的留作 `.1`）：启动器的标准输出只有一行 `studio  <网址>`。
- **端口与源**：工作台的端口默认 4320，每次相同，浏览器的 cookie 因此在重启之后仍有效（dsh 的签名密钥在 `DSH_HOME` 中）；4320 被占用时另取一个空闲端口，`--port 0` 取空闲端口，`--port` 给出的端口被占用时报错。端口在启动任何进程之前由启动器选定，因为工作区服务以工作台的源启动：`--preview-origin` 是 `http://127.0.0.1:<端口>` 与 `http://localhost:<端口>`（`--host` 时是 `http://<地址>:<端口>`）。
- **启动顺序**（`design-dsh.md` 11.2 节）：服务令牌（24 字节的随机值）；`node <WATCHDOG> node <presmium> serve <目录> --headless --port 0 [--host <地址>] --preview-origin …`，环境中没有 `DSH_*`、`DEEPSEEK_*`、`PRESMIUM_MODEL_*`、`NODE_ENV`、`PORT`，有 `PRESMIUM_SERVICE_TOKEN`，等它打印 `serve  <网址>` 与 `workspace  <根目录>`；`node <WATCHDOG> node <dsh> --profile presmium-studio --patch … --port <端口> --no-open [--host <地址> --trusted-host <地址>:<端口>]`，工作目录是工作区根，环境中有 `PRESMIUM_SERVICE_URL`、`PRESMIUM_SERVICE_TOKEN`、`PRESMIUM_WORKSPACE`、`launchEnv` 与模型的变量，等它打印 `dsh web: <网址>`（`WEB_READY`）；打印这个网址。dsh 在加载树安定、启动审计通过之后才打印这一行（`dsh-web-app` 的 README），`presmium-workspaces` 在激活时登记文档的工作区，所以这一行也说明登记好了，启动器不另外查询。任何一步失败（3 分钟没有就绪也算）都停下已启动的进程，在标准错误报告并给出日志的位置，以 2 退出。
- **监管**（11.2、14 节）：两个进程各在 `@presmium/dsh` 的看门狗（`WATCHDOG`，`presmium-service` 行用的同一个）之下，以 `detached` 自成进程组，看门狗的标准输入是来自启动器的管道：启动器退出（`kill -9` 也是）时看门狗结束整个组，组中的开发服务器一并结束。SIGINT、SIGTERM、SIGHUP 时启动器先停 dsh（bundle 在服务处作废会话令牌）再停服务，各等 15 秒，之后向组发 SIGKILL，以 0 退出；一个进程自己结束时启动器停下另一个，报告是哪一个与日志的位置，以 1 退出。
- **模型**（11.3 节）：按旧工作台助手的规则：`PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER` 三个都有时成为 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY` 与 `DEEPSEEK_SEARCH_BASE_URL`（网页搜索用同一个密钥，地址也是这个服务）；只有一部分时在标准错误警告缺少哪个；否则 `DEEPSEEK_API_KEY` 原样传给 dsh，作者环境中的 `DEEPSEEK_BASE_URL`、`DEEPSEEK_SEARCH_BASE_URL` 不传（密钥只去 DeepSeek 的官方地址）。dsh 自己不接受 `.env` 文件中的这类地址变量（工作区根的 `.env` 写了它时 dsh 拒绝启动），所以工作区的 `.env` 改不了密钥的去向。旧工作台的 `assistant.json`（`$XDG_CONFIG_HOME/presmium/assistant.json`）在环境中没有模型、作者还没回答过时询问一次（标准输入与标准错误都是终端时问“是否导入”，默认是；不是终端时每次在标准错误说明怎样导入）：导入时密钥写进 `DSH_HOME/.env`（dsh 的凭据层中最低的一层，0600；环境与在模型设置中保存的密钥都在它之前），服务的地址写进 `DSH_HOME/presmium-studio.json`，之后每次环境中没有模型的启动都把它作为 `DEEPSEEK_BASE_URL` 传入；回答记在同一个文件中，原文件不删；模型名不导入，启动器提示在模型设置中选择。
- **局域网**（11.4 节）：`--host` 只接受本机的一个具体 IP 地址（拒绝 `0.0.0.0`、`::` 等通配地址与主机名），dsh 与工作区服务都只监听这个地址（服务端的 `Host`、`Origin` 规则按 10.1 节接受它），`--preview-origin` 是它的源；启动时在标准错误警告没有登录，同一网络中到得了这两个端口的人都以作者的身份工作。
- **用例**：`packages/studio/test/studio.test.ts`（消费者安装与一个网址、在 Chromium 中打开后是工作台；全新的 home 中第一个会话在文档目录中、没有 `~/Documents`；环境中的模型；外来 `Origin` 的 403；局域网；服务的环境中没有模型的密钥与 `kill -9`），工作区在 `examples/demo/.presmium` 中，端口 5663 至 5666。消费者安装由 `scripts/consumer.ts` 的 `STUDIO` 完成（单独运行：`node scripts/consumer.ts [<目录>] --studio`）；打包在全仓的一个锁（`node_modules/.presmium-pack.lock`）之下进行，因为 `@presmium/dsh` 的 `prepack` 与 `postpack` 改写它自己的目录，CLI 与 studio 的消费者安装用例同时打包时会互相删去对方要打进去的文件。

### 13.2 契约与接口

| 契约或接口 | 位置 |
|---|---|
| 预览协议：`PREVIEW_PROTOCOL = 1` 与消息类型 | `packages/kernel/src/contracts/preview.ts`（`design-dsh.md` 第 4 节） |
| `RenderContext.preview?: { origins: string[] }`：开发服务器的页面带预览代理与允许的父页面来源 | `packages/kernel/src/ir.ts`（只增加可选字段） |
| 工作区服务的新路由：`ir`、`ir/events`、`preview`、`build`、`check`；无界面模式 `presmium serve --headless --preview-origin <源>`；服务令牌 `PRESMIUM_SERVICE_TOKEN` | `packages/workspace/src/node/`、`packages/cli/src/cli.ts`（`design-dsh.md` 第 5 节） |
| 审阅的路由：`review`（SSE 时为页面跟随）、`review/open`、`review/step`、`review/accept`、`review/reject`、`review/restore`、`review/events`（bundle 的 SSE）；`CHANGE_REVIEW` 的 git 实现由工作区服务在没有 deltabox 时提供，另以 `GIT_REVIEW`（ID `presmium.workspace.gitReview`，不在契约中）给助手；会话的提交另带尾注 `Presmium-Session`、`Presmium-Turn` | `packages/workspace/src/node/review/`、`packages/dsh/src/node/turns/` |
| `Focus`、`FocusReport`（工作台报告的、尚未换算的焦点）；`Annotation.focus`、`AgentContext.focus` | `packages/kernel/src/contracts/agent.ts`（只增加） |
| `MCP_ENDPOINT.issue(member, mode, { confirmed, document })`（`McpIssueOptions`）：会话令牌（主机已确认、绑定一份文档）；服务端路由 `presmium.server/tokens` 与 `presmium.server/focus` | `packages/kernel/src/contracts/server.ts`（只增加）、`packages/server/src/server.ts`、`focus.ts` |
| 工具表 `TOOL_TABLE` 与 `listTools(host, caller)`；列出的工具的 `_meta`（`presmium/kind`，主机已确认的调用者另有 `presmium/approval`）；客户端一侧 `@presmium/mcp/client`（`connectPresmiumMcp`、`describeOperation`）；焦点的换算 `resolveFocus`；资源 `presmium://focus` 与工具 `get_focus`；`McpHost.focus`、`watchFocus`、`approval`；`McpCaller.confirmed`、`document` | `@presmium/mcp` |
| bundle `@presmium/dsh`：`dsh.bundle`（`cordis.patch.yml`）、`web.patch.yml`、`profile.patch.yml`；启动器用的 `@presmium/dsh/launch`（`writeProfile`、`launchPatches`、`launchEnv`、`dshBin`、`launchArgs`、看门狗 `WATCHDOG` 与就绪的一行 `WEB_READY`） | `packages/dsh/` |
| 设计系统 `@presmium/design`（令牌、类、字体、图标、`COLORS`）；工作台的面板与状态 `@presmium/workbench`（`Workbench`、`workspaceClient`、`connectPreview`、`PANELS`、React 版的 `Pm*`）；bundle 的客户端部分 `@presmium/dsh/client` 与 `presmium-workbench` 行（`/api/presmium/workbench`） | `packages/design/`、`packages/workbench/`、`packages/dsh/src/client/`、`packages/dsh/src/node/workbench.ts`、`packages/dsh/build/` |
| `presmium dev --edit`（旧工作台的编辑模式，默认关闭） | `packages/cli/src/cli.ts` |
| `presmium studio [目录] [--port] [--host]` | `@presmium/studio`；`@presmium/cli` 转交 |

### 13.3 预览协议

工作台经 `postMessage` 驱动嵌在 iframe 中的产物页面：工作台发 `go`、`highlight`、`pick`、`pins`、`marks`、`appearance`，产物发 `ready`、`position`、`picked`、`selection`、`updated`、`report`；只传章节、块与步骤的 ID（步号按完整文稿编号，幻灯片形态用 `trail` 换算），源码位置由工作台从 IR 得出。预览代理只在工作区服务启动的开发服务器的页面中（`RenderContext.preview`），地址带 `presmium-preview=<nonce>`、在 iframe 中、来源在允许的列表中才启动；双方核对 `origin`、`source` 与 nonce；预览页面带 `frame-ancestors`。静态构建不带预览代理。产物在 DOM 上写锚点 `data-section`、`.pm-block[data-block]`、`data-step`，幻灯片形态有同样的块级锚点。消息的字段与握手见 `design-dsh.md` 第 4 节。

实现：

- **契约与代理**：`packages/kernel/src/contracts/preview.ts` 有 `PREVIEW_PROTOCOL`、两个方向的消息类型（`PreviewCommand`、`PreviewReport`）、两边共用的读取函数 `readPreviewCommand`、`readPreviewReport`（核对信封、版本、nonce 与字段，不认识的一律丢弃；`selection` 的内容在字段 `selection` 中，没有选中时为 `null`，与 `highlight` 的 `target` 一样）、`previewFrameAncestors`，以及不依赖框架的产物一侧 `startPreviewAgent(page)`：按锚点框出（`[data-preview-highlight]`，不在页面中的先由形态带进来）、在块的元素之中画编号标记（`.pm-preview-pin`）、点选（捕获阶段的点击，控件与链接照常，鼠标下的块加虚线框）、文字选中（`selectionchange`）、作者用的标记（`<html>` 的类 `pm-author-marks`，`AUTHOR_MARKS_CLASS`）、位置（至多每 150 ms）、页面重新渲染后重画（`MutationObserver`），`ready` 之前的问题攒到 `ready` 之后再发。这些都只对页面看得见的块：宿主的规则（排版了、不在 `[inert]` 与 `.pm-hidden` 之下）加上形态自己的规则（`PreviewPage.seen`；幻灯片中是点击还没显示或已经隐藏的块，即 Slidev 文档写明的类 `.slidev-vclick-hidden`，以及逐项出现的列表在第一项的点击之前），看不见的块不框（先由形态带到它出现的那一步）、不画标记、点不中（点在它的位置上得到章节）。nonce 另记在 iframe 的 `window.name` 中，同一个框架中换了地址或刷新后代理照样启动。两种形态各自只给出位置、跳转、明暗、修订号与问题：网页 `packages/web/src/client/preview.ts`（IR 运行时的 `navigation`、VitePress 的明暗开关），只由预览开发服务器生成的主题导入（`ThemeInput.preview`）；幻灯片 `packages/addon-core/src/client/preview.ts`（幻灯片的 `navigation`、Slidev 的 `useDarkMode`；预览中幻灯片的文字可以选中），只由 render-slides 在预览时写进生成文稿的 `setup/root.ts`。静态构建与 `presmium dev` 的页面不加载这两个文件，内核中的代理在构建中被摇掉（`packages/cli/test/preview.test.ts` 扫描两种形态的构建产物）。插件启动失败与组件出错（宿主的启动报告与 `componentErrors`）各报告一次。
- **修订号**：工作区服务以编译结果 IR 的哈希为修订号（`GET ir`），写进交给预览开发服务器的 IR 的 `meta`（键 `PREVIEW_REVISION`，即 `presmiumRevision`）；网页从 IR 运行时的文档读出，页面换上新的 IR 后发 `updated`；幻灯片由生成文稿的 Vite 插件读 `preview.json`，经 Vite 的 WebSocket 推送（`presmium:revision`，在幻灯片的热更新之后）。
- **步号**：`position`、`picked` 的 `step` 是页面自己的步号，都带 `trail`（`picked` 是块出现的那一步的，`PreviewPage.stepOf`），工作台用内核的 `trailStep` 换算成完整文稿的步号，与控制通道的位置相同；`go` 带 `trail` 时按它定位（`followedPlace`），只带 `step` 时按页面的步号。只给网页的块在幻灯片中不占步骤，端到端用例的文稿就有这样一步。
- **幻灯片的锚点**：每一页的标题与块包在章节的锚点 `<div class="pm-slide-section" data-section>` 中（`display: contents`，不改变版式；演讲者备注留在它之后，Slidev 只认页末的注释），每个顶层上屏块包在 `<div class="pm-block" data-block data-section data-step>` 中（点击的包装在它之内），静态构建中同样存在，所以宿主的 `blockElement`（`[data-section] .pm-block[data-block]`）在幻灯片中同样找得到块；生成文稿的样式（`render-slides/src/deck/style.css`）让主题“书卷”对段落与列表的规则对锚点中的同样有效，预览的幻灯片上没有子内容的角色是一个空的 `.pm-role-mark`，只在 `pm-author-marks` 时以 `::before` 显示标记（构建与 `presmium dev` 的幻灯片照旧只在演讲者备注中有标记）。网页的 `PmRoleMark` 同样看这个类（不再看 `EDIT_MODE`），旧工作台的编辑模式进入时也设它。
- **`frame-ancestors`**：预览页面的 `Content-Security-Policy: frame-ancestors <--preview-origin 的源>`（没有时 `'none'`）：网页由 `@presmium/web` 的 Vite 插件 `presmiumFrame` 给 VitePress 的全部回答加上（VitePress 自己回答的页面不带 `server.headers`），幻灯片由生成文稿的 `server.headers`。
- **工作区服务**（`packages/workspace/src/node/service.ts`、`routes.ts`、`serve.ts`）：`GET ir` 回答修订号、IR 与诊断（路径相对于工作区根目录，与 `source` 路由一致）；`GET ir/events` 是 SSE，先发当前的修订号（文档还没有编译过时，连接时开始第一次编译，发它的修订号），之后每次编译一条（事件 `revision`：修订号、错误与警告数、引起这次编译的文件，相对于工作区根目录）；`GET preview` 回答网页（工作区站点中这份文档的页面）与幻灯片的地址，幻灯片是每份文档在第一次请求时启动的 Slidev 开发服务器，从文档会话的编译结果更新（编译器的 `dev` 的 `DevOptions.compilation`，不另行编译），经工作区插件的代理挂在服务的 `/__presmium/presmium.workspace/slides/<目录>/` 下，所以每个预览都与服务同源，`--host` 时也只用服务的端口；`POST build`（`{ to? }`，写到服务的状态目录）与 `POST check`。无界面模式不传入工作区的浏览器插件与运营者插件的浏览器部分，首页写成没有服务端的文档卡片（`RenderContext.preview` 的站点）。环境中有 `PRESMIUM_SERVICE_TOKEN` 时，工作区插件的每条路由都要 `Authorization: Bearer <令牌>`（401），代理与服务端自己的路由不受影响。用例：`packages/workspace/test/service.test.ts`、`e2e/preview-protocol.spec.ts`。

### 13.4 bundle、确认与工具

- **bundle 的行**（`design-dsh.md` 6.2 节）：`presmium-service`、`presmium-workspaces`、`presmium-tools`、`presmium-policy`、`presmium-context`、`presmium-skills`、`presmium-turns`、`presmium-routes`（web 载体）、`presmium-workbench`（web 载体，客户端部分）。每一行按会话的目录解析它所属的文档，不按进程的工作目录；每份文档的目录登记为一个 dsh 工作区，工作区根不登记。
- **确认**（`design-dsh.md` 6.3 节）：策略 `off` 的工具不登记；`allow` 在 `tools/pre-execute` 中直接放行；`ask` 交给 dsh 的确认卡片，说明由 Presmium 按文稿语言给出；运营者目录用 `ctx.tools.guard` 拒绝。会话令牌是主机已确认的，工作区服务不再向页面窗口请求确认。
- **工具一致**：`@presmium/mcp` 导出一张工具表，MCP 与 dsh 两个适配器；dsh 的工具经回环的 `/mcp` 调用工作区服务。一致性用例断言两边的工具名与输入 schema 相同，`get_focus` 与会话上下文中的焦点相同。
- **焦点**：工作台把焦点报告给服务端，服务端把锚点换成源码范围与摘录（与 `locate_source` 同一个函数）并保存，MCP 的 `presmium://focus` 与 `get_focus`、bundle 的上下文都读它（`design-dsh.md` 第 8 节）。
- **profile 补丁**（`design-dsh.md` 6.6 节）：启动器每次启动都传入，关掉上传与遥测的行、DeepSeek 的品牌与账号的行，固定技能目录与第一次使用的工作区目录。

实现：

- **包**：`@presmium/dsh`（0.1.0，`engines.dsh` 与对 `@deepseek-ai/dsh` 的对等依赖都是精确的 `0.2.1-alpha.4`，即仓库中已有的一份）。每行一个普通 ESM 的入口 `rows/<行>.mjs`（导出 `@presmium/dsh/<行>`），用 jiti 加载 `src/node/` 的源码；bundle 不引用任何 dsh 的包，只为用到的宿主接口声明最小的类型（`src/node/dsh.ts`）。bundle 层 `cordis.patch.yml` 是全部载体的行（`presmium-service`、`-tools`、`-policy`、`-context`、`-skills`、`-turns`）；`web.patch.yml` 是 web 载体的行（`presmium-workspaces`、`presmium-routes`）与它的设置（工作区控制器的 `documentsDirectory`、关掉 `harness-dev-context`）；`profile.patch.yml` 是每个载体的 profile 设置（三个上传行、技能的 `agentsHome`、`workspace-write` 与 `ask`、`system-prompt` 的 `personaPrefix`）。启动器以 `--patch` 依次传入 `web.patch.yml`（只在 web）与 `profile.patch.yml`，环境中另有 `DSH_HOME`、`DSH_AGENTS_HOME`（其中的 `agents/`）、`DSH_TELEMETRY_MODE=DISABLED`；profile 列出 `dsh-base`、载体的 bundle 与 `@presmium/dsh`，并把本包链接进它的 `node_modules`（`launch.ts` 的 `writeProfile`）。技能的唯一来源是 `.agents/skills`：打包时 `prepack` 把 `package.json` 的 `presmium.skills`（`presmium-author`、`presmium-present`）复制进 `skills/`（不入库），检出中直接读源。
- **`presmium-service`**：环境中有 `PRESMIUM_SERVICE_URL` 与 `PRESMIUM_SERVICE_TOKEN` 时用它（工作区根是 `PRESMIUM_WORKSPACE`，否则 dsh 启动的目录）；否则自己生成服务令牌，以 `node watchdog.mjs node presmium serve <根> --port 0` 启动服务：看门狗以 `detached` 自成进程组，标准输入是来自 dsh 宿主的管道，管道关闭（宿主退出，`kill -9` 也是）或收到 SIGTERM 时向整个组发 SIGTERM，5 秒后 SIGKILL，服务退出时组中剩下的进程一并结束。服务的环境去掉 `DSH_*` 与 `DEEPSEEK_*`（模型凭据不进运行文稿代码的进程）。这一行提供 cordis 服务 `presmium`：会话的目录用 `ctx.workingDirectory.get(session)`（不是进程的工作目录），在工作区服务列出的文档中找到它所属的文档（`GET presmium.workspace/documents`，带服务令牌）；第一次需要时为会话取会话令牌（`POST presmium.server/tokens`），用 `@presmium/mcp/client` 连接 `/mcp` 并列出工具；`session/disposed` 时作废令牌，退出时作废全部。
- **`presmium-tools`**：`agent/created`（dsh 等这个监听者结束才处理输入）时，把会话的文档在 MCP 中列出的工具连同原样的 JSON Schema 登记为 `presmium__<名字>`，经 `agent.ctx.tools.register` 登记在 agent 自己的作用域中：每个会话有自己文档的工具，策略为 `off` 的种类 MCP 不列出，也就不登记。调用转成 `tools/call`。
- **`presmium-policy`**：`tools/pre-execute` 中，`presmium__*` 工具的种类与策略来自工具列表的 `_meta`；`read` 交给下一个监听者，`allow` 直接放行（完全访问模式下也执行），`ask` 返回 ask，说明用 `describeOperation` 按文稿语言写（如“Presmium · 运行「first」一节的 code-1”）；不属于会话文档的 `presmium__*` 工具拒绝；文件工具（`write`、`edit`、`str_replace_editor`）写到会话的文档目录之外时 ask。运营者目录（`PRESMIUM_OPERATOR_DIR`，或 `$XDG_STATE_HOME/presmium/operator`）由 `ctx.tools.guard` 拒绝（文件工具的路径在其中，或 `bash` 的命令提到它），pre-execute 对这些调用不提问，所以完全访问模式下也是 guard 的拒绝。会话令牌是主机已确认的：服务端对它的操作不再经 `APPROVALS` 询问窗口，`off` 的种类照旧不列出。
- **`presmium-context`**：system 消息中一段固定的指南（`presmium:guide`）；`agent/created` 时在 agent 的作用域登记运行时上下文 `presmium:document`，每一步之前（`agent/pre-step`）经会话令牌读 `deck_info`、`list_sections`、`get_position`、`get_focus` 重写快照：文档目录、标题、语言、入口、诊断数、章节、放映位置，焦点照 `get_focus` 的回答原样写成 JSON。
- **`presmium-skills`**：`ctx.skills.register` 登记 `presmium.skills` 中的技能（`source: 'bundled'`）。
- **`presmium-workspaces`**（web）：启动时（这一行激活之前）把每份文档的目录登记为 dsh 工作区，标题是文档的标题；之后每 3 秒比对文档：新建的登记，标题改了的改名，不在了的删去登记（会话保留）。工作区根不登记，因此 dsh 不建第一次使用的默认工作区。
- **`presmium-routes`**（web）：`/api/presmium/<路径>` 的精确路由（`GET`、`POST`），`documents`、`files`、`source`、`changes`、`changes/commit`、`changes/discard`、`revisions`、`revisions/revert`、`ir`、`ir/events`、`preview`、`build`、`check`、`review` 及其五个子路由转到 `/__presmium/presmium.workspace/<路径>`，`focus` 转到 `/__presmium/presmium.server/focus`；查询串、`Content-Type`、`Accept`、`presmium-document` 照传，加上服务令牌，回答按流原样返回（流式经 `connection.fetch` 可行）。没有 dsh 的 cookie 时 401（dsh 的栅栏）。
- **服务端**：`presmium.server/tokens` 只在设置了 `PRESMIUM_SERVICE_TOKEN` 时可用，并要求它（否则 403 或 401）：`POST { document, session }` 签发主机已确认、绑定该文档的令牌（同一会话再签发时作废旧的），`DELETE { session? }` 作废一个或全部；绑定的令牌只能读写它的文档（别的 `document` 报错）。`presmium.server/focus`：`GET ?document=`（不带时为任一文档最近的），`POST { document, focus: FocusReport[] }`（设置了服务令牌时要求它）由 `resolveFocus` 在文档的编译结果上换算：预览中点选的块或节得到它的源码范围（与 `locate_source` 同一个 `place`），编辑器中的行范围得到所在的节与块（包含起始行的最内层块），摘录从文件读出，超过 20 行时只留首尾并注明省去的行数；按文档保存最近一次，文档被删去、改名或重建时忘掉，`presmium://focus` 的订阅者收到更新。

实现（会话、审阅与修改历史，`design-dsh.md` 6.5 节）：

- **审阅移进工作区服务**：git 实现（`git-review.ts`、`review-record.ts`、`git-guard.ts`）从助手移到 `packages/workspace/src/node/review/`，行为不变（10.7 节）；`reviews.ts` 的 `Reviews` 是服务中的审阅：`presmium serve` 在 git 仓库中创建它，`GIT_REVIEW`（ID `presmium.workspace.gitReview`，服务与助手各自按这个 ID 定义，不在契约中，随助手的运行时删去）是它的 git 审阅，文档的 `ServerContext.service` 在编译结果没有 `CHANGE_REVIEW`（没有 deltabox）时也以它回答 `CHANGE_REVIEW`。助手的修改任务用 `CHANGE_REVIEW`，随包的 DeepSeek Harness 时用 `GIT_REVIEW`（两个工作台共存）；`presmium dev` 只登记 `GIT_REVIEW`（文稿的文档 `''` 换成它的目录）。旧的审阅记录照常读取：服务启动时（`recover`，在任何路由应答之前）逐份文档看记录，没有 `session` 的（助手的修改任务）进程已不在时按快照回滚并写日志（与原先挂载文档时相同的一行），有 `session` 的恢复（下一条）；`presmium dev` 只回滚，不恢复会话的审阅（没有能结束它的路由）。
- **会话的审阅**：路由在 `review/routes.ts`（13.2 节的表），请求的文档是 `Presmium-Document` 或 `?document=`，有服务令牌时同样要它。`review/open { session, turn? }` 以 `agent:<会话>` 取文档的锁（另一个持有者时 409 并给出锁），打开 git 审阅（快照包含当时还没提交的修改），同一会话再调用得到同一个审阅；`review/step { session, turn?, label?, tool?, end? }`：带 `label` 时记一个检查点，带 `end` 时 turn 结束：审阅没有改动就结束（`empty`，释放锁），`settings.presmium.assistant.review: auto` 时提交，否则等作者；不是这个会话的审阅时 409。`review/accept { reject?, message? }`：被拒绝的文件与 `.git/` 中的改动恢复为快照，其余经 `REVISIONS` 提交为一个提交，摘要是 `message`（没有时按文档语言写“AI 修改：<文件>”），正文列出各检查点，尾注 `Presmium-Origin: agent`、`Presmium-Task: <审阅 ID>`、`Presmium-Session`、`Presmium-Turn: <起>-<止>`、`Co-authored-by`（`Revisions.commit` 的 `trailers`，插在 `Co-authored-by` 之前），释放锁。`review/reject { paths? }`：给出文件时它们恢复为快照、审阅继续（没有改动了就结束），不给时全部回滚。`review/restore { step }`：文件回到那一步之前的检查点，那一步与之后的检查点去掉。`GET review` 回答 `{ review? }`（ID、会话、持有者、`turns`、`running`、`mode`、检查点、相对于快照的改动）；以 `text/event-stream` 请求时是页面跟随：先发当前的，之后每次变化与结束（`ended { outcome,revision?,files }`）。没有 turn 在运行、也没有页面跟随时，`reviewTimeoutMs`（助手的设置，默认 30 分钟）到期后回滚并写日志。审阅记录写明会话、成员、turn 的范围、检查点的树与各步，每一步重写；服务关闭时会话的审阅不回滚（记录留下，锁随进程释放），下一个服务进程启动时恢复它并重新持有锁，等作者处理。`GET review/events`（bundle 用的 SSE）：每个审阅的变化与结束，以及 `revisions/revert` 撤销了一个带 `Presmium-Session` 的提交（`reverted { session,documents,turns,revision,subject,revertedBy,files }`）。
- **`presmium-turns`**（`packages/dsh/src/node/turns/index.ts`）：在 `tools/execute`（确认之后、工具执行之前）中，属于一份文档的会话调用写文件的工具或 shell（`write`、`edit`、`str_replace_editor`、`bash`、`pwsh`、`terminal_send`）先调用 `review/open`（失败时这次调用以原因失败，什么也没写），执行之后 `review/step`（标签是工具与文件或命令）；turn 编号来自会话事件 `turn/start`，写过文件的 turn 在 `turn/end` 时告知 `end`；子 agent 的写入并入委派它的会话的审阅（会话头的 `origin: subagent` 与 `parentSession`，没有用例）。行激活后一直跟随 `review/events`（服务重启后再接上）：撤销的提交属于某个会话时，以 `Agent.inject` 注入一条 user 角色的通知（`source: { kind: 'presmium',form: 'notice' }`，正文以 `[Presmium]` 开头，写明 turn、提交与恢复的文件，提醒先读再改），模型在下一步读到；会话的 agent 不在时，等它被创建或恢复（`agent/created`）再注入。Presmium 不用 dsh 只存在于内存中的修改摘要。
- **审阅与修改卡片**：一次审阅覆盖会话在它期间的全部 turn，服务给出 turn 的范围与按工具调用的检查点；dsh 的修改卡片（`workspace/changes`）仍是每个 turn 的视图，列出的文件是审阅中改动的子集（构建的产物两边都没有），宿主重启后它消失而审阅仍在。
- **`GET preview`**：幻灯片的预览启动失败时只回答网页的地址；不是无界面模式的 `serve` 不给幻灯片的开发服务器预览的配置（没有预览代理与 `frame-ancestors`）。
- **用例**：`packages/dsh/test/turns.test.ts`（web 载体与假模型：打开与锁、两个 turn、拒绝一个文件、接受与尾注、撤销与给会话的消息；回到检查点、构建不在审阅与修改卡片中、全部拒绝；宿主重启后经新宿主的 `/api/presmium/review/accept` 接受；无人跟随时超时回滚）；`packages/workspace/test/review.test.ts`（路由、页面跟随、服务重启后恢复会话的审阅、旧格式的记录回滚、非无界面模式的幻灯片预览）。
实现（工作台的外壳）：

- **包**：`@presmium/design`（1.x，随 `host` 发版）是 `packages/host/src/design/` 移出的 `tokens.css`、`components.css`、`fonts.css`、`design.css` 与图标（`ICONS`、`iconMarkup`），另有颜色令牌的名字（`COLORS`、`color(name)`）；没有框架，`host` 的 `design.css` 引入它，Vue 组件与 `useTheme` 留在 `host`，产物的外观不变。`@presmium/workbench`（0.x）是 React 面板与框架无关的部分：工作区服务的客户端（`workspaceClient`，页面经 `api/presmium/<路由>` 带 dsh 的 cookie 访问，`?document=` 指文档，`ir/events` 用 `EventSource`）、状态（`Workbench`：文档与文档操作、打开的文档、它的文件、IR 与诊断，`ir/events` 中改过的打开的文件与磁盘比较、没改过的跟随、改过的提示合并或重新载入，保存带打开时的版本、409 时用 `node-diff3` 三方合并）、预览协议的工作台一侧（`connectPreview`：每个 iframe 一个 nonce，核对 `origin`、`source` 与 nonce，`ready` 之后补发每种命令的最后一条；版本不符时提示）、源码与预览的对应（`placeAt`、`placeOf`，由旧工作台移来）、CodeMirror 6 的编辑器、React 版的 `Pm*` 组件（类同 `host` 的 Vue 版）与中英文的文字；面板为 `HomePanel`（文档卡片、从模板新建、改名、复制、删除，启动台搜索，MCP 卡片）、`FilesPanel`、`SourcePanel`、`ProblemsPanel`（IR 的诊断与页面的 `report`）、`PreviewPanel`（网页与幻灯片两种形态、点选、`ready` 迟迟不来时重新载入）、`DocumentView`、`StatusItems`，以 `PANELS` 描述。分层检查保证它不引用 vue、`@presmium/host` 与 `@deepseek-ai/*`。
- **客户端部分**（`packages/dsh/src/client/`）：`presmium-workbench` 行（web 载体，`web.patch.yml`）名为包名本身 `@presmium/dsh`：dsh 的模块系统只把整包名的行当作客户端的来源（`<包>/<子路径>` 的行不算），所以包的 `.` 出口是这一行（`rows/workbench.mjs`），`./client` 是预编译的包。`index.tsx` 在启动图中没有 `@deepseek-ai/dsh-client-ui-layout` 时占据 `root`（与 ui-layout 相同的六个子槽位，`contract.ts` 的 `ROOT_CHILDREN`），用 `dsh-client-store` 的 `defineStore` 建布局的状态，`ctx.reflect.provide('layout')` 提供 `ctx.layout`（`layout.ts`：`panelInfo`、`selectPanel`、`beginNavigation`、`toggleSidebar`、`openRightbar`、`closeRightbar`），`ctx.slots.provideRoot` 提供 `usePanelInfo`，重新实现 ui-layout 的主题呈现（`theme.ts` 的 `ThemePresenter`），登记“展开／收起侧栏”的快捷键（桌面 Mod+B，网页 macOS 与 Windows 上 Mod+Alt+B；dsh 不许网页在 Linux 上用这一组合）；有 ui-layout 时改为退路（`fallback.tsx`）。`Frame.tsx` 排出活动栏、侧栏（文档的文件树，或 dsh 的 `sidebar`：会话、插件、自动任务、设置）、中央（启动台或打开的文档；选了 `main` 的全局面板时显示它）、右侧坞的轨道（`rightbar`，按中央保留 400 px 算出 `width` 与 `canShow`）、停靠在最右的对话（`main` 的 `conversation`）、状态栏与 `shell.bottom`、`shell.overlay`；侧栏、右侧坞与对话之间有拖动柄；网页标题跟随当前会话（没有会话时为打开的文档）；宽度小于 1024 px 时侧栏浮在中央之上，小于 768 px 时活动栏横排在顶部，文档、文件、源码、预览、会话与对话各占整个宽度，dsh 的右侧坞在窄屏中自己全屏；活动栏的“设置”点 dsh 侧栏底部的设置按钮（设置面板自己浮在页面上）。`theme.ts` 以 `ctx.theme.overrideTokens` 把 dsh 的客户端插件用到、ui-theme 定义的 78 个 `--dsw-alias-*` 令牌（另有侧栏、气泡、菜单的几个 `--dsw-specific-*` 与焦点环）映射为 `var(--pm-color-*)`，dsh 在上面画白字的发送按钮与提示气泡用固定的深色；`<html>` 的 `dark` 类与预览的 `appearance` 跟随 dsh 的明暗，字体是 Presmium 的，用户自己选的优先。`brand.tsx` 占据 `sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`，以优先级 -1 的同名步骤替换 `settings.onboarding` 中的 `welcome-notice`（Presmium 的首次使用提示，画在页面之上，读过记在浏览器的 `localStorage`，可以直接打开模型设置）与 `deepseek-official`（DeepSeek 的登录，立即完成），并用 `ctx.locale.addLanguage` 加上 `zh-CN`、`en-US` 两个语言包（`conversation` 的 `hero.headline`、`hero.preview`）；界面语言由 `ctx.locale` 映射为 `zh-CN` 或 `en` 交给面板。插件页的实验插件组（其中有插件市场）按它的 DOM 属性 `data-plugin-group="extensions"` 隐藏。
- **宿主部分与补丁**：`src/node/workbench.ts` 以 `ctx.webServer.tapIndex` 把网页标题换成 Presmium、图标换成 Presmium 的标志、去掉 dsh 的 web manifest，并登记 `/api/presmium/workbench`（工作区服务 MCP 的地址，首页的 MCP 卡片用）。界面的行在 `web.patch.yml`（只属于 web 载体，headless 与 acp 不受影响）：关掉 `ui-layout`、`ui-brand-official`、`ui-settings-account`、`account-controller`、`deepseek-account`、`llm-deepseek-account`、`web-search-deepseek`、`ui-settings-web-search`、`ui-settings-session-log`。启动器以 `--patch` 传入，所以用户在插件管理中关掉 `@presmium/dsh` 之后，这些行与工作台仍在，bundle 自己的行与 `/api/presmium/*` 不在，首页说明怎样在“插件”中重新打开。
- **构建**（`packages/dsh/build/`）：`client.mjs` 用 esbuild 把 `src/client/index.tsx`（连同 `@presmium/workbench`、CodeMirror 与设计系统）打成 `build/dist/client.js`，外部依赖是外壳模块表的键（`contract.ts` 的 `SHELL_MODULES`），输出包在 `window.__ModuleLoader__.load({ id: '@presmium/dsh', factory })` 中；样式（含以 data URL 内联的 WOFF2 字体，dsh 的模块系统只提供插件的脚本）是一个字符串，模块在页面中加上带 `data-plugin` 的 `<style>`。打包时 `prepack` 构建（`presmium.generated` 含 `build/dist`，不入库）；检出中 `rows/workbench.mjs` 在 dsh 读取客户端包之前调 `ensure.mjs`：包不在或比它的源码（`build/dist/client.json` 列出）旧时重新构建，写入是原子的；从 npm 安装的包不构建。约 950 KB（未压缩）。
- **用例**：`e2e/workbench.spec.ts`（启动审计、两种宽度、侧栏的拖动柄与快捷键、保存与预览更新、双向定位与问题、外部改动与合并、明暗两套的对比度、两种界面语言的品牌、文档管理、关掉 bundle、退路布局），用 `e2e/fixtures/workbench/studio.ts` 以 studio 的方式启动（`presmium serve --headless --preview-origin <dsh 的源>` 加 `packages/dsh/test/harness.ts` 启动的 web 载体）；`packages/dsh/test/workspaces.test.ts`（`presmium-workspaces` 的跟随）。

### 13.5 升级闸门

每次升级 dsh 都先运行五组用例（第 7 节）：

1. `--dump-config` 的行 ID；
2. 经 bundle 的 headless 假模型用例：工具、四种确认策略、上下文、隐私、工具一致；
3. 客户端的启动审计：`root` 的子槽位、`ctx.layout` 的成员、品牌与首次使用提示的槽位名、`--dsw-*` 令牌名、外壳模块表的键、页面没有错误；
4. 工作台调用的 Host API 端点的 schema 比对；
5. 工作台的端到端用例，含退路布局。

第 1、2 组在 `packages/dsh/test/`：`config.test.ts`（三个载体的 `--dump-config`；headless 与 acp 启动时没有未激活的行；`engines.dsh` 不满足时安装被拒、启动时跳过）是第 1 组；`policy.test.ts`（`ask`、`off`、`allow`、会话令牌、运营者目录）、`privacy.test.ts`（请求体与技能目录、profile 补丁重新打开上传行、persona）、`context.test.ts`（web 载体上两份文档的两个会话、工作区登记、`/api/presmium/*`）、`parity.test.ts`（工具一致、焦点、6.12 节的四个操作）是第 2 组；`service.test.ts`（`kill -9`）不属于闸门。单独运行闸门：`pnpm exec vitest run packages/dsh -t '\[gate\]'`。

第 3 组是 `e2e/workbench.spec.ts` 中带 `@gate` 的启动审计：读锁定版本的客户端包（`e2e/fixtures/workbench/audit.ts`），核对 `root` 的子槽位与 ui-layout 声明的相同、dsh 插件调用的 `ctx.layout` 成员都在 `LAYOUT_MEMBERS` 中、品牌与首次使用的槽位与步骤还在、用到且定义了的 `--dsw-alias-*` 都已映射、映射的都已定义、外壳模块表的键等于构建的外部依赖、插件页实验插件组的属性还在，再打开页面，启动图中有 `@presmium/dsh` 而没有 ui-layout 与 DeepSeek 的品牌和账号，没有页面错误；同一文件的退路用例也带 `@gate`（第 5 组的一部分）。单独运行：`pnpm exec playwright test e2e/workbench.spec.ts --grep @gate`。

### 13.6 旧工作台

`presmium serve` 的界面、`@presmium/workspace` 的浏览器部分、助手与讲授插件中属于工作台的面板、`presmium dev` 的编辑模式，以及只为它们存在的契约（`EDIT_MODE`、工作台的工具栏槽位、`AGENT_RUNTIME` 的 ACP 实现）在 1.0 中是实验性的，只修缺陷，由第 3 节的白名单隔离，将随旧工作台删去。本文描述它们的地方：4.8 节的 `AGENT`、`AGENT_RUNTIME`，5.10 节的工作区首页、编辑模式与槽位，5.11 节，5.12 节中助手与讲授的面板，10.2 节的“`presmium dev` 的编辑模式”，10.7 节中经 ACP 的部分。删去时要解开的耦合列在 `design-dsh.md` 13.3 节。 `presmium serve` 是工作区服务加产物（首页是文档卡片），`presmium dev` 是实时预览加“在编辑器中打开”，浏览器中的编辑只在 `presmium studio` 中。
