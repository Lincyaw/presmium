# 三分钟读完一篇论文（翰林院传达室）

这个目录是一个 Presmium 工作区：每篇论文一份文稿 `<slug>/lecture.json`，做成一段三分钟的配音动画（讲授视频），同时是网页（画面固定、讲稿在旁边滚动）和幻灯片。在本目录 `pnpm serve` 预览整个网站，`pnpm build` 导出网站到 `dist/web/`。

写文稿、做动画、配音与导出的通用规则在仓库的技能 `presmium-author`、`presmium-animate`（`.agents/skills/`）里；这里只写这个系列自己的标准和流水线。

## 标准

- **三分钟**：讲稿连开场白约 700 字（按读音计，`10²³` 读作“十的二十三次方”算 7 个字）。Edge 的 `zh-CN-XiaoxiaoNeural` 实测约 4.0 字每秒（第一篇 703 字、174 秒语音，加上每步停顿成片 3:03）；配音生成后用 `tools/film.mjs timing` 量总长，超过 3:10 就删讲稿，不加快语速。
- **固定开场白**，配品牌卡（`kit/opening.ts`）：“三分钟读完一篇论文。大家好，这里是翰林院传达室，今天给大家带来{单位}的《{论文中文名}》。”
- **顺序**：问题 → 为什么重要 → 论文要解决什么、它的办法（一句话）→ 展开：方法（概念先用画面引入再命名）→ 主要证据 → 第二个结果（如有）→ 条件与局限 → 一句结论。前四项在第一分钟内讲完。
- **论文原图**：架构图、关键结果图从 arXiv 源码的图 PDF 裁切（`tools/figure.py`），一步只放一张、镜头一次只框一个区域，用我们的动画在图上标注、移动、对照。原图的配色就是全片的配色，裁切和动画共用一套图例。
- **数字**：画面上的每个数字都由论文公开的数据重算（`<slug>/scenes/data/derive.py`，打印与论文值的对照）；没有公开数据时取论文正文或表格的数字并在画面上标出处；示意的曲线标“示意”，估算标“估算”。
- **来源页**：最后是只在网页上显示的“来源与说明”页（文献、数字来源、示意与估算、条件）。讲授视频仍会播放它的一步，所以它的步骤在 `production.stepOverrides` 中不配音、停留 0 秒，视频停在结论上。
- **品牌**：左上角固定角标 `brand()`（信使猫标志与“翰林院传达室”），标志在 `kit/brand/mark.svg`（翰林院传达室标志方案 B）。

## 目录

| 路径 | 内容 |
|---|---|
| `kit/` | 所有论文共用：画面与类型（`frame.ts`）、图表（`chart.ts`）、论文原图的镜头与标注（`figure.ts`）、品牌（`brand.ts`）、开场（`opening.ts`） |
| `<slug>/lecture.json` | 文稿：唯一的内容来源（讲稿、步骤、场景引用、配音设置） |
| `<slug>/storyboard.md` | 分镜：简报、论点、配色、术语表、定义表、每一步的结束画面、数字来源、制作规则、评审记录 |
| `<slug>/scenes/` | 这篇论文的动画场景；`opening.ts` 一行转发到 `kit/opening.ts`；`<名>.ts`（数据与配色）供各场景共用 |
| `<slug>/scenes/data/` | `derive.py` 与它算出的 JSON |
| `<slug>/figures/` | 裁好的论文原图与它们的文字坐标（`*.json`） |
| `<slug>/.presmium/speech/` | 合成好的配音（随文稿提交，导出与网站直接用） |
| `tools/` | 流水线工具，见下 |
| `.cache/` | 下载的 arXiv 源码、论文代码仓库（不提交） |

## 流水线

1. **取源码**：`tools/fetch.sh <arxiv-id> <slug>` 下载 arXiv 源码（`https://arxiv.org/e-print/<id>`）到 `.cache/<id>/`，渲染全部图的预览，列出每张图的 LaTeX 说明。读 `Sections/*.tex` 比读 PDF 准确；论文有代码与数据仓库时克隆到 `.cache/` 并找到画面要用的结果表。
2. **简报与论点**：在 `storyboard.md` 写 A 到 F 节：观众、看前看后、论点（“看完后，观众明白 X，因为他们看到了 Y”）、ABT、配色、术语表、定义表。中心画面要让论点成为一个会变化的可见属性。
3. **数据**：写 `scenes/data/derive.py`，从论文公开的数据算出每个要上屏的数字，打印与论文值的对照；对不上就先查原因，不上屏。
4. **讲稿与分镜**：`storyboard.md` 的 G 节一行一步：结束画面、讲稿要点；每步 6 到 15 秒（25 到 60 字），一步一个意思。用 `tools/new-paper.mjs` 生成文稿骨架（开场页与标准顺序的空页面），把讲稿写进 `lecture.json`。
5. **原图**：`tools/figure.py <图.pdf> <slug>/figures/<名>.png --crop x0,y0,x1,y1`（先加 `--words` 看每个词的位置再定裁切），输出的 JSON 给出每个刻度与图例词的位置，标注按它放。
6. **场景**：协调者先写共用的数据模块和前几个场景定下画风，再把其余页面分给 agent 并行（每个 agent 只改自己的场景文件，见 `storyboard.md` 的 I 节）；流程工具另派一个 agent。规则：只用补间与 `set`，不用回调；节拍用 `clock` 的 `T(k, f)`；不用 SVG 的 `id`；要读的东西放在 78% 高度以上（下面是字幕）；虚线用 `wipe` 展开。
7. **看**：服务运行时，`node tools/mcp.mjs capture_slides '{"document":"<slug>","section":"p-<页>"}' --out <目录>` 取每一步的结束画面（加 `"appearance":"dark"` 看暗色），`capture_reading` 看网页（`"width":390` 看手机），`tools/sheet.py` 拼成一张看。
8. **配音**：`node tools/voiceover.mjs <slug> --wait` 通过作者动作 `start_voiceover` 生成缺少的配音（Edge 的声音免费）。
9. **对时**：`node tools/film.mjs timing <slug>` 量每步与总长（3:10 以内）；超长就删讲稿、重新配音；然后 `node tools/film.mjs retime <slug>` 把每个场景状态的时长换成真实配音的长度，动画节拍跟着句子走。
10. **导出与复看**：`node tools/film.mjs export <slug>` 导出 MP4，`node tools/film.mjs frames <视频> <目录>` 生成每步的帧表；再请一个没参与制作的 agent 只看帧表和讲稿做冷读（`presmium-animate` 的 `references/team.md` 第 7 节），把发现与改动追加到 `storyboard.md` 的 J 节。
11. **发布**：`pnpm build` 导出网站；只提交源文件：文稿、场景、裁好的图、数据与 `derive.py`、配音缓存（`.presmium/speech/` 与 `speech.lock.json`，只留当前讲稿用到的条目）。成片不提交（每篇十几 MB），需要时用 `node tools/film.mjs export <slug>` 导出到 `<slug>/dist/`（已提交的配音缓存够用，不需要语音引擎与服务）。

## 运行服务

```sh
pnpm speech                     # 终端一：Edge 语音引擎（127.0.0.1:47231，地址固定，它是配音缓存身份的一部分）
. tools/env.sh                  # 终端二：定义语音引擎；没有 ffmpeg 时另设 PRESMIUM_FFMPEG
pnpm exec presmium serve . --port 4410 --allow spend,operate,write
```

只预览不配音时 `pnpm serve` 即可；已提交的配音缓存不需要语音引擎也能播放与导出。

`presmium serve` 的作者动作（`retime`、Studio 或 MCP 的修改）把每次保存记成一个 git 提交（“编辑文稿”，作者 local author），提交在当前分支上。推送前把它们并进本次的提交（`git reset --soft <开始前的提交>` 后重新提交），不把这些历史提交原样推上去。

`tools/film.mjs retime` 之后不要再用脚本整体重写 `lecture.json`：重写会把状态时长恢复成估计值。改讲稿就直接改 `lecture.json` 的 `narrations`，再配音、再 `retime`。
