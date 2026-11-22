# Presmium 云端

状态：实验性，已在本机回环部署中验证（含一条命令安装的本机试用方式）；公网 HTTPS、磁盘配额与多节点未验证。代码在 `packages/cloud/` 与 `deploy/cloud/`。

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
| 对象存储（Versity S3 Gateway，`versity/versitygw`，卷 `object-data`） | 共享文稿的源文件归档与网站；每个桶是卷中的一个目录，每个对象是其中的普通文件。也可换用外部的 S3 兼容服务（`CLOUD_S3_*`） |
| Caddy | TLS 与转发控制台、身份、共享内容、JupyterHub 四个入口：各用一个主机名（`Caddyfile`），或同在一个地址下按路径区分（`Caddyfile.path`，见 8.8 节） |

浏览器访问控制台（`app.*`，单一地址时为 `/`）与 JupyterHub（`studio.*`，单一地址时为 `/studio/`），外部 AI 助手访问控制台的 `/mcp`，读者访问共享内容（`content.*`，单一地址时为 `/p/`）。JupyterHub 的用户名是 OIDC 的 `sub`，控制台按它找到同一用户的服务器。

## 3. Studio 容器

服务器启动时，扩展 `presmium_hub.py`：

1. 准备卷 `/work`：`space`（工作区，git 仓库；新用户得到示例工作区）、`state`（DeepSeek Harness 的会话、模型设置与 API Key）、`cache`、`home`、`config`。git 作者身份取 Keycloak 中的名字与邮箱。容器被停止时来不及清理状态文件，所以每次启动先删除卷上 Studio 与工作区服务留下的状态文件（`server.json`），以免新容器中碰巧同号的进程使工作区服务误以为已有服务在运行。
2. 在回环端口启动 `presmium studio /work/space --public-url <Hub>/user/<名字>/studio/ --preview-url <Hub>/user/<名字>/preview/` 与控制服务。
3. jupyter-server-proxy 在 `/user/<名字>/`（Hub 的基础路径之下，单一地址时为 `/studio/user/<名字>/`）下转发 `studio/`（去掉前缀）、`preview/`（保留路径）、`cloud/`（控制服务）。请求先过 JupyterHub 认证，只有本人或持有 `access:servers` 的控制台能到达。
4. `/user/<名字>/presmium` 带启动令牌打开 Studio，可附 `document` 与 `id` 打开某份文稿。它返回同源发起跳转的页面，因为 DeepSeek Harness 的会话 cookie 是 `SameSite=Strict`。

容器以普通用户运行，只读根文件系统，去掉全部 capabilities，no-new-privileges，限制内存、CPU 与进程数；`/tmp` 可执行（DeepSeek Harness 的原生模块从那里加载）。Studio 与预览同源，预览中文稿的代码可以以作者身份调用 Studio 接口（单一地址时也包括控制台的接口）；文稿的编译时代码本来就以作者身份运行，所以只复制信任的文稿，共享页对此有提示。

## 4. 打开、停止与回收

- 控制台的“打开 Studio”链接到 `/hub/user-redirect/presmium`：经 Keycloak 登录（已登录时免输入），需要时启动容器并显示进度。
- 空闲 `CLOUD_STUDIO_IDLE_SECONDS`（默认 1800）后 idle culler（`jupyterhub-idle-culler`，每半个空闲时长检查一次）停止 Studio；空闲的命名环境（`env-*`）停止并从 Hub 中移除（`--remove-named-servers=True`），下次运行时重新创建。停止只删除容器，作者卷与环境卷都保留。控制台也可停止。Hub 从代理与各服务器得知活动的间隔取空闲时长的四分之一（30 到 300 秒），使正在使用的 Studio 不被停止；共享、创建副本与 MCP 调用经控制服务，也算活动。
- 共享、创建副本与 MCP 调用时，控制台经 Hub API 启动用户的服务器并等待就绪。
- JupyterHub 重启或升级不停止运行中的 Studio（`cleanup_servers = False`）。

## 5. 共享与创建副本

- 文稿列表：Studio 运行时，控制台经控制服务读取工作区服务的文稿树（`tree`，与 Studio 侧栏相同：工作区中每个 `index.pmd`，含下级文稿，不含回收站），按文稿树深度优先列出，下级文稿缩进在上级之下。每项以文稿文件夹（相对工作区，例如 `docs/<名字>`）标识，都可以共享。工作区服务尚未就绪时回答 409，控制台提示 Studio 正在启动。
- 共享：控制台记录一条共享（22 字符的随机链接），在作者的 Studio 中把该文稿目录中已保存的文件（工作区 git 不忽略的文件，不论是否提交；Studio 的修改历史与工作区自己的提交分开，新建与修改的文稿通常没有提交）打包，并构建网站（基础路径 `/p/<链接>/`），两者存入对象存储。读者在 `/s/<链接>` 看到网站。快照之后的修改不影响它；作者可以再次共享或删除链接。
- 创建副本：控制台确保读者的 Studio 在运行，把源文件归档交给控制服务。控制服务解包，删除链接与非普通文件，放到工作区顶层一个不重名的目录并提交（`Fork: <标题>`），然后打开文稿。共享的是下级文稿时，副本的 `placement.parent` 改为 `null`，成为顶层文稿。工作区中已有同一 `id` 的文稿（例如复制自己的共享）时，副本改用 `<id>-<n>`，文稿中指向自身的引用与同步块随之改变。

## 6. MCP 接入

控制台的 `/mcp` 接受用户的访问令牌（`pmc_` 开头，只存散列，可设到期，可撤销）。它在需要时启动该用户的 Studio，经 `/user/<名字>/cloud/mcp` 转给控制服务，再由控制服务带工作区服务的令牌转给 `/mcp`。外部 AI 助手因此与 Studio 内的 AI 助手使用同一套工具和同一个工作区。工具见 [MCP 编辑动作](authoring-actions.md)。

## 7. 存储与 Jupyter 环境

文稿只在各用户卷中，版本即 git 历史。单机部署的卷是 Docker 命名卷，没有容量上限；需要配额时用带配额的卷驱动，或改用 Zero to JupyterHub（KubeSpawner 与带容量的存储类）。

Studio 镜像带 `python3` 内核。未设置 `PRESMIUM_ENV_LAB_URL` 时，具名环境 `lab` 指向用户自己的 single-user server，文稿可声明：

```js
metadata.execute.environments.lab = { kind: 'jupyter', auth: 'proxy', kernel: 'python3', languages: ['python'] }
```

声明 `auth: 'hub', profile: 'python'` 时，点击运行或打开终端才启动或复用命名服务器 `env-python`（阅读、编译不启动）。它用独立的环境卷，默认 1 CPU、1 GiB，不挂载作者卷。规格由运营者用 `CLOUD_ENVIRONMENT_PROFILES` 设置，例如 `{"python":{"image":"ghcr.io/lincyaw/presmium-cloud-studio:<版本>","memory":"1G","cpus":1}}`（默认就是部署所用的 Studio 镜像）；规格名为小写字母开头、最多 32 个字符的小写字母、数字与连字符。每用户最多 `CLOUD_ENVIRONMENT_LIMIT`（默认 3）个命名环境，空闲时由 idle culler 回收。地址、令牌、镜像与资源都在服务端，文稿不能覆盖。

## 8. 部署

### 8.1 一条命令安装

需要 Linux、Docker Engine 与 Docker Compose 2.24.4 及以上；宿主机不需要 Node.js 与仓库源码。

```sh
curl -fsSL https://raw.githubusercontent.com/Lincyaw/presmium/main/deploy/cloud/install.sh | bash
```

安装程序（`deploy/cloud/install.sh`）检查系统、Docker、Compose 版本与端口，缺 Docker 时给出官方的 `curl -fsSL https://get.docker.com | sudo sh`，不自行安装。它只问一个问题：作者从哪里打开云端。

| 方式 | 参数 | 地址 | 需要 |
|---|---|---|---|
| 自己的域名 | `--domain example.com` | `app.`、`auth.`、`content.`、`studio.example.com` | 一条 DNS 记录 `*.example.com` 指向服务器；安装程序检查四个名字是否解析到本机的公网 IP，未就绪时给出要加的记录 |
| 服务器 IP | `--ip [地址] [--port 端口] [--http]` | `https://203.0.113.7/` 一个地址 | 不需要 DNS，单一地址布局（8.8 节）。不给地址时自动检测公网 IP。公网 IP 用 443 端口时 Caddy 向 Let's Encrypt 申请 IP 证书（`shortlived` 配置，六天有效，自动续期），申请不到时改用 Caddy 自己的 CA；私有地址（含回环、CGNAT 与链路本地）或其他端口直接用 Caddy 自己的 CA，浏览器第一次打开时警告，安装结束时说明并给出根证书的位置。`--http` 用明文 `http://地址/`，只适合内网 |
| sslip.io 名字 | `--sslip [地址]` | `app.203-0-113-7.sslip.io` 等四个名字 | 不需要 DNS：sslip.io 把这些名字解析回公网 IP，Caddy 照常申请证书 |
| 本机试用 | `--local [--port 18787]` | `http://app.localhost:18787` 等 | 回环覆盖（`compose.loopback.yaml`），只发布 `127.0.0.1`；安装程序打印 `ssh -N -L` 的隧道命令 |

自己的域名、sslip.io 与 443 端口上的公网 IP 需要 80 与 443 端口空闲且可从公网到达；IP 不在本机网卡上时安装程序提示转发这些端口。`--ip` 加 `--port` 时只发布这一个端口（另一个端口由 Docker 随机分配，不使用）。`--email` 是证书到期通知的邮箱，可省略。四个地址在同一个注册域下；共享内容入口照样去掉 Cookie 与认证头，需要把共享内容放到另一个注册域时按 8.2 节手动设置。

邮件可选：`--smtp-host`、`--smtp-from`，需要时加 `--smtp-port`、`--smtp-user`、`--smtp-password`。给出时注册验证邮箱、可找回密码；不给时写入 `CLOUD_KEYCLOAK_VERIFY_EMAIL=false` 与 `CLOUD_KEYCLOAK_PASSWORD_RESET=false`，注册不验证邮箱、没有找回密码，安装结束时说明这一点以及之后在身份域的 `/admin/` 中配置邮件或关闭注册的位置。

其余参数：`--version`（默认最新的 GitHub Release，例如 `1.0.0-rc.130`）、`--dir`（默认 `~/presmium-cloud`）、`--name`（Compose 项目与实例名，默认 `presmium-cloud`）、`--yes`（不提问，须同时给出地址方式；`curl … | bash -s -- --yes --ip`）、`--dry-run`（只下载到临时目录，打印将写入的配置（隐去密钥）、站点与步骤，并让 Compose 检查配置，不改动任何东西）、`--build`、`--source`（用给定的源码压缩包（文件或网址）代替该版本的 GitHub 归档；不加 `--build` 时只取其中的部署文件，镜像仍是 `--version` 的发布版本）、`--registry`（从 `ghcr.io/lincyaw/` 的镜像站拉取四个 `presmium-cloud-*` 镜像，值是镜像名前缀，例如 `--registry mirror.example.com/lincyaw/`，写入 `CLOUD_IMAGE_REGISTRY`；`upgrade` 也接受）。下载不显示进度条。

安装目录的内容：`.env`（0600，由 `keycloak/init-env.sh` 生成全部随机密钥，地址、镜像与邮件设置之后写入；已有时保留，不覆盖）、`releases/<版本>/`（该版本的部署文件，`--build` 时为完整源码）、`current`（指向运行中的版本）、`install.sh` 与 `backups/`。重复运行是幂等的：沿用已有的 `.env` 与版本，只补齐缺少的步骤并启动。

镜像：默认拉取 `ghcr.io/lincyaw/presmium-cloud-{api,keycloak,hub,studio}:<版本>`（`CLOUD_IMAGE_REGISTRY=ghcr.io/lincyaw/`、`CLOUD_IMAGE_TAG=<版本>`），由 `.github/workflows/cloud-images.yml` 在发布 `v` 开头的 Release 时（也可手动运行）从该标签的源码构建，含 linux/amd64 与 linux/arm64，同时更新 `latest`。`--build` 在本机构建（`CLOUD_IMAGE_REGISTRY` 为空），Studio 镜像约 5 GB。拉取失败时安装程序显示 Docker 的原始错误并给出判断：清单不存在（该版本未发布或镜像站未同步）、没有本机架构的镜像（发布的是 linux/amd64 与 linux/arm64，可改用 `--build`）、限流、拒绝访问，或本机连不上镜像仓库（改用 `--registry` 或为 Docker 配置代理；Docker 用自己的代理设置）。第三方镜像来自 Docker Hub，不受 `--registry` 影响，连不上时在 `/etc/docker/daemon.json` 设 `registry-mirrors`。之后安装程序 `docker compose up -d`，等待 `migrate` 与 `storage-init` 以 0 退出、`api`、`hub`、`keycloak` 健康，检查控制台可访问，然后打印控制台、Studio 与身份管理（`<身份域>/admin/`，账号 `CLOUD_KEYCLOAK_ADMIN`，密码是 `.env` 中的 `CLOUD_KEYCLOAK_ADMIN_PASSWORD`）的地址。第一个作者在控制台注册。

```sh
bash ~/presmium-cloud/install.sh status               # 服务、运行中的 Studio 与用户卷数
bash ~/presmium-cloud/install.sh upgrade [--version V] # 先取新镜像，再按 8.6 节备份，迁移并启动新版本
bash ~/presmium-cloud/install.sh uninstall [--purge]   # 停止；--purge 在输入项目名确认后删除全部卷与配置，保留 backups/
```

### 8.2 手动部署

以下是安装程序所做的事，供自定义部署参考。

```sh
cd deploy/cloud
bash keycloak/init-env.sh   # 生成 0600 的 .env 与全部随机密钥，不覆盖已有文件；可传目标路径
```

保管 `.env` 的加密备份。每个部署用独立的 `CLOUD_COMPOSE_PROJECT` 与 `CLOUD_INSTANCE_ID`；Studio 容器与卷名为 `<实例>-studio-<用户>`、`<实例>-work-<用户>`。

| 用途 | 示例 | 配置 |
|---|---|---|
| 控制台 | `https://app.example.com` | `CLOUD_APP_HOST`、`CLOUD_PUBLIC_URL` |
| 注册登录 | `https://auth.example.com` | `CLOUD_AUTH_HOST`、`CLOUD_AUTH_URL`、`CLOUD_OIDC_ISSUER` |
| 共享内容 | `https://content.example.net` | `CLOUD_CONTENT_HOST`、`CLOUD_CONTENT_URL` |
| Studio | `https://studio.example.net` | `CLOUD_HUB_HOST`、`CLOUD_HUB_URL` |

四个地址互不同源，Caddy 自动申请证书（`CLOUD_ACME_EMAIL` 可空）。只用一个地址时按 8.8 节设置。共享内容入口只转发 `/p/*`，并去掉 Cookie、Authorization 与 Set-Cookie。数据库、对象存储、Hub API 与 Studio 容器不发布宿主端口；Studio 容器只在 `<项目>-studios` 网络上。镜像名为 `${CLOUD_IMAGE_REGISTRY}presmium-cloud-<名字>:${CLOUD_IMAGE_TAG}`。`compose.yaml` 只拉取镜像，拉取失败即报错；在本机从完整源码构建时加 `-f compose.build.yaml`（设 `CLOUD_IMAGE_REGISTRY` 为空），如下。拉取已发布的镜像时设 `CLOUD_IMAGE_REGISTRY=ghcr.io/lincyaw/`，不加该文件，并以 `docker compose --env-file .env -f compose.yaml --profile build-studio pull` 代替两条 `build`。第三方镜像（PostgreSQL、Caddy、Versity S3 Gateway、mailpit 与构建所用的基础镜像）都固定摘要，可匿名拉取。

```sh
docker compose --env-file .env -f compose.yaml -f compose.build.yaml config --quiet
docker compose --env-file .env -f compose.yaml -f compose.build.yaml build
docker compose --env-file .env -f compose.yaml -f compose.build.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps
```

`studio-image` 约 5 GB，含工具链、Chromium 与预打包的官方查看器（经 `PRESMIUM_VIEWER_SEED` 作为只读缓存）。`migrate` 与 `storage-init` 以 Exited (0) 结束后控制台启动。

无公网域名时用回环覆盖：在 `.env` 设 `CLOUD_PUBLIC_URL=http://app.localhost:18787`、`CLOUD_AUTH_URL=http://auth.localhost:18787`、`CLOUD_CONTENT_URL=http://content.localhost:18787`、`CLOUD_HUB_URL=http://hub.localhost:18787`、`CLOUD_OIDC_ISSUER=http://auth.localhost:18787/realms/presmium`，以上命令都加 `-f compose.loopback.yaml`，再 `ssh -N -L 18787:127.0.0.1:18787 <服务器>`，打开 `http://app.localhost:18787`。只发布 `127.0.0.1:18787`（`CLOUD_LOOPBACK_PORT`），注册不验证邮箱，邮件由只在身份网络内的 mailpit 接收。

### 8.3 注册、登录与身份

realm `presmium` 启用注册、邮箱登录、密码恢复与暴力尝试限制，客户端为 `presmium-cloud`（控制台，PKCE）与 `presmium-hub`。公网部署验证邮箱：首次启动前填 `CLOUD_SMTP_*`；没有邮件服务时把 `CLOUD_KEYCLOAK_VERIFY_EMAIL` 与 `CLOUD_KEYCLOAK_PASSWORD_RESET` 设为 `false`（注册不验证、不能找回密码），`CLOUD_SMTP_FROM` 为空时用不会发出的占位地址，以便 realm 导入。realm 只在不存在时导入，之后的修改在身份域的 `/admin/` 中进行（`CLOUD_KEYCLOAK_ADMIN`、`CLOUD_KEYCLOAK_ADMIN_PASSWORD`）。登录主题由 `deploy/cloud/keycloak/build-theme.mjs` 打包。

### 8.4 Studio 资源与 AI

`CLOUD_STUDIO_MEMORY`、`CLOUD_STUDIO_CPUS`、`CLOUD_STUDIO_PIDS`、`CLOUD_STUDIO_IDLE_SECONDS`（默认 4G、2、2048、1800）是每个 Studio 的规格；其余加固在 `deploy/cloud/hub/jupyterhub_config.py`。修改后重建并重启 `hub`，运行中的 Studio 下次启动时采用。Studio 容器可访问互联网，以连接作者的模型服务。

### 8.5 管理、日志与排障

```sh
docker compose --env-file .env -f compose.yaml logs --tail=100 api hub keycloak storage-init migrate
docker ps --filter "name=${CLOUD_INSTANCE_ID:-presmium-cloud}-studio-" --format '{{.Names}} {{.Status}}'
```

JupyterHub 管理界面在 Studio 地址的 `/hub/admin`（单一地址时为 `/studio/hub/admin`），管理员在 `jupyterhub_config.py` 的 `c.Authenticator.admin_users` 中设置（值为 Keycloak 账号 ID）。Studio 的完整日志在用户卷的 `state/presmium/studio/`。日志中不应出现访问令牌或 API Key。

### 8.6 备份与恢复

备份应用数据库、身份数据库、对象存储卷 `object-data`、`hub-data`、全部 `<实例>-work-*` 卷、`.env` 与 Caddy 证书卷。先在 `/hub/admin` 停止全部服务器，再：

```sh
umask 077; cloud_project=presmium-cloud; cloud_instance=presmium-cloud; mkdir -p backups
docker compose --env-file .env -f compose.yaml stop entrance api hub keycloak object-store
docker compose --env-file .env -f compose.yaml exec -T database pg_dump -U presmium -d presmium -Fc > backups/presmium.dump
docker compose --env-file .env -f compose.yaml exec -T identity-database pg_dump -U keycloak -d keycloak -Fc > backups/keycloak.dump
backup_helper=busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e
for volume in "${cloud_project}_object-data" "${cloud_project}_hub-data" "${cloud_project}_entrance-data" "${cloud_project}_entrance-config" $(docker volume ls -q --filter "name=^${cloud_instance}-work-"); do
  docker run --rm --network none --read-only -v "$volume:/data:ro" -v "$PWD/backups:/backup" "$backup_helper" tar -C /data -cf "/backup/$volume.tar" .
done
cp .env backups/deployment.env
docker compose --env-file .env -f compose.yaml up -d
```

恢复在空的 Docker 节点上，沿用原 Compose 项目名与 `CLOUD_INSTANCE_ID`：恢复 `.env`，`docker compose … create`，只启动两个数据库并 `pg_restore --exit-on-error`，按卷名创建并解包每个卷，最后 `up -d`。每步成功后再执行下一步。

### 8.7 升级

`install.sh upgrade` 按下面的顺序完成升级：取新版本的部署文件与镜像，停止运行中的 Studio 并按 8.6 节备份到 `backups/<时间>/`（含 `images.txt` 记录的版本与镜像），把 `CLOUD_IMAGE_TAG` 换为新版本，迁移并启动。手动升级时先做可恢复的备份，记录源码提交与镜像摘要，再把 `CLOUD_IMAGE_TAG` 换为新标签：

```sh
docker compose --env-file .env -f compose.yaml -f compose.build.yaml build
docker compose --env-file .env -f compose.yaml -f compose.build.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml run --rm migrate
docker compose --env-file .env -f compose.yaml up -d
```

运行中的 Studio 继续用旧镜像，下次启动时换新。不修改已执行的迁移文件。停止但保留数据用 `docker compose … down`，不加删除卷的参数，不清理整个 Docker 主机。

1.0.0-rc.129 及更早的版本用 MinIO 存放共享（卷 `<项目>_objects`），MinIO 已不再发布镜像。安装程序在服务启动后，若旧卷还在且本机仍有当时的 MinIO 镜像，就临时以它读出旧卷，用 `rclone/rclone` 把桶中的对象复制到新的对象存储，并在 `.env` 记下 `CLOUD_LEGACY_OBJECTS_COPIED=1`；旧卷保留，确认共享能打开后由运营者 `docker volume rm` 删除。本机没有 MinIO 镜像时无法复制：安装程序给出警告，这些共享对读者显示为不存在，作者重新共享即可。旧版的 `install.sh upgrade` 不做这一步，所以从这些版本升级时用新版安装程序（`curl -fsSL …/install.sh | bash -s -- upgrade`），或升级后再运行一次 `bash ~/presmium-cloud/install.sh`；`status` 在旧卷尚未复制时提示。

### 8.8 单一地址

没有域名时，整个云端可以在一个地址下（`install.sh --ip` 的做法）：

| 路径 | 服务 | 配置 |
|---|---|---|
| `https://<地址>/` | 控制台 | `CLOUD_PUBLIC_URL=https://<地址>` |
| `https://<地址>/auth/` | Keycloak | `CLOUD_AUTH_URL=https://<地址>/auth`、`CLOUD_OIDC_ISSUER=https://<地址>/auth/realms/presmium` |
| `https://<地址>/studio/` | JupyterHub（基础路径 `/studio/`），含 `/studio/user/<名字>/studio/` 与 `preview/` | `CLOUD_HUB_URL=https://<地址>/studio` |
| `https://<地址>/p/` | 共享内容 | `CLOUD_CONTENT_URL=https://<地址>` |

另设 `CLOUD_CADDYFILE=Caddyfile.path`、`CLOUD_SITE_ADDRESS=https://<地址>`（或 `http://<地址>`）、`CLOUD_TLS`（`acme`：Let's Encrypt 的 IP 证书，申请不到时 Caddy 自己的 CA；`internal`：只用 Caddy 自己的 CA；`off`：明文 HTTP），四个 `CLOUD_*_HOST` 都是该地址。控制台要求三个地址要么互不同源，要么同源（此时 Hub 在一个路径下）。Keycloak 仍在根路径运行，Caddy 去掉 `/auth` 前缀，`KC_HOSTNAME` 带路径，所以 Keycloak 镜像不变；JupyterHub 的 `base_url`、默认地址、健康检查与 Studio 容器访问 Hub 代理的地址都取自 `CLOUD_HUB_URL` 的路径。IP 地址没有 SNI，Caddy 以 `default_sni` 选择证书。明文 HTTP 另设 `CLOUD_ALLOW_INSECURE_HTTP=true` 与 `CLOUD_KEYCLOAK_SSL_REQUIRED=none`（realm 导入前）；浏览器把明文页面视为不安全的上下文，麦克风录音、剪贴板等功能不可用，密码与会话以明文传输。

四个主机名原本用于隔离来源。单一地址下的隔离：

- 共享内容是作者的 HTML 与脚本。控制台以 `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads`（没有 `allow-same-origin`）返回 `/p/` 下的每个响应，页面以不透明来源运行：读不到本来源的 cookie 与存储，向控制台、Studio 与 Keycloak 的请求是跨来源请求，不带凭据，也读不到响应。它自己的文件因此也是跨来源资源，所以 `/p/` 的响应带 `Access-Control-Allow-Origin: *`（共享本来公开）。沙箱中没有 service worker 与本地存储，共享网站因此没有离线访问，也不记住读者的外观选择。Caddy 照旧去掉 `/p/` 请求的 Cookie 与 Authorization 以及响应的 Set-Cookie；控制台的共享页嵌入它时不给 `allow-same-origin`。
- cookie：控制台的会话 cookie（`__Host-pm-session`，`SameSite=Lax`）只在控制台使用，Caddy 在转发给 Keycloak 与 JupyterHub 前把它从请求中去掉；Keycloak 的 cookie 在 `/auth/realms/presmium/` 路径下，JupyterHub 的在 `/studio/` 之下（`/studio/hub/`、`/studio/user/<名字>/`）；DeepSeek Harness 的会话 cookie 按主机与端口命名，以各用户的 Studio 密钥签名。
- 控制台的修改接口照旧要求 `Origin` 等于控制台的来源并带 CSRF 令牌；与 Studio 同源后，`/presmium` 的同源跳转页仍然保留。Studio 与预览之间的 `postMessage` 只接受预览地址的来源，与原来相同。控制台访问 Hub 用服务令牌，不经浏览器。
- 与四个主机名相比，作者自己 Studio 预览中的文稿代码与控制台同源，可以以作者身份调用控制台接口（创建访问令牌、共享）；这与它本来就能以作者身份调用 Studio 是同一个信任边界，仍然只复制信任的文稿。
