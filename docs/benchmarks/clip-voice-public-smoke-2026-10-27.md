# Clip 与语音发现公共只读 smoke（2026-10-27）

公共 4320 部署 `6e3efc53148200621d279dc3682345ebe2ccc07e` 后，新只读消费者 12/12 通过。此次只确认新增工具、真实能力反馈与 Doc 不依赖编译，没有执行任何 apply、clip change、导入、录制、转写或合成。11 份 canonical JSON 字节均未变。

## 来源与运行方式

部署记录为 `.presmium/ui-evidence/live-clip-voice-deployment-6e3efc53.json`：固定提交的标准客户端构建与受控部署成功，184 个客户端输入、11 份作者文稿 SHA 不变。本 smoke 从 main 读取实际源码与主依赖，没有使用隔离 worktree 的未提交源码。23 份本提交涉及的 TS／TSX 源码逐项与 `git show <commit>:<path>` 的真实字节匹配，并在验收前后保持一致。

标准构建归档 9 个包、515 份源文件，客户端 2,911,069 字节；相较本轮开始时 `08548380` 的 2,910,408 字节增加 661 字节。这是固定提交产物的大小比较，不代替浏览器加载或播放性能测量。

消费者为 ignored `.presmium/live-clip-voice-smoke-6e3efc53.mjs`，结果为 `.presmium/ui-evidence/live-clip-voice-smoke-6e3efc53.json`。它连接真实官方 MCP client，使用已有的受控 Studio session 打开 guide-authoring，通过实际 Studio GET 代理读取语音能力和目录；只创建并关闭自己的客户端与浏览器。日志与 JSON 为 0600，不输出 token、完整授权 URL 或凭据。

## 实际结果

| 检查 | 结果 |
| --- | --- |
| 真实 MCP 工具清单 | 出现 clip3：read_production_plan、validate_media_clip_change、change_media_clip；voice2：get_voice_authoring_capabilities、get_voice_catalog。只列出 change 工具，未调用 |
| 语音能力 | guide-authoring 返回实际 source、configuration-only、engines=[]、unavailable／not-configured；VOICEOVER／preview 标记为已安装实现，不表示提供方或任务服务已成功 |
| 目录反馈 | MCP 与 Studio 的 voice-capabilities、voice-catalog 两个 GET 响应完全一致，绑定同一已保存 source，目录没有引擎时明确 unavailable |
| source-only 计划请求 | 仅提供 source 的 read_production_plan 被 Schema 受理，真实缺 IR 时返回 503／tool-failed，message=production-document-unavailable，没有偷偷编译 |
| 移除预检 | 对不存在 clip 的 validate_media_clip_change，只提供 source＋removeClipId，返回 404／document-media-clip-missing；不要求 plan，不调用媒体提供方，不写入 |
| 未启用音频的文稿 | guide-content 的 inspect／inspectWorkspace／importWorkspace 均为 false，validateClipChange=true、clips.remove=true。没有错误地要求新增动作也全部为 false |
| 普通 Doc | 一个可编辑原生 BN、完整 7 页，没有进入 Video，没有 IR、IR events 或 preview 请求 |
| 保存与资源 | 23 项运行源 SHA、11 份作者 JSON SHA 前后相同；浏览器异常、HTTP failure、写入、提供方请求与外网请求均为 0；客户端和浏览器已关闭，公共服务保留 |

实际发生 7 次只读 MCP 工具调用，503 与 404 是预期的结构化业务拒绝，MCP transport 正常。没有把工具可见性或配置状态算作配音、播放或导出成功。

## 不编译的证据边界

普通 Doc 打开前后的诊断快照都是 version 0，浏览器没有请求 IR／preview。诊断版本独自不能证明没有零诊断编译，因此另读取当前受控启动日志，保留 `.presmium/ui-evidence/live-clip-voice-smoke-log-6e3efc53.json` 的字节数、SHA 与计数，不复制包含授权地址的日志正文；本次日志中实际没有任何 `[compile]` 项。

更强的故障 pass 因果、source 变化、共享目录取消与媒体事务等仍分别以[音频 MCP 私有验收](audio-mcp-authoring-2026-10-27.md)及对应私有记录为准，没有重跑其 37／13／14 项链。

## 保留的验收范围

本提交没有布局 CSS 改动，没有重复截图四组合；既有外观证据见[前次公共只读验收](audio-mcp-public-delivery-2026-10-27.md)的 14＋4 项记录。本次没有触控、性能、真实提供方 ASR／TTS 或 clip 写入验收声明，没有运行测试套件。公共缺 IR 的计划拒绝仍准确保留，不能冒称真实计划／播放已经准备。
