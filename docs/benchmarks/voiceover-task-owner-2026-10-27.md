# Web 与 MCP 的共享配音任务

2026-10-27，在新的隔离 worktree `voice-task-owner`、私有随机端口 Workspace/standalone 服务及官方 MCP client 中验证。canonical 文稿仍是 `lecture.json`，本片没有改运行 IR、原生编辑器或浏览器布局，没有新建 tracked tests 或运行套件。公开 4320、17407 与作者文稿未操作。

## 实际接口与 owner

`DocumentVoiceAuthoring` 增加 `snapshot/listJobs/getJob/start/cancel/quotePreview/preview/readPreview`。七个 MCP 工具是 `get_voiceover_status`、`get_voiceover_jobs`、`get_voiceover_job`、`start_voiceover`、`cancel_voiceover`、`quote_voice_preview`、`preview_voice`。status/list/get/quote 为 read，start/preview 为 spend，cancel 为 operate。模型输入不能携带 confirmed；花费由可信主机批准。

Node `createVoiceoverOwner` 从原 `voiceoverRoutes` 提取既有 Map/intent 协调逻辑，继续使用真实 `claimVoiceGeneration` 和原逐单元生成流程，没有新增生成队列或写入器。Workspace 每文稿一个 owner；list/get/cancel 不装配服务、不编译，也不要求当前 JSON 有效。读取会保留原任务 source/revision，并区分当前、旧版本或无法判断，不把旧 done 变成当前成功。

addon-lecture 注册真实 `VOICEOVER_EXECUTION`，提供状态、范围校验、缓存查询、目录检查、quote、生成准备与执行。`VOICEOVER` 继续只是安装 marker。Workspace 只通过 kernel 公开契约调用实现，不引用 addon 内部。host-level HTTP 路由保留 launcher token、editor role 和 body 限额；compiled contribution 借用 `DOCUMENT_VOICE_TASKS`，卸载不关闭 Workspace owner。独立 lectureServer 使用同一个公开 Node 工厂，关闭自己的任务。

原 Web `voiceover`、`voiceover/cancel` 与 `voice-preview` 请求/响应形状保留。新增 `voiceover/jobs`、`voiceover/job` 和 `voice-preview/media`。同步插件工具 `lecture_synthesize` 不再出现在工具清单中；Workspace 使用可查询、可取消的 `start_voiceover`。`presmium-lecture` 现有命令是 export，本片没有添加或删除 CLI 子命令。

## 版本、状态与资源反馈

start 必须携带 intent、完整 canonical source、IR revision 和真实 scope。scope target 的 section/step/结构 binding 来自当前 snapshot，并回显可映射的 canonical StepID；不能仅凭步骤序号复用旧目标。cue、录音来源与 unbound 单元继续报告原能力限制。没有 IR 时明确不可用，调用者需要显式准备 IR；作者能力或任务查询不自行触发编译。

job 的 sequence 从 1 开始，只在实际状态或进度变化时增加。原任务状态 queued/running/cancelling/cancelled/done/failed/stale 保留，开始和完成时间来自实际执行。取消可早于 admission；此时没有假 job。相同 intent 不得改 source/revision/范围，已知任务重放不重复生成。最多保留 1024 个 intent 与 20 个近期 job；这是进程内状态，不是持久恢复账本。

试听 quote 最多保留 64 项、有效两分钟，并固定实际 execution 实例。POST 重新验证 source/revision/quote；配置变化不能让旧 quote 悄然选择另一实例。结果最多保留 8 份、总共 16 MiB，单份至多 8 MiB。MCP 返回 id/key/source/revision/provider/duration、字节数、SHA-256 与 `presmium://voice-preview/{id}?document=...`；resource 返回真实 MIME/blob，文本中没有音频 data URI。Web 适配器仍生成原 wire 格式。当前 MCP client 的文本适配不构成实际播放确认，本片不宣称客户端已听到声音。

关闭同步拒绝新操作，取消并等待 admission、任务、目录读取与试听；保留原事务/缓存规则。本地提供方取消验证针对真实 HTTP 响应交付，不宣称中断已经完成的模型计算。

## 真实证据与测量

消费者和 raw 位于忽略目录 `.presmium/`。每轮记录源码 SHA、结束 SHA、实际提供方事件与资源清理，未以 HTTP 成功替代音频或任务成功。

| 记录 | 实际结果 | 范围 |
| --- | --- | --- |
| `voice-owner-protocol.json` | 19/19，2160.34 ms | 真实复制的先前 Kokoro exact-cache；官方 MCP/HTTP 同 job、序号、坏 JSON、预取消、未知 admission、scope/id 复用拒绝、配置 remount 后任务保留、standalone 同工厂、CLI export；没有合成请求 |
| `voice-owner-real-tts-initial-close-observation.json` | 前 9 项通过，整轮 complete:false | 5 个真实本地 Kokoro POST；新生成/cache 字节、实际交付取消、active remount→stale、MCP 音频 blob、Web 相同音频复用、无效 quote、真实目录 preflight 取消 |
| `voice-owner-real-close.json` | 2/2，2707.72 ms | 仅再做 1 个真实短试听 POST；关闭等待实际 socket close、无缓存/资源采用、canonical 未变，未重跑前 5 次生成 |
| `voice-owner-stdio.json` | 2/2 | 实际 presmium-mcp CLI/stdio：没有 Workspace owner 时不提供七个动作，能力明确 unavailable |

真实提供方是 root 已批准并移交 lease 的固定 CPU Kokoro，端口 32769。透明 relay 仅转发到该 loopback 服务；实际 `/audio/speech/timestamps` 返回 404 后，按现有适配器回退到 `/audio/speech`。5+1 次 POST 均转发真实请求，未模拟模型或伪造音频。没有调用 ASR、付费或非本地模型。

新生成任务实际经历 sequence 1→4，1 个单元完成，缓存音频 SHA 与真实 record 相同。取消分支先取得真实提供方 200 音频，再在 relay 保留响应交付；任务变 cancelled，未采用缓存。配置 remount 分支保留 running task，释放实际结果后得到 stale，未冒充新版本结果。MCP resource 的解码字节数与 SHA 均实际核对。

主轮最后的 close 观察错误是消费者在异步 close 事件到达前直接读布尔值；其 finally 已记录实际事件 true。原 complete:false 文件保留。补充消费者先注册事件、使用有界条件观察，再单独验证关闭。产品另有一行收口：已关闭 owner 的在途异常统一返回 503 `voice-service-closing`；该行由独立 close 两项覆盖。随后只修订了工具导出和服务契约的两处注释。主轮前 9 项的执行差异仅为上述 owner 关闭异常分类，另有两处纯注释；不能称为 13 份全部匹配当前源码。

`voice-owner-source-manifest.json` 记录首次冻结的 17 份源码与证据对应关系。当时协议 19 项的 13 个核心 SHA 全部匹配；close 两项之后只有工具导出及服务契约两处纯注释修订。随后另有下节的 owner 重放分类增量，最终对照以 `voice-owner-replay-final-manifest.json` 为准，不把原 raw 重写成相同字节。所有自有 MCP clients、Workspace、standalone、relay、临时目录均已清理，临时环境值已完整还原。提供方容器归 root 所有，保留并已归还模型调用 lease。

## 独立审查后的失败重放修复

root 独审确认 admission 失败的 controller 也会 abort；原 start 重放首先看 aborted，导致真实缺 IR 的失败意图被错误报告为 cancelled。`voice-owner-replay-before.json` 用真实 NodeServices 的无 IR 路径复现：首次 503 `voice-document-unavailable`，get 为 failed 并保留原原因，同 payload 重放却是 409 `voice-cancelled`。

只调整 owner 的已知意图分支：payload 改变仍优先冲突；已有 job 返回真实历史；未 admission 的 cancelled 与 failed 分别返回 `voice-cancelled`、`voice-intent-failed`，不重新装配服务或启动任务。get 保留原失败原因。

`voice-owner-replay-after.json` 三组实际检查完成，236.08 ms：无 IR 失败重放保留 failed 语义，修改 payload 仍优先 `voice-intent-changed`；预取消无 job 且不 admission；使用先前真实 Kokoro 缓存、无提供方配置的实际 cancelled job 重放返回相同 id/state/sequence，不重新执行。两轮都没有启动 HTTP 服务或 ASR/TTS 模型，临时目录和 factory 均清理。

新增最终 manifest 对原 owner 增量做反向替换并核对 SHA，确认只变这一分支；其余 16 份源码保持首次冻结字节。此前协议 19、真实 TTS 9、close 2 与 stdio 2 的 raw 全部保留，不为这次无模型修复重跑或覆盖它们。

## 独立缓存身份边界

只读源码与真实 `voice-cache-profile-probe.json` 确认：原 speech cache key 不包含模型/提供方 profile；同 engine ID 重配后仍可能命中旧模型结果。probe 仅修改私有配置并查找已有真实缓存，没有调用更改后的模型。固定 quote 实例没有解决这个底层缓存定义，已交独立切片处理，本片没有擅改 speech cache。

轻量检查通过 types 1221、packages 40、layering、skills 与 diff。本片未重跑浏览器四组合、实际扬声器播放或导出。耗时是一次有限消费者整体耗时，不是交互延迟统计或性能改善结论。源码独立审查和最终组合交付由维护者收口；记录生成时未 stage、commit 或部署。
