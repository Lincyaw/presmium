# 三分钟读完一篇论文（翰林院传达室）

这个目录是一个 Presmium 工作区：每篇论文一份文稿 `<slug>/lecture.json`，做成一段三分钟左右（一般不超过六分钟）的配音动画（讲授视频），同时是网页（画面固定、讲稿在旁边滚动）和幻灯片。在本目录 `pnpm serve` 预览整个网站，`pnpm build` 导出网站到 `dist/web/`。

工作区在仓库的 `examples/papers/`，每篇论文是它的一个子目录。CI 检查并构建所有论文；推送到 `main` 后，Pages 工作流以示例站的 `/papers/` 为基础路径构建，并将产物合入同一次部署。新增论文由 `presmium.workspace.yaml` 的 `*/lecture.json` 自动收录。

写文稿、做动画、配音与导出的通用规则在仓库的技能 `presmium-author`、`presmium-animate`（`.agents/skills/`）里；这里只写这个系列自己的标准和流水线。

## 标准

- **时长**：以三分钟左右为目标，一般不超过六分钟；这不是硬性规定，按内容调整。观众需要的解释（概念的定义、基线是什么、指标是什么意思、结论的前提）不为了缩短而删：删掉之后观众容易跟丢。讲稿按火山引擎甜美桃子实测约 4.5 字每秒估算，三分钟约 800 字（按读音计，`10²³` 读作“十的二十三次方”算 7 个字）；配音生成后用 `pnpm timing <slug>` 量每步与总长；明显过长时删重复与旁枝，不删定义，也不加快语速。
- **固定开场白**，配品牌卡（`kit/opening.ts`）：“三分钟读完一篇论文。大家好，这里是翰林院传达室，今天给大家带来{单位}的《{论文中文名}》。”
- **固定结尾**，配结尾卡（`kit/closing.ts`，页面上只有“一句话总结”、那一句的短语、对话气泡与标志）：“一句话总结：{论文做了什么}。想看哪篇论文，欢迎在评论区留言。翰林院传达室为您分享最新论文，我们下期见。”结尾之前的结论页讲条件与前提，不和这一句重复。
- **顺序**：问题 → 为什么重要 → 论文要解决什么、它的办法（一句话）→ 展开：方法（概念先用画面引入再命名）→ 主要证据 → 第二个结果（如有）→ 条件与局限 → 固定结尾（一句话总结与互动）。前四项在第一分钟内讲完。
- **论文原图**：架构图、关键结果图从 arXiv 源码的图 PDF 裁切（`presmium-animate` 技能的 `gallery/catalog/paper-figure/tools/figure.py`），一步只放一张、镜头一次只框一个区域，用我们的动画在图上标注、移动、对照。原图的配色就是全片的配色，裁切和动画共用一套图例。
- **数字**：画面上的每个数字都由论文公开的数据重算（`<slug>/scenes/data/derive.py`，打印与论文值的对照）；没有公开数据时取论文正文或表格的数字并在画面上标出处；示意的曲线标“示意”，估算标“估算”。
- **画面文字**：页面上只放关键词和关键词组（表格除外），不写成句的说明；数字、单位、图例照常。讲稿（也就是字幕）完整描述这一步画面上的图和字：先说画的是什么（坐标轴、颜色、每个点代表什么），再说它说明了什么，屏幕上出现的每个关键词讲稿里都有着落。
- **中文表述**：标题、关键词与讲稿都按中文习惯写。先找英文表述硬译成中文的地方（“进入 S 形函数”“噪声底”“留出的模型”这类直译、名词堆叠、被动句），再按中文语序重写；术语用这个领域的中文说法，没有中文说法的保留英文（logit、FLOPs）。
- **配音**：默认火山引擎的甜美桃子 2.0（`volcengine` / `zh_female_tianmeitaozi_uranus_bigtts`）。火山引擎的 API Key 由运营者保存在工作区的运营者目录（Presmium Studio 的“设置 → 语音服务”，或 `~/.local/state/presmium/operator/<工作区路径的哈希>/speech/credentials.json`），不进仓库；这个 Key 需要在火山引擎控制台开通“豆包语音合成模型 2.0”（资源 `seed-tts-2.0`）。所有论文统一用火山引擎配音。
- **来源页**：最后是只在网页上显示的“来源与说明”页（文献、数字来源、示意与估算、条件）。它的内容只属于网页，讲授视频跳过它，停在结尾卡上；幻灯片里只留一行“见网页版”。
- **字幕**：导出的视频烧入字幕，字号要在视频里看得清（默认 1080p 上约 60 像素），浅灰半透明底、近黑色字，贴近底边，尽量少挡画面；大小可在 Presmium Studio 的视频制作里按文稿调整。
- **品牌**：左上角固定角标 `brand()`（信使猫标志与“翰林院传达室”），标志在 `kit/brand/mark.svg`（翰林院传达室标志方案 B）。

## 目录

| 路径 | 内容 |
|---|---|
| `kit/` | 所有论文共用：画面与类型（`frame.ts`）、图表（`chart.ts`）、论文原图的镜头与标注（`figure.ts`）、品牌（`brand.ts`）、开场（`opening.ts`）与结尾（`closing.ts`） |
| `<slug>/lecture.json` | 文稿：唯一的内容来源（讲稿、步骤、场景引用、配音设置） |
| `<slug>/storyboard.md` | 分镜：简报、论点、配色、术语表、定义表、每一步的结束画面、数字来源、制作规则、评审记录 |
| `<slug>/scenes/` | 这篇论文的动画场景；`opening.ts`、`ending.ts` 各一行转发到 `kit/opening.ts`、`kit/closing.ts`；`<名>.ts`（数据与配色）供各场景共用 |
| `<slug>/scenes/data/` | `derive.py` 与它算出的 JSON |
| `<slug>/figures/` | 裁好的论文原图与它们的文字坐标（`*.json`） |
| `<slug>/.presmium/speech/` | 合成好的配音（随文稿提交，导出与网站直接用） |
| `tools/` | 取源码（`fetch.sh`）、生成文稿骨架（`new-paper.mjs`）与按工作区配置逐篇检查（`check.mjs`，`pnpm check`）；其余步骤用 Presmium 自带的命令 |
| `.cache/` | 下载的 arXiv 源码、论文代码仓库（不提交） |

## 流水线

1. **取源码**：`tools/fetch.sh <arxiv-id> <slug>` 下载 arXiv 源码（`https://arxiv.org/e-print/<id>`）到 `.cache/<id>/`，渲染全部图的预览，列出每张图的 LaTeX 说明。读 `Sections/*.tex` 比读 PDF 准确；论文有代码与数据仓库时克隆到 `.cache/` 并找到画面要用的结果表。
2. **简报与论点**：在 `storyboard.md` 写 A 到 F 节：观众、观看前后、论点（“看完后，观众明白 X，因为他们看到了 Y”）、ABT、配色、术语表、定义表。中心画面要让论点成为画面中随步骤变化、可直接看见的属性。
3. **数据**：写 `scenes/data/derive.py`，从论文公开的数据算出每个要上屏的数字，打印与论文值的对照；对不上就先查原因，不上屏。
4. **讲稿与分镜**：`storyboard.md` 的 G 节一行一步：结束画面、讲稿要点；每步 6 到 15 秒（25 到 60 字），一步一个意思；一个意思要讲得更长时拆成两步，各有自己的画面。用 `tools/new-paper.mjs` 生成文稿骨架（开场页与标准顺序的空页面），把讲稿写进 `lecture.json`。
5. **原图**：`uv run --no-project --with pymupdf python -I <figure.py> <图.pdf> <slug>/figures/<名>.png --crop x0,y0,x1,y1`，`figure.py` 在 `presmium-animate` 技能的 `gallery/catalog/paper-figure/tools/`（先加 `--words` 看每个词的位置再定裁切），输出的 JSON 给出每个刻度与图例词的位置，标注按它放。
6. **场景**：协调者先写共用的数据模块和前几个场景定下画风，再把其余页面分给 agent 并行（每个 agent 只改自己的场景文件，见 `storyboard.md` 的 I 节）。规则：只用补间与 `set`，不用回调；节拍用 `clock` 的 `T(k, f)`，讲授时每个状态的时长就是这一步配音的长度，节拍跟着句子走；不用 SVG 的 `id`；要读的东西放在 77% 高度以上（下面是两行字幕的位置；坐标图的底边放在 61 个 SVG 单位，横轴标题就在这条线以上）；虚线用 `wipe` 展开。
7. **看**：服务运行时，`pnpm exec presmium mcp call capture_slides '{"document":"<slug>","section":"p-<页>"}' --out <目录>` 取每一步的结束画面（加 `"appearance":"dark"` 看暗色，`"at"` 看动画中途），`capture_reading` 看网页（`"width":390` 看手机），`capture_overview` 一次看全部页面。
8. **文字检查**：逐页截图，对照“画面文字”与“中文表述”两条检查每一步：屏幕上是否只剩关键词，讲稿是否把画面讲全，有没有硬译的说法。讲稿可以导出成一份 Markdown 交给作者润色：`pnpm exec presmium script export <slug>`（写到 `<slug>/dist/script.md`），改完 `pnpm exec presmium script import <slug>` 导回。
9. **配音**：`pnpm voiceover <slug>` 先报告音色和缺少配音的句数、字数（不花钱），确认后加 `--yes` 生成；`--voice volcengine:zh_female_tianmeitaozi_uranus_bigtts` 先换文稿的默认音色。火山引擎按字数计费，改过讲稿只重新合成变了的句子。讲稿定稿后加 `--prune --yes` 删掉讲稿不再用到的配音缓存。
10. **对时**：`pnpm timing <slug>` 量每步的字数、配音秒数与总长（参考三到六分钟）；明显过长时删讲稿里重复与旁枝的话，再重新配音。
11. **导出与复看**：`pnpm film <slug> --burn zh-CN --contact-sheet` 导出烧入字幕的 MP4（`<slug>/dist/<轨道>.mp4`）和每步两帧的帧表（`*.contact-sheet.png`）；再请一个没参与制作的 agent 只看帧表和讲稿做冷读（`presmium-animate` 的 `references/team.md` 第 7 节），把发现与改动追加到 `storyboard.md` 的 J 节。
12. **发布**：`pnpm build` 导出网站；只提交源文件：文稿、场景、裁好的图、数据与 `derive.py`、配音缓存（`.presmium/speech/` 与 `speech.lock.json`，只留当前讲稿用到的条目）。成片不提交（每篇十几 MB），需要时用 `pnpm film <slug> --burn zh-CN` 导出到 `<slug>/dist/`（已提交的配音缓存够用，不需要语音引擎与服务）。

## 运行服务

```sh
pnpm exec presmium serve . --port 4410 --allow spend,operate,write   # 火山引擎用运营者目录里的 Key（pnpm exec presmium speech key status 查看）；没有 ffmpeg 时另设 PRESMIUM_FFMPEG
```


只预览不配音时 `pnpm serve` 即可；已提交的配音缓存不需要语音引擎也能播放与导出。

`presmium serve` 的作者动作（Studio 或 MCP 的修改）把每次保存记成一个 git 提交（“编辑文稿”，用仓库的 git 身份），提交在当前分支上。推送前把它们并进本次的提交（`git reset --soft <开始前的提交>` 后重新提交），不把这些历史提交原样推上去。
