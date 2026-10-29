# 云服务实施与真实验证记录

日期：2026-10-29。本次实现范围的真实验收已完成；需求见 `packages/cloud/project-index.yaml`。没有新增测试文件，没有运行测试套件，以下均为真实服务、公开协议和浏览器消费。

## 部署环境

- 授权服务器 `ssh team`，Linux x86_64、Docker 29.7.2、Compose 5.4.0。主仓库已 `git pull --ff-only`；未提交源码通过独立快照部署于 `/data/projects/ops/workspace/presmium/.presmium/cloud-verification/source`。
- Compose 项目 `presmium-cloud-verification`，未改动既有 cgfs 容器、数据、卷或端口。十个服务中仅入口发布 `127.0.0.1:18787`，通过 SSH 转发使用四个独立来源。API、runner、watchdog 实际只读根；API/runner 真实 `/ready` 成功。
- 执行镜像 `sha256:6de8ae4993790e9f2ad5d17331caffa651e35278dda4332f4e0d028e155e9307`。Jupyter 镜像摘要 `3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a`。API、runner 与 watchdog 最终统一使用控制镜像 `sha256:9b57c88881f2b516f99a009ed805d4f26d8acf76f706ac6d33e417f787b682d0`。

## 账号、文稿与 MCP

- 浏览器真实 Keycloak 自注册、OIDC 回跳、个人空间和文稿创建成功。第二个独立账户先因邮箱未验证收到邀请入口 403；运营者只通过真实 Keycloak Admin API 验证本次测试账号，再重新 OIDC 登录。没有修改应用身份数据库或伪造会话。
- reader 接受邀请 200、读取 200、保存 403，界面 editableFields=0。editor 接受邀请后原生键盘保存 200。移除后文稿、既有私有内容与已消费邀请重放均 404，无重新赋权。
- 原生编辑、重新加载和历史恢复成功。PNG 拖放导入、canonical 保存、素材读取、img.complete 与 naturalWidth 均通过实际浏览器；文稿继续只有 TeachingDocument 一个正文模型。
- 真实 PostgreSQL 18.4 消费者验证 plan/apply、JSONB 往返、服务重建后持久幂等回执、跨空间 404；相同基础版本的并发 CAS 只有一个成功。
- 实际生成 120 个版本，按 17 项游标遍历无重复，新版本不混入固定快照，跨文稿游标拒绝。免费空间超期历史拒绝、当前 head 可读；付费历史规则用手动设置的验证权益检查，不代表支付联调。恢复连同工程文件创建新版本。
- Linux 官方 MCP SDK 真实 HTTP 消费通过：工具发现与 PAT scope、读和报价不预占、语义编辑、编译与重放、只读 PAT 按 257 字节分块重组产物核 SHA、环境生命周期及销毁重放、撤销 PAT 后拒绝。执行与花费分别授权。

## 编译、发布与账本

专用执行空间 `684e2701-3512-47d3-a613-24faf49dc54a` 的实际结果如下。金额为本次执行配置的整数最小货币单位，消费包含额度，没有真实付款。

| 操作 | 实际结果 | 预占 / 实际消费 |
| --- | --- | --- |
| 作者版网页 | 267 个产物、约 10.65 MB，逐对象核 SHA | 5 / 1 |
| PDF | 19,456 字节，真实 %PDF 文件 | 30 / 2 |
| 学生版网页 | 全部产物扫描不含教师专属标记 | 5 / 1 |
| 排队取消 | cancelled、settled，余额释放 | 5 / 0 |

同一报价及请求重放返回同一 job ID，reservation 只有一条。另以真实 PG 验证：预占 70 后第二笔 50 被 100 上限拒绝；实际结算 40 可重复提交，reserved=0；外层事务回滚不留孤立 reservation。

作者版任务可打开原生放映，iframe 握手 ready，学生与教师内容均显示；直接公开发布该任务返回 409。学生版使用真实 Compiler audience=student 和全产物扫描，canonical 字节、指纹保持原始绑定；教师文本、块 ID 和图片均不进入学生产物。

UI 发布后无登录浏览器可读学生页与真实字体，教师图片不可达，IR.meta.audience=student；撤回后同 HTML 与字体路径均 404。私有 PNG 可显示，撤销能力后同 PNG 与 HTML 均 404。显示结论使用浏览器验证过的 126 字节 PNG；消费者最初的无效 CRC 图片只用于签名、编译和账本消费，不作为显示成功证据。

## Jupyter 与隔离

- 真实 kernel WebSocket 得到 42、HTML 富输出与 stream；HTTP interrupt 得到 KeyboardInterrupt；终端执行真实命令。停止再启动后文件一致，每轮真实结算，内核内存按停止语义消失。
- 容器内与 Docker inspect 双向核对：UID 1000、memory.max=1 GiB、cpu.max=100000 100000、pids=128、只读根、capDrop ALL、no-new-privileges、无 Docker socket、无 CLOUD/AWS/Stripe 平台密钥、私有网络且外网不可达。
- 专属稀疏 XFS 池 32 个 1 GiB / 65,536 inode 槽逐个执行真实配额探针。实际 Docker 容器同样核对项目编号与硬限额，超过 1 GiB 写入得到 ENOSPC。未修改现有 /data ext4 分区或已有挂载选项。
- 固定 seccomp SHA-256 为 `1056b00d0e3a74caec22ecbd3e14ec1e7bc005e7fcb1bc27140e88c47fae1d69`，保留 Docker 默认白名单。正常终端与属性读取 ioctl 可用，改变项目编号/继承的原生、兼容和高位变体均 EPERM。
- 独立 watchdog 在容器内监督进程 SIGSTOP、子进程仍运行时，于 10 秒硬时限后的 11.86 秒强制终止容器，退出 137，探针容器已回收。
- 移除成员后 owner 可见环境元数据并停止、销毁遗留环境，释放卷、私网与槽位；读取他人的私有内核仍 404。
- 浏览器 UI 实际报价并启动环境，跨 runtime 来源票据/cookie 进入 Lab，运行 cell 得到 cloud-ui-kernel 42；作者退出后旧运行授权新请求 401，真实重新登录可重开已保存 Notebook。停止后旧请求 409，永久删除 200。停止时 Lab 记录一条预期连接 409，不将其归为停止前运行故障。重新打开截图仍有初始化覆盖层，仅作为保存输出证据，不用它证明当时内核就绪。
- 实际 force-recreate runner：05:28:12 UTC 旧 WS 关闭，05:28:16 重连；同 kernel、变量、文件、tenant container、generation、reservation 和唯一启动回执均保留，无租户重启、无重复预占。API 独立重建后 canonical 数据与授权也持续存在。

## 恢复、界面与检查

- 应用库 exported snapshot→pg_dump→独立临时库 pg_restore，全表和 sequence 规范化 SHA 一致；Keycloak 身份库同样实际恢复且 SHA 一致，未覆盖活跃库。
- 真实 S3 对象备份后恢复到唯一验证 prefix，SHA 一致。完整 XFS 镜像与全部 543 个数据库引用对象（21,376,295 字节）均恢复至独立副本并核 SHA；源服务在 26.05 秒维护窗口后恢复，既有 cgfs 容器 ID 与启动时刻不变。真实 stopped 环境与 quota allocation 中由 operator fixture 写入的合法 Notebook（1,037 字节，未伪装执行输出）和二进制（16,400 字节）均逐文件核 SHA，恢复库仍为同 owner/space/environment/slot 绑定。最后通过真实 worker 销毁 fixture，活跃/未结算任务、运行预占和已分配槽位均为 0。[恢复回执](cloud-recovery-proof-2026-10-29.json) 不含凭据或正文。
- 亮/暗、1440/700 px 四种组合均实际查看（[亮色桌面](cloud-ui-2026-10-29/light-desktop.png)、[暗色桌面](cloud-ui-2026-10-29/dark-desktop.png)、[亮色窄屏](cloud-ui-2026-10-29/light-narrow.png)、[暗色窄屏](cloud-ui-2026-10-29/dark-narrow.png)），无横向溢出或导航遮挡。未接入的诊断、视频、语音和原生导出入口通过公开宿主能力关闭，不显示永久重连或伪造检查成功。
- 本次 Linux Vite 构建观测为 1.80 至 7.47 秒；管理入口约 471 kB，原生编辑器约 2.33 MB、gzip 704 kB，延迟加载。这些是本次观测值。
- 严格定向 TypeScript（含 erasableSyntaxOnly、noUncheckedIndexedAccess）、分层、技能、令牌、中英文目录、需求索引和 diff 空白检查通过。全仓包发布结构检查暂受并行新增 examples/presmium-site 未列发布表影响，云包本身已登记。

身份/计费、执行和界面作者交叉审查了根控制面与对方边界，最后只读能力和会话生命周期复审通过。最终静态部署的任务下拉只保留预览、学生版公开产物和 PDF，移除未接入的视频选项。已修复 JSONB 指纹、邀请重放、SSE 停机互等、Jupyter CSRF/来源、持久停止时刻与结算、tar 额度、磁盘配额绕过、可暂停的容器内监督、作者稿误公开、读者仍可输入和代理升级后的私网重连。审查结论与真实运行证据分开记录。

## 当前范围

用户明确选择暂不接支付。真实 Stripe Checkout、门户、签名 webhook 适配已实现；未配置 sandbox、未扣款，购买禁用。公网 DNS/TLS 和真实 SMTP 邮件验证未在本次 loopback 部署联调。

AI、配音、转写、视频云生产及文稿代码块到云环境名的绑定尚未接入。交互执行通过 JupyterLab 和 MCP 生命周期工具使用；公开课程为学生版静态产物，不自动为匿名访问启动收费后端。协作用成员共享、事件刷新与版本冲突保护，未实现同段实时文本合并。

本次失败初始化的 v1 磁盘池已按所有权审计清理；v2 因严格权限检查拒绝而保留在验证目录，未注册到 live runtime，未放松检查或修改既有数据。正式使用的 v3 已重新挂载并通过 ready。
