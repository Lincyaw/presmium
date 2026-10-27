# Presmium 可编辑文稿 IR 与运行快照

`lecture.json` 是唯一权威内容入口。它保存 Presmium 定义的可编辑教学文稿 IR；编译器派生用于阅读、放映、notebook 与讲授的运行快照。MyST 不是运行入口，不保留双格式兼容或双写。普通 Markdown 说明文件不属于教学文稿入口。

领域决策见 [文稿 IR RFC](rfc-document-ir.md)，精确类型在 [document.ts](../packages/kernel/src/contracts/document.ts)，JSON Schema 和共同校验器分别在 [document-schema.ts](../packages/kernel/src/document-schema.ts) 与 [document.ts](../packages/kernel/src/document.ts)。运行快照类型独立位于 [ir.ts](../packages/kernel/src/ir.ts)。代码契约是字段定义的唯一来源，本文说明边界与操作。

## 1. 管线

```text
lecture.json + 引用的代码与媒体
    │ JSON 语法、Schema、ID、引用、内容树、参数状态、媒体范围校验
    ▼
可编辑 TeachingDocument ──工作区版本事务──► git 历史
    │ 独立异步编译：状态解析、插件编译步骤、代码引用与执行、受众筛选、检查
    ▼
运行 IRDocument / snapshotId
    ├── web：预先打包的查看器与站点外壳
    ├── slides：同一查看器的放映画面
    ├── notebook：Jupyter .ipynb
    └── lecture 等插件渲染端
```

文档保存不等待编译成功。编译失败保留最后成功快照，明确其文稿版本与过期状态，不将它冒充当前内容。渲染端只消费运行快照；正文编辑器直接操作可编辑文稿 IR，不通过运行快照或 Markdown 中转。

## 2. 可编辑文稿

`TeachingDocument` 的实体映射为 `sections`、`blocks`、`steps`、`narrations`、`assets`、`definitions`；文稿还保存 `metadata`、`sectionOrder`、`production` 与可选批注数据。实体映射键必须等于实体 `id`，有序 ID 数组表示顺序。移动实体不改变身份；复制文稿产生新的文稿 ID，块与页面身份可以在新文稿命名空间内保留。

- 页面 `Section` 保存标题、标题层级、内容块顺序、步骤顺序和布局。每页至少一个步骤，页面不再从标题语法切分。
- 内容块为 `text`、`container`、`image`、`code`、`component`。内容所有权是一棵树，一个块只有一个父节点。跨处复用指向素材或定义，不把同一内容块挂在两处。
- 图片块没有 `assetId` 时表示尚未选图，可以正常保存。明确的引用仍须存在且为图片；空地址不是合法素材。未选图编译为带实体定位的警告和可读回退。
- 富文本保存有稳定身份的段落、标题、列表项、引用、代码、公式、表格及其行列。行内结构为带 marks 的文本、链接、公式、换行和版本化扩展。它不保存 Markdown 字符串，也不直接持久化 BlockNote 内部状态。
- 步骤保存独立的视觉状态与讲稿引用。可显式继承状态；构建时解析成完整状态，任意顺序定位都能重建画面。
- 讲稿由文字、发音替换和 cue 节点组成。字幕文字、合成文字、提示目标与字词对齐由同一结构派生。
  `renderers.lecture.script` 已移除；文稿与工作区配置中出现该字段会报错。外部 Markdown 文件不能覆盖步骤绑定的讲稿。
- 素材记录类型、位置与可选指纹；代码和大型媒体保持工程文件引用。组件定义记录实现引用、参数 Schema、公开状态与版本化插件数据；实例只保存自己的参数。
- `production` 唯一拥有讲授默认值、页面与步骤覆盖、cue 延迟及媒体片段。音色来源为静音、实际 TTS 音色或录音素材。绝对播放时刻与精确成片时长属于派生计划。

未知插件或扩展保留完整结构与可读回退，报告无法执行或编辑的能力。迁移的数字动画状态使用明确的 `legacyIndex`，不能猜测语义名称。旧语法的离线迁移脚本不被运行时导入。

## 3. 保存与校验

表格按包含跨行占位的逻辑网格校验列宽；`rowspan`、`colspan` 可以组合，单元格不能越过已声明的边界或与前行跨入的单元格重叠。

`validateDocument` 是 Web、agent、直接文件编辑与编译器共用的 Schema 和领域校验边界。检查格式版本、全局 ID、引用、内容所有权、步骤归属、参数与状态契约、媒体范围；诊断定位到实体和 JSON 字段路径。

工作区 `GET document` 返回可编辑内容与 `version`；`POST document/change` 使用 `baseDocumentVersion`，提交语义操作或完整 replacement。涉及的工程文件与文稿在一个工作区事务内保存并记录一次历史。已有文稿不允许悄悄改变文稿 ID，复制操作必须在创建副本前分配新身份。

回执绑定文稿、提交请求与输入版本。旧回执不能清除新草稿；版本冲突和保存失败保留输入。运行快照标识不作为文稿提交版本。工程文件的 SourceEditor 事务保留权限、路径与文件版本校验，不再承担 MyST 行范围写回。

`POST document/image` 用 multipart 提交 `DocumentImageImport` 与原图，原始文件和新增图片素材在同一次事务保存。支持 PNG、JPEG、GIF、WebP、SVG、BMP，限制及实际字节、版本和回滚验证见[图片导入记录](benchmarks/document-image-import-2026-10-27.md)。该接口检查格式头和尺寸，不承诺完整解码；正文块的绑定仍通过原生编辑器进入同一文稿保存边界。

## 4. 原生编辑

工作台在父 React 页面挂载一个全篇 BlockNote 编辑器，页面与正文属于同一原生选区和历史。通过公开 API 在 Presmium 富文本与编辑器模型间适配。批注使用原生 CommentsExtension，依据文稿 JSON 中的讨论实体与稳定正文锚点重建原生标记和位置。

文档编辑、编译放映和视频制作是独立入口。输入正文、添加页面、撤消、批注和保存不隐式切换到放映或字幕。编译预览不是作者编辑的 iframe；其协议只负责派生画面的定位、播放、诊断和 agent 焦点。

## 5. 运行快照与渲染

`IRDocument` 包含元数据、插件/渲染配置、章节与诊断。`IRSection` 带稳定页面身份与派生数字步号，以及对应的稳定 `stepIds`。`IRBlock` 的 `at`、`span` 与 `stepStates` 是运行时投影；`stepStates` 表达每一步的可见性、公开状态、参数与实现局部步号。它们不能回写为长期作者格式。

`IRDocument.source` 是编译器写入的 `CanonicalSource { documentId, version, fingerprint }`，指向本次实际读取的 `lecture.json`。`version` 是原始 UTF-8 内容的 SHA-256 前 20 位，与文稿保存版本一致；`fingerprint` 是同一内容的 FNV-1a 64 位摘要，均包含 BOM。它位于运行快照顶层，过滤视图仍保留，不能由作者 metadata 声明，也不替代运行快照的 revision。缺少来源标记的快照可供只读渲染，不能用于新的试听确认或配音生成。

`IRSection.stepNarrations` 按稳定步骤标识保存讲稿的显示文本与讲稿标识，保留同一步多条讲稿的顺序。它直接派生自文稿，朗读替换取显示文本、提示动作不混入字幕；网页过滤掉讲授节点后仍可按步骤显示字幕。该投影不含音频、逐字对齐或估算时码，不要求配置配音服务。真实已加载的时序字幕播放器通过宿主 `TIMED_CAPTIONS` 租约取得字幕显示权，释放后恢复按步骤字幕。

制作时间线读取公开的 `ProductionPlan`（`contracts/production.ts`）。`ProductionBinding { source, irRevision, planId }` 分别绑定已保存的 canonical 文稿、完整运行快照与不可变派生计划；`irRevision` 使用工作区确认的完整 revision，不重算过滤视图的哈希。`planId` 包含实际讲授轨、词时码、事件、字幕、时机与精确音频缓存键、字节摘要和时长，因此只补齐缓存或修正词时码也会产生新计划。`sameProductionBinding` 比较完整绑定。

计划按稳定页面、步骤与 Narration 标识给出范围；画面每步一段，跨步 cue 对应的同一音频与字幕各保留一段，并列出覆盖的 `stepIds`。所有时间使用同一讲授时钟的毫秒。`confirmed` 表示已确认，`estimated` 表示含缺配音的估时，`unknown` 不填未知的边界与总时长；只有完整确认的计划开放 `canPreview`、`canExport`。没有 Narration 的文稿可形成纯画面静音计划；有 Narration 时，显式 `voiceSource: { type: 'none' }` 使用实际动画、hold、pause 与 gap，不按文字推算时长。来源未选、尚不支持的 recording／视频片段、未声明的动画时长和没有确认时码的静音文字 cue 均保留诊断，不能冒充可播放计划。

`GET production-plan` 接收 `ProductionPlanQuery { source, irRevision }`，只查询缓存；`GET tracks/script?planId=…` 复用同一轨与绑定。Node 在读取前后检查实际源与 revision，并保留最近四份同源不可变计划供显式读取；旧计划不代表最新缓存状态。`GET production-media` 接收完整绑定与 `clipId`，只提供该计划白名单中的真实语音缓存或已检查的本地音频字节，核对服务授权与文件身份，支持范围读取，不接受任意文件路径。读取、播放与导出不隐式生成语音。

`production.mediaClips` 支持同文稿非隐藏常规音频文件。`sourceRange` 给出实际音频内的入点与出点，`attachment` 给出稳定步骤与步内偏移；片段必须完整处于已确认步骤时段，不自动跨步或改变 cue／hold。`volume` 为 0..1，独立的 `muted` 保留原音量。编译器将被引用的资产声明投影为 `productionAssets` 并跟踪文件，受众过滤同步排除相应片段与声明。`GET production-asset` 按 `ProductionAssetQuery { source, irRevision, assetId }` 返回实际时长、SHA-256、编码与声道信息；媒体段使用 `media` 表示这份检查结果，与语音缓存的 `audio` 分开。Node 有界读取并在媒体响应与发布时复核 SHA，Mediabunny 读取实际单音轨音频；预览和导出共用同一放置、裁切与混音计算。远程、共享路径、符号链接、视频和录音采用仍拒绝。当前上限与真实验证见[本地音频记录](benchmarks/production-audio-clips-2026-10-26.md)。

原始二进制导入、尚未引用资产的检查与显式 clip 提交使用独立的[作者事务接口](audio-authoring.md)，不向运行 IR 或媒体响应写回作者内容。

组件的资源映射 `assets` 使用参数的点分路径。插件可为 `stepStates` 派生该步自己的资源映射；链接检查包含这些资源，发布时同步改写该步参数中的地址，避免步骤参数覆盖已发布的 URL。内置媒体从实际 `src`、`poster`、`still` 与 `captions` 参数派生映射，并跟踪步骤专属文件；资源不存在时产生链接诊断。

普通阅读器的场景局部控制也从 `stepStates` 重建状态与参数：`StepScope.stateAt(localStep)` 与 `step(localStep)` 使用同一个首个可见作者快照。局部跳步和播放复用场景原有时钟，不改变全文导航或作者文稿。

定义的命名状态按 `Definition.states` 的声明顺序派生实现局部步号。新文稿只需状态标识；`legacyIndex` 仅在迁移已有实现且需要保留原索引时显式覆盖，不是新文稿的必填字段。

运行节点继续为 Markdown 派生树、代码和组件。富文本直接 lowering 成结构化渲染树，不生成 Markdown 再解析。组件由定义与实例参数 lowering，代码来源由锚点解析器读取真实工程文件。mdast、HAST 和运行组件 fallback 是渲染接口，不是旧 Markdown 内容入口。

网页是能力最完整的参考媒介；幻灯片复用同一查看器与宿主。其他渲染端声明支持程度：不能交互时提供静态回退，无法表示的节点出现在构建诊断中。CSS 样式字符串经公开解析库转为 React style 对象，服务端渲染不依赖 DOM；非法样式保留正文并给出诊断。

代码执行保留具名环境、会话、缓存与富输出契约。合成预览只读取精确脚本与音色的已完成缓存，缺失时报告未生成；打开文稿、保存正文或编译预览不隐式调用付费合成。

## 6. 工作区与命令

工作区配置仍是 `presmium.workspace.yaml`，文稿模式只匹配 `lecture.json`，通常为 `documents: ['*/lecture.json']`。只有该入口的目录也可作为单文稿工作区。配置中的运营者设置与凭据不属于作者 metadata。

```sh
presmium new lesson --type lecture
presmium dev lesson
presmium check lesson --json
presmium build lesson --to web
presmium ir lesson --out runtime-snapshot.json
presmium serve .
presmium studio .
```

字段、命令参数与插件能力以安装版本的公开契约和 `presmium --help` 为准。验证按根 AGENTS 的定向策略运行真实文稿、服务与浏览器；不将旧 MyST 测试改写成兼容运行路径。
