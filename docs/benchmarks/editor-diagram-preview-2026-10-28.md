# 文档编辑器中的图表预览

2026-10-28，北京时间。基线为 `d648346c`，在隔离 worktree 中改动，Studio 只在 127.0.0.1:4332 上启动，使用 `examples/animations/try.mjs` 新建的示例工作区。未运行测试套件、模型或生成任务。

## 作者现在能做什么

- 打开文稿后，Mermaid 流程图与时序图在正文中直接显示为画面，与思维导图等组件使用同一个“文档内预览”卡片：类型图标与状态、字幕、刷新。作者看不到 Mermaid 源码，也不会误把它当代码改坏。
- 文稿启用了内容插件（`@lincyaw/addon-content`）时，PlantUML 代码块同样显示为画面；未启用该插件时它在发布页里也只是代码，编辑器继续按代码显示。
- 正文中的教学代码（例如第 2 页的 `console.log` 示例）仍是可编辑代码块，修改照常自动保存。
- 修改图表的途径是对话：AI 助手读取同一份文稿，按要求改写图表并走既有审阅流程。图表没有公开参数，因此没有属性入口；图表块上也没有“交给助手”的就地按钮（见下文未覆盖项）。

## 实现

文稿 IR 中 Mermaid 是 `type: "code"`、`language: "mermaid"` 的内容块（`packages/kernel/src/contracts/document.ts`），编译后查看器把它画成 SVG；PlantUML 由内容插件的编译 pass 换成图片。编辑器投影原来把所有带 `value` 的代码块投成 BlockNote 原生代码块。现在 `projection.ts` 的 `isDiagram` 识别这两类会画成图的代码块，把它们投成与组件相同的原子块，`SourceDocumentPanel` 对它们挂载 `DocumentBlockPreview`。保存时原子块原样克隆规范块，图表源码逐字保留。预览不可用时的说明文字为“图表”或“Diagram”，不再写“引用代码：mermaid”。没有新增样式，预览卡片沿用 `@lincyaw/design` 的 `pm-ui-block-preview`。

## 实际运行

| 运行 | 结果 |
| --- | --- |
| 打开 `guide-content`，列出预览卡片与原生代码块 | 预览卡片为 `flowchart`、`sequence`、`markmap`、`video`、`audio`、`animation`；原生代码块只剩 `console.log(...)` 一个 |
| 重启 Studio 后首次打开文稿，点页面栏“Mermaid 流程图与时序图” | 点击到流程图 SVG 可见 915 ms，时序图 930 ms；随后点“可缩放的思维导图”，思维导图预览就绪 141 ms |
| 同一 Studio 中再次打开，滚动到图表（四种组合各一次） | 流程图 SVG 可见 341–463 ms，预览状态 `ready` 344–467 ms，时序图 393–513 ms |
| 在第 6 页正文段落末尾输入“（编辑验证）” | 自动保存；工作区 git 提交只改该段一行，两个 Mermaid 块的 `value` 未变；保存后预览重新就绪并显示原图 |
| 在第 2 页 `console.log` 代码块末尾输入 ` // 已改` | 773 ms 后保存完成；磁盘上该代码块 `value` 变为新文本 |
| 打开 `guide-network`，滚动到 PlantUML 块 | 预览就绪 3524 ms（含访问 plantuml.com 的图片），图片宽 427 px；正文中没有原生代码块 |
| `node scripts/check-types.mjs`、`check-layering.mjs`、`check-tokens.mjs`、`check-skills.mjs` | 全部通过 |

计时是单次 Playwright 采样（Chromium），不是分布或 P95。

## 四组合实看

截图位于 `.presmium/ui-evidence/`，已逐张查看：`mermaid-light-1440.png`、`mermaid-dark-1440.png`、`mermaid-light-390.png`、`mermaid-dark-390.png`，另有 `mermaid-after-edit.png`、`code-block-edited.png`、`plantuml-light-1440.png`。

| 宽度 | 明暗 | 观察 |
| --- | --- | --- |
| 1440 | 亮 | 两张图完整显示，配色取自设计令牌 |
| 1440 | 暗 | 图表跟随暗色主题，卡片边框与文字对比正常 |
| 390 | 亮 | 时序图缩放到卡片宽度；`flowchart LR` 按查看器既定规则保持原尺寸，在卡片内横向滚动，首屏只露出左半部分 |
| 390 | 暗 | 同上 |

## 未覆盖

- 图表块没有块级批注，也没有就地“交给助手”入口；作者需要在对话中说明要改哪张图。
- 已有批注若锚定在 Mermaid 源码文字上，编辑器不再显示该锚点；示例文稿中没有这种批注，未验证。
- 新插入的代码块改成 `mermaid` 语言后，要在文稿重新载入后才显示为画面。
- 插件通过 `code:<语言>` 注册的其他查看器渲染器不在识别范围内。
- 窄屏下横向流程图只能在卡片内横向滚动，是查看器的 Mermaid 布局规则，本次未改。
- 正文中的行内公式与独立公式在编辑器中仍显示为 LaTeX 文本，与本次图表问题无关，未处理。
- 只在 Chromium 中运行；没有真实触屏、Firefox、WebKit 验证。
