# MCP 音频导入与 Web 同源资产验证（2026-10-27）

本记录验证 agent 从文稿内已有音频文件读取真实元数据，经 MCP 导入同一个 canonical 资产，再由真实 Studio 选择、检查和复用。文件读取、资产保存与 ASR 可用状态分别核验，不把导入成功当作转写、配音或运行预览成功。最终组合真实 37/37 通过；下列原始失败与修复因果分别保留。

## 环境与操作边界

全部命令在隔离 worktree `.presmium/worktrees/audio-authoring-mcp` 运行。消费者 `.presmium/audio-mcp/consumer.mjs` 使用公开 `startStudio` helper，构建自己的隔离客户端，启动真实 workspace 服务与 DeepSeek Harness；Chromium 通过原生页面操作和官方 MCP client 访问同一临时文稿。没有模型、ASR、TTS 或外部服务调用，没有新 tracked tests，也没有运行测试套件。没有修改公共 4320／17407 服务或作者文稿。

素材是本地生成的 2 秒、48 kHz、单声道 PCM WAV。MCP 主线先调用 `inspect_workspace_audio`，将其返回的 `file` 对象原样传给 `import_workspace_audio`；独立磁盘 SHA 仅用于读后核验。麦克风兼容路径使用 Chromium 受控输入与真实 MediaRecorder，不代表真人录音验收。

`server.json` 的 MCP token 通过官方客户端真实连接；同一 token 用作 HTTP launcher token 实测 401。文稿绑定 token 来自真实授权路由。记录只保存字段存在性、请求路径和来源哈希，不记录 token、授权 URL 或凭据环境变量。脚本、日志、JSON 与截图权限为 0600。

## 最终组合结果

最终 `.presmium/ui-evidence/audio-mcp-authoring.json` complete=true，37/37 通过：前 26 项旧 Web／MCP 主线、root 空目录及同文稿权限 5 项、故障 pass 分界 4 项、外网／提供方与浏览器异常检查 2 项。48 次 MCP 工具调用使用真实服务。pageerror 为 0，浏览器外网请求为 0。浏览器 HTTP 记录包含 1 次**预期 409**，来自丢 ACK／Undo 后旧 File intent 的版本拒绝，随后新 intent 同 base CAS 成功；不声称所有 HTTP 都是 2xx。

最终 sourceSHA 与 sourceSHAEnd 全部一致，其中 factory `46111a18…`、writer `52dcf283…`、SourceEditor `d5d9cc78…`。消费者还记录 kernel 契约／validator、MCP 工具／目标解析、serve／routes、ServerHost／McpHost 与 Workbench 的完整 SHA。

root fixture 同时使用 `lecture.json` 与 `*/lecture.json`。显式 `document: ''` 返回 root UUID；root 原文件预检和实际二进制＋JSON 导入成功，sibling 预检与导入仍为 403，没有使用 Home 权限。普通 Doc 的故障插件主线在音频操作、打开文稿、正文实际保存时都没有 pass marker；随后显式 `get_diagnostics` 才执行真实失败 pass，音频能力仍可读取。

第 9 项由真实页面 DOM 验证：制作面板选择的是 MCP 新增的同一音频，存在“尚未配置转写服务。”，转写按钮禁用。`audio-mcp-authoring-web-asset.png` 已实际查看，但只记录制作面板上半部，ASR 选择器位于视口下方；该图不作为 ASR 状态的视觉证明。麦克风回归保存的是原生 MediaRecorder 的 WebM／Opus 原文件；真实 dataavailable／stop 事件和所有 tracks 的 ended 状态均已记录。

最终 cleanup 的客户端关闭、浏览器关闭、临时 home／workspace／fixture 删除全部为 true。公共服务、主工作区源码与作者文稿均未改动；只在隔离 worktree 写消费者与本记录。未执行测试套件。

## 初次端到端记录

`.presmium/ui-evidence/audio-mcp-authoring-before-doc-watch.json` 保留 27 项成功及第 28 项真实失败。前 27 项覆盖：

| 路径 | 实际核验 |
| --- | --- |
| MCP 原文件读取与导入 | 真实 SHA／长度／媒体时长；预检不分配资产 ID；导入回执、规范文稿、原二进制与 schema 一致 |
| Web 与 MCP 共用资产 | 制作面板选择同一资产；MCP 与 HTTP inspection 一致；没有 ASR 配置时准确显示 unavailable，转写按钮禁用 |
| 权限与版本 | 隐藏文件、跨文稿、符号链接、路径穿越、禁目录旧回执、变更内容／来源均拒绝，资产数量不增长 |
| 幂等与事务 | 同 intent 返回同资产／commit；真实 git index.lock 导致失败时文稿、二进制、index 和 HEAD 回滚 |
| 异步归属 | beta 的真实回执被持有时，alpha 的后续正文仍保存；释放旧结果不覆盖当前文稿 |
| 旧 Web 上传兼容 | 原生 FileInput、受控麦克风原 File 继续走真实 multipart API，资产可读、tracks 结束，不隐式创建 clip 或 Narration |
| 丢 ACK 与 Undo ABA | 真实 HTTP 已提交但响应中止，Undo 回精确旧版本后，同一个 File 的旧 intent 得到特定 409，再以一个新 intent、同一 base CAS 重试成功 |

ABA 记录保留 FileId、请求 id、baseDocumentVersion 与次数：同 File 共 3 次上传，前两次同 id，第三次新 id，三次 base 相同。没有跨版本 rebase，也没有将任意未知失败自动重试。

第一次消费者还保留 `audio-mcp-authoring-initial-commit-shape.json`：错误地把公开的 `commit: Revision` 当字符串比较，导致观察器失败；后续改为 `commit.id`。该记录不算产品缺陷或完整成功。

## Doc 打开触发编译的独立因果记录

第 28 项失败是打开纯 Doc 后，尚未显式请求编译就执行了真实故障 pass。独立消费者 `.presmium/audio-mcp/doc-compile-diagnosis.mjs` 与 `audio-mcp-doc-compile-diagnosis.json` 将操作分开：

1. MCP 能力、原文件预检、导入与资产检查返回后，静置 1.5 秒没有 pass marker。
2. 仅打开 Studio 首页并停留 1 秒，仍没有 marker。
3. 打开该 Doc 后，首个完整编译在正文输入前发生。此时没有 IR、IR events、preview 或 voice-catalog 请求。
4. 正文输入后第二次编译是已建立文件 watcher 的后续行为；正文仍真实保存，但不能据此称 Doc 已脱离编译。

公开 Network initiator 记录显示 `openDocument` 同时发出 `/revisions`、`/changes` 与 `/review`。这些请求比首个编译日志早 14 ms。`ServerHost.routes` 当时只登记文稿编辑、音频和转写路由；未登记的历史／审阅请求在 server dispatch 中回落至插件 mount，随后调用 `CompileSession.ready()`。`authoringServices` 则直接调用独立 Compiler 的 `nodeServices()`，不创建 CompileSession；其同步能力不是这次编译的触发点。

诊断只读取公开浏览器事件和服务日志，没有改产品代码。该次原始记录 complete=true，表示诊断采样结束；并不表示问题已修复。源码哈希前后一致，pageerror／HTTP failure 均为空，全部私有资源已清理。

修复将完整 workspace routes 由宿主创建一次，compiled plugin 只借用同一张路由表，保留原 role、body 限制与 launcher token；子 mount 不关闭共享 owner。`audio-mcp-doc-compile-after.json` 独立 3/3：MCP 后、首页、Doc 挂载及正文实际保存都不执行 pass；显式 `get_diagnostics` 才运行真实故障 pass，诊断仍可读。该次 pageerror／HTTP failure 为空，源码前后一致，私有资源全部清理。

## root 文稿与路径归属的增量反例

`audio-mcp-authoring-root-own-refusal.json` 是后续组合记录：旧主线 26 项再次成功，显式 `document: ''` 正确读取 root 文稿为第 27 项，但 root 自己的 `raw/tone.wav` 预检被 403 拒绝，消费者在该调用停止。该记录不是完整成功。

其 fixture 同时声明 `lecture.json` 和 `*/lecture.json`。当时 `documentDirOf` 只按 glob 推算文稿目录，把并无 `raw/lecture.json` 的 `raw` 当成文稿归属；收紧后的 root 文稿 scope 因此拒绝自己的普通文件。先前只声明 `other/lecture.json` 的工厂样本没有覆盖这个配置，不能替代该反例。最终 writer 将实际 owner 与 prospective 创建分开：普通文件优先归属最近的真实 canonical 文稿，显式新 entry 与没有 actual owner 的新建路径仍保留创建语义。最终组合的 root 5 项已闭环；独立工厂 `document-owner-boundaries-after.json` 另记录 12/12，包括真 git 失败回滚、named template、媒体 copy 与 future 文件创建。

`audio-mcp-authoring-route-parse-before.json` 另保留第一次组合启动时的 TypeScript 条件箭头解析错误，0 项业务检查；修正单箭头后上述消费者才实际启动。没有把该次启动失败算作业务验收。

## 范围限制

独立公开 MCP 读取消费者 `audio-root-mcp.json` 另通过 8/8：多文稿中显式空目录选择根文稿，根文稿能力和原音检查对应真实 source，跨文稿读取拒绝，绑定其他文稿的 token 不能把显式空目录当作省略参数，省略参数仍正确采用 token 归属。两份 canonical 文稿字节不变，七份相关源码 SHA 前后一致；客户端、服务和临时目录全部清理。该消费者没有浏览器、写入、编译或提供方调用。

没有可用 ASR 引擎，因此没有真实转写候选、字幕采用或人声转 TTS 成功声明。此处只核验其真实 unavailable 状态。进程内导入回执不等于跨重启持久幂等；媒体、路径与版本的完整契约见 [音频作者契约](../audio-authoring.md)。没有把文稿保存回执当作编译、播放或导出验证。
