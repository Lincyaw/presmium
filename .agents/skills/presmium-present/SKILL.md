---
name: presmium-present
description: "Presmium 放映与授课指南：构建并服务网页形态与幻灯片形态，切换运行时视图（文档 document、滚动叙事 scrolly、放映 present）与演讲者窗口，放映快捷键（翻页、总览、黑屏 b、冻结 f），幻灯片导出 PDF（presmium-export），notebook，离线使用，网页与幻灯片互跳，启动课堂服务 presmium-classroom-server 并配置 presmium.session.server，课堂流程（创建课堂、加入链接与二维码、跟随与自主浏览、测验、练习、提问、理解度、先预测再揭示、结束、归档），讲授的录制与回放（放映视图中录音、摄像头、聚光 s、激光笔与荧光笔，lectures/<id>/track.json，?view=lecture&track=<id> 的回放、倍速、字幕、逐字稿、我来试试；由讲解合成的讲授 script、录制讲授的转写与修改、换音色重新合成、编辑模式中把转写交给 agent 整理为讲解或生成译文、presmium-lecture export 导出 WebM 视频）。Use when presenting or teaching with a Presmium deck: serving the built web or slides output, presenter view, keyboard shortcuts, PDF export, notebook, offline, form switching, running a classroom session server, recording a lecture and playing it back, a lecture synthesized from the narration, transcribing and correcting a recorded lecture, writing a transcript back as narration or translating it with the agent, exporting a lecture video."
---

# 用 Presmium 放映与授课

讲义的编写与构建命令见 presmium-author 技能。本技能从构建好的产物开始：`presmium build` 在文稿目录下生成 `dist/web/`（网页）、`dist/slides/`（幻灯片）、`dist/notebook/<入口名>.ipynb`（notebook）与 `dist/ir.json`。

## 1. 选哪种形态

| 形态 | 适合 | 说明 |
|---|---|---|
| 网页 | 日常放映、自学、课堂 | 主媒介，支持全部内容；同一页面可在文档、滚动叙事、放映三种视图之间切换，不需重新构建 |
| 幻灯片 | 导出 PDF、圈画标注、录制 | Slidev 生成；讲解成为演讲备注 |
| notebook | 学生在 Jupyter 中动手 | 讲解与上屏文本为 Markdown 单元格，代码为可运行的单元格并附构建时的输出 |

## 2. 服务构建产物

产物是静态网站，任何静态服务器都可以。仓库根目录装有 `sirv`，在仓库内运行：

```sh
pnpm exec sirv <文稿>/dist/web --port 8080             # 网页：不加 --single
pnpm exec sirv <文稿>/dist/slides --single --port 8081 # 幻灯片：--single 让 /3 这样的页地址回落到 index.html
```

- sirv 默认只监听本机；课堂上学生要访问时加 `--host 0.0.0.0`。
- **重新构建后要重启静态服务器。** sirv 在启动时读取一次文件列表，之后新生成的文件（带哈希的 `assets/`）它找不到，页面会报 404 或白屏。经常重建时可以用 `--dev` 启动 sirv，它每次请求都查找文件。
- 站点路径由 `renderers.web.base`、`renderers.slides.base` 决定。两者都不写、又同时构建了两种形态时，网页为 `/web/`、幻灯片为 `/slides/`：直接服务整个 `dist/`（`pnpm exec sirv <文稿>/dist`）即可，见第 7 节。只构建一种形态时为 `/`。
- 边写边放映可以直接用开发服务器：`presmium dev --to web`（端口取 `renderers.web.port`），保存源码后页面就地更新，位置不变。开发服务器（网页与幻灯片都是）还让本地环境 `{local-env}` 能在容器中运行代码。

## 3. 网页形态的视图

导航栏的“视图”菜单切换视图，或在地址后加 `?view=<视图>`：

| 视图 | 说明 |
|---|---|
| `document`（文档，默认） | 全部展开，讲解为正文 |
| `scrolly`（滚动叙事） | 上屏内容固定一侧，讲解滚动，步骤随滚动推进。文档视图中带 `{hints}` `web: { layout: scrolly }` 的章节也这样排版 |
| `present`（放映） | 全屏逐章节、逐步骤，听众画面只有标题与上屏内容 |

打开指定位置：`?section=<章节 ID>&step=<步>` 或 `?slide=<章节序号>&step=<步>`，可与 `?view=present` 同用；章节的固定链接是 `<页>.html#<章节 ID>`。在放映视图与演讲者窗口中，地址栏随翻页写着当前的 `?view=&section=&step=`，刷新页面（或投影浏览器崩溃后重开）回到同一视图、同一位置；回到文档或滚动叙事视图时这些参数被去掉。

### 放映视图的按键

| 按键 | 作用 |
|---|---|
| `→`、`↓`、`PageDown`、空格 | 下一步（到章节末尾后进入下一章节） |
| `←`、`↑`、`PageUp`、`Backspace` | 上一步 |
| `Home`、`End` | 第一节的开头、最后一节的末尾 |
| `o` | 总览：方向键选择，`Enter` 跳转，`Esc` 或 `o` 关闭 |
| `p` | 打开演讲者窗口 |
| `Esc` | 退出放映，回到原来的视图 |
| `b`、`f` | 黑屏、冻结听众画面，再按一次恢复（需要 `@presmium/slidev-addon-stage`） |
| `s`、`h` | 给指针下的块加上聚光、提示，同一块上再按一次取消；翻到别的步骤或章节时自动取消（需要 `@presmium/slidev-addon-guide`） |

全屏用底栏的“全屏”按钮。底栏另有上一步、下一步、总览、演讲者窗口、退出放映。

### 演讲者窗口

在放映视图按 `p` 或点“演讲者窗口”，弹出一个新窗口（地址 `?view=presenter&section=<ID>&step=<n>`）。它显示章节与步数、计时器（可重新计时）、当前画面、本节讲解（当前步骤的段落突出显示）、下一步预告，以及侧栏中的插件面板（“课堂与工具”，如课堂互动）。

两个窗口通过同一浏览器内的 BroadcastChannel 同步，任一窗口翻页另一个跟随；所以听众窗口与演讲者窗口要在同一浏览器、同一地址下打开。投影时把放映窗口拖到投影屏并全屏，演讲者窗口留在自己的屏幕上。

### 录制与回放讲授

文稿的 `plugins` 加上 `@presmium/slidev-addon-lecture`（指针与聚光的重放还要 `@presmium/slidev-addon-guide`），要发布回放时 `renderers` 加上 `lecture: {}`（或 `presmium build --to web,lecture`）。

- **录制**（只在 `presmium dev --to web` 与工作区服务中）：放映视图右上角的录制栏。点“录制”后浏览器先请求共享屏幕（勾选了“屏幕”时），再请求麦克风与摄像头权限；翻页、推进步骤、指向代码块、按 `s` 聚光、按 `h` 提示都记进讲授轨，点“停止”保存。录音每 5 秒上传一次。可勾选“摄像头”“屏幕”同时录像。工具“激光笔”“荧光笔”在块上拖动画出（代码块按行），“清除标记”擦掉荧光笔。要重录某一节：在“讲授”中选已有的讲授，翻到那一节，点“重录本节”，离开这一节即停止并替换原来的这一节（其他各节在录制之后的改动仍由 `presmium check` 报告）。离开放映视图会结束录制。
- **文件**：每次录制在文稿目录写 `lectures/<日期>/track.json`（提交它）与 `audio/*.ogg`、`video/*.webm`（默认被该目录的 `.gitignore` 忽略；运营者设置 `settings.presmium.lecture.audio: lfs` 时交给 git LFS）。
- **回放**：地址加 `?view=lecture&track=<ID>`，或在“视图”菜单中选“讲授”再挑一个。放映视图下方是播放栏：播放与暂停、进度、倍速、字幕（可选译文的语言）、逐字稿（点时间或某个字跳过去）、章节（每一节下列出讲授走到的各步，点击跳到那一步）、“我来试试”（暂停后自己翻页或运行代码，点“回到讲授”恢复到讲授的画面）。合成的讲授显示“AI 合成语音”。讲义改动后失效的操作被略过并提示，`presmium check` 的 `presmium.lecture` 列出它们。
- **静态站点**：`presmium build --to web,lecture` 把讲授发布在 `dist/lecture/`（含 `captions.<语言>.vtt`、`chapters.vtt`、`events.vtt`），网页从同一站点的 `../lecture/` 读取；分开部署时在头部写 `presmium: { presmium.lecture: { url: <地址> } }`。
- **合成的讲授**：头部写了 `renderers.lecture.voice`（并列出 `@presmium/slidev-addon-speech`）时，讲义的讲解就是讲授的脚本（写法见 presmium-author 技能）：`presmium build --to web,lecture` 把它合成为讲授 `script`（片段发布在 `dist/lecture/script/clips/`），`?view=lecture&track=script` 播放，提示标记 `{cue}` 在说到相应的字时聚光、推进；`presmium dev` 中打开它时由服务端按需合成。播放栏显示“AI 合成语音（<服务提供方>）”。合成要运营者定义的语音引擎（`PRESMIUM_SPEECH_<ID>_URL` 与 `_PROVIDER`），合成过的片段在合成缓存 `.presmium/speech/` 中，提交后别处构建不需要引擎。
- **转写与修改**（`presmium dev` 与工作区服务中，编辑者）：回放一份录制的讲授，打开“逐字稿”：“转写（<服务提供方>）”先确认把录音发给谁，转写后得到逐句的文字，录制时在说某句话期间做的操作绑定到当时说的字；每句后的 ✎ 修改这句的文字（没改的字保留时间；合成音色的讲授中保存时重新合成这一句，先确认发给哪个服务提供方）；选一个“音色”点“重新合成（<服务提供方>）”，整段讲授换成这个音色的合成语音，操作跟着字走，没有绑定到字的操作时刻不变。改动都写回 `lectures/<id>/track.json`。
- **转写回写**（工作区服务 `presmium serve` 中的编辑者；文稿 `plugins` 有 `@presmium/slidev-addon-assistant` 与讲授插件，运营者把它们列在 `settings.presmium.workspace.plugins` 中并配置了 agent）：工具栏的“编辑”进入编辑模式后点“讲授回写”，面板列出录制过的讲授（要先转写），写明模型的服务提供方。“整理为讲解”把转写交给 agent：按章节整理逐字稿（去掉口头禅与口误、补全标点），写成这一节的讲解替换原来的，录制时说到某个字时做的操作（聚光、指针、推进一步、标记……）写成那个字之前的 `{cue}`；“生成译文”（选一种语言）让 agent 把每句的译文写进 `lectures/<id>/track.json`（字幕可选这种语言，`presmium build --to lecture` 导出 `captions.<语言>.vtt`）。agent 改完后面板列出改动的文件与差异，“接受”形成一个提交，“全部拒绝”恢复原样；提交之后可以“撤销这次修改”。同一文档一次只能有一个修改任务（包括“AI 修改”面板中的）。
- **导出视频**：`presmium-lecture export [文稿目录] --track <ID> --out <文件>.webm`（`--size 1280x720`、`--fps 10` 为默认）构建网页与讲授，在 Chromium 中逐帧播放并与声音合成为 WebM 视频（只导出 WebM；要文稿安装 `playwright-chromium`，与 `slidev export` 相同）；合成的声音在文件的元数据中标明由 AI 生成。
### 由 agent 跳转（`presmium dev`）

`presmium dev` 中，连接了 MCP 的 agent（见 presmium-author 技能）可以查询放映位置（`get_position`）并请求跳转（`navigate`）、开始或结束课堂（`classroom_start`、`classroom_end`）。每次操作先在页面工具栏出现“待确认”入口，允许后放映与演讲者窗口跳到该位置，拒绝时 agent 得到错误。放映视图与演讲者视图盖住了工具栏，所以放映时另开一个文档视图的窗口回答确认。

## 4. 幻灯片形态

- 页地址：`/<页号>?clicks=<步>`；演讲者视图 `/presenter/<页号>`。`renderers.slides.routerMode: hash` 时为 `/#/<页号>`。
- 按键是 Slidev 的默认按键：空格、`→`、`←` 逐步，`↓`、`↑` 翻页，`o` 总览，`g` 跳转，`d` 深色模式。讲台插件加上 `b` 黑屏、`f` 冻结（`f` 因此不再是 Slidev 的全屏键）。
- 圈画：用 Slidev 的绘图工具。在 `presmium dev` 下画的标注保存到文稿的 `.presmium/drawings/`，随文稿提交；静态构建中的标注只留在浏览器里。

### 导出 PDF

`@presmium/slidev-addon-publish` 提供 `presmium-export`（在装有它的文稿目录运行，例如 `pnpm exec presmium-export`）：

```sh
presmium-export [文稿目录] [--format pdf|png] [--output <file>] [--with-clicks] [--range 1,3-5] [--dark] [--wait <ms>] [--timeout <ms>] [--json]
```

- 默认导出 PDF，写到 `<文稿>/slides-export.pdf`（`renderers.slides.exportFilename` 改文件名）；`--format png` 每页一张图片。`--with-clicks` 把每一步展开为一页，`--range` 只导出列出的页。
- PDF 导出后检查幻灯片上的每个链接（包括代码的永久链接）在 PDF 中仍是链接，有丢失时退出码为 1；PNG 中的链接无法检查，报告会说明。
- 导出中插件组件显示静态降级内容（例如执行面板显示先给参数赋值的代码与构建时的输出，没有时用 `:recorded:`）。
- `slidev export` 在打印页加载完、再等 `--wait` 毫秒（默认 1000）后截图。机器繁忙或文稿第一次导出（Vite 优化依赖后重新加载页面）时，页面可能还没显示全部幻灯片：导出缺少某张幻灯片时 `presmium-export` 报错退出（退出码 2），再导出一次或加大 `--wait` 即可。
- 也可以在 `<文稿>/.presmium/slides/` 中直接运行 `slidev export`（构建报告给出这个路径）。`slidev export` 总在根路径服务文稿，而构建写出的文稿按幻灯片的站点路径引用本地文件：幻灯片的 `base` 不是 `/` 时（包括同时构建两种形态的默认 `/slides/`），链接到的文件与媒体组件的文件在导出中找不到，这时用 `presmium-export`，它为导出另写一份以 `/` 为站点路径的文稿。

## 5. notebook

`dist/notebook/<入口名>.ipynb`（nbformat 4，内核默认 `python3`，由 `renderers.notebook.kernel` 改）。用 Jupyter 打开即可运行；图片等本地文件复制在旁边的 `media/`，整个目录可以一起移动。带超时而构建时没有正常结束的单元格标记了 `skip-execution`，nbclient 与 Jupyter Book 运行时跳过它。

## 6. 离线

- 网页形态生成 Service Worker（`presmium-sw.js`），预缓存全部页面、搜索索引与浏览器中运行 Python 用的 Pyodide。幻灯片形态需要 `@presmium/slidev-addon-publish` 才有离线缓存。
- 做法：联网时把要用的形态完整打开一次（等页面加载完），之后断网也能放映、搜索、运行 Python 代码。
- 远程图片在编译时下载到 `.presmium/assets/`（发布插件），随文稿提交。
- 文稿头部 `presmium: { presmium.publish: { offline: false } }` 关闭两种形态的离线缓存。
- 课堂需要网络（第 8 节）。

## 7. 网页与幻灯片互跳

- 网页中每个章节标题旁的小图标“在幻灯片中打开”跳到对应页（滚动叙事中带上当前步骤）；幻灯片导航栏的“在网页中阅读”回到对应章节与步骤。
- 两种形态同时构建、都没有写 `base` 时，网页在 `/web/`、幻灯片在 `/slides/`，互跳链接按这两个路径生成：用一个服务器服务整个 `dist/`（`pnpm exec sirv <文稿>/dist`）就能互跳。幻灯片的页地址（`/slides/3`）要服务器回落到 `/slides/index.html`：sirv 用 `--single slides/index.html`（端到端测试就这样服务示例讲义，网页中不存在的地址也会得到幻灯片的首页），或写 `renderers.slides.routerMode: hash`（页地址为 `/slides/#/3`），或换用能按目录回落的服务器。
- 自己写了 `base` 时，两边的链接按写的路径生成，同样放在同一个站点下即可。
- 分开部署时，在头部写明两边的地址：`presmium: { presmium.web: { slidesUrl: <幻灯片地址>, webUrl: <网页地址> } }`。

## 8. 课堂

课堂需要文稿的 `plugins` 中有 `@presmium/slidev-addon-session` 与 `@presmium/slidev-addon-classroom`（练习的校验另需 `@presmium/slidev-addon-exec`），以及一台课堂服务。

### 启动课堂服务

```sh
node <仓库>/packages/classroom-server/bin/server.mjs --port 1234 --deck <文稿目录>
# 或：pnpm --filter @presmium/classroom-server start --port 1234 --deck <文稿目录的绝对路径>
```

- 选项：`--port`（默认 1234，`0` 取空闲端口）、`--host`（默认所有网卡）、`--deck`（归档写到 `<文稿目录>/.presmium/classroom/`，默认当前目录；用 `pnpm --filter` 启动时当前目录是服务的包目录，所以写绝对路径）。启动后打印 `classroom server  ws://…`、本机的局域网地址与归档目录。
- 课堂只保存在服务进程的内存中，重启服务就丢失未归档的课堂。服务没有 TLS，也不做身份认证：任何拿到加入链接的人都能加入，所以在课堂自己的网络中运行。

### 配置文稿

```yaml
presmium:
  presmium.session:
    server: ws://192.168.1.10:1234   # 写 http:// 也可以，自动换成 ws://
```

地址在构建时写进产物，改了要重新构建（并重启静态服务器）。地址要能从学生的设备访问，用服务打印的局域网地址；配置的是 `localhost` 而页面不是从本机打开时，浏览器换成页面的主机名。主讲也要通过局域网地址打开讲义，加入链接用的是主讲打开讲义的地址；用 `localhost` 打开时课堂面板会提示学生的设备打不开这个地址。没有配置时讲义照常放映，发布的网页不显示课堂入口（开发服务器中显示设置提示，`presmium check` 也给出同样的提示），测验变成自测，笔记只存在浏览器中。

### 一堂课的流程

1. 主讲打开讲义：网页形态在导航栏的“课堂”按钮打开课堂面板；幻灯片形态在演讲者视图 `/presenter/<页号>` 的“课堂”面板。填昵称，点“创建课堂”。创建者就是主讲，只有主讲能结束与归档课堂。身份按讲义的地址与课堂保存在浏览器中：刷新、关闭标签页甚至重启浏览器后，同一浏览器的课堂面板提供“以主讲身份回到课堂”，不会变成学员，也不必另建课堂。
2. 面板显示加入链接（讲义地址加 `?room=<课堂号>`）与二维码，投到屏幕上让学生扫码；链接后加 `&name=<昵称>` 可以直接加入。学生打开后填昵称，点“加入课堂”。
3. 学生默认“正在跟随主讲”：主讲翻到哪一节哪一步、切到哪个视图，学生就跟到哪里；主讲按 `b` 黑屏、`f` 冻结时学生的画面也一样（两种形态都是）。点“自主浏览”可以自己翻看（刷新后仍是自主浏览），状态栏显示主讲的位置，点“回到主讲进度”回来。学生关掉标签页后用同一浏览器重新加入，还是原来的参与者，作答不会重复计数。
4. 测验 `{quiz}`：主讲点“开放作答”，学生选择后“提交”（关闭前可以改）；主讲看到已作答与答对人数、各选项人数；点“关闭作答”后才公布正确答案。
5. 练习 `{exercise}`：学生改代码后“提交”，在浏览器中用 Pyodide 运行校验；主讲在卡片上看到提交与通过人数和常见错误。课堂结束后学生仍能运行校验，结果只在自己的浏览器中显示，不再提交给主讲。
6. 提问 `{question-box}` 与理解度 `{pulse}`：学生提问、投票；主讲在卡片上看到问题（可“标为已回答”）与理解度分布。导航栏的“互动”按钮（幻灯片在演讲者视图的“课堂互动”面板）汇总全部提问、理解度、测验、预测与练习，标出所在位置。主讲用 `presmium dev` 打开讲义、文稿的 `plugins` 有 `@presmium/slidev-addon-assistant` 且运营者配置了模型（见 presmium-author 技能的“页面中的 AI 助手”）时，“互动”中每个提问另有“AI 回答（服务提供方）”：AI 的回答先只在主讲的窗口中，主讲点“发给课堂”后学生在自己的提问下看到它，不确认就“放弃”。学生自己不接触 agent。
7. 先预测再揭示 `{predict}`：学生在网页的文档视图中选一个选项或写一句话，点“保存预测”后才看到之后一步的内容（预测保存在学生的浏览器中，刷新后仍在）；课堂中预测另交给主讲，“互动”面板按选项显示人数（文字预测列出内容，不带姓名）。放映与演讲者视图、幻灯片照常按步骤显示揭示内容，所以投在屏幕上的画面由主讲翻页揭晓。
8. 学生的笔记（网页形态中章节与带标签的块旁的“笔记”按钮）只有自己看得到。
9. 下课：主讲点“结束课堂”，再点“归档课堂”。归档把课堂记录写到课堂服务 `--deck` 目录下的 `.presmium/classroom/<课堂号>.json`，并从服务中释放课堂；归档后不能再加入或写入。学生的个人笔记不进归档。归档文件被仓库的 `.gitignore` 忽略（`.presmium/` 中只有缓存、锁定文件、标注与资源随文稿提交），要保留就自行备份。

## 9. 常见问题

| 现象 | 处理 |
|---|---|
| 重新构建后页面 404 或白屏 | 重启静态服务器 |
| 幻灯片 `/3` 返回 404 | 幻灯片的服务器加 `--single`，或用 `routerMode: hash` |
| “在幻灯片中打开”跳到不存在的地址 | 按第 7 节配置同一地址或 `slidesUrl`、`webUrl` |
| 演讲者窗口不跟随 | 两个窗口须在同一浏览器、同一地址下打开；被拦截的弹窗要允许 |
| `b`、`f` 没有反应 | 文稿 `plugins` 中加 `@presmium/slidev-addon-stage` 后重新构建 |
| 放映视图没有录制栏 | 录制只在 `presmium dev` 与工作区服务中；文稿 `plugins` 要有 `@presmium/slidev-addon-lecture` |
| `presmium.lecture` `… which the deck no longer has (lost)` | 讲义删掉或改名了讲授引用的块或章节：给要长期回放的块加标签，或重录那一节 |
| `presmium.lecture` `the en translation of … is stale` | 原文改过，重新翻译那一句 |
| 讲授列表中没有 `script`，或播放它时“找不到讲授” | 头部 `renderers.lecture.voice` 写明音色，`plugins` 列出 `@presmium/slidev-addon-speech`；构建时定义了引擎，或合成缓存中有全部片段（`presmium check` 的 `presmium.lecture` 逐句指出缺少的） |
| 逐字稿中没有“转写”按钮 | 只在 `presmium dev` 与工作区服务中、编辑者可见；运营者要定义能转写的语音引擎，文稿 `plugins` 要有 `@presmium/slidev-addon-speech` |
| 播放 `script` 时提示“还没有生成” | 读者在编辑者打开它之前播放由讲解合成的讲授：合成要计费，只有编辑者的请求让服务端合成；请编辑者打开一次，或构建时合成并提交合成缓存 |
| 编辑模式中没有“讲授回写”，或面板说不能交给 agent | 只在工作区服务中、编辑者可见；文稿 `plugins` 要有 `@presmium/slidev-addon-assistant` 与 `@presmium/slidev-addon-lecture`，运营者把它们列在 `settings.presmium.workspace.plugins` 中并配置了模型（或替换的运行时） |
| 没有课堂入口，或开发中显示“未连接” | 配置 `presmium.session.server`、启动课堂服务，重新构建 |
| 学生打不开加入链接 | 主讲用局域网地址打开讲义，课堂服务地址也用局域网地址（服务启动时打印） |
| 主讲的标签页关掉了 | 同一浏览器重新打开讲义，在课堂面板中以主讲身份回到课堂 |
| 断网后不能放映 | 联网时先把该形态完整打开一次 |
