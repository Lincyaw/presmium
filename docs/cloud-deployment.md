# 部署 Presmium 云端

本说明对应 [云端 RFC](rfc-cloud.md) 与 `deploy/cloud/compose.yaml`。云端为每个注册用户运行一个完整的 Presmium Studio 容器；PostgreSQL 保存账号、空间、Studio 状态、访问令牌与共享记录，Keycloak 负责注册登录，S3 兼容存储保存共享的文稿。实现与验证状态见 `packages/cloud/project-index.yaml`。

本版本不兼容旧版云端（数据库中的文稿、成员与计费）。从旧版迁移时新建 Compose 项目与数据卷，旧数据库不能就地升级。

## 1. 准备

准备 Linux、Docker Engine、Docker Compose 2.24.4 或更新版本、Python 3、libseccomp、xfsprogs、util-linux，以及仓库源码。宿主机不需要 Node.js 或 pnpm。在 `deploy/cloud` 中生成配置：

```sh
cd deploy/cloud
bash keycloak/init-env.sh
```

脚本创建权限为 `0600` 的 `.env`，为两个数据库、Keycloak 管理员、OIDC 客户端、Studio 控制令牌的加密与对象存储分别生成随机密钥，并拒绝覆盖已有文件。保管 `.env` 的加密备份：`CLOUD_CREDENTIAL_KEY` 丢失后，数据库中加密的 Studio 控制令牌不能解密，需要重建全部 Studio 记录。

每个部署使用独立的 `CLOUD_COMPOSE_PROJECT` 与 `CLOUD_INSTANCE_ID`；Compose 与执行代理只管理带本实例标签的容器、网络和卷。

### 磁盘池

每个 Studio 的卷是 XFS 项目配额磁盘池中的一个 slot，slot 的容量必须等于 `studio-profile.json` 的 `diskBytes`（默认 4 GiB）。以 root 在一个不存在的新目录中创建，下例为 16 个 4 GiB 的 slot：

```sh
sudo bash storage/provision.sh /data/presmium-cloud-storage presmium-cloud 16 4294967296 262144 73014444032
```

参数依次为目录、实例 ID、slot 数、每个 slot 的字节数、每个 slot 的 inode 数与文件系统总字节数（必须大于全部 slot 之和）。脚本在每个 slot 上实际验证配额，详见 [磁盘池说明](../deploy/cloud/storage/README.md)。把 `.env` 的 `CLOUD_RUNTIME_STORAGE_HOST` 设为输出的 `/data/presmium-cloud-storage/mount`。没有真实配额与有效清单时执行代理拒绝启动。slot 用尽时新用户的 Studio 无法启动，控制台显示没有可用的存储空间。

### Docker 网络地址

每个 Studio 一个独立的 bridge 网络。Docker 默认的地址池只能容纳约 30 个网络；同时运行的 Studio 较多时，在 `/etc/docker/daemon.json` 中配置更小的子网，例如：

```json
{ "default-address-pools": [{ "base": "10.128.0.0/12", "size": 26 }] }
```

## 2. 域名与入口

| 用途 | 地址示例 | 配置 |
| --- | --- | --- |
| 控制台 | `https://app.example.com` | `CLOUD_APP_HOST`、`CLOUD_PUBLIC_URL` |
| 注册登录 | `https://auth.example.com` | `CLOUD_AUTH_HOST`、`CLOUD_AUTH_URL`、`CLOUD_OIDC_ISSUER` |
| 共享的文稿 | `https://content.example.net` | `CLOUD_CONTENT_HOST`、`CLOUD_CONTENT_URL` |
| 各用户的 Studio | `https://s-<id>.studio.example.net`、`https://p-<id>.studio.example.net` | `CLOUD_STUDIO_HOST`、`CLOUD_STUDIO_URL`（不带 `s-`/`p-` 前缀） |

把 `*.studio.example.net` 的 DNS 指向服务器。Caddy 在每个 Studio 主机第一次被访问时申请证书，申请前询问控制台该主机是否属于一个已有的 Studio；Let’s Encrypt 对同一注册域名有每周的签发上限，用户较多时改用 DNS 验证的通配证书（需要带 DNS 插件的 Caddy）。Studio 域建议使用与控制台不同的注册域名。

控制台、身份、共享内容与 Studio 都是不同的来源。共享内容的入口只转发 `/p/*`，并删除请求中的 Cookie、Authorization 与响应中的 Set-Cookie。数据库、对象存储、执行代理与 Studio 容器都不发布宿主端口。

```sh
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps
```

`studio-image` 包含完整工具链与 Chromium，约 5 GB，所有用户共用。`migrate` 与 `storage-init` 正常退出（Exited (0)）后控制台启动，执行代理在控制台之后启动，因为它要把控制台的容器加入每个 Studio 的网络。

### SSH 下的本机验证

没有公网域名时使用回环覆盖文件：只发布 `127.0.0.1:18787`，使用 HTTP，注册时不验证邮箱。在 `.env` 中设置 `CLOUD_PUBLIC_URL=http://app.localhost:18787`、`CLOUD_AUTH_URL=http://auth.localhost:18787`、`CLOUD_CONTENT_URL=http://content.localhost:18787`、`CLOUD_STUDIO_URL=http://studio.localhost:18787` 与 `CLOUD_OIDC_ISSUER=http://auth.localhost:18787/realms/presmium`。没有磁盘池时可以设置 `CLOUD_STORAGE_UNENFORCED=true`，用 `CLOUD_RUNTIME_STORAGE_HOST` 下的普通目录代替 slot；它没有容量限制，只在回环覆盖文件中被接受。

```sh
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml build
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml -f compose.loopback.yaml up -d
ssh -N -L 18787:127.0.0.1:18787 <服务器>
```

浏览器打开 `http://app.localhost:18787`。Chromium 与 Firefox 把 `*.localhost` 解析到本机；其他浏览器需要在 hosts 中为用到的主机名指定 `127.0.0.1`（每个 Studio 两个）。

## 3. 注册、邮件与身份接入

默认 Keycloak realm 为 `presmium`，启用注册、邮箱登录、密码恢复与暴力尝试限制，使用 PKCE。控制台的注册按钮以 OIDC `prompt=create` 打开注册表单，Presmium 不保存密码。公网部署默认验证邮箱：首次启动前填写 `.env` 中的 `CLOUD_SMTP_*`，空的 From 会使 realm 导入失败。realm 只在不存在时导入，之后修改客户端密钥、SMTP 或回调地址要在 Keycloak 管理界面（身份域的 `/admin/`，凭据为 `CLOUD_KEYCLOAK_ADMIN` 与 `CLOUD_KEYCLOAK_ADMIN_PASSWORD`）中修改。

身份页使用随镜像打包的 `presmium` 登录主题（`deploy/cloud/keycloak/build-theme.mjs`），修改公共设计后重新构建 `keycloak` 镜像。已有部署在 Realm settings → Themes 中把 Login theme 设为 `presmium`，不要重新导入 realm。

接外部 OIDC 提供方时替换 `CLOUD_OIDC_ISSUER`、client ID、client secret、audience，并清空或改写 `CLOUD_OIDC_ISSUER_INTERNAL_URL`。提供方需支持 authorization code、PKCE、state、nonce 与 ID token。

## 4. Studio 的资源与 AI

`studio-profile.json` 是全部 Studio 共用的容器规格：镜像、CPU、内存、磁盘（与 slot 一致）、`/tmp` 大小、进程数、空闲停止时间（默认 30 分钟）与单次运行的最长时间（默认 12 小时，由看门狗强制）。修改后重新创建控制台与执行代理；已运行的 Studio 在下次启动时采用新规格。

Studio 容器使用只读根文件系统、去掉全部 Linux capabilities、no-new-privileges 与 [固定 seccomp 策略](../packages/cloud/seccomp/README.md)。`/tmp` 允许执行，因为 DeepSeek Harness 的原生模块从那里加载。Studio 可以访问互联网，以连接作者自己的模型服务；需要限制出站时在宿主防火墙上为 Studio 网络配置规则。

AI 助手使用作者在 Studio 的“设置 → 模型”中填写的 API Key，保存在作者自己的卷上。云端不提供、也不计费模型用量。

## 5. 健康、日志与排障

```sh
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail=100 api runner watchdog keycloak storage-init migrate
docker ps --filter label=io.presmium.cloud.kind=studio --format '{{.Names}} {{.Status}}'
```

控制台的 `/ready` 检查数据库，执行代理的健康端口 8788 检查 Docker、磁盘池与数据库。Studio 无法启动或意外结束时，执行代理把容器的退出码与最后的日志写进自己的日志；Studio 自己的完整日志在作者卷的 `state/presmium/studio/` 中。日志中不应出现访问令牌、控制令牌或 API Key。

## 6. 备份与恢复

备份包含应用数据库、身份数据库、对象存储卷、完整的 XFS 磁盘池（镜像、所有权标记与验证记录）、`.env` 与 Caddy 证书卷。作者的文稿、git 历史、模型设置与 AI 会话都在磁盘池的 slot 中；数据库中的 `cloud_runtime_storage_*` 分配表与磁盘池必须来自同一时刻。

在维护窗口先停止全部 Studio，确认没有本实例的 Studio 容器，再停止写入者、导出数据库、卸载并复制磁盘池：

```sh
umask 077
cloud_project=presmium-cloud
cloud_instance=presmium-cloud
pool_dir=/data/presmium-cloud-storage
docker exec "${cloud_project}-database-1" psql -U presmium -d presmium -c "UPDATE studios SET desired_state = 'stopped'"
docker ps --filter "label=io.presmium.cloud.instance=$cloud_instance" --format '{{.Names}}'
```

上一条命令在 Studio 全部停止后应无输出。之后：

```sh
mkdir -p backups/runtime-pool
docker compose --env-file .env -f compose.yaml stop entrance api runner watchdog keycloak object-store
docker compose --env-file .env -f compose.yaml exec -T database pg_dump -U presmium -d presmium -Fc > backups/presmium.dump
docker compose --env-file .env -f compose.yaml exec -T identity-database pg_dump -U keycloak -d keycloak -Fc > backups/keycloak.dump
sudo umount "$pool_dir/mount"
sudo cp -a --sparse=always "$pool_dir/filesystem.img" "$pool_dir/.presmium-runtime-storage.json" "$pool_dir/quota-probes.jsonl" backups/runtime-pool/
backup_helper=busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e
for volume in "${cloud_project}_objects" "${cloud_project}_entrance-data" "${cloud_project}_entrance-config"; do
  docker run --rm --network none --read-only -v "$volume:/data:ro" -v "$PWD/backups:/backup" "$backup_helper" tar -C /data -cf "/backup/$volume.tar" .
done
cp .env backups/deployment.env
sudo bash storage/mount.sh "$pool_dir"
docker compose --env-file .env -f compose.yaml up -d
```

恢复在空的 Docker 节点上进行，沿用备份中的 Compose 项目名、`CLOUD_INSTANCE_ID` 与磁盘池的绝对路径：恢复 `.env`，复制磁盘池并用 `storage/mount.sh` 挂载，`docker compose ... create`，只启动两个数据库并用 `pg_restore --exit-on-error` 恢复，再解包三个服务卷，最后 `up -d`。每条命令成功后才执行下一条。保留原实例 ID 的副本不能与原实例在同一 Docker 节点同时运行。

主机重启后先挂载磁盘池，再启动 Compose：

```sh
sudo bash storage/mount.sh /data/presmium-cloud-storage
docker compose --env-file .env -f compose.yaml up -d
```

## 7. 升级与回滚

升级前完成可恢复的备份，记录源码提交与镜像摘要。构建新版本（包括 `studio-image`），把 `CLOUD_IMAGE_TAG` 与 `studio-profile.json` 的镜像换为本次的标签，然后：

```sh
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml stop api runner
docker compose --env-file .env -f compose.yaml run --rm migrate
docker compose --env-file .env -f compose.yaml up -d
```

正在运行的 Studio 继续使用旧镜像，直到停止；下次启动时使用新镜像。不要修改已经执行过的迁移文件。停止部署但保留数据用 `docker compose ... down`，不要加删除卷的参数，也不要用清理整个 Docker 主机的命令。
