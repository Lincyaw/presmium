# 真实人声转写、讲稿采用、新配音与播放

在固定产品代码 `6e3efc53` 的私有 Studio 中，已实际完成：11 秒人声文件经 MCP 导入和转写，审阅后采用为步骤讲稿，再通过 Web 明确选择音色、生成新配音，核验缓存和字幕，并实际播放、暂停。使用本机真实 CPU 提供方，不使用 fake 引擎、协议候选或用户媒体；公共 4320 和作者文稿不参与这条写入链。

本次只覆盖一个英文文稿、一个步骤和文件来源。没有据此宣称真人麦克风权限、中文 ASR、多步骤 cue、精确字幕或 MCP 配音任务已全部验收。

## 实际来源与结果

| 阶段 | 完成依据 |
| --- | --- |
| 原音 | Whisper 固定版本测试材料中的 JFK 人声，经实际解码得到 11 秒单声道 WAV；原 FLAC、派生 WAV 和出处分别留 SHA／许可来源。导入资产摘要为 `b9e1ae4e…` |
| ASR | 实际 Speaches CPU、固定 faster-whisper-base 模型；通过正式 MCP start/list/get/exact-result 读取真实任务和候选。最终候选有 22 个合法词时，任务实际观察到 queued/0、running/1、done/3，不补造未采样的 sequence 2 |
| 审阅采用 | 先读取 typed Narration 差异与稳定目标，再明确 apply；目标为 `intro-step/reviewed-script`，保留转写 revision、原音 Asset ID／SHA 和 segment 来源 |
| 选择音色 | Web 实际读取 Kokoro 的 72 个音色，明确选择 localtts／af_heart 并保存；ASR 和讲稿采用本身没有选择 TTS |
| 新配音 | Web 的真实共享任务 `5272342c…` 为 done、1/1、0 failed，绑定 source `a537f506…` 和 IR `6be4e5d…`；没有调用旧 `lecture_synthesize` 旁路 |
| 缓存 | 实际 Opus key `d519a9e5…`、SHA `0dfd9dd4…`，解码约 6.091 秒且非静音，缓存记录和音频带实际 AIGC 标识。configured model 为 kokoro，不把请求配置当成提供方报告的模型版本 |
| 计划／字幕 | 真实 plan `d1c28a65…`，confirmed、canPreview=true；配音和字幕都引用已采用讲稿，总时长 6591 ms，含 500 ms 尾停顿 |
| 播放 | 同一后端和缓存下，真实浏览器点击 Play 后时钟到 150.017 ms、playing=true；点击 Pause 后为 317.755 ms、playing=false。iframe 实际显示当前讲稿字幕 |

新 TTS 没有返回词时，时间戳扩展实际 404，也没有新音频对齐缓存。计划明确采用 `proportional` 字幕对齐；原音的 22 个词时只属于原录音候选，没有被挪作新配音精确时间。

完整 source 阶段记录证明：导入后为 `1a139768…`，ASR 完成后仍是同一 canonical 字节；明确采用才变为 `4fb6731e…`，明确选择 TTS 来源才变为 `a537f506…`。原始资产字节在全过程保持不变。

## 三份相互衔接的真实证据

证据位于 `.presmium/worktrees/audio-authoring-mcp/.presmium/cpu-speech-e2e-final-20261027/`，汇总为 `final-manifest.json`。它们是三个消费者，不合并成一份所谓 35/35 脚本：

- `result.json` 原链通过 17 项到真实配音任务接收。浏览器中的任务实际完成；独立观察器误用了 workspace 命名空间读取 voiceover，因 404 停止，因此原脚本仍标为 incomplete。
- `same-owner-readback.json` 9/9，读取同一后端、任务、source、缓存和计划，实际解码并验证来源、AIGC、比例字幕与原音不变。
- `same-owner-browser.json` 9/9，正常新前端／浏览器进入同一仍存活的后端，核验字幕与真实 Play／Pause。只替换任务自己的旧前端，保留原端口和 preview origin，没有重启后端或重新生成。

播放前后的实际提供方成功 POST 计数完全相同：ASR 累计 3、TTS 累计 3。这些累计值包括此前独立引擎探测和首次消费者，不宣称总共各调用一次；同后端读回与播放没有再调用 ASR／TTS。浏览器记录中 HTTP failure、pageerror、文稿写入均为空。

首次消费者另通过 15 项后因音色定位器写成 option 停止，未启动 TTS；原结果、截图和其资源清理记录保留。改用实际公开 radio 语义后才启动上述独立完整链。两次停止都是验收代码错误，没有为其修改产品源码或覆盖旧失败。

## 可复核副本与边界

`saved-document/` 只保留 5 份材料：canonical JSON、导入 WAV、speech lock、真实 Opus 和缓存元数据，没有复制 home、模型凭据或浏览器 storage。目录 0700、文件 0600。root 独立验证 26 份运行源 SHA、18 份产物 SHA 和 5 份副本 SHA 全部匹配，canonical version／fingerprint 正确，`validateDocument` 零问题；两张最终画面也已实际查看。首次 root 校验的 jiti 依赖定位错误仅发生在消费者 bootstrap，改为其实际所属的 MCP 包入口后才执行验证。

本机真实 ASR／TTS 的固定镜像、模型、端口、资源限制和英文／中文 Opus 独立探测，另保存在同一隔离 worktree 的 `.presmium/cpu-speech-20261027/`。中文结果仅为 TTS 接口探测，不是中文转写完整链。配置只注入私有验证服务，没有自动修改公共 4320 或 `pnpm studio` 默认配置。

独立 `cleanup-final.json` 记录临时浏览器、前端、后端共 8 个 PID 实际退出，自有 home／workspace／fixture 和临时授权材料均删除，全部已核证据字节保持不变。替换前端 helper 提前以 143 退出、原因未知且未执行 finally，已单列真实终态和后续目录清理，不宣称该 helper 正常退出。提供方容器转交下一片共享配音任务验证，继续受任务标签、资源上限与维护者清理责任约束。本次没有新增 tracked tests 或运行测试套件，没有把缓存／计划成功当作导出、真人设备或完整 MCP 能力对齐。
