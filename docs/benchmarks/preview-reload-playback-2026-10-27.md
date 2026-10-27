# Video 预览重载后的播放连接恢复

2026-10-27，在独立随机端口 Studio、私有文稿与真实工作区服务中验证。修改范围只有 `packages/workbench/src/preview-pool.ts`。没有修改播放计划、讲稿、录音控制器、Workbench 或预览协议。

## 原因

已经连接的 Video 预览保存新音频后，Pool 会停用并重新启用该 frame。连接保留了最后的 `activity:true` 命令。随后原生 `iframe.location.reload()` 完成 ready 握手，`connectPreview` 先重放该命令，再通知 Pool。

子端处理 activity 时先暂停，然后异步恢复运行时。Pool 沿用旧窗口的 `entry.active=true`，立即重新连接 Workbench。ProductionPanel 因连接代次变化发送 load，子端此时尚未恢复，返回 `production-playback-unavailable`。之后恢复活动的 ACK 没有对应的 Pool pending 请求，被忽略；load 不再触发。作者看到已保存版本，却持续无法播放。

只读状态观察排除了来源或计划过期：父 source、presentation snapshot、frame 和 plan 的运行版本完全一致，`webView` 始终为 present。工作区和浏览器均没有 HTTP 失败或 pageerror。

原始材料保留在忽略的 `.presmium/ui-evidence/`：

- `preview-reload-recording-before.json`：独立保留原 `audio-recording-browser-final.json` 的失败记录；已有 16 项通过，随后点击持续 disabled 的播放按钮超时，完整旅程未通过。
- `preview-reload-diagnosis.json`：无保存的同版本重载，1440／390 两例均恢复。它不能覆盖已有 activity 历史的热 frame。
- `preview-reload-capture-diagnosis.json`：真实录音、一次导入后，首次 prepare 尚未完成时重载也恢复。该反例不能替代热 frame。
- `preview-reload-hot-capture-diagnosis.json`：先等 ready，再保存第二段原音，录音中重载，8 秒后仍禁用。
- `preview-reload-activity-diagnosis.json`：同一热 frame 最小链增加只读命令观测，确认上述顺序。相对 ready，activity 在 +12ms 到达；load 在 +22.6ms 到达时窗口仍 paused，+29.4ms 返回 unavailable；+59.5ms 才收到 activity:true ACK，此后没有新 load。

这些时间只用于说明本次协议事件的先后关系，不是加载性能承诺。观察器保留 `registerBrand` 原有调用与参数，只读公开 Workbench 快照、订阅和过滤后的预览报文；没有输出凭据或完整地址。

## 修复边界

Pool 为每个 Entry 记录握手代次。支持 activity 的窗口再次 ready 时，旧活动确认变为未知，隐藏并断开旧连接，取消旧 pending。只有本代次显式 `activity:true` 请求的 ACK 到达后才显示、连接 Workbench，随后沿原有 ProductionPanel effect 加载同一计划。

旧请求的 ACK、超时和 catch 不能影响新代次或已移除 Entry。排队的激活会重新检查活动状态，避免另一条选择流程已完成握手后再次暂停。未知活动状态仍需要在停用时明确请求暂停。不支持 activity 的预览保留原行为：ready 后直接连接，停用时移除。

没有增加固定等待、重试循环或新的计时策略；原有 activity 失败超时保持不变。恢复不要求重新编译，不自动播放，也不停止较新的麦克风录音。

## 修复后的实际结果

`preview-reload-activity-after.json` 记录原链与后续控件操作，共 11 项通过，其中 7 项是录音／导入前置检查，4 项验证本修复：

- 已保存来源和计划不变，原生重载后自动回到 ready，不点击编译或重试。
- 麦克风原生 MediaStreamTrack 在被动重载后仍为 live。
- 显式点击播放后实际进入 playing，并释放录音 tracks；随后实际暂停成功。
- 通过当前页选择执行真实 step seek，公开播放状态到达目标页，保存版本不变。

本代次 ACK 到达后才有 load；最终记录中 ready 约 +94ms。旧连接退休时发出的 pause 仍可能在子端恢复期间返回 unavailable，后续本代次 load 成功并清除该状态；没有把这条协议错误写成零错误报文。

`preview-pool-boundaries.json` 10/10：同一 frame 停用／恢复、Alpha→Beta→Alpha 原 frame 复用、无 activity 的首次 ready／重载／停用移除，以及 dispose 释放。常规预览使用真实 Workbench、WorkspaceClient 与服务端文稿；不支持 activity 的反例使用公开 `connectPreviewFrame`，明确省略 `setActive`，只验证协议回退，不作为实际播放能力证据。该消费者没有文稿写入。

两份最终记录均为 complete，HTTP 失败与 pageerror 为空，Pool 源 SHA 均为 `9841d3451a20cfde1be30fe516ce896d17047ca0baf24e0103823870270c2f87`。`preview-reload-activity-after-ready.png` 已实际查看，播放按钮恢复可用，录音仍在继续。`preview-pool-final-manifest.json` 记录源码、文档及原始材料的哈希。

主链两次私有音频导入均写入实际原始 bytes，没有生成声音、ASR、TTS 或模型调用。MediaRecorder 使用浏览器受控麦克风设备；未声称真人麦克风验收。所有浏览器、独立服务和临时工作区在 finally 清理。未触及公共服务、作者文稿或被冻结的转写采用源，没有新增 tracked tests 或运行测试套件。

辅助消费者初次从错误目录解析公共包、遗漏公开方法必需 AbortSignal，以及假设独立 Workbench 必有 presentation snapshot 的失败分别保留为 `preview-pool-boundaries-initial-build.json`、`-initial-api.json`、`-initial-fallback.json`；最后一份在失败前已经通过 5 项真实停用／恢复检查。它们没有计入最终通过项。`preview-reload-activity-after-initial.json` 保留增加两个生命周期守卫前的首轮 11 项结果。

类型检查（1207 文件）、分层检查与本范围 diff 检查通过。此次没有新增界面控件或样式，没有重复主题矩阵或完整录音旅程。
