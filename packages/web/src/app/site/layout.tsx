import { PmDrawer, PmIcon, PmIconButton, PmPopover, PmPresenterPanels, PmToolbar, useAppearance, useMessages, useStore } from '@lincyaw/host'
import { isChapterTitle, isRecord } from '@lincyaw/kernel'
import { listViews, OverlayViewOutlet, PageViewOutlet, useViewer } from '@lincyaw/viewer'
import { useEffect, useState } from 'react'
import { sitePageLayout, WEB_MESSAGES } from '../../domain/index.ts'
import type { AppConfig, NavItem, SiteLocale } from '../../domain/index.ts'
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
  }
}
export function ViewMenu({ place = 'bar' }: { place?: 'bar' | 'screen' }) { const viewer = useViewer(), t = useMessages(WEB_MESSAGES), view = useStore(viewer.view); return <select className={`pm-view-menu pm-ui-select pm-view-menu--${place}`} aria-label={t.viewMenu} value={view} onChange={event => viewer.setView(event.target.value)}>{listViews().filter(v => !v.hidden || v.id === view).map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select> }
function AppearanceToggle() { const t = useMessages(WEB_MESSAGES), { dark, setDark } = useAppearance(); return <PmIconButton className="pm-site-appearance" icon={dark ? 'sun' : 'moon'} label={dark ? t.toLight : t.toDark} onClick={() => { setDark(!dark); try { localStorage.setItem(APPEARANCE_KEY, dark ? 'light' : 'dark') } catch {} }} /> }
export function NavLinks({ items, vertical = false, onNavigate }: { items: NavItem[], vertical?: boolean, onNavigate?(): void }) {
  const [open, setOpen] = useState<string>()
  return <ul className={`pm-site-nav${vertical ? ' pm-site-nav--vertical' : ''}`}>{items.map((item, index) => {
    if (!item.items?.length) { const external = item.link !== undefined && /^[a-z][a-z\d+.-]*:/i.test(item.link); return <li key={`${item.text}-${index}`} className="pm-site-nav__item"><a className="pm-site-nav__link" href={item.link} onClick={onNavigate} {...external ? { target: '_blank', rel: 'noopener' } : {}}>{item.text}{external && <PmIcon name="external" />}</a></li> }
    return <li key={`${item.text}-${index}`} className="pm-site-nav__group">{vertical ? <><p className="pm-site-nav__heading">{item.text}</p><NavLinks items={item.items} vertical onNavigate={onNavigate} /></> : <PmPopover open={open === item.text} label={item.text} placement="below-start" name="pm-site-nav" onOpenChange={next => setOpen(next ? item.text : undefined)} trigger={<button type="button" className="pm-site-nav__link">{item.text}<PmIcon name="chevron-down" /></button>}><NavLinks items={item.items} vertical onNavigate={onNavigate} /></PmPopover>}</li>
  })}</ul>
}
function LanguageMenu({ locales, lang, hrefIn }: { locales: SiteLocale[], lang: string, hrefIn(locale: SiteLocale): string }) { const t = useMessages(WEB_MESSAGES), [open, setOpen] = useState(false); return <PmPopover open={open} label={t.language} name="pm-site-languages" onOpenChange={setOpen} trigger={<PmIconButton icon="language" label={t.language} />}><ul className="pm-site-languages">{locales.map(locale => <li key={locale.lang}><a className="pm-site-languages__link" href={hrefIn(locale)} lang={locale.lang} aria-current={locale.lang === lang ? 'true' : undefined}>{locale.label}</a></li>)}</ul></PmPopover> }
function Sidebar({ router, course = false }: { router: PageRouter, course?: boolean }) {
  const viewer = useViewer(), t = useMessages(WEB_MESSAGES), pages = useStore(router.pages), shown = useStore(router.shown), doc = useStore(viewer.doc)
  return <nav className="pm-site-sidebar" aria-label={course ? t.courseContents : t.sidebarNav}>
    {course && <div className="pm-site-sidebar__intro"><p className="pm-ui-heading">{t.courseContents}</p><p className="pm-site-sidebar__title">{doc.meta.title}</p></div>}
    <ol className="pm-site-sidebar__chapters">{pages.map((page, index) => {
      const current = page.path === shown?.path, sections = page.sections.slice(1).flatMap(id => viewer.section(id) ?? [])
      return <li key={page.path} className={`pm-site-sidebar__chapter${current ? ' pm-current' : ''}`}>
        <a className="pm-site-sidebar__link" href={router.href(page)} aria-current={current ? 'page' : undefined}>{course && <span className="pm-site-sidebar__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}<span>{page.title}</span></a>
        {sections.length > 0 && <ol className="pm-site-sidebar__sections">{sections.map(section => <li key={section.id}><a className="pm-site-sidebar__section" href={router.sectionHref(section.id)}>{section.title}</a></li>)}</ol>}
      </li>
    })}</ol>
  </nav>
}
function Outline({ router, compact = false }: { router: PageRouter, compact?: boolean }) { const viewer = useViewer(), doc = useStore(viewer.doc), position = useStore(viewer.position), shown = useStore(router.shown), t = useMessages(WEB_MESSAGES); const sections = (shown?.sections ?? []).flatMap(id => viewer.section(id) ?? []).filter(section => !isChapterTitle(doc, section)); const title = compact ? 'pm-site-outline-title-compact' : 'pm-site-outline-title'; return sections.length ? <nav className="pm-site-outline" aria-labelledby={title}><p id={title} className={`pm-site-outline__title${compact ? ' pm-ui-sr-only' : ''}`}>{t.outline}</p><ol className="pm-site-outline__items">{sections.map(section => <li key={section.id}><a className="pm-site-outline__link" href={`#${encodeURIComponent(section.id)}`} aria-current={position.section === section.id ? 'location' : undefined}>{section.title}</a></li>)}</ol></nav> : null }
function Pager({ config, router }: { config: AppConfig, router: PageRouter }) { const t = useMessages(WEB_MESSAGES), pages = useStore(router.pages), shown = useStore(router.shown), index = pages.findIndex(page => page.path === shown?.path); const neighbour = (step: number) => { const page = pages[index + step]; return page ? { text: page.title, link: router.href(page) } : step < 0 ? config.site.neighbours?.prev : config.site.neighbours?.next }; const prev = neighbour(-1), next = neighbour(1); return prev || next ? <nav className="pm-site-pager" aria-label={t.pager}>{[[prev, t.prevChapter, 'prev'], [next, t.nextChapter, 'next']].map(([other, label, rel]) => { const link = other as { text: string, link: string } | undefined; return link ? <a key={String(rel)} className={`pm-site-pager__link pm-site-pager__link--${rel}`} href={link.link} rel={String(rel)}><span className="pm-site-pager__label">{String(label)}</span><span className="pm-site-pager__title">{link.text}</span></a> : <span key={String(rel)} /> })}</nav> : null }
export function SiteFooter({ config }: { config: AppConfig }) { const { message, copyright } = config.site.shell.footer ?? {}; return message || copyright ? <footer className="pm-site-footer">{message && <p className="pm-site-footer__message" dangerouslySetInnerHTML={{ __html: message }} />}{copyright && <p className="pm-site-footer__copyright" dangerouslySetInnerHTML={{ __html: copyright }} />}</footer> : null }
export function SiteHeader({ config, titleHref, hrefIn, document: isDocument, onMenu, onSearch }: { config: AppConfig, titleHref: string, hrefIn(locale: SiteLocale): string, document?: boolean, onMenu?(): void, onSearch?(): void }) {
  const t = useMessages(WEB_MESSAGES), nav = config.site.nav ?? config.site.shell.nav ?? [], brand = config.site.brandTitle ?? config.site.title, logo = config.site.shell.theme?.params.logo
  return <header className="pm-site-header"><div className="pm-site-header__start"><PmIconButton className="pm-site-header__menu" icon="menu" label={t.mobileNav} onClick={onMenu} /><a className="pm-site-header__title" href={config.site.root ?? titleHref}>{logo && <img className="pm-site-header__logo" src={logo} alt={config.site.shell.theme?.params.logoAlt ?? ''} />}<span>{brand}</span></a></div>{nav.length > 0 && <nav className="pm-site-header__nav" aria-label={t.extraNav}><NavLinks items={nav} /></nav>}<div className="pm-site-header__tools">{isDocument && config.search && <button type="button" className="pm-site-search-button pm-ui-search" aria-label={t.search} onClick={onSearch}><PmIcon name="search" /><span className="pm-site-search-button__text">{t.search}</span><kbd className="pm-ui-kbd">{t.searchShortcut}</kbd></button>}{config.site.home && <a className="pm-site-link" href={config.site.home}><PmIcon name="arrow-left" />{t.documents}</a>}{config.site.locales.length > 1 && <LanguageMenu locales={config.site.locales} lang={config.lang} hrefIn={hrefIn} />}{isDocument && <ViewMenu place="bar" />}<PmToolbar className="pm-toolbar--bar" /><AppearanceToggle /></div></header>
}
export function DocumentSite({ config, router }: { config: AppConfig, router: PageRouter }) {
  const viewer = useViewer(), t = useMessages(WEB_MESSAGES), doc = useStore(viewer.doc), page = useStore(router.page), shown = useStore(router.shown), pages = useStore(router.pages), view = useStore(viewer.view)
  const [drawer, setDrawer] = useState<'site' | 'chapters'>(), [outline, setOutline] = useState(false), [searching, setSearching] = useState(false)
  const theme = config.site.shell.theme?.id ?? 'docs', layout = config.landing ? 'landing' : sitePageLayout(isRecord(doc.config.renderers.web) ? doc.config.renderers.web : {}, config.lang), landing = layout === 'landing', course = theme === 'course', showcase = theme === 'showcase' && !landing
  useEffect(() => { setDrawer(undefined); setOutline(false) }, [page])
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && config.search) { event.preventDefault(); setSearching(true) } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [config.search])
  const hrefIn = (locale: SiteLocale) => { const own = locale.base.replace(/\/$/, ''); return shown && shown.path !== 'index' && (!locale.layout || locale.layout === layout) ? `${own}/${shown.path}.html` : `${own}/` }
  return <div className="pm-site" {...siteThemeAttributes(config)} data-pm-site-layout={layout}>
    <a className="pm-site__skip" href="#pm-site-main">{t.skipToContent}</a>
    <SiteHeader config={config} titleHref={config.site.home ?? router.href(pages[0] ?? { path: 'index', title: '', sections: [] })} hrefIn={hrefIn} document onMenu={() => setDrawer('site')} onSearch={() => setSearching(true)} />
    {!landing && !showcase && <div className="pm-site-localnav"><button type="button" className="pm-site-localnav__button" onClick={() => setDrawer('chapters')}><PmIcon name="navigation" />{course ? t.courseContents : t.menu}</button>{layout !== 'wide' && (shown?.sections.length ?? 0) > 1 && <PmPopover open={outline} label={t.outline} placement="below-end" name="pm-site-outline-menu" onOpenChange={setOutline} trigger={<button type="button" className="pm-site-localnav__button">{t.outline}<PmIcon name="chevron-down" /></button>}><Outline router={router} compact /></PmPopover>}</div>}
    {showcase && <nav className="pm-site-chapterbar" aria-label={t.menu}>{pages.map(item => <a key={item.path} className={`pm-ui-button pm-ui-button--${item.path === shown?.path ? 'accent' : 'ghost'}`} href={router.href(item)} aria-current={item.path === shown?.path ? 'page' : undefined}>{item.title}</a>)}</nav>}
    <div className="pm-site__body">
      {!landing && !showcase && <aside className="pm-site__sidebar"><Sidebar router={router} course={course} /></aside>}
      <main id="pm-site-main" className="pm-site__main" tabIndex={-1}>
        <article className="pm-site__article"><PageViewOutlet key={shown?.path} sections={shown?.sections ?? []} /></article>
        {!landing && <Pager config={config} router={router} />}<SiteFooter config={config} />
      </main>
      {!landing && !showcase && layout !== 'wide' && <aside className="pm-site__aside"><Outline router={router} /></aside>}
    </div>
    <div className="pm-document pm-overlay-views"><OverlayViewOutlet /></div>
    {view === 'presenter' && <PmPresenterPanels to=".pm-presenter__side" docked />}
    {config.search && <SearchDialog open={searching} index={config.search} onOpenChange={setSearching} />}
    <PmDrawer open={drawer !== undefined} label={drawer === 'site' ? t.mobileNav : course ? t.courseContents : t.menu} closeLabel={t.close} name="pm-site-menu" onOpenChange={open => { if (!open) setDrawer(undefined) }}>
      {drawer === 'site' ? <>{(config.site.nav ?? config.site.shell.nav)?.length ? <NavLinks items={config.site.nav ?? config.site.shell.nav!} vertical /> : null}{config.site.home && <a className="pm-site-link" href={config.site.home}><PmIcon name="arrow-left" />{t.documents}</a>}<div className="pm-site-menu__tools"><ViewMenu place="screen" /><PmToolbar className="pm-toolbar--screen" /></div></> : <Sidebar router={router} course={course} />}
    </PmDrawer>
  </div>
}
