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
| F | WP-60a 至 WP-60d 验收缺口修补 | D、E |
| G（M5） | 先 WP-70a（拥有内核、编译器等被其他组依赖的契约）；再并行 WP-70b、WP-70c、WP-70d 第二轮评审修复（含 `architecture.md` 第 9 节遗留）；WP-71 仓库技能（已完成） | F |
| H | WP-72 设计：执行环境、智能体、工作区、讲授四个上下文的需求细化、领域模型、架构、源语法与契约（已完成） | G |
| I（M6、M8、M9） | 先 WP-73a 契约与服务端，再 WP-73b 环境、会话与富输出。之后两条线并行：执行与内容一线并行 WP-74 WebAssembly 后端、WP-75 浏览器 GPU 后端、WP-76 远端环境、部署模板与浏览器终端、WP-85 富内容增补（视频封面与字幕轨、卡片与栅格）、WP-88 先预测再揭示；讲授一线先并行 WP-77 讲授轨、录制与回放，WP-82 语音服务与 gateway 中的语音，再 WP-83 脚本化讲授、语音串联与导出视频 | H；WP-82 还要 WP-79（SHARED 模式的用例要 `presmium serve` 与 `presmium agent-host`） |
| J（M7） | WP-73b 之后开始，与 I 的后半并行：先并行 WP-78 agent 环境（MCP）、WP-79 工作区服务、文档管理与共享部署；再并行 WP-80 agent 运行时接入与学习者问答、WP-90 修改审阅与进程沙箱（deltabox）；再并行 WP-81 批注修改、对话修改、修改审阅与修改历史，WP-84 转写回写讲义 | WP-73b；WP-80 还要 WP-88（同改课堂插件）；WP-90 还要 WP-79（它拥有 `packages/cli/package.json`，此前属于 WP-79）；WP-81 还要 WP-90（审阅的 deltabox 实现）；WP-84 还要 WP-80 与 WP-83（同改讲授插件） |
| J2（M9） | 并行 WP-86 课程站点、WP-87 发布治理 | WP-79；WP-85（同改编译器的 MyST 设置与指令信息）；WP-87 还要 WP-78（读者的 MCP 令牌只读学生视图）；WP-87 与 WP-90 可能同时进行，`packages/cli/package.json` 属于 WP-90 |
| S | WP-91 共享部署安全加固（SHARED 模式的威胁模型与专门的安全评审；完成前 SHARED 模式标为实验性） | J、J2 |
| K | WP-89 第三轮验收审计、示例讲义与技能更新 | I、J、J2（S 不阻塞 K；SHARED 模式在 S 通过前保持实验性） |

## 测试原则

- **只写集成测试，不写单元测试。** 测试必须在真实组装的系统上运行：构建示例文稿后用 Playwright 测两种形态的产物，对测试用文稿真正运行 CLI，真正启动课堂服务。不对单个函数或类做隔离测试，不用 mock 替代宿主框架。
- **控制数量。** 每条验收标准对应一到两个用例，不追求边界情况的穷举。
- **测试位置。** 端到端测试放在 `e2e/<ctx>.spec.ts`；不经过浏览器的集成测试（CLI、构建产物检查、服务端）放在 `packages/<pkg>/test/*.test.ts`，由 `pnpm test` 运行。
- **结构检查。** 分层规则由 `scripts/check-layering.mjs` 检查，包含在 `pnpm test` 中。

## 通用完成标准

每个工作包都必须满足：

1. `pnpm test` 通过（含分层检查）。
2. 本包的功能用自己的测试文稿 `e2e/fixtures/<组>/` 演示与测试（端到端用例在 `beforeAll` 中用真实的 `presmium build` 构建它们）；示例讲义 `examples/demo` 是一份完整的讲义，不放功能性演示，修改后仍能通过 `pnpm demo:build`（生成网页、幻灯片与 notebook 全部媒介，无警告）与 `pnpm demo:check`。
3. 本包的端到端测试 `e2e/<ctx>.spec.ts` 全部通过。
4. 只修改本包拥有的路径。需要改动他人路径时，在交付报告中说明，不直接修改。
5. 不 fork、不引用 Slidev 内部路径，只用公开接口（`@slidev/client` 入口导出、`@slidev/types`、文档中的 setup 钩子与约定目录）。Slidev 与 VitePress 文档的本地副本在 `vendor/docs/`（由 `scripts/fetch-docs.sh` 下载，不入库），查接口先查文档，不读框架源码。
6. 组件只从 `@presmium/host` 获取步骤状态与服务，不直接使用 `@slidev/client`（`addon-core` 除外），以保证网页形态可用。

## WP-00 工程骨架（已完成）

pnpm 工作区、TypeScript 与 Vitest 配置、Playwright 配置、各包 `package.json`、内核契约 `contracts.ts`、宿主契约 `host/src/types.ts`、示例文稿骨架、冒烟测试。

## WP-01 内核（已完成）

`Kernel`、`ServiceRegistry`、`EventBus`、`AnchorResolverRegistry`、指纹、`AnchorLock`、`CheckRegistry`。内核的行为由 WP-02（插件启动、降级、故障隔离）与 WP-03（锚点、检查）的集成测试覆盖。

## WP-02 宿主适配（已完成）

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

## WP-03 检查命令（已完成）

**拥有**：`packages/cli/`。

**需求**：K-16。

**交付**：`presmium check [deckDir] [--json] [--update-lock]`。用 `@slidev/parser` 解析文稿（含 `src:` 引入），从 headmatter 的 `addons` 中加载各包的 `./presmium` 入口，汇总解析器与检查项后运行。检查项崩溃时，诊断的源码位置默认为文稿入口文件。

**验收**（集成测试：对 `packages/cli/test/fixtures/` 下的测试文稿真正运行 CLI 进程）：

- 无问题时退出码 0；存在 `error` 诊断时退出码 1；参数错误时退出码 2。
- 文本输出带 `文件:行号`；`--json` 输出可被解析。
- `--update-lock` 生成 `.presmium/anchors.lock.json`，再次运行结果稳定。
- headmatter 中声明的插件包无法加载时报 `error`。

## WP-10 讲台（已完成）

**拥有**：`packages/addon-stage/`、`examples/demo/pages/stage.md`、`e2e/stage.spec.ts`。

**需求**：P-01 至 P-04。

**交付**：基础内容的示例与必要样式；步骤备注只突出当前步骤（宿主的 `[click]` 标记加样式定制）；冻结画面（快捷键 `b` 黑屏、`f` 冻结，通过 `setup/shortcuts` 与全局图层实现，状态同步到听众视图）；圈画标注开启持久化。

**验收**（Playwright）：表格、脚注、代码高亮可见；演讲者视图中当前步骤的备注被突出、其他步骤的备注被弱化；按 `b` 后听众视图被遮挡，再按恢复；标注持久化配置生效。

## WP-11 代码引用（已完成）

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

## WP-12 网页形态（已完成）

**拥有**：`packages/web/`、`examples/demo/pages/web.md`、`e2e/web.spec.ts`。

**需求**：P-70 至 P-74、N-05。

**交付**：

- 文稿转换：用 `@slidev/parser` 解析文稿，每个 `src:` 引入的文件生成一个 VitePress 页面，每页幻灯片生成一个章节（锚点来自页 ID 或标题）；备注按 `[click]` 切分为正文段落；调用各插件的 `transformMarkdown`；Slidev 专有语法按降级规则处理（`v-click` 系列、布局插槽、`slide-only`）。
- VitePress 宿主适配：网页版 `HostAdapter`（`mode: 'document'`），注册各插件包的 `components/` 与 `src/client/plugin.ts`；提供 `v-click`、`v-after`、`v-clicks` 等兼容实现。
- 搜索：VitePress 本地搜索，配置中文分词（`Intl.Segmenter`），索引包含备注与代码。
- 翻阅：侧边目录、页内大纲、上一章与下一章（按章分页，WP-61）。
- 滚动叙事（P-73）：页 frontmatter `presmium: { web: { layout: scrolly } }` 时，幻灯片内容固定在一侧，正文随滚动推进步骤。
- 形态切换（P-74）：网页章节提供“在幻灯片中打开”链接；幻灯片形态的导航栏提供“在网页中阅读”按钮（以 `custom-nav-controls` 实现，放在本包的 Slidev 插件部分）。
- 命令：`presmium-web dev|build <deckDir> [--out]`。

**验收**（Playwright，对 `pnpm demo:build` 的网页产物）：

- 网页章节数等于幻灯片页数，每章包含该页内容与备注。
- 中文关键字搜索 300 ms 内出结果，点击进入对应章节；断网后搜索可用。
- 手机视口（375 px）无横向滚动。
- 滚动叙事页随滚动推进步骤。
- 两种形态互跳停在对应位置。

## WP-20 浏览器执行（已完成）

**拥有**：`packages/addon-exec/`、`examples/demo/pages/exec.md`、`e2e/exec.spec.ts`。

**需求**：P-20、P-21、P-23、P-24；`executor` 服务。

**交付**：

- `ExecutorRouter`：汇总多个执行器，按语言分派；作为 `executor` 服务提供。
- Pyodide 执行器（P-23），通过 `setup/code-runners` 让 Monaco Runner 支持 `python`。
- `PmRunPanel`：参数表单、重跑、运行记录、两次结果对比（P-20）。
- 分步执行（P-21）：Python 逐行追踪生成 `Trace`，每行一个步骤，高亮当前行并显示累计输出。
- 预录输出回退（P-24）：执行失败或超时显示预录输出并标注。

**验收**（Playwright）：Python 代码在浏览器中运行并输出结果；修改参数重跑后对比视图显示差异；分步执行后退时输出回到上一步；故意超时的代码显示预录输出。

## WP-21 本地环境（已完成）

**拥有**：`packages/addon-exec-local/`、`examples/sample-repo/.devcontainer/`、`examples/demo/pages/exec-local.md`、`e2e/exec-local.spec.ts`。

**需求**：P-22、P-25、P-26、K-09 的写回部分。

**交付**：一个独立插件，开发服务器模式下生效：

- 容器执行器（P-22）：读取仓库 devcontainer 定义，在对应镜像中执行代码；作为第二个 `executor` 实现注册，演示执行器可替换。
- 编辑回写（P-25）：把演示中修改的代码写回被引用文件并在新分支上提交。
- 环境复刻（P-26）：导出当前代码片段与 devcontainer 定义为可下载的压缩包。

**验收**（集成测试，针对 Vite 开发服务器端点；无 Docker 时容器用例跳过并标记）：容器内执行 Python 输出正确；写回后目标仓库出现新分支与提交，原分支不变；导出的压缩包包含片段与 devcontainer 定义。

## WP-22 引导（已完成）

**拥有**：`packages/addon-guide/`、`examples/demo/pages/guide.md`、`e2e/guide.spec.ts`。

**需求**：P-30 至 P-32、N-06。

**交付**：`PmCursor`（路径点与动作，由步骤驱动）、`PmSpotlight`（基于 driver.js 的遮罩高亮，由步骤驱动）、`PmHint`（可交互元素的提示动画）。

**验收**（Playwright）：各步骤下光标位置、聚光目标、提示状态正确；后退可逆；减少动态效果时直接显示终态。

## WP-23 富内容（已完成）

**拥有**：`packages/addon-content/`、`examples/demo/pages/content.md`、`e2e/content.spec.ts`。

**需求**：P-40 至 P-43。

**交付**：公式、Mermaid、PlantUML 示例；`markmap` 代码块渲染思维导图；音视频与动图示例（播放控制、尺寸属性）；自定义 Web 组件嵌入示例。

**验收**（Playwright）：各类内容在构建产物中渲染出预期 DOM；Web 组件保留交互（点击改变状态）。

## WP-24 发布（已完成）

**拥有**：`packages/addon-publish/`、`examples/demo/pages/publish.md`、`e2e/publish.spec.ts`。

**需求**：P-50 至 P-53、N-03。

**交付**：

- 导出（P-50）：封装 `slidev export`，导出后校验 PDF 中保留超链接。
- 离线（P-51）：启用 PWA 与远程资源本地化；Pyodide 资源纳入缓存。
- 高对比度主题（P-52）：切换开关与 CSS 变量。
- 可视化差异（P-53）：`presmium-diff <refA> <refB>` 导出两个提交的逐页截图，用 pixelmatch 比较，输出报告。

**验收**：导出的 PDF 中含有代码永久链接；离线模式下重新加载页面可放映；高对比度切换后对比度达到 WCAG AA；对同一提交运行差异报告结果为零差异，修改一页后该页被列出。

## WP-30 会话与同步（已完成）

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

## WP-31 课堂功能（已完成）

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
- 接手 WP-30 遗留的 P-60 “归档”：`SessionService` 增加归档（导出课堂文档到文稿目录下的文件，并释放服务端内存），课堂服务与会话插件实现之；为此本包也拥有 `packages/addon-session/`、`packages/classroom-server/` 与 `packages/kernel/src/contracts.ts` 中 `SessionService` 的相关改动。

**验收**（Playwright，三个浏览器上下文：主讲、两名学习者，网页形态为主，幻灯片形态至少覆盖测验）：

- 完成一轮测验，统计正确且重复作答只计最后一次；关闭后不再接受作答。
- 提问出现在主讲视图并标注所在章节。
- 练习提交后返回校验结果。
- 学习者 A 的笔记对学习者 B 不可见。
- notebook 中测验与练习以静态形式出现。

## MR 波次：中间表示

MR 波次把 M1、M2 的成果迁移到 IR 管线（`docs/ir.md`）。迁移完成后，M1、M2 的全部验收在新管线上重新通过。

### WP-40 编译器（已完成）

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

### WP-41 幻灯片渲染端（可选的高保真渲染端，已完成）

**拥有**：`packages/render-slides/`、`e2e/core.spec.ts`。

**需求**：P-76、K-04、K-05、K-12，以及原 WP-02 的端到端验收。

**交付**：从 IR 生成 Slidev 项目（每章节一页；上屏块按 `at` 包裹 `v-click`；`code` 节点按 `highlight` 生成逐步行高亮；`variants` 生成 Magic Move；讲解生成带 `[click]` 标记的备注；`component` 节点生成组件标签；`hints.slides.layout` 映射为布局；frontmatter 的插件列表映射为 `addons`），再调用 Slidev 构建或导出。

**验收**：原 `e2e/core.spec.ts` 的五条验收在新产物上通过；讲解出现在演讲者视图的对应步骤；`presmium build --to slides` 后可用 `slidev export` 导出 PDF。

### WP-42 IR 运行时与网页渲染端（已完成）

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

### WP-43 notebook 渲染端（已完成）

**拥有**：`packages/render-notebook/`、`e2e/notebook.spec.ts` 或 `packages/render-notebook/test/`。

**需求**：P-75。

**交付**：从 IR 生成 nbformat 4 的 `.ipynb`：章节标题与讲解、`markdown` 节点为 Markdown 单元格；`code` 节点为代码单元格（语言匹配 notebook 内核时），附录制输出；`component` 节点使用插件的 notebook 扩展，否则渲染 `fallback`；不支持的块列入构建报告。

**验收**（集成测试）：生成的 notebook 通过 nbformat 结构校验；用本机 Python 依次执行全部代码单元格，输出与录制输出一致；讲解文字完整出现在 Markdown 单元格中。

### WP-44 代码与执行插件迁移（已完成）

**拥有**：`packages/addon-code/`、`packages/addon-exec/`、`packages/addon-exec-local/`、`examples/sample-repo/`、`examples/demo/pages/code.md`、`examples/demo/pages/exec.md`、`examples/demo/pages/exec-local.md`、`e2e/code.spec.ts`、`e2e/exec.spec.ts`、`e2e/exec-local.spec.ts`。

**需求**：P-10 至 P-16、P-20 至 P-26、K-09、K-19 的执行器部分。

**交付**：`{code-ref}` 指令与编译步骤（锚点解析、锁定、逻辑单元换算为 `highlight`、永久链接、`variants`）；代码块的 `:run:` 选项生成 `RunSpec`；Node 端执行器（本地 Python 进程；容器执行器）用于编译时执行；浏览器端 Pyodide 与运行面板保持；移除 `setup/transformers.ts` 与 `transformMarkdown`；notebook 扩展（运行面板降级为代码单元格）；示例页改写为 MyST。P-25 编辑回写不再要求（编辑只在源码中进行），保留现有实现但不作为验收项。

**验收**：原 WP-11、WP-20、WP-21 的验收在新管线上通过（P-25 除外）；编译时执行的输出出现在网页与 notebook 中。

### WP-45 展示类插件迁移（已完成）

**拥有**：`packages/addon-stage/`、`packages/addon-guide/`、`packages/addon-content/`、`packages/addon-publish/`、对应的 `examples/demo/pages/*.md` 与 `e2e/*.spec.ts`。

**需求**：P-01 至 P-04、P-30 至 P-32、P-40 至 P-43、P-50 至 P-53、N-06。

**交付**：各插件的组件改为由指令生成（例如 `{spotlight}`、`{cursor}`、`{hint}`、`{markmap}`、媒体指令），提供 `fallback` 或 notebook 扩展；示例页改写为 MyST；发布插件改为基于渲染端产物（幻灯片导出 PDF、网页离线缓存、可视化差异对比渲染产物）；修复 WP-22 遗留问题：聚光时按 Tab 可以聚焦到被聚光的元素（N-06）。另外接手 WP-24 的遗留问题：
  - 高对比度主题强制所有元素不透明，破坏了其他插件依赖透明度的步骤状态（必须修复）；
  - 深色模式下 Mermaid 连线标签对比度 4.43:1，未达到 WCAG AA；
  - 远程资源（如无扩展名的 PlantUML 地址）未本地化，离线时缺失；
  - `packages/addon-publish/test/` 中的导出与差异测试已临时跳过，迁移后必须恢复运行并通过。

**验收**：原 WP-10、WP-22、WP-23、WP-24 的验收在新管线上通过；N-06 遗留问题有端到端用例覆盖。

### WP-46 跨包整合（已完成）

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

网页是主媒介，WP-30、WP-31 的课堂功能必须同时在网页与幻灯片中可用：会话与同步不只接入 Slidev 的 `addSyncMethod`，网页宿主中的“跟随主讲”按章节与步骤导航；测验、练习、提问等以指令声明（`{quiz}`、`{exercise}`、`{question-box}`、`{pulse}`），notebook 中降级为静态内容。

## WP-50 语言服务与预览同步（M4，已完成）

**拥有**：`packages/language-server/`、`packages/vscode/`。

**需求**：P-80、P-81。

**交付**：基于 `vscode-languageserver` 与 `@presmium/compiler` 的语言服务：诊断、锚点跳转、悬停显示引用代码与录制输出、补全；VS Code 扩展；编辑器光标所在章节与 `presmium dev` 预览同步。

**验收**（集成测试，以 LSP 协议驱动语言服务进程）：失效锚点产生诊断；在锚点上请求定义返回代码区间；补全返回 region 名与指令名。

## WP-60 验收缺口修补（已完成）

最终验收审计在 `main` f33198c 上发现 51 个缺口（12 个主要、39 个次要），完整清单、证据与修法见 `docs/acceptance-gaps.md`。缺口按代码归属分为四个可并行的工作包，文件归属互不重叠；组间需要配合的地方以 `acceptance-gaps.md`“组间约定”一节中的接口约定为准（语言、章节级配置、静态导出降级、交叉引用文字）。

| 工作包 | 范围 | 对应清单中的组 |
|---|---|---|
| WP-60a | 内核、编译器、宿主接口、两个宿主适配、幻灯片渲染端、CLI | G1-kernel-host-pipeline |
| WP-60b | IR 运行时与讲台插件、示例页面 | G2-ir-runtime-and-stage |
| WP-60c | 课堂、会话、课堂服务、富内容、代码引用、引导、语言服务与 VS Code 扩展 | G3-classroom-content-code-editor |
| WP-60d | 执行、本地环境、发布、notebook 渲染端、文档、根配置、性能与多浏览器测试 | G4-exec-publish-notebook-docs |

**通用验收**：

- 本组在 `acceptance-gaps.md` 中的每个缺口都按“修法与验收”完成，并有对应的集成或端到端测试；
- 按组间约定实现本组承担的一侧，并用本组自己的测试文稿（`e2e/fixtures/<组>/`）验证，不依赖其他组的实现；
- 合并前全量 `pnpm test` 与全量 Playwright 套件通过。

## WP-61 网页阅读体验（已完成）

来自用户试用反馈。在 WP-60 合并后进行。

**拥有**：`packages/web/`、`packages/viewer/`、`e2e/web.spec.ts`、`e2e/viewer.spec.ts`、`e2e/fixtures/web/`、`e2e/fixtures/viewer/`。另外修稳两个在高负载下偶发失败的用例：`viewer.spec.ts` 的“300 ms 内更新”与 `web.spec.ts` 中从幻灯片跳到滚动叙事章节的步骤用例（以事件或状态等待代替固定时序）。

**交付**：

- **按章组页**：一章（一个 `{include}` 的源文件，或一个 `#` 标题开始的部分）生成一个网页页面；侧栏两级显示“章 → 节”；页内大纲列出本章各节；“上一章、下一章”只出现在页末；去掉每节底部的“上一节、下一节”，“在幻灯片中打开”改为节标题旁的小入口。章的标题取自 `#` 标题，没有时取第一节的标题。
- **视觉层次**：文档视图中上屏内容（`visual`）与讲解（`narration`）有明确区分，例如上屏内容以卡片或“板书”样式呈现，讲解为正文排版；`{slide}` 中的加粗、列表等格式在网页中保留。
- **滚动叙事**：上屏内容一侧的代码块、表格等不被截断，超宽时可横向滚动或缩放。

**验收**（Playwright）：侧栏为两级结构且章节点击后跳到对应页的对应锚点；一章一页、页末有上一章与下一章、节底部没有翻页链接；上屏内容与讲解的样式可区分（例如上屏块带有专门的类名与边框或背景）；滚动叙事中示例代码块不出现截断（元素的 `scrollWidth` 不大于可视宽度，或带可滚动容器）。

## WP-62 示例讲义（已完成）

来自用户试用反馈。在 WP-60 合并后进行，可与 WP-61 并行。

**拥有**：`examples/demo/`、`examples/sample-repo/`、`e2e/fixtures/`（`web/`、`core/`、`viewer/` 除外）、除 `web.spec.ts`、`viewer.spec.ts`、`core.spec.ts` 以外的全部 `e2e/*.spec.ts`。

**交付**：

- 把示例文稿重写成一份真实、完整的讲义：主题为“BPE 分词”，面向初学者。讲解为通顺的正文，上屏内容精炼；自然地用到代码引用（引用 `examples/sample-repo` 中真实可运行的 BPE 实现，按逻辑单元分步高亮、锁定提交、多版本对比）、编译时执行与浏览器执行、分步执行、引导动画、公式与图表、课堂测验与练习、滚动叙事等功能。
- 讲义中不出现插件 ID、内部机制这类调试性文字；插件机制、错误边界、步骤作用域等功能性演示挪到 `e2e/fixtures/<上下文>/` 的测试文稿中。
- 各功能的端到端测试改为使用自己的测试文稿，不再依赖示例讲义的具体内容；另写一个面向示例讲义的冒烟测试：三种媒介都能构建，网页与幻灯片都能打开并翻页。

**验收**：全量 `pnpm test` 与 Playwright 通过；示例讲义构建无警告；人工通读网页形态，内容连贯、无调试性文字。

## WP-63 稳定性与文档收尾（已完成）

来自 WP-60 的验收遗留。可与 WP-61、WP-62 并行。

**拥有**：`packages/host/`、`packages/addon-core/`、`packages/kernel/`、`packages/compiler/`、`packages/cli/`、`packages/render-slides/`、`e2e/core.spec.ts`、`e2e/fixtures/core/`、`docs/`（`docs/wbs.md` 除外）、`CLAUDE.md`。

**交付**：

- 幻灯片形态的 `remote` 共享状态：本地变更后紧接着到达的远端值不再被丢弃（WP-60a 验证中 40 次丢 28 次）；`e2e/core.spec.ts` 的对应用例在 `--repeat-each=10` 下稳定通过。
- `e2e/core.spec.ts` 中“减少动态效果下翻页与逐项出现没有动画”用例改为等待幻灯片就绪、在翻页后的若干动画帧内采样，`--repeat-each=10` 稳定通过。
- 网页共享状态的 BroadcastChannel 名称不再只用文稿标题区分（同源下同名文稿会串）。
- 文档：`architecture.md` 第 9 节写明搜索索引的 VitePress 内部模块在开发与构建中都被拦截；封面章节配置写在 `presmiumSection`；新增的 `joinWindows`、`RenderContext.workspaceRoot` 与配置路径改写规则；`execute: { rerun: environment }` 开关；`ir.md` 的 `{config}` 指令。zh-CN 文稿中 VitePress 余下的英文界面文字（跳到正文、明暗切换提示、404 页）由 WP-61 处理，本包在文档中列出即可。

**验收**：上述两个用例在 `--repeat-each=10` 下全部通过；全量 `pnpm test` 与 Playwright 通过；文档描述与代码一致。


## G 至 K 波次：v0.7 与 v0.8 新增范围

需求见 `requirements.md` v0.8 的 6.10 至 6.14 节、M9 的各项（P-42 增补、P-46、P-54、P-55、P-68、P-78、P-79、P-102 增补、P-107、P-122 增补、P-123、P-137）与 N-08、N-09。设计见 `domain-model.md` 第 4A、7A、12 至 15 节，`architecture.md` 4.6 至 4.10 节与第 10 至 12 节，`ir.md` 2.7 至 2.14 节与第 6、9、10 节；取舍的理由记录在 `design-v0.7.md`。每个工作包都要同步更新受影响的技能（`.agents/skills`，P-82）。

### WP-70 第二轮评审修复（M5）

第二轮整体评审（5 个需求验收、4 个代码简化、2 个正确性评审）汇总的缺口，连同 `architecture.md` 第 9 节的遗留风险，按包分为 WP-70a 至 WP-70d，清单与验收见 `docs/review-round2.md`。

### WP-71 仓库技能（M5，P-82）

**交付**：`.agents/skills` 下的 `presmium-author`、`presmium-present`、`presmium-develop`；`.claude/skills` 与 `AGENTS.md` 软链接；`scripts/check-skills.mjs` 并入 `pnpm test`。

**验收**：按 `presmium-author` 从零写一份文稿并构建三种媒介；检查脚本发现技能中不存在的命令或缺少的指令时失败。

### WP-72 设计（已完成；v0.7 的 P-90、P-100 至 P-106、P-110 至 P-115、P-120 至 P-122、P-130 至 P-136、N-08、N-09，以及 v0.8（M9）的 P-42 增补、P-46、P-54、P-55、P-68、P-78、P-79、P-102 增补、P-107、P-122 增补、P-123、P-137）

**交付**：`domain-model.md` 新增执行环境、智能体、工作区、讲授（含语音）四个限界上下文与服务端（4A 节），并在富内容、课堂、网页形态、发布、编译中加入 M9 的部分；`architecture.md` 新增包划分与分层规则、4.6 至 4.10 节的契约（精确的 TypeScript 签名）、服务端的挂载与登录（第 10 节）、安全（第 11 节）、依赖选型（第 12 节）、测试策略的增补与 9.2 节的决定；`ir.md` 新增 2.7 至 2.14 节（`:env:`、`:session:`、`:echo:`、行内角色、讲授脚本、卡片与栅格、受众与发布检查、译本、先预测再揭示、视频的封面与字幕轨）、富输出与文件发布的渲染规则、讲授轨格式与工作区配置；本节各工作包的文件归属、先行验证与验收用例；`design-v0.7.md` 开头的说明。只改文档，不改代码：契约由 WP-73a 写入 `contracts.ts`、`ir.ts` 与 `host/src/types.ts`。

**验收**：验收者对照需求逐条审阅：每条需求在领域模型、包、契约与工作包中都有位置；文档之间没有矛盾；同一时间并行的工作包归属互不重叠；契约变更只有增加；`pnpm test` 通过。设计评审中验收者的决定（D1 至 D16）记在 `design-v0.7.md` 说明的第 17 至 26 条与第 27 至 35 条（D11 至 D16 取代了前面几条中的部分机制，见各条），第五轮对验证意见的修正记在第 36 至 47 条（第 37 条所有者控制台是开发者的提议，待验收者确认），都已写入各文档与下列工作包；第四轮另把 deltabox-lite 的文档加入 `scripts/fetch-docs.sh`。

### WP-70e 合并后修复（已完成）

WP-70 合并后由验收者处理的小项：去掉 WP-70c 中等待 WP-70b 的跳过条件；幻灯片构建失败时把位置映射回源码块；表格单元格中的伪 XML 标签（如 agent 轨迹里的 `<reminder>`）不再破坏幻灯片构建（`docs/coverage-agentic-se.md` 第 4 节）。

## I、J、J2 波次的约定

- **归属**：同一时间并行的工作包，归属的路径互不重叠；这包括跨波次并行的 I 的后半与 J（开发波次表中的前置决定了谁和谁同时进行）。先后执行的工作包可以拥有同一路径。“包名/**”指整个包，列出文件时只拥有这些文件。
- **契约只由 WP-73a 写**：`packages/kernel/src/contracts.ts`（及其拆出的模块）、`packages/kernel/src/ir.ts`、`packages/kernel/src/kernel.ts` 中的 `KernelOptions`、`packages/host/src/types.ts` 与 `packages/host/src/kernel.ts` 中的 `HostStart`、`StartOptions` 在 WP-73a 之后不再修改。后来的工作包发现契约不够用时，在交付报告中提出，由验收者决定（只能增加）。
- **共享文件**不计入独占归属，各工作包只改与自己需求对应的部分，后合并的变基并解决冲突：`docs/*.md`（写入实际实现：命令、选项、测试文件、与设计不同之处）；`.agents/skills/**`（`presmium-author/references/directives.md` 必须覆盖新的指令，`scripts/check-skills.mjs` 检查）；`e2e/fixtures/deck.ts`（只增加导出，不改签名）；`pnpm-lock.yaml`（合并时重新生成，新依赖写在交付报告中）；根目录 `.gitignore`（只有 WP-82 增加合成缓存的例外）。
- **根目录的配置**（`package.json`、`vitest.config.ts`、`playwright.config.ts`、`pnpm-workspace.yaml`）不属于任何工作包；需要改动时（例如把用 Playwright 的集成测试放进单独的 Vitest 项目、提高 `engines.node`）在交付报告中提出，由验收者在合并时修改。
- **端口**：每个工作包用自己的一组端口（`PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT`，以及 spec 中取的空闲端口），不复用别处的服务。
- **外部条件**：需要 Docker、GPU 或模型与语音凭据的用例在条件不满足时跳过并打印原因与启用方法（`architecture.md` 第 7 节）；验收者在有条件的机器上至少运行一次。
- **先行验证**：工作包开始时先做表中列出的小规模实测，结论写进交付报告与 `design-v0.7.md` 第 11 节；实测否定设计时先报告，不自行改设计。

### WP-73a 契约与服务端（I 波次第一步；已完成）

**需求**：v0.8 各上下文共用的基础：`architecture.md` 4.6 至 4.10 节的契约，服务端（第 10 节），K-08 的 Node 端服务，N-08 的本机检查、令牌与确认，信任模式与 gateway 的宿主（D13），运营者插件与 `presmium serve` 中插件的来源（D14 的编译器部分），所有者控制台（`design-v0.7.md` 第 37 条）；`OPERATIONS`（原计划在 WP-77）与 `useServer`。

**归属**：`packages/kernel/**`、`packages/host/**`、`packages/server/**`（新）、`packages/compiler/**`、`packages/cli/**`、`packages/viewer/**`、`packages/web/**`、`packages/addon-core/**`、`packages/render-slides/**`、`packages/render-notebook/**`、`scripts/check-layering.mjs`、`e2e/server.spec.ts`、`e2e/fixtures/server/**`。

**交付**：

1. 契约：4.6 至 4.10 节的全部类型、函数与令牌（含 `MCP_ENDPOINT`、`McpAccess`、`AgentMode`、`ServerContext.settings`、`NodeServiceContext.settings`、`CheckContext.service`、`RunContext` 与 `Executor.run` 的第三个可选参数、`ApprovalScope` 与 `ApprovalRequest.scope`、`AgentClient.runtime`、`AgentRuntime.runtime`，以及 `host/src/kernel.ts` 中 `HostStart.server`；第四轮增加的 `TrustMode`、`ServerContext.trust` 与 `gateway`、`NodeServiceContext.trust` 与 `gateway`、`EnvironmentContext.gateway`、`RunContext.sandbox` 与 `gateway`、`ProcessSandbox`、`SandboxRun`、`SandboxResult`、`PROCESS_SANDBOX`、`GatewayAccess`、`GatewayGrant`、`GatewayRoute`、`GatewayProxy`、`GatewayContribution`、`GatewayContext`、`PresmiumNodePlugin.gateway` 与 `operator`、`ChangeReview`、`ChangeReviewService`、`ReviewChange`、`ReviewStep`、`CHANGE_REVIEW`、`ReviewDecision`、`AgentTask.review`、`AgentEvent` 的 `step`、`review` 与进度的 `call`、`status`、`AgentSessionOptions.model`，`SpeechService.engines` 返回 `Promise`；第五轮增加的 `NodeServiceContext.operatorDir` 与 `ServerContext.operatorDir`，以及 `Route.role` 中 `owner` 的说明）；`HostStart`、`StartOptions` 与 `KernelOptions` 的 `environments`，内核把它交给每个插件的 `PluginContext.environments`；`environmentExecutor`、`eventStream` 的实现；`contracts.ts` 按领域拆为模块并统一再导出（9.2 节）。
2. `@presmium/server`：`startServer`，挂载插件的路由与代理（`@hono/node-server`、`http-proxy-3`）；`hello` 与控制通道；`APPROVALS`（策略、超时，按 `ApprovalScope` 分发：`content` 给 `member`，`workspace` 只给所有者，只接受所有者对它的回答，SHARED 中只经所有者控制台（第 10 项），`architecture.md` 10.4 节）；`dev` 模式的 `Host`、`Origin` 检查与每进程的令牌（写 `.presmium/server.json`）；`serve` 模式需要的部分：信任登录代理（共享密钥或固定来源）、按请求头解析成员的挂钩（由工作区提供角色）、按 `Presmium-Document` 分文档创建插件实例、其余路径按成员转发到给定的目标（转发选项是成员到地址的函数，含 WebSocket）；`startServer` 接受运营者设置 `settings`（插件 ID 到设置），交给 `ServerContext.settings`。另定义 `ServerHost`（编译、检查、构建、运行一个代码块、文档列表；编译结果按视图 `full` 或 `student` 给出；构建与运行代码块使用与该宿主的编译相同的执行选项，`architecture.md` 10.6 节），由 CLI（`presmium dev`）与工作区（WP-79）实现，`student` 视图在 WP-87 实现受众筛选之前与 `full` 相同；MCP 不引用服务端，WP-78 在服务端中按 `@presmium/mcp` 自己声明的 `McpHost` 适配它（`architecture.md` 10.2 节）。
3. 编译器：Node 端服务注册表（`services`），总是提供可选的 `PassContext.service`、`RenderContext.service` 与 `CheckContext.service`（`presmium check` 与语言服务的检查上下文）；`NodeServiceContext.settings` 读取工作区根目录 `presmium.workspace.yaml` 的 `settings.<插件 ID>`（启动时一次，没有该文件时为空）；行内角色的扩展点与 `presmiumRole`；`ComponentNode.assets` 的属性路径（三个渲染端都改写嵌套属性）；`RenderContext.server`；头部的 `translations` 写入 IR 的 `config.translations`、`translationOf` 写入 `meta.translationOf`（不再落进 `meta` 的其余字段），这部分写在新文件 `packages/compiler/src/translations.ts` 中并由 `compiler.ts` 调用，WP-86 在同一文件中加入译本的编译与过期检查，不必改 `compiler.ts`。
4. `presmium dev` 启动服务端，挂载各插件的 `server()`，渲染端的开发服务器代理 `/__presmium/`（网页写进生成的 VitePress 配置，幻灯片写进生成的 Slidev 项目的 `vite.config.ts`）；选项 `--server-port`、`--allow`。
5. 宿主：`useServer`（两种宿主适配给出 `server`）、`startHost` 把 `HostStart.environments` 经 `StartOptions` 交给内核（宿主适配给出它的值在 WP-73b）、控制通道的连接（报告位置与 `STATUS`，执行 `go` 与课堂命令）、`PmToolbar` 中的确认入口、`STATUS`、`OPERATIONS` 的实现；IR 运行时报告 `go`。
6. 幻灯片渲染端：生成的 Slidev 文稿头部写 `mcp: false`；演讲者备注中显示没有子内容的角色的标记。IR 运行时：演讲者窗口中，以及 `EDIT_MODE.active` 时，显示没有子内容的角色的标记 `〔<名> <value>〕`（`ir.md` 2.8、6.4 节；编辑模式的提供方是 WP-79）。网页与 notebook 显示角色的子内容。
7. `scripts/check-layering.mjs` 的五条新规则（`architecture.md` 第 3 节；`deltabox-lite` 只在 `addon-deltabox/src/node/`）。
8. 信任模式与 gateway 的宿主（D13，`architecture.md` 10.1、10.9 节）：服务端在配置了登录时为 SHARED 模式，缺少 gateway 或 agent-host 的地址与令牌、缺少 `PRESMIUM_CONSOLE_HOST` 时，或环境中有第三方凭据的变量时拒绝启动（工作区根目录本身是文档时的拒绝由 WP-79 实现）；SHARED 模式中三个令牌可以取自只有 root 可读的文件（`PRESMIUM_GATEWAY_TOKEN_FILE`、`PRESMIUM_AGENT_HOST_TOKEN_FILE`、`PRESMIUM_PROXY_SECRET_FILE`），以 root 启动时读取后降为 `--user` 给出的用户；`ServerContext.trust`、`gateway` 与 `operatorDir` 按模式给出；`startGateway` 与 `presmium gateway`（加载运营者插件并挂载它们的 `gateway()` 贡献，`GatewayContext` 带 `secret`、`settings`、`operatorDir`；服务令牌 `PRESMIUM_GATEWAY_TOKEN`；`POST /tokens`、`DELETE /tokens/<id>` 签发与作废限定令牌，令牌只在内存中；`/mcp` 原样转发到 `--serve`；默认只监听本机，校验 `Host`，只接受不带 `Origin` 的请求）。
9. 运营者插件与插件的来源（D14 的编译器部分，`architecture.md` 4.2、10.2、10.6 节）：编译器读取 `settings.presmium.workspace.plugins`，在所有命令中为每份文档加载其中声明了 `operator: true` 的插件，另按包名加载随 CLI 安装的 `@presmium/slidev-addon-deltabox`（从 CLI 解析不到时跳过，包由 WP-90 交付并加入 CLI 的依赖；它在列表中的插件之后加载，所以运营者列出的同一令牌的实现优先）；宿主可以给出插件策略（`presmium serve`、gateway、agent-host 用）：文稿的 `plugins` 与 `renderers.<id>.package` 都只加载列表中的、从工作区根目录的 `node_modules`（或随 CLI 安装的 Presmium 自己的包）解析到的包，相对路径与只在文稿目录 `node_modules` 中的包不加载并给出错误级诊断 `presmium.plugins`；宿主还可以给出读取范围（SHARED 的 serve 用）：编译器读取的文件（`ctx.src`、解析器、执行缓存、`localAsset`）真实路径不在工作区根目录之内或在 `.git/` 中时不读取，给出错误级诊断 `presmium.files`；宿主保留的令牌（插件对它们的实现不登记）；LOCAL 模式的运营者目录（`architecture.md` 10.5 节的规则，`--operator-dir`、`PRESMIUM_OPERATOR_DIR`）交给 `NodeServiceContext.operatorDir` 与 `ServerContext.operatorDir`。
10. 所有者控制台（SHARED，`architecture.md` 10.4 节，`design-v0.7.md` 第 37 条）：serve 按请求的 `Host` 区分工作区站点与控制台（`PRESMIUM_CONSOLE_HOST`）；控制台只有本包自带的静态页面（CSP `default-src 'self'; frame-ancestors 'none'`，确认的说明、代码与差异以纯文字显示，列出插件的所有者路由并可以把一个文件发给所选的路由），它自己的控制通道只接受所有者；`workspace` 范围的确认只发往控制台的窗口，只接受来自控制台的回答（`Origin` 的主机名是控制台的主机名且带 `Presmium-Console: 1`）；`role: 'owner'` 的路由只挂在控制台上；控制台的主机名上不转发到站点、没有 `/mcp`；站点上所有者的窗口只收到待回答的数量与控制台的地址。

**验收**：

- `packages/server/test/server.test.ts`：测试插件经 `server()` 贡献一个路由，路由返回它经 `services` 提供的 Node 端服务的值；对测试文稿运行 `presmium dev`，经网页开发服务器的 `/__presmium/<插件 ID>/` 访问得到该值；`Host: evil.example` 的请求与 `Origin: https://evil.example` 的请求都得到 403；`/mcp` 不带令牌得到 401（MCP 本身由 WP-78 挂载，这里只验证挂载点的认证）；以 `--allow operate` 启动时，测试路由请求的 `operate` 确认不经控制通道直接允许。
- 同一文件：以 `serve` 模式启动并设置 `PRESMIUM_PROXY_SECRET`（以及 SHARED 模式要求的 gateway 与 agent-host 的地址与令牌，指向测试起的监听器，与 `PRESMIUM_CONSOLE_HOST=console.test`）：不带密钥的请求被拒绝；带密钥与 `X-Forwarded-Email` 的读者调用默认角色（`editor`）的路由得到 403，调用 `role: 'reader'` 的路由成功；编辑者调用的测试路由请求一个 `workspace` 范围的确认时，确认只出现在所有者控制台的控制通道上，所有者在站点主机名上的控制通道与编辑者的都没有，编辑者回答它得到 403；以非本机地址启动而没有配置登录代理时拒绝启动。
- 同一文件（所有者控制台，第 37 条）：所有者经站点的主机名回答上面的确认得到 403，经 `Host: console.test` 但 `Origin` 是站点的源、或不带 `Presmium-Console` 时同样得到 403，带控制台的 `Origin` 与该请求头时生效；测试插件的 `role: 'owner'` 路由在站点的主机名上得到 404、在控制台上得到 200；控制台的主机名上请求文档页面不转发到站点，响应带 `frame-ancestors 'none'`；没有 `PRESMIUM_CONSOLE_HOST` 时拒绝启动。
- 同一文件：SHARED 模式以令牌文件启动（测试以普通用户运行，文件路径经 `_FILE` 变量给出，不降权）时，三个令牌不在 serve 的环境变量中，服务照常连接测试的 gateway 与 agent-host 监听器。
- `e2e/server.spec.ts`：测试组件用 `useServer()` 显示服务端的回答；同一文稿的静态构建中显示“不可用”的降级文字。测试路由请求一个 `operate` 确认：页面工具栏出现确认入口，点“允许”后路由返回允许，点“拒绝”后返回拒绝。
- 同一文件（所有者控制台，SHARED，两个主机名都解析到本机，如 Chromium 的 `--host-resolver-rules`）：文稿的测试组件在所有者打开的站点页面中，对一个待回答的 `workspace` 范围的确认分别以同源请求与跨源到控制台的请求发出“允许”，两者都不生效（确认仍在等待，测试路由没有得到允许）；所有者在控制台页面上点“允许”后生效，控制台页面中看不到该组件的任何输出。
- 同一文件：放映视图中推进步骤与翻页，测试插件经 `OPERATIONS.subscribe` 收到 `go` 操作；重放一个记录下来的 `go`，放映视图到达该位置，且重放期间不产生新的报告。
- `packages/server/test/server.test.ts`：工作区根目录的 `presmium.workspace.yaml` 中 `settings.<测试插件 ID>` 的值出现在测试插件的 `ServerContext.settings` 与 `NodeServiceContext.settings` 中（路由返回它）；文稿头部 `presmium.<测试插件 ID>` 中的同名键只在 `config` 中，不进入 `settings`。
- 同一文件（D13）：以 `serve` 模式并设置 `PRESMIUM_PROXY_SECRET` 启动时，没有 `PRESMIUM_GATEWAY_URL` 与 `PRESMIUM_AGENT_HOST_URL` 及其令牌时拒绝启动；它们都在而环境中另有 `OPENAI_API_KEY` 时同样拒绝启动并指出变量名；去掉它之后启动，测试插件的路由报告 `trust` 为 `shared`，`secret('OPENAI_API_KEY')` 没有值。
- `packages/server/test/gateway.test.ts`（D13）：`presmium gateway` 加载工作区配置中列出的测试插件，它的 `gateway()` 路由返回 `GatewayGrant` 与 `ctx.secret('TEST_UPSTREAM_KEY')` 是否有值：不带令牌得到 401；带服务令牌得到 200 且凭据可见；`Host: evil.example` 与带 `Origin` 的请求得到 403；经 `POST /tokens` 签发的只含另一个插件的限定令牌得到 403，含本插件的得到 200，`DELETE /tokens/<id>` 之后得到 401；限定令牌调用 `POST /tokens` 得到 403；`/mcp` 原样转发到 `--serve` 给出的测试监听器；默认只监听 `127.0.0.1`。
- `packages/cli/test/plugins.test.ts`（运营者插件）：工作区配置的 `settings.presmium.workspace.plugins` 列出一个声明 `operator: true` 的测试插件，文稿的 `plugins` 不写它：`presmium build` 中它的编译步骤运行、它的 Node 端服务可用；没有列出时不加载。
- `packages/cli/test/roles.test.ts`：测试插件登记角色 `{probe}`，`presmium ir` 中为 `presmiumRole` 节点（带选项与 `value`），网页构建只显示其子内容；没有登记的角色仍压平为文字并警告。
- `e2e/server.spec.ts`：网页的演讲者窗口中，没有子内容的 `{probe}` 显示标记 `〔probe …〕`，文档视图与放映视图中不显示。
- `packages/cli/test/assets.test.ts`：组件以属性路径声明的本地文件（`files.a`）在网页、幻灯片与 notebook 中都被发布并改写。
- 生成的 Slidev 文稿头部有 `mcp: false`（`packages/render-slides/test/deck.test.ts`）；`pnpm test` 的分层检查包含五条新规则并通过。
- 现有的全部测试通过，示例文稿的 IR 不变。

**实际交付**：契约按 `architecture.md` 4.6 至 4.10 节写入（`packages/kernel/src/contracts/` 的六个模块由 `contracts.ts` 再导出）；`@presmium/server`（`startServer`、`startGateway`、`ServerHost`、所有者控制台）；CLI 的 `presmium dev --server-port --allow` 与 `presmium gateway`；编译器的 Node 端服务注册表、行内角色、译本字段（`translations.ts`）、运营者插件、插件策略与读取范围（`CompilerOptions`）；宿主的 `useServer`、`OPERATIONS`、`STATUS`、控制通道与工具栏的确认入口；IR 运行时的 `go`（`followOperations`）与角色的标记；三个渲染端的属性路径。验收用例在 `packages/server/test/server.test.ts`、`gateway.test.ts`，`packages/cli/test/plugins.test.ts`、`roles.test.ts`、`assets.test.ts`，`packages/render-slides/test/deck.test.ts` 与 `e2e/server.spec.ts`。`presmium serve` 属于 WP-79，`serve` 模式的用例由测试用的宿主 `packages/server/test/fixtures/serve-host.ts` 启动真实的 `startServer`。与设计不同或设计没有写明之处写在 `architecture.md` 4.6、4.7、4.9、10.2 至 10.4、10.9 节标明 WP-73a 的段落中，先行验证的结论在 `design-v0.7.md` 第 11 节。

### WP-73b 环境、会话与富输出（I 波次第二步；M6，P-100 至 P-102；已完成）

**需求**：P-100、P-101、P-102（含增补：`text/markdown` 输出作为正文、`:echo: false`）；`review-round2.md` 决定 5（`RunRequest.executor` 精确匹配）；`architecture.md` 9.2 节中归 WP-73b 的三项决定（幻灯片中的现场执行代码块、共享的 Python 运行器、首选执行器）；N-08 中编译时执行的部分（`design-v0.7.md` 第 17 条：清理过的环境变量，以及供 `presmium serve` 使用的执行选项；第 29 条：进程沙箱与 `remote` 选项）。

**归属**：`packages/kernel/src/runner.py`（新）与 `packages/kernel/package.json`（只增加它的导出；契约文件不改）、`packages/compiler/**`、`packages/cli/**`、`packages/viewer/**`、`packages/web/**`、`packages/addon-core/**`、`packages/render-slides/**`、`packages/render-notebook/**`、`packages/addon-exec/**`、`packages/addon-exec-local/**`、`e2e/exec-env.spec.ts`、`e2e/fixtures/exec-env/**`。

**交付**：

1. 编译器：头部 `execute` 写入 IR 的 `config.execute`；代码块与执行面板的 `:env:`、`:session:`、`:echo:`；按 `kind` 由提供方创建环境的执行器；未声明的环境、没有提供方的 `kind`、一个会话中混用环境都是错误；会话键链与会话的重新执行；录制块（`blobs/`）的写入、读回与清理；检查项 `presmium.secrets`（头部中像凭据的值）；`presmium check --env`（调用提供方的 `probe`）。
2. 编译时执行的环境变量与执行选项（`architecture.md` 4.6、10.6 节）：编译器为每次运行给出 `RunContext.env`（`local` 规则：进程的环境去掉 `PRESMIUM_` 开头与名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量；`serve` 规则：允许列表与每个工作区一个临时 `HOME`；都加上 `settings.presmium.exec.passEnv`）；执行选项 `env`、`admit`、`remote` 供 `presmium serve` 使用（由 WP-79 接入与验收；`remote` 时编译器不在本进程中运行任何执行器，把每次运行与会话的结束交给它）；Node 端服务中有 `PROCESS_SANDBOX` 时放进 `RunContext.sandbox`。执行插件的子进程（修正 `packages/addon-exec/src/node/child.ts` 把 `process.env` 整个传入）以 `RunContext.env` 为环境，运行器的输入与结果改为运行目录中的文件（不再用标准输入与文件描述符 3），有 `RunContext.sandbox` 时经它运行（同一会话的代码块在同一次运行中依次执行）；本地环境插件的 `docker`、devcontainer 命令行以它加上 Docker 客户端的变量（`DOCKER_HOST`、`DOCKER_CONTEXT`、`DOCKER_CONFIG`、`DOCKER_CERT_PATH`、`DOCKER_TLS_VERIFY`、`XDG_RUNTIME_DIR` 与真实的 `HOME`）为环境，容器里只传 `RunContext.env` 中的变量（不传 `PATH`、`HOME`）；没有 `ctx` 时只给 `PATH`、`LANG` 与临时的 `HOME`。
3. 执行路由按 `RunRequest.executor` 精确选择；IR 运行时、执行面板与幻灯片的 code runner 把 `executor` 与 `session` 放进请求，不再自己挑选。
4. 执行插件：Pyodide 的会话（每个会话一个常驻的全局命名空间，`endSession` 丢弃）；富输出（`display` 与 matplotlib 的图片、对象的 `_repr_html_`、`_repr_markdown_`）；编译时的 Python 执行器支持会话（会话期间常驻的子进程）与富输出；执行面板的 `:env:`、`:session:`；报告 `run` 操作；Python 运行器移到 `@presmium/kernel/runner.py`，执行插件与本地环境插件共用。
5. 本地环境插件：作为 `kind: devcontainer` 的环境提供方（现有的容器执行器以环境名登记）。
6. IR 运行时：按 MIME 类型显示输出（`ir.md` 6.1 节，DOMPurify、ansi_up、浏览器中的 Markdown 解析）；`echo: false`；会话的“重置”控件；两种宿主适配把 IR 的 `config.execute.environments` 交给 `startHost` 的 `HostStart.environments`（契约与内核中的传递由 WP-73a 实现，经 `StartOptions`、`KernelOptions` 到 `PluginContext.environments`；幻灯片渲染端把它写进 Slidev 头部，`addon-core` 从那里读取）。
7. 幻灯片渲染端：录制的富输出；带 `live` 或 `both` 的代码块写成 `{monaco-run}`。notebook 渲染端：原样写入 `outputs`，`echo: false` 的单元格带 `source_hidden`。

**验收**：

- P-100（`packages/cli/test/env.test.ts`）：文稿声明 `box: { kind: devcontainer }`，代码块写 `:env: box` 时 IR 中 `run.executor` 为 `presmium.env.box`；代码块写 `:env: nowhere` 时 `presmium check` 以错误退出，诊断在该代码块的行上；头部写 `token: sk-…` 时得到警告。
- P-100 与决定 5（`e2e/exec-env.spec.ts`）：现场代码块指定一个没有登记的环境时，运行失败并显示录制输出与原因，不由 Pyodide 运行；不写 `:env:` 的现有测试文稿 IR 与录制不变（示例文稿 `pnpm demo:build` 报告 0 次执行）。
- P-101（`e2e/exec-env.spec.ts`）：网页中同一 `:session:` 的两个 Python 代码块，先运行定义 `x = 41` 的一块，再运行 `print(x + 1)` 的一块得到 `42`；重置会话后再运行第二块得到 `NameError`；同一浏览器上下文中另开一个页面只运行第二块得到 `NameError`（会话按页面隔离）；另一个浏览器上下文只运行第二块得到 `NameError`（会话按学习者隔离）。
- D13（`packages/addon-exec/test/sandbox.test.ts`）：工作区配置列出一个测试运营者插件，它提供的 `PROCESS_SANDBOX` 在给定的运行目录中直接运行命令并记下每次调用：`presmium build` 中 Python 与 JavaScript 代码块都经它运行（调用中有运行器的输入文件，`env` 等于 `RunContext.env`），录制与不经沙箱的构建相同；同一 `:session:` 的两个代码块在一次调用中执行，第二块录制为 `42`。
- N-08（`packages/addon-exec/test/secrets.test.ts`）：设置 `PRESMIUM_PROXY_SECRET` 与 `OPENAI_API_KEY` 后对测试文稿运行 `presmium build`，打印全部环境变量的 Python 代码块与 JavaScript 代码块的录制中没有这两个变量名与它们的值，`.presmium/freeze/`、`ir.json` 与网页产物中都搜不到这两个值；另一份测试文稿的工作区配置写 `settings.presmium.exec.passEnv: [OPENAI_API_KEY]` 时它出现在录制中，`PRESMIUM_PROXY_SECRET` 仍然没有。
- P-101（`packages/addon-exec/test/session.test.ts`）：编译时同一会话的第二块录制为 `42`；第二次构建 0 次执行；改动第一块后整个会话重新执行，两块都更新。
- P-102（`e2e/exec-env.spec.ts` 与 `packages/render-notebook/test/outputs.test.ts`）：生成 PNG 图片的代码块（不依赖 matplotlib，用标准库写出一张小图）在网页与幻灯片中显示 `<img>`，notebook 的单元格中有 `display_data` 的 `image/png`；`:echo: false` 且输出 `text/markdown` 表格的代码块在网页中显示为表格、不显示代码，notebook 中该单元格带 `source_hidden`。
- 9.2 节：幻灯片中带 `:run: live` 的 Python 代码块可以运行并显示输出；执行插件与本地环境插件的集成测试都用共享的运行器通过。

**实际交付**：共享的运行器 `@presmium/kernel/runner.py`（会话、富输出、`IPython.display` 与 matplotlib 的后端，运行目录中的输入与结果文件）；编译器的 `:env:`、`:session:`、`:echo:`（插件的指令由编译器统一读取 `:env:`、`:session:`，`{code-ref}` 因此不必改动 `addon-code`），`config.execute`、具名环境的提供方与检查（`packages/compiler/src/environments.ts`：未声明的环境、没有提供方的 `kind`、一个会话中混用环境、`presmium.secrets`），会话键链、整组执行与录制块 `blobs/`，`RunContext`（`runEnvironment`、`PROCESS_SANDBOX`、`gateway`），执行选项 `CompilerOptions.execution`（`env`、`admit`、`remote`）与 `Compilation.run`；`presmium check --env`；执行插件的本机执行器（运行目录协议、进程沙箱、会话的整组运行）、路由的精确选择与按页面区分的会话、Pyodide 的会话与富输出、执行面板与 code runner 的执行器与会话；本地环境插件的 `devcontainer` 提供方与 Docker 命令行的环境；IR 运行时按 MIME 类型显示输出（`packages/viewer/src/outputs.ts`）、`echo: false`、“重置会话”与 `run` 操作；两种宿主适配的 `HostStart.environments`；幻灯片的富输出与 `{monaco-run}`；notebook 的 `outputs` 与 `source_hidden`。验收用例在 `packages/cli/test/env.test.ts`、`packages/addon-exec/test/session.test.ts`、`sandbox.test.ts`、`secrets.test.ts`、`packages/render-notebook/test/outputs.test.ts`、`packages/addon-exec-local/test/local-env.test.ts`（`kind: devcontainer` 的环境，需要 Docker）与 `e2e/exec-env.spec.ts`。与设计不同或设计没有写明之处写在 `architecture.md` 4.6 节标明 WP-73b 的段落与 9.3 节（Slidev 的代码块属性），先行验证的结论在 `design-v0.7.md` 第 11 节。新增依赖：viewer 的 `dompurify` 3.4.17、`ansi_up` 6.0.6、`mdast-util-from-markdown` 2.1.0、`mdast-util-gfm` 3.1.0、`micromark-extension-gfm` 3.0.0；执行插件的 `dompurify`（幻灯片中 code runner 的 HTML 输出）；幻灯片渲染端的 `mdast-util-from-markdown`、`micromark-extension-gfm`（录制的 Markdown 输出）。

### WP-74 WebAssembly 后端（M6，P-103）

**归属**：`packages/addon-exec-wasi/**`（新）、`e2e/exec-wasi.spec.ts`、`e2e/fixtures/exec-wasi/**`。

**先行验证**：Runno 的运行时二进制（clang、ruby、sqlite）能否自托管、离线加载；Node 中能否运行同一份二进制（`node:wasi` 或 Runno 的 Node 接口）；产物体积。

**交付**：语言 `c`、`cpp`、`ruby`、`sql` 的执行器（浏览器中在 Worker 里运行，编译时在 Node 中运行同一份二进制；编译时 WASI 程序的环境只取自 `RunContext.env`，`architecture.md` 10.6 节）；运行时二进制随产物发布并由网页的 Service Worker 预缓存；环境指纹为二进制的哈希；`kind: wasi` 的环境提供方；中英文的界面文字。

**验收**：

- `e2e/exec-wasi.spec.ts`：一个 C 程序在浏览器中运行，输出与编译时录制的输出一致；页面加载后断网（`context.setOffline(true)`），再次运行仍然成功。
- `packages/addon-exec-wasi/test/compile.test.ts`：把构建的 `PATH` 换成不含 C 工具链的目录，`presmium build` 仍录制出该 C 程序的输出；环境指纹在两次构建中相同。

**实际交付**：插件 `@presmium/slidev-addon-exec-wasi`（ID `presmium.execWasi`）。运行时是 `@runno/sandbox` 0.10.2 随包的二进制（`dist/langs`：clang 8.0.1 与 wasm-ld 加 sysroot `clang-fs.tar.gz`、Ruby 3.2.0、SQLite 3.26），WASI 系统是 `@runno/wasi` 0.10.0；共用的运行器 `src/runner.mjs`（语言与别名 `c`、`cpp`/`c++`/`cc`/`cxx`、`ruby`/`rb`、`sql`/`sqlite`，各运行时的文件与命令行，C 与 C++ 先编译、链接再运行，文件时间固定为 1970-01-01，标准输出与标准错误按写入顺序成为流输出）同时用于浏览器的 Worker（`src/client/wasi.worker.ts`，页面一个常驻 Worker，模块编译一次）与编译时的 Node 工作线程（`src/node/worker.mjs`，每次运行一个，超时即结束线程）。执行器 ID 为 `presmium.wasi`（按语言选择），`kind: wasi` 的环境以 `presmium.env.<名>` 登记同一实现并按环境的 `languages` 限定语言，`probe` 报告不支持的语言与缺少的文件。编译时 WASI 程序的环境是 `RunContext.env`（没有 `ctx` 时为空，编译器与链接器总是为空，工作线程自己的 `process.env` 也为空），浏览器中为空；不经进程沙箱。环境指纹为 `wasi <运行时> sha256:<该运行时文件的哈希前 16 位>`。编译步骤 `presmium.execWasi.runtimes` 把浏览器中运行的代码（`:run: live` 或 `both`，含执行面板的代码）需要的运行时写进插件配置的 `runtimes`；网页经 `vitePlugins`、幻灯片经 `setup/vite-plugins.ts` 在构建中把它们复制到 `<base>wasi/`（开发服务器提供全部运行时），网页的 Service Worker 预缓存产物中的全部文件，因此包括它们。插件配置只有 `loadTimeoutMs`（浏览器中下载与编译运行时的时限，默认 120 秒）；运行超时取请求的 `timeoutMs`，否则 10 秒，从运行时加载完成时计。`RunRequest.args` 与会话不支持（忽略）。验收用例在 `packages/addon-exec-wasi/test/compile.test.ts`（另覆盖 C++、Ruby、SQL、`kind: wasi` 的环境与清理过的环境变量）与 `e2e/exec-wasi.spec.ts`。先行验证的结论在 `design-v0.7.md` 第 11 节。新增依赖：`@runno/wasi` 0.10.0、`@runno/sandbox` 0.10.2（MIT）。

### WP-75 浏览器 GPU 后端（M6，P-104）

**归属**：`packages/addon-exec-webgpu/**`（新）、`packages/addon-exec/**`（Python 桥 `presmium_gpu.py`、脚本 Worker 中 jax-js 的导入映射、执行面板接受任何有执行器的语言）、`e2e/exec-webgpu.spec.ts`、`e2e/fixtures/exec-webgpu/**`。

**先行验证**：JSPI 在各浏览器中的可用性，决定 Python 桥是否提供同步写法；SwiftShader 在无头 Chromium 中的计算着色器与计时；适配器的默认限制。

**交付**：`wgsl` 执行器（Worker 中运行，`{run-panel} wgsl` 的 `:params:` 描述缓冲区、派发与重复次数，返回读回的缓冲区摘要、`timestamp-query` 的计时与适配器信息）；规模限制、超时销毁设备并结束 Worker、监听设备丢失；不可用时按原因回退到录制输出（中英文原因：浏览器没有 WebGPU、没有适配器、缺少特性或限制、设备丢失或超时）；回退适配器上的计时标明“CPU 模拟”；构建时在 Playwright Chromium 中录制（有 GPU 时用 Vulkan 参数，否则用 SwiftShader；Chromium 以 `RunContext.env` 为环境，`architecture.md` 10.6 节），环境指纹为浏览器与适配器描述；JS/TS 中的 jax-js（按需加载，随产物发布）；Pyodide 中的 `presmium_gpu`（异步写法，有 JSPI 时另提供同步写法）。不要求页面设置 COOP/COEP。

**验收**：

- `e2e/exec-webgpu.spec.ts`（以 SwiftShader 参数启动 Chromium）：一个计算着色器（向量加法）运行并显示正确的结果与计时，计时标明为 CPU 模拟；Pyodide 中经 `presmium_gpu` 运行同一个着色器得到同样的结果；一个 JavaScript 代码块用 jax-js 计算 2×2 矩阵乘法，显示正确的结果（P-104 的张量代码）。
- 同一文件（默认的无头 Chromium，没有 GPU 适配器）：GPU 代码块显示录制的输出与原因“没有可用的 GPU 适配器”。
- `packages/addon-exec-webgpu/test/record.test.ts`：`presmium build` 在 SwiftShader 中录制出该着色器的输出，录制的环境指纹注明回退适配器。

**实际交付**：新包 `@presmium/slidev-addon-exec-webgpu`（插件 ID `presmium.execWebgpu`）：`wgsl` 执行器 `presmium.webgpu` 与 `kind: webgpu` 的环境提供方（环境选项 `adapter`：`auto`、`gpu`、`swiftshader`）；纯 JavaScript 的计算核心 `src/gpu.mjs`（浏览器中在每次运行一个的 Worker 里，编译时在 Playwright 的 Chromium 中经 `page.route` 提供的 `https:` 页面里运行同一份）；`src/domain/params.ts` 从着色器的声明与 `:params:` 得出请求（缓冲区按变量名，组、绑定、读写与类型取自声明）；中英文的原因与摘要；超时由 Worker 销毁设备后结束，设备丢失结束运行，规模上限 128 MiB 与 `repeat` 1000；Vite 插件（`vite.config.ts`、`src/node/jax.ts`）把 jax-js 的 ES 模块构建原样发布到 `<base>presmium/jax-js/`。执行插件：Pyodide Worker 中的 `presmium_gpu`（`src/client/presmium_gpu.py`，`await presmium_gpu.run(…)`；有 JSPI 时 Worker 以 `callPromising` 运行代码块，另有 `run_sync`）与代码块顶层的 `await`（`src/client/run_await.py`）；脚本 Worker 的导入映射 `SCRIPT_IMPORTS`（`runner.mjs` 的 `prepare` 改写模块名）；执行面板接受任何语言的 `:params:` 映射，并在现场运行没能进行时显示编译时的输出（属性 `compiledOutput`）与原因。验收用例在 `e2e/exec-webgpu.spec.ts`（测试文稿 `e2e/fixtures/exec-webgpu/`）与 `packages/addon-exec-webgpu/test/record.test.ts`。实现细节写在 `architecture.md` 4.6 节标明 WP-75 的段落、9.3 节（Slidev 为 `{monaco-run}` 中导入的包查找类型）与 `ir.md` 2.7 节，先行验证的结论在 `design-v0.7.md` 第 11 节。新增依赖：`@jax-js/jax` 0.1.25、`playwright-chromium` 1.64.1（与仓库一致）、`yaml`（与执行插件相同的范围）。

### WP-76 远端环境、部署模板与浏览器终端（M6，P-105 至 P-107）

**归属**：`packages/addon-exec-jupyter/**`（新）、`templates/env/**`（新）、`e2e/exec-remote.spec.ts`、`e2e/fixtures/exec-remote/**`。

**先行验证**：服务端的代理在 WebSocket 升级时加上凭据（经渲染端开发服务器的 Vite 代理再转发一次）；浏览器以令牌访问 JupyterHub 用户服务器时的跨域；compose 中 `runtime: runsc` 与 GPU 同时使用（记录结论，模板只在验证通过时提供组合）。

**交付**：`kind: jupyter` 的环境提供方（Node 与浏览器都用 `@jupyterlab/services`）：会话对应内核（`endSession` 关闭内核），每个会话、每个学习者一个内核；输出映射（`stream`、`display_data`、`execute_result`、`error`，`stdin` 经 `input_reply`，超时经中断，`files` 经 Contents API，`args` 写成赋值的前导代码）；环境指纹（镜像摘要、内核规格哈希、`kernel_info`）；`probe`；`env` 与 `proxy` 方式的凭据与地址成对来自运营者的 `PRESMIUM_ENV_<名>_TOKEN`、`PRESMIUM_ENV_<名>_URL`，令牌只发往该地址，文稿的 `url` 与它不同源时不连接并给出错误诊断，没有通用的后备变量（`architecture.md` 第 11 节）；`proxy` 方式的服务端代理（`/__presmium/presmium.execJupyter/env/<名>/`，目标是运营者给出的地址）；`prompt` 方式的令牌输入（`sessionStorage`）；返回的 HTML 经清洗显示；`{terminal}`（xterm.js 与 Jupyter 终端接口）；编译时的客户端不把进程的环境变量传给内核（启动内核的请求不带宿主的环境，`architecture.md` 10.6 节）；SHARED 模式（D13）：插件的 `gateway()` 贡献 `env/<名>/`（HTTP 与 WebSocket 的代理，加上 `PRESMIUM_ENV_<名>_TOKEN`，只发往同一对中的 `PRESMIUM_ENV_<名>_URL`），编译时的执行器有 `RunContext.gateway` 时经它连接环境、`probe` 有 `EnvironmentContext.gateway` 时同样经它、`proxy` 方式的服务端代理有 `ServerContext.gateway` 时以 gateway 为目标（serve 与 agent-host 中都没有环境的令牌）。模板：`templates/env/compose/` 的 `compose.yaml`（固定摘要的 docker-stacks 镜像、令牌、允许的来源、空闲回收、资源限制）、`compose.gpu.yaml`、`compose.gvisor.yaml`、`devcontainer.json`（指向 compose，可用于本地容器与环境复刻）与说明；`templates/env/kubernetes/README.md`（Zero to JupyterHub 的 `values.yaml` 片段、CPU/GPU/MIG 配置、gVisor、回收，agent-sandbox 的模板）。

**验收**（需要 Docker，没有时跳过并说明）：

- `packages/addon-exec-jupyter/test/remote.test.ts`：用 `templates/env/compose/compose.yaml` 启动环境，`presmium build` 录制出远端内核的输出，环境指纹包含镜像摘要与内核版本；指向关闭端口的环境在 `presmium check --env` 中报告不可达。
- `e2e/exec-remote.spec.ts`：`presmium dev` 中 `auth: proxy` 的代码块在浏览器中运行于 compose 的内核，输出与编译时录制的输出一致，页面与它发出的请求中都没有令牌；两个浏览器上下文中同一 `:session:` 的变量互不可见。
- 同一文件（P-105 的 `prompt` 方式）：静态构建的网页中，`auth: prompt` 的代码块在学习者粘贴 compose 环境的令牌后运行成功，令牌只在本页的 `sessionStorage` 中，不出现在产物里。
- 同一文件：`{terminal}` 中执行 `echo presmium-$((6*7))`，终端显示 `presmium-42`。
- `packages/addon-exec-jupyter/test/credentials.test.ts`（不需要 Docker）：设置 `PRESMIUM_ENV_GPU_URL` 与 `PRESMIUM_ENV_GPU_TOKEN`，文稿把环境 `gpu` 的 `url` 写成测试在另一个端口上起的监听器：`presmium build` 与 `presmium dev` 的代理都不连接它（监听器收不到任何请求，令牌没有出现），诊断说明文稿的地址与运营者的地址不一致；只设置令牌而不设置地址时同样不发送令牌。
- `packages/addon-exec-jupyter/test/gateway.test.ts`（D13，不需要 Docker）：`presmium gateway` 的环境中有 `PRESMIUM_ENV_GPU_URL`（指向测试起的监听器）与 `PRESMIUM_ENV_GPU_TOKEN`：带含 `presmium.execJupyter` 的限定令牌请求 `presmium.execJupyter/env/gpu/api/kernelspecs`，监听器收到带该令牌的请求，调用方的响应中没有它；只含其他插件的限定令牌得到 403；没有地址的环境 `cpu` 得到 404，监听器收不到请求。
- Kubernetes 的示例配置由验收者按文档评审（不运行集群）。

**实际交付**：`@presmium/slidev-addon-exec-jupyter`：`kind: jupyter` 的环境提供方（`src/node/environments.ts`：编译时执行器、环境指纹、`probe`）、Node 与浏览器共用的 `@jupyterlab/services` 客户端（`src/jupyter/`：内核池、输出映射、`stdin`、中断、Contents API 的文件、终端）、凭据规则（`src/domain/connection.ts`）、服务端的代理（`src/node/server.ts`）、gateway 中的代理（`src/node/gateway.ts`）、`{terminal}` 与编译步骤 `presmium.execJupyter.terminals`（检查环境）、浏览器端的执行器与 `JUPYTER_ENVIRONMENTS`（`src/client/`，`prompt` 的令牌对话框）、`PmTerminal`（xterm.js）、网页服务端渲染用的 Vite 插件（`vite.config.ts`）；模板 `templates/env/compose/`（`compose.yaml`、`compose.gpu.yaml`、`compose.gvisor.yaml`、`.devcontainer/devcontainer.json`、`README.md`）与 `templates/env/kubernetes/README.md`。开发容器定义放在 `.devcontainer/` 中（devcontainer 命令行与本地环境插件按约定在那里找它）。验收用例在 `packages/addon-exec-jupyter/test/remote.test.ts`、`credentials.test.ts`、`gateway.test.ts` 与 `e2e/exec-remote.spec.ts`（测试文稿 `e2e/fixtures/exec-remote/`，compose 项目名 `wp76-*`，端口 4843、4845、4846）。实现的细节与设计没有写明之处在 `architecture.md` 4.6 节标明 WP-76 的段落，先行验证的结论在 `design-v0.7.md` 第 11 节（`runsc` 与 GPU 的组合没有验证，模板不提供）。新增依赖：`@jupyterlab/services` 7.6.4、`@xterm/xterm` 6.0.0、`@xterm/addon-fit` 0.11.0、`ws` 8、`dompurify` 3.4.17（浏览器中清洗远端的 HTML 输出），开发依赖 `@types/ws`。SHARED 模式中 serve 到 gateway 的代理要等服务端转发时去掉浏览器的 `Origin`（交付报告中提出）。

### WP-85 富内容增补：视频封面与字幕轨、卡片与栅格（M9，P-42 增补、P-46）

P-46 原计划在 WP-86；它改的是编译器、内核的 Markdown 降级与 IR 运行时，与站点无关，放在 I 波次以免 J2 的两个工作包同改编译器。

**归属**：`packages/addon-content/**`、`packages/compiler/src/source.ts`、`packages/compiler/src/directives.ts`、`packages/compiler/package.json`（增加 `myst-ext-card`、`myst-ext-grid`、`myst-ext-tabs`、`myst-ext-button` 四个依赖）、`packages/kernel/src/markdown.ts`、`packages/viewer/src/markdown.ts`、`packages/viewer/src/cards.ts`（新）、`packages/viewer/src/style.css`、`packages/render-slides/src/deck/style.css`、`packages/render-notebook/test/cards.test.ts`（新）、`e2e/content.spec.ts`、`e2e/fixtures/content/**`。

**交付**：编译器以内置方式接受 `myst-ext-card`、`myst-ext-grid`、`myst-ext-tabs`、`myst-ext-button` 的指令与角色，指令信息供语言服务补全；`lowerMyst` 的规则（幻灯片中的卡片与栅格结构、选项卡依次展开；notebook 降级为标题加段落并列入构建报告）；IR 运行时显示栅格（按屏宽分列）、卡片（含链接）、选项卡（可切换，按 `:sync:` 联动）与按钮；`{video}` 的 `:poster:`、`:captions:`、`:captions-default:`，以属性路径声明 `assets`，文件不存在时报错，notebook 扩展写出带 `<track>` 的 `<video>`。

**验收**：

- P-42（`e2e/content.spec.ts`）：带封面与中英字幕的 `{video}` 在网页与幻灯片中是带 `poster` 与两个 `<track>` 的 `<video>`，封面与两个 VTT 文件都返回 200；`packages/addon-content/test/media.test.ts`：notebook 中有同样的 `<track>`，文件在 `media/` 中；字幕文件不存在时构建报错，诊断在该指令的行上。
- P-46（`e2e/content.spec.ts`）：三张卡片的栅格在桌面宽度下为三列、手机宽度下为一列，卡片中的按钮是链接；切换一个选项卡时同 `:sync:` 的另一组一起切换；幻灯片中显示卡片。`packages/render-notebook/test/cards.test.ts`：notebook 中卡片与选项卡成为标题加段落，构建报告列出这些降级。

**实现说明**：测试文稿在 `e2e/fixtures/content/cards.md`（由 `lecture.md` 引入）；IR 保留 mystmd 原样的 `grid-item` 与 `class: 'button'`，`lowerMyst` 新增选项 `cards`（不写时随 `iframes`），网页的选项卡在 `packages/viewer/src/cards.ts`。与设计的出入及其原因见 `design-v0.7.md` 第 11 节。

### WP-88 先预测再揭示（M9，P-68）

**归属**：`packages/addon-classroom/**`、`e2e/predict.spec.ts`、`e2e/fixtures/predict/**`。

**交付**：`{predict}` 指令与编译步骤 `predict-reveals`（把之后一步的内容移入子块）；`PmPredict`：读者保存预测前隐藏揭示内容，预测存于本机，课堂中写入 `predictions` 集合并在演讲者面板中显示分布；notebook 扩展；课堂插件向 `STATUS` 登记不含身份的汇总（参与人数、作答与预测的分布、未回答的问题数），供 MCP 的 `get_classroom` 读取。

**验收**：

- `e2e/predict.spec.ts`：文档视图中揭示内容在作答前不可见，选择一个选项并保存后可见，重新加载页面后仍可见；没有 `:choices:` 的预测写下一段文字并保存后揭示内容可见；课堂中两个学习者分别选 2 与 3，主讲的面板显示两个选项各 1 人（这个用例在 `presmium dev` 中运行，同时检查页面经控制通道报告的 `STATUS` 汇总中预测的分布，且不含学习者的昵称）。
- `packages/addon-classroom/test/predict.test.ts`：notebook 中为问题、选项与折叠的揭示内容。

### WP-77 讲授轨、录制与回放（M8，P-130、P-90、P-131、P-137）

P-137 的格式、导出与过期标记属于讲授轨，在这里实现；由 agent 生成译文在 WP-84。

**归属**：`packages/addon-lecture/**`（新）、`packages/addon-guide/**`（报告与重放 `spot`、`hint`）、`e2e/lecture.spec.ts`、`e2e/fixtures/lecture/**`。

**先行验证**：Mediabunny 经 WebCodecs 录为 Ogg/Opus 在 Chromium、Firefox、WebKit（Safari 26）中是否可用、可跳转；不可用时退回 MediaRecorder 的 WebM 与时长修正。

**交付**：讲授轨的领域模型与格式（`ir.md` 第 9 节，含语音段的译文与可选的 `video`）；放映视图中的录制：录音（回声消除与降噪）、每 5 秒一块经服务端路由上传、订阅 `OPERATIONS` 写成事件、指针 `point` 与激光笔、荧光笔 `ink` 的报告、可选的摄像头与屏幕（写入 `lectures/<id>/video/`，轨中的 `video` 引用它们）、只重录某一节、`lectures/<id>/` 中忽略音频与录像的 `.gitignore`（去处取运营者设置 `settings.presmium.lecture.audio`，默认 `ignore`）；回放视图 `lecture`：`TrackClock`（`MediaClock`、`SilentClock`）、经 `OPERATIONS` 折叠出 `state(t)`、逐字稿（点击跳转）、章节、字幕、倍速、“我来试试”（暂停后自行操作，回到讲授时还原）、AI 语音标识；导出 `captions.<语言>.vtt`（含译文，过期时警告）、`chapters.vtt`、`events.vtt`；检查项 `presmium.lecture`（漂移分级、失效事件）；`lecture` 站点渲染端发布录制的讲授轨（合成部分在 WP-83）；引导插件报告与重放聚光、提示。

**验收**：

- `e2e/lecture.spec.ts`（假麦克风，参数只加在本 spec）：放映视图中录制一段讲授：翻到第二节、推进两步、指向代码块并聚光；停止后 `lectures/<id>/track.json` 中有 `go`、`point`、`spot` 事件与 Ogg/Opus 音频，没有视频。
- 同一文件（P-90 可选的摄像头）：开启摄像头（Chromium 的假摄像头）再录一段，`lectures/<id>/video/` 中有一段录像，`track.json` 的 `video` 引用它。
- 同一文件：以另一个窗口尺寸回放一份带语音段的测试讲授轨：跳到第二个 `go` 的时刻显示对应的章节与步骤；点击一句逐字稿跳到它的时刻；暂停后自行翻页，再回到讲授时恢复 `state(t)`。
- 同一文件（P-131 的倍速与字幕）：以 2 倍速播放 1 秒后时钟约在 2 秒（相差不超过 0.3 秒）；开启字幕后显示当前语音段的文字。
- `packages/addon-lecture/test/track.test.ts`：删掉测试讲授轨引用的块后，`presmium check` 以 `presmium.lecture` 报告失效的事件与它的时刻；导出中英两份字幕；改动一句原文后，英文译文导出时被标为过期。

**实际交付**：`@presmium/slidev-addon-lecture`（新）：讲授轨的领域层（`src/domain/`：读写与每项一行的 `track.json`、`at` 的时刻、章节、漂移分级、块指纹与 IR 哈希、三种 VTT、指针路径的简化、重录一节的拼接）；服务端路由（讲授列表、讲授轨与媒体的读取，录制的开始、文件命名、按位置上传、结束；`ir.md` 9.4 节）；检查项 `presmium.lecture`；站点渲染端 `lecture`（录制的讲授轨、媒体、`captions.<语言>.vtt`、`chapters.vtt`、`events.vtt` 与 `index.json`）；浏览器端的视图 `lecture`、放映视图上的录制与播放图层、`SilentClock` 与 `MediaClock`、`point` 与 `ink` 的报告与重放。引导插件：`spot`、`hint` 的报告（放映视图中的 `s`、`h`）与重放（新的 `src/client/plugin.ts`、`src/client/viewer.ts`、`src/client/adhoc.ts`），driver.js 的层叠样式从组件移到 `spotlight.css`、`hints.css`，没有 `{spotlight}` 的页面上的聚光同样不挡住操作。验收用例在 `e2e/lecture.spec.ts`（测试文稿 `e2e/fixtures/lecture`，其中的 `lectures/demo/track.json` 是回放用的讲授轨，音频由用例在构建前写入）与 `packages/addon-lecture/test/track.test.ts`。与设计不同之处：回放在放映视图上进行（`architecture.md` 4.9 节），先行验证的结论在 `design-v0.7.md` 第 11 节。新增依赖：`mediabunny` 1.61.3（MPL-2.0，`addon-lecture`）。

### WP-82 语音服务与 gateway 中的语音（M8，P-132、P-133 的服务部分；N-08 中语音的部分；D13 中 gateway 的语音、同意记录与服务提供方）

讲授轨中的转写与重新合成在 WP-83 串起来；这里交付语音服务本身。gateway 的宿主（`presmium gateway`、令牌、挂载）由 WP-73a 建成，本工作包交付语音插件在其中的贡献，并验收 gateway 中的运营者数据（同意记录、服务提供方的名字）。

**归属**：`packages/addon-speech/**`（新）、根目录 `.gitignore`（增加 `!**/.presmium/speech/` 与 `!**/.presmium/speech.lock.json`）。

**先行验证**：火山引擎转写中英混说的效果（用一段测试讲授的录音）；GB 45438 元数据字段在 Ogg、WAV 与 MP4 中的写法（结论决定 AI 标识用例检查的字段）；Safari 26 录制 Ogg/Opus（与 WP-77 一起）。

**交付**：`SPEECH` 的两个实现（Node 端直接调用引擎，浏览器端经网关）；语音网关（服务端贡献：OpenAI 音频接口的形态与 `/audio/speech/timestamps`，引擎与音色列表，每个引擎带运营者配置的服务提供方 `provider`；编辑者可用）；引擎适配：`volcengine`（合成用 `seed-tts-2.0` 的 HTTP 分块接口并开启 `enable_subtitle`；转写用极速版；地址与服务提供方的名字固定，为“火山引擎”，英文界面为 Volcengine；凭据来自 `PRESMIUM_SPEECH_VOLCENGINE_APPID`、`PRESMIUM_SPEECH_VOLCENGINE_KEY`）、OpenAI 音频接口形态的引擎（运营者以 `PRESMIUM_SPEECH_<ID>_URL`、`PRESMIUM_SPEECH_<ID>_PROVIDER`（必需）与可选的 `PRESMIUM_SPEECH_<ID>_KEY` 定义，凭据只发往同一组中的地址，缺少地址或服务提供方时引擎不可用；文稿的 `presmium.speech.engine`、`transcribe` 只用 ID 选用默认的合成与转写引擎；`presmium.speech` 中的 `url`、`keyEnv` 等引擎定义是错误级诊断且不被使用）、`fake`、浏览器中的 `webspeech` 试听（只用 `localService` 为真的本机音色，文字不离开浏览器）；合成缓存与 `speech.lock.json`（音频保留引擎返回的格式，不重新编码：向引擎请求 Ogg/Opus，只给出其他格式的引擎按其格式保存，假引擎为 WAV；`ir.md` 9.1 节）；语音服务写入缓存时在音频的元数据中加入 AI 生成的标识与 GB 45438 的字段（Ogg 的 Opus 注释头、WAV 的 `LIST`/`INFO` 块，字段按先行验证的结论，写进 `design-v0.7.md` 第 11 节；不改动引擎写入的其他内容），`<键>.json` 带同样的标识；克隆音色的关口（运营者设置 `settings.presmium.speech.cloned` 与运营者目录中的同意记录 `<consentDir>/<引擎>/<音色>.json`，`consentDir` 取 `settings.presmium.speech.consentDir`，默认 `consent`，相对于运营者目录：LOCAL 为 `NodeServiceContext.operatorDir`（工作区之外的用户状态目录），gateway 为 `GatewayContext.operatorDir`；合成前检查，Node 端与网关同一处；文稿目录中的记录被忽略）；所有者登记同意记录的路由 `consent/<引擎>/<音色>`（`role: 'owner'`，SHARED 中因此只挂在所有者控制台的源上（WP-73a）；LOCAL 写入运营者目录，SHARED 转给 gateway 中只接受服务令牌的同名路由）与运营者的 `presmium-speech consent`（`--operator-dir`，默认按 LOCAL 运营者目录的规则；SHARED 在 gateway 容器中运行）；`presmium-speech fake`（音色中有一个克隆音色）；没有定义引擎时不发出请求。SHARED 模式（D13）：语音插件的 `gateway()` 贡献 `v1/…`（同语音网关的协议、引擎与服务提供方取自 gateway 的环境、同意记录的检查与登记），serve 与 agent-host 中的 Node 端 `SPEECH` 经 `NodeServiceContext.gateway` 调用它，浏览器经 serve 的网关路由转到它；`SPEECH.engines()` 返回 `Promise`。单独运行的语音网关 `presmium-speech serve` 与签名的同意记录都不再提供（`design-v0.7.md` 第 30 条），D9 的安全要求由 `presmium gateway` 满足（WP-73a）。

**验收**：

- `packages/addon-speech/test/speech.test.ts`（假引擎）：把假引擎合成的一段音频转写，得到带逐字时间的语音片段，文字一致；用音色 A 合成一句话后缓存中有它的音频与逐字时间，再次合成不向引擎发请求；换音色 B 得到新的缓存键与音频；对测试文稿运行 `presmium dev`，经网关（`/__presmium/presmium.speech/v1/audio/speech/timestamps`，浏览器端的实现所用的路径）合成成功，请求与响应中都没有凭据；没有配置引擎时假引擎收不到任何请求。
- 同一文件（N-08）：经网关列出的引擎带服务提供方（假引擎由测试设置 `PRESMIUM_SPEECH_FAKE_PROVIDER=Presmium fake`）；另一个只设置了 `_URL` 与 `_KEY`、没有 `_PROVIDER` 的引擎不可用，诊断指出缺少的变量；假引擎的克隆音色在运营者没有设置 `cloned: true` 时合成被拒绝，设置后没有同意记录仍被拒绝并指出缺少的记录文件；同一份记录写在文稿的 `.presmium/speech/consent/` 中时被忽略，合成仍被拒绝；所有者经 `consent/<引擎>/<音色>` 路由登记后（记录出现在运营者目录的 `consentDir` 中，测试以 `PRESMIUM_OPERATOR_DIR` 把它指向工作区之外的临时目录），合成成功。
- 同一文件（N-08 的 AI 标识）：假引擎合成并写入缓存的音频文件（`<键>.wav`）的 `LIST`/`INFO` 元数据与它的 `<键>.json` 都带 AI 生成的标识与先行验证确定的 GB 45438 字段，假引擎嵌入的文字与音色仍能转写回来。
- `packages/addon-speech/test/gateway.test.ts`（D13：gateway 中的语音与运营者数据）：`presmium gateway`（运营者目录为临时目录）的环境中有 `PRESMIUM_SPEECH_FAKE_URL` 与 `PRESMIUM_SPEECH_FAKE_PROVIDER=Presmium fake`，以 SHARED 模式启动的 `presmium serve` 的环境中没有任何语音变量：经 serve 的网关路由列出的引擎带服务提供方 `Presmium fake`，合成成功，假引擎收到的请求来自 gateway；工作区中（文稿目录里与工作区根目录下）写着克隆音色的记录时，经 serve 的合成仍被拒绝（gateway 只认自己运营者目录中的记录）；serve 的 `consent/<引擎>/<音色>` 路由在站点的主机名上得到 404，所有者经所有者控制台的源调用它登记后，记录出现在 gateway 的运营者目录中，合成成功；只含 `presmium.assistant` 的限定令牌直接调用 gateway 的语音路由得到 403。
- 同一文件（N-08）：文稿头部写 `presmium.speech.engines.x: { url: <测试监听器的地址>, keyEnv: PRESMIUM_PROXY_SECRET }` 并选用 `engine: x`：`presmium check` 给出错误诊断，构建与经网关的合成都失败并说明引擎未定义，监听器收不到任何请求，`PRESMIUM_PROXY_SECRET` 的值不出现在任何请求与响应中。
- `packages/addon-speech/test/engines.test.ts`：火山引擎与 Groq 的冒烟用例只在设置了 `PRESMIUM_TEST_VOLCENGINE_KEY`、`PRESMIUM_TEST_GROQ_KEY` 时运行，没有时跳过并说明。

**实际交付**：`@presmium/slidev-addon-speech`（运营者插件，`presmium.speech`）。`src/domain/`：文稿配置与它的诊断（`config.ts`）、运营者环境中的引擎定义与服务提供方（`engines.ts`）、协议的类型（`protocol.ts`）、假引擎的计时与读音词典（`words.ts`）、同意记录的校验（`consent.ts`）、GB 45438 的标识（`aigc.ts`）。`src/node/`：引擎适配（`engines/openai.ts`：OpenAI 音频接口形态，含 Presmium 的 `audio/speech/timestamps` 与 `audio/voices`，拒绝重定向；`engines/volcengine.ts`）、本进程的引擎与克隆音色的关口（`core.ts`、`consent.ts`）、gateway 的客户端（`remote.ts`）、文稿的合成缓存与锁定文件（`cache.ts`、`deck.ts`）、协议的路由（`routes.ts`）、服务端贡献（`server.ts`）、gateway 贡献（`gateway.ts`）、Node 端 `SPEECH`（`service.ts`）、`presmium.speech` 的检查步骤（`pass.ts`）、音频元数据（`audio/riff.ts`、`audio/ogg.ts`、`audio/label.ts`）、假引擎（`fake.ts`）与 `presmium-speech`（`cli.ts`，`bin/presmium-speech.mjs`）。`src/client/`：浏览器端 `SPEECH`（`speech.ts`，经 `useServer()`）、`webspeech` 试听（`webspeech.ts`：`webSpeechVoices`、`previewWebSpeech`，只用 `localService` 的音色；它不给音频，所以不是 `SPEECH` 的引擎）；`setup/main.ts` 在幻灯片形态中登记。没有新的第三方依赖（`jiti` 启动 `presmium-speech`，`@presmium/compiler` 给 `presmium-speech consent` 找运营者目录与工作区设置）。用例：`test/speech.test.ts`（`presmium dev` 与假引擎进程：缓存、命中不发请求、换音色、转写往返、引擎列表与缺少 `_PROVIDER` 的诊断、标识、读音词典（引擎收到读法，逐字时间按原文）、Node 端 `SPEECH`（测试插件 `test/fixtures/speech-probe` 的路由调用它：音频是缓存中的文件，与路由共用缓存）、LOCAL 的克隆音色与同意记录、引擎的音色列表取不到时拒绝克隆音色并在下一次重新获取（`helpers.ts` 的 `front()` 在假引擎之前让音色列表答 503）、没有引擎时不发请求）、`test/gateway.test.ts`（SHARED 的 serve、gateway、agent-host 三个进程：serve 经文稿的缓存回答浏览器的路径，重复的合成不发请求；serve 中的 Node 端 `SPEECH` 经 gateway 并与浏览器的路径共用缓存；文稿定义引擎的错误）、`test/engines.test.ts`（有凭据时运行）。与设计不同或设计没写明之处：合成缓存的键不含模型而含“要说的文字”（`ir.md` 9.1 节）；`PRESMIUM_SPEECH_VOLCENGINE_APPID` 可选（新控制台的密钥不要它），另有可选的 `PRESMIUM_SPEECH_<ID>_MODEL`、`_TRANSCRIBE_MODEL`（`ir.md` 2.1 节）；标识由 gateway 或本进程的语音服务在合成时写入，所以经网关试听的音频也带标识；克隆音色的关口只在合成时检查，缓存命中不再检查；读音词典由语音服务换成读法后送给所有引擎，不用火山引擎的 `pronunciation_dict`（读法因此是文字，不支持它的拼音写法），引擎给出的逐字时间再换回原文（`ir.md` 2.9 节）；只给出 WAV 与 Ogg/Opus 以外格式（如 MP3）的引擎不按其格式保存而是合成失败，因为没有在那些格式中写入 AI 生成标识的实现（`ir.md` 9.1 节）；引擎 ID 不分大小写，`-` 与 `_` 相同（`engine: my-engine` 即 `PRESMIUM_SPEECH_MY_ENGINE_*` 定义的 `my_engine`）；路由与协议的细节在 `architecture.md` 10.9 节标明 WP-82 的段落；先行验证的结论在 `design-v0.7.md` 第 11 节（GB 45438 的字段位置没能读到 TC260 指南的原文，要验收者确认；中英混说与 Safari 没有实测）。

### WP-83 脚本化讲授、语音串联与导出视频（M8，P-134、P-135；P-132、P-133 在讲授轨中的串联）

**归属**：`packages/addon-lecture/**`、`e2e/lecture-script.spec.ts`、`e2e/fixtures/lecture-script/**`。

**先行验证**：`@mediabunny/server` 附带的 FFmpeg 是 LGPL 还是 GPL；若为 GPL，只导出 WebM（在 Chromium 页面中用 Mediabunny 的 WebCodecs 路径合成），不导出 MP4。

**交付**：`{cue}`、`{say}` 角色与 `presmium.lecture` 的检查；`lecture` 渲染端的讲授计划（讲解、`{only} lecture`、`renderers.lecture.script`）、经 `SPEECH` 合成（命中缓存的段落不重新合成，只为缺失的段落调用引擎并写入缓存）、提示标记的时刻（逐字时间、转写对齐、线性估算）、`ClipClock`、写出 `dist/lecture/<id>/`；开发中经服务端按需生成；agent 工具 `lecture_preview`（读取）、`lecture_synthesize` 与 `track_transcribe`（计费，需要确认）；录制的讲授的转写（得到语音段与 `at` 绑定；转写的入口与确认写明引擎的服务提供方，N-08）、修改语音段文字后重新对齐、换音色重新合成（事件按 `at` 重新计时）；`presmium-lecture export`（Playwright 播放，Mediabunny 合成音视频）。

**验收**：

- `e2e/lecture-script.spec.ts`：用假引擎构建测试讲义（讲解中有 ``{cue to=code-1 lines=2-3}`spot` ``），回放到提示标记所在字的时刻时，`code-1` 的第 2、3 行被聚光；`{say}` 的显示文字不变、合成请求中是别名；回放这份合成的讲授时播放界面显示“AI 合成语音”（N-08）。
- 同一文件：录制一段讲授（假麦克风）并转写，转写的按钮与确认中写明服务提供方 `Presmium fake`，得到语音段；把一句改为新的文字、换一个音色重新合成，回放时这一句的片段是新文字、新音色（假引擎的音频中嵌入了文字与音色），没有 `at` 的事件时刻不变。
- `packages/addon-lecture/test/script.test.ts`：第一次构建为每个段落向假引擎请求一次合成并写入缓存，讲授计划、片段、字幕与提示标记的时刻符合假引擎的逐字时间；第二次构建假引擎收不到请求；删掉缓存且没有定义引擎时构建失败，`presmium check` 指出缺少合成的段落。
- 同一文件（P-134 的单独脚本）：`renderers.lecture.script` 指向的脚本中有 `(merge)=` 一节，讲授计划中这一节各步的文字取自脚本（第 k 段属于第 k 步），其他章节仍取讲义的讲解；网页中 `merge` 一节的讲解不变。
- `packages/addon-lecture/test/video.test.ts`：`presmium-lecture export` 生成带音轨的视频文件，时长与讲授轨相差不超过 1 秒。

**实际交付**：讲授插件 `@presmium/slidev-addon-lecture` 增加：`src/domain/` 的讲解读法（`narration.ts`）、讲授计划（`plan.ts`）、合成的时间线（`synthesis.ts`）、逐字处理（`words.ts`）与讲授轨的编辑（`editing.ts`），讲授轨的 `Utterance.clip` 与合成音色的 `provider`；`src/node/` 的行内角色 `{cue}`、`{say}`（`roles.ts`）、单独的讲授脚本（`script.ts`）、讲授计划与编译步骤 `presmium.lecture.keep`（`plan.ts`）、经 `SPEECH` 的合成与转写（`speak.ts`、`lecture.ts`）、站点渲染端的合成讲授 `script/` 与 `clips/` 及锁定文件的清理、检查项的计划部分、服务端的 `tracks/script`、`clips/`、`speech` 与 `editing/*` 路由、agent 工具 `lecture_preview`、`lecture_synthesize`、`track_transcribe`（`tools.ts`，经插件的 Node 服务 `LECTURE_DECK`）与 `presmium-lecture export`（`export.ts`、`cli.ts`、`bin/presmium-lecture.mjs`）；`src/client/` 的 `ClipClock`、播放器的 `advanceTo` 与导出模式（`&export`）、编辑面板 `TrackEditor.vue`（转写、重新合成，入口与确认写明服务提供方）与逐字稿中每句的修改（合成音色的讲授中保存即重新合成这一句，同样先确认）。验收用例在 `e2e/lecture-script.spec.ts`（测试文稿 `e2e/fixtures/lecture-script`；假引擎是用例自己起的 `presmium-speech fake` 进程；录制的 Ogg/Opus 假引擎读不回，所以用例在它之前加一层，按顺序以固定的转写回答录音的转写请求）、`packages/addon-lecture/test/script.test.ts`（另有一个用例：`presmium dev` 中 `tracks/script` 按需合成，agent 经 MCP 的 `lecture_preview` 读到讲授计划）与 `test/video.test.ts`。先行验证：`@mediabunny/server` 附带的 FFmpeg 是 GPL（`--enable-gpl --enable-version3`，链接 x264、x265），所以只导出 WebM，在 Chromium 页面中以 Mediabunny 的 WebCodecs 路径合成（`design-v0.7.md` 第 11 节）。与设计不同或设计没写明之处写在 `ir.md` 2.9 节（讲授计划、提示标记的位置与目标、时间线、`{say}` 的逐字时间、脚本的读法、`script` 的 ID）、6.3 节、9.1 节（`clip`、`provider`、转写与改文字、换音色）、9.3 节、9.4 节（路由与编辑面板）与 `architecture.md` 4.8、4.9 节标明 WP-83 的段落；要点：合成要文稿写明 `renderers.lecture.voice`；转写与合成的确认是页面上写明服务提供方的确认框而不是 `APPROVALS`；引擎不给逐字时间时转写片段对齐，结果写在合成缓存中的 `<键>.align.json`；构建发布全部讲授后清理 `speech.lock.json` 中不再用到的键（不删缓存中的文件）；只有编辑者的请求让服务端合成 `script`，读者的请求不发起计费的请求；路由、agent 工具与检查都按讲授渲染端的视图（`viewFor`）计划，与构建一致；`presmium check` 只查找，不向语音引擎发请求。新增依赖：`@presmium/compiler`、`jiti`（`presmium-lecture`）、`mdast-util-from-markdown` 2.1.0（读脚本）、`playwright-chromium`（导出；可选的 peer 依赖 `^1.40.0`，先用文稿自己的，与 Slidev 的导出相同）；开发依赖 `@modelcontextprotocol/client` 2.3.1（测试中以 agent 的身份调用工具）与 `playwright-chromium` 1.64.1。

### WP-78 agent 环境（M7，P-110）

**归属**：`packages/mcp/**`（新）、`packages/server/**`（挂载 `/mcp`、为 agent 会话签发令牌）、`e2e/mcp.spec.ts`、`e2e/fixtures/mcp/**`。

**交付**：`McpHost`（`@presmium/mcp` 自己声明的宿主接口，`architecture.md` 10.2 节）与 `createPresmiumMcp(host)`：读取类工具 `list_documents`、`deck_info`、`list_sections`、`get_section`、`get_step`、`search`（与网页搜索同一份索引）、`get_code_ref`、`get_outputs`、`get_diagnostics`、`locate_source`、`get_position`、`get_classroom`（页面经 `STATUS` 报告的摘要，按插件 ID）；操作类工具 `navigate`、`run_code`、`build`、`classroom_start`、`classroom_end`（经 `APPROVALS`，范围为 `content`，发给令牌所绑定的成员；`run_code` 经 `ServerHost` 运行一个代码块，`run_code` 与 `build` 使用宿主的执行选项。SHARED 模式中两者按 `architecture.md` 10.6 节随 `settings.presmium.exec.compile` 变化：`approve` 时 `run_code` 的确认为 `workspace` 范围，只发给所有者，允许即放行这次执行；`trusted` 时为 `content`；`off` 时不列出 `run_code`；这一条的验收在 WP-80，因为 SHARED 模式要 WP-79 的 agent-host）；读取对读者成员的令牌与 `tutor` 令牌用 `ServerHost` 的 `student` 视图（D8，筛选由 WP-87 实现）；插件贡献的 `AgentTool`；与读取类工具对应的只读资源，`presmium://position` 可订阅并在位置变化时发出 `resources/updated`；服务说明（instructions）；`tutor` 令牌只列出读取类工具；`presmium-mcp`（stdio，在编译器上实现 `McpHost`，不加 `--allow operate` 时没有操作类工具）。服务端：在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost` 并挂载 `/mcp`；`MCP_ENDPOINT` 的实现（签发绑定成员与模式的令牌，`revoke` 作废；`McpAccess.url` 在 LOCAL 模式中是服务端的本机地址，在 SHARED 模式中是 `PRESMIUM_GATEWAY_URL` 下的 `/mcp`，由 gateway 转发），`presmium dev` 另接受每进程的令牌。不提供写文件的工具。

**验收**：

- `packages/mcp/test/mcp.test.ts`（MCP SDK 的客户端连接 `presmium dev` 的 `/mcp`）：列出章节；读取一节的讲解与代码；`run_code` 发出确认请求，测试经控制通道允许后得到输出，拒绝时得到错误结果；不带令牌得到 401；测试插件的路由经 `MCP_ENDPOINT.issue(member, 'tutor')` 取得令牌，以它连接时看不到操作类工具，`revoke` 之后同一令牌得到 401；订阅 `presmium://position` 后，页面报告新的位置时收到 `resources/updated`；`presmium-mcp` 以 stdio 列出读取类工具。
- `e2e/mcp.spec.ts`：放映视图打开时，MCP 客户端调用 `navigate` 到第三节，页面出现确认入口，允许后放映视图显示第三节。
- 同一文件：测试插件向 `STATUS` 登记一个摘要，页面打开时 MCP 的 `get_classroom` 返回它（课堂插件的真实汇总由 WP-88 登记）。
- 原先在这里的 `presmium serve` 中编辑者的令牌调用 `run_code` 的用例（D1、D2）移到 WP-80：SHARED 模式要 WP-79 的 agent-host，而 WP-78 与 WP-79 并行；`packages/mcp/test/` 也不为此引用服务端以外的宿主（`design-v0.7.md` 第 35 条）。

**实际交付**：`@presmium/mcp`（`McpHost`、`createPresmiumMcp`、`serveMcpStdio`；工具、资源与服务说明在 `src/mcp.ts`，读取文稿与搜索在 `src/deck.ts`，确认的说明按文稿语言在 `src/messages.ts`）与可执行文件 `presmium-mcp [文稿] [--allow <种类>]`（`src/stdio.ts`，在编译器上实现 `McpHost`）；服务端在没有给出 `ServerOptions.mcp` 时挂载它（`packages/server/src/mcp.ts` 在 `ServerHost`、控制通道与 `APPROVALS` 之上实现 `McpHost`；控制通道增加按文档筛选、位置变化的通知与不受 `allow` 策略影响的 `ask`）。验收用例在 `packages/mcp/test/mcp.test.ts`（另验证插件的 `AgentTool`、资源模板与 `?document=`、服务说明）与 `e2e/mcp.spec.ts`（`presmium://position` 的订阅另以真实的放映视图验证）；测试与端到端用例共用的 MCP 客户端与控制通道窗口在 `packages/mcp/test/client.ts`；`packages/server/test/server.test.ts` 中带令牌的 `/mcp` 请求不再是 501。新增依赖：`@modelcontextprotocol/server` 2.3.1、`minisearch` 7.2.0、`@presmium/viewer`（只用 `./domain`）、`jiti`；测试用 `@modelcontextprotocol/client` 2.3.1；没有用到设计中的 `@modelcontextprotocol/node`。与设计不同之处写在 `architecture.md` 10.2 节“MCP 的实现（WP-78）”：网页形态的放映视图盖住了工具栏中的确认入口，端到端用例在作者的文档视图窗口中允许；`search` 的分词函数是 `@presmium/web/domain` 的副本（依赖 `web` 会成环）；`presmium-mcp` 没有页面窗口，所以没有 `get_position`、`get_classroom`、`navigate` 与课堂工具；设计的资源 URI 不含文档，有多份文档时以 `?document=<目录>` 指定。SHARED 模式中 `compile: off` 时不列出 `run_code`（任一文档为 `off` 即不列出）的验收在 WP-80。先行验证的结论在 `design-v0.7.md` 第 11 节。

### WP-79 工作区服务、文档管理与共享部署（M7，P-120 至 P-122、P-115 的提交与撤销、N-09；N-08 中 `presmium serve` 的编译时执行；D13 的 compose 布局与 agent-host，D14 的拒绝用例）

**归属**：`packages/workspace/**`（新）、`packages/web/**`（`buildSite`、`devSite` 与文档列表首页）、`packages/cli/**`（`presmium serve`、`presmium agent-host`，在工作区根目录执行 `presmium build`；`package.json` 增加 `@presmium/workspace`）、`templates/workspace/**`（新）、`templates/document/**`（新）、`e2e/workspace.spec.ts`、`e2e/fixtures/workspace/**`。

**交付**：`presmium.workspace.yaml` 的读取与文档列表（只读头部）；`presmium serve`（服务端的 `serve` 模式、转发到工作区站点的开发服务器、按需编译、按文档创建插件实例、成员与角色、运营者设置 `settings` 交给服务端与编译器、`REVISIONS` 的登记；git 命令关闭钩子与 fsmonitor）；插件的来源（D14）：`presmium serve` 与 agent-host 把 WP-73a 的插件策略交给编译器（文稿的 `plugins` 与 `renderers.<id>.package` 都只加载 `settings.presmium.workspace.plugins` 中、工作区根目录安装的包），SHARED 的 serve 另交给它读取范围（真实路径在工作区之内，`presmium.files`）；`presmium serve` 中的编译时执行（`architecture.md` 10.6 节，经 WP-73b 的编译器执行选项）：`serve` 规则的环境变量（允许列表，每个工作区一个临时 `HOME`）；LOCAL 模式全部执行（有进程沙箱时经它）；SHARED 模式（D13）由 `remote` 选项交给 agent-host，`settings.presmium.exec.compile`（`approve` 时把一次编译中待执行的代码合为一个 `workspace` 范围的 `operate` 确认发给所有者，允许后重新编译并交给 agent-host 执行；一份文档至多一个待回答的编译确认，等待中、被拒绝或超时的代码不再自动请求，代码改动或编辑者在诊断上点“请求执行”（工作区的路由）时再请求，读者的访问不发出；`trusted`；`off`）；工作区的 `ServerHost` 以同样的执行选项运行代码块与构建（MCP 的 `run_code`、`build`；SHARED 中构建也交给 agent-host）；SHARED 模式中工作区站点的开发服务器（两个视图）在 agent-host 中运行（`architecture.md` 10.2、10.8 节：serve 编译后经 `PUT /v1/sites/<id>/documents/<文档>` 送去 IR，在转发某文档的第一个请求之前先编译它，把浏览器的其余请求与 HMR 的 WebSocket 转发到 agent-host 中的站点；生成的站点项目与 Vite 的缓存在 sandbox 容器自己的目录中），SHARED 模式中工作区根目录本身是文档（单份文稿的仓库）时 serve 拒绝启动；`presmium agent-host`（`architecture.md` 10.8 节：HTTP/SSE 接口、令牌文件与降权、加载运营者插件、执行、构建、工作区站点、agent 会话与 deltabox 审阅的转发），以及 serve 中的客户端（`AGENT_RUNTIME`、`CHANGE_REVIEW` 作为宿主保留的令牌登记，`remote` 选项），serve 为每次运行、构建与 agent 会话向 gateway 签发并在结束时作废限定令牌；读者的学生视图（读者的工作区站点在第一位读者访问时启动，服务端按成员转发；`ServerHost` 的 `student` 视图；视图怎样编译只由 `packages/workspace/src/node/audience.ts` 决定，本工作包中 `student` 与 `full` 相同，WP-87 接入受众筛选）；文档操作接口（`/__presmium/presmium.workspace/documents`：新建、重命名并改写其他文档中的相对链接、复制、删除），各形成一个提交；修改历史与撤销接口（按尾注筛选，`git revert`，冲突时报告文件）；工作区的浏览器插件：`EDIT_MODE`、工具栏的编辑入口、首页的文档操作、修改历史面板；新建文档的表单在 `AGENT.available('chat')` 时提供“由 agent 起草”与要求的输入，新建并提交之后经 `AGENT` 提交一轮 `chat` 任务（上下文为新文档的目录）并打开新文档，没有助手时不显示这一项（P-121；助手在 WP-80 之后才有，端到端的验收在 WP-81）；`presmium build` 在工作区根目录构建整个站点；部署模板 `templates/workspace/compose/`（D13 的布局，`architecture.md` 10.5 节：oauth2-proxy（站点与所有者控制台两个主机名）、`serve`、`gateway`、`sandbox` 三个容器与课堂服务，uid 各不相同，serve 与 sandbox 以 root 启动、读取只有 root 可读的令牌文件后降权，网络 `public`、`edge`（内部）、`agents`（内部）、`egress`，数据卷 `workspace` 的权限，同一个以 Ubuntu 24.04 或 Debian trixie 为基础的镜像，可选的 `compose.deltabox.yaml`）与 `templates/workspace/kubernetes/README.md`（按同一布局的参考）；新建文档的模板。

**验收**：

- `packages/workspace/test/documents.test.ts`（临时目录中的真实 git 仓库）：经接口新建（从模板）、重命名（另一份文档中指向它的链接随之改写）、复制、删除，各形成一个带 `Presmium-Origin: document` 尾注的提交；撤销重命名恢复原目录；与之后的提交冲突的撤销报告冲突的文件，工作树不变；仓库中放一个会写文件的 `pre-commit` 钩子，提交之后那个文件不存在（钩子没有运行）。
- `packages/workspace/test/site.test.ts`：在工作区根目录 `presmium build`，首页列出全部文档并链接到 `/<文档目录>/`，每份文档可以独立阅读与搜索；在文档目录中执行只构建这一份。
- `packages/cli/test/serve.test.ts`：`presmium serve` 一条命令启动并打印地址；以非本机地址启动而没有配置登录代理时拒绝启动；带共享密钥与编辑者身份的请求可以新建文档，读者得到 403；SHARED 模式中对单份文稿的仓库启动时拒绝并说明原因。以下 SHARED 模式的用例在同一台机器上另起 `presmium gateway` 与 `presmium agent-host`（`architecture.md` 第 7 节）。
- 同一文件（D14 的拒绝用例）：文稿的 `plugins` 写一个相对路径的测试插件与一个只装在文稿目录 `node_modules` 中的测试插件，`renderers.web.package` 写一个相对路径的测试渲染端（三者的 Node 入口在加载时都会写一个标记文件）：编辑者打开文档时编译给出三条错误级诊断 `presmium.plugins`，标记文件不存在；同一个插件包装在工作区根目录并列在 `settings.presmium.workspace.plugins` 中时被加载。
- 同一文件（SHARED，serve 不运行文稿的代码，`design-v0.7.md` 第 36 条）：文稿的组件 `components/Probe.vue` 引用 `./probe.data.ts`，它的 `load()` 把自己的进程号、沿父进程链的命令行，以及这条链上每个进程的 `/proc/<pid>/environ` 中是否出现 `PRESMIUM_PROXY_SECRET` 与 gateway 令牌的值写进一个标记文件：编辑者经 serve 打开文档后标记文件存在，父进程链中有 agent-host 而没有 serve，两个值都没有出现；serve 进程的子孙中没有 VitePress 进程。文稿目录中的 `secret.txt` 是指向工作区之外一个含哨兵文字的文件的符号链接，正文以 `{literalinclude}` 引用它：编译给出错误级诊断 `presmium.files`，哨兵文字不出现在 IR、页面与诊断中。
- 同一文件（N-08，SHARED，默认 `compile: approve`）：文档中写入一个没有录制、打印全部环境变量与父进程命令行的代码块，编辑者打开文档时页面显示降级内容而不执行，确认只出现在所有者控制台的控制通道上；所有者拒绝后，编辑者与读者再打开文档都不再发出确认；编辑者经“请求执行”再次请求，所有者允许后重新编译，代码在 agent-host 中执行（录制中的父进程是 agent-host，serve 进程没有启动 Python 子进程），录制中只有允许列表中的变量（`HOME` 是临时目录），没有 `PRESMIUM_PROXY_SECRET` 与 `PRESMIUM_AGENT_HOST_TOKEN`。
- 同一文件：`compile: off` 时不执行也不请求确认，显示 `:recorded:` 的录制输出；`compile: trusted` 时不经确认直接在 agent-host 中执行；LOCAL 模式（不配置登录）时不经确认在 serve 进程中执行。
- `e2e/workspace.spec.ts`（SHARED，另起 `presmium gateway` 与 `presmium agent-host`）：浏览器中（编辑者身份由测试设置的代理请求头给出）新建、重命名、复制、删除文档，修改历史中出现四个提交；读者看不到编辑入口；没有助手时新建表单中没有“由 agent 起草”。
- 同一文件：进入编辑模式后，测试插件登记的没有子内容的角色显示标记 `〔<名> <value>〕`，离开编辑模式后不显示（`ir.md` 2.8 节，IR 运行时的部分由 WP-73a 实现）。
- `packages/workspace/test/deploy.test.ts`（需要 Docker，没有时跳过并说明）：compose 模板启动后，未登录的请求被 oauth2-proxy 引向登录（站点与控制台两个主机名都是），`serve`、`gateway`、`sandbox` 的端口都没有对外发布；三个容器中进程的 uid 各不相同；`serve` 与 `sandbox` 容器的环境中没有 `.env` 中的任何第三方凭据，`gateway` 中有；serve 进程的 `/proc/<pid>/environ` 中没有它的三个令牌；在 `serve` 中连接外网失败；在 `sandbox` 中连接外网与 `serve` 都失败，连接 `gateway` 成功；`sandbox` 中写 `.git/config` 与 `presmium.workspace.yaml` 得到权限错误，写文档目录成功；`sandbox` 中读 agent-host 进程的 `/proc/<pid>/environ` 失败。

**实际交付**：`@presmium/workspace`（`packages/workspace`）：工作区配置与文档列表（`src/node/config.ts`，只读头部）；`REVISIONS`（`revisions.ts`：simple-git，钩子与 fsmonitor 关闭，尾注 `Presmium-Origin`、`Presmium-Task`、`Presmium-Revert` 与 `Co-authored-by`）；文档操作（`documents.ts`：从 `templates/document/<名>/` 新建、重命名并改写其他文档 Markdown 中的相对链接与 `{include}` 等指令的路径、复制、删除，各一个提交）；工作区的路由（`routes.ts`）；`presmium serve`（`serve.ts`：按需编译与监听 `session.ts`、插件策略与 `renderers.<id>.package` 的拒绝、SHARED 的读取范围与 `remote` 执行、按 `compile` 的编译确认 `execution.ts`、LOCAL 的站点在本进程中、SHARED 的站点在 agent-host 中并由 serve 按视图的本机路由先编译再转发 `remote-site.ts`）；`presmium agent-host`（`agent-host.ts`）与 serve 中的客户端（`agent-client.ts`：`remote`、`AGENT_RUNTIME`、`CHANGE_REVIEW`、为每次运行与构建签发并作废 gateway 的限定令牌）；`audience.ts`（两个视图相同，WP-87 接入）；浏览器插件（`src/client/`：`EDIT_MODE`、工具栏的编辑、首页的文档管理、修改历史、“请求执行”、有助手时“由 agent 起草”）；工作区的构建（`build.ts`）。网页渲染端的 `buildSite`、`devSite` 与首页（`packages/web/src/node/sites.ts`、`src/client/home.ts`）。CLI：`presmium serve`、`presmium agent-host`、在工作区根目录的 `presmium build`，`presmium gateway` 增加 `--hostname`、`--user`。模板：`templates/workspace/compose/`、`templates/workspace/kubernetes/README.md`、`templates/workspace/presmium.workspace.yaml`、`templates/document/default/`。验收用例在 `packages/workspace/test/documents.test.ts`、`site.test.ts`、`deploy.test.ts`，`packages/cli/test/serve.test.ts`，`e2e/workspace.spec.ts`。与设计不同或设计没有写明之处写在 `architecture.md` 10.2、10.5、10.8 节标明 WP-79 的段落中，先行验证的结论在 `design-v0.7.md` 第 11 节；其中两处偏离验收的字面：编译器不展开 `{literalinclude}`（它什么也不读），符号链接的拒绝以 `{include}` 验证；以 `remote` 执行时编译器仍在 serve 中探测执行器（Python 执行器启动一次 `python3 -c 'import sys…'`），用例检查的是 serve 从未运行文稿的代码（运行器）。

### WP-79e I 波次合并后集成（验收者）

WP-73a 至 WP-79 合并后（main 90c054d：`pnpm test` 161/161，Playwright 218 通过、1 跳过）各工作包验证遗留的问题，分两组并行；与 WP-90 同时进行。逐条的出处见各工作包的验证报告。

**WP-79e1 核心**（拥有 `packages/server`、`packages/mcp`、`packages/kernel`（除 `contracts*` 外）、`packages/viewer`、`packages/web`、`packages/host`、`packages/workspace` 及其 e2e 与夹具）：

1. SHARED 模式下经 gateway 访问 `/mcp`：serve 对 `/mcp` 先以 MCP 令牌认证，不再要求登录代理的身份；真实的 gateway 加 serve 用例。
2. serve 代理到 gateway 的请求（`auth: proxy` 的 Jupyter）去掉浏览器的 `Origin`，gateway 不再拒绝；用例。
3. 放映与演讲者视图中可以直接确认（批准入口在覆盖视图的控制条中）；`e2e/mcp.spec.ts` 只开放映视图即可允许 `navigate`。
4. `@presmium/mcp` 不再依赖 `@presmium/viewer`：`chapters`、`blockText`、`blockState`、`narrationAt` 与分词移入 `@presmium/kernel` 的纯函数，viewer、web、mcp 都从内核引用；恢复 architecture.md 第 3 节的依赖表。
5. MCP 的细节：说明文字按模式；多文档时资源可以用 `?document=` 指定文档，多余的查询参数不影响匹配；作废令牌时关闭其订阅流；`presmium-mcp` 与 CLI 一样带上随 CLI 发布的插件。
6. 网页演讲者视图的备注与预告包括移入 `PmPredict` 的讲解。
7. 卡片的 `:link:` 指向本地文件时在网页中发布并改写；没有目标的 `{button}` 在网页中显示为按钮样式。
8. `{literalinclude}` 也拒绝指向工作区之外的符号链接；编辑模式中 agent 起草的新文档在提交后再跳转。

**WP-79e2 插件**（拥有 `packages/addon-exec*`、`packages/addon-lecture`、`packages/addon-classroom`、`packages/addon-content`、`packages/addon-publish`、`packages/render-slides`、`templates/`，以及为第 3 项在 `packages/kernel/src/contracts*` 的 `RunContext` 增加可选 `lang` 与 `packages/compiler` 传入它（验收者批准的增加）及这些包的 e2e 与夹具）：

1. 幻灯片中 C、C++、Ruby、SQL 可以现场运行（经执行服务）；幻灯片的离线预缓存包括 `.gz` 运行时文件。
2. 发布的 WASI 运行时附带许可证说明（`<base>wasi/LICENSES`）。
3. WebGPU：Python 桥执行与 JS 相同的规模限制；去掉未使用的 `vue` 依赖；编译时录制的文字按文稿语言（`RunContext.lang`）；用到 jax-js 时幻灯片渲染端自动设置 `monacoTypesSource: none`。
4. Jupyter：内核关闭后删除 `presmium-runs/<id>/`；`e2e/exec-remote.spec.ts` 去掉重试，改为预先打包依赖等确定的等待；Kubernetes 说明中 gVisor 只用于 CPU 配置。
5. 讲授：重录一节后漂移检查仍按每节的 IR 哈希工作；`point` 的时间是路径开始的时刻；回放可以按步骤跳转（P-131）；先请求屏幕共享再请求麦克风与摄像头；补上重录一节、激光笔与荧光笔、提示、超过 5 秒的分块上传与 `SilentClock` 的用例。
6. 先预测再揭示：幻灯片中提示在表单之前；静态导出（PDF、PNG）显示揭示的内容；`PmPredict` 的降级在编译时执行之后生成（包含揭示内容中的运行输出）。
7. 幻灯片渲染端显式传入卡片的形式；没有目标的 `{button}` 在幻灯片中显示为按钮样式。

**验收**：各项有对应用例；`pnpm test`、`pnpm demo:check`、`pnpm demo:build` 与各自的 spec、`e2e/smoke.spec.ts` 通过；合并后验收者运行完整的 Playwright 套件。

**实际交付（WP-79e1）**：1. 服务端（`packages/server/src/server.ts`）：SHARED 模式中站点主机名上的 `/mcp` 在身份检查之前处理，只以 MCP 令牌认证；所有者控制台上仍没有 `/mcp`。2. 插件代理的目标与 `ServerContext.gateway` 同源时，HTTP 与 WebSocket 都去掉 `Origin`（与登录代理的密钥一起）。两项以真实的 `presmium gateway` 加 serve 验证：`packages/server/test/shared-gateway.test.ts`（MCP SDK 的客户端经 gateway 列出章节；浏览器式的 POST 带 `Origin` 经插件代理到达 gateway 的路由）；测试的 serve 宿主（`test/fixtures/serve-host.ts`）为此有只读文稿的 `ServerHost`，测试插件增加签发 MCP 令牌的路由与到 gateway 的代理，服务端增加开发依赖 `@modelcontextprotocol/client` 2.3.1（测试中的客户端）。3. `@presmium/host` 的 `PmApprovals` 增加 `placement`，IR 运行时的放映视图（底部控制条，向上打开）与演讲者视图的控制条中有确认入口；`e2e/mcp.spec.ts` 只开放映视图，在它的控制条中允许 `navigate`。4. `@presmium/kernel` 的 `src/reading.ts`（导出 `./reading`）：`chapters`、`isChapterTitle`、`blockVisible`、`blockState`、`narrationAt`、`sectionNarration`、`mdastText`、`blockText`、`tokenize`；viewer、web（页面与生成的 VitePress 配置）与 mcp 从内核引用，`@presmium/mcp` 不再依赖 `@presmium/viewer`，`architecture.md` 第 3 节的依赖表恢复（另写明浏览器端的包不在服务端包的依赖中）。5. MCP：服务说明按进程（`McpHost.process`：`presmium dev`、`presmium serve`、`presmium-mcp`；SHARED 时提到所有者控制台）；文档资源的模板以 `DocumentTemplate`（SDK `UriTemplate` 的子类）匹配，只看路径与 `document`；`revoke` 结束该令牌打开着的事件流；`presmium-mcp` 的 `bundled` 是 CLI 的包目录（文稿项目中的 `@presmium/cli`，否则随之安装的 CLI），与 CLI 一样加载随 CLI 安装的包。用例在 `packages/mcp/test/mcp.test.ts`（说明、带多余参数的资源、作废后订阅以 `remote` 结束、stdio 加载文稿项目中 CLI 的 `addon-deltabox`（替身，`test/fixtures/bundled`））。6. 网页演讲者视图的备注与预告用 `sectionNarration`，包括移入 `PmPredict` 的讲解：`e2e/viewer.spec.ts`（夹具 `e2e/fixtures/viewer/predict`）。7. 网页渲染端发布卡片 `:link:` 指向的本地文件（`publish.ts` 的 `LINKED` 加 `card`）；没有目标的 `{button}`（`span`）在网页中有 `pm-button` 的样式（悬停样式只给链接）：`e2e/web.spec.ts`（夹具 `e2e/fixtures/web/links`）。8. 编译器展开 `{literalinclude}`（`packages/compiler/src/source.ts`：经读取范围，按 MyST 的 `includeDirectiveTransform` 截取，成为代码块；`blocks.ts` 把它作为代码指令；`directives.ts` 给语言服务列出它）；工作区的新建表单在起草任务以 `done` 结束之后才打开新文档，`review` 事件在表单中接受或拒绝（`packages/workspace/src/client/panels.ts`）。两项的用例在 `e2e/workspace.spec.ts`：SHARED 中 `{literalinclude}` 显示工作区内的文件、对指向工作区之外的符号链接给出 `presmium.files` 且哨兵不出现在页面与 IR 中；以 `AGENT` 的替身（拦截工作区浏览器插件的模块并追加一个提供 `presmium.agent` 的插件）起草，审阅接受之前页面留在首页，`done` 之后打开新文档。第 8 项的编译器文件不在本组的归属中（编译器没有分给本组），改动只在 `source.ts`、`blocks.ts`、`directives.ts`，与 WP-79e2 在编译器中传入 `RunContext.lang` 的改动不重叠。
**WP-79e2 实际交付**（契约：`RunContext.lang?: string`，编译器传入文稿的语言）：

1. 幻灯片渲染端为带 `live` 或 `both` 的 C、C++、Ruby、SQL 代码块写 `{monaco-run}`（别名写成 code runner 的名字），执行插件的 `setup/code-runners.ts` 为这些语言登记同一个经 `executor` 服务的 code runner；发布插件的离线预缓存加上 `.gz`。用例：`e2e/exec-wasi.spec.ts`（测试文稿另构建幻灯片，C 程序在 Monaco Runner 中现场运行）、`packages/addon-publish/test/offline.test.ts`（现场 Ruby 代码的运行时 `wasi/ruby-3.2.0.tar.gz` 在 Service Worker 的预缓存中）。
2. `addon-exec-wasi` 的 `LICENSES`（Runno 的 MIT，LLVM 8 的 NCSA，Apache 2.0 加 LLVM 例外，Ruby 的 BSD-2，SQLite 的公有领域声明）随运行时发布为 `<base>wasi/LICENSES`，开发服务器同样提供；`architecture.md` 依赖表更正了 clang 8.0.1 的许可证。用例：`e2e/exec-wasi.spec.ts`（两种形态）、`offline.test.ts`（幻灯片）。
3. `presmium_gpu.py` 在请求适配器之前检查规模限制（128 MiB、`repeat` 1000、`dispatch`、缓冲区的形状），`requestDevice` 失败为 `GPUUnavailable`；`addon-exec-webgpu` 去掉 `vue`；WebGPU 的编译时录制按 `RunContext.lang`；幻灯片渲染端在现场的 JavaScript、TypeScript 代码导入了从生成文稿的目录找不到的包时写 `monacoTypesSource: none`。用例：`e2e/exec-webgpu.spec.ts`（Python 超限的两种情况；录制的输出是中文；测试文稿去掉了 `monacoTypesSource`）、`packages/addon-exec-webgpu/test/record.test.ts`。
4. Jupyter 的内核关闭后经 Contents API 删除 `presmium-runs/<id>/`（先删其中的文件）；插件的 Vite 插件在开发服务器启动时预打包 `@jupyterlab/services` 与 xterm，执行插件预打包 `diff`，`e2e/exec-remote.spec.ts` 去掉 `toPass` 的重试（实测：不预打包时页面在加载后因 `diff`、xterm 与 Jupyter 客户端重新优化而重新加载）；Kubernetes 说明中 gVisor 只在 CPU 配置的 `kubespawner_override.extra_pod_config` 中。用例：`packages/addon-exec-jupyter/test/remote.test.ts`（构建之后 `presmium-runs` 为空）、`e2e/exec-remote.spec.ts`；Kubernetes 说明不经测试（同 WP-76）。两者的端口与 compose 项目名改为本工作包的。
5. 讲授：讲授轨增加 `ir.sections`（每节的 IR 哈希），检查按每节比较，重录一节只换那一节的哈希；`point` 的时刻由录制面板给出路径开始的页面时间；章节面板列出各步并可跳转（`stepStops`）；先请求屏幕共享再请求麦克风与摄像头。用例在 `e2e/lecture.spec.ts`：`point` 的时刻、激光笔与荧光笔（`ink`）、`h`（`hint`）与录制中每 5 秒上传、重录一节（媒体替换、其他各节平移，`presmium check` 仍报告另一节的改动）、按步跳转、没有音频的讲授（`SilentClock`）、屏幕在麦克风与摄像头之前请求并录为 `screen` 视频（页面记下请求的顺序；无头 Chromium 不共享屏幕，用例以假摄像头代替屏幕）。测试文稿的开发服务器端口改为本工作包的。
6. 幻灯片渲染端给组件子块的步骤包装元素写块 ID 的 `key`，`PmPredict` 因此在幻灯片中把补充说明放在表单之前；预测的降级中折叠的揭示内容标为 `data-static="open"`，幻灯片的 PDF、PNG 导出中展开（测验答案仍收起）；新的编译步骤 `classroom-predict-fallbacks`（`after: 'execute'`）重写预测的降级，揭示的代码带录制的输出。用例：`e2e/predict.spec.ts`（测试文稿另构建幻灯片）、`packages/render-slides/test/slides.test.ts` 的 PDF 导出（揭示内容与其中代码的输出）、`packages/addon-classroom/test/predict.test.ts`。
7. 幻灯片渲染端显式传入 `cards: 'element'`；没有目标的 `{button}` 写成 `pm-button pm-button--text`，样式同带链接的按钮。用例：`packages/render-slides/test/slides.test.ts`（生成的文稿与浏览器中的边框）；卡片仍由 `e2e/content.spec.ts` 验证。

### WP-90 修改审阅与进程沙箱：deltabox（D12、D13）

**归属**：`packages/addon-deltabox/**`（新）、`packages/cli/package.json`（只增加对本包的依赖；WP-79 之后，`packages/cli/` 的其余部分在本波次属于 WP-87）。

**先行验证**：Linux 上已由设计阶段的实测完成（`design-v0.7.md` 第 11 节“deltabox”）。开始时在目标机器上确认 Node 绑定（`loadNative()`）的版本、在只带 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR` 的辅助进程中的可用性与可用性的判断，结论写进交付报告。macOS 没有实测：在 macOS 主机上验证 cbcow-private 是否记录不在沙箱中的写入者对私有 `LIVE` 树的写入，以及进程沙箱的探测（同 `sandbox.test.ts`）；没有 macOS 主机时由验收者补做，通过之前插件在 macOS 上不登记服务（`design-v0.7.md` 第 43 条）。

**交付**：运营者插件 `@presmium/slidev-addon-deltabox`（插件 ID `presmium.deltabox`，只有 Node 端，`operator: true`），精确依赖 `deltabox-lite` 0.1.1；`@presmium/cli` 的 `package.json` 依赖本包，WP-73a 的编译器因此在所有命令中默认加载它（不必列在工作区配置中，`architecture.md` 10.6 节）。deltabox 的 Node 绑定只在插件启动的辅助进程（`src/node/helper.ts`）中加载：它的环境只有 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR`，审阅与进程沙箱的调用经它的标准输入输出（JSON 行）转发，命令行只用于诊断。运营者设置 `settings.presmium.deltabox`：`review`、`sandbox`（分别启用两项服务，默认都启用）、`read`（进程沙箱中另外只读的路径）与 `stateDir`（会话状态的目录，默认在工作区之外、与工作区同一文件系统，便于 reflink）。可用性：Linux（x64、arm64），glibc 2.39 以上，绑定能加载，能以 `--require-fs-mode` 启动 cbcow-through（FUSE 与 Landlock），且 `degraded_protections` 为空；macOS 在先行验证通过之前不登记；不满足时不登记对应的服务，启动日志与构建报告说明原因。`CHANGE_REVIEW`（`architecture.md` 10.7 节）：每个修改任务一个文档目录上的 cbcow-through 会话（不用 copy-private），`root` 为会话的视图，打开会话之前把文档目录复制（reflink）为任务开始时的快照，每个 `step` 一个检查点并取 `diff --from` 上一个（至多 100 个，之后并入最后一步），`accept(reject)` 先 `commit` 再从快照恢复被拒绝的文件，`rollback` 为 `abort`，同一文档目录同一时间一个会话，会话的项目中不设拒绝规则，启动时清理崩溃留下的会话（杀掉 helper 再 `abort`）。`PROCESS_SANDBOX`（`architecture.md` 10.6 节）：每次编译一个预热的 cbcow-through 会话，项目是临时的运行目录，隔离为 sandlock，网络 `deny_all`，输入写进运行目录、结束后读回 `collect` 的文件、运行之间 `abort`，`read` 中的路径（文稿目录、解释器的前缀、`settings.presmium.deltabox.read`）只读，超时与中止时结束运行；构建报告写明隔离方式。中英文的诊断文字。

**验收**（主机不满足条件时跳过并说明原因与启用方法；验收者在满足条件的 Linux 主机上至少运行一次）：

- `packages/addon-deltabox/test/sandbox.test.ts`（D13）：测试文稿没有工作区配置（本插件随 CLI 默认加载），构建进程的环境中有 `PRESMIUM_TEST_SECRET`。`presmium build` 录制的 Python 代码块输出表明：沿父进程链读到的 `/proc/<pid>/environ` 中都没有这个值（读不到或没有）；连接测试在 `127.0.0.1` 上起的监听器失败，监听器没有收到连接；写文稿目录失败，写运行目录成功；Docker 的套接字不可连接。构建报告写明经 deltabox 运行。工作区配置写 `settings.presmium.deltabox.sandbox: false` 时同一构建不经沙箱，报告写明原因。
- `packages/addon-deltabox/test/review.test.ts`（D12）：测试文稿中的测试插件路由在 `presmium dev` 中取得 `CHANGE_REVIEW` 并为文稿目录打开审阅；测试以一个不在沙箱中的普通进程（同 agent 的写入方式）经 `root` 改动 `lecture.md` 并新建 `notes.md`：`step` 返回这两个改动，`diff` 列出它们与类型；`accept(['lecture.md'])` 之后 `lecture.md` 恢复为快照中的内容，`notes.md` 留下，返回值只有 `notes.md`；另一次审阅 `rollback` 之后两者都回到开始时的状态（新建的文件被删除）；同一文稿目录再次 `open` 被拒绝；经视图的写入在 `accept` 之前已出现在文稿目录中，`presmium dev` 重新编译。
- 同一文件：打开审阅并写入之后结束 `presmium dev` 进程（`SIGKILL`），再次启动后残留的会话被清理，文稿目录回到快照的内容。

**实际交付**：`@presmium/slidev-addon-deltabox`（`packages/addon-deltabox/src/node/`）：`presmium.ts`（插件与 `settings.presmium.deltabox` 的 `review`、`sandbox`、`read`、`stateDir`，登记两项服务，启动日志与构建报告中的原因：信息级诊断 `presmium.deltabox`），`client.ts`（以 `node --import <jiti/register>` 在自己的进程组中启动辅助进程，JSON 行的请求与取消，可用性的探测按开机缓存，`presmium` 退出前等辅助进程收尾），`helper.ts`（辅助进程：探测、每组只读路径至多 4 个预热的运行会话（空闲 60 秒停止）、审阅（差异中去掉目录）、运行结束与超时、中止时结束命令留下的进程（含 `setsid` 分离的）、崩溃留下的会话的恢复与停止后的清理），`sandbox.ts`、`review.ts`、`records.ts`、`messages.ts`（中英文）。`@presmium/cli` 的 `package.json` 依赖本包。新增依赖：`deltabox-lite` 0.1.1（精确固定，带各平台的包）、`jiti`（启动 TypeScript 写的辅助进程）。验收用例在 `packages/addon-deltabox/test/sandbox.test.ts`（另验证 `presmium dev` 运行的代码读不到这个 LOCAL 服务进程的 `/proc/<pid>/environ`，按验收者的要求；以及代码以 `setsid` 分离的子进程在超时或运行结束时被结束，不拖住构建）与 `review.test.ts`（测试插件在 `test/fixtures/review-plugin/`；另验证差异与 `accept` 只有文件，拒绝新目录中的全部文件后不留下目录；崩溃的用例结束 `presmium dev` 的整个进程树，含辅助进程与 deltabox 的 helper），主机不满足条件时跳过并说明原因与启用方法。与设计不同或设计没有写明之处写在 `architecture.md` 10.6、10.7 节标明 WP-90 的段落，另见 9.4、9.5 节；先行验证的结论在 `design-v0.7.md` 第 11 节，macOS 没有主机，没有验证，插件在 macOS 上不登记（WP-89 补做）。进程沙箱默认启用之后，三个不在本工作包归属中的测试文件里按没有沙箱写的断言要随之更新：`packages/addon-exec/test/session.test.ts` 与 `packages/addon-exec-wasi/test/compile.test.ts` 的执行一行（多出 `, isolated by deltabox cbcow-through`），`packages/cli/test/serve.test.ts` 中执行代码的父进程与 `HOME`（由验收者在合并时处理）。

### WP-80 agent 运行时接入与学习者问答（M7，P-111、P-112；D11、D15，D13 中 agent 的部分）

**归属**：`packages/addon-assistant/**`（新）、`packages/addon-classroom/**`（课堂中的 AI 回答）、`e2e/assistant.spec.ts`、`e2e/fixtures/assistant/**`。

**先行验证**：DeepSeek Harness 配置项的 ID（`--dump-default-config`），三份模板能关闭的工具（shell、命令执行、联网）；在 `workspace-write` 加 `ask` 下调用 MCP 工具前是否询问；`DEEPSEEK_BASE_URL` 指向 gateway 的模型代理时的请求（Messages 兼容）；Node 22.19 的要求（DeepSeek Harness 成为依赖之后，在交付报告中提出提高根目录 `engines`）。

**交付**：DeepSeek Harness 作为本包的依赖（精确固定的版本，D11）；`AGENT_RUNTIME`：ACP 客户端（`@agentclientprotocol/sdk`），运营者配置了模型访问（`DEEPSEEK_API_KEY`，或 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER` 三者）时以子进程启动随包的 DeepSeek Harness（从本包的依赖解析，不需要另外安装；以 `DSH_TELEMETRY_MODE=DISABLED` 启动），`PRESMIUM_AGENT_COMMAND`（`tutor` 为 `PRESMIUM_AGENT_TUTOR_COMMAND`）或运营者设置 `settings.presmium.assistant.command`、`tutor` 只在 LOCAL 模式中替换运行时（这时服务提供方取 `settings.presmium.assistant.provider` 或 `PRESMIUM_AGENT_PROVIDER`）；传入的环境去掉全部 `PRESMIUM_` 开头的变量与 `DEEPSEEK_BASE_URL`，LOCAL 中再加上模型访问（`architecture.md` 4.8 节：`DEEPSEEK_API_KEY` 原样传入；`PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 改名为 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY`；替换的运行时用它自己在环境中的凭据）；`provider` 来自模型访问（`DEEPSEEK_API_KEY` 为 `DeepSeek`；SHARED 中取自 gateway），不退回 agent 报告的名字；没有模型访问也没有带服务提供方的替换命令时不登记 `AGENT_RUNTIME`，`AGENT.available()` 为 false，启动日志说明缺少的设置；`runtime` 取 ACP `initialize` 的 `agentInfo`（名字与版本）；每个会话 `session/new` 时 `cwd` 为 `AgentSessionOptions.cwd`（问答为文档目录，修改任务为审阅的 `root`，WP-81），`mcpServers` 为服务端路由经 `ctx.service(MCP_ENDPOINT).issue(member, mode)` 取得的 `AgentSessionOptions.mcp`，会话关闭时 `revoke`；`session/request_permission` 按 `ApprovalScope` 分类后交给 `APPROVALS`（`architecture.md` 4.8 节：文档目录中的写入为 `content`，shell、网络与文档目录之外为 `workspace`，只有所有者能允许；运营者目录（`NodeServiceContext.operatorDir`）一律拒绝；`question` 任务一律拒绝）；ACP 更新映射为 `AgentEvent`（工具调用的 `call` 与 `status`）。SHARED 模式（D13）：本插件的 `gateway()` 贡献模型代理 `model/…`（Messages 兼容，校验限定令牌后换上运营者的模型密钥，只发往运营者的模型地址）与 `info`（服务提供方）；在 agent-host 中为每个会话启动一个 DeepSeek Harness 进程，环境中只有 `DEEPSEEK_BASE_URL`（gateway 的模型代理）、会话令牌 `DEEPSEEK_API_KEY`（`AgentSessionOptions.model`）、`DSH_TELEMETRY_MODE=DISABLED` 与清理过的基本变量。服务端路由（`tasks`、`tasks/<id>/events`、`tasks/<id>/cancel`）；浏览器端的 `AGENT`（含 `provider()` 与 `runtime()`）；网页的阅读侧栏与演讲者面板中的问答，引用位置可以点击跳转，面板写明模型的服务提供方，已知时另写明运行时（N-08）；`tutor` 模式；DeepSeek Harness 的三份配置模板（D15）：`dsh/presmium.cordis.yml`（LOCAL 的作者：shell、`workspace-write`、询问）、`dsh/presmium-shared.cordis.yml`（SHARED 的作者：关闭 shell、命令执行与联网工具，只有文件工具与 MCP）、`dsh/presmium-tutor.cordis.yml`（只读），都关闭会话日志上传与遥测；确定性的测试 agent（`test/fixtures/scripted-agent.mjs`）；课堂插件的问题列表中“AI 回答”（按钮写明服务提供方，主讲确认后把回答发回课堂）。

**验收**：

- `packages/addon-assistant/test/acp.test.ts`：按 `PRESMIUM_AGENT_COMMAND` 启动测试 agent：`session/new` 的 `mcpServers` 中是本进程的 `/mcp` 与经 `MCP_ENDPOINT` 签发的令牌，测试 agent 用它列出工具成功，任务结束后同一令牌得到 401；agent 调用 `get_section` 后给出带引用位置的回答；agent 的权限请求被拒绝时它收到拒绝；取消进行中的任务时测试 agent 收到 `session/cancel`，页面收到结束的事件；父进程中设置的 `PRESMIUM_PROXY_SECRET`、语音凭据不出现在 agent 的环境变量中；既没有模型访问也没有替换命令时 `AGENT.available('question')` 为 false，没有进程被启动；设置了替换命令而没有 `provider` 时同样不可用，没有进程被启动。
- `packages/addon-assistant/test/dsh.test.ts`（D11、D15）：对随包的固定版本运行 `--dump-config`：三份模板都关闭会话日志上传与遥测；`presmium-tutor` 没有 shell、网络与写文件工具，`presmium-shared` 没有 shell、命令执行与联网工具，`presmium` 有 shell、沙箱为 `workspace-write`、权限策略为询问。只设置假的 `DEEPSEEK_API_KEY`、不设置任何命令时，`presmium dev` 的助手启动随包的 DeepSeek Harness：服务提供方为 `DeepSeek`，`initialize` 的 `agentInfo` 成为运行时的名字，`session/new` 成功，没有向模型发出请求。改为设置 `PRESMIUM_MODEL_URL`（测试起的 Messages 兼容假模型服务）、`PRESMIUM_MODEL_KEY` 与 `PRESMIUM_MODEL_PROVIDER` 时（LOCAL），DeepSeek Harness 进程的环境（测试读它的 `/proc/<pid>/environ`）中 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY` 是这两个值，没有任何 `PRESMIUM_` 开头的变量，一次提问之后假模型服务收到的密钥是 `PRESMIUM_MODEL_KEY`。真实模型的问答用例需要 `DEEPSEEK_API_KEY`，默认跳过。
- `packages/addon-assistant/test/shared.test.ts`（D13，同一台机器上的 SHARED 进程：`presmium serve` 带共享密钥、`presmium gateway`、`presmium agent-host`）：gateway 的环境中有 `PRESMIUM_MODEL_URL`（测试起的 Messages 兼容服务，按脚本给出回答）、`PRESMIUM_MODEL_KEY` 与 `PRESMIUM_MODEL_PROVIDER=Test Provider`，serve 与 agent-host 的环境中没有：读者提问之前面板已写明 `Test Provider`；回答到达读者；模型服务收到的密钥是 `PRESMIUM_MODEL_KEY`，DeepSeek Harness 进程的环境中只有会话令牌（测试读它的 `/proc/<pid>/environ`），没有 `PRESMIUM_MODEL_KEY`；会话结束后用这个会话令牌请求 gateway 的模型代理得到 401。
- 同一文件（D1、D2，原在 WP-78；默认 `compile: approve`）：测试插件的路由为编辑者经 `MCP_ENDPOINT.issue(member, 'author')` 取得令牌，MCP SDK 的客户端以它经 gateway 的 `/mcp` 调用 `run_code`：确认只出现在所有者控制台的控制通道上，编辑者与所有者在站点上的控制通道上都没有，编辑者回答它得到 403；所有者经控制台允许后得到输出（代码在 agent-host 中执行）；设置为 `off` 时工具列表中没有 `run_code`。
- `e2e/assistant.spec.ts`：读者在网页中选中一段代码提问，提问面板在提问之前就写明运营者设置的服务提供方（测试设置为 `Test Provider`），回答之后另写明运行时（测试 agent 报告的名字），回答中的引用位置可以点击，点击后跳到对应章节；`tutor` 模式中测试 agent 试图写文件被拒绝，文件不变；课堂中学习者的问题出现在主讲的面板中，主讲点“AI 回答”后学习者看到回答。

**实际交付**：`@presmium/slidev-addon-assistant`（插件 ID `presmium.assistant`，运营者插件 `operator: true`），精确依赖 `@deepseek-ai/dsh` 0.2.1-alpha.4（与本地文档同一版本）与 `@agentclientprotocol/sdk` 1.8.0；测试另用 `@modelcontextprotocol/client` 2.3.1，类型用 `@presmium/viewer`。`src/domain/`：运行时的选择与模型访问（`config.ts`）、提示（`prompt.ts`）、引用（`citations.ts`）、路由的请求体（`api.ts`）、中英文（`messages.ts`）。`src/node/`：`services.ts`（按信任模式登记 `AGENT_RUNTIME`）、`runtime.ts`（ACP 客户端，每个会话一个 agent 进程）、`launch.ts`（随包的 DeepSeek Harness、三份模板、各模式的环境、Presmium 自己的 `DSH_HOME`）、`permissions.ts`（权限请求按工具调用分类）、`relay.ts`（SHARED 中 `x-api-key` 到 `Authorization: Bearer` 的本机转发）、`server.ts`（`info`、`tasks`、`tasks/<id>/events`、`tasks/<id>/cancel`）、`gateway.ts`（`info` 与模型代理 `model/*`）。`dsh/`：`presmium.cordis.yml`、`presmium-shared.cordis.yml`、`presmium-tutor.cordis.yml`。`src/client/`：`AGENT` 的实现（`agent.ts`）、工具栏的“提问”（`AssistantToolbar.vue`）与演讲者面板中的提问面板（`AskPanel.vue`）、选中文字的跟踪与问答记录（`state.ts`）、网页形态中引用的跳转（`viewer.ts`）；`setup/main.ts`。课堂插件：提问的 `reply`（`QuestionReply`）、“互动”总览中的“AI 回答（<服务提供方>）”、草稿与“发给课堂”（`src/client/ai.ts`、`ClassroomPanel.vue`），提问框中显示回答。验收用例在 `packages/addon-assistant/test/acp.test.ts`、`dsh.test.ts`（真实模型的一例在没有 `DEEPSEEK_API_KEY` 时跳过）、`shared.test.ts` 与 `e2e/assistant.spec.ts`（测试文稿 `e2e/fixtures/assistant/`，网页开发服务器的端口 4963）；测试 agent 在 `test/fixtures/scripted-agent.mjs`，Messages 兼容的假模型服务与只记录的转发代理在 `test/fixtures/fake-model.ts`，开会话与签发 MCP 令牌的测试插件在 `test/fixtures/runtime-plugin/`。先行验证的结论在 `design-v0.7.md` 第 11 节；与设计不同或设计没有写明之处在 `architecture.md` 4.8 节“实现（WP-80）”（SHARED 中的本机转发、`presmium-tutor` 的询问策略、`DEEPSEEK_SEARCH_BASE_URL`、Presmium 自己的 `DSH_HOME`）。修改任务（`annotations`、`chat`、`transcript`）的路由得到 501，留给 WP-81（审阅、内置的审阅实现与提交）；运行时已按 `AgentSessionOptions.cwd` 开会话，权限请求已按范围分类。本工作包之外的改动（由验收者确认）：`packages/server/src/mcp.ts` 读 `settings['presmium.exec']`（原先读 `settings.presmium.exec`，`compile: off` 时仍列出 `run_code`，`shared.test.ts` 的验收用例因此失败）；`pnpm-workspace.yaml` 的 `allowBuilds` 增加 DeepSeek Harness 依赖中五个不运行安装脚本的包（否则 `pnpm install` 以 `ERR_PNPM_IGNORED_BUILDS` 失败）。

### WP-81 批注修改、对话修改、修改审阅与修改历史（M7，P-113 至 P-115；D12）

**归属**：`packages/addon-assistant/**`、`e2e/assistant-edit.spec.ts`、`e2e/fixtures/assistant-edit/**`。

**交付**：编辑模式中的批注（按 `[data-block]` 点选块，源码位置取自 IR 中块的 `source`，带摘录）；成批发送（`annotations` 任务，发送即确认），每条批注显示处理状态与 agent 的说明；对话面板（自动带上文档、章节、步骤与选中内容）；批注的发送与对话面板写明模型的服务提供方（`AGENT.provider()`）；修改任务的通用规则，对 `annotations`、`chat`、`transcript` 与起草一视同仁（`design-v0.7.md` 第 23 条）：同一文档一次一个修改任务；修改审阅（D12，`architecture.md` 10.7 节）：任务开始时打开审阅（有 `CHANGE_REVIEW` 时用它，SHARED 中 serve 里是 agent-host 的客户端；没有时用本包内置的 git 实现：临时索引写出的快照树、检查点、差异、按快照恢复、删除任务新建的文件），agent 的 `cwd` 是审阅的 `root`，每个工具调用完成时记检查点（`step` 事件），结束时按 `settings.presmium.assistant.review`：`required`（默认）发出 `review` 事件，面板逐个文件显示差异（文字为统一差异，二进制文件只标出）与各步，发起人或所有者可以全部接受、全部拒绝或拒绝某些文件（`tasks/<id>/review` 路由与 `AgentTask.review`），`auto` 直接全部接受；接受时被拒绝的文件从快照恢复，留下的文件经 `REVISIONS` 提交（说明列出批注、对话摘要或讲授轨 ID，与 agent 的解释，尾注带任务 ID 与发起人，git 的钩子关闭）；全部拒绝时恢复任务开始时的状态，不提交；进程退出时待审阅的任务按全部拒绝关闭；按任务一键撤销已提交的修改（`git revert`），冲突时报告文件；`transcript` 任务把讲授轨 ID 与它的文件位置交给 agent，其余同 `chat`（讲授一侧的请求在 WP-84）；写入超出文档目录时 agent 发出权限请求，经 `write` 确认，范围为 `workspace`，只发给所有者（SHARED 中在所有者控制台上），发起任务的编辑者不能回答；单份文稿的仓库（只在 LOCAL 模式中）里审阅中出现 `presmium.workspace.yaml` 的改动时，接受前另需所有者的 `write` 确认，没有允许时它作为被拒绝的文件恢复（`architecture.md` 10.4、第 11 节）；所有者允许的、文档目录之外的写入不在审阅中，接受时与留下的文件一起提交；agent 对运营者目录（`NodeServiceContext.operatorDir`，在工作区之外）的权限请求一律拒绝，不发给任何人；起草（P-121）：上下文只有文档目录的 `chat` 任务按要求写出全篇，由工作区的新建表单提交（表单在 WP-79），同样经审阅后形成一个提交。

**验收**（LOCAL 模式的用例用 `presmium serve` 只监听本机与测试 agent；SHARED 模式的用例在同一台机器上另起 `presmium gateway` 与 `presmium agent-host`，用随包的 DeepSeek Harness 与测试起的 Messages 兼容假模型服务，`architecture.md` 第 7 节）：

- `e2e/assistant-edit.spec.ts`（LOCAL，走 6.13 节验收的流程：从浏览器中新建的一份文档开始）：批注的发送区与对话面板写明运营者设置的服务提供方（`Test Provider`）；对两个块各加一条批注并发送，源码中两处被修改，页面不刷新即更新；任务结束后面板列出改动的文件与差异，全部接受后 `git log` 中只多一个带 `Presmium-Task` 的提交，两条批注都显示已处理与说明；对话“在本章末尾新增一节”后页面出现新的一节，接受后形成一个提交；撤销批注那次修改后两处内容复原（多一个撤销提交）。
- 同一文件（D12 的审阅）：测试 agent 改动 `lecture.md` 并新建 `notes.md`：拒绝 `lecture.md`、接受其余，`lecture.md` 恢复为任务开始时的内容（包括任务开始前未提交的改动），提交中只有 `notes.md`；另一个任务全部拒绝时文档目录回到任务开始时的状态，新建的文件被删除，没有新的提交；`settings.presmium.assistant.review: auto` 时任务结束直接形成提交，不出现审阅。
- 同一文件（D12，deltabox；`addon-deltabox` 随 CLI 默认加载，主机不满足条件时跳过并说明）：面板写明审阅由 deltabox 完成，测试 agent 的工作目录是会话的视图；拒绝一个文件、接受其余的结果同上一条。
- 同一文件（P-121）：在工作区首页的新建表单中选择“由 agent 起草”并写下要求，测试 agent 写出初稿：接受之后新文档的 `lecture.md` 含初稿的章节，`git log` 中依次是新建的提交（`Presmium-Origin: document`）与起草的提交（带 `Presmium-Task`），页面打开新文档并显示初稿。
- 同一文件：第一个任务进行中（或待审阅时）再提交同一文档的修改任务被拒绝并说明原因；经助手的 `tasks` 路由提交的 `transcript` 任务（带测试讲授轨的 ID）由测试 agent 改写一节讲解，接受后同样形成一个带 `Presmium-Task` 的提交。
- 同一文件（N-08 的确认范围，SHARED，拒绝用例）：编辑者发起的任务中 DeepSeek Harness 按假模型的脚本写文档目录之外的 `presmium.workspace.yaml`：`write` 确认只出现在所有者控制台上，编辑者的页面与所有者在站点上的页面都没有确认入口，编辑者经控制通道回答它得到 403，所有者在控制台上拒绝后文件不变，任务的提交中没有它。
- 同一文件（LOCAL，运营者目录与单份文稿的仓库）：测试 agent 写运营者目录（`NodeServiceContext.operatorDir`）下的一个文件时直接得到拒绝，页面上没有对应的确认，文件不存在。单份文稿的仓库中测试 agent 改动 `presmium.workspace.yaml` 与 `lecture.md`：在审阅中全部接受时先出现所有者的 `write` 确认，拒绝它之后 `presmium.workspace.yaml` 恢复为任务开始时的内容，提交中只有 `lecture.md`；允许它时两者都在提交中。

### WP-84 转写回写讲义（M7、M8，P-136；P-137 中由 agent 生成译文）

**归属**：`packages/addon-lecture/**`、`e2e/lecture-writeback.spec.ts`、`e2e/fixtures/lecture-writeback/**`。

**交付**：只构造讲授一侧的请求，任务的执行、提交与撤销由助手的通用规则完成（WP-81，`design-v0.7.md` 第 23 条）：编辑模式中讲授面板的“整理为讲解”提交 `transcript` 任务（带讲授轨 ID 与要求：按章节把整理后的逐字稿写成讲解，并在 `at` 绑定的位置写入 `{cue}`）；“生成译文”提交一轮 `chat` 任务（上下文为讲授轨，要求把语音段的译文写进讲授轨）；面板显示任务的进度、结果的提交与撤销入口。

**验收**：`e2e/lecture-writeback.spec.ts`（测试 agent）：把一段带语音段的测试讲授轨交给“整理为讲解”，源码中对应章节的讲解变为整理后的文字，`{cue}` 出现在绑定的位置，形成一个提交，撤销后复原；“生成译文”后讲授轨的语音段带英文译文，可以导出英文字幕。

### WP-86 课程站点（M9，P-78、P-79、P-123，P-122 增补）

**归属**：`packages/web/**`、`packages/workspace/**`（`src/node/audience.ts` 除外，它在本波次属于 WP-87）、`packages/render-slides/src/**`、`packages/render-notebook/src/**`、`packages/compiler/src/renderers.ts`、`packages/compiler/src/translations.ts`（WP-73a 建立并由 `compiler.ts` 调用；本工作包在其中加入译本的编译与过期检查，不改 `compiler.ts`，它在本波次属于 WP-87）、`e2e/site.spec.ts`、`e2e/fixtures/site/**`。

**交付**：站点外壳（`nav`、`footer`、`head` 的描述与 OG 元数据、`sitemap`），单份文稿与工作区站点都可用；文件发布（`ir.md` 6.2 节：正文链接的本地文件、目录的文件清单页、原始 HTML 的 `src`、`poster`、`href`，三种媒介一致，无法发布时给出诊断）；工作区首页可以指定为一份文稿、跨文稿搜索、跨文稿的上一章与下一章；译本（`translations.ts` 中编译每个译本，`renderers.ts` 把它们交给 `RenderContext.translations`；VitePress `locales`；在同一章节之间切换；诊断 `presmium.translations` 在编译原文时报告过期并给出新的摘要，`presmium check` 因此照常报告）。

**验收**：

- `e2e/site.spec.ts`：网页产物有顶部导航、页脚、`og:title`、`og:description` 与 `sitemap.xml`；正文链接的起始文件在网页与幻灯片中都能下载（200，内容一致），链接到目录时打开文件清单页并能下载其中的文件；原始 HTML `<video poster>` 的封面返回 200；无法发布的本地链接在构建报告中有带行号的警告。
- 同一文件：工作区首页显示指定的那份文稿；只出现在另一份文稿中的词能被搜索到并跳到那份文稿；第一份文稿最后一章的“下一章”指向第二份文稿。
- 同一文件：中文文稿在第二章切换到英文后停在英文的第二章；`packages/web/test/translations.test.ts`：改动原文后 `presmium check` 报告译本过期并给出新的摘要，写回摘要后不再报告。

**实际交付**：站点外壳（`packages/web/src/domain/config.ts` 的 `siteShell`，`src/node/site.ts` 写进 VitePress 配置：`themeConfig.nav`、`footer`、`description`、`head` 的 OG 元数据，`og:title` 由 `transformHead` 取每页标题，`sitemap` 的 `hostname` 带站点路径；有侧栏的章节页面在 `doc-after` 插槽中另显示页脚；`head.image` 可以是本地文件）；文件发布（编译器 `renderers.ts` 的 `RenderContext.localAsset` 另给出文稿之内的目录：准备在 `.presmium/files/` 中、带文件清单页的副本，三个渲染端以递归复制发布；网页 `publish.ts`、幻灯片 `slidev.ts`、notebook `markdown.ts` 改写原始 HTML 的 `src`、`poster`、`href`；相对路径指向不存在或仓库之外的文件时在该行警告 `presmium.links`，构建报告去重；网页主题以 VitePress 的 `onBeforeRouteChange` 让站内页面之外的链接整页载入）；工作区站点（`src/node/sites.ts`：`site` 的外壳作用于首页与每份文档，文档中的导航链接改写为相对路径；`site.home` 时首页转到该文档、列表在 `documents.html`；每份文档的搜索索引含其他文档；首末页的上一章、下一章跨文档；首页项目以 `transformItems` 生成整个站点的 `sitemap.xml`；`packages/workspace/src/node/site.ts` 的上下文同样发布目录并报告不能发布的引用）；译本（`translations.ts`：`originalDigest`、编译原文时的过期检查 `presmium.translations`、`compileTranslations`；`renderers.ts` 在构建与开发中把译本交给网页渲染端；网页：每个译本一个 VitePress locale，`translationPages` 让译本的章取原文对应章的路径，IR 模块 `virtual:presmium/ir/<语言>` 按需载入，主题以 `onBeforePageLoad` 换上该 locale 的 IR，每种语言一个搜索索引）。验收用例在 `e2e/site.spec.ts`（测试文稿 `e2e/fixtures/site/deck`、`e2e/fixtures/site/workspace`，在 `beforeAll` 中以真实的 `presmium build` 构建，服务在空闲端口）与 `packages/web/test/translations.test.ts`；`packages/workspace/test/site.test.ts` 改为检查跨文稿的搜索索引。与设计不同或设计没有写明之处在 `ir.md` 2.12、6.2、6.3 节与 `architecture.md` 4.10 节标明 WP-86 的段落中：`compiler.ts` 本波次属于 WP-87，过期检查以 `doc.diagnostics` 上的一次性存取器并入编译结果，译本经原文旁的临时入口编译（两处都提议了 `compiler.ts` 的小改动）；工作区站点还不构建文档的译本（要 `SiteDocument` 带上译本，契约的增补）。

### WP-87 发布治理（M9，P-54、P-55，含 `presmium serve` 中读者的学生视图）

**归属**：`packages/compiler/src/blocks.ts`、`packages/compiler/src/compiler.ts`、`packages/compiler/src/directives.ts`、`packages/compiler/src/audience.ts`（新）、`packages/compiler/src/links.ts`（新）、`packages/compiler/src/forbid.ts`（新）、`packages/cli/**`（`package.json` 除外，它在本波次属于 WP-90）、`packages/workspace/src/node/audience.ts`（WP-79 建立）、`e2e/fixtures/publish-checks/**`。

**交付**：通用选项 `:audience:` 与章节级的 `{audience}`；按受众编译（`--audience`），`presmium build --audience` 构建后的泄漏扫描（`presmium.audience`）；`presmium check --audience`；检查项 `presmium.links`（每个渲染端的视图，含原始 HTML 与 `#片段`，工作区中的跨文稿链接）、`presmium.directive`（`mystDirectiveError` 与 `mystRoleError` 成为错误级诊断）、`presmium.forbid`（`checks.forbid`）；`--external-links`（有 lychee 时检查外部链接）。学生视图（`design-v0.7.md` 第 24 条）：`ServerHost` 的 `student` 视图按受众 `student` 编译，在 `packages/workspace/src/node/audience.ts`（`presmium serve` 的读者站点与读者、`tutor` 的 MCP 令牌）与 CLI 的 `ServerHost`（`presmium dev` 中的 `tutor` 令牌）中接入。

**验收**：

- `packages/cli/test/publish-checks.test.ts`：测试文稿中有失效的本地链接、`#nowhere`、带 `:file:` 的 `{csv-table}` 与命中 `checks.forbid` 的文字，`presmium check` 以错误退出并在各自的行上给出四条诊断；只在 `{only} slides` 中、指向只出现在网页中的块的链接只在幻灯片的检查中报告。
- `packages/cli/test/audience.test.ts`：`presmium build --audience student` 的产物（网页、幻灯片、notebook、`ir.json`、搜索索引）中没有教师内容的任何一句，教师章节不在网页目录与幻灯片中；一个教师块的句子又经代码块的输出出现在学生内容中时，构建以错误退出，诊断指向该教师块。
- 同一文件（`presmium serve` 中的受众，SHARED 模式，以测试设置的代理请求头给出身份，另起 `presmium gateway` 与 `presmium agent-host`）：读者打开的文档页面、它的搜索索引与页面加载的 IR（网页渲染端的 IR 模块 `virtual:presmium/ir`，测试以读者身份经服务端请求页面引用的该模块）中都没有教师块的句子，编辑者的页面与 IR 中有；测试插件的路由为读者成员经 `MCP_ENDPOINT.issue(member, 'tutor')` 取得令牌，以它调用 `get_section` 得到的讲解中也没有这句。

**实际交付**：编译器：`:audience:`（通用选项，`{slide}`、`{only}` 上的传给其中的块，嵌套取交集）与章节级的 `{audience}`（`blocks.ts`，内置指令信息在 `directives.ts`）写入 `IRBlock.audience`、`IRSection.audience`；嵌在另一个指令正文中或列表项中的 MyST 指令的 `:audience:` 写入它给出的 mdast 节点的 `data.audience`，`{include}` 的 `:audience:` 由编译器的解析器 `AudienceParser`（按公开的 `read` 包装 `Parser`，不改 `source.ts`）放进受众范围中展开，其中开始章节的标题仍开出章节且整节带这些受众（`liftScopes`）；`CompilerOptions.audience` 在步骤编排之后、插件的编译步骤与执行之前去掉其他受众的章节与块（`audience.ts` 的 `audienceView`：块 ID 不变，步骤压缩，章节重新编号），`Compilation.audience` 给出被去掉内容的句子与产物扫描 `scan(dir)`（`presmium.audience`），`Compilation.forAudience(name)` 在编译好的文稿上做同样的筛选（另去掉块中标了受众的节点，在视图自己的副本中重新解析交叉引用，去掉仍含有被去掉内容的句子的块并报告位置而不引用内容），`Compilation.audienceOf(name)` 给出它去掉的内容与产物扫描；`Compilation.publishChecks()` 在每个渲染端的视图中运行 `presmium.links`（`links.ts`：本地文件、仓库之外、`#片段`、其他文档的 `.md#片段`，`externalLinks` 时调用 lychee）与 `presmium.forbid`（`forbid.ts`）；myst-parser 的 `mystDirectiveError`、`mystRoleError` 在每次编译中成为错误级的 `presmium.directive`（附上该 MyST 指令不接受的选项）。CLI：`presmium build --audience <名>`（构建后扫描输出目录；不删除录制；工作区根目录不接受）、`presmium check --audience <名>`、`--external-links`；`pluginChecks` 包含发布检查（`presmium check`、语言服务、`ServerHost.check`）；`presmium dev` 的 `ServerHost` 的 `student` 视图，它的 `build` 以 `view: 'student'` 构建后扫描写出的文件（诊断不引用句子）。工作区：`packages/workspace/src/node/audience.ts` 的 `viewDocument` 以 `forAudience('student')` 给出读者站点与 `student` 视图。测试文稿在 `e2e/fixtures/publish-checks/`（`checks/`、`audience/`），SHARED 的工作区与测试插件在 `packages/cli/test/fixtures/serve/audience/`、`serve/plugins/presmium-fixture-tutor/`；用例 `packages/cli/test/publish-checks.test.ts`（另验证跨文稿的片段）、`audience.test.ts`（另验证嵌套的指令与 `{include}` 的受众、`presmium check --audience student`、学生视图中指向教师章节的 `{ref}` 不带它的标题、编辑者的 IR 与搜索索引）。已知的缺口：SHARED 中读者经站点开发服务器的 `/<文档>/@fs/<绝对路径>` 能读到源文件（属于站点的开发服务器，WP-86、WP-91）；课堂按位置跟随，完整版与学生版的章节序号与步骤不对应（`ir.md` 2.11 节，待验收者决定是否增加对应关系）。与设计不同之处写在 `ir.md` 2.11 节与第 4 节的表中（受众在第 5 步之后而不是第 2、3 步去掉）与 `architecture.md` 10.3 节标明 WP-87 的段落中。

### WP-91 共享部署安全加固（S 波次；N-08、N-09 的 SHARED 部分）

WP-72 经四轮设计评审后，本机模式与整体架构定稿；共享部署（`presmium serve` 加登录，多人使用）下更深的攻击面单列于此，按明确的威胁模型处理，并经一轮专门的安全评审。完成前，SHARED 模式与 compose 模板标为实验性，文档与启动日志写明。

**威胁模型**：读者、编辑者与他们触发的 agent、讲义代码都不可信；只有运营者与所有者可信。资产：gateway 中的第三方凭据、工作区的 git 仓库与配置、所有者的确认、其他文档。

**交付与验收**（承接 WP-72 第四轮评审的遗留）：

- serve 不向沙箱可写的目录写入任何内容：回滚与恢复、录制结果、文档复制与权限、重命名时改写链接，都由 agent-host 以沙箱身份执行；serve 对工作区 git 的操作在隔离的配置下进行（不读工作区与文档中的 git 配置、属性、过滤器与钩子）。用例：沙箱在任务中把文件替换为指向 `.git/config`、`presmium.workspace.yaml` 的符号链接，放弃审阅、回退与关闭任务都不改动这些文件，也不执行任何 git 过滤器或外部程序。
- 9.4 节残余风险的表述与实测一致（deltabox 覆盖不到的部分写明）。
- `RunContext.env` 的计算方唯一；serve 读取令牌文件的方式唯一（以 root 读取后降权，或由编排注入文件描述符）。
- 所有者控制台的来源规则同时覆盖路由与代理。
- 一轮独立的安全评审通过后，去掉“实验性”标记。

### WP-89 第三轮验收（K 波次）

**交付**：对 v0.8 全部需求的独立验收审计与修复；示例讲义增加执行环境、问答与讲授回放的章节；技能更新；`architecture.md` 第 8 节的 v0.8 行照实更新；按实现核对 9.4 节的残余风险与 9.5 节的上游问题（提交上游与否由用户决定），在 compose 布局上运行一次 SHARED 模式的全部用例；WP-90 没有在 macOS 主机上做的先行验证在这里补做，结论决定 macOS 上是否登记 deltabox 的服务。

**验收**：审计报告中的主要缺口全部关闭；`pnpm verify` 通过；需要外部条件（Docker、GPU、凭据）的用例在具备条件的机器上运行过一次并记录结果。
