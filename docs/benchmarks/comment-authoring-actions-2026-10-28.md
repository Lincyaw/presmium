# 批注与音色共享作者动作：分阶段记录（2026-10-28）

本片基于 `b11d8998`，先合入纯音色规则提取 `470fd59d`。只在 `mcp-comment-actions` 私有 worktree 修改和验证，不使用模型、编译场景或公共服务。已验核心先独立提交为 `ce7b9b3f`；后续增量修复了原生同评论正文冲突、metadata 缺省保留和反应连续点击／键盘焦点，实际范围见下节。仍不宣称全部客户端草稿恢复或 MCP 人机操作已经对齐。

## 已实现边界

- `plan_authoring_action` 接收 `comment.create/reply/update/react/resolve/reopen/delete` 或 `voice.set`；`apply_authoring_action` 只提交固定的 `planId/source/digest`，删除还须确认该固定计划。候选使用原 `DocumentEditor` 的事务、锁、历史、CAS、回执和保存读回；仍是同一个 64 条、5 分钟计划表，没有新写入器或持久账本。
- MCP 由服务固定新 ID、作者与时间；原生 Web 立即调用同一纯规则，保留 BlockNote 原生选区挂标记的生命周期，仍使用客户端即时 clock，未声称所有 Web 保存均由服务盖时间戳。
- Workbench 只读信息提供真实连接成员。Owner 可管理旧作者评论并保留原 `userId`；普通 editor 只能修改自己的评论。内置旧 `local-author` 仅保留本地化展示名，不冒充 `local`。
- 锚点使用稳定正文 ID 和 UTF-16 位置。原生投影与纯领域共用非空 text/break 链接判据；复杂链接等不透明行内值只占一个位置，非法位置拒绝，不夹紧。已有目标评论的非法范围会明确脱锚，讨论内容保留。
- 新动作请求限 4096 JSON 字符，MCP 默认结果限 7168 个 pretty JSON UTF-16 字符。完整候选/细节为按需 resource；模型无须回抄文稿。原 generic change wire 与 full `get_document` 默认值保持不变。
- `voice.set` 仅接受 TTS、none 或 null。录音来源须走已有真实媒体采用服务；改设置不证明服务可用、生成成功或可播放。

## 真实证据

证据均位于本 worktree 的忽略目录 `.presmium/comment-actions/`，每轮记录源码起止 SHA 和实际资源清理。没有新增 tracked 测试，也未跑测试套件。

| 独立范围 | 原始记录 | 结果与限制 |
| --- | --- | --- |
| 首次 SDK 小链 | `sdk-smoke-1793126591873/result.json` | 5/5。发生在 owner 管理旧作者政策之前，不将其中旧的 owner 403 断言当最终权限行为。 |
| 完整紧凑协议 | `sdk-final-1793129295534/result.json` | 11/11；50 页、401 段真实 canonical，公开 MCP SDK、`connectPresmiumMcp` 包装及正式 DSH pruner。新动作最大默认结果 1602 字符，均保持可解析 JSON；HTTP/MCP 同引用重放仅一次提交、权限/review、删除确认、锚点、源与 digest、ABA、token/文稿范围均覆盖。原大文 generic 借用负例请求不计入新 compact 请求预算。 |
| 外部回复/音色与原生草稿 | `native-sync-after-1793129465881/result.json` | 6/6，v3 的 30 源字节。实际新回复实显后，原未提交回复节点、内容与选区保持；音色后再发唯一回复作为新源已采用门槛。纯原生正文 Undo 真正保存，保留新音色与回复，0 history 请求。两帧原生绘制后截图记录实际线程文本。 |
| 第二次源采用后立即输入 | `component-race-before-1793129123137/result.json` → `component-race-after-1793129290696/result.json` | before 4/4 是反例材料，原词 `native` 错标成 `Stable`。after 4/4，真实 actor 新源回调在通知 React 前调用公开原生输入，规范线程保留、范围映射为 14..20 且仍标原词。此为公开组件 + 真实 WorkspaceClient 消费者，明确不是 Studio 原生菜单旅程。 |
| 计划容量回调归属 | `plan-capacity-before-1793129133810/result.json` → `plan-capacity-after-1793129297284/result.json` | 真实 SourceEditor 干预检，未写文稿。旧在途记录被逐出后，before 旧请求能复活；after 原请求准确 409，新获准重试可完成。未扩大为超出 64 条保留期的无限幂等保证。 |
| root 音色 SDK | `.presmium/ui-evidence/voice-authoring-action-1793129373840/result.json` | 独立 14/14，v3。由 root 记录 292 个源起止/current 一致、0 IR/提供方/模型、实际清理；不混算本片 11/6/4。 |

轻量检查：`check-types` 1258 文件通过，layering 与 `git diff --check` 通过。独立只读审查已核 v3 30 源 SHA，先前锚点与旧计划回调问题已修；此阶段尚未计入后续同评论编辑冲突、metadata 与反应修复的验证。

## 保留的失败与适用边界

- `native-sync-before-1793127083221` 的 DOM 复用断言错误，保留未完成记录；实际画面显示原生未提交表单丢失。`native-sync-before-1793127714109` 有五条真实反例后观察器未正常终结，原 raw 不改，另存 `interrupted-cleanup.json`。不伪称完整一轮。
- `native-sync-after-1793128352303` 在启动前半段触及 V8 默认约 4 GiB 堆上限，0 功能检查；保留日志和独立清理。忽略 helper 不必要的 fixture `node_modules` 链接触发先递归枚举、后过滤的既有 helper 接缝；有界 symlink 反例及独立 Jiti 导入记在 `review-comment-actions-oom-audit.json`。后续去链接、相同正式 builder/default heap 启动成功，不将这称为完整 heap profile。
- 首次大文 SDK 负例把原 full generic 请求误套 compact 预算，未完成 raw 保留；修正观察器后才得到上表 11/11。
- 原生 family 消费者的菜单 locator、编辑后旧文本 locator 与反应采用门槛等未完成轮次均保留，不计四组合通过。
- `component-race-before-1793130118156` 独立 3/3 反例：旧评论编辑稿在新 MCP 正文到达后、React 更新前被原生 Save 以新源写回，实际 200、clean ACK，覆盖了外部正文。这促成了下一增量的基线冲突保护，不能拿“editor 没 reset”替代它。
- `native-sync-before-1793130556151` 是反应连续点击反例：首次隐藏 tooltip 后，第二次同徽标 pointer 导致 SPAN/INPUT 两次回调；键盘单事件可正确只去掉当前成员。已在下一增量通过公共控件接缝窄修并另验。


## 原生冲突与反应增量

最终运行源以 `source-native-v7.json` 的 31 SHA 固定：相对核心只有纯 metadata 保留、native comment store／公共组件和两条双语错误文本四源变化。评论编辑不重写原生 Comment；公开 `Comments.Editor` 固定实际看到的 body 基线，`replaceExtension` 包装公开 submit，已变化时不 delegate。视图 pin 与 canonical 分开，未知绑定拒绝既有评论提交，新建／回复的空编辑器不被误拦。外部删除、soft-delete、关闭窗口或失去目标不在未提交评论保稿保证内，不另建持久 composer 协议。

| 独立范围 | 原始记录 | 实际结果 |
| --- | --- | --- |
| 同评论旧 Save 反例 | `component-race-before-1793130118156/result.json` | 3/3 反例材料，真实新 source 到 actor 后、React 通知前旧 Save 覆盖外部正文。 |
| 编辑基线／metadata | `component-race-after-1793131126345/result.json` | v4 独立 7/7：无关 reply/reaction 后原生 Save 可用；MCP／原生 body-only update 保 opaque metadata；同目标 body 更新后旧按钮和 Ctrl+Enter 都保稿不写；无关正文真实 CAS 保存不写回 pin；明确 Cancel 显示最新保存内容。 |
| 原生全家族 | `native-sync-after-1793131285858/result.json` | 前 9 项实过：create、reply、owner 管理旧作者、反应、解决／重开、MCP 反应实显、删评论及空线程、桌面亮／暗图。该轮 complete:false，因为窄屏点击被已打开 comments 侧栏遮住的正文 mark；不冒称完整矩阵通过，也不以强制点击洗绿。 |
| 反应单次激活 | `native-sync-after-1793132802691/result.json` | 最终 v7 独立 3/3：同徽标两次真实 pointer 加／去各一次；公开 HTMLElement.click 的 input 激活及原生 Space 都保留，其他作者成员不变。input 直接激活明确是 DOM 协议消费，不是假称物理点击隐藏 input。 |
| 自然键盘焦点 | `native-sync-after-1793132801539/result.json` | 最终 v7 独立 3/3：首次、随后同徽标、tooltip hover 后，实际 pointer 后 inputFocused=true，直接 Space 正确切换且正文不变；没有消费者手动 focus。 |
| 真实 Studio 四组合 | `native-sync-guard-visual-1793132927374/result.json` | 最终 v7 独立 9/9；1440／390 × light／dark，真实原生编辑 → MCP 同评论更新 → 原表单／草稿保留和冲突 Notice → 明确取消显示保存正文／原生正文仍可编辑。8 张 conflict/saved 图逐张查看，含最终反应控件。0 模型／IR 准备请求、HTTP／页面异常，31 SHA 起止相同。 |
| root VoiceDialog | `.presmium/ui-evidence/voice-inheritance-native-1793131389939/result.json` | v4 独立 13/13、292 源一致：page Silent 保 step 覆盖和时机；MCP 外改使旧 review 禁用；明确重查／清除目标、恢复继承；回 Doc 原生正文 Undo 实际 CAS 且保最新 voice，0 git-history／生成请求。四图只表示 modal 布局，不冒称四组完整功能。 |

v4 guard7 与 Voice13 的 Surface 早于最终反应适配，其余三增量源字节与 v7 相同，不写成整轮已在 v7 重跑。最终 Surface 只为 reaction 使用现公共 PmTooltip 的稳定 span，原 Badge 内部 tooltip 关闭以避免条件重挂；只 delegate 真实 input 事件，让 label 默认激活与聚焦完整执行。其它 badge、公有 ref、键盘与原生组件保持原接口。没有 preventDefault、手动 focus、focus 请求状态或 timer。

v4 取消默认 label 激活虽去掉重复回调，但自然 pointer 后焦点停在 thread card；`native-sync-before-1793132047472` 的 1 项反例保留。简单 public-ref 的 v5 和 owner/layout 的 v6 都未过首次焦点门槛，原失败 raw 不改；其中 productCorrect 字段只是旧 helper 的 phase 标签，判定以 pass/complete 为准，不视为通过。最后撤去这些规则，改为上述 v7。早期菜单 accessible-name、编辑后旧文本 locator、原生 ACK 前撞锁、隐藏 reaction、正文／reply strict selector等观察器失败轮次均保留，不计新功能通过。

原异常 before 的 generated workspace 曾在手工清理时遗漏，最终已确认归属并移除；`interrupted-workspace-cleanup-followup.json` 如实记录之前仍存在，不能用旧清理口径冒称当时已全清。最终 manifest 对全部登记 PID、私有 home/workspace/fixture 和源码逐项核验。所有消费者都为忽略目录中的真实私有运行，没有新增 tracked tests 或运行测试套件。
