# Presmium 源语法与中间表示（IR）

本文档定义 Presmium 的编译管线：作者编写的源码如何解析、经哪些编译步骤生成中间表示（IR），以及各渲染端如何从 IR 生成媒介。IR 的 TypeScript 定义见 `packages/kernel/src/ir.ts`，以该文件为准。

## 1. 管线

```
源码（MyST Markdown）+ 真实代码文件
        │  解析：myst-parser → mdast；插件注册的指令把指令节点转为 IR 节点
        ▼
   编译步骤（按顺序执行的 IR 变换）
        │  切分章节 → 划分讲解与上屏内容 → 编排步骤 → 插件步骤（如解析代码锚点）→ 执行代码并缓存 → 校验
        ▼
   IR（JSON，版本化）
        │
        ├── web       IR 运行时（浏览器内动态渲染）+ VitePress 外壳；主媒介，支持全部节点
        ├── slides    Slidev 幻灯片（可选的高保真渲染端：导出 PDF、绘图、录制）
        ├── notebook  Jupyter .ipynb
        └── 其他渲染端（插件提供）
```

- 所有媒介都从 IR 生成，没有任何媒介直接读取源码。
- 编辑只在源码中进行；渲染产物不回写源码。
- 网页渲染端是参考实现，必须支持全部 IR 节点；其他渲染端可以只支持子集，不支持的节点按第 6 节的降级规则处理。

## 2. 源语法

源语法是 MyST Markdown（CommonMark + 指令 + 角色），由 `myst-parser` 解析。在此之上，Presmium 只增加以下约定。

### 2.1 文档头

入口文件以 YAML frontmatter 开头：

```yaml
---
title: BPE 分词
lang: zh-CN                    # 文稿的语言：两种形态的 <html lang> 与界面语言
plugins:                       # 插件包名
  - '@presmium/slidev-addon-code'
  - '@presmium/slidev-addon-exec'
presmium:                      # 各插件的全局配置，键为插件 ID
  presmium.code: { repo: https://github.com/org/repo }
renderers:                     # 要构建的渲染端及其配置
  web: {}
  slides: { theme: default }
execute: { rerun: environment } # 可选：另一运行环境的执行录制重新执行（第 4 节）
---
```

多文件文稿用 MyST 的 `{include}` 指令引入。`renderers` 列出的渲染端就是 `presmium build` 默认构建的渲染端（第 7 节）；网页渲染端的选项见 `packages/web/src/domain/config.ts`，其中 `lang` 可以覆盖文稿的语言。

### 2.2 章节

- `#` 是文稿标题或分章标题，`##` 开始一个章节（可由 `sectionDepth` 配置）。第一个 `##` 之前的内容构成封面章节。
- 一个章节对应幻灯片的一页、网页的一节、notebook 中以标题开头的一组单元格。
- 章节 ID 取自标题前的 MyST 标签 `(bpe-merge)=`；没有标签时由标题生成。章节 ID 是形态切换、笔记挂载、深链接的依据，一经发布不应改变。

### 2.3 文档优先：讲解与上屏内容

源码读起来是一篇讲义。章节中的每个块要么是**讲解**，要么是**上屏内容**：

| 块 | 角色 |
|---|---|
| 普通段落、列表、引用 | 讲解 |
| `:::{slide}` 包裹的内容 | 上屏内容 |
| 代码块、`{code-ref}`、图片、表格、公式、图表、插件指令 | 上屏内容 |

各媒介的呈现：

| 媒介 | 上屏内容 | 讲解 |
|---|---|---|
| 网页 | 按原顺序显示 | 按原顺序显示为正文 |
| 幻灯片 | 显示在页面上 | 成为演讲备注，按步骤切分 |
| notebook | Markdown 或代码单元格 | Markdown 单元格 |

### 2.4 步骤

- 上屏内容默认在第 0 步就显示。
- 指令选项 `:reveal:` 让该块在下一步出现；`{slide}` 上的 `:reveal: items` 让列表逐项出现。
- 占用多步的块有 `span + 1` 个内部状态，第 k 个状态（从 0 开始）在第 `at + k` 步显示：
  - `{code-ref}` 的 `:steps: a, b, c` 在 `at`、`at + 1`、`at + 2` 依次高亮三个逻辑单元，`span` 为 2；
  - `:reveal: items` 的列表在 `at` 显示第一项，之后每步多显示一项，`span` 为项数减一；
  - 组件用 `:span:` 声明内部步数。
- 占用多步的块如果没有 `:reveal:`，从当前已用到的最后一步开始，使它的内部步骤排在前面已出现的块之后。
- 讲解绑定到它前面最近的上屏块：第 1 段属于该块出现的那一步（`at`），第 2 段属于 `at + 1`，依此类推；超出 `span` 的段落都属于最后一步 `at + span`。不占多步的块（`span` 为 0），其后的讲解都属于 `at`。作者因此可以每步写一段讲解。
- 第一个上屏块之前的讲解属于第 0 步。
- `{slide}` 或 `{only}` 上的 `:reveal:` 作用于其中的全部内容：整个块作为一个整体在下一步出现。

### 2.5 媒介限定与提示

```md
:::{only} web, notebook
只在网页和 notebook 中出现的补充推导。
:::

:::{hints}
slides: { layout: two-cols }
web: { layout: scrolly }
:::
```

`{hints}` 放在章节内，为各渲染端提供排版提示；渲染端不认识的提示直接忽略。

```md
:::{config}
presmium.exec: { timeoutMs: 30000 }
:::
```

`{config}` 放在章节内，为插件提供只在本章节生效的配置：正文为 YAML 映射，键为插件 ID，值也须是映射（否则报错），存为章节的 `config`。

- 位置：章节顶层，或章节内的 `{slide}`、`{only}` 中；不生成块，也不占步骤。放在第一个 `##` 之前时属于封面章节。
- 合并：同一章节的多个 `{config}` 按源码顺序合并，同一插件的选项后写的覆盖先写的。编译器在转换本章节的块之前读取它们，所以章节中任何位置的指令都看到完整的章节配置。
- 生效：在该章节中合并在文稿头部的全局配置之上，交给指令（`DirectiveContext.config`）与编译步骤（`PassContext.configFor(section)`）；浏览器端用 `useSectionConfig(<插件 ID>)` 读取。幻灯片渲染端把它写入该页 frontmatter 的 `presmium`，封面章节的写入 `presmiumSection`（封面页的 frontmatter 就是 Slidev 文稿的头部，其中的 `presmium` 已是全局配置）；网页形态从 IR 读取（`architecture.md` 5.2 节）。

### 2.6 示例

````md
(bpe-merge)=
## 合并最频繁的字节对

BPE 每一轮找出出现次数最多的相邻字节对，把它合并成一个新符号。

:::{slide}
:reveal: items
- 统计相邻字节对
- 合并出现最多的一对
:::

```{code-ref} region:src/bpe.py#merge
:steps: count, merge
:run:
```

第一步统计次数，`counts` 的结果显示在代码下方。
````

## 3. IR

IR 是一个 JSON 文档。顶层结构：

| 字段 | 含义 |
|---|---|
| `ir` | IR 版本，当前为 `1` |
| `meta` | 标题、入口文件、语言等 |
| `config` | 插件列表、插件配置、渲染端配置 |
| `sections` | 章节列表 |
| `diagnostics` | 编译中产生的诊断（`Finding`） |

每个章节包含 `id`、`index`（从 1 开始）、`title`、`source`（源码位置）、`steps`（步骤数）、`hints`（按渲染端分组的提示）、`blocks`，以及可选的 `config`（`{config}` 给出的插件配置，键为插件 ID）。

每个块包含：

| 字段 | 含义 |
|---|---|
| `id` | 块 ID，章节内唯一且稳定 |
| `role` | `visual`（上屏内容）或 `narration`（讲解） |
| `at` | 出现的步骤；讲解为其绑定的步骤 |
| `until` | 可选，消失的步骤 |
| `only` | 可选，限定的渲染端 ID 列表 |
| `source` | 源码位置 |
| `node` | 节点内容，见下表 |

节点类型：

| 类型 | 内容 |
|---|---|
| `markdown` | 一棵标准 mdast 子树：段落、列表、表格、公式、图片等 |
| `code` | 语言、代码文本；可选 `origin`（锚点、文件、行区间、锁定提交、永久链接、解析状态、逻辑单元）、`highlight`（每一步高亮的行集合）、`run`（执行规格）、`outputs`（录制的执行结果） |
| `component` | 插件组件：插件 ID、组件名、属性、子块；`fallback` 为静态渲染端使用的 mdast |

IR 只记录语义与已经计算好的结果（例如逻辑单元换算出的高亮行、录制的输出），不记录任何媒介专属的语法。

## 4. 编译步骤

编译步骤（pass）是 IR 上的有序变换。内置步骤：

| 顺序 | 步骤 | 作用 |
|---|---|---|
| 1 | 解析 | 剥离 frontmatter，`myst-parser` 解析，把脚注定义放回书写处，处理 `{include}` |
| 2 | 切分章节 | 按标题切分，生成章节 ID |
| 3 | 指令转换 | 调用各插件注册的指令，把指令节点转为 IR 节点 |
| 4 | 划分角色 | 按 2.3 节判定讲解与上屏内容 |
| 5 | 编排步骤 | 按 2.4 节计算 `at`、`until` 与章节步骤数 |
| 6 | 插件步骤 | 各插件注册的变换，例如解析代码锚点、计算高亮行 |
| 7 | 执行 | 执行带 `run` 的代码节点，结果写入 `outputs`，并写入执行缓存 |
| 8 | 校验 | 按 IR schema 校验，产生诊断 |

### 执行缓存

- 缓存键为 `语言 + 代码 + 参数 + 执行器 ID + 环境指纹` 的哈希。
- 缓存目录为文稿目录下的 `.presmium/freeze/`，可以随文稿提交。提交后，任何人构建都得到相同的输出，也无需安装运行环境：没有对应执行器时使用已有的录制。
- 代码改动后只重跑受影响的节点；`presmium build` 删除文稿中已不存在的代码的录制。超时取决于机器而不是代码，不录制。
- 同一段代码已有另一运行环境（环境指纹不同，例如另一个解释器版本）的录制时，默认沿用它并给出警告，所有人构建得到相同的输出。文稿头部写 `execute: { rerun: environment }` 时，这类代码重新执行并替换录制。

## 5. 插件

插件在 Node 端的入口（`./presmium`）导出 `PresmiumNodePlugin`，与编译和渲染有关的字段：

| 字段 | 作用 |
|---|---|
| `directives` | 指令规格：名称、参数、选项、正文，以及转换为 IR 节点的函数 |
| `passes` | 编译步骤，声明在内置步骤 6 中的先后顺序 |
| `executors` | 编译时执行用的执行器（第 4 节“执行”） |
| `renderer` | 本插件提供的渲染端（第 6 节） |
| `rendererExtensions` | 按渲染端 ID 提供的扩展，例如 notebook 渲染端把某个组件转换为单元格 |

- 指令与编译步骤通过 `ctx.src`、`ctx.resolvers` 读取文件，编译器记录读过的文件与读取时的 git 版本；其他方式读取的文件用 `ctx.watch(...files)` 声明。`presmium dev` 在这些文件或命名该版本的 git 引用（`HEAD`、所在分支、`packed-refs`）变化时重新编译（K-09）。编译器只知道传给 `ctx.src`、`ctx.resolvers` 的版本名：插件若先把分支或标签名（如 `{code-ref}` 的 `:pin:`、`:variants:`）解析为提交再读取，要自己用 `ctx.watch` 声明这些名字对应的 git 引用文件，否则这些分支前进时不会重新编译。`presmium dev` 在一次编译所依赖的文件都被监听之后才报告这次编译；编译开始后改动、监听前未能察觉的文件，按修改时间补一次编译。
- 渲染端扩展的组件转换函数为 `(node, block, ctx)`，`ctx` 是正在运行的渲染端的 `RenderContext`（输出目录、工作目录、渲染端配置），例如据此写出相对于渲染产物的路径。编译器把 `ctx` 绑定后交给渲染端，渲染端以 `(node, block)` 调用。
- 浏览器端（网页、幻灯片）按 `component` 节点的组件名，查找插件注册的 Vue 组件。组件仍只依赖 `@presmium/host`。浏览器端的注册约定见 `architecture.md` 第 5 节。

### 5.1 指令一览

所有指令都接受 `:reveal:`（在下一步出现，`{slide}`、`{only}` 上还可写 `:reveal: items`）与 `:label:`（块 ID）。下表的“步数”是块的 `span`（2.4 节）。

内置指令（编译器）：

| 指令 | 参数与正文 | 选项 | 生成 |
|---|---|---|---|
| `{slide}` | 正文为 MyST | `:reveal:`、`:reveal: items` | 正文中的块都是上屏内容 |
| `{only}` | 参数为渲染端 ID 列表；正文为 MyST | `:reveal:`、`:reveal: items` | 正文中的块限定于这些渲染端（`only`） |
| `{hints}` | 正文为 YAML，键为渲染端 ID | — | 章节的 `hints` |
| `{config}` | 正文为 YAML，键为插件 ID | — | 章节的 `config`，在本章节合并在全局插件配置之上 |
| `{component}` | 参数为组件名；正文为 YAML 属性 | `:span:`（步数）、`:plugin:`（插件 ID，默认为注册该组件的插件）；其余选项作为属性，值按 YAML 读取 | `component` 节点 |
| `{include}` | 参数为文件路径 | — | 引入文件的内容；被引入文件的 frontmatter 被忽略 |
| `{code}`、`{code-block}`、`{code-cell}`、`{sourcecode}` | 参数为语言；正文为代码 | `:caption:` 或 `:filename:`（标题）、`:emphasize-lines:`（强调的行，如 `2, 4-5`，各步都高亮这些行）、`:run:`、`:executor:`、`:timeout:` | `code` 节点 |

代码块的 `:run:` 取 `compile`（默认，构建时执行并录制输出）、`live`（只在浏览器中执行）或 `both`；`:executor:` 指定执行器 ID；`:timeout:` 为毫秒。

插件指令：

| 插件 | 指令 | 参数与正文 | 选项 | 生成与步数 |
|---|---|---|---|---|
| 代码引用 `presmium.code` | `{code-ref}` | 参数为锚点，如 `region:src/bpe.py#merge` | `:pin:`（提交，默认工作区）、`:steps:`（逻辑单元名列表，即嵌套的 `#region`，每步高亮一个；`all` 或 `none` 表示这一步不突出任何单元）、`:variants:`（至少两个提交，逐步切换版本，不能与 `:pin:`、`:steps:` 同用）、`:lang:`（默认取文件扩展名）、`:repo:`（永久链接的仓库网址）、`:run:`、`:executor:`、`:timeout:` | `code` 节点，带 `origin`、`highlight` 或 `variants`；步数为单元数或版本数减一 |
| 浏览器执行 `presmium.exec` | `{run-panel}` | 参数为语言：`python`（默认）、`javascript`、`typescript`；正文为代码 | `:params:`（YAML 映射，注入程序的变量；JavaScript 中为常量）、`:timeout:`（毫秒）、`:recorded:`（执行失败或超时时显示的输出）、`:run:`（`both` 默认，同时在构建时录制；`live` 只在浏览器中执行） | `PmRunPanel`，子块为代码块；`fallback` 为代码加 `:recorded:` 的输出（不含构建时的输出，见 `architecture.md` 9.2 节）；notebook 中 Python 为代码单元格，其他语言为代码（JavaScript、TypeScript 前面加上参数常量）加输出的 Markdown 单元格。输出是构建时的输出；构建时没有执行、执行失败或超时的，有 `:recorded:` 时用它。带超时而构建时没有正常结束的代码单元格标记 `skip-execution` |
| | `{step-run}` | 参数为语言（默认 `python`）；正文为代码 | `:steps:`（执行的行数，每行一步）、`:params:`、`:timeout:` | `PmStepRun`；步数为 `:steps:` |
| 本地环境 `presmium.execLocal` | `{local-env}` | 参数为语言（默认 `python`）；正文为代码 | `:file:`（代码在工作区中的路径，必填）、`:workspace:`（devcontainer 所在目录，相对于本文件） | `PmLocalEnv`，子块为代码块；执行器 `presmium.container` 供代码块的 `:executor:` 使用 |
| 引导 `presmium.guide` | `{cursor}` | 正文每行一个路径点：`[move\|hover\|click] <CSS 选择器>`，动作默认为 `move` | — | `PmCursor`；第 k 个路径点在块的第 k 步，步数为路径点数减一 |
| | `{spotlight}`、`{hint}` | 参数为目标的 CSS 选择器；正文为弹出说明 | `:title:`（说明标题）、`:span:`（持续的步数，默认 0） | `PmSpotlight`、`PmHint` |
| 富内容 `presmium.content` | `{markmap}` | 正文为标题与列表；开头的 YAML 块可写 `markmap` 选项 | — | `PmMarkmap`，降级为嵌套列表 |
| | `{video}`、`{audio}`、`{animation}` | 参数为媒体文件路径（相对于本文件，或包路径）；正文为说明文字 | `:controls:`、`:autoplay:`、`:loop:`、`:muted:`、`:width:`、`:height:`、`:alt:`；`{animation}` 另有 `:still:`（减少动态效果时的静止图片） | `PmMedia`，降级为文件链接 |
| | ` ```plantuml ` 代码块（编译步骤） | — | 全局配置 `plantUmlServer` | 图片节点 |
| 发布 `presmium.publish` | 无指令；高对比度开关在两种形态的工具栏中，`{component} PmContrastToggle` 可以在正文中另放一个 | — | 全局配置 `offline: false` 关闭离线 | 编译步骤 `remote-assets` 把远程图片下载到 `.presmium/assets`（随文稿提交） |
| 讲台 `presmium.stage` | 无指令；内容由渲染端直接呈现 | — | — | 编译步骤 `footnotes` 把脚注定义移到引用它的块所在步骤与角色 |
| 课堂 `presmium.classroom` | `{quiz}` | 正文为题干（MyST），之后是任务列表形式的选项：`- [ ] 错误项`、`- [x] 正确项` | — | `PmQuiz`，属性为选项与答案；notebook 中为题干与选项，答案折叠 |
| | `{exercise}` | 参数为语言（默认 `python`，只有 Python 能校验）；正文为题面，之后两个代码块：起始代码、校验代码（每条顶层语句一项校验） | `:timeout:`（毫秒） | `PmExercise`；notebook 中为题面与两个代码单元格（起始代码、校验） |
| | `{question-box}` | 正文为提示语 | `:target:`（本章节中一个带标签的块，问题挂在它上面） | `PmQuestionBox`；notebook 中不生成单元格 |
| | `{pulse}` | 参数为问题（默认“这一节理解了吗？”）；正文为说明 | `:levels:`（至少两个选项，逗号分隔；默认“懂了、有点模糊、没懂”） | `PmPulse`；notebook 中不生成单元格 |
| 会话 `presmium.session` | 无指令 | — | 全局配置 `server`（课堂服务的地址，`ws://` 或 `http://` 均可）；没有时文稿照常放映，会话显示未连接 | 浏览器端提供 `session` 与 `classroomStore` 服务 |

课堂插件另有编译步骤 `classroom-places`：给每个课堂组件加上属性 `place`（所在章节与块的 ID、章节标题与序号，块 ID 在编排步骤之后才确定），并检查 `{question-box}` 的 `:target:` 是否是本章节的块。

脚注定义留在书写它的章节（以及 `{slide}`、`{only}`）中；引用与定义须在同一文件。

## 6. 渲染端

渲染端实现以下接口：

```ts
interface Renderer {
  id: string                                     // 'web' | 'slides' | 'notebook' | ...
  support(node: IRNode, extensions: RendererExtension[]): 'full' | 'degraded' | 'none'
  build(doc: IRDocument, ctx: RenderContext): Promise<RenderOutput>
  dev?(doc: IRDocument, ctx: RenderContext): Promise<RenderDevServer>   // update() 接收新的 IR
}
```

`RenderContext` 提供文稿目录 `deckDir`、文稿所在仓库的根目录 `workspaceRoot`（不在仓库中时为文稿目录）、输出目录 `outDir`、工作目录 `workDir`、本渲染端的配置、各插件的扩展与插件列表。渲染端发布插件配置时，把位于 `workspaceRoot` 内的绝对路径改为相对路径（网页相对于文稿目录，幻灯片相对于生成的 Slidev 文稿所在目录），产物因此不随检出位置变化（`architecture.md` 4.2 节）。工作目录存放渲染途中生成、跨次构建保留的文件：`build` 中为 `<文稿>/.presmium/<渲染端 ID>`，`dev` 中与输出目录相同；用到它的渲染端自行创建，并使它不进入 git。幻灯片渲染端把生成的 Slidev 文稿（`slides.md`）写在工作目录中，`slidev export` 与发布插件的导出、视觉差异都在这里进行；构建报告的每个输出都给出 `workDir`。

notebook 渲染端把 Markdown 写成 Jupyter 能显示的 CommonMark、GFM 表格、内联 HTML 与 `$` 公式，不写 MyST 语法：提示框（`{note}` 等）与旁注写成带粗体标题的引用块，`{list-table}` 等表格写成 GFM 表格，`{dropdown}` 写成 `<details>`，图写成图片加斜体标题，公式写成 `$$`，`{sub}`、`{sup}`、`{kbd}`、`{abbr}` 等角色写成内联 HTML，交叉引用写成它的文字。没有对应写法的节点（如 `{embed}`、`{iframe}`）保留其中的文字，并作为降级在构建报告中逐块列出（警告，带源码位置）。

notebook 渲染端把它显示的图片与链接所指向的本地文件（如本地化的 PlantUML 图、媒体的降级链接）复制到 notebook 旁边的 `media/` 并改写路径，notebook 目录可以整体移动。只复制实际写入 notebook 的地址所指的文件：组件由插件扩展或降级内容显示时，其子块中的文件不复制。地址按 URL 解码后查找文件（文件名中的 `#`、`?` 写作 `%23`、`%3F`），转义不完整的地址原样保留。

降级规则：

| 支持程度 | 渲染端的处理 |
|---|---|
| `full` | 正常渲染 |
| `degraded` | 渲染 `component` 节点的 `fallback`；没有 `fallback` 时渲染一行说明并附网页版链接 |
| `none` | 跳过，并在构建报告中列出 |

## 7. 命令

| 命令 | 作用 |
|---|---|
| `presmium build [--to web,slides,notebook] [--out dir]` | 编译并生成指定媒介；不写 `--to` 时生成文稿头部 `renderers` 中配置的渲染端，没有配置时生成全部已安装的渲染端 |
| `presmium dev [--to web]` | 监听源码与编译读取过的文件（第 5 节），增量编译，启动对应渲染端的开发服务器 |
| `presmium ir [--out file]` | 输出 IR JSON，用于调试 |
| `presmium check` | 编译到第 8 步，只输出诊断 |

## 8. 实时渲染与运行时视图

### 8.1 IR 运行时

`@presmium/viewer` 是浏览器中的 IR 运行时：它读取 IR，用 Vue 动态渲染章节与块，不经过任何 Markdown 生成或静态编译。

- `markdown` 节点：mdast 转为 hast 后渲染为 Vue 虚拟节点；代码高亮用 Shiki，公式用 KaTeX，图表在客户端渲染。
- `code` 节点：按 `highlight` 与当前步骤高亮行，显示录制输出；`run.when` 含 `live` 时接入执行面板。
- `component` 节点：按组件名从插件注册表中取 Vue 组件渲染；组件只依赖 `@presmium/host`。

### 8.2 运行时视图

同一份 IR 可以在运行时以不同视图呈现，切换视图不需要重新构建：

| 视图 | 说明 |
|---|---|
| `document` | 文档式：全部展开，讲解为正文（默认） |
| `scrolly` | 滚动叙事：上屏内容固定一侧，讲解滚动，步骤随滚动推进 |
| `present` | 放映：全屏逐章节、逐步骤；另开窗口为演讲者视图（当前步骤的讲解、下一步预告、计时） |

视图可插拔：插件包的 `src/client/viewer.ts` 默认导出视图插件 `ViewerPlugin`，通过 `registerView` 注册新视图，通过 `registerNodeRenderer` 为节点类型、`code:<语言>` 或组件名注册渲染器。约定见 `architecture.md` 5.1 节。

### 8.3 实时更新

```
保存源码 → presmium dev 增量编译受影响的章节 → 比较章节内容哈希
        → 通过 WebSocket 推送变化的章节 → 运行时替换这些章节并重渲染
```

- 不生成文件，不刷新页面；当前视图、章节、步骤与滚动位置保持不变。
- 编译诊断随推送一起到达，在页面上标出出错的章节。
- 目标：保存到画面更新 300 ms 以内（K-11）。

### 8.4 与 VitePress、Slidev 的关系

- **VitePress 是网页的外壳**：提供导航、侧栏、页内大纲、深色模式、移动端适配和搜索界面；页面正文由 IR 运行时渲染；搜索索引由网页渲染端从 IR 文本生成（每个章节一个文档），在开发与构建中都替换 VitePress 本地搜索的索引模块（`architecture.md` 9.1 节）。
- **Slidev 是可选的高保真渲染端**：用于导出 PDF、圈画标注、录制等 Slidev 擅长的功能；实时预览不依赖 Slidev。
