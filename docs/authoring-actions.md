# 作者动作

Web 工作台、内置助手与外部 MCP agent 用同一套作者动作修改文稿、导入素材、转写、配音和控制作者窗口。文稿结构见 [IR](ir.md)，工作台见 [Studio](studio.md)。

## 1. 原则

- 唯一内容入口是 `lecture.json`。运行快照、`ProductionPlan`、字幕和时间线是派生结果，动作不写回它们。
- 动作语义只有一份：纯规则在 kernel，事务与外部服务在 workspace 的共享服务。HTTP 与 MCP 是适配器，React、BlockNote 与 dsh 不另持一份。
- 动作接收稳定实体 ID 与公开参数，返回实际影响、保存版本与验证依据。agent 不模拟鼠标，也不直接改 `lecture.json`；工程代码文件可原生编辑。
- 完成依据按类别区分：保存决定看保存回执与读后核验；生成、转写、构建看任务终态与来源绑定；播放、定位、草稿看指定客户端的真实应答。
- 缺服务、设备或权限时返回明确状态，不虚构成功。读取、探测与预检不调用 ASR、TTS 或模型，也不隐式编译。录音、转写、采用讲稿、生成配音是四个独立决定，不自动串联收费服务。

## 2. 共享服务与适配器

workspace 为每项能力创建一个实例，HTTP 与 MCP 共用实例与回执表。MCP 只经 `McpHost`（`packages/mcp/src/host.ts`）的可选服务字段调用，不导入 workspace 或插件。

| 服务（`packages/workspace/src/node/`） | HTTP 路由 | MCP 适配（`packages/mcp/src/`） |
| --- | --- | --- |
| `createDocumentEditor`（`document-authoring.ts`） | `document`、`document/{change,outline,part,capabilities}`、`document/page/*`、`document/action/*` | `authoring.ts`、`authoring-actions.ts` |
| `createProjectAuthoring`（`projects.ts`） | `project/*` | `projects.ts` |
| `createDocumentHistory`（`document-history.ts`） | `history/*` | `history.ts` |
| `createDocumentAudioAuthoring`（`document-audio.ts`） | `document/audio`、`document/media-clip*`、`document/recording/adopt` | `audio-authoring.ts` |
| `createDocumentImageAuthoring`（`document-images.ts`） | `document/image`、`document/asset` | `image-authoring.ts` |
| `createDocumentTranscriptions`、`createTranscriptionAdoption` | `document/transcription*` | `transcription.ts` |
| `createDocumentVoiceAuthoring`（`document-voice.ts`） | `voice-*` | `voice-authoring.ts` |
| `createAuthoringClients`（`authoring-clients.ts`） | 共享 WebSocket 的 `authoring-client` 通道 | `authoring-clients.ts` |
| `OutputJobs`（`jobs.ts`） | `jobs*` | `mcp.ts` 的 `build/get_builds/cancel_build` |

契约在 `packages/kernel/src/contracts/` 的同名文件，工具表在 `packages/mcp/src/mcp.ts`，每个工具的 `kind` 为 `read`、`operate` 或 `spend`。Web 经 `packages/workbench/src/workspace-client.ts` 调用同一组路由。

Web 与服务端共用的纯规则在 `packages/kernel/src/document-*.ts`（页面、音色继承、批注、组件参数、字幕时间），语义动作分派在 `document-authoring-actions.ts`。不带工作区的 stdio 宿主（`compilerMcpHost`）没有这些服务，能力响应报告 unavailable。

## 3. 能力与版本

调用方先探测能力，再读权威版本。`get_authoring_capabilities` 与各服务的 `get_*_capabilities` 不编译，报告各动作能否预检与提交、预算、`idempotency` 与 `review`。状态区分 available、unavailable 与 unknown；`verification: configuration-only` 只看了配置，不证明鉴权或合成可用。能力响应不含凭据。

| 标识 | 来源 | 用途 |
| --- | --- | --- |
| `documentId` | `TeachingDocument.id` | 区分改名、复制与同名目录 |
| `version` + `fingerprint` | 保存字节 | CAS，与编译源匹配 |
| `irRevision` | `IrAnswer.revision` | 运行快照 |
| `planId` | `ProductionPlan.binding` | 不可变播放计划 |

作者流程使用 `CanonicalSource { documentId, version, fingerprint }`；构建使用由它生成的 `JobSource { version, fingerprint }`。`schemaVersion` 与 `apiVersion` 不是源版本。

## 4. 读取与预算

- `get_document_outline` 按集合（默认 `sections`，另有 `blocks/steps/narrations/assets/definitions/comments`）列出稳定 ID、类型与计数。
- `read_document_part({ source, target, offset? })` 读一个实体或根字段，`path` 逐层选字段或数组索引，不是文件路径。
- 全量 `get_document` 留给 SDK，可能超出 agent 预算。`get_section/get_step/deck_info` 读运行快照，不是可编辑内容。

分片协议在读取、诊断、历史文件与客户端草稿中相同：

- 小值返回 `encoding: 'value'`；大值返回 `encoding: 'json-text-fragment'` 与 `text/offset/nextOffset/complete`。按 `nextOffset` 拼接解码后的 text，完整后只 `JSON.parse` 一次。
- 偏移以 UTF-16 计，不拆代理对。续读必须带首读的 source（或 version 与 digest，FNV-1a 64）；源变化返回 409，调用方从头读。坏源返回 422，不回退到运行快照。

请求上限为 2048 或 4096 个 `JSON.stringify` UTF-16 字符，回复上限 7168 个缩进 JSON 字符，低于 dsh 的剪裁阈值 8192。放不下时分片前进或返回 413，不静默截断。

## 5. 文稿修改

每类写入分两步。预检只读，返回 `planId`、`digest`、`expiresAt`、source、影响与问题；提交只带 `{ planId, source, digest }`，服务从同一计划表取回确切候选，在事务内全部重查。完整候选、ID 映射和详情是按需读取的资源，模型不回抄。

| 计划族 | 预检 → 提交 | 范围 |
| --- | --- | --- |
| 通用修改 | `plan_document_change` → `apply_document_change` | `DocumentChange`：`DOCUMENT_OPERATION_TYPES` 的九种操作、整份 replacement、同文稿文本 `fileChanges` |
| 页面 | `plan_page_change` → `apply_page_change` | `create`、`rename`、`move`、`delete` |
| 页面复制 | `plan_page_duplication` → `apply_page_duplication` | 复制一页 |
| 语义动作 | `plan_authoring_action` → `apply_authoring_action` | `DOCUMENT_AUTHORING_ACTION_TYPES`：`comment.*` 七种、`voice.set`、`component.*` 四种、`caption.timing.set/reset` |
| 项目 | `plan_project_change` → `apply_project_change` | 新建、复制、目录改名、删除、标题 retitle |
| 转写采用 | `plan_transcription_adoption` → `apply_transcription_adoption` | 第 8.3 节 |

类型清单在 `packages/kernel/src/contracts/authoring.ts` 与 `authoring-actions.ts`。计划按族隔离，一个族的候选不能交给另一个族的 apply。预检只做 Schema 校验、纯领域变换、元数据与精确缓存查询，不执行工程代码、转写或合成；需要实际运行才知道的结果标为未知。影响列出增删改的实体、共享定义与讲稿的使用者、失锚批注与失效的配音、字幕和计划。

- **身份**：新实体 ID、批注作者与日期由服务在预检时固定，重试不生成第二组。复制时共享素材与定义保留引用。
- **删除**：页面与批注删除的 apply 另需 `confirmDeletion: true`。保留讲稿中的 cue 指向被删内容时返回 `page-referenced`。删页清除独占的块、步骤、讲稿与片段，保留共享讲稿、素材、定义与批注线程；最后一页留一个空步骤。
- **批注**：内容是 `RichTextNode[]`，不暴露 BlockNote JSON。锚点 `{ blockId, offset }` 按 UTF-16 计，非法返回 422；已有线程无法精确映射时保留内容并报告 `anchorDetached`。owner 可管理他人批注，editor 只改自己的。
- **音色**：`voice.set` 的 scope 为 document、page、step 或 steps，source 为 TTS、none 或 null（移除该槽位）。默认保留下层覆盖，`replaceOverrides` 明确替换。录音来源只经 `adopt_recording` 设置。
- **组件参数**：`changes` 对路径 `set` 或 `remove`，只允许 Schema 声明的可编辑字段，未修改的字段保留。步骤参数是顶层浅覆盖，改子字段会物化整个顶层值，后继继承影响由 `read_authoring_action_impact` 分页读取。`component.definition.use` 只选择已有 Definition。
- **字幕时间**：`caption.timing.set` 需要当前 IR 与确认时长，以 `read_production_plan` 的 `ProductionStep.captionTiming` 为基准提交步内起止时间，只改字幕映射。`reset` 不需编译。
- **项目**：目录动作绑定 HEAD、目录树与已识别的跨文稿引用，在 `DocumentOperations` 事务内提交；会断开已识别引用的删除被拒绝。opaque 参数与场景源码按原字节保留。retitle 委托 `DocumentEditor`，无 Git 时可用。文稿绑定令牌只能 retitle 自己。

提交成功后重读权威文稿与参与文件。回执带真实 source、commit（id 与 origin）、effect 与 `verification`：`saved` 已核验，`compiled/runtime: not-requested`。

## 6. 原子性与幂等

- 同一文稿的 `lecture.json`、实现文件、原始媒体与引用文件在一个 `SourceEditor.transaction` 内提交：文稿锁、CAS、一次 git 提交；失败恢复原 JSON 并删除新建文件。
- 通用修改最多 16 个文件、文本合计 2 MiB，每个已有文件带 base，新文件 `base: null`。二进制只走导入接口。
- 写入带客户端首次发送前生成的稳定意图 `id`。同意图同 payload 返回原回执；同 ID 不同 payload 被拒绝。
- 计划有效五分钟；计划与回执各保留 64 条，都在进程内。幂等范围是 `process-current-source`：结果仍是当前源才复用回执，不承诺跨重启。
- 丢失应答时用同一引用重试。409（旧源、计划变化或过期、Undo 后的 ABA）不是自动重新预检的许可。
- 事务已提交而读回发现外部变化时，错误带 `committed: true` 与已保存版本，不能当作未写入重发。

## 7. 素材与片段

导入素材与把素材用到步骤是两个决定，各自一次事务。

**音频导入**

- Web 用 multipart `POST document/audio`。MCP 先 `inspect_workspace_audio` 取得 `file: { path, sha256, byteLength }`，再 `import_workspace_audio`，导入时重读核对。`path` 限当前文稿范围内的普通文件，拒绝绝对路径、URL 与符号链接。
- 媒体按真实字节识别，不信文件名与 MIME：Ogg、WAV、MP3、M4A、音频 WebM，单音轨，不超过 16 MiB 与十分钟。服务分配 Asset ID 与路径 `assets/audio/<id>.<格式>`，上传名只作 `Asset.title`。
- 导入不创建片段、不识别、不选音色。`inspect_document_audio` 读已保存资产，包括未被引用的；运行快照的 `productionAssets` 只含被引用的。

**图片导入**：`inspect_workspace_image` → `import_workspace_image`，核对规则同音频，只登记资产；放入正文另用 `insertBlock`。

**片段**

- `read_production_plan` 只读已有快照，没有时返回 `production-document-unavailable`，需先显式读 `presmium://ir?document=…`。
- `validate_media_clip_change` 预检，`change_media_clip` 提交。添加或修改需当前完整 `ProductionBinding`；移除只需 source，坏计划下也能清理。
- 所选步骤必须 `timing=confirmed`。入点非负，出点不超过真实时长，偏移加区间不超过该步；越界整体拒绝，不静默裁切或改 hold 与 cue。
- 移除片段保留原文件。保存成功不代表新计划就绪。

**原音作为本步配音**：`adopt_recording` 核对 StepId、Asset ID 与原音 SHA-256，只把该步 `voiceSource` 改为 recording，不启动 ASR、TTS 或播放。

- 不设 `sourceRange` 时完整播放一次，设置时只写本步覆盖。字幕取当前讲稿文字，`alignment=none`，不移用 ASR 词时码。

## 8. 录音与转写

### 8.1 数据归属

| 数据 | 保存位置 | 规则 |
| --- | --- | --- |
| 原始音频 | canonical `Asset` 与文稿内原字节 | 不原地裁切或覆盖；重录产生新资产 |
| 转写任务 | `<文稿>/transcriptions/<id>/task.json` | 持久 journal，含取消意图 |
| ASR 结果 | `<文稿>/transcriptions/<id>/<revision>.json` | 不可变候选；重新识别产生新版本 |
| 候选修订草稿 | 浏览器 | 未采用内容不进入编译 |
| 作者讲稿 | `narrations` 与 `steps[].narrationIds` | 只有明确采用才写入 |
| 采用来源 | `Narration.provenance` | 候选版本、音频 ID 与 SHA、segment IDs；之后手改不改写它 |
| 合成音频 | speech 精确请求缓存 | 显式任务生成 |

候选不参与编译，删除候选不影响已采用讲稿。旧讲授轨（`track_transcribe` 写的 `utterances`）不是采用入口。

### 8.2 候选与任务

- `TranscriptionRevision` 固定 source、音频 ID 与 SHA、实际引擎、毫秒 `segments` 与 `timing: 'words' | 'segments' | 'none'`。只有校验过的 words 才算 `words`。转写整份资产。
- 工具：`start_transcription`（spend）、`get_transcriptions`、`get_transcription`、`get_transcription_result`、`cancel_transcription`（operate）。
- 语音服务经 `Compiler.nodeServices()` 按目标文稿装配，不运行 IR pass 或场景。
- 每文稿同时一个 ASR 任务。同 intent 同输入返回同一任务。重启时进行中的付费请求不自动重试，标为 `transcription-interrupted`。
- 转写期间正文可编辑；完成时源已变仍保存带原 source 的候选，标为需重新检查。取消尽力中止，提供方可能已计费；取消后晚到的结果不采用。

### 8.3 差异预览与采用

契约在 `kernel/src/contracts/transcription-adoption.ts`。采用复用 `DocumentEditor` 的计划与事务。

- 每个 target 固定 `sectionId`、`stepId`、可选 `narrationId` 与 `segmentIds`。ASR 时间不推断步骤；未分配的段落留在候选中。
- 一步多份讲稿时保留各自边界；被范围外步骤共享的讲稿不直接修改。
- 差异按 typed 节点计算，不经 Markdown 往返。text 可替换；pronunciation 与 cue 是受保护原子，`content` 用 `{ type: 'preserve', key }` 引用预检的 `targets[].atoms`。只有原子两侧文字唯一对应时才建议位置，否则报告冲突。未处理的原子阻止采用；`discardAtoms` 明确删除，删 cue 暂停另需 `removeCueTimings`。ASR 文字不是 cue。
- 有冲突时预检返回 `conflicts`，不创建 planId。`draftRevision` 递增使旧计划失效。原音摘要或时长不符时拒绝。
- 一次采用是一次历史项，不改 `voiceSource`、不合成、不加片段。

### 8.4 麦克风录制

- 入口在 Video 的"原音频"卡，使用公开 `getUserMedia` 与 `MediaRecorder`；先取得设备许可再显示录制中。Doc 不提供录音控件。
- 停止后形成内存 File，走 `document/audio` 的同一事务与限额。保存、采用、转写分开；重录不覆盖已保存资产。未上传的录音只在内存，不承诺崩溃恢复。

## 9. 音色与配音

- `get_voice_authoring_capabilities` 与 `get_voice_catalog` 不等待编译。`status=configured` 只表示引擎声明可合成；目录区分 available、unsupported 与 unknown。
- 每文稿一个配音 owner；`VOICEOVER_EXECUTION` 是实际实现，`VOICEOVER` 只是安装标记。
- 视频制作的播放按钮复用此 owner 按当前缺失单元开始任务；生成中可以暂停取消，已完成缓存保留。该播放意图绑定源码、工程修订和明确导航版本，不由被动任务观察触发；agent 的生成仍经 `spend`。

| 工具 | kind | 作用 |
| --- | --- | --- |
| `get_voiceover_status` | read | 声音目标、缓存状态与 StepId；无当前 IR 时 unavailable |
| `get_voiceover_jobs`、`get_voiceover_job` | read | 近期任务，带 source、revision、sequence 与当前性 |
| `start_voiceover` | spend | `{ intent, source, revision, scope }`；只生成精确缓存缺失的单元 |
| `cancel_voiceover` | operate | cancelling 保持到实际停止；已完成的缓存保留 |
| `quote_voice_preview` | read | 实际文字、提供方与缓存状态；quote 两分钟有效 |
| `preview_voice` | spend | 返回 `presmium://voice-preview/{id}?document=…` 音频资源 |

- 任务查询与取消不编译，坏 JSON 下也可用；任务不转到新源继续，状态在当前进程内。生成试听不代表客户端已播放。
- ASR 词时属于原录音，永远不作为新 TTS 的字幕时间。新 TTS 有真实 words 时按 display 与 spoken 映射字幕，否则只显示分段或标明的比例估时。可能调用 ASR 的对齐只在明确的生成或对齐意图内发生。
- 产物只在 source、revision、planId 与缓存键全部匹配时进入当前计划，旧 TTS 不与新字幕混播。

## 10. 任务反馈

构建、配音与转写各自保留执行器。共同规则：

- 任务带 `id`、`intent`、文稿、source、单调 `sequence`（状态拥有者分配，Web 与 MCP 看到同一序号）、范围、状态、提供方、错误与产物。状态为 queued、running、cancelling、cancelled、done、failed；来源变化后 `current: false`。
- 断开连接不取消任务。丢失应答时先按 intent 查询，已接纳就跟踪，未接纳才重发同一意图。按 intent 的取消可早于接纳。
- 取消已结束或已在取消中的任务直接返回当前状态，不请求批准。
- `build` 的每个目标先经 `OutputJobs.check` 接纳；未知目标返回 422 `job-target-unknown`；同 source 与输入已有作业时返回 `reused: true`。
- 指定不支持或未配置的引擎返回不可重试的 422；503 只表示语音服务未解析或没有可用引擎。

## 11. 作者客户端

播放、定位、准备预览与草稿操作由已连接的浏览器执行。`AuthoringClients` 是进程内的在线登记与请求回执，不持有 writer 或编译器。

| 工具 | kind | 作用 |
| --- | --- | --- |
| `get_authoring_clients` | read | 客户端的 source、revision、位置、编辑状态与可用动作；不含未提交内容 |
| `request_authoring_client` | operate | 指定 clientId、epoch、connectionId、客户端 revision、source、requestId 与动作 |
| `get_authoring_client_request` | read | sent、executing、done、refused、failed、expired，及浏览器观察与 `current` |

动作清单是 `AUTHORING_CLIENT_ACTIONS`（`kernel/src/contracts/authoring-clients.ts`）：`state.read`、`source.flush`、`preview.prepare`、`playback.pause/play/seek/rate`、`position.step`，以及 `comment-drafts.*` 与 `component-drafts.*` 的 inspect、read、restore、discard。

- 客户端执行前报告 executing，服务端确认该连接仍拥有请求；断线、来源变化或超时都不授权执行。请求 30 秒过期，同 requestId 只读原回执；丢失回执先 `state.read`，不换 requestId 重试。
- `source.flush` 只等待当前 source actor 保存；组词、冲突或锁定时不开放。
- 定位与播放先暂停，不切模式、不编译；播放只面向已准备的 `ProductionBinding`。
- `preview.prepare` 显式编译并准备已保存源，不合成或播放；编辑未保存或有模态框时不开放。
- 草稿 inspect 只返回元数据；read 按第 4 节分片，带完整 UTF-8 SHA-256，格式为 `presmium-rich-text-json-v1`（批注）或 `presmium-component-parameters-json-v1`（组件属性）。当前内存稿遮蔽同 ID 的旧存储。
- restore 带候选引用与 `expectedCurrent`，先备份当前稿再分出新分支；恢复不提交，仍由作者 Save 或 Apply。discard 只退休选中的备份。
- `current` 是对该客户端的观察，不是跨窗口原子结论。主题、缩放、面板与播放头是客户端设置，不写进文稿。

## 12. 历史、审阅与权限

**历史**（`kernel/src/contracts/document-history.ts`）

- `get_document_history` 每页最多 20 条原修改，`undone` 与 `revertTarget` 由完整历史链派生。`historyBinding` 含已保存原文的 version、fingerprint 与 git HEAD `snapshot`。
- `read_history_file` 读可达提交中的文本文件，默认 `lecture.json`；不恢复当前文稿。
- `undo_document_change`、`redo_document_change`、`revert_document_change` 传 `{ id, source, snapshot, expect }`，expect 是读取得到的完整提交 ID。执行时复核原文、HEAD 与目标，产生新的 revert 提交；不 checkout、不 reset、不 discard。
- 越界提交、目标文件有未提交改动、首个基线都拒绝；没有 git 时 `available: false`。浏览器原生 Undo 不归这些工具管。

**审阅**：workspace 的 `review/*` 由 dsh 桥接，核心 MCP 没有审阅工具。配置 required review 时，agent 来源的写入返回 409 `authoring-review-required`，能力响应 `review: 'required-unsupported'`。

**权限**

- 预检与提交都检查服务端成员、角色与文稿绑定令牌；外部 agent 与 dsh 经过同一权限。
- 写入来源由宿主固定：MCP 为 agent，HTTP 作者路径为 editor。payload 不接受 `origin` 或 `confirmed`；`confirmed` 只由可信宿主在 spend 授权后注入。
- operate 与 spend 工具先运行服务上与提交同路径的 `check*` 方法，通过后才经 `call.approve` 请作者批准；检查失败直接返回错误码，作者看不到批准请求。批准后全部重查，期间文稿被改返回 409；拒绝或超时返回 403 `operation-not-allowed`。

## 13. 诊断与验证

**诊断**（`packages/mcp/src/diagnostics.ts`）

- `get_diagnostics` 读工作台正在用的 `DiagnosticSnapshot`，不编译、不检查，标 `verification: 'unobserved'`。
- `check_document` 显式编译并运行插件检查，返回计数与快照版本，标 `currentSource: 'unverified'` 与 `browser: 'unobserved'`。
- 每条诊断保留 origin、源位置与 revision；不同生产者不合并，空快照不证明源有效。作者窗口的异常与请求失败经 `POST diagnostics/authoring` 报告，不需先准备 IR。
- `get_runtime` 是作者窗口最后的报告，不证明新源成功。

**验证层次**：每层独立报告，低层成功不代表高层成功。

1. 保存：`verification.saved`，重读权威文稿与文件。
2. 编译：快照的 `IRDocument.source` 与诊断。
3. 计划：`ProductionBinding`、确认时长、精确配音缓存、真实媒体与字幕对齐来源；estimated 只能按稳定步骤播放并在缺失音频处缓冲，不能任意按时间定位或导出；unknown 仍不可按时间播放。
4. 浏览器：经客户端请求取得该 source 的位置、组件错误与播放状态。
5. 产物：任务的 source 与输入指纹、文件、媒体类型与字幕。

agent 的循环：探测能力 → 读源 → 预检 → 提交或开始任务 → 轮询 → 验证 → 按诊断修订。收费服务与播放只在用户要求的范围内发起。

## 14. 不提供的能力

以下能力报告 unavailable 或没有工具：

- 统一任务接口、事件游标与跨重启的意图账本。
- 远程上传素材；MCP 只导入工作区内已有文件。
- MCP 控制客户端录制。
- 步骤的新建、重排与删除动作，共享讲稿的分离编辑，独立组件实现副本。
- 审阅的 MCP 动作、项目恢复、任意 checkout 或 discard。
- 新建批注 composer 的草稿恢复，其它未接入表单的草稿。
- 原音与新讲稿的自动词对齐、跨步连续分配原音、只转写所选区间。
- 通用 `apply_document_change` 的大文稿输入与结果没有预算；agent 优先用页面与语义动作。
