# 指令参考

每条指令给出：提供它的插件包（写进文稿头部 `plugins`）、插件 ID（`presmium:` 下的配置键）、参数、正文、选项、生成的 IR 与步数（`span`，见 `docs/ir.md` 2.4 节），以及一个最小示例。完整语义以 `docs/ir.md` 5.1 节和各插件的 `src/node/` 为准。

所有指令都接受两个通用选项：

- `:reveal:`：块在下一步出现。`{slide}`、`{only}` 上写 `:reveal: items` 时其中的列表逐项出现。
- `:label:`：块 ID，等同于在块前写 `(名字)=`。

选项值按指令声明的类型读取（`string`、`number`、`boolean`、`list`）；指令声明了选项时，写错的选项名得到警告 `unknown option`。

指令可以写成反引号代码围栏（```` ```{名字} ````）或冒号围栏（`:::{名字}`）。正文是 MyST 的指令（`{slide}`、`{only}`）习惯用冒号围栏；正文里还有代码围栏时，外层围栏要比内层多一个字符（例如外层四个反引号）。

## 内置指令（编译器，不需要插件）

### `{slide}`

正文为 MyST，其中的块都是上屏内容。选项：`:reveal:`、`:reveal: items`。

```md
:::{slide}
:reveal: items
- 统计相邻对
- 合并出现最多的一对
:::
```

列表逐项出现，`span` 为项数减一。

### `{only}`

参数为渲染端 ID 列表（`web`、`slides`、`notebook`，逗号或空格分隔）；正文为 MyST，其中的块只交给这些渲染端。嵌套时取交集。选项：`:reveal:`、`:reveal: items`。

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
- `slides` 下的键原样写进这一页 Slidev 的 frontmatter（`layout`、`class`、`routeAlias` 等 Slidev 的页面选项）。不要选 `two-cols` 这类需要 `::right::` 插槽的布局：MyST 写不出插槽，内容会全在左栏。
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

插件的其他选项只读全局配置。

### `{component}`

参数为组件名（插件 `components/` 下的文件名）；正文为 YAML 属性。选项：`:span:`（内部步数）、`:plugin:`（插件 ID，默认为注册该组件的插件）；其余选项作为属性，值按 YAML 读取。

```md
:::{component} PmDemoStepper
:span: 3
steps: [解析, 启动, 渲染]
:::
```

`PmDemoStepper` 来自 `@presmium/slidev-addon-core`；`PmContrastToggle`（高对比度开关，`@presmium/slidev-addon-publish`）也可以这样放进正文。文稿目录下 `components/` 中的组件（插件 ID `deck`）也可以放进来，两种形态都渲染。没有插件注册该组件时警告 `no plugin in plugins registers the component`。

### `{include}`

参数为文件路径（相对于当前文件）。被引入文件的 frontmatter 被忽略（警告）。

````md
```{include} pages/intro.md
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
- `:executor:` 指定执行器 ID：`presmium.python`、`presmium.node`（执行插件）、`presmium.container`（本地环境插件）。指定的执行器不可用时不改用别的执行器：浏览器中运行失败，显示录制输出与原因。
- `:env:` 选运行环境：头部 `execute.environments` 中的名字（编译为执行器 `presmium.env.<名>`），或保留名 `browser`（按语言选执行器）；不写时取头部的 `execute.env`。与 `:executor:` 同时写是错误；未声明的环境是错误，诊断在代码块的行上。
- `:session:` 会话名：同一会话的代码块共享解释器（前一块定义的变量后一块能用）。编译时按文稿中的顺序在同一个解释器中运行，改了其中一块整个会话重新执行；浏览器中每个页面、每个学习者各有一份，代码块旁的“重置会话”丢弃它。同一会话的块须在同一环境。
- `:echo: false`（须有 `:run:`）：只显示输出，不显示代码与运行控件；只输出 Markdown（`text/markdown`）时按正文显示，用于从数据生成表格与列表。与 `:run: live` 同用时警告并按 `compile` 执行。
- 富输出：Python 中 `display(obj)`（不必导入）与 `from IPython.display import Markdown, HTML, Image, SVG, Latex, JSON` 显示对象（按它的 `_repr_html_`、`_repr_markdown_`、`_repr_png_` 等）；matplotlib 的图在 `plt.show()` 与运行结束时显示为图片。网页、幻灯片按类型显示（HTML 经清洗，幻灯片中放进沙箱 iframe），notebook 把输出原样写进单元格。
- 普通代码围栏（```` ```python ````）不能带选项；要执行就写成 `{code}`。
- 带 `live` 或 `both` 的代码块在网页中有运行按钮；幻灯片中 Python、JavaScript、TypeScript 的这类代码块是 Slidev 的 Monaco Runner（`{monaco-run}`），点运行按钮执行，录制的输出显示在它下方。
- 写在插件组件里的代码块（执行面板等的正文）由组件运行，没有自己的运行按钮与录制输出。

### 其他 MyST 指令

MyST 自带的指令（`{note}` 等提示框、`{figure}`、`{math}`、`{list-table}`、`{dropdown}` 等）作为上屏内容保留标准 mdast。```` ```mermaid ```` 代码块由渲染端绘制。未注册、也不是 MyST 指令的名字报错 `unknown directive; is the plugin that provides it listed in plugins?`。

## 代码引用 `presmium.code`（`@presmium/slidev-addon-code`）

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
:pin: 2458dee
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

诊断：`presmium.code.anchors`（锚点丢失为错误，模糊匹配为警告，移动为提示）、`presmium.code.drift`（锁定提交之后工作区的代码变了，警告并附差异）、`presmium.code.links`（没有远端仓库，没有永久链接）、`presmium.code.syntax`（参数不是锚点、`:variants:` 少于两个等）。

## 浏览器执行 `presmium.exec`（`@presmium/slidev-addon-exec`）

浏览器中 Python 由 Pyodide 执行，JavaScript、TypeScript 由脚本 Worker 执行；编译时执行用本机的 `python3` 与 `node`。语言名 `py`、`python3`、`ipython` 都是 Python，`js`、`mjs` 是 JavaScript，`ts` 是 TypeScript。全局配置 `presmium.exec`：`timeoutMs`（默认 10000，也可以在某一节的 `{config}` 中设置）、`loadTimeoutMs`（默认 30000）、`maxTraceEvents`（默认 500）、`pyodideURL`。

### `{run-panel}`

参数为语言：`python`（默认）、`javascript`、`typescript`；正文为代码。

| 选项 | 类型 | 作用 |
|---|---|---|
| `:params:` | string | YAML 映射，注入程序的变量（JavaScript 中为常量），观众可改后重跑 |
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

生成 `PmRunPanel`，步数 0。PDF、PNG 导出显示先给参数赋值的代码，加上构建时的输出（构建时没有执行、执行失败或超时的用 `:recorded:`）；notebook 中与内核同语言（默认 Python）的为代码单元格（参数赋值在前），其他语言为代码加输出的 Markdown 单元格。

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

## 本地环境 `presmium.execLocal`（`@presmium/slidev-addon-exec-local`）

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

生成 `PmLocalEnv`；它还提供执行器 `presmium.container`，供代码块的 `:executor:` 使用。在容器中运行需要 Docker 与开发服务器（`presmium dev`，网页与幻灯片都可以）；每次运行是新的容器，工作目录是这次运行自己的目录，工作区只读挂载在 `/workspaces/<目录名>`，其中的模块可以导入。一份文稿只有一个工作区：各 `{local-env}` 指定不同的 `:workspace:` 时报错。全局配置 `presmium.execLocal`：`workspace`、`priority`（默认 10，高于浏览器执行器）、`buildTimeoutMs`（构建 devcontainer 镜像的时限，默认 600000）。

## 远端环境 `presmium.execJupyter`（`@presmium/slidev-addon-exec-jupyter`）

提供 `kind: jupyter` 的具名环境：任何 Jupyter Server（`templates/env/compose/` 的 docker compose 模板、JupyterHub、agent-sandbox 等）。头部声明环境，代码块用 `:env:` 选择，构建时与浏览器中都在它的内核中运行：

```yaml
execute:
  environments:
    lab: { kind: jupyter, auth: proxy, kernel: python3, image: 'quay.io/jupyter/base-notebook:2026-10-12@sha256:…' }
```

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
```

生成 `PmTerminal`。环境不存在或不是 `kind: jupyter` 时报错（`presmium.execJupyter`）。静态产物中 `proxy` 方式的终端显示说明而不连接，`prompt` 方式照常可用；notebook 中不生成单元格，PDF 等静态导出显示一行说明。

## 引导 `presmium.guide`（`@presmium/slidev-addon-guide`）

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

## 富内容 `presmium.content`（`@presmium/slidev-addon-content`）

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

参数为媒体文件路径（相对于本文件，或包路径如 `@presmium/slidev-addon-content/media/clip.webm`，或 `http(s)://` 网址）；正文为说明文字。

| 选项 | 类型 |
|---|---|
| `:controls:`、`:autoplay:`、`:loop:`、`:muted:` | boolean |
| `:width:`、`:height:` | number |
| `:alt:` | string |
| `:still:`（只有 `{animation}`） | string：减少动态效果时显示的静止图片 |

````md
```{video} media/demo.webm
:controls:
演示录像。
```
````

生成 `PmMedia`，降级为文件链接。文件不存在时报错 `file not found`。

### `{youtube}`

参数为 YouTube 视频 ID 或链接；正文为说明文字。选项：`:start:`（秒）、`:width:`、`:height:`（number）。

````md
```{youtube} https://www.youtube.com/watch?v=dQw4w9WgXcQ
:start: 30
```
````

生成 `PmYoutube`，降级为视频链接。

## 课堂 `presmium.classroom`（`@presmium/slidev-addon-classroom`）

课堂组件需要会话插件 `@presmium/slidev-addon-session`（文稿头部写 `presmium.session.server`，见 presmium-present 技能）；`{exercise}` 的校验另需执行插件 `@presmium/slidev-addon-exec`。

### `{quiz}`

没有参数与选项；正文为题干（MyST），之后是任务列表形式的选项，`[x]` 标出正确项（可多个）。

````md
```{quiz}
BPE 每一轮合并哪一对？

- [ ] 最先出现的一对
- [x] 出现次数最多的一对
```
````

生成 `PmQuiz`；少于两个选项或没有正确项时报错。notebook 中为题干与选项，答案折叠。

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

生成 `PmQuestionBox`；notebook 中不生成单元格。`:target:` 不是本章节的块时，编译步骤 `classroom-places` 报错。

### `{pulse}`

参数为问题（默认“这一节理解了吗？”，英文文稿为英文）；正文为说明。选项：`:levels:`（string，至少两个选项，逗号分隔；默认“懂了、有点模糊、没懂”）。

````md
```{pulse} 这一节讲清楚了吗？
:levels: 懂了, 有点模糊, 没懂
```
````

生成 `PmPulse`；notebook 中不生成单元格。

## 没有指令的插件

| 插件包 | 插件 ID | 作用 |
|---|---|---|
| `@presmium/slidev-addon-core` | `presmium.core` | 幻灯片形态的宿主适配；`PmDemo*` 示例组件 |
| `@presmium/slidev-addon-stage` | `presmium.stage` | 讲台：黑屏、冻结、圈画；编译步骤 `footnotes` 把脚注定义放到引用它的块旁 |
| `@presmium/slidev-addon-publish` | `presmium.publish` | 编译步骤 `remote-assets` 把远程图片下载到 `.presmium/assets/`；高对比度开关；全局配置 `offline: false` 关闭离线缓存 |
| `@presmium/slidev-addon-session` | `presmium.session` | 课堂会话；全局配置 `server`（`ws://` 或 `http://`） |

## 行内角色

插件可以登记行内角色（`docs/ir.md` 2.8 节），写作 ``{名}`内容` ``，选项写成 `key=value`：``{cue to=code-1 lines=3-5}`spot` ``（只写键而不写值是语法错误）。登记过的角色在 IR 中保留为 `presmiumRole` 节点，网页、幻灯片与 notebook 显示它的子内容；没有子内容的角色（如提示标记）只在网页的演讲者窗口、编辑模式与幻灯片的演讲者备注中显示一个标记 `〔名 内容〕`。没有插件登记的角色压平为文字并给出警告 `unknown role`。MyST 自带的 `{sub}`、`{sup}`、`{kbd}`、`{abbr}` 等不受影响，插件不能登记同名的角色。
