# 批注备份的 canonical 确认门禁

基于 `200bf9c6` 的独立安全修复。较早请求 A 的 ACK 到达时，正文 actor 可能已将后来提交的 B 合并进 `content`，而 `version` 只确认 A。B 再遇到真实 413，服务器没有 B；旧备份 matcher 却用这个混合快照清掉了 B 的批注恢复副本。这里没有证明全部本地恢复材料都丢失：规范文稿 actor 还有自己的备份生命周期。

`SourceDocumentPanel` 现在同时传入 React 状态和读取最新 actor 的 getter，绑定实际 identity/reset，排除 loading、dirty、saving、error、restored、recovering、composing。`DocumentThreadStore` 在同版本早返回前更新这道门禁，`DocumentEditor` 也订阅确认状态变化。未知默认不确认。只有 clean source 与原有稳定评论 ID、作者、正文和时间匹配，bank 才退休提交稿。没有新增 GET、队列、writer 或 canonical 写入路径。

生产 `DocumentSession.open` 将首个 `content/version` 同时赋值；恢复与读取也保留该绑定。本片没有把“有内容但从未有版本”的外部自定义组件当作已支持初始化生命周期。

## 实际私有消费

raw 位于本片 WT 的 `.presmium/comment-draft-ack-gate/`。

| 记录 | 源码与范围 | 实际结果 |
|---|---|---|
| `before-1793140136684/result.json` | 未修复 `200bf9c6`；A 实际 200 已提交但 held，B 原生 Save 已有 strict pending，释放 A 后 B 实际 413 | observation 5/5，B 评论备份消失，`productCorrect:false` |
| `after-1793140240461/result.json` | 首版 clean gate；同一份 consumer-v2、同一 script SHA，真实 A200/B413 | 5/5，保留 B 的实际 rev2 与 pending comment ID |
| `clean-1793140307821/result.json` | 首版 clean gate；普通短回复 strict backup→实际 Save→saving/dirty 变 clean | 3/3，正常确认后退休备份 |
| `final-1793140480202/result.json` | 最终 unknown=false；原 A/B200/413 路径，加同服务另一文稿的正常 clean 转态 | 8/8，4 修改源与6基线起止/current一致，全清 |

两次 A/B 记录使用真实 `metadata.presmium.audit.padding`，使私有文稿接近 2 MiB 事务门槛；UI 中 A/B 仍为普通短回复，padding 没有渲染或编译。没有修改服务限额，也没有 mock 413；实际回复为 `the transaction is larger than the editor saves (2097152 bytes)`。这不是一般大文渲染验收。

未知缺省从旧行为改为不确认后，最终同一私有服务还定向覆盖原 A/B 路径和另一份文稿的普通 clean 转态；最终 raw SHA-256 为 `f24128e18489031b9160b47b660ab44808d230a70c42671e215d7875419bbec4`，准确源 SHA 和清理结果在 ignored final manifest 中另列。前面的首版 5/3 保留各自源码，不冒称最终所有字节重跑。

保留的未完成观察器：新建 composer WT 中 2 MiB 单段的底部 Save 定位失败，没有生成 B 请求；本 WT 首轮 `before-1793140007063` 用 Enter 后实际只换行，没有 A 请求。两者都不是 ACK 反例证据。完成记录使用真正的原生 Save 按钮。

本片 0 模型、0 ASR/TTS、0 IR 准备，未碰公共服务。未新增 tracked tests，未运行套件。新建 thread composer 草稿仍在另一片实现，本修复不依赖其新 target 类型。
