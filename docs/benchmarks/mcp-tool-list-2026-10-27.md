# MCP 工具清单变化与 dsh 会话注册

2026-10-27。canonical 作者工具先就绪，插件工具在真实编译后才出现。本文记录 MCP 订阅及 dsh 注册适配，不代表录音、ASR 或所有作者动作已接通。

## 原问题

`DocumentBindings` 首次 `client.tools()` 后一直保留该数组；`presmium-tools` 只比较 binding 对象。首次连接只含核心工具时，后续同文稿编译完成，即使实际 MCP `tools/list` 已包含插件工具，原 dsh 会话也不会注册它。

私有消费者使用真实 workspace、MCP HTTP、公开 Cordis Context、Session、Tools、Agent 与 AgentLoop；未提交模型输入。真实 Agent 的唯一 followup 在公开 `agent/pre-step` 被消费者拒绝，未请求模型。两个本地插件只读取当前文稿标识；其中一个调用等待私有文件，供实际进行中调用验证。

- `.presmium/ui-evidence/mcp-tool-list-before.json`：5 项观察完成，其中明确证实“服务已有插件工具，但原 dsh registry 仍无该工具”。这是缺陷复现，不是原实现通过。
- `.presmium/ui-evidence/mcp-tool-list-after.json`：14/14，清理全部完成。
- 可复现脚本：`.presmium/mcp-tool-list-change/consumer.mjs`，参数 `before`／`after`；before 使用修复前保存的绑定与注册源码。

`mcp-tool-list-source-manifest.json` 区分当前树与 before 实际执行的两份旧源码 SHA。before 使用当前 MCP client，但旧绑定从不订阅工具变化；它只证明旧 dsh 静态缓存问题，不充当旧 client 传输行为的测量。

## 实现边界

`PresmiumMcpClient.subscribeTools` 使用公开 `Client.listen({ toolsListChanged: true })` 和标准 `notifications/tools/list_changed`。它复用资源订阅已有的远端断流重订阅、共享监听者和关闭路径，不重连整个 MCP client，不轮询。`tools()` 显式刷新 SDK 缓存。

dsh 在订阅成功后才首次读取工具清单。读取期间再收到失效通知，丢弃该结果后重新读取；每次只保留一个进行中的读取。相同清单不重新注册。新的清单保留原 document-bound client，在 Agent idle 或下一次 `agent/pre-step` 更新公开 Tools registry；运行中的工具批次不因通知重注册。新文稿绑定、旧异步回调及 Agent 销毁均核对实际所有者。

公开接口依据本地 MCP [订阅文档](../../vendor/docs/mcp/docs/clients/subscriptions.md)与 dsh [Agent 生命周期](../../vendor/docs/dsh/packages/core/agent/README.md)、[工具注册](../../vendor/docs/dsh/packages/core/tools/README.md)。不读取依赖编译产物、不修改框架。

## 实际验证

最终 14 项包括：

- 未编译时可用 canonical 核心工具，诊断首读不启动编译；显式 `get_step` 后，零诊断插件工具通过通知进入同一 Agent。
- 多个工具清单监听者共享订阅，释放附加监听者不关闭原绑定。
- 真实 Agent 处于 running 时变更私有文稿的插件声明，绑定已取得新工具集，但 registry 保持当前批次；原 MCP 调用完整返回后，idle 边界删除旧工具并注册新工具。
- 切换另一文稿后，工具通过新 token/client 在正确文稿执行；旧 binding 不替换新工具集。Agent dispose 清除作用域注册。
- 私有 beta 文稿字节不变；唯一主动源修改是私有 alpha 的插件声明。没有操作公开服务或作者文稿。

消费者保留了两个中间失败，未以最终结果覆盖：

1. `mcp-tool-list-after-notification-before.json`：最初 3 项后等待插件通知失败。服务端原先将工具通知挂在诊断变化上，零诊断编译不发通知。MCP 作者随后增加独立 compile-ready 工具事件，再运行同一链证实通知送达。
2. `mcp-tool-list-after-plugin-context-before.json`：前 6 项通过，随后私有插件误读不存在的 `ctx.deckDir`。消费者改用公开 `ctx.document` 与自身目录定位；产品没有为该错误改动。最终 14 项才覆盖实际进行中调用。

真实消费者没有 git 仓库，日志保留一条预期的“项目操作和历史不可用”警告；未把该警告记成运行错误。无外部服务调用、合成、浏览器或测试套件。使用随机本地端口与任务私有临时目录，finally 释放 Agent、bindings、Context、MCP client、workspace service 并删除目录。源码 SHA 与清理结果在原始 JSON 中。

轻量检查：类型、分层与 `git diff --check`。没有新增 tracked tests，也未运行测试套件。

本片不承诺断开连接期间所有中间清单事件完整重放；远端断流恢复后重新读取实际工具清单。工具移除不会改变已完成任务或把旧调用转发到另一文稿。
