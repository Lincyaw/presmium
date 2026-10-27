# 当前步骤采用整段录音：2026-10-27

本片实现共享作者接口和真实播放链，没有新增 Studio 采用按钮。录音卡仍只保存资产；既有人声 ASR→明确采用讲稿→新 TTS 闭环保持原样。作者可通过 `DocumentAudioAuthoring.adoptRecording`、HTTP `document/recording/adopt` 或 MCP `adopt_recording`，明确将已保存本地音频作为一个稳定步骤的完整配音。

工作树为 `.presmium/worktrees/recording-step-adoption`，初始来源 `25b43c5190705ad794e1a6df8af59a3831655653`。全部私有消费者结束后才 FF 到 `5dbd7685`；新增的 DocumentSession discard guard 不涉及本片 27 份运行源码，没有用 FF 后的来源冒称重跑浏览器。源码与各组证据关系记录在 `.presmium/ui-evidence/recording-adoption-source-manifest.json`。

## 实际接口和边界

采用意图绑定完整 canonical source、Step ID、Asset ID 与实际 SHA-256。服务重探真实字节，经过同一 SourceEditor／文稿锁／CAS／历史事务，旧素材没有 fingerprint 时同事务 pin SHA；提交后再次读回。Web 的 origin 固定 editor，MCP 固定 agent，不能从请求选择 origin 或绕过 required review。同 ID 的同请求只在已保存源仍匹配时复用进程内回执，不承诺跨重启或任意后续编辑的幂等。

一个解析到 recording 的步骤只使用一次完整源文件。多个 Narration 的显示文本形成一段派生字幕，保留全部 Narration ID；没有 Narration 时有声且无字幕。采用不改讲稿、发音或 cue，字幕不证明声音内容已经核对。没有词时码时使用 `alignment:none`，不造逐字时间。非起点 cue、内部 pause、跨步 next、讲稿起点冲突会拒绝采用或使计划不可播放。

三层 voiceSource 继承不变：两个步骤继承同一文件时，各自从头完整播放一次，不把原音自动切成连续跨步片段。编译器收集并 watch 有效录音资产；受众过滤和发布仅保留可见步骤的有效资产。原音使用真实 mediaId/SHA，经完整 source／IR revision／planId 的媒体白名单读取，不伪造 speech cache key、AIGC 元数据或 canonical MediaClip。

当 MCP 计划服务与 HTTP 路由使用不同 ServedDeck 时，路由可能尚未持有该 planId。此时仅从当前 IR／实际媒体作一次 cache-only 派生，planId 必须完全等于请求才可读取；本 owner 已持有的历史快照继续原规则。错 planId、原音变化和旧 source 不会因这条路径放宽。

## 四组独立真实验证

没有运行套件或新增 tracked 测试。消费者均为 ignored 脚本，使用真实 Compiler、工作区服务、原生播放器和文件；没有模型、ASR 或 TTS 生成调用，没有伪造宿主或词对齐。

| 消费者 | 实际结果 | 已验证范围 |
| --- | --- | --- |
| `recording-adoption-1793102237132/result.json` | 20/20 | 真 JFK WAV（11 秒）明确采用；两 Narration 只有一个原音段；空讲稿有声无字幕；与已生成真实 profile Opus 缓存混用；MCP plan→直接 HTTP 原音 GET；Web Play/Pause 与整段字幕；单 lecture 发布后读取产物并核原音／TTS 原 SHA；错 planId、文件替换、旧 source 拒绝 |
| `recording-adoption-pure-1793102755543/result.json` | 9/9 | 仅 lecture 插件，没有 speech 插件、speech cache 或 Narration；MCP 采用／计划／原音 GET；原 MediaClock Play/Pause、实际定位到 5 秒并继续播放；零字幕；单 lecture 发布和空 WebVTT；原音字节不变 |
| `ui-evidence/recording-plan-boundaries-1793102880327.json` | 15/15 | 真实 Compiler 与 check；defaults 两步各完整一次、section recording 和 step TTS 的优先级；有效文件 watch；受众去除隐藏素材及单 lecture 发布；after-animation 按真实 hold 起播；cue／next／pause／冲突起点／未确认 SHA 拒绝，起点 mark 仅使用真实边界 |
| `ui-evidence/recording-adoption-boundaries-1793102880223.json` | 10/10 | 真实媒体探测；坏 SHA／角色／伪 origin／required review 拒绝；真实 git index.lock 使提交失败并完整回滚 source 和 SHA pin；同意图回执；非起点 cue 保留；实际新 source 赢迟到检查 |

表内路径均相对该工作树 `.presmium/`。两张图 `recording-adoption-1793102237132/recording-playing-paused.png` 与 `recording-adoption-pure-1793102755543/pure-recording-seek-paused.png` 已实际查看：前者显示两个作者段落共一段字幕；后者显示定位后时间 5.019 秒、字幕轨为空。这不是四主题／宽度视觉验收；没有新增布局或控件。

混合组使用保留的 `voice-task-owner/.presmium/voice-mcp-web-feedback-1793097419059/saved-document`。原锁同时含同请求的 legacy 和 profile 两份真实缓存，无配置时应当拒绝歧义。私有 fixture 明确仅保留已存在的 profile 锁项，原 JSON／Opus 字节不改；原锁 SHA、选择后的锁 SHA 和实际音频 SHA 都在 raw 中。没有为凑命中构造音频、改缓存元数据或连接提供方。

混合 20 项之后只新增 `node/check.ts` 的录音检查／跳过 TTS 单位逻辑，以及六条中英诊断文本。manifest 用逆移除文本的 SHA 证明旧消息源关系；纯录音 9 项、计划 15 项和采用 10 项全部对应最终 27 源 SHA，不把旧混合记录称为最终全部字节重跑。

## 保留的失败与观察器范围

- `recording-adoption-1793101739052`：前六项通过，第七项因上述真实离线锁歧义保持 estimated，未放宽 cache 规则。
- `recording-adoption-1793101834048` 与 `1793101931008`：前十项通过，直接媒体读取第十一项失败；后者记录实际 409 `production-plan-changed`，是 ServedDeck 归属问题的 before。
- `recording-adoption-1793102152258`：13 项通过，包括真实播放与发布任务 done；消费者错误地在文稿目录找任务输出而停止。最终消费者通过 job manifest 的真实产物 URL 读取，没有改产品来适配这个观察器错误。
- `recording-plan-boundaries-1793102548943`：私有 fixture 的 inline text 带非法 ID，在 schema 前置检查停止，未验证产品。
- `recording-plan-boundaries-1793102562899`、`1793102614626`：消费者将 operatorDir 放在 workspace 内，引发真实配置拒绝；修正目录隔离后，`1793102636328` 的 14 项通过，最终加实际 check 成为单独 15 项记录。没有把这些前置错误算产品通过。

## 清理与剩余范围

全部私有服务、浏览器、临时 home／workspace／fixture 均由各自 finally 关闭／删除，记录的 18 个进程 PID 最终在 `/proc` 均不存在。证据保留在 ignored 目录，目录 0700、文件 0600；未留下 launch 凭据。没有访问或重启公共 4320／17407，没有修改作者文稿。依赖仅执行离线、frozen lock、ignore-scripts 安装。

类型检查 1225 文件、layering、skills 与 diff 检查通过。没有运行全套、全量示例或新 WebM 导出。本片保持原 `audioSegments`→MediaClock 和发布／导出读取通路；实际产物验证到单 lecture 输出，没有据此声称新视频文件已验收。

尚未开放采用按钮、裁切录音、连续跨步分配、自动字幕／字词对齐、视频原音或新的设备／持久化协议。录音来源不需要 TTS 引擎；它在语音生成状态中为不适用，播放是否可用由实际资产、cue 和当前计划决定。
