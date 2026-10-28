# 当前步骤的手动字幕时间

2026-10-28，在独立 `manual-caption-timing` worktree 从 `878e1c117bf1c6e48c66b4cabb0df5b140332a41` 实现。核心提交 `e3dbd2954134d26bc064b3dc3a53688ea8c0f508`，加载状态与迟到计划初始化增量为 `db0ccd23c38ddfbad3deef70a2b758fbf4132c74`。此记录是私有真实消费者证据，不是公开 4320 部署验收。

## 作者可做什么

在 Video 准备当前版本后，打开“设置字幕时间”。原文来自当前稳定步骤的有序 Narration：cue 不生成文字，pronunciation 使用 display。按讲稿换行明确分段，填写每段相对本步起点的开始／结束秒数，再应用。原文不另存副本；UTF-16 分区须完整连续覆盖、端点为 Unicode grapheme 边界。最多 32 段，同时遵守 4096 字符的完整动作请求上限，不能由数量上限推断任何 32 段都装得下。

设置需要本步真实音频与确认时长；不跨步骤或页面分配，不估算词时间。作者时间标为 `manual`，与 words／proportional／none 区分。段间可以留白，Web、VTT 与实际视频烧录使用同一派生投影，不在空隙回退全文。音频字节、原音 sourceRange、cue、Narration 和 ASR 来源不变。恢复自动只删除该步的手工映射。

有效性绑定有序 typed Narration、有效 voice、本步时序和实际音频 SHA／区间。保存文稿引起的新 version／IR／planId 不使自身失效；前序步骤位移只移动派生绝对位置。讲稿或音频改变时保留旧提案、停止使用旧映射，要求明确重新检查；普通 Doc 保存仍可继续。更换同 AssetID 的真实音频后，打开 Dialog 也不能静默确认旧时码。

Doc 仍只有字幕文字和配音开始。时间表单的未提交输入只在同一个挂载的 Video 会话内跨关闭／切步保留；离开 Video、刷新页面、跨 Tab 没有本表单的恢复能力，不借用正文或组件参数的 strict 草稿名义。新输入不被旧保存回执清除，也不被标为已经保存。异步计划返回只初始化仍打开、目标仍当前且尚无草稿的表单。

## 实际运行

证据目录为本 worktree 的 `.presmium/manual-caption-timing/`。以下是独立消费者，不能合成一份“81/81”脚本：

| 家族 | 原始结果 | 真实范围 |
| --- | --- | --- |
| `domain-1793161550859` | 16/16，complete | 实际 Compiler、真实原音、多 Narration／pronunciation／起点 cue、完整 Unicode 分区、手工空隙、VTT、单 lecture 发布、前序步骤插入、改文 stale、无音频拒绝。1084 源首尾稳定，是较早领域版本。 |
| `studio-1793162315156` | 26/26，complete | 官方 MCP SDK 预检／采用／同引用重放、新版本计划、unsafe Unicode 与旧 source 拒绝、真实媒体 SHA；原生 Web 表单 Apply、手工 seek、留白、Play/Pause，1440／390 亮暗四组合。1200 源首尾稳定。 |
| `held-ack-1793162583202` | 10/10，complete | 原生 Apply 得到后端真实 200 后扣住回执，再输入 0.875，释放原回执；后来字段保留，旧成功不显示成后来输入已保存。 |
| `export-1793162622367` | 6/6，complete | 原 `exportVideo`／Mediabunny 实际 WebM：640×360、8fps、4 秒、32 帧，含原音与字幕 sidecar；原生 video 解码输出。1 秒第一句、2 秒空白、3 秒第二句三帧已亲看。 |
| `stale-audio-1793162914510` | 12/12，complete | 同 AssetID 换成另一份仓库真实 Opus，typed 讲稿不变；旧映射 stale，Dialog 保旧 basis、Apply 禁用；显式 Review 保留时间，原生 Apply 才写新实际媒体 basis。 |
| `loading-1793163398237` | 11/11，complete | 扣住浏览器真实 production-plan 200，打开表单只显示读取状态；释放同一请求后原 Dialog 自动出现四字段。输入 0.875 后关闭／重开仍保留，不覆盖现有草稿。 |

原音均来自仓库已有真实缓存，没有调用 ASR、TTS 或付费模型。主素材 `ad40f97135725b1399612c5427098f71.ogg` 为 110742 字节，SHA-256 `128750d78528501ade220a2f6fb63598bd1d137b88bf591f7002c10d0498dca9`；领域消费者使用完整 18.16 秒，Studio／导出显式选择原文件 0–4 秒。换源反例使用 `dcd17beb555ce9b4cea67535184d460a.ogg`，实际 SHA-256 `e66a036e67a369e12544a8684ee11c0ce590755366d6b9c8652e543e266161f6`。这些时间是消费者明确提供的作者决定，不把字幕文字与原音逐词准确率当作验收结果。

导出 sidecar 实际为 0.5–1.5 秒与 2.5–3.5 秒两段；烧录帧同样在 2 秒留白。输出由原生浏览器解码为 640×360、约 4 秒。没有只凭 VTT 文件或编译成功推定烧录可用，也没有复制第二套播放器字幕时钟。

## 原红与源码谱系

完整原始失败均保留，没有覆盖：领域首轮 VTT 观察断言漏写小时、operatorDir 放在工作区内、消费者共享对象误改后续比较基线；首 Studio 已完成 11 项后因“位置 (秒)”的括号定位器写错超时。这些不算产品通过。

实际产品反例分别是 `held-ack-1793162514656` 的旧成功提示覆盖后来输入状态、`stale-audio-1793162782036` 的初始化自动重绑媒体 basis，以及 `loading-1793163296279` 的加载误报不可用／原请求返回后字段仍为零。均有上述独立后验。`held-ack-1793162544153` 核心断言通过，但关闭 context 使在途 plan JSON 观察器拒绝，最终零错断言失败；该原文件还含观察器提前设置的 complete=true，不能据此称整轮通过。`stale-audio-1793162846398` 已显示 Review 和禁用 Apply，但 exactText 误匹配带按钮的 Notice，仍保留失败，随后只修观察器定位。

最终共有 38 个运行源。Studio26 比核心提交少 Dialog 的 ownsInput 成功提示和保留旧 playback basis 两处增量；heldACK10／export6 相对核心仅少后者，37 个非 Dialog 运行源相同。核心后加载修复只改 `ProductionCaptionTiming.tsx`、`ProductionPanel.tsx` 和中英文 caption messages；最终 loading11 覆盖该三个改源，不能把旧26四组合或旧烧录6称为全部最终38字节重跑。精确各家族 sourceStart／sourceEnd／current 差项、原 raw SHA 和当前 committed blob 见 ignored `final-manifest.json`。

最终类型检查为 1330 文件；layering、tokens 42、packages 40、skills 与 diff 轻检通过。未运行测试套件、完整示例构建或任何模型。服务、浏览器、工作区及临时目录均由消费者 finally 清理，终态 PID 另按实际存在性核对。

## 设计与未覆盖项

正式 Figma [ManualCaptionTiming](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=292-7743)复用公共 Dialog／Input／Button／Notice，Compact／Touch 各覆盖 Ready、Loading、Invalid、Stale、Unavailable、Saving、Applied；[亮暗审阅板](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=293-7121)与四张实际 Studio 图已查看。业务 CSS 仅布局，原生输入与按钮承担焦点和键盘行为。

本片没有任意 caret 分句、自动原音词对齐、跨步骤字幕、译文时间编辑或表单 IDB／跨 Tab 恢复。表单权限、required review、精确 receipt 与 source CAS 沿共享 owner 并经独立静审，本轮没有重复完整权限／Git 故障矩阵；reset、切步关闭后的旧错误守卫也未独立扩成全部运行反例。没有物理触屏、全部输入法或普遍语音准确率验收；Unicode 验证与真实 coarse 390 视图不能替代这些条件。

## 4320 交付

运行版本 `ab1d5affe5141f72d270d57ecf23833be32598f9` 已更新到 4320。最终合并源码在私有 Studio 的 Web／MCP 操作完成 26 项，计划加载和已有输入保护完成 11 项；此前同一合并版本的主体与音频更新保护完成 12 项、保存回执保护完成 10 项，实际 WebM 导出及字幕画面完成 6 项。导出图片中的首句、空白和次句已逐张查看；对话框亮暗与桌面窄屏四图也已查看。不同轮次分别记录，不把较早结果说成完整最终轮。

固定源码客户端构建检查 1254 项、类型检查 1332 文件、分层和令牌检查通过。在线只读健康检查 22 项、示例视频入口 8 项通过；两个 host 的既有认证会话正常，重启前后 11 份文稿字节未变。未运行测试套件或全量示例构建。上述视频是短片及受控浏览器验证，不代表所有编码格式、设备或工程规模均已验收。
