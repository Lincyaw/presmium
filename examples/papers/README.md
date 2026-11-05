# 三分钟读完一篇论文

翰林院传达室的论文讲解：每篇论文一份 Presmium 文稿，配一段三分钟左右（一般不超过六分钟）的配音动画，同时是网页和幻灯片。

```sh
pnpm install          # 在仓库根目录
cd examples/papers
pnpm serve            # 预览整个网站
pnpm build            # 导出网站到 dist/web/
```

制作流程、标准与工具见 [CLAUDE.md](CLAUDE.md)。

每篇论文放在独立的 `papers/<论文名>/` 子目录，以 `lecture.json` 为入口；`kit/`、`site/` 与 `tools/` 由整个系列共用。

CI 检查并构建这个工作区。推送到 `main` 后，Pages 工作流将网站发布到示例站的 `/papers/` 路径；新增论文只需增加一份 `papers/<论文名>/lecture.json`，工作区会自动收录。
