# Presmium 领域模型

本文按领域驱动设计列出 Presmium 的限界上下文、上下文之间的关系与代码中的用词。核心域是教学文稿：`lecture.json` 中的 `TeachingDocument` 与由它派生的运行快照 `IRDocument`，见 [ir.md](ir.md)。包、分层与跨上下文契约的细节见 [architecture.md](architecture.md)，工作台见 [studio.md](studio.md)，作者动作见 [authoring-actions.md](authoring-actions.md)，云空间见 [cloud.md](cloud.md)，界面用词见 [glossary.md](glossary.md)。

## 1. 限界上下文

| 上下文 | 职责 | 主要包 | 关键聚合与实体 |
|---|---|---|---|
| 文稿 Document（核心域） | 可编辑文稿的结构、身份、引用与校验；各上下文共用的公开语言 | `@lincyaw/kernel`（`contracts/document.ts`、`document.ts`） | `TeachingDocument`（聚合根）、`Section`、`DocumentBlock`、`Step`、`Narration`、`Asset`、`Definition`、`Production`、`DocumentThread` |
| 内核 Kernel | 插件与服务的注册和启动、锚点、检查、诊断、跨插件的服务契约 | `@lincyaw/kernel` | `Kernel`（聚合根）、`PluginDefinition`、`PluginManifest`、`ServiceToken`、`ServiceRegistry`、`Resolution`、`Finding` |
| 编译 Compilation | 校验文稿、lowering、解析步骤状态、运行编译步骤、代码引用与执行、受众筛选、派生运行快照与诊断 | `@lincyaw/compiler`、`@lincyaw/cli`、`@lincyaw/presmium` | `Compilation`、`IRDocument`、`IRSection`、`IRBlock`、`IRPass`、`RunCache` |
| 渲染 Rendering | 从运行快照生成网页、幻灯片、notebook；查看器运行时、站点外壳、文件发布、工作区站点 | `@lincyaw/viewer`、`@lincyaw/web`、`@lincyaw/render-slides`、`@lincyaw/render-notebook` | `Renderer`、`Support`、`ViewDefinition`、`SiteSpec`、`WebPage`、`RenderOutput` |
| 宿主适配 Host | 组件与浏览器端代码看到的形态无关接口：步骤、导航、共享状态、操作、服务 | `@lincyaw/host`，实现在 `@lincyaw/web` | `HostAdapter`、`Cursor`、`Navigation`、`Operations`、`SharedStateScope` |
| 服务端 Server | `presmium dev`、`serve` 中唯一的 HTTP 服务：挂载插件路由与代理，检查请求来源，确认操作，签发 MCP 令牌，持有凭据与运营者设置 | `@lincyaw/server` | 服务端（每进程一个聚合根）、`ServerContribution`、`Member`、`Approvals`、`McpEndpoint` |
| 代码引用 CodeRef | 引用工程代码：锚点解析、锁定、漂移、分步高亮、多版本 | `@lincyaw/addon-code` | `CodeOrigin`、`AnchorLock`、`CodeVariant` |
| 代码执行 Execution | 执行服务与路由、运行记录、分步执行、预录回退 | `@lincyaw/addon-exec`、`@lincyaw/addon-exec-local` | `Executor`、`ExecutorRouter`、`RunRequest`、`RunResult`、`RunHistory` |
| 执行环境 Environment | 具名环境、环境提供方与指纹、执行会话、富输出、远端凭据方式、浏览器终端 | `@lincyaw/addon-exec-jupyter`、`@lincyaw/addon-exec-wasi`、`@lincyaw/addon-exec-webgpu` | `ExecuteConfig`（聚合根）、`EnvironmentSpec`、`EnvironmentProvider`、执行会话（聚合根） |
| 内容插件 | 讲台（步骤备注、冻结画面、圈画）、引导（模拟光标、聚光、提示）、富内容（公式、图表、媒体、Web 组件）、动画场景 | `@lincyaw/addon-stage`、`addon-guide`、`addon-content`、`addon-motion` | 组件（`PmMedia`、`PmScene` 等）、`Waypoint`、`CueTarget` |
| 发布 Publishing | 导出、离线、高对比度、视觉差异、发布检查 | `@lincyaw/addon-publish`；受众筛选在编译 | `ExportJob`、`VisualDiff` |
| 课堂 Classroom | 课堂会话、同步传输、跟随、笔记、测验、练习、提问、理解度、先预测再揭示 | `@lincyaw/addon-session`、`@lincyaw/addon-classroom`、`@lincyaw/classroom-server` | `SessionSnapshot`、`Participant`、`ClassroomStore`、`Answer`、`Question` |
| 讲授 Lecture | 讲授计划、讲授轨、录制与回放、导出视频、字幕 | `@lincyaw/addon-lecture` | `LectureTrack`（聚合根）、`ProductionPlan`、`LecturePlan`、`Utterance`、`TrackEvent` |
| 语音 Speech | 合成与转写、引擎适配、合成缓存、克隆音色的同意记录 | `@lincyaw/addon-speech` | `SpeechService`、`Synthesis`、`Transcript`、合成缓存（聚合根）、`ConsentRecord` |
| 工作区 Workspace | 多份文档的工程：文档操作、文稿事务、修改历史与撤销、锁、编译会话、修改审阅、工作区站点 | `@lincyaw/workspace` | `Workspace`（聚合根）、`Document`、`Revision`、`RevisionService`、`DocumentLockService`、`DocumentFiles`、`CompileSession`、`ChangeReview`（聚合根） |
| 智能体 Agent | agent 环境（MCP 工具与资源）、焦点、读者问答 | `@lincyaw/mcp`、`@lincyaw/addon-assistant` | `AgentContext`、`Focus`、`AgentTool`、`AskClient` |
| 工作台 Workbench | 作者界面：文稿列表、文稿编辑、批注、AI 改写、历史、对话；DeepSeek Harness 的防腐层 | `@lincyaw/workbench`、`@lincyaw/dsh`、`@lincyaw/studio`、`@lincyaw/design` | bundle、`DiagnosticSnapshot`、预览协议 `PREVIEW_PROTOCOL` |
| 编辑器集成 Editing | 代码编辑器中的诊断、跳转、悬停、补全与预览同步 | `@lincyaw/language-server`、`presmium-vscode` | `AnchorRef`、`SectionLocation` |
| 云空间 Cloud | 账号、空间成员、持久文稿事务、订阅与预算、远程 MCP、个人执行环境 | `@lincyaw/cloud` | 见 [cloud.md](cloud.md) |

主要不变量：

- **文稿**：映射键等于 ID，内容树单父无环，引用、参数与状态有效，每页至少一步，任意定位可重建画面（[ir.md](ir.md) 第 2、3 节）。
- **内核**：插件 ID 唯一；一个服务令牌在一个作用域内只有一个实现；插件按服务依赖拓扑启动，环上插件全部禁用；必需依赖缺失或内核版本不兼容时禁用，可选依赖缺失时降级；单个插件初始化失败只禁用它与必需依赖它的插件。
- **锚点解析**：`Resolution` 为 `exact`、`moved`、`fuzzy`、`lost`；只有前两种直接用于渲染，后两种必须产生诊断。
- **渲染**：渲染端只读运行快照，不读不写文稿；网页渲染端对所有节点为 `full`；`none` 的块出现在构建报告中。
- **宿主适配**：组件的视觉状态是步骤的纯函数；操作以章节、块与锚点为坐标报告给 `OPERATIONS`，重放某一时刻等于从空状态依次应用此前的操作，重放时不报告。
- **服务端**：凭据只在服务端，不进入文稿、IR、产物与浏览器；确认的关口在服务端，任何 agent 运行时经同一个 `Approvals`；确认策略只来自命令行与工作区配置，不来自文稿；不声称隔离同一 uid 的代码，措施是纵深防御。
- **执行环境**：同一会话按请求顺序执行、只用一个环境；环境指纹与执行器修订进入缓存键。
- **讲授**：讲授轨中的事件只经 ID 引用章节与块；讲授计划绑定精确的文稿来源与快照 revision，只读缓存，不隐式合成。
- **工作区**：每次修改是一个 git 提交，撤销是 `git revert`；写文档目录只经 `DocumentFiles`；审阅从首次写入到接受或拒绝持有范围内的锁。

领域事件只有内核在 `EventBus` 上发出的 `kernel.plugin.started`、`degraded`、`disabled`、`failed`。

## 2. 上下文映射

```text
lecture.json ──► 编译 ──► 运行快照 ──► 渲染：网页 · 幻灯片 · notebook · 讲授
                  ▲                       │
   插件：指令、角色、编译步骤、执行器、    ▼
   环境提供方、渲染端扩展          宿主适配（浏览器）＋ 服务端（Node）
                                          │
                          ┌───────────────▼───────────────┐
                          │ 内核（共享内核）＋ 文稿（公开语言） │
                          └───────────────▲───────────────┘
 讲台 引导 富内容 动画 发布 代码引用 代码执行 执行环境 课堂 讲授 语音 │ 工作区 智能体 工作台 编辑器集成
           外部：Jupyter Server · 语音服务 · DeepSeek Harness · git
```

- **共享内核**：各上下文只依赖 `@lincyaw/kernel` 的契约，插件包之间不互相引用。多个插件共用的服务契约（`executor`、`session`、`classroomStore`、`speech`、`agent`、`revisions`、`approvals`、`mcpEndpoint` 与 `TrackEvent`）也在内核中，因为提供方与使用方是不同的插件。
- **公开语言**：文稿 IR 与运行快照是 Presmium 自己定义的格式，编译、渲染、讲授、智能体与工作台都以它交流。
- **防腐层**：组件与浏览器端代码只经 `@lincyaw/host` 取得步骤、服务与形态；插件的 Node 端只经 `ServerContext`、`RequestContext` 使用服务端。每个外部系统只在一个适配器中出现。

| 上游 | 下游 | 关系 | 经由 |
|---|---|---|---|
| 文稿 | 编译、工作区、智能体、工作台 | 公开语言 | `TeachingDocument`、`validateDocument`、`DocumentEditOperation` |
| 编译 | 渲染、讲授、智能体、工作台 | 公开语言 | `IRDocument`、`CanonicalSource` |
| 内核 | 全部 | 共享内核 | `PresmiumNodePlugin`、`ServiceToken`、服务契约 |
| 执行环境 | 代码执行 | 客户与供应商：环境的执行器登记到路由，按 ID 选择 | `EnvironmentProvider`、`EXECUTOR` |
| 代码执行、会话插件 | 课堂 | 客户与供应商：练习校验；会话插件可整体替换 | `EXECUTOR`、`SESSION`、`ClassroomStore` |
| 宿主适配 | 讲授、引导、代码执行 | 共享内核：插件报告操作，讲授录制并重放 | `OPERATIONS`、`TrackEvent` |
| 服务端 | 执行环境、语音、智能体、工作区、讲授 | 宿主：挂载贡献，处理来源、凭据、运营者设置与确认 | `ServerContribution`、`APPROVALS`、`MCP_ENDPOINT` |
| 语音 | 讲授、智能体 | 客户与供应商：合成与转写 | `SPEECH` |
| 讲授 | 工作台 | 客户与供应商：讲授计划与媒体 | `ProductionPlan`、`production-*` 路由 |
| 工作区 | 智能体、讲授、工作台 | 客户与供应商：文稿事务、修改历史、审阅、锁 | `REVISIONS`、`CHANGE_REVIEW`、`DOCUMENT_LOCKS`、工作区路由 |
| 智能体 | 外部 agent、工作台中的 agent | 开放主机服务：一张工具表，MCP 与 dsh 两个适配器 | `@lincyaw/mcp` |
| 渲染（产物） | 工作台、编辑器集成 | 开放主机服务：产物只暴露锚点，经预览协议回答定位与播放 | `PREVIEW_PROTOCOL`、`data-section`、`data-block`、`data-step` |
| 外部 Jupyter Server | 执行环境 | 防腐层：Jupyter 内核协议客户端 | `addon-exec-jupyter` |
| 外部语音服务 | 语音 | 防腐层：引擎适配器，对内只有 OpenAI 音频接口的形态 | `addon-speech` 的 `v1/*` |
| 外部 DeepSeek Harness | 工作台 | 防腐层：只有 `@lincyaw/dsh` 引用 dsh 接口，`@lincyaw/studio` 只启动它 | bundle |

## 3. 代码中的用词

### 3.1 领域名词

| 词 | 含义 | 代码名 |
|---|---|---|
| 文稿 | `lecture.json` 中的可编辑教学文稿 | `TeachingDocument` |
| 文档 | 工作区中的一份文稿：目录、入口、标题、语言、标签 | `Document` |
| 页面 | 文稿的一页；运行快照中是章节 | `Section`、`IRSection` |
| 内容块 | 富文本、容器、图片、代码或组件实例 | `DocumentBlock`、`IRBlock` |
| 步骤 | 一页中的一个完整画面状态 | `Step`、`VisualState` |
| 讲稿 | 绑定步骤的结构化讲解：文字、读音、提示 | `Narration`、`NarrationNode` |
| 提示 | 讲稿中在某处触发的动作 | cue（`NarrationNode` 的 `cue`、`CueTarget`） |
| 讲授编排 | 作者时序：时机、音色来源、提示延迟、字幕时间、媒体片段 | `Production` |
| 运行快照 | 编译器派生的运行数据 | `IRDocument` |
| 讲授计划 | 从快照派生的不可变时间线 | `ProductionPlan`、`ProductionBinding` |
| 讲授轨 | 一堂讲授的语音段与事件 | `LectureTrack`、`Utterance`、`TrackEvent` |
| 修改 | 工作区的一次 git 提交 | `Revision` |
| 诊断 | 带严重级别与位置的问题 | `Finding`、`DocumentIssue`、`ProductionDiagnostic` |
| 焦点 | 用户指向的一处 | `Focus` |

### 3.2 易混淆的词

一个词只指一样东西。作者与部署看得见的名字（配置键、命令参数、路由、协议字段、持久化字段）不跟着改。

| 词 | 只指 | 其他含义改用 |
|---|---|---|
| host | 宿主适配 `HostAdapter` 及其实现；宿主实现的接口（`ServerHost`、`McpHost`） | 挂载视图的组件 outlet；监管子进程的 launcher；一次编译的检查与构建 compilation action；HTTP `Host` 头 `hostName`；监听地址 `listenAddress` |
| kernel | `@lincyaw/kernel`、`Kernel`、插件契约的版本 | Jupyter 内核 `jupyterKernel`；浏览器端插件的启动停止 runtime |
| session | 课堂会话（`SessionService`、`SESSION`） | 执行会话 runSession（字段 `RunSpec.session` 不改）；一份文档的编译与开发服务器 `CompileSession`；dsh 的会话 agentSession；`dev()` 的一组服务器 `DevServers` |
| service | 内核服务：`ServiceToken` 标识、经 `provide`、`get`、`tryGet` 取得 | 进程或 HTTP 服务 server；`serviceWorker`；懒加载模块 `load<库名>` |
| place | 文档中的位置 `{ section, block }` | 代码在哪运行 runsIn；界面位置 slot、placement；源码位置 source（`SourcePos`）；主讲位置 position |
| runner | 子进程或 Worker 中的运行器脚本 | 执行服务 executor；启动说明 launch spec；一次运行 run |
| follow | 课堂中学习者跟随主讲 | 订阅流 subscribe；同步状态 record、sync；监视文件 watch |
| view | 查看器的视图 `ViewDefinition` 与 `ViewRole`；一个渲染端看到的 IR（`viewFor`） | 按受众筛选的 IR `audienceDocument`；预览的媒介 renderer；分栏 layout |
| revision | 工作区的一次修改（`Revision`、`REVISIONS`） | 快照的内容哈希 irRevision；执行器代码版本 `Executor.revision`；按 git 引用读文件 `GitRead` |
| version | 文稿或文件字节的版本，用于提交时的版本检查 | 快照的内容哈希 irRevision |
| preview | 嵌在工作台或编辑器中的产物页面与预览协议 | `presmium dev` 的页面 dev server |
| theme | 框架主题：dsh 界面主题、Shiki 主题 | 明暗 appearance、dark；设计取值 design token |
| cue | 讲稿中触发的提示动作 | 页面上指出的一处 target；讲授的指点 point |
| mark | 必须带限定：`AudienceMark`、作者标记、`roleMark`、讲授的 `mark`、`StepMark` | 圈画 ink；指点 point；高亮 highlight |
| script | 讲授脚本，即步骤绑定的 `Narration` | 运行 JS、TS 的执行器 `ScriptExecutor` |
| token | 服务令牌 `ServiceToken` | 访问凭据 accessToken 或 `mcpToken`；设计取值 design token；分词 `tokenize` |
| workspace | `presmium.workspace.yaml` 界定的工程目录 | dsh 的 `dshWorkspace`；VS Code 的 `workspaceFolder`；包管理器的 package workspace |

### 3.3 动词与命名

- **read** 只表示 I/O。文本变结构写 parse；把 unknown 收窄写 `to*`、`as*`，不合法时返回 undefined 或给出诊断。
- **get** 找不到时抛错；返回 undefined 的写 `tryGet`、`find*`。Context 上的服务查找沿用 `service(token)`。
- 执行动作的函数以动词开头，副作用要在名字中说出；只计算的函数可以用名词短语（`viewFor`）。
- 布尔值用 `is*`、`has*`、`can*`；工厂写 `create*`；组合式函数写 `use*`；服务令牌是大写常量加 `defineService`。
- 名字写全称（`implementation`、`passContext`），`ctx` 只作参数名。
