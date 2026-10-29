# Presmium 架构

本文档定义工程结构、分层规则、跨上下文契约、插件约定与测试策略。领域概念见 `domain-model.md`，可编辑文稿与运行快照见 `ir.md`，公开接口与版本规则见 `api.md`，工作台的设计见 `design-dsh.md`。

**定位**：Presmium 是组件库与工具链，不是托管产品。它像一个增强的 JupyterLab：作者在自己的机器（或自己的容器）中编写、预览、讲授与发布文稿，读者阅读构建出的静态站点；分享就是分享文件（源码仓库或构建产物），协作通过 git。

- 核心（编译器、IR、渲染端、IR 运行时、CLI、静态产物）与产物离开模型也能工作，不引用 DeepSeek Harness。不改动源码的功能（放映、演讲者视图、课堂、运行代码、读者用自己的模型问答、放映中的讲授录制）属于产物；改动源码的功能属于工作台。
- 工作台是作者在浏览器中编写文稿的界面，实验性，不在语义化版本的承诺之内：工作台的包（`@lincyaw/workbench`、`@lincyaw/dsh`、`@lincyaw/studio`）为 0.x，DeepSeek Harness 发布正式版、并且升级闸门（13.5 节）在连续两个版本上通过之后才纳入 1.x 的承诺（`api.md`）。
- 工作区服务与工作台只供一个用户在自己的机器上使用，这个用户就是运营者，被执行的代码与 agent 以他的身份运行；安全措施只做纵深防御，不承担多个用户之间的隔离（10.1 节、第 11 节）。多人使用时每人一个容器，由 hub（例如 JupyterHub）为每个用户启动他自己的工作台，资源限额、空闲回收与模型用量由 hub 与模型网关管理；Presmium 自己不做多用户部署。
- 读者得到静态站点（可以是只给学生的版本）；读者向 AI 提问用他自己填写的模型服务，在他的浏览器中完成，站点不需要服务端（4.8 节）。
- 不在范围：账号与登录、成员与角色、按文档分享与授权、计费与用量结算、多租户托管、内容目录与审核、LMS 对接。这些由在 Presmium 之上构建的产品负责。

**设计原则**：

1. **依赖优先**：能由现成组件满足的，直接依赖它，通过公开的扩展接口定制；没有合适的组件才自研。不 fork、不打补丁、不做二次开发（第 12 节的依赖准则）。
2. **微内核**：内核只补齐宿主框架缺少的元能力：服务注册、锚点、检查命令、故障隔离；内核的运行时不认识“代码”“学生”“课堂”这类业务概念。多个插件共用的业务服务契约（如 `executor` 的 `RunRequest`、`session` 的 `SessionService`）放在内核包中：提供方与使用方是不同的插件，插件之间不互相引用，契约只能放在双方都依赖的包中，内核自身不使用它们（4.5、9.2 节）。被多个插件或宿主共用、而内核运行时不使用的纯函数、纯数据与资源（原始 HTML 的地址改写、分词、git 的隔离配置、编译时与浏览器共用的 `runner.py`）同样放在内核包中：它们没有状态，不登记服务。
3. **一切业务功能都是插件**：身份与课堂会话、代码引用、代码执行、测验、导出都是插件；官方插件与第三方插件用同一套接口。
4. **插件之间经服务接口协作**：插件依赖的是服务接口（例如 `session`），不是另一个插件；同一接口可以有多个实现，可以替换。
5. **纯文本，可复现**：文稿、动画、交互、插件配置都以纯文本声明；依赖版本由锁文件固定，同一提交在任何时间检出，渲染结果一致。
6. **文稿 IR 是唯一权威**：`lecture.json` 保存 Presmium 版本化的可编辑教学文稿。Web 与 agent 进入同一校验和事务，运行快照由编译器独立派生。编辑器内部状态、Markdown 和生成的 `dist/ir.json` 都不是第二内容入口。
7. **边界是标准协议**：远端执行用 Jupyter 内核协议，agent 读写文稿用 MCP，富输出用 nbformat 的输出模型，字幕与章节用 WebVTT，修改历史用 git。Presmium 对每种边界只实现一个客户端，不按平台或厂商写插件；厂商专有的接口只出现在一个适配器中（第 3 节）。

## 1. 编译管线

```
lecture.json（TeachingDocument）+ 引用的代码与媒体
      │  @lincyaw/kernel：Schema 与领域校验；工作区：版本事务与历史
      │  @lincyaw/compiler：完整状态解析 → 插件步骤 → 执行（缓存）→ 运行校验
      ▼
     运行快照 IRDocument（packages/kernel/src/ir.ts）
      │
      ├── @lincyaw/web              网页：预先打包的查看器（站点外壳 + @lincyaw/viewer，IR 运行时，实时更新）
      ├── @lincyaw/render-slides    幻灯片：查看器的幻灯片页，以及在 Chromium 中打印它的 PDF、图片、PowerPoint 导出
      ├── @lincyaw/render-notebook  Jupyter .ipynb
      └── 插件提供的渲染端            例如 lecture：讲授计划与合成的音频（addon-lecture）
```

- 可编辑文稿的唯一入口是 `lecture.json`；精确 Schema 与领域契约在 `packages/kernel/src/contracts/document.ts`，决策见 [文稿 IR RFC](rfc-document-ir.md)。保存不等待编译，渲染端只读派生快照。
- 网页与幻灯片是同一个查看器的两种页面，运行同一批插件组件与同一个宿主适配（`packages/web/src/client/host.ts`）；组件只依赖 `@lincyaw/host`。
- 文稿与快照边界见 `ir.md`，字段与渲染接口以 `packages/kernel/src/contracts/` 和 `ir.ts` 为准。
- `presmium dev` 与 `presmium serve` 的进程中另有一个服务端 `@lincyaw/server`：挂载插件的服务端贡献（远端环境的代理、语音服务、讲授的上传、课堂同步）、MCP 端点与控制通道，统一处理请求来源、凭据与确认（第 10 节）。静态构建产物不依赖它：需要服务端的功能在静态产物中隐藏或降级。
- 服务端只供运行它的那个用户使用（上文“定位”，10.1 节）：一切在一个进程中，凭据在这个进程的环境里，没有登录。`presmium serve --host` 可以让这个用户在局域网中的其他设备上使用；多人使用时每人一个容器。
- 核心与产物不依赖模型，也不引用 DeepSeek Harness（dsh）。面向作者的工作台是 dsh 的一个定制发行版 `presmium studio`，产物经预览协议嵌入其中（设计见 `design-dsh.md`，结构与契约见第 13 节）。

### 1.1 增量编译与资源预算

`Compiler` 直接读取和校验规范化 JSON，解析稳定步骤状态并 lowering 为运行节点；不再运行 MyST tokenizer、片段解析或按源码行的章节缓存。编辑延迟先由父页面原生编辑器和文稿事务决定，独立测量保存回执、快照编译与预览可见时刻。插件步骤、公式编号、引用解析、代码执行与运行 IR 校验处理派生快照。
网页开发预览还缓存未变化章节的发布结果，最多 2048 项、键与序列化结果的 UTF-16 大小合计 16 MiB。包含本地资源链接、组件资源或原始 HTML 的章节每次重新发布，避免漏掉外部文件变化；只读的已发布章节可共享给连续两版预览，差异计算先比较对象身份，再比较内容。搜索文档按章节 ID 查 Map，避免逐个章节扫描整份 IR。

单文稿的多媒介构建逐个运行渲染端，避免多套构建工具的线程池同时启动。同一宿主进程一次只运行一份顶层编译，`CompilerOptions.priority: 'interactive'` 的任务优先于排队的后台任务。同步 JSON 校验与单个插件步骤不提供硬实时保证。`compile({ signal })` 支持在协作点取消，也将信号传给执行器；取消的执行结果不写入缓存，会话在 `finally` 中关闭。插件步骤尚无取消契约，必须等其返回后检查取消。工作区的保存事件合并窗口为 10 ms，编译期间的新修改取消旧任务，只发布最终版本。工作区站点只在请求文档时启动该文档的编译与预览，单文稿目录也不在服务启动时预编译。

子进程分两档资源（`@lincyaw/kernel/node` 的 `threadBudget`、`resourceEnvironment`、`spawnInteractiveNode`）。**交互**：作者在等的进程，即 studio 启动的工作区服务与 dsh，以及构建查看器与文稿代码包的进程，按机器当前的状态取线程：空闲逻辑处理器（总数减去一分钟负载，Windows 上没有负载数据时按全部计）的四分之三，至少 1、最多总数减 1 且不超过 8，空闲内存不足 2 GiB 时最多 2；常见原生线程池（esbuild 的 `GOMAXPROCS`、Rayon、OpenMP 等）、V8 后台线程池与之相同，libuv 池至少 4，进程优先级保持普通。**后台**：构建、导出、编译期与本地的代码执行，原生线程默认 1 个、libuv 池最多 2 个，V8 后台线程 1 个，尽可能使用低于普通应用的进程优先级。运营者的 `PRESMIUM_MAX_THREADS` 给两档都设上限，后台档最多为逻辑处理器的一半，单核环境最少保留 1 个执行线程；后台子进程在交互进程之下仍取后台档。线程环境变量与进程优先级是软限制，不限制任意第三方插件自己创建的进程，也不替代容器的 CPU、内存配额。

工作台按当前选中的媒介请求预览；幻灯片的预览是网页预览的同一个查看器页面加 `form=slides`，切换媒介不启动另一个服务。预览答复同时绑定文稿、媒介与请求序号，切换后到达的旧答复不覆盖当前页面。页面的模块加载、初始化与 iframe 重载另有开销，不能用返回预览地址的时间代表页面可见时间。

网页与幻灯片的页面都由**预先打包的查看器**显示（`packages/web/src/node/viewer-app.ts`、`document-bundle.ts`，页面 `packages/web/src/app/`），像 PDF 查看器对待每一份 PDF：网页形态的运行时（IR 运行时、站点外壳、宿主、插件的浏览器模块）为用到的一组插件打包一次，文稿只是数据。工作台、`presmium dev` 与 `presmium serve` 的页面和构建的站点用的都是它。

- **查看器**：Vite 构建，插件的组件、浏览器插件与 viewer 插件都是按需加载的分块；React、React DOM、Presmium 的包给浏览器的子路径与插件 `exports` 中除 Node 端入口外的子路径（第 3 节）各是一个入口，由页面的导入映射（import map）按名字给出；入口的导出（含默认导出）按打包器解析的结果。插件包的 `vite.config.ts`（第 3 节）给构建加上 Vite 插件；TSX 使用 React 的自动 JSX runtime。构建的站点另用查看器的服务端渲染构建（`buildViewerServer`）把每页先渲染成 HTML。按 Presmium 的源码、构建工具的版本与各插件的指纹（源码目录为文件的路径、大小与时间，`node_modules` 中的包为名字与版本）保存在用户的缓存目录（`$XDG_CACHE_HOME/presmium/viewer-app/`），所有工作区与会话共用，一周没用过的删除，最新的三份保留。一组插件只多不变时，旧查看器的页面照常运行；Presmium 或插件的代码改了，它们重载到新的查看器。
- **文稿的代码包**：文稿自己的组件、浏览器插件与 viewer 插件，加上插件为它生成的文稿模块（`PresmiumNodePlugin.documentModules`，如动画插件的场景列表），打成一个小包，查看器导入映射中的名字不打进去；查看器中插件对文稿模块的导入是一个代理，读当前文稿的包给出的默认导出。包按代码与内容命名，记下构建它的文件的大小与时间；文稿目录的文件变化时重新核对，代码变了才重新构建，页面随后重载，只改文字时不重载。
- **构建**：站点服务（见下）在一个常驻的子进程中构建查看器与代码包（`viewer-build.ts`，交互档资源；30 秒没有任务就退出），两者同时构建（包按名字导入的模块在查看器构建之前就能算出）；站点的构建在构建它的进程中做同样的事。示例的两讲：查看器约 1.3～2.7 秒（只在第一次），一讲的代码包 0.05～0.6 秒。
- **构建的站点**：查看器复制一次，在站点路径下的 `_app/<键>/`（键按内容，任何检出中相同）；每份文稿在自己的站点路径下有 `ir.json`、搜索索引 `search.json`（MiniSearch，内核的分词 `tokenize`）、代码包 `_code/<键>/document.js`、发布的文件、插件的运行时文件（4.2 节的 `assets`）、`public/` 与字体的许可证。每页在构建时先渲染成 HTML，浏览器中查看器再接管它（hydrate）。
- **服务**：网页与幻灯片渲染端的开发服务器（`dev`、`devSite`）都是一个站点服务（`packages/web/src/node/site-server.ts`，在 `presmium dev` 或工作区服务的进程中）。`<base>__app/` 下是查看器的路由：`view?document=`（工作台中一份文稿的页面，带导入映射、`<base>` 与文稿的地址）、`ir`（`ETag`，修订号在 `Presmium-Revision` 中）、`events`（SSE：`ir` 带变化的章节，页面没有它所基于的修订时读新 IR；`reload` 重载）、`search`、`source`（`presmium dev` 中在作者的编辑器里打开源码行）、查看器与代码包的文件（地址带内容的键，`immutable`）。文稿的站点路径下是它的页面、发布的媒体、插件的运行时文件与 `public/`。`presmium dev` 中站点服务把 `/__presmium/`（含 WebSocket）代理到服务端（第 10 节）；工作区服务把站点的路径直接转发到站点服务（`SiteDevServer.target`），转发的连接保持复用（keep-alive）。
- **打开**：工作台的权威正文入口不等待编译。显式 `preview` 先等查看器准备，再确认文稿代码包对应当前工程文件，成功才答复查看器页面（`SiteDevServer.app`）；准备或构建失败通过非成功 HTTP 回应交给工作台，不以旧代码包或站点地址冒充当前版本。查看器初始等待为 15 秒，随后当前代码包校验可能继续等待构建，不构成整个请求的严格 15 秒上限。已有代码包与不可变缓存保留，预取仍为尽力准备。

工作台在作者动手之前预先准备（`preview` 的 `prefetch=1`，只开始准备、立即答复）：鼠标在文稿列表的一项上停 150 ms 或键盘焦点到达它时，以及工作台启动在文稿列表上、页面空闲时对上次打开的文稿（浏览器的 `localStorage`），工作区服务编译这份文稿，准备查看器与它的代码包（`SiteDevServer.warm`）。

工作台的每个预览面板最多保留两个已加载的 iframe，按最近使用顺序淘汰；非当前预览先经 `activity` 确认停止，再启动另一份文稿。页面暂停时真正卸载布局内的文稿、工具栏、播放器等组件，停止插件内核与控制流，保留该窗口的模块和文稿数据；闲置两分钟后移除。恢复时读取最新已发布 IR，配置或语言变化、暂停超时或缺少能力时销毁重载。组件、viewer、client 模块、`vite.config.ts` 及给出运行时文件或文稿模块的 Node 端入口所在的每个包（包括文稿本地模块：文稿目录的 `package.json`，没有时为工作区根目录的）须在 `package.json` 声明 `presmium.preview.restartable: true`；内核插件还须显式声明 `PluginDefinition.restartable: true`，承诺 `dispose` 完整释放后台资源且同一份定义可再次 `setup`。任一来源未声明、加载失败或混入不支持的插件时不缓存该预览。content、guide、lecture、speech、motion 包与示例工作区声明了此能力（讲授的录制在面板卸载时停止媒体轨道与上传计时器，动画场景在组件卸载时 `dispose`），带执行等后台任务的插件继续重载。网页与幻灯片的预览是同一种页面，规则相同。

工作台与放映复用同一网页查看器，通过预览协议定位与切换运行时视图。网页预览暂存最新 `go` 指令，异步视图插件注册且可用后执行。放映层、播放器与字幕的层级和留白由设计令牌定义，按帧导出恢复覆盖层以保持画布大小。作者工作区、播放器生命周期和目标交互以 [UI/UX RFC](rfc-workbench-uiux.md) 为准，不能由运行时视图名推导另一套导航入口。

网页 IR 与工作台 IR 端点支持 `ETag` / `If-None-Match`，每次恢复仍验证当前修订，未变化时返回 304，省去大份 IR 的传输与解析。工作台客户端最多保留两份已解析 IR，响应文本的 UTF-16 大小合计 16 MiB；这是缓存计量上限，不是对象堆内存硬限额。修改后仍返回新快照，旧请求不能覆盖较新的缓存或当前文稿的 IR。

同一文稿正在进行的 IR 请求合并，保存事件若在读取期间到达且修订仍不一致，再验证一次。网页 Markdown 的纯 HAST 按 viewer、文稿对象、Markdown 节点对象、章节前缀和语言缓存，每份文稿最多 256 项、序列化 HAST 的 UTF-16 大小合计 4 MiB；旧文稿通过弱引用回收。这是数据缓存，不保留 VNode、组件、DOM 或订阅。引用标题、脚注等内容因文稿对象变化而重新转换。

性能评估分别记录冷启动、同进程首次编译、单行修改编译、保存到 IR 事件、保存到浏览器可见更新。记录 CPU 时间和实际等待时间，在相同负载下交替比较修改前后版本；首轮初始化、外部代码执行和网络请求不混入普通编辑的延迟。测试中的时间预算与本机实测值分开报告。工作台首开与切回讲义用 `node scripts/bench-workbench-preview.mjs /private/tmp/preview.json --rounds 3` 单独测量：一套隔离工作台与 Chromium，点击后等预览协议 ready 且首章节可见，不构建完整示例；加 `--example` 测示例的两讲（带动画）。首次测量见 [工作台加载记录](benchmarks/workbench-preview-2026-10-21.md)，后续缓存与剩余瓶颈见 [预览缓存记录](benchmarks/preview-cache-2026-10-21.md)。

## 2. 仓库结构

```
presmium/
├── packages/
│   ├── kernel/              @lincyaw/kernel                    纯 TS 共享内核：契约、服务注册、锚点、检查
│   ├── host/                @lincyaw/host                      形态无关的宿主接口与React hooks
│   ├── compiler/            @lincyaw/compiler                  可编辑文稿校验、运行快照编译、执行缓存
│   ├── cli/                 @lincyaw/cli                       presmium new | build | dev | ir | check | serve | studio；./testing 供各包的集成测试运行 CLI
│   ├── presmium/            @lincyaw/presmium                  pnpm add -g @lincyaw/presmium：CLI 连同渲染端与官方插件；转交给项目里装的 presmium
│   ├── create-presmium/     create-presmium                     presmium new、pnpm create presmium：新建讲义、工作区或插件项目（模板在打包时从仓库复制）
│   ├── render-slides/       @lincyaw/render-slides             幻灯片渲染端（@lincyaw/web/slides）与导出：PDF、图片、PowerPoint
│   ├── render-notebook/     @lincyaw/render-notebook           notebook 渲染端（.ipynb）
│   ├── viewer/              @lincyaw/viewer                    IR 运行时：动态渲染、运行时视图（含幻灯片）、实时更新
│   ├── web/                 @lincyaw/web                       网页渲染端：预先打包的查看器、站点外壳与宿主适配，站点的构建与站点服务；./slides 是幻灯片页与打印
│   ├── addon-stage/         @lincyaw/addon-stage        放映：黑屏、冻结画面、幻灯片上的圈画
│   ├── addon-code/          @lincyaw/addon-code
│   ├── addon-exec/          @lincyaw/addon-exec
│   ├── addon-exec-local/    @lincyaw/addon-exec-local   容器执行、环境复刻
│   ├── addon-guide/         @lincyaw/addon-guide
│   ├── addon-content/       @lincyaw/addon-content
│   ├── addon-motion/        @lincyaw/addon-motion       动画场景：GSAP、Anime.js、Motion、Three.js、Remotion、D3，按步内时间画出
│   ├── addon-publish/       @lincyaw/addon-publish
│   ├── addon-session/       @lincyaw/addon-session      会话与网络同步
│   ├── addon-classroom/     @lincyaw/addon-classroom
│   ├── classroom-server/    @lincyaw/classroom-server          y-websocket 服务
│   ├── language-server/     @lincyaw/language-server           语言服务（诊断、跳转、悬停、补全、预览同步）
│   ├── vscode/              presmium-vscode                     VS Code 扩展（预打包）
│   ├── server/              @lincyaw/server                    服务端：挂载服务端贡献、请求来源的检查、确认、控制通道、反向代理（Node）
│   ├── mcp/                 @lincyaw/mcp                       agent 环境：MCP 工具与资源；presmium-mcp（stdio）
│   ├── workspace/           @lincyaw/workspace                 工作区服务 presmium serve：文档管理、修改历史（REVISIONS）、审阅、工作区站点；templates/document/ 是随包发布的文档模板
│   ├── addon-exec-wasi/     @lincyaw/addon-exec-wasi    WebAssembly 后端（Runno）
│   ├── addon-exec-webgpu/   @lincyaw/addon-exec-webgpu  浏览器 GPU 后端（WGSL、jax-js），构建时在 Chromium 中录制
│   ├── addon-exec-jupyter/  @lincyaw/addon-exec-jupyter 远端环境（Jupyter 内核协议）与浏览器终端
│   ├── addon-assistant/     @lincyaw/addon-assistant    读者问答：读者在浏览器中经自己的模型服务提问（`ASK`）
│   ├── addon-lecture/       @lincyaw/addon-lecture      讲授轨、录制、回放、lecture 渲染端、{cue}/{say}、导出视频（presmium-lecture）
│   ├── addon-speech/        @lincyaw/addon-speech       语音服务（v1/* 的语音协议）、引擎适配、合成缓存（presmium-speech）
│   ├── design/              @lincyaw/design                    令牌、pm-ui-* 的类、字体与图标，产物与工作台共用，没有框架
│   ├── workbench/           @lincyaw/workbench                 工作台的 React 面板，工作区服务的客户端，预览协议的工作台一侧
│   ├── dsh/                 @lincyaw/dsh                       dsh 的 bundle（宿主部分与预编译的客户端部分）
│   └── studio/              @lincyaw/studio                    presmium studio，组装 profile，启动与监管 dsh 和工作区服务
├── templates/
│   ├── env/                 远端环境：compose/（compose.yaml、compose.gpu.yaml、compose.gvisor.yaml、devcontainer.json）、kubernetes/（文档）
│   ├── workspace/           工作区：presmium.workspace.yaml 与 .gitignore 的模板
│   └── plugin/              插件项目的模板（create-presmium 用）
├── examples/
│   └── animations/          公开示例工作区：两讲完整中文课程与九份按主题组织的功能导览
├── site/                    文档站：一个 Presmium 工作区，用 Presmium 自己构建（中英双语，接口参考由 TypeDoc 生成）
├── e2e/                     Playwright 测试，每个上下文一个 spec；测试文稿在 e2e/fixtures/<组>/
├── scripts/                 结构检查：check-layering.mjs、check-skills.mjs、check-plugins.mjs、check-packages.mjs（发布的包）、check-tokens.mjs（令牌）、check-types.mjs（类型）；consumer.ts（消费者安装）
├── .changeset/              版本与发布（changesets，预发布模式 rc）；README.md 是哪些包公开发布的表
├── .github/workflows/       CI（ci.yml）
├── .agents/skills/          仓库技能：presmium-author、presmium-animate（带效果合集 `gallery/`，是私有工作区包 `presmium-animate-gallery`，在原处构建以检查场景）、presmium-present、presmium-develop（.claude/skills 是指向它的软链接，AGENTS.md 是指向 CLAUDE.md 的软链接）
└── docs/
```

## 3. 包内分层

每个插件包的目录如下：

```
packages/addon-<ctx>/
├── package.json          keywords 含 presmium；exports 见下
├── src/
│   ├── domain/           领域层：纯 TS，不得引用 React、React DOM、@lincyaw/host、node:*
│   ├── shared/           两端共用层（可选）：Node 与浏览器都运行的代码，如运行器、协议的客户端
│   ├── node/             Node 适配器：指令、编译步骤、执行器、渲染端扩展、检查项、运行时文件、服务端贡献
│   └── client/           浏览器适配器：plugin.ts（内核插件）、viewer.ts（IR 运行时扩展）、服务实现、React hooks
├── components/           组件：查看器按文件名注册到 IR 运行时，两种形态共用
└── vite.config.ts        可选：查看器构建用的 Vite 插件与 JSX 配置（见下）
```

依赖规则：

| 位置 | 可以依赖 | 不得依赖 |
|---|---|---|
| `src/domain/` | `@lincyaw/kernel`、纯计算库 | React 与 React DOM、`@lincyaw/host`、Node 内置模块（`node:fs` 与 `fs` 都算）、`src/domain/` 之外的相对路径 |
| `src/shared/` | `src/domain/`、`@lincyaw/kernel`、两端都能运行的库 | React 与 React DOM、`@lincyaw/host`、`@lincyaw/kernel/node`、Node 内置模块、`src/shared/` 与 `src/domain/` 之外的相对路径 |
| `components/`、`src/client/` | `src/domain/`、`src/shared/`、`@lincyaw/kernel`、`@lincyaw/host`、React、浏览器中运行的库 | 其他插件包（见下） |
| `src/node/` | `src/domain/`、`src/shared/`、`@lincyaw/kernel`、Node 库 | React 与 React DOM |
| `packages/server/`、`packages/mcp/`（整个包都是 Node 端） | `@lincyaw/kernel`、`@lincyaw/compiler`、Node 库；`server` 另可依赖 `@lincyaw/mcp` | React 与 React DOM、浏览器端的包（`@lincyaw/viewer`、`@lincyaw/web`、`@lincyaw/host`）；`mcp` 不依赖 `@lincyaw/server` |

读取编译结果的纯函数在 `@lincyaw/kernel`（`src/reading.ts`：`chapters`、`isChapterTitle`、`blockVisible`、`blockState`、`narrationAt`、`sectionNarration`、`mdastText`、`blockText` 与搜索的分词 `tokenize`），IR 运行时、网页渲染端与 MCP 都从内核引用，`mcp` 因此不依赖 IR 运行时。

此外：任何包都不引用 vitepress 与 `@slidev/*`（两种形态都是查看器的页面）；任何包（测试除外）都不引用插件包 `@lincyaw/addon-*`，渲染端与 IR 运行时也不例外，相对路径不离开本包，共用的契约放在 `@lincyaw/kernel` 或 `@lincyaw/host`。内核除 `src/node/` 之外不引用 UI 框架、Node 内置模块与自己的 `src/node/`，`src/node/` 不引用 UI 框架。`scripts/check-layering.mjs` 检查以上全部规则（规则名 `domain is pure TS`、`shared code runs in Node and in the browser`、`kernel is framework-free`、`kernel/node is framework-free`、`node adapters are framework-free`、`no package uses Slidev or VitePress (both forms are the viewer app)`、`no package uses an addon`、`relative imports stay in their package`），扫描 `.ts`、`.tsx`、`.vue`、`.js`、`.jsx`、`.mjs`、`.cjs`、`.mts` 文件，静态 `import`、`export ... from`、动态 `import()` 与 `require()` 都算引用。

服务端、MCP 与外部协议的规则：

- `@lincyaw/server` 只由 `cli` 与 `workspace` 引用。插件经 `ServerContext`、`RequestContext`、`APPROVALS` 与 `MCP_ENDPOINT` 使用服务端，浏览器端经 `@lincyaw/host` 的 `useServer()`。
- `@lincyaw/mcp` 只由 `server` 引用（挂载 `/mcp`）。MCP 服务需要的宿主能力由它自己声明为接口 `McpHost`（`@lincyaw/mcp` 的类型：文档列表、编译结果与诊断、检查、构建、运行代码块、放映位置与课堂状态、确认），服务端在 `ServerHost` 与控制通道之上实现它，`presmium-mcp` 直接在编译器上实现它；`mcp` 不引用 `server`，两者之间没有循环依赖（10.2 节）。
- 插件包（`addon-*`）不引用 `@lincyaw/server`、`@lincyaw/mcp`、`@lincyaw/workspace` 与 `@lincyaw/web`；`workspace` 与 `mcp` 也不引用插件包（已有的“没有包引用插件”规则）。
- 外部协议与厂商的客户端各只在一个适配器中：`@modelcontextprotocol/*` 只在 `mcp`（各包的 `test/` 另算）；`@jupyterlab/services` 与 `@xterm/*` 只在 `addon-exec-jupyter`；`mediabunny` 只在 `addon-lecture`；动画库 `gsap`、`animejs`、`motion`、`three`、`remotion` 与 `@remotion/*` 只在 `addon-motion` 的 `src/client/`；`simple-git` 只在各包的 `src/node/`。语音服务提供方没有 SDK，它们的接口只出现在 `addon-speech/src/node/engines/`，由代码评审守护。

`scripts/check-layering.mjs` 中对应的规则：`node packages are framework-free`（`server`、`mcp` 的 `src/` 不引用 UI 框架与浏览器端的包）；`only cli and workspace use the server`；`plugins use contracts, not the hosts`（`addon-*` 不引用上述四个包）；`protocol clients stay in their adapter`（上一条列表中的包名只出现在给定的目录中）。`@lincyaw/mcp` 的引用规则见下文工作台的规则。

工作台的规则（`design-dsh.md` 3.2 节）：

- **产物不认识工作台**：产物的包（`web`、`viewer`、`render-*` 与各插件包）不引用 `@lincyaw/workbench`。
- **dsh 只在一处**：`@deepseek-ai/*` 只出现在 `packages/dsh` 与 `packages/studio` 中。
- **面板不认识宿主**：`@lincyaw/workbench` 不引用 UI 框架、`@lincyaw/host` 与 `@deepseek-ai/*`；`@lincyaw/design` 只允许引用无框架的 Lucide 图标节点，不引用 UI 框架或业务包。
- **mcp 的使用者**：“只有 server 使用 mcp”放宽为“server 与 dsh 使用 mcp”；`@modelcontextprotocol/*` 仍只在 `mcp` 中，bundle 经 `@lincyaw/mcp` 导出的客户端一侧使用 MCP。

`check-layering.mjs` 的规则 `only the server and the dsh bundle use mcp`、`DeepSeek Harness only in dsh and studio`、`the workbench's panels know no host`、`the design system only uses framework-free icons`、`outputs do not use the workbench` 检查模块引用；另一项检查不看引用：各包 `package.json` 的依赖（含开发与对等依赖）中 `@deepseek-ai/*` 只出现在 `dsh` 与 `studio` 中。`check-packages.mjs` 让 `@lincyaw/workbench`、`@lincyaw/dsh`、`@lincyaw/studio` 有自己的 0.x 版本（不计入统一版本），`package.json` 的 `presmium.generated` 列出打包时才生成、不入库却在 `files` 中的路径（`@lincyaw/dsh` 的 `skills` 与预编译的客户端）。

`package.json` 的 `exports`：

| 入口 | 指向 | 用途 |
|---|---|---|
| `./domain` | `src/domain/index.ts` | 领域层 |
| `./client` | `src/client/index.ts` | 浏览器端 API |
| `./presmium` | `src/node/presmium.ts` | Node 端插件入口，默认导出 `PresmiumNodePlugin` |

插件包可以在根目录带 `vite.config.ts`（随包发布，不在 `exports` 中），默认导出 `{ plugins }`：查看器与文稿代码包的构建加上这些 Vite 插件。例如远端环境插件通过它把 `@jupyterlab/services` 导入的 `ws` 换成该包自己的垫片（`packages/addon-exec-jupyter/vite.config.ts`，4.6 节）。React TSX 由 Vite 的自动 JSX runtime 编译，不需要额外的 React Vite 插件。

源码直接以 `.ts`、`.tsx` 发布，不预编译；例外是 `presmium-vscode` 与 `@lincyaw/dsh` 的客户端部分（dsh 的客户端运行时只加载它的工厂格式，`design-dsh.md` 7.8 节）。Vite（查看器与文稿代码包的构建）与 Vitest 直接处理 TS；CLI 通过 jiti 加载 TS（装在 `node_modules` 中的 `.ts` 不被 Node 剥离类型）。

VS Code 扩展的安装包包含语言服务、编译器与网页渲染运行时，编辑与布局交给 VS Code；不依赖工作台。`pnpm --filter presmium-vscode package:vsix` 按工作区锁文件部署生产依赖，以普通目录写入平台专用 VSIX；有 Node.js 22.19 以上即可启动，文稿的额外插件仍由文稿项目提供。`.github/workflows/vscode.yml` 在 macOS、Windows、Linux 的 x64 与 ARM64 上构建，解压到仓库外验证真实预览服务，再把产物上传为 Actions artifact；GitHub Release 发布时附加六个安装包。完整安装与构建说明见 `packages/vscode/README.md`。

## 4. 跨上下文契约

契约的唯一来源是 `packages/kernel/src/contracts/`（内核，`contracts.ts` 汇总导出；目录中只有类型、服务令牌与协议的解析，辅助函数在 `src/` 根目录）与 `packages/host/src/contracts.ts`（宿主）。以下为要点。

### 4.1 插件与服务

- `defineService<T>(id)` 创建服务令牌；`PluginDefinition = { manifest, setup(ctx), dispose? }`。
- 清单声明 `provides`、`requires`（可选依赖标记 `optional`）、兼容的内核版本范围 `kernel`、所需能力 `capabilities`（只声明，不强制）。
- `PluginContext` 提供 `config`、`provide`、`get`、`tryGet`、`events`、`log`、`mode`。

### 4.2 Node 端插件

各插件包的 `./presmium` 入口默认导出 `PresmiumNodePlugin`（定义在 `contracts.ts`）：

| 字段 | 作用 |
|---|---|
| 版本化定义 | 通过 `TeachingDocument.definitions` 声明实现、参数与状态；当前文稿编译不调用 MyST 指令解析 |
| `passes` | IR 编译步骤 |
| `executors` | 编译时执行用的 Node 端执行器 |
| `resolvers`、`anchors`、`checks` | 锚点解析器、文稿引用的锚点、检查项 |
| `renderer` | 本插件提供的渲染端（网页、幻灯片、notebook 各是一个插件） |
| `rendererExtensions` | 本插件为其他渲染端提供的组件转换，例如 notebook 中组件如何变成单元格 |
| `assets(ctx)` | 插件的浏览器代码运行时载入的文件（`RuntimeAssets`：名字、文稿站点路径下的目录 `prefix`、文件与媒体类型 `types`、构建复制的 `emitted`（省略时全部）、磁盘上的路径 `source(file)`），如 Pyodide、WASI 运行时与 jax-js：开发服务器在 `<base><prefix><file>` 提供，构建复制到那里。`ctx` 为 `{ deckDir, workspaceRoot, config }`，`config` 是本插件的 `presmium.<插件 ID>`（编译步骤写回的值也在其中）。浏览器代码经 `@lincyaw/host` 的 `siteBase()` 得到文稿的站点路径 |
| `documentModules(ctx)` | 插件浏览器代码导入的、内容随文稿而变的虚拟模块（如文稿的场景文件列表），按模块 ID 给出源码，`ctx` 同上；只读它们的默认导出。查看器预先打包、不带文稿，从文稿自己的代码包得到它们（1.1 节） |
| `exporters` | 文稿的重的输出，按需作为工作区服务的任务生成（13.7 节）：`Exporter` 有 `id`（不与渲染端重名）、按语言的 `label`、`available(doc, config)` 与 `run(ctx)`。`ctx` 给出文稿目录、本插件的配置、任务自己的空目录 `outDir`、取消用的 `signal`、`progress(phase, done?, total?)`、`log(line)`、发起导出的人的选择 `options`（由导出器自己说明，如 `presmium-export` 的 `--with-clicks`），以及 `build(renderer, config?)`：在根路径以该渲染端构建文稿（`config` 盖在文稿对这个渲染端的配置之上）并给出输出目录。`run` 返回 `files`（第一个是要先打开的）、视频的 `captions`（语言到字幕文件）与 `warnings`。渲染端所在的包也可以声明（幻灯片渲染端的 `pdf`、`png`、`pptx`），讲授插件的 `video` |
| `version`、`kernel` | 插件的版本（与 `package.json` 一致，官方插件在 Node 端与浏览器端都读 `package.json`）与兼容的内核版本范围；内核版本 `KERNEL_VERSION` 是插件契约的版本，与包的版本分开，现在为 `1.0.0`，契约有不兼容的改动时升主版本（`site/reference/lecture.json` 的版本规则）。编译器不加载范围不含当前内核的插件，渲染端也不使用它（查看器不加载它的浏览器部分）。字段在契约中是可选的，官方插件都声明，`scripts/check-plugins.mjs` 检查（并入 `pnpm test`） |
| 结构化讲稿与内容扩展 | 发音、cue 与扩展节点由文稿实体 lowering，运行渲染树不形成第二个作者语法 |
| `services(ctx)` | Node 端服务实现，例如语音插件的 `SPEECH`；编译步骤、渲染端、检查项与服务端贡献经 `service(token)` 使用（4.6 节）。`ctx.settings` 是运营者给本插件的设置（4.7 节），不来自文稿 |
| `environments` | 具名环境的提供方，键为环境的 `kind`（4.6 节） |
| `server(ctx)` | 服务端贡献：挂在 `/__presmium/<插件 ID>/` 下的路由与反向代理（4.7 节、第 10 节） |
| `tools` | agent 工具，MCP 服务以工具暴露（4.8 节） |
| `operator` | 运营者插件：列在运营者设置 `settings.presmium.workspace.plugins` 中时，每份文档都加载它（所有命令），文稿不必写进 `plugins`。 |

插件的 `package.json` 以 `peerDependencies` 声明它支持的 Presmium 版本：插件共用应用中的 `@lincyaw/kernel`、`host`、`viewer`、`compiler`，这些只作为对等依赖，不作为依赖（`scripts/check-packages.mjs` 检查官方插件）。加载器在导入插件之前比较已安装的版本，不满足时不导入它（导入本身可能失败），报告 `presmium.plugins` 的错误（`plugin "X" (name ver) is not loaded: it needs @lincyaw/kernel ^9.0.0 (peerDependencies),and 1.0.0-rc.0 is installed`），构建不崩溃，只是没有这个插件；`kernel` 范围不满足时同样如此。

从注册表安装时：Presmium 的包以 TypeScript 源码发布，Node 不剥离 `node_modules` 中 `.ts` 的类型，启动 Node 子进程的地方（查看器的构建进程，`spawnInteractiveNode`）以 `--import` 加载 `@lincyaw/kernel/node` 的 `TYPESCRIPT_IMPORT`（`strip-types.mjs`）。查看器的构建结果在用户的缓存目录中（1.1 节），不在文稿或工作区中。站点在每份文稿的 `<base>presmium/fonts/LICENSE` 带上字体的许可证（OFL）。消费者安装测试见第 7 节。

插件从哪里加载（10.2 节）：`presmium dev`、`serve`、`build`、`check` 都按文稿的 `plugins` 从文稿目录向上查找 `node_modules`，也接受相对于文稿的路径，替换渲染端的 `renderers.<id>.package`（`ir.md`）同样如此；随 CLI 安装的 Presmium 自己的包（渲染端）在找不到时从 CLI 加载。运营者插件另列在工作区配置的 `settings.presmium.workspace.plugins` 中，安装在工作区根目录，每份文档与工作区首页都加载它们。官方插件的包名是 `@lincyaw/addon-*`：头部仍写旧名 `@lincyaw/slidev-addon-*` 时按新名加载，并给出信息级诊断 `presmium.plugins`；仍列出 `@lincyaw/addon-core` 时跳过它，信息级诊断说明不再需要它（编译器 `plugins.ts` 的 `listedPlugins`）。

- 编译步骤 `IRPass` 可以声明 `after: 'execute'`，在编译时执行之后运行，此时代码节点已有 `outputs`（执行插件以此把编译时输出写进执行面板的 `fallback`）。编译器的 `build(compilation, { outDir, to, base? })` 的 `base` 换掉每个渲染端的站点路径；`exportDocument(compilation, id, { outDir, options?, signal?, progress?, log? })` 运行文稿的一个导出器（工作区服务的任务与 `presmium-export` 用它），导出器的 `ExportContext.build` 在根路径（`base` 为 `/`）构建，构建写在导出目录的 `.build/` 中，导出结束时删去。构建报告的每个输出给出 `outDir`、`workDir` 与站点路径 `base`。
- 渲染上下文 `RenderContext` 另有 `log(line)`（构建工具的输出逐行交给运行它的任务；启动工具的渲染端给出，如网页与幻灯片渲染端准备查看器时）、`lang`（文稿语言）、`pluginDirs`（编译器加载的插件目录）、`extensionFor(node)`（各渲染端选中同一插件的扩展）、`portable(value, from)`、`localAsset(source, url)`（本地文件）、`renderers` 与 `base`（站点路径）、`nodeVitePlugins`（有 `assets` 或 `documentModules` 的插件的 Node 端入口与它在文稿中的配置），见 `ir.md`。
- `@lincyaw/kernel` 还导出插件共用的纯函数：`irBlocks`、`docBlocks`（遍历块，含组件的子块）、`nodeMdast`、`errorMessage`、`isRecord`、`failedRun`、`languageId`（`py`、`python3`、`ipython*` 归为 `python`，`js`、`mjs` 归为 `javascript`，`ts` 归为 `typescript`）、`lowerMyst`（MyST 降为标准 Markdown；卡片、栅格与选项卡按选项 `cards` 保留结构或降为小标题，`ir.md`）与 `deckLocale`。各包共用这些实现。
- 指令与编译步骤的上下文提供 `watch(...files)`：声明 `ctx.src`、`ctx.resolvers` 之外读取的文件，`presmium dev` 在它们变化时重新编译（`ir.md`）。
- 组件转换函数为 `(node, block, ctx)`，`ctx` 是所服务渲染端的 `RenderContext`；插件据此得到输出目录与工作目录（例如 notebook 渲染端的输出目录），不为此依赖渲染端的包。
- `RenderContext.workspaceRoot` 与指令、编译步骤上下文中的同名字段相同。宿主可通过 `CompilerOptions.workspaceRoot` 显式指定；否则从文稿目录向上查找最近的 `presmium.workspace.yaml`，不越过所在 git 仓库的根目录；没有配置时取 git 根目录，不在仓库中时取文稿目录。代码锚点相对于这个逻辑工作区根目录，读取范围不因工作区位于 git 子目录而扩大；锁定提交的读取与永久链接另换算成实际 git 仓库内的路径。渲染端发布插件配置（全局的 `presmium` 与各章节的 `{config}`）时按工作区根目录改写路径：位于工作区内的绝对路径（例如编译步骤解析出的目录）改为相对于文稿目录的路径，两种形态相同；工作区外的路径与其他字符串（例如站点路径 `/web`）保持原样。产物因此不随检出位置变化。
- 检查项的 `CheckContext` 带有编译好的 IR（`ir`），另有 Node 端服务 `service(token)`（4.6 节；例如讲授的检查经 `SPEECH` 判断合成所需的引擎是否可用）。

### 4.3 锚点与检查

- 锚点写作 `scheme:target`，例如 `region:src/a.py#add`、`symbol:src/a.py#Parser.parse`。
- 解析结果为 `exact`、`moved`、`fuzzy`、`lost` 之一；只有前两种可直接渲染，后两种必须产生诊断。
- 指纹记录保存在文稿目录的 `.presmium/anchors.lock.json`，由 `presmium check --update-lock` 生成，随文稿提交。
- 文稿 `.presmium/` 中随文稿提交的还有执行缓存 `freeze/`、本地化的远程图片 `assets/`（如 PlantUML 图，见发布插件）与圈画标注 `drawings/`，新检出的文稿因此构建时不访问远程服务、不重新执行代码。渲染端的工作目录（`slides/`、`web/` 等）不提交，根目录的 `.gitignore` 按此配置；新增一个本地化资源后要把它提交。
- 执行缓存中同一段代码的录制若来自另一个运行环境（执行器的环境指纹不同，例如另一个解释器版本），构建默认沿用这份录制并给出警告，人人构建得到相同的输出；文稿 metadata 写 `execute: { rerun: environment }` 时，这类代码重新执行并替换录制（`ir.md`）。执行器自己的代码的修订（`Executor.revision`，如 Python 运行器的摘要）不同的录制不沿用：执行器可用时重新执行（4.6 节“执行器的修订”）。
- 检查项 `Check.run(ctx)` 返回 `Finding[]`，诊断带源码位置。

### 4.4 宿主接口

宿主契约的唯一来源是 `packages/host/src/contracts.ts`：

```ts
type PresentationMode = 'slides' | 'document'
type ViewRole = 'audience' | 'presenter' | 'reader'
type SharedStateScope = 'view' | 'local' | 'remote'

interface HostAdapter {
  readonly mode: PresentationMode
  /** 文稿的语言标签（如 `en-US`），供没有页面的渲染使用；浏览器中由 `<html lang>` 携带 */
  readonly lang?: string
  useDoc?(): IRDocument
  useCursor(): Cursor       // { slide, step }
  /** 渲染该组件的页或章节的当前步骤（绝对步骤，不是块内步骤）；全部展开的文档视图为 Infinity */
  useStep(): number
  useViewRole(): ViewRole
  /** 形态正在渲染静态副本（幻灯片打印 PDF、PNG）时为 true，组件显示 IR 的 fallback */
  useStaticRender(): boolean
  /** 插件 pluginId 在调用组件所在页或章节的配置：全局配置之上合并该章节的 `{config}` */
  useSectionConfig(pluginId: string): Record<string, unknown>
  /** 按 key 共享的状态（key 以插件 ID 开头，值为 JSON 数据），由 React 组件调用 */
  useSharedState<T>(key: string, initial: T, scope: SharedStateScope): [T, Dispatch<SetStateAction<T>>]
  getService<T>(token: ServiceToken<T>): T | undefined
  /** 内核启动报告；内核启动之前为 undefined */
  startReport(): StartReport | undefined
}
```

宿主适配器（网页与幻灯片共用一个，`packages/web/src/client/host.ts`）由 `HostProvider` 在 React 树中提供；`installHost(adapter)` 为普通浏览器适配入口。以上 `use*` 接口只在 React 组件或自定义 hook 中调用，直接返回当前值。组件外使用纯函数 `presmiumService`、`presmiumReport`、`serverClient` 或 `getSharedStateStore`。

`useStepState(range)` 用宿主的绝对步骤减去所在步骤作用域的 `at`（`useStepScope()`），得到块内第 k 个状态是否已到达。IR 运行时以 `<StepScope at={block.at} until={block.until}>` 提供范围；嵌套范围取交集，不改变块内偏移。`useBlockStepRange()` 返回相对于作用域的有效范围，需要跟随整个块的显示范围停止资源时，用 `useStepState(useBlockStepRange())`。

非组件的可观察状态使用 `Store<T>`：`getSnapshot()` 读取，`subscribe(listener)` 订阅并返回释放函数，`set(valueOrUpdater)` 更新。React 组件通过 `useStore(store)` 订阅快照。导航的 `position`、操作的 `replaying`、服务端成员 `member` 与步骤时钟的 `elapsed` 都是 Store；共享状态 hook 返回 `[value, setValue]`。

**步内时间。** 动画的视觉状态是（步骤，步内时间）的纯函数（5.3 节）。`useStepTime({ until? })` 给出组件所在步骤开始以来的毫秒数，`Infinity` 表示这一步已经停定（动画的终态）：

- 现场放映：从导航（`NAVIGATION.position`）前进到这一步的时刻起按页面时间增长。后退到达的步骤、导航不在的页或步骤（组件的 `useCursor()` 与导航的位置不同，例如演讲者窗口中预告的下一页）、全部展开的文档视图以及减少动态效果时为 `Infinity`。
- 讲授的回放与按帧导出：讲授插件经 `STEP_CLOCK.drive` 给出讲授到达当前步骤（最近的 `go` 事件）以来的时间，播放、跳转与导出的每一帧都由讲授的时刻决定；读者在回放中自己操作页面时（`elapsed` 为 undefined），以及关掉播放器时，回到页面时间：页面时间从讲授停下的位置接着走，动画不跳回这一步的开头。导出时驱动者的 `recording` 为 true：减少动态效果也照常画出动画，因为视频不能按观看者的设置减少动态效果。
- `until` 是组件在一步中的动画时长：此后为 `Infinity`，宿主不再为它逐帧计时；没有动画在进行时宿主不请求动画帧。

```ts
interface StepClockDriver {
  /** 自讲授到达当前步骤以来的毫秒数；undefined 时按页面时间 */
  readonly elapsed: Store<number | undefined>
  /** 画面按帧录成视频：减少动态效果时动画仍按 elapsed 进行 */
  readonly recording?: boolean
}

interface StepClock {
  /** 由回放者驱动；返回的函数结束驱动 */
  drive(driver: StepClockDriver): Unsubscribe
  /** 组件异步准备画面（载入模块、建立 WebGL 上下文）时登记，settled 等它完成；画不出画面时登记一个失败的 work */
  wait(work: Promise<unknown>): void
  /** 没有登记的准备时立即兑现；有时等它们完成、页面再画一帧（准备好的画面可能挂载新的组件）之后兑现；
   *  其中有失败的，以它的错误拒绝；按帧导出在每帧截图之前等它 */
  settled(): Promise<void>
}

const STEP_CLOCK = defineService<StepClock>('presmium.stepClock')
```

`startHost` 提供 `STEP_CLOCK`（`@lincyaw/host` 的 `step-clock.ts`），`useStepTime` 读同一个时钟。与 `OPERATIONS` 一样，这是宿主自己的唯一实现，不能由插件替换：令牌只给回放者驱动时钟、给组件登记准备中的画面。组件按时间画面时，把动画库自己的时间轴暂停，只在时间变化时定位到对应的时刻（范例：动画插件的 `PmScene`、引导插件的光标）。

**具名动作。** `useActions(element, actions, { clear })` 登记组件的具名动作，`element` 是组件在块中的一个元素，宿主由它找到块。返回的 `run(name)` 执行动作并报告 `click` 操作（数据 `{ block: '<章节>/<块>', action }`），录制的讲授记下它；讲稿中的结构化 click cue（显式 blockId 与动作参数） 编为同一个操作（`ir.md`）。宿主在 `startHost` 中登记 `click` 的重放：调用这个块的组件的同名动作（`seeking` 为跳转中的快进）；跳转前的 `clear` 调用各组件的 `clear`。宿主记下每个块自上次 `clear` 以来的动作，组件挂载时补上它们：跳转到另一节时，回放者在同一个任务中重放到目标时刻，那一节的组件这时还没有挂载。动作改变的画面要是此前动作的函数（4.9 节）。

`@lincyaw/host` 导出的React hooks 与组件：

| 名称 | 作用 |
|---|---|
| `useStepState`、`useStepScope`、`useBlockStepRange`、`StepScope` | 块内步骤的状态、步骤作用域与包含父范围限制的有效显示范围（见上） |
| `useStepTime` | 步内时间（见上“步内时间”） |
| `useActions` | 组件的具名动作，讲授的 `click` 经它重放（见上“具名动作”） |
| `useCursor`、`useViewRole`、`usePresentationMode` | 当前位置（在页或章节中调用时为组件所在的页或章节及其步骤）、视图角色、形态 |
| `useService`、`useStartReport` | 服务实现与内核启动报告，内核启动后才有值 |
| `usePrefersReducedMotion` | 系统“减少动态效果”设置（5.5 节） |
| `PmBoundary` | 错误边界（5.4 节）；属性 `resetKey` 变化时清除错误，组件修好后不刷新即恢复 |
| `PmToolbar`、`PmPresenterPanels` | 宿主显示 `toolbar`、`presenterPanels` 服务内容的位置 |
| `useSectionConfig(pluginId)` | 插件在当前章节的配置：全局配置合并章节的 `{config}`（5.2 节） |
| `useSharedState(key, initial, { scope })` | 插件状态的共享范围：`view` 只在本视图，`local`（默认）在本机所有窗口，`remote` 经 `syncTransports` 跨设备。两种形态的实现相同：本机窗口之间用 BroadcastChannel（`joinWindows`），`remote` 另经同步传输端口 |
| `createSharedStates(deck)`、`joinWindows(name, receive, known)` | 宿主适配实现 `useSharedState` 的构件，见下文“共享状态” |
| `useLocale()`、`useMessages(catalog)` | 界面语言 `'zh-CN'` 或 `'en'`，与按语言选取的文本（5.7 节） |
| `useStaticRender()` | 幻灯片的打印页（`?print`，导出 PDF、图片与 PowerPoint 时）上为 true，其他页面为 false（5.8 节） |
| `registerPresmiumPlugin`、`stopHost`、`setHostActive(active)` | 注册浏览器端插件、停止与恢复内核（`packages/host/src/runtime.ts`）；页面卸载（`pagehide`）时 `startHost` 接上的处理调用 `stopHost`，工作台暂停预览时查看器调用 `setHostActive(false)`，各插件的 `dispose` 因此会执行，页面从往返缓存恢复时再启动内核。持有资源的插件在 `dispose` 中释放它们；执行插件结束 Pyodide 与所有正在运行的 JavaScript/TypeScript Worker，取消其计时器和待返回结果，再次启动时不留下第二份。已释放的执行器拒绝新运行，Pyodide 队列中尚未开始的任务也以取消结束，不能重新创建 Worker；恢复时由插件创建新实例 |
| `startHost({ mode, config, navigation, transports })` | 宿主适配启动内核的共同部分：提供 `presenterPanels`、`syncTransports`、`navigation`、`toolbar` 四个宿主服务，并接上 `pagehide` |
| `useSessionSnapshot()`、`claimFirst(group)` | 会话快照（`session` 服务的订阅），与“同一组中第一个实例拥有”的判断，会话与课堂插件共用 |
| `currentLocale()` | 组件之外的界面语言，按 `CATALOG[currentLocale()]` 取文本 |
| `siteBase()`、`setSiteBase(base)` | 文稿的站点路径（以 `/` 结尾）：发布的文件 `media/` 与插件的运行时文件（如 `pyodide/`）在它下面。查看器预先打包、没有自己的站点路径，页面的外壳经 `setSiteBase` 给出；浏览器代码由 `siteBase()` 得到它 |
| `useServer()` | 服务端的访问（4.7 节）：`available`、当前成员、`fetch(plugin, path)`、`events(plugin, path)`；静态产物中 `available` 为 false，组件据此隐藏或降级。由 React 组件调用 |
| `OPERATIONS`、`STATUS`、`STEP_CLOCK` | 宿主层的服务令牌：操作的报告与重放（4.9 节）、插件的状态摘要（4.7 节）、步内时间的时钟（见上） |

**共享状态。** `createSharedStates(deck)` 返回适配器的 `useSharedState` 实现与同步传输的接入点（`transports.add`，`syncTransports` 服务把每个传输交给它），`deck` 是文稿标题。宿主适配用它，跨窗口、跨设备的状态只有这一套实现：

- `local` 与 `remote` 状态经 `joinWindows` 在本机的窗口之间传递。BroadcastChannel 只送达加入之后的变化，所以新窗口加入时向其他窗口询问，状态改变过的窗口回答，中途打开的演讲者窗口因此从当前状态开始。
- BroadcastChannel 对同源的全部页面可见。`joinWindows` 给通道名加上文稿的站点路径（`siteBase()`），通道名形如 `presmium.shared:<文稿标题>:local:<key> @ /web/`，同一站点上同名的两份文稿因此不会串。网页与幻灯片的站点路径不同时（构建的默认 `/web/` 与 `/slides/`），本机窗口之间的状态也不互通。IR 运行时的放映位置同样经 `joinWindows` 在窗口之间传递；视图插件的共享状态（例如舞台插件的黑屏与圈画）用 `useSharedState`，在两种形态中都是 `remote` 状态，课堂中会到达学员的设备。
- `remote` 状态另是名为 `presmium.shared:<文稿标题>:remote:<key>` 的同步通道，由每个同步传输接入（例如课堂）。两种形态的通道名相同，课堂中幻灯片与网页的设备共享同一份状态。
- 变化按到达的顺序生效并立即发布：来自其他窗口或设备的变化在本窗口生效，以 `fromRemote` 发布，传输不会再把它发出去；紧接着的本地变化照常作为本地变化发布。

**课堂的写入规则。** 课堂的共享集合（`ClassroomStore`，契约中的 JSDoc 写明同样的规则）由课堂服务端把关：主讲可以写任何条目；学员只能写自己的条目：参与者 ID 在键中由集合决定的位置（`answers`、`pulse`、`submissions`、`predictions` 等为最后一个 `:` 之后，`<测验>:<参与者>`；`questions` 为第一个 `:` 之前，`<参与者>:<提问>`；条目 ID 是 `<章节>/<块>`，章节 ID 本身可以含 `:`，如 `sec:intro`，参与者 ID 不能含 `:`），值是在 `participant` 字段（早先版本的提问为 `author`）中写明自己的对象；键上已有的值写明另一参与者（或是主讲写的）时，学员不能改写也不能删除它；`quizzes` 集合只有主讲能写。服务端只接受能完整并入房间文档的更新：更新依赖服务端没有的内容、删除集超出房间已有的内容，或违反上述规则时，整个更新被拒绝，服务端以应用定义的关闭码关闭该连接，会话插件丢弃本地文档并用新文档重连，提示学员这次写入被拒绝，被拒的写入不会在之后的写入中残留。Yjs 的结构以客户端 ID 与时钟标识，所以一个客户端 ID 属于最先写入它的结构的一方（主讲的各窗口算一方，每个参与者各算一方），在参与者名单中最先声明某个客户端 ID 的连接，也让该 ID 属于自己一方；归属在房间存在期间一直保留，连接断开后也不变（主讲还没写入就短暂断线，重连前学员也不能用它的客户端 ID 写入或出现在名单中）：学员的更新含有别人的客户端的结构（例如主讲下一个时钟的结构）时被拒绝，否则主讲随后对这个时钟的真实写入会被每份文档当作重复而忽略。`put` 不报告失败，所以存放学员数据的插件必须给数据这样的形状，读取集合时也先把每个值收窄成记录、丢掉形状不对的（学员可能写入形状不对的值；课堂插件的 `to*`，见 `domain-model.md` 第 8 节）。参与者名单（awareness）同样校验：一个连接只能声明自己的参与者，学员不能自称主讲。

**覆盖视图的控制条。** 放映与演讲者视图（两种形态都有）挂载时在 `<html>` 上设置 CSS 变量 `--pm-overlay-bar`（视图控制条的高度，像素），卸载时移除。插件固定在页面上的元素用它避开控制条，例如课堂徽章的 `bottom: calc(var(--pm-overlay-bar, 0px) + 1rem)`；没有覆盖视图时变量不存在，取默认值。

### 4.5 公共服务令牌

| 令牌 | 提供方 | 使用方 |
|---|---|---|
| `presmium.executor` | 代码执行：浏览器中的 Pyodide（Python）与脚本 Worker（JavaScript、TypeScript），`presmium dev` 与 `presmium serve` 中的本地容器；由路由按语言与优先级选择。每个执行器都按 `RunRequest` 的约定运行：`files` 写在程序的工作目录中，`args` 成为变量，`stdin` 是程序的标准输入；浏览器中的 Python 每次运行有自己的工作目录，运行改动的解释器状态（递归限制、`sys.path`、新导入的模块、内置函数）在运行后恢复 | 代码块的现场执行、执行面板、课堂（练习校验） |
| `presmium.session` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.classroomStore` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.presenterPanels` | 宿主适配（网页站点的演讲者视图中显示） | 需要演讲者面板的插件 |
| `presmium.syncTransports` | 宿主适配（`remote` 共享状态，含舞台插件按章节 ID 记的圈画 `presmium.stage.drawings`） | 会话（课堂的网络传输） |
| `presmium.navigation` | 宿主适配（两种形态） | 会话（读取与设置位置：章节序号、步骤、视图与章节 ID `section`；两种形态另报告按 ID 的位置 `trail`（已到达的步骤的键）与 `back`（只给部分受众的章节：没有它的版本回退到的章节，即它之前最近的、学习者版本也有的章节，只给学生的章节也算；只给学生的章节则为之前最近的、所有版本都有的章节），`@lincyaw/kernel` 的 `FollowAnchor`（`packages/kernel/src/follow.ts`）；`go` 按章节 ID 定位、按 `trail` 求自己版本中的步号，版本中没有这一节时到 `back` 那一节的最后一步，也没有时停在原处，没有章节 ID 的位置按序号，`ir.md`） |
| `presmium.toolbar` | 宿主适配（两种形态，由 `PmToolbar` 显示） | 需要工具栏入口的插件（如会话状态） |
| `presmium.operations`（`OPERATIONS`） | 宿主适配（两种形态，`@lincyaw/host` 的实现） | 报告：IR 运行时（`go`）、执行插件（`run`）、引导插件（`spot`、`hint`）、讲授插件（`point`、`ink`）、组件的具名动作（`click`，经 `useActions`，由宿主重放）；录制与重放：讲授插件 |
| `presmium.stepClock`（`STEP_CLOCK`） | 宿主适配（两种形态，`@lincyaw/host` 的实现） | 驱动：讲授插件（回放与按帧导出）；读取：组件经 `useStepTime`；登记准备中的画面：动画插件的 `PmScene` |
| `presmium.status`（`STATUS`） | 宿主适配 | 登记：课堂插件的汇总（`presmium.classroom`：课堂状态 `status`、在线学习者人数 `learners`、提问数与未回答数 `questions`，按位置给出的 `quizzes`（各选项人数、作答与答对人数）、`predictions`（各选项人数、预测人数）、`pulse`（各档人数）、`exercises`（提交与通过人数）；不含昵称、参与者 ID 与学习者写下的文字）；读取：控制通道（送给 MCP 的 `get_classroom`） |
| `presmium.speech`（`SPEECH`） | 语音插件：浏览器端经语音插件的路由（语音协议 `v1/*`），Node 端直接调用引擎 | 讲授插件（转写、合成、构建时合成）、讲授插件贡献的 agent 工具 |
| `presmium.ask`（`ASK`，浏览器） | 读者问答插件（每个页面，静态产物也有） | 提问面板、课堂插件（课堂中的 AI 回答，用主讲自己的设置） |
| `presmium.revisions`（`REVISIONS`，Node） | 工作区（`presmium serve` 为每份文档登记，10.2 节） | 审阅（每次接受一次提交）、工作区的文档管理 |
| `presmium.documentFiles`（`DOCUMENT_FILES`，Node） | 工作区（`presmium serve`；`presmium dev`，被 git 忽略、在另一个仓库中的文稿除外，10.2 节） | git 审阅（回退与恢复，在工作区服务中，13.4 节）、讲授插件的录制与讲授轨、语音插件的合成缓存；在 serve 与 dev 中写文档目录的插件都应经它（10.2 节）。例外：课堂服务的归档直接写文稿的 `.presmium/classroom/`（10.2 节“课堂同步”），舞台插件的圈画路由直接写 `.presmium/drawings/` |
| `presmium.documentLocks`（`DOCUMENT_LOCKS`，Node） | 工作区（`presmium serve`） | 文档操作、修改历史的撤销、源码的保存与审阅：一份文档同一时间只有一个写入方（4.8 节） |
| `presmium.approvals`（`APPROVALS`，Node） | 服务端（按 `ApprovalScope` 分发：`content` 给发起的成员，`workspace` 只给所有者） | MCP 服务（操作类与计费类工具）、语音插件（计费的合成）、本地环境插件（运行） |
| `presmium.mcpEndpoint`（`MCP_ENDPOINT`，Node） | 服务端（挂载 `/mcp` 时） | dsh bundle：为每个会话签发绑定成员、模式与文档的 MCP 令牌（第 13 节） |
| `presmium.changeReview`（`CHANGE_REVIEW`，Node） | 工作区服务（git 仓库中的工作区） | 工作区服务的 `review` 路由，dsh bundle 的 `presmium-turns` 经它审阅会话的修改（10.7 节） |
| `presmium.processSandbox`（`PROCESS_SANDBOX`，Node） | 运营者插件（没有内置的实现） | 编译器：放进 `RunContext.sandbox`，执行插件的子进程经它运行（4.6 节、10.6 节） |

内核契约中的令牌（`executor`、`session`、`classroomStore`、`presenterPanels`、`speech`、`agent`、`ask`、`agentRuntime`、`revisions`、`documentFiles`、`documentLocks`、`approvals`、`mcpEndpoint`、`changeReview`、`processSandbox`）定义在 `packages/kernel/src/contracts.ts` 与它再导出的 `contracts/` 模块中；宿主层的令牌（`syncTransports`、`navigation`、`toolbar`、`operations`、`status`、`stepClock`）定义在 `packages/host/src/contracts.ts`。服务替换时，提供方与使用方都不需要改动。Node 端的令牌（`speech` 的 Node 实现、`agentRuntime`、`revisions`、`documentFiles`、`documentLocks`、`approvals`、`mcpEndpoint`、`changeReview`、`processSandbox`）登记在编译器为每份文稿建立的 Node 端服务注册表中（`PresmiumNodePlugin.services`，服务端与工作区另行登记自己的实现），规则与浏览器端相同：一个令牌只有一个实现。

作者接口可调用 `Compiler.nodeServices({signal?})`，在不编译画面的情况下复用同一套 Node 服务装配，取得精确 `CanonicalSource`、装配诊断和服务查询。该入口不运行 IR passes，也不证明服务鉴权或转写／合成成功；调用方必须继续核对来源和实际能力。验证范围见[作者服务记录](benchmarks/compiler-node-services-2026-10-27.md)。

`executor`、`session`、`classroomStore` 的接口（`RunRequest`、`SessionService`、`ParticipantRole` 等）是业务契约。它们放在内核包中是有意的：提供方与使用方是不同的插件，插件之间不互相引用（第 3 节），契约只能放在双方都依赖的共享内核中。内核的运行时（服务注册、启动、锚点、检查）不使用这些概念。见第 9.2 节。

### 4.6 执行环境、会话与富输出

4.6 至 4.10 节是执行环境、智能体、工作区与讲授的契约，全部是兼容扩展：只增加可选字段、可选参数（`Executor.run` 的第三个参数 `ctx`）、新类型、新函数与新的服务令牌，`IR_VERSION` 仍为 1。它们写在 `contracts/`、`ir.ts` 与 `host/src/contracts.ts`（`HostStart` 在 `host/src/runtime.ts`，`KernelOptions` 在 `kernel/src/kernel.ts`），按语义化版本的承诺变化。业务契约按领域拆在 `packages/kernel/src/contracts/` 中：`service.ts`（`ServiceToken`、`defineService`，其他模块只从这里取运行时的值，没有循环引用）、`execution.ts`（执行、进程沙箱、具名环境与 `environmentExecutor`）、`server.ts`（成员、路由、两种 Node 端上下文、确认与 `eventStream`、MCP 访问）、`speech.ts`、`agent.ts`（智能体、修改审阅与修改历史）、`operations.ts`；`contracts.ts` 保留插件、锚点、检查与课堂的契约并统一再导出，入口 `@lincyaw/kernel/contracts` 不变（9.2 节）。内核另导出 `withProp(props, path, value)`（按 `.` 分隔的属性路径设置组件属性，渲染端改写 `ComponentNode.assets` 用）与 `roleMark(node)`（角色的标记 `〔名 value〕`），`lowerMyst` 增加选项 `roles: 'marks'`。

`packages/kernel/src/contracts/execution.ts`：

```ts
export interface RunRequest {
  // ……已有字段……
  /**
   * 指定的执行器（IR 的 `RunSpec.executor`；`:env:` 编译为 `environmentExecutor(name)`）。
   * 路由只把请求交给这个执行器；它没有登记或不支持该语言时返回失败的结果
   * （`failedRun`），由预录输出回退，不改用其他执行器。省略时按语言与优先级选择。
   */
  executor?: string
  /** 执行会话：同一会话的运行共享解释器状态，按请求顺序执行；不支持会话的执行器忽略它 */
  session?: string
  place?: { section: string, block: string } // 浏览器反馈的位置；不改变代码的执行
}

/** nbformat v4 的单元格输出（结构复制，内核不依赖 nbformat 包） */
export type RunOutput =
  | { output_type: 'stream', name: 'stdout' | 'stderr', text: string }
  | { output_type: 'display_data' | 'execute_result', data: Record<string, unknown>, metadata?: Record<string, unknown> }
  | { output_type: 'error', ename: string, evalue: string, traceback: string[] }

export interface RunResult {
  // ……已有字段……
  /** 富输出，按产生的顺序；`stdout`、`stderr` 仍是文本流的拼接，只读文本的使用方不受影响 */
  outputs?: RunOutput[]
}

/** 编译时一次运行的上下文：由编译器给出；浏览器中与编译器之外的调用没有它 */
export interface RunContext {
  /**
   * 被执行的代码能得到的全部环境变量（见下文“执行的环境变量”与第 11 节）。执行器不读 `process.env`：
   * 子进程以它为环境；`docker` 与 devcontainer 命令行以它加上 Docker 客户端的变量为环境（10.6 节）；
   * 容器、WASI 程序、WebGPU 录制所用的 Chromium 与内核至多得到其中的变量
   */
  env: Readonly<Record<string, string>>
  /**
   * 进程沙箱：Node 端服务中有 `PROCESS_SANDBOX` 时编译器给出。启动子进程的执行器（执行插件的
   * `python3`、`node`）经它运行代码，输入与结果经运行目录中的文件传递；没有时照旧启动子进程（10.6 节）
   */
  sandbox?: ProcessSandbox
  /**
   * 文稿的语言（头部的 `lang`，没有时为 `zh-CN`）：执行器自己写进录制的文字（如 WebGPU
   * 运行的摘要）按它（`deckLocale`），与编译时写入产物的其他文字一样（5.7 节）
   */
  lang?: string
}

/** 进程沙箱中的一次运行：命令在一个新的运行目录中执行，输入与结果都经这个目录中的文件传递 */
export interface SandboxRun {
  /** 命令与参数；命令按 `env.PATH` 查找 */
  argv: string[]
  /** 写进运行目录的文件，键为相对路径；运行目录是命令的工作目录，也是它唯一能写的目录 */
  files: Record<string, string | Uint8Array>
  /** 运行结束后从运行目录读回的文件（相对路径） */
  collect: string[]
  /** 命令得到的全部环境变量（`RunContext.env`） */
  env: Readonly<Record<string, string>>
  /** 运行目录之外可以读的绝对路径，例如解释器的安装目录与文稿目录；都只读 */
  read: string[]
  timeoutMs: number
  signal?: AbortSignal
}

export interface SandboxResult {
  /** 超时或被中止时为 null */
  exitCode: number | null
  stdout: string
  stderr: string
  /** `collect` 中运行结束时存在的文件 */
  files: Record<string, Uint8Array>
}

export interface ProcessSandbox {
  /** 隔离方式，写进构建报告与诊断 */
  readonly kind: string
  /**
   * 在隔离中运行：网络全部拒绝；看不到沙箱之外的进程（读不到它们的 `/proc/<pid>/environ`）与 Unix 套接字；
   * 只能写运行目录。命令自己的子进程同样在其中
   */
  run(request: SandboxRun): Promise<SandboxResult>
}

/**
 * Node 端服务：运营者插件可以登记（10.6 节）；
 * 编译器把它放进 `RunContext.sandbox`
 */
export const PROCESS_SANDBOX = defineService<ProcessSandbox>('presmium.processSandbox')

export interface Executor {
  // ……已有字段……
  /**
   * 已有的方法增加第三个可选参数 `ctx`，旧的实现与调用方不受影响。
   * 没有 `ctx` 时执行器只给代码 `PATH`、`LANG` 与一个临时的 `HOME`
   */
  run(request: RunRequest, signal?: AbortSignal, ctx?: RunContext): Promise<RunResult>
  /** 丢弃会话的状态（重启或关闭解释器、内核）；“重置会话”与构建结束时调用 */
  endSession?(session: string): Promise<void>
}

/** 凭据方式；凭据本身只在服务端 */
export type EnvironmentAuth = 'none' | 'env' | 'proxy' | 'prompt' | 'hub'

/** 文稿 metadata `execute.environments` 的一项；不含凭据 */
export interface EnvironmentSpec {
  /** 提供方类型：`jupyter`、`devcontainer`、`wasi`、`webgpu`，或其他插件登记的类型 */
  kind: string
  /**
   * 服务地址（`jupyter`）。带服务端凭据的连接（`env`、`proxy`）只去运营者在
   * `PRESMIUM_ENV_<名>_URL` 中给出的地址；这里的地址与它不同源时不连接（第 11 节）
   */
  url?: string
  /** 内核规格名（`jupyter`，默认 `python3`） */
  kernel?: string
  /** 可用语言；省略时由提供方决定 */
  languages?: string[]
  /** 默认 `none`；`jupyter` 默认 `env` */
  auth?: EnvironmentAuth
  /** 镜像摘要 `name@sha256:…`，进入环境指纹 */
  image?: string
  /** 定义所在的目录（`devcontainer`），相对于文稿目录 */
  path?: string
  /** 提供方自己的选项 */
  [option: string]: unknown
}

/** 文稿 metadata的 `execute`，编译器写入 IR 的 `config.execute` */
export interface ExecuteConfig {
  /** 有 `:run:` 而不写 `:env:` 的代码块的环境；省略或为保留名 `browser` 时按语言路由 */
  env?: string
  environments?: Record<string, EnvironmentSpec>
  /** `environment`：另一运行环境的录制重新执行（4.3 节） */
  rerun?: 'environment'
}

/** 具名环境的执行器 ID：`presmium.env.<name>` */
export function environmentExecutor(name: string): string

export interface EnvironmentContext {
  deckDir: string
  workspaceRoot: string
  /**
   * 服务端的环境变量，例如 `secret('PRESMIUM_ENV_GPU_TOKEN')` 与同它成对的 `secret('PRESMIUM_ENV_GPU_URL')`；
   * 没有时为 undefined。提供方只把凭据发往同一对中的地址
   */
  secret(name: string): string | undefined
  log: Logger
}

export interface EnvironmentProvider {
  /** 为一个声明的环境创建编译时执行器，其 ID 为 `environmentExecutor(name)` */
  create(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Executor | Promise<Executor>
  /** `presmium check --env`：连接环境；可达时为 undefined，否则返回原因 */
  probe?(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Promise<string | undefined>
}

export interface PluginContext {
  // ……已有字段……
  /** 文稿声明的具名环境（来自 `KernelOptions.environments`）；提供方插件为自己 `kind` 的环境登记浏览器端执行器 */
  environments?: Readonly<Record<string, EnvironmentSpec>>
}

export interface NodeServiceContext {
  deckDir: string
  workspaceRoot: string
  /** 本插件的 `presmium.<插件 ID>` 配置（文稿的内容） */
  config: Record<string, unknown>
  /**
   * 运营者给本插件的设置：工作区根目录 `presmium.workspace.yaml` 的 `settings.<插件 ID>`，
   * 进程启动时读取一次；没有时为 `{}`。不来自文稿（`ir.md`）
   */
  settings: Record<string, unknown>
  lang?: string
  /** 进程的环境变量（凭据与运营者的设置）；没有时为 undefined */
  secret(name: string): string | undefined
  /**
   * 运营者目录的绝对路径（同意记录等运营者数据，10.5 节）：用户状态目录中按工作区区分，
   * 在任何工作区与文档目录之外
   */
  operatorDir?: string
  /** 调用时文稿的 Node 端服务（宿主的，如工作区的 `DOCUMENT_FILES`，与插件的）；可选只是为了兼容 */
  service?<T>(token: ServiceToken<T>): T | undefined
  log: Logger
}

export interface CheckContext {
  // ……已有字段……
  /** Node 端服务；编译器总是提供，可选只是为了兼容 */
  service?<T>(token: ServiceToken<T>): T | undefined
}

export interface PresmiumNodePlugin {
  // ……已有字段……
  /** Node 端服务实现，例如 `[[SPEECH, speech]]`；一个令牌只有一个实现，后加载的插件的重复实现被忽略并报告 */
  services?(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][]
  /** 具名环境的提供方，键为 `EnvironmentSpec.kind` */
  environments?: Record<string, EnvironmentProvider>
  /** 服务端贡献；按文稿挂载，配置变化时重新挂载（10.2 节） */
  server?(ctx: ServerContext): ServerContribution | Promise<ServerContribution>
  /** 派生渲染树的行内扩展（不解析作者语法） */
  roles?: RoleSpec[]
  /** agent 工具，MCP 服务以工具暴露（4.8 节） */
  tools?: AgentTool[]
  /**
   * 运营者插件：列在 `settings.presmium.workspace.plugins` 中时每份文档都加载它（所有命令），
   * 文稿不必写进 `plugins`
   */
  operator?: boolean
}
```

Node 插件模块由加载器缓存；`services(ctx)` 在每次编译中按当前文稿 metadata的插件配置与 `lang` 创建。每份 `Compilation` 持有自己的服务快照，重新编译不改变旧编译结果的服务。服务端贡献单独按 10.2 节的生命周期挂载。

`packages/kernel/src/kernel.ts` 与 `packages/host/src/runtime.ts`：宿主把 IR 的 `config.execute.environments` 一路交给每个插件的 `PluginContext.environments`（`HostStart` → `StartOptions` → `KernelOptions`）：

```ts
// packages/kernel/src/kernel.ts
export interface KernelOptions {
  // ……已有字段……
  /** 交给每个插件的 `PluginContext.environments` */
  environments?: Record<string, EnvironmentSpec>
}

// packages/host/src/runtime.ts（StartOptions 只在本文件中）
export interface StartOptions {
  // ……已有字段……
  /** 交给 `KernelOptions.environments` */
  environments?: Record<string, EnvironmentSpec>
}

export interface HostStart {
  // ……已有字段（`server` 见 4.7 节）……
  /** IR 的 `config.execute.environments`；宿主适配从页面的 IR 给出 */
  environments?: Record<string, EnvironmentSpec>
}
```

要点：

- **执行器的选择**：浏览器中的 IR 运行时、执行面板与编译时执行都把代码块的 `run.executor` 放进 `RunRequest.executor`，由路由精确选择。执行器不可用时返回失败，不切换环境。
- **会话 ID**：浏览器中由代码块的 `:session:` 加上页面实例的标识组成（每个页面、每个学习者各自一份）；编译时由文稿与 `:session:` 组成，构建结束时对每个用过的会话调用 `endSession`。
- **富输出**：执行器把输出写入 `outputs`，同时照旧拼接 `stdout`、`stderr`。渲染见 `ir.md`；HTML 输出在显示前清洗（第 11 节）。
- **环境的登记**：编译器为头部声明的每个环境找到 `kind` 对应的提供方，创建执行器并加入编译时的执行器列表；没有提供方的 `kind` 与未声明的环境名都是错误级诊断。浏览器端由同一插件在 `setup` 中按 `ctx.environments` 为同类环境登记执行器，ID 相同。
- **执行的环境变量**：编译时执行的代码由文稿的编辑者或 agent 写出，不应拿到服务端的凭据。清理环境变量挡住的是代码经自己的环境拿到凭据（例如打印全部环境变量的代码把凭据写进录制）；同一 uid 的代码仍能读进程信息（`/proc/<pid>/environ`），这由进程沙箱处理（10.6 节，9.4 节的残余风险）。编译器为每次运行给出 `RunContext.env`：`presmium build`、`check`、`dev` 与语言服务中，是进程的环境去掉全部 `PRESMIUM_` 开头的变量，以及名字（不分大小写）以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量；`presmium serve` 中只有允许列表：`PATH`、`LANG` 与 `LC_*`、`TZ`、`TMPDIR`，以及 `HOME`（每个工作区一个临时目录）。两种情况都再加上运营者设置 `settings.presmium.exec.passEnv` 列出的变量（取进程中的值，即使名字像凭据）。执行插件的子进程、WASI 程序、WebGPU 录制所启动的 Chromium 与远端内核都只得到其中的变量，执行器不读 `process.env`；本地环境插件的 `docker` 与 devcontainer 命令行以它加上 Docker 客户端需要的几个变量为环境（容器定义中的 `${localEnv:…}` 因此取不到被去掉的变量），容器里的代码至多得到 `RunContext.env` 中的变量（10.6 节）。
- **进程沙箱**（10.6 节）：Node 端服务中有 `PROCESS_SANDBOX`（由运营者插件登记）时，编译器把它放进每次运行的 `RunContext.sandbox`。执行插件的 `python3`、`node` 执行器经它运行：代码、参数与输入写进运行目录，结果由运行器写进运行目录中的文件（不经标准输入与额外的文件描述符，`ir.md`），文稿目录与解释器的安装目录只读；同一 execution.session 的代码块在同一次运行中依次执行（会话有一块未命中时本来就从头重新执行）。本地环境插件的容器（要用 Docker 的套接字）、WASI 程序（在 WebAssembly 的沙箱中）与 WebGPU 的录制（在 Chromium 中）不经进程沙箱。
- **执行选项**（10.6 节）：编译器的执行选项（编译器自己的接口，不是内核契约）由宿主给出：`env`（`local` 或 `serve`，决定上一条的规则）。宿主的 `ServerHost` 运行单个代码块（MCP 的 `run_code`）与构建时使用同一套选项（10.6 节）。全部命令都在本进程中执行（有进程沙箱时经它）。

实现：

- **执行选项的形状**：`CompilerOptions.execution`（`@lincyaw/compiler` 导出 `ExecutionOptions`）为 `{ env?: 'local' | 'serve' }`。`Compilation` 另给出 `executors`（插件的与具名环境的）、`runContext`、`environments`（供 `presmium check --env`）与 `run(node, signal)`（以同一套选项运行一个代码块，不读写录制；会话中的块先在一个新会话中依次运行它前面的块，`presmium dev` 与 `presmium serve` 的 `ServerHost.run` 用它）。`RunStats` 增加 `sandbox`（构建报告的 `code runs: … isolated by <kind>`）。同一进程中编译的两份文稿（`presmium serve`）即使写了同名的 `:session:`，各自也有自己的解释器：编译器在每次编译的会话 ID 前加上这次编译自己的标识。
- **`RunContext.env`** 由 `runEnvironment(rules, passEnv, workspaceRoot)` 计算（`execute.ts`）；`serve` 规则的 `HOME` 是本用户状态目录中的 `presmium/run-home/<工作区根目录的哈希>`（`XDG_STATE_HOME` 或 `~/.local/state`；0700，不是本用户的目录或是链接时拒绝），并设置 `PYTHONNOUSERSITE=1`；不用共享的临时目录，那里其他本机用户可以抢先创建或放入链接。`RunContext.sandbox` 取 Node 端服务中的 `PROCESS_SANDBOX`，`RunContext.lang` 是文稿的语言。录制的缓存键不含文稿的语言：改了 `lang` 之后，已有的录制在代码或环境改变之前保持原来的文字。
- **执行器的修订**：`Executor` 另有可选的 `revision?(lang)`，是执行器自己影响输出的代码的修订，例如执行插件的本地 Python 执行器为 `runner <runner.py 的 sha256 前 16 位>`。它与环境指纹一起进入缓存键（没有修订的执行器的键不变），并记在录制中（`.presmium/freeze/<键>.json` 的 `revision`）。另一环境的录制照旧沿用，另一修订的录制则已过时，不沿用：执行器可用时重新执行并替换它，所以运行器改变输出的方式之后（如末尾表达式的值），已缓存的录制在下一次构建时更新；没有执行器时仍显示原有的录制。
- **会话**：编译器按文稿顺序把同一 `:session:` 的块编成一组，会话 ID 为 `<入口文件>:<会话名>`；有一块未命中时先 `endSession`，再把整组请求一次发出（不在其间等待），执行器按请求顺序执行，结束后对每个用过的会话调用 `endSession`。执行插件的本机执行器把一起到达的同一会话的请求放进一次运行（同一个子进程，或进程沙箱中的一次 `run`）；之后单独到达的同一会话的请求先重新运行该会话此前的请求，所以状态总是一致（`packages/addon-exec/src/node/child-process.ts`）。浏览器中会话 ID 由执行路由加上页面实例的标识（路由在页面中创建），Pyodide 的会话是 Worker 中常驻的全局命名空间，`endSession` 丢弃它；代码块旁的“重置会话”调用路由的 `endSession`。本地环境插件的容器执行器每次运行一个新容器，不共享会话的状态（不支持会话的执行器忽略它）；每个文稿目录有自己的容器执行器，编译步骤 `presmium.execLocal.workspace` 把它绑定到文稿的工作区并放进这次编译的执行器中，所以同一进程中的多份文稿（`presmium serve`）各在自己的工作区中运行。
- **运行目录的协议**：执行插件的子进程（与进程沙箱）中，运行器读运行目录中的 `.presmium/request.json`（`{ session?,runs: [{ code,args,stdin,files,lang }],path? }`），每完成一个请求写 `.presmium/result-<i>.json`（先写临时文件再改名；两个文件名是 `@lincyaw/kernel/node` 的 `RUN_REQUEST_FILE` 与 `runResultFile(i)`，没有进程沙箱时由同一处的 `directSandbox` 在新的临时目录中直接启动），超时被杀死时已完成的请求的结果仍在；一组请求的超时是各自超时之和。Python 的命令是 `python3 -c <运行器>`（`read` 为解释器的 `sys.prefix` 与 `sys.base_prefix`），JavaScript 是 `node <src/node/script-main.mjs> <请求文件> <结果文件的前缀>`（`read` 为执行插件的包、Sucrase 与 Node 的安装目录）；文稿目录由进程沙箱自己加入只读路径（它的 Node 端服务知道文稿目录，`SandboxRun` 中没有它）。容器执行器把同样的 `request.json` 写进挂载的运行目录，在容器中运行同一个运行器。
- **共享的运行器**（`@lincyaw/kernel/runner.py`）另提供 `display()`（不必导入）、`IPython` 与 `IPython.display`（`display`、`Markdown`、`HTML`、`Latex`、`SVG`、`JSON`、`Image`；安装了的 IPython 不被使用，浏览器与编译时一致）和 matplotlib 的后端 `module://_presmium_matplotlib`（Agg 绘制，`plt.show()` 与运行结束时把打开的图写成 `image/png` 输出；运行期间 `MPLBACKEND` 指向它；matplotlib 要装在运行代码的环境中：编译时的 Python、远端环境；浏览器的 Pyodide 只加载核心发行版，只有标准库）。代码块最后一条语句是表达式时，它的值（不为 `None`）以 `display` 的格式成为 `execute_result` 输出，与 Jupyter 一致（分步执行不变）。错误的回溯同时是 `error` 输出与 `stderr` 的文本。参数（`RunRequest.args` 是字符串）由运行器读回：先按 Python 字面量，再按 JSON（`true`、`false`、`null`），否则保留字符串；Jupyter 内核得到同一规则的读回代码。
- **容器的环境**：容器里的代码得到 `RunContext.env` 中除 `PATH`、`HOME`、`TMPDIR`（主机上的路径）之外的变量；`TMPDIR` 是文中没有列出、实现另外去掉的。
- **`run` 操作**：由 IR 运行时报告与重放（`@lincyaw/viewer` 的代码块：报告 `{ section,block,result }`，`result` 为 `live`，或运行没能进行而显示录制时为 `freeze:<缓存键>`；重放时显示录制的输出），而不是执行插件：块 ID 只有 IR 运行时知道，执行插件经 `executor` 服务收到的请求中没有它；`OPERATIONS.onReplay` 每类操作只有一个处理者，所以由 IR 运行时统一处理。执行面板暂不报告 `run`。
- **浏览器中运行失败**：路由对指定了执行器而没有登记（或不支持该语言）的请求返回 `failedRun`（`exitCode` 为 null）；IR 运行时的代码块对 `exitCode` 为 null 的失败显示录制的输出并在说明中写出原因，程序自己的错误（如 `NameError`）照常显示为现场的输出。
- **运行前就地编辑**：IR 运行时的可运行代码块在两种形态中相同，可以在运行前就地编辑（`packages/viewer/src/client/code/code-block.ts`）：按钮“编辑代码”打开 CodeMirror 6 的编辑器（`code-editor.ts`，第一次编辑时才加载，只阅读的页面不加载它；Python、JavaScript、TypeScript 带语法高亮，颜色取令牌的 `syntax-*`），Mod-Enter 运行，“完成编辑”收起编辑器，“还原代码”回到块自己的代码；运行的是改过的代码，经同一个 `executor` 服务。有多个版本或按步骤高亮行的代码块不能编辑，打印页（`useStaticRender()`）上也不能。

实现（WebAssembly 后端）：

- **一份运行器，两处运行**：`addon-exec-wasi` 的 `src/shared/wasi-runner.mjs`（纯 JavaScript，同执行插件的 `src/shared/script-runner.mjs`）定义语言（`c`、`cpp`、`ruby`、`sql` 及别名）、每个运行时的文件与命令行，并在 `@runno/wasi` 的 WASI 系统中运行请求：C 与 C++ 先由 `clang.wasm` 编译、`wasm-ld.wasm` 链接（sysroot 为 `clang-fs.tar.gz`），再运行得到的 WASI 程序；Ruby 与 SQLite 解释程序。浏览器中由页面的一个常驻 Worker 运行（`@lincyaw/host` 的 `createResidentWorker`，Pyodide 执行器同样用它；模块只编译一次，超时或中止时结束 Worker），编译时每次运行一个子进程（`src/node/wasi-main.mjs`，其中的工作线程 `wasi-thread.mjs` 运行它；有进程沙箱时这个进程在沙箱中，没有时直接启动；WebAssembly 内存的上限为 1024 MiB，即 `MEMORY_LIMIT_MB`，超出时程序的分配失败，编译器的内存不受影响），二进制相同，所以录制与现场输出一致。程序的文件系统在内存中（`RunRequest.files` 放在根目录，文件时间固定），标准输出与标准错误按写入顺序成为 `stream` 输出；不支持 `args` 与会话。
- **环境变量**：编译时 WASI 程序的环境就是 `RunContext.env`（没有 `ctx` 时为空）；编译器与链接器没有环境，工作线程以空的 `process.env` 启动；浏览器中程序没有环境变量。WASI 程序在 WebAssembly 的沙箱中运行，不经进程沙箱。
- **执行器与环境**：按语言选择的执行器 ID 为 `presmium.wasi`（浏览器与编译时相同）；`kind: wasi` 的环境以 `presmium.env.<名>` 登记同一实现，按环境的 `languages` 限定语言；`probe` 报告不支持的语言与缺少的运行时文件。环境指纹为 `wasi <运行时> sha256:<该运行时全部文件的哈希前 16 位>`，每个进程只计算一次。
- **运行时的发布**：二进制取自已安装的 `@runno/sandbox` 的 `dist/langs`（沿模块查找路径找到，它的 `exports` 不导出 `package.json`）。编译步骤 `presmium.execWasi.runtimes` 把浏览器中运行的代码（`run.when` 为 `live` 或 `both`，含组件的子块，执行器为 `presmium.wasi`、`kind: wasi` 的环境或未指定）需要的运行时写进 IR 中插件配置的 `runtimes`；插件的运行时文件（`PresmiumNodePlugin.assets`，`src/node/vite.ts` 的 `wasiAssets`）在开发服务器中提供全部运行时，构建只把这些运行时复制到 `<base>wasi/`；浏览器中的执行器从 `siteBase()` 之下的 `wasi/` 载入它们。运行时的离线缓存规则见下文“离线”；需要离线授课时按讲者技能的发布参考准备并断网验证。发布运行时的同时发布它们的许可证说明 `<base>wasi/LICENSES`（包中的 `LICENSES`：Runno 的 MIT 许可证，LLVM 8 的 University of Illinois/NCSA 许可证，wasi-libc 与 LLVM 9 以后的 Apache 2.0 加 LLVM 例外，Ruby 的 2-clause BSD，SQLite 的公有领域声明），开发服务器同样提供。
实现（浏览器 GPU 后端；契约没有改动）：

- **`wgsl` 执行器**：`@lincyaw/addon-exec-webgpu` 在浏览器与编译时都以 `presmium.webgpu` 登记（`kind: webgpu` 的环境另以 `presmium.env.<名>` 登记，浏览器端由插件在 `setup` 中按 `ctx.environments` 登记）。计算核心是纯 JavaScript 的 `src/shared/gpu-compute.mjs`，浏览器中在每次运行一个的专用 Worker 里运行，编译时在 Playwright 的 Chromium 中运行同一份文件，所以录制与现场的输出一致。请求由 `src/domain/params.ts` 从着色器与 `:params:` 得出（`ir.md`）：缓冲区按着色器中变量的名字给出数据或大小，组、绑定、存储的读写与值的类型取自着色器的声明，可写的存储缓冲区读回并显示；显式的绑定布局（入口函数不用的缓冲区也绑定）；按缓冲区的大小请求设备的 `requiredLimits`。结果是 `stdout` 的文本（同时是一个 `stream` 输出）：每个读回的缓冲区一行（长的显示首尾各 4 个值与最小、最大、平均）、每次派发的中位时间（有 `timestamp-query` 时用 GPU 时间戳，否则为提交到队列完成的时间；回退适配器上注明“CPU 模拟”）与适配器。浏览器中按界面语言，编译时按文稿的语言（`RunContext.lang`；没有上下文时为英文）。
- **回退**：浏览器没有 WebGPU、没有适配器、适配器缺少特性或限制、设备丢失、超时，结果是没能进行的运行（`exitCode` 为 null，原因在 `stderr`），代码块与执行面板显示编译时录制的输出与原因；着色器的编译错误、WebGPU 的校验错误与写错的 `:params:` 是程序自己的错误（`exitCode` 为 1）。超时（请求的超时，默认 10 秒）时 Worker 先销毁设备再被结束；运行的规模上限为全部缓冲区 128 MiB、`repeat` 至多 1000。
- **编译时的录制**（`src/node/recorder.ts`）：Chromium 以 `RunContext.env` 为环境（没有上下文时只有 `PATH`、`LANG` 与临时的 `HOME`），页面经 `page.route` 从 `https://webgpu.presmium.invalid/` 提供（WebGPU 要安全上下文，不占端口），每次运行启动并关闭一次浏览器（执行器没有供编译结束时关闭的钩子）。环境的选项 `adapter`：`auto`（默认，先以 `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan` 用显卡，没有适配器时用 SwiftShader）、`gpu`、`swiftshader`。环境指纹为 `chromium <版本>; <厂商> <架构>`，回退适配器加 ` (fallback)`。没有安装 Chromium 时执行器不支持 `wgsl`（录制照常使用）；没有适配器（指纹）或适配器不能运行（缺少特性或限制、设备丢失）时抛出错误而不返回结果，编译器沿用已有的录制并警告，没有录制时报错，失败不会作为录制留下。`presmium check --env` 的 `probe` 启动 Chromium 请求该适配器。
- **执行面板**（`addon-exec`）：`{run-panel}` 接受任何有执行器的语言；Python、JavaScript、TypeScript 之外的语言的 `:params:` 可以是任意的 YAML 映射（列表与映射以 JSON 字符串放进 `RunRequest.args`，面板的表单中可以改）。执行插件的 `presmium.exec.fallbacks` 把编译时录制的成功输出写进面板的属性 `compiledOutput`；现场运行没能进行（`exitCode` 为 null）而面板没有 `:recorded:` 时，面板显示它并在标记中写出原因（如“预录输出 · 没有可用的 GPU 适配器”）。
- **现场运行反馈**（`addon-exec`）：共享执行路由把最近 8 次运行与会话重置登记为 `STATUS` 的 `presmium.exec`，沿宿主现有控制通道送到 `get_runtime`。摘要含时间、`place` 的章节与块、语言、会话、实际执行器、进行中/成功/失败/超时状态，以及截断到各 2000 字符的 stdout、stderr 与最后表达式值；富输出只列 MIME 类型，不包含二进制与请求源码。普通代码与执行面板都可带位置；面板的重置会话操作也进入摘要。编译录制仍由 `get_outputs` 读取。
- **Python 桥**（`addon-exec` 的 `src/client/presmium_gpu.py`）：Pyodide Worker 把它写进 `/presmium` 并加入 `sys.path`。`await presmium_gpu.run(着色器, buffers=…, dispatch=…, entry=…, repeat=…, features=…)` 经 Pyodide 的 JavaScript 桥调用 `navigator.gpu`，参数与 `wgsl` 的 `:params:` 相同，返回读回的缓冲区（`dict`，另有 `timing` 与 `adapter`，`print` 给出与 `wgsl` 执行器相同格式的英文摘要）；不能运行时抛出 `GPUUnavailable`（`requestDevice` 失败也是），WebGPU 拒绝时抛出 `GPUError`。规模限制与 `wgsl` 执行器相同（全部缓冲区 128 MiB、`repeat` 至多 1000，`dispatch` 为 1 到 3 个正整数）：超出或写错时在请求适配器之前抛出 `ValueError`，文字与执行器的英文消息相同。插件包之间不互相引用，所以这两个上限在 Python 中另写一份（`_MAX_BYTES`、`_MAX_REPEAT`）。代码块顶层的 `await` 由 `src/client/run_await.py` 的 `_pm_run_await` 支持（与共享运行器的 `_pm_run` 相同的输出、会话与隔离，以 `PyCF_ALLOW_TOP_LEVEL_AWAIT` 编译，Worker 等待它）。有 JSPI 时 Worker 以 `callPromising` 运行其他代码块，`presmium_gpu.run_sync(…)` 与 `pyodide.ffi.run_sync` 因此可用。
- **jax-js**：脚本 Worker 没有导入映射，执行插件的 `SCRIPT_IMPORTS`（`@jax-js/jax` → `<base>presmium/jax-js/index.js`）由脚本执行器解析为地址交给 Worker，`script-runner.mjs` 的 `prepare` 把代码中 `import … from`、`export … from`、`import '…'` 与 `import('…')` 的这些名字改写为地址（Node 中的编译时执行没有这张表，导入 jax-js 的代码写 `:run: live`）。jax-js 的 ES 模块构建（互相导入的 5 个文件）是 WebGPU 插件的运行时文件（`PresmiumNodePlugin.assets`，`src/node/vite.ts` 的 `jaxAssets`），开发服务器提供、构建原样复制到 `<base>presmium/jax-js/`，第一次导入时才加载；没有 WebGPU 插件的文稿不带它。
实现（远端环境 `addon-exec-jupyter`）：

- **包内结构**：除 `src/domain`、`src/node`、`src/client` 外另有两端共用层 `src/shared/`（第 3 节）：Node 与浏览器共用的 `@jupyterlab/services` 客户端（`kernels.ts` 的内核池与运行，其中 `kernel-lifecycle.ts` 启动与关闭内核、`execute.ts` 执行代码；`terminals.ts` 的终端），两端各自给出连接的设置（`src/node/connection.ts`：`ws` 的 WebSocket 与带请求头的 `fetch`；`src/client/jupyter-client.ts`：浏览器的 `fetch` 与 `WebSocket`）。`@jupyterlab/services` 在第一次运行时才加载（`loadJupyterServices`）。
- **凭据规则**（`src/domain/connection.ts` 的 `operatorConnection`）：`none` 连接文稿的 `url`，不带令牌；`env`、`proxy`、`prompt` 在服务端（构建、代理、`probe`）都用运营者的一对 `PRESMIUM_ENV_<名>_URL`、`_TOKEN`（构建时没有学习者，`prompt` 的录制同样用运营者的令牌）；名字转为大写，其他字符变为 `_`。没有地址时不连接（运行失败并说明），文稿的 `url` 与地址不同源时提供方的 `create` 抛错，编译器给出 `presmium.execute` 的错误诊断，代理同样不挂载。令牌以 `Authorization: token …` 请求头发送，Node 端的 WebSocket 同样带请求头，令牌不进地址。
- **运行**：一个会话是一个内核（`endSession` 关闭它），没有会话的运行用一个之后关闭的内核；同一会话的运行按请求的顺序排队。启动内核的请求只有内核名与路径 `presmium-runs/<id>/kernel`（jupyter_server 以它的目录为内核的工作目录，`files` 经 Contents API 写进这个目录），不带任何环境变量。内核关闭之后，这个目录连同代码写下的文件经 Contents API 删除（先删其中的文件与子目录，因为服务器只在送进回收站或设置了 `always_delete_dir` 时删除非空目录；服务器不列出的隐藏文件留下）。临时执行与普通插件销毁等待清理完成，启动失败时也回收已创建的目录；同一个内核的并发清理复用进行中的任务。临时执行的清理失败记录告警，保留代码原来的运行结果。提交前、排队等待或内核启动期间已取消的请求在发送代码前检查取消信号，不继续执行。`args` 先作为一段静默执行的赋值运行；`stdin` 按行回答 `input_request`；超时或中止时经 REST 中断内核，5 秒内没有停下的内核被关闭。环境指纹为 `jupyter image=<文稿的 image> kernelspec=<内核名>:sha256:<内核规格的哈希> kernel=<kernel_info 的实现与版本、语言与版本>`，启动一个内核读 `kernel_info` 得出，60 秒内复用。`languages` 省略时按内核规格的语言判断，不符的运行失败。
- **浏览器**：客户端插件为每个 `kind: jupyter` 的环境登记执行器 `presmium.env.<名>`，并提供 `PmTerminal` 用的 `JUPYTER_TERMINALS`。`proxy` 经 `/__presmium/presmium.execJupyter/env/<名>/`：HTTP 带 `Presmium-Document`，WebSocket 不能带请求头，文档放在查询参数 `document` 中（由 `hello` 得知）。`prompt` 第一次运行时弹出对话框，令牌存在 `sessionStorage` 的 `presmium.execJupyter.token:<名>` 中，以 `?token=` 带在 WebSocket 地址中（只发往这个服务器），服务器拒绝（401、403）、JupyterHub 用户发现失败或 HTTP 请求因网络/跨域问题无法完成时忘掉它，使下一次运行可以重新输入；`url` 中的 `{user}` 由 `<hub>/hub/api/user` 给出。HTML 与 SVG 输出在执行器中先经 DOMPurify 清洗。终端缓存连接前的窗口尺寸，在 WebSocket 连通后应用；通过客户端公开的 `disposed` 信号得知 shell 结束，停止管理器轮询并允许重新打开。主动关闭不再触发旧连接的结束回调，避免覆盖新终端状态。
- **服务端**：服务端贡献的代理随该文稿最近一次编译的头部中 `kind: jupyter` 的环境变化（编译步骤 `presmium.execJupyter.environments` 每次编译记下它们，从头部删掉的环境不再有代理；`proxies`、`routes` 是读取时计算的属性），只为 `auth: proxy` 的环境挂载，角色为 `reader`；代理设置目标的 `Host` 与 `Origin`（以服务端为 Jupyter 的客户端；Jupyter 校验 WebSocket 的来源），不能挂载时同一路径回答 502 与原因。代理环境另有 `POST /__presmium/presmium.execJupyter/cleanup/<环境名>`：浏览器在自己的 `pagehide` 监听中同步发出带文稿头的 `keepalive` 请求，Node 关闭已取得 ID 的内核并递归删除目录，不随页面取消。请求体上限 1024 字节，只接受内核 ID 与单层 `presmium-runs/<id>` 目录；连接与凭据仍从运营者配置解析，不接受请求提供的 URL 或令牌。进行中的清理去重，最多 32 项，每项使用服务端独立的 15 秒总超时，服务关闭时等待它们。此路由沿用代理的 reader 权限，不提供比现有完整 Jupyter 代理更细的资源所有权隔离。静态页直接连接的 `auth: prompt`、`none` 没有这项 Node 清理服务，卸载时直接关闭内核的请求使用 `keepalive`，后续目录删除仍取决于页面是否继续执行。创建内核的请求还未返回 ID 时就卸载页面，也不能保证交接；启动中的任务跟踪只保证页面仍存活时的普通销毁。
- **查看器的构建**：`@jupyterlab/services` 只在非浏览器环境 `require('ws')`（包的 `browser` 字段把它换成垫片 `lib/shim/ws.js`），查看器的服务端渲染构建把插件的浏览器模块也打进去，又没有这一字段，会连 `ws` 与 Node 内置模块一起打包而失败。插件包的 `vite.config.ts`（第 3 节）给查看器的每次构建加上一个 Vite 插件（`src/node/vite.ts` 的 `jupyterWsShim`），把 `@jupyterlab/services` 中的这一处 `ws` 解析为该包自己的垫片。

执行与发布的约定：

- **运行时文件与构建的入口**：两种形态的统一入口与加载方式见 5.1 节。插件浏览器代码运行时载入的文件经 `PresmiumNodePlugin.assets`（4.2 节）提供，执行插件（Pyodide）、WASI 与 WebGPU（jax-js）插件用它；查看器构建要加的 Vite 插件经插件包的 `vite.config.ts`（第 3 节），远端环境插件用它。
- **执行器在哪里运行**：`Executor` 另有可选的 `runsIn?: 'browser' | 'machine'`，执行面板的顶栏据此写“浏览器中运行”或“本机运行”，没有时只写语言（5.12 节的运行面板）。
- **执行面板的参数显示**：`Executor` 另有可选的 `params?(lang): ParamsDisplay | undefined`（浏览器端的执行器），`ParamsDisplay` 为 `{ labels: Record<string, string>; fields?: string[]; summary?(args): string }`：面板按它显示参数的标签（按界面语言），映射类型的参数每个键一个输入框（写回为 YAML 的流式映射），运行记录显示摘要而不是 JSON；没有它或没有命名的参数显示名字与值。WebGPU 执行器给出缓冲区、工作组数、入口函数、重复次数与所需特性。
- **浏览器中的 Python 只有标准库**：`presmium check` 对在浏览器中运行（`:run: live` 或 `both`）的 Python 代码块、执行面板与分步执行中导入标准库之外的模块给出警告 `presmium.exec`；`pyodide`、`js`、`IPython`、`presmium_gpu` 允许，带 `:env:` 的块不检查。
- **分步执行的步数**：`presmium build` 与 `presmium check` 在 `:steps:` 与追踪得到的执行行数不同时，在指令处警告（追踪在进程沙箱中运行）；组件的提示只在演讲者视图与开发服务器中显示。
- **执行输出的显示**：HTML 输出经 DOMPurify 清洗后显示，两种形态是同一个 IR 运行时；Jupyter 客户端丢弃不是 base64 的图片数据并说明原因。
- **放映中的执行面板**：幻灯片与放映视图中面板的代码占满幻灯片的剩余高度，较长时在面板中滚动，参数、运行按钮与输出留在幻灯片上。放映中参数与运行按钮的字号与代码相同，输出在代码旁边占去一半宽度时，过长的代码行在面板中换行而不被截断。
- **导出**：`presmium-export` 与 `presmium-diff` 打印幻灯片的打印页（5.8 节）：每张幻灯片按画布的大小是一页，一张溢出的幻灯片在自己的画布内缩小，不影响其他页；打印页上组件显示降级内容，可运行的代码显示录制的输出、不能编辑；`--range` 或 `--with-clicks` 的页数与 PDF 的页数或图片的张数不符时以 2 退出。
- **本地环境插件**：提供环境状态、运行与复刻，端点是服务端路由 `/__presmium/presmium.execLocal/{status,run,replicate}`，只给编辑者，运行先经 `operate` 确认（测试与 `presmium dev` 用 `--allow operate`）；默认的工作区是工作区根目录而不是 git 的根目录；容器的运行目录在一个私有（0700）的父目录中，文件以独占方式新建，从不经链接。插件只声明 `exec` 与 `fs` 两种能力。
- **高对比度**：高对比度开关把滚动叙事中淡化的讲解的不透明度提到 0.6，网页的放映与滚动叙事视图同样达到 AA（`e2e/publish.spec.ts`）。
- **离开页面时关闭 Jupyter 终端**；**浏览器中没有 GPU**：Pyodide 中抛出 `GPUUnavailable` 的 Python 按没能进行的运行处理，说明“没有可用的 GPU 适配器”，不显示回溯。
- **离线**：网页的 Service Worker 安装时只预缓存外壳与内容；`pyodide/`、`wasi/` 与 `presmium/jax-js/`（许可证文件除外）放在自己的缓存 `presmium-web-runtimes-<哈希>` 中，第一次使用时缓存、之后优先取缓存，运行时不变的构建之间保留；发布插件的工具栏“保存以便离线使用”（`@lincyaw/kernel` 的 `OFFLINE_REQUESTS`：`presmium:offline-runtimes`、`presmium:save-offline`）在 Service Worker 应答之后出现，一次下载全部运行时。幻灯片的构建没有 Service Worker。

### 4.7 服务端契约

`packages/kernel/src/contracts/server.ts`：

```ts
export type MemberRole = 'reader' | 'editor' | 'owner'

export interface Member {
  id: string
  name: string
  email?: string
  roles: MemberRole[]
}

export interface RequestContext {
  /** 发起请求的成员：本机作者（`owner`，`LOCAL_AUTHOR`），`presmium dev` 与 `presmium serve` 都是 */
  member: Member
  /** 请求所属文档的目录，相对于工作区根目录；`presmium dev` 中为 '' */
  document: string
  /** `/*` 路由中路由键之后的路径（不以 `/` 开头）；其他路由为 '' */
  rest: string
}

export type RouteHandler = (request: Request, ctx: RequestContext) => Response | Promise<Response>

export interface Route {
  /** 能调用的最低角色，默认 `editor`；学习者可用的路由写 `reader`（10.3 节） */
  role?: MemberRole
  handle: RouteHandler
  /**
   * 能接受的最大请求体（字节），默认 1 MiB（`MAX_BODY`）。`Content-Length` 超过时服务端在处理函数运行之前
   * 回答 413，分块传输的请求体读到上限即截断并回答 413。413 不带 `Connection: close`：
   * 服务端读完并丢弃多出的请求体再关闭（RFC 9112 9.6），客户端读得到 413 而不是连接被重置；无尽的请求体片刻之后被断开
   */
  maxBody?: number
}

/** 路由默认接受的请求体：1 MiB */
export const MAX_BODY = 1 << 20

/** JSON 回答，带 `Cache-Control: no-store`；`problemResponse(status, message)` 是 `{ error: message }` 的错误回答（`packages/kernel/src/responses.ts`） */
export function jsonResponse(data: unknown, status?: number, headers?: Record<string, string>): Response

export interface ProxySpec {
  /** 挂在 `/__presmium/<插件 ID>/<path>/` 下；HTTP 与 WebSocket 都转发 */
  path: string
  target: string
  /** 转发时加上的请求头，例如凭据；浏览器看不到 */
  headers?: Record<string, string>
  /** 默认 `editor` */
  role?: MemberRole
}

export interface ServerContribution {
  /** 键为挂在 `/__presmium/<插件 ID>/` 之后的路径，如 `tasks`；以 `/*` 结尾时匹配其下的全部路径。流式结果用 SSE */
  routes?: Record<string, Route>
  proxies?: ProxySpec[]
  /** 服务端关闭时调用 */
  close?(): void | Promise<void>
}

export interface ServerContext {
  deckDir: string
  workspaceRoot: string
  /** 本插件的 `presmium.<插件 ID>` 配置（文稿的内容） */
  config: Record<string, unknown>
  /** 运营者给本插件的设置，同 `NodeServiceContext.settings`；不来自文稿 */
  settings: Record<string, unknown>
  lang?: string
  /** Node 端服务：插件的 `services`，以及服务端的 `APPROVALS`、`MCP_ENDPOINT`，工作区的 `REVISIONS`、`DOCUMENT_FILES`、`DOCUMENT_LOCKS` */
  service<T>(token: ServiceToken<T>): T | undefined
  /** 服务端进程的环境变量，同 `NodeServiceContext.secret` */
  secret(name: string): string | undefined
  /** 同 `NodeServiceContext.operatorDir`：运营者目录的绝对路径 */
  operatorDir?: string
  /** `presmium serve` 的工作区首页，不是文档：`deckDir` 与 `workspaceRoot` 是工作区之外的一个空目录，插件在那里只回答不需要文档的请求 */
  home?: boolean
  log: Logger
}

export type ApprovalKind = 'operate' | 'spend' | 'write' | 'agent'

/**
 * 确认的范围，决定谁能回答（10.4 节）。`content`：只涉及发起成员自己的文档与会话
 * （任务的文档目录中的文件、MCP 的操作类与计费类工具），发给 `member`；
 * `workspace`：工作区配置 `presmium.workspace.yaml`（确认策略、运营者设置）、同意记录、
 * 文档目录之外的任何路径、agent 的 shell 与网络权限请求，只发给所有者（本机作者就是所有者）
 */
export type ApprovalScope = 'content' | 'workspace'

export interface ApprovalRequest {
  kind: ApprovalKind
  /** 默认 `workspace`：没有标明范围的请求只由所有者回答 */
  scope?: ApprovalScope
  /** 一句话说明要做什么，按文稿语言，例如“运行 merge 一节的 code-1” */
  title: string
  detail?: string
  /** 发起方：插件 ID，或 `agent:<任务 ID>` */
  from: string
  /**
   * 代表哪位成员发起。`content` 范围的确认只发给这位成员的窗口（没有时发给全部编辑者与所有者）；
   * `workspace` 范围的确认发给全部所有者，这位成员只作为发起人显示，即使是编辑者也不能回答
   */
  member?: string
}

export interface Approvals {
  /** 按确认策略放行、拒绝或询问；询问时等到有人回答、`signal` 中止或超时（视为拒绝） */
  request(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean>
}

/** Node 端服务，由服务端提供 */
export const APPROVALS = defineService<Approvals>('presmium.approvals')

/** SSE 响应：每个事件写成 `event:` 与 `data:`（JSON）行；`signal` 中止或事件结束时关闭 */
export function sseResponse(events: AsyncIterable<{ event?: string, data: unknown }>, signal?: AbortSignal): Response

/** MCP 令牌签发时的模式：`author`，可以写源码；每个令牌都读完整的文稿 */
export type AgentMode = 'author'

/** 一个 agent 会话访问本进程 MCP 端点的凭证 */
export interface McpAccess {
  /** 本进程的 `/mcp`：服务端的本机地址（agent 子进程与服务端在同一台机器上） */
  url: string
  /** `Authorization: Bearer` 令牌，绑定成员与模式；工具的范围由它决定 */
  token: string
}

export interface McpGrant extends McpAccess {
  /** 作废令牌；会话关闭时调用，之后用它的请求得到 401 */
  revoke(): void
}

export interface McpEndpoint {
  /** 为一位成员与一种模式签发令牌：成员的角色决定有哪些工具（读者只有读取类工具） */
  issue(member: Member, mode: AgentMode): McpGrant
}

/** Node 端服务，由服务端在挂载 `/mcp` 时提供（`presmium dev` 与 `presmium serve`）；`presmium build` 中没有 */
export const MCP_ENDPOINT = defineService<McpEndpoint>('presmium.mcpEndpoint')
```

`packages/host/src/contracts.ts`：

```ts
export interface ServerClient {
  /** 页面由 `presmium dev` 或 `presmium serve` 提供时为 true；静态产物与服务端渲染中为 false */
  readonly available: boolean
  /** 当前成员；握手之后才有值 */
  readonly member: Store<Member | undefined>
  /** 调用插件的路由 `/__presmium/<plugin>/<path>`；自动带上文档目录（`Presmium-Document`）与界面语言（`Accept-Language`） */
  fetch(plugin: string, path: string, init?: RequestInit): Promise<Response>
  /** 订阅插件的 SSE 路由 */
  events(plugin: string, path: string): EventSource
}

/** 服务端的访问；由 React 组件调用。宿主适配在 `startHost({ server })` 中给出，省略时不可用 */
export function useServer(): ServerClient
/** 组件外读取服务端客户端，不调用 React hooks */
export function serverClient(): ServerClient

export interface StatusProvider {
  /** 插件 ID */
  id: string
  /** JSON 数据，不含学习者身份 */
  read(): unknown
}

export interface StatusRegistry {
  register(provider: StatusProvider): Unsubscribe
  list(): StatusProvider[]
}

/** 宿主服务（两种形态）：插件的状态摘要，经控制通道送到服务端 */
export const STATUS = defineService<StatusRegistry>('presmium.status')

```

`packages/host/src/runtime.ts`（`HostStart` 定义在这里，由 `index.ts` 再导出）：

```ts
export interface HostStart {
  // ……已有字段（`environments` 见 4.6 节）……
  server?: ServerClient
}
```

宿主层的实现：`useServer()` 返回一个始终可用的代理，读它的 `available` 是响应式的，宿主适配给出客户端之前渲染的组件在之后自动更新；宿主适配经 `startHost({ server })` 给出客户端，也可以更早调用 `provideServer(client)`（网页形态在创建应用时调用）。`createServerClient({ document })` 是两种形态共用的客户端：请求头 `Presmium-Document` 的值是 URI 编码的文档目录（请求头只能是 Latin-1），`EventSource` 不能带请求头，所以 `events()` 把文档目录放在查询参数 `document` 中。站点服务的页面（`presmium dev`、`presmium serve` 与工作台）在页面配置中带 `events`，查看器据此创建客户端；构建的站点的页面没有 `events`，因此没有客户端。有服务端时 `startHost` 在工具栏登记确认入口 `PmApprovals`（`@lincyaw/host` 导出），并连接控制通道（10.4 节）。

服务端怎样挂载这些契约、怎样认证与确认，见第 10 节。`settings` 与 `config` 的区别：`config` 是文稿 metadata的内容，任何能编辑文稿的人（包括 agent）都能改；`settings` 只由运营者设置，确认策略之外的安全相关设置（工作区的插件列表、agent 的替换命令与模型的服务提供方、修改的审阅、编译时执行传入的环境变量、录音的去处、是否允许克隆音色、同意记录的目录）都在这里或在环境变量中（第 11 节）。插件在本进程中经 `secret` 读取凭据。

### 4.8 语音、智能体与修改历史


`packages/kernel/src/contracts/speech.ts`：

```ts
// 语音---------------------------------------------------------

/** 秒；中文为单字 */
export interface SpeechWord { text: string, start: number, end: number }

export interface Synthesis {
  /** 浏览器中为 Blob；Node 中为合成缓存中文件的路径 */
  audio: Blob | string
  /**
   * 引擎返回的格式，缓存不重新编码：语音服务向引擎请求 Ogg/Opus（`audio/ogg`），
   * 只给出其他格式的引擎按其格式保存（假引擎为 `audio/wav`）。AI 生成的标识由语音服务写进它的元数据
   */
  mime: string
  /** 秒 */
  duration: number
  words?: SpeechWord[]
  /** 合成缓存的键 */
  key: string
  engine: string
  model: string
  voice: string
  /** 引擎的服务提供方（`SpeechEngineInfo.provider`），写进 AI 生成的标识 */
  provider: string
  synthetic: true
}

/** AI 生成的标识（GB 45438 的元数据）：语音服务写进合成的音频，讲授的导出写进视频；内核的 `aigcLabel`、`aigcString` 生成它 */
export interface AigcLabel {
  Label: '1'
  ContentProducer: string
  ProduceID: string
  ReservedCode1: string
  ContentPropagator: string
  PropagateID: string
  ReservedCode2: string
}

export interface TranscriptSegment { start: number, end: number, text: string, words: SpeechWord[] }

export interface Transcript {
  lang: string
  /** 秒 */
  duration: number
  text: string
  segments: TranscriptSegment[]
}

export interface SpeechEngineInfo {
  id: string
  /**
   * 服务提供方的名字，界面据此标明。来自运营者的配置，在任何请求之前就已知：
   * 运营者定义的引擎为 `PRESMIUM_SPEECH_<ID>_PROVIDER`（必需）；`volcengine` 为“火山引擎”
   * （英文界面为 `Volcengine`，按请求的 `Accept-Language`）
   */
  provider: string
  stt: boolean
  tts: boolean
  /** 合成时给出逐字或逐词时间 */
  wordTimes: boolean
  /** 不把数据发给第三方 */
  local: boolean
  /** 引擎能用样本训练克隆音色（`SpeechService.cloneVoice`）；没有表示不能 */
  clone?: boolean
}

export interface VoiceInfo {
  id: string
  label: string
  lang: string[]
  /**
   * 克隆某人的音色：只在运营者设置 `cloned: true`、且运营者目录中的同意记录目录（`consentDir`，ir.md 第 10 节）
   * 中有本人的同意记录时可以合成；文稿目录中的记录不算
   */
  cloned?: boolean
}

/** 可用但为空的目录，与没有目录接口分开报告。bundled 表示适配器登记的目录，不代表已向提供方逐个试听。 */
export type VoiceCatalog =
  | { status: 'available', source: 'provider' | 'bundled', voices: VoiceInfo[] }
  | { status: 'unavailable', reason: 'not-configured' | 'unsupported', voices: VoiceInfo[] }

export interface SynthesisRequest {
  engine?: string
  voice: string
  text: string
  /** BCP 47 语言标签 */
  lang: string
  rate?: number
  style?: string
  /** 读音词典：写法到读法 */
  lexicon?: Record<string, string>
}

export interface TranscriptionRequest {
  engine?: string
  audio: Blob
  lang?: string
  /** 热词，例如文稿的术语 */
  hints?: string[]
}

export interface SpeechService {
  /** 运营者定义了、因而可用的引擎：地址与凭据成对出现在本进程的环境变量中 */
  engines(): Promise<SpeechEngineInfo[]>
  voices(engine: string, lang?: string): Promise<VoiceInfo[]>
  /** 只读取音色目录；不合成。浏览器由语音插件的 GET v1/audio/voice-catalog 接入。 */
  voiceCatalog?(engine?: string, lang?: string, signal?: AbortSignal): Promise<VoiceCatalog>
  /**
   * 先查合成缓存，命中时不发请求；缺失时调用引擎，在音频的元数据中加入 AI 生成的标识后写入缓存。
   * 引擎不可用时、克隆音色没有开启或没有有效的同意记录时拒绝（抛出带原因的错误）
   */
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<Synthesis>
  /** 按完整请求及文稿默认引擎查缓存；缺失为 undefined，不调用合成或转写服务。Node 服务提供此可选能力。 */
  lookup?(request: SynthesisRequest, signal?: AbortSignal): Promise<Synthesis | undefined>
  /**
   * 按键取合成缓存中的一个片段，与 `synthesize` 命中缓存时一样检查音色：克隆音色要有开启的设置与有效的同意记录。
   * 不请引擎合成：缓存没有这个键时为 undefined，音色不能用时拒绝。Node 端的服务有它（讲授的片段按键给出与发布）
   */
  cached?(key: string, signal?: AbortSignal): Promise<Synthesis | undefined>
  /**
   * 合成缓存中一个片段的逐字时间，给没有逐字时间的引擎合成的片段：先取缓存中片段旁边的 `<键>.align.json`，
   * 没有时以文稿的转写引擎转写片段一遍并写进它（`transcribe: false` 时只取已有的）；得不到时为 undefined。Node 端的服务有它
   */
  alignWords?(key: string, options: { lang: string, transcribe?: boolean }, signal?: AbortSignal): Promise<SpeechWord[] | undefined>
  /** `speech.lock.json` 只留下给出的键，返回去掉了几个；不删除缓存中的文件。Node 端的服务有它（讲授的构建在发布之后清理） */
  pruneLock?(keep: ReadonlySet<string>): Promise<number>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
  /**
   * 训练一个克隆音色：先在运营者目录登记同意记录（与同意声明的录音放在一起），再把样本发给引擎；
   * 克隆音色没有开启、引擎不能克隆时拒绝。训练要付费，浏览器由语音插件的所有者路由 POST clone 接入，要求 confirmed=1
   */
  cloneVoice?(request: VoiceCloneRequest, signal?: AbortSignal): Promise<VoiceCloneStatus>
  /** 训练的进度；要有同意记录。就绪之后音色出现在目录中（GET clone/status） */
  cloneStatus?(engine: string | undefined, voice: string, signal?: AbortSignal): Promise<VoiceCloneStatus>
}

export interface VoiceCloneRequest {
  engine?: string
  /** 要训练的音色：提供方的音色槽位（火山引擎的 S_…）或按引擎规则起的新名字 */
  voice: string
  /** 24 kHz 单声道 WAV 等引擎接受的样本，10 MB 以内 */
  sample: Blob
  lang?: string
  /** 样本说的话，已知时给出：比对文字的提供方会拒绝不一致的样本 */
  text?: string
  consent: { speaker: string, scope: string, statement: Blob }
}

export type VoiceCloneState = 'training' | 'ready' | 'failed' | 'unknown'
export interface VoiceCloneStatus { engine: string, voice: string, state: VoiceCloneState, trainingsLeft?: number, message?: string }

export const SPEECH = defineService<SpeechService>('presmium.speech')

// 智能体-------------------------------------------------

export interface SourceRange { file: string, startLine: number, endLine: number }

/** @experimental */
export interface Focus {
  id: string
  from: 'source' | 'web' | 'slides'
  document: string
  source: SourceRange
  excerpt: string
  section?: string
  block?: string
  step?: number
  quote?: string
}

/** @experimental */
export interface FocusReport {
  id: string
  from: Focus['from']
  section?: string
  block?: string
  step?: number
  quote?: string
  source?: SourceRange
}

export interface AgentContext {
  document: string
  section?: string
  step?: number
  block?: string
  view?: string
  selection?: string
  source?: SourceRange
  focus?: Focus[]
}

export interface Citation {
  label: string
  section: string
  step?: number
  block?: string
}

export interface AskClient {
  provider(): string | undefined
  ask(question: string, context: AgentContext, signal?: AbortSignal): AsyncIterable<string>
}

export const ASK = defineService<AskClient>('presmium.ask')

export type AgentToolKind = 'read' | 'operate' | 'spend'

export interface AgentToolContext {
  document: string
  member: Member
  service<T>(token: ServiceToken<T>): T | undefined
  signal: AbortSignal
}

export interface AgentTool {
  name: string
  description: string
  input: Record<string, unknown>
  kind: AgentToolKind
  run(input: Record<string, unknown>, ctx: AgentToolContext): Promise<unknown>
}

export type ReviewChangeKind = 'added' | 'modified' | 'deleted'

export interface ReviewChange {
  path: string
  kind: ReviewChangeKind
  binary: boolean
  added: number
  removed: number
  diff?: string
}

export interface ReviewStep {
  id: string
  label: string
  tool?: string
  at: string
  changes: ReviewChange[]
}

export interface ChangeReview {
  readonly root: string
  readonly visibility: 'immediate' | 'on-commit'
  step(label: string, tool?: string): Promise<ReviewStep>
  steps(): readonly ReviewStep[]
  diff(): Promise<ReviewChange[]>
  restoreTo?(stepId: string): Promise<void>
  accept(reject?: string[]): Promise<string[]>
  rollback(): Promise<void>
  close(): Promise<void>
}

export interface ChangeReviewService {
  readonly engine: string
  open(options: { document: string, task: string, member: Member }): Promise<ChangeReview>
}

export const CHANGE_REVIEW = defineService<ChangeReviewService>('presmium.changeReview')

export interface RevisionOrigin {
  kind: 'agent' | 'document' | 'editor'
  task?: string
  member?: Member
}

export interface Revision {
  id: string
  message: string
  author: string
  date: string
  origin: RevisionOrigin
  files: string[]
  revertedBy?: string
}

export type RevertResult = { ok: true, revision: Revision } | { ok: false, conflicts: string[] }

export interface RevisionService {
  commit(change: { files: string[], message: string, origin: RevisionOrigin }): Promise<Revision | undefined>
  history(filter?: { document?: string, task?: string, limit?: number }): Promise<Revision[]>
  revert(id: string, member: Member): Promise<RevertResult>
}

export const REVISIONS = defineService<RevisionService>('presmium.revisions')

export interface DocumentLockService {
  claim(document: string, holder: string): (() => void) | undefined
  holder(document: string): string | undefined
}

export const DOCUMENT_LOCKS = defineService<DocumentLockService>('presmium.documentLocks')

export type DocumentFileChange =
  | { path: string, content: Uint8Array, executable?: boolean, at?: number }
  | { path: string, link: string }
  | { path: string, remove: true }

export interface DocumentFiles {
  write(changes: DocumentFileChange[]): Promise<void>
}

export const DOCUMENT_FILES = defineService<DocumentFiles>('presmium.documentFiles')
```

要点：

- 提交说明的格式：第一行是摘要；正文是改动的说明；尾注 `Presmium-Origin: agent|document|editor`，会话的修改另有 `Presmium-Session` 与 `Presmium-Turn`，以及 `Co-authored-by`（发起人）。作者字段取发起的成员（本机作者）。修改历史按尾注筛选，不依赖服务端的数据库。工作区的 git 命令都关闭钩子与 fsmonitor（`-c core.hooksPath=/dev/null -c core.fsmonitor=false`），提交与撤销不执行仓库中的任何脚本。
- 语音的 `lang` 是 BCP 47 标签而不是界面语言 `Locale`：文稿可以是 Presmium 界面没有翻译的语言，语音引擎照样支持。
- **读者问答**（`@lincyaw/addon-assistant`，插件 ID `presmium.assistant`）：提问在浏览器中完成，不经站点的服务端，静态站点也能用。插件在每个页面上提供浏览器服务 `ASK`（`src/client/chat-client.ts`）：读者在“提问”面板中填写自己的 OpenAI 兼容服务（地址、密钥、模型名），保存在本站点的 `localStorage`（键 `presmium.assistant.ask`；存储被禁用时只在这个页面中有效）；面板写明同一站点的脚本能读到密钥，填写之后在提问之前写明服务（地址的主机）与模型。提问以流式的 `POST <地址>/chat/completions` 直接发往这个服务，请求不带站点的 Cookie 与来源（`credentials: 'omit'`、`referrerPolicy: 'no-referrer'`）。上下文取自页面中文档的 IR（两种形态都是查看器的页面；学生版站点的 IR 本来就没有教师内容），给出当前章节的讲解与块的文字、选中的文字，以及章节目录（ID 与标题）供回答引用；问答插件的视图插件（`src/client/viewer.ts`）还没有运行时给出当前一张幻灯片（`.pm-slide[data-slide]`）的文字，引用只到它所在的一节。回答边生成边显示，引用 `[标签](presmium://sections/<章节>)` 是能点的链接。没有填写时面板说明提问怎样进行并请读者填写。
- **课堂中的 AI 回答**（`addon-classroom/src/client/ai-answers.ts`）：主讲的“互动”总览中每个提问有“AI 回答（<服务提供方>）”，经 `ASK` 问主讲自己在提问面板中填写的服务（没有填写时总览请主讲先填写）；回答是主讲窗口中的草稿，主讲点“发给课堂”后写成提问的 `reply`（`{ text,provider,at }`；引用改为其标签的纯文字），学习者在自己的提问下看到它。
- **服务提供方的标明**：读者的提问面板写明 `ASK.provider()`（读者填写的地址的主机）与模型；转写与合成的入口写明引擎的 `SpeechEngineInfo.provider`；本机引擎（`local: true`）写明不外发。
- **讲授插件的 agent 工具**：`lecture_preview`（`read`，可选参数 `section`）给出讲授计划：每节每步要说的文字（与读出的文字不同时另给出）、其中的提示标记（命令、它之前的几个字与操作的数据）、`pause`、音色、`gap` 与问题；配音生成改由 Workspace 的共享 `start_voiceover`（`spend`）任务入口，配套 `get_voiceover_status/get_voiceover_jobs/get_voiceover_job/cancel_voiceover`，保留 source、IR revision、scope、intent 与单调 sequence；原同步 `lecture_synthesize` 不再暴露；`track_transcribe`（`spend`，参数 `track`）转写一份录制的讲授并写回它的 `track.json`，返回服务提供方与语音段。工具经讲授插件自己的 Node 服务 `presmium.lecture.deck`（文稿目录）找到文稿，按最近一次编译的 IR 计划；`track_transcribe` 与共享生成入口均须经主机花费授权（`packages/addon-lecture/src/node/tools.ts`、`packages/mcp/src/voice-authoring.ts`）。转写回写另有两个 `read` 工具：`track_narration`（参数 `track`、可选 `section`）给出录制讲授的逐字稿按章节与步骤拼成的讲解草稿，绑定到字的操作在那个字之前写成 `{cue}`，并给出每一步讲解在源码中的位置；`track_translations`（参数 `track`、`lang`）给出每句的原文与译文要记下的摘要（`ir.md`）。它们不写文件：写入由 agent 在会话的审阅之中完成。

### 4.9 操作与讲授轨

`packages/kernel/src/contracts/operations.ts`：

```ts
/** 一次语义化的操作，以章节、块与锚点为坐标（词汇见 `ir.md`） */
export interface Operation {
  /** 内置类型（`go`、`point`……）或以插件 ID 开头的类型 */
  type: string
  data: Record<string, unknown>
}

/** 讲授轨中的事件：`[自讲授开始的毫秒, 类型, 数据]` */
export type TrackEvent = [t: number, type: string, data: Record<string, unknown>]

/** 事件数据中的 `at`：[语音段 ID, 字偏移] */
export type UtteranceAnchor = [utterance: string, offset: number]
```

`packages/host/src/contracts.ts`：

```ts
export interface ReplayHandler {
  /** 应用一次操作；`seeking` 为 true 时是跳转中的快进，不播放动画 */
  apply(data: Record<string, unknown>, seeking: boolean): void
  /** 回到没有这类操作的状态；跳转前调用 */
  clear?(): void
}

export interface Operations {
  /** 插件报告用户做的操作；`replaying` 为 true 时报告被丢弃 */
  report(operation: Operation): void
  /** 收到每个报告的操作（录制者） */
  subscribe(listener: (operation: Operation) => void): Unsubscribe
  /** 登记一类操作的重放 */
  onReplay(type: string, handler: ReplayHandler): Unsubscribe
  /** 重放一个操作；没有插件重放这类操作时返回 false，回放者忽略它 */
  replay(operation: Operation, seeking?: boolean): boolean
  /** 调用每个重放的 `clear` */
  clear(): void
  /** 回放者应用操作期间置为 true，画面稳定后置回 false */
  readonly replaying: Store<boolean>
}

/** 宿主服务（两种形态） */
export const OPERATIONS = defineService<Operations>('presmium.operations')
```

`OPERATIONS` 只有一个实现（`@lincyaw/host` 的 `operations.ts`，由 `startHost` 与 `STATUS` 一起提供，不导出）：`replay` 调用登记的重放后，`replaying` 保持为 true 到下一个任务，期间同步发生的报告被丢弃。IR 运行时的部分是 `@lincyaw/viewer` 的 `syncViewerWithOperations(viewer, operations)`：位置或视图变化时同步报告 `go`（数据 `{ section,step,view }`，章节是 ID），重放 `go` 时先切到它的视图（隐藏的演讲者视图除外）再到达位置；查看器的页面（`packages/web/src/app/main.ts`）在内核每次提供 `OPERATIONS` 后接上它。`click` 的重放由宿主自己登记，交给组件经 `useActions` 登记的具名动作（4.4 节）。讲授的播放器在播放、跳转与按帧导出时驱动宿主的 `STEP_CLOCK`：步内时间是讲授的时刻减去最近的 `go` 事件的时刻，所以动画在回放与视频中与讲解同步（4.4 节“步内时间”）。

报告的分工（插件之间不互相引用，词汇是内核的共享契约）：IR 运行时报告 `go`（章节、步骤、视图）；执行插件报告 `run`（块与结果的缓存键）；引导插件报告 `spot`、`hint`；讲授插件自己报告指针 `point`（`elementFromPoint` → 最近的 `[data-block]` → 块内相对坐标，约 20 Hz，简化后保存）与工具栏的激光笔、荧光笔 `ink`。回放某一时刻：`clear()`，再按时间依次 `replay(…, true)` 此前的事件，最后一个事件不快进。

引导插件包含内核插件 `src/client/plugin.ts`（两种形态都登记 `spot`、`hint` 的重放）与视图插件 `src/client/viewer.ts`（放映视图与演讲者窗口中 `s`、`h` 给指针下的块加上或取消聚光、提示并报告）；这种聚光持续到位置离开它的章节或步骤（`span`），由 `NAVIGATION.position` 的同步观察者结束，所以现场、依次重放与跳转后的折叠一致。讲授插件 `@lincyaw/addon-lecture`：`src/domain/`（讲授轨的读写与每项一行的格式、`at` 的时刻、章节、漂移分级、块指纹与 IR 哈希、VTT、路径简化、重录一节的拼接）、`src/node/`（服务端路由、检查项 `presmium.lecture`、站点渲染端 `lecture`）、`src/client/`（内核插件登记 `point`、`ink` 的重放；视图 `lecture`；放映视图上的录制与播放两个图层；`SilentClock`、`MediaClock`；Mediabunny 只在 `src/client/media.ts` 中）。视图插件只以类型引用 `@lincyaw/viewer`，拿不到章节上下文（`SECTION_CONTEXT`），自己画不出按步骤显示的幻灯片，所以回放的“真实页面”是放映视图：`lecture` 视图切到放映视图并保留 URL 的 `track` 参数，播放器是放映视图上的图层，重放 `go` 时去掉 `view`。嵌在工作台中时（`isPreviewEmbedded()`），`lecture` 视图直接打开视频用的那一讲（`defaultTrack`：有合成的 `script` 用它，否则是唯一的那一条录音；导出视频的默认同此），这是现有讲授视图的默认轨选择机制；工作台不设置独立视频工作区，目标播放入口见 [UI/UX RFC](rfc-workbench-uiux.md) 第 7 节。独立的讲授视图需要放映组件或章节上下文，当前视图插件接口未提供它们。`run` 的重放没有 `clear`（`packages/viewer/src/client/code/code-block.ts`），跳回运行之前的时刻时已显示的录制输出不消失。

讲授插件的 `src/domain/` 包含讲解的读法（`narration.ts`：显示与说的两份文字、`{cue}` 的位置、命令与时长）、讲授计划（`plan.ts`：每节每步的段落、在 `pause` 处切开的语音段、提示标记的目标与操作数据，唯一输入是 `lecture.json` 中步骤绑定的 Narration）、合成的时间线（`script-track.ts`：`scriptTrack`）、逐字的处理（`words.ts`：分词、把说的文字的逐字时间换回显示的文字、改文字后的重新对齐、换音色后的字锚换算）与讲授轨的编辑（`editing.ts`：转写得到语音段并绑定事件、改一句、换音色重新合成）；`Utterance.clip` 与合成音色的 `provider`。`src/node/` 提供行内角色 `{cue}`、`{say}`（`roles.ts`）、讲授计划（`plan.ts`）、最近一次编译的 IR（`latest-ir.ts`：编译步骤 `presmium.lecture.keep` 在编译时执行之后记下每个文稿目录的 IR，服务端的路由与 agent 工具由此得到 IR，因为 `ServerContext` 与 `AgentToolContext` 没有编译结果）、经 `SPEECH` 的合成与转写（`synthesize.ts`、`transcribe.ts`；引擎的选择在 `engines.ts`，按键取合成缓存中的片段在 `clips.ts`；没有逐字时间时的对齐与锁定文件的清理经 `SpeechService.alignWords`、`pruneLock` 由语音服务完成，讲授插件不读写合成缓存的文件）、站点渲染端的 `script` 与 `clips/`、检查项的计划部分、编辑的路由（`routes/`：讲授与片段 `tracks.ts`、编辑 `editing.ts`、录制 `recordings.ts`）、agent 工具（`tools.ts`）与 `presmium-lecture export`（`export.ts`、`cli.ts`）。`src/client/` 用 `MediaClock` 播放每个语音段的片段、播放器的 `advanceTo`（按时间应用事件，播放与导出共用）、导出模式（地址加 `&export`：没有控件，`window.presmiumLecture.advance(t)`）、编辑面板 `TrackEditor.tsx` 与逐字稿中每句的修改（`TranscriptList.tsx`）。交互与构建的边界：转写与合成的确认是页面上写明服务提供方的确认框，不经 `APPROVALS`（编辑者点按钮就是确认；agent 的计费工具仍经 MCP 的确认）；`presmium dev` 与 `presmium serve` 的 `GET tracks/script` 只按最新 IR 经 `SpeechService.lookup` 查询完整请求对应的缓存，逐字对齐也只读取缓存，不隐式合成或转写；缺少当前请求对应片段的句子不让预览失败：服务端回答的 `script` 是预览，这些句子没有片段，带 `Utterance.unsaid`（原因），按 `spokenDuration` 估计的时长（`Intl.Segmenter` 分出的词，每词约 0.36 秒）静音，播放器写明有几句没有语音并显示它们的字幕，时间线照常播放；构建与导出视频仍要求所需讲稿均已合成（`SynthesizedLecture.track` 只在全部合成时存在，预览是 `preview`），导出失败的第一行写出第一条原因；合成音色的讲授中改一句要先确认，确认框写明服务提供方；路由、agent 工具与检查都按讲授渲染端的视图（`viewFor(doc,'lecture')`，讲授插件已依赖编译器）计划，与构建一致；`presmium check` 只查找，不向语音引擎发请求；合成讲授的 `go` 由讲授视图的步号经它的 `stepMap` 换回 IR 的步号，所以只在网页形态不压缩步骤时（没有只在幻灯片或 notebook 中显示的上屏块）就是网页的步号；当前渲染上下文没有网页视图的步号映射。

当前预览边界：`GET tracks/script` 只查询完整请求对应的缓存，不合成。所有句子均缺少音频片段时，正式放映使用当前 Narration 派生的按步骤字幕，不把估算时间线当成已准备的配音；有真实缓存片段的时序播放器通过 `TIMED_CAPTIONS` 取得字幕显示权。生成配音仍由作者显式触发。`renderers.lecture.script` 已移除，文稿 metadata、宿主 headmatter 与工作区 YAML 中的旧参数会给出明确诊断，不能覆盖 JSON 中步骤绑定的 Narration。

制作计划的公共边界是内核 `ProductionPlan` 与 `ProductionBinding`（见 [IR 制作计划契约](ir.md#5-运行快照与渲染)）。讲授插件的纯领域函数从既有 `scriptTrack` 事件与实际片段投影页面、步骤、画面、音频和字幕范围；Node 只负责来源确认、缓存查询、真实音频摘要与只读路由。`production-plan` 与 `tracks/script?planId` 共用一份轨，不能各算一条时间线。工作台经 `WorkspaceClient.readProductionPlan`、`readProductionMedia` 读取，dsh 代理既有授权；工作台不导入插件内部领域模块。读取前后确认固定 `lecture.json` 与完整 IR revision，原始 source 已保存但运行快照仍旧时拒绝采用。音频路由只接受完整绑定与计划内 clipId，未知或变更的文件不能成为当前波形输入。

播放器通过公开宿主 `PRODUCTION_PLAYBACK` 服务暴露同绑定的状态、播放头与 `load`、`pause`、`play`、`seek`、`rate` 控制；预览桥使用 `production-playback`、`production-playback-state` 与 `production-playback-result` 传递请求和结果。控制复用既有 LecturePlayer 与 STEP_CLOCK，不在工作台增加时钟。只有确认计划可以提供可播放位置；缺缓存估时与未知计划保留能力状态。显式 None 或零讲稿的纯画面计划使用真实动画／hold／pause／gap，未选来源的讲稿不能因此当作静音。渲染器仍只消费 IR 和精确缓存，不回读作者源；静音导出也复用 `scriptTrack`，末尾实际停顿通过 `LectureTrack.durationMs` 保留。

试听与生成另有保存版本屏障。编译器在 `IRDocument.source` 写入 `CanonicalSource`（见 [IR 来源契约](ir.md#5-运行快照与渲染)）；`GET voice-preview` 的报价与 `GET voiceover` 的状态返回该来源，确认试听与生成 POST 必须原样携带 `source`。报价摘要同时绑定来源、运行 revision、实际文本、音色与提供方。Node 服务在读取报价、生成预检、每个片段调用前和结果采用前核对固定入口的实际内容与最新运行快照；已保存但尚未完成编译的文稿返回 `409 voice-source-changed`，缺少来源标记返回 `409 voice-source-unavailable`，不能继续使用旧 IR 的文本。历史任务携带自身 `source`，旧任务即使缓存仍有效，也不代表当前版本已生成。

同一服务进程内，每个文稿目录共用一份生成占用，覆盖异步预检、逐片段生成和清理；重叠范围返回 `409 voice-job-busy`，不合并或替换原范围。只有相同生成意图与相同来源、revision、范围的已入队请求可返回原任务，其他意图即使范围相同也不共享任务。需要生成的新试听也使用该占用；纯缓存试听不占用生成名额。原同步 `lecture_synthesize` 工具已停止暴露，现有 `presmium-lecture export` CLI 未改动。取消保持 `cancelling`，直到正在进行的调用实际结束后释放占用，已完成的精确缓存不删除；来源变化使旧任务成为 `stale`，迟到结果不计入完成数。该占用不是多服务进程间的分布式锁。 Workspace 的 `DocumentVoiceAuthoring` 持有单一任务 owner，compiled contribution 只借用，配置 remount 不销毁任务。`voiceover/jobs` 与 `voiceover/job` 直接读取进程内任务，坏 JSON 下查询与取消不触发编译或服务装配；standalone 服务使用相同 Node 工厂并关闭自有任务。试听 quote 固定实际 execution，MCP 返回限额内的真实音频 resource，Web 保留原响应格式；音频生成不等于客户端播放确认。渲染、检查与导出继续只消费 IR 和精确缓存，不调用来源校验或隐式合成。

生成 POST 带客户端预分配的 `intent`，任务也返回该标识。`WorkspaceClient.startVoiceover` 默认通过 `getRandomValues` 分配标识，在取消或响应交付失败时用独立短请求按意图取消，不依赖尚未收到的任务 ID。`POST voiceover/cancel` 接受互斥的 `{ id }` 或 `{ intent }`；按意图取消返回 `VoiceoverCancellation { intent, state, job? }`，可先于生成请求到达，此时返回取消状态而不伪造任务。取消标识在该服务实例存续期间保留，迟到的生成请求不能重新入队；每文稿最多记录 1024 个意图，达到容量明确返回 503，不淘汰取消标识。已经完成的任务被迟到取消时仍如实返回完成状态。取消确认需要实际到达服务；网络失败由现有请求观察器报告，不承诺跨进程重启或网络断开期间的取消交付。

转写回写的读法在讲授插件的 `src/domain/writeback.ts`：由事件写回提示标记（`cueFor`）、逐字稿拼成的讲解草稿（`narrationDraft`）、一步讲解在源码中的位置（`narrationPlace`，取自讲授计划，所以单独的讲授脚本中的段落同样找得到）、要翻译的语音段与摘要（`translationItems`）；agent 经 `track_narration`、`track_translations`（`src/node/tools.ts`）取得它们，写入在会话的审阅之中。

### 4.10 IR 与渲染端的扩展

`packages/kernel/src/ir.ts`：

```ts
export interface IRDocument {
  meta: {
    // ……已有字段……
    /** 本文稿是译本时：原文的入口文件（相对于文稿目录）与译本所依据的原文摘要 */
    translationOf?: { entry: string, digest: string }
  }
  config: {
    // ……已有字段……
    /** 头部的 `execute`，不含凭据 */
    execute?: ExecuteConfig
    /** 头部的 `translations`：语言到译本的入口文件 */
    translations?: Record<string, string>
  }
}

export interface IRSection {
  /** 只给这些受众，如 `['teacher']`；省略时对所有受众 */
  audience?: string[]
}

export interface IRBlock {
  audience?: string[]
}

export interface RunSpec {
  /** 执行会话（`:session:`） */
  session?: string
}

export interface CodeNode {
  /** `false`：不显示代码与运行控件，只显示输出；`text/markdown` 输出按正文显示 */
  echo?: false
}

// RecordedRun extends RunResult：继承 `outputs`

export interface ComponentNode {
  /** 键可以是属性路径，如 `captions.en`：按 `.` 逐层进入对象属性 */
  assets?: Record<string, string>
  /** 生成当前内容的真实代码定义；工作台按块锚点读取与保存，渲染端不读取源码 */
  definition?: { file: string, language: string }
}

/** 行内角色的输入：{name key=value}`value` */
export interface RoleInput {
  name: string
  /** 反引号中的内容 */
  value: string
  options: Record<string, unknown>
}

export interface RoleSpec {
  name: string
  options?: Record<string, DirectiveOptionType>
  /** 角色节点的子内容；省略时为一个内容是 `value` 的文本节点。`{cue}` 返回空数组，命令写在 `options.value` 中 */
  children?(input: RoleInput, ctx: DirectiveContext): MdastNode[]
}

/** IR 中登记过的角色（`markdown` 节点的 mdast 中）；不认识它的渲染端只显示 `children` */
export interface PresmiumRoleNode extends MdastNode {
  type: 'presmiumRole'
  /** 登记该角色的插件 ID */
  plugin: string
  name: string
  /** 选项，以及 `value`（反引号中的内容） */
  options: Record<string, unknown>
  children: MdastNode[]
}

export interface PassContext {
  // ……已有字段……
  /** Node 端服务；编译器总是提供，可选只是为了兼容（插件写 `ctx.service?.(SPEECH)`） */
  service?<T>(token: ServiceToken<T>): T | undefined
}

export interface RenderContext {
  // ……已有字段……
  /** 同 `PassContext.service` */
  service?<T>(token: ServiceToken<T>): T | undefined
  /** 有运行时文件（`assets`）或文稿模块（`documentModules`）的插件：Node 端入口与它在文稿中的配置（`ir.md`） */
  nodeVitePlugins?: NodeVitePlugin[]
  /** 头部声明的译本，编译器另行编译（语言，IR）；网页渲染端使用 */
  translations?: { lang: string, doc: IRDocument }[]
  /** `presmium dev` 中服务端的地址，站点服务把 `/__presmium/` 代理到它；构建中省略 */
  server?: { url: string }
}

/** 工作区站点中的一份文档 */
export interface SiteDocument {
  /** 目录，相对于工作区根目录；文档的页面在 `<base><dir>/` 下 */
  dir: string
  title: string
  lang?: string
  tags?: string[]
  /** 编译好的 IR；开发中尚未访问的文档没有 */
  doc?: IRDocument
  /** 头部声明的译本，像单独构建文档那样编译（语言，IR），同 `RenderContext.translations`；站点把每个译本发布在 `<base><dir>/<lang>/` */
  translations?: { lang: string, doc: IRDocument }[]
  /** 同 `RenderContext.nodeVitePlugins`，按本文稿当前的配置 */
  nodeVitePlugins?: NodeVitePlugin[]
}

export interface SiteSpec {
  title: string
  /** 按工作区配置的顺序，也是文稿之间前后导航的顺序 */
  documents: SiteDocument[]
  /** 作为首页的文档目录；省略时首页是文档列表 */
  home?: string
  /** 工作区配置的 `site`：与 `renderers.web` 的站点外壳选项相同 */
  config: Record<string, unknown>
}

export interface SiteDevServer {
  url: string
  /** 一份文档编译或重新编译之后调用 */
  update(dir: string, doc: IRDocument): Promise<void>
  /** 在文档的页面第一次被请求之前准备它（作者就要打开它）；可以不做 */
  warm?(dir: string): Promise<void>
  /** 回答 `path` 的服务的源，宿主直接转发到它 */
  target?(path: string): Promise<string>
  /** 工作台中显示文档 `dir` 的查看器页面的地址（站点的 URL 之下）；查看器与文稿的代码包没有准备好时开始准备，`wait` 时等一会儿；还没有准备好时为 undefined */
  app?(dir: string, wait?: boolean): Promise<string | undefined>
  close(): Promise<void>
}

export interface Renderer {
  // ……已有字段……
  /** 把多份文档构建为一个站点；只有网页渲染端实现 */
  buildSite?(site: SiteSpec, ctx: RenderContext): Promise<RenderOutput>
  /** 工作区站点的开发服务器；页面请求一份尚未编译的文档时调用 `compile` */
  devSite?(site: SiteSpec, ctx: RenderContext, compile: (dir: string) => Promise<IRDocument>): Promise<SiteDevServer>
}
```

源语法与这些字段的对应、各渲染端的处理见 `ir.md` 和内核契约源码。媒介 ID `lecture` 不是新的 IR 字段：它是讲授插件的渲染端 ID，`only: ["lecture"]` 经块的范围字段生效。

**实现边界**：

- `RenderContext.localAsset` 的结果也可以是目录（`ir.md`）：编译器（`assets.ts`）与工作区站点的上下文（`packages/workspace/src/node/site.ts`）把文稿之内的目录准备为带文件清单页的副本，渲染端以 `cpSync(…, { recursive: true })` 发布它，与文件相同；不能发布的本地引用由这两处报告 `presmium.links`（构建报告去掉各渲染端重复的报告）。工作区站点的上下文另拒绝工作区之外的文件。
- 译本的摘要、配置继承与编译统一见 `ir.md`；实现位于 `packages/compiler/src/translations.ts`。诊断经编译器的 `report` 汇入，译本以自己的入口文件编译，不在文稿中写临时入口。
- 网页的页面路由在 `packages/web/src/app/router.ts`：文稿的每章是一页（`index.html` 与 `<章>.html`，在页面语言的站点路径下，译本在 `<base><语言>/` 下），页面配置给出这一页的 IR 与语言（构建时每页的服务端渲染同样）。这份文稿同一语言的页面之间经浏览器的历史切换，不重新载入；指向其他页面（另一语言、另一份文档、工作区首页）的链接整页载入。工作台中的页面只有一个地址，在原处翻页。
- `presmium serve` 的工作区站点中，上一份、下一份文档的链接按页面打开时已编译的文档给出；搜索中其他文档的内容按这份文档的索引第一次被请求时已编译的文档给出，在这份文档下一次更新时重新计算。

**编译与发布**：

- 过期检查：`applyTranslations(doc, fields, report)` 经编译器的 `report` 报告，在去掉受众内容之前（摘要的文件仍取完整 IR 中出现的文件，所以学生版的构建按同一摘要检查）。
- 译本从自己的入口编译：`CompilerOptions` 支持 `headmatter`（替换入口头部的字段，值为 `undefined` 的去掉；译本取原文的 `plugins`、`presmium`、`renderers`、`execute`、`sectionDepth`、`checks`，没有 `lang`、`title` 时取声明的语言与原文标题，去掉 `translations`）与 `deckDir`（文稿目录不是入口所在目录时：译本在原文的文稿目录中编译，插件、`public/`、组件、锚点锁与执行缓存都是这份文稿的）。`Compilation.options` 记录编译选项，译本的编译取它（宿主服务也在其中），原文为某个受众编译、或构建某个受众的视图时（`Compilation.audience`）译本同样按该受众编译；`presmium dev` 中译本的编译器在头部或受众变化时换新。文稿目录中不写任何文件。
- `build(compilation, { outDir, to, audience?, quote?, scan? })`：`audience` 构建完整编译的该受众版本（`audienceDocument`、`audienceCompilation`），译本按该受众编译；为某个受众编译或构建时，构建结束后扫描输出，被去掉的句子包括各译本的（不含原文或任一译本自己也有的句子），`quote: false` 时诊断不引用句子。`scan` 默认 `outDir`，读输出目录中的每个文件（`presmium build --audience`：此前完整构建留在同一目录中的其他渲染端目录同样被检查）；`written` 只读这次写出的 `ir.json` 与各渲染端的目录，供输出目录中同时有完整版构建的调用方使用。`presmium build --audience` 经它；`ServerHost.build` 构建完整的文稿（编译器的 `buildToDist` 写到文稿的 `dist/`，工作区服务写到服务状态目录）。
- 发布文件的共用代码：`packages/compiler/src/assets.ts`（`fileHash` 按大小、inode、修改时间与状态改变时间缓存文件的哈希，两秒之内改过的文件不缓存（同 git 对“racily clean”的处理：时间戳的精度之内同样大小的改动看不出来），`publishesDirectory` 判断目录是否可发布，`directoryAsset` 发布目录并拒绝隐藏目录与 `node_modules`，`localAsset`、`publishedAsset`、`documentLink` 是渲染上下文的 `localAsset` 与 `documentLink`），由 `@lincyaw/compiler` 导出，工作区站点的上下文引用它，`portable` 与 `lineContaining`（`source-lines.ts`）同样；路径包含判断是 `@lincyaw/kernel/node` 的 `isInside`。`htmlAttributes` 与 `mapHtmlUrls` 由 `@lincyaw/kernel` 统一提供，以 parse5 读取并改写原始 HTML 的地址。
- 工作区站点的译本：工作区根目录的 `presmium build` 以 `packages/workspace/src/node/site.ts` 的 `siteTranslations`（编译器的 `compileTranslations`）编译每份文档的译本，放进 `SiteDocument.translations`，网页渲染端（`site-model.ts` 的 `documentContext`）把它们交给文档的 `RenderContext.translations`，站点的构建（`site-build.ts`）为首页生成每种语言的页面（`ir.md`）。`presmium serve` 的预览不编译译本：`untranslated` 为声明了译本的文档给出警告 `presmium.translations`，写进该文档的诊断。
- 首页的运营者插件：编译器的 `workspacePlugins(root, options)` 按文档编译的同一选项加载运营者插件（`settings.presmium.workspace.plugins` 中声明 `operator: true` 的）并登记它们的 Node 服务。`presmium serve` 在服务端启动之后加载一次，首页（文档 `''`）的 `ServedDocument` 带上它们的服务端部分与服务（宿主的服务在前），所以它们的路由在首页应答。首页不是文档：它的 `ServerContext.deckDir` 与 `workspaceRoot` 都是 serve 在系统临时目录中建的一个空目录（关闭时删去），不是工作区根目录，所以插件的路由在首页读不到也改不了工作区中的文件；插件按 `ServerContext.home` 认出首页（服务端从首页的 `ServedDocument.home` 得到它；`presmium dev` 的文稿在仓库的根目录、入口是 `lecture.json` 时也是文档，所以不能按目录猜），那里只回答不需要文档的请求，文档的列出与新建经工作区的路由（`presmium.workspace`）。它们的 Node 服务仍按工作区创建（`workspacePlugins` 的上下文是工作区根目录）。页面只加载文稿列出的插件的浏览器部分。

## 5. 插件约定

### 5.1 浏览器端注册

插件包的入口按职责划分。网页与幻灯片都是查看器的页面，查看器从这里注册，插件不必为两种形态各写一份：

| 入口 | 内容 | 查看器怎样使用 |
|---|---|---|
| `src/client/plugin.ts` | 默认导出内核插件定义 `PluginDefinition`：提供的服务与启动时的初始化 | 为页面的 `plugins` 中每个包导入这个文件，调用 `registerPresmiumPlugin`（`@lincyaw/host`） |
| `components/*.tsx` | 组件，文件名即组件名，对应 `component` 节点的 `name` | 按文件名注册到 IR 运行时，第一次显示时载入 |
| `src/client/viewer.ts` | 默认导出视图插件 `ViewerPlugin`（类型来自 `@lincyaw/viewer`） | 在 IR 运行时启动前调用一次，两种形态都运行 |
| `vite.config.ts` | 查看器构建用的 Vite 插件与 JSX 配置（第 3 节） | 查看器与它的服务端渲染的构建加上它们 |
| `./presmium` 的 `assets`、`documentModules` | 运行时文件与随文稿而变的模块（4.2 节） | 站点服务提供、站点的构建复制运行时文件；文稿模块打进文稿的代码包（1.1 节） |

插件之间组件重名时，编译器报告 `presmium.plugins` 警告并采用插件列表中第一个声明；网页、幻灯片与静态扩展选择同一提供方。文稿自己的 `components/` 可以覆盖插件的同名组件。

文稿自己的组件：文稿目录下的 `components/*.tsx` 由编译器以插件 ID `deck` 登记，`{component}` 可引用它们，编译检查与编辑器识别这些组件并提供补全；它们打进文稿自己的代码包（1.1 节），在网页与幻灯片中照常渲染并保留内部步骤。这些组件同插件组件一样只能引用 `@lincyaw/host`、`@lincyaw/kernel` 与 React；代码包按名字从查看器的导入映射取得这几个包，不把它们打进去。

宿主适配在应用初始化时启动内核：按依赖顺序初始化全部已注册的插件，启动报告在演讲者视图中显示。两种形态注册的是同一批插件，启动报告一致。没有浏览器端服务的插件可以不提供 `plugin.ts`。

视图插件是一个函数 `(ctx) => void`，`ctx` 提供：

| 成员 | 作用 |
|---|---|
| `registerView({ id, label, kind, component, hidden? })` | 注册运行时视图（`ir.md`）。`kind: 'page'` 的视图在页面正文中渲染本页的章节，组件得到属性 `sections`；`'overlay'` 的视图覆盖全屏、贯穿全文；`hidden` 的视图不出现在视图菜单中。同一 ID 后注册的替换先注册的 |
| `registerNodeRenderer(key, component)` | 为一类块注册渲染器。`key` 为节点类型（`markdown`、`code`、`component`）、`code:<语言>` 或组件名；渲染器得到属性 `block`、`section`、`step` |
| `registerComponent(name, component)` | 注册渲染 `component` 节点的 React 组件，用于 `components/` 约定之外的组件 |
| `registerAction({ id, keys, run, views? })` | 注册按键动作：`keys` 为 `KeyboardEvent.key` 的值（不含 Ctrl、Alt、Meta），`run(viewer)` 返回 `false` 时按键交给其他处理；`views` 默认是放映视图与演讲者窗口。例如舞台插件的 `b`、`f`、`d` |
| `registerLayer({ id, component, views?, scope? })` | 注册覆盖视图的图层，组件得到属性 `view`；`views` 默认同上。`scope: 'viewport'`（默认）与视图根并列，供播放器、课堂状态与黑屏使用，可与全局聚光、弹层按同一层级排序；`'view'` 放在视图根内，供冻结画面、讲台徽标与录制面板按视图定位；`'slide'` 在每张幻灯片上（`.pm-slide__layers`，画布的坐标），组件另得到这张幻灯片的 `section` 与 `step`，例如舞台插件的圈画（`views` 可以含打印页 `print`）；`'bar'` 是视图控制条中的控件，例如舞台插件的画笔。这些图层都在视图的模态焦点范围内；全屏覆盖整个文档，保留插件与库经公开接口创建的浮层 |
| `useViewer()` | 在组件的 `setup` 中取得运行时状态：文档、当前视图与位置 |
| `SectionView`、`BlockView` | 组成视图的构件：一个章节（含版式），一个块在某一步的状态 |

视图插件抛错时只记录错误并跳过它，其余插件照常安装。视图与渲染器同插件组件一样，只依赖 `@lincyaw/host`、`@lincyaw/kernel` 与 React；`@lincyaw/viewer` 只引用类型。

### 5.2 配置

插件全局文稿配置为 `metadata.presmium[pluginId]`，页面配置为 `sections[sectionId].config[pluginId]`，组件实例参数为 `blocks[blockId].parameters`。编译器将相应配置派生给运行快照，宿主通过 `useSectionConfig` 读取当前页面合并配置。运营者设置继续位于工作区/运营者目录，不进入作者 metadata。

代码执行和引用参数有自己的类型字段；参数 Schema 与公开状态在定义中校验。讲授默认值、页面/步骤覆盖、音色来源和 cue 延迟只由 `production` 保存，不能用插件配置再定义一份作者时序。

### 5.3 步骤可逆

插件组件的视觉状态必须是步骤的纯函数；有动画的组件是（步骤，步内时间）的纯函数，时间取自 `useStepTime()`（4.4 节），不取自页面时钟或动画库自己的播放。现场放映、讲授回放、跳转与按帧导出因此得到同一画面。React 组件通过 `useStepState` 读取块内状态，通过 `useStepScope().step(k)` 将块内步骤换算为绝对步骤；显示状态直接由 JSX 与这些值派生。`VClick`、`VAfter`、`VClicks` 仍是 React 的渐进显示辅助组件，不再提供 Vue 模板指令或 `$frontmatter` 等模板全局量。

本地步骤：宿主以全部展开的最终状态渲染组件时（文档视图，`useHost().useStep()` 为无穷大），有内部步骤的组件可以给读者一个自己的步进控件，例如分步执行的上一步、下一步与滑块。读者选的本地步骤与执行结果一样是读者的输入，不写回宿主的步骤；组件的视觉状态是（章节步骤，本地步骤）的纯函数，仍然可逆。滚动叙事中没有讲解的步骤（组件的内部步骤）每步只占四分之一屏，读者不必滚过大片空白。

### 5.4 错误隔离

渲染端隔离组件：IR 运行时在每个插件组件外面包一层 React `PmBoundary`。组件渲染或 React 生命周期抛错时，边界显示占位与错误信息，并在浏览器控制台及组件错误汇总中记录；其他组件照常渲染。边界放在被保护组件的外部，组件不再自行包装同样的边界。IR 运行时按组件属性与子块给边界一个 `resetKey`，修复后的新版本可以重置错误状态。异步事件或后台任务的错误仍由各自的操作入口记录。

### 5.5 减少动态效果

所有动画读取 `usePrefersReducedMotion()`，开启时直接显示终态。按步内时间画的动画由 `useStepTime()` 处理：减少动态效果时它给出 `Infinity`；只有按帧导出的视频照常画出动画（4.4 节）。导出的页面本身按减少动态效果打开，其他界面的过渡直接到终态，每一帧因此只由讲授的时刻决定。

### 5.6 媒介限定与排版提示

部分媒介中的内容由文稿块的 `only` 数组声明，例如 `["web", "notebook"]`。每个渲染端只收到属于自己的块；排版提示保存为页面 `layout.renderers`。

### 5.7 界面语言

界面文本有中文与英文：

- 文稿的语言只由头部的 `lang` 声明，例如 `lang: en-US`，默认 `zh-CN`。编译器总是把它写入 IR 的 `meta.lang`，两种形态都据此设置 `<html lang>`：页面的外壳（`site-page.ts`）按页面配置的 `lang` 写出它（译本的页面是译本的语言）。渲染端的配置不能另设语言。
- 浏览器中的界面语言为 `'zh-CN'` 或 `'en'`：`<html lang>` 以 `zh` 开头时为中文，以 `en` 开头时为英文；其他语言（如 `fr`）看 `navigator.language`，仍无法确定时为英文。各包一律经 `@lincyaw/host` 取语言：组件中用 `useMessages(CATALOG)`，组件之外用 `CATALOG[currentLocale()]`，`CATALOG` 是包自己的 `{ 'zh-CN': …, en: … }`。只有 `@lincyaw/host` 跟随 `<html lang>` 的变化，各包不自己判断语言，也不各自观察 `<html lang>`。
- 每个包维护自己的 zh-CN 与 en 文本，文件位置由包自定（例如 `src/domain/messages.ts` 或 `src/client/messages.ts`）。
- 开发服务器的端点（如本地环境插件的端点）按请求的 `Accept-Language` 回答，浏览器端在请求中带上界面语言。
- 编译时写入产物的文本按文稿的语言：指令、编译步骤与渲染上下文都带 `lang`，`deckLocale(lang)`（`@lincyaw/kernel`）给出 `'zh-CN'` 或 `'en'`（没有对应文本的语言为英文），例如 notebook 中指向网页版的说明、练习单元格的标签、导出环境中的说明文件、聚光灯的降级文字。编译时执行器写入录制输出的消息（例如超时）与解释器自身的报错一样为英文，也不含构建机器的路径。
- 站点外壳与查看器的界面文字（导航、目录、翻页、搜索、明暗切换、视图菜单、放映与演讲者视图的控制条、屏幕阅读器标签与 404 页）都是 Presmium 自己的，网页形态的在 `packages/web/src/domain/messages.ts` 的 `WEB_MESSAGES`，IR 运行时的在 `@lincyaw/viewer`，按页面的语言选取。

### 5.8 静态导出

PDF、图片与 PowerPoint 的导出中，插件组件显示 IR 的 `fallback`，不显示交互界面：打印页上宿主的 `useStaticRender()` 为 true，IR 运行时把带 `fallback` 的组件换成降级内容（`.pm-static-fallback`）。插件负责让降级内容完整：执行面板的降级内容是先给参数赋值的代码，加上编译时的输出（构建时没有执行、执行失败或超时的用 组件 parameters.recorded 的录制输出），由执行插件在编译时执行之后的步骤（`after: 'execute'`）写入。notebook 渲染端有自己的扩展时用扩展，否则使用 `fallback`（`ir.md`）。

打印页是构建好的幻灯片页加查询参数 `?print`（`&steps` 每一步一页，`&slides=1,3` 只印这几张；`printQuery`、`parsePrintQuery` 在 `@lincyaw/web` 的 `domain/links.ts`）：IR 运行时的 `SlidesPrint` 把每张幻灯片按画布的大小排成一页（`.pm-slides-print__page`，每张在最后一步，`steps` 时每一步一页），字体与图片载入后在 `<html>` 上设 `data-presmium-printed`，页面以此说明何时可以打印。`printSlides`（`@lincyaw/web/slides`）在本机回环的空闲端口上服务构建好的幻灯片，用调用方给的 Chromium（`playwright-chromium`）以画布的大小、减少动态效果、不用 Service Worker 打开打印页，等这个属性出现（上限是导出的 `--timeout`，默认 120 秒），再打印 PDF 或给每一页截图（PNG 为画布的两倍大小）。

### 5.9 浮层组件与组件拥有的代码

在页面上绘制在其他内容之上、自身不占版面的组件（例如引导的光标），由指令把组件节点标为 `layer: 'overlay'`。渲染端不给它单独的位置：网页的文档视图按源码顺序渲染块，不给上屏内容添加板书外框；浮层本身不占版面，服务端渲染与首帧的版面也不跳动。

组件拥有的代码：组件默认拥有其子块中的代码块（例如执行面板、分步执行、本地环境包着的代码）。两种形态都不给它们运行控件，也不显示它们的录制输出，由 IR 运行时实现。只组织子内容、不负责执行的容器在 `ComponentNode` 写 `ownsCode: false`，例如预测的揭示内容，子代码照常显示运行控件和录制输出。组件运行的代码由指令放在组件的属性中（如执行面板的 `code`），不从渲染后的 DOM 读回。

媒体组件（内容插件的 `PmMedia`）在不处于活动状态或组件卸载时暂停视频与音频，并阻止这时的播放：阅读视图（视图角色 `reader`）中总是活动的，放映与幻灯片中只在所在块的步骤范围内活动（`useStepState(useBlockStepRange())`，`src/client/media.ts`）。回到活动状态时，只有因此暂停的自动播放媒体恢复，手动暂停或已播放完的媒体保持原状态。网页阅读时仍可手动控制屏幕外的音频。

### 5.10 设计系统

正式控件、样式文件职责、素材入库、Figma 第 02 页组件映射与遗留迁移以 [控件与视觉实现规范](design-system.md) 为准。业务 CSS 只组合布局，不临时重写公共控件外观；缺少能力先补公共层与 Figma 变体。本节记录现有实现边界，不能用低保真线框或结构检查代替正式视觉验收。

`components.css` 已按公共密度统一按钮、输入、标签页和互斥参数；兼容的 `small` 映射到 compact。粗指针设备补足触屏热区和输入字号。具体取值、公开属性与剩余迁移范围集中在视觉规范第 3、4、9 节，不在业务 CSS 重复定义。

> **工作台**：令牌、`pm-ui-*` 的类、字体与图标在 `@lincyaw/design`（`packages/design/src/`；`@lincyaw/host` 引用它，React 组件与 `useAppearance` 留在 `host`），工作台的 React 面板（`@lincyaw/workbench` 的 `components.tsx`）用同一层，dsh 自己的面板经它的 `--dsw-*` 令牌映射（`design-dsh.md` 7.5 节，第 13 节）。

产物的 React 通用交互由依赖实现：`@lincyaw/host` 的弹窗、抽屉、菜单、浮层和标签页封装 Radix Primitives；查看器的内容标签页与放映焦点范围也使用 Radix。文稿标签的 `sync` 联动、背景页面禁用与步骤导航由 Presmium 维护。主题由宿主的 React hook 与浏览器观察器同步；图标由 Lucide 提供，`@lincyaw/design` 保留语义名称与框架无关的节点和 HTML 接口。读者问答的 SSE 事件边界由 eventsource-parser 解析。

工作台的通用交互由依赖实现：Radix Primitives 提供弹窗、菜单、Tooltip、手动激活的 Tabs、Radio Group 与工具栏焦点移动，react-resizable-panels 提供分栏与鼠标、键盘调整，dnd kit 提供页面列表的指针、触屏和键盘排序。`Pm*` 只封装样式与业务回调；首次欢迎在 dsh 适配层直接复用 Harness 的 `Modal`。文档操作、就地编辑落回源码、版本历史、编译、审阅与预览协议由 Presmium 维护。

`@lincyaw/host` 提供设计令牌与通用组件；网页形态的外壳（工作区首页、阅读页）、幻灯片与插件都用它们，不各自定义颜色与控件。插件界面与幻灯片的书卷版式见 5.12 节。

**令牌**：CSS 自定义属性，在 `packages/design/src/tokens.css`（颜色令牌的名字另由 `@lincyaw/design` 的 `COLORS`、`color(name)` 给出）。`:root` 为亮色；`<html>` 有 `dark` 类时为暗色（站点外壳的明暗开关与工作台的 `appearance` 命令都设这个类）。

| 组 | 令牌 | 说明 |
|---|---|---|
| 颜色 | `--pm-color-bg`、`surface`、`sunk`、`chrome`、`canvas`、`hover`、`pressed`、`primary-hover`、`primary-pressed`、`accent-hover`、`accent-pressed`、`backdrop`、`code`、`ink`、`muted`、`muted-soft`、`line`、`line-strong`、`accent`、`accent-soft`、`accent-line`、`on-accent`、`selected`、`ok`、`ok-soft`、`warn`、`warn-soft`、`danger`、`danger-soft`、`add`、`del`、`gutter`、`syntax-key`、`syntax-string`、`syntax-keyword`、`qr-paper`、`qr-ink`、`sheen`、`shadow` | 二维码的 paper/ink 在暗色中保留固定对比；动画的高光 `sheen` 与投影 `shadow` 在两种外观下都保持浅与深。其余取值见 `packages/design/src/tokens.css`。`ok` 在 `ok-soft` 上达到 AA；`muted-soft`、`accent-soft`、`ok-soft`、`warn-soft`、`danger-soft` 也是文稿文字的背景色，暗色下与纸面的亮度比约 1.5–1.7，墨色在其上高于 7:1，各语义色在自己的 soft 底上高于 4.5:1；`line-strong` 在 `bg`、`surface`、`sunk` 上达到 3:1（WCAG 1.4.11）。源码编辑器的行号用 `muted`（5.11 节）；`danger` 与 `del` 同色。`chrome` 是编辑台围在文稿四周的界面（各种栏与窗格），`canvas` 是纸张或幻灯片下面的画布；`hover` 是鼠标下的扁平控件，`accent-line` 是按下的控件的边，`backdrop` 是模态遮罩 |
| 字体 | `--pm-font-sans`、`--pm-font-serif`、`--pm-font-mono` | IBM Plex Sans、Source Serif 4、IBM Plex Mono，后接中文的系统字体 |
| 字号 | `--pm-text-xs`、`sm`、`md`、`lg`、`reading`、`title`、`display` | 12、13、14（界面）、16、17（阅读）、20、32 px，以 rem 表示，跟随读者的字号 |
| 行高 | `--pm-leading-tight`、`ui`、`reading` | 1.25、1.6、1.85 |
| 间距 | `--pm-space-px`、`--pm-space-1` 至 `--pm-space-12` | 4 px 网格，`px` 是 2 px 的微调 |
| 圆角 | `--pm-radius-control`、`small`、`card`、`panel`、`chip`、`pill`、`tool`、`sheet`；嵌套的 `control-inset`、`menu-item` | 8、6、12、14、4、999、4、2 px；`tool` 是编辑台的命令与导航项，`sheet` 是画布上的纸张；嵌套的两个是外层圆角减去间隙（6、4 px），规则见 `docs/design-system.md` 第 5.4 节 |
| 尺寸 | `--pm-size-hairline`、`stroke`、`rule`、`dot`、`icon-sm`、`icon`、`icon-lg`、`logo`、`badge`、`avatar`、`divider`、`tool`、`touch`、`row`；`--pm-control-height`、`--pm-control-hit-area` | 细线、描边、图标、标志和行高；新增正式控件高度与有效热区令牌，旧控件使用情况与待迁移项见视觉规范 |
| 编辑台 | `--pm-appbar-height`、`--pm-appbar-height-touch`、`--pm-toolbar-height`、`--pm-statusbar-height`、`--pm-pane-header-height`、`--pm-navigation-width`、`--pm-aside-width`、`--pm-sheet-width` | 应用栏、命令栏、状态栏与窗格标题的高度，导航窗格与批注、版本历史窗格的宽度，画布上纸张的宽度 |
| 阴影 | `--pm-shadow`、`--pm-shadow-float`、`--pm-shadow-page` | 前两个只用于分段控件的选中项与浮层；`page` 是画布上的纸张与幻灯片；不用渐变 |
| 动效 | `--pm-duration-fast`、`--pm-duration`、`--pm-duration-slow`、`--pm-duration-spin`、`--pm-duration-pulse`、`--pm-ease` | 系统要求减少动态效果时前三个为 0；`slow` 是页面与幻灯片上步骤的显现，`spin` 是忙碌的转圈，`pulse` 是活动的圆点与加载占位；只动画 `transform` 与 `opacity` |
| 外壳 | `--pm-activity-width`、`--pm-sidebar-width`、`--pm-statusbar-height`、`--pm-z-popover`、`--pm-z-dialog` | 工作台的列宽、状态栏高与浮层的层级 |

**字体**：三种西文字体的拉丁子集随 `@lincyaw/design` 发布（`fonts.css`；`@lincyaw/host` 也列出这三个包，站点的字体许可证由它们写出，Fontsource 的 `@fontsource/ibm-plex-sans`、`@fontsource/source-serif-4`、`@fontsource/ibm-plex-mono`，SIL OFL 1.1），打包进产物，不从网络加载。中文先用系统字体：黑体为 PingFang SC、Microsoft YaHei、Noto Sans CJK SC，宋体为 Songti SC、Noto Serif CJK SC、Source Han Serif SC。

**加载**：`@lincyaw/host` 的入口引入 `src/design/design.css`（它引入 `@lincyaw/design/design.css`：字体、令牌与组件的类），用到宿主的页面都有它们；宿主之外的页面可以单独引入 `@lincyaw/host/design.css` 或 `@lincyaw/design/design.css`。

**通用组件**（`packages/host/src/design/components.ts`，样式在 `@lincyaw/design` 的 `components.css`，类名以 `pm-ui-` 开头；插件也可以直接用这些类；工作台用到的几个有 React 版，在 `@lincyaw/workbench`，同名同类）：

| 组件 | 用途 |
|---|---|
| `PmIcon` | 线性图标（`ICONS`，24 px 网格，1.7 px 描边，不用 emoji 与 ◀ ▶ ✓ 这类字形）；只能写 HTML 文字的地方用 `iconMarkup` 得到同样的 SVG |
| `PmButton` | 按钮：五种强调等级、`density`、`loading` 与兼容的 `small`；`aria-pressed="true"` 显示选中，忙碌时阻止重复操作 |
| `PmIconButton` | 图标按钮，`label` 是可访问名称，`hint` 与 `shortcut` 由公共 Tooltip 显示 |
| `PmField` | 带标签的输入、选择与文本框（类 `pm-ui-input`、`pm-ui-select`、`pm-ui-textarea`，边框为 `line-strong`）；`inline` 用于复选框 |
| `PmBadge` | 徽标：`accent`、`ok`、`warn`、`danger`、`outline`，`pill` 为圆端的来源标签 |
| `PmCard` | 卡片：`interactive`（通向别处）、`dashed`（新建一样东西） |
| `PmSegmented` | Radix Radio Group：横排互斥参数，方向键移动与选中；支持图标、密度和禁用 |
| `PmTabs`、`PmTabPanel` | 标签页和关联面板；方向键移焦，Enter／Space 手动激活，支持图标标签 |
| `PmTooltip` | 名称与快捷键提示；悬停延迟和焦点行为见视觉规范 |
| `PmPopover` | 依附于触发器的弹层；会超出窗口时横向移入，离窗口两侧 1 rem（如手机宽度下站点菜单中的工具栏项） |
| `PmDrawer` | 活动栏旁、与窗口等高的面板 |
| `PmDialog` | Radix 模态对话框：标题、说明、忙碌、操作区与焦点归还，外部按下不关闭 |
| `PmMenu` | 菜单：打开时焦点在第一项，方向键移动，到头时回到另一端；选中一项或按 Escape 后焦点回到按钮；同样留在窗口内 |
| `PmEmpty` | 空状态：简短的引导文字，不留空白 |
| `PmSkeleton` | 加载占位：按 `shape`（`document`、`list`、`preview`）画出将要出现的内容 |
| `PmNotice` | 提示，`status`，失败时为 `alert` |
| `PmToolbarEntry` | 打开面板的工具栏项：在活动栏中是图标按钮与抽屉，在其他位置是带文字的按钮与弹层（状态栏中向上弹出） |

浮层的焦点、Escape 和外部关闭由公共 Radix 封装处理，具体合同见 [视觉规范第 5 节](design-system.md#5-状态与行为合同)。文字对背景达到 WCAG AA（1.4.3）；标识控件与状态的图形达到 3:1（1.4.11）：输入框与搜索框由边框标识，分段控件的选中项由边框标识，都用 `line-strong`；按钮由文字标识，边框可以用 `line`；复选框由浏览器绘制，颜色取 `accent`。另有 `pm-ui-search`（搜索框）、`pm-ui-kbd`、`pm-ui-heading`（卡片与分区的小标题）、`pm-ui-list`、`pm-ui-dot`（状态点）、`pm-ui-code`、`pm-ui-link` 等类。

`useAppearance()` 给出当前是否为暗色与切换的方法。宿主适配可以提供 `HostAdapter.useDarkMode`（查看器的页面给出页面的明暗），这样切换与页面的明暗一致，站点外壳的开关另把读者的选择记在本站点的 `localStorage`（`presmium-appearance`，页面头部在第一次绘制之前读它）；没有时 `useAppearance` 直接设 `<html>` 的 `dark` 类。

**工具栏**：工具栏项（`ToolbarItem`）可以声明 `slot`（`tools`，默认；`settings`；`status`）与 `icon`。`PmToolbar` 按 `filter` 显示一处的项，并告诉它们所在的位置（`useToolbarPlacement()`：`bar` 或 `status`；`PmToolbar` 的属性 `placement`）。页面的工具栏在站点外壳的顶栏中，手机宽度下在站点菜单中；幻灯片页没有站点外壳，放映视图的控制条只有它自己的按钮、插件的 `bar` 图层与确认入口。

**网页形态的外壳**（`packages/web/src/app/site/`，样式 `packages/web/src/app/site.css`）：

- **外壳的文字**：网页形态的文字在 `packages/web/src/domain/messages.ts` 的 `WEB_MESSAGES`（中英文）。
- **文稿的页面**：顶栏（站点导航、搜索、语言、视图菜单、插件的工具栏、明暗开关），一侧是章，另一侧是本页的各节，下面是翻页与页脚；768 px 以下章与顶栏的工具进入抽屉。
- **工作区首页**：文档卡片（标题、目录、说明、页数、语言、标签、检查结果与各章）、搜索框（Ctrl/⌘ K）与标签筛选；`presmium serve` 与工作区站点的构建相同。
- **阅读页**：颜色与字体只取令牌，IR 运行时与插件同样，因此也用书卷的颜色。标题与 Markdown 块用衬线体，阅读正文 17 px、行高 1.85；组件保持界面的无衬线体。

### 5.11 原生文档编辑与统一提交

工作台父页面挂载一个全篇 BlockNote 编辑器；页面标题、段落、列表、格式、选区、原生历史和 CommentsExtension 共用该编辑器。Presmium 富文本经公开 API 无损适配，单一持久化为 `TeachingDocument`。内部 Y.Doc 只承担原生批注机制，不成为第二份内容存储或多人协作入口。

`GET document` 返回作者内容和版本；`POST document/change` 使用 `baseDocumentVersion`，提交语义操作或完整 replacement。Web 与 agent 共用 `validateDocument` 的 JSON Schema 和领域检查，版本/权限/路径/引用校验通过后原子保存关联工程文件并记录一次 git 历史。已有文稿禁止更改文稿 ID；新建与复制在创建前分配新身份，实体 ID 在文稿命名空间内保持稳定。

保存不等待编译成功。失败、冲突、离线与目标切换保留草稿，回执绑定文稿、请求和输入版本；旧回执不能清新输入。编译器独立派生运行快照，失败时保留并标识上一成功版本。正文编辑、页面管理、批注和撤消不触发编译放映或视频入口。

原有 MyST 行范围写回、文字镜头、按页面创建多个编辑器和第二套 DOM selection/comment 浮层不再是作者契约。预览 iframe 仅消费派生快照，承担定位、播放和诊断。代码与大型媒体引用工程文件，关联文件由同一工作区事务校验和保存；不能用多个前端单文件请求模拟事务。

### 5.12 插件界面与幻灯片的书卷版式

插件的界面与幻灯片的书卷版式用 5.10 节的设计系统；插件中的字形用宿主的图标。

**插件界面**：读者问答、课堂、讲授、运行面板、测验与练习、课堂会话、发布、引导与讲台的组件和面板只用 5.10 节的令牌与通用组件。

- 颜色、字体、圆角与阴影取令牌，不写死颜色，暗色随令牌切换。发布插件的高对比度模式把令牌映射为它的两种颜色。保留固定颜色的只有含义固定的几处：黑屏、终端、二维码、指针、激光笔与荧光笔。
- 控件用 `pm-ui-*` 类或 `Pm*` 组件：主操作是 `pm-ui-button--primary`（墨色），其余用默认或 `ghost`；开关用 `aria-pressed`；输入框用 `pm-ui-input`、`pm-ui-select`、`pm-ui-textarea`，边框为 `line-strong`；徽标用 `pm-ui-badge`。
- 文稿中的组件（测验、预测、练习、运行面板、分步执行、提问框、课堂反馈等）在根元素上把 `--pm-text-sm`、`--pm-text-md` 设为 em，控件随幻灯片与放映视图的字号缩放。工具栏的弹层、演讲者面板与停靠面板保持宿主的字号。
- 工具栏的弹层用浏览器自己的 `popover`，在顶层，不被外层的容器裁掉。它画成宿主的浮层：`surface` 底、`line` 边框、卡片圆角与 `shadow-float`。
- 查看器的页面只有一套重置样式（`packages/web/src/app/base.css`），组件在网页与幻灯片中看起来相同。
- 远端环境的令牌对话框（`auth: prompt`，`addon-exec-jupyter` 的 `jupyter-token.ts`）是浏览器的模态 `<dialog>`，保留模态与居中；标题栏、字段与按钮用宿主的 `pm-ui-dialog__*`、`pm-ui-field`、`pm-ui-input`、`pm-ui-button` 类，面板的底色、边框、圆角与阴影取令牌。
- 图标是宿主的线性图标（`PmIcon`）：分步执行的上一步、下一步，讲授的过时字幕与改写，高对比度开关，练习每条检查的对错，录制中的标记，源码面板中问题的严重程度（`error`、`warning`、`info`）。插件与工作区的界面中没有 ◀ ▶ ⚠ ✎ ◐ ✓ ✗ ● ▲ ○ 这类字形。
- 状态靠颜色而不靠不透明度区分，以保持 AA：核心插件的演示步进组件中已完成的步骤用 `muted`。

**运行面板**（`addon-exec` 的 `PmRunPanel.tsx`）：一张卡片（`surface`、`line` 边框、面板圆角），顶栏写语言与在哪里运行（“Python · 浏览器中运行”），参数与墨色的运行按钮也在顶栏，窄处换行时参数与按钮一起到第二行；其下是代码，代码块自己的边框、圆角与外边距去掉。在哪里运行由执行器自己说明（`Executor.runsIn`：`'browser'` 或 `'machine'`，可选；`src/client/runs-in.ts`）：Pyodide、脚本 worker、WASI 与 WebGPU 的执行器在浏览器中，本地环境插件的执行器在本机（服务所在的机器）；`:env:` 的具名环境的执行器没有说明（或还没有登记）时按头部为它声明的 `kind`（`jupyter` 为远端环境，`devcontainer` 为本机，`wasi`、`webgpu` 为浏览器，其他写环境名）；没有说明的执行器只写语言。运行之前写路由器会选的执行器，运行之后写实际运行的（`RunResult.executorId`）。运行后输出在 `sunk` 的面板中，标题是“输出 · <秒数> 秒”（`RunResult.durationMs`；录制的输出只写“输出”），幻灯片与放映视图中宽度够时在代码旁边，窄处（网页的正文栏、手机）在代码之下；运行之前代码占满宽度。网页、放映视图与幻灯片是同一个组件。

**图表**：网页、放映视图与幻灯片中的 Mermaid（IR 运行时的 `PmMermaid`）用 Mermaid 的 `base` 主题，主题变量取宿主的令牌（纸、墨、强调色，明暗随页面），连线标签在 `surface` 上用 `ink`；页面没有令牌时用 Mermaid 自己的 `default`、`dark`。

**幻灯片的书卷版式**（`packages/viewer/src/client/views/slide.ts`，样式在 `@lincyaw/viewer` 的 `style.css`）：幻灯片页（`?form=slides`）是查看器的放映视图，一节是一张幻灯片。

- 画布默认 980 px 宽、16:9，`renderers.slides.aspectRatio`（`16/9`、`4:3` 或一个数）与 `canvasWidth` 另行指定（`@lincyaw/kernel` 的 `slideShape`）。幻灯片按画布的大小排版，整张按比例缩放到它所在的框（`SlideFit`），像投影仪那样；内容超出画布时整体缩小（`SlideBody`）。演讲者视图、工作台的预览与打印页用同一张幻灯片（`SlideFace`）。
- 样式只取令牌，明暗随令牌切换：`surface` 底、`ink` 字；标题用衬线体，是正文的 2.2 倍；正文 18 px（`--pm-slide-text`），讲义自己的段落与列表用衬线体，组件保持无衬线体。
- 一节的 `{hints} slides:` 选它的版式：`layout`（`default`、`cover`、`center`、`full`；有多节时第一节默认 `cover`，其余默认 `default`）、`class`（加在这张幻灯片上的类）、`zoom`（内容的缩放）。
- `default` 版式：标题上方是这一节所在的章（`slideChapters`：比这一节层级高、最外层、有标题的章节），底部是讲义标题、步骤条与页码（`n / 总数`）。步骤条每步一段，已到的为强调色，其余为 `line-strong`；它的可访问名称是“第 n 步，共 m 步”。
- `cover` 版式：标题大而靠下，上方一条强调色的短线；底部没有讲义标题。`center` 版式的内容居中；`full` 版式没有内边距、章与底部，标题只留给读屏软件，内容（例如一段动画）铺满整张。
- 每张幻灯片上有插件的 `slide` 图层（`.pm-slide__layers`，画布的坐标，5.1 节）。
- 幻灯片页链接到网页形态的同一处：放映控制条上的“在网页中阅读”指向 `presmium.web.webUrl`（默认与幻灯片并列的 `../web`），网页形态的章节标题旁的链接指向 `presmium.web.slidesUrl`（默认 `../slides`）；两种形态的地址都以 `?slide=<n>&step=<k>` 定位，演讲者视图另加 `view=presenter`。

**圈画**（`@lincyaw/addon-stage`，drauu 的 `@drauu/core`）：放映与演讲者视图中按 `d` 或控制条上的画笔开始画，画笔打开时控制条上另有四种墨色、橡皮、撤销与清除。每张幻灯片的笔画是它画布上的一个 SVG，按章节 ID 记在共享状态 `presmium.stage.drawings` 中（`remote`，演讲者与听众的窗口和课堂之间同步），画笔打开时幻灯片才接收指针。页面有服务端时，笔画停下 800 ms 后经插件的路由 `drawings/*` 保存到文稿的 `.presmium/drawings/<encodeURIComponent(章节 ID)>.svg`（空的笔画删去文件），页面打开时取回还没有笔画的幻灯片的保存；静态产物中只在窗口与课堂之间同步。

**验收**：`e2e/plugin-ui.spec.ts`（测试文稿 `e2e/fixtures/plugin-ui`）：

- 书卷的幻灯片：纸色底、衬线标题、章名、步骤条、页码与封面；
- 每一页的文字（插件组件、按步骤高亮之外的代码行、演示步进组件已完成的步骤与 Mermaid 的连线标签在内）在明暗两套下达到 WCAG AA，输入框的边框达到 3:1；演讲者视图的面板（课堂会话与课堂互动，创建课堂前后）、网页形态中的组件、图表与提问面板同样；
- 运行面板：顶栏写“Python · 浏览器中运行”并有运行按钮，在代码之上；运行后输出写“输出 · <秒数> 秒”，在幻灯片上位于代码旁边；网页与放映视图中的顶栏相同；
- 练习的对错标记、高对比度开关与分步执行的上一步、下一步是宿主的线性图标，没有字形。

`e2e/exec-remote.spec.ts` 另外检查令牌对话框用宿主的字段并达到 AA（需要 Docker）。`e2e/smoke.spec.ts` 的 PDF 导出与示例讲义的构建写同一个 `.presmium/slides`，用 Playwright 的测试锁（`lock`）不同时运行。打印页的就绪见 5.8 节。

示例讲义两种形态的逐页截图人工对比。

## 6. 示例文稿约定

公开示例工作区位于 `examples/animations/`，包含两讲完整中文课程和九份功能导览。导览按动手编辑练习、正文、步骤动画、代码执行、课堂互动、讲稿制作、发布协作、可选执行环境和联网资源组织；[功能索引](../examples/animations/FEATURES.md) 对照当前官方插件、公开组件与实际章节，区分可直接体验、操作指引、按条件启用与当前门槛。两讲完整课程保留如下内容。`bubble-sort/`（冒泡排序）从代码讲到一趟冒泡的 GSAP 动画，讲解点击文稿自己的计数组件、光标指向按钮，再合成为带字幕的讲授；`libraries/`（代码写成的动画）用 GSAP、Anime.js、Motion、Three.js 与 Remotion 各写一节场景（4.4 节的步骤时间），最后是讲到哪里点哪里与讲授视频。每讲的 `scenes/` 是场景源码，`components/` 是讲义的组件，`.presmium/speech/` 与 `speech.lock.json` 是讲解的合成缓存（音色 `edge`），随讲义提交：没有语音引擎的环境（CI、新的检出）照样能检查、构建与播放讲授，改过的句子才需要引擎。

`pnpm studio` 首次用示例的 `try.mjs` 复制到独立的 `.presmium/example-workspace`（自己的 git 仓库，带合成缓存与给 AI 的 `AGENTS.md`），之后复用用户可编辑的副本。`pnpm demo:check` 与 `pnpm demo:ir` 仍只处理原有两讲；`pnpm demo:build` 构建整个工作区网页，并把原有两讲的幻灯片、notebook 与讲授放进 `<讲义>/slides/`、`<讲义>/notebook/`、`<讲义>/lecture/`，站点在 `examples/animations/dist/web/`。讲授视图先找页面下的 `lecture/`，再找网页形态旁边的 `../lecture/`（单讲构建的位置），所以同一站点中几讲的讲授互不冲突。

功能回归使用 `e2e/fixtures/<组>/` 的私有文稿。`e2e/fixtures/regression/` 中的 BPE 文稿仅用于私有回归，代码引用的历史版本行为由专用代码用例验证。冒烟和功能测试从该目录解析依赖；示例的用例检查站点中的两讲、各自的幻灯片与讲授，以及 `pnpm studio` 的副本。`lang` 决定两种形态的界面语言（5.7 节）。

## 7. 测试策略

只写集成测试，不写单元测试：测试在真实组装的系统上运行，不对单个函数做隔离测试，不用 mock 替代宿主框架。每条验收标准对应一到两个用例。

| 层级 | 工具 | 范围 | 命令 |
|---|---|---|---|
| 结构检查 | `scripts/check-layering.mjs`、`scripts/check-skills.mjs`、`scripts/check-plugins.mjs`、`scripts/check-packages.mjs`、`scripts/check-tokens.mjs`、`scripts/check-types.mjs` | 第 3 节的分层规则；技能与代码一致（JSON 文稿契约、模板、素材集、命令及其选项）；每个 Node 插件声明 `version` 与当前内核满足的 `kernel` 范围（4.2 节）；每个包按 `.changeset/README.md` 的表公开或私有，公开的包有许可证、同一版本、`engines`、元数据与只含发布所需的 `files`，插件以对等依赖使用共用的包；受检的样式表的颜色、尺寸与时长只取令牌（px 只在 `@media` 中）；源码、测试与 spec 没有类型错误（`tsconfig.json` 只含 `.ts`，工作台的 React 面板由 `packages/workbench/tsconfig.json` 检查）。发布 `.ts` 源码的依赖只在它们自己的设置下能通过类型检查，`skipLibCheck` 只跳过 `.d.ts`；检查按这些源码的类型检查仓库的代码，不报 `node_modules` 中文件内部的错误 | `pnpm test` |
| 消费者安装 | Vitest、Playwright | `scripts/consumer.ts` 用 pnpm 打包全部公开的包，在单仓之外的临时目录中用 pnpm 从压缩包安装 `presmium`（另加一个从自己的压缩包安装的第三方插件）；`packages/cli/test/consumer.test.ts` 在其中运行 `check`、三种形态的 `build`、`dev`、`serve`（站点在项目之外，从随包的模板新建文档）、不兼容插件的诊断，在空目录中 `presmium new` 之后检查与构建，以及转交给项目里的 `presmium`，`e2e/consumer.spec.ts` 在浏览器中看插件的组件 | `pnpm test`、`pnpm e2e` |
| 集成 | Vitest | 真实运行 CLI、构建产物检查、服务端（`packages/<pkg>/test/`）；在 Chromium 中打印幻灯片的用例是单独的项目 `export`，在其他用例之后运行 | `pnpm test` |
| 构建 | `presmium build` | 示例文稿编译并生成全部媒介（网页、幻灯片、notebook、讲授） | `pnpm demo:build` |
| 检查 | `presmium check` | 示例文稿全部检查项通过 | `pnpm demo:check` |
| 端到端 | Playwright | 构建产物上的行为（`e2e/`）：全部用例在 Chromium 中运行，冒烟用例另在 Firefox 与 WebKit 中运行 | `pnpm e2e` |
| 升级闸门 | Vitest、Playwright | 五组与 dsh 相关的用例：行 ID、经 bundle 的假模型用例、客户端的启动审计、Host API 的 schema、工作台的端到端用例（`design-dsh.md` 第 12 节）；用例名带 `[gate]` 或标签 `@gate` | 随 `pnpm test` 与 `pnpm e2e` 运行，升级 dsh 时单独运行 |
| 全部 | | 以上依次执行 | `pnpm verify` |

端到端测试的约定：

- 示例文稿的产物 `dist/` 是一个站点（网页在 `/web/`，幻灯片在 `/slides/`，2.1 节的默认 `base`），服务在 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT`（默认 4173、4174）。同时构建两种形态的测试文稿同样把 `dist/` 作为一个站点服务（`serve(dir,'/slides/')`，`buildFixture` 自动这样做）。并行的检出各用一对端口；端口被占用时报错，不复用别处的服务。两种形态的页面都通过 `?slide=<页号>&step=<步骤>` 定位，演讲者视图另加 `view=presenter`。
- 需要专用文稿的用例（宿主适配、另一种界面语言、性能、课堂服务）在 `beforeAll` 中把测试文稿写到 `e2e/fixtures/regression/.presmium/e2e-*`（不入库，插件从示例文稿的依赖中解析），用真实的 `presmium build` 构建，再在空闲端口上服务产物。测试文稿放在 `e2e/fixtures/<组>/`。
- 性能用例（`e2e/perf.spec.ts`）是单独的 Playwright 项目，依赖 Chromium 项目，在其他用例结束后运行，计时不与其他用例争用机器。单独运行它要加 `--no-deps`：`pnpm exec playwright test e2e/perf.spec.ts --no-deps`；不加时 Playwright 先运行全部 Chromium 用例。
- 其他浏览器：`PRESMIUM_E2E_BROWSERS` 列出冒烟用例另外运行的浏览器，默认 `firefox,webkit`。没有安装，或在本机无法启动的浏览器（WebKit 需要很多 Linux 主机缺少的系统库）被跳过，并提示安装命令（`pnpm exec playwright install <浏览器>`、`pnpm exec playwright install-deps <浏览器>`）；WebKit 也可以在 Playwright 的 Docker 镜像中运行。真实的 Safari、Edge 与前一个大版本在发布前手工检查并记录。
- 集成测试分两个 Vitest 项目（`vitest.config.ts`）：`integration` 与 `export`，测试文件默认使用一个 worker，控制真实构建、服务与浏览器的资源占用。`export` 是在 Chromium 中打印幻灯片的两个测试文件（`addon-publish/test/export.test.ts`、`diff.test.ts`），在 `integration` 结束后运行，打印不与其他用例的构建争用机器。单独运行一组：`pnpm exec vitest run --project export`。
- 集成测试运行 CLI 用 `@lincyaw/cli/testing` 的 `presmium(cwd, args, env?)`：它去掉 Vitest 设置的 `NODE_ENV=test`，构建与作者、端到端用例在同一模式下运行。端到端的测试文稿与服务用 `e2e/fixtures/deck.ts` 的 `useFixture`、`buildFixture`、`serve`、`startDev`、`openSlide` 等。
- 手工起的静态服务器在重新构建后要重启：sirv 启动时读取一次文件列表，之后新生成的文件（带哈希的 `assets/`）它找不到，页面报 404 或白屏；经常重建时用 `sirv --dev` 启动，它每次请求都查找文件。

外部服务一律用说同一协议的真实实现来测试，不 mock 宿主框架，也不在进程内替换被测的边界：

| 对象 | 测试方式 |
|---|---|
| 服务端 | 对测试文稿真正运行 `presmium dev` 与 `presmium serve`，用 `fetch` 访问渲染端开发服务器代理过来的 `/__presmium/` 路由；请求来源的检查由 Node 端的用例以原样的 `Host` 与 `Origin` 请求头验证：别的名字与其他站点的页面被拒绝，`presmium serve --host` 时本机的局域网地址与名字被接受 |
| 远端环境 | `templates/env/compose/` 的模板起一个真实的 `jupyter_server`，浏览器与编译时都在其中运行代码；会话隔离用两个浏览器上下文验证。本机没有 Docker 时这些用例跳过并说明原因（同本地环境插件） |
| WebAssembly | 真实的 WASI 运行时；编译时把构建机的 `PATH` 换成不含 C 工具链的目录，证明不需要本机工具链；断网（`context.setOffline(true)`）验证离线 |
| WebGPU | 默认的无头 Chromium 没有 GPU 适配器，正好验证回退；用例另以 `test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] } })` 验证执行路径与“CPU 模拟”的计时标注 |
| MCP | MCP SDK 的客户端（`@modelcontextprotocol/client`）连接 `/mcp` 与 `presmium-mcp`，逐个调用工具；确认经控制通道回答 |
| 修改审阅 | 临时目录中的真实 git 仓库 |
| 语音 | 确定性的假引擎（`presmium-speech fake`）：真实的 HTTP 服务，同一协议，测试经 `PRESMIUM_SPEECH_FAKE_URL` 与 `PRESMIUM_SPEECH_FAKE_PROVIDER=Presmium fake` 把它定义为引擎 `fake`（与真实引擎同一条配置路径）；中文每字 220 ms、拉丁字母每字 60 ms、词间 80 ms，合成的 WAV 中嵌入文字与音色，合成后再转写可以精确往返；音色列表中有一个克隆音色，用于同意记录的用例；用例数它收到的请求，验证缓存命中时不再合成。火山引擎与 Groq 的冒烟用例只在设置了 `PRESMIUM_TEST_VOLCENGINE_KEY`、`PRESMIUM_TEST_GROQ_KEY` 时运行 |
| 讲授 | 录制：Chromium 的假麦克风播放假引擎合成的音频（`--use-fake-ui-for-media-stream`、`--use-fake-device-for-media-stream`、`--use-file-for-fake-audio-capture=<wav>%noloop`，以 `test.use({ launchOptions })` 只加在讲授的用例上），讲授轨中有 `go` 与 `point`，回放到时刻 t 显示正确的章节与步骤（`e2e/lecture.spec.ts` 用假设备自带的音调与假摄像头，不加 `--use-file-for-fake-audio-capture`；回放的测试讲授轨带一段构建前写入的静音 WAV，所以走 `MediaClock`）；脚本化：用假引擎构建测试讲义，检查片段、VTT 与提示标记的时刻 |
| dsh | 锁定版本的真实 dsh（headless、acp 与 web 载体），每个用例自己的 `DSH_HOME` 与 `HOME`；模型是 `@lincyaw/dsh/testing` 的脚本化 Messages 兼容假模型（`fakeModel`），断言请求体中没有上传的字段、技能目录中没有用户的技能、测试目录之外没有写入。`packages/dsh/test/harness.ts`（端到端用例也用它）：`testHome(prefix)` 在临时目录中给出 `HOME`、`XDG_*`、`DSH_HOME` 与干净的环境，`profile(carrier)` 按 `@lincyaw/dsh/launch` 写 profile 并链接 bundle，`dump(carrier)`、`headless(cwd, prompt, { model })`、`acp(cwd)`、`web(cwd, port, { model })`（`api()` 以令牌换 cookie，`call(endpoint,args)` 调 Host API，`fetch(path)` 带 cookie）、`serve(root)`（`presmium serve` 加服务令牌，`env` 是交给 dsh 的 `PRESMIUM_SERVICE_URL` 等），`homeEntries()`；`workspace(prefix, files, link)` 在 `e2e/fixtures/regression/.presmium/` 中建一个自己的 git 仓库（dsh 的项目根因此是它，不是本仓库与它的 `.agents/skills`）；`turns(model)`、`toolResults(model)` 读假模型收到的 agent 请求与工具结果 |
| 工作区 | 临时目录中的真实 git 仓库：文档操作与撤销各形成正确的提交（读 `git log` 与尾注）；局域网访问与课堂同步在 `presmium serve --host 0.0.0.0` 上，浏览器以本机的局域网地址打开页面（本机没有局域网地址时跳过） |

服务端的用例：`packages/server/test/server.test.ts` 对测试文稿运行 `presmium dev`；`serve` 模式的用例由测试用的宿主 `packages/server/test/fixtures/serve-host.ts` 启动（以子进程调用真实的 `startServer`，文档用真实的编译器编译），`presmium serve` 本身的用例在 `cli/test/serve.test.ts` 与 `e2e/workspace.spec.ts`。浏览器不允许 `fetch` 设置 `Host`，Node 端的用例用 `node:http` 发送原样的请求头。

这些用例的启动参数只加在各自的 spec 中，`playwright.config.ts` 不为它们增加项目。需要 Docker、GPU 或模型凭据的用例跳过时打印原因与启用方法，不算失败。

辅助命令（插件包与服务包的可执行文件）：

| 命令 | 包 | 选项 | 作用 |
|---|---|---|---|
| `presmium-export [deck]` | `@lincyaw/addon-publish` | `--format pdf\|pptx\|png`（默认 `pdf`）、`--output <file \| dir>`、`--with-clicks`（每步一页）、`--range <1,3-5>`、`--dark`、`--timeout <ms>`（打印页的就绪时限，默认 120000）、`--json` | 构建幻灯片后经幻灯片渲染端的导出器（`pdf`、`png`、`pptx`，编译器的 `exportDocument`）在 Chromium 中打印打印页（`playwright-chromium`，5.8 节）：一份 PDF；每张幻灯片（`--with-clicks` 时每一步）一张 PNG，写在 `--output` 目录中；或 PowerPoint（每张幻灯片一张图片，讲解作为演讲者备注）。导出器构建在根路径，不论幻灯片构建时的站点路径。`--with-clicks` 时每张幻灯片的页数是它在幻灯片视图（`viewFor(doc, 'slides')`）中的步骤数加一；导出缺页（PDF 的页数或 PNG 的张数与之不符）时以 2 退出，用法错误与导出失败同样。PDF 导出后检查每个链接仍是链接，有链接丢失时以 1 退出；PNG 与 PowerPoint 不检查链接 |
| `presmium-diff <refA> <refB> [deck]` | 同上 | `--out <dir>`、`--threshold <ratio>`、`--wait <ms>`（网页的页面截图之前等待的时间，默认 500）、`--install`、`--json` | 两个提交的视觉差异：幻灯片逐页逐步（导出为 PNG），网页逐页（文档视图）与逐节（放映视图）截图比较，报告写在 `.presmium/diff/`；幻灯片的导出缺页时以 2 退出 |
| `presmium-classroom-server` | `@lincyaw/classroom-server` | `--port <n>`（默认 1234，`0` 取空闲端口）、`--host <address>`（默认全部网卡）、`--deck <dir>`（归档写到 `<dir>/.presmium/classroom/`） | 课堂服务（y-websocket）；启动后打印服务地址与局域网地址。发布到静态托管的文稿用它（头部的 `presmium.session.server`）；`presmium dev` 与 `presmium serve` 在自己的端口上提供同一协议的课堂同步，不必另起进程（10.2 节） |
| `presmium-language-server` | `@lincyaw/language-server` | `--stdio`、`--node-ipc`、`--socket=<port>` | 语言服务，VS Code 扩展启动它 |
| `presmium-mcp [deck]` | `@lincyaw/mcp` | `--allow operate`（不加时不提供操作类工具） | 以 stdio 提供与 `/mcp` 相同的读取类工具，供编辑器中的 agent（Claude Code、Codex、VS Code）使用；没有放映位置与课堂 |
| `presmium-lecture export [deck]` | `@lincyaw/addon-lecture` | `--track <id>`（默认合成的讲授 `script`，否则唯一的录制讲授）、`--out <file>`（只能是 `.webm`，默认 `<deck>/dist/<id>.webm`；不导出 MP4）、`--size <宽x高>`（默认 1280x720）、`--fps <n>`（默认 30）、`--burn <语言>`（把这种语言的字幕画进画面） | 构建网页与讲授（工作目录 `.presmium/lecture-export`，结束后删除），用 Playwright 的 Chromium 逐帧播放讲授并截图：每一帧先把讲授推进到这一帧的时刻，等组件准备好画面（`STEP_CLOCK.settled()`）再截图，动画按讲授的时刻画出（4.4 节“步内时间”）；某一帧画不出来（组件登记的准备失败，例如场景载入出错）时导出失败，指出这一帧的时刻；在另一个页面中用 Mediabunny 的 WebCodecs 路径把画面与音频（合成的片段或录音，各在其时刻）合成为 WebM（VP9 或 VP8、Opus），讲授轨的每种字幕成为一条 WebVTT 字幕轨（语言码取 ISO 639-2，不知道的语言给出警告），视频写完后也写在视频旁边（`<文件>.<语言>.vtt`）；`--burn` 画的字幕与字幕轨同样取文字，没有译文的句子不画；合成的声音在文件的标签中带 `AIGC` 标识。退出码 0 完成，2 用法错误或失败 |
| `presmium-speech fake` | `@lincyaw/addon-speech` | `--port <n>`（默认取空闲端口）、`--host <地址>`（默认 `127.0.0.1`） | 确定性的假引擎，打印 `fake  <地址>`（`http://…/v1`，作为 `PRESMIUM_SPEECH_FAKE_URL`）。OpenAI 音频接口的形态加 Presmium 的扩展：`audio/voices`（音色 `alpha`、`beta` 与克隆音色 `cloned-lin`）、`audio/voices/clone`（POST 训练，GET `?voice=` 查进度：第一次为训练中，之后就绪，训练过的音色进入音色列表）、`audio/speech`、`audio/speech/timestamps`、`audio/transcriptions`；合成的 WAV（8 kHz，每词一个音调）在 `pmfk` 块中嵌入文字、音色与逐字时间，转写读回它们；`GET /requests` 列出收到的请求（方法、路径、`Authorization`），供用例计数 |
| `presmium-speech clone` | `@lincyaw/addon-speech` | `<引擎> <音色> <样本>`、`--speaker <说话人>`、`--scope <范围>`、`--statement <同意声明录音>`，可选 `--lang`、`--text`、`--operator-dir <目录>`；`--status` 只查进度 | 运营者训练克隆音色：与工作台的“克隆音色”对话框相同，先登记同意记录（声明录音存为同目录的 `<音色>.statement.<扩展名>`，记录中是它的 sha256），再把样本发给引擎，每 3 秒查一次进度直到就绪或失败。要求 `settings.presmium.speech.cloned: true`；训练按提供方的价格计费 |
| `presmium-speech consent` | `@lincyaw/addon-speech` | `<引擎> <音色> <记录文件>`、`--operator-dir <目录>`（默认为当前工作区的运营者目录或 `PRESMIUM_OPERATOR_DIR`，10.5 节；同样不能在工作区之中） | 运营者登记克隆音色的同意记录：记录是 JSON `{ speaker, scope, date, statementSha256 }`，校验后写入运营者目录中的 `<consentDir>/<引擎>/<音色>.json`（`consentDir` 取当前工作区配置的 `settings.presmium.speech.consentDir`，权限 0600）。与所有者经语音插件路由的登记效果相同（第 11 节） |

## 8. 用例的分布

每个包的集成用例在 `packages/<包>/test/`，端到端用例在 `e2e/`，按功能命名；需要专用文稿的用例把文稿放在 `e2e/fixtures/<组>/` 或 `packages/<包>/test/fixtures/`（第 7 节）。

## 9. 已知风险

### 9.1 仍在使用的框架内部接口

代码仍依赖、而框架文档没有写明的接口记在这里，升级依赖时先运行守护它们的用例。

dsh 的客户端接口中没有文档的部分（客户端包的工厂格式 `__ModuleLoader__.load`、ui-slots 与 client-store 的类型、外壳的模块表），以及只有 README 描述的布局契约（`root` 的子槽位与 `ctx.layout`），只出现在 `@lincyaw/dsh` 的客户端部分，由升级闸门的第 3 组用例守护（第 13 节）。

### 9.2 设计取舍

| 事项 | 当前设计与理由 | 行为定义 |
|---|---|---|
| 共享内核中的业务契约 | 跨插件共用的服务契约放在 `@lincyaw/kernel`，按领域分成模块并统一导出。提供方与使用方都依赖内核，插件之间不需要互相引用 | 4.5 节 |
| 网页的 Service Worker | 在一份文稿的页面都构建完之后生成（`packages/web/src/node/offline.ts`），才能取得页面、IR、搜索索引、文稿的文件与查看器的文件的完整清单，并按内容计算缓存版本。执行运行时单独缓存，避免第一次打开网页就下载全部运行时 | 4.6 节“离线”；授课准备见 `.agents/skills/presmium-present/references/delivery.md` |
| 网页读取发布插件的配置 | 网页渲染端读取 `presmium.publish.offline` 决定是否生成 Service Worker。只有这一个配置键参与网页构建，为它增加扩展机制的成本高于直接读取 | `packages/web/src/domain/config.ts` |
| 网页与幻灯片同一个查看器 | 两种形态是同一个查看器的页面，共用 IR 运行时、宿主适配、插件组件与执行，幻灯片只是放映视图的一张张画布。插件不为两种形态各写一份，现场代码与圈画在两种形态中行为相同 | 1.1 节、5.12 节 |
| 页面中的锚点 | `.pm-section[data-section]`、`.pm-block[data-block]` 与幻灯片的 `.pm-slide[data-section][data-slide][data-step]` 是 IR 运行时的公开标记。笔记、讲授与工作台共用它们定位，不各自识别页面结构 | `domain-model.md` 第 9 节 |
| 指定执行器 | `RunRequest.executor` 精确选择执行器，失败时显示原因与已有录制。自动切换执行器会改变环境、会话与运行结果 | `ir.md`、4 节“执行缓存” |
| Python 运行器 | Node、Pyodide 与容器共用 `@lincyaw/kernel/runner.py`。内核仅发布这份资源，不加载 Python；各适配器负责启动它 | 4.6 节 |

### 9.3 框架的已知问题

框架的已知问题（来源、影响与处理、守护用例）记在这里；现在没有。DeepSeek Harness 的问题见 9.5 节。

### 9.4 残余风险

服务端只供运行它的那个用户使用（10.1 节）。这里写明这个用户自己的代码、文稿与 agent 之外的措施之后仍然存在的风险，哪些秘密是拿得到的；第 11 节的措施不声称挡住它们。没有多人共用一个服务端的部署。

`presmium dev`、`build`、`check` 与 `presmium serve`：唯一的用户就是运营者，下列代码都以这个用户的 uid 运行，能读写这个用户能读写的一切，清理环境变量只挡住无意的泄露：

| 代码 | 拿得到什么 | 已有的纵深防御 |
|---|---|---|
| 编译时执行的代码（没有进程沙箱时） | `presmium` 进程与 agent 进程的 `/proc/<pid>/environ`：`DEEPSEEK_API_KEY` 或 `PRESMIUM_MODEL_KEY`、`PRESMIUM_SPEECH_<ID>_KEY`、`PRESMIUM_ENV_<名>_TOKEN`；`~/.ssh`、`~/.config` 等用户文件；Docker 的套接字（用户在 `docker` 组中时等于 root）与 D-Bus 会话总线；任意网络；运营者目录（可以伪造同意记录）；任何文档目录 | `RunContext.env` 只有清理过的变量；运营者插件登记了进程沙箱时经它运行（10.6 节） |
| agent（DeepSeek Harness）与它的 shell 命令 | 同上：DeepSeek Harness 的沙箱只管文件的写入（`workspace-write`），不隐藏进程与网络，`workspace-write` 另允许写它的临时区域（Linux 上 `/tmp` 之下的路径，不询问）；agent 自己的环境中有模型的密钥 | 写到工作目录之外、shell 与网络的权限请求经所有者（本机用户）确认；每个 turn 的修改在结束时提交，可以撤销（`review: required` 时经审阅后才提交，可以全部或逐个文件拒绝） |
| agent 写进被 `.gitignore` 忽略的路径 | git 实现的审阅不含被忽略的文件：agent 写进文稿目录的 `node_modules/` 或 `.presmium/` 中工作目录的文件不出现在差异中，拒绝时也不恢复；`presmium dev` 加载文稿目录 `node_modules` 中的插件，这样写入的包在下一次启动时在 `presmium` 进程中运行 | 无（agent 本来就有 shell，能直接做同样的事） |
| 文稿声明的本地容器（`kind: devcontainer`） | 容器定义来自文稿，可以挂载主机的任意路径或以特权运行，等于用户的 Docker 权限 | 命令行只得到 `RunContext.env` 与 Docker 客户端的变量；不经进程沙箱（要用 Docker 的套接字） |
| 文稿目录中的 Node 插件与渲染端包（`presmium dev`、`serve`、`build`、`check` 都接受相对路径与文稿目录的 `node_modules`） | 在 `presmium` 进程中运行，拿得到进程的全部环境 | 无 |
| 文稿的组件与原始 HTML（浏览器中） | 以开发服务器的源运行，能以本机作者（所有者）的身份调用 `/__presmium/` 路由，包括回答确认、接受审阅（同源，`Origin` 检查不挡） | 浏览器的沙箱；`/mcp` 另要求令牌 |

此外，审阅进行中作者从磁盘上的其他编辑器直接改动审阅范围内的文件时，这些改动也进入审阅差异，与 agent 的改动一起被接受或拒绝；拒绝某个文件时从开始时的快照恢复，会覆盖其间的外部改动。

`presmium serve --host`（局域网访问）另有：

| 风险 | 说明与限度 |
|---|---|
| 局域网中到得了这个端口的人就是本机作者 | 没有登录：任何能连上 `--host` 的地址与端口的设备都以本机作者（所有者）的身份使用工作区，能改文档、撤销修改、运行代码、回答确认。`Host` 与 `Origin` 的检查只挡住其他站点的页面（DNS 重绑定、跨站请求），挡不住直接访问。启动时在标准错误上写明这一点；不加 `--host` 时只监听本机。只在信任的网络上使用（例如自己的设备之间），或经 SSH 隧道 |
| 课堂的学习者经同一个端口加入 | 文稿没有设置 `presmium.session.server` 时，课堂同步在服务自己的端口上（10.2 节）：学习者的设备打开的是这个服务，因此同样以本机作者的身份到达它的全部路由。课堂服务本身只让学习者写自己的条目（`classroom-server` 的规则照旧），但服务的其他部分不区分学习者。给不信任的学习者上课时，用为学生构建的静态站点（`presmium build --audience student`）与单独的 `presmium-classroom-server` |

### 9.5 依赖中已知的问题

DeepSeek Harness 的限制与 Presmium 的绕开办法见 `design-dsh.md` 第 16 节。

## 10. 服务端与部署

### 10.1 进程与拓扑

> **工作台**：`presmium studio` 另有启动器与 dsh 宿主两个进程，工作区服务以 `presmium serve` 运行在回环上（第 13 节）。

服务端只供运行它的那个用户使用：`presmium dev`、`build`、`check` 与 `presmium serve` 中，唯一的用户就是运营者，被执行的代码与 agent 以这个用户的身份受信任，没有登录。隔离只做纵深防御：子进程的环境清理（`RunContext.env`）；编译时的代码可以经运营者插件的进程沙箱运行（10.6 节）；agent 的写入成为可撤销的提交（或按设置先审阅再提交）。同一 uid 的代码能读这个用户能读的一切（9.4 节）。多人使用时每人一个工作区（hub 托管模板）。

没有多人共用一个服务端的部署：没有登录与成员、信任模式、持有第三方凭据的另一个进程与容器编排的工作区模板。

**局域网访问**：`presmium serve` 默认只监听本机（`127.0.0.1`）。`--host <地址>`（`0.0.0.0`、`::` 或本机某个网卡的地址）让同一个用户在局域网中的其他设备上使用它：启动时在标准输出的 `serve  <地址>` 之后为每个局域网地址打印 `network  http://<地址>:<端口>/`，并在标准错误警告没有登录（任何到得了这个端口的人都以本机作者的身份使用工作区，9.4 节）；请求的 `Host` 与 `Origin` 另可以是这个地址（`0.0.0.0`、`::` 时为本机每个网卡的地址）与本机的名字（`os.hostname()` 与 `<名字>.local`），其他名字与其他站点的页面照旧被拒绝（10.3 节）。服务自己的地址（`serve` 一行，`PresmiumServer.url`）在 `0.0.0.0`、`::` 时是本机回环的地址，给出某个网卡的地址时就是那个地址。`presmium dev` 只监听本机，没有 `--host`。从别处使用也可以经 SSH 转发端口（`ssh -L <端口>:127.0.0.1:<端口> <本机>`）。

| 进程 | 作用 | 何时需要 |
|---|---|---|
| `presmium dev` 或 `presmium serve` | 编译与编译时执行、实时推送、服务端（插件的服务端贡献、MCP、agent 适配、修改提交、控制通道、课堂同步）、站点服务（查看器的页面） | 编辑、agent、远端环境的代理模式、语音、课堂 |
| 课堂服务 `presmium-classroom-server` | 课堂同步，协议与 `presmium dev`、`serve` 自带的相同 | 发布到静态托管的文稿开课时（头部写 `presmium.session.server`） |
| Jupyter Server（容器或集群） | 远端执行 | 使用远端环境时 |

```
presmium dev（一份文稿，本机）
  浏览器 ──► 站点服务（presmium dev 的主进程中，网页与幻灯片各一个，127.0.0.1:<端口>）
             ├ 页面、<base>__app/…（IR、修改、搜索、查看器与代码包的文件）
             └ /__presmium/（含 WebSocket）──代理──┐
                                                  ▼
                       Presmium 服务端（presmium dev 的主进程，127.0.0.1:<空闲端口>）
                       ├ /__presmium/<插件 ID>/…          插件的路由与反向代理（含课堂同步 presmium.session/sync）
                       ├ /__presmium/presmium.server/…    握手（hello）、控制通道（control）
                       └ /mcp                             MCP（令牌）

presmium serve（工作区，一个进程；默认只监听本机，--host 时也在局域网上）
  浏览器 ──► Presmium 服务端（唯一的端口，默认 4310）
             ├ /__presmium/…、/mcp      同上
             └ 其余路径 ──► 工作区站点的站点服务（同一进程中，只监听本机）
```

服务端与站点服务都在主进程中，各占一个端口：站点服务（`packages/web/src/node/site-server.ts`）回答页面与查看器的路由（1.1 节），`presmium dev` 中把 `/__presmium/`（含 WebSocket）代理到服务端（`RenderContext.server` 给出它的地址）；编译结果、执行器、MCP 与 agent 适配都在主进程中，查看器与文稿代码包在一个构建子进程中构建。浏览器因此总是同源访问 `/__presmium/`，没有跨域请求。

静态构建产物不依赖服务端：渲染端不写服务端地址，`useServer().available` 为 false。浏览器内执行（Pyodide、WASI、WebGPU）、预先合成的讲授音频与录制输出照常可用；agent、远端环境的代理模式与实时转写隐藏或降级，课堂要有头部写明的课堂服务。

### 10.2 挂载

- **路径**：插件 `server(ctx)` 的贡献挂在 `/__presmium/<插件 ID>/` 下；服务端自己的路由在 `/__presmium/presmium.server/`：`hello`（`{ member,document }`）与 `control`（控制通道，10.4 节）；MCP 在 `/mcp`。
- **请求**：路由处理函数用标准 Fetch API 写，不绑定服务器框架；Node 的请求与 Fetch 之间由 `@hono/node-server` 的 `getRequestListener` 转换。流式结果用 SSE（`eventStream`，4.7 节）。
- **文档**：`useServer().fetch` 带上请求头 `Presmium-Document: <文档目录>`，服务端据此给出 `RequestContext.document`，并把请求交给该文档的插件实例。
- **反向代理**：`ProxySpec` 由 `http-proxy-3` 实现，HTTP 与 WebSocket 升级都加上 `headers`（例如远端环境的 `Authorization`），浏览器拿不到这些头。
- **宿主进程的接口**：启动服务端的命令给它一个 `ServerHost`（`@lincyaw/server` 自己的类型，不是内核契约）：文档列表、编译结果与诊断、运行检查、构建、运行一个代码块（MCP 的 `run_code`）；构建与运行代码块使用与该宿主的编译相同的执行选项（4.6 节，10.6 节）。编译结果是完整的文稿（没有学生视图：服务只供本机作者使用，读者得到学生版的构建）。`presmium dev` 由 CLI 在它的编译器上实现，`presmium serve` 由工作区实现；控制通道经它读取文稿。
- **转发**：`presmium serve` 中其余路径转发到工作区站点（`startServer` 的 `forward(path)` 给出本进程中站点服务的地址；`/__outputs/` 给出任务产物的静态服务器，13.7 节）。来自局域网名字的请求以站点自己的本机名字为 `Host` 转发（10.3 节）。
- **MCP 的挂载**：`@lincyaw/mcp` 声明自己需要的宿主接口 `McpHost`（文档列表、编译结果与诊断、检查、构建、运行代码块、放映位置及其变化、课堂状态、跳转与开关课堂、确认），导出 `createPresmiumMcp(host)`。服务端引用 `@lincyaw/mcp`，在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost` 并把它挂在 `/mcp`；`presmium-mcp` 在编译器上实现它（没有放映位置与课堂）。`mcp` 不引用 `server`（第 3 节），依赖只有 `server → mcp` 一个方向。
- **MCP 的实现**：
  - `@lincyaw/mcp` 导出 `createPresmiumMcp(host)`（`fetch(request,caller)`、`close()`）、`serveMcpStdio(host, caller)`，以及类型 `McpHost`：`documents()`、`compile(document)`、`check`、`build(document, { to })`、`run(document, { section, block }, signal)`、`approve(request, signal)`、`offers(kind)`（种类的策略为 `off` 时不列出对应的工具），`tools(document?)`（插件的 `AgentTool` 与它们的服务），`positions(document?, member)`（`McpPosition` 带窗口所属成员的 `member`、章节 ID `section` 与窗口报告的 `trail`）、`watchPositions(listener)`、`classroomStatus(document)`、`navigate(document, { slide, step, section, trail }, member)`、`setClassroom(document, action, name, member)`。`caller` 是令牌所绑定的成员与模式（`McpCaller`），由宿主校验令牌后给出。每个令牌都读完整的文稿（没有学生视图）。
  - 基于 MCP TypeScript SDK v2（`@modelcontextprotocol/server` 2.3.1，协议版本 2026-07-28）的 `createMcpHandler`：工厂按调用方为每个请求新建一个服务器实例（调用方经 `authInfo` 传入），没有会话。2025 年协议的客户端以同一个工厂无状态地服务，工具与资源照常可用，但没有接收通知的通道。`presmium://position` 的订阅是 2026-07-28 的 `subscriptions/listen`（SDK 的客户端以 `versionNegotiation: { mode: 'auto' }` 连接，再 `client.listen({ resourceSubscriptions })`），窗口报告新的位置时服务端 `notify.resourceUpdated`，订阅者收到 `notifications/resources/updated`。服务端自己校验 `Host`、`Origin` 与令牌，挂载时不需要 `@modelcontextprotocol/node`（第 12 节）。
  - 工具：读取类 `list_documents`、`deck_info`、`list_sections`、`get_section`、`get_step`、`search`、`get_code_ref`、`get_outputs`、`get_diagnostics`、`locate_source`、`get_position`、`get_classroom`（后两个只在有页面窗口的宿主中）；操作类 `navigate`、`run_code`、`build`、`classroom_start`、`classroom_end` 只给 `author` 令牌且成员是编辑者或所有者，调用时先经 `approve` 确认（`content` 范围，`member` 为令牌的成员，`from` 为 `presmium.mcp`，说明按文稿语言，如“放映跳转到「第三节」”“运行「合并」一节的 code-1”，`run_code` 的 `detail` 是代码），被拒绝时返回错误结果。读者成员的令牌只有读取类工具（本机的服务中唯一的成员是所有者）。插件的 `AgentTool` 以自己的名字登记（与内置工具同名的忽略），输入的 JSON Schema 增加可选的 `document`；`operate`、`spend` 类先确认。有多份文档时以 `document` 指定，只有一份时可以省略。路径相对于文稿目录（agent 修改源码的目录）。不提供写文件的工具。
  - 资源：`presmium://documents`、`presmium://deck`、`presmium://sections`、`presmium://sections/{section}`、`presmium://sections/{section}/steps/{step}`、`presmium://sections/{section}/outputs`、`presmium://diagnostics`、`presmium://ir`（完整文稿的 IR）、`presmium://position`（可订阅）、`presmium://classroom`。有多份文档时，一份文档的资源在 URI 后加 `?document=<文档目录>`（资源模板 `presmium://deck{?document}`、`presmium://sections/{section}{?document}` 等），不加时与工具一样只在只有一份文档时可读；`presmium://documents` 与 `presmium://position`（任一文档的位置，订阅只用这个 URI）没有这种形式。模板的匹配只看路径与查询参数 `document`：其他查询参数与参数的顺序不影响匹配（`?x=1&document=a` 同 `?document=a`，`?x=1` 同不带查询；SDK 的 `UriTemplate` 只接受模板写出的查询，`@lincyaw/mcp` 以它的子类 `DocumentTemplate` 覆盖 `match`）。服务说明（instructions）列出该令牌实际得到的读取类与操作类工具（含插件的）和资源：只读的令牌写明只读，有操作类工具时写明它们可能先要等人允许（在页面中），种类的策略都为 `off`（或 `presmium-mcp` 没有 `--allow`）时写明不提供操作；源码改动怎样到达工具按进程写明（`presmium dev` 保存后重新编译，`presmium serve` 在文档的文件改动后重新编译，`presmium-mcp` 在文件改动后的下一次调用时重新编译；宿主经 `McpHost.process` 给出）。
  - `search` 使用与网页搜索相同的索引：每节一个文档（标题、所在章的标题、各块的文字），MiniSearch，同样的字段与分词。`chapters`、`blockText` 与分词 `tokenize` 都是 `@lincyaw/kernel` 的纯函数（第 3 节），网页渲染端用的是同一份（站点的搜索从 `@lincyaw/kernel/reading` 引入 `tokenize`），`mcp` 只依赖内核、编译器与 `minisearch`。
  - 服务端：没有给出 `ServerOptions.mcp` 时，`startServer` 在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost`（`packages/server/src/mcp-host.ts`）并挂在 `/mcp`。经 `MCP_ENDPOINT` 签发的令牌被 `revoke` 时，它打开着的事件流（`subscriptions/listen` 的订阅）随即结束，客户端的订阅以 `remote` 关闭。控制通道（`ControlChannel`）的 `positions`、`go`、`setClassroom`、`status` 可以按文档筛选；`watch` 在窗口报告新的位置时通知。MCP 的 `run_code` 的确认总是 `content` 范围。`get_position` 先取该成员放映与演讲者窗口的位置，再取其他窗口的；`navigate` 只向该成员的窗口发 `go`，该成员没有窗口显示文稿时（其他成员的窗口不算）不发出确认就返回错误。步号按调用方（完整文稿）的编号：窗口报告它在本节已到达的步骤的键（`trail`，内核的 `stepTrail`；控制通道的 `WindowPosition.trail`，至多 10000 个），另一种编号的窗口（幻灯片形态中只给其他渲染端的块不占步骤）由 `trailStep` 换算为完整文稿中这些键到达的最后一步；`navigate` 发出的 `go` 也带上到这一步为止的键，另一种编号的窗口据此找到对应的步骤。一份文档第一次被请求时还没有编译结果（`presmium dev` 刚启动）的，下一次请求再加载。
  - `presmium-mcp [文稿] [--allow <种类>]`（`@lincyaw/mcp` 的可执行文件）：在编译器上实现 `McpHost`，源文件（含 `{include}` 与编译的依赖）改动后在下一次调用时重新编译；与 CLI 一样带上随 CLI 安装的渲染端：编译器的 `bundled` 是 CLI 的包目录（`bundledDir`：文稿项目中安装的 `@lincyaw/cli`，从文稿目录向上的 `node_modules` 中找；没有时是 `presmium-mcp` 随之安装的 CLI；都没有时是 `@lincyaw/mcp` 自己的目录），检查同 `presmium check`；没有页面窗口，不列出 `get_position`、`get_classroom`、`navigate` 与课堂工具；也没有页面可以询问，所以只提供并直接允许 `--allow` 列出的种类（`operate` 给出 `run_code` 与 `build`）。标准输出只用于 MCP，插件的日志改到标准错误。编辑器的 MCP 配置写命令 `node <仓库>/packages/mcp/bin/presmium-mcp.mjs <文稿目录>`。
  - 放映时的确认：放映视图与演讲者视图以 `position: fixed` 的覆盖层盖住了站点外壳顶栏中的工具栏（幻灯片页没有站点外壳），所以两个视图的控制条各有确认入口（`@lincyaw/host` 的 `PmApprovals`，放映视图的控制条在底部，面板向上打开，`placement: 'above'`）；只开放映视图时也能回答 `navigate` 等的确认（`e2e/mcp.spec.ts`）。
- **运营者设置**：`startServer` 接受 `settings`（插件 ID 到设置），交给各插件的 `ServerContext.settings` 与 `NodeServiceContext.settings`。`presmium dev`、`build`、`check` 读取工作区根目录 `presmium.workspace.yaml` 的 `settings`（没有该文件时为空），`presmium serve` 由工作区读取同一个键；都只在进程启动时读取一次，运行中改动配置文件不生效，直到运营者重启（`ir.md`）。
- **生命周期**：`presmium dev` 与 `presmium serve` 为被访问的文稿挂载插件的服务端贡献。`serverConfigKey(compilation)` 比较已加载插件的 ID、文稿的 `presmium` 配置与 `lang`；重新编译后这些值变化时，宿主关闭并卸下旧贡献，下一次请求用新的配置与 Node 服务快照挂载。只改正文不卸下贡献，课堂与其他有状态的连接因此保留。Node 服务的编译生命周期见 4.6 节；运营者的工作区设置在进程启动时读取，变化需重启。浏览器端插件或渲染端的组合变化仍按开发服务器的提示重启。服务端另外登记 `APPROVALS` 与 `MCP_ENDPOINT`，工作区登记 `REVISIONS`、`DOCUMENT_FILES` 与 `DOCUMENT_LOCKS`（4.5 节）。
- **插件的来源**（4.2 节）：`presmium dev`、`serve`、`build`、`check` 都按文稿的 `plugins` 与 `renderers.<id>.package` 加载，另加运营者插件（`settings.presmium.workspace.plugins` 中声明了 `operator: true` 的），每份文档都加载它们。
- **编译器的宿主选项**：`new Compiler(deck, options)` 的 `CompilerOptions`：`settings`（默认读取工作区根目录 `presmium.workspace.yaml` 的 `settings`，每个进程每个文件一次；文件读不出时是错误级诊断 `presmium.workspace`）、`services`（宿主的 Node 端服务，先于插件的登记）、`bundled`（随 CLI 安装的 Presmium 自己的包从哪里解析：CLI 的包目录）、`operatorDir`、`secret`。`{include}`、`{literalinclude}`、链接与资源按真实文件读取，跟随符号链接。运营者插件排在文稿的插件之前（同一令牌以运营者的实现为准；没有加入 IR 的 `config.plugins`，所以 IR 不变，渲染端也不加载它们的浏览器部分），文稿也列出的同一个包只加载一次。Node 端服务的编译生命周期见 4.6 节；服务端贡献的生命周期见本节“生命周期”。运营者目录由编译器按 10.5 节的规则得出（`operatorDir(root,given)`，`@lincyaw/compiler` 导出），`presmium dev`、`build`、`check` 读 `PRESMIUM_OPERATOR_DIR`；目录不创建，在工作区之中时是错误级诊断。
- **端口**：`presmium dev` 的服务端默认取空闲端口（`--server-port` 指定），启动时在渲染端的地址之后打印 `server  <地址>` 与 `mcp  <地址>/mcp (its token is in <状态文件>)`；`presmium serve` 用 `--port`（默认 4310）与 `--host`（默认 `127.0.0.1`，10.1 节），打印 `serve  <地址>`、局域网地址（有 `--host` 时）、`workspace  <根目录>` 与 `mcp  <地址>/mcp (its token is in <状态文件>)`。
- `startServer(options)`（`@lincyaw/server`）的选项：`mode`（`dev` 或 `serve`）、`listenAddress`（监听的地址，命令行的 `--host`）、`port`、`document(dir)`（文档目录到 `ServedDocument`：编译器加载的插件及其配置、Node 端服务、运营者设置与运营者目录，`servedDocument(compilation)` 由编译结果得出；第一次请求该文档时创建贡献）、`serverHost`（`ServerHost`：`documents()`、`compile(document)`、`check(document)`、`build(document,{ to })`、`run(document,{ section,block },signal)`；`presmium dev` 的实现在 `packages/cli/src/dev-host.ts`，以开发循环最近一次的编译为准）、`settings`、`approvals`（种类到 `off`、`ask`、`allow`）、`forward()`、`operatorDir`、`stateFile`、`mcp`（挂载 MCP 服务；没有时带有效令牌的请求得到 501）、`env`。`mode` 为 `dev` 时 `listenAddress` 只能是本机的地址，否则启动失败。返回值的 `services`（`APPROVALS`、`MCP_ENDPOINT`）由宿主交给编译器（`CompilerOptions.services`），`control` 给出窗口的位置、`go`、`setClassroom` 与状态摘要（供 MCP）。请求经 Node 的请求先判断（来源、代理、转发），其余交给 `@hono/node-server` 转换为 Fetch API；路由处理函数出错时返回 500 与原因。
- `presmium serve` 在 `@lincyaw/workspace` 中（`serveWorkspace`）。每份文档一个按需创建的编译会话（`src/node/compile-session.ts` 的 `CompileSession`：第一次被请求时编译，此后监听它读过的文件，编译依次进行），编译器选项为 `execution.env: 'serve'` 与宿主服务（服务端的 `APPROVALS`、`MCP_ENDPOINT`，工作区的 `REVISIONS`、`DOCUMENT_FILES`、`DOCUMENT_LOCKS`）。工作区的路由作为一个只有服务端贡献的插件 `presmium.workspace` 挂在每份文档（与首页，文档 `''`）上：`GET documents`（读者）、`POST documents`（编辑者：`{ op: create | rename | copy | delete,dir,to?,title?,template? }`）、`GET revisions`（文档页面默认只列出本文档的修改；每项另有文档操作 `operation`、撤销的提交 `reverts`，撤销一次撤销的另标 `redo: true`）、`POST revisions/revert`（冲突时 409 与文件）。工作区站点：网页渲染端的 `devSite` 是一个站点服务（1.1 节），按路径中最长的文档目录回答该文档的页面与文件（站点路径为 `/<目录>/`，第一次请求时以 `compile` 的 IR 准备），其余路径回答工作区首页与缺页；`buildSite` 先构建首页再把每份文档构建到 `<out>/<目录>/`（查看器只复制一次，在 `<out>/_app/<键>/`），每份文档有自己的搜索索引，其中另含其他文档的章节。文档的插件由 IR 的 `config.plugins` 给出：工作区把它换成编译器实际加载的包目录（绝对路径），站点只加载这些；站点自己的插件（`RenderContext.plugins`）是工作区的浏览器插件。站点服务不在工作区中写文件：文稿的代码包与发布的文件在 serve 的状态目录中，查看器在用户的缓存目录中；IR、修改与搜索的路由在站点路径的 `__app/` 下（1.1 节）。`forward()` 给出本进程中站点服务的地址。文档操作与撤销经 `DOCUMENT_LOCKS` 加锁，锁的持有者为 `agent:<任务 ID>`、`document:<操作>`、`revision:revert` 或 `assistant:revert`；文档被别人持有时 `documents` 与 `revisions/revert` 回答 409，回答体在 `error` 旁另有 `locked: { document, holder }`，页面按界面语言说明是谁持有。复制文档时一并复制 `.presmium/` 中属于文档的部分（执行的录制 `freeze/`、圈画 `drawings/`、`assets/`、合成缓存 `speech/` 与 `speech.lock.json`、`anchors.lock.json`），逐字节相同，生成的工作目录不复制。文档操作的提交尾注 `Presmium-Origin` 写明操作与目录（`document rename guide manual`；目录中的空白与 `%` 按百分号编码），撤销的尾注写它撤销的操作，历史面板据此显示本地化的标签，日期按界面语言格式化；撤销一次撤销的提交在 `GET revisions` 中标为 `redo: true`（面板显示“重做”标签）。在磁盘上新建或删除的文档在下一次请求站点时被发现（至多每秒检查一次）。`PRESMIUM_DEBUG` 让 `presmium serve` 与 `presmium dev` 的服务端与插件写出调试行（标准错误）。
- **课堂同步**（一个端口）：会话插件（`@lincyaw/addon-session`）的服务端贡献在本机回环的空闲端口上启动一个课堂服务（`@lincyaw/classroom-server` 的 `startClassroomServer`，归档写到文稿的 `.presmium/classroom/`；这是插件写文档目录不经 `DOCUMENT_FILES` 的两个例外之一，另一个是舞台插件的圈画路由直接写 `.presmium/drawings/`（5.12 节；编译器的执行录制 `.presmium/freeze/` 也直接写，它不是插件的写入）：课堂服务是独立的包，与单独运行的 `presmium-classroom-server` 同一份代码，以 `node:fs` 写归档文件，不替换途中的符号链接。归档是生成的数据，不属于文稿的源码，工作区的 `.gitignore`（`templates/workspace/.gitignore`）忽略 `.presmium/classroom/`，它不进入修改历史；`presmium dev` 与 `presmium serve` 只供本机的一个用户使用，经链接写到的地方也是这个用户本来就能写的，所以只记下这个例外），由服务端的反向代理挂在 `/__presmium/presmium.session/sync/` 下（HTTP 与 WebSocket，角色 `reader`），协议与 `presmium-classroom-server` 相同：房间是路径的最后一段，`POST <sync>/archive/<房间>` 归档。路由 `GET classroom` 回答 `{ path, document }`。文稿 metadata没有 `presmium.session.server` 时，页面在服务端可用（`useServer().available`）时取这条路由，连到 `ws(s)://<页面的主机>/__presmium/presmium.session/sync`，每个请求带查询参数 `document`（WebSocket 不能带 `Presmium-Document` 请求头），课堂入口随之出现；所以 `presmium dev` 与 `presmium serve` 中开课不必另起进程，`--host` 时局域网中的学习者也经同一个端口加入。`presmium dev` 的站点服务把 `/__presmium/` 连同 WebSocket 代理到服务端。头部写了课堂服务时照旧连到它；发布到静态托管的文稿没有服务端，要用单独的课堂服务。每份文档一个课堂服务，文档卸下（`unmount`）或服务端关闭时关闭，其中的课堂随之结束。
### 10.3 请求来源与权限

- **`presmium dev`**：只监听本机。服务端检查 `Host` 是 `localhost`、`127.0.0.1` 或 `[::1]`（任何端口），`Origin` 缺省或同样是本机的地址（任何端口，因为页面来自渲染端的开发服务器，经它的代理转发），挡住 DNS 重绑定与其他网站的请求（MCP SDK 的 `localhostAllowedHostnames`、`localhostAllowedOrigins` 做法相同）。成员是本机作者，角色为所有者。`/mcp` 另外要求 `Authorization: Bearer <令牌>`，接受两种令牌：每个进程随机生成的令牌，写入 `<文稿>/.presmium/server.json`（权限 0600，不入库；启动时打印它所在的文件），供作者在编辑器中使用的 agent（Claude Code、Codex 等）连接，模式为 `author`；以及服务端经 `MCP_ENDPOINT` 为 dsh 会话签发的令牌（见下）。
- **`presmium serve`**：同样的检查，唯一的成员是本机作者（所有者），没有登录。`--host` 时（10.1 节）`Host` 与 `Origin` 另可以是监听的地址与本机的名字；同站的 `Origin` 检查照旧，另一站点的页面发来的请求得到 403。转发到工作区站点的请求来自局域网的名字时，服务端以站点自己的本机名字为 `Host`（与 `Origin`）转发，站点的路由与开发服务器只接受本机名字的请求。`/mcp` 与 `presmium dev` 一样接受两种令牌：每个进程随机生成的令牌（模式为 `author`，供本机作者的外部 agent 连接），写入 serve 的状态目录中的 `server.json`（`$XDG_CACHE_HOME/presmium/serve/<工作区的哈希>/server.json`，权限 0600，在工作区之外），启动时打印 `mcp  <地址>/mcp (its token is in <这个文件>)`；以及经 `MCP_ENDPOINT` 签发的令牌。`--host` 时局域网中的设备不经令牌访问不了 `/mcp`。
- **角色**：路由与代理按 `Member`、`MemberRole`、`Route.role` 检查，本机作者是所有者，满足全部角色。服务端提供完整文稿；学生版由构建时的受众筛选生成。
- **学习者的内容**：读者得到内容的途径是学生版的构建（`presmium build --audience student`），发布为静态站点；服务端与 MCP 只给出完整的文稿。编译器另有 `Compilation.audienceDocument(name)`：在完整编译的文稿上做同样的筛选（去掉受众不含它的章节、块、块中标了受众的节点与位于被去掉的章节与块中的诊断，压缩步骤，章节重新编号，块 ID 不变，在视图中重新解析交叉引用，`ir.md`），`build` 的 `audience` 选项用它构建一份完整编译的学生版并扫描写出的文件（诊断不引用被去掉的内容），译本同样去掉教师内容（4.10 节）。因为这时插件的编译步骤与编译时执行已经运行，插件与代码从教师内容派生、写到别处的文字不在筛选之内：`audienceDocument` 因此按泄漏扫描的句子检查留下的块，含有它们的块也去掉，并在视图的诊断中报告位置；`presmium build --audience student` 在编译步骤之前筛选并扫描产物。用例：`cli/test/audience.test.ts`、`compiler/test/audience.test.ts`。
- **路由的角色**：挂载点按 `Route.role`、`ProxySpec.role`（默认 `editor`）检查；不满足时返回 403，插件不各自检查。
- `presmium dev` 的 `.presmium/server.json` 与 `presmium serve` 状态目录中的 `server.json`（权限 0600）记 `{ url, mcp, token, pid }`（`startServer` 的 `stateFile`）。`Host` 与 `Origin` 的检查在 `packages/server/src/auth.ts`（`authenticate`，本机的名字由 `machineHosts(监听的地址)` 给出）；主机名不分大小写、去掉端口，不带方括号的 IPv6 地址（如监听地址 `::1`）读作 `[::1]`。`ServerContext.secret` 读服务端进程的环境。
- **MCP 的身份**：dsh bundle 经 `MCP_ENDPOINT.issue(member, 'author', { confirmed, document })` 为每个会话取得令牌，令牌绑定成员、模式与文档，会话关闭时作废。工具的范围由令牌的成员的角色决定，不由请求参数决定；每个令牌都读完整的文稿。

### 10.4 控制通道与确认

- **控制通道**：`useServer().available` 时，宿主在 `startHost` 中连接 `/__presmium/presmium.server/control`（SSE 接收，POST 报告）。页面报告：自己的位置（`navigation` 服务的位置与视图）、视图角色，以及 `STATUS` 中各插件的摘要（变化时，至多每秒一次）。服务端发来：`go`（经 `navigation.go` 跳转）、`session`（经 `session` 服务开始或结束课堂）、`approval`（确认请求）。MCP 的 `get_position` 返回该成员处于放映或演讲者视图的窗口最近报告的位置，没有时返回任一窗口的位置；`navigate` 向这些窗口发出 `go`，听众视图照旧经已有的通道跟随。位置带章节 ID（`NavigationPosition.section`），`get_position` 按 ID 找章节（文稿中已没有这一节时 `section` 为 null），不用窗口的章节序号，步号按完整文稿的编号（窗口报告的 `trail`，10.2 节）；编辑者与所有者的放映窗口排在其他窗口之前，读者声称的 `presenter` 角色只对他自己算数；`get_classroom` 只取编辑者与所有者窗口报告的课堂摘要（演讲者窗口优先），读者的页面报告的空闲状态不覆盖教师的。两种形态的位置都带章节 ID，取自 IR 运行时的章节（`ir.md`）。
- **确认**：`APPROVALS` 按种类的策略处理：`off` 时这类操作不提供（MCP 不列出对应的工具），`ask`（默认）时经控制通道发出请求；任一有资格的窗口回答即生效，50 秒内（低于 DeepSeek Harness 调用 MCP 工具的 60 秒超时）没有回答视为拒绝。`allow` 只能由本机作者用 `presmium dev --allow <种类,…>` 或工作区所有者在 `presmium.workspace.yaml` 的 `approvals` 中设置，文稿不能设置。
- **按范围分发**（`ApprovalScope`，4.7 节）：`content` 范围的请求发给 `member` 的窗口（没有指定成员时发给全部编辑者与所有者）；`workspace` 范围的请求只发给所有者的窗口，服务端只接受所有者对它的回答。没有标明范围的请求按 `workspace` 处理。`presmium dev` 与 `presmium serve` 中唯一的成员是所有者，两种范围都发给本机作者的窗口（`--host` 时也包括局域网中其他设备上的窗口）。
- **确认界面**：宿主在 `PmToolbar` 中加入一个只在有待确认请求时出现的入口，两种形态都显示：说明、发起方、允许与拒绝。Studio 工作台在应用栏放同样的入口（`@lincyaw/workbench` 的 `WorkbenchApprovals`），经共享事件连接的 `approvals` 主题收听、经 `/api/presmium/control` 回答。拒绝或超时在 MCP 工具中报告为 `operation-not-allowed`（403，不可重试）。
- **控制通道的消息**：`GET /__presmium/presmium.server/control?window=<窗口 ID>&document=<文档>` 是 SSE，事件有 `ready`（`{ window }`）、`approval`（`{ id,request }`，打开时补发这个窗口可以回答的、仍在等待的确认）、`settled`（`{ id,allow }`）、`go`（`{ slide,step,view }`）与 `session`（`{ action: 'start' | 'end',name }`）。`POST` 同一路径：`{ window, type: 'report', position, role, status }`（窗口未知或属于其他成员时 404）与 `{ window, type: 'answer', id, allow }`（200；没有这个确认 404；这位成员不能在这里回答 403）。加 `observe=approvals` 的 `GET` 只收 `approval` 与 `settled`：这个连接不是查看器窗口，不接收 `go`、不计入导航与位置，也不能报告。`hello` 返回 `{ member, document }`。页面读完每个 `POST` 的响应体（否则浏览器一直算它在进行中）。一个确认 50 秒（`approvalTimeoutMs`）没有回答视为拒绝，服务端关闭时全部视为拒绝。

### 10.5 部署

- **本机**：`presmium serve [目录]` 一条命令启动工作区服务；目录中没有 `presmium.workspace.yaml` 而有 `lecture.json` 时，作为只有一份文档的工作区。工作区必须在 git 仓库中，否则编辑功能不可用并提示 `git init`。`--host` 让同一用户在局域网中的其他设备上使用（10.1 节）。
- **运营者目录**：存放运营者的数据（默认的同意记录目录 `consent/`），在任何工作区与文档目录之外，不属于任何文档，`REVISIONS` 从不提交它。它是用户的状态目录 `${XDG_STATE_HOME:-~/.local/state}/presmium/operator/<工作区标识>/`（标识是工作区根目录真实路径的 sha256 的前 16 位十六进制数），`presmium dev`、`build`、`check`、`serve` 与 `presmium-speech consent` 按同一规则找到它，`--operator-dir` 或 `PRESMIUM_OPERATOR_DIR` 可以另行指定（同样不能在工作区之中）；插件经 `NodeServiceContext.operatorDir`、`ServerContext.operatorDir` 得到它，agent 对它的权限请求一律拒绝（10.4 节）。
- **多人使用**：每人一个工作区，由 hub 托管模板给出（1.1）。
- **远端环境**：`templates/env/compose/` 与 `templates/env/kubernetes/README.md`（Zero to JupyterHub 的 `values.yaml` 片段，按 CPU、GPU、MIG 划分的配置，gVisor 的 `runtimeClassName`，回收设置，以及 agent-sandbox 的模板）只给文档与清单片段，不维护 Helm chart。集群、GPU Operator、gVisor 或 Kata 的安装、入口与证书由用户负责。
- 静态构建产物（含学生版）仍可发布到任意静态托管；课堂用单独的 `presmium-classroom-server`。

### 10.6 编译时执行的信任模型

编译时执行的代码由文稿的编辑者或受提示注入的 agent 写出，以本机用户的身份运行（10.1 节）。实现见 4.6 节的 `RunContext`、`PROCESS_SANDBOX` 与编译器的执行选项：

- **环境变量**：每个 Node 端执行器（执行插件的子进程、本地环境插件的容器、WASI 与 Jupyter 的编译时客户端、WebGPU 录制所启动的 Chromium）只给代码清理过的环境 `RunContext.env`。`presmium build`、`check`、`dev`：进程的环境去掉全部 `PRESMIUM_` 开头的变量与名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量；`presmium serve`：只有 `PATH`、`LANG` 与 `LC_*`、`TZ`、`TMPDIR` 与 `HOME`（每个工作区一个临时目录）。两者都加上运营者设置 `settings.presmium.exec.passEnv` 列出的变量。这只挡住代码经自己的环境拿到凭据；同一 uid 的进程信息见下两条。
- **容器命令行的环境**：`docker` 与 devcontainer 命令行是执行器调用的工具，它们读的容器定义（`${localEnv:…}`）却来自文稿，所以同样以 `RunContext.env` 为基础，只另加 Docker 客户端需要的变量：进程中的 `DOCKER_HOST`、`DOCKER_CONTEXT`、`DOCKER_CONFIG`、`DOCKER_CERT_PATH`、`DOCKER_TLS_VERIFY`、`XDG_RUNTIME_DIR`，以及进程真实的 `HOME`（Docker 从 `~/.docker/` 读取上下文与镜像仓库的登录）。这些都不是凭据，运营者不必经 `passEnv` 传入。容器里的代码经命令行只得到 `RunContext.env` 中的变量（逐个传入，不传主机上的路径 `PATH`、`HOME`）。容器定义本身可以挂载主机路径，这是 9.4 节的残余风险。
- **执行**：全部执行，不经确认（被执行的代码以运营者的身份受信任）。`PROCESS_SANDBOX` 是可选的进程沙箱：运营者插件登记它时，编译器把它放进 `RunContext.sandbox`，执行插件的子进程经它运行，构建报告写明隔离方式；没有时直接启动子进程。拿得到什么见 9.4 节。
- **构建**：`presmium serve` 中 MCP 的 `build` 把产物写在工作区之外的 serve 状态目录中（`$XDG_CACHE_HOME/presmium/serve/<工作区的哈希>/builds/<文档>/<视图>/`），并在结果中给出这个路径（写在工作区中的产物会作为 agent 的修改出现在审阅中）；渲染端是文稿能加载的那些。
- **MCP 的 `run_code` 与 `build`**：这两个工具也执行文稿中的代码（`run_code` 经 `ServerHost` 以编译器的执行器重新运行一个代码块，不读也不写录制；`build` 构建文档），使用与同一宿主的编译相同的执行选项。`presmium dev`、`presmium serve` 与 `presmium-mcp` 中两者的确认都是 `content` 范围，全部执行（有进程沙箱时经它）。
- **agent 的代码执行**：dsh 会话的 shell 按 dsh 的权限模式与 bundle 的确认策略（第 13 节）。

### 10.7 修改审阅

审阅由工作区服务实现，`CHANGE_REVIEW` 与 `review` 路由共用 `packages/workspace/src/node/review/`。dsh 会话的交互流程见 `design-dsh.md` 6.5 节。

- **范围与锁**：dsh 会话的审阅覆盖整个工作区，包括未选择文稿时的写入；从文稿目录启动的 headless 与 acp 会话同样。它持有工作区锁，与任意文档的保存、操作、撤销和其他审阅互斥。插件通过 `CHANGE_REVIEW` 发起的任务可指定文档范围，持有文档锁。
- **快照与检查点**：git 树记录审阅开始时的文件与每次工具调用后的状态，包含开始时尚未提交的修改。临时索引用于构建树，不改 `HEAD` 与真实索引；差异以相对于工作区根目录的路径给出。服务发起的构建写在工作区之外的状态目录，不进入审阅。
- **拒绝与回到检查点**：从 git 对象库读出目标内容，经 `DOCUMENT_FILES` 恢复范围内的文件；目标树中没有的路径删除，途中的符号链接被替换而不跟随。`restoreTo` 恢复到指定步骤之前，并移除该步与之后的检查点。
- **接受与提交**：先恢复被拒绝的文件，再经 `REVISIONS` 提交其余改动。提交成功后才删除审阅记录并释放锁；失败时返回错误，保留审阅供作者重试或拒绝。提交的会话与 turn 尾注用于修改历史和撤销通知。
- **git 的执行边界**：审阅使用独立的 git 目录与打开时固定的对象库、工作树，只复制读取文件所需的配置。审阅命令关闭钩子、fsmonitor、外部 diff 与 textconv，并按字面解释路径，避免 agent 改写仓库配置或属性后让服务执行代码。工作区包含仓库的 git 目录时，看守器在操作前恢复会影响代码执行与配置定位的文件；对象库、引用、日志与真实索引不属于此看守范围。
- **进程恢复**：审阅记录存放在用户状态目录的 `presmium/reviews/`，包含范围、快照、会话、turn 与检查点。服务重启时恢复会话审阅并重新持锁；无 turn 运行且没有页面跟随时，按 `reviewTimeoutMs` 回滚。接受或拒绝后删除记录。

锁协调工作区服务中的写入。磁盘上的编辑器或其他进程仍可能直接修改同一范围；这些改动会进入差异，也会被拒绝或恢复操作覆盖（9.4 节）。

## 11. 安全

服务端只供运行它的那个用户使用（10.1 节）：被执行的代码与 agent 以这个用户的身份受信任，下表的措施是纵深防御。措施之后仍然拿得到的东西写在 9.4 节。

| 风险 | 措施 |
|---|---|
| 本机端点被其他网站或进程调用 | 默认只监听本机；校验 `Host` 与 `Origin`（`presmium serve --host` 时另接受监听的地址与本机的名字，其他名字与其他站点的页面照旧被拒绝，10.3 节）；MCP 要求令牌；插件代理的路径不能越出目标（`.`、`..` 与编码的分隔符得到 400） |
| 局域网中的其他设备 | `presmium serve` 没有登录，只供运行它的那个用户使用：`--host` 时到得了这个端口的设备都以本机作者的身份使用工作区，启动时在标准错误上写明（9.4 节）；默认只监听本机；多人使用时每人一个工作区（hub 托管模板） |
| agent 误改或越权 | dsh 的文件权限与确认映射见 `design-dsh.md` 6.2、6.3 节；会话修改由工作区审阅覆盖（10.7 节），接受后提交并可撤销。MCP 的操作类与计费类工具由服务端确认，确认按范围分发（10.4 节） |
| 文稿关闭安全设置 | 工作区的插件列表、确认策略、agent 的替换命令与模型的服务提供方、修改的审阅、编译时执行传入的环境变量（`settings.presmium.exec.passEnv`）、录音的去处、是否允许克隆音色与同意记录的目录都不从文稿读取，只来自命令行、环境变量与工作区配置（插件经 `settings` 得到，4.7 节）；工作区配置只在进程启动时读取，改动要等运营者重启才生效。agent 对工作区配置的改动包含在工作区审阅中，提交后作者可以撤销（`review: required` 时可以在接受前逐文件拒绝）；写入权限由 dsh 的权限模式决定（`design-dsh.md` 6.3 节） |
| 文稿中的 Node 插件在服务端运行 | 文稿列出的插件与文稿目录中的包在 `presmium` 进程中运行，等于运行文稿的代码：`presmium serve` 与 `presmium dev` 相同；只打开信任的文稿与工作区（9.4 节） |
| 编辑者或 agent 写的代码在服务端运行 | 代码只得到清理过的环境变量（`RunContext.env`，4.6 节），`presmium serve` 中只有允许列表；全部执行，运营者插件登记了进程沙箱时经它运行（10.6 节）；agent 的 shell 按 dsh 的权限模式 |
| 同一 uid 的代码读其他进程的环境与内存 | 不声称挡住（9.4 节），只有进程沙箱在可用时隐藏其他进程 |
| 文稿把服务端的凭据引向别的地址 | 文稿只写环境与引擎的名字，不能决定哪个凭据发往哪个地址：凭据与它的地址由运营者在持有凭据的 `presmium` 进程的环境变量中成对给出。远端环境：`PRESMIUM_ENV_<名>_TOKEN` 只发往 `PRESMIUM_ENV_<名>_URL`，文稿中的 `url` 与它不同源时不连接并给出错误诊断，不回退到通用的变量（如 `JUPYTER_TOKEN`）；没有给出地址时不发送令牌。语音：引擎 `<ID>` 的地址与凭据是 `PRESMIUM_SPEECH_<ID>_URL` 与 `PRESMIUM_SPEECH_<ID>_KEY`（火山引擎的地址固定在适配器中；它的控制台访问密钥 `PRESMIUM_SPEECH_VOLCENGINE_ACCESS_KEY_ID`、`_SECRET_ACCESS_KEY` 只经官方 SDK 发往 `open.volcengineapi.com`，显式传给客户端，SDK 的默认凭据链不被使用），文稿只用 `engine`、`voice` 选择引擎与音色；文稿中出现 `url`、`keyEnv` 这类字段时是错误，不被使用。模型：`DEEPSEEK_API_KEY` 只发往 DeepSeek 的官方地址，`PRESMIUM_MODEL_KEY` 只发往 `PRESMIUM_MODEL_URL` |
| 提示注入（学习者的问题、远端输出、网页内容） | 学习者的问题不到达任何 agent 与服务端：页面把问题与页面中的文字发给读者自己填写的模型服务，回答只是显示的文字与跳转的链接（`presmium://sections/<章节>`），不调用任何工具；回答在课堂中公开前由主讲确认（“发给课堂”）。作者的 agent 读到的文稿与远端输出照旧可能含有注入的指令，它的写入经审阅、shell 与网络经确认（上一行） |
| 凭据泄露 | 凭据不写入文稿、IR 与产物；代理代加凭据；`presmium check` 对文稿 metadata中像凭据的字段告警（字段名含 `token`、`secret`、`password`、`key` 且值不是环境变量名，或值形如常见的密钥前缀）；编译时执行的代码只得到清理过的环境（见上）；启动 agent 子进程时去掉全部 `PRESMIUM_` 开头的变量。凭据在 `presmium` 进程与 agent 的环境中（同一 uid 拿得到，9.4 节） |
| 数据外发 | DeepSeek Harness 的会话日志上传与遥测由配置模板关闭，并以 `DSH_TELEMETRY_MODE=DISABLED` 启动；语音与模型的服务提供方在界面上标明（读者的提问面板写明读者自己填写的服务与模型；转写与合成的入口写明 `SpeechEngineInfo.provider`），运营者的服务提供方的名字来自运营者的配置（`PRESMIUM_SPEECH_<ID>_PROVIDER`），在任何请求之前就已知，没有定义的引擎不发出请求；录音只在显式“转写”时发出；读者的问题只发往读者自己填写的服务，不带站点的 Cookie 与来源 |
| 不可信的富输出 | 执行输出中的 HTML 用 DOMPurify 清洗后显示（去掉脚本与事件属性），网页与幻灯片是同一个 IR 运行时；远端内核的 HTML 与 SVG 输出在执行器中先经 DOMPurify 清洗，图片输出只接受 base64 数据 |
| 文稿的组件在浏览器中运行 | 组件与原始 HTML 是文稿的一部分，以开发服务器或工作区站点的源运行，能以本机作者的身份调用路由（接受审阅、回答确认），列为残余风险（9.4 节）；`/mcp` 另要求令牌 |
| 仓库中的脚本被 git 执行 | 工作区的 git 命令关闭钩子与 fsmonitor（`-c core.hooksPath=/dev/null -c core.fsmonitor=false`）；审阅的 git 命令在审阅自己的 git 目录中运行，只用仓库的对象库与工作树，不读仓库 git 目录中的配置与钩子（工作树的 `.gitattributes` 照常读，但它点名的过滤驱动没有定义，不会运行，10.7 节），并在运行 git 之前恢复 agent 写进仓库 git 目录的钩子与配置，留给作者与工作区之后的 git 命令（4.8 节）。任务进行中工作区自己的 git 命令（状态栏的 `git status`）仍读仓库的配置：单份文稿的仓库中，agent 在任务进行中写进 `.git/config` 的过滤驱动可能被它执行，直到看守在下一步恢复它；这与 agent 本来就能以作者的身份运行命令（经确认的 shell）属于同一个信任边界 |
| 文档目录中的符号链接让服务端写到别处或读到别处 | 服务端写文档目录都经 `DOCUMENT_FILES`（审阅的回退与恢复、文档操作改写的链接、撤销，讲授与语音插件的写入）：途中的符号链接被替换而不被跟随（4.8 节）；插件写入中的例外是课堂服务的归档，直接写 `.presmium/classroom/`（10.2 节），与舞台插件的圈画路由，直接写 `.presmium/drawings/`（5.12 节），编译器的执行录制 `.presmium/freeze/` 也直接写；讲授插件的路由读文件时不跟随链接、不等待 FIFO（`addon-lecture/test/files.test.ts`） |
| GPU 被学习者代码拖垮 | 限制派发规模与重复次数；超时就销毁设备并结束 Worker；监听设备丢失，避免浏览器把站点列入 GPU 黑名单；可以只给录制输出 |
| 音色滥用 | 克隆音色默认关闭：只在运营者设置 `settings.presmium.speech.cloned: true` 时可用，且每个克隆音色要有本人的同意记录 `<consentDir>/<引擎>/<音色>.json`（说话人、范围、日期、同意声明录音的 sha256），语音服务在合成前检查，缺一即拒绝；合成缓存命中时同样检查，同意撤回之后服务端的讲授路由也不再给出已合成的讲授与它的片段。同意记录是运营者的数据，在运营者目录中，不在文稿里：只有所有者经语音插件的路由（`role: owner`：`consent`，以及训练克隆音色的 `clone`，它先登记、后发送样本，同意声明的录音存在记录旁边）登记，或运营者用 `presmium-speech consent`、`presmium-speech clone` 登记；文稿目录中的同意记录被忽略，文档的提交不包含它们。运营者目录在工作区之外的用户状态目录中（10.5 节），agent 对它的权限请求一律拒绝，同一 uid 的代码绕过工具写它是残余风险（9.4 节）。合成的音频在播放界面与元数据中标明由 AI 生成（GB 45438-2025、《人工智能生成合成内容标识办法》）：元数据由语音服务在写入缓存时加入，不依赖引擎 |
| 只给教师的内容到达学习者 | 学习者只得到学生版的构建（`presmium build --audience student`），它的产物扫描泄漏；读者问答的上下文取自页面中的 IR，学生版站点的 IR 本来就没有教师内容。教师专用指令中的脚注留在指令之中，受众标记范围内的块随之去掉；任何构建都不发布文档的源码（指向另一份文档 `lecture.json` 的链接在工作区站点中改写为它的页面，`ir.md`）。学生版的构建只发布录制的讲授中摘要与录制时相同的章节的话语与音视频 |
| 请求体耗尽服务端的内存 | 插件路由的请求体默认至多 1 MiB（`Route.maxBody` 可放大，讲授录制的分块为 `MAX_CHUNK`）：`Content-Length` 超过时在处理函数运行之前回答 413，分块传输读到上限即截断 |
| 提问耗尽资源与模型预算 | 读者的问题不占用服务端与运营者的模型：每位读者用自己的服务与密钥，费用由读者自己承担；主讲在课堂中生成“AI 回答”用的是主讲自己填写的服务。运营者的模型只用于作者自己在工作台中的会话 |
| 学习者改写别人的课堂条目 | 课堂服务按集合在键中找参与者 ID 的位置（作答等在最后一个 `:` 之后，提问在第一个 `:` 之前；参与者 ID 不能含 `:`），已写明他人的条目不能改写或删除（4.4 节“课堂的写入规则”） |
| 插件读到不该读的文件 | `{code-ref}` 读工作树经编译器的读取器（`PassContext.src`），只有读提交时用自己的 git 读取器，锚点不能指向 `.git`；讲授插件的媒体路由以 `O_NOFOLLOW`、`O_NONBLOCK` 打开文件后按文件描述符核对真实路径，再从这个描述符读出，检查与打开之间没有竞态 |

## 12. 依赖选型

依赖准则：只用公开接口，不 fork，不引入 AGPL。依赖声明与对等依赖约束以各包的 `package.json` 为准，实际解析版本以 `pnpm-lock.yaml` 为准；安装策略由 `pnpm-workspace.yaml` 约束。

| 组件 | 许可证 | 用途 | 包 |
|---|---|---|---|
| `@modelcontextprotocol/server`；测试用 `@modelcontextprotocol/client` | Apache-2.0（既有代码 MIT） | MCP 服务（`createMcpHandler`、`serveStdio`、`fromJsonSchema`）与测试中的客户端；服务端自己校验 Host 与 Origin | mcp |
| `minisearch` | MIT | 网页的站内搜索与 MCP 的 `search` 工具的索引（同样的字段与分词） | web、mcp |
| Vite | MIT | 查看器（含服务端渲染）与文稿代码包的构建 | web |
| send | MIT | 站点服务与打印时的静态文件（类型、Range、校验与条件请求按 HTTP 规范）；任务产物的静态服务器 | web、compiler |
| sitemap | MIT | 构建的站点的 `sitemap.xml` | web |
| launch-editor | MIT | `presmium dev` 中在作者的编辑器里打开块的源码行 | web |
| CodeMirror 6（`@codemirror/*`、`@lezer/highlight`） | MIT | 块内源码与可运行代码的就地编辑，第一次编辑时才加载 | viewer |
| drauu（`@drauu/core`） | MIT | 幻灯片上的圈画 | addon-stage |
| pptxgenjs | MIT | 幻灯片导出为 PowerPoint（每张一张图片，讲解作为演讲者备注） | render-slides |
| DeepSeek Harness（`@deepseek-ai/dsh` 与 bundle 用到的 `@deepseek-ai/dsh-*`） | MIT（`libreoffice-kit`、`libreoffice-kit-wasm` 为 MPL-2.0，`node-addon-system` 为 BSD-3-Clause） | 工作台的 agent、会话、确认、模型设置与客户端运行时；`@lincyaw/dsh` 以对等依赖接入，`@lincyaw/studio` 提供宿主；升级先过升级闸门（13.5 节） | dsh、studio |
| Runno（`@runno/wasi`、`@runno/sandbox`） | MIT（二进制：clang 8.0.1 与 wasm-ld 为 LLVM 8 的 University of Illinois/NCSA 许可，LLVM 9 起为 Apache-2.0 加 LLVM 例外；sysroot 中的 wasi-libc 为 Apache-2.0 加 LLVM 例外或 MIT；Ruby 3.2.0 为 Ruby 许可或 BSD-2-Clause，SQLite 为公有领域；发布时附 `<base>wasi/LICENSES`） | `@runno/wasi` 是浏览器与 Node 共用的 WASI 系统；`@runno/sandbox` 只提供 C、C++、Ruby、SQLite 的二进制（`dist/langs`），它的 Node 接口不用 | addon-exec-wasi |
| jax-js（`@jax-js/jax`） | MIT | JS/TS 中的张量代码与自动微分，WebGPU 后端；ES 模块构建原样随产物发布，第一次导入时加载（`@jax-js/optax` 没有用到） | addon-exec-webgpu |
| playwright-chromium | Apache-2.0 | 构建时在 Chromium 中录制 WebGPU 输出（录制时才加载）；打印幻灯片（PDF、图片、PowerPoint）与导出讲授视频（幻灯片渲染端与讲授插件的可选 peer 依赖，导出时先用文稿自己的） | addon-exec-webgpu、render-slides、addon-lecture |
| `@jupyterlab/services` | BSD-3-Clause | Jupyter 内核与终端协议的客户端，浏览器与 Node 共用 | addon-exec-jupyter |
| `@xterm/xterm`、`@xterm/addon-fit` | MIT | 浏览器终端 | addon-exec-jupyter |
| `ws` | MIT | Node 端连接内核与终端的 WebSocket（能带请求头，令牌不进地址；`@jupyterlab/services` 本身也依赖它） | addon-exec-jupyter |
| `@noble/hashes` | MIT | 讲授的播放器在浏览器中计算译文原文的 SHA-256（不依赖安全上下文中的 `crypto.subtle`，过期的译文在任何浏览器中都能标出） | addon-lecture |
| Mediabunny（`mediabunny`） | MPL-2.0（文件级） | 录音为 Ogg/Opus（WebCodecs），摄像头与屏幕录为 WebM；导出视频时在 Chromium 页面中合成音视频与 WebVTT 字幕轨（WebM）。`@mediabunny/server` 附带的 FFmpeg 是 GPL，不用它，不导出 MP4 | addon-lecture |
| GSAP（`gsap`） | Standard "No Charge" GSAP License | 动画场景：GSAP 时间轴 | addon-motion |
| Anime.js（`animejs`） | MIT | 动画场景：Anime.js 时间轴 | addon-motion |
| Motion（`motion`） | MIT | 动画场景：Motion 的动画与序列 | addon-motion |
| Three.js（`three`） | MIT | 动画场景：WebGL 三维画面 | addon-motion |
| Remotion（`remotion`、`@remotion/player`），React（`react`、`react-dom`） | Remotion License；MIT | 动画场景：Remotion 的合成，以播放器的 `Thumbnail` 按帧画出 | addon-motion |
| D3（`d3`） | ISC | 动画场景：比例尺、坐标轴、布局与形状生成器建出的图形，按时刻插值画出（不用 D3 的过渡） | addon-motion |
| simple-git | MIT | 代码引用读取 git 中的文件、本地环境的仓库；工作区审阅直接运行 git，以控制 git 目录、对象库与钩子设置（10.7 节） | addon-code、addon-exec-local |
| React、React DOM | MIT | 工作台、预打包查看器、插件组件与 SSR；工作台由 dsh 外壳提供同一份 React，查看器通过 import map 共享 | host、viewer、web、workbench、dsh、各浏览器插件 |
| BlockNote（`@blocknote/core`、`@blocknote/react`、`@blocknote/mantine`） | MPL-2.0 | 作者侧正文、字幕和讲稿编辑，原生选区、历史与批注 | workbench |
| RJSF（`@rjsf/core`、`@rjsf/utils`） | Apache-2.0 | 公共参数表单；通过公开 fields、templates、widgets 组合 Pm 控件，保留未知值；草稿与保存由调用方负责 | workbench |
| `@cfworker/json-schema` | MIT | 文稿及组件参数共用的 JSON Schema 2020-12 校验 | kernel |
| `json-schema-library` | MIT | 参数路径与只读注解查询，不承担文稿有效性判断；不自动加载远端引用 | kernel |
| `fast-json-patch` | MIT | 比较参数草稿并派生受限的领域操作，最终保存仍经过文稿校验与版本检查 | kernel |
| Radix Primitives（`@radix-ui/react-*`） | MIT | 弹窗、菜单、浮层、标签页、焦点范围 | host、viewer、workbench |
| dnd kit（`@dnd-kit/react`、`@dnd-kit/dom`） | MIT | 页面列表的指针、触屏、键盘排序与读屏反馈，提交仍经过文稿保存边界 | workbench |
| esbuild | MIT | 把 `@lincyaw/dsh` 的客户端部分构建为 dsh 的工厂格式 | dsh |
| `@hono/node-server` | MIT | Node 请求与 Fetch API 之间的转换 | server |
| http-proxy-3 | MIT | HTTP 与 WebSocket 反向代理（远端环境、工作区站点；`presmium dev` 的站点服务把 `/__presmium/` 代理到服务端） | server、web |
| DOMPurify | Apache-2.0 或 MPL-2.0 | 清洗执行输出中的 HTML | viewer |
| ansi_up | MIT | 把回溯与输出中的 ANSI 转义转为样式 | viewer |
| mdast-util-from-markdown、mdast-util-gfm、micromark-extension-gfm | MIT | 浏览器中把现场运行的 `text/markdown` 输出转为 mdast；讲授插件读单独的讲授脚本（只用 mdast-util-from-markdown） | viewer、addon-lecture |
| myst-ext-card、myst-ext-grid、myst-ext-tabs、myst-ext-button | MIT | 卡片、栅格、选项卡、按钮；与 myst-parser 配套使用 | compiler |
| lychee | MIT 或 Apache-2.0 | 用户安装的命令，用于可选的外部链接检查 | cli |
| 镜像：docker-stacks、`jupyter_server`；可选 gVisor | BSD-3-Clause、Apache-2.0 | 远端环境的模板；镜像按固定摘要引用 | templates/env |

随网页与幻灯片产物再分发的运行时带上许可证声明：WebAssembly 运行时为 `<base>wasi/LICENSES`；Pyodide 为 `<base>pyodide/LICENSES`（Pyodide 的 MPL-2.0 全文与源码地址、编译为 WebAssembly 的 CPython 的 PSF 许可证、`pyodide-lock.json` 中随运行时发布的包的许可证）；jax-js 为 `<base>presmium/jax-js/LICENSE`（取自 `@jax-js/jax` 包）。它们与运行时一同发出，开发服务器中也提供，并在离线缓存的范围内。

本仓库根 `pnpm-workspace.yaml` 将 ProseMirror View 约束为 1.42.6，并让 BlockNote 与 Tiptap 共用同一份实例。在浏览器版本对照中，1.42.7／1.42.8 使 BlockNote 收缩的中文预编辑分成两段；版本分界与真实系统输入、正文及字幕保存验证见[输入法回归记录](benchmarks/document-ime-regression-2026-10-27.md)。没有修改依赖源码或替换原生输入机制。这是仓库根安装与构建的约束，发布包不会自动把根 overrides 传给外部消费者；独立安装的依赖约束与输入行为仍需单独验证。

火山引擎的控制台接口（OpenAPI，`speech_saas_prod`）用官方 SDK `@volcengine/speechsaasprod`（ListSpeakers，模型的音色列表）与 `@volcengine/speechsaasprod20250521`（BatchListMegaTTSTrainStatus，账号的克隆音色），Apache-2.0，凭据显式传入。合成、转写与训练克隆音色的数据面接口（`/api/v3/tts/unidirectional`、`/api/v3/tts/voice_clone`、`/api/v3/tts/get_voice` 等）没有 npm SDK，适配器直接调用 HTTP；OpenAI 音频接口形态的服务用 `fetch` 即可。没有控制台凭据时，火山引擎的音色来自随包的目录 `volcengine-voices.ts`（语音合成 2.0 的全部音色，由 `packages/addon-speech/scripts/volcengine-voices.mjs` 从官方的音色列表文档生成）。

不采用：ffmpeg.wasm（核心为 GPL）、Motion Canvas（2024 年底起停止维护）、TensorFlow.js 的 WebGPU 后端与 webgpu-torch（停更）、Jupyter Kernel Gateway（停更，浏览器跨域有缺陷）、Daytona 等 AGPL 许可的沙箱平台、edge-tts（非官方接口）、在进程内 mock 语音或模型的测试库。

## 13. 工作台与 dsh

设计与取舍在 `design-dsh.md`，概念对照与 `Focus` 在 `domain-model.md` 第 16 节。本节列出实现依赖的结构与契约。

工作台的文档编辑、编译放映、视频制作是三个独立入口，分别负责正文与页面编辑、编译诊断与放映、配音字幕与视频产出。它们共用唯一的可编辑文稿 IR、文稿版本和工作区服务，界面状态与任务生命周期按入口管理。文档编辑使用 React 与 BlockNote，步骤编辑只提供字幕与配音开始；发音工具、音色、完整时机和媒体剪辑放在视频制作。正文保存与页面操作不会自动进入放映。当前优先完成文档编辑验收，其余入口的目标与已实现范围见 [UI/UX RFC](rfc-workbench-uiux.md)。

### 13.1 三层与进程

| 层 | 包 | 框架 | 依赖 dsh | 版本 |
|---|---|---|---|---|
| 核心 | `kernel`、`compiler`、`cli`、`presmium`、`server`、`mcp`、`language-server`、`workspace` 的 Node 部分（工作区服务）、`classroom-server`、`create-presmium`、`presmium-vscode` | TS、Node | 否 | 1.x |
| 产物 | `web`、`viewer`、`render-slides`、`render-notebook`、各插件的组件与 `src/client`、`host` | React | 否 | 1.x |
| 工作台 | `design`（与产物共用）、`workbench`、`dsh`、`studio` | React 18（由 dsh 的外壳提供） | 只有 `dsh` 与 `studio` | 0.x（`design` 随 `host` 为 1.x） |

```
浏览器标签页
┌ 工作台：dsh 的客户端运行时 ─────────────────────────────────────────────────────────┐
│ Presmium 的根布局插件（替换 dsh 的 ui-layout）与面板（@lincyaw/workbench，React）      │
│ dsh 的插件：对话、确认卡片、会话、模型设置、终端、jobs                                    │
│ 预览 iframe ══ 预览协议（postMessage）══ 产物页面（React：查看器的网页与幻灯片页）          │
└──────┬────────────────────────────────────────────────────────┬────────────────────────┘
       │ /api/presmium/*（dsh 的 cookie 与 Host、Origin 栅栏）        │ 另一个源，直接访问
       ▼                                                         ▼
dsh 宿主（studio 启动；Presmium 自己的 DSH_HOME 与 profile）       工作区服务（presmium serve，回环）
├ agent 循环、工具、沙箱、确认、会话、模型与凭据                       ├ 编译会话、IR、诊断、工作区站点（查看器的页面，带预览代理）
└ @lincyaw/dsh 的宿主部分：工具、确认策略、上下文、技能、             ├ 文档、源码、修改历史、审阅、焦点
  文档的工作区登记、turn 与审阅、/api/presmium/* ── 回环 HTTP、/mcp ──► └ /mcp（Claude Code、Codex 也连这里）
```

`presmium studio` 的启动器启动并监管 dsh 宿主与工作区服务（各在自己的进程组中，有父进程退出的看门狗），只打印 dsh 宿主的一个网址。文稿的代码只在工作区服务中运行，不进 dsh 宿主（`design-dsh.md` 第 2、11 节）。

实现：

- **包与命令**：`@lincyaw/studio`（0.1.0；依赖精确版本的 `@deepseek-ai/dsh` 0.2.1-alpha.4、`@lincyaw/dsh` 与 `presmium`）：`src/cli.ts` 的 `main`（`presmium studio [目录] [--port <端口>] [--host <地址>]`；命令 `presmium-studio` 相同）、`src/studio.ts` 的 `startStudio`（启动器）、`src/model-env.ts`（模型的环境变量）。`@lincyaw/cli` 不依赖它：`presmium studio` 从回退的包目录（`presmium`）、CLI 的包目录或当前项目解析 `@lincyaw/studio`，用 jiti 加载并转交，带上运行它的 `presmium` 命令作为工作区服务的命令；pnpm 的全局安装每个包各在自己的目录中，所以全局装的工作台的命令是 `presmium-studio`，它依赖 `presmium`，用 `presmium` 的 `bin/presmium.mjs` 启动工作区服务。没装时说明怎样安装（`pnpm add -g @lincyaw/studio` 后运行 `presmium-studio`，或在项目中 `pnpm add -D @lincyaw/studio`），以 2 退出。目录的规则同 `presmium serve`。
- **目录与 profile**：`DSH_HOME` 是 `$XDG_STATE_HOME/presmium/studio`（没有这个变量时是 `~/.local/state/presmium/studio`），从不用环境中的 `DSH_HOME` 或用户自己的 `~/.dsh`。每次启动用 `@lincyaw/dsh/launch` 的 `writeProfile` 写这个安装的 profile `presmium-studio-<散列>`（散列取自 `@lincyaw/dsh` 包目录的真实路径；web 载体；保留 profile 自己的 `cordis.patch.yml`，即用户在界面中的改动，新 profile 先复制最近改过的 `presmium-studio*` profile 的补丁；`design-dsh.md` 11.1 节），以 `launchArgs` 传入 `web.patch.yml` 与 `profile.patch.yml`，环境中加 `launchEnv`。两个进程的输出写进其中的 `presmium-studio-<散列>.log`（0600，每行带进程名；过 16 MB 时另起，旧的留作 `.1`）：启动器的标准输出只有一行 `studio  <网址>`。
- **端口与源**：工作台的端口默认 4320，每次相同，浏览器的 cookie 因此在重启之后仍有效（dsh 的签名密钥在 `DSH_HOME` 中）；4320 被占用时另取一个空闲端口，`--port 0` 取空闲端口，`--port` 给出的端口被占用时报错。端口在启动任何进程之前由启动器选定，因为工作区服务以工作台的源启动：`--preview-origin` 是 `http://127.0.0.1:<端口>` 与 `http://localhost:<端口>`（`--host` 时是 `http://<地址>:<端口>`）。
- **启动顺序**（`design-dsh.md` 11.2 节）：服务令牌（24 字节的随机值）；`node <看门狗> node <presmium> serve <目录> --port 0 [--host <地址>] --preview-origin …`（`@lincyaw/dsh/launch` 的 `launchWorkspaceServer`，`presmium-service` 行自己启动服务时用的同一个），环境中没有 `DSH_*`、`DEEPSEEK_*`、`PRESMIUM_MODEL_*`、`PRESMIUM_SERVICE_*`、`PRESMIUM_WORKSPACE`、`NODE_ENV`、`PORT`（`workspaceServerEnv`），有 `PRESMIUM_SERVICE_TOKEN`，等它打印 `serve  <网址>` 与 `workspace  <根目录>`；`node <看门狗> node <dsh> --profile presmium-studio-<散列> --patch … --port <端口> --no-open [--host <地址> --trusted-host <地址>:<端口>]`，工作目录是工作区根，环境中有 `PRESMIUM_SERVICE_URL`、`PRESMIUM_SERVICE_TOKEN`、`PRESMIUM_WORKSPACE`、`launchEnv` 与模型的变量，等它打印 `dsh web: <网址>`（`WEB_READY`）；打印这个网址。dsh 在加载树安定、启动审计通过之后才打印这一行（`dsh-web-app` 的 README），`presmium-workspaces` 在激活时登记文档的工作区，所以这一行也说明登记好了，启动器不另外查询。任何一步失败（3 分钟没有就绪也算）都停下已启动的进程，在标准错误报告并给出日志的位置，以 2 退出。
- **监管**（11.2、14 节）：两个进程各在 `@lincyaw/dsh` 的看门狗之下（`launchNode`，`presmium-service` 行用的同一个），以 `detached` 自成进程组，看门狗的标准输入是来自启动器的管道：启动器退出（`kill -9` 也是）时看门狗结束整个组，组中的开发服务器一并结束。SIGINT、SIGTERM、SIGHUP 时启动器先停 dsh（bundle 在服务处作废会话令牌）再停服务，各等 15 秒，之后向组发 SIGKILL，以 0 退出；一个进程自己结束时启动器停下另一个，报告是哪一个与日志的位置，以 1 退出。
- **模型**（11.3 节）：`PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER` 三个都有时成为 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY` 与 `DEEPSEEK_SEARCH_BASE_URL`（网页搜索用同一个密钥，地址也是这个服务）；只有一部分时在标准错误警告缺少哪个；否则 `DEEPSEEK_API_KEY` 原样传给 dsh，作者环境中的 `DEEPSEEK_BASE_URL`、`DEEPSEEK_SEARCH_BASE_URL` 不传（密钥只去 DeepSeek 的官方地址）。dsh 自己不接受 `.env` 文件中的这类地址变量（工作区根的 `.env` 写了它时 dsh 拒绝启动），所以工作区的 `.env` 改不了密钥的去向。
- **局域网**（11.4 节）：`--host` 只接受本机的一个具体 IP 地址（拒绝 `0.0.0.0`、`::` 等通配地址与主机名），dsh 与工作区服务都只监听这个地址（服务端的 `Host`、`Origin` 规则按 10.1 节接受它），`--preview-origin` 是它的源；启动时在标准错误警告没有登录，同一网络中到得了这两个端口的人都以作者的身份工作。
- **用例**：`packages/studio/test/studio.test.ts`（消费者安装与一个网址、在 Chromium 中打开后是工作台；全新的 home 中第一个会话在工作区根目录、没有 `~/Documents`；环境中的模型；外来 `Origin` 的 403；局域网；服务的环境中没有模型的密钥与 `kill -9`），工作区在 `e2e/fixtures/regression/.presmium` 中，端口 5663 至 5666。消费者安装由 `scripts/consumer.ts` 的 `STUDIO` 完成（单独运行：`node scripts/consumer.ts [<目录>] --studio`）；打包在全仓的一个锁（`node_modules/.presmium-pack.lock`）之下进行，因为 `@lincyaw/dsh` 的 `prepack` 与 `postpack` 改写它自己的目录，CLI 与 studio 的消费者安装用例同时打包时会互相删去对方要打进去的文件。

### 13.2 契约与接口

| 契约或接口 | 位置 |
|---|---|
| 预览协议：`PREVIEW_PROTOCOL = 1` 与消息类型 | `packages/kernel/src/contracts/preview.ts`（`design-dsh.md` 第 4 节） |
| 当前诊断：`Diagnostic`、`DiagnosticSnapshot`、`PreviewDiagnostics`、无 IR 前置的 `AuthoringDiagnostics`；SSE 与 MCP 资源订阅；工作台与 agent 读取同一快照 | `packages/kernel/src/contracts/diagnostics.ts`、`packages/server/src/diagnostics.ts`（`design-dsh.md` 5.4 节） |
| `RenderContext.preview?: { origins: string[] }`：站点服务的页面带预览代理与允许的父页面来源 | `packages/kernel/src/ir.ts`（只增加可选字段） |
| 工作区服务的新路由：`ir`、`ir/events`、`preview`、`build`、`check`；`presmium serve --preview-origin <源>`；服务令牌 `PRESMIUM_SERVICE_TOKEN` | `packages/workspace/src/node/`、`packages/cli/src/cli.ts`（`design-dsh.md` 第 5 节） |
| 审阅的路由：`review`（SSE 时为页面跟随）、`review/open`、`review/step`、`review/accept`、`review/reject`、`review/restore`、`review/events`（bundle 的 SSE）；`CHANGE_REVIEW` 的 git 实现由工作区服务提供；会话的提交另带尾注 `Presmium-Session`、`Presmium-Turn` | `packages/workspace/src/node/review/`、`packages/dsh/src/node/turns.ts` |
| `Focus`、`FocusReport`（工作台报告的、尚未换算的焦点）；`Annotation.focus`、`AgentContext.focus` | `packages/kernel/src/contracts/agent.ts`（只增加） |
| 工作区服务的路由的数据：`DocumentsAnswer`、`FilesAnswer`、`SourceAnswer`、`IrAnswer`、`IrEvent`、`PreviewAnswer`、`ReviewSnapshot`、`ReviewUpdate`、`HistoryRevision` 等；文档列表的 `DocumentSummary`（`ServerHost`、`McpHost` 与工作区服务共用） | `packages/kernel/src/contracts/workspace.ts`，工作区服务与工作台都引用它 |
| `MCP_ENDPOINT.issue(member, mode, { confirmed, document })`（`McpIssueOptions`）：会话令牌（主机已确认、绑定一份文档）；服务端路由 `presmium.server/tokens` 与 `presmium.server/focus` | `packages/kernel/src/contracts/server.ts`（只增加）、`packages/server/src/server.ts`、`focus.ts` |
| 列出的工具的 `_meta`（`presmium/kind`，主机已确认的调用者另有 `presmium/approval`）；客户端一侧 `@lincyaw/mcp/client`（`connectPresmiumMcp`、`describeOperation`）；焦点的换算 `resolveFocus`；资源 `presmium://focus` 与工具 `get_focus`；`McpHost.focus`、`watchFocus`、`approval`；`McpCaller.confirmed`、`document` | `@lincyaw/mcp` |
| bundle `@lincyaw/dsh`：`dsh.bundle`（`cordis.patch.yml`）、`web.patch.yml`、`profile.patch.yml`；启动器用的 `@lincyaw/dsh/launch`（`writeProfile`、`launchPatches`、`launchEnv`、`dshBin`、`launchArgs`；在看门狗之下启动进程的 `launchNode` 与 `launchWorkspaceServer`，环境的 `isLauncherVariable`、`inheritedEnv`、`workspaceServerEnv`；就绪的一行 `WEB_READY`、`SERVE_READY`、`WORKSPACE_READY`） | `packages/dsh/` |
| 设计系统 `@lincyaw/design`（令牌、类、字体、图标、`COLORS`）；工作台的面板与状态 `@lincyaw/workbench`（`Workbench`、`workspaceClient`、`connectPreview`、各面板与文档编辑器 `DocumentEditor`、React 版的 `Pm*`）；bundle 的客户端部分 `@lincyaw/dsh/client` 与 `presmium-workbench` 行（`/api/presmium/workbench`） | `packages/design/`、`packages/workbench/`、`packages/dsh/src/client/`、`packages/dsh/src/node/workbench.ts`、`packages/dsh/build/` |
| `presmium studio [目录] [--port] [--host]` | `@lincyaw/studio`；`@lincyaw/cli` 转交 |

作者接口使用 `DocumentAnswer` 与 `DocumentChangeAnswer`，文稿版本 CAS 与运行快照修订分离。旧 `sourceCapabilities`、源码行范围和 MyST Unicode 标签能力不再决定作者编辑是否可用；实体/字段路径由统一文稿契约校验。

### 13.3 预览协议

工作台经 `postMessage` 驱动嵌在 iframe 中的产物页面：工作台发 `go`、`highlight`、`pick`、`pins`、`marks`、`appearance`，产物发 `ready`、`position`、`picked`、`selection`、`updated`、`report`；只传章节、块与步骤的 ID（步号按完整文稿编号，幻灯片形态用 `trail` 换算），源码位置由工作台从 IR 得出。预览代理只在工作区服务的站点页面中启动（页面配置的 `origins` 取自 `RenderContext.preview`），地址带 `presmium-preview=<nonce>`、在 iframe 中、来源在允许的列表中才启动；双方核对 `origin`、`source` 与 nonce；预览页面带 `frame-ancestors`。构建的站点的页面没有允许的来源，代理不启动。嵌在工作台中时（`isPreviewEmbedded()`，页面的 `<html>` 带 `pm-in-workbench` 类），网页形态只显示一张放在画布上的纸，不带站点的导航栏、搜索、侧栏、本页目录与标题的永久链接，放映视图画成画布上的一张幻灯片、没有放映时的控制条；插件只用于放映、录制的界面也凭这个类隐藏（如讲授的录制工具条）；幻灯片形态是同一个放映视图，没有控制条与外边距，比例由工作台的画布保持（`design-dsh.md` 7.3 节）。产物在 DOM 上写锚点 `data-section`、`.pm-block[data-block]`、`data-step`；幻灯片是 `.pm-slide[data-section][data-slide][data-step]`，其中的块是同样的 `.pm-block[data-block]`。消息的字段与握手见 `design-dsh.md` 第 4 节。

实现：

- **契约与代理**：`packages/kernel/src/contracts/preview.ts` 有 `PREVIEW_PROTOCOL`、两个方向的消息类型（`PreviewCommand`、`PreviewReport`）、两边共用的收窄函数 `toPreviewCommand`、`toPreviewReport`（核对信封、版本、nonce 与字段，不认识的一律丢弃；`selection` 的内容在字段 `selection` 中，没有选中时为 `null`，与 `highlight` 的 `target` 一样）；不依赖框架的产物一侧在 `packages/kernel/src/preview-frame.ts`（另有站点服务的 `Content-Security-Policy` 用的 `previewFrameAncestors`），`connectPreviewFrame(page)` 返回 `PreviewFrame`：按锚点框出（`[data-preview-highlight]`，不在页面中的先由形态带进来）、在块的元素之中画编号标记（`.pm-preview-pin`）、点选（捕获阶段的点击，控件与链接照常，鼠标下的块加浅色细框，报告块的框、鼠标位置与连击次数）、文字选中（`selectionchange`，带选区的框）、点选或选区的框随滚动与尺寸变化重报（`rect`，每帧再看一次，直到连续两帧不变）、就地编辑（`edit`：元素加 `contenteditable` 与 `[data-preview-editing]`，按键在窗口的捕获阶段截下；取消或没有改动时按 `MutationObserver` 的记录倒着撤销浏览器的改动，页面框架持有的节点因此不变）、作者用的标记（`<html>` 的类 `pm-author-marks`，`AUTHOR_MARKS_CLASS`）、位置（至多每 150 ms）、页面重新渲染后重画（`MutationObserver`），`ready` 之前的问题攒到 `ready` 之后再发。这些都只对页面看得见的块：宿主的规则（排版了、不在 `[inert]` 与 `.pm-hidden` 之下），形态还可以另给规则（`PreviewPage.seen`），看不见的块不框（先由形态带到它出现的那一步）、不画标记、点不中（点在它的位置上得到章节）。nonce 另记在 iframe 的 `window.name` 中，同一个框架中换了地址或刷新后代理照样启动。形态只给出位置、跳转、明暗、修订号、暂停与问题：两种形态是同一个模块 `packages/web/src/client/preview-frame.ts`（IR 运行时的 `navigation`、明暗开关，报告的 `renderer` 是 `web` 或 `slides`，支持 `activity`），由查看器的页面（`packages/web/src/app/main.ts`）导入。插件启动失败与组件出错（宿主的启动报告与 `componentErrors`）各报告一次。
- **修订号**：工作区服务以编译结果 IR 的哈希为修订号（`GET ir`），写进交给工作区站点的 IR 的 `meta`（键 `PREVIEW_REVISION`，即 `presmiumRevision`）；两种形态都从 IR 运行时的文档读出，页面换上新的 IR 后发 `updated`。
- **步号**：`position`、`picked` 的 `step` 是页面自己的步号，都带 `trail`（`picked` 是块出现的那一步的，`PreviewPage.stepOf`），工作台用内核的 `trailStep` 换算成完整文稿的步号，与控制通道的位置相同；`go` 带 `trail` 时按它定位（`followedPlace`），只带 `step` 时按页面的步号。只给网页的块在幻灯片中不占步骤，端到端用例的文稿就有这样一步。
- **幻灯片的锚点**：每张幻灯片是 `SlideFace` 的 `.pm-slide[data-section][data-slide][data-step]`，其中的上屏块是 IR 运行时的 `.pm-block[data-block]`，与网页相同，所以宿主的 `blockElement`（`[data-section] .pm-block[data-block]`）在幻灯片中同样找得到块。角色的标记是 IR 运行时的 `PmRoleMark`，在演讲者视图中与 `pm-author-marks` 时显示，两种形态相同。
- **`frame-ancestors`**：预览页面的 `Content-Security-Policy: frame-ancestors <--preview-origin 的源>`（没有时 `'none'`），由站点服务给查看器的页面加上，两种形态相同。
- **首次绘制的明暗**：工作台的地址带 `presmium-appearance=dark|light`（`PREVIEW_APPEARANCE_PARAM`，内核的 `previewAppearance()`），查看器在页面头部就照它设好 `<html>` 的 `dark` 类，没有时照系统；之后由 `appearance` 命令跟随。
- **工作区服务**（`packages/workspace/src/node/workbench-api.ts`、`routes.ts`、`serve.ts`）：`GET ir` 回答修订号、IR 与诊断（路径相对于工作区根目录，与 `source` 路由一致）；`GET ir/events` 是 SSE，先发当前的修订号（文档还没有编译过时，连接时开始第一次编译，发它的修订号），之后每次编译一条（事件 `revision`：修订号、错误与警告数、引起这次编译的文件，相对于工作区根目录）；`GET preview` 回答网页的地址（查看器显示这份文档的页面 `<base>__app/view?document=<目录>`；查看器与代码包等了 15 秒仍没有就绪时为工作区站点中这份文档的页面，1.1 节）与幻灯片的地址（同一地址加 `form=slides`；文稿的 `renderers` 列出了别的渲染端却没有 `slides` 时没有）；两者都在服务自己的地址上，`--host` 时也只用服务的端口。`POST build`（`{ to? }`，写到服务的状态目录）与 `POST check`。工作台的页面（`view`）只运行文稿自己的插件的浏览器部分，不运行运营者插件的。环境中有 `PRESMIUM_SERVICE_TOKEN` 时，工作区插件的每条路由都要 `Authorization: Bearer <令牌>`（401），代理与服务端自己的路由不受影响。用例：`packages/workspace/test/service.test.ts`、`e2e/preview-protocol.spec.ts`。

### 13.4 bundle、确认与工具

工作台与 dsh 的行为定义集中在 `design-dsh.md`：工作区、会话与当前文稿的映射见 6.2 节，确认见 6.3 节，审阅流程见 6.5 节，布局与退路见第 7 节。这里仅列实现边界，避免在两份文档中维护同一套流程。

| 边界 | 实现 | 责任 |
|---|---|---|
| 工作区与当前文稿 | `packages/dsh/src/node/workspaces.ts`、`service.ts`、`bindings.ts` | 登记启动时的工作区根目录；`service.ts` 的 `WorkspaceServerClient` 连接或启动工作区服务，`bindings.ts` 的 `DocumentBindings` 按选中的文稿把每个 dsh 会话绑定到 MCP 工具、快照与焦点，不改变网页会话的 cwd |
| 工具与确认 | `packages/dsh/src/node/tools.ts`、`policy.ts` | 将同一张 MCP 工具表登记到 agent 作用域，按工具元数据映射确认策略；运营者目录由 guard 拒绝 |
| 文稿上下文与技能 | `packages/dsh/src/node/context.ts`、`skills.ts` | 每一步前读取当前文稿的快照；登记 bundle 提供的技能 |
| 会话审阅 | `packages/dsh/src/node/turns.ts` | 写入前打开工作区审阅，工具完成后记检查点，撤销后把通知注入会话 |
| 工作区事务 | `packages/workspace/src/node/review/` | 快照、检查点、锁、接受、拒绝与崩溃恢复；恢复与提交边界见 10.7 节 |
| HTTP 适配 | `packages/dsh/src/node/routes.ts`、`workbench.ts` | 认证后把工作台请求转给工作区服务，保留流式回答；向页面提供工作区与 MCP 连接信息 |
| 工作台面板 | `packages/workbench/` | 编辑、保存冲突、诊断、预览协议、焦点与审阅的界面和状态，不引用 dsh |
| dsh 客户端适配 | `packages/dsh/src/client/` | 通过 dsh 的布局、槽位、会话、主题与资源解析接口组装工作台；根布局和退路共用面板 |
| 客户端打包 | `packages/dsh/build/` | 按 dsh 的工厂格式预编译客户端，外部模块表与启动契约由升级闸门校验 |

`packages/dsh/test/` 验证工具、上下文、隐私、确认、工作区登记与审阅适配；`packages/workspace/test/review.test.ts` 验证审阅事务；`e2e/workbench.spec.ts` 验证作者在真实工作台中的编辑、预览、导航与退路布局。

### 13.5 升级闸门

每次升级 dsh 都先运行五组用例（第 7 节）：

1. `--dump-config` 的行 ID；
2. 经 bundle 的 headless 假模型用例：工具、四种确认策略、上下文、隐私、工具一致；
3. 客户端的启动审计：`root` 的子槽位、`ctx.layout` 的成员、品牌与首次使用提示的槽位名、`--dsw-*` 令牌名、外壳模块表的键、页面没有错误；
4. 工作台调用的 Host API 端点的 schema 比对；
5. 工作台的端到端用例，含退路布局。

第 1、2 组在 `packages/dsh/test/`：`config.test.ts`（三个载体的 `--dump-config`；headless 与 acp 启动时没有未激活的行；`engines.dsh` 不满足时安装被拒、启动时跳过）是第 1 组；`policy.test.ts`（`ask`、`off`、`allow`、会话令牌、运营者目录）、`privacy.test.ts`（请求体与技能目录、profile 补丁重新打开上传行、persona）、`context.test.ts`（web 载体上两份文档的两个会话、工作区登记、`/api/presmium/*`）、`parity.test.ts`（工具一致、焦点、6.12 节的四个操作）是第 2 组；`service.test.ts`（`kill -9`）不属于闸门。单独运行闸门：`pnpm exec vitest run packages/dsh -t '\[gate\]'`。

第 3 组是 `e2e/workbench.spec.ts` 中带 `@gate` 的启动审计：读锁定版本的客户端包（`e2e/fixtures/workbench/audit.ts`），核对 `root` 的子槽位与 ui-layout 声明的相同、dsh 插件调用的 `ctx.layout` 成员都在 `LAYOUT_MEMBERS` 中、品牌与首次使用的槽位与步骤还在、用到且定义了的 `--dsw-alias-*` 都已映射、映射的都已定义、外壳模块表的键等于构建的外部依赖、插件页实验插件组的属性还在，再打开页面，启动图中有 `@lincyaw/dsh` 而没有 ui-layout 与 DeepSeek 的品牌和账号，没有页面错误。单独运行：`pnpm exec playwright test e2e/workbench.spec.ts --grep @gate`。

### 13.6 `presmium serve` 与 `presmium dev`

`presmium serve` 是工作区服务加产物：首页是文档卡片（与工作区站点的构建相同），文档的页面由工作区站点的站点服务（查看器）提供，带预览代理（只回应 `--preview-origin` 列出的来源）；文档管理、源码编辑、审阅与修改历史经工作区服务的路由，由工作台使用。`presmium dev` 是一份文稿的实时预览。两者的页面都不编辑源码。

### 13.7 编译任务

重的输出统一成工作区服务的任务（`packages/workspace/src/node/jobs.ts`），像 Overleaf 的编译：渲染端的构建（网站、幻灯片网站、notebook、讲授轨）与插件的导出器（`PresmiumNodePlugin.exporters`：幻灯片 PDF、图片、PowerPoint，讲授视频）。

- **运行**：一次一个，按开始的先后排队；每个任务有状态（排队、运行、完成、失败、取消）、进度（阶段与完成数）、日志的最后 400 行（构建工具与导出器的输出，`RenderContext.log`、`ExportContext.log`）与产物。取消时排队的任务立即结束，运行中的导出器由 `signal` 停下它的进程；渲染端的构建没有取消契约，跑完后标为取消。任务每变一次 `sequence` 加一，客户端收到的事件与答复先后不定时，保留序号大的那份。
- **产物**：每个任务一个目录（服务状态目录的 `outputs/<任务>/`），每份文稿的每种输出保留最近 3 个；完成的任务记下 `job.json`，服务重启后仍在。同一份文稿、同一种输出、同一个 IR 修订号已经完成或正在进行时不再生成，直接答复那个任务。服务把 `/__outputs/` 转给只服务这个目录的静态服务器（编译器的 `serveDirectory`，文件经 Express 的 `send`：类型、Range、校验与条件请求按 HTTP 规范；`?download` 用 `content-disposition` 要求下载；工作台的来源经 `cors` 可读，视频的字幕要用），与预览一样在服务自己的地址上，不需要令牌。渲染端的构建以任务的地址为根路径（`BuildOptions.base`），站点在那里直接打开。每个文件带媒体类型（`mime-types`，按扩展名）。
- **路由**（工作区插件）：`GET jobs` 回答可生成的输出（`targets`）与这份文稿的任务，`POST jobs { target }` 开始一个；`POST jobs/cancel { id }`；`GET jobs/events` 是 SSE（事件 `job`）。dsh 照样代理这三条。
- **AI**：MCP 的 `build` 在有任务的宿主中开始任务（`to` 可以是渲染端与导出器），默认等它们结束，`wait: false` 立即返回；`get_builds` 列出可生成的输出与最近的任务（状态、进度、日志末尾、错误、文件与地址）。服务端宿主的 `build`（`POST build`）同样经任务，作者在工作台的“导出”中看到 AI 开始的任务。
- **工作台**：编译放映与视频制作通过公开任务契约读取适用的输出与任务。视频制作独立承载配音、字幕、剪辑、录制和视频导出；目标格式、版本确认与当前实施范围见 [UI/UX RFC 第 8 节](rfc-workbench-uiux.md#8-导出与输出一致性)。

用例：`packages/workspace/test/service.test.ts`（路由、产物地址、同一修订不重复、MCP 的 `get_builds`）、`e2e/export.spec.ts`（导出面板生成 PDF 与 notebook，打开与下载；别处开始的任务在面板中出现并可取消）。

