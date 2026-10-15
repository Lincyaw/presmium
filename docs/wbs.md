# Presmium 工作分解

每个工作包（WP）由一个开发代理在独立的 git worktree 中完成，完成后经独立验证，再合并到 `main`。工作包之间的文件归属互不重叠；根目录配置只由 WP-00 创建。

## 开发波次

| 波次 | 工作包 | 前置 |
|---|---|---|
| A | WP-00 工程骨架、WP-01 内核 | — |
| B（M0） | WP-02 宿主适配、WP-03 检查命令 | A |
| C（M1、M2） | WP-10 讲台、WP-11 代码引用、WP-12 网页形态、WP-20 浏览器执行、WP-21 本地环境、WP-22 引导、WP-23 富内容、WP-24 发布 | B |
| R（MR） | 先 WP-40 编译器；再并行 WP-41 幻灯片渲染端、WP-42 IR 运行时与网页渲染端、WP-43 notebook 渲染端；再并行 WP-44 代码与执行插件迁移、WP-45 展示类插件迁移；最后 WP-46 跨包整合 | C |
| D（M3） | WP-30 会话与同步，然后 WP-31 课堂功能（均基于 IR 管线，网页与幻灯片两种形态） | R |
| E（M4） | WP-50 语言服务与预览同步 | R |

## 测试原则

- **只写集成测试，不写单元测试。** 测试必须在真实组装的系统上运行：构建示例文稿后用 Playwright 测两种形态的产物，对测试用文稿真正运行 CLI，真正启动课堂服务。不对单个函数或类做隔离测试，不用 mock 替代宿主框架。
- **控制数量。** 每条验收标准对应一到两个用例，不追求边界情况的穷举。
- **测试位置。** 端到端测试放在 `e2e/<ctx>.spec.ts`；不经过浏览器的集成测试（CLI、构建产物检查、服务端）放在 `packages/<pkg>/test/*.test.ts`，由 `pnpm test` 运行。
- **结构检查。** 分层规则由 `scripts/check-layering.mjs` 检查，包含在 `pnpm test` 中。

## 通用完成标准

每个工作包都必须满足：

1. `pnpm test` 通过（含分层检查）。
2. 示例文稿中本包的页面 `examples/demo/pages/<ctx>.md` 能通过 `pnpm demo:build` 构建；WP-12 合并后，还必须通过 `pnpm demo:web` 构建。
3. 本包的端到端测试 `e2e/<ctx>.spec.ts` 全部通过。
4. 只修改本包拥有的路径。需要改动他人路径时，在交付报告中说明，不直接修改。
5. 不 fork、不引用 Slidev 内部路径，只用公开接口（`@slidev/client` 入口导出、`@slidev/types`、文档中的 setup 钩子与约定目录）。Slidev 与 VitePress 文档的本地副本在 `vendor/docs/`（由 `scripts/fetch-docs.sh` 下载，不入库），查接口先查文档，不读框架源码。
6. 组件只从 `@presmium/host` 获取步骤状态与服务，不直接使用 `@slidev/client`（`addon-core` 除外），以保证网页形态可用。

## WP-00 工程骨架（已完成）

pnpm 工作区、TypeScript 与 Vitest 配置、Playwright 配置、各包 `package.json`、内核契约 `contracts.ts`、宿主契约 `host/src/types.ts`、示例文稿骨架、冒烟测试。

## WP-01 内核（已完成）

`Kernel`、`ServiceRegistry`、`EventBus`、`AnchorResolverRegistry`、指纹、`AnchorLock`、`CheckRegistry`。内核的行为由 WP-02（插件启动、降级、故障隔离）与 WP-03（锚点、检查）的集成测试覆盖。

## WP-02 宿主适配

**拥有**：`packages/host/`、`packages/addon-core/`、`examples/demo/pages/core.md`、`e2e/core.spec.ts`。

**需求**：K-04、K-05、K-06、K-07 的宿主部分，N-06 的减少动态效果。

**交付**：

- `@presmium/host`：`HostAdapter` 接口与 `installHost`；组合式函数 `useStepState`、`useCursor`、`useViewRole`、`useService`、`usePresentationMode`、`usePrefersReducedMotion`；`PmBoundary` 组件；`registerPresmiumPlugin` 与内核启动（`startPresmium`）。
- `addon-core`（Slidev 实现）：在 `setup/main.ts` 中注入 Slidev 版 `HostAdapter`，读取 headmatter 的 `presmium` 配置并启动内核。
- `presenterPanels` 服务与演讲者面板图层：只在演讲者视图显示；默认面板显示内核启动报告。
- `SyncTransport` 端口：对 `addSyncMethod` 的封装，供 WP-30 接入网络传输。
- 形态标记：幻灯片形态隐藏 `doc-only` 内容。
- 示例页：包含两个演示用插件（一个提供服务、一个依赖该服务）、一个缺少必需服务的插件、一个故意抛错的组件、一个步骤驱动的组件、一个动画组件。

**验收**（Playwright）：

- 访问 `/<页>?clicks=3` 与从第 0 步按三次右键，页面 DOM 一致。
- 依赖服务的插件拿到了提供方的实现；缺少必需服务的插件在启动报告中为已禁用。
- 故意抛错的组件显示错误占位，同页其他内容正常。
- 演讲者面板只出现在 `/presenter/<页>`，不出现在听众视图。
- 模拟 `prefers-reduced-motion: reduce` 时，动画组件直接显示终态。

## WP-03 检查命令

**拥有**：`packages/cli/`。

**需求**：K-16。

**交付**：`presmium check [deckDir] [--json] [--update-lock]`。用 `@slidev/parser` 解析文稿（含 `src:` 引入），从 headmatter 的 `addons` 中加载各包的 `./presmium` 入口，汇总解析器与检查项后运行。检查项崩溃时，诊断的源码位置默认为文稿入口文件。

**验收**（集成测试：对 `packages/cli/test/fixtures/` 下的测试文稿真正运行 CLI 进程）：

- 无问题时退出码 0；存在 `error` 诊断时退出码 1；参数错误时退出码 2。
- 文本输出带 `文件:行号`；`--json` 输出可被解析。
- `--update-lock` 生成 `.presmium/anchors.lock.json`，再次运行结果稳定。
- headmatter 中声明的插件包无法加载时报 `error`。

## WP-10 讲台

**拥有**：`packages/addon-stage/`、`examples/demo/pages/stage.md`、`e2e/stage.spec.ts`。

**需求**：P-01 至 P-04。

**交付**：基础内容的示例与必要样式；步骤备注只突出当前步骤（宿主的 `[click]` 标记加样式定制）；冻结画面（快捷键 `b` 黑屏、`f` 冻结，通过 `setup/shortcuts` 与全局图层实现，状态同步到听众视图）；圈画标注开启持久化。

**验收**（Playwright）：表格、脚注、代码高亮可见；演讲者视图中当前步骤的备注被突出、其他步骤的备注被弱化；按 `b` 后听众视图被遮挡，再按恢复；标注持久化配置生效。

## WP-11 代码引用

**拥有**：`packages/addon-code/`、`examples/sample-repo/`、`examples/demo/pages/code.md`、`e2e/code.spec.ts`。

**需求**：K-09、K-10（解析器）、P-10 至 P-16。

**交付**：

- 文稿语法：`coderef` 代码块，内容为 YAML：`anchor`、可选 `pin`、可选 `steps`（逻辑单元名列表）、可选 `variants`（提交列表，用于多版本切换）、可选 `lang`。
- `transformMarkdown`（两种形态共用）：解析锚点、按 `pin` 从 git 读取内容、把 `steps` 换算为行高亮点击序列、生成永久链接，输出 `<PmCodeRef>` 组件包裹的标准代码块；`variants` 输出 Magic Move 代码块。幻灯片形态经 `setup/transformers` 调用。
- 解析器：`region`（与 Slidev `#region` 标记语法一致）、`symbol`（基于 ast-grep）。
- 检查项：锚点失效、`fuzzy` 待确认、锁定提交之后代码有变更（漂移，附差异）。
- `PmCodeRef` 组件：显示文件路径、提交、跳转链接、漂移状态徽标。

**验收**：

- 集成（CLI）：在被引用文件中插入空行或重新缩进后，`presmium check` 仍通过；删除锚点后报 `error`；修改锁定后的代码后报告漂移并给出差异。
- 端到端：代码块随步骤依次高亮各逻辑单元；跳转链接指向远端仓库对应提交与行区间；多版本代码块随步骤切换。

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

**验收**（Playwright，对 `pnpm demo:web` 的产物）：

- 网页章节数等于幻灯片页数，每章包含该页内容与备注。
- 中文关键字搜索 300 ms 内出结果，点击进入对应章节；断网后搜索可用。
- 手机视口（375 px）无横向滚动。
- 滚动叙事页随滚动推进步骤。
- 两种形态互跳停在对应位置。

## WP-20 浏览器执行

**拥有**：`packages/addon-exec/`、`examples/demo/pages/exec.md`、`e2e/exec.spec.ts`。

**需求**：P-20、P-21、P-23、P-24；`executor` 服务。

**交付**：

- `ExecutorRouter`：汇总多个执行器，按语言分派；作为 `executor` 服务提供。
- Pyodide 执行器（P-23），通过 `setup/code-runners` 让 Monaco Runner 支持 `python`。
- `PmRunPanel`：参数表单、重跑、运行记录、两次结果对比（P-20）。
- 分步执行（P-21）：Python 逐行追踪生成 `Trace`，每行一个步骤，高亮当前行并显示累计输出。
- 预录输出回退（P-24）：执行失败或超时显示预录输出并标注。

**验收**（Playwright）：Python 代码在浏览器中运行并输出结果；修改参数重跑后对比视图显示差异；分步执行后退时输出回到上一步；故意超时的代码显示预录输出。

## WP-21 本地环境

**拥有**：`packages/addon-exec-local/`、`examples/sample-repo/.devcontainer/`、`examples/demo/pages/exec-local.md`、`e2e/exec-local.spec.ts`。

**需求**：P-22、P-25、P-26、K-09 的写回部分。

**交付**：一个独立插件，开发服务器模式下生效：

- 容器执行器（P-22）：读取仓库 devcontainer 定义，在对应镜像中执行代码；作为第二个 `executor` 实现注册，演示执行器可替换。
- 编辑回写（P-25）：把演示中修改的代码写回被引用文件并在新分支上提交。
- 环境复刻（P-26）：导出当前代码片段与 devcontainer 定义为可下载的压缩包。

**验收**（集成测试，针对 Vite 开发服务器端点；无 Docker 时容器用例跳过并标记）：容器内执行 Python 输出正确；写回后目标仓库出现新分支与提交，原分支不变；导出的压缩包包含片段与 devcontainer 定义。

## WP-22 引导

**拥有**：`packages/addon-guide/`、`examples/demo/pages/guide.md`、`e2e/guide.spec.ts`。

**需求**：P-30 至 P-32、N-06。

**交付**：`PmCursor`（路径点与动作，由步骤驱动）、`PmSpotlight`（基于 driver.js 的遮罩高亮，由步骤驱动）、`PmHint`（可交互元素的提示动画）。

**验收**（Playwright）：各步骤下光标位置、聚光目标、提示状态正确；后退可逆；减少动态效果时直接显示终态。

## WP-23 富内容

**拥有**：`packages/addon-content/`、`examples/demo/pages/content.md`、`e2e/content.spec.ts`。

**需求**：P-40 至 P-43。

**交付**：公式、Mermaid、PlantUML 示例；`markmap` 代码块渲染思维导图；音视频与动图示例（播放控制、尺寸属性）；自定义 Web 组件嵌入示例。

**验收**（Playwright）：各类内容在构建产物中渲染出预期 DOM；Web 组件保留交互（点击改变状态）。

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

**拥有**：`packages/addon-session/`、`packages/classroom-server/`、`examples/demo/pages/session.md`、`e2e/session.spec.ts`；可以在 `packages/host/src/types.ts` 中以可选字段扩展宿主接口（例如导航到指定光标）。

**需求**：P-60、P-61、P-62、K-06 的网络部分。网页与幻灯片两种形态都必须可用。

**交付**：

- `classroom-server`：基于 y-websocket 的房间服务，命令 `presmium-classroom-server [--port]`。
- 会话插件（浏览器端经统一的插件注册入口加载，组件只依赖 `@presmium/host`）：
  - `session` 服务：创建课堂、以链接或二维码加入（`?room=&name=`）、角色（主讲、学习者）、结束；
  - `classroomStore` 服务：基于 Yjs 共享文档的集合读写；
  - 课堂服务地址在文稿 frontmatter 的 `presmium.session.server` 中配置。
- 跟随与自主（P-62）：主讲的位置（章节、步骤、视图）实时共享；学习者在“跟随主讲”与“自主浏览”之间切换，一键回到主讲进度。网页形态通过宿主接口导航 IR 运行时；幻灯片形态额外以 `addSyncMethod` 接入 Slidev 的状态同步。
- 会话界面：网页形态的工具栏与幻灯片形态的演讲者面板中显示课堂状态、加入链接与二维码、参与者列表。
- 示例页 `pages/session.md`（MyST），并加入 `lecture.md`。

**验收**（Playwright，起真实的课堂服务与浏览器上下文）：

- 网页形态：主讲翻到另一章节与步骤后，学习者跟随；学习者切到自主后不再跟随，一键回到主讲进度。
- 幻灯片形态：主讲翻页后学习者跟随。
- 课堂结束后学习者看到结束状态。
- 未配置课堂服务时，文稿照常放映与阅读，会话界面提示未连接。

## WP-31 课堂功能

**拥有**：`packages/addon-classroom/`、`examples/demo/pages/classroom.md`、`e2e/classroom.spec.ts`。

**需求**：P-63 至 P-67。依赖 WP-30 的 `session`、`classroomStore` 服务与执行插件的 `executor` 服务。网页与幻灯片两种形态都必须可用；notebook 中静态降级。

**交付**：

- 指令：`{quiz}`（题干、选项、答案）、`{exercise}`（题面、起始代码、校验用例）、`{question-box}`（提问入口）、`{pulse}`（理解度投票）；每个指令提供 notebook 降级（测验为题目列表，练习为含起始代码与测试的代码单元格）。
- 学习笔记（P-63）：网页形态中每个章节与带标签的块旁可以添加笔记，挂载到章节 ID 或块 ID，只有作者可见；未加入课堂时保存在本地浏览器。
- 课堂测验（P-64）：主讲开放与关闭，实时统计；每人只计最后一次作答。
- 练习校验（P-65）：调用 `executor` 运行校验用例，标记典型错误。
- 提问（P-66）：问题挂载到当前章节或块，主讲视图中按位置列出。
- 理解度汇聚（P-67）：主讲视图显示分布。
- 课堂结束后拒绝写入。
- 示例页 `pages/classroom.md`（MyST），并加入 `lecture.md`。

**验收**（Playwright，三个浏览器上下文：主讲、两名学习者，网页形态为主，幻灯片形态至少覆盖测验）：

- 完成一轮测验，统计正确且重复作答只计最后一次；关闭后不再接受作答。
- 提问出现在主讲视图并标注所在章节。
- 练习提交后返回校验结果。
- 学习者 A 的笔记对学习者 B 不可见。
- notebook 中测验与练习以静态形式出现。

## MR 波次：中间表示

MR 波次把 M1、M2 的成果迁移到 IR 管线（`docs/ir.md`）。迁移完成后，M1、M2 的全部验收在新管线上重新通过。

### WP-40 编译器

**拥有**：`packages/compiler/`、`packages/cli/`、`examples/demo/lecture.md`、`examples/demo/pages/core.md`、`examples/demo/package.json`、`playwright.config.ts`、根 `package.json` 的脚本。

**需求**：K-01、K-02、K-11、K-16、K-17、K-19。

**交付**：

- `@presmium/compiler`：剥离 frontmatter、`myst-parser` 解析、`{include}`；切分章节与章节 ID；内置指令 `{slide}`、`{only}`、`{hints}`；划分角色；编排步骤（`:reveal:`、`:reveal: items`、`span`）；加载插件的指令、编译步骤、执行器、检查项；执行步骤与执行缓存（`.presmium/freeze/`）；IR 校验；增量编译（按文件）。
- 渲染端注册与调度：按 frontmatter 的 `renderers` 与各插件的 `renderer` 调用 `build` / `dev`，汇总构建报告。
- CLI：`presmium build [--to] [--out]`、`presmium dev [--to]`、`presmium ir`、`presmium check`（改为基于编译器）。
- 示例文稿入口改为 `examples/demo/lecture.md`，`core.md` 改写为 MyST；根脚本 `demo:build` 改为 `presmium build`，产物位于 `examples/demo/dist/<渲染端>/`；Playwright 配置指向新的产物目录。

**验收**（集成测试，真实运行 CLI）：

- 对测试文稿运行 `presmium ir`：章节数、章节 ID、讲解与上屏的划分、`at` 与步骤数符合 `ir.md` 第 2 节。
- 用测试执行器（测试夹具中的插件）验证：首次编译执行一次，第二次命中缓存不再执行；修改代码后只重跑该块。
- `presmium check` 原有验收全部保持（退出码、`文件:行号`、`--json`、`--update-lock`）。

### WP-41 幻灯片渲染端（可选的高保真渲染端）

**拥有**：`packages/render-slides/`、`e2e/core.spec.ts`。

**需求**：P-76、K-04、K-05、K-12，以及原 WP-02 的端到端验收。

**交付**：从 IR 生成 Slidev 项目（每章节一页；上屏块按 `at` 包裹 `v-click`；`code` 节点按 `highlight` 生成逐步行高亮；`variants` 生成 Magic Move；讲解生成带 `[click]` 标记的备注；`component` 节点生成组件标签；`hints.slides.layout` 映射为布局；frontmatter 的插件列表映射为 `addons`），再调用 Slidev 构建或导出。

**验收**：原 `e2e/core.spec.ts` 的五条验收在新产物上通过；讲解出现在演讲者视图的对应步骤；`presmium build --to slides` 后可用 `slidev export` 导出 PDF。

### WP-42 IR 运行时与网页渲染端

**拥有**：`packages/viewer/`、`packages/web/`、`examples/demo/pages/web.md`、`e2e/web.spec.ts`、`e2e/viewer.spec.ts`。

**需求**：K-11、K-20、P-70 至 P-74、P-77、N-05。

**交付**：

- `@presmium/viewer`（`ir.md` 第 8 节）：IR 动态渲染（mdast→hast→Vue、Shiki、KaTeX、客户端图表、组件注册表）；视图注册表与三种内置视图（`document`、`scrolly`、`present`，`present` 含演讲者窗口与多窗口同步）；实时更新客户端（WebSocket 接收变化的章节，保持视图、章节、步骤与滚动位置）。
- `@presmium/web` 渲染端：VitePress 外壳（导航、侧栏、大纲、深色模式、移动端、搜索界面），正文由 viewer 渲染；搜索索引在构建时由 IR 文本生成（`_render` 钩子），支持中文分词；`dev` 启动 VitePress 开发服务器与 IR 推送通道；`build` 产出静态站点（IR JSON 随产物发布）。
- 保留 WP-12 中可复用的部分：VitePress 宿主适配、中文分词、滚动叙事、形态切换。

**验收**（Playwright）：

- 原 WP-12 的端到端验收在新管线上通过。
- `presmium dev` 运行中修改示例源码的一个段落，300 ms 内页面更新，滚动位置与当前视图不变，页面未刷新。
- 同一页面切换 `document`、`scrolly`、`present` 视图，章节与步骤位置保持；放映视图中键盘翻页、演讲者窗口显示当前步骤的讲解。
- 示例文稿中所有插件组件在网页中可用。

### WP-43 notebook 渲染端

**拥有**：`packages/render-notebook/`、`e2e/notebook.spec.ts` 或 `packages/render-notebook/test/`。

**需求**：P-75。

**交付**：从 IR 生成 nbformat 4 的 `.ipynb`：章节标题与讲解、`markdown` 节点为 Markdown 单元格；`code` 节点为代码单元格（语言匹配 notebook 内核时），附录制输出；`component` 节点使用插件的 notebook 扩展，否则渲染 `fallback`；不支持的块列入构建报告。

**验收**（集成测试）：生成的 notebook 通过 nbformat 结构校验；用本机 Python 依次执行全部代码单元格，输出与录制输出一致；讲解文字完整出现在 Markdown 单元格中。

### WP-44 代码与执行插件迁移

**拥有**：`packages/addon-code/`、`packages/addon-exec/`、`packages/addon-exec-local/`、`examples/sample-repo/`、`examples/demo/pages/code.md`、`examples/demo/pages/exec.md`、`examples/demo/pages/exec-local.md`、`e2e/code.spec.ts`、`e2e/exec.spec.ts`、`e2e/exec-local.spec.ts`。

**需求**：P-10 至 P-16、P-20 至 P-26、K-09、K-19 的执行器部分。

**交付**：`{code-ref}` 指令与编译步骤（锚点解析、锁定、逻辑单元换算为 `highlight`、永久链接、`variants`）；代码块的 `:run:` 选项生成 `RunSpec`；Node 端执行器（本地 Python 进程；容器执行器）用于编译时执行；浏览器端 Pyodide 与运行面板保持；移除 `setup/transformers.ts` 与 `transformMarkdown`；notebook 扩展（运行面板降级为代码单元格）；示例页改写为 MyST。P-25 编辑回写不再要求（编辑只在源码中进行），保留现有实现但不作为验收项。

**验收**：原 WP-11、WP-20、WP-21 的验收在新管线上通过（P-25 除外）；编译时执行的输出出现在网页与 notebook 中。

### WP-45 展示类插件迁移

**拥有**：`packages/addon-stage/`、`packages/addon-guide/`、`packages/addon-content/`、`packages/addon-publish/`、对应的 `examples/demo/pages/*.md` 与 `e2e/*.spec.ts`。

**需求**：P-01 至 P-04、P-30 至 P-32、P-40 至 P-43、P-50 至 P-53、N-06。

**交付**：各插件的组件改为由指令生成（例如 `{spotlight}`、`{cursor}`、`{hint}`、`{markmap}`、媒体指令），提供 `fallback` 或 notebook 扩展；示例页改写为 MyST；发布插件改为基于渲染端产物（幻灯片导出 PDF、网页离线缓存、可视化差异对比渲染产物）；修复 WP-22 遗留问题：聚光时按 Tab 可以聚焦到被聚光的元素（N-06）。另外接手 WP-24 的遗留问题：
  - 高对比度主题强制所有元素不透明，破坏了其他插件依赖透明度的步骤状态（必须修复）；
  - 深色模式下 Mermaid 连线标签对比度 4.43:1，未达到 WCAG AA；
  - 远程资源（如无扩展名的 PlantUML 地址）未本地化，离线时缺失；
  - `packages/addon-publish/test/` 中的导出与差异测试已临时跳过，迁移后必须恢复运行并通过。

**验收**：原 WP-10、WP-22、WP-23、WP-24 的验收在新管线上通过；N-06 遗留问题有端到端用例覆盖。

### WP-46 跨包整合

**拥有**：`packages/host/`、`packages/addon-core/`、`packages/render-slides/`、`packages/viewer/`、`packages/web/`，以及为适配步骤作用域而需要修改的各插件组件。

**需求**：K-04、K-07、K-11、K-20、P-71、P-74，以及 MR 波次合并后发现的跨包问题。

**交付**：

- **步骤作用域**：`@presmium/host` 增加步骤作用域（块的 `at`），`useStepState` 的区间相对于作用域，并提供“第 k 个内部步骤对应的绝对步骤”以便组件用 `v-click` 登记步骤；幻灯片与网页两个渲染端在渲染组件块时注入块的 `at`；把仍使用页内绝对步骤的组件（如 `PmDemoStepper`、引导与分步执行组件）改为相对步骤，并核对示例中的 `:span:` 与组件实际状态数一致（`ir.md` 2.4）。
- **插件在浏览器端的注册**：每个插件包的 `src/client/plugin.ts` 导出插件定义，Slidev 与网页两个宿主都从这里注册；`addon-core` 的演示插件改走这条路径，使 `PmDemoGreeting` 在网页中拿到服务。
- **形态切换**：配置了网页渲染端时，幻灯片渲染端自动加入“在网页中阅读”按钮所需的插件；幻灯片到网页的跳转保留步骤。
- **开发模式**：`presmium dev` 中搜索索引随编辑更新；幻灯片渲染端提供开发服务器（源码变化后重新生成并由 Slidev 热更新）；滚动叙事视图在内容变化后保持当前阅读位置。
- **运行时执行**：IR 运行时中 `run.when` 含 `live` 的代码块接入执行面板。
- **文档**：在 `architecture.md` 第 5 节与 `ir.md` 第 8.2 节写明视图插件（`ViewerPlugin`）约定与浏览器端插件注册约定。

**验收**（Playwright，两种形态）：

- 同一个带内部步骤的组件放在第 0 步出现的块中与放在第 2 步出现的块中，跳到各自块的第 1 个内部步骤时状态一致。
- 网页形态中 `PmDemoGreeting` 显示问候语，启动报告中演示插件的状态与幻灯片形态一致。
- 未在文稿中手工配置时，幻灯片导航栏也有“在网页中阅读”按钮；从幻灯片第 N 页第 S 步跳到网页，停在对应章节与步骤。
- `presmium dev` 中编辑段落后，新关键字可以被搜索到。

#### WP-46 的拆分与合并后遗留项

WP-46 拆为两个文件归属不重叠、可并行的工作包。

**WP-46a 运行时侧**（拥有 `packages/host/`、`packages/addon-core/`、`packages/addon-guide/`、`packages/addon-exec/`、`packages/addon-code/`、`packages/viewer/`、`packages/web/`、`packages/render-slides/` 及对应 `e2e/`）：

- 上文 WP-46 的步骤作用域、浏览器端插件注册、形态切换、开发模式（搜索索引、幻灯片开发服务器、滚动叙事阅读位置）、运行时执行（`run.when` 含 `live`、网页中提供 Pyodide 运行时）；
- 去掉引导插件与分步执行插件各自的步骤偏移变通做法，统一使用步骤作用域；
- IR 运行时把 ` ```mermaid ` 代码节点渲染为图表；网页中脚注引用的显示与 `e2e/web.spec.ts` 的文本比对一致；
- 幻灯片渲染端显示 `CodeNode.origin`（文件与行区间链接、提交、漂移徽标），随后去掉代码引用插件插入的幻灯片专用信息栏；高对比度下代码引用徽标达到 WCAG AA（当前 3.63:1）；
- `presmium.publish.offline: false` 同时关闭网页的 service worker。

**WP-46b 编译侧**（拥有 `packages/compiler/`、`packages/kernel/`、`packages/cli/`、`packages/render-notebook/`、`packages/addon-content/`、`packages/addon-publish/`、`examples/demo/slides.md`、`docs/`）：

- `presmium dev` 监听编译步骤读取过的文件（例如被引用的代码文件与 git 引用），被引用代码变化时实时更新（K-09）；
- 编译器自行把脚注定义放回所在章节；`{code}` 的 `:emphasize-lines:` 映射为 `highlight`；
- `RendererExtension` 的组件转换函数获得渲染上下文，插件不再为读取 Slidev 目录而依赖幻灯片渲染端包；
- notebook 渲染端复制或改写本地媒体文件的路径（如本地化的 PlantUML 图、媒体降级链接）；
- 移除 v1 遗留：`examples/demo/slides.md`、`transformMarkdown`、`MarkdownTransformInput`，以及不再使用的 `CheckContext.slides`；
- 文档：在 `ir.md` 中列出各插件指令及选项（`{code-ref}`、`{run-panel}`、`{step-run}`、`{local-env}` 以及讲台、引导、富内容、发布的指令），在 `architecture.md` 第 5 节写明浏览器端插件注册与视图插件约定。

## 课堂波次的调整

网页是主媒介，WP-30、WP-31 的课堂功能必须同时在网页与幻灯片中可用：会话与同步不只接入 Slidev 的 `addSyncMethod`，网页宿主中的“跟随主讲”按章节与步骤导航；测验、练习、提问等以指令声明（`{quiz}`、`{exercise}`、`{question}`），notebook 中降级为静态内容。

## WP-50 语言服务与预览同步（M4，已完成）

**拥有**：`packages/language-server/`、`packages/vscode/`。

**需求**：P-80、P-81。

**交付**：基于 `vscode-languageserver` 与 `@presmium/compiler` 的语言服务：诊断、锚点跳转、悬停显示引用代码与录制输出、补全；VS Code 扩展；编辑器光标所在章节与 `presmium dev` 预览同步。

**验收**（集成测试，以 LSP 协议驱动语言服务进程）：失效锚点产生诊断；在锚点上请求定义返回代码区间；补全返回 region 名与指令名。
