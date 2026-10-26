# 来源绑定的制作计划

2026-10-26，在独立临时工作区使用真实 Compiler、工作区服务、精确语音缓存、HTTP API 与静音视频导出验证。未改公开示例、4320 或原 17359 会话；Node 探针禁止外网，未调用付费合成、新增测试文件或运行测试套件。忽略目录中的脚本与 JSON 保留原始证据。

公共计划由既有 `scriptTrack` 派生，Node 负责来源与音频文件确认。工作台经公共 API 读取，不引用讲授插件内部模型；浏览器播放器与界面整合由独立 lane 验证，本记录不将它们算作本次 Node 验收。

| 实际验证 | 证据 | 结果 |
| --- | --- | --- |
| 已有真实服务能力基线：缓存、None、缺缓存与未支持来源 | `.presmium/ui-evidence/production-timeline-seam.json` | 11/11；旧 None 没有可用 script，缺缓存为估时 |
| 新公开计划、媒体、来源屏障与默认新文稿 | `.presmium/ui-evidence/production-plan-proof.json` | 23/23；外网请求 0 |
| 仅修正真实缓存词时码的不可变计划标识 | `.presmium/ui-evidence/production-word-binding-before.json`、`production-word-binding-after.json` | before 4/4 确认旧标识不变；after 5/5 确认新标识变化，旧显式快照内容保持 |
| 单页显式 None 的真实静音 WebM | `.presmium/ui-evidence/production-silent-video-proof.json` | 4/4；1000ms、5 帧、2333 字节，VTT 含 canonical 字幕；无 speech 插件或 provider |
| 最后停顿与未选来源的导出边界 | `.presmium/ui-evidence/production-final-gap-proof.json` | 6/6；真实 8 个缓存片段，旧时长 31500ms→32000ms，事件与音频字幕不移动；未选来源明确拒绝空成功 |
| 并行缓存完成顺序与计划标识 | `.presmium/ui-evidence/production-plan-order-proof.json` | 5/5；真实 8 段查询按两种不同顺序完成，计划标识及实际轨道音色相同；外网请求 0 |

23 项 API 验证覆盖：canonical source 与完整运行 revision、真实音频字节 SHA-256 和 Range 206、路径状 clipId 拒绝、同 planId 播放轨与事件一致、未变输入标识稳定、显式 None 在无语音插件时确认、真实 hold 与 pause 的 3000ms 计划及 after 字幕、单一 lecture 形态导出、实际新默认文稿与新页的 4500ms 时机、未选来源阻止确认、canonical 插件启用后 Node 贡献无需重启生效、缺缓存估时、恢复缓存产生新标识、跨两稳定步骤的单一音频／字幕段、未知动画与 recording／mediaClips 诊断、读取缓存期间保存源后拒绝采用旧计划，以及过期来源／revision 拒绝。

词时码证据只修改临时副本中已有真实缓存 JSON 的一个词起点，源文稿、音频字节、总时长与事件都未变。修复前轨道词时码变化但 planId 相同；修复后完整非 binding 轨内容进入摘要，新 planId 不同，显式读取原 planId 仍得到原词时码。服务最多保留最近四份同源快照；其文件或来源变更后拒绝读取，未承诺跨进程历史保留。

摘要中的真实音频按缓存键排序，轨道头部音色按作者 unit 顺序选择已有片段。顺序验证通过公开插件服务包装已有真实 `lookup`，仅延迟完成时间；两次实际完成顺序不同，但精确缓存、文稿、轨与 planId 相同，音色元数据与第一个作者片段的真实缓存相同。现有缓存只有一种音色，未实跑第二种音色；不同音色时的确定性由作者顺序的源码与独立审查确认，没有伪造音频或合成提供方。

最后停顿对照在相同 Compiler、8 个真实缓存与计划上，直接运行修改前的 `scriptTrack` 源码与修改后的实现。500ms 是已有配置的最后间隔，先前没有对应事件而被旧 `trackDuration` 截断；新 `durationMs` 保留它，没有重排事件或音频。

静音能力有明确边界：零讲稿可用纯画面计划；显式 None 使用已知动画、hold、pause 与 gap。复杂 bubble-sort None 副本中的非零文字位置 cue 仍为 `production.silent-cue-unknown`，不删 cue、不用文字比例创造确认时码。有讲稿但 voiceSource 未选、未知动画时长、recording 与媒体片段裁切／混音不能显示为可播放或可导出。缺音频的 `spokenDuration` 只供估算展示，`canPreview` 与 `canExport` 均为 false。

API 的预期 400／404／409 是能力与身份验证的一部分，不报告为所有 HTTP 均成功。真实默认文稿创建使用独立 Git 仓库；最初探针缺 Git 的夹具错误已修正后重跑，未将其归为产品故障。最终轻量检查通过：types 1148 文件、layering、skills 与 `git diff --check`；未运行任何测试套件。
