# 发布、导出与离线

从最终交付物选择构建方式。以下命令在文稿目录运行；先查看已有 `renderers` 与 `base`，不要覆盖现有部署约定。

## 给读者一个网页地址

`presmium build --to web` 得到静态网页，单独构建网页且没有显式 `base` 时位于根路径。需要本机静态服务器且项目没有现成工具时，安装 `pnpm add -D sirv-cli`，然后：

```sh
pnpm exec sirv dist/web --port 8080
```

打开终端打印的地址。网页不加全站 SPA 回落，章节有自己的 HTML。重建后重启 sirv，避免它找不到新生成的哈希文件。

学生版构建到单独目录，例如 `presmium build --to web --audience student --out dist-student`，再把服务器目录换成 `dist-student/web`。受众标记与发布检查见 `presmium-author` 的发布参考。静态站点可部署到用户选择的托管服务，构建不等于已部署。

## 同时交付网页与幻灯片

同时构建、两边都没写 `base` 时，网页在 `/web/`，幻灯片在 `/slides/`。保留整个站点结构：

```sh
presmium build --to web,slides
pnpm exec sirv dist --single slides/index.html --port 8080
```

网页从 `/web/` 打开，幻灯片从 `/slides/` 打开。上面的回落适合本机演示；正式托管最好只对 `/slides/*` 回落到 `/slides/index.html`，或配置 `renderers.slides.routerMode: hash`，避免网页不存在的地址也落到幻灯片。

只构建幻灯片、未设 `base` 时，可用 `pnpm exec sirv dist/slides --single --port 8080`。已有子路径时按该路径服务产物，不要把 `/slides/` 的产物误当根站点。

网页章节标题旁可跳到幻灯片，幻灯片导航可回网页。分开部署时配置两边的实际地址，检查两个方向和当前步骤是否正确：

```yaml
presmium:
  presmium.web:
    slidesUrl: https://example.com/slides/
    webUrl: https://example.com/web/
```

## 导出 PDF 或图片

文稿需列出 `@lincyaw/slidev-addon-publish`。项目中使用：

```sh
pnpm exec presmium-export --format pdf --output lecture.pdf
```

用 `--with-clicks` 把每一步展开为一页，`--range 1,3-5` 选择页，`--dark` 导出暗色，`--format png` 改为图片，`--format pptx` 改为 PowerPoint（每张幻灯片是一张图）。在工作台中，命令栏的“导出”同样能生成幻灯片 PDF、PowerPoint 与讲授视频，不需要文稿列出发布插件，生成的文件可以打开、播放与下载。`presmium-export` 会按导出所需的根路径准备文稿，避免静态站点子路径导致媒体丢失。

导出后检查页数、缺页、长代码溢出，以及关键链接。运行面板在纸面上显示静态降级与录制输出。缺页或超时时先读错误，再重试或调整 `--wait`、`--timeout`，不能把不完整文件当成完成。

## 给学生可运行的 notebook

`presmium build --to notebook` 生成 `dist/notebook/<入口名>.ipynb`。图片等文件在旁边的 `media/`，交付整个目录。内核默认 `python3`，由 `renderers.notebook.kernel` 选择。

无法转换的交互组件会降级，查看构建报告。需要链接到在线交互版时设 `renderers.notebook.webUrl`，并在 Jupyter 中确认图片与代码单元格可用。

## 准备离线课

联网时打开实际授课地址，等页面与离线缓存准备好。网页页面和搜索会缓存，较大的执行运行时在第一次使用时取得；提前运行要用的代码，或选“保存以离线使用”。幻灯片离线需发布插件，会预缓存运行时。

在同一浏览器、同一地址下断网试讲：翻页、搜索、媒体、运行代码。远端 Jupyter、课堂同步与外部模型仍需网络。需要完全离线时提前准备录制输出或本地可用的运行方式。

头部的 `presmium: { presmium.publish: { offline: false } }` 会关闭离线缓存，先检查现有配置。变更站点地址或重新构建后重新演练；“以前打开过”不能证明这次课的资源已齐。
