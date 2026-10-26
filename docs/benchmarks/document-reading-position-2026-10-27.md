# 布局变化不改字幕目标

2026-10-27，从干净的 `346667eb` 在随机端口的独立 Studio 调查文档位置。文稿来自 `examples/animations/bubble-sort` 的私有副本；未使用 4320、17407 或作者文稿。

## 已确认的跳页

`document-position-active.json` 记录真实操作：导航选“一趟冒泡”，聚焦该页正文标题，再播放动画。动画与父位置进入 `pass--step-1`；打开工具栏“字幕”后，先暂停在该步，随后字幕侧栏却变为 `summary--step-0`。

该段时间线是：

- 1415 ms：父位置仍为 `pass--step-1`，意图为 pause。
- 1423 ms：侧栏引发正文宽度 1199→879 的 ResizeObserver 回调；scrollTop=568、scrollHeight=1449、clientHeight=881 均未变。
- 1438 ms：父位置变为 `summary--step-0`。期间没有新的正文 scroll 或 wheel。

根因在 `SourceDocumentPanel`：一次旧正文 pointerdown 把 `manual` 永久置为 true；后来的布局 resize 也会读取阅读位置。在滚动底部，阅读规则取最后一页，覆盖了刚暂停的动画目标。子预览只回报其所属 pass 步骤，没有发出 Summary 位置。随后输入实际保存到侧栏所示的 Summary narration；问题是目标被无意改选，文稿服务没有把写入投错实体。

对照 `document-position-audit.json` 中，直接点动画步骤、展开 inline 字幕和打开侧栏均保持 `pass--step-2`；只有显式 wheel 到文稿末尾才改为 Summary。截图中的组合既可能来自合理阅读滚动，也可能来自上述 resize，不能仅凭截图判断。

## 修改边界

正文阅读位置的 effect 改为一次性读取。ResizeObserver 同时观察自有滚动容器和正文 sheet，更新视口基线并取消待处理读取，不再拥有页面选择。真实 source-scroll 发生位移且宽度、高度和文稿总高度不变时，可以请求读取；这也覆盖 iframe 的原生 scroll chaining，无需父窗口收到 wheel。

每次请求保存当时的 documentPositionToken 与视口，下一帧只采用仍一致的请求。显式导航后的 effect 从真实 scrollTop 建立新基线；pointer、focus 和后来的 pause／seek 取消或否决旧读取。pointer 保留既有 documentInteraction 通知，真实滚动同样通知，以免旧页面操作回调重新抢焦点。没有永久的正文点击 latch、毫秒时窗、重试或 DOM 选区桥。

wheel、触屏与正文键盘阅读继续使用原生行为。wheel listener 可能已经读到合成器滚动后的 top，随后的同 top scroll 只忽略，不取消已经有效的显式阅读请求；几何变化仍取消。

## 预览释放的布局缺口

严格 gate 还暴露了真实布局变化：`document-block-viewport-before.json` 中，屏外 Stats 释放 iframe 后，同一卡片的运行区域由 120 降为 fallback 的 35.5，卡片由 256 降为 171.5，正文总高度缩短 84.5。最近真实测量高度仍在 React state，渲染分支却直接替换成短 Notice。没有放宽阅读 gate 或新增 scrollend 所有权来掩盖此变化。

公共 BlockPreview 现在让 iframe 与 fallback 共用一个持久 viewport。最近真实测量高度移到该壳，iframe 继承；未知高度沿用 default/min/max 令牌，不新增数值。`document-block-viewport-after.json` 5/5：同一 Stats 释放前后 viewport=120、卡片=256、正文 scrollHeight=1600，均不变。Figma 示例用既有 360 高度令牌展示状态，不作为实际运行测量值。

Figma [BlockPreview](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=98-1719) 补齐 `FallbackOverflow`／`FallbackFocused`；[对照帧](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=177-4351)复用现有 Notice 色、内边距与焦点令牌。没有业务控件覆写或新说明卡。占位时壳 tabIndex=0，live 时为 -1；阅读键只 stopPropagation、不 preventDefault，Tab 不处理。没有主动聚焦。

`document-block-viewport-focus.json` 22/22，亮暗×1440/390：真实 canonical alt 保存长文本，hold 的是实际 preview 200 回应；原生 Tab 进入壳，End 滚到第 120 条，正文 scrollTop 不变。放行回应后 iframe 实际 ready，仍为同一个 connected viewport 与 activeElement，随后 Tab 可离开。0 browser error／HTTP failure，最后 CAS 还原原 canonical。四张 `document-block-fallback-{light,dark}-{1440,390}.png` 已逐张查看。前两次在文稿未打开时误用首页的 Dsh 设置面板而遇到卸载，失败记录保留；最终从已打开的 Workbench 设置选择主题，没有为该观察缝改源。

还保留了一次 `document-position-viewport-inline-failure.json`：占位已修，wheel 前后总高度均 1600，但旧 ResizeObserver 只观察固定高容器，基线仍是打开 aside 时的 1648。inline 保存／跳步后的正文内容高度已先变为 1655、1600。现在同一 observer 也观察自有 `.pmw-source-document__sheet`，仅同步基线和取消请求；不观察依赖内部节点，不触发选择。最终原 inline 链实际通过，不用 scrollend、时间等待或 iframe 手势协议兜底。

## 真实验证与保留范围

脚本与原始记录位于忽略目录 `.presmium/` 和 `.presmium/ui-evidence/`，没有新增 tracked tests 或运行测试套件。

| 记录 | 结果 | 范围 |
| --- | --- | --- |
| `document-block-viewport-after.json` | 5/5 | 真实 iframe 释放前后，运行区域、整卡与正文总高度不变；canonical 未变 |
| `document-block-viewport-focus.json` | 22/22 | 四组合真实长 fallback、原生键盘滚动、同壳 ready 焦点保留与 Tab 离开 |
| `document-position-matrix.json` 与四份主题／宽度记录 | 20/20 | 亮暗×1440/390；正文聚焦、实际播放、打开侧栏暂停、无新输入观察、字幕保存和跳步 |
| `document-position-audit-after.json` | 3/3 | 点动画步骤→inline／aside→实际保存 Pass narration→下一步→iframe 原生 wheel 到 Summary→显式导航回 Pass |
| `document-position-touch.json` | 5/5 | 390 原生 CDP 触屏滑动；hit-test 确在可交互 iframe，父正文实际滚动后选择 Summary，侧栏对应 Summary |
| `document-position-keyboard-after.json` | 6/7，保留 Ctrl+End 未通过项 | 正文 Ctrl+Home、PageUp／Down、父正文 wheel，以及下述 Ctrl+End 未决边界 |

四组合均在打开侧栏后保持 `pass--step-1`，父位置、侧栏、inline 与预览公开 NAVIGATION 一致。原生输入后只改变 `pass--paragraph-2--narration`；所有 cue／pronunciation 原子逐项相等。保存后等新预览实际回到该步，再跳到 `pass--step-2`。截图为 `document-position-{light,dark}-{1440,390}.png`，均已逐张查看。

本轮 public Workbench.getState／subscribe 与 native editor 的 getTextCursorPosition／onSelectionChange 观察器只存在于 isolated bundle，原方法原样委托，只暴露只读摘要。native blockId 按规范 rich node ID 映射页归属，不读取全局 DOM selection。观察器 diff、产物 SHA 和源文件 SHA 另保在 `document-position-observer.json`（before）与 `document-position-observer-after.json`（最终），鉴权 URL 与凭据不进入证据。

首个候选只接收父窗口输入手势，漏掉 iframe wheel；失败原样保存在 `document-position-gesture-frame-wheel-failure.json`。一次把两个消费者并发到同一私有文稿，正确触发版本冲突，另保为 `document-position-concurrent-consumer-conflict.json`；最终消费者按顺序运行。曾等待屏外懒挂载 iframe 必须 ready 的失败也另保为 `document-position-hidden-preview-readiness-harness.json`；最终只等待当前真实操作所需的控件与版本，不要求隐藏 iframe 常驻。最初把 BlockNote 的顶部留白误当作必须 scrollTop=0 的断言已校正，没有改产品去满足像素断言。

## 尚未解决的原生光标边界

Ctrl+End 后，公开 native cursor 为 `summary--paragraph-1--text-0`，规范正文 block 为 `summary--paragraph-1`、页归属 Summary 且 native editor 仍聚焦；父位置仍为 `pass--step-0`。这项不能因 5% 阅读 band 自洽而判通过。后续应通过 BlockNote 的公开选择信号协调编辑位置与阅读位置，本次没有加 End 键直接跳页规则，也没有宣称该问题已解决。

令牌检查通过（39 stylesheets），`git diff --check` 通过；未运行测试套件。自有 Studio、浏览器与临时 workspace 清理见 `document-position-cleanup.json`。
