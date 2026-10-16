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
plugins:                       # 插件包名；presmium serve 中只能是运营者列出的包（第 10 节）
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

`renderers` 列出的渲染端就是 `presmium build` 默认构建的渲染端（第 7 节）。每个渲染端都可以用 `package` 换成另一个包（`presmium dev`、`build`、`check` 同 `plugins` 一样接受相对路径与文稿目录 `node_modules` 中的包；`presmium serve` 只接受运营者列出、安装在工作区根目录的包，其他的给出错误级诊断 `presmium.plugins`，D14，第 10 节）；其余选项：

| 渲染端 | 选项 |
|---|---|
| `web` | `base`（站点路径）、`port`（开发服务器端口） |
| `slides` | `base`、`port`；其余选项写进生成的 Slidev 文稿头部，如 `theme`、`routerMode`（`hash` 时页地址为 `/#/<页号>`）、`exportFilename`、`addons` |
| `notebook` | `kernel`：内核名（默认 `python3`），或 `{ name, language, display_name }`，与内核同语言的代码成为代码单元格；`webUrl`：网页版的地址，notebook 显示不了的组件附上指向它的链接 |
| `web`（v0.8，P-78） | `nav`：顶部导航，`[{ text, link }]`（VitePress `themeConfig.nav` 的形状）；`footer`：`{ message, copyright }`；`head`：`{ description, image }`，写成页面的 `description` 与 OG 元数据（`og:title`、`og:description`、`og:image`）；`sitemap`：`{ hostname }`，生成 `sitemap.xml` |
| `lecture`（v0.8，讲授插件提供） | `voice`：`{ engine, voice, rate, style }`，写了 `voice` 才合成讲义的讲授（WP-83：合成要花钱，所以要显式选用音色；`engine` 省略时用 `presmium.speech.engine`）；`script`：单独的讲授脚本文件（2.9 节）；`gap`：一步说完之后推进前的停顿，默认 `500ms`（毫秒数或 `800ms`、`1.5s`）。`lecture` 是站点渲染端：与网页一同构建时输出在 `dist/lecture/`，网页的讲授视图从 `../lecture/` 读取 |

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
| `presmium.lecture`、`presmium.speech` | 讲授与语音插件的配置：读音词典、默认的合成引擎 `engine` 与转写引擎 `transcribe`（引擎 ID）；音色在 `renderers.lecture.voice` 中。只写名字，不写地址、凭据或存放凭据的变量名（`architecture.md` 第 11 节） |

文稿头部不能写凭据：`presmium check` 对像凭据的值告警（`architecture.md` 第 11 节）。文稿也不决定凭据发往哪里：语音引擎 `<ID>` 由运营者在服务端的环境变量中定义：地址 `PRESMIUM_SPEECH_<ID>_URL`、服务提供方的名字 `PRESMIUM_SPEECH_<ID>_PROVIDER`（界面据此标明，必需）与可选的凭据 `PRESMIUM_SPEECH_<ID>_KEY`，凭据只发往同一组中的地址（`volcengine` 的地址与名字“火山引擎”固定，只需 `PRESMIUM_SPEECH_VOLCENGINE_KEY`；旧控制台的密钥另要 `PRESMIUM_SPEECH_VOLCENGINE_APPID`，WP-82），文稿用 ID 选用；`presmium.speech` 中出现 `url`、`keyEnv` 等引擎定义是错误级诊断，不被使用。远端环境的地址与令牌同样成对（2.7 节）。引擎 ID 按变量的写法比较，不分大小写，`-` 与 `_` 相同：文稿的 `engine: my-engine` 选用 `PRESMIUM_SPEECH_MY_ENGINE_URL` 定义的引擎 `my_engine`（WP-82）。WP-82 另有两个可选的运营者变量：`PRESMIUM_SPEECH_<ID>_MODEL` 与 `_TRANSCRIBE_MODEL`（OpenAI 音频接口形态的引擎的合成与转写模型，默认 `tts-1` 与 `whisper-1`，例如 Groq 的 `whisper-large-v3-turbo`）；`presmium.speech` 中 `cloned`、`consentDir` 是运营者设置，写在文稿中是警告且被忽略，其他不认识的键也是警告（检查 ID `presmium.speech`）。确认策略、agent 的启动命令与模型、录音的去处也不在文稿中设置，它们来自命令行、环境变量与工作区配置的运营者设置（第 10 节）。

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

讲解与表格单元格中的原始 HTML 标签，若不是 HTML 元素，也不是 `<svg>` 中的 SVG 元素或 `<math>` 中的 MathML 元素（例如 agent 轨迹中的 `<reminder>`、`<system-reminder>`），按字面显示为文字：编译器把它们写成 IR 中的文本，三种媒介都显示标签本身，幻灯片的构建也不因没有闭合的这类标签失败。其他位置的原始 HTML 照常作为 HTML（例如正文中的 Web 组件）。

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
| `adapter` | `webgpu`：编译时录制所用的适配器：`auto`（默认，Chromium 经 Vulkan 找到显卡时用显卡，否则用 SwiftShader）、`gpu`、`swiftshader`（CPU 模拟，任何机器上录制都相同）；浏览器中由浏览器决定 |

WASI 与 WebGPU 的执行器按语言登记（`c`、`cpp`、`ruby`、`sql`；`wgsl`），不声明环境也能运行；声明 `kind: wasi` 或 `kind: webgpu` 的环境只是为了用 `:env:` 明确选择。

实现（WP-74）：WebAssembly 插件 `@presmium/slidev-addon-exec-wasi` 的执行器 ID 为 `presmium.wasi`，语言名另接受 `c++`、`cc`、`cxx`（C++）、`rb`（Ruby）与 `sqlite`（SQL）；`kind: wasi` 的环境可以用 `languages` 限定语言。C 与 C++ 由 WebAssembly 中的 clang 8 编译（与 Runno 相同的 `-O2 -Werror`：默认开启的警告也按错误处理；编译错误是这次运行的输出，退出码为编译器的），SQL 在内存数据库中执行，Ruby 为 3.2。编译时与浏览器中用同一份二进制运行，构建机不需要工具链。程序可以读 `RunRequest.files`（放在根目录，C 程序以绝对路径 `/<名字>` 打开）与标准输入，编译时得到清理过的环境变量（`RunContext.env`），浏览器中没有环境变量；不支持参数（`args`）与会话（`:session:` 被忽略，每次运行是一个独立的程序）。插件的编译步骤把浏览器中运行的代码需要的运行时写进 `config.presmium['presmium.execWasi'].runtimes`，两种形态只发布这些运行时（C 与 C++ 约 52 MB）。插件配置 `presmium.execWasi.loadTimeoutMs`：浏览器中下载与编译运行时的时限，默认 120 秒。`wgsl` 计算着色器用 `{run-panel} wgsl` 运行，`:params:` 是 YAML 写的缓冲区与派发说明（`buffers`、`dispatch`、`entry`、`repeat`、`features`），结果是读回的缓冲区摘要与计时。

````md
```{run-panel} wgsl
---
params:
  buffers:
    a: [1, 2, 3, 4]          # 数据；类型取自着色器的 array<f32>
    b: { data: [10, 20, 30, 40] }
    out: { size: 4 }         # 4 个值，初值 0（fill 给出别的初值）
  dispatch: 1                # 每个维度的工作组数，1 到 3 个数
  repeat: 10                 # 在同一组缓冲区上运行 10 次，计时取中位数
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

实现（WP-75）：`buffers` 按着色器中缓冲区变量（`var<storage>`、`var<uniform>`）的名字给出每个缓冲区，写成数字列表（数据），或 `{ data, size, fill, type, read }`；组、绑定、存储的读写与值的类型（`f32`、`i32`、`u32`）取自着色器的声明（结构体类型的统一缓冲区默认 `f32`，`type` 可以指定）。着色器声明的每个缓冲区都要在 `buffers` 中，反之亦然。可写的存储缓冲区（`read_write`）在运行后读回并显示，`read` 可以改变。`entry` 省略时用着色器中唯一的计算入口；`repeat` 默认 1，至多 1000；全部缓冲区至多 128 MiB。结果的文本（`stdout`）如：

```text
out: f32[4] = [11, 22, 33, 44]
计时：每次派发 0.0331 ms（10 次的中位数；GPU 时间戳；CPU 模拟）
适配器：google swiftshader（回退适配器）
```

长的缓冲区显示首尾各 4 个值与最小、最大、平均；编译时的录制为英文（`time: … ms per dispatch (…)`、`adapter: …`）。执行面板的表单中每个参数是一个输入框（列表与映射写成 JSON，也就是 YAML），可以改了再运行。不能运行时（浏览器没有 WebGPU、没有适配器、缺少特性或限制、设备丢失、超时）显示编译时录制的输出与原因。Python 中经 `presmium_gpu` 运行同样的着色器（`await presmium_gpu.run(SHADER, buffers={…})`，代码块顶层可以 `await`；有 JSPI 的浏览器另有 `presmium_gpu.run_sync`），JavaScript 与 TypeScript 中 `import { numpy as np } from '@jax-js/jax'` 使用 jax-js（`:run: live`，只在浏览器中运行）；`architecture.md` 4.6 节。

浏览器中，同一会话的状态按页面实例隔离：每个打开的页面（每个学习者）各有一份，重新加载即重新开始；代码块旁的“重置会话”丢弃它（`Executor.endSession`）。编译时，同一会话的代码块按在文稿中出现的顺序在同一个解释器中运行（第 4 节的会话键链）。

实现（WP-73b）：`:env:` 与 `:session:` 由编译器读取，所以插件的指令（`{run-panel}`、`{code-ref}`）不必自己声明它们：指令的结果中有带 `run` 的代码（它自己，或组件的子块）时，编译器把环境与会话写进它的 `run`；指令声明了同名选项时由指令自己处理；结果中没有要运行的代码时警告这两个选项不起作用。执行面板经执行插件的编译步骤把 `run.executor`、`run.session` 作为属性 `executor`、`session` 交给组件。头部的 `execute` 原样写入 IR 的 `config.execute`（只保留合法的部分：`env`、`environments` 中带 `kind` 的项、`rerun`），环境名只能由字母、数字、`_`、`-` 组成，`browser` 是保留名。Python 代码中 `display(obj)` 不必导入，`IPython.display` 的 `Markdown`、`HTML`、`Latex`、`SVG`、`JSON`、`Image` 由运行器提供（浏览器与编译时一致，不用安装了的 IPython），matplotlib 的图在 `plt.show()` 与运行结束时成为 `image/png` 输出（`architecture.md` 4.6 节）。

远端环境的浏览器终端（P-107）：

```md
:::{terminal} gpu
:height: 20
:::
```

`{terminal}` 的参数是一个 `kind: jupyter` 的环境；它打开该 Jupyter Server 的一个终端（凭据方式同环境）。静态产物中，`proxy` 方式的终端显示说明而不连接；`prompt` 方式照常可用。

实现（WP-76）：`{terminal}` 生成 `PmTerminal`（属性 `env`、`rows`），读者点“打开终端”后连接（`prompt` 方式这时询问令牌），离开页面时关闭终端；`fallback` 是一行说明（按文稿语言）。环境不存在或不是 `kind: jupyter` 时，编译步骤 `presmium.execJupyter.terminals` 在指令的行上报错。`kind: jupyter` 的环境：运营者变量中的名字是环境名的大写，其他字符变为 `_`（`my-gpu` 为 `PRESMIUM_ENV_MY_GPU_URL`）；构建时 `prompt` 方式同样用运营者的一对录制输出（没有学习者）；`languages` 省略时按内核规格的语言判断；`image` 与内核规格的哈希、`kernel_info` 的版本组成环境指纹。服务端的代理只为 `auth: proxy` 的环境挂载。

### 2.8 行内角色

MyST 的角色写作 ``{名}`内容` ``，角色名之后可以写选项：``{cue to=code-1 lines=3-5}`spot` ``（myst-parser 按登记的选项解析）。插件用 `PresmiumNodePlugin.roles` 登记角色（`RoleSpec`）：

- 登记过的角色在 IR 中保留为 mdast 节点 `{ type: 'presmiumRole', plugin, name, options, children }`，`options` 另带 `value`（反引号中的内容）。不认识这个角色的渲染端只显示 `children`。
- 没有登记的角色照旧压平为文字，并给出警告。
- 选项只能写成 `key=value`（只写键是 myst-parser 的语法错误），按 `RoleSpec.options` 声明的类型读出（`list` 按空白与逗号拆开）；`children` 抛错时是错误级诊断，节点保留 `value` 的文字。插件不能登记与 MyST 自带角色同名的角色（错误级诊断 `presmium.plugins`），两个插件登记同名角色时后者的被忽略。
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
- **读音词典**：`presmium.lecture.lexicon`（写法到读法）随合成请求送给语音服务，也计入合成缓存的键。实际的做法（WP-82）：语音服务在调用引擎之前把文字中的写法换成读法（较长的写法优先），所有引擎都这样处理，所以读法是文字（火山引擎的 `pronunciation_dict` 与它的拼音写法不用）；引擎按读法给出的逐字时间再换回原文：读出一个写法的几个字或词合为原文中的一个词（从第一个的开始到最后一个的结束），其余的字词不变，所以 `words` 与提示标记的偏移都按原文计。引擎的字词在读法中按顺序找不到时（引擎改写了文字），`words` 按引擎给出的原样返回。
- **时间**：提示标记在它所在字的时刻触发：优先用引擎返回的逐字或逐词时间；没有时把合成的音频转写一遍对齐；再不行按字数线性估算。一步在其讲解说完后 `gap`（默认 0.5 秒）推进，或在 `{cue}`next`` 处推进。
- **单独的讲授脚本**：`renderers.lecture.script` 指向一个 MyST 文件，其中的章节用与讲义相同的标签（`(merge)=`）对应讲义的章节；某一节在脚本中出现时，讲授用脚本中这一节的段落代替讲义的讲解（第 k 段属于第 k 步，规则同 2.4 节），讲义本身的显示不变。由 agent 整堂生成的讲授写在这里。
- **产物**：讲授计划经合成成为与录制的讲授格式相同的讲授轨（`voice.kind: synthetic`）与音频片段，写入 `dist/lecture/<id>/`，静态站点离线可放，不需要凭据（第 9 节）。

实际的做法（WP-83）：

- **讲授计划**（`addon-lecture` 的 `src/domain/plan.ts`）：讲授渲染端的视图中每一节、每一步的讲解段落（`{only}` 限于其他媒介的讲解不说；嵌在组件中的讲解随该组件），每段读成两份文字：显示的（字幕、逐字稿）与说的（`{say}` 换成 `alias`）。空白合并为一个空格，两个中日韩字符（含全角标点）之间的空白去掉，所以写在角色两边的空格不进入字幕。段落在 `{cue}`pause …`` 处切开，每一块是一个语音段（`u1`、`u2`……按讲授的顺序）。头部的 `renderers` 要写出 `lecture`：编译器认识的渲染端 ID 是 `web`、`slides`、`notebook` 与 `renderers` 的键，没有写出时 `{only} lecture` 得到“不认识的渲染端”的警告。
- **提示标记的位置**：`{cue}` 作用于它之后的第一个字（写在“这三行”之前的聚光在说“这”时出现），段末的提示标记在最后一个字说完时；`at` 的字偏移是语音段 `words` 的下标，没有逐字时间的语音段为字符偏移（码点）。`next` 推进一步（超过本节的步数时忽略），`pause` 停顿，`mark` 写一个章节点；`spot`、`hint`、`point`、`ink`、`click`、`run` 作用于 `to` 指的块（先在本节、再在全文按块的标签找），没有 `to` 时作用于这段讲解前面最近的上屏块（单独的脚本中为这一步显示的上屏块）。`sel` 写成页面上的选择器 `[data-section=…] .pm-block[data-block=…] <sel>`；`point` 指向块的中心（有 `lines` 时带 `line`）；`ink` 为荧光笔（`lines` 或整个块），下一节开始时清除；`run` 的结果是块录制输出的 `freeze:<缓存键>`，没有录制时为 `live`。
- **时间线**（`src/domain/synthesis.ts`）：每节以 `go` 到第 0 步开始；一段说完停 `gap`；一步的讲解说完、停顿之后推进到下一步，除非 `next` 已推进过；没有讲解的步也停 `gap`。`go` 的步号换算为网页形态的步号（视图的 `stepMap`）。
- **`{say}` 的逐字时间**：引擎按说的文字给出逐字时间，读出一个 `{say}` 的几个字词合为显示文字中的一个词（`B`、`P`、`E` 合为 `BPE`），与语音服务处理读音词典的做法相同。引擎不给逐字时间时，讲授插件把片段交给语音服务转写一遍，得到的逐字时间写在合成缓存中片段的旁边（`.presmium/speech/<键>.align.json`，随缓存提交），没有转写引擎时按字数线性估算。
- **单独的讲授脚本**按 CommonMark 读（`mdast-util-from-markdown`）：标签行 `(merge)=` 之后的标题开始一节，没有标签的标题给出警告；其中的段落、列表与引用是讲解，`{cue …}` 与 `{say …}` 按“角色加反引号中的内容”认出。脚本有的章节用脚本的段落，其他章节仍用讲义的讲解，讲义的显示不变。
- **合成的讲授**的 ID 是 `script`（`lectures/script` 这个录制的讲授因此不发布，构建给出警告）；`voice` 记下引擎、模型、音色与服务提供方（`provider`，取自片段的 `<键>.json`），播放界面显示“AI 合成语音（<服务提供方>）”。

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
| `{grid}`（参数为四档屏宽的列数，1 到 4 个数，默认 `1 2 2 3`）、`{grid-item}`（`:columns:`，占一行 12 份中的几份） | mdast `grid`（`columns` 为列数的数组）、`grid-item` |
| `{card}`（参数为标题；`:header:`、`:footer:`、`:link:`；正文中 `^^^` 之前为页眉，`+++` 之后为页脚） | mdast `card`（`url`；子节点 `header`、`cardTitle`、正文、`footer`） |
| `{tab-set}`、`{tab-item}`（参数为标题；`:sync:`、`:selected:`） | mdast `tabSet`、`tabItem`（`title`、`sync`、`selected`） |
| ``{button}`文字 <地址>` `` | 带 `class: 'button'` 的链接（没有地址时为带同样类名的 `span`，网页中同样显示为按钮的样子，只是不能点） |

节点的名字与字段是 mystmd 这四个包给出的原样（WP-85：`grid-item`，按钮为 `class: 'button'`；设计时写的 `gridItem` 与 `kind: 'button'` 不是它们的输出，没有另作转换）。编译器在 myst-parser 的指令与角色之外登记这些规格（`packages/compiler/src/source.ts`），语言服务的补全列出这五个指令与它们的选项。

它们是 `markdown` 节点中的标准 mdast，不是组件，属于上屏内容。各媒介：网页完整显示（栅格按屏宽分列：手机、576px 起、768px 起、992px 起四档，同 sphinx-design；卡片有 `:link:` 时整张卡片是链接，指向本地文件时网页渲染端像链接一样发布这个文件并改写地址；选项卡可切换，同 `:sync:` 的选项卡一起切换，包括之后打开的页面）；幻灯片中卡片与栅格照常显示（列数取最宽一档），选项卡依次展开为带标题的几段；notebook 降级为标题加段落（卡片标题与选项卡标题成为四级小标题，按钮成为链接），列入构建报告。降为标准 Markdown 的规则在 `lowerMyst` 的选项 `cards` 中（第 6 节）。搜索索引包含其中的文字（选项卡的标题除外）。

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
- `presmium serve` 中，角色为读者的成员（学习者）看到同样按 `student` 编译的学生视图：他们的页面、IR 与搜索索引来自学生视图的站点，读者成员的 MCP 令牌与所有 `tutor` 令牌也只读学生视图；编辑者与所有者看到全部内容（`architecture.md` 10.3 节）。

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

- `{predict}` 的参数是问题；`:choices:` 给出选项（至少两个），省略时学习者写一段文字。
- 揭示内容：`{predict}` 之后的下一步出现的全部内容，即 `:reveal:` 让它在下一步出现的上屏内容，以及绑定到这一步的讲解。“下一步”是源码中直到 `{predict}` 为止用到的最后一步的下一步，所以 `{predict}` 本身在第 0 步出现、前面已有揭示时，揭示内容仍是它之后第一个 `:reveal:` 的一步。课堂插件的编译步骤 `predict-reveals`（在 `classroom-places` 之前）把它们移入 `PmPredict` 组件的子块，排在补充说明（子块 `prompt`）之后（块 ID 与步骤不变）；属性 `reveal`、`notes` 分别列出移入的上屏块与讲解的 ID，`PmPredict` 块的 `span` 到达揭示的一步（通常为 1）。之后一步什么也不出现时给出警告（`presmium.classroom`），组件没有揭示内容。
- 读者保存预测之前，揭示内容不显示（文档视图与滚动叙事视图，即视图角色为 `reader` 时）；保存后显示，并保存在本机（`localStorage`，按讲义的地址与 `<章节>/<块>` 保存，刷新后仍在；保存后不能修改）。投在全班面前的放映画面与演讲者视图（角色 `audience`、`presenter`）以及幻灯片按步骤显示；放映画面中移入的讲解不上屏，网页的演讲者视图在备注与“下一步”的预告中照常列出它（`@presmium/kernel` 的 `sectionNarration` 读出组件子块中的讲解）。课堂中学习者的预测另写入 `predictions` 集合（键为 `<位置>:<参与者>`，值带位置、问题与选项），主讲在演讲者面板（“互动”）中看到各选项的人数，文字预测列出内容而不带姓名。
- notebook 中为问题、选项与折叠的揭示内容（`<details>`，含移入的讲解）；它也是组件的 `fallback`。
- 读者保存预测之前，揭示内容不显示（文档视图与滚动叙事视图，即视图角色为 `reader` 时）；保存后显示，并保存在本机（`localStorage`，按讲义的地址与 `<章节>/<块>` 保存，刷新后仍在；保存后不能修改）。投在全班面前的放映画面与演讲者视图（角色 `audience`、`presenter`）以及幻灯片按步骤显示；放映画面中移入的讲解不上屏。幻灯片中补充说明在表单之前：幻灯片渲染端给组件子块的步骤包装元素写上子块的 ID 作为 Vue 的 `key`（网页的 IR 运行时同样按块 ID 给子块 `key`），`PmPredict` 由此分出揭示内容与补充说明（WP-79e2）。课堂中学习者的预测另写入 `predictions` 集合（键为 `<位置>:<参与者>`，值带位置、问题与选项），主讲在演讲者面板（“互动”）中看到各选项的人数，文字预测列出内容而不带姓名。
- notebook 中为问题、选项与折叠的揭示内容（`<details data-static="open">`，含移入的讲解；揭示的代码带编译时录制的输出，揭示的执行面板为它的降级内容）；它也是组件的 `fallback`。降级内容由 `classroom-places` 写出，编译时执行之后再由 `classroom-predict-fallbacks`（`after: 'execute'`，在执行插件的 `presmium.exec.fallbacks` 之后）重写一次，所以含揭示内容中的运行输出（WP-79e2）。幻灯片的 PDF、PNG 导出中不能展开折叠，`data-static="open"` 的 `<details>` 在导出中展开（第 6 节），测验答案这类没有这个标记的折叠仍收起。

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
- 网页与幻灯片显示带 `poster` 与 `<track kind="captions">` 的 `<video>`，字幕的标签是语言的名称（`Intl.DisplayNames`，按界面语言：中文界面中 `en` 为“英语”）；notebook 中为同样的 HTML（标签按文稿的语言），文件复制到 `media/`。notebook 只为有封面或字幕的视频写 `<video>`，其他媒体仍为文件链接（富内容插件的 notebook 扩展）。
- `:captions:` 的语言写法按 BCP 47 规范化（`zh-cn` 写作 `zh-CN`）；不是 `语言=文件` 的项是错误；`:captions-default:` 不是其中的语言时警告，不默认显示字幕。

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
| `markdown` 的 mdast | `presmiumRole` | 登记过的行内角色（2.8 节）；`card`、`grid`、`grid-item`、`tabSet`、`tabItem` 与 `class: 'button'` 的链接（2.10 节） |

文件路径：`presmium build` 写出的 `<out>/ir.json` 中，入口文件（`meta.entry`）与各块的 `source.file` 是相对于文稿目录的路径，产物因此不随检出位置变化（K-13）；`presmium ir` 的标准输出与 `presmium dev` 推送给浏览器的 IR 保留绝对路径，供编辑器跳转到源码。

## 4. 编译步骤

编译步骤（pass）是 IR 上的有序变换。内置步骤：

| 顺序 | 步骤 | 作用 |
|---|---|---|
| 1 | 解析 | 剥离 frontmatter，`myst-parser` 解析，把脚注定义放回书写处，处理 `{include}` 与 `{literalinclude}`（文件的内容按 MyST 的选项截取后成为代码块；与 `{include}` 一样经读取范围，指向工作区之外的符号链接在 `presmium serve` 中被拒绝）；被引入的各文件可以用相同的脚注名（如 `[^1]`），后出现的文件中重名的脚注换一个内部标识（作者写的标签不变），每个文件的脚注从 1 起按首次引用的顺序编号 |
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
- 编译时执行器（执行插件的 `presmium.python`、`presmium.node`）在子进程中、每次运行一个新的临时目录（运行目录）中执行代码；代码、参数与输入写成运行目录中的文件，结果由运行器写进运行目录中的结果文件（WP-73b 起不再用标准输入与文件描述符 3，进程沙箱不转发它们，`architecture.md` 4.6 节）：程序直接写标准输出（`process.stdout.write`、`console.dir`）不会破坏结果，这些输出照常录制；顶层 `await` 永不完成时，结果为失败并说明原因。运行末尾才发生的 Promise 拒绝与定时器中的异常使运行失败，与浏览器中一致。
- **执行的环境变量**：被执行的代码只得到编译器给出的 `RunContext.env`（`architecture.md` 4.6 节）：`build`、`check`、`dev` 中是进程的环境去掉 `PRESMIUM_` 开头与名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量，`serve` 中只有 `PATH`、`LANG` 与 `LC_*`、`TZ`、`TMPDIR` 与临时的 `HOME`；都加上运营者设置 `settings.presmium.exec.passEnv`（第 10 节）列出的变量。服务端的凭据因此不会经代码自己的环境被打印进录制、IR 与产物；有意读取其他进程信息的代码按信任模式处理（`architecture.md` 10.1、10.6 节）。本地容器的 `docker` 与 devcontainer 命令行另得到 Docker 客户端需要的几个变量（`DOCKER_HOST`、`XDG_RUNTIME_DIR` 等与真实的 `HOME`，都不是凭据），容器里的代码经命令行只得到 `RunContext.env` 中的变量（`architecture.md` 10.6 节）。
- **进程沙箱**：运营者插件 `addon-deltabox` 可用时，执行插件的子进程在 deltabox 中运行（网络拒绝，看不到其他进程与 Unix 套接字，只能写运行目录；同一会话的代码块在同一次运行中依次执行），构建报告写明隔离方式；不可用时照旧运行并在构建报告中说明（`architecture.md` 10.6 节）。
- **工作区服务中的执行**：LOCAL 模式（只监听本机、没有登录）的 `presmium serve` 与 `presmium dev` 一样全部执行。SHARED 模式（带登录，compose 布局）中代码只在 sandbox 容器的 agent-host 中执行，没有录制的代码按 `settings.presmium.exec.compile` 执行：`approve`（默认）等所有者的 `operate` 确认（同一段代码被拒绝或超时后不再自动请求，代码改动或编辑者点“请求执行”时再请求），`trusted` 直接执行，`off` 不执行；没有执行时显示 `:recorded:` 的录制输出或降级内容。MCP 的 `run_code` 与 `build` 按同一规则执行（`architecture.md` 10.6 节）。

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
| `gateway`、`operator` | gateway 贡献（只在 `presmium gateway` 中挂载，使用第三方凭据）；运营者插件的标记（列在工作区的插件列表中时每份文档都加载，第 10 节） |

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
| `{literalinclude}` | 参数为文件路径 | `:language:`（默认按扩展名）、`:lines:`、`:start-line:`、`:end-line:`、`:start-after:`、`:end-before:`、`:start-at:`、`:end-at:`（MyST 的截取选项）、`:caption:` 或 `:filename:`、`:emphasize-lines:` | `code` 节点，内容是文件（或截取的几行），去掉末尾的一个换行；文件不存在时是错误，编译监听它 |
| `{code}`、`{code-block}`、`{code-cell}`、`{sourcecode}` | 参数为语言；正文为代码 | `:caption:` 或 `:filename:`（标题）、`:emphasize-lines:`（强调的行，如 `2, 4-5`，各步都高亮这些行）、`:run:`、`:executor:`、`:timeout:`、`:env:`、`:session:`、`:echo:`（2.7 节） | `code` 节点 |
| `{audience}` | 参数为受众名列表 | — | 章节的 `audience`（2.11 节）；放在章节顶层，不生成块 |
| `{grid}`、`{grid-item}`、`{card}`、`{tab-set}`、`{tab-item}` | 见 2.10 节 | 见 2.10 节 | mdast `grid`、`grid-item`、`card`、`tabSet`、`tabItem`（MyST 标准写法） |

代码块的 `:run:` 取 `compile`（默认，构建时执行并录制输出）、`live`（只在浏览器中执行）或 `both`；`:executor:` 指定执行器 ID；`:timeout:` 为毫秒。`{code-cell}` 是 MyST notebook 的写法，编成同样的 `code` 节点，`:run:` 同样生效；MyST 为它生成的 `outputs` 节点被丢弃，输出只来自编译时执行，所以同一份源码两次编译得到相同的 IR。

组件内的代码：插件组件的子块中的代码块（例如执行面板、分步执行与本地环境包着的代码）属于组件，由组件运行并显示输出，这些代码块在网页与幻灯片中都不显示运行控件，也不显示录制的输出；notebook 由组件的扩展决定如何写出它们。

插件指令：

| 插件 | 指令 | 参数与正文 | 选项 | 生成与步数 |
|---|---|---|---|---|
| 代码引用 `presmium.code` | `{code-ref}` | 参数为锚点，如 `region:src/bpe.py#merge`；锚点中的文件路径相对于文稿所在 git 仓库的根目录，不在 git 中时相对于文稿目录 | `:pin:`（提交，默认工作区）、`:steps:`（逻辑单元名列表，即嵌套的 `#region`，每步高亮一个；`all` 或 `none` 表示这一步不突出任何单元）、`:variants:`（至少两个提交，逐步切换版本，不能与 `:pin:`、`:steps:` 同用）、`:lang:`（默认取文件扩展名）、`:repo:`（永久链接的仓库网址，默认取本章节的 `presmium.code.repo`）、`:run:`、`:executor:`、`:timeout:` | `code` 节点，带 `origin`、`highlight` 或 `variants`（每个版本带自己的行区间与永久链接）；步数为单元数或版本数减一。文件不存在时的诊断说明路径的基准，按文稿目录写的路径给出从仓库根目录起的写法 |
| 浏览器执行 `presmium.exec` | `{run-panel}` | 参数为语言：`python`（默认，`py`、`python3`、`ipython` 同义）、`javascript`、`typescript`；v0.8 起也可以是任何有执行器的语言（如 `wgsl`、`c`） | `:params:`（YAML 映射，注入程序的变量；JavaScript 中为常量；其他语言由执行器解释，如 `wgsl` 的缓冲区与派发说明）、`:timeout:`（毫秒，默认取本章节的 `presmium.exec.timeoutMs`）、`:recorded:`（执行失败或超时时显示的输出）、`:run:`（`both` 默认，同时在构建时录制；`live` 只在浏览器中执行）、`:env:`、`:session:` | `PmRunPanel`，子块为代码块，代码也在属性 `code` 中；构建时成功录制的输出另在属性 `compiledOutput` 中，现场运行没能进行（没有运行时或 GPU 适配器、超时）而没有 `:recorded:` 时面板显示它与原因（WP-75）；`fallback`（PDF、PNG 导出）为先给参数赋值的代码，加上构建时的输出，构建时没有执行、执行失败或超时的用 `:recorded:`；notebook 中与内核同语言的为代码单元格（参数赋值在前），其他语言为代码（JavaScript、TypeScript 前面加上参数常量）加输出的 Markdown 单元格，输出的取法同 `fallback`。带超时而构建时没有正常结束的代码单元格标记 `skip-execution` |
| | `{step-run}` | 参数为语言（默认 `python`）；正文为代码 | `:steps:`（执行的行数，每行一步）、`:params:`、`:timeout:` | `PmStepRun`；步数为 `:steps:`。文档视图（全部展开）中组件有自己的步进控件（上一步、下一步与滑块），读者在其中逐行查看；网页中组件接近视口时才加载 Python 运行时并追踪 |
| 本地环境 `presmium.execLocal` | `{local-env}` | 参数为语言（默认 `python`）；正文为代码 | `:file:`（代码在工作区中的路径，必填）、`:workspace:`（devcontainer 所在目录，相对于本文件） | `PmLocalEnv`，子块为代码块；执行器 `presmium.container` 供代码块的 `:executor:` 使用。一份文稿只有一个工作区：各 `{local-env}` 指定不同的工作区时报错（`presmium.execLocal.workspace`）。全局配置 `workspace`、`priority`、`buildTimeoutMs`（构建镜像的时限，默认 10 分钟） |
| WebAssembly `presmium.execWasi` | 无指令；语言为 `c`、`cpp`、`ruby`、`sql` 的代码（带 `:run:` 的代码块，或执行面板）由它运行（2.7 节） | — | 全局配置 `loadTimeoutMs`；环境 `kind: wasi` | 执行器 `presmium.wasi`；编译步骤 `presmium.execWasi.runtimes` 写出两种形态要发布的运行时 |
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
| | `{predict}` | 参数为问题；正文为补充说明 | `:choices:`（逗号分隔的选项；省略时写文字） | `PmPredict`，揭示内容为它的子块（2.13 节）；步数 1（`span` 到达揭示的一步）；notebook 中为问题、选项与折叠的揭示内容 |
| 远端环境 `presmium.execJupyter` | `{terminal}` | 参数为 `kind: jupyter` 的环境名 | `:height:`（行数，默认 16） | `PmTerminal`（2.7 节）；降级为一行说明；notebook 中不生成单元格 |
| 会话 `presmium.session` | 无指令 | — | 全局配置 `server`（课堂服务的地址，`ws://` 或 `http://` 均可）；没有时文稿照常放映，会话显示未连接 | 浏览器端提供 `session` 与 `classroomStore` 服务 |

课堂插件另有编译步骤 `classroom-places`：给每个课堂组件（含 `{predict}` 揭示内容中的）加上属性 `place`（所在章节与块的 ID、章节标题与序号，块 ID 在编排步骤之后才确定）、写出它的 `fallback`，并检查 `{question-box}` 的 `:target:` 是否是本章节的块。

行内角色：

| 插件 | 角色 | 内容与选项 | 生成 |
|---|---|---|---|
| 内置（MyST） | `{button}` | ``{button}`文字 <地址>` `` | 带 `class: 'button'` 的链接（2.10 节） |
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

各渲染端用同一套规则把 MyST 降为标准 Markdown（`@presmium/kernel` 的 `lowerMyst`）：幻灯片中图注独立成段，`{dropdown}` 写成 `<details>`，定义列表保留结构，`#标签` 的交叉引用链接到目标章节所在的页。卡片、栅格与选项卡（2.10 节）按选项 `cards`：`element`（幻灯片渲染端显式传入，WP-79e2；不写 `cards` 而写了 `iframes: 'element'` 时也是它）写成带类名的 `<div>`（`pm-grid` 带 `--pm-grid-columns`、`pm-card`、`pm-card__header`、`pm-card__title`、`pm-card__footer`、`pm-tabs__item`、`pm-tabs__title`），按钮为 `pm-button` 中的链接，样式在幻灯片的 `style.css`；没有目标的 `{button}`（`class: 'button'` 的 `span`）由幻灯片渲染端写成 `<span class="pm-button pm-button--text">`，与带链接的按钮同样的样式（WP-79e2）；`headings`（默认，notebook）写成四级小标题加内容，栅格、卡片与选项卡列为降级。插件组件由渲染端包在错误边界 `PmBoundary` 中，组件自身出错只影响它自己（`architecture.md` 5.4 节）；扩展抛错时渲染端在块的位置报告警告，改为写组件标签或 `fallback`。幻灯片中有 `fallback` 的组件包在 `PmStaticFallback` 中，PDF、PNG 导出显示 `fallback`；其中带 `data-static="open"` 的 `<details>` 写成展开的（导出不能点开，WP-79e2）。

渲染端发布块中引用的本地文件：Markdown 中的图片与链接，以及组件在 `assets` 中声明的属性。网页把文件发布在站点的 `media/` 下；幻灯片把它们复制到生成的 Slidev 文稿的 `public/`，从站点根路径引用（构建时加上站点路径，翻页预加载也不再请求不存在的相对路径），链接到的文件在新标签页中打开；notebook 把它们复制到 notebook 旁边的 `media/`。文件名中的 `#`、`?` 写作 `%23`、`%3F`，转义不完整的地址不使构建失败。幻灯片的讲解（演讲者备注）是 Slidev 原样显示的 HTML，不经 Vite 处理，其中的图片因此也写成带站点路径的地址。

幻灯片渲染端把每页写成 Slidev 编译的 Vue 模板。`slidev build` 因某一页失败时（例如原始 HTML 的标签没有闭合），错误报告在源码中：该页的章节里只有一个块含原始 HTML 时报告在这个块的位置，否则在章节标题处，而不是生成的 `slides.md__slidev_<页号>.md`。

notebook 渲染端把 Markdown 写成 Jupyter 能显示的 CommonMark、GFM 表格、内联 HTML 与 `$` 公式，不写 MyST 语法：提示框（`{note}` 等）与旁注写成带粗体标题的引用块，`{list-table}` 等表格写成 GFM 表格，`{dropdown}` 写成 `<details>`，图写成图片加斜体标题，公式写成 `$$`，`{sub}`、`{sup}`、`{kbd}`、`{abbr}` 等角色写成内联 HTML，交叉引用写成它的文字。正文中的 `$`（如价格）写作 `\$`，不被 Jupyter 当作公式；表格单元格中的行内内容直接拼接，只在换行与块级内容处断开。没有对应写法的节点（如 `{embed}`、`{iframe}`）保留其中的文字，并作为降级在构建报告中逐块列出（警告，带源码位置）。网页与幻灯片把 `{iframe}` 写成 figure 中的 `<iframe>`。

notebook 渲染端把它显示的图片与链接所指向的本地文件（如本地化的 PlantUML 图、媒体的降级链接）复制到 notebook 旁边的 `media/` 并改写路径，notebook 目录可以整体移动。只复制实际写入 notebook 的地址所指的文件：组件由插件扩展或降级内容显示时，其子块中的文件不复制。地址按 URL 解码后查找文件（文件名中的 `#`、`?` 写作 `%23`、`%3F`），转义不完整的地址原样保留。

### 6.1 富输出（P-102）

| 渲染端 | 处理 |
|---|---|
| 网页（IR 运行时） | 每个输出按 MIME 类型选择渲染器，顺序同 JupyterLab：`text/html`（DOMPurify 清洗后内联显示；只在浏览器中清洗，服务端渲染与清洗之前显示 `text/plain`）、`text/markdown`（`mdast-util-from-markdown` 与 GFM 转为 mdast 后照正文显示，其中的原始 HTML 作为文字）、`text/latex`（KaTeX）、`image/svg+xml`、`image/png`、`image/jpeg`、`image/gif`、`application/json`、`text/plain`；`stream` 与 `error` 的 ANSI 转义转为样式。插件可以为新的类型注册渲染器（`registerNodeRenderer('mime:<类型>')`），优先于内置的。`echo: false` 的代码块不显示代码，`text/markdown` 输出不加输出框 |
| 幻灯片 | 录制的输出写进 Slidev 文稿：图片为 `<img>`（base64 超过 16 KB 时作为文件发布），`text/markdown` 为 Markdown（其中的原始 HTML 作为文字），`text/html` 放进没有脚本权限的沙箱 iframe（`srcdoc`），`text/latex` 为公式，其他为文本；带 `live` 或 `both` 的 Python、JavaScript、TypeScript 与 C、C++、Ruby、SQL 代码块（没有高亮步骤与多版本时；WASI 语言自 WP-79e2）写成 `{monaco-run}`，点运行按钮执行，执行器、会话与超时经生成文稿头部的 `presmiumRuns` 交给执行插件的 code runner（`architecture.md` 4.6、9.2 节），录制的输出写在它下方；`echo: false` 的代码块只写输出，Markdown 输出不加输出框 |
| notebook | 把 `outputs` 原样写入代码单元格的 `outputs`（`execution_count` 按顺序编号）；`echo: false` 的单元格带元数据 `jupyter.source_hidden` |
| 静态导出（PDF、PNG） | 使用录制的输出，同幻灯片 |

### 6.2 发布的文件（P-79）

三种媒介一致地发布块中引用的本地文件，规则同上文（`localAsset`，发布名 `<内容哈希前 8 位>-<文件名>`）：

- **正文链接**：链接到本地文件（起始代码、数据、模板）时，网页把文件发布在 `media/` 下并改写链接，与幻灯片、notebook 一致。
- **目录**：链接到本地目录时，网页与幻灯片生成一个文件清单页 `media/<哈希>-<目录名>/index.html`（列出目录中的文件，每个文件可以下载），notebook 把目录复制到 `media/` 并链接到它。
- **原始 HTML**：原始 HTML 中 `src`、`poster`、`href` 引用的本地文件同样发布并改写地址。
- 无法发布的本地引用（文件不存在、指向文稿所在仓库之外）是警告级诊断，带源码位置；`presmium check` 的 `presmium.links` 报告同样的问题（2.11 节）。

### 6.3 讲授渲染端、工作区站点与译本

- **`lecture`**：讲授插件提供的站点渲染端。它把自己的视图（`viewFor(doc, 'lecture')`）编为讲授计划（每一步要说的文字与提示标记，2.9 节），经 `RenderContext.service(SPEECH)` 合成（先查合成缓存，命中的段落不重新合成，全部命中时不向引擎发请求；只为缺失的段落调用引擎并写入缓存；缺失又没有可用的引擎时报错并指出段落），写出 `dist/lecture/<id>/track.json`、音频片段与 `index.json`（讲授列表）；文稿目录 `lectures/` 中录制的讲授轨与音频一并发布。网页的讲授视图从同一站点的 `../lecture/` 读取，分开部署时在 `presmium.lecture.url` 中写明地址。录制的讲授（WP-77）发布为 `dist/lecture/<id>/track.json`、它的本地音频与录像（`audio/`、`video/`，外部地址的不复制）、`captions.<语言>.vtt`（讲授轨的语言与每种译文各一份，过期的译文带 `NOTE stale` 并给出警告）、`chapters.vtt` 与 `events.vtt`；`index.json` 的每项为 `{ id, lang, voice, duration, captions }`。`presmium dev` 中讲授视图读服务端的路由（9.4 节），这个渲染端的开发服务器只打印路由的地址。实际（WP-83）：写了 `renderers.lecture.voice` 时构建先合成 `script`：片段（合成缓存中的文件）复制到 `dist/lecture/<id>/clips/`，重新合成过的录制讲授的片段同样发布；讲授插件需要语音插件提供的 `SPEECH`（没有时是错误）；缺少片段又不能合成的语音段各是一条错误级诊断（带段落的源码位置），这时不发布 `script`。每份讲授都发布成功时，`.presmium/speech.lock.json` 只留下这些讲授用到的键（格式不变）。`presmium dev` 与 `presmium serve` 中 `script` 由服务端在页面请求它时按最近一次编译的 IR 合成（命中缓存的段落不发请求），每份 IR 只合成一次。
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
| `presmium serve` | `[目录]`（工作区根目录或一份文稿，默认当前目录）、`--port <n>`（默认 4310）、`--host <地址>`（默认 `127.0.0.1`；其他地址要求配置登录代理）、`--trust-proxy-from <地址>`、`--user <uid>`（以 root 启动时，读取令牌文件后降为这个用户）、`--operator-dir <dir>`（LOCAL 的运营者目录，默认在用户的状态目录中，第 10 节） | 工作区服务（P-120）：工作区站点的开发服务器、编辑模式、文档管理、助手、MCP 与各插件的服务端贡献（`architecture.md` 第 10 节）。配置了登录（`PRESMIUM_PROXY_SECRET` 或 `--trust-proxy-from`）时是 SHARED 模式：要求 `PRESMIUM_GATEWAY_URL`、`PRESMIUM_AGENT_HOST_URL`、两者的令牌（compose 中取自只有 root 可读的文件，`--user` 指定降权后的用户）与所有者控制台的主机名 `PRESMIUM_CONSOLE_HOST`，文档必须在工作区根目录的子目录中，环境中有第三方凭据时拒绝启动；工作区站点的开发服务器这时在 agent-host 中（`architecture.md` 10.1、10.2、10.4 节） |
| `presmium gateway` | `[目录]`（工作区根目录，只读取工作区配置）、`--operator-dir <dir>`（运营者目录，默认按 LOCAL 运营者目录的规则）、`--serve <url>`（`/mcp` 转发的目标）、`--port <n>`（默认 4320）、`--host <地址>`（默认 `127.0.0.1`）、`--hostname <名字,…>`（另外接受的主机名，compose 中为 `gateway`）、`--user <uid>`（以 root 启动时，读取令牌文件后降为这个用户） | SHARED 模式中持有第三方凭据的进程：挂载运营者插件的 gateway 贡献（模型、语音、远端环境的代理），签发与校验限定令牌（服务令牌取自 `PRESMIUM_GATEWAY_TOKEN`），转发 `/mcp`（`architecture.md` 10.9 节） |
| `presmium agent-host` | `[目录]`（工作区根目录）、`--port <n>`（默认 4330）、`--host <地址>`（默认 `127.0.0.1`）、`--hostname <名字,…>`（另外接受的主机名，compose 中为 `sandbox`）、`--user <uid>`（以 root 启动时，读取令牌文件后降为这个用户） | SHARED 模式中 sandbox 容器里的进程：agent 会话、编译时执行、构建、工作区站点的开发服务器与 deltabox 的审阅，经认证的 HTTP/SSE 接口由 serve 调用；令牌取自 `PRESMIUM_AGENT_HOST_TOKEN_FILE` 指向的文件（compose 中只有 root 可读）或 `PRESMIUM_AGENT_HOST_TOKEN`（`architecture.md` 10.8 节） |

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

讲授插件另外注册视图 `lecture`（`?view=lecture&track=<id>`）：以讲授轨驱动真实页面的回放（第 9 节），并在放映视图的工具栏中加入录制。实际实现（WP-77）：回放的“真实页面”就是放映视图，`lecture` 视图把页面切到放映视图并保留 URL 的 `track` 参数，播放器是放映视图上的一个图层（视图插件只以类型引用 `@presmium/viewer`，自己画不出带章节上下文的幻灯片）；没有 `track` 参数时它列出文稿的讲授供选择。录制同样是放映视图上的图层，只在 `presmium dev` 与 `presmium serve` 中出现（9.4 节）。编辑模式（工作区提供）中，助手插件给每个块加上批注入口（按 `.pm-block[data-block]` 定位，源码位置取自 IR 中块的 `source`）。

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
| `lectures/<id>/audio/*.ogg` | 录制的音频（Ogg/Opus，可以跳转），每节一段 | 默认不提交：讲授插件在 `lectures/<id>/` 写一个忽略 `audio/` 与 `video/` 的 `.gitignore`；运营者设置 `settings.presmium.lecture.audio`（第 10 节）可以改为 git LFS 或外部地址 |
| `lectures/<id>/video/*.webm` | 可选的摄像头与屏幕录像（P-90），每节每种一段；默认不录 | 同音频 |
| `.presmium/speech/<键>.<扩展名>`、`<键>.json` | 合成缓存：音频保留引擎返回的格式，不重新编码。语音服务向引擎请求 Ogg/Opus（火山引擎的 `ogg_opus`，OpenAI 音频接口的 `response_format: opus`），所以通常是 `<键>.ogg`；只给出其他格式的引擎按其格式保存（假引擎为 `<键>.wav`）。语音服务（不是引擎）写入缓存时在音频的元数据中加入 AI 生成的标识与 GB 45438 的字段（Ogg 写在 Opus 的注释头中，WAV 写在 `LIST`/`INFO` 块中，字段由 WP-82 的先行验证确定），不改动引擎写入的其他内容（假引擎嵌入的文字与音色因此保留）。`<键>.json` 是逐字时间、时长、格式（`mime`）、引擎信息与同样的 AI 生成标识。实际的格式（WP-82）：键是规范化的（引擎、音色、语言、语速、风格、原文、应用读音词典之后要说的文字）的 sha256 的前 32 位十六进制数；模型不在键中（SHARED 模式中只有 gateway 知道模型，而命中时不能发请求），写在 `<键>.json` 中；读音词典以“要说的文字”进入键，所以改动与这段文字无关的词条不使缓存失效。`<键>.json` 的字段为 `key`、`audio`（音频文件名）、`mime`、`duration`、`words`、`engine`、`model`、`voice`、`provider`、`cloned`、`lang`、`text`、`synthetic: true`、`AIGC`（GB 45438 的字段：`Label`、`ContentProducer`（引擎的服务提供方）、`ProduceID`（键）、`ReservedCode1`、`ContentPropagator`、`PropagateID`、`ReservedCode2`）与音频的 `sha256`。WAV 的 `LIST`/`INFO` 块中是 `AIGC`（上述字段的 JSON）与 `ICMT`（`AIGC={…}`），Ogg/Opus 的注释头中是 `AIGC={…}`（`design-v0.7.md` 第 11 节）；引擎给出其他格式时合成失败（无法写入标识） | 提交（Opus 约 24 kbps，一小时约 11 MB），或用 LFS |
| `.presmium/speech.lock.json` | 文稿用到的合成键与音频的 sha256：`{ "version": 1, "synthesis": { "<键>": { "audio": "<键>.wav", "sha256": "…" } } }`，每个键一行、按键排序；语音服务每次合成（含缓存命中）时加入用到的键，不删除（清理不再用到的键由讲授的构建负责，WP-83） | 提交 |

克隆音色的同意记录不在文稿目录中：它在运营者目录中的 `<consentDir>/<引擎>/<音色>.json`（第 10 节的 `settings.presmium.speech.consentDir`，默认 `consent`；LOCAL 模式的运营者目录在工作区之外的用户状态目录中，SHARED 模式是 gateway 的 `--operator-dir`，只挂在 gateway 容器中），内容为说话人、范围、日期与同意声明录音的 sha256（JSON `{ speaker, scope, date, statementSha256 }`，`date` 为 ISO 8601 日期，`statementSha256` 为十六进制；WP-82）。记录只经两条途径产生：所有者经语音插件的路由登记（SHARED 模式中只在所有者控制台的源上，serve 转给 gateway 写入），或运营者在持有凭据的环境中（SHARED 为 gateway 容器）运行 `presmium-speech consent`。记录不随文稿提交；文稿中的 `.presmium/speech/consent/` 之类的文件被忽略（`architecture.md` 第 11 节）。

讲授轨借鉴 asciinema 的 asciicast（事件是元组，不认识的类型忽略），时间用自讲授开始的绝对毫秒，便于跳转与编辑：

```json
{ "track": 1, "id": "bpe-2026-10-16", "doc": "lecture.md", "lang": "zh-CN", "ir": { "hash": "…", "sections": { "merge": "…" } },
  "voice": { "kind": "recorded", "speaker": "张老师" },
  "audio": [{ "section": "merge", "start": 0, "src": "audio/merge.ogg", "duration": 312.4, "sha256": "…" }],
  "video": [{ "section": "merge", "start": 0, "src": "video/merge.camera.webm", "kind": "camera", "duration": 312.4 }],
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
- `video`：可选，只有录制时开启了摄像头或屏幕才有；`kind` 为 `camera` 或 `screen`，时刻规则同 `audio`。回放仍由事件驱动真实页面，不依赖它。
- `blocks`：被事件引用的块的内容指纹（键为 `<章节 ID>/<块 ID>`）与行数；`ir.hash` 是录制时的 IR 哈希，`ir.sections` 是录制时每一节的 IR 哈希（WP-79e2；重录一节只换那一节的，其他各节保留原来录制时的）。它们用于漂移检查。
- `utterances[].words`：`[开始毫秒, 时长毫秒, 字或词]`；中文为单字。`translations` 的 `source` 是翻译时原文的摘要，与当前原文不一致即过期（P-137）。
- 实际增加的字段（WP-83）：`utterances[].clip` 是这一句合成的片段，合成缓存中的文件名 `<键>.wav` 或 `<键>.ogg`（讲授轨中只能是这种名字），发布在讲授目录的 `clips/` 下；合成的讲授（`voice.kind: synthetic`）由 `ClipClock` 在每个语音段的时刻播放它的片段（录制的音频不再播放）。`voice` 的合成形式另有可选的 `provider`（引擎的服务提供方，N-08）。录制的讲授经转写得到语音段（`id` 为 `u1`、`u2`……，`section` 与 `step` 取自它开始时的位置），在某个语音段说话期间发生的事件绑定到当时说的字（`at`）；改一句的文字时保留未改动的字的时间、新字按字数分配其间的时间，绑定到这一句的事件随它的字移动，片段去掉（合成的讲授立即重新合成这一句）；换音色重新合成时每句在原来的时刻开始，比前一句的新片段结束得早时推到它结束之后（片段不重叠），没有 `at` 的事件时刻不变。

### 9.2 事件词汇

| 类型 | 数据 | 报告者 |
|---|---|---|
| `go` | `section`、`step`、`view` | IR 运行时（导航） |
| `point` | `block`、`path`（`[毫秒偏移, x, y]`，块内相对坐标 0 到 1；代码块另带 `line`） | 讲授插件（指针） |
| `spot`、`hint` | `block` 或 `selector`、`lines`、`span` | 引导插件 |
| `ink` | `block`、`lines` 或 `range` | 讲授插件（激光笔、荧光笔） |
| `select` | `block`、`range` | 讲授插件 |
| `click` | `block`、`action`（组件的具名动作，不是原始的 DOM 点击） | 提供该动作的插件 |
| `run` | `section`、`block`、`result`（`live`，或 `freeze:<缓存键>`；回放时重放录制的结果） | IR 运行时的代码块（WP-73b；块 ID 只有 IR 运行时知道，`architecture.md` 4.6 节） |
| `scroll` | `block`、`fraction` | 讲授插件 |
| `mark` | `label` | 讲授插件（章节标记，导出为 `chapters.vtt`） |
| `pause` | `ms` | 讲授插件 |

- 任何事件可以带 `at: [语音段 ID, 字偏移]`：时刻由该字的时间决定；改文字、换音色、重新合成某一段后按新的逐字时间重新计算（“改文字、换音色，操作跟着走”）。
- 插件自己的类型以插件 ID 开头（如 `presmium.classroom.quiz`），由该插件登记重放；回放忽略没有插件重放的类型。
- 时刻 t 的画面是 t 之前事件的折叠：`state(t) = fold(events ≤ t)`。回放每帧与每次跳转后，经宿主的 `OPERATIONS` 依次重放（跳转时先 `clear`），由此重建导航、聚光、指针与执行结果。
- 实际的数据（WP-77）：`go` 由播放器去掉 `view` 后重放（回放总在放映视图中）。`spot`、`hint` 的 `block` 写作 `<章节 ID>/<块 ID>`，可加 `lines`（`3-5`、`2,4`，代码行）、`span`（再持续的步数）、`title`、`text`；没有 `block` 与 `selector` 的数据取消它；它持续到位置离开它所在的章节或步骤（加 `span`），所以做出来、依次重放与一次折叠得到同一画面。放映视图中按 `s`、`h` 给指针下的块加上或取消聚光、提示（引导插件报告）。`point` 的 `path` 是 `[毫秒偏移, x, y]`（块内 0 到 1，约 20 Hz 采样，Ramer–Douglas–Peucker 简化，停顿 0.4 秒或满 1 秒报告一段），代码块另带 `line`；录制者把它的时刻记为路径的开始（第一次采样的事件时间，由录制面板告诉录制者，而不是报告时刻减去路径的长度，WP-79e2）。`ink` 为 `{ block, tool: 'laser' | 'marker', lines }`（代码行）或 `{ block, tool, range: [x0, y0, x1, y1] }`（块内相对坐标），`{ clear: true }` 清除；荧光笔留到清除，激光笔 1.5 秒后消失，跳转时不重现。`run` 的块写作 `section` 与不带章节的 `block`（IR 运行时的报告），漂移检查与回放按 `<section>/<block>` 处理。

### 9.3 导出与检查

- 导出（只作为交换格式，不作为主存储）：`captions.<语言>.vtt`（每种语言一份，含译文；过期的译文导出时警告）、`chapters.vtt`（由 `mark` 与章节切换生成）、`events.vtt`（元数据轨，每个事件的 JSON）。
- 检查项 `presmium.lecture`：按块指纹与 IR 哈希报告移动、失效的块与变化的步骤数，分级同锚点（exact、moved、fuzzy、lost）；`{cue}` 的目标不存在；合成缓存缺失又没有可用的引擎（经 `CheckContext.service(SPEECH).engines()` 判断）时指出是哪些段落。回放时丢弃失效的事件并提示。
- 实际的检查（WP-77）：块指纹是块的文字（代码；Markdown 的文字，不含地址；组件的名字、不含本地文件的属性与子块）的 `fingerprint`，IR 哈希是网页形态显示的全部块的键与指纹的 `fnv1a64`，所以各形态改写的地址不影响它们；哈希相同时不再逐块比较。有 `ir.sections` 的讲授轨（WP-79e2）按每一节比较：讲授轨记下的每一节的哈希都与现在的相同时才不逐块比较，所以重录一节之后，其他各节在录制之后的改动仍被报告；没有它的讲授轨按整个 IR 的哈希。重录一节之后的 `ir.hash` 只在每一节都与新录制时相同时才是新录制的，否则保留原来的；旧的讲授轨（没有 `ir.sections`）重录时，不知道的各节记为空的哈希（总是逐块比较）。同一块键、同一指纹为 exact；指纹唯一地出现在另一个键上为 moved，回放跟到新键；块还在但内容变了为 fuzzy；都没有为 lost。`go` 到不存在的章节为 lost，步骤超出章节现在的步数为 fuzzy；`lines` 超出代码现在的行数为 lost；`at` 指向不存在的语音段为 fuzzy。lost 与 fuzzy 是警告，moved 是提示；诊断写明讲授 ID、事件的时刻（`m:ss` 与毫秒）与它在 `track.json` 中的行。
- 讲授计划的检查（WP-83）：编译时 `{cue}` 不认识的命令、`pause` 没有时长、`click` 没有动作、`{say}` 没有 `alias` 是警告；`presmium check` 另报告 `to` 指的块不存在、没有 `to` 也没有前面的上屏块、块不在网页形态中显示、`lines` 超出代码的行数、`run` 不是代码块（警告，构建跳过这个提示标记）。写了 `renderers.lecture.voice` 而没有可用的合成引擎时（`SPEECH.engines()` 中没有所选的引擎），检查逐句查找合成缓存（查找不发请求），缺少的每一句是一条错误级诊断，指出这句话、它的章节与源码位置。

### 9.4 录制与存储（WP-77）

- 放映视图中的录制图层（`presmium dev` 与 `presmium serve` 中）：录制新的讲授，或选一个已有的讲授“重录本节”（只替换当前一节，离开这一节即停止：这一节的事件、语音段与媒体换成新录的，之后的一切按长度之差平移）；可选摄像头与屏幕；激光笔、荧光笔与清除标记。离开放映视图时录制结束并保存。开始录制时先请求共享屏幕（要在点击“录制”的用户手势有效时请求），再请求麦克风与摄像头（WP-79e2）。
- 回放（P-131）：播放栏、字幕、逐字稿（按句与按字跳转）与章节；章节面板在每一节之下列出讲授走到的各步（`go` 事件中章节或步骤的变化，`stepStops`），点击跳到那一步（WP-79e2）。没有音频的讲授（只有字幕）由 `SilentClock` 按页面的时钟播放。
- 录音开启回声消除与降噪，经 Mediabunny 的 WebCodecs 路径录为 Ogg/Opus（24 kbps）；没有 Opus 编码器的浏览器退回 MediaRecorder（`audio/ogg`、`audio/webm` 或 `audio/mp4`，时长取录制时的时钟）。摄像头与屏幕录为 WebM。每节每种一个文件：`audio/<章节>.ogg`、`video/<章节>.camera.webm`、`video/<章节>.screen.webm`（同名时加 `-2`）。
- 服务端的路由（`/__presmium/presmium.lecture/`）：读者可用的 `GET tracks`（讲授列表）、`GET tracks/<id>`（`track.json`）与 `GET tracks/<id>/<audio|video>/<文件>`（支持范围请求）；编辑者可用的 `POST recordings`（`{ track? }`；新讲授的 ID 是录制当天的日期，同一天再录加 `-2`；同时写入忽略媒体的文件）、`POST recordings/<id>/media`（为一节的文件取名）、`PUT recordings/<id>/files/<文件>?at=<位置>`（每 5 秒一块，按位置写入，只能改写已有部分或在末尾追加）与 `POST recordings/<id>/finish`（`{ head, recording, section? }`，写 `track.json` 与媒体的 `sha256`）。
- WP-83 增加的路由：读者可用的 `GET tracks/script`（合成的讲授，按需合成，见 6.3 节）与 `GET tracks/<id>/clips/<键>.<wav|ogg>`（合成缓存中的片段）；编辑者可用的 `GET speech`（转写与合成引擎的 ID、服务提供方、是否本机与合成引擎的音色）、`POST editing/<id>/transcribe`（以文稿的转写引擎，即 `presmium.speech.transcribe`，否则 `engine`，否则第一个能转写的引擎，转写每一节的录音）、`PUT editing/<id>/utterances/<语音段>`（`{ text }`）与 `POST editing/<id>/synthesize`（`{ voice, engine? }`，每一句以这个音色重新合成），都写回 `track.json` 并返回它。播放器的逐字稿面板中，编辑者有“转写（<服务提供方>）”“重新合成（<服务提供方>）”与每句的修改；转写与合成先弹出写明服务提供方（本机引擎另写明不外发）的确认，确认之后录音与文字才发给语音服务。
- 运营者设置 `settings.presmium.lecture.audio`：`ignore`（默认，`lectures/<id>/.gitignore` 忽略 `audio/` 与 `video/`）、`lfs`（`.gitattributes` 把它们交给 LFS）或外部地址的前缀（仍然忽略，讲授轨中的 `src` 写成 `<前缀><id>/<文件>`，由运营者把文件放到那里）。
- `track.json` 每个字段一行，事件、语音段、媒体与块每项一行，改一个事件只改一行。

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
settings:                            # 插件的运营者设置，键为插件 ID（ServerContext.settings、NodeServiceContext.settings、GatewayContext.settings）
  presmium.workspace:
    plugins:                         # 运营者插件：安装在工作区根目录的包；presmium serve、gateway、agent-host 只加载它们（D14）
      - '@presmium/slidev-addon-code'
      - '@presmium/slidev-addon-exec'
      - '@presmium/slidev-addon-assistant'
  presmium.deltabox:                 # 随 CLI 安装的 addon-deltabox（不必列在上面，所有命令中都加载；主机满足条件时登记服务）
    review: true                     # 修改审阅（默认 true）；false 时助手用内置的 git 实现
    sandbox: true                    # 编译时执行的进程沙箱（默认 true）
    read: ['~/.local/lib']           # 进程沙箱中另外只读的路径
  presmium.assistant:
    review: required                 # 修改任务先审阅后提交（默认）；auto：直接全部接受并提交
    # command、tutor、provider 只用于替换随包的 DeepSeek Harness（LOCAL 模式），例如：
    # command: [claude-code-acp]
    # provider: Anthropic
  presmium.exec:                     # 编译时执行（architecture.md 10.6 节）
    compile: approve                 # SHARED 模式中没有录制的代码：approve（默认，所有者确认）、trusted、off
    passEnv: [HF_HOME]               # 另外传给被执行代码的环境变量
  presmium.lecture: { audio: ignore }   # 录制音频与录像的去处：ignore（默认）、lfs，或外部地址的前缀
  presmium.speech:
    cloned: false                    # 是否允许克隆音色（默认 false；允许时每个克隆音色仍要有运营者目录中的同意记录）
    consentDir: consent              # 同意记录的目录，相对于运营者目录（默认值）
```

- 文档的身份是目录；标题、语言与标签取自各文档的头部（`title`、`lang`、`tags`）。
- `site` 的 `nav`、`footer`、`head`、`sitemap` 与 `renderers.web` 的同名选项相同（2.1 节），作用于整个工作区站点。
- `members` 与 `approvals` 只在 `presmium serve` 中使用。`settings` 是插件的运营者设置：`presmium dev`、`build`、`check`、`presmium serve`、`presmium gateway` 与 `presmium agent-host` 都读取文稿所在工作区根目录的这个文件（单份文稿的仓库也可以只写 `settings`），只在进程启动时读取一次，运行中改动要等运营者重启才生效。
- `presmium.workspace.plugins` 是运营者的插件列表（D14）：`presmium serve`、gateway 与 agent-host 只从工作区根目录的 `node_modules`（以及随 CLI 安装的 Presmium 自己的包：渲染端与 `addon-deltabox`）加载这里列出的 Node 插件；文稿的 `plugins` 与 `renderers.<id>.package` 中没有列出的包、相对路径与只在文稿目录 `node_modules` 中的包不加载，并给出错误级诊断 `presmium.plugins`。声明了 `operator: true` 的插件在所有命令中每份文档都加载；`addon-deltabox` 不必列出（`presmium.deltabox` 关闭它的服务）。`presmium dev`、`build`、`check` 照旧接受文稿自己的插件与渲染端包。
- SHARED 模式的 `presmium serve` 中，编译器只读真实路径在工作区根目录之内（且不在 `.git/` 中）的文件：文档目录中指向别处的符号链接（例如指向 `/proc/self/environ`）不被读取，给出错误级诊断 `presmium.files`；单份文稿的仓库在 SHARED 模式中不受支持，文档必须在工作区根目录的子目录中（`architecture.md` 10.2、10.5 节）。
- 助手的模型访问来自环境变量，不来自这个文件：`DEEPSEEK_API_KEY`（DeepSeek 的官方地址，服务提供方为 DeepSeek），或 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 与 `PRESMIUM_MODEL_PROVIDER`（Messages 兼容的服务，三者都要有）。配置了模型访问时助手启动随包的 DeepSeek Harness（模板随包提供），没有时助手不可用。`presmium.assistant` 的 `command`、`tutor`（或环境变量 `PRESMIUM_AGENT_COMMAND`、`PRESMIUM_AGENT_TUTOR_COMMAND`，环境变量优先）只用来替换运行时，要同时给出 `provider`（或 `PRESMIUM_AGENT_PROVIDER`），只在 LOCAL 模式中生效。SHARED 模式中这些凭据只在 gateway 的环境中。
- `presmium.exec` 由编译器读取：`passEnv` 在所有命令中生效；`compile` 只在 SHARED 模式的 `presmium serve` 中生效（LOCAL 模式全部执行）。
- `presmium.speech.consentDir` 在运营者目录之中。运营者目录在任何工作区与文档目录之外：LOCAL 模式是用户的状态目录 `${XDG_STATE_HOME:-~/.local/state}/presmium/operator/<工作区标识>/`（`--operator-dir` 或 `PRESMIUM_OPERATOR_DIR` 可以另行指定；不属于任何文档，agent 对它的权限请求一律被拒绝），SHARED 模式是 gateway 的 `--operator-dir`，只挂在 gateway 容器中（`architecture.md` 10.5 节）。记录只由所有者经语音插件的路由（SHARED 模式中只在所有者控制台的源上）或运营者用 `presmium-speech consent` 登记（9.1 节），不随文稿提交。
- 这些设置都不能写在文稿中：文稿头部 `presmium.<插件 ID>` 中的同名键不进入 `settings`。
