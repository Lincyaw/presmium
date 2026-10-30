# 部署 Presmium 云端

本说明对应 [云端 RFC](rfc-cloud.md) 与 `deploy/cloud/compose.yaml`。JupyterHub 为每个注册用户运行一个完整的 Presmium Studio 容器；控制台负责共享、创建副本、访问令牌与 MCP；Keycloak 负责注册登录；S3 兼容存储保存共享的文稿。实现与验证状态见 `packages/cloud/project-index.yaml`。

本版本不兼容此前的云端版本（数据库表不同）。从旧版迁移时新建 Compose 项目与数据卷。

## 1. 准备

准备 Linux、Docker Engine、Docker Compose 2.24.4 或更新版本与仓库源码；宿主机不需要 Node.js、pnpm 或 Python。在 `deploy/cloud` 中生成配置：

```sh
cd deploy/cloud
bash keycloak/init-env.sh
```

脚本创建权限为 `0600` 的 `.env`，为两个数据库、Keycloak 管理员、两个 OIDC 客户端（控制台与 JupyterHub）、控制台访问 JupyterHub 的令牌、JupyterHub 加密登录状态的密钥与对象存储分别生成随机密钥，并拒绝覆盖已有文件。保管 `.env` 的加密备份。

每个部署使用独立的 `CLOUD_COMPOSE_PROJECT` 与 `CLOUD_INSTANCE_ID`；Studio 容器与卷的名字以实例 ID 开头（`<实例>-studio-<用户>`、`<实例>-work-<用户>`）。

## 2. 域名与入口

| 用途 | 地址示例 | 配置 |
| --- | --- | --- |
| 控制台 | `https://app.example.com` | `CLOUD_APP_HOST`、`CLOUD_PUBLIC_URL` |
| 注册登录 | `https://auth.example.com` | `CLOUD_AUTH_HOST`、`CLOUD_AUTH_URL`、`CLOUD_OIDC_ISSUER` |
| 共享的文稿 | `https://content.example.net` | `CLOUD_CONTENT_HOST`、`CLOUD_CONTENT_URL` |
| Studio（JupyterHub） | `https://studio.example.net` | `CLOUD_HUB_HOST`、`CLOUD_HUB_URL` |

四个地址互不同源，Caddy 自动申请证书。共享内容的入口只转发 `/p/*`，并删除请求中的 Cookie、Authorization 与响应中的 Set-Cookie。数据库、对象存储、JupyterHub 的 API 端口与 Studio 容器都不发布宿主端口；Studio 容器只在独立的 `<项目>-studios` 网络上，与数据库、身份与对象存储隔开。

```sh
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps
```

`studio-image` 包含完整工具链与 Chromium，约 5 GB，所有用户共用。`migrate` 与 `storage-init` 正常退出（Exited (0)）后控制台启动；JupyterHub 在 Keycloak 就绪后启动。

### SSH 下的本机验证

没有公网域名时使用回环覆盖文件：只发布 `127.0.0.1:18787`，使用 HTTP，注册时不验证邮箱。在 `.env` 中设置 `CLOUD_PUBLIC_URL=http://app.localhost:18787`、`CLOUD_AUTH_URL=http://auth.localhost:18787`、`CLOUD_CONTENT_URL=http://content.localhost:18787`、`CLOUD_HUB_URL=http://hub.localhost:18787` 与 `CLOUD_OIDC_ISSUER=http://auth.localhost:18787/realms/presmium`。

```sh
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml build
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml up -d
ssh -N -L 18787:127.0.0.1:18787 <服务器>
```

浏览器打开 `http://app.localhost:18787`。Chromium 与 Firefox 把 `*.localhost` 解析到本机；其他浏览器需要在 hosts 中为这四个主机名指定 `127.0.0.1`。

## 3. 注册、登录与身份

默认 Keycloak realm 为 `presmium`，启用注册、邮箱登录、密码恢复与暴力尝试限制，有两个客户端：控制台（`presmium-cloud`，PKCE）与 JupyterHub（`presmium-hub`）。用户在控制台登录后打开 Studio，JupyterHub 经同一 realm 完成登录，不需要再次输入密码。JupyterHub 的用户名是 OIDC 的 `sub`，控制台按它找到同一用户的服务器。

公网部署默认验证邮箱：首次启动前填写 `.env` 中的 `CLOUD_SMTP_*`，空的 From 会使 realm 导入失败。realm 只在不存在时导入；之后修改客户端密钥、SMTP 或回调地址，在 Keycloak 管理界面（身份域的 `/admin/`，凭据为 `CLOUD_KEYCLOAK_ADMIN` 与 `CLOUD_KEYCLOAK_ADMIN_PASSWORD`）中修改。身份页使用随镜像打包的 `presmium` 登录主题（`deploy/cloud/keycloak/build-theme.mjs`）。

## 4. Studio 的资源与 AI

`.env` 中的 `CLOUD_STUDIO_MEMORY`、`CLOUD_STUDIO_CPUS` 与 `CLOUD_STUDIO_IDLE_SECONDS`（默认 4G、2、1800）是每个 Studio 容器的内存、CPU 与空闲停止时间；其余规格与加固（只读根文件系统、去掉全部 capabilities、no-new-privileges、进程数上限、可执行的 `/tmp`）在 `deploy/cloud/hub/jupyterhub_config.py`。修改后重建并重启 `hub`；正在运行的 Studio 在下次启动时采用新规格。

用户的卷是 Docker 命名卷，单机部署时没有容量上限。需要配额时为 DockerSpawner 配置带配额的卷驱动，或改用 Kubernetes 上的 Zero to JupyterHub（KubeSpawner 与带容量的存储类），Studio 镜像与控制台不变。

AI 助手使用作者在 Studio 的“设置 → 模型”中填写的 API Key。云端不提供、也不计费模型用量。Studio 容器可以访问互联网，以连接作者自己的模型服务。

### 文稿中的 Jupyter 环境

Studio 镜像包含 `ipykernel` 与 `python3` 内核。启动时，若没有显式设置 `PRESMIUM_ENV_LAB_URL`，扩展会把具名环境 `lab` 指向该用户自己的 Jupyter single-user server，并只向 Studio 子进程提供服务器令牌。文稿可声明 `metadata.execute.environments.lab = { kind: 'jupyter', auth: 'proxy', kernel: 'python3', languages: ['python'] }`，代码块通过 `presmium.env.lab` 执行器使用它；相同的 `execution.session` 复用同一内核。终端组件也可使用 `lab`。

地址与令牌由服务端配置，不能写进 `lecture.json`。显式配置 `PRESMIUM_ENV_LAB_URL` 时会保留运营者提供的地址与令牌组合。修改镜像后，已运行的 Studio 仍使用旧镜像，需要保存文稿并重新启动该 Studio 才能采用新内核。

需要由文稿按需启动独立环境时，声明 `auth: 'hub', profile: 'python', kernel: 'python3'`，代码块和终端继续引用同一个环境名。点击运行或打开终端时，服务端通过当前用户的 Hub 令牌启动或复用命名服务器 `env-python`，然后挂载已有的 Jupyter 代理；仅阅读、编译或探测不会启动它。环境重启后，下一次运行会根据 Hub 的启动时间重建客户端会话。静态产物没有启动服务，需要在 Studio 或提供对应服务的网页中运行。

Hub 默认提供 `python` 规格，使用 Studio 镜像中的 Python 内核，以运行环境模式启动，不启动第二份 Studio。它使用独立的用户环境卷，默认 1 CPU、1 GiB，不挂载作者的 Studio 卷。运营者用 `CLOUD_ENVIRONMENT_PROFILES` 指定规格映射，例如 `{"python":{"image":"presmium-cloud-studio:<发布标签>","memory":"1G","cpus":1}}`；自定义镜像必须提供兼容的 `jupyterhub-singleuser`、所需内核、非 root 用户以及可写 `/work`。规格名为最多 32 字符的小写字母、数字与连字符，首字符为字母。文稿不能覆盖镜像、用户身份、资源限制或连接地址。

`CLOUD_ENVIRONMENT_LIMIT` 默认允许每用户最多 3 个命名环境。同一用户相同规格跨文稿复用，重置代码会话只关闭内核，空闲环境由现有 idle culler 停止并删除 Hub 的命名服务器记录，环境卷保留；也可在 Hub 的服务器管理界面停止。Studio 的 Hub 令牌只可管理及访问该用户的服务器，环境自身的令牌只可访问该环境。修改规格映射后重启 Hub；已经运行的环境需要停止后再启动才采用新镜像与限制。

Docker 开发容器运行未在云端用户容器中启用；其环境包导出可独立使用。默认连接验证与线程测量见 [云端执行环境与线程测量](benchmarks/cloud-environments-2026-10-30/README.md)，按声明启动的验收另行记录。

## 5. 管理、日志与排障

```sh
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail=100 api hub keycloak storage-init migrate
docker ps --filter "name=${CLOUD_INSTANCE_ID:-presmium-cloud}-studio-" --format '{{.Names}} {{.Status}}'
```

JupyterHub 的管理界面在 Studio 地址的 `/hub/admin`，可以查看在线用户、停止某人的 Studio。需要管理员时在 `deploy/cloud/hub/jupyterhub_config.py` 中设置 `c.Authenticator.admin_users`（用户名为 Keycloak 中该账号的 ID）。Studio 自己的完整日志在用户卷的 `state/presmium/studio/` 中。日志中不应出现访问令牌或 API Key。

## 6. 备份与恢复

备份包含应用数据库、身份数据库、对象存储卷、JupyterHub 的 `hub-data` 卷、全部 `<实例>-work-*` 用户卷、`.env` 与 Caddy 证书卷。作者的文稿、git 历史、模型设置与 AI 会话都在用户卷中。

在维护窗口停止 JupyterHub（用户的 Studio 会继续运行，先在 `/hub/admin` 中停止全部服务器），再停止其余写入者并导出数据库与卷：

```sh
umask 077
cloud_project=presmium-cloud
cloud_instance=presmium-cloud
mkdir -p backups
docker compose --env-file .env -f compose.yaml stop entrance api hub keycloak object-store
docker compose --env-file .env -f compose.yaml exec -T database pg_dump -U presmium -d presmium -Fc > backups/presmium.dump
docker compose --env-file .env -f compose.yaml exec -T identity-database pg_dump -U keycloak -d keycloak -Fc > backups/keycloak.dump
backup_helper=busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e
for volume in "${cloud_project}_objects" "${cloud_project}_hub-data" "${cloud_project}_entrance-data" "${cloud_project}_entrance-config" $(docker volume ls -q --filter "name=^${cloud_instance}-work-"); do
  docker run --rm --network none --read-only -v "$volume:/data:ro" -v "$PWD/backups:/backup" "$backup_helper" tar -C /data -cf "/backup/$volume.tar" .
done
cp .env backups/deployment.env
docker compose --env-file .env -f compose.yaml up -d
```

恢复在空的 Docker 节点上进行，沿用备份中的 Compose 项目名与 `CLOUD_INSTANCE_ID`：恢复 `.env`，`docker compose ... create`，只启动两个数据库并用 `pg_restore --exit-on-error` 恢复，按卷名创建并解包每个卷，最后 `up -d`。每条命令成功后才执行下一条。

## 7. 升级与回滚

升级前完成可恢复的备份，记录源码提交与镜像摘要。构建新版本（包括 `studio-image`），把 `CLOUD_IMAGE_TAG` 换为本次的标签，然后：

```sh
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml run --rm migrate
docker compose --env-file .env -f compose.yaml up -d
```

JupyterHub 重启时不停止正在运行的 Studio；它们继续使用旧镜像，下次启动时使用新镜像。不要修改已经执行过的迁移文件。停止部署但保留数据用 `docker compose ... down`，不要加删除卷的参数，也不要用清理整个 Docker 主机的命令。
