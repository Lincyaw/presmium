# 五条设计规则：换行、嵌套圆角、完整状态、系统消息与动效

2026-10-29 从一份落地页设计指南中采纳了五条适合 Presmium（教师的编辑工作台与讲义、幻灯片查看器）的规则，写入 `docs/design-system.md` 第 5.4–5.8 节与 `tokens.css` 的注释，并在公共层落实。本记录说明改动与真实浏览器结果。

验证在独立临时工作区（`examples/animations/try.mjs` 生成，另加一份长标题、长段落的中文文稿 `wrap-demo`：6 页，每页一个标题与 4 段 22–95 字的段落）与独立 Studio（127.0.0.1:4352）上进行，改动前后用同一工作区、同一脚本，Playwright Chromium。截图、脚本与原始数据在工作树的忽略目录 `.presmium/ui-evidence/design-rules-2026-10-29/`（`before-*.png`、`after-*.png`、`before.json`、`after.json`、`shots.mjs`）。

## 改动

**换行。** 新增 `packages/design/src/typography.css`，经 `design.css` 进入工作台、网页与幻灯片：标题（`h1`–`h6`、`pm-ui-*` 的各类标题、编辑器的标题块）`text-wrap: balance`，正文（`p`、`li`、`blockquote`、`figcaption`、空状态、提示、字幕行，编辑器的段落、引用与列表块）`text-wrap: pretty`；`pre`、`code`、表格单元格、输入框、按钮保持默认。规则写成 `:where()` 零特异度。

**嵌套圆角。** `tokens.css` 新增 `--pm-radius-control-inset`（8 − 2 = 6px）与 `--pm-radius-menu-item`（8 − 4 = 4px），附规则说明。改正三处：菜单项 6px → 4px（菜单 8px 圆角、4px 内边距）；Segmented 选项在 regular／touch 下 8px → 6px（外框 2px 内边距）；搜索列表的选项随结果框密度取 `calc(外框 − 2px)`，compact 下 6px → 4px。Popover、Card、Dialog、时间轴说明块的差值不大于 2px，保留原样。

**完整状态。** 新增 `--pm-color-pressed`（`tokens.ts` 的 `COLORS` 同步）；Segmented 选项、Tab、菜单项、时间轴片段、虚线卡片按钮补按下态，虚线卡片按钮补禁用态。新增公共骨架 `pm-ui-skeleton` 与 `PmSkeleton`（工作台与 `@lincyaw/host` 各一份，`shape` 为 `document`、`list`、`preview`），用在打开文稿的纸面与页面栏、内容块预览准备中。修复前打开文稿时页面栏误显示“这份文稿还没有章节。”，现在显示列表骨架。批注侧栏没有批注时原为空白，现在显示“还没有批注。选中正文中的文字，再选“新建批注”。”。文稿无法读取时改为带“重试”的就地提示。审计 `packages/workbench/src`、`packages/design/src`、`packages/dsh/src/client`：没有 `window.alert`／`confirm`。

**系统消息。** 审计工作台、dsh 客户端与 MCP 的 zh-CN／en 文本：没有感叹号或语气词。改正笼统的成功与错误消息：“已应用” → “参数已应用到此内容。”“片段已应用到当前步骤”；“已保存。” → “字幕时间已保存到当前步骤。”；“未能应用，请重试。” → “参数没有应用，输入仍保留。请重试。”；“字幕时间未确认，输入已保留。”补上“请重试。”；任务状态“没有成功” → “生成失败”。英文同步改为句子大小写的具体说法。仿照 Word 的命令名（Version History、Navigation Pane、New Comment）是标签，不是系统消息，保留。

**动效。** `scripts/check-tokens.mjs` 增加检查：过渡或 `@keyframes` 中的布局属性（尺寸、位置、外边距、内边距、边框宽度、字号、`all`）报错。范围新增 `packages/viewer/src/client/style.css`（33 处原始值迁为令牌，步骤显现的 `0.3s` 改为新令牌 `--pm-duration-slow`，减少动态效果时为 0）与 `packages/addon-guide/components`。全仓库 CSS 没有动画布局属性的过渡；四个循环动画（转圈、圆点、引导光圈、骨架）都在减少动态效果时停止。

## 实际结果

| 检查 | 操作 | 修复前 | 修复后 |
| --- | --- | --- | --- |
| 编辑器末行孤字 | `wrap-demo` 在编辑器中，视口宽 390–1600 的 14 档，统计多行的段落与标题中末行不超过 2 个字的 | 318 个多行元素中 22 个 | 318 个中 0 个 |
| 编辑器（四种组合） | 1440／390 × 浅色／深色 | 1440：0／18；390：6／30 | 1440：0／18；390：0／30 |
| 幻灯片末行孤字 | 放映预览逐页翻完 6 页，统计 `.pm-slide` 中的标题与段落 | 22 个多行元素中 4 个（如第 3 页标题末行“选择”） | 0 个；第 3 页标题平衡为两行 |
| 菜单嵌套圆角 | 页面栏的页面操作菜单，计算样式 | 菜单 8px、内边距 4px、菜单项 6px | 菜单项 4px（四种组合相同） |
| 打开文稿 | 文稿接口人为延迟 2.5 s，点击后 0.9 s 截图 | 纸面区只有一行“正在读取文稿…”，页面栏显示“这份文稿还没有章节。” | 纸面上是标题与段落形状的骨架，页面栏是 5 行列表骨架；屏幕阅读器读到“正在读取文稿…”“正在读取页面…” |
| 预览准备中 | `guide-content` 的流程图块，预览接口人为延迟 6 s | 内容块下方一行“正在更新预览…”与大片空白 | 画面形状的骨架加两行文字条 |
| 空面板 | `wrap-demo` 打开批注侧栏 | 空白 | 图标与引导文字，390 px 下标题与句子平衡换行 |
| 减少动态效果 | `reducedMotion: 'reduce'` 下打开文稿 | — | 骨架 `animation-name` 为 `none`；正常时为 `pm-ui-skeleton-pulse` |
| 打开文稿耗时 | 1440 浅色，每次新页面，从点击首页卡片到编辑器出现第一段，7 次 | 243–284 ms，中位数 276 ms | 247–279 ms，中位数 267 ms，无回退 |

打开耗时在测量误差内持平：`text-wrap: pretty` 只在 Chromium 排版末尾几行时多做一次计算，这份 1,692 字的文稿上没有可测的代价。

## 检查与未验证范围

运行并通过：`scripts/check-tokens.mjs`（46 个样式表；另用临时样式确认会报告过渡 `width` 与关键帧 `top`）、`check-types.mjs`、`check-layering.mjs`、`check-skills.mjs`、`check-packages.mjs`。按约定未运行测试套件与示例完整构建。

未完成：Figma 的 Skeleton、按下态与嵌套圆角变体；版本历史、导出记录、音色目录与视频制作预览的加载仍是文字或转圈（`docs/design-system.md` 第 9 节已登记）。`text-wrap: pretty` 目前只有 Chromium 系浏览器生效，Firefox 与 Safari 按原样换行，未在这两种浏览器中实看。
