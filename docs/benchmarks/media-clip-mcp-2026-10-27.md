# Web 与 MCP 共用音频片段作者动作

2026-10-27，在隔离 worktree 的私有文稿、随机端口 Workspace 服务和真实 MCP stdio 中验证。没有使用公开 4320、作者文稿、模型、语音提供方或测试套件；没有新增受版本控制的测试。

## 实际边界

`createDocumentAudioAuthoring` 的同一个实例提供 HTTP 路由与 `DocumentAudioAuthoring`。原有 Web `document/media-clip` 写入分支与 MCP 现在共用候选构造、文稿验证、真实素材及生产时长检查、SourceEditor 事务、历史、回执和保存回读。低层 `ProductionAudioAuthoring` 仍只提供媒体和生产判断，不拥有写入器。

| 动作 | 实际接口 | 约束与反馈 |
| --- | --- | --- |
| 读取真实生产计划 | `readProductionPlan` / `read_production_plan` | 必须绑定完整 canonical source，可选 expected `irRevision`；返回已有真实快照派生的计划和 binding，不编译、渲染或合成 |
| 片段预检 | `validateClipChange` / `validate_media_clip_change` / POST `document/media-clip/validate` | 重复只读；返回 add/update/remove、before/after、影响的步骤与素材、文稿问题及 production 检查结果；不保存计划或 planId |
| 增加、修改、移除片段 | `changeClip` / `change_media_clip` | 额外要求客户端 id；agent 固定 origin，遵守主机 operate 与 required-review 门槛；在原锁和历史事务内重新检查并回读 |
| 原有 Web 保存 | POST `document/media-clip` | 保留 `{id,baseDocumentVersion,binding,clip}` 或 `{id,baseDocumentVersion,removeClipId}`；私有可信入口固定 editor origin |

预检与 MCP 写入的新请求为 `{source,binding,clip}` 或 `{source,removeClipId}`，写入增加 `id`。schema 严格拒绝 origin、confirmed、额外字段与同时 upsert/remove。源绑定包含 documentId、源字节版本和 fingerprint。

计划读取不隐式准备运行快照。没有 IR 时返回真实 503；需要准备或刷新时，MCP 显式读取 `presmium://ir?document=<directory>`，然后用 source 调用 `read_production_plan`。返回的 actual binding 才能用于 upsert。诊断资源的零诊断快照不提供 IR revision，接口没有要求 agent 推算哈希。

当前 upsert 支持真实本地音频。它检查完整 binding、资产实际字节与声明 SHA、真实媒体入出点、已确认的步骤时段，以及 offset 加片段长度是否超出该步骤。不会自动跨步骤或延长停留。原有 `validateClips` 继续检查候选中的全部片段。移除只验证 canonical 内容；坏计划、旧 IR 或缺少音频服务不妨碍清除引用，素材声明和原始文件保留。

保存回执在原 `DocumentChangeAnswer` 上增加 `verification`：实际回读的 saved source、`production: validated-before-save | not-required`、预保存 binding，以及 `compiled/runtime: not-requested`。upsert 保存后源已变化，因此回执不宣称新的制作计划、浏览器播放或导出已经 ready。

## 幂等、失败与关闭

片段复用音频作者实例的 64 项 FIFO 回执和 4 项在途操作限制。相同文稿、成员、id、完整 source 与语义 payload 合并同一次在途写入，Web 与 MCP 可重用同一回执；id 改 payload 返回冲突。这是进程内当前源幂等，没有新增持久任务或计划账本。

已知回执首先检查保存后的当前版本，再做回读，后续源变化仍是普通 `document-version-changed`。首次提交后回读不符返回 `media-clip-readback-changed`，附真实 `committed:true`、changeId 和版本，不伪装成未写入。AbortSignal 和关闭会中止尚未写入的检查；进入实际写入后保留原事务的完成或回滚，并回读结果，不报告虚假的 cancelled。

MCP 沿用现有错误封装。领域拒绝的 status 与 message 保留；503 的通用 code 是 `tool-failed`。SDK 在处理器之前拒绝 input schema 时返回 `isError` 文本，本次没有把它记录为结构化 HTTP 400。

## 真实记录

原始记录和消费者位于忽略目录 `.presmium/`；每份 JSON 保存对应源码 SHA、结束 SHA 与清理结果。

| 原始记录 | 通过 | 实际范围 |
| --- | --- | --- |
| `media-clip-factory.json` | 17/17 | 真实 Compiler NodeServices、SourceEditor、Revisions、Git 和 2 秒 Ogg；缺 IR 不编译、不写入；真实范围与步骤时长；旧 plan；并发单提交；Web/MCP 同回执；id 与 origin 拒绝；实际 index.lock 回滚；素材字节变化；HTTP editor 与 agent review；无引擎删除；AbortSignal、UUID、role 和 close |
| `media-clip-mcp.json` | 13/13 | 官方 MCP client 与三个实际 Workspace 服务生命周期；source-only 真实计划发现与可选 revision CAS；HTTP/MCP 相同预检；结构化范围拒绝；agent 保存回读；旧 ACK 以同 id 跨 HTTP 重放；SDK origin 注入拒绝；Web 音量/静音保存；移除；required review 与 operate off |
| `media-clip-stdio.json` | 2/2 | 官方 stdio transport 启动实际 `presmium-mcp` CLI；独立 compiler host 不提供三个 Workspace 作者工具，能力如实 unavailable |

最终 factory 消费者耗时 447.48 ms，MCP 消费者耗时 1242.62 ms。这是单次有限消费者整体耗时，排除其顶层模块加载，包含私有数据准备、明确编译与清理；不是用户操作延迟的统计结果，也没有据此宣称性能改善。factory 明确调用两次 Compiler.compile 准备真实 IR；MCP 明确读取 IR resource 准备与更新快照。能力发现、只读计划发现与片段操作没有自行启动编译。

factory 最终 6 份核心源码 SHA 与 MCP 的对应 6 份完全一致；MCP 另观察 mcp.ts、messages.ts、Node index 共 9 份，stdio 观察 3 份。各轮 sourceStable 与 cleanup 均为 true。fixture 未配置 SpeechService，没有启动 ASR、TTS、语音试听或模型请求。

保留的前期消费者失败：`media-clip-factory-initial-expectation.json` 在素材字节变化后错误期待 422，实际先由真实计划变化返回 409；产品不为该断言修改。`media-clip-mcp-initial-error-envelope.json` 错把 503 通用 code 当领域 code；`media-clip-mcp-revision-discovery-before.json` 记录零诊断资源无 revision 的接口缺口，随后 source-only 查询已补齐；`media-clip-mcp-sdk-schema-initial.json` 记录消费者错误地把 SDK input-validation 文本当 JSON。对应原始记录保留，没有把这些前例宣称为完整通过。

轻量检查通过：types 1216、packages 40、layering、diff。维护者独立源码审查 APPROVE；未重跑浏览器四组合、真实播放或导出，原有 Web 控件和交互布局没有改动。组合提交和公共采用由后续交付记录说明。
