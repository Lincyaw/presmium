# MCP 作者客户端闭环

本批次接入真实 Studio 客户端的状态、canonical source 保存和已有播放器控制。MCP 不把 HTTP 受理当作浏览器完成；录制、批注输入与其它本地表单草稿没有接入。本记录使用 `ad75f6ac` 上的本批修改，接口范围见[客户端协议](../rfc-mcp-authoring-actions.md#91-已接入的客户端动作)。

## 运行与证据

使用独立 worktree、临时 git 工作区、隔离 DSH home 与隔离构建的 Studio 客户端。正式 `presmium serve` 在自由端口启动；Studio 使用 18491，没有操作公共 4320／17407 服务。MCP 通过仓库适配器使用官方 TypeScript SDK 的 Streamable HTTP 客户端，浏览器为真实 Chromium。两页文稿使用真实、已确认的 8 秒静音讲授计划；没有调用外部模型、ASR 或 TTS，也没有以静音播放证明音频链已验收。

最终运行记录 33 项观察，执行单元返回 exit 0。私有证据保存在该 worktree 的 `.presmium/client-verification/`：

| 文件 | 用途 |
| --- | --- |
| `results.json`、`final.log` | 实际 MCP 受理、浏览器终态、来源、位置及失败回执 |
| `frames.json` | 共享 WebSocket 的真实浏览器消息；不含客户端 nonce |
| `doc-1440-light.png`、`doc-1440-dark.png` | 桌面浅色／深色实际文档 |
| `doc-390-light.png`、`doc-390-dark.png` | 390 宽度浅色／深色实际文档，关闭页面抽屉后正文完整可读 |
| `source-manifest.json`、`final-proof.json` | 六个因果源的首尾冻结核对、全部 24 个修改运行源的收尾指纹、产物指纹、终态和清理 |
| `run.mjs` | 未跟踪的真实消费者操作脚本，包含故意延迟或丢弃单个网络消息的探针 |

`results.json` 的 SHA-256 为 `7a44473f7fbd1f715f012726d8007ecd4b1594ae9f9e782f097aab95ad9c8d3a`。六个因果源为客户端契约、工作区 owner、Workbench controller、Workbench 执行方法与 DSH 两端共享事件通道；最终运行前后指纹一致。其它修改运行源只有收尾指纹，不据此声称全量源码首尾冻结。前一轮 31 项观察是先前工具输出，最终文件记录的是补充丢回执探针后的 33 项观察。

## 实际结果

| 触发 | 观察 |
| --- | --- |
| MCP tools/list；尚未打开文稿 | 三个客户端工具可见，clients 为空；未支持动作明确列出 |
| 打开文稿，显式 state.read | 真实 clientId／epoch／connectionId／来源；sent → executing → done，browser-acknowledged |
| Doc 中指定稳定 Step ID | 定位成功且保持 Doc，不进入制作，不启动编译 |
| 原生正文输入后立即 source.flush | dirty → 已保存，返回新 source；重新读取实际 lecture.json 包含输入；不宣称其它表单草稿已保存 |
| 分派 CompositionEvent 生命周期 | composing 为 true 时不开放 flush，显式请求被拒绝；这是生命周期门禁探针，没有使用系统输入法或真实预编辑字符串 |
| Doc 中请求播放 | 缺少有效播放能力时明确拒绝；没有假 playing |
| 作者进入视频制作后，MCP seek／play／pause／rate／step | 复用实际帧应答。播放时钟从约 32 ms 前进到约 549 ms；暂停后的两次读取同为约 818 ms；速率 1.5、seek 4500 ms 与稳定步骤定位均返回实际状态 |
| 相同 requestId 重读播放意图 | 返回原 done 回执；没有第二次派发或重新播放 |
| 延迟请求后发生新的原生正文输入 | 旧客户端 revision 被拒绝，新输入保留 |
| 丢弃 executing 的 published 回执，保持 socket 在线 | 浏览器未执行定位；15 秒后 failed／client-publication-timeout，位置未变；后续 state.read 成功，队列没有悬挂 |
| 延迟请求超过 30 秒，再投递旧消息 | expired；迟消息不能把终态改成 done |
| 请求尚未投递时返回首页，再打开相同路径 | 旧请求 expired，新 epoch；旧回执 current=false，旧 epoch 的新请求被拒绝 |
| 伪造客户端 nonce | 后端返回 409；MCP 没有 ACK 工具 |
| 四种 Doc 外观组合 | 已实际查看，正文可读，无页面横向溢出；没有宣称物理触屏或系统输入法验收 |

最终浏览器没有 pageerror。Home 关闭最后一个订阅、重开文稿后共出现两个先后存在的工作区 socket；文稿状态、诊断、审阅和客户端动作共享该通道，没有为作者客户端新增浏览器 SSE。最大实际 pretty JSON 回执为 2302 UTF-16 字符，低于 7168 字符预算。正常播放动作的观察延迟为几十毫秒，正文 flush 含真实 git 保存约 121 ms；这些是本轮样本，不是性能保证。

## 清理与检查

结束后私有端口 18491 和本轮服务端口 38759 均无监听，没有匹配的运行进程；临时 DSH home、工作区和浏览器已关闭并删除。证据索引记录了这些实际核对。

通过定向类型检查、分层、包结构、技能和 diff 检查。没有新增 tracked tests，没有运行测试套件、全量 e2e、demo 构建或外部媒体服务。独立只读复核覆盖契约、服务 owner、host nonce、有限 ACK 等待、客户端队列与原播放器方法；本批次未扩展录制或草稿接口。
