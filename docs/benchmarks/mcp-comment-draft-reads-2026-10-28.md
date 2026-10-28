# MCP 显式读取批注草稿

2026-10-28，从 `beb22a7781dfa44e4dd634159ea0ca888a3eae2c` 的独立工作树实现 `comment-drafts.inspect/read`。动作沿既有 authoring-client 连接、operate admission、executing ACK 与回执执行，只借用当前可信 member／文稿的原批注草稿 owner。默认客户端状态不读取或携带草稿列表、正文。显式读取不写 canonical、不恢复／丢弃草稿、不编译或切模式。协议与限制定义在 [MCP authoring §9.2](../rfc-mcp-authoring-actions.md#92-已接入的显式批注草稿读取)。

## 实际运行

使用私有真实 Studio、临时规范文稿、官方 MCP TypeScript SDK 与 Chromium，原生选择正文并通过 Add comment 输入。最后一轮 `run-1793145445618/result.json` **35/35、complete=true**。原始脚本、结果与帧观察保留在忽略目录 `.presmium/comment-draft-reads/`，索引为 `final-manifest.json`。

- 默认客户端查询与被动 WebSocket 报告没有指定未提交内容标记；显式 inspect 仅返回白名单元数据，read 才返回内容。显式读取前后的 canonical 字节相同。
- 含中文、emoji、组合字符、引号、反斜线与制表符的原生批注内容，序列化后为 10,583 个 UTF-16 单元、29,786 个 UTF-8 字节，分六片完整重建。SHA-256 为 `8886aaf906c0e3258efd586e33aeebb2950e9975fdb91dff5fc6176af8a123d3`。代理对中间偏移明确拒绝。
- 三份草稿按 limit=1 完整分页；更改内容后旧列表 token、旧 draft token 与暂停在 IndexedDB 中的旧读取均拒绝。成功旧回执保留为历史，`current:false`；同意图重试保留原引用。
- 原生清空发生在 strict 删除尚等待真实 IndexedDB 锁期间时，旧读取失效，不能返回刚清空的旧稿。读取中的存储未就绪状态也不能伪装为空列表。
- 原生输入超过 strict 1 MiB admission 后，最新 1,060,141 个 UTF-16 单元的 JSON 内容仍在原 owner 内存中。inspect 如实返回 `storage:session`，旧 durable token 拒绝；显式 read 的完整内容摘要与当前原生内容相符。原 IndexedDB 记录确为旧字节，没有把内存稿冒充已持久保存。本轮只取该大稿首片并校验其完整摘要，没有把整份百万字符内容分页取完。
- 实际 IndexedDB 中另一 member 前缀的记录不被当前 owner 列举或读取；切到另一文稿后无法读取原稿。真实同源刷新产生新 epoch，旧连接不能派发，旧回执不再 current。这是不同 member 存储记录的负向探针，没有登录第二个真实账号。

完整传输预算按真实发布帧和回执计量：

| 项目 | 本轮最大值 | 现有上限 |
| --- | ---: | ---: |
| 实际共享 WebSocket 完整帧 | 7,591 UTF-8 字节 | 8,192 字节 |
| 补足较长 client／epoch／nonce 的完整内部 ACK | 7,838 UTF-8 字节／4,075 UTF-16 单元 | HTTP 32 KiB／7,168 单元 |
| 完整 MCP 回执 pretty JSON | 4,752 UTF-16 单元 | 7,168 单元 |

草稿 ID、文稿／页面／步骤身份及原 source 均保留在 envelope 中。结果分页动态按完整 envelope 缩短；没有提高 WebSocket 上限。该轮 HTTP 失败、pageerror、模型请求与外部请求均为 0。

## 发现与修复

`run-1793145070074` 保留了真实反例：18 项通过，第 19 项失败。原生 Ctrl+A／Backspace 已清空，但 strict 删除还在真实 IndexedDB 事务锁之后等待，旧 inspect 回了 done。根因是草稿 owner 只在删除提交后更新变更代次。现在 clear／discard 进入时立即更新代次并暂时关闭读取，原事务完成或失败时在 finally 成对释放；不更换 writer，也不把失败当作已删除。

修复后的 `run-1793145195497` **29/29** 及最后 **35/35** 均包括相同锁定顺序和原生清空反例。两轮运行的 977 个观测输入起止与当前字节一致，覆盖全部九个本次运行源。观测范围为 packages 的 TS／TSX／CSS 源码、各包 package.json 与根锁文件，不包含 vendor、builder 的全部依赖或本次随后补写的文档。

保留早期记录，不与最终通过数相加：`run-1793144377845` 9/9 只证明短文本初始闭环；`run-1793144670584` 2 项通过后因额外换行输入的 DOM 观察超时而未完成；调整输入观察后 `run-1793144768327` 27/27 完成。后两次完整 29／35 轮包含 clear／discard 变更代次修复，早期 9／27 轮不冒称对应最终全部源码。

## 收口与边界

九个运行源经独立隐私、归属、当前性和预算审查通过。最终类型检查为 1,284 files；分层、令牌与技能检查通过。所有私有运行均已终端，浏览器、Studio 及观测子进程清理完成；未操作公共 4320／17407，未新增 tracked tests，未运行测试套件。

本片没有视觉样式变化，未把这次 Chromium 操作当作新的明暗／宽窄四组合验收、系统 IME 或物理触屏验收。未验证跨进程在线登记、第二个真实账号、所有草稿种类或所有存储故障。MCP 的批注 restore／discard、其他表单草稿和录制仍 unavailable；原 UI 的恢复入口保持原有 owner。
