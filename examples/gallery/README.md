# Presmium Gallery

示例工作区，共 25 份文稿。每份文稿的内容都在自己的 `lecture.json` 中，代码与媒体文件由文稿引用。

## 功能合集

逐页演示单项功能。

| 文稿 | 内容 |
|---|---|
| [内容与排版](showcase-content/lecture.json) | 文字与公式、列表、表格、分栏、Mermaid 与 PlantUML、思维导图、音视频、图片、提示与折叠、在线媒体 |
| [步骤与动画](showcase-steps/lecture.json) | 逐项揭示、继承上一步、动画状态与参数、D3、交互组件、光标与聚光提示 |
| [代码与运行](showcase-code/lecture.json) | 按步高亮、代码变体、引用项目文件、JavaScript 与 Python、逐行执行；Docker、WASI、WebGPU、Jupyter |
| [课堂互动](showcase-classroom/lecture.json) | 测验、预测、代码练习、提问与投票、阅读笔记、跟随主讲、学生版 |
| [阅读与发布](showcase-publishing/lecture.json) | 搜索与脚注、放映、按媒介输出、网页组件、高对比度、译文、AI 问答、导出 |

## 教程

在工作台中按编号步骤操作。

| 文稿 | 内容 |
|---|---|
| [编辑一份讲义](tutorial-editing/lecture.json) | 以“午餐预算”为材料，练习复制页面、编辑讲稿、调整播放时机、批注与版本历史、放映与导出 |
| [讲稿与配音](tutorial-narration/lecture.json) | 读音与动作标记、播放时机、时间线、静音讲授、AI 配音、录音、音频片段、导出视频 |

## 课程与参考

| 文稿 | 内容 |
|---|---|
| [傅里叶级数小课](learn/lecture.json) | 转动的圆怎样画出音符与五角星，含英文译文 |
| [产品宣传片](promo/lecture.json) | 真实工作台、课堂与网站画面组成的产品短片 |
| [冒泡排序](bubble-sort/lecture.json) | 一趟冒泡排序：代码、GSAP 动画、讲解点击的计数组件与光标提示，合成为带字幕的讲授 |
| [代码写成的动画](libraries/lecture.json) | GSAP、Anime.js、Motion、Three.js 与 Remotion 各写一节动画，再到讲授视频 |
| [动画效果参考](animation-library/) | 按场景整理的动画：算法与代码、数据与图表、数学与机器学习、文字与字幕、强调与标注、概念与结构、产品演示、转场与镜头、路径与三维、动效技法；另有时长规格、宣传片、分镜示范与时间轴 |

发布的网站中，首页的“示例”进入示例库，按功能合集、教程、课程、影片与动画参考分类展示；分类取自各文稿 `metadata.tags` 的第一个类别标签。功能与页面的对应见 [FEATURES.md](FEATURES.md) 和 [features.json](features.json)。产品首页与影片制作见 [产品站点说明](PRODUCT-SITE.md)。

`animation-library` 是指向 `.agents/skills/presmium-animate/gallery` 的相对软链接，效果源码只在技能中维护一份，复制工作区时变成真实文件。

冒泡排序与代码写成的动画的配音缓存保存在各自的 `.presmium/speech/`，随文稿提交；没有语音服务也能播放。改过的讲稿需要配置语音服务后重新生成配音。

## 使用

在 Presmium 仓库根目录先运行 `pnpm install`。

| 命令 | 结果 |
|---|---|
| `pnpm studio` | 首次把示例复制到 `.presmium/gallery-workspace`（独立的 git 仓库），启动工作台；之后复用这份副本 |
| `pnpm demo:check` | 检查冒泡排序与代码写成的动画 |
| `pnpm demo:build` | 构建全部示例的网页站点，并为完整课程、小课和宣传片补充幻灯片、notebook 与讲授 |
| `pnpm demo:ir` | 输出两讲完整课程的 IR |
| `presmium serve examples/gallery` | 从示例源码启动工作区预览 |

已有的工作台副本不会自动同步这里的改动。要一份最新副本，在仓库根目录运行 `node examples/gallery/try.mjs <新目录>`，再运行 `pnpm studio <新目录>`。

在示例目录中检查或预览单份文稿：

```sh
presmium check showcase-classroom
presmium dev showcase-classroom
presmium dev bubble-sort --to slides
```

讲授视频：`presmium build bubble-sort --to web,lecture` 之后运行 `presmium-lecture export bubble-sort --burn zh-CN`。
