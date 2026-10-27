# Web 观察共享配音任务

本片基于 `bfbf30e0`，其中包含配音任务 owner `445390b5` 和缓存 profile 修复 `2d812670`。源码在隔离 worktree `voice-task-owner` 中修改，没有操作公共 4320、17407 或作者文稿。

## 行为与边界

Video 面板与配音对话框借用 Workbench 持有的同一个任务观察器。观察器每秒读取一次轻量 `voiceover/jobs`，无论任务来自 Web 还是 MCP。空闲读取不编译、不装配目录、不生成音频、不暂停播放。完整 voiceover 状态只在打开或显式重查对话框、或已知任务 id/sequence 变化时读取。

列表响应按真实 sequence 合并。本次读取开始后刚收到的本地 ACK 可以暂时保留；下一次权威列表仍没有该任务就移除，避免服务重启后留下永久“运行中”的记录。最后一个借用者离开或文稿关闭时，统一清理 timer、请求和待处理记录。晚响应不能写入新的文稿 scope。

终态任务实际 `completed > 0` 后，刷新要同时满足 canonical source、IR revision 与 presentation project 当前，没有未保存输入、composition、恢复冲突、待采用的 timing draft 或活跃录音。录音门槛包含 requesting、recording 和 stopping。暂时不满足时保留待处理项，下次读取重新守卫；不会保存或丢弃作者输入。当前 production plan 为空时等待 Video 原有的显式准备流程，观察器不代为构建。

守卫通过后只读真实 cacheOnly production plan。planId 相同时不重复刷新。回调还绑定读取开始时的完整 ProductionBinding；读完或等待暂停期间若另一个操作已经更新计划，则保留待处理项，不用较早的响应覆盖新计划。实际 planId 变化才停止试听与文稿输出、等待预览暂停 ACK，再次检查版本和录音门槛，替换当前计划并刷新预览；不会自动播放。被动停止使用 `stopPreviewOutputs`，不会调用会结束麦克风的 `stopAuditions`。对话框关闭时仍只取消自己拥有的任务。

## 验证记录

六份运行源码的精确 SHA 在私有 `.presmium/ui-evidence/voice-observer-source-manifest.json`。首轮类型检查发现新类参数属性不符合 `erasableSyntaxOnly`，保留在 `.presmium/voice-observer-types.log`；改成显式字段后，`.presmium/voice-observer-types-final.log` 为 `types ok: 1223 files`。独立审查补充完整 plan binding 的晚回调守卫后，`.presmium/voice-observer-types-reviewed.log` 仍为 1223 文件通过；原 manifest 另存 `voice-observer-source-manifest-initial.json`。`check-layering.mjs` 与 `git diff --check` 通过。

第一次私有组合启动在 Chromium module namespace 的 bootstrap import 处失败，0 checks、0 次模型调用。原结果保留于 `.presmium/voice-mcp-web-feedback-1793097264051/result.json`，其资源已清理；只修消费者 import 后，以最新六源 SHA 重新启动下述正式旅程。该失败不计入通过项。

以下 20、5、9 项来自三次独立运行，各自保留结果与边界。真实组合消费者在同一私有 Workspace owner、Studio 和官方 MCP client 中通过 20/20 项，冻结结果是 `.presmium/voice-mcp-web-feedback-1793097419059/core20-frozen.json`。先打开空闲生成对话框，再由 MCP 发起任务；界面直接显示运行与完成，关闭后自动取得可播计划。MCP 计划、试听资源与新 profile 音频的 key/SHA 一致，canonical 与原音频不变。实际转发 1 次免费本地 Kokoro TTS，0 次 ASR；后续试听及四种主题/窗口组合没有再次生成。1440 与 390 宽度的亮、暗色均可播，没有页面横向或纵向溢出。20 份运行源码在该旅程中保持 SHA 一致，其中六份为本片改动。

同 owner 的 `play-500ms-counter.json` 补充通过 5/5 项：实际播放达到 589 ms 后暂停，随后 16 个原生 animation frame 中的 8 次采样均停在 657 ms，字幕与 canonical 讲稿一致，没有新增模型调用或 HTTP/浏览器错误。

录音保护另由 `.presmium/voice-observer-recording-guard.mjs` 消费同一后端，通过 9/9 项，结果在 `.presmium/voice-observer-recording-guard-1793097655039/result.json`。先备份并暂移本次真实 profile 缓存的 JSON/Opus，让新浏览器取得实际缺缓存计划并发现旧 done；然后通过 DOM 开始原生 `getUserMedia`/`MediaRecorder` 录音。输入是实际 JFK WAV 经 Chromium 的 fake-audio-capture 设备，不能视为物理麦克风验证。

原样恢复缓存后，MCP status 确认当前单元 cached=1 才用新 intent 启动真实缓存命中任务。任务完成 sequence=4 时，录音仍在 00:01 增长，native stop 为 0，iframe 与 ready 计数不变，Play 继续禁用。手动停止后才自动从缺缓存 plan `a0b6bf1d4c50a0c819cffe773ba4fa7f` 更新到可播 plan `91d158e222ec7affcb23c5d3086d3ee9`。实际 retained candidate File 为 17,899 bytes，SHA-256 `f2e050a400a652afed2490f2ea97a1f4c206c290b279bc6f31fb492799438ea5`，与原生 MediaRecorder chunks 一致，没有导入或改写 canonical。前后提供方计数均为 TTS=1、ASR=0；六份本片运行源码 SHA 稳定，HTTP/浏览器错误均为 0。

录音消费者自己的 browser/client 已关闭，缓存 bytes、mode、mtime 在 finally 恢复；共享 backend/relay/CPU 容器留给组合消费者统一清理。两张录音截图分别记录任务完成时仍在录音，以及手动停止后候选保留且当前计划可播。没有新增 tracked tests，没有运行测试套件；本片实现者没有发起模型调用或启动提供方。纯文档 HEAD 后续推进到 `ed1a909d`，六份运行源码字节未变。
