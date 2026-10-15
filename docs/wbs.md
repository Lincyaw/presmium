# Presmium 工作分解

每个工作包（WP）由一个开发代理在独立的 git worktree 中完成，完成后经独立验证，再合并到 `main`。工作包之间的文件归属互不重叠；根目录配置只由 WP-00 创建。

## 开发波次

| 波次 | 工作包 | 前置 |
|---|---|---|
| A | WP-00 工程骨架 | — |
| B（M0） | WP-01 内核、WP-02 宿主适配、WP-03 检查命令 | A |
| C（M1、M2） | WP-10 讲台、WP-11 代码引用、WP-12 网页形态、WP-20 浏览器执行、WP-21 本地环境、WP-22 引导、WP-23 富内容、WP-24 发布 | B |
| D（M3） | WP-30 会话与同步，然后 WP-31 课堂功能 | C |

## 通用完成标准

每个工作包都必须满足：

1. `pnpm test` 中本包的单元测试全部通过。
2. 领域层（`src/domain`）不引用 `vue`、`@slidev/*`、`node:*`。
3. 示例文稿中本包的页面 `examples/demo/pages/<ctx>.md` 能通过 `pnpm demo:build` 构建；WP-12 合并后，还必须通过 `pnpm demo:web` 构建。
4. 本包的端到端测试 `e2e/<ctx>.spec.ts` 全部通过。
5. 只修改本包拥有的路径。需要改动他人路径时，在交付报告中说明，不直接修改。
6. 不 fork、不引用 Slidev 内部路径，只用公开接口（`@slidev/client` 入口导出、`@slidev/types`、文档中的 setup 钩子与约定目录）。Slidev 与 VitePress 文档的本地副本在 `vendor/docs/`（由 `scripts/fetch-docs.sh` 下载，不入库），查接口先查文档，不读框架源码。
7. 组件只从 `@presmium/host` 获取步骤状态与服务，不直接使用 `@slidev/client`（`addon-core` 除外），以保证网页形态可用。

## WP-00 工程骨架

**拥有**：根目录全部配置文件，`packages/*/package.json` 骨架，`packages/kernel/src/contracts.ts`，`examples/demo/slides.md`，`e2e/smoke.spec.ts`，`playwright.config.ts`。

**交付**：

- pnpm 工作区、`tsconfig.base.json`、Vitest 工作区配置、Playwright 配置。
- 每个包的 `package.json`（依赖预先声明完毕）与空的目录结构。
- 内核契约 `contracts.ts`（见 `architecture.md` 第 3 节）。
- 示例文稿入口，`src:` 引入各上下文页面（先放占位页面）。
- 根脚本：`test`、`demo:build`、`demo:check`、`e2e`、`verify`。

**验收**：`pnpm install` 成功；`pnpm demo:build` 成功；`pnpm e2e` 的冒烟测试通过（首页可打开、翻页可用）。

## WP-01 内核

**拥有**：`packages/kernel/`（`contracts.ts` 可补充，但不得破坏已有签名）。

**需求**：K-07、K-08、K-10、K-16 的领域部分。

**交付**：`Kernel`、`ServiceRegistry`（拓扑排序、可选依赖、环路检测、版本范围检查）、`EventBus`、`AnchorResolverRegistry`、指纹函数（归一化空白后哈希）、`AnchorLock` 读写模型、`CheckRegistry`。

**验收**（Vitest）：

- 依赖按拓扑顺序初始化；必需依赖缺失时插件禁用，可选依赖缺失时降级。
- 依赖环上的插件全部禁用，报告列出环路。
- 内核版本范围不兼容时禁用。
- 插件初始化抛错只影响自身及必需依赖它的插件。
- 替换 `session` 的实现时，依赖方插件拿到的是新实现。
- 解析器注册表按 scheme 分派；未知 scheme 返回 `lost` 并带说明。

## WP-02 宿主适配

**拥有**：`packages/host/`、`packages/addon-core/`、`examples/demo/pages/core.md`、`e2e/core.spec.ts`。

**需求**：K-04、K-05、K-06、K-07 的宿主部分，N-06 的减少动态效果。

**交付**：

- `@presmium/host`：`HostAdapter` 接口与 `installHost`；组合式函数 `useStepState`、`useCursor`、`useViewRole`、`useService`、`usePresentationMode`、`usePrefersReducedMotion`；`PmBoundary` 组件；`registerPresmiumPlugin` 与内核启动（`startPresmium`）。
- `addon-core`（Slidev 实现）：在 `setup/main.ts` 中注入 Slidev 版 `HostAdapter`，读取 headmatter 的 `presmium` 配置并启动内核。
- `presenterPanels` 服务与演讲者面板图层：只在演讲者视图显示；默认面板显示内核启动报告。
- `SyncTransport` 端口：对 `addSyncMethod` 的封装，供 WP-30 接入网络传输。
- 形态标记：幻灯片形态隐藏 `doc-only` 内容。

**验收**：

- 单元：`useStepState` 在给定步骤下的结果；`PmBoundary` 捕获子组件错误。
- 端到端：访问 `/<页>?clicks=3` 与从第 0 步按三次右键，页面 DOM 一致。
- 端到端：示例页中故意抛错的组件显示错误占位，同页其他内容正常。
- 端到端：演讲者面板只出现在 `/presenter/<页>`，不出现在听众视图。
- 端到端：模拟 `prefers-reduced-motion: reduce` 时，示例动画组件直接显示终态。

## WP-03 检查命令

**拥有**：`packages/cli/`。

**需求**：K-16。

**交付**：`presmium check [deckDir] [--json] [--update-lock]`。用 `@slidev/parser` 解析文稿（含 `src:` 引入），从 headmatter 的 `addons` 中加载各包的 `./presmium` 入口，汇总解析器与检查项后运行。

**验收**（Vitest，使用测试夹具文稿）：

- 无问题时退出码 0；存在 `error` 诊断时退出码 1；参数错误时退出码 2。
- 文本输出带 `文件:行号`；`--json` 输出可被解析。
- `--update-lock` 生成 `.presmium/anchors.lock.json`，再次运行结果稳定。
- 内置检查项：headmatter 中声明的插件包无法加载时报 `error`。

## WP-10 讲台

**拥有**：`packages/addon-stage/`、`examples/demo/pages/stage.md`、`e2e/stage.spec.ts`。

**需求**：P-01 至 P-04。

**交付**：基础内容的示例与必要样式；步骤备注只突出当前步骤（宿主的 `[click]` 标记加样式定制）；冻结画面（快捷键 `b` 黑屏、`f` 冻结，通过 `setup/shortcuts` 与全局图层实现，状态同步到听众视图）；圈画标注开启持久化。

**验收**：表格、脚注、代码高亮可见；演讲者视图中当前步骤的备注被突出、其他步骤的备注被弱化；按 `b` 后听众视图被遮挡，再按恢复；标注持久化配置生效。

## WP-11 代码引用

**拥有**：`packages/addon-code/`、`examples/sample-repo/`、`examples/demo/pages/code.md`、`e2e/code.spec.ts`。

**需求**：K-09、K-10（解析器）、P-10 至 P-16。

**交付**：

- 文稿语法：`coderef` 代码块，内容为 YAML：`anchor`、可选 `pin`、可选 `steps`（逻辑单元名列表）、可选 `variants`（提交列表，用于多版本切换）、可选 `lang`。
- Markdown 转换（`setup/transformers`）：在构建时解析锚点、按 `pin` 从 git 读取内容、把 `steps` 换算为行高亮点击序列、生成永久链接，输出 `<PmCodeRef>` 组件包裹的标准代码块；`variants` 输出 Magic Move 代码块。
- 解析器：`region`（与 Slidev `#region` 标记语法一致）、`symbol`（基于 ast-grep）。
- 检查项：锚点失效、`fuzzy` 待确认、锁定提交之后代码有变更（漂移，附差异）。
- `PmCodeRef` 组件：显示文件路径、提交、跳转链接、漂移状态徽标。

**验收**：

- 单元：`region` 与 `symbol` 解析器四种状态；在被引用文件中插入空行或格式化后仍为 `exact` 或 `moved`。
- 单元：`steps` 换算的行号与逻辑单元一致。
- 集成：修改 `sample-repo` 中被锁定代码后，`presmium check` 报告漂移并给出差异。
- 端到端：代码块随步骤依次高亮各逻辑单元；跳转链接指向远端仓库对应提交与行区间；多版本代码块随步骤切换。
- 构建产物中的永久链接在导出 PDF 后仍可点击（与 WP-24 联合验证，本包只保证链接存在于 DOM）。

## WP-12 网页形态

**拥有**：`packages/web/`、`examples/demo/pages/web.md`、`e2e/web.spec.ts`。

**需求**：P-70 至 P-74、N-05。

**交付**：

- 文稿转换：用 `@slidev/parser` 解析文稿，每个 `src:` 引入的文件生成一个 VitePress 页面，每页幻灯片生成一个章节（锚点来自页 ID 或标题）；备注按 `[click]` 切分为正文段落；调用各插件的 `transformMarkdown`；Slidev 专有语法按降级规则处理（`v-click` 系列、布局插槽、`slide-only`）。
- VitePress 宿主适配：网页版 `HostAdapter`（`mode: 'document'`），注册各插件包的 `components/` 与 `src/client/plugin.ts`；提供 `v-click`、`v-after`、`v-clicks` 等兼容实现。
- 搜索：VitePress 本地搜索，配置中文分词（`Intl.Segmenter`），索引包含备注与代码。
- 翻阅：侧边目录、页内大纲、上一节与下一节。
- 滚动叙事（P-73）：页 frontmatter `presmium: { web: { layout: scrolly } }` 时，幻灯片内容固定在一侧，正文随滚动推进步骤。
- 形态切换（P-74）：网页章节提供“在幻灯片中打开”链接；幻灯片形态的导航栏提供“在网页中阅读”按钮（以 `custom-nav-controls` 实现，放在本包的 Slidev 插件部分）。
- 命令：`presmium-web dev|build <deckDir> [--out]`。

**验收**：

- 单元：转换结果的章节数等于页数；`[click]` 切分；降级规则；锚点稳定。
- 端到端：网页包含每页内容与备注；中文关键字搜索 300 ms 内出结果，点击进入对应章节；断网后搜索可用；手机视口（375 px）无横向滚动；滚动叙事页随滚动推进步骤；两种形态互跳停在对应位置。

## WP-20 浏览器执行

**拥有**：`packages/addon-exec/`、`examples/demo/pages/exec.md`、`e2e/exec.spec.ts`。

**需求**：P-20、P-21、P-23、P-24；`executor` 服务。

**交付**：

- `ExecutorRouter`：汇总多个执行器，按语言分派；作为 `executor` 服务提供。
- Pyodide 执行器（P-23），通过 `setup/code-runners` 让 Monaco Runner 支持 `python`。
- `PmRunPanel`：参数表单、重跑、运行记录、两次结果对比（P-20）。
- 分步执行（P-21）：Python 逐行追踪生成 `Trace`，每行一个步骤，高亮当前行并显示累计输出。
- 预录输出回退（P-24）：执行失败或超时显示预录输出并标注。

**验收**：

- 单元：路由分派、运行记录对比、轨迹到步骤的映射、回退规则。
- 端到端：Python 代码在浏览器中运行并输出结果；修改参数重跑后对比视图显示差异；分步执行后退时输出回到上一步；故意超时的代码显示预录输出。

## WP-21 本地环境

**拥有**：`packages/addon-exec-local/`、`examples/sample-repo/.devcontainer/`、`examples/demo/pages/exec-local.md`、`e2e/exec-local.spec.ts`。

**需求**：P-22、P-25、P-26、K-09 的写回部分。

**交付**：一个独立插件，开发服务器模式下生效：

- 容器执行器（P-22）：读取仓库 devcontainer 定义，在对应镜像中执行代码；作为第二个 `executor` 实现注册，演示执行器可替换。
- 编辑回写（P-25）：把演示中修改的代码写回被引用文件并在新分支上提交。
- 环境复刻（P-26）：导出当前代码片段与 devcontainer 定义为可下载的压缩包。

**验收**：

- 单元：devcontainer 解析、提交消息与分支命名、压缩包内容清单。
- 集成（无 Docker 时跳过并标记）：容器内执行 Python 输出正确。
- 集成：写回后目标仓库出现新分支与提交，原分支不变。

## WP-22 引导

**拥有**：`packages/addon-guide/`、`examples/demo/pages/guide.md`、`e2e/guide.spec.ts`。

**需求**：P-30 至 P-32、N-06。

**交付**：`PmCursor`（路径点与动作，由步骤驱动）、`PmSpotlight`（基于 driver.js 的遮罩高亮，由步骤驱动）、`PmHint`（可交互元素的提示动画）。

**验收**：各步骤下光标位置、聚光目标、提示状态正确；后退可逆；减少动态效果时直接显示终态。

## WP-23 富内容

**拥有**：`packages/addon-content/`、`examples/demo/pages/content.md`、`e2e/content.spec.ts`。

**需求**：P-40 至 P-43。

**交付**：公式、Mermaid、PlantUML 示例；`markmap` 代码块渲染思维导图；音视频与动图示例（播放控制、尺寸属性）；自定义 Web 组件嵌入示例。

**验收**：各类内容在构建产物中渲染出预期 DOM；Web 组件保留交互（点击改变状态）。

## WP-24 发布

**拥有**：`packages/addon-publish/`、`examples/demo/pages/publish.md`、`e2e/publish.spec.ts`。

**需求**：P-50 至 P-53、N-03。

**交付**：

- 导出（P-50）：封装 `slidev export`，导出后校验 PDF 中保留超链接。
- 离线（P-51）：启用 PWA 与远程资源本地化；Pyodide 资源纳入缓存。
- 高对比度主题（P-52）：切换开关与 CSS 变量。
- 可视化差异（P-53）：`presmium-diff <refA> <refB>` 导出两个提交的逐页截图，用 pixelmatch 比较，输出报告。

**验收**：导出的 PDF 中含有代码永久链接；离线模式下重新加载页面可放映；高对比度切换后对比度达到 WCAG AA；对同一提交运行差异报告结果为零差异，修改一页后该页被列出。

## WP-30 会话与同步

**拥有**：`packages/addon-session/`、`packages/classroom-server/`、`examples/demo/pages/session.md`、`e2e/session.spec.ts`。

**需求**：P-60、P-61、P-62、K-06 的网络部分。

**交付**：

- `classroom-server`：基于 y-websocket 的房间服务。
- 网络传输：以 Yjs 实现 `SyncTransport`，并通过 `addSyncMethod` 接入 Slidev 的状态同步。
- `session` 服务：创建课堂、链接或二维码加入（`?room=&name=`）、角色、结束；`classroomStore` 服务：基于 Yjs 共享文档的集合读写。
- 跟随与自主（P-62）：学习者切换模式，一键回到主讲进度。

**验收**：端到端起两个浏览器上下文：主讲翻页后学习者跟随；学习者切到自主后不再跟随，一键回到主讲进度；课堂结束后学习者看到结束状态。

## WP-31 课堂功能

**拥有**：`packages/addon-classroom/`、`examples/demo/pages/classroom.md`、`e2e/classroom.spec.ts`。

**需求**：P-63 至 P-67。依赖 WP-30 的服务与 WP-20 的 `executor`。

**交付**：学习笔记（挂载锚点，仅本人可见）、课堂测验（主讲开放与关闭、实时统计）、练习校验（调用 `executor` 跑测试用例，标记典型错误）、提问（挂载到页或锚点）、理解度汇聚（演讲者面板显示分布）。

**验收**：

- 单元：每人只计最后一次作答；关闭后不再接受；课堂结束后拒绝写入；笔记仅作者可见。
- 端到端：三个浏览器上下文（主讲、两名学习者）完成一轮测验，统计正确；提问出现在演讲者面板并标注所在页；练习提交后返回校验结果。
