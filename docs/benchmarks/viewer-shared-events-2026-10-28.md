# 完整查看器复用 Studio 事件连接

2026-10-28，隔离 worktree `viewer-event-transport`，基于 `47acebe594e1b7fe15d095736bab07ff9d80e168`。产品改动限十五份运行源码，无新依赖、内容 writer、时钟或重试队列。原始容量反例见[只读调查](viewer-event-capacity-2026-10-28.md)：三个完整放映页的六条 HTTP/1.1 SSE 曾阻塞动画模块及普通 GET；关闭其它页仅作为因果探针。

## 共享边界

Studio 中的完整查看器经既有 nonce／来源／iframe 窗口校验与 `ready` 握手，复用该 Tab 已有的认证 workspace WS；site 与课堂 control 是两条固定逻辑订阅，不另外建立网络协议。父页面固定文稿，包括根文稿空字符串；每 frame 至多两条，原 socket 的 16 条、8 KiB 输入和 2 MiB 背压界限不变。Node 只从严格字段构造固定端点，保留 app key、语言、形态与 control window，命名事件仍交由原查看器处理。详细契约在[预览协议](../design-dsh.md#4-预览协议-v1)。

没有可注入能力的父页面与独立查看器保留 EventSource；正文单块预览不建立这些订阅。暂停后的 control 取消、重载后的新代次、关闭后的资源释放沿原 owner 生命周期。site 更新没有被禁用来规避连接上限。

## 实际运行

所有 Studio 消费者使用原版 `startStudio({isolateClient:true})`、私有 workspace、随机端口、同一个 Chromium context 与仓库真实 Motion 场景。每轮只准备小文稿的 web 形态；没有 ASR、TTS、模型、外网请求、全量示例构建或测试套件。

| 独立证据目录（ignored `.presmium/`） | 真实结果与边界 |
| --- | --- |
| `viewer-event-after-1793119047585` | 前十项成立：三页动画、GET、实际标题更新、真实 MCP 审批与导航；最后在源更新后点击 iframe 内退出，父级 pending-snapshot 门禁拦截指针，`complete:false`。保留原失败，不作完整流程通过。 |
| `viewer-event-after-1793119225059` | 14/14：三页同时放映有三个现有 WS，浏览器后端 SSE 为 0。A/B 不关闭，C 真实 Motion 六柱出现，普通 GET 29.6ms；两页时 22.1ms。单次观察值，不是 P95。 |
| 同一 14 项记录 | 退出到 Doc 取消两个预览读者；同一个 iframe 实际 reload 取消旧 ID、用新代次恢复。另一个独立查看器窗口仍打开两条真实 SSE。实际 canonical CAS 修改标题后，三个 viewer 文档收到 site IR 更新并呈现新标题；父级可操作性另见下面保留的问题。官方 MCP `navigate` 触发真实审批，经同 owner 公开 HTTP 确认，三窗均收到 approval／settled／go 并呈现目标页，返回 `windows:3`；不是原生审批按钮验证。该数量也没有保留退出／reload 前的多余 control 窗口。 |
| `viewer-event-final-protocol-1793119392322` | 7/7，最终协议增量：旧 connection、跨文稿与额外 reader 未形成 WS 订阅；旧五 topic 全部通过真实认证连接就绪，实际 document／diagnostics／review／IR 数据帧精确保持 `{type,id,data}`。无任务，未伪造 job 数据帧。新 viewer 的命名 ready／IR 帧仍实际更新动画。 |
| `preview-events-lifecycle-1793119533092` | 5/5，最终 parked 守卫：公开 `createPreviewEvents` 的 Chromium 消费者验证 park 后迟到 go 不派发，pageshow 后重新订阅并派发；实际导航产生的 trusted pagehide 也不派发该迟到消息。park/pageshow 分支另使用显式合成生命周期事件，不声称完整操作系统 BFCache 验收。 |

前置原始 14 项之后只改了 DSH 三个事件适配文件：原五 topic 不增加字段，新通道严格检查事件名。随后只在新 kernel leaf 增加 `!parked` 守卫。四处逆差分均按实际字节核对，原 14 项不冒称最终全部字节重新运行。源码与原始记录 SHA、完整谱系见 `.presmium/ui-evidence/viewer-shared-events-final-manifest.json`。

## 独立保留的问题

源更新后，旧 PresentationSnapshot 与新 IR 不同，整个 iframe 指针门禁同时遮住“退出放映”和“重新编译”。14 项记录在修改源前正常点击退出并验证释放，修改源后只读采样两按钮坐标：此前父文档 `elementFromPoint` 命中 IFRAME，更新后均命中 `DIV.pmw-preview__stage`。同轮 `three-present-updated.png` 实际捕获源更新瞬间的“正在打开文稿”过渡态，不作三页最终可见截图依据；内容与控制结果来自原 viewer DOM／真实协议。没有用 force click、隐藏门禁或重复选择把这个问题改成通过；它留给独立界面修复，本片只解决连接容量与消息归属。

未验证其它浏览器、任意标签页数量、真实后台 Tab、全套课堂工具或 app bundle 变化的自动 reload。已覆盖手动同 iframe reload、真实 site IR 更新、真实审批和导航；没有把它扩大成所有课堂操作验收。

所有私有浏览器、Studio 前后端、生命周期 HTTP server 均已关闭，home／workspace／fixture 清除；原始失败记录保持不变。未访问公共 4320/17407，未修改作者文稿。最终轻检和实际 PID 退出状态记入 manifest；没有新 tracked tests 或套件运行。
