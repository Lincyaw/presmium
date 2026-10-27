# Studio 多标签页事件连接

2026-10-27。调查与修复仅运行于私有工作区和独立端口，没有访问或重启公共 Studio，没有修改作者文稿、运行模型或测试套件。

## 已确认的原因

两个文稿标签页足以占满浏览器同源的六条 HTTP/1.1 连接。A 持有 `/plugins/events`、`review`、`diagnostics/events`、`document/events` 四条 SSE；B 再占用两条。六条响应均为 HTTP/1.1，CDP 显示六个不同的 `connectionId`。

此时 A 发起的规范文稿 GET 与第三页导航尚未得到连接。使用同一浏览器上下文 cookie 的独立 Node GET 在 18.0 ms 返回 200，排除了该次服务或代理持锁。关闭 B 后，**原来的同一次浏览器 GET** 才开始发送：`requestStart` 为发起后 420.2 ms，`responseStart` 为 427.3 ms；第三页原导航也完成，没有重发或第二次点击。关闭标签页只用于区分原因，产品修复不要求作者这样操作。

该记录固定旧运行源码 `608a9e55`，使用无草稿的简单文稿和原版 Studio，不依赖 IDB、actor 观察器或恢复按钮。它与持久草稿消费者中“关闭 A 后原 Recover GET 立即完成”的证据相互独立。浏览器的限制见 [MDN 的 SSE 说明](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)。

## 修复与实际范围

Studio 把文稿、诊断、审阅、IR 和任务的逻辑订阅合入每页一个受认证的 WebSocket。Host 经公开 `WebServer.registerUpgrade`、`Connection.admit` 接入；原工作区 SSE 仍提供真实数据与初始状态。Node 的 EventSource 库处理上游重连，PartySocket 处理浏览器重连。订阅就绪后，任务列表再读取一次。后续定向检查还修复了迟到列表覆盖已完成任务的交错：读取按 ticket 归属，缺项只临时保留该次读取开始后观察到的真实变化；首个基线前收到事件时，在基线可用后补一次真实读取，不永久保留旧任务。独立使用 `workspaceClient()` 仍默认采用原 EventSource。

正常 Studio 通过正式 `client-hmr` 行配置关闭 shell HMR 流，启动图仍由静态模块清单装配。外壳插件启停和客户端代码重建后需重新加载；文稿、IR、诊断、审阅及任务的实时更新保留。配置及依赖唯一说明在 [接入设计](../design-dsh.md#23-请求的路径)。

选择独立事件桥的原因是：当前公开浏览器 RPC 没有原始流 opener，而官方生成器未识别外部 npm Protocol 的 Remote 声明；没有借用私有 mux、手写生成描述、fork 框架或增加内容 writer。早期生成接入未进入最终源码。

最终真实消费者固定 `6d3f087ed780d9629ee5d00f34e198c144b10797`，父提交为 `620889f9`。该轮 12 个传输变更文件逐个与 `studio-multitab-source-manifest-before-jobs.json` 一致；最终清单另记录任务修正差分。运行起止另核 31 个源码文件，包含最终 IDB actor `a9530a21…`。完整原版 `startStudio({isolateClient:true})` 构建，无源码叠层或假后端。

| 实际动作 | 结果 |
|---|---|
| 同一个 Chromium context 打开六个同源标签页及真实正文 | 六页均就绪，不关闭先开的页面；浏览器 SSE 为 0，每页一个工作区事件 WS |
| 第六页读取规范文稿 | 200，20.5 ms；单次观察值，不是 P95 或性能承诺 |
| A 原生键入并保存 | 实际 CAS 提交，其余五页正文收到该内容 |
| B 从文稿列表切换到另一文稿 | 发送三条精确取消；原文稿随后更新不覆盖 B |
| 主动断开 A 的真实事件 WS，再由 C 保存 | 库重新建立连接；A 收到新内容，无 HTTP SSE 回退 |
| 无 cookie、错误 Origin 的真实升级请求 | 分别拒绝 401、403 |
| `document: ''` 订阅根文稿 | 收到真实根文稿事件，不变成 Home 或其它文稿 |
| 非法 JSON，客户端收到关闭帧后不回应 | 前端正常退出码 0、无 signal，216.7 ms 后连接已释放 |

最终为 **17/17**。这条主线实际接入文稿、诊断、审阅三种原生订阅；没有进入 Present 或启动 web job，不能把它算作 IR／任务两种 topic 的实测。浏览器无 pageerror、意外 HTTP 错误或外网请求；401/403 是单独记录的预期安全反例。只有私有文稿的两次原生保存，没有生成、ASR 或 TTS。

这份 17 项消费者证明普通保存链；明确恢复由下面独立的 8 项消费者验证，不把它们合称同一轮。未测其它浏览器、无限标签页、网络长期半开或压力容量，也没有从浏览器 WS 断开结果推称真实上游 SSE EOF 已单独实测。上游重连采用公开库，未自行编写重试时钟。

## 原 Recover 动作的独立闭环

任务列表定向修正后，只有 `packages/workbench/src/jobs.ts` 从 17 项时的 `8923f7b6…` 变为 `dec9f0c4…`，其余 11 个传输文件逐字相同，actor 仍为 `a9530a21…`。最终 Recover 消费者以 `6d3f087e` 加这处未提交修正构建普通隔离客户端，起止核对 20 个实际源码文件；未采用早期 actor 的 onLoad 观察器。只读委托公开 IDB transaction，记录 strict 事务的 complete，不改变参数或结果。

A、B 两个同源真实 app 都保持在线，各自原生编辑正文和字幕（含发音及携带 parameters 的 cue）。消费者只让各页的 `document/change` 请求真实失败，其它连接继续运行；严格 IDB 事务中均已有独立完整备份，磁盘仍是原文稿。C 新开页面能导航并明确选择 A；C 自己后来输入的未保存草稿也先得到保护。

C 只点击一次“恢复”，首个实际规范文稿 GET 在 7 ms 返回 200，不关闭 A/B、不再次点击。C 的完整正文、字幕、原子内容与 A 的规范快照相等，A/B 原备份字节不变，C 原备份保留同 ID 与完整内容。此时没有成功源提交。随后只在 C 明确点击一次“重试”，产生唯一 CAS 200，磁盘与所恢复完整规范文稿相等；B 不同的未确认正文、字幕和备份仍在。恢复后的正常来源刷新另有 GET，未把最终总 GET 数误写成 1。

此条 **8/8**，与前述 before 7 项、普通六页 17 项分别记录。IR、任务列表迟到回执、首次基线及实际取消的独立证据见[任务与 IR 事件交错](studio-job-feedback-2026-10-27.md)，不合并为一轮通过数。故意失败的保存请求是明确的消费者输入条件，不是伪造成功服务。没有模型、pageerror 或意外 HTTP 错误。仅验证同一 Chromium context／同源的此条恢复动作，未重新运行崩溃、配额或四组合矩阵。

另只读核对了 iframe：内联 block 配置移除 `events` 且不注入 server client，因此不会为每个动画卡新开闲置 SSE。完整 live viewer 仍有站点更新 SSE，active host 另有 control SSE；本片没有实测这些后端同源窗口的容量，不把前端传输结果扩大到它们。

## 原始记录与清理

证据位于私有 `studio-multitab-transport` worktree 的 ignored `.presmium/`，目录 0700、记录 0600，不包含 cookie 或登录网址。

- `studio-multitab-transport-1793111167978/result.json`：正式 before，7/7；SHA-256 `a0638adf44ff8c3c09c6897fed55417db7aff0e360f1aa6966af1ae2813e4906`。
- `studio-multitab-after-1793113258932/result.json`：正式 after，17/17；SHA-256 `8ad484206c7105cad630393819bdb895bfe9f843b64a8fae54410e7b40de139b`。
- `ui-evidence/studio-multitab-recover-1793115113130/result.json`：独立 Recover after，8/8；SHA-256 `c918750ae0de03069bff522024e34f70a4bf08859f2f8b82e82dc0154a49665a`。同目录独立 cleanup 记录 owner `3482334`、backend `3483381`、frontend `3483477` 均已退出，临时状态、文稿和浏览器全部清理。
- 同六页 after 目录的 `cleanup-and-integrity.json`：浏览器、临时工作区、状态目录全清；owner `3252887`、backend `3253385`、frontend `3253507` 实际均已退出。
- `ui-evidence/studio-multitab-source-manifest.json`：12 文件冻结哈希、rebase 前后提交及 actor 哈希。

早期记录保留原状态：`1793110978224` 的 B 只停首页，五条 SSE 未耗尽；`1793111011741` 已复现六连接，但消费者误用浏览器 `Response.status()`；`1793111059805` 的机制断言通过，最后把正常 context POST 误计为内容写入。它们未冒称完整成功。首次 after `1793113118368` 的六页、读取、真实跨页保存五项通过，随后消费者寻找 framed Studio 本不显示的 standalone 返回按钮而停止；改用真实 AppBar 文稿入口后才完成最终 17 项。各次均独立 finally 清理，原记录未覆盖。

首个 Recover 记录 `ui-evidence/studio-multitab-recover-1793114944751/result.json` 保留为 complete:false：原操作与完整内容恢复前四项均通过，第五项过强要求 C 的原备份 raw 字节不变。actor 在恢复前通过 `#persist` 保护 C，合法推进该记录 revision；A/B 原 raw 仍完全一致，C 的 ID 和内容保留。最终消费者保存前置 C reference，改为核对其同 ID、完整内容及 revision 不倒退，再完成显式保存与 B 输入保留，没有修改产品来迁就断言。
