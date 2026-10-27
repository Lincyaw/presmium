# MCP 构建来源、查询与取消

MCP 的 workspace `build` 现在要求调用方传入已保存文稿的 `version/fingerprint`，并交给现有 `OutputJobs.start` 再核对实际编译输入。回执保留任务序号、文稿、源、额外输入指纹、时间、缓存状态、字幕地址与文件元数据。文件仍最多列出 20 项，并明确报告剩余数量。

`get_builds({jobId})` 可读取同文稿的具体任务，不依赖当前编译或目标目录发现；未指定 ID 时仍列最近 10 项，目标发现失败会单独返回 `targetFailure`，保留任务列表。`cancel_build` 按原文稿和任务 ID 授权，运行中只返回 requested，再轮询实际终态；完成的产物不会改称已取消。

2026-10-27，忽略消费者 `.presmium/mcp-output-jobs/consumer.mjs` 在两个独立临时文稿上启动正式 `serveWorkspace`，使用正式 MCP HTTP 客户端及脚本新签发的文稿范围令牌。最终记录 `.presmium/ui-evidence/mcp-output-jobs.json` **16/16**，所测三个源文件的前后 SHA 相同：

- 缺失 source 在创建任务前拒绝；旧 source 不能为新内容启动输出。
- 实际等待中的导出可终止；另一文稿不能取消它。运行中的导出响应 requested，真实 AbortSignal 结束后查询得到更大序号与 cancelled。
- 文稿 JSON 被实际写坏后，原任务仍能按 ID 查询和取消。一个通过公开 Exporter 接口抛出真实目录发现错误的私有插件，使 `get_builds` 返回失败原因及原任务。
- 完成回执保留服务原有序号、时间、来源、文件类型和大小；字幕地址返回插件实际写出的 VTT 字节。该私有输出是协议验证材料，不是视频同步或语音服务验收。
- 只构建一份小文稿的官方 web 输出，当前 source 一致，主 HTML 可以读取。MCP 构建、查询与取消不修改两份规范 JSON。

消费者使用主机已确认的文稿会话令牌，一个可中断的实际 Exporter 控制队列，另一个生成小型文本／字幕产物，没有 mock 宿主、伪造任务状态或调用语音模型。未验证外部未确认调用的交互批准弹窗。临时客户端、服务和目录已清理，没有操作公共 4320 或作者文稿。

中间记录均保留：首轮没有读取错误正文，随后观察到 JSON Schema 引用错误；共享 Schema 修复由同轮作者事务实现记录。加入直接作者路由后，无 header 的文稿读取与 jobs 的 401 不一致，实际暴露了 launcher token 门禁遗漏；该门禁已由共享包装修复，作者事务消费者单独验证。root 消费者的 HTTP 观察随后统一携带自己的临时 token。`mcp-output-jobs-target-oracle-before.json` 则保留一个错误前提：坏 JSON 不一定让目标发现失败，因为查看器可保留旧编译；最终用真实 Exporter 失败明确覆盖异常路径，没有为通过这一断言改产品。

独立静态审阅通过。此片没有实现跨重启意图账本、所有任务的统一事件资源或 compiler-only stdio 的可取消构建；其不支持 source 确认时明确拒绝带 source 的请求。未运行测试套件、全量 E2E 或全量示例构建。
