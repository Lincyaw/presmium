# Presmium 架构

本文档定义编译管线、包结构、分层、跨上下文契约、插件约定、测试、服务端与安全。领域概念见 `domain-model.md`，文稿与运行快照见 `ir.md`，工作台见 `studio.md`，作者操作（Web 与 MCP、配音、录制、历史、诊断）见 `authoring-actions.md`，控件与视觉见 `design-system.md`，云端见 `cloud.md`。

**定位**：

- 核心（编译器、渲染端、IR 运行时、CLI）与产物不依赖模型，不引用 DeepSeek Harness（dsh）。不改源码的功能（放映、课堂、运行代码、读者问答、讲授录制）属于产物，改源码的属于工作台。
- 工作台 `presmium studio` 是 dsh 的定制发行版，实验性，三个包为 0.x。
- 本地服务只供运行它的用户（运营者）使用，代码与 agent 以他的身份运行；安全措施是纵深防御，不做租户隔离。多人使用时每人一个容器（`@lincyaw/cloud`）。
- 读者得到静态站点，问 AI 用自己填写的模型服务，在浏览器中完成。

**原则**：

1. **依赖优先**：经公开接口使用现成组件，不 fork、不打补丁、不引用内部路径。
2. **微内核**：内核只提供服务注册、锚点、检查、故障隔离。多个插件共用的业务契约与无状态纯函数也放在内核，因为插件之间不互相引用；内核运行时不使用它们。
3. **业务功能都是插件**，官方与第三方同一套接口；插件经服务接口协作，实现可替换。
4. **纯文本、可复现**：同一提交渲染结果一致。
5. **文稿 IR 唯一权威**：`lecture.json`（`TeachingDocument`）是唯一内容入口；运行快照由编译器派生，不是第二入口。
6. **边界是标准协议**：Jupyter 内核协议、MCP、nbformat 输出、WebVTT、git。每种边界一个客户端，厂商接口只在一个适配器中。

## 1. 编译管线

```
lecture.json + 引用的代码与媒体
   │ kernel：Schema 与领域校验   workspace：版本事务与历史
   │ compiler：状态解析 → 插件步骤 → 编译时执行（缓存）→ 运行校验
   ▼
运行快照 IRDocument（packages/kernel/src/ir.ts）
   ├── web              网页：预先打包的查看器
   ├── render-slides    幻灯片：查看器的幻灯片页；PDF、图片、PowerPoint
   ├── render-notebook  .ipynb
   └── 插件渲染端        如 addon-lecture 的 lecture
```

保存不等待编译，渲染端只读快照。网页与幻灯片是同一查看器的两种页面，共用插件组件与宿主适配（`packages/web/src/client/host.ts`）。`dev`、`serve` 进程中另有服务端（第 10 节）；静态产物不依赖它，相关功能隐藏或降级。

### 1.1 查看器与资源

**查看器**（`packages/web/src/node/viewer-app.ts`，页面在 `src/app/`）为一组插件打包一次，文稿只是数据；工作台、`dev`、`serve` 与构建的站点都用它。

- Vite 构建，组件按需分块，共享模块经导入映射给出；缓存在 `$XDG_CACHE_HOME/presmium/viewer-app/`，按源码与插件指纹命名。`PRESMIUM_VIEWER_SEED` 指定只读预打包目录。
- **文稿代码包**（`document-bundle.ts`）：文稿组件与插件的 `documentModules`，代码变了才重建，只改文字不重载。
- **站点**：查看器在 `_app/<键>/`；每份文稿有 `ir.json`、`search.json`（MiniSearch）、`_code/<键>/document.js`。每页先 SSR，浏览器再 hydrate。
- **站点服务**（`site-server.ts`）：`<base>__app/` 下有 `view`、`ir`（`ETag`）、`events`（SSE）、`search`、`source`。`dev` 中把 `/__presmium/` 代理到服务端。
- **预览**：`preview` 等查看器与当前代码包就绪才答复，不以旧版本冒充当前版本；`prefetch=1` 只开始准备。每个面板最多两个 iframe。只有声明 `presmium.preview.restartable: true` 的包组成的预览可暂停复用。

**调度**：一个宿主进程一次一份顶层编译，`priority: 'interactive'` 优先；`compile({ signal })` 可取消，取消的结果不入缓存；保存事件合并 10 ms，新修改取消旧编译。

**资源档**（`@lincyaw/kernel/node` 的 `threadBudget`、`spawnInteractiveNode`）：交互档（工作区服务、dsh、查看器构建）按空闲处理器的四分之三取线程，至多 8；后台档（构建、导出、代码执行）单线程、低优先级。`PRESMIUM_MAX_THREADS` 设上限。都是软限制。

## 2. 仓库结构

| 包 | 作用 |
|---|---|
| `kernel` | 共享内核：文稿、IR 与插件契约、服务注册、锚点、检查、共用纯函数；`./node` 是 Node 工具 |
| `host` | 宿主接口、React hooks 与通用组件 |
| `design` | 令牌、`pm-ui-*` 类、字体、图标，无框架 |
| `compiler` | 校验、快照编译、插件加载、编译时执行、渲染端调度、导出 |
| `viewer` | IR 运行时：渲染、运行时视图、实时更新 |
| `web` | 网页渲染端：查看器、站点外壳、宿主适配、站点构建与服务；`./slides` 是幻灯片页 |
| `render-slides`、`render-notebook` | 幻灯片（含导出）与 notebook 渲染端 |
| `cli` | `presmium` 命令；`./testing` 供集成测试 |
| `presmium` | 全局 CLI，带渲染端与官方插件，转交给项目里的那一份 |
| `create-presmium` | 新建讲义、工作区或插件项目 |
| `server` | 服务端：插件路由与代理、来源检查、确认、控制通道、MCP 挂载 |
| `mcp` | MCP 工具与资源；`presmium-mcp` |
| `workspace` | 工作区服务 `presmium serve`：文档、历史、审阅、任务、工作区站点 |
| `language-server` | `lecture.json` 的语言服务 |
| `vscode` | VS Code 扩展（私有，平台 VSIX） |
| `skills` | 从 `.agents/skills` 打包的四项技能 |
| `classroom-server` | 课堂同步（y-websocket） |
| `workbench` | 工作台 React 面板与工作区客户端，不认识 dsh |
| `dsh` | dsh 的 bundle：宿主部分与预编译的客户端部分 |
| `studio` | `presmium studio`：组装 profile，监管 dsh 与工作区服务 |
| `cloud` | 云端控制台（私有，`cloud.md`） |
| `addon-code` | 代码引用：锚点、锁定提交、漂移 |
| `addon-exec` | 运行面板、分步执行、录制输出；Pyodide 与脚本 Worker |
| `addon-exec-local` | 本地容器执行与环境复刻 |
| `addon-exec-wasi` | WebAssembly 中的 C、C++、Ruby、SQLite |
| `addon-exec-webgpu` | WGSL 与 jax-js，构建时在 Chromium 中录制 |
| `addon-exec-jupyter` | 远端 Jupyter 内核与浏览器终端 |
| `addon-content` | 图表、思维导图、媒体、网页组件 |
| `addon-motion` | 按步内时间画出的动画场景 |
| `addon-guide` | 模拟光标、聚光、提示 |
| `addon-stage` | 讲台：备注、冻结画面、黑屏、圈画 |
| `addon-session`、`addon-classroom` | 课堂会话与同步；笔记、测验、练习、提问、反馈 |
| `addon-assistant` | 读者问答（`ASK`） |
| `addon-lecture` | 讲授轨、录制、回放、视频导出 |
| `addon-speech` | 语音路由、引擎适配、合成缓存 |
| `addon-publish` | 离线、高对比度、导出、视觉差异 |

npm 名为 `@lincyaw/<目录名>`，例外是 `create-presmium` 与 `presmium-vscode`。其他目录：`templates/`（`env/`、`workspace/`、`plugin/`、`site/`）、`examples/animations/`、`site/`（文档站）、`e2e/`、`scripts/`、`.changeset/`（`README.md` 是公开与私有的表）、`.agents/skills/`。

公开包一组固定版本；工作台三个包各自 0.x。源码以 `.ts`、`.tsx` 发布，例外是 `presmium-vscode` 与 dsh 的客户端部分。CLI 经 jiti 加载 TS，Node 子进程以 `--import` 加载 `@lincyaw/kernel/node` 的 `strip-types.mjs`。`package.json` 的 `presmium.generated` 列出打包时生成的路径。

## 3. 包内分层

```
packages/addon-<ctx>/
├── src/domain/    纯 TS
├── src/shared/    两端都运行的代码（可选）
├── src/node/      Node 适配器：编译步骤、执行器、检查、运行时文件、服务端贡献
├── src/client/    浏览器适配器：plugin.ts、viewer.ts、服务实现
├── components/    组件，按文件名注册，两种形态共用
└── vite.config.ts 可选：查看器构建的 Vite 插件
```

`exports`：`./domain`、`./client`、`./presmium`（默认导出 `PresmiumNodePlugin`）。插件对 `kernel`、`host`、`viewer`、`compiler` 是对等依赖。

`scripts/check-layering.mjs` 的规则：

| 规则名 | 内容 |
|---|---|
| `all UI uses React` | 不引用 Vue |
| `domain is pure TS` | `src/domain/` 不引用 UI 框架、`@lincyaw/host`、Node 内置模块与目录外的相对路径 |
| `shared code runs in Node and in the browser` | `src/shared/` 同上，另不引用 `@lincyaw/kernel/node`；相对路径只到 `shared/`、`domain/` |
| `kernel is framework-free` | kernel 除 `src/node/` 外不引用 UI 框架、Node 内置模块与 `src/node/` |
| `kernel/node is framework-free`、`node adapters are framework-free` | `src/node/` 不引用 UI 框架 |
| `no package uses Slidev or VitePress (both forms are the viewer app)` | 不引用 `vitepress`、`@slidev/*` |
| `no package uses an addon` | 测试之外不引用 `@lincyaw/addon-*` |
| `relative imports stay in their package` | 相对路径不离开本包 |
| `node packages are framework-free` | `server`、`mcp` 不引用 UI 框架与 `viewer`、`web`、`host` |
| `only cli and workspace use the server` | 只有它们引用 `@lincyaw/server` |
| `only server and dsh use mcp` | 只有它们引用 `@lincyaw/mcp` |
| `plugins use contracts, not the hosts` | `addon-*` 不引用 `server`、`mcp`、`workspace`、`web` |
| `protocol clients stay in their adapter` | `@modelcontextprotocol/*` 只在 `mcp`；`@jupyterlab/services`、`@xterm/*` 只在 `addon-exec-jupyter`；`mediabunny` 只在 `addon-lecture`；动画库只在 `addon-motion/src/client/`；`simple-git` 只在 `src/node/` |
| `DeepSeek Harness only in dsh and studio` | `@deepseek-ai/*` 只在 `dsh`、`studio` 的源码与依赖中 |
| `the workbench's panels know no host` | `workbench` 不引用 Vue、dsh、`@lincyaw/host` |
| `the design system only uses framework-free icons` | `design` 只引用 `lucide` |
| `outputs do not use the workbench` | `web`、`viewer`、`render-*`、`addon-*` 不引用 `workbench` |

语音提供方的接口只在 `addon-speech/src/node/engines/`。读取编译结果的纯函数在 `kernel/src/reading.ts`，`mcp` 因此不依赖 IR 运行时。

## 4. 跨上下文契约

契约以源码为准：`packages/kernel/src/contracts/`（汇总于 `contracts.ts`，入口 `@lincyaw/kernel/contracts`）、`kernel/src/ir.ts`、`packages/host/src/contracts.ts`。

| 模块（`contracts/`） | 内容 |
|---|---|
| `document*.ts` | `TeachingDocument` 及读取、批注、历史、图片、语音、音频 |
| `plugin.ts`、`service.ts` | `PluginDefinition`、`PresmiumNodePlugin`、`defineService` |
| `anchors.ts`、`checks.ts`、`diagnostics.ts` | 锚点、检查、诊断快照 |
| `execution.ts` | `RunRequest`、`RunResult`、`RunContext`、`Executor`、进程沙箱、具名环境 |
| `server.ts` | 成员、路由、服务端上下文、确认、SSE、MCP 访问 |
| `speech.ts`、`voice*.ts`、`transcription*.ts` | 语音、音色、转写、配音 |
| `agent.ts` | 智能体、焦点、审阅与修改历史 |
| `operations.ts`、`steps.ts`、`production*.ts` | 操作与讲授轨、步骤、制作计划 |
| `preview.ts` | 预览协议 |
| `authoring*.ts`、`projects.ts`、`workspace.ts` | 作者操作与工作区 |
| `classroom.ts`、`presenter-panels.ts`、`offline.ts`、`locale.ts` | 课堂、演讲者面板、离线、语言 |

契约只做兼容扩展。`KERNEL_VERSION` 是插件契约版本，与包版本分开。

### 4.1 插件与服务

`PluginDefinition = { manifest, setup(ctx), dispose? }`；清单声明 `provides`、`requires`、`kernel` 范围、`capabilities`；`PluginContext` 提供 `config`、`provide`、`get`、`tryGet`、`events`、`log`、`mode`。一个令牌只有一个实现。

### 4.2 Node 端插件

| 字段 | 作用 |
|---|---|
| `version`、`kernel` | 内核范围不满足时不加载（`check-plugins.mjs` 检查） |
| `passes` | 编译步骤；`after: 'execute'` 在执行之后 |
| `executors`、`environments` | 编译时执行器；具名环境提供方 |
| `resolvers`、`anchors`、`checks` | 锚点与检查 |
| `renderer`、`rendererExtensions` | 渲染端；为其他渲染端的组件转换 |
| `assets`、`documentModules` | 运行时文件；随文稿变化的模块 |
| `exporters` | 重输出，作为工作区任务运行（13.3 节） |
| `services` | Node 服务；`ctx.settings` 是运营者设置 |
| `server` | `/__presmium/<插件 ID>/` 下的路由与代理 |
| `tools` | agent 工具，经 MCP 暴露 |
| `operator` | 列在 `settings.presmium.workspace.plugins` 时每份文档都加载 |

插件按文稿 `plugins` 从文稿目录向上找 `node_modules`；依赖或范围不满足时报告 `presmium.plugins` 诊断，构建继续。工作区根目录取 `CompilerOptions.workspaceRoot`，否则向上找 `presmium.workspace.yaml`（不越过 git 根）；产物中的路径相对化，不随检出位置变化。

### 4.3 锚点与检查

锚点写作 `scheme:target`，解析为 `exact`、`moved`、`fuzzy`、`lost`，后两种必须诊断。随文稿提交的 `.presmium/` 有 `anchors.lock.json`、执行缓存 `freeze/`、本地化资源 `assets/`、圈画 `drawings/`，新检出构建时不访问远程、不重新执行。另一环境的录制默认沿用并警告；`Executor.revision` 不同的不沿用。

### 4.4 宿主接口

`HostAdapter`（`host/src/contracts.ts`）给组件 `mode`、`lang`、`useCursor`、`useStep`（文档视图为 `Infinity`）、`useViewRole`、`useStaticRender`、`useSectionConfig`、`useSharedState`、`getService`。`@lincyaw/host` 另有：

- `useStepState`、`StepScope`：块内步骤状态。
- `useStepTime`：步内时间；现场按页面时间，回放与导出由 `STEP_CLOCK` 驱动，停定、后退与减少动态效果时为 `Infinity`。
- `useActions`：具名动作，报告 `click`，讲授经它重放。
- `useSharedState` 的 `scope`：`view`、`local`（本机窗口，BroadcastChannel）、`remote`（经同步传输跨设备）。
- `useServer`、`useLocale`、`useMessages`、`siteBase`、`PmBoundary`、`registerPresmiumPlugin`、`startHost`、`stopHost`。

`STEP_CLOCK` 与 `OPERATIONS` 是宿主的唯一实现，插件不能替换。

**课堂写入规则**：服务端只接受能完整并入房间的更新；学员只写属于自己参与者 ID 的条目，`quizzes` 只有主讲能写；违反时拒绝整个更新并断开。读取方先收窄每个值。规则写在 `contracts/classroom.ts`。

### 4.5 公共服务令牌

| 令牌 | 提供方 | 使用方 |
|---|---|---|
| `executor` | 执行与环境插件 | 代码块、运行面板、练习 |
| `session`、`classroomStore` | 会话插件 | 课堂功能 |
| `navigation`、`toolbar`、`presenterPanels`、`syncTransports` | 宿主 | 插件、会话 |
| `operations`、`stepClock`、`status` | 宿主 | 操作报告与重放；步内时间；状态摘要 |
| `speech` | 语音插件 | 讲授、agent 工具 |
| `ask` | 读者问答插件 | 提问面板、课堂 |
| `revisions`、`documentFiles`、`documentLocks` | 工作区（Node） | 修改历史；写文档目录；单一写入方 |
| `approvals`、`mcpEndpoint` | 服务端（Node） | 确认；会话 MCP 令牌 |
| `changeReview` | 工作区服务（Node） | 审阅（10.7 节） |
| `processSandbox` | 运营者插件 | 编译时执行 |

宿主令牌在 `host/src/contracts.ts`，其余在内核。Node 令牌登记在编译器为每份文稿建立的注册表中。

### 4.6 执行

- `RunRequest.executor` 精确选择执行器；不可用时返回 `failedRun`，回退到录制，不改用其他执行器。
- 同一 `:session:` 的运行共享解释器状态、按序执行。
- `RunResult.outputs` 是 nbformat v4 输出；HTML 经 DOMPurify 清洗后显示。
- 具名环境由头部 `execute.environments` 声明，不含凭据；凭据方式 `none`、`env`、`proxy`、`prompt`、`hub`，凭据只在服务端。
- 编译时代码只得到清理过的 `RunContext.env`；有 `PROCESS_SANDBOX` 时经它运行。
- Node、Pyodide 与容器共用 `@lincyaw/kernel/runner.py`。
- `Executor` 的可选 `revision`、`runsIn`、`params` 分别给缓存、面板标注与参数显示。

### 4.7 服务端契约

插件的 `server(ctx)` 返回路由（Fetch API 处理函数，`role`、`maxBody`）与 `ProxySpec`（代加请求头）。浏览器经 `useServer()` 的 `fetch`、`events` 访问，请求带 `Presmium-Document` 头。`config` 是文稿 metadata，能编辑文稿的人都能改；`settings` 是运营者设置，文稿不能覆盖。

### 4.8 语音、智能体与历史

- `SPEECH` 提供合成、转写、音色；引擎由运营者以 `PRESMIUM_SPEECH_<ID>_URL`、`_KEY`、`_PROVIDER` 定义。语音 `lang` 是 BCP 47。
- 读者问答在浏览器中经读者自己的服务，不经站点服务端。
- agent 工具的元数据标明种类（读取、操作、计费），确认按种类。
- 每次接受的修改是一个 git 提交，尾注 `Presmium-Origin`，会话修改另有 `Presmium-Session`、`Presmium-Turn`。

### 4.9 操作与讲授轨

操作词汇：`go`（IR 运行时）、`run`（执行）、`spot`、`hint`（引导）、`point`、`ink`（讲授）、`click`（组件动作）。讲授插件把操作与时间录为讲授轨，回放经 `OPERATIONS.replay` 与 `STEP_CLOCK`。制作计划的边界是 `ProductionPlan`、`ProductionBinding`（`ir.md`）。

## 5. 插件约定

### 5.1 浏览器端注册

| 入口 | 查看器怎样使用 |
|---|---|
| `src/client/plugin.ts` | 默认导出 `PluginDefinition`，经 `registerPresmiumPlugin` 注册 |
| `components/*.tsx` | 文件名即组件名，第一次显示时载入 |
| `src/client/viewer.ts` | 默认导出 `ViewerPlugin`，IR 运行时启动前调用 |
| `vite.config.ts` | 默认导出 `{ plugins }`，加入查看器构建 |

`ViewerPlugin` 可以注册视图、节点渲染器、组件、按键动作与图层（`viewport`、`view`、`slide`、`bar`）；抛错的被跳过。组件重名取插件列表中第一个并警告；文稿自己的 `components/` 以插件 ID `deck` 登记。组件只依赖 `host`、`kernel` 与 React。

### 5.2 配置

全局 `metadata.presmium[pluginId]`，页面 `sections[id].config[pluginId]`，实例 `blocks[id].parameters`；`useSectionConfig` 给出合并结果。讲授时序只在 `production`。

### 5.3 步骤可逆

视觉状态是步骤的纯函数；动画是（步骤，步内时间）的纯函数，时间只取 `useStepTime()`。读者的本地步进不写回宿主。

### 5.4 错误隔离

IR 运行时给每个插件组件包 `PmBoundary`，抛错只影响自己；`resetKey` 变化时恢复。

### 5.5 减少动态效果

读 `usePrefersReducedMotion()`，开启时显示终态；只有按帧导出的视频照常画动画。

### 5.6 媒介限定

块的 `only` 限定媒介；排版提示在页面 `layout.renderers`。

### 5.7 界面语言

- 文稿语言只由头部 `lang` 声明，默认 `zh-CN`，写入 IR `meta.lang` 并设置 `<html lang>`。
- 浏览器界面语言为 `zh-CN` 或 `en`：`<html lang>` 以 `zh` 或 `en` 开头时取之，否则看 `navigator.language`，仍不能确定时为英文。
- 每个包维护自己的 `{ 'zh-CN': …, en: … }` 目录；组件中用 `useMessages(CATALOG)`，组件外用 `CATALOG[currentLocale()]`。只有 `@lincyaw/host` 观察 `<html lang>`。
- 用词按 `glossary.md`；`scripts/check-i18n.mjs --strict` 检查，误报写在 `scripts/check-i18n.allow.json`。
- 服务端或浏览器的失败原因按代码映射为目录文本，不显示原文。
- 编译时写入产物的文本按文稿语言（`deckLocale`）；命令行语言由 `@lincyaw/kernel/node` 的 `systemLocale` 决定。

### 5.8 静态导出

PDF、图片与 PowerPoint 中组件显示 IR 的 `fallback`（`useStaticRender()` 为 true），插件负责降级内容完整。打印页是幻灯片页加 `?print`，就绪时 `<html>` 有 `data-presmium-printed`。

### 5.9 浮层与组件拥有的代码

不占版面的组件标为 `layer: 'overlay'`。组件默认拥有子块中的代码块，不给它们运行控件与录制输出；只组织内容的容器写 `ownsCode: false`。媒体组件离开活动范围时暂停。

### 5.10 设计系统

令牌（`packages/design/src/tokens.css`，颜色名在 `tokens.ts` 的 `COLORS`）是视觉的唯一来源；`pm-ui-*` 类与组件在 `design`、`host`，工作台的 React 版在 `workbench/src/components.tsx`。通用交互用 Radix，图标用 Lucide，字体随包发布。业务 CSS 只管布局。细节见 `design-system.md`；`scripts/check-tokens.mjs` 检查受管样式。

## 6. 示例文稿约定

- 公开示例工作区 `examples/animations/`：两讲完整课程与九份功能导览，索引在 `FEATURES.md`。
- `pnpm studio` 首次复制到 `.presmium/example-workspace`（独立 git 仓库），之后复用。
- `demo:check`、`demo:ir` 只处理两讲；`demo:build` 构建工作区网页，再为两讲补充幻灯片、notebook 与讲授。
- 功能回归用 `e2e/fixtures/<组>/`；旧 BPE 文稿只在 `e2e/fixtures/regression/`。
- 讲解语音来自随讲义提交的合成缓存。

## 7. 测试策略

- 不写新测试，日常不运行套件；改动弄坏的已有测试直接删除。
- 验证靠真实运行（构建、启动服务、浏览器打开）与性能测量，另加结构检查。报告实际运行与未运行的范围。
- 已有测试只在用户要求时运行，默认单个 worker，只构建需要的文稿。

| 层级 | 内容 | 命令 |
|---|---|---|
| 结构检查 | `check-layering`、`check-skills`、`check-plugins`、`check-packages`、`check-tokens`、`check-i18n --strict`、`check-types` | `node scripts/check-*.mjs` |
| 集成 | Vitest，`packages/<包>/test/`；`export` 项目最后运行 | `pnpm test` |
| 消费者安装 | 打包后在单仓之外安装 `presmium` | `pnpm consumer` |
| 端到端 | Playwright，`e2e/`；性能用例最后运行 | `pnpm e2e` |
| 升级闸门 | dsh 相关用例（`@gate`），升级 dsh 时运行 | 同上 |

外部边界用说同一协议的真实实现：真实服务与 HTTP、`templates/env/compose/` 的 `jupyter_server`、MCP SDK 客户端、临时 git 仓库、假语音引擎 `presmium-speech fake`、锁定版本的 dsh 加脚本化假模型。缺 Docker、GPU 或凭据时跳过并说明。

## 8. 辅助命令

| 命令 | 包 | 作用 |
|---|---|---|
| `presmium-export` | `addon-publish` | 幻灯片导出 PDF、PNG、PowerPoint |
| `presmium-diff` | `addon-publish` | 两个提交的视觉差异 |
| `presmium-lecture export` | `addon-lecture` | 逐帧导出讲授视频 |
| `presmium-speech fake`、`clone`、`consent` | `addon-speech` | 假引擎；训练克隆音色；登记同意 |
| `presmium-classroom-server` | `classroom-server` | 课堂同步 |
| `presmium-mcp` | `mcp` | stdio MCP，`--allow operate` 才有操作类工具 |
| `presmium-language-server` | `language-server` | 语言服务 |

## 9. 已知风险

### 9.1 框架内部接口

dsh 客户端中没有文档的接口（工厂格式、ui-slots、外壳模块表、`root` 子槽位与 `ctx.layout`）只在 `@lincyaw/dsh` 的客户端部分，由升级闸门守护。

### 9.2 设计取舍

- 跨插件契约放在内核，插件之间不互相引用。
- 网页渲染端只读 `presmium.publish.offline` 一个键，不为它建扩展机制。
- `.pm-section[data-section]`、`.pm-block[data-block]`、`.pm-slide[data-section][data-slide][data-step]` 是公开标记，笔记、讲授与工作台共用。
- 不自动切换执行器。

### 9.3 残余风险

- 同一 uid 的代码（编译时执行、agent、文稿目录中的插件、devcontainer）能读用户能读的一切；只有进程沙箱能隐藏。
- agent 写进被 git 忽略的路径不出现在审阅中。
- 文稿组件与工作区同源，能以本机作者身份调用路由。
- `serve --host` 没有登录，到得了端口的设备都是本机作者；给不信任的学习者上课用学生版静态站点与单独的课堂服务。

## 10. 服务端与部署

### 10.1 进程与拓扑

| 进程 | 作用 |
|---|---|
| `presmium dev` | 一份文稿：编译、站点服务、服务端 |
| `presmium serve` | 工作区：同上加文档、历史、审阅、任务；唯一端口，默认 4310 |
| `presmium studio` | 监管 dsh 与工作区服务，只打印一个网址 |
| `presmium-classroom-server` | 静态托管文稿的课堂同步 |
| Jupyter Server | 远端执行 |

```
presmium dev:   浏览器 → 站点服务 → /__presmium/ 代理 → 服务端
presmium serve: 浏览器 → 服务端 ─┬ /__presmium/<插件 ID>/…、/__presmium/presmium.server/{hello,control}、/mcp
                                  └ 其余路径 → 同进程的工作区站点服务
```

默认只监听本机；`serve --host <地址>` 在局域网可用，启动时警告没有登录。

### 10.2 挂载

- 路由用 Fetch API，经 `@hono/node-server` 转换；流式用 SSE。
- 反向代理用 `http-proxy-3`，HTTP 与 WebSocket 都代加头，浏览器拿不到凭据。
- 启动命令给服务端 `ServerHost`（文档、编译、检查、构建、运行代码块）。
- `mcp` 声明 `McpHost`；服务端在 `ServerHost`、控制通道与 `APPROVALS` 上实现并挂在 `/mcp`，`presmium-mcp` 在编译器上实现。每个请求一个无状态 MCP 服务器。
- `dev`、`serve` 自带同协议的课堂同步。
- 写文档目录经 `DOCUMENT_FILES`，例外是课堂归档与圈画。

### 10.3 请求来源与权限

- 检查 `Host` 与 `Origin` 是本机（`--host` 时另接受监听地址与本机名字），挡住 DNS 重绑定与跨站请求（`packages/server/src/auth.ts`）。
- 唯一成员是所有者；挂载点按 `Route.role`、`ProxySpec.role` 检查。
- 服务端与 MCP 只给完整文稿；学生版由 `build --audience student` 生成。
- MCP 令牌由 `MCP_ENDPOINT.issue` 签发，绑定成员、模式与文档。

### 10.4 控制通道与确认

页面连接 `/__presmium/presmium.server/control`（SSE 加 POST），报告位置、视图角色与 `STATUS`；MCP 经它读位置与课堂并跳转。`APPROVALS` 按种类策略：`off` 不提供，`ask` 经控制通道请求，50 秒无回答视为拒绝（低于 dsh 的 60 秒工具超时）。确认入口在 `PmToolbar` 与工作台应用栏。

### 10.5 部署

`presmium serve [目录]`；只有 `lecture.json` 的目录作为单文档工作区。运营者目录在任何工作区之外，不被提交。远端环境模板在 `templates/env/`。静态产物发布到任意静态托管。

### 10.6 编译时执行的信任模型

编译时代码以本机用户身份全部执行，不经确认。每个 Node 端执行器只给 `RunContext.env`，有进程沙箱时经它运行。MCP 的 `build` 写在工作区之外的状态目录，`run_code` 不读写录制。agent 的 shell 按 dsh 权限与 bundle 的确认策略。

### 10.7 修改审阅

`packages/workspace/src/node/review/`：会话审阅覆盖整个工作区并持锁；git 树记录开始时与每次工具调用后的检查点，不动 `HEAD` 与真实索引；拒绝时经 `DOCUMENT_FILES` 恢复，不跟随符号链接；接受时先恢复被拒文件再经 `REVISIONS` 提交，成功后释放锁；git 关闭钩子、fsmonitor 与外部 diff；记录在 `presmium/reviews/`，重启后恢复。

## 11. 安全

| 风险 | 措施 |
|---|---|
| 其他网站或进程调用本机端点 | 只监听本机；校验 `Host`、`Origin`；`/mcp` 要令牌 |
| agent 误改或越权 | dsh 权限与确认（`studio.md`）；修改经审阅、提交、可撤销 |
| 文稿关闭安全设置 | 安全相关项是运营者 `settings`，文稿不能覆盖 |
| 编辑者或 agent 的代码 | 清理过的环境变量；可选进程沙箱 |
| 凭据被引向别处或泄露 | 文稿只写名字，凭据与地址由运营者配对，代理代加；凭据不进文稿与产物；`check` 对像凭据的字段告警 |
| 提示注入 | 学习者的问题只发给读者自己的模型服务，不到 agent |
| 数据外发 | dsh 遥测关闭（`DSH_TELEMETRY_MODE=DISABLED`）；服务提供方在界面标明；工作台遥测只在设 `PRESMIUM_TELEMETRY_URL` 时 |
| 不可信富输出 | DOMPurify |
| git 执行仓库脚本 | 关闭钩子与 fsmonitor |
| 符号链接 | 写文档目录经 `DOCUMENT_FILES`，不跟随 |
| GPU 拖垮 | 限制派发规模，超时销毁设备 |
| 音色滥用 | 克隆音色默认关闭，每个需本人同意记录 |
| 教师内容到达学习者 | 学生版构建并扫描泄漏 |
| 请求体耗尽内存 | 默认至多 1 MiB（`Route.maxBody`） |
| 改写别人的课堂条目 | 4.4 节的写入规则 |
| 读到不该读的文件 | `{code-ref}` 经编译器读取器，锚点不能指向 `.git` |

## 12. 依赖选型

只用公开接口，不 fork；版本以 `package.json` 与锁文件为准。

| 依赖 | 用途 |
|---|---|
| React、Vite、jiti | 组件与查看器；构建；CLI 加载 TS |
| `myst-transforms`、`myst-common` | 快照的引用转换 |
| `@cfworker/json-schema`、`json-schema-library`、`fast-json-patch` | 文稿校验；参数路径查询；参数草稿派生操作 |
| mdast-util-*、micromark-extension-gfm | 浏览器中的 Markdown 输出与讲稿 |
| MiniSearch | 站内搜索与 MCP `search` |
| send、sitemap、launch-editor | 静态文件；`sitemap.xml`；在编辑器打开源码 |
| CodeMirror 6 | 就地编辑代码 |
| Radix Primitives、Lucide、Fontsource | 通用交互；图标；字体 |
| DOMPurify、ansi_up、eventsource-parser | 清洗 HTML；ANSI 样式；SSE 解析 |
| BlockNote、RJSF、dnd kit、react-resizable-panels | 正文与批注编辑；参数表单；排序；分栏 |
| hono、`@hono/node-server`、http-proxy-3 | Fetch 适配；反向代理 |
| `@modelcontextprotocol/server` | MCP |
| DeepSeek Harness、esbuild | 工作台；dsh 客户端构建 |
| simple-git | 代码引用读 git |
| Pyodide、Runno、jax-js | 浏览器 Python；WASI；张量与 WebGPU |
| `@jupyterlab/services`、`@xterm/xterm`、`ws` | Jupyter 协议；终端；Node WebSocket |
| playwright-chromium、pptxgenjs | 录制 WebGPU、打印、逐帧截图；PowerPoint |
| Mediabunny、FFmpeg（作者安装） | 录音录屏与无 FFmpeg 时的合成；视频编码 |
| `@noble/hashes` | 浏览器中的 SHA-256 |
| `@volcengine/speechsaasprod*` | 火山引擎音色列表 |
| drauu | 圈画 |
| GSAP、Anime.js、Motion、Three.js、Remotion、D3 | 动画场景 |
| Yjs、y-websocket | 课堂同步 |
| docker-stacks、`jupyter_server`、gVisor（可选） | 远端环境模板 |

`pnpm-workspace.yaml` 固定 ProseMirror View 的版本，让 BlockNote 与 Tiptap 共用一份实例。

## 13. 工作台与 dsh

设计、预览协议、bundle、确认、UI/UX 与升级闸门见 `studio.md`。

### 13.1 三层

| 层 | 包 | 版本 |
|---|---|---|
| 核心 | `kernel`、`compiler`、`cli`、`presmium`、`server`、`mcp`、`language-server`、`workspace`、`classroom-server`、`create-presmium` | 1.x |
| 产物 | `web`、`viewer`、`render-*`、`host`、插件 | 1.x |
| 工作台 | `design`（与产物共用，1.x）、`workbench`、`dsh`、`studio` | 0.x |

只有 `dsh`、`studio` 依赖 dsh。

### 13.2 进程与契约

- 启动器监管 dsh 与工作区服务（各自进程组与看门狗）；bundle 的宿主部分在 `packages/dsh/src/node/`，客户端适配在 `src/client/`；`DSH_HOME` 在 `$XDG_STATE_HOME/presmium/studio`。
- 工作区服务以 `serve --preview-origin` 在回环上运行，经 `PRESMIUM_SERVICE_TOKEN` 认证；预览页 `frame-ancestors` 只允许该源。
- 预览协议 `kernel/src/contracts/preview.ts`：`postMessage` 驱动 iframe，修订号是 IR 的哈希，步号带 `trail`。
- 模型来自 `PRESMIUM_MODEL_URL`、`_KEY`、`_PROVIDER`。

### 13.3 编译任务

重输出是工作区任务（`packages/workspace/src/node/jobs.ts`）：排队，一次一个，有状态、进度与日志；产物在 `outputs/<任务>/`，每种输出保留最近 3 个。路由 `jobs`、`jobs/cancel`、`jobs/events`；MCP 的 `build`、`get_builds` 用同一套任务。
