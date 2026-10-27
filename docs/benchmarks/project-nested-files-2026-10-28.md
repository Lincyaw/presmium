# 复制真实代码导览中的子目录

2026-10-28，合并项目计划、canonical 标题编辑、已部署 Home／ACK 修复后，独立消费者复制仓库真实 `guide-code` 文稿。未改动示例正文或删去插件。

原 `writeChanges` 会先校验整批文件归属，再执行写入。工作区同时允许 `*/lecture.json` 与 `*/*/lecture.json` 时，新副本的 canonical 尚未落盘，`documentDirOf` 将 `guide-code-copy/code/checkout.ts` 判为潜在文稿 `guide-code-copy/code`，实际复制报该目录不存在。真实路径探针确认同一个文件在 `copied/lecture.json` 落盘前归属 `copied/code`，落盘后归属 `copied`；不是漏复制源码或插件不支持。

现在批量预检也考虑本批 content 写入的 canonical entry。仍先验证全部路径、工作区目录模式和逐祖先真实目录，再应用文件；没有先写 entry、放宽 symlink／路径检查、跳过权限或绕过原事务与恢复点。其它调用不提供 batch entry 时保持原判定。

独立实际记录在此工作树 ignored `.presmium/project-plans/`：

- `gallery-1793141610740/result.json`：原失败，只有原稿确认通过；复制报错后私有工作区清理，未当成功。
- `gallery-1793142064978/result.json`：修复后真实复制、三类 typed anchor 重绑、公开 CLI 检查副本通过；后续移动被新生成而未提交的 freeze 文件拒绝，整体 `complete:false`，不是全旅程通过。
- `gallery-1793142177054/result.json`：最终 6/6。真实副本保持 checkout.ts 字节，region／symbol／pattern 三类锚点指向副本；公开 `presmium check` 为零错误、零警告。明确验证含未提交 freeze 的副本移动被拒且无静默提交；另从原稿复制干净副本再移至嵌套目录，身份不变、三类锚点正确，公开 CLI 再次零错误、零警告。原稿正文和源码不变。

最终结果 SHA-256 `591c77bb995c88f8d46f781f3c6abe5d4c9e411c5d5ea01426de7d58f169aedb`，938 个包 src TS／TSX／CSS、包声明与锁文件起止及当前摘要一致；这个数量不覆盖 src 之外的所有包文件。无 HTTP 服务或模型，私有目录已删除。类型检查 1280 文件通过，独立只读审查通过；未新增 tracked tests，未运行套件或全示例构建。
