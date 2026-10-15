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
│   ├── cli/                 @presmium/cli                       presmium build | dev | ir | check
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
├── e2e/                     Playwright 测试，每个上下文一个 spec
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
| `src/domain/` | `@presmium/kernel`、纯计算库 | vue、`@slidev/*`、vitepress、`@presmium/host`、Node 内置模块（`node:fs` 与 `fs` 都算）、`src/domain/` 之外的相对路径 |
| `components/`、`src/client/` | `src/domain/`、`@presmium/kernel`、`@presmium/host`、vue | `@slidev/*`、vitepress |
| `setup/`、全局图层 | 以上全部，加 `@slidev/client` 公开导出与 `@slidev/types` | vitepress |
| `src/node/` | `src/domain/`、`@presmium/kernel`、Node 库 | vue |

此外：只有 `addon-core` 可以在组件与 `src/client/` 中使用 `@slidev/client`，这两处不用 `@slidev/*` 的其他包；只有 `web` 可以使用 vitepress；插件包之间不互相引用（不引用 `@presmium/slidev-addon-*`，相对路径不离开本包），共用的契约放在 `@presmium/kernel` 或 `@presmium/host`。`scripts/check-layering.mjs` 检查以上全部规则，静态 `import`、`export ... from`、动态 `import()` 与 `require()` 都算引用。

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

- 指令与编译步骤的上下文提供 `watch(...files)`：声明 `ctx.src`、`ctx.resolvers` 之外读取的文件，`presmium dev` 在它们变化时重新编译（`ir.md` 第 5 节）。
- 组件转换函数为 `(node, block, ctx)`，`ctx` 是所服务渲染端的 `RenderContext`；插件据此得到输出目录与工作目录（例如幻灯片渲染端生成的 Slidev 文稿所在目录），不为此依赖渲染端的包。
- 检查项的 `CheckContext` 带有编译好的 IR（`ir`）。

### 4.3 锚点与检查

- 锚点写作 `scheme:target`，例如 `region:src/a.py#add`、`symbol:src/a.py#Parser.parse`。
- 解析结果为 `exact`、`moved`、`fuzzy`、`lost` 之一；只有前两种可直接渲染，后两种必须产生诊断。
- 指纹记录保存在文稿目录的 `.presmium/anchors.lock.json`，由 `presmium check --update-lock` 生成，随文稿提交。
- 文稿 `.presmium/` 中随文稿提交的还有执行缓存 `freeze/`、本地化的远程图片 `assets/`（如 PlantUML 图，见发布插件）与圈画标注 `drawings/`，新检出的文稿因此构建时不访问远程服务、不重新执行代码（K-13）。渲染端的工作目录（`slides/`、`web/` 等）不提交，根目录的 `.gitignore` 按此配置；新增一个本地化资源后要把它提交。
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
| `PmBoundary` | 错误边界（5.4 节） |
| `PmToolbar`、`PmPresenterPanels` | 宿主显示 `toolbar`、`presenterPanels` 服务内容的位置 |
| `useSectionConfig(pluginId)` | 插件在当前章节的配置：全局配置合并章节的 `{config}`（5.2 节） |
| `useSharedState(key, initial, { scope })` | 插件状态的共享范围：`view` 只在本视图，`local`（默认）在本机所有窗口，`remote` 经 `syncTransports` 跨设备（K-06）。幻灯片形态用 Slidev 的 `createSyncState` 实现，网页形态用 BroadcastChannel 与同步传输端口 |
| `useLocale()`、`useMessages(catalog)` | 界面语言 `'zh-CN'` 或 `'en'`，与按语言选取的文本（5.7 节） |
| `useStaticRender()` | 静态导出（PDF、PNG）时为 true：幻灯片形态取自 Slidev 的打印模式，网页形态恒为 false（5.8 节） |
| `registerPresmiumPlugin`、`startPresmium`、`stopPresmium` | 注册浏览器端插件、启动与停止内核；两个宿主在页面卸载（`pagehide`）与热更新替换时调用 `stopPresmium`，各插件的 `dispose` 因此会执行 |

### 4.5 公共服务令牌

| 令牌 | 提供方 | 使用方 |
|---|---|---|
| `presmium.executor` | 代码执行：浏览器中的 Pyodide（Python）与脚本 Worker（JavaScript、TypeScript），开发服务器下的本地容器；由路由按语言与优先级选择 | 代码块的现场执行、执行面板、课堂（练习校验） |
| `presmium.session` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.classroomStore` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.presenterPanels` | 宿主适配（两种形态；网页形态在放映视图的演讲者窗口中显示） | 需要演讲者面板的插件 |
| `presmium.syncTransports` | 宿主适配（两种形态；只有幻灯片形态有可同步的通道） | 会话（接入 Slidev 的状态同步） |
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
| `src/client/viewer.ts` | 默认导出视图插件 `ViewerPlugin`（类型来自 `@presmium/viewer`） | 不使用 | `web` 渲染端在 IR 运行时启动前调用一次 |

宿主适配在应用初始化时启动内核：按依赖顺序初始化全部已注册的插件，启动报告在演讲者视图中显示。两种形态注册的是同一批插件，启动报告一致。没有浏览器端服务的插件可以不提供 `plugin.ts`。

视图插件是一个函数 `(ctx) => void`，`ctx` 提供：

| 成员 | 作用 |
|---|---|
| `registerView({ id, label, kind, component, hidden? })` | 注册运行时视图（`ir.md` 8.2 节）。`kind: 'page'` 的视图在页面正文中渲染本页的章节，组件得到属性 `sections`；`'overlay'` 的视图覆盖全屏、贯穿全文；`hidden` 的视图不出现在视图菜单中。同一 ID 后注册的替换先注册的 |
| `registerNodeRenderer(key, component)` | 为一类块注册渲染器。`key` 为节点类型（`markdown`、`code`、`component`）、`code:<语言>` 或组件名；渲染器得到属性 `block`、`section`、`step` |
| `registerComponent(name, component)` | 注册渲染 `component` 节点的 Vue 组件，用于 `components/` 约定之外的组件 |
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

幻灯片渲染端把章节配置写入该页 frontmatter 的 `presmium` 键，幻灯片宿主从那里读取；网页宿主从当前章节的 IR 读取。

### 5.3 步骤可逆

插件组件的视觉状态必须是步骤的纯函数。组件在模板中用 `v-click` 标记向 Slidev 登记步骤，用 `useStepState` 读取状态。网页形态中 `v-click` 由兼容层处理：文档式直接显示，滚动叙事式随滚动显示。

### 5.4 错误隔离

插件组件的根元素包在 `PmBoundary` 中。组件出错时显示占位与错误信息，演讲者视图同时提示，页面其余内容照常渲染。

### 5.5 减少动态效果

所有动画读取 `usePrefersReducedMotion()`，开启时直接显示终态。

### 5.6 媒介限定与排版提示

只出现在部分媒介中的内容用 `{only}` 指令声明（`ir.md` 2.5 节），例如 `:::{only} web, notebook`。编译器把限定写入块的 `only` 字段，每个渲染端只收到属于自己的块。各渲染端的排版提示用 `{hints}` 声明。早期的 `<div doc-only>`、`<div slide-only>` 标记已不再使用。

### 5.7 界面语言

N-07 要求界面文本有中文与英文：

- 文稿的语言由头部的 `lang` 声明，例如 `lang: en-US`，默认 `zh-CN`。两种形态都据此设置 `<html lang>`：幻灯片渲染端写入 Slidev 头部的 `htmlAttrs`，网页渲染端设置站点语言（`renderers.web.lang` 可以单独覆盖）。
- 界面语言为 `'zh-CN'` 或 `'en'`：`<html lang>` 以 `zh` 开头时为中文，以 `en` 开头时为英文；其他语言看 `navigator.language`，仍无法确定时为英文。`@presmium/host` 的 `useLocale()` 按这条规则给出语言，`useMessages(catalog)` 从 `{ 'zh-CN': …, en: … }` 中取出当前语言的文本。
- 每个包维护自己的 zh-CN 与 en 文本，文件位置由包自定（例如 `src/domain/messages.ts` 或 `src/client/messages.ts`）。不经过宿主取语言的包按同一规则选择，并跟随 `<html lang>` 的变化（Slidev 在应用启动之后才写入 `htmlAttrs`）。服务端渲染时没有页面，取中文；插件组件只在浏览器中渲染。
- 开发服务器的端点（如本地环境插件的端点）按请求的 `Accept-Language` 回答，浏览器端在请求中带上页面的语言。
- 编译时写入产物的文本按文稿的 `lang`，例如 notebook 中指向网页版的说明、导出环境中的说明文件。编译时执行器写入录制输出的消息（例如超时）与解释器自身的报错一样为英文，也不含构建机器的路径。

### 5.8 静态导出

PDF、PNG 等静态导出中，插件组件显示 IR 的 `fallback`，不显示交互界面：幻灯片宿主在打印模式（`useStaticRender()` 为 true）下把带 `fallback` 的组件换成降级内容。插件负责让降级内容完整，例如执行面板的降级内容是代码加上 `:recorded:` 的录制输出。编译时执行的输出不在 `fallback` 中：指令生成组件时代码还没有执行，而插件的 IR 处理步骤都在编译时执行之前运行（9.2 节）。notebook 渲染端有自己的扩展时用扩展，否则使用 `fallback`（`ir.md` 第 6 节）；执行面板的 notebook 扩展从代码块取编译时的输出。

## 6. 示例文稿约定

示例文稿的入口是 `examples/demo/lecture.md`（MyST），只包含 frontmatter 与各上下文页面的引入：

```md
---
title: Presmium Demo
lang: zh-CN
plugins: [ ...全部插件包 ]
presmium: { ...各插件全局配置 }
---

```{include} pages/core.md
```
...
```

每个上下文独占 `examples/demo/pages/<ctx>.md` 与 `e2e/<ctx>.spec.ts`。构建产物位于 `examples/demo/dist/<渲染端 ID>/`。`lang` 是文稿的语言，决定两种形态的界面语言（5.7 节）。示例文稿的 `.presmium/` 中提交了执行缓存、本地化的图片与锚点锁定文件（4.3 节）。

## 7. 测试策略

只写集成测试，不写单元测试：测试在真实组装的系统上运行，不对单个函数做隔离测试，不用 mock 替代宿主框架。每条验收标准对应一到两个用例。

| 层级 | 工具 | 范围 | 命令 |
|---|---|---|---|
| 结构检查 | `scripts/check-layering.mjs` | 第 3 节的分层规则 | `pnpm test` |
| 集成 | Vitest | 真实运行 CLI、构建产物检查、服务端（`packages/<pkg>/test/`） | `pnpm test` |
| 构建 | `presmium build` | 示例文稿编译并生成全部媒介（网页、幻灯片、notebook） | `pnpm demo:build` |
| 检查 | `presmium check` | 示例文稿全部检查项通过 | `pnpm demo:check` |
| 端到端 | Playwright | 构建产物上的行为（`e2e/`）：全部用例在 Chromium 中运行，冒烟用例另在 Firefox 中运行 | `pnpm e2e` |
| 全部 | | 以上依次执行 | `pnpm verify` |

端到端测试的约定：

- 示例文稿的幻灯片产物（`dist/slides`）与网页产物（`dist/web`）服务在 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT`（默认 4173、4174）。并行的检出各用一对端口；端口被占用时报错，不复用别处的服务。幻灯片通过 `/<页号>?clicks=<步骤>` 定位，演讲者视图为 `/presenter/<页号>`。
- 需要专用文稿的用例（另一种界面语言、性能、课堂服务）在 `beforeAll` 中把测试文稿写到 `examples/demo/.presmium/e2e-*`（不入库，插件从示例文稿的依赖中解析），用真实的 `presmium build` 构建，再在空闲端口上服务产物。测试文稿放在 `e2e/fixtures/<组>/`。
- 性能用例（`e2e/perf.spec.ts`，N-01、N-02）是单独的 Playwright 项目，依赖 Chromium 项目，在其他用例结束后运行，计时不与其他用例争用机器。单独运行它要加 `--no-deps`：`pnpm exec playwright test e2e/perf.spec.ts --no-deps`；不加时 Playwright 先运行全部 Chromium 用例。
- 其他浏览器：`PRESMIUM_E2E_BROWSERS` 列出冒烟用例另外运行的浏览器，默认 `firefox`；主机装有 WebKit 所需的系统库时可以加上 `webkit`，没有时在 Playwright 的 Docker 镜像中运行（`browsers.md`）。浏览器用 `pnpm exec playwright install firefox webkit` 安装。Safari 与 Edge 在发布前按 `browsers.md` 手工检查并记录。

## 8. 需求覆盖

“验证”一栏给出验收用例所在的文件：`e2e/` 下为端到端用例，其余为 `packages/` 下的集成用例。

| 需求 | 包 | 验证 |
|---|---|---|
| K-01 文稿源码模型 | compiler | `cli/test/ir.test.ts`、`cli/test/build.test.ts`（章节 ID、源码位置、`{include}`） |
| K-02 语法扩展点 | compiler、各插件 | 插件指令的集成用例（如 `addon-exec/test/compile.test.ts`）与端到端用例 |
| K-03 渲染管线 | viewer、render-slides | `e2e/web.spec.ts`（示例文稿的每个插件组件在网页中渲染）、`e2e/content.spec.ts`（Web 组件） |
| K-04 步骤时间轴 | host、addon-core、viewer | `e2e/core.spec.ts`（跳到第 N 步与顺序前进的 DOM 一致）、`e2e/exec.spec.ts`、`e2e/guide.spec.ts` |
| K-05 视图 | addon-core、viewer | `e2e/core.spec.ts`（演讲者面板只在演讲者视图出现）、`e2e/viewer.spec.ts`（放映视图与演讲者窗口） |
| K-06 状态与事件 | host、addon-core、web、addon-session | `e2e/session.spec.ts`（两种形态的跨设备跟随）、`e2e/web.spec.ts`（`useSharedState` 跨窗口） |
| K-07 插件宿主 | kernel、host、addon-core、web、compiler | `e2e/core.spec.ts`、`e2e/web.spec.ts`（启动报告、降级、出错组件的隔离、章节配置、生命周期） |
| K-08 服务注册 | kernel | `e2e/core.spec.ts`（依赖方拿到提供方的实现；缺少必需服务的插件被禁用） |
| K-09 工作区访问 | compiler、addon-exec-local、addon-stage | `e2e/viewer.spec.ts`（`presmium dev` 跟随读取过的文件）、`addon-exec-local/test/local-env.test.ts`（开发服务器端点）、`e2e/stage.spec.ts`（标注写回） |
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
| N-04 浏览器 | — | 全部端到端用例在 Chromium 中运行，`e2e/smoke.spec.ts` 另在 Firefox 中运行（WebKit 在装有其系统库的主机或 Playwright 的 Docker 镜像中运行）；WebKit 的全量运行结果与 Safari、Edge 的手工检查见 `browsers.md` |
| N-05 显示 | web、viewer | `e2e/web.spec.ts`（手机视口无横向滚动） |
| N-06 无障碍基线 | host、addon-guide、addon-publish、web | `e2e/core.spec.ts`、`e2e/guide.spec.ts`（减少动态效果、键盘操作）、`e2e/publish.spec.ts`（高对比度达到 WCAG AA）、`e2e/web.spec.ts`（字号缩放） |
| N-07 界面语言 | 全部 | en-US 测试文稿上的英文界面：`e2e/core.spec.ts`、`e2e/web.spec.ts`（`e2e/fixtures/core/deck`：`<html lang>`、启动报告、两种形态的外壳与互相链接）、`e2e/viewer.spec.ts`（`e2e/fixtures/viewer/en`：放映视图、演讲者窗口、黑屏与代码块控件）、`e2e/classroom.spec.ts`“an English deck”（会话面板、加入表单与测验）、`e2e/exec.spec.ts`（`e2e/fixtures/exec/english`：执行面板、本地环境、高对比度开关）；开发服务器端点的回答与导出环境的说明文件见 `addon-exec-local/test/local-env.test.ts` |
| P-01 至 P-04 | addon-stage | `e2e/stage.spec.ts` |
| P-10 至 P-16 | addon-code | `addon-code/test/check.test.ts`、`e2e/code.spec.ts`（两种形态） |
| P-20、P-21、P-23、P-24 | addon-exec | `e2e/exec.spec.ts`（Python、JavaScript、TypeScript，两种形态；定时器稍后的输出在编译时与浏览器中一致）、`addon-exec/test/compile.test.ts`（编译时执行；失败或超时的运行显示预录输出） |
| P-22、P-25、P-26 | addon-exec-local | `addon-exec-local/test/local-env.test.ts`（没有 Docker 时跳过容器用例）、`e2e/exec-local.spec.ts`；P-25 的编辑回写端点已移出范围（WP-44） |
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
| VitePress 1.6 开发模式的虚拟模块 `/@localSearchIndex`、`/@localSearchIndexroot`：拦截它们，绕过开发模式下按错误路径重建搜索索引的问题 | `packages/web/src/node/vite.ts` | `e2e/viewer.spec.ts`“a keyword written while the server runs can be searched” | VitePress 固定为 1.6.4；上游修复后移除拦截 |
| Slidev 的根组件钩子 `setup/root.ts`（`defineRootSetup` 只出现在 `@slidev/types` 的类型中，文档没有列出），以及它在全部 `setup/main.ts` 之后运行的顺序：幻灯片形态在这里启动内核，发布插件在这里读取打印模式 | `packages/addon-core/setup/root.ts`、`packages/addon-publish/setup/root.ts` | `e2e/core.spec.ts`（启动报告与服务依赖）、`addon-publish/test/export.test.ts` 与 `diff.test.ts`（打印与视觉差异的样式） | 改用文档化的钩子或全局图层 |
| Slidev 幻灯片内容层的类名 `.slidev-slide-content`：冻结画面复制它的各层 | `packages/addon-stage/global-top.vue` | `e2e/stage.spec.ts`“f freezes the audience view” | 改用全局图层自己的结构 |
| Slidev 演讲者备注的类名 `.slidev-note-with-clicks`、`.slidev-note-fade`：突出当前步骤的备注 | `packages/addon-stage/style.css` | `e2e/stage.spec.ts`“presenter notes highlight the current step” | 没有文档化的替代，由用例守护 |

已经去掉的依赖：高对比度主题原先按 Slidev 的类名 `.slidev-code-dishonored` 提高被代码步骤淡化的行的不透明度。现在发布插件读取代码行（Shiki 输出的 `.line`）的计算不透明度，给低于 0.6 的行加上自己的 `data-pm-dimmed` 属性（`packages/addon-publish/src/client/code-lines.ts`），由 `e2e/publish.spec.ts`“every slide reaches WCAG AA”守护。

### 9.2 设计取舍与扩展点缺口

| 事项 | 现状与理由 | 计划 |
|---|---|---|
| 共享内核中的业务契约 | `@presmium/kernel` 除元能力外还定义了几个插件共用的业务服务契约：`EXECUTOR` 与 `RunRequest`、`SessionService`、`Role`、`ClassroomStore`，以及代码节点的 `run` 与 `outputs`。这是 4.5 节有意的选择：服务的提供方与使用方分属不同插件，契约只能放在双方都依赖的包中；设计原则 2 已据此修订 | 契约稳定后可以移到单独的契约包，内核只保留元能力 |
| 网页的 Service Worker 手写 | 网页渲染端在 VitePress 构建完成后生成约 70 行的 Service Worker（`packages/web/src/node/offline.ts`）：此时页面、搜索索引与 Pyodide 运行时都已写出，按产物内容计算缓存版本，并把无扩展名的页面地址对应到 `.html`。`vite-plugin-pwa` 只用于幻灯片形态：VitePress 在 Vite 客户端构建之后才渲染 HTML 页面，在 Vite 构建中生成的预缓存清单拿不到这些页面，需要专门的 `@vite-pwa/vitepress` 集成 | 评估 `@vite-pwa/vitepress`；接入后删除手写的 Service Worker |
| 网页按插件 ID 读取发布插件的配置 | `packages/web/src/domain/config.ts` 读取 `presmium.publish` 的 `offline` 决定是否生成 Service Worker：网页渲染端因此知道一个插件的配置键 | 增加渲染端扩展点，让插件参与网页构建 |
| 执行面板的降级内容没有编译时输出 | 插件的 IR 处理步骤都在编译时执行之前运行，指令生成组件时代码也还没有执行，所以执行面板的 `fallback` 只有代码与 `:recorded:`；没有 `:recorded:` 的面板在 PDF、PNG 导出中只显示代码。notebook 不受影响：执行面板的 notebook 扩展在渲染时从代码块取编译时的输出 | 编译器为插件的 IR 处理步骤增加“编译时执行之后”的阶段（例如 `IRPass` 的 `after: 'execute'`），执行插件在这一阶段把输出追加到 `fallback` |
| 幻灯片形态中的现场执行代码块 | 带 `:run: live` 或 `:run: both` 的普通代码块在网页形态中有运行按钮；幻灯片渲染端把它写成普通代码块，没有运行按钮，只有执行面板能在幻灯片中运行代码。`setup/code-runners.ts` 已经通过 `executor` 服务支持 Slidev 的 Monaco Runner（Python、JavaScript、TypeScript），但 MyST 源码无法写出 `{monaco-run}` | 幻灯片渲染端把带 `run` 的代码块写成 `{monaco-run}`，或写成执行插件的运行组件 |
| 课堂笔记依赖 IR 运行时的标记 | 课堂插件的笔记图层按 `.pm-section[data-section]`、`.pm-block[data-block]` 定位章节与块。这两个属性因此是 IR 运行时对外的契约，修改时须同时修改笔记图层 | 在视图插件接口中提供块旁的挂载点 |

### 9.3 代码执行的边界情况（WP-60d 验收遗留）

| 情况 | 影响 | 后续 |
|---|---|---|
| 浏览器端运行器在运行末尾漏掉未处理的 Promise 拒绝与定时器中的异步异常 | 同一段代码，浏览器中退出码为 0，编译时为 1 | 在运行器中等待所有定时器与微任务结束后再判定结果 |
| 用户代码直接调用 `console.dir`、`process.stdout.write` 或留下永不结束的顶层 `await` | Node 子进程的 JSON 结果被破坏，或录制的 stderr 含临时路径 | 子进程改用独立的结果通道（例如额外的文件描述符）返回结果 |
| 运行面板的 `fallback` 只含代码与 `:recorded:` | 没有 `:recorded:` 的面板在静态导出中只显示代码；`:params:` 的取值不显示 | 编译器增加“执行之后”的插件步骤阶段，由执行插件把编译时输出与参数写入 `fallback` |

