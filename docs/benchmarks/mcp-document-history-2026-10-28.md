# Web／MCP 共用文稿历史

本片基于 `b11d8998`，仅操作私有临时工作区，不访问公共 Studio、作者文稿、模型或提供方。不运行测试套件，也不新增 tracked tests。协议和限制见[文稿历史](../document-history.md)；本记录区分各阶段源码，不把分开的消费者合成一个通过数。

## 行为与修复

Web 历史面板和五个核心 MCP 工具使用同一个 `DocumentHistory` owner，借用原 Revisions、文稿锁和 git 队列。空目录表示根文稿；历史读取不解析当前 `lecture.json`，不要求编译。读取旧文件不恢复内容；修改必须明确 source、HEAD、稳定意图 ID 与完整目标提交。原生正文／字幕 Undo 不接 git。

实际旧路径存在以下问题，反例原样保留：

- 根文稿 `''` 被当作全工作区，列表含子文稿，根 Undo 实际改变了子文稿。
- git 提交失败后目标工作区内容已被改写；另一个反例中，目标 stage B、工作区恢复 HEAD A 后仍能 Undo，消耗作者的暂存内容。
- 当前文件系统归属把已删除子文稿的旧提交重新分给根文稿。
- 新分页上限若只截列表，会丢更早版本，也会让二十余次撤消／重做遮掉原修改。服务端现计算完整链状态，Web 明确逐页读取，每页最多二十条原修改和 7168 个缩进 JSON UTF-16 字符。
- 新分页遇 HEAD 409 后首片读取失败可能留下 loading；已补最新请求归属与失败清理。clean 外部 MCP 修改虽已被正文采用，打开的历史面板仍旧；现在按已确认来源版本变化刷新。
- 逐条撤消一个已被后来普通编辑抵消的修改，git 无差异曾返回 500；现明确返回 `409 history-change-already-undone`，不改正文、HEAD 或 index。

历史归属只认配置允许、历史树中真正的常规 `lecture.json`；按变更前后判断最深文稿。批量读取有界树元数据，保持 NUL 路径协议和 SHA-1／SHA-256 对象格式。未配置的同名 JSON 与 symlink 不能充当子文稿。目标工作区与真实暂存区任一未提交修改均阻止撤消，写后失败恢复本次目标及原 index，不纳入其它未提交内容。

## 实际消费者

| 记录 | 实际范围 |
| --- | --- |
| `history-root-before.json`，2 项 | 原根范围越界列表及真实 Undo，反例完成 |
| `history-rollback-before-final.json`，2 项 | 原实现真实 `index.lock` 提交失败，目标未恢复；保其它 dirty／index 对照 |
| `history-target-index-before.json`，2 项 | 原实现消耗 staged-only 目标的真实反例 |
| `history-deleted-child-before.json`，1 项 | 原历史归属误选已删除子文稿 |
| `history-consumer-1793128019349/result.json`，21/21 | 官方 MCP SDK、真实 HTTP／git：root、Unicode 分片、坏 JSON 可读／显式 Undo、source／HEAD／target、同意图丢 ACK 重放、review、混合提交、staged-only、真实提交失败回滚、长链、嵌套工作区、逐条旧目标、不可达提交、SHA-256 仓库、no-git／unborn |
| `history-unconfigured-marker-{before,after}.json`，各 1 项 | 未配置同名 JSON 的归属回归与修复 |
| `history-symlink-marker-{before,after}.json`，各 1 项 | 历史 symlink 入口不充当文稿 |
| `history-deleted-child-final-current.json`，1/1 | 后续现源复核已删除子文稿不出现在根历史／下一 Undo |
| `history-external-panel-after-1793128705455/result.json`，3/3 | 真实 MCP plan／apply 后，clean 正文和已打开的 HistoryPanel 均采用新来源／历史行 |

原始材料在 ignored `.presmium/`；上表短文件名位于 `.presmium/ui-evidence/`，其余路径以 `.presmium/` 为根。最终源码、各 raw SHA、阶段差异与清理状态统一登记于 `.presmium/ui-evidence/history-final-manifest.json`。

最终浏览器材料分成两份，运行源相同，不能合称一份脚本全绿：

- `history-web-final-1793130855659/result.json` 保留 15 项实际通过：原生输入／UndoRedo、无差异 409 不写正文／HEAD／index、失败后原按钮可重试、逐条 Undo／Redo、reload 后 Home 显式重开、二十一次真实链、分页覆盖第 21 条、旧页真实 200 迟回、新全仓 HEAD 引发 409 后首读 HTTP 500 的恢复，以及四组合真实按钮。末尾只因 framed Studio 已无独立 Doc 的旧 Back 按钮定位器而停，`complete:false`。
- `history-web-late-ack-1793130970955/result.json` 独立 5/5、`complete:true`，使用正式顶栏 Documents 按钮：A 的撤消实际已提交、200 回执被持有，切到 B 并原生键入／保存，再释放 A 回执，B 当前内容、原字节和稳定身份不变。未重新跑前十五项。

四组合为浅／暗 1440 英文和浅／暗 390 中文，已实际查看四图与最后 B 文稿截图。两消费者均为唯一原生正文编辑器，Doc 未进入制作、无 IR／preview 请求、模型和外网请求为零，pageerror 为零。前十五项只含预期的历史 409 及注入首读 500；独立尾段 HTTP 错误为零。

核心 21/21 在四个后续文件增量之前运行：`history.ts` 的首读失败归属清理、Workbench 的 clean ACK 刷新／缩进、HistoryPanel 的 preparing 禁用，以及 Revisions 的无差异 409 分类。前三项由最终 Web 消费验证，Revisions 除上述一行无其它差异；其余十九个源 SHA 与核心 21 项完全相同。manifest 通过逆替换实际重新算 SHA 证明三个小增量；`history.ts` 保留当时实际旧文件和精确 SHA。已删除子文稿另在最终二十三源上窄复核，不借旧 `a3c` 版本假称现源。

## 保留的失败与边界

初轮 Web 5 项后，观察器错误地把 reload 后 Home 当作自动打开 Doc；修正为显式重新打开，不宣称实现自动恢复。分页初轮 7 项后，观察器要求第二页起点至少 20，但预算允许第一页只有 16 行；实际 16＋13 行已覆盖第 21 条，后来按真实 offset＋行数核覆盖范围。混合提交初版消费者误复用了 revert trailer，使目标不是拟测提交；该失败不冒充产品拒绝证明。

`history-web-final-1793130799530` 的 9 项之后，观察器要求公共按钮的 `aria-busy='false'`，实际公共控件在非 busy 时省略该属性；修正 ignored 观察条件后继续，未改产品源。`history-web-final-1793130706084` 先实证无差异 409 无写，随后立即重试没有发 POST：HistoryPanel 当时未把已有 `isHistoryPreparing` 纳入禁用条件，按钮是假可用。已补这一状态，不加延时。两轮失败和清理记录均保留。

第二轮最终 Web 的逐条 Undo 真实 500 与截图保留，作为上述无差异 409 修复的 before。额外窄诊断 4/4 保存了真实 git diff、列表和提交目标，不以它替代完整 Web 消费者。外部面板 before 中有两项真实反例，但末尾观察器覆写了 `external` 数组而失败，不能据它声称无外网。`history-rollback-before.json` 的源码元数据曾指候选 WT，修正版 `-final` 才记录实际旧实现；旧 raw 未覆盖。

不承诺跨浏览器未保存状态、MCP 操作浏览器原生 Undo、历史旧文件可视面板、外部修改提交／审阅、项目 discard／reset、跨进程 git 写事务或持久无限幂等。回执仅 64 条进程内且结果必须仍为当前源／HEAD。其它文稿改变全仓 HEAD 也会拒绝旧请求，不自动重基。

最新轻量检查：类型 1251 文件、layering、tokens、skills、packages 和 diff 均通过。所有自有浏览器、workspace／DSH 子进程、home／fixture 已清，最后两轮记录的六个 owner／backend／frontend PID 均实际不存在。raw／日志为 0600，ignored 目录为 0700。

公共服务未由本片更新。四组合只证明实际浏览器布局与鼠标／键盘动作，窄窗口不等于触控设备验收。
