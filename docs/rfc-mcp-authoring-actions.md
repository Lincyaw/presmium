# RFC：Web 与 MCP 共用作者动作及验证反馈

状态：作者事务、音频资产与片段、音色发现、转写／采用、共享配音任务与试听适配已实施，其余分阶段推进。2026-10-27 根据作者要求设计：AI agent 经 MCP 能完成作者在 Web 中可完成的工作，包括人声录音转写、将文字采用为讲稿、再显式生成 AI 配音。第 12.1 节的共享作者事务见第 14 节；转写任务发现、启动、读取、取消与类型化采用见第 15 节；共享配音任务和音频资源见第 16 节。下文未明确标为已实现的接口名和新增类型仍为提案。

本文供工作区、工作台、MCP 和讲授插件的实现者拆分任务。交付结果是一套共用的作者动作、版本检查和反馈协议。文稿内容继续只写 `lecture.json`；规范实体定义以[文稿契约](../packages/kernel/src/contracts/document.ts)和[文稿 IR RFC](rfc-document-ir.md)为准，录制转写的候选与采用细节以[录制转写 RFC](rfc-recording-transcription.md)为准。

## 1. 决策与边界

Web、内置助手和外部 MCP agent 使用同一套领域动作。动作接收稳定实体 ID 和公开参数，返回实际影响、提交版本、诊断与下一步验证依据。MCP 不要求 agent 模拟鼠标，也不把“自己修改 JSON 文件”当作作者能力已经对齐。

共享动作通过工作区服务执行。MCP 与 HTTP 是传输适配器，React、BlockNote 和 dsh 都不持有另一份动作语义。运行快照、讲授计划、字幕文件与时间线是派生结果；动作不能写回它们来替代文稿。

能力对齐包括三类动作：

| 类别 | 执行边界 | 完成依据 |
| --- | --- | --- |
| 保存作者决定 | 工作区事务与领域校验 | 保存回执及权威文稿读后核验 |
| 生成、转写、构建、导出 | 实际插件服务与任务 | 任务终态、来源绑定与产物验证 |
| 播放、定位、录制、恢复浏览器草稿 | 已连接的作者客户端 | 指定客户端对语义请求的真实应答 |

设备权限、宿主授权和服务缺失要返回明确状态。例如没有录音客户端就返回 `client-unavailable`，没有 ASR 服务就返回 `service-unavailable`；不能返回虚构录音、成功任务或精确字幕。系统不因读取文稿、能力探测、预检或打开预览而请求转写、合成或材料模型。

这项决定替代现有文档和 MCP instructions 中“MCP 不提供写文件工具、agent 使用自己的文件工具”作为作者工作流的限制。实施时同步修改 [领域模型第 13 节](domain-model.md#13-智能体)、[dsh 工具一致性](design-dsh.md#9-mcp-与-dsh-的工具一致)和 `packages/mcp/src/mcp.ts` 的 instructions。工程代码文件仍可原生编辑，但正式作者动作必须经过同一校验、事务和审阅边界。不新增 MyST 入口或旧源码范围写回接口。

## 2. 实际操作到服务的核对

以下是 2026-10-27 的源码核对，包含首片接入后的范围。表中“已有”只表示列出的实现存在，不替代真实设备、服务和浏览器验收。

| 作者操作 | 当前 Web／共享边界 | 当前 MCP | 应补齐的边界 |
| --- | --- | --- | --- |
| 列文稿、新建、复制、重命名、删除项目 | `WorkspaceClient.operateDocument` → workspace `documents`；管理操作与历史需要 git | 只有 `list_documents` | 项目操作预检、版本和引用影响，调用同一个 `DocumentOperations` |
| 读取可编辑文稿 | `GET document`，无需先编译 | 已有 `get_document`；`deck_info/get_section/get_step` 仍读取运行快照 | 精确的局部实体读取与 Schema 资源 |
| 正文结构、格式、表格、图片占位、块移动 | 原生 BlockNote 投影回 `TeachingDocument`，`DocumentSession` → `document/change` | 已有 plan/apply 的 `updateText/insertBlock/moveBlock/deleteBlock` 与共享校验 | 更细的富文本身份和编辑范围语义 |
| 页面新建、重命名、复制、排序、删除 | `document-pages.ts`、原生插页、整份 replacement；复制与删除纯函数仍在 workbench | 已有 `updateSection`；其它结构可显式 replacement，未有专用页面动作 | 移至共享纯领域层；页内绑定重映射、最后一页和外部引用同一语义 |
| 步骤状态、显隐、继承、组件参数与身份 | IR 契约支持稳定 `StepId`、`setStepState`；Web 对复杂步骤操作仍有缺口 | plan/apply 已有 `setStepState`，运行读取／导航仍可使用 | 共用完整步骤动作；未实现的重排／删除规则先声明 unavailable |
| 讲稿文字、发音替换、cue 与停顿 | `NarrationEditor/DocumentStepNarration` → 同一文稿；`setNarration/setTiming` 已有 | plan/apply 已接受 `NarrationNode[]`；`lecture_preview` 只读派生计划 | 共享讲稿 edit-shared／fork、cue 编辑的更细范围与影响 |
| 定义、公开参数、共享素材修改和“另存” | 定义在文稿中，代码通过 `DocumentChange.fileChanges`；通用素材属性仍未完整接入 | 已能明确 replacement 加同文稿文本文件原子保存；无专用定义范围动作 | 定义 Schema、引用计数、单实例／全部实例／fork 三种明确范围 |
| 批注新建、回复、编辑、反应、解决、重开、删除 | `DocumentThreadStore` 适配 BlockNote CommentsExtension，落 `TeachingDocument.comments` | 已可读取规范线程；专用批注动作仍缺，明确 replacement 不等于对齐完成 | 共用线程动作、稳定文本锚点和失锚状态；禁止写 BlockNote 私有 JSON |
| 批量批注交给助手、接受／拒绝／继续修改 | workbench 与 dsh 的会话／审阅路由；材料生成流程仍未齐全 | 核心 MCP 不提供会话或审阅动作 | 显式任务范围、会话上下文与修改审阅，不能将发送成功当作内容修改完成 |
| 导入与查看图片 | `document/image` 将原文件和资产声明原子保存；`document/asset` 按 Asset ID 读取 | 无 | 安全字节输入、回执与资源读取；沿用现有媒体检查限制 |
| 导入／检查本地音频 | `DocumentAudioAuthoring` 共用真实媒体探测及多文件事务 | 已有能力、workspace 预检／导入与 canonical inspection 四个工具 | 远程分块上传尚未实现；路径限当前文稿工作区，不接受任意服务端路径 |
| 音频区间、步内偏移、音量、静音、移除 | 同一 `DocumentAudioAuthoring` 的预检／事务；`ProductionBinding` 与真实时长校验 | 已有 `read_production_plan/validate_media_clip_change/change_media_clip` | 保存后新计划仍需准备；删除保留原始素材，尚无跨重启持久回执 |
| 录制、重录、试听、采用录音 | viewer 有讲授录制链；制作面板候选录音与采用仍未完整接入 | 无客户端录制控制 | 版本化录制候选与客户端语义请求；采用另走作者事务 |
| 人声转写 | `DocumentTranscriptions` 保存版本化候选；HTTP 与 MCP 共用任务实例 | 已有能力、启动、清单、任务、exact result 和取消六个工具；旧 `track_transcribe` 仍独立写 track.json | 英文文件的真实 ASR／采用／Web TTS 已单独验收；实际提供方取消和录音完整链仍待验证，候选不自动写讲稿 |
| 查看差异并将转写采用为步骤讲稿 | `DocumentTranscriptionAdoption` 共用 typed Narration 差异与作者事务 | 已有 `plan_transcription_adoption/apply_transcription_adoption`，复用原 DocumentEditor planId | 页面 UI 及完整人声转 TTS 链按实际验收推进；保留受保护发音／cue 的显式处理 |
| 采用转写后改用 AI 配音 | 可编辑 `VoiceSource`；录音来源播放仍受服务支持限制 | 已有共享 `start_voiceover` spend 任务与查询／取消；旧 `lecture_synthesize` 不再暴露 | 显式选择 TTS 来源和作用域；不能把 ASR 时间当作新音色时间；专门的音色继承修改接口仍待补 |
| 音色目录、搜索筛选、继承与批量应用 | `DocumentVoiceAuthoring` 读配置与目录，不依赖编译；`document-voices.ts` 处理继承，批量默认保留覆盖 | 已有 `get_voice_authoring_capabilities/get_voice_catalog`；继承／批量专门动作仍缺 | 提升相同作用域与影响计算到共享层；配置存在不代表合成成功 |
| 音色样本／当前讲稿试听 | 同一 owner 的 quote → 显式请求 → 真实音频；HTTP 保留 `VoicePreviewAnswer` | 已有 `quote_voice_preview/preview_voice` 与限额内的二进制 MCP resource | quote 固定实际 execution、source、revision、提供方和缓存状态；生成成功不是客户端已试听 |
| 配音生成、进度、取消 | `DocumentVoiceAuthoring` 与独立 Node owner；HTTP/MCP 同一任务实例，standalone 同工厂 | 已有 `get_voiceover_status/get_voiceover_jobs/get_voiceover_job/start_voiceover/cancel_voiceover`，保留 intent/source/revision/scope/sequence | 查询／取消不要求当前编译；配置 remount 保留任务；当前仅进程内发现与幂等，尚无跨重启恢复账本 |
| 计划、波形、定位、播放、暂停、速率 | `ProductionPlan`、单一播放器、预览协议中的制作请求 | 已有真实 `read_production_plan`；`navigate` 仅定位放映窗口，`get_runtime` 只读报告 | 指定作者客户端的 `ProductionPlaybackCommand` 与真实应答 |
| 编译、预览、导出、下载 | workspace `jobs` 需要明确 `JobSource`，支持状态、事件、取消、版本和文件 | `build/get_builds/cancel_build` 已保留 source、sequence、inputFingerprint、captions 与文件；取消不要求先编译 | 后续统一任务发现、持久意图账本与资源；当前反馈见[输出验证记录](benchmarks/mcp-output-feedback-2026-10-27.md) |
| 诊断、失败详情、运行验证 | UI `readDiagnostics` 读诊断快照；编译／浏览器报告分来源 | `get_diagnostics` 走 compile+check；diagnostics resource 才走宿主快照；runtime 有报告但不证明最新源 | 统一诊断快照入口，保留阶段；新增带来源的验证请求和 observed／unobserved 结果 |
| 文稿草稿、外部变更、保存冲突 | `DocumentSession` 和制作 drafts 在浏览器按来源隔离；不能从服务看见未提交字节 | 无 | 客户端编辑状态探测与 flush／保留／恢复请求，未连接时声明未知 |
| 审阅、逐文件拒绝、检查点恢复 | workspace `review/*` 与 `CHANGE_REVIEW`，持锁到结束 | 核心 MCP 无适配，dsh 自有桥接 | 同一 reviewId、范围、来源与修改 digest，绑定宿主授权决策 |
| 历史、查看旧版本、撤消、重做、放弃未提交修改 | workspace `revisions`、`history/*`、`changes/*`；undo/redo 可带 expect | 无 | 显式目标版本与路径，冲突结果；不把查看历史变成恢复当前文稿 |

核心入口证据是 [MCP 工具表](../packages/mcp/src/mcp.ts)、[McpHost](../packages/mcp/src/host.ts)、[WorkbenchClient](../packages/workbench/src/workspace-client.ts)、[workspace 路由](../packages/workspace/src/node/routes.ts)、[作者事务](../packages/workspace/src/node/document-editor.ts)与[讲授插件工具](../packages/addon-lecture/src/node/tools.ts)。本地音频的已实现事务与媒体限制继续以[音频作者契约](audio-authoring.md)为准。

## 3. 一个动作注册表，三个适配器

在内核契约中新增版本化的作者动作 Schema、请求与回执；将应用服务挂在 workspace 侧。MCP 只通过 `McpHost.authoring?` 调用抽象服务，不能从 mcp 包导入 workspace 或具体插件。workspace 提供 HTTP 与 MCP 同一实例；dsh 继续使用同一张 MCP 工具表。

纯编辑动作和影响计算放共享纯 TS 层。优先迁移 `document-pages.ts` 的复制／删除、`document-voices.ts` 的继承／范围／影响计算、批注数据变换及稳定文本身份校验。React 适配器负责原生选区和本地输入，服务端负责锁、CAS、历史、文件和实际插件服务。

每项动作登记以下元数据，生成 HTTP 请求校验、MCP input/outputSchema、能力响应及人类可读说明，不维护两份手写 Schema：

| 字段 | 用途 |
| --- | --- |
| `type`、`schemaVersion` | 稳定语义与参数版本，未知字段／版本明确拒绝 |
| `inputSchema`、`resultSchema` | TS 类型、请求和结构化输出使用同一事实来源 |
| `effect` | `read`、`document-write`、`client-control`、`operate` 或 `spend` |
| `requires` | workspace、git、插件服务、客户端、权限和媒体能力 |
| `plan` | 纯校验、引用影响、失效范围、缺失能力与待确认项 |
| `execute` | 领域实现；异步工作返回任务而非等待工具连接保持 |
| `verify` | 必要的读后条件与可请求的运行验证 |

初期不建立一个接受任意名字、任意 payload 的万能工具。文稿动作使用受 Schema 约束的判别联合；二进制导入、异步服务和客户端控制有各自的输入边界。工具数量按任务划分，不按工具栏每个按钮生成一个工具。

## 4. 先探测能力，再读取权威版本

新增 `get_authoring_capabilities({ document? })`，没有文稿时仍能报告 workspace 创建能力。响应至少包含 `apiVersion`、`documentSchemaVersion`、动作及其 Schema 资源 URI、作用域、权限、版本策略、可用状态和不可用原因。

能力状态区分 `available`、`unavailable` 与 `unknown`；可用还应区分能否预检、执行和实际验证。配置了插件名不等于服务已经注册，配置了服务也不等于鉴权与实际合成已验证。响应只给提供方、功能、限额和公开参数，不给凭据、凭据环境变量值或运营者目录。

能力按工作区／文稿／连接客户端计算。最小维度包括：文稿编辑、项目管理、git/history/review、图片／音频／视频读写、录音候选、ASR、TTS、音色目录、语速／风格、真实字词对齐、播放控制、预览形态和实际导出目标。未接入的视频、录制采用和字幕对齐必须准确返回 unavailable。

新增 `get_document({ document, select?, ifVersion? })`。基本结果直接使用 `DocumentAnswer`，按需选择页面、块、步骤、讲稿、资产、定义和批注；局部返回仍带完整作者源标识，不得把局部内容误当整份 replacement。源无效时给问题及修复入口，不隐式回退到运行快照。

四类版本各司其职：

| 标识 | 已有事实来源 | 用途 |
| --- | --- | --- |
| `document` + `documentId` | workspace 目录、`TeachingDocument.id` | 分辨目录改名、复制与同名工程；验证请求没有落到另一份文稿 |
| `version` + `fingerprint` | `DocumentAnswer` | 精确保存字节；CAS 与编译源匹配，不以内容大致相同代替 |
| `irRevision` | `IrAnswer.revision` | 组件、代码、配置等输入共同派生的运行快照 |
| `planId` | `ProductionPlan.binding` | 当前不可变播放计划；缓存变化也可能使计划变化 |

跨作者流程沿用 `CanonicalSource { documentId, version, fingerprint }`；构建 API 沿用 `JobSource { version, fingerprint }`，适配器从同一个作者源生成它，不引入第三种 source digest。文件 Schema 的 `schemaVersion` 与 API 的 `apiVersion` 不是源版本。

## 5. 文稿修改：预检、提交、核验

新增 `plan_document_change` 和 `apply_document_change`。请求及回执的下列字段为拟议契约，不是当前可调用代码。

`plan_document_change` 的输入为 `{ document, apiVersion: 1, source: CanonicalSource, actions, files? }`。`actions` 是版本化 `DocumentAction[]`；`files` 为参与同一文稿事务的工程文件候选，每个已有文件带自己的 base，新文件使用 `base: null`。临时二进制句柄按第 7 节处理，不把 base64 混在文稿内容中。

预检返回 `planId`、`expiresAt`、来源、规范化动作 digest、所需文件版本、候选实体差异、影响范围、问题、可提交状态与验证条件。影响至少列出：新增／删除／更新的实体、共享定义和讲稿的使用者、失锚批注、移除的片段、被保留的音色覆盖、失效配音／字幕／计划／导出、需要重新检查的代码依赖。

预检只运行 JSON Schema、纯领域变换、文件／媒体元数据和精确缓存查询。不得借预检执行工程代码、转写、合成或发起材料模型。需要实际运行才能确定的结果标为未知，并给出后续验证动作。

`apply_document_change` 的输入为 `{ document, id, planId, source, actionsDigest }`。服务重新核对成员、文稿身份、源版本、全部文件版本、能力和计划；不只相信 planId。它用现有 `DocumentChange` 的 operations 或 replacement 加 `fileChanges` 执行同一事务。常规 agent 编辑不需要自己组装整份 replacement。

成功回执保留 `DocumentChangeAnswer` 的 changeId、version、fingerprint、files 和 commit，另带动作结果、原 ID → 新 ID 映射、影响及验证状态。已有实体移动保留身份；复制的新实体 ID 在预检中分配并固定，重试不能生成第二组身份。

主要 `DocumentAction` 家族如下；动作字段细节由实际源码 Schema 发布，不能在工具描述中另定一份弱规则。

| 家族 | 语义范围 | 强制校验 |
| --- | --- | --- |
| `document.metadata` | 标题、语言、公开元数据 | 已有文稿身份不变；服务配置不混入凭据 |
| `page.create/rename/move/duplicate/delete` | 页面树、顺序与所有权 | 复制重映射富文本、步骤、cue、片段；共享资产保留引用；最后一页留空 |
| `block.insert/move/delete/update` | 标准块与容器；正文为 `RichTextNode[]` | 单父无环、稳定段落／单元格身份、教学绑定和批注锚点 |
| `step.create/update/move/delete` | 明确步骤结构、完整 visual state 与继承 | 同页归属、继承无环、讲稿／cue／制作引用；未完成的操作不宣称可用 |
| `narration.set/attach/detach` | 原生文字、pronunciation、cue 与步骤绑定 | 共享讲稿明确 edit-shared 或 fork；cue ID／目标／参数及停顿有效 |
| `production.timing/voice/cueTiming` | 默认／页／步骤时机、音色来源与停顿 | 只修改指定字段，兄弟字段和未知扩展保留；批量默认保留覆盖 |
| `definition.update/fork/instantiate` | 公开参数、状态、实现文件和实例 | Schema 和版本、引用影响；明确修改单实例还是共享定义 |
| `comment.create/reply/update/react/resolve/reopen/delete` | 规范线程与评论 | 服务填身份和时间；文本锚点对应稳定节点与合法偏移；失锚可见 |
| `asset.update/remove`、`mediaClip.set/remove` | 声明元数据、非破坏性引用、区间和混音 | 实际媒体探测、引用影响、当前 ProductionBinding；不静默删原文件 |

富文本编辑返回规范节点差异和引用变化，不把 BlockNote JSON 或 ProseMirror positions 作为 MCP 契约。正文缩短后批注无法精确映射时，保留线程并报告失锚，不能猜测另一个段落或删除评论来通过校验。

## 6. 原子边界、幂等和失败恢复

同一文稿的 `lecture.json`、定义代码、原始媒体与已采用的引用文件必须处于同一个明确事务。复用 `SourceEditor.transaction`、文稿锁、`DOCUMENT_FILES` 和历史提交；二进制导入继续沿用已实现的独占创建、失败删除和原 JSON 恢复。项目目录管理中跨文稿链接改写由现有 `DocumentOperations` 单独负责，不把任意多文稿写入塞入 `document/change`。

`id` 为客户端在第一次发送前创建的稳定意图 ID，映射到已有 `DocumentChange.id`、导入 id 或 `VoiceoverRequest.intent`，不在每次重连重新生成。服务以 workspace、成员、文稿、动作类型、id 和规范化 payload digest 识别同一请求。相同意图返回原回执；同 ID 不同 payload 返回 `id-reused`，不继续执行。

当前 `document/change` 回执只有进程内最多 64 条记录，且只在结果仍是当前源时复用；这不足以承诺跨重启和更晚编辑后的任务幂等。新增服务状态中的持久意图账本：记录 admitted、committed、failed、cancelled、结果源和产物引用，不复制一份可编辑文稿。重启先用事务日志核对写入／提交，再恢复回执；不能因丢失内存回执再导入一次音频。

用户断开连接不等于服务取消任务。调用超时或答复丢失时先 `get_task({ intent })` 查询；已经接收就继续跟踪原任务，尚未接收才能重发同一意图。`cancel_task({ intent })` 可早于任务接收，服务记下取消意图并在接收时拒绝启动。来源变化时标为 stale 或明确冲突，不偷偷更换到新源继续旧任务。

错误回执共用 `{ code, message, retryable, currentSource?, targets?, diagnostics?, task?, nextActions? }`。MCP 通过 `isError: true` 和结构化内容返回领域拒绝；保留 HTTP 的字段定位和状态语义，不只返回一段英文异常。至少区分无权限、被锁、来源冲突、文件冲突、参数无效、不支持、服务缺失、提供方失败、媒体无效、磁盘失败、取消与结果未知。

## 7. 资源、录音和人声重新配音

当前已实现工作区已有音频的共享检查／导入：`get_audio_authoring_capabilities`、`inspect_workspace_audio`、`import_workspace_audio`、`inspect_document_audio`。先以实际检查得到 SHA 与长度，再用同 source 导入，随后可将真实 Asset 交给已实现的转写工具；HTTP 和 MCP 共用事务、回执和保存后读回。路径严格限当前文稿的既有工作区范围，详见[音频作者接口](audio-authoring.md#mcp-检查与导入工作区音频)。该入口不要求场景先编译成功。

片段已通过 `read_production_plan/validate_media_clip_change/change_media_clip` 共用实际计划、只读预检和原子事务。计划读取不自动编译：没有 IR 时明确 unavailable，调用方可先显式读取 IR resource；source 必须匹配，可选 expected IR revision 仍会核对。预检不持久化 plan；upsert 仍要求完整实际 binding 与已确认步骤，删除不要求计划先恢复。音色配置与真实目录已通过 `get_voice_authoring_capabilities/get_voice_catalog` 共用，不等待场景编译，详见[音色读取契约](voice-authoring.md)。共享配音任务与试听已由第 16 节另行交付；远程分块上传、物理设备授权、继承专门动作与客户端播放对齐仍未实现。

媒体输入共用工作区有界上传服务。Web 仍用 multipart；MCP 通过 `begin_asset_upload/append_asset_upload/finish_asset_upload` 的有限大小字节块获得一次性上传句柄，或者使用服务已登记的资源 URI。必须由能力响应公开字节上限、块上限、支持格式和句柄期限。服务不从 agent 给出的绝对路径、`file://` 或任意 URL 读取文件。

上传句柄在当前成员和文稿下临时保存精确字节、长度及 SHA-256；完成上传只形成候选，`import_asset({ id, source, upload })` 才调用现有图片／音频导入事务。句柄过期可清理，写入成功的声明与文件不受临时句柄清理影响。若共享服务已支持直接流上传，MCP 宿主适配可复用它，不另设媒体探测实现。尚未被 clip 使用的音频通过 `inspect_asset` 的作者源读取，不能只查运行 `productionAssets`。

录音使用第 9 节的已连接客户端请求：`recording.start/stop/cancel/audition` 指定 clientId、requestId、source 和目标稳定 StepId。设备权限尚未授予时返回 waiting-for-device，不能显示录制中。停止后产生录音候选与真实字节信息，试听、采用为录音配音、采用为附加片段、转写是分开的动作。原轨在候选明确采用前保留。

人声转为 AI 配音必须形成如下可观察链：

1. 录制或上传音频，读取真实媒体检查结果。明确选择音频范围、目标页面／步骤和转写提供方。
2. `start_transcription` 显式启动真实 ASR，返回 intent 和任务；结果是版本化候选，保留源音频 SHA-256、范围、引擎、语言、实际 segments／word times 和目标基线。没有逐字时间就返回缺失。
3. `get_transcription` 读取任务，`get_transcription_result` 按 exact id／revision 读取候选；`plan_transcription_adoption` 返回逐步骤差异、替换范围和发音／cue 冲突。内容不自动写入讲稿。
4. `apply_transcription_adoption` 在当前源基线下原子写入类型化 `NarrationNode[]` 和所选步骤绑定。未经确认的步骤映射、猜测的 cue 和缺失对齐不自动采用。规则由[录制转写 RFC](rfc-recording-transcription.md)定义。
5. agent 可使用相同 `narration.set` 修订转写文字，再通过 `production.voice` 显式选择 TTS 音色和范围。ASR 采用不隐式替换仍为 recording 的 `VoiceSource`。
6. `start_voiceover` 只对调用方明确选择且 source 匹配的步骤启动，默认缺失／过期片段。生成使用修订后的讲稿、发音和真实音色服务，生成后重新获得当前 `ProductionBinding`。
7. 检查实际配音片段、字幕对齐和播放计划，随后显式试听／播放／导出。原录音 ASR 的时间码不能冒充新 TTS 的字幕时间；不能确认的字幕标为待对齐。

上述步骤不做自动收费串联。工具将已配置的提供方、范围和已缓存情况交给既有 operate／spend 授权；一次明确授权可覆盖用户指定的链路范围，不因工具拆分无故重复确认。缺失真实服务时，上传和讲稿编辑仍可使用；转写／合成状态必须清楚说明阻塞原因。

## 8. 统一任务反馈，保留现有执行器

新增 `get_tasks/get_task/cancel_task`，对 build、voiceover、transcription、材料分析和生成结果提供同一反馈信封。初期使用现有输出任务与配音任务的适配器；不为获得相似字段重写任务执行器或把所有工作串进构建队列。

任务信封包括：`apiVersion`、`kind`、`id`、`intent`、`sequence`、`document`、`source`、可选 `irRevision/planId`、固定目标范围、状态、阶段进度、实际提供方、错误、局部结果、产物、时间和下一步验证。状态共用 `queued/running/cancelling/cancelled/done/failed/stale`；采用候选的 `pending-review/adopted/rejected` 是结果审阅状态，不伪装成执行任务仍在运行。

现有 `CompileJob.sequence` 直接保留。现有 `VoiceoverJob` 没有 sequence，需在其实际状态拥有者中增加单调序号，不能让 MCP 与 Web 根据各自收到事件的顺序分配不同序号。终态和意图回执持久化；服务重启时无法续跑的任务标为 interrupted 诊断并进入 failed，保留可验证的局部结果供显式重试，不显示运行中直到永远。

资源模板建议为 `presmium://authoring/capabilities{?document}`、`presmium://authoring/document{?document}`、`presmium://tasks/{id}{?document}`、`presmium://tasks{?document}` 和 `presmium://authoring/events{?document,cursor}`。先通过既有 MCP resourceUpdated 发送失效通知，客户端重新读资源；同时提供 `get_authoring_events({ cursor, limit })` 供不支持订阅的客户端轮询。HTTP SSE、MCP 通知和轮询读取同一日志与状态。

事件包含 cursor、eventId、task／changeId、sequence、源与目标。事件可重复、可晚到；客户端只接受较大的 sequence。游标过期返回 resync-required 并读取快照，不假装事件从未丢失。重连和换文稿后的旧事件只更新原文稿记录，不改变当前选区、播放头或本地草稿。

取消分为已记录取消意图、取消中和终止确认。构建 renderer 当前没有中断契约，允许说明“当前阶段结束后取消”；导出器与 ASR／TTS 按实际 AbortSignal 退出。取消后晚到结果保留为记录或可验证缓存，不能自动采用；已经完成的有效片段不被假装撤销。

已完成的输出适配将确认的 source 送到已有 `OutputJobs.start`，完整保留 sequence、source、inputFingerprint、captions 和文件信息，并提供 `cancel_build`；未接入 jobs 的独立编译宿主仍不声明这些能力。该修补没有引入统一任务或持久意图账本，也没有改变现有 build 的等待默认值。后续长任务入口应返回可查询句柄；显式等待需要有界时间，超时不重启原任务。

## 9. 播放、录制与本地草稿的客户端协议

作者客户端登记可执行动作和编辑状态，`get_authoring_clients` 返回 clientId、在线状态、source、正在显示的快照、位置、可用动作，以及 dirty／saving／composing／conflicted／locked／unknown。默认只返回状态；尚未提交的内容只有在显式 draft 读取请求下才进入 agent 上下文。

`request_authoring_client` 使用 `{ document, clientId, requestId, source, action, expectedClientState }`。客户端核对来源和状态后执行语义动作，并回 `{ requestId, state, source, result?, error? }`。状态区分 sent、waiting-for-device、executing、done、refused、failed、expired。HTTP 已受理不能当作浏览器已经完成。

支持动作优先复用现有 `ProductionPlaybackCommand` 和预览协议：load、step、seek、rate、play、pause、位置／高亮，以及录制候选动作。load、seek、step 和选音色先暂停，不能为 agent 换目标时悄悄继续播放。播放应答包含实际绑定、时刻、playing、trying 和失败；没有可播放计划只可读估算，不能返回 playing。

草稿动作包括 inspect、read、flush、keep、restore、discard，按文稿、稳定锚点与 draftRevision 指定目标。flush 等待当前来源保存完成；组词尚未完成时返回 composing，不自动截断输入法。restore 和 discard 必须带预检得到的草稿版本及覆盖范围。没有客户端时返回 unknown，不读取别的用户 localStorage，也不声称所有草稿已保存。

agent 对已保存源执行事务不依赖一个永远在线的浏览器。客户端在线且有未保存输入时，能力和预检告知当前冲突；根据明确策略 flush、保留为待合并草稿或拒绝依赖该源的动作。即使决定保留草稿，外部提交也不能让旧客户端回执覆盖新源；继续沿用源 actor 的 CAS 与恢复界面。

主题、字幕可见性、缩放、面板、选区和播放头属于客户端设置。需要对齐这些人类操作时使用同一客户端语义入口，并在 capability 中说明只影响指定客户端；不为它们新增另一份可编辑文稿或时间线文件。

## 10. 审阅、历史与权限

新增 `get_review/plan_review_action/apply_review_action` 和 `get_history/get_revision/plan_history_action/apply_history_action`。适配现有 review、revisions、undo、redo 和 changes 服务，带 reviewId、检查点、预期 changes digest、原 revisionId、明确路径及 source。接受、逐文件拒绝和检查点恢复都要拒绝已变化的计划，不能对“现在任意待审阅内容”执行旧确认。

需要 required review 的 agent 修改仍进入该审阅，不能因为改用领域动作就立即提交或绕过锁。实现时为共享事务增加 review 会话上下文和检查点入口，复用 review 持有者，不让自己的文稿锁拒绝自己，也不提前释放整个审阅锁。直接的作者编辑继续走普通保存事务。

接受或拒绝审阅的决定要按调用方实际权限和既有宿主授权执行。agent 不能自行声明为作者、签发 confirmed，或默认批准自己的 required review；得到作者明确授权的操作由宿主绑定 review digest 后执行。历史冲突返回文件与恢复选择，不强制 reset。查看旧版本只读，恢复必须是单独动作；普通输入框内撤消仍由原生编辑器处理，MCP 只撤消明确的文稿历史或指定客户端草稿。

动作权限在接收、预检与提交时均检查。沿用服务端成员、文稿绑定令牌与 operate／spend 元数据；readOnlyHint 仅是工具提示，不能代替服务端授权。外部 agent 与 dsh 经过同一权限。没有 git 时显式报告 history/review/项目管理哪些功能不可用，文稿 CAS 保存本身仍可用。

服务配置、设备授权、模型会话选择、导入材料和对话发起也应列在 capability 中。涉及连接账户、设备确认或克隆音色同意记录的动作保留原有所有者／运营者边界，只返回可继续的宿主动作和状态；MCP 不读取或伪造凭据、同意记录和系统权限。单纯更换工具入口不扩大已有授权。

## 11. 结果验证反馈

新增 `verify_authoring_result`，输入为预检／提交／任务回执中的验证目标及明确 source、irRevision、planId、客户端或产物 ID。返回按项区分 passed、failed、pending、unavailable；每项都有 observedAt、实际来源、目标、诊断与可执行的下一步动作。不能只给布尔成功。

验证按工作必要性逐层执行：

1. 保存核验：重读权威文稿和参与文件，确认请求意图、实体身份、引用与保存版本。已保存但尚未编译单独报告。
2. 编译核验：读取或显式请求对应源的快照，确认 `IRDocument.source`，输出 JSON／Schema／插件／媒介诊断。保留旧快照时报告 displayedSource 与 requestedSource 的区别。
3. 计划核验：确认 ProductionBinding、时长已确认、配音精确缓存、媒体真实字节和字幕对齐来源；estimated／unknown 不能通过可播放或可导出的验证。
4. 浏览器核验：向指定客户端发带 requestId 的验证动作，收到该 source／revision 的位置、插件启动、组件错误、媒体加载和实际播放状态。旧的 `get_runtime` 报告不能证明新源成功；没有客户端返回 unavailable。
5. 产物核验：检查任务所用 source 与额外输入指纹、文件存在及媒体类型、主文件、字幕和导出诊断。下载链接可用与视频实际同步是不同验证项。

`get_diagnostics` 应改为与工作台共用当前 `DiagnosticSnapshot`，显式 compile/check 作为可选主动检查或独立工具。保留编译、检查、浏览器、请求、音频和任务的来源，不能修好一个请求就清除另一来源错误。结构化输出使用 MCP outputSchema／structuredContent，同时提供简短可读文本；大日志、候选音频和文件给受权限约束的 resource URI，不把二进制或凭据塞入提示。

agent 的正常闭环为：探测 → 读源 → 计划 → 提交／开始任务 → 订阅或轮询 → 验证 → 根据具体诊断修订。若验证失败，引用原结果和稳定目标开启下一次动作；失败不能被新的成功摘要覆盖。只在用户明确要求的范围内发起收费服务和播放，不为满足验证自动播放整讲或重新合成。

## 12. 实施切分与真实验收

### 12.1 可立即实施的第一片

第一片只接通 canonical read → validate／plan → apply → readback，使用现有 `DocumentEditOperation` 与 `fileChanges`，不等待第 3 节的完整动作注册表。页面复制、录音和 ASR 等尚未提升的语义暂不宣称可用。

从 `documentEditorRoutes` 的闭包抽出工作区 `DocumentEditor` 服务：`read(document, member)`、`plan(document, change, member)`、`change(document, change, member, plan?)`。`plan` 接受现有 `DocumentChange`，以同一个 `applyDocumentOperations/validateDocument` 生成候选并检查引用、身份、文件和基线；没有收费或编译前置。HTTP 的 document／document/change 和 MCP 必须调用同一实例与回执表，不能各自创建编辑器。

第一片四个 MCP 工具为 `get_authoring_capabilities`、`get_document`、`plan_document_change`、`apply_document_change`。plan 输入 `{ document, change: DocumentChange }`，返回固定的候选 digest、源版本、文件和问题；apply 输入 `{ document, change: DocumentChange, planId }`，再次检查同一 digest 与全部来源后执行。此输入是第 5 节高级语义动作的底层提交形态，后续动作统一降到它，不能再建立第二套事务。

保持现有实际限制：事务最多 16 个文件，包含 lecture.json；文本总量最多 2 MiB；每个已有文件带自己的 base，新文件使用 base:null；仅同文稿常规 UTF-8 文本，不接受重复路径、二进制、删除、任意远程路径或对 lecture.json 重复声明 fileChanges。路由 6 MiB 的 maxBody 不代表可以保存 6 MiB 文稿。id 不变、来源 CAS、锁、git 历史和失败恢复沿用 `SourceEditor.transaction`。二进制继续只走专门导入边界。

成功 apply 重读权威入口和参与文件，返回真实版本与 saved 验证状态，compiled／runtime 明确为未请求。初期幂等只承诺现有进程及结果仍为当前源的范围，能力响应明确说明这一限制；第 6 节的跨重启账本在 M2 实施前不能写为已支持。错误返回结构化 code、status 和字段详情；保存冲突不通过重读新源后自动重发来掩盖。

两种宿主通过可选服务注入分开处理：workspace 的 serve 创建服务，经 `ServerHost.authoring` → `serverMcpHost` → `McpHost.authoring` 传递；HTTP 路由使用该实例。现有 stdio `compilerMcpHost` 没有 SourceEditor，第一片报告 authoring unavailable；其只读和编译能力照常工作。不能让 mcp 反向导入 workspace，因为当前依赖是 workspace → server → mcp；独立 stdio 的完整写能力需要后续宿主组合或连接共享服务的桥接，不在第一片偷偷增加独立文件写入器。

apply 属于现有 operate 权限，在明确修改范围的宿主授权后执行；读取和纯预检属于 read。确认流程读取已有源元数据即可，不因 `call.approve` 当前实现先 compile 而让作者源读取／有效保存依赖编译。required review 的持锁或授权未满足时准确拒绝，不绕过审阅自动保存。第一片不新增付费调用，也不允许调用者自行声明 confirmed。

第一片真实验收包括：正式 stdio 对能力探测返回 unavailable；临时 workspace 的 HTTP 与 MCP 先后修改相同文稿，回执、CAS 与幂等一致；携带工程文本文件的原子提交及故意的文件冲突；无效候选不写入；编译失败文稿仍可读取和计划有效修复。只运行对应轻量结构检查，编译／运行验证按每个场景实际请求和报告。

### 12.2 后续完整切分

| 阶段 | 最小交付 | 一到两个真实验收场景 |
| --- | --- | --- |
| M1：作者源与事务 | 能力 Schema、get_document、共享页面／块／讲稿／批注／音色动作，plan/apply、读后核验；McpHost 可选 authoring 服务 | 在专用小文稿中，Web 新增页与批注，MCP 重命名、复制、改讲稿；双方重读同源且 ID 正确。旧源提交被拒绝，浏览器输入保留 |
| M2：任务与导出反馈 | build source 修补、完整任务信封、意图账本、取消、事件／轮询、结构化错误、当前诊断 | MCP 启动单一轻量输出，Web 看到同一 intent／任务／source；重复意图不重建。取消／重连后终态一致，旧源产物清楚标识 |
| M3：媒体与配音 | MCP 复用真实导入／检查／media-clip；音色目录／quote／范围生成与取消适配 | MCP 导入音频，Web 调整区间，MCP 读取相同真实时长与绑定；非法区间整体拒绝。只有已配置真实服务和明确授权时验证一次小范围 TTS |
| M4：人声转写重配 | 录音候选、ASR、差异、类型化采用、显式TTS，与录制转写 RFC 共用服务 | 真录音或真实文件 → ASR 候选 → 逐步采用 → 改字／发音 → 单步真实 TTS → 预览及单一视频导出；取消和旧结果不覆盖新源。缺服务只验阻塞，不伪造结果 |
| M5：客户端与恢复 | 播放／定位／录制客户端请求；草稿状态和动作；review/history 精确目标适配 | Web 正在编辑时 MCP 询问状态并保留草稿；flush 在组词时拒绝抢先保存。审阅逐文件拒绝和历史撤消跨客户端一致，恢复后重新验证 |

M1 中复杂步骤／定义操作按实际共享规则逐项开放，不能为了声称全覆盖先暴露无校验写入口。后续每个新增 Web 作者动作必须先有同一动作注册项、能力状态、结果和恢复契约；没有接入 MCP 的新增动作视为未完成对齐。

真实验收使用隔离临时工程和独立服务端口，不操作作者正在使用的服务和文稿。按仓库规则不新建 tracked tests，不日常运行测试套件；使用正式 CLI／HTTP／MCP 客户端／浏览器，保留实际任务、版本、媒体和诊断证据。正式外部服务只在已有配置和明确授权下调用，不能把 fixture 引擎或缓存命中报告成真实 ASR／TTS 已通过。

## 13. 本次核对的验证范围

已用正式 `packages/mcp/bin/presmium-mcp.mjs` 在临时最小文稿上执行无 `--allow` 的 stdio 链：tools/list → list_documents → list_sections → get_step → 读取 `presmium://diagnostics` → get_runtime。返回 1 份文稿、1 页、步骤 intro、诊断 version 1 且为空、runtime windows 为空；没有可编辑文稿工具，也没有 jobs 工具。独立临时目录在结束后删除。

该初始运行只证明只读工具和诊断资源可以被正式 MCP 客户端消费；空 runtime 表示没有观察到浏览器，不能证明页面成功渲染。后续首片的实际范围见第 14 节，完整任务协议仍未实现。

## 14. 首片实际接入范围

工作区已提供 `createDocumentEditor`，HTTP 与 MCP 共用 read／plan／change 服务和进程内回执。MCP 的四个入口已经接入，接受严格的共享 `DocumentChange` Schema、九类现有操作及同文稿文本文件。plan 返回完整候选、source、有效期、文件版本与实体影响，apply 核对相同请求和计划后原子保存，再重读文稿与全部文件。MCP 历史来源为 agent，普通 HTTP 作者保存仍为 editor。

作者 HTTP 路由由宿主直接提供，仍保留原来的 launcher token、成员角色和请求体限制；不先挂载编译后插件。作者 MCP 初始化只读取已完成编译的插件工具快照，诊断首读返回当前快照，不为初始化启动编译。编译完成后通过公开 MCP 工具清单变更通知发布真实插件工具。

独立 stdio 编译宿主明确返回作者服务 unavailable；operate 关闭时能力响应关闭 apply；required review 尚未接通时拒绝 apply，不因确认会话而绕过。计划和回执各最多保留 64 条，计划有效期为五分钟，幂等仅限当前进程、已保留回执且结果仍为当前源；没有跨重启账本。语义页面／批注动作、媒体导入 MCP、客户端草稿和播放控制、人声重新配音不计入此片完成范围。转写与采用是后续单独接入，见第 15 节。

正式 MCP stdio／HTTP 客户端和真实 workspace 服务在隔离小文稿中完成 9 组原子／权限／恢复场景及 5 组慢编译／策略场景。包含无 token 的 401、HTTP 与 MCP 共用幂等回执、旧源与工程文件 CAS、实际 git 提交失败的多文件回滚、非法引用、坏编译下读取／修复，以及 required review 拒绝。真实四秒编译进行中，另一个 MCP 客户端初始化、读取、预检及 HTTP 读取合计 68.53 ms；没有等待该编译。完整证据和边界见[首片验证记录](benchmarks/mcp-canonical-authoring-2026-10-27.md)。

本片没有调用外部模型、ASR 或 TTS，没有操作公共 Studio 或作者文稿，没有运行测试套件；作者 API 成功保存不代表完整 UI 或音频链已验收。

## 15. 转写任务与采用的 MCP 接入

真实本地 CPU 的单个英文文件已通过 MCP 导入、ASR、exact result 和明确采用，再经 Web 选择实际音色、完成新配音任务并播放／暂停，见[实际人声闭环](benchmarks/human-audio-to-voiceover-2026-10-27.md)。这项跨 Web／MCP 结果本身不证明共享 TTS start／list／cancel；后者随后按第 16 节单独交付。客户端录制／播放控制与完整能力对齐仍未完成。

工作区现在创建单个 `DocumentTranscriptions`，通过 `ServerHost.transcriptions` 与 `McpHost.transcriptions` 注入，同时提供宿主级 HTTP 路由。编译后 workspace 路由借用此实例；页面、编译和插件重挂载不关闭任务服务。只有 workspace 关闭时取消并等待其任务。`DocumentTranscriptionAdoption` 同样只有一份，复用 `DocumentEditor` 的计划和事务，没有适配器自建队列或另一种 planId。

| 工具 | 权限 | 实际结果 |
| --- | --- | --- |
| `get_transcription_capabilities` | read | exact source、配置能力、限额、诊断与可执行动作 |
| `start_transcription` | spend | 原有服务接收的真实任务／取消意图；不会直接写讲稿 |
| `get_transcriptions` | read | 持久 journal 与 active 状态中的任务清单、损坏记录 issues 和 truncated |
| `get_transcription` | read | 按 id 或 intent 查询实际任务 |
| `get_transcription_result` | read | 按 id／revision 读取不可变候选与其 exact source；当前性另查任务 |
| `cancel_transcription` | operate | 原服务取消回执；可先于接收记录取消意图 |
| `plan_transcription_adoption` | read | 明确 Step 范围、typed Narration 差异、受保护原子 conflicts 及原 DocumentEditor planId |
| `apply_transcription_adoption` | operate | 核对 source、candidate、draftRevision 与同一 planId 后的原子保存和读后回执 |

HTTP 共用 `document/transcription/capabilities`、`document/transcription`、`document/transcription/result`、`document/transcription/cancel`、`document/transcription/adoption/plan` 和 `document/transcription/adoption/apply`；这些路径已进入 Studio 通用代理白名单，保留原授权和转发方式。无 id／intent 的 GET `document/transcription` 返回清单。宿主路由保留 launcher token、成员角色及请求体限制，不依赖 compiled routes 挂载。

目标文稿通过公开 `Compiler.nodeServices()` 装配真实 `SPEECH` 和 `PRODUCTION_AUDIO_AUTHORING`。该边界读取 canonical 配置与插件，不 collect contributions、不运行 IR pass／动画场景，也不请求 ASR／TTS。适配器核对装配同次返回的 exact source，只合并同源进行中的请求，不用旧缓存掩盖配置错误。能力的 `verification: configuration-only` 明确不证明提供方鉴权；缺服务为 unavailable，实际装配出错且能力未解析为 unknown 并保留 findings。

模型输入与服务输入复用严格 Schema 和 32 KiB 请求预算，只有可信宿主完成 spend 授权后才注入 `confirmed:true`。模型不能提交 confirmed 或 origin。MCP 采用固定为 agent，HTTP 作者采用由私有闭包固定 editor；required review 未满足时仍拒绝 agent apply。独立 compiler stdio 没有这些服务，能力返回 unavailable，不构造另一套本地任务执行器。

清单最多扫描 1025 个目录项、读取 1024 项，四路并发；任务、issues 和 framing 的完整 JSON 不超过 2 MiB，截断时显式返回 truncated。旧文稿 UUID、损坏 JSON、原音变更和损坏 journal 不得冒充当前任务。坏 JSON 下清单、任务、结果与取消仍可用，不装配语音服务。读取拒绝符号链接与非普通文件，不等待 FIFO 写入者。

提供方返回非空 text、空 segments 时，producer 在不可变 revision 产生前生成稳定 ID 的单个文本 segment，保留原 text，不生成 start／end／words，timing 为 none 并附警告。采用服务可选这个真实文本候选；UI 不发明另一份 candidate。空 text 不产生片段，原录音时间也不冒充重新配音时间。

正式 MCP 客户端和实际 workspace 完成 25 组隔离消费者检查，3587.70 ms、提供方请求为 0、15 个关键源码运行前后 SHA 一致。覆盖服务来源、权限、预取消、跨客户端共享、坏源／旧 UUID／损坏存储、请求和清单预算、原子采用、agent 历史来源、required review、插件重挂载与重启恢复。候选使用明确标注未识别的协议材料，原音仍经真实媒体探测；text-only 分支只验证 producer 纯标准化。范围与原始证据见[转写接入记录](benchmarks/mcp-transcription-actions-2026-10-27.md)。

上述八工具首片定向验证未覆盖成功 ASR、运行中提供方取消、真实 TTS 或完整浏览器录音链。后续本地音频导入、音色目录、真实人声闭环与范围配音任务的独立交付见第 2 节核对表和第 16 节；远程上传与播放器／草稿客户端协议仍待实现，不能据局部完成宣称全部作者动作已对齐。

## 16. 已实施：共享配音任务与音频资源

`DocumentVoiceAuthoring` 新增 status、list/get、start/cancel 与 quote/preview/resource，具体输入和限额以[音色与配音作者服务](voice-authoring.md)为准。HTTP 与 MCP 共用 Workspace owner，standalone 使用相同 Node 工厂。新 `VOICEOVER_EXECUTION` 才是实际生成实现，`VOICEOVER` 仍只是安装标记。

`start_voiceover` 必须由主机批准 spend，输入不接受 confirmed；source、IR revision 和 scope binding 均复用既有来源检查，真实缓存与生成锁不另建一套。`get_voiceover_jobs/get_voiceover_job/cancel_voiceover` 不要求当前 JSON 或编译成功，不为任务查询装配提供方。sequence 随实际状态或进度增加；配置 remount 保留同一 Workspace owner，旧任务仍报告原 source/revision 与 current 状态。

`quote_voice_preview/preview_voice` 使用实际 quote、提供方、缓存和真实音频。MCP 返回限额内音频 resource 的 URI、字节数、SHA 与时长，resource 内容是 MIME/blob；Web 仍使用原响应格式。音频生成和资源可读不等同客户端已经试听，物理播放及录制仍需实际客户端应答。同步 `lecture_synthesize` 插件工具已撤下，既有 export CLI 未改动。

真实范围见[任务 owner 验证记录](benchmarks/voiceover-task-owner-2026-10-27.md)：进程内任务、真实 CPU TTS、取消、remount 与音频资源已独立验证。没有新增持久任务账本、播放控制或音色继承写入接口。缓存随后通过[独立切片](benchmarks/speech-cache-profile-2026-10-27.md)绑定实际模型／提供方 profile；原错误命中的反例与后续真实双生成晚回验证分别保留，不把缓存修复归入原 owner 那轮证据。
