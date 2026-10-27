# 工作台与 DeepSeek Harness 的设计

本文定义 Presmium 工作台与 dsh 的接入和实现边界。界面交互以 [UI/UX RFC](rfc-workbench-uiux.md) 为准；该 RFC 覆盖本文件原有的界面方案，按阶段实现，不表示当前服务已完成迁移。工作台建在 DeepSeek Harness（dsh）之上；核心与产物不依赖 dsh，也不依赖模型。契约以源码为准：预览协议在 `packages/kernel/src/contracts/preview.ts`，`Focus` 与批注在 `packages/kernel/src/contracts/agent.ts`，会话令牌在 `packages/kernel/src/contracts/server.ts`。实现的细节见 `architecture.md` 第 13 节，与 dsh 的概念对照见 `domain-model.md` 第 16 节。

## 术语

本文与相关文档只用下面这些名字。

| 术语 | 含义 |
|---|---|
| dsh | DeepSeek Harness（MIT）：agent 循环、工具、沙箱、确认、会话、模型适配，以及一个用 React 写的网页客户端运行时。Presmium 只经它的插件、配置补丁与客户端插件机制使用它 |
| 产物 | 渲染端从 IR 生成、能单独部署的东西：网页、幻灯片、notebook、讲授。静态构建的结果与开发服务器实时提供的页面都算。产物用 React（网页与幻灯片都是查看器） |
| 工作台 | `presmium studio` 的页面：外壳、文稿列表，以及文档编辑、编译放映、视频制作三个独立入口；共用版本历史、批注与对话服务 |
| 工作区服务 | `presmium serve` 中不含界面的部分：编译会话、产物的开发服务器、文档与源码的路由、修改历史与审阅、MCP |
| bundle | dsh 的扩展包，由 dsh 的插件与配置补丁组成。Presmium 的 bundle 是 `@lincyaw/dsh`。它不是 Presmium 自己的插件包（`@lincyaw/addon-*`） |
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

工作台面向讲义作者，分为三个独立入口：文档编辑负责正文、格式、页面和批注，交互参照飞书；编译放映负责从规范文稿编译、查看诊断与放映，交互参照 Overleaf；视频制作负责配音、字幕、剪辑、录制和视频导出，交互参照剪映。三个入口通过同一份 `lecture.json`、派生 IR 修订与公开服务契约衔接，分别维护界面状态；编辑正文、添加页面与保存不会自动切换入口或进入放映。

当前优先验收文档编辑。正文使用 React 与 BlockNote，工作台画布连续显示整份文稿，页面导航只滚动定位；公开阅读页仍按网站的章节分页。普通作者无需全局文件树或项目级 IDE；生成内容保留预览和批注。Doc 的步骤内只提供字幕与配音开始，录音、转写、音色和高级编排位于 Video。编译放映与视频制作已有的底层能力继续保留，独立界面的完成范围以 [UI/UX RFC](rfc-workbench-uiux.md) 的实施状态为准。

1. 不配模型、也不装 dsh 时，核心照常可用：编译、IR、渲染端、CLI、静态产物，以及 `presmium dev` 的实时预览。
2. 产物可以单独部署与使用，不带工作台的代码。工作台换框架或换实现时，产物不改。
3. 工作台是 dsh 的一个定制发行版：Presmium 的能力以 bundle 装进 Presmium 自己的 profile。对话、确认、会话、模型设置、终端与 jobs 用 dsh 的插件，其余由 Presmium 的 React 面板补齐。
4. 网页优先：`presmium studio` 一条命令启动，用户只拿到一个网址。桌面客户端只保留可能（11.6 节）。

### 1.2 原则

1. **核心与产物离开模型也能工作。** 核心（编译器、IR、渲染端、IR 运行时、CLI、静态产物）不引用 `@deepseek-ai/*`。
2. **产物与工作台分离。** 改动源码的归工作台；不改动源码的（放映、演讲者视图、课堂、运行代码、读者用自己的模型问答、放映中的讲授录制）归产物。产物使用 React，只向工作台暴露锚点（`data-section`、`data-block`、`data-step`），经预览协议嵌入工作台（第 4 节）。
3. **工作台是 dsh 的客户端插件。** 工作台用 React 写成 dsh 的客户端插件；Presmium 的根布局插件替换 dsh 自带布局，按 [UI/UX RFC](rfc-workbench-uiux.md) 排布，dsh 的对话与确认卡片作为按需展开的辅助工具（第 7 节）。dsh 的界面组件不能单个嵌入别的页面（第 16 节），所以工作台在 dsh 的客户端运行时之中，不另写一个调用 Host API 的界面。
4. **dsh 只经一个包接触。** 只有 `@lincyaw/dsh` 引用 dsh 的宿主接口与客户端接口；`@lincyaw/studio` 只负责安装与启动 dsh；分层检查保证这一点（3.2 节）。工作台的面板不引用 dsh，核心与产物不知道 dsh 存在。dsh 的接口变了，只改这一个包。dsh 精确锁定一个版本，升级先过升级闸门（第 12 节）。
5. **不改 dsh。** 不 fork，不打补丁，只用它的插件、配置补丁与客户端插件机制（仓库的“依赖优先”）；它的限制在 Presmium 一侧绕开（第 16 节）。
6. **工作台中的 agent 只用 dsh，外部 agent 经 MCP 接入。** 模型在 dsh 的模型设置中选。外部 agent（Claude Code、Codex 等）是一等入口。一张工具表，两个适配器（MCP 与 dsh 工具）：工具只在工作区服务中执行，新工具两边都有，两边的清单由一致性用例保证相同（第 9 节）。
7. **浏览器中的持久化编辑只在工作台中。** 正文在文稿页面上按块编辑，代码生成的内容在块内编辑其源码；两者都经工作区服务保存，再由编译器生成 IR。`presmium studio` 可以不配模型；`presmium dev` 是实时预览加“在编辑器中打开”，`presmium serve` 只有文档列表与产物（第 13 节）。独立阅读与放映不提供工作台的源码保存能力。
8. **文稿的代码不进 dsh 宿主。** 编译、编译时执行与构建都在工作区服务的进程中；持有模型凭据与确认通道的 dsh 宿主不运行文稿的代码。
9. **修改落在源码上，并成为提交。** 审阅、提交与撤销由 Presmium 负责（6.5 节）；作者在文稿上看到 AI 改了哪里（7.3 节），对话中不显示 dsh 的修改卡片。
10. **隐私默认关闭，每次启动重新声明。** 不上传会话日志、插件清单与遥测，不读用户目录中的技能，第一次使用时不在用户的文档目录中建目录（6.6 节）。
11. **焦点只有一种。** 网页与幻灯片中的点选与选中文字统一为一种 `Focus`、一种交互、一种发送方式；MCP 另有 `presmium://focus` 与 `get_focus`（第 8 节）。
12. **有退路。** 根布局插件失效时，同一批面板挂在 dsh 自带布局中仍可用（7.2 节）。

## 2. 三层与进程

### 2.1 层与包

| 层 | 包 | 框架 | 依赖 dsh | 没有模型时 | 版本 |
|---|---|---|---|---|---|
| 核心 | `kernel`、`compiler`、`cli`、`server`、`mcp`、`language-server`、`workspace`（Node 部分，即工作区服务）、`classroom-server`、`create-presmium`、`presmium-vscode` | TS、Node | 否 | 全部可用 | 1.x |
| 产物 | `web`（站点外壳加 `viewer`，网页与幻灯片两种形态）、`render-slides`（幻灯片的构建与导出）、`render-notebook`、讲授插件的渲染端、各插件的组件，宿主接口 `host` | React | 否 | 全部可用；读者问答用读者自己的模型服务 | 1.x |
| 工作台 | `design`（与产物共用）、`workbench`、`dsh`、`studio` | React 18（由 dsh 的外壳提供） | 只有 `dsh` 与 `studio` | 除对话外都可用 | 0.x，实验性（`design` 随 `host` 为 1.x） |

### 2.2 进程与端口

| 进程 | 作用 | 监听 |
|---|---|---|
| studio 启动器 | 组装 profile，启动并监管下面两个进程，打印一个网址 | 无 |
| dsh 宿主 | agent、会话、确认、Host API、工作台网页、bundle 的宿主部分 | 用户访问的那一个端口：默认只在本机（`127.0.0.1`），`--host` 时只在给出的地址上 |
| 工作区服务 | `presmium serve`：编译会话、产物的开发服务器、文档与源码、审阅与修改历史、焦点、MCP | 空闲端口，与 dsh 宿主在同一地址上（默认回环），因为预览 iframe 由浏览器直接访问它 |
| 产物的开发服务器 | 查看器的站点服务器，在工作区服务进程中；查看器与文稿代码的构建在它启动的一个子进程中 | 回环，经工作区服务转发 |

“一个网址”指用户只需打开 dsh 宿主的地址；预览 iframe 指向工作区服务的源，由工作台自己填入。预览不由 dsh 宿主提供：dsh 的 webServer 前缀路由只在插件激活时构建一次，编辑之后不更新，侧栏的 Browser 也不显示 dsh 自己的源。

### 2.3 请求的路径

1. **工作台的数据**：浏览器 → dsh 宿主的 `/api/presmium/*`（经 dsh 的 cookie 与 `Host`、`Origin` 栅栏）→ bundle → 工作区服务（回环，带服务令牌，5.3 节）。普通读取与修改继续使用 `connection.fetch` 精确路由。文稿、诊断、审阅、IR 和任务事件由每页一个 `/api/presmium/events` WebSocket 承载，经公开 `webServer.registerUpgrade` 与 `connection.admit` 核对 cookie、Host、Origin 和 owner 身份，再转发原工作区 SSE；取消只释放对应逻辑订阅，不接管共享 Peer。`workspaceClient()` 的独立使用者仍默认使用 EventSource。
2. **预览**：浏览器中的 iframe → 工作区服务的源：产物页面与它的 `/__presmium/` 路由。
3. **agent 的工具**：dsh 宿主 → bundle → 工作区服务的 `/mcp`（回环，每个会话一个会话令牌，5.3 节）。
4. **外部 agent**：Claude Code、Codex → `presmium-mcp`（stdio），或工作区服务的 `/mcp`（令牌在 0600 的状态文件中）。

浏览器与这些服务之间没有替浏览器持有 cookie 的代理：注入 cookie 并改写 `Origin` 的代理会拆掉 dsh 的栅栏，让外来源的页面读出会话记录。

正常 Studio 的 Web 补丁禁用正式 `client-hmr` 行，避免 `/plugins/events` 继续占用每页一条 HTTP/1.1 连接。静态启动图保留，文稿及运行数据仍实时更新；外壳插件启停或客户端代码重建后，作者需重新加载页面。维护自有 dsh profile、确需外壳热更时，可在 Presmium Web 补丁后应用以下正式补丁并重启自有宿主：

```yaml
- id: client-hmr
  disabled: false
```

重新启用会恢复每页一条 shell SSE，HTTP/1 多标签页上限也随之恢复；不要把它作为普通编辑所需设置。实际六标签页结果与限制见[传输记录](benchmarks/studio-multitab-transport-2026-10-27.md)。

| 事件连接依赖 | 公开接口与用途 | 许可证 |
|---|---|---|
| `ws` 8.22.0 | `WebSocketServer({noServer:true})`、`handleUpgrade`；只借框架监听器 | MIT |
| `eventsource` 3.0.7 | `EventSource({fetch})`；带服务令牌读取原 SSE，保留其重连行为 | MIT |
| `partysocket` 1.3.0 | 通用 `WebSocket`、`startClosed`、`reconnect/close`；离线消息队列关闭 | MIT |
| `zod` 4.4.3 | 共享严格命令与事件 schema，拒绝额外字段 | MIT |

连接只接受五种固定 topic，每个连接至多 16 个逻辑订阅、输入帧至多 8 KiB、待发送数据至多 2 MiB。重连仅恢复当前订阅，新代次不接受旧 ID；文稿版本、事务与保存队列仍由原 actor 持有。

### 2.4 接缝

| 接缝 | 两侧 | 用到的接口 | 稳定性 |
|---|---|---|---|
| S1 | bundle 与 dsh 宿主 | `ctx.tools.register`、`agent/created` 与 `agent.ctx.tools.register`、`defineTool`；`tools/pre-execute`、`tools/execute`；`ctx.tools.guard`；`approval/request`；`ctx.systemPrompt.section`、`context`、`agent/pre-step`；`ctx.skills.register` 与 skill-filesystem 的配置；`ctx.workspaceRegistry`；`ctx.connection.fetch.register`（精确路径，必须在 `/api` 下）与 `admit()`；`ctx.webServer.registerUpgrade`；`ctx.webServer.tapIndex`；turn 与 `workspace/changes` 事件；`Agent.inject`；bundle 的格式（`dsh.bundle`、行 ID、`!!js`） | README 有文档，alpha |
| S2 | 工作台的客户端插件与 dsh 客户端运行时 | `dsh.client` 声明与 `dsh.client.external`（有文档）；包的工厂格式 `__ModuleLoader__.load`（无文档）；外壳的模块表（React 18.3.1 等）；槽位接口；`root` 的 6 个子槽位与 `ctx.layout`（README 描述了行为）；`ctx.theme`；`ctx.locale`；`ctx.sidebarRightTabs`；品牌槽位与 `settings.onboarding` | 最不稳定；只出现在 `@lincyaw/dsh` 的客户端部分 |
| S3 | 工作台的面板与 dsh 的会话 | 面板自己发起的会话与提示（起草、讲授回写、批注）：Host API 的 `session/create`、`session/prompt`（schema 严格校验），或客户端运行时的会话服务 | 中 |
| S4 | bundle 与工作区服务 | Presmium 自己的回环 HTTP 接口、`/mcp`、服务令牌、进程监管 | Presmium 自有 |
| S5 | 工作台与产物 | 预览协议；IR 与诊断经工作区服务取得 | Presmium 自有 |
| S6 | 外部 agent | `presmium-mcp`（stdio）与工作区服务的 `/mcp` | 不变 |

## 3. 包与分层规则

### 3.1 新包

| 包 | 层 | 内容 | 依赖 dsh | 版本 |
|---|---|---|---|---|
| `@lincyaw/design` | 产物与工作台共用 | 令牌 `tokens.css`、`pm-ui-*` 的类 `components.css`、字体 `fonts.css`、图标（SVG 字符串）与令牌名；`@lincyaw/host` 引用它。没有框架 | 否 | 1.x，随 `host` 发版 |
| `@lincyaw/workbench` | 工作台 | React 面板，以及框架无关的部分：工作区服务的客户端、预览协议的工作台一侧、编辑器的状态（CodeMirror 6、三方合并）、审阅与历史的模型 | 否，不引用 `@deepseek-ai/*` | 0.x |
| `@lincyaw/dsh` | 工作台（bundle） | 宿主部分（Node）与客户端部分（React，预编译）；唯一接触 dsh 接口的包 | 是：精确的对等依赖与 `engines.dsh` | 0.x |
| `@lincyaw/studio` | 工作台（启动器） | `presmium studio`：组装 profile，启动与监管 dsh 和工作区服务 | 是：精确版本的 `@deepseek-ai/dsh` | 0.x |

现有包中与工作台有关的部分：`kernel` 有预览协议的契约与 `Focus`；`mcp` 另导出工具表与客户端一侧；`server` 有会话令牌与焦点；`cli` 的 `studio` 子命令只转交给 `@lincyaw/studio`，没装时说明怎样安装（约 865 MB，其中 `@deepseek-ai/*` 约 566 MB，只在装 studio 时发生）。

### 3.2 分层规则

`scripts/check-layering.mjs` 检查：

- **产物不认识工作台**：产物的包（`web`、`viewer`、`render-*`、各插件的 `src/client` 与 `components`）不引用 `@lincyaw/workbench`。
- **dsh 只在一处**：`@deepseek-ai/*` 只出现在 `packages/dsh` 与 `packages/studio`。
- **面板不认识宿主**：`@lincyaw/workbench` 不引用 `@lincyaw/host` 与 `@deepseek-ai/*`。
- **mcp 的使用者**：server 与 dsh 使用 mcp；`@modelcontextprotocol/*` 只在 `mcp` 中，bundle 经 `@lincyaw/mcp` 导出的客户端一侧使用 MCP。
- **design 没有框架**：`@lincyaw/design` 不引用任何包。

### 3.3 发布

- 源码仍以 `.ts` 直接发布。例外有两个：`presmium-vscode`，以及 `@lincyaw/dsh` 的客户端部分（预编译，7.8 节）。dsh 的运行时没有 TS 加载器，装在 `node_modules` 中的 `.ts` 也不能由 Node 原生加载，所以 bundle 的宿主部分每一行有一个普通 ESM 的入口文件，入口用 jiti 加载本包的 `.ts` 源码，与 Presmium 的可执行文件相同；jiti 的缓存为空时冷启动约 1.1 s。
- 0.x 的三个包有自己的版本号，不随 Presmium 的统一版本；`scripts/check-packages.mjs` 为它们开例外。
- `@lincyaw/dsh` 的 `prepack` 与 `postpack` 改写它自己的目录（技能的副本与预编译的客户端），所以同时打包全部公开的包的 `scripts/consumer.ts` 在全仓的一个锁之下打包。
- 许可证：dsh 的 304 个包中 300 个 MIT，`libreoffice-kit` 与 `libreoffice-kit-wasm` 为 MPL-2.0，`node-addon-system` 及其平台包为 BSD-3-Clause；从 npm 仓库安装不算由 Presmium 再分发。MIT 不授予 DeepSeek 的名称与标志：发行版不用 DeepSeek 的品牌，不暗示其背书，只在“关于”与 `NOTICE` 中写明“基于 DeepSeek Harness（MIT）”。

## 4. 预览协议 v1

### 4.1 作用与边界

工作台经预览协议驱动嵌在它里面的产物页面，产物页面经它报告位置与点选。协议只传章节、块与步骤的 ID 和少量状态，不传源码位置，也不传 DOM。源码位置由工作台从 IR 的 `SourcePos` 得出（`findPlaceAtLine`、`findPlaceSource`，在 `@lincyaw/workbench` 中）。

v1 覆盖网页与幻灯片两种形态。notebook 是静态文件，没有实时页面；讲授播放器不在 v1 中。

### 4.2 传输与握手

- 传输是 `window.postMessage`。每条消息的信封是 `{ protocol: 'presmium-preview', version: 1, nonce, type, ...字段 }`。
- 工作台向工作区服务请求预览地址（`GET preview`，5.1 节），在地址上加查询参数 `presmium-preview=<nonce>`（每个 iframe 一个随机值），再放进 iframe。
- 预览代理只存在于工作区服务启动的开发服务器提供的页面中：工作区服务给它启动的开发服务器的 `RenderContext.preview`（可选字段：`{ origins }`，允许的父页面来源）。静态构建与 `presmium dev` 不带它。代理只在三个条件都满足时启动：地址带这个参数，`window.parent !== window`，`origins` 不为空。
- `presmium dev` 的页面由浏览器直接打开，不嵌在任何工作台中，没有对方可以通信，所以不带预览代理；点选因此只在 `presmium studio` 中可用。
- 允许的父页面来源是 `presmium serve --preview-origin <源>`（可重复）给出的；在 studio 中，启动器把 dsh 的源（`--host` 时是局域网的源）告诉服务。代理只向这些来源发消息，也只接受从它们发来、带同一个 nonce 的消息。
- 代理启动后先发 `ready`。工作台收到 `ready` 之后才发别的消息。信封的版本不同时，工作台提示“预览的版本与工作台不符，请重新启动”。
- 工作台把连接绑定到建立它的文档与形态；位置、点选与选区只提交给当前握手确认的文稿。已发出的正文写入仍须向原连接明确回复，不能转入新文稿状态。预览内的跨文稿导航由 `ready.document` 驱动工作台切换文档，沿用未保存修改的确认流程；取消时恢复原文档的预览。
- 每次 `ready` 都开启该 iframe 的新一代连接；待确认请求还须匹配原连接实例与代次。插页、保存边界与正文历史命令，以及正文、素材源码的请求回复，均只发送一次：首次握手前可以排队，发送后不因重载再次执行。
- 未知类型的消息一律忽略。消息只是数据：代理不执行收到的代码，也不打开收到的链接。

Doc 中的单块只读预览使用独立消息，不建立 v1 编辑握手或 SSE。`presmium:block-preview` 报告文稿、块、运行修订、状态与自然高度；同一状态和高度不重复报告。就绪后的实际步骤导航另外发送 `presmium:block-preview-position`，字段为 `document`、`blockId`、`revision`、`sectionId`、`stepId`、`navigation`，仅报告包含该块的章节。初次加载不报告默认位置。父工作台核对 iframe 窗口、来源、修订和当前源码版本，再按权威文稿的稳定步骤 ID 更新当前位置；不滚动正文、不写 JSON，也不创建另一套播放时钟。正式放映从这个位置开始。

父工作台通过 `presmium:block-preview-command` 控制同一个只读块，携带 `document`、`blockId`、`revision`、`sectionId`、`stepId` 和 `action`（`seek`、`pause` 或 `sync`）。`seek` 默认显示该步完成画面；文档内首次加载和重载同样使用 `at: 'end'`，避免暂停快照停在全透明的入场起点。内联场景对外部定位或步按钮选择保留一次当前步骤的起点，实际播放获准后从该起点重播，并以 `boundary: 'start'` 保留稳定步骤身份；拖动进度条清除这次重播意图，中途暂停后继续播放沿用当前位置。自然播放结束仍按原规则从整场起点重播。起点与完成边界分别由 `at: 'start'`、`at: 'end'` 明确表达。子页面核对允许的父源、窗口、运行修订与块所属章节后执行；起止边界只是运行导航意图，不写入文稿或 Production。暂停复用现有播放协调服务，立即停止该帧的本地动画；同一已选步骤保留时间，目标不同时对齐已选步骤。每次全局位置提交产生唯一的 `navigation` 代次，`seek` 携带该代次；步骤相同的往返也不复用代次。子位置只在代次仍为当前时被采纳。父端以 `sync` 确认已采纳的本地位置和新代次，不跳步、不暂停它的时钟；确认在途期间产生的新本地位置以新代次重新报告。其它卡片按当前代次跟随定位，旧消息不能回拉共享位置。作者明确暂停或打开当前步骤的编辑区，即使步骤未变也推进代次；普通运行时重复位置不会推进。带代次的 `pause` 同时清除此前的本地导航意图。

有允许父源的嵌入只读块从创建时启用播放授权，点击播放先报告 `presmium:block-preview-playback-request`，附带同一文稿、块、运行修订、请求号、当前导航代次和稳定章节、步骤标识；父端用 `presmium:block-preview-playback-granted` 回应对应请求及已采纳的导航代次后，现有播放器才启动。暂停、结束、取消与卸载释放授权，并尽可能报告 `presmium:block-preview-playback-cancelled`；父端卸载参与者时也必须释放等待，不能依赖卸载通知一定送达。请求超时、拒绝和旧代次回应均不得启动播放。子端按本地播放代次核对授权回调及每次 RAF，停止后迟到的回调不能重新启动动画。父端跳步后的渲染中间状态不回报位置；只有新的可信本地指针、键盘操作或获准播放才能重新发布位置，防止多个块相互回送跳步。该协议只协调已有播放器，不另建时钟或 HTTP 长流。

### 4.3 消息

| 方向 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 产物 → 工作台 | `ready` | `renderer`（`web` 或 `slides`）、`document`、`revision`、`capabilities` | 代理就绪。`revision` 是页面所用 IR 的修订号；`capabilities` 列出页面支持的消息类型 |
| 工作台 → 产物 | `activity` | `active`、`request` | 可选能力。暂停时卸载文稿组件并停止内核；恢复时刷新网页 IR、恢复内核和布局。`request` 为非负安全整数 |
| 产物 → 工作台 | `activity` | `active`、`request`、`revision?`、`error?` | 完成上述切换后的确认，回传请求编号；失败时工作台销毁预览，沿用重新加载路径 |
| 工作台 → 产物 | `flush` | `request` | 可选能力，由实现 `PreviewPage.flush` 的页面在 `ready.capabilities` 中声明。结束并保留原地文字编辑，等待正文与已提交的素材源码保存；输入法组字结束后才提交 |
| 产物 → 工作台 | `flushed` | `request`、`error?` | 上述等待的结果。未提交的素材源码草稿（含浏览器恢复的草稿）阻止完成，失败保留输入。原地文字的 `edited` 先于此消息，工作台仍须等待自己的串行写入队列 |
| 产物 → 工作台 | `document-history-state` | `section?`、`undo`、`redo` | 当前正文编辑器的原生撤消与恢复能力；没有 `section` 时清除当前编辑器目标。初始化与 IR 投影不进入作者的撤消栈 |
| 工作台 → 产物 | `document-history` | `action`（`undo` 或 `redo`）、`request` | 可选能力，由实现 `PreviewPage.documentHistory` 的页面声明。对当前正文编辑器执行一次原生撤消或恢复 |
| 产物 → 工作台 | `document-history-result` | `request`、`handled`、`error?` | 上述操作结果；确认匹配文稿、预览实例、代次与请求，超时保留当前编辑状态 |
| 工作台 → 产物 | `document-history-reset` | 无 | 清除正文编辑器的当前历史目标；页面结构操作和源码版本操作使用各自的历史边界 |
| 工作台 → 产物 | `go` | `section`、`step?`、`trail?`、`view?` | 跳到某节的某一步。`view` 是网页形态的运行时视图（`document`、`present` 等，与控制通道的位置相同）；幻灯片形态没有 |
| 工作台 → 产物 | `highlight` | `target`：`{ section, block? }` 或 `null` | 框出一块或一节；不在视野中时滚动过去；`null` 清除 |
| 工作台 → 产物 | `pick` | `on` | 点选模式。打开时点在块上报告 `picked`，不触发块自己的操作；链接、按钮与输入框照常工作（规则同 `placeOfClick`）。鼠标下的块加一道浅色细框，指针为手形；双击块不选中词 |
| 工作台 → 产物 | `pins` | `targets`：`[{ id, section, block, label }]` | 在这些块的右上角画编号标记（`label`），并把块淡淡标出，像 Word 标出有批注的文字；标记在页面之中，滚动、缩放与切换步骤时自然跟着块走；块不在当前页面中时不画。空数组清除 |
| 工作台 → 产物 | `flash` | `targets`：`[{ section, block? }]` | 让这些块（或节）闪烁三下，约 2.4 秒，先把第一块带到眼前（幻灯片翻到它所在的那一页）；读者要求减少动态效果时改为同样时长的淡色底。工作台用它标出 AI 刚改过的地方 |
| 工作台 → 产物 | `marks` | `on` | 显示作者用的标记（如 `{cue}`），`PmRoleMark` 看它 |
| 工作台 → 产物 | `appearance` | `dark` | 明暗跟随工作台 |
| 工作台 → 产物 | `edit` | `target`：`{ section, block? }` 或 `null`、`at?`：`{ x, y }`、`revision?`、`binding?` | 就地编辑一块的文字；只有 `section` 时编辑该节的标题。新流程成对提供 IR 修订与目标语义指纹，由宿主生成，页面原样保存和回传。光标放在 `at` 下的文字处。只输入纯文本，格式命令、换行与拖放被拦下；输入法组字按完整事务处理。`Enter` 或离焦提交，`Esc` 或 `target: null` 取消本次输入；暂停、切换文稿与重载保留未确认草稿 |
| 产物 → 工作台 | `source-read` | `section`、`block`、`request`、`part?` | 按当前 IR 块读取其源码；默认有 `definition` 时读取定义文件，否则读取该块的 MyST 片段；`part: block` 读取块配置。请求不能指定任意文件 |
| 工作台 → 产物 | `source-result` | `section`、`block`、`request`、`source?`、`error?` | 源码快照：`part`、`path`、`language`、`content`、`version`、`shared`（引用同一定义的块数）；失败时给出原因 |
| 产物 → 工作台 | `source-save` | `section`、`block`、`request`、`path`、`base`、`content`、`part?` | 保存当前块已经打开的源码；工作台重新核对块与文件的绑定、版本与编辑锁，沿用正文的串行保存队列 |
| 工作台 → 产物 | `source-saved` | `section`、`block`、`request`、`sourceVersion?`、`error?` | 保存确认或错误；请求编号关联原草稿，失败不清除编辑内容 |
| 产物 → 工作台 | `source-draft` | `dirty` | 汇总未保存的块源码草稿；文档编辑顶栏与正文草稿共同显示“未保存”，不传源码内容 |
| 产物 → 工作台 | `body-draft` | `dirty` | 汇总未确认保存的正文块草稿，包括恢复的草稿 |
| 产物 → 工作台 | `native-draft` | `dirty` | 汇总原生标题与复杂文字镜头的编辑、待确认、失败和恢复草稿；独立于正文块、素材源码和视频讲稿草稿 |
| 产物 → 工作台 | `blocks-edited` | `section`、`request`、`revision`、`blocks` | 提交一个页面的正文块；工作台核对 IR 修订与当前源码版本后串行写回 |
| 工作台 → 产物 | `blocks-result` | `section`、`request`、`revision?`、`error?` | 正文写回结果；真实改写须等到更新的 IR 并再次确认源码版本，旧请求不能清除其后输入 |
| 产物 → 工作台 | `source-create` | `section`、`id`、`after?`、`request`、`revision` | 在指定正文块后创建独立动画；预览先为新 UUID 保存源码视图状态，再请求创建。使用插件提供的初始代码，代码文件与文稿引用保存为同一个版本 |
| 工作台 → 产物 | `source-created` | `section`、`request`、`block?`、`error?` | 返回新块的 ID，预览在该块打开源码；失败时保留当前编辑状态 |
| 工作台 → 产物 | `page-insert` | `section`、`id`、`request` | 页目录请求在当前页之后插入独立页面，画布先完成待保存的正文块 |
| 产物 → 工作台 | `page-create` | `section`、`id`、`request`、`revision` | 正文保存完成后请求新增页面；块菜单也走此流程，不在当前页插入普通标题块来模拟页面 |
| 工作台 → 产物 | `page-created` | `section`、`request`、`page?`、`error?` | 保存并确认新页面进入 IR 后返回页面 ID，画布定位并聚焦新页正文 |
| 产物 → 工作台 | `page-create-error` | `request`、`error` | 正文保存或创建确认失败，保留草稿并解除创建中的状态 |
| 产物 → 工作台 | `position` | `section`、`step`、`trail`、`view?` | 位置变化时发出，至多每 150 ms 一次 |
| 产物 → 工作台 | `narrate` | `section`、`step`、`navigate?` | 兼容步骤目标的请求；`navigate: false` 只同步位置，保留当前编辑器焦点与画布位置。文档编辑不据此打开讲稿、字幕或切换入口 |
| 产物 → 工作台 | `picked` | `section`、`block?`、`step?`、`trail?`、`rect?`、`point`、`clicks` | 点选的结果；点在块上时带块出现的步骤（页面自己的步号）与那一步的 `trail`，同 `position`。`rect` 是所点的块（没有块时是节）的框，`point` 是鼠标的位置，都在 iframe 的视口中，单位为 CSS 像素；`clicks` 是连击的次数（1 到 3），双击依次报告 1 与 2 |
| 产物 → 工作台 | `selection` | `{ section, block?, text, rect?, obstacles? }` 或 `null` | 页面中的文字选中，供焦点带上（8.2 节的 `quote`）。`rect` 是选区的框（选区没有框时取它最后一行的框）。已有 IR 锚点的正文选区可报告，新块待保存确认后才可批注；原生文本镜头编辑期间不报告。`obstacles` 为至多 16 个可见编辑工具区的框，使用相同视口坐标，供宿主避让 |
| 产物 → 工作台 | `rect` | `rect`：框或 `null`、`obstacles?` | 跟随的对象在页面滚动（任何滚动区域）或尺寸变化后的框，供工作台把工具条留在它旁边；完全移出视野或已不在页面中时为 `null`。跟随的对象是最近一次点选的块，直到再次点选或有了非空的选区；有选区时是选区，选区清空后不再跟随。没有跟随的对象时不发，框与编辑工具避让区均不变时也不发 |
| 产物 → 工作台 | `editing` | `target`、`active` | 就地编辑开始（`true`）或结束（`false`）；找不到要编辑的元素时立即回答 `false` |
| 产物 → 工作台 | `edited` | `target`、`before`、`after`、`request?`、`revision?`、`binding?` | 新流程后三项必须一同提供。请求冻结本次输入版本；元素恢复原有富文本 DOM，待确认文字保留在目标旁的草稿中。宿主重新核对目标语义、编译时源码指纹、当前源版本与新编译结果。旧版省略后三项的报告仅保留兼容保存路径 |
| 工作台 → 产物 | `edit-result` | `request`、`target`、`revision?`、`binding?`、`error?` | 只向原预览实例和代次回复一次。成功成对返回已确认的修订与新语义指纹；仅确认同一输入版本，有后续输入时推进其来源基线而不清空新文字。失败保留可重试、复制或明确放弃的草稿 |
| 产物 → 工作台 | `updated` | `revision` | 页面换上了新的 IR。工作台据此重新加上高亮与焦点的标记，并判断预览是否已反映刚保存的源码 |
| 产物 → 工作台 | `report` | `level`（`error` 或 `warning`）、`plugin?`、`message`、`resolved?` | 页面中的运行时问题；`resolved: true` 清除同一问题。工作台按预览实例报告到诊断接口 |
| 产物 → 工作台 | `presentation-action` | `action`（`refresh` 或 `exit`） | 只接受当前选中且活动的预览窗口。重新编译交给当前工作区的已保存版本编译流程；退出先暂停并同步位置，再恢复文档编辑器。 |
| 产物 → 工作台 | `shortcut` | `command`（`undo`、`redo` 或 `dismiss`） | 预览获得键盘焦点后，转发撤消、恢复或关闭工具条的意图；正文优先使用原生历史，再按保存边界回退到源码版本。页面自己的输入框与就地编辑中的按键不转发。只传这三种意图，经原有来源、nonce 与文稿身份检查 |

文档编辑的撤消和恢复优先使用当前正文编辑器的原生历史。页面重命名、移动，以及已保存源码版本的撤消、恢复或回退，先发送 `flush` 并等待已提交的串行写入，再执行操作；不在写入队列内部等待预览保存，避免正文回调等待同一个队列。文档编辑不提交或阻塞于保留的视频讲稿草稿；视频操作可以显式请求额外的讲稿保存边界。

保存确认绑定文稿、目标、提交版本、预览实例与代次，失败或过期回调均不表示新输入已保存。工作台沿用现有 IR 订阅；等待写回后的新 IR 使用有界的条件读取，不为每次保存新增 SSE 连接。

切换文稿后，已经派发的正文写入仍核对原文稿的 IR 与源码版本，并只向原预览实例的原代次回复。它不会改动当前文稿的保存状态。尚未写入的过期请求明确取消；暂停的预览保留草稿与待确认写入，不发起下一次写入，恢复并完成握手后再继续。

提交后的原生文字请求也属于原文稿，不因切换文稿而静默丢弃。`previewEditBinding` 比较目标的内容、角色、步骤和范围，忽略无关行号变化；`IrAnswer.sourceFingerprints` 再核对行图实际解析过的源码。请求回复不作为可重播状态。宿主可短暂保留已完成请求的回执，但重试仍须核对请求内容、目标指纹与已确认的源码版本；不能用旧回执清除新输入。浏览器恢复的原生文字草稿需明确确认后重试，缺少版本能力或不能安全写回时继续保留输入。

### 4.4 坐标与步骤

- 章节与块用 IR 的 ID。ID 在实时更新中保持不变（块被改写时可能移动，见 8.7 节）。
- 步号：`position`、`picked` 的 `step` 是页面自己的步号，都带 `trail`，工作台用内核的 `trailStep` 换算成完整文稿的步号；`go` 要按完整文稿的步号定位时带上 `trail`（由 `stepTrail` 得出），只带 `step` 时按页面的步号。幻灯片形态中只给其他渲染端的块不占步骤，两种编号因此可能不同。控制通道用的是同一种换算。
- `position` 的字段与控制通道报告的位置相同（章节、步骤、`trail`、视图），两处用同一套换算。
- 产物在 DOM 上写锚点：网页有 `data-section`、`.pm-block[data-block]`、`data-step`；幻灯片由 `render-slides` 在生成的文稿中写上同样的块级锚点，静态构建中同样存在，无害。

### 4.5 安全

- **产物页面与工作台不同源。** iframe 来自工作区服务的端口；dsh 的栅栏对外来的 `Origin` 返回 403。页面中的脚本，包括第三方插件，不能借用户的 dsh cookie 发起会话或回答确认，也读不到工作台的 DOM。
- **草稿复制。** 预览 iframe 只向其 `src` 的源委派 `clipboard-write`，让作者点击恢复操作时复制正文或旧草稿备份；不委派 `clipboard-read`，也不扩大宿主响应头的权限范围。
- **限制谁能嵌入预览。** 工作区服务给预览页面加 `Content-Security-Policy: frame-ancestors <允许的来源>`；没有允许的来源时是 `'none'`。只装 bundle、不经 studio 运行 dsh 时，`presmium-service` 自己启动的服务没有 `--preview-origin`，工作台的预览因此不能显示。
- **双向核对来源。** 工作台只接受 `event.origin` 是工作区服务的源、`event.source` 是那个 iframe 的窗口、并且带同一个 nonce 的消息；代理同样核对。

### 4.6 实现位置

| 部分 | 位置 |
|---|---|
| 消息类型与 `PREVIEW_PROTOCOL = 1` | `packages/kernel/src/contracts/preview.ts`；产物与工作台都只依赖这里 |
| 网页与幻灯片的预览代理 | `packages/web/src/client/preview-frame.ts`（幻灯片是同一个页面）：用 IR 运行时的 viewer 跳转、取位置、找章节与块的元素，实现 `marks`（`packages/viewer/src/client/markdown/role-mark.ts` 的 `PmRoleMark` 看它） |
| 工作台一侧 | `@lincyaw/workbench` 的预览面板 |
| 静态构建 | 不带预览代理；用例扫描构建产物 |

### 4.7 与控制通道的关系

控制通道（`/__presmium/presmium.server/control`）经过服务端，服务于 MCP 的 `navigate` 与 `get_position`、确认与课堂；预览协议只在浏览器内传递。预览页面由服务提供，它连接控制通道，所以外部 agent 照样看得到它的位置，也能让它跳转，外部 agent 发起的操作类工具的确认也出现在预览页面的工具栏中。dsh 会话的工具调用不经这里：它们的令牌是主机已确认的（5.3 节），确认由 dsh 处理（6.3 节）。

## 5. 工作区服务的接口

工作台经这些接口取得 IR、构建与开发服务。工作区服务的路由挂在 `/__presmium/presmium.workspace/` 下；服务端自己的路由在 `/__presmium/presmium.server/` 下。会话令牌与焦点的路由属于服务端（`@lincyaw/server`），不在工作区的路由中：`MCP_ENDPOINT` 是服务端的服务，焦点与放映位置一样由服务端保存。

### 5.1 路由

| 路由 | 作用 |
|---|---|
| `GET documents`、`POST documents` | 文档列表、编译状态与章节；新建、重命名、复制、删除 |
| `GET files`、`GET source`、`POST source` | 列出文件；带版本的读写，冲突时 409，加锁（`architecture.md` 5.11 节）。git 仓库中的保存在持有文档锁时随即提交这一个文件（来源 `editor`），回答带这个 `revision`：说明是请求的 `message`（去掉首尾空白后的第一行，至多 200 个字符），没有时按文件所在文稿的 `lang` 写成 `编辑 <文件名>`（`lang` 缺省或以 `zh` 开头）或 `Edit <文件名>`。内容不变、文件被 git 忽略时不提交；提交失败时文件恢复原样，保存失败 |
| `POST source/transaction` | 小批量源码保存：`changes: [{ path, content, base }]` 与可选 `message`，`base` 是打开时的版本，`null` 表示只创建尚不存在的新文件。至多 16 个文件，总 UTF-8 内容不超过源码编辑上限，所有文件属于同一文档；先校验全部路径、权限与版本，再在一个文档锁和 git 队列中保存并提交一次。写入或提交失败时恢复原文件、移除本次新建文件并恢复 git 索引。回答每个文件的 `version` 与可选的单个 `revision` |
| `GET pages/delete`、`POST pages/delete` | `IrAnswer.authoring.deletePage` 为真时可用。GET 按 `section` 返回绑定源版本和 IR 修订的 `PageDeletePlan`，含实际步骤／讲稿数量、最后一页标记与引用限制。POST 接收 `{ section, revision, base }`，重新检查来源、当前与相关文稿的显式引用、共享 include、源指纹及版本，再移除完整页面；不删素材文件。编译确认其他页的 ID、内容和绑定保持后才记录单次历史；失败恢复原源码。最后一页清空并保留原 ID。独立讲稿、外部绑定和来源不明的范围拒绝删除 |
| `GET changes`、`POST changes/commit`、`POST changes/discard` | 未提交的修改（工作台之外的写入） |
| `GET revisions`、`POST revisions/revert` | 修改历史（新的在前）与撤销其中任一个修改；`revisions` 另给出下一次撤销与重做收回的修改 `undo`、`redo`，按文档的整个历史计算，不受 `limit` 截断 |
| `POST history/undo`、`POST history/redo` | 按修改撤销与重做，请求体 `{ expect? }`。从旧到新看文档历史中的 Presmium 修改：普通修改压入撤销栈并清空重做栈；撤销一个修改把它移出撤销栈，这次撤销压入重做栈；重做（撤销一次撤销）把那次撤销移出重做栈，原来的修改放回撤销栈；文档操作清空两个栈，撤销按钮不收回它与它之前的修改。`undo` 是撤销栈顶的修改，`redo` 是重做栈顶的撤销。服务在 git 锁中取目标：没有可撤销或重做的、`expect`（读到的 `undo` 或 `redo`，可以是前缀）不是当前目标时 409；之后与 `revisions/revert` 相同，回答 `RevertResult`，冲突时 409 |
| `GET ir?document=` | 文档的 IR、修订号与诊断 |
| `GET ir/events?document=` | SSE，由服务直接流出、不缓冲：连接后先发当前的修订号，之后是新的修订号、诊断数与改过的文件（相对于工作区根目录）。编辑器据此与磁盘比较 |
| `GET preview?document=[&view=web\|slides][&prefetch=1]` | 文档的预览地址：`web` 是查看器显示这份文档的页面（作者打开文档时等查看器与文稿的代码准备一会儿，还没好时是文档在站点上的页面），文稿有幻灯片形态时 `slides` 是同一个页面加 `form=slides`；页面带预览代理。`view` 只能是 `web` 或 `slides`，回答相同。文稿的渲染端配置变化后刷新可选形态。`prefetch=1` 是工作台在作者打开之前的预先准备：立刻答复，查看器还没准备好时在后台准备（`architecture.md` 1.1 节） |
| `POST build`、`POST check` | 构建（写到工作区之外的服务状态目录，`architecture.md` 10.6 节）与检查 |
| `GET jobs`、`POST jobs` | 列出可用输出与生成记录；POST 使用 `StartJobRequest { target, source: { version, fingerprint } }`，确认当前规范文稿的保存版本与精确文本指纹后重新编译，并校验编译实际读取的源码。版本不符回答 409，不入队。`CompileJob.source` 记录此次已确认来源，`revision` 单独标识派生 IR；旧历史未记录来源时不能标作当前版本 |
| `POST jobs/cancel`、`GET jobs/events` | 取消已入队任务与跟随真实任务状态。等待文稿保存阶段的取消只撤销前端导出意图，不撤销已经发出的正文保存 |
| `GET review?document=`、`POST review/open`、`POST review/step`、`POST review/accept`、`POST review/reject`、`POST review/restore` | 审阅（git 实现，6.5 节）：打开（bundle，持有者 `agent:<会话>`）、记检查点、查看、接受（可以带作者写的说明）、拒绝（给出文件时只恢复它们、审阅继续，不给时全部回滚）、回到某个检查点。`GET review` 以 `text/event-stream` 请求时是页面跟随 |
| `GET review/events` | SSE，供 bundle：审阅的变化，以及撤销一个会话的提交 |
| `presmium.server/tokens`（`POST`、`DELETE`） | 为一个 dsh 会话签发或作废会话令牌（5.3 节） |
| `presmium.server/focus`（`GET`、`POST`） | 工作台报告焦点与批注，服务把锚点换成源码范围与摘录并保存（8.6 节） |
| `presmium.server/diagnostics`（`GET`、`POST`）、`GET presmium.server/diagnostics/events` | 读取当前诊断、替换一个预览实例的诊断，以及订阅完整快照（5.4 节） |
| `/mcp` | MCP，供外部 agent 与 bundle 使用 |

工作台开始导出前，先等待当前文稿的源事务确认；组字、恢复待确认、未采用的时机输入或保存冲突会保留草稿并拒绝导出。等待期间切文稿使原导出意图失效。服务捕获已确认的编译结果和实际工程依赖（包含译本文稿及其依赖），复用任务时同时比较源版本、IR 修订和依赖指纹；任务运行前后核对已记录的工程文件，变化则任务失败并移除此次产物。记录中的“文稿保存版本相同”只比较规范文稿，不宣称工程文件和任何后续编辑均已进入旧产物。

### 5.2 `presmium serve` 的页面

- 页面只加载文稿列出的插件，没有编辑界面；
- 首页是文档卡片，与静态的工作区站点相同；
- 产物的开发服务器带预览代理，允许的来源来自 `--preview-origin`。

`presmium dev` 是一份文稿的实时预览，同样没有编辑界面。

### 5.3 服务令牌与会话令牌

- **服务令牌**：studio 中，启动器生成一个随机值，经环境变量 `PRESMIUM_SERVICE_TOKEN` 交给工作区服务与 dsh 宿主（不放在命令行，`ps` 看不到）。设置了它时，工作区的路由与 `tokens`、`focus` 的写入要求 `Authorization: Bearer <服务令牌>`；产物页面自己的 `/__presmium/<插件>/` 路由（讲授、课堂、远端环境的代理）只检查 `Host` 与 `Origin`。这样预览页面中的脚本不能用工作区的路由改源码。agent 与服务同一 uid，能读到这个值，所以它只是纵深防御；`architecture.md` 9.4 节的残余风险不变。
- **会话令牌**：bundle 为每个 dsh 会话向服务端取一个 MCP 令牌（`POST tokens` `{ document, session }`），令牌绑定本机作者与文档，模式为“主机已确认”：经它调用的操作类工具不再经 `APPROVALS` 向页面窗口请求确认，因为 dsh 的 `tools/pre-execute` 已经按 Presmium 的策略决定过（6.3 节）。会话令牌只签发给启动服务的主机：没有设置 `PRESMIUM_SERVICE_TOKEN` 时 `tokens` 一律 403，产物页面中的脚本因此拿不到不经确认的令牌。会话结束时 bundle 作废它；dsh 宿主退出时服务作废全部。契约：`MCP_ENDPOINT.issue` 有可选的第三个参数 `{ confirmed: true }`（`packages/kernel/src/contracts/server.ts`）。

### 5.4 当前诊断与主动通知

工作区服务维护一份当前诊断，契约在 `packages/kernel/src/contracts/diagnostics.ts`。`Diagnostic` 保留检查 ID、严重程度、消息、源码位置与建议，增加稳定的 `id`、文档、来源和可选的形态与源码修订号；源码文件相对于工作区根目录。`DiagnosticSnapshot` 带单调递增的 `version` 和当前诊断数组。

编译、显式检查、预览启动、浏览器运行时与插件服务分别替换自己的诊断。新编译使旧修订的检查和运行时诊断失效；预览恢复或实例退出清除对应贡献，旧修订的异步结果不能覆盖当前诊断。相同问题具有相同 ID，多个实例报告的相同问题合并显示。存储不保留历史事件。

网页工作台订阅 `diagnostics/events?document=<目录>`：连接和重连先收到当前快照，此后在诊断变化时接收新的完整快照。预览的 `POST diagnostics` 带 `document`、`renderer`、`instance`、`revision` 与 `findings`；空集合清除该实例的问题。设置服务令牌时，诊断的读取、订阅和写入都要求服务令牌，经 dsh 的现有代理访问。

MCP 的 `presmium://diagnostics` 与 `?document=<目录>` 读取同一快照；资源更新通过 MCP 通知送达订阅者，并遵守会话令牌的文稿范围。读取资源不运行完整检查；`get_diagnostics` 仍是显式运行编译与插件检查的工具。stdio 没有浏览器服务，读取资源时编译当前文稿，完整检查同样由工具触发。

dsh 订阅当前文稿的资源，并在模型步骤前读取快照确认可达性。当前上下文包含至多 20 条具体诊断及剩余数量，每次替换；文稿切换解除旧订阅，读取失败明确标为不可用。工作台的问题列表消费同一快照，预览模式也显示错误摘要；“让 AI 处理”由作者明确点击后提交给当前会话。通知本身不启动模型任务。整个工作区服务不可用时，由启动器与 dsh 宿主报告服务故障。

## 6. bundle `@lincyaw/dsh`

### 6.1 包的形态

- `package.json`：
  - `dsh.bundle`：bundle 层 `cordis.patch.yml`，全部载体都有的行，含 `!!js` 的配置；
  - `dsh.client`：`platform: 'web'`，导出预编译的客户端部分；
  - 出口：`.` 是 `presmium-workbench` 行的宿主部分，`./client` 是预编译的客户端包，其余各行各有一个出口，`./launch` 供启动器传入补丁；
  - `engines.dsh` 与对 `@deepseek-ai/dsh-*` 的精确对等依赖。dsh 在安装与启动时都检查它们，不满足时拒绝。
- 宿主部分：每行一个普通 ESM 的入口文件（`entries/`），入口用 jiti 加载 `src/node/` 中同名的 `.ts` 源码。
- 补丁：dsh 的一个包只有一个 bundle 层，只在某个载体中出现的行因此放在另外的补丁中，由启动器以 `--patch` 传入（`@lincyaw/dsh/launch`）：`profile.patch.yml`（全部载体：隐私、技能、第一次使用、沙箱、persona，6.6 节）与 `web.patch.yml`（web 载体：`presmium-workspaces`、`presmium-routes`、`presmium-workbench` 三行与它们的设置、内置的 `preset-authoring` 预设，以及界面上关掉的行）。headless 与 acp 载体不带 `web.patch.yml`，启动时不警告有行没有激活。
- 技能：源只有 `.agents/skills` 一份，打包时复制进包内（副本不入库）；`scripts/check-skills.mjs` 核对 bundle 登记的技能都在源中。

### 6.2 宿主部分的行

| 行 | 载体 | 作用 | dsh 接口 |
|---|---|---|---|
| `presmium-service` | 全部 | 给出工作区服务的地址与服务令牌：启动环境中带着它们时（studio）直接用，否则自己启动 `presmium serve` 并监管它。服务在自己的进程组中，父进程退出时随之结束 | `ctx.effect` |
| `presmium-workspaces` | web | 只把启动时的工作区根目录登记为 dsh 工作区；文稿是其中的内容，不各自登记。`ctx.workspaceRegistry` 只在 web 的组合中有；headless 与 acp 的会话就在 dsh 启动的目录中 | `ctx.workspaceRegistry` |
| `presmium-tools` | 全部 | 第 9 节的 dsh 适配器：按当前选中的文稿登记工具，每一步前更新为 `presmium__<名字>` | `agent/created`、`agent.ctx.tools.register`、`defineTool` |
| `presmium-policy` | 全部 | 确认的映射（6.3 节） | `tools/pre-execute`、`ctx.tools.guard`、`approval/request` |
| `presmium-context` | 全部 | 指南放进 system 消息；文稿快照与焦点按界面选中的文稿取得，每一步之前重读（6.4 节） | `ctx.systemPrompt.section`、`context`、`agent/pre-step` |
| `presmium-skills` | 全部 | 登记 `presmium-author` 等技能 | `ctx.skills.register` |
| `presmium-turns` | 全部 | 第一次写文件之前取锁并打开审阅，每个工具调用之后记检查点，接受时提交；撤销后通知会话（6.5 节） | `tools/execute`、turn 事件、`workspace/changes`、`Agent.inject` |
| `presmium-telemetry` | 全部 | 运营者的观测数据（6.7 节）：配置了 `PRESMIUM_TELEMETRY_URL` 时，把每个会话的全部事件与工作台报告的作者操作经 OTLP 发给运营者的采集端；没有配置时什么也不建、不发 | `ctx.otel.createSessionLogReporter`、`createEventReporter`、`session/event`、`ctx.provide('presmiumTelemetry')` |
| `presmium-routes` | web | 把 `/api/presmium/*` 转到工作区服务与服务端（精确路径，必须在 `/api` 下），流式的回答原样返回 | `ctx.connection.fetch.register`、`admit()` |
| `presmium-workbench` | web | 客户端部分：根布局插件、面板、主题、品牌、语言；网页标题与图标；精确路由 `/api/presmium/workbench`（回答 `{ mcp }`，即工作区服务的 MCP 地址，供首页的 MCP 卡片）与 `/api/presmium/telemetry`（作者的操作，交给 `presmiumTelemetry`，6.7 节） | `dsh.client`、`ctx.webServer.tapIndex`、`ctx.connection.fetch.register` |

客户端的行是包名本身：dsh 的模块系统只把名字是整包名（`@lincyaw/dsh`）的 Loader 行当作客户端的来源，`@lincyaw/dsh/<行>` 这样的子路径不算，一个包也只能有一个这样的行。所以 `presmium-workbench` 行的 `name` 是 `@lincyaw/dsh`。

网页中的会话固定在启动时的工作区根目录，文件读写与沙箱边界覆盖整个工作区，审阅也覆盖同一范围（6.5 节）。打开、关闭或切换文稿不切换 Harness workspace、会话或 cwd；客户端经认证路由 `POST /api/presmium/context` 将 `{ session, document }`（关闭文稿时 `document: null`）交给适配器。当前文稿只决定文稿工具、快照和焦点；会话空闲后更新工具登记与 MCP 会话，每一步前重读快照，运行中的工具调用保留原来的文稿。headless 与 acp 未显式选择文稿时仍按会话目录匹配，兼容从单篇文稿目录启动的用法。

### 6.3 确认的映射

| Presmium 的设置或范围 | 在 dsh 中 |
|---|---|
| 种类的策略为 `off` | 不登记对应的工具，与 MCP 不列出它的做法一致 |
| 策略为 `allow` | `tools/pre-execute` 直接返回 allow，不经回答者：经回答者放行的调用在完全访问模式下会被 dsh 的回答者拒绝 |
| 策略为 `ask`（默认） | pre-execute 返回 ask，`displayReason` 写 Presmium 按文稿语言给出的说明（如“构建文稿（web）”）与简短的摘要（哪一节、哪一块），由 dsh 的确认卡片回答；授权只一次有效 |
| `content` 范围：工作区目录中的写入 | 会话固定在工作区根目录，`workspace-write` 允许整个工作区内的文件读写；文稿切换不收缩这个范围 |
| `workspace` 范围：shell、网络与工作区目录之外的写入 | dsh 的沙箱与策略询问；文件工具写到会话目录之外时，bundle 也返回 ask，运营者目录除外 |
| 运营者目录 | `ctx.tools.guard` 拒绝，文件不会写出，完全访问模式（确认策略 `never`）下也成立。guard 先于 pre-execute 的监听者执行；pre-execute 对这些调用返回 ask 时，拒绝会来自回答者而不是 guard，所以 policy 把运营者目录中的路径留给 guard |
| 完全访问模式（`danger-full-access`） | 允许用户选择；界面说明 Presmium 的 `ask` 在这个模式下会被拒绝，`allow` 与 guard 照旧生效 |
| 工作区服务自己的 `APPROVALS` | 会话令牌是主机已确认的，服务不再把确认发往页面窗口 |
| 确认超时 50 秒 | 不需要：dsh 的确认一直等待，晚连上的客户端也能回答 |

策略的唯一来源是服务端（工作区配置的 `approvals`、`presmium dev --allow`）：MCP 对会话令牌列出的操作类工具在 `_meta` 中带上种类与策略（`presmium/kind`、`presmium/approval`），bundle 按它们映射，不读 `presmium.workspace.yaml`。

已知的限制：dsh 的回答者看不到工具的参数（所以 `displayReason` 带摘要，完整的参数在对话中工具调用的显示里）；确认只能在打开着的 turn 中发出；授权只一次有效。

### 6.4 文稿上下文与技能

`presmium-context` 在每次 agent 步骤前读取当前文稿、位置、关注内容和 `get_runtime`。`get_diagnostics` 说明源码与检查问题，`get_outputs` 是编译时录制，`get_runtime` 是作者浏览器实际报告的运行状态，两者不能混为一谈。运行反馈经已有 `STATUS` 与控制通道上报：宿主的 `presmium.runtime` 包含插件启动和组件错误，执行插件的 `presmium.exec` 包含有限条现场运行与会话重置摘要。反馈带报告时间和代码位置，不带源码或二进制图像；错误和文本输出受长度限制。自动上下文仅保留最近两扇窗口、每扇窗口最近三次运行和失败状态，完整数据用工具读取。

浏览器反馈是观察数据，不是指令，也不能证明刚修改的源码已验证。修改后重新运行相关代码、检查实际输出；独立 Python 文件用解释器或对应测试验证，不能只看讲义诊断。没有作者窗口或窗口已断开时明确返回无反馈。服务只提供当前文稿内 editor/owner 窗口的快照，不收集学生个人数据。


- **指南**：一段固定的说明放进 system 消息，描述系统而不规定步骤：东西在哪（工作区根目录是工作目录；文稿的入口、形态与其他文件；`dist/` 与 `.presmium/` 不是源码；工作区自己的 AGENTS.md 说明它特有的约定；上下文中的路径都相对工作区根目录，Presmium 工具中文稿的路径相对文稿目录，诊断的除外），agent 负责什么（照作者的要求做，不多做：问题就回答、不改文件，修改只改要求的地方，不清楚就先问；修改由作者审阅，自己不提交），哪个工具说明什么（保存后预览自动重新编译，上下文中的诊断是最近一次保存的结果；`get_section` 看编译后的文字；`get_diagnostics`、`get_outputs`、`get_runtime`、`run_code`、`build` 各自证明什么；沙箱只能写工作区之内）。技能何时加载也在其中。web 载体中 agent 面对的作者与说话方式由内置预设 `preset-authoring` 的 persona 说明（6.6 节）。
- **文稿快照**：网页会话按界面选中的文稿获取上下文，会话工作目录始终是工作区根目录；未选择文稿时明确告知模型。快照包含标题、语言、入口文件、形态与插件、文稿目录中的文件、工作区的其他文稿、章节（ID 与标题）、具体诊断（5.4 节）、本轮开始时作者的位置、当前的焦点（8.6 节，源码路径换算为相对工作区根目录）与浏览器反馈；路径都相对工作区根目录。bundle 在每一步之前（`agent/pre-step`）经 MCP 更新上下文，诊断同时通过订阅失效通知刷新。dsh 在上下文有任何变化时整份重发，所以作者的位置每轮只取一次，浏览器反馈只在有插件未启动、组件错误或现场运行时列出窗口：作者在 agent 工作时滚动文稿不会让上下文重发。上下文与工具一样登记在 agent 的作用域中。
- **技能**：在运行时登记（`ctx.skills.register`）。skill-filesystem 的 `agentsHome` 固定到 Presmium 状态目录中的空目录，用户的 `~/.agents/skills` 不进入技能目录；文稿项目自己的 `.agents/skills` 保留，它是作者自己的材料。项目中的同名技能会覆盖 bundle 的那份，这一点写进技能的说明。

### 6.5 turn、审阅与提交

整个工作区对应 dsh 的工作区，对话对应 dsh 的会话；一次接受的审阅是一个提交（默认每个 turn 结束时自动接受），撤销用 `git revert`。

1. **开始**：会话第一次调用会写文件的工具（文件工具与 shell）时，bundle 在 `tools/execute` 中为整个工作区打开审阅（`POST review/open`，持有者 `agent:<会话>`），未选择文稿时同样。它在确认之后、工具执行之前运行，被拒绝或被策略否决的调用不打开审阅，也不持有锁。审阅持有工作区锁，与其他会话、文档审阅、保存及文档操作互斥；取锁失败时工具不执行。打开是幂等的（同一会话得到同一个审阅），所以每次写入之前都问一次服务，宿主不必记住审阅是否还开着。快照包含工作区中当时还没提交的修改；从文稿目录启动的 headless 与 acp 会话也使用工作区范围。
2. **进行中**：审阅开着时（turn 运行中；`required` 时直到作者接受或拒绝），工作区内的编辑器保存得到 409，并提示 AI 正在修改或修改在等待审阅；所有文稿的审阅面板显示同一份会话审阅。后面的 turn 继续累加进同一次审阅；每个工具调用完成时记一个检查点，标签是工具与文件或命令。服务给出 turn 的范围（`turns { from, to }`）与是否有 turn 在运行。一个 turn 结束时审阅没有改动（例如 shell 只运行了 `ls`）就结束，释放锁。
3. **审阅与每个 turn 的修改**：一次审阅覆盖会话在它期间的全部 turn；dsh 的 `workspace/changes` 记录每个 turn 改了哪些文件，同一个 turn 中它与审阅的改动相同（构建的产物两边都没有）。审阅是修改的唯一来源；工作台按审阅的差异在文稿上标出 AI 改了哪里，对话中不显示 dsh 的修改卡片（`ui-deliverables` 关掉）。
4. **审阅**：`settings.presmium.assistant.review` 为 `auto`（默认）时，改了文件的 turn 结束就接受并提交，不等作者，作者用撤销收回（5.1 节的 `history/undo`）；为 `required` 时，作者在工作台的审阅面板中接受：面板列出自快照以来的全部文件，作者可以全部接受、拒绝某些文件，或回到某个检查点。`review` 与 `reviewTimeoutMs` 由工作区服务按 `settings.presmium.assistant` 执行，bundle 不读它们；超时只在没有 turn 运行、也没有页面跟随（`GET review` 的 SSE）时计时。作者在 turn 之间接受之后，下一次写入开一个新的审阅。
5. **提交**：一次接受形成一个提交，成功后才结束审阅、删除记录并释放锁。提交失败时返回错误并保留审阅，作者可以重试或拒绝。尾注是 `Presmium-Origin: agent`、`Presmium-Task`、`Presmium-Session: <会话>`、`Presmium-Turn: <起>-<止>` 与 `Co-authored-by`。
6. **撤销**：`git revert`，尾注 `Presmium-Revert`；会话的提交与编辑器的保存在同一个撤销栈中（5.1 节）。撤销会话的提交之后，bundle 经 `Agent.inject`（`dsh-agent` 的公开接口）给会话注入一条 user 角色的通知，来源是 `{ kind: 'presmium', form: 'notice' }`，正文以 `[Presmium]` 开头。它不唤醒 agent，在会话的下一步进入模型请求，并作为 `session/projections` 的 `inbox` 中的待处理消息可见；agent 不在时等它被创建或恢复再注入。dsh 文件工具的“先读后改”规则会拦住基于旧内容的编辑。
7. **记录**：审阅记录由工作区服务保存，另记会话、turn 的范围、检查点与各步。服务关闭或崩溃时会话的审阅不回滚，下一个服务进程启动时恢复它并重新持有锁。记录的范围不是当前工作区时，启动拒绝并保留记录与快照；先用能识别该记录的版本接受或拒绝，再启动服务。dsh 宿主重启后每个 turn 的修改记录没有了，审阅仍在，可以经新宿主接受。Presmium 不依赖 dsh 只在内存中的修改摘要，它在宿主重启后返回 404。
8. **构建**：agent 经工具发起的构建由工作区服务写到工作区之外的服务状态目录，不进入审阅与每个 turn 的修改记录。

服务以 git 审阅回答 `CHANGE_REVIEW`。

### 6.6 profile 补丁与隐私默认值

启动器每次启动都以 `--patch` 传入 `packages/dsh/profile.patch.yml`，web 载体另加 `packages/dsh/web.patch.yml`（6.1 节；两者随 bundle 发布）。`--patch` 在 profile 自己的补丁与 `$DSH_HOME/cordis.patch.yml` 之后生效，用户在 dsh 界面中的改动（写进 profile 的 `cordis.patch.yml`）因此不能把隐私相关的行重新打开，启动器也不改写 profile 的补丁。

- **隐私**：关掉 `session-log-deepseek`、`session-telemetry-otel`、`plugin-package-inventory-deepseek` 三个上传行；环境变量 `DSH_TELEMETRY_MODE=DISABLED`。这些上传随每个模型请求带出（`dsh_session_log` 一次约 69 KB、`dsh_plugin_packages`），所以“没有出站连接”说明不了问题；没有模型时零请求的前提也是关掉这三行。运营者自己要收集数据时用 Presmium 的观测数据（6.7 节），发往运营者配置的采集端，不经 DeepSeek。
- **技能**：skill-filesystem 的 `agentsHome` 与环境变量 `DSH_AGENTS_HOME` 都指向 Presmium 状态目录中的空目录。
- **第一次使用**：工作区控制器的 `documentsDirectory` 指向 Presmium 的状态目录，并在启动时登记好文档的工作区。两者都做到，第一次使用就不会在 `~/Documents` 下建目录。
- **沙箱**：`workspace-write`，确认策略为 ask。
- **persona**：headless 与 acp 的 persona 是 `system-prompt` 行的 `personaPrefix`，补丁整体替换这一行的配置，换成 Presmium 的说明。web 载体用 `web.patch.yml` 中声明的预设 `preset-authoring` 承载工作台中的角色：作者是可能不懂代码的教师，只看到读者看到的文稿；作者的消息与批注就是要做的事；按作者看到的内容说话，不提文件、路径、行号、语法、命令、工具、沙箱与 git。`agent-preset-registry` 默认使用该预设；预设内的 `persona` 行遮蔽部署级的 `personaPrefix`，所以两段文字各自完整。写作的发布会原则在 `presmium-author` 技能中，改写内容时加载。预设只带写讲义需要的工具，不带定时任务、目标与子 agent（含 workflow）。dsh 自带的 `preset-standard` 等仍可选，选中时仍是“You are a coding agent powered by …”。
- **界面**（`web.patch.yml`）：关掉 `ui-layout` 与 `ui-sidebar`（由 Presmium 的根布局与导航外壳替换；退路模式下同时重新打开）、`ui-brand-official`、`ui-settings-account`、`account-controller`、`deepseek-account`、`llm-deepseek-account`、`web-search-deepseek`（DeepSeek 的搜索服务）与 `ui-settings-session-log`（上传会话日志的设置）。插件页中的实验插件与插件市场没有可关的行：它们是 dsh 安装自带的可选 bundle 与按需的官方目录，由插件页的“实验插件”组列出；工作台按这个组的 DOM 属性 `data-plugin-group="extensions"` 隐藏它。确切的行 ID 以锁定的版本为准，由升级闸门第 1 组核对；这个属性由第 3 组核对。

### 6.7 观测数据

运营者（例如做研究的团队）需要分析作者怎样使用工作台、AI 怎样完成每个请求时，在启动 `presmium studio` 的环境中配置自己的 OTLP/HTTP 日志采集端：

| 环境变量 | 作用 |
|---|---|
| `PRESMIUM_TELEMETRY_URL` | 采集端的日志地址，如 `http://collector:4318/v1/logs`；没有它时不采集，页面也不记录 |
| `PRESMIUM_TELEMETRY_HEADERS` | 发往采集端的请求头，`键=值,键=值`，值按 URL 编码（与 `OTEL_EXPORTER_OTLP_HEADERS` 相同），如 `authorization=Bearer%20<令牌>` |
| `PRESMIUM_TELEMETRY_USER` | 可选，资源属性 `user.id`：这台机器的使用者在研究中的代号 |

`presmium-telemetry` 行用 dsh 的 `otel` 服务建两个各自排队、批量发送、重试的通道，资源属性是 `service.name=presmium-studio`、版本、`presmium.installation.id`（状态目录中的随机 ID，区分不同的安装）与可选的 `user.id`。dsh 自己的 `session-telemetry-otel` 只在用户提交反馈后上传，不适合持续采集，所以仍然关掉。

- **会话轨迹**：每个会话的每个事件（`session/event`：用户消息、系统提示与上下文、每一步的模型请求与回答、工具调用与结果、用量、turn 的起止……）原样成为一条 `session-log` 记录，格式与 dsh 自己的会话日志相同（`sessionId`、`content` 是事件的 JSON），另带 `presmium.turn`（所在的 turn）、`presmium.document`（会话当时的文稿）与 `presmium.workspace`。内容完整，不删减。
- **作者的操作**：工作台（`@lincyaw/workbench` 的 `OperationLog`）先问宿主是否采集（`GET /api/presmium/telemetry`），采集时按发生顺序记录作者的每个操作，每两秒或满 200 条批量交给宿主（`POST /api/presmium/telemetry`），页面隐藏或关闭时用 `sendBeacon` 补发；宿主检查名称与属性的大小后作为普通事件发出，事件名是 `presmium.workbench.<操作>`。每条带页面这次加载的 `presmium.client.id`、这个浏览器的 `presmium.browser.id`、顺序号 `presmium.seq`、当时的文稿、视图与模式。操作有：打开与关闭文稿，新建、复制、重命名、删除文稿，视图与模式的切换，在文稿中指向某处（节、块、步骤与选中的文字），就地编辑的开始、取消与保存（前后的文字、结果与耗时），批注的新建、状态与删除，交给 AI 的请求（改写、批注、修复；发出的文字），撤消、恢复、撤消某个版本、接受与拒绝审阅，从对话打开源码位置，作者在文稿中的位置（换节、换步或换视图时），快捷键，AI 的修改成立（改了哪些文件）与在文稿上闪烁的位置，以及页面上每个控件的点击（控件的名称、角色与所在区域）。
- **关联**：交给 AI 的请求（`agent.ask`）带 `dsh.session.id` 与 `dsh.request.id`。会话中这条请求的用户消息带同一个 ID（`content` 中的 `data.source.rpcId`），它所在的 turn（`presmium.turn`）的全部记录就是 AI 为它做的事；AI 的修改成立时的 `ai.change` 与 `ai.change.shown` 接在后面。作者直接在对话中输入的消息只在会话轨迹中。

交付是尽力而为：队列在内存中，采集端不可用时会重试，超出队列、进程退出（退出时最多等 3 秒）或页面关闭而 `sendBeacon` 失败时会丢失记录。会话事件同时保存在 dsh 的会话目录中，需要时可以据此补发。工作台界面中不提示采集；告知使用者由运营者负责。

## 7. 工作台

界面采用 [UI/UX RFC](rfc-workbench-uiux.md) 确定的文档编辑、编译放映、视频制作三个独立入口，覆盖先前的内容与编排双工作区方案。图标、术语、选择、草稿、时间线、窄屏和验收标准只在 RFC 中定义；本节保留 dsh 槽位、依赖与现有协议的实现说明。

### 7.1 包与依赖

| 部分 | 内容 | 可以依赖 | 不得依赖 |
|---|---|---|---|
| `@lincyaw/design` | 令牌、`pm-ui-*` 的类、字体、图标、令牌名 | 无 | 任何框架 |
| `@lincyaw/workbench` | React 面板与框架无关的逻辑 | `@lincyaw/design`、`@lincyaw/kernel`（类型与纯函数）、Radix Primitives、react 18（对等依赖） | `@lincyaw/host`、`@deepseek-ai/*` |
| `@lincyaw/dsh` 的 `src/client` | 根布局插件，把面板登记进槽位，主题、品牌、语言包 | `@lincyaw/workbench`、dsh 外壳的模块表 | 产物宿主接口 |
| `@lincyaw/dsh` 的 `src/node` | 第 6 节的各行 | `@lincyaw/mcp`、Node 库 | React、`@lincyaw/host` |

面板是 `@lincyaw/workbench` 导出的 React 组件，只有 `@lincyaw/dsh` 把它们放进槽位，所以同一批面板既能挂在根布局中，也能挂在 dsh 自带布局中。

### 7.2 根布局与退路

根布局插件声明 `root`，子槽位与 ui-layout 相同：`sidebar`、键控的 `main`（保留键 `conversation`）、`rightbar`、`shell.bottom`、`shell.overlay`、`shell.leading`。dsh 自己的插件因此不改就能挂上。只能整个替换 ui-layout：外壳只渲染 `root` 一个槽位，子槽位只能声明一次，`renderSlot` 只渲染调用者自己声明的子槽位。

导航外壳也只保留一套。`navigation-shell.tsx` 占据 `sidebar` 并声明会话浏览器、设置等公开子槽位，直接渲染 Harness 的 `sidebar.workspaces`，作为“对话记录”；设置的原生控制器保持挂载，由应用栏的唯一设置按钮打开。根布局另声明 `sidebar.panellist`，插件、自动化任务等全局入口收在应用栏右侧的“更多”菜单中，选中后在中央打开对应的全局面板；点应用栏路径中的文稿标题回到之前的文稿。原生 `ui-sidebar` 因此关闭，避免同一子槽位被两个所有者声明。

工作区只有一个：对话不提供选择别的工作区与别的 agent 预设，对话记录只列会话，不列它们上面的工作区一行。这些按槽位名与行键（`conversation.hero.agentPreset`、`sidebar.workspaces.directory…`、`data-row-key="workspace:…"`）隐藏，不按 Harness 生成的类名。

根布局插件还要重新提供：

- `ctx.layout`：`panelInfo`、`selectPanel`、`beginNavigation`、`toggleSidebar`、`openRightbar`、`closeRightbar`（ui-layout 的 README 写明了它们的行为）；
- 标准钩子 `usePanelInfo`；
- 主题呈现：调色板、字号、字体列表与令牌变量；
- 展开或收起对话记录的快捷键 `Mod+Alt+B`（与 ui-layout 相同；dsh 只许网页在 macOS 与 Windows 上用 Mod+Alt 组合，Linux 的网页上没有默认的按键）、跟随会话的文档标题、拖动柄、右侧列在宽度不够时的关闭协议（`canShow`）。

桌面的窗口装饰（`shell.leading`、`--dsh-frame-*`）留到做桌面时（11.6 节）。

布局如下：

| 区域 | 内容 |
|---|---|
| 应用栏（顶部，像编辑软件的标题栏） | 标志与所在位置的路径：文稿（回到文稿列表）、当前文稿的标题、打开的全局面板；右侧是 AI 助手、更多（插件、自动化任务）、设置（dsh 的设置与模型设置）与帮助。窄屏时路径只剩图标，用来在文稿列表、文稿与对话之间切换 |
| 侧栏 | 对话记录（dsh 的会话） |
| 中央 | 文稿列表，以及文档编辑、编译放映或视频制作入口；dsh 的全局面板按需占用中央。UI/UX 与当前实施状态见 RFC 第 3 节 |
| 右侧坞（`rightbar`） | dsh 的文件、终端、Review、浏览器等标签页，只在 dsh 自己打开它们时出现 |
| 对话（`main` 的 `conversation` 键） | AI 助手按需展开，收起时保留草稿，与文稿属性协调辅助区域 |
| 浮层（`shell.overlay`） | 对话框与设置 |

面板通过 `react-resizable-panels` 的公开接口调整与收放，切换视图保留文稿视图与预览实例；收起对话保留未发送的草稿。新建、对话记录与收起对话放在 Harness 常驻头部的 `conversation.header.leading` 槽位，桌面与窄屏一致。通过 `ctx.uiWorkspace.startSession(workspaceId)` 在启动的工作区中新建，复用 Harness 的会话与草稿管理；当前文稿保持，新会话仍取得当前文稿上下文。点击任何对话记录都会直接显示对话。

`ctx.layout.selectPanel(null)` 遵循 Harness 的语义：显示会话。指向文稿某处的链接另经 `LayoutController.showDocument()` 显示文稿，不顺带展开对话。启动时绑定工作区通过 `uiWorkspace.openWorkspace` 的 `beforeOpen` 保持本次布局，避免后台初始化改变作者当前视图。

对话头部的 `conversation.session.header.corner` 用空组件替换，去掉原生右侧栏的展开按钮。

**退路**：根布局与退路是同一个客户端部分。重新打开 `ui-layout` 与 `ui-sidebar` 后，它不占据 `root` 或 `sidebar`，得到 dsh 自带布局：对话居中，Presmium 的文稿与版本历史作为右侧坞的标签页类型登记（`ctx.sidebarRightTabs`），文稿列表与文稿视图作为 `main` 的全局面板。根布局插件出错时整个应用不挂载（ui-renderer 的 README），所以启动审计有用例。

**在插件管理中关掉 `@lincyaw/dsh` 时**，`ui-layout` 不回来。插件管理的开关只改 profile 的 bundle 列表：bundle 层（`cordis.patch.yml` 的 `presmium-service` 等行）不再加载，但启动器传入的 `web.patch.yml` 仍在，它关掉 `ui-layout`，插入 `presmium-workspaces`、`presmium-routes` 与 `presmium-workbench`。这三行等不到 `presmium` 服务而停在 pending（dsh 启动时警告“3 entries did not activate”），客户端部分照常载入并占据 `root`（模块系统按 Loader 的行，不看行是否已激活），`/api/presmium/*` 不在。页面因此是工作台，但读不到文稿：文稿列表在 `documents` 得到 404 时说明“`@lincyaw/dsh` 在‘插件’页中被关掉了，从‘更多’打开‘插件’把它重新打开，然后重新载入页面”。切换是热加载的，不用重启；重新打开就恢复，用户的数据都在。

### 7.3 文稿与编辑接口

[UI/UX RFC](rfc-workbench-uiux.md) 替代本节原有的文档／放映与编辑／查看方案。工作区、图标、讲稿、时间线和放映的目标交互见 RFC 第 3 至 9 节；这里仅说明已有数据通道，不把目标界面视为已实现。

文稿列表从 `documents` 读取标题；悬停或聚焦时预先准备编译与文稿代码包。新建、复制、重命名与删除沿用工作区文档操作，进入版本历史。没有 git 版本记录时说明不可用的修改与撤消能力。

| 能力 | 现有接口与数据来源 |
|---|---|
| 文稿和预览 | `preview`、IR 与预览协议（第 4 节） |
| 页面与步骤 | IR 章节、块、`steps` 与预览协议 `position`、`go`、`trail` |
| 页面创建 | `page-insert`、`page-create`、`page-created` 与 IR 的章节边界 |
| 正文编辑 | `blocks-edited` 携带原始块 ID 和有序正文块，工作台按 IR 来源写回 MyST |
| 块内源码 | 块锚点解析 `ComponentNode.definition` 或 MyST 片段；`source` 与 `source/transaction` 保存 |
| 步骤讲稿 | `narrate { section, step }` 定位显式讲稿或既有讲解；保存回原来源 |
| 兼容文字编辑 | 预览协议 `edit`、`edited`，IR 的源码行与 `source` 的版本读写 |
| 撤消、恢复、历史 | `revisions`、`history/undo`、`history/redo`、`revisions/revert`，带期望版本 |
| AI 审阅 | `review` 订阅、`review/accept`、`review/reject`（6.5 节） |
| 批注与焦点 | 本地批注记录、预览协议 `pins` 与第 8 节的焦点接口 |
| 编译与导出任务 | `jobs`、`jobs/cancel`、`jobs/events` 与 `/__outputs/<任务>/` |
| 当前问题 | 5.4 节的诊断快照与订阅 |
| 对话与源码链接 | `agent-requests.ts`、dsh 会话、`sidebarRightTabs` 的公开资源解析接口 |

普通正文由 BlockNote 编辑，块内源码复用 CodeMirror，两者按需加载。BlockNote 状态由保存后的 MyST 和代码重新生成。跨文件或复杂容器不能安全写回时保留草稿，不能由预览页面自行选择或写入文件。新增代码和正文引用使用原子事务，边界见 `architecture.md` 5.11 节。

兼容文字编辑的 `edited` 报告编辑前后文本，`text-edit.ts` 去掉相同前后缀后，只替换源码中连续的纯文字并转义 Markdown 字符。跨越强调、链接地址或角色标记时拒绝猜测性替换。标题或兼容块继续使用此路径，普通正文走块编辑接口。

`ir/events` 经同源 `EventSource` 订阅。保存、撤消和外部修改后读取新 IR 与版本历史，预览页面跟随更新；断开后重连并读取当前 IR，不按秒轮询。保存响应、编译事件与预览就绪需按来源、请求和修订校验，UI 的草稿和位置规则见 RFC 第 6 节。

AI 的专用请求先经 `agent-requests.ts` 绑定文稿与焦点，再交给会话。变更由审阅差异映射到 IR 源码位置，通过 `flash` 标记对应块。对话中的 MyST 链接经 `source-links.tsx` 和 `LayoutController.showDocument()` 定位文稿；其他文件沿用 dsh 的公开预览。链接、对话切换和编译不自行改变草稿保存目标。

### 7.4 复用的 dsh 插件与关掉的行

直接复用：对话、确认卡片（在 `conversation.composer` 中）、会话与工作区浏览器、设置与模型设置、终端、文件、jobs、计划、插件管理（可用范围受 6.6 节限制）。侧栏与对话头部通过公开槽位组合，不嵌套第二套导航外壳。

Presmium 自己占用的槽位：品牌槽位 `sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`；`settings.onboarding` 中的 `welcome-notice`（优先级 -1，替换首次使用的提示）。

首次使用的提示：dsh 把 `settings.onboarding` 的步骤画在侧栏底部的设置区里，根布局中侧栏平时收起，所以 Presmium 的提示画在页面之上（portal）。dsh 自己的 `welcome-notice` 在宿主上记“已读”，替换它的步骤只能调用 `complete()`（只在页面的内存中），所以“已读”记在浏览器的 `localStorage`。同一个槽位中 DeepSeek 的登录步骤（`deepseek-official`）以同样的方式换成立即完成的步骤。

关掉的行见 6.6 节。

### 7.5 设计系统、主题与品牌

图标优先、语义映射与视觉规则见 [UI/UX RFC 第 3.2、9 节](rfc-workbench-uiux.md#32-图标优先)。本节说明实现依赖和 dsh 的主题适配。

- **共用的一层**：`@lincyaw/design`，产物与工作台的 React 组件用同一层令牌与 `pm-ui-*` 的类。
- **React 版的通用组件**在 `@lincyaw/workbench`，只有工作台用到的几个：`PmButton`、`PmIconButton`、`PmIcon`、`PmField`、`PmBadge`、`PmCard`、`PmDialog`、`PmMenu`、`PmEmpty`、`PmNotice`。工作台自己的类以 `pmw-` 开头，只供工作台的样式与用例使用，作者与插件用 `pm-ui-*`。有交互的组件封装 Radix Primitives，焦点、键盘导航、浮层定位与模态遮罩由依赖提供；Presmium 只维护样式与业务回调。分栏用 react-resizable-panels。首次使用的提示直接使用 Harness 的 `Modal`。对比度与键盘行为由浏览器用例检查。
- **dsh 的令牌**：`ctx.theme.overrideTokens` 把 dsh 用到的 76 个 `--dsw-*` 别名令牌（dsh 共用到 125 个变量）映射到书卷的取值，明暗两套。字体经 `--dsh-font-family-*` 设为 IBM Plex Sans 与 IBM Plex Mono，用户自己选的字体优先。dsh 写死的颜色、圆角、字号与 CSS module 的类不去覆盖：检查以 WCAG AA 与截图为准，不要求和书卷一致。
- **暗色**：工作台在 `<html>` 上设 `dark` 类，`--pm-*` 与 `--dsw-*` 一起切换，再经预览协议的 `appearance` 让产物跟随。
- **品牌**：品牌槽位、标题与图标（`tapIndex`）、首次使用提示换成 Presmium 的。对话首页的标语用公开的语言包接口替换（`ctx.locale.addLanguage` 加 `register`）：`zh-CN`、`en-US` 两个语言包出现在 dsh 设置的语言列表中，标为“简体中文（Presmium）”“English (Presmium)”，只换 `conversation` 的 `hero.headline`、`hero.preview` 与输入框的提示（`placeholder.hero`、`placeholder.default`、`placeholder.workspace`，改成对教师说的话），其余回退到 dsh 的中文与英文。换不干净的：其他语言标签（如 zh-TW）仍显示 dsh 的文案；插件管理器的备用源默认是 npmmirror；用户能在插件管理中关掉 `@lincyaw/dsh`（7.2 节）。默认的模型路由是 DeepSeek 的官方服务，它是正当的服务提供方，不算品牌问题。

### 7.6 界面语言

- 工作台的文字按包维护中文与英文两套（仓库的约定），英文界面中全是英文。界面语言跟随 dsh 当前的语言（`ctx.locale`），映射为 zh-CN 或 en；没有对应时看 `navigator.language`。
- dsh 自己的文案只在涉及品牌的地方替换（7.5 节）。
- 写进产物的文字按文稿的 `lang`，不受工作台的语言影响。

### 7.7 窄屏与可访问性

目标布局和验收以 [UI/UX RFC 第 9、11 节](rfc-workbench-uiux.md#9-视觉窄屏与可访问性) 为准，图标优先同样适用于桌面。dsh 接入继续按 `react-resizable-panels` 的实际轨道边界定位辅助区域；全屏锚定整个工作台，程序折叠不回写为用户拖动，空容器不截获点击。根布局与退路均需检查对话、草稿、设置和全局面板可到达。

### 7.8 客户端包的构建与加载

- 用 esbuild 构建。外部依赖是 dsh 外壳模块表中的键：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`。React 的版本因此由 dsh 决定，现在是 18.3.1；Presmium 不自带 React，也不用 React 19 的特性。
- 输出是工厂格式 `__ModuleLoader__.load({ id, factory })`。这个格式没有文档，由 Presmium 自己的 esbuild 插件生成；它的变化由升级闸门的启动审计发现。ui-slots、client-store、ui-primitives 没有可安装的包与类型，只为用到的部分声明最小的类型。
- 客户端包不能带静态文件：dsh 的模块系统只提供启动图中的合并脚本（`plugins/??…&rev=`）与按修订号请求的 `client.<名>.js` 分块，同一包中的其他文件（字体、JSON，连不带修订号的 `client.js`）都是 404。字体因此以 data URL 内联在样式中：Fontsource 的样式写 WOFF2 与 WOFF 两种，构建只内联 WOFF2（浏览器都取第一种），8 个字面约 212 KB，整个客户端包约 560 KB。
- dsh 要求客户端包在启动前已构建。发布的包由 `prepack` 构建，安装后不再构建；在仓库的检出中，`presmium-workbench` 行的入口在 dsh 读取客户端包之前检查源码是否比包新，是则用 esbuild 重新构建（原子写入，并行启动的 dsh 互不干扰）。
- 宿主换版本后，页面要重新载入才会加载新版本的模块（`dsh-client-modules` 的 README）；studio 升级后工作台提示用户重新载入。

## 8. 焦点上下文

### 8.1 原则

agent 读的、改的都是源码。所以用户指向的任何东西，无论在网页还是幻灯片中，最后都落到同一个东西上：源码中的一段，加上它在文稿中的位置。各个入口共用一种数据、一种交互、一种发送方式；MCP 另有 `presmium://focus` 与 `get_focus`（8.6 节）。交互参考 dsh 的社区插件 dsh-annotate（https://github.com/alaliqing/dsh-annotate，MIT；只作参考，不是依赖），实现用 Presmium 自己的 IR 锚点。

### 8.2 数据：`Focus`

`FocusReport.scope` 默认 `document`，`source.file` 相对讲义目录。从源码报告的选区（`from: 'source'`，工作台本身不再报告）落在讲义目录之外的 Python 等文件时使用 `scope: 'workspace'`，文件路径相对工作区根目录；只允许 `from: 'source'` 和源码行范围，不带讲义章节或块。服务要求 owner，通过工作区已有的文本源码读取校验获取磁盘摘录；`quote` 保留用户尚未保存的选区文字，两者分别给出。焦点仍绑定当前讲义与原 MCP 令牌范围，清除、切讲后不沿用旧选区。工作区源码选区与清除不依赖讲义成功编译，讲义报错时仍能把相关代码交给 agent。


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

### 8.3 入口与交互

内容工作区的作者画布中，单击一个块或选中一段文字，就是指向它（UI/UX RFC 第 4.3 节）：块被标出，鼠标旁出现工具条，焦点同时报告到服务端的焦点接口，之后在对话中说的话都带着它。关掉工具条（或选区消失）就不再指向，焦点清空；切换文稿时也清空。

| 入口 | 怎么指 | 得到 |
|---|---|---|
| 网页 | 单击块，或选中文字（预览协议的 `picked`、`selection`，带位置与大小） | 节、块、源码范围；选中时带上文字 |
| 幻灯片 | 同上 | 节、块、步骤、源码范围 |

- 新建批注图标与批注表单在工作台中，不在产物页面中，产物页面只画轮廓与编号：产物页面与工作台不同源，页面中运行着第三方插件的脚本（4.5 节），作者写在页面中的话它们读得到；浮窗还要带上工作台的文字、键盘处理与界面语言，这违背“产物只暴露锚点”。浮窗按页面报告的位置放在鼠标旁，页面滚动时跟着 `rect` 移动，看不见时隐藏。
- 编号跟着块走：编号由预览代理按 `pins` 画在块上，页面重新渲染后重画。
- 发送：在对话输入框中说的话带着当前的焦点；批注可以逐条或合并发送（7.3 节）。发送失败不丢作者写的内容。

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
- **预览代理**：回答点选、选中的文字与位置，按工作台的要求高亮、画编号标记、跳转与就地编辑（第 4 节）。
- **工作台**：收到锚点后经服务把块换成源码范围与摘录，组装成 `Focus`，放进对话。

### 8.6 MCP 与 dsh

- **保存**：工作台把当前的焦点与批注报告给服务端（`POST presmium.server/focus`，请求体 `{ document, focus: FocusReport[] }`，`FocusReport` 在内核契约中；经 bundle 转发，带服务令牌）。服务端把锚点换成源码范围与摘录（与 MCP 的 `locate_source` 同一个函数），按文档保存最近一次的焦点（与放映位置一样，由服务端保存，不属于某个页面）。
- **dsh**：bundle 的文稿快照列出当前的焦点（6.4 节）；发送批注时，它们作为一条带来源标记的消息进入会话。
- **MCP**：资源 `presmium://focus`（可订阅，与 `presmium://position` 一样，任一文档的焦点）与读取类工具 `get_focus`（可选参数 `document`）。它们经 MCP 宿主接口的方法 `McpHost.focus(document?)` 取得焦点（`@lincyaw/mcp`）：服务端返回它保存的焦点；`presmium-mcp`（stdio，不经服务端，也没有工作台）返回空。在终端中用 Claude Code 或 Codex 的人因此也能看到作者在工作台中选中的东西。
- 第 9 节的一致性用例同时断言：同一个焦点经 MCP 读到的与 dsh 会话的快照中的相同。

### 8.7 源码改动之后

块的 ID 在源码改动后可能移动。每个焦点同时记源码范围与摘录：重新编译后先按块 ID 找；找不到时按摘录在源码中重新定位（与 `{code-ref}` 的漂移检测同一思路）；再找不到就把这个焦点标为“已失效”（页面中不再画它的标记），不悄悄指到别处。

### 8.8 保存

批注按工作区与文稿保存在浏览器中，刷新页面不丢，不随对话切换；服务端只存最近一次的焦点。

## 9. MCP 与 dsh 的工具一致

- **一张工具表**：`@lincyaw/mcp` 导出内置工具的表（名字、说明、JSON Schema、种类 `read` 或确认的种类），以及按文档列出工具的函数：内置工具按种类的策略筛选（`off` 不列出），加上插件贡献的 `AgentTool`。
- **规范作者事务**：工作区宿主的 `get_authoring_capabilities/get_document/plan_document_change/apply_document_change` 复用 Web 的 `DocumentEditor`、CAS、文件事务和历史，作者读取与保存不依赖编译。只读预检不执行代码或调用模型；提交后重读已保存源，编译与浏览器验证单独报告。独立 stdio 编译宿主没有作者事务，能力响应明确 unavailable；完整目标和首片限制见 [MCP 作者动作 RFC](rfc-mcp-authoring-actions.md)。

- **工作区路由归宿主**：历史、审阅、改动、源码和规范文稿接口在 `ServerHost.routes` 注册同一份 `workspaceRoutes`。它们保留既有角色、请求上限与 launcher token，读取无需挂载编译插件。编译贡献只借用该路由表，主服务统一关闭；显式 IR、预览和任务接口仍在各自 handler 中按需编译。不能为读取历史而间接启动场景 pass。
- **转写与采用**：MCP 的能力、启动、清单、查询、结果、取消与采用工具共用 workspace 的同一服务实例；Studio 代理同一组 `document/transcription/*` 路由。任务不跟着预览插件重挂载而关闭，清单来自真实 journal，不在浏览器另造历史。能力装配使用 `Compiler.nodeServices()`，不执行场景或编译 pass，声明为 configuration-only；读取任务和取消不装配语音服务。启动属于 spend，取消和采用属于 operate，确认和写入来源由宿主决定。实际工具与验证边界见 [MCP RFC 第 15 节](rfc-mcp-authoring-actions.md#15-转写任务与采用的-mcp-接入)。
- **插件工具按真实就绪状态发布**：作者宿主初始化只读已完成编译的工具快照，不为列工具等待或启动编译。显式编译完成后发送 MCP 工具清单变更通知，客户端重读并保留原文稿归属；没有就绪实现时不能提前伪造插件工具。
- **适配器一：MCP**。`/mcp`（`presmium dev`、`presmium serve`）与 `presmium-mcp`（stdio）。
- **适配器二：dsh 工具**（bundle 的 `presmium-tools`）。bundle 作为 MCP 客户端（`@lincyaw/mcp` 导出的客户端一侧）连接工作区服务的回环 `/mcp`，用会话令牌列出工具，把每个工具连同原样的 JSON Schema 登记为 `presmium__<名字>`，调用时转成 `tools/call`。种类决定 6.3 节的映射。编译只在服务中进行一次，预览与 agent 看到的是同一次编译，文稿代码也不进 dsh 宿主。回环的开销很小：本机一份小文稿上，第一次签发会话令牌约 0.4 s（含服务就绪），连接约 50 ms，`tools/list` 约 15 ms，读取类调用的中位数约 6 ms。
- **时限**：dsh 对登记的工具没有默认时限（`timeoutMs` 省略时不限，`dsh-tool-call-timeout-policy` 只执行工具自己声明的时限）；bundle 的 MCP 客户端把单次调用的时限从 MCP SDK 默认的 60 s 放宽到 10 分钟，构建与运行代码不会被它截断。
- **多份文档**：`agent/created` 是串行事件，dsh 等它的监听者结束才处理输入，监听者经 `agent.ctx.tools.register` 登记的工具只属于那个 agent。bundle 因此为每个会话登记它所属文档的工具，不登记各文档工具的并集：两份文档的两个会话，有某个插件的一份得到这个插件的工具，另一份没有。`off` 的种类不登记。
- **一致性用例**：同一份文档、同一组设置下，MCP `tools/list` 的名字与输入 schema，等于 headless 会话中提供给模型的 `presmium__*` 工具（去掉前缀），含一个插件的 `AgentTool`；`off` 的种类两边都不列出；`get_focus` 与会话快照中的焦点相同。新增工具时这个用例保证两边都有。
- **外部 agent 是一等入口**：工作台中的 agent 只用 dsh；Claude Code、Codex 等经 MCP 连接工作区服务，工具与 dsh 中相同。规范作者提交形成文稿历史，来源为 agent，工作台从权威源变化跟上，运行快照另按版本更新。首片的 required review 适配尚未实现，能力响应关闭 apply，不能以会话已确认代替审阅；直接文件工具产生的未提交修改仍由作者提交或放弃。
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

- **命令**：`presmium studio [目录] [--port <端口>] [--host <地址>]`，由 `@lincyaw/studio` 提供；`@lincyaw/cli` 在装了它时转交，没装时说明怎样安装。目录的规则同 `presmium serve`（工作区，或只有一份文档的仓库）。
- **`DSH_HOME`**：`$XDG_STATE_HOME/presmium/studio`，一个 `DSH_HOME` 只由一个 dsh 版本写。其中的 profile `presmium-studio`：`package.json` 列出 bundle `dsh-base`、`dsh-web-app` 与 `@lincyaw/dsh`；dsh 只从 profile 中解析插件模块，所以 profile 的 `node_modules` 链接到 bundle。`DSH_AGENTS_HOME` 是其中的 `agents/`。

### 11.2 启动与监管

1. 选定 dsh 的端口：默认 4320，每次相同，浏览器的 cookie 跨重启有效；被占用时另取空闲端口。端口要在启动之前选定，因为工作区服务以工作台的源启动。
2. 生成服务令牌；启动工作区服务：`presmium serve <目录> --port 0 --preview-origin <dsh 的源>`，环境中带 `PRESMIUM_SERVICE_TOKEN`。
3. 启动 dsh：`--profile presmium-studio --port <端口> --no-open`，加上 6.6 节的补丁，工作目录为工作区根，环境中带服务的地址与令牌（bundle 的 `presmium-service` 行复用该服务）。
4. 等 dsh 在标准输出打印 `dsh web: <网址>`。
5. 打印一个网址。

启动令牌只能从 dsh 的标准输出读取：每个 dsh 进程自己生成启动令牌，只经 `dsh-web-app` 中的两处带出，`printUrl` 打印的 `dsh web: <网址>` 一行，与 `openBrowser` 交给浏览器的同一个网址（宿主的连接服务另有 `authenticatedUrl(baseUrl)`，只在类型声明中，README 没有写，不用）。`dsh-web-app` 的 README 把这一行写成供监管者使用的就绪信号：加载树安定、启动审计通过之后才打印。`presmium-workspaces` 在激活时登记根工作区，所以读到这一行时工作区已经登记好，启动器不另外查询。用户在 profile 自己的补丁中把 `printUrl` 设为 `false` 时启动器等不到这一行，3 分钟后报错并给出日志的位置。

两个进程的输出带 UTC 时间与进程来源写进 `$DSH_HOME/presmium-studio.log`；启动器的标准输出只有 `studio  <网址>` 一行。标准错误显示日志路径，并实时转发工作区服务输出（编译、预览准备、查看器构建与缓存复用、导出任务的阶段与耗时）；dsh 的输出只保存在日志中，不转发其启动令牌。预览请求以编号关联阶段，标明文稿、媒介、预取、viewer 缓存命中或回退、完成与失败；这些日志的“ready”指后端地址准备好，不代表浏览器预览已完成握手。讲授轨准备记录可用音频与未合成句子数，失败带章节与源码位置。警告（局域网没有登录、`PRESMIUM_MODEL_*` 不全）同样在标准错误。

仓库开发时用 `pnpm debug:studio` 将隔离浏览器与服务的证据按步骤保存；前端启动失败、握手超时与加载卡顿的排查入口、证据格式和局限见 [调试预览加载与卡顿](debugging.md)。

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

当前只提供网页客户端；桌面适配尚未实现，需满足以下设计边界：

1. 工作台的数据只走 `connection.fetch` 的精确路由；在桌面上这些请求经 IPC 传递（`dsh-host-webserver` 的 README），`webServer` 的前缀路由只在浏览器中可用。
2. 预览始终来自工作区服务的回环源，不依赖 dsh 的网页服务。
3. 根布局插件保留 `shell.leading` 槽位，桌面窗口装饰变量尚未定义。
4. 桌面适配复用网页的 bundle 与 profile。

可能的两条路：把 bundle 装进 DeepSeek 官方的桌面版（外框带 DeepSeek 的品牌，只有 macOS 与 Windows，插件要由桌面自带的 dsh 在应用退出时安装；它的 Electron 外壳在公开的 MIT 仓库中，不在 npm 仓库上）；或自己写一个薄的 Electron 外壳载入同一个页面（Electron 的运行环境须满足锁定 dsh 版本的要求；或让宿主跑在随附的 Node 上）。fork dsh 的桌面应用违反依赖优先的约定，不考虑。

## 12. 版本与升级闸门

- **dsh**：精确锁定一个版本，现在是 `0.2.1-alpha.4`。`@lincyaw/studio` 依赖精确版本的 `@deepseek-ai/dsh`；`@lincyaw/dsh` 用精确的对等依赖与 `engines.dsh`，安装与启动时都会检查。不用 npm 仓库的 dist-tag（`latest` 指向旧版本）。
- **Presmium 的包**：核心与产物是 1.x，`@lincyaw/design` 随 `@lincyaw/host` 发版；`@lincyaw/workbench`、`@lincyaw/dsh`、`@lincyaw/studio` 是 0.x、实验性，等 dsh 发布正式版、并且升级闸门在连续两个 dsh 版本上都通过之后，才纳入 1.x 的承诺。
- **dsh 变动快**：发版频繁，各包没有 CHANGELOG，根布局插件要重新提供的布局契约只有 README 描述。所以能否升级只由升级闸门判断。
- **升级闸门**：升级 dsh 是单独的一次改动，先通过下面五组用例。用例名带 `[gate]`（Vitest）或标签 `@gate`（Playwright），可以单独运行。

| 组 | 内容 |
|---|---|
| 1 | `--dump-config` 的行 ID：bundle 的行、关掉的行、技能与工作区控制器的配置 |
| 2 | 经 bundle 的 headless 假模型用例：工具、四种确认策略、上下文、隐私（请求体与技能目录）、工具一致 |
| 3 | 客户端的启动审计：`root` 的子槽位、dsh 插件调用的 `ctx.layout` 成员、品牌与首次使用提示的槽位名、`--dsw-*` 令牌名、外壳模块表的键、插件页的 `data-plugin-group="extensions"`、页面没有错误 |
| 4 | 工作台调用的 Host API 端点的 schema 比对（端点的描述带 JSON Schema） |
| 5 | 工作台的端到端用例 |

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

UI/UX 迁移的分期与行为验收见 [RFC 第 11 节](rfc-workbench-uiux.md#11-实施顺序与验收)。以下仍是集成测试的实现边界，不表示 RFC 的全部行为已经通过验证。

- 只写集成测试（仓库的约定）：真实运行 CLI、构建产物、服务、浏览器与锁定版本的 dsh；模型用脚本化的 Messages 兼容假模型（`@lincyaw/dsh/testing`，供各包与端到端用例共用），不 mock 宿主框架；每条验收标准一到两个用例。
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
| web 的 agent 预设各带 `persona` 行，补丁按 ID 找不到它们 | 另声明内置预设 `preset-authoring` 并设为默认，角色在它的 persona 中（6.6 节） |
| 修改摘要只在内存中，宿主重启后返回 404 | 审阅记录由工作区服务保存（6.5 节） |
| `welcome-notice` 的“已读”记在宿主上，替换它的步骤只能 `complete()` | “已读”记在浏览器的 `localStorage`（7.4 节） |
| 网页在 Linux 上不许 Mod+Alt 组合 | 侧栏的快捷键在 Linux 的网页上没有默认按键，用应用栏与侧栏按钮收起（7.2 节） |
| 官方桌面版的外框带 DeepSeek 的品牌 | 只做网页（11.6 节） |
