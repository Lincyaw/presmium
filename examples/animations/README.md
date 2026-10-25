# Presmium 示例：用代码讲课

本仓库的公开示例：两讲为 Presmium 写的中文讲义，演示用代码写动画，并把讲解、字幕、点击和光标编进同一条时间线。

| 讲义 | 内容 |
|---|---|
| [冒泡排序](bubble-sort/lecture.md) | 一趟冒泡排序：代码、GSAP 动画、讲解点击的计数组件与光标提示，最后合成为带字幕的讲授 |
| [代码写成的动画](libraries/lecture.md) | GSAP、Anime.js、Motion、Three.js 与 Remotion 各写一节动画，再到讲到哪里点哪里与讲授视频 |

`gallery/` 是动画效果合集，每个库一讲，一节一个效果（只构建网页）：[GSAP](gallery/gsap/lecture.md)、[Anime.js](gallery/anime/lecture.md)、[Motion](gallery/motion/lecture.md)、[D3](gallery/d3/lecture.md)、[Three.js](gallery/three/lecture.md)、[Remotion](gallery/remotion/lecture.md)；[时间轴](gallery/timeline/lecture.md)一讲用同一个场景演示动画的步怎样对上讲解与提示标记。做动画时先在这里找相近的效果，从它的场景文件改起（presmium-animate 技能有按效果查找的索引）。

每讲的 `scenes/` 是动画源码，一个场景一条时间线，由 `{scene}` 的 `:durations:` 切成放映的步骤；`components/` 是讲义自己的组件。讲解合成的语音存在各讲的 `.presmium/speech/`（合成缓存，随讲义提交），没有语音引擎也能构建和播放讲授；改过的句子要配置语音引擎才能重新合成。

## 使用

在 Presmium 仓库根目录先运行 `pnpm install`。

| 命令 | 结果 |
|---|---|
| `pnpm studio` | 首次把示例复制到 `.presmium/example-workspace`（独立的 git 仓库，含合成缓存与给 AI 的 `AGENTS.md`），启动可编辑工作台；之后复用该副本 |
| `pnpm demo:check` | 检查两讲 |
| `pnpm demo:build` | 构建网页站点，并把每讲的幻灯片与 notebook 放进站点：`dist/web/`，`<讲义>/slides/`、`<讲义>/notebook/` |
| `pnpm demo:ir` | 输出两讲的 IR |
| `presmium serve examples/animations` | 从示例源码启动工作区预览 |

单讲预览用 `presmium dev bubble-sort --to web` 或 `--to slides`。讲授视频：`presmium build bubble-sort --to web,lecture` 之后运行 `presmium-lecture export bubble-sort --burn zh-CN`。
