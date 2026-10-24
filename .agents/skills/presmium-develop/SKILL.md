---
name: presmium-develop
description: "帮助开发者评估 Presmium 架构、定位故障、实现或修改插件、渲染端、宿主与工作台，并用真实用户流程验证结果。Use when analyzing or changing the Presmium codebase or developing a Presmium plugin, including integration tests and package compatibility."
---

# 开发与评估 Presmium

工作台的通用交互复用现成组件：弹窗与菜单封装 Radix Primitives，分栏用 react-resizable-panels；首次欢迎直接用 Harness 的 `Modal`。使用现有设计令牌，文档操作、保存冲突、编译、审阅与预览同步由 Presmium 维护，不重复实现依赖已有的焦点、键盘、定位与拖拽行为。

工作台面向不懂技术的教师，优先保证“在文稿上指出问题、直接改或交给 AI、随时撤消”的简单闭环；专业代码编写交给 VS Code 扩展。评估 agent 的环境反馈时区分 `get_diagnostics`（源码与检查）、`get_outputs`（编译录制）和 `get_runtime`（作者浏览器实际报告的插件/组件失败、现场执行与会话重置）。经已有 `STATUS` 上报，保持摘要有界、有位置与时间；没有窗口不能推断成功，修改后须重新执行或确认页面效果。

产物中的 Vue 交互封装 Reka UI，包含弹窗、抽屉、菜单、浮层、Tabs、分段切换与放映焦点范围；不另写全局 Escape、焦点循环或浮层定位。内容标签的 `sync` 联动与步骤状态仍是 Presmium 的业务。主题观察统一经宿主与 VueUse，图标用 `@lincyaw/design` 中映射到 Lucide 的语义名称，问答流用 eventsource-parser 解析 SSE 事件。

先确定用户希望改变的行为，再找到负责它的边界。交付应能说明谁在什么操作下遇到什么变化，以及真实组装的系统如何证明这个变化。

## 从任务找到需要的信息

| 任务 | 先看什么 | 怎样判断完成 |
|---|---|---|
| 分析架构、评估设计取舍 | 目标用户的任务、领域边界、实际依赖与契约 | 用代码证据说明收益、成本、适用前提和优先级；区分已验证问题与风险 |
| 修复检查、构建或预览问题 | 用户命令、最小文稿、首条诊断、对应编译或渲染入口 | 原来的操作成功，相关媒介与降级路径仍可用 |
| 增加指令、组件或交互 | [插件开发流程](references/plugin.md)，行为相近的现有插件 | 源码能编译，两种浏览器形态能使用，静态输出有合理降级 |
| 扩展渲染端或运行时视图 | `Renderer` 或 `ViewerPluginContext` 契约、相近的实现 | 不回读源码，支持程度与缺失内容有报告，位置和步骤正确 |
| 修改编辑、预览同步或 agent 行为 | 工作区路由、预览协议、当前宿主适配 | 保存、外部改动、重连或审阅后，源码与预览仍一致 |
| 修改加载、依赖或发布方式 | 包的 `exports`、对等依赖与消费者安装用例 | 单仓之外安装后也能构建和使用 |

架构评估和只读排查不要求改代码。写讲义用 `presmium-author`，授课操作用 `presmium-present`。

## 阅读到足以作出决定

在 Presmium 仓库中先读根目录 `AGENTS.md`。按任务进入 `docs/domain-model.md`（职责与不变量）、`docs/architecture.md`（边界与取舍）、`docs/ir.md`（语法到 IR）；工作台再读 `docs/design-dsh.md`。公开接口与版本规则见 `site/reference/lecture.md`。

契约以源码为准：`packages/kernel/src/contracts/`（`contracts.ts` 汇总导出）是插件与服务，`packages/kernel/src/ir.ts` 是文稿与渲染，`packages/host/src/contracts.ts` 是浏览器宿主。读需要的类型与调用方，不把全仓包清单复制进回答。发现文档与实现不符时明确指出影响。

第三方插件项目先读它自己的 `AGENTS.md` 与现有源码；[插件开发流程](references/plugin.md) 提供独立示例，不要求项目里存在 Presmium 单仓的 `docs/` 或 `packages/`。

在仓库中体验或调试工作台，用 `pnpm studio [目录]`，打开终端打印的完整网址。不传目录时首次准备独立示例工作区，之后复用；编辑预览不需要模型，`Ctrl+C` 停止。

默认副本在 `.presmium/example-workspace`，由唯一公开示例 `examples/animations/` 的 `try.mjs` 复制而来：两讲用代码写动画的中文讲义，讲解的语音在随讲义提交的合成缓存中。改示例的讲解后用配置好的语音引擎重新构建讲授，提交更新的 `.presmium/speech/` 与 `speech.lock.json`，再在没有引擎的环境中运行 `pnpm demo:check` 确认缓存齐全。功能验证使用 `e2e/fixtures/<组>/`，旧 BPE 讲义只留在 `e2e/fixtures/regression/` 做回归。

工作区、会话与当前文稿的映射以 `docs/design-dsh.md` 6.2 节为准。修改 agent 写入时，验证工作区中的代码与其他文稿都进入同一次审阅，未选择文稿也一样；提交失败后仍能重试或拒绝。

工作台面向不懂技术的教师（`docs/design-dsh.md` 7.3 节）：不出现源码编辑器、文件树、问题面板原文与 git 用语，命令名称参照 Word（撤消、恢复、新建批注、版本历史、接受与拒绝、编辑与查看），中英文两套文字都要齐。编辑发生在文稿页面上：预览协议的 `pick` 报告点选与选区的位置，工作台在鼠标旁画工具条；`edit` 让一块可以输入，`edited` 带回前后文字，`text-edit.ts` 按 IR 中块的源码行把差异落回源码，跨过格式标记时拒绝写回并交给 AI。修改这一条链路时，验证纯文字、强调与链接内的改动写回正确，跨链接的改动不改文件，Markdown 字符被转义。

每次保存是一个提交，撤消与恢复走 `history/undo`、`history/redo`（带 `expect`），版本历史按 `revisions` 的 `reverts`、`revertedBy` 标出已撤消的修改。验证撤消、恢复、新修改清空恢复，以及 AI 的 turn 结束后成为一个版本。

预览连接绑定建立时的文稿与形态；预览内跨讲导航通过 `ready.document` 跟随当前文稿。验证切换后的选区进入新文稿的对话上下文，关掉工具条后焦点清空。

诊断使用工作区服务的当前快照（`docs/design-dsh.md` 5.4 节），工作台与 MCP 订阅同一来源。新增告警要验证出现、恢复清除和文稿隔离；读取诊断资源不触发完整检查。dsh 在模型步骤前注入具体诊断，订阅失败必须报告不可用；通知不自动启动模型。工作台只说“有几处内容没能正确显示”，原文放在“详细信息”里；“让 AI 修复”、AI 改写与批注都经 `agent-requests.ts` 交给当前会话，并保留输入草稿。

dsh 给 agent 的说明（`packages/dsh/src/node/context.ts` 的指南与文稿快照、`web.patch.yml` 的 persona）描述系统而不规定步骤：东西在哪、agent 负责什么、哪个工具说明什么，事实给全，路径都相对工作区根目录；作者的消息与批注就是要做的事，回答按作者看到的内容说，不提内部实现（`docs/design-dsh.md` 6.4、6.6 节）。工作区特有的约定（生成的文件、需要一起改的文件）写进工作区的 AGENTS.md。评估 agent 时看会话轨迹：用了几步、在哪里探索了上下文本该给出的事实、哪条说明让它多做了。

观测数据（`docs/design-dsh.md` 6.7 节）只在配置了 `PRESMIUM_TELEMETRY_URL` 时采集：`presmium-telemetry` 行导出每个会话的全部事件，工作台的 `OperationLog` 记录作者的操作并经 `/api/presmium/telemetry` 交给宿主。新增作者能做的操作时，在 `Workbench` 的对应方法中用 `#record`（耗时的用 `#timed`）记下它；交给 AI 的请求要带回会话与请求的 ID（`AgentAnswer`），关联靠它。验证用 `packages/dsh/src/node/fake-collector.ts` 接收上传，见 `packages/dsh/test/telemetry.test.ts` 与 `e2e/workbench.spec.ts` 中的“the operator's collector”。

新建与历史入口放在对话栏顶部，历史仍用 Harness 的会话列表。新建通过公开的 `uiWorkspace.startSession` 指定当前工作区，保持当前文稿；不模拟点击隐藏的侧栏按钮。

活动栏只有文稿、AI 助手，底部是更多、设置与帮助；对话记录从对话头部打开。对话记录中选中会话时必须直接显示聊天，重新选中当前会话也一样；不能只观察会话 ID 变化。`ctx.layout.selectPanel(null)` 按 Harness 契约唤起会话，对话中指向文稿 Markdown 的链接经 `LayoutController.showDocument()` 显示文稿中的那一处。分别验证后台启动绑定不抢视图、链接不展开聊天，以及对话记录恢复聊天与草稿。

复用内容组件时只保留一套外壳：默认关闭 Harness 的 `ui-layout` 与 `ui-sidebar`，Presmium 通过公开槽位组合会话浏览器、设置与对话头部；退路模式同时重新打开两者。检查重复品牌、操作栏和入口，并在拖动、缩窄、全屏后验证面板实际边界和点击区域，不能只验证元素存在。

插件、自动化任务属于全局工具，通过 `sidebar.panellist` 收在活动栏底部的“更多”菜单中；只有一个工作区，对话记录不显示工作区一行，对话不提供选择工作区与 agent 预设（按槽位名与行键隐藏，不按生成的类名）。对话头部不保留原生右侧栏展开按钮；用 `conversation.session.header.corner` 槽位移除，仍保留按内容打开的审阅与媒体预览。验证空会话、已有消息与点击文件后的状态，避免收起面板后多余入口重新出现。

## 把行为放在正确的边界

文稿的事实来源是 MyST 源码，编译器把它变成 IR。网页、幻灯片、notebook 等渲染端消费 IR。网页是主媒介；需要交互的功能同时考虑静态输出、执行器缺失与离线时用户能看到什么。

先选已有插件、服务或渲染扩展点。已有组件能满足时通过公开接口定制。需要新的能力时：

- 语法、引用、执行输出或诊断在编译侧处理；依赖的文件经 `ctx.src`、`ctx.resolvers` 或 `ctx.watch` 登记，使修改能触发重新编译。
- 组件与浏览器逻辑只经 `@lincyaw/host` 取得步骤、配置与服务。同一步应得到同一视觉状态，前进再后退也成立。
- 插件之间通过服务契约协作，不直接引用另一个插件。`src/domain` 保持纯 TS；Node 适配器与浏览器适配器各自处理外部系统。
- 修改源码的能力属于工作台与工作区；产物经带版本的预览协议与工作台通信。DeepSeek Harness 的接口只在 `dsh` 与启动器 `studio` 中出现。

不引用 Slidev、VitePress 的内部路径，不 fork 或打补丁。查框架接口先查 `vendor/docs/slidev`、`vendor/docs/vitepress`，缺失时 `pnpm docs:fetch`；不读框架编译产物。现有未文档化的依赖及守护用例在 `docs/architecture.md` 的已知风险部分。

## 实现时守住会影响用户的约定

- 界面同时提供 zh-CN 与 en，浏览器端使用 `useMessages`、`useLocale`，编译产物的文字按文稿 `lang`。控件、颜色与字体沿用设计系统，并检查明暗与所需的窄屏布局。
- 新组件有可理解的静态降级；Worker、定时器、订阅等在生命周期结束时释放。只在重载后恢复正常的行为不算完成。
- 共享的宿主与契约包通过对等依赖使用，避免两份注入键或运行时。源码以 `.ts`、`.vue` 发布，相对导入写 `.ts` 扩展名。
- 工作区服务按单用户工具设计。学生内容由 `--audience student` 构建筛除，不能用页面隐藏或作者服务的角色假设替代。

新增插件或扩展接口的注册、渲染扩展与包配置查 [插件开发流程](references/plugin.md)。不要为了一个功能把所有扩展点都实现一遍。

## 按改变的行为选择验证

VS Code 扩展用 `pnpm --filter presmium-vscode package:vsix` 生成当前系统与处理器的安装包。语言服务与网页渲染运行时从锁文件部署进 VSIX；不能把开发目录的软链接当成已打包依赖。运行 `packages/vscode/test/build.test.ts` 验证解压后的服务在仓库外启动预览，并在普通 VS Code 窗口中验收安装包。`.github/workflows/vscode.yml` 在六个平台上构建验证，GitHub Release 发布后附加下载文件；安装与构建步骤统一维护在 `packages/vscode/README.md`。

测试用法与真实 CLI、服务和浏览器的辅助工具见 [集成测试](references/testing.md)。只写集成测试，不写单元测试，不 mock 宿主框架；每个行为一到两个用例，验证用户可观察的结果。专用端到端文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中构建。

先运行改动对应的用例。插件组件覆盖两种形态与必要的静态降级；实时预览覆盖保存与位置保持；共享加载或打包的改动覆盖消费者安装；dsh 的改动运行设计文档中的相应升级闸门。

性能改动按 `docs/architecture.md` 1.1 节记录冷启动、修改编译和保存到预览的延迟，区分 CPU 时间、实际等待时间与测试预算；在相同负载下交替比较前后版本，并核对 IR、公式编号、源码行号和旧快照不变。测试与基准使用单个 worker，遵守默认的原生线程预算；不要为追求 100 ms 而取消校验或提高并发。增量编译覆盖跨块引用、脚注、围栏、include 与插件外部依赖，连续保存验证取消旧任务后只发布最新结果。资源预算的环境变量、缓存上限与软限制统一见该节。

日常开发遵守 `AGENTS.md` 的测试成本约定：只运行改动直接涉及的定向集成测试和相关轻量结构检查，默认单个 worker，只构建所需文稿与媒介，定向验证通过后停止。除非用户明确要求全量验证，不自动运行 `pnpm test`、`pnpm verify`、完整 `pnpm e2e` 或全部 17 讲的 demo 构建与检查，收尾和合并前也不例外。报告实际通过、跳过和未运行的范围。只修改技能文档时运行 `node scripts/check-skills.mjs` 并核对任务路径与示例；通过格式检查不代表指导正确。

浏览器用例只用自己启动的服务器；并行时设置各自的 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT`。单独运行性能用例用 `pnpm exec playwright test e2e/perf.spec.ts --no-deps`。结束时按记录的 PID 停自己的进程。

## 让下一位使用者能接手

行为或命令变化时更新真正指导该任务的文档与技能，保留一处完整定义，其余引用它。新指令补进作者技能的指令参考；公开接口同步文档站，公开包变更按发布规则写 changeset。新增包的元数据与发布范围见 `.changeset/README.md`。

报告说明改后的行为、为什么放在这个边界、实际验证和仍未覆盖的条件。架构建议给出触发重构的具体条件，避免仅因包多或契约多就主张重写。用户没有要求提交或发布时，留下可审阅的改动即可。
