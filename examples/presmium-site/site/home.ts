import '@lincyaw/design/design.css'
import { iconMarkup } from '@lincyaw/design'
import './style.css'

type Locale = 'zh-CN' | 'en'
const messages = {
  'zh-CN': {
    title: '让知识从文稿走向舞台', nav: ['特性', '60 秒了解', '下载源码'], start: '开始创作',
    eyebrow: '为讲述知识而创作', hero: '让知识从文稿\n走向舞台。',
    lead: '文字、代码与动画，在同一份教学文稿里。\n生成网页、放映与视频，把内容带到更多人面前。',
    watch: '观看 60 秒宣传片', source: '探索这堂小课', sourceLabel: '一份内容，三种表达',
    file: '看懂一次参数更新', sourceNote: '线性回归 · 公式 · 代码 · 曲线', formats: ['网页', '放映', '视频'],
    statement: '把精力留给内容。', substatement: '从一个想法，到读者眼前。',
    features: [
      ['01', '把分散的解释串起来', '公式、代码、图形与讲稿放在同一份文稿里，围绕同一个例子展开，省下反复整理不同版本的时间。', 'document'],
      ['02', '让每一步都有依据', '从公式到数值，再到画面变化，按步骤解释复杂过程。讲得太快，就回到那一步重新展开。', 'steps'],
      ['03', '讲完，还能继续探索', '同一份内容生成阅读网页、演示幻灯片和讲解视频。课堂上讲过的过程，也能留给读者回看。', 'website'],
    ],
    filmTag: '由 Presmium 制作', filmTitle: '从公式，到理解。', filmLead: '以线性回归为例，把公式、代码、预测线与损失曲线串成一次讲解。看见学习率怎样改变训练过程。',
    filmHint: '60 秒 · Presmium 制作', filmDownload: '下载影片', filmSource: '回看线性回归小课', filmScript: '影片文稿',
    chapters: ['备课的难题', '组织讲解', '随时回看', '课堂与课后'],
    collectionTag: '这个网站，也是一份作品', collectionTitle: '从内容，到自己的站点。',
    collectionLead: '首页自由设计，文稿持续生长。预置课程、文档、作品展示三种主题，构建结果可部署到 GitHub Pages 等静态托管平台。',
    cards: [
      ['配套小课', '同一个例子，自己走一遍', '回看预测线和损失如何随参数变化，再从同一份教学内容进入放映。', '打开小课', 'document'],
      ['独立首页', '让作品拥有自己的样子', '这个页面使用独立 HTML、CSS 与 TypeScript 制作，由 Presmium 构建。', '下载作品源码', 'website'],
      ['静态发布', '把作品带到更多人面前', '构建整套网站与文稿，保留视频、字幕和资源，部署到自己的地址。', '开始建站', 'export'],
    ],
    faqTitle: '开始之前，你可能想知道',
    faqs: [
      ['首页一定是一份文稿吗？', '可以独立设计。使用站点 JSON 组合内容区块，或者使用 HTML、CSS、JavaScript 自由制作；教学内容仍由 lecture.json 保存。'],
      ['能把整个工作区变成网站吗？', '可以。站点构建会收集工作区里的多份文稿，生成独立地址和导航，并一起打包内容需要的资源。'],
      ['可以播放视频吗？', '可以。网站可以使用原生播放器播放视频并加载字幕。这支影片也是由 Presmium 导出，再放回到这个首页的。'],
      ['已有内容要怎样开始？', '先创建一个站点，选择主题，再加入自己的文稿。想定制首页时，替换 site.landing 的来源即可。'],
    ],
    cta: '你的下一份作品，从这里开始。', ctaLead: '一份文稿，一个自己的舞台。', install: '首次使用，先安装', copy: '复制命令', copied: '已复制',
    footer: '用 Presmium 制作 · 开源创作工具', appearance: '切换亮暗外观', language: 'English', skip: '跳到正文',
  },
  en: {
    title: 'Bring knowledge to the stage', nav: ['Features', 'The 60-second film', 'Download source'], start: 'Start creating',
    eyebrow: 'Made for sharing knowledge', hero: 'Bring knowledge\nto the stage.',
    lead: 'Words, code and animation in one teaching document.\nPublish a website, present your ideas, or make a film.',
    watch: 'Watch the 60-second film', source: 'Explore the lesson', sourceLabel: 'One source. Three ways to share.',
    file: 'Inside a parameter update', sourceNote: 'Linear regression · Math · Code · Plots', formats: ['Website', 'Slides', 'Video'],
    statement: 'Keep your focus on the content.', substatement: 'From an idea to your audience.',
    features: [
      ['01', 'Connect the explanation', 'Keep equations, code, visuals and narration in one document, built around the same example.', 'document'],
      ['02', 'Give every step a reason', 'Connect equations to values and visual changes. Revisit any step when the explanation needs more time.', 'steps'],
      ['03', 'Keep exploring after class', 'Generate reading pages, slides and narrated video from the same source, so your audience can revisit the process.', 'website'],
    ],
    filmTag: 'Made with Presmium', filmTitle: 'From equations to understanding.', filmLead: 'Follow one linear regression lesson through equations, code, predictions and loss. See how a learning rate changes training.',
    filmHint: '60 seconds · Made with Presmium', filmDownload: 'Download film', filmSource: 'Explore the regression lesson', filmScript: 'Film source',
    chapters: ['Before class', 'Build the explanation', 'Revisit a step', 'During and after class'],
    collectionTag: 'This website is a work, too', collectionTitle: 'From content to your own website.',
    collectionLead: 'Design your homepage independently. Choose a course, documentation or showcase theme, and publish to GitHub Pages or another static host.',
    cards: [
      ['Companion lesson', 'Walk through the same example', 'Revisit how parameters change predictions and loss, then present the same teaching content.', 'Open lesson', 'document'],
      ['Independent homepage', 'Make it yours', 'This page is built from standalone HTML, CSS and TypeScript, with Presmium.', 'Download source', 'website'],
      ['Static publishing', 'Reach your audience', 'Build your workspace and its documents, keeping video, captions and assets together.', 'Create your site', 'export'],
    ],
    faqTitle: 'A few things before you begin',
    faqs: [
      ['Does the homepage have to be a document?', 'You can design it independently. Compose sections in site JSON, or use HTML, CSS and JavaScript. Teaching content stays in lecture.json.'],
      ['Can I publish a whole workspace?', 'Yes. A site build collects the documents in your workspace, gives each an address, and bundles their assets together.'],
      ['Can the website play video?', 'Yes. Native video players can play your film and load captions. This film was exported by Presmium and added back to this homepage.'],
      ['How do I start with my content?', 'Create a site, pick a theme and add your documents. Change the site.landing source when you want a custom homepage.'],
    ],
    cta: 'Your next work starts here.', ctaLead: 'One document. Your own stage.', install: 'First time? Install Presmium', copy: 'Copy command', copied: 'Copied',
    footer: 'Made with Presmium · Open source', appearance: 'Switch appearance', language: '中文', skip: 'Skip to content',
  },
} as const

const site = JSON.parse(document.getElementById('presmium-site-data')?.textContent || '{}') as { base?: string, documents?: { id: string, href: string }[] }
const base = site.base || new URL('./',document.baseURI).pathname
let locale: Locale = new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'zh-CN'
const sourceUrl = `${base}presmium-source.tar.gz`
const docUrl = site.documents?.find(doc => doc.id === 'learn')?.href || `${base}learn/`
const promoUrl = site.documents?.find(doc => doc.id === 'promo')?.href || `${base}promo/`
const command = 'presmium new my-site --type site'
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
  document.getElementById('app')!.innerHTML = `
    <a class="skip pm-ui-link" href="#main">${t.skip}</a>
    <div class="ambient" aria-hidden="true"><img class="ambient-blue" src="${new URL('./assets/ambient-blue.svg', import.meta.url)}" alt=""><img class="ambient-teal" src="${new URL('./assets/ambient-teal.svg', import.meta.url)}" alt=""><img class="ambient-violet" src="${new URL('./assets/ambient-violet.svg', import.meta.url)}" alt=""></div>
    <header class="topbar"><a class="wordmark" href="${base}">${icon('slides')}<span>Presmium</span></a>
      <nav aria-label="${locale === 'en' ? 'Main navigation' : '主导航'}"><a href="#features">${t.nav[0]}</a><a href="#film">${t.nav[1]}</a><a href="${sourceUrl}">${t.nav[2]}</a></nav>
      <div class="nav-actions"><button class="pm-ui-icon-button pm-ui-icon-button--ghost" id="appearance" aria-label="${t.appearance}">${icon('contrast')}</button><button class="pm-ui-button pm-ui-button--ghost" id="language">${t.language}</button>${button('#start',t.start,true)}</div>
    </header>
    <main id="main">
      <section class="hero wrap">
        <div class="hero-copy"><p class="eyebrow">${t.eyebrow}</p><h1>${t.hero.replace('\n','<br>')}</h1><p class="lead">${t.lead.replace('\n','<br>')}</p><div class="hero-actions">${button('#film',t.watch,true)}${button(docUrl,t.source)}</div><p class="hero-note">${t.sourceLabel}</p></div>
        <div class="hero-art" role="img" aria-label="${t.sourceLabel}"><div class="document-card"><div class="window-bar"><span>lecture.json</span>${icon('document')}</div><span class="tiny-label">PRESMIUM / 001</span><h2>${t.file}</h2><p>${t.sourceNote}</p><div class="content-lines"><i></i><i></i></div>${chart()}<div class="document-bottom"><span>${icon('check')} ${locale === 'en' ? 'Ready to share' : '准备好，去分享'}</span><span>01 / 03</span></div></div><div class="output-row">${t.formats.map((f,i)=>`<div class="output-card">${icon((['website','slides','video'] as const)[i]!)}<span>${f}</span><b>0${i+1}</b></div>`).join('')}</div><div class="art-caption"><span class="status-dot"></span>${t.sourceLabel}</div></div>
      </section>
      <section class="features wrap" id="features"><div class="section-heading"><p class="eyebrow">PRESMIUM / ${t.substatement}</p><h2>${t.statement}</h2></div><div class="feature-grid">${t.features.map(([n,title,body,i])=>`<article><div class="feature-top"><span>${n}</span>${icon(i as Parameters<typeof iconMarkup>[0])}</div><h3>${title}</h3><p>${body}</p></article>`).join('')}</div></section>
      <section class="film-section wrap" id="film"><div class="section-heading film-heading"><div><p class="eyebrow">${t.filmTag}</p><h2>${t.filmTitle}</h2></div><p>${t.filmLead}</p></div><div class="player-frame"><video id="promo-video" controls playsinline preload="metadata" poster="${base}presmium-60s-poster.png"><source src="${base}presmium-60s.webm" type="video/webm"></video></div><div class="film-meta"><span>${t.filmHint}</span><div><a class="pm-ui-link" href="${base}presmium-60s.webm" download>${t.filmDownload}${icon('download')}</a><a class="pm-ui-link" href="${docUrl}">${t.filmSource}${icon('chevron-right')}</a><a class="pm-ui-link" href="${promoUrl}">${t.filmScript}${icon('chevron-right')}</a></div></div><div class="chapter-list">${t.chapters.map((c,i)=>`<button class="pm-ui-button pm-ui-button--ghost" data-seek="${[0,14,42,48][i]}"><span>${['00:00','00:14','00:42','00:48'][i]}</span>${c}</button>`).join('')}</div></section>
      <section class="collection wrap" id="source"><div class="section-heading"><p class="eyebrow">${t.collectionTag}</p><h2>${t.collectionTitle}</h2><p class="section-lead">${t.collectionLead}</p></div><div class="collection-grid">${t.cards.map(([tag,title,body,label,i],index)=>`<article><div class="card-label">${icon(i as Parameters<typeof iconMarkup>[0])}<span>${tag}</span></div><h3>${title}</h3><p>${body}</p><a class="pm-ui-link" href="${[docUrl,sourceUrl,'#start'][index]}">${label}${icon('chevron-right')}</a></article>`).join('')}</div></section>
      <section class="faq wrap"><h2>${t.faqTitle}</h2><div>${t.faqs.map(([q,a],i)=>`<details${i===0?' open':''}><summary>${q}${icon('plus')}</summary><p>${a}</p></details>`).join('')}</div></section>
      <section class="start wrap" id="start"><p class="eyebrow">PRESMIUM</p><h2>${t.cta}</h2><p>${t.ctaLead}</p><div class="command"><code>${command}</code><button class="pm-ui-icon-button pm-ui-icon-button--ghost" id="copy" aria-label="${t.copy}">${icon('copy')}</button></div><span id="copy-status" role="status"></span><p class="install">${t.install} <code>pnpm add -g @lincyaw/presmium</code></p></section>
    </main><footer class="wrap"><a class="wordmark" href="${base}">${icon('slides')}<span>Presmium</span></a><p>${t.footer}</p><a class="pm-ui-link" href="https://github.com/Lincyaw/presmium">GitHub ${icon('external')}</a></footer>`
  document.getElementById('appearance')!.onclick = () => document.documentElement.classList.toggle('dark')
  document.getElementById('language')!.onclick = () => { locale = locale === 'zh-CN' ? 'en' : 'zh-CN'; const url = new URL(location.href); url.searchParams.set('lang',locale); history.replaceState(null,'',url); render(); document.getElementById('language')!.focus() }
  document.getElementById('copy')!.onclick = async () => {
    try { await navigator.clipboard.writeText(command); document.getElementById('copy-status')!.textContent = t.copied }
    catch { const range = document.createRange(); range.selectNodeContents(document.querySelector('.command code')!); getSelection()?.removeAllRanges(); getSelection()?.addRange(range) }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-seek]').forEach(button => button.onclick = () => { const video = document.querySelector<HTMLVideoElement>('#promo-video')!; video.currentTime = Number(button.dataset.seek); void video.play() })
  syncMotion()
}
function syncMotion() {
  document.querySelectorAll<HTMLElement>('.ambient img').forEach(element => element.style.animationPlayState = document.hidden ? 'paused' : 'running')
}
document.addEventListener('visibilitychange',syncMotion)
document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)
render()
