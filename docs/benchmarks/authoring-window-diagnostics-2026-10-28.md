# 无 IR 的作者窗口诊断

2026-10-28，隔离 worktree `authoring-diagnostic-producer`，基线 `53fc871a`。原生 Doc 的工作台异常和 5xx／网络失败现在通过独立 `AuthoringDiagnostics` 生产者报告，不再等待 `state.ir`。协议见[未编译的作者窗口](../diagnostic-feedback.md#未编译的作者窗口)。

原反例在 `mcp-diagnostic-feedback` worktree 的 `diagnostic-feedback-after-1793120411923/result.json`：真实原生保存请求被受控返回 HTTP 500，作者看得到失败与草稿重试入口，MCP 却没有收到该请求诊断。该记录证明缺口，不作为新生产者通过数。

运行改动限七处：kernel 的诊断契约与 ID、server 的快照与报告路由、Workbench client、DSH 的代理和根窗口生产者。报告保留请求开始或异常发生时已知的保存基线，未知时省略；不造 IR revision，不上传草稿正文、请求 payload、stack 或凭据。按受信 member／窗口 instance 独立替换与清空，编译不清这一来源。快照和诊断均复制嵌套基线。没有新计时器、writer、模型或结果账本。

## 真实浏览器与 MCP

忽略目录 `.presmium/ui-evidence/diagnostic-feedback-after-1793122470802/result.json` 完整 23/23。原版私有 Studio、公开浏览器操作、官方 MCP SDK、实际 DSH wrapper/pruner 与真实工作区运行；没有 mock 保存、MCP 或宿主。

- 35 条实际插件检查结果经版本绑定分片完整读取，最大回复 7168 字符；浏览器显示其中 18 条 error，另 17 条 warning 仍在完整快照中。
- 编辑原生正文，一次实际 `document/change` 被受控返回 HTTP 500。作者展开详情看到失败，MCP 读到 `origin: 'authoring'`、没有 revision，authoringSource 精确等于失败请求开始时仍保存的 canonical 基线。未保存的新正文没有进入诊断报告。
- 第二个正常作者窗口实际抛出异常，报告前移除测试 token 文本；明确收起其提示后，第一窗口的保存失败与全部 35 条 check 贡献仍保留。另一文稿快照保持为空。
- 实际 HTTP 拒绝缺启动令牌、未知字段、超过 20 条／600 字符、无效基线、超过 64 KiB 和不存在文稿，分别核对 401／400／413／404；被拒绝请求不改变快照。
- 真实点击保存重试，原输入 `UNSAVED_FAILED_REQUEST` 落盘，恢复请求只清对应作者实例的请求错误。期间一次正常 409 使消费者从首片重读，没有混接版本，也没有重启服务。

该轮包含六次实际报告 POST 200、两个独立 instance。七处候选与其余七份观测运行源起止／当前 SHA 全部相同；私有 owner／backend／frontend PID 均已退出，浏览器、MCP、pruner fibers 和临时 home／workspace／fixture 清理。没有外网、模型、IR 预览、ASR、TTS 或公开 4320／17407 操作；插件编译／检查只由前置显式检查触发，保存重试后原有监测编译不被算成被动诊断读取。

## 保留的观察器失败

补充冷启动记录 `cold-authoring-report-before-1793123182322/result.json`：首次规范文稿 GET 500，首次报告 POST 500，显式“重试发送诊断”后同一报告被接受；MCP 得到没有 authoringSource／IR revision 的真实错误。前五项通过，期间没有自动报告风暴。末尾原生正文“重试”未再次发起 GET，整轮保持 `complete:false`；这是 DocumentSession 尚无 slot 时的独立重试缺陷，不计为作者诊断生产者的恢复通过。十四处观测源起止一致，三处自有进程与全部临时资源已清理。

`1793122075442` 通过前 14 项后，因将单页 convenience context 继续作为多页 context 使用而失败。`1793122312335` 通过前 21 项后，消费者未处理保存恢复期间的正常快照 409 而停止。两份原始记录均保持 `complete:false`，没有补写末尾源快照；其起始 SHA 与当前核对一致。最终消费者改用显式 browser context，并按已发布协议最多四次从首片重读，未为探针修改产品。

已实际查看亮色桌面诊断详情与保存失败两图；没有修改 UI／CSS，未据此声明四组合视觉验收。类型检查 1248 文件、分层、技能、40 个样式令牌、40 个工作区包及 diff 检查通过；没有新增 tracked tests 或运行测试套件。

这只证明已选作者窗口的反馈。窗口在线状态、全局未关联文稿故障、浏览器崩溃及完整草稿／客户端控制仍需独立协议，观察到的保存基线也不等于当前源通过验证。
