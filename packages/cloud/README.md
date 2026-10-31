# Presmium Cloud

可选的独立托管应用（实验性）：注册登录之后，每个用户在 JupyterHub 为其启动的容器中使用完整的 Presmium Studio（AI 助手、编辑、预览、放映、讲授制作、配音与导出），与本机的 `presmium studio` 相同。作者之间用共享链接交换文稿，读者可以把它创建为自己的副本；Claude Code、Codex 等 AI 助手用访问令牌经 `/mcp` 连接到自己的 Studio。

- 架构、部署、配置与恢复：[云端](../../docs/cloud.md)
- 需求与实现：[需求索引](project-index.yaml)

本包是控制台：`presmium-cloud serve`（共享、副本、访问令牌、MCP 转发、共享网站，并作为 JupyterHub 的 service 读取与控制用户的 Studio）、`migrate` 与 `storage-init`。JupyterHub 的配置在 `deploy/cloud/hub/`，Studio 镜像与其中的 JupyterHub 扩展、控制服务在 `deploy/cloud/studio/`。云应用是 private 包，不发布到 npm。
