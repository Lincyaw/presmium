# 文稿历史：查看与明确撤消

Web 历史面板和 MCP 使用同一个工作区 `DocumentHistory`。它借用已有 Revisions、文稿锁和 git 队列；不另存一份文稿，也不请求编译、模型或播放。契约与输入校验以 [document-history.ts](../packages/kernel/src/contracts/document-history.ts) 为准。

历史操作针对当前仍在服务的文稿。空目录 `document: ''` 表示根文稿，不表示整个工作区。读取和修改都保留现有 editor 权限；MCP 修改还需要宿主 operate 授权，配置 required review 时拒绝执行。

## 查看历史和文件

`get_document_history({ document?, snapshot?, offset? })` 每次返回最多 20 条原修改。撤消／重做提交用于计算状态，不单独占用这 20 行。每条原修改的 `undone` 和 `revertTarget` 来自完整历史，不能用局部页重新推断。摘要和文件列表可能缩短，响应以 `truncated` 标明；提交 ID 不缩短。

返回的 `historyBinding` 包含已保存原文的 version／fingerprint 和实际 git HEAD `snapshot`。继续读取携带同一 snapshot 与 `nextOffset`，源或历史变化返回 409。Web 用公共按钮明确读取较新／更早的一页，不自动聚合全部版本；新保存源确认后刷新当前列表，旧读取不能覆盖新状态。

`read_history_file({ document?, revision, path?, offset? })` 只读指定可达提交中的常规 UTF-8 文件；省略 path 时读取该文稿的 `lecture.json`，显式 path 使用工作区相对路径。文件最多 2 MiB。响应按 UTF-16 偏移返回文本片段、实际原字节 SHA-256、`nextOffset` 和 `complete`；保持 revision／path 不变，拼接解码后的 text，完整后再按需要解析 JSON。不会拆开有效代理对，也不改写换行或 BOM。

读取仍核同文稿路径策略，并按当前配置和历史树中真正的常规文稿入口判断归属。隐藏路径、二进制、符号链接、跨文稿文件和超限数据被拒绝。当前 JSON 损坏不阻止历史列表或旧文件读取。没有 git 时返回 `available: false`；尚无 HEAD 的 git 仓库返回空历史及 `unborn: true`，不构造假修订；无父提交的首个基线不可撤消。

请求最多 2048 个 JSON.stringify UTF-16 字符，默认响应最多 7168 个缩进 JSON UTF-16 字符。历史目录树元数据每批也有大小限制，超限明确拒绝，不部分判定归属。

## 撤消与重做

先读最新历史，再提交以下之一：

- `undo_document_change`：expect 使用该读取返回的 `undo` 完整提交 ID。
- `redo_document_change`：expect 使用该读取返回的 `redo` 完整提交 ID。
- `revert_document_change`：expect 使用明确选择的原修改或其 `revertTarget`，与 Web 逐条操作相同。

三者都传 `{ document?, request: { id, source, snapshot, expect } }`；source／snapshot 原样取自 `historyBinding`。`id` 是本次明确意图的稳定 ID。实际执行在同一 git 队列内复核原文字节、HEAD、目标和文件；普通 undo／redo 还复核它仍是下一目标。其它文稿的新提交也会改变全仓 HEAD，不能自动重基或换一个目标重试。

修改只作用于这个文稿范围，混合或越界提交、不可达提交、目标文件未提交的工作区或暂存区改动均拒绝。git 提交失败时恢复本次目标及原 index，其它未提交内容不纳入本次修改。成功产生新的 revert 提交，不 checkout 旧树，不开放通用 discard、reset 或项目恢复。

回执只确认实际保存，编译与运行仍为未请求。丢回执后重试同一 id 和相同参数；最多 64 条进程内回执，仅当结果 source 和 HEAD 仍是当前状态时复用。不同参数、已知结果过时和 Undo／Redo 后的 ABA 均拒绝，不承诺跨重启或无限保留。

正文／字幕的原生 Undo 继续由原编辑器管理。MCP 不控制浏览器的未保存输入、原生历史或草稿。历史文件目前经共用 HTTP／MCP 读取，Web 未新增旧文件查看面板。外部修改提交、审阅、项目操作与跨重启意图账本仍是后续范围。
