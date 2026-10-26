# 本地音频导入与片段提交

作者先导入原始音频，再明确将一个区间附到步骤。这是两个作者决定，各自形成一次文稿事务。`lecture.json` 保存资产声明、区间、步骤、偏移、音量与静音；原始文件单独保存在文稿内，裁切不改写文件。讲稿、字幕与配音来源不因音频素材操作改变。

Studio 的视频制作中使用“音频片段”：导入后选择素材，编辑成对入出点、步内延后、音量与静音，再明确采用到本步。恢复完整只修改待采用区间；移除片段保留原素材。成功保存后准备对应版本，保持暂停。文档编辑仍只提供字幕与配音开始。界面与失败恢复的实际范围见[音频片段编辑记录](benchmarks/audio-clip-editor-2026-10-27.md)。

以下工作区路由均要求编辑者权限。参数 `document` 仍按既有工作区协议指定文稿目录，所有回执绑定该目录和保存版本。公开类型在 `packages/kernel/src/contracts/production-assets.ts`。

浏览器通过 Studio 的 `api/presmium/document/audio` 与 `api/presmium/document/media-clip` 访问同一组路由。代理保留 multipart 的 Content-Type 边界和原始字节，不将文件转为 JSON。Workbench 先暂停、确认当前来源与保存状态，再发起写入；回执后重新读取原文稿的权威来源，不直接用旧回执替换当前输入。

失败导入的显式重试使用同一个内存 File 和请求意图。意图只在通过最终来源屏障、实际发请求时创建；首次明确的 4xx 拒绝可重新发起，已经发送但结果不明的请求继续使用原 ID 与基线，避免重复导入。切换文稿后，旧请求不能改动新目标的输入或选择。

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

这与运行端 `production-asset` 不同：编译器只将被 clip 引用的资产投影为 `productionAssets`。尚未引用的素材应使用此作者接口，不能根据运行快照中没有声明推断素材不存在。只读检查不接受任意文件路径，拒绝远程、跨文稿、隐藏路径、符号链接与路径穿越。

## 显式应用或移除片段

`POST document/media-clip` 接收 `DocumentMediaClipChange`：

- 添加或修改：`{ id, baseDocumentVersion, binding, clip }`。
- 移除：`{ id, baseDocumentVersion, removeClipId }`。

添加或修改必须带当前完整 `ProductionBinding`。服务重新计算只读缓存计划并核对 source、完整 IR revision 和 planId，再用实际资产时长验证候选 clips。所选步骤必须 `timing=confirmed`，且具有确定的 `startMs` 与 `endMs`；可用长度就是这两个字段之差，不额外增减停顿。

入点须非负，出点晚于入点且不超出真实素材时长。步内偏移须非负，偏移加选区长度不得超过该步。超出时拒绝整个操作，不静默裁切、跨步或修改 hold／cue。沿用既有制作上限：最多引用 32 份音频、估算解码总量不超过 256 MiB。

`volume` 为 0..1，`muted` 独立保存。静音不把音量改为零，取消静音恢复所保存的音量。移除 clip 不删除声明或原文件，也不要求一个失效计划先恢复，因而可以清理无效引用。返回既有 `DocumentChangeAnswer`；保存成功不等于新计划已经就绪，调用方仍须读取权威文稿并准备对应版本。

版本或计划变化返回 409；字段／引用无效、未确认步骤、非法范围与不支持的媒体返回可读的 422 错误。文件过大返回 413，媒体服务缺失返回 503。文稿锁沿用既有 `locked` 回执。真实验证范围见[音频作者接口记录](benchmarks/audio-authoring-2026-10-27.md)。
