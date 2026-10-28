# 其余 MCP 批准工具先检查、后请求批准；两条英文错误改为错误码

2026-10-28，在分支 `work/mcp-rest-2026-10-28` 上做真实运行验证。[批准前检查记录](mcp-check-before-approval-2026-10-28.md)把写文稿的 operate 工具改成先检查、后批准，但转写的启动、配音生成与试听以及取消类工具仍先请求批准；缺失文件与历史目标变化两条错误仍是英文自由文本。本次补齐这两处。

Studio 从该分支源码启动（`XDG_STATE_HOME=<临时目录>/state node packages/studio/bin/presmium-studio.mjs <工作区> --port 4348 --host 127.0.0.1`），工作区由 `examples/animations/try.mjs` 新准备；启动前载入本机语音配置（Edge 朗读桥 `127.0.0.2:4795`，本机 Whisper `127.0.0.1:4796`）。文稿为“冒泡排序”（`zh-CN`）；为检查英文文本，把“功能导览 02”的 `lang` 改成 `en` 并提交。客户端是官方 MCP SDK（`@modelcontextprotocol/client`）的 Streamable HTTP 连接，令牌取自 serve 的 `server.json`，即未经预确认的进程令牌。批准在 Studio 工作台应用栏的“待确认”中由 Playwright Chromium 回答。没有调用任何模型。

## 改动

- `start_transcription`：`DocumentTranscriptions.checkStart` 与 `start` 共用同一段接纳检查（请求校验与大小、意图重放／复用／已取消、source、音频资产与文件 SHA-256、媒体探测与时长、引擎是否能转写、同一文稿是否已有转写），不建任务目录、不调用引擎。同一意图的已有任务仍可重放。
- `start_voiceover`：`DocumentVoiceAuthoring.checkStart` 走与开始相同的接纳（意图、source、IR revision、范围与步骤绑定、讲稿与音色、音色目录、生成锁），`prepare` 之后立即释放，不合成。
- `preview_voice`：`checkPreview` 核对报价存在、未过期、与请求一致，并重算一次报价与原报价比对（含 source、revision、音色与引擎是否可用），不合成。
- 取消类：`cancel_transcription`、`cancel_voiceover` 先用 `checkCancel` 判断。按 id 查询的未知任务直接 404；任务已结束或已在取消中，直接返回当前状态，不请求批准，也不改变什么；运行中、排队中或按意图预先登记取消时才请求批准。`cancel_build` 同样对已结束的构建直接返回 `already-finished`。
- 批准之后各动作照旧全部重查。
- 错误码：`no file …` 改为 404 `workspace-file-missing`（`detail.path`）；同处的 `not a source path`、`… is not a file this page edits`、`… is not a regular file of the workspace` 改为 `workspace-path-invalid`、`workspace-file-forbidden`、`workspace-file-irregular`。`#planRevert` 的 “the history changed: … read it again” 改为 409 `history-target-changed`（`detail.revision`、`detail.which`）；同处的 `no commit …`（原为 500）改为 404 `history-revision-not-found`，`only an owner reverts …` 改为 403 `history-revert-outside-documents`（`detail.paths`）。
- 文本：MCP 的结构化失败对这些码给出文稿语言（`zh-CN`／`en`）的 `message`，`code` 不变。工作台新增 `historyFailureReasons`，版本历史失败提示按码显示中英文文字（以前直接显示 `history-conflict` 等码）；音频失败把 `workspace-file-missing` 归入“找不到音频素材或原始文件”。

## 实际运行

“出现批准”一列在调用期间每 25 ms、返回后再 600 ms 检查工作台应用栏的“待确认”入口。

| 工具 | 请求 | 结果 | 出现批准 |
| --- | --- | --- | --- |
| `start_transcription` | 陈旧指纹 | 29 ms，409 `document-version-changed` | 否 |
| | 错误 SHA-256 | 28 ms，409 `transcription-audio-changed` | 否 |
| | 不存在的资产 | 23 ms，422 `transcription-audio-required` | 否 |
| | 引擎 `edge`（不能转写） | 32 ms，503 `transcription-engine-unavailable` | 否 |
| | 同一意图换参数 | 17 ms，409 `transcription-intent-reused` | 否 |
| | 已预先取消的意图 | 33 ms，409 `transcription-intent-cancelled` | 否 |
| | 已有转写在运行 | 40 ms，409 `transcription-busy` | 否 |
| | 正常转写导入的 `take-a.ogg`（本机 Whisper） | 77 ms 后出现“agent 工具 start_transcription”，允许后返回任务；约 2 分钟后 `done`，识别结果“5继续往后,越过1和3。” | 是 |
| `cancel_transcription` | 未知 id | 20 ms，404 `transcription-task-missing` | 否 |
| | 已完成的任务 | 75 ms，返回 `state: done`，任务未变 | 否 |
| | 已取消的任务 | 24 ms，返回 `state: cancelled` | 否 |
| | 按意图预先取消 | 81 ms 后出现，允许后 `cancelled`；随后以该意图开始被拒（见上） | 是 |
| | 取消运行中的转写 | 81 ms 后出现，允许后任务 `cancelled` | 是 |
| `start_voiceover` | 陈旧指纹 | 25 ms，409 `document-version-changed` | 否 |
| | 陈旧 IR revision | 29 ms，409 `voice-revision-changed` | 否 |
| | 步骤绑定不符 | 39 ms，409 `voice-step-binding-stale` | 否 |
| | 不存在的页面 | 28 ms，409 `voice-target-changed` | 否 |
| | 同一意图换范围 | 62 ms，409 `voice-intent-changed` | 否 |
| | 已预先取消的意图 | 14 ms，409 `voice-cancelled` | 否 |
| | 正常生成 `intro--step-0`（Edge 朗读） | 78 ms 后出现“生成配音「intro」”，允许后作业 `done`（1/1），该步状态由 `missing` 变为 `ready` | 是 |
| | 等待批准期间文稿被改，再允许 | 409 `document-version-changed`，没有为该意图建立作业 | 是 |
| `cancel_voiceover` | 未知 id | 17 ms，404 `voice-job-unknown` | 否 |
| | 已完成的作业 | 12 ms，返回 `state: done` | 否 |
| | 已取消的意图再取消 | 31 ms，返回 `state: cancelled` | 否 |
| | 按意图预先取消 | 83 ms 后出现“取消配音「voiceover-intent-0002」”，允许后 `cancelled` | 是 |
| | 取消运行中的整篇生成（8 句） | 25 ms 后出现，允许后 `cancelling`，随后 `cancelled`（完成 1/8） | 是 |
| `preview_voice` | 伪造的报价 | 28 ms，409 `voice-preview-changed` | 否 |
| | 换了音色（与报价不符） | 15 ms，409 `voice-preview-changed` | 否 |
| | 陈旧指纹 | 20 ms，409 `document-version-changed` | 否 |
| | 正常试听 `zh-CN-YunxiNeural` | 33 ms 后出现“试听音色「zh-CN-YunxiNeural」”，允许后返回资源，读出 `audio/ogg` | 是 |
| `cancel_build` | 未知作业 | 36 ms，404 `job-not-found` | 否 |
| | 取消运行中的网页构建 | 100 ms 后出现“取消构建（web）”，允许后 `requested`，随后 `cancelled` | 是 |
| | 已取消的构建 | 12 ms，返回 `already-finished` | 否 |

每次允许之后“待确认”入口随即消失。改动前的一次运行里，`cancel_transcription` 对一个实际仍在运行的任务请求了批准，无人回答，约 50 s 后返回 403 `operation-not-allowed`，行为与原来一致。

“文稿被改”是在磁盘上切换 `lecture.json` 末尾的空行，相当于 Web 或其他工具的保存。

## 新的错误文字

MCP 结构化失败（`code` 不变，`message` 按文稿语言）：

| 码 | 文稿 | `message` |
| --- | --- | --- |
| `workspace-file-missing` | 冒泡排序（zh-CN），`import_workspace_audio` 与 `inspect_workspace_audio` | 找不到文件「bubble-sort/none.ogg」，请检查路径或先把文件放进工作区。 |
| | 功能导览 02（en） | There is no file “guide-steps/none.ogg”. Check the path, or put the file in the workspace first. |
| `history-target-changed` | 冒泡排序，`redo_document_change` | 版本历史已变化：efa0684… 不再是下一个可恢复的更改。请重新读取历史后再试。 |
| | 功能导览 02 | The version history changed: d89ca01… is no longer the next change to redo. Read the history again and retry. |
| `workspace-file-forbidden` | 冒泡排序，引用另一文稿的文件 | 「guide-steps/lecture.json」不属于这份文稿，不能在这里使用。 |
| | 功能导览 02 | “bubble-sort/take-a.ogg” does not belong to this document and cannot be used here. |
| `workspace-path-invalid` | 冒泡排序，`../x.ogg` | 「../x.ogg」不是有效的工作区路径。 |

以上调用都没有出现批准请求（17–84 ms，另一次英文 `redo` 617 ms）。

工作台：导入音频的资产文件在磁盘上被改、尚未记入版本时，在版本历史中点“撤消此更改”，提示条显示：

- 中文界面：“没能完成：这次更改之后，相关内容又被修改过，或有尚未保存进版本的修改，无法自动撤消。”
- 英文界面（浏览器语言 `en-US`）：“Couldn't finish: The content was changed again after this change, or has changes not yet saved as a version, so it cannot be undone automatically.”

改动前同一操作显示“没能完成：history-conflict”。

## 发现的问题

- `start_transcription` 指定一个不能转写的引擎时返回 503 `transcription-engine-unavailable`，MCP 因此标记为可重试的 `tool-failed`；这其实是请求错误，原来如此，本次没有改。
- 本机 Whisper 识别 2.7 s 的音频约需 2 分钟，期间同一服务的其他请求排队。
- `build` 仍先批准、后核对 source 与目标，本次没有改。

## 结构检查

`check-types`、`check-layering`、`check-skills` 通过。`packages/workspace/test/source.test.ts` 中匹配旧英文文字的一条断言已删除。未运行测试套件、e2e 或示例完整构建。

## 未覆盖项

没有验证预确认令牌（内置助手）的路径、required review 打开时的拒绝、Firefox／WebKit、工作台亮暗色与窄屏（本次只改提示文字，没有改样式），以及 `history-revert-outside-documents` 的实际触发。
