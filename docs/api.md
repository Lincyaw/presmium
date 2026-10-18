# 公开接口与版本规则

本文列出 Presmium 1.x 按语义化版本承诺稳定的接口（公开接口，第 2 节）、不在承诺之内的接口（实验性接口与内部接口，第 3、4 节），以及包、IR 与插件契约各自的版本规则。接口的签名以源码为准（`packages/kernel/src/contracts.ts`、`packages/kernel/src/ir.ts`、`packages/host/src/types.ts` 等），接口参考由 TypeDoc 从源码生成（根目录的 `typedoc.json`，文档站的 `/api/`）。本文与源码不一致时以源码为准，并把不一致当作缺陷报告。

Presmium 的稳定产品是核心（MyST 语法与 IR、编译器、渲染端、CLI）与它的产物（网页、幻灯片、notebook、讲授），它们不依赖任何模型服务。工作台（`presmium studio`，`docs/design-dsh.md`）与产物分离，它的接口是实验性的（第 3 节）；命令 `presmium serve`、工作区配置文件与 Node 端的服务照常是公开接口。

## 1. 版本规则

Presmium 有三个版本号，各管一件事：

| 版本 | 现在 | 管什么 | 在哪里 |
|---|---|---|---|
| 包的版本 | `1.0.0-rc.0`（预发布） | 全部公开的 npm 包，一起发布、版本相同 | 各包 `package.json`，由 changesets 的固定组管理（`.changeset/README.md`） |
| `IR_VERSION` | `1` | IR 的 JSON 格式（`presmium ir` 的输出、构建产物中的 `ir.json`） | `packages/kernel/src/ir.ts`，IR 的 `ir` 字段 |
| `KERNEL_VERSION` | `1.0.0` | 插件契约：插件声明的 `kernel` 范围与它比较 | `packages/kernel/src/contracts.ts` |

### 1.1 包的版本

公开的包遵循语义化版本，承诺的范围是第 2 节列出的公开接口：

- **主版本**（2.0.0）：公开接口有不兼容的改动，包括删除或改名、改变签名或类型、改变已有行为使合法的文稿得到不同的产物、`IR_VERSION` 或 `KERNEL_VERSION` 升主版本。
- **次版本**（1.1.0）：兼容的新功能，例如新的指令、选项、渲染端、服务令牌，契约中新的可选字段，新的诊断。
- **修订版本**（1.0.1）：缺陷修复与文档；修复可以让过去被错误接受的输入得到诊断。

公开接口要删除时先标为 `@deprecated` 并在变更记录中说明，至少保留到下一个主版本。实验性接口与内部接口可以在任何版本中改变，变更记录照常写明。全部公开的包使用同一个版本：一个包的主版本升级时其他包随之升级，所以“Presmium 1.x”就是任一公开包的 1.x。

### 1.2 `IR_VERSION`

IR 是编译器与渲染端、IR 运行时、MCP 和外部工具之间的格式。在同一个 `IR_VERSION` 中只允许增加可选字段（读取 IR 的程序忽略不认识的字段；新的组件是组件节点，不认识它的渲染端显示它的 `fallback`）；其他改动（删除或改名字段、改变字段的类型或含义、改变步骤与章节 ID 的规则）都要提升 `IR_VERSION`，并且是包的主版本。读取 `ir.json` 的程序先检查 `ir` 字段。

### 1.3 `KERNEL_VERSION` 与插件的 `kernel`

`KERNEL_VERSION` 是插件契约的版本，与包的版本分开：契约包括 `@presmium/kernel` 的插件接口（`PluginDefinition`、`PluginManifest`、`PresmiumNodePlugin`、`DirectiveSpec`、`IRPass`、`Renderer`、`RenderContext`、`Check`、服务令牌与它们的接口）和 `@presmium/host` 给组件的接口（第 2.4 节）。

- 插件在 Node 端入口（`PresmiumNodePlugin.kernel`）与浏览器端插件清单（`PluginManifest.kernel`）中声明兼容的范围，1.x 的插件写 `kernel: '^1.0.0'`；`version` 写自己 `package.json` 的版本。
- 范围不包含 `KERNEL_VERSION` 的插件不被加载：编译器报告 `presmium.plugins` 的诊断（`presmium check` 与构建都不崩溃），幻灯片不把它作为 Slidev 插件，浏览器中的内核不启动它并在启动报告中写明原因。
- 契约有兼容的增加时升次版本（1.1.0），有不兼容的改动时升主版本（2.0.0），同时是包的主版本。只改文档或修复实现时不变。

### 1.4 插件的 `peerDependencies`

插件与应用共用一份 Presmium：插件对 `@presmium/kernel`、`@presmium/host`、`@presmium/viewer`、`@presmium/compiler` 中用到的包写成对等依赖，范围写它支持的 Presmium 版本（在单仓中写 `workspace:^`，发布时成为 `^<版本>`，例如 `^1.0.0`），同名的开发依赖用于插件自己的测试。

- 加载器在插件的对等依赖不被已安装的 Presmium 满足时给出诊断（`presmium.plugins`，错误级：`plugin "…" is not loaded: it needs @presmium/kernel ^2.0.0 (peerDependencies), and 1.0.0 is installed`），不加载这个插件，构建继续；没有安装的可选对等依赖不算不满足。
- 只声明 `kernel: '^1.0.0'` 与对等依赖 `^1.0.0` 的插件可以用于任何 Presmium 1.x。
- 官方插件由 `scripts/check-plugins.mjs`（`version` 与 `package.json` 一致、`kernel` 被当前内核满足）与 `scripts/check-packages.mjs`（对等依赖）检查，都在 `pnpm test` 中。

## 2. 公开接口

以下接口在 1.x 中按第 1.1 节的规则保持兼容。公开接口的签名中出现的类型（参数、返回值与字段的类型，例如 `SourcePos`、`MdastNode`、`ServiceToken`、`Severity`、`AgentEvent`）随它一起公开。

一个包导出的名字，本节没有列出、也不是公开接口签名中的类型，就是内部接口（第 4 节），即使接口参考中有它：接口参考列出各入口的全部导出，哪些公开以本文为准。

### 2.1 文稿与 IR

- MyST 源语法（`docs/ir.md` 第 2 节）：文稿头部的键（`title`、`lang`、`plugins`、`presmium`、`renderers`、`execute`、`sectionDepth`、`translations`、`translationOf`、`checks`、`description`、`tags`），章节与标签、讲解与上屏内容、步骤（`:reveal:`、`span` 与讲解的绑定）、内置指令（`{slide}`、`{only}`、`{hints}`、`{config}`、`{component}`、`{include}`、`{audience}`）与 `:audience:`，以及官方插件的指令与行内角色（`.agents/skills/presmium-author/references/directives.md` 列出全部）。
- IR（`packages/kernel/src/ir.ts`）：`IRDocument`、`IRSection`、`IRBlock`、节点（`markdown`、`code`、`component`）与其中的字段，`IR_VERSION`。
- 产物的布局与地址：`presmium build` 的 `<out>/ir.json` 与 `<out>/<渲染端>/`，工作区站点的 `<out>/web/` 与 `/<文档目录>/`、译本的 `/<语言>/`；网页的页面文件名与章节锚点（来自标签，`docs/ir.md` 6.1 节），地址参数 `?clicks=`、`?view=`。
- 工作区配置文件 `presmium.workspace.yaml`：`title`、`documents`、`site`（`home`、`nav`、`footer`、`head`、`sitemap`、`lang`、`locales`）、`settings`（运营者设置，如 `presmium.workspace.plugins`、`presmium.exec.passEnv`、`presmium.assistant` 的 `review` 与 `reviewTimeoutMs`）。
- 运营者的环境变量：执行环境的 `PRESMIUM_ENV_<名>_URL`、`_TOKEN`，语音引擎的 `PRESMIUM_SPEECH_<ID>_*`，`presmium studio` 的模型服务 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER`、`DEEPSEEK_API_KEY`。

### 2.2 命令

- `presmium build | dev | ir | check | serve` 与 `presmium --help` 列出的选项；退出码（0 没有错误，1 有错误级诊断，2 用法或内部错误）；诊断的格式（`<文件>:<行>  <级别>  <消息>  (<检查 ID>)`）、检查 ID 与 `presmium check --json` 的结构（`findings` 的 `checkId`、`severity`、`message`、`source`）。诊断的消息文字可以改进，检查 ID 不变。
- 其他包带的命令：`presmium-mcp`（`@presmium/mcp`，stdio 的 MCP 服务）、`presmium-export` 与 `presmium-diff`（`@presmium/slidev-addon-publish`）、`presmium-lecture export`（`@presmium/slidev-addon-lecture`）、`presmium-speech`（`@presmium/slidev-addon-speech`）、`presmium-language-server`（`@presmium/language-server`）、`presmium-classroom-server`（`@presmium/classroom-server`，课堂同步服务，选项 `--port`、`--host`、`--deck`）。
- MCP 环境：`/mcp` 与 `presmium-mcp` 的工具名与输入（`list_documents`、`deck_info`、`list_sections`、`get_section`、`get_step`、`search`、`get_code_ref`、`get_outputs`、`get_diagnostics`、`locate_source`、`get_position`、`get_classroom`、`get_focus`、`navigate`、`run_code`、`build`、`classroom_start`、`classroom_end`，以及插件的工具）与资源 `presmium://…`。
- `@presmium/cli/testing`：`presmium(cwd, args, env?)`、`run`、`PRESMIUM_BIN`，插件的集成测试用它们运行真正的 CLI。

### 2.3 内核契约（`@presmium/kernel`）

- 插件：`PluginDefinition`、`PluginManifest`、`PluginContext`、`StartReport`；Node 端的 `PresmiumNodePlugin` 与它的字段（`directives`、`roles`、`passes`、`executors`、`resolvers`、`checks`、`anchors`、`renderer`、`rendererExtensions`、`vitePlugins`、`services`、`environments`、`server`、`tools`、`operator`、`version`、`kernel`）。
- 编译：`DirectiveSpec` 与 `DirectiveContext`、`RoleSpec`、`IRPass` 与它的上下文、`Check`、`CheckContext`、`Finding`，锚点（`AnchorString`、`parseAnchor` 与 `ParsedAnchor`、`AnchorResolver`、`Resolution`、`isRenderable`，锚点的指纹 `fingerprint` 与 `normalizeWhitespace`，锚点锁文件 `AnchorLockFile` 与它的位置 `ANCHOR_LOCK_PATH`）。
- 渲染：`Renderer`、`RenderContext`、`RendererContribution`、`SiteSpec`、`SiteDocument`。
- 服务令牌与接口：`defineService`、`EXECUTOR`、`SESSION`、`CLASSROOM_STORE`、`PRESENTER_PANELS`、`SPEECH`、`ASK`、`APPROVALS`、`PROCESS_SANDBOX`、`MCP_ENDPOINT`，Node 端的 `CHANGE_REVIEW`、`REVISIONS`、`DOCUMENT_FILES`、`DOCUMENT_LOCKS`；执行（`Executor`、`RunRequest`、`RunResult`、`RunContext`、`EnvironmentProvider`、`environmentExecutor`）。
- 服务端贡献：`Route`、`ServerContext`、`NodeServiceContext`、`Member`、`json`、`problem`、`eventStream`、`MAX_BODY`；agent 工具 `AgentTool`、`AgentToolContext`。
- 共用的纯函数：`docBlocks`、`irBlocks`、`nodeMdast`、`withProp`、`errorMessage`、`isRecord`、`languageId`、`failedRun`、`deckLocale`、`localeOf`、`DEFAULT_LANG`、`publishedUrl`、`mapHtmlUrls`、`URL_ATTRIBUTES`、`htmlAttributes`、`escapeHtml`、`lowerMyst`、`roleMark`、`splitWords`、`remapWords`、`stepStateAt`，读取 IR 的 `@presmium/kernel/reading`（`chapters`、`isChapterTitle`、`blockText`、`mdastText`、`blockState`、`blockVisible`、`narrationAt`、`sectionNarration`、`tokenize`，也从 `@presmium/kernel` 导出），`@presmium/kernel/node` 的 `copyPublished`；`KERNEL_VERSION`、`IR_VERSION`。

### 2.4 宿主接口（`@presmium/host`）与 IR 运行时（`@presmium/viewer`）

- 组件与浏览器端插件用的组合式函数与函数：`useStepState`、`useStepScope`、`provideStepScope`、`useCursor`、`useViewRole`、`usePresentationMode`、`usePrefersReducedMotion`、`useStaticRender`、`useSectionConfig`、`useService`、`useSharedState`、`useServer`、`useMessages`、`useLocale`、`currentLocale`、`useTheme`、`useSessionSnapshot`、`claimFirst`、`useStartReport`、`registerPresmiumPlugin`、`presmiumService`、`PmBoundary`、`PmStepScope`（以组件标签给出内容的步骤作用域，供写组件标签的渲染端）。
- 宿主的服务：`TOOLBAR`（槽位 `tools` 与 `settings`；其他槽位见第 3 节）、`NAVIGATION`、`OPERATIONS`、`STATUS`、`SYNC_TRANSPORTS` 与它们的接口，`ServerClient`；实现宿主用的 `HostAdapter`。
- 设计系统：令牌、类、字体与图标在 `@presmium/design`（`design.css` 与 `tokens.css`、`components.css`、`fonts.css`，`ICONS`、`iconMarkup`、颜色令牌的名字 `COLORS`、`color`、`colorToken`，`ColorName`、`IconName`、`Shape`；没有框架，与 `@presmium/host` 同版本），`@presmium/host` 再导出图标并提供 Vue 组件：CSS 令牌 `--pm-*`、组件 `PmIcon`（`ICONS` 的名字；`iconMarkup` 给出同一图标的 SVG 文本）、`PmButton`、`PmIconButton`、`PmField`、`PmBadge`、`PmCard`、`PmSegmented`、`PmTabs`、`PmPopover`、`PmDrawer`、`PmDialog`、`PmMenu`、`PmEmpty`、`PmNotice`、`PmToolbar`、`PmToolbarEntry`（它在活动栏中的形态见第 3 节），类名 `pm-ui-*`；在页面上找块的 `blockKey`、`splitBlockKey`、`blockElement`、`blockAt`、`codeLines`、`lineNumbers`、`linesText`、`positionSlide`。
- IR 运行时的视图插件：`ViewerPlugin` 与 `ViewerPluginContext`（`registerView`、`registerNodeRenderer`、`registerComponent`、`registerAction`、`registerLayer`、`useViewer`、`SectionView`、`BlockView`）与它们的类型（`ViewDefinition`、`NodeRenderer`、`ViewerAction`、`ViewerLayer`、`Viewer`、`SectionLayout`），以及页面标记 `.pm-section[data-section]`、`.pm-block[data-block]`。视图插件从这个上下文得到它需要的一切，从 `@presmium/viewer` 只导入这些类型；这个包的其他导出是内部接口（第 4 节）。

### 2.5 编译器的编程接口（`@presmium/compiler`）

`Compiler`、`Compilation`（`doc`、`check`、`publishChecks`、`forAudience` 等字段）、`CompilerOptions`、`resolveEntry`、`build` 与 `BuildOptions`、`BuildReport`、`dev`、`viewFor`、`readFrontmatter`、`DECK_ENTRY`。供宿主与工具在 Node 中编译、检查与构建文稿；其余导出见第 4 节。

### 2.6 插件包的约定

第三方插件依靠以下约定被发现与加载，它们与内核契约一样受版本规则约束（`docs/architecture.md` 第 4、5 节，`.agents/skills/presmium-develop/references/plugin.md`）：

- `package.json` 的 `exports['./presmium']`：Node 端插件（`PresmiumNodePlugin`）；`peerDependencies` 声明支持的 Presmium 版本（1.4 节）；
- 包目录中的 `components/`（两种形态共用的 Vue 组件，按标签名注册）、`setup/`（幻灯片形态的 Slidev 设置）、`src/client/plugin.ts`（浏览器端插件 `PluginDefinition`）、`src/client/viewer.ts`（IR 运行时的视图插件）、`vite.config.ts`（加入两种形态开发服务器的 Vite 配置）；
- `package.json` 的 `slidev` 字段（作为 Slidev 插件时的声明）。

第 4 节中“插件包的 `./presmium`、`./client` 等入口”指的是这些入口中约定之外的导出，约定本身是公开的。

## 3. 实验性接口

以下接口标为实验性，不在 1.x 的语义化版本承诺之内。它们可以在次版本中改变或删除，变更记录写明；插件不要依赖它们，依赖时在自己的 `peerDependencies` 中写确切的版本。

- 工作台（`docs/design-dsh.md`）：`@presmium/workbench`（工作台的 React 面板、状态与工作区服务的客户端，0.x）的全部导出；`@presmium/dsh`（DeepSeek Harness 的 bundle，0.x，有自己的版本号）的行、补丁、`./launch`，`@presmium/studio`（0.x：`presmium studio` 与 `presmium-studio` 命令，以及 `main`、`startStudio` 等导出）与预编译的客户端部分 `./client`（以及它的路由 `/api/presmium/workbench`），服务端为它提供的路由 `presmium.server/tokens`（会话令牌）与 `presmium.server/focus`，工作区服务的路由（`/__presmium/presmium.workspace/` 下的 `documents`、`files`、`source`、`changes`、`revisions`、`review` 等）；契约 `Focus`、`FocusReport`、`McpIssueOptions` 与 `@presmium/host` 的 `useToolbarPlace`、`provideToolbarPlace` 随工作台定型，在 1.0 中同样是实验性的。

本节的 TypeScript 声明在源码中带 TSDoc 标签 `@experimental`，接口参考（`/api/`）中显示为 Experimental；界面与路由没有声明可以标注，以本节的列表为准；标注与本节不一致时同样以本节为准。

## 4. 内部接口

为 Presmium 自己的包之间共用而导出、不在承诺之内的接口，可以在任何版本中改变。下面列出常见的几类；第 2、3 节没有列出、也不是公开接口签名中的类型的导出，同样是内部接口。

- `@presmium/server`、`@presmium/workspace` 的 Node 端编程接口（`buildWorkspace`、`serveWorkspace` 等；命令与配置文件是公开的）、`@presmium/mcp` 的编程接口（工具与命令是公开的）、`@presmium/language-server` 的 `./domain` 与 `./protocol`、`@presmium/classroom-server` 的编程接口。
- 渲染端包（`@presmium/web`、`@presmium/render-slides`、`@presmium/render-notebook`）与插件包的 `./domain`、`./client`、`./presmium` 等入口：它们经插件契约被加载，入口中的其他导出不是接口。
- `@presmium/kernel` 中为宿主与服务端实现而导出的部分：`Kernel` 与 `KernelOptions`、`StartPlan`、`ServiceRegistry`、`CheckRegistry`、`createEventBus`、`createAnchorResolverRegistry`、`AnchorLock`、`HOST_OWNER`、`kernelIncompatibility`、`localRequestRefusal`、`hostName`、`GIT_SAFE_CONFIG`、`gitConfigArgs`、`gitEnvironment`、`CREDENTIAL_VARIABLE`、`prefixed`、`fnv1a64`，在不同的步骤编号之间对应步骤的 `stepKeys`、`stepTrail`、`trailStep`（形态之间的跟随与 MCP 的 `get_position` 用它们），以及 `@presmium/kernel/node` 中 `copyPublished` 以外的导出（如 `preBundle`、`fontLicense`、`FONT_LICENSE`）。
- `@presmium/compiler` 第 2.5 节之外的导出（如 `loadPlugins`、`workspacePlugins`、`runBlock`、`buildView`、`checkContext`、`audienceView`、`compileTranslations`、`directoryAsset`、`serveDirectory`、`playwrightChromium`、`pluginLogger`）。
- `@presmium/host` 中实现宿主用的 `installHost`、`useHost`、`startHost`、`startPresmium`、`stopPresmium`、`stopPresmiumOnPageHide`、`pluginsOf`、`presmiumReport`、`reportPluginFailure`、`componentErrors`、`createToolbar`、`createOperations`、`createStatusRegistry`、`createPresenterPanels`、`createServerClient`、`provideServer`、`createSharedStates`、`deckChannel`、`joinWindows`，宿主自己显示的 `PmApprovals`（运营者的确认）与 `PmPresenterPanels`（演示者视图的面板）。
- `@presmium/viewer` 中第 2.4 节之外的导出，供网页渲染端实现 IR 运行时：`createViewer`、`installViewer`、`installViewerPlugin`、`VIEWER`，内置视图 `DocumentView`、`ScrollyView`、`PresentView`、`PresenterView` 与 `OverlayHost`、`ViewHost`，`BUILTIN_ACTIONS`、`followOperations`、`useSectionContext` 与 `SECTION_CONTEXT`，节点的渲染 `MarkdownView`、`CodeView`、`PmMath`、`PmMermaid`、`PmRoleMark`、`PmComponentFallback`，注册表的读取（`getView`、`listViews`、`getNodeRenderer`、`getComponent`、`listActions`、`listLayers`），`messages`，以及 `@presmium/viewer/domain` 的纯函数（也从包的根入口导出）。
- `@presmium/cli` 的根入口（`runCheck`、`CheckOptions`、`CheckResult`、`LockUpdate`）：用命令与 `presmium check --json`，插件的测试用 `@presmium/cli/testing`。

## 5. 检查与维护

- 公开的包、对等依赖与版本由 `scripts/check-packages.mjs` 检查，官方插件的 `version` 与 `kernel` 由 `scripts/check-plugins.mjs` 检查，消费者安装测试（`packages/cli/test/consumer.test.ts`、`e2e/consumer.spec.ts`）从压缩包安装并加载一个第三方插件，不兼容插件的诊断有自己的用例。
- 改动第 2 节的接口时：兼容的增加写变更记录（`pnpm changeset`，次版本）；不兼容的改动只在主版本中进行，同时按第 1.2、1.3 节决定是否提升 `IR_VERSION`、`KERNEL_VERSION`。改动第 3 节的接口时在变更记录中写明。
- 接口参考由 TypeDoc 生成（`typedoc.json`：`@presmium/kernel`（含 `@presmium/kernel/node`）、`host`、`viewer`、`compiler`、`cli` 与 `cli/testing` 的入口），随文档站构建（`pnpm --filter presmium-docs build`，在 `/api/` 下）。它列出入口的全部导出，公开与否以本文为准。
