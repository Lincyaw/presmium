# 工作台中的待确认操作

2026-10-28，在分支 `work/workbench-approvals-2026-10-28` 上做真实运行验证，处理[图片导入记录](mcp-image-import-2026-10-28.md)“发现的问题”中的三项：Studio 工作台看不到宿主的批准请求；拒绝或超时报告为可重试的 500；图片导入先批准、后做 CAS 与摘要检查。

Studio 从该分支源码启动（`presmium-studio <工作区> --port 4334 --host 127.0.0.1`），工作区由 `examples/animations/try.mjs` 新准备，文稿为“冒泡排序”。客户端是官方 MCP SDK（`@modelcontextprotocol/client`）的 Streamable HTTP 连接，令牌取自 serve 的 `server.json`，即未经预确认的进程令牌。浏览器是 Playwright Chromium，界面语言 zh-CN。没有调用任何模型。

## 改动

- 工作台应用栏在有待确认请求时显示“待确认 N”，位于“AI 助手”之前。弹出层逐条列出说明、发起方（`presmium.mcp` 显示为“外部 AI 工具（MCP）”）、详情与“拒绝／允许”。组件是 `@lincyaw/workbench` 的 `WorkbenchApprovals`，由 workbench 新增的公共 `PmPopover`（与 host 相同的 Radix Popover 和 `pm-ui-popover` 表面）和 `PmButton` 组合，窄屏用 touch 密度。
- 工作台经共享事件连接的新主题 `approvals` 收听，dsh 转到 serve 的 `control?observe=approvals`；回答经 `/api/presmium/control` 发出。观察连接只收 `approval` 与 `settled`，不是查看器窗口：不接收 `go`、不计入 `navigate` 的窗口数与位置，也不能报告。
- MCP 的拒绝与超时改为 `operation-not-allowed`（403，`retryable: false`）。
- 图片服务新增 `checkWorkspaceImport`：权限、审阅、请求格式、文件范围与字节、SHA-256／长度、图片格式、当前 source；同一导入 ID 已有回执时改为检查回执所保存的版本，与重放条件一致。`import_workspace_image` 先调用它，再请求批准，再导入；导入事务仍全部重查。

## 实际运行

| 场景 | 结果 |
| --- | --- |
| 陈旧指纹导入 | 17–24 ms 返回 409 `document-version-changed`，没有出现批准请求 |
| 错误摘要导入 | 14–37 ms 返回 409 `image-file-changed`，没有出现批准请求 |
| 不存在的文件 | 21 ms 返回 404 “no file bubble-sort/none.png”，没有出现批准请求 |
| 正常导入，在工作台允许 | 发起后约 40 ms 应用栏出现“待确认 1”；点“允许”后保存，回执 `verification.saved: true`，入口消失 |
| 在工作台拒绝 | 返回 `{ code: 'operation-not-allowed', status: 403, retryable: false }`，入口消失 |
| 无人回答 | 50 032 ms 后返回同样的 403 `operation-not-allowed`，入口随 `settled` 消失 |
| 同 ID 重放，source 未变 | 仍询问批准；允许后返回与首次相同的 `assetId` 与版本，没有新提交 |
| 同 ID 重放，之后另一张图片已改变 source | 24 ms 返回 409 `document-version-changed`，没有出现批准请求 |

修复回执检查之前，第三种重放会先请求批准、批准后才因回执版本失效而失败；`checkWorkspaceImport` 改为检查回执版本后，上表最后一行不再打扰作者。

## 显示

亮色与暗色、1440×900 与 390×844 四种组合都实际打开过弹出层并完成一次回答（两次允许、两次拒绝）。桌面弹出层宽 288，右对齐在入口下方；窄屏入口按 touch 高度显示在文档按钮右侧，弹出层宽 288、左缘距视口 16，不遮挡应用栏。文件路径详情以等宽代码块显示，长内容在弹出层内换行，最大高度为视口的 30%。截图留在本次验证的临时目录，未提交。

## 其他先批准后预检的工具

以下 operate 工具仍在批准之后才做共享服务的预检，作者可能被要求批准随后失败的请求：`import_workspace_audio`（与图片同形，文件摘要与 source 在批准之后检查）、`adopt_recording`、`change_media_clip`、`apply_document_change`、`apply_authoring_action`、`apply_page_change`、`apply_page_duplication`、历史的撤消／重做／回退、转写的启动与采用、配音生成。计划类工具（页面、批注、组件）已有独立的只读预检，apply 阶段只剩计划过期的情况。本次只改图片导入。

## 结构检查

`check-types`、`check-layering`、`check-tokens`、`check-skills`、`check-plugins` 均通过。未运行测试套件、e2e 或示例完整构建。

## 未覆盖项

没有验证多成员工作区中 `workspace` 范围请求的分发、两个工作台标签页同时回答、事件连接断开后的重新补发，以及 Firefox／WebKit。确认没有剩余时间显示；Figma 中尚未登记 workbench Popover 与该组合。
