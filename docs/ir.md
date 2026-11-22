# Presmium 文稿 IR 与运行快照

每份文稿是一个文件夹中的 `index.pmd`（内容是 JSON），它是唯一的内容入口，保存可编辑的文稿 IR（`PresmiumDocument`）。`@lincyaw/compiler` 从它派生运行快照（`IRDocument`），供阅读、放映、notebook 与讲授使用。

字段以代码为准，本文只写边界与规则：

- 文稿实体与编辑操作：`packages/kernel/src/contracts/document.ts`
- Schema 与校验器 `validateDocument`：`packages/kernel/src/document-schema.ts`、`document.ts`
- 继承的设置与文稿树：`packages/kernel/src/document-settings.ts`、`document-tree.ts`；按工作区解析：`packages/compiler/src/document-tree.ts`
- 格式升级：`packages/compiler/src/migrate.ts`（`@lincyaw/compiler/migrate`）
- 运行快照、编译步骤、渲染端：`packages/kernel/src/ir.ts`
- 讲授计划：`packages/kernel/src/contracts/production.ts`、`production-assets.ts`

作者动作见 [authoring-actions.md](authoring-actions.md)，编辑界面见 [studio.md](studio.md)，管线与插件契约见 [architecture.md](architecture.md)。

## 1. 管线

```text
index.pmd + 引用的代码与媒体
    │ validateDocument
    ▼
PresmiumDocument ──工作区事务──► 本地编辑历史
    │ 异步编译：lowering、步骤状态、插件编译步骤、代码引用与执行、受众筛选、检查
    ▼
IRDocument ──► web · slides（同一查看器）· notebook · lecture 等插件渲染端
```

- 保存不等待编译。编译失败保留上次成功的快照并标明其文稿版本，不冒充当前内容。
- 渲染端只读运行快照；编辑器直接操作文稿 IR，不经快照或 Markdown 中转。
- 快照中的数字步号、`at`、`span`、发布地址与播放时刻不回写为作者格式。

## 2. 可编辑文稿

### 2.1 顶层结构

`PresmiumDocument` 有 `schemaVersion`（当前为 2，`DOCUMENT_SCHEMA_VERSION`）、`id`、`placement`、`metadata`、`sectionOrder`，实体映射 `sections`、`blocks`、`steps`、`narrations`、`assets`、`definitions`，讲授编排 `production` 与可选的批注 `comments`。`metadata` 保存标题、可选的 `lang`、插件、插件与渲染端配置、`execute`、检查配置与译文登记；运营者设置与凭据不在其中。

### 2.1.1 文稿树

`placement: { parent, rank }` 是文稿在工作区文稿树中的位置：`parent` 是上级文稿的 `id`，`null` 为顶层；`rank` 是同级之间的分数索引（`fractional-indexing`），按字符串升序排列。树不另存文件，由工作区扫描全部文稿的 `placement` 得出（第 7 节）。

- 移动只改被移动文稿的 `placement`（新的 `parent` 与新邻居之间的 `rank`），文件夹不动，素材与代码引用的路径因此不变。
- 无效位置是诊断而不是失败：未知的 `parent` 显示在顶层并警告；成环的文稿都显示在顶层并报错；`rank` 相同按 `id` 排序；`parent` 不能是自己（`placement.self`）。
- 文稿 `id` 在工作区内唯一，重复时报错并给出两份文稿的路径；跨文稿的目标一律用 `id`，不用路径。
- 译文（`locales/<语言>/index.pmd`）不是树的节点，跟随原文。

### 2.1.2 继承的设置

文稿只保存自己设置的值，没有设置的从上级继承；继承链是工作区 `defaults:` → 顶层祖先 → … → 上级 → 本文稿，越近越优先：

| 字段 | 合并 |
|---|---|
| `metadata.lang` | 最近的值（默认 `zh-CN`） |
| `metadata.plugins` | 最近的整个列表 |
| `metadata.presmium`、`metadata.renderers` | 按插件或渲染端 ID，对象深合并，每个叶子取最近的值 |
| `metadata.execute`、`metadata.checks` | 深合并，每个叶子取最近的值 |
| `production.defaults` | 按字段取最近的值 |
| `production.captions` | 最近的值 |

标题、说明、标签与译文登记不继承。纯函数 `effectiveSettings(chain, defaults)` 给出生效的设置，`withEffectiveSettings(document, ancestors, defaults)` 给出填好继承值的文稿（`EffectiveDocument`），只用于判断，从不保存。凡按语言、插件、渲染端与插件配置、执行、检查或讲授默认值做决定的地方，都读生效的文稿：编译器、`presmium build`、`dev`、`check`、`voiceover`、`script`、工作区服务（文稿列表、作者动作、媒体与配音）、MCP 与语言服务。`@lincyaw/compiler` 的 `effectiveDocument(入口, 文稿)` 与 `effectiveDocumentIn(工作区, 入口, 文稿)` 向上找到工作区、按 `placement.parent` 与工作区扫描解析祖先链；不在任何工作区中的文稿没有祖先。`GET document` 的回答另带 `settings`（生效的设置）、`inherited`（从祖先与 `defaults:` 继承的部分）与 `inheritedFrom`（`settingOrigins` 给出的每项继承设置来自哪一级：设定它的最近一级祖先的 `id`，工作区 `defaults:` 为 `null`；键为 `lang`、`plugins`、`presmium.<插件>`、`renderers.<渲染端>`、`execute`、`checks`、`production.defaults.<字段>`、`production.captions`，深合并的项取设定了其中任一叶子的最近一级）；工作台用 `withInheritedSettings` 把它填进正在编辑的文稿，内容语言、图表插件、配音与讲授默认值都按生效的值判断。手工字幕的指纹按保存的文稿计算，不受继承影响。

### 2.2 身份与引用

- 映射的键等于实体 `id`；顺序只由有序 ID 数组表示。移动不改变身份。
- 实体、富文本节点、cue、媒体片段与批注的 ID 在文稿内唯一。`page:<Section ID>` 保留给现存页面的标题锚点（`id.reserved`）。
- 复制文稿分配新文稿 ID。复制页面为页内实体分配新 ID 并重映射页内引用；定义、素材与页外引用不变，批注不随页复制。
- 删除不能让旧绑定静默接到别的对象。

### 2.3 页面

`Section` 保存标题、层级、`children`、`stepOrder`、`layout`（`stack`、`columns`、`canvas`、`scrolly`，可带渲染端提示）、可选的受众与插件配置。每页至少一个步骤。第一页的标题与文稿标题（`metadata.title`）相同时，改第一页的标题（在正文中输入，或重命名页面）也改文稿标题：新文稿的第一页标题就是文稿标题，作者输入第一个大标题即为文稿命名。两者不同后（例如在文稿树中重命名了文稿）各自独立，`followFirstPageTitle` 给出这条规则。

### 2.4 内容块

`DocumentBlock` 是 `text`、`container`、`image`、`code`、`component`、`embed` 之一，可带媒介限定 `only` 与受众 `audience`。

- 内容所有权是一棵树：一个块只有一个父节点，不成环。跨处复用靠素材或定义。
- `image` 没有 `assetId` 表示尚未选图，可以保存，编译给出警告与回退；写出的 `assetId` 必须指向图片素材。
- `code` 保存内联 `value` 或工程文件引用 `origin`，可带 `execution`、按步骤的高亮与 `variants`。
- `component` 引用定义，保存自己的参数，可以有子块。
- `embed` 是同步块 `{ source: { document, block } }`：显示源文稿中那个块及其全部内容的当前样子，自己没有内容与子块，内容只在源文稿中编辑。凡能放块的地方都能放它。步骤留在本地：本文稿步骤中它的 `VisualState` 控制显示，`state` 与 `parameters` 指向源块（组件）声明的状态与参数，因此校验不要求它是组件。同一文稿内，源块缺失是警告 `embed.missing`，显示自己或包含自己的块是错误 `embed.cycle`；跨文稿的源由编译解析（5.5 节），不在校验之内。“转为副本”把同步块换成源内容的深拷贝（新的块 ID，需要的素材文件复制进本文稿文件夹，定义复制或在内容相同时复用；同步块自己的 `only`、`audience` 留给副本，其下的块在同步块显示的步骤中以源中的最终状态显示），见[作者动作](authoring-actions.md)第 15 节。

### 2.5 富文本

`RichTextNode` 是段落、标题、列表、引用、代码、公式、表格与扩展，实际编辑单元（段落、列表项、表格行与单元格）有稳定 ID；行内 `InlineNode` 是带 marks 的文字、链接、公式、换行、引用与扩展。引用 `{ type: 'reference', target: { document, section?, block? }, label?, fallback }` 按 ID 指向一份文稿、它的一页或一个块（`target.document` 可以是本文稿）；显示 `label`，没有时显示目标当前的标题，目标不存在时显示 `fallback`（最近一次知道的标题）。同一文稿内找不到的页面或块是警告 `reference.missing`。块的标题是它的第一段文字，没有时是图片的替代文字、代码的标题、组件的 `title` 或 `alt` 参数、容器的标题。工作区在被引用的标题变化后把引用处的 `fallback` 改成当前标题，每份文稿一条自动修订（作者 Presmium，提交带 `Presmium-Automatic: reference-titles`）；标题停止变化约两秒后才写，只读取引用了变化标题的文稿，输入标题时不会逐字记录。编译见 5.5 节。不保存 Markdown 字符串，不持久化编辑器私有状态。表格按逻辑网格校验 `rowspan`、`colspan`，单元格不越界、不重叠。

### 2.6 步骤

`Step` 保存所属页面、画面 `visuals`（每块的可见性、命名状态、参数）、`narrationIds`，可用 `inherits` 继承另一步。未列出的块不可见。编译把继承解析成每步的完整状态，任意定位都能重建画面。顺序在 `stepOrder`，时机在 `production`。

### 2.7 讲稿

`Narration.content` 由 `text`、`pronunciation { display, spoken }`、`cue { action, target?, parameters? }` 组成。字幕、合成文字、提示目标与字词对齐都从它派生：字幕取 `display` 且不含 cue，合成取 `spoken`。讲稿只经步骤绑定，外部文件不能覆盖；`renderers.lecture.script` 出现即报错。转写只有显式采用才改写讲稿，来源记在 `provenance`。

### 2.8 行内扩展与角色

扩展节点带 `kind`、`schemaVersion`、`data` 与可读 `fallback`。lowering 时 `presmium.mdast` 扩展还原为 mdast 节点，其余成为 `presmiumExtension`；讲稿的 `pronunciation`、`cue` 成为 `presmium.lecture` 的行内角色 `say`、`cue`（`PresmiumRoleNode`）。角色节点携带显示文字，渲染端与讲授插件直接消费结构化节点。

### 2.9 素材

`Asset` 记录 `kind`（`image`、`audio`、`video`、`file`）、`location`、可选的标题、指纹与媒体类型。代码与大型媒体是工程文件引用，不嵌入 JSON；空地址不是合法素材。

### 2.10 定义与组件实例

`Definition` 记录 `kind`、`schemaVersion`、实现引用（`file`、`module`、`plugin`）、参数 Schema、公开状态 `states` 与插件数据 `data`。实例只存自己的参数；改定义影响全部引用。命名状态按声明顺序派生局部步号，`legacyIndex` 只在迁移时显式保留原数字索引。组件升级移除状态或改变参数契约时产生绑定诊断。文件实现的运行节点保留 `definition.kind`，由插件编译步骤转换对应的定义种类；动画场景的路径、组件选择与步骤参数由动画插件处理。

### 2.11 讲授编排

`Production` 是作者时序的唯一来源：

| 字段 | 内容 |
|---|---|
| `defaults`、`sectionOverrides`、`stepOverrides` | 讲稿开始时机、最短停留、尾部停顿、音色来源，后者优先 |
| `narrationOverrides` | 迁移保留的讲稿开始时机，位于页面与步骤之间 |
| `cueTimings` | cue 的停顿时长 |
| `captionTimings` | 作者设定的本步字幕时间（2.12） |
| `captions` | 整个文稿的字幕大小 `{ scale }`：默认大小的倍数，0.7 到 1.6（Studio 以 0.1 为一档），缺省为 1；放映中显示的字幕与导出视频中烧录的字幕都按它缩放（页面上的 `--pm-caption-scale`） |
| `mediaClips` | 挂在步骤上的音频片段 |

- `VoiceSource` 是 `none`、`tts` 或 `recording`（可选 `sourceRange`）。
- 讲授顺序从 `sectionOrder` 与 `stepOrder` 派生，不另存；绝对时刻与精确时长属于讲授计划（第 6 节）。
- `MediaClip` 引用同文稿的本地音频，`sourceRange` 是文件内入点与出点，`attachment` 是步骤加步内偏移，必须完整落在已确认的步骤时段内；`volume` 为 0 到 1，`muted` 独立于音量。

### 2.12 字幕时间

`CaptionTiming` 有有序 `narrationIds`、两个指纹、本步 `durationMs` 与最多 32 段 `{ id, from, to, startMs, endMs }`。`from`、`to` 是本步讲稿显示文字以换行连接后的 UTF-16 范围，连续覆盖全文，端点在 grapheme 边界；时间是相对本步起点的毫秒，不重叠，不跨步。`sourceFingerprint` 覆盖讲稿、音色与本步设置，`playbackFingerprint` 覆盖实际音频、事件与确认时长；不符时报告 `production.caption-timing-stale`，映射保留但不使用。

`StepProduction.captionVisible` 控制字幕显示，按 `defaults` → `sectionOverrides` → `stepOverrides` 继承，默认 `true`。设为 `false` 保留讲稿、配音、词时码、音频及步骤时长，只在该步骤的实际播放区间隐藏字幕；预览、播放、烧录、各语言 VTT 和制作计划的字幕轨共用此投影，无时码幻灯片兜底也遵循该开关。跨步讲稿按实际步骤边界裁切显示区间。该开关不进入手工字幕的内容指纹，恢复显示可复用仍然有效的原映射。

### 2.13 译文

译文是完整的 `index.pmd`，放在 `locales/<语言>/`。原文在 `metadata.translations` 登记路径，译文在 `metadata.translationOf` 登记原文路径与摘要。译文按自己的目录编译，不继承原文的插件与实现路径；没有设置的值从原文的祖先与工作区 `defaults:` 继承（2.1.2 节）。摘要取规范化的原文 JSON（忽略键序、空白、BOM、两项登记与 `placement`），内容变了报告过期。

### 2.14 组件资源

组件参数中的本地文件经 `ComponentNode.assets` 声明，键是参数的点分路径（如 `files.a`、`captions.en`）；插件也可为每步的 `stepStates` 给出映射。链接检查覆盖这些文件，发布时改写对应参数中的地址。内置媒体从 `src`、`poster`、`still`、`captions` 派生映射。

### 2.15 批注

`comments` 保存 `DocumentThread`。锚点有两种：文本范围的两个 `DocumentTextPoint { blockId, offset }`（`blockId` 是富文本或代码的稳定 ID，或 `page:<Section ID>`），或位置 `{ blockId, stepId }`（块在该步的呈现；省略 `stepId` 表示整块）。位置的步骤必须属于块所在的 section。块还在而步骤不在时，锚点降为 `{ blockId }`；块也不在时线程保留内容并变为无锚点。

### 2.16 未知数据与迁移

未知插件、扩展与插件数据完整保留，用回退显示，并报告无法执行或编辑的能力。迁移只保留明确的映射，不把序号猜成语义名；迁移代码不被运行时导入。

### 2.17 格式版本与升级

运行时只接受当前格式。`validateDocument` 对旧版本（`schemaVersion: 1`）只报一项错误 `document.schema-upgrade`（`DOCUMENT_UPGRADE_CODE`），提示运行 `presmium migrate` 或在 Studio 中升级；运行时不读 `lecture.json`。

`presmium migrate [<工作区或文稿目录>] [--check]` 与 `POST workspace/migrate`（Studio 首页的“升级 / Upgrade”）共用 `@lincyaw/compiler/migrate`：

- 每份旧文稿的 `lecture.json` 重命名为 `index.pmd`（命令行在 git 仓库中用 `git mv`），译文一同重命名；`schemaVersion` 改为 2，在 `id` 之后加 `placement`：`parent` 为 `null`，`rank` 按旧 `presmium.workspace.yaml` 中 `documents:` 的顺序，其余按路径，排在已有顶层文稿之后；译文取原文的 `rank`。
- 文稿自己的设置原样保留，不搬进继承。指向 `lecture.json` 的路径改写为 `index.pmd`：`metadata.translations`、`translationOf.entry`、链接、工作区文件中的值；原文摘要不计 `placement`，原本有效的译文摘要随之更新。
- 从 `presmium.workspace.yaml` 删除 `documents:`，按解析出的位置改文本，其余内容与注释不变。
- 可以重复运行，已升级的文稿不再改动；`--check` 只报告，需要升级时退出码为 1。Studio 的升级为每份文稿记一次修订，工作区文件另记一次。

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

`IRDocument.source` 是 `CanonicalSource { documentId, version, fingerprint }`，指向本次读取的 `index.pmd`。`version` 是原始字节（含 BOM）SHA-256 的前 20 位，等于文稿保存版本；`fingerprint` 是同一字节的 FNV-1a 64 位摘要。作者不能声明它，它不替代快照的 revision。没有它的快照只能只读渲染，不能用于试听确认或配音生成。

### 5.3 步骤状态

`IRBlock.stepStates` 给出每步的可见性、命名状态、参数、资源映射与局部步号 `localStep`。阅读器的场景局部控制（`StepScope.stateAt`、`step`）从它重建，不改变全文导航。

### 5.4 讲稿投影

- `IRSection.stepNarrations` 按步骤给出讲稿的显示文字与 ID，不含音频与时码；网页按它显示步骤字幕。
- `IRSection.captionSources` 是每步字幕依据的指纹，与文稿版本和前面的步骤无关。
- 讲稿块 `role: 'narration'`、`only: ['lecture']`。
- 时序字幕播放器经宿主的 `TIMED_CAPTIONS` 租约取得字幕显示权。

### 5.5 节点与渲染

`IRNode` 是 `markdown`（mdast）、`code`、`component`。富文本直接 lowering 为 mdast；组件由定义与参数 lowering 为 `ComponentNode`；代码引用由锚点解析器读取工程文件得到 `CodeOrigin`。网页是能力最完整的参考媒介；其他渲染端按 `Support` 声明支持程度，不能交互时给静态回退，无法表示的节点进入构建诊断。

引用与同步块在 lowering 时按工作区解析（`@lincyaw/compiler` 的 `workspaceLinks`：工作区扫描按 ID 找文稿，`.trash/<id>/` 中的文稿算在回收站中）：

- 引用 lowering 为带 `data.presmiumReference` 的 mdast 链接，文字是 `label`、目标当前的标题或 `fallback`。指向本文稿时链接到那一页（`#<页面 ID>`）；指向其他文稿时链接到它的 `index.pmd` 加 `#<块或页面 ID>`，网站把它换成那份文稿的页面地址与锚点。`viewFor` 在网页以外的媒介（幻灯片、notebook、讲授与视频、单文稿导出）把这些链接换成文字，不加脚注。目标文稿不存在或在回收站中、页面或块不存在时写 `fallback` 的文字，并报警告 `reference.missing`。
- 同步块按源文稿自己的上下文 lowering 源块与其下全部块：源文稿的生效设置、定义，素材与组件文件相对源文稿的文件夹解析（运行块的源位置指向源文稿）。它的运行块 ID 是同步块自己的 ID，其下的块为 `<同步块 ID>~<源块 ID>`，嵌套时逐层加前缀。本文稿步骤中同步块的 `VisualState` 决定源块的显示，`state` 与 `parameters` 作用于源块（组件）如同本地实例；没有给状态时用源块在源文稿中最后一次显示时的状态，其下的块在同步块显示时以各自在源中的最终状态显示。讲稿从不带过来。源文稿被编译监视，改了就重新编译。源文稿或源块不存在是错误 `embed.missing`，同步块经由同步块又显示自己是错误 `embed.cycle`，嵌套超过 4 层是错误 `embed.depth`，三者都在原处显示说明；源文稿在回收站中时照常显示并警告 `embed.source-trashed`。同步块中由插件提供的组件（定义的 `data.plugin` 或插件实现）需要的插件，本文稿没有列出时，编译从源文稿（含继承）的插件中找到提供它的那个，只在这次编译中加载，并列入运行快照的 `config.plugins`，不写进文稿；找不到时报错误 `embed.plugin-missing`。动画场景按源文稿中的文件显示，场景名是从本文稿文件夹到该文件的相对路径（如 `../bubble-sort/scenes/bubble`）。

### 5.6 执行与语音缓存

代码执行保留具名环境、会话、缓存与富输出（`RunSpec`、`RecordedRun`）。合成只读精确脚本与音色的已完成缓存，缺失时报告未生成；打开、保存与编译都不调用付费合成。

## 6. 讲授计划

`addon-lecture` 从快照派生不可变的 `ProductionPlan`：

- 绑定 `ProductionBinding { source, irRevision, planId }`。`planId` 覆盖讲授轨、词时码、事件、字幕、时机与音频的缓存键、摘要和时长，只补缓存也得到新计划。
- 页面、步骤、讲稿按稳定 ID 给出范围，时间是同一讲授时钟的毫秒。跨步 cue 的音频与字幕各一段，列出覆盖的 `stepIds`。
- 有真实词时码且显示文字能逐词对上时，一句的字幕分成可读的组，网页播放、VTT 与烧录字幕共用：句末结束一组；一组最多 42 个字符，下一个词会使它超出时，在组内最后一个分句标点处结束（这部分至少约 12 个字符，否则在超出前的词后结束）；组从不在半角词（数字、标识符、网址）内部断开。句末与分句的标点与烧录字幕的切分相同（`design-system.md`）：全角标点在哪里都算，半角的 `. ! ? ;` 与 `, :` 后面是空格或全文结尾时才算。
- `timing` 为 `confirmed`、`estimated`、`unknown`；只有完整确认的计划 `canPreview`、`canExport`。`voiceSource: none` 用实际动画、停留与停顿，不按字数估时。
- 动画场景定义的 `durations` 是阅读页、手动步进与无配音时状态的后备长度。讲授轨中与动画同时开始的 TTS 自动让 `PmScene` 状态随第一个显示它的步骤的实际配音长度伸缩（`architecture.md` 5.3 节），不把后备长度当最低停留；显式 `production.minimumHoldMs` 仍是硬下限，配音结束后保持终态。`after-animation`、无配音、录音和含连续 `next` 提示的页面保留声明的动画时序；其它定长组件不缩放。配音之后不改写 `durations`。
- 合成语音是 `audio`，导入音频是 `media`（`ProductionAssetInspection`）。预览与导出共用同一放置、裁切与混音计算。
- 一个步骤显示的内容块都限定在其他媒介（`only` 不含 `lecture`，如只给网页的来源说明），又没有讲稿、录音与挂在它上的音频片段，也不是前面讲稿中的 `{cue}next` 转入的步骤时，讲授中没有这一步：讲授轨没有转到它的事件，计划的页面没有它，字幕与章节（`chapters.vtt`）也不含它；一页的步骤都是这样时整页不在讲授中。放映与网页照常显示它。
- 渲染端选项 `metadata.renderers.lecture.maximumDurationMs` 是讲授视频的最长时长（毫秒，大于 0）。计划时长已确认且超过它时，`presmium check` 报告错误，给出超出的秒数，以及按配音的实测语速（讲稿字数除以配音秒数，字数只计字母与数字）约需删去的讲稿字数。计划未确认（配音不全、没有选择音色、有步骤时长未知）或读取配音与音频文件失败时不比较，报告一条警告说明没有检查及原因。`presmium-lecture timing` 读同一份计划逐步列出这些数。
- `metadata.renderers.lecture.video` 保存视频导出设置，只接受 `burn`（非空字幕语言，如 `zh-CN`）、`contactSheet`（布尔值）、`size`（两个正整数，依次为宽和高）与 `fps`（大于 0 且不超过 60）。缺省为不烧录字幕、不生成帧表、1920 × 1080、30 fps。MCP 的 `build` 目标 `video` 与 `presmium-lecture export` 共用这些设置，显式命令行参数优先；音色与时序仍由 `production` 决定，编码器路径只来自运营环境。成功生成的帧表列在视频任务的文件列表中。
- 显式无声讲稿的字幕复用文本切分形成短组，在已确认的讲稿时长内按文本宽度分配显示时间，标记为 `proportional`；这不生成音频词时码或手工对齐证据，真实配音与手工字幕映射保持原有规则。

`GET production-plan`（`ProductionPlanQuery`）、`GET tracks/script`（`planId`）、`GET production-media`（绑定加 `clipId`，只给计划白名单中的字节）、`GET production-asset`（`ProductionAssetQuery`）都只读缓存，不生成语音。

## 7. 工作区与命令

工作区配置是 `presmium.workspace.yaml`：`title`、`site`、`approvals`、`settings`、`templates` 与 `defaults:`（继承链的根，可写 `lang`、`plugins`、`presmium`、`renderers`、`execute`、`checks`、`production.defaults`、`production.captions`，见 2.1.2 节）。它不列出文稿：工作区根目录下的每个 `index.pmd` 都是一份文稿，扫描跳过 `node_modules`、`.git`、`.presmium`、`dist`、`.trash`、以 `.` 开头的目录与 `locales/<语言>/`。凡列出文稿的地方（工作区服务的文稿列表、网站导航与翻页、命令行）都按文稿树深度优先排列，同级按 `rank`；网站侧栏在有下级文稿时按文稿树嵌套显示（`SiteDocument.parent` 是上级文稿的文件夹），当前文稿上方的分支展开，`site.sidebar: directories` 时仍按文件夹显示。仍有 `documents:` 的工作区文件不被采用：`presmium check` 与编译报告需要升级，Studio 显示升级提示。根目录自己有 `index.pmd` 的目录是单文稿工作区。

`presmium new` 与 Studio 新建的文稿放在顶层末尾，复制的文稿放在原文稿之后；导入的文稿按导入顺序放在顶层末尾。`presmium import <文件或文件夹> --out <目录>` 与工作台首页的“导入文稿 / Import Documents”共用 `@lincyaw/compiler` 的转换：支持 UTF-8 Markdown（`.md`、`.markdown`）、Word（`.docx`）与 PowerPoint（`.pptx`），每个文件一份文稿，保留目录层级；Markdown 与 Word 的一级与二级标题各开一页，PowerPoint 每张幻灯片一页，每页一个显示全部内容块的步骤。相对链接与本地图片按导入的文件夹解析，图片复制到各文稿的 `attachments/`；导入单文件时无法提供的图片和链接计入待检查数。原始文件逐字节保留在文稿的 `originals/` 中。

Markdown 的段落、标题、强调、链接、列表、代码、公式和表格转成可编辑节点；没有对应富文本节点的内容（原始 HTML、脚注、提示框、内联图片）保存为 `presmium.mdast` 扩展。保留内容语义，不保证空白、语法拼写、第三方扩展或排版的往返一致性。Word 使用 Mammoth 的公开接口提取标题、段落、列表、表格、粗体、斜体、链接和内嵌图片；无表头的表格保持原有行数，不导入字体、页眉页脚或分页布局，也不读取外部关联文件。PowerPoint 用 JSZip 与 xmldom 读取 OOXML：幻灯片按 `presentation.xml` 的顺序各成一页，标题占位符的文字是页面标题（没有时取第一行文字，它不是列表项、不以句末标点结尾，并且要么在靠近顶部、下方还有其他内容，要么是整页唯一的内容且很短（汉字计 1、其他字符计 0.5，不超过 20，如章节过渡页）；再没有时第一页用文件名、其余写“幻灯片 N / Slide N”，文字留作正文）；形状按位置从上到下、从左到右读出，文本框保留段落、粗体、斜体、删除线与链接，带项目符号或编号的段落（包括从版式与母版继承的）按级别成为嵌套列表，表格保留表头与合并单元格，图片成为图片块并复制到 `attachments/`；备注成为该页步骤的讲稿（每页一段），有备注的文稿导入时即启用视频制作（与作者动作 `production.enable` 相同：加上讲授与配音插件和讲授形态），可以直接配音与导出讲授视频。导入的 PowerPoint 文稿声明网站与幻灯片两种形态（`renderers.web`、`renderers.slides`），可以放映并导出为 PDF 与 PowerPoint。位置、字体、颜色、动画与切换不导入；图表、SmartArt、嵌入对象、音视频与浏览器不能显示的图片（如 EMF）是转换提示，Word 中 Mammoth 报告的问题（不认识的样式除外，样式本就不导入）也是。转换提示写成文稿中的批注（作者 `presmium-import`，即 `IMPORT_COMMENT_AUTHOR`，工作台显示为“导入 / Import”），锚定在所在页面的标题上，按文稿的 `lang` 说明这一页缺了什么；来源没有给出位置时（Word）放在第一页。作者处理后将批注标为已解决。不支持旧版 `.doc` 与 `.ppt`，需先另存为 `.docx`、`.pptx`。Markdown、Word 与 PowerPoint 只是一次性导入来源，后续编辑只写 `index.pmd`。

`presmium script export` 把讲稿写成一份供润色的 Markdown 工作副本（默认 `<文稿>/dist/script.md`）：每页、每步一个标题，每段讲稿在标记行 `<!-- n: <讲稿 ID> -->` 之下，到下一个标记行或标题为止。讲稿中的换行在文件中另起一行，空行（`\n\n`）是一个空行；读回时每行去掉首尾空白，连续的空行算一个。读音节点写作 `{显示|读音}`，cue 写作 `⟦cue:<id>⟧`；文字中的 `\`、`{`、`}`、`⟦`、`⟧`（读音节点中另有 `|`）前面加 `\`，看起来像标题或注释的行以 `\` 开头，读回时去掉这些 `\`。`presmium script import` 核对标记与 cue（不能缺、不能多、cue 不能删除或跨段），只替换文字有变化的讲稿的 `content`（`provenance` 与 cue 节点保留），经 `validateDocument` 后按文件原有的缩进原子写入；副本本身从不进入编译。`presmium voiceover` 生成配音（[作者动作](authoring-actions.md) 第 9 节），`presmium speech key` 读写运营者的语音服务密钥（[架构](architecture.md)）。

```sh
presmium new lesson --type document
presmium dev lesson
presmium check lesson --json
presmium build lesson --to web
presmium ir lesson --out runtime-snapshot.json
presmium import notes --out . --exclude raw
presmium migrate . --check
presmium script export lesson
presmium script import lesson
presmium voiceover lesson
presmium voiceover lesson --yes --prune
presmium speech key status .
presmium serve .
```
