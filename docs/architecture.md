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
| `src/domain/` | `@presmium/kernel`、纯计算库 | vue、`@slidev/*`、vitepress、`node:*` |
| `components/`、`src/client/` | `src/domain/`、`@presmium/kernel`、`@presmium/host`、vue | `@slidev/*`、vitepress |
| `setup/`、全局图层 | 以上全部，加 `@slidev/client` 公开导出 | vitepress |
| `src/node/` | `src/domain/`、`@presmium/kernel`、Node 库 | vue |

只有 `addon-core` 可以在组件中使用 `@slidev/client`，只有 `web` 可以使用 vitepress。

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
- 检查项 `Check.run(ctx)` 返回 `Finding[]`，诊断带源码位置。

### 4.4 宿主接口

```ts
type PresentationMode = 'slides' | 'document'
type ViewRole = 'audience' | 'presenter' | 'reader'

interface HostAdapter {
  mode: PresentationMode
  useCursor(): Readonly<Ref<{ slide: number; step: number }>>
  /** Step of the enclosing step scope (block-relative), see `useStepScope`. */
  useStep(): Readonly<Ref<number>>
  useViewRole(): Readonly<Ref<ViewRole>>
  getService<T>(token: ServiceToken<T>): T | undefined
}
```

组件使用 `@presmium/host` 导出的 `useStepState`（区间相对于所在块的步骤作用域）、`useStepScope`、`PmStepScope`、`useCursor`、`useViewRole`、`useService`、`usePresentationMode`、`usePrefersReducedMotion` 与 `PmBoundary`。两个宿主适配器在应用初始化时通过 `installHost(app, adapter)` 注入实现。

### 4.5 公共服务令牌

| 令牌 | 提供方 | 使用方 |
|---|---|---|
| `presmium.executor` | 代码执行（浏览器、本地容器两个实现，经路由汇总） | 课堂（练习校验） |
| `presmium.session` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.classroomStore` | 会话 | 测验、笔记、提问、理解度 |
| `presmium.presenterPanels` | 宿主适配（两种形态；网页形态在放映视图的演讲者窗口中显示） | 需要演讲者面板的插件 |
| `presmium.syncTransports` | 宿主适配（两种形态；只有幻灯片形态有可同步的通道） | 会话（接入 Slidev 的状态同步） |
| `presmium.navigation` | 宿主适配（两种形态） | 会话（读取与设置位置：章节、步骤、视图） |
| `presmium.toolbar` | 宿主适配（两种形态，由 `PmToolbar` 显示） | 需要工具栏入口的插件（如会话状态） |

内核契约中的令牌（`executor`、`session`、`classroomStore`、`presenterPanels`）定义在 `packages/kernel/src/contracts.ts`；宿主层的令牌（`syncTransports`、`navigation`、`toolbar`）定义在 `packages/host/src/types.ts`。服务替换时，提供方与使用方都不需要改动。

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

| 作用域 | 写法 |
|---|---|
| 全局 | 文稿 headmatter：`presmium: { <插件 ID>: {...} }` |
| 单页 | 页 frontmatter：`presmium: { <插件 ID>: {...} }` |
| 单个节点 | 组件属性 |

### 5.3 步骤可逆

插件组件的视觉状态必须是步骤的纯函数。组件在模板中用 `v-click` 标记向 Slidev 登记步骤，用 `useStepState` 读取状态。网页形态中 `v-click` 由兼容层处理：文档式直接显示，滚动叙事式随滚动显示。

### 5.4 错误隔离

插件组件的根元素包在 `PmBoundary` 中。组件出错时显示占位与错误信息，演讲者视图同时提示，页面其余内容照常渲染。

### 5.5 减少动态效果

所有动画读取 `usePrefersReducedMotion()`，开启时直接显示终态。

### 5.6 形态标记

```md
<div doc-only>只在网页中出现的补充说明</div>
<div slide-only>只在幻灯片中出现的提示</div>
```

幻灯片形态隐藏 `doc-only`，网页形态隐藏 `slide-only`。

## 6. 示例文稿约定

示例文稿的入口是 `examples/demo/lecture.md`（MyST），只包含 frontmatter 与各上下文页面的引入：

```md
---
title: Presmium Demo
plugins: [ ...全部插件包 ]
presmium: { ...各插件全局配置 }
---

```{include} pages/core.md
```
...
```

每个上下文独占 `examples/demo/pages/<ctx>.md` 与 `e2e/<ctx>.spec.ts`。构建产物位于 `examples/demo/dist/<渲染端 ID>/`。

## 7. 测试策略

只写集成测试，不写单元测试：测试在真实组装的系统上运行，不对单个函数做隔离测试，不用 mock 替代宿主框架。每条验收标准对应一到两个用例。

| 层级 | 工具 | 范围 | 命令 |
|---|---|---|---|
| 结构检查 | `scripts/check-layering.mjs` | 第 3 节的分层规则 | `pnpm test` |
| 集成 | Vitest | 真实运行 CLI、构建产物检查、服务端（`packages/<pkg>/test/`） | `pnpm test` |
| 构建 | `presmium build` | 示例文稿编译并生成全部媒介 | `pnpm demo:build` |
| 检查 | `presmium check` | 示例文稿全部检查项通过 | `pnpm demo:check` |
| 端到端 | Playwright（Chromium） | 两种构建产物上的行为（`e2e/`） | `pnpm e2e` |
| 全部 | | 以上依次执行 | `pnpm verify` |

端到端测试中，幻灯片产物（`dist/slides`）服务在 `http://localhost:4173`，网页产物（`dist/web`）服务在 `http://localhost:4174`。幻灯片通过 `/<页号>?clicks=<步骤>` 定位，演讲者视图为 `/presenter/<页号>`。

## 8. 需求覆盖

| 需求 | 包 | 验证方式 |
|---|---|---|
| K-01、K-02、K-03、K-11、K-12、K-13、K-14、K-15 | 宿主（Slidev） | 示例文稿构建与端到端冒烟测试 |
| K-04 | host、addon-core | 端到端：跳转到第 N 步与顺序前进到第 N 步的 DOM 一致 |
| K-05 | addon-core | 端到端：演讲者面板只在演讲者视图出现 |
| K-06 | addon-core、addon-session | 端到端：双页面同步 |
| K-07 | kernel、host、addon-core | 端到端：服务依赖与降级反映在启动报告中；出错的组件不影响同页其他内容 |
| K-08 | kernel、addon-core | 端到端：依赖方拿到提供方的实现；缺少必需服务的插件被禁用 |
| K-09 | addon-code、addon-exec-local | 集成 |
| K-10 | kernel、addon-code | 集成：对测试文稿运行 presmium check |
| K-16 | cli | 集成：失效锚点使退出码非零，诊断带源码位置 |
| N-01、N-02 | e2e | 端到端计时断言 |
| N-03 | addon-publish、web | 端到端：断网后放映与搜索 |
| N-05 | web | 端到端：手机视口下网页无横向滚动 |
| N-06 | host、addon-publish | 端到端：减少动态效果、键盘操作 |
| P-01 至 P-04 | addon-stage | 端到端 |
| P-10 至 P-16 | addon-code | 检查集成 + 端到端（两种形态） |
| P-20 至 P-26 | addon-exec、addon-exec-local | 端到端（Pyodide）；本地环境为集成测试，无 Docker 时跳过容器用例 |
| P-30 至 P-32 | addon-guide | 端到端 |
| P-40 至 P-43 | addon-content | 端到端（两种形态） |
| P-50 至 P-53 | addon-publish | 集成：导出产物中的链接、离线清单、视觉差异报告 |
| P-60 至 P-67 | addon-session、classroom-server、addon-classroom | 端到端（真实课堂服务，多个浏览器上下文接入同一课堂） |
| P-70 至 P-74 | web | 端到端：章节与备注、搜索、深链接、滚动叙事、形态切换 |

N-04、N-07 在端到端测试中以 Chromium 覆盖，其他浏览器在发布前手工验证。

## 9. 已知风险

| 风险 | 位置 | 缓解 |
|---|---|---|
| 开发模式的网页搜索拦截了 VitePress 1.6 的内部虚拟模块 `/@localSearchIndex`、`/@localSearchIndexroot`（非公开接口），以绕过 VitePress 在开发模式下按错误路径重建索引的问题 | `packages/web/src/node/vite.ts` | VitePress 版本固定为 1.6.4；端到端用例“a keyword written while the server runs can be searched”在升级后会暴露变化；上游修复后移除该拦截 |

