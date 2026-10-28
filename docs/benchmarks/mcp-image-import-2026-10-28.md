# MCP 导入工作区图片

2026-10-28，对提交 `8df3e621`（三个 MCP 图片工具）做真实运行验证。Studio 从 main 源码启动，工作区是 `examples/animations/try.mjs` 新准备的私有副本，文稿为“冒泡排序”。客户端是官方 MCP SDK（`@modelcontextprotocol/client` 2.3.1）的 Streamable HTTP 连接，令牌取自 serve 的 `server.json`。没有调用任何模型。

## 作者与助手可做什么

`get_image_authoring_capabilities` 返回当前 source、字节上限 8 MiB、64 条回执、并发 4、`same-document` 文件范围与 `locks-and-history` 审阅状态。`inspect_workspace_image` 读取同一文稿目录下的一张图片，返回精确路径、SHA-256、长度、媒体类型和尺寸。把返回的 `file` 原样传给 `import_workspace_image`，经作者批准后走 Web 上传的同一事务：原图写入 `assets/images/`，`lecture.json` 增加资产声明，提交标为 agent 来源。导入只登记资产，不放进正文；要在页面上显示，再用 `plan_document_change`／`apply_document_change` 插入引用该 `assetId` 的 `image` 块。

路径是相对工作区的（`bubble-sort/caption-dialog.png`）。只写文件名会得到 403“不是这一页编辑的文件”。

## 实际运行

图片是本次验证中截取的一张 PNG，640×310，23882 字节，`sha256sum` 为 `da4d1e9abace6f4ae0e59ba85b3153b2179f199ba50906c19f703141618c5e04`。

| 步骤 | 结果 |
| --- | --- |
| 列出工具 | 三个图片工具都在列表中 |
| 能力 | `available: true`，`importWorkspace: true`，`review: locks-and-history` |
| 检查 | 13–15 ms；SHA-256、长度与本地计算一致，识别为 `image/png` 640×310 |
| 错误摘要导入 | 批准后返回 409 `image-file-changed`，没有写入 |
| 正常导入 | 批准后保存；回执含新 source、两个文件版本、提交 `4d53de5`（`Presmium-Origin: agent`）与 `verification.saved: true`，`compiled`／`runtime` 为 `not-requested` |
| 同 ID 重放 | 返回与首次相同的回执，没有新提交 |
| 陈旧指纹导入 | 批准后返回 409 `document-version-changed`，没有写入 |
| 放入正文 | `plan_document_change`（33 ms）与 `apply_document_change`（863 ms）在“小结”页插入 `image` 块 |
| Web 回读 | 工作台编辑器未刷新即显示该图片，`img` 从 `asset?document=bubble-sort&asset=…` 加载完成，原始宽度 640 |

审批出现在查看器（`/bubble-sort/`）顶栏的“待确认”中，文字为“导入图片「caption-dialog.png」”，附文稿标题与文件路径。

## 发现的问题

- 进程令牌不是预确认的，批准请求只出现在查看器的“待确认”，Studio 工作台里没有入口。第一次陈旧指纹请求因为在工作台中等不到批准，约 50 秒后以 `tool-failed`（500，`retryable: true`）结束；拒绝或超时被报告为可重试的 500，不够准确。工作台内置助手使用预确认令牌，不受此影响。
- 批准发生在 CAS 和摘要检查之前，作者会被要求批准一个随后必然失败的请求。

以上两项已处理，见[工作台批准记录](workbench-approvals-2026-10-28.md)。

## 未覆盖项

没有验证 required review 拒绝、并发上限、回执过期、超过 8 MiB 的文件、符号链接拒绝和非图片文件。未运行测试套件或示例完整构建。
