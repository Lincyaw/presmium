# 人声录制、转写与讲稿采用

状态：部分实施，2026-10-27。共享 ASR 候选服务已验证 31 项无引擎边界与 8 项坏源取消边界，见[首片记录](benchmarks/transcription-candidate-2026-10-27.md)。第二片已提供共享采用预检与原子讲稿采用，使用明确标识的候选协议材料，实际 HTTP／CAS／git 主链通过 30 项，另有旧候选重新对照 5 项，见[采用记录](benchmarks/transcription-adoption-2026-10-27.md)。这些材料不证明 ASR 成功；未调用语音模型、读取凭据或验证运行中提供方取消。录音、完整 Video 操作与重新配音闭环仍按各片的实际记录验收。已有音频导入范围见[音频作者接口](audio-authoring.md)。

Video 现已接入原生麦克风候选、明确保存、转写任务恢复与原生校对／对照采用。浅深色与桌面／触屏窄屏已实际操作；任务恢复、共享讲稿与旧回执的范围分别见[录音记录](benchmarks/video-microphone-recording-2026-10-27.md)和[校对记录](benchmarks/video-transcription-adoption-2026-10-27.md)。MCP 与 HTTP 共用任务实例和采用事务，见 [MCP 记录](benchmarks/mcp-transcription-actions-2026-10-27.md)。真实 ASR→采用→新 TTS 的成功播放、多目标批量界面和录音二进制崩溃恢复仍未完成。

首片公开 `createDocumentTranscriptions` 与 [kernel 契约](../packages/kernel/src/contracts/transcription.ts)，HTTP 为 `GET document/transcription/capabilities`、`POST/GET document/transcription`、`GET document/transcription/result`、`POST document/transcription/cancel`。首次仅转写整份真实资产，任务不写 `Narration`，不自动编译或合成。持久取消意图重启后仍阻止迟到请求；已知任务 ID 的读取与取消只核文稿路径权限，不因当前 JSON 损坏或 UUID 替换而失去停止入口。MCP 薄适配的范围单独见 [MCP RFC](rfc-mcp-authoring-actions.md)，不能把路由或工具存在视为完整作者流程已交付。

作者可以录下人声或导入已有音频，转写成候选文字，核对目标步骤与现有讲稿，明确采用后再选择真实音色重新配音。录音、转写、采用讲稿、生成配音是四个独立决定。打开文稿、收到转写结果或采用文字都不自动调用下一项付费服务。

`lecture.json` 仍是唯一权威文稿。原始音频是资产，转写结果是有版本的候选材料；只有明确采用才修改步骤引用的 `Narration`。字幕读取 `Narration` 的显示层，TTS 读取同一结构的朗读层，不能用转写副本另建一份字幕正文。

## 1. 当前能力与缺口

| 环节 | 当前代码能力 | 本次需要补齐 |
| --- | --- | --- |
| 本地音频 | `document/audio` 按真实字节探测，原文件与 Asset 声明一次 CAS 提交；未被 clip 使用的资产也能检查 | 在同一导入事务中记录可区分的文件／麦克风来源，不自动附到步骤 |
| 音频片段 | Video 的 `ProductionMediaClips` 使用真实时长编辑入出点、偏移、音量、静音；区间必须处于已确认步骤 | 录音试听与转写材料可复用资产，但不能把“音频片段已保存”等同于“讲稿已采用” |
| 麦克风 | `addon-lecture` 的 `LectureRecorder` 已有设备申请、编码、分块上传、停止与释放；保存的是 `lectures/<track>/track.json` | Video 内独立的讲稿录音入口，保存为 canonical 音频资产，并接后续转写；不能直接复用旧轨文件作为文稿来源 |
| ASR | `SpeechService.transcribe` 支持取消；OpenAI 接口形态及火山引擎适配器已有实现 | 音频资产的来源校验、版本化候选、异步任务与重新尝试；真实结果须记录使用的引擎与模型信息 |
| 旧轨转写 | `track_transcribe` 写讲授轨的 `utterances`；`track_narration` 只返回带 role 文本的草案与来源行 | 不能作为规范 `NarrationNode[]` 的原子采用接口 |
| 讲稿与配音 | typed Narration 已有 text／pronunciation／cue；`VoiceoverRequest` 已有 source、revision、scope、intent、确认与取消链 | 采用转写后重新检查真实音色能力，明确生成缺失的精确请求缓存 |
| 原录音跟稿播放 | `VoiceSource.recording` 有 schema，但当前 ProductionPlan 明确报告 `production.recording-unsupported` | 不伪称已支持。录制／导入→ASR→采用→TTS 的完整需求不以原录音同步播放为前置条件 |
| 字词对齐 | TTS 可携带真实 words；`alignWords` 能读取已有对齐，明确允许时也可能再次转写 | 录音转写时码不能移作新 TTS 时码；没有真实词时码时不得显示精确逐字对齐 |

审计入口：

- [规范文稿](../packages/kernel/src/contracts/document.ts)、[语音服务](../packages/kernel/src/contracts/speech.ts)、[配音任务](../packages/kernel/src/contracts/voice.ts)、[制作计划](../packages/kernel/src/contracts/production.ts)。
- [旧录制器](../packages/addon-lecture/src/client/recorder.ts)、[音频编码](../packages/addon-lecture/src/client/media.ts)、[旧轨录制路由](../packages/addon-lecture/src/node/routes/recordings.ts)、[旧轨转写](../packages/addon-lecture/src/node/transcribe.ts)、[旧 agent 工具](../packages/addon-lecture/src/node/tools.ts)。
- [语音适配器](../packages/addon-speech/src/node/engines/)、[精确合成缓存与对齐](../packages/addon-speech/src/node/cached-speech.ts)、[配音任务实现](../packages/addon-lecture/src/node/routes/voiceover.ts)、[Video 组合](../packages/workbench/src/panels/ProductionPanel.tsx)。

领域中的录制轨、转写与 canonical 讲稿继续分开，见[领域模型](domain-model.md#15-讲授)、[可编辑文稿](rfc-document-ir.md)、[运行计划](ir.md)。本文不把旧轨中按字数插值的编辑时码视为实测对齐，也不沿用旧文档中“构建时补合成”的表述；当前读取、构建和导出使用精确缓存，生成必须明确发起。

## 2. 数据归属

| 数据 | 归属与保存 | 何时可修改 |
| --- | --- | --- |
| 原始音频 | canonical `Asset` 声明与文稿内原字节；继续使用随机服务端路径、真实探测与 SHA-256 | 导入后不原地裁切或覆盖；重录创建新资产，原资产继续保留 |
| 音频来源 | 新增可选的 `Asset.audioSource`，仅 audio 使用，记录 file／microphone 及录制意图 | 与资产声明、字节同一导入事务保存 |
| ASR 结果 | `transcriptions/<transcriptionId>/<revision>.json`，不可变候选 sidecar | 一次成功转写产生一份版本；重新识别产生新版本，不覆盖旧结果 |
| 候选修订草稿 | 浏览器按 document identity＋候选版本＋稳定步骤保存待采用文字与分配 | 自动保留输入；未采用内容不成为编译输入 |
| 作者讲稿 | `lecture.json.narrations` 与 `steps[].narrationIds` | 明确采用后通过文稿 actor／workspace CAS 一次写入 |
| 采用来源 | 新增可选的 `Narration.provenance`，记录候选版本、音频摘要与所用 segment IDs | 与被采用的 typed nodes 同一事务；以后手改讲稿不改写历史候选 |
| 合成音频 | 现有 speech 精确请求缓存与 lock | 显式任务生成；缓存是否匹配由真实请求键决定 |
| 播放时间 | 编译所得 `ProductionPlan` 与完整 `ProductionBinding` | 从已保存文稿及真实媒体派生，不回写成另一份文字源 |

`Asset.audioSource` 的最小提案：

```ts
type AudioSource =
  | { type: 'file' }
  | { type: 'microphone', recordingId: string, startedAt: string, endedAt: string }
```

文件名继续只生成安全 `Asset.title`，不能决定路径。`microphone` 表示录制入口声明的来源，不是服务端对人声、说话人身份或真实性的认证。实际 MIME、时长、声道、采样率和摘要仍以服务探测为准；不存设备 ID、设备权限或凭据。现有资产没有此字段时保持“来源未知”，不根据扩展名猜录制来源。

旧讲授轨仍可独立回放。需要把旧轨作为本流程材料时，明确导入其中的真实音频，并保存旧 track ID／原片段摘要作为来源引用；不把旧轨中的数字 step 或 `u1` 序号直接认作当前稳定 StepID。

候选文件只保存转写与出处，不参与运行快照编译。删除候选不会改变已经采用的讲稿；采用界面若找不到候选，应报告来源不可用，不能从新讲稿反造“原始转写”。资产和候选的清理必须检查引用，不随一次失败、取消或替换自动删除旧原音。

## 3. ASR 候选与任务

### 3.1 不可变候选

以下为新 kernel 契约的最小形状，字段时间统一用毫秒。现有 `Transcript` 的时间为秒，只在语音适配边界转换一次。

```ts
interface TranscriptionRevision {
  transcriptionId: string
  revision: string
  createdAt: string
  source: CanonicalSource
  audio: { assetId: string, sha256: string, sourceRange: TimeRange }
  request: {
    engine: string
    provider: string
    local: boolean
    requestedModel?: string
    reportedModel?: string
    adapterVersion?: string
    lang?: string
    hints: string[]
    fingerprint: string
  }
  result: {
    lang: string
    text: string
    segments: {
      id: string
      startMs?: number
      endMs?: number
      text: string
      words?: { text: string, startMs: number, endMs: number }[]
    }[]
  }
  timing: 'words' | 'segments' | 'none'
}
```

`revision` 标识整个不可变候选的内容，包括输入摘要、请求和标准化结果；与任务的递增 `sequence`、文稿保存版本、IR revision 分开。segment ID 在这个候选版本内稳定，不能用数组序号把下一版结果重绑到原步骤。

请求必须固定真实引擎。当前公开 `Transcript` 不返回使用的引擎或模型，后续在 `addon-speech` 的公开服务契约中补可选结果元数据，并由实际适配器填充。首片仅能从公开能力确认 engine／provider 时，缺失模型和适配版本保持未知，不阻塞候选存储。配置中的模型只写入 `requestedModel`；提供方没有报告实际模型时不编造 `reportedModel`。`SpeechEngineInfo.wordTimes` 不是本次 ASR 结果质量的证明，实际 `words` 经过校验后才允许 `timing='words'`。

服务校验有限数值、正向区间、素材范围及响应体大小。非法时间不拿来推算精确对齐；可保留有效文字并报告时间不可用，不能用零时长伪造有效区间。静音或空结果可正常结束任务，但采用按钮没有默认可写内容。识别语言、文字与时码不必相互猜测修正；保留来源并让作者校对。

首个切片转写整份资产：`sourceRange` 为实际 `0..durationMs`。现有 `MediaClip.sourceRange` 只是非破坏性播放区间，不能假装已经截取了上传给 ASR 的字节。以后支持“仅识别选区”时，须由媒体适配器真实提取音频，记录原资产、原区间及派生字节摘要；不能只过滤返回文字却宣称仅发送了选区。

### 3.2 任务接入

采用 [MCP 作者动作 RFC](rfc-mcp-authoring-actions.md) 定义的共享任务回执适配层，映射现有 build／voiceover 与新增 ASR 任务，不先重写为统一执行器。新增 ASR 状态包含 queued、running、cancelling、cancelled、done、failed；来源已变另记录 `current: false` 与原因，不能把已成功保存的旧结果抹成不存在。

每个回执带 `id`、客户端 `intent`、document identity、`CanonicalSource`、递增 `sequence`、进度、可执行动作和结构化错误。语音调用阶段没有实际可测进度时显示阶段及不定进度，不模拟逐字增长或百分比。完成后返回 candidate ID／revision，不把整段音频塞进任务事件。

建议 workspace 接口如下，所有名称都是待实现接口，不能在现有能力列表中预先宣称可用：

| 动作 | 输入 | 回执与写入 |
| --- | --- | --- |
| 查询 ASR 能力 | 文稿身份、保存来源 | 实际 `stt` 引擎、提供方、已知输入格式与参数范围；无引擎是 unavailable |
| 开始转写 | `intent, source, assetId, audioSha256, engine, lang?, hints, confirmed` | 任务；不修改 canonical 讲稿 |
| 读取／跟随任务 | task ID、已知 sequence | 最新状态／事件；只接受更大 sequence |
| 取消 | task ID 或尚未入队的 intent | 入队前拒绝后来的同 intent；运行中先 cancelling，再由服务确认结束 |
| 读取候选 | transcription ID、revision | 完整不可变结果与原音引用；无任意路径读取 |
| 预览采用 | 当前 source、候选版本、稳定步骤分配、草稿修订及原子决策 | typed diff、影响、冲突、review quote；不写文稿 |
| 采用 | 文稿 change ID、预览 quote、完全相同的 source 与决策 | 一次 `DocumentChangeAnswer`；不改 voiceSource、不自动合成 |

开始前重新读取 canonical Asset 和真实文件，核对文稿身份、保存版本与音频 SHA。音频检查沿用 `ProductionAudioAuthoring`，调用语音只经过 `SPEECH`；workspace、MCP 不导入插件源码。能力与服务都按目标文稿获取，不能借用当前另一个预览窗口的引擎配置。

请求按 document identity＋member＋intent 记录输入摘要。同一 intent、相同摘要返回同一任务或结果；不同摘要拒绝。重新识别、明确失败后的重试使用新 intent，新结果保留 parent revision。响应丢失时先按旧 intent 查询，不能重新调用提供方。任务接纳记录与已完成候选需要持久保存；服务重启后结果不明的付费请求不自动重试，回执明确要求作者决定是否重新发起，不声称对外部提供方实现了 exactly-once。

转写使用启动时捕获的有界字节；期间作者仍可编辑正文。文稿后续保存、切到另一文稿或关闭面板，不把结果写入新的目标。完成时若源版本已变，仍保存带原 source 的候选，标为需要重新检查；只有重新基于当前来源预览，才能采用。外部替换原文件或删除资产时，原结果保留摘要并标记原音失配，不能把新文件当作旧结果的声音。

取消尽力中止 `SpeechService.transcribe` 的 AbortSignal；提供方可能已收费，界面不承诺退费。取消确认后即使旧响应到达，也不自动采用、启动 TTS 或恢复播放。已完成的合法候选和原音保留。每文稿先限制一个 ASR 工作，避免双击重复付费；与既有 TTS 的任务门禁分别适配，不从 UI 搭第二个私有任务队列。

## 4. 差异预览与原子采用

共享接口为 `createTranscriptionAdoption({documentEditor, transcriptions})`，具体类型和 JSON Schema 在 [transcription-adoption 契约](../packages/kernel/src/contracts/transcription-adoption.ts)。`POST document/transcription/adoption/plan` 接收 `TranscriptionAdoptionDraft`；`POST document/transcription/adoption/apply` 接收 `TranscriptionAdoptionApply`。预检有未解决冲突时返回 `conflicts`，不创建 `planId`；无冲突时沿用 `DocumentEditor.plan` 的同一个 `planId`，没有第二套写入／历史。

每个 target 固定 `sectionId`、`stepId`、可选 `narrationId` 与 `segmentIds`。`content` 由普通 text 和 `{type:'preserve', key}` 组成，原子 key 与原 payload 来自预检的 `targets[].atoms`。文字变化后，未明确处理的原子阻止采用；`discardAtoms` 是明确删除决定，删除有关 cue 暂停还需 `removeCueTimings`。没有提供 `content` 时使用所选段落的原顺序文字，不解析 Markdown 或 cue role。

`draft.id` 是文稿修改意图，未采用期间递增 `draftRevision` 可重新预检；更高修订使旧 quote 失效。同修订的不同内容被拒绝。一次成功采用后的下一次修改使用新意图 ID；重试旧请求沿原意图读取确认，不另写一遍。apply 回执带发送时的 `draftRevision`，调用方仍须与当前输入比较，不能清掉后续校对。

候选的 ASR source 保留原版本；采用 draft 则固定当前保存 source。允许同 UUID、同原音的旧候选重新对照当前讲稿，不因仅修改正文或时机而强制重新识别。新 UUID、原音字节摘要或真实时长失配会拒绝采用，旧 plan 不能直接套用新保存来源。

共享服务 `apply` 固定使用 agent 路径，复用 `DocumentEditor.apply` 的 review-required 门禁。受信 HTTP editor 路径由工厂私有 closure 固定调用 `DocumentEditor.change`，请求 schema 不接受 `origin`，MCP 不能通过 payload 自报 editor。人机两条路径都经过相同的候选／原音校验与原子事务。

### 4.1 固定目标

预览先暂停，捕获 document identity、保存来源、sectionId／StepID、有序 narrationIds、每个 Narration 的完整 typed 内容及草稿修订。ASR 时间不能自动推断教学步骤；作者把所选 segment 明确分配给本步或多个选中步骤，预览逐步显示原文与拟采用文字。未分配段落保留在候选中，不自动创建新页或新步骤。

一个步骤有多份 Narration 时保留其边界与顺序，预览明确每份的改动；不能把整个范围压成一份新字符串。无讲稿的步骤可生成稳定 Narration ID，并在该步追加引用；预览固定这些 ID，重试、回执丢失和同次采用不得另造一套身份。

默认只改变选中范围。若 Narration 还被范围外步骤引用，预览列出共享影响，不能直接修改共享实体。纯文字可为选中引用创建独立 Narration；含 cue 的分离需完整重映射新 cue ID 与对应 cueTimings，保留原实体的所有绑定，并在同一预览中确认。首个采用实现若尚不能生成这个完整修改组，应明确阻止该种部分共享采用，允许作者扩大到确切引用范围重新预览，不能悄悄丢 cue 或对全部引用写入。

### 4.2 保留 pronunciation 与 cue

采用使用 typed 节点 diff，不经过 Markdown／role 文本来回解析。

1. 从原 Narration 建立有序 token 序列。text 是可替换文字；pronunciation 与 cue 是受保护原子。pronunciation 目前没有稳定 ID，预览只用“所属 Narration＋原节点序号＋完整 payload 摘要”作为临时校验键，不写入假 ID。
2. 生成候选文字差异，同时显示现有原子的位置。未改动的 pronunciation 保留 `display` 与 `spoken`；cue 保留 ID、action、target、parameters 及相对顺序。ASR 普通文字不是 cue，不能执行或自动生成动作。
3. 只在原子两侧的文字边界能够唯一对应时自动建议保留位置。重复文字、删除覆盖原子或 `spoken` 与 `display` 不一致而无法定位时，预览报告冲突，要求作者明确放置／保留，或明确删除该原子。不能按旧数字偏移强塞到新段落。
4. 确认后的输出是完整 `NarrationNode[]`。未解决的原子冲突阻止采用；删除 cue 需列出其绑定影响并与 cueTimings 清理形成完整修改组。普通“采用文字”不会默认删除任何受保护原子。
5. 新文本使旧音频及其对齐重新判定。保留下来的 cue 暂停配置不等于拥有新词时码；缺精确时码时计划继续给真实诊断，不沿用旧音频的绝对时间。

例如原稿为 `先看 `、`pronunciation(display='IR', spoken='中间表示')`、`cue(id='focus-ir', target=...)`、` 的结构。`。ASR 返回“先看中间表示的结构，然后比较输出”。预览可以建议保留原读音原子，但不能仅按字符串替换把它变为 text；若 cue 在重复词之间位置不明，必须先解决该位置。未改变原子的通常采用路径中，payload 与 cue ID 要逐项相等。

`Narration.provenance` 只记录本次采用的候选版本、音频 AssetID／SHA 和 segment IDs，不作为字幕或 TTS 的输入替身。作者后来手改文字后，这仍是“曾从此结果采用”的出处，界面不能把新文字称为逐字忠于原录音。需要精确比对时用保存版本与来源摘要判断。

### 4.3 提交与并发

采用前通过现有 DocumentSession 显式 flush 当前文稿，并确认没有 composing、restored、保存错误、agent／history 写入锁。flush 的旧 ACK 不能确认后续输入；等待期间用户的新输入、目标切换或来源变化使本次 review 失效，草稿仍保留。正文不因为后台 ASR 正在运行而只读。

review quote 覆盖 source、候选 revision、步骤与 Narration 基准、文字决策、受保护原子决策、共享引用影响和最终 typed 修改组。提交使用 change ID＋`baseDocumentVersion`；服务在同一文稿事务内重读、校验 quote、引用与 schema，再全部写入或全部拒绝。期间任何版本变化都要求重新预览，不自动把旧 diff 合并到新讲稿，也不按当前页面位置替换原目标。

成功回复是 `DocumentChangeAnswer`，Workbench 让同一来源 actor 读取权威结果。只确认发出的草稿修订；新输入不能被旧 ACK 清空。一次明确采用对应一次文稿历史项，撤消／重做恢复相同稳定 ID 与原子结构；不把整份转写任务塞进正文的字词 Undo 栈。候选仍保留，可重新查看。

## 5. 麦克风录制与文件导入

入口在 Video 的脚本与配音区域，使用“录音”“导入音频”“转写”“采用为讲稿”等短行动。录制启动时暂停并固定录制目标；先得到浏览器设备许可，再显示真实录制状态。目标记录用于建议采用范围，不会随后台导航自动重绑。Doc 不新增录音、ASR、音色或对齐控件，仍只编辑字幕与配音开始。

最小录制器使用公开 `getUserMedia` 与 `MediaRecorder`，按实际 `isTypeSupported` 选 MIME；WebCodecs／Mediabunny 若复用现有实现，必须通过公开共享能力，不能让 workbench 直接导入 `addon-lecture`。当前分层将 Mediabunny 限在 lecture 插件，本切片不为录音面板复制或跨包引用其编码器。

录制状态为 idle → requesting → recording → stopping → ready → importing → imported；拒绝设备、轨道 ended、编码失败与上传失败分别保留真实错误。停止等待最后的 dataavailable 与编码完成，再形成一个内存 File，复用 `document/audio` 的真实探测、范围上限、二进制事务与幂等意图。计时器只显示已录时长，不作为资产实际时长。

录制与文件选择只准备材料；转写前可以试听、重录或取消。重录不覆盖已经保存的旧资产。上传失败保留同一个 File 实例用于显式重试；清理 UI 时停止媒体轨道、移除事件与撤销对象 URL，晚回调按录制 owner／document identity 丢弃。申请设备迟到后若录制已取消，立即关闭获得的流，不再创建素材。

未上传 File 不能写入 sessionStorage 后冒充已持久保存。录制中或有唯一内存原音时，离开给出真正的未保存状态与现有原生离开保护；明确放弃后释放。接受离开、浏览器崩溃或被系统结束仍可能失去内存录音，不能宣称已解决跨 tab／崩溃恢复。要增加恢复，应另实现真实音频持久存储并验证，不能只存标题和时长。

录音限额沿当前音频导入的 16 MiB／十分钟／单音轨 1–2 声道。UI 可到限停止，但服务仍以实际 bytes 验证；不把没有完整文件的部分 chunks 标为导入成功。无安全上下文、无可用设备或浏览器无受支持编码时，保留真实文件导入入口和明确原因。

音频导入不要求已有 confirmed ProductionPlan，ASR 也不要求先编译动画。只有明确把声音附到当前步骤的 media clip 操作才需要现有的完整 plan binding 与可用步长。采用为讲稿后准备已保存版本，保持暂停；不能通过采用文字偷偷设置 `VoiceSource.recording`、添加 clip 或延长 hold。

## 6. 从新讲稿重新配音

采用成功后可以显示“选择音色”与“生成配音”，复用 `DocumentVoiceDialog`、`VoiceoverDialog`、`VoiceoverRequest` 和精确缓存。是否选了 recording 来源、显式静音或局部 voice override 均继续保留；替换它们须走既有范围／覆盖确认。采用讲稿不隐式选 TTS，更不默认克隆录音说话人。

引擎必须来自真实 `tts` 能力，音色必须来自 available 目录；unavailable 与 available 空列表分开。未知 rate／style 能力不生成假选项。试听和正式生成分别明确确认提供方、内容与范围；没有可用引擎时仍能编辑讲稿、保留原音及匹配的旧缓存。

新任务捕获最新已保存 source、IR revision、范围和实际 voice。只生成精确请求缓存缺失的单元；取消保留已完成合法缓存。编辑讲稿、读音或音色后，旧 TTS 不与新字幕混播。任务迟到完成可保留旧产物，但当前计划只能在完整 source／revision／planId 和缓存键均匹配后采用，不自动播放。

ASR 的词时码永远属于原录音。新 TTS 自带真实 words 时，按现有 display／spoken 映射得到字幕时码；没有真实 words 时只能显示分段或明确标识的比例估时。`alignWords` 可能触发另一次 ASR，必须在明确的生成／对齐意图内说明提供方与范围，不能因刷新、打开字幕或导出偷偷调用。

当前非破坏性音频裁切已实现，但没有“任意新讲稿与原录音强制对齐”的能力。后续若开放该操作，结果键至少含音频 SHA、真实 sourceRange、讲稿显示／朗读摘要、语言及对齐引擎版本；任何一个变化均标记过期。未经验证的线性插值不得标为精确。新 TTS 时长改变由同一 ProductionPlan 重算，不能在界面另写自由时间轴来掩盖 hold／cue 冲突。

## 7. UI、MCP 与共享边界

浏览器和 MCP 共用 workspace 作者动作、权限、版本验证、幂等意图、任务回执及同一采用算法。具体动作与反馈循环以 [MCP RFC](rfc-mcp-authoring-actions.md) 为准；不为 agent 提供绕过 review／CAS 的直接覆盖接口。共享 read／plan／apply 由该 RFC 定义，本 RFC 只补转写候选及 typed 采用规则。

MCP 可上传真实原音、请求转写、跟随／取消任务、预览差异、采用讲稿、选择实际音色、明确生成并检查计划和产物。远端调用没有设备权限或用户手势时，录制动作返回 `request_authoring_client` 的待交互请求，状态为 waiting-for-device／awaiting-input；必须由授权浏览器真实开始／停止录制。无浏览器时导入已有真实音频仍可完成后续流程，不能返回虚构录制成功。

业务回执须区分输入材料已保存、ASR 已完成、讲稿已采用、配音已生成、当前计划已就绪；HTTP 200 不代表所有阶段已成功。反馈包含稳定目标、实际版本、任务 sequence、可重试原因与下一步动作。浏览器关闭不删除服务端已接纳任务；恢复时按 intent/task ID 查真实状态，不依据进度条猜完成。

界面复用公共 Input、成对时间字段、Range、Button、Dialog、Notice 与任务状态。新增录制／转写／差异审阅组合先补正式 Figma 状态，再实现公共能力；不新增常驻机制说明卡。提供方与发送范围出现在操作确认，来源、过期状态与失败出现在有关材料或动作旁。

## 8. I01–I12 验收映射

下表引用[现有交互规范](prototypes/workbench/interactions.json)，不是另建一套位置、保存或任务规则。

| 规则 | 本流程的验收事实 |
| --- | --- |
| I01 编辑与保存 | 600ms／IME／显式 flush 沿原 actor；保存期间新输入、转写候选草稿和晚 ACK 各自归属，失败不丢稿 |
| I02 版本冲突 | 旧来源任务可查看但不自动采用；变更 source 后旧 review 失效；无对应 StepID 不按序号重绑 |
| I03 页面与素材 | 原音不覆盖，采用按稳定引用写入；共享 Narration 分离与 cue 依赖作为完整修改组 |
| I04 导航与时序 | 录制、试听、编辑先暂停并固定目标；改稿后保页／步，新的已保存计划与画面一致 |
| I05 配音与任务 | 真实 engine／voice，保局部覆盖；明确试听／生成，取消中不冒充已取消 |
| I06 字幕与来源 | ASR 候选与 Narration 分开；protected atoms 保留；新字幕不配旧声，缺词时码如实 |
| I07 Agent 与审阅 | 人工与 MCP 共用差异预览及原子采用，不能覆盖开始后新输入或丢失目标 |
| I08 音频剪辑 | 保存原文件；trim 不改 bytes，不把播放区间假当 ASR 上传区间；对齐随真实依赖失效 |
| I09 放映与返回 | 录制工具只在作者 Video；观众不接收录音草稿，进入／退出保持独立入口与单一播放权 |
| I10 任务与产物 | 意图去重、sequence、取消、显式重试和来源绑定；旧产物不标当前，播放导出不触发生成 |
| I11 键盘与焦点 | 输入与 IME 优先；Esc 只关顶层；录制／review 关闭归还有效触发器，不偷正文焦点 |
| I12 密度与响应式 | 亮暗×桌面／窄屏四组合；桌面30／13、触屏44／16沿现 tokens；布局变更不清材料与草稿 |

## 9. 实施切片与完成门槛

先交服务能力，不等待完整 Video 界面；录制和导入都是本需求的必交部分，以下顺序只是依赖顺序。

| 切片 | 最小源码归属 | 必须实际证明 |
| --- | --- | --- |
| A：共享 ASR 候选 | kernel 新 transcription 契约；workspace 源／资产读取、任务意图与候选存储；MCP 薄适配；可选引擎元数据另补 | 真实导入→任务→不可变候选，未改任何 Narration；相同 intent 不重复调用；失败／取消／服务恢复／源变仍可查 |
| B：差异预览与采用 | workspace 共享预览／采用动作；纯 typed diff；kernel provenance／schema；Workbench actor 适配 | 按多个稳定 StepID 一次 CAS；重复文字、pronunciation、cue、共享引用不丢；晚 ACK、新输入、外部版本冲突、Undo／Redo／重载均正确 |
| C：Video 录音与转写 | Workbench 录制 owner、原生设备 API、公共控件与正式 Figma；同一 audio import 增加来源 | 真人麦克风权限允许／拒绝、停止、重录、试听、导入失败重试、切文稿迟回调；原字节与来源可检查。文件导入同样能走 A／B |
| D：明确 TTS 闭环 | 复用现有 voice 设置、任务与 ProductionPlan，不另建生成器；补必要入口与来源状态 | 采用→保存→选真实音色→明确生成→新 plan/frame→播放／暂停／跳步；新字幕／声音来源匹配，原录音与旧候选保留 |

MCP 的 read／plan／apply 和 task 反馈与 A／B 并行，录制委托浏览器的动作与 C 同步。不等完整录音面板才开放已具备的服务，也不能只交 A／B 就宣布“录制到重新配音”全部完成。

验证使用独立私有文稿、真实服务和有界原音；不新增 tracked tests 或默认跑套件。先做不付费的导入、候选存储、采用和竞态链。真实 ASR／TTS 需按实际授权与配置明确调用，记录提供方、请求范围、来源、结果及实际未验证项；没有真实引擎验证就保留能力门槛，不用 fake 音频或 schema 通过代替完成。

每片记录实际 source SHA、请求与回执版本、canonical 前后、资产字节摘要和资源清理。真实模型调用不记录凭据或完整鉴权 URL。最终验收至少有录制与文件两条来源汇入同一 ASR→采用→TTS 链，四组合查看操作、错误、任务、review 与焦点；无需重跑与本片无关的大矩阵。
