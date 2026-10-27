# 原生事务新增页面

2026-10-27，北京时间。延续 [教学长文稿测量](teaching-document-performance-2026-10-27.md)，只调整正文编辑器中的新增页。文稿仍以 `lecture.json` 为唯一权威内容，全部页面和正文 DOM 保留，即时草稿、服务端校验、真实 Git/CAS 和后续输入保护继续执行。

## 一次 CPU 定位

在私有 Studio 的 50 页、400 段、三个真实排序组件文稿中，先逐个确认组件已加载，再通过真实页面栏按钮新增第 51 页。单次 Chromium 无头 profile 的点击至光标可见后两帧为 365.2 ms，保存确认 1442 ms。该采样含 profiler 开销，不能与无 profiler 数字直接计算改进比例。

以可信 pointerdown 和 Chrome NavigationStart 裁剪 CPU 窗口，得到以下 inclusive 估计，嵌套项不能相加：

| 调用链 | 采样时间 |
| --- | ---: |
| React 同步渲染／提交 | 249.9 ms |
| DocumentEditor onReady | 78.3 ms |
| Workbench attachDocumentEditor | 76.0 ms |
| 原生 focus 中读取祖先滚动位置、触发布局 | 66.8 ms |
| 原生 mount | 39.6 ms |
| 建立文稿投影 | 6.9 ms |
| actor record，含克隆与草稿 | 4.2 ms |

原路径在约 37.6 ms 增加 reset，171.1 ms 解绑旧编辑器，174.6 ms 绑定新实例。主要可消除成本是整编辑器重建。保存请求约 920 ms 才收到响应头；本次没有把这段等待归因于某个未经测量的后端函数。

辅助实验直接调用公开 `transact`／`insertBlocks` 插入另一个页面，约 41.1 ms 返回，并保留实例。这不是点击至 paint 的数字。实验同时暴露语义缺口：Undo 后，原投影把新生成的默认步骤合并到了前页。因此实现不能只替换一个插入 API。

原记录：`.presmium/ui-evidence/page-create-profile.json`、`page-create.cpuprofile`、`page-create-profile-analysis.json`。CPU 记录为一次样本，机器有 64 个逻辑 CPU，系统 load 约 5.4；并非专用机或总体 P95。

## 实现边界

新增页通过当前 DocumentEditor 提供的命令使用 BlockNote 公开事务，插入页标题和首段，随后沿正文 onChange 进入当前 actor 的即时草稿与保存队列。该路径不预先等待旧正文保存，也不增加 reset。原有 flight/input/baseVersion/CAS 继续串行确认；没有另一份持久编辑模型。composition、恢复草稿、错误、agent 修改及其它页面／历史操作的守卫保留。

投影的原生结构历史只额外保留此次创建的 Section、Block、Rich Node、Step 四个 ID。默认步骤及覆盖项仍为 4000 ms 最短停留、500 ms 尾停顿。Undo 返回创建前的结构时，仅移除未修改、没有讲稿、媒体、继承或其它视觉引用的默认步骤；后来写入的教学内容保留。Redo 用原 ID 补回默认步骤与覆盖项。删除既有页面边界仍按原语义合并教学顺序。

首个文字输入与创建页使用独立的原生 history 事件。焦点继续使用原生 cursor、scrollIntoView，以及只在真实尺寸变化时生效的 ResizeObserver；真实交互、后来的 selection、identity/reset、导航或编辑器解绑都会取消旧焦点归属。

## 实际操作与对照

小文稿完整主线 `page-create-native-small.json` 为 10/10：

- 真实点击新增，保持同一 BlockNote 和 reset，首段光标直接可见。
- 原生键入，第一次 Ctrl+Z 只撤文字，第二次撤新页及默认实体，规范文稿逐字段回到创建前。
- 原生 Redo 恢复相同四个 ID 与默认时间。
- 在字幕侧栏真实输入讲稿后，撤销新页仍保留讲稿和步骤，Redo 将其归回原页。
- 公开 removeBlocks 辅助删除既有页标题，教学步骤仍合并；最终实际 CAS 磁盘与当前规范内容相等。

提交前另外完成 `page-create-native-boundaries.json` 的 12/12 窄操作，没有重复长文稿测量：在第 1、2 页之间真实点击新增，顺序为原第 1 页、新页、原第 2 页，原生光标与当前页一致；输入、Undo、Redo 后顺序和四个 ID 均正确。随后连续两次真实点击新增，两次均仍 dirty、版本相同、请求计数没有增加，没有等待保存；输入后依次撤文字、第二页创建、第一页创建，规范文稿精确回到此前状态，再依次重做恢复原 ID、顺序和当前光标。最后磁盘实际保存两页和新文字，原正文保持一致，编辑器实例与 reset 始终不变，0 浏览器／HTTP／生成错误，私有服务与 fixture 已清理。

性能对照以 `a4d27f99` 的四个旧源码文件建立私有 overlay，其他共享源码与依赖保持相同；两份隔离客户端和私有工作区，按 before clean → after clean → before pending → after pending 串行操作。使用 Chromium 无头，没有 profiler 或 CPU 降速。每份文稿相同，三个真实组件均预热；pending 两个样本均确认旧正文的真实保存请求已发出且尚未收到回执，再点击新增页。计时均为可信 pointerdown 至光标可见后两帧。

| 场景 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 干净状态，点击至光标可见后两帧 | 332.6 ms | 169.1 ms |
| 旧正文保存中，点击至光标可见后两帧 | 1001.0 ms | 166.2 ms |
| 干净状态，含随后首段输入的最终保存确认 | 2292 ms | 1848 ms |
| 旧正文保存中，含随后首段输入的最终确认 | 2821 ms | 1820 ms |

修改前两例原生实例从 1 变为 2、reset 增加；修改后均保持实例 1、reset 0。修改后的 pending 新页在旧正文回执之前就可见。每例都立即输入新页首段，再真实选择旧的 p50-8，并将窗口改为 700 宽触发实际布局；最后确认没有回执夺回选择，旧正文、新页文字和其余页面／块全部实际 CAS 保存。对照为 16/16，0 浏览器错误、HTTP 失败或生成请求。

**新增页仍约 166–169 ms，尚未达到 100 ms。** 每个场景只有一对样本，不能据此推导 P95。系统 load 从约 3.57 到 4.55，有并行开发任务。修改后的两张页面截图已逐张查看；本轮浏览器主视口为亮色 1440×1000，选择反例另用 700 宽，没有重跑整组视觉矩阵。

对照记录为 `page-create-comparison.json`，包含四个源码的 before/after SHA、共享 DocumentSession、BlockNoteSurface、package/lock 的 SHA 和各请求时序。对照依赖已安装官方 FileHandler 3.32.0，页面命令不依赖该扩展。最初私有 baseline overlay 的 shebang 前被插入 import，启动即语法失败，没有打开页面或产生性能样本；失败记录保留为 `page-create-comparison-harness-before.json`，修正消费者后才运行上述对照。

## 交付状态

类型检查通过（1169 个文件），diff whitespace 通过。全部私有浏览器、Studio、工作区和 fixture 已 finally 清理；未触碰公共 4320/17407 或作者文件，没有新增跟踪测试或运行测试套件。重命名、重排、复制和删除仍使用原路径；页面栏恢复／错误态的禁用外观由独立改动对齐，本命令已守卫这些状态。
