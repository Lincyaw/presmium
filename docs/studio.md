# 工作台

工作台是 `presmium studio` 打开的网页，作者在其中编辑文稿、编译放映、制作视频，可选地请 AI 助手修改。它是 DeepSeek Harness（dsh）的一个定制发行版：Presmium 的能力以 bundle `@lincyaw/dsh` 装进 dsh，核心与产物不依赖 dsh，也不依赖模型。

契约以源码为准：预览协议、`Focus` 与批注、会话令牌、诊断分别在 `packages/kernel/src/contracts/` 的 `preview.ts`、`agent.ts`、`server.ts`、`diagnostics.ts`，客户端槽位与行 ID 在 `packages/dsh/src/client/contract.ts`。作者动作、配音、录音、音频、历史与诊断见 [作者动作](authoring-actions.md)，控件见 [设计系统](design-system.md)，用词见 [术语与文案](glossary.md)。

“行”是 dsh 配置树中以 ID 标识的一项（如 `ui-layout`），“载体”是 dsh 的运行形态（`web`、`headless`、`acp`）。

## 1. 定位与原则

工作台面向不懂代码的教师：界面中没有源码、IR、文件树、插件名、命令与堆栈；保存、撤消与批注像 Word。只有一位作者，没有协作。三个独立入口共用同一份 `lecture.json` 与服务契约：文档编辑（参照飞书文档：正文、页面、批注、撤消与保存），编译放映（参照 Overleaf：从已保存版本编译、诊断与放映），视频制作（参照剪映：讲稿、配音、字幕、录音、剪辑与视频导出）。

1. **核心离开模型与 dsh 也能工作。** 编译器、IR、查看器、CLI、静态产物与 `presmium dev` 不引用 `@deepseek-ai/*`。
2. **产物与工作台分离。** 改源码的归工作台；放映、课堂、运行代码、读者问答归产物。产物只暴露锚点（`data-section`、`data-block`、`data-step`），经预览协议嵌入。
3. **工作台是 dsh 的客户端插件。** dsh 的界面组件不能单个嵌入别的页面，所以工作台以自己的根布局替换 dsh 自带布局，对话与确认卡片按需展开。
4. **dsh 只经一个包接触，并且不改它。** 只有 `@lincyaw/dsh` 与启动器 `@lincyaw/studio` 引用 dsh；不 fork、不打补丁，限制在 Presmium 一侧绕开（第 15 节）。
5. **一张工具表，两个适配器。** 工作台中的 agent 只用 dsh；Claude Code、Codex 等经 MCP 接入，是一等入口（第 9 节）。
6. **文稿代码不进 dsh 宿主。** 编译与构建在工作区服务中；持有模型凭据与确认通道的宿主不运行它们。
7. **修改成为版本。** 审阅、提交与撤消由 Presmium 负责；作者在文稿上看到 AI 改了哪里。
8. **隐私默认关闭**，每次启动重新声明。
9. **有退路。** 根布局失效时，同一批面板挂在 dsh 自带布局中仍可用。

## 2. 层与进程

### 2.1 层

核心（`kernel`、`compiler`、`cli`、`server`、`mcp`、`workspace` 等）与产物（`web`、`viewer`、`render-*`、插件组件、`host`）是 1.x，不依赖 dsh。工作台是 `design`（与产物共用）、`workbench`、`dsh`、`studio`，其中只有后两个依赖 dsh。

### 2.2 进程

| 进程 | 作用 | 监听 |
|---|---|---|
| studio 启动器 | 启动并监管另两个进程，打印一个网址 | 无 |
| dsh 宿主 | agent、会话、确认、工作台网页、bundle 宿主部分 | 用户访问的唯一端口，默认 `127.0.0.1` |
| 工作区服务 | 编译、开发服务器、源码、审阅、MCP | 同一地址的空闲端口，预览 iframe 直接访问 |

预览不由 dsh 提供：dsh 的前缀路由只在激活时构建一次。

### 2.3 请求的路径

1. **工作台的数据**：浏览器 → dsh 的 `/api/presmium/*`（经 dsh 的 cookie 与 `Host`、`Origin` 栅栏）→ bundle → 工作区服务（带服务令牌）。事件走每页一条 `/api/presmium/events` WebSocket，由 bundle 转接服务的 SSE。
2. **预览**：iframe → 工作区服务的源。
3. **agent 的工具**：dsh → bundle → 服务的 `/mcp`，每个会话一个会话令牌。
4. **外部 agent**：`presmium-mcp`（stdio）或 `/mcp`。

没有替浏览器持有 cookie 或改写 `Origin` 的代理，否则 dsh 的栅栏失效。Web 补丁关掉 `client-hmr`：dsh 没有卸载前阻止的契约，热替换会丢掉未保存的批注稿。

## 3. 包、分层与版本

### 3.1 包与分层

`@lincyaw/design` 是令牌、`pm-ui-*` 类、字体与图标，无框架。`@lincyaw/workbench` 是 React 面板与无框架逻辑（服务客户端、预览协议的工作台一侧、保存队列、通用组件）。`@lincyaw/dsh` 是 bundle 的宿主部分（Node）与预编译的客户端部分。`@lincyaw/studio` 是启动器，依赖精确版本的 `@deepseek-ai/dsh`。

`scripts/check-layering.mjs` 检查：产物不引用 `workbench`；`@deepseek-ai/*` 只在 `packages/dsh` 与 `packages/studio`；`workbench` 不引用 `host` 与 dsh；`@modelcontextprotocol/*` 只在 `mcp`；`design` 不引用任何包。`presmium studio` 在没装 `@lincyaw/studio` 时说明怎样安装（约 865 MB）。

### 3.2 发布

源码以 `.ts` 发布，例外是 `vscode` 与 `@lincyaw/dsh` 的客户端包。dsh 没有 TS 加载器，bundle 每行一个 ESM 入口（`entries/*.mjs`），用 jiti 加载源码。发行版不用 DeepSeek 的品牌，只在“关于”与 `NOTICE` 中写明基于 DeepSeek Harness。

### 3.3 版本

- **工作台的包保持 0.x。** `@lincyaw/workbench`、`@lincyaw/dsh`、`@lincyaw/studio` 有自己的版本号，不随 Presmium 的统一版本，`scripts/check-packages.mjs` 检查。dsh 发布正式版、且升级闸门在连续两个 dsh 版本上通过之后才进入 1.x。
- **dsh 精确锁定**，现在是 `0.2.1-alpha.4`（`engines.dsh` 与精确对等依赖，dsh 安装与启动时检查），不用 dist-tag。

## 4. 预览协议 v1

协议只传页面、块与步骤的 ID 和少量状态，不传 DOM，页面不能指定任意文件；源码位置由工作台从 IR 得出。覆盖网页与幻灯片。

### 4.1 握手

- `window.postMessage`，信封 `{ protocol: 'presmium-preview', version: 1, nonce, type, ... }`。工作台给 `GET preview` 的地址加 `presmium-preview=<nonce>`；页面中的预览代理只在带此参数、处于 iframe 中、允许的父来源（`--preview-origin`）非空时启动，所以静态构建与 `presmium dev` 没有它。
- 代理先发 `ready`（形态、文稿、修订、能力），每次 `ready` 开启新一代连接；回复须匹配原连接与代次，只发一次，切换文稿后仍按原文稿核对。
- 地址参数声明可选能力：`presmium-keys=playback`（视频制作中空格与方向键交给工作台）、`presmium-presentation=confirmed`（画面级版本门禁）、`presmium-events=shared`（共享事件订阅）。
- 未知消息忽略；消息只是数据，代理不执行代码、不打开链接。

### 4.2 消息

消息分几组：导航（`go`、`position`、`narrate`、`updated`），指向（`pick`、`picked`、`selection`、`rect`、`highlight`、`pins`、`flash`、`marks`），外观（`appearance`、`activity`），写入（`blocks-*`、`page-*`、`source-*`、`edit*`、草稿汇总、`flush`、`document-history*`），播放（`playback-*`、`production-playback*`），以及 `report`、`shortcut`、`presentation-action`、`events-*`。保存确认绑定文稿、目标、版本、预览实例与代次，过期回调不清除其后的输入。文档编辑中的单块只读预览另用 `presmium:block-preview*` 消息，以导航代次防止多个块互相回拉位置。

### 4.3 坐标与安全

- `step` 是页面自己的步号，带 `trail`，工作台用 `trailStep`、`stepTrail` 换算为完整文稿的步号；控制通道用同一换算。
- 产物页面与工作台不同源，页面脚本（含第三方插件）拿不到 dsh cookie，也读不到工作台 DOM。预览页面带 `frame-ancestors <允许的来源>`；双向核对 origin、source 与 nonce。

## 5. 工作区服务的接口

### 5.1 路由

工作区路由在 `/__presmium/presmium.workspace/` 下：`documents`、`source` 与 `source/transaction`（带版本的读写与原子保存，冲突 409，每次保存成为一个 git 版本）、`revisions*` 与 `history/*`、`ir` 与 `ir/events`、`preview`（`prefetch=1` 预先准备，准备中回答 503 `preview-preparing`）、`build`、`check`、`jobs*`（导出请求带已确认的 `source { version, fingerprint }`，不符 409）、`review*`。服务端路由在 `/__presmium/presmium.server/` 下：`tokens`、`focus`、`diagnostics*`；另有 `/mcp`。

### 5.2 令牌

- **服务令牌**：启动器经 `PRESMIUM_SERVICE_TOKEN` 交给服务与 dsh（不在命令行）。设置后工作区与服务端路由要求 Bearer，预览中的脚本因此不能改源码；产物插件路由只查 `Host` 与 `Origin`。它只是纵深防御。
- **会话令牌**：bundle 为每个 dsh 会话 `POST tokens { document, session }`，模式“主机已确认”（`MCP_ENDPOINT.issue` 的 `{ confirmed: true }`）：操作类工具不再向页面请求确认，dsh 已按策略决定。没有服务令牌时 `tokens` 一律 403。

### 5.3 当前诊断

服务维护一份 `DiagnosticSnapshot`。编译、检查、预览、浏览器运行时、插件服务与作者窗口各自替换自己的一份；新编译使旧修订的失效。工作台订阅 `diagnostics/events`，MCP 的 `presmium://diagnostics` 读同一快照，dsh 每步前带至多 20 条。通知不启动模型；“让 AI 处理”由作者点击。

## 6. bundle `@lincyaw/dsh`

### 6.1 形态与行

`dsh.bundle` 指向 `cordis.patch.yml`（全部载体的行），`dsh.client` 导出客户端包；只属于某载体的行放在启动器以 `--patch` 传入的 `profile.patch.yml` 与 `web.patch.yml` 中。技能的源只有 `.agents/skills`，打包时复制。

行：`presmium-service`（给出服务地址与令牌，不在 studio 中时自己启动 `presmium serve`）、`presmium-workspaces`（只登记工作区根目录）、`presmium-tools`（第 9 节）、`presmium-policy`（6.3 节）、`presmium-context` 与 `presmium-skills`（6.4 节）、`presmium-turns`（6.5 节）、`presmium-telemetry`（6.7 节）、`presmium-routes`（`/api/presmium/*` 与事件 WebSocket）、`presmium-workbench`（客户端部分，`name` 必须是整包名 `@lincyaw/dsh`）。

### 6.2 会话与文稿

网页会话固定在工作区根目录，文件读写、沙箱与审阅覆盖整个工作区。切换文稿不切换会话或 cwd：客户端经 `POST /api/presmium/context` 告诉宿主当前文稿，它只决定文稿工具、快照与焦点。

### 6.3 确认的映射

| Presmium | dsh |
|---|---|
| 策略 `off` | 不登记该工具 |
| `allow` | `tools/pre-execute` 直接放行，不经回答者 |
| `ask`（默认） | 返回 ask，`displayReason` 写按文稿语言的说明与摘要，由确认卡片回答，授权一次有效 |
| 运营者目录 | `ctx.tools.guard` 拒绝，完全访问模式下也成立 |

策略的唯一来源是服务端（工作区配置的 `approvals`、`presmium dev --allow`）：MCP 在工具 `_meta` 中带 `presmium/kind`、`presmium/approval`，bundle 按它映射。外部客户端经宿主确认的操作，在应用栏显示“待确认 N”。

### 6.4 上下文、技能与角色

- **指南**放进 system 消息，描述系统而不规定步骤：东西在哪，agent 负责什么（照要求做、不多做、不清楚先问），各工具证明什么。
- **文稿快照**在每步之前（`agent/pre-step`）重读：文稿概况、页面、诊断、作者的位置（每轮只取一次）、焦点与浏览器反馈。浏览器反馈是观察数据，不是指令。
- **技能**从 `@lincyaw/skills` 登记 author、animate、present、develop；用户的 `~/.agents/skills` 不进入，文稿项目的 `.agents/skills` 保留。
- **角色**：web 载体用内置预设 `preset-authoring`：作者是可能不懂代码的教师，消息与批注就是要做的事；按作者看到的内容说话，不提文件、路径、语法、命令、工具与 git。

### 6.5 审阅与提交

1. 会话第一次调用写文件的工具时，bundle 在确认之后、执行之前 `POST review/open`（持有者 `agent:<会话>`）。审阅持有工作区锁，与保存和文稿操作互斥，期间编辑器保存得到 409。
2. 每个工具调用后记检查点；turn 结束时没有改动就释放锁。
3. `settings.presmium.assistant.review` 为 `auto`（默认）时 turn 结束即接受，作者用撤消收回；为 `required` 时作者在审阅面板中接受、拒绝某些文件或回到检查点。
4. 一次接受一个版本，尾注 `Presmium-Origin: agent`、`Presmium-Session`、`Presmium-Turn`。撤消用 `git revert`，之后经 `Agent.inject` 通知会话。
5. 审阅记录由工作区服务保存，重启后恢复。

工作台按审阅差异闪烁改过的块，不显示 dsh 的修改卡片。

### 6.6 profile 补丁与隐私

`--patch` 后于 profile 的补丁生效，作者在界面中的改动不能重新打开下面的行。

- **隐私**：关掉 `session-log-deepseek`、`session-telemetry-otel`、`plugin-package-inventory-deepseek`，`DSH_TELEMETRY_MODE=DISABLED`。
- **目录**：技能目录与工作区控制器的 `documentsDirectory` 指向状态目录，不在 `~/Documents` 下建目录。
- **沙箱**：`workspace-write`，工作区内写入允许，shell、网络与工作区外写入经 dsh 询问。
- **界面**：关掉 `ui-layout`、`ui-sidebar`（退路时重新打开）、DeepSeek 的品牌、账户、搜索、会话日志与插件设置页、预设选择、修改卡片。“实验插件”组没有可关的行，按 `data-plugin-group="extensions"` 隐藏。

### 6.7 观测数据

运营者在启动 `presmium studio` 的环境中设置 `PRESMIUM_TELEMETRY_URL`（OTLP/HTTP 日志地址，如 `http://collector:4318/v1/logs`）后，作者在工作台的操作与每个会话的 AI 轨迹持续上传并可互相关联；不设置时什么也不建、不发。`PRESMIUM_TELEMETRY_HEADERS`（`键=值,…`，值按 URL 编码）给出请求头，可选的 `PRESMIUM_TELEMETRY_USER` 成为 `user.id`。

- **会话轨迹**：每个 `session/event` 原样成为一条 `session-log` 记录，另带 `presmium.turn`、`presmium.document`、`presmium.workspace`。
- **作者操作**：`@lincyaw/workbench` 的 `OperationLog` 按顺序记录作者的每个操作与控件点击，批量 `POST /api/presmium/telemetry`，事件名 `presmium.workbench.<操作>`。
- **关联**：交给 AI 的请求（`agent.ask`）带 `dsh.session.id` 与 `dsh.request.id`，等于会话中对应用户消息的 `data.source.rpcId`；那个 turn 的记录就是 AI 为它做的事。

交付尽力而为。界面不提示采集，告知使用者由运营者负责。

## 7. 外壳的实现

### 7.1 根布局与退路

根布局声明 `root`，子槽位与 `ui-layout` 相同（`sidebar`、`main`、`rightbar`、`shell.*`），所以 dsh 的插件不改就能挂上；它重新提供 `ctx.layout`。顶部应用栏是标志与位置路径，右侧有待确认、AI 助手、更多、设置与帮助；侧栏是对话记录；中央是文稿列表与三个入口；AI 助手按需展开，头部有可关的小猫表演 AI 正在做的事。只有一个工作区，对话中的工作区选择隐藏。

**退路**：重新打开 `ui-layout` 与 `ui-sidebar` 时，文稿与版本历史作为右侧坞标签页与 `main` 的全局面板出现。

### 7.2 复用与替换

- 复用 dsh 的对话、确认卡片、会话、设置与模型设置、终端、文件、jobs、插件管理；占用品牌槽位、`settings.onboarding`、`conversation.composer` 与 `turn-error`。
- 设置只给作者语言、外观、字号、“显示代码工作视图”、快捷键、“模型”与“语音服务”。`author-settings.ts` 把作者默认值写进 profile 自己的补丁层（写进 `--patch` 会让表单拒绝作者的修改）。
- `ctx.theme.overrideTokens` 把 `--dsw-*` 令牌映射到书卷的明暗取值，产物经 `appearance` 跟随。工作台文字跟随 dsh 的语言；对话首页标语经 `ctx.locale.addLanguage` 替换。写进产物的文字按文稿 `lang`。
- 客户端包用 esbuild 构建，外部依赖是 dsh 外壳模块表（React 18.3.1 由 dsh 提供），输出无文档的工厂格式 `__ModuleLoader__.load`；字体以 data URL 内联。

“语音服务”通过公开 `settings.section` 登记，配音区可直达。只填写火山引擎语音 API Key，不选择控制台版本或填写 App ID；密钥不回显、不进讲义。保存立即刷新语音服务，清除恢复启动环境配置。检查配置只读本机设置，服务权限在显式试听时验证。

## 8. 焦点与批注

作者指向的一切都落到同一个 `Focus`：源码的一段（`source`，服务端读出的 `excerpt`）加它在文稿中的位置（`section`、`block`、`step`）与选中的文字（`quote`）。一条 `Annotation` 是一个焦点、一句要求与状态（`draft`、`sent`、`done`、`failed`）。没有选中时，当前位置是被动的焦点，对话时自动带上。

- **交互**：单击块或选中文字就是指向它：块被标出，旁边出现工具条，之后在对话中说的话都带着它；选区消失或切换文稿时清空。批注表单在工作台中，产物页面只画轮廓与编号，因为页面中运行着第三方插件的脚本。
- **发给 agent**：结构化文字列出每处的页面、块、源码范围、摘录（超过 20 行只给首尾）、选中文字与要求，标签按文稿 `lang`。发送失败不丢内容。
- **保存**：工作台 `POST focus`，服务端用与 MCP `locate_source` 相同的函数换成源码范围，按文稿保存最近一次焦点；MCP 有可订阅的 `presmium://focus` 与 `get_focus`。批注保存在文稿的 `comments` 中。
- **漂移**：源码改动后先按块 ID 找，再按摘录重新定位，都找不到就标为“已失效”，不悄悄指到别处。

## 9. MCP 与 dsh 的工具一致

- `@lincyaw/mcp` 导出一张工具表（名字、说明、JSON Schema、种类），按文稿列出时按策略筛选，加上插件的 `AgentTool`；作者事务（`plan_document_change`、`apply_document_change` 等）复用 Web 的 `DocumentEditor` 与历史，见 [作者动作](authoring-actions.md)。
- 适配器一是 `/mcp` 与 `presmium-mcp`。适配器二是 `presmium-tools`：作为 MCP 客户端用会话令牌连接回环 `/mcp`，把工具连同原样 schema 登记为 `presmium__<名字>`，调用时转成 `tools/call`，时限 10 分钟。编译只在服务中做一次；每个会话只登记所属文稿的工具。
- 同一文稿与设置下，MCP `tools/list` 等于会话中的 `presmium__*` 工具，`get_focus` 等于会话快照中的焦点。

## 10. 没有模型与没有 dsh 时

只装核心时，CLI、静态产物、`dev`、`serve`、VS Code 扩展与 MCP 都可用；装了 studio 而没有模型时，对话以外的全部可用。`assistant-setup.tsx` 读 `session/modelCatalog` 判断有无可路由的模型；没有时接管 `conversation.composer`，说明“AI 助手需要先设置模型”，唯一操作“设置模型”，已写的草稿保留。失败的一轮由 `turn-error` 按稳定代码以作者的话说明，原文收在折叠的“技术详情”中。

## 11. `presmium studio`

### 11.1 命令与目录

`presmium studio [目录] [--port] [--host] [--public-url] [--preview-url] [--preview-port]`。`DSH_HOME` 是 `$XDG_STATE_HOME/presmium/studio`；每个安装有自己的 profile `presmium-studio-<散列>`，其 `node_modules` 链接到这个安装的 bundle，因为 dsh 只从 profile 解析插件。新 profile 继承最近用过的设置。

### 11.2 启动与监管

1. 选 dsh 端口：默认 4320，cookie 跨重启有效；占用时取空闲端口。
2. 生成服务令牌，启动 `presmium serve <目录> --port 0 --preview-origin <dsh 的源>`。
3. 启动 dsh：`--profile presmium-studio-<散列> --port <端口> --no-open`，加 6.6 节的补丁，环境中带服务地址与令牌。
4. 等标准输出的 `dsh web: <网址>`：启动令牌只从这里取得，它也是 dsh 的就绪信号；3 分钟等不到时报错并给出日志位置。
5. 打印 `studio  <网址>`。

输出写进 `$DSH_HOME/presmium-studio-<散列>.log`，标准错误转发工作区服务的阶段与耗时。三个进程各有父进程退出的看门狗，`kill -9` 启动器后不留进程。

### 11.3 模型、局域网与代理

- 只用 dsh 的模型设置。`DEEPSEEK_API_KEY` 与 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER` 映射为 `DEEPSEEK_*`；界面中保存的密钥优先。
- `--host` 只接受本机的一个具体 IP，启动时警告没有登录。
- `--public-url` 交给 dsh，`--preview-url` 交给工作区服务（可带路径前缀）。预览应与工作台不同源，代理不得注入 cookie 或改写 `Origin`。云端按此为每个用户运行一个 Studio，见 [云端](cloud.md)。

## 12. 升级闸门

dsh 发版频繁、没有 CHANGELOG，所以升级 dsh 是单独的一次改动，先通过五组集成用例（Vitest 名带 `[gate]`，Playwright 标签 `@gate`）：

| 组 | 内容 |
|---|---|
| 1 | `--dump-config` 的行 ID：bundle 的行、关掉的行、技能与工作区控制器配置 |
| 2 | headless 假模型（`@lincyaw/dsh/testing`）：工具、四种确认策略、上下文、隐私、工具一致 |
| 3 | 客户端启动审计：`root` 子槽位、`ctx.layout` 成员、品牌与首次使用槽位名、`--dsw-*` 令牌名、外壳模块表、`data-plugin-group="extensions"`、页面没有错误 |
| 4 | 工作台调用的 Host API 端点的 schema |
| 5 | 工作台端到端用例 |

## 13. 三条命令的分工

`presmium serve` 是工作区服务加产物（文稿卡片、各文稿页面、`/mcp`），`presmium dev` 是一份文稿的实时预览加“在编辑器中打开”，两者都没有编辑界面，也不需要 dsh。`presmium studio` 是工作台，需要 dsh，可以不配模型。

## 14. 安全与隐私

工作台只经 dsh 的栅栏访问 dsh（HttpOnly、SameSite=Strict 的 cookie，外来 `Origin` 或 `Host` 时 403），预览与它不同源（4.3 节）。同一 uid 能读的东西是残余风险（[架构](architecture.md)）。

## 15. dsh 的已知限制

- 品牌文案没有覆盖机制：语言包加逐行关掉，zh-TW 等仍显示原文。
- 布局契约只有 README，工厂格式无文档，客户端包不能带静态文件：启动审计、自己的 esbuild 插件、字体内联。
- 回答者看不到工具参数：`displayReason` 带摘要。预设的 persona 补丁按 ID 找不到：另声明 `preset-authoring`。修改摘要只在内存中：审阅记录由工作区服务保存。
- Linux 网页不许 Mod+Alt 组合：用应用栏按钮收起对话记录。

## 16. 作者看到的对象

文稿是唯一权威入口 `lecture.json`。页面是稳定 ID 的 `Section`，放映时是一张幻灯片。内容块是页内的正文、教学代码、动画或插件内容。步骤以稳定 Step ID 保存、`stepOrder` 定序，界面从 1 编号。讲稿是 `Narration`，由 `Step.narrationIds` 引用。配音由讲稿合成或录制，字幕由讲稿派生，转写文本与讲稿分开。编排是 `Production` 中的时机与停顿，时间线由讲授计划派生，不另存工程。BlockNote 状态、素材面板与时间线布局都不成为第二份文稿。

## 17. 三个入口

| 区域 | 文档编辑 | 编译放映 | 视频制作 |
|---|---|---|---|
| 工具栏 | 页面、撤消、恢复、保存、批注、导出 | 编译、预览、放映、诊断 | 播放、剪辑、配音、录音、视频导出 |
| 中间 | 连续的 BlockNote 文稿 | 已编译版本的页面与步骤 | 当前画面与三轨时间线 |
| 辅助面板 | 内容属性、批注、版本历史 | 编译状态与失败原因 | 步骤、讲稿、音色、字幕、素材 |

- 入口只由作者显式切换：编辑、保存、选区、打开面板与跳步都不进入放映或视频制作。每个入口各自保存面板、选择与草稿，切换保留返回点，不替另一入口提交输入。
- “阅读与运行”在完整查看器中运行代码，阅读中的代码修改只属于本次运行。
- **图标优先**：工具栏、块工具、步骤导航与放映控件用 `@lincyaw/design` 的语义图标，主入口保留名称。图标按钮有本地化的 `aria-label`，悬停与聚焦显示名称与快捷键；字段名、错误与破坏性确认保留文字。

## 18. 文档编辑

- **正文**：一个全篇 BlockNote 编辑器直接编辑结构化文稿，页面导航只滚动定位；公式、表格、图片等保存为类型化节点。
- **页面**：页面栏的加号在当前页之后新建独立页面并聚焦正文，块的加号只在本页插入块。重命名、复制、移动、删除各是一个可撤消的版本；删除前显示关联的讲稿数。
- **生成内容**：作者经公开参数、对话或批注修改，不看实现代码。共享素材默认修改“仅此处”，选“所有引用”才改共享素材。处理中保持上次成功的画面。
- **字幕**：文档中只给字幕与配音开始。
- **批注与 AI**：BlockNote 原生的评论扩展，跨块跨页，可逐条或批量交给 AI。AI 的修改接受或拒绝都保持作者位置，新版本显示后短暂闪烁受影响的块。
- **材料到成稿**（目标，尚未实现）：作者提交一批材料，AI 分阶段生成，成稿以互相依赖的修改组为单位审阅采用。

## 19. 视频制作

桌面采用四个停靠区域：左侧页面／素材，中央画面及一组步骤和播放控件，右侧讲稿／配音／字幕属性，底部全宽时间线。三条分隔线可拖动、键盘调整或双击恢复默认；导出放在弹窗。窄屏标签切换保留编辑器与草稿。嵌入预览隐藏查看器自身控制栏，普通放映保留。

- **选择**：画面与放映共用查看器；时间线、步骤选择器与属性指向同一个当前步骤。
- **配音**：“生成配音”是显式操作，默认当前步骤的缺失与过期片段；打开、跳步、编译与放映不调用语音服务。讲稿修改后字幕立即跟随，旧配音标为需要更新。音色按步骤、页面、项目默认继承，只显示服务支持的参数。
- **录音**：先成为本步候选，试听后显式采用为本步配音；转写文本显式“采用为讲稿”才写入。
- **时间线**：画面、配音、字幕三条对齐主轨，播放头所在步骤是唯一的选择，聚焦讲稿前先暂停。配音时机 `during` 与动画同时开始，`after` 在动画结束后开始；时刻由讲授计划派生，未知时长标为未知。
- **剪辑**：停留、停顿、音量、导入音频的入出点都是可撤消的结构化属性，原文件保留；不切断程序动画。视频文件与字幕重新对齐尚未接入。

## 20. 位置、草稿与状态

- **位置**：目标以页面、块与稳定 Step ID 标识，序号不充当跨版本身份。选另一步时先暂停；无法对应时报告原位置失效，草稿不按新下标重绑。
- **保存**：输入停顿 600 ms 后排队保存，失焦立即排队，输入法组字期间不提交，`Mod+S` 立即保存。同源写入串行并按源版本校验；冲突、断网或 AI 持锁时保留草稿并说明。未确认的草稿备份在 IndexedDB，重新打开时由作者选择恢复或丢弃。
- **撤消**：编辑器内由编辑器处理；焦点离开后工具栏的撤消作用于文稿版本。
- **状态**：保存、编译、配音、导出各有状态；“已保存”不代表编译或导出完成，旧任务结果不覆盖新状态。编译失败保留上次成功的预览并标出版本。作者看到可读的诊断说明与“详细信息”。

## 21. 放映与演示者视图

- **观众视图**隐藏所有编辑区与 AI，底部一条控制栏：播放与暂停、上一步、下一步、总览、字幕、演示者视图、全屏、退出、时间码与进度条。进入时不自动播放、不合成；字幕浮在画布底部安全区内。只显示已确认修订的画面；新修订未确认时画面关闭，底栏仍可重新编译或退出。
- **演示者视图**有当前页、下一页、讲稿、计时与控制；观众窗口只同步画面、步骤、字幕与播放状态。

| 范围 | 按键 | 操作 |
|---|---|---|
| 打开文稿时任何位置 | `Mod+S` | 立即保存 |
| 编辑器外 | `Mod+Z`、`Mod+Shift+Z` | 撤消、恢复 |
| 放映与视频制作，输入框外 | `←`、`→`、`Space` | 上一步、下一步、播放与暂停 |
| 放映，输入框外 | `O`、`Shift+F` | 总览、全屏 |
| 浮层或放映 | `Esc` | 先关最上层，再退出放映 |

输入框、编辑器与菜单保留所有按键；预览获得焦点时经 `shortcut` 把意图交给工作台。

## 22. 导出

导出面板列出渲染端与插件可用的格式。导出使用明确的已保存版本，导出器重新编译后版本不同就拒绝；有待审阅修改或编译失败时说明尚未包含的内容。带配音的视频要求片段齐全有效。放映与视频消费同一讲授计划。

## 23. 视觉、窄屏与可访问性

- 控件外观、尺寸与热区由 [设计系统](design-system.md) 定义，业务 CSS 只负责布局。
- 768 px 以下单主区域显示，工具栏保持单行，次要入口收进“更多”，视频制作的画面与时间线纵向排列；切换不丢草稿。
- 状态不只靠颜色，触屏不需要悬停，尊重减少动态效果。亮色与暗色、桌面与 768 px 以下四种组合都看过才算完成。
- VS Code 扩展的日常入口是原生 JSON 编辑、诊断、预览与放映，按需在 Integrated Browser 中打开同一个工作台。
