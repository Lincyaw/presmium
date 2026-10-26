# 同一时刻的稳定步骤选择

日期：2026-10-26。验证使用现有私有 Studio 17407、真实 WorkspaceService、查看器和讲授播放器，没有重启或修改公共 4320。

## 问题与处理

私有文稿包含三个稳定步骤，各自显示不同正文、场景命名状态与参数 10／20／30。最短停留为 `[0, 0, 4000]`，结束停顿均为 0，明确静音。Node 生成的计划本来正确：总时长 4000ms，三个起点都是 0ms，结束时间为 `[0, 0, 4000]`，`canPreview=true`。

原先选择步骤只把 `range.startMs` 发给播放器。选择第一步因此变成 `seek(0)`，按时间重放会包含同一时刻的全部事件，最终画面与 driver 留在第三步，而字段显示第一步。`production-zero-step-before.json` 保留该真实失败。

公共 `ProductionPlaybackCommand` 新增携带 `sectionId + stepId` 的 `step` 操作，继续绑定同一 source、完整 IR revision、planId 和请求回执。播放器从该计划解析实际步骤事件，复用原有导航的 `fold(time, eventBoundary)`，先暂停再恢复到选定事件。首次加载也保留所选事件边界。它没有增加时钟，也没有把零时长拉长。

暂停并按稳定步骤选择零时长片段时，字幕也按该步骤的真实讲稿选择；无讲稿显示为空。显式绝对时间定位和开始播放会回到原时间语义，正时长讲稿跨 cue 进入下一步时继续使用真实 utterance 时间。

绝对时间定位保留原义：`seek(0)` 仍重放所有 0ms 事件。明确选中零停留步骤时保持暂停；开始播放后，真实时序会自然越过它们。

## 实际操作

忽略目录中的脚本和 JSON 是定向真实消费者记录，未增加测试用例或运行测试套件。

| 操作 | 结果 |
|---|---|
| 顶部步骤按钮与时间线步骤按钮交替选择第三、第一、第二、第一、第三、第二步 | `production-zero-step-final.json`，16/16 中的六次选择全部通过；字段、实际场景状态／参数、driver 稳定步骤身份一致，实际时刻仍为 0 且暂停 |
| 首次加载、非法步骤 ID、旧 binding、版本化命令解析 | 首次加载保留第一步；无效目标拒绝且不移动当前状态 |
| 通过公开 `STEP_CLOCK.wait` 挂起实际画面准备，先选第一步再选第二步 | 旧请求只有取消回执，新回执采用第二步；未伪造 clock、音频或 source |
| 绝对时间 1000ms→0ms、零停留步骤后明确播放／暂停 | 保留原绝对时间语义；实际时钟推进后自然进入第三步，暂停回执确认后停止 |
| 暂停选择 Alpha／Beta／Gamma、零时长且无讲稿的 Beta、绝对时间 1s→0s | `production-zero-caption.json`，13/13；字幕与所选身份一致，无讲稿为空，绝对时间定位仍显示时间所属的 Gamma |
| 原有 bubble-sort 真实语音缓存，在原讲稿中插入 next cue，spoken text 不变 | 同一 13 项记录确认真实 cached 音段跨两个步骤；第二步仍显示原正时长讲稿，实际播放／暂停后字幕保持正确；未调用合成 |
| 只进行步骤与时间控制 | canonical 文稿内容与版本不变；语音生成请求、浏览器异常和 HTTP 错误均为零 |
| 经真实 Settings 切换浅／深色，1440px 桌面与 390px 粗指针设备 | `production-zero-step-matrix.json`，13/13；每种组合实际选择前两步并查看画面与字段，真实 root theme、场景、driver 与字幕一致，无横向溢出。窄屏使用原有“讲稿与配音／画面”切换 |

已实际查看 `production-zero-step-{light,dark}-{1440,390}.png` 四图。最初四图暴露字段和画面正确但字幕仍为 Gamma；浅色桌面与深色窄屏原图分别保留为 `production-zero-caption-before-light-1440.png`、`production-zero-caption-before-dark-390.png`，修复后用同一四组合重新核对。首版字幕观察脚本在位置仍为 0 时再次提交同值未触发控制，保留为 `production-zero-caption-observer-before.json`；改为实际 1s→0s 后通过，没有因此修改产品。一个早期观察脚本在点击暂停后尚未等待回执就读到 playing=true，记录为 `production-zero-step-pause-observer-before.json`；改为等待真实暂停状态后通过，没有因此修改产品。复现夹具准备中漏传目标目录与重复实体 ID 的请求被原校验拒绝，没有作为零时长产品缺陷。

## 页面事务的范围保护

同一轮补上 `#changeDocumentPage` 的源范围边界：捕获 documentScope、作者身份和文稿 ID；等待真实 flush 后再次核对，才修改当前文稿。最终返回值、错误反馈和 busy 清理也只属于原范围。

`page-operation-scope-proof.mjs` 在真实浏览器中打包公开 Workbench／WorkspaceClient 消费者，连接同一私有服务，只挂起公开 flush 的完成，不替代实际传输或保存。基线使用 Git 中修改前的 Workbench 源码：等待移动页面的旧操作在关闭并重开同一目录后仍返回成功，实际把新范围的页面顺序改为 `summary,intro,points`。原始失败保存在 `page-operation-scope-before.json`。

修复后的 `page-operation-scope-after.json` 为 5/5：旧操作返回 false，不改重开范围；旧 finally 不清除新页面操作的 busy 状态；随后当前范围的重命名仍正常保存，页面顺序保持原值。浏览器与 HTTP 错误均为零。

## 验证边界

使用真实静音计划和场景，无付费服务或伪音频；没有重新构建示例两讲。轻量检查通过：types 1152 个文件、layering、40 个工作区包发布结构、git diff --check。没有验证新的媒体裁切、导入录音、词级字幕对齐、系统输入法或非 Chromium 浏览器。
