# 文档编辑器的作者入口：颜色、新公式与文稿内链接

2026-10-28，补齐[正文富文本保真记录](editor-rich-text-fidelity-2026-10-28.md)留下的四个作者缺口。验证用 `examples/animations/try.mjs` 从本分支准备的独立临时工作区（示例 `guide-content`，另在临时副本中加了一个外部链接 `https://example.com/presmium` 和一段旧调色板名 `red` 的文字），从本分支启动 `presmium-studio`，只使用 4339 端口；浏览器为 Playwright Chromium。没有新增测试或运行测试套件。截图与原始数据在忽略目录 `.presmium/ui-evidence/editor-authoring-gaps-2026-10-28/`。

## 修改前

- 格式工具条的颜色只提供 BlockNote 调色板，选中后把 `red`、`blue` 等名字写入文稿；查看器把它们当作 CSS 颜色名绘制，与编辑器内 BlockNote 的色值不同，也不是设计令牌。块手柄菜单与表格单元格、行列菜单的颜色同样如此。
- 编辑器只能修改已有公式，没有插入新公式的入口。
- 文稿内锚点（如第 1 页的 `#rich-text`）由 BlockNote 以新标签页打开。
- 示例第 4 页末行单元格背景写作不存在的 `var(--pm-color-surface-sunk)`，编辑器与查看器都不显示底色。

## 改动

- 语义调色板放在 `@lincyaw/kernel`（`DOCUMENT_COLOR_NAMES`、`documentColorToken`、`documentColorValue`）：文字 `muted`、`accent`、`ok`、`warn`、`danger`，背景对应 `sunk`、`accent-soft`、`ok-soft`、`warn-soft`、`danger-soft`，保存的值就是 `var(--pm-color-…)`。
- 选色菜单用 BlockNote 公开的菜单组件重组，替换工具条的 `ColorStyleButton`、块手柄菜单（`SideMenuController` + `DragHandleMenu`，保留删除与表头项）、表格单元格菜单（`TableCellButton` + `TableCellMenu`，保留拆分）与行列手柄菜单（`TableHandle`，保留删除与插入）。标签是“颜色 · 用途”（中文：灰色 · 次要、青色 · 强调、绿色 · 通过、橙色 · 提醒、红色 · 警示；底色：灰底、青底……；英文同义），样本是新的公共类 `pm-ui-color-swatch`。
- 旧文稿中的 BlockNote 颜色名不改写；编辑器（mark view 与节点装饰）和编译器（`document-lowering.ts`）都经 `documentColorValue` 映射到最近的语义令牌（gray→muted，red／pink→danger，orange／yellow／brown→warn，green→ok，blue／purple→accent），两端一致。
- 斜杠菜单在“高级功能”组加入“公式块”“行内公式”（别名含 formula、math、latex、公式），工具条加入 Σ 按钮，把选中的文字变成行内公式的源文本。插入后直接打开既有的公式弹层：块级经 `SourceBlockWithPreviewExtension` 的公开 store，行内把光标放进公式源文本。图标为新增的设计图标 `formula`（lucide Sigma）。
- 链接：`links.onClick` 关闭 BlockNote 的默认打开，编辑器外框统一处理点击（编辑与只读一致），链接工具条的“打开链接”按钮替换为同一逻辑。`#<页面 id>` 调用工作台的 `goToSection` 并把光标移到该页标题；`http`、`https`、`mailto`、`tel` 以 `noopener,noreferrer` 在新标签页打开；其它相对地址不处理。
- 示例改为 `var(--pm-color-sunk)`。用脚本对照 `packages/design/src/tokens.css` 的 156 个令牌扫描 `examples/` 下 json、css、ts、md 等文件中的 `var(--pm-…)`，修改后没有未知令牌。

## 实际结果

颜色（`colors.json`、`preview-*.json`、`blocks.json`）：

1. 选中“保留段落”，工具条颜色菜单列出 6 个文字色与 6 个背景色；选“红色 · 警示”与“橙底”后，磁盘上的 `lecture.json` 为 `{"type":"color","value":"var(--pm-color-danger)"}` 与 `{"type":"background","value":"var(--pm-color-warn-soft)"}`，菜单中对应项为选中状态。
2. 演示预览与编辑器的计算色一致：

| 位置 | 亮色 编辑器／预览 | 暗色 编辑器／预览 |
|---|---|---|
| 文字 `danger` | `rgb(163, 50, 28)`／同 | `rgb(238, 154, 134)`／同 |
| 底色 `warn-soft` | `rgb(247, 235, 218)`／同 | `rgb(58, 44, 25)`／同 |
| 旧名 `red` | `rgb(163, 50, 28)`／同（预览样式为 `color: var(--pm-color-danger)`） | `rgb(238, 154, 134)`／同 |
| 第 4 页末行单元格 `sunk` | `rgb(239, 235, 227)`／同 | `rgb(42, 41, 37)`／同 |

   文稿中的旧值仍是 `"red"`，没有被改写。
3. 块手柄菜单 → 颜色 → 青底：段落 `style.background` 为 `var(--pm-color-accent-soft)`；单元格菜单 → 颜色 → 橙色：单元格 `style.color` 为 `var(--pm-color-warn)`，编辑器计算色 `rgb(154, 91, 19)`；行手柄菜单（删除行、上方插入、下方插入、颜色）→ 绿底：整行单元格为 `var(--pm-color-ok-soft)`。行手柄菜单中原有底色 `sunk` 的行显示“灰底”选中。随后撤消，磁盘文稿回到操作前。

公式（`formulas-links.json`、`toolbar-formula.json`）：

1. 在段落后回车输入 `/formula`，菜单只剩“Formula block”“Inline formula”（中文界面输入 `/公式` 得到“公式块”“行内公式”）。选公式块后弹层已打开，输入 `E = mc^2`、Esc，保存后磁盘出现新的块级 `{"type":"math","value":"E = mc^2"}`。
2. 新段落输入“能量 ”后用 `/inline` 插入行内公式，弹层已打开，输入 `\alpha+\beta`、回车后继续输入“ 结束”：保存为 `[text "能量 ", math "\alpha+\beta", text " 结束"]`。
3. 输入“面积 r^2 完”，选中 `r^2` 点 Σ：弹层已打开，源文本为 `r^2`，补上 `\pi` 回车，保存为 `[text "面积 ", math "r^2\pi", text " 完"]`，后面的内容不变。
4. 连续 Ctrl+Z 后，三处新增全部撤消并保存，块级公式只剩原有的一条；与操作前的文稿逐字段比较没有差异。

链接（`links.json`）：点击第 1 页“从富文本开始”（`#rich-text`）后没有新标签页，状态栏由“第 1 页”变为“第 2 页”，该页标题滚到编辑区顶部；悬停“直接查看音视频”，链接工具条的“打开链接”跳到第 8 页，同样没有新标签页；点击“外部网站”打开一个新标签页，地址为 `https://example.com/presmium`，`window.opener` 为 `null`，工作台地址不变。

四种组合（`m-*-{light,dark}-{1440,390}.png`，中文界面）：选色菜单、斜杠菜单和行内公式弹层均已查看，亮暗色下样本与文字均按令牌着色。390 宽度下工具条换行；选区位于屏幕中部时，选色菜单的最后一两项落在视口底边之外。

## 打开耗时与包体

计时从点击文档列表中的“功能导览 01”到编辑器中同时出现第 2 页段落与第 4 页表格文字。基线是 `main`（19736958）的临时 worktree，与本分支轮流在 4339 端口启动、使用同一份临时工作区，各 4 轮，每轮先预热 1 次再取 7 次：

| 构建 | 样本 | 中位数 | 下四分位 | 上四分位 | 各轮中位数 |
|---|---|---|---|---|---|
| 基线 | 28 | 209 ms | 203 ms | 224 ms | 208、213、192、220 |
| 本分支 | 28 | 199 ms | 191 ms | 215 ms | 216、198、190、202 |

测量期间机器负载 13–24。两组差异在轮间波动之内，没有测到回退。客户端包 `packages/dsh/build/dist/client.js` 由 3 827 791 字节增至 3 839 065 字节（+11 KB），不在打开计时区间内。

## 范围与遗留

规范文稿契约不变：颜色仍是 `color`／`background` 标记与 `TextStyle` 的字符串值，旧值原样保留，只在显示时映射。

- 表格行列手柄菜单不再含表头切换（BlockNote 未公开导出这两个按钮），表头切换仍在块手柄菜单。
- 只有指向页面 id 的锚点在工作台内跳转；指向块或不存在的锚点点击后不动作，相对地址（非 `#`）也不打开。
- 390 宽度下行内公式靠近右边缘时，原生弹层按公式左端定位，确认按钮会超出视口（回车仍可确认）；这是上一轮公式弹层的定位问题，本次未处理。
- 窄屏下选色菜单（12 项加两个标题）没有按可用高度收缩，选区靠下时末尾几项超出视口；BlockNote 原菜单有 20 项，情况相同。Mantine 菜单的尺寸约束未经 BlockNote 公开，本次未处理。
- 编辑器内公式为 MathML 字形，与查看器 KaTeX 字体略有差异（未变）。

验证命令：`node scripts/check-types.mjs`、`check-layering.mjs`、`check-tokens.mjs`、`check-skills.mjs` 均通过。
