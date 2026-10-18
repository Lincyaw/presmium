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
| 内核 | `kernel` → `@presmium/kernel` | 纯 TS：插件清单、服务注册、锚点、检查、步骤、IR 契约，及插件共用的服务契约（`EXECUTOR`、`SESSION`、`CLASSROOM_STORE`、`PRESENTER_PANELS`）；读取编译结果的纯函数（`src/reading.ts`，导出 `./reading`：`chapters`、`blockText`、`blockState`、`blockVisible`、`narrationAt`、`sectionNarration`、`tokenize` 等），IR 运行时、网页渲染端与 MCP 共用 |
| 编译 | `compiler`、`cli` → `@presmium/compiler`、`@presmium/cli` | MyST 解析、编译步骤、编译时执行与缓存、IR、检查、受众筛选与发布检查（`compiler/src/audience.ts`、`links.ts`、`forbid.ts`，`Compilation.forAudience`、`publishChecks`；`build(compilation, { audience, quote })` 构建受众视图并扫描，译本按同一受众编译）、发布的本地文件（`compiler/src/published.ts`：`fileHash`、`publishesDirectory`、`directoryAsset`，工作区站点也用；文档的源码不发布，`RenderContext.documentLink`）、译本（`translations.ts`，以 `CompilerOptions.headmatter`、`deckDir` 从译本自己的入口编译）、Node 端服务注册表、行内角色、运营者插件与插件的来源（`workspacePlugins` 加载不属于任何文档的运营者插件，如 `presmium serve` 的首页）；命令 `presmium build | dev | ir | check | serve` |
| 服务端 | `server` → `@presmium/server` | `presmium dev` 的服务端与工作区服务所用的 `serve` 模式（`dev` 只监听本机；`serve` 默认只监听本机，`--host` 时也在局域网上：`Host` 与 `Origin` 另接受监听的地址与本机的名字，见 `src/auth.ts` 的 `machineHosts`，转发到工作区站点时换成站点的本机名字；本机用户就是 `LOCAL_AUTHOR`（所有者）；插件的路由与代理、确认、控制通道、`/mcp` 的挂载；两种模式都生成每个进程的 MCP 令牌，写进 `stateFile`（0600）：`dev` 在 `.presmium/server.json`，`serve` 在工作区之外的状态目录）；`ServerHost` 只给出完整的文稿（没有学生视图）；只由 `cli` 与 `workspace` 引用 |
| 智能体 | `mcp` → `@presmium/mcp` | agent 环境：文稿的 MCP 工具（读取类与需要确认的操作类、插件的 `tools`）、只读资源（`presmium://position` 可订阅）与服务说明，基于 MCP SDK v2；每个令牌都读完整的文稿（没有 `McpView` 与学生视图），工具的范围只看成员的角色；它自己声明宿主接口 `McpHost`，服务端在 `ServerHost`、控制通道与 `APPROVALS` 之上实现并挂在 `/mcp`；`presmium-mcp`（stdio）在编译器上实现，与 CLI 一样从 CLI 的包目录加载随 CLI 安装的包。只由 `server` 引用，只依赖内核、编译器与 Node 库（不依赖 IR 运行时） |
| 工作区 | `workspace` → `@presmium/workspace` | `presmium serve`（只供运行它的那个用户使用，`--host` 时也在局域网中；撤销一次撤销的修改在 `GET revisions` 中标为 `redo`；按需编译、`REVISIONS`、文档操作与修改历史的路由、本进程的工作区站点；文档加载文稿列出的插件，与 `presmium dev` 相同）、工作区的构建；`DOCUMENT_FILES`（`src/node/files.ts`：写文档目录的唯一方式，链接被替换而不被跟随）；浏览器插件（`src/client/plugin.ts`：`EDIT_MODE`、工具栏的编辑、文档管理与修改历史，未提交的修改在历史顶部；浏览器中的源码编辑：CodeMirror 6 的编辑器 `src/client/editor.ts` 随源码面板加载，`src/client/editing.ts` 是源码面板、文件标签、文件树与提交，`src/client/viewer.ts` 让编辑器取得 IR 运行时以双向定位，路由 `files`、`source`、`changes`、`changes/commit`、`changes/discard` 在 `src/node/source.ts` 与 `routes.ts`，保存经 `DOCUMENT_FILES`、按版本检查冲突并持有文档的锁，合并在 `src/domain/merge.ts`；编辑器的依赖由包的 `vite.config.ts` 排除在 Vite 的优化之外）是工作区站点自己的插件；首页另加载运营者插件的浏览器部分（站点上下文的 `config.homePlugins`），首页（文档 `''`）的服务端带上它们的路由与 Node 服务；`ServerHost` 只给出与构建完整的文稿（学生版由 `presmium build --audience student` 构建）；单份文稿的仓库在启动时就编译它的文档（插件的启动日志随之打印）；`presmium serve` 打印 MCP 的地址与令牌所在的状态文件；`presmium dev` 的编辑模式也是它（`src/node/dev.ts` 的 `deckEditing`：只有这一份文稿的工作区，根目录是编译器的工作区根目录即 git 的顶层，路由固定为文稿的目录，没有文档操作；CLI 把它的 `DOCUMENT_FILES`、`DOCUMENT_LOCKS`、`REVISIONS` 交给编译器，`dev(compiler, { sitePlugins })` 让网页开发服务器加载工作区的浏览器插件；不在 git 仓库或被 git 忽略时没有 `REVISIONS`，只能保存）；`.presmium/` 中生成的文件（`src/node/files.ts` 的 `generatedPath`，如 dev 的令牌 `server.json`）不论 `.gitignore`，都不在未提交的修改与计数中、不被编辑器提交 |
| 渲染 | `viewer`、`web`、`render-slides`、`render-notebook` | IR 运行时与运行时视图；网页（VitePress 外壳）、幻灯片（生成 Slidev 文稿；默认主题“书卷”在 `render-slides/theme/`，是只用 Slidev 公开接口的本地主题：`layouts/`、`styles/`、`setup/shiki.ts`、`setup/mermaid.ts`（Mermaid 连线标签取令牌）、`setup/vite-plugins.ts`（各根目录在页面中运行的 setup、组件与版式作为 Vite 的入口，服务器启动时就找到插件依赖的包，文稿的第一次导出不再中途重新打包、重新载入），文稿的 `renderers.slides.theme` 不写时用它；生成的文稿自己的样式在 `src/deck/style.css`）、notebook 渲染端 |
| 宿主适配 | `host`、`addon-core`、`web` | 形态无关的宿主接口（`@presmium/host`）及 Slidev（`@presmium/slidev-addon-core`）、VitePress（`@presmium/web`）两个实现 |
| 讲台 | `addon-stage` | 黑屏、冻结、圈画、脚注就近 |
| 代码引用 | `addon-code` | `{code-ref}`、锚点解析、锁定、漂移、永久链接 |
| 修改审阅与进程沙箱 | `addon-deltabox` | 运营者插件（只有 Node 端，随 CLI 安装，不必列出）：主机满足条件（Linux、glibc 2.39、FUSE 与 Landlock）时以 deltabox-lite 登记 `PROCESS_SANDBOX`（编译时的 Python 与 JavaScript 默认在其中运行）与 `CHANGE_REVIEW`（含 `restoreTo`；会话出错时从审阅自己的快照恢复并释放目录）；Node 绑定只在辅助进程 `src/node/helper.ts` 中加载；运营者设置 `settings.presmium.deltabox`（`sandbox`、`review`、`read`、`stateDir`） |
| 代码执行 | `addon-exec`、`addon-exec-local`、`addon-exec-wasi`、`addon-exec-webgpu`、`addon-exec-jupyter` | 执行服务（Pyodide、脚本 Worker、本机进程、容器、WebAssembly 中的 C/C++/Ruby/SQL）、执行面板、分步执行、环境复刻；浏览器 GPU 后端（WGSL 计算着色器、Python 桥 `presmium_gpu`、jax-js，构建时在 Playwright 的 Chromium 中录制）；远端环境（`kind: jupyter`：Jupyter 内核、服务端代理、`{terminal}`，`src/jupyter/` 是 Node 与浏览器共用的 `@jupyterlab/services` 客户端） |
| 引导 | `addon-guide` | 模拟光标、聚光、交互提示 |
| 富内容 | `addon-content` | 思维导图、媒体、PlantUML |
| 发布 | `addon-publish` | 离线、高对比度、`presmium-export`、`presmium-diff` |
| 助手 | `addon-assistant` | 运营者插件：`AGENT_RUNTIME`（ACP 客户端，`@agentclientprotocol/sdk` 只在 `src/node/`；默认以子进程启动随包精确固定的 DeepSeek Harness，模板在 `dsh/`），运行时的选择每次读取（环境、工作区配置的替换运行时、页面保存的模型设置 `src/node/model-settings.ts`，在用户配置目录，0600），服务端路由 `info`、`settings`（所有者：模型设置，不回显密钥）、`tasks`（`GET`：文档进行中的修改任务）、`tasks/<id>/events`、`tasks/<id>/cancel`、`tasks/<id>/review`、`tasks/<id>/restore`、`revert`、`excerpt`；修改任务（`annotations`、`chat`、`transcript`，`src/node/changes.ts`）一文档一个，先开审阅（`CHANGE_REVIEW`，没有时用内置的 git 审阅 `src/node/git-review.ts`：它的 git 命令在自己的临时 git 目录中运行，只用仓库的对象库与工作树，从不读仓库的配置，所以 agent 写进 `.git/config` 的过滤驱动不会被它执行；记录在 `src/node/review-record.ts`，git 目录的看守在 `src/node/git-guard.ts`，为作者与工作区之后的 git 恢复 git 目录），结束后按 `settings.presmium.assistant.review` 等发起人的决定（可先 `restoreTo` 回到某一步之前；无人跟随时 `reviewTimeoutMs` 后回滚）或直接接受，经 `REVISIONS` 提交；浏览器端的 `AGENT`（上下文写明文档时发往那份文档的路由）、`ASK`（读者自己的 OpenAI 兼容模型服务，浏览器直接请求，`src/client/ask.ts`，静态产物也有）、工具栏与演讲者面板中的提问面板（引用经视图插件跳转）、工具栏的“AI 修改”（`EditPanel.vue`；编辑模式中是停靠面板 `EditDock.vue` 的开关，面板经工具栏的 `dock` 槽位在显示时注册（`dock.ts`），有批注、对话与修改任务（`ChangeTask.vue`、`edit.ts`），页面加载时接上进行中的修改任务；别处是写明缺少什么的弹层：服务端的 `missing` 是代码与参数（`MissingItem`：`model` 及缺少的 `variables`、`provider`、`harness`，`src/domain/config.ts`），`src/client/messages.ts` 的 `missingText` 按代码给出页面语言的说明，日志的英文由 `missingSentence` 给出；新增一种缺少的情形时加一个代码，不让页面去匹配英文句子）、状态栏中的模型与来源（`ModelStatus.vue`，`status` 槽位）与模型设置（`ModelSettings.vue`，`PmDialog`；换了服务、服务提供方或地址时要求重新填写密钥）；工作区首页（文档 `''`，插件由 `ServerContext.home` 认出，不按目录猜）只应答 `info` 与 `settings` |
| 课堂 | `addon-session`、`addon-classroom`、`classroom-server` | 会话与同步（会话插件的服务端贡献在 `presmium dev`、`serve` 自己的端口上启动课堂服务，挂在 `/__presmium/presmium.session/sync`，文稿没有写 `presmium.session.server` 时页面连到这里）、测验、练习、提问（主讲确认后发给课堂的 AI 回答，经 `ASK`：主讲自己的模型服务）、理解度、先预测再揭示、笔记；y-websocket 课堂服务 |
| 讲授 | `addon-lecture` | 讲授轨（`lectures/<id>/track.json`）、放映视图中的录制（Mediabunny 录 Ogg/Opus，只在 `src/client/media.ts`）、视图 `lecture` 的回放（`OPERATIONS` 折叠出 `state(t)`；`MediaClock`、合成讲授的 `ClipClock`）、检查项 `presmium.lecture`、站点渲染端 `lecture` 与 VTT 导出；行内角色 `{cue}`、`{say}`，讲授计划（`src/domain/plan.ts`）经 `SPEECH` 合成为讲授 `script`，录制讲授的转写、改句与换音色（`src/domain/editing.ts`，路由 `editing/*`），agent 工具 `lecture_preview`、`lecture_synthesize`、`track_transcribe`，转写回写（`src/domain/writeback.ts`：逐字稿拼成的讲解草稿与其中的 `{cue}`、讲解在源码中的位置；agent 工具 `track_narration`、`track_translations`；编辑模式中的“讲授回写”面板 `src/client/WritebackPanel.vue` 只构造助手的 `transcript` 与 `chat` 任务，执行、审阅、提交与撤销都由助手完成），`presmium-lecture export`（Playwright 逐帧截图，编码页面中 Mediabunny 合成 WebM）。服务端路由与工具从编译步骤 `presmium.lecture.keep` 记下的最近一次 IR 得到讲义（完整的文稿）；片段（`tracks/<id>/clips/<键>`，构建时复制的录制讲授的片段）按键经 `SPEECH.cached` 给出，语音服务检查克隆音色的同意，从不为此合成（`src/node/lecture.ts` 的 `cachedClip`） |
| 语音 | `addon-speech` | 运营者插件：`SPEECH` 的 Node 端（直接调用本进程环境中定义的引擎）与浏览器端（经 `useServer()` 的 `v1/` 路由，它与 Node 端一样经文稿的合成缓存）；语音协议（`v1/*`，OpenAI 音频接口形态，`src/node/routes.ts`）挂在服务端中；引擎由运营者的环境变量定义（`src/domain/engines.ts`），服务提供方的接口只在 `src/node/engines/`；合成缓存 `.presmium/speech/` 与 AI 生成的标识（WAV 的 `LIST`/`INFO`、Ogg 的 Opus 注释头），Node 端的 `cached(key)` 按键取缓存中的片段并像命中一样检查音色；克隆音色的同意记录在运营者目录中；`presmium-speech fake`、`consent` |
| 编辑 | `language-server`、`vscode` | 语言服务；VS Code 扩展（唯一预打包的包） |
| 起步工具 | `create-presmium`（唯一不在 `@presmium` 作用域中的公开包：`npm create presmium` 运行的就是它） | `npm create presmium@latest` 交互地或以参数（`--type` 为 `lecture`、`workspace` 或 `plugin`，`--title`、`--name`、`--no-git`）新建讲义、工作区或插件项目，并 `git init`；新项目的 `package.json` 以 create-presmium 自己的版本列出 CLI、三个渲染端与用到的官方插件（同 `scripts/consumer.ts` 的 `ESSENTIALS`，工作区另有助手），带 `AGENTS.md` 与技能副本。模板各只有一个源（`src/templates.ts`）：文档模板 `packages/workspace/templates/document/`、`templates/workspace/`、插件模板 `templates/plugin/`、`.agents/skills` 中的技能；包的压缩包只能带自己目录中的文件，所以打包时 `prepack`（`scripts/templates.ts`）把它们复制进包的 `templates/`（git 不保存，`.gitignore` 存为 `gitignore`），用例检查压缩包与源逐个文件相同。改模板就改源 |

插件包名为 `@presmium/slidev-addon-<上下文>`，每个插件包本身就是一个 Slidev 插件。`examples/demo` 是示例讲义（BPE 分词），`examples/sample-repo` 是它引用的代码。

## 2. 分层

规则见 `docs/architecture.md` 第 3 节，表格版见 `references/plugin.md` 第 2 节。要点：`src/domain` 为纯 TS（不引用 vue 与 `@vue/*`）；组件与 `src/client` 只经 `@presmium/host` 取得步骤状态与服务，不用 `@slidev/*`（只有 `addon-core` 可用 `@slidev/client`，`web` 也不行）；只在幻灯片形态加载的 `setup/` 与全局图层只能用 Slidev 的 `@slidev/client` 公开导出与 `@slidev/types`；只有 `web` 用 vitepress；任何包（测试除外）都不引用插件包 `@presmium/slidev-addon-*`；不引用框架内部路径。

`scripts/check-layering.mjs` 扫描 `packages/*` 中所有 `.ts`、`.tsx`、`.vue`、`.js`、`.jsx`、`.mjs` 等文件的静态 `import`、`export … from`、动态 `import()` 与 `require()`（注释里的也算）。通过时打印 `layering ok`；失败时逐行打印 `<文件>: <被引用的模块>  (<规则名>)` 并以 1 退出。

## 3. 契约

唯一来源是源码；改签名先改 `docs/architecture.md`（`contracts.ts` 文件头的规定）。

- `packages/kernel/src/contracts.ts`：`defineService`、`PluginDefinition`（`manifest`、`setup(ctx)`、`dispose`）、`PluginContext`（含 `environments`）、`StartReport`、锚点（`AnchorString`、`AnchorResolver`、`Resolution`、锁定文件 `AnchorLockFile`）、检查（`Check`、`Finding`、`CheckContext`，含 `service`）、`PresmiumNodePlugin`（含 `version`、`kernel`、`vitePlugins`，v0.8 的 `services`、`environments`、`server`、`roles`、`tools`、`operator`）、`SessionService`、`ClassroomStore`（JSDoc 写明课堂的写入规则）、`PresenterPanels`、`localeOf`、`deckLocale`。v0.8 的业务契约按领域分在 `packages/kernel/src/contracts/`（`execution.ts`：`Executor`、`RunRequest`、`RunContext`、`PROCESS_SANDBOX`、具名环境；`server.ts`：`Member`、`Route`、`ServerContext`、`NodeServiceContext`、`APPROVALS`、`eventStream`、`MCP_ENDPOINT`；`speech.ts`；`agent.ts`：智能体、修改审阅、`REVISIONS`、`DOCUMENT_FILES`（WP-91）；`operations.ts`），都由 `contracts.ts` 再导出，入口不变。契约的删减由验收者决定；1.0 之后按语义化版本（P-143）。
- `packages/kernel/src/ir.ts`：`IRDocument`、`IRSection`、`IRBlock`、节点（`markdown`、`code`、`component`）、`DirectiveSpec`、`IRPass`（`after: 'execute'`）、`Renderer`（`site`、`prepare`）、`RenderContext`（`lang`、`pluginDirs`、`extensionFor`、`portable`、`localAsset`、`base`、`vitePlugins` 等）、`RendererExtension`。只允许加可选字段；其他改动要提升 `IR_VERSION`。
- `@presmium/kernel` 的共用纯函数：`irBlocks`、`docBlocks`（遍历块，含组件的子块）、`nodeMdast`、`withProp`（按属性路径设置组件属性，`assets` 的 `captions.en` 这类键）、`errorMessage`、`isRecord`、`failedRun`、`languageId`、`lowerMyst`（`roles: 'marks'` 写出没有子内容的角色的标记；`cards: 'element'` 把卡片、栅格写成带 `pm-grid`、`pm-card` 类的 `<div>`，`headings` 写成小标题加段落并列为降级，不写时随 `iframes`；`htmlUrls: true` 时 `urls` 也改写原始 HTML 的地址）、`roleMark`、`deckLocale`、`environmentExecutor`、`eventStream`；K2 波次另有：原始 HTML 的 `mapHtmlUrls`、`htmlAttributes` 与 `escapeHtml`（parse5），发布文件的 `publishedUrl` 与 `@presmium/kernel/node` 的 `copyPublished`，服务端回答的 `json`、`problem`，分词的 `splitWords`、`remapWords`，git 的安全配置（`GIT_SAFE_CONFIG`、`gitConfigArgs`、`gitEnvironment`），`CREDENTIAL_VARIABLE` 与日志的 `prefixed`。`@presmium/host` 另有页面上找块的 `blockKey`、`splitBlockKey`、`blockElement`、`blockAt`、`codeLines`、`lineNumbers`、`linesText`（同一可见性规则：跳过 `[inert]` 与 `.pm-hidden`）、按章节 ID 定位的 `positionSlide` 与跟随修改任务的 `trackAgentTask`；`@presmium/compiler` 另有 `Compilation.check`、`runBlock`、`buildView`、`audienceView`、`serveDirectory`、`playwrightChromium`、`findPackageDir`。用它们，不要在包里另写副本。
- `packages/host/src/types.ts`：`HostAdapter`（含 `useDarkMode`）、`SharedStateScope`、`SyncTransport`、`Navigation`、`Toolbar`（`ToolbarItem` 的 `slot` 与 `icon`，`ToolbarSlot`：`tools`、`settings`、`status`、`home`、`create`、`files`、`tabs`、`source`、`dock`，各在外壳的哪里见 `docs/architecture.md` 5.10；`ToolbarPlace`）、`ServerClient`、`Operations`、`StatusRegistry`、`EditMode` 与令牌 `SYNC_TRANSPORTS`、`NAVIGATION`、`TOOLBAR`、`OPERATIONS`、`STATUS`、`EDIT_MODE`。组合式函数从 `@presmium/host` 导出（`useStepState`、`useStepScope`、`PmBoundary`、`useMessages`、`currentLocale`、`useSectionConfig`、`useSharedState`、`useService`、`useServer`、`useSessionSnapshot`、`claimFirst`、`startHost`、`useTheme`、`useToolbarPlace` 等）。组件经 `useServer()` 调用插件的服务端路由，`available` 为 false（静态产物）时降级。
- 设计系统（N-10，`docs/architecture.md` 5.10 节，`packages/host/src/design/`）：令牌是 CSS 自定义属性 `--pm-*`（颜色、字体、字号、间距、圆角、阴影、动效，亮暗两套随 `<html>` 的 `dark` 类切换），通用组件是 `PmIcon`、`PmButton`、`PmIconButton`、`PmField`、`PmBadge`、`PmCard`、`PmSegmented`、`PmTabs`、`PmPopover`、`PmDrawer`、`PmDialog`、`PmMenu`、`PmEmpty`、`PmNotice`、`PmToolbarEntry`，类名以 `pm-ui-` 开头。网页的外壳与插件界面都用它们，不另定颜色与控件。图标只用宿主的线性图标（`PmIcon`、`ICONS`；需要 HTML 字符串时用 `iconMarkup`，如幻灯片代码运行器的提示），不用 ◀ ▶ ✓ 这类字形与 emoji。网页外壳（工作台、编辑模式的顶栏、启动台）的文字都在 `packages/web/src/domain/messages.ts` 的 `WEB_MESSAGES`。端到端用例的对比度检查只有一份：`e2e/fixtures/contrast.ts` 的 `lowContrast`（也看开放的 shadow root）。

## 4. 新增插件

单仓之外的第三方插件从插件模板起步：`npm create presmium@latest my-plugin -- --type plugin`（源在 `templates/plugin/`）给出一个指令 `{greeting}`、网页与幻灯片共用的组件 `components/GreetingCard.vue`（只经 `@presmium/host`，界面文本有中英文）、服务端路由 `waves`、示例文稿 `example/lecture.md` 与运行真实 CLI 的集成测试（Vitest），`kernel: '^1.0.0'`，对 `@presmium/kernel`、`host`、`viewer`、`compiler` 是对等依赖 `^<版本>`；它的 `AGENTS.md` 写明分层与测试约定，并带本技能与 presmium-author 的副本。改了插件约定时同步改模板。

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
- 发布插件配置时用 `ctx.portable` 把位于 `workspaceRoot` 内的绝对路径改为相对路径，产物不随检出位置变化（`docs/architecture.md` 4.2 节）；块中引用的本地文件用 `ctx.localAsset` 找到并随产物发布：它给出 `{ file, name, directory }`，`file` 也可以是目录（文稿中链接的子目录，已准备好文件与清单页 `index.html`）；用 `copyPublished(found, dir)` 复制、`publishedUrl(found, url, { prefix })` 写地址（指向目录的地址写到其中的 `index.html`，保留查询与片段）；原始 HTML 的 `src`、`poster`、`href` 也要经它改写，用 kernel 的 `mapHtmlUrls`（或 `lowerMyst` 的 `htmlUrls: true`），它按 HTML 解析找出属性，像属性的文字不是属性；指向另一份文档的入口文件的链接 `localAsset` 不给出（`ctx.documentLink` 给出 `{ dir, fragment }`，工作区站点链接它的页面）；不能发布的引用由 `localAsset` 自己报告 `presmium.links`，渲染端不必再报（`docs/ir.md` 6.2 节）。网页渲染端另从 `ctx.translations` 得到译本。编译时写进产物的文本按 `deckLocale(ctx.lang)`。
- 插件组件外面包 `PmBoundary`（错误隔离是渲染端的事，`docs/architecture.md` 5.4 节）；可以只生成工作目录时提供 `prepare(doc, ctx)`。
- 范例：`packages/render-notebook`（只有 `build`）、`packages/cli/test/fixtures/addons/render/presmium.ts`（最小的 `build` 与 `dev`）。

## 6. 测试

只写集成测试：真实运行 CLI、构建产物、服务与浏览器，不写单元测试，不 mock 宿主框架；每条验收标准一到两个用例。需要专用文稿的端到端用例把文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中构建（`useFixture`）。写法、辅助函数、端口与浏览器项目见 `references/testing.md`。

## 7. 命令

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装依赖；加包、改依赖或合并后锁文件冲突时运行 |
| `pnpm test` | 分层检查、技能检查（`scripts/check-skills.mjs`）、插件声明检查（`scripts/check-plugins.mjs`）、包的发布检查（`scripts/check-packages.mjs`）与 Vitest 集成测试（`packages/<pkg>/test/`，其中有消费者安装测试 `packages/cli/test/consumer.test.ts`） |
| `pnpm demo:check`、`pnpm demo:build`、`pnpm demo:ir` | 示例文稿的 `presmium check`、`presmium build`（产物在 `examples/demo/dist/<渲染端>/`）、`presmium ir` |
| `pnpm e2e` | Playwright 端到端测试（先 `pnpm demo:build`）；`PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT` 指定端口，`PRESMIUM_E2E_BROWSERS` 指定冒烟用例的其他浏览器（默认 `firefox,webkit`，未安装或无法启动的跳过并提示） |
| `pnpm exec playwright test e2e/perf.spec.ts --no-deps` | 单独运行性能用例 |
| `pnpm verify` | 以上全部 |
| `pnpm docs:fetch` | 拉取框架文档到 `vendor/docs/slidev`、`vendor/docs/vitepress`（`vendor/` 不入库） |
| `pnpm changeset` | 为改动了公开包的提交写变更记录（`.changeset/`；发布流程见 `.changeset/README.md`） |
| `pnpm release:check` | `pnpm -r publish --dry-run --no-git-checks`：按发布的样子打包每个公开的包，不上传 |
| `pnpm consumer [<目录>]` | 在单仓之外做一个消费者项目：打包全部公开的包，用 npm 从压缩包安装，带上 `e2e/fixtures/consumer` 的文稿与第三方插件（`scripts/consumer.ts`） |
| `pnpm --filter create-presmium templates` | 不打包，把模板从各自的源复制进 `packages/create-presmium/templates/`（之后可以在仓库中运行 `node packages/create-presmium/bin/create-presmium.mjs <目录> --type <种类>`；生成的项目要从压缩包安装 Presmium，见 `packages/create-presmium/test/create.test.ts`） |

`pnpm test` 中的 `scripts/check-skills.mjs` 检查：`.claude/skills` 是指向 `../.agents/skills` 的软链接、`AGENTS.md` 是指向 `CLAUDE.md` 的软链接；每个技能的 frontmatter（`name` 与目录同名、`description` 非空）；编译器内置指令与各包 `./presmium` 入口声明的指令在 `presmium-author/references/directives.md` 中各有一个参考小节标题（`` ### `{名字}` ``，只在示例中出现不算）；技能中出现的 `presmium <命令>` 及其选项是 CLI 真有的。改了指令或 CLI 后同步更新技能。`scripts/check-plugins.mjs` 检查每个导出 `./presmium` 的包都声明了 `version`（与 `package.json` 一致）和当前内核满足的 `kernel` 范围。`scripts/check-packages.mjs` 检查每个工作区包都在 `.changeset/README.md` 的表中（公开或私有）；公开的包有 Apache-2.0 的 `license` 与包内 `LICENSE`（根目录的副本）、同一个版本（changesets 的固定组）、根目录的 `engines.node`、完整的元数据与 `publishConfig.access: public`，`files` 存在并包含 `exports`、`bin` 指向的文件；插件对 `@presmium/kernel`、`host`、`viewer`、`compiler` 的依赖是对等依赖 `workspace:^`（另在 `devDependencies` 写 `workspace:*`）。

## 8. 依赖与源码

- 依赖优先：能用现成组件就用，通过公开接口定制；不 fork、不打补丁、不引用 Slidev 或 VitePress 的内部路径。查框架接口先读 `vendor/docs/slidev`、`vendor/docs/vitepress`（缺失时 `pnpm docs:fetch`），不读框架的编译产物。仍在使用的未文档化接口及守护它们的用例列在 `docs/architecture.md` 9.1 节，升级框架前先跑这些用例。
- 版本固定：Slidev 53.0.0、VitePress 1.6.4，由 `pnpm-lock.yaml` 锁定。不引入 AGPL 依赖；跨设备功能只用课堂的同步通道。
- 源码以 `.ts`、`.vue` 直接发布，不预编译（CLI 通过 jiti 加载）；相对导入写 `.ts` 扩展名，只用可擦除的语法（`erasableSyntaxOnly`）。只有 `vscode` 预打包。从 npm 安装时包在 `node_modules` 中：Node 不去掉那里的类型标注，渲染端以 `@presmium/kernel/node` 的 `TYPESCRIPT_IMPORT` 启动 VitePress 与 Slidev（它们加载配置时导入插件的 TypeScript）；Vite 不预构建 `node_modules` 中的包自己的依赖，两种形态（工作区站点的首页也是）的配置由 `preBundle` 列出这些包的浏览器代码导入的依赖（`optimizeDeps.include`，从网页与幻灯片的渲染端和插件的包目录出发，跟随其中导入的 Presmium 包），并把这些包链接进 Vite 项目的 `node_modules`：`presmium serve` 的站点在它的状态目录中、`presmium dev --out` 可以在任何地方，Vite 从项目的根目录找这些包。消费者安装测试（`packages/cli/test/consumer.test.ts`、`e2e/consumer.spec.ts`，含 `serve` 与输出在项目之外的 `dev`）守护这两点。
- 发布（P-140、P-141）：公开的包以 Apache-2.0 发布到 npm 的 `@presmium`，版本由 changesets 管理（固定组，1.0 的预发布标签 `rc`）；哪些包公开、哪些私有、发布步骤见 `.changeset/README.md`。新增的包加进那张表，带上根目录 `LICENSE` 的副本与 `files`（公开的包名以 `@presmium/` 开头，只有 `create-presmium` 例外，它也在固定版本组中）；插件对 Presmium 的依赖写成对等依赖（加载器在对等依赖不满足时报告并不加载插件，`presmium.plugins`）。改动了公开包时运行 `pnpm changeset`。
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
