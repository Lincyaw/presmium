# Presmium 领域模型

本文档按领域驱动设计（DDD）描述 Presmium 的限界上下文、通用语言和领域对象。需求编号见 `requirements.md`，工程落地见 `architecture.md`。通用语言表中的“标识符”是代码中的名字；没有对应类型、只是某个类型的字段时，写出字段所在的位置。

## 1. 限界上下文总览

| 上下文 | 包 | 职责 | 覆盖需求 |
|---|---|---|---|
| 内核 Kernel | `@presmium/kernel` | 插件清单、服务注册、锚点契约、检查契约、步骤契约、IR 契约，以及插件共用的服务契约 | K-07、K-08、K-10、K-16、K-17 |
| 编译 Compilation | `@presmium/compiler`、`@presmium/cli` | 解析 MyST 源码、执行编译步骤、编译时执行与缓存、生成 IR、运行检查 | K-01、K-02、K-11、K-16、K-17、K-19 |
| 渲染 Rendering | `@presmium/viewer`、`@presmium/web`、`@presmium/render-slides`、`@presmium/render-notebook` | 从 IR 生成各媒介或在浏览器中动态渲染 IR，声明支持程度并降级；运行时视图 | K-18、K-20、P-70 至 P-77 |
| 宿主适配 Host | `@presmium/host`、`@presmium/slidev-addon-core`、`@presmium/web` | 形态无关的宿主接口，及其 Slidev、VitePress 两个实现 | K-04 至 K-07 |
| 讲台 Stage | `@presmium/slidev-addon-stage` | 基础内容、步骤备注、冻结画面、圈画标注 | P-01 至 P-04 |
| 代码引用 CodeRef | `@presmium/slidev-addon-code` | 引用、锁定、漂移、跳转、分步高亮、多版本 | P-10 至 P-16 |
| 代码执行 Execution | `@presmium/slidev-addon-exec`、`@presmium/slidev-addon-exec-local` | 执行服务、运行记录、分步执行、回退、环境复刻 | P-20 至 P-24、P-26 |
| 引导 Guidance | `@presmium/slidev-addon-guide` | 模拟光标、聚光、交互提示 | P-30 至 P-32 |
| 富内容 Content | `@presmium/slidev-addon-content` | 公式、图表、思维导图、媒体、Web 组件 | P-40 至 P-43 |
| 发布 Publishing | `@presmium/slidev-addon-publish` | 导出、离线、高对比度、可视化差异 | P-50 至 P-53 |
| 课堂 Classroom | `@presmium/slidev-addon-session`、`@presmium/slidev-addon-classroom`、`@presmium/classroom-server` | 会话、网络传输、跟随、笔记、测验、练习、提问、理解度 | P-60 至 P-67 |
| 编辑 Editing | `@presmium/language-server`、`presmium-vscode` | 编辑器中的诊断、跳转、悬停、补全，编辑器与预览同步 | P-80、P-81 |

文稿模型（章节、块、步骤、讲解）由 Presmium 以 IR 的形式自己定义，这是核心领域，也是各上下文之间的公开语言（Published Language）。Slidev、VitePress 只作为渲染端与浏览器宿主，负责排版、放映、搜索等它们擅长的部分。

## 2. 上下文映射

```
   源码（MyST）──► 编译 ──► IR（公开语言）──► 渲染：网页 · 幻灯片 · notebook
                    ▲                               │
              插件的指令、编译步骤、执行器             ▼
                                         宿主适配（防腐层：Slidev / VitePress）
                                                    │ 共享内核契约
                                             ┌──────▼───────┐
                         ┌──────────────────►│     内核      │◄──────────────────┐
                         │                   └──────────────┘                    │
                讲台 代码引用 代码执行 引导 富内容 发布 课堂                 编辑（语言服务）
```

- **内核是共享内核**：所有上下文只依赖内核的契约，彼此之间不直接依赖。多个插件共用的业务服务契约（`executor`、`session`、`classroomStore` 的接口）也放在内核包中，因为提供方与使用方是不同的插件（`architecture.md` 4.5 节）。
- **宿主适配是防腐层**：插件的组件与浏览器端代码（`components/`、`src/client/`）不引用 `@slidev/*` 与 vitepress，只通过 `@presmium/host` 获取步骤状态、服务与形态信息，因此同一个组件可以在两种形态中运行。只在幻灯片形态中加载的部分（插件包的 `setup/` 与全局图层）可以使用 `@slidev/client` 的公开导出；只有网页渲染端使用 vitepress。领域层（`src/domain/`）不引用 Vue。完整规则见 `architecture.md` 第 3 节。
- **上下文之间通过服务协作**：例如课堂的练习校验使用代码执行提供的 `executor` 服务；测验、笔记等功能使用会话插件提供的 `session` 服务，会话插件可以整体替换。

## 3. 内核

### 通用语言

| 中文 | 标识符 | 含义 |
|---|---|---|
| 插件 | `PluginDefinition` | 清单加初始化函数与可选的 `dispose` |
| 插件清单 | `PluginManifest` | ID、版本、兼容内核版本、提供与依赖的服务、所需能力 |
| Node 端插件 | `PresmiumNodePlugin` | 插件在编译与渲染中的部分：指令、编译步骤、执行器、渲染端、渲染端扩展、检查项 |
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
| 执行规格 | `RunSpec` | 代码节点的 `run`：语言、参数、超时、执行时机（编译时、现场、两者） |
| 执行缓存 | `RunCache` | 按内容哈希保存的执行结果（`RecordedRun`），位于 `.presmium/freeze/` |

不变量：

- 编译是确定的：同一源码、同一缓存得到相同的 IR。
- 每个章节 ID 在文稿内唯一；块 ID 在章节内唯一。
- 讲解块的 `at` 不超过所在章节的步骤数。
- 编译诊断与检查诊断使用同一个 `Finding` 类型，都带源码位置。

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

**步骤可逆约定**：插件组件的视觉状态必须是步骤的纯函数。组件通过 `v-click` 标记向宿主登记步骤（网页形态由兼容层处理），用 `useStepState` 读取状态，不在点击事件回调中修改不可回放的状态。

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
| 执行器 | `Executor` | 服务接口：`supports(lang)`、`run(request)`，可选的环境指纹 `fingerprint` |
| 执行路由 | `ExecutorRouter` | `executor` 服务：按语言与优先级把请求交给已登记的执行器 |
| 执行请求 | `RunRequest` | 语言、代码、参数、标准输入、文件、超时 |
| 执行结果 | `RunResult` | 输出、退出码、耗时、是否超时、来源（现场或预录）、执行器 |
| 运行记录 | `RunHistory` | 一个代码块在当前视图中的多次运行（`RunRecord`），可两两对比 |
| 执行轨迹 | `Trace` | 逐行执行事件序列，用于分步执行 |
| 预录输出 | `RecordedOutput` | 执行失败或超时时的回退内容 |
| 运行环境 | `Devcontainer`（本地容器）；浏览器中为 Pyodide 与脚本 Worker | 代码运行的环境 |

不变量：

- 执行失败或超时，且存在预录输出时，必须显示预录输出并标明来源。
- 运行记录只保存在当前视图，不写回文稿。
- 分步执行的每一步对应一个步骤，后退时显示该步之前的累计输出。

服务：`executor`（多个实现按语言组合，由 `ExecutorRouter` 汇总）。

## 7. 引导

| 中文 | 标识符 | 含义 |
|---|---|---|
| 目标 | `CueTarget` | CSS 选择器 |
| 路径点 | `Waypoint` | 光标路径上的一点：目标、动作（移动、悬停、点击）、到达的步骤 |
| 聚光 | `PmSpotlight` | 遮罩加高亮区域 |
| 交互提示 | `PmHint` | 指向可交互元素的提示动画 |

不变量：提示状态只由当前步骤决定；系统开启“减少动态效果”时，动画退化为直接显示终态。

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

不变量：

- 只有主讲人能开放或关闭测验、结束课堂、标记问题已回答。
- 课堂结束后不再接受作答、提交与提问。
- 笔记只对作者可见。
- 统计只统计每位参与者的最后一次作答或投票。

信任模型：课堂服务（`@presmium/classroom-server`）面向课堂自己的网络，不验证参与者身份，拿到加入链接的人都能连接。主讲人的权利由服务端强制：创建课堂的窗口连接时声明房间密钥（`?claim=<key>`），只有持有该密钥的连接可以写入课堂状态与测验的开放状态、归档课堂；学习者只能写入自己参与者 ID 下的作答。学习者的私有笔记在各自的房间中。

服务：`session`（当前参与者、角色、课堂状态）、`classroomStore`（共享文档的读写）。

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

不变量：

- 每个章节恰好对应一页幻灯片和一节网页，章节 ID 稳定（来自 MyST 标签或标题），形态切换依赖此映射。
- 讲解在网页中是正文；文档视图全部显示，滚动叙事视图随滚动推进步骤。
- 网页搜索索引在构建时从 IR 文本生成并随产物发布，离线可用。
- IR 运行时渲染的 `.pm-section[data-section]`、`.pm-block[data-block]` 是对外的标记契约（课堂笔记据此挂载）。

## 10. 发布

| 中文 | 标识符 | 含义 |
|---|---|---|
| 导出任务 | `ExportJob` | 格式、范围、是否按步骤展开 |
| 离线清单 | `OfflineManifest` | 需要预缓存的资源 |
| 视觉差异 | `VisualDiff` | 两个提交在同一页同一步骤上的像素差异比例 |

不变量：视觉差异超过阈值的页必须列入报告；导出的 PDF 中，幻灯片显示的每个链接（包括代码的永久链接）都必须仍是链接，丢失的链接带源码位置报告。

## 11. 编辑

语言服务 `@presmium/language-server` 用 `@presmium/compiler` 编译编辑中的文稿，通过 LSP 提供诊断、锚点跳转、悬停（引用的代码与最近一次输出）与补全（region 名、指令与选项）；VS Code 扩展 `presmium-vscode` 启动它，并把编辑器光标所在的章节发给 `presmium dev` 的预览（P-80、P-81）。

| 中文 | 标识符 | 含义 |
|---|---|---|
| 锚点引用 | `AnchorRef` | 源码中写出的一个锚点及其行与列，用于跳转与悬停 |
| 光标所在章节 | `SectionAt` | 编辑器位置对应的章节 ID，用于预览同步 |

不变量：编辑只在源码中进行，语言服务与预览都不修改源码。
