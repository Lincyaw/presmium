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
lang: zh-CN                    # 文稿的语言：两种形态的 <html lang>、界面语言、编译时写入产物的文字
plugins:                       # 插件包名
  - '@presmium/slidev-addon-code'
  - '@presmium/slidev-addon-exec'
presmium:                      # 各插件的全局配置，键为插件 ID
  presmium.code: { repo: https://github.com/org/repo }
renderers:                     # 要构建的渲染端及其配置
  web: {}
  slides: { theme: default }
  notebook: {}
execute: { rerun: environment } # 可选：另一运行环境的执行录制重新执行（第 4 节）
---
```

多文件文稿用 MyST 的 `{include}` 指令引入。入口文件可以以 UTF-8 BOM 开头（Windows 记事本等编辑器会写入），编译器读取头部前去掉它。

`lang` 是文稿语言的唯一来源：编译器总是把它写入 IR 的 `meta.lang`（不写时为 `zh-CN`），两种形态据此设置 `<html lang>`，插件在编译时写入产物的文字（如 notebook 中的说明）也按它选择中文或英文（`architecture.md` 5.7 节）。渲染端的配置不能另设语言。

`renderers` 列出的渲染端就是 `presmium build` 默认构建的渲染端（第 7 节）。每个渲染端都可以用 `package` 换成另一个包；其余选项：

| 渲染端 | 选项 |
|---|---|
| `web` | `base`（站点路径）、`port`（开发服务器端口） |
| `slides` | `base`、`port`；其余选项写进生成的 Slidev 文稿头部，如 `theme`、`routerMode`（`hash` 时页地址为 `/#/<页号>`）、`exportFilename`、`addons` |
| `notebook` | `kernel`：内核名（默认 `python3`），或 `{ name, language, display_name }`，与内核同语言的代码成为代码单元格；`webUrl`：网页版的地址，notebook 显示不了的组件附上指向它的链接 |
| `web`（v0.8，P-78） | `nav`：顶部导航，`[{ text, link }]`（VitePress `themeConfig.nav` 的形状）；`footer`：`{ message, copyright }`；`head`：`{ description, image }`，写成页面的 `description` 与 OG 元数据（`og:title`、`og:description`、`og:image`）；`sitemap`：`{ hostname }`，生成 `sitemap.xml` |
| `lecture`（v0.8，讲授插件提供） | `voice`：`{ engine, voice, rate, style }`；`script`：单独的讲授脚本文件（2.9 节）；`gap`：一步说完之后推进前的停顿，默认 `500ms`。`lecture` 是站点渲染端：与网页一同构建时输出在 `dist/lecture/`，网页的讲授视图从 `../lecture/` 读取 |

站点路径 `base` 的默认值：同一次构建同时生成网页与幻灯片、两者都没有设置 `base` 时，网页为 `/web/`、幻灯片为 `/slides/`，`dist/` 整体作为一个站点部署（网页在 `dist/web`，幻灯片在 `dist/slides`）；只生成其中一种时为 `/`。`presmium dev` 中每个开发服务器有自己的地址，`base` 默认为 `/`。

两种形态互跳的链接（P-74）由两边的 `base` 得出：网页链到 `<幻灯片的 base><页号>`，幻灯片链到网页的对应章节。两种形态分开部署时，在 `presmium: { presmium.web: { slidesUrl, webUrl } }` 中写明幻灯片与网页的地址。

v0.8 新增的头部字段：

```yaml
---
translations: { en: lecture.en.md }        # 译本（2.12 节）
execute:
  env: browser                              # 有 :run: 而不写 :env: 的代码块的环境（2.7 节）
  environments:
    gpu: { kind: jupyter, url: https://gpu.example.edu/, kernel: python3, auth: proxy,
           image: quay.io/jupyter/pytorch-notebook@sha256:… }
    box: { kind: devcontainer, path: . }
checks:
  forbid: ['PR #\d+', 'T-\d{3}', 'instructor/']   # 发布检查禁止出现的正则（2.11 节）
presmium:
  presmium.lecture: { lexicon: { BPE: B P E } }      # 读音词典（2.9 节）
  presmium.speech: { engine: volcengine, transcribe: groq }     # 只写引擎的 ID（引擎由运营者定义，见下）
---
```

| 字段 | 含义 |
|---|---|
| `execute.env`、`execute.environments` | 默认环境与具名环境（2.7 节）；编译器写入 IR 的 `config.execute` |
| `translations` | 语言到译本入口文件（相对于文稿目录）；译本自己的头部写 `translationOf`（2.12 节） |
| `checks.forbid` | 正则表达式的列表（JavaScript 语法），`presmium check` 报告每个媒介中的命中（2.11 节） |
| `presmium.lecture`、`presmium.speech` | 讲授与语音插件的配置：读音词典、默认的合成引擎 `engine` 与转写引擎 `transcribe`（引擎 ID）；音色在 `renderers.lecture.voice` 中。只写名字，不写地址、凭据或存放凭据的变量名（第 9 节） |

文稿头部不能写凭据：`presmium check` 对像凭据的值告警（`architecture.md` 第 11 节）。文稿也不决定凭据发往哪里：语音引擎 `<ID>` 由运营者在服务端的环境变量 `PRESMIUM_SPEECH_<ID>_URL` 与 `PRESMIUM_SPEECH_<ID>_KEY` 中成对定义（`volcengine` 的地址固定，只需 `PRESMIUM_SPEECH_VOLCENGINE_APPID` 与 `PRESMIUM_SPEECH_VOLCENGINE_KEY`），文稿用 ID 选用；`presmium.speech` 中出现 `url`、`keyEnv` 等引擎定义是错误级诊断，不被使用。远端环境的地址与令牌同样成对（2.7 节）。确认策略、agent 的启动命令与模型、录音的去处也不在文稿中设置，它们来自命令行、环境变量与工作区配置的运营者设置（第 10 节）。

notebook 中显示不了的组件（没有 notebook 扩展，也没有 `fallback`）写成一行说明：设置了 `webUrl` 时附上 `<webUrl>#<章节 ID>`；没有设置、而同一次构建也用默认的网页渲染端生成网页时，附上相对链接 `../web/<页>#<章节 ID>`（与 `dist/` 的目录结构一致）；都不满足时说明不带链接，构建报告提示设置 `renderers.notebook.webUrl`。

### 2.2 章节

- `#` 是文稿标题或分章标题，`##` 开始一个章节（可由 `sectionDepth` 配置）。第一个 `##` 之前的内容构成封面章节。
- 一个章节对应幻灯片的一页、网页的一节、notebook 中以标题开头的一组单元格。
- 章节 ID 取自标题前的 MyST 标签 `(bpe-merge)=`；没有标签时由标题生成。编译器先保留全部标签（同一标签写了两次才报错），再给没有标签的章节生成 ID，所以由标题生成的 ID 与某个标签相同时，换成 `<ID>-2` 这样的写法，标签不受影响。章节 ID 是形态切换、笔记挂载、深链接的依据，一经发布不应改变。

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

讲解与表格单元格中的原始 HTML 标签，若不是 HTML 元素（例如 agent 轨迹中的 `<reminder>`、`<system-reminder>`），按字面显示为文字：编译器把它们写成 IR 中的文本，三种媒介都显示标签本身，幻灯片的构建也不因没有闭合的这类标签失败。其他位置的原始 HTML 照常作为 HTML（例如正文中的 Web 组件）。

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
slides: { layout: center }
web: { layout: scrolly }
:::
```

`{only}` 的参数是渲染端 ID：`web`、`slides`、`notebook`，讲授插件提供的 `lecture`，或文稿头部 `renderers` 中的其他键；不认识的 ID（例如拼错的 `slide`）得到指向该行的警告，否则其中的内容会从所有形态中消失。各渲染端只收到属于自己的块，步骤也按渲染端压缩：只在其他渲染端出现的块所占的步骤在本渲染端中不存在，其后的步骤依次前移；渲染端的章节带有新旧步骤的对应（`stepMap`），形态互跳据此换算步骤。

`lecture` 的用法：`{only} lecture` 中的文字只在讲授中说出、不显示；`{only} web, slides` 中的讲解只显示、不说（2.9 节）。

`{hints}` 放在章节内，为各渲染端提供排版提示；渲染端不认识的提示直接忽略。`slides` 下的键写进这一页 Slidev 的 frontmatter。注意 Slidev 的 `two-cols` 等布局需要 `::right::` 这样的插槽标记，MyST 写不出来，选不需要插槽的布局（如 `center`、`full`）。

```md
:::{config}
presmium.exec: { timeoutMs: 30000 }
:::
```

`{config}` 放在章节内，为插件提供只在本章节生效的配置：正文为 YAML 映射，键为插件 ID，值也须是映射（否则报错），存为章节的 `config`。

- 位置：章节顶层，或章节内的 `{slide}`、`{only}` 中；不生成块，也不占步骤。放在第一个 `##` 之前时属于封面章节。
- 合并：同一章节的多个 `{config}` 按源码顺序合并，同一插件的选项后写的覆盖先写的。编译器在转换本章节的块之前读取它们，所以章节中任何位置的指令都看到完整的章节配置。
- 生效：在该章节中合并在文稿头部的全局配置之上，交给指令（`DirectiveContext.config`）与编译步骤（`PassContext.configFor(section)`）；浏览器端用 `useSectionConfig(<插件 ID>)` 读取。幻灯片渲染端把它写入该页 frontmatter 的 `presmium`，封面章节的写入 `presmiumSection`（封面页的 frontmatter 就是 Slidev 文稿的头部，其中的 `presmium` 已是全局配置）；网页形态从 IR 读取（`architecture.md` 5.2 节）。
- 读取章节配置的选项：执行插件的 `presmium.exec.timeoutMs`（本章节中代码在编译时与浏览器中运行的超时，代码块与指令上的 `:timeout:` 优先）、代码引用插件的 `presmium.code.repo`（本章节 `{code-ref}` 的永久链接所用的仓库，`:repo:` 优先）。插件的其他选项只读全局配置。

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

锚点中的文件路径（`src/bpe.py`）相对于文稿所在 git 仓库的根目录，不在 git 中时相对于文稿目录（5.1 节）。

### 2.7 执行环境、会话与输出（P-100 至 P-102）

````md
```{code} python
:run:
:env: gpu
:session: train
model = build_model()
```

```{code} python
:run:
:session: train
:echo: false
print(markdown_table(model.summary()))
```
````

| 选项 | 写在 | 含义 |
|---|---|---|
| `:env:` | 代码块（`{code}` 等）、`{code-ref}`、`{run-panel}` | 运行的环境：文稿头部 `execute.environments` 中的名字，或保留名 `browser`（按语言路由，即 v0.7 的行为）；省略时取 `execute.env`。编译器写成 `run.executor = 'presmium.env.<名>'`；与 `:executor:` 同时写是错误 |
| `:session:` | 同上 | 执行会话：同一会话的代码块共享解释器状态（前一块定义，后一块使用）。会话名在文稿内有效，同一会话的块必须在同一环境 |
| `:echo:` | 带 `:run:` 的代码块 | `false`：不显示代码与运行控件，只显示输出；`text/markdown` 输出按正文显示（用于从数据生成表格与列表，限于章节内）。与 `:run: live` 同用时警告并按 `compile` 处理 |

具名环境的写法：

| 键 | 含义 |
|---|---|
| `kind` | 提供方类型：`jupyter`（远端环境插件）、`devcontainer`（本地环境插件，即现有的 `presmium.container`）、`wasi`（WebAssembly 插件）、`webgpu`（浏览器 GPU 插件），或其他插件登记的类型；没有插件提供该类型时报错 |
| `url`、`kernel` | `jupyter`：Jupyter Server 的地址与内核规格名（默认 `python3`）。JupyterHub 的用户服务器写作 `https://hub.example.edu/user/{user}/`，`{user}` 由学习者的令牌所属用户代入。`env`、`proxy` 方式连接运营者给出的地址，这里的 `url` 可以省略，写了就必须与它同源；`prompt` 与 `none` 方式连接这里的地址 |
| `auth` | 凭据方式：`env`（编译时读构建机的 `PRESMIUM_ENV_<名字大写>_TOKEN`；浏览器中不可用）、`proxy`（浏览器经服务端的代理访问，服务端代加同一个环境变量中的令牌）、`prompt`（学习者在页面上粘贴自己的令牌，存于本页的 `sessionStorage`，用于已发布的静态站点）、`hub`（预留）、`none`。`env` 与 `proxy` 的令牌只发往运营者在 `PRESMIUM_ENV_<名字大写>_URL` 中给出的地址：没有给出地址时不发送令牌，运行失败并说明；文稿的 `url` 与它不同源时不连接，给出错误级诊断（`architecture.md` 第 11 节）。没有通用的后备变量 |
| `image` | 镜像摘要，进入环境指纹；部署模板以同一个值启动容器 |
| `languages` | 可用语言；省略时由提供方给出（`jupyter` 取内核规格的语言） |
| `path` | `devcontainer`：定义所在目录 |

WASI 与 WebGPU 的执行器按语言登记（`c`、`cpp`、`ruby`、`sql`；`wgsl`），不声明环境也能运行；声明 `kind: wasi` 或 `kind: webgpu` 的环境只是为了用 `:env:` 明确选择。`wgsl` 计算着色器用 `{run-panel} wgsl` 运行，`:params:` 是 YAML 写的缓冲区与派发说明（`buffers`、`dispatch`、`entry`、`repeat`、`features`），结果是读回的缓冲区摘要与计时。

浏览器中，同一会话的状态按页面实例隔离：每个打开的页面（每个学习者）各有一份，重新加载即重新开始；代码块旁的“重置会话”丢弃它（`Executor.endSession`）。编译时，同一会话的代码块按在文稿中出现的顺序在同一个解释器中运行（第 4 节的会话键链）。

远端环境的浏览器终端（P-107）：

```md
:::{terminal} gpu
:height: 20
:::
```

`{terminal}` 的参数是一个 `kind: jupyter` 的环境；它打开该 Jupyter Server 的一个终端（凭据方式同环境）。静态产物中，`proxy` 方式的终端显示说明而不连接；`prompt` 方式照常可用。

### 2.8 行内角色

MyST 的角色写作 ``{名}`内容` ``，角色名之后可以写选项：``{cue to=code-1 lines=3-5}`spot` ``（myst-parser 按登记的选项解析）。插件用 `PresmiumNodePlugin.roles` 登记角色（`RoleSpec`）：

- 登记过的角色在 IR 中保留为 mdast 节点 `{ type: 'presmiumRole', plugin, name, options, children }`，`options` 另带 `value`（反引号中的内容）。不认识这个角色的渲染端只显示 `children`。
- 没有登记的角色照旧压平为文字，并给出警告。
- MyST 自带的角色（`{sub}`、`{sup}`、`{kbd}`、`{abbr}` 等）与编译器内置的 `{button}`（2.10 节）不经这个扩展点。

渲染：网页、幻灯片与 notebook 显示 `children`。演讲者窗口、幻灯片的演讲者备注与编辑模式中，没有子内容的角色显示一个标记 `〔<名> <value>〕`，作者能看见提示标记的位置。

### 2.9 讲授脚本（P-134）

讲解就是讲授的脚本，不需要另写文件：讲解本来就逐段绑定到步骤（2.4 节），讲授插件的 `lecture` 渲染端把每一步的讲解编为讲授计划，经文字转语音成为讲授。讲解中可以写两种行内角色：

```markdown
我们先看 {cue to=code-1 lines=3-5}`spot` 这三行：每一轮找出现次数最多的字节对，{cue}`next` 再把它合并成新符号。
运行一下 {cue to=code-1}`run` 看看结果。{say alias="B P E"}`BPE` 的词表就这样一步步长出来。{cue}`pause 800ms`
```

| 角色 | 内容与选项 | 含义 |
|---|---|---|
| `{cue}` | 内容是命令：`next`、`spot`、`hint`、`point`、`click <动作>`、`run`、`ink`、`pause <时长>`、`mark <名称>`；选项 `to`（目标块的标签）、`lines`（代码行，如 `3-5`）、`sel`（块内的 CSS 选择器） | 说到此处时执行：`next` 在此处推进一步（而不是在段落说完后）；`spot`、`hint` 聚光与提示；`point` 指向块；`click` 触发组件的具名动作；`run` 重放冻结的录制输出（K-19）；`ink` 圈画；`pause` 停顿；`mark` 标记一个章节点。子内容为空 |
| `{say}` | 内容是显示的文字；选项 `alias` 是读出的文字 | 显示一种写法，读出另一种 |

- **只说与只显示**：`{only} lecture` 中的文字只在讲授中说出；`{only} web, slides` 中的讲解只显示、不说。
- **读音词典**：`presmium.lecture.lexicon`（写法到读法）随合成请求送给引擎（火山引擎的 `pronunciation_dict`），也计入合成缓存的键。
- **时间**：提示标记在它所在字的时刻触发：优先用引擎返回的逐字或逐词时间；没有时把合成的音频转写一遍对齐；再不行按字数线性估算。一步在其讲解说完后 `gap`（默认 0.5 秒）推进，或在 `{cue}`next`` 处推进。
- **单独的讲授脚本**：`renderers.lecture.script` 指向一个 MyST 文件，其中的章节用与讲义相同的标签（`(merge)=`）对应讲义的章节；某一节在脚本中出现时，讲授用脚本中这一节的段落代替讲义的讲解（第 k 段属于第 k 步，规则同 2.4 节），讲义本身的显示不变。由 agent 整堂生成的讲授写在这里。
- **产物**：讲授计划经合成成为与录制的讲授格式相同的讲授轨（`voice.kind: synthetic`）与音频片段，写入 `dist/lecture/<id>/`，静态站点离线可放，不需要凭据（第 9 节）。

### 2.10 卡片、栅格、选项卡与按钮（P-46）

编译器接受 MyST 标准的写法（mystmd 的 `myst-ext-card`、`myst-ext-grid`、`myst-ext-tabs`、`myst-ext-button`），用于课程首页与导读页：

````md
::::{grid} 1 1 2 3
:::{card} 第 1 周：智能体环路
:link: week-01/
读、想、做的循环与它的失败方式。
+++
{button}`进入讲义 <week-01/>`
:::
:::{card} 第 2 周：上下文
……
:::
::::

::::{tab-set}
:::{tab-item} Python
:sync: py
……
:::
:::{tab-item} JavaScript
:sync: js
……
:::
::::
````

| 写法 | 生成 |
|---|---|
| `{grid}`（参数为四档屏宽的列数）、`{grid-item}`（`:columns:`） | mdast `grid`、`gridItem` |
| `{card}`（参数为标题；`:header:`、`:footer:`、`:link:`；正文中 `^^^` 之前为页眉，`+++` 之后为页脚） | mdast `card`（`cardTitle`、`header`、`footer`） |
| `{tab-set}`、`{tab-item}`（参数为标题；`:sync:`、`:selected:`） | mdast `tabSet`、`tabItem` |
| ``{button}`文字 <地址>` `` | 带 `kind: 'button'` 的链接 |

它们是 `markdown` 节点中的标准 mdast，不是组件，属于上屏内容。各媒介：网页完整显示（栅格按屏宽分列，选项卡可切换，同 `:sync:` 的选项卡一起切换）；幻灯片中卡片与栅格照常显示，选项卡依次展开为带标题的几段；notebook 降级为标题加段落（卡片标题与选项卡标题成为小标题，按钮成为链接），列入构建报告。搜索索引包含其中的文字。

### 2.11 受众与发布检查（P-54、P-55）

块与章节可以标为只给某些受众：

````md
## 现场演示要点

:::{audience} teacher
:::

这一节整节只给教师。

## 合并规则

:::{only} web, slides
:audience: teacher
这一段只给教师：演示时先关掉网络。
:::

```{code} python
:audience: teacher
:run:
print(answer_key())
```
````

- 每个指令都接受 `:audience:`（逗号分隔的受众名），与 `:reveal:`、`:label:` 一样是通用选项；讲解段落要标受众时用 `{only}` 包起来。
- `{audience} <受众>` 放在章节顶层（不生成块，同 `{hints}`），把整个章节标为只给这些受众，例如教师指南的一节。
- 编译器把它们写入 `IRBlock.audience` 与 `IRSection.audience`。不带受众的内容对所有受众可见。
- `presmium build --audience student` 编译时去掉受众不含 `student` 的章节与块（步骤随之压缩），所有渲染端都拿不到它们；不带 `--audience` 的构建包含全部内容。构建结束后扫描产物（页面、`ir.json`、搜索索引、幻灯片的备注与 notebook），被去掉的内容中较长的句子（12 个字符以上）出现在产物中就是错误级诊断 `presmium.audience`，位置是被去掉的块（例如它的文字又经代码输出或另一个文件漏进来）。

`presmium check` 的发布检查（每个渲染端按自己的视图检查，只出现在某个媒介中的内容只在该媒介中检查）：

| 检查项 | 报告 |
|---|---|
| `presmium.links` | 正文链接与原始 HTML 中 `href`、`src`、`poster` 指向的本地文件不存在；`#片段` 不是本文稿中的章节 ID、块标签或标题锚点；`其他文件.md#片段` 指向工作区中不存在的文档或片段 |
| `presmium.directive` | MyST 指令与角色的错误（myst-parser 产生的 `mystDirectiveError`、`mystRoleError`，例如 `{csv-table}` 不支持 `:file:`），错误级 |
| `presmium.forbid` | 文稿头部 `checks.forbid` 中任一正则在某个媒介的文字（标题、讲解、上屏内容、代码与录制输出）中命中 |

外部链接的检查可选：`presmium check --external-links` 在本机装有 lychee 时检查外部链接，没有时给出信息级提示。

### 2.12 译本（P-123）

```yaml
# lecture.md
translations: { en: lecture.en.md }

# lecture.en.md
lang: en
translationOf: { entry: lecture.md, digest: 3f9a…c2 }
```

- 译本是同一目录中的另一个入口文件，插件与渲染端配置取自原文，章节标签与原文相同，以便两种语言互相跳转。
- `presmium build` 同时编译原文与译本；网页渲染端用 VitePress 的 `locales` 把译本放在 `/<语言>/` 下，页面上可以切换语言，切换后停在同一章节。幻灯片与 notebook 只构建原文。
- `digest` 是原文的摘要：原文入口及其 `{include}` 的文件规范化后的 sha256（只看内容，不看路径）。原文改动后 `presmium check` 报告译本过期（`presmium.translations`，警告级），提示中给出新的摘要，译者核对后写回译本头部。

### 2.13 先预测再揭示（P-68）

```md
:::{predict} 合并三轮之后，词表中有几个新符号？
:choices: 1, 2, 3
:::

:::{slide}
:reveal:
三个：每一轮新增一个符号。
:::

讲解：每一轮只合并出现最多的那一对。
```

- `{predict}` 的参数是问题；`:choices:` 给出选项，省略时学习者写一段文字。
- 揭示内容：`{predict}` 之后的下一步出现的全部内容，即 `:reveal:` 让它在下一步出现的上屏内容，以及绑定到这一步的讲解。课堂插件的编译步骤把它们移入 `PmPredict` 组件的子块（块 ID 与步骤不变）。
- 读者保存预测之前，揭示内容不显示（文档视图中也是如此）；保存后显示，并保存在本机（`localStorage`）。投在全班面前的放映画面与演讲者视图按步骤显示。课堂中预测另写入 `predictions` 集合（键为 `<位置>:<参与者>`），主讲在演讲者面板中看到分布。
- notebook 中为问题、选项与折叠的揭示内容（`<details>`）。

### 2.14 视频的封面与字幕轨（P-42 增补）

```md
:::{video} films/loop.mp4
:poster: films/loop.jpg
:captions: en=films/loop.en.vtt, zh-CN=films/loop.zh.vtt
:captions-default: en
智能体环路的一次完整演示。
:::
```

- `:poster:` 是封面图片；`:captions:` 是逗号分隔的 `语言=VTT 文件`，`:captions-default:` 是默认显示的语言（省略时不默认显示字幕）。字幕的标签按语言名称显示。
- 本地文件与媒体文件一样相对于本文件，随每种媒介发布：组件的 `assets` 声明 `poster` 与 `captions.<语言>`（属性路径），渲染端改写为发布后的地址。文件不存在时报错，带源码位置。
- 网页与幻灯片显示带 `poster` 与 `<track>` 的 `<video>`；notebook 中为同样的 HTML，文件复制到 `media/`。

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

`code` 节点的 `variants`（多版本）中，每个版本带有自己的标签、代码、在文件中的行区间（`startLine`、`endLine`）与永久链接，渲染端显示某个版本时，来源栏的文件链接与行号就是这个版本的。网页与幻灯片的来源栏和录制输出的说明（超时、退出码、预录输出）出自同一组纯函数（`@presmium/viewer/domain` 的 `originParts`、`outputNotes`），文字相同。`component` 节点另有 `assets`（属性名到本地文件 URL，渲染端发布这些文件并改写属性，第 6 节）与 `layer`（`overlay`：组件画在页面之上，渲染端不给它单独的位置）。脚注的 `footnoteReference`、`footnoteDefinition` 带 `enumerator`，即显示的编号（4 节，步骤 1）。

v0.8 增加的字段（全部可选，`ir` 仍为 `1`；TypeScript 定义见 `architecture.md` 4.6 至 4.10 节）：

| 位置 | 字段 | 含义 |
|---|---|---|
| `config` | `execute` | 头部的 `execute`：默认环境与具名环境（2.7 节），不含凭据 |
| `config` | `translations` | 语言到译本入口文件（2.12 节） |
| `meta` | `translationOf` | 译本的原文入口与摘要 |
| 章节、块 | `audience` | 只给这些受众（2.11 节） |
| `code.run` | `executor` | 已有字段；`:env:` 编译为 `presmium.env.<名>`，浏览器与编译时都按它精确选择执行器 |
| `code.run` | `session` | 执行会话（2.7 节） |
| `code` | `echo` | `false`：只显示输出 |
| `code.outputs[]` | `outputs` | 录制的富输出：nbformat 的输出列表（`stream`、`display_data`、`execute_result`、`error`）；`stdout`、`stderr` 仍是文本流的拼接 |
| `component` | `assets` | 键可以是属性路径，如 `captions.en` |
| `markdown` 的 mdast | `presmiumRole` | 登记过的行内角色（2.8 节）；`card`、`grid`、`gridItem`、`tabSet`、`tabItem` 与 `kind: 'button'` 的链接（2.10 节） |

文件路径：`presmium build` 写出的 `<out>/ir.json` 中，入口文件（`meta.entry`）与各块的 `source.file` 是相对于文稿目录的路径，产物因此不随检出位置变化（K-13）；`presmium ir` 的标准输出与 `presmium dev` 推送给浏览器的 IR 保留绝对路径，供编辑器跳转到源码。

## 4. 编译步骤

编译步骤（pass）是 IR 上的有序变换。内置步骤：

| 顺序 | 步骤 | 作用 |
|---|---|---|
| 1 | 解析 | 剥离 frontmatter，`myst-parser` 解析，把脚注定义放回书写处，处理 `{include}`；被引入的各文件可以用相同的脚注名（如 `[^1]`），后出现的文件中重名的脚注换一个内部标识（作者写的标签不变），每个文件的脚注从 1 起按首次引用的顺序编号 |
| 2 | 切分章节 | 按标题切分，生成章节 ID；带受众编译时（`--audience`）去掉不属于该受众的章节 |
| 3 | 指令转换 | 调用各插件注册的指令与行内角色，把指令节点转为 IR 节点、角色转为 `presmiumRole`；带受众编译时去掉不属于该受众的块 |
| 4 | 划分角色 | 按 2.3 节判定讲解与上屏内容 |
| 5 | 编排步骤 | 按 2.4 节计算 `at`、`until` 与章节步骤数 |
| 6 | 插件步骤 | 各插件注册的变换，例如解析代码锚点、计算高亮行 |
| 7 | 执行 | 执行带 `run` 的代码节点，结果写入 `outputs`，并写入执行缓存；之后运行声明了 `after: 'execute'` 的插件步骤，例如执行插件把编译时的输出写进执行面板的 `fallback` |
| 8 | 校验 | 按 IR schema 校验，产生诊断 |

每个插件步骤之后都检查一次 IR 的结构：插件步骤留下损坏的 IR 时，报告指出是哪个插件的哪个步骤（检查 ID `presmium.ir`，位置为入口文件），其后的步骤与执行都不再运行，不会在后续步骤中崩溃。

### 执行缓存

- 缓存键为 `语言 + 代码 + 参数 + 执行器 ID + 环境指纹` 的哈希。
- 缓存目录为文稿目录下的 `.presmium/freeze/`，可以随文稿提交。提交后，任何人构建都得到相同的输出，也无需安装运行环境：没有对应执行器时使用已有的录制。
- 代码改动后只重跑受影响的节点；`presmium build` 删除文稿中已不存在的代码的录制。超时取决于机器而不是代码，不录制。
- 同一段代码已有另一运行环境（环境指纹不同，例如另一个解释器版本）的录制时，默认沿用它并给出警告，所有人构建得到相同的输出。文稿头部写 `execute: { rerun: environment }` 时，这类代码重新执行并替换录制。
- 超时：代码块的 `:timeout:`，否则本章节的 `presmium.exec.timeoutMs`（2.5 节），否则执行器的默认值（编译时 10 秒）。
- **具名环境**：头部声明的每个环境由 `kind` 对应的插件（`PresmiumNodePlugin.environments`）创建执行器，ID 为 `presmium.env.<名>`，与插件的其他执行器一起参与编译时执行；没有提供方的 `kind` 与未声明的环境名是错误。环境不可用（缺凭据、不可达）时，有录制就用录制并警告，没有录制时报错；不改用其他执行器。
- **环境指纹**：Jupyter 为声明的镜像摘要、内核规格（含 `metadata`）的哈希、内核报告的实现与语言版本；WASI 为运行时二进制的哈希；WebGPU 为浏览器版本与显卡适配器的描述（CPU 模拟的适配器写明 `fallback`）。
- **会话键链**：带 `:session:` 的代码块按在文稿中出现的顺序组成会话，第 i 个代码块的缓存键是 `hash(第 i−1 个的键, 语言, 代码, 参数, 执行器 ID, 环境指纹)`，第一个的“前一个键”为会话名。所有块都命中缓存时不运行；有一块未命中时，结束该会话（`endSession`），从会话的第一个块起依次重新执行并重新录制。构建结束时结束所有用过的会话。不带 `:session:` 的代码块，键的算法与 v0.7 相同。
- **富输出与录制块**：录制保存 `outputs`。MIME 数据中长度超过 4096 个字符的值存为 `.presmium/freeze/blobs/<sha256>`，录制只保存引用 `{ "presmium/blob": "<sha256>" }`；编译器读取录制时把它们放回 IR，IR 与产物中的输出因此是完整的 nbformat 输出。`presmium build` 删除不再被引用的录制块。
- 编译时执行器（执行插件的 `presmium.python`、`presmium.node`）在子进程中、每次运行一个新的临时目录中执行代码，结果经单独的通道（文件描述符 3）返回：程序直接写标准输出（`process.stdout.write`、`console.dir`）不会破坏结果，这些输出照常录制；顶层 `await` 永不完成时，结果为失败并说明原因。运行末尾才发生的 Promise 拒绝与定时器中的异常使运行失败，与浏览器中一致。

## 5. 插件

插件在 Node 端的入口（`./presmium`）导出 `PresmiumNodePlugin`，与编译和渲染有关的字段：

| 字段 | 作用 |
|---|---|
| `version`、`kernel` | 插件自己的版本与兼容的内核版本范围（如 `^0.1.0`）；编译器不加载范围不含当前内核的插件。官方插件都声明这两项，`scripts/check-plugins.mjs` 检查 |
| `directives` | 指令规格：名称、参数（`arg: 'anchor'` 表示参数是锚点，编辑器据此解析）、选项、正文，以及转换为 IR 节点的函数 |
| `passes` | 编译步骤，声明在内置步骤 6 中的先后顺序；`after: 'execute'` 的步骤在编译时执行之后运行 |
| `executors` | 编译时执行用的执行器（第 4 节“执行”） |
| `renderer` | 本插件提供的渲染端（第 6 节） |
| `rendererExtensions` | 按渲染端 ID 提供的扩展，例如 notebook 渲染端把某个组件转换为单元格 |
| `vitePlugins` | 两种形态的开发服务器与构建加入的 Vite 插件，例如本地环境插件的开发服务器端点 |
| `roles` | 行内角色规格（2.8 节） |
| `services` | Node 端服务实现，编译步骤（`PassContext.service`）与渲染端（`RenderContext.service`）使用，例如 `lecture` 渲染端经 `SPEECH` 合成 |
| `environments` | 具名环境的提供方（2.7 节、第 4 节） |
| `server`、`tools` | 服务端贡献与 agent 工具，只在 `presmium dev`、`presmium serve` 中使用（`architecture.md` 4.7、4.8 节） |

- 指令与编译步骤通过 `ctx.src`、`ctx.resolvers` 读取文件，编译器记录读过的文件与读取时的 git 版本；其他方式读取的文件用 `ctx.watch(...files)` 声明。`presmium dev` 在这些文件或命名该版本的 git 引用（`HEAD`、所在分支、`packed-refs`）变化时重新编译（K-09）。编译器只知道传给 `ctx.src`、`ctx.resolvers` 的版本名：插件若先把分支或标签名（如 `{code-ref}` 的 `:pin:`、`:variants:`）解析为提交再读取，要自己用 `ctx.watch` 声明这些名字对应的 git 引用文件，否则这些分支前进时不会重新编译。`presmium dev` 在一次编译所依赖的文件都被监听之后才报告这次编译；编译开始后改动、监听前未能察觉的文件，按修改时间补一次编译。
- 渲染端扩展的组件转换函数为 `(node, block, ctx)`，`ctx` 是正在运行的渲染端的 `RenderContext`（输出目录、工作目录、渲染端配置），例如据此写出相对于渲染产物的路径。编译器把 `ctx` 绑定后交给渲染端，渲染端以 `(node, block)` 调用。
- 浏览器端（网页、幻灯片）按 `component` 节点的组件名，查找插件注册的 Vue 组件。组件仍只依赖 `@presmium/host`。浏览器端的注册约定见 `architecture.md` 第 5 节。
- 文稿自己的组件：文稿目录下 `components/` 中的 `.vue` 文件由编译器以插件 ID `deck` 登记，可以用 `{component}` 放进正文，两种形态都渲染（网页由 IR 运行时注册，幻灯片由 Slidev 的 `components/` 约定注册），编辑器的补全也列出它们。这些组件只能引用 `@presmium/host`、`@presmium/kernel` 与 vue，文稿的 `package.json` 要依赖 `@presmium/host`（`architecture.md` 5.1 节）。

### 5.1 指令一览

所有指令都接受 `:reveal:`（在下一步出现，`{slide}`、`{only}` 上还可写 `:reveal: items`）、`:label:`（块 ID）与 `:audience:`（受众，2.11 节）。下表的“步数”是块的 `span`（2.4 节）。

内置指令（编译器）：

| 指令 | 参数与正文 | 选项 | 生成 |
|---|---|---|---|
| `{slide}` | 正文为 MyST | `:reveal:`、`:reveal: items` | 正文中的块都是上屏内容 |
| `{only}` | 参数为渲染端 ID 列表；正文为 MyST | `:reveal:`、`:reveal: items` | 正文中的块限定于这些渲染端（`only`） |
| `{hints}` | 正文为 YAML，键为渲染端 ID | — | 章节的 `hints` |
| `{config}` | 正文为 YAML，键为插件 ID | — | 章节的 `config`，在本章节合并在全局插件配置之上 |
| `{component}` | 参数为组件名；正文为 YAML 属性 | `:span:`（步数）、`:plugin:`（插件 ID，默认为注册该组件的插件）；其余选项作为属性，值按 YAML 读取 | `component` 节点 |
| `{include}` | 参数为文件路径 | — | 引入文件的内容；被引入文件的 frontmatter 被忽略 |
| `{code}`、`{code-block}`、`{code-cell}`、`{sourcecode}` | 参数为语言；正文为代码 | `:caption:` 或 `:filename:`（标题）、`:emphasize-lines:`（强调的行，如 `2, 4-5`，各步都高亮这些行）、`:run:`、`:executor:`、`:timeout:`、`:env:`、`:session:`、`:echo:`（2.7 节） | `code` 节点 |
| `{audience}` | 参数为受众名列表 | — | 章节的 `audience`（2.11 节）；放在章节顶层，不生成块 |
| `{grid}`、`{grid-item}`、`{card}`、`{tab-set}`、`{tab-item}` | 见 2.10 节 | 见 2.10 节 | mdast `grid`、`gridItem`、`card`、`tabSet`、`tabItem`（MyST 标准写法） |

代码块的 `:run:` 取 `compile`（默认，构建时执行并录制输出）、`live`（只在浏览器中执行）或 `both`；`:executor:` 指定执行器 ID；`:timeout:` 为毫秒。`{code-cell}` 是 MyST notebook 的写法，编成同样的 `code` 节点，`:run:` 同样生效；MyST 为它生成的 `outputs` 节点被丢弃，输出只来自编译时执行，所以同一份源码两次编译得到相同的 IR。

组件内的代码：插件组件的子块中的代码块（例如执行面板、分步执行与本地环境包着的代码）属于组件，由组件运行并显示输出，这些代码块在网页与幻灯片中都不显示运行控件，也不显示录制的输出；notebook 由组件的扩展决定如何写出它们。

插件指令：

| 插件 | 指令 | 参数与正文 | 选项 | 生成与步数 |
|---|---|---|---|---|
| 代码引用 `presmium.code` | `{code-ref}` | 参数为锚点，如 `region:src/bpe.py#merge`；锚点中的文件路径相对于文稿所在 git 仓库的根目录，不在 git 中时相对于文稿目录 | `:pin:`（提交，默认工作区）、`:steps:`（逻辑单元名列表，即嵌套的 `#region`，每步高亮一个；`all` 或 `none` 表示这一步不突出任何单元）、`:variants:`（至少两个提交，逐步切换版本，不能与 `:pin:`、`:steps:` 同用）、`:lang:`（默认取文件扩展名）、`:repo:`（永久链接的仓库网址，默认取本章节的 `presmium.code.repo`）、`:run:`、`:executor:`、`:timeout:` | `code` 节点，带 `origin`、`highlight` 或 `variants`（每个版本带自己的行区间与永久链接）；步数为单元数或版本数减一。文件不存在时的诊断说明路径的基准，按文稿目录写的路径给出从仓库根目录起的写法 |
| 浏览器执行 `presmium.exec` | `{run-panel}` | 参数为语言：`python`（默认，`py`、`python3`、`ipython` 同义）、`javascript`、`typescript`；v0.8 起也可以是任何有执行器的语言（如 `wgsl`、`c`） | `:params:`（YAML 映射，注入程序的变量；JavaScript 中为常量；其他语言由执行器解释，如 `wgsl` 的缓冲区与派发说明）、`:timeout:`（毫秒，默认取本章节的 `presmium.exec.timeoutMs`）、`:recorded:`（执行失败或超时时显示的输出）、`:run:`（`both` 默认，同时在构建时录制；`live` 只在浏览器中执行）、`:env:`、`:session:` | `PmRunPanel`，子块为代码块，代码也在属性 `code` 中；`fallback`（PDF、PNG 导出）为先给参数赋值的代码，加上构建时的输出，构建时没有执行、执行失败或超时的用 `:recorded:`；notebook 中与内核同语言的为代码单元格（参数赋值在前），其他语言为代码（JavaScript、TypeScript 前面加上参数常量）加输出的 Markdown 单元格，输出的取法同 `fallback`。带超时而构建时没有正常结束的代码单元格标记 `skip-execution` |
| | `{step-run}` | 参数为语言（默认 `python`）；正文为代码 | `:steps:`（执行的行数，每行一步）、`:params:`、`:timeout:` | `PmStepRun`；步数为 `:steps:`。文档视图（全部展开）中组件有自己的步进控件（上一步、下一步与滑块），读者在其中逐行查看；网页中组件接近视口时才加载 Python 运行时并追踪 |
| 本地环境 `presmium.execLocal` | `{local-env}` | 参数为语言（默认 `python`）；正文为代码 | `:file:`（代码在工作区中的路径，必填）、`:workspace:`（devcontainer 所在目录，相对于本文件） | `PmLocalEnv`，子块为代码块；执行器 `presmium.container` 供代码块的 `:executor:` 使用。一份文稿只有一个工作区：各 `{local-env}` 指定不同的工作区时报错（`presmium.execLocal.workspace`）。全局配置 `workspace`、`priority`、`buildTimeoutMs`（构建镜像的时限，默认 10 分钟） |
| 引导 `presmium.guide` | `{cursor}` | 正文每行一个路径点：`[move\|hover\|click] <CSS 选择器>`，动作默认为 `move` | — | `PmCursor`；第 k 个路径点在块的第 k 步，步数为路径点数减一 |
| | `{spotlight}`、`{hint}` | 参数为目标的 CSS 选择器；正文为弹出说明 | `:title:`（说明标题）、`:span:`（持续的步数，默认 0） | `PmSpotlight`、`PmHint` |
| 富内容 `presmium.content` | `{markmap}` | 正文为标题与列表；开头的 YAML 块可写 `markmap` 选项 | — | `PmMarkmap`，降级为嵌套列表 |
| | `{video}`、`{audio}`、`{animation}` | 参数为媒体文件路径（相对于本文件，或包路径）；正文为说明文字 | `:controls:`、`:autoplay:`、`:loop:`、`:muted:`、`:width:`、`:height:`、`:alt:`；`{animation}` 另有 `:still:`（减少动态效果时的静止图片）；`{video}` 另有 `:poster:`、`:captions:`、`:captions-default:`（2.14 节） | `PmMedia`，降级为文件链接；媒体、封面与字幕文件由渲染端随产物发布（组件的 `assets`） |
| | `{youtube}` | 参数为 YouTube 视频 ID 或链接；正文为说明文字 | `:start:`（开始的秒数）、`:width:`、`:height:` | `PmYoutube`，降级为视频链接 |
| | ` ```plantuml ` 代码块（编译步骤） | — | 全局配置 `plantUmlServer` | 图片节点 |
| 发布 `presmium.publish` | 无指令；高对比度开关在两种形态的工具栏中，`{component} PmContrastToggle` 可以在正文中另放一个 | — | 全局配置 `offline: false` 关闭离线 | 编译步骤 `remote-assets` 把远程图片下载到 `.presmium/assets`（随文稿提交） |
| 讲台 `presmium.stage` | 无指令；内容由渲染端直接呈现 | — | — | 编译步骤 `footnotes` 把脚注定义移到引用它的块所在步骤与角色 |
| 课堂 `presmium.classroom` | `{quiz}` | 正文为题干（MyST），之后是任务列表形式的选项：`- [ ] 错误项`、`- [x] 正确项` | — | `PmQuiz`，属性为选项与答案；notebook 中为题干与选项，答案折叠 |
| | `{exercise}` | 参数为语言（默认 `python`，只有 Python 能校验）；正文为题面，之后两个代码块：起始代码、校验代码（每条顶层语句一项校验） | `:timeout:`（毫秒） | `PmExercise`；notebook 中为题面与两个代码单元格（起始代码、校验） |
| | `{question-box}` | 正文为提示语 | `:target:`（本章节中一个带标签的块，问题挂在它上面） | `PmQuestionBox`；notebook 中不生成单元格 |
| | `{pulse}` | 参数为问题（默认“这一节理解了吗？”）；正文为说明 | `:levels:`（至少两个选项，逗号分隔；默认“懂了、有点模糊、没懂”） | `PmPulse`；notebook 中不生成单元格 |
| | `{predict}` | 参数为问题；正文为补充说明 | `:choices:`（逗号分隔的选项；省略时写文字） | `PmPredict`，揭示内容为它的子块（2.13 节）；步数 1；notebook 中为问题、选项与折叠的揭示内容 |
| 远端环境 `presmium.execJupyter` | `{terminal}` | 参数为 `kind: jupyter` 的环境名 | `:height:`（行数，默认 16） | `PmTerminal`（2.7 节）；降级为一行说明；notebook 中不生成单元格 |
| 会话 `presmium.session` | 无指令 | — | 全局配置 `server`（课堂服务的地址，`ws://` 或 `http://` 均可）；没有时文稿照常放映，会话显示未连接 | 浏览器端提供 `session` 与 `classroomStore` 服务 |

课堂插件另有编译步骤 `classroom-places`：给每个课堂组件加上属性 `place`（所在章节与块的 ID、章节标题与序号，块 ID 在编排步骤之后才确定），并检查 `{question-box}` 的 `:target:` 是否是本章节的块。

行内角色：

| 插件 | 角色 | 内容与选项 | 生成 |
|---|---|---|---|
| 内置（MyST） | `{button}` | ``{button}`文字 <地址>` `` | 带 `kind: 'button'` 的链接（2.10 节） |
| 讲授 `presmium.lecture` | `{cue}` | 内容为命令；`to`、`lines`、`sel` | `presmiumRole`，子内容为空（2.9 节） |
| | `{say}` | 内容为显示的文字；`alias` | `presmiumRole`，子内容为显示的文字 |

讲授插件检查 `{cue}` 的 `to` 是本章节中带标签的块（`presmium.lecture`）。课堂插件的编译步骤 `predict-reveals` 把 `{predict}` 之后一步的内容移入它的子块（2.13 节）。

脚注定义留在书写它的章节（以及 `{slide}`、`{only}`）中；引用与定义须在同一文件。被引入的各文件可以用相同的脚注名，每个文件的脚注各自从 1 起编号（第 4 节）。

## 6. 渲染端

渲染端实现以下接口：

```ts
interface Renderer {
  id: string                                     // 'web' | 'slides' | 'notebook' | ...
  site?: boolean                                 // 生成以站点路径（base）服务的网站
  support(node: IRNode, extensions: RendererExtension[]): 'full' | 'degraded' | 'none'
  prepare?(doc: IRDocument, ctx: RenderContext): Promise<void>         // 只生成工作目录（如 Slidev 文稿），不构建
  build(doc: IRDocument, ctx: RenderContext): Promise<RenderOutput>
  dev?(doc: IRDocument, ctx: RenderContext): Promise<RenderDevServer>   // update() 接收新的 IR
}
```

`RenderContext` 提供文稿目录 `deckDir`、文稿所在仓库的根目录 `workspaceRoot`（不在仓库中时为文稿目录）、输出目录 `outDir`、工作目录 `workDir`、本渲染端的配置、各插件的扩展与插件列表，以及：

| 字段 | 内容 |
|---|---|
| `lang` | 文稿的语言（`meta.lang`），渲染端写入产物的文字按它选择（`deckLocale`） |
| `pluginDirs` | 编译器加载的每个插件包的目录，渲染端由此加载插件的组件，与编译器用同一份 |
| `extensionFor(node)` | 本渲染端处理一个组件节点的扩展：优先取节点 `plugin` 所属插件的，所有渲染端选中的是同一个 |
| `portable(value, from)` | 发布配置时把仓库内的绝对路径改为相对于 `from` 的路径 |
| `localAsset(source, url)` | 块中引用的本地文件：相对于块所在的源文件，或 `/...`（文稿的 `public/`）；按 URL 解码（转义不完整时保留原文），给出文件与发布名 `<内容哈希前 8 位>-<文件名>`；远程地址或文件不存在时为空 |
| `renderers`、`base` | 本次构建或开发运行的全部渲染端，与本渲染端的站点路径（2.1 节） |
| `vitePlugins` | 插件提供的 Vite 插件（第 5 节），运行 Vite 的渲染端在开发与构建中加入 |渲染端发布插件配置时，把位于 `workspaceRoot` 内的绝对路径改为相对路径（网页相对于文稿目录，幻灯片相对于生成的 Slidev 文稿所在目录），产物因此不随检出位置变化（`architecture.md` 4.2 节）。工作目录存放渲染途中生成、跨次构建保留的文件：`build` 中为 `<文稿>/.presmium/<渲染端 ID>`，`dev` 中与输出目录相同；用到它的渲染端自行创建，并使它不进入 git。幻灯片渲染端把生成的 Slidev 文稿（`slides.md`）写在工作目录中，`slidev export` 与发布插件的导出、视觉差异都在这里进行；构建报告的每个输出都给出 `workDir`。生成的文稿按幻灯片的站点路径写出（链接到的本地文件与组件属性中的文件地址带上 `base`），而 `slidev export` 总在根路径服务文稿：`base` 不是 `/` 时（例如同时构建两种形态的默认 `/slides/`），构建报告提示改用 `presmium-export`，它为导出另写一份以 `/` 为 `base` 的文稿。

各渲染端用同一套规则把 MyST 降为标准 Markdown（`@presmium/kernel` 的 `lowerMyst`）：幻灯片中图注独立成段，`{dropdown}` 写成 `<details>`，定义列表保留结构，`#标签` 的交叉引用链接到目标章节所在的页。插件组件由渲染端包在错误边界 `PmBoundary` 中，组件自身出错只影响它自己（`architecture.md` 5.4 节）；扩展抛错时渲染端在块的位置报告警告，改为写组件标签或 `fallback`。

渲染端发布块中引用的本地文件：Markdown 中的图片与链接，以及组件在 `assets` 中声明的属性。网页把文件发布在站点的 `media/` 下；幻灯片把它们复制到生成的 Slidev 文稿的 `public/`，从站点根路径引用（构建时加上站点路径，翻页预加载也不再请求不存在的相对路径），链接到的文件在新标签页中打开；notebook 把它们复制到 notebook 旁边的 `media/`。文件名中的 `#`、`?` 写作 `%23`、`%3F`，转义不完整的地址不使构建失败。幻灯片的讲解（演讲者备注）是 Slidev 原样显示的 HTML，不经 Vite 处理，其中的图片因此也写成带站点路径的地址。

幻灯片渲染端把每页写成 Slidev 编译的 Vue 模板。`slidev build` 因某一页失败时（例如原始 HTML 的标签没有闭合），错误报告在源码中：该页的章节里只有一个块含原始 HTML 时报告在这个块的位置，否则在章节标题处，而不是生成的 `slides.md__slidev_<页号>.md`。

notebook 渲染端把 Markdown 写成 Jupyter 能显示的 CommonMark、GFM 表格、内联 HTML 与 `$` 公式，不写 MyST 语法：提示框（`{note}` 等）与旁注写成带粗体标题的引用块，`{list-table}` 等表格写成 GFM 表格，`{dropdown}` 写成 `<details>`，图写成图片加斜体标题，公式写成 `$$`，`{sub}`、`{sup}`、`{kbd}`、`{abbr}` 等角色写成内联 HTML，交叉引用写成它的文字。正文中的 `$`（如价格）写作 `\$`，不被 Jupyter 当作公式；表格单元格中的行内内容直接拼接，只在换行与块级内容处断开。没有对应写法的节点（如 `{embed}`、`{iframe}`）保留其中的文字，并作为降级在构建报告中逐块列出（警告，带源码位置）。网页与幻灯片把 `{iframe}` 写成 figure 中的 `<iframe>`。

notebook 渲染端把它显示的图片与链接所指向的本地文件（如本地化的 PlantUML 图、媒体的降级链接）复制到 notebook 旁边的 `media/` 并改写路径，notebook 目录可以整体移动。只复制实际写入 notebook 的地址所指的文件：组件由插件扩展或降级内容显示时，其子块中的文件不复制。地址按 URL 解码后查找文件（文件名中的 `#`、`?` 写作 `%23`、`%3F`），转义不完整的地址原样保留。

### 6.1 富输出（P-102）

| 渲染端 | 处理 |
|---|---|
| 网页（IR 运行时） | 每个输出按 MIME 类型选择渲染器，顺序同 JupyterLab：`text/html`（DOMPurify 清洗后内联显示）、`text/markdown`（转为 mdast 后照正文显示）、`text/latex`（KaTeX）、`image/svg+xml`、`image/png`、`image/jpeg`、`image/gif`、`application/json`、`text/plain`；`stream` 与 `error` 的 ANSI 转义转为样式。插件可以为新的类型注册渲染器（`registerNodeRenderer('mime:<类型>')`），优先于内置的。`echo: false` 的代码块不显示代码，`text/markdown` 输出不加输出框 |
| 幻灯片 | 录制的输出写进 Slidev 文稿：图片为 `<img>`（数据较大时作为文件发布），`text/markdown` 为 Markdown，`text/html` 放进没有脚本权限的沙箱 iframe（`srcdoc`），其他为文本；带 `live` 或 `both` 的代码块写成 `{monaco-run}`（`architecture.md` 9.2 节） |
| notebook | 把 `outputs` 原样写入代码单元格的 `outputs`（`execution_count` 按顺序编号）；`echo: false` 的单元格带元数据 `jupyter.source_hidden` |
| 静态导出（PDF、PNG） | 使用录制的输出，同幻灯片 |

### 6.2 发布的文件（P-79）

三种媒介一致地发布块中引用的本地文件，规则同上文（`localAsset`，发布名 `<内容哈希前 8 位>-<文件名>`）：

- **正文链接**：链接到本地文件（起始代码、数据、模板）时，网页把文件发布在 `media/` 下并改写链接，与幻灯片、notebook 一致。
- **目录**：链接到本地目录时，网页与幻灯片生成一个文件清单页 `media/<哈希>-<目录名>/index.html`（列出目录中的文件，每个文件可以下载），notebook 把目录复制到 `media/` 并链接到它。
- **原始 HTML**：原始 HTML 中 `src`、`poster`、`href` 引用的本地文件同样发布并改写地址。
- 无法发布的本地引用（文件不存在、指向文稿所在仓库之外）是警告级诊断，带源码位置；`presmium check` 的 `presmium.links` 报告同样的问题（2.11 节）。

### 6.3 讲授渲染端、工作区站点与译本

- **`lecture`**：讲授插件提供的站点渲染端。它把自己的视图（`viewFor(doc, 'lecture')`）编为讲授计划（每一步要说的文字与提示标记，2.9 节），经 `RenderContext.service(SPEECH)` 合成（先查合成缓存，命中的段落不重新合成，全部命中时不向引擎发请求；只为缺失的段落调用引擎并写入缓存；缺失又没有可用的引擎时报错并指出段落），写出 `dist/lecture/<id>/track.json`、音频片段与 `index.json`（讲授列表）；文稿目录 `lectures/` 中录制的讲授轨与音频一并发布。网页的讲授视图从同一站点的 `../lecture/` 读取，分开部署时在 `presmium.lecture.url` 中写明地址。
- **工作区站点**：网页渲染端实现 `buildSite` 与 `devSite`（`architecture.md` 4.10 节）：首页是文档列表（搜索与标签），或工作区配置指定的一份文档；每份文档在 `/<文档目录>/` 下，内部仍按章分页；搜索索引包含全部文档；页末的上一章与下一章跨越文档，按工作区配置中的顺序。
- **译本**：网页渲染端把 `RenderContext.translations` 中的每个译本构建为 VitePress 的一个 locale（`/<语言>/`），语言菜单在两种语言的同一章节之间切换。

### 6.4 行内角色

`presmiumRole` 节点：各渲染端显示 `children`；演讲者备注（幻灯片）与演讲者窗口、编辑模式（网页）中，没有子内容的角色显示标记 `〔<名> <value>〕`（2.8 节）。notebook 只写 `children`。

### 6.5 降级

降级规则：

| 支持程度 | 渲染端的处理 |
|---|---|
| `full` | 正常渲染 |
| `degraded` | 渲染 `component` 节点的 `fallback`；没有 `fallback` 时渲染一行说明并附网页版链接（2.1 节） |
| `none` | 跳过，并在构建报告中列出 |

## 7. 命令

命令都写作 `presmium <命令> [deck] [选项]`，`deck` 是含 `lecture.md` 的文稿目录或入口文件，默认当前目录。退出码：0 没有错误，1 有错误级诊断，2 用法错误或内部错误。

| 命令 | 选项 | 作用 |
|---|---|---|
| `presmium build` | `--to <ids>`（渲染端，逗号分隔）、`--out <dir>`（默认 `<deck>/dist`）、`--audience <受众>`（只构建给该受众的内容并扫描产物，2.11 节）；在工作区根目录执行时构建整个工作区站点（第 10 节） | 编译并生成媒介：`<out>/ir.json`（相对路径，第 3 节）与 `<out>/<渲染端 ID>/`。不写 `--to` 时生成文稿头部 `renderers` 中配置的渲染端，没有配置时生成全部已安装的渲染端；各渲染端并行构建；删除执行缓存中文稿已不存在的代码的录制 |
| `presmium dev` | `--to <ids>`、`--out <dir>`（工作目录，默认 `<deck>/.presmium/dev`）、`--server-port <n>`（服务端的端口，默认空闲端口）、`--allow <种类,…>`（不询问就放行的确认种类：`operate`、`spend`、`write`、`agent`） | 监听源码与编译读取过的文件（第 5 节），增量编译，启动对应渲染端的开发服务器并打印其地址。保存频繁时合并排队的编译；被引入而尚不存在的文件在创建后即被编译；头部的 `plugins` 或 `renderers` 变化时提示重启 |
| `presmium ir` | `--out <file>` | 输出 IR JSON（绝对路径），诊断写到标准错误；用于调试 |
| `presmium check` | `--json`（JSON 输出）、`--update-lock`（先在工作区重新解析全部锚点，重写 `.presmium/anchors.lock.json`）、`--env`（连接每个具名环境，报告不可达的环境）、`--audience <受众>`（按该受众编译后检查）、`--external-links`（用 lychee 检查外部链接） | 完整编译（含编译时执行），再运行各插件的检查项（`Check`），只输出诊断 |
| `presmium serve` | `[目录]`（工作区根目录或一份文稿，默认当前目录）、`--port <n>`（默认 4310）、`--host <地址>`（默认 `127.0.0.1`；其他地址要求配置登录代理）、`--trust-proxy-from <地址>` | 工作区服务（P-120）：工作区站点的开发服务器、编辑模式、文档管理、助手、MCP 与各插件的服务端贡献（`architecture.md` 第 10 节） |

插件包还提供辅助命令（`presmium-export`、`presmium-diff`、`presmium-classroom-server`、`presmium-language-server`，以及 v0.8 的 `presmium-mcp`、`presmium-lecture`、`presmium-speech`），见 `architecture.md` 第 7 节。

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

讲授插件另外注册视图 `lecture`（`?view=lecture&track=<id>`）：以讲授轨驱动真实页面的回放（第 9 节），并在放映视图的工具栏中加入录制。编辑模式（工作区提供）中，助手插件给每个块加上批注入口（按 `.pm-block[data-block]` 定位，源码位置取自 IR 中块的 `source`）。

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

## 9. 讲授轨格式（P-130）

### 9.1 文件

| 文件 | 内容 | 是否提交 |
|---|---|---|
| `lectures/<id>/track.json` | 讲授轨：语音段、事件、音频片段、块指纹、IR 哈希、音色 | 提交 |
| `lectures/<id>/audio/*.ogg` | 录制的音频（Ogg/Opus，可以跳转），每节一段 | 默认不提交：讲授插件在 `lectures/<id>/` 写一个忽略 `audio/` 的 `.gitignore`；运营者设置 `settings.presmium.lecture.audio`（第 10 节）可以改为 git LFS 或外部地址 |
| `.presmium/speech/<键>.ogg`、`<键>.json` | 合成缓存：音频，与逐字时间、时长、引擎信息、AI 生成标识 | 提交（Opus 约 24 kbps，一小时约 11 MB），或用 LFS |
| `.presmium/speech.lock.json` | 文稿用到的合成键与音频的 sha256 | 提交 |
| `.presmium/speech/consent/<引擎>/<音色>.json` | 克隆音色的同意记录：说话人、范围、日期、同意声明录音的 sha256；语音服务合成克隆音色前检查它（`architecture.md` 第 11 节） | 提交 |

讲授轨借鉴 asciinema 的 asciicast（事件是元组，不认识的类型忽略），时间用自讲授开始的绝对毫秒，便于跳转与编辑：

```json
{ "track": 1, "id": "bpe-2026-10-16", "doc": "lecture.md", "lang": "zh-CN", "ir": { "hash": "…" },
  "voice": { "kind": "recorded", "speaker": "张老师" },
  "audio": [{ "section": "merge", "start": 0, "src": "audio/merge.ogg", "duration": 312.4, "sha256": "…" }],
  "blocks": { "merge/code-1": { "fp": "…", "lines": 14 } },
  "utterances": [{ "id": "u12", "t": 81200, "d": 5400, "text": "我们先看这三行",
                   "words": [[81200, 210, "我"]], "section": "merge", "step": 2,
                   "translations": { "en": { "text": "First, these three lines", "source": "sha256:…" } } }],
  "events": [[81000, "go", { "section": "merge", "step": 2, "view": "present" }],
             [82100, "spot", { "block": "merge/code-1", "lines": "3-5", "at": ["u12", 4] }],
             [82300, "point", { "block": "merge/code-1", "path": [[0, 0.31, 0.42], [40, 0.33, 0.44]] }],
             [90500, "run", { "block": "merge/code-1", "result": "freeze:ab12" }]] }
```

- `voice`：`{ kind: 'recorded', speaker }`，或 `{ kind: 'synthetic', engine, model, voice }`；合成的讲授在播放界面标明“AI 合成语音”。
- `audio`：录制的讲授每节一段音频（`start` 是该段在讲授中的开始时刻，秒）；合成的讲授没有这一项，片段由语音段经合成缓存给出（`ClipClock`）。
- `blocks`：被事件引用的块的内容指纹（键为 `<章节 ID>/<块 ID>`）与行数；`ir.hash` 是录制时的 IR 哈希。两者用于漂移检查。
- `utterances[].words`：`[开始毫秒, 时长毫秒, 字或词]`；中文为单字。`translations` 的 `source` 是翻译时原文的摘要，与当前原文不一致即过期（P-137）。

### 9.2 事件词汇

| 类型 | 数据 | 报告者 |
|---|---|---|
| `go` | `section`、`step`、`view` | IR 运行时（导航） |
| `point` | `block`、`path`（`[毫秒偏移, x, y]`，块内相对坐标 0 到 1；代码块另带 `line`） | 讲授插件（指针） |
| `spot`、`hint` | `block` 或 `selector`、`lines`、`span` | 引导插件 |
| `ink` | `block`、`lines` 或 `range` | 讲授插件（激光笔、荧光笔） |
| `select` | `block`、`range` | 讲授插件 |
| `click` | `block`、`action`（组件的具名动作，不是原始的 DOM 点击） | 提供该动作的插件 |
| `run` | `block`、`result`（`freeze:<缓存键>`，回放时默认重放录制的结果） | 执行插件 |
| `scroll` | `block`、`fraction` | 讲授插件 |
| `mark` | `label` | 讲授插件（章节标记，导出为 `chapters.vtt`） |
| `pause` | `ms` | 讲授插件 |

- 任何事件可以带 `at: [语音段 ID, 字偏移]`：时刻由该字的时间决定；改文字、换音色、重新合成某一段后按新的逐字时间重新计算（“改文字、换音色，操作跟着走”）。
- 插件自己的类型以插件 ID 开头（如 `presmium.classroom.quiz`），由该插件登记重放；回放忽略没有插件重放的类型。
- 时刻 t 的画面是 t 之前事件的折叠：`state(t) = fold(events ≤ t)`。回放每帧与每次跳转后，经宿主的 `OPERATIONS` 依次重放（跳转时先 `clear`），由此重建导航、聚光、指针与执行结果。

### 9.3 导出与检查

- 导出（只作为交换格式，不作为主存储）：`captions.<语言>.vtt`（每种语言一份，含译文；过期的译文导出时警告）、`chapters.vtt`（由 `mark` 与章节切换生成）、`events.vtt`（元数据轨，每个事件的 JSON）。
- 检查项 `presmium.lecture`：按块指纹与 IR 哈希报告移动、失效的块与变化的步骤数，分级同锚点（exact、moved、fuzzy、lost）；`{cue}` 的目标不存在；合成缓存缺失又没有可用的引擎（经 `CheckContext.service(SPEECH).engines()` 判断）时指出是哪些段落。回放时丢弃失效的事件并提示。

## 10. 工作区配置（P-120 至 P-122）

工作区根目录的 `presmium.workspace.yaml`：

```yaml
title: 智能体软件工程
documents: ['weeks/*/lecture.md', 'syllabus/lecture.md']   # 文档的位置，按此顺序列出与前后导航；默认 '*/lecture.md'
site:
  home: syllabus                     # 首页显示的文档目录；省略时首页是文档列表（P-122 增补）
  nav: [{ text: 大纲, link: /syllabus/ }, { text: 第 1 周, link: /weeks/01/ }]
  footer: { message: 课程资料按 CC BY 4.0 发布 }
  head: { description: 一门讲智能体工程实践的课程 }
  sitemap: { hostname: https://course.example.edu }
members:
  owners: [teacher@example.edu]
  editors: ['group:course-staff']    # 按登录代理传来的组
approvals: { operate: ask, spend: ask, write: ask, agent: ask }
templates: templates/document        # 新建文档的模板目录；默认使用随包提供的模板
settings:                            # 插件的运营者设置，键为插件 ID（ServerContext.settings、NodeServiceContext.settings）
  presmium.assistant:
    command: [dsh, --profile, presmium, --patch, '{templates}/presmium.cordis.yml']
    tutor: [dsh, --profile, presmium-tutor, --patch, '{templates}/presmium-tutor.cordis.yml']
    provider: DeepSeek               # 模型的服务提供方，界面据此标明
  presmium.lecture: { audio: ignore }   # 录制音频的去处：ignore（默认）、lfs，或外部地址的前缀
  presmium.speech: { cloned: false }    # 是否允许克隆音色（默认 false；允许时每个克隆音色仍要有同意记录）
```

- 文档的身份是目录；标题、语言与标签取自各文档的头部（`title`、`lang`、`tags`）。
- `site` 的 `nav`、`footer`、`head`、`sitemap` 与 `renderers.web` 的同名选项相同（2.1 节），作用于整个工作区站点。
- `members` 与 `approvals` 只在 `presmium serve` 中使用。`settings` 是插件的运营者设置：`presmium dev`、`build`、`check` 与 `presmium serve` 都读取文稿所在工作区根目录的这个文件（单份文稿的仓库也可以只写 `settings`），只在进程启动时读取一次，运行中改动要等运营者重启才生效。
- `presmium.assistant` 的命令中 `{templates}` 代入助手插件随包提供的 DeepSeek Harness 配置模板目录；命令也可以由环境变量 `PRESMIUM_AGENT_COMMAND`（`tutor` 模式为 `PRESMIUM_AGENT_TUTOR_COMMAND`）给出，环境变量优先，`provider` 也可以由 `PRESMIUM_AGENT_PROVIDER` 给出。两处都没有命令时助手不可用，不启动任何 agent。
- 这些设置都不能写在文稿中：文稿头部 `presmium.<插件 ID>` 中的同名键不进入 `settings`。
