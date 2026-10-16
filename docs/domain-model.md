# Presmium 领域模型

本文档按领域驱动设计（DDD）描述 Presmium 的限界上下文、通用语言和领域对象。需求编号见 `requirements.md`，工程落地见 `architecture.md`。通用语言表中的“标识符”是代码中的名字；没有对应类型、只是某个类型的字段时，写出字段所在的位置。

## 1. 限界上下文总览

| 上下文 | 包 | 职责 | 覆盖需求 |
|---|---|---|---|
| 内核 Kernel | `@presmium/kernel` | 插件清单、服务注册、锚点契约、检查契约、步骤契约、IR 契约，以及插件共用的服务契约 | K-07、K-08、K-10、K-16、K-17 |
| 编译 Compilation | `@presmium/compiler`、`@presmium/cli` | 解析 MyST 源码、执行编译步骤与行内角色、编译时执行与缓存（含执行会话）、受众筛选、生成 IR、运行检查 | K-01、K-02、K-11、K-16、K-17、K-19 |
| 渲染 Rendering | `@presmium/viewer`、`@presmium/web`、`@presmium/render-slides`、`@presmium/render-notebook` | 从 IR 生成各媒介或在浏览器中动态渲染 IR，声明支持程度并降级；运行时视图；站点外壳、文件发布与译本；工作区站点 | K-18、K-20、P-70 至 P-79、P-123 |
| 宿主适配 Host | `@presmium/host`、`@presmium/slidev-addon-core`、`@presmium/web`、`@presmium/server` | 形态无关的宿主接口，及其 Slidev、VitePress 两个实现；服务端：插件的服务端贡献、登录与权限、操作确认、控制通道 | K-04 至 K-07、N-08 |
| 讲台 Stage | `@presmium/slidev-addon-stage` | 基础内容、步骤备注、冻结画面、圈画标注 | P-01 至 P-04 |
| 代码引用 CodeRef | `@presmium/slidev-addon-code` | 引用、锁定、漂移、跳转、分步高亮、多版本 | P-10 至 P-16 |
| 代码执行 Execution | `@presmium/slidev-addon-exec`、`@presmium/slidev-addon-exec-local` | 执行服务、运行记录、分步执行、回退、环境复刻 | P-20 至 P-24、P-26 |
| 执行环境 Environment | `@presmium/slidev-addon-exec-jupyter`、`@presmium/slidev-addon-exec-wasi`、`@presmium/slidev-addon-exec-webgpu`；会话与富输出也落在代码执行的两个包中 | 具名环境、环境提供方与指纹、执行会话、富输出、远端环境的凭据方式、部署模板、浏览器终端 | P-100 至 P-107 |
| 引导 Guidance | `@presmium/slidev-addon-guide` | 模拟光标、聚光、交互提示 | P-30 至 P-32 |
| 富内容 Content | `@presmium/slidev-addon-content`；卡片、栅格、选项卡由编译器与渲染端直接支持 | 公式、图表、思维导图、媒体（含封面与字幕轨）、Web 组件、卡片与栅格 | P-40 至 P-43、P-46 |
| 发布 Publishing | `@presmium/slidev-addon-publish`；发布检查与受众筛选在编译器与 CLI 中 | 导出、离线、高对比度、可视化差异、发布检查、受众范围 | P-50 至 P-55 |
| 课堂 Classroom | `@presmium/slidev-addon-session`、`@presmium/slidev-addon-classroom`、`@presmium/classroom-server` | 会话、网络传输、跟随、笔记、测验、练习、提问、理解度、先预测再揭示 | P-60 至 P-68 |
| 编辑 Editing | `@presmium/language-server`、`presmium-vscode` | 编辑器中的诊断、跳转、悬停、补全，编辑器与预览同步 | P-80、P-81 |
| 智能体 Agent | `@presmium/mcp`、`@presmium/slidev-addon-assistant` | agent 环境（MCP）、agent 运行时（ACP）、学习者问答、批注修改、对话修改 | P-110 至 P-114 |
| 工作区 Workspace | `@presmium/workspace` | 工作区服务、文档管理、修改历史与撤销、成员、工作区站点、编辑模式 | P-115、P-120 至 P-122、N-09 |
| 讲授 Lecture（含语音 Speech） | `@presmium/slidev-addon-lecture`、`@presmium/slidev-addon-speech` | 讲授轨、录制、回放、脚本化讲授、导出视频、转写回写；语音网关、引擎、合成缓存、字幕译文 | P-90、P-130 至 P-137 |

网页形态的站点外壳、文件发布与译本（P-78、P-79、P-123）属于渲染上下文，见第 9 节；工作区站点的组织（P-122）属于工作区，网页渲染端负责构建它。

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
              外部：Jupyter Server（防腐层）  外部：语音服务（语音网关）   外部：ACP agent · git
```

- **内核是共享内核**：所有上下文只依赖内核的契约，彼此之间不直接依赖。多个插件共用的业务服务契约（`executor`、`session`、`classroomStore`，v0.8 起还有 `speech`、`agent`、`agentRuntime`、`revisions`、`approvals`、`mcpEndpoint` 与操作词汇 `TrackEvent`）也放在内核包中，因为提供方与使用方是不同的插件（`architecture.md` 4.5 节）。
- **宿主适配是防腐层**：插件的组件与浏览器端代码（`components/`、`src/client/`）不引用 `@slidev/*` 与 vitepress，只通过 `@presmium/host` 获取步骤状态、服务与形态信息，因此同一个组件可以在两种形态中运行。只在幻灯片形态中加载的部分（插件包的 `setup/` 与全局图层）可以使用 `@slidev/client` 的公开导出；只有网页渲染端使用 vitepress。领域层（`src/domain/`）不引用 Vue。完整规则见 `architecture.md` 第 3 节。服务端（`@presmium/server`）是宿主适配在 Node 端的对应物：插件只经 `ServerContext`、`RequestContext` 与 `approvals` 使用它，浏览器端只经 `useServer()`。
- **上下文之间通过服务协作**：例如课堂的练习校验使用代码执行提供的 `executor` 服务；测验、笔记等功能使用会话插件提供的 `session` 服务，会话插件可以整体替换。
- **外部系统只经防腐层接入**：每个外部系统只在一个适配器中出现，适配器说一种标准协议（`architecture.md` 第 3 节的检查规则）。

v0.8 新增的上下文之间的关系：

| 上游 | 下游 | 关系 | 经由 |
|---|---|---|---|
| 执行环境 | 代码执行 | 客户与供应商：环境的执行器登记到 `executor` 路由，按 ID 精确选择 | `EnvironmentProvider`、`EXECUTOR` |
| 编译（IR） | 智能体 | 遵奉者：MCP 服务以 IR 为公开语言读取文稿 | IR、`AgentTool` |
| 智能体 | 外部 agent | 开放主机服务：MCP 工具与资源，任何 MCP 客户端都可以用 | `@presmium/mcp` |
| 外部 ACP agent | 智能体 | 防腐层：ACP 客户端，默认的 agent 是 DeepSeek Harness | `AGENT_RUNTIME` |
| 工作区 | 智能体、讲授 | 客户与供应商：修改提交为 git 提交，撤销即 `git revert` | `REVISIONS` |
| 智能体 | 工作区、讲授、课堂 | 客户与供应商：文档起草、转写回写、课堂中的 AI 回答 | `AGENT`、`AGENT_RUNTIME` |
| 语音（讲授的一部分） | 讲授、智能体 | 客户与供应商：转写与合成 | `SPEECH` |
| 外部语音服务 | 语音 | 防腐层：语音网关的适配器，对内只有 OpenAI 音频接口的形态 | `addon-speech` |
| 外部 Jupyter Server | 执行环境 | 防腐层：Jupyter 内核协议的客户端 | `addon-exec-jupyter` |
| 宿主适配 | 讲授、引导、代码执行 | 共享内核：插件报告操作，讲授录制并重放 | `OPERATIONS`、`TrackEvent` |
| 服务端（宿主适配） | 执行环境、语音、智能体、工作区、讲授 | 宿主：挂载服务端贡献，处理身份、权限、凭据、运营者设置与确认；为 agent 会话签发 MCP 令牌 | `ServerContribution`、`ServerContext.settings`、`APPROVALS`、`MCP_ENDPOINT`、`useServer` |

## 3. 内核

### 通用语言

| 中文 | 标识符 | 含义 |
|---|---|---|
| 插件 | `PluginDefinition` | 清单加初始化函数与可选的 `dispose` |
| 插件清单 | `PluginManifest` | ID、版本、兼容内核版本、提供与依赖的服务、所需能力 |
| Node 端插件 | `PresmiumNodePlugin` | 插件在编译、渲染与服务端中的部分：指令、行内角色、编译步骤、执行器、环境提供方、渲染端、渲染端扩展、检查项、Node 端服务、服务端贡献、agent 工具 |
| Node 端服务 | `PresmiumNodePlugin.services` | 插件在 Node 端提供的服务实现（如 `SPEECH`、`AGENT_RUNTIME`），编译步骤、渲染端与服务端贡献经 `service(token)` 使用；同浏览器端一样，一个令牌只有一个实现 |
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
- 不指定环境与会话的代码块，IR 与缓存键与 v0.7 相同。
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
| 服务端访问 | `useServer()`、`ServerClient` | `presmium dev` 中可用（开发服务器代理 `/__presmium/`）；静态产物中 `available` 为 false | 同左；`presmium serve` 中另带登录的成员 |
| 状态摘要 | `StatusRegistry`（`STATUS`） | 插件登记的 JSON 摘要（如课堂的作答统计），经控制通道送到服务端，供 agent 读取 | 同左 |
| 编辑模式 | `EditMode`（`EDIT_MODE`） | 无（幻灯片形态不编辑） | 工作区的浏览器插件提供：进入与离开编辑模式，只有编辑者与所有者可以进入 |

**步骤可逆约定**：插件组件的视觉状态必须是步骤的纯函数。组件通过 `v-click` 标记向宿主登记步骤（网页形态由兼容层处理），用 `useStepState` 读取状态，不在点击事件回调中修改不可回放的状态。

**操作可重放约定**：插件把用户的操作（不是重放引起的变化）以章节、块与锚点为坐标报告给 `OPERATIONS`，并为自己的操作类型登记重放；重放某一时刻的状态等于从空状态依次应用此前的全部操作。宿主在重放时把 `replaying` 置为 true，插件此时不报告。

## 4A. 服务端

`@presmium/server` 是宿主适配在 Node 端的对应物：`presmium dev` 与 `presmium serve` 进程中唯一的 HTTP 服务。它挂载插件的服务端贡献，统一处理身份、权限、凭据与确认（`architecture.md` 第 10 节）。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 服务端 | `@presmium/server` 的 `startServer` | 插件的路由与代理、MCP 端点、控制通道；`presmium dev` 中只监听本机，渲染端的开发服务器把 `/__presmium/` 代理到它；`presmium serve` 中它是唯一对外的端口 |
| 服务端贡献 | `ServerContribution` | 插件挂在 `/__presmium/<插件 ID>/` 下的路由 `Route` 与反向代理 `ProxySpec`，各自声明所需的最低角色 |
| 服务端上下文 | `ServerContext` | 插件创建服务端贡献时得到的文稿目录、配置、Node 端服务与凭据 |
| 请求上下文 | `RequestContext` | 发起请求的成员、请求所属的文档、路由之后的路径 |
| 成员 | `Member` | 登录身份：ID、名字、角色 `MemberRole`（`reader` 读者、`editor` 编辑者、`owner` 所有者）；`presmium dev` 中是本机作者，角色为所有者 |
| 操作确认 | `Approvals`（`APPROVALS`）、`ApprovalRequest` | 会改变状态或花钱的操作执行前的确认，种类 `ApprovalKind`：`operate`（跳转放映、运行代码、构建、开关课堂）、`spend`（计费的语音调用）、`write`（agent 写入当前文档目录之外，或改动工作区配置）、`agent`（agent 自身的权限请求） |
| 确认策略 | `presmium dev --allow`、`presmium.workspace.yaml` 的 `approvals` | 每种确认取 `off`（不提供这类操作）、`ask`（默认）或 `allow`（不询问） |
| 控制通道 | 服务端内置的 `/__presmium/presmium.server/control` | 页面向服务端报告位置与状态摘要，接收跳转、开关课堂与确认请求 |
| 凭据 | `ServerContext.secret(name)` | 只来自服务端的环境变量（或 agent 自己的凭据存储）的密钥；与它要发往的地址成对给出（如 `PRESMIUM_ENV_<名>_TOKEN` 与 `PRESMIUM_ENV_<名>_URL`） |
| 运营者设置 | `ServerContext.settings`、`NodeServiceContext.settings` | 运营者给插件的设置：工作区配置 `presmium.workspace.yaml` 的 `settings.<插件 ID>`，如 agent 的命令、录音的去处、是否允许克隆音色；与文稿配置 `config` 不同，文稿与 agent 改不了正在运行的设置 |
| MCP 访问 | `McpEndpoint`（`MCP_ENDPOINT`）、`McpAccess` | 服务端为一个 agent 会话签发的 `/mcp` 地址与令牌，令牌绑定成员与模式，会话关闭时作废 |

不变量：

- 凭据只在服务端：不写入文稿、IR、构建产物与浏览器；浏览器经服务端的代理访问需要凭据的服务。
- 默认只监听本机，并校验 `Host` 与 `Origin`；部署时只接受经登录代理转发的请求（共享密钥或固定的来源地址），成员与角色来自代理传来的身份。
- 身份、角色与本机的检查在挂载点完成；插件的路由只声明所需的最低角色，不各自实现。
- 确认的关口在服务端：任何 agent 运行时、任何 MCP 客户端调用操作类工具，都经同一个 `Approvals`，换用其他运行时同样生效。
- 确认策略不来自文稿：文稿是内容，不能关闭确认；`allow` 只能由本机作者在命令行或工作区所有者在工作区配置中设置。
- **文稿不决定凭据的去向**：凭据只发往运营者为它给出的地址；文稿只用名字选择环境与引擎，文稿中的地址与运营者的地址不同源时不连接。
- 运营者设置在进程启动时读取一次；改动要等运营者重启才生效。

**服务端（聚合根，每个进程一个）**：挂载的贡献、成员的会话、待回答的确认与签发的 MCP 令牌；令牌与确认都只在这个进程中有效。

规划中的领域事件：`ApprovalRequested`、`ApprovalDecided`（目前以控制通道上的消息体现）。

## 5. 代码引用

| 中文 | 标识符 | 含义 |
|---|---|---|
| 代码引用 | `CodeRefSpec` | `{code-ref}` 的声明：锚点、可选的锁定提交（`pin`）、逐步高亮的单元（`steps`）、版本（`variants`）、仓库网址 |
| 代码来源 | `CodeRefOrigin`（扩展 IR 的 `CodeOrigin`） | 解析后的文件与行区间、锁定提交 `pin`、永久链接 `permalink`、解析状态、逻辑单元 `units`、漂移状态 `drift` |
| 逻辑单元 | `Region` | 被嵌套 `#region` 标记出的子区间，用于分步高亮 |
| 代码版本 | `CodeRefVariant`（扩展 IR 的 `CodeVariant`） | 同一代码块在某个提交的版本，逐步切换 |

不变量：

- 锁定提交存在时，渲染内容必须来自该提交，而不是工作区。
- 永久链接只在能解析出远端仓库地址时生成；否则不带链接并产生 `info` 诊断。
- 锁定的代码与工作区不同时（`drift: 'drifted'`）产生漂移诊断。
- 分步高亮的区间由逻辑单元名称换算为行号，换算在构建时完成，文稿源码中不出现行号。

规划中的领域事件：`DriftDetected`、`AnchorLost`（目前以诊断报告）。

## 6. 代码执行

| 中文 | 标识符 | 含义 |
|---|---|---|
| 执行器 | `Executor` | 服务接口：`supports(lang)`、`run(request)`，可选的环境指纹 `fingerprint` 与 `endSession` |
| 执行路由 | `ExecutorRouter` | `executor` 服务：请求指定了执行器时只交给它；否则按语言与优先级交给已登记的执行器 |
| 执行请求 | `RunRequest` | 语言、代码、参数、标准输入、文件、超时，可选的指定执行器 `executor` 与执行会话 `session` |
| 执行结果 | `RunResult` | 输出、退出码、耗时、是否超时、来源（现场或预录）、执行器，可选的富输出 `outputs` |
| 运行记录 | `RunHistory` | 一个代码块在当前视图中的多次运行（`RunRecord`），可两两对比 |
| 执行轨迹 | `Trace` | 逐行执行事件序列，用于分步执行 |
| 预录输出 | `RecordedOutput` | 执行失败或超时时的回退内容 |
| 运行环境 | `Devcontainer`（本地容器）；浏览器中为 Pyodide 与脚本 Worker | 代码运行的环境 |

不变量：

- 执行失败或超时，且存在预录输出时，必须显示预录输出并标明来源。
- 指定的执行器精确匹配：它没有登记或不支持该语言时运行失败，由预录输出回退，不改用其他执行器（`review-round2.md` 决定 5）。
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
| 封面 | `PmMedia` 的属性 `poster` | 视频播放前显示的图片（P-42 增补） |
| 字幕轨 | `PmMedia` 的属性 `captions`（语言到 VTT 文件） | 各语言的字幕，浏览器原生的 `<track>`；`assets` 的键为属性路径 `captions.<语言>` |
| 卡片、栅格、选项卡、按钮 | mdast 节点 `card`、`grid`、`tabSet` 与 `tabItem`、`{button}` 生成的链接 | MyST 标准写法（P-46），作为 `markdown` 节点进入 IR，不是组件 |

不变量：

- 媒体、封面与字幕文件随每种媒介发布；本地文件不存在时报错，带源码位置。
- 卡片、栅格与选项卡在网页中完整显示；幻灯片中选项卡依次展开；notebook 降级为标题加段落，并列入构建报告。

## 8. 课堂

| 中文 | 标识符 | 含义 |
|---|---|---|
| 课堂会话 | `SessionSnapshot` | 课堂 ID、状态 `SessionStatus`（未开始、进行中、已结束）、当前参与者 |
| 参与者 | `Participant` | ID、昵称、角色 `Role`（`presenter` 主讲、`learner` 学习者） |
| 跟随模式 | `FollowMode` | `follow` 跟随主讲或 `free` 自主浏览 |
| 位置 | `Place` | 课堂组件所在的章节与块 |
| 测验 | `QuizSource`（题目与答案）、`QuizState`（开放与关闭） | 页内客观题 |
| 作答 | `Answer` | 参与者对测验的一次作答，每人每题只计最后一次 |
| 练习 | `ExerciseSource` | 题面、起始代码、校验用例 |
| 提交 | `Submission` | 代码与校验结果，标记典型错误 |
| 提问 | `Question` | 内容、提问者、挂载的块、状态 |
| 理解度 | `PulseVote` | 参与者在某页的理解程度投票 |
| 笔记 | `Note` | 参与者的私有笔记，挂载到章节或带标签的块 |
| 预测 | `{predict}`、`PmPredict`；作答为 `Prediction` | 学习者先写下的预测（文字或选项）；之后一步的内容是它的揭示内容（P-68） |

不变量：

- 只有主讲人能开放或关闭测验、结束课堂、标记问题已回答。
- 课堂结束后不再接受作答、提交与提问。
- 笔记只对作者可见。
- 统计只统计每位参与者的最后一次作答或投票。
- 揭示内容在读者保存预测之前不显示；投在全班面前的放映画面按步骤显示。预测保存在本机，课堂中另写入 `predictions` 集合（键含参与者 ID），主讲看到分布。

信任模型：课堂服务（`@presmium/classroom-server`）面向课堂自己的网络，不验证参与者身份，拿到加入链接的人都能连接。主讲人的权利由服务端强制：创建课堂的窗口连接时声明房间密钥（`?claim=<key>`），只有持有该密钥的连接可以写入课堂状态与测验的开放状态、归档课堂；学习者只能写入自己参与者 ID 下的作答。学习者的私有笔记在各自的房间中。

服务：`session`（当前参与者、角色、课堂状态）、`classroomStore`（共享文档的读写）。课堂插件向宿主的 `STATUS` 登记不含学习者身份的汇总（参与人数、作答与预测的分布、未回答的问题数），agent 经 MCP 读取。

规划中的领域事件：`ParticipantJoined`、`QuizOpened`、`AnswerSubmitted`、`QuestionAsked`、`SessionEnded`（目前由共享文档的变化体现）。

## 9. 网页形态

网页形态由 IR 生成，不再由幻灯片转换：VitePress 提供外壳（导航、侧栏、页内大纲、搜索、深色模式），页面正文由 IR 运行时 `@presmium/viewer` 在浏览器中动态渲染（`ir.md` 第 8 节）。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 网页页面 | `WebPage` | 一个 VitePress 页面：同一源文件中连续的若干章节；第一个页面是 `index` |
| 章节视图 | `SectionView` | 一个章节在页面中的呈现：标题、上屏内容与讲解按源码顺序排列 |
| 排版方式 | `SectionLayout` | `document`（文档式，默认）或 `scrolly`（滚动叙事式），由 `{hints}` 声明 |
| 运行时视图 | `ViewDefinition` | 文档、滚动叙事、放映三种视图，以及插件注册的视图 |
| 媒介限定 | `IRBlock.only` | `{only}` 声明的块只出现在列出的渲染端 |
| 形态映射 | 章节 ID 与 `index` | 章节 `index` 即幻灯片页号，章节 ID 即网页锚点；两种形态据此互相跳转 |
| 站点外壳 | `renderers.web` 的 `nav`、`footer`、`head`、`sitemap` | 顶部导航、页脚、页面元数据（描述、OG）与站点地图（P-78） |
| 发布的文件 | `RenderContext.localAsset` 给出的发布名 | 正文链接的本地文件、目录的文件清单页、原始 HTML 中 `src`、`poster` 引用的文件（P-79） |
| 译本 | 头部 `translations`、`RenderContext.translations` | 同一文稿的其他语言版本，网页按 VitePress 的 `locales` 切换（P-123） |

不变量：

- 每个章节恰好对应一页幻灯片和一节网页，章节 ID 稳定（来自 MyST 标签或标题），形态切换依赖此映射。
- 讲解在网页中是正文；文档视图全部显示，滚动叙事视图随滚动推进步骤。
- 网页搜索索引在构建时从 IR 文本生成并随产物发布，离线可用。
- IR 运行时渲染的 `.pm-section[data-section]`、`.pm-block[data-block]` 是对外的标记契约（课堂笔记、讲授的指针录制与编辑模式的批注据此定位）。
- 三种媒介发布同一组正文链接的本地文件；无法发布的本地引用产生诊断。
- 译本记录它所依据的原文摘要；原文改动后 `presmium check` 报告译本过期。

## 10. 发布

| 中文 | 标识符 | 含义 |
|---|---|---|
| 导出任务 | `ExportJob` | 格式、范围、是否按步骤展开 |
| 离线清单 | `OfflineManifest` | 需要预缓存的资源 |
| 视觉差异 | `VisualDiff` | 两个提交在同一页同一步骤上的像素差异比例 |
| 发布检查 | 检查项 `presmium.links`、`presmium.directive`、`presmium.forbid` | 各媒介中无法解析的本地链接与 `#片段`、MyST 指令错误、文稿头部 `checks.forbid` 中正则的命中（P-54） |
| 受众 | `IRBlock.audience`、`IRSection.audience` | 只给某些受众（如 `teacher`）的块与章节（P-55） |
| 学生版 | `presmium build --audience student` | 只含不带受众或受众包含 `student` 的内容的构建 |
| 泄漏检查 | 检查项 `presmium.audience` | 带 `--audience` 构建后扫描产物，发现被筛掉的内容的文字即报错 |

不变量：

- 视觉差异超过阈值的页必须列入报告；导出的 PDF 中，幻灯片显示的每个链接（包括代码的永久链接）都必须仍是链接，丢失的链接带源码位置报告。
- 发布检查按每个渲染端的视图进行：只出现在某个媒介中的链接只在该媒介中检查。
- 不带受众的内容对所有受众可见；学生版的 IR 与全部产物（页面、搜索索引、`ir.json`、幻灯片备注、notebook）中都没有被筛掉的内容。

## 11. 编辑

语言服务 `@presmium/language-server` 用 `@presmium/compiler` 编译编辑中的文稿，通过 LSP 提供诊断、锚点跳转、悬停（引用的代码与最近一次输出）与补全（region 名、指令与选项）；VS Code 扩展 `presmium-vscode` 启动它，并把编辑器光标所在的章节发给 `presmium dev` 的预览（P-80、P-81）。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 锚点引用 | `AnchorRef` | 源码中写出的一个锚点及其行与列，用于跳转与悬停 |
| 光标所在章节 | `SectionAt` | 编辑器位置对应的章节 ID，用于预览同步 |

不变量：编辑只在源码中进行，语言服务与预览都不修改源码。

## 12. 执行环境

执行环境与语言分离：文稿头部声明具名环境，代码块与执行面板用 `:env:` 选择环境，编译器把它写成指定的执行器 `presmium.env.<名>`，`executor` 路由据此精确选择。远端只对接 Jupyter 内核协议，部署差异交给现成的基础设施（`architecture.md` 第 10 节）。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 具名环境 | `EnvironmentSpec`（IR 的 `config.execute.environments`） | 文稿头部声明的运行环境：提供方类型 `kind`、地址、内核规格、可用语言、凭据方式、镜像摘要；不含凭据 |
| 默认环境 | `ExecuteConfig.env` | 有 `:run:` 而不写 `:env:` 的代码块所用的环境；省略或为保留名 `browser` 时按语言路由（v0.7 的行为） |
| 环境提供方 | `EnvironmentProvider`（`PresmiumNodePlugin.environments`） | 插件按 `kind` 为声明的环境创建 Node 端执行器，并可探测环境是否可达；浏览器端由同一插件为同类环境登记执行器 |
| 环境执行器 | `environmentExecutor(name)` | 具名环境的执行器 ID `presmium.env.<名>`，即代码块的 `RunSpec.executor` |
| 环境指纹 | `Executor.fingerprint` | 运行时的身份，进入编译时执行的缓存键：Jupyter 为镜像摘要、内核规格哈希与内核报告的版本；WASI 为运行时二进制的哈希；WebGPU 为浏览器与显卡适配器的描述 |
| 凭据方式 | `EnvironmentAuth` | `env`（构建机的环境变量，编译时）、`proxy`（服务端代理代加，浏览器拿不到）、`prompt`（学习者粘贴自己的令牌，用于静态站点）、`hub`（以后由课堂服务充当 JupyterHub 的 OAuth 客户端）、`none`；`env` 与 `proxy` 的令牌只发往运营者在同一对环境变量中给出的地址（`PRESMIUM_ENV_<名>_URL`） |
| 执行会话 | `RunSpec.session`、`RunRequest.session` | 共享解释器状态的一组运行；浏览器中按（页面实例，学习者）隔离，编译时按代码块在文稿中出现的顺序执行 |
| 重置会话 | `Executor.endSession` | 丢弃会话的状态：重启或关闭解释器、内核 |
| 富输出 | `RunOutput`（`RunResult.outputs`） | nbformat 的输出：文本流、显示数据与执行结果（MIME 类型到数据）、错误 |
| 正文输出 | `CodeNode.echo: false` | 不显示代码，只显示输出；`text/markdown` 输出按正文显示，用于从数据生成表格与列表 |
| 录制块 | `.presmium/freeze/blobs/<sha256>` | 录制中较大的 MIME 数据按内容哈希单独存放，录制记录只保存引用 |
| WebAssembly 后端 | `addon-exec-wasi` 的执行器 | 浏览器与编译时用同一份 WASI 二进制运行 C、C++、Ruby、SQLite 等程序 |
| 浏览器 GPU 后端 | `addon-exec-webgpu` 的执行器 | WebGPU 计算着色器（`wgsl`）与张量代码；不可用时按原因回退到录制输出 |
| 远端环境 | `addon-exec-jupyter` 的执行器 | 任何 Jupyter Server：docker compose、JupyterHub、Binder、Kubernetes 沙箱、托管服务 |
| 部署模板 | `templates/env/compose/` | 随仓库维护的 docker compose 模板（可选 gVisor 与 GPU 覆盖，附 devcontainer 定义）；Kubernetes 与轻量虚拟化只给文档 |
| 浏览器终端 | `{terminal}`、`PmTerminal` | 远端环境中的终端，经 Jupyter Server 的终端接口（P-107） |

**执行配置（聚合根，`ExecuteConfig`）**：文稿声明的默认环境与全部具名环境。具名环境是其中的值对象：名字在文稿内唯一，`browser` 是保留名；同一个名字在浏览器与编译时指向同一种运行时。

**执行会话（聚合根，以会话 ID 标识）**：同一会话的运行按请求顺序执行、共享解释器状态，只用一个环境。浏览器中的会话 ID 由代码块的 `:session:` 加上页面实例的标识组成，重新加载页面即是新会话；编译时的会话 ID 由文稿与 `:session:` 组成，构建结束时结束。

不变量：

1. **不指定环境的代码块，路由与录制与 v0.7 相同**：IR 中没有 `executor` 与 `session`，缓存键不变。
2. **环境不可用时不悄悄换环境**：指定的执行器没有登记、缺凭据、不可达或超时，运行失败，由 P-24 显示录制输出与原因，不改到别的执行器上运行。
3. **会话代码块的缓存键包含前序代码**：同一会话中第 i 个代码块的键是第 i−1 个的键加上本块的输入、执行器与环境指纹；有一块未命中时，整个会话从头重新执行并重新录制。
4. 同一会话的代码块使用同一个环境；在一个会话中混用环境是错误。
5. 文稿与 IR 不含凭据；`presmium check` 对文稿头部中像凭据的字段告警。文稿中的地址不决定凭据的去向：服务端的令牌只发往运营者给出的地址，与文稿的 `url` 不同源时不连接（N-08）。
6. 远端与现场运行返回的 HTML 不可信：先清洗再显示。
7. 编译时与浏览器中尽量使用同一份运行时（同一个 WASI 二进制；WebGPU 在 Chromium 中录制），录制输出与现场输出一致；用 CPU 模拟的 GPU 计时标明为模拟。

服务：`executor`（各环境的执行器登记到同一个路由）。

规划中的领域事件：`EnvironmentUnavailable`（目前以失败的运行及其原因体现）、`SessionReset`。

## 13. 智能体

Presmium 作为 agent 的环境：agent 经 MCP 读取文稿的全部内容与状态，也能操作它；agent 的修改落在源码上，每批成为一个提交（原则 6）。agent 运行时默认是 DeepSeek Harness，经 ACP 驱动，可以替换。

| 中文 | 标识符 | 含义 |
|---|---|---|
| agent 环境 | `@presmium/mcp` 的 `createPresmiumMcp` | MCP 服务：以工具与只读资源暴露工作区、文稿与放映状态；运行在 `presmium dev` 与 `presmium serve` 的进程中（`/mcp`），`presmium-mcp` 以 stdio 提供同样的工具 |
| agent 工具 | MCP 工具；插件贡献的 `AgentTool` | 读取类（`read`）、操作类（`operate`，需要确认）、计费类（`spend`，需要确认）；插件可以贡献工具，如讲授插件的 `lecture_preview` |
| agent 资源 | `presmium://…` | 与读取类工具对应的只读资源；放映位置的资源可以订阅更新 |
| agent 运行时 | `AgentRuntime`（`AGENT_RUNTIME`，Node） | 驱动一个 agent：打开会话、提交任务、接收事件、取消、关闭；唯一的实现是 ACP 客户端 |
| 运行时模式 | `AgentMode`（`AgentSessionOptions.mode`） | `author`（作者，可以写源码，默认配置模板 `presmium`）或 `tutor`（学习者问答，只读，配置模板 `presmium-tutor`） |
| agent 命令 | `PRESMIUM_AGENT_COMMAND`、`settings.presmium.assistant.command` | 运营者给出的启动命令；没有时助手不可用 |
| 模型提供方 | `AgentRuntime.provider`、`AgentClient.provider()` | 回答问题、修改文稿的模型属于哪家服务，界面据此标明（N-08） |
| 会话的 MCP 访问 | `AgentSessionOptions.mcp`（`McpAccess`） | 服务端为这个会话签发的 `/mcp` 地址与令牌（4A 节），写进 ACP `session/new` 的 `mcpServers` |
| 任务 | `AgentTaskRequest`、`AgentTask` | 一次交给 agent 的工作，种类 `AgentTaskKind`：`question` 问答、`annotations` 一批批注、`chat` 一轮对话、`transcript` 转写回写 |
| 上下文 | `AgentContext` | 任务所在的文档、章节、步骤、块、选中内容与源码位置 |
| 任务事件 | `AgentEvent` | 进度、回答（带引用位置）、确认请求、批注的处理结果、完成（带提交）、错误 |
| 引用位置 | `Citation` | 回答中可以点击跳转的位置：章节、步骤、块 |
| 批注 | `Annotation` | 目标（章节 ID、块 ID、源码文件与行区间、摘录）与要求；状态 `AnnotationStatus`：草稿、已发送、已处理、未能处理 |
| 浏览器端助手 | `AgentClient`（`AGENT`，浏览器） | 页面向服务端的助手提交任务并接收事件 |

**任务（聚合根）**：种类、发起成员、文档、上下文、批注、事件流与产生的修改。批注是任务内的实体，状态只由任务事件推进。

不变量：

- **只写源码，不碰产物**：agent 只修改工作区中的源码；写入超出当前文档目录或改动工作区配置时需要确认（`write`）。
- **一文档一任务**：同一文档同一时间只有一个修改任务；问答不受限制。
- **每批一提交**：修改任务结束时，修改由工作区提交为一个提交（`REVISIONS`），说明列出批注或对话摘要与 agent 的解释，尾注带 `Presmium-Task: <任务 ID>` 与发起人。
- **学习者只读**：`question` 任务使用 `tutor` 运行时，没有写文件、shell、网络与操作类工具；学习者不直接接触作者的 agent。
- **发送即确认**：编辑模式中发送一批批注或一条对话消息，就是对这次任务的写入的确认（N-08）；操作类、计费类工具与 agent 自身的权限请求仍逐次确认。
- **MCP 不提供写文件的工具**：agent 用自己的文件工具修改源码，服务随即重新编译并推送。
- 回答中的引用位置必须对应 IR 中的章节、步骤或块；无法解析的引用不显示为链接。
- agent 的启动命令与模型不来自文稿，只来自环境变量或工作区配置的运营者设置；没有给出命令时不启动任何 agent，问题与源码不发给任何模型服务。
- 提问与对话的界面标明模型的服务提供方。
- agent 经 MCP 能做什么由服务端签发给它的令牌决定（成员与模式），会话结束令牌即作废。

服务：`AGENT`（浏览器）、`AGENT_RUNTIME`（Node）；MCP 是对外的开放主机服务。

领域事件：任务事件 `AgentEvent` 是真实的事件流（服务端以 SSE 推给页面）；规划中的名字 `AgentTaskSubmitted`、`AgentTaskCompleted`、`AnnotationResolved` 与之对应。

## 14. 工作区

| 中文 | 标识符 | 含义 |
|---|---|---|
| 工作区 | `Workspace`；根目录的 `presmium.workspace.yaml` | 一个 git 仓库，包含多份文档；配置声明文档的位置（默认 `*/lecture.md`）、站点、成员、确认策略与插件的运营者设置 `settings`（如 agent 命令） |
| 文档 | `Document` | 一份文稿：目录（身份）、入口文件、标题、语言、标签，取自它的头部 |
| 文档操作 | `DocumentOperation` | 新建（从模板，或由 agent 起草）、重命名、复制、删除 |
| 文档模板 | `templates/document/<名>/` | 新建文档时复制的目录 |
| 修改 | `Revision` | 一个提交及其来源 `RevisionOrigin`：agent 任务、文档操作、作者在编辑器中的提交 |
| 修改历史 | `RevisionService`（`REVISIONS`，Node） | 提交、按文档或任务列出修改、撤销（`git revert`） |
| 成员 | `Member`（4A 节） | 登录身份与角色：读者、编辑者、所有者，来自登录代理或工作区配置 |
| 编辑模式 | `EditMode`（`EDIT_MODE`） | 页面上的编辑状态：批注、对话、文档操作与修改历史在其中可用 |
| 工作区站点 | `SiteSpec`、`Renderer.buildSite` | 多份文档组成的网站：首页（文档列表，或指定为一份文稿）、每份文档在 `/<文档目录>/` 下、跨文稿搜索与前后导航 |

**工作区（聚合根）**：文档的集合与它们的修改历史。

不变量：

- **文档的身份是目录**：重命名就是移动目录，同时改写其他文档中指向它的相对链接；文档目录中的锚点锁文件随目录移动。
- **文档操作即提交**：新建、重命名、复制、删除都是对源码目录的修改，各形成一个提交（来源 `document`）。
- **撤销即 `git revert`**：有冲突时报告冲突的文件，不强行撤销，工作树保持原样。
- **编辑按角色**：读者只能阅读与提问；编辑者可以进入编辑模式、修改与撤销；所有者另管工作区设置。
- **按需编译**：只编译正在被访问的文档并监听它的源码；其他文档只读取头部，用于列表。
- 浏览器不直接修改渲染结果；一切修改都落在源码上（原则 6）。

服务：`REVISIONS`（Node）、`EDIT_MODE`（浏览器）。

领域事件：git 历史就是工作区的事件日志：`DocumentCreated`、`DocumentRenamed`、`DocumentCopied`、`DocumentDeleted`、`RevisionCommitted`、`RevisionReverted` 都是带来源尾注的提交。

## 15. 讲授

一堂课的讲授以讲授轨保存：一条按时间排列的纯文本记录，包含说了什么（语音段的文字、时间与可选的音频）与做了什么（操作）。操作锚定到章节、块与锚点，讲义改版、换设备、换窗口大小后仍能回放；回放由讲授轨驱动真实的页面，不播放视频。讲授轨有三个来源，回放方式相同：录制、讲义的讲解（文字转语音）、讲授脚本。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 讲授轨 | `LectureTrack`（`addon-lecture` 的领域层） | 一堂讲授：语音段、事件、音频片段、块指纹与 IR 哈希、音色；存为文稿目录中的 `lectures/<id>/track.json`（格式见 `ir.md` 第 9 节） |
| 语音段 | `Utterance` | 一句话：开始时刻、时长、文字、逐字（中文）或逐词时间、所在章节与步骤、可选的译文 |
| 事件 | `TrackEvent`（内核） | `[毫秒, 类型, 数据]`；类型以插件 ID 或内置名开头，不认识的类型被忽略 |
| 操作 | `Operation`（内核）、`OPERATIONS`（宿主） | 插件报告的语义化操作：`go`、`point`、`spot`、`hint`、`ink`、`select`、`click`、`run`、`scroll`、`mark`、`pause` |
| 字锚 | `UtteranceAnchor`（事件数据的 `at`） | 把事件绑定到语音段的第几个字；改文字、换音色后按新的逐字时间重新计算事件时刻 |
| 块指纹 | `LectureTrack.blocks` | 被事件引用的块的内容指纹，用于漂移检查 |
| 时钟 | `TrackClock` | `now`、`play`、`pause`、`seek`、`rate`；录制的讲授用媒体元素（`MediaClock`），合成的讲授用按已知偏移排列的片段（`ClipClock`），只有字幕时用 `SilentClock` |
| 音色 | `Voice` | 录制（说话人）或合成（引擎、模型、音色）；克隆音色要有同意记录 `VoiceConsent`（见下文“语音”） |
| 讲授计划 | `LecturePlan` | `lecture` 渲染端从 IR 得到的每一步要说的文字与提示标记 |
| 提示标记 | `{cue}` 角色 | 讲解中的行内标记：说到此处时推进一步、聚光、提示、指点、点击、运行、圈画、停顿或标记章节 |
| 读音 | `{say}` 角色、头部的读音词典 | 显示一种写法，读出另一种 |
| 讲授脚本 | 讲解本身；可选的 `renderers.lecture.script` | 讲解逐段绑定到步骤，就是脚本；也可以用单独的 MyST 文件按章节标签代替讲解 |
| 字幕译文 | `Utterance.translations` | 语音段的其他语言文字，记录所依据的原文摘要 |
| 导出 | `captions.<语言>.vtt`、`chapters.vtt`、`events.vtt`；视频文件 | 只作为导出格式，不作为主存储 |

**讲授轨（聚合根）**：语音段与事件按时间排列；事件只经 ID 引用章节与块。

不变量：

- **文字是主存储**：音频可以由文字重新生成；语音段的文字改动后逐字时间重新对齐（未改动的字保留原时间，新字按字数插值），带字锚的事件随之重新计算时刻。
- 事件只引用章节、块（带内容指纹）与锚点，不引用像素与屏幕尺寸；讲授轨中没有视频。
- 时刻 t 的画面是 t 之前事件的折叠 `state(t) = fold(events ≤ t)`：跳转精确、可逆；回放者应用事件时宿主处于重放状态，插件不把重放当作用户操作报告。
- **漂移**：块指纹或 IR 哈希不一致时，检查项 `presmium.lecture` 按 exact、moved、fuzzy、lost 分级报告（同锚点）；回放丢弃失效的事件并提示。需要长期回放的块应写标签，生成的 `<kind>-<n>` ID 会随插入而移动。
- 录音默认只保存在本地，不提交（去处由运营者设置 `settings.presmium.lecture.audio` 决定）；只有对某一段讲授显式执行“转写”时才发给语音服务，转写的入口标明服务提供方。
- 合成的语音在播放界面上标明由 AI 合成，并写入元数据；克隆音色默认关闭，必须有本人录制的同意声明（语音服务把关）。
- 译文记录它所依据的原文摘要；原文改动后译文标记为过期，导出时提示。

### 语音

| 中文 | 标识符 | 含义 |
|---|---|---|
| 语音服务 | `SpeechService`（`SPEECH`） | 转写与合成；浏览器端经语音网关，Node 端直接调用引擎 |
| 引擎 | `SpeechEngineInfo` | `volcengine`（默认的生产引擎）、OpenAI 音频接口形态的引擎（按地址接入，如 Groq、OpenAI、自建服务）、`fake`（CI）、`webspeech`（浏览器试听，只用本机音色，不能导出）；其他服务以后作为新的适配器加入。`provider` 是服务提供方的名字，界面据此标明 |
| 引擎定义 | 环境变量 `PRESMIUM_SPEECH_<ID>_URL`、`PRESMIUM_SPEECH_<ID>_KEY` | 运营者在服务端给出的引擎：地址与凭据成对出现（火山引擎的地址固定在适配器中，只给凭据）；文稿只用 ID 选择引擎 |
| 同意记录 | `VoiceConsent`；`.presmium/speech/consent/<引擎>/<音色>.json` | 克隆音色的本人同意：说话人、范围、日期、同意声明录音的 sha256；随文稿提交 |
| 语音网关 | `addon-speech` 的服务端贡献 `/__presmium/presmium.speech/v1/` | Presmium 与语音之间唯一的协议：OpenAI 音频接口的形态，加上返回逐词时间的 `/audio/speech/timestamps`；只有网关接触服务提供方 |
| 合成 | `Synthesis` | 音频、时长、逐字时间、缓存键与引擎信息；`synthetic: true` |
| 转写 | `Transcript` | 语言、时长、文字、带逐字时间的语音片段 |
| 合成缓存 | `.presmium/speech/<键>.ogg`、`<键>.json`，`.presmium/speech.lock.json` | 按规范化的（引擎、模型、音色、语言、语速、风格、读音词典哈希、文字）的 sha256 缓存，随文稿提交 |

**合成缓存（聚合根）**：按键存放的合成结果与 `speech.lock.json`；键由规范化的请求决定，同一个键的内容不再改变。**同意记录**是另一个聚合，按（引擎，音色）标识。

不变量：

- 合成缓存保证可复现（原则 5）：命中缓存的段落从不重新合成，全部命中的构建不向引擎发出请求；构建只为缺失的段落调用引擎并写入缓存（同编译时执行的录制，K-19）；缓存缺失又没有可用的引擎时，构建与 `presmium check` 报错并指出是哪些段落；改一段只重新合成一段。
- 凭据只在服务端，并且只发往运营者为它给出的地址；文稿只写引擎与音色的名字，不写地址与凭据的变量名。
- 文字发给第三方语音服务须由运营者定义引擎、文稿选用它；没有定义引擎时不发出任何请求。
- 克隆音色只在运营者开启（`settings.presmium.speech.cloned`）且有该音色的同意记录时可以合成；语音服务在合成前检查，Node 端与语音网关是同一个关口。

服务：`SPEECH`（Node 与浏览器各一个实现，同一契约）。

规划中的领域事件：`TrackRecorded`、`TrackTranscribed`、`UtteranceEdited`、`ClipSynthesized`、`TrackDrifted`（目前以讲授轨文件的修改与检查诊断体现）。
