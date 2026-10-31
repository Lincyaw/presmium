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
| `course` | 课程 | 有序课程目录 | 左侧课程名与编号的文稿目录 |
| `docs` | 文档 | 文稿卡片网格 | 左侧站内文稿，右侧本页大纲 |
| `showcase` | 展示 | 网站介绍与大展示卡片 | 与 `docs` 相同；冷色背景与半透明页头，与产品首页一致 |

每份文稿是一个完整的网页，所有节依次排列，与静态建站工具中一个源文件一页相同。左侧列出工作区的文稿，按每份文稿 `metadata.tags` 的第一个标签分组、按 `documents` 中的顺序排列，并展开当前文稿的各章；右侧“本页大纲”列出各节，章内的节缩进。节标题在指针移过时显示可复制的锚点 `#`。早先按章拆出的页面地址（如 `sort.html`）构建为跳转页，打开后到达整页中该章的位置。窄屏时两侧目录收进“目录”与“本页大纲”两个按钮。

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

### 2.1 工作区主题

`site.theme` 也可以写主题目录（`./theme`，相对工作区；单独构建的文稿相对 `lecture.json`）或已安装的主题包名。主题包的 `package.json` 用 `presmium.theme` 指向含 `theme.json` 的目录，没有时取包的根目录。

```json
{
  "schemaVersion": 1,
  "name": "pixel",
  "extends": "docs",
  "params": { "typography": "sans" },
  "tokens": { "font-sans": "'IBM Plex Sans', system-ui, sans-serif", "color-bg": "#f6f6f1", "color-accent": "#2546b8", "radius-control": "0" },
  "dark": { "color-bg": "#121216", "color-accent": "#8ea6ff" },
  "fonts": ["https://fonts.googleapis.com/css2?family=Silkscreen&display=swap"],
  "styles": ["./pixel.css"]
}
```

| 字段 | 含义 |
|---|---|
| `name` | 必填，小写字母、数字与 `-`；页面带 `data-pm-site-theme-name="<name>"`，文件发布在 `_theme/<name>/` |
| `extends` | 使用哪个内置主题的布局与默认参数，默认 `docs` |
| `params` | 上表的参数，作为默认值；`site.params` 中显式写的优先 |
| `tokens` | 设计令牌（`packages/design/src/tokens.css` 中的名字去掉 `--pm-`）；颜色与阴影是亮色的值，其余两种外观共用 |
| `dark` | 暗色的颜色与阴影；没写的沿用内置暗色 |
| `fonts` | 字体样式表的 `https:` 地址 |
| `styles` | 主题目录内的 CSS 文件，可用相对 `url()` 引用目录中的字体与图片 |

- 构建把主题目录（不含 `node_modules` 与点开头的文件）复制到 `_theme/<name>/`，并由 `tokens` 与 `dark` 生成 `presmium-tokens.css`；每个页面在查看器样式之后依次链接 `fonts`、生成的令牌与 `styles`。
- 令牌名不存在、`dark` 中写了颜色与阴影以外的令牌、值中有 `;`、`{`、`}`、`<`、`>`，或样式表不在主题目录内时，构建与预览报错，并指出主题文件与字段。
- `styles` 用 `[data-pm-site-theme-name='<name>']` 限定规则，内置主题与工作台不受影响。
- HTML 模板首页的 `<head>` 开头由构建链接这些样式表，模板自己的样式在其后；模板在根元素或 `<body>` 上写同一属性，即可与文稿页共用一套外观。网站数据中的 `theme: { name, stylesheets }` 给出同样的信息。

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
// site: { schemaVersion, title, base, lang, documents: [{ id, title, href, slides?, description?, lang?, tags?, pages? }], theme?: { name, stylesheets } }
for (const doc of site.documents) list.append(Object.assign(document.createElement('a'), { href: doc.href, textContent: doc.title }))
```

用 `href` 可保留部署基础路径；文稿有放映时 `slides` 是它的地址。数据不含运行快照、诊断与配置。模板 import 的 PNG 与 JPEG 按 4.2 节编码为 WebP。`pnpm serve` 中刷新首页会重建模板，没有热更新。

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

### 4.1 放映与讲授视频

文稿的 `metadata.renderers` 写了 `slides` 或 `lecture` 时，工作区构建在它的网页旁一并构建：放映在 `<文稿目录>/slides/`，讲授的时间线、字幕与语音在 `<文稿目录>/lecture/`，网页与放映互相链接。首页模板可以用 iframe 嵌入 `<slides>?view=present&track=<讲授>&autoplay` 直接播放讲授，`section=<节>&step=<序号>` 从某一步开始，由浏览器按观众的分辨率实时绘制。浏览器不允许自动播放时，放映停在开头，中央显示一个大的播放按钮，读者点一下即开始。

放映在 iframe 中时向上层页面发送消息 `{ type: 'presmium:state', drawn, section, step, lecture }`：`drawn` 表示当前一步的场景已绘制，`lecture` 是讲授的状态（`loading`、`waiting` 等待读者点播放、`playing`、`paused`、`failed`）。模板可直接用 `@lincyaw/presmium/site` 的两个函数：

```ts
import { prefetchPresentation, whenPresentationReady } from '@lincyaw/presmium/site'

void prefetchPresentation(doc.slides)   // 预取放映页面要预加载的文件，读者开启省流量时不取
const stop = whenPresentationReady(frame, () => cover.remove(), { lecture: true })   // 场景已绘制、讲授已就绪时调用一次
```

放映与它的网页使用同一个工作区主题。

### 4.2 构建时的体积优化

- 网站的页面与它的放映共用一份查看器（`_app/<键>/`），读者在一个站点里只下载一次。
- 文稿发布的位图（`media/` 下的图片、场景代码与首页模板 import 的图片）大于 48 KB 时在发布时编码为 WebP，以 `.webp` 文件名写入，宽度不超过 2400 像素：PNG 用近无损，照片用有损。编码结果按图片内容缓存在 `.presmium/images/`，再次构建不重新编码。`public/` 中的文件与页面头部用于链接预览的图片按原样发布。场景代码用 `import` 引用图片（`import figure from './x.png'` 或 `x.png?url`）；`new URL(…, import.meta.url)` 引用的图片按原样发布。
- 页面在加载查看器的同时预加载文稿数据与代码；放映还按构建清单预加载场景代码、它们引用的共享模块，以及放映插件的浏览器与查看器模块。
- 页面头部有一段脚本：部署更新后，浏览器缓存的旧页面加载不到旧版本的模块时，页面在线时重新加载一次（30 秒内至多一次）。
- `presmium serve` 给讲授的语音与配乐发 `Cache-Control: private, no-cache` 与按内容的 `ETag`：浏览器保留文件，每次确认未变时得到 304，支持按 Range 分段读取。

## 5. 发布到 GitHub Pages

1. 把项目推送到 GitHub 仓库。
2. 在 Settings → Pages → Build and deployment → Source 中选择 GitHub Actions。
3. 运行 `pages.yml` 或推送到它配置的分支。工作流用 `configure-pages` 取得基础路径并写入 `site.base`，运行 `pnpm build`，上传并部署 `dist/web/`。
4. 打开首页、内页直链、搜索与媒体，确认都在部署地址下工作。

每个页面有自己的 HTML 文件，直链不依赖 SPA 回退，任何静态托管都可部署 `dist/web/`。Pages 只托管静态文件：阅读、步骤、动画与媒体可以运行，需要服务端的能力（代码执行等）不可用。

## 6. 示例与范围

`examples/gallery` 是统一示例工作区，HTML 产品首页展示傅里叶小课与宣传片；`tools/build.mjs` 合并网页、放映和讲授产物。在该目录运行 `pnpm build` 或 `pnpm dev`；站点说明见 `PRODUCT-SITE.md`。

Office 文件可以作为链接发布和下载，不导入为可编辑文稿，也没有在线预览。工作区主题只改变外观（令牌与样式），不替换网站外壳的 React 组件；工作台中没有主题选择面板。
