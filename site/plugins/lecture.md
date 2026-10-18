---
title: 插件开发指南
description: 用组件、指令、服务、服务端路由、视图与渲染端扩展 Presmium
translations: { en: lecture.en.md }
---

(plugins)=
# 插件开发指南

Presmium 的组件、指令、执行器、服务与渲染端都以插件提供，官方插件与第三方插件用的是同一套契约。一个插件是一个 npm 包：Node 端的入口把源码中的指令变成 IR、在编译时运行步骤与检查、提供服务与服务端路由；浏览器端的组件在网页与幻灯片两种形态中是同一个 Vue 组件，只经 `@presmium/host` 取得步骤状态与服务。

这份指南以一个假想的投票插件 `presmium.poll` 为例，从包的结构讲到测试。接口的完整签名见接口参考（导航栏的“API”），版本规则见[接口与版本](../reference/lecture.md#versions)。

(plugin-package)=
# 插件包

(plugin-package-layout)=
## 目录结构

```text
presmium-plugin-poll/
├── package.json
├── src/
│   ├── domain/          纯 TS：插件 ID、解析、步骤计算、中英文文本
│   ├── node/presmium.ts Node 端入口：默认导出 PresmiumNodePlugin
│   └── client/          浏览器端：plugin.ts（内核插件）、viewer.ts（可选，IR 运行时的扩展）
├── components/PmPoll.vue 组件，文件名就是组件名
├── setup/main.ts        幻灯片形态中注册内核插件（Slidev 的约定）
└── test/                集成测试
```

(plugin-package-json)=
## package.json

```json
{
  "name": "presmium-plugin-poll",
  "version": "1.0.0",
  "type": "module",
  "keywords": ["slidev-addon", "presmium"],
  "exports": {
    "./presmium": "./src/node/presmium.ts",
    "./client": "./src/client/plugin.ts",
    "./package.json": "./package.json"
  },
  "files": ["components", "setup", "src"],
  "slidev": {},
  "peerDependencies": {
    "@presmium/host": "^1.0.0",
    "@presmium/kernel": "^1.0.0"
  },
  "devDependencies": {
    "@presmium/cli": "^1.0.0",
    "@presmium/host": "^1.0.0",
    "@presmium/kernel": "^1.0.0",
    "@presmium/web": "^1.0.0",
    "vitest": "^4.0.0"
  }
}
```

- 每个插件包本身也是一个 Slidev 插件（`slidev` 字段、`components/`、`setup/`），幻灯片形态因此认得它的组件。
- 对 `@presmium/kernel`、`@presmium/host`、`@presmium/viewer`、`@presmium/compiler` 中用到的包写成对等依赖：插件与应用共用一份 Presmium。已安装的 Presmium 不满足对等依赖时，加载器给出诊断 `presmium.plugins` 而不加载插件，构建不会崩溃。
- 源码以 `.ts` 与 `.vue` 直接发布，不预编译；相对导入写 `.ts` 扩展名。

(plugin-package-version)=
## version 与 kernel

Node 端入口与浏览器端的插件清单都写 `version` 与 `kernel`：`version` 是包自己的版本，`kernel` 是兼容的插件契约版本范围。Presmium 1.x 的插件契约版本是 `1.0.0`，所以写 `kernel: '^1.0.0'`。范围不包含当前契约版本的插件不被加载。

(plugin-package-layers)=
## 分层

| 位置 | 可以引用 | 不得引用 |
|---|---|---|
| `src/domain/` | `@presmium/kernel`、纯计算的库 | vue、`@presmium/host`、`@slidev/*`、vitepress、Node 的内置模块 |
| `components/`、`src/client/` | `src/domain/`、`@presmium/kernel`、`@presmium/host`、vue | `@slidev/*`、vitepress |
| `setup/` | 以上全部，加 `@slidev/client` 的公开导出与 `@slidev/types` | Slidev 的其他包、vitepress |
| `src/node/` | `src/domain/`、`@presmium/kernel`、Node 的库 | vue |

不要引用框架的内部路径，也不要引用别的插件包：两个插件要共用的契约放进内核（业务服务）或宿主（宿主层的令牌）。

(plugin-components)=
# 组件

(plugin-components-host)=
## 只经过宿主

组件放在 `components/` 下，网页与幻灯片都用它。它只从 `@presmium/host` 取得步骤状态与服务，不直接用 Slidev 或 VitePress，所以两种形态都能渲染：

```vue
<script setup lang="ts">
import { useMessages, useStepState } from '@presmium/host'
import { MESSAGES } from '../src/domain/messages.ts'

defineProps<{ question: string, choices: string[] }>()
// 块的第二个状态（块内的第 1 步）：结果
const results = useStepState({ from: 1 })
const t = useMessages(MESSAGES)
</script>

<template>
  <section class="pm-poll">
    <h3>{{ question }}</h3>
    <ol>
      <li v-for="choice in choices" :key="choice">{{ choice }}</li>
    </ol>
    <p v-if="results.reached">{{ t.results }}</p>
  </section>
</template>
```

(plugin-components-rules)=
## 规则

- **视觉状态是步骤的纯函数**：同一步骤总是同一画面，往回翻页也一样。`useStepState({ from, to })` 给出块内一段步骤的状态（`active`、`reached`、`done`），步骤从块出现的那一步算起；`useStepScope` 向宿主登记块内的第 k 步。
- **减少动态效果**：动画读 `usePrefersReducedMotion()`，开启时直接显示终态。
- **配置与服务**：`useSectionConfig(插件 ID)` 是全局配置合并本章节 `{config}` 的结果；`useService(令牌)` 取得浏览器端服务；`useSharedState` 在窗口或设备之间同步状态，键以插件 ID 开头。
- **静态导出**：导出 PDF 与 PNG 时，带降级内容的组件由宿主换成降级内容；需要自己判断时读 `useStaticRender()`。
- **错误隔离**：渲染端在每个插件组件外面包了一层边界，组件抛错只影响它自己，不要自己再包。
- **样式**：颜色、字体与间距只用设计系统的令牌（`var(--pm-color-ink)`、`var(--pm-space-3)` 等），控件用 `PmButton`、`PmField`、`PmDialog` 这类宿主组件，图标用 `PmIcon`，暗色随令牌切换。

(plugin-components-register)=
## 浏览器端注册

`src/client/plugin.ts` 默认导出内核插件（`PluginDefinition`）：清单写 `id`、`version`、`kernel`、提供与需要的服务，`setup(ctx)` 中 `ctx.provide(令牌, 实现)`，`dispose` 中释放 Worker 与定时器。网页形态自动导入它；幻灯片形态由 `setup/main.ts` 用 `registerPresmiumPlugin` 注册。

(plugin-directives)=
# 指令与角色

(plugin-directives-spec)=
## 从源码到 IR

指令是 `DirectiveSpec`：名字、参数、正文、选项与 `toIR`。`toIR` 返回 IR 节点（多半是一个组件节点）与它占的步数：

```ts
import { createRequire } from 'node:module'
import type { DirectiveSpec, PresmiumNodePlugin } from '@presmium/kernel'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const poll: DirectiveSpec = {
  name: 'poll',
  arg: true,
  body: true,
  options: { anonymous: 'boolean' },
  toIR(input, ctx) {
    const choices = (input.body ?? '').split('\n').map(line => line.trim()).filter(Boolean)
    if (choices.length < 2) ctx.report({ checkId: 'presmium.poll', severity: 'error', message: '{poll} needs at least two choices' })
    return {
      node: {
        type: 'component',
        plugin: 'presmium.poll',
        name: 'PmPoll',
        props: { question: input.arg ?? '', choices },
        fallback: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: input.arg ?? '' }] }] },
      },
      span: 1,
    }
  },
}

const plugin: PresmiumNodePlugin = { id: 'presmium.poll', version, kernel: '^1.0.0', directives: [poll] }
export default plugin
```

- `span` 是块内的步数：块有 `span + 1` 个状态（这里是问题与结果），讲解按顺序绑定到它们。
- `fallback` 是静态媒介（notebook、PDF）显示的 mdast；没有时渲染端写一行说明并链接网页版。
- `ctx` 有文稿的语言 `lang`、本章节的配置 `config`、把正文中的 MyST 解析成 mdast 的 `parse`、报告诊断的 `report` 与声明依赖文件的 `watch`。
- 指令名与内置指令或别的插件重名时报错；没有声明的选项得到警告。

(plugin-directives-roles)=
## 行内角色

`roles` 中的 `RoleSpec` 声明行内角色 ``{名字 key=value}`内容` ``，它在 IR 中是一个 `presmiumRole` 节点：页面显示内容，没有内容的角色在演讲者窗口与备注中显示一个标记。讲授插件的 `{cue}` 与 `{say}` 就是角色。

(plugin-directives-passes)=
## 编译步骤与检查

`passes` 中的编译步骤在整个文稿编好之后运行，可以改写 IR、读取工作区的文件（经 `ctx.src` 与锚点解析器，编译器据此记录依赖）；声明 `after: 'execute'` 的步骤在编译时执行之后运行，能读到代码的输出。`checks` 中的检查项由 `presmium check` 运行，返回带源码位置的诊断。

(plugin-services)=
# 服务

(plugin-services-tokens)=
## 令牌与接口

服务是用 `defineService<T>(id)` 定义的令牌加上它的实现。两个插件之间只经服务交流：提供方在清单的 `provides` 中声明、在 `setup` 中 `ctx.provide`，使用方在 `requires` 中声明（可以是 `optional`）、用 `ctx.get` 或组件中的 `useService` 取得。内核按依赖排出启动顺序；缺少必需服务的插件被禁用，并在启动报告中写明原因。

(plugin-services-node)=
## Node 端服务与执行器

Node 端入口的 `services(ctx)` 返回 `[令牌, 实现]` 的列表，编译步骤、渲染端、检查项与服务端路由经 `ctx.service(令牌)` 取用。`ctx.config` 是文稿中这个插件的配置，`ctx.settings` 是运营者在工作区配置 `settings.<插件 ID>` 中的设置（文稿改不了它），`ctx.secret(名字)` 读运营者的凭据。

`executors` 中的执行器在编译时运行代码：它只能用 `RunContext` 给出的环境变量，有进程沙箱时经沙箱启动子进程，`fingerprint` 与 `revision` 进入执行缓存的键。`environments` 为头部 `execute.environments` 中的一类环境提供执行器。

(plugin-routes)=
# 服务端路由

(plugin-routes-server)=
## 挂在 Presmium 服务上

Node 端入口的 `server(ctx)` 返回路由与反向代理，挂在 `/__presmium/<插件 ID>/` 下，`presmium dev` 与 `presmium serve` 都有。路由用 Fetch API 的请求与回答：

```ts
import { json } from '@presmium/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'presmium.poll',
  version,
  kernel: '^1.0.0',
  server: () => ({
    routes: {
      // GET /__presmium/presmium.poll/votes
      votes: {
        role: 'reader',
        handle: async () => json({ votes: [] }),
      },
    },
  }),
}
```

- `role` 默认 `editor`；请求体默认至多 1 MiB，更大的写 `maxBody`。回答用内核的 `json(data)` 与 `problem(status, message)`。
- 改变状态的操作先经 `APPROVALS` 请求确认；写文档目录经 `DOCUMENT_FILES` 服务，不直接写文件。
- 浏览器端用 `useServer().fetch(插件 ID, 路径)` 调用。静态产物中 `useServer().available` 为 false，组件要降级。

(plugin-routes-tools)=
## agent 工具

`tools` 中的 `AgentTool` 成为 MCP 的工具：`name`、`description`、输入的 JSON Schema 与 `kind`。`read` 类的工具每个令牌都能用；`operate`、`spend` 类的工具在调用之前经确认。

(plugin-views)=
# 视图

(plugin-views-viewer)=
## IR 运行时的扩展

网页形态由 IR 运行时 `@presmium/viewer` 渲染。插件的 `src/client/viewer.ts` 默认导出一个视图插件 `(ctx) => void`，可以注册新的运行时视图（`registerView`，如放映视图）、节点的渲染（`registerNodeRenderer`）、组件（`registerComponent`）、动作（`registerAction`）与图层（`registerLayer`）。只以类型方式引用 `@presmium/viewer`：

```ts
import type { ViewerPlugin } from '@presmium/viewer'

const plugin: ViewerPlugin = (ctx) => {
  // 放映视图中按 R 显示下一步
  ctx.registerAction({ id: 'poll.next', keys: ['r'], run: viewer => viewer.next() })
}
export default plugin
```

(plugin-views-operations)=
## 可以回放的操作

讲授能录下与回放页面上的操作。用户做了一件值得重放的事时，经 `OPERATIONS` 报告 `{ type, data }`（以章节、块与相对坐标为坐标，不用像素）；在内核插件的 `setup` 中用 `onReplay` 登记重放。依次重放与跳到某个时间之后的一次重放必须得到同一画面。

(plugin-renderers)=
# 渲染端

(plugin-renderers-new)=
## 新的渲染端

渲染端是 Node 端入口的 `renderer` 字段：`id`、`support(node)`（`full`、`degraded` 或 `none`）、`build(doc, ctx)`，可选的 `dev(doc, ctx)`。`build` 收到的 IR 已经去掉了 `{only}` 排除的块，把产物写到 `ctx.outDir`，中间文件放 `ctx.workDir`。块引用的本地文件用 `ctx.localAsset` 找到并随产物发布；写进产物的文字按 `deckLocale(ctx.lang)` 选择中文或英文。`presmium build --to <id>` 选择它，文稿头部的 `renderers.<id>.package` 也可以指定包。

(plugin-renderers-extensions)=
## 给已有的渲染端扩展

插件的组件在幻灯片与 notebook 中怎样出现，由 `rendererExtensions` 决定：`slides` 的扩展返回 Slidev 的 Markdown，`notebook` 的扩展返回单元格（字符串是 Markdown 单元格，对象可以是代码单元格）。没有扩展时，幻灯片写组件的标签，notebook 显示 `fallback`。

```ts
rendererExtensions: {
  notebook: { components: { PmPoll: node => `**${String(node.props.question)}**` } },
},
```

(plugin-messages)=
# 界面文本

(plugin-messages-catalog)=
## 中文与英文

每个插件维护自己的 zh-CN 与 en 文本，放在 `src/domain/` 中：

```ts
export const MESSAGES = {
  'zh-CN': { results: '投票结果' },
  'en': { results: 'Results' },
}
```

组件中用 `useMessages(MESSAGES)`，组件之外用 `MESSAGES[currentLocale()]`。语言由页面的 `<html lang>` 决定（来自文稿头部的 `lang`），没有对应文本时看浏览器的语言；不要自己判断语言。编译时写进产物的文字（指令、编译步骤、渲染端）按 `deckLocale(ctx.lang)` 选择。

(plugin-testing)=
# 插件测试

(plugin-testing-integration)=
## 只写集成测试

插件的测试真正运行 CLI、构建产物、打开浏览器，不对单个函数做隔离测试，也不 mock Slidev 与 VitePress；每条验收标准一到两个用例。`@presmium/cli/testing` 的 `presmium(cwd, args)` 在子进程中运行真正的 `presmium` 命令：

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import { expect, it } from 'vitest'

const PLUGIN = fileURLToPath(new URL('..', import.meta.url))

it('builds the poll into the web page', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poll-'))
  writeFileSync(join(dir, 'lecture.md'), `---\nplugins: ['${PLUGIN}']\n---\n\n## 投票\n\n\`\`\`{poll} 喜欢哪种？\n甲\n乙\n\`\`\`\n`)
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'web'])
  expect(code, stdout + stderr).toBe(0)
  expect(readFileSync(join(dir, 'dist/ir.json'), 'utf8')).toContain('PmPoll')
})
```

文稿的 `plugins` 可以写插件目录的绝对路径。两种浏览器形态的行为用 Playwright 在构建出的站点上测：在 `beforeAll` 中构建一份测试用的文稿，再分别打开网页与幻灯片。

(plugin-testing-publish)=
## 发布之前

`npm pack` 之后在另一个目录中安装压缩包与 `@presmium/cli`、渲染端，`presmium check` 没有问题、构建通过，再在网页与幻灯片中看一遍组件。起步工具 `npm create presmium@latest` 生成的插件项目已经带着这样的结构与一个能运行的集成测试。
