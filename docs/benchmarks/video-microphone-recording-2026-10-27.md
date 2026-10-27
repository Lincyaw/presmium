# 视频制作中的原音录制

2026-10-27，在独立随机端口、临时文稿和隔离客户端的真实 Studio 中操作浏览器 `getUserMedia`、`MediaRecorder`、原音试听和文稿音频事务。没有修改公开服务或作者文稿，没有调用模型、ASR、付费合成或外部媒体服务，没有新增受版本控制的测试或运行测试套件。

浏览器使用 Chromium 官方的受控音频设备与权限界面开关。录音数据由原生 `MediaRecorder` 产生，原生 start、dataavailable、stop 事件及音轨状态均已记录；没有构造音频流、录音事件或成功回执。这验证媒体链，**不代表真人麦克风实录或真实设备权限对话框验收**。

## 作者操作和保存边界

录音卡片只出现在 Video。开始录音先暂停既有播放和试听；停止立即释放音轨。原音候选可以试听、重新录制、明确保存或放弃。放弃操作使用公共确认对话框，已经保存的素材不受影响。原有“导入音频”继续可用。

候选按真实工作区与文稿身份保存在内存中，切步、返回 Doc 和重新打开同一文稿不生成另一份录音。切换目标、源版本、离开录音视图或取消许可会停止录制；迟到的设备授权立即释放音轨。重新录制失败或取消时，旧候选保留。

保存复用现有 Workbench 文稿音频导入及原子二进制事务，先排空正文草稿，再绑定实际身份与源版本。服务端仍探测真实媒体和字节上限。丢失回执的重试会比较候选 SHA，并读取已有素材的实际 inspection SHA，确认是同一份原音才复用；不只相信 canonical 中声明的 fingerprint。

本片没有自动创建 MediaClip、Narration、转写或 TTS，也没有将录音假装成已支持的 recording VoiceSource。保存后的音频资产可由独立的转写选择器读取。

## 公共界面与设计

实施前实际读取 P22、I06 的转写待采用图层 `41:742`、I09，以及正式 MediaClipEditor 组件；新增 `Presmium/AudioRecording` 组件集 `221:5101`，位于 02 控件页。Idle、Requesting、Recording、Ready、Importing、Failed、Unavailable、Imported 复用既有 ButtonCompact 实例和令牌。Ready `221:4992` 的最终截图已读取并查看，含试听、保存、重新录制和放弃候选。

运行实现复用 `PmCard`、`PmButton`、`PmNotice`、`PmDialog` 与既有 `Audition`，业务 CSS 仅负责布局。显示的录制秒数是候选录制过程提示，不充当讲授时钟或服务端精确媒体时长。

## 真实证据

原始脚本、JSON、图片和脱敏日志在忽略目录 `.presmium/`，权限为 600。各消费者记录自己的源码 SHA；后续源差分与失败记录分开，不把中间态截图称为最终整链通过。

| 记录 | 已证实范围 |
| --- | --- |
| `audio-recording-browser-final.json` | 16 项通过后在原生 iframe reload 后的播放恢复处超时，complete=false。含取消迟到许可、真实 WebM/Opus 候选、试听、真实上传失败重试、原字节 SHA、四种主题/宽度录制保存，以及录音跨被动 frame ready/load 继续 |
| `audio-recording-touch.json` | 7/7 complete；390、真实 hasTouch 上下文、亮暗录音保存；coarse=true、四个操作均高 44，既有原生 FileInput 导入真实 WAV 仍成功 |
| `audio-recording-boundaries.json` | 当前记录保留 9 项成功后的旧返回按钮定位超时。主动播放、切步、真实源版本变化、输出视图切换均释放设备；已有试听实际时间前进后录音可暂停它；服务真提交后挂起 ACK、取消与重试仍只有一份素材 |
| `audio-recording-identity.json` | 7/7 complete；返回 Doc 再进 Video 保留原候选；真提交后持有 ACK 并切换文稿，旧回执不绑新文稿；同身份重开及重试核验并复用唯一素材；设备已授权但结果迟到时切文稿，全部迟到音轨释放且新文稿不进入录音 |
| `audio-recording-generation.json` | 4/4 complete；取消旧许可并先开始新 take，再释放旧设备授权，旧音轨结束而新 take 仍 live；真实时间线定位到 1.250 秒会停止录音、保留原音，并收到播放器确认 |
| `audio-recording-source-retry-after.json` | 5/5 complete；公共 ensure 方法下，真实断连后保存新的文稿，再保存同一份原 File 返回 200，只产生一个真实音频素材 |
| `audio-recording-broker-ensure.json` | 新调用 9/9 complete；实际试听进度、主动 play／step、真实 source 更新和输出视图切换，以及真提交但丢回执后的唯一素材复用 |
| `audio-recording-identity-ensure.json` | 新调用 7/7 complete；复核旧回执不绑其他文稿、同身份原音重开与复用、迟到授权清理 |
| `audio-recording-aba-before.json`、`audio-recording-aba-after.json` | 原版两个“导入后 Undo 到同一原始版本”分支均返回 409；最终 after 10/10 complete，同 File、同 base 可再次明确保存，丢回执分支仅一次已知旧 receipt 409 后重试 |
| `preview-reload-activity-after.json`、`preview-pool-boundaries.json` | 独立播放生命周期消费者分别 11/11、10/10 complete；两次真实保存后录音跨原生 reload 保持，当前代次活动 ACK 后加载，实际播放、暂停、跳步与设备释放；另核 park／unpark 和不支持 activity 的公开协议分支 |
| `audio-recording-dispose-before.json`、`audio-recording-dispose-after.json`、`audio-recording-dispose-active.json` | 公开 Workbench 与原生录音的 owner 销毁窄验证；原版 6 项中 3 项失败，after 6/6 与 active 4/4，候选／许可／录制中销毁均清理资源 |

四种宽度/主题截图与两张 coarse 截图均已逐张查看。窄屏按钮自动换行，没有横向溢出。录音保存的 Node inspection 显示真实 Opus、48 kHz、单声道与原始二进制长度；候选字节 SHA 和磁盘原始文件一致。

## 已定位的真实失败

初版将录音注册成普通试听。前一笔素材保存后的后台编译触发 `Workbench.handlePreviewReport`，经 `stopAuditions` 在 306 ms 后停止了下一次录音，仅留下 245 bytes。`audio-recording-passive-before.json` 保留原生停止调用栈和失败记录，不能把它归为正常录制完成。

公共 broker 随后增加独立 capture owner。被动 ready、updated、detach 和计划 load 只停止旧播放输出；作者主动播放、跳步、试听和目标切换仍停止录音。原“保存后立即重录”序列没有增加等待 ready 的延迟，四种宽度/主题均实际录制保存。主动互斥另由原生音轨和真实播放器状态核对。

直接执行真实 iframe `location.reload()` 后录音能够继续，但生产播放控件持续不可用的原失败另行保留，不能用录音继续证明播放器已恢复。独立 `preview-reload-activity-diagnosis.json` 确认来源与 IR 均一致，问题是旧的 active 确认被带入新 iframe；实际新窗口尚在恢复时，父级就已尝试加载计划。

公共预览池随后将重载后的 active 设为未确认，等待同一代次的活动 ACK 才重新附着；过期请求与回调不能销毁新窗口。独立最终 after 11/11 验证实际播放器恢复与原生 Mic 生命周期，边界 10/10 验证缓存帧及无 activity 协议。两份记录的预览池 SHA 均为 `9841d3451a20cfde1be30fe516ce896d17047ca0baf24e0103823870270c2f87`，没有把最初 complete=false 的录音记录改写成完整通过。

初次 headless 配置只有 fake-device 时，真实 getUserMedia 返回 NotSupportedError。独立空白网页也相同；同时使用 Chromium 公开 fake-device 与 fake-ui 开关后才得到真实受控流。`audio-recording-plain-browser.json` 保留该配置对照。fake-ui 会覆盖权限拒绝设置，因此没有把这组环境声称为真实拒绝权限验证。

边界消费者曾在异步播放 ACK 到达前立即查询“暂停”按钮，产生一次 false；同轮截图实际已显示播放头 29 ms 与暂停状态。原记录 `audio-recording-boundaries-early-ui-oracle.json` 保留，后续消费者等待真实播放状态，没有修改产品来迎合该断言。

`audio-recording-source-retry-before.json` 另确认一项保存窄窗：第一次上传在写入前真实断连，作者随后以真实 CAS 保存了新的文稿版本；实际计划请求已读取该新版本后，再保存原 File 仍返回 409，素材保持 0。来源是共享导入方法保留了首次请求的旧 base。首版消费者错误等待 appbar 的列表标题更新，原超时单独保留为 `audio-recording-source-retry-title-oracle.json`，没有用它证明产品失败。

公共 `ensureDocumentAudio` 随后统一对账：先以真实 inspection 确认同 SHA 的已存素材；当前源已不同且实际没有该素材时，才为这次明确保存建立新 CAS 意图。录音组件删去了私有 hash／对账逻辑，只消费实际 inspection，未伪造提交回执。新调用分别完成 source-retry 5/5、broker 9/9、identity 7/7；旧四组合的布局、原生录制证据仍按其原 SHA 保留，不冒称它们执行了新的公共调用。

另以真实 Studio、原生录音和公开 `history/undo` 核实 ABA：成功导入或真提交但丢回执后，Undo 均恢复完全相同的原始 base 与磁盘字节；同一个 File 再保存都被旧 receipt 拒绝。`audio-recording-aba-before.json` 的 complete 仅指两个分支执行结束，两个业务断言均失败，不能当作产品通过。

最终共享方法在确认完整成功后只清除对应 File 的请求意图。旧未确认意图遇到明确的 `409 document-version-changed` 时，只有 map 仍归该请求、信号未取消、当前预期源完全相同且干净，才以同一 expected CAS 建立一个新意图重试一次。普通分支的两次 POST 使用相同 FileId、新 request.id，最终只有一个素材；丢回执分支共三次 POST，同 FileId，旧 id 恰重放一次 409、新 id 恰提交一次 200。没有跨版本重基或重试未知失败。最终 after 10/10 为 0 前端异常，但含上述预期的一个 HTTP 409，未称全请求无错误。首轮 after 过早读取首个 409 的观察器记录独立保留为 `audio-recording-aba-after-early-response-oracle.json`；最终等待真实 UI 保存或失败终态。

## Workbench owner 的销毁

普通切步、切文稿与返回 Doc 仍保留候选。Workbench 整体销毁是另一条生命周期：原版虽然能停录音，却没有移除 controller 自己的 window beforeunload 监听器；已无可达界面的 File 仍被该监听器持有。真实 before 中，一个原生候选在两次 `Workbench.dispose()` 后仍有 File 和一个监听器，同 owner 查询仍得到旧 controller，旧 controller 还能请求另一个设备。原有迟到许可轨道清理已经通过，未冒称该项原本也失败。

新增 `AudioRecording.dispose()` 幂等失效代次，停止并完成 take 的资源清理，拒绝后续状态更新，删除候选、订阅及其 beforeunload 监听器。`disposeDocumentRecordings(owner)` 删除该 owner 的 registry，再逐个释放；Workbench 只在自己的 `dispose()` 调用，普通 close 不清候选。

定向消费者用公开 Workbench、真实 Compiler 静态服务和受控原生麦克风，没有假 workspace client。after 6/6 核候选／许可，active 4/4 在录制中销毁，等待实际 MediaRecorder stop 事件后仍为 idle、File 0、监听器 0、所有音轨 ended，无迟到复活。两份 after 均为 0 前端异常；这个纯生命周期消费者没有启用 workspace API，因此分别保留两个和一个 `/api/presmium/telemetry` 404，不声称全请求成功。浏览器、服务和临时目录均已清理。

## 范围限制

候选仅在当前页面的 Workbench 生命周期中保留，不承诺刷新、崩溃、关闭浏览器后的二进制恢复。尚未保存的录音会启用原生离开确认；需要保留的录音应明确保存。录制限制为 16 MiB 和十分钟；这两项保护的完整实耗边界没有通过伪造数据或快进时钟验证。

本轮只验证 Chromium 的 WebM/Opus 实际输出，没有宣称 Ogg、MP4、其他浏览器或物理麦克风通过。真实权限拒绝、设备拔出和系统级音频中断仍需有相应设备的验收。

公共 ensure 调用冻结时的 types 1207、tokens 40、layering 和 diff 轻量检查通过；其后的 owner 销毁增量另有上述原生生命周期证据和独立源码审查，没有重跑录音矩阵冒充同一源码。所有自有浏览器、服务、临时工作区和启动凭据已清理；失败消费者的浏览器关闭也已记录，不将关闭前仍在录制的轨道快照称为已主动停止。
