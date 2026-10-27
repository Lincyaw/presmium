# RFC：Web 与 MCP 共用作者动作及验证反馈

状态：待实施。2026-10-27 根据作者要求设计：AI agent 经 MCP 能完成作者在 Web 中可完成的工作，包括人声录音转写、将文字采用为讲稿、再显式生成 AI 配音。本文的接口名和新增类型均为提案；现有能力逐项标在第 2 节。

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

以下是 2026-10-27 的源码核对。表中“已有”只表示列出的实现存在，不表示拟议 MCP 已实现，也不替代真实设备、服务和浏览器验收。

| 作者操作 | 当前 Web／共享边界 | 当前 MCP | 应补齐的边界 |
| --- | --- | --- | --- |
| 列文稿、新建、复制、重命名、删除项目 | `WorkspaceClient.operateDocument` → workspace `documents`；管理操作与历史需要 git | 只有 `list_documents` | 项目操作预检、版本和引用影响，调用同一个 `DocumentOperations` |
| 读取可编辑文稿 | `GET document`，无需先编译 | `deck_info/get_section/get_step` 读取运行快照，没有作者文稿入口 | `get_document` 返回 `DocumentAnswer`、稳定实体与源 Schema |
| 正文结构、格式、表格、图片占位、块移动 | 原生 BlockNote 投影回 `TeachingDocument`，`DocumentSession` → `document/change` | 无作者动作 | 提升富文本／块动作及身份规则；复用相同校验 |
| 页面新建、重命名、复制、排序、删除 | `document-pages.ts`、原生插页、整份 replacement；复制与删除纯函数仍在 workbench | 无 | 移至共享纯领域层；页内绑定重映射、最后一页和外部引用同一语义 |
| 步骤状态、显隐、继承、组件参数与身份 | IR 契约支持稳定 `StepId`、`setStepState`；Web 对复杂步骤操作仍有缺口 | 只有数字步骤读取／导航 | 共用稳定步骤动作；未实现的重排／删除规则先声明 unavailable |
| 讲稿文字、发音替换、cue 与停顿 | `NarrationEditor/DocumentStepNarration` → 同一文稿；`setNarration/setTiming` 已有 | `lecture_preview` 只读派生计划 | 接受原生 `NarrationNode[]`；精确目标、共享讲稿影响与 cue 校验 |
| 定义、公开参数、共享素材修改和“另存” | 定义在文稿中，代码通过 `DocumentChange.fileChanges`；通用素材属性仍未完整接入 | 代码引用只读工具，不是作者动作 | 定义 Schema、引用计数、单实例／全部实例／fork 三种明确范围 |
| 批注新建、回复、编辑、反应、解决、重开、删除 | `DocumentThreadStore` 适配 BlockNote CommentsExtension，落 `TeachingDocument.comments` | `get_focus` 不等于批注接口 | 共用线程动作、稳定文本锚点和失锚状态；禁止写 BlockNote 私有 JSON |
| 批量批注交给助手、接受／拒绝／继续修改 | workbench 与 dsh 的会话／审阅路由；材料生成流程仍未齐全 | 核心 MCP 不提供会话或审阅动作 | 显式任务范围、会话上下文与修改审阅，不能将发送成功当作内容修改完成 |
| 导入与查看图片 | `document/image` 将原文件和资产声明原子保存；`document/asset` 按 Asset ID 读取 | 无 | 安全字节输入、回执与资源读取；沿用现有媒体检查限制 |
| 导入／检查本地音频 | `document/audio`，`DocumentAudioImport/InspectionAnswer`；真实媒体探测及多文件事务 | 无 | `import_asset/inspect_asset` 复用这条链，不接受任意服务端路径 |
| 音频区间、步内偏移、音量、静音、移除 | `document/media-clip`；`ProductionBinding` 与真实素材时长校验 | 无 | `mediaClip` 动作复用服务，删除 clip 不删除原始素材 |
| 录制、重录、试听、采用录音 | viewer 有讲授录制链；制作面板候选录音与采用仍未完整接入 | 无客户端录制控制 | 版本化录制候选与客户端语义请求；采用另走作者事务 |
| 人声转写 | `SpeechService.transcribe` 已有；旧讲授轨路径可转写 | 插件 `track_transcribe` 写 `lectures/<track>/track.json` | 新增按保存资产／候选范围启动的 ASR 任务，不写讲稿 |
| 查看差异并将转写采用为步骤讲稿 | 制作面板未接入 | `track_narration` 只读文本草案和源位置，不是规范讲稿采用 | 类型化 `Narration` 候选、逐步骤差异、基线核对、原子采用 |
| 采用转写后改用 AI 配音 | 可编辑 `VoiceSource`；录音来源播放仍受服务支持限制 | `lecture_synthesize` 为显式 spend 工具，整讲同步返回 | 显式选择 TTS 来源和作用域，再复用有 source 的配音任务；不能把 ASR 时间当作新音色时间 |
| 音色目录、搜索筛选、继承与批量应用 | `voice-catalog`、`document-voices.ts`、规范 `Production`；批量默认保留覆盖 | 无专门目录／作者动作 | 目录能力及不可用原因；提升相同作用域与影响计算到共享层 |
| 音色样本／当前讲稿试听 | `voice-preview` 的 quote → 显式请求 → `VoicePreviewAnswer` | 无 | 保留 quote、提供方、cache 状态和明确 spend；返回可读取的音频资源 |
| 配音生成、进度、取消 | `VoiceoverRequest/Job/Snapshot`；客户端先分配 intent，支持按 intent 取消 | `lecture_synthesize` 有来源屏障，但未暴露 Web 的任务／范围／取消链 | MCP 适配现有 voiceover 服务，保留 intent/source/revision/scope |
| 计划、波形、定位、播放、暂停、速率 | `ProductionPlan`、单一播放器、预览协议中的制作请求 | `navigate` 仅定位放映窗口；`get_runtime` 只读运行报告 | 计划读取及指定作者客户端的 `ProductionPlaybackCommand` 与应答 |
| 编译、预览、导出、下载 | workspace `jobs` 需要明确 `JobSource`，支持状态、事件、取消、版本和文件 | `build/get_builds`；MCP `build` 未传 source，摘要丢失 sequence/source，无取消工具 | 同一已确认源的启动、完整任务读取、取消与产物资源 |
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

媒体输入共用工作区有界上传服务。Web 仍用 multipart；MCP 通过 `begin_asset_upload/append_asset_upload/finish_asset_upload` 的有限大小字节块获得一次性上传句柄，或者使用服务已登记的资源 URI。必须由能力响应公开字节上限、块上限、支持格式和句柄期限。服务不从 agent 给出的绝对路径、`file://` 或任意 URL 读取文件。

上传句柄在当前成员和文稿下临时保存精确字节、长度及 SHA-256；完成上传只形成候选，`import_asset({ id, source, upload })` 才调用现有图片／音频导入事务。句柄过期可清理，写入成功的声明与文件不受临时句柄清理影响。若共享服务已支持直接流上传，MCP 宿主适配可复用它，不另设媒体探测实现。尚未被 clip 使用的音频通过 `inspect_asset` 的作者源读取，不能只查运行 `productionAssets`。

录音使用第 9 节的已连接客户端请求：`recording.start/stop/cancel/audition` 指定 clientId、requestId、source 和目标稳定 StepId。设备权限尚未授予时返回 waiting-for-device，不能显示录制中。停止后产生录音候选与真实字节信息，试听、采用为录音配音、采用为附加片段、转写是分开的动作。原轨在候选明确采用前保留。

人声转为 AI 配音必须形成如下可观察链：

1. 录制或上传音频，读取真实媒体检查结果。明确选择音频范围、目标页面／步骤和转写提供方。
2. `transcribe_audio` 显式启动真实 ASR，返回 intent 和任务；结果是版本化候选，保留源音频 SHA-256、范围、引擎、语言、实际 segments／word times 和目标基线。没有逐字时间就返回缺失。
3. `get_transcription` 读取候选；`plan_transcription_adoption` 返回逐步骤差异、替换范围、发音与 cue 处理、失效时码和配音数量。内容不自动写入讲稿。
4. `adopt_transcription` 在当前源基线下原子写入类型化 `NarrationNode[]` 和所选步骤绑定。未经确认的步骤映射、猜测的 cue 和缺失对齐不自动采用。规则由[录制转写 RFC](rfc-recording-transcription.md)定义。
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

第一项必须修补的适配是 `build({ source, to, wait: false, intent })`：将 source 送到已有 `OutputJobs.start`，完整保留 sequence、source、inputFingerprint、captions 和文件信息，并提供取消工具。不能继续以只含 IR revision 的 `jobSummary` 证明新源已导出。长任务默认立即返回可查询句柄；显式等待也需要有界时间，超时不重启原任务。

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

该运行只证明现有只读工具和诊断资源可以被正式 MCP 客户端消费；空 runtime 表示没有观察到浏览器，不能证明页面成功渲染。本次没有连接公共 Studio、修改作者文稿、请求语音／材料服务、运行测试套件，拟议作者动作与任务协议尚未实现或验收。
