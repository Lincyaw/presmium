# 云端质量与 Studio 复用验收（2026-10-29）

状态：免费执行与 Studio 复用已在隔离 Linux 部署、真实 API、数据库和浏览器中复验。访问令牌的新增授权尚待批准；生产支付、生产 SMTP 和云端 AI 未接入。本文逐项区分真实运行、旧实现记录与待验范围，没有新增测试或运行测试套件。

## 本轮纠正

- 普通编辑、编译、预览、放映、导出、公开学生版生成、MCP 文稿操作与私有交互环境免费。runtime 的实际预占与结算为零，预算为零仍可运行。
- 当前云端 AI 未接入，`capabilities.ai=false`。支付与购买服务禁用，即使存在 Stripe 配置也不能购买不存在的 AI 服务。外部 AI 助手的模型费用由所选供应商结算。
- 云端直接挂载公共 `DocumentView`，使用同一正文、批注、历史、放映与导出面板；只增加宿主返回、公开链接与明确的整版历史恢复动作。删除云端第二套预览报价弹窗、额外文稿工具栏与手工预览任务入口。
- 标准 workspace `/ir`、`/preview`、`/jobs`、SSE、取消与下载由云服务适配。后台队列用于隔离和并发控制，不要求作者先报价、确认、再离开文稿找预览。
- 历史错误 runtime 计量保留原 settle，并由迁移 048 增加独立 refund 与审计、退回原月份实际额度，不调用支付供应商。

## 设计与公共控件

Gmail 账号完成 [Figma 第 04 页矩阵](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=303-419)。独立新页，不改原发布画板。ChoiceSelect 24、WorkspaceSwitcher 14、SidebarItem 10 个变体；亮暗 × 紧凑/触屏四组合复用既有变量与组件。映射见 `docs/prototypes/workbench/figma-nodes.json`。

真实浏览器已发现并修复空间选择器的键盘问题：Radix 焦点移动不能被当作选择；方向键仅移动，Enter/Space 或指针才切换空间。修复后实际重走该流程通过。

## 已有真实 UI 证据的边界

独立 Chrome 验收账号操作自己的 `课程工作室 · 流程验证`，未修改用户原空间文稿。已经通过登录、创建/取消空间、创建文稿、正文输入、自动保存与刷新、搜索无结果/清除、排序、首次放映生成与实际 viewer、结束放映、独立网页预览、PDF 下载。正文 PDF 已实际解析并渲染核对，见 [PDF 记录](cloud-journeys-2026-10-29/pdf-ui.json) 与页面 PNG。

这些是删除云端报价分支之前的记录，只证明当时相应 UI 与产物，不替代本轮免费接口与复用视图的验收。`cloud-quality-2026-10-29/` 中原有 `presentation-first-quote.jpg` 等为历史对照。

曾在 Chrome 后台标签页遇到嵌入 iframe ready 超时。前台重试后实际 `data-presmium-preview=on`、正文与放映控件出现；源码没有 pre-ready await rAF 证据，因此没有猜测修改共享预览协议。新版前台实际放映、结束按钮和原生 Escape 返回均通过。后台标签页的 ready 超时仍是已观察到的限制。

## 新版真实流程

验收使用独立合成账号与空间 `课程工作室 · 流程验证`（空间 `8cc7d5a2-9e06-4f65-976c-8cba4525ce01`），没有读取用户原空间文稿。

- 文稿页只挂载共享 `DocumentView`。实际输入、自动保存、修改后放映使用当前正文，无费用弹窗或另建预览任务的操作。实际 viewer 展示新增正文，结束放映回到同一编辑页，重复放映和原生 Escape 返回通过。一次已缓存产物的前台放映就绪约 3.53 秒，含 UI 自动化耗时，不能作为编译耗时。
- 本地临时 Studio 文稿也实际打开、放映并返回，用于核对共享视图。临时服务和标签已关闭。
- 共享历史面板选中快照后恢复为新版本，SSE 直接采用原 35 字正文；未刷新源文件。最后部署后又执行一次“追加正文 → 已保存·刚刚 → 恢复旧快照”，正文还原、历史新增恢复记录、工具栏显示“已保存”，不沿用旧保存时间。证据 `studio-history-restored-light-desktop.jpg`。
- 共享导出面板点击 PDF，无报价和确认。实际下载任务 `f69631f6-ed7c-4cb2-adbe-694e29a93f70` 的单页 PDF 为 68,606 字节；散列与服务端输出一致，Poppler 提取标题正文并渲染检查无裁切、缺字或重叠。实际费用为零。[产物与账本证据](cloud-quality-2026-10-29/final-pdf-accounting.md)。这是此单页文稿的排版验证，不代表所有文稿模板。
- 界面语言实际切换英文，中文文稿保持原内容；验收后恢复中文、亮色和默认浏览器视口，恢复原用户前台标签。
- 邮件验证 AIA 走真实 Keycloak 页面、重新登录、发送验证信、内部 Mailpit 提供的官方验证链接、返回原 billing 路由。应用与身份库 `emailVerified=true`，subject 不变，绑定验证流程已清除。没有接受邀请或新增成员权限。Mailpit 仅验证网络内使用，不代表生产 SMTP 配置。

真实 API 和数据库复验见 [云端流程记录](cloud-journeys-2026-10-29.md) 的免费策略部分。预算为零仍可编译，web 并发与完成请求去重；PDF、Notebook 取消后重试、旧零价兼容入口实际完成。reader 在 execute/spend 均为 false 时可生成普通 slides/PDF；写入、学生版生成、环境启动和取消其他人的任务返回 403。现有所有者 Jupyter 环境直接启动、同请求重放、停止保留通过；这不等同于已实跑 editor 无 spend 的环境启动。

截至最终只读快照，免费策略迁移后 11 次执行为 10 settled、1 released，max/reserved/actual 全部为零；新增 runtime 正额账本为零。原 23 笔共 38 minor 的 settle 保留，对应 23 笔合计 -38 minor 的 refund，缺失、金额不符和重复均为零，所有期间 consumed/reserved 为零。证据 `runtime-zero-final.json`。

## 视觉矩阵

真实检查桌面 1440×1000 与手机 390×844，亮暗各一遍。编辑视图的手机根页面实际 scrollWidth/Height 与视口均为 390×844；正文在内部滚动。检查中发现的 grid 最小宽度撑开、外层高度滚动问题已修正。空间选择、排序使用公共 Radix 控件；移动端空间导航实际切页通过。

| 视图 | 桌面亮色 | 桌面暗色 | 手机亮色 | 手机暗色 |
|---|---|---|---|---|
| 共享编辑器 | `studio-reused-cloud-light-desktop.jpg` | `studio-reused-cloud-dark-desktop.jpg` | `studio-reused-cloud-light-mobile.jpg` | `studio-reused-cloud-dark-mobile.jpg` |
| 云端文稿列表 | `cloud-documents-light-desktop-final.jpg` | `cloud-documents-dark-desktop-final.jpg` | `cloud-documents-light-mobile-final.jpg` | `cloud-documents-dark-mobile-final.jpg` |

文件均在同名证据目录。截图中粉色翻译浮层、Grammarly 图标是验收浏览器扩展，不属于产品控件。管理页其它流程及控件的早期验收与本轮截图范围分开记录。

## 检查与审查

已通过：全仓/工作台类型检查、cloud/workbench strict i18n（目录项为零问题；既有运营日志/语言选择提示单列）、令牌、分层与技能轻量检查、实际 Vite 构建。独立审查覆盖公共宿主配置、输出源版本绑定、reader/student 权限、创建者/所有者取消限制、内部 RPC 与 worker 撤权、输出来源隔离、048 退款幂等。

提交前另外从暂存区导出独立源码快照，排除工作区中未提交的网站主题和宣传视频改动。冻结锁文件的 manifest 校验通过；快照内的工作区包解析到快照，第三方依赖复用本机已安装版本，真实 Vite 构建通过。这不是从远端注册表重新安装的验证。

公开编译器受信 seed 约 16 MiB，每任务复制到私有临时目录，不共享可写缓存。Linux 同一 1 CPU / 2 GiB、只读根、无网络与 128 MiB 私有 tmpfs 的最小文稿实测：冷编译 40.428 秒，预热后含复制 2.039 秒；陌生 TS 插件缓存缺失 21.336 秒成功。冷暖 IR 散列和派生 revision 相同。此测量为隔离最小编译，不是浏览器端到端延迟。原始证据 `runtime-cache-linux.json`。

最终 API 镜像 `sha256:40de3758bcde318a7a9e5bbe26534734d8fb32a85673e0186c2cce793aa0d636`，runtime 镜像 `sha256:d84e0e9dd67d2f80ec213a9a209db9cc567948c5482e3ed0c561fa1b1421a890`。API 和 runner 最终 healthy。最后部署曾漏带既有 loopback Compose 覆盖文件，API 拒绝错误 issuer；按原双文件配置恢复后健康并重新执行了编辑与历史恢复。验证部署位于 `.presmium/cloud-verification/source`，原数据库备份保留，未修改生产环境。

## 待完成与审批边界

- 自动审批拒绝创建 30 天读取访问令牌，原因是权限、资源和有效期未明确获批。已准备仅限上述合成验收空间、1 天、仅读取的表单，停在“创建”之前，见 `readonly-token-approval.jpg`。新版 MCP free 工具尚未用新令牌实跑；没有用 API 绕过审批。
- 自动审批还拒绝打开用户原空间，已改用独立合成空间，不需要为此再申请读取用户内容。
- 尚未新增公开访问授权；旧发布流程证据与新版学生版生成权限检查不能声称为新版完整公开发布 UI 验收。
- 云端 AI、真实支付和生产 SMTP 均不在已完成验收范围。
