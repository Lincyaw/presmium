# 本地音频导入与片段提交

作者先导入原始音频，再明确将一个区间附到步骤。这是两个作者决定，各自形成一次文稿事务。`lecture.json` 保存资产声明、区间、步骤、偏移、音量与静音；原始文件单独保存在文稿内，裁切不改写文件。讲稿、字幕与配音来源不因音频素材操作改变。

Studio 的视频制作中使用“音频片段”：导入后选择素材，编辑成对入出点、步内延后、音量与静音，再明确采用到本步。恢复完整只修改待采用区间；移除片段保留原素材。成功保存后准备对应版本，保持暂停。文档编辑仍只提供字幕与配音开始。界面与失败恢复的实际范围见[音频片段编辑记录](benchmarks/audio-clip-editor-2026-10-27.md)。

以下工作区路由均要求编辑者权限。参数 `document` 仍按既有工作区协议指定文稿目录，所有回执绑定该目录和保存版本。公开类型在 `packages/kernel/src/contracts/production-assets.ts`。

浏览器通过 Studio 的 `api/presmium/document/audio` 与 `api/presmium/document/media-clip` 访问同一组路由。代理保留 multipart 的 Content-Type 边界和原始字节，不将文件转为 JSON。Workbench 先暂停、确认当前来源与保存状态，再发起写入；回执后重新读取原文稿的权威来源，不直接用旧回执替换当前输入。

失败导入的显式重试保留同一个内存 File。共享入口先计算摘要并检查已声明素材的实际字节；确认已经保存时复用真实素材，没有保存且作者已确认新源时才使用新意图。已发送但结果不明的请求先使用原 ID 对账；撤消到相同基线使旧回执明确冲突时，仅在当前来源仍相同且干净的条件下，用同一基线建立一次新意图。切换文稿后，旧请求不能改动新目标的输入或选择。

## 导入原始文件

`POST document/audio` 使用 multipart 的两个字段：

| 字段 | 内容 |
| --- | --- |
| `change` | `DocumentAudioImport` 的 JSON：`id` 与 `baseDocumentVersion` |
| `file` | 浏览器选择的原始 `File` |

服务按真实字节识别媒体，不信任文件名、扩展名或上传声明的 MIME。支持可被实际解析的 Ogg、WAV、MP3、M4A 与音频 WebM；只接受一个音轨、1–2 声道、非空且不超过 16 MiB、时长不超过十分钟的文件，不接受视频。原字节的 SHA-256、实际时长、编码、采样率和声道数都来自同一次有界探测。

服务分配 Asset ID 和 `assets/audio/<id>.<实际格式>` 路径。上传名只用于可选的 `Asset.title`：提取 basename、移除控制字符并去掉首尾空白，最多保留 200 个 Unicode 字符，空值不保存。素材选择和制作媒体段可优先显示该标题，未命名资产使用 ID；标题绝不决定路径。

文稿锁、版本检查、二进制独占创建与 JSON 写入经过同一事务；git 工作区中，两者形成同一个历史版本，失败恢复原 JSON 并删除新文件。撤消移除声明和文件，重做恢复相同字节。上传文件名不能决定写入路径。

返回 `DocumentAudioImportAnswer`：既有 `DocumentChangeAnswer` 加上 `assetId` 和 `inspection`。资产可从 `answer.content.assets[answer.assetId]` 读取。导入不自动创建 clip，不延长步骤。重复提交同一个请求 ID、相同清洗标题与字节，在来源仍匹配时复用回执；不同内容或标题不能复用成功请求的 ID。

## 检查尚未使用的素材

`GET document/audio?assetId=…&baseDocumentVersion=…` 返回 `DocumentAudioInspectionAnswer { document, version, fingerprint, inspection }`。路由直接读取当前权威资产声明，按工作区权限和同文稿常规文件规则探测，并在返回前再次核对源版本；不请求编译。

这与运行端 `production-asset` 不同：编译器将被 clip 或可见步骤有效录音来源引用的资产投影为 `productionAssets`。尚未引用的素材应使用此作者接口，不能根据运行快照中没有声明推断素材不存在。只读检查不接受任意文件路径，拒绝远程、跨文稿、隐藏路径、符号链接与路径穿越。

## MCP 检查与导入工作区音频

`createDocumentAudioAuthoring` 是工作区的共享作者服务，公开契约在 `packages/kernel/src/contracts/document-audio.ts`。主服务持有一个实例，HTTP、MCP 和编译贡献借用同一组事务与回执；编译贡献重挂载不会重新创建回执表。底层 `ProductionAudioAuthoring` 仍由插件负责真实探测和片段验证。

| 工具 | 输入 | 回执 |
| --- | --- | --- |
| `get_audio_authoring_capabilities` | 文稿目录 | 当前 source、实际服务状态、操作支持、同文稿文件范围、16 MiB 上限、并发／回执限额与审阅限制 |
| `inspect_workspace_audio` | `request:{source,path}` | 实际文件摘要、长度与媒体信息；`file:{path,sha256,byteLength}` 可原样用于导入，不分配 canonical Asset ID |
| `import_workspace_audio` | `request:{id,source,file}` | `VerifiedDocumentAudioImport`，含原有资产／事务回执与保存后核验 |
| `inspect_document_audio` | `request:{source,assetId}` | 同一个已保存资产的真实 `DocumentAudioInspectionAnswer` |
| `read_production_plan` | `request:{source,irRevision?}` | 既有运行快照的真实 `ProductionPlan` 与完整 binding；不自动编译 |
| `validate_media_clip_change` | `request:{source,binding,clip}` 或 `{source,removeClipId}` | 只读 before／after、操作、受影响步骤与素材、实际校验范围 |
| `change_media_clip` | 在上述请求中增加 `id` | 同一片段事务的保存回执与读后核验；来源固定为 agent |

`path` 相对工作区根目录，必须属于当前文稿既有 SourceEditor 范围内的普通文件。入口先执行共享路径权限校验，并排除音频的点号目录；已有回执也不能绕过范围规则。实际打开使用普通文件、句柄身份、读前后状态和有界字节检查。不能提供绝对路径、任意 URL、跨文稿或符号链接。

文件检查和导入都核对完整 `CanonicalSource`。检查结果只是一份观察，导入仍重新读取原文件并核对所确认的 SHA 和长度。文件检查与服务装配可以并行，但最终探测、保存和读回依赖实际结果。作者能力通过目标文稿的 `Compiler.nodeServices()` 获取，不等待动画或场景编译成功。

Web multipart 和 agent 工作区导入归入同一个音频意图：源、清洗标题、原始字节摘要与长度决定规范化输入。MCP 的写入来源由宿主固定为 agent，payload 不接受 origin／confirmed；required review 尚不能自动完成时明确拒绝 agent 导入，HTTP 人类编辑路径仍由宿主私有闭包选择。

保存后读取权威文稿和新文件，核对 Asset、实际 SHA／长度、源版本与文件版本，返回 `verification.saved/source/asset`，并明确 `compiled/runtime='not-requested'`。若事务已提交而读回发现外部变化，错误含 `committed:true`、原意图、资产、已保存版本和可用的当前 source；不能把它当作尚未写入而重新导入。

导入和片段共享最多 64 条进程内回执、4 个在途操作，结果仍是当前源时才可复用；不承诺跨重启或更晚编辑后的幂等。服务关闭先阻止新工作，取消未提交的读取／探测，等待已经开始的事务与真实读回完成。导入不创建片段；片段修改不创建讲稿或触发 ASR、TTS、播放。完整上传句柄、音色配置和任务 MCP 对齐仍见 [MCP RFC](rfc-mcp-authoring-actions.md)。

## 显式应用或移除片段

`POST document/media-clip` 接收 `DocumentMediaClipChange`：

- 添加或修改：`{ id, baseDocumentVersion, binding, clip }`。
- 移除：`{ id, baseDocumentVersion, removeClipId }`。

添加或修改必须带当前完整 `ProductionBinding`。服务重新计算只读缓存计划并核对 source、完整 IR revision 和 planId，再用实际资产时长验证候选 clips。所选步骤必须 `timing=confirmed`，且具有确定的 `startMs` 与 `endMs`；可用长度就是这两个字段之差，不额外增减停顿。

入点须非负，出点晚于入点且不超出真实素材时长。步内偏移须非负，偏移加选区长度不得超过该步。超出时拒绝整个操作，不静默裁切、跨步或修改 hold／cue。沿用既有制作上限：最多引用 32 份音频、估算解码总量不超过 256 MiB。

`volume` 为 0..1，`muted` 独立保存。静音不把音量改为零，取消静音恢复所保存的音量。移除 clip 不删除声明或原文件，也不要求一个失效计划先恢复，因而可以清理无效引用。返回既有 `DocumentChangeAnswer`；保存成功不等于新计划已经就绪，调用方仍须读取权威文稿并准备对应版本。

版本或计划变化返回 409；字段／引用无效、未确认步骤、非法范围与不支持的媒体返回可读的 422 错误。文件过大返回 413，媒体服务缺失返回 503。文稿锁沿用既有 `locked` 回执。真实验证范围见[音频作者接口记录](benchmarks/audio-authoring-2026-10-27.md)。

Web 和 MCP 的片段操作由 `DocumentAudioAuthoring` 的同一实例执行。`POST document/media-clip/validate` 与 MCP 预检使用完整 source，返回 `operation/clipId/before/after/impact/issues/checked`；预检不分配或保存新的 planId，提交仍在原事务内重新校验。已存在的 HTTP 提交形态保持不变，由可信宿主选择 editor 路径；MCP 请求不接受 origin／confirmed，required review 下明确拒绝 agent 写入。

`read_production_plan` 只读实际已有快照；没有快照时返回 `production-document-unavailable`，不会为了取得 binding 自动编译。需要准备或刷新时，先显式读取 `presmium://ir?document=…`，再使用当前 source 读取计划；返回的 binding 才可用于片段提交。可选的 expected `irRevision` 不匹配时返回冲突。能力中的 upsert 支持和 configuration-only 不表示当前步骤已确认或计划可播放；删除仍可在无引擎、坏计划时清理引用。

保存回执增加 `verification:{saved,source,production,binding?,compiled,runtime}`。`production` 是 `validated-before-save` 或删除的 `not-required`；compiled／runtime 均为 `not-requested`。事务已提交后若权威读回发生变化，返回 `media-clip-readback-changed` 和 `committed:true`；不能把它当作未提交重发。事务开始后的取消保留真实提交／回滚结果，不创建虚构的取消任务。MCP 对 503 使用共用 `tool-failed` 包装并保留实际领域 message；SDK 的输入 Schema 拒绝是 `isError` 文本，不伪造为 HTTP 400。

## 采用原音为本步配音

`DocumentAudioAuthoring.adoptRecording`、`POST document/recording/adopt` 与 MCP `adopt_recording` 使用同一个作者服务。输入 `DocumentRecordingAdoption` 固定意图 ID、完整 canonical source、稳定 Step ID、Asset ID 和原音 SHA-256。只读检查使用既有 `inspect_document_audio`；采用时重新检查同文稿真实音频，经过原文稿锁、CAS、审阅与历史事务，并再次读回。缺少 fingerprint 的旧素材在同一次事务中写入真实 SHA。原始音频、Narration、发音、cue 和媒体片段保持原内容，只有目标步骤的 `voiceSource` 明确改为 recording。Studio 录音卡当前仍只保存资产；本片没有新增采用按钮。

一个步骤使用整个音频文件一次。多个 Narration 合成一段派生字幕，保留全部 Narration ID；没有 Narration 时仍播放音频且没有字幕。字幕来自当前规范讲稿的显示文字，不从音频猜测，`alignment=none`，不声称文字与声音内容已经核对或逐词对齐。非起点提示、内部暂停、跨步 next 和互相冲突的讲稿起点会拒绝采用或使播放计划不可确认。裁切和跨步连续录音尚未开放。

现有文稿／页面／步骤继承规则继续生效：两个步骤继承同一录音时，各自完整播放一次，不把一个源文件自动切分到两步。编译与受众过滤只发布仍可见的有效素材。真实时长进入原有讲稿排程与单一 MediaClock，录音使用实际 `mediaId` 和 SHA，经完整 ProductionBinding 的媒体白名单读取；不会伪造语音合成缓存身份。原音和已有精确 TTS 缓存可以在同一计划中播放、发布，TTS 生成对录音步骤显示不适用。

实际零模型范围、拒绝边界与未开放项见[本步录音采用记录](benchmarks/recording-step-adoption-2026-10-27.md)。
