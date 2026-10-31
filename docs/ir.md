# Presmium 文稿 IR 与运行快照

`lecture.json` 是唯一的内容入口，保存可编辑的教学文稿 IR（`TeachingDocument`）。`@lincyaw/compiler` 从它派生运行快照（`IRDocument`），供阅读、放映、notebook 与讲授使用。

字段以代码为准，本文只写边界与规则：

- 文稿实体与编辑操作：`packages/kernel/src/contracts/document.ts`
- Schema 与校验器 `validateDocument`：`packages/kernel/src/document-schema.ts`、`document.ts`
- 运行快照、编译步骤、渲染端：`packages/kernel/src/ir.ts`
- 讲授计划：`packages/kernel/src/contracts/production.ts`、`production-assets.ts`

作者动作见 [authoring-actions.md](authoring-actions.md)，编辑界面见 [studio.md](studio.md)，管线与插件契约见 [architecture.md](architecture.md)。

## 1. 管线

```text
lecture.json + 引用的代码与媒体
    │ validateDocument
    ▼
TeachingDocument ──工作区事务──► git 历史
    │ 异步编译：lowering、步骤状态、插件编译步骤、代码引用与执行、受众筛选、检查
    ▼
IRDocument ──► web · slides（同一查看器）· notebook · lecture 等插件渲染端
```

- 保存不等待编译。编译失败保留上次成功的快照并标明其文稿版本，不冒充当前内容。
- 渲染端只读运行快照；编辑器直接操作文稿 IR，不经快照或 Markdown 中转。
- 快照中的数字步号、`at`、`span`、发布地址与播放时刻不回写为作者格式。

## 2. 可编辑文稿

### 2.1 顶层结构

`TeachingDocument` 有 `schemaVersion`、`id`、`metadata`、`sectionOrder`，实体映射 `sections`、`blocks`、`steps`、`narrations`、`assets`、`definitions`，讲授编排 `production` 与可选的批注 `comments`。`metadata` 保存标题、`lang`、插件、插件与渲染端配置、`execute`、检查配置与译文登记；运营者设置与凭据不在其中。

### 2.2 身份与引用

- 映射的键等于实体 `id`；顺序只由有序 ID 数组表示。移动不改变身份。
- 实体、富文本节点、cue、媒体片段与批注的 ID 在文稿内唯一。`page:<Section ID>` 保留给现存页面的标题锚点（`id.reserved`）。
- 复制文稿分配新文稿 ID。复制页面为页内实体分配新 ID 并重映射页内引用；定义、素材与页外引用不变，批注不随页复制。
- 删除不能让旧绑定静默接到别的对象。

### 2.3 页面

`Section` 保存标题、层级、`children`、`stepOrder`、`layout`（`stack`、`columns`、`canvas`、`scrolly`，可带渲染端提示）、可选的受众与插件配置。每页至少一个步骤。

### 2.4 内容块

`DocumentBlock` 是 `text`、`container`、`image`、`code`、`component` 之一，可带媒介限定 `only` 与受众 `audience`。

- 内容所有权是一棵树：一个块只有一个父节点，不成环。跨处复用靠素材或定义。
- `image` 没有 `assetId` 表示尚未选图，可以保存，编译给出警告与回退；写出的 `assetId` 必须指向图片素材。
- `code` 保存内联 `value` 或工程文件引用 `origin`，可带 `execution`、按步骤的高亮与 `variants`。
- `component` 引用定义，保存自己的参数，可以有子块。

### 2.5 富文本

`RichTextNode` 是段落、标题、列表、引用、代码、公式、表格与扩展，实际编辑单元（段落、列表项、表格行与单元格）有稳定 ID；行内 `InlineNode` 是带 marks 的文字、链接、公式、换行与扩展。不保存 Markdown 字符串，不持久化编辑器私有状态。表格按逻辑网格校验 `rowspan`、`colspan`，单元格不越界、不重叠。

### 2.6 步骤

`Step` 保存所属页面、画面 `visuals`（每块的可见性、命名状态、参数）、`narrationIds`，可用 `inherits` 继承另一步。未列出的块不可见。编译把继承解析成每步的完整状态，任意定位都能重建画面。顺序在 `stepOrder`，时机在 `production`。

### 2.7 讲稿

`Narration.content` 由 `text`、`pronunciation { display, spoken }`、`cue { action, target?, parameters? }` 组成。字幕、合成文字、提示目标与字词对齐都从它派生：字幕取 `display` 且不含 cue，合成取 `spoken`。讲稿只经步骤绑定，外部文件不能覆盖；`renderers.lecture.script` 出现即报错。转写只有显式采用才改写讲稿，来源记在 `provenance`。

### 2.8 行内扩展与角色

扩展节点带 `kind`、`schemaVersion`、`data` 与可读 `fallback`。lowering 时 `presmium.mdast` 扩展还原为 mdast 节点，其余成为 `presmiumExtension`；讲稿的 `pronunciation`、`cue` 成为 `presmium.lecture` 的行内角色 `say`、`cue`（`PresmiumRoleNode`）。插件用 `RoleSpec.children` 给出角色在正文中的内容。

### 2.9 素材

`Asset` 记录 `kind`（`image`、`audio`、`video`、`file`）、`location`、可选的标题、指纹与媒体类型。代码与大型媒体是工程文件引用，不嵌入 JSON；空地址不是合法素材。

### 2.10 定义与组件实例

`Definition` 记录 `kind`、`schemaVersion`、实现引用（`file`、`module`、`plugin`）、参数 Schema、公开状态 `states` 与插件数据 `data`。实例只存自己的参数；改定义影响全部引用。命名状态按声明顺序派生局部步号，`legacyIndex` 只在迁移时显式保留原数字索引。组件升级移除状态或改变参数契约时产生绑定诊断。

### 2.11 讲授编排

`Production` 是作者时序的唯一来源：

| 字段 | 内容 |
|---|---|
| `defaults`、`sectionOverrides`、`stepOverrides` | 讲稿开始时机、最短停留、尾部停顿、音色来源，后者优先 |
| `narrationOverrides` | 迁移保留的讲稿开始时机，位于页面与步骤之间 |
| `cueTimings` | cue 的停顿时长 |
| `captionTimings` | 作者设定的本步字幕时间（2.12） |
| `mediaClips` | 挂在步骤上的音频片段 |

- `VoiceSource` 是 `none`、`tts` 或 `recording`（可选 `sourceRange`）。
- 讲授顺序从 `sectionOrder` 与 `stepOrder` 派生，不另存；绝对时刻与精确时长属于讲授计划（第 6 节）。
- `MediaClip` 引用同文稿的本地音频，`sourceRange` 是文件内入点与出点，`attachment` 是步骤加步内偏移，必须完整落在已确认的步骤时段内；`volume` 为 0 到 1，`muted` 独立于音量。

### 2.12 字幕时间

`CaptionTiming` 有有序 `narrationIds`、两个指纹、本步 `durationMs` 与最多 32 段 `{ id, from, to, startMs, endMs }`。`from`、`to` 是本步讲稿显示文字以换行连接后的 UTF-16 范围，连续覆盖全文，端点在 grapheme 边界；时间是相对本步起点的毫秒，不重叠，不跨步。`sourceFingerprint` 覆盖讲稿、音色与本步设置，`playbackFingerprint` 覆盖实际音频、事件与确认时长；不符时报告 `production.caption-timing-stale`，映射保留但不使用。

### 2.13 译文

译文是完整的 `lecture.json`，放在 `locales/<语言>/`。原文在 `metadata.translations` 登记路径，译文在 `metadata.translationOf` 登记原文路径与摘要。译文按自己的目录编译，不继承原文的插件与实现路径。摘要取规范化的原文 JSON（忽略键序、空白、BOM 与两项登记），内容变了报告过期。

### 2.14 组件资源

组件参数中的本地文件经 `ComponentNode.assets` 声明，键是参数的点分路径（如 `files.a`、`captions.en`）；插件也可为每步的 `stepStates` 给出映射。链接检查覆盖这些文件，发布时改写对应参数中的地址。内置媒体从 `src`、`poster`、`still`、`captions` 派生映射。

### 2.15 批注

`comments` 保存 `DocumentThread`，锚点是两个 `DocumentTextPoint { blockId, offset }`，`blockId` 是富文本或代码的稳定 ID，或 `page:<Section ID>`。

### 2.16 未知数据与迁移

未知插件、扩展与插件数据完整保留，用回退显示，并报告无法执行或编辑的能力。迁移只保留明确的映射，不把序号猜成语义名；迁移脚本不被运行时导入。

## 3. 保存与校验

`validateDocument` 是 Web、agent、直接改文件与编译器共用的边界，检查格式版本、ID、引用、内容所有权、步骤归属、参数与状态、媒体范围；诊断 `DocumentIssue` 定位到 JSON 路径。

一次提交依次经过：版本检查（`baseDocumentVersion`）、语法与 Schema、领域约束、一个工作区事务内的原子保存与一次历史、异步编译。

- `GET document` 返回内容与 `version`；`POST document/change` 提交 `DocumentEditOperation` 或完整替换。
- 回执绑定文稿、请求与输入版本；旧回执不清除新草稿，冲突与失败保留输入。
- 单用户工作区靠版本检查与事务，不用 CRDT。

## 4. 编辑

工作台用一个全篇 BlockNote 编辑器直接编辑文稿 IR，经公开 API 转换富文本；批注用 CommentsExtension，按 `comments` 重建。编译预览是独立入口。见 [studio.md](studio.md)。

## 5. 运行快照

### 5.1 结构

`IRDocument` 有 `ir`、`source`、`meta`、`config`、`sections`、诊断、`production` 与 `productionAssets`（被引用素材的声明，随受众筛选）。`IRSection` 有页面 ID、序号、标题、深度、`steps`（`stepOrder` 长度减一）、`stepIds` 与块。`IRBlock` 有 `role`（`visual`、`narration`）、`at`、`span`、`only`、`audience`、JSON pointer 源位置与节点。

### 5.2 来源标记

`IRDocument.source` 是 `CanonicalSource { documentId, version, fingerprint }`，指向本次读取的 `lecture.json`。`version` 是原始字节（含 BOM）SHA-256 的前 20 位，等于文稿保存版本；`fingerprint` 是同一字节的 FNV-1a 64 位摘要。作者不能声明它，它不替代快照的 revision。没有它的快照只能只读渲染，不能用于试听确认或配音生成。

### 5.3 步骤状态

`IRBlock.stepStates` 给出每步的可见性、命名状态、参数、资源映射与局部步号 `localStep`。阅读器的场景局部控制（`StepScope.stateAt`、`step`）从它重建，不改变全文导航。

### 5.4 讲稿投影

- `IRSection.stepNarrations` 按步骤给出讲稿的显示文字与 ID，不含音频与时码；网页按它显示步骤字幕。
- `IRSection.captionSources` 是每步字幕依据的指纹，与文稿版本和前面的步骤无关。
- 讲稿块 `role: 'narration'`、`only: ['lecture']`。
- 时序字幕播放器经宿主的 `TIMED_CAPTIONS` 租约取得字幕显示权。

### 5.5 节点与渲染

`IRNode` 是 `markdown`（mdast）、`code`、`component`。富文本直接 lowering 为 mdast；组件由定义与参数 lowering 为 `ComponentNode`；代码引用由锚点解析器读取工程文件得到 `CodeOrigin`。网页是能力最完整的参考媒介；其他渲染端按 `Support` 声明支持程度，不能交互时给静态回退，无法表示的节点进入构建诊断。

### 5.6 执行与语音缓存

代码执行保留具名环境、会话、缓存与富输出（`RunSpec`、`RecordedRun`）。合成只读精确脚本与音色的已完成缓存，缺失时报告未生成；打开、保存与编译都不调用付费合成。

## 6. 讲授计划

`addon-lecture` 从快照派生不可变的 `ProductionPlan`：

- 绑定 `ProductionBinding { source, irRevision, planId }`。`planId` 覆盖讲授轨、词时码、事件、字幕、时机与音频的缓存键、摘要和时长，只补缓存也得到新计划。
- 页面、步骤、讲稿按稳定 ID 给出范围，时间是同一讲授时钟的毫秒。跨步 cue 的音频与字幕各一段，列出覆盖的 `stepIds`。
- `timing` 为 `confirmed`、`estimated`、`unknown`；只有完整确认的计划 `canPreview`、`canExport`。`voiceSource: none` 用实际动画、停留与停顿，不按字数估时。
- 合成语音是 `audio`，导入音频是 `media`（`ProductionAssetInspection`）。预览与导出共用同一放置、裁切与混音计算。

`GET production-plan`（`ProductionPlanQuery`）、`GET tracks/script`（`planId`）、`GET production-media`（绑定加 `clipId`，只给计划白名单中的字节）、`GET production-asset`（`ProductionAssetQuery`）都只读缓存，不生成语音。

## 7. 工作区与命令

工作区配置是 `presmium.workspace.yaml`，文稿模式只匹配 `lecture.json`，通常为 `documents: ['*/lecture.json']`；只有一份 `lecture.json` 的目录也是工作区。

```sh
presmium new lesson --type lecture
presmium dev lesson
presmium check lesson --json
presmium build lesson --to web
presmium ir lesson --out runtime-snapshot.json
presmium serve .
```
