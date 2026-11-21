---
"@lincyaw/kernel": minor
"@lincyaw/compiler": minor
"@lincyaw/cli": minor
"@lincyaw/workspace": minor
"@lincyaw/mcp": minor
"@lincyaw/web": minor
"@lincyaw/language-server": minor
"@lincyaw/skills": minor
"@lincyaw/presmium": minor
"create-presmium": minor
"@lincyaw/workbench": minor
"@lincyaw/dsh": minor
---

文稿格式升级到版本 2，旧格式不再能直接打开：每份文稿的文件由 `lecture.json` 改名为 `index.pmd`（内容仍是 JSON，翻译在 `locales/<语言>/index.pmd`）；文稿记下自己在文稿树中的位置（`placement`），可以放在另一份文稿之下，没有设置的语言、插件、渲染端与讲授默认值从上级文稿和 `presmium.workspace.yaml` 新增的 `defaults:` 继承；`presmium.workspace.yaml` 不再列出 `documents:`，工作区中的每个 `index.pmd` 都是一份文稿，列表按文稿树排列。正文可以按 ID 引用其他文稿、页面或内容块，新增的同步块目前显示为占位。请在每个工作区或文稿目录运行 `presmium migrate`（先加 `--check` 查看要改什么），或在 Presmium Studio 首页点“升级”：它会重命名文件、补上位置、改写指向 `lecture.json` 的路径并删除 `documents:`，文稿自己的设置原样保留。
