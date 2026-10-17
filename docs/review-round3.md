# 第三轮验收审计修复清单（WP-89）

本清单汇总 WP-89 的最终验收审计，评审对象是 `main` 8be929d（WP-91b 合并之后）。输入：7 份需求验收报告（内核与原则、内容与执行、发布与课堂、媒介与站点、agent、讲授与语音、体验与示例，共 62 个缺口）、插件代码评审（11 条）、独立的 SHARED 安全评审（1 条），以及两份早先评审中尚未处理的条目：核心评审的 6 个次要问题与简化评审 S01–S20。合计 101 条输入。合并重复后保留 86 项（27 个主要、59 个次要），3 条只转为决定、不单独成项（见文末“删除的条目”），没有发现与代码不符的报告条目。文末列出 13 项决定：D-1 是 SHARED 模式的阻塞项，D-2 是验收者已经做出的决定，D-3 至 D-13 附有建议；依赖某项决定的条目在正文中标明（F-07、F-08、F-22、F-57、F-63、F-64、F-66、F-73、F-74、F-85、F-86），按决定实现。

**独立安全评审报告了一个主要问题（F-12，讲授媒体路由的检查与打开之间的竞态）**，插件评审另有 6 个主要的安全问题只影响或主要影响 SHARED 模式。所以 SHARED 模式的“实验性”标记**还不能去掉**，阻塞项列在决定 D-1。

合并的原则是保留根因修法。主要的合并有：撤销文档操作后站点不刷新（媒介 P-121、体验 P-122）合为 F-10，并与服务器不卸载文档贡献（核心）共用 C-7 的刷新入口；SHARED 读者经讲授路由拿到教师内容（讲授 P-131、插件评审的讲授受众）合为 F-13；讲授写回调用助手的私有路由（内核原则 4、简化 S04）合为 F-15；本地环境的 P-25 回写（内核 K-09、简化 S05、验收者已决定删除）合为 F-22；幻灯片中可运行代码的两个输出区、英文占位文字与导出 PDF 失败（发布 P-50、体验的两条）合为 F-18；助手在静态产物中启动失败（内核、媒介、agent 三份报告，即 WP-89a 已知缺口 2）合为 F-48；讲授视图无条件注册（讲授、体验，即 WP-89a 已知缺口 4）合为 F-61；文档漂移（第 8 节覆盖表、示例工作区 README 与 WBS 已知缺口 1（三份报告）、术语表、第 12 节依赖表、需求 5.3、原则 2 的措辞）合为 F-86。体验报告的 N-07 一条拆成三处：VitePress 的读屏标签（F-79）、修改历史的英文提交标题（F-55），以及 Slidev 运行器的占位文字（并入 F-18）。

抽查确认的事实：`addon-exec/src/node/vite.ts` 的 `FILES` 与 `addon-exec-webgpu/src/node/jax.ts` 只发出运行时文件，没有许可证；`addon-exec-jupyter/src/domain/outputs.ts:107` 把参数一律写成字符串，`addon-exec/src/domain/runs.ts` 的 `stringArgs` 把 `false` 写成 `'false'`，`kernel/src/runner.py` 的 `ast.literal_eval('false')` 失败后保留字符串，且以 `'exec'` 模式编译；`compiler/src/source.ts` 的 `insertAt` 只进入 `mystDirective`；`web/src/node/site.ts` 与 `sites.ts` 的 VitePress 配置没有 `srcExclude`；`workspace/src/node/routes.ts` 的 `revisions/revert` 与 `documents` 不触发刷新、也不检查变更任务；`addon-lecture/src/node/routes.ts` 的 `serveFile` 在 `insideDeck` 之后按路径重新打开，`tracks`、`tracks/*` 为 reader 角色并从完整 IR 规划；`PlayerPanel.vue:261` 只拼词；`PmRunPanel.vue` 的 `max-height: 20em`；`presmium-tutor.cordis.yml` 只关掉了 `tool-fs` 的写与编辑；`addon-code/src/node/git.ts` 的工作树读取是普通 `readFile`；`classroom-server/src/index.ts` 用 `key.split(':').includes(participant)`；`addon-exec/setup/code-runners.ts:26` 的图片数据没有转义；`addon-assistant` 的提问任务没有上限；服务器没有请求体大小限制；`server/src/control.ts` 的 `status()`、`positions()` 取任何窗口的报告；`compiler.ts` 的 `#run` 以 `Promise.all` 并发发送会话请求；`agent-host.ts` 在读完请求体之后才监听 `req` 的 `close`；`theme.ts` 的 `fetchCurrent` 不检查期间是否已应用更新；`execute.ts` 直接用 `unit.session` 作会话名；`container.ts` 把运行目录设为 0777；`check-layering.mjs` 的 server、mcp 规则只禁止 vue、vitepress 与 `@slidev/`；`check-skills.mjs` 只做子串检查；`highlight.ts` 没有 wgsl 与 ruby；根目录 `engines` 仍为 `>=22.18`；`templates/workspace` 没有 `.gitignore`；`files.ts` 复制文档时 `.presmium` 只保留 `anchors.lock.json`；`fallbacks.ts` 的测验选项用数字而答案用字母。简化评审的 S02–S20 全部仍在；S01 中 presmium-mcp 缺少发布检查的部分已在 f326a6e 修复（`mcp/src/stdio.ts:86`），其余仍在（`pluginChecks`、`packageUp`、`bundledDir` 与“until audiences are compiled (WP-87)”的注释）。

工作包按包目录划分。WP-89b 拥有内核、宿主、编译器、CLI、服务器、MCP、语言服务与结构检查脚本，提供其他组要用的共用函数与契约增补，**先单独完成并合并（串行）**；之后 WP-89c（工作区与助手）、WP-89d（讲授与语音）、WP-89e（执行、幻灯片、notebook 与发布）、WP-89f（网页、IR 运行时、课堂、内容、文档与示例）在并行的工作树中实现，拥有的路径互不相交。探针脚本在 `/tmp/claude-1000/-home-ddq-AoyangSpace-presmium/ad4777b2-3f0f-4adb-9e14-744177671948/scratchpad/final-audit/` 的各报告子目录中（`accept-*`、`security-shared`、`review-plugins`、`review-core`、`review-simplify`），下文只写子目录与脚本名。

## 组间约定

**C-1 顺序、合并与端口。** WP-89b 先在 main 上完成并合并；决定 D-3 至 D-13 要在 89b 开始之前做出（89b 的契约增补依赖 D-4）。89c、89d、89e、89f 从合并了 89b 的 main 分出，并行实现；合并顺序 89c → 89d → 89e → 89f：89d 的 F-15 用到 89c 实现的 `AgentTask.revert`，合并前变基到 89c；89f 拥有文档、示例与技能，最后合并。新增依赖（kernel 的 `parse5`，见 C-2）写在合并说明中，合并时重新生成 `pnpm-lock.yaml`。端到端端口：89b 5301–5309，89c 5311–5319，89d 5321–5329，89e 5331–5339，89f 5341–5349（`PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT` 取各段的前两个）。

**C-2 kernel 的共用函数与数据。** 89b 从 `@presmium/kernel` 导出以下函数，删除自己包中的副本；各组按下表替换自己包中的副本。

- `mapHtmlUrls(html, map: (url, attribute) => string | undefined): string` 与 `htmlAttributes(html, names)`（parse5，纯计算库，允许用于 kernel）；`LowerOptions.urls` 也映射原始 HTML 的 `src`、`poster`、`href`（F-04）。迁移：89e 为 render-slides、render-notebook；89f 为 web。
- `GIT_SAFE_CONFIG`、`GIT_ISOLATED_CONFIG`、`gitIsolatedEnv(dirs)`、`EMPTY_TREE`、`ISOLATED_GIT_MIN`（F-06）。迁移：89c 为 workspace 的 `git.ts` 与 addon-assistant 的 `git-review.ts`（后者也做版本检查）。
- `publishedUrl(found, url, { prefix, directoryIndex })`、`copyPublished(found, dir)`；`RenderContext.localAsset` 返回 `{ file, name, directory }`（F-28）。迁移：89e 为 render-slides、render-notebook；89f 为 web 的 `publish.ts`。
- `gatewayFetch(access: GatewayAccess, plugin, path, init)`（带 Bearer 与 `redirect: 'error'`）（F-29）。迁移：89c 为 addon-assistant；89d 为 addon-speech 的 `remote.ts`、`server.ts`；89e 为 addon-exec-jupyter 的 `connection.ts`。
- `splitWords(text): TextWord[]` 与 `remapWords(words, written, spoken, spans)`，放在 `SpeechWord` 旁（F-30）。迁移：89d 为 addon-lecture、addon-speech。
- `json(data, status?, headers?)`（带 `Cache-Control: no-store`）与 `problem(status, message)`，放在 `kernel/src/contracts/server.ts` 的 `Route` 旁（F-33）。迁移：89b 为 server；89c 为 workspace、addon-assistant；89d 为 addon-lecture、addon-speech；89e 为 addon-exec-jupyter。
- `CREDENTIAL_VARIABLE`（F-34，只在 89b 内使用）、`prefixed(log, id)`（F-35）、`escapeHtml(text)`（F-36）。`escapeHtml` 的迁移：89e 为 render-slides、`addon-exec/setup/code-runners.ts`，以及 addon-exec-webgpu 的 `isRecord`；89f 为 addon-content。

**C-3 宿主的共用接口。** 89b 从 `@presmium/host` 导出：`blockKey`、`splitBlockKey`、`blockElement(key)`、`blockAt(x, y)`、`lineNumbers`、`linesText`，统一一种可见性规则：跳过 `[inert]` 与 `.pm-hidden`（F-31；迁移：89c 为 `EditPanel.vue`，89d 为 addon-lecture 的 `blocks.ts`、`drift.ts`、`plan.ts`，89f 为 addon-guide 的 `adhoc.ts`）；`trackAgentTask(task: AgentTask): Ref<AgentTaskState>`，由 addon-assistant 的 `client/edit.ts` 中跟随事件的状态机移来（F-15；89c 让编辑面板改用它，89d 让写回面板改用它）。窗口向控制通道报告位置时带上当前章节 ID（F-41）。若 D-4 采用：`NavigationPosition` 增加可选 `section?: string`，`navigation.go` 优先按章节 ID 在自己的 IR 中定位（F-85，由 89f 使用）。

**C-4 编译器的接口。** 89b 在 `@presmium/compiler` 中提供：`Compilation.check({ externalLinks })`、`runBlock(compilation, target, signal)`、`buildView(compilation, { to, view, outDir })`，并导出包查找函数 `findPackageDir`（F-03；89c 让 serve 的 `serverHost` 改用它们）；`serveDirectory(root, { base, extra })` 与 `playwrightChromium(deckDir, fallbackFrom?)`（F-32；89d 用于讲授导出，89e 用于 addon-publish 的网页截图）；导出学生视图的纯函数（`audienceView(doc, audience)` 或等价的接口），供插件在服务端从最新 IR 求学生视图（F-13，89d 使用）；`RenderContext.localAsset` 对工作区中另一份文档的入口文件（`<文档目录>/lecture.md`）返回 undefined，新增 `RenderContext.documentLink(source, url): { dir: string, fragment?: string } | undefined`，单文档构建中 `presmium.links` 对这类链接给出警告（F-25；89f 在工作区站点中改写它，render-slides 与 render-notebook 不需改动，它们只是不再发布这个文件）。

**C-5 服务器的接口。** 89b：`server/src/trust.ts` 的 `dropPrivileges(user, files = secretFiles(env))` 依次做 initgroups、setgid、setuid 与 assertUnreadable，并从 `server/src/http.ts` 导出 `hostname`、`isLoopback`、`sameSecret`、`bearer`、`json`、`problem`（F-05；89c 让 agent-host 与 serve 改用它们，删除 `becomeUser`、`initGroups` 与 agent-host 中的副本）；`GatewayTokens`，负责签发、续期与吊销（F-29；89c 让 `agent-client.ts` 改用它）；`PresmiumServer.unmount(dir)`（F-40；89c 在 C-7 的入口中调用）；插件路由的请求体默认上限 1 MiB，kernel 的 `Route` 增加可选 `maxBody?: number`（F-02；89d 给讲授的 `recordings/*` 设为 `MAX_CHUNK`，并检查语音 `v1/*` 路由）；服务器、gateway、serve 与 agent-host 的日志都用 `pluginLogger(name)`（F-35；89c 迁移 serve 与 agent-host）。

**C-6 助手契约。** 89b 在 `kernel/src/contracts/agent.ts` 增加：`AgentTask.revert(): Promise<RevertResult>`（F-15；89c 在助手的浏览器客户端中经它自己的路由实现）；服务 `DOCUMENT_LOCKS`，即 `DocumentLockService { claim(document, holder): (() => void) | undefined; holder(document): string | undefined }`（F-09；89c 让 serve 作为宿主服务提供它，文档操作、撤销与助手的变更任务都经它加锁；`presmium dev` 中没有这个服务时，助手照旧用自己的 `changing` 表）；`AgentToolContext.view: 'full' | 'student'`，由 89b 的 MCP 按 `viewOf(caller)` 填写（F-13，89d 的讲授工具使用）。

**C-7 文档集合变化的入口。** 89c 在 serve 中保留唯一的 `documentsChanged({ removed, added })`：关闭被删除文档的会话与审批，调用 `server.unmount(dir)`（对被删除的目录与再次出现的目录），然后 `refreshSpec()`、`site.documentsChanged(...)`。文档操作、修改历史的撤销与（可选的）文档位置监视都调用它（F-10、F-40）。

**C-8 幻灯片中的可运行代码与示例讲义。** 89e 修复运行面板在放映中的高度（F-19）、幻灯片的运行器输出与导出（F-18）。89f 在示例讲义中按修复后的效果调整 `extend-gpu` 的 `zoom` 提示，在 `e2e/demo.spec.ts` 断言第 25 页着色器没有纵向截断，在 `e2e/smoke.spec.ts` 对示例讲义运行一次 `presmium-export`（PDF，一页一张幻灯片）；F-48 合并后，示例讲义可以在头部列出助手插件（WP-89a 已知缺口 2）；F-21 合并后，89f 删除 web 的 `addons.ts` 中读取包根 `vite.config.ts` 的部分。

**C-9 文档与技能。** 只有 89f 修改 `docs/`、`.agents/skills/`、`CLAUDE.md` 与 `examples/`；其他组在合并说明中写明作者与运营者可见的变化，由 89f 写入。预期的变化：89b 为 `RenderContext.localAsset`、`documentLink`、`Route.maxBody` 与请求体上限、控制通道的章节 ID、`DOCUMENT_LOCKS`、`AgentTask.revert`、`AgentToolContext.view`、lychee 的调用方式；89c 为 tutor 不再带自己的文件工具、提问任务的上限设置、MCP `build` 的输出位置、工作区模板的 `.gitignore`、`engines`；89d 为读者的讲授按学生视图、媒体地址策略只在发布时生效、讲授视图只在有讲授时出现；89e 为 architecture 第 12 节（Pyodide、CPython、jax-js 的许可证文件）、参数类型的读回规则、D-5 与 D-8 的行为、架构第 2 节与需求 5.3 删去回写、exec-local 改为服务端路由、D-6 的离线缓存方式。

**C-10 测试归属。** `e2e/fixtures/deck.ts` 与 `e2e/urls.ts` 归 89f，其他组只读使用，需要新的助手时在自己的 spec 中写或在合并说明中提出。`packages/cli/test/` 归 89b：F-01 的用例与 F-47 的检查脚本用例都写在那里。各组的集成测试写在自己包的 `test/` 中。

## WP-89b（内核、宿主、编译器、服务器与 MCP；先行，串行）

拥有：`packages/kernel/**`（`src/runner.py` 除外，归 89e）、`packages/host/**`、`packages/compiler/**`、`packages/cli/**`、`packages/server/**`、`packages/mcp/**`、`packages/language-server/**`、`packages/vscode/**`、`scripts/**`、`e2e/core.spec.ts`、`e2e/mcp.spec.ts`、`e2e/preview.spec.ts`、`e2e/server.spec.ts`、`e2e/fixtures/{core,host,mcp,server,plugins,publish-checks}/**`

本组在约定中提供的接口：C-2、C-3、C-4、C-5、C-6；C-7 中的 `unmount`。

### F-01（major；P-55 受众范围）

**问题**：教师专用的 `{note}`、`{tab-item}`、`{dropdown}` 等指令中写的脚注定义，出现在全部学生产物中（网页 HTML、ir.json、搜索块、幻灯片 JS、notebook），构建的泄漏扫描与 `presmium check --audience student` 都报告没有问题。原因：`placeFootnotes` 只把定义放回仍为 `mystDirective` 的节点中，而 myst-parser 已把已知指令变成 admonition、tabItem、details，定义落到顶层成为没有受众的独立讲解块 `footnoteDefinition-1`；`audienceView` 保留它，扫描只查被去掉的块的句子。

**证据**：`compiler/src/source.ts:310-331`、`compiler/src/audience.ts:251`。探针 `accept-publish-classroom/audeck`、`audeck2`：FOOTSECRET11、TABFOOT6、DROPFOOT8 出现在 `dist-student` 的六类文件中；`{slide}`、`{only}` 中的脚注与教师章节中的脚注没有泄漏。

**修法与验收**：(1) `insertAt` 进入位置范围包含定义所在行的任何节点（admonition、tabItem、details、card、grid 项），不只 `mystDirective`；(2) 安全网：`audienceView`/`forAudience` 去掉源码行落在排除该受众的 `AudienceMark` 范围内的每个块，并把它们加入 `removed`，使产物扫描检查其句子。`packages/cli/test/audience.test.ts`：教师专用的 `{note}`、`{tab-item}`、`{dropdown}` 中的脚注不出现在任何产物中，`presmium check --audience student` 仍然没有问题。

### F-02（major；安全，N-08）

**问题**：插件路由整块缓冲请求体，服务器不设上限。读者路由 `POST assistant/tasks` 调用 `request.json()`，讲授上传的 PUT 先 `arrayBuffer()` 再检查 `MAX_CHUNK`，语音 `v1/*` 也读整个请求体。几个读者请求就能让持有会话、审批与 git 审阅的 serve 进程耗尽内存。

**证据**：`server/src/http.ts:155` 把每个请求交给 hono；`addon-lecture/src/node/routes.ts:186`。探针 `review-plugins/tutor/probe-body.mjs`：四个并发的 400 MB POST 都得到 400，进程 RSS 从 145 MiB 升到 3293 MiB。

**修法与验收**：按 C-5。服务器在读取之前拒绝 `Content-Length` 超过上限的插件路由请求（默认 1 MiB，`Route.maxBody` 可放大），分块传输的请求体读到上限即截断并返回 413。89d 给讲授的 `recordings/*` 设 `maxBody: MAX_CHUNK`，PUT 先检查 `Content-Length`，并检查语音路由。`packages/server/test`：2 MiB 的 POST 得到 413，进程 RSS 的增长小于 50 MiB；声明了 `maxBody` 的路由接受 10 MiB。

### F-03（major；简化 S01，P-80、P-110）

**问题**：CLI 的 `pluginChecks` 在 presmium-mcp 中有一份缩减的副本，没有把发现放到插件给出的行上；`compile`、`build`、`run` 的主体在 `cli/src/host.ts`（devHost）、`workspace/src/node/serve.ts`（serverHost）、`mcp/src/stdio.ts`（compilerHost）中各写一遍。stdio 的版本忽略 `view`，还留着过时的注释“until audiences are compiled (WP-87)”；它的 `packageUp`、`bundledDir` 重复了编译器的 `findPackageDir`。发布检查的缺失已在 f326a6e 补上。

**证据**：`mcp/src/stdio.ts:31-47,65-86,116`；`cli/src/check.ts:69,111`；`cli/src/host.ts:28-50`；`workspace/src/node/serve.ts:246-287`；`language-server/src/node/decks.ts:8` 从 `@presmium/cli` 导入 `pluginChecks`。

**修法与验收**：按 C-4。把 `pluginChecks`、`checkContext` 移进编译器，成为 `Compilation.check({ externalLinks })`，由 cli、语言服务、serve 的 `options.check` 与 mcp/stdio 调用；`runBlock`、`buildView` 供三个宿主使用（89c 迁移 serve）；stdio 的 `compile`、`build` 按 `view` 经 `forAudience` 求学生视图；删除 stdio 的 `pluginChecks`、`packageUp`、`bundledDir`。`packages/mcp/test`：stdio 的 `check` 与 `presmium check` 对同一份文稿给出相同的发现（含插件给出的行），`view: 'student'` 的 `compile` 不含教师块。

### F-04（major；简化 S07）

**问题**：原始 HTML 的地址改写 `mapHtmlUrls`（parse5 解析片段，改 `src`、`poster`、`href`，从后往前应用）几乎逐行地写了三份，编译器的链接检查另有一份 `htmlAttributes`；web 与 render-slides 还各自包了一层 mdast 遍历。

**证据**：`web/src/node/html.ts:20`、`render-slides/src/node/markdown.ts:46`、`render-notebook/src/domain/markdown.ts:34`、`compiler/src/published.ts:158`。

**修法与验收**：按 C-2。kernel 导出 `mapHtmlUrls`、`htmlAttributes`，并让 `LowerOptions.urls` 同时映射原始 HTML 的属性，渲染端只传一个地址映射；编译器删除自己的副本，89e、89f 删除渲染端的副本。现有的 web、render-slides、render-notebook 资源用例与 publish-checks 用例全部通过；合并后 `grep -rn "function mapHtmlUrls\|function htmlAttributes" packages` 只有 kernel 中的一处。

### F-05（major；简化 S08，N-08）

**问题**：降权写了三份：`server/src/trust.ts:83` 的 `dropPrivileges` 不调用 initgroups；agent-host 的 `becomeUser` 做 initGroups、setgid、setuid 与 assertUnreadable；serve 在 `startServer` 的降权上另外补了 `initGroups`。gateway 命令（`cli/src/cli.ts:328`）从 `@presmium/workspace` 导入 `becomeUser`，而 gateway 属于 `@presmium/server`。agent-host 还重新声明了 `hostnameOf`、`LOOPBACK`、`sameSecret`、Bearer 正则、`HttpError`、`body` 与 `send`。

**证据**：`workspace/src/node/agent-host.ts:60-121`、`workspace/src/node/serve.ts:320-323`、`server/src/trust.ts:83`、`server/src/http.ts:40`。

**修法与验收**：按 C-5。`dropPrivileges` 补上 initgroups 与 assertUnreadable，并与 HTTP 辅助函数一起导出；gateway 命令改用它；89c 删除 `becomeUser`、`initGroups` 与 agent-host 的副本。`packages/workspace/test/deploy.test.ts`（compose）与 `server/test/gateway.test.ts` 通过，降权后的进程的补充组与 `/etc/group` 一致。

### F-06（major；简化 S09，N-08）

**问题**：SHARED 模式的 git 加固写了两份：`workspace/src/node/git.ts:22-50` 有 SAFE_CONFIG、ISOLATED_CONFIG、EMPTY_TREE、`environment()` 与最低版本检查（git ≥ 2.42，`GIT_ATTR_SOURCE`）；`addon-assistant/src/node/git-review.ts:54-69` 有自己的一份，没有版本检查，`core.quotepath` 的位置也不同。

**证据**：两处的 `EMPTY_TREE` 定义（`git-review.ts:59`、`git.ts:29`）。

**修法与验收**：按 C-2。kernel 导出纯数据与 `gitIsolatedEnv(dirs)`，两个运行方由它构造 argv 与 env，git-review 也执行版本检查（89c）。`addon-assistant/test/review.test.ts` 与 `workspace/test/deploy.test.ts` 通过；低于最低版本的 git 在 git-review 中得到与工作区相同的错误。

### F-28（minor；简化 S10）

**问题**：每个渲染端各自包装 `ctx.localAsset` 的复制与地址：网页用 `urlPath(name)`，目录用 `/index.html`；notebook 用 `encodeURIComponent`，目录用 `/`；幻灯片用 `encodeURIComponent`、`/index.html` 与异步 `cp`。三处都重新 `stat` 结果以判断是不是目录，各有自己遍历 LINKED 节点的 mdast 代码（web 的 `LINKED` 重复了 `compiler/src/links.ts:40`）。

**证据**：`web/src/node/publish.ts:32-130`、`render-notebook/src/node/media.ts:18-28`、`render-slides/src/node/slidev.ts:322-343`。

**修法与验收**：按 C-2：`localAsset` 返回 `directory`，kernel 提供 `publishedUrl`、`copyPublished`，与 F-04 的单一地址映射一起使用，各渲染端只提供自己的前缀（89e、89f 迁移）。现有的资源用例（web、render-slides、render-notebook，含畸形转义与目录链接）全部通过。

### F-29（minor；简化 S11）

**问题**：gateway 的 `/tokens` 有两个客户端（`server/src/server.ts:475-492` 与 `workspace/src/node/agent-client.ts:73-95`）；四个插件调用点手写 `${gateway.url}/<plugin>/…` 与 Bearer 头，只有语音的设了 `redirect: 'error'`。`startServer` 是一个 385 行的闭包，混合了认证、路由、MCP 令牌与 gateway 令牌缓存。

**证据**：`addon-assistant/src/node/server.ts:114`、`addon-speech/src/node/remote.ts:17-22`、`addon-speech/src/node/server.ts:29-40`、`addon-exec-jupyter/src/domain/connection.ts:51`。

**修法与验收**：按 C-2、C-5。`GatewayTokens` 与 `gatewayFetch` 由 89b 提供，各组迁移自己的调用点；把 `authenticate`/`identify` 与令牌缓存从 `startServer` 移到各自的模块。`server/test/gateway.test.ts`、`addon-assistant/test/shared.test.ts`、`addon-speech/test/gateway.test.ts`、`addon-exec-jupyter/test/remote.test.ts` 通过；对一个会重定向的上游，四个调用点都失败而不跟随。

### F-30（minor；简化 S12）

**问题**：分词与词时重映射在两个插件中各写一份，`splitWords` 的 CJK 与字母正则相同；`writtenWords` 的两份边界判断不同（`<` 与 `<=`），分组方式也不同。

**证据**：`addon-lecture/src/domain/words.ts:28,95-127`；`addon-speech/src/domain/words.ts:13,84-122`。

**修法与验收**：按 C-2。kernel 提供 `splitWords`、`remapWords`，89d 让两个插件改用它们；语音插件需要去掉首尾空白的文本时，从结果映射得到。`addon-lecture/test/script.test.ts` 与 `addon-speech/test/speech.test.ts` 通过，并各加一个 `{say}`、词典替换处于句末的例子，断言两边给出相同的词时。

### F-31（minor；简化 S13）

**问题**：按 IR 运行时的 DOM 约定（`[data-section] .pm-block[data-block]`、`<section>/<block>` 在最后一个 `/` 处拆开、`3-5,7` 解析为行号）在页面上找块，这段代码复制在 addon-guide 与 addon-lecture 中，并在 `drift.ts`、`plan.ts:129`（选择器没有经过 `CSS.escape`）与 `EditPanel.vue:66` 中手写。可见性规则不同：guide 跳过 `[inert]`，lecture 跳过 `[inert], .pm-hidden`。

**证据**：`addon-guide/src/client/adhoc.ts:33-62`、`addon-lecture/src/client/blocks.ts:9-67`。

**修法与验收**：按 C-3。host 导出这组函数，统一可见性规则；各组替换副本。`e2e/guide.spec.ts`、`e2e/lecture.spec.ts`、`e2e/assistant-edit.spec.ts` 通过；在 89d 的用例中，章节 ID 含引号或空格时，讲授的 spot 仍能找到块。

### F-32（minor；简化 S14）

**问题**：`addon-publish/src/node/web.ts:19-72` 与 `addon-lecture/src/node/export.ts:47-62,146-211` 各有一个静态文件服务器（MIME 表、路径穿越检查、目录对应 index.html、404）与一个 playwright-chromium 的查找函数，两个查找函数的行为不一致：publish 只在文稿的 node_modules 中找，lecture 回退到自己的包。

**证据**：两处的 `chromium()` 函数（`web.ts:64`、`export.ts:201`）。

**修法与验收**：按 C-4。编译器导出 `serveDirectory`、`playwrightChromium`；89d、89e 删除副本，讲授把编码页作为 `extra` 路由传入。`addon-publish/test/diff.test.ts`（网页一轮）与 `addon-lecture/test/video.test.ts` 通过。

### F-33（minor；简化 S15）

**问题**：JSON 响应的辅助函数写了 8 次（两处没有 `no-store`），`problem(status, msg)` 写了 3 次。

**证据**：`server/src/http.ts:53`、`workspace/src/node/routes.ts:26`、`addon-lecture/src/node/routes.ts:66`、`addon-speech/src/node/errors.ts:13`、`addon-speech/src/node/consent.ts:71`、`addon-assistant/src/node/server.ts:56`、`addon-assistant/src/node/gateway.ts:19`、`addon-exec-jupyter/src/node/server.ts:75`。

**修法与验收**：按 C-2，各组迁移。合并后各插件的路由响应都带 `Cache-Control: no-store`（在一个插件路由的现有用例中断言）。

### F-34（minor；简化 S16，N-08）

**问题**：“凭据变量”的定义有两份且不一致：`compiler/src/execute.ts:267` 为 `/_(?:KEY|TOKEN|SECRET|PASSWORD)$/i`，决定代码在本机规则下能看到什么；`server/src/trust.ts:13` 多了 `_APPID`，决定 SHARED serve 拒绝带着哪些变量启动。`*_APPID` 在本机执行中会被传给代码。

**证据**：两处正则。

**修法与验收**：kernel 导出 `CREDENTIAL_VARIABLE`（取并集，含 `_APPID`），两处都用它。`packages/cli/test` 加一个用例：设置了 `VOLC_APPID` 时，编译时运行的代码块读不到它。

### F-35（minor；简化 S17）

**问题**：stderr 日志器手写了 4 次，`debug` 都是空操作、不看 `PRESMIUM_DEBUG`；`prefixed(log, id)` 在 `server.ts:672` 与 `kernel/src/kernel.ts:187` 原样复制。编译器已有处理 `PRESMIUM_DEBUG` 的 `pluginLogger(id)`。

**证据**：`server/src/server.ts:242`、`server/src/gateway.ts:55`、`workspace/src/node/serve.ts:77`、`workspace/src/node/agent-host.ts:53`。

**修法与验收**：按 C-2、C-5。kernel 导出 `prefixed`，server 删除副本；四处日志器改用 `pluginLogger(...)`（89c 迁移 serve 与 agent-host）。`PRESMIUM_DEBUG=1` 时 `presmium serve` 输出 debug 行（在 `cli/test/serve.test.ts` 中断言）。

### F-36（minor；简化 S18）

**问题**：`escapeHtml` 在编译器、render-slides、addon-content 中各有一份，kernel 的 `markdown.ts:92` 中还有一份私有的，`addon-exec/setup/code-runners.ts` 中有一个不转义引号的变体（这正是 F-20 的根源之一）；webgpu 的 domain 重新声明了 kernel 已有的 `isRecord`。

**证据**：`compiler/src/published.ts:77`、`render-slides/src/node/markdown.ts:32`、`addon-content/src/domain/media.ts:108`、`addon-exec-webgpu/src/domain/params.ts:65`。

**修法与验收**：按 C-2。kernel 导出 `escapeHtml`（转义引号），各组替换。`grep -rn "function escapeHtml\|const escapeHtml" packages --include=*.ts` 合并后只剩 kernel 中的一处（vscode 扩展与 student-site 的副本一并替换）。

### F-37（minor；简化 S19，N-07）

**问题**：界面文字绕过 `deckLocale` 与各包的文本目录：`workspace/src/node/execution.ts:132` 用 `!lang || lang.startsWith('zh')` 的三元式写编译审批的标题；`server/src/console.ts:26,55` 的所有者控制台在服务端与页面脚本中都用 `startsWith('zh')` 选择中英文。

**证据**：两处代码。

**修法与验收**：server 增加自己的 zh-CN、en 文本目录，控制台用 `deckLocale(lang)`，页面脚本用 kernel/contracts 的 `localeOf`；89c 把 execution.ts 的标题移进 workspace 的文本目录。`lang: fr` 的工作区中，审批标题与控制台为英文（在 `cli/test/serve.test.ts` 中断言）。

### F-38（minor；核心评审，N-08、P-110）

**问题**：`get_classroom` 与 `get_position` 采用任何窗口的报告，包括读者的，并取最新的一份。每个页面都登记课堂 STATUS，并在通道打开时报告，所以一个后来打开页面的普通读者会用空闲状态覆盖教师的实时摘要。读者还可以声称自己的角色是 `presenter`，其他成员的 agent 于是读到这个读者的位置。

**证据**：`server/src/control.ts:175-204`（`positions`、`status`）。探针 `review-core/probe-control.mjs`：`get_classroom sees: {"presmium.classroom":{"status":"idle",…}}`，而所有者的演讲者窗口报告的是 live；`get_position` 返回 `"member":"student@x","role":"presenter"`。

**修法与验收**：`status()` 只取编辑者与所有者窗口的摘要，演讲者窗口优先；`positions()` 中编辑者与所有者的放映窗口排在其他窗口之前，读者声称的 presenter 角色对其他成员不计。`packages/server/test`：读者后打开页面时 `get_classroom` 仍是教师的摘要；读者声称 presenter 时，编辑者的 `get_position` 不返回它。

### F-39（minor；核心评审，P-101、N-08）

**问题**：SHARED 模式下 `Compilation.run` 把一个会话的请求并发发往 agent-host；每个 `AgentHostClient.run` 先取 gateway 令牌，到达顺序取决于网络时序，`run_code` 的会话块可能乱序运行，得到 NameError 或错误输出。本机执行器按调用顺序同步排队，远端路径没有。

**证据**：`compiler/src/compiler.ts:558`（`Promise.all(requests.map(...remote.run...))`）。探针 `review-core/probe-session.mjs`：两个请求同时开始，`print(1 + 1)` 先于文档中先运行的块到达。

**修法与验收**：有 `remote` 且运行带会话时逐个 `await remote.run`，然后 `endSession`。`packages/cli/test` 中以一个有延迟的远端（真实的 agent-host 或其测试替身进程）运行三块会话代码，结果与顺序运行一致。

### F-40（minor；核心评审，P-121）

**问题**：`presmium serve` 从不把文档的服务端贡献从 `mounted` 表中去掉，只在挂载失败时去掉。删除或重命名之后，插件路由仍为被删除的目录应答（例如 `ctx.deckDir` 已不存在的助手任务）；在同一目录重新创建的文档沿用第一份文档的贡献与冻结的 `presmium.<id>` 配置；贡献的 `close()` 只在关闭服务时运行。

**证据**：`server/src/server.ts:297-336`；`workspace/src/node/serve.ts:213-221` 的回调只关闭会话。

**修法与验收**：按 C-5、C-7。`PresmiumServer.unmount(dir)` 关闭贡献，从 `mounted` 与 `loaded` 中删去该目录，并吊销它的代理令牌；89c 在 `documentsChanged` 中调用它。`cli/test/serve.test.ts`：删除文档后它的插件路由得到 404；以不同配置在同一目录重新创建后，新配置生效。

### F-41（minor；核心评审，P-110、P-55）

**问题**：`get_position` 把窗口报告的幻灯片序号（按该窗口自己视图的章节计数）用在调用者的视图上。学生视图会重新编号章节：一个 tutor 令牌（学生视图）的学习者没有放映窗口时，回退到教师的演讲者窗口（完整视图），报告的是另一个章节；教师专用章节的序号还会被映射到无关的学生章节，而不是返回 null。

**证据**：`mcp/src/mcp.ts:87-104`（`doc.sections.find(s => s.index === found.slide)`）。

**修法与验收**：按 C-3。窗口报告与 `WindowPosition` 带上当前章节 ID；`position()` 在调用者的视图中按 ID 找章节，找不到时返回 null。`packages/mcp/test/mcp.test.ts`：教师窗口停在教师专用章节时，tutor 令牌的 `get_position` 返回 `section: null`；停在其后的章节时返回同一章节 ID。

### F-42（minor；插件评审，正确性，K-19）

**问题**：编译时的会话只按文稿写的名字（`:session: main`）区分。Python 与脚本执行器每个进程共用一个 `childRuns`，所以在同一进程中编译的两份文档（`presmium serve`、agent-host）共用一个解释器：后一批先在后一次运行的上下文中重放另一份文档的历史，A 的失败块会让 B 的块变成“Not run: an earlier block…”。

**证据**：`compiler/src/execute.ts:409-412` 直接用 `unit.session`，而 `Compiler.runCode` 用 `run:<uuid>`。探针 `review-plugins/exec/probe-sessions.mjs`：B 的 `print(globals().get("secret_of_a"))` 输出 `A-ONLY-VALUE`。

**修法与验收**：`execute.ts` 按编译给会话加命名空间（`compile:<uuid>:<session>`），`endSession` 与请求都用它。`packages/cli/test`：在一个进程中依次编译两份用同名会话的文档，B 看不到 A 的变量，A 的失败不影响 B。

### F-43（minor；插件评审，正确性，P-81）

**问题**：预览子进程的 `exit` 处理总是执行 `this.#urls.delete(entry)`。启动超时或失败时，`open()` 在旧子进程 A 收到 SIGTERM 退出之前就启动了新的子进程 B，A 的退出删掉了 B 的条目；下一次 `open()` 于是为同一文稿再启动一个 `presmium dev`，两个进程写同一个 `.presmium/preview`。

**证据**：`language-server/src/node/preview.ts:94-98`。

**修法与验收**：只在条目仍是本次启动的 promise 时删除（`if (this.#urls.get(entry) === url) this.#urls.delete(entry)`）。`language-server/test/lsp.test.ts`：第一次启动超时后再打开两次，只运行一个 `presmium dev`。

### F-44（minor；P-54 外部链接检查）

**问题**：装了 lychee 时，`--external-links` 把每个外部 URL 作为 lychee 的输入，lychee 把它当作要抓取并扫描的页面：一个可访问的页面中自己的外链失败时，被报告为讲义第 1 行的坏链接；讲义中的死链使 lychee 以“Cannot read input content from URL: status code 404”中止，不输出 JSON，presmium 只在 `lecture.md:1` 报告一条笼统的警告。lychee 这条路径没有测试。

**证据**：`compiler/src/links.ts:191`。探针 `accept-publish-classroom/lycheck.mjs`、`lystdin.mjs`：经 stdin 传入时 lychee 只报告 `/missing-page`。

**修法与验收**：经 stdin 每行一个 URL 传给 lychee（`lychee --format json --no-progress -`），照旧通过 urls 表映射回源码行。`packages/cli/test/publish-checks.test.ts` 加一个用例：PATH 上放一个记录 argv 与 stdin 的假 lychee 脚本（或在装有 lychee 时用真实的 lychee），配一个本地 HTTP 服务：死链报告在它自己的行上，可访问页面的外链不被报告。

### F-45（minor；P-100 具名环境的诊断）

**问题**：代码块的语言不在环境的 `languages` 中时（包括经默认的 `execute.env` 选中的环境），诊断说“没有执行器”，而执行器其实存在，诊断也不指出语言不符。

**证据**：探针 `accept-content-exec/e2`（`execute.env: wasm`，`languages: [c]`）：ruby 与 python 块报告 `no executor for presmium.env.wasm and no recorded output…`。

**修法与验收**：`compiler/src/environments.ts` 在路由之前核对块的语言与环境声明（或探测得到）的语言，在块所在行报告“环境 wasm（kind wasi）运行 c，不运行 ruby；换一个 :env: 或在环境中加入该语言”。`packages/cli/test/env.test.ts` 断言这条诊断的文字与行号。

### F-46（minor；分层，architecture 第 3 节）

**问题**：结构检查不执行两条有文档的规则：(1) server 与 mcp 不得依赖浏览器包（`@presmium/viewer`、`@presmium/web`、`@presmium/host`）；(2) IR 运行时的浏览器代码（`packages/viewer/src`）没有禁止 `@slidev/*` 的规则，因为组件规则只扫描 `components/` 与 `src/client/`。目前没有违反，但回退不会被发现。

**证据**：`architecture.md:98,102`；`scripts/check-layering.mjs:58`。探针：在 `packages/mcp/src` 中导入 `@presmium/viewer`、`@presmium/host`，在 `packages/viewer/src` 中导入 `@slidev/client`，检查都输出 `layering ok`（探针已删除）。

**修法与验收**：server、mcp 的规则另禁止 `/^@presmium\/(viewer|web|host)(\/|$)/`；增加规则“IR runtime is form-neutral”（pkgs `['viewer']`，dirs `['src']`，禁止 `@slidev/` 与 vitepress）。`packages/cli/test` 加一个用例，在副本中放入上述探针，断言检查退出码为 1 并点名规则。

### F-47（minor；P-82 技能一致性检查）

**问题**：“检查脚本在不存在的命令或缺失的指令上失败”这条验收没有集成测试，`check-skills.mjs` 只在当前一致的技能上运行。指令检查是子串检查（`text.includes('{name}')`）：删掉某个指令的小节标题，只要示例代码中还提到它，检查照样通过。

**证据**：`scripts/check-skills.mjs:135`。探针 `accept-media-site/skillcheck.sh`：把标题 `` ### `{quiz}` `` 改为 `` ### `{quizz}` `` 后退出码为 0。

**修法与验收**：每个声明的指令要求一个参考小节标题（匹配 ``/^### .*`\{name\}`/m``）。`packages/cli/test` 加一个用例：在技能的镜像副本中分别放入未知命令、未知选项与删掉的指令小节，各自退出码为 1 并点名问题。

## WP-89c（工作区与助手）

拥有：`packages/workspace/**`、`packages/addon-assistant/**`、`packages/addon-deltabox/**`、`templates/workspace/**`、`templates/document/**`、根目录 `package.json`、`e2e/assistant.spec.ts`、`e2e/assistant-edit.spec.ts`、`e2e/workspace.spec.ts`、`e2e/fixtures/{assistant,assistant-edit,workspace}/**`

本组在约定中使用或实现的接口：C-2（git 常量、`gatewayFetch`、`json`、`problem` 的迁移）、C-3（`EditPanel.vue`、`trackAgentTask`）、C-4（serve 改用 `runBlock`、`buildView`、`Compilation.check`）、C-5（降权与 HTTP 辅助函数、`GatewayTokens`、日志器）、C-6（`DOCUMENT_LOCKS` 的提供与使用、`AgentTask.revert` 的实现）、C-7。

### F-07（major；安全，P-55、D8）

**问题**：tutor 运行时（学习者的提问，以及主讲对学习者问题的“AI 回答”）保留了 DeepSeek Harness 自己的文件工具：`tool-fs` 的读取与 `tool-fs-search`（grep、glob）都启用，会话的工作目录是文稿目录。读取不需要许可，目录内外都能读。tutor 因此读到文稿源码（全部 `:audience: teacher` 块、答案、隐藏测试），以及进程能读到的其他文档（SHARED 中是 agent-host 沙箱中挂载的全部文档）。这破坏了“读者与 tutor 令牌经 MCP 也只读学生视图”的保证（architecture 10.3 与第 11 节）。

**证据**：`addon-assistant/dsh/presmium-tutor.cordis.yml:25-28`；`addon-assistant/src/node/server.ts:222`（`session(task, ctx.deckDir, …)`）。探针 `review-plugins/tutor/probe-tutor.mjs`：假模型请求读 `lecture.md` 与 `../other/notes.md`，工具结果为 `TEACHER-ONLY-SECRET the quiz answer is option B.` 与 `OTHER-DOCUMENT-SECRET grading rubric`，没有询问许可，任务以 `done` 结束。

**修法与验收**：在 tutor 模板中禁用 `tool-fs`、`tool-fs-search`，以及能读文件的 `tool-working-directory`、`tool-skill`，使 tutor 只经 Presmium 的 MCP（`tutor` 令牌，学生视图）读文稿；提问会话在每个任务各自的空临时目录中运行，不再用 `ctx.deckDir`（决定 D-13）。`addon-assistant/test/dsh.test.ts` 用 `--dump-config` 断言这些行被禁用；`probe-tutor.mjs` 改写为测试：读源码的工具调用不存在或被拒绝，模型收到的工具结果中没有教师句子。

### F-08（major；安全，N-08）

**问题**：`POST tasks`（reader 角色）每个问题启动一个 agent 会话，没有每个成员或每个服务的上限。每个会话是一个 DeepSeek Harness 进程（SHARED 中在 agent-host 内）加上付费的模型调用，页面离开后问题仍在运行；只有变更审阅有无人值守的超时。agent-host 的 `/v1/sessions` 也没有上限。任何登录的学习者都能耗尽 agent-host 的内存与进程，并在循环中花掉运营者的模型预算。

**证据**：`addon-assistant/src/node/server.ts:290-293`；`workspace/src/node/agent-host.ts:492`。探针 `review-plugins/tutor/probe-flood.mjs`：15 个 POST 得到 15 个 201，15 个 agent 进程同时运行。

**修法与验收**：每个成员至多同时运行 N 个问题任务，全服务的总数可配置（`settings.presmium.assistant.maxQuestions`，默认见决定 D-13），超出时返回 429；没有页面跟随一段时间的问题任务被取消（复用变更任务的 `attended` 机制）；agent-host 限制并发会话数。`addon-assistant/test/acp.test.ts`：同一成员的第 3 个问题得到 429，关闭跟随的页面后任务在超时内被取消；`workspace/test/agent-host` 相关用例断言会话上限。

### F-09（major；P-115、N-08）

**问题**：工作区自己的文档操作（重命名、复制、删除）与修改历史的撤销，不检查同一文档上正在运行或等待审阅的变更任务；只有助手自己的 `revert` 路由检查它的 `changing` 表。后果是：(1) 在 agent 任务等待审阅时重命名文档，重命名的提交带上了 agent 尚未审阅的文件，之后拒绝审阅失败；(2) 使用 git 审阅时（内置 DSH 与 SHARED 总是如此），审阅期间所做的撤销在拒绝审阅时被悄悄还原到工作树。SHARED 中任何编辑者都能在另一编辑者的任务等待时这样做。

**证据**：`workspace/src/node/routes.ts:64-103`；对比 `addon-assistant/src/node/server.ts:333-345`。探针 `accept-agent/excl-probe.mjs`（日志 `excl-git.log`、`excl-deltabox.log`）：重命名的提交中有 `A intro2/notes.md`，随后的拒绝以 `git add: fatal: pathspec 'intro' did not match any files` 失败；撤销之后拒绝审阅使 `lecture has C1: true`，而 HEAD 是 `Revert …`。architecture.md:1266 与 WP-81e1 的交付说明都记着这一缺口。

**修法与验收**：按 C-6。serve 提供 `DOCUMENT_LOCKS`；变更任务在运行与等待审阅期间持有其文档的锁；`documents.apply` 对持锁文档的重命名、删除与复制（包括作为复制源）返回 409；`revisions/revert` 在提交涉及持锁文档时返回 409；文档操作或撤销进行时，助手拒绝该文档的新任务。`e2e/assistant-edit.spec.ts`：审阅期间的重命名与历史面板的撤销都得到 409，之后审阅仍能干净地接受与拒绝。

### F-10（major；P-121 文档管理，示例工作区 README 第 1、6 步）

**问题**：从修改历史撤销文档操作，文件被还原、撤销也提交了，但运行中的服务从不刷新它的文档列表：首页仍列出旧目录（打开得到 500 “no document "bpe-intro"”），被还原的目录显示 404 页面，直到 serve 重启或下一次文档操作。在磁盘上新增的文档（编辑器或 git pull）也因此不被列出。

**证据**：`workspace/src/node/routes.ts:94-104`（撤销路由不触发刷新），`serve.ts:198-225` 只在 Documents 回调中调用 `refreshSpec()` 与 `site.documentsChanged()`。探针 `accept-media-site/probe-local.mjs`、`probe-newdoc.mjs`，`accept-ux-demo/wshome.mjs`（截图 `wsshots/home-after-undo.png`）。`workspace/test/documents.test.ts:81-89` 只检查磁盘上的文件。

**修法与验收**：按 C-7。撤销成功后比较撤销前后的 `listDocuments(config)`，调用 `documentsChanged({ removed, added })`；可选地监视文档位置的模式，发现作者新建的文档。`e2e/workspace.spec.ts`：重命名后从历史撤销，首页列出原来的目录且其页面正常显示；创建后撤销，首页不再列出该文档；磁盘上新建的文档在一次请求之后出现在首页。

### F-11（major；简化 S02，正确性）

**问题**：addon-assistant 中路径包含的判断写了四份，workspace 的 agent-host 中还有第五份（`below`）。五份都用 `!rel.startsWith('..')`，而不是编译器 `inside` 的 `rel !== '..' && !rel.startsWith('..' + sep)`，所以名字以 `..` 开头的子项（如 `..notes.md`）被当作在目录之外：审阅、许可与变更的范围判断都错。

**证据**：`addon-assistant/src/node/git-review.ts:107`、`changes.ts:52`、`server.ts:64`、`permissions.ts:43`；`workspace/src/node/agent-host.ts:69-71`。

**修法与验收**：addon-assistant 增加 `src/node/paths.ts`，导出与编译器同一语义的 `inside(path, dir)`，四个文件改用它；agent-host 从 `@presmium/compiler` 导入 `inside`，删除 `below`。`addon-assistant/test/review.test.ts`：agent 写 `..notes.md` 后，它出现在审阅中且可以接受与拒绝；在文稿之外写同名文件仍被拒绝。

### F-48（minor；P-111、P-112、K-07，WP-89a 已知缺口 2）

**问题**：任何列出助手插件的文稿，其静态构建的每个页面都在控制台报错 `[presmium] presmium.assistant failed to start Error: declared but did not provide: presmium.agent`，演讲者的启动报告显示 `presmium.assistant=failed`：浏览器插件无条件声明 `provides: [AGENT]`，没有服务端时却直接返回。这影响 D17 下读者得到的静态学生站点与示例工作区的文档，示例讲义也因此不能列出助手。

**证据**：`addon-assistant/src/client/plugin.ts:27-33`；`kernel.ts:125-126`。三份报告的探针：`accept-kernel-principles`（`glance` 的静态构建）、`accept-media-site/probe-wsite.mjs`、`accept-agent/static-probe.mjs`。

**修法与验收**：没有服务端时提供一个 `available()` 返回 false、`provider()`/`runtime()` 返回 undefined、不登记界面的 AGENT 客户端（契约已允许使用方降级）。`e2e/assistant.spec.ts` 加一个静态构建用例：列出助手的文稿没有控制台错误，启动报告中助手为 started，页面上没有“提问”。示例讲义列出助手由 89f 做（C-8）。

### F-49（minor；6.12 验收第 1 条，P-110）

**问题**：在 DeepSeek Harness 中挂载 Presmium 的 MCP 后列出章节、读讲解与代码、运行代码、移动放映——这一验收手工验证通过，但没有自动化用例驱动内置 DSH 走完 `list_sections`、`run_code`、`navigate`；唯一经过 DSH 与 MCP 的用例只调用一次 `get_section`。

**证据**：`grep -rn mcp__presmium__ packages/*/test e2e` 只有 `addon-assistant/test/shared.test.ts:102`。手工探针 `accept-agent/dsh-probe.mjs`（日志 `dsh-probe.log`）。

**修法与验收**：把 `dsh-probe.mjs` 改写为 `addon-assistant/test/dsh.test.ts` 中的用例：假模型依次调用 `mcp__presmium__list_sections`、`get_section`、`run_code`、`navigate`，用一个控制通道窗口（`packages/mcp/test/client.ts`，只读使用）回答两次许可；断言模型收到的工具结果（章节、讲解与代码、stdout `42`）与窗口收到的 `go` 事件。

### F-50（minor；P-111，D11）

**问题**：根目录的 `engines` 仍为 `>=22.18`，addon-assistant 没有声明 `engines`，而锁定的 DSH 需要 Node 22.19 或更高。设计写明合并时提高，但没有做。

**证据**：`package.json:7`；`docs/design-v0.7.md:702`；`vendor/docs/dsh/docs/development.md:11`。

**修法与验收**：根目录与 `packages/addon-assistant/package.json` 的 `engines.node` 设为 `>=22.19`；`packages/cli/package.json` 的同一字段由 89b 一并修改（写在 89b 的合并说明中）。`pnpm install --frozen-lockfile` 在合并后通过。

### F-51（minor；P-115 审阅只含 agent 对源码的修改）

**问题**：`presmium serve` 中 MCP 的 `build` 工具把输出写在文档目录中（`<doc>/dist`）。agent 在变更任务中构建时，这些输出作为 agent 的修改出现在审阅中，接受后被提交。工作区模板没有 `.gitignore`；示例的 `try.mjs` 自己写了一份，所以示例掩盖了这个问题。

**证据**：`workspace/src/node/serve.ts:273`（`outDir: join(compilation.deckDir, 'dist')`）；`templates/workspace` 没有 `.gitignore`；`examples/workspace/try.mjs:42-53`。探针 `accept-agent/tmpl-probe.mjs`：审阅列出 `["course/dist/ir.json","course/notes.md"]`。

**修法与验收**：`ServerHost.build`（MCP `build`）写到 serve 的状态目录中、文档之外，并报告这个路径；`templates/workspace/.gitignore` 带上 `try.mjs` 写的规则（`node_modules`、`dist/`、`**/.presmium/*` 与 freeze、`anchors.lock.json`、drawings、assets、speech 的例外），模板 README 提醒运营者复制它。`e2e/assistant-edit.spec.ts`：agent 在变更任务中调用 `build` 后，审阅只列出它改的源码文件。

### F-52（minor；P-133 可复现，P-121）

**问题**：在工作区中复制文档时，`.presmium` 中只保留 `anchors.lock.json`，提交了的合成缓存与 `speech.lock.json`（以及 `freeze/`、drawings、assets）都被丢掉：副本要重新合成（计费），也不再可复现。

**证据**：`workspace/src/node/files.ts:219-222`；根目录 `.gitignore` 把 `!**/.presmium/speech/` 与 `speech.lock.json` 作为文稿内容保留。探针 `accept-lecture-speech/copydoc.mjs`。

**修法与验收**：`sourceEntries` 保留根目录 `.gitignore` 所保留的 `.presmium` 部分（`freeze/`、`drawings/`、`assets/`、`speech/`、`speech.lock.json`、`anchors.lock.json`），只跳过生成的项目。`workspace/test/documents.test.ts`：复制后的文档保留这些文件，内容字节相同。

### F-53（minor；核心评审，P-114、P-115）

**问题**：agent-host 的 `/v1/sessions/<id>/prompt` 不会发现 serve 已断开：它先读完请求体（这会销毁 IncomingMessage 并触发其 `close`），之后才挂上 `req.once('close', abort)`，这个监听永远不会触发。serve 中止提示时 ACP 的 `cancel` 从不发送，50 ms 的刷新一直向已关闭的响应写入，直到 agent 结束或 serve 的 DELETE 杀掉会话。

**证据**：`workspace/src/node/agent-host.ts:518-520`。探针 `review-core/probe-close.mjs`：`body read; req.destroyed=true`，`res 'close' fired after 6 ms`，`req` 上后挂的监听没有触发。

**修法与验收**：改为 `res.once('close', () => { if (!res.writableEnded) controller.abort() })`。`packages/workspace/test` 中对 agent-host 发起一个提示后断开连接，断言脚本化的 ACP agent 收到 `cancel`，刷新定时器被清除。

### F-54（minor；简化 S20）

**问题**：几个导出在仓库中（含测试与文档）没有任何引用：`dshVersion`（`addon-assistant/src/node/launch.ts:45`）、`VIEWS`（`workspace/src/node/audience.ts:15`）、`opusComments`（`addon-speech/src/node/audio/ogg.ts:119`）、`infoEntries`（`addon-speech/src/node/audio/riff.ts:69`）。

**证据**：`review-simplify/dead.mjs` 的扫描；本次 grep 确认仍然如此。

**修法与验收**：本组删除 `dshVersion` 与 `VIEWS`。语音的两个读取函数不删除，由 89d 在 F-62 的测试中用来断言 AIGC 标注。合并后再运行 `dead.mjs`，没有这四个名字。

### F-55（minor；N-07 界面语言：修改历史）

**问题**：zh-CN 工作区的“修改历史”显示英文的 git 提交标题（`Rename document bpe to bpe-intro`、`Revert "…"`），日期按浏览器的区域格式化。

**证据**：`workspace/src/node/documents.ts:159-182` 与 `revisions.ts` 生成提交标题；面板的日期来自 `panels.ts:183` 的 `new Date(revision.date).toLocaleString()`。探针 `accept-ux-demo/wsrename.mjs`。

**修法与验收**：历史面板按提交中的结构化来源（`Presmium-Origin` 尾注中的操作与目录）显示本地化的标签，提交标题本身不变；日期用 `currentLocale()` 格式化。`e2e/workspace.spec.ts`：zh-CN 工作区中，重命名与撤销在历史中显示中文标签与 zh-CN 日期，英文工作区显示英文。

## WP-89d（讲授与语音）

拥有：`packages/addon-lecture/**`、`packages/addon-speech/**`、`e2e/lecture.spec.ts`、`e2e/lecture-script.spec.ts`、`e2e/lecture-writeback.spec.ts`、`e2e/fixtures/{lecture,lecture-script,lecture-writeback}/**`

本组使用的接口：C-2（`splitWords`、`remapWords`、`gatewayFetch`、`json`、`problem`）、C-3（块定位函数、`trackAgentTask`）、C-4（`serveDirectory`、`playwrightChromium`、学生视图）、C-5（`Route.maxBody`，见 F-02）、C-6（`AgentTask.revert`、`AgentToolContext.view`）。

### F-12（major；独立安全评审，SHARED，WP-91b）

**问题**：讲授插件的读者路由 `tracks/<id>/<audio|video>/<file>` 与 `tracks/<id>/clips/<hash>` 有检查与使用之间的竞态：`insideDeck()` 用 `realpathSync` 解析一次真实路径，确认它是文稿内、不在 `.git` 下的普通文件；随后 `serveFile()` 按同一路径名重新 `statSync` 与 `createReadStream`，再次跟随链接。这些文件在沙箱可写的文档目录中（architecture 10.5）。沙箱在真实文件与链接之间来回切换最终路径即可赢得竞态，serve（能读 `.git/` 与整个工作区）把链接目标流给读者。这同时绕过了 WP-91 的“serve 不跟随沙箱的链接”与 WP-91b 的静态学生站点边界：讲授媒体由 serve 实时提供，不来自静态构建。

**证据**：`addon-lecture/src/node/routes.ts:84-95,340-347`；`store.ts:90`。在发布的 compose 布局上（git 2.43、Docker 29.3）复现：读者反复请求 `…/tracks/t1/audio/x.ogg`，沙箱以原子改名切换 `x.ogg`，2962 次请求中有 341 次（约 11%）泄漏 `/workspace/.git/config`，2477 次中有 22 次泄漏教师专用的 `/workspace/course/solution.py`。脚本 `security-shared/p3-race.sh`、`p3-race2.sh`。没有竞态时（稳定的链接）正确返回 404。

**修法与验收**：`serveFile` 自己以 `openSync(file, O_RDONLY | O_NOFOLLOW)` 打开，对文件描述符 `fstat`，经 `readlinkSync('/proc/self/fd/' + fd)`（非 Linux 时回退为 realpath 加 dev/ino 比对）确认打开的文件的真实路径在 `realpathSync(deckDir)` 之内、没有 `.git` 段、是普通文件，然后从这个描述符流出字节范围（`createReadStream('', { fd, start, end })`）；否则返回 404。去掉单独的 `insideDeck()` 加按路径 `statSync`。可参照 `workspace/src/node/student-site.ts` 的 `sendFile` 与编译器 `ReadScope.#opened()`。`workspace/test/deploy.test.ts`（compose）加入 `p3-race` 的重放：沙箱持续切换链接，读者请求 3000 次，没有一次得到 `.git/config` 或文稿外的内容；两个路由（媒体与片段）都覆盖。

### F-13（major；P-131、P-134 × P-55，D17；插件评审的讲授受众）

**问题**：讲授插件为读者与 tutor 的回答都从完整 IR 规划：`compiled()`/`latestView` 只按 `only` 筛选，不按受众。(1) 读者路由 `GET tracks/script` 在编辑者合成过讲授后返回它，含教师专用的讲解（文字与音频）；没有引擎能读出音色时返回 502，`unsaidMessage` 引用每句讲解的前 40 个字。(2) `GET tracks/<id>` 原样提供教师专用章节中的录制讲授。(3) MCP 插件工具 `lecture_preview`、`track_narration`、`track_translations` 属于 `read` 类，会提供给 `tutor` 与读者令牌，它们也从 `latestView` 规划，`AgentToolContext` 不带视图。WP-91b 的泄漏扫描只覆盖静态学生站点，发现不了这些。

**证据**：`addon-lecture/src/node/routes.ts:313-345`、`plan.ts:75`、`tools.ts:38`；`mcp/src/mcp.ts:523`。探针 `accept-lecture-speech/leakprobe.mjs`：读者 `GET tracks/script` 得到“答案是四十二，这句只给教师看的讲解。”“整节只给教师：期末考试的第三题就是这个例子。”，`GET tracks/rec` 得到教师章节的转写；`review-plugins/lecture-aud/plan.mjs`：教师章节 `guide` 在这些路径使用的计划中保留 `TEACHER-ONLY-NARRATION…`。对比 `presmium build --audience student --to lecture`（`audbuild.mjs`）正确筛选。

**修法与验收**：按 C-4、C-6。编辑者以下的成员与 `view: 'student'` 的工具上下文，从最新 IR 的学生视图规划并合成 `script`，每个视图各有缓存条目；给读者的录制讲授去掉不在学生视图中的章节或块的话语、事件与音视频段，变空的讲授不列出；`tracks/<id>/clips/<key>` 只给读者被提供的讲授中出现的键；读者得到的错误信息中不引用话语文字。`addon-lecture/test/reader.test.ts` 加入教师专用段落、教师专用章节与该章节中的录制讲授，断言它们的句子不出现在读者的 `tracks`、`tracks/script`、`tracks/<id>`、片段与错误响应中，也不出现在 tutor 令牌调用三个工具的结果中。

### F-14（major；P-131 转写、P-132，体验）

**问题**：转写面板只用词的片段拼句子，所有空格与标点都丢了：每一份英文讲授（录制或合成）都显示为连在一起的词，中文转写失去标点。

**证据**：`addon-lecture/src/client/PlayerPanel.vue:260-261`。探针 `accept-lecture-speech/devprobe.mjs`：显示 `Nowlookattheselinesofcodethenwemergethepair`；截图 `play-1400-playing.png` 中 `ThissectionisnarratedinEnglish…` 溢出面板，`开场白我们用GPU来算` 对应原文 `开场白。我们用 GPU 来算。`。

**修法与验收**：以 `u.text` 为底渲染，把词的片段放进去：从游标处用 `indexOf` 在 `u.text` 中依次找到每个词，词之间的文字（空格、标点）作为普通文本输出；找不到某个词时整句退回普通文本。`e2e/lecture.spec.ts`：英文话语与带标点的中文话语的转写项 `textContent` 等于 `u.text`，点词仍能跳转。

### F-15（major；简化 S04，原则 4 插件之间经服务协作）

**问题**：讲授的写回面板重写了助手的变更任务客户端（`find`、`follow`、`start`、`decide`、`revert` 与 running/review/deciding/done/failed 的状态机），并按插件 ID 写死助手的私有 HTTP 路由（`server.fetch('presmium.assistant', 'revert', …)`），因为 kernel 的 `AgentTask` 契约没有 revert。若另一个插件替换 AGENT 的实现，撤销就会坏掉。

**证据**：`addon-lecture/src/client/writeback.ts:17-18,41-111`；对比 `addon-assistant/src/client/edit.ts:84-197`；`kernel/src/contracts/agent.ts:86-103`。

**修法与验收**：按 C-3、C-6。写回面板经 `presmiumService(AGENT)` 取得任务，用 host 的 `trackAgentTask` 跟随，用 `task.revert()` 撤销；删除 `ASSISTANT` 常量与路由调用（89c 实现 `revert`，89d 合并前变基到 89c）。`e2e/lecture-writeback.spec.ts` 通过（撤销仍然有效）；`grep -rn "presmium.assistant" packages/addon-lecture/src` 无结果。

### F-56（minor；P-130 存储与 P-132 转写，`settings.presmium.lecture.audio` 为外部地址前缀）

**问题**：按文档化的外部地址策略，track.json 把外部 URL 记为 `src`，而录音其实在本机：录制的讲授无法转写（502 “… is not on this machine”），dev 与 serve 下的回放去请求还没有上传的 URL。

**证据**：`addon-lecture/src/node/routes.ts:97-101` 改写 `src`；`lecture.ts:102` 用 `mediaFile()` 解析；`store.ts:69-74` 拒绝绝对路径。探针 `accept-lecture-speech/urlpolicy.mjs`。url 与 lfs 策略都没有测试。

**修法与验收**：track.json 保留相对的 `src`，前缀只在发布时应用（讲授渲染端，以及本机没有文件时的读者路由）；或让 `mediaFile` 在本机文件存在时把 `<prefix><id>/<path>` 映射回 `lectures/<id>/<path>`。`addon-lecture/test/track.test.ts`：在该设置下录制、转写并回放，构建产物中的地址带前缀。

### F-57（minor；N-08 克隆音色的同意，P-133；决定 D-7）

**问题**：同意的检查只在合成时进行。克隆音色的片段一旦进入文稿的缓存，运营者设 `cloned: false` 或删除同意记录之后仍然被发布，构建没有任何诊断：撤回的同意从不生效。WBS WP-82 把它记为偏差，但没有补偿的检查。

**证据**：探针 `accept-lecture-speech/clonedprobe.mjs`、`revoke.mjs`：撤回后 `presmium build --to lecture` 以 0 退出、报告没有问题，`dist/lecture/script/track.json` 用音色 cloned-lin 发布。

**修法与验收**：缓存命中且 `<key>.json` 为 `cloned: true` 时，在语音服务的查询中（Node 端与 gateway 都要）执行同样的检查（运营者设置加上运营者目录中的同意记录），以相同的信息拒绝，使构建、检查与路由都报告它。`addon-speech/test/speech.test.ts`：有同意时合成，删除记录后缓存命中被拒绝。

### F-58（minor；P-135 视频导出）

**问题**：导出的视频每一帧都带着放映视图的导航条（计数与上一步、下一步、总览、演讲者窗口、全屏、退出放映按钮），而视频是给只接受视频的平台用的。

**证据**：帧截图 `accept-lecture-speech/frame-4800.png`；导航条为 `.pm-present__bar`（`viewer/src/present.ts:318-325`），addon-lecture 中没有隐藏它的代码。

**修法与验收**：导出模式（`src/client/state.ts` 的 `exporting`）下用 CSS 隐藏 `.pm-present__bar` 与录制层，或在 `export.ts` 步进之前 `page.addStyleTag`。`addon-lecture/test/video.test.ts`：导出页面没有可见的 `.pm-present__bar`。

### F-59（minor；P-131 回放界面与 N-08 的 AI 标注）

**问题**：聚光灯生效时 driver.js 的遮罩位于讲授播放器之上：播放条、章节与转写面板以及“AI 合成语音”标注都被压暗，白色的聚光区还盖住侧栏的一部分。导出帧中 AI 标注也在遮罩下。

**证据**：截图 `accept-lecture-speech/devplay-700.png`、`frame-4800.png`；播放器 `z-index: 4`（`PlayerPanel.vue:335,391,407,480`），遮罩为 `--pm-cue-z`（`web/src/client/style.css:167`、`addon-guide/src/client/spotlight.css:6`），讲授标记层已用 `calc(var(--pm-cue-z) + 2)`（`marks.ts:64`）。

**修法与验收**：播放条、侧栏、字幕与 AI 标注用 `z-index: calc(var(--pm-cue-z, 1) + 3)`。`e2e/lecture.spec.ts`：spot 期间在 AI 标注中心 `elementFromPoint` 得到标注本身。

### F-60（minor；P-137 译文过期标记）

**问题**：播放器把过期的译文与当前译文一样显示在字幕与转写中；过期只在 VTT 导出、构建警告与 MCP 工具中报告。

**证据**：探针 `accept-lecture-speech/lang.mjs`：u2 的 en 译文过期，构建警告存在，选英文时字幕 `Next, the merge function` 没有任何标记；`PlayerPanel.vue:192-193` 的 `text()` 不检查原文摘要。

**修法与验收**：客户端比较 `translations[lang].source` 与 `u.text` 的 sha256，过期的句子加标记（`data-stale` 与提示），或退回原文。`e2e/lecture-writeback.spec.ts` 或 `lecture.spec.ts` 断言过期句子带标记。

### F-61（minor；P-131，WP-89a 已知缺口 4）

**问题**：讲授视图无条件注册：任何列出讲授插件的文稿的网页构建（包括示例讲义默认的 `pnpm demo:build`）都在视图菜单中提供“讲授”，打开只显示“这份讲义还没有讲授”，没有站点外壳，控制台有一条 `lecture/index.json` 的 404。

**证据**：`addon-lecture/src/client/viewer.ts:17`。探针 `accept-lecture-speech/noview.mjs`；体验报告 `shots/light-d1440-lecture.png`，`shots/report.json` 在 4 个视口都记录了这条 404。

**修法与验收**：只在有讲授时提供这个视图：编译时记下讲授存在（讲授渲染端运行过或有 `script`，例如 IR 元数据中的一个标志），没有时不登记视图、不请求 `index.json`；服务端形态按 `GET tracks` 判断。`e2e/lecture.spec.ts`：只有网页的构建中视图菜单没有“讲授”，控制台没有 404；有讲授的构建照常提供。

### F-62（minor；P-130、P-133、P-134、N-08 已交付但没有集成测试的路径）

**问题**：探针中都工作，但没有测试：MCP 工具 `lecture_synthesize`、`track_transcribe` 与它们的计费许可；Ogg/Opus 音频的 AIGC 标注（火山引擎与 OpenAI 的生产格式）；`presmium-speech consent` 命令；回放时丢弃失效事件与跟随移动的块；`presmium serve` 下录制；lfs 与 url 媒体策略。另外 `e2e/lecture-writeback.spec.ts` 写死端口 5053，不能按 `PRESMIUM_E2E_*` 并行运行。

**证据**：`grep -rn 'lecture_synthesize\|track_transcribe' packages/*/test e2e` 无结果；探针 `accept-lecture-speech/mcpprobe.mjs`、`oggprobe.mjs`、`drift.mjs`、`serverec.mjs`；验收者从临时副本在 5271 端口运行 writeback 用例。

**修法与验收**：`script.test.ts`：经 MCP 调用两个工具，有无计费许可各一次（无许可时引擎收到 0 个请求）。`speech.test.ts`：一个返回 Ogg/Opus 的本地引擎，用 `opusComments` 断言 OpusTags 中的 AIGC 注释并能干净解码，WAV 用 `infoEntries` 断言（F-54）；运行一次 consent 命令，坏的 sha 被拒绝。`lecture.spec.ts`：一个块改了标签、一个块被删除，回放显示提示并跟随移动的块。`track.test.ts`：lfs 与 url 策略（与 F-56 合用）。`lecture-writeback.spec.ts` 的端口改由环境变量给出。

### F-63（minor；WBS WP-82 交付的浏览器 `webspeech` 预览；决定 D-9）

**问题**：webspeech 预览（编辑时试听，只用本机音色，文字不离开浏览器）只以导出函数的形式存在，没有界面调用，也没有测试。

**证据**：`grep -rn 'previewWebSpeech\|webSpeechVoices' packages` 只找到 `addon-speech/src/client/webspeech.ts:20,29` 的定义与 `index.ts:3` 的再导出。

**修法与验收**：按 D-9：删除这两个函数与再导出，WBS 与设计中的说法由 89f 删去（C-9）。若 D-9 改为保留：在 `TrackEditor.vue` 的逐句编辑中加入“在本浏览器试听”的操作，标明不发送给服务商，并加 e2e 用例。

## WP-89e（执行、幻灯片、notebook 与发布）

拥有：`packages/addon-exec/**`、`packages/addon-exec-jupyter/**`、`packages/addon-exec-local/**`、`packages/addon-exec-wasi/**`、`packages/addon-exec-webgpu/**`、`packages/render-slides/**`、`packages/render-notebook/**`、`packages/addon-publish/**`、`packages/kernel/src/runner.py`、`templates/env/**`、`e2e/exec.spec.ts`、`e2e/exec-env.spec.ts`、`e2e/exec-local.spec.ts`、`e2e/exec-remote.spec.ts`、`e2e/exec-wasi.spec.ts`、`e2e/exec-webgpu.spec.ts`、`e2e/publish.spec.ts`、`e2e/fixtures/{exec,exec-env,exec-local,exec-remote,exec-wasi,exec-webgpu,publish}/**`

本组使用的接口：C-2（`mapHtmlUrls`、`publishedUrl`、`gatewayFetch`、`json`、`escapeHtml`、`isRecord`）、C-4（`playwrightChromium`、`serveDirectory`）；C-8 中本组的部分。

### F-16（major；5.4 依赖准则：再分发的二进制带许可证声明）

**问题**：每次网页与幻灯片构建都再分发 Pyodide 运行时（编译为 wasm 的 CPython，MPL-2.0 加 PSF 许可证）与 jax-js 的 ES 构建（MIT），却没有任何许可证声明。WASI 运行时已带 `<base>wasi/LICENSES`（WP-79e2），Pyodide 与 jax-js 没有对应的文件。

**证据**：`addon-exec/src/node/vite.ts:15-21,50-54` 只发出五个运行时文件；npm 包 `pyodide@314.0.7` 没有 LICENSE；`addon-exec-webgpu/src/node/jax.ts:38-40,57-61` 只复制 `*.js`，包中的 LICENSE 留下。示例讲义的 `dist` 中 `find -name 'LICENSE*'` 只有 `web/wasi/LICENSES` 与 `slides/wasi/LICENSES`；`python_stdlib.zip` 的 614 个条目中没有许可证文件。

**修法与验收**：addon-exec 增加一份 LICENSES（Pyodide 的 MPL-2.0 全文与源码地址、CPython 的 PSF 许可证、`pyodide-lock.json` 中随运行时发布的包的许可证），在 `generateBundle` 中发出为 `<base>pyodide/LICENSES`，开发中也提供，与 WASI 运行时的做法相同；`jaxRuntime()` 另发出 `node_modules/@jax-js/jax/LICENSE` 为 `<base>presmium/jax-js/LICENSE`。`addon-publish/test/offline.test.ts` 断言两个文件存在于网页与幻灯片产物中，并被 service worker 预缓存；第 12 节依赖表由 89f 更新（C-9）。

### F-17（major；P-20、P-105 修改参数后重跑）

**问题**：Python 执行面板的 `:params:` 丢失类型。在任何 `kind: jupyter` 环境中每个参数都作为字符串注入，`n: 2` 时 `n * 21` 得到 `'222222222222222222222'`，`range(n)` 报错；本地运行器与 Pyodide 中 YAML 布尔值成为字符串 `'false'`，而它为真。结果被悄悄算错，与 JavaScript 或其他后端的同一面板不同，notebook 单元（`n = 2`、`verbose = False`）与它录制的输出矛盾。

**证据**：`addon-exec-jupyter/src/domain/outputs.ts:107`（`name = JSON.stringify(String(value))`）；`addon-exec/src/domain/runs.ts:10`（`String(false)` 得 `'false'`）；`kernel/src/runner.py:308-313`（`ast.literal_eval('false')` 失败后保留字符串）。探针 `accept-content-exec/env`、`env2`（Jupyter 给出 `str str str str`，本地运行器给出 `int float str str`）、`probe-bool.mjs`（Python 打印 `on 'false'`，JavaScript 面板打印 `off boolean`）。没有测试覆盖 Jupyter 上的参数或布尔参数。

**修法与验收**：保持 `RunRequest.args` 为字符串的契约（architecture 4.6：运行器把字面量读回），统一读回规则：先 `ast.literal_eval`，再 `json.loads`（`true`、`false`、`null`），最后原样保留字符串。`runner.py` 照此实现；`argumentsCode` 对 Python 内核生成一个与 runner.py 同一规则的读回辅助，以及 `name = _pm_value(<JSON 字符串字面量>)`，其他语言的内核仍写字符串。`addon-exec-jupyter/test/remote.test.ts`：Jupyter 面板以 int、float、str、bool 参数录制得到 `int float str bool`；`e2e/exec.spec.ts`：`{verbose: false}` 的 Python 面板在构建与 Pyodide 中都打印 `off`。

### F-18（major；P-50 PDF 与图片导出，P-20、P-22 幻灯片中的输出，N-07）

**问题**：每张有可运行代码（`:run: both`）的幻灯片显示两个输出区：Slidev 运行器的输出区（显示英文占位“Click the play button to run the code”，导出时也运行，于是导出的页面上输出出现两次），以及其下单独的录制输出块。示例讲义的 C 幻灯片（`extend-c`，zoom 0.65）因此高过页面，Chromium 把整份 PDF 的每一页缩到约 68%（每页黑边），并丢掉其后的幻灯片：33 张幻灯片只有 23 页，`--with-clicks` 时 46 个步骤只有 32 页，`--wait 10000` 没有帮助。`--range 24-33` 仍包含第 1–23 张，命令以 0 退出，只警告“the PDF has 23 pages where the range has 10”，永久链接检查因此在示例讲义上从未运行。导出测试之所以通过，是因为它们的夹具中可运行代码之后没有更多幻灯片。文档写的命令（`e2e/fixtures/publish/publish.md:18`）与技能的建议在示例讲义上都失败。

**证据**：`render-slides/src/node/slidev.ts:542`（`{monaco-run} {autorun:false,height:'auto'}`，录制输出写在其下）；`addon-publish/src/node/export.ts:93-104`。探针 `accept-publish-classroom/demo-bisect.mjs`、`extend-bisect.mjs`（`extend-c` 加 `extend-gpu` 三次中三次失败），`pdfpages/hi-01.png`；体验报告 `shots/slides/light-1440x900-s24.png`、`s26.png`、`shots/slides-presenter-24.png`。

**修法与验收**：每张代码幻灯片只有一个输出区：现场幻灯片中，运行器的输出区显示录制输出（经 Slidev 公开的 `runnerOptions` 把录制交给 `setup/code-runners.ts` 的运行器，在明确运行之前返回录制并标明“预录输出”），删除单独的录制块与英文占位；presmium-export 写的导出文稿把可运行代码写成静态的高亮代码加录制输出，不写 `{monaco-run}`。打印模式下每张幻灯片裁剪到自己的页面，一张溢出的幻灯片不能缩放整份 PDF。范围导出的页数不符时以 2 退出，不只是警告。`addon-publish/test/export.test.ts` 加一个用例：一张缩放的高幻灯片带 `:run: both` 代码块，其后还有两张幻灯片，断言每张幻灯片一页 PDF、每页输出文字只出现一次、`--range` 只导出范围内的页；`render-slides/test` 断言现场幻灯片中没有“Click the play button”。示例讲义上的导出由 89f 在 smoke 中运行（C-8）。

### F-19（major；N-05 投影与讲者视图中的显示）

**问题**：在幻灯片与网页放映视图中，执行面板的代码限高 20em 并在内部滚动：着色器 32 行中只显示 12–13 行，下方却空着 190–360 px；讲解恰好在讲被隐藏的部分（`workgroupBarrier` 与 0 号线程挑出最多的一对）。另外几张新章节幻灯片上的 C 与训练代码字号也偏小（14.6–16.9 px，低于 R-27 用的 18 px）。

**证据**：`addon-exec/components/PmRunPanel.vue:154-158`。探针 `accept-ux-demo/vclip.mjs`：1920×1080 时 `extend-gpu` 的放映视图隐藏 788 px、下方空 363 px，第 25 张幻灯片隐藏 689 px、空 350 px，`encode-run` 隐藏 1533 px；`fontsize.mjs`。R-27 的用例（`e2e/exec.spec.ts:209-226`）只断言横向截断。

**修法与验收**：放映形态（host 的 `usePresentationMode()` 为真，不依赖框架的类名）中，执行面板成为纵向 flex 列，代码区 `flex: 1; min-height: 0`，不设固定的最大高度，填满幻灯片的剩余高度；20em 只用于文档视图。在 R-27 的用例中加纵向截断的断言（有剩余空间时 `scrollHeight - clientHeight <= 0`）。示例讲义的 `zoom` 调整与 demo.spec 的第 25 张断言由 89f 做（C-8）。

### F-20（major；安全，第 11 节“不可信的富输出”）

**问题**：Monaco 运行器（幻灯片形态）把图片输出写成 `<img … src="data:${image};base64,${…}">`，不做任何转义。Slidev 不清理运行器返回的 `html`，所以数据中的 `"` 会结束属性并加上事件处理器。远端内核的输出经过 `sanitized()`，但它只清理 `text/html` 与 `image/svg+xml`。不可信的内核或程序打印的输出于是能以查看成员的身份在工作区站点的源中运行脚本，例如学习者篡改共享 `auth: proxy` Jupyter 上主讲的内核，下一次运行就以主讲的角色提交变更任务、接受审阅或撤销。

**证据**：`addon-exec/setup/code-runners.ts:14,26`；`addon-exec-jupyter/src/client/environments.ts:55`。探针 `review-plugins/exec/probe-img.mjs`：parse5 解析得到属性 `onerror="fetch(`/__presmium/presmium.assistant/tasks`,{method:`POST`})"`。render-slides 对同样的情形做了转义，viewer 用 vnode 属性。

**修法与验收**：图片数据只接受 base64（`/^[A-Za-z0-9+/=]*$/`，否则丢弃该输出），属性值用 kernel 的 `escapeHtml`（F-36）；`addon-exec-jupyter` 的 `sanitized()` 也校验图片的 base64。`e2e/exec.spec.ts`：一个返回带引号的图片数据的执行器（测试插件）在幻灯片中不执行任何脚本（页面上设置的哨兵变量不变），输出被丢弃并显示原因。

### F-21（major；简化 S03，契约 C-8（第二轮）的 `vitePlugins`）

**问题**：幻灯片渲染端从不使用 `RenderContext.vitePlugins`，而编译器为每个渲染端计算它，契约（architecture 4.2）也说运行 Vite 的渲染端要加入它。插件因此另有一套只给 Slidev 的注册（`setup/vite-plugins.ts`）：exec-local 与 exec-wasi 的 `setup/vite-plugins.ts` 重复了 Node 入口的 `vitePlugins`，从 Slidev 头部重新推出插件配置（`deckExecLocalConfig`），并向上找 `.presmium` 猜文稿目录（`deckDirOf`）。还有第三个渠道：包根目录的 `vite.config.ts`，由 Slidev 与 `web/src/node/addons.ts:46` 读取，带着各插件的 `prebundled()` 副本。

**证据**：`render-slides/src/node/slidev.ts` 中没有 `vitePlugins`；`addon-exec-local/setup/vite-plugins.ts`、`addon-exec-wasi/setup/vite-plugins.ts`；`addon-exec-local/src/domain/config.ts:38`、`src/node/server.ts:126`。

**修法与验收**：render-slides 生成文稿的 `vite.config.ts`（`render-slides/src/node/presmium.ts:142` 的 `viteConfig`；Slidev 合并它，见 `vendor/docs/slidev/custom/config-vite.md`），导入每个插件的 `./presmium` 入口并展开 `vitePlugins({ deckDir, workspaceRoot, config })`，与 `web/src/node/site.ts:236-241` 相同；删除 exec-local、exec-wasi 的 `setup/vite-plugins.ts`、`deckDirOf` 与 `deckExecLocalConfig`；把 `prebundled()` 并进 `vitePlugins`，只留一个渠道（web 的 `addons.ts` 读包根 `vite.config.ts` 的部分由 89f 相应删除，写在合并说明中）。`e2e/exec-wasi.spec.ts`、`e2e/exec-local.spec.ts` 的幻灯片用例通过。

### F-22（major；原则 6、K-09“代码修改不写回”、P-25 移出范围；简化 S05；决定 D-2）

**问题**：已移出范围的代码回写仍作为可见的功能发布：PmLocalEnv 显示“提交到新分支”按钮，开发服务器响应 `POST /__presmium/exec-local/commit`，把浏览器中改过的代码写进仓库。这是编辑器与 agent 之外的第三条修改路径，没有测试；e2e 的注释声称它被包内测试覆盖，实际没有。

**证据**：`addon-exec-local/components/PmLocalEnv.vue:90-92,138-140,150-152`；`src/node/server.ts:92-100`；`src/node/git.ts:27-76`。探针：同源 POST 得到 409 “not in git”（端点在运行），跨源得到 403。`e2e/exec-local.spec.ts:13-15` 的说法与 `local-env.test.ts` 不符；`requirements.md:126,327`；`architecture.md:42` 仍写“回写”。

**修法与验收**：按 D-2（验收者已决定删除）：删除提交路由、`commitOnNewBranch`、`src/node/git.ts` 中只为它服务的部分、`CommitRequest`/`CommitResult`、`defaultBranch`、`LocalEnvService.commit`、按钮、结果行与它们的中英文文本，以及 exec-local.spec 中的那句说法；`gitRoot` 只作为工作区默认值时改用 `vitePlugins` 的 `ctx.workspaceRoot`，`git` 状态字段随之去掉。架构第 2 节与需求 5.3 的“回写”由 89f 删去（C-9）。`e2e/exec-local.spec.ts`：页面上没有提交按钮，`POST …/commit` 得到 404。

### F-23（major；简化 S06）

**问题**：addon-exec-local 把 `run`、`replicate`、`status` 作为原始 Vite 中间件挂在自己的前缀 `/__presmium/exec-local` 下，有自己的 HTTP 层（`http.ts` 的 HttpError、带上限的 readJson、sendJson、requireString）与自己的 Accept-Language 处理。其他插件都用服务端贡献 `server(ctx)`，挂在 `/__presmium/<插件 ID>/` 下，已经提供身份、角色、`operate` 许可、文稿头部与语言。

**证据**：`addon-exec-local/src/node/server.ts:130-151`、`src/node/http.ts`。

**修法与验收**：三个端点改为 `presmium.execLocal` 的 `server(ctx)` 路由（editor 角色，`run` 需要 `operate` 许可）；`local-env.ts` 改用 `useServer().fetch(EXEC_LOCAL_ID, path)`；删除 `http.ts`、`localEnvServer`、`deckDirOf` 与 `vitePlugins` 贡献（与 F-21、F-22 一起做）。`addon-exec-local/test/local-env.test.ts` 与 `e2e/exec-local.spec.ts` 通过；跨源请求得到 403，`presmium serve` 中读者调用 `run` 得到 403。

### F-64（minor；P-102 最后一个表达式的值；决定 D-8）

**问题**：共用的 Python 运行器（构建时与 Pyodide）以 `'exec'` 模式编译，末尾表达式的值（DataFrame 常用的结尾 `df`）不产生 `execute_result`；同一段代码在 Jupyter 环境中会显示。输出因此取决于环境，notebook 单元在 Jupyter 会显示表格的地方没有输出。

**证据**：`kernel/src/runner.py:314`。探针 `accept-content-exec/b` 的 `frame`、`frame2` 块：IR 与 notebook 的输出都为空；同样的代码加 `:env: lab` 时录制到 `execute_result`。

**修法与验收**：按 D-8：`_pm_prepare`/`_pm_run` 用 ast 解析，最后一条语句是 `ast.Expr` 时先执行其余语句，再求最后一个表达式，值不为 None 时以 display 所用的同一格式化（`_repr_html_`、`_repr_markdown_`、`_repr_png_`、text/plain）输出 `execute_result`；分步执行（`TRACER`）的行为不变。`addon-exec/test/session.test.ts` 或 `e2e/exec-env.spec.ts`：结尾的 dict 或 DataFrame 在网页、幻灯片与 notebook 中显示。

### F-65（minor；P-102 幻灯片中的富输出与导出）

**问题**：录制的 `text/html` 输出（如 `display(df)` 的 DataFrame）放在一个固定高度的沙箱 srcdoc iframe 中（`min-height: 8rem`）：较高的表格被截断并在 iframe 内滚动，幻灯片的 PDF/PNG 导出丢掉这些行，输出也没有样式（默认衬线字体）。

**证据**：`render-slides/src/node/slidev.ts:461`、`render-slides/src/deck/style.css:50-56`。探针 `accept-content-exec/b` 的 `bigtable`：12 行的表格在网页中完整显示，在幻灯片中 iframe 高 198 px，只能看到第 0–4 行（`shots/bigtable-slide-6.png`），导出截图 `shots/b-export/5.png` 是一个空的固定框。

**修法与验收**：构建时以 `viewer/src/outputs.ts` 相同的 DOMPurify 策略清理 HTML（经 DOM 垫片），带文稿的表格样式内联写出；或者保留 iframe，设为 `sandbox="allow-same-origin"`（脚本仍被阻止），由插件的 setup 按 `contentDocument.documentElement.scrollHeight` 设定高度。`render-slides/test`：12 行的表格在幻灯片中完整可见，且出现在 PNG 导出中。

### F-66（minor；P-23、P-102 浏览器中的 Python；决定 D-5）

**问题**：Pyodide 只加载核心发行版，从不加载包：浏览器中 `import matplotlib`、numpy、pandas 都报 ModuleNotFoundError。而 ir.md 2.7、architecture 4.6 与 presmium-author 技能都说 matplotlib 的图在浏览器中与构建时一样成为 `image/png` 输出。导入 numpy 的 `:run: both` 代码块构建时录制正常，读者按“运行”却得到回溯。

**证据**：`addon-exec/src/client/pyodide.worker.ts:32` 只调用 `loadPyodide({ indexURL })`；`addon-exec/src/` 中没有 `loadPackage`、`loadPackagesFromImports`、micropip；`dist/web/pyodide` 中只有核心文件，`pyodide-lock.json` 列出 357 个包但一个都没发布。探针 `accept-content-exec/b` 的 `liveplot`。

**修法与验收**：按 D-5（建议本版本采用 (b)）：`presmium check` 对 `:run: live` 与 `:run: both` 的 Python 代码块中导入的非标准库模块给出警告（位于该块，说明浏览器中只有标准库，建议 `:run: compile` 或改写），文档由 89f 改为“浏览器中只有标准库”（C-9）。`packages/addon-exec/test` 断言这条警告。若 D-5 选 (a)：worker 运行前 `loadPackagesFromImports(code)`，构建时把用到的 wheel 复制到 `<base>pyodide/` 并预缓存，加一个现场 matplotlib 图的 e2e 用例。

### F-67（minor；P-21 分步执行，`:steps:` 声明的步数）

**问题**：`:steps:` 与实际追踪的行数不符时，唯一的信号是组件里一条面向作者的橙色警告（“steps 声明为 7，实际执行 9 行”），它出现在投影给观众的幻灯片与学生的网页上；`presmium build` 与 `presmium check` 都不报告。

**证据**：`addon-exec/components/PmStepRun.vue:133`。探针 `accept-content-exec/b` 的 `sr` 块，截图 `shots/b-slide-3.png`、`shots/b-steprun.png`。

**修法与验收**：编译时用同一个 TRACER 经本地运行器追踪代码，步数不符时在指令所在行报告 `presmium.exec` 警告；组件只在演讲者视图或开发模式中显示这条提示。`addon-exec/test` 断言警告的行号；`e2e/exec.spec.ts` 断言观众视图中没有这条提示。

### F-68（minor；P-107 浏览器终端，ir.md 2.7“离开页面时关闭终端”）

**问题**：离开页面不关闭 Jupyter 终端。PmTerminal 只在 Vue 卸载时关闭，pagehide 时不会发生卸载；插件的 dispose（在 pagehide 时运行）只关闭内核。终端在服务器上堆积，直到模板约 20 分钟后清理；会话内核则会被关闭。

**证据**：`addon-exec-jupyter/components/PmTerminal.vue:85`；`src/client/plugin.ts` 的 dispose 只调用 `remote.dispose`。探针 `accept-content-exec/probe-leave2.mjs`：离开页面后内核消失，终端 "3" 仍在 `/api/terminals` 中。

**修法与验收**：`createRemoteEnvironments` 记下打开的终端会话，`dispose()` 以带 `keepalive` 的 DELETE 关闭它们，PmTerminal 在那里登记自己的会话。`e2e/exec-remote.spec.ts`：打开终端、离开页面，之后 `/api/terminals` 中没有这个终端。

### F-69（minor；P-104 真实 GPU；WP-89 外部条件的用例）

**问题**：没有自动化用例使用真实的 GPU 适配器，录制（Vulkan 上的 `adapter: gpu` 或 `auto`）与浏览器中都没有；全部 WebGPU 测试用 SwiftShader 或没有适配器。手工运行可用，但 WP-89 要求需要外部条件的用例在具备条件的机器上运行。

**证据**：`addon-exec-webgpu/test/record.test.ts` 只用 `adapter: swiftshader`；`e2e/exec-webgpu.spec.ts:12` 与 `e2e/demo.spec.ts:78` 以 `--use-webgpu-adapter=swiftshader` 启动。手工探针 `accept-content-exec/probe-gpu.mjs`、`probe-jax.mjs` 得到 `nvidia blackwell` 与 `webgpu [[19,22],[43,50]]`。

**修法与验收**：增加以 GPU 为条件的用例（以 `--enable-features=Vulkan` 启动的 Chromium 找不到非回退适配器时跳过并说明原因）：`record.test.ts` 以 `adapter: gpu` 录制，环境指纹含厂商名；`exec-webgpu.spec.ts` 在真实适配器上运行着色器与 jax-js。在本机运行一次，结果记入 WP-89 的交付说明。

### F-70（minor；P-104 Python GPU 代码的回退，6.11 验收）

**问题**：Python 的 `presmium_gpu` 代码块只能是 `:run: live`，因为构建时的 Python 没有 `presmium_gpu`，所以没有录制；在没有适配器的浏览器中，读者得到 `GPUUnavailable` 的回溯，而不是带原因的录制输出。需求所述的回退只对 wgsl 面板存在。

**证据**：探针 `accept-content-exec/probe-jax.mjs` 在默认无头 Chromium 中：`py-sync` 块打印 `presmium_gpu.GPUUnavailable: No GPU adapter is available` 的回溯（退出码 1）；技能 `references/directives.md:349` 让作者写成 `:run: live`。

**修法与验收**：Pyodide 运行器把未捕获的 `GPUUnavailable` 变成“没有运行”的结果（`exitCode: null`，原因“没有可用的 GPU 适配器”），viewer 显示可能有的录制与原因（P-24）；在构建时提供 `presmium_gpu`（经 webgpu 插件的 Chromium 录制器）留作以后。`e2e/exec-webgpu.spec.ts`：无适配器时 Python GPU 块显示原因而不是回溯。

### F-71（minor；P-105、P-106 需要外部条件的远端环境用例）

**问题**：以下路径没有自动化用例：GPU 节点（`templates/env/compose/compose.gpu.yaml`）、gVisor 叠加、带 `{user}` 地址的 JupyterHub 用户服务器，以及 Jupyter 的超时中断与 `files`。只有基础的 `compose.yaml` 被测试。手工验证：GPU 叠加把两块 RTX 5090 交给内核与终端，超时中断内核（KeyboardInterrupt）后内核仍可用；本机没有安装 runsc。

**证据**：`packages/addon-exec-jupyter/test` 与 `e2e` 中找不到 `compose.gpu`、`compose.gvisor`、`{user}`；`remote.test.ts` 与 `exec-remote.spec.ts` 只启动 `compose.yaml`。`docker info` 只列出 runc。

**修法与验收**：`remote.test.ts` 加入：以 Docker 与 GPU 为条件、用 `-f compose.yaml -f compose.gpu.yaml` 启动、录制中有 `nvidia-smi -L` 的用例；`docker compose -f compose.yaml -f compose.gvisor.yaml config` 的校验；超时用例（中断后下一块照常运行）；`files` 写入工作目录的用例。JupyterHub 用 DummyAuthenticator 的夹具（按 kubernetes README 的 allow_origin 设置）测试 `{user}` 与 `auth: prompt`。在具备条件的机器上运行一次并记录。

### F-72（minor；P-52 高对比度主题，网页形态）

**问题**：网页滚动叙事中非当前步骤的讲解以 opacity 0.35 变淡，高对比度不改变它：开启高对比度后亮色下对比度 2.44:1、暗色下 3.01:1，低于 AA 的 4.5:1。`contrast.css` 自己的规则说只提高宿主自身的内容淡化，这处滚动叙事的淡化正属此类，却没有列入。网页形态的高对比度测试只覆盖导航开关与一个章节，“每页达到 AA”的循环只对幻灯片存在。

**证据**：`viewer/src/style.css:178-181`；`addon-publish/src/client/contrast.css:65-70`。探针 `accept-publish-classroom/contrast-web.mjs`：`idea.html` 在两种配色下各有 37 处低于 4.5（如“第一轮：相邻的 [p.] (2.44)”）。

**修法与验收**：`contrast.css` 加 `:root[data-pm-contrast='high'] .pm-section--scrolly > .pm-track .pm-block--narration.pm-hidden { opacity: 0.6 !important; }`，与变暗的代码行同样处理。`e2e/publish.spec.ts` 加网页形态的“高对比度下每页达到 AA”循环，亮色与暗色各一遍，包含一个滚动叙事章节。

### F-73（minor；N-05 手机上的学习者，N-03 离线；决定 D-6）

**问题**：只看网页的一页，service worker 就下载 77.6 MB，其中 C 工具链 50.7 MB、Pyodide 12 MB，即使学习者从不运行代码；讲义正文却说第一次运行时才下载。

**证据**：探针 `accept-ux-demo/swbytes.mjs`（375×812，移动端）：看一次 `/web/tokens.html` 后 cache storage 中有 77.6 MB；`presmium-sw.js` 在 install 时 `cache.addAll` 整个列表；`examples/demo/pages/extend.md` 写“第一次运行要先下载编译器，大约 50 MB”。预缓存由 `addon-publish/src/node/offline.ts` 与 `src/domain/offline.ts` 生成。

**修法与验收**：按 D-6：网页形态在 install 时只预缓存站点外壳与内容，重型运行时（`wasi/`、`pyodide/`、jax-js）在第一次使用时 cache-first 缓存，并提供一个“保存以离线使用”的操作预先取得它们；幻灯片形态（讲者的机器）照旧全部预缓存。`addon-publish/test/offline.test.ts` 与 `e2e/publish.spec.ts` 相应修改：网页首次访问后缓存中没有 `clang.wasm`，运行一次 C 或执行“保存以离线使用”后断网仍能运行；讲义正文由 89f 改为与实际一致（C-9）。

### F-74（minor；体验：面向初学者的执行面板参数；决定 D-10）

**问题**：WebGPU 面板用运行器的原始选项名 `buffers`、`repeat` 作字段标签，旁边是原始 JSON；运行历史重复这段 JSON（`#1 buffers={"text":[97,…]} repeat=10 · 预录 · 10 ms`）。在 zh-CN 的初学者课程中读起来像调试输出。

**证据**：`addon-exec/components/PmRunPanel.vue:96-99`（`<span>{{ name }}</span>`）；截图 `accept-ux-demo/shots/int-d1440-gpu-after-run.png`。

**修法与验收**：按 D-10（建议不改语法）：webgpu 插件为自己认识的参数名提供本地化的显示名（缓冲区、重复次数），缓冲区按绑定显示为带标签的字段，历史中显示摘要而不是 JSON；面板从执行器取得显示名，没有时照旧显示参数名。`e2e/exec-webgpu.spec.ts` 断言 zh-CN 标签与历史摘要。

### F-75（minor；插件评审，安全，N-08）

**问题**：WASI 的编译时运行（C、C++、Ruby、SQL）在编译进程内的 `worker_threads` 工作线程中执行，没有内存上限，也不经过进程沙箱，WebAssembly 的内存算在 `presmium dev`/`serve` 或 agent-host 头上。编辑者或 agent 写的一个代码块（SHARED 中不可信，10.10）就能把 agent-host 推向 OOM killer，断掉全部 agent 会话与构建。

**证据**：`addon-exec-wasi/src/node/executor.ts:43`。探针 `review-plugins/exec/probe-wasi-mem.mjs`：分配并触碰 3 GiB 的 C 代码块使进程 RSS 从 60 MiB 升到 3285 MiB。

**修法与验收**：经 `ctx.sandbox`/`directRun` 以子进程运行 `worker.mjs`（与 Python 相同的 `ProcessSandbox.run` 路径），由操作系统与沙箱限制并结束它；做不到时，C/C++ 以 `-Wl,--max-memory=<上限>` 链接，Ruby 与 SQLite 以有上限的 `WebAssembly.Memory` 实例化。`addon-exec-wasi/test/compile.test.ts`：分配超过上限的 C 代码块失败并报告原因，编译进程的 RSS 增长小于上限。

### F-76（minor；插件评审，安全）

**问题**：`runDirectory` 直接在共享的 tmpdir 中创建 `presmium-container-XXXX`，并把它与 `.presmium/` 设为 0777，任何本机用户都能列出与写入。Presmium 随后用 `writeFileSync` 写 `.presmium/request.json`（会跟随本机用户放下的链接），读另一用户可以替换的 `.presmium/result-0.json` 并把它存为运行的录制输出，最后的 `rmSync(dir, { recursive })` 也与这棵可写的树竞争。

**证据**：`addon-exec-local/src/node/container.ts:304-311,319,354`。

**修法与验收**：用 `mkdtempSync` 建一个 0700 的父目录，0777 的运行目录放在它里面，只绑定挂载内层目录；请求文件以 `flag: 'wx'` 写入。`addon-exec-local/test/local-env.test.ts`：运行期间父目录的权限为 0700，预先放在请求路径上的链接使运行失败而不是写穿。

## WP-89f（网页、IR 运行时、课堂、内容、文档与示例）

拥有：`packages/web/**`、`packages/viewer/**`、`packages/addon-classroom/**`、`packages/addon-session/**`、`packages/classroom-server/**`、`packages/addon-code/**`、`packages/addon-content/**`、`packages/addon-guide/**`、`packages/addon-stage/**`、`packages/addon-core/**`、`docs/**`、`.agents/skills/**`、`examples/**`、`CLAUDE.md`、`playwright.config.ts`、`e2e/fixtures/deck.ts`、`e2e/urls.ts`、`e2e/{web,viewer,site,classroom,session,predict,perf,smoke,demo,demo-workspace,code,content,guide,stage}.spec.ts`、`e2e/fixtures/{web,viewer,site,session,predict,code,content,guide,stage}/**`

本组使用的接口：C-2（web 的 `mapHtmlUrls`、`publishedUrl`，addon-content 的 `escapeHtml`）、C-3（addon-guide 的块定位函数；D-4 的 `NavigationPosition.section`）、C-4（`documentLink`）；C-8、C-9 中本组的部分。最后合并。

### F-24（major；P-79 文件发布：模板与起始目录）

**问题**：正文链接的本地 Markdown 文件，或被链接的起始目录中的 `.md` 文件，被复制进 VitePress 的源树（`.presmium/web/build/site/public/media/`），VitePress 把它当作页面编译。带类似 HTML 占位的模板（`<answer>`）因此使整个网页构建失败；无害的 `.md` 也会产生多余的页面（`public/media/<hash>-x.html`）与 Shiki 警告。同一文稿的幻灯片与 notebook 构建正确发布这个文件。P-79 本身就点名了模板。

**证据**：`web/src/node/site.ts:32`（`publicDir` 在 srcDir 内）、`:228` 与 `sites.ts:276` 的配置没有 `srcExclude`。探针 `accept-media-site/deck1`：`[vite:vue] …/467d112b-template.md (6:25): Element is missing end tag`，`renderer web failed: vitepress build exited with code 1`，退出码 1；`glance` 的构建产生 `web/public/media/4bd6a4f5-lecture.html`。

**修法与验收**：在生成的 VitePress 配置（`site.ts`、`sites.ts`）中加 `srcExclude: ['public/**']`，这也覆盖 `site.ts:410` 复制的文稿自己的 `public/`。`e2e/fixtures/site/deck` 加一个起始目录，其 README.md 含 `<placeholder>` 与 `{{ x }}`，另有一个直接链接的 `.md` 模板；`e2e/site.spec.ts` 断言构建通过、`.md` 按字节下载、没有 `public/media/*.html` 页面。

### F-25（major；P-79、P-122 × P-55，WP-89a 已知缺口 5）

**问题**：`presmium check` 把 `[..](../bpe/lecture.md#extend-c)` 当作文档链接，并按 bpe 校验片段；网页渲染端却把 bpe 的源码作为 `/glance/media/<hash>-lecture.md` 发布，还把它渲染成一个多余的页面。读者得到 Markdown 源码，而不是 `/bpe/extend.html#extend-c`。链接方文档的 `--audience student` 构建会带出另一文档的源码，包括它的 `:audience: teacher` 内容；构建报告“no problems”，泄漏扫描也发现不了（它只扫描链接方自己被去掉的句子）。这对 SHARED 的读者站点（D17 以 `--audience student` 构建每份文档）是一个泄漏。

**证据**：探针 `accept-media-site` 的 `ws2/glance`：页面链接 `href="/glance/media/4bd6a4f5-lecture.md"`；在 bpe 中加入教师专用的哨兵句子后，`glance-student/web/media/0b608bae-lecture.md` 含该句子。技能（presmium-author §7）只是写明了这个坑。

**修法与验收**：按 C-4。编译器不再发布另一文档的入口文件，并提供 `documentLink`；本组在工作区站点（`sites.ts`）中把这类链接改写为该文档对应章节的页面加片段，单文档的网页构建保留原链接（编译器给出警告）。`e2e/site.spec.ts`：链接打开 `/bpe/extend.html#extend-c`；链接方文档的学生构建中没有被链接文档的任何教师句子，也没有 `media/*-lecture.md`。示例与技能中的绕行写法随之删去（F-86）。

### F-26（major；插件评审，安全，SHARED，WP-91b）

**问题**：`{code-ref}` 的解析用 addon-code 自己的读取器读工作树：`openWorkspace(ctx.workspaceRoot).src.read` 只做字面检查，然后直接 `readFile(join(root, rel))`，`resolve.ts:40` 把它交给解析器，而不是 `ctx.src`。所以在 SHARED 的 `presmium serve` 中它绕过编译器的 ReadScope（WP-91b，拒绝 `.git/` 与离开工作区的链接）：沙箱在文档中放一个链接（`cfg.py -> ../.git/config`），配上 `pattern:doc/cfg.py#$X`，serve 就读到只有 serve 能读的文件并放进 IR，MCP（`get_section`、`get_code_ref`）与诊断再把它交给编辑者及其 agent。`.git/config` 中可能有远端凭据或 `http.extraheader` 令牌。

**证据**：`addon-code/src/node/git.ts:82-87`、`resolve.ts:38-47`。探针 `review-plugins/code-scope/probe-scope.mjs`（`{ scope: true, trust: 'shared' }`）：`{literalinclude} cfg.py` 被拒绝，但 code-1 含 `url = https://probe-user:ghp_PROBESECRET0123456789@…`。

**修法与验收**：在 `codeRefPass` 中包装读取器：`ref === undefined` 时用 `ctx.src.read(file)`（编译器的受限读取器），有 `ref` 时才用 addon-code 的 git 读取器（提交与子模块）；`lostMessage` 也用它；锚点中拒绝 `.git` 路径段。`addon-code/test/check.test.ts`：以 `{ scope: true, trust: 'shared' }` 编译，经链接指向 `.git/config` 的 code-ref 报告不可读，IR 中没有其内容。

### F-27（major；插件评审，安全，P-60 至 P-68，领域模型第 8 节）

**问题**：学习者写 `store:<集合>` 时，只要 `key.split(':').includes(participant)` 就被允许，参与者可以出现在键的任何一段。参与者 ID 由客户端选择、首次使用时绑定，条目 ID 是 placeKey `<section>/<block>`，章节部分常常是 `sec:intro` 这样的 MyST 标签。以 `participant=sec`（或测验、标签 ID 如 `q1`）连接的学习者因此能覆盖或删除 `sec:…` 键下其他学习者的作答、投票、提交与预测，删除只需要通过键的检查。这违反“学习者只能写入自己参与者 ID 下的作答”。

**证据**：`classroom-server/src/index.ts:225-236`。探针 `review-plugins/classroom/probe-keys-sec.mjs`：`before {"sec:intro/quiz-1:alice":{…"participant":"alice"…}}`，`after overwrite {…"participant":"sec","choice":[3]…}`，`after delete {}`，没有报告拒绝；`probe-keys.mjs` 对 `participant=q1` 同样成立。

**修法与验收**：按集合检查参与者的位置：`<item>:<participant>` 形式的键（answers、pulse、submissions、predictions）必须以 `:${participant}` 结尾；`questions` 的键必须以 `${participant}:` 开头；其他集合拒绝或用后缀规则。键上的现值属于另一参与者或作者时，拒绝修改与删除。`classroom-server/test/server.test.ts` 加入 `participant=sec` 对 `sec:intro/…:alice` 的覆盖与删除，都被拒绝并通知该学习者。

### F-77（minor；K-04 步骤可逆，网页形态）

**问题**：没有自动化测试检查网页形态（主媒介）中直接跳到第 N 步与从 0 步进到 N 步得到相同的 DOM；跳转与步进的 DOM 比较只在幻灯片形态中存在。探针表明行为目前成立。

**证据**：`e2e/core.spec.ts:149`、`e2e/exec.spec.ts:69`、`e2e/guide.spec.ts:146` 都在幻灯片上；`e2e/web.spec.ts:450,374` 只比较两次跳转或滚动叙事的前后滚动。探针 `accept-kernel-principles/reversible-strict.mjs` 在五处给出 SAME。

**修法与验收**：`e2e/viewer.spec.ts`（夹具 `e2e/fixtures/viewer`）加一个用例：打开 `?view=present&section=<s>&step=N` 记录放映区域的 innerHTML，再从第 0 步按 N 次 ArrowRight，断言 DOM 相同；所选章节含一个分步组件与代码高亮。

### F-78（minor；K-12、P-43 测验的静态降级）

**问题**：测验的静态形式中，选项编号为 1、2、3，答案却给出字母：学习者在标为 1–3 的选项下读到“答案 B”。现场测验用 A/B/C。

**证据**：`addon-classroom/src/node/fallbacks.ts:62-66`（选项用 `numbered()`，答案用 `optionLetter`）；`addon-classroom/test/notebook.test.ts:145-146` 断言了这种不一致；示例 notebook 的第 11、41 个单元。

**修法与验收**：选项用与现场测验相同的字母标注（段落 `A. …`，或 `<ol type="A">`）。`notebook.test.ts` 改为断言选项与答案使用同一种标注。

### F-79（minor；N-07 界面语言：框架的读屏标签）

**问题**：zh-CN 文稿中 VitePress 的读屏标签“mobile navigation”“extra navigation”没有改写，architecture 5.7 也没有列出它们。（同一报告中的修改历史部分见 F-55，Slidev 运行器的占位文字随 F-18 消失。）

**证据**：探针 `accept-ux-demo/labels.mjs`：每个示例页面的按钮 `aria-label="mobile navigation"`、`"extra navigation"`，来自 VitePress 的 `VPNavBarHamburger.vue:16` 与 `VPNavBarExtra.vue:25`；`web/src/client/theme.ts:145` 只改写 `sidebar-aria-label` 与 `doc-footer-aria-label`。

**修法与验收**：在 `theme.ts` 中用同一个渲染后步骤，按文稿语言改写这两个标签。`e2e/web.spec.ts` 断言它们的中文 aria-label。

### F-80（minor；网页形态的代码高亮）

**问题**：网页形态中 WGSL 着色器是单色的纯文本，幻灯片却有高亮；exec-wasi 支持的 Ruby 也没有高亮。

**证据**：`viewer/src/highlight.ts:12-33` 的 `GRAMMARS` 没有 wgsl 与 ruby；截图 `accept-ux-demo/shots/light-d1440-ext-gpu.png` 对比 `shots/slides/light-1440x900-s25.png`。

**修法与验收**：`GRAMMARS` 加 `wgsl: () => import('shiki/langs/wgsl.mjs')` 与 ruby。`e2e/web.spec.ts` 断言 wgsl 与 ruby 代码块的 token 带颜色。

### F-81（minor；N-05 手机上的表格）

**问题**：375 px 时新章节的合并规则表挤压各列：行内代码的词元在词元内部断开，`est `、`newest ` 末尾的空格单独成行，表头断成单个字（顺/序、编/号）。而这一课恰好强调空格也是字节。

**证据**：截图 `accept-ux-demo/shots/dark-phone-ext-predict.png`。

**修法与验收**：文档视图中，表格单元格内的行内代码 `white-space: pre`（或 nowrap），宽表格在自己的板块内横向滚动（代码块已是这种做法）。`e2e/web.spec.ts` 在 375 px 下断言表格中行内代码元素只占一行、页面没有横向滚动。

### F-82（minor；N-06 笔记按钮的读屏名称）

**问题**：渲染的 Markdown 表格旁的“笔记”按钮把单元格文字粘在一起作为可访问名称，读屏软件念出乱码。

**证据**：探针 `accept-ux-demo/probe3.mjs`：`extend-predict` 章节中按钮的 aria-label 为“笔记：顺序合并的一对新词元编号1'e' 和 '…”；组件为 `addon-classroom/src/client/NoteSpot.vue`。

**修法与验收**：块的笔记按钮以章节标题加块的种类命名（如“笔记：下一次合并哪一对？ · 表格”），或以空格连接文本节点并跳过表格内部。`e2e/classroom.spec.ts` 断言表格块的笔记按钮名称。

### F-83（minor；N-02 测试覆盖）

**问题**：N-02 在本机满足，但测试只检查一份只有文字的合成文稿，测量在第一个动画帧开始时结束，看不到布局与绘制的开销。在示例讲义的重幻灯片上（Monaco、mermaid），按键到绘制接近或略超过 100 ms。

**证据**：探针 `accept-ux-demo/inp.mjs`、`inp2.mjs`（Event Timing）：全速时一次按键 104 ms，另一次最大 96 ms，CPU 降速 4 倍时多次 120–160 ms；`perfdemo2.mjs` 用 spec 的 rAF 方法得到负值（-1.1、-7.5 ms）。

**修法与验收**：`e2e/perf.spec.ts` 加 Event Timing 断言（PerformanceObserver，type `event`，durationThreshold 16）：一份含 Monaco 运行器、mermaid 与 markmap 幻灯片的夹具（在 `beforeAll` 中构建），keydown 的 duration < 100 ms。若断言失败，记录幻灯片与原因，作为后续修复交给所属的组。

### F-84（minor；核心评审，K-11 实时预览）

**问题**：`presmium dev` 中页面在实时更新之后可能退回较旧的文档。`followDevServer` 在加载时与每次 `vite:ws:connect` 时获取 `/__presmium/ir`；如果这次获取在编译写出新 IR 之前得到应答、却在 WebSocket 的更新应用之后才到达，页面把 `current` 设回旧版本并显示旧文档，直到下一次编辑的 `base` 不符触发新的获取。

**证据**：`web/src/client/theme.ts:225-245`。

**修法与验收**：记录已应用的更新次数；`fetchCurrent` 在获取开始之后有更新被应用、或 `current` 已改变时，忽略这次应答。`e2e/viewer.spec.ts` 的实时预览用例在重连与连续两次编辑交错时断言最终显示最新内容（`--repeat-each=10` 稳定）。

### F-85（minor；P-55 × P-62 完整版与学生版之间的课堂跟随；决定 D-4）

**问题**：学习者按位置（幻灯片序号与步骤）跟随主讲，而学生构建去掉教师章节后重新编号。教师章节位于主讲位置之前时，每个跟随的学习者都落到另一个章节，徽章却写着“正在跟随主讲”；主讲的总览也按学习者的序号给位置编号。ir.md 2.11 把它记为已知限制，WP-87 留给验收者决定。D17 下 serve 总是给读者学生站点、给编辑者完整站点，所以只要教师内容在前，默认的 serve 课堂就会遇到。

**证据**：`addon-session/src/domain/room.ts:57-60`、`src/client/classroom.ts:257-262`。探针 `accept-publish-classroom/classroom-probe.mjs`：主讲在 `guess`，学习者跟随到 `guess-text`；截图 `shots/follow-presenter.png`、`shots/follow-learner-a.png`。

**修法与验收**：按 D-4 与 C-3：主讲随光标发布章节 ID 与该步显示的块 ID（两种构建中相同，ir.md 2.11）；学习者在自己的 IR 中解析章节 ID（没有时回退到它有的最近的前一个章节），步骤按块的 `at` 求得；课堂总览按章节 ID 在主讲自己的 IR 中求章节序号，不再用学习者写入的 `place.index`。`e2e/session.spec.ts`：主讲用完整构建、学习者用学生构建、教师章节在前，学习者跟随到同一章节，总览序号与主讲的一致。

### F-86（minor；文档与代码的漂移，WP-89 交付）

**问题**：(1) architecture 第 8 节覆盖表：K-09 指向 `e2e/viewer.spec.ts`（实际是 `cli/test/build.test.ts:73`），K-13 指向 `cli/test/build.test.ts`（实际是 `cli/test/repro.test.ts:42`），v0.8 的表仍写“以下是计划中的位置，合并后照实更新”（WP-89 的交付项）。(2) `examples/workspace/README.md:22` 与 `docs/wbs.md:944` 已知缺口 (1) 仍说原处 serve 会报告 unknown directive，而 WP-91 的 `CompilerOptions.workspaceRoot` 已解决（三份报告的探针确认组件正常显示）。(3) 领域模型术语表写了代码中不存在的标识符 `CodeRefOrigin`、`CodeRefVariant`（代码为 `CodeOrigin`、`CodeVariant`）与 `VoiceConsent`（代码为 `ConsentRecord`）。(4) architecture 第 12 节依赖表中 Runno 与 jax-js 各出现两次、版本矛盾（2111/2117、2112/2118）。(5) requirements 5.3 说课堂服务端“约 170 行”（实际 562 行），并为“回写提交（P-25）”列出 simple-git。(6) 原则 2 允许 kernel 包只放共用的业务契约，而 kernel 现在还发布 Python 运行器与代码、Markdown 的共用函数（本轮 C-2 还会增加），需求的修订记录没有记下这项扩展。

**证据**：`architecture.md:1645,1649,1681,2111-2118`；`domain-model.md:241,243,525,553`；`requirements.md:24,271,278`；`packages/kernel/package.json:18`。

**修法与验收**：照实改正 (1)–(5)：第 8 节两行改指正确的测试，删去“计划中”的句子，逐行核对 v0.8 的表；README 只保留用 `try.mjs` 的真正理由（修改会提交到 Presmium 仓库），WBS 的已知缺口 (1) 标为已由 WP-91 解决，(2)、(4)、(5) 分别标为由 F-48、F-61、F-25 解决；术语表改名；删去第 12 节过时的两行；更新需求 5.3。(6) 按 D-3 修订原则 2 并在附录 B 记录。另按 C-9 写入其他组合并说明中的文档变化，按 C-8 更新示例讲义（`extend-gpu` 的 zoom、列出助手）与 `e2e/demo.spec.ts`、`e2e/smoke.spec.ts`，并删去技能中关于 `../x/lecture.md` 的绕行写法。`scripts/check-skills.mjs`（含 F-47 的新规则）通过，`pnpm demo:check` 与 `pnpm demo:build` 没有错误与警告。

## 删除的条目

只转为决定、不单独成项的 3 条：

- accept:kernel-principles 的 N-08（SHARED 模式保持实验性）：LOCAL 部分已验证；SHARED 部分即决定 D-1，不需要单独的修复项。
- accept:media-site 的 P-123 工作区站点不构建译本：需要增补契约（`SiteDocument` 带译本），转为决定 D-11（建议推迟）。
- accept:lecture-speech 的 P-137 合成讲授没有译文字幕：属于新功能，转为决定 D-12（建议推迟）。

部分删除：简化 S01 中“presmium-mcp 不运行发布检查”的部分已在 f326a6e 修复（`mcp/src/stdio.ts:86`），其余保留为 F-03。

没有发现与代码不符的条目，也没有与 CLAUDE.md 约定冲突的条目。修法中涉及约定之处已按约定改写：F-19 用 host 的 `usePresentationMode()`，不用框架的类名；F-18 只用 Slidev 公开的 `runnerOptions`；全部验收都是集成测试，F-49、F-62 用已有的假模型与本地引擎进程，不 mock 宿主框架。

## 决定

需要验收者决定的事项，阻塞项在前。决定要在 WP-89b 开始之前做出（C-1）。

1. **D-1 SHARED 模式的“实验性”标记：不能去掉。** 独立安全评审报告了一个主要问题（F-12），插件评审另有只影响或主要影响 SHARED 的主要问题。阻塞项：F-12（讲授媒体的检查与打开之间的竞态，独立评审）、F-07（tutor 读源码与其他文档）、F-13（读者与 tutor 经讲授拿到教师内容）、F-26（code-ref 绕过读取范围读到 `.git/config`）、F-02（请求体没有上限）、F-08（提问任务没有上限）、F-20（运行器输出的 XSS，在工作区站点的源中以查看者身份执行）、F-09（文档操作与待审阅的变更任务冲突），以及次要的 F-38（读者冒充 presenter、覆盖课堂摘要）、F-75（WASI 编译时运行没有内存上限）。全部合并后，在 compose 布局上运行 SHARED 的全部用例（`workspace/test/deploy.test.ts` 与 `cli/test/audience.test.ts`），再请独立安全评审针对上述各项与 WP-91b 的边界复查一次；没有主要问题时，去掉 architecture 9.4、`templates/workspace/compose/README.md` 与 SHARED serve 启动日志中的“实验性”标记，并把结果记入 wbs.md 的 WP-91 与 WP-89。
2. **D-2 P-25 回写：已决定删除**（验收者对简化 S05 的批注：超出范围且是攻击面）。由 F-22 实现，文档由 89f 同步。
3. **D-3 原则 2（微内核）的措辞**：建议 (a) 修订原则 2，在附录 B 记录：kernel 包也可以发布被多个插件或宿主共用、而内核运行时不使用的纯函数、纯数据与资源（如 `runner.py`）。本轮 C-2 还要向 kernel 增加这类函数，所以 (b)“另建 `@presmium/shared` 包”的代价更高、收益更小。由 F-86 写入。
4. **D-4 完整版与学生版之间的课堂跟随（P-55 × P-62）**：建议采用按章节 ID 跟随（F-85，契约增补 `NavigationPosition.section?`，由 89b 加入 host）。D17 使完整站点与学生站点分开成为 SHARED 的默认情形，按位置跟随会在教师内容在前时悄悄跟错。若不采用，在 ir.md 2.11 与技能中把限制写成作者须知，并让徽章在两边版本不同时提示。
5. **D-5 浏览器中 Python 的第三方包（P-23、P-102）**：建议本版本采用 (b)：文档改为“浏览器中只有标准库”，`presmium check` 对导入非标准库模块的 `live`/`both` 代码块给出警告（F-66）。(a) 在构建时取得 Pyodide 的 wheel 并随站点发布：需要构建时联网或固定一个完整的发行版，影响 K-13 可复现与依赖政策，也增加离线体积（与 D-6 相关），留到下一版本单独设计。
6. **D-6 service worker 的预缓存（N-03、P-51）**：建议网页形态只在 install 时预缓存外壳与内容，重型运行时在首次使用时缓存，另提供“保存以离线使用”的操作；幻灯片形态（讲者的机器）照旧全部预缓存（F-73）。这改变网页形态 N-03 的含义：只有用过一次的运行时或执行过“保存以离线使用”之后才能离线运行。需求 N-03、P-51 的验收措辞相应修订。若不采用，只把讲义正文改为“打开第一页时下载约 78 MB”。
7. **D-7 克隆音色的同意在缓存命中时也检查（N-08、P-133）**：建议采用（F-57）。撤回的同意应当阻止继续发布，WBS WP-82 记录的偏差由此消除。
8. **D-8 Python 末尾表达式的值（P-102）**：建议采用（F-64），与 Jupyter 及 notebook 形态一致。已提交的录制会在下一次构建时改变（末尾为表达式的代码块多出一个 `execute_result`）；示例讲义按需重新录制，并在交付说明中写明。
9. **D-9 webspeech 预览**：建议删除未使用的函数，并删去 WBS 与设计中的说法（F-63），等有了逐句编辑的界面再加。
10. **D-10 执行面板参数的显示名**：建议不改 `:params:` 的语法，由 webgpu 插件为自己的参数提供本地化的显示名与历史摘要（F-74）；通用的 `label` 写法推迟。
11. **D-11 工作区站点的译本（P-123 × P-122、M9）**：建议推迟到下一版本，保留现有警告；需求 M9 的完成标准注明多文档课程的语言切换要分别构建（文档由 89f 写入）。若采用，需在 kernel 的 `SiteDocument` 增加译本（89b），并在 web 的 `sites.ts` 中按单文稿的做法构建各语言（89f）。
12. **D-12 合成讲授的译文字幕（P-137）**：建议推迟，在 ir.md 9.5 写明 `script` 只有原文字幕（文档由 89f 写入）。
13. **D-13 改变行为的两项安全修复**：建议按修法采用。F-07：tutor 不再带自己的文件读取与搜索工具，只经 MCP 读学生视图，提问会话在空的临时目录中运行。F-08：新增设置 `settings.presmium.assistant.maxQuestions`，默认每个成员同时 2 个、全服务 16 个，超出返回 429，无人跟随的问题任务在 2 分钟后取消。

合并后（在 main 上）由验收者完成：`pnpm verify` 全部通过；F-69、F-71 等需要外部条件的用例在具备条件的机器上运行一次并记录；D-1 的复查；WP-89 中没有被本轮报告覆盖的交付项（WP-90 在 macOS 主机上补做的先行验证，结论决定 macOS 上是否登记 deltabox 的服务）。

## 验收者的决定（2026-10-17）

验收者（主代理）对上面各项的决定，各工作包按此实现：

- **D-1**：同意。SHARED 模式保持“实验性”。五个工作包全部合并后，验收者在 compose 布局上运行 SHARED 的全部用例，再请独立安全评审复查；没有主要问题时才去掉标记。
- **D-2**：已决定，删除 P-25 回写（F-22）。
- **D-3**：采用 (a)，修订原则 2，并记入附录 B（F-86，89f）。
- **D-4**：采用，按章节 ID 跟随（89b 在 host 中加入 `NavigationPosition.section?` 与按章节定位，89f 使用；F-85）。
- **D-5**：采用 (b)。浏览器中只有标准库，`presmium check` 对导入非标准库模块的 `live`/`both` 代码块给出警告（F-66）。Pyodide 的 wheel 留到下一版本。
- **D-6**：采用。网页形态只预缓存外壳与内容，重型运行时在首次使用时缓存，另有“保存以离线使用”；幻灯片形态照旧全部预缓存。N-03、P-51 的措辞由 89f 修订（F-73）。
- **D-7**：采用，缓存命中时也检查克隆音色的同意（F-57）。
- **D-8**：采用，末尾表达式的值作为 `execute_result`（F-64）。示例讲义的录制按需重新生成，并写入交付说明。
- **D-9**：采用，删除未使用的 webspeech 预览函数与 WBS、设计中的相应说法（F-63）。
- **D-10**：采用，不改 `:params:`，由 webgpu 插件提供本地化的显示名与历史摘要（F-74）。
- **D-11**：采用，推迟。保留现有警告，M9 的完成标准注明多文档课程的语言切换要分别构建（89f）。
- **D-12**：采用，推迟。ir.md 9.5 写明 `script` 只有原文字幕（89f）。
- **D-13**：采用 F-07 与 F-08 的修法：
  - tutor 不再带自己的文件读取与搜索工具，只经 MCP 读学生视图，提问会话在空的临时目录中运行；
  - `settings.presmium.assistant.maxQuestions` 默认每个成员同时 2 个、全服务 16 个，超出返回 429，无人跟随的问题任务在 2 分钟后取消。

**对组间约定的调整：`AgentTask.revert` 改由 89b 实现。** 89b 在 kernel 契约中加入 `revert()`，同时在助手的浏览器客户端（`packages/addon-assistant/src/client/agent.ts` 的任务对象，经助手自己的 `revert` 路由）实现它。这样 89d 的 F-15 不再依赖 89c，四个并行的工作包互不等待；C-1 中“89d 合并前变基到 89c”取消。89c 不需要再实现 `revert`，只让编辑面板改用 host 的 `trackAgentTask` 与 `task.revert()`。

**文档（C-9）**：89f 与其他组并行，按 C-9 列出的预期变化与 89b 已合并的提交写文档。合并后，验收者按各组的交付说明核对文档并补齐差异。
