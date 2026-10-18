# Presmium 领域模型

本文档按领域驱动设计（DDD）描述 Presmium 的限界上下文、通用语言和领域对象，工程落地见 `architecture.md`。通用语言表中的“标识符”是代码中的名字；没有对应类型、只是某个类型的字段时，写出字段所在的位置。

## 1. 限界上下文总览

| 上下文 | 包 | 职责 |
|---|---|---|
| 内核 Kernel | `@presmium/kernel` | 插件清单、服务注册、锚点契约、检查契约、步骤契约、IR 契约，以及插件共用的服务契约 |
| 编译 Compilation | `@presmium/compiler`、`@presmium/cli` | 解析 MyST 源码、执行编译步骤与行内角色、编译时执行与缓存（含执行会话）、受众筛选、生成 IR、运行检查 |
| 渲染 Rendering | `@presmium/viewer`、`@presmium/web`、`@presmium/render-slides`、`@presmium/render-notebook` | 从 IR 生成各媒介或在浏览器中动态渲染 IR，声明支持程度并降级；运行时视图；站点外壳、文件发布与译本；工作区站点 |
| 宿主适配 Host | `@presmium/host`、`@presmium/slidev-addon-core`、`@presmium/web`、`@presmium/server` | 形态无关的宿主接口，及其 Slidev、VitePress 两个实现；服务端：插件的服务端贡献、请求来源的检查、操作确认、控制通道 |
| 讲台 Stage | `@presmium/slidev-addon-stage` | 基础内容、步骤备注、冻结画面、圈画标注 |
| 代码引用 CodeRef | `@presmium/slidev-addon-code` | 引用、锁定、漂移、跳转、分步高亮、多版本 |
| 代码执行 Execution | `@presmium/slidev-addon-exec`、`@presmium/slidev-addon-exec-local` | 执行服务、运行记录、分步执行、回退、环境复刻 |
| 执行环境 Environment | `@presmium/slidev-addon-exec-jupyter`、`@presmium/slidev-addon-exec-wasi`、`@presmium/slidev-addon-exec-webgpu`；会话与富输出也落在代码执行的两个包中 | 具名环境、环境提供方与指纹、执行会话、富输出、远端环境的凭据方式、部署模板、浏览器终端 |
| 引导 Guidance | `@presmium/slidev-addon-guide` | 模拟光标、聚光、交互提示 |
| 富内容 Content | `@presmium/slidev-addon-content`；卡片、栅格、选项卡由编译器与渲染端直接支持 | 公式、图表、思维导图、媒体（含封面与字幕轨）、Web 组件、卡片与栅格 |
| 发布 Publishing | `@presmium/slidev-addon-publish`；发布检查与受众筛选在编译器与 CLI 中 | 导出、离线、高对比度、可视化差异、发布检查、受众范围 |
| 课堂 Classroom | `@presmium/slidev-addon-session`、`@presmium/slidev-addon-classroom`、`@presmium/classroom-server` | 会话、网络传输、跟随、笔记、测验、练习、提问、理解度、先预测再揭示 |
| 编辑 Editing | `@presmium/language-server`、`presmium-vscode` | 编辑器中的诊断、跳转、悬停、补全，编辑器与预览同步 |
| 智能体 Agent | `@presmium/mcp`、`@presmium/dsh`、`@presmium/slidev-addon-assistant` | agent 环境（MCP 与 dsh 的工具）、焦点、学习者问答 |
| 工作区 Workspace | `@presmium/workspace` | 工作区服务、文档管理、修改历史与撤销（重做）、修改审阅、工作区站点 |
| 工作台 Workbench | `@presmium/workbench`、`@presmium/dsh`、`@presmium/studio`；`@presmium/design` 与产物共用 | 作者编写文稿的界面：文件树、源码编辑器、问题、预览、对话与焦点、审阅与修改历史；DeepSeek Harness 的防腐层（bundle）；`presmium studio` |
| 讲授 Lecture（含语音 Speech） | `@presmium/slidev-addon-lecture`、`@presmium/slidev-addon-speech` | 讲授轨、录制、回放、脚本化讲授、导出视频、转写回写；语音服务（语音协议 `v1/*`）、引擎、合成缓存、字幕译文 |

网页形态的站点外壳、文件发布与译本属于渲染上下文，见第 9 节；工作区站点的组织属于工作区，网页渲染端负责构建它。

文稿模型（章节、块、步骤、讲解）由 Presmium 以 IR 的形式自己定义，这是核心领域，也是各上下文之间的公开语言（Published Language）。Slidev、VitePress 只作为渲染端与浏览器宿主，负责排版、放映、搜索等它们擅长的部分。

## 2. 上下文映射

```
   源码（MyST）──► 编译 ──► IR（公开语言）──► 渲染：网页 · 幻灯片 · notebook · 讲授（lecture）
                    ▲                               │
  插件的指令、角色、编译步骤、执行器、环境提供方       ▼
                                  宿主适配（防腐层：Slidev / VitePress）+ 服务端（presmium dev / serve）
                                                    │ 共享内核契约
                                             ┌──────▼───────┐
                         ┌──────────────────►│     内核      │◄──────────────────────┐
                         │                   └──────────────┘                        │
     讲台 代码引用 代码执行 执行环境 引导 富内容 发布 课堂 讲授                编辑 智能体 工作区
                                │                         │                         │      │
              外部：Jupyter Server（防腐层）  外部：语音服务（语音协议）   外部：DeepSeek Harness · git
```

- **内核是共享内核**：所有上下文只依赖内核的契约，彼此之间不直接依赖。多个插件共用的业务服务契约（`executor`、`session`、`classroomStore`、`speech`、`agent`、`agentRuntime`、`revisions`、`approvals`、`mcpEndpoint` 与操作词汇 `TrackEvent`）也放在内核包中，因为提供方与使用方是不同的插件（`architecture.md` 4.5 节）。
- **宿主适配是防腐层**：插件的组件与浏览器端代码（`components/`、`src/client/`）不引用 `@slidev/*` 与 vitepress，只通过 `@presmium/host` 获取步骤状态、服务与形态信息，因此同一个组件可以在两种形态中运行。只在幻灯片形态中加载的部分（插件包的 `setup/` 与全局图层）可以使用 `@slidev/client` 的公开导出；只有网页渲染端使用 vitepress。领域层（`src/domain/`）不引用 Vue。完整规则见 `architecture.md` 第 3 节。服务端（`@presmium/server`）是宿主适配在 Node 端的对应物：插件只经 `ServerContext`、`RequestContext` 与 `approvals` 使用它，浏览器端只经 `useServer()`。
- **上下文之间通过服务协作**：例如课堂的练习校验使用代码执行提供的 `executor` 服务；测验、笔记等功能使用会话插件提供的 `session` 服务，会话插件可以整体替换。
- **外部系统只经防腐层接入**：每个外部系统只在一个适配器中出现，适配器说一种标准协议（`architecture.md` 第 3 节的检查规则）。

上下文之间的关系：

| 上游 | 下游 | 关系 | 经由 |
|---|---|---|---|
| 执行环境 | 代码执行 | 客户与供应商：环境的执行器登记到 `executor` 路由，按 ID 精确选择 | `EnvironmentProvider`、`EXECUTOR` |
| 编译（IR） | 智能体 | 遵奉者：MCP 服务以 IR 为公开语言读取文稿 | IR、`AgentTool` |
| 智能体 | 外部 agent | 开放主机服务：MCP 工具与资源，任何 MCP 客户端都可以用 | `@presmium/mcp` |
| 外部 DeepSeek Harness | 智能体 | 防腐层：`@presmium/dsh` 是唯一接触 dsh 接口的包（第 16 节） | bundle 的行 |
| 工作区 | 智能体、讲授 | 客户与供应商：修改提交为 git 提交，撤销即 `git revert` | `REVISIONS` |
| 智能体 | 工作区、讲授、课堂 | 客户与供应商：会话的修改经工作区的审阅、讲授的 agent 工具、课堂中的 AI 回答 | `CHANGE_REVIEW`、`AgentTool`、`ASK` |
| 语音（讲授的一部分） | 讲授、智能体 | 客户与供应商：转写与合成 | `SPEECH` |
| 外部语音服务 | 语音 | 防腐层：语音插件的引擎适配器，对内只有 OpenAI 音频接口的形态（语音协议） | `addon-speech` |
| 外部 Jupyter Server | 执行环境 | 防腐层：Jupyter 内核协议的客户端 | `addon-exec-jupyter` |
| 宿主适配 | 讲授、引导、代码执行 | 共享内核：插件报告操作，讲授录制并重放 | `OPERATIONS`、`TrackEvent` |
| 服务端（宿主适配） | 执行环境、语音、智能体、工作区、讲授 | 宿主：挂载服务端贡献，处理身份、权限、凭据、运营者设置与确认；为 agent 会话签发 MCP 令牌 | `ServerContribution`、`ServerContext.settings`、`APPROVALS`、`MCP_ENDPOINT`、`useServer` |

与工作台有关的关系（第 16 节）：

| 上游 | 下游 | 关系 | 经由 |
|---|---|---|---|
| 渲染（产物） | 工作台 | 开放主机服务：产物只暴露锚点，经预览协议回答点选与位置 | `PREVIEW_PROTOCOL`、`data-section`、`data-block`、`data-step` |
| 工作区（工作区服务） | 工作台 | 客户与供应商：文档、源码、IR 与诊断、审阅、修改历史、焦点 | 工作区服务的路由、`ir/events` |
| 智能体（MCP） | 工作台中的 agent、外部 agent | 开放主机服务：一张工具表，两个适配器（MCP 与 dsh 工具） | `@presmium/mcp` |
| 外部 DeepSeek Harness | 工作台 | 防腐层：只有 `@presmium/dsh` 引用它的接口，`@presmium/studio` 只启动它 | bundle 的行、客户端插件 |

## 3. 内核

### 通用语言

| 中文 | 标识符 | 含义 |
|---|---|---|
| 插件 | `PluginDefinition` | 清单加初始化函数与可选的 `dispose` |
| 插件清单 | `PluginManifest` | ID、版本、兼容内核版本、提供与依赖的服务、所需能力 |
| Node 端插件 | `PresmiumNodePlugin` | 插件在编译、渲染与服务端中的部分：指令、行内角色、编译步骤、执行器、环境提供方、渲染端、渲染端扩展、检查项、Node 端服务、服务端贡献、agent 工具 |
| Node 端服务 | `PresmiumNodePlugin.services` | 插件在 Node 端提供的服务实现（如 `SPEECH`），编译步骤、渲染端与服务端贡献经 `service(token)` 使用；同浏览器端一样，一个令牌只有一个实现 |
| 服务令牌 | `ServiceToken<T>` | 以字符串 ID 标识的服务接口，由 `defineService` 创建 |
| 服务注册表 | `ServiceRegistry` | 登记服务实现、解析依赖 |
| 内核 | `Kernel` | 注册插件、按依赖顺序启动、产出启动报告 |
| 启动报告 | `StartReport` | 每个插件的状态：已启动、已降级、已禁用、失败，及原因 |
| 锚点 | `AnchorString` | 稳定引用，形如 `region:src/math.py#add` |
| 锚点解析器 | `AnchorResolver` | 按方案（scheme）解析锚点 |
| 解析结果 | `Resolution` | 状态（`ResolutionStatus`）加位置与内容指纹（`fingerprint` 字段，归一化内容的哈希） |
| 锚点锁定 | `AnchorLock` | 锚点的指纹记录，存于 `.presmium/anchors.lock.json` |
| 检查项 | `Check` | 对文稿运行、产出诊断的函数 |
| 诊断 | `Finding` | 严重级别、消息、源码位置、修复建议 |
| 步骤区间 | `StepRange` | 一个提示或高亮生效的步骤范围 `[from, to)` |
| 光标 | `Cursor` | 当前位置 `{ slide, step }` |

### 聚合与不变量

**Kernel（聚合根）**

- 同一插件 ID 只能注册一次。
- 同一服务令牌在同一作用域内只能有一个实现。
- 插件按服务依赖拓扑排序启动；存在环时，环上插件全部禁用并报告环路。
- 必需依赖缺失时插件被禁用；可选依赖缺失时插件以降级状态启动。
- 插件声明的内核版本范围不兼容当前内核时，插件被禁用。
- 单个插件初始化抛错时，只禁用该插件及必需依赖它的插件。

**Resolution（值对象）**

- `exact`：按原方式找到，指纹与记录一致（或尚无记录）。
- `moved`：找到，指纹一致，但位置变化。
- `fuzzy`：原方式找不到，按相似度找到候选，需要人工确认。
- `lost`：找不到。
- 只有 `exact` 与 `moved` 可以直接用于渲染；`fuzzy` 与 `lost` 必须产生诊断。

### 领域事件

内核在事件总线（`EventBus`）上发出 `kernel.plugin.started`、`kernel.plugin.degraded`、`kernel.plugin.disabled`、`kernel.plugin.failed`。其他上下文目前不发出领域事件，各节列出的事件是规划中的名字。

## 3A. 编译

| 中文 | 标识符 | 含义 |
|---|---|---|
| 源码 | 入口文件（`IRDocument.meta.entry`）及其 `{include}` 的文件 | 文稿的 MyST 源码 |
| 指令 | `DirectiveSpec` | 插件注册的 MyST 指令，把源码节点转换为 IR 节点 |
| 编译步骤 | `IRPass` | IR 上的有序变换 |
| 中间表示 | `IRDocument` | 编译结果：章节、块、步骤、讲解、录制输出 |
| 章节 | `IRSection` | 一页幻灯片、一节网页；带提示 `hints` 与可选的章节配置 `config` |
| 块 | `IRBlock` | 章节中的一个单元：角色、出现与消失的步骤、内部步数、节点 |
| 块角色 | `BlockRole` | `visual`（上屏内容）或 `narration`（讲解） |
| 执行规格 | `RunSpec` | 代码节点的 `run`：语言、参数、超时、执行时机（编译时、现场、两者）、指定的执行器（`:env:` 编译为 `presmium.env.<名>`）、执行会话 `session` |
| 执行缓存 | `RunCache` | 按内容哈希保存的执行结果（`RecordedRun`），位于 `.presmium/freeze/`；较大的 MIME 数据单独存为 `blobs/<sha256>` |
| 会话键链 | 编译时执行的缓存键 | 同一会话中第 i 个代码块的键包含第 i−1 个的键（第 12 节） |
| 行内角色 | `RoleSpec`（`PresmiumNodePlugin.roles`） | 插件登记的 MyST 角色，如 `{cue}`、`{say}`；IR 中为 mdast 节点 `presmiumRole` |
| 受众 | `IRBlock.audience`、`IRSection.audience` | 只给某些受众的块与章节，如 `teacher`；`--audience` 在编译时筛掉其余受众的内容（第 10 节） |
| 译本 | 头部 `translations`，译本的 `meta.translationOf` | 同一文稿的另一种语言的入口文件，记录它所依据的原文摘要（第 9 节） |

不变量：

- 编译是确定的：同一源码、同一缓存得到相同的 IR。
- 每个章节 ID 在文稿内唯一；块 ID 在章节内唯一。
- 讲解块的 `at` 不超过所在章节的步骤数。
- 编译诊断与检查诊断使用同一个 `Finding` 类型，都带源码位置。
- 不认识的角色保留文字并给出警告；登记过的角色在 IR 中保留为 `presmiumRole` 节点，不认识它的渲染端只显示它的子内容。
- 不指定环境与会话的代码块，IR 中没有 `executor` 与 `session`，缓存键只由这个代码块自己的输入决定。
- 受众筛选在编译时完成：带 `--audience` 编译出的 IR 中没有其他受众的块与章节，所有渲染端都拿不到它们。

规划中的领域事件：`DocumentCompiled`、`RunRecorded`、`RunCacheHit`（编译报告与 `presmium build` 的“code runs”统计目前承担其作用）。

## 3B. 渲染

| 中文 | 标识符 | 含义 |
|---|---|---|
| 渲染端 | `Renderer` | 从 IR 生成一种媒介 |
| 支持程度 | `Support` | `full`、`degraded`、`none` |
| 渲染扩展 | `RendererExtension` | 插件为某个渲染端提供的组件转换 |
| 渲染输出 | `RenderOutput` | 产物目录与未渲染的块；与编译诊断一起组成构建报告 |
| 运行时视图 | `ViewDefinition` | IR 运行时中的一种呈现方式：文档、滚动叙事、放映，可由插件注册 |
| 实时更新 | `LiveUpdate` | `presmium dev` 推送的变化章节、章节顺序与诊断 |
| 富输出的渲染 | `registerNodeRenderer('mime:<类型>')` | 按 MIME 类型显示执行输出；插件可以为新的类型注册渲染器 |
| 讲授渲染端 | `addon-lecture` 的 `lecture` 渲染端 | 把 IR 编译为讲授计划（每一步要说的文字与提示标记）并合成音频（第 15 节） |
| 工作区站点 | `Renderer.buildSite`、`SiteSpec` | 多份文档组成的一个网站（第 14 节） |

不变量：

- 网页渲染端对所有节点的支持程度都是 `full`。
- 渲染端只读 IR，不读源码，不回写源码。
- 支持程度为 `none` 的块必须出现在构建报告中；notebook 中无法转换的 MyST 节点作为降级列出。

## 4. 宿主适配

`@presmium/host` 定义形态无关的宿主接口 `HostAdapter`（`architecture.md` 4.4 节），`@presmium/slidev-addon-core` 与 `@presmium/web` 分别实现。

| 中文 | 标识符 | 幻灯片形态（Slidev） | 网页形态（VitePress + IR 运行时） |
|---|---|---|---|
| 形态 | `PresentationMode` | `'slides'` | `'document'` |
| 光标 | `Cursor { slide, step }` | `useNav()` 的当前页与 `$clicks` | 当前章节与步骤：文档视图全部展开，滚动叙事视图由滚动推导，放映视图由键盘推进 |
| 步骤状态 | `useStep()`（绝对步骤），组件用 `useStepState(range)`（相对于块的步骤作用域） | 由 `$clicks` 推导 | 文档视图恒为已到达（`Infinity`）；其他视图由当前步骤推导 |
| 视图角色 | `ViewRole` | 听众、演讲者 | 读者；放映视图的演讲者窗口为演讲者 |
| 共享状态 | 组件用 `useSharedState(key, initial, { scope })`，作用域 `SharedStateScope` | `createSharedStates`：`view` 只在本视图，`local` 与 `remote` 经 BroadcastChannel 在本机的窗口之间传递（通道按文稿标题与基础路径区分），`remote` 另是同步通道 | 同左 |
| 同步传输 | `SyncTransport` | `syncTransports` 服务把每个传输接入全部 `remote` 共享状态；另经 `addSyncMethod` 接入 Slidev 同步的导航与圈画 | `syncTransports` 服务把每个传输接入全部 `remote` 共享状态；跟随主讲通过导航服务实现 |
| 导航 | `Navigation` | 当前页与步骤，`go()` 跳转 | IR 运行时的章节、步骤与视图，`go()` 跳转 |
| 错误边界 | `PmBoundary` | Vue `onErrorCaptured` | 同左 |
| 演讲者面板 | `PresenterPanel` | 只在演讲者视图中显示的全局图层 | 放映视图的演讲者窗口中显示 |
| 工具栏 | `ToolbarItem` | 导航栏中的控件 | 顶部导航栏与手机导航菜单中的控件 |
| 操作 | `Operations`（`OPERATIONS`）、`Operation` | 服务同样存在；幻灯片形态不录制讲授，导航不报告 | IR 运行时报告 `go`，执行插件报告 `run`，引导插件报告 `spot`、`hint`；讲授插件录制与重放 |
| 服务端访问 | `useServer()`、`ServerClient` | `presmium dev` 中可用（开发服务器代理 `/__presmium/`）；静态产物中 `available` 为 false | 同左；`presmium serve` 中同样（成员是本机作者） |
| 状态摘要 | `StatusRegistry`（`STATUS`） | 插件登记的 JSON 摘要（如课堂的作答统计），经控制通道送到服务端，供 agent 读取 | 同左 |

**步骤可逆约定**：插件组件的视觉状态必须是步骤的纯函数。组件通过 `v-click` 标记向宿主登记步骤（网页形态由兼容层处理），用 `useStepState` 读取状态，不在点击事件回调中修改不可回放的状态。

**操作可重放约定**：插件把用户的操作（不是重放引起的变化）以章节、块与锚点为坐标报告给 `OPERATIONS`，并为自己的操作类型登记重放；重放某一时刻的状态等于从空状态依次应用此前的全部操作。宿主在重放时把 `replaying` 置为 true，插件此时不报告。

## 4A. 服务端

`@presmium/server` 是宿主适配在 Node 端的对应物：`presmium dev` 与 `presmium serve` 进程中唯一的 HTTP 服务。它挂载插件的服务端贡献，统一处理请求来源、凭据与确认（`architecture.md` 第 10 节）。服务端只供运行它的那个用户使用：被执行的代码与 agent 以这个用户的身份受信任，措施是纵深防御，没有登录；多人使用时每人一个工作区（hub 托管模板）。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 服务端 | `@presmium/server` 的 `startServer` | 插件的路由与代理、MCP 端点、控制通道；`presmium dev` 中只监听本机，渲染端的开发服务器把 `/__presmium/` 代理到它；`presmium serve` 中它是唯一的端口，默认只监听本机，`--host` 时也在局域网上 |
| 服务端贡献 | `ServerContribution` | 插件挂在 `/__presmium/<插件 ID>/` 下的路由 `Route` 与反向代理 `ProxySpec`，各自声明所需的最低角色 |
| 服务端上下文 | `ServerContext` | 插件创建服务端贡献时得到的文稿目录、配置、Node 端服务与凭据 |
| 请求上下文 | `RequestContext` | 发起请求的成员、请求所属的文档、路由之后的路径 |
| 成员 | `Member` | 发起请求的人：ID、名字、角色 `MemberRole`（`reader` 读者、`editor` 编辑者、`owner` 所有者）；`presmium dev` 与 `presmium serve` 中都是本机作者 `LOCAL_AUTHOR`，角色为所有者（角色的契约保留，工作区配置不列出成员） |
| 局域网访问 | `presmium serve --host <地址>` | 同一个用户在局域网中的其他设备上使用服务：请求的 `Host` 与 `Origin` 另可以是监听的地址与本机的名字；没有登录，到得了端口的设备都是本机作者，启动时警告 |
| 操作确认 | `Approvals`（`APPROVALS`）、`ApprovalRequest` | 会改变状态或花钱的操作执行前的确认，种类 `ApprovalKind`：`operate`（跳转放映、运行代码、构建、开关课堂）、`spend`（计费的语音调用）、`write`（agent 写入当前文档目录之外，或改动工作区配置）、`agent`（agent 自身的权限请求） |
| 确认范围 | `ApprovalScope`（`ApprovalRequest.scope`） | 决定谁能回答：`content`（发起成员自己的文档与会话：任务的文档目录中的文件、MCP 的操作类与计费类工具）发给发起任务的成员；`workspace`（工作区配置、确认策略、运营者设置、同意记录、文档目录之外的路径、agent 的 shell 与网络权限请求）只发给所有者；没有标明时按 `workspace` |
| 确认策略 | `presmium dev --allow`、`presmium.workspace.yaml` 的 `approvals` | 每种确认取 `off`（不提供这类操作）、`ask`（默认）或 `allow`（不询问） |
| 执行的环境变量 | `RunContext.env` | 编译时执行的代码能得到的全部环境变量：`build`、`check`、`dev` 中是进程的环境去掉 `PRESMIUM_` 开头与像凭据的变量，`serve` 中只有允许列表；都加上运营者设置 `settings.presmium.exec.passEnv` 列出的变量 |
| 运营者插件 | `settings.presmium.workspace.plugins`；`PresmiumNodePlugin.operator` | 运营者安装在工作区根目录、列在设置中的插件包，声明了 `operator` 的每份文档与工作区首页都加载；文稿列出的插件与渲染端包在所有命令中照常加载 |
| 进程沙箱 | `ProcessSandbox`（`PROCESS_SANDBOX`） | 编译时执行的子进程在其中运行：网络拒绝，看不到其他进程与 Unix 套接字，只能写运行目录；由运营者插件提供（可选） |
| 控制通道 | 服务端内置的 `/__presmium/presmium.server/control` | 页面向服务端报告位置与状态摘要，接收跳转、开关课堂与确认请求 |
| 凭据 | `ServerContext.secret(name)` | 只来自 `presmium` 进程的环境变量的密钥；与它要发往的地址成对给出（如 `PRESMIUM_ENV_<名>_TOKEN` 与 `PRESMIUM_ENV_<名>_URL`） |
| 运营者设置 | `ServerContext.settings`、`NodeServiceContext.settings` | 运营者给插件的设置：工作区配置 `presmium.workspace.yaml` 的 `settings.<插件 ID>`，如工作区的插件列表、agent 的替换命令与模型的服务提供方、修改的审阅、编译时执行传入的环境变量、录音的去处、是否允许克隆音色、同意记录的目录；与文稿配置 `config` 不同，文稿与 agent 改不了正在运行的设置 |
| 运营者目录 | 用户状态目录中按工作区区分的 `presmium/operator/<工作区标识>/`（`NodeServiceContext.operatorDir`、`ServerContext.operatorDir`） | 运营者的数据（同意记录目录 `consent/`），在任何工作区与文档目录之外，不属于任何文档：不进入提交；agent 对它的权限请求一律拒绝 |
| MCP 访问 | `McpEndpoint`（`MCP_ENDPOINT`）、`McpAccess` | 服务端为一个 agent 会话签发的 `/mcp` 地址与令牌，令牌绑定成员与模式，会话关闭时作废；`presmium dev` 与 `presmium serve` 另有每个进程的令牌，供本机作者的外部 agent（Claude Code、Codex 等），只写在 0600 的状态文件中，启动时打印这个文件的位置 |
| 课堂同步 | 会话插件的服务端贡献，`/__presmium/presmium.session/sync` | 服务端自己的端口上的课堂服务（与 `presmium-classroom-server` 同一协议）；文稿没有写课堂服务时，页面连到这里 |

不变量：

- 凭据只在服务端：不写入文稿、IR、构建产物与浏览器；浏览器经服务端的代理访问需要凭据的服务。
- **不声称隔离同一 uid 的代码**：被执行的代码与 agent 能读这个用户能读的一切（包括 `presmium` 进程的 `/proc/<pid>/environ`），措施是纵深防御（清理过的环境、可用时的进程沙箱、确认与审阅），残余风险写在 `architecture.md` 9.4 节。
- 默认只监听本机，并校验 `Host` 与 `Origin`；`presmium serve --host` 时另接受监听的地址与本机的名字，其他站点的页面照旧被拒绝。
- 本机的检查与角色在挂载点完成；插件的路由只声明所需的最低角色，不各自实现。
- 确认的关口在服务端：任何 agent 运行时、任何 MCP 客户端调用操作类工具，都经同一个 `Approvals`，换用其他运行时同样生效。
- 确认策略不来自文稿：文稿是内容，不能关闭确认；`allow` 只能由本机作者在命令行或工作区配置中设置。
- **确认按范围分发**：`workspace` 范围的确认只有所有者（本机作者）能回答。
- **文稿不决定凭据的去向**：凭据只发往运营者为它给出的地址；文稿只用名字选择环境与引擎，文稿中的地址与运营者的地址不同源时不连接。
- **编译时执行的代码经自己的环境拿不到凭据**：他们写的代码在编译时只得到 `RunContext.env`，执行器不读进程的环境（打印全部环境变量的代码因此不会把凭据写进录制）；全部执行，可用时经进程沙箱（`architecture.md` 10.6 节）。
- 运营者设置在进程启动时读取一次；改动要等运营者重启才生效。

**服务端（聚合根，每个进程一个）**：挂载的贡献、待回答的确认与签发的 MCP 令牌；令牌与确认都只在这个进程中有效。

规划中的领域事件：`ApprovalRequested`、`ApprovalDecided`（目前以控制通道上的消息体现）。

## 5. 代码引用

| 中文 | 标识符 | 含义 |
|---|---|---|
| 代码引用 | `CodeRefSpec` | `{code-ref}` 的声明：锚点、可选的锁定提交（`pin`）、逐步高亮的单元（`steps`）、版本（`variants`）、仓库网址 |
| 代码来源 | `CodeOrigin`（IR 的 `CodeNode.origin`） | 解析后的文件与行区间、锁定提交 `pin`、永久链接 `permalink`、解析状态、逻辑单元 `units`、漂移状态 `drift` |
| 逻辑单元 | `Region` | 被嵌套 `#region` 标记出的子区间，用于分步高亮 |
| 代码版本 | `CodeVariant`（IR 的 `CodeNode.variants`） | 同一代码块在某个提交的版本，逐步切换 |

不变量：

- 锁定提交存在时，渲染内容必须来自该提交，而不是工作区。
- 永久链接只在能解析出远端仓库地址时生成；否则不带链接并产生 `info` 诊断。
- 锁定的代码与工作区不同时（`drift: 'drifted'`）产生漂移诊断。
- 分步高亮的区间由逻辑单元名称换算为行号，换算在构建时完成，文稿源码中不出现行号。

规划中的领域事件：`DriftDetected`、`AnchorLost`（目前以诊断报告）。

## 6. 代码执行

| 中文 | 标识符 | 含义 |
|---|---|---|
| 执行器 | `Executor` | 服务接口：`supports(lang)`、`run(request, signal?, ctx?)`（编译时由编译器给出 `RunContext`，其中是代码能得到的全部环境变量，4A 节），可选的环境指纹 `fingerprint` 与 `endSession` |
| 执行路由 | `ExecutorRouter` | `executor` 服务：请求指定了执行器时只交给它；否则按语言与优先级交给已登记的执行器 |
| 执行请求 | `RunRequest` | 语言、代码、参数、标准输入、文件、超时，可选的指定执行器 `executor` 与执行会话 `session` |
| 执行结果 | `RunResult` | 输出、退出码、耗时、是否超时、来源（现场或预录）、执行器，可选的富输出 `outputs` |
| 运行记录 | `RunHistory` | 一个代码块在当前视图中的多次运行（`RunRecord`），可两两对比 |
| 执行轨迹 | `Trace` | 逐行执行事件序列，用于分步执行 |
| 预录输出 | `RecordedOutput` | 执行失败或超时时的回退内容 |
| 运行环境 | `Devcontainer`（本地容器）；浏览器中为 Pyodide 与脚本 Worker | 代码运行的环境 |

不变量：

- 执行失败或超时，且存在预录输出时，必须显示预录输出并标明来源。
- 指定的执行器精确匹配：它没有登记或不支持该语言时运行失败，由预录输出回退，不改用其他执行器。
- 运行记录只保存在当前视图，不写回文稿。
- 分步执行的每一步对应一个步骤，后退时显示该步之前的累计输出。

服务：`executor`（多个实现按语言组合，由 `ExecutorRouter` 汇总）。具名环境、执行会话与富输出见第 12 节。

## 7. 引导

| 中文 | 标识符 | 含义 |
|---|---|---|
| 目标 | `CueTarget` | CSS 选择器 |
| 路径点 | `Waypoint` | 光标路径上的一点：目标、动作（移动、悬停、点击）、到达的步骤 |
| 聚光 | `PmSpotlight` | 遮罩加高亮区域 |
| 交互提示 | `PmHint` | 指向可交互元素的提示动画 |

不变量：提示状态只由当前步骤决定；系统开启“减少动态效果”时，动画退化为直接显示终态。引导插件把聚光与提示报告为操作 `spot`、`hint`，并登记它们的重放（4 节）。

## 7A. 富内容

| 中文 | 标识符 | 含义 |
|---|---|---|
| 媒体 | `PmMedia`（`{video}`、`{audio}`、`{animation}`） | 媒体文件与播放选项；本地文件经组件的 `assets` 随产物发布 |
| 封面 | `PmMedia` 的属性 `poster` | 视频播放前显示的图片 |
| 字幕轨 | `PmMedia` 的属性 `captions`（语言到 VTT 文件） | 各语言的字幕，浏览器原生的 `<track>`；`assets` 的键为属性路径 `captions.<语言>` |
| 卡片、栅格、选项卡、按钮 | mdast 节点 `card`、`grid`、`tabSet` 与 `tabItem`、`{button}` 生成的链接 | MyST 标准写法，作为 `markdown` 节点进入 IR，不是组件 |

不变量：

- 媒体、封面与字幕文件随每种媒介发布；本地文件不存在时报错，带源码位置。
- 卡片、栅格与选项卡在网页中完整显示；幻灯片中选项卡依次展开；notebook 降级为标题加段落，并列入构建报告。

## 8. 课堂

| 中文 | 标识符 | 含义 |
|---|---|---|
| 课堂会话 | `SessionSnapshot` | 课堂 ID、状态 `SessionStatus`（未开始、进行中、已结束）、当前参与者 |
| 参与者 | `Participant` | ID、昵称、角色 `Role`（`presenter` 主讲、`learner` 学习者） |
| 跟随模式 | `FollowMode` | `follow` 跟随主讲或 `free` 自主浏览 |
| 主讲的位置 | `Position`（会话记录的 `cursor`） | 章节序号、步骤、视图，以及按 ID 的位置：章节 ID、已到达的步骤的键 `trail`（块 ID）、只给部分受众的章节要回退到的章节 `back`；学习者按它们在自己的版本中定位，所以完整版的主讲与学生版的学习者到同一节的同一步 |
| 位置 | `Place` | 课堂组件所在的章节与块；总览按本窗口版本的章节序号（`SectionNumbers`，按章节 ID）编号，不用写入者版本的序号 |
| 测验 | `QuizSource`（题目与答案）、`QuizState`（开放与关闭） | 页内客观题 |
| 作答 | `Answer` | 参与者对测验的一次作答，每人每题只计最后一次 |
| 练习 | `ExerciseSource` | 题面、起始代码、校验用例 |
| 提交 | `Submission` | 代码与校验结果，标记典型错误 |
| 提问 | `Question` | 内容、提问者、挂载的块、状态 |
| 理解度 | `PulseVote` | 参与者在某页的理解程度投票 |
| 笔记 | `Note` | 参与者的私有笔记，挂载到章节或带标签的块 |
| 预测 | `{predict}`、`PmPredict`；作答为 `Prediction` | 学习者先写下的预测（文字或选项）；之后一步的内容是它的揭示内容 |

不变量：

- 只有主讲人能开放或关闭测验、结束课堂、标记问题已回答。
- 课堂结束后不再接受作答、提交与提问。
- 笔记只对作者可见。
- 统计只统计每位参与者的最后一次作答或投票。
- 揭示内容在读者保存预测之前不显示；投在全班面前的放映画面按步骤显示。预测保存在本机（`SavedPrediction`，保存后不能修改），课堂中学习者的预测另写入 `predictions` 集合（`Prediction`，键含参与者 ID），主讲看到分布（`PredictionTally`，每人只计最后一次）。

信任模型：课堂服务（`@presmium/classroom-server`）面向课堂自己的网络，不验证参与者身份，拿到加入链接的人都能连接。主讲人的权利由服务端强制：创建课堂的窗口连接时声明房间密钥（`?claim=<key>`），只有持有该密钥的连接可以写入课堂状态与测验的开放状态、归档课堂；学习者只能写入自己参与者 ID 下的作答：服务端在键中按集合找参与者 ID 的位置（作答等在最后一段，提问在第一段），不在键的其他位置找，键上已属于他人的条目不能改写或删除。学习者的私有笔记在各自的房间中。

服务：`session`（当前参与者、角色、课堂状态）、`classroomStore`（共享文档的读写）。课堂插件向宿主的 `STATUS` 登记不含学习者身份的汇总 `ClassroomSummary`（参与人数、作答、预测与理解度的分布、练习的提交与通过人数、未回答的问题数；不含昵称、参与者 ID 与学习者写下的文字），agent 经 MCP 读取。

规划中的领域事件：`ParticipantJoined`、`QuizOpened`、`AnswerSubmitted`、`QuestionAsked`、`SessionEnded`（目前由共享文档的变化体现）。

## 9. 网页形态

网页形态由 IR 生成，不由幻灯片转换：VitePress 提供外壳（导航、侧栏、页内大纲、搜索、深色模式），页面正文由 IR 运行时 `@presmium/viewer` 在浏览器中动态渲染（`ir.md` 第 8 节）。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 网页页面 | `WebPage` | 一个 VitePress 页面：同一源文件中连续的若干章节；第一个页面是 `index` |
| 章节视图 | `SectionView` | 一个章节在页面中的呈现：标题、上屏内容与讲解按源码顺序排列 |
| 排版方式 | `SectionLayout` | `document`（文档式，默认）或 `scrolly`（滚动叙事式），由 `{hints}` 声明 |
| 运行时视图 | `ViewDefinition` | 文档、滚动叙事、放映三种视图，以及插件注册的视图 |
| 媒介限定 | `IRBlock.only` | `{only}` 声明的块只出现在列出的渲染端 |
| 形态映射 | 章节 ID 与 `index` | 章节 `index` 即幻灯片页号，章节 ID 即网页锚点；两种形态据此互相跳转 |
| 站点外壳 | `renderers.web` 的 `nav`、`footer`、`head`、`sitemap` | 顶部导航、页脚、页面元数据（描述、OG）与站点地图 |
| 发布的文件 | `RenderContext.localAsset` 给出的发布名 | 正文链接的本地文件、目录的文件清单页、原始 HTML 中 `src`、`poster` 引用的文件 |
| 译本 | 头部 `translations`、`RenderContext.translations` | 同一文稿的其他语言版本，网页按 VitePress 的 `locales` 切换 |

不变量：

- 每个章节恰好对应一页幻灯片和一节网页，章节 ID 稳定（来自 MyST 标签或标题），形态切换依赖此映射。
- 讲解在网页中是正文；文档视图全部显示，滚动叙事视图随滚动推进步骤。
- 网页搜索索引在构建时从 IR 文本生成并随产物发布，离线可用。
- IR 运行时渲染的 `.pm-section[data-section]`、`.pm-block[data-block]` 是对外的标记契约（课堂笔记、讲授的指针录制与工作台的点选据此定位）。
- 三种媒介发布同一组正文链接的本地文件；无法发布的本地引用产生诊断。
- 译本记录它所依据的原文摘要；原文改动后 `presmium check` 报告译本过期。

## 10. 发布

| 中文 | 标识符 | 含义 |
|---|---|---|
| 导出任务 | `ExportJob` | 格式、范围、是否按步骤展开 |
| 离线清单 | `OfflineManifest` | 需要预缓存的资源 |
| 视觉差异 | `VisualDiff` | 两个提交在同一页同一步骤上的像素差异比例 |
| 发布检查 | 检查项 `presmium.links`、`presmium.directive`、`presmium.forbid` | 各媒介中无法解析的本地链接与 `#片段`、MyST 指令错误、文稿头部 `checks.forbid` 中正则的命中 |
| 受众 | `IRBlock.audience`、`IRSection.audience` | 只给某些受众（如 `teacher`）的块与章节 |
| 学生版 | `presmium build --audience student` | 只含不带受众或受众包含 `student` 的内容的构建 |
| 完整编译的学生版 | `Compilation.forAudience('student')`、`build` 的 `audience` 选项 | 在完整编译的文稿上做与学生版同样的筛选，并按泄漏扫描的句子再去掉块；服务端与 MCP 不给出它（`presmium serve` 只供本机作者使用） |
| 泄漏检查 | 检查项 `presmium.audience` | 带 `--audience` 构建后扫描产物，发现被筛掉的内容的文字即报错 |

不变量：

- 视觉差异超过阈值的页必须列入报告；导出的 PDF 中，幻灯片显示的每个链接（包括代码的永久链接）都必须仍是链接，丢失的链接带源码位置报告。
- 发布检查按每个渲染端的视图进行：只出现在某个媒介中的链接只在该媒介中检查。
- 不带受众的内容对所有受众可见；学生版的 IR 与全部产物（页面、搜索索引、`ir.json`、幻灯片备注、notebook）中都没有被筛掉的内容。
- 学习者得到学生版的构建（`presmium build --audience student`），发布为静态站点；服务端只有本机作者一个成员，没有读者看到的视图，MCP 的每个令牌都读完整的文稿。读者问答的上下文取自学生版页面中的 IR，所以回答不会引用只给教师的内容（第 13 节）。学生版发布的录制讲授只保留摘要与录制时相同的章节（第 15 节）。

## 11. 编辑

语言服务 `@presmium/language-server` 用 `@presmium/compiler` 编译编辑中的文稿，通过 LSP 提供诊断、锚点跳转、悬停（引用的代码与最近一次输出）与补全（region 名、指令与选项）；VS Code 扩展 `presmium-vscode` 启动它，并把编辑器光标所在的章节发给 `presmium dev` 的预览。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 锚点引用 | `AnchorRef` | 源码中写出的一个锚点及其行与列，用于跳转与悬停 |
| 光标所在章节 | `SectionAt` | 编辑器位置对应的章节 ID，用于预览同步 |

不变量：编辑只在源码中进行，语言服务与预览都不修改源码；浏览器中的源码编辑器同样只写源码文件（14 节）。

## 12. 执行环境

执行环境与语言分离：文稿头部声明具名环境，代码块与执行面板用 `:env:` 选择环境，编译器把它写成指定的执行器 `presmium.env.<名>`，`executor` 路由据此精确选择。远端只对接 Jupyter 内核协议，部署差异交给现成的基础设施（`architecture.md` 第 10 节）。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 具名环境 | `EnvironmentSpec`（IR 的 `config.execute.environments`） | 文稿头部声明的运行环境：提供方类型 `kind`、地址、内核规格、可用语言、凭据方式、镜像摘要；不含凭据 |
| 默认环境 | `ExecuteConfig.env` | 有 `:run:` 而不写 `:env:` 的代码块所用的环境；省略或为保留名 `browser` 时按语言路由 |
| 环境提供方 | `EnvironmentProvider`（`PresmiumNodePlugin.environments`） | 插件按 `kind` 为声明的环境创建 Node 端执行器，并可探测环境是否可达；浏览器端由同一插件为同类环境登记执行器 |
| 环境执行器 | `environmentExecutor(name)` | 具名环境的执行器 ID `presmium.env.<名>`，即代码块的 `RunSpec.executor` |
| 环境指纹 | `Executor.fingerprint` | 运行时的身份，进入编译时执行的缓存键：Jupyter 为镜像摘要、内核规格哈希与内核报告的版本；WASI 为运行时二进制的哈希；WebGPU 为浏览器与显卡适配器的描述；本地 Python 为解释器的版本 |
| 执行器的修订 | `Executor.revision` | 执行器自己影响输出的代码的修订（本地 Python 为运行器 `runner.py` 的摘要），与环境指纹一起进入缓存键；另一修订的录制已过时，执行器可用时重新执行 |
| 凭据方式 | `EnvironmentAuth` | `env`（构建机的环境变量，编译时）、`proxy`（服务端代理代加，浏览器拿不到）、`prompt`（学习者粘贴自己的令牌，用于静态站点）、`hub`（预留）、`none`；`env` 与 `proxy` 的令牌只发往运营者在同一对环境变量中给出的地址（`PRESMIUM_ENV_<名>_URL`） |
| 执行会话 | `RunSpec.session`、`RunRequest.session` | 共享解释器状态的一组运行；浏览器中按（页面实例，学习者）隔离，编译时按代码块在文稿中出现的顺序执行 |
| 重置会话 | `Executor.endSession` | 丢弃会话的状态：重启或关闭解释器、内核 |
| 富输出 | `RunOutput`（`RunResult.outputs`） | nbformat 的输出：文本流、显示数据与执行结果（MIME 类型到数据）、错误 |
| 正文输出 | `CodeNode.echo: false` | 不显示代码，只显示输出；`text/markdown` 输出按正文显示，用于从数据生成表格与列表 |
| 录制块 | `.presmium/freeze/blobs/<sha256>` | 录制中较大的 MIME 数据按内容哈希单独存放，录制记录只保存引用 |
| WebAssembly 后端 | `addon-exec-wasi` 的执行器 | 浏览器与编译时用同一份 WASI 二进制运行 C、C++、Ruby、SQLite 等程序 |
| 浏览器 GPU 后端 | `addon-exec-webgpu` 的执行器 | WebGPU 计算着色器（`wgsl`）与张量代码；不可用时按原因回退到录制输出 |
| 远端环境 | `addon-exec-jupyter` 的执行器 | 任何 Jupyter Server：docker compose、JupyterHub、Binder、Kubernetes 沙箱、托管服务 |
| 部署模板 | `templates/env/compose/` | 随仓库维护的 docker compose 模板（可选 gVisor 与 GPU 覆盖，附 devcontainer 定义）；Kubernetes 与轻量虚拟化只给文档 |
| 浏览器终端 | `{terminal}`、`PmTerminal` | 远端环境中的终端，经 Jupyter Server 的终端接口 |

**执行配置（聚合根，`ExecuteConfig`）**：文稿声明的默认环境与全部具名环境。具名环境是其中的值对象：名字在文稿内唯一，`browser` 是保留名；同一个名字在浏览器与编译时指向同一种运行时。

**执行会话（聚合根，以会话 ID 标识）**：同一会话的运行按请求顺序执行、共享解释器状态，只用一个环境。浏览器中的会话 ID 由代码块的 `:session:` 加上页面实例的标识组成，重新加载页面即是新会话；编译时的会话 ID 由文稿与 `:session:` 组成，构建结束时结束。

不变量：

1. **不指定环境的代码块按语言路由**：IR 中没有 `executor` 与 `session`，缓存键只由代码块自己的输入决定。
2. **环境不可用时不悄悄换环境**：指定的执行器没有登记、缺凭据、不可达或超时，运行失败，显示录制输出与原因（第 6 节），不改到别的执行器上运行。
3. **会话代码块的缓存键包含前序代码**：同一会话中第 i 个代码块的键是第 i−1 个的键加上本块的输入、执行器与环境指纹；有一块未命中时，整个会话从头重新执行并重新录制。
4. 同一会话的代码块使用同一个环境；在一个会话中混用环境是错误。
5. 文稿与 IR 不含凭据；`presmium check` 对文稿头部中像凭据的字段告警。文稿中的地址不决定凭据的去向：服务端的令牌只发往运营者给出的地址，与文稿的 `url` 不同源时不连接。编译时执行的代码只得到清理过的环境变量（`RunContext.env`，4A 节），执行器不读进程的环境，所以代码不会经自己的环境把服务端的凭据带进录制、IR 与产物；有意读取其他进程信息的代码只由可用时的进程沙箱挡住，是残余风险（4A 节）。
6. 远端与现场运行返回的 HTML 不可信：先清洗再显示。
7. 编译时与浏览器中尽量使用同一份运行时（同一个 WASI 二进制；WebGPU 在 Chromium 中录制），录制输出与现场输出一致；用 CPU 模拟的 GPU 计时标明为模拟。

服务：`executor`（各环境的执行器登记到同一个路由）。

规划中的领域事件：`EnvironmentUnavailable`（目前以失败的运行及其原因体现）、`SessionReset`。

## 13. 智能体

Presmium 是 agent 的环境：agent 经 MCP 读取文稿的全部内容与状态，也能操作它；agent 的修改落在源码上，经作者审阅后成为提交。工作台中的 agent 是 DeepSeek Harness 的会话，它经 bundle 使用与 MCP 相同的工具表，会话在文档的目录中运行；别的 agent（Claude Code、Codex 等）经 MCP 接入。与 dsh 的概念对照见第 16 节。

| 中文 | 标识符 | 含义 |
|---|---|---|
| agent 环境 | `@presmium/mcp` 的 `createPresmiumMcp` | MCP 服务：以工具与只读资源暴露工作区、文稿与放映状态；运行在 `presmium dev` 与 `presmium serve` 的进程中（`/mcp`），`presmium-mcp` 以 stdio 提供同样的工具 |
| agent 工具 | MCP 工具；插件贡献的 `AgentTool` | 读取类（`read`）、操作类（`operate`，需要确认）、计费类（`spend`，需要确认）；插件可以贡献工具，如讲授插件的 `lecture_preview` |
| agent 资源 | `presmium://…` | 与读取类工具对应的只读资源；放映位置与焦点的资源可以订阅更新 |
| 令牌模式 | `AgentMode`（`MCP_ENDPOINT.issue(member, mode)`） | 只有 `author`：作者的 agent，可以写源码；每个令牌都读完整的文稿 |
| 上下文 | `AgentContext` | 所在的文档、章节、步骤、块、选中内容与源码位置，另带焦点（`focus`） |
| 焦点 | `Focus` | 用户指向的一处：源码中的一段（文件与行区间，摘录取自文件），加上文档、章节、块、步骤与页面上选中的文字；从源码编辑器、网页预览或幻灯片预览指出（第 16 节） |
| 修改审阅 | `ChangeReview`（`CHANGE_REVIEW`，Node）；工作区服务的 `review` 路由 | 一个会话在一份文档上的修改：开始时的快照、每个工具调用之后的检查点 `ReviewStep`、相对于快照的改动 `ReviewChange` |
| 审阅方式 | `settings.presmium.assistant.review` | `required`（默认，先审阅后提交）或 `auto`（每个 turn 结束时提交） |
| 无人审阅的时限 | `settings.presmium.assistant.reviewTimeoutMs` | 等待审阅而没有任何页面跟随的审阅在这之后回滚、释放文档（默认 30 分钟） |
| 回到某一步之前 | `ChangeReview.restoreTo` | 待审阅时把文档目录恢复为某个检查点之前的样子，这一步与之后的各步作废，审阅继续 |
| 读者的模型服务 | `AskClient`（`ASK`，浏览器） | 读者自己填写的 OpenAI 兼容服务（地址、密钥、模型名），只保存在他的浏览器中；页面直接请求它，不经站点的服务端 |
| 读者问答 | `AskClient.ask` | 读者就文稿提问：页面带上当前章节的文字、选中的内容与章节目录，流式显示回答，引用的章节可以点击 |
| 引用位置 | `Citation` | 回答中可以点击跳转的位置：章节、步骤、块 |

**修改审阅（聚合根，以文档目录为标识）**：一个文档目录上进行中的审阅：所属的会话与成员、开始时的快照、检查点与相对于快照的改动。同一文档目录同一时间至多一个审阅，审阅持有文档的锁。

不变量：

- **只写源码，不碰产物**：agent 只修改工作区中的源码，会话的工作目录是文档目录；写入超出当前文档目录或改动工作区配置时需要确认（`workspace` 范围，只有所有者能允许）。构建的产物写在文档目录之外，不进审阅。
- **先审阅后提交**：`review: required` 时作者逐个文件查看差异后接受、拒绝或拒绝某些文件；被拒绝的文件恢复为快照中的内容，新建的删除。审阅待决时同一文档的撤销被拒绝。
- **接受即提交**：接受的修改由工作区提交为一个提交（`REVISIONS`，git 的钩子关闭），尾注带 `Presmium-Session`、`Presmium-Turn` 与作者；接受之后的撤销是 `git revert`，会话收到一条标明来源的消息。
- **学习者不接触 agent**：读者的提问在他的浏览器中发往他自己填写的服务，回答只是文字与跳转的链接；读者的密钥只保存在他的浏览器中。
- **MCP 不提供写文件的工具**：agent 用自己的文件工具修改源码，服务随即重新编译并推送。
- 回答中的引用位置必须对应 IR 中的章节、步骤或块；无法解析的引用不显示为链接。
- 读者问答的上下文取自读者页面中的 IR；学生版站点的 IR 没有只给教师的内容，所以回答不会引用它（第 10 节）。
- agent 经 MCP 能做什么由服务端签发给它的令牌决定（成员的角色），会话结束令牌即作废；本机作者的外部 agent 用进程的令牌，它只在 0600 的状态文件中（4A 节）。

服务：`ASK`（浏览器）、`CHANGE_REVIEW`、`PROCESS_SANDBOX`（Node）；MCP 是对外的开放主机服务。

## 14. 工作区

| 中文 | 标识符 | 含义 |
|---|---|---|
| 工作区 | `Workspace`；根目录的 `presmium.workspace.yaml` | 一个 git 仓库，包含多份文档；配置声明文档的位置（默认 `*/lecture.md`）、站点、确认策略与插件的运营者设置 `settings`（如工作区的插件列表、修改的审阅） |
| 文档 | `Document` | 一份文稿：目录（身份）、入口文件、标题、语言、标签，取自它的头部 |
| 文档操作 | `DocumentOperation` | 新建（从模板，或由 agent 起草）、重命名、复制、删除 |
| 文档模板 | `packages/workspace/templates/document/<名>/`（随 `@presmium/workspace` 发布）或工作区配置 `templates` 指定的目录 | 新建文档时复制的目录 |
| 修改 | `Revision` | 一个提交及其来源 `RevisionOrigin`：agent 的会话、文档操作、作者在编辑器中的提交 |
| 修改历史 | `RevisionService`（`REVISIONS`，Node） | 提交、按文档列出修改、撤销（`git revert`）；撤销一次撤销是重做（`HistoryRevision.redo`），历史面板按它标为“重做” |
| 成员 | `Member`（4A 节） | 本机作者（所有者）；工作区服务只供运行它的那个用户使用，没有登录与成员的配置 |
| 源码文件 | `SourceFile`、`SourceAnswer`（工作区的 `files`、`source` 路由） | 编辑器能打开的文件：文档页是它的文档目录中的文件，首页是每份文档的文件与 `presmium.workspace.yaml`；路径相对于工作区根目录，不经符号链接，不进 `.git`、产物与 Presmium 自己的目录 |
| 文件的版本 | `version`（字节的散列） | 编辑器打开或保存时文件的样子；保存时写明自己改的是哪个版本 |
| 未提交的修改 | `UncommittedFile`（`changes` 路由） | 工作树与最近一次提交不同的文件（新增、修改、删除，增删的行数），列在修改历史的顶部，写一句说明后提交（来源 `editor`），或放弃 |
| 文档的锁 | `DocumentLockService`（`DOCUMENT_LOCKS`，Node） | 一份文档同一时间只有一个写入者：agent 的审阅（到审阅结束）、文档操作、撤销、编辑器的保存、提交与放弃 |
| 文档的写入器 | `DocumentFiles`（`DOCUMENT_FILES`，Node） | 工作区写文档目录的唯一途径：途中的符号链接被替换，从不被跟随；编辑器的保存、撤销与插件的写入都经它 |
| 工作区站点 | `SiteSpec`、`Renderer.buildSite` | 多份文档组成的网站：首页（文档列表，或指定为一份文稿）、每份文档在 `/<文档目录>/` 下、跨文稿搜索与前后导航 |

**工作区（聚合根）**：文档的集合与它们的修改历史。

不变量：

- **文档的身份是目录**：重命名就是移动目录，同时改写其他文档中指向它的相对链接；文档目录中的锚点锁文件随目录移动。
- **文档操作即提交**：新建、重命名、复制、删除都是对源码目录的修改，各形成一个提交（来源 `document`）。
- **撤销即 `git revert`**：有冲突时报告冲突的文件，不强行撤销，工作树保持原样。
- **编辑按角色**：本机作者是所有者，可以修改与撤销，管工作区设置并回答 `workspace` 范围的确认（4A 节）；学习者得到的是学生版的构建（第 10 节）。
- **按需编译**：只编译正在被访问的文档并监听它的源码；其他文档只读取头部，用于列表。编译时的代码全部执行（4A 节）。
- **运营者目录不属于文档**：运营者目录在工作区之外的用户状态目录中，其中的文件从不进入提交。
- **git 不执行仓库中的脚本**：工作区的 git 命令关闭钩子与 fsmonitor；git 审阅（在工作区服务中）在自己的 git 目录中运行 git，不读仓库的配置。
- **保存不丢失任何一方的修改**：保存写明编辑器打开的版本，文件在那之后被改过（agent、磁盘上的编辑器）时不写入，页面让作者合并或重新载入；agent 的审阅从开始到结束持有文档的锁，期间保存被拒绝，作者的文字留在编辑器中，审阅的回滚不覆盖作者的保存。
- **保存不是提交**：保存只写文件；没有提交的修改由作者写一句说明后提交（一个提交，来源 `editor`），或放弃（写回最近一次提交的样子）。审阅开始时没有提交的修改照常保留（审阅的快照包含它们）。
- 浏览器不直接修改渲染结果；一切修改都落在源码上。

服务：`REVISIONS`、`DOCUMENT_LOCKS`、`DOCUMENT_FILES`（Node）。

领域事件：git 历史就是工作区的事件日志：`DocumentCreated`、`DocumentRenamed`、`DocumentCopied`、`DocumentDeleted`、`RevisionCommitted`、`RevisionReverted` 都是带来源尾注的提交。

## 15. 讲授

一堂课的讲授以讲授轨保存：一条按时间排列的纯文本记录，包含说了什么（语音段的文字、时间与可选的音频）与做了什么（操作）。操作锚定到章节、块与锚点，讲义改版、换设备、换窗口大小后仍能回放；回放由讲授轨驱动真实的页面，不播放视频。讲授轨有三个来源，回放方式相同：录制、讲义的讲解（文字转语音）、讲授脚本。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 讲授轨 | `LectureTrack`（`addon-lecture` 的领域层） | 一堂讲授：语音段、事件、音频片段、可选的摄像头与屏幕录像、块指纹与 IR 哈希、音色；存为文稿目录中的 `lectures/<id>/track.json`（格式见 `ir.md` 第 9 节） |
| 语音段 | `Utterance` | 一句话：开始时刻、时长、文字、逐字（中文）或逐词时间、所在章节与步骤、可选的译文 |
| 事件 | `TrackEvent`（内核） | `[毫秒, 类型, 数据]`；类型以插件 ID 或内置名开头，不认识的类型被忽略 |
| 操作 | `Operation`（内核）、`OPERATIONS`（宿主） | 插件报告的语义化操作：`go`、`point`、`spot`、`hint`、`ink`、`select`、`click`、`run`、`scroll`、`mark`、`pause` |
| 字锚 | `UtteranceAnchor`（事件数据的 `at`） | 把事件绑定到语音段的第几个字；改文字、换音色后按新的逐字时间重新计算事件时刻 |
| 块指纹 | `LectureTrack.blocks` | 被事件引用的块的内容指纹，用于漂移检查 |
| 时钟 | `TrackClock` | `now`、`play`、`pause`、`seek`、`rate`；录制的讲授用媒体元素（`MediaClock`），合成的讲授用按已知偏移排列的片段（`ClipClock`），只有字幕时用 `SilentClock` |
| 音色 | `Voice` | 录制（说话人）或合成（引擎、模型、音色）；克隆音色要有同意记录 `ConsentRecord`（见下文“语音”） |
| 讲授计划 | `LecturePlan` | `lecture` 渲染端从 IR 得到的每一步要说的文字与提示标记 |
| 提示标记 | `{cue}` 角色 | 讲解中的行内标记：说到此处时推进一步、聚光、提示、指点、点击、运行、圈画、停顿或标记章节 |
| 读音 | `{say}` 角色、头部的读音词典 | 显示一种写法，读出另一种 |
| 讲授脚本 | 讲解本身；可选的 `renderers.lecture.script` | 讲解逐段绑定到步骤，就是脚本；也可以用单独的 MyST 文件按章节标签代替讲解 |
| 字幕译文 | `Utterance.translations` | 语音段的其他语言文字，记录所依据的原文摘要 |
| 导出 | `captions.<语言>.vtt`、`chapters.vtt`、`events.vtt`；视频文件 | 只作为导出格式，不作为主存储 |

**讲授轨（聚合根）**：语音段与事件按时间排列；事件只经 ID 引用章节与块。

不变量：

- **文字是主存储**：音频可以由文字重新生成；语音段的文字改动后逐字时间重新对齐（未改动的字保留原时间，新字按字数插值），带字锚的事件随之重新计算时刻。
- 事件只引用章节、块（带内容指纹）与锚点，不引用像素与屏幕尺寸；回放不靠视频：默认没有视频，可选的摄像头与屏幕录像只是附带的片段（`LectureTrack.video`），页面仍由事件驱动。
- 时刻 t 的画面是 t 之前事件的折叠 `state(t) = fold(events ≤ t)`：跳转精确、可逆；回放者应用事件时宿主处于重放状态，插件不把重放当作用户操作报告。
- **漂移**：块指纹或 IR 哈希不一致时，检查项 `presmium.lecture` 按 exact、moved、fuzzy、lost 分级报告（同锚点）；回放丢弃失效的事件并提示。需要长期回放的块应写标签，生成的 `<kind>-<n>` ID 会随插入而移动。
- 录音默认只保存在本地，不提交（去处由运营者设置 `settings.presmium.lecture.audio` 决定）；只有对某一段讲授显式执行“转写”时才发给语音服务，转写的入口标明服务提供方。默认不录视频；可选的摄像头与屏幕录像同录音一样保存在本地。
- 合成的语音在播放界面上标明由 AI 合成，并写入元数据；克隆音色默认关闭，必须有本人录制的同意声明（语音服务把关）。同意撤回之后，服务端不再给出、构建不再发布这个音色的片段，合成的讲授与换成这个音色的录制讲授都一样：片段按它在合成缓存中的键给出，每次由语音服务检查音色，从不为此重新合成（`SpeechService.cached`）。
- **受众的版本按章节摘要失败即关闭**：讲授轨记下录制时每一节的摘要（`LectureTrack.ir.sections`）。为某个受众发布时（学生版的构建，IR 带 `meta.audience`），只保留摘要与这个版本中同一节的摘要相同的章节里说的话、音频与录像；摘要不同说明这一节在录制之后少了内容，声音与画面可能说出它。
- 译文记录它所依据的原文摘要；原文改动后译文标记为过期，导出时提示。
- 讲授计划在 `addon-lecture` 的 `src/domain/plan.ts`，由讲解（或单独的脚本）得到，合成的讲授的 ID 是 `script`；一个语音段合成的片段记在 `Utterance.clip`（合成缓存中的文件），`ClipClock` 播放它们。换音色重新合成时每个语音段保持它的时刻，只在前一段的新片段更长时后移，所以没有字锚的事件时刻不变、有字锚的随字移动。

### 语音

| 中文 | 标识符 | 含义 |
|---|---|---|
| 语音服务 | `SpeechService`（`SPEECH`） | 转写与合成；浏览器端经语音插件的路由（语音协议），Node 端直接调用引擎 |
| 引擎 | `SpeechEngineInfo` | `volcengine`（默认的生产引擎）、OpenAI 音频接口形态的引擎（按地址接入，如 Groq、OpenAI、自建服务）、`fake`（CI）；其他服务作为新的适配器加入。`provider` 是服务提供方的名字，界面据此标明；它来自运营者的配置（火山引擎为“火山引擎”，英文界面为 Volcengine） |
| 引擎定义 | 环境变量 `PRESMIUM_SPEECH_<ID>_URL`、`PRESMIUM_SPEECH_<ID>_PROVIDER`、可选的 `PRESMIUM_SPEECH_<ID>_KEY` | 运营者在服务端给出的引擎：地址、服务提供方的名字与凭据，凭据只发往同一组中的地址（火山引擎的地址与名字固定在适配器中，只给凭据）；缺少地址或服务提供方时引擎不可用；文稿只用 ID 选择引擎 |
| 同意记录 | `ConsentRecord`；`<consentDir>/<引擎>/<音色>.json` | 克隆音色的本人同意：说话人、范围、日期、同意声明录音的 sha256。放在运营者目录中的 `consentDir`（`settings.presmium.speech.consentDir`，默认 `consent`；运营者目录在工作区之外的用户状态目录中），只由所有者经服务端或运营者用 `presmium-speech consent` 登记，不随文稿提交 |
| 语音协议 | `addon-speech` 的服务端贡献 `/__presmium/presmium.speech/v1/` | Presmium 与语音之间唯一的协议：OpenAI 音频接口的形态，加上返回逐词时间的 `/audio/speech/timestamps`；浏览器经它使用语音，只有服务端接触服务提供方；只给编辑者，请求体至多 32 MiB（转写的录音） |
| 合成 | `Synthesis` | 音频、时长、逐字时间、缓存键与引擎信息；`synthetic: true` |
| 转写 | `Transcript` | 语言、时长、文字、带逐字时间的语音片段 |
| 合成缓存 | `.presmium/speech/<键>.<扩展名>`、`<键>.json`，`.presmium/speech.lock.json` | 按规范化的（引擎、音色、语言、语速、风格、文字、应用读音词典之后要说的文字）的 sha256 缓存，随文稿提交；模型写在 `<键>.json` 中，不进入键（命中时不问引擎用的模型）；音频保留引擎返回的格式（通常是 Ogg/Opus，假引擎为 WAV） |

**合成缓存（聚合根）**：按键存放的合成结果与 `speech.lock.json`；键由规范化的请求决定，同一个键的内容不再改变。**同意记录**是另一个聚合，按（引擎，音色）标识。

不变量：

- 合成缓存保证可复现：命中缓存的段落从不重新合成，全部命中的构建不向引擎发出请求；构建只为缺失的段落调用引擎并写入缓存（同编译时执行的录制）；缓存缺失又没有可用的引擎时，构建与 `presmium check` 报错并指出是哪些段落；改一段只重新合成一段。
- 凭据只在服务端，并且只发往运营者为它给出的地址；文稿只写引擎与音色的名字，不写地址与凭据的变量名。
- 文字发给第三方语音服务须由运营者定义引擎、文稿选用它；没有定义引擎时不发出任何请求。
- 克隆音色只在运营者开启（`settings.presmium.speech.cloned`）且运营者目录的同意记录目录中有该音色的记录时可以合成；语音服务在合成前检查，合成缓存命中时同样检查，Node 端与语音协议的路由是同一个关口；同意撤回之后，服务端的讲授路由也不再给出已合成的讲授与片段。文稿目录中的记录被忽略。运营者目录在工作区之外的用户状态目录中，agent 对它的权限请求一律拒绝，同一 uid 的代码绕过工具写它是残余风险（`architecture.md` 9.4 节）。
- 转写与合成的入口标明引擎的服务提供方，名字来自运营者的配置，在任何请求之前就已知。
- 合成的音频与它的 `<键>.json` 带 AI 生成的标识与 GB 45438 的元数据，由语音服务在写入缓存时加入（不重新编码，任何引擎都一样）；播放合成的讲授时界面显示“AI 合成语音”。

服务：`SPEECH`（Node 与浏览器各一个实现，同一契约）。

规划中的领域事件：`TrackRecorded`、`TrackTranscribed`、`UtteranceEdited`、`ClipSynthesized`、`TrackDrifted`（目前以讲授轨文件的修改与检查诊断体现）。

## 16. 工作台与 dsh

工作台是 DeepSeek Harness（下称 dsh）的一个定制发行版（设计见 `design-dsh.md`）。它不是新的业务领域：文稿、修改、审阅与修改历史仍归工作区与智能体（第 13、14 节）；工作台把它们呈现给作者，并经防腐层（bundle `@presmium/dsh`）把 dsh 的会话、确认与修改卡片接到 Presmium 的概念上。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 产物 | 网页、幻灯片、notebook、讲授 | 渲染端从 IR 生成、能单独部署的东西；静态构建的结果与开发服务器实时提供的页面都算。产物不认识工作台，只暴露锚点 |
| 工作台 | `presmium studio` 的页面；`@presmium/workbench`、`@presmium/dsh` | 作者编写文稿的界面：Presmium 的根布局插件与 React 面板，加上 dsh 的对话、确认卡片、修改卡片、会话与模型设置 |
| 工作区服务 | `presmium serve` | `presmium serve` 中不含界面的部分：编译会话、产物的开发服务器、文档与源码的路由、审阅、修改历史、焦点、MCP |
| bundle | `@presmium/dsh` | dsh 的扩展包（不是 Presmium 自己的插件包）：宿主部分的行（工具、确认策略、上下文、技能、文档的工作区登记、turn 与审阅、路由）与客户端部分（根布局插件与面板） |
| 根布局插件 | `@presmium/dsh` 的客户端部分 | 占据 dsh 客户端 `root` 槽位、决定整页布局的客户端插件，替换 dsh 自带的 `ui-layout` |
| 预览协议 | `PREVIEW_PROTOCOL`（`packages/kernel/src/contracts/preview.ts`） | 工作台与嵌在它里面的产物页面之间的 `postMessage` 消息约定，只传章节、块与步骤的 ID |
| 预览代理 | 网页与幻灯片的客户端中的一小段脚本 | 产物页面中实现预览协议的部分，只在工作区服务启动的开发服务器的页面中 |
| 焦点 | `Focus` | 用户指向的一处：源码中的一段，带上它在文稿中的位置（见下） |
| 当前位置 | `AgentContext` 的文档、章节、步骤与视图 | 没有选中任何东西时的被动焦点，对话时自动带上 |
| 会话令牌 | `MCP_ENDPOINT.issue(member, mode, { confirmed: true })` | 为一个 dsh 会话签发的 MCP 令牌，模式为“主机已确认”：经它调用的操作类工具不再向页面窗口请求确认，因为 dsh 已按 Presmium 的策略决定过 |
| 升级闸门 | 带 `[gate]` 或 `@gate` 的用例 | 每次升级 dsh 之前必须通过的五组集成用例 |

**与 dsh 的概念对照**：

| Presmium | dsh | 做法 |
|---|---|---|
| 工作区（`presmium.workspace.yaml`，多份文档） | 没有对应的概念；dsh 的工作区只是登记一个目录 | 文档树由 Presmium 维护；工作区根不登记为 dsh 工作区 |
| 文档（文档目录） | 工作区（Workspace） | 启动时与新建文档时登记（幂等），改名、删除时同步改名或归档。会话加入它，所以会话的目录、`workspace-write` 沙箱的根与审阅的根都是文档目录 |
| 修改任务、对话线程 | 会话（Session）与其中的 turn | 一个线程一个会话；面板发起的任务（由 AI 起草、讲授回写）新建会话。起草先按模板新建文档，再在它的目录中开会话 |
| 批注 | 没有 | 焦点加一句要求；一批批注以带来源标记的消息进入会话 |
| 文档的锁 `DOCUMENT_LOCKS` | 没有 | 从会话第一次写文件之前持有到审阅结束；dsh 的文件工具与 shell 直接写文件，所以锁拦住的是编辑器的保存与文档操作 |
| 修改审阅 `CHANGE_REVIEW` | workspace-changes：每个 turn 两个 git 树快照，只在宿主内存中；修改卡片与 Review 标签页是它的视图 | 审阅由工作区服务负责，覆盖审阅期间的全部 turn，记录由服务保存（宿主重启后 dsh 的摘要不在了） |
| 修改（`REVISIONS` 的提交） | 没有：dsh 不提交，也不回滚 | 一次接受形成一个提交，尾注另带 `Presmium-Session` 与 `Presmium-Turn` |
| 撤销 | 没有 | `git revert`，尾注 `Presmium-Revert`；之后给会话发一条标明来源的消息 |
| 确认 `APPROVALS`（策略 `off`、`ask`、`allow`；范围 `content`、`workspace`） | `tools/pre-execute` 的 allow、ask 与 deny；`approval/request` 的回答者；`ctx.tools.guard` | `off` 不登记工具；`allow` 在 pre-execute 中放行；`ask` 交给 dsh 的确认卡片；运营者目录用 guard 拒绝 |
| MCP 的工具 | dsh 的工具 | 同一张工具表；dsh 中名为 `presmium__<名字>`，经回环的 `/mcp` 在工作区服务中执行 |
| 技能 `presmium-author` | `ctx.skills.register` 与 skill-filesystem | 运行时登记；用户目录中的技能不读入；文稿项目自己的 `.agents/skills` 保留 |
| 文稿上下文 | `systemPrompt.section` 与 `context` | 按会话的目录找到文档：标题、语言、章节、诊断数、当前位置与焦点 |
| 模型设置与模型访问 | `settings/*`、`credentials/*` 与 dsh 的模型设置界面 | 工作台只用 dsh 的，凭据在 Presmium 自己的 `DSH_HOME` 中；`PRESMIUM_MODEL_*` 映射为 `DEEPSEEK_*` |
| 预览与问题 | 没有（dsh 的浏览器标签页不显示 dsh 自己的源） | 工作台自己的预览面板（预览协议）与问题面板（IR 的诊断） |
| 终端、jobs、计划、插件管理 | 有 | 直接用 dsh 的 |
| 放映、演讲者视图、课堂、运行代码、读者问答、放映中的讲授录制 | 没有 | 属于产物，不经 dsh |
| 外部 agent（Claude Code、Codex） | 没有 | 经 MCP 连接工作区服务，与 dsh 看到同样的工具与焦点 |

**焦点（值对象）**：`Focus`（`packages/kernel/src/contracts/agent.ts`）有 `id`、`from`（`source`、`web` 或 `slides`）、`document`（文档目录）、`source`（文件与行区间）、`excerpt`（摘录），以及可选的 `section`、`block`、`step` 与 `quote`（页面上选中的文字）；`source.file` 相对于文档目录。批注 `Annotation` 的 `focus` 与 `AgentContext` 的 `focus` 引用它。工作台报告的是 `FocusReport`（块或节的锚点，或编辑器中的行区间，还没有摘录），服务端换算成 `Focus` 并按文档保存最近一次。

不变量：

- **焦点总是落到源码**：`source` 与 `excerpt` 总有；摘录由服务端从文件读出，不取页面上的文字。从编辑器选中的焦点由服务端按行号补上所在的节与块。
- **三个入口一种数据**：源码编辑器的选中、网页预览与幻灯片预览中的点选得到同一种 `Focus`；幻灯片的焦点带步骤。
- **不悄悄指到别处**：源码改动后先按块 ID、再按摘录重新定位，都找不到时标为已失效。
- **产物只暴露锚点**：焦点由工作台组装，服务端把锚点换成源码范围；静态构建中没有点选的代码。
- **两边看到同一个焦点**：外部 agent 经 MCP 读到的焦点与 dsh 会话的上下文中的相同；两边的工具清单也相同。
- **dsh 只经一个包**：只有 `@presmium/dsh` 引用 dsh 的接口，`@presmium/studio` 只启动它；核心与产物不知道 dsh 存在。
- **一个会话属于一份文档**：会话的目录是文档目录，也是沙箱与审阅的根；目录不是文档目录的会话得不到 Presmium 的工具与上下文。
- **文稿的代码不进 dsh 宿主**：编译、编译时执行与构建在工作区服务的进程中。
- **修改落在源码上并成为提交**：dsh 的修改卡片只是视图，审阅、提交与撤销由 Presmium 负责。
- **隐私默认值每次启动重新声明**：不上传会话日志、插件清单与遥测，不读用户目录中的技能，第一次使用不在用户的文档目录中建目录。

服务：工作区服务的路由、`MCP_ENDPOINT`（会话令牌）、`CHANGE_REVIEW`（由工作区服务登记）。事件：dsh 的 turn 与 `workspace/changes` 事件驱动审阅的检查点；预览协议的 `picked`、`selection`、`position` 与 `updated` 驱动焦点与预览。
