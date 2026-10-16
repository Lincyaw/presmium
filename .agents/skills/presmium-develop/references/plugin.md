# 新增一个插件

以假想的插件 `presmium.poll`（包 `@presmium/slidev-addon-poll`）为例，从源码语法走到两种浏览器形态与静态渲染端。约定的出处：`docs/architecture.md` 第 3 节（包内分层）、4.2 节（Node 端插件）、第 5 节（插件约定）；`docs/ir.md` 第 5、6 节。对照现成的插件读：`packages/addon-guide`（指令 → 组件，浮层）、`packages/addon-content`（指令、编译步骤、幻灯片扩展）、`packages/addon-exec`（执行器、两种渲染端扩展、浏览器服务）、`packages/addon-classroom`（编译步骤、notebook 扩展、依赖服务）。

## 1. 包的结构

```
packages/addon-poll/
├── package.json
├── src/
│   ├── domain/          纯 TS：插件 ID、解析、步骤计算、zh-CN 与 en 文本
│   ├── node/presmium.ts Node 端入口：默认导出 PresmiumNodePlugin
│   └── client/          浏览器端：index.ts、plugin.ts（内核插件）、viewer.ts（可选，IR 运行时扩展）
├── components/PmPoll.vue 组件，文件名即组件名
└── setup/main.ts        Slidev 约定：幻灯片形态注册内核插件
```

`package.json`（照 `packages/addon-guide/package.json`）：

```json
{
  "name": "@presmium/slidev-addon-poll",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "keywords": ["slidev-addon", "slidev", "presmium"],
  "exports": {
    "./domain": "./src/domain/index.ts",
    "./client": "./src/client/index.ts",
    "./presmium": "./src/node/presmium.ts",
    "./package.json": "./package.json"
  },
  "slidev": {},
  "dependencies": { "@presmium/kernel": "workspace:*", "@presmium/host": "workspace:*", "vue": "^3.5.42" },
  "devDependencies": { "@slidev/client": "53.0.0", "@slidev/types": "53.0.0" }
}
```

- 源码以 `.ts`、`.vue` 发布，不预编译；相对导入写 `.ts` 扩展名。
- 加包或依赖后在仓库根目录运行 `pnpm install`，并提交 `pnpm-lock.yaml`。
- 要在示例文稿中用它：加进 `examples/demo/package.json` 的依赖与 `examples/demo/lecture.md` 的 `plugins`。

## 2. 分层（`scripts/check-layering.mjs` 检查）

| 位置 | 可以引用 | 不得引用 |
|---|---|---|
| `src/domain/` | `@presmium/kernel`、纯计算库、`src/domain/` 内的相对路径 | vue、`@slidev/*`、vitepress、`@presmium/host`、Node 内置模块（`node:fs` 与 `fs` 都算） |
| `components/`、`src/client/` | `src/domain/`、`@presmium/kernel`、`@presmium/host`、vue | `@slidev/*`、vitepress（只有 `addon-core` 可以用 `@slidev/client`） |
| `setup/`、全局图层 | 以上全部，加 `@slidev/client` 的公开导出与 `@slidev/types` | vitepress |
| `src/node/` | `src/domain/`、`@presmium/kernel`、Node 库 | vue |

另外：不引用别的插件包（`@presmium/slidev-addon-*`），相对路径不离开本包，不引用框架内部路径（`@slidev/client/` 的子路径、`vitepress/dist`、`@slidev/cli/dist`）。两个插件要共用的契约放进 `@presmium/kernel`（业务服务契约，如 `EXECUTOR`、`SESSION`）或 `@presmium/host`（宿主层令牌，如 `TOOLBAR`、`NAVIGATION`）。

## 3. 指令：源码 → IR

`src/node/presmium.ts`：

```ts
import type { DirectiveSpec, PresmiumNodePlugin } from '@presmium/kernel'
import { POLL_ID, parseChoices } from '../domain/index.ts'

const poll: DirectiveSpec = {
  name: 'poll',
  arg: true,                          // 参数：问题
  body: true,                         // 正文：每行一个选项
  options: { anonymous: 'boolean' },  // 类型：'string' | 'number' | 'boolean' | 'list'
  toIR(input, ctx) {
    const choices = parseChoices(input.body)
    if (choices.length < 2) ctx.report({ checkId: POLL_ID, severity: 'error', message: '{poll} needs at least two choices' })
    return {
      node: {
        type: 'component',
        plugin: POLL_ID,
        name: 'PmPoll',
        props: { question: input.arg ?? '', choices, anonymous: input.options.anonymous === true },
        // 静态渲染端（notebook、PDF 导出）显示的 mdast；没有时渲染端写一行说明并链接网页版
        fallback: { type: 'root', children: [{ type: 'list', ordered: false, children: choices.map(c => ({ type: 'listItem', children: [{ type: 'paragraph', children: [{ type: 'text', value: c }] }] })) }] },
      },
      span: 0,                        // 内部步数；块有 span + 1 个状态
    }
  },
}

const plugin: PresmiumNodePlugin = { id: POLL_ID, directives: [poll] }
export default plugin
```

- `DirectiveResult` 为 `{ node, role?, span? }`；`role` 默认 `visual`。
- `:reveal:` 与 `:label:` 由编译器处理，不传给指令。指令声明了 `options` 时，未声明的选项得到警告。
- 指令名与内置指令（`slide`、`only`、`hints`、`config`、`component`）或别的插件重名时报错。
- `ctx`（`DirectiveContext`）：`file`、`deckDir`、`workspaceRoot`、`config`（全局配置合并本章节的 `{config}`）、`source`、`parse(markdown)`（把正文中的 MyST 解析成 mdast，例如做成子块）、`report(finding)`、`watch(...files)`。
- 组件的子块（`children`，如代码块、题干）由两种浏览器形态渲染到组件的默认插槽中。
- 读取工作区文件用编译步骤的 `ctx.src`、`ctx.resolvers`（编译器记录依赖，`presmium dev` 据此重新编译）；用别的方式读的文件用 `ctx.watch` 声明。

新指令要同时写进 `docs/ir.md` 5.1 节的指令表和 `.agents/skills/presmium-author/references/directives.md`（`scripts/check-skills.mjs` 检查后者）。

## 4. 编译步骤、执行器、检查项

`PresmiumNodePlugin` 的其他字段（契约在 `packages/kernel/src/contracts.ts`、`packages/kernel/src/ir.ts`）：

| 字段 | 形状 | 说明 |
|---|---|---|
| `passes` | `IRPass { name, order?, run(doc, ctx) }` | 在内置的编排步骤之后、编译时执行之前运行，按 `order` 排序；`ctx` 有 `src`、`resolvers`、`lock`、`executors`、`cache`、`config`、`configFor(section)`、`report`、`watch` |
| `executors` | `Executor { id, supports(lang), run(request), fingerprint? }` | 编译时执行；`fingerprint` 进入执行缓存的键 |
| `resolvers` | `AnchorResolver { scheme, resolve(...) }` | 新的锚点方案 |
| `checks` | `Check { id, run(ctx) }` | `presmium check` 运行，返回带源码位置的 `Finding[]` |
| `anchors` | `(ctx) => AnchorString[]` | `presmium check --update-lock` 要记录的锚点 |
| `renderer` | `Renderer` | 本插件就是一个渲染端（见 SKILL.md） |
| `rendererExtensions` | `{ [渲染端 ID]: { components: { [组件名]: (node, block, ctx) => unknown } } }` | 见第 7 节 |
| `version`、`kernel` | string | `kernel` 为兼容的内核版本范围，不兼容时编译器不加载 |

注意：编译步骤在编译时执行之前运行，所以组件的 `fallback` 里拿不到编译时的输出（`docs/architecture.md` 9.2 节）。

## 5. 组件：只经过 `@presmium/host`

`components/PmPoll.vue` 在网页与幻灯片两种形态中共用。规则（`docs/architecture.md` 5.3 至 5.9 节）：

- 根元素包在 `PmBoundary` 中，出错只影响本组件。
- 视觉状态是步骤的纯函数：`useStepState({ from, to })` 给出块内第 k 步的状态（`active`、`reached`、`done`），步骤从块的 `at` 算起，不要自己再减 `at`。用 `v-click="scope.step(k)"`（`const scope = useStepScope()`）向宿主登记块内第 k 步，范例见 `packages/addon-core/components/PmDemoStepper.vue`。
- 动画读 `usePrefersReducedMotion()`，开启时直接显示终态。
- 界面文本：`const t = useMessages({ 'zh-CN': {...}, en: {...} })`，模板中用 `t.value.xxx`；语言由 `<html lang>` 决定（`useLocale()`）。
- 配置：`useSectionConfig(POLL_ID)` 是全局配置合并本章节 `{config}` 后的结果。
- 服务：`useService(TOKEN)`；跨窗口或跨设备的状态：`useSharedState('presmium.poll:<key>', initial, { scope: 'view' | 'local' | 'remote' })`，键以插件 ID 开头。
- 静态导出：带 `fallback` 的组件在 PDF、PNG 中由宿主换成降级内容；需要自己判断时读 `useStaticRender()`。
- 绘制在其他内容之上、自身不占版面的浮层组件，根元素带 `pm-overlay` 类（例如 `packages/addon-guide/components/PmSpotlight.vue`）。

## 6. 浏览器端注册

- `src/client/plugin.ts` 默认导出 `PluginDefinition`：`{ manifest: { id: POLL_ID, version: '0.1.0', kernel: '^0.1.0', provides?, requires?: [{ token, optional? }] }, setup(ctx) { ctx.provide(TOKEN, impl) }, dispose?() {} }`。没有浏览器端服务时可以不写。
  - 网页形态：`@presmium/web` 自动导入 `plugins` 中每个包的这个文件并注册。
  - 幻灯片形态：`setup/main.ts` 注册它：

    ```ts
    import { registerPresmiumPlugin } from '@presmium/host'
    import { defineAppSetup } from '@slidev/types'
    import pollPlugin from '../src/client/plugin.ts'

    export default defineAppSetup(() => {
      registerPresmiumPlugin(pollPlugin)
    })
    ```

- `components/*.vue`：幻灯片形态由 Slidev 自动注册；网页形态由 `@presmium/web` 按文件名注册（文稿自己的 `components/` 覆盖同名组件）。
- `src/client/viewer.ts`（只用于网页形态）默认导出视图插件 `(ctx) => void`；`ctx` 有 `registerView`、`registerNodeRenderer`、`registerComponent`、`registerAction`、`registerLayer`、`useViewer`、`SectionView`、`BlockView`。只以类型方式引用 `@presmium/viewer`（`import type { ViewerPlugin } from '@presmium/viewer'`）。范例：`packages/addon-stage/src/client/viewer.ts`（动作与图层）、`packages/viewer/test/fixtures/plugin-deck/plugin/src/client/viewer.ts`（视图）。

## 7. 静态渲染端：扩展与 `fallback`

渲染端遇到组件节点时：

| 渲染端 | 有扩展 | 没有扩展 |
|---|---|---|
| `slides` | 写入扩展返回的 Slidev Markdown | 写组件标签 `<PmPoll question="…" :choices='[…]'>`，子块放进插槽；有 `fallback` 时外面包 `PmStaticFallback`，导出 PDF 时显示降级内容 |
| `notebook` | 写入扩展返回的单元格；返回 `undefined` 时退回 `fallback`，返回 `[]` 时什么都不写 | 渲染 `fallback`；也没有 `fallback` 时写一行说明并链接网页版，构建报告列出该块 |
| `web` | — | IR 运行时按组件名找到组件；找不到时显示 `fallback` |

notebook 扩展返回一个或一组单元格：字符串是 Markdown 单元格，对象为 `{ cell_type: 'markdown' | 'code' | 'raw', source, metadata?, outputs?, execution_count? }`（`packages/render-notebook/src/domain/notebook.ts` 的 `NotebookCellInput`）。

```ts
rendererExtensions: {
  notebook: { components: { PmPoll: node => `**${String(node.props.question)}**` } },
},
```

扩展的第三个参数 `ctx` 是该渲染端的 `RenderContext`（`outDir`、`workDir`、`deckDir` 等），例如写出相对于产物的路径（`packages/addon-content/src/node/media.ts` 的 `slidesMedia`）。编译时写入产物的文本按文稿的 `lang` 选择中文或英文。

## 8. 测试与文档

- 集成测试：`packages/addon-poll/test/*.test.ts`，在临时目录写一份文稿，`plugins` 写本包的绝对路径，真正运行 CLI 构建，检查产物（范例 `packages/addon-classroom/test/notebook.test.ts`）。
- 端到端：测试文稿放 `e2e/fixtures/poll/`，用例 `e2e/poll.spec.ts` 用 `useFixture('poll')` 在 `beforeAll` 中构建（见 `references/testing.md`）。两种形态各测一遍。
- 文档：`docs/ir.md` 5.1 节、`docs/architecture.md` 第 8 节的需求覆盖表、`.agents/skills/presmium-author/references/directives.md`。
