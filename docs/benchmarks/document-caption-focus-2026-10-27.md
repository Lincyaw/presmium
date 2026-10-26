# 行内字幕焦点保留步骤

2026-10-27，以 `16ded6c8` 为起点，在随机实际端口的独立 Studio 使用 `bubble-sort` 私有副本。没有使用 4320、17407 或作者文稿，没有运行测试套件或新增 tracked tests。

## 预期与正常阅读

RFC 4.3 规定正文、动画和字幕共用稳定步骤，焦点不应被旧正文位置覆盖。现有 `Workbench.#selectedSteps` 保存每页的选步；`observeDocumentSection` 在阅读返回该页时恢复它。离页 BlockPreview 显示该页初始步，运行端收到外部 seek 后不回写位置。这一离页显示策略本身没有在本次修改。

`document-offpage-focus-loss-before.json` 的真实 wheel 链确认：Pass 选第 3 步 `pass--step-2`，展开 inline；滚到 Summary 后，父位置为 Summary，Pass 页脚与子 NAV 稳定在第 1 步；滚回 Pass 时，父位置、页脚、字幕与子 NAV 都恢复 `pass--step-2`。仅离页阅读没有清掉选步记忆。

## 已确认的两处缺陷

第一处发生在返回 Pass 后聚焦 inline：

- 3762 ms：字段获得焦点，暂停在 `pass--step-2`，位置代次为 9。
- 3767 ms：将字段带入视口的原生 scroll 事件到达，scrollTop=719、scrollHeight=1600；期间没有新的 wheel。
- 3771 ms：阅读回调按文稿底部规则选择 Summary，代次为 10。
- 3775 ms：原字段因步骤变化卸载而失焦；随后聚焦新字段时已变成 `pass--step-0`。

后续输入实际保存到当时显示的 `pass--paragraph-1--narration`，服务没有串写实体。错误是已冻结的第 3 步被滚动回调改选，导致编辑目标和焦点变化。原读门槛只处理聚焦的正文 native head，没有处理自有 ShadowRoot 内聚焦的 NarrationEditor。

第二处由无写入的 `document-offpage-focus-counterexample.json` 排除旧版本因素：iframe 与 actor 的 sourceVersion 均为 `fb58090178ffcd0f6d47`，真实点击第 4 步后子 NAV 为 step 3，位置消息携带当前代次，但父位置与页脚仍为 step 2。iframe 在点击前后均为 parent document 的 activeElement，未再次触发父 iframe 的 onFocus；`editingStep` 因而仍拒绝这个新的本地操作。该记录中的 Tab 准备动作没有形成字幕焦点，不作为 Tab 可达性证明。

## 修改

`focusedDocumentField()` 只读现有 active history editor 与字段登记，校验 native focus、存活状态、identity、reset 和当前 step／slot 绑定；不保存第二份文本或步骤。SourcePanel 在既有代次与几何门槛后，仅对自有 ShadowRoot.host 内、native head 仍可见的字段恢复其明确 StepID。inline head 离屏时仍允许阅读切页；aside 在 source 外，不形成长期阅读锁。

BlockPreview 在原 origin、source、revision、source version、步骤归属与位置代次校验后，若 iframe 当前确实聚焦，解除旧 `editingStep` 保护并采用新的位置。字段仍聚焦时保留保护，不放宽版本或代次校验。没有时间窗、重试、DOM 选区桥、全局字幕锁或新的交互模式。

## 实际验证

原始记录和脚本均在忽略目录 `.presmium/` 与 `.presmium/ui-evidence/`；before 没有覆盖。

| 记录 | 结果 | 范围 |
| --- | --- | --- |
| `document-offpage-after.json` | 9/9 | 真 wheel 离页／返回、稳定 NAV、聚焦保第 3 步、inline 与 aside 的真实输入和 CAS 保存、第 4 步直接接管、离页显示字段的一致绑定 |
| `document-offpage-focus-counterexample-after.json` | 2/2 | 同 sourceVersion 的真实 iframe 点击同步父位置与字幕，0 文稿写入 |
| `document-offpage-reading-boundaries.json` | 5/5 | 可见 inline head 保步；滚离 inline 后可读 Intro；aside 聚焦后真实 wheel 仍可切到 Summary，0 文稿写入 |

主链两次写入只改变显示的 `pass--paragraph-3--narration`，正文、cue／pronunciation 原子保持相等。两份反例无写入。三份 after 记录均无浏览器错误、HTTP 失败或语音生成请求。只重建自有 isolated client，没有全局构建或服务重启。

类型检查通过（1168 files），`git diff --check` 通过。构建源 SHA 与只读观察器 diff 见 `document-offpage-build.json`；自有浏览器、Studio、临时 workspace 与凭据 metadata 的清理见 `document-offpage-cleanup.json`。
