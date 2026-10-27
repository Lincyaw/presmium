# 相同版本再次编译后的播放器加载

2026-10-28，基于 `47acebe5` 的独立 worktree，修复 Video 连续准备相同 source/IR/plan 后播放控件一直 disabled 的问题。复用中文真人转写流程已经生成的同一个后端、实际缓存和计划，**没有新增 ASR/TTS**。

## 原因和改动

真实 before 中，初次 prepare 已发出 production `load` request 1；作者点击现有“编译预览”后，`preparePresentation` 先暂停运行时，child 对 request 1 返回 `production-playback-cancelled`。父随后释放旧请求，发送 pause request 2，child 返回 `production-playback-unavailable`。同一 source/IR/plan 没有改变原 load effect 的依赖，之后 20 s 没有新的 load，Play 始终 disabled。这个反例不是模型、缓存或中文解析失败。

`ProductionPanel.tsx` 只改两个位置：编译期间不启动 load；将既有 `preparing` 状态纳入 effect 依赖。编译结束后，effect 对当前 binding 重新发送正常 load。没有计时重试、伪造 ready、放宽 source/plan 校验或新增内容 writer。

## 实际验证

新私有前端从修改后源码独立构建，接回原后端 PID 4006192、相同 origin 37161。旧前端 PID 4006435 在确认属于本任务后停止；没有重启后端、复制任务或重新生成音频。

定向消费者 9/9：

- 同一 source 连续两次 prepare 后收到当前 binding 的真实 load ACK，Play 恢复。
- 实际播放超过 500 ms，等待真实 pause ACK 后，时钟在后续 12 个原生动画帧不变。
- Playwright 只挂起真实 backend HTTP 200 preview 回执；作者返回正文、切换到另一私有文稿后才释放。旧回执没有恢复旧文稿或打开 Video。
- 新文稿配置一个确实不存在的插件，制造真实编译失败。错误反馈保留，transport 继续 disabled、暂停，没有采用旧文稿 binding。
- 原中文 canonical 和原音没有改变。专用 relay 的总计仍为 ASR 2、TTS 1；这是原验证的累计值，本修复增量为 0。
- 起止 27 份源码 SHA 一致；没有 browser exception。缺插件是实际编译诊断失败，界面保留错误反馈；本轮观察到的 HTTP 没有 4xx/5xx，不能因此称编译也成功。

before 在 `chinese-audio-voiceover/.presmium/chinese-audio-20261028/compile-race-observe.json`，原中文流程的失败 raw 亦保留。after 在本 worktree `.presmium/production-prepare-load/result.json`，附实际 parent/child 协议、每份 binding、两张截图和独立清理记录。没有新增测试文件，也没有运行测试套件或公开工作台。

轻量检查为 types 1,245 files 与 diff check 通过。新前端 owner、前端、浏览器和 esbuild 的记录 PID 均已实际退出，临时 home、私有故障文稿和 handoff 已删除；随后原 owner 关闭原后端及 relay，并停止删除两个本任务 CPU 容器。原始中文冻结证据与保存材料不变，整体清理见中文 worktree 的 `cleanup-final.json`。
