# Web 与 MCP 共用页面复制

2026-10-27，在隔离 worktree `page-duplication-mcp` 实施。kernel 的 `duplicateDocumentPage` 接收 ID 分配器，Web 保留原 actor、焦点与 Undo；MCP 固定服务端新 ID，以既有 DocumentEditor plan/apply、CAS、事务、历史与读回保存。不操作 main 工作文件、公开服务或作者文稿。

`plan_page_duplication` 默认只给计划引用、新页、影响计数和有界验证摘要；完整候选与复制身份映射按需读资源。`apply_page_duplication` 只接收 `planId/source/digest`，从同一个 plans 表取 exact change，再走原 apply。模型无需回抄整个文稿。映射只覆盖复制实体；共享资产、定义、不透明插件载荷及原页评论保持原样。

本片只有进程内 64 条计划、64 条回执和五分钟计划期限。保留期内已知预检固定 ID，已知成功引用按当前源重放；旧 CAS、缺失计划及已知 Undo ABA 返回 409。拿到计划后应重试原引用，不能因 409 自动重建复制。两个有界表都遗忘请求后，不承诺无限记忆或跨进程恢复。

## 分阶段真实验证

各轮独立记录，不合并为一次总分，也不将早期证据改写为后续源码运行。

| 记录 | 实际范围 | 结果 |
| --- | --- | --- |
| `.presmium/page-duplication-consumer-result.json` | 初版完整协议，官方 MCP SDK 与真实 workspace，复杂规范引用和原事务 | 11/11 |
| `.presmium/ui-evidence/page-duplication-stdio.json` | 初版 compiler-only stdio，作者能力不可用 | 2/2 |
| `.presmium/page-duplication-compact-result.json` | 紧凑协议、按需资源、同引用提交及真实 DSH pruner | 10/10 |
| `.presmium/ui-evidence/page-duplication-compact-stdio.json` | 合入录音切片后的 compiler-only stdio，两种复制动作均不可用 | 2/2 |
| `.presmium/page-duplication-web-1793103824345/result.json` | 合入后真实 Studio、原生编辑器、Web 菜单复制和外部 MCP 回显 | 7/7 |
| `.presmium/ui-evidence/page-duplication-receipt-signature-after.json` | 最终两行修复后的跨协议同 ID、正常回执与实际丢 ACK 重放 | 3/3 |

初版 11 组的夹具包含容器、组件子块、列表、表格、未知扩展 fallback、代码变体与高亮、共享讲稿、发音、cue、媒体片段、生产覆盖及评论。组件实现文件故意不存在，作者预检仍可完成。核对声明引用精确重映射、原页和其它页不变、资源字节不变、固定分配器的共享纯函数结果一致、并发预检稳定、参数变化与额外 origin 拒绝。后端真实提交后丢弃 ACK，再重试只增加一次复制和一次提交；旧 CAS、实际 HTTP Undo ABA、required-review 与 operate off 均按既有门禁处理。这项纯函数一致性不是浏览器验收。

紧凑协议 10 组另覆盖资源的 member/document/token/digest 限制、错误 source、两条 apply 的 review 门禁、65 次真实预检触发有界淘汰、丢 ACK 和 Undo ABA。官方 SDK、实际 `connectPresmiumMcp` 文本适配及公开 Cordis/DSH pruner 插件共同消费 50 页、400 段文稿：

| 文本 | 实际字符数 | 真实 8,192 字符 pruner 结果 |
| --- | --- | --- |
| 完整 `get_document` | 150,674 | 中段被裁剪，来源字段保留 |
| 默认复制预检 | 1,419 | 不裁剪 |
| 默认提交回执 | 1,314 | 不裁剪 |
| 提交引用请求 | 251 | 无需回传文稿 |

保存后为 51 页、408 段。可选完整资源仍可能很大；本片未将所有文稿读取改为紧凑投影。

浏览器 7 组将两种 Undo 分开：原生正文输入后 Ctrl+Z 恢复正文与 canonical，未请求 workspace history；页面菜单复制后，现有页面 Undo 明确等待 `/history/undo` 200，并等待源、目录和原生投影恢复。随后短 MCP 提交在已打开 Web 中自动显示新页，无手动刷新；核对讲稿 cue、映射、agent 来源和保存版本。实际看过桌面亮色与 390 宽暗色触控视图，无横向溢出。此纯函数迁移未修改控件或样式，不宣称新增四组合视觉验收。

## 纠正与源码来源

首次浏览器原始记录 `.presmium/page-duplication-web-1793103303439/result.json` 虽写 complete，观察器却因异步响应采集时序把页面 history Undo 误称为原生 Undo，并在目录恢复前截图；不计为最终验收。原 raw 保留，独立 `observer-review.json` 明示 `acceptanceCounted:false`。修正观察器、等待真实响应及投影后才获得上述 7/7，未为此改产品 Undo 行为。首次 SDK 依赖解析、input-validation 文本解析和无效 deny 策略夹具的未完成结果同样保留。

根侧独审后新增的真实反例：先预检复制，再用同 id 计划并提交另一合法通用修改，页面尚未复制，资源却仅凭版本将其标作 applied。独立 before 记录保留错误 applied 状态；mutation 本来仍以 `document-change-id-reused` 拒绝。最终仅两行要求 receipt.signature 匹配计划 digest：资源才能称 applied，过期语义重放也只能借用对应回执。after 3 组确认外来回执为 old、旧 mutation 拒绝、正常 own receipt 丢 ACK 后仍只有一次提交和复制。不重跑此前 50 页 pruner 或浏览器，默认短协议及 Web 代码未变。

源码最初基于 `1c0a32cc`，后续顺序快进纯文档 `25b43c51`、独立草稿守卫 `5dbd7685` 和录音切片 `3cef1d47`。合入时四个相邻导出／MCP 文件逆合并后与原 page-copy 字节完全一致，记录在 `.presmium/ui-evidence/page-duplication-recording-integration.json`；早期 Node/pruner 证据仍对应合入前字节。纠正后的浏览器观察 12 份源，最终回执反例观察 11 份源；两行修复的逆替换 SHA 与旧冻结源一致，记录在 `.presmium/ui-evidence/page-duplication-final-manifest.json`。

类型检查、分层、技能与 diff 的最终结果及各 raw SHA 以该 final manifest 为准。所有私有 SDK 客户端、服务、浏览器、DSH 插件 fiber、子进程和临时目录均已清理。未请求模型、ASR、TTS，没有新增 tracked tests 或运行测试套件。
