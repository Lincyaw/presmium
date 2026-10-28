# 原生批注草稿的 MCP 恢复与丢弃，2026-10-28

核心提交 `ac091c80` 基于 `21984579`；后续 `79112049` 仅收紧人端恢复反馈的 owner epoch。可用范围是已挂载原生 reply/edit composer 的精确恢复，以及没有活跃目标的精确备份丢弃。新建 composer 恢复、活跃稿丢弃、自动提交仍 unavailable。契约见 [RFC 9.2](../rfc-mcp-authoring-actions.md#92-已接入的显式批注草稿读取)。

## 固定来源与真实证据

最终 11 源清单 `.presmium/comment-draft-mutations/source-freeze-3.json` 的 SHA-256 是 `3f5cde5f7bf8724f7d6e1a7ca9eb27506c4452a637ac41ea1fd23a417e4ce2c2`。核心的 freeze-2 与最终只差 DocumentComments 的 3 行新增／2 行替换：handle/可编辑态切换推进反馈 epoch，旧 catch 核 active/editable/handle/epoch；没有改变原生采用、strict、协议或 ACK 规则。旧完整链未重跑为最终字节，分片记录如下。

| 目录中的 result.json | 实际范围 | 结果与来源 |
| --- | --- | --- |
| `run-1793161378571` | Studio + 官方 SDK／公开 wrapper/pruner，reply/edit 恢复、人工 Save/Cancel、精确 discard、迟输入 | 17/17，1193 源首尾一致；freeze-2，仅反馈 epoch 增量之前 |
| `comment-draft-reads/run-1793161514332` | 原生新建稿完整读取，另核活跃 discard 拒绝与新建 restore 真不可用 | 14/14，997 源首尾一致；同 freeze-2 |
| `run-1793161887748` | 人端 held Recover→Cancel→同 comment 重开新 Edit→释放旧回调 | 最终 freeze-3，4/4，1193 源首尾与当前一致 |
| `run-1793161898097` | 正常 held Recover→后来输入→取消恢复反馈及四组合 | 最终 freeze-3，4/4，1193 源首尾与当前一致 |

前三类 run 目录位于本 worktree `.presmium/comment-draft-mutations/`；comment-draft-reads 位于 `.presmium/`。它们是独立范围，不合称一轮全通过。四份 result SHA-256 按表顺序为 `15c757c0250d61a0ed4592d0eb30179688914ab8b30f2d50ab3dd5558ef08d1e`、`1998f734140c8bd026363a35cad5e74406ea01acaca7f8cb57ead01c52e4c35b`、`ce9ef7329a4338fe80aab890931f4336dde4f1da4a9a69594e5bdcd1300e85ae`、`3f5a87527ea4f5927fc343044fc0c00c3204410d63cc885f2bb41d5bdef4d289`。

## 实际闭环

私有 fixture 是有效 canonical 文稿、真实线程／稳定文字 anchor 与可信 local member。窗口一在原生回复框写 A，另一窗口写并 strict 备份 B。显式 inspect 给出真实 composerId 和当前 A 引用，元数据无正文／baseline／scope。SDK restore 先 strict fork，保原 A/B，公开 replaceBlocks 后从同一原生实例读回内容，回 done；没有 fake selection 或仅 bank 成功冒充 UI 成功。

canonical 在恢复后保持原字节，只有作者点击原生 Save 才新增 B 回复。相同已观察成功 intent 重放不再 fork；没有人为丢第一次 SDK 响应，不称网络丢 ACK。活跃目标 discard 拒绝，原生选择到普通正文后明确成为 inactive 才能精确丢弃旧 A；未选 B 保留，旧 A token 拒绝。已有评论编辑同样恢复 B，原生 Cancel 保 canonical 和未选 A。

消费者持有已经真实提交的 strict fork 完成回调，随后在原生框输入新值；释放后旧请求失败，不覆盖后来输入，已 strict 建立但未采用的分支仍可读。完整结果实际经过阈值 8192 的公开 DSH pruner，保持 JSON 及原有完整回执／WS／HTTP ACK 预算。正常完整链 0 页面错误、0 意外 HTTP 错误、0 模型／外部调用。

new-create 14 项实际看到 ownersKnown/active、没有 restore owner，MCP discard 失败而完整输入仍在；请求 restore 真正 unavailable，没有假 done。它不证明新建稿恢复已实现，也不证明活跃稿可远程清除。

## 人端反馈 owner 与保留反例

- `run-1793160757373` 是真实反例（3 个反例断言通过，productCorrect:false）：持真实 IDB 读、点击 Recover、后来输入后释放，当前稿保留但出现未捕获的 client-comment-composer-changed。修复在人端入口捕获并显示原公共 Notice，没有放松 agent guard。
- `run-1793161117320` 在核心 freeze-2 完成 4 项和四组合，确认普通后来输入仍有取消恢复提示。
- `run-1793161767983` 是另一个真实反例（4 项反例断言，productCorrect:false）：同 handle/editor 被 Cancel 后复用，旧恢复错误提示出现在新 Edit。最终 epoch 修复的同旅程 4/4 消除该提示；普通后来输入 4/4 仍保留正确反馈。最终四张亮暗／1440、390 图均已查看，使用原 PmNotice，没有新控件或 CSS。
- `run-1793161246681` 的前 10 项真通过，之后观察器以不存在的 accessible name 点击 More actions 超时，原 complete:false 保留。冻结源的原生图标按钮实际 aria-label 缺失，确是可访问性缺口，本片未修。后续观察器使用依赖公开源码及实际 DOM 的 data-test=moreactions 抵达按钮，不将它说成产品没有问题。

64 个注册槽溢出时记录 unknown，未登记实例卸载前恢复／丢弃 fail-closed；此容量分支经代码独审，没有声称本轮挂载 65 个真实编辑器。实例注册是暂存 owner 回调，不是第二 writer、事务或永久账本。

## 限制与清理

active/ownersKnown 只针对请求选中的客户端；IDB 与异步 BC 仍是 observed-only，不是跨窗全局锁。别窗未收到通知、备份已标记后再关闭／重启的完整人端取稿体验不在本轮保证内。目标失效只读取稿；不能伪造新 thread、放宽原编辑基线或自动提交。

全部自有 browser、Studio owner/backend/frontend、私有 home/workspace/fixture 已清理，登记 PID 均不存在。未操作公共 4320/17407。types 1322、layering、skills、packages 40、diff 通过；无 tracked 新测试、套件、完整示例或模型。

## 4320 交付

运行版本 `0a560991a5b449f589766c7e4db199c189670f38` 包含批注草稿操作、取消后提示归属及原生工具栏无障碍名称。组合版本的私有 Studio 与正式 MCP 消费者分别完成回复／编辑恢复及并发保护 17 项、取消后重新编辑 4 项、原生工具栏四组合操作 13 项；四张截图已查看。窄屏截图发现取消编辑后侧栏横向偏移，旧版本也可复现，正在独立调查，不视为窄屏视觉通过。

在线只读检查 22 项通过，两个 host 的既有认证会话正常；工作台重启前后 11 份文稿字节未变。首次 `68031783` 在线检查在已连接客户端初始快照中未见批注动作，前 13 项通过后终止；再次有界等待能力就绪后 22 项通过。注册和编辑器初始化异步发生与此现象一致，但复查没有重现首次时序，不能将其归因为已证实的竞态。固定源码构建检查 1244 项、类型 1323 文件、分层和令牌检查通过；没有运行测试套件或全量示例构建。
