# 工作台与 DeepSeek Harness 的设计

本文是 Presmium 工作台的设计。工作台建在 DeepSeek Harness（dsh）之上；核心与产物不依赖 dsh，也不依赖模型。契约以源码为准：预览协议在 `packages/kernel/src/contracts/preview.ts`，`Focus` 与批注在 `packages/kernel/src/contracts/agent.ts`，会话令牌在 `packages/kernel/src/contracts/server.ts`。实现的细节见 `architecture.md` 第 13 节，与 dsh 的概念对照见 `domain-model.md` 第 16 节。

## 术语

本文与相关文档只用下面这些名字。

| 术语 | 含义 |
|---|---|
| dsh | DeepSeek Harness（MIT）：agent 循环、工具、沙箱、确认、会话、模型适配，以及一个用 React 写的网页客户端运行时。Presmium 只经它的插件、配置补丁与客户端插件机制使用它 |
| 产物 | 渲染端从 IR 生成、能单独部署的东西：网页、幻灯片、notebook、讲授。静态构建的结果与开发服务器实时提供的页面都算。产物用 Vue（VitePress、Slidev） |
| 工作台 | 作者编写文稿用的界面：外壳、首页、文件树、源码编辑器、问题、预览、对话与批注、审阅与修改历史、讲授的面板。它是 `presmium studio` 的页面 |
| 工作区服务 | `presmium serve` 中不含界面的部分：编译会话、产物的开发服务器、文档与源码的路由、修改历史与审阅、MCP |
| bundle | dsh 的扩展包，由 dsh 的插件与配置补丁组成。Presmium 的 bundle 是 `@presmium/dsh`。它不是 Presmium 自己的插件包（`@presmium/slidev-addon-*`） |
| 行 | dsh 配置树中的一项：一个插件、它的配置与是否启用，以 ID 标识（如 `ui-layout`） |
| 载体 | dsh 的运行形态：`web`（网页客户端）、`headless`（命令行）、`acp`（经 ACP 被别的程序驱动） |
| profile | dsh 的一套安装与配置（`$DSH_HOME/profiles/<名>/`）：列出的 bundle、它们的补丁与用户在界面中的改动 |
| 根布局插件 | 占据 dsh 客户端 `root` 槽位、决定整页布局的客户端插件。dsh 自带的是 `dsh-client-ui-layout`（行 `ui-layout`），它排出的布局叫“dsh 自带布局” |
| 预览协议 | 工作台与嵌在它里面的产物页面之间的消息约定（第 4 节） |
| 预览代理 | 产物页面中实现预览协议的一小段脚本，只出现在工作区服务启动的开发服务器提供的页面中；`presmium dev` 与静态构建不带它（4.2 节） |
| 升级闸门 | 每次升级 dsh 之前必须通过的五组集成用例（第 12 节） |
| 服务令牌 | studio 的启动器（或自己启动服务的 bundle）为一次启动生成的随机值，bundle 用它访问工作区服务的路由（5.3 节） |
| 会话令牌 | 为一个 dsh 会话签发的 MCP 令牌，模式为“主机已确认”：经它调用的操作类工具不再向页面窗口请求确认，因为 dsh 已按 Presmium 的策略决定过（5.3 节） |
| Host API | dsh 宿主经 HTTP 给页面的接口：`/connect` 或浏览器 cookie，`POST /api/<端点>`（带 JSON Schema 的描述符），`/api/remote.mux` 事件流；工作台自己发起会话与提示时用它（2.4 节的 S3） |
| 焦点 | 用户指向的一处（`Focus`）：落到源码的一段，带上它在文稿中的位置（文档、节、块、步骤）。焦点加一句要求与处理状态是一条批注 |

## 1. 目标与原则

### 1.1 目标

1. 不配模型、也不装 dsh 时，核心照常可用：编译、IR、渲染端、CLI、静态产物，以及 `presmium dev` 的实时预览。
2. 产物可以单独部署与使用，不带工作台的代码。工作台换框架或换实现时，产物不改。
3. 工作台是 dsh 的一个定制发行版：Presmium 的能力以 bundle 装进 Presmium 自己的 profile。对话、确认、修改卡片、会话、模型设置、终端与 jobs 用 dsh 的插件，其余由 Presmium 的 React 面板补齐。
4. 网页优先：`presmium studio` 一条命令启动，用户只拿到一个网址。桌面客户端只保留可能（11.6 节）。

### 1.2 原则

1. **核心与产物离开模型也能工作。** 核心（编译器、IR、渲染端、IR 运行时、CLI、静态产物）不引用 `@deepseek-ai/*`。
2. **产物与工作台分离。** 改动源码的归工作台；不改动源码的（放映、演讲者视图、课堂、运行代码、读者用自己的模型问答、放映中的讲授录制）归产物。产物保持 Vue，只向工作台暴露锚点（`data-section`、`data-block`、`data-step`），经预览协议嵌入工作台（第 4 节）。
3. **工作台是 dsh 的客户端插件。** 工作台用 React 写成 dsh 的客户端插件；Presmium 的根布局插件替换 dsh 自带布局，按 `docs/design` 的工作台排布，dsh 的对话、确认卡片与修改卡片停靠在右侧（第 7 节）。dsh 的界面组件不能单个嵌入别的页面（第 16 节），所以工作台在 dsh 的客户端运行时之中，不另写一个调用 Host API 的界面。
4. **dsh 只经一个包接触。** 只有 `@presmium/dsh` 引用 dsh 的宿主接口与客户端接口；`@presmium/studio` 只负责安装与启动 dsh；分层检查保证这一点（3.2 节）。工作台的面板不引用 dsh，核心与产物不知道 dsh 存在。dsh 的接口变了，只改这一个包。dsh 精确锁定一个版本，升级先过升级闸门（第 12 节）。
5. **不改 dsh。** 不 fork，不打补丁，只用它的插件、配置补丁与客户端插件机制（仓库的“依赖优先”）；它的限制在 Presmium 一侧绕开（第 16 节）。
6. **工作台中的 agent 只用 dsh，外部 agent 经 MCP 接入。** 模型在 dsh 的模型设置中选。外部 agent（Claude Code、Codex 等）是一等入口。一张工具表，两个适配器（MCP 与 dsh 工具）：工具只在工作区服务中执行，新工具两边都有，两边的清单由一致性用例保证相同（第 9 节）。
7. **浏览器中的源码编辑只在工作台中。** `presmium studio` 可以不配模型；`presmium dev` 是实时预览加“在编辑器中打开”，`presmium serve` 只有文档列表与产物（第 13 节）。没有不依赖 dsh 的浏览器编辑页。
8. **文稿的代码不进 dsh 宿主。** 编译、编译时执行与构建都在工作区服务的进程中；持有模型凭据与确认通道的 dsh 宿主不运行文稿的代码。
9. **修改落在源码上，并成为提交。** dsh 的修改卡片只是视图；审阅、提交与撤销由 Presmium 负责（6.5 节）。
10. **隐私默认关闭，每次启动重新声明。** 不上传会话日志、插件清单与遥测，不读用户目录中的技能，第一次使用时不在用户的文档目录中建目录（6.6 节）。
11. **焦点只有一种。** 源码编辑器中的选中、网页预览与幻灯片预览中的点选统一为一种 `Focus`、一种交互、一种发送方式；MCP 另有 `presmium://focus` 与 `get_focus`（第 8 节）。
12. **有退路。** 根布局插件失效时，同一批面板挂在 dsh 自带布局中仍可用（7.2 节）。

## 2. 三层与进程

### 2.1 层与包

| 层 | 包 | 框架 | 依赖 dsh | 没有模型时 | 版本 |
|---|---|---|---|---|---|
| 核心 | `kernel`、`compiler`、`cli`、`server`、`mcp`、`language-server`、`workspace`（Node 部分，即工作区服务）、`classroom-server`、`create-presmium`、`presmium-vscode` | TS、Node | 否 | 全部可用 | 1.x |
| 产物 | `web`（VitePress 加 `viewer`）、`render-slides` 加 `slidev-addon-core`、`render-notebook`、讲授插件的渲染端、各插件的组件，宿主接口 `host` | Vue | 否 | 全部可用；读者问答用读者自己的模型服务 | 1.x |
| 工作台 | `design`（与产物共用）、`workbench`、`dsh`、`studio` | React 18（由 dsh 的外壳提供） | 只有 `dsh` 与 `studio` | 除对话外都可用 | 0.x，实验性（`design` 随 `host` 为 1.x） |

### 2.2 进程与端口

| 进程 | 作用 | 监听 |
|---|---|---|
| studio 启动器 | 组装 profile，启动并监管下面两个进程，打印一个网址 | 无 |
| dsh 宿主 | agent、会话、确认、Host API、工作台网页、bundle 的宿主部分 | 用户访问的那一个端口：默认只在本机（`127.0.0.1`），`--host` 时只在给出的地址上 |
| 工作区服务 | `presmium serve`：编译会话、产物的开发服务器、文档与源码、审阅与修改历史、焦点、MCP | 空闲端口，与 dsh 宿主在同一地址上（默认回环），因为预览 iframe 由浏览器直接访问它 |
| 产物的开发服务器 | VitePress 与 Slidev 的子进程 | 回环，经工作区服务转发 |

“一个网址”指用户只需打开 dsh 宿主的地址；预览 iframe 指向工作区服务的源，由工作台自己填入。预览不由 dsh 宿主提供：dsh 的 webServer 前缀路由只在插件激活时构建一次，编辑之后不更新，侧栏的 Browser 也不显示 dsh 自己的源。

### 2.3 请求的路径

1. **工作台的数据**：浏览器 → dsh 宿主的 `/api/presmium/*`（经 dsh 的 cookie 与 `Host`、`Origin` 栅栏）→ bundle → 工作区服务（回环，带服务令牌，5.3 节）。`connection.fetch` 的精确路由可以流式回答（dsh 宿主对回答做 gzip 压缩，但不缓冲），`ir/events` 的 SSE 因此经它推送到页面。
2. **预览**：浏览器中的 iframe → 工作区服务的源：产物页面与它的 `/__presmium/` 路由。
3. **agent 的工具**：dsh 宿主 → bundle → 工作区服务的 `/mcp`（回环，每个会话一个会话令牌，5.3 节）。
4. **外部 agent**：Claude Code、Codex → `presmium-mcp`（stdio），或工作区服务的 `/mcp`（令牌在 0600 的状态文件中）。

浏览器与这些服务之间没有替浏览器持有 cookie 的代理：注入 cookie 并改写 `Origin` 的代理会拆掉 dsh 的栅栏，让外来源的页面读出会话记录。

### 2.4 接缝

| 接缝 | 两侧 | 用到的接口 | 稳定性 |
|---|---|---|---|
| S1 | bundle 与 dsh 宿主 | `ctx.tools.register`、`agent/created` 与 `agent.ctx.tools.register`、`defineTool`；`tools/pre-execute`、`tools/execute`；`ctx.tools.guard`；`approval/request`；`ctx.systemPrompt.section`、`context`、`agent/pre-step`；`ctx.skills.register` 与 skill-filesystem 的配置；`ctx.workspaceRegistry`；`ctx.connection.fetch.register`（精确路径，必须在 `/api` 下）与 `admit()`；`ctx.webServer.tapIndex`；turn 与 `workspace/changes` 事件；`Agent.inject`；bundle 的格式（`dsh.bundle`、行 ID、`!!js`） | README 有文档，alpha |
| S2 | 工作台的客户端插件与 dsh 客户端运行时 | `dsh.client` 声明与 `dsh.client.external`（有文档）；包的工厂格式 `__ModuleLoader__.load`（无文档）；外壳的模块表（React 18.3.1 等）；槽位接口；`root` 的 6 个子槽位与 `ctx.layout`（README 描述了行为）；`ctx.theme`；`ctx.locale`；`ctx.sidebarRightTabs`；品牌槽位与 `settings.onboarding` | 最不稳定；只出现在 `@presmium/dsh` 的客户端部分 |
| S3 | 工作台的面板与 dsh 的会话 | 面板自己发起的会话与提示（起草、讲授回写、批注）：Host API 的 `session/create`、`session/prompt`（schema 严格校验），或客户端运行时的会话服务 | 中 |
| S4 | bundle 与工作区服务 | Presmium 自己的回环 HTTP 接口、`/mcp`、服务令牌、进程监管 | Presmium 自有 |
| S5 | 工作台与产物 | 预览协议；IR 与诊断经工作区服务取得 | Presmium 自有 |
| S6 | 外部 agent | `presmium-mcp`（stdio）与工作区服务的 `/mcp` | 不变 |

## 3. 包与分层规则

### 3.1 新包

| 包 | 层 | 内容 | 依赖 dsh | 版本 |
|---|---|---|---|---|
| `@presmium/design` | 产物与工作台共用 | 令牌 `tokens.css`、`pm-ui-*` 的类 `components.css`、字体 `fonts.css`、图标（SVG 字符串）与令牌名；`@presmium/host` 引用它。没有框架 | 否 | 1.x，随 `host` 发版 |
| `@presmium/workbench` | 工作台 | React 面板，以及框架无关的部分：工作区服务的客户端、预览协议的工作台一侧、编辑器的状态（CodeMirror 6、三方合并）、审阅与历史的模型 | 否，不引用 `@deepseek-ai/*` | 0.x |
| `@presmium/dsh` | 工作台（bundle） | 宿主部分（Node）与客户端部分（React，预编译）；唯一接触 dsh 接口的包 | 是：精确的对等依赖与 `engines.dsh` | 0.x |
| `@presmium/studio` | 工作台（启动器） | `presmium studio`：组装 profile，启动与监管 dsh 和工作区服务 | 是：精确版本的 `@deepseek-ai/dsh` | 0.x |

现有包中与工作台有关的部分：`kernel` 有预览协议的契约与 `Focus`；`mcp` 另导出工具表与客户端一侧；`server` 有会话令牌与焦点；`cli` 的 `studio` 子命令只转交给 `@presmium/studio`，没装时说明怎样安装（约 865 MB，其中 `@deepseek-ai/*` 约 566 MB，只在装 studio 时发生）。

### 3.2 分层规则

`scripts/check-layering.mjs` 检查：

- **产物不认识工作台**：产物的包（`web`、`viewer`、`render-*`、`addon-core`、各插件的 `src/client` 与 `components`）不引用 `@presmium/workbench`。
- **dsh 只在一处**：`@deepseek-ai/*` 只出现在 `packages/dsh` 与 `packages/studio`。
- **面板不认识宿主**：`@presmium/workbench` 不引用 vue、`@presmium/host` 与 `@deepseek-ai/*`。
- **mcp 的使用者**：server 与 dsh 使用 mcp；`@modelcontextprotocol/*` 只在 `mcp` 中，bundle 经 `@presmium/mcp` 导出的客户端一侧使用 MCP。
- **design 没有框架**：`@presmium/design` 不引用任何包。

### 3.3 发布

- 源码仍以 `.ts` 直接发布。例外有两个：`presmium-vscode`，以及 `@presmium/dsh` 的客户端部分（预编译，7.8 节）。dsh 的运行时没有 TS 加载器，装在 `node_modules` 中的 `.ts` 也不能由 Node 原生加载，所以 bundle 的宿主部分每一行有一个普通 ESM 的入口文件，入口用 jiti 加载本包的 `.ts` 源码，与 Presmium 的可执行文件相同；jiti 的缓存为空时冷启动约 1.1 s。
- 0.x 的三个包有自己的版本号，不随 Presmium 的统一版本；`scripts/check-packages.mjs` 为它们开例外。
- `@presmium/dsh` 的 `prepack` 与 `postpack` 改写它自己的目录（技能的副本与预编译的客户端），所以同时打包全部公开的包的 `scripts/consumer.ts` 在全仓的一个锁之下打包。
- 许可证：dsh 的 304 个包中 300 个 MIT，`libreoffice-kit` 与 `libreoffice-kit-wasm` 为 MPL-2.0，`node-addon-system` 及其平台包为 BSD-3-Clause；从 npm 仓库安装不算由 Presmium 再分发。MIT 不授予 DeepSeek 的名称与标志：发行版不用 DeepSeek 的品牌，不暗示其背书，只在“关于”与 `NOTICE` 中写明“基于 DeepSeek Harness（MIT）”。

## 4. 预览协议 v1

### 4.1 作用与边界

工作台经预览协议驱动嵌在它里面的产物页面，产物页面经它报告位置与点选。协议只传章节、块与步骤的 ID 和少量状态，不传源码位置，也不传 DOM。源码位置由工作台从 IR 的 `SourcePos` 得出（`placeAt`、`placeOf`，在 `@presmium/workbench` 中）。

v1 覆盖网页与幻灯片两种形态。notebook 是静态文件，没有实时页面；讲授播放器不在 v1 中。

### 4.2 传输与握手

- 传输是 `window.postMessage`。每条消息的信封是 `{ protocol: 'presmium-preview', version: 1, nonce, type, ...字段 }`。
- 工作台向工作区服务请求预览地址（`GET preview`，5.1 节），在地址上加查询参数 `presmium-preview=<nonce>`（每个 iframe 一个随机值），再放进 iframe。
- 预览代理只存在于工作区服务启动的开发服务器提供的页面中：工作区服务给它启动的开发服务器的 `RenderContext.preview`（可选字段：`{ origins }`，允许的父页面来源）。静态构建与 `presmium dev` 不带它。代理只在三个条件都满足时启动：地址带这个参数，`window.parent !== window`，`origins` 不为空。
- `presmium dev` 的页面由浏览器直接打开，不嵌在任何工作台中，没有对方可以通信，所以不带预览代理；点选因此只在 `presmium studio` 中可用。
- 允许的父页面来源是 `presmium serve --preview-origin <源>`（可重复）给出的；在 studio 中，启动器把 dsh 的源（`--host` 时是局域网的源）告诉服务。代理只向这些来源发消息，也只接受从它们发来、带同一个 nonce 的消息。
- 代理启动后先发 `ready`。工作台收到 `ready` 之后才发别的消息。信封的版本不同时，工作台提示“预览的版本与工作台不符，请重新启动”。
- 未知类型的消息一律忽略。消息只是数据：代理不执行收到的代码，也不打开收到的链接。

### 4.3 消息

| 方向 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 产物 → 工作台 | `ready` | `renderer`（`web` 或 `slides`）、`document`、`revision`、`capabilities` | 代理就绪。`revision` 是页面所用 IR 的修订号；`capabilities` 列出页面支持的消息类型 |
| 工作台 → 产物 | `go` | `section`、`step?`、`trail?`、`view?` | 跳到某节的某一步。`view` 是网页形态的运行时视图（`document`、`present` 等，与控制通道的位置相同）；幻灯片形态没有 |
| 工作台 → 产物 | `highlight` | `target`：`{ section, block? }` 或 `null` | 框出一块或一节；不在视野中时滚动过去；`null` 清除 |
| 工作台 → 产物 | `pick` | `on` | 点选模式。打开时点在块上报告 `picked`，不触发块自己的操作；链接、按钮与输入框照常工作（规则同 `placeOfClick`）。鼠标下的块加虚线框 |
| 工作台 → 产物 | `pins` | `targets`：`[{ id, section, block, label }]` | 在这些块旁画编号标记（`label`）；标记在页面之中，滚动、缩放与切换步骤时自然跟着块走；块不在当前页面中时不画。空数组清除 |
| 工作台 → 产物 | `marks` | `on` | 显示作者用的标记（如 `{cue}`），`PmRoleMark` 看它 |
| 工作台 → 产物 | `appearance` | `dark` | 明暗跟随工作台 |
| 产物 → 工作台 | `position` | `section`、`step`、`trail`、`view?` | 位置变化时发出，至多每 150 ms 一次 |
| 产物 → 工作台 | `picked` | `section`、`block?`、`step?`、`trail?` | 点选的结果；点在块上时带块出现的步骤（页面自己的步号）与那一步的 `trail`，同 `position` |
| 产物 → 工作台 | `selection` | `{ section, block?, text }` 或 `null` | 页面中的文字选中，供焦点带上（8.2 节的 `quote`） |
| 产物 → 工作台 | `updated` | `revision` | 页面换上了新的 IR。工作台据此重新加上高亮与焦点的标记，并判断预览是否已反映刚保存的源码 |
| 产物 → 工作台 | `report` | `level`（`error` 或 `warning`）、`plugin?`、`message` | 页面中的运行时问题（插件启动失败、组件出错），与 IR 的诊断分开：IR 的诊断由工作区服务给出 |

### 4.4 坐标与步骤

- 章节与块用 IR 的 ID。ID 在实时更新中保持不变（块被改写时可能移动，见 8.7 节）。
- 步号：`position`、`picked` 的 `step` 是页面自己的步号，都带 `trail`，工作台用内核的 `trailStep` 换算成完整文稿的步号；`go` 要按完整文稿的步号定位时带上 `trail`（由 `stepTrail` 得出），只带 `step` 时按页面的步号。幻灯片形态中只给其他渲染端的块不占步骤，两种编号因此可能不同。控制通道用的是同一种换算。
- `position` 的字段与控制通道报告的位置相同（章节、步骤、`trail`、视图），两处用同一套换算。
- 产物在 DOM 上写锚点：网页有 `data-section`、`.pm-block[data-block]`、`data-step`；幻灯片由 `render-slides` 在生成的文稿中写上同样的块级锚点，静态构建中同样存在，无害。

### 4.5 安全

- **产物页面与工作台不同源。** iframe 来自工作区服务的端口；dsh 的栅栏对外来的 `Origin` 返回 403。页面中的脚本，包括第三方插件，不能借用户的 dsh cookie 发起会话或回答确认，也读不到工作台的 DOM。
- **限制谁能嵌入预览。** 工作区服务给预览页面加 `Content-Security-Policy: frame-ancestors <允许的来源>`；没有允许的来源时是 `'none'`。只装 bundle、不经 studio 运行 dsh 时，`presmium-service` 自己启动的服务没有 `--preview-origin`，工作台的预览因此不能显示。
- **双向核对来源。** 工作台只接受 `event.origin` 是工作区服务的源、`event.source` 是那个 iframe 的窗口、并且带同一个 nonce 的消息；代理同样核对。

### 4.6 实现位置

| 部分 | 位置 |
|---|---|
| 消息类型与 `PREVIEW_PROTOCOL = 1` | `packages/kernel/src/contracts/preview.ts`；产物与工作台都只依赖这里 |
| 网页的预览代理 | `packages/web/src/client/preview.ts`：用 IR 运行时的 viewer 跳转、取位置、找章节与块的元素，实现 `marks`（`packages/viewer/src/rich.ts` 的 `PmRoleMark` 看它） |
| 幻灯片的预览代理 | `slidev-addon-core` 的客户端，用宿主的 `NAVIGATION` 与 `blockElement` |
| 工作台一侧 | `@presmium/workbench` 的预览面板 |
| 静态构建 | 不带预览代理；用例扫描构建产物 |

### 4.7 与控制通道的关系

控制通道（`/__presmium/presmium.server/control`）经过服务端，服务于 MCP 的 `navigate` 与 `get_position`、确认与课堂；预览协议只在浏览器内传递。预览页面由服务提供，它连接控制通道，所以外部 agent 照样看得到它的位置，也能让它跳转，外部 agent 发起的操作类工具的确认也出现在预览页面的工具栏中。dsh 会话的工具调用不经这里：它们的令牌是主机已确认的（5.3 节），确认由 dsh 处理（6.3 节）。

## 5. 工作区服务的接口

工作台经这些接口取得 IR、构建与开发服务。工作区服务的路由挂在 `/__presmium/presmium.workspace/` 下；服务端自己的路由在 `/__presmium/presmium.server/` 下。会话令牌与焦点的路由属于服务端（`@presmium/server`），不在工作区的路由中：`MCP_ENDPOINT` 是服务端的服务，焦点与放映位置一样由服务端保存。

### 5.1 路由

| 路由 | 作用 |
|---|---|
| `GET documents`、`POST documents` | 文档列表、编译状态与章节；新建、重命名、复制、删除 |
| `GET files`、`GET source`、`POST source` | 列出文件；带版本的读写，冲突时 409，加锁（`architecture.md` 5.11 节） |
| `GET changes`、`POST changes/commit`、`POST changes/discard` | 未提交的修改 |
| `GET revisions`、`POST revisions/revert` | 修改历史与撤销 |
| `GET ir?document=` | 文档的 IR、修订号与诊断 |
| `GET ir/events?document=` | SSE，由服务直接流出、不缓冲：连接后先发当前的修订号，之后是新的修订号、诊断数与改过的文件（相对于工作区根目录）。编辑器据此与磁盘比较 |
| `GET preview?document=` | 各形态开发服务器的地址；开发服务器按需启动，页面带预览代理 |
| `POST build`、`POST check` | 构建（写到文档目录之外，`architecture.md` 10.6 节）与检查 |
| `GET review?document=`、`POST review/open`、`POST review/step`、`POST review/accept`、`POST review/reject`、`POST review/restore` | 审阅（git 实现，6.5 节）：打开（bundle，持有者 `agent:<会话>`）、记检查点、查看、接受（可以带作者写的说明）、拒绝（给出文件时只恢复它们、审阅继续，不给时全部回滚）、回到某个检查点。`GET review` 以 `text/event-stream` 请求时是页面跟随 |
| `GET review/events` | SSE，供 bundle：审阅的变化，以及撤销一个会话的提交 |
| `presmium.server/tokens`（`POST`、`DELETE`） | 为一个 dsh 会话签发或作废会话令牌（5.3 节） |
| `presmium.server/focus`（`GET`、`POST`） | 工作台报告焦点与批注，服务把锚点换成源码范围与摘录并保存（8.6 节） |
| `/mcp` | MCP，供外部 agent 与 bundle 使用 |

### 5.2 `presmium serve` 的页面

- 页面只加载文稿列出的插件，没有编辑界面；
- 首页是文档卡片，与静态的工作区站点相同；
- 产物的开发服务器带预览代理，允许的来源来自 `--preview-origin`。

`presmium dev` 是一份文稿的实时预览，同样没有编辑界面。

### 5.3 服务令牌与会话令牌

- **服务令牌**：studio 中，启动器生成一个随机值，经环境变量 `PRESMIUM_SERVICE_TOKEN` 交给工作区服务与 dsh 宿主（不放在命令行，`ps` 看不到）。设置了它时，工作区的路由与 `tokens`、`focus` 的写入要求 `Authorization: Bearer <服务令牌>`；产物页面自己的 `/__presmium/<插件>/` 路由（讲授、课堂、远端环境的代理）只检查 `Host` 与 `Origin`。这样预览页面中的脚本不能用工作区的路由改源码。agent 与服务同一 uid，能读到这个值，所以它只是纵深防御；`architecture.md` 9.4 节的残余风险不变。
- **会话令牌**：bundle 为每个 dsh 会话向服务端取一个 MCP 令牌（`POST tokens` `{ document, session }`），令牌绑定本机作者与文档，模式为“主机已确认”：经它调用的操作类工具不再经 `APPROVALS` 向页面窗口请求确认，因为 dsh 的 `tools/pre-execute` 已经按 Presmium 的策略决定过（6.3 节）。会话令牌只签发给启动服务的主机：没有设置 `PRESMIUM_SERVICE_TOKEN` 时 `tokens` 一律 403，产物页面中的脚本因此拿不到不经确认的令牌。会话结束时 bundle 作废它；dsh 宿主退出时服务作废全部。契约：`MCP_ENDPOINT.issue` 有可选的第三个参数 `{ confirmed: true }`（`packages/kernel/src/contracts/server.ts`）。

## 6. bundle `@presmium/dsh`

### 6.1 包的形态

- `package.json`：
  - `dsh.bundle`：bundle 层 `cordis.patch.yml`，全部载体都有的行，含 `!!js` 的配置；
  - `dsh.client`：`platform: 'web'`，导出预编译的客户端部分；
  - 出口：`.` 是 `presmium-workbench` 行的宿主部分，`./client` 是预编译的客户端包，其余各行各有一个出口，`./launch` 供启动器传入补丁；
  - `engines.dsh` 与对 `@deepseek-ai/dsh-*` 的精确对等依赖。dsh 在安装与启动时都检查它们，不满足时拒绝。
- 宿主部分：每行一个普通 ESM 的入口文件，入口用 jiti 加载 `src/node/` 的 `.ts` 源码。
- 补丁：dsh 的一个包只有一个 bundle 层，只在某个载体中出现的行因此放在另外的补丁中，由启动器以 `--patch` 传入（`@presmium/dsh/launch`）：`profile.patch.yml`（全部载体：隐私、技能、第一次使用、沙箱、persona，6.6 节）与 `web.patch.yml`（web 载体：`presmium-workspaces`、`presmium-routes`、`presmium-workbench` 三行与它们的设置，以及界面上关掉的行）。headless 与 acp 载体不带 `web.patch.yml`，启动时不警告有行没有激活。
- 技能：源只有 `.agents/skills` 一份，打包时复制进包内（副本不入库）；`scripts/check-skills.mjs` 核对 bundle 登记的技能都在源中。

### 6.2 宿主部分的行

| 行 | 载体 | 作用 | dsh 接口 |
|---|---|---|---|
| `presmium-service` | 全部 | 给出工作区服务的地址与服务令牌：启动环境中带着它们时（studio）直接用，否则自己启动 `presmium serve` 并监管它。服务在自己的进程组中，父进程退出时随之结束 | `ctx.effect` |
| `presmium-workspaces` | web | 把每份文档的目录登记为 dsh 工作区，新建、改名、删除文档时同步改名或归档；工作区根不登记。`ctx.workspaceRegistry` 只在 web 的组合中有；headless 与 acp 的会话就在 dsh 启动的目录中 | `ctx.workspaceRegistry` |
| `presmium-tools` | 全部 | 第 9 节的 dsh 适配器：会话创建时把它所属文档的工具登记为 `presmium__<名字>` | `agent/created`、`agent.ctx.tools.register`、`defineTool` |
| `presmium-policy` | 全部 | 确认的映射（6.3 节） | `tools/pre-execute`、`ctx.tools.guard`、`approval/request` |
| `presmium-context` | 全部 | 指南放进 system 消息；文稿快照与焦点按会话的目录取得，每一步之前重读（6.4 节） | `ctx.systemPrompt.section`、`context`、`agent/pre-step` |
| `presmium-skills` | 全部 | 登记 `presmium-author` 等技能 | `ctx.skills.register` |
| `presmium-turns` | 全部 | 第一次写文件之前取锁并打开审阅，每个工具调用之后记检查点，接受时提交；撤销后通知会话（6.5 节） | `tools/execute`、turn 事件、`workspace/changes`、`Agent.inject` |
| `presmium-routes` | web | 把 `/api/presmium/*` 转到工作区服务与服务端（精确路径，必须在 `/api` 下），流式的回答原样返回 | `ctx.connection.fetch.register`、`admit()` |
| `presmium-workbench` | web | 客户端部分：根布局插件、面板、主题、品牌、语言；网页标题与图标；精确路由 `/api/presmium/workbench`（回答 `{ mcp }`，即工作区服务的 MCP 地址，供首页的 MCP 卡片） | `dsh.client`、`ctx.webServer.tapIndex`、`ctx.connection.fetch.register` |

客户端的行是包名本身：dsh 的模块系统只把名字是整包名（`@presmium/dsh`）的 Loader 行当作客户端的来源，`@presmium/dsh/<行>` 这样的子路径不算，一个包也只能有一个这样的行。所以 `presmium-workbench` 行的 `name` 是 `@presmium/dsh`。

每一行都按**会话的目录**解析它所属的文档，不按 `process.cwd()`：dsh 的网页宿主是多工作区的，每个会话的工作目录是它所属的工作区，按 `process.cwd()` 解析时，跑在 dsh 默认工作区里的会话会拿到描述文稿的上下文，却找不到文稿。会话的目录不是任何文档目录时，bundle 不为它提供 Presmium 的工具与上下文。

### 6.3 确认的映射

| Presmium 的设置或范围 | 在 dsh 中 |
|---|---|
| 种类的策略为 `off` | 不登记对应的工具，与 MCP 不列出它的做法一致 |
| 策略为 `allow` | `tools/pre-execute` 直接返回 allow，不经回答者：经回答者放行的调用在完全访问模式下会被 dsh 的回答者拒绝 |
| 策略为 `ask`（默认） | pre-execute 返回 ask，`displayReason` 写 Presmium 按文稿语言给出的说明（如“构建文稿（web）”）与简短的摘要（哪一节、哪一块），由 dsh 的确认卡片回答；授权只一次有效 |
| `content` 范围：文档目录中的写入 | 会话的目录就是文档目录，`workspace-write` 沙箱不询问；发送任务就是对这些写入的确认 |
| `workspace` 范围：shell、网络与文档目录之外的写入 | dsh 的沙箱与策略询问；文件工具写到会话目录之外时，bundle 也返回 ask，运营者目录除外 |
| 运营者目录 | `ctx.tools.guard` 拒绝，文件不会写出，完全访问模式（确认策略 `never`）下也成立。guard 先于 pre-execute 的监听者执行；pre-execute 对这些调用返回 ask 时，拒绝会来自回答者而不是 guard，所以 policy 把运营者目录中的路径留给 guard |
| 完全访问模式（`danger-full-access`） | 允许用户选择；界面说明 Presmium 的 `ask` 在这个模式下会被拒绝，`allow` 与 guard 照旧生效 |
| 工作区服务自己的 `APPROVALS` | 会话令牌是主机已确认的，服务不再把确认发往页面窗口 |
| 确认超时 50 秒 | 不需要：dsh 的确认一直等待，晚连上的客户端也能回答 |

策略的唯一来源是服务端（工作区配置的 `approvals`、`presmium dev --allow`）：MCP 对会话令牌列出的操作类工具在 `_meta` 中带上种类与策略（`presmium/kind`、`presmium/approval`），bundle 按它们映射，不读 `presmium.workspace.yaml`。

已知的限制：dsh 的回答者看不到工具的参数（所以 `displayReason` 带摘要，完整的参数在对话中工具调用的显示里）；确认只能在打开着的 turn 中发出；授权只一次有效。

### 6.4 文稿上下文与技能

- **指南**：一段固定的说明放进 system 消息：这是一个 Presmium 工作区，怎样用工具与技能，修改先审阅再提交。web 载体中 Presmium 的角色也由它说明（6.6 节的 persona）。
- **文稿快照**：每个会话按自己的目录找到文档。快照包含标题、语言、入口文件、章节（ID 与标题）、诊断数、当前位置与当前的焦点（8.6 节）。dsh 的提供者接口是同步的；bundle 在每一步之前（`agent/pre-step`）经 MCP 重读快照，不另维护缓存：读取类调用只要几毫秒（第 9 节），快照也就总是新的。快照以 user 角色写进会话日志，所以“模型看得到的都会记下来”不需要另做。上下文与工具一样登记在 agent 的作用域中。
- **技能**：在运行时登记（`ctx.skills.register`）。skill-filesystem 的 `agentsHome` 固定到 Presmium 状态目录中的空目录，用户的 `~/.agents/skills` 不进入技能目录；文稿项目自己的 `.agents/skills` 保留，它是作者自己的材料。项目中的同名技能会覆盖 bundle 的那份，这一点写进技能的说明。

### 6.5 turn、审阅与提交

文档目录对应 dsh 的工作区，对话对应 dsh 的会话；一次接受的审阅是一个提交，撤销用 `git revert`。

1. **开始**：会话第一次调用会写文件的工具（文件工具与 shell）时，bundle 在 `tools/execute` 中为文档打开审阅（`POST review/open`，持有者 `agent:<会话>`）。它在确认之后、工具执行之前运行，被拒绝或被策略否决的调用不打开审阅，也不持有锁。审阅从这时持有文档的锁；锁被别人持有时这次调用以原因失败，什么也没写。打开是幂等的（同一会话得到同一个审阅），所以每次写入之前都问一次服务，宿主不必记住审阅是否还开着。审阅用 git 实现，快照包含当时还没提交的修改。
2. **进行中**：编辑器保存得到 409，并提示 AI 的修改在等待审阅；后面的 turn 继续累加进同一次审阅；每个工具调用完成时记一个检查点，标签是工具与文件或命令。服务给出 turn 的范围（`turns { from, to }`）与是否有 turn 在运行。一个 turn 结束时审阅没有改动（例如 shell 只运行了 `ls`）就结束，释放锁。
3. **审阅与修改卡片**：一次审阅覆盖会话在它期间的全部 turn；dsh 的修改卡片（`workspace/changes`）是每个 turn 的视图。同一个 turn 中卡片列出的文件与审阅的改动相同（构建的产物两边都没有），多个 turn 时每张卡片是审阅的一部分。审阅是修改的唯一来源，卡片只作 turn 内的提示。
4. **审阅**：`settings.presmium.assistant.review` 为 `required`（默认）时，工作台的审阅面板列出自快照以来的全部文件，作者可以全部接受、拒绝某些文件，或回到某个检查点；为 `auto` 时每个 turn 结束就提交。`review` 与 `reviewTimeoutMs` 由工作区服务按 `settings.presmium.assistant` 执行，bundle 不读它们；超时只在没有 turn 运行、也没有页面跟随（`GET review` 的 SSE）时计时。作者在 turn 之间接受之后，下一次写入开一个新的审阅。
5. **提交**：一次接受形成一个提交，尾注是 `Presmium-Origin: agent`、`Presmium-Task`、`Presmium-Session: <会话>`、`Presmium-Turn: <起>-<止>` 与 `Co-authored-by`。提交后释放锁。
6. **撤销**：`git revert`，尾注 `Presmium-Revert`。撤销会话的提交之后，bundle 经 `Agent.inject`（`dsh-agent` 的公开接口）给会话注入一条 user 角色的通知，来源是 `{ kind: 'presmium', form: 'notice' }`，正文以 `[Presmium]` 开头。它不唤醒 agent，在会话的下一步进入模型请求，并作为 `session/projections` 的 `inbox` 中的待处理消息可见；agent 不在时等它被创建或恢复再注入。dsh 文件工具的“先读后改”规则会拦住基于旧内容的编辑。
7. **记录**：审阅记录由工作区服务保存，另记会话、turn 的范围、检查点与各步。服务关闭或崩溃时会话的审阅不回滚，下一个服务进程启动时恢复它并重新持有锁。dsh 宿主重启后修改卡片没有了，审阅仍在，可以经新宿主接受。Presmium 不依赖 dsh 只在内存中的修改摘要，它在宿主重启后返回 404。
8. **构建**：agent 经工具发起的构建由工作区服务写到文档目录之外，不进入审阅与修改卡片。

服务以 git 审阅回答 `CHANGE_REVIEW`。

### 6.6 profile 补丁与隐私默认值

启动器每次启动都以 `--patch` 传入 `packages/dsh/profile.patch.yml`，web 载体另加 `packages/dsh/web.patch.yml`（6.1 节；两者随 bundle 发布）。`--patch` 在 profile 自己的补丁与 `$DSH_HOME/cordis.patch.yml` 之后生效，用户在 dsh 界面中的改动（写进 profile 的 `cordis.patch.yml`）因此不能把隐私相关的行重新打开，启动器也不改写 profile 的补丁。

- **隐私**：关掉 `session-log-deepseek`、`session-telemetry-otel`、`plugin-package-inventory-deepseek` 三个上传行；环境变量 `DSH_TELEMETRY_MODE=DISABLED`。这些上传随每个模型请求带出（`dsh_session_log` 一次约 69 KB、`dsh_plugin_packages`），所以“没有出站连接”说明不了问题；没有模型时零请求的前提也是关掉这三行。
- **技能**：skill-filesystem 的 `agentsHome` 与环境变量 `DSH_AGENTS_HOME` 都指向 Presmium 状态目录中的空目录。
- **第一次使用**：工作区控制器的 `documentsDirectory` 指向 Presmium 的状态目录，并在启动时登记好文档的工作区。两者都做到，第一次使用就不会在 `~/Documents` 下建目录。
- **沙箱**：`workspace-write`，确认策略为 ask。
- **persona**：headless 与 acp 的 persona 是 `system-prompt` 行的 `personaPrefix`，补丁整体替换这一行的配置，换成 Presmium 的说明。web 载体的 4 个 agent 预设（`preset-standard` 等）各在自己的配置中带一个 `persona` 行，补丁只能按 ID 找到顶层与 group 中的行，所以不换：web 中 Presmium 的角色由 `presmium-context` 的指南说明，编程 agent 的 `harness-dev-context` 行关掉，预设自己的“You are a coding agent powered by …”仍在。
- **界面**（`web.patch.yml`）：关掉 `ui-layout`（由根布局插件替换；退路模式下重新打开）、`ui-brand-official`、`ui-settings-account`、`account-controller`、`deepseek-account`、`llm-deepseek-account`、`web-search-deepseek`（DeepSeek 的搜索服务）与 `ui-settings-session-log`（上传会话日志的设置）。插件页中的实验插件与插件市场没有可关的行：它们是 dsh 安装自带的可选 bundle 与按需的官方目录，由插件页的“实验插件”组列出；工作台按这个组的 DOM 属性 `data-plugin-group="extensions"` 隐藏它。确切的行 ID 以锁定的版本为准，由升级闸门第 1 组核对；这个属性由第 3 组核对。

## 7. 工作台

### 7.1 包与依赖

| 部分 | 内容 | 可以依赖 | 不得依赖 |
|---|---|---|---|
| `@presmium/design` | 令牌、`pm-ui-*` 的类、字体、图标、令牌名 | 无 | 任何框架 |
| `@presmium/workbench` | React 面板与框架无关的逻辑 | `@presmium/design`、`@presmium/kernel`（类型与纯函数）、CodeMirror 6、`node-diff3`、react 18（对等依赖） | vue、`@presmium/host`、`@deepseek-ai/*` |
| `@presmium/dsh` 的 `src/client` | 根布局插件，把面板登记进槽位，主题、品牌、语言包 | `@presmium/workbench`、dsh 外壳的模块表 | vue |
| `@presmium/dsh` 的 `src/node` | 第 6 节的各行 | `@presmium/mcp`、Node 库 | vue、`@presmium/host` |

面板以“面板描述”导出：标题、图标、组件、需要的服务。只有 `@presmium/dsh` 登记它们，所以同一批面板既能挂在根布局中，也能挂在 dsh 自带布局中。

### 7.2 根布局与退路

根布局插件声明 `root`，子槽位与 ui-layout 相同：`sidebar`、键控的 `main`（保留键 `conversation`）、`rightbar`、`shell.bottom`、`shell.overlay`、`shell.leading`。dsh 自己的插件因此不改就能挂上。只能整个替换 ui-layout：外壳只渲染 `root` 一个槽位，子槽位只能声明一次，`renderSlot` 只渲染调用者自己声明的子槽位。

根布局插件还要重新提供：

- `ctx.layout`：`panelInfo`、`selectPanel`、`beginNavigation`、`toggleSidebar`、`openRightbar`、`closeRightbar`（ui-layout 的 README 写明了它们的行为）；
- 标准钩子 `usePanelInfo`；
- 主题呈现：调色板、字号、字体列表与令牌变量；
- 展开或收起侧栏的快捷键 `Mod+Alt+B`（与 ui-layout 相同；dsh 只许网页在 macOS 与 Windows 上用 Mod+Alt 组合，Linux 的网页上没有默认的按键，侧栏用活动栏与 dsh 侧栏自己的按钮收起）、跟随会话的文档标题、拖动柄、右侧列在宽度不够时的关闭协议（`canShow`）。

桌面的窗口装饰（`shell.leading`、`--dsh-frame-*`）留到做桌面时（11.6 节）。

布局按 `docs/design/home.dc.html` 与 `edit.dc.html`：

| 区域 | 内容 |
|---|---|
| 活动栏（最左） | 标志、文档、文件、搜索、会话（dsh 的 `sidebar` 内容）、修改历史、讲授；底部是设置（dsh 的设置与模型设置）与使用说明 |
| 侧栏 | 活动栏所选的内容：文件树，或 dsh 的会话与工作区 |
| 中央 | 首页时是启动台；打开文件时左边是文件标签与源码编辑器、下方是问题面板，右边是预览，也可以只看其中一个。dsh 的全局面板（插件、自动任务）也显示在这里 |
| 右侧坞（`rightbar`） | dsh 的文件、终端、Review、浏览器等标签页，以及 Presmium 的审阅 |
| 对话（`main` 的 `conversation` 键） | 停靠在最右 |
| 状态栏 | Presmium 的状态项（git、语言、编码、光标所在行、模型）与 `shell.bottom` |
| 浮层（`shell.overlay`） | 对话框与设置 |

**退路**：根布局与退路是同一个客户端部分。dsh 的启动图中有 `ui-layout` 时（关掉 `presmium-workbench` 的根布局部分并重新打开 `ui-layout`），它不占据 `root`，得到 dsh 自带布局：对话居中，Presmium 的预览、源码与审阅作为右侧坞的标签页类型登记（`ctx.sidebarRightTabs`），首页作为 `main` 的全局面板。根布局插件出错时整个应用不挂载（ui-renderer 的 README），所以退路与启动审计都有用例。

**在插件管理中关掉 `@presmium/dsh` 时**，`ui-layout` 不回来。插件管理的开关只改 profile 的 bundle 列表：bundle 层（`cordis.patch.yml` 的 `presmium-service` 等行）不再加载，但启动器传入的 `web.patch.yml` 仍在，它关掉 `ui-layout`，插入 `presmium-workspaces`、`presmium-routes` 与 `presmium-workbench`。这三行等不到 `presmium` 服务而停在 pending（dsh 启动时警告“3 entries did not activate”），客户端部分照常载入并占据 `root`（模块系统按 Loader 的行，不看行是否已激活），`/api/presmium/*` 不在。页面因此是工作台，但读不到工作区：首页在 `documents` 得到 404 时说明“`@presmium/dsh` 在‘插件’页中被关掉了，从‘会话’打开‘插件’把它重新打开，然后重新载入页面”。切换是热加载的，不用重启；重新打开就恢复，用户的数据都在。

### 7.3 面板

| 面板 | 数据来源 |
|---|---|
| 首页：文档卡片、新建与管理、启动台搜索、MCP 卡片 | `documents`；MCP 卡片的地址来自 `/api/presmium/workbench`（6.2 节） |
| 由 AI 起草 | 先按模板新建文档（`POST documents`，一个提交），再在新文档目录的 dsh 会话中起草 |
| 文件树 | `files` |
| 源码编辑器与文件标签 | `source`（版本、409、锁）；IR 的诊断；`ir/events` 中改过的文件 |
| 问题 | IR 的诊断 |
| 预览 | `preview` 与预览协议 |
| 对话与批注 | dsh 的对话，加上 Presmium 的焦点托盘（第 8 节） |
| 审阅 | `review` |
| 修改历史与未提交的修改 | `revisions`、`changes` |
| 讲授回写 | 讲授插件的路由；回写时新建 dsh 会话 |
| 状态项 | git 状态、光标；模型来自 dsh 的设置 |

起草新文档在新文档的目录中进行：工作区根不登记为 dsh 工作区，所以每个 agent 会话的工作目录、沙箱的根与审阅的根都是同一个文档目录。

`ir/events` 在页面中以 `EventSource` 读 `/api/presmium/ir/events?document=`（同源，带 dsh 的 cookie）。保存或文件在磁盘上被改之后，事件随即到达，工作台读新的 IR（诊断），并把事件列出的、打开着的文件与磁盘比较。连接断开时 `EventSource` 自己重连，期间读一次 IR；不按秒轮询。

### 7.4 复用的 dsh 插件与关掉的行

直接复用：对话、确认卡片（在 `conversation.composer` 中）、修改卡片与 Review 标签页、会话与工作区的侧栏、设置与模型设置、终端、文件、jobs、计划、插件管理（可用范围受 6.6 节限制）。

Presmium 自己占用的槽位：品牌槽位 `sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`；`settings.onboarding` 中的 `welcome-notice`（优先级 -1，替换首次使用的提示）。

首次使用的提示：dsh 把 `settings.onboarding` 的步骤画在侧栏底部的设置区里，根布局显示文件树时侧栏收起，所以 Presmium 的提示画在页面之上（portal）。dsh 自己的 `welcome-notice` 在宿主上记“已读”，替换它的步骤只能调用 `complete()`（只在页面的内存中），所以“已读”记在浏览器的 `localStorage`。同一个槽位中 DeepSeek 的登录步骤（`deepseek-official`）以同样的方式换成立即完成的步骤。

关掉的行见 6.6 节。

### 7.5 设计系统、主题与品牌

- **共用的一层**：`@presmium/design`，产物中的 Vue 组件与工作台中的 React 组件用同一层令牌与 `pm-ui-*` 的类。
- **React 版的通用组件**在 `@presmium/workbench`：`PmButton`、`PmIconButton`、`PmIcon`、`PmField`、`PmBadge`、`PmCard`、`PmSegmented`、`PmTabs`、`PmPopover`、`PmDrawer`、`PmDialog`、`PmMenu`、`PmEmpty`、`PmNotice`。重复的只有行为（焦点、菜单与标签页的键盘操作、弹层的位置），按 `architecture.md` 5.10 节；对比度与键盘的用例对两份都运行。
- **dsh 的令牌**：`ctx.theme.overrideTokens` 把 dsh 用到的 76 个 `--dsw-*` 别名令牌（dsh 共用到 125 个变量）映射到书卷的取值，明暗两套。字体经 `--dsh-font-family-*` 设为 IBM Plex Sans 与 IBM Plex Mono，用户自己选的字体优先。dsh 写死的颜色、圆角、字号与 CSS module 的类不去覆盖：检查以 WCAG AA 与截图为准，不要求和书卷一致。
- **暗色**：工作台在 `<html>` 上设 `dark` 类，`--pm-*` 与 `--dsw-*` 一起切换，再经预览协议的 `appearance` 让产物跟随。
- **品牌**：品牌槽位、标题与图标（`tapIndex`）、首次使用提示换成 Presmium 的。对话首页的标语用公开的语言包接口替换（`ctx.locale.addLanguage` 加 `register`）：`zh-CN`、`en-US` 两个语言包出现在 dsh 设置的语言列表中，标为“简体中文（Presmium）”“English (Presmium)”，只换 `conversation` 的 `hero.headline` 与 `hero.preview`，其余回退到 dsh 的中文与英文。换不干净的：其他语言标签（如 zh-TW）仍显示 dsh 的文案；插件管理器的备用源默认是 npmmirror；用户能在插件管理中关掉 `@presmium/dsh`（7.2 节）。默认的模型路由是 DeepSeek 的官方服务，它是正当的服务提供方，不算品牌问题。

### 7.6 界面语言

- 工作台的文字按包维护中文与英文两套（仓库的约定）。界面语言跟随 dsh 当前的语言（`ctx.locale`），映射为 zh-CN 或 en；没有对应时看 `navigator.language`。
- dsh 自己的文案只在涉及品牌的地方替换（7.5 节）。
- 写进产物的文字按文稿的 `lang`，不受工作台的语言影响。

### 7.7 窄屏与可访问性

- 宽度小于 1024 px 时侧栏收起；小于 768 px 时活动栏横排在顶部，侧栏、右侧坞与对话都放进占满宽度的抽屉或视图。
- 390 px 时 dsh 的每个面板都能从活动栏到达，包括会话、设置、Review 与文件。
- 文字对比度达到 WCAG AA，控件边框达到 3:1。

### 7.8 客户端包的构建与加载

- 用 esbuild 构建。外部依赖是 dsh 外壳模块表中的键：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`。React 的版本因此由 dsh 决定，现在是 18.3.1；Presmium 不自带 React，也不用 React 19 的特性。
- 输出是工厂格式 `__ModuleLoader__.load({ id, factory })`。这个格式没有文档，由 Presmium 自己的 esbuild 插件生成；它的变化由升级闸门的启动审计发现。ui-slots、client-store、ui-primitives 没有可安装的包与类型，只为用到的部分声明最小的类型。
- CodeMirror 打进包内；几个客户端插件要共用它时，用 `dsh.client.external` 声明共享（有文档）。
- 客户端包不能带静态文件：dsh 的模块系统只提供启动图中的合并脚本（`plugins/??…&rev=`）与按修订号请求的 `client.<名>.js` 分块，同一包中的其他文件（字体、JSON，连不带修订号的 `client.js`）都是 404。字体因此以 data URL 内联在样式中：Fontsource 的样式写 WOFF2 与 WOFF 两种，构建只内联 WOFF2（浏览器都取第一种），8 个字面约 212 KB，整个客户端包约 930 KB（gzip 约 400 KB）。
- dsh 要求客户端包在启动前已构建。发布的包由 `prepack` 构建，安装后不再构建；在仓库的检出中，`presmium-workbench` 行的入口在 dsh 读取客户端包之前检查源码是否比包新，是则用 esbuild 重新构建（原子写入，并行启动的 dsh 互不干扰）。
- 宿主换版本后，页面要重新载入才会加载新版本的模块（`dsh-client-modules` 的 README）；studio 升级后工作台提示用户重新载入。

## 8. 焦点上下文

### 8.1 原则

agent 读的、改的都是源码。所以用户指向的任何东西，无论在源码编辑器、网页预览还是幻灯片预览中，最后都落到同一个东西上：源码中的一段，加上它在文稿中的位置。三个入口共用一种数据、一种交互、一种发送方式；MCP 另有 `presmium://focus` 与 `get_focus`（8.6 节）。交互参考 dsh 的社区插件 dsh-annotate（https://github.com/alaliqing/dsh-annotate，MIT；只作参考，不是依赖），实现用 Presmium 自己的 IR 锚点。

### 8.2 数据：`Focus`

在内核的 agent 契约（`packages/kernel/src/contracts/agent.ts`）中扩展 `AgentContext` 与 `Annotation`，只增加，不改已有字段：

```ts
/** 用户指向的一处：落到源码的一段，带上它在文稿中的位置。 */
export interface Focus {
  id: string
  /** 从哪里指的。 */
  from: 'source' | 'web' | 'slides'
  /** 文档目录，相对于工作区根目录。 */
  document: string
  /** 源码中的一段，总是有。 */
  source: SourceRange
  /** 源码摘录：服务端从文件读出，不取自页面。 */
  excerpt: string
  /** 文稿中的位置：从预览指的有节与块，从幻灯片指的另有步骤；从编辑器选的由服务端按行号补上所在的节与块。 */
  section?: string
  block?: string
  step?: number
  /** 页面上选中的文字，帮助 agent 在块内找到那几个字。 */
  quote?: string
}
```

- `Annotation` 增加 `focus?: Focus`：一条批注是一个焦点、一句要求与处理状态。已有的 `section`、`block`、`source`、`excerpt` 保留，与 `focus` 一致，旧代码照常读。状态沿用 `AnnotationStatus`（草稿、已发送、已处理、未能处理，即 `draft`、`sent`、`done`、`failed`），agent 写下自己的说明（`note`）。
- `AgentContext` 增加 `focus?: Focus[]`。
- 没有选中任何东西时，**当前位置**（文档、节、步骤、形态）是一种被动的焦点，对话时自动带上，不需要用户操作。

### 8.3 三个入口与一种交互

| 入口 | 怎么指 | 得到 |
|---|---|---|
| 源码编辑器 | 选中几行，按 `⌘/Ctrl L` 或点“加入对话” | 文件与行范围；服务端补上所在的节与块 |
| 网页预览 | 按 `⌘/Ctrl ⇧ E` 进入点选（预览协议的 `pick`），点一个块，写一句要求 | 节、块、源码范围；可以带上选中的文字 |
| 幻灯片预览 | 同上 | 节、块、步骤、源码范围 |

- 点选模式：鼠标下的块加虚线框；点击后块旁出现编号标记（预览代理按 `pins` 画出），工作台的焦点托盘中出现同一编号的输入框并获得焦点；`Enter` 保存并继续点下一个，`Shift Enter` 换行，`Esc` 退出，`⌘/Ctrl` 点击保存并发送这一批。
- 输入框在工作台中，不在产物页面中，产物页面只画标记：产物页面与工作台不同源，页面中运行着第三方插件的脚本（4.5 节），作者写在页面中的要求它们读得到；输入框还要带上工作台的文字、键盘处理与界面语言，这违背“产物只暴露锚点”。标记留在页面中，滚动、缩放与切换步骤时才能跟着块走。
- 标记跟着块走：收到 `updated` 后工作台按 8.7 节重新定位并重发 `pins`；块被删掉时，托盘中的那一条显示为“已失效”。
- 两种发送：**加到草稿**（焦点作为对话输入框上方的卡片，可以再写话）或**直接发送**。发送失败不丢焦点。
- 每条批注有状态；完成后关联到那次审阅接受形成的提交，可以一键撤销。

### 8.4 发给 agent 的文字

焦点作为结构化的文字进入对话（模型看得到，所以写进会话日志），格式参考 dsh-annotate，内容换成文稿的语义：

```text
焦点 · lectures/bpe · 网页 · 第 3 节「合并规则」第 2 步（2 处）
#1 块 merge-table（表格）  源码 lecture.md:42-58
   摘录: | pair | count |（前 5 行）
   要求: 把计数改为按频率从高到低排序
#2 块 code-3（代码，Python）  源码 lecture.md:61-74
   选中: merges.append(best)
   要求: 加一行注释说明为什么取频率最高的
```

摘录由服务端从源码文件读出，不取页面上的文字；超过 20 行只给首尾并注明行数，agent 需要更多时用工具读。文字按文稿的 `lang` 写，英文文稿用英文的标签。

### 8.5 产物只暴露锚点，工作台组装焦点

- **产物**：只在 DOM 上写锚点（4.4 节），这是产物唯一要做的事。
- **预览代理**：回答点选、选中的文字与位置，按工作台的要求高亮、画编号标记与跳转（第 4 节）。
- **工作台**：收到锚点后经服务把块换成源码范围与摘录，组装成 `Focus`，放进对话。

### 8.6 MCP 与 dsh

- **保存**：工作台把当前的焦点与批注报告给服务端（`POST presmium.server/focus`，请求体 `{ document, focus: FocusReport[] }`，`FocusReport` 在内核契约中；经 bundle 转发，带服务令牌）。服务端把锚点换成源码范围与摘录（与 MCP 的 `locate_source` 同一个函数），按文档保存最近一次的焦点（与放映位置一样，由服务端保存，不属于某个页面）。
- **dsh**：bundle 的文稿快照列出当前的焦点（6.4 节）；发送批注时，它们作为一条带来源标记的消息进入会话。
- **MCP**：资源 `presmium://focus`（可订阅，与 `presmium://position` 一样，任一文档的焦点）与读取类工具 `get_focus`（可选参数 `document`）。它们经 MCP 宿主接口的方法 `McpHost.focus(document?)` 取得焦点（`@presmium/mcp`）：服务端返回它保存的焦点；`presmium-mcp`（stdio，不经服务端，也没有工作台）返回空。在终端中用 Claude Code 或 Codex 的人因此也能看到作者在工作台中选中的东西。
- 第 9 节的一致性用例同时断言：同一个焦点经 MCP 读到的与 dsh 会话的快照中的相同。

### 8.7 源码改动之后

块的 ID 在源码改动后可能移动。每个焦点同时记源码范围与摘录：重新编译后先按块 ID 找；找不到时按摘录在源码中重新定位（与 `{code-ref}` 的漂移检测同一思路）；再找不到就把这个焦点标为“已失效”（焦点托盘中显示，页面中不再画它的标记），不悄悄指到别处。

### 8.8 保存

批注按文档与对话保存（工作台存在浏览器中，服务端只存最近一次的焦点），刷新页面不丢；不同对话互不共享。

## 9. MCP 与 dsh 的工具一致

- **一张工具表**：`@presmium/mcp` 导出内置工具的表（名字、说明、JSON Schema、种类 `read` 或确认的种类），以及按文档列出工具的函数：内置工具按种类的策略筛选（`off` 不列出），加上插件贡献的 `AgentTool`。
- **适配器一：MCP**。`/mcp`（`presmium dev`、`presmium serve`）与 `presmium-mcp`（stdio）。
- **适配器二：dsh 工具**（bundle 的 `presmium-tools`）。bundle 作为 MCP 客户端（`@presmium/mcp` 导出的客户端一侧）连接工作区服务的回环 `/mcp`，用会话令牌列出工具，把每个工具连同原样的 JSON Schema 登记为 `presmium__<名字>`，调用时转成 `tools/call`。种类决定 6.3 节的映射。编译只在服务中进行一次，预览与 agent 看到的是同一次编译，文稿代码也不进 dsh 宿主。回环的开销很小：本机一份小文稿上，第一次签发会话令牌约 0.4 s（含服务就绪），连接约 50 ms，`tools/list` 约 15 ms，读取类调用的中位数约 6 ms。
- **时限**：dsh 对登记的工具没有默认时限（`timeoutMs` 省略时不限，`dsh-tool-call-timeout-policy` 只执行工具自己声明的时限）；bundle 的 MCP 客户端把单次调用的时限从 MCP SDK 默认的 60 s 放宽到 10 分钟，构建与运行代码不会被它截断。
- **多份文档**：`agent/created` 是串行事件，dsh 等它的监听者结束才处理输入，监听者经 `agent.ctx.tools.register` 登记的工具只属于那个 agent。bundle 因此为每个会话登记它所属文档的工具，不登记各文档工具的并集：两份文档的两个会话，有某个插件的一份得到这个插件的工具，另一份没有。`off` 的种类不登记。
- **一致性用例**：同一份文档、同一组设置下，MCP `tools/list` 的名字与输入 schema，等于 headless 会话中提供给模型的 `presmium__*` 工具（去掉前缀），含一个插件的 `AgentTool`；`off` 的种类两边都不列出；`get_focus` 与会话快照中的焦点相同。新增工具时这个用例保证两边都有。
- **外部 agent 是一等入口**：工作台中的 agent 只用 dsh；Claude Code、Codex 等经 MCP 连接工作区服务，工具与 dsh 中相同，修改落在源码上，工作台的预览与编辑器经 `ir/events` 跟上。它们写的修改不经 Presmium 的审阅（它们没有 Presmium 的会话），作者在“未提交的修改”中提交或放弃，与在自己的编辑器中改一样。
- **外部 agent 只经 MCP**：工作台中的 agent 是 dsh；别的 agent（Claude Code、Codex 等）经 MCP 接入，不另有驱动 agent 的协议。经别的协议时 Presmium 的确认种类与说明会丢失，两套传输与确认语义要一起维护。

## 10. 没有模型与没有 dsh 时

| 情形 | 可用 | 不可用 |
|---|---|---|
| 只装核心（没有 dsh） | CLI 的 `build`、`dev`、`check`、`ir`；静态产物；`presmium dev` 的实时预览与“在编辑器中打开”；`presmium serve` 的文档列表与各文档的页面；语言服务与 VS Code 扩展；`presmium-mcp` 与 `/mcp`（外部 agent） | 浏览器中的编辑与工作台中的 AI |
| 装了 studio，没有模型 | 工作台中除对话以外的全部：文件、编辑、保存、问题、预览、修改历史、撤销、终端。dsh 的 web profile 没有模型也能启动，bundle 全部激活 | 对话：工作台显示 Presmium 自己的说明，指出缺少什么，给出 dsh 模型设置的入口（用 Presmium 结构化的缺少项代码），不显示 dsh 原始的 `MISSING_CREDENTIAL` |
| 装了 studio，有模型 | 全部 | 无 |

不需要模型的 Presmium 操作（构建、检查）也可以做成 dsh 的斜杠命令（`ctx.commands`），不是必需的。

## 11. `presmium studio`

### 11.1 命令与目录

- **命令**：`presmium studio [目录] [--port <端口>] [--host <地址>]`，由 `@presmium/studio` 提供；`@presmium/cli` 在装了它时转交，没装时说明怎样安装。目录的规则同 `presmium serve`（工作区，或只有一份文档的仓库）。
- **`DSH_HOME`**：`$XDG_STATE_HOME/presmium/studio`，一个 `DSH_HOME` 只由一个 dsh 版本写。其中的 profile `presmium-studio`：`package.json` 列出 bundle `dsh-base`、`dsh-web-app` 与 `@presmium/dsh`；dsh 只从 profile 中解析插件模块，所以 profile 的 `node_modules` 链接到 bundle。`DSH_AGENTS_HOME` 是其中的 `agents/`。

### 11.2 启动与监管

1. 选定 dsh 的端口：默认 4320，每次相同，浏览器的 cookie 跨重启有效；被占用时另取空闲端口。端口要在启动之前选定，因为工作区服务以工作台的源启动。
2. 生成服务令牌；启动工作区服务：`presmium serve <目录> --port 0 --preview-origin <dsh 的源>`，环境中带 `PRESMIUM_SERVICE_TOKEN`。
3. 启动 dsh：`--profile presmium-studio --port <端口> --no-open`，加上 6.6 节的补丁，工作目录为工作区根，环境中带服务的地址与令牌（bundle 的 `presmium-service` 行因此不再自己启动服务）。
4. 等 dsh 在标准输出打印 `dsh web: <网址>`。
5. 打印一个网址。

启动令牌只能从 dsh 的标准输出读取：每个 dsh 进程自己生成启动令牌，只经 `dsh-web-app` 中的两处带出，`printUrl` 打印的 `dsh web: <网址>` 一行，与 `openBrowser` 交给浏览器的同一个网址（宿主的连接服务另有 `authenticatedUrl(baseUrl)`，只在类型声明中，README 没有写，不用）。`dsh-web-app` 的 README 把这一行写成供监管者使用的就绪信号：加载树安定、启动审计通过之后才打印。`presmium-workspaces` 在激活时登记文档的工作区，所以读到这一行时工作区已经登记好，启动器不另外查询。用户在 profile 自己的补丁中把 `printUrl` 设为 `false` 时启动器等不到这一行，3 分钟后报错并给出日志的位置。

两个进程的输出写进 `$DSH_HOME/presmium-studio.log`；启动器的标准输出只有 `studio  <网址>` 一行，警告（局域网没有登录、`PRESMIUM_MODEL_*` 不全）在标准错误。

启动器、dsh 宿主与工作区服务各在自己的进程组中，各有父进程退出的看门狗：`kill -9` 启动器之后不留下任何进程，开发服务器也不成为孤儿。

### 11.3 模型

工作台只用 dsh 的模型设置，凭据存在上面的 `DSH_HOME` 中（dsh 不回传密钥）。环境变量 `DEEPSEEK_API_KEY`，以及 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER`，映射为 `DEEPSEEK_*`（dsh 接受 Messages 兼容的地址）。

- **`.env`**：dsh 拒绝 `.env` 文件（启动目录的与 `$DSH_HOME` 的都是）中决定网络去向的变量，例如 `DEEPSEEK_BASE_URL`，写了就拒绝启动，只接受启动环境中的。工作区根（dsh 的启动目录）的 `.env` 因此改不了密钥的去向，但能让 dsh 拒绝启动，日志写明原因。
- **优先级**：dsh 在模型设置中保存的密钥（`.credentials.yaml`）先于环境变量。作者在界面中保存过 DeepSeek 的密钥之后又以 `PRESMIUM_MODEL_URL` 等启动时，dsh 会把保存的密钥发往那个服务；这是 dsh 的规则，启动器不改写 dsh 的凭据文件。

### 11.4 局域网

`--host <地址>` 只接受本机的一个具体 IP 地址（dsh 不接受通配地址与主机名）。dsh 用 `--host <地址> --trusted-host <地址>:<端口>`；dsh 与工作区服务都只监听这个地址，本机也用这个地址打开；工作区服务的 `Host` 与 `Origin` 规则按 `architecture.md` 10.1 节接受这个地址，`--preview-origin` 是局域网的源。启动时警告没有登录，与 `serve --host` 相同。dsh 的 cookie 走明文 HTTP（dsh 写明的限制）；要加密时由用户在前面放 TLS。

### 11.5 hub

dsh 的网页是单一所有者的应用，正好对应“每人一个容器”。hub 为每个用户启动 `presmium studio`，不启动 `presmium serve`；LiteLLM 的地址作为 Messages 兼容的模型地址填进 dsh 的模型设置。dsh 在路径前缀下运行用 `--public-url <前缀地址>` 加 `--trusted-host`，前面放一个只剥离前缀、不注入 cookie、不改写请求头的代理。

### 11.6 桌面客户端

现在只做网页。下面四点保证以后能做桌面：

1. 工作台的数据只走 `connection.fetch` 的精确路由；在桌面上这些请求经 IPC 传递（`dsh-host-webserver` 的 README），`webServer` 的前缀路由只在浏览器中可用。
2. 预览始终来自工作区服务的回环源，不依赖 dsh 的网页服务。
3. 根布局插件保留 `shell.leading` 槽位，窗口装饰的变量以后补上。
4. 网页与桌面用同一个 bundle、同一个 profile。

可能的两条路：把 bundle 装进 DeepSeek 官方的桌面版（外框带 DeepSeek 的品牌，只有 macOS 与 Windows，插件要由桌面自带的 dsh 在应用退出时安装；它的 Electron 外壳在公开的 MIT 仓库中，不在 npm 仓库上）；或自己写一个薄的 Electron 外壳载入同一个页面（Electron 的版本要在 dsh 认可的集合中：43.0.0、44.0.0、44.7.0、45.0.0-alpha.6，dsh 拒绝在 Electron 39 的 Node 中运行；或让宿主跑在随附的 Node 上）。fork dsh 的桌面应用违反依赖优先的约定，不考虑。

## 12. 版本与升级闸门

- **dsh**：精确锁定一个版本，现在是 `0.2.1-alpha.4`。`@presmium/studio` 依赖精确版本的 `@deepseek-ai/dsh`；`@presmium/dsh` 用精确的对等依赖与 `engines.dsh`，安装与启动时都会检查。不用 npm 仓库的 dist-tag（`latest` 指向旧版本）。
- **Presmium 的包**：核心与产物是 1.x，`@presmium/design` 随 `@presmium/host` 发版；`@presmium/workbench`、`@presmium/dsh`、`@presmium/studio` 是 0.x、实验性，等 dsh 发布正式版、并且升级闸门在连续两个 dsh 版本上都通过之后，才纳入 1.x 的承诺。
- **dsh 变动快**：发版频繁，各包没有 CHANGELOG，根布局插件要重新提供的布局契约只有 README 描述。所以能否升级只由升级闸门判断。
- **升级闸门**：升级 dsh 是单独的一次改动，先通过下面五组用例。用例名带 `[gate]`（Vitest）或标签 `@gate`（Playwright），可以单独运行。

| 组 | 内容 |
|---|---|
| 1 | `--dump-config` 的行 ID：bundle 的行、关掉的行、技能与工作区控制器的配置 |
| 2 | 经 bundle 的 headless 假模型用例：工具、四种确认策略、上下文、隐私（请求体与技能目录）、工具一致 |
| 3 | 客户端的启动审计：`root` 的子槽位、dsh 插件调用的 `ctx.layout` 成员、品牌与首次使用提示的槽位名、`--dsw-*` 令牌名、外壳模块表的键、插件页的 `data-plugin-group="extensions"`、页面没有错误 |
| 4 | 工作台调用的 Host API 端点的 schema 比对（端点的描述带 JSON Schema） |
| 5 | 工作台的端到端用例，含退路布局 |

- **会话格式**：bundle 只经事件与接口使用会话，不读会话日志文件，dsh 的会话格式升级因此不影响 Presmium。

## 13. 三条命令的分工

| 命令 | 是什么 | 需要 dsh |
|---|---|---|
| `presmium serve` | 工作区服务加产物：首页是文档卡片，各文档有自己的页面，`/mcp` 供外部 agent；没有编辑界面 | 否 |
| `presmium dev` | 一份文稿的实时预览，加“在编辑器中打开” | 否 |
| `presmium studio` | 工作台：浏览器中的编辑、预览、对话与批注、审阅、修改历史；可以不配模型 | 是 |

讲授的录制发生在演讲者视图（产物）中，结果写进讲授轨，保存经讲授插件的服务端路由；改写、回写与审阅在工作台中。

修改历史是 git 提交与尾注，会话的提交另有 `Presmium-Session` 与 `Presmium-Turn`。`presmium.workspace.yaml` 中的 `approvals` 与 `settings.presmium.assistant.review` 由工作区服务读取并执行（6.3、6.5 节），bundle 不读。

## 14. 安全与隐私

- **栅栏**：工作台只经 dsh 自己的栅栏访问 dsh（cookie 为 HttpOnly、SameSite=Strict；没有 cookie 时 401，外来的 `Origin` 或 `Host` 时 403）。不做注入 cookie 或改写 `Origin` 的代理（2.3 节）。
- **预览与工作台不同源**（4.5 节），预览页面的 `frame-ancestors` 只允许工作台的源。
- **文稿代码不进 dsh 宿主**：编译、编译时执行与构建都在工作区服务中（1.2 节）。同一 uid 能读的东西照旧是残余风险（`architecture.md` 9.4 节）。
- **服务令牌**是纵深防御；会话令牌只签发给启动服务的主机（5.3 节）。
- **隐私默认值**由 profile 补丁每次启动重新声明（6.6 节）。
- **完全访问模式**：Presmium 的硬性拒绝用 guard 实现，不依赖回答者（6.3 节）。
- **局域网**：11.4 节。
- **进程**：进程组加父进程退出的看门狗，不留孤儿进程（11.2 节）。

## 15. 测试策略

- 只写集成测试（仓库的约定）：真实运行 CLI、构建产物、服务、浏览器与锁定版本的 dsh；模型用脚本化的 Messages 兼容假模型（`@presmium/cli/testing`，供各包与端到端用例共用），不 mock 宿主框架；每条验收标准一到两个用例。
- 每个用例用自己的 `DSH_HOME` 与 `HOME`（临时目录），并断言没有写到测试目录之外（例如没有出现 `~/Documents`）。
- 预览协议的用例（`e2e/preview-protocol.spec.ts`）用一个不依赖任何框架的测试宿主页面，测的是协议本身，而不是某个工作台的实现；`e2e/preview.spec.ts` 是预览同步的用例。
- bundle 的用例在 `packages/dsh/test/`（行与补丁、工具一致、确认、上下文、隐私、turn 与审阅），审阅的服务一侧在 `packages/workspace/test/review.test.ts`，studio 在 `packages/studio/test/studio.test.ts`。
- 工作台的端到端用例（`e2e/workbench.spec.ts`）在 Chromium 中运行；测试文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中构建。
- 升级闸门的用例带标记（第 12 节），可以单独运行。
- 并行运行时各自用不同的端口（`PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT`）。

## 16. dsh 的已知限制

下列是锁定的 dsh 版本的限制，Presmium 不改 dsh，在自己一侧绕开。

| 限制 | 做法 |
|---|---|
| 界面组件不能单个嵌入别的页面：每个包只导出 Cordis 插件，共享模块只在外壳中 | 工作台写成 dsh 的客户端插件（1.2 节） |
| 品牌与内置文案没有覆盖机制：标语只能经语言包按完整的语言标签替换，zh-TW 等仍显示原文 | 语言包加逐行关掉，实验插件组按 DOM 属性隐藏（6.6、7.5 节） |
| 布局提供者契约（`root` 的子槽位与 `ctx.layout`）只有 README 描述 | 根布局插件加启动审计（7.2、12 节） |
| ui-slots、client-store、ui-primitives 没有可安装的包与类型；客户端包的工厂格式没有文档；客户端包不能带静态文件 | 自己的 esbuild 插件与最小的类型；字体以 data URL 内联（7.8 节） |
| 运行时没有 TS 加载器 | 每行一个 ESM 入口，用 jiti 加载 `.ts`（3.3 节） |
| 只从 profile 中解析插件模块 | profile 的 `node_modules` 链接到 bundle（11.1 节） |
| 第一次使用会在 `~/Documents` 下建目录 | `documentsDirectory` 加启动时登记（6.6 节） |
| 启动令牌只能从标准输出读取 | 解析 `dsh web: <网址>` 一行（11.2 节） |
| `.env` 中不能放决定网络去向的变量 | 模型的地址只经启动环境传入（11.3 节） |
| `--host` 不接受通配地址与主机名；cookie 走明文 HTTP | 只接受一个具体 IP 地址；要加密时在前面放 TLS（11.4 节） |
| 授权只一次有效，回答者看不到参数 | `displayReason` 带摘要（6.3 节） |
| web 的 agent 预设各带 `persona` 行，补丁按 ID 找不到它们 | 指南写在 system 消息中，关掉 `harness-dev-context`（6.6 节） |
| 修改摘要只在内存中，宿主重启后返回 404 | 审阅记录由工作区服务保存（6.5 节） |
| `welcome-notice` 的“已读”记在宿主上，替换它的步骤只能 `complete()` | “已读”记在浏览器的 `localStorage`（7.4 节） |
| 网页在 Linux 上不许 Mod+Alt 组合 | 侧栏的快捷键在 Linux 的网页上没有默认按键，用活动栏与侧栏按钮收起（7.2 节） |
| 官方桌面版的外框带 DeepSeek 的品牌 | 只做网页（11.6 节） |
