# 加载期间选择制作步骤

日期：2026-10-26。使用已有私有 Studio 17407 与真实 bubble-sort 课程的独立副本，不重启公共服务，不改原课程或示例工作区。

## 复现与原因

`production-early-selection-before.json` 记录没有编辑或保存的真实交错：浏览器先收到 iframe 首次制作计划的真实 200 响应，但暂缓向该请求交付；作者立即选择 pass 页第一步、第二步，然后放行响应。源版本和 fingerprint 始终相同，20 秒后播放器仍 unavailable，播放按钮禁用、时刻未知。

实际子窗口命令依次为 `load(req1) → go(pass,0) → pause(req2) → go(pass,1)`。加载尚未 ready 时，工作台把稳定步骤选择降为普通 `go`；该命令取消了正在准备的制作播放器，后续没有新的加载请求。它与编辑后源版本变化导致旧预览失效是两个不同边界。

制作步骤现在直接携带稳定身份和当前 source／IR revision／planId。没有 ready driver 时，由同一已注册 loader 准备实际计划和媒体，再用已有事件边界恢复所选步骤。新的目标继续取消旧请求；同一目标的重复字段 focus 复用待完成请求。父窗口在该稳定步骤回执前忽略旧 present cursor，原有 document 退出仍传到外层工作区。

没有增加时钟、自动播放、合成或自动编译。编辑使源变脏之后仍需作者明确编译当前保存版本，不复用旧绑定。

## 实际验证

| 记录 | 真实结果 |
|---|---|
| `production-early-selection-after.json`，7/7 | 与 before 相同的首个真实 iframe 计划响应延迟、仅选择 pass 第一／第二步。放行后无需刷新即 ready，停在第二步，没有自动播放；编辑字段始终对应该步骤 |
| `production-early-selection-focus-after.json`，8/8 | 暂缓所有实际 iframe 计划响应，选择第二步后聚焦最短停留字段；同一目标没有额外 step 请求。放行后只采用最新请求的第二步回执 |
| 两条记录的源与传输 | 文稿版本和内容不变，合成请求、浏览器异常、HTTP 错误均为零；真实计划、媒体和时钟未被替代 |

实际 after 子窗口收到 `load(req1) → pause(req2) → step(pass0,req3) → pause(req4) → step(pass1,req5)`。旧请求取消，最新请求返回第二步 ready；加载过程中初始 intro 的位置流没有覆盖当前字段。截图为 `production-early-selection-after.png` 与 `production-early-selection-focus-after.png`，已实际查看。

轻量检查通过：types 1152 个文件、layering、40 个工作区包发布结构与 git diff --check。独立源码审查通过；没有把源码审查当作浏览器验证。

已有 `production-early-input.json` 的五次真实早期输入均正确保存到 pass 第二步；原先一次“填入后未保存”的现象未重现，本修复不宣称解决了丢输入。

## 验证边界

本轮只验证现有缓存与当前完整绑定的加载／步骤交错。没有运行测试套件、新增测试、全量构建示例或调用付费语音。浏览器为 Chromium，未验证其他浏览器或真实系统输入法。
