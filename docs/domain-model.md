# Presmium 领域模型

本文档按领域驱动设计（DDD）描述 Presmium 的限界上下文、通用语言和领域对象。需求编号见 `requirements.md`，工程落地见 `architecture.md`。

## 1. 限界上下文总览

| 上下文 | 包 | 职责 | 覆盖需求 |
|---|---|---|---|
| 内核 Kernel | `@presmium/kernel` | 插件清单、服务注册、锚点契约、检查契约、步骤契约、IR 契约 | K-07、K-08、K-10、K-16、K-17 |
| 编译 Compilation | `@presmium/compiler` | 解析 MyST 源码、执行编译步骤、编译时执行与缓存、生成 IR | K-01、K-02、K-11、K-17、K-19 |
| 渲染 Rendering | `@presmium/viewer`、`@presmium/web`、`@presmium/render-slides`、`@presmium/render-notebook` | 从 IR 生成各媒介或在浏览器中动态渲染 IR，声明支持程度并降级；运行时视图 | K-18、K-20、P-70、P-75、P-76、P-77 |
| 宿主适配 Host | `@presmium/host`、`@presmium/slidev-addon-core`、`@presmium/web` | 形态无关的宿主接口，及其 Slidev、VitePress 两个实现 | K-04、K-05、K-06、K-07 |
| 检查 Diagnostics | `@presmium/cli` | 解析文稿、运行检查项、输出诊断 | K-16 |
| 讲台 Stage | `@presmium/slidev-addon-stage` | 基础内容、步骤备注、冻结画面、圈画标注 | P-01 至 P-04 |
| 代码引用 CodeRef | `@presmium/slidev-addon-code` | 引用、锁定、漂移、跳转、分步高亮、多版本 | P-10 至 P-16 |
| 代码执行 Execution | `@presmium/slidev-addon-exec`、`@presmium/slidev-addon-exec-local` | 执行服务、运行记录、分步执行、回退、回写、环境复刻 | P-20 至 P-26 |
| 引导 Guidance | `@presmium/slidev-addon-guide` | 模拟光标、聚光、交互提示 | P-30 至 P-32 |
| 富内容 Content | `@presmium/slidev-addon-content` | 公式、图表、思维导图、媒体、Web 组件 | P-40 至 P-43 |
| 网页形态 Web | `@presmium/web` | 文稿到网页的转换、搜索、翻阅、滚动叙事、形态切换 | P-70 至 P-74 |
| 发布 Publishing | `@presmium/slidev-addon-publish` | 导出、离线、高对比度、可视化差异 | P-50 至 P-53 |
| 课堂 Classroom | `@presmium/slidev-addon-session`、`@presmium/slidev-addon-classroom`、`@presmium/classroom-server` | 会话、网络传输、跟随、笔记、测验、练习、提问、理解度 | P-60 至 P-67 |

文稿模型（章节、块、步骤、讲解）由 Presmium 以 IR 的形式自己定义，这是核心领域，也是各上下文之间的公开语言（Published Language）。Slidev、VitePress 只作为渲染端与浏览器宿主，负责排版、放映、搜索等它们擅长的部分。

## 2. 上下文映射

```
        ┌──────────┐      ┌───────────┐
        │  Slidev  │      │ VitePress │   上游，Presmium 遵从其模型
        └────┬─────┘      └─────┬─────┘
             └────── 防腐层 ─────┘
                 ┌──────▼───────┐
                 │  宿主适配     │
                 └──────┬───────┘
                        │ 共享内核契约
                 ┌──────▼───────┐
   ┌────────────►│    内核       │◄────────────┐
   │             └──────────────┘             │
讲台 代码引用 代码执行 引导 富内容 网页 发布 课堂   检查 CLI
```

- **内核是共享内核**：所有上下文只依赖内核的契约，彼此之间不直接依赖。
- **宿主适配是防腐层**：除宿主适配外，任何上下文都不得引用 `@slidev/*` 或 `vitepress`。领域层不得引用 Vue；界面组件只通过 `@presmium/host` 获取步骤状态、服务与形态信息，因此同一个组件可以在两种形态中运行。
- **上下文之间通过服务协作**：例如课堂的练习校验使用代码执行提供的 `executor` 服务；测验、笔记等功能使用会话插件提供的 `session` 服务，会话插件可以整体替换。

## 3. 内核

### 通用语言

| 中文 | 标识符 | 含义 |
|---|---|---|
| 插件 | `PluginDefinition` | 清单加初始化函数 |
| 插件清单 | `PluginManifest` | ID、版本、兼容内核版本、提供与依赖的服务、所需能力 |
| 服务令牌 | `ServiceToken<T>` | 以字符串 ID 标识的服务接口 |
| 服务注册表 | `ServiceRegistry` | 登记服务实现、解析依赖 |
| 内核 | `Kernel` | 注册插件、按依赖顺序启动、产出启动报告 |
| 启动报告 | `StartReport` | 每个插件的状态：已启动、已降级、已禁用，及原因 |
| 锚点 | `Anchor` | 稳定引用，形如 `region:src/math.py#add` |
| 锚点解析器 | `AnchorResolver` | 按方案（scheme）解析锚点 |
| 解析结果 | `Resolution` | 状态加位置与内容指纹 |
| 指纹 | `Fingerprint` | 归一化内容的哈希，用于判断是否变化 |
| 检查项 | `Check` | 对文稿运行、产出诊断的函数 |
| 诊断 | `Finding` | 严重级别、消息、源码位置、修复建议 |
| 步骤区间 | `StepRange` | 一个提示或高亮生效的步骤范围 `[from, to)` |

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

`PluginStarted`、`PluginDegraded`、`PluginDisabled`、`PluginFailed`。

## 3A. 编译

| 中文 | 标识符 | 含义 |
|---|---|---|
| 源码 | `SourceDocument` | 入口 MyST 文件及其引入的文件 |
| 指令 | `DirectiveSpec` | 插件注册的 MyST 指令，把源码节点转换为 IR 节点 |
| 编译步骤 | `IRPass` | IR 上的有序变换 |
| 中间表示 | `IRDocument` | 编译结果：章节、块、步骤、讲解、录制输出 |
| 块角色 | `BlockRole` | `visual`（上屏内容）或 `narration`（讲解） |
| 执行缓存 | `RunCache` | 按内容哈希保存的执行结果，位于 `.presmium/freeze/` |

不变量：

- 编译是确定的：同一源码、同一缓存得到相同的 IR。
- 每个章节 ID 在文稿内唯一；块 ID 在章节内唯一。
- 讲解块的 `at` 不超过所在章节的步骤数。
- 编译诊断与检查诊断使用同一个 `Finding` 类型，都带源码位置。

领域事件：`DocumentCompiled`、`RunRecorded`、`RunCacheHit`。

## 3B. 渲染

| 中文 | 标识符 | 含义 |
|---|---|---|
| 渲染端 | `Renderer` | 从 IR 生成一种媒介 |
| 支持程度 | `Support` | `full`、`degraded`、`none` |
| 渲染扩展 | `RendererExtension` | 插件为某个渲染端提供的组件转换 |
| 构建报告 | `RenderOutput` | 产物目录与未渲染的块 |
| 运行时视图 | `View` | IR 运行时中的一种呈现方式：文档、滚动叙事、放映，可由插件注册 |
| 章节更新 | `SectionPatch` | 实时更新时推送的变化章节及其诊断 |

不变量：

- 网页渲染端对所有节点的支持程度都是 `full`。
- 渲染端只读 IR，不读源码，不回写源码。
- 支持程度为 `none` 的块必须出现在构建报告中。

## 4. 宿主适配

`@presmium/host` 定义形态无关的宿主接口 `HostAdapter`，`@presmium/slidev-addon-core` 与 `@presmium/web` 分别实现。

| 中文 | 标识符 | 幻灯片形态（Slidev） | 网页形态（VitePress） |
|---|---|---|---|
| 形态 | `PresentationMode` | `'slides'` | `'document'` |
| 光标 | `Cursor { slide, step }` | `useNav()` 的当前页与 `$clicks` | 当前章节；滚动叙事式下为滚动到的步骤 |
| 步骤状态 | `useStepState(range)` | 由 `$clicks` 推导 | 文档式下恒为已到达；滚动叙事式下由滚动推导 |
| 视图角色 | `ViewRole` | 听众、演讲者 | 读者 |
| 传输 | `SyncTransport` | `addSyncMethod` 注册的同步方式 | 不适用 |
| 错误边界 | `PmBoundary` | Vue `onErrorCaptured` | 同左 |
| 演讲者面板 | `PresenterPanel` | 仅在演讲者渲染上下文显示的全局图层 | 不显示 |

**步骤可逆约定**：插件组件的视觉状态必须是 `$clicks` 的纯函数。组件通过模板中的 `v-click` 标记向 Slidev 登记步骤，不在点击事件回调中修改不可回放的状态。

## 5. 代码引用

| 中文 | 标识符 | 含义 |
|---|---|---|
| 代码引用 | `CodeRef` | 锚点 + 可选的锁定提交 + 显示选项 |
| 锁定 | `Pin { commit }` | 引用读取的提交版本 |
| 源码快照 | `SourceSnapshot` | 某提交下锚点解析得到的代码文本与位置 |
| 漂移 | `Drift` | 锁定版本与工作区（或指定分支）之间同一锚点的差异 |
| 永久链接 | `Permalink` | 指向远端仓库某提交、某文件、某行区间的 URL |
| 逻辑单元 | `CodeUnit` | 被嵌套 `#region` 标记出的子区间，用于分步高亮 |
| 代码版本组 | `CodeVariantGroup` | 同一代码块的多个版本 |

不变量：

- 锁定提交存在时，渲染内容必须来自该提交，而不是工作区。
- 永久链接只在能解析出远端仓库地址时生成；否则退化为相对路径并产生 `info` 诊断。
- 分步高亮的区间由逻辑单元名称换算为行号，换算在构建时完成，文稿源码中不出现行号。

领域事件：`DriftDetected`、`AnchorLost`。

## 6. 代码执行

| 中文 | 标识符 | 含义 |
|---|---|---|
| 执行器 | `Executor` | 服务接口：`supports(lang)`、`run(request)` |
| 执行请求 | `RunRequest` | 语言、代码、参数、标准输入、超时 |
| 执行结果 | `RunResult` | 输出片段、退出码、耗时、是否超时 |
| 运行记录 | `RunHistory` | 一个代码块的多次运行，可两两对比 |
| 执行轨迹 | `Trace` | 逐行执行事件序列，用于分步执行 |
| 预录输出 | `RecordedOutput` | 执行失败时的回退内容 |
| 运行环境 | `Environment` | devcontainer 定义或浏览器内运行时 |

不变量：

- 执行失败或超时，且存在预录输出时，必须显示预录输出并标明来源。
- 运行记录只保存在当前视图，不写回文稿。
- 分步执行的每一步对应一个步骤，后退时显示该步之前的累计输出。

服务：`executor`（多个实现按语言组合，由 `ExecutorRouter` 汇总）。

## 7. 引导

| 中文 | 标识符 | 含义 |
|---|---|---|
| 提示 | `Cue` | 在某步骤区间内作用于某目标的视觉效果 |
| 目标 | `CueTarget` | CSS 选择器或节点 ID |
| 光标路径 | `CursorPath` | 有序的路径点，每个路径点带动作（移动、悬停、点击） |
| 聚光 | `Spotlight` | 遮罩加高亮区域 |
| 交互提示 | `Hint` | 指向可交互元素的提示动画 |

不变量：提示状态只由当前步骤决定；系统开启“减少动态效果”时，动画退化为直接显示终态。

## 8. 课堂

| 中文 | 标识符 | 含义 |
|---|---|---|
| 课堂会话 | `ClassSession` | 课堂 ID、状态（进行中、已结束）、主讲人 |
| 参与者 | `Participant` | ID、昵称、角色（主讲、学习者） |
| 跟随模式 | `FollowMode` | 跟随主讲或自主浏览 |
| 测验 | `Quiz` | 题目、选项、正确答案、开放与关闭状态 |
| 作答 | `Answer` | 参与者对测验的一次作答，每人每题只计最后一次 |
| 练习 | `Exercise` | 题面、起始代码、校验用例 |
| 提交 | `Submission` | 代码与校验结果，标记典型错误 |
| 提问 | `Question` | 内容、提问者、挂载锚点、状态 |
| 理解度 | `PulseVote` | 参与者在某页的理解程度投票 |
| 笔记 | `Note` | 参与者的私有笔记，挂载到锚点 |

不变量：

- 只有主讲人能开放或关闭测验、结束课堂。
- 课堂结束后不再接受作答、提交与提问。
- 笔记只对作者可见。
- 统计只统计每位参与者的最后一次作答或投票。

服务：`session`（当前参与者、角色、课堂状态）、`classroomStore`（共享文档的读写）。

领域事件：`ParticipantJoined`、`QuizOpened`、`AnswerSubmitted`、`QuestionAsked`、`SessionEnded`。

## 9. 网页形态

| 中文 | 标识符 | 含义 |
|---|---|---|
| 网页文稿 | `WebDocument` | 文稿的网页形态，由若干网页章节组成 |
| 网页章节 | `WebSection` | 由一页幻灯片转换而来：标题、内容、正文（来自备注）、锚点、对应页号 |
| 网页页面 | `WebPage` | 一个 VitePress 页面，由一个 `src:` 引入的文件或一个章节组生成 |
| 排版方式 | `SectionLayout` | `document`（文档式，默认）或 `scrolly`（滚动叙事式） |
| 形态标记 | `FormMarker` | `slide-only` 或 `doc-only`，限定内容只出现在一种形态 |
| 降级规则 | `Downgrade` | Slidev 专有语法在网页中的处理：`v-click` 去除、布局插槽按顺序展开 |
| 形态映射 | `FormLink` | 页号与章节锚点的双向映射 |

不变量：

- 每一页幻灯片恰好对应一个网页章节，章节锚点稳定（来自页 ID 或标题），形态切换依赖此映射。
- 备注中的 `[click]` 标记在网页中切分为对应步骤的段落；文档式下按顺序全部显示。
- 网页搜索索引在构建时生成并随产物发布，离线可用。

## 10. 发布

| 中文 | 标识符 | 含义 |
|---|---|---|
| 导出任务 | `ExportJob` | 格式、范围、是否按步骤展开 |
| 离线清单 | `OfflineManifest` | 需要预缓存的资源 |
| 视觉差异 | `VisualDiff` | 两个提交在同一页同一步骤上的像素差异比例 |

不变量：视觉差异超过阈值的页必须列入报告。
