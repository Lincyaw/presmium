# 批注恢复 reader 在真实 source 就绪后启动

基于 `a65555b9` 的单行生命周期修复。首个编辑器 effect 可能运行在 authoring loading 阶段；最新 source getter 此时返回 undefined，reader 未启动。后续已有真实内容和版本，原生回复仍能严格写入 IndexedDB，但恢复列表没有开始读取。

`DocumentEditor.syncComments` 在取得实际 source 和版本后幂等调用原 bank 的 `start()`。资源仍归原生命周期关闭；没有第二 reader owner、定时重试、GET 或 canonical writer，clean ACK 退休门槛不变。

独立私有 Studio 使用现有 thread 的原生回复，不含新建 thread target 代码：输入回复并等实际 strict 备份，切另一文稿再返回，打开原线程恢复。

| 真实记录（本 WT `.presmium/comment-draft-ack-gate/`） | 范围与结果 |
|---|---|
| `reader-before-1793141688735/result.json` | 3/3 observation，备份存在但恢复控件缺失，`productCorrect:false` |
| `reader-after-1793141716676/result.json` | 同一 consumer script SHA，4/4，明确 Recover 后原生稿完整，canonical version 未变化 |

两个 run 起止源码稳定，源列表仅 DocumentEditor 一处不同；准确 raw SHA、源 SHA 和 PID 清理结果在 ignored `reader-final-manifest.json`。所有自有浏览器、服务、home/workspace/fixture 已清。0 模型、0 IR 准备、无公共操作；没有运行套件或新增 tracked tests。该验证只覆盖现有回复的 source-ready 初始化，不将新建 composer 的独立验证算入本片。
