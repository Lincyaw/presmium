# 指令参考

每条指令给出：提供它的插件包（写进文稿头部 `plugins`）、插件 ID（`presmium:` 下的配置键）、参数、正文、选项、生成的 IR 与步数（`span`，步骤与讲解的对应规则见 `writing.md` 的步骤一段），以及一个最小示例。

所有指令都接受三个通用选项：

- `:reveal:`：块在下一步出现。`{slide}`、`{only}` 上写 `:reveal: items` 时其中的列表逐项出现。
- `:label:`：块 ID，等同于在块前写 `(名字)=`。
- `:audience:`：块只给这些受众（逗号分隔，如 `teacher`）；写在 `{slide}`、`{only}` 上时其中全部的块都是，嵌套时取交集。讲解段落要标受众时用 `{only}` 包起来。嵌在另一个指令正文中或列表项中的 MyST 指令（`{tab-item}`、`{card}`、`{note}` 中的 `{tip}`、列表项中的 `{code}`）也可以写，只去掉它自己，所在的块留下；写在 `{include}` 上时包含进来的全部内容都是，其中的标题照样开出章节，这些章节整节只给这些受众。`presmium build --audience student` 不输出受众不含 `student` 的块，见下文 `{audience}`。

选项值按指令声明的类型读取（`string`、`number`、`boolean`、`list`）；指令声明了选项时，写错的选项名得到警告 `unknown option`。

指令可以写成反引号代码围栏（```` ```{名字} ````）或冒号围栏（`:::{名字}`）。正文是 MyST 的指令（`{slide}`、`{only}`）习惯用冒号围栏；正文里还有代码围栏时，外层围栏要比内层多一个字符（例如外层四个反引号）。

## 内置指令（编译器，不需要插件）

### `{slide}`

正文为 MyST，其中的块都是上屏内容。选项：`:reveal:`、`:reveal: items`、`:at:`（非负整数，从 0 开始）、`:until:`（到该步骤隐藏，必须大于起始步骤）。`at` 不能与 `reveal` 合用；阅读形态展开内容，放映中按范围显示，回退时恢复。两个结果分别写 `:at: 0`、`:until: 1` 与 `:at: 1` 即可替换，不需要组件或播放器。

```md
:::{slide}
:reveal: items
- 统计相邻对
- 合并出现最多的一对
:::
```

列表逐项出现，`span` 为项数减一。

### `{only}`

参数为渲染端 ID 列表（`web`、`slides`、`notebook`，逗号或空格分隔）；正文为 MyST，其中的块只交给这些渲染端。嵌套时取交集。选项：`:reveal:`、`:reveal: items`、`:at:`、`:until:`（步骤范围语义同 `{slide}`）。

```md
:::{only} web, notebook
只在网页和 notebook 中出现的补充推导。
:::
```

缺少参数时报错 `needs the renderer ids it is limited to`；不认识的 ID（如拼错的 `slide`）得到警告 `unknown renderer id`。

### `{hints}`

正文为 YAML 映射，键为渲染端 ID，值也须是映射。不生成块，不占步骤。

```md
:::{hints}
web: { layout: scrolly }
slides: { layout: center, class: my-page }
:::
```

- `web.layout: scrolly`：网页中这一节用滚动叙事版式（上屏内容固定一侧，讲解滚动）。
- `slides.layout` 设这一页幻灯片的版式：`default`（章节名、标题与内容）、`cover`（封面，讲义有多页时第一页默认用它）、`center`（内容居中）、`full`（没有页脚，内容占满画布）；`slides.class` 给这一页加 CSS 类，`slides.zoom` 缩放这一页的内容（如 `0.8`）。内容多于画布时整体缩小到放得下。
- 渲染端不认识的提示直接忽略。

### `{config}`

正文为 YAML 映射，键为插件 ID，值须是映射；只在本章节生效，合并在头部 `presmium:` 的全局配置之上。放在章节顶层或章节内的 `{slide}`、`{only}` 中；不生成块，不占步骤。

```md
:::{config}
presmium.exec: { timeoutMs: 30000 }
:::
```

章节配置交给插件的指令（`DirectiveContext.config`）、编译步骤（`PassContext.configFor`）与浏览器端的 `useSectionConfig`。读取章节配置的选项：

- `presmium.exec: { timeoutMs }`：这一节的代码（`:run:` 的代码块、`{code-ref}`、`{run-panel}`、`{step-run}`）在编译时与浏览器中运行的超时；某一段代码自己的 `:timeout:` 优先。上例让一个慢的例子可以运行 30 秒。
- `presmium.code: { repo }`：这一节 `{code-ref}` 永久链接的仓库网址；`:repo:` 优先。

### `{audience}`

参数为受众名列表（逗号或空格分隔）；没有正文。放在章节顶层，把整个章节标为只给这些受众（例如教师指南的一节）；不生成块，不占步骤。只标一部分内容时用通用选项 `:audience:`。

```md
## 现场演示要点

:::{audience} teacher
:::

演示合并之前先断开网络。

## 合并规则

:::{only} web, slides
:audience: teacher
这一段只给教师：先在白板上画出两个分支。
:::
```

- 不带受众的内容对所有受众可见；不带 `--audience` 的构建包含全部内容。
- `presmium build --audience student` 编译时去掉受众不含 `student` 的章节与块（其余章节重新编号，步骤随之压缩），被去掉的代码不执行；构建后扫描写出的全部文件，被去掉的内容中 12 个字符以上的句子（学生内容自己也有的句子除外）出现在其中就是错误 `presmium.audience`，位置是被去掉的块，消息给出句子和文件（例如它经代码块的输出漏了进来）。
- `presmium check --audience student` 按学生版编译后检查。
- 学习者得到学生版的构建（`presmium build --audience student`，发布为静态站点）；`presmium serve` 只供你自己使用，看到全部内容。学生版发布录制的讲授时，只保留录制之后内容没有变化的章节（教师段落所在的章节、录制后有内容移入教师章节的章节，其讲话与音视频不发布）。
- 写了正文时警告 `takes no body`（正文被忽略，不会只给教师）；`{audience}` 或 `:audience:` 缺少受众名时报错，这时标的内容（`{audience}` 时整节）不给任何受众，只在不带受众的完整版中。
- 带 `--audience` 的构建不报告被去掉的内容中的诊断（它们会说出那些内容），只给一条计数 `<n> findings are in the content left out for student`；不带 `--audience` 的 `presmium check` 列出它们。
- 文稿的译本按同一受众编译，学生版的两种语言都没有教师内容。
- 指向只给教师的章节的 `{ref}` 在学生版中没有目标（构建时警告 `target not found`），学生内容中不要引用教师章节。
- 学生版的块 ID 与完整版相同，但章节序号与步骤重新编号：课堂跟随讲者时，讲者与学习者要用同一个版本。

插件的其他选项只读全局配置。

### `{component}`

参数为组件名（插件 `components/` 下的文件名）；正文为 YAML 属性。选项：`:span:`（内部步数）、`:plugin:`（插件 ID，默认为注册该组件的插件）；其余选项作为属性，值按 YAML 读取。

```md
:::{component} StepList
:span: 3
steps: [解析, 启动, 渲染]
:::
```

这里的 `StepList` 是文稿目录下 `components/StepList.vue` 中的组件（插件 ID `deck`），组件经 `@lincyaw/host` 取得步骤与服务；有动作的组件用 `useActions` 给动作起名，讲解中的 ``{cue to=<块>}`click <动作>` `` 在说到时执行它（下文“讲授的角色”）；插件的组件也可以这样放进正文，例如 `PmContrastToggle`（高对比度开关，`@lincyaw/addon-publish`），两种形态都渲染。没有插件注册该组件时警告 `no plugin in plugins registers the component`。

### `{include}`

参数为文件路径（相对于当前文件）。被引入文件的 frontmatter 被忽略（警告）。

````md
```{include} pages/intro.md
```
````

### `{literalinclude}`

以代码块显示一个文件（相对于当前文件），或其中几行；文件改动后重新编译。选项：`:language:`（默认按扩展名）、`:lines:`（如 `2, 4-6`）、`:start-line:`、`:end-line:`、`:start-after:`、`:end-before:`、`:start-at:`、`:end-at:`（按行号或按含某段文字的行截取，同 MyST）、`:caption:` 或 `:filename:`（标题）、`:emphasize-lines:`。文件不存在时报错。

````md
```{literalinclude} src/bpe.py
:start-after: def merge
:end-before: def encode
```
````

### `{code}`、`{code-block}`、`{code-cell}`、`{sourcecode}`

参数为语言；正文为代码。选项：`:caption:` 或 `:filename:`（标题）、`:emphasize-lines:`（各步都强调的行，如 `2, 4-5`）、`:run:`、`:executor:`、`:timeout:`（毫秒，默认取本章节的 `presmium.exec.timeoutMs`）、`:env:`、`:session:`、`:echo:`。`{code-cell}`（MyST notebook 的写法）同样生成代码块，`:run:` 照常执行。

````md
```{code} python
:run: both
print(sum(range(10)))
```
````

- `:run:` 取 `compile`（默认：构建时执行并录制输出）、`live`（只在浏览器中执行）、`both`。只写 `:run:` 等于 `compile`。
- `:executor:` 指定执行器 ID：`presmium.python`、`presmium.node`（执行插件）、`presmium.container`（本地环境插件）、`presmium.wasi`（WebAssembly 插件）。指定的执行器不可用时不改用别的执行器：浏览器中运行失败，显示录制输出与原因。
- `:env:` 选运行环境：头部 `execute.environments` 中的名字（编译为执行器 `presmium.env.<名>`），或保留名 `browser`（按语言选执行器）；不写时取头部的 `execute.env`。与 `:executor:` 同时写是错误；未声明的环境是错误，诊断在代码块的行上。
- `:session:` 会话名：同一会话的代码块共享解释器（前一块定义的变量后一块能用）。编译时按文稿中的顺序在同一个解释器中运行，改了其中一块整个会话重新执行；浏览器中每个页面、每个学习者各有一份，代码块旁的“重置会话”丢弃它。同一会话的块须在同一环境。
- `:echo: false`（须有 `:run:`）：只显示输出，不显示代码与运行控件；只输出 Markdown（`text/markdown`）时按正文显示，用于从数据生成表格与列表。与 `:run: live` 同用时警告并按 `compile` 执行。
- 富输出：Python 中 `display(obj)`（不必导入）与 `from IPython.display import Markdown, HTML, Image, SVG, Latex, JSON` 显示对象（按它的 `_repr_html_`、`_repr_markdown_`、`_repr_png_` 等）；matplotlib 的图在 `plt.show()` 与运行结束时显示为图片（matplotlib 要装在运行代码的环境中：浏览器中的 Python 只有标准库，导入其他模块的 `live`、`both` 代码块得到 `presmium check` 的警告，改用 `:run: compile` 或只用标准库）。最后一条语句是表达式时，它的值（不为 `None`）像在 Jupyter 中一样显示为输出。网页与幻灯片按类型显示（HTML 经清洗），notebook 把输出原样写进单元格。
- 普通代码围栏（```` ```python ````）不能带选项；要执行就写成 `{code}`。
- C、C++、Ruby、SQL（语言名 `c`、`cpp` 或 `c++`、`ruby` 或 `rb`、`sql`）：`plugins` 中列出 `@lincyaw/addon-exec-wasi` 后，这些代码块在编译时与浏览器中都由 WebAssembly 中的同一份运行时执行（C、C++ 先由 clang 8 编译，`-Werror`），构建机不需要编译器或解释器，网页离线也能运行；每次运行是独立的程序（不支持 `:session:`），SQL 在空的内存数据库中执行。C 中没有初值、也不是 `static` 的全局变量（如 `int stats[256][256];`）使程序以退出码 134 结束：写成 `static int stats[256][256];` 或给初值。发布的运行时旁边附有它们的许可证说明（`wasi/LICENSES`）。
- 带 `live` 或 `both` 的代码块在网页与幻灯片中都有运行按钮（C 等语言要列出 `@lincyaw/addon-exec-wasi`），录制的输出显示在它下方。没有分步高亮、也没有多个版本的这类代码块有“编辑代码”：在原处改代码（CodeMirror），Mod-Enter 或运行按钮运行改过的代码，“还原代码”恢复原样；改动只在这个页面里，不写回讲义。
- 写在插件组件里的代码块（执行面板等的正文）由组件运行，没有自己的运行按钮与录制输出。

### `{grid}`、`{grid-item}`、`{card}`、`{tab-set}`、`{tab-item}` 与 `{button}`

MyST 标准的卡片、栅格、选项卡与按钮（mystmd 的 `myst-ext-card`、`myst-ext-grid`、`myst-ext-tabs`、`myst-ext-button`），编译器内置，用于课程首页与导读页。它们是上屏内容。

`````md
::::{grid} 1 1 2 3
:::{card} 第 1 周：智能体环路
:link: week-01/
读、想、做的循环。
+++
{button}`进入讲义 <week-01/>`
:::
:::{card} 第 2 周：上下文
页眉
^^^
上下文窗口里放什么。
:::
::::

::::{tab-set}
:::{tab-item} Python
:sync: py
用 `print` 输出。
:::
:::{tab-item} JavaScript
:sync: js
用 `console.log` 输出。
:::
::::
`````

| 写法 | 参数与选项 |
|---|---|
| `{grid}` | 参数为四档屏宽（手机、576px 起、768px 起、992px 起）的列数，1 到 4 个数，少写时最后一个数用于更宽的屏幕，默认 `1 2 2 3`；`:class:` |
| `{grid-item}` | 栅格中的一格；`:columns:` 占一行 12 份中的几份；`:class:` |
| `{card}` | 参数为标题；`:link:`（整张卡片链接到的地址，可以是本地文件，随讲义发布）、`:header:`、`:footer:`；正文中 `^^^` 之前为页眉，`+++` 之后为页脚 |
| `{tab-set}`、`{tab-item}` | `{tab-item}` 的参数为标题；`:sync:` 同步键（选中它时页面上同一键的选项卡一起切换）、`:selected:` 开始时选中 |
| ``{button}`文字 <地址>` `` | 按钮样式的链接；没有 `<地址>` 时只是按钮样式的文字（不能点） |

各媒介：网页完整显示（栅格按屏宽分列，选项卡可切换）；幻灯片中卡片与栅格照常显示（列数取最宽一档），选项卡依次展开为带标题的几段；notebook 中卡片标题与选项卡标题成为小标题（`####`），其余为段落，按钮为链接，构建报告列出这些降级（`degraded in the notebook, which has no Jupyter form for grid, card`）。

### 其他 MyST 指令

MyST 自带的指令（`{note}` 等提示框、`{figure}`、`{math}`、`{list-table}`、`{dropdown}` 等）作为上屏内容保留标准 mdast。```` ```mermaid ```` 代码块由渲染端绘制。未注册、也不是 MyST 指令的名字报错 `unknown directive; is the plugin that provides it listed in plugins?`。

## 代码引用 `presmium.code`（`@lincyaw/addon-code`）

### `{code-ref}`

参数为锚点；没有正文。

| 选项 | 类型 | 作用 |
|---|---|---|
| `:pin:` | string | 读取的提交（哈希、分支或标签）；省略时读工作区 |
| `:steps:` | list | 逐步高亮的逻辑单元名（锚点内嵌套的 `#region`），每步一个；`all`、`none` 表示这一步不突出任何单元 |
| `:variants:` | list | 至少两个提交，逐步切换版本；不能与 `:pin:`、`:steps:` 同用 |
| `:lang:` | string | 高亮语言，默认取文件扩展名 |
| `:repo:` | string | 永久链接用的仓库网址，默认本章节的 `presmium.code.repo`（`{config}` 可按章节设置），再默认 `origin` 远端 |
| `:run:`、`:executor:`、`:timeout:`、`:env:`、`:session:` | | 同 `{code}` |

步数：`:steps:` 或 `:variants:` 的项数减一。

锚点（文件路径相对于文稿所在 git 仓库的根目录，不在 git 中时相对于文稿目录；按文稿目录写错时诊断给出正确的写法）：

- `region:<文件>#<区间名>`：`#region 名字` 与 `#endregion 名字` 两行注释之间的代码（`# #region`、`#region`、`// #region`、`<!-- #region -->` 等 VS Code 折叠区间的写法都认）。标记行不显示，公共缩进去掉。
- `symbol:<文件>#<名字>`：按语法树找声明，如 `Parser.parse`；支持 TypeScript、JavaScript、Python，被引用的代码不需要标记。
- `pattern:<文件>#<ast-grep 模式>`：匹配 ast-grep 模式的代码，如 `pattern:src/cart.ts#if (prices.length === 0) $$$`。

````md
```{code-ref} region:src/bpe.py#merge
:pin: dd64ade
:steps: count, replace
```
````

被引用文件中的嵌套区间：

```python
# #region merge
def merge(ids, pair, new_id):
    # #region count
    ...
    # #endregion count
    # #region replace
    ...
    # #endregion replace
# #endregion merge
```

诊断：`presmium.code.anchors`（锚点丢失为错误，模糊匹配为警告，移动为提示）、`presmium.code.drift`（锁定提交之后工作区的代码变了，警告并附差异）、`presmium.code.syntax`（参数不是锚点、`:variants:` 少于两个等）。本地代码没有远端仓库时正常显示，只是不提供永久链接，不产生诊断。

## 浏览器执行 `presmium.exec`（`@lincyaw/addon-exec`）

浏览器中 Python 由 Pyodide 执行，JavaScript、TypeScript 由脚本 Worker 执行；编译时执行用本机的 `python3` 与 `node`。语言名 `py`、`python3`、`ipython` 都是 Python，`js`、`mjs` 是 JavaScript，`ts` 是 TypeScript。全局配置 `presmium.exec`：`timeoutMs`（默认 10000，也可以在某一节的 `{config}` 中设置）、`loadTimeoutMs`（默认 30000）、`maxTraceEvents`（默认 500）、`pyodideURL`。

### `{run-panel}`

参数为语言：`python`（默认）、`javascript`、`typescript`，或其他有执行器的语言（如 WebGPU 插件的 `wgsl`，见下文“浏览器 GPU”）；正文为代码。

| 选项 | 类型 | 作用 |
|---|---|---|
| `:params:` | string | YAML 映射，注入程序的变量（JavaScript 中为常量），观众可改后重跑；其他语言由执行器读取（如 `wgsl` 的缓冲区与派发），值可以是列表与映射，表单中显示为 JSON |
| `:timeout:` | number | 毫秒；默认本章节的 `presmium.exec.timeoutMs` |
| `:recorded:` | string | 执行失败或超时时显示的预录输出 |
| `:run:` | string | `both`（默认，构建时也录制输出）或 `live`（只在浏览器中执行） |
| `:env:`、`:session:` | string | 同 `{code}`：运行环境与执行会话 |

````md
```{run-panel} python
:params: {n: 4}
:recorded: 0 1 4 9
print(*[i * i for i in range(n)])
```
````

生成 `PmRunPanel`，步数 0。面板的顶栏写明语言与在哪里运行（如“Python · 浏览器中运行”；`:env:` 的环境按它的 `kind` 写明），参数与运行按钮也在顶栏；运行后输出标明耗时（“输出 · 0.02 秒”），幻灯片上宽度够时在代码旁边。现场运行没能进行（没有运行时、没有 GPU 适配器、超时）而面板没有 `:recorded:` 时，显示构建时录制的输出并写明原因。PDF、PNG 导出显示先给参数赋值的代码，加上构建时的输出（构建时没有执行、执行失败或超时的用 `:recorded:`）；notebook 中与内核同语言（默认 Python）的为代码单元格（参数赋值在前），其他语言为代码加输出的 Markdown 单元格。

### `{step-run}`

参数为语言（默认 `python`；逐行追踪由 Pyodide 实现，只支持 Python）；正文为代码。

| 选项 | 类型 | 作用 |
|---|---|---|
| `:steps:` | number | 执行的行数，每行一步；缺少时警告，没有步骤 |
| `:params:` | string | 同 `{run-panel}` |
| `:timeout:` | number | 毫秒 |

````md
```{step-run} python
:steps: 4
total = 0
for x in [1, 2, 3]:
    total += x
print(total)
```
````

生成 `PmStepRun`，步数为 `:steps:`。网页的文档视图中组件有自己的上一步、下一步与滑块，读者可以逐行查看；网页中组件接近屏幕时才加载 Python 运行时。

## 本地环境 `presmium.execLocal`（`@lincyaw/addon-exec-local`）

### `{local-env}`

参数为语言（默认 `python`）；正文为代码。在仓库的 devcontainer 中运行（需要 Docker 与 `presmium dev`），并可导出代码与运行环境。

| 选项 | 类型 | 作用 |
|---|---|---|
| `:file:` | string | 必填：代码在工作区中的路径 |
| `:workspace:` | string | devcontainer 所在目录，相对于本文件；默认 `presmium.execLocal.workspace`，再默认文稿的 git 根目录 |

````md
```{local-env} python
:file: src/hello.py
print("hello")
```
````

生成 `PmLocalEnv`；它还提供执行器 `presmium.container`，供代码块的 `:executor:` 使用。在容器中运行需要 Docker 与 Presmium 的服务端（`presmium dev` 或 `presmium serve`，网页与幻灯片都可以；运行与环境复刻是插件 `presmium.execLocal` 的服务端路由，编辑者可用，运行先经 `operate` 确认）；面板上没有把代码提交回仓库的按钮；每次运行是新的容器，工作目录是这次运行自己的目录，工作区只读挂载在 `/workspaces/<目录名>`，其中的模块可以导入。一份文稿只有一个工作区：各 `{local-env}` 指定不同的 `:workspace:` 时报错。全局配置 `presmium.execLocal`：`workspace`、`priority`（默认 10，高于浏览器执行器）、`buildTimeoutMs`（构建 devcontainer 镜像的时限，默认 600000）。

## 浏览器 GPU `presmium.execWebgpu`（`@lincyaw/addon-exec-webgpu`）

没有自己的指令：它为 `{run-panel} wgsl` 提供 WebGPU 计算着色器的执行器（浏览器中运行，构建时在 Playwright 的 Chromium 中录制），并让 JavaScript、TypeScript 代码能导入 jax-js。要和执行插件一起列在 `plugins` 中。

````md
```{run-panel} wgsl
---
params:
  buffers:
    a: [1, 2, 3, 4]
    b: [10, 20, 30, 40]
    out: { size: 4 }
  dispatch: 1
  repeat: 10
---
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&out)) { out[id.x] = a[id.x] + b[id.x]; }
}
```
````

- `:params:` 的键：`buffers`（必填：着色器中每个 `var<storage>`、`var<uniform>` 按变量名给出数据列表，或 `{ data, size, fill, type, read }`；组、绑定、读写与类型 `f32`、`i32`、`u32` 取自着色器）、`dispatch`（每个维度的工作组数，1 到 3 个数，默认 1）、`entry`（入口函数，默认唯一的计算入口）、`repeat`（运行次数，默认 1，至多 1000，计时取中位数）、`features`（需要的适配器特性，如 `[shader-f16]`）。全部缓冲区至多 128 MiB。
- 输出：可写的存储缓冲区（`read_write`）读回后每个一行，如 `out: f32[4] = [11, 22, 33, 44]`（长的显示首尾与最小、最大、平均），再加每次派发的时间与适配器；在 CPU 模拟的回退适配器（SwiftShader）上计时注明“CPU 模拟”。构建时录制的输出按文稿的 `lang`（默认中文）。
- 浏览器没有 WebGPU、没有 GPU 适配器、缺少特性或限制、设备丢失或超时时，面板显示构建时录制的输出与原因（如“预录输出 · 没有可用的 GPU 适配器”）；着色器的错误照常显示为错误。
- 构建时：有显卡时 Chromium 经 Vulkan 用显卡，否则用 SwiftShader；`execute.environments` 中声明 `cpu: { kind: webgpu, adapter: swiftshader }` 并写 `:env: cpu`，任何机器上录制都相同（`adapter` 还可以是 `auto`、`gpu`）。没有安装 Playwright 的 Chromium 时不录制，沿用已有的录制。
- Python（Pyodide）中运行同样的着色器：`import presmium_gpu as gpu`，`result = await gpu.run(SHADER, buffers={'a': [1, 2], 'b': [3, 4], 'out': {'size': 2}}, dispatch=1)`（代码块顶层可以 `await`），`result['out']` 是读回的列表，`print(result)` 显示与面板相同的摘要（英文）；Chromium、Firefox 等有 JSPI 的浏览器另有同步写法 `gpu.run_sync(...)`。规模限制与面板相同（缓冲区共 128 MiB，`repeat` 至多 1000），超出时抛出 `ValueError`；不能运行时抛出 `presmium_gpu.GPUUnavailable`。这样的代码块写 `:run: live`（构建时的 Python 没有 WebGPU）。
- JavaScript、TypeScript 中 `import { init, defaultDevice, numpy as np } from '@jax-js/jax'` 使用 jax-js（张量与自动微分；`await init()` 之后 `defaultDevice('webgpu')` 在 GPU 上计算，没有 WebGPU 时默认用 WebAssembly）。jax-js 随产物发布，第一次导入时加载；这样的代码块写 `:run: live`。
## 远端环境 `presmium.execJupyter`（`@lincyaw/addon-exec-jupyter`）

提供 `kind: jupyter` 的具名环境：任何 Jupyter Server（`templates/env/compose/` 的 docker compose 模板、JupyterHub、agent-sandbox 等）。头部声明环境，代码块用 `:env:` 选择，构建时与浏览器中都在它的内核中运行：

```yaml
execute:
  environments:
    lab: { kind: jupyter, auth: proxy, kernel: python3, image: 'quay.io/jupyter/base-notebook:2026-10-12@sha256:…' }

- `auth`（默认 `env`）：`env` 只在构建时可用；`proxy` 在浏览器中经 Presmium 服务端（`presmium dev` 与工作区服务）的代理连接（静态产物中显示录制输出）；`prompt` 连接文稿的 `url`，学习者在页面上粘贴自己的令牌（只存在本页的 `sessionStorage` 中，用于已发布的静态站点）；`none` 连接 `url`，不带令牌；`hub` 预留。JupyterHub 的用户服务器写 `url: https://hub.example.edu/user/{user}/`。
- 凭据不写在文稿中：构建与代理用运营者的一对环境变量 `PRESMIUM_ENV_<名>_URL`、`PRESMIUM_ENV_<名>_TOKEN`（名字大写，其他字符变为 `_`）。文稿写的 `url` 与运营者的地址不同源时不连接，是错误；没有地址时不发送令牌。
- 会话（`:session:`）是一个内核：每个页面、每个学习者各自一个；`image` 进入环境指纹。`:run: both` 的输出在构建时录制，浏览器中运行的结果与它相同。
- `presmium check --env` 连接每个环境，连不上是错误。

### `{terminal}`

参数为 `kind: jupyter` 的环境名；没有正文。打开该 Jupyter Server 的一个终端（xterm.js），凭据方式同环境；读者点“打开终端”后连接。

| 选项 | 类型 | 作用 |
|---|---|---|
| `:height:` | number | 行数，默认 16 |

```md
:::{terminal} lab
:height: 12
:::

生成 `PmTerminal`。环境不存在或不是 `kind: jupyter` 时报错（`presmium.execJupyter`）。静态产物中 `proxy` 方式的终端显示说明而不连接，`prompt` 方式照常可用；notebook 中不生成单元格，PDF 等静态导出显示一行说明。

## 引导 `presmium.guide`（`@lincyaw/addon-guide`）

目标用 CSS 选择器指定，通常是同一章节中你自己写的 HTML 元素的 `id`。

### `{cursor}`

没有参数；正文每行一个路径点：`[move|hover|click] <CSS 选择器>`，动作默认 `move`。第 k 个路径点在块的第 k 步。

```md
:::{cursor}
:reveal:
#query
hover #run
click #run
:::
```

生成 `PmCursor`，步数为路径点数减一。正文为空时报错。

### `{spotlight}`、`{hint}`

参数为目标的 CSS 选择器；正文为弹出说明。选项：`:title:`（string，说明标题）、`:span:`（number，持续的步数，默认 0）。`{spotlight}` 聚光，`{hint}` 是脉动提示。

```md
:::{spotlight} #output
:reveal:
:title: 结果
每个色块是一个词元。
:::
```

生成 `PmSpotlight`、`PmHint`，步数为 `:span:`。缺少参数时报错。

## 富内容 `presmium.content`（`@lincyaw/addon-content`）

公式（`$…$`、`$$…$$`）与 ```` ```mermaid ```` 由渲染端绘制，不需要指令。全局配置 `presmium.content.plantUmlServer`：PlantUML 服务地址。```` ```plantuml ````（或 `puml`）代码块由编译步骤变成图片。

### `{markmap}`

正文为 Markdown 标题与列表，绘制为思维导图；开头的 YAML 块可写 `markmap:` 选项。没有指令选项。

`````md
````{markmap}
---
markmap:
  colorFreezeLevel: 2
---
# 主题
## 分支
- 叶子
````
`````

生成 `PmMarkmap`，不能绘图的渲染端显示为嵌套列表。

### `{video}`、`{audio}`、`{animation}`

参数为媒体文件路径（相对于本文件，或包路径如 `@lincyaw/addon-content/media/clip.webm`，或 `http(s)://` 网址）；正文为说明文字。

| 选项 | 类型 |
|---|---|
| `:controls:`、`:autoplay:`、`:loop:`、`:muted:` | boolean |
| `:width:`、`:height:` | number |
| `:alt:` | string |
| `:still:`（只有 `{animation}`） | string：减少动态效果时显示的静止图片 |
| `:poster:`（只有 `{video}`） | string：封面图片，播放前显示 |
| `:captions:`（只有 `{video}`） | string：逗号分隔的 `语言=VTT 文件`，如 `en=films/loop.en.vtt, zh-CN=films/loop.zh.vtt`；字幕的标签是语言的名称（按界面语言） |
| `:captions-default:`（只有 `{video}`） | string：开始时显示的字幕语言；省略时不默认显示字幕 |

````md
```{video} media/demo.webm
:controls:
:poster: media/demo.jpg
:captions: en=media/demo.en.vtt, zh-CN=media/demo.zh.vtt
:captions-default: zh-CN
演示录像。
```
````

生成 `PmMedia`，降级为文件链接。封面与字幕文件和媒体文件一样相对于本文件，随每种媒介发布。媒体、静止图片、封面或字幕文件不存在时报错 `file not found`，诊断在指令的行上。notebook 中有封面或字幕的视频写成带 `poster` 与 `<track>` 的 `<video>`（文件复制到 `media/`），其他媒体写成文件链接。

### `{youtube}`

参数为 YouTube 视频 ID 或链接；正文为说明文字。选项：`:start:`（秒）、`:width:`、`:height:`（number）。

````md
```{youtube} https://www.youtube.com/watch?v=dQw4w9WgXcQ
:start: 30
```
````

生成 `PmYoutube`，降级为视频链接。

## 动画 `presmium.motion`（`@lincyaw/addon-motion`）

用代码写的动画：GSAP、Anime.js、Motion、Three.js、Remotion 或 D3 的一条时间轴，按步骤与讲授的时间播放。现场放映时前进一步就演这一步的那一段，后退显示停定的画面；讲授回放与导出视频时动画跟着讲解的时刻走，同一时刻的画面总是相同。

### `{scene}`

参数为场景名：文稿目录 `scenes/` 下的文件去掉扩展名（`.ts`、`.js`、`.mjs`），可以带子目录，如 `bpe/merge`；正文为说明文字（无障碍描述，也是 notebook 与静态导出中显示的内容）。

| 选项 | 类型 |
|---|---|
| `:durations:` | list：每一步的时长，写法同 `{cue}` 的 `pause`（`1.2`、`1.2s` 是秒，`800ms` 是毫秒）；第 k 个是块的第 k 步。省略时只有一步、时长 0 |
| `:aspect:` | string：宽高比，默认 `16/9`（也可写 `4:3`） |
| `:height:` | string：CSS 高度（如 `360px`），给出时不按宽高比 |
| `:still:` | string：静止图片（相对于本文件），notebook 与静态导出中显示 |

```md
(bpe)=
:::{scene} bpe-merge
:durations: 1.2, 1.2, 1.4
三个词的字节对合并：先合并 l 与 o，再合并 lo 与 w。
:::

字节对编码从单个字符开始。

统计相邻的字节对，出现最多的是 l 和 o。

把它们合并成新符号 lo。
```

块占的步数是时长的个数减一，讲解逐段对应这些步（`writing.md` 的步骤一段；与讲授时间的对齐见 `presmium-animate/references/timeline.md`）。合成讲授时，一步至少停留到它的动画演完；讲解中的 ``{cue}`next` `` 照常在它的字处推进，早于动画演完时构建给出警告 `moves on … before the animation`，把提示标记往后挪或缩短 `:durations:`。

场景文件默认导出一个场景（`@lincyaw/addon-motion/scene`）；各个库由插件提供，文稿不必另外安装。每个场景得到 `root`（画面的元素）、`at(k)`（第 k 步在时间轴上开始的毫秒数）、`durations`、`total`、`width`、`height` 与 `color(名)`（设计系统的颜色，如 `color('accent')`，返回 `rgb()` 或 `rgba()`）：

| 写法 | 返回 | 时间单位 |
|---|---|---|
| `gsapScene(({ root, gsap, plugins, at }) => …)` | GSAP 的时间轴（在以 `root` 为范围的 `gsap.context` 中建立，选择器只找场景中的元素）；`plugins` 中的 SplitText、DrawSVG、MorphSVG、MotionPath、Text、CustomEase、CustomBounce、CustomWiggle、Physics2D、PhysicsProps、Flip 已注册 | 秒：`at(k) / 1000` |
| `animeScene(({ root, anime, at }) => …)` | Anime.js 的时间轴，如 `anime.createTimeline({ autoplay: false })` | 毫秒 |
| `motionScene(({ root, motion, at }) => …)` | `motion.animate(序列)`；同一元素的同一属性放在一个序列中（分开的动画在跳转时互相覆盖） | 秒 |
| `threeScene(({ THREE, renderer, addons, at, width, height }) => …)` | `{ render(ms), resize?(w, h), dispose?() }` 或只是 `render`；渲染器由插件建立并跟随画面大小；`addons` 有 CSS2DRenderer、CSS2DObject、Line2、LineGeometry、LineMaterial、ParametricGeometry、RoundedBoxGeometry、ConvexGeometry | 毫秒 |
| `remotionScene(({ React, remotion, at }) => …)` | `{ component, fps, width, height }`：Remotion 的组件，用 `React.createElement` 写（场景文件不能写 JSX：幻灯片形态按 Vue 编译 JSX），按时刻画出对应的帧 | 帧 |
| `d3Scene(({ root, d3, at }) => …)` | 按时刻画的函数 `(ms) => void`（或 `{ seek, resize?, dispose? }`）：D3 建好图形，用它的插值与缓动按时刻画；不用 `transition` | 毫秒 |
| `defineScene((ctx) => …)` | 自己的画法：一个 `(ms) => void`，或 `{ seek, resize?, dispose? }` | 毫秒 |

```ts
// scenes/bpe-merge.ts
import { gsapScene } from '@lincyaw/addon-motion/scene'

export default gsapScene(({ root, gsap, at }) => {
  root.innerHTML = '<span class="a">l</span><span class="b">o</span>'
  const tl = gsap.timeline()
  tl.from('.a, .b', { y: 20, opacity: 0, duration: 0.6 }, at(0) / 1000)
  tl.to('.b', { x: -12, duration: 0.5 }, at(1) / 1000)
  return tl
})
```

画面只能由时间轴上的位置决定：不要在场景中读页面时间、启动自己的循环或按真实时间播放。场景文件只能从 `@lincyaw/addon-motion/scene` 导入，不能直接导入 `gsap/…`、`three/addons/…` 等库的路径（文稿不依赖这些库），插件与扩展从上表的参数取得。选库、各库的写法与示例、让动画与讲解对齐，见 presmium-animate 技能。全部展开的文档视图显示终态，读者可以在场景下方播放与拖动。场景不存在报 `the deck has no scenes/<名>.ts`，时长写错报 `:durations: takes durations`，诊断在指令的行上。

## 课堂 `presmium.classroom`（`@lincyaw/addon-classroom`）

课堂组件需要会话插件 `@lincyaw/addon-session`（`presmium dev` 与 `presmium serve` 自带课堂同步；发布到静态托管时文稿头部写 `presmium.session.server`，见 presmium-present 技能）；`{exercise}` 的校验另需执行插件 `@lincyaw/addon-exec`。

### `{quiz}`

没有参数与选项；正文为题干（MyST），之后是任务列表形式的选项，`[x]` 标出正确项（可多个）。

````md
```{quiz}
BPE 每一轮合并哪一对？

- [ ] 最先出现的一对
- [x] 出现次数最多的一对
```
````

生成 `PmQuiz`；少于两个选项或没有正确项时报错。notebook 与导出的静态形式中为题干与按字母标注的选项（`A. …`，与现场测验相同），答案折叠，以字母给出。

### `{exercise}`

参数为语言（默认 `python`，只有 Python 能校验）；正文为题面，之后两个代码块：起始代码、校验代码（每条顶层语句一项校验）。选项：`:timeout:`（number，毫秒）。

`````md
````{exercise} python
写函数 `mean(xs)`，返回平均值。

```python
def mean(xs):
    return 0
```

```python
assert mean([1, 2]) == 1.5, "[1, 2] 的平均值是 1.5"
```
````
`````

生成 `PmExercise`；缺少校验代码块时报错。

### `{question-box}`

没有参数；正文为提示语。选项：`:target:`（string，本章节中一个带标签的块，问题挂在它上面）。

````md
(key-idea)=
:::{slide}
> 训练看次数，编码看先后。
:::

```{question-box}
:target: key-idea
哪里还不清楚？
```
````

生成 `PmQuestionBox`；notebook 中不生成单元格。`:target:` 不是本章节的块时，编译步骤 `presmium.classroom.places` 报错。

### `{pulse}`

参数为问题（默认“这一节理解了吗？”，英文文稿为英文）；正文为说明。选项：`:levels:`（string，至少两个选项，逗号分隔；默认“懂了、有点模糊、没懂”）。

````md
```{pulse} 这一节讲清楚了吗？
:levels: 懂了, 有点模糊, 没懂
```
````

生成 `PmPulse`；notebook 中不生成单元格。

### `{predict}`

先预测再揭示。参数为问题（必填）；正文为补充说明。选项：`:choices:`（string，至少两个，逗号分隔；省略时学习者写一段文字）。揭示内容是 `{predict}` 之后的下一步出现的全部内容：用 `:reveal:` 让它在下一步出现（通常是带 `:reveal:` 的 `{slide}`），这一步的讲解也算在内。

````md
:::{predict} 合并三轮之后，词表中有几个新符号？
:choices: 1, 2, 3
:::

:::{slide}
:reveal:
三个：每一轮新增一个符号。
:::

讲解：每一轮只合并出现最多的那一对。
````

生成 `PmPredict`；编译步骤 `presmium.classroom.predict-reveals` 把揭示内容移入它的子块（块 ID 与步骤不变），之后一步什么也不出现时警告。网页的文档视图中，读者保存预测之前不显示揭示内容；放映、演讲者视图与幻灯片按步骤显示（正文的补充说明在表单之前）。预测保存在本机浏览器；课堂中学习者的预测另交给主讲，“互动”面板按选项显示人数。notebook 中为问题、选项与折叠的揭示内容（`<details>`，其中的代码带编译时录制的输出）；幻灯片导出的 PDF、PNG 中揭示内容展开显示。

## 没有指令的插件

| 插件包 | 插件 ID | 作用 |
|---|---|---|
| `@lincyaw/addon-stage` | `presmium.stage` | 讲台：黑屏（`b`）、冻结（`f`）、画笔（`d` 或放映栏的“画笔”：四种墨水、橡皮、撤销、清除；演讲者与听众的窗口和课堂同步，由服务打开的页面把笔迹存进 `.presmium/drawings/`）；编译步骤 `presmium.stage.footnotes` 把脚注定义放到引用它的块旁 |
| `@lincyaw/addon-publish` | `presmium.publish` | 编译步骤 `presmium.publish.remote-assets` 把远程图片下载到 `.presmium/assets/`；高对比度开关；全局配置 `offline: false` 关闭离线缓存 |
| `@lincyaw/addon-session` | `presmium.session` | 课堂会话；全局配置 `server`（`ws://` 或 `http://`） |
| `@lincyaw/addon-exec-wasi` | `presmium.execWasi` | 在 WebAssembly 中运行 `c`、`cpp`、`ruby`、`sql` 的代码（执行器 `presmium.wasi`，见 `{code}`）；具名环境 `kind: wasi`（可写 `languages: [c]`）；全局配置 `loadTimeoutMs`（浏览器中下载运行时的时限，默认 120000）。只有浏览器中运行的代码（`:run: live` 或 `both`）让构建发布运行时（C、C++ 约 52 MB） |

## 行内角色

插件可以登记行内角色，写作 ``{名}`内容` ``，选项写成 `key=value`：``{cue to=code-1 lines=3-5}`spot` ``（只写键而不写值是语法错误）。登记过的角色在 IR 中保留为 `presmiumRole` 节点，网页、幻灯片与 notebook 显示它的子内容；没有子内容的角色（如提示标记）只在网页的演讲者窗口与幻灯片的演讲者备注中显示一个标记 `〔名 内容〕`。没有插件登记的角色压平为文字并给出警告 `unknown role`。MyST 自带的 `{sub}`、`{sup}`、`{kbd}`、`{abbr}` 等不受影响，插件不能登记同名的角色。

## 讲授的角色 `presmium.lecture`（`@lincyaw/addon-lecture`）

讲授插件登记两个行内角色，写在讲解中。讲解就是讲授的脚本：文稿头部写了 `renderers.lecture.voice` 时，`presmium build --to web,lecture` 把每一步的讲解经语音服务（`@lincyaw/addon-speech`，也要列在 `plugins` 中）合成为讲授 `script`，网页以 `?view=lecture&track=script` 播放。

```markdown
我们先看 {cue to=code-1 lines=3-5}`spot` 这三行，{cue}`next` 再把它合并成新符号。
运行一下 {cue to=code-1}`run` 看看结果。{say alias="B P E"}`BPE` 的词表就这样长出来。{cue}`pause 800ms`
```

| 角色 | 内容 | 选项 | 作用 |
|---|---|---|---|
| `{cue}` | 命令：`next`、`spot`、`hint`、`point`、`click <动作>`、`run`、`ink`、`pause <时长>`（`800ms`、`1.5s`）、`mark <名称>` | `to`（块的标签）、`lines`（代码行，如 `2-3`）、`sel`（块内的 CSS 选择器） | 说到它之后的第一个字时执行：`next` 推进一步，`spot`、`hint` 聚光与提示，`point` 指向块，`ink` 用荧光笔圈出，`run` 显示录制的输出，`click` 触发组件的具名动作，`pause` 停顿，`mark` 记一个章节点。没有 `to` 时作用于这段讲解前面最近的上屏块。页面上不显示（演讲者窗口与备注中显示 `〔cue spot〕`） |
| `{say}` | 显示的文字 | `alias`：读出的文字 | 显示一种写法，讲授读另一种（字幕与逐字稿仍是显示的文字） |

头部的配置（`renderers.lecture`）：`voice: { engine, voice, rate, style }`（写了 `voice` 才合成；`engine` 只写运营者定义的引擎 ID，省略时用 `presmium.speech.engine`）、`script`（单独的讲授脚本文件，其中以与讲义相同的标签 `(merge)=` 开始的一节代替讲义这一节的讲解，第 k 段属于第 k 步；讲义的显示不变）、`gap`（一步说完到推进的停顿，默认 500 毫秒）。`presmium.lecture: { lexicon: { BPE: B P E } }` 是整份文稿的读音词典。`{only} lecture` 中的讲解只说不显示，`{only} web, slides` 中的只显示不说；头部的 `renderers` 要写出 `lecture`，否则 `{only} lecture` 得到“不认识的渲染端”的警告。

合成的片段在合成缓存 `.presmium/speech/` 中（提交它，别人构建时不再调用引擎）。缓存缺少某一句而又没有引擎时，构建失败，`presmium check` 的 `presmium.lecture` 逐句指出；提示标记的目标不存在、`lines` 超出代码的行数也由它报告。
