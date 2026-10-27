# 恢复期间的再次刷新与后续导航

2026-10-28，基于 `ad75f6ac` 的独立私有 Studio。用户接受新建页 100 多毫秒，本片不再调整性能；处理实际复现的连续刷新丢入口，以及旧恢复回调覆盖作者后续选择。

打开文稿的地址在待恢复期间保留，明确回列表或选择其它文稿时更新。监听与持久入口由一个 root owner 管理，退役后异步 finally 不得再次写入口。打开时的同步中间 Home 不作为作者回列表处理。WorkBench 暴露的导航序号仅属于当前实例的打开／关闭，不是规范源或播放版本。

最终采用前仍由原 `DocumentSession.open` 核预期工作区与文稿身份，移除一次重复正文预读。HMR 页步作为可选 fallback 交给 Workbench 既有 opening controller，已有浏览器返回点优先。它沿用稳定页步、源身份与 reset／version／content、打开作用域、选择代数及可信交互取消，不在 history 请求完成后另行跳页。进入 Doc 不编译、不进入制作、不播放。

## 原始材料与范围

原始消费者与 JSON 位于 `studio-repeat-reload` worktree 的忽略目录 `.presmium/ui-evidence/`。以下计数属于各自消费者，不相加作为整体验收。

| 记录 | 实际结果 |
| --- | --- |
| `repeat-document-return-1793135118177/result.json` | 原实现的 6 项反例材料完成：第一次恢复读取尚未返回时再次刷新丢地址；恢复期间明确回列表又被旧请求打开；Home 后重开同文稿并选新页步仍被旧 checkpoint 覆盖。`productCorrect:false`。SHA-256 `1fc42b77038febb2ffa3d94e512ae8536b0a5aad87398cc83d24830e55175e6d`。 |
| `repeat-document-return-1793135269013/result.json` | 第一候选失败，0 项完成，实际同步中间 Home 清除了入口；已修正。JSON 中 phase 推导的 `productCorrect:true` 不是通过证明，以 `complete:false` 和失败原文为准。SHA-256 `574c1fa433cc4e758ccba70b410c2a6d5221feda052f23658c2d6ccb5dec1cd9`。 |
| `repeat-document-return-1793135514561/result.json` | 第二候选 10/10；独立审查随后发现同文稿 history 迟回复仍有一条未覆盖路径，不用此记录宣称最终完成。SHA-256 `2b210ad0e9ca2b0ca3e27d1e611d0d0e0bd0db3d728dda396aaf3bf087804006`。 |
| `late-history-return-1793136294132/result.json` | 第二候选的 5 项反例材料：真实 history 200 暂缓，原生正文已经可编辑；作者选择第三页第二步；放行旧响应后实际回到第一页。SHA-256 `3eba3d0e34d780edbea6fdbc355b59bc13d40e93d15632b59b03cab5d7b01ba9`。 |
| `late-history-return-1793136321100/result.json` | 最终源同一路径 5/5，真实旧响应完成后保持第三页第二步。SHA-256 `95683af890ccef8cb8ad48232b89a381ad623868f92460faf2c97b3f3d8bea97`。 |
| `repeat-document-return-1793136338523/result.json` | 最终源 10/10：连续刷新后保第二页第二步，scroll 746／offset 0；明确 Home 清地址；重开同文稿后保第三页第二步；四组合完整三页、一个原生编辑器且无横向溢出。SHA-256 `ca2ead71befe7f0edb341c76a981c3120de5f28fff5c031f37ee2e4f59ff3cb8`。 |

最后两份消费者分别核 315 份运行源码起止和最终当前字节一致；两份规范文稿未改。无规范保存 POST、IR／预览／配音请求、外网、页面异常、HTTP 失败或路由错误。所有已记录 owner／backend／frontend PID 实际不存在，home、workspace、fixture 与浏览器均清。清单 `pending-reload-final-manifest.json` 的 SHA-256 为 `7e9641fbf1a7d59e9967e45e66ebe93740ff2e19211e440a0b5aea5c131aefec`。

root 实际查看最终 1440／390 亮暗四图及 history 反例前后图。四组合只证明布局与连续刷新后的完整正文，精确页步操作限 Chromium 浅色桌面。未改控件、样式或令牌。忽略消费者曾有一次拼接语法失败，执行前即终止，脚本副本保留为 `.presmium/late-return-consumer-syntax-failure.mjs`，没有产品结果。

独立只读审查 APPROVE；类型检查 1263 文件、分层、技能和 diff 通过。未新增 tracked tests，未运行测试套件、完整示例构建或导出。本片尚未在公共 4320 采用，不代表批注草稿、原生 Undo 栈、其它浏览器、操作系统输入法或物理触屏验收。
