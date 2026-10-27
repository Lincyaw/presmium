# 字幕聚焦取消旧播放加载时的提示

2026-10-27，在 `audio-authoring-mcp` 隔离 worktree、随机实际端口 Studio 和默认文稿私有副本上验证。
本次只修改 `Workbench.controlProduction` 的错误展示条件，没有修改播放协议、文稿或公共控件。

## 根因与边界

进入视频制作后，实际子 frame 的首次 `production-plan` 请求仍在加载时，作者聚焦原生讲稿字段。
字段聚焦会选择当前步骤并暂停旧加载，子端返回 `production-playback-cancelled`。
父端原来只将 `production-request-cancelled` 等父端失效码视为正常取消，旧 load 的 catch 因而留下全局“播放请求已取消。”提示，即使新步骤已经 ready。

原始记录为主工作区的 `.presmium/ui-evidence/audio-authoring-ux-probe.json`。
其中前三项记录实际取消、后续 ready 仍有误报及文稿字节不变；第四项仅记录素材与转写选择入口现状，不属于本次修复。
Playwright 通过 `route.fetch()` 取得真实后端 200，只延迟其交付；聚焦使用真实鼠标，没有键入或替换后端。

现在只对 `action === 'load'` 且错误为 `production-playback-cancelled` 的请求不写入 `productionFailure`。
当前 Play 也可能用同一码报告播放器拒绝，因此其他动作收到该码时仍必须显示错误。
原有来源、文稿 scope、binding 与 AbortSignal 检查保持不变。

## 最终验证

最终 Workbench SHA-256 为 `824ae2d298459967b127e721527b4ffb0bce4b4bc77741d1d35c5939064dde76`。
下列产物位于隔离 worktree 的 `.presmium/ui-evidence/`，与该源码匹配。

| 原始记录 | 结果 | 实际范围 |
| --- | --- | --- |
| `audio-authoring-ux-matrix.json` | 12/12 | 亮暗 × 1440/390；真实旧 load 取消仍发生、新步骤 ready、无全局误报、规范文稿字节不变 |
| `production-cancellation-error-ui.json` | 7/7 | 当前 Play 的同码错误、未知错误及真实父端请求超时均保留可读提示；各场景规范文稿字节不变 |

错误反例中的 Play 同码和未知错误由公开 preview 协议信息材料返回给真实当前 Play 请求，经过实际 Workbench 与界面展示。
它们不是提供方失败或权限拒绝的运行证明，也没有替换后端。
超时反例扣留真实子端 `production-plan` 200，等待原有 15000 ms 父端计时器；从取得被扣响应到提示的观测值为 14973 ms，父端计时器建立略早。

两次最终运行均无 HTTP 失败、浏览器错误、规范文稿写入或模型与提供方调用。
两份记录的 browser、home、workspace、fixture 清理项全部为真。
四张 `audio-authoring-ux-matrix-{light,dark}-{1440,390}.png` 及三个错误提示截图均已逐张查看。
390 场景的 `pointer:coarse` 实际为 false，本次仅证明窄视口，不声称触屏控件验收。

## 保留的尝试与未覆盖范围

最初将子端取消码加入所有动作的正常取消名单，虽然该版本四组合通过，但会隐藏当前 Play 的真实拒绝。
该版记录另存为 `audio-authoring-ux-matrix-broad-guard.json` 及同名前缀图片，不计入最终结果。

独立第二个 Workbench 的协议消费者曾因准备与握手观察未完成而退出；`audio-authoring-ux-after-initial-protocol-setup.json`、`audio-authoring-ux-after-protocol-handshake-harness.json` 与 `audio-authoring-ux-after-scoped-protocol-harness.json` 保留原始状态。
最后一份包含四个已完成断言，但整体未完成；自有进程终止后清理项均为真，不将其算作通过。
最终错误反例改用正常界面的实际 Workbench，记录独立于这些未完成尝试。

本次没有更改导入后素材与转写的选择联动，没有验证真实 ASR、TTS、引擎失败或付费调用。
未新增 tracked tests，未运行测试套件，也未访问公共工作台服务。
