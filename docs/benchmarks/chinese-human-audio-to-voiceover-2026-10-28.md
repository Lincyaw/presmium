# 中文真人原音转写、采用与重新配音

2026-10-28，固定产品源码 `47acebe594e1b7fe15d095736bab07ff9d80e168`，在独立 worktree 与私有 Studio 验证一条中文流程。正式 MCP 导入原音并创建真实转写候选，明确校对后原子采用为讲稿，再从 Web 选择中文音色、生成真实配音并播放。没有访问公开 4320/17407、作者文稿、付费服务或用户模型凭据，没有运行测试套件。

本次使用已有录制数据集，**没有验证物理麦克风，也没有人工听审声明**。单条样本及独立审听的误识别均保留，不能据此宣称中文 ASR 普遍准确。

## 材料与实际提供方

真人样本为 AISHELL-1 `test/S0764/BAC009S0764W0121.wav`，来自 [FunASR 官方 README 列出的单条音频](https://github.com/modelscope/FunASR/blob/main/README.md)。[OpenSLR 33](https://www.openslr.org/33/) 明确给出 AISHELL-1 的 Apache License v2.0，并说明由真实说话人录制；许可依据是数据集页面，不是代码仓库的许可。[icefall 官方说明](https://github.com/k2-fsa/icefall/blob/master/docs/source/recipes/Non-streaming-ASR/aishell/tdnn_lstm_ctc.rst) 另将该确切 ID 标为 AISHELL 测试材料，列出相同的 67,263 个采样点及参考文字。

| 材料 | 实际值 |
| --- | --- |
| 原音 | PCM16、16 kHz、单声道，134,570 bytes，4,203.9375 ms |
| SHA-256 | `46dbc998c9d1d48111267c40741dd3200f2e5bcf4075f8c4c97f4451160dce50` |
| 参考文字 | 甚至出现交易几乎停滞的情况 |
| ASR | Speaches `0.8.3-cpu`，`Systran/faster-whisper-base` 多语言模型，revision `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`，CPU/int8 |
| TTS | Kokoro-FastAPI `v0.9.0`，实际目录中的 `zf_xiaobei`，模型 `kokoro` |

两容器均使用原有固定 digest。Speaches 镜像为 `sha256:21e3df06d842fb7802ab470dd77c25f0e8c0d22950e8d8c6ae886e851af53ef8`，Kokoro 为 `sha256:ee3111d6a2c903ed62f3b4fa19543c6901205ed39fce3c177e895b34a8386b9c`。初次全局镜像列表没有列出它们，随后精确 digest inspect 确认缓存已存在，两次 pull 均约 0.6 s，没有重新下载大镜像层。压缩清单合计约 2.38 GB，已有镜像展开合计 5.36 GB；本轮只复制约 148 MB 的已有 ASR 模型缓存并下载单条 WAV，没有整库下载。

任务独占容器只绑定 `127.0.0.1:32770/32771`，分别限制 2 CPU、2/3 GiB 内存、128 PID，并带本任务 label。启动时有 64 CPU、约 72 GiB 可用内存、根文件系统约 17 GiB 可用空间，Docker 根目录在 `/data`。没有修改系统服务。实际健康、模型和音色 GET 成功后才开始流程；音色目录没有语言字段，不将中文 ID 前缀或模型配置单独视作中文能力验收。

## 实际内容与来源

正式工具依次执行 `get_document`、`inspect_workspace_audio`、`import_workspace_audio`、`start_transcription`、任务读取、结果读取、`plan_transcription_adoption`、`apply_transcription_adoption`。导入前后核对实际字节与 source，原音成为 canonical Asset。ASR 的真实任务经过 sequence 1、2、3，到达 `done`。

实际候选是“甚至出现交易几乎停制的情况”，把“滞”误识别成“制”。候选保留原音 SHA、任务 ID、revision、实际分段与词时；**ASR 完成后 `lecture.json` 原字节不变**。初次采用预检遇到既有 cue 和 pronunciation，返回未解决冲突且没有可提交 planId。随后明确将文字校对为参考文本，显式保留 cue `zh-start-cue` 的完整 payload 与“交易”的 pronunciation 节点，再以 draftRevision 1 重新预检并采用到稳定 `intro-step` / `reviewed-script`。

采用只修改所选 Narration 及其 transcription provenance。实际核对原音资产、voiceSource、媒体片段、最短停留和结束停顿均未改变，也没有触发 TTS。随后在 Web 的公开音色 radio 中选择 `localtts / zf_xiaobei`，确认应用设置，再明确点击生成。使用的是共享 Web/MCP 配音任务，没有调用旧 `lecture_synthesize`。

| 产物 | 实际值 |
| --- | --- |
| 已保存 source version | `4c8137aea91bd5f23c62` |
| source fingerprint | `bd005b8e7b5ac7ae` |
| IR revision | `362431174547a6a2` |
| TTS job | `5fa1f1e6-91cf-4821-b1b9-2e942200ca57`，sequence 4，done，completed 1 / failed 0 |
| 生产计划 | `eea8ecd9269c4e345eb16894a6ffc74e`，confirmed，canPreview，4,500 ms |
| 新缓存 key | `3c89f51ba36f34ba3d1ba362c74669a1` |
| profile | `cdafc3236c1eeac0f9d19b328cbb40cc9703679342028009cc29b40f4d15abbb` |
| 实际 Opus SHA-256 | `7a22667052b286885732130835ee90840efcc7656a5755ede21fefbb151ed08f` |
| 解码时长 | 3.367 s，实际 PyAV 解码为非静音 Opus |

新缓存记录和音频都携带 AIGC 标识，实际文件 SHA 与记录一致。提供方词时扩展真实返回 HTTP 404，最终字幕对齐是 **proportional**。没有把原音 ASR 词时重新标成新配音的精确词时。

独立向本地 ASR 提交这份新 Opus，只作可懂性佐证，得到“甚至出现交易几乎停智的情况”。“智”与目标“滞”同音，但文字不完全一致；保留原结果，不称完美识别、人工试听或生产对齐。任务专用 relay 记录总计 **2 次真实 ASR POST**（原音 1、独立审听 1）、**1 次真实 TTS POST**。其余读回和浏览器验证没有追加模型调用。

## 浏览器结果及保留的失败

全过程使用同一个后端 owner、文稿 UUID、ASR 候选、TTS job 和实际缓存。观察脚本的 locator 和暂停 ACK 修正只换正常浏览器，没有重新转写、采用或生成。最终正常 Video 初次准备收到真实 load ACK，播放时钟到 `00:00.554`，暂停 ACK 后为 `00:00.689`，随后 12 个原生动画帧保持暂停。iframe 字幕是“甚至出现交易几乎停滞的情况”，来自当前 canonical Narration 的 display 内容。亮暗 × 1440/390 四图均实际查看，页面 scrollWidth 分别等于视口宽度。

播放和暂停只在浅色 1440 视口实操通过；四组合截图只核布局、字幕可见和横向宽度，没有逐组合采集 preparing/disabled。暗色截图中的控件呈禁用色，现有 raw 不足以判断是切主题后的加载状态还是配色，不能把四图当成四组合播放就绪证明。

原始失败逐份保存，没有合并成一次全绿运行：

| 证据片段 | 结果与范围 |
| --- | --- |
| `initial-locator-failure.json` | 前 10 项通过；脚本误把当前公开 radio 当成 button，音色点击超时，当时 TTS 为 0 |
| `continuation-frozen.json` | 同 owner 后续 8 项通过，真实 Web TTS 完成；voiceSource 新版本使画面过期，自动可播等待失败 |
| `browser-readback-frozen.json` | 同 owner 明确再次编译，source/IR/plan 当前但 transport 持续 disabled；是真实生命周期缺口 |
| `playback-observe-frozen.json` | 正常初次 load、Play、Pause ACK 已成功；旧观察器在暂停 ACK 前采样 clock，原 false 断言保留 |
| `final-readback-frozen.json` | ACK 后采样的最终读回 6/6，含真实播放、字幕、独立中文音频审听、四组合和不变性 |
| `compile-race-observe.json` | 2/2 观察完整，真实重现二次 prepare 取消 load 后没有新 load；不是播放成功证明 |

最后一项确认 `ProductionPanel` 的 load effect 缺少 `preparing` 生命周期依赖。再次准备会暂停正在加载的 child，旧 load 返回 `production-playback-cancelled`；相同 source/IR/plan 不改变旧 effect 依赖，于是没有重新加载。该修复与这份原始中文验证分属独立 worktree，原失败不随修复改写。voiceSource 改变后画面需要明确准备的交互边界也单列保留，没有自动化成成功。

## 证据与运行边界

私有证据位于 `chinese-audio-voiceover` worktree 的 `.presmium/chinese-audio-20261028/`。`final-manifest.json` 列出 27 份运行源码、每份历史/最终 raw 的 SHA、任务和产物身份及四图。`saved-document/` 保留 8 个实际文件：canonical、原始导入文件及被引用的资产、新 profile 记录与 Opus、speech lock、真实转写候选及任务。目录 700、文件 600，不含 home、launch URL 或 token；复制后的 canonical 经公开 `validateDocument` 检查零 issue。

没有把候选材料或合成音冒充真人原音，没有跨浏览器准确率、真人麦克风、音箱发声或精确中文词时声明。清理实际 PID、端口和临时凭据的结果在独立 cleanup 证据中记录，不修改上述冻结 raw。

`cleanup-final.json` 已记录实际清理完成：各浏览器通过自身 finally 关闭，首个失效观察器的浏览器按核实的直系 PID 退出；修复验证的新前端退出后，原 owner 关闭后端、relay、home、workspace 和 fixture。原后端 PID 4006192、新前端 PID 189306 及记录的相关 PID 均不存在，前端、relay 和两提供方端口均无监听。只停止并删除本任务 label 对应的两个 CPU 容器；保留共享固定镜像和原有模型缓存，删除本任务复制的缓存与私有 handoff。8 个保存文件的 SHA 和冻结 manifest 都未改变。
