# 语音缓存的引擎配置身份

2026-10-27，在 `speech-cache-profile` 独立工作树、基线 `e449f604` 验证。同一 engine ID 更换模型或 provider 后，旧格式只按 ID 和讲稿参数命中旧音频。此前真实只读反例的 2 项记录见 [before 副本](../../.presmium/speech-cache-profile-before/voice-cache-profile-probe.json)，原材料来自 `voice-task-owner` 的独立消费者；没有在本片重新生成该反例。

新键由原语义 `requestKey` 和非凭据 `profile` 共同决定。profile 包含引擎 ID、类型、规范 URL、provider、用途与模型，不包含 KEY／APPID；URL 不接受 userinfo、query 或 fragment。新记录保留可校验的请求参数与实际音频 SHA。lookup、按键读取及对齐都经过同一配置／字节校验；读取不补写锁、不暗中合成或转写。

离线读取仍依赖随文稿提交的真实缓存与 `speech.lock.json`。旧格式按原键和锁中的 SHA 读取；新格式按 requestKey 找唯一锁定产物。同一请求锁了两个 profile 时，按请求读取返回缺失，明确按各自产物键读取仍可用。`pruneLock` 可明确留下所需键，不删除音频文件。配置存在时，未知旧 profile 不能充当当前配置的结果。锁上限为 16,384 项／4 MiB，单份记录与对齐元数据上限为 1 MiB。只有完全无配置才走离线回退；仅 MODEL／TRANSCRIBE_MODEL 也是显式部分配置，缺少必要字段时不可用。

| 实际消费者 | 结果 | 范围 |
|---|---:|---|
| [只读兼容与拒绝边界](../../.presmium/ui-evidence/speech-cache-profile-read.json) | 12/12 | 真实旧 Kokoro 缓存、公开 bubble-sort 的一条锁定音频无引擎可读；配置存在时旧未知 profile、损坏字节、讲稿元数据不符、无锁和不安全 URL 均不回退。0 HTTP |
| [两次真实 CPU TTS](../../.presmium/ui-evidence/speech-cache-profile-generate.json) | 20/20 | A 完整上游 200 回执 held，B 真实 200 先保存，再释放 A；不同 profile／key，各自 SHA／Opus AIGC 正确，B 音频和记录未被改写。另验 model／URL 改变 miss、KEY 轮换和等价 URL 不换键、新缓存离线读取、双 profile 歧义、损坏／源不符拒绝 |
| [对齐协议边界](../../.presmium/ui-evidence/speech-cache-profile-alignment.json) | 14/14 | 明确标为协议材料的 sidecar，不是 ASR 成功或真实词对齐。音频 SHA、source profile、key、语言、转写 profile 与词区间不符均拒绝；旧未绑定 sidecar 不复用，实际音频坏时也不能复用。0 HTTP |
| [只读计划派生](../../.presmium/ui-evidence/speech-cache-profile-plan.json) | 6/6 | 实际 Compiler、`synthesizeLecture(cacheOnly)` 和 `projectProductionPlan`；有效离线新缓存的 key／真实 SHA 进入计划，配置变化和坏字节变为 cache-missing，锁不改写。0 HTTP；没有冒称覆盖 HTTP 计划适配器 |

首版共 52 项完成，原始记录及当时的六源 SHA 保留。两次 TTS 使用此前授权的本地免费 Kokoro CPU，原文是公开 JFK 样本的已审讲稿；由本任务独占 loopback relay 逐请求记录，不使用全局容器累计数。实际 `audio/speech` 为两次 200；不支持的 timestamps 扩展两次 404 被正常记录后回退。没有 ASR、新模型下载、付费调用或公共 4320／17407 操作。新输出约 6.091 秒；计划使用 proportional 对齐，不借原人声 ASR 的旧词时冒充新配音词时。

A 真实响应在约 4.63 秒完整取得，B 在约 8.44 秒完成写入，随后才将 A 交给调用者。A／B 的缓存键、音频 SHA、record、实际 AIGC 与请求时序均在原始记录；这些时间用于证明顺序，不是生成性能承诺。两次完成后停止模型调用并释放 provider 窗口。

保留两个消费者问题：首次只读脚本的未使用表达式导致解析失败，尚未执行产品；首次计划消费者遗漏生产调用者已有的 utterance.clipId 赋值，因此显示假 missing，保留 [initial-oracle](../../.presmium/ui-evidence/speech-cache-profile-plan-initial-oracle.json)。补齐实际调用步骤后才得到 6 项结果，没有为此重新生成音频。早期只读 12 项的原 SHA 另保 `speech-cache-profile-read-initial.json`；两项后续增量前的 52 项仍保原名，最终只读重验使用下述 `-final` 文件，不覆盖旧记录。

独立审查随后确认两处增量，均在本片收口，未再生成音频：

- 原 engineIds 忽略 MODEL-only 变量，`none`／另一模型／仅转写模型会误当无配置。[before](../../.presmium/ui-evidence/speech-cache-profile-partial-before.json) 3/3 保留真实错误命中，[after](../../.presmium/ui-evidence/speech-cache-profile-partial-after.json) 3/3 均明确不可用。
- 首版离线查找重复解析、校验和扫描整个锁。独立对照使用一条真实公开缓存加其余索引形状，**不是 16,000 份模型产物**。1k 条索引的 32 次热读取从旧 HEAD 23.68 ms 到首版 109.86 ms；16k 从 359.26 ms 到 1954.80 ms。修复为每个 SynthesisCache 的不可变已校验快照及 requestKey 唯一索引，按实际文件句柄 dev／ino／size／mtimeNs／ctimeNs 检查版本；外部变更、替换和修复即时失效，不用 TTL。writer 复制快照后修改，不能让未落盘 pin 泄漏到热读。

最终独立[成本对照](../../.presmium/ui-evidence/speech-cache-lock-cost-review-after.json)中，16k 索引 32 次热读取旧 HEAD 为 339.54 ms，最终为 4.645 ms；单次中位数 12.71 → 0.222 ms。首版慢记录保留在 `speech-cache-lock-cost-review.json`，数字来自各自交替采样，不混作同一轮。这里只报告热读，不把首次完整解析成本隐藏为模型／端到端性能。

最终[锁失效守门](../../.presmium/ui-evidence/speech-cache-lock-guard-review.json) 16/16，包括同大小覆写且恢复 mtime、原子替换／修复、非法／过大／删除再恢复、真实文件写入 held 时不暴露未落盘 pin、同路径排队的两个 profile 均保留及歧义 miss。只重放先前真实 A／B 字节，没有新模型调用。

最终运行源另名复验：[read-final](../../.presmium/ui-evidence/speech-cache-profile-read-final.json) 12/12、[alignment-final](../../.presmium/ui-evidence/speech-cache-profile-alignment-final.json) 14/14、[plan-final](../../.presmium/ui-evidence/speech-cache-profile-plan-final.json) 6/6，均 0 HTTP。首版真实 TTS 的 20 项不改 SHA；之后只有 engines 的部分配置枚举和 cache 的锁快照／索引发生增量，provider/profile 键生成及响应落盘逻辑未改。9 份保存副本仍逐 SHA 相同，不将旧 20 项冒称全部最终源码重跑。

[最终 manifest](../../.presmium/ui-evidence/speech-cache-profile-final-manifest.json) 记录源码、消费者、证据与保存副本 SHA。真实新音频／lock／canonical 的最小副本在 `.presmium/speech-cache-profile-proof/saved-document/`，目录 0700、文件 0600，无凭据和 browser state。所有消费者的临时目录、环境变量与 relay 已清理；CPU 容器仍由 root 管理，没有停止它们。

轻量检查：types 1216、layering、skills 与 diff check 通过。未新增 tracked tests，未运行测试套件、全量示例构建或公开浏览器矩阵。没有重新配置真实远端模型；配置变化的 miss 是真实服务只读验证，不是假称另一模型生成成功。未测试跨进程同时写同一 lock；进程内同路径锁更新按队列执行，两个 profile 的真实晚回执已验证。
