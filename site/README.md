# Presmium 的文档站

文档站（P-144、P-145）是一个 Presmium 工作区，用 Presmium 自己构建：

| 文档 | 中文（原文） | 英文（译本） |
|---|---|---|
| 作者指南 | `guide/lecture.md` | `guide/lecture.en.md` |
| 插件开发指南 | `plugins/lecture.md` | `plugins/lecture.en.md` |
| 接口与版本 | `reference/lecture.md` | `reference/lecture.en.md` |

工作区配置在 `presmium.workspace.yaml`：首页的中文版在 `/`，英文版在 `/en/`（标题取 `site.locales.en.title`），每份文档在 `/<目录>/`，它的英文译本在 `/<目录>/en/`。接口参考由 TypeDoc 从源码生成（根目录的 `typedoc.json`），在 `/api/`，导航栏的“API”链接它。

## 构建

在仓库根目录：

```sh
pnpm --filter presmium-docs build          # 写到 site/dist/web/
node site/build.mjs --out <目录>            # 写到 <目录>/web/
node site/build.mjs --site <工作区> --out <目录>   # 以同样的步骤构建另一个工作区
```

`build.mjs` 依次：

1. 对每份文档的原文与译本运行 `presmium check --json`：失效的链接与片段、MyST 指令的错误、过期的译本，有一条错误或警告就失败；
2. 在这里运行 `presmium build`，构建两种语言的工作区站点；
3. 运行 TypeDoc，把接口参考写到 `web/api/`；
4. 检查产物：每个页面中本地的 `href` 与 `src` 都指向站点中存在的文件。

任何一步失败，构建就以退出码 1 停止。`e2e/docs-site.spec.ts` 构建这份文档站并检查两种语言的目录、语言菜单与接口参考，另用 `--site` 构建临时写出的小工作区，证明失效的链接、过期的译本与产物中指向不存在文件的地址都使构建失败。

产物是静态文件，可以放到任何静态托管上（站点的路径是 `/`）。编辑时可以在这里运行 `presmium serve` 预览（预览只显示中文原文）。

## 修改

- 先改中文原文，再改英文译本；章节标签（`(syntax)=`）两边相同，语言菜单才能停在同一章。
- 原文改了以后，`presmium check <目录>` 警告译本过期并给出新的摘要：核对译本后把它写进译本头部的 `translationOf.digest`。
- 链接另一份文档写它的入口文件（`[接口与版本](../reference/lecture.md#versions)`），译本中也写原文的入口：站点把英文页面上的链接指向那份文档的英文译本。
- 正文中不写指向 `/api/` 的链接（发布检查把 `/…` 当作文档的 `public/` 目录），写“导航栏的 API”。
