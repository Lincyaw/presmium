# Presmium Cloud

可选的独立托管应用（实验性）：注册登录之后，每个用户在自己的容器中使用完整的 Presmium Studio（AI 助手、编辑、预览、放映、讲授制作、配音与导出），与本机的 `presmium studio` 相同。作者之间用共享链接交换文稿，读者可以把它创建为自己空间中的副本；Claude Code、Codex 等 AI 助手用访问令牌经 `/mcp` 连接到自己的 Studio。

- 架构：[云端 RFC](../../docs/rfc-cloud.md)
- 部署、配置与恢复：[部署说明](../../docs/cloud-deployment.md)
- 需求与实现：[需求索引](project-index.yaml)
- 实际运行：[本机回环部署验证](../../docs/benchmarks/cloud-studio-2026-10-29.md)

`presmium-cloud` 提供 `serve`（控制台、共享网站与 Studio 网关）、`runner`（唯一持有 Docker 的执行代理）、`watchdog`、`migrate` 与 `storage-init`；配置见 `deploy/cloud/.env.example`。Studio 镜像在 `deploy/cloud/studio/`。云应用是 private 包，不发布到 npm。
