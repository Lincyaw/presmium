# 教学长文稿的输入、换页与新增页

2026-10-27，北京时间。以 `0870c1d4` 的正文链路为基线，私有 Studio、隔离客户端、Chromium 无头、1440×1000、Node v24.22.0。文稿有 50 页、每页 8 段、400 个富文本段落、约 455 kB 规范 JSON，以及第 5、25、45 页的三个真实冒泡排序场景。三个场景均实际加载成功后才开始输入测量。保留单个 BlockNote、全部页面 DOM、即时会话草稿、领域校验与真实 Git/CAS，没有延后权威输入或隐藏内容。

机器有 64 个逻辑 CPU，系统 load 在输入阶段为 `2.95 / 1.99 / 1.72` 至 `3.52 / 2.20 / 1.80`，导航／采样阶段为 `2.45 / 2.32 / 1.93` 至 `2.74 / 2.40 / 1.96`。机器同时运行其它服务及开发任务，没有 CPU 降速或独占环境；这些样本不是总体 P95。后续新增页消费者包含并行 Image 工作线当时的源码，具体来源保存在各记录的 `sourceManifest`；不把不同阶段的总时延差异归于单个改动。

## 普通输入与页面导航

| 操作 | 实际样本 | 结果 |
| --- | --- | --- |
| 十个不同段落的 native `beforeinput` 到文字可见后两帧 | 35.3、21.5、20.9、26.0、26.7、18.9、22.2、29.0、20.0、18.6 ms | 中位数 21.85 ms，最大 35.3 ms，10/10 低于 100 ms；输入窗口没有 ≥50 ms 长任务 |
| 十次原生 Ctrl+End／Ctrl+Home 跨页 | 63.4、59.8、60.8、74.1、59.6、60.1、60.4、60.9、60.8、60.7 ms | 中位数 60.75 ms，最大 74.1 ms；包括原生页标题和段落光标，页面位置与可见范围均确认 |
| 页面按钮聚焦后按 Enter，到目标标题可见后两帧 | 39.3、46.3 ms | 第 25 页与第 1 页均正确定位 |
| 原生 wheel 滚到文稿底部后两帧 | 32.2 ms | 最后一段可见，50 页、400 段仍全部挂载 |
| 十次输入的真实保存 200 回执 | 中位数 1458.7 ms，范围 1430.6–1490.8 ms | 单列保存确认，不计作输入画面延迟；包含原有 600 ms 合并窗口与服务端处理 |
| 从首页点击至完整文稿可编辑后两帧 | 输入阶段 1122.4 ms；导航阶段 1160.1 ms | 首开单列，没有声称低于 100 ms |

输入分布在第 1、5、10、15、20、25、30、35、45、50 页，包含组件附近的段落。每次输入都读到即时 dirty 草稿、实际 200 回执及磁盘规范 JSON；未修改的块、页面、步骤、讲稿、素材、定义和制作设置保持一致，新增文字只改变目标段落。导航与滚动阶段均保留同一个公开 BlockNote 实例 ID，未只靠 DOM 节点判断实例相同。

十次输入保存在 `.presmium/ui-evidence/teaching-document-performance-input-baseline.json`。该进程在随后 Ctrl+Home 计时超时：原消费者只接受段落 `p1-*`，漏了合法的 `page:s1` 标题光标，截图已经到第 1 页。原失败与已完成的十次输入保留，没有重跑替换。修正消费者的公开光标条件后，用同规格文稿单独完成导航、滚动及 CPU 阶段，记录为 `teaching-document-performance-navigation-profile.json`，22/22 检查完成。最初无效的 Definition.title 及漏报 motion 插件的私有 fixture 也分别保留；它们未产生输入样本。

## 单次 CPU 定位

在第 25 页另做一次 native 输入，采样下两帧延迟为 45 ms，不并入上述十个无 profiler 样本。`teaching-document-performance-input.cpuprofile` 保存原采样。Profiler 启动及等待占据原约 802 ms 窗口中的大段 program 时间；通过 Chrome `NavigationStart` 将 `beforeinput`／paint 的 `Performance.now` 对齐单调时间，仅统计相交的 45 ms。裁剪结果在 `teaching-document-performance-cpu-window.json`，没有把约 750 ms 初始化等待当作输入 CPU。

采样为约 0.5 ms 间隔，以下是 inclusive 估计，嵌套链不能相加：

| 调用链 | 采样时间 | 对应源码或边界 |
| --- | ---: | --- |
| 原生 DOM 输入到 ProseMirror transaction | 26.86 ms | 包含 Presmium 的 onChange；不是另加的依赖开销 |
| Presmium 正文 onChange／emit | 8.01 ms | `DocumentEditor.tsx` 的 `emit`，约第 61 行 |
| 规范文稿投影 | 2.28 ms | `projection.ts` 的 `nativeDocumentToProduct`，约第 185 行 |
| actor record | 4.58 ms | `document-session.ts:168`；自身约 2.44 ms，主要代码为规范对象克隆；持久草稿约 1.72 ms，含 native setItem 约 1.15 ms |
| React 主界面渲染／提交链 | 7.98 ms | 此次没有出现旧的整组页面导航菜单重绘热点 |
| 原生 view 更新中的 scrollToSelection | 4.58 ms | 属于上面的 transaction 链；包含 coordsAtPos／浏览器几何读取 |

当前代表性文稿的输入与换页均低于目标，没有因此修改对象保护、即时草稿、原生组件或投影缓存，也没有继续优化已解决的预览缓存。`teaching-document-performance-cpu-summary.json` 保留全窗口汇总，但判断使用已裁剪窗口。

## 新增第 51 页的实际问题

另用同一私有 Studio 中两份相同的 50 页文稿，测量干净状态与旧正文待保存状态。点击页面栏原新建按钮，新增的是末尾第 51 页。原始 `teaching-add-page-caret-offscreen-before.json` 确认：新页返回 200，新的原生编辑器已 focus 新空段，但光标纵坐标 `988–1007` 在正文视口下方，60 秒无额外输入仍未滚入视口。

后续将“原生已经聚焦”与“无需键入即可见”分开记录，得到 `teaching-add-page-performance.json`：11 项观察中 9 项通过、2 项 caret 可见性失败，均保留原红项。干净状态点击到 focus 后两帧为 286.7 ms、最终保存确认 2076.7 ms；待保存正文状态分别为 1351.2 ms、3140.1 ms。两种情况都发生原生实例 `1 → 2`、reset `0 → 1`。直接键入会使原生编辑器滚动并显示文字；待保存正文、新页首段与标题最终都实际 CAS 保存，不能据此声称初始光标可见。

该路径先 `flushPendingEdits`，再采用完整新页结构并重建原生编辑器，最后确认保存。旧正文 flush 的实际等待与约 287 ms 的新编辑器构建单列；本轮不改投影、reset 或原生历史来凑 100 ms。

单独在 onReady 发送公开 `state.tr.scrollIntoView()` 的第一个候选仍失败，记录在 `teaching-add-page-performance-after.json`，没有称修复。只读 delegate 观察 `teaching-add-page-scroll-observe.json` 表明 DOM 当时已经 connected、没有自定义 scroll handler：focus 后光标在 `910–929`，编辑器高 32454；随后 React 自定义节点完成布局，编辑器高变为 35925，光标才移动到 `988–1007`。因此不能靠首次 mount 或一次提前滚动解决。

最终只在 `attachDocumentEditor` 原有的文稿身份、选择代次、目标存在且非 afterSave 的焦点分支内，保留立即原生滚动，并为该未被打断的焦点建立 ResizeObserver。只有实际宽／高变化才再发送原生 PM 滚动；每次核对文稿 identity、reset、editor、导航请求、selection、focus 与目标，允许多轮真实布局完成。真实指针、wheel、触摸、按键、beforeinput、焦点转移、选择变化或解绑都取消并清理。没有 DOM 选区桥、硬编码偏移、定时或额外编辑时钟；原保存和旧回执边界不变。

修复后的 clean 核心记录在 `teaching-add-page-performance-layout-after.json`：无需键入，光标 `910–929` 已在视口 `90–971` 内，点击到光标可见后两帧 321.7 ms，最终确认 2134.3 ms；尚在 pageBusy／saving 时已经接受第一段和标题输入，两个实际 200 回执后磁盘内容完整。该进程在后面的 1080 宽反例停止：侧栏收起使正文仍是 832 宽、编辑器高未变，不能据此宣称触发布局；原失败保留，没有重跑替换 clean 数字。

只对 pending 另做最终消费者，`teaching-add-page-performance-pending-after.json` 完成 8/8。等待旧正文 flush 后，新页光标同样在 `910–929`，点击到光标可见后两帧 1352.5 ms，最终确认 3392.6 ms，三个真实 200 回执保留旧正文、新段与标题。在任何新页键入前，真实点击旧的 `p50-8`，再把视口改为 700 宽，编辑器高度实际 `35949 → 45525`；原生 selection 与共享页面仍为该旧段／第 50 页，没有旧焦点回调拉回新页。随后显式点回新段，在 pageBusy／saving 仍为 true 时输入，晚到回执没有清除它。这个反例仅证明新选择不被夺走，不声称窗口变窄时旧光标仍自动可见。

普通输入与导航的本批样本低于 100 ms；**新增页仍约 322 ms，有待保存正文时约 1353 ms，未达到 100 ms**。本轮修复的是光标可见性，未把原生编辑器重建及旧正文确认等待包装成性能达标。两个 after 截图已逐张查看；所有私有服务与浏览器 finally 清理完成。

## 证据与清理

原始记录、CPU、脚本快照、日志和图片都在忽略目录 `.presmium/ui-evidence/`，权限为 600，记录已去鉴权信息。每个私有 Studio、浏览器、fixture、工作区与 home 结束后清理。公开 4320/17407、作者文件与源码实现的其它区域未被测量器修改，没有模型、语音或生成请求，没有运行测试套件或新增跟踪测试。

最终轻量检查：types 1169 文件与 diff whitespace 通过；没有运行测试套件。
