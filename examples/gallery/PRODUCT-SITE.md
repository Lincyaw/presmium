# Presmium 产品首页与 60 秒宣传片

独立 HTML 首页、傅里叶级数小课与产品宣传片组成一个可静态发布的示例。首页保留渐变背景、内容卡片、能力介绍与影片区；教学内容在 `learn/lecture.json`，宣传片在 `promo/lecture.json`，首页在 `site/home.html`。这两份文稿现与课程、功能合集、教程和动画效果参考共用 Gallery 工作区，完整目录见 [Gallery](README.md)。

## 运行

在已安装依赖的仓库根目录运行：

```sh
pnpm --filter presmium-gallery build
pnpm --filter presmium-gallery dev
```

打开服务打印的网址。静态产物在 `dist/web/`；两份文稿各有阅读版（`learn/`、`promo/`）、放映版（`learn/slides/`、`promo/slides/`）与讲授时间线和媒体（`lecture/`）。默认部署在根路径；GitHub Pages 构建时写入实际 `site.base`。

源码包使用本仓库的开发依赖，解压回 `examples/gallery/` 后运行。新建自己的独立站点可以使用：

```sh
pnpm add -g @lincyaw/presmium
presmium new my-site --type site
```

## 首页

`presmium.workspace.yaml` 的 `site.landing.template` 指向 `site/home.html`。HTML、CSS、TypeScript 由 Vite 构建，媒体位于 `public/`。页面读取注入的 `presmium-site-data`，让资源与文稿入口随部署前缀变化。中文／英文与亮／暗外观由首页维护；控件与视觉令牌来自 `@lincyaw/design`。

首页延续用户参考的 CGFS Figma 方向：轻玻璃导航、环境光背景、编号能力卡、常见问题和独立影片区域。它可独立设计，不要求采用文稿布局。

影片区播放的是影片的源文稿，不是压缩后的视频：点封面后嵌入 `promo/slides/?view=present&track=script&autoplay`，由浏览器按观众的分辨率实时绘制，讲授播放器自带控制条。章节按钮用 `section=<页面>&step=<步骤>` 从某一段开始。导出的 `presmium-60s.webm` 作为下载文件。配乐按步骤分段，静态托管需要支持按字节范围请求（GitHub Pages 支持），否则音频无法跳到片段的起点。

## 示例课

`learn/lecture.json` 讲傅里叶级数：一串转动的圆怎样画出一个带尖角的八分音符。四页依次是提问、一个圆再加一个圆、主图（音符，圆从 1 个加到 64 个，每一步一个状态）和换成五角星自己试。英文译文在 `learn/locales/en/lecture.json`，它的 `scenes/` 只转引原文的场景，图中文字按页面语言选择。

场景在 `learn/scenes/`：`epicycles.ts` 用直线、椭圆和贝塞尔曲线拼出轮廓，按弧长等距取 1024 个点，算离散傅里叶变换，按半径从大到小取前 N 个圆，不含任何预先算好的系数，也不依赖 DOM，首页的小图用的是同一份计算；`fourier.ts` 是主图与五角星（参数 `shape`、`terms`），`circles.ts` 是一个圆与两个圆，`drawing.ts` 是两者共用的画布、圆链与时间换算。每个状态里新加的圆先从链端弹出，链转整一圈画出曲线，误差落到右侧图上，然后停在整条曲线上；这一帧就是网页与放映中的静止画面和视频里停留的镜头。

## 宣传片

先读 `promo/storyboard.md`。影片是英文的，讲一个首尾呼应的故事：学生深夜在课程群里问 “How can a bunch of spinning circles draw any shape?”；老师在 Presmium 里圈出傅里叶级数小课的一段、写一条批注，让 AI 加上转动的圆画音符的动画；第二天上课按一下走一步（8、16、32、64 个圆），课后同一份文稿做成网站、导出视频发到群里；学生回复 “Got it!”。片尾是 “Make complex things clear.”。影片约 61 秒，分四张 full 页面，页面之间是硬切：提问（4 小节）、黑板（2 小节）、从工作台到学生回复的一整段（19 小节），片尾（3 小节）。中间一段是一个场景的四个状态（工作台、课堂、网站、视频与回复），每一处衔接都由同一张图带过去：镜头推进图，下一处的同一张图以相同的大小和位置、相同的状态接上，再拉开。所有时间都在 `promo/scenes/timeline.ts`，按音乐的节拍取值。

`promo/scenes/film.ts` 按 `shot` 参数选页面，画面在 `film-story.ts`（提问、黑板、视频与回复）与 `film-product.ts`（工作台、课堂、网站、片尾），共用的画面框架、镜头、指针、字幕、照片场景与画出来的设备，以及把几段画面串成一个场景的图层与衔接（`frameChain`、`playChain`、`fit`）在 `film-kit.ts`。时间线用 GSAP，可以任意定位。故事场景以实拍照片为背景（出处见 `promo/assets/photos.md`），手机、笔记本、浏览器窗口与聊天界面是画出来的，颜色取自设计令牌的 `film-*`。

`promo/assets/` 中的界面都是英文界面的真实采集（2 倍分辨率）：本地 Presmium 工作台里拖选段落、批注框逐字输入、AI 助手、版本历史、改动后页面滚到新图与预览步骤；放映版拟合一节的七个步骤；课程主题的网站；导出的英文教学视频中拟合一节的画面。被编辑的课是 `learn/lecture.json` 的英文译文 `learn/locales/en/lecture.json`。AI 的修改是重放：采集时让 AI 助手连接一个不回答的模型端点，截下“已发送”的真实界面；再把加好动画的文稿按 AI 修改的格式（`Presmium-Origin: agent`）写入版本历史，截下工作台显示的结果。

音乐是 Kevin MacLeod 的 “Newer Wave”（incompetech.com，CC BY 4.0，须署名；署名写在影片文稿的阅读视图与 `promo/audio/score.json`）。按键声来自 Kenney 的 Interface Sounds（CC0），只用到的三个文件在 `promo/audio/sfx/`，并附许可说明。`pnpm score`（`promo/tools/score.mjs`）首次下载原曲到 `promo/audio/source/`，截取与节拍网格对应的 61 秒，在工作台的点击、翻页笔的每一下与手机上的轻触处叠加按键声，用 FFmpeg 混音并调到约 −16 LUFS、真峰值不超过 −1.5 dBTP，写出 `promo/audio/score.wav`、清单 `score.json` 与文稿引用的 `score.ogg`（Opus 160 kbit/s），并同步更新 `lecture.json` 中配乐的指纹、每个步骤一段的配乐片段、步骤停留时间与场景各状态的时长。原曲与 WAV 不入库。

```sh
pnpm --filter presmium-gallery check:site
pnpm --filter presmium-gallery score
pnpm --filter presmium-gallery lesson-film
pnpm --filter presmium-gallery film
pnpm --filter presmium-gallery build
```

导出的宣传片为 1920×1080、30 fps；配套教学视频为 1280×720、24 fps。封面 `public/presmium-60s-poster.jpg` 取自导出影片的课堂镜头（照片为主，存为 JPEG），更改影片后需同步更新。配乐生成需支持直接运行 TypeScript 的 Node.js（`score.mjs` 引用 `timeline.ts`）与带 libopus 的 FFmpeg。

`pnpm --filter presmium-gallery source` 重建可下载源码包，包含首页、两份文稿、分镜、真实界面素材、场景、共享模型、配乐生成源码及已有成片。源码包也包含其余 Gallery 文稿和已物化的动画效果参考；依赖与缓存不进入该包。

## 发布

将 `dist/web/` 发布到静态托管。GitHub Pages 可采用仓库已有工作流，或使用 `presmium new my-site --type site` 生成的工作流，确保 `site.base` 与实际地址一致。视频、封面、课程与源码包随网站发布。
