import { PmDrawer, PmIcon, PmIconButton, PmPopover, PmPresenterPanels, PmToolbar, useAppearance, useMessages, useStore } from '@lincyaw/host'
import { isChapterTitle, isRecord } from '@lincyaw/kernel'
import { listViews, OverlayViewOutlet, PageViewOutlet, useViewer } from '@lincyaw/viewer'
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { directoryTree, folderLabel, sitePageLayout, WEB_MESSAGES } from '../../domain/index.ts'
import type { AppConfig, DirectoryNode, NavItem, SiteLocale } from '../../domain/index.ts'
import type { PageRouter } from '../router.ts'
import { SearchDialog } from './search.tsx'

export const APPEARANCE_KEY = 'presmium-appearance'
/** The same attributes drive site layouts and the design system's theme token mappings. */
export function siteThemeAttributes(config: AppConfig) {
  const theme = config.site.shell.theme
  return {
    'data-pm-site-theme': theme?.id ?? 'docs',
    'data-pm-site-accent': theme?.params.accent,
    'data-pm-site-typography': theme?.params.typography,
    'data-pm-site-width': theme?.params.contentWidth,
    'data-pm-site-theme-name': theme?.name,
  }
}
export function ViewMenu({ place = 'bar' }: { place?: 'bar' | 'screen' }) { const viewer = useViewer(), t = useMessages(WEB_MESSAGES), view = useStore(viewer.view); return <select className={`pm-view-menu pm-ui-select pm-view-menu--${place}`} aria-label={t.viewMenu} value={view} onChange={event => viewer.setView(event.target.value)}>{listViews().filter(v => !v.hidden || v.id === view).map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select> }
function AppearanceToggle() { const t = useMessages(WEB_MESSAGES), { dark, setDark } = useAppearance(); return <PmIconButton className="pm-site-appearance" icon={dark ? 'sun' : 'moon'} label={dark ? t.toLight : t.toDark} onClick={() => { setDark(!dark); try { localStorage.setItem(APPEARANCE_KEY, dark ? 'light' : 'dark') } catch {} }} /> }
/** The page the reader is on, known after hydration: the server renders the page without it. */
function useHere() { const [here, setHere] = useState<string>(); useEffect(() => setHere(location.href), []); return here }
/** A link to the site's root marks only the root; a link to a directory marks every page under it; any other only its page. */
function isCurrent(link: string | undefined, here: string | undefined, root: string) {
  if (!link || !here || link.includes('#')) return false
  const url = new URL(link, here)
  if (url.origin !== new URL(here).origin) return false
  const path = (href: string) => new URL(href, here).pathname.replace(/index\.html$/, ''), target = path(link), page = path(here)
  return target.endsWith('/') && target !== path(root) ? page.startsWith(target) : page === target
}
export function NavLinks({ items, root, vertical = false, onNavigate }: { items: NavItem[], root: string, vertical?: boolean, onNavigate?(): void }) {
  const [open, setOpen] = useState<string>(), here = useHere()
  return <ul className={`pm-site-nav${vertical ? ' pm-site-nav--vertical' : ''}`}>{items.map((item, index) => {
    if (!item.items?.length) { const external = item.link !== undefined && /^[a-z][a-z\d+.-]*:/i.test(item.link); return <li key={`${item.text}-${index}`} className="pm-site-nav__item"><a className="pm-site-nav__link" href={item.link} aria-current={!external && isCurrent(item.link, here, root) ? 'page' : undefined} onClick={onNavigate} {...external ? { target: '_blank', rel: 'noopener' } : {}}>{item.text}{external && <PmIcon name="external" />}</a></li> }
    return <li key={`${item.text}-${index}`} className="pm-site-nav__group">{vertical ? <><p className="pm-site-nav__heading">{item.text}</p><NavLinks items={item.items} root={root} vertical onNavigate={onNavigate} /></> : <PmPopover open={open === item.text} label={item.text} placement="below-start" name="pm-site-nav-menu" onOpenChange={next => setOpen(next ? item.text : undefined)} trigger={<button type="button" className="pm-site-nav__link">{item.text}<PmIcon name="chevron-down" /></button>}><NavLinks items={item.items} root={root} vertical onNavigate={onNavigate} /></PmPopover>}</li>
  })}</ul>
}
function LanguageMenu({ locales, lang, hrefIn }: { locales: SiteLocale[], lang: string, hrefIn(locale: SiteLocale): string }) { const t = useMessages(WEB_MESSAGES), [open, setOpen] = useState(false); return <PmPopover open={open} label={t.language} name="pm-site-languages" onOpenChange={setOpen} trigger={<PmIconButton icon="language" label={t.language} />}><ul className="pm-site-languages">{locales.map(locale => <li key={locale.lang}><a className="pm-site-languages__link" href={hrefIn(locale)} lang={locale.lang} aria-current={locale.lang === lang ? 'true' : undefined}>{locale.label}</a></li>)}</ul></PmPopover> }
/**
 * The site's documents, grouped by their first tag, with this document's chapters under it; a document on its own
 * shows its chapters. A document has one page, so a chapter is a place on it.
 */
function Sidebar({ config, router, course = false }: { config: AppConfig, router: PageRouter, course?: boolean }) {
  const viewer = useViewer(), t = useMessages(WEB_MESSAGES), doc = useStore(viewer.doc), pages = useStore(router.pages), position = useStore(viewer.position)
  const top = doc.sections.filter(section => isChapterTitle(doc, section))
  const own = router.href(pages[0] ?? { path: 'index', title: '', sections: [] })
  // Without chapters the list is the page's sections, the same as the outline on the right (`data-flat`).
  const chapters = <ol className="pm-site-sidebar__sections" data-flat={top.length > 1 ? undefined : ''}>{(top.length > 1 ? top : doc.sections).map(section => <li key={section.id}><a className="pm-site-sidebar__section" href={router.sectionHref(section.id)} aria-current={position.section === section.id ? 'location' : undefined}>{section.title}</a></li>)}</ol>
  const groups = new Map<string, { dir: string, title: string, href: string }[]>()
  for (const item of config.site.documents ?? [{ dir: config.document, title: doc.meta.title, href: own }]) groups.set(item.group ?? '', [...groups.get(item.group ?? '') ?? [], item])
  let number = 0
  if (config.site.sidebar === 'directories' && config.site.documents) {
    return <nav className="pm-site-sidebar" aria-label={t.sidebarNav}>
      <DirectoryItems nodes={directoryTree(config.site.documents)} current={config.document} own={own} chapters={chapters} />
    </nav>
  }
  return <nav className="pm-site-sidebar" aria-label={course ? t.courseContents : t.sidebarNav}>
    {course && <div className="pm-site-sidebar__intro"><p className="pm-ui-heading">{t.courseContents}</p><p className="pm-site-sidebar__title">{config.site.brandTitle ?? doc.meta.title}</p></div>}
    {[...groups].map(([group, items]) => <div key={group} className="pm-site-sidebar__group">
      {group && <p className="pm-site-sidebar__heading">{group}</p>}
      <ol className="pm-site-sidebar__chapters">{items.map((item) => {
        const current = item.dir === config.document
        number++
        return <li key={item.dir} className={`pm-site-sidebar__chapter${current ? ' pm-current' : ''}`}>
          <a className="pm-site-sidebar__link" href={current ? own : item.href} aria-current={current ? 'page' : undefined}>{course && <span className="pm-site-sidebar__number" aria-hidden="true">{String(number).padStart(2, '0')}</span>}<span>{item.title}</span></a>
          {current && chapters}
        </li>
      })}</ol>
    </div>)}
  </nav>
}
type SidebarDocument = NonNullable<AppConfig['site']['documents']>[number]
/**
 * The documents as a tree of the workspace's folders (`site.sidebar: directories`): a folder that holds documents opens
 * and closes, and the folders on the way to this document are open.
 */
function DirectoryItems({ nodes, current, own, chapters }: { nodes: DirectoryNode<SidebarDocument>[], current: string, own: string, chapters: ReactElement }) {
  return <ol className="pm-site-sidebar__tree">{nodes.map((node) => {
    const here = node.doc?.dir === current
    const label = node.doc
      ? <a className="pm-site-sidebar__link" href={here ? own : node.doc.href} aria-current={here ? 'page' : undefined}><span>{node.doc.title}</span></a>
      : <span className="pm-site-sidebar__folder">{folderLabel(node.name)}</span>
    if (!node.children.length) return <li key={node.dir} className={`pm-site-sidebar__chapter${here ? ' pm-current' : ''}`}>{label}{here && chapters}</li>
    const open = current === node.dir || current.startsWith(`${node.dir}/`)
    return <li key={node.dir} className={`pm-site-sidebar__branch${here ? ' pm-current' : ''}`}>
      <details open={open || undefined}>
        <summary className="pm-site-sidebar__toggle">{label}<PmIcon name="chevron-down" /></summary>
        {here && chapters}
        <DirectoryItems nodes={node.children} current={current} own={own} chapters={chapters} />
      </details>
    </li>
  })}</ol>
}
/** Every section of the page; in a document of chapters, the sections within one are indented under it. */
function Outline({ router, compact = false }: { router: PageRouter, compact?: boolean }) { const viewer = useViewer(), doc = useStore(viewer.doc), position = useStore(viewer.position), shown = useStore(router.shown), t = useMessages(WEB_MESSAGES); const sections = (shown?.sections ?? []).flatMap(id => viewer.section(id) ?? []); const nested = sections.some(section => isChapterTitle(doc, section)) && sections.some(section => !isChapterTitle(doc, section)); const title = compact ? 'pm-site-outline-title-compact' : 'pm-site-outline-title'; return sections.length > 1 ? <nav className="pm-site-outline" aria-labelledby={title}><p id={title} className={`pm-site-outline__title${compact ? ' pm-ui-sr-only' : ''}`}>{t.outline}</p><ol className="pm-site-outline__items">{sections.map(section => <li key={section.id}><a className={`pm-site-outline__link${nested && !isChapterTitle(doc, section) ? ' pm-site-outline__link--nested' : ''}`} href={`#${encodeURIComponent(section.id)}`} aria-current={position.section === section.id ? 'location' : undefined}>{section.title}</a></li>)}</ol></nav> : null }
function Pager({ config, router }: { config: AppConfig, router: PageRouter }) { const t = useMessages(WEB_MESSAGES), pages = useStore(router.pages), shown = useStore(router.shown), index = pages.findIndex(page => page.path === shown?.path); const neighbour = (step: number) => { const page = pages[index + step]; return page ? { text: page.title, link: router.href(page) } : step < 0 ? config.site.neighbours?.prev : config.site.neighbours?.next }; const prev = neighbour(-1), next = neighbour(1); return prev || next ? <nav className="pm-site-pager" aria-label={t.pager}>{[[prev, t.prevChapter, 'prev'], [next, t.nextChapter, 'next']].map(([other, label, rel]) => { const link = other as { text: string, link: string } | undefined; return link ? <a key={String(rel)} className={`pm-site-pager__link pm-site-pager__link--${rel}`} href={link.link} rel={String(rel)}><span className="pm-site-pager__label">{String(label)}</span><span className="pm-site-pager__title">{link.text}</span></a> : <span key={String(rel)} /> })}</nav> : null }
export function SiteFooter({ config }: { config: AppConfig }) { const { message, copyright } = config.site.shell.footer ?? {}; return message || copyright ? <footer className="pm-site-footer">{message && <p className="pm-site-footer__message" dangerouslySetInnerHTML={{ __html: message }} />}{copyright && <p className="pm-site-footer__copyright" dangerouslySetInnerHTML={{ __html: copyright }} />}</footer> : null }
/** The address of the site's root page, against which the navigation marks the current page. */
export function siteRoot(config: AppConfig) { return config.site.root ?? config.base }
export function SiteHeader({ config, titleHref, hrefIn, document: isDocument, onMenu, onSearch }: { config: AppConfig, titleHref: string, hrefIn(locale: SiteLocale): string, document?: boolean, onMenu?(): void, onSearch?(): void }) {
  const t = useMessages(WEB_MESSAGES), nav = config.site.nav ?? config.site.shell.nav ?? [], brand = config.site.brandTitle ?? config.site.title, logo = config.site.shell.theme?.params.logo
  return <header className="pm-site-header"><div className="pm-site-header__start"><PmIconButton className="pm-site-header__menu" icon="menu" label={t.mobileNav} onClick={onMenu} /><a className="pm-site-header__title" href={config.site.root ?? titleHref}>{logo && <img className="pm-site-header__logo" src={logo} alt={config.site.shell.theme?.params.logoAlt ?? ''} />}<span>{brand}</span></a></div>{nav.length > 0 && <nav className="pm-site-header__nav" aria-label={t.extraNav}><NavLinks items={nav} root={siteRoot(config)} /></nav>}<div className="pm-site-header__tools" data-shape="pill">{isDocument && config.search && <button type="button" className="pm-site-search-button pm-ui-search" aria-label={t.search} onClick={onSearch}><PmIcon name="search" /><span className="pm-site-search-button__text">{t.search}</span><kbd className="pm-ui-kbd">{t.searchShortcut}</kbd></button>}{config.site.home && <a className="pm-site-link" href={config.site.home}><PmIcon name="arrow-left" />{t.documents}</a>}{config.site.locales.length > 1 && <LanguageMenu locales={config.site.locales} lang={config.lang} hrefIn={hrefIn} />}{isDocument && <ViewMenu place="bar" />}<PmToolbar className="pm-toolbar--bar" /><AppearanceToggle /></div></header>
}
export function DocumentSite({ config, router }: { config: AppConfig, router: PageRouter }) {
  const viewer = useViewer(), t = useMessages(WEB_MESSAGES), doc = useStore(viewer.doc), page = useStore(router.page), shown = useStore(router.shown), pages = useStore(router.pages), view = useStore(viewer.view)
  const [drawer, setDrawer] = useState<'site' | 'chapters'>(), [outline, setOutline] = useState(false), [searching, setSearching] = useState(false)
  const theme = config.site.shell.theme?.id ?? 'docs', layout = config.landing ? 'landing' : sitePageLayout(isRecord(doc.config.renderers.web) ? doc.config.renderers.web : {}, config.lang), landing = layout === 'landing', course = theme === 'course'
  // The site's only document, without chapters: beside the outline the left column has nothing to lead to.
  const alone = (config.site.documents?.length ?? 1) <= 1 && doc.sections.filter(section => isChapterTitle(doc, section)).length <= 1
  // A page with scrolling sections (a figure beside its steps) spreads them wider than its prose.
  const spread = (shown?.sections ?? []).some(id => viewer.section(id)?.hints[viewer.options.renderer]?.layout === 'scrolly')
  useEffect(() => { setDrawer(undefined); setOutline(false) }, [page])
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && config.search) { event.preventDefault(); setSearching(true) } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [config.search])
  const hrefIn = (locale: SiteLocale) => { const own = locale.base.replace(/\/$/, ''); return shown && shown.path !== 'index' && (!locale.layout || locale.layout === layout) ? `${own}/${shown.path}.html` : `${own}/` }
  return <div className="pm-site" {...siteThemeAttributes(config)} data-pm-site-layout={layout} data-pm-site-alone={alone ? '' : undefined} data-pm-site-spread={spread ? '' : undefined}>
    <a className="pm-site__skip" href="#pm-site-main">{t.skipToContent}</a>
    <SiteHeader config={config} titleHref={config.site.home ?? router.href(pages[0] ?? { path: 'index', title: '', sections: [] })} hrefIn={hrefIn} document onMenu={() => setDrawer('site')} onSearch={() => setSearching(true)} />
    {!landing && <div className="pm-site-localnav"><button type="button" className="pm-site-localnav__button" onClick={() => setDrawer('chapters')}><PmIcon name="navigation" />{course ? t.courseContents : t.menu}</button>{layout !== 'wide' && (shown?.sections.length ?? 0) > 1 && <PmPopover open={outline} label={t.outline} placement="below-end" name="pm-site-outline-menu" onOpenChange={setOutline} trigger={<button type="button" className="pm-site-localnav__button">{t.outline}<PmIcon name="chevron-down" /></button>}><Outline router={router} compact /></PmPopover>}</div>}
    <div className="pm-site__body">
      {!landing && <aside className="pm-site__sidebar"><Sidebar config={config} router={router} course={course} /></aside>}
      <main id="pm-site-main" className="pm-site__main" tabIndex={-1}>
        <article className="pm-site__article"><PageViewOutlet key={shown?.path} sections={shown?.sections ?? []} /></article>
        {!landing && <Pager config={config} router={router} />}<SiteFooter config={config} />
      </main>
      {!landing && layout !== 'wide' && <aside className="pm-site__aside"><Outline router={router} /></aside>}
    </div>
    <div className="pm-document pm-overlay-views"><OverlayViewOutlet /></div>
    {view === 'presenter' && <PmPresenterPanels to=".pm-presenter__side" docked />}
    {config.search && <SearchDialog open={searching} index={config.search} onOpenChange={setSearching} />}
    <PmDrawer open={drawer !== undefined} label={drawer === 'site' ? t.siteNavTitle : course ? t.courseContents : t.menu} closeLabel={t.close} name="pm-site-menu" onOpenChange={open => { if (!open) setDrawer(undefined) }}>
      {drawer === 'site' ? <>{(config.site.nav ?? config.site.shell.nav)?.length ? <NavLinks items={config.site.nav ?? config.site.shell.nav!} root={siteRoot(config)} vertical /> : null}{config.site.home && <a className="pm-site-link" href={config.site.home}><PmIcon name="arrow-left" />{t.documents}</a>}<div className="pm-site-menu__tools"><ViewMenu place="screen" /><PmToolbar className="pm-toolbar--screen" /></div></> : <Sidebar config={config} router={router} course={course} />}
    </PmDrawer>
  </div>
}
