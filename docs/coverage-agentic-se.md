# agentic-se 课程站点与 Presmium 的覆盖分析

- 对象：<https://github.com/boxi-cs/agentic-se>，浅克隆提交 `59765ba`（`course/` 由私有课程仓库 `d17ada6` 生成）。只读文件，未运行其任何脚本；页面用本机静态服务器加无头 Chromium 查看。
- 对照：Presmium 需求 v0.7（`docs/requirements.md`）、`docs/ir.md`、`docs/design-v0.7.md`、presmium-author 技能、`examples/demo`。
- 移植验证：`scratchpad/ase-port/`（文稿）、`scratchpad/ase-tools/`（我写的生成脚本）、`scratchpad/ase-shots/`（截图）。

## 1. 站点是怎样构成的

站点由两层组成，作者从不直接写 HTML：

| 层 | 内容 | 来源与生成方式 |
|---|---|---|
| 外层站点（根目录） | 首页 `index.html`、`approach/`、`syllabus/`、13 个周页 `weeks/NN/`、`404.html`、`films/<slug>/` | `build.py`（只用标准库）把三个数据文件套进 Python 字符串模板：`data/course.json`（简介、原则卡片、`site/schedule.en.yaml` 解析出的周历、英文大纲 Markdown）、`data/episodes.json`（影片标题、决策句、时长、中英 SRT 字幕）、手工维护的 `data/films.json`（影片属于哪周、是否发布、撤下原因）。自带一个 Markdown 子集渲染器 |
| 学生资料 `course/`（约 150 页） | 每周的讲义、幻灯片文字版、活动、阅读、自测与答案、周导读，作业 A1–A6 与起始文件、检查点模拟卷、模板、评分细则、政策、术语表、事实单、capstone 技能包 | 私有课程仓库的 `*.en.md` 经 MkDocs 1.6.1 + Material 9.7.7 构建（`tools/course_site.py` 调用课程仓库的 `tools/english_site.py`，按学生分发白名单发布并扫描教师内容），整目录复制进来 |

其他事实：

- 幻灯片在私有仓库中用 `make slides` 生成每周的 HTML 演示与 PDF，不公开；公开的只是“Slides (text)”（`course/lectures/week-01/slides.en.html`）。讲者备注中的 `<!-- live -->` 标出现场演示点（`course/lectures/deck-guide.en.html`）。
- 影片：12 部（共 1 小时 44 分），私有视频仓库按 `script.md`、`Episode.json` 时间线制作；英文旁白是合成语音（`en_US-ljspeech-high`），中英字幕；封面取第一幕末帧（`tools/posters.py`）；视频放在 GitHub Release 资产里，仓库只存封面与 VTT（`weeks/01/index.html` 的 `<video>` 带两条 `<track>`）。
- 构建检查（`build.py`）：本地链接与 `#片段` 必须存在（含 `course/`）；内部编号正则（`PR #`、`T-123`、`instructor/` 等）不得出现；未发布影片的名字不得出现；`course/SOURCE` 与 `data/course.json` 必须来自同一提交；英文大纲的 `source_digest` 必须与中文 `SYLLABUS.md` 一致（`tools/export_data.py`）。
- 部署：GitHub Pages（`/agentic-se/`，`.nojekyll`，根 `404.html` 用绝对路径）。
- 语言：页面全是英文（`<html lang="en">`）；中文只出现在影片字幕和私有的中文大纲源文件里。
- 外层站点没有任何脚本；`course/` 只有 Material 自带的导航、搜索（lunr）、深色模式。没有测验、代码运行器、终端或时间轴组件，所有“交互”都在学生本机终端中完成（复制 fixture、运行 `verify_loop.py`、自己的 agent 加录制代理）。

## 2. 内容与功能清单（按类别）

| 类别 | 实例（路径） |
|---|---|
| 首页 | 标题区、四张原则卡片、考核表、周历表、12 张影片卡片、资料链接、教师卡片（`index.html`） |
| 长文页 | 教学方法、大纲（带目录）（`approach/index.html`、`syllabus/index.html`、`course/SYLLABUS.en.html`） |
| 周页 | 两次课的说明、到期项、材料链接（只列存在的页）、影片、前后周（`weeks/01/index.html`；第 13 周没有材料与影片） |
| 讲义 / 幻灯片 | `course/lectures/week-NN/notes.en.html`、`slides.en.html`（含内联 SVG 图，`week-01/07/08/10`）、`week-11/12/diagrams/*.en.svg` |
| 活动与阅读 | studio 步骤（heredoc 建文件、双终端）`week-01/activities.en.html`；一手资料 `readings.en.html` |
| 自测 | 题目与答案指导分两页（`selfcheck.en.html`、`selfcheck-answers.en.html`），以“accept / narrow / recheck / stop”决策句收尾 |
| 作业与考核 | `practice/a1..a6/README.en.html` 与 `starter/`（`tool_server.py`、`report.json`、`check.py` 自动校验）；检查点模拟卷与评分要点（`practice/checkpoints/cp1-practice-*.en.html`）；评分细则、模板（`templates/work-record.en.html` 等 11 个） |
| fixture 与文件目录 | `lectures/week-02/fixture/*.py`、`week-04/fixture/session/`、`week-10/fixture/*.json`、“Public files”目录页（`week-04/fixture/session/index.html`） |
| 影片 | `films/<slug>/{poster.jpg,en.vtt,zh.vtt}`，视频在 Release；每片附一句决策摘要 |
| agent 专属 | 会话记录 `week-02/session/sample-session.jsonl`（头部含 provenance、redactions，之后每行一次 chat-completions 请求与响应）及查看器 `show_session.py`（逐请求、`--check` 发布检查）；钩子回放 `week-04/fixture/session/steps.json`；评测记录与裁判回放 `week-10/fixture/runs.json`、`judge_replay*.json`、`audit.py`（“9/12 = 75%”的审计）；技能触发测试 `capstone/kit/skills/*/trigger-test.yaml`；生产提示词剖析 `week-02/prompt-dissection.en.html`、`factsheets/tools/*`；基准事实单 `factsheets/benchmarks/swe-bench-family.en.html`；A1 的请求录制代理（学生本机运行，未公开源码） |
| 教学法 | 先预测再看（`slides`：“Predict before reading the check”）；观察与推断分开标注；AI 使用分红绿两级（`site/docs/policies/ai-use.en.html`） |
| 站点外壳 | 顶部导航（Approach、Syllabus、Schedule、Videos、Course materials、Instructor）、页脚（联系与合成语音声明）、跳到正文链接、OG 元数据、浅深色 |

## 3. 覆盖表

结论：**满足**（列出指令或需求编号）、**计划**（v0.7 已有需求）、**部分**（缺什么）、**缺口**、**范围外**。“已验证”指在移植文稿中构建并在浏览器中确认。

| # | 案例 | 结论 | 依据或缺口 |
|---|---|---|---|
| 1 | 长文页（大纲、方法、政策、术语表）带目录 | 满足 | P-70、P-72；`{glossary}` 进入 IR（已验证） |
| 2 | 讲义与幻灯片两份源码 | 满足且更好 | 同一源码：讲解为正文与备注，`{only} web` 放长推导（K-17、P-70、P-76、P-77）；PDF 由 P-50 |
| 3 | 表格、代码高亮、SVG 图片、流程图 | 满足 | P-01；` ```mermaid `（P-41，已验证 agent 环路图） |
| 4 | 先预测再揭示 | 部分 | `:reveal:`、`{slide} :reveal:` 可逐步揭示（已验证 18/24 页 step 0→1 显示响应）；学习者无法先保存自己的预测：`{pulse}` 离开课堂只显示“加入课堂”（已验证），`{quiz}` 只有选择题 |
| 5 | 自测与答案 | 满足 | `{dropdown}`（已验证折叠）、`{quiz}` 自测模式（已验证） |
| 6 | 可运行的小练习（`status_label` 修复） | 满足且更好 | `{code} :run:` 构建时录制输出 `'unknown'`；`{exercise}` 在 Pyodide 中先 2/4 失败、修好后 4/4 通过（已验证） |
| 7 | 引用 fixture 代码 | 满足 | `{code-ref} symbol:fixture/loop.py#run` 显示 61–76 行（已验证）；漂移检查 P-14 可替代课程手写的 `notes:93-97` 行号引用 |
| 8 | 多文件 fixture、终端里的 studio 任务 | 部分 / 计划 | 远端 Jupyter 内核 P-105、具名环境 P-100；浏览器终端没有需求 |
| 9 | 学生自己的 agent 加录制代理（A1） | 范围外 | 学生本机工具，不是讲义功能 |
| 10 | 起始文件、fixture、模板的下载与“Public files”目录页 | 缺口 | 网页形态只发布图片与媒体；`[the loop starter](fixture/loop.py)` 与 `.jsonl` 链接 404（已验证），幻灯片与 notebook 却会复制这两个文件；目录页没有对应物；`presmium check` 不报告 |
| 11 | 周页（本周、到期、材料、影片、前后周） | 部分 | 一份文稿内：侧栏与文末前后章节自动生成（已验证）；13 周的课程需要多文稿站点 P-122（计划） |
| 12 | 课程首页（标题区、卡片、教师卡片） | 缺口 | `{grid}`、`{card}`、`{tab-set}` 报 unknown directive（已验证）；P-122 设计的首页只是文档列表 |
| 13 | 顶部导航、页脚、OG 元数据、sitemap | 缺口 | 网页渲染端只写 VitePress 的侧栏、搜索与界面文字，不开放 `nav`、`footer`、`head` |
| 14 | 全站搜索 | 部分 | 单份文稿 P-71；跨文稿全文搜索不在 P-122 的验收中 |
| 15 | 深色模式、跳到正文、手机适配 | 满足 | VitePress 默认主题（N-05、N-06） |
| 16 | 部署到 GitHub Pages 子路径与 404 | 满足 | `renderers.web.base: /agentic-se/` 与 `dist/web/404.html`（已验证）；N-09 |
| 17 | 影片嵌入（远端 mp4） | 满足 | `{video} https://…`（已验证，P-42） |
| 18 | 影片封面与中英字幕轨 | 缺口 | `{video}` 没有 `:poster:`、字幕轨选项；改写成原始 HTML 后封面与 VTT 不随产物发布（404，已验证），幻灯片中该 HTML 块变成讲者备注 |
| 19 | 合成旁白的讲解影片 | 计划 / 部分 | P-133 合成语音、P-134 脚本化讲授、P-135 导出视频、P-130 导出 VTT；“AI 合成语音”标识见设计 7.6。课程影片是逐幕设计的动画，Presmium 的讲授驱动的是讲义页面本身 |
| 20 | 英文旁白配中文字幕 | 缺口 | P-130 导出的字幕只有讲授轨自身的语言 |
| 21 | 中文大纲与英文译本（摘要校验） | 缺口 | 一份文稿只有一个 `lang`（N-07 只管界面语言），没有译本关联与过期检查 |
| 22 | 教师内容不进学生版（白名单、`<!-- live -->`、教师指南） | 缺口 | `{only}` 只按渲染端区分；讲解在网页中就是正文，会公开 |
| 23 | 由数据生成页面（周历 YAML、films.json、材料链接） | 部分 | 构建时执行（K-19）只能产出文本输出；把数据变成表格、卡片或新页面需要外部生成脚本（移植中用了 `schedule2myst.py`）；P-102 富输出计划中，但没有“把 Markdown 输出当正文”的写法；`{csv-table}` 不支持 `:file:` |
| 24 | 构建检查：链接与 `#片段`、禁止的内部编号、未发布内容 | 部分 | K-16 只检查 `{ref}` 目标（`presmium.references`）；`[x](#nowhere)`、`[x](nofile.py)` 不报告（已验证）；没有声明式的禁止模式 |
| 25 | 来源可追溯（SOURCE 提交、`--ref` 预览） | 部分 | K-13 锁文件、`{code-ref} :pin:` 锁定提交；跨仓库数据需子模块（P-12） |
| 26 | agent 会话记录逐请求阅读 | 缺口 | 没有轨迹指令；移植用外部脚本 `trace2myst.py` 把 JSONL 写成每请求一节（已验证可放映，见第 4 节的困难） |
| 27 | 钩子回放（`steps.json`） | 缺口 | 同上 |
| 28 | 评测记录、裁判回放、触发测试的统计 | 部分 / 计划 | `{code} :run:` 可在构建时重算“9/12”并录制文本；表格形式的输出要等 P-102 |
| 29 | 生产提示词逐段剖析 | 部分 | 外部仓库的文件可用子模块加 `:pin:` 锁定（P-12、P-13）；但锚点只有 `region`、`symbol`、`pattern`，不能在改不了的散文文件里按原文定位段落 |
| 30 | 讲者现场演示 agent CLI | 部分 | 浏览器内运行与预录回退有 P-20、P-24；终端会话的录像回放没有需求 |
| 31 | 合成语音、录音的合规声明 | 计划 | 设计 7.6、N-08 |

## 4. 移植验证

文稿 `scratchpad/ase-port/lecture.md`（`lang: en`，三个渲染端），引入 `pages/slides.md`（第 1 周幻灯片的主要页）、`pages/session.md`（由 `ase-tools/trace2myst.py` 从 `sample-session.jsonl` 生成，10 个请求各一节，请求内容上屏，响应 `:reveal:` 到下一步）、`pages/selfcheck.md`、`pages/schedule.md`（由 `ase-tools/schedule2myst.py` 从 `course.json` 生成）。`presmium check` 0 错误；`presmium build` 生成 web（base `/agentic-se/`）、slides、notebook。截图：`ase-shots/port-index.png`、`port-slides.png`、`port-session.png`、`port-present-request-reveal.png`、`port-selfcheck.png`；原站对照：`home.png`、`week01.png`、`course-slides.png`。

难点：

1. **数据要先变成源码**。周历和会话记录都要我另写生成脚本，`{include}` 生成的文件；Presmium 本身不读数据文件。
2. **轨迹文本破坏幻灯片构建**。记录中的 `<reminder>…` 在表格单元格里被当作 HTML，Slidev 的 Vue 编译报 “Element is missing end tag”，整个幻灯片构建失败，报错位置是生成的 `.presmium/slides/slides.md__slidev_19.md:125`，不是源码位置；网页与 notebook 照常生成。我在生成脚本里转义后才通过。agent 轨迹里这类伪 XML 标签很常见，专用指令应按字面保存文本。
3. **轨迹冗长**。每个请求都重复全部历史，文档视图中会话页高 17326 px；放映时 18 行的表被缩到很小的字号。查看器应只显示相对上一请求新增的消息，并按 call id 配对调用与结果。
4. **封面、字幕与文件下载**：见覆盖表第 10、18 行。
5. **首页与导航**：卡片、标题区、顶部导航都写不出来；一份文稿就是一个站点，13 周要等 P-122。
6. **决策句**：想用 `{pulse}` 让学习者选 accept/narrow/recheck/stop，离开课堂不可用。

顺带发现的 Presmium 缺陷：

- `packages/addon-classroom/src/node/extensions.ts:32,34` 把 notebook 中练习的标题和校验说明写死为中文（“**练习**”“# 校验：先运行上面的单元格…”）。`lang: en` 的文稿也输出中文，违反“编译时写入产物的文本按文稿的 lang”。
- `{csv-table}` 带 `:file:` 时 IR 中是 `mystDirectiveError` 节点，`presmium check` 却报 0 错误：MyST 指令错误没有成为诊断。
- 网页形态不发布正文链接的本地非图片文件，幻灯片和 notebook 会发布（`dist/notebook/media/12b93adb-loop.py`），三种媒介行为不一致，也没有诊断。
- 原始 HTML 中引用的本地文件在任何媒介中都不发布，也没有诊断。

## 5. 缺口与最小需求

| 建议编号 | 最小需求 | 上下文 | 现成组件（集成，不 fork） |
|---|---|---|---|
| P-45 智能体轨迹 | `{agent-trace} <文件>`：读 JSONL（OpenAI Chat Completions、Anthropic Messages 两种形态），每个请求一步（`span` 为请求数减一），只显示新增消息，调用与结果按 call id 配对，文本按字面显示；`fallback` 为每请求摘要表；`presmium check` 报告疑似密钥与缺少的 provenance 字段 | 富内容 | 格式对齐 OpenTelemetry GenAI 语义约定；组件自研（Inspect AI 查看器是整套 React 应用、Langfuse 与 Phoenix 是服务，都不适合嵌入）；密钥扫描可调用 gitleaks（MIT） |
| P-44 终端录像 | `{terminal-cast} <文件>`：播放 asciicast，标记点映射为步骤；降级为最后一屏的文字 | 富内容 | asciinema-player（Apache-2.0）；讲授轨格式本就借鉴 asciicast |
| P-42 增补 | `{video}` 增加 `:poster:` 与 `:captions:`（语言到 VTT 文件），文件随各媒介发布，缺失时报错 | 富内容 | 浏览器原生 `<track>` |
| P-46 卡片、栅格、选项卡 | 接受 MyST 标准的 `{grid}`、`{card}`、`{tab-set}`、`{button}`，查看器渲染，notebook 降级为标题加段落 | 富内容 / 渲染 | mystmd 的 `myst-ext-card`、`myst-ext-grid`、`myst-ext-tabs`、`myst-ext-button`（MIT） |
| P-78 站点外壳 | `renderers.web` 增加 `nav`、`footer`、`head`（描述、OG）、`sitemap` | 网页形态 | VitePress `themeConfig.nav`、`footer`、`head`、`sitemap` |
| P-79 文件发布 | 网页形态复制正文链接的本地文件（与幻灯片、notebook 一致）；链接到目录时生成文件清单页；原始 HTML 中的 `src`、`poster` 同样处理 | 网页形态 / 发布 | 复用 `publish.ts` 现有的图片复制 |
| P-54 发布检查 | `presmium check` 报告各媒介中无法解析的本地链接与 `#片段`、MyST 指令错误、文稿头部 `checks.forbid` 中正则的命中 | 发布（K-16） | 外部链接可选用 lychee（MIT/Apache-2.0） |
| P-55 受众范围 | 块与章节可标 `:audience: teacher`（或 `{only}` 接受受众）；`presmium build --audience student` 删除这些块；检查学生版产物不含教师内容 | 编译 / 发布 | 无需新组件，复用 `{only}` 的编译步骤 |
| P-68 预测 | `{predict}`：学习者先写预测（文字或选项），之后的 `:reveal:` 内容才对他显示；预测存本机，课堂中主讲看到分布 | 课堂 | 复用 `useSharedState('local')` 与 P-64 的统计 |
| P-102 增补 | 构建时执行的 `text/markdown` 输出按正文渲染，`:echo: false` 隐藏代码（相当于 Quarto 的 `output: asis`）；限于章节内，生成整页仍用外部脚本 | 代码执行 | Jupyter MIME 约定与 myst-parser |
| P-107 浏览器终端 | 连接 P-105 远端环境的终端，用于多文件 fixture 与命令行任务；凭据规则同 N-08 | 执行环境 | jupyter_server 终端接口、`@jupyterlab/services`（BSD-3）、xterm.js（MIT） |
| P-17 文本锚点 | 锚点 `quote:<文件>#<原文>`，按原文定位散文（提示词、政策），状态沿用 K-10 的四级 | 代码引用 | W3C Web Annotation 的 TextQuoteSelector；`approx-string-match`（MIT，Hypothesis 所用） |
| P-122 增补 | 工作区首页可以指定为一份文稿；跨文稿全文搜索；文稿之间的前后导航 | 工作区 | VitePress 本地搜索（已在用） |
| P-123 译本 | 文稿声明译本（`translations: { en: lecture.en.md }`），网页切换语言；译本头部记录原文摘要，原文改动后 `presmium check` 报告过期 | 编译 / 网页形态 | VitePress `locales` |
| P-137 多语言字幕 | 讲授轨的语音段可带译文，导出 `captions.<语言>.vtt`；原文改动后译文标记过期；译文可由 agent 任务生成（P-111） | 讲授 | WebVTT |

缺陷修复（不需要新需求）：classroom 的 notebook 扩展按 `lang` 取文本；`mystDirectiveError` 成为错误级诊断；幻灯片构建失败时把位置映射回源码块。

## 6. 结论

- 这门课的公开站点在技术上很朴素：静态 HTML 加 MkDocs。所有交互都发生在学生本机。Presmium 在讲义与幻灯片同源、构建时录制输出、浏览器内练习与自测、代码锚点与漂移检查上明显超出它。
- 真正的缺口集中在三处。第一是**站点层**：多文稿课程站点（P-122 计划）、首页与导航（P-46、P-78）、文件下载（P-79）。第二是**发布治理**：受众范围（P-55）、链接与禁用模式检查（P-54）、译本（P-123）。第三是 **agent 课程特有的素材**：会话轨迹（P-45）、终端录像（P-44）、散文锚点（P-17）、浏览器终端（P-107）。
- 影片流水线（合成旁白、字幕、导出视频）与 6.14 节的规划吻合。差的是字幕翻译（P-137）和 `{video}` 的封面与字幕轨（P-42 增补）。
