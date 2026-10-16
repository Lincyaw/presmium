---
name: presmium-present
description: "Presmium 放映与授课指南：构建并服务网页形态与幻灯片形态，切换运行时视图（文档 document、滚动叙事 scrolly、放映 present）与演讲者窗口，放映快捷键（翻页、总览、黑屏 b、冻结 f），幻灯片导出 PDF（presmium-export），notebook，离线使用，网页与幻灯片互跳，启动课堂服务 presmium-classroom-server 并配置 presmium.session.server，课堂流程（创建课堂、加入链接与二维码、跟随与自主浏览、测验、练习、提问、理解度、结束、归档）。Use when presenting or teaching with a Presmium deck: serving the built web or slides output, presenter view, keyboard shortcuts, PDF export, notebook, offline, form switching, running a classroom session server."
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

全屏用底栏的“全屏”按钮。底栏另有上一步、下一步、总览、演讲者窗口、退出放映。

### 演讲者窗口

在放映视图按 `p` 或点“演讲者窗口”，弹出一个新窗口（地址 `?view=presenter&section=<ID>&step=<n>`）。它显示章节与步数、计时器（可重新计时）、当前画面、本节讲解（当前步骤的段落突出显示）、下一步预告，以及侧栏中的插件面板（“课堂与工具”，如课堂互动）。

两个窗口通过同一浏览器内的 BroadcastChannel 同步，任一窗口翻页另一个跟随；所以听众窗口与演讲者窗口要在同一浏览器、同一地址下打开。投影时把放映窗口拖到投影屏并全屏，演讲者窗口留在自己的屏幕上。

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
6. 提问 `{question-box}` 与理解度 `{pulse}`：学生提问、投票；主讲在卡片上看到问题（可“标为已回答”）与理解度分布。导航栏的“互动”按钮（幻灯片在演讲者视图的“课堂互动”面板）汇总全部提问、理解度、测验与练习，标出所在位置。
7. 学生的笔记（网页形态中章节与带标签的块旁的“笔记”按钮）只有自己看得到。
8. 下课：主讲点“结束课堂”，再点“归档课堂”。归档把课堂记录写到课堂服务 `--deck` 目录下的 `.presmium/classroom/<课堂号>.json`，并从服务中释放课堂；归档后不能再加入或写入。学生的个人笔记不进归档。归档文件被仓库的 `.gitignore` 忽略（`.presmium/` 中只有缓存、锁定文件、标注与资源随文稿提交），要保留就自行备份。

## 9. 常见问题

| 现象 | 处理 |
|---|---|
| 重新构建后页面 404 或白屏 | 重启静态服务器 |
| 幻灯片 `/3` 返回 404 | 幻灯片的服务器加 `--single`，或用 `routerMode: hash` |
| “在幻灯片中打开”跳到不存在的地址 | 按第 7 节配置同一地址或 `slidesUrl`、`webUrl` |
| 演讲者窗口不跟随 | 两个窗口须在同一浏览器、同一地址下打开；被拦截的弹窗要允许 |
| `b`、`f` 没有反应 | 文稿 `plugins` 中加 `@presmium/slidev-addon-stage` 后重新构建 |
| 没有课堂入口，或开发中显示“未连接” | 配置 `presmium.session.server`、启动课堂服务，重新构建 |
| 学生打不开加入链接 | 主讲用局域网地址打开讲义，课堂服务地址也用局域网地址（服务启动时打印） |
| 主讲的标签页关掉了 | 同一浏览器重新打开讲义，在课堂面板中以主讲身份回到课堂 |
| 断网后不能放映 | 联网时先把该形态完整打开一次 |
