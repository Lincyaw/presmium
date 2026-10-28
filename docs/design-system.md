# Presmium 控件与视觉实现规范

状态：正式实现约束；核心公共控件已迁移，领域控件和剩余页面待实现。更新日期：2026-10-27。

本文供设计与开发实现 Web 工作台、未来 Tauri 外壳及共用控件时使用。功能、信息架构和产品边界见 [UI/UX RFC](rfc-workbench-uiux.md)，Figma 文件及功能原型索引见 [原型覆盖说明](prototypes/workbench/README.md)。本文规定样式和素材放在哪里、控件如何复用，以及实现前必须补齐的公共能力。

低保真方块、文字和跳转只表达功能流程，不是正式视觉验收。实现页面前，必须先完成该页面使用的控件、变体和状态规范，再组合业务布局。不得把线框里临时画出的按钮、输入框或颜色直接复制为页面私有样式。

## 1. 唯一来源与文件职责

代码中的视觉取值以 `@lincyaw/design` 为唯一来源。Figma 用同名变量和组件表达已批准的设计，控件与代码建立明确映射；两者不一致时修正规范与公共实现，不能让每个页面自行解释。

| 文件或边界 | 唯一职责 | 不承担的职责 |
|---|---|---|
| `packages/design/src/tokens.css` | 颜色、字体、字号、行高、间距、尺寸、圆角、阴影、动效、层级与外壳几何令牌 | 业务选择、接口状态和页面专用布局 |
| `packages/design/src/tokens.ts` | 颜色语义名 `COLORS`、`colorToken`、`color`；新增颜色与 CSS 同步 | 第二套颜色数值 |
| `packages/design/src/components.css` | `pm-ui-*` 控件的统一外观、密度、交互与状态样式 | 各业务页面的私有控件变体 |
| `packages/design/src/fonts.css` | 随包字体与字重的加载入口 | 按页面从网络临时加载字体 |
| `packages/design/src/icons.ts` | Lucide 图标的语义名、类型与通用标记生成 | 各页面自绘图标或用字符代替图标 |
| `packages/design/src/design.css` | 字体、令牌和组件样式的统一装配入口 | 覆盖某一页面控件的样式 |
| `packages/workbench/src/components.tsx` | 作者工作台的公共 React 控件，封装样式、公开属性和 Radix 行为 | 文稿保存、生成、配音或剪辑的业务决策 |
| `packages/host/src/design/components.ts` | 产物与插件使用的公共 React 控件和交互适配 | 工作台私有状态或 dsh 接口 |
| `packages/workbench/src`、`packages/dsh/src/client` 的业务 CSS | 区域布局、排列、滚动、响应式和画布空间 | 重写 `pm-ui-*` 的颜色、字体、边框、圆角、尺寸或状态 |
| `packages/design/src/assets/` 与 `manifest.json`，本轮新增 | 产品品牌、公共插画和其他发布用设计素材；现有图标与字体登记其依赖来源 | 作者上传的私有材料、生成素材或项目媒体 |

`@lincyaw/design` 维持框架无关。React 封装留在 workbench 与 host，不为复用控件而让 workbench 引用 host，也不让插件引用 workbench。跨边界共用的是令牌、语义图标、`pm-ui-*` 及一致的交互规范。

BlockNote 的公共适配类为 `pm-ui-block-editor`，由工作台的全篇 `BlockNoteSurface` 挂载，选中态样式集中在 `packages/design/src/components.css`。文稿与富文本结构由 `@lincyaw/kernel` 定义，编辑器只通过公开接口投影与回写 `lecture.json`，不持久化另一份编辑器工程。
适配使用 BlockNote 的公开 `.ProseMirror-selectednode`、`.bn-block-content` 选择器，仅在编辑器内有焦点时以 `accent-soft` 表面与 `accent` 描边表示当前块；伪元素保持透明，不遮住正文或动画。
斜杠菜单使用公开 `.bn-suggestion-menu` 选择器隔离阅读正文的段落留白与行高，菜单文字恢复公共 `leading-ui`，避免正文排版把每条插入项撑高；菜单的布局、滚动与键盘行为仍由 BlockNote 提供。
正文侧边的添加与拖拽按钮使用公开 `.bn-side-menu` 适配，沿用 compact 的 30px 与触屏的 44px 热区、公共图标和焦点令牌；窄屏或粗指针设备纵排，放在页边留白内，避免工具被视口裁掉。
格式工具条使用公开 `.bn-formatting-toolbar` 适配，限制为视口内宽度并换行，按钮沿用同一 30px／44px 最小热区。正文批注使用 BlockNote 的 `CommentsExtension`、`AddCommentButton` 和原生表单，删除旧宿主 DOM 选区与批注浮层。跨代码选区下，BlockNote 默认隐藏格式工具条；工作台在编辑器内提供同一个原生批注按钮。`.bn-thread` 按钮沿用公共热区，触屏批注输入至少 16px。原生新建批注、reply／已有 comment edit 的备份恢复复用 I01 的 `PmNotice`、`PmSelect` 和 `PmButton`：先选精确稿，再恢复或丢弃；失去目标时仅原生只读取稿，不自动切换绑定或保存。新建稿确认原范围后，通过单次公开原生命令恢复选区并显示原生表单；显式恢复成功才收起批注侧栏，避免窄屏遮挡。见[批注草稿验证](benchmarks/native-comment-drafts-2026-10-28.md)与[新建稿验证](benchmarks/native-new-comment-drafts-2026-10-28.md)。
原生批注的浮层与侧栏共用 `--pm-comment-width` 和视口宽度约束；URL、标识符和中英无空格文本按原字节换行。Comments.Editor 以 `--pm-comment-editor-max-height` 与 `45vh` 中较小者限制高度并独立滚动，原生保存按钮留在滚动区之外，不改变输入、选区或提交回调。[NativeComments](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=269-5405) 登记原生 Compact／Touch 与亮暗状态；适配仅位于公共 `pm-ui-block-editor` 层。
正文指针框选期间与非空正文选区不显示已有线程浮层，避免它覆盖待选文字。常驻原生 FloatingThreadController 通过公开 open 与 elementProps 适配；隐藏关闭过渡的残留内容但保留线程和回复 editor。正常收拢点击仍走原生打开与首击处理，不写回 DOM 选区。见[框选验证](benchmarks/native-comment-pointer-selection-2026-10-28.md)。
表格合并使用同一工具条内的公开 `TableCellMergeButton`，拆分使用原生单元格菜单，保留官方选区、可用条件、图标和回调。[NativeTable](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=199-4529) 登记紧凑与触屏密度的跨单元格选区、合并、拆分状态；样式沿用公共 BlockNote 适配，不增加业务按钮或表格浮层。
原生图片面板使用 `.pm-ui-block-editor .bn-panel` 公共适配，保留 BlockNote FilePanel 的上传、嵌入、加载与失败行为。[NativeFilePanel](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=211-4825) 组合现有紧凑按钮与输入框，桌面 30／13、触屏 44／16，宽度受视口约束；不另造上传器或常驻说明。

## 2. Tokens、公共控件与业务布局

实现按三层进行：令牌定义视觉取值，公共控件定义形态和交互，业务区域只负责组合。新增需求先检查已有控件的公开属性；能力不足时先扩展公共层，再让页面使用。

业务 CSS 允许定义网格、分栏、对齐、容器宽度、内容溢出和使用令牌的区域间距。布局最好落在控件外的容器上。禁止通过后代选择器、附加业务类、内联样式、`!important` 或重新定义全局令牌，改变某页按钮或输入框的外观。控件自身的大小、强调等级和状态由公开属性选择。

业务层不得新增另一套按钮、输入框、菜单、分段控件、标签页、提示浮层、遮罩或焦点循环。表单未有专用 React 包装时，暂用 `PmField` 配合已经定义的 `pm-ui-input`、`pm-ui-textarea`、`pm-ui-select`；公共包装补齐后统一迁入。不得以“暂用原生控件”为由省略共用类、标签和错误关联。

编辑区域不常驻解释数据模型、字幕派生或内部保存方式的说明。标签直接命名可编辑内容；错误、未保存状态与采用前必须确认的影响范围按当前状态显示。时间线的键盘说明通过可访问描述提供，不占用常驻编辑空间。

生成弹窗保留范围、音色、讲稿、真实进度、必要错误与提供方披露，完成反馈只显示一处；仅本弹窗拥有的待处理或活跃任务使用“取消并关闭”，其他情况使用“关闭”。

文档里的字幕侧栏和动画展开区只提供字幕输入及配音开始时机。音色、应用范围、生成入口，以及停留时长、结束停顿、继承恢复和发音工具放在视频制作；音色沿用 `DocumentVoiceField` 与 `DocumentVoiceDialog`，讲稿与制作设置继续通过同一文稿保存边界写入。切换界面不清除这些设置，也不把它们补成文档里的常驻说明。

放映字幕复用 host 的 `PmCaption`：`label` 提供可访问名称，`lines` 保留当前字幕段落顺序，`hint` 只补充作者可理解的状态。外观由 `packages/design/src/caption.css` 与 `--pm-caption-max-width`、`--pm-caption-max-height` 令牌定义；超长文本在安全区内滚动，业务层只安排它与画面、控制栏的位置。放映字幕通过 host 的 `PmCaptionProvider` 与 `PmCaption overlay` 进入幻灯片画布内的共享浮层，底部避让页脚；显示、隐藏与换行不参与画布外布局，不改变幻灯片的位置或缩放。按步骤字幕与真实时序字幕通过宿主显示权协调，不能叠加两套字幕。
Figma 公共 `Presmium/Caption` 对应单段、多段、空讲稿和超长滚动四种状态，节点登记在 `figma-nodes.json`。其颜色、间距、边框、圆角与最大宽度绑定公共变量，正文和提示复用已有 16px／12px 文字样式。滚动示例以 800px 高视口呈现 `28vh` 的 224px 上限，运行时继续按实际视口计算。

放映导航与讲授播放组合在同一底栏，播放／暂停和字幕复用 host `PmIconButton`，进度复用 `pm-ui-range`，次要选项复用 `PmMenu`，只读字幕／章节复用 `PmDrawer`。业务样式只安排伸缩和排列，不另加播放器背景、边框或控件外观。

时间输入、播放头、音色项和素材选择等领域控件也需作为 workbench 内可复用组件规定状态与外观，不因它们具有业务名称就豁免公共设计。波形和时间片段的内容可由领域数据绘制，其控件边界、选择、焦点和热区仍遵循本规范。

## 3. 已有令牌与正式取用规则

本节区分已有令牌、本轮新增令牌和待迁移控件。桌面工作台采用剪辑工具的紧凑操作密度：属性栏与工具栏默认使用 compact，单行控件最小高度 30 CSS px，标签和值为 13 CSS px；普通创建、导出等对话框可使用 regular 的 36 CSS px。触屏有效热区至少为 44 CSS px，输入文字使用 16 CSS px，不将触屏输入强塞进桌面紧凑高度。内容换行或字号放大时允许控件增高，不裁切文字。公共控件已通过 `density` 和共用 CSS 取用这些令牌；未迁移的业务控件仍需逐项检查。

| 密度 | 默认使用范围 | 几何、文字与留白 |
|---|---|---|
| compact | 桌面属性栏、工具栏、播放与时间参数、互斥选项 | 单行最小高度 `--pm-size-tool`；标签和值 `--pm-text-sm`；控件垂直留白 `--pm-space-px`、水平留白 `--pm-space-2`；组内间距 `--pm-space-1` 或 `--pm-space-2`，组间 `--pm-space-3` |
| regular | 普通创建、导出和确认对话框中的表单与操作 | 单行最小高度 `--pm-control-height`；标签和值按用途使用 `--pm-text-sm`／`--pm-text-md`；控件垂直留白 `--pm-space-1`、水平留白 `--pm-space-3` |
| touch | 触屏上以上两类控件的可操作适配 | 有效热区 `--pm-control-hit-area`，输入文字 `--pm-text-lg`；保持可读后增高或折行，不能缩小字体或重叠热区 |

compact 与 regular 是公共控件的密度，不是每个业务面板各自定义的样式。长讲稿始终使用独立多行区域，不因属性栏采用 compact 而缩成单行短字段。

| 用途 | 取用规则 |
|---|---|
| 基础界面文字 | `--pm-font-sans`、`--pm-text-md`、`--pm-leading-ui` |
| 紧凑标签、参数值与辅助文字 | compact 的标签和值使用 `--pm-text-sm`；次要时间码或提示可用 `--pm-text-xs`，不得将 compact 输入值继续缩小 |
| 阅读正文与教学代码 | `--pm-font-serif`、`--pm-text-reading`、`--pm-leading-reading`；教学代码用 `--pm-font-mono` |
| 常规单行控件 | regular 最小高度使用本轮新增的 `--pm-control-height`；垂直留白取 `--pm-space-1`，水平留白取 `--pm-space-3` |
| 紧凑单行控件与工具按钮 | compact 最小高度取 `--pm-size-tool`，适用于按钮、输入、选择与互斥参数；不以缩小图标代替合理热区 |
| 短数值与时间 | 数值最小宽度取 `--pm-control-number-width`（80px），时间取 `--pm-control-time-width`（112px）；起止时间成对，单位放在字段说明或统一后缀，不让一个短值独占整行 |
| 时间线 | 轨道标签列取 `--pm-timeline-label-width`（88px），窄屏复用触屏热区宽度；尺标预留宽度取 `--pm-timeline-tick-width`（80px），真实峰值图高度取 `--pm-timeline-wave-height`（20px） |
| 触屏输入与操作 | 输入文字取 `--pm-text-lg`，有效热区取 `--pm-control-hit-area`；热区不能互相重叠 |
| 图标 | 常规取 `--pm-size-icon`，小号取 `--pm-size-icon-sm`，较大上下文图标取本轮新增的 `--pm-size-icon-lg`；CSS 决定尺寸，业务组件不传数字 |
| 多行输入 | regular 通用 Textarea 最小高度取 `calc(var(--pm-size-row) * 2)`；compact 讲稿最小高度取 `--pm-narration-editor-compact-height`，独占多行区域并按内容和窗格伸缩；保留的 `--pm-narration-editor-height` 不作为 compact 默认值 |
| 文字与控件间距 | compact 组内取 `--pm-space-1`／`--pm-space-2`，组间固定取 `--pm-space-3`；标签与输入取 `--pm-space-1`，图标与文字取 `--pm-space-2`；regular 字段组可取 `--pm-space-3` 或 `--pm-space-4` |
| 控件边框与圆角 | `--pm-size-hairline`、`--pm-radius-control`；紧凑项用 `--pm-radius-small` |
| 焦点 | 输入框使用 `--pm-color-accent` 边框，配合 `--pm-color-accent-line` 的柔和光圈；光圈宽度取 `--pm-space-px`，不能仅改变背景表示焦点 |
| 输入表面 | 默认使用 `--pm-color-chrome`、`--pm-color-ink` 与 `--pm-color-line-strong` 的细边框；默认边界即达到 3:1，不依赖悬停加强才可识别；提示文字取 `--pm-color-muted` |
| 选中项 | `--pm-color-selected` 或 `--pm-color-accent-soft`，配合 `--pm-color-accent` 与形状标记，不与键盘焦点混为一态 |
| 浮层 | `--pm-shadow-float`、`--pm-z-popover`、`--pm-z-dialog`、`--pm-z-tooltip`，按控件类型使用 |
| 动效 | `--pm-duration-fast`、`--pm-duration`、`--pm-ease`；忙碌动画用 `--pm-duration-spin`，遵循减少动态效果偏好 |

compact 复用 `--pm-size-tool` 的 1.875rem 和 `--pm-text-sm` 的 0.8125rem，按根字号 16px 分别为 30px 和 13px；组内 4px／8px 分别取 `--pm-space-1`／`--pm-space-2`，组间 12px 取 `--pm-space-3`。regular 单行控件的正式最小高度令牌 `--pm-control-height` 为 2.25rem，有效触摸热区 `--pm-control-hit-area` 为 2.75rem，分别为 36px 和 44px。触屏输入的 `--pm-text-lg` 为 1rem，即 16px。常规、小号和较大图标分别为 16px、13px、20px。图形保持紧凑，热区扩展后不得与相邻控件重叠。

compact 讲稿使用本轮新增的 `--pm-narration-editor-compact-height: 5rem`，即 80px 最小高度，桌面文字仍为 `--pm-text-sm`；按内容和可用窗格扩展，不常驻过大的空白输入区。regular 通用 Textarea 最小高度仍为 `--pm-size-row * 2`，即 96px。既有 `--pm-narration-editor-height: 12rem`（192px）保持不变，避免仅新增密度规范就改变正在运行的编辑页面；触屏输入文字仍取 16px，不受 compact 桌面值限制。

`components.css` 已统一 compact、regular 与 touch 密度；兼容的 `small` 类映射到 compact。粗指针设备由公共媒体查询补足触屏热区和输入字号。旧的 `--pm-size-touch` 保留给兼容样式，不能用于新控件的有效热区。页面迁移与四种显示组合的实看仍须按第 8 节记录。

控件密度、字重、禁用透明度和忙碌占位由公共层取用令牌。禁用透明度取 `--pm-opacity-disabled`；primary 与 accent 的悬停／按下分别使用 `--pm-color-primary-hover`、`--pm-color-primary-pressed`、`--pm-color-accent-hover`、`--pm-color-accent-pressed`。它们以现有语义颜色混合，明暗模式自动解析，不能在页面另写比例。禁止在页面中各选一组数字，不为每个面板新增尺寸名称。

亮色用 `:root`，暗色仅在 `:root.dark` 覆盖颜色与阴影；几何、字体层级和热区保持一致。业务组件不各自提供暗色取值。CSS 不写原始颜色、px 或时长值；px 仅允许用于媒体查询断点，取值进入 `tokens.css` 后再供控件使用。

## 4. 公共控件目录

下表区分已提供的公共入口与后续领域控件要求。workbench 与 host 共用 CSS；React 包装按各自依赖边界维护。

| 控件 | 已有入口 | 正式实现要求与补齐项 |
|---|---|---|
| Button | workbench、host 的 `PmButton`，`pm-ui-button` | 已提供 `density`、`loading`、`aria-busy` 与重复提交拦截；保留五种强调等级和兼容的 `small` |
| IconButton | workbench、host 的 `PmIconButton`，`pm-ui-icon-button` | 已提供 `label`、`hint`、`shortcut`、`density` 与 `loading`，通过公共 Tooltip 显示名称和快捷键 |
| Input | workbench `PmInput`；host 使用 `PmField`＋`pm-ui-input` | workbench 包装关联 `label`、`hint`、`error`，支持原生只读／禁用属性、前图标、后缀和 `width="number"`／`"time"` |
| Textarea | workbench `PmTextarea`；host 使用 `PmField`＋`pm-ui-textarea` | workbench 包装支持标签、说明、错误、`density` 与 `autoGrow`；讲稿保持独立多行区域 |
| NarrationEditor | workbench 原生 `NarrationEditor`、`pm-ui-narration-editor` | 文档 basic cue 只显示“提示／Cue”，保留可选择的原子及 payload／ID；视频制作 advanced 保留动作与 cueId title，同一规范讲稿保存 |
| OriginalAudioAdoption | Video 的 `ProductionRecording`，[正式六态](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=245-5322) | 单一已保存原音选择器与明确“采用／已采用”，复用原生录音候选及公共 Card、Select、Button、Notice；保存不隐式采用或生成。录音摘要与现有音色 Dialog 显示真实素材标题或本地化短名，不常驻裁切／对齐说明。失败保留候选与选择；真实诊断仍可见，触屏热区 44、输入 16。Video 的“旁白区间”复用公共成对 In／Out 字段、Apply／Restore full，只有已采用原音才显示，保留非法待输入和旧源复查门槛；裁切后的真实字幕对齐提示仍显示。字段布局参照 [MediaClipEditor Ready](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=168-3749)，不把背景片段的完整控件当作旁白。裁切实证见[记录](benchmarks/recording-source-trim-2026-10-28.md)；原采用范围及来源谱系见[实际验证](benchmarks/recording-step-adoption-ui-2026-10-27.md) |
| TranscriptionAdoption | Video 的 `ProductionTranscription`＋`TranscriptionAdoption`，[正式状态](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=232-5371) | 候选、校对、受保护原子、对照、冲突、来源变化与已保存，共七态；复用原生讲稿、字段与 Dialog 底部操作，桌面对照并排、触屏上下排列。卡片 30／13、弹窗 36／14、触屏 44／16；未决冲突或来源变化禁用采用，不自动配音。运行证据中的候选是协议材料，不代表 ASR 成功 |
| Select | workbench `PmSelect`；host 使用 `PmField`＋`pm-ui-select` | 简单选项统一字段关系与密度；复杂单选使用 `PmSearchList`，不以原生列表冒充 |
| SearchList | workbench `PmSearchList`、`pm-ui-search-list`，复用 `PmInput` 与 Radix Radio Group | 提供搜索、结果计数、单选、描述、空／加载／错误／禁用态及三种密度；过滤不改写所选值，加载与错误保留已有结果但禁选，列表按公共高度令牌滚动 |
| Dialog | workbench、host 的 `PmDialog`，Radix Dialog | 已统一模态、标题／说明、操作区、忙碌拦截、外部按下不关闭与焦点归还 |
| Menu | workbench、host 的 `PmMenu`，Radix Dropdown Menu | 已提供图标、危险项、禁用项、快捷键、分隔与勾选态；键盘移动和焦点归还由 Radix 管理 |
| Tabs | workbench、host 的 `PmTabs`、`PmTabPanel` 与 `pm-ui-tab` | 已提供图标标签与手动激活；方向键移焦，确认后激活，面板由公共封装关联 |
| Tooltip | workbench、host 的 `PmTooltip` 与 `PmIconButton` | 已封装 Radix Tooltip；悬停延迟 300ms，键盘聚焦立即显示，可附快捷键 |
| Segmented | workbench、host 的 `PmSegmented`、`pm-ui-segmented` | 已用 Radix Radio Group 管理横排互斥参数、图标、禁用和选中；不代替工作区导航 |
| Popover／Drawer | host 的 `PmPopover`、`PmDrawer` 与共用 CSS | 依据任务使用浮层或侧抽屉；workbench 需要时走公开公共封装，不引用 host 或复制私有实现 |
| Field／Notice／Empty | `PmField`、`PmNotice`、`PmEmpty` | 同一位置展示字段说明、错误和恢复入口，不把所有状态写成页面私有提示卡 |
| Range | workbench `PmRange`、`pm-ui-range`，使用原生 range | 提供受控数值、读屏值、焦点、禁用和三种密度；方向键／Home／End 提交意图，拖动先显示本地预览，释放时单次提交，Esc／取消／失焦／卸载丢弃手势草稿 |
| MediaClipEditor | workbench `MediaClipEditor`、`pm-ui-media-clip-editor` | 组合公开素材选择、成对时间输入、短偏移、音量与静音；导入和采用分开，非法输入保留。调用方提供真实音频检查、已确认步骤范围和版本化提交，不绘制虚构波形 |
| Timeline | workbench `PmTimeline`、`pm-ui-timeline` | 接收真实画面／配音／字幕三轨与稳定步骤身份；支持尺面点击、精确秒输入、Range、横滚、视图缩放与适配；未知／估算时长不开放任意时间定位，仍可选择步骤；只有真实样本才绘制波形 |
| SortableList | workbench `PmSortableList`、`pm-ui-sortable-list` | dnd kit 负责指针、触屏、键盘和取消；按稳定 ID 提交一次相对位置移动。排序禁用与页面选择分开，保存前的视觉顺序不成为第二份文稿；身份、页面集合和重置变化中止过期手势 |
| BlockPreview | workbench `DocumentBlockPreview`、`pm-ui-block-preview` | iframe 与可读 fallback 共用持久 viewport；离屏释放 iframe 保留最近真实测量高度，未测量时使用既有预览高度令牌。终态失败暂停并移除旧 iframe，以短状态、可读 fallback 和原刷新入口紧凑显示；重试采用新预览。fallback 原生滚动、显示键盘焦点，Tab 可离开；挂载 iframe 不替换 viewport 或主动转移焦点。内联 HTTP 失败由本控件承接，完整请求诊断仍记录与上报；网络和显式放映失败保留全局反馈 |
| Checkbox／Radio／Switch | 现有 `pm-ui-checkbox` 仅提供部分基础着色，其余公共能力待补齐 | 在使用前规定选择、焦点、禁用、数值和错误状态，不在业务页各自实现 |

原生选择器的展开列表可能由操作系统绘制，不能把这种差异当作已完成统一视觉。音色选择使用公共可搜索弹层，组合搜索、语言筛选、共享列表项、试听与选中态；桌面可使用 Popover，空间不足时使用公共 Dialog 或 Drawer。素材等复杂选择复用同一类公共能力，在 Figma 单独规定相关状态，不能退回每页自绘的下拉列表。

`PmSearchList` 放在公共 Dialog、Drawer 或页面内，不另套下拉层。搜索框的向下键进入当前或首个可用结果，方向键、Home、End 与 Space 由 Radix Radio Group 管理；没有可用结果时焦点留在搜索框。`label`、`keywords` 用于检索，`description` 只展示非交互说明，试听等操作放在列表外。错误只渲染一个关联提示，额外说明通过 `aria-describedby` 关联；关闭时由外层公共容器归还焦点。Figma 的 [SearchList 组件集](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=77-554) 与[状态矩阵](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=77-1704) 对应 `packages/workbench/src/components.tsx` 的 `PmSearchList`、公共 CSS 与 `--pm-search-list-max-height`；24 个变体覆盖三种密度及默认、悬停、按下、焦点、禁用、加载、错误和空状态。

`PmTimeline` 的[正式组件集](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=136-3258)与[明暗状态矩阵](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=137-2178)覆盖三种密度及就绪、焦点、估算、未知、加载和禁用共 18 个变体；复用公开 Range、Input、Button、IconButton 与既有 Lucide 图标，不新增时间线私有按钮。尺、位置滑杆和三轨共享时间轴起点。片段太短时仍有独立完整热区的步骤按钮，触屏无需依赖拖动；长时间线在轨道区内横滚。缩放只改变视图，不写入 Production。`onSeek` 只提交时间意图，由调用方先暂停并确认来源后更新受控位置；`seekDisabled` 仅禁时间定位，稳定步骤选择保持可用。估算与未知不能冒充确认时码，缺少真实 samples 不画装饰波形。实际公共消费者范围见[时间线验证](benchmarks/public-timeline-2026-10-26.md)，不能由组件存在推断整个制作流程已经验收。

音色选择的[正式组合与状态](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=126-385)复用上述公共控件，不新增一套音色专用下拉。SearchList 的 Figma 变体内部按可用宽度伸缩，与公共实现的满宽、换行和滚动行为一致；默认宽度仍为 340px。组合包括桌面与 390px 触屏的浅／深色，以及目录未配置、不提供目录、空结果、读取失败、加载、确认覆盖、确认调用、取消中与源版本变化等状态。它们是正式设计目标，不能据此宣称独立视频制作入口或配音流程已经完成验收。

选择结果只更新设置草稿，试听与生成放在列表外显式确认。目录状态与已完成缓存是否可播放分开呈现；服务未配置不能遮掉当前可用缓存。语速与风格仅在真实服务声明支持时展示。应用范围使用文稿、页面与稳定步骤身份，对应 canonical Production 的默认值、页面覆盖和步骤覆盖，不在讲稿上新增音色层。恢复继承与明确静音使用不同动作；批量默认保留独立设置，替换时确认更新／保留的步骤数，并说明包含静音或录音的覆盖槽位数。旧源版本的确认失效时保留草稿，要求重新检查，不采用迟到结果。

### 4.1 组件库取用决定

本轮继续使用 BlockNote 编辑正文、Radix Primitives 提供公共浮层和键盘行为，样式由 `@lincyaw/design` 令牌与公共适配层负责。公共组件封装只组合现成行为和样式，不另写焦点循环、菜单键盘控制或文本编辑内核。

| 方案 | 已有公开能力 | 对本轮的取舍 |
|---|---|---|
| Ant Design | `ConfigProvider` 的全局与组件 Token、动态主题，见[官方主题文档](https://ant.design/docs/react/customize-theme/) | 能满足常规表单；迁移需要将现有令牌映射到另一套主题和控件接口。本轮已定位的问题在编辑事件、保存确认和草稿身份，替换表单库无法修复它们，因此暂不引入 |
| 字节 Semi Design | 全局及组件设计变量、定制主题与明暗主题，见[官方定制主题文档](https://semi.design/zh-CN/advanced/customize-theme) | 可以通过公开主题接口统一外观；本轮公共控件已有 Radix 行为，先完善这层接入，不并存第二套完整控件体系 |
| 现有 Radix Primitives | ARIA、焦点管理和键盘导航，见[官方可访问性文档](https://www.radix-ui.com/primitives/docs/overview/accessibility) | 沿用已经使用的公共封装，补齐密度、错误和加载状态；视觉仍由统一令牌提供 |

编辑回归也区分依赖缺陷与接入缺陷：原装 BlockNote 0.56 在 `onBeforeChange.getChanges()` 处理 Enter 的问题有独立复现，本轮通过公开事务接口规避。菜单被正文样式撑高、批注编号写进正文、撤消错用保存历史、旧确认清除新草稿均来自我们的适配，已在对应公共层修复。具体真实操作与能力边界见[文档编辑验证记录](benchmarks/document-authoring-2026-10-26.md)。

页面排序使用 `@dnd-kit/react` 与 `@dnd-kit/dom` 的公开接口，封装为 `PmSortableList`；正文块拖动仍由 BlockNote 负责。Figma [SortableItem](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=158-2823) 的 21 个变体覆盖三种密度及默认、悬停、焦点、选中、拖动、禁用和加载，[明暗矩阵](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=158-3034)展示对应实例。禁用和加载只阻止排序，不阻止作者选择另一页。错误使用已有 Notice；手势说明通过可访问描述提供。拖动柄交由 dnd kit 管理读屏关系时，IconButton 可通过公开属性关闭 Tooltip，其他调用保持默认行为。

## 5. 状态与行为合同

### 5.1 所有控件共有的状态

正式 Figma 组件与公共实现至少覆盖默认、悬停、按下、键盘焦点、选中、禁用、只读、错误和处理中等适用状态。状态可以组合，例如“选中＋焦点”和“错误＋焦点”；不能让后绘制的一态抹去另一态的含义。

| 状态 | 视觉与行为要求 |
|---|---|
| 默认 | 遵循公共表面、边框、文字与几何，不能凭页面主题临时改色 |
| 悬停／按下 | 表示可操作反馈；只在公共 CSS 中定义，触屏不依赖悬停找到入口 |
| 键盘焦点 | `:focus-visible` 有可辨认的焦点指示；普通输入使用强调边框与辅助柔和光圈，选中态仍可见；错误输入保留危险色边框，另加强调色实线焦点指示与辅助光圈，不让焦点抹去错误 |
| 选中／展开 | 根据控件设置 `aria-selected`、`aria-pressed` 或 `aria-expanded`，形状与颜色共同表达 |
| 禁用 | 不触发操作；保留可理解名称，必要时在附近说明原因；不能只降透明度或仅用 `aria-disabled` 代替事件拦截 |
| 只读 | 内容仍可选择和复制，与禁用区分；隐藏会误导用户的操作入口 |
| 错误 | 字段设置 `aria-invalid`，错误文字通过 `aria-describedby` 关联；使用 `--pm-color-danger` 与文字或错误图标，不只靠红边 |
| 处理中 | `aria-busy`，保持宽度和动作名称稳定，防止重复提交；可取消的任务提供独立取消操作，不禁用整份文稿 |

公共 CSS 已覆盖按钮、图标按钮、输入、菜单、错误字段和 loading 的适用状态。公共 loading 使用 `loading`（Lucide LoaderCircle），按钮包装负责 `aria-busy` 与重复提交拦截。处理中使用独立的状态图标位，不受调用方 Icon 或 Show icon 属性替换，动作名称和尺寸保持稳定；业务页面不得用转圈字符、私有 SVG 或自定义透明度填补。

Danger 动作默认使用危险色文字和浅色表面；悬停增加 1px 危险色内边界，按下使用现有 2px 描边令牌，不靠不断加深背景降低文字对比度。固定控件外尺寸与排版，焦点仍单独叠加。其余普通控件的 hover／pressed 使用既有 chrome／sunk 语义表面。上述状态由公共 CSS 定义，页面只选择公开属性。

### 5.2 按钮、输入与表单

常用导航和工具使用 IconButton。提交、删除确认、参数名称和需要说明含义的选项保留简短文字，避免非技术作者猜测图标。主操作采用现有 `primary` 的墨色背景与纸色文字；普通动作使用中性表面，危险动作使用危险语义。切换项以选中表面和状态标记表达，不通过把所有图标涂成主操作色制造层级。

输入字段始终有可访问名称，placeholder 仅作为样例。标签、说明、错误和单位属于同一 Field。错误出现不改变输入值，保存失败保留草稿。语速、时间、音量等数值字段使用公共数字输入或经过批准的组合，不通过页面私有输入框外观表达不同含义。

桌面属性栏与工具栏默认采用 compact；普通创建、导出和确认对话框可采用 regular，不将大表单的留白和整行卡片套到紧凑属性面板。播放顺序、配音时机等互斥参数采用横排 Segmented 或 Radio 选项，保留简短标签，不为每个选项单独占一张大卡片。开始与结束时间位于同一行，数值及单位使用短字段；长讲稿另占多行区域。窄屏先保证数字、单位和选项名称完整可读，再按完整字段折行，不压缩字体、截掉数值或挤小热区。

外壳断点固定为：1280 CSS px 及以上可采用三栏；768–1279 CSS px 默认将属性改为抽屉；768 CSS px 以下为单主区。桌面可用画布若低于 `--pm-canvas-min-width`（480px），先收起辅助面板和目录，不继续压缩画面；移动单主区按视口等比适配。抽屉基于动态视口与安全区布局，软键盘出现后输入、关闭和操作区仍可到达。中英文长标签和字体放大时允许换行、增高，不减小文字来硬塞。减少动态效果仅收敛界面过渡和忙碌动效，教学信息与暂停、分步入口仍须保留。

输入框默认采用 chrome 表面与 1px 的 line-strong 中性边框，无阴影、不常驻强调色。line 对 chrome 的对比度不足 3:1，只用于分隔等非交互边界，不能作为输入框唯一的可辨识边界；line-strong 对 chrome 在现有亮／暗令牌下分别约为 3.45:1／3.34:1。悬停不加粗或叠加常驻轮廓。普通聚焦使用 accent 实线边框和 `--pm-color-accent-line` 的辅助柔和光圈；该令牌为 30% accent 混合色，不能单独承担焦点指示。错误＋焦点保留 danger 边框，外侧叠加 accent 实线指示及辅助光圈，错误文字和 `aria-invalid` 同时保留。边框取 `--pm-size-hairline`，焦点指示与光圈宽度取 `--pm-space-px`。所有取值经第 3 节令牌进入公共控件，不在业务页面复写。

公共输入已按上述规则迁移；原生选择器展开后的系统列表仍受操作系统控制。

中文输入法组词期间不提交。焦点不因错误、自动保存或后台更新而跳走。禁用与只读不能互换，长文案和中英文切换不能压缩图标热区或裁掉输入内容。

属性中的单行 Enter 提交当前字段，多行 Enter 换行；组词确认键不提交。数值无效时保留编辑值和上次有效状态，错误就地显示。时间内部保留源精度，显示到毫秒不意味着每次保存都重新舍入；需要按视频帧对齐时由素材能力提供规则，并显示实际采用范围。

### 5.3 浮层、标签页与提示

Dialog 的正式默认行为是模态，必须有标题、说明关系和明确关闭操作；外部按下不关闭，`Esc` 和关闭按钮按公开规则处理，关闭后焦点回到触发器。打开时保留表单的显式 `autoFocus`；否则优先聚焦正文或页脚中的首个可用控件，通常是确认操作前的取消按钮。正文和页脚没有可用控件时沿用 Radix 默认焦点。非模态的步骤属性使用面板、Drawer 或 Popover，不靠 CSS 去掉遮罩伪装为非模态。存在未完成输入时的草稿保留由业务状态处理，不在每页重写焦点和键盘协议。

Menu 打开后聚焦可用项，方向键、首尾导航、选择后关闭、外部按下和 `Esc` 由 Radix 处理，焦点回到触发器。Tabs 由公共 Radix 封装管理方向键与面板关系；图标标签保持完整读屏名称。Tooltip 在悬停和聚焦时显示，不能承载唯一的错误、按钮可用原因或触屏必需功能；原生 `title` 不构成正式 Tooltip 验收。

Tooltip 的内容与定位层均不接收指针，不能挡住相邻控件。React `PmTooltip` 通过自己的 portal 容器传递这一行为，不选择依赖内部的定位节点。

工作台 `PmMenu` 的可选 `description` 在菜单内显示说明，并通过 `aria-describedby` 关联；它不占操作项或键盘停靠点。能力限制使用此说明，文字按公共菜单最大宽度换行，触屏也能直接阅读。页面导航按标题层级缩进；IR 首节的特殊 `depth: 0` 与一级标题同层显示。

工具栏每组只占一个 Tab 停靠点，方向键及 Home／End 移动组内焦点，Enter／Space 激活；内容／编排标签采用手动激活，不能仅移动焦点就切换工作区。Tooltip 悬停延迟 300ms，键盘聚焦立即显示，Esc 关闭；延迟属于公共组件行为常量，业务不各设一份。覆盖式窄屏 Drawer 为模态，桌面属性栏为非模态。Esc 每次只关闭最上层，关闭后归还触发器；触发器失效时回到有效页面或内容块入口。

现有 workbench Dialog 绘制 Overlay，而 host 的包装不同；历史架构文字中的“非模态”也不足以证明实现语义。实现迁移必须显式统一 `modal`、外部关闭与焦点策略，按源码实际行为验证，不能把该差异带入新页面。

## 6. 素材、字体与图标入库

产品素材与作者材料分开管理。品牌、空状态插画、公共示意图进入 `packages/design/src/assets/`；作者上传的 PDF、图片、音视频和 agent 生成素材保留在各项目自己的资源目录，经项目资源清单引用，由工作区服务管理，不发布进公共设计包，也不登记到 UI 静态素材清单。原型中的临时占位图不能直接成为发布素材。

公共素材使用稳定语义名，不能以页面名或下载序号命名。新增时必须登记用途、来源、作者或提供方、许可证及所需署名、允许的修改、原始文件、导出版本、Figma 节点和代码消费位置。本轮已新增 `packages/design/src/assets/manifest.json`，登记 Lucide 图标与三套 Fontsource 字体的来源、许可和引用入口；它是治理清单，不是新增运行时素材能力。自带的公共图片等素材需将许可证原文或明确许可引用登记到清单，必要时存入同目录 `licenses/`；字体仍沿用依赖与构建的许可分发流程。

可缩放的产品标志保留矢量原稿，栅格素材保留必要的分辨率和裁切说明。发布前检查实际使用文件被包清单纳入、离线可用、路径稳定且不存在未经许可再分发。没有使用权信息的材料不能提升为公共产品素材；用户提供的教学材料也不自动获得这种授权。

字体使用 `fonts.css` 已加载的 IBM Plex Sans、Source Serif 4、IBM Plex Mono 及其字重，中文遵循令牌中的系统字体回退。现有 Fontsource 字体采用 SIL OFL 1.1，沿用随包和产物的许可证分发；新增字体先检查授权与包体成本，不通过页面 CSS 从外部临时加载。

图标只使用 `icons.ts` 登记的 Lucide 语义名，Figma 与代码保持同一映射；保留依赖所需许可与版本记录。新增音量、裁切、素材等图标先登记公共名称，再供业务使用。禁止 emoji、Unicode 箭头、图片截图和业务私有 SVG 路径替代交互图标。图标尺寸由 CSS 令牌决定，描边风格在公共层统一。

## 7. Figma 与代码映射

功能线框用于确认入口、页面关系和状态范围。[Figma 第 02 页：正式控件规范](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=25-144)提供 Foundations 与 Components，规定字号、颜色、36／30／44 几何、圆角、间距和状态；组合示例使用这些组件实例。不能把全屏截图或一组不关联的矩形当作正式控件库。

本轮 regular 基础包含 4 组共 87 个变体：Button 30、IconButton 12、FieldControl 27、Choice 18，包含错误＋焦点、只读＋焦点和选中＋焦点。compact 单独建立 Button 30、IconButton 12、FieldControl 27；触屏输入另建 27 个状态。Timing 两种横排选项与 StatusChip 三种状态为领域组合服务，另有 Menu、Tabs、Tooltip、Range、Dialog 示例。已查看桌面与触屏的浅色、深色四种组合。Figma 中文使用 Noto Sans SC 表达代码中系统中文字体回退，拉丁字体采用 IBM Plex Sans；不要求 Web 额外下载中文字体。这些示例确定视觉方向，不表示公共层缺口或真实交互已经实现。完整节点映射与数量登记在 [figma-nodes.json](prototypes/workbench/figma-nodes.json) 的 `designSystem` 中。

桌面工作台使用独立的 `Compact` 组件集，复用同一套颜色、边框、图标和状态语义；regular 保留用于普通对话框。主题通过变量模式处理，不再展开变体；密度独立分集，每集不超过 30 个变体。Figma 的 compact 与触屏实例已经建立，运行中的公共组件仍需按缺口表迁移。

[第 03 页交互状态](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=40-4645)将 12 组已确定规则落实为 30 个 UI 状态，分别展示保存、版本与冲突、页面及引用、步骤与时序、配音、字幕、agent 审阅、媒体、放映、导出、焦点和响应式。规则使用 I01–I12 稳定编号，与 [interactions.json](prototypes/workbench/interactions.json) 和 RFC 对齐；技术能力的实现门槛放在画板注释中，不伪装成已可用按钮。

I01 的[正文与字幕草稿恢复组合](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=241-843)复用 `PmNotice`、`PmSelect` 和 `PmButton`，登记未选择、已选择与备份写入失败状态。候选不默认选中；恢复前保留当前输入并确认新副本已提交，丢弃只作用于所选快照。coarse 适配保留 compact 按钮字号并扩至 44 热区，输入使用 44/16；显式 Touch 变体不变。验证见[持久草稿记录](benchmarks/document-durable-drafts-2026-10-27.md)。

| Figma 内容 | 对应代码 |
|---|---|
| 亮／暗变量、字体、间距、圆角、尺寸、动效 | `tokens.css` 与颜色 `tokens.ts`，使用同一语义名 |
| Button、IconButton、Field、Input、Textarea、Select | `components.css`＋相应 workbench／host 公开封装 |
| Dialog、Menu、Tabs、Tooltip、Popover、Drawer、SearchList | 公共 Radix 封装与 `pm-ui-*`，标明行为与待补能力 |
| 图标实例 | `icons.ts` 中的语义名和 Lucide 来源 |
| 公共插画与品牌素材 | 公共素材清单、原始文件及发布导出 |
| 内容／编排／素材／任务屏幕 | 业务组合与布局，不另定义控件样式 |

每个正式组件必须标识公开组件名、变体、密度、状态、文本和图标属性、对应令牌、键盘与焦点要求、代码入口，以及“已实现／待补齐”。Figma 中的属性不能在代码里被各页解释成不同的 CSS。新增变体先在组件区定义，更新映射后再使用于功能屏幕。

Control、Float、Page 阴影均登记为 Light／Dark 效果样式对，取自 `tokens.css` 的 `--pm-shadow`、`--pm-shadow-float` 和 `--pm-shadow-page`；代码由主题自动选择，Figma 实例选用对应效果样式，不给每个状态再增加主题变体。停止运行中任务的确认框使用同一 Dialog 组件，明确“继续任务／停止任务”及已完成结果保留规则，不复制一套私有弹窗样式。

Figma 与 CSS 按物理含义映射单位：禁用透明度在 Figma 的绑定变量中为 55%，CSS `--pm-opacity-disabled` 为 0.55；不能将 Figma 百分数再次直接写成 CSS opacity。几何以默认根字号下的 CSS px 对照 rem，最终仍引用 CSS 令牌。

Web 面向非技术作者，组件名称、令牌名和映射说明只属于设计交付，不进入产品日常界面。Tauri 复用同一套组件；VS Code 的原生编辑器保留宿主交互，预览和导出面板采用相同语义及可用的设计资产，不强行覆盖 VS Code 自身控件。

## 8. 变更、检查与遗留迁移

1. 从功能原型列出需要的控件和状态，查找已有公开能力。
2. 缺少取值先改令牌，缺少交互先改公共封装；涉及颜色同步 `tokens.ts`。
3. 在 Figma 组件区定义变体与状态，并记录映射和待实现项。
4. 完成公共控件后再组合页面；同类页面直接复用，不复制已完成页面的私有 CSS。
5. 真实查看浅色／深色与桌面／768 px 以下四种组合，并检查键盘、触屏、长文字和错误状态。
6. 运行本次涉及的轻量结构检查，记录实际通过和未验证范围，再更新组件与素材登记。

已有 `scripts/check-tokens.mjs` 检查受管 CSS 中的原始颜色、px 和时长；它不检查所有 rem、任意业务覆盖、组件内数字、缺少错误语义或实际视觉质量。不能把 `tokens ok` 当作完整设计验收。触及公共图标和组件分层时运行相关 `check-layering.mjs`，改指令、流程或技能时运行 `check-skills.mjs`；公开包变更按发布规则检查。日常不新增或运行测试套件，遵循根目录 `AGENTS.md`。

遗留样式按触及范围迁移：先把缺少的语义值与状态收进公共层，再替换本次改动涉及页面的重复控件样式。不能在旧 CSS 上继续叠加新覆盖，也不能一次性重置无关页面。对尚未迁移部分登记来源、影响范围与替换条件，明确不属于正式验收完成项。

## 9. 实施边界与待迁移项

核心控件的当前入口见第 4 节。页面迁移记录与真实运行结果见 [UI/UX RFC 的实施状态](rfc-workbench-uiux.md#101-当前实施状态)；组件存在不表示所有功能页面已经完成迁移。

| 待完成范围 | 后续实施要求 |
|---|---|
| 仍使用私有工具按钮或旧输入的业务区域 | 迁入第 4 节公共包装，删除对应控件外观覆盖，只保留布局 |
| host 的输入包装与领域控件 | 按实际使用补公开属性与字段关系，不让插件依赖 workbench |
| 音色搜索、试听、媒体时间与波形 | 先验证服务能力，再补公共选择弹层和领域控件；原型状态不能代替底层能力 |
| Checkbox／Switch | 在实际使用前补齐适用状态与可访问关系，不在业务页手写控件 |
| 新插画、品牌或其他公共素材 | 按第 6 节登记来源、许可、文件和消费位置 |
| Figma 其余功能屏幕与领域组件 | 使用核心组件组合，补齐独立交互状态与映射后再实施 |

每次迁移仍须提交公共层变更、Figma 映射和实际验证范围。结构检查只确认受管规则，视觉验收按第 8 节执行。
