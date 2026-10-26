# Presmium 的文档站

文档站是由 Presmium 自己构建的 JSON 工作区。内容直接保存在下列规范化文稿中，构建脚本不接受 Markdown 教学入口。

| 文档 | 中文原文 | 英文译本 |
|---|---|---|
| 作者指南 | `guide/lecture.json` | `guide/locales/en/lecture.json` |
| 插件开发指南 | `plugins/lecture.json` | `plugins/locales/en/lecture.json` |
| 接口与版本 | `reference/lecture.json` | `reference/locales/en/lecture.json` |

工作区配置在 `presmium.workspace.yaml`。中文版首页在 `/`，英文版在 `/en/`；每份文档位于 `/<目录>/`，英文译本位于 `/<目录>/en/`。TypeDoc 从源码生成的接口参考位于 `/api/`，可通过导航栏的 API 打开。

## 构建

在仓库根目录运行：

```sh
pnpm --filter presmium-docs build
```

产物写入 `site/dist/web/`。需要指定输出目录时，运行 `node site/build.mjs --out <目录>`；`--site <工作区>` 可将同一流程用于另一个文档工作区。

构建脚本依次检查原文和已登记的译本，构建网页站点，生成 TypeDoc，再验证 HTML 中的本地链接和素材。错误、警告、过期译本或不存在的产物链接都会使构建失败。脚本没有旧文稿解析路径，也不把原文的资源目录强加给译本。

## 修改

直接编辑对应 `lecture.json` 的富文本与实体。页面、段落、步骤和表格行列保留稳定 ID。两种语言共用页面 ID，语言切换才能停在同一页；每种语言保留自己的文稿 ID。

先修改中文原文，再核对英文译本。原文通过 `metadata.translations.en` 指向 `locales/en/lecture.json`。译本的 `metadata.translationOf.entry` 是 `../../lecture.json`，内容确认后更新 `digest`；`presmium check <目录>` 会报告过期摘要。JSON 排版、属性顺序和翻译登记字段不改变摘要。

相对链接以各自的文稿目录为基准。例如中文版链接插件指南为 `../plugins/lecture.json`，英文版为 `../../../plugins/lecture.json`。站点会将已发布的文稿链接映射到读者当前语言的页面。原始 JSON 入口与工程文件继续是内容和素材来源，`dist/` 中的运行快照与 HTML 不用于写回正文。
