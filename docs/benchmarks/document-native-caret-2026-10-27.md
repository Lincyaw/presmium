# 正文原生光标与页面位置

2026-10-27，在已有单一 BlockNote 全文编辑器上修复原生光标与父页面位置脱节。使用公开选择、焦点与坐标接口，不增加 DOM 选区桥、按键到页面的规则或第二份内容。

## 修复前的真实边界

`document-position-keyboard-after.json` 保留 7 项中的一项未通过：正文 Ctrl+End 后，原生光标为 `summary--paragraph-1--text-0`，归属 Summary，编辑器仍聚焦；父位置与字幕目标却停在 `pass--step-0`。其余 Ctrl+Home、PageUp／Down 和滚动对照通过。原阅读规则只按视口顶部 5% 的阅读带选择页面，无法代表视口底部的实际编辑位置。

另一次公共 4320 只读记录 `live-native-position-before-2026-10-27.json` 也复现：原生正文已到 Summary，页面导航和字幕仍指向 Intro。该记录没有文稿写入、生成请求、浏览器错误或 HTTP 失败；11 份规范文稿的字节未变。两个记录保留各自的真实起始位置，不把不同页面误写为相同复现。

## 实现

`DocumentEditor` 订阅 BlockNote 公开的选择与内容焦点信号。文本选区取活动端 `selection.head`，对象选区取 `NodeSelection.from`，表格位置归属外层正文块。原生块 ID 通过已有投影的 owner 和页面映射查找页面；新块须先完成规范投影，再发布其编辑位置。产品块到页面的索引仅在初始投影和结构变更时重建；普通正文输入和选择移动使用该索引，不为这项归属查询扫描整篇文稿。

`SourceDocumentPanel` 只接受当前文稿 identity、reset 和原生编辑器拥有的通知，取消旧阅读请求，再观察该页面；同页观察保留显式 Step ID。失焦的正文不能用旧光标覆盖动画 iframe 或字幕编辑器的位置。焦点事件的单帧读取绑定当时的位置令牌；选择变化、失焦与生命周期清理会取消它。

真实滚动后的阅读帧只读取一次当前活动端坐标。正文仍聚焦且活动端在正文视口可见时，重新确认其编辑页面；滚离该位置则继续原阅读带逻辑。滚回可见位置时恢复编辑页面。失效坐标、未知映射、已销毁编辑器或过期归属均保守取消，不猜测页面。原有位置令牌、视口几何检查、ResizeObserver 基线和一次性读取保留。

## 真实验证

独立消费者 `document-caret-after.json` 7/7：Ctrl+End 后同一原生 Summary 光标、父页面和字幕均为 `summary--step-0`；Ctrl+Home、PageUp／Down、正文 wheel 对照仍通过。浏览器错误、HTTP 失败和生成请求均为空。原 `document-position-keyboard-after.json` 红项未覆盖。

`document-caret-boundaries.json` 记录 13 项检查，均通过：

- 从 Pass 扩选到 Summary，以活动端而非 anchor 归属页面，随后滚动不抢回 Pass。
- 真实鼠标点击 math 对象形成原生 `NodeSelection`；公开序列化类型为 `node`、from=51／to=52、选中节点为 `presmiumAtom`。对象在 Intro 末尾，父位置仍为 Intro；没有调用写选区 API 来构造该结果。
- 真实点击 Summary 表格单元格，页归属为 Summary。
- 正文仍聚焦时，wheel 把旧光标滚出视口，阅读位置可以改变；滚回光标可见而 Summary 标题尚未进入顶部阅读带时，页面恢复 Summary。
- 旧正文光标仍留在 Summary 时，iframe 显式切到 `pass--step-2`；inline 与 aside 原生输入均保持该步，实际保存只改其 narration，正文与 cue／pronunciation 原子保持不变。

这份记录中原名为 `new-native-paragraph-uses-new-section-index` 的检查只证明了 tail 编辑后仍归属 Summary，未产生新的 Rich ID，不能用于证明新段落映射。随后独立的 `document-caret-enter.json` 5/5 使用真实 Enter，核对输入前后的原生块 ID 集合，确认一个新的 UUID 段落；其活动端归 Summary，随后 CAS 保存的规范 rich 节点具有同一新 ID 和实际输入文字。该记录同时保存了 native 事件、草稿及保存前后文稿，没有把旧检查重复计作结构证明。

第一次对象检查尚处于折叠文本选区，且使用压缩后的 `constructor.name` 判断类型，消费者据此失败，保留为 `document-caret-node-gesture-harness.json`；最终通过公开 `selection.toJSON().type` 判断真实对象选择。产品源在这些定向验证期间保持冻结。

`document-caret-build.json` 记录实际构建 HEAD `1ebe2556`、四份候选源的 SHA、只读观察器 diff 与产物 SHA。观察器原样委托 `attachDocumentEditor`，只记录公开 native selection／focus／coords 和 Workbench 状态。截图 `document-caret-after.png` 与 `document-caret-boundaries.png` 已逐张查看。所有这些定向消费者都使用独立私有 Studio，未触及公共 4320／17407 或作者文稿；本轮没有重复完整主题与宽度矩阵。

类型检查通过（1168 文件），分层、技能与 `git diff --check` 通过。没有运行测试套件或重新测量大文稿输入性能。

## 框选的独立调查

`document-frame-selection.json` 使用独立随机端口 Studio 和私有合法文稿，在同一屏内放置 Before 正文、仓库真实冒泡排序场景与 After 正文。先实际播放、暂停，确认可交互场景已运行，再真实鼠标按下、跨过 iframe、抬起。

公开原生选区包含两端正文块和中间场景块，`getSelectedText()` 包含两端文字；原生 Shift 扩选对照也连续，正文滚动位置未变。5 项前置／无写入／无错误检查通过，`mouseContinuous` 和 `keyboardContinuous` 两项观察均为 true。没有出现待定位失败，因此未进行 inert 或 pointer-events 的私有 A/B。该单场景不能证明所有框选或批注问题已经解决，也不是本次光标修复的效果证据。

最初等待 GSAP 起始时刻必须显示非零柱高的消费者失败，以及立即读取键盘选区尚未同步的失败，分别保留为 `document-frame-selection-initial-pose-oracle.json` 和 `document-frame-selection-immediate-keyboard-observe.json`。最终等待真实播放／暂停和公开原生选区事件，没有修改产品以迎合这两项观察。

所有脚本、原始记录与截图位于忽略的 `.presmium/` 及 `.presmium/ui-evidence/`，没有新增 tracked tests 或运行测试套件。
