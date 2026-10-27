# 未确认放映修订的恢复动作

2026-10-28，隔离 worktree `presentation-snapshot-actions`，基于 `e5473e52839859f9a92f708d39f212a37c5529e6`。先前真实源更新已确认整 iframe 的 `visibility:hidden` 同时遮住“重新编译”和“退出放映”，见[共享查看器事件记录](viewer-shared-events-2026-10-28.md)。本片保留版本门禁，将它收窄到画面，复用原底栏及原暂停、准备、退出动作；没有第二工具栏、时钟或内容 writer。

## 实现边界与设计

实际读取 Figma 正式 I09 `40:4654` 与 Present `9:27` 的上下文和截图，复用公共 PmIconButton、Lucide 图标和既有布局。仅精确更新设计规则文字 `12:6512`，登记在 `figma-nodes.json`；没有新组件、素材或页面私有控件样式。

仅 DocumentView 的显式 Present 启用可选确认能力。子查看器默认关闭画面，父页面只确认原 prepare 成功的真实 revision；子页面严格比较当前 IR revision。新 IR 同次渲染使画面隐藏且 inert，字幕和插件层不挂载，其他底栏动作使用公共 disabled 状态，快捷键也受门禁约束；重新编译和退出继续可用。旧确认不能开放新修订，未确认位置不报告，父池另拒绝其位置回写。Standalone、Video 和无该能力的旧 iframe 保持原行为，未改 ProductionPanel。

首次实现发现 ready 先依赖 position，而默认关闭确认又不报告 position，真实首载因此循环等待。已让 ready 与排队诊断独立于可选位置，仍保 active、来源、窗口和代次边界；确认后重新报告真实位置，不构造默认位置。

已知 snapshot 不匹配、frame 已就绪且没有实际 prepare 进行时，只用既有短状态“文稿已更新，请重新编译”／“Document changed; recompile”。首次或正在准备仍用原加载状态，不新增常驻说明。

## 实际界面验证

全部使用原版 `startStudio({isolateClient:true})`、动态私有端口、私有规范文稿、真实 Motion 场景和 Chromium 原生点击。没有模型、ASR、TTS、作者文稿或公共 4320/17407 请求，没有测试套件或新 tracked tests。每轮只准备所需小文稿的 web 形态；下表是独立材料，不合并为一轮通过数。

| ignored `.presmium/` 记录 | 结果与边界 |
| --- | --- |
| `presentation-snapshot-actions-1793121261533` | 候选真实首载失败：规范夹具通过，iframe 45 秒未完成 ready；原因是上述 position／ready 循环，属于实现失败，不归消费者。保留原红。 |
| `presentation-snapshot-actions-1793121342617` | 两桌面共前 12 项通过，随后窄屏消费者误用“导航”而实际名称为“导航窗格”，完整脚本失败并清理。 |
| `presentation-snapshot-actions-1793121470794` | 同一冻结运行源，两桌面前 12 项通过；消费者第二次误用“页面”，后续窄屏未完成。保留原记录。桌面已真实完成源更新、旧确认拒绝、底部重新编译与退出；浅色还实际中断下一次 IR 请求，失败后底栏仍可重试，再准备成功。 |
| `presentation-snapshot-actions-1793121563497` | 仅两窄屏，13/13 完整通过；暗窄使用英文文稿和界面。真实课堂 MCP navigate 经实际审批、同 owner HTTP 确认后将隐藏模型移至 Intro，画面仍隐藏；原生退出回作者原 Motion 页，磁盘 SHA 不变，无额外 canonical 写入。 |
| `presentation-snapshot-copy-1793122063659` | 短状态增量：浅桌实际显示正确短原因并点击退出；暗窄实际显示正确英文，但消费者把既有英文分号误写成句号，观察器断言失败。保留 9 项通过及该红，未改界面文案迁就断言。 |
| `presentation-snapshot-copy-1793122124958` | 只补暗窄，7/7；原 catalog 的 actual／expected 均为“Document changed; recompile”，原生重新编译仍采用新确认画面。 |

每种组合均确认初始画面和主题、真实外部 canonical CAS 更新后画面 hidden／inert、两个恢复按钮在父文档 `elementFromPoint` 命中 IFRAME，再实际点击原按钮。旧 revision 确认消息不能重开画面；重新编译呈现新标题，退出卸载完整 iframe并保留原页。两窄屏与最终短文案链另核磁盘及无额外写入。只以实际 1440／390 的浅暗四组合验收，不将窄屏等同触控设备。

网络失败使用真实请求 abort，不伪造成功响应；没有故意破坏公共服务或降低版本门禁。早期桌面消费者只在最初 context 装了外网拦截，不能据其空数组宣称完整矩阵主动拦截覆盖；后续消费者每个 context 均拦截并记录非回环请求。夹具与服务均未配置模型引擎。

四组合截图已实际查看：pending 时只有短状态、隐藏画面与原底栏，确认后真实 Motion 画面正常；不是线框或仅 DOM 存在断言。首轮旧“正在打开文稿”截图保留，最终短状态的浅桌与暗窄图另存，未覆盖旧图。

## 最后定向协议收口与谱系

公开 `connectPreviewFrame` 的小 Chromium 消费者使用真实 iframe、原生消息信封和实际 revision，position 回调始终 undefined；在 ready 之前排入一个真实 API 错误报告。`preview-ready-diagnostics-1793122394042` before 4/4 证实 ready 到达但排队错误被位置门槛卡住；`preview-ready-diagnostics-1793122394855` 最终 after 4/4 同时收到 ready 与该错误，始终没有 position 消息。它不启动 Studio、模型或新的业务场景，不替代四组合验证。 首次 `1793122254652`／`1793122285257` 在 HTML head 执行而 body 尚未创建，API 安装 DOM observer 时失败，均 0 断言超时并全清；修正为显式 body 后再运行，原红不作通过。

四组合之后只改 PreviewPanel 的短状态条件，及 kernel 中排队诊断在 active 时先于可选位置刷新。最终 manifest 逐文件记录与前述材料的 SHA，逆差分精确还原业务链字节；没有把桌面未完成的整个脚本改为成功，也没有为这些增量重跑全业务矩阵。最终清单在 `.presmium/ui-evidence/presentation-snapshot-actions-final-manifest.json`，含原 raw、截图、运行源、Figma ledger 与清理状态。

所有自有 Studio 前后端、浏览器、公开 API 消费者 HTTP server 与临时 home／workspace／fixture 均已关闭或清除。类型、分层、令牌、技能、包及 diff 轻检在最终清单记录。未验证所有浏览器、复杂媒体插件错误、完整 BFCache 或操作系统触屏；正常功能中的版本与来源守卫继续保留。
