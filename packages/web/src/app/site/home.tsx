import { PmBadge, PmDrawer, PmEmpty, PmIcon, useMessages } from '@lincyaw/host'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { WEB_MESSAGES } from '../../domain/index.ts'
import type { AppConfig, HomeDocument, SiteAction, SiteLandingPage, SiteLandingSection } from '../../domain/index.ts'
import { NavLinks, SiteFooter, SiteHeader, siteThemeAttributes } from './layout.tsx'

function HomeHeader({ config }: { config: AppConfig }) {
  const t = useMessages(WEB_MESSAGES)
  const [open, setOpen] = useState(false)
  const configured = config.site.nav ?? config.site.shell.nav ?? []
  const documents = (config.documents ?? []).map(document => ({ text: document.title, link: document.href }))
  const items = configured.length ? configured : documents.length ? documents : [{ text: t.backHome, link: config.base }]
  return <><SiteHeader config={config} titleHref={config.base} hrefIn={locale => locale.base} onMenu={() => setOpen(true)} />
    <PmDrawer open={open} label={t.mobileNav} closeLabel={t.close} name="pm-site-menu" onOpenChange={setOpen}>
      <NavLinks items={items} vertical onNavigate={() => setOpen(false)} />
    </PmDrawer></>
}

export function WorkspaceHome({ config }: { config: AppConfig }) {
  return config.landingPage ? <IndependentLanding config={config} page={config.landingPage} /> : <AutomaticWorkspaceHome config={config} />
}

function LandingActions({ actions }: { actions?: SiteAction[] }) {
  if (!actions?.length) return null
  return <div className="pm-site-landing__actions">{actions.map((action, index) => <a key={`${action.link}-${index}`} className={`pm-ui-button${action.variant === 'secondary' ? '' : ' pm-ui-button--accent'}`} href={action.link}><span className="pm-ui-button__content">{action.text}</span></a>)}</div>
}

function LandingDocument({ document }: { document: HomeDocument }) {
  const t = useMessages(WEB_MESSAGES)
  return <li className="pm-site-landing__document pm-ui-card pm-ui-card--interactive" data-document={document.dir}>
    <h3 className="pm-ui-card__title"><a className="pm-site-home__link" href={document.href} lang={document.lang}>{document.title}</a></h3>
    {document.description && <p className="pm-site-home__description">{document.description}</p>}
    <div className="pm-ui-badges">{document.pages ? <PmBadge>{t.pages(document.pages)}</PmBadge> : null}{document.lang && <PmBadge>{document.lang}</PmBadge>}{document.tags?.map(tag => <PmBadge key={tag}>{tag}</PmBadge>)}</div>
  </li>
}

function LandingSection({ section, documents }: { section: SiteLandingSection, documents: HomeDocument[] }) {
  const t = useMessages(WEB_MESSAGES), titleId = useId()
  const title = section.title ?? (section.type === 'documents' ? t.documentsHeading : undefined)
  let content: ReactNode
  switch (section.type) {
    case 'features': content = <ul className="pm-site-landing__features">{section.items.map((item, index) => <li key={index} className={`pm-site-landing__feature pm-ui-card${item.link ? ' pm-ui-card--interactive' : ''}`}>
      {item.image && <img className="pm-site-landing__feature-image" src={item.image} alt={item.imageAlt ?? ''} loading="lazy" />}
      <h3 className="pm-ui-card__title">{item.link ? <a className="pm-site-home__link" href={item.link}>{item.title}</a> : item.title}</h3>
      {item.description && <p className="pm-site-home__description">{item.description}</p>}
    </li>)}</ul>; break
    case 'documents': {
      const shown = documents.filter(document => (!section.directories?.length || section.directories.includes(document.dir)) && (!section.tags?.length || section.tags.some(tag => document.tags?.includes(tag))))
      content = shown.length ? <ul className="pm-site-landing__documents">{shown.map(document => <LandingDocument key={document.dir} document={document} />)}</ul> : <PmEmpty icon="document">{t.noDocuments}</PmEmpty>
      break
    }
    case 'media': content = <figure className="pm-site-landing__media">{section.kind === 'image'
      ? <img src={section.src} alt={section.alt ?? ''} loading="lazy" />
      : <video src={section.src} controls preload="metadata" poster={section.poster} aria-label={section.alt ?? title}>{Object.entries(section.captions ?? {}).map(([language, src]) => <track key={language} kind="captions" src={src} srcLang={language} label={language} />)}</video>}</figure>; break
    case 'text': content = <div className="pm-site-landing__text">{section.body.split(/\n\s*\n/).filter(paragraph => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>; break
    case 'cta': content = <LandingActions actions={section.actions} />; break
  }
  return <section id={section.id} className={`pm-site-landing__section pm-site-landing__section--${section.type}${section.type === 'cta' ? ' pm-ui-card' : ''}`} aria-labelledby={title ? titleId : undefined}>
    {(title || section.description) && <header className="pm-site-landing__section-heading">{title && <h2 id={titleId} className="pm-site-landing__section-title">{title}</h2>}{section.description && <p className="pm-site-landing__description">{section.description}</p>}</header>}
    {content}
  </section>
}

/** A site's own page is independent from teaching documents and their viewer state. */
export function IndependentLanding({ config, page }: { config: AppConfig, page: SiteLandingPage }) {
  const t = useMessages(WEB_MESSAGES), hero = page.hero, title = hero?.title ?? page.title, description = hero?.description ?? page.description
  return <div className="pm-site pm-site--landing" {...siteThemeAttributes(config)}>
    <a className="pm-site__skip" href="#pm-site-main">{t.skipToContent}</a><HomeHeader config={config} />
    <main id="pm-site-main" className="pm-site-landing pm-ui" tabIndex={-1}>
      <header className="pm-site-landing__hero" data-with-image={hero?.image ? '' : undefined}>
        <div className="pm-site-landing__hero-content">
          {hero?.eyebrow && <div className="pm-ui-badges"><PmBadge tone="accent">{hero.eyebrow}</PmBadge></div>}
          <h1 className="pm-site-landing__title">{title}</h1>
          {description && <p className="pm-site-landing__description">{description}</p>}
          <LandingActions actions={hero?.actions} />
        </div>
        {hero?.image && <figure className="pm-site-landing__hero-visual"><img src={hero.image} alt={hero.imageAlt ?? ''} /></figure>}
      </header>
      {page.sections.map(section => <LandingSection key={section.id} section={section} documents={config.documents ?? []} />)}
      <SiteFooter config={config} />
    </main>
  </div>
}

function AutomaticWorkspaceHome({ config }: { config: AppConfig }) {
  const t = useMessages(WEB_MESSAGES)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const documents = config.documents ?? []
  const documentOrder = new Map(documents.map((document, index) => [document.dir, index + 1]))
  const theme = config.site.shell.theme?.id ?? 'docs', course = theme === 'course', showcase = theme === 'showcase'
  const DocumentList = course ? 'ol' : 'ul'
  const tags = [...new Set(documents.flatMap(doc => doc.tags ?? []))].sort()
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = documents.filter(doc => (!tag || doc.tags?.includes(tag)) && words.every(word => `${doc.title} ${doc.dir} ${doc.description ?? ''} ${(doc.tags ?? []).join(' ')}`.toLowerCase().includes(word)))
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus() } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [])
  const card = (doc: HomeDocument) => <li key={doc.dir} className="pm-site-home__document pm-ui-card pm-ui-card--interactive" data-document={doc.dir}>
    {course && <div className="pm-site-home__order" aria-hidden="true"><PmBadge tone="accent" pill>{String(documentOrder.get(doc.dir)).padStart(2, '0')}</PmBadge></div>}
    <div className="pm-site-home__card-content"><h3 className="pm-ui-card__title"><a className="pm-site-home__link" href={doc.href} lang={doc.lang}>{doc.title}</a></h3>
      {doc.description && <p className="pm-site-home__description">{doc.description}</p>}
      <div className="pm-ui-badges">{theme === 'docs' && <PmBadge className="pm-site-home__dir">{doc.dir}/</PmBadge>}{doc.pages ? <PmBadge>{t.pages(doc.pages)}</PmBadge> : null}{doc.lang && <PmBadge>{doc.lang}</PmBadge>}{doc.tags?.map(name => <PmBadge key={name} className="pm-site-home__badge">{name}</PmBadge>)}{theme === 'docs' && doc.problems && <PmBadge tone={doc.problems.errors ? 'danger' : doc.problems.warnings ? 'warn' : 'ok'}>{doc.problems.errors ? t.errors(doc.problems.errors) : doc.problems.warnings ? t.warnings(doc.problems.warnings) : t.checked}</PmBadge>}</div>
    </div>
  </li>
  return <div className="pm-site pm-site--home" {...siteThemeAttributes(config)}><a className="pm-site__skip" href="#pm-site-main">{t.skipToContent}</a><HomeHeader config={config} /><main id="pm-site-main" className="pm-site-home pm-ui" tabIndex={-1}>
    <header className="pm-site-home__hero">
      {theme !== 'docs' && <div className="pm-ui-badges"><PmBadge tone="accent">{t.documentCount(documents.length)}</PmBadge></div>}
      <h1 className="pm-site-home__title">{config.site.title}</h1>
      {config.site.shell.head?.description && <p className="pm-site-home__intro">{config.site.shell.head.description}</p>}
      {(course && documents[0] || showcase) && <div className="pm-site-home__actions">{course && documents[0] && <a className="pm-ui-button pm-ui-button--accent" href={documents[0].href}><span className="pm-ui-button__content">{t.startReading}<PmIcon name="chevron-right" /></span></a>}{showcase && <a className="pm-ui-button pm-ui-button--accent" href="#pm-site-home-documents"><span className="pm-ui-button__content">{t.browseDocuments}<PmIcon name="chevron-down" /></span></a>}</div>}
    </header>
    <section className="pm-site-home__section" aria-labelledby="pm-site-home-documents"><div className="pm-site-home__filters"><h2 id="pm-site-home-documents" className="pm-ui-heading">{course ? t.courseContents : t.documentsHeading}</h2><label className="pm-ui-search pm-site-home__search-box"><PmIcon name="search" /><input ref={input} className="pm-site-home__search" type="search" value={query} placeholder={t.searchDocuments} aria-label={t.searchDocuments} onChange={event => setQuery(event.target.value)} /><kbd className="pm-ui-kbd">{t.searchShortcut}</kbd></label>{tags.length > 0 && <div className="pm-site-home__tags pm-ui-segmented" role="group" aria-label={t.tags}><button type="button" className="pm-site-home__tag pm-ui-segmented__option" aria-pressed={tag === undefined} onClick={() => setTag(undefined)}>{t.allTags}</button>{tags.map(name => <button key={name} type="button" className="pm-site-home__tag pm-ui-segmented__option" aria-pressed={tag === name} onClick={() => setTag(tag === name ? undefined : name)}>{name}</button>)}</div>}</div>{shown.length ? <DocumentList className="pm-site-home__documents">{shown.map(card)}</DocumentList> : <PmEmpty icon="document">{t.noDocuments}</PmEmpty>}</section>
    <SiteFooter config={config} />
  </main></div>
}
export function MissingPage({ config }: { config: AppConfig }) { const t = useMessages(WEB_MESSAGES); return <div className="pm-site pm-site--missing" {...siteThemeAttributes(config)}><HomeHeader config={config} /><main id="pm-site-main" className="pm-site-missing"><p className="pm-site-missing__code">404</p><h1 className="pm-site-missing__title">{t.notFound}</h1><p className="pm-site-missing__text">{t.notFoundText}</p><a className="pm-ui-button pm-ui-button--primary" href={config.site.root ?? config.base}>{t.backHome}</a></main></div> }
