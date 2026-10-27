# 原生批注回复与编辑草稿恢复

本片从 `ad75f6ac` 实现原生 reply 与已有 comment edit 的浏览器备份。未提交的 `RichTextNode[]` 保存在既有 strict IndexedDB owner 中，不写入 `lecture.json`。尚无 thread ID 的新建 thread composer 未覆盖；MCP 读取、恢复这些客户端字节也未在本片接入。

## 行为与边界

公开 `useThreads` 与 `Thread` 组合侧栏，在上层 Thread 绑定明确 thread ID；已有评论再以该线程内稳定正文 ID 对应 comment ID。原生 Comment、Comment.Editor、CommentsExtension、选区和 Save/Cancel 继续由 BlockNote 处理，不 fork 或导入依赖内部模块。

`CommentDraftBank` 属于 Workbench，文稿表面卸载不退休内存稿或未结束的备份。每份输入稿复用 `DocumentDraftStore` 的单 flight、latest pending、strict complete、跨 Tab 校验与关闭规则。域包含实际 workspace/document identity 和可信 member。目标还固定 thread/comment 的创建标识，edit 固定原目标正文基线，不把复用的字符串 ID 当作同一目标。

恢复前明确选择候选，先确认当前输入的 strict 提交，再 fork 所选内容；每次 await 后复核输入、源版本、composition 和存活归属。恢复本身不保存到服务器。目标正文变化时仍可恢复查看旧稿，但 Save/Enter 沿原版本 guard 拒绝覆盖。目标删除时提供原生只读稿与精确丢弃，不绑定到另一个目标。

原生提交后保留固定 pending 记录，只在实际 canonical source 的目标内容、身份和时间均匹配时退休。后输入使用另一份记录，旧 ACK 不清新稿。显式丢弃只标记选中 `id/revision/SHA-256(raw UTF-8)`，不吞其他 Tab 的记录。取消现有评论编辑只清该次原生稿；卸载本身不是取消。

备份序列化上限为 `1 << 20` 个 UTF-16 字符。超过该门槛或 strict 存储失败时，最新稿仍留在同一个 Workbench owner 中，明确标为“仅本会话”，并可用原生只读表单取回；不把旧持久稿当作最新输入，不截断或向 IndexedDB 写入超限正文。不能确认 strict 新副本时禁用恢复，用户仍可取稿、减小后明确 Save，或精确丢弃。未完成、失败和组合输入保留离开保护。此记录验证实际大稿 admission 拒绝，没有验证真实磁盘 quota、故障断电、物理中文键盘、全部浏览器或新建 thread composer。

## 实际记录与源码谱系

以下 ignored raw 均在本片 WT 的 `.presmium/native-comment-drafts/`；不将不同源码冻结的检查拼成一次验收。

| 记录 | 实际范围 | 结果 |
|---|---|---|
| `before-1793134820462/result.json` | reply/edit × 关闭侧栏、切 B 回 A、普通 reload；实际 canonical 版本与内容未改 | observation 7/7；六条均丢稿，`productCorrect:false` |
| `after-v2-1793135902409/result.json` | 相同六条，经真实 IDB 提交后显式选择恢复；正文保持可编辑，未自动发布批注 | 7/7，source stable，全清 |
| `boundaries-1793136376670/result.json` | 原生真实 POST200 held ACK→后输入、旧稿恢复后 Save/Enter guard、无关正文实际保存、native Cancel、外部删除取稿、双 Tab 精确丢弃、Chromium IME preedit 与真实 beforeunload dismiss | 11/11，source stable，全清 |
| `resolve-matrix-1793137488238/result.json` | 真实外部 resolve 不清 edit，resolved thread 的 reply/edit 均可恢复；1440/390 × light/dark 恢复实显，两个 edit 场景实际 native Save | 10/10，source stable，全清 |
| `admission-1793137600644/result.json` | 先有旧小稿，再输入 1,048,722 字符；不写超限 IDB/canonical，卸载后原文 SHA一致可取回、strict 恢复不可绕过、减小后明确 Save、只丢所选 session 稿 | 7/7，source stable，全清 |

各轮按实际 `sourceStart/sourceEnd` path map 记录：`after-v2`、`boundaries`、`resolve-matrix` 各有 10 个文件，其中 7 个为本片修改运行源，另 3 个是未改的 `document-drafts.ts`、`document-draft-store.ts`、`document-session.ts` 基线；这三轮没有把 `messages.ts` 纳入起止清单。`admission` 最终 11 文件补入 `messages.ts`，完整覆盖 8 个修改运行源与 3 个基线，全部起止及当前字节匹配。

`after-v2` 后仅在两个新增模块调整失败反馈、保留恢复原基线、续接同一个 native Thread reply editor 的记录。`boundaries` 后再为 admission 保留会话最新稿、标明 durable/session，并在 `BlockNoteSurface.tsx` 区分侧栏与浮层，避免重复警告；消息加入“仅本会话”及短失败事实。`resolve-matrix` 的 10 个已列文件与最终源码相同，最后 `admission` 补齐消息文件。旧 7/7、11/11 保留各自冻结版本，不称为最终所有字节的整轮重跑，也不合并总分。

公开 0.56.0 `Comment` 只通过自己的 Save/Cancel 把 `isEditing` 置 false，再传给 `Comments.Editor.editable`；`Comments` 的 resolve 仅增加 summary，不改变原 Comment key 或编辑状态。卸载走 cleanup，不触发 props 的 Cancel 转换。最终 resolve 实际链确认 edit 内容仍在、两个目标稿都可恢复；外部硬删除的取稿另在 boundaries 实证。没有另跑 soft-delete 或成员身份动态替换用例。

四张最终恢复图与大稿取回图已逐张查看，无横向溢出；恢复仍使用原生表单和既有公共控件，没有新增 CSS、颜色或素材。正式设计复用 Figma `CjQ5JFn3PuGXx0NgwYrCR8` 的既有 I01 `241:843`：本次先读 `figma-design-to-code`，用原团队账户建立 session `d75210c7-aefd-49f1-9132-3264c934df35`，实际读取 design context 及截图；没有新建节点，ledger 只登记已读取的公共控件组合。

`DocumentSession.flush` 仍只确认 canonical 编辑事务，不代表未提交原生批注表单已 Save，也不代替这些浏览器备份的 strict 完成。

Chromium IME 使用真实 `Input.imeSetComposition`/`Input.insertText` 协议，触发原生组合事件和实际离开确认；不代表物理中文键盘验证。所有链为私有最小文稿，0 ASR/TTS/模型，未准备 IR，未碰公共端口。

保留的未完成观察器记录：

- `before-1793134739105`：首条已观察丢稿，后续错用 standalone “Back to documents” 定位；固定为 DSH 实际 Documents 按钮后才完成 before。
- `after-first-1793135564293`：恢复选择框已实显；消费者用 wrapper 外的祖先 CSS 作 `has` 过滤，未定位到它。
- `boundaries-1793136186603`：真实 native Save 已提交；观察器把原生空段落换行严格等于空字符串，超时。
- `boundaries-1793136238523`：前两条实际通过；点击 Recover 后 strict 操作仍 loading，观察器立即断言失败。后续只等待真实恢复内容与 Notice，再继续断言。
- `resolve-matrix-1793137145440`：实际 resolve 保稿首项通过；后续假设零计数按钮名为 `Comments (0)`，未定位到实际控件。修正匹配后才完成最终 resolve/四组合。

上述失败原 raw 与图片不改写。未新增 tracked tests，未跑 suite；最终类型、分层、技能、发布检查与精确 SHA/进程清理清单在 ignored final manifest 中另列。

后续安全收口见[批注 canonical 确认门禁](comment-draft-canonical-ack-2026-10-28.md)：真实 A 晚 ACK/B 事务 413 反例表明，合并了后来 dirty 内容的 actor 版本不能确认整个批注快照。该独立修复要求 clean source，并保留本记录各轮原始谱系。
