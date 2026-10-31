# Presmium 云端

状态：实验性，已在本机回环部署中验证；公网 HTTPS、磁盘配额与多节点未验证。代码在 `packages/cloud/` 与 `deploy/cloud/`。

## 1. 定位

云端是浏览器中的 Presmium Studio。注册登录后，作者得到与本机 `presmium studio` 相同的全部功能。云端不另写编辑器或文稿存储，而是为每个用户运行一个真正的 Studio。

- 单用户：一个账号一个工作区，不做多人协作。作者之间通过共享链接交换文稿，读者可以把共享的文稿创建为自己的副本。
- AI 助手用作者自己的模型服务，API Key 在 Studio 的“设置 → 模型”中填写，存在作者的卷上。云端不提供、也不计费模型用量。
- 调度、登录、路由与空闲回收用 JupyterHub。云端只依赖 `presmium studio` 等的公开命令行与接口，本机用法不受影响。

## 2. 服务

| 服务 | 职责 |
|---|---|
| Keycloak | OIDC 注册、登录、找回密码、邮箱验证；控制台与 JupyterHub 是同一 realm 的两个客户端 |
| JupyterHub（`deploy/cloud/hub`） | DockerSpawner 为每个用户启动 Studio 容器并挂卷，路由 `/user/<名字>/`，idle culler 停止空闲 Studio；唯一持有 Docker 的服务 |
| Studio 容器（`deploy/cloud/studio`） | JupyterHub 的 single-user server，内含 Studio、工作区服务与控制服务 `control.mjs` |
| 控制台（`presmium-cloud serve`） | 共享、创建副本、访问令牌、MCP 转发、共享网站、Studio 状态与入口；作为 JupyterHub service 访问 Hub API |
| PostgreSQL | 账号、登录会话、访问令牌与共享记录；不存文稿 |
| 对象存储（S3 兼容） | 共享文稿的源文件归档与网站 |
| Caddy | TLS 与按主机名转发控制台、身份、共享内容、JupyterHub 四个来源 |

浏览器访问控制台（`app.*`）与 JupyterHub（`studio.*`），外部 AI 助手访问控制台的 `/mcp`，读者访问共享内容（`content.*`）。JupyterHub 的用户名是 OIDC 的 `sub`，控制台按它找到同一用户的服务器。

## 3. Studio 容器

服务器启动时，扩展 `presmium_hub.py`：

1. 准备卷 `/work`：`space`（工作区，git 仓库；新用户得到示例工作区）、`state`（DeepSeek Harness 的会话、模型设置与 API Key）、`cache`、`home`、`config`。git 作者身份取 Keycloak 中的名字与邮箱。
2. 在回环端口启动 `presmium studio /work/space --public-url <Hub>/user/<名字>/studio/ --preview-url <Hub>/user/<名字>/preview/` 与控制服务。
3. jupyter-server-proxy 在 `/user/<名字>/` 下转发 `studio/`（去掉前缀）、`preview/`（保留路径）、`cloud/`（控制服务）。请求先过 JupyterHub 认证，只有本人或持有 `access:servers` 的控制台能到达。
4. `/user/<名字>/presmium` 带启动令牌打开 Studio，可附 `document` 与 `id` 打开某份文稿。它返回同源发起跳转的页面，因为 DeepSeek Harness 的会话 cookie 是 `SameSite=Strict`。

容器以普通用户运行，只读根文件系统，去掉全部 capabilities，no-new-privileges，限制内存、CPU 与进程数；`/tmp` 可执行（DeepSeek Harness 的原生模块从那里加载）。Studio 与预览同源，预览中文稿的代码可以以作者身份调用 Studio 接口；文稿的编译时代码本来就以作者身份运行，所以只复制信任的文稿，共享页对此有提示。

## 4. 打开、停止与回收

- 控制台的“打开 Studio”链接到 `/hub/user-redirect/presmium`：经 Keycloak 登录（已登录时免输入），需要时启动容器并显示进度。
- 空闲 `CLOUD_STUDIO_IDLE_SECONDS`（默认 1800）后 idle culler 停止 Studio。停止只删除容器，卷保留。控制台也可停止。
- 共享、创建副本与 MCP 调用时，控制台经 Hub API 启动用户的服务器并等待就绪。
- JupyterHub 重启或升级不停止运行中的 Studio（`cleanup_servers = False`）。

## 5. 共享与创建副本

- 共享：控制台记录一条共享（22 字符的随机链接），在作者的 Studio 中对该文稿目录做 `git archive HEAD` 并构建网站（基础路径 `/p/<链接>/`），两者存入对象存储。读者在 `/s/<链接>` 看到网站。快照之后的修改不影响它；作者可以再次共享或删除链接。
- 创建副本：控制台确保读者的 Studio 在运行，把源文件归档交给控制服务。控制服务解包，删除链接与非普通文件，放到工作区顶层一个不重名的目录并提交（`Fork: <标题>`），然后打开文稿。

## 6. MCP 接入

控制台的 `/mcp` 接受用户的访问令牌（`pmc_` 开头，只存散列，可设到期，可撤销）。它在需要时启动该用户的 Studio，经 `/user/<名字>/cloud/mcp` 转给控制服务，再由控制服务带工作区服务的令牌转给 `/mcp`。外部 AI 助手因此与 Studio 内的 AI 助手使用同一套工具和同一个工作区。工具见 [MCP 编辑动作](authoring-actions.md)。

## 7. 存储与 Jupyter 环境

文稿只在各用户卷中，版本即 git 历史。单机部署的卷是 Docker 命名卷，没有容量上限；需要配额时用带配额的卷驱动，或改用 Zero to JupyterHub（KubeSpawner 与带容量的存储类）。

Studio 镜像带 `python3` 内核。未设置 `PRESMIUM_ENV_LAB_URL` 时，具名环境 `lab` 指向用户自己的 single-user server，文稿可声明：

```js
metadata.execute.environments.lab = { kind: 'jupyter', auth: 'proxy', kernel: 'python3', languages: ['python'] }
```

声明 `auth: 'hub', profile: 'python'` 时，点击运行或打开终端才启动或复用命名服务器 `env-python`（阅读、编译不启动）。它用独立的环境卷，默认 1 CPU、1 GiB，不挂载作者卷。规格由运营者用 `CLOUD_ENVIRONMENT_PROFILES` 设置，例如 `{"python":{"image":"presmium-cloud-studio:<标签>","memory":"1G","cpus":1}}`；规格名为小写字母开头、最多 32 个字符的小写字母、数字与连字符。每用户最多 `CLOUD_ENVIRONMENT_LIMIT`（默认 3）个命名环境，空闲时由 idle culler 回收。地址、令牌、镜像与资源都在服务端，文稿不能覆盖。

## 8. 部署

### 8.1 准备

Linux、Docker Engine、Docker Compose 2.24.4 及以上与仓库源码；宿主机不需要 Node.js。

```sh
cd deploy/cloud
bash keycloak/init-env.sh   # 生成 0600 的 .env 与全部随机密钥，不覆盖已有文件
```

保管 `.env` 的加密备份。每个部署用独立的 `CLOUD_COMPOSE_PROJECT` 与 `CLOUD_INSTANCE_ID`；Studio 容器与卷名为 `<实例>-studio-<用户>`、`<实例>-work-<用户>`。

### 8.2 域名与入口

| 用途 | 示例 | 配置 |
|---|---|---|
| 控制台 | `https://app.example.com` | `CLOUD_APP_HOST`、`CLOUD_PUBLIC_URL` |
| 注册登录 | `https://auth.example.com` | `CLOUD_AUTH_HOST`、`CLOUD_AUTH_URL`、`CLOUD_OIDC_ISSUER` |
| 共享内容 | `https://content.example.net` | `CLOUD_CONTENT_HOST`、`CLOUD_CONTENT_URL` |
| Studio | `https://studio.example.net` | `CLOUD_HUB_HOST`、`CLOUD_HUB_URL` |

四个地址互不同源，Caddy 自动申请证书。共享内容入口只转发 `/p/*`，并去掉 Cookie、Authorization 与 Set-Cookie。数据库、对象存储、Hub API 与 Studio 容器不发布宿主端口；Studio 容器只在 `<项目>-studios` 网络上。

```sh
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps
```

`studio-image` 约 5 GB，含工具链、Chromium 与预打包的官方查看器（经 `PRESMIUM_VIEWER_SEED` 作为只读缓存）。`migrate` 与 `storage-init` 以 Exited (0) 结束后控制台启动。

无公网域名时用回环覆盖：在 `.env` 设 `CLOUD_PUBLIC_URL=http://app.localhost:18787`、`CLOUD_AUTH_URL=http://auth.localhost:18787`、`CLOUD_CONTENT_URL=http://content.localhost:18787`、`CLOUD_HUB_URL=http://hub.localhost:18787`、`CLOUD_OIDC_ISSUER=http://auth.localhost:18787/realms/presmium`，以上命令都加 `-f compose.loopback.yaml`，再 `ssh -N -L 18787:127.0.0.1:18787 <服务器>`，打开 `http://app.localhost:18787`。只发布 `127.0.0.1:18787`，注册不验证邮箱。

### 8.3 注册、登录与身份

realm `presmium` 启用注册、邮箱登录、密码恢复与暴力尝试限制，客户端为 `presmium-cloud`（控制台，PKCE）与 `presmium-hub`。公网部署验证邮箱：首次启动前填 `CLOUD_SMTP_*`（From 为空会使 realm 导入失败）。realm 只在不存在时导入，之后的修改在身份域的 `/admin/` 中进行（`CLOUD_KEYCLOAK_ADMIN`、`CLOUD_KEYCLOAK_ADMIN_PASSWORD`）。登录主题由 `deploy/cloud/keycloak/build-theme.mjs` 打包。

### 8.4 Studio 资源与 AI

`CLOUD_STUDIO_MEMORY`、`CLOUD_STUDIO_CPUS`、`CLOUD_STUDIO_PIDS`、`CLOUD_STUDIO_IDLE_SECONDS`（默认 4G、2、2048、1800）是每个 Studio 的规格；其余加固在 `deploy/cloud/hub/jupyterhub_config.py`。修改后重建并重启 `hub`，运行中的 Studio 下次启动时采用。Studio 容器可访问互联网，以连接作者的模型服务。

### 8.5 管理、日志与排障

```sh
docker compose --env-file .env -f compose.yaml logs --tail=100 api hub keycloak storage-init migrate
docker ps --filter "name=${CLOUD_INSTANCE_ID:-presmium-cloud}-studio-" --format '{{.Names}} {{.Status}}'
```

JupyterHub 管理界面在 Studio 地址的 `/hub/admin`，管理员在 `jupyterhub_config.py` 的 `c.Authenticator.admin_users` 中设置（值为 Keycloak 账号 ID）。Studio 的完整日志在用户卷的 `state/presmium/studio/`。日志中不应出现访问令牌或 API Key。

### 8.6 备份与恢复

备份应用数据库、身份数据库、对象存储卷、`hub-data`、全部 `<实例>-work-*` 卷、`.env` 与 Caddy 证书卷。先在 `/hub/admin` 停止全部服务器，再：

```sh
umask 077; cloud_project=presmium-cloud; cloud_instance=presmium-cloud; mkdir -p backups
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

恢复在空的 Docker 节点上，沿用原 Compose 项目名与 `CLOUD_INSTANCE_ID`：恢复 `.env`，`docker compose … create`，只启动两个数据库并 `pg_restore --exit-on-error`，按卷名创建并解包每个卷，最后 `up -d`。每步成功后再执行下一步。

### 8.7 升级

先做可恢复的备份，记录源码提交与镜像摘要。把 `CLOUD_IMAGE_TAG` 换为新标签：

```sh
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml run --rm migrate
docker compose --env-file .env -f compose.yaml up -d
```

运行中的 Studio 继续用旧镜像，下次启动时换新。不修改已执行的迁移文件。停止但保留数据用 `docker compose … down`，不加删除卷的参数，不清理整个 Docker 主机。
