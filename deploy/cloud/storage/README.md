# 配置执行磁盘池

执行节点需要 Linux、Python 3、libseccomp、xfsprogs 和 util-linux。原生安全探针支持 x86_64 与 aarch64。磁盘池使用新建的稀疏文件及独立 XFS 挂载，不格式化宿主已有分区，不修改 `/etc/projects`、`/etc/projid` 或 `/etc/fstab`。

以 root 在一个不存在的新目录中创建磁盘池：

```sh
sudo bash deploy/cloud/storage/provision.sh /data/presmium-cloud-storage presmium-cloud
```

默认建立 36 GiB 文件系统、32 个独立的 1 GiB slot，每个 slot 最多 65536 个 inode。初始化拒绝覆盖已有目录；失败时保留现场，并且不生成可被运行服务接纳的验证清单。修改容量使用命令的显式参数，不能由文稿或作者传入宿主路径。

每个 slot 都加载与租户容器相同的 [seccomp 策略](../../../packages/cloud/seccomp/README.md)，再以 UID 1000 实际执行超额 `posix_fallocate` 与 inode 耗尽探针，只有内核真实拒绝时才记录结果。XFS 项目配额可能返回 `ENOSPC`，验证同时要求整个文件系统仍有足够空间；不会把普通文件系统写满或返回码模拟成配额成功。探针还实际执行允许的读取 ioctl、禁止的设置 ioctl 及其高位变体，检查不能更改项目 ID 或清除继承来逃逸。策略保留 Docker 默认系统调用白名单和默认拒绝，只收紧文件属性修改命令；不能删去它或使用 unconfined。[XFS 项目配额](https://man7.org/linux/man-pages/man8/xfs_quota.8.html) 在目录树内实施空间与 inode 限制。

验证成功后，`mount/pool.json` 为 root-owned、只读清单，包含每个 slot 真实探针与固定 seccomp 策略摘要。执行代理将 `mount` 绑定到自己的 `mountRoot`，把宿主的同一绝对路径作为 `hostRoot`；例如宿主为 `/data/presmium-cloud-storage/mount`，代理内为 `/runtime-pool`。启动时调用 `RuntimeStorage.ready()`，没有真实 XFS、项目配额、匹配策略或有效清单时拒绝启动。

固定 slot 的容量必须与 profile 请求的磁盘字节数一致；池耗尽明确拒绝。交互环境保持相同 slot，以保留文件。短任务须在真实删除容器后调用 `release`；它只清空该 slot 的内容，保留 quota-bearing 根目录，然后原子释放数据库分配。运行代理需要 `DAC_OVERRIDE` 与 `FOWNER` 清理租户设为 `0000` 的目录，这两个能力不授予租户容器。

主机重启后，先挂载并验证已有磁盘池，再启动执行代理：

```sh
sudo bash deploy/cloud/storage/mount.sh /data/presmium-cloud-storage
```

挂载命令核对所有权标记、镜像 UUID 和已有挂载，拒绝覆盖其他文件系统。将此步骤接入执行节点的启动顺序，并在代理停止且没有活动容器时做磁盘池与数据库的一致备份。恢复必须同时保留 `cloud_runtime_storage_*` 分配表、文件系统镜像和实例 ID；不能在仍有容器运行时清空或复用其 slot。

独立 watchdog 仅连接 Docker，按 `io.presmium.cloud.instance` 和不可变的 `io.presmium.cloud.max-duration-seconds` 标签检查真实 `StartedAt`。它不使用账号、数据库或支付凭据，也不在租户 PID/UID 命名空间内；到时通过 Docker 强制停止容器，用户代码不能暂停这个监督进程。
