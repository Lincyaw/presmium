# 部署 Presmium 云服务

本说明对应 [云端 RFC](rfc-cloud.md) 与 `deploy/cloud/compose.yaml`。云服务使用 Postgres 保存账号关联、空间、文稿、版本、任务与计量记录；Keycloak 负责注册和登录；S3 兼容存储保存素材与产物。可信执行代理与独立看门狗连接 Docker，编译、导出和交互环境在无 Docker 凭据的任务容器中运行。实现与验证状态见 `packages/cloud/project-index.yaml`。

## 1. 准备独立部署

准备 Linux、Docker Engine、Docker Compose 2.24.4 或更新版本、Python 3、libseccomp、xfsprogs、util-linux，以及仓库源码。原生配额安全探针支持 x86_64 与 aarch64。不需要在宿主机安装 Node.js 或 pnpm。构建镜像时使用锁定的依赖；部署文件固定基础镜像的版本和摘要。

从仓库根目录进入部署目录并生成配置：

```sh
cd deploy/cloud
bash keycloak/init-env.sh
```

脚本创建权限为 `0600` 的 `.env`，为两个数据库、Keycloak 初始管理员、OIDC 客户端、执行代理、运行凭据加密与对象存储分别生成随机密钥。脚本拒绝覆盖已有文件。保管 `.env` 的加密备份；`CLOUD_CREDENTIAL_KEY` 丢失后，数据库中加密的运行环境凭据不能解密。

每个部署使用独立的 `CLOUD_COMPOSE_PROJECT` 和 `CLOUD_INSTANCE_ID`。Compose 只管理本项目的容器、网络和卷；不要把既有服务的数据库卷或对象存储卷填入本部署。默认入口占用 TCP 80、443 与 UDP 443，其余服务不发布宿主端口。

启动执行服务前，在一个不存在的新目录创建配额池。下面命令在仓库根目录运行，只新建本项目的稀疏镜像及独立 XFS 挂载，不格式化宿主已有分区：

```sh
sudo bash deploy/cloud/storage/provision.sh /data/presmium-cloud-storage presmium-cloud
```

默认是 36 GiB 文件系统、32 个 1 GiB slot 与每 slot 65536 个 inode；脚本逐 slot 在固定 seccomp 策略下实际验证块与 inode 配额、项目编号与继承属性不可绕过，并拒绝覆盖已有目录。详细行为见 [执行磁盘池说明](../deploy/cloud/storage/README.md)。将 `.env` 的 `CLOUD_RUNTIME_STORAGE_HOST` 设为输出的 `/data/presmium-cloud-storage/mount`，实例参数必须与 `CLOUD_INSTANCE_ID` 相同。只有真实项目配额、匹配的策略摘要和只读验证清单均通过，执行代理才会启动。

## 2. 选择访问入口

### 公网 HTTPS

将四个域名的 DNS 指向服务器，并编辑 `.env` 中的对应值：

| 用途 | 地址示例 | 配置 |
| --- | --- | --- |
| 作者控制台 | `https://app.example.com` | `CLOUD_APP_HOST`、`CLOUD_PUBLIC_URL` |
| 注册登录 | `https://auth.example.com` | `CLOUD_AUTH_HOST`、`CLOUD_AUTH_URL`、`CLOUD_OIDC_ISSUER` |
| 用户内容 | `https://content.example.net` | `CLOUD_CONTENT_HOST`、`CLOUD_CONTENT_URL` |
| 交互环境 | `https://runtime.example.net` | `CLOUD_RUNTIME_HOST`、`CLOUD_RUNTIME_URL` |

`CLOUD_APP_HOST` 等四个入口值只写域名；URL 字段写完整 HTTPS 地址。`CLOUD_OIDC_ISSUER` 在登录域后加 `/realms/presmium`。URL 不带末尾斜线。填写 `CLOUD_ACME_EMAIL`，Caddy 通过 ACME 申请并续期证书。

控制台、内容与交互环境使用互不相同的来源。内容域只转发私有预览 `/v/*` 和公开发布 `/p/*`，其余路径返回 404；入口删除内容请求中的 Cookie、Authorization 及响应中的 Set-Cookie。运行域只转发 `/runtime/*`，作者先通过控制台授权，再用短时单次票据换取环境专属 cookie，Jupyter 不获得作者账号 cookie。数据库、对象存储管理端、执行代理和 Jupyter 不直接发布公网端口。

后续命令均在 `deploy/cloud` 中运行：

```sh
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-runtime build runtime-image
docker pull quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps
```

`migrate` 正常退出后，`storage-init` 创建或检查私有存储桶，随后 API 启动。`migrate` 与 `storage-init` 的完成状态为 Exited (0)，长期服务应为运行中，带健康检查的服务应为 healthy。

### SSH 下的本机 HTTP 验证

没有公网域名时使用显式的 loopback 覆盖文件。它只发布 `127.0.0.1:18787`，启用本机 HTTP，注册时关闭邮件验证；这套配置用于真实服务验证。不要将它改成公网监听。

```sh
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml config --quiet
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml build
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml --profile build-runtime build runtime-image
docker pull quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml up -d
```

在本机建立转发，把 `team` 换成 SSH 配置中的服务器名：

```sh
ssh -N -L 18787:127.0.0.1:18787 team
```

浏览器打开 `http://app.localhost:18787`。登录跳到 `http://auth.localhost:18787`，内容使用 `http://content.localhost:18787`，交互环境使用 `http://runtime.localhost:18787`。浏览器应将这些 `.localhost` 域名解析到本机；使用不具备此行为的浏览器时，在本机 hosts 中为这四个域名指定 `127.0.0.1`。如端口冲突，修改 `CLOUD_LOOPBACK_PORT` 并同时调整 SSH 转发。

首次创建 realm 后才读取邮件验证、回调地址和客户端密钥。把已有的本机验证部署改成公网部署时，在 Keycloak 管理界面修改这些设置；更稳妥的做法是用新的 Compose 项目与独立数据卷重新建立公网实例，再按备份恢复流程迁移需要的数据。

## 3. 注册、邮件与身份接入

默认 Keycloak realm 为 `presmium`，启用注册、邮箱登录、密码恢复、暴力尝试限制与 PKCE，关闭密码直传授权。控制台的注册按钮通过 OIDC `prompt=create` 打开真实注册表单；Presmium 不保存密码。官方行为见 [Keycloak 注册说明](https://www.keycloak.org/docs/latest/server_admin/index.html#_user-registration)。

公网部署默认验证邮箱。首次启动前填写 `.env` 中的 `CLOUD_SMTP_HOST`、有效的 `CLOUD_SMTP_FROM` 邮箱、认证及 TLS 设置；空的 From 会使 realm 导入失败。loopback 覆盖文件提供验证用 From，并关闭邮件验证。使用 `CLOUD_KEYCLOAK_ADMIN` 与生成的 `CLOUD_KEYCLOAK_ADMIN_PASSWORD` 登录身份域的 `/admin/`，检查 `presmium` realm 的邮件与登录设置。保管管理员凭据，不将它们写进文稿或分发给作者。

realm 导入只在该 realm 不存在时执行，重启不会覆盖已有用户和设置。[Keycloak 导入说明](https://www.keycloak.org/server/importExport) 描述了环境变量替换与已有 realm 的跳过规则。之后修改客户端密钥、SMTP、邮件验证或重定向地址，需要在管理界面更新运行中的 realm；只改 `.env` 不会修改数据库里的 realm。

身份页使用随镜像打包的 `presmium` 登录主题，继承 Keycloak 官方 `base` 模板。字体、品牌、控件与明暗颜色来自 `@lincyaw/design`，构建入口为 `deploy/cloud/keycloak/build-theme.mjs`；修改公共设计后重新构建 `keycloak` 镜像。CSS、脚本和字体文件名带内容指纹，普通刷新即可加载更新，不需要清除身份服务缓存。新部署由 realm 文件设置 `loginTheme`。已有部署需在管理界面的 Realm settings → Themes 将 Login theme 设为 `presmium` 并保存；不要重新导入 realm。通过 Admin REST 更新时只发送 `{"loginTheme":"presmium"}`，避免用不完整的 `attributes` 覆盖已有配置。主题行为见 [Keycloak 主题说明](https://www.keycloak.org/ui-customization/themes)。

云端顶栏的语言、明暗和账号操作使用公共图标按钮与菜单；菜单保留读屏名称、键盘导航和当前语言标记。进入登录或注册时，只将白名单语言通过 `ui_locales`、明暗偏好通过主题读取的 `ui_theme` 传给身份页；登录、注册、找回密码仍由官方表单处理。

接外部 OIDC 提供方时，替换 `CLOUD_OIDC_ISSUER`、client ID、client secret、audience，并将 `.env` 中 `CLOUD_OIDC_ISSUER_INTERNAL_URL` 清空或改成该提供方的明确内部 issuer 地址。API 仍验证公开 issuer 和 audience，内部地址只改变服务端网络路径。提供方需支持 authorization code、PKCE、state、nonce 和 ID token；API bearer 使用访问令牌，不能拿 ID token 替代。

浏览器会话保存于 Postgres，退出后立即撤销。外部 MCP 使用空间内创建的可撤销访问令牌；服务端只保存其哈希。OAuth 资源元数据在 `/.well-known/oauth-protected-resource`，具体客户端的一键授权需要其真实客户端注册与授权配置，不能以这个元数据文档代替。

## 4. 免费功能与 AI 服务状态

编辑、预览、放映、导出、学生版发布、MCP 基础操作和 Jupyter 代码环境均免费。存储、并发与运行时长仍受部署配置限制；它们不是支付项目，零预算不应阻止使用。控制台区分实际资源存储与环境预留容量，并在独立历史区保留原计量和费用返还，不将历史编译费用当作 AI 消费。

此版本尚未接入云端 AI，因此 `/api/me` 的 AI capability 为 false。即使填写 `CLOUD_STRIPE_SECRET_KEY`、`CLOUD_STRIPE_WEBHOOK_SECRET` 或旧 Pro/Team price 配置，BillingService 仍禁用购买、门户与 webhook，不能销售无对应 AI 功能的商品。请保持这些可选配置为空。现有 Stripe 适配代码是后续真实 AI 产品的基础，不能用配置密钥代替商品和服务实现；本轮不执行真实支付。

作者可通过 MCP 连接已有的 AI 助手。模型费用由作者与所选模型供应商结算。未来接入云端 AI 时，应另行定义商品、价格、用量规则及 sandbox 验收，再启用支付。

## 5. 执行镜像与环境

`profiles.json` 是运营者维护的免费执行目录，价格必须为 0。默认提供 `compile`、`export` 和 `jupyter-python`，分别限制 CPU、内存、进程数、磁盘、最长运行时间、输入输出大小。磁盘请求必须与池中 slot 的硬限额一致，池耗尽时明确拒绝。修改后重新创建 API 和执行代理，使两者读取同一份目录：

```sh
docker compose --env-file .env -f compose.yaml up -d --no-deps --force-recreate api runner
```

`presmium-cloud-runtime:0.1.0` 在部署前构建；其中工具链和插件随镜像安装，任务容器默认无网络，不能临时安装网络依赖。Jupyter 使用固定镜像，每个成员的环境独立，文件保存在其固定项目配额 slot 中，内核内存随停止消失。到期、空闲或撤销权限后由执行代理回收运行实例。

`runner` 与独立 `watchdog` 挂载 Docker socket，API 与租户容器都不挂载。所有租户容器删除全部 Linux capabilities，并使用 no-new-privileges 与 [固定 seccomp 策略](../packages/cloud/seccomp/README.md)：保留官方 Moby 默认系统调用白名单，只收紧能够修改项目编号及继承的 ioctl。镜像和策略必须与配额池验证摘要一致，不能用 unconfined 替代。

watchdog 没有账号、数据库或付款密钥，每 5 秒用不可变时限标签和真实 StartedAt 核对容器；超时从容器外强制停止，即使用户代码暂停了容器内监督进程也适用。runner 通过固定容器名自动加入本实例的私有环境网络；不要在同一个 Compose 项目中复制 runner 副本。需要多个执行节点时，为各节点配置独立实例和受认证的代理入口，不向公网开放 Docker API。生产执行节点应按 RFC 与控制面分开部署，使用受信任的私网或双向 TLS。

主机重启后必须先恢复项目配额挂载，再启动 Compose。只剩普通目录时，执行代理会拒绝启动，不会退回无配额卷：

```sh
sudo bash storage/mount.sh /data/presmium-cloud-storage
docker compose --env-file .env -f compose.yaml up -d
```

首次验证依次完成：创建文稿并保存；编译并打开相同源版本的预览；导出一份文件；启动 Python 环境执行表达式和保留变量的后续代码；停止后确认容器停止，重新启动后确认文件仍在；撤销另一成员的权限并检查其新请求与环境连接被拒绝。分别记录成功、失败与未验证项。

## 6. 健康、日志与排障

入口、API、执行代理和身份服务的日志不应包含访问令牌、数据库密码或付款密钥。查看本项目的服务状态与有限日志：

```sh
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail=100 api runner watchdog keycloak storage-init migrate
docker compose --env-file .env -f compose.yaml exec -T api node --input-type=module -e "const r = await fetch('http://127.0.0.1:8787/ready'); console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1)"
docker compose --env-file .env -f compose.yaml exec -T runner node --input-type=module -e "const r = await fetch('http://127.0.0.1:8788/ready'); console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1)"
```

API 和执行代理的 `/health` 表示进程能够应答，`/ready` 检查其真实依赖。Keycloak 使用内部管理端口 9000 的 readiness 检查。身份服务未就绪时先查看其数据库和 realm 导入错误；存储初始化失败时检查 S3 地址、凭据与 bucket 权限；任务无法启动时检查 profile 指定镜像是否已在执行节点构建或拉取，以及代理的 Docker 连接。

`billing_events` 的 `failed` 或长时间 `processing` 表示需要查看支付对账；消费状态未知时保留预占，核对供应商结果后处理，不能通过手工删除记录来重复收费。运行任务与环境有数据库租约和实例标签，恢复时按本实例对账，不清理其他产品的容器、网络或卷。

## 7. 备份与恢复

备份包含应用数据库、身份数据库、对象存储、完整 XFS 磁盘池、`.env` 和 Caddy 证书卷。磁盘池的镜像包含项目配额、slot、用户文件与只读 `pool.json`，外围所有权标记也必须保留。应用数据库中的 `cloud_runtime_storage_*` 分配表与该镜像属于同一份备份。仅备份文稿 JSON 无法恢复成员、付款关联、预算和运行凭据；Keycloak realm 导出也不能替代身份数据库备份。

在维护窗口先通过控制台停止交互环境并等待任务结束。用本部署的实例标签检查 `docker ps`，确认没有活跃任务容器后再继续。下面的 `cloud_project`、`cloud_instance` 和 `pool_dir` 必须与 `.env` 一致，其中 `CLOUD_RUNTIME_STORAGE_HOST` 应为 `$pool_dir/mount`。备份期间控制台和运行环境不可用：

```sh
umask 077
cloud_project=presmium-cloud
cloud_instance=presmium-cloud
pool_dir=/data/presmium-cloud-storage
docker ps --filter "label=io.presmium.cloud.instance=$cloud_instance" --format '{{.Names}}'
```

上一条检查应无输出。随后停止写入者并导出数据库：

```sh
mkdir -p backups/runtime-pool
docker compose --env-file .env -f compose.yaml stop entrance api runner watchdog keycloak object-store
docker compose --env-file .env -f compose.yaml exec -T database pg_dump -U presmium -d presmium -Fc > backups/presmium.dump
docker compose --env-file .env -f compose.yaml exec -T identity-database pg_dump -U keycloak -d keycloak -Fc > backups/keycloak.dump
sudo umount "$pool_dir/mount"
sudo cp -a --sparse=always "$pool_dir/filesystem.img" "$pool_dir/.presmium-runtime-storage.json" "$pool_dir/quota-probes.jsonl" backups/runtime-pool/
backup_helper=busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e
(
  set -eu
  for volume in "${cloud_project}_objects" "${cloud_project}_entrance-data" "${cloud_project}_entrance-config"; do
    docker volume inspect "$volume" >/dev/null
    docker run --rm --network none --read-only -v "$volume:/data:ro" -v "$PWD/backups:/backup" "$backup_helper" tar -C /data -cf "/backup/$volume.tar" .
  done
  cp .env backups/deployment.env
)
```

核对三个服务卷均有对应 `.tar`、两个 dump 非空，并检查 `runtime-pool` 的镜像、所有权标记与验证记录。将整个目录交给保留稀疏文件及权限的加密备份存储。不要只把 slot 普通打包后丢弃 XFS 项目属性和 quota 设置。确认文件完整后重新挂载并启动服务：

```sh
sudo bash storage/mount.sh "$pool_dir"
docker compose --env-file .env -f compose.yaml up -d
```

恢复在空的独立 Docker 节点进行，沿用备份里的 Compose 项目名、`CLOUD_INSTANCE_ID` 和磁盘池绝对路径。先准备匹配版本的源码和镜像，并把备份目录放在 `deploy/cloud/backups`。先恢复 `.env` 与完整磁盘池并验证，再创建服务卷和容器；只启动两个数据库，其他写入者保持未启动：

```sh
cp backups/deployment.env .env
chmod 600 .env
pool_dir=/data/presmium-cloud-storage
test ! -e "$pool_dir"
sudo mkdir -m 0700 "$pool_dir"
sudo cp -a --sparse=always backups/runtime-pool/filesystem.img backups/runtime-pool/.presmium-runtime-storage.json backups/runtime-pool/quota-probes.jsonl "$pool_dir/"
sudo mkdir -m 0755 "$pool_dir/mount"
sudo bash storage/mount.sh "$pool_dir"
docker compose --env-file .env -f compose.yaml create
docker compose --env-file .env -f compose.yaml up -d --wait database identity-database
docker compose --env-file .env -f compose.yaml exec -T database pg_restore -U presmium -d presmium --exit-on-error < backups/presmium.dump
docker compose --env-file .env -f compose.yaml exec -T identity-database pg_restore -U keycloak -d keycloak --exit-on-error < backups/keycloak.dump
cloud_project=presmium-cloud
backup_helper=busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e
(
  set -eu
  for volume in "${cloud_project}_objects" "${cloud_project}_entrance-data" "${cloud_project}_entrance-config"; do
    docker volume inspect "$volume" >/dev/null
    docker run --rm --network none --read-only -v "$volume:/data" -v "$PWD/backups:/backup:ro" "$backup_helper" tar -C /data -xf "/backup/$volume.tar"
  done
)
docker compose --env-file .env -f compose.yaml up -d
```

每条恢复命令成功后才执行下一条。恢复后核对文稿版本、对象散列、成员权限、订阅状态、预算及 slot 分配，再对账运行任务。旧版 `pm-*-home-*` 普通 Docker volume 不能作为新磁盘池恢复，也不能让执行器退回该路径；历史文件迁移必须进入已验证并已分配的 quota slot。文件恢复不等于内核变量恢复，停止过的内核从新进程开始。保留原实例 ID 的恢复副本不能与原实例在同一 Docker 节点同时运行。

## 8. 升级与回滚

升级前完成可恢复备份，记录源码提交、镜像摘要与迁移版本。拉取目标源码后构建新版本，并将 `CLOUD_IMAGE_TAG` 换为本次独立标签。停止 API 和执行代理的准入，等待或停止正在运行的任务，再执行迁移与重新创建：

```sh
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml stop api runner
docker compose --env-file .env -f compose.yaml run --rm migrate
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps
```

检查健康、注册登录、保存冲突、编译、执行、授权拒绝与账单对账。应用镜像可以切回上一标签；数据库已发生不兼容迁移时，先恢复升级前数据库、对应对象快照与 XFS 池，再运行匹配策略版本的旧镜像。不要修改已经执行过的迁移文件；迁移摘要不一致会使启动失败。

停止本部署但保留数据使用 `docker compose ... down`，不要加删除卷参数。只停止当前项目，不能用清理整个 Docker 主机的命令代替升级或回滚。
