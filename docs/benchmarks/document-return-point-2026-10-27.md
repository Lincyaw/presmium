# 文档草稿恢复与稳定返回点

2026-10-27，在独立临时工作区、隔离客户端和随机真实 Studio 端口上完成。
主线发现：新增中间页的未保存标题、正文和列表能恢复并重试落盘，但重开后当前页／步骤丢失。
修复后主线 **13/13**，中段提示与重试的四显示组合 **17/17**，当前目标被移除的窄链 **6/6**，稳定身份与晚响应边界 **9/9**，另补同目录身份替换及合法冲突草稿 **5/5**。
没有把第一份完整记录中的失败、后续弱观察器或仅磁盘先写算作全部通过。

## 真实主线与两个原因

消费者从提交 `936a7b58` 读取原三页模板作为私有种子，避免并行的新空白模板改动影响中间页身份。
使用同一个 Chromium context 和同一标签页，实际点击页面导航／新增、输入标题与段落、键入原生双项列表，再让浏览器实际离线。
没有伪造服务响应、DOM 输入事件或选区，没有以 API 改源代替本条正文编辑。

`stage-a-recovery-journey.json` 记录诊断完成，共 12 项中 11 项通过：

- 中间页、Step 与正文身份真实生成并保存后，再离线输入标题、段落和列表。
- `document/change` 实际以 `net::ERR_INTERNET_DISCONNECTED` 失败；磁盘规范内容不变，sessionStorage 草稿完整且通过 kernel validator。
- 关闭文稿回首页，再同标签页 reload 后重新打开；显示“已恢复待保存草稿”，不自动提交。
- 显式重试能写入完整草稿；但重开与重试后 `position` 均为 undefined，页面导航没有当前项。
- 后续明确重新选择中间页，再进入／退出放映，内容与所选页步能保持；这不算自动恢复位置成功。

Workbench 的 open／close 原本用 DOCUMENT_RESET 清除位置；DocumentSession 只持久化内容和保存版本，没有页步返回点。
原 root-reload checkpoint 仅用于 root bundle 替换，不负责普通重开。

第一版返回点恢复后，`stage-a-recovery-journey-after.json` 的原 12 个断言通过，但补读快照发现重试后又选中 Intro。
该份没有覆盖“重试后仍同页”的强断言，不能拿它证明整个目标完成。

`stage-a-recovery-retry-timeline.json` 随后记录真实 DOM／公开 Workbench 状态：

| 时间点 | 观察 |
| --- | --- |
| 恢复后 scroll | 文稿 scrollTop=90，返回点为中间页；恢复提示已滚出视口 |
| 点击重试的 pointerdown，904.1 ms | scrollTop 已被浏览器滚至 0 |
| scroll，916.3 ms | 提示仍在，scrollHeight 仍为 971；不是提示移除后的高度变化 |
| Workbench，917.1 ms | 正常阅读跟随采纳 Intro |
| 提示 focusout，923.7 ms | 随后才完成提示移除 |

点击隐藏在顶部的重试动作必须先滚回开头。处理该问题需要让提示可达，不能禁止真实阅读滚动或保存后强制跳回。

## 实现边界

`document-return-point.ts` 只保存临时 UI 地址：以实际 source.identity（工作区根与文稿 UUID）为键，保存稳定 Section／Step ID 和页标题相对视口的偏移。
它不存正文、BlockNote JSON 或另一份编辑模型，也不发源事务。
普通打开恢复有效目标与文稿滚动，不抢正文焦点，不进入放映或播放音频；没有历史点时明确初始化首个规范页面与实际首步骤。
有历史点但目标不存在时不按新数组序号猜测，按需显示“上次位置已移除，请重新定位。”；新页面、步骤或正文选择清除提示。

source ready、当前原生 editor binding 和 viewport 都匹配后才采用一次返回点。
新打开、实际交互、焦点、选择或来源变化取消旧意图；ResizeObserver 只调整尚未被新交互打断的恢复布局，没有固定等待或新播放时钟。
运行位置只有在 source／snapshot／项目修订／完整 IR 与实际 frame revision 全部一致时，才通过完整 IR stepIds 映射到作者身份；不确定的运行位置不覆盖有效 Doc 返回点。

`openDocument(dir, { focus: 'body' })` 专供显式新建：通过同一就绪与 binding 检查后，复用公开原生光标命令聚焦首个可编辑 inline 正文。
普通打开不启用此行为。表格或只含不可编辑节点的自定义模板没有在本轮声称自动聚焦首格。
位置存储失败被捕获，编辑和源保存不依赖返回点存储；浏览器明确拒绝存储的场景未另行作为真实权限验收。

SourceDocumentPanel 把仅在异常／恢复时出现的紧凑恢复、保存与位置 PmNotice 组合进独立 sticky 布局容器；可展开的完整 issues 诊断保留在普通文稿流，不形成粘滞长列表。
复用既有 z-index／spacing 令牌，不改变公共按钮、Notice 外观或真实滚动跟随。
Figma I01 既有重试状态 `41:175` 的说明与规则 `41:209`、`41:221`、`41:222` 已同步；没有创建新控件。对应交互 JSON 与节点 ledger 同步，截图已查看。

## 实际结果

`stage-a-recovery-journey-final.json` **13/13**：

- 相同中间页的标题、段落、双项原生列表与稳定 Step／富文本身份在断线、关闭文稿、reload 和显式重试后保留。
- 恢复前不自动写入；重试后真实磁盘等于整份草稿，提示消失且保存状态已确认。
- 重试不改变页步，页标题相对视口偏移变化不超过 1 CSS px；没有补发跳回旧位置的动作。
- 明确进入放映显示已恢复的实际内容，退出仍为同一页步、单正文 BlockNote；未自动进入制作或放映。
- 浏览器异常与 HTTP 错误为 0；预期离线失败和正常取消的订阅单独记录。

`stage-a-recovery-notice-matrix.json` **17/17**：

- 浅／深色分别在 1440 与 390 宽度实际运行，四轮各做原生输入、离线失败、reload 恢复和重试保存。
- 使用长前页使中间页确实离开初始视口；每轮恢复时文稿 scrollTop>100，重试按钮位于当前视口且 elementFromPoint 命中它。
- 真实重试后源等于对应草稿，仍选中同一稳定页步，相对偏移差不超过 1 CSS px。
- 窄屏使用真实 coarse 浏览器条件，按钮高度至少 44；单个正文编辑器、规范 schema 和 Doc 模式保持。
- 八张恢复／保存图实际查看；0 浏览器异常、0 HTTP 错误。

`stage-a-active-return-target-before.json` 的 6 项中 1 项实际失败：离线新增的本地页被显式丢弃后，position 仍指不存在的 UUID，未提示。
constructor 原来仅处理仍存在的 Step 移动，没有处理旧稳定目标被移除。
对应 `stage-a-active-return-target-after.json` **6/6**：清除失效位置并提示，作者明确选 Summary 后清提示；原三页规范内容不变，没有因定位写入 JSON。

`document-return-point-boundaries.json` **9/9**：

- 实际字幕面板选择第 3 步，再关闭；受源版本保护的真实 agent 事务将页面重排，并把同一 Step 从 index 2 移到 0。重开仍为相同 Page／Step ID，不复用旧索引。
- 不同文稿 UUID 故意使用相同 Page／Step ID，打开另一文稿仍初始化其首项，不串用返回点。
- 持有真实 GET 响应期间，作者实际选择 Summary；放行响应后仍保留新选择，不重新聚焦正文。
- 当前 Step 通过真实源事务移除后，不能静默接到同索引新 Step；显示失效提示，明确重新定位可清除，读取与定位本身不再写源。
- 0 浏览器异常、0 HTTP 错误。两次受控 agent 源事务属于本条制造来源变化的前提，不与定位的零写入混淆。

## 同目录身份替换的最后守卫

静读发现缓存目录的实际 UUID 被替换时，DocumentSession 会保留旧内容与旧 identity 作为待核对 UI，并设置 `document-identity-changed`。
单看旧 slot 的 identity 不足以授权继续恢复返回点。
Workbench 在该明确错误下只取消 pending 返回点／新建焦点，不删除内容；没有把所有 error 一概禁止，合法版本冲突草稿仍可定位。

`document-return-point-identity-guard.json` **5/5**：实际私有文件 UUID 替换后，真实 GET 返回新 UUID；重开缓存目录明确报告身份变化，旧点未采用、正文未聚焦、没有新源事务。
同一次消费者另在另一文稿中实际离线输入，再制造同 UUID 的外部版本变化；reload 后确为 `document-version-changed`，合法本地草稿及 Points 位置仍恢复，磁盘外部内容不被覆盖，也不自动提交。
0 浏览器异常、0 HTTP 错误。

这是完整恢复／四组合与首页验收结束后补的一条单分支守卫。各原始记录保留自己的源码摘要，没有把早先记录改标为最终整文件 SHA。
本记录的恢复消费者验证普通打开不抢焦；首页成功创建后的焦点交接及最终 ACK 由同轮独立首页消费者验证，没有沿用仅等磁盘先写的早期结论。

## 观察器记录与清理

以下中间失败原样保留，没有为它们改产品：

- `stage-a-recovery-journey-selector-oracle-before`：旧导航 role 定位与当前 button 不符。
- `stage-a-recovery-journey-observer-commands-before`：旧观察器漏转发 attachDocumentEditor 新增 commands 参数，导致新增早退；最终完整转发 rest 参数。
- `stage-a-recovery-journey-presentation-selector-before`：同时匹配只读文章与放映中的相同文字，最终限定实际 `.pm-present`。
- `document-return-point-boundaries-scroll-threshold-before`：实际 scrollTop=100，却被任意的 >100 前置阈值拒绝；身份本已正确，最终只要求有真实非零滚动。
- `document-return-point-boundaries-route-delivery-before`：消费者先 unroute 后 fulfill 导致 Playwright 抛错；独立清理记录 `document-return-point-route-cleanup.json` 证明其 4 个目录与 2 个端口已清，最终等待实际 delivery 后再撤观察器。

最终各消费者的浏览器、Studio、home、workspace、fixture 与私有观察器均已清理；统一端口复核见 `document-return-point-cleanup.json`。
原始记录、日志和截图仅保留在忽略目录且权限 600，完整启动 URL 与凭据未输出。
没有操作公共 4320／17407、作者文稿或全局客户端构建，没有新 tracked tests、测试套件、模型或付费调用。

本轮重开指关闭文稿入口、同标签页刷新再打开，不宣称浏览器关闭标签页后创建一个新标签页会继承 sessionStorage。
返回点恢复页、步骤和滚动；不宣称刷新保留原生 Undo 栈或精确文字选区。
没有以本轮浏览器快捷键替代真实系统输入法验收，也没有把纯文本旅程扩称所有插件节点、浏览器与运行步骤筛选组合均已验证。
