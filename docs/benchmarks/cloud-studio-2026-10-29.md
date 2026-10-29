# 云端：每用户一个 Studio 的本机回环验证

2026-10-29，分支 `cloud-studio`。部署为 `deploy/cloud/compose.yaml` 加 `compose.loopback.yaml`，Compose 项目 `presmium-cloud-trial`，入口 `127.0.0.1:18787`，存储为 `CLOUD_STORAGE_UNENFORCED=true` 的普通目录（没有 XFS 配额）。浏览器为 Playwright 的 Chromium（`playwright-chromium` 1.64.1），由脚本驱动；未使用测试套件。

## 实际运行的路径

| 路径 | 结果 |
| --- | --- |
| 注册 | 两个账号经 Keycloak 注册表单注册，回到控制台 |
| 打开 Studio | 控制台启动 Studio 容器，经两个主机的票据进入；新空间是示例工作区，首页列出 12 份文稿；“AI Assistant”与“Set Up a Model”入口存在 |
| 打开文稿 | 控制台中的文稿链接直接打开该文稿（`#presmium?document=…&id=…`）；正文、页面列表、动画预览与“Video Production”显示，没有错误提示；修订历史请求成功 |
| 共享 | 控制台“共享”生成快照，状态变为“可以访问” |
| 匿名阅读 | 未登录的浏览器打开 `/s/<链接>`，看到标题、共享者与网站；网站中的交互动画可操作 |
| 创建副本 | 第二个账号登录后“创建副本”：副本提交到其工作区（`Fork: 冒泡排序`），新标签页打开该文稿；原作者的工作区没有变化 |
| 停止与重新启动 | 控制台停止后状态为“已停止”；再次打开 8 秒后进入 Studio，副本的提交仍在 |
| MCP | 用控制台创建的访问令牌，MCP 客户端经 `/mcp` 列出 80 个工具并调用 `list_documents`，返回该用户的文稿；无效令牌 401 |
| 隔离 | 无 cookie、另一个账号的网关 cookie 访问他人的 Studio 主机与预览主机均 401；未知 Studio 主机 401；内容来源上的控制台路由 404；证书询问对已有 Studio 返回 200，对未知主机 404 |
| 界面 | 控制台在亮色与暗色、1400 与 390 宽度下检查；共享页、启动页与停止状态截图检查 |

## 运行中发现并已修正

- DeepSeek Harness 的原生模块被复制到 `/tmp` 后加载，Docker 的 tmpfs 默认 `noexec` 使其失败：Studio 容器的 `/tmp` 显式加 `exec`。
- DeepSeek Harness 的会话 cookie 为 `SameSite=Strict`，从控制台开始的跳转链末端换取的 cookie 不被带上：Studio 主机的入口改为返回一个由本主机页面发起跳转的页面。
- 工作区服务的修订历史使用 `git cat-file -Z`（git 2.43 起）：Studio 镜像改用 Debian trixie（git 2.47）。
- 共享的网站位于构建输出的 `web/` 之下：快照改为打包该目录。

## 未验证

- 用真实模型密钥与 AI 助手对话（入口与设置存在，本轮没有可用的密钥）。
- XFS 项目配额磁盘池、公网 HTTPS 与按需证书、多个执行节点。
- 空闲回收与看门狗时限的实际触发（逻辑与旧版相同，未等到触发）。
- 退出控制台登录后 Studio 网关会话立即失效（数据库外键级联，未在浏览器中复验）。
- Firefox 与 WebKit。
