---
"@lincyaw/web": minor
"@lincyaw/kernel": patch
"@lincyaw/design": minor
"@lincyaw/workspace": minor
"@lincyaw/cli": minor
"create-presmium": minor
---

增加课程、文档和展示三种网站主题，以及配色、字体、正文宽度和标志配置。工作区首页可用独立的网站页面 JSON 设计封面、介绍与入口，支持引用文件或内联配置；也可使用自由 HTML、CSS、JavaScript 模板，通过 Vite 打包素材并读取注入的公开文稿集合。原有字符串 `site.landing` 继续支持将一份教学文稿的全文作为首页。教学文稿仍以 `lecture.json` 为唯一内容入口，单篇文稿可选择文章、首页或宽版布局。

`presmium new --type site --theme course|docs|showcase` 创建带独立 `site/home.json` 首页、示例教学文稿和 GitHub Pages 工作流的网站项目；工作流按 Pages 基础路径构建并部署静态网站。已有项目默认保持文档主题，`site.home` 继续使用重定向行为。

首页布局将整份文稿合成一张网页，译本可独立选择布局；实时切换时同步更新正文、分页与当前地址。修复仅修改译本而原文未变时预览不更新的问题，保留原文的增量更新与无变化时的通知抑制。

增加完整产品站点示例：独立双语首页、共享真实线性回归模型的教学文稿与放映版，以及由 Presmium 自身制作的 60 秒产品宣传片、原创音乐和源码下载。宣传片围绕老师备课、组织步骤、比较训练结果、回看与课后探索展开，使用真实工作台和教学输出画面。实时预览支持文稿下的 `slides/` 放映入口，并正确返回当前文稿的阅读地址。
