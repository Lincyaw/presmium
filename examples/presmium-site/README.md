# Presmium 产品首页与 60 秒宣传片

独立 HTML 首页、机器学习小课与产品宣传片组成一个可静态发布的示例。首页保留渐变背景、内容卡片、能力介绍与影片区；教学内容在 `learn/lecture.json`，宣传片在 `promo/lecture.json`，首页在 `site/home.html`。

## 运行

在已安装依赖的仓库根目录运行：

```sh
pnpm --filter presmium-product-site build
pnpm --filter presmium-product-site dev
```

打开服务打印的网址。静态产物在 `dist/web/`；`learn/` 为阅读版，`learn/slides/` 为放映版，两份文稿的 `lecture/` 均包含回放时间线与媒体。当前 `site.base` 为 `/repo/`，适合 GitHub 项目 Pages 同名路径；根域名改成 `/` 后重新构建。

源码包使用本仓库的开发依赖，解压回 `examples/presmium-site/` 后运行。新建自己的独立站点可以使用：

```sh
pnpm add -g @lincyaw/presmium
presmium new my-site --type site
```

## 首页

`presmium.workspace.yaml` 的 `site.landing.template` 指向 `site/home.html`。HTML、CSS、TypeScript 由 Vite 构建，媒体位于 `public/`。页面读取注入的 `presmium-site-data`，让资源与文稿入口随部署前缀变化。中文／英文与亮／暗外观由首页维护；控件与视觉令牌来自 `@lincyaw/design`。

首页延续用户参考的 CGFS Figma 方向：轻玻璃导航、环境光背景、编号能力卡、常见问题和独立影片区域。它可独立设计，不要求采用讲义布局。影片替换只更新原区域里的媒体、封面与章节位置。

## 宣传片

先读 `promo/storyboard.md` 与 `promo/art-direction-v3.md`。影片围绕一位老师准备“学习率，怎样改变一条预测线？”这堂课展开：材料割裂、组织讲解、公式与代码、真实步骤比较、回看和课后输出。八段分别为 6／8／9／10／9／6／6／6 秒，共 60 秒。每个镜头是一张 full 页面、一个场景与一个语义步骤。

`promo/scenes/product-film.ts` 通过公开 scene API、GSAP、Canvas 与课程原有 SVG 组织镜头。应用界面来自实际工作台和阅读／放映截图，视频形态来自真正导出的本课视频；没有重画产品按钮、虚构 alpha 滑杆、模拟 AI 生成结果或伪造学生评价。

公式编辑与编号步骤切换是实际能力。图形的帧间过渡复用 `learn/scenes/regression.ts` 的 SVG 与 `promo/scenes/model.ts` 的数学计算，是这堂课的讲解内容；稳定状态落在真实训练结果，不表示产品能自动把任意公式变成动画。镜头与指针均可按时间重建，支持反向定位。

音乐由 `promo/tools/soundtrack.ts` 生成，真实 WAV、来源与校验清单位于 `promo/audio/`。影片没有口播和烧录字幕。配套教学视频为无语音的真实逐步放映。

```sh
pnpm --filter presmium-product-site check
pnpm --filter presmium-product-site score
pnpm --filter presmium-product-site lesson-film
pnpm --filter presmium-product-site film
pnpm --filter presmium-product-site build
```

宣传片为 1920×1080、30 fps；配套教学视频为 1280×720、24 fps，原时间线 21.6 秒，视频按帧取整为 21.625 秒。封面从宣传片的真实结果帧抽取，更改影片后需同步更新。音乐生成需支持直接运行 TypeScript 的 Node.js。

`pnpm --filter presmium-product-site source` 重建可下载源码包，包含首页、两份文稿、分镜、真实界面素材、场景、共享模型、原创配乐生成源码及已有成片。依赖、缓存和旧版本研究稿不进入该包。

## 发布

将 `dist/web/` 发布到静态托管。GitHub Pages 可采用仓库已有工作流，或使用 `presmium new my-site --type site` 生成的工作流，确保 `site.base` 与实际地址一致。视频、封面、课程与源码包随网站发布。
