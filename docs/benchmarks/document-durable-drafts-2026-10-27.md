# 正文与字幕的持久草稿

本片把正文与字幕共同使用的规范文稿草稿备份移到 IndexedDB strict 事务。`lecture.json` 仍是唯一内容来源；备份只保留尚未提交的输入。制作参数草稿与录音 Blob 不在范围内。没有调用模型、公共工作台或测试套件，也没有新增 tracked tests。

## 实现边界

`DocumentDrafts` 每个文稿 slot 有独立 owner；身份包含实际工作区和文稿 UUID，记录保留 baseVersion/baseHash。`DocumentDraftStore` 只有一份正在提交的完整快照和一份最新 pending 快照；输入立即进入原生编辑器，事务不锁输入。只有最新 ticket 的 strict `complete` 才能清除备份进行中或失败状态。旧 put、清除及保存回执不得清掉更新的输入。每条 JSON 备份最多 8,388,608 个 UTF-16 code unit；拒绝写入时保留当前内存输入和已有副本。

新写入只走 IDB。旧 localStorage 副本标作临时恢复材料；旧 sessionStorage 副本在新 strict 副本完成后才删除。完整校验与原始 JSON 的 SHA-256 只在读取侧运行。处理标记包含 identity、id、revision 和 raw token，外部同修订但不同内容不会被旧标记隐藏。

重新打开先显示候选，不默认采用。切换候选先等待当前快照与新分支严格提交，再替换当前编辑器；原候选仍保留。下拉框的“丢弃草稿”只处理选中的精确快照，保存收敛才处理已采用的 origins。读取坏旧副本与当前副本写入失败分别反馈。恢复不自动保存或合并服务器。

## 真实验证

忽略目录 `.presmium/ui-evidence/` 中的原始 JSON 保存动作、实际请求、规范内容、源码 SHA 和资源终态。每轮独立私有 Studio 使用随机实际端口；完整浏览器退出使用相同持久 profile 的不同进程，异常退出为已确认属于本消费者的 Chromium 主进程 `SIGKILL`。

| 证据目录 | 结果与范围 |
|---|---|
| `document-durable-idb-core-1793109487989` | 8/8：真实正文与 ShadowRoot 字幕输入、cue/发音原子完整；离线失败后真正关 tab，新 tab 明确恢复；新分支先提交，恢复不写源；明确重试实际 CAS 200，旧候选不复活。 |
| `document-durable-idb-process-1793109514989` | 6/6：整个 browser 正常退出，strict 完成到退出 20ms；另一次 strict 完成后 22ms 实际 SIGKILL，新进程同 profile 读回最后 raw SHA；多候选未默认采用。三个浏览器 PID 均实际退出。 |
| `document-durable-idb-branches-1793110223757` | 8/8：两个真实 tab 独立 owner 与更新修订可见；后续关闭旧 tab 后单页验证 A→编辑派生 B→切 C→仅丢 B，A 仍可恢复；同 id/revision 的外部有效替换不被旧 token 隐藏；坏旧行保留且只报告读取失败。 |
| `document-durable-idb-quota-1793109956579` | 3/3：首次打开应用 DB 前通过公开 CDP 原生配额限制触发真实写失败，输入留在原生编辑器；恢复配额后的新输入严格保存完整前后文本，写失败提示清除。没有模拟 QuotaExceeded。 |
| `document-durable-idb-model-1793110547631` | 9/9：公开 Drafts 类与真实 native IDB；外来 raw CAS 拒绝、后续 fork 保留两次输入；损坏 raw 不覆盖；真实 `tx.abort()` 拒绝旧 SS 迁入并保原字节，下次 strict 成功才删除；close 仍完成已接纳的事务。材料来自 core 的实际规范草稿，非另一条原生输入链。 |
| `document-durable-idb-typing-1793110621274` | 3/3：640,979 bytes 文稿，两个 live tab 下连续输入 22 个事件共 414.5ms，输入到下一帧最大 20.1ms，两边没有 50ms long task；全部输入进 strict 副本。关闭另一个 reader 后完整规范内容实际 CAS 200。该单次观测只排查明显回退，不设新的页延迟目标。 |
| `document-durable-idb-admission-before-1793110985263` / `...-after-1793111032506` | 各 4/4：真实 WorkspaceClient、公开 DocumentSession 与原生 IDB blocker。旧事务曾清除较新超限快照的失败状态；将 ticket 身份更新包含 admission 失败后修复。使用 `record()` 构造超过字符上限的协议材料，不宣称原生超大粘贴体验。 |
| `document-durable-idb-ordering-final-1793111401531` | 6/6：hold 实际后端 200；原生 IDB 事务阻塞时正文仍能输入；canonical ACK clean 后旧 put 不复活；旧 clear 后的新输入保留同 ID 更高修订，未伪称保存。 |
| `document-durable-idb-matrix-1793111051637` | 11/11：亮暗 ×1440/390；两个来自真实输入的候选；未选时两个动作禁用，明确选择才启用；不采用、不写源。8 张 selected/unselected 图逐张查看，无横溢出。桌面 compact30/13；coarse 输入44/16，compact 按钮保13字号与≥44热区。 |
| `document-durable-idb-open-dispose-before-1793111677729` / `...-after-1793111760082` | 各 4/4：真实 WebCrypto 已算完的结果 held；dispose 后释放。此前创建未被关闭的 BC/IDB 并迁走 SS；现在局部 digest 后复核 disposed/active/opening，零 late 资源，SS 原字节保留。是公开 actor 协议消费者，不是原生输入证明。 |
| `document-durable-idb-core-1793111761232` | 最终 8/8：以上 open 资源守卫后完整正文、字幕、恢复、显式 CAS 主链；全部8运行源 SHA 与最终文件匹配。 |
| `document-durable-idb-conflict-1793111917789` | 最终 5/5：实际外部同 UUID canonical CAS 200 后，旧草稿仅作为候选；明确恢复显示冲突且保本地输入，重试仍不覆盖新的服务器内容。 |

## 保留的反例与限制

旧 localStorage 方案在 `document-durable-process-1793106207453` 中，最后 setItem 后 24ms 真实整进程 SIGKILL 丢失最新输入；正常整进程关闭可恢复。这条真实失败未改写。先行 native strict 探针 `document-idb-strict-1793106570211` 在完成后 2ms SIGKILL 读回；产品链另有上表 22ms 证据。strict 是浏览器持久性提示，本次只验当前 Chromium 的 browser-process 终止，不承诺操作系统断电、未完成事务、未提交的 IME preedit 或用户清除站点数据。[IndexedDB 规范](https://www.w3.org/TR/IndexedDB/#dom-idbtransaction-durability)定义事务的 durability 语义。

并发工作台存在独立传输限制，不能说本片已修：两个 app tab 同时存在时，恢复 GET 可一直 pending；关另一 tab 后原同一次 GET 200 并完成。`document-durable-idb-recover-observe-1793110334071` 3/3 的隔离只读插桩确认 read/input/version 不变且 guard 全 accepted，没有第二次 click。旧18/60秒导航失败与未完成恢复 raw 均保留。独立 transport lane 的 `studio-multitab-transport-1793111167978/result.json` 7/7 已确认两个 app 的六条 HTTP/1 SSE 占满连接；同 cookie Node GET 18ms 200，而 Chromium 的同次 GET/第三导航排队，关另一 tab 才放行。本片不加时窗或放宽 actor 守卫，也不把关闭其他 tab 当作并发恢复修复。

初版 ordering 消费者的 route 未覆盖 query，因此未 hold 实际回执；修正后前4项通过，但其“已打开 DB 后把配额设为1就一定拒绝小改写”的 oracle 未触发，整轮仍 incomplete。配额改用上表 fresh-origin 真实拒绝证明，最终 ordering6 独立保留。初次 matrix 把所有 coarse compact 按钮也要求16字号，原始几何与失败保留；按既有公共规范校正 oracle，没有修改 CSS。初次 migration abort 探针在 native abort 事件派发前读取 observer，独立保留；最终等真实终态。初次 actor 脚本在 host 页加脚本遇到 Harness 装配错误，零检查；只终止已核 PPID 的自有 browser 后原 finally 全清，再用同认证的空白公开 API consumer 验证，没有 mock WorkspaceClient。

## 源码与设计谱系

最终清单为 `.presmium/ui-evidence/document-durable-final-manifest.json`。原8源清单 `document-durable-final-source.json` 保留 admission 修复后的阶段 SHA；随后仅 fresh-open digest/生命周期守卫改变 actor。最终 core8、open-dispose-after4 对最终8源；此前对应 artifact 的 SHA 保留，不把旧证据改称新源码运行。全部独立消费者的临时浏览器、服务、fixture、profile 与 home 均有真实清理终态。

正式 I01 组合见[本地草稿恢复](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=241-843)：未选、已选、写入失败的 compact/coarse 状态，复用既有 Select、Button、Notice 与变量；没有新增控件或 token，也未改显式 Touch master。公开 `get_design_context` 与亮暗截图已实读；公共 padding、字段 label gap 与 intrinsically sized compact 按钮按既有组件令牌组合。原生控件和自有业务 CSS 的职责未变。

轻量检查按最终交付清单记录 types、layering、tokens、skills、diff 与相对链接的实际结果。未运行测试套件、全量示例构建或公共部署。
