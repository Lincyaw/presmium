---
title: 作者指南
description: 用 MyST Markdown 编写讲义，生成网页、幻灯片、notebook 与讲授
translations: { en: lecture.en.md }
---

(guide)=
# 作者指南

Presmium 把一份 MyST Markdown 讲义编译为中间表示（IR），再由渲染端生成网页、幻灯片（Slidev）、Jupyter notebook 与带语音的讲授。讲义是纯文本，可以和它讲解的代码放在同一个 git 仓库里；讲义中的代码可以引用仓库中真实的代码、在构建时运行、在读者的浏览器中运行。

这份指南面向写讲义的人：从安装和第一份文稿开始，依次讲语法、各种媒介、代码的执行、讲授与语音、AI 助手与读者问答、工作区与发布。开发插件的人另看[插件开发指南](../plugins/lecture.md)。

(start)=
# 入门

(start-install)=
## 安装

Presmium 需要 Node.js 22.19 或更新的版本。最快的开始方式是起步工具，它问你要哪种项目（讲义、工作区或插件），生成目录、`package.json` 与第一份文稿：

```sh
npm create presmium@latest
```

也可以在一个已有的目录中自己安装：

```sh
npm install -D @presmium/cli @presmium/web @presmium/render-slides @presmium/render-notebook @presmium/slidev-addon-core
```

`@presmium/cli` 提供 `presmium` 命令；`@presmium/web`、`@presmium/render-slides`、`@presmium/render-notebook` 分别生成网页、幻灯片与 notebook，只装要用的；文稿头部 `plugins` 列出的插件包也要安装。构建时运行的代码块用本机的 `python3` 或 `node`。

(start-first)=
## 第一份文稿

文稿是一个目录，入口文件是 `lecture.md`：

````md
---
title: 二分查找
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
---

# 二分查找

在有序数组中找一个数，每一步排除一半。

## 思路

```python
def search(xs, x):
    lo, hi = 0, len(xs)
    while lo < hi:
        mid = (lo + hi) // 2
        if xs[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo
```

先看中间的元素：比要找的数小，答案就在右半边。
````

`#` 标题是文稿的标题，每个 `##` 开始一个章节。章节中的代码块是“上屏内容”，出现在幻灯片的页面上；段落是“讲解”，在网页中是正文，在幻灯片中是演讲备注。

(start-commands)=
## 命令

在文稿目录中运行（参数也可以是文稿目录或入口文件）：

| 命令 | 作用 |
|---|---|
| `presmium check` | 编译并检查：语法、插件的检查项、失效的链接；只输出诊断 |
| `presmium dev` | 启动开发服务器，保存源码后页面就地更新 |
| `presmium build` | 生成全部媒介：`dist/ir.json` 与 `dist/<渲染端>/` |
| `presmium ir` | 把 IR 以 JSON 输出，看编译的结果 |

每行诊断的格式是 `<文件>:<行>  <级别>  <消息>  (<检查 ID>)`。退出码 0 表示没有错误，1 表示有错误级的诊断，2 表示用法错误。常用的流程是：改源码，`presmium check`，`presmium dev --to web` 边写边看，最后 `presmium build`。

(syntax)=
# 语法

(syntax-headmatter)=
## 文稿头部

```yaml
---
title: BPE 分词
lang: zh-CN                 # 文稿语言：<html lang>、界面语言与写进产物的文字都按它，默认 zh-CN
plugins:                    # 用到的插件包
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-code'
presmium:                   # 各插件的配置，键为插件 ID
  presmium.code: { repo: https://github.com/org/repo }
renderers:                  # 默认构建的渲染端及其配置
  web: {}
  slides: {}
  notebook: {}
sectionDepth: 2             # 开始章节的标题级别，默认 2
---
```

没有列在 `plugins` 中的插件，它的指令报错 `unknown directive`。不写 `renderers` 时构建全部已安装的渲染端。

(syntax-sections)=
## 章节、讲解与上屏内容

- 第一个 `##` 之前是封面；之后的每个 `#` 是分章标题，网页每章一页。
- 标题前一行的标签 `(merge)=` 给章节一个稳定的 ID，用于深链接、在网页与幻灯片之间互跳和译本的对应。发布后不要再改它。
- 普通段落、列表、引用是讲解；代码块、图片、表格、公式、图表和插件的指令是上屏内容。想让一个列表出现在幻灯片上，把它放进 `{slide}`：

````md
:::{slide}
- 先数相邻的字节对
- 再合并最常见的一对
:::
````

(syntax-steps)=
## 步骤

上屏内容默认在第 0 步出现。`:reveal:` 让一个块在下一步出现，`{slide}` 上的 `:reveal: items` 让其中的列表逐项出现。讲解按顺序绑定到它前面最近的上屏块：块出现的那一步讲第一段，下一步讲第二段。所以“每步一段讲解”的写法就是在块后面按步骤写段落。`presmium ir` 输出每个块的 `at`（出现的步骤），可以用它核对。

(syntax-only)=
## 媒介限定与排版提示

- `:::{only} web, notebook` 让内容只出现在列出的渲染端。
- `:::{hints}` 按渲染端给排版提示，例如 `slides: { layout: center }` 写进这一页的 Slidev 头部，`web: { layout: scrolly }` 让这一节在网页中用滚动叙事版式。
- `:::{config}` 给插件只在本章节生效的配置。
- `{include}` 引入另一个文件（路径相对于当前文件），长讲义可以每章一个文件。

(syntax-references)=
## 标签与交叉引用

块前的 `(id)=` 或指令的 `:label:` 给块一个 ID。`` {ref}`merge` `` 引用章节，文字是章节的标题；`{numref}`、`{eq}` 引用带标签的图、表与公式。引用的目标不存在时，`presmium check` 给出警告 `presmium.references`。

(syntax-code)=
## 引用真实的代码

`@presmium/slidev-addon-code` 的 `{code-ref}` 引用仓库中的代码而不复制它：锚点写成 `region:src/bpe.py#merge`（代码中的 `#region` 注释）、`symbol:src/bpe.py#BPE.merge`（语法树中的声明）或 `pattern:`（ast-grep 模式）。`:pin:` 读取某个提交中的代码并生成永久链接；锁定的代码在工作区中变了时，`presmium check` 给出漂移的警告与差异。

(media)=
# 媒介

(media-forms)=
## 四种媒介

| 渲染端 | 包 | 产物 |
|---|---|---|
| `web` | `@presmium/web` | 静态网站：每章一页，可以搜索，带导航与页脚 |
| `slides` | `@presmium/render-slides` | Slidev 幻灯片，默认主题“书卷”；可导出 PDF 与 PNG |
| `notebook` | `@presmium/render-notebook` | Jupyter notebook：讲解是 Markdown 单元格，代码是代码单元格 |
| `lecture` | `@presmium/slidev-addon-lecture` | 讲授：讲解合成为语音，配合页面上的操作回放 |

`presmium build --to web,slides` 只构建列出的渲染端。插件的组件在网页与幻灯片中是同一个组件；notebook 这样的静态媒介显示组件的降级内容，没有降级内容时写一行说明并链接网页版。

(media-site)=
## 网站的外壳与地址

`renderers.web` 可以给网站加导航与页脚：`nav`（`{ text, link }` 的列表）、`footer`（`message`、`copyright`）、`head`（`description` 与 `image`，用于 Open Graph）、`sitemap`（`hostname`）。同时构建网页与幻灯片而都不写 `base` 时，网页在 `/web/`、幻灯片在 `/slides/`，`dist/` 整体就是一个站点；只构建一种时在 `/`。

(media-files)=
## 随文稿发布的文件

正文链接、图片与原始 HTML 的 `src`、`href` 指向的本地文件随各种媒介一同发布，文件名带内容的哈希。链接到文稿中的一个目录（如 `[起始代码](starter/)`）时发布其中的文件和一个文件清单页；隐藏文件与 `node_modules` 不发布。

(media-translations)=
## 译本

原文头部写 `translations: { en: lecture.en.md }`，译本自己的头部写 `title`、`lang` 与 `translationOf: { entry: lecture.md, digest: <摘要> }`，章节的标签与原文相同。网页把译本放在 `/<语言>/` 下，语言菜单停在同一章。原文改了以后，`presmium check` 警告译本过期并给出新的摘要：核对译文后把它写回 `digest`。

(execution)=
# 执行环境

(execution-when)=
## 构建时与浏览器中

- `:run:`（或 `:run: compile`）让代码块在构建时运行，输出写进 IR，每种媒介都显示它。
- `:run: live` 让读者在浏览器中运行：网页的代码块有运行按钮，浏览器中的 Python 由 Pyodide 执行，离线也可以。`:run: both` 两者都要。
- 同一个 `:session:` 的代码块共享解释器，前一块定义的变量后一块可以用。
- `:echo: false` 只显示输出；`display()` 的对象、图片与表格录制为富输出。

````md
```{code} python
:run:
print(sum(range(10)))
```
````

(execution-languages)=
## 语言与执行器

Python 与 JavaScript 在本机用 `python3`、`node` 运行。`@presmium/slidev-addon-exec-wasi` 让 C、C++、Ruby 与 SQL 在 WebAssembly 中运行，构建与浏览器用同一份运行时；`@presmium/slidev-addon-exec-webgpu` 在浏览器的 GPU 上运行 WGSL 计算着色器。

(execution-environments)=
## 具名环境

头部的 `execute.environments` 声明具名的运行环境，代码块用 `:env: <名字>` 选择：`devcontainer`（`@presmium/slidev-addon-exec-local`，本地容器）、`jupyter`（`@presmium/slidev-addon-exec-jupyter`，远端的 Jupyter）、`wasi`、`webgpu`。头部不写凭据：凭据只来自运行 `presmium` 的环境变量，如 `PRESMIUM_ENV_<名字>_TOKEN`。`presmium check --env` 连接每个声明的环境。

(execution-cache)=
## 缓存与沙箱

输出缓存在 `.presmium/freeze/`，键是代码、语言、参数与运行环境的哈希：代码不变就不重跑，提交这个目录后，别人构建不需要运行环境。编译时运行的代码只得到清理过的环境变量（去掉名字像凭据的变量）。在满足条件的 Linux 主机上，构建时的 Python 与 JavaScript 在进程沙箱 deltabox 中运行：不能联网，只能写自己的运行目录。

(lecture)=
# 讲授与语音

(lecture-script)=
## 讲解就是脚本

列出 `@presmium/slidev-addon-lecture` 与 `@presmium/slidev-addon-speech`，在 `renderers.lecture.voice` 中选一个音色，`presmium build --to web,lecture` 就把每一步的讲解合成为一段讲授：播放时页面按讲解推进步骤。讲解中可以写行内的提示：

- ``{cue}`next` `` 在这里推进一步，``{cue}`pause 2s` `` 停顿两秒；
- ``{cue to=code-1 lines=2-3}`spot` `` 在说到下一个字时聚光代码的两行；
- ``{say alias="B P E"}`BPE` `` 读出另一种写法。

(lecture-speech)=
## 语音引擎

语音引擎由运营者在环境变量中定义（`PRESMIUM_SPEECH_<ID>_URL`、`_PROVIDER`、可选的 `_KEY`），文稿只写引擎的 ID。合成的音频缓存在 `.presmium/speech/`，提交之后别人构建不再调用语音服务、不需要凭据。合成的语音在播放界面与音频元数据中标明由 AI 生成；克隆某人的音色要有本人的同意记录。

(lecture-recorded)=
## 录制的讲授

讲者也可以在放映视图中录下自己的讲授：声音与页面上的操作（翻页、聚光、圈画）一起记录在 `lectures/<id>/track.json` 中，回放时页面按录制的时间重现操作。讲义改了以后，`presmium check` 报告引用了不存在的块的操作。`presmium-lecture export` 把讲授导出为视频。

(assistant)=
# AI 助手与读者问答

(assistant-ask)=
## 读者问答

文稿的 `plugins` 加上 `@presmium/slidev-addon-assistant` 后，页面上有“提问”：读者就当前一节提问，或先选中一段文字再问，回答中的引用点了就跳到那一节。静态站点同样有这个功能，不需要服务端。

回答来自读者自己填写的模型服务（OpenAI 兼容的 Chat Completions 接口的地址、密钥与模型名），设置只保存在读者的浏览器中；问题连同当前一节的文字从浏览器直接发给该服务，费用由读者自己承担。面板写明这一点，也写明同一站点的脚本能读到密钥。

(assistant-edit)=
## 由 agent 修改讲义

在本机工作台（`presmium serve`）中，助手还可以按你的批注或对话修改讲义，改动先由你逐个文件审阅，接受后成为一个可以撤销的 git 提交。这部分属于工作台，是预览功能，界面会随新的工作台改变。模型服务由运营者在环境变量（如 `DEEPSEEK_API_KEY`，或 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER`）或工作台的模型设置中提供，从不写进讲义与产物。

(assistant-mcp)=
## 编辑器中的 agent

`presmium dev` 与 `presmium serve` 以 MCP 把文稿交给编辑器中的 agent（Claude Code、Codex、VS Code 等）：读取章节、步骤、代码引用、输出与诊断，在你确认后导航、运行代码或构建。启动时打印 MCP 的地址与令牌所在的文件；不启动服务时，`presmium-mcp <文稿目录>` 以 stdio 提供读取类的工具。

(workspace)=
# 工作区

(workspace-config)=
## 多份文档组成的站点

工作区是一个目录，根目录有 `presmium.workspace.yaml`，每份文档在自己的子目录中、各有一个 `lecture.md`：

```yaml
title: 机器学习导论
documents: [week1/lecture.md, week2/lecture.md]
site:
  home: week1               # 可选：首页转到这份文档，文档列表在 documents.html
  nav:
    - { text: 第 1 周, link: /week1/ }
  footer: { message: 课程资料 }
  locales:
    en: { title: Introduction to machine learning }
```

在根目录运行 `presmium build`，整个站点写到 `dist/web/`：首页列出文档，每份文档在 `/<目录>/` 下；每份文档的搜索框也找得到其他文档，第一页与最后一页的上一章、下一章接到前后的文档。链接另一份文档写它的入口文件，可以带章节的标签作片段（`[螺线](../week2/lecture.md#w2-spiral)`），站点把它改写为那份文档的页面，从不发布文档的源码。

(workspace-translations)=
## 工作区中的译本

文档声明的译本随工作区站点一同发布：每份文档的译本在 `/<目录>/<语言>/` 下，页面有语言菜单；首页另有每种语言的版本 `/<语言>/`，列出那种语言的文档（没有这种译本的文档列出原文），标题取 `site.locales.<语言>.title`。译本中链接另一份文档时照样写它的入口文件，那份文档有同一语言的译本就到达译本的页面。这份文档站就是这样构建的：每份文档以中文写成，译为英文。

(workspace-serve)=
## 本机工作台

`presmium serve` 在本机启动工作区服务：站点按需编译、保存即更新，浏览器中可以编辑源码、管理文档、查看与撤销修改历史。它只供运行它的你使用，默认只监听本机；`--host` 让局域网中的其他设备也能打开，但没有登录，到得了这个端口的人都能以你的身份修改与运行。工作台的浏览器界面是预览，会被新的工作台取代；工作区配置文件与 `presmium serve` 命令保持不变。工作台的预览只显示原文，译本由 `presmium build` 发布。

(publish)=
# 发布

(publish-check)=
## 发布检查

`presmium check` 在每种媒介的视图中检查：链接、图片与原始 HTML 指向的本地文件是否存在，`#片段` 是否是文稿的章节、块、标签或标题，链接另一份文档时那份文档有没有这个片段（`presmium.links`）；MyST 指令的错误（`presmium.directive`）；头部 `checks: { forbid: [...] }` 中正则的命中（`presmium.forbid`），用来挡住内部编号与未发布内容的名字。`--external-links` 用 lychee 检查外部链接。

(publish-audience)=
## 学生版

指令加 `:audience: teacher` 让块只给教师，章节顶层的 `:::{audience} teacher` 让整节只给教师。`presmium build --audience student` 构建学生版，并扫描写出的每个文件里有没有被去掉的句子，有就报错。

(publish-hosting)=
## 托管与提交

产物是静态文件，放到任何静态托管上即可（GitHub Pages、对象存储、学校的服务器）；读者问答也在浏览器中完成。随文稿提交的是源码和 `.presmium/` 中的这几项：`freeze/`（执行缓存）、`anchors.lock.json`（代码锚点的锁定）、`drawings/`（幻灯片上的圈画）、`assets/`（本地化的远程图片）、`speech/` 与 `speech.lock.json`（语音缓存）。`dist/` 与渲染端的工作目录不提交。
