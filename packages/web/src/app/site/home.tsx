import { PmBadge, PmDrawer, PmEmpty, PmIcon, useMessages } from '@lincyaw/host'
import { useEffect, useRef, useState } from 'react'
import { WEB_MESSAGES } from '../../domain/index.ts'
import type { AppConfig, HomeDocument } from '../../domain/index.ts'
import { NavLinks, SiteFooter, SiteHeader } from './layout.tsx'

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
  const t = useMessages(WEB_MESSAGES)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const documents = config.documents ?? []
  const tags = [...new Set(documents.flatMap(doc => doc.tags ?? []))].sort()
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = documents.filter(doc => (!tag || doc.tags?.includes(tag)) && words.every(word => `${doc.title} ${doc.dir} ${doc.description ?? ''} ${(doc.tags ?? []).join(' ')}`.toLowerCase().includes(word)))
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus() } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [])
  const card = (doc: HomeDocument) => <li key={doc.dir} className="pm-site-home__document pm-ui-card pm-ui-card--interactive" data-document={doc.dir}>
    <a className="pm-site-home__link" href={doc.href} lang={doc.lang}>{doc.title}</a>
    {doc.description && <p className="pm-site-home__description">{doc.description}</p>}
    <div className="pm-ui-badges"><PmBadge className="pm-site-home__dir">{doc.dir}/</PmBadge>{doc.pages ? <PmBadge>{t.pages(doc.pages)}</PmBadge> : null}{doc.lang && <PmBadge>{doc.lang}</PmBadge>}{doc.tags?.map(name => <PmBadge key={name} className="pm-site-home__badge">{name}</PmBadge>)}{doc.problems && <PmBadge tone={doc.problems.errors ? 'danger' : doc.problems.warnings ? 'warn' : 'ok'}>{doc.problems.errors ? t.errors(doc.problems.errors) : doc.problems.warnings ? t.warnings(doc.problems.warnings) : t.checked}</PmBadge>}</div>
  </li>
  return <div className="pm-site pm-site--home"><a className="pm-site__skip" href="#pm-site-main">{t.skipToContent}</a><HomeHeader config={config} /><main id="pm-site-main" className="pm-site-home pm-ui" tabIndex={-1}><h1 className="pm-site-home__title">{config.site.title}</h1><section className="pm-site-home__section" aria-labelledby="pm-site-home-documents"><div className="pm-site-home__filters"><h2 id="pm-site-home-documents" className="pm-ui-heading">{t.documentsHeading}</h2><label className="pm-ui-search pm-site-home__search-box"><PmIcon name="search" /><input ref={input} className="pm-site-home__search" type="search" value={query} placeholder={t.searchDocuments} aria-label={t.searchDocuments} onChange={event => setQuery(event.target.value)} /><kbd className="pm-ui-kbd">{t.searchShortcut}</kbd></label>{tags.length > 0 && <div className="pm-site-home__tags pm-ui-segmented" role="group" aria-label={t.tags}><button type="button" className="pm-site-home__tag pm-ui-segmented__option" aria-pressed={tag === undefined} onClick={() => setTag(undefined)}>{t.allTags}</button>{tags.map(name => <button key={name} type="button" className="pm-site-home__tag pm-ui-segmented__option" aria-pressed={tag === name} onClick={() => setTag(tag === name ? undefined : name)}>{name}</button>)}</div>}</div>{shown.length ? <ul className="pm-site-home__documents">{shown.map(card)}</ul> : <PmEmpty icon="document">{t.noDocuments}</PmEmpty>}</section><SiteFooter config={config} /></main></div>
}
export function MissingPage({ config }: { config: AppConfig }) { const t = useMessages(WEB_MESSAGES); return <div className="pm-site pm-site--missing"><HomeHeader config={config} /><main id="pm-site-main" className="pm-site-missing"><p className="pm-site-missing__code">404</p><h1 className="pm-site-missing__title">{t.notFound}</h1><p className="pm-site-missing__text">{t.notFoundText}</p><a className="pm-ui-button pm-ui-button--primary" href={config.base}>{t.backHome}</a></main></div> }
