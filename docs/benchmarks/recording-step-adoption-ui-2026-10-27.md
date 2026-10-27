# 本步原音采用：Video 实际界面

2026-10-27，在独立 `recording-step-adoption` 工作树、临时规范文稿和动态端口 Studio 中验证。使用原版 `startStudio({ isolateClient: true })`，没有写公开服务或作者文稿，没有模型调用、外部音频下载、新 tracked tests 或测试套件。

## 实现范围

Video 的原录音卡复用公共 Card、Select、Button、Notice：一个已保存音频选择器，明确的“采用为本步配音／已采用”操作。录音、保存素材、采用原音、ASR 和 TTS 仍是独立动作；Doc 没有新增高级入口。

客户端先读取真实音频的 SHA，再提交完整 canonical source、稳定 StepID、AssetID 和 SHA。采用调用既有 `DocumentSession.commitExternal`，没有第二个写器、任务队列或播放时钟。纯合并仅允许本次 voiceSource 与 SHA pin，保留后来正文、讲稿、音色、时机和资产修改。取消或丢回执不代表没有提交，actor 以实际 GET 收敛；界面只据本次目标的实际 canonical 结果清除传输失败。

原音候选属于文稿身份，不随 canonical 版本推进而停止新录音。采用及被动计划刷新只暂停输出；显式播放停止麦克风、释放 tracks 并保留候选。新步骤选择会失效旧待发导航，避免新 frame 先显示 B、随后重放旧 A。

后端的整段原音、单步一次音频、多 Narration／空讲稿、继承与受众、原媒体权限和单 lecture 发布范围见[后端验证](recording-step-adoption-2026-10-27.md)。本片没有重新运行或扩大其模型、导出和格式范围。

## 实际证据

忽略目录内各份 JSON 独立保留，不能相加冒称同一消费者一次全过。最终来源与每份记录的逐文件差异见 `.presmium/ui-evidence/recording-adoption-ui-final-manifest.json`。

| 记录 | 实际结果与范围 |
| --- | --- |
| `recording-adoption-boundaries-1793104852652.json` | 真实共享采用服务的回执与纯合并 7/7：后来正文、本步／继承音色、时机、资产位置、删除目标保留；拒绝其它 UUID 与无关远端 delta |
| `recording-adoption-ui-1793108506567/result.json` | 27/27：浅／深色 × 1440／390，以及英文。原生 MediaRecorder→停止→保存不隐式采用→明确采用→实际录音计划、Play/Pause、0.5 秒 seek；公共热区和输入密度无溢出 |
| `recording-adoption-ui-receipts-1793107930862/result.json` | 11/11：真实已提交 ACK 暂缓后新 Mic 继续，显式 Play 才释放；后来原生讲稿输入保留；取消后真实读回、丢 ACK 不重复 commit、源 409 保选择并明确重试 |
| `recording-adoption-ui-navigation-complex-1793108392581/result.json` | 9/9：含前次原生讲稿输入的长链，新采用 ACK 之后界面 B、父子协议与新源播放器的稳定 StepID 均为 B，无旧 A 重放 |
| `recording-adoption-ui-navigation-1793108506566/result.json` | 5/5：无讲稿输入的独立对照，同源播放器 ready 后仍为 B，A 的真实采用没有写到 B |
| `recording-adoption-ui-copy-1793108749748/result.json` | 最后显示增量 17/17：四组合与英文实际打开录音状态的音色 Dialog，真实标题／短名，无 path、opaque ID、常驻裁切说明；保留原生成行为。只读状态，没有重录或重复 27 项流程 |

录音输入是 Chromium 公开受控音频设备读取已有真实 JFK WAV，再由原生 `getUserMedia`／`MediaRecorder` 录制 WebM/Opus；不是物理麦克风或真人实时录音证明。记录的候选 SHA 与真实原生 chunks 匹配。窄屏使用浏览器粗指针模拟：热区至少 44 CSS px，输入字号 16 CSS px，按钮字号沿公共 compact；没有声称实体触屏硬件验收。

四组合截图已实际查看。最后显示增量移除了正常录音来源上的常驻能力说明，音色摘要与 Dialog 只显示真实素材标题或本地化“录音来源”。真正失败与计划诊断仍保留，未改变生成按钮行为。Formal Figma `OriginalAudioAdoption` 为 `245:5322`，六态复核为 `245:5323`；内层布局容器透明，继承卡片 surface 变量，无业务 CSS 覆盖。

## 保留的失败与修复

- 首轮 `recording-adoption-ui-1793107410722` 在第 15 项停止：消费者错误地要求按钮也使用 16px。公共规范要求按钮 44px 热区、输入 16px；原始几何与截图保留。修正 oracle 后同源码全流程通过，没有改 CSS 洗指标。
- `recording-adoption-ui-receipts-1793107854531` 保留真实丢 ACK 后“已采用”却仍提示失败的 5 项中间记录。原因是请求 catch 晚于 source effect；修复只在本次目标和 SHA 已被实际 canonical 证明时清传输失败。
- `recording-adoption-ui-boundaries-1793107569814` 的第 5 项只观察瞬时 B，不能证明后续位置保持；之后页面确回 A。独立最小无讲稿对照通过，未据此否认长链失败。严格长链 `recording-adoption-ui-navigation-complex-1793108140471` 的第 6 项再次明确失败：新源播放器 ready 为 A。
- 长链 wire 显示 `go B → go A → appearance/pick/highlight`，对应 `attachPreview` 当前位置之后重放旧 `pendingGo`。有效新步骤选择后清旧 pendingGo 一行即可；非法目标不清，必要的 `goToStep` 会登记最新目标。修后严格长链与无讲稿对照分别 9/9、5/5，没有额外点击、固定延时、选区桥、clock 或 kernel 协议改动。

最后 27 项完整流程与严格导航记录完成后，才按独立显示增量删除常驻说明。17 项只读状态消费者覆盖最后显示源码，不把旧截图或旧来源 SHA 冒称全部最终字节；回执 11 项同样按 manifest 列出后来的一行导航和显示差异。actor 在 `d7ca0095` 提交，UI 工作树顺序 FF；桥 SHA `7e9dd016…` 始终相同。

## 验证与边界

轻量类型、分层、技能与 diff 检查另在 final manifest 登记；没有运行套件。各次 browser、Studio、临时 workspace/home/fixture 都已清理，实际进程存在性检查见 `.presmium/ui-evidence/recording-adoption-ui-cleanup.json`。认证地址和 token 没有写入公开记录。

录音候选与未采用选择是文稿身份内的临时 UI 状态，不承诺崩溃持久化；保存后的资产和采用后的 voiceSource 才属于 canonical。原音仍是整段当前步骤旁白，未新增裁切、跨步切片、精确词对齐、物理设备权限、其它浏览器或视频导出验收。采用不改变讲稿或调用 ASR/TTS。切文稿后的 actor 归属与持久化证据独立见[外部事务桥](document-external-transactions-2026-10-27.md)，不把该记录当本消费者又跑了一遍跨文稿 UI。
