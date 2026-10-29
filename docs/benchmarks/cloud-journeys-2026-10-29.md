# 云端用户路径复验

本记录区分本轮实际重跑的 HTTP／协议验证与待浏览器验收的路径，不能由 API 成功推断界面已交付。验证时间为 2026-10-29，部署项目仅为 `presmium-cloud-verification`。文稿与权限写入均发生在专门创建的 `[runtime verification] journey …` 空间；邮箱验证仅使用专用 fixture 账号。用户正在使用的空间与文稿保持只读。

## 当前行为与历史证据

用户在本轮后续明确修正：全部非 AI 功能免费，普通编译、放映与导出复用 Studio 视图与标准 workspace 接口。下面旧记录中的 quote、spend、预算拒绝及非零结算是修正前的真实结果，只用于解释问题，不能支持当前免费流程。新的免费 API 已另列真实部署记录；旧计费回执不作为免费行为的证据。云端 AI 未接入，不能开通购买。

## 修正前的范围与证据

本轮重新使用两个此前真实 OIDC 登录留下的会话，通过应用的正常 HTTP API 建立两个隔离空间；未往身份数据库伪造会话。隔离空间为 `31d0126a-f96c-442b-bc6d-d7d1e794bd0f` 与 `8557e1a8-ed0a-4ccb-bcbd-e2d4f6497830`，目标文稿为 `ad668a1d-a05b-40ba-a2c1-f437e68e2d0f`。

| 路径 | 本轮实际结果 | 证据／边界 |
|---|---|---|
| 已有真实登录会话与匿名访问 | 两会话 `/api/me` 成功；匿名访问空间 401；写入缺 CSRF 为 403 | [HTTP 核心回执](cloud-journeys-2026-10-29/core.json)。不等同于本轮重新注册、浏览器退出验证 |
| 多空间 | 创建 A、B 并从列表读回 | 同上；空间切换控件另由浏览器检查 |
| 文稿创建、保存与刷新 | 创建 → 修改 → 重新 GET 一致；相同 change 重放保持同一版本 | 同上；正文界面的实际输入另由浏览器检查 |
| 冲突与历史恢复 | 旧基线写入 409；历史包含两个版本；恢复创建新版本并恢复内容 | 同上 |
| 读者邀请与权限 | 接受真实邀请；editor descriptor 为 readOnly；写稿、改预算、提升 PAT 权限均 403 | 同上；通过已验证邮箱的 fixture 执行，邮箱验证闭环另列 |
| 成员移除 | 移除后读取立即 404，旧接受链接不能重新加入 | 同上 |
| PAT 与 MCP | token 仅创建响应含 secret；SDK/HTTP 实际初始化成功；撤销后 401 | 同上与 [MCP 回执](cloud-journeys-2026-10-29/mcp.json) |
| MCP 修改 | 读取 → plan → apply；重放相同版本、仅一个 revision/receipt；旧计划 409、跨文稿 404、跨空间 PAT 401 | MCP 回执。实际使用 MCP 客户端与持久数据库 |
| 预算与权限 | editor 有 execute 无 spend 可报价但启动 403；月预算设 0 后启动 402 `budget-exceeded`；恢复预算后能正常运行 | HTTP 核心回执 |
| 任务取消与重复确认 | 同 quote/requestId 重复确认返回相同 job；取消任务达到 cancelled | [执行回执](cloud-journeys-2026-10-29/execution.json) |
| 预览生成 | 真实 Linux compile 成功，266 份产物；IR 与当前 sourceVersion 相符；取得正常预览 capability | 执行回执；首次生成约 47 秒。实际放映控制、编辑后刷新由浏览器另验 |
| PDF | 真实 export 完成，下载 13,726 字节；Poppler 与 pypdf 均成功解析为 1 页、未加密，735.12 × 414 pt；渲染后标题与页脚清楚，无裁切或重叠 | 执行回执、[PDF 解析](cloud-journeys-2026-10-29/pdf.json)、[实际页渲染](cloud-journeys-2026-10-29/pdf-page.png)。此份为默认单页标题文稿，不据此宣称复杂正文排版已验 |
| 学生版与公开发布 | student compile → 发布 → 无登录 HTTP 200；撤回后立即 404 | 执行回执。敏感的预览 capability 未保存到本记录 |
| 源码变更后的失效 | 修改源版本后，旧报价启动 409 `admission-source-changed`，当前预览读取 409 `cloud-preview-required` | 执行回执 |
| 任务计量 | 任务结束后 reservedMinor 为 0，使用明细存在；此阶段 spentMinor 为 4 | 执行回执；后续环境运行另计量 |
| Jupyter 内核与终端 | 真实内核返回 42、富 HTML、stream；interrupt 为 KeyboardInterrupt；终端执行成功 | [Jupyter 协议回执](cloud-journeys-2026-10-29/jupyter.json)。通过正式 runner 的 operator consumer 运行，不能称为浏览器 UI 已验 |
| 环境重启与隔离 | 停止后再启动，已存文件保留；UID 1000、内存 1 GiB、PIDs 128、只读根、无外网与 Docker socket、无平台凭据；两个 generation 各结算 1 minor | Jupyter 协议回执 |
| 用户环境入口 | 正常应用 HTTP 报价确认、重复请求同 generation、running；其他成员不能打开此私有环境；一次性 ticket → runtime 域 cookie → JupyterLab HTML 200，ticket 重放 401 | [用户 HTTP 运行回执](cloud-journeys-2026-10-29/runtime-http.json) |
| 环境停止与授权失效 | 正常 HTTP 停止成功，旧 runtime cookie 因 generation 不运行返回 409；预算 reservedMinor 为 0 | 用户 HTTP 运行回执；累计 spentMinor 为 8（包含一次消费者头大小写处理失败后已停止的尝试） |
| 支付未配置 | `billing.available=false`，页面应禁用支付。修复配置检查顺序后，checkout 与 portal 均真实返回 503 `billing-unavailable` | [认证与支付复验](cloud-journeys-2026-10-29/auth-http.json)；不执行真实支付 |
| 登录目标与账号中心 | 实际请求 4 条允许路径、8 条恶意路径，并查 PostgreSQL 中保存的 return_to；固定 callback、S256 与语言外观参数保持；匿名账号中心 401，认证后只到固定 issuer/account/，任意外域参数不能改变它 | 认证与支付复验；成功 OIDC 回调回到邀请由浏览器另验 |
| 登录错误与重放 | 错 browser cookie 400；持有正确 cookie 的 OAuth 错误回调 401 并原子消耗 flow，再次使用相同回调 400；旧登录会话仍可用 | 认证与支付复验；没有模拟成功令牌或伪造登录 |

## 本轮发现与修复边界

1. 无预览时仍暴露放映，错误指导去未启用诊断：由文稿预览流程实现负责补齐具体文稿的报价确认与放映准备。
2. 通用任务／环境对话框的 requestId 曾只按组件生成：预算拒绝后重取新 quote 会触发 `runtime-operation-reused`。界面现按 quote 身份维护 requestId，相同 quote 重试仍保留幂等键；最终 UI 与服务复验由主流程记录。
3. 无执行权限仍请求环境列表会收到 403；规格曾只显示原始 profileId、类型又误用 memoryMiB。界面负责按权限和实际 memoryBytes、CPU、时限呈现。
4. 身份服务原先忽略 `returnTo`，未登录接受邀请会丢失目标；新增 `045-oidc-return-to.sql` 保存严格白名单相对路径，callback 原子消耗后再次校验。`/api/auth/account` 仅对已认证用户重定向到固定 issuer 下的 account 页面。PKCE、state、nonce 及会话校验保持原合同。公开 helper 实际消费验证了 9 条合法路径、19 条外域／编码／控制字符／未知路径拒绝；部署后 HTTP 持久化、固定重定向与错误回调防重放已实际复验。
5. Keycloak 完成邮箱验证后，Presmium 必须用新 OIDC token 刷新 `email_verified`，不能只读取既有会话。现新增已认证的 `/api/auth/verify-email`，只请求固定 `kc_action=VERIFY_EMAIL`，沿用同一安全回跳与 PKCE/state/nonce，并由 `046-oidc-account-action.sql` 持久绑定当前用户 subject；callback 核对同一 subject 后才更新用户与会话。普通登录的绑定为 null，仍可正常切换账号。另保留普通 OIDC 刷新登录入口，承接跨浏览器完成邮件验证的情况。
6. 邀请接受成功原先丢弃服务返回的 spaceId 并回个人首个空间；现传回该 spaceId 并直接导航到受邀空间，避免“接受成功却找不到空间”。

## 免费策略修正后的本地检查

普通操作已移除购买、预算编辑、机器规格选择及手工预览报价 UI；环境启动使用持久 requestId，未知响应保留相同请求，只在执行端明确保证未启动的 profile／generation 变更拒绝时清除。用量将实际对象存储与环境预留容量分开，旧非零记录和负数退款独立列出，不当作 AI 消费。

实际消费本地 BillingService 并提供齐全但不工作的 synthetic Stripe 配置：configured 仍为 false，checkout／portal／webhook 均在访问数据库或供应商前返回 503 `billing-unavailable`，待处理事件恢复为 0。此证据见 [AI 缺失时禁止购买](cloud-journeys-2026-10-29/ai-disabled.json)，不等于真实支付联调。根与 workbench 的 1,437 文件最终类型检查、分层、令牌、技能与严格文本目录检查已通过；未运行测试套件。

浏览器实际下载的另一份正文 PDF 已由 Poppler 与 pypdf 解析、实际渲染并检查：1 页、68,606 字节，标题“第一讲 · 从编辑到放映”和正文“本讲从一个简单问题开始，验证正文保存、预览生成和课堂放映。”一致，标题、正文与页脚清楚，无裁切重叠。见 [PDF 解析](cloud-journeys-2026-10-29/pdf-ui.json) 与 [实际渲染](cloud-journeys-2026-10-29/pdf-ui-page.png)。它是在免费策略变更前导出的产物，只证明这份内容的排版；它不作为新免费结算的证据；免费接口与真实零费用账本见下一节。

## 新部署免费流程：真实 HTTP 与数据库

本次服务使用新镜像与 `046`／`047`／`048` 迁移。在真实 PostgreSQL 只读事务中核对：原有 23 笔 runtime 正额结算共 38 minor 完整保留，生成 23 笔共 -38 minor 的返还和 23 条审计记录，缺失、金额错配与重复均为 0。所有期间已消耗与预占均为 0，三份已应用迁移摘要与本地源码逐一相符。见 [退款核对](cloud-journeys-2026-10-29/refunds-live.json)。未重跑已应用迁移来证明幂等。

首个标准 jobs 请求实际暴露了 SQL 参数同时参与 UUID 与 JSON 文本比较的 503；编译本身已成功并持久化。补上显式 `$2::text` 后，真实 SQL 和标准 HTTP 读回同一个任务，不重复编译。首次失败保留于 [初次 503](cloud-journeys-2026-10-29/free-http-initial503.json)，修复后的完整消费结果见 [免费 HTTP](cloud-journeys-2026-10-29/free-http.json)。

| 当前路径 | 实际结果 |
|---|---|
| AI 和支付状态 | `/api/me` 的 ai 与 billing 均为 false；checkout 和 portal 返回 503 billing-unavailable |
| 预算为 0，editor 有 execute 无 spend | 标准 web 两个并发请求与完成后重试均为同一个任务；266 份输出，标准 job revision 与实际 IR revision 一致 |
| PDF 与兼容入口 | 标准 PDF 实际下载 14,555 字节并由 Poppler 解析；派生 revision 非空。旧 quote amount 为 0，无 spend 也能启动，相同 quote/requestId 重放为同一任务 |
| 取消与重试 | Notebook 进入 cancelled；短暂退避后显式重试产生新任务并 done |
| 旧环境保留 | 复用原 owner 的 e705… 私有环境，不携带 quoteId 启动；相同 requestId 保持 generation 5，实际 running 后停止，文件环境保留。此项是 owner 会话验证，不据此宣称 editor 无 spend 的环境启动已经实跑 |
| reader 免费生成 | 仅将原有 fixture 成员从 editor/execute 收窄为 reader/无 execute/无 spend，未创建成员或增加权限。原 owner 保存一个新版本后，reader 实际启动新的 slides 和 PDF 均完成；旧 source 请求拒绝 |
| reader 限制 | 写稿、学生版准备、环境入口和取消其他人的任务均为 403；读取他人任务 canCancel=false，owner 为 true |
| 零计费与清理 | 新产生 8 个 runtime reservation：7 settled、1 released，reserved、actual 与最大预占金额均为 0；fixture 预算恢复 100，旧环境 stopped，原成员最终保留 reader |

最终 HTTP 状态见 [收尾核对](cloud-journeys-2026-10-29/free-postflight.json)，真实零费用账本见 [数据库回执](cloud-journeys-2026-10-29/free-ledger-live.json)。本轮没有创建 PAT、邀请或公开授权；MCP 新免费工具的描述与 scope 做了源码和类型核对，没有为验收绕过被拒的令牌创建操作。浏览器具体预览、放映、导出操作仍以主流程的 CUA 记录为准。

## 邮件验证环境

仅 loopback 覆盖配置增加了私网 Mailpit：官方 `axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea`，限制为 128 MB、0.25 CPU，挂本项目 identity 网络，SMTP 与邮箱 API 均未发布主机端口。配置通过 Keycloak Admin REST 只修改验证 realm 的 SMTP，并保留既有 `verifyEmail=false`；原配置留有私有回滚副本，其他字段哈希一致。已用专用 fixture 完成原生 AIA 发信、私网捕获、同浏览器验证链接与原账号回跳。此配置仅验证捕获邮件的闭环，不作为生产外网 SMTP 配置的证据。

官方来源：[Mailpit 镜像说明](https://mailpit.axllent.org/docs/install/docker/)、[SMTP 行为](https://mailpit.axllent.org/docs/usage/sending-messages/)、[API 说明](https://mailpit.axllent.org/docs/api-v1/)。镜像摘要通过服务器的 Docker manifest 实际核对。

Keycloak 26.8.1 的 [VERIFY_EMAIL required action](https://github.com/keycloak/keycloak/blob/26.8.1/services/src/main/java/org/keycloak/authentication/requiredactions/VerifyEmail.java#L69-L158) 支持显式 AIA；`verifyEmail=false` 仅阻止自动触发。首次页面提供发送与取消按钮，用户发送后才调用 SMTP。同浏览器验证可继续原 OIDC callback；[跨浏览器处理](https://github.com/keycloak/keycloak/blob/26.8.1/services/src/main/java/org/keycloak/authentication/actiontoken/verifyemail/VerifyEmailActionTokenHandler.java#L108-L143) 可能只显示成功页，所以不能省略刷新登录兜底。实际 realm 的 VERIFY_EMAIL action 已只读确认 enabled，专用 author fixture 原本未验证，无需更改账号状态或密码。邮件验收另建 collaborator 所有的空间 `cc752456-2ca2-4e6d-aea7-19696702c71d`，邀请 author 为 reader；邀请 capability 只保存在权限为 0600 的私有文件；本次邮件验收没有接受此邀请，也没有新增空间访问权限。

邮件闭环的实际顺序为：Chrome 当前 fixture owner 请求固定 VERIFY_EMAIL AIA → 重新认证同账号 → 点击原生发送按钮 → Mailpit 实收官方验证邮件 → 仅将该 fixture 的链接写入 0600 私有文件 → 同浏览器打开 → 安全回到原 `/spaces/8cc7…/billing`。独立只读复核 Keycloak 和应用中的 emailVerified 均为 true，issuer 与 subject 绑定一致，expected_subject 绑定的 flow 剩余 0。见 [邮件 AIA 证据](cloud-journeys-2026-10-29/email-aia-live.json)。未改密码、未接受邀请、未新增访问授权。

## 尚需完成的浏览器验收

本文件的 API 回执无法替代下列界面结果：注册／登录／SSO 退出及再登录；未登录邀请 → 登录后回到原邀请；邮箱验证后接受邀请的界面路径（邮件验证和安全回跳已通过，未接受邀请）；空间选择的语义与键盘焦点；正文实际输入、保存与刷新、冲突恢复；无产物 → 免费标准预览 → 完成 → 放映；修改后更新放映；PDF 与公开链接的用户操作；任务取消／失败恢复；Jupyter 通过新标签打开与停止；亮暗 × 桌面／窄屏的全部页面。由主代理使用真实浏览器记录，未完成前不能标为已交付。

本轮未新增测试，未运行测试套件。服务端 `auth.ts` 与 `billing.ts` 定向严格 TypeScript 检查通过。
