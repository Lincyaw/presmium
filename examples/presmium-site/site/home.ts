import '@lincyaw/design/design.css'
import { iconMarkup } from '@lincyaw/design'
import './style.css'

type Locale = 'zh-CN' | 'en'
const messages = {
  'zh-CN': {
    title: '再复杂的东西，也能讲明白', description: '写一份文稿，现场讲、做成网站、导出视频都能用。Presmium 是开源的演示工具。',
    nav: ['功能', '看影片', '下载源码'], mainNav: '主导航', ready: '可以开讲了', start: '开始使用',
    eyebrow: '给每个需要把事情讲清楚的人', hero: '写一份文稿，\n讲台、网页、视频都能用。',
    lead: '课程、论文报告、技术分享、产品发布……公式、代码、数据和动画写在同一份文稿里，想改哪儿，圈出来跟 AI 说一句。\n现场一步一步讲，会后做成网站，也能导出视频。',
    watch: '看 60 秒影片', source: '打开示例文稿', sourceLabel: '一份文稿，三种用法',
    file: '看懂一次参数更新', sourceNote: '线性回归 · 公式 · 代码 · 曲线', formats: ['网站', '放映', '视频'],
    statement: '把时间花在讲清楚上。', substatement: '排版、动画和发布交给它',
    features: [
      ['01', '想改哪儿，圈出来说一句', '在文稿里选中一段，写一条批注，交给 AI 去改。每次修改都记在版本历史里，不满意随时撤消。', 'comment'],
      ['02', '一步一步讲', '把复杂的过程拆成几步，按一下走一步，公式、数据和图一起变。听众没跟上，就退回上一步再讲。', 'steps'],
      ['03', '讲完还能接着看', '同一份文稿可以做成网站、幻灯片和视频。现场讲过的内容，听众会后能自己再看一遍。', 'website'],
    ],
    filmTag: '一个例子', filmTitle: '比如，一堂难讲的课。', filmLead: '学生深夜发来一个问题。老师在文稿里圈出一段，让 AI 加上动画；第二天上课一步一步讲，课后把同一份文稿做成网站、导出视频。换成论文报告、技术分享或产品发布，做法也一样。影片是英文的；下面播放的就是它的文稿本身，画面由浏览器实时画出来，没有经过视频压缩。',
    filmHint: '60 秒 · 实时播放', filmPlay: '播放影片', filmDownload: '下载视频文件', filmSource: '打开例子里的那堂课', filmScript: '影片的文稿',
    chapters: ['深夜的提问', '换个讲法', '现场讲', '会后'],
    collectionTag: '这个网站也是用 Presmium 做的', collectionTitle: '做一个自己的网站',
    collectionLead: '首页想怎么设计都行，文稿一份一份往里加。自带课程、文档、展示三种主题，做好的网站可以直接放到 GitHub Pages 这类静态托管上。',
    cards: [
      ['示例文稿', '同一个例子，自己走一遍', '自己按步骤看预测线和损失怎么变，也可以直接切到放映。', '打开示例', 'document'],
      ['独立首页', '首页想怎么做就怎么做', '这个页面是单独用 HTML、CSS 和 TypeScript 写的，和文稿一起由 Presmium 构建。', '下载这个网站的源码', 'website'],
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
    nav: ['Features', 'Watch the film', 'Download source'], mainNav: 'Main navigation', ready: 'Ready to present', start: 'Get started',
    eyebrow: 'For anyone with something to explain', hero: 'Write it once.\nPresent it anywhere.',
    lead: 'Lectures, paper talks, tech talks, product launches. Equations, code, data and animation live in one document; to change something, mark it and tell the AI.\nPresent it step by step, then share it as a website or a video.',
    watch: 'Watch the 60-second film', source: 'Open the example', sourceLabel: 'One document, three ways to use it',
    file: 'Inside a parameter update', sourceNote: 'Linear regression · Math · Code · Plots', formats: ['Website', 'Slides', 'Video'],
    statement: 'Spend your time on making it clear.', substatement: 'Layout, animation and publishing, taken care of',
    features: [
      ['01', 'Mark it, say what you want', 'Select a passage, leave a comment, and let the AI make the change. Every edit lands in the version history, so you can undo it.', 'comment'],
      ['02', 'One step at a time', 'Break a complex process into steps. Each click moves one step, and the equation, data and plot change together. Lost the room? Go back a step.', 'steps'],
      ['03', 'Still there afterwards', 'The same document becomes a website, slides and a video, so your audience can go through it again on their own.', 'website'],
    ],
    filmTag: 'One example', filmTitle: 'Take one hard lesson.', filmLead: 'A student asks a question late at night. The teacher marks a paragraph and asks the AI for an animation, walks the class through it step by step the next day, then shares the same document as a website and a video. A paper talk, a tech talk or a product launch works the same way. What plays below is the film\'s own document, drawn live by your browser with no video compression.',
    filmHint: '60 seconds · played live', filmPlay: 'Play the film', filmDownload: 'Download video file', filmSource: 'Open the lesson from the film', filmScript: 'The film\'s document',
    chapters: ['A question at night', 'Another way to explain', 'Presenting', 'Afterwards'],
    collectionTag: 'This website was made with Presmium too', collectionTitle: 'Build your own website',
    collectionLead: 'Design the homepage however you like and keep adding documents. Choose a course, docs or showcase theme, and put the result on GitHub Pages or any static host.',
    cards: [
      ['Example document', 'Walk through the same example', 'Step through how the prediction and the loss change, or switch straight to the slides.', 'Open the example', 'document'],
      ['Custom homepage', 'Make the homepage your own', 'This page is plain HTML, CSS and TypeScript, built together with the documents by Presmium.', 'Download this site\'s source', 'website'],
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

const site = JSON.parse(document.getElementById('presmium-site-data')?.textContent || '{}') as { base?: string, documents?: { id: string, href: string }[] }
const base = site.base || new URL('./',document.baseURI).pathname
// The page speaks the visitor's language: `?lang=` first, then the choice made on this page before, then the browser's.
const LOCALE_KEY = 'presmium-site-locale'
const asLocale = (value: string | null | undefined): Locale | undefined => !value ? undefined : value.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
function remembered(): Locale | undefined {
  try { return asLocale(localStorage.getItem(LOCALE_KEY)) } catch { return undefined }
}
let locale: Locale = asLocale(new URL(location.href).searchParams.get('lang')) ?? remembered() ?? asLocale(navigator.languages?.[0] ?? navigator.language) ?? 'en'
const sourceUrl = `${base}presmium-source.tar.gz`
const docUrl = site.documents?.find(doc => doc.id === 'learn')?.href || `${base}learn/`
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
const chart = () => {
  const xs = [-Math.SQRT2, -1 / Math.SQRT2, 0, 1 / Math.SQRT2, Math.SQRT2]
  const x = (value: number) => 160 + value * 84
  const y = (value: number) => 70 - value * 12
  return `<svg class="learning-plot" viewBox="0 0 320 140" aria-hidden="true"><path class="plot-axis" d="M24 70H296M160 12V128"/><path class="plot-prediction" d="M${x(-Math.SQRT2)} ${y(-Math.SQRT2 * 2.92)}L${x(Math.SQRT2)} ${y(Math.SQRT2 * 2.92)}"/>${xs.map(value => `<circle class="plot-datum" cx="${x(value)}" cy="${y(value*3)}" r="4"/>`).join('')}<text x="232" y="120">ŷ = 2.92x</text></svg>`
}
const button = (href: string, label: string, primary = false) => `<a class="pm-ui-button${primary ? ' pm-ui-button--primary' : ''}" href="${href}">${label}${icon('chevron-right')}</a>`

function render() {
  const t = messages[locale]
  document.documentElement.lang = locale
  document.title = `Presmium · ${t.title}`
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.description)
  document.getElementById('app')!.innerHTML = `
    <a class="skip pm-ui-link" href="#main">${t.skip}</a>
    <div class="ambient" aria-hidden="true"><img class="ambient-blue" src="${new URL('./assets/ambient-blue.svg', import.meta.url)}" alt=""><img class="ambient-teal" src="${new URL('./assets/ambient-teal.svg', import.meta.url)}" alt=""><img class="ambient-violet" src="${new URL('./assets/ambient-violet.svg', import.meta.url)}" alt=""></div>
    <header class="topbar"><a class="wordmark" href="${base}">${icon('slides')}<span>Presmium</span></a>
      <nav aria-label="${t.mainNav}"><a href="#features">${t.nav[0]}</a><a href="#film">${t.nav[1]}</a><a href="${sourceUrl}">${t.nav[2]}</a></nav>
      <div class="nav-actions"><button class="pm-ui-icon-button pm-ui-icon-button--ghost" id="appearance" aria-label="${t.appearance}">${icon('contrast')}</button><button class="pm-ui-button pm-ui-button--ghost" id="language">${t.language}</button>${button('#start',t.start,true)}</div>
    </header>
    <main id="main">
      <section class="hero wrap">
        <div class="hero-copy"><p class="eyebrow">${t.eyebrow}</p><h1>${t.hero.replace('\n','<br>')}</h1><p class="lead">${t.lead.replace('\n','<br>')}</p><div class="hero-actions">${button('#film',t.watch,true)}${button(docUrl,t.source)}</div><p class="hero-note">${t.sourceLabel}</p></div>
        <div class="hero-art" role="img" aria-label="${t.sourceLabel}"><div class="document-card"><div class="window-bar"><span>lecture.json</span>${icon('document')}</div><span class="tiny-label">PRESMIUM / 001</span><h2>${t.file}</h2><p>${t.sourceNote}</p><div class="content-lines"><i></i><i></i></div>${chart()}<div class="document-bottom"><span>${icon('check')} ${t.ready}</span><span>01 / 03</span></div></div><div class="output-row">${t.formats.map((f,i)=>`<div class="output-card">${icon((['website','slides','video'] as const)[i]!)}<span>${f}</span><b>0${i+1}</b></div>`).join('')}</div><div class="art-caption"><span class="status-dot"></span>${t.sourceLabel}</div></div>
      </section>
      <section class="features wrap" id="features"><div class="section-heading"><p class="eyebrow">PRESMIUM / ${t.substatement}</p><h2>${t.statement}</h2></div><div class="feature-grid">${t.features.map(([n,title,body,i])=>`<article><div class="feature-top"><span>${n}</span>${icon(i as Parameters<typeof iconMarkup>[0])}</div><h3>${title}</h3><p>${body}</p></article>`).join('')}</div></section>
      <section class="film-section wrap" id="film"><div class="section-heading film-heading"><div><p class="eyebrow">${t.filmTag}</p><h2>${t.filmTitle}</h2></div><p>${t.filmLead}</p></div><div class="player-frame" id="film-frame"><button class="film-poster" id="film-play" aria-label="${t.filmPlay}"><img src="${base}presmium-60s-poster.png" alt=""><span class="film-play">${icon('play')}</span></button></div><div class="film-meta"><span>${t.filmHint}</span><div><a class="pm-ui-link" href="${base}presmium-60s.webm" download>${t.filmDownload}${icon('download')}</a><a class="pm-ui-link" href="${docUrl}">${t.filmSource}${icon('chevron-right')}</a><a class="pm-ui-link" href="${promoUrl}">${t.filmScript}${icon('chevron-right')}</a></div></div><div class="chapter-list">${t.chapters.map((c,i)=>`<button class="pm-ui-button pm-ui-button--ghost" data-section="${CHAPTERS[i]![0]}" data-step="${CHAPTERS[i]![1]}"><span>${CHAPTERS[i]![2]}</span>${c}</button>`).join('')}</div></section>
      <section class="collection wrap" id="source"><div class="section-heading"><p class="eyebrow">${t.collectionTag}</p><h2>${t.collectionTitle}</h2><p class="section-lead">${t.collectionLead}</p></div><div class="collection-grid">${t.cards.map(([tag,title,body,label,i],index)=>`<article><div class="card-label">${icon(i as Parameters<typeof iconMarkup>[0])}<span>${tag}</span></div><h3>${title}</h3><p>${body}</p><a class="pm-ui-link" href="${[docUrl,sourceUrl,'#start'][index]}">${label}${icon('chevron-right')}</a></article>`).join('')}</div></section>
      <section class="faq wrap"><h2>${t.faqTitle}</h2><div>${t.faqs.map(([q,a],i)=>`<details${i===0?' open':''}><summary>${q}${icon('plus')}</summary><p>${a}</p></details>`).join('')}</div></section>
      <section class="start wrap" id="start"><p class="eyebrow">PRESMIUM</p><h2>${t.cta}</h2><p>${t.ctaLead}</p><div class="command"><code>${command}</code><button class="pm-ui-icon-button pm-ui-icon-button--ghost" id="copy" aria-label="${t.copy}">${icon('copy')}</button></div><span id="copy-status" role="status"></span><p class="install">${t.install} <code>pnpm add -g @lincyaw/presmium</code></p></section>
    </main><footer class="wrap"><a class="wordmark" href="${base}">${icon('slides')}<span>Presmium</span></a><p>${t.footer}</p><a class="pm-ui-link" href="https://github.com/Lincyaw/presmium">GitHub ${icon('external')}</a></footer>`
  document.getElementById('appearance')!.onclick = () => document.documentElement.classList.toggle('dark')
  document.getElementById('language')!.onclick = () => {
    locale = locale === 'zh-CN' ? 'en' : 'zh-CN'
    try { localStorage.setItem(LOCALE_KEY, locale) } catch { /* the choice still holds on this visit */ }
    const url = new URL(location.href); url.searchParams.set('lang',locale); history.replaceState(null,'',url)
    render(); document.getElementById('language')!.focus()
  }
  document.getElementById('copy')!.onclick = async () => {
    try { await navigator.clipboard.writeText(command); document.getElementById('copy-status')!.textContent = t.copied }
    catch { const range = document.createRange(); range.selectNodeContents(document.querySelector('.command code')!); getSelection()?.removeAllRanges(); getSelection()?.addRange(range) }
  }
  document.getElementById('film-play')!.onclick = () => playFilm(CHAPTERS[0][0])
  document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => button.onclick = () => playFilm(button.dataset.section!, Number(button.dataset.step)))
  syncMotion()
}
function syncMotion() {
  document.querySelectorAll<HTMLElement>('.ambient img').forEach(element => element.style.animationPlayState = document.hidden ? 'paused' : 'running')
}
document.addEventListener('visibilitychange',syncMotion)
document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)
render()
