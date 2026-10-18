# 工作台与 DeepSeek Harness 的设计（N 波次）

> **状态**：定稿（WP-96，2026-10-18）。本文是 N 波次的设计与取舍的记录，体例同 `design-v0.7.md`。结论已经并入下列文档，实现以它们与契约源码为准；本文第 17 节“待原型的问题”由各工作包把结论写回。
>
> | 本文 | 并入 |
> |---|---|
> | 决定 G-1 至 G-9 | `wbs.md` 的 N 波次；`requirements.md` 的“定位与边界”、P-111、P-113 至 P-117、P-120、P-124、P-125 |
> | 第 2、3 节 三层、包与分层 | `architecture.md` 第 2、3 节与第 13 节 |
> | 第 4、5 节 预览协议与工作区服务的接口 | `architecture.md` 第 13 节（契约 `packages/kernel/src/contracts/preview.ts`，由 WP-96a 写入） |
> | 第 6 至 9 节 bundle、工作台、焦点、工具一致 | `architecture.md` 第 13 节；`domain-model.md` 第 16 节（与 dsh 的概念对照、`Focus`） |
> | 第 12 节 升级闸门 | `architecture.md` 第 7、13 节 |
> | 第 13 节 迁移 | `wbs.md` 的 WP-96a 至 WP-96g |
>
> **依据**：一次可行性验证，三组原型，各经复核（宿主端 bundle 复核两次），用仓库中的 dsh 0.2.1-alpha.4 与脚本化的假模型，没有用真实凭据。原型与报告在验收者的草稿目录中，不入库；结论按编号收在附录 A，正文以编号引用（K1 至 K8 宿主端，C1 至 C6 客户端，V1 至 V5 Host API）。依据分三级：**运行**（原型或复核实际跑过）、**代码核对**（读过源码、README 或包元数据）、**推断**（两者都没有）。

## 术语

全部 N 波次的文档只用下面这些名字。

| 术语 | 含义 |
|---|---|
| dsh | DeepSeek Harness（MIT）：agent 循环、工具、沙箱、确认、会话、模型适配，以及一个用 React 写的网页客户端运行时。Presmium 只经它的插件、配置补丁与客户端插件机制使用它 |
| 产物 | 渲染端从 IR 生成、能单独部署的东西：网页、幻灯片、notebook、讲授。静态构建的结果与开发服务器实时提供的页面都算。产物用 Vue（VitePress、Slidev） |
| 工作台 | 作者编写文稿用的界面：外壳、首页、文件树、源码编辑器、问题、预览、对话与批注、审阅与修改历史、讲授的面板。N 波次之后它是 `presmium studio` 的页面 |
| 旧工作台 | 1.0 中 `presmium serve` 的界面、`@presmium/workspace` 的浏览器部分、助手与讲授插件中属于工作台的面板、`presmium dev` 的编辑模式（Vue，在产物页面之中）。1.0 中标为实验性（G-6），WP-96g 删去 |
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
| Host API | dsh 宿主经 HTTP 给页面的接口：`/connect` 或浏览器 cookie，`POST /api/<端点>`（带 JSON Schema 的描述符），`/api/remote.mux` 事件流；工作台自己发起会话与提示时用它（S3） |
| 焦点 | 用户指向的一处（`Focus`）：落到源码的一段，带上它在文稿中的位置（文档、节、块、步骤）。焦点加一句要求与处理状态是一条批注 |

## 决定（G-1 至 G-9，用户确认）

| 编号 | 决定 | 本文 |
|---|---|---|
| G-1 | 核心（编译器、IR、渲染端、IR 运行时、CLI、静态产物）离开模型也能工作，不引用 `@deepseek-ai/*`。产物与工作台分离：改动源码的归工作台；不改动源码的（放映、演讲者视图、课堂、运行代码、读者用自己的模型问答、放映中的讲授录制）归产物。产物保持 Vue，只向工作台暴露锚点（`data-section`、`data-block`、`data-step`），经预览协议嵌入工作台 | 1、2、4、8.5、10 |
| G-2 | 工作台用 React 写成 dsh 的客户端插件；Presmium 的根布局插件替换 dsh 自带布局，按 `docs/design` 的工作台排布，dsh 的对话、确认卡片与修改卡片停靠在右侧；面板也能挂在 dsh 自带布局中，作为退路 | 7 |
| G-3 | 工作台中的 agent 只用 dsh，模型在 dsh 的模型设置中选。外部 agent（Claude Code、Codex 等）经 MCP 接入，是一等入口：一张工具表（从 `@presmium/mcp` 导出），两个适配器（MCP 与 dsh 工具），新工具两边都有，一致性测试断言两边的工具清单相同。ACP 的替换运行时（`PRESMIUM_AGENT_COMMAND`）随旧工作台在 96g 删去 | 9、13 |
| G-4 | 浏览器中的源码编辑只在新工作台（`presmium studio`，可以不配模型）中；`presmium dev` 回到实时预览加“在编辑器中打开”，`presmium serve` 只剩文档列表与产物；WP-92d 的 dev 编辑模式随旧工作台删去 | 10、13.4 |
| G-5 | 先只做网页；桌面客户端推迟，不排工作包，设计只保留可能（同一批客户端插件） | 11.6 |
| G-6 | 1.0 照常发布，旧工作台（`presmium serve` 的界面、`@presmium/workspace` 的浏览器部分、助手插件的面板、`EDIT_MODE`）标为实验性，不在语义化版本的承诺之内 | 13.1 |
| G-7 | 对 dsh 上游的请求只记录在本文中，不提交（与此前 deltabox 的决定相同） | 16 |
| G-8 | 焦点上下文：源码编辑器中的选中、网页预览与幻灯片预览中的点选统一为一种 `Focus`，一种交互（参考 dsh-annotate），一种发送方式；MCP 另有 `presmium://focus` 与 `get_focus` | 8 |
| G-9 | dsh 精确锁定一个版本；只有 `@presmium/dsh` 与 `@presmium/studio` 引用 dsh（分层检查保证）；每次升级 dsh 单独作为一个工作包，先过升级闸门 | 3、12 |

**定稿与草稿不同之处**（草稿是验收者草稿目录中的结论报告第二版、设计草案与焦点草案）：

1. **不做桌面**（G-5）：草稿中桌面客户端的两条路线只保留为第 11.6 节的可能，没有工作包。
2. **ACP 的替换运行时删去**（G-3）：草稿把它的去留留给用户。现在 96g 删去 ACP 客户端、`AGENT_RUNTIME` 与 `PRESMIUM_AGENT_COMMAND`；P-111 的“适配可替换”改为“外部 agent 经 MCP 接入”。
3. **浏览器中的编辑只在 `presmium studio` 中**（G-4）：没有不依赖 dsh 的轻量编辑页。
4. **上游请求只记录**（G-7）：第 16 节。
5. **hub 排在 96f 之后**：WP-94 为每个用户启动 `presmium studio`（11.5 节）。
6. **现有助手的技能泄露已经修复**：提交 c8a2616 让随助手启动的 dsh 读 Presmium 自己的 `DSH_AGENTS_HOME`，并有用例；N 波次不再为它排工作。
7. **起草新文档在新文档的目录中进行**：草稿把工作区根也登记为 dsh 工作区，供首页的起草使用。定稿改为先按模板新建文档（一个文档操作，一个提交），再在新文档的目录中开会话起草（7.3 节）。这样每个 agent 会话的工作目录、沙箱的根与审阅的根都是同一个文档目录；工作区根不登记。
8. **studio 用自己的 `DSH_HOME`**：`$XDG_STATE_HOME/presmium/studio`，不与旧工作台的 `$XDG_STATE_HOME/presmium/dsh` 共用，因为 96g 之前两者可能锁定不同的 dsh 版本，一个 `DSH_HOME` 只由一个版本写（11.1 节）。
9. **会话令牌与焦点的路由在服务端**（`@presmium/server`），不在工作区的路由中：`MCP_ENDPOINT` 本来就是服务端的服务，焦点与放映位置一样由服务端保存（5.3、8.6 节）。
10. **用例文件名**：`e2e/preview.spec.ts` 已经是 P-81 的预览同步，预览协议的用例是 `e2e/preview-protocol.spec.ts`。
11. **焦点的输入框在工作台中**：焦点草案让编号标记与输入框都出现在页面中块的旁边。定稿只把编号标记画在页面中（预览协议新增的 `pins` 消息，4.3 节），输入框在工作台的焦点托盘中（8.3 节）。理由：产物页面与工作台不同源，页面中运行着第三方插件的脚本（4.5 节），作者写在页面中的要求它们读得到；输入框还要带上工作台的文字、键盘处理与界面语言，这违背 G-1 的“产物只暴露锚点”。标记留在页面中，滚动、缩放与切换步骤时才能跟着块走。
12. **`presmium dev` 不带预览代理**：焦点草案在 `presmium dev` 与 `presmium serve` 提供的页面中都加载预览代理（草案称“预览客户端”）。定稿只在工作区服务启动的开发服务器的页面中加载它，允许的来源由 `--preview-origin` 给出（4.2 节）。理由：`presmium dev` 的页面由浏览器直接打开，不嵌在任何工作台中，没有对方可以通信；G-4 之后它只是实时预览加“在编辑器中打开”。点选因此只在 `presmium studio` 中可用。

## 1. 目标与原则

### 1.1 目标

1. 不配模型、也不装 dsh 时，核心照常可用：编译、IR、渲染端、CLI、静态产物，以及 `presmium dev` 的实时预览（G-1）。
2. 产物可以单独部署与使用，不带工作台的代码。工作台换框架或换实现时，产物不改（G-1）。
3. 工作台是 dsh 的一个定制发行版：Presmium 的能力以 bundle 装进 Presmium 自己的 profile。对话、确认、修改卡片、会话、模型设置、终端与 jobs 用 dsh 的插件，其余由 Presmium 的 React 面板补齐（G-2）。
4. 先交付网页：`presmium studio` 一条命令启动，用户只拿到一个网址（G-5）。
5. 不 fork dsh，不打补丁，只用它的插件、配置补丁与客户端插件机制（仓库的“依赖优先”）。

### 1.2 原则

1. **dsh 只经一个包接触**（G-9）。只有 `@presmium/dsh` 引用 dsh 的宿主接口与客户端接口；`@presmium/studio` 只负责安装与启动 dsh。工作台的面板不引用 dsh，核心与产物不知道 dsh 存在。dsh 的接口变了，只改这一个包。
2. **文稿的代码不进 dsh 宿主。** 编译、编译时执行与构建都在工作区服务的进程中；持有模型凭据与确认通道的 dsh 宿主不运行文稿的代码（K3 的复核）。
3. **一张工具表，两个适配器**（G-3）。工具只在工作区服务中执行；外部 agent 经 MCP 用它们，dsh 经 bundle 用它们，两边的清单由用例保证相同。
4. **修改落在源码上，并成为提交**（`requirements.md` 原则 6）。dsh 的修改卡片只是视图；审阅、提交与撤销由 Presmium 负责。
5. **隐私默认关闭，每次启动重新声明。** 不上传会话日志、插件清单与遥测，不读用户目录中的技能，第一次使用时不在用户的文档目录中建目录（6.6 节）。
6. **有退路。** 根布局插件失效时，同一批面板挂在 dsh 自带布局中仍可用（7.2 节）。

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
| dsh 宿主 | agent、会话、确认、Host API、工作台网页、bundle 的宿主部分 | 用户访问的那一个端口：默认只在本机，`--host` 时另在给出的地址上 |
| 工作区服务 | `presmium serve --headless`：编译会话、产物的开发服务器、文档与源码、审阅与修改历史、焦点、MCP | 回环上的空闲端口；`--host` 时另在同一地址上，因为预览 iframe 由浏览器直接访问它 |
| 产物的开发服务器 | VitePress 与 Slidev 的子进程（今天已有） | 回环，经工作区服务转发 |

“一个网址”指用户只需打开 dsh 宿主的地址；预览 iframe 指向工作区服务的源，由工作台自己填入。

### 2.3 请求的路径

1. **工作台的数据**：浏览器 → dsh 宿主的 `/api/presmium/*`（经 dsh 的 cookie 与 `Host`、`Origin` 栅栏）→ bundle → 工作区服务（回环，带服务令牌，5.3 节）。
2. **预览**：浏览器中的 iframe → 工作区服务的源：产物页面与它的 `/__presmium/` 路由。
3. **agent 的工具**：dsh 宿主 → bundle → 工作区服务的 `/mcp`（回环，每个会话一个会话令牌，5.3 节）。
4. **外部 agent**：Claude Code、Codex → `presmium-mcp`（stdio），或工作区服务的 `/mcp`（令牌在 0600 的状态文件中，与今天相同）。

浏览器与这些服务之间没有替浏览器持有 cookie 的代理。复核证明，注入 cookie 并改写 `Origin` 的代理会拆掉 dsh 的栅栏：外来源的页面经它读出了 82 KB 的会话记录（V1）。

### 2.4 接缝

| 接缝 | 两侧 | 用到的接口 | 稳定性 |
|---|---|---|---|
| S1 | bundle 与 dsh 宿主 | `ctx.tools.register` 与 `defineTool`；`tools/pre-execute`；`ctx.tools.guard`；`approval/request`；`ctx.systemPrompt.section`、`context`；`ctx.skills.register` 与 skill-filesystem 的配置；`ctx.workspaceRegistry`；`ctx.connection.fetch.register`（精确路径，必须在 `/api` 下）与 `admit()`；`ctx.webServer.tapIndex`；turn 与 `workspace/changes` 事件；bundle 的格式（`dsh.bundle`、行 ID、`!!js`） | README 有文档，alpha |
| S2 | 工作台的客户端插件与 dsh 客户端运行时 | `dsh.client` 声明与 `dsh.client.external`（有文档）；包的工厂格式 `__ModuleLoader__.load`（无文档）；外壳的模块表（React 18.3.1 等）；槽位接口；`root` 的 6 个子槽位与 `ctx.layout`（README 描述了行为）；`ctx.theme`；`ctx.locale`；`ctx.sidebarRightTabs`；品牌槽位与 `settings.onboarding` | 最不稳定；只出现在 `@presmium/dsh` 的客户端部分 |
| S3 | 工作台的面板与 dsh 的会话 | 面板自己发起的会话与提示（起草、讲授回写、批注）：Host API 的 `session/create`、`session/prompt`（schema 严格校验），或客户端运行时的会话服务 | 中；96e 先做原型（17 节） |
| S4 | bundle 与工作区服务 | Presmium 自己的回环 HTTP 接口、`/mcp`、服务令牌、进程监管 | Presmium 自有 |
| S5 | 工作台与产物 | 预览协议；IR 与诊断经工作区服务取得 | Presmium 自有 |
| S6 | 外部 agent | `presmium-mcp`（stdio）与工作区服务的 `/mcp` | 现有，不变 |

## 3. 包与分层规则

### 3.1 新包

| 包 | 层 | 内容 | 依赖 dsh | 版本 | 工作包 |
|---|---|---|---|---|---|
| `@presmium/design` | 产物与工作台共用 | 令牌 `tokens.css`、`pm-ui-*` 的类 `components.css`、字体 `fonts.css`、图标（SVG 字符串）与令牌名；由 `packages/host/src/design/` 移出，`@presmium/host` 改为引用它。没有框架 | 否 | 1.x，随 `host` 发版 | 96d |
| `@presmium/workbench` | 工作台 | React 面板，以及框架无关的部分：工作区服务的客户端、预览协议的工作台一侧、编辑器的状态（CodeMirror 6、三方合并）、审阅与历史的模型 | 否，不引用 `@deepseek-ai/*` | 0.x | 96d、96e |
| `@presmium/dsh` | 工作台（bundle） | 宿主部分（Node）与客户端部分（React，预编译）；唯一接触 dsh 接口的包 | 是：精确的对等依赖与 `engines.dsh` | 0.x | 96b、96c、96d、96e |
| `@presmium/studio` | 工作台（启动器） | `presmium studio`：组装 profile，启动与监管 dsh 和工作区服务 | 是：精确版本的 `@deepseek-ai/dsh` | 0.x | 96f |

改动的现有包：`kernel` 增加预览协议的契约与 `Focus`；`mcp` 另导出工具表与客户端一侧；`server` 增加会话令牌与焦点；`workspace` 的浏览器部分与 `web` 的工作台部分在 96g 删去；`cli` 的 `studio` 子命令只转交给 `@presmium/studio`，没装时说明怎样安装（约 865 MB，其中 `@deepseek-ai/*` 约 566 MB，只在装 studio 时发生）。

### 3.2 分层规则

`scripts/check-layering.mjs` 增加以下规则（96b 写入）：

- **产物不认识工作台**：产物的包（`web`、`viewer`、`render-*`、`addon-core`、各插件的 `src/client` 与 `components`）不引用 `EDIT_MODE`、工作台的槽位（`home`、`create`、`files`、`tabs`、`source`、`dock`）与 `@presmium/workbench`。今天的引用（13.3 节）列入白名单，96g 清空白名单。
- **dsh 只在一处**（G-9）：`@deepseek-ai/*` 只出现在 `packages/dsh` 与 `packages/studio`，96g 之前另有 `addon-assistant`（旧工作台的 ACP 运行时）。
- **面板不认识宿主**：`@presmium/workbench` 不引用 vue、`@presmium/host` 与 `@deepseek-ai/*`。
- **mcp 的使用者**：“只有 server 使用 mcp”放宽为“server 与 dsh 使用 mcp”；`@modelcontextprotocol/*` 仍只在 `mcp` 中，bundle 经 `@presmium/mcp` 导出的客户端一侧使用 MCP。
- **design 没有框架**：`@presmium/design` 不引用任何包。

### 3.3 发布

- 源码仍以 `.ts` 直接发布。例外有两个：`presmium-vscode`，以及 `@presmium/dsh` 的客户端部分（预编译，7.8 节）。bundle 的宿主部分每一行有一个普通 ESM 的入口文件，因为 dsh 的运行时没有 TS 加载器；入口用 jiti 加载本包的 `.ts` 源码，与 Presmium 的可执行文件相同（K3）。
- 0.x 的三个包有自己的版本号，不随 Presmium 的统一版本；`scripts/check-packages.mjs` 为它们开例外（96b）。
- 许可证：dsh 的 304 个包中 300 个 MIT，`libreoffice-kit` 与 `libreoffice-kit-wasm` 为 MPL-2.0，`node-addon-system` 及其平台包为 BSD-3-Clause（代码核对）；经 npm 安装不算由 Presmium 再分发。MIT 不授予 DeepSeek 的名称与标志：发行版不用 DeepSeek 的品牌，不暗示其背书，只在“关于”与 `NOTICE` 中写明“基于 DeepSeek Harness（MIT）”。

## 4. 预览协议 v1

### 4.1 作用与边界

工作台经预览协议驱动嵌在它里面的产物页面，产物页面经它报告位置与点选。协议只传章节、块与步骤的 ID 和少量状态，不传源码位置，也不传 DOM。源码位置由工作台从 IR 的 `SourcePos` 得出（今天编辑器中的 `placeAt`、`placeOf`，移进 `@presmium/workbench`）。

v1 覆盖网页与幻灯片两种形态。notebook 是静态文件，没有实时页面；讲授播放器以后再加。

### 4.2 传输与握手

- 传输是 `window.postMessage`。每条消息的信封是 `{ protocol: 'presmium-preview', version: 1, nonce, type, ...字段 }`。
- 工作台向工作区服务请求预览地址（`GET preview`，5.1 节），在地址上加查询参数 `presmium-preview=<nonce>`（每个 iframe 一个随机值），再放进 iframe。
- 预览代理只存在于工作区服务启动的开发服务器提供的页面中：工作区服务给它启动的开发服务器的 `RenderContext.preview`（新的可选字段：`{ origins }`，允许的父页面来源）。静态构建与 `presmium dev` 不带它。代理只在三个条件都满足时启动：地址带这个参数，`window.parent !== window`，`origins` 不为空。
- 允许的父页面来源是 `presmium serve --headless --preview-origin <源>`（可重复）给出的；在 studio 中，启动器把 dsh 的源（`--host` 时另加局域网的源）告诉服务。代理只向这些来源发消息，也只接受从它们发来、带同一个 nonce 的消息。
- 代理启动后先发 `ready`。工作台收到 `ready` 之后才发别的消息。信封的版本不同时，工作台提示“预览的版本与工作台不符，请重新启动”。
- 未知类型的消息一律忽略。消息只是数据：代理不执行收到的代码，也不打开收到的链接。

### 4.3 消息

| 方向 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 产物 → 工作台 | `ready` | `renderer`（`web` 或 `slides`）、`document`、`revision`、`capabilities` | 代理就绪。`revision` 是页面所用 IR 的修订号；`capabilities` 列出页面支持的消息类型 |
| 工作台 → 产物 | `go` | `section`、`step?`、`trail?`、`view?` | 跳到某节的某一步。`view` 是网页形态的运行时视图（`document`、`present` 等，与控制通道的位置相同）；幻灯片形态没有 |
| 工作台 → 产物 | `highlight` | `target`：`{ section, block? }` 或 `null` | 框出一块或一节；不在视野中时滚动过去；`null` 清除 |
| 工作台 → 产物 | `pick` | `on` | 点选模式。打开时点在块上报告 `picked`，不触发块自己的操作；链接、按钮与输入框照常工作（规则沿用今天的 `placeOfClick`）。鼠标下的块加虚线框 |
| 工作台 → 产物 | `pins` | `targets`：`[{ id, section, block, label }]` | 在这些块旁画编号标记（`label`）；标记在页面之中，滚动、缩放与切换步骤时自然跟着块走；块不在当前页面中时不画。空数组清除 |
| 工作台 → 产物 | `marks` | `on` | 显示作者用的标记（如 `{cue}`），取代今天 `PmRoleMark` 对 `EDIT_MODE` 的判断 |
| 工作台 → 产物 | `appearance` | `dark` | 明暗跟随工作台 |
| 产物 → 工作台 | `position` | `section`、`step`、`trail`、`view?` | 位置变化时发出，至多每 150 ms 一次 |
| 产物 → 工作台 | `picked` | `section`、`block?`、`step?` | 点选的结果；幻灯片形态带块出现的步骤 |
| 产物 → 工作台 | `selection` | `{ section, block?, text }` 或 `null` | 页面中的文字选中，供焦点带上（8.2 节的 `quote`） |
| 产物 → 工作台 | `updated` | `revision` | 页面换上了新的 IR。工作台据此重新加上高亮与焦点的标记，并判断预览是否已反映刚保存的源码 |
| 产物 → 工作台 | `report` | `level`（`error` 或 `warning`）、`plugin?`、`message` | 页面中的运行时问题（插件启动失败、组件出错），与 IR 的诊断分开：IR 的诊断由工作区服务给出 |

### 4.4 坐标与步骤

- 章节与块用 IR 的 ID。ID 在实时更新中保持不变（块被改写时可能移动，见 8.7 节）。
- 步号按完整文稿编号。幻灯片形态中只给其他渲染端的块不占步骤，编号不同，这时用 `trail` 换算（内核的 `stepTrail`、`trailStep`，WP-92b 为控制通道做的就是这件事）。
- `position` 的字段与控制通道报告的位置相同（章节、步骤、`trail`、视图），两处用同一套换算。
- 产物在 DOM 上写锚点：网页已经有 `data-section`、`.pm-block[data-block]`、`data-step`；幻灯片要补上同样的块级锚点（96a 在 `render-slides` 生成的文稿中加），静态构建中同样存在，无害。

### 4.5 安全

- **产物页面与工作台不同源。** iframe 来自工作区服务的端口；dsh 的栅栏对外来的 `Origin` 返回 403（V1 运行）。页面中的脚本，包括第三方插件，不能借用户的 dsh cookie 发起会话或回答确认，也读不到工作台的 DOM。
- **限制谁能嵌入预览。** 工作区服务给预览页面加 `Content-Security-Policy: frame-ancestors <允许的来源>`（推断，96a 实现并测试）。
- **双向核对来源。** 工作台只接受 `event.origin` 是工作区服务的源、`event.source` 是那个 iframe 的窗口、并且带同一个 nonce 的消息；代理同样核对。

### 4.6 实现位置

| 部分 | 位置 | 工作包 |
|---|---|---|
| 消息类型与 `PREVIEW_PROTOCOL = 1` | `packages/kernel/src/contracts/preview.ts`；产物与工作台都只依赖这里 | 96a |
| 网页的预览代理 | `packages/web/src/client/preview.ts`：用 IR 运行时的 viewer 跳转、取位置、找章节与块的元素，实现 `marks`（`packages/viewer/src/rich.ts` 的 `PmRoleMark` 改为看它） | 96a |
| 幻灯片的预览代理 | `slidev-addon-core` 的客户端，用宿主的 `NAVIGATION` 与 `blockElement` | 96a |
| 工作台一侧 | `@presmium/workbench` 的预览面板 | 96d |
| 静态构建 | 不带预览代理；96a 的用例扫描构建产物 | 96a |

### 4.7 与控制通道的关系

控制通道（`/__presmium/presmium.server/control`）经过服务端，服务于 MCP 的 `navigate` 与 `get_position`、确认与课堂；预览协议只在浏览器内传递。预览页面由服务提供，今天它就连接控制通道，所以外部 agent 照样看得到它的位置，也能让它跳转，外部 agent 发起的操作类工具的确认也照旧出现在预览页面的工具栏中。dsh 会话的工具调用不经这里：它们的令牌是主机已确认的（5.3 节），确认由 dsh 处理（6.3 节）。

## 5. 工作区服务的接口

这些接口就是 G-1 说的“IR 加构建与开发服务”。今天已有的路由照旧，挂在 `/__presmium/presmium.workspace/` 下；服务端自己的路由在 `/__presmium/presmium.server/` 下。

### 5.1 路由

| 路由 | 作用 | 状态 |
|---|---|---|
| `GET documents`、`POST documents` | 文档列表、编译状态与章节；新建、重命名、复制、删除 | 已有 |
| `GET files`、`GET source`、`POST source` | 列出文件；带版本的读写，冲突时 409，加锁（`architecture.md` 5.11 节） | 已有 |
| `GET changes`、`POST changes/commit`、`POST changes/discard` | 未提交的修改 | 已有 |
| `GET revisions`、`POST revisions/revert` | 修改历史与撤销 | 已有 |
| `GET ir?document=` | 文档的 IR、修订号与诊断 | 新，96a |
| `GET ir/events?document=` | SSE：新的修订号、诊断数与改过的文件（相对于工作区根目录）。编辑器据此与磁盘比较 | 新，96a |
| `GET preview?document=` | 各形态开发服务器的地址；开发服务器按需启动，页面带预览代理 | 新，96a |
| `POST build`、`POST check` | 构建（写到文档目录之外，`architecture.md` 10.6 节）与检查；今天它们只在 `ServerHost` 与 MCP 中 | 新，96a |
| `GET review?document=`、`POST review/open`、`POST review/step`、`POST review/accept`、`POST review/reject`、`POST review/restore` | 审阅：打开（bundle，持有者 `agent:<会话>`）、记检查点、查看、全部或部分接受、拒绝、回到某个检查点 | 新，96c；git 实现从助手插件移来 |
| `presmium.server/tokens`（`POST`、`DELETE`） | 为一个 dsh 会话签发或作废会话令牌（5.3 节） | 新，96b |
| `presmium.server/focus`（`GET`、`POST`） | 工作台报告焦点与批注，服务把锚点换成源码范围与摘录并保存（8.6 节） | 新，96b |
| `/mcp` | MCP，供外部 agent 与 bundle 使用 | 已有 |

### 5.2 无界面模式

`presmium serve --headless`（96a）：

- 页面不加载工作区的浏览器插件，也不加载运营者插件的浏览器部分；
- 首页是文档卡片，与静态的工作区站点相同；
- 产物的开发服务器带预览代理，允许的来源来自 `--preview-origin`；
- 96g 之后这是唯一的模式，选项保留且不再有作用。

`presmium dev` 在 96a 起默认不加载编辑模式，`--edit` 保留到 96g。

### 5.3 服务令牌与会话令牌

- **服务令牌**：studio 中，启动器生成一个随机值，经环境变量 `PRESMIUM_SERVICE_TOKEN` 交给工作区服务与 dsh 宿主（不放在命令行，`ps` 看不到）。设置了它时，工作区的路由与 `tokens`、`focus` 的写入要求 `Authorization: Bearer <服务令牌>`；产物页面自己的 `/__presmium/<插件>/` 路由（讲授、课堂、远端环境的代理）照旧只检查 `Host` 与 `Origin`。这样预览页面中的脚本不能用工作区的路由改源码。agent 与服务同一 uid，能读到这个值，所以它只是纵深防御；`architecture.md` 9.4 节的残余风险不变。
- **会话令牌**：bundle 为每个 dsh 会话向服务端取一个 MCP 令牌（`POST tokens` `{ document, session }`），令牌绑定本机作者与文档，模式为“主机已确认”：经它调用的操作类工具不再经 `APPROVALS` 向页面窗口请求确认，因为 dsh 的 `tools/pre-execute` 已经按 Presmium 的策略决定过（6.3 节）。会话结束时 bundle 作废它；dsh 宿主退出时服务作废全部。契约：`MCP_ENDPOINT.issue` 增加可选的第三个参数 `{ confirmed: true }`（`packages/kernel/src/contracts/server.ts`，只增加）。

## 6. bundle `@presmium/dsh`

### 6.1 包的形态

- `package.json`：
  - `dsh.bundle`：配置补丁 `cordis.patch.yml`，含 `!!js` 的配置；
  - `dsh.client`：`platform: 'web'`，导出预编译的客户端部分（96d）；
  - `engines.dsh` 与对 `@deepseek-ai/dsh-*` 的精确对等依赖。dsh 在安装与启动时都检查它们，不满足时拒绝（K8 运行）。
- 宿主部分：每行一个普通 ESM 的入口文件，入口用 jiti 加载 `src/node/` 的 `.ts` 源码。
- 技能：源只有 `.agents/skills` 一份，打包时复制进包内（副本不入库）；`scripts/check-skills.mjs` 核对 bundle 登记的技能都在源中（K4 的复核发现原型中手抄的副本已与仓库不同）。
- 载体：`web` 载体用完整的补丁；`headless` 与 `acp` 载体用不含路由与客户端两行的补丁，启动时不再警告“有一行没有激活”（K1 的复核）。

### 6.2 宿主部分的行

| 行 | 载体 | 作用 | dsh 接口 | 工作包 |
|---|---|---|---|---|
| `presmium-service` | 全部 | 启动并监管工作区服务（studio 之外单独运行 dsh 时）；给出服务的地址与令牌。服务在自己的进程组中，父进程退出时随之结束 | `ctx.effect` | 96b |
| `presmium-workspaces` | 全部 | 把每份文档的目录登记为 dsh 工作区，新建、改名、删除文档时同步改名或归档；工作区根不登记 | `ctx.workspaceRegistry` | 96b |
| `presmium-tools` | 全部 | 第 9 节的 dsh 适配器：把工作区服务的工具登记为 `presmium__<名字>` | `ctx.tools.register`、`defineTool` | 96b |
| `presmium-policy` | 全部 | 确认的映射（6.3 节） | `tools/pre-execute`、`ctx.tools.guard`、`approval/request` | 96b |
| `presmium-context` | 全部 | 指南放进 system 消息；文稿快照与焦点按会话的目录取得（6.4 节） | `ctx.systemPrompt.section`、`context` | 96b |
| `presmium-skills` | 全部 | 登记 `presmium-author` 等技能 | `ctx.skills.register` | 96b |
| `presmium-turns` | 全部 | 第一次写文件之前取锁并打开审阅，每个工具调用之后记检查点，接受时提交（6.5 节）。96b 声明这一行与它的入口，96c 实现 | turn 事件、`workspace/changes` | 96b、96c |
| `presmium-routes` | web | 把 `/api/presmium/*` 转到工作区服务与服务端（精确路径，必须在 `/api` 下） | `ctx.connection.fetch.register`、`admit()` | 96b |
| `presmium-workbench` | web | 客户端部分：根布局插件、面板、主题、品牌、语言；网页标题与图标 | `dsh.client`、`ctx.webServer.tapIndex` | 96d |

每一行都按**会话的目录**解析它所属的文档，不按 `process.cwd()`：dsh 的网页宿主是多工作区的，每个会话的工作目录是它所属的工作区。原型把上下文、策略与预览绑在 `process.cwd()` 上，复核时第一个会话跑在 `~/Documents/deepseek-harness/default-workspace` 里，工具找不到文稿，上下文却仍在描述它（K8 复核）。会话的目录不是任何文档目录时，bundle 不为它提供 Presmium 的工具与上下文。

### 6.3 确认的映射

| Presmium 的设置或范围 | 在 dsh 中 | 依据 |
|---|---|---|
| 种类的策略为 `off` | 不登记对应的工具，与 MCP 不列出它的做法一致 | 原型先列出再拒绝（K5 复核） |
| 策略为 `allow` | `tools/pre-execute` 直接返回 allow，不经回答者 | 原型自己回答的做法在完全访问模式下先被 dsh 的回答者拒绝（K5 复核） |
| 策略为 `ask`（默认） | pre-execute 返回 ask，`displayReason` 写 Presmium 按文稿语言给出的说明（如“构建文稿（web）”）与简短的摘要（哪一节、哪一块），由 dsh 的确认卡片回答；授权只一次有效 | K5 运行 |
| `content` 范围：文档目录中的写入 | 会话的目录就是文档目录，`workspace-write` 沙箱不询问；发送任务就是对这些写入的确认（N-08） | V3 |
| `workspace` 范围：shell、网络与文档目录之外的写入 | dsh 的沙箱与策略询问；文件工具写到会话目录之外时，bundle 也返回 ask | K5 运行 |
| 运营者目录 | `ctx.tools.guard` 拒绝，完全访问模式下也成立 | 推断（README：guard 先于 pre-execute 的监听者执行；17 节） |
| 完全访问模式（`danger-full-access`） | 允许用户选择；界面说明 Presmium 的 `ask` 在这个模式下会被拒绝，`allow` 与 guard 照旧生效 | K5 复核 |
| 工作区服务自己的 `APPROVALS` | 会话令牌是主机已确认的，服务不再把确认发往页面窗口 | 推断 |
| 确认超时 50 秒 | 不需要：dsh 的确认一直等待，晚连上的客户端也能回答 | V1 复核 |

已知的限制：dsh 的回答者看不到工具的参数（所以 `displayReason` 带摘要，完整的参数在对话中工具调用的显示里）；确认只能在打开着的 turn 中发出；授权只一次有效（K5 代码核对）。

### 6.4 文稿上下文与技能

- **指南**：一段固定的说明放进 system 消息：这是一个 Presmium 工作区，怎样用工具与技能，修改先审阅再提交。
- **文稿快照**：每个会话按自己的目录找到文档。快照包含标题、语言、入口文件、章节（ID 与标题）、诊断数、当前位置与当前的焦点（8.6 节）。dsh 的提供者接口是同步的，bundle 按 `ir/events` 维护每份文档的缓存。快照以 user 角色写进会话日志（K4 运行），所以“模型看得到的都会记下来”不需要另做。
- **技能**：在运行时登记（`ctx.skills.register`）。skill-filesystem 的 `agentsHome` 固定到 Presmium 状态目录中的空目录，用户的 `~/.agents/skills` 不进入技能目录；文稿项目自己的 `.agents/skills` 保留，它是作者自己的材料。项目中的同名技能会覆盖 bundle 的那份（K4 复核），这一点写进技能的说明。

### 6.5 turn、审阅与提交

1. **开始**：会话第一次调用会写文件的工具（文件工具与 shell）之前，bundle 在 pre-execute 中为文档打开审阅（`POST review/open`，持有者 `agent:<会话>`），审阅从这时持有文档的锁。审阅用 git 实现，快照包含当时还没提交的修改。
2. **进行中**：编辑器保存得到 409，并提示 AI 的修改在等待审阅（今天的行为）；dsh 的修改卡片照常显示每个 turn 改了什么；后面的 turn 继续累加进同一次审阅；每个工具调用完成时记一个检查点。
3. **审阅**：`settings.presmium.assistant.review` 为 `required`（默认）时，工作台的审阅面板列出自快照以来的全部文件，作者可以全部接受、拒绝某些文件，或回到某个检查点；为 `auto` 时每个 turn 结束就提交。
4. **提交**：一次接受形成一个提交，尾注是 `Presmium-Origin: agent`、`Presmium-Task`、`Presmium-Session: <会话>`、`Presmium-Turn: <起>-<止>` 与 `Co-authored-by`（V3 运行）。提交后释放锁。
5. **撤销**：`git revert`，尾注 `Presmium-Revert`。撤销后给会话发一条标明来源的消息（推断）；dsh 文件工具的“先读后改”规则会拦住基于旧内容的编辑（代码核对）。
6. **记录**：审阅记录由工作区服务保存，宿主重启后仍在。Presmium 不依赖 dsh 只在内存中的修改摘要：复核时宿主重启后摘要返回 404（V3 复核）。
7. **构建**：agent 经工具发起的构建由工作区服务写到文档目录之外，不进入审阅与修改卡片（原型在文档目录中构建，卡片列出了 67 个文件，K5 复核）。

### 6.6 profile 补丁与隐私默认值

启动器每次启动都把下面的补丁放在 profile 自己的补丁之后传入，用户在 dsh 界面中的改动（写进 profile 的 `cordis.patch.yml`）因此不能把隐私相关的行重新打开。这个先后顺序由 96b 验证（17 节）。补丁随 bundle 发布（`packages/dsh/profile.patch.yml`）。

- **隐私**：关掉 `session-log-deepseek`、`session-telemetry-otel`、`plugin-package-inventory-deepseek` 三个上传行；环境变量 `DSH_TELEMETRY_MODE=DISABLED`。这些上传随每个模型请求带出（`dsh_session_log` 一次 69 KB、`dsh_plugin_packages`），所以“没有出站连接”说明不了问题（V1 复核）。
- **技能**：skill-filesystem 的 `agentsHome` 与环境变量 `DSH_AGENTS_HOME` 都指向 Presmium 状态目录中的空目录。
- **第一次使用**：工作区控制器的 `documentsDirectory` 指向 Presmium 的状态目录，并在启动时登记好文档的工作区。两者都做到，第一次使用就不会在 `~/Documents` 下建目录（K7、K8 复核）。
- **沙箱**：`workspace-write`，确认策略为 ask。
- **persona**：换掉编程 agent 的 `harness-dev-context`，改成 Presmium 的说明（行 ID 与覆盖方式待查，17 节）。
- **界面**（96d 加入）：关掉 `ui-layout`（由根布局插件替换；退路模式下重新打开）、`ui-brand-official`、`ui-settings-account`、`account-controller`、`deepseek-account`、`llm-deepseek-account`，以及插件市场、DeepSeek 搜索服务的设置入口与实验性插件的行。确切的行 ID 以锁定的版本为准，由升级闸门第 1 组核对。

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

根布局插件声明 `root`，子槽位与 ui-layout 相同：`sidebar`、键控的 `main`（保留键 `conversation`）、`rightbar`、`shell.bottom`、`shell.overlay`、`shell.leading`。dsh 自己的插件因此不改就能挂上（C1 运行：页面加载 67 个客户端行，没有错误）。只能整个替换 ui-layout：外壳只渲染 `root` 一个槽位，子槽位只能声明一次，`renderSlot` 只渲染调用者自己声明的子槽位（C1 代码核对）。

根布局插件还要重新提供：

- `ctx.layout`：`panelInfo`、`selectPanel`、`beginNavigation`、`toggleSidebar`、`openRightbar`、`closeRightbar`（ui-layout 的 README 写明了它们的行为）；
- 标准钩子 `usePanelInfo`；
- 主题呈现：调色板、字号、字体列表与令牌变量。

原型缺少、96d 要补齐的：`Mod+B`、跟随会话的文档标题、拖动柄、右侧列在宽度不够时的关闭协议（`canShow`）。桌面的窗口装饰（`shell.leading`、`--dsh-frame-*`）留到做桌面时（G-5）。

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

**退路**：关掉 `presmium-workbench` 的根布局部分并重新打开 `ui-layout`，得到 dsh 自带布局：对话居中，Presmium 的预览、源码与审阅作为右侧坞的标签页类型登记（`ctx.sidebarRightTabs`），首页作为 `main` 的全局面板。根布局插件出错时整个应用不挂载（ui-renderer 的 README），所以退路与启动审计都有用例（96d）。

### 7.3 面板

| 面板 | 数据来源 | 取代的旧代码（13.3 节） | 工作包 |
|---|---|---|---|
| 首页：文档卡片、新建与管理、启动台搜索、MCP 卡片 | `documents` | `web/src/client/home.ts` 的工作台部分；`workspace/src/client/panels.ts` 的文档管理 | 96d |
| 由 AI 起草 | 先按模板新建文档（`POST documents`，一个提交），再在新文档目录的 dsh 会话中起草 | `home.ts` 的 `create` | 96e |
| 文件树 | `files` | `home.ts` 的 `Files`；`workspace/src/client/editing.ts` 的文件树 | 96d |
| 源码编辑器与文件标签 | `source`（版本、409、锁）；IR 的诊断；`ir/events` 中改过的文件 | `workspace/src/client/editor.ts`、`editing.ts`、`source.ts` | 96d |
| 问题 | IR 的诊断 | `editing.ts` 的问题面板 | 96d |
| 预览 | `preview` 与预览协议 | `web/src/client/theme.ts` 的 `EditFrame`；`workspace/src/client/preview.ts`、`viewer.ts` | 96d |
| 对话与批注 | dsh 的对话，加上 Presmium 的焦点托盘（第 8 节） | `addon-assistant` 的 `EditDock.vue`、`edit.ts` | 96e |
| 审阅 | `review` | `addon-assistant` 的 `ChangeTask.vue` | 96e |
| 修改历史与未提交的修改 | `revisions`、`changes` | `panels.ts` 的修改历史与提交入口 | 96e |
| 讲授回写 | 讲授插件的路由；回写时新建 dsh 会话 | `addon-lecture` 的 `WritebackDock.vue`；`PlayerPanel.vue` 的编辑部分 | 96e |
| 状态项 | git 状态、光标；模型来自 dsh 的设置 | `GitStatus`、`EditorStatus`；`ModelStatus.vue` | 96d、96e |

### 7.4 复用的 dsh 插件与关掉的行

直接复用（C1 运行）：对话、确认卡片（在 `conversation.composer` 中）、修改卡片与 Review 标签页、会话与工作区的侧栏、设置与模型设置、终端、文件、jobs、计划、插件管理（可用范围受 6.6 节限制）。

Presmium 自己占用的槽位：品牌槽位 `sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`；`settings.onboarding` 中的 `welcome-notice`（优先级 -1，替换首次使用的提示）。

关掉的行见 6.6 节。

### 7.5 设计系统、主题与品牌

- **共用的一层**：`@presmium/design` 由 `packages/host/src/design/` 移出，产物中的 Vue 组件与工作台中的 React 组件用同一层令牌与 `pm-ui-*` 的类。
- **React 版的通用组件**在 `@presmium/workbench`：`PmButton`、`PmIconButton`、`PmIcon`、`PmField`、`PmBadge`、`PmCard`、`PmSegmented`、`PmTabs`、`PmPopover`、`PmDrawer`、`PmDialog`、`PmMenu`、`PmEmpty`、`PmNotice`。重复的只有行为（焦点、菜单与标签页的键盘操作、弹层的位置），按 `architecture.md` 5.10 节；对比度与键盘的用例对两份都运行。
- **dsh 的令牌**：`ctx.theme.overrideTokens` 把 `--dsw-*` 映射到书卷的取值。原型映射了约 60 个，要补齐 dsh 用到的 76 个别名令牌（dsh 共用到 125 个变量，C2）。字体经 `--dsh-font-family-*` 设为 IBM Plex Sans 与 IBM Plex Mono，用户自己选的字体优先。dsh 写死的颜色、圆角、字号与 CSS module 的类不去覆盖：验收以 WCAG AA 与截图为准，不要求和书卷一致。
- **暗色**：工作台在 `<html>` 上设 `dark` 类，`--pm-*` 与 `--dsw-*` 一起切换，再经预览协议的 `appearance` 让产物跟随。
- **品牌**：品牌槽位、标题与图标（`tapIndex`）、首次使用提示换成 Presmium 的；对话首页的标语用公开的语言包接口替换（`ctx.locale.addLanguage` 加 `register`，en-US 与 zh-CN，C3 复核运行）。换不干净的：其他语言标签（如 zh-TW）仍显示 dsh 的文案；插件页的 DeepSeek 搜索服务、实验插件与市场要逐行关掉；插件管理器的备用源默认是 npmmirror；用户能在插件管理中关掉 `@presmium/dsh`（关掉之后会怎样待查，17 节）。默认的模型路由是 DeepSeek 的官方服务，它是正当的服务提供方，不算品牌问题。

### 7.6 界面语言

- 工作台的文字按包维护中文与英文两套（仓库的约定）。界面语言跟随 dsh 当前的语言（`ctx.locale`），映射为 zh-CN 或 en；没有对应时看 `navigator.language`。
- dsh 自己的文案只在涉及品牌的地方替换（7.5 节）。
- 写进产物的文字按文稿的 `lang`，不受工作台的语言影响。

### 7.7 窄屏与可访问性

- 宽度小于 1024 px 时侧栏收起；小于 768 px 时活动栏横排在顶部，侧栏、右侧坞与对话都放进占满宽度的抽屉或视图。
- 390 px 时 dsh 的每个面板都能从活动栏到达，包括会话、设置、Review 与文件（原型做不到，C1 复核）。
- 文字对比度达到 WCAG AA，控件边框达到 3:1（N-06、N-10）。

### 7.8 客户端包的构建与加载

- 用 esbuild 构建。外部依赖是 dsh 外壳模块表中的键：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`（C6）。React 的版本因此由 dsh 决定，现在是 18.3.1；Presmium 不自带 React，也不用 React 19 的特性。
- 输出是工厂格式 `__ModuleLoader__.load({ id, factory })`。这个格式没有文档，由 Presmium 自己的 esbuild 插件生成；它的变化由升级闸门的启动审计发现。ui-slots、client-store、ui-primitives 没有可安装的包与类型，只为用到的部分声明最小的类型。
- CodeMirror 打进包内；几个客户端插件要共用它时，用 `dsh.client.external` 声明共享（有文档，没有试过）。
- 字体能否作为单独的文件随客户端包发布待查（17 节）；不能时以 data URL 内联。
- 宿主换版本后，页面要重新载入才会加载新版本的模块（`dsh-client-modules` 的 README）；studio 升级后工作台提示用户重新载入。

## 8. 焦点上下文（G-8）

### 8.1 原则

agent 读的、改的都是源码。所以用户指向的任何东西，无论在源码编辑器、网页预览还是幻灯片预览中，最后都落到同一个东西上：源码中的一段，加上它在文稿中的位置。三个入口共用一种数据、一种交互、一种发送方式。交互参考 dsh 的社区插件 dsh-annotate（https://github.com/alaliqing/dsh-annotate，MIT；只作参考，不是依赖），实现用 Presmium 自己的 IR 锚点。

### 8.2 数据：`Focus`

在内核的 agent 契约（`packages/kernel/src/contracts/agent.ts`）中扩展现有的 `AgentContext` 与 `Annotation`，只增加，不改已有字段（96b）：

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

- 点选模式：鼠标下的块加虚线框；点击后块旁出现编号标记（预览代理按 `pins` 画出），工作台的焦点托盘中出现同一编号的输入框并获得焦点；`Enter` 保存并继续点下一个，`Shift Enter` 换行，`Esc` 退出，`⌘/Ctrl` 点击保存并发送这一批。输入框在工作台中而不在产物页面中，产物页面只画标记。
- 标记跟着块走：标记画在页面之中，滚动、缩放与切换步骤时随块移动；收到 `updated` 后工作台按 8.7 节重新定位并重发 `pins`；块被删掉时，托盘中的那一条显示为“已失效”。
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

- **保存**：工作台把当前的焦点与批注报告给服务端（`POST presmium.server/focus`，经 bundle 转发，带服务令牌）。服务端把锚点换成源码范围与摘录（与 MCP 的 `locate_source` 同一个函数），按文档保存最近一次的焦点（与放映位置一样，由服务端保存，不属于某个页面）。
- **dsh**：bundle 的文稿快照列出当前的焦点（6.4 节）；发送批注时，它们作为一条带来源标记的消息进入会话。
- **MCP**：资源 `presmium://focus`（可订阅，与 `presmium://position` 一样，任一文档的焦点）与读取类工具 `get_focus`（可选参数 `document`）。它们经 MCP 宿主接口的新方法 `McpHost.focus(document?)` 取得焦点（`@presmium/mcp`，只增加）：服务端返回它保存的焦点；`presmium-mcp`（stdio，不经服务端，也没有工作台）返回空。在终端中用 Claude Code 或 Codex 的人因此也能看到作者在工作台中选中的东西。
- 第 9 节的一致性用例同时断言：同一个焦点经 MCP 读到的与 dsh 会话的快照中的相同。

### 8.7 源码改动之后

块的 ID 在源码改动后可能移动。每个焦点同时记源码范围与摘录：重新编译后先按块 ID 找；找不到时按摘录在源码中重新定位（与 `{code-ref}` 的漂移检测同一思路）；再找不到就把这个焦点标为“已失效”（焦点托盘中显示，页面中不再画它的标记），不悄悄指到别处。

### 8.8 保存

批注按文档与对话保存（工作台存在浏览器中，服务端只存最近一次的焦点），刷新页面不丢；不同对话互不共享。

## 9. MCP 与 dsh 的工具一致（G-3）

- **一张工具表**：`@presmium/mcp` 导出内置工具的表（名字、说明、JSON Schema、种类 `read` 或确认的种类），以及按文档列出工具的函数：内置工具按种类的策略筛选（`off` 不列出），加上插件贡献的 `AgentTool`。今天它是 `mcp.ts` 内部的 `TOOLS`。
- **适配器一：MCP**。`/mcp`（`presmium dev`、`presmium serve`）与 `presmium-mcp`（stdio），不变。
- **适配器二：dsh 工具**（bundle 的 `presmium-tools`）。bundle 作为 MCP 客户端（`@presmium/mcp` 导出的客户端一侧）连接工作区服务的 `/mcp`，用会话令牌列出工具，把每个工具连同原样的 JSON Schema 登记为 `presmium__<名字>`，调用时转成 `tools/call`。种类决定 6.3 节的映射。编译只在服务中进行一次，预览与 agent 看到的是同一次编译，文稿代码也不进 dsh 宿主。进程内的桥接已运行过（K6）；改用回环的 HTTP 传输是推断，延迟与 dsh 对工具的超时待测（17 节）。
- **多份文档**：dsh 的工具在插件激活时登记。dsh 不能按会话给出不同的工具集时（17 节），bundle 登记各文档工具的并集，pre-execute 对会话的文档没有的工具返回 deny 并说明原因；`off` 是工作区一级的设置，对应的工具不登记。
- **一致性用例**（96b）：同一份文档、同一组设置下，MCP `tools/list` 的名字与输入 schema，等于 headless 会话中提供给模型的 `presmium__*` 工具（去掉前缀），含一个插件的 `AgentTool`；`off` 的种类两边都不列出；`get_focus` 与会话快照中的焦点相同。新增工具时这个用例保证两边都有。
- **外部 agent 是一等入口**：工作台中的 agent 只用 dsh（G-3）；Claude Code、Codex 等经 MCP 连接工作区服务，工具与 dsh 中相同，修改落在源码上，工作台的预览与编辑器经 `ir/events` 跟上。它们写的修改不经 Presmium 的审阅（它们没有 Presmium 的会话），作者在“未提交的修改”中提交或放弃，与在自己的编辑器中改一样。
- **ACP 的替换运行时**（`PRESMIUM_AGENT_COMMAND`、`settings.presmium.assistant.command`、`AGENT_RUNTIME` 的 ACP 实现）随旧工作台在 96g 删去，ACP 的两个测试 agent（助手插件的 `scripted-agent.mjs`、讲授插件的 `writeback-agent.mjs`）与两个包对 `@agentclientprotocol/sdk` 的依赖一起删去。理由：经 ACP 时 Presmium 的确认种类与说明丢失（K5 复核），两套传输与两套确认语义要一起维护；外部 agent 经 MCP 已经能做同样的修改。

## 10. 没有模型与没有 dsh 时

| 情形 | 可用 | 不可用 |
|---|---|---|
| 只装核心（没有 dsh） | CLI 的 `build`、`dev`、`check`、`ir`；静态产物；`presmium dev` 的实时预览与“在编辑器中打开”；`presmium serve` 的文档列表与各文档的页面；语言服务与 VS Code 扩展；`presmium-mcp` 与 `/mcp`（外部 agent） | 浏览器中的编辑与工作台中的 AI（G-4） |
| 装了 studio，没有模型 | 工作台中除对话以外的全部：文件、编辑、保存、问题、预览、修改历史、撤销、终端（K7、C5 运行） | 对话：工作台显示 Presmium 自己的说明，指出缺少什么，给出 dsh 模型设置的入口（沿用 WP-92d 结构化的缺少项代码），不显示 dsh 原始的 `MISSING_CREDENTIAL` |
| 装了 studio，有模型 | 全部 | 无 |

不需要模型的 Presmium 操作（构建、检查）也可以做成 dsh 的斜杠命令（`ctx.commands`）；只读过 README，不是必需的。

## 11. `presmium studio`

### 11.1 命令与目录

- **命令**：`presmium studio [目录] [--port <端口>] [--host <地址>]`，由 `@presmium/studio` 提供；`@presmium/cli` 在装了它时转交，没装时说明怎样安装。目录的规则同 `presmium serve`（工作区，或只有一份文档的仓库）。
- **`DSH_HOME`**：`$XDG_STATE_HOME/presmium/studio`（定稿与草稿不同之处第 8 条）。其中的 profile `presmium-studio`：`package.json` 列出 bundle `dsh-base`、`dsh-web-app` 与 `@presmium/dsh`；profile 的 `node_modules` 链接到 bundle（K8 发现 dsh 只从 profile 中解析插件模块）。`DSH_AGENTS_HOME` 是其中的 `agents/`（与 c8a2616 中助手的做法相同）。

### 11.2 启动与监管

1. 生成服务令牌；启动工作区服务：`presmium serve <目录> --headless --port 0 --preview-origin <dsh 的源>`，环境中带 `PRESMIUM_SERVICE_TOKEN`。
2. 启动 dsh：`--profile presmium-studio --port <端口> --no-open`，加上 6.6 节的补丁，工作目录为工作区根，环境中带服务的地址与令牌（bundle 的 `presmium-service` 行因此不再自己启动服务）。
3. 等 bundle 登记好文档的工作区。
4. 打印一个网址。

启动器、dsh 宿主与工作区服务各在自己的进程组中，各有父进程退出的看门狗：`kill -9` 启动器之后不留下任何进程（复核时 SIGKILL 宿主留下了孤儿的开发服务器，K2 复核）。启动令牌今天只能从 dsh 的标准输出读取（“dsh web: <网址>”）；96f 先查有没有别的交接方式，没有时解析标准输出（16、17 节）。

### 11.3 模型

工作台只用 dsh 的模型设置，凭据存在上面的 `DSH_HOME` 中（dsh 不回传密钥，V1）。环境变量 `DEEPSEEK_API_KEY`，以及 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER`，按今天助手的规则映射为 `DEEPSEEK_*`（dsh 接受 Messages 兼容的地址）。旧工作台在用户配置目录中的 `assistant.json`，由 studio 第一次启动时提示导入为 dsh 的凭据，导入后不删除原文件。

### 11.4 局域网

`--host <地址>` 时，dsh 用 `--host <地址> --trusted-host <地址>:<端口>`（dsh 不接受通配）；工作区服务也监听这个地址，它的 `Host` 与 `Origin` 规则按 `architecture.md` 10.1 节接受这个地址，`--preview-origin` 另加局域网的源。启动时警告没有登录，与今天的 `serve --host` 相同。dsh 的 cookie 走明文 HTTP（dsh 写明的限制）；要加密时由用户在前面放 TLS。

### 11.5 hub（WP-94，排在 96f 之后）

dsh 的网页是单一所有者的应用，正好对应“每人一个容器”。hub 为每个用户启动 `presmium studio`，不再启动 `presmium serve`；LiteLLM 的地址作为 Messages 兼容的模型地址填进 dsh 的模型设置。dsh 在路径前缀下运行用 `--public-url <前缀地址>` 加 `--trusted-host`，前面放一个只剥离前缀、不注入 cookie、不改写请求头的代理（V1 复核运行过）。

### 11.6 桌面客户端（G-5：不排工作包）

本波次不做桌面，下面四点保证以后能做：

1. 工作台的数据只走 `connection.fetch` 的精确路由；在桌面上这些请求经 IPC 传递（`dsh-host-webserver` 的 README），`webServer` 的前缀路由只在浏览器中可用。
2. 预览始终来自工作区服务的回环源，不依赖 dsh 的网页服务。
3. 根布局插件保留 `shell.leading` 槽位，窗口装饰的变量以后补上。
4. 网页与桌面用同一个 bundle、同一个 profile。

可能的两条路（C4）：把 bundle 装进 DeepSeek 官方的桌面版（外框带 DeepSeek 的品牌，只有 macOS 与 Windows，插件要由桌面自带的 dsh 在应用退出时安装）；或自己写一个薄的 Electron 外壳载入同一个页面（Electron 的版本要在 dsh 认可的集合中：43.0.0、44.0.0、44.7.0、45.0.0-alpha.6，或让宿主跑在随附的 Node 上）。fork dsh 的桌面应用违反依赖优先的约定，不考虑。

## 12. 版本与升级闸门（G-9）

- **dsh**：`@presmium/studio` 依赖精确版本的 `@deepseek-ai/dsh`；`@presmium/dsh` 用精确的对等依赖与 `engines.dsh`，安装与启动时都会检查。96b 开工时锁定当时最新的 0.2.x 预发布版或正式版（npm 的 `latest` 标签指向旧版本，不能用标签）。旧工作台的助手插件保留自己的固定版本，到 96g 随它删去。
- **Presmium 的包**：核心与产物是 1.x，`@presmium/design` 随 `@presmium/host` 发版；`@presmium/workbench`、`@presmium/dsh`、`@presmium/studio` 是 0.x、实验性，等 dsh 发布正式版、并且升级闸门在连续两个 dsh 版本上都通过之后，才纳入 1.x 的承诺。
- **变动的速度**（C6 与复核）：上游 30 天内 4312 次提交，ui-layout 75 次；根布局插件要重新提供的布局契约 9 月改过 5 次，09-30 至 0.2.1-rc.2（10-17）没有再变；8 月 10 日以来发布了 36 个版本；全部包没有 CHANGELOG。
- **升级闸门**：每次升级 dsh 单独作为一个工作包，先跑下面五组。用例名带 `[gate]`（Vitest）或标签 `@gate`（Playwright），可以单独运行。

| 组 | 内容 | 写入 |
|---|---|---|
| 1 | `--dump-config` 的行 ID：bundle 的行、关掉的行、技能与工作区控制器的配置 | 96b |
| 2 | 经 bundle 的 headless 假模型用例：工具、四种确认策略、上下文、隐私（请求体与技能目录）、工具一致 | 96b |
| 3 | 客户端的启动审计：`root` 的子槽位、dsh 插件调用的 `ctx.layout` 成员、品牌与首次使用提示的槽位名、`--dsw-*` 令牌名、外壳模块表的键、页面没有错误 | 96d |
| 4 | 工作台调用的 Host API 端点的 schema 比对（端点的描述带 JSON Schema） | 96e |
| 5 | 工作台的端到端用例，含退路布局 | 96d、96e |

- **会话格式**：bundle 只经事件与接口使用会话，不读会话日志文件，dsh 的会话格式升级（已到 v4）因此不影响 Presmium。

## 13. 从旧工作台迁移

### 13.1 1.0 中的旧工作台（G-6）

1.0 照常发布，不加功能。旧工作台标为实验性，不在语义化版本的承诺之内：`presmium serve` 的界面、`@presmium/workspace` 的浏览器部分、助手与讲授插件中属于工作台的面板、`presmium dev` 的编辑模式，以及只为它们存在的契约（`EditMode` 与 `EDIT_MODE`，工具栏槽位 `home`、`create`、`files`、`tabs`、`source`、`dock` 与位置 `activity`、`home`、`pane`，`AGENT`、`AGENT_RUNTIME` 与 ACP 相关的设置）。`requirements.md` 的“定位与边界”据此修订；公开接口的列表（`docs/api.md`，WP-93c）要列出它们为实验性；源码上的 `@experimental` 标注（P-143）写在 `packages/host/src/types.ts` 与 `packages/kernel/src/contracts/agent.ts` 中这些契约上，不在 93c 的拥有中，由验收者在合并 93c 时加上（`wbs.md` WP-96 的“留给别的工作包”）。两者都要在用户实际发布 1.0 之前做完。

N 波次进行期间，旧工作台仍是 `presmium serve` 的默认界面，只修缺陷，不加功能；分层检查的白名单把它隔离起来。

### 13.2 步骤

1. **96a ‖ 96b**：先建接缝。旧工作台只有一处行为改变：`presmium dev` 默认不加载编辑模式（`--edit` 保留）。其余是新增的：预览协议、工作区服务的接口与无界面模式；bundle 的骨架、工具一致、焦点的 MCP 一侧、升级闸门的第 1、2 组、分层规则与白名单。
2. **96c ‖ 96d ‖ 96f**：审阅移进工作区服务（旧工作台的助手也改用它，两个工作台共存）；React 的工作台外壳；`presmium studio`。
3. **96e**：工作台中的 AI、焦点、审阅、修改历史与讲授回写。
4. **96g**：删去 13.3 节的耦合，清空白名单，把旧工作台的用例改为测新工作台，删去 ACP 的替换运行时，更新文档与技能（`presmium-author` 与 `presmium-develop` 中关于编辑模式与“AI 修改”的段落改为指向工作台）。

### 13.3 要删去的耦合

验收者核对过：静态构建中没有编辑相关的代码，耦合只出现在由服务提供的页面中。

| # | 位置 | 内容 | 去向 |
|---|---|---|---|
| 1 | `packages/web/src/node/sites.ts`（`siteModules`、`homePluginDirs`、`homeModules`，用在 `buildSite` 与 `devSite`） | 站点自己的插件进入每份文档的页面；`ctx.config.homePlugins` 的浏览器部分进入首页 | 机制留给产物自己的站点插件；96a 的无界面模式不经它注入工作台，96g 删去这条注入 |
| 2 | `packages/workspace/src/node/site.ts`（`servedPlugins`、`homePlugins`）；`serve.ts` 中首页加入运营者插件、`plugins: servedPlugins()` | serve 把工作区的浏览器插件放进每一页，把助手等运营者插件的浏览器部分放进首页 | 96a 的无界面模式不再传入；96g 删去 |
| 3 | `packages/workspace/src/node/dev.ts`（`sitePlugins: servedPlugins()`），经 `packages/cli/src/cli.ts` 到 `packages/compiler/src/renderers.ts` | `presmium dev` 的网页加载工作区的浏览器插件，即 WP-92d 的编辑模式 | 96a 起默认不加载，`--edit` 保留到 96g；96g 删去 `sitePlugins` |
| 4 | 文稿 `plugins` 中列出的助手与讲授插件：`packages/addon-assistant/src/client/plugin.ts`、`packages/addon-lecture/src/client/plugin.ts` | 有服务时登记“AI 修改”、模型状态与停靠面板，登记讲授回写的开关与停靠面板 | 96g 移出这两个插件 |
| 5 | `packages/host/src/types.ts`（`ToolbarSlot` 中的 `home`、`create`、`files`、`tabs`、`source`、`dock`；`ToolbarPlace` 中的 `activity`、`home`、`pane`；`EditMode`、`EDIT_MODE`）；`packages/host/src/index.ts` 的导出 | 工作台的槽位与编辑模式写进了产物共用的宿主契约 | 96g 删去；`tools`、`settings`、`status` 留给产物 |
| 6 | `packages/viewer/src/rich.ts`（`PmRoleMark`） | `{cue}` 等标记只在编辑模式中显示 | 96a 改为看预览协议的 `marks` |
| 7 | `packages/web/src/client/theme.ts`（`bySlot`、`EDIT_TOOLS`、`useEditing`、`readWorkspaceTitle`、`EditFrame`，`Layout` 中编辑模式的部分） | 编辑模式的整套外壳：顶栏、`source` 与 `dock` 两栏、状态栏、`<html>` 上的 `pm-editing` 等类 | 96g 删去 |
| 8 | `packages/web/src/client/home.ts`（`McpCard`、启动台的命令搜索、`create`、`FileTree`、`Files`、`FilesDrawer`、`Workbench`，`Layout` 在有服务时选工作台） | 首页的工作台 | 96g 删去，首页回到静态站点那样的文档卡片 |
| 9 | `packages/web/src/client/style.css`（首页的工作台及其窄屏规则、编辑模式） | 工作台的样式 | 96g 删去；要保留的规则移进 `@presmium/design` |
| 10 | `packages/workspace/src/client/viewer.ts`、`preview.ts` | 编辑器在页面内直接取 IR 运行时的 viewer，读 DOM 并加框 | 96a 起由预览代理与预览协议取代 |
| 11 | `packages/workspace/src/client/**` | 编辑模式、源码编辑器、文件标签、问题、文档管理、修改历史、使用说明 | 96d、96e 用 React 重写，96g 删去 |
| 12 | `packages/addon-assistant/src/client/` 的 `EditPanel.vue`、`EditDock.vue`、`dock.ts`、`ChangeTask.vue`、`ModelSettings.vue`、`ModelStatus.vue`、`edit.ts`、`agent.ts` | “AI 修改”的入口、停靠面板、任务与审阅、模型设置、`AGENT` 的客户端 | 由 dsh 的对话与 96e 的面板取代，96g 删去 |
| 13 | 同一目录的 `AskPanel.vue`、`AskSettings.vue`、`ask.ts`、`AssistantToolbar.vue` | 读者问答，用读者自己的模型服务 | 产物，保留 |
| 14 | `packages/addon-lecture/src/client/` 的 `WritebackDock.vue`、`WritebackPanel.vue`、`writeback.ts`、`dock.ts`；`PlayerPanel.vue` 的 `serverEditing` | 讲授回写；编者改写已录制的讲授 | 96e 用 React 重写，96g 删去 |
| 15 | `packages/addon-lecture/src/client/RecorderPanel.vue`、`recorder.ts` | 放映时录制讲授，经讲授插件的路由保存 | 产物（属于放映），保留 |
| 16 | `packages/web/src/node/vite.ts` 的 `source` 端点，`packages/web/src/client/theme.ts` 的 `openSource` | `presmium dev` 中从预览打开作者自己的编辑器（K-11） | 产物的开发功能，保留；在预览协议中对应 `picked` |
| 17 | `packages/workspace/src/node/source.ts`、`routes.ts` 等 | 文件、源码、未提交的修改、提交、放弃、文档、修改历史的路由 | 服务，保留；96a 写成工作区服务的接口 |
| 18 | `packages/addon-assistant/src/node/`（ACP 运行时、任务、设置、`git-review.ts`、`review-record.ts`）、`packages/addon-assistant/dsh/` | 旧工作台的 agent 服务端 | 审阅在 96c 移进工作区服务；ACP 运行时与 dsh 模板在 96g 删去（G-3） |
| 19 | `e2e/editing.spec.ts`、`e2e/design.spec.ts`、`e2e/assistant.spec.ts` 与 `e2e/assistant-edit.spec.ts` 中编辑的部分、`e2e/plugin-ui.spec.ts` 中工作区的部分、`e2e/lecture-writeback.spec.ts`、`e2e/workspace.spec.ts`（旧首页的文档管理与修改历史，约 40 个旧界面的选择器，以及局域网中“编辑模式与确认”一例）、`packages/cli/test/serve.test.ts` 中“首页加载运营者插件的浏览器部分”一例、`packages/cli/test/dev-editing.test.ts` | 旧工作台的用例 | 96g 改为测新工作台；`packages/workspace/test/source.test.ts`（路由）保留 |

### 13.4 96g 之后三条命令的分工

| 命令 | 是什么 | 需要 dsh |
|---|---|---|
| `presmium serve` | 工作区服务加产物：首页是文档卡片，各文档有自己的页面，`/mcp` 供外部 agent；没有编辑界面 | 否 |
| `presmium dev` | 一份文稿的实时预览，加“在编辑器中打开” | 否 |
| `presmium studio` | 工作台：浏览器中的编辑、预览、对话与批注、审阅、修改历史；可以不配模型 | 是 |

讲授的录制发生在演讲者视图（产物）中，结果写进讲授轨，保存照旧经讲授插件的服务端路由；改写、回写与审阅在工作台中。

### 13.5 数据兼容

- 修改历史（git 提交与尾注）不变，新的提交只多 `Presmium-Session` 与 `Presmium-Turn` 两条尾注。
- 审阅记录的格式随审阅一起从助手插件移进工作区服务，旧记录照常读取。
- `presmium.workspace.yaml` 中的 `approvals` 与 `settings.presmium.assistant.review` 由 bundle 读取。
- 用户配置目录中的 `assistant.json` 由 studio 第一次启动时提示导入（11.3 节）。

## 14. 安全与隐私

- **栅栏**：工作台只经 dsh 自己的栅栏访问 dsh（cookie 为 HttpOnly、SameSite=Strict；没有 cookie 时 401，外来的 `Origin` 或 `Host` 时 403，V1）。不做注入 cookie 或改写 `Origin` 的代理（2.3 节）。
- **预览与工作台不同源**（4.5 节），预览页面的 `frame-ancestors` 只允许工作台的源。
- **文稿代码不进 dsh 宿主**：编译、编译时执行与构建都在工作区服务中（1.2 节）。同一 uid 能读的东西照旧是残余风险（`architecture.md` 9.4 节）。
- **服务令牌**是纵深防御（5.3 节）。
- **隐私默认值**由 profile 补丁每次启动重新声明（6.6 节）。
- **完全访问模式**：Presmium 的硬性拒绝用 guard 实现，不依赖回答者（6.3 节）。
- **局域网**：11.4 节。
- **进程**：进程组加父进程退出的看门狗，不留孤儿进程（11.2 节；deltabox 的辅助进程已经这样做）。

## 15. 测试策略

- 只写集成测试（仓库的约定）：真实运行 CLI、构建产物、服务、浏览器与锁定版本的 dsh；模型用脚本化的 Messages 兼容假模型（96b 把 `packages/addon-assistant/test/fixtures/fake-model.ts` 移进 `@presmium/cli/testing`，供各包与端到端用例共用），不 mock 宿主框架；每条验收标准一到两个用例。
- 每个用例用自己的 `DSH_HOME` 与 `HOME`（临时目录），并断言没有写到测试目录之外（例如没有出现 `~/Documents`）。
- 预览协议的用例用一个不依赖任何框架的测试宿主页面，测的是协议本身，而不是某个工作台的实现。
- 工作台的端到端用例在 Chromium 中运行；测试文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中构建。
- 升级闸门的用例带标记（12 节），可以单独运行。
- 每个工作包用自己的端口段（`wbs.md` 的 N 波次）。

## 16. 上游请求（只记录，G-7）

按此前对 deltabox 的做法，下列请求只记录在这里，不向 deepseek-harness 提交：

| 请求 | 原因 | 现在的做法 |
|---|---|---|
| 品牌与内置文案的覆盖机制 | 标语只能经语言包按完整的语言标签替换，zh-TW 等仍显示原文 | 语言包加逐行关掉（7.5 节） |
| 有文档的布局提供者契约（`root` 的子槽位与 `ctx.layout`） | 替换 ui-layout 要重新实现一个只有 README 描述的契约 | 根布局插件加启动审计（7.2、12 节） |
| ui-slots、client-store、ui-primitives 的类型，与客户端包的构建预设 | 没有可安装的包与类型，工厂格式没有文档 | 自己的 esbuild 插件与最小的类型（7.8 节） |
| 允许发行版设定的首次使用工作区策略 | 第一次使用会在 `~/Documents` 下建目录 | `documentsDirectory` 加启动时登记（6.6 节） |
| 不经标准输出的启动令牌交接 | 启动器只能解析标准输出 | 解析标准输出（11.2 节） |
| 不止一次有效的授权，以及回答者能看到的参数 | 授权只一次有效，回答者看不到参数 | `displayReason` 带摘要（6.3 节） |
| 按会话给出不同的工具集 | 多份文档的插件工具不同 | 登记并集，pre-execute 拒绝（第 9 节）；96b 发现 `agent/created` 时经 `agent.ctx` 登记即可，这一条已不需要（17.1 节） |
| agent 预设的 persona 跟随部署的 persona，或可按 ID 打补丁 | web 的预设各带 `persona` 行，补丁找不到它们 | 指南写在 system 消息中，关掉 `harness-dev-context`（17.1 节第 10 项） |
| 可以配置品牌的桌面外壳 | 官方桌面版的外框带 DeepSeek 的品牌 | 不做桌面（11.6 节） |

## 17. 待原型的问题

下列问题没有运行过。负责的工作包先做原型，再按结果实现，并把结论写回这里；结论否定设计时先报告，不自行改设计。

| # | 问题 | 不成立时 | 工作包 |
|---|---|---|---|
| 1 | `connection.fetch` 的路由能否流式回答（`ir/events` 的推送） | 工作台按秒轮询修订号 | 96a（服务一侧）、96b（bundle 的转发）、96d（工作台一侧） |
| 2 | 面板怎样发起会话：在页面中带 cookie 调 Host API，还是用客户端运行时的会话服务 | — | 96e |
| 3 | 批注怎样进入对话：`conversation.composer` 槽位中的托盘，还是直接发 `session/prompt` | — | 96e |
| 4 | 一次审阅跨越多个 turn 时界面怎样呈现，与 dsh 修改卡片是什么关系 | — | 96c、96e |
| 5 | 启动时传入的补丁与 profile 自己的补丁谁先谁后：用户在界面中的改动能否盖过隐私相关的行 | 启动器每次启动前把 profile 补丁中的这些行改回 | 96b |
| 6 | 用户在插件管理中关掉 `@presmium/dsh` 之后会怎样，`ui-layout` 是否回来 | 工作台说明怎样重新打开 | 96d |
| 7 | 启动令牌在标准输出之外有没有交接方式 | 解析标准输出 | 96f |
| 8 | 客户端包能否带字体等静态文件 | 以 data URL 内联 | 96d |
| 9 | 经回环 MCP 调工具的延迟，以及 dsh 对工具的超时 | 进程内桥接（K6 运行过的做法） | 96b |
| 10 | persona 行的 ID 与覆盖方式 | 用 `systemPrompt.section` 说明 Presmium 的角色 | 96b |
| 11 | `ctx.tools.guard` 在完全访问模式下是否先于 dsh 的回答者生效 | 运营者目录另由沙箱规则拒绝 | 96b |
| 12 | dsh 能否按会话给出不同的工具集 | 登记并集（第 9 节） | 96b |

### 17.1 WP-96b 的结论

都在锁定的 0.2.1-alpha.4 上用假模型运行过；用例在 `packages/dsh/test/`。

- **第 1 项（bundle 的转发）**：成立。`connection.fetch` 的精确路由按流回答：原型路由每 400 ms 写一段 SSE，经 dsh 宿主（它对回答做 gzip 压缩）到达客户端的间隔仍约 400 ms，没有被缓冲。`presmium-routes` 原样返回上游的流，`ir/events` 因此可以经它推送（服务一侧见 96a）。
- **第 5 项**：成立。`--patch` 在 profile 自己的补丁与 `$DSH_HOME/cordis.patch.yml` 之后：profile 补丁重新打开三个上传行后，加上 Presmium 的补丁启动时它们仍关闭，模型请求中没有上传的字段；同一个 profile 不带 Presmium 的补丁启动时，请求带 `dsh_session_log` 与 `dsh_plugin_packages`（`privacy.test.ts`）。启动器不需要改写 profile 的补丁。
- **第 9 项**：经回环 `/mcp` 可行，不需要进程内桥接。本机一份小文稿上：签发会话令牌约 0.4 s（第一次，含服务就绪），连接约 50 ms，`tools/list` 约 15 ms，读取类调用的中位数约 6 ms。dsh 对登记的工具没有默认时限（`timeoutMs` 省略时不限，`dsh-tool-call-timeout-policy` 只执行工具声明的时限）；bundle 的 MCP 客户端把单次调用的时限从 SDK 默认的 60 s 放宽到 10 分钟，构建与运行代码不会被它截断。
- **第 10 项**：部分成立。headless 与 acp 的 persona 是 `system-prompt` 行的 `personaPrefix`，profile 补丁换成 Presmium 的说明（补丁整体替换这一行的 config）。web 载体的 4 个 agent 预设（`preset-standard` 等）各在自己的配置中带一个 `persona` 行，补丁只能按 ID 找到顶层与 group 中的行，换它要整份重写预设的配置，因此不换：web 中 Presmium 的角色由 `presmium-context` 的指南（system 消息中的一段）说明，`harness-dev-context` 行关掉，模型请求中不再有 DeepSeek Harness 检出目录与 GUI 的说明，预设自己的“You are a coding agent powered by …”仍在。`privacy.test.ts` 在 headless 中断言 Presmium 的 persona、没有编程 agent 的 persona，在 web 中断言有指南、没有 `harness-dev-context` 的说明；是否要求 web 也换掉预设的 persona 由验收者决定（上游请求见第 16 节）。
- **第 11 项**：成立，有前提。完全访问模式（`danger-full-access`，确认策略 `never`）下，写运营者目录的 `write` 调用得到 guard 的拒绝说明，文件没有写出（`policy.test.ts`）。前提是 pre-execute 对这些调用不 ask：bundle 起初对“写到会话目录之外”一律 ask，结果是回答者的“the user rejected”，拒绝虽然成立，却不是 guard 的；实现中 policy 把运营者目录中的路径留给 guard。
- **第 12 项**：成立。`agent/created` 是串行事件，dsh 等它的监听者结束才处理输入；监听者经 `agent.ctx.tools.register` 登记的工具只属于那个 agent。bundle 因此为每个会话登记它所属文档的工具，不登记并集：web 载体上两份文档的两个会话，有测试插件的一份得到 `presmium__fixture_note`，另一份没有（`context.test.ts`）。上下文同样登记在 agent 的作用域中。

实现与设计不同或设计没有写明之处：

1. **按载体拆分补丁**：bundle 层（`dsh.bundle` 的 `cordis.patch.yml`）是全部载体的行；web 载体的两行与它的设置在 `web.patch.yml`，与 `profile.patch.yml` 一样由启动器以 `--patch` 传入（`@presmium/dsh/launch`）。dsh 的一个包只有一个 bundle 层，按载体选择只能这样做。
2. **`presmium-workspaces` 只在 web 载体**：`ctx.workspaceRegistry` 只有 web 的组合中有；headless 与 acp 的会话就在 dsh 启动的目录中。
3. **策略不由 bundle 读 `presmium.workspace.yaml`**（13.5 节）：会话令牌是主机已确认的，MCP 对它列出的操作类工具在 `_meta` 中带上种类与策略（`presmium/kind`、`presmium/approval`），策略的唯一来源仍是服务端（工作区配置的 `approvals`、`presmium dev --allow`）。
4. **会话令牌只给启动服务的主机**：没有设置 `PRESMIUM_SERVICE_TOKEN` 时 `tokens` 一律 403（设置了时要求它）；这样产物页面中的脚本拿不到不经确认的令牌。
5. **文稿快照每一步之前经 MCP 重读**（`agent/pre-step`），不维护按 `ir/events` 更新的缓存：读取类调用只要几毫秒（第 9 项），快照也就总是新的。
6. **焦点的报告**：`POST presmium.server/focus` 的请求体是 `{ document, focus: FocusReport[] }`（`FocusReport` 在内核契约中），批注的保存留给 96e。

## 18. 工作包

工作包的拥有、条目、验收与用例在 `wbs.md` 的 N 波次。顺序：WP-96（本文）与 WP-93b、93c 并行；96a 起在 93b、93c 合并之后。

| 步骤 | 工作包 | 内容 |
|---|---|---|
| 一 | 96a ‖ 96b | 预览协议与工作区服务的接口；bundle 的骨架、工具一致与升级闸门的第 1、2 组 |
| 二 | 96c ‖ 96d ‖ 96f | 会话、审阅与修改历史；工作台的外壳（React）；`presmium studio` |
| 三 | 96e | 工作台中的 AI、焦点与讲授 |
| 四 | 96g | 移除旧工作台 |

WP-94（hub）排在 96f 之后。

## 附录 A：可行性验证的结论

“复核修正”表示结论成立，但复核纠正或补充了细节。

| 编号 | 问题 | 结论 | 依据 |
|---|---|---|---|
| K1 | bundle 能否注册调用 Presmium 的工具 | 能：`ctx.tools.register` 的工具被假模型调用，headless 一次 0.9 s；web profile 的预设 agent 也看得到。headless 与 acp 每次启动警告预览行没有激活，bundle 应按载体拆分行 | 运行，两次复核成立 |
| K2 | 宿主路由能否提供文稿的预览 | 能，三种方式：webServer 的前缀路由（经 dsh 的栅栏）、`connection.fetch` 的数据路由（路径必须以 `/api` 开头）、另一个端口上的 `presmium dev` 子进程。侧栏 Browser 拒绝显示 dsh 自己的源 | 运行，复核修正：同源路由只在激活时构建一次，编辑后不更新；SIGKILL 宿主后子进程成为孤儿 |
| K3 | 以 `.ts` 发布的包怎样加载 | 装在 `node_modules` 中时原生 import 失败；jiti、类型剥离的钩子与 CLI 子进程都可用 | 运行，复核修正：缓存为空时 jiti 冷启动约 1.1 s |
| K4 | 技能与文稿上下文 | 三种技能来源都能加载；`section` 进入 system 消息，`context` 以 user 角色写进会话日志；skill-filesystem 默认扫描 `~/.agents/skills` | 运行，复核补充：上下文绑在 `process.cwd()`；项目中的同名技能覆盖 bundle 的；bundle 中的副本与仓库不同 |
| K5 | 确认与修改卡片 | 种类映射到 pre-execute 与 `approval/request`：headless 下 ask 即拒绝，off 拒绝，allow 放行一次；网页的确认卡片与 ACP 都能用。workspace-changes 是每个 turn 的内存快照，不提交、不回滚 | 运行，复核发现：完全访问模式下 Presmium 的 allow 也被拒；经 ACP 时种类与说明丢失；off 先列出后拒绝；构建产物写进文档目录 |
| K6 | 一张工具表能否同时服务 dsh 与 MCP | 三种做法都跑通：stdio 的 `presmium-mcp`（只有读取类）、进程内桥接（12 个工具，`McpHost.approve` 变成 dsh 的确认）、原生 `defineTool`（逻辑重复） | 运行，复核修正：bundle 没有声明对 MCP SDK 的依赖 |
| K7 | 没有模型时 dsh 能做什么 | web profile 能启动，bundle 全部激活，路由、预览与文件可用；对话报 `MISSING_CREDENTIAL` | 运行，复核补充：零请求的前提是关掉三个上传行；第一次对话在 `~/Documents` 下的默认工作区中运行 |
| K8 | 发行与锁版本 | 启动器能启动，它在应用自有的 profile 中链接 bundle；`engines.dsh` 不满足时安装被拒绝 | 运行，两次复核都不成立：全新 home 中第一次对话不在文稿目录中；启动器没有固定 `DSH_AGENTS_HOME`；安装约 865 MB |
| C1 | 我们的布局能否占据 `root` 并复用 dsh 的插件 | 能，但只能整个替换 ui-layout：声明同样的 6 个子槽位，重新提供 `ctx.layout`、`usePanelInfo` 与主题呈现；dsh 的对话、确认、修改卡片与 Review、设置、会话、文件、jobs、插件管理都可用 | 运行，复核修正：预览是预先构建的站点；agent 改过文件后编辑器保存只得到 409；390 宽度下侧栏与右侧坞无法到达 |
| C2 | 预览面板与主题令牌 | 同源 iframe 可以作为右侧坞的标签页；`overrideTokens` 映射了约 60 个 `--dsw-*` 令牌，明暗两套都可以 | 运行，复核成立；dsh 用到 125 个变量，其中 76 个别名令牌 |
| C3 | 品牌 | 能关掉品牌、账号、上传与遥测的行，品牌槽位、标题与图标、首次使用提示都换成了 Presmium 的 | 运行，复核修正：标语可以用语言包替换（只对完整的语言标签）；插件页仍有 DeepSeek 的搜索服务与市场 |
| C4 | 桌面客户端 | dsh 的 Electron 外壳在公开的 MIT 仓库中，不在 npm 上，只打包 macOS 与 Windows；自己的 54 行外壳在 Electron 39 中载入了同一个工作台；dsh 拒绝在 Electron 39 的 Node 中运行 | 自有外壳为运行，官方桌面为代码核对 |
| C5 | 没有模型时客户端能否使用 | 页面能加载，文件、编辑、保存、问题、预览可用，对话失败并显示 dsh 原始的消息 | 运行，复核成立 |
| C6 | 成本与变动 | 原型自有约 530 行 React、138 行 CSS、131 行 Node；依赖槽位、`ctx.layout`、主题、`__ModuleLoader__` 与外壳的模块表 | 运行（测量） |
| V1 | Host API 能否供外部界面使用 | 能：约 60 行、不含 dsh 代码的客户端走完工作区、会话、事件、提示、确认、修改摘要与文件；共 144 个端点；外来 Origin 403，没有 cookie 401 | 运行，复核发现：注入 cookie 的代理拆掉了栅栏；`--public-url` 加 `--trusted-host` 的透明代理可用；模型请求带 `dsh_session_log` 与 `dsh_plugin_packages` |
| V2 | dsh 的组件能否单个嵌入别的页面 | 不能：每个包只导出 Cordis 插件，共享模块只在外壳中；能做的只有把整个客户端放进 iframe | 运行与代码核对，复核成立 |
| V3 | 概念对照 | 文档目录对应 dsh 工作区，线程对应会话，接受的 turn 对应一个修改，撤销用 git revert；提交与 revert 都跑通 | 运行，复核：宿主重启后修改摘要返回 404 |
| V4 | 另一方案下的桌面客户端 | Electron 窗口载入同一页面，主进程托管服务 | 推断 |
| V5 | 两种界面方案的比较 | 原型建议 Vue 工作台经 Host API；在 G-1、G-2 定下之后改为 dsh 客户端运行时加 Presmium 的根布局（理由：dsh 的界面组件不能单个嵌入，Vue 方案要重写全部 agent 界面，一个普通 turn 就有 23 种事件） | 推断，结论由用户的决定 G-2 定下 |
