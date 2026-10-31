# 网站主题、首页与发布

工作区的 `presmium.workspace.yaml` 选择网站主题与品牌；首页可以单独设计；教学文稿仍只在 `lecture.json` 中编写。主题决定整个网站的外观与导航，文稿的 `layout` 只决定这份文稿的正文排版。

## 1. 新建网站

```sh
presmium new my-site --type site --theme course --title '我的课程'
cd my-site
pnpm install
pnpm serve    # 实时预览，打开终端打印的网址
pnpm build    # 静态网站在 dist/web/
```

生成 `presmium.workspace.yaml`、独立首页 `site/home.json`、第一份文稿 `intro/lecture.json` 与 GitHub Pages 工作流 `.github/workflows/pages.yml`。`--theme` 可选 `course`、`docs`、`showcase`，默认 `course`。产物包含网页、搜索索引、查看器与引用的本地文件，读者端不需要 Presmium 服务。

## 2. 主题与参数

| `site.theme` | 名称 | 文稿列表首页 | 文稿页 |
|---|---|---|---|
| `course` | 课程 | 有序课程目录 | 左侧课程名与学习目录 |
| `docs` | 文档 | 文稿卡片网格 | 左侧页面导航，右侧页内大纲 |
| `showcase` | 展示 | 网站介绍与大展示卡片 | 横向页面导航，不显示两侧目录 |

未写 `theme` 时为 `docs`。

```yaml
title: 我的课程
documents: ['*/lecture.json']
site:
  base: /
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

| 参数 | 取值 | 默认（`docs`、`course` / `showcase`） |
|---|---|---|
| `site.params.accent` | `blue`、`teal`、`violet`、`amber` | `teal` / `violet` |
| `site.params.typography` | `reading`、`sans` | `reading` / `sans` |
| `site.params.contentWidth` | `comfortable`、`wide` | `comfortable` / `wide` |
| `site.params.logo` | 工作区内的图片路径 | 不显示 |
| `site.params.logoAlt` | 替代文字，可为空字符串 | 空，按装饰图处理 |

- 显式参数覆盖主题默认值；换主题时删掉旧参数即可用新主题的默认值。参数只接受上表的取值，不接受 CSS 或 HTML。
- 配色随亮暗切换；字体与宽度只作用于网站正文，不改变幻灯片画布。
- `site.nav`、`footer`、`head`、`sitemap`、`lang`、`locales` 照常有效。导航中的站内绝对路径会加上 `site.base`。
- 文稿列表页的介绍取自工作区 `title` 与 `site.head.description`。
- 修改后重启 `pnpm serve`，或重新 `pnpm build`。

## 3. 首页

`site.landing` 有三种写法，只能选一种；`site.home`（把根页重定向到某份文稿）不能与 `landing` 同时配置。没有 `landing` 时根页按主题显示文稿列表；有首页时完整列表在 `documents.html`。

### 3.1 JSON 首页

`site.landing.source` 指向工作区内的首页文件（不列入 `documents`），也可以把同样的对象直接写在 `site.landing` 中。

```json
{
  "schemaVersion": 1,
  "title": "我的课程",
  "hero": {
    "eyebrow": "持续更新",
    "title": "从一个示例开始",
    "description": "按自己的节奏阅读、观看与练习。",
    "actions": [{ "text": "开始阅读", "link": "/intro/", "variant": "primary" }]
  },
  "sections": [
    { "id": "highlights", "type": "features", "title": "课程亮点", "items": [{ "title": "随时阅读", "description": "每份文稿都有独立网址。" }] },
    { "id": "lessons", "type": "documents", "title": "课程目录" }
  ]
}
```

`title` 与 `sections` 必填。`hero` 可有 `eyebrow`、`title`、`description`、`image`、`imageAlt`、`actions`；每个操作有 `text`、`link`，可选 `variant: primary | secondary`。`sections` 按顺序显示，每项有唯一 `id`、一个 `type`，可带 `title`、`description`：

| `type` | 字段 | 用途 |
|---|---|---|
| `features` | `items: [{ title, description?, image?, imageAlt?, link? }]` | 特性或亮点 |
| `text` | `body` | 介绍文字 |
| `media` | `kind: image\|video`、`src`，可选 `alt`、`poster`、`captions`（语言到 VTT 的映射） | 图片或视频 |
| `documents` | 可选 `tags`、`directories` | 已发布文稿列表 |
| `cta` | `title`、`actions` | 行动入口 |

本地媒体在 JSON 文件中相对该文件定位，内联配置中相对工作区根目录定位。工作区的 `public/` 按原路径发布到网站根（如 `/files/slides.pptx`）。

### 3.2 HTML 模板首页

```yaml
site:
  landing:
    template: ./site/home.html
```

模板的 HTML、CSS、JavaScript 与本地素材经 Vite 构建，成为网站的 `index.html`，不套用查看器外壳。页面中注入 `<script id="presmium-site-data" type="application/json">`，内容为面向读者的网站与文稿集合：

```js
const site = JSON.parse(document.getElementById('presmium-site-data').textContent)
// site: { schemaVersion, title, base, lang, documents: [{ id, title, href, description?, lang?, tags?, pages? }] }
for (const doc of site.documents) list.append(Object.assign(document.createElement('a'), { href: doc.href, textContent: doc.title }))
```

用 `href` 可保留部署基础路径。数据不含运行快照、诊断与配置。`pnpm serve` 中刷新首页会重建模板，没有热更新。

### 3.3 文稿作为首页

```yaml
site:
  landing: welcome
```

`welcome` 是 `documents` 中的文稿目录，它的全部页面额外显示在网站根页，原 `/welcome/` 地址保留。

## 4. 文稿的页面布局

在 `lecture.json` 中设置 `metadata.renderers.web.layout`：

| 布局 | 行为 |
|---|---|
| `article` | 默认，按主题显示导航与大纲 |
| `landing` | 全部页面合成一张 `index.html`，单栏全宽，不显示目录与翻页 |
| `wide` | 放宽正文，不显示右侧大纲 |

布局不改变页面、内容块与步骤的身份。每份译本使用自己的 `layout`，未配置时为 `article`。整个工作区构建时主题由 `site` 决定；单独构建一份文稿时在 `metadata.renderers.web` 中写 `theme` 与 `params`：

```json
{ "metadata": { "renderers": { "web": { "theme": "showcase", "params": { "accent": "violet" }, "layout": "landing" } } } }
```

```sh
presmium build welcome --to web
```

## 5. 发布到 GitHub Pages

1. 把项目推送到 GitHub 仓库。
2. 在 Settings → Pages → Build and deployment → Source 中选择 GitHub Actions。
3. 运行 `pages.yml` 或推送到它配置的分支。工作流用 `configure-pages` 取得基础路径并写入 `site.base`，运行 `pnpm build`，上传并部署 `dist/web/`。
4. 打开首页、内页直链、搜索与媒体，确认都在部署地址下工作。

每个页面有自己的 HTML 文件，直链不依赖 SPA 回退，任何静态托管都可部署 `dist/web/`。Pages 只托管静态文件：阅读、步骤、动画与媒体可以运行，需要服务端的能力（代码执行等）不可用。

## 6. 示例与范围

`examples/presmium-site` 是一个用 HTML 模板首页的产品站点，含宣传片与一份小课，并展示如何把放映产物合并进静态站点（`tools/build.mjs`）；在该目录运行 `pnpm build` 或 `pnpm dev`。

Office 文件可以作为链接发布和下载，不导入为可编辑文稿，也没有在线预览。主题不提供主题市场、自定义 React 外壳或工作台中的主题选择面板。
