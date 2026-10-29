# Presmium Cloud

可选的独立托管应用。PostgreSQL 保存空间、成员、文稿、历史与预算；Keycloak 提供真实注册登录；S3 保存素材与产物。云端继续使用 `TeachingDocument`，Web 和 MCP 共用文稿事务。

本地 `presmium studio` 不依赖云账号。云端直接复用其 `DocumentView`、编辑状态、历史、放映和导出面板；宿主只提供身份、路由和标准 workspace 服务适配。打开预览或放映时自动准备当前保存版本，无需报价确认或前往任务面板。编译、导出和私有 Jupyter 环境在后台隔离运行，保留 CPU、内存、进程、磁盘、并发和时长配额。

- 架构：[云端 RFC](../../docs/rfc-cloud.md)
- 部署、配置与恢复：[Linux 部署](../../docs/cloud-deployment.md)
- 需求与实现：[需求索引](project-index.yaml)
- 实际运行范围：[免费流程与 Studio 复用验收](../../docs/benchmarks/cloud-quality-2026-10-29.md)，[早期基础部署](../../docs/benchmarks/cloud-foundation-2026-10-29.md)

从仓库源码构建 `deploy/cloud/compose.yaml`。云应用是 private 包，不发布到 npm。`presmium-cloud` 提供 `serve`、`migrate`、`storage-init`、`runner`、`watchdog`；完整配置使用 `deploy/cloud/.env.example`。生产部署使用四个独立 HTTPS 来源：作者控制台、身份、用户内容与 Jupyter。执行代理独占运行控制权限；独立 watchdog 强制终止超过时限的租户容器。

当前全部非 AI 功能免费，实际预占与结算为零，零预算不阻断普通功能。云端 AI 尚未接入，`capabilities.ai=false`；即使配置 Stripe，购买、客户门户和 webhook 仍禁用。未来仅为实际提供的 AI 功能定义价格与用量，并完成真实支付联调。外部 AI 助手通过 MCP 使用的模型由其所选供应商计费。

云端使用共享成员和版本冲突保护，编辑不提供实时文本合并。预览自动合并同一保存版本的编译请求；源版本、指纹和运行快照仍由公共工作台核对。单纯保存正文不会启动生成任务或 AI 调用。AI、配音和视频制作供应商尚未接入云服务，文稿与插件不能继承平台密钥。
