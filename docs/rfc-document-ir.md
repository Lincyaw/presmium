# RFC：唯一权威的可编辑文稿 IR

状态：实施中。2026-10-26 用户确认按本方案重构，取消 MyST 运行入口，迁移现有文稿后删除旧格式；不建立双格式兼容或双写机制。

本 RFC 记录作者确认的领域结构，供内核、编译器、工作台与迁移实现共用。精确类型、JSON Schema 与校验器由 `@lincyaw/kernel` 维护；本文不代替契约源码。原生编辑体验与独立文档、编译放映、视频制作入口继续遵循 [工作台 RFC](rfc-workbench-uiux.md)。

## 文稿与快照

可编辑的教学文稿 IR 是唯一权威 JSON。Web 与 agent 修改同一份文档，工程文件中的代码、大型媒体保持引用。运行快照由文稿版本、组件实现和资源派生，供阅读、放映与导出使用，可以重新生成。当前运行 IR 的数字步号、`at`、`span`、`stepMap`、资源发布位置与绝对播放区间不成为长期编辑格式。

文稿提交使用 `baseDocumentVersion`；运行产物使用 `snapshotId`。文档编辑与保存不等待编译成功，编译失败保留上次成功快照并报告它所对应的版本，不能将其冒充当前版本。

## 五类对象与关联

一等对象为页面、内容块、步骤、讲稿、素材定义。资源库和讲授编排与它们同属一个工程。实体用稳定 ID 映射保存，有序 ID 数组表达顺序；移动对象不改变身份。

实体、富文本、讲稿提示、媒体片段和批注的 ID 在文稿内唯一。对每个现存页面，`page:<Section ID>` 是其标题的保留锚点；作者对象不能使用这个确切 ID，校验在实际撞名字段报告 `id.reserved`。批注的 `blockId` 引用该标题锚点仍合法；不对应现存页面的 `page:` 前缀 ID 继续按普通 ID 处理。

```ts
interface Document {
  schemaVersion: number
  id: DocumentId
  metadata: Metadata
  sectionOrder: SectionId[]
  sections: Record<SectionId, Section>
  blocks: Record<BlockId, Block>
  steps: Record<StepId, Step>
  narrations: Record<NarrationId, Narration>
  assets: Record<AssetId, Asset>
  definitions: Record<DefinitionId, Definition>
  production: Production
}

interface Section {
  id: SectionId
  title: string
  children: BlockId[]
  stepOrder: StepId[]
  layout: Layout
}

type Block = TextBlock | ContainerBlock | ImageBlock | CodeBlock | ComponentBlock

interface ContainerBlock {
  id: BlockId
  type: 'container'
  layout: 'stack' | 'columns' | 'tabs'
  children: BlockId[]
  properties: ContainerProperties
}
```

内容归属是一棵树。一个块只有一个父节点，不能成环。跨页复用通过引用定义或素材表达，不让同一内容块具有多个父节点。

图片块可以暂不绑定 `assetId`，表示作者已插入但尚未选择图片。它仍有稳定的块 ID，可以保存、撤消和恢复；不为这个占位创建空地址素材。显式填写的 `assetId` 必须引用已有图片素材。替换某个实例的图片只改变该块的绑定，不修改其他实例共用的素材；编译遇到未绑定图片时按块 ID 给出警告和可读回退。

复制页面在原页之后插入一个独立页面，为页面、归属树中的内容块、富文本节点（含列表项、表格行与单元格、扩展回退）、代码变体、步骤、讲稿、cue 和媒体片段分配新 ID。显式的页内引用同步重映射，包括子节点、逐项显示顺序、步骤继承与画面、代码步骤高亮、讲稿与 cue 目标，以及 Production 的页面／步骤／讲稿覆盖、cue 延迟和片段挂接。同一讲稿在复制页内被多个步骤引用时仍共用一份新的讲稿，原页及其他页面继续使用原讲稿。

定义与资源继续引用原对象；未知插件参数、扩展数据和普通链接完整保留，不根据字符串猜测内部身份。合法的页外 cue 目标保持原引用，其他页面指向原页的引用不转移。批注是原位置的讨论，不随页面复制，跨页批注也保留原锚点。复制通过同一源版本检查、领域校验、原子保存与撤消历史；源事务确认后才能采用新页选择，后来的作者选择优先，运行编译失败不阻断复制或正文编辑。

富文本采用 Presmium 定义和版本化的结构：段落、列表、链接、公式、引用与文字样式保留类型，代码保存代码字符串。段落、列表项等实际编辑单元具有稳定身份，不把许多独立段落压成一个没有内部身份的大文本对象。通过 BlockNote 的公开接口作无损适配，不再转换成 Markdown 再解析；也不直接将编辑器私有运行状态持久化。

文档工作区由一个全篇 BlockNote 编辑器直接操作文稿 IR，使用原生选区、历史和格式工具。编译预览独立消费运行快照。正文批注不再以第二套 DOM 框选来控制编辑器；跨块范围使用稳定实体 ID、偏移和文稿版本。

## 步骤与讲稿

```ts
interface Step {
  id: StepId
  sectionId: SectionId
  title?: string
  visuals: VisualState[]
  narrationIds: NarrationId[]
}

interface VisualState {
  blockId: BlockId
  visible: boolean
  state?: string
  parameters?: JsonObject
}

interface Narration {
  id: NarrationId
  content: NarrationNode[]
}
```

步骤的教学状态与内容顺序分开。给定文稿版本、Step ID 与步内时间，无须先播放前面的步骤即可重建画面。允许存储明确的覆盖规则，构建时解析成完整状态；前进、后退、跳步和导出使用同一解析结果。

动画状态来自组件公开的稳定状态契约。迁移现有数字步骤时保留明确映射，不能自动将序号伪装成稳定语义状态。组件升级移除状态或改变参数契约时产生绑定诊断。

讲稿中的文字、发音替换与 cue 是结构化节点。例如 `text`、`pronunciation { display, spoken }`、`cue { action, target: { blockId, element? } }`。同一结构派生字幕文字、合成文字、提示锚点和字词对齐；录音转写保留自己的来源，只有“采用为讲稿”才修改讲稿。

## 素材与定义

```ts
interface ComponentBlock {
  id: BlockId
  type: 'component'
  definitionId: DefinitionId
  parameters: JsonObject
}

interface Definition {
  id: DefinitionId
  kind: string
  schemaVersion: number
  implementation: ImplementationRef
  parameterSchema: JsonSchema
  states: StateDescriptor[]
}
```

Asset 保存资源位置、类型与指纹。Definition 保存实现入口、参数和状态契约。内容块实例引用定义并保存自己的参数；改实例只影响当前使用，改定义影响全部引用，采用前显示范围。JSON 管声明和引用，代码与大型媒体不必嵌入 JSON 字符串。

插件数据带自己的版本。未知插件数据完整保留，使用占位或静态回退，并报告无法验证或执行的能力；不得删除未知字段来使编辑器看似可用。

## 译文

每个译文也是完整的 `lecture.json`，放在原文目录的 `locales/<语言>/` 下。原文通过 `metadata.translations` 登记路径，例如 `{ "en": "locales/en/lecture.json" }`；译文通过 `metadata.translationOf` 登记原文路径与内容摘要。两者都进入相同的 Schema、身份和版本校验，不开放额外文件名或旧格式入口。

译文独立保存自己的元数据与工程引用，按其所在目录编译，不隐式继承原文的插件或实现路径。相对素材和组件路径在迁移时重基；代码锚点继续遵循工作区根目录的既有规则。直接编译译文和由原文发布该译文时，使用相同的文稿内容与路径基准。

译文摘要由原文 JSON 的规范化内容生成，忽略对象键顺序、空白、BOM，以及 `metadata.translations` 和 `metadata.translationOf` 两项登记数据。内容改变后报告译文过期；格式调整或更新摘要登记不会造成自引用或重复过期。

## 讲授编排

```ts
interface Production {
  defaults: ProductionDefaults
  stepOverrides: Record<StepId, StepProduction>
  mediaClips: MediaClip[]
}

interface StepProduction {
  narrationStart?: 'with-animation' | 'after-animation'
  minimumHoldMs?: number
  trailingPauseMs?: number
  voiceSource?: VoiceSource
}

type VoiceSource =
  | { type: 'none' }
  | { type: 'tts', voice: SpeechVoice }
  | { type: 'recording', assetId: AssetId, sourceRange?: TimeRange }

interface MediaClip {
  id: ClipId
  assetId: AssetId
  sourceRange: TimeRange
  attachment: { stepId: StepId, offsetMs: number }
  volume: number
}
```

录音的可选 `sourceRange` 只选择原文件区间；省略表示整段。实际时长与 SHA 在共享采用服务中核对，保存不改原字节、Narration 或 ASR 来源。裁切后整步字幕仍为 `alignment=none`，详见[音频作者接口](audio-authoring.md#采用原音为本步配音)。

讲授默认顺序从 `sectionOrder → section.stepOrder` 派生，不重复持久化。时序决定仅由 Production 保存，Step 不再保存另一份 timing。配音继承和实际来源必须有唯一规则，不在讲稿和编排中留下互相覆盖的两份配置。绝对起止时间、精确时长和播放片段属于派生的 PlaybackPlan。

时机逐项按文稿 `defaults`、页面 `sectionOverrides`、步骤 `stepOverrides` 解析，后者优先。迁移保留的 `narrationOverrides` 只为讲稿提供开始时机，位于页面与步骤之间：同一步的多条讲稿可继承各自的开始时机；显式设置步骤开始时机只统一本步，不改共享讲稿。恢复本步继承只移除步骤层的时机字段，保留音色、讲稿覆盖、cue 延迟和媒体片段。

未来支持复讲时，再引入有独立出现 ID 的编排序列；当前不为未来需求预先增加第二份默认顺序。

## 统一提交边界

Web 生成语义操作，agent 可以提交同样的操作或完整 JSON。两种提交进入同一校验链：

1. 文稿与工程文件的版本检查。
2. JSON 语法、格式版本与结构 Schema 校验。
3. ID、引用、树结构、步骤归属、组件参数与状态、媒体范围等领域约束校验。
4. 原子保存相关文件并记录一次可共同撤消的历史。
5. 异步派生运行快照和真实诊断。

语义操作包括插入／移动／删除内容块、修改富文本、设置步骤状态、讲稿和时序、替换素材。删除不能让旧绑定静默接到其他对象。保存回执绑定文稿、提交请求和输入版本，旧回执不能清除新输入。

单用户工作区先使用版本冲突与事务；不引入多人 CRDT。外部直接修改 JSON 也能通过同一校验器得到定位到实体与字段路径的诊断，不再通过源码行范围或语法保留补丁定位编辑。

## 实施边界

内核负责文稿类型、Schema 与领域校验；编译器只读取新文稿 JSON 并生成运行快照；工作区服务负责统一提交、工程文件事务与历史；工作台负责单个原生编辑器和独立编译预览。

现有文稿、模板、示例和命令直接迁移。普通 Markdown 说明文档不是教学文稿，不按文件名误迁。迁移保留内容、稳定身份、步骤与讲稿、代码与动画定义、引用资源及有效缓存关系；不再开放旧 MyST 入口。旧源码回写、源码范围定位和按页面拼接的作者编辑适配在替代链路验证后删除。
