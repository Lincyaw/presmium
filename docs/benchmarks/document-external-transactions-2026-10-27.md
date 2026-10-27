# 文稿 actor 的外部事务桥

2026-10-27，隔离 worktree `document-external-transactions`，基于 `54786ab2`。只扩充 DocumentSession：`assetFlight` 接受 `DocumentChangeAnswer`，增加 `recovering` 入口门槛及通用 `commitExternal`，不修改既有草稿存储、record、save、recovery 方法。没有修改 main、公开服务、录音业务或播放器。

`commitExternal(expected, submit, reconcile, signal?)` 在 clean、未组字、未恢复且 identity/version 精确匹配时捕获原文稿和输入代次。`submit` 调用既有业务事务；纯 `reconcile(before, answer, current)` 判断允许的远端差异并合入当前输入。actor 在摘要等待前后都调用该规则，第二次读取最新 current，不用早先算出的本地候选覆盖后续输入。来源基线取实际远端摘要，合并后的本地内容独立验证；不重置原生编辑器或焦点。

成功 ACK 后不再因 signal 已取消而假报未提交。submit 报错时使用不受原 signal 影响的真实 GET：对应差异可收敛则更新 actor，但仍抛原错，不伪造完整泛型回执；只有目录、文稿身份、版本、指纹和实际内容摘要均与原基线相同，才按当前源未变化处理。其它远端差异保留本地草稿并报冲突。409 且没有更晚输入或组字时，可以读取新基线后把原 409 返回调用方，不自动重新提交。

提交前要求文稿仍 active；提交后的 ACK 按原 slot/identity/read/version 归属。切文稿不会把原文稿的可信结果当作新文稿结果，也不会丢掉它而制造自身冲突。后台 slot 的 finally 不发起新的 save/refresh；dispose 后不续写，已有草稿字节保留。方法不停止任何音频或录音。

## 实际消费与证据

消费者使用真实私有 Studio、Chromium、公开 WorkspaceClient 和真实 Workspace/SourceEditor 的 `document/change`。外部事务材料是生产停留时长修改；ACK 延迟、丢弃和取消均作用于真实后端完成后的网络响应，不模拟源写入、提供方或成功结果。没有生成或采用录音，也不据此宣称录音按钮的完整 UI 验收。

早期核心消费者的 7 个检查已通过，原记录 `.presmium/document-external-transactions/result-core7-before.json` 保留 `complete:false`：第八项误把前一场景已保存的 metadata 字段当成 undefined。这七项分别验证提交前取消的真实 GET、held ACK 保留更晚输入、原生 WebCrypto 等待期间的输入、成功 ACK 后取消、真实丢 ACK 的一次提交、后端提交后实际 fetch 取消，以及无更晚输入的真实 409 刷新。该记录没有被改为最终源码重跑。

独立后台归属反例 `.presmium/document-external-transactions/result-background-before.json` 实际确认：后端已提交后，先输入正文、切另一文稿，再释放 ACK，旧实现忽略已知差异，重开原文稿会自报来源冲突。最终两行把 active 限制移到 pre-submit，ACK 恢复按原目标归属。相同真实旅程随后保留后续正文与已提交差异，并可通过原 flush 保存。

最终结果、源码 SHA 与 lineage 以 `.presmium/document-external-transactions/final-manifest.json` 为准。此前独立 foreign/switch 记录的两个检查及 dispose 记录的一个检查分别保留；前者最后因重复设置已有值却要求新 git 提交而未完成，后者在新夹具中实际完成。最终消费统一修正夹具，单独记录后台 ACK、外来差异冲突、提交前切文稿和 dispose 四条必要路径，不把各轮相加为一次总分。

最终 `.presmium/document-external-transactions/result-final-four.json` 为 4/4、complete，运行前后 actor SHA 均为 `7e9dd0161961e60e4094a6bcb0bdac3c41dfeb0af5159f7f936eb8f88ed4ebbf`；类型检查 1,227 文件、分层和 diff 通过。早期七项仍对应其原始源码，两个入口／生命周期守卫的逆替换与原字节精确相等；没有将该未完成原记录改写为最终全源重跑。

启动脚本的语法、CJS 导入、standalone 缺少 DSH workbench 元数据路由、无关 context POST 计数和消费者变量声明错误均保留原失败记录；这些错误未导致产品源码改变或模型请求。消费者最终使用真实 Studio 的 workbench 路由，不提供替代元数据响应。

没有新增 tracked tests 或运行测试套件；没有请求模型、ASR 或 TTS。所有私有浏览器、Studio、子进程、home、workspace 和夹具均按各轮 cleanup 记录清理。此切片只提供 actor 事务边界，具体录音请求、目标规则及 UI 验收由调用方切片负责。
