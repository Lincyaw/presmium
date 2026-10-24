# 新增一个插件

以假想的插件 `presmium.poll`（包 `@lincyaw/slidev-addon-poll`）为例，从源码语法走到两种浏览器形态与静态渲染端。约定的出处：`docs/architecture.md` 第 3 节（包内分层）、4.2 节（Node 端插件）、第 5 节（插件约定）；`docs/ir.md` 第 5、6 节。对照现成的插件读：`packages/addon-guide`（指令 → 组件，浮层）、`packages/addon-content`（指令、编译步骤、幻灯片扩展）、`packages/addon-exec`（执行器、两种渲染端扩展、浏览器服务）、`packages/addon-classroom`（编译步骤、notebook 扩展、依赖服务）。

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
  "name": "@lincyaw/slidev-addon-poll",
  "version": "1.0.0-rc.0",
  "description": "Presmium plugin: polls",
  "license": "Apache-2.0",
  "repository": { "type": "git", "url": "git+https://github.com/Lincyaw/presmium.git", "directory": "packages/addon-poll" },
  "homepage": "https://github.com/Lincyaw/presmium/tree/main/packages/addon-poll#readme",
  "bugs": "https://github.com/Lincyaw/presmium/issues",
  "keywords": ["slidev-addon", "slidev", "presmium"],
  "type": "module",
  "engines": { "node": ">=22.19" },
  "publishConfig": { "access": "public" },
  "exports": {
    "./domain": "./src/domain/index.ts",
    "./client": "./src/client/index.ts",
    "./presmium": "./src/node/presmium.ts",
    "./package.json": "./package.json"
  },
  "files": ["components", "setup", "src"],
  "slidev": {},
  "dependencies": { "vue": "^3.5.42" },
  "peerDependencies": { "@lincyaw/host": "workspace:^", "@lincyaw/kernel": "workspace:^" },
  "devDependencies": { "@lincyaw/cli": "workspace:*", "@lincyaw/host": "workspace:*", "@lincyaw/kernel": "workspace:*", "@slidev/client": "53.0.0", "@slidev/types": "53.0.0" }
}
```

- 版本与其他公开包相同（changesets 的固定组）；`engines.node` 与根目录一致。对 `@lincyaw/kernel`、`host`、`viewer`、`compiler` 的依赖是对等依赖：插件与应用共用一份（宿主的注入键、服务令牌），发布时 `workspace:^` 成为 `^<版本>`；同名的开发依赖让工作区为本包的测试链接它们。对等依赖不满足的插件，加载器在 `presmium check` 与构建中报告，不加载它。
- 复制根目录的 `LICENSE` 到包中，在 `.changeset/README.md` 的表中加一行；`files` 只列发布的目录与文件（不含 `test/`）。`scripts/check-packages.mjs` 检查这些。

- 源码以 `.ts`、`.vue` 发布，不预编译；相对导入写 `.ts` 扩展名。
- 加包或依赖后在仓库根目录运行 `pnpm install`，并提交 `pnpm-lock.yaml`。
- 公开示例只有 `examples/animations/` 的两讲；新增插件的专用验证文稿放在 `e2e/fixtures/<组>/`，不要将功能演示混入示例。需要在示例中使用时，加进 `examples/animations/package.json` 的依赖与相应文稿的 `plugins`。

## 2. 分层（`scripts/check-layering.mjs` 检查）

| 位置 | 可以引用 | 不得引用 |
|---|---|---|
| `src/domain/` | `@lincyaw/kernel`、纯计算库、`src/domain/` 内的相对路径 | vue 与 `@vue/*`、`@slidev/*`、vitepress、`@lincyaw/host`、Node 内置模块（`node:fs` 与 `fs` 都算） |
| `components/`、`src/client/` | `src/domain/`、`@lincyaw/kernel`、`@lincyaw/host`、vue | `@slidev/*`、vitepress（只有 `addon-core` 可以用 `@slidev/client`） |
| `setup/`、全局图层（`global-top.vue` 等） | 以上全部，加 `@slidev/client` 的公开导出与 `@slidev/types` | Slidev 的其他包、vitepress |
| `src/node/` | `src/domain/`、`@lincyaw/kernel`、Node 库 | vue 与 `@vue/*` |

另外：不引用插件包（`@lincyaw/slidev-addon-*`，对渲染端与 IR 运行时同样适用），相对路径不离开本包，不引用框架内部路径（`@slidev/client/` 的子路径、`vitepress/dist`、`@slidev/cli/dist`）。两个插件要共用的契约放进 `@lincyaw/kernel`（业务服务契约，如 `EXECUTOR`、`SESSION`）或 `@lincyaw/host`（宿主层令牌，如 `TOOLBAR`、`NAVIGATION`）。

## 3. 指令：源码 → IR

`src/node/presmium.ts`：

```ts
import { createRequire } from 'node:module'
import type { DirectiveSpec, PresmiumNodePlugin } from '@lincyaw/kernel'
import { POLL_ID, parseChoices } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

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

// version 与 kernel：version 取自 package.json；kernel 是插件契约的版本范围（KERNEL_VERSION，1.0 起为 1.0.0，与包的版本分开），
// 编译器不加载范围不符的插件，幻灯片也不把它作为插件；scripts/check-plugins.mjs 检查每个官方插件都写了
const plugin: PresmiumNodePlugin = { id: POLL_ID, version, kernel: '^1.0.0', directives: [poll] }
export default plugin
```

- `DirectiveResult` 为 `{ node, role?, span? }`；`role` 默认 `visual`。
- `:reveal:` 与 `:label:` 由编译器处理，不传给指令。指令声明了 `options` 时，未声明的选项得到警告。
- 指令名与内置指令（`slide`、`only`、`hints`、`config`、`component`）或别的插件重名时报错。
- `ctx`（`DirectiveContext`）：`file`、`deckDir`、`workspaceRoot`、`lang`（文稿语言，写进产物的文字用 `deckLocale(ctx.lang)` 选择）、`config`（全局配置合并本章节的 `{config}`）、`source`、`parse(markdown)`（把正文中的 MyST 解析成 mdast，例如做成子块）、`report(finding)`、`watch(...files)`。
- 参数是锚点（`scheme:target`）时写 `arg: 'anchor'`，编辑器据此跳转、悬停与补全。
- 组件的子块（`children`，如代码块、题干）由两种浏览器形态渲染到组件的默认插槽中。组件默认拥有子代码，渲染端不给它们运行控件，也不显示录制输出；组件要运行的代码放进属性（如执行面板的 `code`），不从渲染后的 DOM 读回。只组织内容、不执行代码的容器（例如预测的揭示内容）在 `ComponentNode` 写 `ownsCode: false`，子代码就会照常显示控件和输出。
- 组件引用本地文件（图片、媒体）时，把 URL 放进属性，并在节点的 `assets` 中声明（属性名到 URL），渲染端发布文件并改写属性。画在页面之上、不占版面的组件，节点写 `layer: 'overlay'`。
- 读取工作区文件用编译步骤的 `ctx.src`、`ctx.resolvers`（编译器记录依赖，`presmium dev` 据此重新编译）；用别的方式读的文件用 `ctx.watch` 声明。

新指令要同时写进 `docs/ir.md` 5.1 节的指令表和 `.agents/skills/presmium-author/references/directives.md`（`scripts/check-skills.mjs` 检查后者）。

## 4. 编译步骤、执行器、检查项

`PresmiumNodePlugin` 的其他字段（契约在 `packages/kernel/src/contracts.ts`、`packages/kernel/src/ir.ts`）：

| 字段 | 形状 | 说明 |
|---|---|---|
| `passes` | `IRPass { name, order?, after?, run(doc, ctx) }` | 在内置的编排步骤之后、编译时执行之前运行，按 `order` 排序；`after: 'execute'` 的在编译时执行之后运行，此时代码节点已有 `outputs`；`ctx` 有 `src`、`resolvers`、`lock`、`executors`、`cache`、`lang`、`config`、`configFor(section)`、`report`、`watch`、`service` |
| `executors` | `Executor { id, runsIn?, supports(lang), run(request, signal?, ctx?), fingerprint?, revision?, endSession?, params? }` | 编译时执行；`fingerprint`（运行时的身份）进入执行缓存的键；`revision` 是执行器自己影响输出的代码的修订（如 Python 运行器的摘要），也进入键，另一修订的录制不沿用、执行器可用时重新执行。`ctx`（`RunContext`）由编译器给出：代码只能得到 `ctx.env`（不读 `process.env`；没有 `ctx` 时只给 `PATH`、`LANG` 与临时的 `HOME`），有 `ctx.sandbox`（进程沙箱）时启动子进程的执行器经它运行，输入与结果经运行目录中的文件传递。`request.session` 相同的运行共享解释器、按请求顺序执行（编译器把一个会话的块一起发出），`endSession` 丢弃会话。结果的 `outputs` 是 nbformat 的富输出。Python 用共享的运行器 `@lincyaw/kernel/runner.py`（`_pm_run`、`_pm_main`），不另写一份。浏览器端的执行器写明 `runsIn`（`'browser'` 或 `'machine'`），执行面板的顶栏据此写在哪里运行，没有时只写语言 |
| `resolvers` | `AnchorResolver { scheme, resolve(...) }` | 新的锚点方案 |
| `checks` | `Check { id, run(ctx) }` | `presmium check` 运行，返回带源码位置的 `Finding[]` |
| `anchors` | `(ctx) => AnchorString[]` | `presmium check --update-lock` 要记录的锚点 |
| `renderer` | `Renderer` | 本插件就是一个渲染端（见 SKILL.md） |
| `rendererExtensions` | `{ [渲染端 ID]: { components: { [组件名]: (node, block, ctx) => unknown } } }` | 见第 7 节 |
| `vitePlugins` | `(ctx: { deckDir, workspaceRoot, config }) => unknown[]` | 两种形态的统一 Vite 扩展入口，渲染端在开发与构建中加载。只在 Node 端入口声明一次，不另建 Slidev 的注册入口；加载契约见 `docs/ir.md` 第 5、6 节。插件经虚拟模块加载文稿的文件时，Vite 的依赖扫描读不到它们：在 Vite 插件的 `config()` 中返回 `{ optimizeDeps: { entries } }`（路径经 `@lincyaw/kernel/node` 的 `literalGlob`），否则这些文件用到的库在页面加载时才被发现，开发服务器重新预打包并重载整页（参照 `addon-motion` 的 `scenesPlugin`） |
| `services` | `(ctx: NodeServiceContext) => [令牌, 实现][]` | Node 端服务；编译步骤、渲染端、检查项与服务端贡献经 `ctx.service?.(令牌)` 取用。`ctx.config` 是文稿的 `presmium.<插件 ID>`，`ctx.settings` 是运营者在工作区根目录 `presmium.workspace.yaml` 的 `settings.<插件 ID>`（文稿改不了），还有 `secret(name)`、`operatorDir`、调用时取用其他服务的 `service?.(令牌)`（如宿主的 `DOCUMENT_FILES`）。服务按当前配置与语言在每次编译时创建，各编译结果保留自己的服务快照；服务端贡献单独按挂载周期使用快照（`docs/architecture.md` 4.6、10.2 节）。一个令牌只有一个实现，重复的被忽略并警告 |
| `server` | `(ctx: ServerContext) => { routes?, proxies?, close? }` | 挂在 `/__presmium/<插件 ID>/` 下的路由（Fetch API 的 `handle(request, { member, document, rest })`，`role` 默认 `editor`；请求体默认至多 1 MiB，超过的得到 413，要收更大的请求体（如录制的分块）时写 `maxBody`；回答用 `@lincyaw/kernel` 的 `jsonResponse(data, status?)`（带 `no-store`）与 `problemResponse(status, message)`）与反向代理（路径有 `..` 或编码的 `/` 时得到 400）；每份文稿在挂载时创建，配置变化的处理见 `docs/architecture.md` 10.2 节。浏览器经 `useServer().fetch(插件 ID, 路径)` 调用。需要确认时 `ctx.service(APPROVALS).request({ kind, scope, title, from, member })`。写文稿时经 `ctx.service(DOCUMENT_FILES)?.write(changes)`（路径相对于 `ctx.workspaceRoot`；按字节位置写入用变更的 `at`），宿主未提供该服务时才直接写；`dev` 与 `serve` 的服务范围见 `docs/architecture.md` 4.5、10.2 节。Node 服务与 agent 工具同样（`NodeServiceContext.service`、`AgentToolContext.service`），范例是讲授插件的 `deckFiles`（`addon-lecture/src/node/store.ts`）与语音插件的合成缓存 |
| `roles` | `RoleSpec[]` | 行内角色 ``{名 key=value}`内容` ``（选项写成 `key=value`）；IR 中为 `presmiumRole` 节点，渲染端显示 `children`，没有子内容的在演讲者窗口与备注中显示标记 `〔名 value〕` |
| `operator` | `boolean` | 运营者插件：列在 `settings.presmium.workspace.plugins` 中、安装在工作区根目录时每份文稿都加载；`presmium serve` 的首页（文档 `''`）也挂上它的服务端部分；页面只加载文稿列出的插件的浏览器部分。首页不是文档：服务端部分在那里的 `ctx.deckDir` 与 `ctx.workspaceRoot` 都是 serve 的一个空目录（不是工作区根目录），路由在首页只回答不需要文档的请求，不读写文件 |
| `environments` | `{ [kind]: EnvironmentProvider { create(name, spec, ctx), probe? } }` | 具名环境的提供方：为头部 `execute.environments` 中该 `kind` 的环境创建编译时执行器，ID 必须是 `environmentExecutor(name)`（`presmium.env.<名>`）；`probe` 供 `presmium check --env`。浏览器端同一插件在 `setup` 中按 `ctx.environments` 为同类环境登记同 ID 的执行器（范例：`addon-exec-local` 的 `devcontainer`） |
| `tools` | `AgentTool { name, description, input, kind, run(input, ctx) }` | agent 工具：MCP 服务（`/mcp` 与 `presmium-mcp`）以 `name`（小写加下划线，与内置工具同名的被忽略）列出，`input` 是对象的 JSON Schema（MCP 另加可选的 `document`）；`kind` 为 `read` 的每个令牌都能用，`operate`、`spend` 只给作者的令牌，先经 `APPROVALS` 确认再调用。`run` 的 `ctx` 有 `document`、`member`、`service`（Node 端服务）、`signal`，返回 JSON 数据或文字 |
| `version`、`kernel` | string | 必须写：`version` 与 `package.json` 一致，`kernel` 为兼容的内核版本范围（如 `^1.0.0`），不兼容时编译器不加载 |

遍历块用 `@lincyaw/kernel` 的 `docBlocks(doc)`（含组件的子块），报错消息用 `errorMessage(error)`，语言名比较用 `languageId(lang)`。

## 5. 组件：只经过 `@lincyaw/host`

`components/PmPoll.vue` 在网页与幻灯片两种形态中共用。规则（`docs/architecture.md` 5.3 至 5.9 节）：

- 不要在模板中自己包 `PmBoundary`：渲染端在每个插件组件外面包了一层，组件自身 `setup` 或模板抛错也只影响它自己（`docs/architecture.md` 5.4 节）。
- 视觉状态是步骤的纯函数：`useStepState({ from, to })` 给出块内第 k 步的状态（`active`、`reached`、`done`），步骤从块的 `at` 算起，不要自己再减 `at`。用 `v-click="scope.step(k)"`（`const scope = useStepScope()`）向宿主登记块内第 k 步，范例见测试插件的 `e2e/fixtures/host/plugin/components/DemoStepper.vue`。
- 跟随块的显示范围停止媒体等后台资源，用 `useStepState(useBlockStepRange())`；它包含当前块与父块的范围交集，`until` 为隐藏的第一步。渲染端经 `provideStepScope(at, until?)` 或 `PmStepScope` 传入绝对范围，原有块内步骤偏移不变；阅读形态展开内容的策略按 `useViewRole()` 判断。
- 动画读 `usePrefersReducedMotion()`，开启时直接显示终态。按时间演的动画用 `useStepTime({ until })`：它给出所在步骤开始以来的毫秒数，停定时（后退、文档视图、减少动态效果、`until` 之后）为 `Infinity`；讲授回放与导出视频时由讲授的时刻驱动。画面要是（步骤，步内时间）的纯函数：把动画库的时间轴暂停，只在时间变化时定位，不按页面时间自己播放。需要异步准备画面（载入模块、WebGL）时用 `useService(STEP_CLOCK).value?.wait(promise)` 登记，导出在截图前等它（`docs/architecture.md` 4.4 节，范例 `packages/addon-motion/src/client/SceneView.vue`）。
- 组件的动作（重置、播放、下一项）用 `useActions(元素, { 名: (seeking) => … }, { clear })` 起名，按钮调用返回的 `run(名)`：讲授录下它（`click` 操作），讲解中的 ``{cue to=<块>}`click <名>` `` 在说到时执行它，跳转时宿主先 `clear` 再依次重放。
- 界面文本：`const t = useMessages(CATALOG)`（`CATALOG` 为 `{ 'zh-CN': {...}, en: {...} }`），模板中用 `t.value.xxx`；组件之外用 `CATALOG[currentLocale()]`。语言由 `<html lang>` 决定，不要自己判断或观察它。
- 配置：`useSectionConfig(POLL_ID)` 是全局配置合并本章节 `{config}` 后的结果。
- 服务：`useService(TOKEN)`；跨窗口或跨设备的状态：`useSharedState('presmium.poll:<key>', initial, { scope: 'view' | 'local' | 'remote' })`，键以插件 ID 开头。
- 静态导出：带 `fallback` 的组件在 PDF、PNG 中由宿主换成降级内容；需要自己判断时读 `useStaticRender()`。
- 绘制在其他内容之上、自身不占版面的浮层组件，由指令把节点标为 `layer: 'overlay'`（例如引导插件的 `{cursor}`），渲染端不给它单独的位置。
- 全部展开的文档视图（`useHost().useStep()` 为无穷大）中，有内部步骤的组件可以给读者自己的步进控件；视觉状态是（章节步骤，本地步骤）的纯函数（`docs/architecture.md` 5.3 节，范例 `packages/addon-exec/components/PmStepRun.vue`）。
- 持有 Worker、定时器等资源的服务在插件的 `dispose` 中释放：页面从往返缓存恢复时内核会再次启动插件。 只有确认 `dispose` 完整停止 Worker、排队任务、流式请求、媒体轨道与计时器，且同一插件定义可再次 `setup` 时，才在 `PluginDefinition` 上声明 `restartable: true`。此外，组件、viewer、client 模块与 Vite 注入的每个来源包（含文稿本地模块）都须在 `package.json` 声明 `presmium.preview.restartable: true`；任一来源未声明或加载失败时工作台销毁该预览，避免缓存留下后台工作。可缓存网页切走时仍会真正卸载组件并停止内核，不能用隐藏或 `KeepAlive` 代替清理。
- 工作台的预览中网页的 `<html>` 带 `pm-in-workbench` 类：只在放映、录制时才有意义的界面（录制工具条、放映控制）在这时用 CSS 隐藏，作者在工作台里编辑时看不到它们（`packages/addon-lecture/src/client/RecorderPanel.vue`）。
- 样式与控件用设计系统（`docs/architecture.md` 5.10 节）：颜色、字体、间距、圆角与阴影只用 `@lincyaw/host` 的令牌（`var(--pm-color-ink)`、`var(--pm-color-muted)`、`var(--pm-color-accent)`、`var(--pm-font-sans)`、`var(--pm-space-3)`、`var(--pm-radius-control)` 等），不写死颜色，暗色随令牌切换；按钮、输入框、徽标、卡片、分段控件、标签页、弹层、抽屉、对话框、菜单、空状态与提示用 `PmButton`、`PmIconButton`、`PmField`（类 `pm-ui-input`、`pm-ui-select`、`pm-ui-textarea`）、`PmBadge`、`PmCard`、`PmSegmented`、`PmTabs`、`PmPopover`、`PmDrawer`、`PmDialog`、`PmMenu`、`PmEmpty`、`PmNotice`，图标用 `PmIcon`（`ICONS` 中的名字），不用 emoji；也可以直接用 `pm-ui-*` 类。文字对背景达到 WCAG AA，标识输入框与选中状态的边框对相邻颜色达到 3:1（用 `line-strong`），`e2e/design.spec.ts` 与 `e2e/fixtures/contrast.ts` 的 `lowContrast` 两项都查（`e2e/plugin-ui.spec.ts` 用后者查插件组件与幻灯片主题）。文稿中的组件（幻灯片、放映视图按字号缩放）在根元素上把 `--pm-text-sm`、`--pm-text-md` 设为 em，控件随周围的文字缩放（`packages/addon-classroom/src/client/style.css`）；工具栏中的弹层与面板保持宿主的字号。幻灯片形态中 Slidev 的重置样式让 `[type=button]` 透明、特异性与 `pm-ui-button` 相同，`addon-core/style.css` 补回按钮的填充。

## 6. 浏览器端注册

- `src/client/plugin.ts` 默认导出 `PluginDefinition`：`{ manifest: { id: POLL_ID, version, kernel: '^1.0.0', provides?, requires?: [{ token, optional? }] }, setup(ctx) { ctx.provide(TOKEN, impl) }, dispose?() {} }`，`version` 取自包的 `package.json`（`import { version } from '../../package.json'`）。没有浏览器端服务时可以不写。
  - 网页形态：`@lincyaw/web` 自动导入 `plugins` 中每个包的这个文件并注册。
  - 幻灯片形态：`setup/main.ts` 注册它：

    ```ts
    import { registerPresmiumPlugin } from '@lincyaw/host'
    import { defineAppSetup } from '@slidev/types'
    import pollPlugin from '../src/client/plugin.ts'

    export default defineAppSetup(() => {
      registerPresmiumPlugin(pollPlugin)
    })
    ```

- 工具栏项：`ctx.tryGet(TOOLBAR)?.register({ id, title, component, order?, slot?, icon? })`，在 `dispose` 中取消。`slot`：`tools`（默认，页面的工具栏）、`settings`、`status`（状态栏）。组件用 `useToolbarPlacement()` 得知自己画在哪里（`bar` 或 `status`）；打开面板的项用 `PmToolbarEntry`（`name`、`label`、`closeLabel`、`icon`、`v-model:open`），它是带文字的按钮与弹层（弹层留在窗口内）。
- `components/*.vue`：幻灯片形态由 Slidev 自动注册；网页形态由 `@lincyaw/web` 按文件名注册（文稿自己的 `components/` 覆盖同名组件；文稿自己的组件以插件 ID `deck` 登记）。
- 讲授能录下、回放的操作（`docs/ir.md` 9.2 节）：用户做了一件值得重放的事时 `presmiumService(OPERATIONS)?.report({ type, data })`（数据以章节、块 `<章节>/<块>` 与相对坐标为坐标，不用像素）；在内核插件的 `setup` 中 `ctx.tryGet(OPERATIONS)?.onReplay(type, { apply(data, seeking), clear() })` 登记重放，`dispose` 中取消。视觉状态要是“此前的操作”的函数：依次重放与跳转后的一次折叠（`clear()` 后以 `seeking` 为 true 重放）必须得到同一画面。范例：`packages/addon-guide/src/client/operation-cues.ts`（`spot`、`hint`）、`packages/addon-lecture/src/client/pointer-ink.ts`（`point`、`ink`）。
- `src/client/viewer.ts`（只用于网页形态）默认导出视图插件 `(ctx) => void`；`ctx` 有 `registerView`、`registerNodeRenderer`、`registerComponent`、`registerAction`、`registerLayer`、`useViewer`、`SectionView`、`BlockView`。`registerLayer` 的 `scope` 默认 `'viewport'`，用于播放器、课堂状态与黑屏；需要以视图为基准定位的冻结画面、徽标与录制面板用 `'view'`。两者都在模态焦点范围内，完整契约见 `docs/architecture.md` 5.1 节。只以类型方式引用 `@lincyaw/viewer`（`import type { ViewerPlugin } from '@lincyaw/viewer'`）。范例：`packages/addon-stage/src/client/viewer.ts`（动作与图层）、`packages/viewer/test/fixtures/plugin-deck/plugin/src/client/viewer.ts`（视图）。

## 7. 静态渲染端：扩展与 `fallback`

渲染端遇到组件节点时：

| 渲染端 | 有扩展 | 没有扩展 |
|---|---|---|
| `slides` | 写入扩展返回的 Slidev Markdown；扩展抛错时报告警告并改用组件标签 | 写组件标签 `<PmPoll question="…" :choices='[…]'>`，子块放进插槽（子块中的代码块不带运行控件与录制输出）；有 `fallback` 时外面包 `PmStaticFallback`，导出 PDF 时显示降级内容；最外层都包 `PmBoundary` |
| `notebook` | 写入扩展返回的单元格；返回 `undefined` 时退回 `fallback`，返回 `[]` 时什么都不写 | 渲染 `fallback`；也没有 `fallback` 时写一行说明并链接网页版，构建报告列出该块 |
| `web` | — | IR 运行时按组件名找到组件；找不到时显示 `fallback` |

notebook 扩展返回一个或一组单元格：字符串是 Markdown 单元格，对象为 `{ cell_type: 'markdown' | 'code' | 'raw', source, metadata?, outputs?, execution_count? }`，或 `{ cell_type: 'markdown', mdast }`：渲染端把 mdast 与正文一样降为 Jupyter 能显示的 Markdown，复制其中的本地文件并报告降级（`packages/render-notebook/src/domain/notebook.ts` 的 `NotebookCellInput`）。写代码单元格前用 `languageId` 比较代码与内核的语言（`ctx.config.kernel`，默认 Python），不要写死 Python。

```ts
rendererExtensions: {
  notebook: { components: { PmPoll: node => `**${String(node.props.question)}**` } },
},
```

扩展的第三个参数 `ctx` 是该渲染端的 `RenderContext`（`outDir`、`workDir`、`deckDir`、`config`、`lang` 等）。编译时写入产物的文本按 `deckLocale(ctx.lang)` 选择中文或英文。范例：`packages/addon-exec/src/node/notebook-cells.ts`（代码单元格或 mdast 单元格）。

## 8. 测试与文档

- 集成测试：`packages/addon-poll/test/*.test.ts`，在临时目录写一份文稿，`plugins` 写本包的绝对路径，用 `@lincyaw/cli/testing` 的 `presmium(cwd, args)` 真正运行 CLI 构建，检查产物（范例 `packages/addon-exec/test/compile.test.ts`）。
- 端到端：测试文稿放 `e2e/fixtures/poll/`，用例 `e2e/poll.spec.ts` 用 `useFixture('poll')` 在 `beforeAll` 中构建（见 `references/testing.md`）。两种形态各测一遍。
- 文档：新指令写入 `docs/ir.md` 的指令表与 `.agents/skills/presmium-author/references/directives.md`；面向使用者的写法同步 `site/plugins/lecture.md`。第三方插件项目则更新自己的使用示例与接口说明。
