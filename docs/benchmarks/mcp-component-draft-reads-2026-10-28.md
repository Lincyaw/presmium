# 显式读取组件属性草稿，2026-10-28

本片提交 `b854eecb`，基于 `0f57b1bc`，让 MCP 在明确请求后读取当前组件属性稿。使用原 authoring-client 请求／浏览器 ACK／回执和属性 draft bank；没有新增 canonical writer、草稿写入工具或永久读取快照。默认客户端清单和被动 WebSocket 报告不含未提交字节。公开格式与限额以 [RFC 9.3](../rfc-mcp-authoring-actions.md#93-已接入的显式组件属性草稿读取) 为准。

## 冻结与真实消费

运行源在首次消费前固定为 10 个文件，清单 `.presmium/mcp-component-drafts/source-freeze-1.json`，SHA-256 `ca6ac078a866cd76da1a03b42bf71f8eb039ccb0ee96e2670b373612fb35e3e7`。三片消费期间没有改运行源，提交中的 10 个 blob 与该清单完全一致。

| 独立记录 | 实际消费 | 结果 | 来源记录 |
| --- | --- | --- | --- |
| `run-1793156979509/result.json` | 私有 Studio、原生属性 Dialog、官方 MCP SDK连接及公开 Presmium MCP wrapper／DSH result-pruner | 17/17 | 1191 个 package 源／清单文件首尾与当前相同 |
| `comment-draft-reads/run-1793157040857/result.json` | 另一次私有 Studio，原生新批注未提交稿与官方 MCP SDK | 11/11 | 995 个 src／package 清单／lock 文件首尾与当前相同 |
| `bank-1793157202185/result.json` | 独立真实 Chromium，直接消费公开 bank／fragment 方法和真实 strict IndexedDB | 13/13 | 1191 个 package 源／清单文件首尾与当前相同 |

第一、三行目录在该 worktree 的 `.presmium/mcp-component-drafts/`，第二行在 `.presmium/comment-draft-reads/`。这些是三个独立范围，不合称一次 41 项端到端验收。bank 消费没有启动 Studio，也不冒充人工 UI 或 MCP 并发验证。

17 项记录 SHA-256：`9e2cf49f8658e72df3754cc1d6d5ebfaf2ab154cc00080111669ce5377acb7d4`；批注 11 项：`0818a0a53ec02939dc5ca9ddc680d05210db11c34a80c84975402da29dc48cdf`；bank 13 项：`006dd7a80258505265149fe73927aca41c1eb7facde0ab5f4a48c4272125c2ec`。

## Studio 与 MCP 实际覆盖

真实组件文件、CSS、有限公开依赖链接和两份有效文稿构成私有 fixture；不是独立安装包验收。原生 Dialog 分别修改 component-a 基础参数、S1 覆盖和 component-b 基础参数，保留原 8 KiB opaque 参数。未按 Apply，canonical bytes 始终不变。

显式 inspect 以 limit 1 翻页覆盖三个不同 target，元数据不含 value、baseline、workspace identity、memberId。read 将含 emoji、引号与反斜杠的完整参数 JSON 分片拼回，与实际 IndexedDB value 的序列化逐字符相等且 SHA-256 一致；代理对中间偏移明确失败。换 block、后来原生输入、真实 IDB 读开始后再输入均使旧读取失败，不返回旧字节。成功旧回执转为历史 `current:false`。

第二窗口真实输入并严格备份后，等第一窗口实际收到 BroadcastChannel 通知、客户端 revision 推进，再读到四份稿。另向真实 IDB 写入不同 member 的协议材料及同 ID 前缀的独立合法记录，分别验证排除外成员、精确 key 不误读邻居。切到另一真实文稿后只读到该 scope 的空列表，旧引用拒绝。这不等同于多成员登录或跨窗原子一致性验证。

77 次公开 wrapper 响应实际通过阈值 8192 的 DSH result-pruner，保持有效 JSON，最大 4392 UTF-16 字符；真实 WS frame 最大 3373 UTF-8 字节，补齐 host lease 的 ACK 最大 3618 字符。批注回归同样拼回原生 Unicode RichText JSON，最大回执 5155 字符、WS 5194 字节；该轮未重复运行公开 pruner。它验证提取共用 fragment formatter 后的原批注读取链，没有声称全部批注生命周期重验。

## 严格存储与并发范围

bank 消费使用单独随机 scope、真实浏览器 WebCrypto 和 strict IDB。消费者只延迟已经真实完成的 transaction callback 交付，或明确 abort 一次真实 transaction；没有伪造存储结果、任务或服务响应。

- A 的 clear 已提交但回调暂未交付时，agent 读取 unavailable，B 的 human bank.clear 仍完成；释放后各自精确退休。
- 旧 clear 期间后来输入不被退休。A 恢复已严格提交 fork、回调仍 held 时，B clear 成功；A 后来输入保留，旧恢复返回 false，已提交 fork 仍可取回。
- 另一 bank 对备份作 exact token discard 不会隐藏本 bank 的可见最新输入；该输入按 session-only 读取。
- 超过 1 Mi UTF-16 字符的最新值仍可按 session 稿读取。旧 token 被拒绝，首尾片的摘要与完整最新 JSON 相等，没有写入超限 IDB。
- 一次真实 IDB transaction abort 后，状态为 session-only，读取仍取当前值，不回退旧 durable 字节；停止只读 observer 会推进 scope revision。

这是公开 bank 协议的并发证据；没有证明两个原生 Dialog 可同时 Apply，也没有验证操作系统配额耗尽、浏览器进程崩溃或跨进程持久一致性。`current` 只描述读取时快照及已报告 revision；IDB commit 与 BroadcastChannel 到达之间没有全局原子锁。

## 保留失败与清理

三份早期 bank 观察器记录原样保留：`1793157135083` 在五项通过后收到真实 BC 变更，读取按契约拒绝；`1793157171754` 错把 JSON.parse 后对象要求为同一引用；`1793157186770` 的尾片 offset 落在 emoji 代理对中间而被正确拒绝。修改仅在 ignored 消费者中：显式重读已变 revision、按值核对、使用合法偏移。没有把失败 raw 改绿，也没有改产品来迁就观察器。

两次 Studio 的 backend／frontend、浏览器、私有 home／workspace／fixture 均已关闭或删除；登记的五个 Studio owner／子进程 PID 实际不存在。bank 的浏览器与随机端口服务均已关闭。所有轮次 0 模型请求、0 外部访问；Studio 两轮 0 browser error／HTTP error。未操作公共 4320／17407。

轻检查：types 1318、layering、skills、packages 40、diff 均通过。没有新增 tracked tests，没有运行套件、完整示例或模型。没有新增 UI 视觉控件／CSS，因此未另造 Figma 节点或四组合视觉验收。
