# 网站主题、首页与发布

Presmium 用 `presmium.workspace.yaml` 选择网站主题和品牌，网站首页可以单独设计，教学文稿继续用 `lecture.json` 编写。这个分工类似 Hugo 的页面内容与主题：首页介绍网站，文稿承载课程、步骤和讲稿，主题提供网站结构与视觉。首页不必采用教学文稿的内容结构。

## 新建一个网站

安装 Presmium 后，新建带首页和 GitHub Pages 工作流的工作区：

```sh
presmium new my-site --type site --theme course --title '我的课程'
cd my-site
pnpm install
pnpm serve
```

打开终端打印的完整网址。生成的项目包括：

```text
my-site/
  presmium.workspace.yaml
  site/home.json
  intro/lecture.json
  .github/workflows/pages.yml
  package.json
```

`site/home.json` 是独立首页，`intro/lecture.json` 是第一份教学文稿。编辑首页文件安排封面和介绍，编辑文稿组织课程与演示；教学文稿的唯一可编辑内容入口仍是 `lecture.json`。`--theme` 可选 `course`、`docs`、`showcase`，新网站默认 `course`。

导出静态网站：

```sh
pnpm build
```

产物在 `dist/web/`，网页、搜索索引、查看器和引用的本地文件一起发布。网站不需要在读者的机器上运行 Presmium 服务。

## 三种预置主题

| 配置值 | 名称 | 文稿列表首页 | 普通文稿 |
|---|---|---|---|
| `course` | 课程 / Course | 按工作区顺序显示有序课程目录 | 左侧显示课程名称与学习目录，突出阅读顺序 |
| `docs` | 文档 / Docs | 文稿卡片网格 | 左侧页面导航、右侧页内大纲，保持原有阅读方式 |
| `showcase` | 展示 / Showcase | 网站介绍与更大的展示卡片 | 横向页面导航，隐藏两侧目录，给正文和媒体更多空间 |

这些主题中的教学文稿共用同一正文查看器与组件。已有项目未指定主题时仍使用 `docs`。文稿列表页的介绍取自工作区的 `title` 和 `site.head.description`，独立首页的内容由 `site.landing` 指定。

主题决定整个网站的外观与导航；文稿的 `layout` 选择正文排版，以及是否合成一张网页。无需为每页重新选择主题。

## 工作区配置

编辑工作区根目录的 `presmium.workspace.yaml`：

```yaml
title: 我的课程
documents: ['*/lecture.json']
site:
  theme: course
  params:
    accent: teal
    typography: reading
    contentWidth: comfortable
    logo: ./assets/logo.svg
    logoAlt: 我的课程
  landing:
    source: ./site/home.json
  head:
    description: 从示例开始学习，阅读讲义并观看演示。
  nav:
    - text: 开始学习
      link: /intro/
  footer:
    message: 按自己的节奏阅读和练习。
```

示例中的 `assets/logo.svg` 需要是项目已有的文件；暂不使用标志时删除 `logo` 与 `logoAlt`。本地标志随产物发布；导航中的站内绝对路径会加上网站的 `base`。

| 参数 | 支持值 | 默认值 |
|---|---|---|
| `site.theme` | `course`、`docs`、`showcase` | `docs`；新建 `site` 项目显式写入 `course` |
| `site.params.accent` | `blue`、`teal`、`violet`、`amber` | `docs`、`course` 为 `teal`，`showcase` 为 `violet` |
| `site.params.typography` | `reading`（阅读字体）、`sans`（无衬线字体） | `docs`、`course` 为 `reading`，`showcase` 为 `sans` |
| `site.params.contentWidth` | `comfortable`、`wide` | `docs`、`course` 为 `comfortable`，`showcase` 为 `wide` |
| `site.params.logo` | 标志图片的位置 | 不显示图片标志 |
| `site.params.logoAlt` | 标志的替代文字，也可显式填写空字符串 | 空替代文字；标志按旁边已有网站名称的装饰图处理 |

配色随亮色与暗色切换；字体与宽度参数用于网站正文，不改变幻灯片画布。参数是上述固定选项，不接受任意 CSS 声明或 HTML 模板代码。

脚手架按选中的主题写入默认参数。显式填写的参数覆盖主题默认值；更改 `theme` 时可删除已有参数覆盖，以使用新主题的默认值。

既有 `site.nav`、`footer`、`head`、`sitemap`、`lang` 和 `locales` 配置继续有效。

修改 `presmium.workspace.yaml` 中的网站配置后，重新启动 `pnpm serve` 查看效果，或重新运行 `pnpm build` 导出网站。

## 单独设计首页

在 `site.landing.source` 中指定一个工作区内的首页文件：

```yaml
site:
  theme: showcase
  landing:
    source: ./site/home.json
```

`site/home.json` 使用独立的网站首页结构。一个只含封面和入口的页面可以这样写：

```json
{
  "schemaVersion": 1,
  "title": "我的课程",
  "description": "讲义、演示与学习资料。",
  "hero": {
    "eyebrow": "持续更新",
    "title": "从一个示例开始",
    "description": "按自己的节奏阅读、观看与练习。",
    "actions": [
      { "text": "开始阅读", "link": "/intro/", "variant": "primary" }
    ]
  },
  "sections": []
}
```

`title` 与 `sections` 必填，`hero` 可选。首页还可安排介绍、特性、媒体、文稿列表与行动入口；它没有教学步骤、讲稿或配音编排，不需要包成一份教学文稿。也可以把同样的页面对象直接写在 `site.landing` 中，省去单独的首页文件。

首页文件相对于工作区根目录定位，不写进 `documents`；`documents` 只列教学文稿。首页中的站内链接以网站为根，发布时使用配置的 `base`。

独立 JSON 中的本地媒体相对于该 JSON 文件定位；内联配置中的媒体相对于工作区根目录定位。例如 `site/home.json` 中的 `./cover.webp` 指向 `site/cover.webp`。工作区的 `public/` 目录按原路径发布到网站根，可通过 `/files/slides.pptx` 等链接引用其中的文件。

`hero` 支持 `eyebrow`、`title`、`description`、`image`、`imageAlt` 和 `actions`。每个操作填写 `text` 与 `link`，可选 `variant: primary` 或 `secondary`。

`sections` 按数组顺序显示，每项必须有唯一的 `id` 与一个 `type`，可带 `title` 和 `description`：

| `type` | 内容字段 | 用途 |
|---|---|---|
| `features` | `items: [{ title, description?, image?, imageAlt?, link? }]` | 特性、作品或课程亮点 |
| `text` | `body` | 独立介绍文字 |
| `media` | `kind: image\|video`、`src`，可选 `alt`、`poster`、`captions` | 图片或视频；`captions` 是语言到 VTT 文件的映射 |
| `documents` | 可选 `tags`、`directories` | 使用工作区的已发布文稿列表，可筛选标签与文稿目录 |
| `cta` | `title`、`actions` | 行动入口，操作结构与 `hero.actions` 相同 |

例如把前面空的 `sections` 换成：

```json
[
  {
    "id": "highlights",
    "type": "features",
    "title": "课程亮点",
    "items": [
      { "title": "随时阅读", "description": "每份文稿都有独立网址。" },
      { "title": "跟随演示", "description": "结合示例与教学步骤理解内容。" }
    ]
  },
  {
    "id": "lessons",
    "type": "documents",
    "title": "课程目录"
  }
]
```

### 使用自己的 HTML、CSS 和 JavaScript

需要完全自行安排首页时，在 `site.landing.template` 中指定 HTML 入口，替换 `source` 配置：

```yaml
site:
  landing:
    template: ./site/home.html
```

一个完整的 `site/home.html` 可以这样开始：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>我的课程</title>
    <link rel="stylesheet" href="./home.css">
  </head>
  <body>
    <main>
      <h1>从一个示例开始</h1>
      <p>按自己的节奏阅读、观看与练习。</p>
      <h2>课程目录</h2>
      <ul id="documents"></ul>
    </main>
    <script type="module" src="./home.js"></script>
  </body>
</html>
```

同目录的 `home.css` 负责首页自己的外观，例如：

```css
body {
  max-width: 65rem;
  margin-inline: auto;
  padding: 2rem;
  font-family: system-ui, sans-serif;
}
```

Presmium 通过 Vite 的公开构建接口处理 HTML 入口及其 CSS、JavaScript 和本地素材，再把入口放到网站的 `index.html`。模板自己控制 HTML 的标题、正文和样式，不自动套用预置主题的查看器外壳。教学文稿的页面仍按工作区主题显示。

页面会注入一个 `id="presmium-site-data"`、`type="application/json"` 的脚本元素。`site/home.js` 可以读取它来生成真实的文稿链接：

```js
const content = JSON.parse(
  document.getElementById('presmium-site-data').textContent
);
const list = document.getElementById('documents');

for (const entry of content.documents) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = entry.href;
  link.textContent = entry.title;
  item.append(link);
  list.append(item);
}
```

注入的数据只包含面向读者的网站与文稿集合，例如：

```json
{
  "schemaVersion": 1,
  "title": "我的课程",
  "base": "/my-site/",
  "lang": "zh-CN",
  "documents": [
    {
      "id": "intro",
      "title": "开始创作",
      "href": "/my-site/intro/",
      "description": "从第一份内容开始。",
      "lang": "zh-CN",
      "tags": ["入门"],
      "pages": 3
    }
  ]
}
```

文稿的说明、语言、标签与页数可能省略；使用发布后的 `href` 可以保留部署基础路径。注入数据不包含教学运行快照、诊断、文稿配置或服务端设置。

`source` 与 `template` 不能同时配置。运行 `pnpm serve` 时，刷新首页会重新构建 HTML 模板；当前不提供模板的热更新。导出或部署前仍需重新运行 `pnpm build`。

### 已有文稿作为首页

已有项目仍可使用字符串形式：

```yaml
site:
  landing: welcome
```

这里的 `welcome` 是 `documents` 包含的教学文稿目录。构建会将 `welcome/lecture.json` 的所有页面额外显示在网站根页，原来的 `/welcome/` 地址与默认章节分页保留。此方式适合直接以一份讲义作为入口；独立设计的站点首页使用前面的对象配置。

没有 `landing` 时，根页按所选主题显示文稿列表。有独立首页或文稿首页时，完整文稿列表仍可从 `documents.html` 打开。`site.home` 保留把根页重定向到指定文稿的行为，不能与任一种 `landing` 同时配置。

## 为文稿选择页面布局

在文稿的 `lecture.json` 中设置 `metadata.renderers.web.layout`。以下为配置节选：

```json
{
  "metadata": {
    "renderers": {
      "web": {
        "layout": "wide"
      }
    }
  }
}
```

| 布局 | 行为 |
|---|---|
| `article` | 默认文章布局，按主题显示导航与大纲 |
| `landing` | 全部页面合成 `index.html` 中的一张网页，单栏全宽，隐藏两侧目录与页面间翻页导航 |
| `wide` | 放宽正文并隐藏右侧大纲，适合图表与演示 |

这是整份文稿的网页布局，不替代文稿各页面已有的分栏、画布或滚动叙事设置，也不改变页面、内容块和步骤的身份。

`metadata.renderers.web.layout: landing` 会改变这份教学文稿本身的网页分页；它与独立网站首页的内容结构分开配置。只有旧字符串形式的 `site.landing` 才会复用一份教学文稿的全文。

整个工作区构建时，主题、品牌和网站导航统一由工作区的 `site` 决定，单篇文稿可以选择自己的 `layout`。每份译本也使用它自己的 `metadata.renderers.web.layout`；未配置时使用 `article`，不会自动采用原文的布局。单独构建一份文稿时，在它的 `metadata.renderers.web` 中选择 `theme` 和 `params`：

```json
{
  "metadata": {
    "renderers": {
      "web": {
        "theme": "showcase",
        "params": {
          "accent": "violet",
          "typography": "sans",
          "contentWidth": "wide"
        },
        "layout": "landing"
      }
    }
  }
}
```

```sh
presmium build welcome --to web
```

## 完整示例：产品首页与教学宣传片

[产品站点示例](../examples/gallery/PRODUCT-SITE.md) 是统一 Gallery 的一部分：独立 HTML 首页收集傅里叶级数小课与产品宣传片，工作区同时展示课程、功能导览和动画效果参考。小课和宣传片各生成阅读、放映与讲授产物；成片、字幕和完整 Gallery 源码下载随首页发布。

首页提供中文／英文、亮／暗外观和移动布局。设计素材、文稿、分镜、场景、共享数学模型与构建脚本均在示例目录内。

```sh
pnpm --filter presmium-gallery build
pnpm --filter presmium-gallery dev
```

在实时预览中，配置了幻灯片渲染端的文稿也可使用 `<文稿路径>/slides/` 打开放映，再返回同一文稿的阅读页。静态站点仍需在自己的构建中生成并合并放映产物，示例的 `tools/build.mjs` 展示了这一过程。

## 发布到 GitHub Pages

新建的 `site` 项目含 `.github/workflows/pages.yml`。将项目推送到 GitHub 仓库后，在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**，然后运行该工作流，或推送到工作流配置的分支。

工作流通过 `configure-pages` 读取网站的基础路径，把它写入工作区的 `site.base`，运行 `pnpm build`，上传 `dist/web/` 并部署。项目站点的 `/仓库名/` 路径因此用于页面、导航和素材；设置自定义域名后也由 Pages 提供实际基础路径。构建产物只需普通静态托管，其他平台可以直接部署同一个输出目录。

网页的每个页面有自己的 HTML 文件，刷新直达链接不依赖 SPA 回退规则。第一次发布后，实际打开首页、内页直链、搜索和媒体，确认它们都在部署地址下工作。

Pages 只托管静态文件。浏览器中的阅读、步骤、动画和已有媒体组件可以运行；需要 Presmium 服务端的能力仍需要对应服务。

## 内容与能力范围

网站主题不改变插件能力。现有内容插件的音视频、封面和字幕继续通过同一组件显示，本地素材随构建发布；浏览器播放仍取决于文件编码与网络可达性。

PowerPoint、Word 和其他文件可以作为正文链接发布和下载。本次主题能力不包含将 Office 文件导入为可编辑文稿，或内置 Office 在线预览。主题选择也不代表自动获得这些能力。

当前提供三种预置主题、上述参数、文稿布局、独立 JSON 首页、自由 HTML 模板和兼容的文稿首页；不包含主题市场、任意 React 外壳或工作台中的主题选择面板。
