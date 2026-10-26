# 制作预览返回正文

日期：2026-10-26。范围是视频制作中的内层放映退出、父级文档视图归属与已有草稿保存通路。

## 已确认的问题与修复

在私有 Studio 17407 中复制冒泡排序文稿，通过真实浏览器按钮进入视频制作。内层“上一步”和“下一步”能够先暂停，并同步实际播放器、父时间线和当前讲稿字段。内层“退出放映”和 Escape 却只把子查看器切回文档：父级仍处于制作工作区，画面变成“画面尚未准备”，播放禁用，实际时刻不再显示。

`DocumentView` 现在记录同一文稿、同一工作区上一次已提交的查看模式。制作工作区从实际放映回到文档时，调用已有 `exitPresent`：等待暂停确认，沿用退出代次及来源检查，再回到原正文编辑器。首次进入制作时的初始文档模式不会触发退出；没有新增播放时钟、草稿存储或页面切换协议。

## 真实验证

忽略目录中的 `.presmium/caption-preview-investigation.mjs` 保留修复前调查，原始记录为 `.presmium/ui-evidence/caption-preview-investigation.json`。九项检查通过的含义是调查完成；其中 `confirmedExitIssue: true` 及退出、Escape 两次观察明确保留实际故障，不表示修复前体验通过。截图为 `caption-native-exit.png` 和 `caption-native-escape.png`。

修复后消费者为 `.presmium/caption-production-exit-after.mjs`，使用同一私有 Studio、独立文稿副本和真实接口。原始记录在 `.presmium/ui-evidence/caption-production-exit-after.json`，14/14 通过，检查包含：

- 三次进入制作均不因初始文档模式反弹；实际加载成功后才进行退出操作。
- 父级配音对话框内的 Escape 只关闭对话框，不穿透制作工作区。
- 内层退出按钮和 Escape 均返回正文；通过实际 DOM 引用确认保留同一个正文编辑器，没有以重建掩盖退出问题。随后等待期间未出现返回失败提示。
- 两次未编辑的退出保持源版本及指纹不变。
- 截住真实讲稿保存响应，继续输入第二段文字后使用仍可达的“返回文档”。放行响应后，两次直接读取 canonical 文稿均确认续输内容已经保存；原正文编辑器保留。讲稿变脏会正常隐藏过期预览，因此没有强行点击隐藏 iframe 中的按钮。
- 未请求语音生成，没有浏览器异常或 HTTP 错误。唯一内容修改发生在消费者自己的副本。

中间探针误把 `DocumentAnswer.document` 当作实体；实际实体位于 `content`。失败记录 `caption-production-exit-cache-probe.json`、`caption-production-exit-pending-save-probe.json` 和 `caption-production-exit-response-shape-probe.json` 保留，不能用作产品丢稿或缓存错误的证据。最终检查读取 `content.narrations`，没有修改产品保存逻辑来迎合探针。

独立源码审查覆盖视图边沿判断、首次进入、文稿切换、非活动视图及现有退出 Promise 的归属。轻量类型检查通过，覆盖 1150 个文件。本次没有样式修改，仅在桌面 Chromium 中实际执行以上流程并查看修复后截图；未新增测试、未运行测试套件、未重复全量示例构建，也未将其视作字幕设置或其它浏览器的验收。
