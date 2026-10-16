---
name: presmium-author
description: "Presmium 讲义作者指南：用 MyST Markdown 新建或修改讲义（文稿头部 title、lang、plugins、presmium 插件配置、renderers；章节、讲解与上屏内容 {slide}、步骤 :reveal:、{only}、{hints}、{config}、{include}、标签与交叉引用；各插件指令 {code-ref}、{run-panel}、{step-run}、{quiz}、{exercise}、{cursor}、{markmap} 等），运行 presmium check、ir、build、dev 并修复诊断，决定 .presmium 中哪些文件提交。Use when writing or editing a Presmium lecture or deck (lecture.md, MyST directives, code references with pins and drift, compile-time or live code runs, freeze cache, step and narration binding) or fixing presmium check/build diagnostics."
---

# 编写 Presmium 讲义

Presmium 把一份 MyST Markdown 讲义编译为中间表示（IR），再生成网页、幻灯片（Slidev）与 Jupyter notebook。编辑只在源码中进行，产物不回写源码。完整的语法与 IR 定义见 `docs/ir.md`（本技能只给要点和容易出错的地方），每条指令的选项与示例见 `references/directives.md`。

放映与课堂见 presmium-present 技能；开发插件或渲染端见 presmium-develop 技能。

## 1. 文稿放在哪里

文稿是一个目录，入口为 `lecture.md`（也可以把入口文件直接交给命令）。Presmium 的包没有发布到 npm，插件与渲染端从文稿目录向上查找 `node_modules` 来加载，所以文稿要能找到这个仓库安装好的包：

- 在仓库内：仿照 `examples/demo/package.json` 在 `examples/<名字>/` 建一个工作区包（依赖写 `workspace:*`），在仓库根目录运行 `pnpm install`。之后在文稿目录运行 `pnpm exec presmium <命令>`。
- 在仓库外试用：把示例文稿装好的依赖链接过来，`ln -s <仓库>/examples/demo/node_modules <文稿目录>/node_modules`，再运行 `<文稿目录>/node_modules/.bin/presmium <命令>`。
- 两种情况都可以直接运行 `node <仓库>/packages/cli/bin/presmium.mjs <命令> <文稿目录>`。

`{code-ref}` 的锚点路径相对于文稿所在 git 仓库的根目录（不在 git 中时相对于文稿目录），锁定提交也要在这个仓库里，所以引用代码的文稿要放在被引用代码的 git 仓库中。按文稿目录写了路径时，`presmium check` 报文件不存在，并给出从仓库根目录起的写法。

## 2. 文稿头部

```yaml
---
title: BPE 分词
lang: zh-CN                     # 文稿语言，决定两种形态的 <html lang> 与界面语言；默认 zh-CN
plugins:                        # 插件包名，按需列出（每个包提供哪些指令见 references/directives.md）
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-code'
  - '@presmium/slidev-addon-exec'
presmium:                       # 各插件的全局配置，键为插件 ID
  presmium.code: { repo: https://github.com/org/repo }
renderers:                      # presmium build 默认构建的渲染端及其配置
  web: {}
  slides: { theme: default }
  notebook: {}
execute:                        # 可选：执行环境（第 10 节）
  env: box                      # 写了 :run: 而不写 :env: 的代码块的环境；不写时按语言选执行器
  environments:                 # 具名环境：kind 为 devcontainer（本地环境插件）、jupyter、wasi、webgpu 等
    box: { kind: devcontainer, path: . }
  rerun: environment            # 另一运行环境录制的输出重新执行
sectionDepth: 2                 # 可选：开始章节的标题级别，默认 2
---
```

- `plugins` 中没有列出的插件，其指令报错 `unknown directive`。总是列出 `@presmium/slidev-addon-core`（幻灯片形态的宿主适配，插件组件与静态导出靠它）；讲台功能（黑屏、冻结、圈画、脚注就近显示）来自 `@presmium/slidev-addon-stage`。
- `lang` 是文稿语言的唯一来源：两种形态的 `<html lang>`、界面语言、编译时写进产物的文字（notebook 的说明等）都按它；渲染端不能另设语言。Presmium 只有中文与英文文本，其他语言（如 `fr`）的界面跟随浏览器的语言，再不行用英文。
- `renderers.web`：`base`（站点路径）、`port`（开发服务器端口）。`renderers.slides`：Slidev 文稿头部的选项（如 `theme`、`routerMode`、`exportFilename`），另有 `base`、`port`、`addons`。`renderers.notebook`：`kernel`（默认 `python3`，与内核同语言的代码成为代码单元格）、`webUrl`（notebook 显示不了的组件链接到网页版；不写而同时构建网页时用相对链接 `../web/<页>#<章节>`）。任一渲染端都可以用 `package` 换成另一个包。
- `base` 的默认值：同时构建网页与幻灯片、两者都不写 `base` 时，网页为 `/web/`、幻灯片为 `/slides/`，`dist/` 整体就是一个站点；只构建一种时为 `/`。
- 不写 `renderers` 时构建全部已安装的渲染端。
- 入口文件以 UTF-8 BOM 开头（Windows 记事本）也没关系。

## 3. 章节

- `##`（`sectionDepth` 级标题）开始一个章节。第一个 `##` 之前的内容是封面章节，其中的 `#` 标题是文稿标题；之后的每个 `#` 是分章标题，自成一个章节。
- 一个章节是幻灯片的一页、网页的一节、notebook 中以标题开头的一组单元格。
- 网页每章一页：封面、每个 `#` 分章标题、每个被引入文件的开头都开始新的一页；页面文件名取源文件名（第一页为 `index.html`）。
- 章节 ID 取自标题前一行的标签 `(bpe-merge)=`，没有标签时由标题生成（与某个标签相同时加 `-2`，标签优先）。ID 用于深链接、形态互跳与笔记挂载，发布后不要改；需要稳定 ID 的章节都写标签。

## 4. 讲解与上屏内容

章节中的每个块要么是讲解，要么是上屏内容（`docs/ir.md` 2.3 节）：

| 块 | 角色 | 网页 | 幻灯片 | notebook |
|---|---|---|---|---|
| 普通段落、列表、引用 | 讲解 | 正文 | 演讲备注 | Markdown 单元格 |
| `:::{slide}` 中的内容；代码块、`{code-ref}`、图片、表格、公式、图表、插件指令 | 上屏内容 | 按原顺序显示 | 页面上 | Markdown 或代码单元格 |

想让列表或表格出现在幻灯片上，把它放进 `{slide}`；不放进去的列表是讲解，只进备注。表格与只含图片的段落本身就是上屏内容。

讲解与表格单元格中不是 HTML 元素的标签（例如 agent 轨迹中的 `<reminder>`、`<system-reminder>`）按字面显示，不用转义；行内的 `<svg>`、`<math>` 及其中的 SVG、MathML 元素照常是元素。其他位置的原始 HTML 照常是 HTML：没有闭合的标签会使幻灯片构建失败，`presmium build` 把错误报告在源码中该块的位置。

## 5. 步骤与讲解的绑定

规则（`docs/ir.md` 2.4 节，编译器 `packages/compiler/src/steps.ts`）：

1. 上屏块默认在第 0 步显示。`:reveal:` 让它在下一步出现；`{slide}` 或 `{only}` 上的 `:reveal:` 让其中全部内容作为整体在下一步出现，`:reveal: items` 让其中的列表逐项出现。
2. 占多步的块（`span` > 0）有 `span + 1` 个状态，第 k 个状态在第 `at + k` 步：`{code-ref}` 的 `:steps:`、`:variants:`，逐项出现的列表，`{step-run}`、`{cursor}`，以及 `{component}`、`{spotlight}`、`{hint}` 的 `:span:`。没有 `:reveal:` 时它从当前已用到的最后一步开始。
3. 讲解绑定到它前面最近的上屏块：第 1 段属于该块出现的那一步（`at`），第 2 段属于 `at + 1`……超出 `span` 的段落都属于 `at + span`。不占多步的块，其后的讲解都属于 `at`。
4. 第一个上屏块之前的讲解属于第 0 步。

所以“每步一段讲解”的写法是：上屏块后面按步骤顺序写段落。

````md
(merge)=
## 合并

```{code-ref} region:src/bpe.py#merge
:steps: count, replace
```

第 0 步：高亮 count，讲统计。

第 1 步：高亮 replace，讲替换。

:::{slide}
:reveal:
> 小结：先数再并。
:::

第 2 步：小结出现，这段讲解属于它。
````

用 `presmium ir` 检查每个块的 `at` 与章节的 `steps` 是否符合预期。

## 6. 媒介限定、排版提示、章节配置

- `:::{only} web, notebook` 让内容只出现在列出的渲染端（`web`、`slides`、`notebook`）。拼错的 ID（如 `slide`）得到警告 `unknown renderer id`，否则内容会从所有形态中消失。只在某个渲染端出现的块所占的步骤，在其他渲染端中不存在。
- `:::{hints}` 的正文是按渲染端分组的 YAML：`web: { layout: scrolly }` 让这一节在网页中用滚动叙事版式；`slides:` 下的键写进这一页的 Slidev frontmatter（如 `layout: center`）。不要用 `two-cols` 这类需要 `::right::` 插槽的布局，MyST 写不出插槽，内容会全挤在左栏。
- `:::{config}` 为插件提供只在本章节生效的配置（YAML，键为插件 ID）。读取章节配置的是 `presmium.exec.timeoutMs`（这一节代码在编译时与浏览器中的超时）与 `presmium.code.repo`（这一节 `{code-ref}` 永久链接的仓库）；其他选项只读全局配置。

## 7. 引入、标签与交叉引用

- 多文件文稿：用 `{include}` 指令引入其他文件（路径相对于当前文件，写法见 `references/directives.md`）；被引入文件的 frontmatter 被忽略。脚注的引用与定义须在同一文件；不同文件可以都用 `[^1]`，每个文件的脚注各自从 1 编号。
- 标签：标题前的 `(id)=` 给章节 ID；块前的 `(id)=` 或指令的 `:label: id` 给块 ID（章节内唯一）。`{question-box}` 的 `:target:` 和课堂笔记依赖块 ID；没有标签的块 ID 随前面插入同类块而变化。
- 交叉引用：`` {ref}`merge` `` 引用章节（文字为章节标题），`{numref}`、`{eq}` 引用带标签的图、表、公式；自己写了文字的引用保留文字。目标不存在时警告 `presmium.references`。

## 8. 插件指令

指令一览、选项与最小示例见 `references/directives.md`。先确认提供该指令的包已写进 `plugins`。

文稿自己的组件：放在文稿目录的 `components/` 下（`StepBadge.vue`），用 `{component} StepBadge` 放进正文，两种形态都渲染。组件只能引用 `@presmium/host`、`@presmium/kernel` 与 vue，文稿的 `package.json` 要依赖 `@presmium/host`。

## 9. 引用真实代码

`{code-ref}` 引用仓库中的代码，不复制进文稿：

- 锚点 `region:<文件>#<区间名>`（代码中的 `#region` 注释）、`symbol:<文件>#<类名.方法名>`（TypeScript、JavaScript、Python 的语法树）或 `pattern:<文件>#<ast-grep 模式>`。
- `:pin: <提交>` 读取该提交中的代码，并生成指向该提交的永久链接（仓库网址取 `:repo:`、本章节的 `presmium.code.repo`（可以用 `{config}` 按章节改）或 `origin` 远端）。不写 `:pin:` 时读取工作区。`:variants:` 的每个版本有自己的文件链接与行号，随步骤切换。
- 漂移：锁定的代码在工作区中变了时，`presmium check` 与 `presmium build` 给出警告 `presmium.code.drift` 并附差异。看过差异后，要么改 `:pin:` 到新提交，要么接受旧版本。
- 锚点状态：精确、已移动（提示）、模糊（警告，需确认）、丢失（错误）。`presmium check --update-lock` 在工作区重新解析全部锚点并写入 `.presmium/anchors.lock.json`，之后移动与改动按这份记录判断。

## 10. 执行代码与缓存

- 编译时执行：`{code}`（或 MyST notebook 的 `{code-cell}`）加 `:run:`（或 `:run: compile`、`both`）、`{code-ref}` 加 `:run:`、`{run-panel}`（默认 `both`）。构建时用本机的 `python3`、`node` 执行（`py`、`python3`、`ipython` 都是 Python），输出写进 IR，所有媒介都显示；程序直接写标准输出（`process.stdout.write`、`console.dir`）也照常录制。
- 浏览器中执行：`:run: live` 或 `both`。网页中的代码块有运行按钮；幻灯片中 Python、JavaScript、TypeScript 的这类代码块是 Monaco Runner，点运行按钮执行。浏览器中的 Python 由 Pyodide 执行，可离线；每次运行有自己的工作目录，一次运行写的文件、改的递归限制不影响下一次，与编译时一致。
- 运行环境：头部 `execute.environments` 声明具名环境（不含凭据；凭据只来自环境变量，如 `PRESMIUM_ENV_<名>_TOKEN`，头部中像凭据的值给出警告 `presmium.secrets`），代码块与 `{run-panel}`、`{code-ref}` 用 `:env: <名>` 选择。环境不可用时不改用别的执行器：有录制就显示录制。`presmium check --env` 连接每个声明的环境，连不上是错误。
- 执行会话：同一 `:session:` 的代码块共享解释器（前一块定义、后一块使用），编译时改了其中一块整个会话重新执行；浏览器中每个页面各有一份，“重置会话”丢弃它。
- 富输出与 `:echo: false`：`display()`、`IPython.display` 的对象与 matplotlib 的图录制为富输出，各媒介按类型显示；`:echo: false` 只显示输出，Markdown 输出按正文显示（从数据生成表格）。见 `references/directives.md` 的 `{code}`。
- 编译时执行的代码只得到清理过的环境变量：去掉 `PRESMIUM_` 开头与名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量（运营者可在工作区配置的 `settings.presmium.exec.passEnv` 中列出要传入的变量）。打印环境变量的代码因此不会把凭据写进录制与产物。
- 组件里的代码（执行面板、分步执行、本地环境包着的代码块）由组件运行，不另显示运行按钮与录制输出。
- 执行缓存在 `.presmium/freeze/`，键为语言、代码、参数、执行器与环境指纹的哈希（会话中的块还包含前一块的键）；较大的图片等输出存在 `.presmium/freeze/blobs/`。`check`、`ir`、`build`、`dev` 每次编译都执行需要执行的代码并写入缓存；代码不变就不重跑；没有运行环境时沿用已提交的录制；超时不录制。只有 `presmium build` 删除已不存在的代码的录制。
- 超时：代码块或指令的 `:timeout:`，否则 `presmium.exec.timeoutMs`（头部的全局值，或某一节 `{config}` 中的值），否则编译时默认 10 秒。
- 别的运行环境（如另一个 Python 版本）录制的输出默认沿用并警告；头部写 `execute: { rerun: environment }` 时重新执行并替换录制。
- 执行失败或超时的 `{run-panel}` 显示 `:recorded:` 的预录输出。PDF、PNG 导出中执行面板显示先给参数赋值的代码与编译时的输出（没有时用 `:recorded:`）。

## 11. 命令

`[deck]` 是文稿目录或入口文件，默认当前目录。退出码：0 没有错误，1 有错误级诊断，2 用法错误或内部错误。

| 命令 | 作用 |
|---|---|
| `presmium check [deck]` | 编译并运行插件的检查项，只输出诊断；`--json` 输出 JSON，`--update-lock` 先重写锚点锁定文件，`--env` 另外连接头部声明的执行环境 |
| `presmium ir [deck]` | 把 IR 输出到标准输出（诊断在标准错误）；`--out <file>` 写到文件 |
| `presmium build [deck]` | 编译并生成媒介：`<deck>/dist/ir.json` 与 `<deck>/dist/<渲染端>/`；`--to web,slides,notebook` 选渲染端，`--out <dir>` 改输出目录 |
| `presmium dev [deck]` | 启动 Presmium 服务端与渲染端的开发服务器（网页、幻灯片），保存源码后增量更新；`--to web` 只启动网页，`--out <dir>` 改工作目录（默认 `.presmium/dev`），`--server-port <n>` 指定服务端的端口，`--allow operate` 让插件请求的这类确认不再询问（种类还有 `spend`、`write`、`agent`）。服务端只监听本机，地址与 MCP 的令牌写在 `.presmium/server.json`；插件请求的确认出现在页面工具栏的“待确认”入口 |

常用流程：改源码 → `presmium check` → `presmium dev --to web` 边写边看 → `presmium build` 生成全部媒介。构建报告列出渲染端未渲染的块（`N blocks not rendered`）。

### 编辑器中的 agent（MCP）

Presmium 以 MCP 把文稿交给 agent（Claude Code、Codex、VS Code 等）：读取类工具 `list_documents`、`deck_info`、`list_sections`、`get_section`（讲解与上屏内容）、`get_step`、`search`、`get_code_ref`、`get_outputs`、`get_diagnostics`、`locate_source`（相对于文稿目录的文件与行），以及放映中的 `get_position`、`get_classroom`；操作类 `navigate`、`run_code`、`build`、`classroom_start`、`classroom_end` 要在页面工具栏的“待确认”中允许。没有写文件的工具：agent 用自己的文件工具改源码，`presmium dev` 随即重新编译。

- `presmium dev` 运行时：MCP 的地址（`mcp  http://127.0.0.1:<端口>/mcp`）与令牌在 `.presmium/server.json`，agent 以 HTTP 方式连接，请求头 `Authorization: Bearer <令牌>`。
- 不启动服务端时：`node <仓库>/packages/mcp/bin/presmium-mcp.mjs <文稿目录>` 以 stdio 提供读取类工具；加 `--allow operate` 另提供并直接允许 `run_code` 与 `build`。网页形态的放映视图盖住了工具栏，放映时的确认在文档视图的窗口中回答。

## 12. 读诊断

每行诊断为 `<文件>:<行>  <级别>  <消息>  (<检查 ID>)`，有提示时下一行是 `hint:`。常见的：

| 检查 ID 与消息 | 处理 |
|---|---|
| `presmium.directive` `{x}: unknown directive; is the plugin that provides it listed in plugins?` | 把提供它的包加进 `plugins`，或改正指令名 |
| `presmium.directive` `unknown option :x:` | 对照 `references/directives.md` 改正选项名 |
| `presmium.plugins` `cannot load plugin "…": package not found` | 文稿找不到安装好的包，见第 1 节 |
| `presmium.parse` `{include} …: file not found` | 路径相对于写 `{include}` 的文件 |
| `presmium.sections` `duplicate section label` 或 `duplicate block label` | 标签在文稿（章节）或章节（块）内须唯一 |
| `presmium.code.anchors` `anchor … is lost` | 恢复 `#region` 标记或声明，或改正锚点；`:steps:` 的名字须是锚点内嵌套的区间 |
| `presmium.code.anchors` `… not found under the repository root` | 锚点路径从仓库根目录写起；按提示的写法改 |
| `presmium.directive` `{only}: unknown renderer id` | 改正渲染端 ID |
| `presmium.execLocal.workspace` `{local-env} names the workspace …` | 一份文稿只有一个工作区：各 `{local-env}` 写同一个 `:workspace:`，或设置 `presmium.execLocal.workspace` |
| `presmium.code.anchors` `moved` 或 `needs confirmation` | 确认位置后运行 `presmium check --update-lock` |
| `presmium.code.drift` `drifted since pinned commit` | 读差异，改代码或改 `:pin:` |
| `presmium.execute` `no executor for … and no recorded output` | 安装 `python3` 或 `node`，或提交 `.presmium/freeze/` 中的录制 |
| `presmium.execute` `recorded output was made with …` | 别的环境录制的输出被沿用；要重跑就加 `execute: { rerun: environment }` |
| `presmium.execute` `:env: x: no such environment` | 在头部 `execute.environments` 中声明它，或改正名字 |
| `presmium.execute` `no plugin in plugins provides environments of kind …` | 把提供该类环境的插件加进 `plugins`（`devcontainer`：`@presmium/slidev-addon-exec-local`） |
| `presmium.execute` `session "…" runs in … and here in …` | 同一会话的代码块写同一个 `:env:` |
| `presmium.secrets` `… looks like a credential` | 从头部删掉它，改用环境变量 |
| `presmium.references` `target "…" not found` | 给目标加标签，或改正引用 |
| `presmium.classroom` `{quiz} needs at least two options` | 选项写成任务列表 `- [ ]`、`- [x]` |

## 13. 提交哪些文件

文稿的 `.presmium/` 中只有以下几项随文稿提交，仓库根目录的 `.gitignore` 已按此配置：

- `.presmium/freeze/`：执行缓存，让任何人构建都得到相同输出、无需运行环境。
- `.presmium/anchors.lock.json`：锚点锁定记录（`presmium check --update-lock` 生成）。
- `.presmium/drawings/`：幻灯片中的圈画标注。
- `.presmium/assets/`：本地化的远程图片（如 PlantUML 图），新增一个后要提交。

不提交：`dist/`（构建产物）、`.presmium/web`、`.presmium/slides`、`.presmium/dev` 等渲染端工作目录。文稿在别的 git 仓库中时，把本仓库根目录 `.gitignore` 中关于 `.presmium` 的几行复制过去。
