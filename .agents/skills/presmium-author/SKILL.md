---
name: presmium-author
description: "Presmium 讲义作者指南：用 MyST Markdown 新建或修改讲义（文稿头部 title、lang、plugins、presmium 插件配置、renderers；章节、讲解与上屏内容 {slide}、步骤 :reveal:、{only}、{hints}、{config}、{include}、标签与交叉引用、受众 :audience: 与 {audience}（学生版）；各插件指令 {code-ref}、{run-panel}、{step-run}、{quiz}、{exercise}、{cursor}、{markmap} 等），运行 presmium check（含发布检查：失效链接、MyST 指令错误、checks.forbid）、ir、build、dev 并修复诊断，决定 .presmium 中哪些文件提交。Use when writing or editing a Presmium lecture or deck (lecture.md, MyST directives, code references with pins and drift, compile-time or live code runs, freeze cache, step and narration binding) or fixing presmium check/build diagnostics."
---

# 编写 Presmium 讲义

Presmium 把一份 MyST Markdown 讲义编译为中间表示（IR），再生成网页、幻灯片（Slidev）与 Jupyter notebook。编辑只在源码中进行，产物不回写源码。完整的语法与 IR 定义见 `docs/ir.md`（本技能只给要点和容易出错的地方），每条指令的选项与示例见 `references/directives.md`。

放映与课堂见 presmium-present 技能；开发插件或渲染端见 presmium-develop 技能。

## 1. 文稿放在哪里

文稿是一个目录，入口为 `lecture.md`（也可以把入口文件直接交给命令）。`presmium` 命令来自全局安装的 `presmium` 包（`pnpm add -g presmium`；从源码仓库是 `pnpm install` 之后 `pnpm add -g ./packages/presmium`），它带着三个渲染端与全部官方插件；插件与渲染端先从文稿目录向上查找 `node_modules`，找不到时用 `presmium` 包带的。只用 pnpm，不写 npm、npx 的命令。

- 新建一个项目：`presmium new` 逐项询问（讲义、工作区还是插件，目录，标题），也可以用参数：`presmium new my-lecture --type lecture --title 分词入门`（`--type workspace` 是工作区，`--type plugin --name <包名>` 是插件，`--no-git` 不运行 `git init`；`pnpm create presmium` 相同）。讲义项目有从文档模板来的 `lecture.md`（`plugins` 已列出 `@presmium/slidev-addon-core`）、以开发依赖列出 `presmium` 版本的 `package.json`、`pnpm-workspace.yaml`（允许哪些依赖运行安装脚本）、`.gitignore`、`AGENTS.md`（`CLAUDE.md` 链接到它）与本技能和 presmium-present 的副本（`.agents/skills`，`.claude/skills` 链接到它）；工作区项目另有 `presmium.workspace.yaml` 与第一份文档 `intro/lecture.md`。之后直接 `presmium dev`（工作区 `presmium serve`）；在项目中 `pnpm install` 之后全局命令转交给项目里的 `presmium`，版本由项目决定。
- 在仓库内：仿照 `examples/demo/package.json` 在 `examples/<名字>/` 建一个工作区包（依赖写 `workspace:*`），在仓库根目录运行 `pnpm install`。之后在文稿目录运行 `pnpm exec presmium <命令>`。
- 像从注册表安装那样试用（发布前）：在仓库根目录运行 `pnpm consumer <目录>`，它把各包打成压缩包，在 `<目录>` 中用 pnpm 安装 `presmium` 与一个示例插件，之后在那里运行 `pnpm exec presmium <命令>`。

仓库中的示例可以照着写：`examples/demo` 是一份完整的讲义（BPE 分词），其中“延伸”一章 `pages/extend.md` 用到 WebAssembly 中的 C、WGSL 计算着色器、跨代码块的 Python 会话与只显示输出的表格、先预测再揭示、卡片与栅格、讲解中的 `{cue}` 与 `{say}`，`README.md` 写明构建、录制与讲授的合成；`examples/workspace` 是放着这份讲义与一份短文档的工作区，`README.md` 写明 `presmium serve` 的启动与体验步骤。

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
  slides: {}                    # 不写 theme 时是 Presmium 的“书卷”主题；theme: default 是 Slidev 的默认主题
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
- `renderers.web`：`base`（站点路径）、`port`（开发服务器端口）；站点外壳：`nav: [{ text, link }]`（顶部导航，`link` 为站内路径如 `/chapter2.html` 或完整地址，也可以 `{ text, items: [...] }` 成为下拉菜单）、`footer: { message, copyright }`（每页底部，可含行内 HTML）、`head: { description, image }`（页面的描述与 `og:title`、`og:description`、`og:image`；`image` 可以是文稿中的本地文件）、`sitemap: { hostname }`（生成 `sitemap.xml`，地址带上站点路径）。`renderers.slides`：Slidev 文稿头部的选项（如 `theme`、`routerMode`、`exportFilename`），另有 `base`、`port`、`addons`。不写 `theme` 时幻灯片用 Presmium 的默认主题“书卷”：纸色底、衬线体的标题、标题上方强调色的小字是这一节所在的章（`#` 分章标题），底部是讲义标题、这一页的步骤条与页码，代码在 1280 px 宽的投影上不小于 18 px，按步骤高亮代码行时其余的行退为一种灰色（不是 Slidev 的半透明），仍然清楚可读，明暗两套随 Slidev 的暗色模式切换，插件组件用同一套颜色与控件；`theme: default` 是 Slidev 自己的默认主题，也可以写别的主题包或本地目录。`renderers.notebook`：`kernel`（默认 `python3`，与内核同语言的代码成为代码单元格）、`webUrl`（notebook 显示不了的组件链接到网页版；不写而同时构建网页时用相对链接 `../web/<页>#<章节>`）。任一渲染端都可以用 `package` 换成另一个包。
- `base` 的默认值：同时构建网页与幻灯片、两者都不写 `base` 时，网页为 `/web/`、幻灯片为 `/slides/`，`dist/` 整体就是一个站点；只构建一种时为 `/`。
- 不写 `renderers` 时构建全部已安装的渲染端。
- 入口文件以 UTF-8 BOM 开头（Windows 记事本）也没关系。
- 译本：原文头部写 `translations: { en: lecture.en.md }`（语言到同一目录中的另一个入口文件）。译本自己的头部只写 `title`、`lang` 与 `translationOf: { entry: lecture.md, digest: <摘要> }`，插件与渲染端配置取自原文；章节标签与原文相同（原文没有写标签的章节，译本照原文由标题生成的 ID 写上标签），语言菜单才能停在同一章。`presmium build` 把译本放在网页的 `/<语言>/` 下（幻灯片与 notebook 只有原文）。原文改动后 `presmium check` 警告译本过期（`presmium.translations`，位置在译本的 `digest` 一行）并给出新的摘要：核对译文后把它写回 `digest`。新写的译本先随便写一个摘要，检查会给出正确的（摘要要写成 64 位十六进制的字符串，全是数字的摘要被 YAML 读成数字）。译本同样可以写 `:audience:` 与 `{audience}`：`presmium build --audience student` 的两种语言都去掉教师内容，扫描也查译本的。工作区站点（在工作区根目录 `presmium build`）同样发布译本：文档的译本在 `/<文档目录>/<语言>/` 下，页面有语言菜单；首页另有每种语言的版本 `/<语言>/`，列出那种语言的文档（没有这种译本的文档列出原文），标题取工作区配置的 `site.locales.<语言>.title`（不写时用 `title`）。译本中链接另一份文档时照样写它的入口文件（`../week2/lecture.md#标签`），那份文档有同一语言的译本就到达译本的页面，没有时到原文；导航栏的“文档”与跨文档的上一章、下一章仍回到原语言。`presmium serve` 的预览只显示原文，声明了译本的文档在那里得到警告 `presmium.translations`（`… is not in the workspace site of presmium serve …`）。

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
- `:::{hints}` 的正文是按渲染端分组的 YAML：`web: { layout: scrolly }` 让这一节在网页中用滚动叙事版式；`slides:` 下的键写进这一页的 Slidev frontmatter（如 `layout: center`；代码太长、一页放不下时用 `slides: { zoom: 0.75 }` 缩小这一页，Slidev 的代码运行器不会自己出现滚动条）。不要用 `two-cols` 这类需要 `::right::` 插槽的布局，MyST 写不出插槽，内容会全挤在左栏。
- `:::{config}` 为插件提供只在本章节生效的配置（YAML，键为插件 ID）。读取章节配置的是 `presmium.exec.timeoutMs`（这一节代码在编译时与浏览器中的超时）与 `presmium.code.repo`（这一节 `{code-ref}` 永久链接的仓库）；其他选项只读全局配置。
- 受众：任何指令加 `:audience: teacher` 让块只给教师（讲解段落用 `{only}` 包起来再加；嵌在另一个指令正文中或列表项中的指令，如 `{tab-set}` 中的一个 `{tab-item}`、`{grid}` 中的一张 `{card}`，也可以加），章节顶层的 `:::{audience} teacher` 让整节只给教师，`{include}` 加 `:audience: teacher` 让包含进来的全部内容（连同其中的章节）只给教师。`presmium build --audience student` 生成学生版并扫描产物中有没有被去掉的句子（`presmium.audience`）；`presmium serve` 中读者只看到学生版。`{include}` 加 `:audience: teacher` 而被引入的文件开出章节时，紧跟在 `{include}` 后面的内容属于那一节、同样只给教师（警告 `presmium.audience` `this content follows an {include} …`；它自己也只给教师时不警告）：在 `{include}` 之后先写一个标题。写法见 `references/directives.md` 的 `{audience}`。

## 6.1 发布检查

`presmium check` 在每个渲染端的视图中检查（只出现在某个媒介中的内容只在该媒介中检查，只在部分媒介中出错时消息末尾写 `(in slides)` 等）：

- `presmium.links`：链接、图片、卡片的 `:link:`、组件的本地文件与原始 HTML 的 `href`、`src`、`poster` 指向的本地文件不存在或在仓库之外；`#片段` 不是本文稿的章节 ID、块 ID、标签或标题；`其他文档/lecture.md#片段` 指向的文档没有这个片段；单份文稿的构建中，指向另一份文档的入口文件的链接保留原样（警告 `… is not published: it is the source of the document …`，工作区站点链接它的页面）。
- `presmium.directive`：MyST 指令与角色的错误（myst-parser 无法应用的指令，如带 `:file:` 的 `{csv-table}`），错误级；消息写出该指令不接受的选项。
- `presmium.forbid`：头部 `checks: { forbid: ['T-\d{3}', 'instructor/'] }` 中的正则（JavaScript 语法）在标题、讲解、上屏内容、链接目标、代码与录制输出中的命中。
- `presmium check --external-links`：本机装有 lychee 时检查外部链接（失败是警告），没有时给出一条信息级提示。

## 7. 引入、标签与交叉引用

- 多文件文稿：用 `{include}` 指令引入其他文件（路径相对于当前文件，写法见 `references/directives.md`）；被引入文件的 frontmatter 被忽略。脚注的引用与定义须在同一文件；不同文件可以都用 `[^1]`，每个文件的脚注各自从 1 编号。
- 标签：标题前的 `(id)=` 给章节 ID；块前的 `(id)=` 或指令的 `:label: id` 给块 ID（章节内唯一）。`{question-box}` 的 `:target:` 和课堂笔记依赖块 ID；没有标签的块 ID 随前面插入同类块而变化。
- 交叉引用：`` {ref}`merge` `` 引用章节（文字为章节标题），`{numref}`、`{eq}` 引用带标签的图、表、公式；自己写了文字的引用保留文字。目标不存在时警告 `presmium.references`。
- 发布的文件：正文链接、图片、原始 HTML 的 `src`、`poster`、`href` 指向的本地文件（相对于所在的源文件，或 `/...` 指文稿的 `public/`）随三种媒介一同发布，名字带内容哈希。链接到文稿目录中的一个子目录（如 `[起始代码](starter/)`）时，网页与幻灯片发布它的文件和一个文件清单页（每个文件可以下载），notebook 把目录复制到 `media/`；目录中的隐藏文件与 `node_modules` 不随它发布，链接指向隐藏目录或 `node_modules`（或其中的目录）时整个不发布并警告（`presmium check` 同样报告）；直接链接到一个文件时照常发布，不论它的名字（不要链接 `.env` 这样的文件）；链接到的 Markdown 文件（模板、起始目录中的 `README.md`）也按原样发布、可以下载，其中像 HTML 的占位（`<answer>`）与 `{{ x }}` 不影响构建。工作区中链接另一份文档写它的入口文件或目录，可以带章节 ID 或标签作片段（如 `[延伸](../bpe/lecture.md#extend-c)`、`[BPE 分词](../bpe/)`）：工作区站点（在工作区根目录 `presmium build`、`presmium serve`）把它改写为那份文档对应的页面（`/bpe/extend.html#extend-c`）；单独构建这份文稿时链接保留原样，构建报告在该行给出警告 `presmium.links`。任何构建都不发布另一份文档的源码，学生版也带不出它的教师内容。原始 HTML 按 HTML 解析，只有元素真正的属性被当作地址（`<code> href=x</code>` 中的文字不是）。相对路径指向不存在的文件、或文件在文稿所在的 git 仓库之外时不发布，构建报告在该行给出警告 `presmium.links`。幻灯片上的链接与文件只有放在上屏内容（如 `{slide}`）中才显示在页面上。

## 8. 插件指令

指令一览、选项与最小示例见 `references/directives.md`。先确认提供该指令的包已写进 `plugins`。

讲解就是讲授的脚本：列出 `@presmium/slidev-addon-lecture` 与 `@presmium/slidev-addon-speech`，在 `renderers.lecture.voice` 中选一个音色，`presmium build --to web,lecture` 就把每一步的讲解合成为讲授（`?view=lecture&track=script` 播放）。讲解中用 ``{cue to=code-1 lines=2-3}`spot` `` 在说到下一个字时聚光、``{cue}`next` `` 在这里推进一步、``{say alias="B P E"}`BPE` `` 读出另一种写法；写法与配置见 `references/directives.md` 的“讲授的角色”。录制过的讲授也能反过来写成讲解：让工作台中的 agent 把转写按章节整理后替换讲解，录制时的操作成为相应位置的 `{cue}`；agent 经 MCP 工具 `track_narration` 读到逐字稿拼成的草稿与每一步讲解在源码中的位置。单独的讲授脚本中一段的问题（如 `{cue}` 的目标不存在），`presmium check` 报告在这一段所在的行。

讲授渲染端可以只列在头部而不默认构建：`renderers` 写 `lecture: {}`（不写 `voice` 就不合成，`presmium check` 也不需要语音引擎），`package.json` 的构建脚本写 `presmium build --to web,slides,notebook`；配置好语音引擎后再写上 `voice`，用 `presmium build --to web,lecture` 合成。写了 `voice` 而既没有引擎、合成缓存中又缺少某句话时，`presmium check` 对每一句报错。示例讲义就这样做，见 `examples/demo/README.md`。``{cue}`pause 2s` `` 适合放在一个问题之后，给听的人留出想一想的时间。`{cue}` 在页面上不显示文字，它和前后的中文之间不要留空格（``最多？{cue}`pause 2s`选好答案``），否则网页与 notebook 中多出一个空格；后面紧接行内代码时留一个空格，免得两段反引号连在一起。

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
- C、C++、Ruby、SQL：列出 `@presmium/slidev-addon-exec-wasi` 后，编译时与网页中都在 WebAssembly 中用同一份运行时执行（构建机不需要工具链，网页离线可用）；有浏览器中运行的这类代码时，构建发布对应的运行时（C、C++ 约 52 MB）。C 的全局变量写成 `static` 或给初值：没有初值、也不是 `static` 的全局变量（如 `int stats[256][256];`）使程序以退出码 134 结束，录制只有这个退出码。见 `references/directives.md` 的 `{code}`。
- 运行环境：头部 `execute.environments` 声明具名环境（不含凭据；凭据只来自环境变量，如 `PRESMIUM_ENV_<名>_TOKEN`，头部中像凭据的值给出警告 `presmium.secrets`），代码块与 `{run-panel}`、`{code-ref}` 用 `:env: <名>` 选择。环境不可用时不改用别的执行器：有录制就显示录制。`presmium check --env` 连接每个声明的环境，连不上是错误。
- 执行会话：同一 `:session:` 的代码块共享解释器（前一块定义、后一块使用），编译时改了其中一块整个会话重新执行；浏览器中每个页面各有一份，“重置会话”丢弃它。
- 富输出与 `:echo: false`：`display()`、`IPython.display` 的对象、matplotlib 的图与最后一个表达式的值录制为富输出，各媒介按类型显示（浏览器中的 Python 只有标准库：用到 numpy、matplotlib 等的代码块写 `:run: compile`，否则 `presmium check` 警告）；`:echo: false` 只显示输出，Markdown 输出按正文显示（从数据生成表格）。见 `references/directives.md` 的 `{code}`。
- 编译时执行的代码只得到清理过的环境变量：去掉 `PRESMIUM_` 开头与名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量（运营者可在工作区配置的 `settings.presmium.exec.passEnv` 中列出要传入的变量）。打印环境变量的代码因此不会把凭据写进录制与产物。
- 进程沙箱：运营者插件登记了进程沙箱时，编译时的代码经它运行，构建报告写明隔离方式；没有时直接运行。
- 组件里的代码（执行面板、分步执行、本地环境包着的代码块）由组件运行，不另显示运行按钮与录制输出。
- 执行缓存在 `.presmium/freeze/`，键为语言、代码、参数、执行器与环境指纹的哈希（会话中的块还包含前一块的键）；较大的图片等输出存在 `.presmium/freeze/blobs/`。`check`、`ir`、`build`、`dev` 每次编译都执行需要执行的代码并写入缓存；代码不变就不重跑；没有运行环境时沿用已提交的录制；超时不录制。只有 `presmium build` 删除已不存在的代码的录制。
- 超时：代码块或指令的 `:timeout:`，否则 `presmium.exec.timeoutMs`（头部的全局值，或某一节 `{config}` 中的值），否则编译时默认 10 秒。
- 别的运行环境（如另一个 Python 版本）录制的输出默认沿用并警告；头部写 `execute: { rerun: environment }` 时重新执行并替换录制。
- 执行失败或超时的 `{run-panel}` 显示 `:recorded:` 的预录输出。PDF、PNG 导出中执行面板显示先给参数赋值的代码与编译时的输出（没有时用 `:recorded:`）。

## 11. 命令

`[deck]` 是文稿目录或入口文件，默认当前目录。退出码：0 没有错误，1 有错误级诊断，2 用法错误或内部错误。

| 命令 | 作用 |
|---|---|
| `presmium check [deck]` | 编译并运行插件的检查项与发布检查（6.1 节），只输出诊断；`--json` 输出 JSON，`--update-lock` 先重写锚点锁定文件，`--env` 另外连接头部声明的执行环境，`--audience student` 按学生版编译后检查，`--external-links` 用 lychee 检查外部链接 |
| `presmium ir [deck]` | 把 IR 输出到标准输出（诊断在标准错误）；`--out <file>` 写到文件 |
| `presmium build [deck]` | 编译并生成媒介：`<deck>/dist/ir.json` 与 `<deck>/dist/<渲染端>/`；`--to web,slides,notebook` 选渲染端，`--out <dir>` 改输出目录，`--audience student` 只构建学生版并扫描产物（第 6 节） |
| `presmium dev [deck]` | 启动 Presmium 服务端与渲染端的开发服务器（网页、幻灯片），保存源码后增量更新；`--to web` 只启动网页，`--out <dir>` 改工作目录（默认 `.presmium/dev`），`--server-port <n>` 指定服务端的端口，`--allow operate` 让插件请求的这类确认不再询问（种类还有 `spend`、`write`、`agent`）。服务端只监听本机，地址与 MCP 的令牌写在 `.presmium/server.json`；插件请求的确认出现在页面工具栏的“待确认”入口。页面是实时预览，没有编辑界面 |
| `presmium serve [目录]` | 工作区服务：一个工作区（根目录有 `presmium.workspace.yaml`，文档在子目录中，各有 `lecture.md`）或一份文稿的站点开发服务器：首页列出文档，每份文档在 `/<目录>/` 下，按需编译、保存即更新；它也是工作台的后端（文档管理、源码、审阅与修改历史的路由，工作区须是 git 仓库）。只供运行它的你使用，默认只监听本机（`--port`，默认 4310）；`--host 0.0.0.0`（或本机的某个局域网地址）让你在局域网中的其他设备上打开它，启动时打印每个局域网地址，并警告没有登录：同一网络中到得了这个端口的人都能以你的身份修改与运行；也可以用 SSH 转发端口（`ssh -L 4310:127.0.0.1:4310 <主机>`）；多人使用时每人一个工作区。启动时另打印 MCP 的地址与令牌所在的文件（外部 agent 用它连接，见下文）。`--preview-origin <源>`（可重复）是嵌入预览的工作台的源 |
| `presmium build [工作区根目录]` | 在工作区根目录构建整个工作区站点到 `dist/web/`：首页是文档列表，每份文档在 `/<目录>/` 下；每份文档的搜索框也搜得到其他文档，第一页与最后一页的上一章、下一章接到配置顺序中前后的文档。工作区配置的 `site` 有与 `renderers.web` 相同的 `nav`（链接从站点根写起，如 `/week1/`）、`footer`、`head`、`sitemap`（整个站点一个 `sitemap.xml`），`base: /<路径>/` 把站点构建在这个路径下（GitHub Pages 的项目站点为 `/<仓库名>/`，默认 `/`），`home: <文档目录>` 让首页转到那份文档（文档列表在 `documents.html`），`locales: { en: { title: … } }` 给首页的每种语言版本一个标题；文档的译本在 `/<目录>/<语言>/` 下（第 2 节）；在文档目录中执行则只构建这一份 |
| `presmium studio [目录]` | 工作台（实验性）：基于 DeepSeek Harness 的编写界面，目录同 `presmium serve`（工作区根目录或一份文稿）。要另装 `@presmium/studio`（`pnpm add -g @presmium/studio` 后运行 `presmium-studio [目录]`，或在项目中 `pnpm add -D @presmium/studio` 后运行 `pnpm exec presmium studio`；连同 DeepSeek Harness 约 865 MB；没装时命令说明怎样装）。只打印一个网址 `studio  http://127.0.0.1:4320/?token=…`，在浏览器中打开它（网址带这次启动的令牌，浏览器以它换得 cookie，之后在同一个端口直接打开 `http://127.0.0.1:4320/` 也行；网址不要给别人）；`--port <n>` 换端口（默认 4320，被占用时另取空闲端口），`--host <地址>` 改为监听本机在局域网中的一个地址（不接受 `0.0.0.0`），没有登录，同一网络中到得了端口的人都以你的身份工作。模型在工作台的模型设置中选，或在启动前设置 `DEEPSEEK_API_KEY`（DeepSeek 的官方地址），或同时设置 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 与 `PRESMIUM_MODEL_PROVIDER`（Messages 兼容的服务）。会话、模型设置与日志 `presmium-studio.log` 在 `$XDG_STATE_HOME/presmium/studio`，不用你自己的 DeepSeek Harness 的设置；`Ctrl+C` 停止全部进程 |

常用流程：改源码 → `presmium check` → `presmium dev --to web` 边写边看 → `presmium build` 生成全部媒介。多份文档组成的课程用工作区：`presmium studio` 编辑，`presmium serve` 预览，`presmium build` 在根目录构建整个站点。`presmium serve` 与 `presmium dev` 一样加载文稿 `plugins` 列出的插件；运营者在 `settings.presmium.workspace.plugins` 中列出、装在工作区根目录的运营者插件（如语音）每份文档都加载。构建报告列出渲染端未渲染的块（`N blocks not rendered`）。

### 编辑器中的 agent（MCP）

Presmium 以 MCP 把文稿交给 agent（Claude Code、Codex、VS Code 等）：读取类工具 `list_documents`、`deck_info`、`list_sections`、`get_section`（讲解与上屏内容）、`get_step`、`search`、`get_code_ref`、`get_outputs`、`get_diagnostics`、`locate_source`（相对于文稿目录的文件与行），以及放映中的 `get_position`、`get_classroom`；操作类 `navigate`、`run_code`、`build`、`classroom_start`、`classroom_end` 要在页面工具栏的“待确认”中允许。没有写文件的工具：agent 用自己的文件工具改源码，`presmium dev` 随即重新编译。

- `presmium dev` 与 `presmium serve` 运行时：启动时打印 `mcp  <地址>/mcp (its token is in <文件>)`，令牌在这个只有你能读的文件里（`presmium dev` 是 `.presmium/server.json`，`presmium serve` 在工作区之外的缓存目录中），每次启动更换；agent 以 HTTP 方式连接，请求头 `Authorization: Bearer <令牌>`，例如 `claude mcp add --transport http presmium <地址>/mcp --header "Authorization: Bearer <令牌>"`。
- 不启动服务端时：`node <仓库>/packages/mcp/bin/presmium-mcp.mjs <文稿目录>` 以 stdio 提供读取类工具；加 `--allow operate` 另提供并直接允许 `run_code` 与 `build`。网页形态的放映视图与演讲者视图在自己的控制条中显示确认入口（“待确认”），放映时在那里允许或拒绝。
- 同样的数据也是只读资源（`presmium://sections`、`presmium://sections/{section}` 等，服务说明列出它们）。有多份文档时，工具以 `document` 指定文档，资源在 URI 后加 `?document=<文档目录>`。`navigate` 只移动自己打开的窗口：自己没有窗口显示文稿时直接返回错误，不询问。

### 页面中的 AI 助手

文稿的 `plugins` 加上 `@presmium/slidev-addon-assistant` 后，页面有“提问”（网页导航栏；幻灯片与网页的演讲者视图在 Presmium 面板中），静态构建的产物（包括 `--audience student` 的学生版站点）同样有：读者问当前一节，或先在讲义中选中一段文字（如代码）再问，回答流式显示，其中的引用点了就跳到那一节。回答来自读者自己填写的模型服务：OpenAI 兼容的 Chat Completions 接口的地址（如 `https://api.deepseek.com/v1`）、密钥与模型名，只保存在他的浏览器中（本站点的存储；同一站点的脚本能读到密钥，面板写明这一点）。问题连同当前一节的讲解与块的文字、选中的内容和章节目录（供引用）从浏览器直接发给该服务，不经过站点的服务端，费用由读者自己承担；学生版站点的内容本来就不含教师专用的部分，发出去的也不含。没有填写时面板说明这些并请读者填写；填写后面板在提问之前写明服务（地址的主机名）与模型。幻灯片形态没有 IR，问题带的是当前页的文字，引用只到这一页。

课堂中主讲的“互动”总览里每个提问有“AI 回答（服务提供方）”：用主讲自己在“提问”面板中填写的模型服务，在主讲的浏览器中生成，主讲确认后发给课堂（引用变成纯文字）；没有填写时总览提示先去填写。学生自己不接触模型。

### 工作台：浏览器中的编辑与 agent

`presmium studio` 是编写讲义的工作台：文件树、源码编辑器（保存前文件被别处改过时提示合并或重新载入）、问题面板与预览（在预览中点选一块，源码跳到它的行；移动光标，预览跟随），以及 DeepSeek Harness 的对话。agent 的修改落在文档目录的源码上：会话第一次写文件时打开这份文档的审阅并持有锁，之后的修改累加进同一次审阅，作者接受后成为一个 git 提交（可以撤销），拒绝的文件恢复原样。工作区配置的 `settings.presmium.assistant.review: auto` 让每轮对话结束时直接提交；没有页面跟随的审阅在 `reviewTimeoutMs`（默认 30 分钟）后回滚。别的 agent（Claude Code、Codex 等）经上文的 MCP 接入。

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
| `presmium.directive` `{csv-table}: required body not provided …; {csv-table} takes no :file:` | MyST 指令写错了（这里 `{csv-table}` 不读文件）：按 MyST 的写法改正，如把表格写进正文 |
| `presmium.links` `x: no such file` 或 `#x is no section, block, label or heading of the deck` | 改正路径（相对于写它的文件）或片段；`(in slides)` 表示只有幻灯片中的链接出错，例如它指向只在网页中出现的块 |
| `presmium.forbid` `"…" matches … of checks.forbid` | 删掉命中的文字（内部编号、未发布内容的名字），或改头部的 `checks.forbid` |
| `presmium.audience` `the block shows content only for teacher (written at <文件>:<行>); it is left out of the view for student` | 完整编译之后为学生构建（编译器的 `build` 的 `audience` 选项）时，这个块（多半是代码的录制输出）含有教师内容的句子，所以学生版没有这个块：同下一行处理 |
| `presmium.audience` `content only for teacher is in the build for student: "…" in <文件>` | 被去掉的教师内容又进了学生版（多半经代码块的输出或另一个文件）：在来源处删掉，或给那个块也加 `:audience: teacher`。文件在这次没有构建的渲染端目录中（例如完整构建留下的 `dist/notebook/`）时，删去那个目录或用 `--out` 换一个输出目录：扫描读输出目录中的每个文件 |
| `presmium.execLocal.workspace` `{local-env} names the workspace …` | 一份文稿只有一个工作区：各 `{local-env}` 写同一个 `:workspace:`，或设置 `presmium.execLocal.workspace` |
| `presmium.code.anchors` `moved` 或 `needs confirmation` | 确认位置后运行 `presmium check --update-lock` |
| `presmium.code.drift` `drifted since pinned commit` | 读差异，改代码或改 `:pin:` |
| `presmium.execute` `no executor for … and no recorded output` | 安装 `python3` 或 `node`，或提交 `.presmium/freeze/` 中的录制 |
| `presmium.execute` `recorded output was made with …` | 别的环境录制的输出被沿用；要重跑就加 `execute: { rerun: environment }` |
| `presmium.execute` `:env: x: no such environment` | 在头部 `execute.environments` 中声明它，或改正名字 |
| `presmium.execute` `no plugin in plugins provides environments of kind …` | 把提供该类环境的插件加进 `plugins`（`devcontainer`：`@presmium/slidev-addon-exec-local`；`webgpu`：`@presmium/slidev-addon-exec-webgpu`；`jupyter`：`@presmium/slidev-addon-exec-jupyter`；`wasi`：`@presmium/slidev-addon-exec-wasi`） |
| `presmium.execute` `the deck's url … is not the operator's address` | `jupyter` 环境的 `url` 与运营者的 `PRESMIUM_ENV_<名>_URL` 不同源：去掉 `url`，或写运营者的地址 |
| `presmium.execute` `PRESMIUM_ENV_<名>_URL is not set` | 运营者在运行 `presmium` 的环境中给出这个环境的地址与令牌（`templates/env/compose/README.md`） |
| `presmium.execute` `session "…" runs in … and here in …` | 同一会话的代码块写同一个 `:env:` |
| `presmium.secrets` `… looks like a credential` | 从头部删掉它，改用环境变量 |
| `presmium.speech` `presmium.speech.engines.x … is not used` | 文稿只写引擎的 ID（`presmium.speech: { engine: volcengine, transcribe: groq }`），删掉 `url`、`keyEnv` 等；引擎由运营者在环境变量中定义（`PRESMIUM_SPEECH_<ID>_URL`、`_PROVIDER`、可选的 `_KEY`；火山引擎只要 `PRESMIUM_SPEECH_VOLCENGINE_KEY`） |
| `presmium.lecture` `the lecture's 「…」 … is not in the synthesis cache, and no speech engine can synthesize it` | 讲授（`renderers.lecture.voice`）的这句话没有合成过：在定义了该引擎的环境中（`PRESMIUM_SPEECH_<ID>_URL`、`_PROVIDER`）构建一次并提交 `.presmium/speech/`，或改回缓存中有的文字 |
| `presmium.lecture` `{cue to=…}…: the deck has no block …` 或 `… has no block before it to act on` | 给要聚光、指向的块写标签 `(code-1)=` 并在 `to=` 中写它，或把提示标记写在那个块之后的讲解中 |
| `presmium.lecture` `unknown cue command` | `{cue}` 的内容只能是 `next`、`spot`、`hint`、`point`、`click <动作>`、`run`、`ink`、`pause <时长>`、`mark <名称>` |
| `presmium.references` `target "…" not found` | 给目标加标签，或改正引用 |
| `presmium.links` `… is not published: there is no such file`（构建报告） | 路径相对于写链接的文件；改正路径或补上文件 |
| `presmium.links` `… is not published: the file lies outside the deck's repository`（工作区站点中为 `outside the workspace`） | 把文件放进文稿所在的仓库（工作区） |
| `presmium.translations` `translation "en" (…) is out of date` | 核对译本与原文的差异，把消息中的新摘要写进译本头部 `translationOf.digest` |
| `presmium.translations` `translation "en" (…) is not in the workspace site of presmium serve` | `presmium serve` 的预览只显示原文：在工作区根目录 `presmium build` 发布译本（或 `presmium build <文档目录>` 单独构建这份文档） |
| `presmium.links` `… is not published: hidden directories and node_modules are not published` | 把要发布的文件放进一个普通目录再链接它 |
| `presmium.audience` `this content follows an {include} with :audience: whose file opens a section …` | 在 `{include}` 之后写一个标题另开一节，或把这段内容移到 `{include}` 之前 |
| `presmium.audience` `<n> findings are in the content left out for student, not shown here` | 被去掉的教师内容中有问题：运行不带 `--audience` 的 `presmium check` 查看并改正 |
| `presmium.classroom` `{quiz} needs at least two options` | 选项写成任务列表 `- [ ]`、`- [x]` |

## 13. 提交哪些文件

文稿的 `.presmium/` 中只有以下几项随文稿提交，仓库根目录的 `.gitignore` 已按此配置：

- `.presmium/freeze/`：执行缓存，让任何人构建都得到相同输出、无需运行环境。
- `.presmium/anchors.lock.json`：锚点锁定记录（`presmium check --update-lock` 生成）。
- `.presmium/drawings/`：幻灯片中的圈画标注。
- `.presmium/assets/`：本地化的远程图片（如 PlantUML 图），新增一个后要提交。
- `.presmium/speech/` 与 `.presmium/speech.lock.json`：合成缓存（`@presmium/slidev-addon-speech`）：合成的音频（引擎给的格式，通常是 Ogg/Opus）与 `<键>.json`（逐字时间、引擎、AI 生成的标识；讲授插件转写对齐得到的逐字时间在 `<键>.align.json`），以及文稿用到的键（讲授的构建只留下讲授用到的键）。提交后别人构建不再调用语音引擎、不需要凭据。

录制的讲授（`@presmium/slidev-addon-lecture`，见 presmium-present 技能）在文稿目录的 `lectures/<id>/` 中：提交 `track.json`（讲授轨：语音段与操作，每项一行，便于比较差异）；`audio/`、`video/` 默认被该目录的 `.gitignore` 忽略（运营者设置决定是否交给 git LFS）。讲义改了讲授引用的块时，`presmium check` 的 `presmium.lecture` 报告失效的操作；要长期回放的块写标签 `(名字)=`。

不提交：`dist/`（构建产物）、`.presmium/web`、`.presmium/slides`、`.presmium/dev` 等渲染端工作目录。文稿在别的 git 仓库中时，把本仓库根目录 `.gitignore` 中关于 `.presmium` 的几行复制过去。
