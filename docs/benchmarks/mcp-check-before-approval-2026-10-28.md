# MCP 写入工具先检查、后请求批准

2026-10-28，在分支 `work/mcp-check-first-2026-10-28` 上做真实运行验证。[工作台批准记录](workbench-approvals-2026-10-28.md)指出，除图片导入外，写文稿的 operate 工具都先请求作者批准、批准之后才做 CAS 与摘要检查，作者会被要求批准一个随后必然失败的请求。本次把这些工具改成与图片导入相同的顺序。

Studio 从该分支源码启动（`presmium-studio <工作区> --port 4345 --host 127.0.0.1`），工作区由 `examples/animations/try.mjs` 新准备，文稿为“冒泡排序”；启动前载入本机语音配置（Edge 朗读与本机 Whisper），以便验证转写采用。客户端是官方 MCP SDK（`@modelcontextprotocol/client`）的 Streamable HTTP 连接，令牌取自 serve 的 `server.json`，即未经预确认的进程令牌。批准在 Studio 工作台应用栏的“待确认”中由 Playwright Chromium 回答。没有调用任何模型。

## 改动

- 共享服务为每个写入增加与 apply 同一路径、但不写入的检查：`DocumentAuthoring.checkApply/checkPageChange/checkPageDuplication/checkAction`，`DocumentAudioAuthoring.checkWorkspaceImport/checkClipChange/checkRecordingAdoption`，`DocumentHistory.checkChange`，`DocumentTranscriptionAdoption.check`。实现把各 apply 的前置部分抽出复用（计划引用、family、过期、删除确认、review、回执重放），末尾以事务的试运行（`planTransaction`）核对文件版本与范围；音频导入另读文件核对 SHA-256／长度并探测格式；录音采用检查步骤、资产字节与区间；历史在 git 队列中跑与 revert 相同的检查（下一目标、祖先、merge-tree 冲突、文档范围、未提交文件），由 `Revisions.checkRevert` 提供，与 `revert` 共用 `#planRevert`。
- 同一意图的回执仍可重放、或同一请求正在进行时，检查通过，照常询问；回执已不是当前结果时直接拒绝。
- MCP 的 `call.approve` 增加 `check`：未经预确认时先运行它，失败即返回原有错误码，不发出批准请求。预确认的调用方（内置助手）不被询问，也不另做这次检查。`import_workspace_image` 改用同一入口。
- 批准之后 apply 照旧全部重查，等待期间文稿被改时返回 409，不写入。

## 实际运行

“出现批准”一列在调用期间每 25 ms、返回后再 600 ms 检查工作台应用栏的“待确认”入口。

| 工具 | 请求 | 结果 | 出现批准 |
| --- | --- | --- | --- |
| `import_workspace_audio` | 错误 SHA-256 | 33 ms，409 `audio-file-changed` | 否 |
| | 不存在的文件 | 20 ms，404 “no file bubble-sort/none.ogg” | 否 |
| | 陈旧指纹 | 18 ms，409 `document-version-changed` | 否 |
| | 正常导入 `take-a.ogg` | 82 ms 后出现“导入音频「take-a.ogg」”，允许后保存，资产声明与 `assets/audio/` 文件都在，提交 `0b9b86e` | 是 |
| | 同 ID 重放（source 仍是其结果） | 询问；允许后返回原回执，没有新提交 | 是 |
| `adopt_recording` | 错误 SHA-256 | 21 ms，409 `production.asset-changed` | 否 |
| | 不存在的步骤 | 17 ms，404 `document-step-missing` | 否 |
| | 陈旧指纹 | 12 ms，409 `document-version-changed` | 否 |
| | 正常采用到 `intro--step-0` | 81 ms 后出现“采用录音为本步配音”，允许后 `stepOverrides` 写入 recording | 是 |
| `change_media_clip` | 陈旧指纹 | 27 ms，409 `document-version-changed` | 否 |
| | 区间超过音频时长 | 28 ms，422 `production.media-range` | 否 |
| | 不存在的资产 | 17 ms，422 `document-invalid` | 否 |
| | 步骤时长未确认（TTS 缓存未命中的步骤） | 22 ms，422 `production.media-step-unknown`（未开工作台监视） | 否 |
| | 正常添加 `clip-check-1` | 87 ms 后出现“添加音频片段”，允许后 `mediaClips` 含该片段 | 是 |
| `apply_document_change` | 预检后文稿在外部被改 | 24 ms，409 `document-version-changed` | 否 |
| | 未知 planId | 13 ms，409 `document-plan-changed` | 否 |
| | 正常改“小结”标题 | 79 ms 后出现，允许后标题为“小结与回顾”，提交 `43ee1e0` | 是 |
| | 等待批准期间文稿被改，再允许 | 409 `document-version-changed`，标题与 HEAD 未变 | 是 |
| `apply_page_change` | 预检后文稿被改 | 16 ms，409 `document-version-changed` | 否 |
| | 删除页面不带 `confirmDeletion` | 13 ms，409 `page-deletion-confirmation-required` | 否 |
| | 错误摘要 | 18 ms，409 `document-plan-changed` | 否 |
| | 正常重命名“一趟冒泡” | 25 ms 后出现，允许后标题为“一趟冒泡（详解）” | 是 |
| `apply_page_duplication` | 错误摘要／未知 planId | 12／16 ms，409 `document-plan-changed` | 否 |
| | 另一修改之前做的预检 | 18 ms，409 `document-version-changed` | 否 |
| | 正常复制“小结” | 76 ms 后出现，允许后多出“小结（副本）” | 是 |
| `apply_authoring_action` | 预检后文稿被改 | 18 ms，409 `document-version-changed` | 否 |
| | 错误摘要 | 13 ms，409 `document-plan-changed` | 否 |
| | 正常新建一条讨论 | 86 ms 后出现，允许后文稿有一个讨论线程 | 是 |
| `undo_document_change` | `lecture.json` 有未提交修改 | 113 ms，409 `history-conflict` | 否 |
| | expect 不是下一个撤消目标 | 68 ms，409 “the history changed: … is not the next undo any more; read it again” | 否 |
| | 陈旧指纹 | 35 ms，409 `history-source-changed` | 否 |
| | 正常撤消讨论 | 183 ms 后出现，允许后讨论消失，提交 `Revert "编辑文稿"` | 是 |
| `redo_document_change` | 没有可重做的目标 | 50 ms，409（同上文字） | 否 |
| | 正常重做 | 185 ms 后出现，允许后讨论恢复 | 是 |
| `revert_document_change` | 不存在的提交 | 27 ms，404 `history-revision-not-found` | 否 |
| | 正常撤消指定提交（讨论） | 182 ms 后出现，允许后讨论移除 | 是 |
| `apply_transcription_adoption` | 未知 planId | 14 ms，409 `adoption-plan-missing` | 否 |
| | 其他草稿版本 | 10 ms，409 `adoption-plan-changed` | 否 |
| | 预检后文稿被改 | 25 ms，409 `document-version-changed` | 否 |
| | 正常采用本机 Whisper 的转写到 `intro--step-0` | 82 ms 后出现，允许后讲稿替换为识别文字并带 `provenance.type: transcription` | 是 |
| `import_workspace_image` | 错误 SHA-256／陈旧指纹 | 13 ms，409 `image-file-changed`／`document-version-changed` | 否 |
| | 正常导入 | 27 ms 后出现，允许后资产已声明 | 是 |

每次允许之后“待确认”入口随即消失。批准出现的时间（25–185 ms）包括检查本身；历史工具约 180 ms，主要是 git 的 merge-tree 与未提交文件检查。

“文稿被改”是在磁盘上切换 `lecture.json` 末尾的空行，字节与指纹随之变化，相当于 Web 或其他工具的保存。

## 发现的问题

- 部分错误仍是英文自由文本而不是错误码：缺失文件的 404 “no file …”、撤消／重做目标变化的 “the history changed: … read it again”。它们本来就如此，本次没有改。
- 转写的启动（`start_transcription`）、配音生成与试听（`start_voiceover`、`preview_voice`）以及取消类工具仍先批准，本次没有改。

## 结构检查

`check-types`、`check-layering`、`check-skills` 通过。未运行测试套件、e2e 或示例完整构建。

## 未覆盖项

没有验证 required review 打开时的拒绝、拒绝与超时（行为未改，见工作台批准记录）、预确认令牌（内置助手）的路径、并发上限，以及 Firefox／WebKit。
