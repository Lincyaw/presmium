# Presmium 控件与视觉规范

本文规定视觉取值放在哪里、公共控件有哪些、控件的状态与行为，以及素材入库和检查方式。工作台的功能与信息架构见 [工作台](studio.md)，界面用词见 [界面术语与文案规范](glossary.md)。线框只表达流程，不作为视觉验收。

## 1. 唯一来源与文件职责

代码中的视觉取值只来自 `@lincyaw/design`。Figma 用同名变量与组件表达同一套设计，两者不一致时修正公共层，不由页面各自解释。

| 文件 | 职责 |
|---|---|
| `packages/design/src/tokens.css` | 颜色、字体、字号、行高、间距、尺寸、圆角、阴影、时长、层级与外壳几何的令牌 |
| `packages/design/src/tokens.ts` | 颜色令牌名 `COLORS`、`colorToken`、`color`；新增颜色与 CSS 同步，不存第二份数值 |
| `packages/design/src/components.css` | `pm-ui-*` 控件的外观、密度与状态 |
| `packages/design/src/typography.css` | 标题与正文的换行规则（第 5.4 节） |
| `packages/design/src/fonts.css` | 随包字体的加载入口 |
| `packages/design/src/icons.ts` | Lucide 图标的语义名 |
| `packages/design/src/assets/` | 品牌标志 `brandMarkup()`、小猫精灵图 `mountMascot`，来源登记在 `manifest.json` |
| `packages/design/src/design.css` | 字体、令牌与控件样式的装配入口 |
| `packages/workbench/src/components.tsx` | 工作台的公共 React 控件 |
| `packages/host/src/design/components.ts` | 产物与插件使用的公共 React 控件 |
| 业务 CSS（`packages/workbench/src`、`packages/dsh/src/client` 等） | 只负责网格、分栏、对齐、滚动、响应式与区域间距 |

`@lincyaw/design` 与框架无关。React 封装分别留在 workbench 与 host：workbench 不引用 host，插件不引用 workbench。两边共用令牌、图标名、`pm-ui-*` 类和交互规则。

## 2. 令牌规则

- 组件与界面的 CSS 不写原始颜色（十六进制、`rgb()` 等）、px、ms 与 s。px 只出现在 `@media` 断点中。没有合适的令牌时先在 `tokens.css` 加一个。
- 颜色混合、控件与图标尺寸、栏高与窗格宽、圆角、阴影、时长都引用令牌。React 组件中图标与标志的大小由 CSS 尺寸令牌决定，组件里不写数字。
- 亮色在 `:root`，暗色在 `:root.dark` 只覆盖颜色与阴影；几何、字体层级与热区不变。业务组件不提供自己的暗色取值。
- 悬停、按下、禁用透明度取语义令牌（`--pm-color-primary-hover`、`--pm-color-primary-pressed`、`--pm-color-accent-hover`、`--pm-color-accent-pressed`、`--pm-opacity-disabled`），页面不另写比例。
- 嵌套形状间隙小于 2rem 时内层圆角等于外层减间隙，差值不大于 2px 时内层保留自己的圆角。成对取值写成令牌（`--pm-radius-control-inset`、`--pm-radius-menu-item`）或 `calc()`。

控件密度：

| 密度 | 用途 | 单行最小高度 | 文字 |
|---|---|---|---|
| compact | 桌面属性栏、工具栏、播放与时间参数、互斥选项 | `--pm-size-tool`（30 px） | `--pm-text-sm`（13 px） |
| regular | 创建、导出、确认等对话框 | `--pm-control-height`（36 px） | `--pm-text-sm`／`--pm-text-md` |
| touch | 粗指针设备上的以上两类 | 热区 `--pm-control-hit-area`（44 px） | 输入 `--pm-text-lg`（16 px） |

粗指针设备由公共媒体查询补足热区与输入字号。内容换行或字号放大时控件增高，不裁切文字。常用取值：

| 用途 | 令牌 |
|---|---|
| 界面文字 | `--pm-font-sans`、`--pm-text-md`、`--pm-leading-ui` |
| 阅读正文与教学代码 | `--pm-font-serif`、`--pm-text-reading`、`--pm-leading-reading`；代码 `--pm-font-mono` |
| 图标 | `--pm-size-icon`、`--pm-size-icon-sm`、`--pm-size-icon-lg` |
| 短数值与时间字段 | `--pm-control-number-width`、`--pm-control-time-width` |
| 间距 | 组内 `--pm-space-1`／`--pm-space-2`，组间 `--pm-space-3`，标签与输入 `--pm-space-1` |
| 边框与圆角 | `--pm-size-hairline`、`--pm-radius-control`、`--pm-radius-small` |
| 输入表面 | `--pm-color-chrome` 表面、`--pm-color-line-strong` 边框；`--pm-color-line` 只用于非交互分隔 |
| 焦点 | `--pm-color-accent` 边框加 `--pm-color-accent-line` 光圈，宽度 `--pm-space-px` |
| 选中 | `--pm-color-selected` 或 `--pm-color-accent-soft`，配合形状标记 |
| 浮层 | `--pm-shadow-float`、`--pm-z-popover`、`--pm-z-dialog`、`--pm-z-tooltip` |
| 时长 | `--pm-duration-fast`、`--pm-duration`、`--pm-duration-slow`、`--pm-ease`；循环 `--pm-duration-spin`、`--pm-duration-pulse` |

外壳断点：1280 px 及以上三栏；768 到 1279 px 属性改为抽屉；768 px 以下单主区。可用画布低于 `--pm-canvas-min-width` 时先收起辅助面板。

## 3. 公共控件目录

先用已有控件的公开属性；能力不足时先扩展公共层（并补 Figma 变体），再组合页面。业务层不另写按钮、输入框、菜单、分段控件、标签页、提示、遮罩或焦点循环，也不通过后代选择器、业务类、内联样式、`!important` 或重定义令牌改写控件外观。

| 控件 | 入口 | 要点 |
|---|---|---|
| Button | `PmButton`（workbench、host），`pm-ui-button` | 变体 `default`、`primary`、`accent`、`ghost`、`danger`；`density`、`loading` 带 `aria-busy` 与重复提交拦截 |
| IconButton | `PmIconButton`（workbench、host） | 必有 `label`；`hint`、`shortcut` 经 Tooltip 显示 |
| Tooltip | `PmTooltip`（Radix） | 悬停延迟后显示，键盘聚焦立即显示；不接收指针，不承载唯一信息 |
| Toolbar | `PmToolbar`、`PmToolbarButton`（workbench），`pm-ui-toolbar` | 方向键在组内移动 |
| Field、Input、Textarea、Select | workbench `PmField`、`PmInput`、`PmTextarea`、`PmSelect`；host 用 `PmField` 加 `pm-ui-input` 等类 | 标签、说明、错误、单位同属一个 Field；`PmInput` 有前图标、后缀、`width="number"`／`"time"`；`PmTextarea` 有 `autoGrow` |
| ChoiceSelect | `PmChoiceSelect`（workbench） | 带说明的单选下拉 |
| SearchList | `PmSearchList`（workbench，Radix Radio Group） | 搜索、结果计数、单选、空／加载／错误／禁用；过滤不改写所选值 |
| WorkspaceSwitcher | `PmWorkspaceSwitcher`（workbench） | 工作区搜索、切换与新建 |
| Segmented | `PmSegmented`（Radix Radio Group） | 横排互斥参数，不代替导航 |
| Tabs | `PmTabs`、`PmTabPanel`（Radix） | 方向键移焦，确认后激活 |
| Dialog | `PmDialog`（Radix） | 模态，见第 4.3 节 |
| Drawer | `PmDrawer`（host） | 侧抽屉 |
| Popover | `PmPopover`（workbench、host） | 非模态浮层，共用 `pm-ui-popover` |
| Menu | `PmMenu`（Radix Dropdown Menu） | 图标、危险项、禁用项、快捷键、分隔、勾选；workbench 的 `description` 与 `toolbarItem` |
| Badge、Card | `PmBadge`（`tone`）、`PmCard`（`default`、`interactive`、`dashed`） | |
| Notice、Empty、Skeleton | `PmNotice`、`PmEmpty`、`PmSkeleton`（`document`、`list`、`preview`） | 见第 4.5 节 |
| Range | `PmRange`（workbench，原生 range） | 拖动先本地预览，释放时提交一次；`Esc`、失焦丢弃手势 |
| Timeline | `PmTimeline`（workbench） | 画面、配音、字幕三轨与稳定步骤身份；未知或估算时长不开放任意定位；只有真实样本才画波形；缩放只改视图 |
| Split panes | workbench `PmSplitGroup`、`PmSplitPanel`、`PmSplitHandle` | 通过 react-resizable-panels 公开接口实现双轴调整、键盘与双击恢复；隐藏与后台挂载由公共适配处理 |
| SortableList | `PmSortableList`（workbench，dnd kit） | 按稳定 ID 提交一次移动；禁用排序不禁止选择 |
| SchemaForm | `PmSchemaForm`（workbench，RJSF） | 用公共控件渲染组件参数；只显示声明的字段，未声明数据原样保留 |
| Caption | `PmCaption`、`PmCaptionProvider`（host），`caption.css` | 放映字幕浮层，超长在安全区内滚动，不改变画布布局 |
| Mascot | `PmMascot`（workbench）、`mountMascot`（design） | 装饰，读屏忽略；尺寸 `--pm-size-mascot`；减少动态效果时停在首帧；作者可在设置中隐藏 |
| 领域控件 | workbench 的 `NarrationEditor`、`MediaClipEditor`、`DocumentBlockPreview` | 组合以上控件；领域数据只决定内容，边界、焦点与热区遵循本规范 |
| 编辑器适配 | `pm-ui-block-editor` | 通过 BlockNote 的公开类（`.bn-side-menu`、`.bn-formatting-toolbar`、`.bn-suggestion-menu`、`.bn-thread`）适配热区与令牌 |

Checkbox、Radio、Switch 只有 `pm-ui-checkbox` 的基础着色；首次使用前先在公共层补齐状态与可访问关系。复杂选择（音色、素材）用 SearchList 放在 Dialog、Drawer 或 Popover 中，不用原生下拉列表。

## 4. 状态与行为合同

### 4.1 共有状态

| 状态 | 要求 |
|---|---|
| 悬停、按下 | 只在公共 CSS 定义；按下 `--pm-color-pressed` 比悬停 `--pm-color-hover` 深一级；触屏不依赖悬停找入口 |
| 键盘焦点 | `:focus-visible` 可辨认；错误加焦点时保留危险色边框，另叠强调色指示 |
| 选中、展开 | `aria-selected`、`aria-pressed` 或 `aria-expanded`，形状与颜色共同表达，与焦点分开 |
| 禁用 | 拦截事件，保留名称，必要时就近说明原因 |
| 只读 | 内容可选择复制，与禁用区分 |
| 错误 | `aria-invalid`，错误文字经 `aria-describedby` 关联；危险色加文字或图标 |
| 处理中 | `aria-busy`，宽度与动作名称不变，防重复提交；可取消任务另给取消操作 |

状态可以组合（选中加焦点、错误加焦点），后绘制的状态不抹去前一个的含义。

### 4.2 按钮、输入与表单

- 常用导航和工具用 IconButton；提交、删除确认和需要说明含义的选项用文字。主操作用 `primary`，危险动作用 `danger`。
- 输入字段必有可访问名称，placeholder 只作样例。错误不改写输入值，保存失败保留草稿。
- 单行 Enter 提交当前字段，多行 Enter 换行；输入法组词期间不提交。焦点不因错误、自动保存或后台更新跳走。
- 起止时间同一行；长讲稿独占多行区域。窄屏先保证数值、单位和选项名称完整，再整字段折行。

### 4.3 浮层

- Dialog 模态，有标题、说明与关闭操作；外部按下不关闭，`Esc` 关闭，关闭后焦点回到触发器。打开时聚焦显式 `autoFocus` 的字段，否则聚焦首个可用控件。
- 非模态的属性编辑用面板、Drawer 或 Popover。
- Menu 打开后聚焦首个可用项，方向键、首尾、选择后关闭与焦点归还由 Radix 管理。
- 不用 `window.alert`、`window.confirm`、`prompt`；确认用 `PmDialog`。原生 `title` 不算 Tooltip。

### 4.4 换行

`typography.css` 用零特异度的 `:where()` 规则：标题与 `pm-ui-*__title` 用 `text-wrap: balance`；段落、列表、`pm-ui-notice`、`pm-ui-tooltip`、字幕行用 `text-wrap: pretty`；`pre`、`code`、表格单元格、输入与按钮保持默认。

### 4.5 加载、空与错误

- 已知内容形状的加载用 `PmSkeleton`，不用转圈；转圈 `loading` 只用于不知道结果形状的动作。
- 空面板用 `PmEmpty` 说明这里会出现什么、怎样产生第一项。
- 错误就地显示在字段或区域（`PmNotice`、字段错误），说明什么失败、输入是否保留、下一步做什么，并给出重试。
- 系统消息的写法见 [界面术语与文案规范](glossary.md)。

### 4.6 动效

只动画 `transform` 与 `opacity`；颜色过渡可以保留。不动画 `top`、`left`、`width`、`height`、`margin`、`padding`、边框宽度、字号或 `all`。时长令牌在 `prefers-reduced-motion: reduce` 下为 0，循环动画在同一查询中设为 `animation: none`。

## 5. 素材、字体与图标

- 产品素材（品牌、公共插画、示意图）进入 `packages/design/src/assets/`，用语义名，在 `manifest.json` 登记用途、来源、原始文件与代码消费位置；矢量标志保留原稿。作者上传或生成的素材留在各项目的资源目录，由工作区服务管理，不进入设计包。
- 字体只用 `fonts.css` 加载的 IBM Plex Sans、Source Serif 4、IBM Plex Mono；中文用令牌中的系统字体回退。不从页面 CSS 临时加载外部字体。
- 图标只用 `icons.ts` 登记的 Lucide 语义名，新图标先登记名称。不用 emoji、Unicode 箭头、截图或业务私有 SVG 代替交互图标。

## 6. Figma 与代码映射

Figma 文件 [Presmium 工作台](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8) 的 Foundations 与 Components 页是正式控件库，节点登记在 `docs/figma-nodes.json`。

| Figma | 代码 |
|---|---|
| 亮暗变量、字体、间距、圆角、尺寸、时长、阴影效果样式 | `tokens.css`、`tokens.ts`，同一语义名 |
| 控件组件集（按密度分集，主题用变量模式） | `components.css` 加 workbench／host 的 `Pm*` 封装 |
| 图标实例 | `icons.ts` |
| 品牌与插画 | `assets/` 与 `manifest.json` |
| 功能屏幕 | 业务布局，不定义控件样式 |

单位按物理含义换算：Figma 的 55% 透明度对应 `--pm-opacity-disabled: 0.55`；几何按默认根字号把 px 对照到 rem 令牌。新变体先在 Figma 组件区定义，再进入代码与功能屏幕。

## 7. 变更与检查

1. 列出需要的控件与状态，查已有公开能力。
2. 缺取值先改令牌（颜色同步 `tokens.ts`），缺交互先改公共封装，并补 Figma 变体。
3. 组合页面；同类页面复用公共控件，不复制别页的私有 CSS。
4. 在亮色与暗色、桌面与 768 px 以下的四种组合中实看，检查键盘、触屏、长文字与错误状态。
5. 运行相关结构检查。

`scripts/check-tokens.mjs` 检查受管样式（工作台、studio 外框、设计包等，范围写在脚本的 `SCOPE`）中的原始颜色、px、时长，以及过渡与 `@keyframes` 中的布局属性。它不检查视觉质量，通过不等于验收。遗留样式在被改动时迁入公共层，并加入检查范围。

## 停靠编辑器与语音设置

停靠区域组合 `PmPanelHeader`、`PmTabs variant="dock"`、`PmTabPanel keepMounted` 与 `PmToolbar scroll`；`PmInput`／`PmSelect` 的 `labelHidden` 保留可访问名称。`PmSearchList` 的两行选项自动高度，标题省略并保留完整 title。

`PmTimeline variant="editor"` 去掉卡片外框，位置、时长和缩放共用一行；轨道文字 12px，刻度与时长 11px，轨高 28px，间距 4px，均由令牌定义。已有步骤导航时传 `showSteps=false`。布局和缩放不写入文稿。

语音服务设置组合现有 Header、Card、Field、密码 Input、Badge、Notice、Button 与清除 Dialog。只有 API Key 输入；加载、未配置、已配置但未验证、保存中、失败与冲突均有状态。保存后清空输入，已保存值只由占位文字表示。

Figma：[PanelHeader](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=313-7410)、[DockedTabs](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=313-7432)、[SplitHandle](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=308-7391)。Timeline 的 `Layout=Editor` 提供 Compact 下的 Ready／Focus／Estimated／Unknown／Loading／Disabled 六态。
