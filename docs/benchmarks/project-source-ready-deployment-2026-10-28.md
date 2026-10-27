# 项目操作与批注 reader 的合并交付

2026-10-28，公共 4320 已采用固定运行提交 `85c38417fc36ec9f846cfec48e2034f19c578837`，没有修改 17407。100 多毫秒新建页面响应仍按用户已接受范围收口，本批未重新测量性能。

## 实际变化

- `5f3f4b0b`：[项目计划](project-authoring-plans-2026-10-28.md) 将 Web 与 MCP 的新建、复制、目录移动、删除、标题修改接入同一计划与结果 owner，删除先预检实际影响再确认，丢 ACK 后重试原意图。
- `69e93fd1`：复制保留 fixed Git pin 与路径组合；移动触及本地 pinned 代码锚点时明确拒绝。
- `4de2e167`：[标题修改](project-retitle-canonical-cas-2026-10-28.md) 复用原 canonical CAS，单文稿和无 Git 仍可改标题，MCP 文稿 token 只准本目标；目录操作保留各自门槛。
- `06f9ad2e`：[真实代码导览复制](project-nested-files-2026-10-28.md) 修复整批预检把 code 子目录错当文稿根的问题，先验证再写，不绕过权限或恢复点。
- `51f7ddb0`：[批注 reader](comment-draft-reader-start-2026-10-28.md) 在真实 source 就绪后幂等启动，避免备份存在却没有恢复入口。clean ACK 退休门槛保持不变。

项目根目录操作、未知插件私有路径的迁移语义、持久幂等和跨重启任务仍未交付，不能将配置能力当作每个工程都已通过引用检查。

## 合并后的真实消费

三个独立私有 Studio 消费者在同一固定运行提交完成，每个均记录 1172 个 tracked 包 TS／TSX／CSS／JS／MJS、包声明及根清单与锁文件，起止摘要与当前源码一致；未把它们合算为一条旅程。

| 消费者 | 实际结果 |
|---|---|
| `project-plans/studio-1793142295381`，14/14 | 官方 SDK、HTTP 与原生首页新建／改名／复制／删除；真实文稿 token 只具绑定目标的 metadata 能力；先显示实际删除文件数，丢失已提交 copy ACK 后再次点击复用原 plan、UUID 与唯一提交；新建后一个原生编辑器。浅色／深色 × 1440／390 的四份删除弹窗已逐张查看。 |
| `comment-draft-ack-gate/reader-after-1793142295373`，4/4 | 真实回复、strict 备份、切换文稿返回后明确恢复；原稿完整且没有规范文稿写入。 |
| `comment-draft-ack-gate/final-1793142295362`，8/8 | A200 held／B 原生 Save 后真实 413，保留 B 备份；普通回复 clean ACK 仍退休自己的备份。这个消费者有一个需要验证的真实 HTTP 失败，不写成零 HTTP 错误。 |

三者无页面异常、模型或外部请求；九个登记 PID 均退出，浏览器及临时工作区全部清理。类型检查 1280 文件、令牌、分层、技能、包结构和 diff 检查通过；没有新增 tracked tests，也没有运行套件、全示例构建或导出。

另一个真实代码导览消费者最终 6/6：复制后公开 CLI 零错误／零警告，另一个干净副本移入嵌套目录后 CLI 仍零错误／零警告，三类代码锚点和源码字节正确。它的 938 项源冻结发生于 reader 单行加入前；该行没有参与此 Node／CLI 消费，不冒称该旅程运行过最终全部源码。首次真实复制失败及第二轮未提交 freeze 阻止移动的 partial raw 均保留；最终明确检验拒绝保护，没有静默提交缓存来制造通过。

## 公开部署

原构建器从固定提交归档读取 9 包、556 份文件，207 个实际输入，1195 项构建证明通过。入口 3,005,575 字节，SHA-256 `71db6d4d99296f607bb1e36ba9e80244f1e730713c116a563cdfe3346fd3b57b`。确认受管理 supervisor 退出与端口关闭后快进主树、采用产物并重启；作者 11 份 JSON 在停止、采用及最后读取前后均不变。

公开只读消费 20/20：七页正文完整渲染在单个原生编辑器，正常刷新保留文稿；真实浏览器 clientId／epoch 与 MCP 对应，刷新后新 epoch；新增项目三工具已声明，按 action 返回配置能力。只读取 capabilities，没有对作者项目 plan／apply。累计两条工作区 WebSocket、六个 ready、零浏览器 EventSource；零页面异常、失败 HTTP、规范文稿写入、运行快照准备或外部请求。

实际两次包含入口的 `/plugins/` 响应均为 3,055,351 字节，SHA-256 `bbd6f97c2d48d903d5dac03c07a192eff448888719bfa1ea0a2bf19c3d324839`，固定入口在 offset 0 唯一连续匹配。公开 raw `.presmium/ui-evidence/live-authoring-reliability-health-85c38417.json` SHA-256 `9ded9fc81cbd6576590e4dd8ec3fc5ef188ae9993e4c2d3e063fea66197f1a89`；总索引为 `.presmium/ui-evidence/project-source-ready-integration-20261028.json`。

localhost／127.0.0.1 的原登录 cookie 仍 200，新启动入口 200，旧 token 在新浏览器按期 401；临时鉴权快照已删除，持续入口和日志为 0600。公开服务保留，消费者的浏览器与 MCP 客户端关闭。新建批注 composer 恢复与 agent 主动准备预览仍在独立批次，真实麦克风、逐词字幕对齐与高级媒体流程继续推进，整体目标保持未完成。
