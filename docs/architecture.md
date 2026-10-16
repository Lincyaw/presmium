# Presmium 架构

本文档定义工程结构、分层规则、跨上下文契约、插件约定与测试策略。领域概念见 `domain-model.md`，任务拆分见 `wbs.md`。

## 1. 编译管线

```
MyST 源码 + 真实代码文件
      │  @presmium/compiler：解析 → 指令 → 角色 → 步骤 → 插件步骤 → 执行（缓存）→ 校验
      ▼
     IR（packages/kernel/src/ir.ts）
      │
      ├── @presmium/web              网页：VitePress 外壳 + @presmium/viewer（IR 运行时，动态渲染，实时更新）
      ├── @presmium/render-slides    幻灯片：生成 Slidev 项目（可选的高保真渲染端）
      └── @presmium/render-notebook  Jupyter .ipynb
```

- 编辑只在源码中进行。渲染端只读 IR。
- 网页与幻灯片在浏览器中运行同一批插件组件，组件只依赖 `@presmium/host`；两个渲染端各自提供宿主适配（VitePress 版在 `web`，Slidev 版在 `addon-core`）。
- 源语法、IR、编译步骤、渲染端接口的完整定义见 `ir.md`。

## 2. 仓库结构

```
presmium/
├── packages/
│   ├── kernel/              @presmium/kernel                    纯 TS 共享内核：契约、服务注册、锚点、检查
│   ├── host/                @presmium/host                      形态无关的宿主接口与组合式函数（Vue）
│   ├── compiler/            @presmium/compiler                  MyST 解析、编译步骤、执行缓存、IR
│   ├── cli/                 @presmium/cli                       presmium build | dev | ir | check；./testing 供各包的集成测试运行 CLI
│   ├── render-slides/       @presmium/render-slides             幻灯片渲染端（生成 Slidev 项目）
│   ├── render-notebook/     @presmium/render-notebook           notebook 渲染端（.ipynb）
│   ├── addon-core/          @presmium/slidev-addon-core         宿主适配：Slidev 实现
│   ├── viewer/              @presmium/viewer                    IR 运行时：动态渲染、运行时视图、实时更新
│   ├── web/                 @presmium/web                       网页渲染端：VitePress 外壳与宿主适配
│   ├── addon-stage/         @presmium/slidev-addon-stage
│   ├── addon-code/          @presmium/slidev-addon-code
│   ├── addon-exec/          @presmium/slidev-addon-exec
│   ├── addon-exec-local/    @presmium/slidev-addon-exec-local   容器执行、回写、环境复刻
│   ├── addon-guide/         @presmium/slidev-addon-guide
│   ├── addon-content/       @presmium/slidev-addon-content
│   ├── addon-publish/       @presmium/slidev-addon-publish
│   ├── addon-session/       @presmium/slidev-addon-session      会话与网络同步
│   ├── addon-classroom/     @presmium/slidev-addon-classroom
│   ├── classroom-server/    @presmium/classroom-server          y-websocket 服务
│   ├── language-server/     @presmium/language-server           语言服务（诊断、跳转、悬停、补全、预览同步）
│   └── vscode/              presmium-vscode                     VS Code 扩展（唯一预打包的包）
├── examples/
│   ├── demo/                示例文稿，端到端测试的对象
│   └── sample-repo/         被示例文稿引用的“业务代码”
├── e2e/                     Playwright 测试，每个上下文一个 spec；测试文稿在 e2e/fixtures/<组>/
├── scripts/                 结构检查：check-layering.mjs、check-skills.mjs、check-plugins.mjs
├── .agents/skills/          仓库技能（P-82）：presmium-author、presmium-present、presmium-develop
└── docs/
```

## 3. 包内分层

每个插件包本身就是一个 Slidev 插件（addon），目录如下：

```
packages/addon-<ctx>/
├── package.json          keywords 含 slidev-addon；exports 见下
├── src/
│   ├── domain/           领域层：纯 TS，不得引用 vue、@slidev/*、vitepress、node:*
│   ├── node/             Node 适配器：指令、编译步骤、执行器、渲染端扩展、检查项、Vite 插件
│   └── client/           浏览器适配器：plugin.ts（内核插件）、viewer.ts（IR 运行时扩展）、服务实现、组合式函数
├── components/           自动注册的组件：Slidev 约定；网页形态由 web 包注册同一批组件
├── setup/                Slidev 约定：main.ts、code-runners.ts、vite-plugins.ts 等
└── global-top.vue 等     Slidev 约定：全局图层（仅幻灯片形态）
```

依赖规则：

| 位置 | 可以依赖 | 不得依赖 |
|---|---|---|
| `src/domain/` | `@presmium/kernel`、纯计算库 | vue 与 `@vue/*`、`@slidev/*`、vitepress、`@presmium/host`、Node 内置模块（`node:fs` 与 `fs` 都算）、`src/domain/` 之外的相对路径 |
| `components/`、`src/client/` | `src/domain/`、`@presmium/kernel`、`@presmium/host`、vue | `@slidev/*`、vitepress |
| `setup/`、全局图层（`global-top.vue`、`global-bottom.vue`、`custom-nav-controls.vue`、`slide-top.vue`、`slide-bottom.vue`） | 以上全部，加 `@slidev/client` 公开导出与 `@slidev/types` | Slidev 的其他包（如 `@slidev/parser`）、vitepress |
| `src/node/` | `src/domain/`、`@presmium/kernel`、Node 库 | vue 与 `@vue/*` |

此外：只有 `addon-core` 可以在组件与 `src/client/` 中使用 `@slidev/client`，这两处不用 `@slidev/*` 的其他包（`web` 的组件与 `src/client/` 同样不用 `@slidev/client`）；只有 `web` 可以使用 vitepress；任何包（测试除外）都不引用插件包 `@presmium/slidev-addon-*`，渲染端与 IR 运行时也不例外，相对路径不离开本包，共用的契约放在 `@presmium/kernel` 或 `@presmium/host`。`scripts/check-layering.mjs` 检查以上全部规则，扫描 `.ts`、`.tsx`、`.vue`、`.js`、`.jsx`、`.mjs`、`.cjs`、`.mts` 文件，静态 `import`、`export ... from`、动态 `import()` 与 `require()` 都算引用。

`package.json` 的 `exports`：

| 入口 | 指向 | 用途 |
|---|---|---|
| `./domain` | `src/domain/index.ts` | 领域层 |
| `./client` | `src/client/index.ts` | 浏览器端 API |
| `./presmium` | `src/node/presmium.ts` | Node 端插件入口，默认导出 `PresmiumNodePlugin` |

源码直接以 `.ts`、`.vue` 发布，不预编译。Slidev、VitePress 与 Vitest 直接处理 TS；CLI 通过 jiti 加载 TS。

## 4. 跨上下文契约

契约的唯一来源是 `packages/kernel/src/contracts.ts`（内核）与 `packages/host/src/types.ts`（宿主）。以下为要点。

### 4.1 插件与服务

- `defineService<T>(id)` 创建服务令牌；`PluginDefinition = { manifest, setup(ctx), dispose? }`。
- 清单声明 `provides`、`requires`（可选依赖标记 `optional`）、兼容的内核版本范围 `kernel`、所需能力 `capabilities`（只声明，不强制）。
- `PluginContext` 提供 `config`、`provide`、`get`、`tryGet`、`events`、`log`、`mode`。

### 4.2 Node 端插件

各插件包的 `./presmium` 入口默认导出 `PresmiumNodePlugin`（定义在 `contracts.ts`）：

| 字段 | 作用 |
|---|---|
| `directives` | MyST 指令规格，把源码转换为 IR 节点 |
| `passes` | IR 编译步骤 |
| `executors` | 编译时执行用的 Node 端执行器 |
| `resolvers`、`anchors`、`checks` | 锚点解析器、文稿引用的锚点、检查项 |
| `renderer` | 本插件提供的渲染端（网页、幻灯片、notebook 各是一个插件） |
| `rendererExtensions` | 本插件为其他渲染端提供的组件转换，例如 notebook 中组件如何变成单元格 |
| `vitePlugins(ctx)` | 运行 Vite 的渲染端在开发服务器与构建中加入的 Vite 插件；`ctx` 为 `{ deckDir, workspaceRoot, config }`，`config` 是本插件的 `presmium.<插件 ID>`（编译步骤写回的值也在其中）。例如本地环境插件以此给两种形态的开发服务器加上自己的端点 |
| `version`、`kernel` | 插件的版本（与 `package.json` 一致）与兼容的内核版本范围；编译器不加载范围不含当前内核的插件。字段在契约中是可选的，官方插件都声明，`scripts/check-plugins.mjs` 检查（并入 `pnpm test`） |

- 编译步骤 `IRPass` 可以声明 `after: 'execute'`，在编译时执行之后运行，此时代码节点已有 `outputs`（执行插件以此把编译时输出写进执行面板的 `fallback`）。渲染端 `Renderer` 可以提供 `prepare(doc, ctx)`：只生成工作目录、不构建（幻灯片渲染端写出 Slidev 文稿），编译器在 `build` 旁导出 `prepare(compilation, { to, outDir, base })`，发布插件的导出与视觉差异用它（`base` 换掉渲染端的站点路径：`slidev export` 在根路径服务生成的文稿，导出时传 `/`）。构建报告的每个输出给出 `outDir`、`workDir` 与站点路径 `base`。
- 渲染上下文 `RenderContext` 另有 `lang`（文稿语言）、`pluginDirs`（编译器加载的插件目录）、`extensionFor(node)`（各渲染端选中同一插件的扩展）、`portable(value, from)`、`localAsset(source, url)`（本地文件）、`renderers` 与 `base`（站点路径）、`vitePlugins`，见 `ir.md` 第 6 节。
- `@presmium/kernel` 还导出插件共用的纯函数：`irBlocks`、`docBlocks`（遍历块，含组件的子块）、`nodeMdast`、`errorMessage`、`isRecord`、`failedRun`、`languageId`（`py`、`python3`、`ipython*` 归为 `python`，`js`、`mjs` 归为 `javascript`，`ts` 归为 `typescript`）、`lowerMyst`（MyST 降为标准 Markdown）与 `deckLocale`。各包不再自带这些函数的副本。
- 指令与编译步骤的上下文提供 `watch(...files)`：声明 `ctx.src`、`ctx.resolvers` 之外读取的文件，`presmium dev` 在它们变化时重新编译（`ir.md` 第 5 节）。
- 组件转换函数为 `(node, block, ctx)`，`ctx` 是所服务渲染端的 `RenderContext`；插件据此得到输出目录与工作目录（例如幻灯片渲染端生成的 Slidev 文稿所在目录），不为此依赖渲染端的包。
- `RenderContext.workspaceRoot` 与指令、编译步骤上下文中的同名字段相同：文稿所在 git 仓库的根目录，不在仓库中时为文稿目录。渲染端发布插件配置（全局的 `presmium` 与各章节的 `{config}`）时按它改写路径：位于仓库内的绝对路径（例如编译步骤解析出的工作区目录）改为相对路径，网页形态相对于文稿目录，幻灯片形态相对于生成的 Slidev 文稿所在的目录（Slidev 与插件在那里解析路径）；仓库外的路径与其他字符串（例如站点路径 `/web`）保持原样。产物因此不随检出位置变化（K-13）。
- 检查项的 `CheckContext` 带有编译好的 IR（`ir`）。

### 4.3 锚点与检查

- 锚点写作 `scheme:target`，例如 `region:src/a.py#add`、`symbol:src/a.py#Parser.parse`。
- 解析结果为 `exact`、`moved`、`fuzzy`、`lost` 之一；只有前两种可直接渲染，后两种必须产生诊断。
- 指纹记录保存在文稿目录的 `.presmium/anchors.lock.json`，由 `presmium check --update-lock` 生成，随文稿提交。
- 文稿 `.presmium/` 中随文稿提交的还有执行缓存 `freeze/`、本地化的远程图片 `assets/`（如 PlantUML 图，见发布插件）与圈画标注 `drawings/`，新检出的文稿因此构建时不访问远程服务、不重新执行代码（K-13）。渲染端的工作目录（`slides/`、`web/` 等）不提交，根目录的 `.gitignore` 按此配置；新增一个本地化资源后要把它提交。
- 执行缓存中同一段代码的录制若来自另一个运行环境（执行器的环境指纹不同，例如另一个解释器版本），构建默认沿用这份录制并给出警告，人人构建得到相同的输出；文稿头部写 `execute: { rerun: environment }` 时，这类代码重新执行并替换录制（`ir.md` 第 4 节）。
- 检查项 `Check.run(ctx)` 返回 `Finding[]`，诊断带源码位置。

### 4.4 宿主接口

宿主契约的唯一来源是 `packages/host/src/types.ts`：

```ts
type PresentationMode = 'slides' | 'document'
type ViewRole = 'audience' | 'presenter' | 'reader'
type SharedStateScope = 'view' | 'local' | 'remote'

interface HostAdapter {
  readonly mode: PresentationMode
  /** 文稿的语言标签（如 `en-US`），供没有页面的渲染使用；浏览器中由 `<html lang>` 携带 */
  readonly lang?: string
  useCursor(): Readonly<Ref<Cursor>>       // { slide, step }
  /** 渲染该组件的页或章节的当前步骤（绝对步骤，不是块内步骤）；全部展开的文档视图为 Infinity */
  useStep(): Readonly<Ref<number>>
  useViewRole(): Readonly<Ref<ViewRole>>
  /** 形态正在渲染静态副本（幻灯片打印 PDF、PNG）时为 true，组件显示 IR 的 fallback */
  useStaticRender(): Readonly<Ref<boolean>>
  /** 插件 pluginId 在调用组件所在页或章节的配置：全局配置之上合并该章节的 `{config}` */
  useSectionConfig(pluginId: string): Readonly<Ref<Record<string, unknown>>>
  /** 按 key 共享的状态（key 以插件 ID 开头，值为 JSON 数据），可在组件外调用 */
  useSharedState<T>(key: string, initial: T, scope: SharedStateScope): Ref<T>
  getService<T>(token: ServiceToken<T>): T | undefined
  /** 内核启动报告；内核启动之前为 undefined */
  startReport(): StartReport | undefined
}
```

两个宿主适配器在应用初始化时通过 `installHost(app, adapter)` 注入实现。组件不直接读 `useStep()`：`useStepState(range)` 用宿主的绝对步骤减去所在步骤作用域的 `at`（`useStepScope()`，渲染端按块的 `at` 用 `PmStepScope` 提供），得到块内第 k 个状态是否已到达。组件自己再减一次 `at` 会算错。

`@presmium/host` 导出的组合式函数与组件：

| 名称 | 作用 |
|---|---|
| `useStepState`、`useStepScope`、`PmStepScope` | 块内步骤的状态与步骤作用域（见上） |
| `useCursor`、`useViewRole`、`usePresentationMode` | 当前位置、视图角色、形态 |
| `useService`、`useStartReport` | 服务实现与内核启动报告，内核启动后才有值 |
| `usePrefersReducedMotion` | 系统“减少动态效果”设置（5.5 节） |
| `PmBoundary` | 错误边界（5.4 节）；属性 `resetKey` 变化时清除错误，组件修好后不刷新即恢复 |
| `PmToolbar`、`PmPresenterPanels` | 宿主显示 `toolbar`、`presenterPanels` 服务内容的位置 |
| `useSectionConfig(pluginId)` | 插件在当前章节的配置：全局配置合并章节的 `{config}`（5.2 节） |
| `useSharedState(key, initial, { scope })` | 插件状态的共享范围：`view` 只在本视图，`local`（默认）在本机所有窗口，`remote` 经 `syncTransports` 跨设备（K-06）。两种形态的实现相同：本机窗口之间用 BroadcastChannel（`joinWindows`），`remote` 另经同步传输端口 |
| `createSharedStates(deck)`、`joinWindows(name, receive, known)`、`deckChannel(name)` | 宿主适配实现 `useSharedState` 的构件，见下文“共享状态” |
| `useLocale()`、`useMessages(catalog)` | 界面语言 `'zh-CN'` 或 `'en'`，与按语言选取的文本（5.7 节） |
| `useStaticRender()` | 静态导出（PDF、PNG）时为 true：幻灯片形态取自 Slidev 的打印模式，网页形态恒为 false（5.8 节） |
| `registerPresmiumPlugin`、`startPresmium`、`stopPresmium` | 注册浏览器端插件、启动与停止内核；两个宿主在页面卸载（`pagehide`）与热更新替换时调用 `stopPresmium`，各插件的 `dispose` 因此会执行，页面从往返缓存恢复时再启动内核。持有资源的插件在 `dispose` 中释放它们（例如执行插件结束 Pyodide 的 Worker），再次启动时不留下第二份 |
| `startHost({ mode, config, navigation, transports })` | 宿主适配启动内核的共同部分：提供 `presenterPanels`、`syncTransports`、`navigation`、`toolbar` 四个宿主服务，并接上 `pagehide` |
| `useSessionSnapshot()`、`claimFirst(group)` | 会话快照（`session` 服务的订阅），与“同一组中第一个实例拥有”的判断，会话与课堂插件共用 |
| `currentLocale()` | 组件之外的界面语言，按 `CATALOG[currentLocale()]` 取文本 |

**共享状态。** `createSharedStates(deck)` 返回适配器的 `useSharedState` 实现与同步传输的接入点（`transports.add`，`syncTransports` 服务把每个传输交给它），`deck` 是文稿标题。两种形态的宿主适配都用它，跨窗口、跨设备的状态只有这一套实现：

- `local` 与 `remote` 状态经 `joinWindows` 在本机的窗口之间传递。BroadcastChannel 只送达加入之后的变化，所以新窗口加入时向其他窗口询问，状态改变过的窗口回答，中途打开的演讲者窗口因此从当前状态开始。
- BroadcastChannel 对同源的全部页面可见。`joinWindows` 用 `deckChannel(name)` 给通道名加上文稿的基础路径（Vite 的 `import.meta.env.BASE_URL`，两种形态都由 Vite 构建），通道名形如 `presmium.shared:<文稿标题>:local:<key> @ /web/`，同一站点上同名的两份文稿因此不会串。同一文稿的网页与幻灯片基础路径不同，本机窗口之间的状态也不互通。IR 运行时的放映位置同样经 `deckChannel` 与 `joinWindows` 在窗口之间传递；视图插件的共享状态（例如舞台插件的黑屏）用 `useSharedState`，在两种形态中都是 `remote` 状态，课堂中会到达学员的设备。
- `remote` 状态另是名为 `presmium.shared:<文稿标题>:remote:<key>` 的同步通道，由每个同步传输接入（例如课堂）。两种形态的通道名相同，课堂中幻灯片与网页的设备共享同一份状态。
- 变化按到达的顺序生效并立即发布：来自其他窗口或设备的变化在本窗口生效，以 `fromRemote` 发布，传输不会再把它发出去；紧接着的本地变化照常作为本地变化发布。

幻灯片形态（`addon-core`）用 `createSharedStates`，不用 Slidev 的 `createSyncState`：后者忽略在本地变化的同一个任务中到达的远端值，又把同一个任务中紧跟在远端值之后的本地变化当作远端变化发布，传输因此不把它发出去。

**课堂的写入规则。** 课堂的共享集合（`ClassroomStore`，契约中的 JSDoc 写明同样的规则）由课堂服务端把关：主讲可以写任何条目；学员只能写自己的条目，键中含有自己的参与者 ID（如 `<测验>:<参与者>`、`<参与者>:<提问>`），值是在 `participant` 或 `author` 字段中写明自己的对象；`quizzes` 集合只有主讲能写。服务端只接受能完整并入房间文档的更新：更新依赖服务端没有的内容、删除集超出房间已有的内容，或违反上述规则时，整个更新被拒绝，服务端以应用定义的关闭码关闭该连接，会话插件丢弃本地文档并用新文档重连，提示学员这次写入被拒绝，被拒的写入不会在之后的写入中残留。Yjs 的结构以客户端 ID 与时钟标识，所以一个客户端 ID 属于最先写入它的结构的一方（主讲的各窗口算一方，每个参与者各算一方），在参与者名单中最先声明某个客户端 ID 的连接，也让该 ID 属于自己一方；归属在房间存在期间一直保留，连接断开后也不变（主讲还没写入就短暂断线，重连前学员也不能用它的客户端 ID 写入或出现在名单中）：学员的更新含有别人的客户端的结构（例如主讲下一个时钟的结构）时被拒绝，否则主讲随后对这个时钟的真实写入会被每份文档当作重复而忽略。`put` 不报告失败，所以存放学员数据的插件必须给数据这样的形状，读取集合时也先按类型守卫过滤（学员可能写入形状不对的值）。参与者名单（awareness）同样校验：一个连接只能声明自己的参与者，学员不能自称主讲。

**覆盖视图的控制条。** 网页形态的放映与演讲者视图挂载时在 `<html>` 上设置 CSS 变量 `--pm-overlay-bar`（视图控制条的高度，像素），卸载时移除。插件固定在页面上的元素用它避开控制条，例如课堂徽章的 `bottom: calc(var(--pm-overlay-bar, 0px) + 1rem)`；没有覆盖视图时（以及幻灯片形态）变量不存在，取默认值。

### 4.5 公共服务令牌

| 令牌 | 提供方 | 使用方 |
|---|---|---|
| `presmium.executor` | 代码执行：浏览器中的 Pyodide（Python）与脚本 Worker（JavaScript、TypeScript），两种形态的开发服务器下的本地容器；由路由按语言与优先级选择。每个执行器都按 `RunRequest` 的约定运行：`files` 写在程序的工作目录中，`args` 成为变量，`stdin` 是程序的标准输入；浏览器中的 Python 每次运行有自己的工作目录，运行改动的解释器状态（递归限制、`sys.path`、新导入的模块、内置函数）在运行后恢复 | 代码块的现场执行、执行面板、课堂（练习校验） |
| `presmium.session` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.classroomStore` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.presenterPanels` | 宿主适配（两种形态；网页形态在放映视图的演讲者窗口中显示） | 需要演讲者面板的插件 |
| `presmium.syncTransports` | 宿主适配（两种形态：`remote` 共享状态；幻灯片形态另有 Slidev 经 `addSyncMethod` 同步的导航与圈画） | 会话（课堂的网络传输） |
| `presmium.navigation` | 宿主适配（两种形态） | 会话（读取与设置位置：章节、步骤、视图） |
| `presmium.toolbar` | 宿主适配（两种形态，由 `PmToolbar` 显示） | 需要工具栏入口的插件（如会话状态） |

内核契约中的令牌（`executor`、`session`、`classroomStore`、`presenterPanels`）定义在 `packages/kernel/src/contracts.ts`；宿主层的令牌（`syncTransports`、`navigation`、`toolbar`）定义在 `packages/host/src/types.ts`。服务替换时，提供方与使用方都不需要改动。

`executor`、`session`、`classroomStore` 的接口（`RunRequest`、`SessionService`、`Role` 等）是业务契约。它们放在内核包中是有意的：提供方与使用方是不同的插件，插件之间不互相引用（第 3 节），契约只能放在双方都依赖的共享内核中。内核的运行时（服务注册、启动、锚点、检查）不使用这些概念。见第 9.2 节。

## 5. 插件约定

### 5.1 浏览器端注册

插件包在浏览器端有三个约定入口。网页与幻灯片两个宿主都从这里注册，插件不必为两种形态各写一份：

| 入口 | 内容 | 幻灯片形态 | 网页形态 |
|---|---|---|---|
| `src/client/plugin.ts` | 默认导出内核插件定义 `PluginDefinition`：提供的服务与启动时的初始化 | 插件包的 `setup/main.ts` 导入它，调用 `registerPresmiumPlugin`（`@presmium/host`） | `web` 渲染端导入 `plugins` 中每个包的这个文件并注册 |
| `components/*.vue` | 组件，文件名即组件名，对应 `component` 节点的 `name` | Slidev 自动注册 | `web` 渲染端按文件名注册到 IR 运行时；文稿自己的 `components/` 覆盖同名组件 |
| `./presmium` 的 `vitePlugins` | 开发服务器的端点等 Vite 插件（4.2 节） | 幻灯片渲染端生成的 Slidev 项目不加入它们，插件包用 Slidev 的 `setup/vite-plugins.ts` 注册（薄适配） | `web` 渲染端在 VitePress 的开发与构建中加入 |

文稿自己的组件：文稿目录下的 `components/*.vue` 由编译器以插件 ID `deck` 登记（与网页的规则相同），`{component}` 可以使用它们，`presmium check` 与编辑器不再报告“没有插件注册该组件”，补全中也有它们；幻灯片渲染端把这个目录链接到生成的 Slidev 项目的 `components/`（Slidev 文档化的目录），组件在幻灯片中照常渲染并保留内部步骤。这些组件同插件组件一样只能引用 `@presmium/host`、`@presmium/kernel` 与 vue；文稿目录要能解析 `@presmium/host`，所以文稿的 `package.json` 要依赖它（否则网页构建报 Rollup 无法解析）。
| `src/client/viewer.ts` | 默认导出视图插件 `ViewerPlugin`（类型来自 `@presmium/viewer`） | 不使用 | `web` 渲染端在 IR 运行时启动前调用一次 |

宿主适配在应用初始化时启动内核：按依赖顺序初始化全部已注册的插件，启动报告在演讲者视图中显示。两种形态注册的是同一批插件，启动报告一致。没有浏览器端服务的插件可以不提供 `plugin.ts`。

视图插件是一个函数 `(ctx) => void`，`ctx` 提供：

| 成员 | 作用 |
|---|---|
| `registerView({ id, label, kind, component, hidden? })` | 注册运行时视图（`ir.md` 8.2 节）。`kind: 'page'` 的视图在页面正文中渲染本页的章节，组件得到属性 `sections`；`'overlay'` 的视图覆盖全屏、贯穿全文；`hidden` 的视图不出现在视图菜单中。同一 ID 后注册的替换先注册的 |
| `registerNodeRenderer(key, component)` | 为一类块注册渲染器。`key` 为节点类型（`markdown`、`code`、`component`）、`code:<语言>` 或组件名；渲染器得到属性 `block`、`section`、`step` |
| `registerComponent(name, component)` | 注册渲染 `component` 节点的 Vue 组件，用于 `components/` 约定之外的组件 |
| `registerAction({ id, keys, run, views? })` | 注册按键动作：`keys` 为 `KeyboardEvent.key` 的值（不含 Ctrl、Alt、Meta），`run(viewer)` 返回 `false` 时按键交给其他处理；`views` 默认是放映视图与演讲者窗口。例如舞台插件的 `b`、`f` |
| `registerLayer({ id, component, views? })` | 注册画在覆盖视图之上的图层，组件得到属性 `view`；`views` 默认同上。例如舞台插件的黑屏 |
| `useViewer()` | 在组件的 `setup` 中取得运行时状态：文档、当前视图与位置 |
| `SectionView`、`BlockView` | 组成视图的构件：一个章节（含版式），一个块在某一步的状态 |

视图插件抛错时只记录错误并跳过它，其余插件照常安装。视图与渲染器同插件组件一样，只依赖 `@presmium/host`、`@presmium/kernel` 与 vue；`@presmium/viewer` 只引用类型。

幻灯片形态不运行视图插件；组件写进 Slidev 文稿的方式由 Node 端的 `rendererExtensions.slides` 决定（4.2 节），没有扩展时生成组件标签。

### 5.2 配置

插件配置有三个作用域，键都是插件 ID：

| 作用域 | 写法 | 读取 |
|---|---|---|
| 全局 | 文稿头部 `presmium: { <插件 ID>: {...} }` | `PluginContext.config`，指令与编译步骤上下文的 `config` |
| 章节 | 章节内的 `{config}` 指令，正文为 YAML，键为插件 ID | 编译器存为 `IRSection.config`；在该章节的指令与编译步骤上下文中合并在全局配置之上；浏览器端用 `useSectionConfig(<插件 ID>)` 读取合并后的配置 |
| 单个节点 | 指令选项或组件属性 | 组件属性 |

````md
(exec-slow)=
## 一个慢的例子

```{config}
presmium.exec: { timeoutMs: 30000 }
```
````

官方插件中读取章节配置的选项：执行插件的 `presmium.exec.timeoutMs`（上例中这一节的代码在编译时与浏览器中运行的超时；指令的 `:timeout:` 优先），代码引用插件的 `presmium.code.repo`（这一节 `{code-ref}` 的永久链接所用的仓库）。插件的其他选项只读全局配置。

幻灯片渲染端把章节配置写入该页 frontmatter 的 `presmium` 键。封面例外：封面页的 frontmatter 就是 Slidev 文稿的头部，其中的 `presmium` 已是全局配置，所以封面章节自己的配置写在 `presmiumSection` 键。幻灯片宿主依次合并全局配置、该页的 `presmium` 与 `presmiumSection`；网页宿主从当前章节的 IR 读取。

### 5.3 步骤可逆

插件组件的视觉状态必须是步骤的纯函数。组件在模板中用 `v-click` 标记向 Slidev 登记步骤，用 `useStepState` 读取状态。网页形态中 `v-click` 由兼容层处理：文档式直接显示，滚动叙事式随滚动显示。

本地步骤：宿主以全部展开的最终状态渲染组件时（文档视图，`useHost().useStep()` 为无穷大），有内部步骤的组件可以给读者一个自己的步进控件，例如分步执行的上一步、下一步与滑块。读者选的本地步骤与执行结果一样是读者的输入，不写回宿主的步骤；组件的视觉状态是（章节步骤，本地步骤）的纯函数，仍然可逆。滚动叙事中没有讲解的步骤（组件的内部步骤）每步只占四分之一屏，读者不必滚过大片空白。

### 5.4 错误隔离

渲染端隔离组件：网页的 IR 运行时与幻灯片渲染端都在每个插件组件外面包一层 `PmBoundary`（幻灯片中包括扩展的输出与 `PmStaticFallback`），组件自己的 `setup` 或模板抛错也只影响它自己：显示占位与错误信息，演讲者视图的错误计数同时提示，页面其余内容照常渲染。组件不在自己的模板中再包 `PmBoundary`（Vue 的 `errorCaptured` 只接住后代的错误，自包装接不住组件自身的错误）。IR 运行时按组件的属性与子块给边界一个 `resetKey`，作者修好组件后不刷新页面即恢复。幻灯片渲染端的组件扩展抛错时，在块的位置报告警告，改为写组件标签或 `fallback`。

### 5.5 减少动态效果

所有动画读取 `usePrefersReducedMotion()`，开启时直接显示终态。

### 5.6 媒介限定与排版提示

只出现在部分媒介中的内容用 `{only}` 指令声明（`ir.md` 2.5 节），例如 `:::{only} web, notebook`。编译器把限定写入块的 `only` 字段，每个渲染端只收到属于自己的块。各渲染端的排版提示用 `{hints}` 声明。早期的 `<div doc-only>`、`<div slide-only>` 标记已不再使用。

### 5.7 界面语言

N-07 要求界面文本有中文与英文：

- 文稿的语言只由头部的 `lang` 声明，例如 `lang: en-US`，默认 `zh-CN`。编译器总是把它写入 IR 的 `meta.lang`，两种形态都据此设置 `<html lang>`：幻灯片渲染端写入 Slidev 头部的 `htmlAttrs`，网页渲染端设置站点语言。渲染端的配置不能另设语言。
- 浏览器中的界面语言为 `'zh-CN'` 或 `'en'`：`<html lang>` 以 `zh` 开头时为中文，以 `en` 开头时为英文；其他语言（如 `fr`）看 `navigator.language`，仍无法确定时为英文。各包一律经 `@presmium/host` 取语言：组件中用 `useMessages(CATALOG)`，组件之外用 `CATALOG[currentLocale()]`，`CATALOG` 是包自己的 `{ 'zh-CN': …, en: … }`。只有 `@presmium/host` 跟随 `<html lang>` 的变化（Slidev 在应用启动之后才写入 `htmlAttrs`），各包不自己判断语言，也不各自观察 `<html lang>`。
- 每个包维护自己的 zh-CN 与 en 文本，文件位置由包自定（例如 `src/domain/messages.ts` 或 `src/client/messages.ts`）。
- 开发服务器的端点（如本地环境插件的端点）按请求的 `Accept-Language` 回答，浏览器端在请求中带上界面语言。
- 编译时写入产物的文本按文稿的语言：指令、编译步骤与渲染上下文都带 `lang`，`deckLocale(lang)`（`@presmium/kernel`）给出 `'zh-CN'` 或 `'en'`（没有对应文本的语言为英文），例如 notebook 中指向网页版的说明、练习单元格的标签、导出环境中的说明文件、聚光灯的降级文字。编译时执行器写入录制输出的消息（例如超时）与解释器自身的报错一样为英文，也不含构建机器的路径。
- 框架自身的界面文字：网页渲染端按文稿语言设置 VitePress 文档列出的全部主题标签（`themeConfig` 的大纲、目录、翻页、明暗切换、回到顶部、跳到正文、侧栏菜单等标签与本地搜索的 `translations`）以及 404 页。VitePress 默认主题中不在 `themeConfig` 里的两个屏幕阅读器标签（侧栏的 “Sidebar Navigation”、上下章链接的 “Pager”）由网页主题在页面渲染后按文稿语言改写（9.1 节）。其他没有公开配置接口的文字保持框架的英文：幻灯片形态中 Slidev 自己的界面（导航栏按钮的提示、演讲者视图、绘图工具与设置菜单）只有英文。N-07 的“界面文本”指 Presmium 自己的界面，不含这些文字。

### 5.8 静态导出

PDF、PNG 等静态导出中，插件组件显示 IR 的 `fallback`，不显示交互界面：幻灯片宿主在打印模式（`useStaticRender()` 为 true）下把带 `fallback` 的组件换成降级内容。插件负责让降级内容完整：执行面板的降级内容是先给参数赋值的代码，加上编译时的输出（构建时没有执行、执行失败或超时的用 `:recorded:` 的录制输出），由执行插件在编译时执行之后的步骤（`after: 'execute'`）写入。notebook 渲染端有自己的扩展时用扩展，否则使用 `fallback`（`ir.md` 第 6 节）。

### 5.9 浮层组件与组件拥有的代码

在页面上绘制在其他内容之上、自身不占版面的组件（例如引导的光标），由指令把组件节点标为 `layer: 'overlay'`。渲染端不给它单独的位置：网页的文档视图把浮层块放在板书之外，不会出现空卡片，服务端渲染与首帧的版面也不跳动；幻灯片渲染端不给没有降级内容的浮层组件写空的 `PmStaticFallback`。

组件拥有的代码：组件的子块中的代码块（例如执行面板、分步执行、本地环境包着的代码）属于组件。两种形态都不给它们运行控件，也不显示它们的录制输出：网页由 IR 运行时实现，幻灯片渲染端把它们写成组件插槽中的普通代码块（照常做语言映射）。组件运行的代码由指令放在组件的属性中（如执行面板的 `code`），不从渲染后的 DOM 读回。

## 6. 示例文稿约定

示例文稿 `examples/demo` 是一份面向初学者的完整讲义“BPE 分词：从字节到词元”：入口 `lecture.md`（MyST）写头部与封面，各章在 `pages/` 下（`tokens.md`、`idea.md`、`implement.md`、`encode.md`、`wrapup.md`），引用的代码在 `examples/sample-repo/src/bpe.py`。讲义中不出现插件 ID、内部机制这类调试性文字。

插件的功能性演示不放在示例讲义中：每组功能有自己的测试文稿 `e2e/fixtures/<组>/`，端到端用例在 `beforeAll` 中构建它们（7 节）；示例讲义只由冒烟用例 `e2e/smoke.spec.ts` 使用（三种媒介都能无警告地构建，网页与幻灯片都能打开并翻页）。构建产物位于 `examples/demo/dist/<渲染端 ID>/`。`lang` 是文稿的语言，决定两种形态的界面语言（5.7 节）。示例文稿的 `.presmium/` 中只提交执行缓存 `freeze/` 与锚点锁定文件（4.3 节）。

## 7. 测试策略

只写集成测试，不写单元测试：测试在真实组装的系统上运行，不对单个函数做隔离测试，不用 mock 替代宿主框架。每条验收标准对应一到两个用例。

| 层级 | 工具 | 范围 | 命令 |
|---|---|---|---|
| 结构检查 | `scripts/check-layering.mjs`、`scripts/check-skills.mjs`、`scripts/check-plugins.mjs` | 第 3 节的分层规则；技能与代码一致（指令、命令及其选项）；每个 Node 插件声明 `version` 与当前内核满足的 `kernel` 范围（4.2 节） | `pnpm test` |
| 集成 | Vitest | 真实运行 CLI、构建产物检查、服务端（`packages/<pkg>/test/`）；运行 `slidev export` 的用例是单独的项目 `export`，在其他用例之后运行 | `pnpm test` |
| 构建 | `presmium build` | 示例文稿编译并生成全部媒介（网页、幻灯片、notebook） | `pnpm demo:build` |
| 检查 | `presmium check` | 示例文稿全部检查项通过 | `pnpm demo:check` |
| 端到端 | Playwright | 构建产物上的行为（`e2e/`）：全部用例在 Chromium 中运行，冒烟用例另在 Firefox 与 WebKit 中运行 | `pnpm e2e` |
| 全部 | | 以上依次执行 | `pnpm verify` |

端到端测试的约定：

- 示例文稿的产物 `dist/` 是一个站点（网页在 `/web/`，幻灯片在 `/slides/`，2.1 节的默认 `base`），服务在 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT`（默认 4173、4174）。同时构建两种形态的测试文稿同样把 `dist/` 作为一个站点服务（`serve(dir, '/slides/')`，`buildFixture` 自动这样做）。并行的检出各用一对端口；端口被占用时报错，不复用别处的服务。幻灯片通过 `/<页号>?clicks=<步骤>` 定位，演讲者视图为 `/presenter/<页号>`。
- 需要专用文稿的用例（宿主适配、另一种界面语言、性能、课堂服务）在 `beforeAll` 中把测试文稿写到 `examples/demo/.presmium/e2e-*`（不入库，插件从示例文稿的依赖中解析），用真实的 `presmium build` 构建，再在空闲端口上服务产物。测试文稿放在 `e2e/fixtures/<组>/`。
- 性能用例（`e2e/perf.spec.ts`，N-01、N-02）是单独的 Playwright 项目，依赖 Chromium 项目，在其他用例结束后运行，计时不与其他用例争用机器。单独运行它要加 `--no-deps`：`pnpm exec playwright test e2e/perf.spec.ts --no-deps`；不加时 Playwright 先运行全部 Chromium 用例。
- 其他浏览器：`PRESMIUM_E2E_BROWSERS` 列出冒烟用例另外运行的浏览器，默认 `firefox,webkit`。没有安装，或在本机无法启动的浏览器（WebKit 需要很多 Linux 主机缺少的系统库）被跳过，并提示安装命令（`pnpm exec playwright install <浏览器>`、`pnpm exec playwright install-deps <浏览器>`）；WebKit 也可以在 Playwright 的 Docker 镜像中运行（`browsers.md`）。真实的 Safari、Edge 与前一个大版本在发布前按 `browsers.md` 手工检查并记录。
- 集成测试分两个 Vitest 项目（`vitest.config.ts`）：`integration` 与 `export`。`export` 是运行 `slidev export` 的三个测试文件（`render-slides/test/slides.test.ts`、`addon-publish/test/export.test.ts`、`diff.test.ts`），在 `integration` 结束后运行：`slidev export` 用 Slidev 的开发服务器服务文稿，等浏览器空闲后打印，机器被其他用例的构建占满时它会在页面就绪前截图或超时。单独运行一组：`pnpm exec vitest run --project export`。
- 集成测试运行 CLI 用 `@presmium/cli/testing` 的 `presmium(cwd, args, env?)`：它去掉 Vitest 设置的 `NODE_ENV=test`，构建与作者、端到端用例在同一模式下运行。端到端的测试文稿与服务用 `e2e/fixtures/deck.ts` 的 `useFixture`、`buildFixture`、`serve`、`startDev`、`openSlide` 等。
- 手工起的静态服务器在重新构建后要重启：sirv 启动时读取一次文件列表，之后新生成的文件（带哈希的 `assets/`）它找不到，页面报 404 或白屏；经常重建时用 `sirv --dev` 启动，它每次请求都查找文件。

辅助命令（插件包与服务包的可执行文件）：

| 命令 | 包 | 选项 | 作用 |
|---|---|---|---|
| `presmium-export [deck]` | `@presmium/slidev-addon-publish` | `--format pdf\|png`、`--output <file>`、`--with-clicks`（每步一页）、`--range <1,3-5>`、`--dark`、`--wait <ms>`（打印页加载后再等待的时间，默认 1000）、`--timeout <ms>`（打印页的加载时限，默认 120000）、`--json` | 准备幻灯片渲染端的 Slidev 文稿（不完整构建）后运行 `slidev export`（`--wait-until networkidle`）；`slidev export` 在根路径服务文稿，所以文稿按 `base` 为 `/` 准备（`prepare` 的 `base` 选项），不论幻灯片构建时的站点路径。`slidev export` 在打印页还没显示全部幻灯片时截图也以 0 退出（机器繁忙，或文稿第一次导出时 Vite 优化依赖并重新加载页面）：导出缺少某张幻灯片的页（PNG 中没有它的图片，PDF 的页数少于幻灯片数）时报错退出（退出码 2）并提示加大 `--wait`。每张幻灯片的页数按 Slidev 的点击数，不按 IR 的步骤数（导出中组件显示静态的 `fallback`，没有自己的步骤）。PDF 导出后检查每个链接仍是链接（PNG 报告链接无法检查） |
| `presmium-diff <refA> <refB> [deck]` | 同上 | `--out <dir>`、`--threshold <ratio>`、`--wait <ms>`、`--install`、`--json` | 两个提交的视觉差异：幻灯片逐页，网页逐页（文档视图）与逐节（放映视图）截图比较，报告写在 `.presmium/diff/` |
| `presmium-classroom-server` | `@presmium/classroom-server` | `--port <n>`（默认 1234，`0` 取空闲端口）、`--host <address>`（默认全部网卡）、`--deck <dir>`（归档写到 `<dir>/.presmium/classroom/`） | 课堂服务（y-websocket）；启动后打印服务地址与局域网地址 |
| `presmium-language-server` | `@presmium/language-server` | `--stdio`、`--node-ipc`、`--socket=<port>` | 语言服务，VS Code 扩展启动它 |

## 8. 需求覆盖

“验证”一栏给出验收用例所在的文件：`e2e/` 下为端到端用例，其余为 `packages/` 下的集成用例。

| 需求 | 包 | 验证 |
|---|---|---|
| K-01 文稿源码模型 | compiler | `cli/test/ir.test.ts`、`cli/test/build.test.ts`（章节 ID、源码位置、`{include}`） |
| K-02 语法扩展点 | compiler、各插件 | 插件指令的集成用例（如 `addon-exec/test/compile.test.ts`）与端到端用例 |
| K-03 渲染管线 | viewer、render-slides | `e2e/web.spec.ts`（示例文稿的每个插件组件在网页中渲染）、`e2e/content.spec.ts`（Web 组件） |
| K-04 步骤时间轴 | host、addon-core、viewer | `e2e/core.spec.ts`（跳到第 N 步与顺序前进的 DOM 一致）、`e2e/exec.spec.ts`、`e2e/guide.spec.ts` |
| K-05 视图 | addon-core、viewer | `e2e/core.spec.ts`（演讲者面板只在演讲者视图出现）、`e2e/viewer.spec.ts`（放映视图与演讲者窗口） |
| K-06 状态与事件 | host、addon-core、web、addon-session | `e2e/session.spec.ts`（两种形态的跨设备跟随）、`e2e/web.spec.ts` 与 `e2e/core.spec.ts`（网页与幻灯片形态的 `useSharedState`：跨窗口与后开的窗口，`remote` 经同步传输往返；幻灯片形态中本地变化与远端值在同一个任务中先后到达时按顺序生效；同源同名、基础路径不同的文稿不共享窗口通道） |
| K-07 插件宿主 | kernel、host、addon-core、web、compiler | `e2e/core.spec.ts`、`e2e/web.spec.ts`（启动报告、降级、出错组件的隔离、章节配置、生命周期）、`scripts/check-plugins.mjs`（Node 插件声明内核范围） |
| K-08 服务注册 | kernel | `e2e/core.spec.ts`（依赖方拿到提供方的实现；缺少必需服务的插件被禁用） |
| K-09 工作区访问 | compiler、addon-exec-local、addon-stage | `e2e/viewer.spec.ts`（`presmium dev` 跟随读取过的文件）、`addon-exec-local/test/local-env.test.ts`（两种形态的开发服务器端点）、`addon-stage/test/drawings.test.ts`（标注写回） |
| K-10 锚点接口 | kernel、addon-code | `addon-code/test/check.test.ts`、`cli/test/check.test.ts` |
| K-11 实时预览 | compiler、cli、viewer | `e2e/viewer.spec.ts`（300 ms 内更新，保持视图、步骤与滚动位置） |
| K-12 构建与导出 | render-slides、addon-publish | `addon-publish/test/export.test.ts`（按步骤导出 PDF，保留链接）、`render-slides/test/slides.test.ts`（静态导出显示降级内容） |
| K-13 可复现性 | 全部 | `cli/test/build.test.ts`（在不同目录构建的产物一致）、`addon-exec-local/test/local-env.test.ts`（产物不含工作区的本机路径）、`addon-exec/test/compile.test.ts`（没有运行环境时使用已提交的缓存） |
| K-14 主题与布局 | render-slides、web | `e2e/stage.spec.ts`、`e2e/web.spec.ts` |
| K-15 输入映射 | addon-stage | `e2e/stage.spec.ts`（`b`、`f` 快捷键） |
| K-16 诊断与检查 | cli | `cli/test/check.test.ts`（失效锚点使退出码非零，诊断带源码位置） |
| K-17 中间表示 | kernel、compiler | `cli/test/ir.test.ts`（schema 校验、重复编译一致） |
| K-18 可插拔渲染端 | compiler、render-notebook | `cli/test/build.test.ts`、`render-notebook/test/notebook.test.ts`（MyST 节点写成 Jupyter 能显示的 Markdown，无法转换的节点列入构建报告） |
| K-19 编译时执行与缓存 | compiler、addon-exec | `addon-exec/test/compile.test.ts` |
| K-20 运行时视图 | viewer | `e2e/viewer.spec.ts` |
| N-01 启动性能 | 全部 | `e2e/perf.spec.ts`（100 个章节的文稿：首张幻灯片、网页的第一个章节与放映视图在 2 s 内可见） |
| N-02 翻页性能 | 全部 | `e2e/perf.spec.ts`（幻灯片的点击与翻页、网页放映视图的一步在 100 ms 内渲染） |
| N-03 离线 | addon-publish、web | `e2e/publish.spec.ts`、`e2e/web.spec.ts`（断网后放映与搜索）、`addon-publish/test/offline.test.ts`、`web/test/offline.test.ts` |
| N-04 浏览器 | — | 全部端到端用例在 Chromium 中运行，`e2e/smoke.spec.ts` 另在 Firefox 与 WebKit 中运行（WebKit 无法在本机启动时在 Playwright 的 Docker 镜像中运行）；WebKit 的全量运行结果与 Safari、Edge 的手工检查见 `browsers.md` |
| N-05 显示 | web、viewer | `e2e/web.spec.ts`（手机视口无横向滚动） |
| N-06 无障碍基线 | host、addon-guide、addon-publish、web | `e2e/core.spec.ts`、`e2e/guide.spec.ts`（减少动态效果、键盘操作）、`e2e/publish.spec.ts`（高对比度达到 WCAG AA）、`e2e/web.spec.ts`（字号缩放） |
| N-07 界面语言 | 全部 | en-US 测试文稿上的英文界面：`e2e/core.spec.ts`、`e2e/web.spec.ts`（`e2e/fixtures/core/deck`：`<html lang>`、启动报告、两种形态的外壳与互相链接）、`e2e/viewer.spec.ts`（`e2e/fixtures/viewer/en`：放映视图、演讲者窗口、黑屏与代码块控件）、`e2e/classroom.spec.ts`“an English deck”（会话面板、加入表单与测验）、`e2e/exec.spec.ts`（`e2e/fixtures/exec/english`，`lang: fr`，Presmium 没有对应文本的语言：执行面板、本地环境、高对比度开关随浏览器为英文）；开发服务器端点的回答与导出环境的说明文件见 `addon-exec-local/test/local-env.test.ts` |
| P-01 至 P-04 | addon-stage | `e2e/stage.spec.ts` |
| P-10 至 P-16 | addon-code | `addon-code/test/check.test.ts`、`e2e/code.spec.ts`（两种形态） |
| P-20、P-21、P-23、P-24 | addon-exec | `e2e/exec.spec.ts`（Python、JavaScript、TypeScript，两种形态；定时器稍后的输出与稍后的 Promise 拒绝在编译时与浏览器中一致；浏览器中的运行互不影响；放映视图与手机上的版面；文档视图中分步执行的步进控件）、`addon-exec/test/compile.test.ts`（编译时执行；章节配置的超时；失败或超时的运行显示预录输出；执行面板的降级内容含参数与编译时输出；任意语言的执行面板生成幻灯片） |
| P-22、P-25、P-26 | addon-exec-local | `addon-exec-local/test/local-env.test.ts`（没有 Docker 时跳过容器用例；容器中的请求带文件与参数；镜像构建超时后下一次重新构建；一份文稿一个工作区）、`e2e/exec-local.spec.ts`；P-25 的编辑回写端点已移出范围（WP-44） |
| P-30 至 P-32 | addon-guide | `e2e/guide.spec.ts` |
| P-40 至 P-43 | addon-content | `e2e/content.spec.ts`（两种形态） |
| P-50 | addon-publish | `addon-publish/test/export.test.ts`（`{code-ref}` 生成的永久链接在每个步骤页上都是链接） |
| P-51 | addon-publish | `addon-publish/test/offline.test.ts`、`e2e/publish.spec.ts` |
| P-52 | addon-publish | `e2e/publish.spec.ts`（每个页面的工具栏开关、每张幻灯片达到 AA） |
| P-53 | addon-publish | `addon-publish/test/diff.test.ts`（含 `--install` 的宿主或插件升级回归） |
| P-60 至 P-67 | addon-session、classroom-server、addon-classroom | `e2e/session.spec.ts`、`e2e/classroom.spec.ts`（真实课堂服务，多个浏览器上下文接入同一课堂）、`classroom-server/test/server.test.ts`、`addon-classroom/test/notebook.test.ts` |
| P-70 至 P-74 | web、viewer | `e2e/web.spec.ts`、`e2e/viewer.spec.ts` |
| P-75 | render-notebook、addon-exec | `render-notebook/test/notebook.test.ts`、`render-notebook/test/demo.test.ts`（示例文稿的 notebook 从头到尾运行）、`addon-exec/test/compile.test.ts`（执行面板的单元格带编译时输出或预录输出） |
| P-76 | render-slides | `render-slides/test/slides.test.ts`、幻灯片形态的端到端用例 |
| P-77 | viewer | `e2e/viewer.spec.ts` |
| P-80、P-81 | language-server、vscode | `language-server/test/lsp.test.ts`、`vscode/test/build.test.ts` |

## 9. 已知风险

### 9.1 仍在使用的框架内部接口

下表列出代码仍依赖、而框架文档没有写明的接口，以及升级框架后会暴露变化的用例。升级 Slidev 或 VitePress 时先运行这些用例。

| 内部接口 | 位置 | 守护用例 | 后续 |
|---|---|---|---|
| VitePress 1.6 本地搜索的虚拟模块 `/@localSearchIndex`、`/@localSearchIndexroot`，以及搜索框对索引模块的热更新：开发与构建中都拦截这两个模块，换成网页渲染端从 IR 生成的索引（与 VitePress 同样的 MiniSearch 索引，每个章节一个文档，按文稿顺序加入）。构建中索引因此确定，产物与 Service Worker 的缓存版本在每次构建中相同（VitePress 并发建索引，顺序取决于页面完成的先后）；开发中索引随编辑更新（VitePress 1.6 开发模式只在启动时建索引） | `packages/web/src/node/vite.ts` | `e2e/web.spec.ts`“a Chinese keyword is found within 300 ms”与“search keeps working offline”（构建）、`e2e/viewer.spec.ts`“a keyword written while the server runs can be searched”（开发）、`cli/test/repro.test.ts`（重复构建的字节一致） | VitePress 固定为 1.6.4；VitePress 提供确定的构建索引与开发中的索引更新后移除拦截 |
| Slidev 的根组件钩子 `setup/root.ts`（`defineRootSetup` 只出现在 `@slidev/types` 的类型中，文档没有列出），以及它在全部 `setup/main.ts` 之后运行的顺序：幻灯片形态在这里启动内核，发布插件在这里读取打印模式 | `packages/addon-core/setup/root.ts`、`packages/addon-publish/setup/root.ts` | `e2e/core.spec.ts`（启动报告与服务依赖）、`addon-publish/test/export.test.ts` 与 `diff.test.ts`（打印与视觉差异的样式） | 改用文档化的钩子或全局图层 |
| Slidev 幻灯片内容层的类名 `.slidev-slide-content`：冻结画面复制它的各层 | `packages/addon-stage/global-top.vue` | `e2e/stage.spec.ts`“f freezes the audience view” | 改用全局图层自己的结构 |
| Slidev 演讲者备注的类名 `.slidev-note-with-clicks`、`.slidev-note-fade`：突出当前步骤的备注 | `packages/addon-stage/style.css` | `e2e/stage.spec.ts`“presenter notes highlight the current step” | 没有文档化的替代，由用例守护 |
| Slidev 绘图的状态 `drawingState`（`@slidev/client` 导出，形状为页号到该页 SVG 的映射，文档没有描述）与开发服务器保存标注的文件名 `<页号>.svg`：舞台插件把标注写回文稿的 `.presmium/drawings/`，删除一页的全部标注时删去该文件 | `packages/addon-stage/setup/main.ts`、`packages/addon-stage/setup/vite-plugins.ts` | `addon-stage/test/drawings.test.ts` | Slidev 提供写回标注的钩子后改用 |
| VitePress 默认主题给侧栏与上下章链接的屏幕阅读器标签的元素 ID `sidebar-aria-label`、`doc-footer-aria-label`（主题配置没有这两个标签）：网页主题在页面渲染后与每次换页后按文稿语言改写它们的文字（5.7 节） | `packages/web/src/client/theme.ts` | `e2e/web.spec.ts`“a zh-CN deck speaks Chinese around the content” | VitePress 提供对应的主题配置后改用 |
| VitePress 默认主题的内部 DOM（文档只给出 CSS 变量、布局插槽与主题配置）：网页样式中导航栏标题的 `.VPNavBar .container > .title`、`.VPNavBarTitle a.title > span`（长标题换行而不压住导航），侧栏一级条目的 `.VPSidebarItem.level-1 > .item .text`（章的字重）。能改用 CSS 变量、布局插槽或侧栏项的 `class` 的选择器已经改掉，这里列出的是保留的 | `packages/web/src/client/style.css` | `e2e/web.spec.ts` 的长标题用例与侧栏字重的断言 | VitePress 提供对应的 CSS 变量或插槽后改用 |

已经去掉的依赖：高对比度主题原先按 Slidev 的类名 `.slidev-code-dishonored` 提高被代码步骤淡化的行的不透明度。现在发布插件读取代码行（Shiki 输出的 `.line`）的计算不透明度，给低于 0.6 的行加上自己的 `data-pm-dimmed` 属性（`packages/addon-publish/src/client/code-lines.ts`），由 `e2e/publish.spec.ts`“every slide reaches WCAG AA”守护。

### 9.2 设计取舍与扩展点缺口

以下取舍留给 WP-72，与 v0.7 的设计一起处理。

| 事项 | 现状与理由 | 计划 |
|---|---|---|
| 共享内核中的业务契约 | `@presmium/kernel` 除元能力外还定义了几个插件共用的业务服务契约：`EXECUTOR` 与 `RunRequest`、`SessionService`、`Role`、`ClassroomStore`，以及代码节点的 `run` 与 `outputs`。这是 4.5 节有意的选择：服务的提供方与使用方分属不同插件，契约只能放在双方都依赖的包中；设计原则 2 已据此修订 | 契约稳定后可以移到单独的契约包，内核只保留元能力 |
| 网页的 Service Worker 手写 | 网页渲染端在 VitePress 构建完成后生成约 70 行的 Service Worker（`packages/web/src/node/offline.ts`）：此时页面、搜索索引与 Pyodide 运行时都已写出，按产物内容计算缓存版本，并把无扩展名的页面地址对应到 `.html`。`vite-plugin-pwa` 只用于幻灯片形态：VitePress 在 Vite 客户端构建之后才渲染 HTML 页面，在 Vite 构建中生成的预缓存清单拿不到这些页面，需要专门的 `@vite-pwa/vitepress` 集成 | 评估 `@vite-pwa/vitepress`；接入后删除手写的 Service Worker |
| 网页按插件 ID 读取发布插件的配置 | `packages/web/src/domain/config.ts` 读取 `presmium.publish` 的 `offline` 决定是否生成 Service Worker：网页渲染端因此知道一个插件的配置键 | 增加渲染端扩展点，让插件参与网页构建 |
| 幻灯片形态中的现场执行代码块 | 带 `:run: live` 或 `:run: both` 的普通代码块在网页形态中有运行按钮；幻灯片渲染端把它写成普通代码块，没有运行按钮，只有执行面板能在幻灯片中运行代码。`setup/code-runners.ts` 已经通过 `executor` 服务支持 Slidev 的 Monaco Runner（Python、JavaScript、TypeScript），但 MyST 源码无法写出 `{monaco-run}` | 幻灯片渲染端把带 `run` 的代码块写成 `{monaco-run}`，或写成执行插件的运行组件 |
| 课堂笔记依赖 IR 运行时的标记 | 课堂插件的笔记图层按 `.pm-section[data-section]`、`.pm-block[data-block]` 定位章节与块。这两个属性因此是 IR 运行时对外的契约，修改时须同时修改笔记图层 | 在视图插件接口中提供块旁的挂载点 |
| 首选执行器 | 代码块的 `:executor:` 在浏览器中只是首选：指定的执行器没有注册或不支持该语言时，由路由按语言与优先级另选 | WP-73：`RunRequest.executor` 精确匹配，指定的执行器不可用时返回失败，由 P-24 显示录制输出，不回退到其他执行器（`:env:` 依赖它） |
| 本地环境的 Python 运行器 | 容器执行器在容器中运行自己的 Python 运行器（`packages/addon-exec-local/src/node/runner.py`），按 `RunRequest` 的约定处理参数、标准输入与文件，与执行插件的运行器（`packages/addon-exec/src/runner.py`）规则相同。两个插件包不互相引用（第 3 节），所以各有一份 | 把运行器作为共享内核的资源发布，两个插件共用 |

### 9.3 框架的已知问题

| 问题 | 来源 | 影响与处理 | 守护用例 |
|---|---|---|---|
| 幻灯片形态的控制台报 “Failed to patch FloatingVue: TypeError: Cannot read properties of undefined (reading 'Popper')”：构建产物（`presmium build` 生成的 `dist/slides`）与 Slidev 的开发服务器（`presmium dev --to slides`、`slidev export` 与 `presmium-export`）中都出现，每次打开页面一条 | Slidev 53 的 `setup/main.ts` 在每份文稿中安装 `@shikijs/vitepress-twoslash` 4.5 的 Twoslash 弹出层；它对 floating-vue 菜单组件的补丁按旧的组件结构查找 `components.Popper`，而 Slidev 依赖的 floating-vue 5.4 的菜单组件已没有这个结构（三者都是 npm 上的最新版本） | 只影响在 Twoslash 弹出层上拖动时不弹出，生成的文稿不含 Twoslash 代码；错误被它自己捕获并打印，不影响页面。不打补丁，等上游修复 | `e2e/smoke.spec.ts`“the slides open … with no error in the console”：控制台没有其他错误 |
| 测试中的幻灯片控制台报 “Wake Lock permission request denied” | Slidev 的 `wakeLock` 选项（默认开启）在放映时请求屏幕常亮，Playwright 驱动的浏览器拒绝请求 | 被拒绝时只多这一条错误，页面照常；讲者的浏览器允许时屏幕在放映中保持常亮，所以不关闭该选项 | 同上 |

