# 文档编辑器的富文本保真

2026-10-28，在真实 Studio 的文档编辑器（BlockNote 正文）中检查示例文稿 `guide-content` 第 2–4 页“富文本、链接与公式”“嵌套列表、任务与引用”“表格、合并单元格与对齐”。每次用 `examples/animations/try.mjs` 准备独立的临时工作区，从本分支启动 `presmium-studio`，只使用 4333 端口；浏览器为 Playwright Chromium。没有操作公共服务或作者文稿，没有新增测试或运行测试套件。

## 修改前的实际情况

`before.json` 与 `before-*.png` 记录亮暗色 × 1440／390 四个组合：

- 行内公式显示为 `a^2+b^2=c^2`，块级公式显示为 `\sum_{k=1}^{n} k = \frac{n(n+1)}{2}`。原因是投影把公式当作只读原子（`presmiumInline`／`presmiumAtom` 的文字标签），既不排版，也不能直接修改。
- 两个链接的计算颜色是浏览器默认的 `rgb(0, 0, 238)`（暗色 `rgb(158, 158, 255)`）加下划线。
- “带语义颜色的说明”和“背景强调”没有颜色。标记在投影中并未丢失：BlockNote 的样式 `textColor`／`backgroundColor` 正确收到 `var(--pm-color-accent)` 与 `var(--pm-color-accent-soft)`，但 BlockNote 只为自己的调色板名字（`red`、`blue` 等）写了样式，其它 CSS 颜色只出现在 `data-value` 中，没有绘制。段落与表格单元格的颜色属性（`data-text-color`／`data-background-color`）同理。
- 行内代码与正文字体相同，没有底色；任务勾选框是浏览器默认蓝色。
- 列表嵌套、有序起始号 3、任务勾选、引用、表头 3 行、列宽、单元格居中、跨行与跨列均与文稿一致。

## 改动

- 公式改用 BlockNote 公开的预览加源码弹层：块级 `presmiumMath`（`content: 'plain'`，`meta.hasPreview`）与行内 `presmiumMathInline`，渲染组件为 `SourceBlockWithPreview`／`SourceInlineContentWithPreview`。排版用查看器已依赖的同一版本 KaTeX（0.18.10），输出 MathML，工作台不打包 KaTeX 字体与样式表。弹层的占位、空状态与错误提示有中英文；源文本出错时预览保留上次正确的画面，弹层显示“公式无法识别”与 KaTeX 的说明。
- 投影：规范文稿的 `math` 节点（块级保留 `id`）直接映射为上述原生节点，源文本是节点内容；读回时还原为同一 `math` 节点。不再经过只读原子或标签。
- 颜色：文稿中不属于 BlockNote 调色板、且 `CSS.supports('color', …)` 成立的值按原值绘制。行内标记通过扩展 BlockNote 样式 mark 的公开 mark view；段落和单元格的属性通过公开 ProseMirror 节点装饰（`createExtension` 的插件）。调色板名字仍由 BlockNote 自己的样式负责。
- `pm-ui-block-editor` 公共适配：链接沿用 `pm-ui-link` 的 `accent` 与下划线偏移；勾选框 `accent-color`；行内代码 `sunk` 底、等宽字体（不作用于公式弹层里的源码）；公式弹层、确认按钮、错误与空状态、选中描边全部改用令牌，粗指针下按钮至少 44 热区、源码 16 字号。

## 修改后的实际结果

`after.json` 与 `after-*.png` 四个组合：两处公式都渲染为 `<math>`；“带语义颜色的说明”计算色为亮 `rgb(15, 95, 92)`／暗 `rgb(111, 193, 185)`（即 `accent`），“背景强调”底色为亮 `rgb(226, 238, 236)`／暗 `rgb(29, 51, 48)`（即 `accent-soft`）；链接为 `accent`；勾选框 `accent-color` 为 `accent`。

`edit.json` 记录真实编辑与读回：

1. 点击行内公式，原生弹层显示 `a^2+b^2=c^2` 和确认按钮（`edit-inline-open-*`）；输入 `+d^2`，预览随输入更新（`edit-inline-typed-light-1440.png`），回车关闭弹层。
2. 点击块级公式，输入未闭合的 `\frac{`，预览保留上次画面，弹层显示本地化错误与 KaTeX 说明（`edit-block-error-light-1440.png`）；改为 ` + 0` 后预览恢复，Esc 关闭。
3. 等待保存后读取磁盘上的 `lecture.json`：段落 `paragraph-8` 中仍是 `{"type":"math","value":"a^2+b^2=c^2+d^2"}`，其后的 `break` 与文字不变；块级仍是 `{"id":"math-10","type":"math","value":"… + 0"}`。与仓库原文逐字段比较，整份文稿只有这两个 `value` 不同。
4. 再按一次 Ctrl+Z，块级公式回到编辑前的值并保存到磁盘。

为验证段落与单元格颜色，在临时副本中把居中段落的 `style.background` 设为 `var(--pm-color-warn-soft)`、末行合并单元格设为 `var(--pm-color-sunk)`，重新打开后两处底色均按令牌显示（`edit-inline-typed-light-1440.png`、`after-表格-dark-1440.png`）。这只是临时副本中的数据，没有改动示例文稿。

截图（忽略目录 `.presmium/ui-evidence/editor-rich-text-2026-10-28/`）覆盖亮暗色 × 1440／390 的第 2、3、4 页，以及亮色桌面与暗色窄屏下行内、块级公式的弹层。窄屏下行内弹层受视口宽度约束，块级弹层与正文同宽。

## 打开耗时与包体

计时从点击文档列表中的“功能导览 01”到编辑器中同时出现第 2 页段落与第 4 页表格文字，每轮 9 次，基线为同一提交（`main` 的 d648346c）的临时 worktree。测量期间机器负载 20–190（其他会话的 Studio 与构建），单次样本在 205–1779 ms 之间波动，轮间差异大于两组差异：

| 比较 | 样本 | 中位数 | 下四分位 | 最小 |
|---|---|---|---|---|
| 基线构建（7 轮） | 63 | 454 ms | 289 ms | 205 ms |
| 本分支构建（7 轮） | 63 | 550 ms | 372 ms | 268 ms |

两组构建只能分别启动（只用一个端口），轮次交替进行，但负载在轮间变化很大，单轮中位数基线 267–754 ms、本分支 328–842 ms 相互重叠，这组数据不能确定回退幅度。为排除负载漂移，另在同一个本分支 Studio、同一个浏览器上下文中交替打开 `guide-content` 与它的无公式副本（临时副本，两处公式改为同样的文字段落），10 对样本（`paired.json`）：

| 文稿 | 墙钟中位数 | 渲染进程任务 | 脚本 | 布局 | 样式 |
|---|---|---|---|---|---|
| 含公式 | 465 ms | 436 ms | 178 ms | 58 ms | 61 ms |
| 无公式 | 370 ms | 326 ms | 167 ms | 54 ms | 62 ms |

10 对中 6 对含公式更慢，4 对相同或更快；逐对差值中位数约 +70 ms，两组最小值为 259 与 246 ms。脚本、布局与样式的中位数只多 11、4 与 −1 ms，单独测得首次 MathML 布局约 7 ms、两条公式的 KaTeX 排版约 5 ms，其余差异没有在 CPU 剖析中定位到单一来源。结论是：公式节点带来几十毫秒以内的打开开销，在当前高负载机器上无法测得更精确的数值；需要在空闲机器上复测后再确认是否可接受。

客户端包 `packages/dsh/build/dist/client.js` 由 3 528 437 字节增至 3 810 950 字节（+282 KB，KaTeX 本体）；它在工作台启动时加载，不在打开文稿的计时区间内。KaTeX 在 Node 中的冷加载约 30 ms，两条公式首次排版 3.6 ms 与 1.1 ms，之后每条低于 0.1 ms。

## 范围与遗留

本次只改编辑器的显示与公式编辑，规范文稿的 `math`、标记与样式契约不变。

已发现但没有处理：

- 示例文稿第 4 页末行单元格背景写作 `var(--pm-color-surface-sunk)`，令牌表中没有这个名字（应为 `--pm-color-sunk`），所以编辑器和查看器中都不显示底色。
- 格式工具条的颜色选择只提供 BlockNote 调色板，选中后存为 `red` 等名字；查看器按 CSS 名字绘制，与编辑器内的调色板色值不同，也不提供设计令牌颜色。
- 编辑器中没有插入新公式的入口（斜杠菜单或工具条），只能编辑已有公式。
- 编辑器内的公式是 MathML 字形，查看器是 KaTeX 的 HTML 与字体，两者字形略有差异。
- 已勾选的任务项沿用 BlockNote 的删除线；引用沿用 BlockNote 的灰色文字；表格边框在暗色下沿用 BlockNote 的线色。三者未与查看器逐项比对。
- 文稿内锚点链接（如 `#rich-text`）在编辑器中仍由 BlockNote 以新标签页打开。

验证命令：`node scripts/check-types.mjs`、`check-layering.mjs`、`check-tokens.mjs`、`check-skills.mjs` 均通过。
