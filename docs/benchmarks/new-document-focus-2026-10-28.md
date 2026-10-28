# 新建文稿后正文焦点丢失的回归

2026-10-28 在 main（19736958）的真实 Studio 中：文稿 → 新建文稿 → 输入标题 → 创建。编辑器约 0.8 s 打开，但 `document.activeElement` 是 `<body>`，紧接着键入的文字没有进入正文，也没有写入 `lecture.json`。2026-10-27 的[新建文稿与页面后的直接输入](document-creation-focus-2026-10-27.md)记录中这一流程是通过的。验证在独立临时工作区（`examples/animations/try.mjs` 生成）与独立 Studio（127.0.0.1:4340，二分构建用 4341）上进行，没有修改公开示例或其它端口上的服务。

## 二分

沿 `git log --first-parent main`，每个候选提交建独立工作树、准备新工作区、启动 Studio，以 1440 浅色真实执行“新建文稿后立即键入”，判据是键入内容是否写入磁盘上的规范文稿：

| 提交 | 结果 |
| --- | --- |
| 40f80ce4（10-27，正文焦点交接） | 通过，创建后 11 ms 内焦点在正文 |
| 2d812670、43f2efd6、608a9e55、39506bf5 | 通过 |
| **620889f9** feat(workbench): persist isolated document drafts through browser restarts | 失败 |
| 6d3f087e、e884a7ec、d648346c、19736958（main） | 失败 |

坏提交是 **620889f9**（持久化文稿草稿），不是 10-28 当天的工作台细节、审批、富文本、图表预览或预览重试合并；这些合并都在它之后，二分前的 d648346c 已经失败。

## 原因

草稿持久化让新文稿的会话先以 `loading: true` 带着内容发出状态（读取 IndexedDB 中的草稿候选期间），编辑器于是以只读状态挂载（`SourceDocumentPanel` 的 `readOnly` 包含 `loading`）。`loading` 变为 `false` 时，`Workbench` 在同一次状态更新中同步执行 `#finishOpeningDocument`，此时 React 还没有提交 `readOnly={false}`，正文仍是 `contenteditable="false"`。显式的 `focus: 'body'` 意图在这一刻被采用并结束，`editor.focus()` 对不可编辑的正文静默失败，之后再没有机会重试。临时插桩记录到采用时的状态：`contenteditable=false`、`isEditable=false`、活动元素 `BODY`。

此前会话的第一次状态就是 `loading: false`，编辑器一挂载就可编辑，所以没有暴露这个次序问题。

## 改动

- `Workbench.#finishOpeningDocument`：带 `focus: 'body'` 的打开意图在编辑器仍只读时继续等待，不提前结束。其它条件（身份、版本、视口、用户交互取消）不变；普通打开恢复阅读位置的路径不受影响。
- `Workbench.documentEditorEditable()` 与 `SourceDocumentPanel` 中的一个 effect：`readOnly` 变为 `false` 后再次尝试完成打开。BlockNote 在提交阶段（挂载回调）应用 `editable`，父组件的 effect 运行时正文已可编辑。
- `DocumentView`：另一份文稿打开时，若导航窗格会覆盖正文（宽度小于 1280 px），窗格收起。这不是 620889f9 引入的：在 39506bf5 上，390 px 时先在一份文稿中打开页面栏、回到文稿列表再新建，窗格同样保持打开并盖住正文。桌面宽度保留作者的开关选择。

草稿持久化本身（只读等待草稿候选、恢复入口）保持原样。

## 实际结果

脚本、日志与截图在工作树的忽略目录 `.presmium/ui-evidence/new-document-focus-2026-10-28/`（`flow.mjs`、`flow-*.log`、`*.png`）。每种组合依次：新建文稿 A 并立即键入；打开页面栏新增页并立即键入；进入放映预览，不点画面，按 `ArrowLeft`、`ArrowRight`、`Esc`；页面栏保持打开回到文稿列表，新建文稿 B 并立即键入。保存判据均为读取磁盘上的 `lecture.json`。

| 组合 | 结果 |
| --- | --- |
| 浅色 1440 × 900 | 15/15 |
| 深色 1440 × 900 | 15/15 |
| 浅色 390 × 844（触屏） | 15/15 |
| 深色 390 × 844（触屏） | 15/15 |

具体：

- 新建文稿：创建后 2–5 ms 焦点在正文首段，键入内容写入磁盘；修复前 main 上 4 s 内焦点始终是 `<body>`，内容未写入。
- 新增页：焦点在新页正文段落，光标处元素属于正文而非导航；390 px 时导航收起，1440 px 保留侧栏；第二页文字写入磁盘，规范文稿为两页。新页标题按文稿 `lang` 为“新页面”。
- 放映：画面 iframe 取得焦点，方向键使页脚 2 / 2 → 1 / 2 → 2 / 2，`Esc` 退出后焦点回到“Presentation preview”按钮。
- 页面栏打开时新建文稿 B：390 px 导航收起、1440 px 保留，正文焦点与保存均通过；修复前 390 px 此项失败。
- 页面异常为零。四种组合截图已查看。

`node scripts/check-types.mjs`、`check-layering.mjs`、`check-tokens.mjs`、`check-skills.mjs` 通过。没有新增测试，没有运行测试套件、e2e 或示例完整构建。

## 未覆盖

- 只在 Chromium 验证；Firefox、WebKit、真实触屏与系统输入法未验证。
- AI 正在修改文稿时编辑器同样只读；此时新建文稿的正文焦点会等到修改结束才落下，期间作者的任何操作照常取消该意图。这一路径没有实际操作。
- 缓存中已有的文稿以 `focus: 'body'` 重新打开的路径没有单独操作；它经过同一等待条件。
