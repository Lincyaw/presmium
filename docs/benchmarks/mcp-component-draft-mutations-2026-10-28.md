# 显式恢复与丢弃组件属性草稿，2026-10-28

运行提交 `adc756d3` 基于 `8903e36f`。MCP 经原 authoring-client 请求／executing ACK／终态回执调用现有属性 bank 的 recover、clear、discard。恢复严格 fork 后才采用，保作者原稿；丢弃只退休明确版本，保未选 origins。它们不改 `lecture.json`，不自动 Apply、重新绑定、导航或聚焦。具体格式与 unavailable 条件以 [RFC 9.3](../rfc-mcp-authoring-actions.md#93-已接入的显式组件属性草稿读取) 为准。

## 版本与实际范围

最终 10 个运行源清单是 `.presmium/component-draft-mutations/source-freeze-3.json`，SHA-256 `e26403694c4515c92b980edc9bc45f2a08de74d7ec5ae80bad2e1412eb11ae5d`。下列三片与批注回归的登记来源首尾均一致，且等于该提交字节；没有在 live 消费者期间改源。

| 记录目录 | 实际消费 | 结果 | 来源登记 |
| --- | --- | --- | --- |
| `run-1793159019557` | 私有 Studio、原生属性 Dialog、官方 SDK 与公开 MCP wrapper／DSH pruner | 前 13 项全部通过，尾部观察器自锁，`complete:false` 保留 | 1192 文件 |
| `run-1793159184087` | 只补真实 WebSocket 断连／重连取消尾链 | 6/6，`complete:true` | 1192 文件 |
| `bank-1793159035160` | 公开 bank／DocumentDraftStore 方法、真实 Chromium strict IDB 与 BroadcastChannel | 9/9，`complete:true` | 1192 文件 |
| `comment-draft-reads/run-1793159308250` | 另一次 Studio 原生新批注未提交稿与 SDK 完整 Unicode 分片读取 | 11/11，`complete:true` | 996 个 src／包清单／lock 文件 |

前三行在本 worktree 的 `.presmium/component-draft-mutations/`，第四行在 `.presmium/`。各片范围分列，不合称一轮全通过。bank 是公开方法协议消费者，不冒充原生 UI 或服务端任务。

各原始 result.json SHA-256 依表顺序为：

- `3b287f58bb0c86e48a49a83182eaec82aad15cc7948ec0e4ea627fdd6f49af07`
- `f581408c7485b58847334b317cca1cc2d534da18efdfa688789c21f903a43cb9`
- `da2979d34e093818d5b47093d5b7da893515d7608a970a59dbc26da835860044`
- `913434cf1cbea1bcdf12f6a59f3f60782404d8ddb6144fc0328d74a6e35b7741`

## 原生表单与 SDK

私有 fixture 使用真实 React 组件／CSS、有限公开依赖链接、两份 canonical 文稿和保留的 8 KiB opaque 参数。窗口一原生输入 A，窗口二输入并 strict 备份 B。inspect 实际区分当前 A 与 backup B；不给 A 引用而传 expectedCurrent:null 时恢复拒绝，未创建分支、未盖输入。

正确引用恢复返回 done，原生 Dialog 显示 B，实际 IDB 同时保留 A、原 B 和新 UUID/revision 1 分支；canonical bytes 未变。随后重放同一个已经观察成功的 request，回原分支且记录数不变。这里验证 retained-intent 重放，没有人为丢弃第一次 SDK 响应，不称实际网络丢 ACK。

精确丢弃恢复分支后，原 A 和未选 B 都仍可 inspect；backup discard 仅退休选中的 B token，B 旧读取拒绝，A 保留。再恢复 A，只有作者点击原生 Apply 后 canonical 才改变，另一 component 保持原值。新 source 拒绝旧 mutation 请求。

消费者通过公开 IDB API 延迟已经真实提交的 fork transaction 完成回调，随后原生输入新值；旧 restore 失败、不覆盖新值，已经提交但未采用的分支仍可 inspect。取消尾链在相同严格 fork 检查点主动关闭真实 WebSocket：旧请求 expired，无虚构 done；释放回调后当前 A 仍在。真实重连换 connectionId 后能 inspect 已提交分支，canonical 未改变。没有伪造存储结果、服务响应或任务。

SDK 响应实际通过原阈值 8192 的公开 DSH result-pruner，完整 JSON、WS 与补齐 lease 的 ACK 仍受原有预算；没有提高传输上限。目标 member／identity／source、Definition／步骤归属、pending／session-only／IME 拒绝门槛也已静审。除上述正常、后来输入、断连和旧 source 外，本轮没有逐一浏览器复现每个 unavailable 条件。

## 真实缺陷与通知修复

初版虽然表单已显示 B，回执却 failed/client-component-drafts-changed。这是写入已发生后的反馈缺陷。属性 writer 的 BC 消息被同 bank reader 再次计数；只做随机 owner 去重后仍失败，因为同 scope 的常驻 CommentDrafts reader 还把组件通知计成批注变化，晚于 done 捕获推进合并 revision。

最终通知只带 scope、明确 family 和可选随机 bank owner，没有 target、参数或正文。属性 writer／reader 共用 bank owner；已经由本地 touch 报告的同 owner 通知去重。comment／component 已声明 reader 忽略明确不同 family；不同 owner、默认未声明 reader 和旧无 family 消息仍保守通知。只读 expected revision 与写动作 done 的最终 revision／source／epoch／connection 门槛均未放宽。

真实 BC 9 项证明：own keep／recover／clear／discard 各自完成都有准确本地 revision 推进，无重复通知；component 不触发 comment reader，真实 comment-family strict 写入仍触发 comment reader而不重复触发 component；旧无标识 strict 通知仍使 observed revision 失效。随后原生批注／SDK 11 项在最终字节完成，完整内容与摘要一致。它不是全部批注生命周期或多用户权限矩阵的重验。

## 保留记录与限制

- `run-1793158417079`：一项后只读 inspect 被当前状态变化安全拒绝，观察器错要求 done；原红保留。后来只对只读 inspect 显式重读状态，不盲重放 mutation。
- `run-1793158476951`：初版 8 源，恢复已发生却失败的真实产品反例。
- `run-1793158775292`：owner-only 9 源，恢复仍发生却失败的剩余跨 family 串扰反例。
- `bank-1793158832332`：owner-only 7/7，证明同 bank 去重本身，但不代表串扰已解决或等于最终 family 字节。
- 最终原链 `9019557` 的 13 项后，观察器持有严格完成回调，又 fresh 等待本来就应关闭的读取门禁，导致自锁。原 `complete:false` 不改；独立取消尾链改用执行前已绑定 connectionId，没有放宽产品门禁。

当前性仍是已读快照与已报告 revision，IDB 与 BC 不是跨窗全局原子锁。取消不承诺撤回已经开始的 strict 提交，原意图未知时先 inspect。没有开放批注恢复／丢弃、任意客户端草稿写入、自动提交参数、跨进程账本或物理触屏验收。

所有自有 Studio owner／backend／frontend 已退出，浏览器、私有 home／workspace／fixture 和 bank 随机端口均清理；没有模型／外部调用，没有操作公共 4320／17407。轻检查 types 1320、layering、skills、packages 40、diff 通过。没有新增 tracked tests、运行套件或完整示例。未新增 UI 控件或样式，未新增 Figma 节点。

## 4320 更新

运行版本 `bc6c78bce2be148570f1647e721a9475b9a22e2a` 已更新至工作台。组合版本的真实 Studio 与 MCP 客户端操作通过 17 项，包括断线取消；在线只读检查 23 项通过，客户端已声明恢复和丢弃动作且被动状态不包含草稿内容。独立快照构建通过 1242 项来源检查，客户端 SHA-256 为 `bd0ab2d3fb8fa9b7917368e100d0f2de3987f2c51fbce6e754a3859b051dba36`。双 host 的既有认证会话正常，更新过程保留 11 份文稿。
