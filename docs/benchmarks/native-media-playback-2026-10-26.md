# 原生媒体播放互斥：2026-10-26

`PmMedia` 的视频与音频保留浏览器原生 controls、currentTime、loop 和解码器，加入公开
`PLAYBACK_CONTROL` 租约。组件不增加时钟或播放协议。原生 play 事件先暂停媒体，排空本次
pause 事件，再申请授权；只有相同源、相同步骤、相同存活代次的授权可以恢复播放。

本次仅修改 addon-content 的组件、共用浏览器 hook 和双语错误文本。错误使用已有
`PmNotice`，没有业务控件样式或跨域播放器适配。

## 原问题与结果

在独立 Studio 的同一真实 Doc 中，原生媒体与动画分别位于独立的只读预览 iframe。
修改前两种启动顺序均同时播放：

| 顺序 | 原生视频 currentTime | Scene 时间 | 结果 |
|---|---|---|---|
| 视频先、Scene 后 | 0.3118 → 0.7968 秒 | 3164.8 → 3648 毫秒 | 两者持续播放 |
| Scene 先、视频后 | 0.1590 → 0.6406 秒 | 3182.0 → 3665.4 毫秒 | 两者持续播放 |

接入租约后，四次间隔 140 毫秒的观测均只有后启动者继续推进：视频先启动时停在
0.0542 秒，Scene 从 3147 推进至 3597.1 毫秒；Scene 先启动时停在 3032.7 毫秒，
视频从 0.2056 推进至 0.6532 秒。音频的两种顺序同样通过；视频与音频之间也实际互斥。

## 实际验证

两个隔离 Studio consumer 分别在 17369、17370 启动，先完成私有 client 构建再启动宿主，
没有首屏失败后 reload。未触及用户的 4320 服务、原有两讲或默认工作区副本。

- 主 consumer 23 项通过：视频/Scene 和音频/Scene 的四种顺序、视频/音频互斥；
  等待真实父授权期间暂停；切步、其他卡片播放及刷新后不接受旧授权；授权拒绝后的可读
  提示与重试；真实无效媒体 Blob 的解码错误；原生 Pause、循环和拖动；普通 reader 的互斥。
- 授权延迟通过暂缓传递真实父 grant 消息产生，保留原 origin、source、revision 与 request；
  它验证取消和迟到结果，不冒称真实服务故障。解码错误由浏览器真实媒体加载产生。
- 自动播放 consumer 6 项通过：记录了初始 Doc seek 取消原生 autoplay 的事件顺序；
  普通 reader 在 2 秒后 currentTime 为 2.0173、paused 为 false；Doc 主动 Play 可播放，
  随后用户 Pause 并切步往返，currentTime 始终为 0.033、paused 为 true。
- 29 项合计通过，两个 consumer 的 pageerror 与 HTTP 失败均为 0。
- 1440 与 390 宽度、实际浅色与深色设置下的四张提示截图均已打开查看。视频、音频原生
  控件可见；窄屏错误文本换行，卡片未横向溢出。
- 定向类型检查、分层检查与 diff 检查通过；未新增测试，未运行测试套件、全示例构建或付费服务。

## 自动播放边界

文档编辑中的初始定位是明确的暂停/seek 意图。本次记录中，原生 autoplay 开始后，父初始
seek 在等待暂停事件期间到达，因此该播放被取消且不再自动恢复；作者可点击原生 Play
重新走同一授权。普通阅读继续使用原生 autoplay 与浏览器策略，不用计时器重试。
用户 Pause 后，步骤或可见范围变化不会主动调用 play。

YouTube 跨域播放器、真实音色试听、其它浏览器以及硬件解码差异未在本次验证中覆盖。
本次不声称这些播放器具有相同的控制能力。

## 可复查证据

忽略目录中的脚本与数据：

- `.presmium/media-control-review.mjs`、`ui-evidence/media-control-review.json`：修改前两顺序。
- `.presmium/media-playback-consumer.mjs`、`ui-evidence/native-media-playback.json`：23 项。
- `.presmium/media-autoplay-consumer.mjs`、`ui-evidence/native-media-autoplay.json`：6 项与事件顺序。
- `.presmium/ui-evidence/native-media-{light,dark}-{1440,390}.png`：实际四组合。

证据不包含服务 token 或启动地址查询参数。独立服务和浏览器均已关闭。
