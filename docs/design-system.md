# Presmium 控件与视觉实现规范

状态：正式实现约束，公共层补齐项待实现。更新日期：2026-10-25。

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

## 2. Tokens、公共控件与业务布局

实现按三层进行：令牌定义视觉取值，公共控件定义形态和交互，业务区域只负责组合。新增需求先检查已有控件的公开属性；能力不足时先扩展公共层，再让页面使用。

业务 CSS 允许定义网格、分栏、对齐、容器宽度、内容溢出和使用令牌的区域间距。布局最好落在控件外的容器上。禁止通过后代选择器、附加业务类、内联样式、`!important` 或重新定义全局令牌，改变某页按钮或输入框的外观。控件自身的大小、强调等级和状态由公开属性选择。

业务层不得新增另一套按钮、输入框、菜单、分段控件、标签页、提示浮层、遮罩或焦点循环。表单未有专用 React 包装时，暂用 `PmField` 配合已经定义的 `pm-ui-input`、`pm-ui-textarea`、`pm-ui-select`；公共包装补齐后统一迁入。不得以“暂用原生控件”为由省略共用类、标签和错误关联。

时间输入、播放头、音色项和素材选择等领域控件也需作为 workbench 内可复用组件规定状态与外观，不因它们具有业务名称就豁免公共设计。波形和时间片段的内容可由领域数据绘制，其控件边界、选择、焦点和热区仍遵循本规范。

## 3. 已有令牌与正式取用规则

本节区分已有令牌、本轮新增令牌和待迁移控件。桌面工作台采用剪辑工具的紧凑操作密度：属性栏与工具栏默认使用 compact，单行控件最小高度 30 CSS px，标签和值为 13 CSS px；普通创建、导出等对话框可使用 regular 的 36 CSS px。触屏有效热区至少为 44 CSS px，输入文字使用 16 CSS px，不将触屏输入强塞进桌面紧凑高度。内容换行或字号放大时允许控件增高，不裁切文字。新增几何与图标令牌已经登记到 `tokens.css`，但当前控件 CSS 仍存在硬编码 rem、透明度和行为差异，不能据此宣称现状已全部符合。

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

当前 `components.css` 的常规按钮和单行输入仍以 2rem 作为最小高度，`--pm-size-touch` 为 2.5rem；这分别是 32px 和 40px，不能标为已经符合正式 compact 30px／regular 36px／触屏 44px 目标。现有小按钮的私有几何也不自动等于正式 compact。新增令牌本身不意味着旧控件已经迁移，公共层必须再按控件完成替换与实际检查。本文件不把尚未落地的样式当作已完成行为。

控件密度、禁用透明度与主操作状态已登记目标令牌，其余字重和忙碌占位仍需在公共层补齐。禁用透明度取 `--pm-opacity-disabled`；primary 与 accent 的悬停／按下分别使用 `--pm-color-primary-hover`、`--pm-color-primary-pressed`、`--pm-color-accent-hover`、`--pm-color-accent-pressed`。它们以现有语义颜色混合，明暗模式自动解析，不能在页面另写比例。禁止在页面中各选一组数字，不为每个面板新增尺寸名称。

亮色用 `:root`，暗色仅在 `:root.dark` 覆盖颜色与阴影；几何、字体层级和热区保持一致。业务组件不各自提供暗色取值。CSS 不写原始颜色、px 或时长值；px 仅允许用于媒体查询断点，取值进入 `tokens.css` 后再供控件使用。

## 4. 公共控件目录

下表同时区分已有入口与待补齐能力。带“待新增”的名字是目标公共接口，不是当前可直接导入的组件。

| 控件 | 已有入口 | 正式实现要求与补齐项 |
|---|---|---|
| Button | workbench、host 的 `PmButton`，`pm-ui-button` | 保留 `default`、`primary`、`accent`、`ghost`、`danger`；统一常规／紧凑密度，补公共 loading 行为与占位 |
| IconButton | workbench、host 的 `PmIconButton`，`pm-ui-icon-button` | 用于图标优先的工具栏；名称、提示、快捷键、选中与展开状态一致；工作台目前只有原生 `title`，需要补正式 Tooltip |
| Input | `PmField`＋原生输入及 `pm-ui-input`；`PmInput` 待新增 | 公共包装统一 label、说明、错误、只读、禁用、前后图标和尺寸，业务不自写装饰边框 |
| Textarea | `PmField`＋`pm-ui-textarea`；`PmTextarea` 待新增 | 使用统一多行尺寸、字符状态、错误关系和自动增高规则；不能将 placeholder 当作唯一标签 |
| Select | `PmField`＋`pm-ui-select`；`PmSelect` 待新增 | 简单选项可用已着色的原生 select；音色等复杂选择使用公共可搜索弹层，不能每页手写下拉交互 |
| Dialog | workbench、host 的 `PmDialog`，Radix Dialog | 正式统一模态语义、标题、说明、关闭与操作区、焦点归还和忙碌状态；不能靠是否绘制遮罩判断模态 |
| Menu | workbench、host 的 `PmMenu`，Radix Dropdown Menu | 统一图标、危险项、禁用项、快捷键、分组与选中态；补齐的项先进入公开 API |
| Tabs | host 的 `PmTabs` 与 `pm-ui-tab`；workbench 的对应公共封装待补齐 | 统一标签页与图标标签页，不在业务中手写方向键；现有 host 渲染尚未使用 `Choice.icon`，图标优先模式需公共层补齐 |
| Tooltip | host `PmIconButton.hint` 已封装 Radix Tooltip；`pm-ui-tooltip` 已有 | workbench 补对应公共能力；单独 `PmTooltip` 尚未导出，不能假设存在；提示包含名称及快捷键 |
| Segmented | host `PmSegmented`、`pm-ui-segmented` | 仅表示同一参数的互斥选项，不代替工作区导航；图标选项、名称和选中语义需一致 |
| Popover／Drawer | host 的 `PmPopover`、`PmDrawer` 与共用 CSS | 依据任务使用浮层或侧抽屉；workbench 需要时走公开公共封装，不引用 host 或复制私有实现 |
| Field／Notice／Empty | `PmField`、`PmNotice`、`PmEmpty` | 同一位置展示字段说明、错误和恢复入口，不把所有状态写成页面私有提示卡 |
| Checkbox／Radio／Switch／Range | 现有 `pm-ui-checkbox` 仅提供部分基础着色，其余公共能力待补齐 | 在使用前规定选择、焦点、禁用、数值和错误状态；时间、语速和音量不能各自实现一套滑杆 |

原生选择器的展开列表可能由操作系统绘制，不能把这种差异当作已完成统一视觉。音色选择使用公共可搜索弹层，组合搜索、语言筛选、共享列表项、试听与选中态；桌面可使用 Popover，空间不足时使用公共 Dialog 或 Drawer。素材等复杂选择复用同一类公共能力，在 Figma 单独规定相关状态，不能退回每页自绘的下拉列表。

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

当前 CSS 对 Button 已有禁用规则，但 IconButton、输入、菜单禁用项、错误字段和 loading 尚未覆盖一致的公开状态。公共图标已登记 `loading`（Lucide LoaderCircle），统一 loading API、动效和提交拦截仍需补齐。处理中使用独立的状态图标位，不受调用方 Icon 或 Show icon 属性替换，动作名称和尺寸保持稳定；业务页面不得用转圈字符、私有 SVG 或自定义透明度填补。

Danger 动作默认使用危险色文字和浅色表面；悬停增加 1px 危险色内边界，按下使用现有 2px 描边令牌，不靠不断加深背景降低文字对比度。固定控件外尺寸与排版，焦点仍单独叠加。其余普通控件的 hover／pressed 使用既有 chrome／sunk 语义表面。以上为公共层迁移目标，不能把当前 CSS 的遗留取值视为新状态规范。

### 5.2 按钮、输入与表单

常用导航和工具使用 IconButton。提交、删除确认、参数名称和需要说明含义的选项保留简短文字，避免非技术作者猜测图标。主操作采用现有 `primary` 的墨色背景与纸色文字；普通动作使用中性表面，危险动作使用危险语义。切换项以选中表面和状态标记表达，不通过把所有图标涂成主操作色制造层级。

输入字段始终有可访问名称，placeholder 仅作为样例。标签、说明、错误和单位属于同一 Field。错误出现不改变输入值，保存失败保留草稿。语速、时间、音量等数值字段使用公共数字输入或经过批准的组合，不通过页面私有输入框外观表达不同含义。

桌面属性栏与工具栏默认采用 compact；普通创建、导出和确认对话框可采用 regular，不将大表单的留白和整行卡片套到紧凑属性面板。播放顺序、配音时机等互斥参数采用横排 Segmented 或 Radio 选项，保留简短标签，不为每个选项单独占一张大卡片。开始与结束时间位于同一行，数值及单位使用短字段；长讲稿另占多行区域。窄屏先保证数字、单位和选项名称完整可读，再按完整字段折行，不压缩字体、截掉数值或挤小热区。

外壳断点固定为：1280 CSS px 及以上可采用三栏；768–1279 CSS px 默认将属性改为抽屉；768 CSS px 以下为单主区。桌面可用画布若低于 `--pm-canvas-min-width`（480px），先收起辅助面板和目录，不继续压缩画面；移动单主区按视口等比适配。抽屉基于动态视口与安全区布局，软键盘出现后输入、关闭和操作区仍可到达。中英文长标签和字体放大时允许换行、增高，不减小文字来硬塞。减少动态效果仅收敛界面过渡和忙碌动效，教学信息与暂停、分步入口仍须保留。

输入框默认采用 chrome 表面与 1px 的 line-strong 中性边框，无阴影、不常驻强调色。line 对 chrome 的对比度不足 3:1，只用于分隔等非交互边界，不能作为输入框唯一的可辨识边界；line-strong 对 chrome 在现有亮／暗令牌下分别约为 3.45:1／3.34:1。悬停不加粗或叠加常驻轮廓。普通聚焦使用 accent 实线边框和 `--pm-color-accent-line` 的辅助柔和光圈；该令牌为 30% accent 混合色，不能单独承担焦点指示。错误＋焦点保留 danger 边框，外侧叠加 accent 实线指示及辅助光圈，错误文字和 `aria-invalid` 同时保留。边框取 `--pm-size-hairline`，焦点指示与光圈宽度取 `--pm-space-px`。所有取值经第 3 节令牌进入公共控件，不在业务页面复写。

当前公共 CSS 的输入边框已经使用 line-strong，但表面、密度和焦点仍不等于以上完整目标；此处固定正式设计，不宣称现有代码已经迁移。

中文输入法组词期间不提交。焦点不因错误、自动保存或后台更新而跳走。禁用与只读不能互换，长文案和中英文切换不能压缩图标热区或裁掉输入内容。

属性中的单行 Enter 提交当前字段，多行 Enter 换行；组词确认键不提交。数值无效时保留编辑值和上次有效状态，错误就地显示。时间内部保留源精度，显示到毫秒不意味着每次保存都重新舍入；需要按视频帧对齐时由素材能力提供规则，并显示实际采用范围。

### 5.3 浮层、标签页与提示

Dialog 的正式默认行为是模态，必须有标题、说明关系和明确关闭操作；外部按下不关闭，`Esc` 和关闭按钮按公开规则处理，关闭后焦点回到触发器。非模态的步骤属性使用面板、Drawer 或 Popover，不靠 CSS 去掉遮罩伪装为非模态。存在未完成输入时的草稿保留由业务状态处理，不在每页重写焦点和键盘协议。

Menu 打开后聚焦可用项，方向键、首尾导航、选择后关闭、外部按下和 `Esc` 由 Radix 处理，焦点回到触发器。Tabs 由公共 Radix 封装管理方向键与面板关系；图标标签保持完整读屏名称。Tooltip 在悬停和聚焦时显示，不能承载唯一的错误、按钮可用原因或触屏必需功能；原生 `title` 不构成正式 Tooltip 验收。

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

| Figma 内容 | 对应代码 |
|---|---|
| 亮／暗变量、字体、间距、圆角、尺寸、动效 | `tokens.css` 与颜色 `tokens.ts`，使用同一语义名 |
| Button、IconButton、Field、Input、Textarea、Select | `components.css`＋相应 workbench／host 公开封装 |
| Dialog、Menu、Tabs、Tooltip、Popover、Drawer | 公共 Radix 封装与 `pm-ui-*`，标明行为与待补能力 |
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

## 9. 当前需要公共层补齐的能力

| 缺口 | 实施前要求 |
|---|---|
| 控件密度与几何仍有硬编码 rem | 桌面属性栏与工具栏迁为 compact 30px／13px；普通对话框采用 regular 36px；复用既有令牌，不能沿用私有 small 几何冒充 compact |
| 触屏热区现值不足以保证 44 CSS px | 迁入 `--pm-control-hit-area` 的正式 44px 热区，输入文字取 `--pm-text-lg`，保留紧凑图形 |
| 输入表面、焦点与错误叠加未统一 | 公共层落实 chrome＋1px line-strong 默认边界，以及普通 focus 和错误＋focus 的独立状态；业务不覆写 |
| 输入、错误与说明缺少统一 React 包装 | 补 Input／Textarea／Select 的公开属性和 Field 关联 |
| workbench 缺 Tooltip、Tabs 等对应公共能力 | 在正确分层补 Radix 封装，不从业务页或 host 私有实现复制 |
| workbench IconButton 仍依赖原生 title | 统一 hover／focus 提示、快捷键和触屏可发现入口 |
| loading、禁用与错误状态不完整 | 定义 API、语义和视觉状态，覆盖所有适用控件 |
| 部分 workbench 图标仍传尺寸数字 | 迁移到 CSS 令牌与公共密度，页面不再控制数字尺寸 |
| Dialog 实现与历史说明不一致 | 统一模态、外部关闭和焦点协议，并更新相关说明 |
| 本轮素材清单只登记现有图标和字体 | 后续 UI 素材按第 6 节补齐来源、许可、文件和消费位置，不临时下载后直接引用 |
| Figma 已有核心控件变体与组合示例，尚未迁移所有功能屏幕 | 新页面先复用已定义控件；Popover、Drawer、搜索选择弹层及领域控件等在使用前补齐专门状态和映射，不能把核心控件覆盖等同全部视觉设计完成 |

本文件固定实施约束，不修改任何产品 CSS 或组件。后续实现必须同时提交公共层变更、Figma 映射和对应页面的迁移说明，不能以页面看起来相似替代共用控件已经成立。
