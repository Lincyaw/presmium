import '@lincyaw/design/design.css'
import { iconMarkup } from '@lincyaw/design'
import './style.css'
import { pathData, shapeSeries, trace } from '../learn/scenes/epicycles.ts'
import type { Point } from '../learn/scenes/epicycles.ts'

type Locale = 'zh-CN' | 'en'
const messages = {
  'zh-CN': {
    title: '再复杂的东西，也能讲明白', description: '写一份文稿，现场讲、做成网站、导出视频都能用。Presmium 是开源的演示工具。',
    nav: ['功能', '影片', '示例', 'GitHub'], mainNav: '主导航', menu: '打开菜单', closeMenu: '关闭菜单', ready: '可以开讲了', start: '开始使用',
    eyebrow: '给每个需要把事情讲清楚的人', hero: '写一份文稿，\n讲台、网页、视频都能用。',
    lead: '课程、论文报告、技术分享、产品发布……公式、代码、数据和动画写在同一份文稿里，想改哪儿，圈出来跟 AI 说一句。\n现场一步一步讲，会后做成网站，也能导出视频。',
    watch: '看 60 秒影片', source: '打开示例文稿', sourceLabel: '一份文稿，三种用法',
    file: '转动的圆，画出一个音符', sourceNote: '傅里叶级数 · 公式 · 代码 · 动画', formats: ['网站', '放映', '视频'],
    statement: '把时间花在讲清楚上。', substatement: '排版、动画和发布交给它',
    features: [
      ['01', '想改哪儿，圈出来说一句', '在文稿里选中一段，写一条批注，交给 AI 去改。每次修改都记在版本历史里，不满意随时撤消。', 'comment'],
      ['02', '一步一步讲', '把复杂的过程拆成几步，按一下走一步，公式、数据和图一起变。听众没跟上，就退回上一步再讲。', 'steps'],
      ['03', '讲完还能接着看', '同一份文稿可以做成网站、幻灯片和视频。现场讲过的内容，听众会后能自己再看一遍。', 'website'],
    ],
    filmTag: '一个例子', filmTitle: '比如，一堂难讲的课。', filmLead: '学生深夜发来一个问题。老师在文稿里圈出一段，让 AI 加上动画；第二天上课一步一步讲，课后把同一份文稿做成网站、导出视频。换成论文报告、技术分享或产品发布，做法也一样。影片是英文的；下面播放的就是它的文稿本身，画面由浏览器实时画出来，没有经过视频压缩。',
    filmHint: '60 秒 · 实时播放', filmPlay: '播放影片', filmDownload: '下载视频文件', filmSource: '打开例子里的那堂课', filmScript: '影片的文稿',
    chapters: ['深夜的提问', '换个讲法', '现场讲', '会后'],
    galleryTag: '示例', galleryTitle: '示例库',
    galleryLead: '功能合集逐页演示单项功能；教程按步骤介绍工作台中的操作；课程、影片与动画参考展示完整作品。每份示例均可在网页中阅读，或在工作台中打开编辑。',
    galleryAll: '查看全部示例', all: '全部', count: (n: number) => `${n} 份`, pages: (n: number) => `${n} 页`, open: '打开', empty: '该类别暂无示例。', filters: '按类别筛选',
    categories: {
      collections: ['功能合集', '每页演示一项功能，涵盖内容排版、步骤与动画、代码运行、课堂互动、阅读与发布。'],
      tutorials: ['教程', '按编号步骤介绍工作台中的编辑、讲稿、配音与导出。'],
      courses: ['课程', '带讲解的完整课程，可放映，也可导出为讲授视频。'],
      films: ['影片', '由文稿生成的产品短片。'],
      animation: ['动画参考', '按场景整理的动画：算法、数据、数学、文字、标注、产品演示、转场与三维等，可直接复用。'],
    },
    collectionTag: '这个网站也是用 Presmium 做的', collectionTitle: '做一个自己的网站',
    collectionLead: '首页想怎么设计都行，文稿一份一份往里加。自带课程、文档、展示三种主题，做好的网站可以直接放到 GitHub Pages 这类静态托管上。',
    cards: [
      ['示例文稿', '同一个例子，自己走一遍', '自己按步骤看圆一个个加上去，曲线怎样越来越像音符，也可以直接切到放映。', '打开示例', 'document'],
      ['独立首页', '首页想怎么做就怎么做', '这个页面是单独用 HTML、CSS 和 TypeScript 写的，和文稿一起由 Presmium 构建。', '在 GitHub 查看首页源码', 'website'],
      ['静态发布', '放到自己的网址上', '整个网站连同文稿、视频、字幕和素材一起构建，放到自己的地址上就能打开。', '开始建站', 'export'],
    ],
    faqTitle: '开始之前，你可能想知道',
    faqs: [
      ['首页一定要是一份文稿吗？', '不用。可以用站点 JSON 拼几个内容区块，也可以用 HTML、CSS、JavaScript 随意写；文稿还是写在 lecture.json 里。'],
      ['能把整个工作区做成网站吗？', '能。构建时会把工作区里的文稿都收进来，每份一个地址，自动生成导航，用到的素材也一起打包。'],
      ['网站能放视频吗？', '能。可以用浏览器自带的播放器放视频、加字幕；也可以像这里一样，直接嵌入文稿的放映页实时播放。这支影片本身就是一份 Presmium 文稿，下载的视频文件也是从它导出的。'],
      ['手上已经有内容，怎么开始？', '先建一个站点、选好主题，再把文稿放进去。想自己设计首页，就把 site.landing 指向你的首页文件。'],
    ],
    cta: '下一次要讲的，就用它来做。', ctaLead: '开源，免费，装好就能用。', install: '第一次用，先安装', copy: '复制命令', copied: '已复制',
    footer: '用 Presmium 制作 · 开源的演示工具', appearance: '切换亮暗外观', language: 'English', skip: '跳到正文',
  },
  en: {
    title: 'Make complex things clear', description: 'Write one document and present it live, publish it as a website, or export it as a video. Presmium is an open-source presentation tool.',
    nav: ['Features', 'Watch the film', 'Examples', 'GitHub'], mainNav: 'Main navigation', menu: 'Open menu', closeMenu: 'Close menu', ready: 'Ready to present', start: 'Get started',
    eyebrow: 'For anyone with something to explain', hero: 'Write it once.\nPresent it anywhere.',
    lead: 'Lectures, paper talks, tech talks, product launches. Equations, code, data and animation live in one document; to change something, mark it and tell the AI.\nPresent it step by step, then share it as a website or a video.',
    watch: 'Watch the 60-second film', source: 'Open the example', sourceLabel: 'One document, three ways to use it',
    file: 'Turning circles draw a note', sourceNote: 'Fourier series · Math · Code · Animation', formats: ['Website', 'Slides', 'Video'],
    statement: 'Spend your time on making it clear.', substatement: 'Layout, animation and publishing, taken care of',
    features: [
      ['01', 'Mark it, say what you want', 'Select a passage, leave a comment, and let the AI make the change. Every edit lands in the version history, so you can undo it.', 'comment'],
      ['02', 'One step at a time', 'Break a complex process into steps. Each click moves one step, and the equation, data and plot change together. Lost the room? Go back a step.', 'steps'],
      ['03', 'Still there afterwards', 'The same document becomes a website, slides and a video, so your audience can go through it again on their own.', 'website'],
    ],
    filmTag: 'One example', filmTitle: 'Take one hard lesson.', filmLead: 'A student asks a question late at night. The teacher marks a paragraph and asks the AI for an animation, walks the class through it step by step the next day, then shares the same document as a website and a video. A paper talk, a tech talk or a product launch works the same way. What plays below is the film\'s own document, drawn live by your browser with no video compression.',
    filmHint: '60 seconds · played live', filmPlay: 'Play the film', filmDownload: 'Download video file', filmSource: 'Open the lesson from the film', filmScript: 'The film\'s document',
    chapters: ['A question at night', 'Another way to explain', 'Presenting', 'Afterwards'],
    galleryTag: 'Examples', galleryTitle: 'Example library',
    galleryLead: 'Feature collections demonstrate one feature per page; tutorials walk through the workbench step by step; courses, films and animation references show complete work. Every example can be read on the web or opened for editing in the workbench.',
    galleryAll: 'Browse all examples', all: 'All', count: (n: number) => `${n} ${n === 1 ? 'document' : 'documents'}`, pages: (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`, open: 'Open', empty: 'No examples in this category yet.', filters: 'Filter by category',
    categories: {
      collections: ['Feature collections', 'One feature per page: content and layout, steps and animation, code, classroom, reading and publishing.'],
      tutorials: ['Tutorials', 'Numbered steps through editing, scripts, voiceover and export in the workbench.'],
      courses: ['Courses', 'Complete narrated courses, ready to present or export as lecture videos.'],
      films: ['Films', 'Product films made from documents.'],
      animation: ['Animation references', 'Animations by scenario: algorithms, data, mathematics, text, annotation, product demos, transitions and 3D, ready to reuse.'],
    },
    collectionTag: 'This website was made with Presmium too', collectionTitle: 'Build your own website',
    collectionLead: 'Design the homepage however you like and keep adding documents. Choose a course, docs or showcase theme, and put the result on GitHub Pages or any static host.',
    cards: [
      ['Example document', 'Walk through the same example', 'Step through as circles are added and the curve closes in on a musical note, or switch straight to the slides.', 'Open the example', 'document'],
      ['Custom homepage', 'Make the homepage your own', 'This page is plain HTML, CSS and TypeScript, built together with the documents by Presmium.', 'View the homepage source on GitHub', 'website'],
      ['Static publishing', 'Put it at your own address', 'The whole site is built with its documents, videos, captions and assets, ready to serve from your own address.', 'Create a site', 'export'],
    ],
    faqTitle: 'A few things before you begin',
    faqs: [
      ['Does the homepage have to be a document?', 'No. Compose sections in site JSON, or write it freely in HTML, CSS and JavaScript. Documents stay in lecture.json.'],
      ['Can I turn a whole workspace into a website?', 'Yes. The build collects every document in the workspace, gives each its own address, generates the navigation and bundles the assets they use.'],
      ['Can the website play video?', 'Yes. Play videos with captions in the browser\'s own player, or, as here, embed a document\'s presentation and play it live. This film is itself a Presmium document, and the downloadable video was exported from it.'],
      ['I already have material. How do I start?', 'Create a site, pick a theme and add your documents. For your own homepage, point site.landing at your homepage file.'],
    ],
    cta: 'Make your next talk with it.', ctaLead: 'Open source, free, and ready once installed.', install: 'First time? Install Presmium', copy: 'Copy command', copied: 'Copied',
    footer: 'Made with Presmium · An open-source presentation tool', appearance: 'Switch appearance', language: '中文', skip: 'Skip to content',
  },
} as const

const site = JSON.parse(document.getElementById('presmium-site-data')?.textContent || '{}') as { base?: string, documents?: { id: string, href: string, title: string, description?: string, tags?: string[], pages?: number }[] }
const base = site.base || new URL('./',document.baseURI).pathname
// The page speaks the visitor's language: `?lang=` first, then the choice made on this page before, then the browser's.
const LOCALE_KEY = 'presmium-site-locale'
const asLocale = (value: string | null | undefined): Locale | undefined => !value ? undefined : value.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
function remembered(): Locale | undefined {
  try { return asLocale(localStorage.getItem(LOCALE_KEY)) } catch { return undefined }
}
let locale: Locale = asLocale(new URL(location.href).searchParams.get('lang')) ?? remembered() ?? asLocale(navigator.languages?.[0] ?? navigator.language) ?? 'en'
const repoUrl = 'https://github.com/Lincyaw/presmium'
const sourceUrl = `${repoUrl}/tree/main/examples/gallery/site`
const docUrl = site.documents?.find(doc => doc.id === 'learn')?.href || `${base}learn/`
type SiteDocument = NonNullable<typeof site.documents>[number]
// A document's first tag that names a category files it in the example library; the rest are its topics.
const CATEGORIES = [['collections', '功能合集', 'overview'], ['tutorials', '教程', 'edit'], ['courses', '课程', 'notebook'], ['films', '影片', 'video'], ['animation', '动画参考', 'sparkle']] as const
type Category = typeof CATEGORIES[number][0]
// Within a category the library follows this reading order; any other document keeps the site's order after them.
const ORDER = ['showcase-content', 'showcase-steps', 'showcase-code', 'showcase-classroom', 'showcase-publishing', 'tutorial-editing', 'tutorial-narration', 'learn', 'bubble-sort', 'libraries', ...['algorithms', 'data', 'math-ml', 'text', 'emphasis', 'structure', 'product', 'transitions', 'paths-3d', 'craft', 'timeline', 'lengths', 'story', 'films'].map(name => `animation-library/${name}`)]
const rank = (doc: SiteDocument) => { const at = ORDER.indexOf(doc.id); return at === -1 ? ORDER.length : at }
const documents = (site.documents ?? []).map((doc, index) => ({ doc, index })).sort((a, b) => rank(a.doc) - rank(b.doc) || a.index - b.index).map(({ doc }) => doc)
const categoryOf = (doc: SiteDocument) => CATEGORIES.find(([, tag]) => doc.tags?.includes(tag))?.[0]
const inCategory = (category: Category) => documents.filter(doc => categoryOf(doc) === category)
const GALLERY = /^#\/examples(?:\/([a-z]+))?$/
const route = () => { const match = GALLERY.exec(location.hash); return match ? { gallery: true, category: CATEGORIES.find(([id]) => id === match[1])?.[0] } : { gallery: false, category: undefined } }
const promoUrl = site.documents?.find(doc => doc.id === 'promo')?.href || `${base}promo/`
const command = 'presmium new my-site --type site'
// The film is played from its source: the film document's presentation with its lecture, drawn live by the browser
// at the viewer's resolution. Each chapter starts at a step of a section: the film from the studio on is one section
// whose steps are the studio, the class, the website and the video.
const CHAPTERS = [['film-question', 0, '00:00'], ['film-ask', 0, '00:13'], ['film-ask', 1, '00:29'], ['film-ask', 2, '00:41']] as const
function playFilm(section: string, step = 0) {
  const frame = document.getElementById('film-frame')!
  let live = frame.querySelector('iframe')
  if (!live) {
    live = document.createElement('iframe')
    live.className = 'film-live'
    live.title = messages[locale].filmTitle
    live.allow = 'autoplay; fullscreen'
    frame.replaceChildren(live)
  }
  live.src = `${promoUrl}slides/?view=present&track=script&section=${section}&step=${step}&autoplay`
  live.focus()
}
const icon = (name: Parameters<typeof iconMarkup>[0]) => iconMarkup(name)
// The example lesson in miniature: the note's outline and the curves its 2, 8 and 64 largest circles draw, computed
// from the lesson's own Fourier series.
const chart = () => {
  const s = shapeSeries('note')
  const notes = [2, 8, 64].map((N, i) => {
    const place = ([x, y]: Point): Point => [60 + i * 100 + x * 100, 62 + y * 100]
    return `<path class="plot-target" stroke-dasharray="3 3" d="${pathData(s.points, place, true)}"/><path class="plot-trace" d="${pathData(trace(s, N, 400), place)}"/><text x="${60 + i * 100}" y="130" text-anchor="middle">N = ${N}</text>`
  })
  return `<svg class="fourier-plot" viewBox="0 0 320 140" aria-hidden="true">${notes.join('')}</svg>`
}
const button = (href: string, label: string, primary = false) => `<a class="pm-ui-button${primary ? ' pm-ui-button--primary' : ''}" href="${href}">${label}${icon('chevron-right')}</a>`

function render() {
  const t = messages[locale], view = route()
  document.documentElement.lang = locale
  document.title = view.gallery ? `${t.galleryTitle} · Presmium` : `Presmium · ${t.title}`
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.description)
  document.getElementById('app')!.innerHTML = `
    <a class="skip pm-ui-link" href="#main">${t.skip}</a>
    <div class="ambient" aria-hidden="true"><img class="ambient-blue" src="${new URL('./assets/ambient-blue.svg', import.meta.url)}" alt=""><img class="ambient-teal" src="${new URL('./assets/ambient-teal.svg', import.meta.url)}" alt=""><img class="ambient-violet" src="${new URL('./assets/ambient-violet.svg', import.meta.url)}" alt=""></div>
    <header class="topbar"><a class="wordmark" href="${base}">${icon('slides')}<span>Presmium</span></a>
      <nav id="site-nav" aria-label="${t.mainNav}"><a href="#features">${t.nav[0]}</a><a href="#film">${t.nav[1]}</a><a href="#/examples"${view.gallery ? ' aria-current="page"' : ''}>${t.nav[2]}</a><a href="${repoUrl}" target="_blank" rel="noopener">${t.nav[3]}</a></nav>
      <div class="nav-actions"><button class="pm-ui-icon-button pm-ui-icon-button--ghost" id="appearance" aria-label="${t.appearance}">${icon('contrast')}</button><button class="pm-ui-button pm-ui-button--ghost" id="language">${t.language}</button>${button('#start',t.start,true)}<button class="pm-ui-icon-button pm-ui-icon-button--ghost menu-button" id="menu" aria-label="${t.menu}" aria-expanded="false" aria-controls="site-nav">${icon('menu')}</button></div>
    </header>
    <main id="main">${view.gallery ? gallery(view.category) : home()}</main><footer class="wrap"><a class="wordmark" href="${base}">${icon('slides')}<span>Presmium</span></a><p>${t.footer}</p><a class="pm-ui-link" href="https://github.com/Lincyaw/presmium">GitHub ${icon('external')}</a></footer>`
  bind(t)
}
function home() {
  const t = messages[locale]
  return `
      <section class="hero wrap">
        <div class="hero-copy"><p class="eyebrow">${t.eyebrow}</p><h1>${t.hero.replace('\n','<br>')}</h1><p class="lead">${t.lead.replace('\n','<br>')}</p><div class="hero-actions">${button('#film',t.watch,true)}${button(docUrl,t.source)}</div><p class="hero-note">${t.sourceLabel}</p></div>
        <div class="hero-art" role="img" aria-label="${t.sourceLabel}"><div class="document-card"><div class="window-bar"><span>lecture.json</span>${icon('document')}</div><span class="tiny-label">PRESMIUM / 001</span><h2>${t.file}</h2><p>${t.sourceNote}</p><div class="content-lines"><i></i><i></i></div>${chart()}<div class="document-bottom"><span>${icon('check')} ${t.ready}</span><span>01 / 03</span></div></div><div class="output-row">${t.formats.map((f,i)=>`<div class="output-card">${icon((['website','slides','video'] as const)[i]!)}<span>${f}</span><b>0${i+1}</b></div>`).join('')}</div><div class="art-caption"><span class="status-dot"></span>${t.sourceLabel}</div></div>
      </section>
      <section class="features wrap" id="features"><div class="section-heading"><p class="eyebrow">PRESMIUM / ${t.substatement}</p><h2>${t.statement}</h2></div><div class="feature-grid">${t.features.map(([n,title,body,i])=>`<article><div class="feature-top"><span>${n}</span>${icon(i as Parameters<typeof iconMarkup>[0])}</div><h3>${title}</h3><p>${body}</p></article>`).join('')}</div></section>
      <section class="film-section wrap" id="film"><div class="section-heading film-heading"><div><p class="eyebrow">${t.filmTag}</p><h2>${t.filmTitle}</h2></div><p>${t.filmLead}</p></div><div class="player-frame" id="film-frame"><button class="film-poster" id="film-play" aria-label="${t.filmPlay}"><img src="${base}presmium-60s-poster.jpg" alt=""><span class="film-play">${icon('play')}</span></button></div><div class="film-meta"><span>${t.filmHint}</span><div><a class="pm-ui-link" href="${base}presmium-60s.webm" download>${t.filmDownload}${icon('download')}</a><a class="pm-ui-link" href="${docUrl}">${t.filmSource}${icon('chevron-right')}</a><a class="pm-ui-link" href="${promoUrl}">${t.filmScript}${icon('chevron-right')}</a></div></div><div class="chapter-list">${t.chapters.map((c,i)=>`<button class="pm-ui-button pm-ui-button--ghost" data-section="${CHAPTERS[i]![0]}" data-step="${CHAPTERS[i]![1]}"><span>${CHAPTERS[i]![2]}</span>${c}</button>`).join('')}</div></section>
      <section class="collection wrap" id="examples"><div class="section-heading"><p class="eyebrow">${t.galleryTag}</p><h2>${t.galleryTitle}</h2><p class="section-lead">${t.galleryLead}</p></div><div class="category-grid">${CATEGORIES.filter(([id]) => inCategory(id).length).map(([id,,i])=>`<a class="category-card" href="#/examples/${id}"><div class="card-label">${icon(i)}<span>${t.count(inCategory(id).length)}</span></div><h3>${t.categories[id][0]}</h3><p>${t.categories[id][1]}</p></a>`).join('')}</div><div class="section-actions">${button('#/examples',t.galleryAll)}</div></section>
      <section class="collection wrap" id="source"><div class="section-heading"><p class="eyebrow">${t.collectionTag}</p><h2>${t.collectionTitle}</h2><p class="section-lead">${t.collectionLead}</p></div><div class="collection-grid">${t.cards.map(([tag,title,body,label,i],index)=>`<article><div class="card-label">${icon(i as Parameters<typeof iconMarkup>[0])}<span>${tag}</span></div><h3>${title}</h3><p>${body}</p><a class="pm-ui-link" href="${[docUrl,sourceUrl,'#start'][index]}">${label}${icon('chevron-right')}</a></article>`).join('')}</div></section>
      <section class="faq wrap"><h2>${t.faqTitle}</h2><div>${t.faqs.map(([q,a],i)=>`<details${i===0?' open':''}><summary>${q}${icon('plus')}</summary><p>${a}</p></details>`).join('')}</div></section>
      <section class="start wrap" id="start"><p class="eyebrow">PRESMIUM</p><h2>${t.cta}</h2><p>${t.ctaLead}</p><div class="command"><code>${command}</code><button class="pm-ui-icon-button pm-ui-icon-button--ghost" id="copy" aria-label="${t.copy}">${icon('copy')}</button></div><span id="copy-status" role="status"></span><p class="install">${t.install} <code>pnpm add -g @lincyaw/presmium</code></p></section>
`
}
// The example library: every published document filed under its category, one category at a time or all of them.
function gallery(category?: Category) {
  const t = messages[locale]
  const card = (doc: SiteDocument) => { const id = categoryOf(doc)!, topics = (doc.tags ?? []).filter(tag => !CATEGORIES.some(([, name]) => name === tag)); return `<a class="example-card" href="${doc.href}"><div class="example-thumb"><span>${t.categories[id][0]} / ${String(inCategory(id).indexOf(doc) + 1).padStart(2, '0')}</span>${icon(CATEGORIES.find(([key]) => key === id)![2])}</div><div class="example-body"><h3>${doc.title}</h3>${doc.description ? `<p>${doc.description}</p>` : ''}<div class="example-meta">${doc.pages ? `<span>${t.pages(doc.pages)}</span>` : ''}${topics.slice(0, 3).map(topic => `<span>${topic}</span>`).join('')}<b>${t.open}${icon('chevron-right')}</b></div></div></a>` }
  const group = (id: Category, heading: boolean) => { const docs = inCategory(id); return docs.length ? `<section class="example-group" aria-label="${t.categories[id][0]}">${heading ? `<div class="example-group-heading"><h2>${t.categories[id][0]}</h2><p>${t.categories[id][1]}</p></div>` : ''}<div class="example-grid">${docs.map(card).join('')}</div></section>` : '' }
  const filters = [['', t.all, documents.filter(categoryOf).length] as const, ...CATEGORIES.map(([id]) => [id, t.categories[id][0], inCategory(id).length] as const).filter(([, , n]) => n)]
  return `<section class="gallery wrap"><div class="section-heading"><p class="eyebrow">${t.galleryTag}</p><h1>${t.galleryTitle}</h1><p class="section-lead">${t.galleryLead}</p></div>
    <div class="pm-ui-segmented gallery-filters" role="group" aria-label="${t.filters}">${filters.map(([id, label, n]) => `<a class="pm-ui-segmented__option" href="#/examples${id ? `/${id}` : ''}" aria-pressed="${(category ?? '') === id}">${label}<span>${n}</span></a>`).join('')}</div>
    ${category ? group(category, false) || `<p class="section-lead">${t.empty}</p>` : CATEGORIES.map(([id]) => group(id, true)).join('')}</section>`
}
function bind(t: typeof messages[Locale]) {
  // On narrow screens the navigation folds into the menu button; choosing a link closes it again.
  const header = document.querySelector<HTMLElement>('.topbar')!, menu = document.getElementById('menu')!
  const fold = (open: boolean) => { header.toggleAttribute('data-open', open); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? t.closeMenu : t.menu); menu.innerHTML = icon(open ? 'close' : 'menu') }
  menu.onclick = () => fold(!header.hasAttribute('data-open'))
  header.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => fold(false)))
  header.onkeydown = event => { if (event.key === 'Escape' && header.hasAttribute('data-open')) { fold(false); menu.focus() } }
  document.getElementById('appearance')!.onclick = () => document.documentElement.classList.toggle('dark')
  document.getElementById('language')!.onclick = () => {
    locale = locale === 'zh-CN' ? 'en' : 'zh-CN'
    try { localStorage.setItem(LOCALE_KEY, locale) } catch { /* the choice still holds on this visit */ }
    const url = new URL(location.href); url.searchParams.set('lang',locale); history.replaceState(null,'',url)
    render(); document.getElementById('language')!.focus()
  }
  const copy = document.getElementById('copy')
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(command); document.getElementById('copy-status')!.textContent = t.copied }
    catch { const range = document.createRange(); range.selectNodeContents(document.querySelector('.command code')!); getSelection()?.removeAllRanges(); getSelection()?.addRange(range) }
  }
  const film = document.getElementById('film-play')
  if (film) film.onclick = () => playFilm(CHAPTERS[0][0])
  document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => button.onclick = () => playFilm(button.dataset.section!, Number(button.dataset.step)))
  syncMotion()
}
function syncMotion() {
  document.querySelectorAll<HTMLElement>('.ambient img').forEach(element => element.style.animationPlayState = document.hidden ? 'paused' : 'running')
}
document.addEventListener('visibilitychange',syncMotion)
// The library and the homepage share one page: switching between them renders the other view; any other anchor
// scrolls the homepage to it.
let shown = route().gallery
addEventListener('hashchange', () => {
  const view = route()
  if (view.gallery || view.gallery !== shown) { render(); scrollTo(0, 0) }
  shown = view.gallery
  if (!view.gallery && location.hash.length > 1) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()
})
document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)
render()
