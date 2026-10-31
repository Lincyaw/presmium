# Presmium

在工作台编辑教学文稿，以 lecture.json 保存唯一内容，编译为网页、幻灯片、Jupyter notebook 与讲授快照。

示例统一在 [Gallery](examples/gallery/README.md)：五份[功能合集与两份教程](examples/gallery/FEATURES.md)、两讲完整课程、傅里叶小课、产品宣传片与 18 份动画效果参考。运行 `pnpm studio` 即可在独立的可编辑副本中浏览全部 29 份主文稿。`pnpm demo:check` 仍只检查原有两讲；`pnpm demo:build` 构建整个 Gallery 站点。

## 安装

需要 Node.js 22.19 以上与 pnpm（`corepack enable pnpm`）。第一次全局安装前运行一次 `pnpm setup`。

```sh
pnpm add -g @lincyaw/presmium
```

## 使用

一份讲义：

```sh
presmium new my-lecture     # 新建
cd my-lecture
presmium dev                # 本机预览网页与幻灯片，保存即更新
presmium check              # 检查：文稿结构、链接、代码引用
presmium build              # 构建到 dist/：网页、幻灯片、notebook
```

多份文档组成的工作区：

```sh
presmium new my-course --type workspace
cd my-course
presmium serve              # 文档列表与各文档的站点，http://127.0.0.1:4310
presmium build              # 整个站点构建到 dist/web/
```

工作台（实验性，编辑、预览与 AI agent）：`pnpm add -g @lincyaw/studio`，然后在工作区中运行 `presmium-studio`，打开终端打印的网址。AI 助手的模型在工作台的“设置 → 模型”中填写 API Key；不配模型也能编辑和预览。

放在反向代理后面或某个路径下时，用 `--public-url` 告诉工作台浏览器打开的地址，`--preview-url` 给出预览的地址（都可以带路径，例如 `https://example.com/studio/`）；`presmium serve --public-url <网址>` 同样可以把工作区服务放在路径下。

讲义怎么写见[作者指南](site/guide/lecture.json)，插件怎么写见[插件开发指南](site/plugins/lecture.json)。

## 从源码使用

```sh
git clone https://github.com/Lincyaw/presmium.git
cd presmium
pnpm install
pnpm add -g ./packages/presmium
```

之后的 `presmium` 命令运行的就是这份源码。仓库内也可以直接启动浏览器编辑工作台：

```sh
pnpm studio
```

首次自动在 `.presmium/gallery-workspace` 准备全部 Gallery 示例的独立副本，后续复用其中的文档。打开终端打印的完整网址（默认端口 4320），即可编辑、保存与预览，不配模型也能使用。用 `pnpm studio <目录>` 打开自己的讲义或工作区，`Ctrl+C` 停止。参与开发见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 云端部署

给多人使用：每个注册用户在 JupyterHub 上得到一个完整的工作台，可以把文稿共享成链接，别人打开后创建副本到自己的空间，也可以用访问令牌让 Claude Code 等 AI 助手经 MCP 操作自己的文稿。需要 Linux、Docker 与 Docker Compose 2.24.4 以上，以及四个指向服务器的域名（控制台、注册登录、共享内容、工作台）。

```sh
cd deploy/cloud
bash keycloak/init-env.sh      # 生成 .env 与随机密钥
# 编辑 .env：四个域名、CLOUD_ACME_EMAIL、CLOUD_SMTP_*
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml up -d
```

没有域名时可以加 `-f compose.loopback.yaml` 只在本机 `127.0.0.1:18787` 上试用。资源上限、管理、备份与升级见[云端部署说明](docs/cloud.md)。

## 许可证

[Apache-2.0](LICENSE)
