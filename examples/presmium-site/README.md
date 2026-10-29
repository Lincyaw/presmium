# Presmium 产品首页与 60 秒宣传片

独立 HTML 首页、机器学习小课与产品宣传片组成一个可静态发布的示例。首页保留渐变背景、内容卡片、能力介绍与影片区；教学内容在 `learn/lecture.json`，宣传片在 `promo/lecture.json`，首页在 `site/home.html`。

## 运行

在已安装依赖的仓库根目录运行：

```sh
pnpm --filter presmium-product-site build
pnpm --filter presmium-product-site dev
```

打开服务打印的网址。静态产物在 `dist/web/`；两份文稿各有阅读版（`learn/`、`promo/`）、放映版（`learn/slides/`、`promo/slides/`）与讲授时间线和媒体（`lecture/`）。当前 `site.base` 为 `/repo/`，适合 GitHub 项目 Pages 同名路径；根域名改成 `/` 后重新构建。

源码包使用本仓库的开发依赖，解压回 `examples/presmium-site/` 后运行。新建自己的独立站点可以使用：

```sh
pnpm add -g @lincyaw/presmium
presmium new my-site --type site
```

## 首页

`presmium.workspace.yaml` 的 `site.landing.template` 指向 `site/home.html`。HTML、CSS、TypeScript 由 Vite 构建，媒体位于 `public/`。页面读取注入的 `presmium-site-data`，让资源与文稿入口随部署前缀变化。中文／英文与亮／暗外观由首页维护；控件与视觉令牌来自 `@lincyaw/design`。

首页延续用户参考的 CGFS Figma 方向：轻玻璃导航、环境光背景、编号能力卡、常见问题和独立影片区域。它可独立设计，不要求采用讲义布局。

影片区播放的是影片的源文稿，不是压缩后的视频：点封面后嵌入 `promo/slides/?view=present&track=script&autoplay`，由浏览器按观众的分辨率实时绘制，讲授播放器自带控制条。章节按钮用 `section=<页面>&step=0` 从某个镜头开始。导出的 `presmium-60s.webm` 作为下载文件。配乐按镜头分段，静态托管需要支持按字节范围请求（GitHub Pages 支持），否则音频无法跳到片段的起点。

## 宣传片

先读 `promo/storyboard.md`。影片讲一个闭环的故事：学生深夜在课程群里问“学习率调大了，怎么反而越训越差？”；老师在 Presmium 里圈出讲义的一段、写一条批注，让 AI 加上对比动画；第二天上课按一下走一步，课后同一份讲义做成网站、导出视频发到群里；学生回复“懂了”。十个镜头分别为 6／5／8／7／3／10／5.5／6／3.5／6 秒，共 60 秒，每个镜头是一张 full 页面、一个场景与一个步骤。

`promo/scenes/film.ts` 按 `shot` 参数选镜头，镜头在 `film-story.ts`（提问、黑板、发视频、回复）与 `film-product.ts`（工作台、三种用法、课堂、网站、片尾），共用的画面框架、镜头、指针、字幕和插画在 `film-kit.ts`。时间线用 GSAP，可以任意定位。故事场景是统一风格的扁平插画，颜色取自设计令牌的 `film-*`。

`promo/assets/` 中的界面都是真实采集（2 倍分辨率）：本地 Presmium 工作台里拖选段落、批注框逐字输入、AI 助手、版本历史与预览步骤；本例构建出的放映版九个步骤；同一讲义在课程主题下的网站；导出的教学视频逐步帧。AI 的修改是重放：采集时让 AI 助手连接一个不回答的模型端点，截下“已发送”的真实界面；再把加好动画的讲义按 AI 修改的格式（`Presmium-Origin: agent`）写入版本历史，截下工作台显示的结果。采集用的是一份名为“机器学习导论”的独立工作区，内容与 `learn/lecture.json` 相同，只去掉了指向宣传片的制作说明。

音乐由 `promo/tools/soundtrack.ts` 合成（没有采样与人声），`pnpm score` 生成 `promo/audio/score.wav` 与清单 `score.json`，再用 FFmpeg 编码为文稿引用的 `score.ogg`（Opus 160 kbit/s）。WAV 不入库。

```sh
pnpm --filter presmium-product-site check
pnpm --filter presmium-product-site score
pnpm --filter presmium-product-site lesson-film
pnpm --filter presmium-product-site film
pnpm --filter presmium-product-site build
```

导出的宣传片为 1920×1080、30 fps；配套教学视频为 1280×720、24 fps。封面 `public/presmium-60s-poster.png` 取自导出影片的课堂镜头，更改影片后需同步更新。音乐生成需支持直接运行 TypeScript 的 Node.js 与带 libopus 的 FFmpeg。

`pnpm --filter presmium-product-site source` 重建可下载源码包，包含首页、两份文稿、分镜、真实界面素材、场景、共享模型、配乐生成源码及已有成片。依赖与缓存不进入该包。

## 发布

将 `dist/web/` 发布到静态托管。GitHub Pages 可采用仓库已有工作流，或使用 `presmium new my-site --type site` 生成的工作流，确保 `site.base` 与实际地址一致。视频、封面、课程与源码包随网站发布。
