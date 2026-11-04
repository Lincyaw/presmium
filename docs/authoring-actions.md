# 作者动作

Web 工作台、内置助手与外部 MCP agent 用同一套作者动作修改文稿、导入素材、转写、配音和控制作者窗口。文稿结构见 [IR](ir.md)，工作台见 [Studio](studio.md)。

## 1. 原则

- 唯一内容入口是 `lecture.json`。运行快照、`ProductionPlan`、字幕和时间线是派生结果，动作不写回它们。
- 动作语义只有一份：纯规则在 kernel，事务与外部服务在 workspace 的共享服务。HTTP 与 MCP 是适配器，React、BlockNote 与 dsh 不另持一份。
- 动作接收稳定实体 ID 与公开参数，返回实际影响、保存版本与验证依据。agent 不模拟鼠标；有效文稿经文稿动作修改，无效 IR 可经受保护的文件入口修复。工程代码文件可原生编辑。
- 完成依据按类别区分：保存决定看保存回执与读后核验；生成、转写、构建看任务终态与来源绑定；播放、定位、草稿看指定客户端的真实应答。
- 缺服务、设备或权限时返回明确状态，不虚构成功。读取、探测与预检不调用 ASR、TTS 或模型，也不隐式编译。录音、转写、采用讲稿、生成配音是四个独立决定，不自动串联收费服务。

## 2. 共享服务与适配器

workspace 为每项能力创建一个实例，HTTP 与 MCP 共用实例与回执表。MCP 只经 `McpHost`（`packages/mcp/src/host.ts`）的可选服务字段调用，不导入 workspace 或插件。

| 服务（`packages/workspace/src/node/`） | HTTP 路由 | MCP 适配（`packages/mcp/src/`） |
| --- | --- | --- |
| `createDocumentEditor`（`document-authoring.ts`） | `document`、`document/{change,outline,part,capabilities}`、`document/page/*`、`document/action/*` | `editing.ts`、`authoring.ts`、`authoring-actions.ts` |
| `SourceEditor`、`createWorkspaceSource`（`source-editor.ts`、`workspace-source.ts`） | `files`、`source`、`source/create`、`source/transaction` | `workspace-source.ts` |
| `createProjectAuthoring`（`projects.ts`） | `project/*` | `projects.ts` |
| `createDocumentHistory`（`document-history.ts`） | `history/*` | `history.ts` |
| `createDocumentAudioAuthoring`（`document-audio.ts`） | `document/audio`、`document/media-clip*`、`document/recording/adopt` | `audio-authoring.ts` |
| `createDocumentImageAuthoring`（`document-images.ts`） | `document/image`、`document/asset` | `image-authoring.ts` |
| `createDocumentTranscriptions`、`createTranscriptionAdoption` | `document/transcription*` | `transcription.ts` |
| `createDocumentVoiceAuthoring`（`document-voice.ts`） | `voice-*` | `voice-authoring.ts` |
| `AgentSessionReviews`、`createWorkspaceReview`（`review/`） | `review`、`review/accept`、`review/reject`、`review/restore` | `workspace-review.ts` |
| `OperatorSpeechSettings`（kernel 的 `node/operator-speech.ts`） | `speech-settings` | `speech-settings.ts` |
| `createAuthoringClients`（`authoring-clients.ts`） | 共享 WebSocket 的 `authoring-client` 通道 | `authoring-clients.ts` |
| `OutputJobs`（`jobs.ts`） | `jobs*` | `mcp.ts` 的 `build/get_builds/cancel_build` |
| `createDocumentCapture`（`capture.ts`） | 无 | `capture.ts` 的 `capture_slides` |

契约在 `packages/kernel/src/contracts/` 的同名文件，工具表在 `packages/mcp/src/mcp.ts`，每个工具的 `kind` 为 `read`、`operate`、`spend`、`write` 或 `agent`。Web 经 `packages/workbench/src/workspace-client.ts` 调用同一组路由。

Web 与服务端共用的纯规则在 `packages/kernel/src/document-*.ts`（页面、音色继承、批注、组件参数、字幕时间、字幕大小），语义动作分派在 `document-authoring-actions.ts`。不带工作区的 stdio 宿主（`compilerMcpHost`）没有这些服务，能力响应报告 unavailable。

## 3. 能力与版本

工具是否可用以 MCP 的工具表为准；已列出的简单编辑工具可直接调用。需要了解高级动作限制时，`get_authoring_capabilities` 与各服务的 `get_*_capabilities` 报告能否预检与提交、预算、`idempotency` 与 `review`，不编译文稿。状态区分 available、unavailable 与 unknown；`verification: configuration-only` 只看了配置，不证明鉴权或合成可用。能力响应不含凭据。工具的参数来自同一份 `inputSchema`，没有单独维护的参数清单。外部 MCP 默认只列出当前上下文、页标题、讲稿编辑、文稿目录、操作查询及按权限种类分开的调用入口。`operations` 按关键字分页查找动作，指定 `name` 时返回自动生成的参数摘要，`schema: true` 才返回完整 Schema。`read_operation`、`edit_operation`、`spend_operation`、`write_operation` 与 `agent_operation` 只调用同种权限的已授权动作，保留目标 Schema 校验、确认策略与错误和图片结果；没有相应动作的入口不提供。Schema 只携带实际引用到的定义。

`presmium mcp` 的 stdio 连接也使用精简目录。已有客户端重新连接后按新目录查询动作；需要原有命名工具的 SDK 可显式连接 `/mcp?tools=all`。CLI `presmium mcp tools <工具>` 返回参数摘要，`--schema` 返回完整格式，`tools --all` 列出完整目录，`--json` 输出 JSON；`mcp call` 保留原命名工具调用。可信 dsh 宿主保持命名工具目录，按工具的 `presmium/workspace` 元数据路由作者与候选工作区，保留按目标工具执行的审批与审阅钩子。两种目录共享调用方权限，查询参数不会提升授权。

`editor_action` 封装已接入的浏览器动作：只有一个已连接客户端时省略 `clientId`，服务端提供 source、连接版本与播放绑定，并短暂等待真实应答。多客户端要求明确选择；丢失应答不会自动重发。回执为 pending 时带现有请求引用，使用 `get_authoring_client_request` 查询，不把请求已接收当作执行完成。草稿的确切引用与恢复前提仍由调用方明确选择。 请求执行期间不再报告其他可执行动作；`cancel_authoring_client_request` 只取消同一调用方的确切请求，等待浏览器应答或超时，不宣称已保存的事务回滚。

| 标识 | 来源 | 用途 |
| --- | --- | --- |
| `documentId` | `TeachingDocument.id` | 区分改名、复制与同名目录 |
| `version` + `fingerprint` | 保存字节 | CAS，与编译源匹配 |
| `irRevision` | `IrAnswer.revision` | 运行快照 |
| `planId` | `ProductionPlan.binding` | 不可变播放计划 |

作者流程使用 `CanonicalSource { documentId, version, fingerprint }`；构建使用由它生成的 `JobSource { version, fingerprint }`。`schemaVersion` 与 `apiVersion` 不是源版本。

## 4. 读取与预算

语音服务的运营者配置由 `get_speech_settings/change_speech_settings` 读取与修改，只向未绑定文稿的工作区所有者提供。Web 路由、MCP 与服务的密钥读取共用一个 `OperatorSpeechSettings` 实例。修改参数由 `SPEECH_SETTINGS_CHANGE_SCHEMA` 定义；HTTP 保留显式 revision，MCP 省略 revision 时在服务端读取，提交仍核对同一版本。修改属于 `write`、作用域为 workspace，保留写入确认；普通文稿编辑授权不会允许它。凭据只写不读，返回的 configured 为 configuration-only，不证明鉴权或合成可用。

- `list_skills` 默认只返回技能摘要与入口；指定 `name` 可筛选一个技能，`details: true` 才展开完整文件列表与版本。技能正文与引用文件仍经 `read_skill` 分片读取。
- `get_document_outline` 按集合（默认 `sections`，另有 `blocks/steps/narrations/assets/definitions/comments`）列出稳定 ID、类型与计数。
- `read_document_part({ source, target, offset? })` 读一个实体或根字段，`path` 逐层选字段或数组索引，不是文件路径。
- 全量 `get_document` 留给 SDK，可能超出 agent 预算。`get_section/get_step/deck_info` 读运行快照，不是可编辑内容。

分片协议在读取、诊断、历史文件与客户端草稿中相同：

- 小值返回 `encoding: 'value'`；大值返回 `encoding: 'json-text-fragment'` 与 `text/offset/nextOffset/complete`。按 `nextOffset` 拼接解码后的 text，完整后只 `JSON.parse` 一次。
- 偏移以 UTF-16 计，不拆代理对。续读必须带首读的 source（或 version 与 digest，FNV-1a 64）；源变化返回 409，调用方从头读。坏源返回 422，不回退到运行快照。

请求上限为 2048 或 4096 个 `JSON.stringify` UTF-16 字符，回复上限 7168 个缩进 JSON 字符，低于 dsh 的剪裁阈值 8192。放不下时分片前进或返回 413，不静默截断。

### 当前文件与修复

`list_files` 复用文件编辑器的目录范围，默认每页最多 20 项，可按文稿或文件名片段筛选。文稿绑定（包括空目录绑定）不会转换成工作区首页；访问范围沿用 `SourceEditor` 的原策略。原目录扫描超过 2000 项时明确返回 `truncated`，不伪装成完整列表。继续读取时固定 snapshot，文件名或目录范围变化即拒绝旧分页。

`read_source` 读取当前 UTF-8 文本，包括无效 `lecture.json`。按 UTF-16 偏移分片，继续页固定版本，不编译；拼接完整文本后再解析。文件上限为编辑器的 2 MiB；打开文件时拒绝符号链接、非普通文件、超限和读取期间的变化。MCP 响应最多 7168 字符，冲突只返回短版本信息，不回传完整冲突文件；校验问题同样限量。

`edit_source` 接受完整 content，或唯一匹配的 find/replace；`create: true` 排他地创建普通文本文件。也可用 `edits` 批量修改最多 16 个文件，全部在同一文稿内，或全部属于工作区所有者的根目录文件。服务端固定原版本、预检、请求 `write/workspace` 确认，再经原事务提交与读回；普通调用不需要模型传版本，显式 version 可固定此前读取的意图。

文件写入只向外部、未绑定文稿的所有者开放，要求审阅时拒绝 agent 原文写入。有效文稿使用文稿动作；修复入口只允许已有、已登记的无效 canonical entry，不能用它新建文稿，能解析旧 ID 时保留 ID。取得锁和 Git 队列后，事务基于最终 preimage 再检查访问范围、归属、修复条件和取消；根目录创建、写入与回滚使用相同 outside 模式，不混入文稿文件。批次任一失败回滚全部文件。

成功回执只有 saved、changed、路径或文件数及实际提交 ID；`saved: true, current: false` 表示事务成功后读回已变化或失败，不能因此自动重试。丢失应答时先读取当前文件与历史。

## 5. 文稿修改

普通编辑通过一次 MCP 调用完成。`get_context` 返回当前编辑器页、步骤、标题、讲稿与实际报告的选中文字；读取保存内容，不读取未提交草稿。多文稿时从当前成员的已连接编辑器定位，多个文稿或不同位置不能确定时要求明确目标。`edit_narration` 按唯一原文替换或删除一句，默认使用当前页与步骤，保留读音和 cue；原文缺失、重复、编辑器尚未保存或版本已过期时拒绝修改。`rename_page` 接收页码（从 1 开始）或稳定 ID 与标题；`edit_document` 接收最多 32 个标准内容操作。适配器在服务端串联现有 `read/plan/checkApply/apply`，沿用 CAS、验证、锁、修改历史与保存后读取，不持有第二套事务或计划表。请求最多 32768 个 JSON 字符；标准操作的参数格式直接复用内核 `DocumentChange` 的定义。可选 `source` 将意图绑定到先前读取的版本；省略时以本次调用读取的版本为基础，期间发生并发写入仍返回 409，不自动重试。请求回执丢失时先读取当前状态，不盲目重新写入。

普通回执只给出 `saved`、`changed`、实际修改值和编辑器状态；`details: true` 才给出保存版本、修改摘要、修改历史 ID 与校验详情。编辑器反馈最多等待 750 毫秒，使用 `AuthoringClients` 的真实报告，分别列出保存版本是否已被编辑器采用、预览是否准备为同一版本。`current/pending/unavailable` 描述编辑器报告，不代表视觉检查；反馈失败也保留成功的保存状态。普通编辑按回执报告结果，不默认编译整份文稿、截图或生成配音。

服务自身的作者访问令牌授权普通规范内容编辑，无需再次在 Studio 确认。通用接口携带 `fileChanges` 或 `replacement` 时保留原确认；代码执行、收费服务和浏览器控制也保持各自策略。经接口签发的其他令牌维持原有授权方式。

需要单独审阅影响的写入保留两步接口。预检只读，返回 `planId`、`digest`、`expiresAt`、source、影响与问题；提交从同一计划表取回确切候选，在事务内全部重查。完整候选、ID 映射和详情是按需读取的资源，模型不回抄。

| 计划族 | 预检 → 提交 | 范围 |
| --- | --- | --- |
| 通用修改 | `plan_document_change` → `apply_document_change` | `DocumentChange`：`DOCUMENT_OPERATION_TYPES` 的九种操作、整份 replacement、同文稿文本 `fileChanges` |
| 页面 | `plan_page_change` → `apply_page_change` | `create`、`rename`、`move`、`delete` |
| 页面复制 | `plan_page_duplication` → `apply_page_duplication` | 复制一页 |
| 语义动作 | `plan_authoring_action` → `apply_authoring_action` | `DOCUMENT_AUTHORING_ACTION_TYPES`：`comment.*` 七种、`voice.set`、`component.*` 四种、`caption.timing.set/reset`、`caption.scale.set` |
| 项目 | `plan_project_change` → `apply_project_change` | 新建、复制、目录改名、删除、标题 retitle |
| 转写采用 | `plan_transcription_adoption` → `apply_transcription_adoption` | 第 8.3 节 |

普通批注、音色、字幕与组件动作另有一步调用入口，名称由动作类型中的点与连字符换成下划线生成，例如 `comment_create`、`voice_set`、`caption_scale_set`。参数从同一个规范动作 Schema 投影，服务端内部读取版本并预检、提交；批注纯文本参数为 `text`，富文本沿用高级语义动作接口。删除另需 `confirm: true`。默认只返回动作结果，`details: true` 返回完整回执；响应丢失后读取当前内容，不盲目重发。

类型清单在 `packages/kernel/src/contracts/authoring.ts` 与 `authoring-actions.ts`。计划按族隔离，一个族的候选不能交给另一个族的 apply。预检只做 Schema 校验、纯领域变换、元数据与精确缓存查询，不执行工程代码、转写或合成；需要实际运行才知道的结果标为未知。影响列出增删改的实体、共享定义与讲稿的使用者、失锚批注与失效的配音、字幕和计划。

- **身份**：新实体 ID、批注作者与日期由服务在预检时固定，重试不生成第二组。复制时共享素材与定义保留引用。
- **删除**：页面与批注删除的 apply 另需 `confirmDeletion: true`。保留讲稿中的 cue 指向被删内容时返回 `page-referenced`。删页清除独占的块、步骤、讲稿与片段，保留共享讲稿、素材、定义与批注线程；最后一页留一个空步骤。
- **批注**：内容是 `RichTextNode[]`，不暴露 BlockNote JSON。锚点是文本范围（`from`/`to` 两个 `{ blockId, offset }`，按 UTF-16 计），或位置 `{ blockId, stepId }`（块在该步的呈现；省略 `stepId` 表示整块）。位置的步骤必须属于块所在的 section；步骤失效时锚点降为块级，块失效时线程保留内容并报告 `anchorDetached`。非法返回 422。owner 可管理他人批注，editor 只改自己的。
- **音色**：`voice.set` 的 scope 为 document、page、step 或 steps，source 为 TTS、none 或 null（移除该槽位）。默认保留下层覆盖，`replaceOverrides` 明确替换。录音来源只经 `adopt_recording` 设置。
- **组件参数**：`changes` 对路径 `set` 或 `remove`，只允许 Schema 声明的可编辑字段，未修改的字段保留。步骤参数是顶层浅覆盖，改子字段会物化整个顶层值，后继继承影响由 `read_authoring_action_impact` 分页读取。`component.definition.use` 只选择已有 Definition。
- **字幕时间**：`caption.timing.set` 需要当前 IR 与确认时长，以 `read_production_plan` 的 `ProductionStep.captionTiming` 为基准提交步内起止时间，只改字幕映射。`reset` 不需编译。
- **项目**：目录动作绑定 HEAD、目录树与已识别的跨文稿引用，在 `DocumentOperations` 事务内提交；会断开已识别引用的删除被拒绝。opaque 参数与场景源码按原字节保留。retitle 委托 `DocumentEditor`，无 Git 时可用。文稿绑定令牌只能 retitle 自己。

提交成功后重读权威文稿与参与文件。回执带真实 source、commit（id 与 origin）、effect 与 `verification`：`saved` 已核验，`compiled/runtime: not-requested`。

## 6. 原子性与幂等

项目能力读取同时提供可选模板名，默认最多 20 项，按 `nextTemplatesOffset` 继续；不返回安装路径或模板内容。目录只列出 `findTemplate` 能实际选择的普通模板目录，排除隐藏项与符号链接。选择模板仍使用原 `plan_project_change/apply_project_change` 创建动作。

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

`production_enable` 复用文稿语义动作，补齐讲授和语音插件及讲授渲染端配置，重复调用不改变文稿。

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

`editor_action` 的 `view.set` 使用原生入口切换文档、阅读、放映与视频制作；`native-history.undo/redo` 使用当前编辑器的撤销栈，保存历史仍使用文稿历史动作。`recording.start/stop/cancel/discard/save/listen/pause` 复用当前录音候选和试听实例，开始时显示原音频卡。状态由客户端读取返回，不传音频字节。取消重录保留原候选，丢弃需明确确认，保存只创建资产。设备许可等待可取消，迟到的许可释放设备。要求审阅的工作区不接受经浏览器执行的原生撤销、重做或录音保存；调用方不能用浏览器通道绕过文稿事务的审阅限制。

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

**命令行**（`packages/cli/src/voiceover.ts`）：`presmium voiceover <文稿>` 不经工作区服务，在自己的进程中编译文稿，用文稿插件的同一个 `VOICEOVER_EXECUTION`。运营者目录、语音服务与密钥按 `presmium serve` 的方式取得（`PRESMIUM_OPERATOR_DIR`、运营者的语音设置、`PRESMIUM_SPEECH_*`）。

- 预检是 `VoiceoverExecution.sentences`：按阅读顺序列出整份文稿生成时处理的每一句，带精确的 `SynthesisRequest`、精确缓存是否命中、不能生成的原因与步骤绑定；只查缓存与音色目录，不合成。`defaultVoice` 按“文稿默认音色换成它”回答，继承文稿默认或未设置音色的语句改用它。
- 不加 `--yes` 时只报告：每个语音服务（本机或云端）、音色、缺少精确缓存的语句数与字符数（云端服务按字符计费）、不能生成的语句及原因；不合成、不写文件。`--yes` 是作者对这次收费生成的同意，与 MCP 的 `spend` 批准相当；不加它不会开始任何收费操作。
- `--yes` 时以缺失语句所在步骤的 `steps` 范围（有跨步语句时为 `document`）调用 `prepare` 与 `run`，只合成缺失的语句，之后再读一遍 `sentences` 核验；仍有应配音的语句没有音频、被取消或文稿已变化时退出码为 1。CLI 不经 `DOCUMENT_VOICE_TASKS` 与 `createVoiceoverOwner`，生成锁只在本进程有效，不与运行中的工作台同时生成同一文稿。
- `--voice <服务>:<音色>` 先按 `voice.set` 的文稿范围规则（`changeDocumentVoice`，保留页面与步骤的设置）改 `production.defaults.voiceSource`，经 `validateDocument` 后按文件原有的缩进原子写入 `lecture.json`；新音色下有语句因音色或服务不可用而不能生成时不写入。
- `--prune` 经 `SpeechService.pruneCache` 删除当前语句都不用的缓存条目（`.presmium/speech/` 的音频、记录与对齐文件，以及 `speech.lock.json` 的条目）。条目按请求键（服务、音色、语言、语速、风格、文字与读音，与配置档无关）判断是否在用，同一句在另一配置下生成的音频保留；请求没有服务且没有默认服务、或文稿有错误诊断时拒绝。

### 音色训练

`clone_voice` 复用语音服务的训练与同意记录，只向文稿所有者执行。采样和口头同意是文稿内音频路径，每份最多 10 MiB；服务端固定原字节后才请求付费确认，执行前再次核对文稿来源。准备数据最多保留 90 秒和四份，关闭或取消释放。`get_voice_clone_status` 读取同一引擎与音色的状态；没有可用引擎时能力报告不可用。丢失训练应答时查询状态，不自动重新训练。

## 10. 任务反馈

构建、配音与转写各自保留执行器。共同规则：

- 任务带 `id`、`intent`、文稿、source、单调 `sequence`（状态拥有者分配，Web 与 MCP 看到同一序号）、范围、状态、提供方、错误与产物。状态为 queued、running、cancelling、cancelled、done、failed；来源变化后 `current: false`。
- 断开连接不取消任务。丢失应答时先按 intent 查询，已接纳就跟踪，未接纳才重发同一意图。按 intent 的取消可早于接纳。
- 取消已结束或已在取消中的任务直接返回当前状态，不请求批准。
- `build` 省略 source 时在服务端读取当前保存版本；显式 source 绑定先前读取。每个目标先经 `OutputJobs.check` 接纳，提交时仍核对同一 source 与输入；未知目标返回 422 `job-target-unknown`；同 source 与输入已有作业时返回 `reused: true`。
- 外部精简目录的 `build/get_builds` 默认只返回作业状态、进度与产物入口；`get_builds` 指定 `jobId` 才展开源绑定、文件详情与日志。完整兼容目录和 dsh 保持完整作业回执。
- 指定不支持或未配置的引擎返回不可重试的 422；503 只表示语音服务未解析或没有可用引擎。

## 11. 作者客户端

播放、定位、准备预览与草稿操作由已连接的浏览器执行。`AuthoringClients` 是进程内的在线登记与请求回执，不持有 writer 或编译器。

| 工具 | kind | 作用 |
| --- | --- | --- |
| `get_authoring_clients` | read | 客户端的 source、revision、位置、编辑状态与可用动作；不含未提交内容 |
| `editor_action` | operate | 业务动作；连接与源校验由服务端提供 |
| `cancel_authoring_client_request` | operate | 取消同一调用方确切的待执行请求，等待真实应答 |
| `request_authoring_client` | operate | 指定 clientId、epoch、connectionId、客户端 revision、source、requestId 与动作 |
| `get_authoring_client_request` | read | sent、executing、done、refused、failed、expired，及浏览器观察与 `current` |

动作清单是 `AUTHORING_CLIENT_ACTIONS`（`kernel/src/contracts/authoring-clients.ts`）：`state.read`、`source.flush`、`preview.prepare`、`playback.pause/play/seek/rate`、`position.step`，`view.set`、`native-history.undo/redo`、`recording.start/stop/cancel/discard/save/listen/pause`，以及 `comment-drafts.*` 与 `component-drafts.*` 的 inspect、read、restore、discard。

- 客户端执行前报告 executing，服务端确认该连接仍拥有请求；断线、来源变化或超时都不授权执行。请求 30 秒过期，同 requestId 只读原回执；丢失回执先 `state.read`，不换 requestId 重试。
- `source.flush` 只等待当前 source actor 保存；组词、冲突或锁定时不开放。
- 定位与播放先暂停，不切模式、不编译；播放只面向已准备的 `ProductionBinding`。
- `preview.prepare` 显式编译并准备已保存源，不合成或播放；编辑未保存或有模态框时不开放。
- 草稿 inspect 只返回元数据；read 按第 4 节分片，带完整 UTF-8 SHA-256，格式为 `presmium-rich-text-json-v1`（批注）或 `presmium-component-parameters-json-v1`（组件属性）。当前内存稿遮蔽同 ID 的旧存储。
- restore 带候选引用与 `expectedCurrent`，先备份当前稿再分出新分支；恢复不提交，仍由作者 Save 或 Apply。discard 只退休选中的备份。
- `current` 是对该客户端的观察，不是跨窗口原子结论。主题、缩放、面板与播放头是客户端设置，不写进文稿。

## 12. 历史、审阅与权限

工作区审阅由同一个 `AgentSessionReviews` 管理，`get_review/change_review` 是它的有界 MCP 入口。工具目录与执行入口都要求未绑定文稿、未预先确认的工作区所有者凭据；文稿内助手不获得这些工具。修改请求走 `write/workspace` 确认。

- `get_review` 默认只返回审阅身份、运行状态、文件数、步骤数和 snapshot；没有审阅时为 `review: null`。`part: files/steps` 分页读取元数据，`part: diff` 指定确切文件和可选检查点，按 UTF-16 偏移分片并携带完整 diff 的 SHA-256。后续页须固定 snapshot。二进制或过大的 diff 明确报告不可用，不当作空差异。
- 默认读取在 Git owner 层不生成文本 diff；详细读取只生成所选文件的 diff，不注册 watcher、不改变自动超时。请求最多 8192 字符，响应最多 7168 字符。
- `change_review` 接受、拒绝所选文件或整份候选、恢复检查点。拒绝和恢复需 `confirm: true`。普通调用的 snapshot 由服务端读取；可显式固定此前读取的 snapshot。运行中、候选树或审阅身份变化、未知文件与检查点都拒绝，不自动换成新的材料继续。
- 接受固定原 Git 树的字节，等待编辑器 flush、工作区根锁与 Git 队列后重新核对候选，再经原文件 CAS 与提交事务发布。最终写入不重新读取候选文件，二进制、链接与可执行模式都由同一 Git 树绑定。回执只返回真实 outcome、提交 ID 和处理或剩余文件数；丢失应答后先读取审阅与历史，不自动重复接受或丢弃。

**历史**（`kernel/src/contracts/document-history.ts`）

- 每次保存（作者动作、Studio 中的保存、AI 的修改与撤消）是当前分支上的一个 git 提交，带 `Presmium-Origin` 等尾注与 `Co-authored-by`。本机服务的作者（`LOCAL_AUTHOR`）以仓库配置的 `user.name` 与 `user.email` 为作者，git 没有配置时为 `local author <local@presmium.invalid>`；多人服务中的成员以自己的名字与邮箱为作者。提交者是 git 配置的身份，没有时为 `Presmium <presmium@presmium.invalid>`。
- 版本历史、撤消、恢复与读取历史文件都只从这些提交得到，保存本身也在提交事务内完成（没有 git 时不能编辑），所以没有不提交的设置。不想把逐次保存的提交原样推送时，在单独的分支上工作，推送前合并成一个提交。
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
- `check_document` 显式编译并运行插件、发布与渲染端的检查（含文稿代码能否打包），返回计数与快照版本，标 `currentSource: 'unverified'` 与 `browser: 'unobserved'`。
- 每条诊断保留 origin、源位置与 revision；不同生产者不合并，空快照不证明源有效。作者窗口的异常与请求失败经 `POST diagnostics/authoring` 报告，不需先准备 IR。
- `get_runtime` 是作者窗口最后的报告，不证明新源成功。

**验证层次**：每层独立报告，低层成功不代表高层成功。

1. 保存：`verification.saved`，重读权威文稿与文件。
2. 编译：快照的 `IRDocument.source` 与诊断。
3. 计划：`ProductionBinding`、确认时长、精确配音缓存、真实媒体与字幕对齐来源；estimated 只能按稳定步骤播放并在缺失音频处缓冲，不能任意按时间定位或导出；unknown 仍不可按时间播放。
4. 浏览器：经客户端请求取得该 source 的位置、组件错误与播放状态。
5. 产物：任务的 source 与输入指纹、文件、媒体类型与字幕。

agent 的循环：探测能力 → 读源 → 预检 → 提交或开始任务 → 轮询 → 验证 → 按诊断修订。收费服务与播放只在用户要求的范围内发起。

**画面**（`packages/workspace/src/node/capture.ts`，契约 `packages/kernel/src/contracts/capture.ts`）

- `capture_slides` 给出一页在放映中的画面：默认每一步的终态帧，`at` 给出进入一步之后若干毫秒的画面，一次最多 12 张（步骤数 × 时间点）；`arrive: 'backward'` 先显示后一步，再像讲者一样退回这一步（用页面自己的时钟），检查倒退的画面，页面因此重新加载时以 `capture-page-reloaded` 失败，最后一步之后没有步骤时照常显示并在 `problems` 中说明；`measure` 是 CSS 选择器，同时给出幻灯片中匹配元素的框（幻灯片像素），连同开头的文字与 `id`、`class`、`data-*` 属性；`appearance`、`scale`、`clip` 选择亮暗、倍率与区域；`captions: false` 不画放映的字幕层（放映页面的 `?captions=off`），每张画面的讲稿总以文本放在结果的 `narration` 中。结果是 PNG 图片与它们在服务状态目录中的文件（保留最近 20 次）。
- `capture_overview` 一次拍下全部页面（默认每页最后一步，`steps: 'all'` 为每一步）：每张画面写入一个目录，文件名补零后按阅读顺序排序（`03-12-页面.png`：第 3 页、第 12 步，步骤从 0 数），目录中另有 `narration.md`（每张画面的讲稿，标题是文件名），并给出每张 20 个缩略图、标注“页 · 步 标题”的总览图，供冷读评审与前后对比。
- `capture_reading` 给出阅读版（网页）的一页：按窗口宽度（默认 1280，手机 390）打开，整个 section 滚动一遍让组件加载，静止后截取，超过 8000 像素截断（`cut`）；`measure` 给出 section 中元素的框（CSS 像素）。
- 工作区服务在无头 Chromium 中打开文稿的查看器页面（放映加 `form=slides`，都带 `capture`），窗口按幻灯片的尺寸调整，减弱动画。页面的 `presmiumCapture.show({ section, step, at })` 以独占的驱动推动步骤时钟（`StepClockDriver.exclusive`，讲授播放器等其它驱动等它结束），定位到这一步，等组件的代码加载完、幻灯片不再变化、时钟的工作完成后返回，因此同一步与时间的画面每次相同，与到达顺序无关。
- 浏览器在第一次请求时启动，空闲两分钟后关闭；请求一次一个。文稿代码中打包失败的文件只影响载入它的部分：页面照常打开，那个组件或场景显示失败，每个出错的文件作为一条 `presmium.preview.code` 诊断记录（文件、行与原因，找不到的模块），准备预览时更新；有这个部分的页面 `capture_slides` 以 `capture-failed` 失败，原因是这个错误。整个代码都无法打包时预览失败，原因同样记录，`capture_slides` 以 `capture-preview-failed` 失败。

## 14. 不提供的能力

以下能力报告 unavailable 或没有工具：

- 统一任务接口、事件游标与跨重启的意图账本。
- 远程上传素材；MCP 只导入工作区内已有文件。
- 步骤的新建、重排与删除动作，共享讲稿的分离编辑，独立组件实现副本。
- 项目恢复、任意 checkout 或 discard；未提交文件的提交与丢弃尚未接入 MCP。
- 新建批注 composer 的草稿恢复，其它未接入表单的草稿。
- 原音与新讲稿的自动词对齐、跨步连续分配原音、只转写所选区间。
- 通用 `plan_document_change`、`apply_document_change` 的大文稿输入没有预算（它们的结果不带文稿，用 `read_document_part` 读取）；agent 优先用页面与语义动作。
