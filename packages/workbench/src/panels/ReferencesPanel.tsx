import { useEffect, useState } from 'react'
import type { DocumentCitation, DocumentLinks, OutgoingLink } from '@lincyaw/kernel/contracts'
import { PmBacklinkItem, PmButton, PmIcon, PmNotice, PmSkeleton } from '../components.tsx'
import { useTreeMessages, useWorkbench, useWorkbenchState } from '../context.tsx'

type Links = { state: 'loading' } | { state: 'failed' } | { state: 'unavailable' } | { state: 'ready', links: DocumentLinks }

/** The open document's links (`document/links`), read again when it is saved or the tree changes. */
export function useDocumentLinks(): { links: Links, retry(): void } {
  const workbench = useWorkbench()
  const id = useWorkbenchState(state => state.authoring?.content?.id)
  const version = useWorkbenchState(state => state.authoring?.version)
  const tree = useWorkbenchState(state => state.documentTree)
  const [links, setLinks] = useState<Links>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!id) return
    if (!workbench.client.readDocumentLinks) { setLinks({ state: 'unavailable' }); return }
    const controller = new AbortController()
    setLinks(current => current.state === 'ready' && current.links.document === id ? current : { state: 'loading' })
    workbench.client.readDocumentLinks(id, controller.signal).then(answer => setLinks({ state: 'ready', links: answer }), () => { if (!controller.signal.aborted) setLinks({ state: 'failed' }) })
    return () => controller.abort()
  }, [workbench, id, version, tree, attempt])
  return { links, retry: () => setAttempt(n => n + 1) }
}

/** The places one document cites this one, together, in the order the service gives them. */
function groupCitations(citations: readonly DocumentCitation[]): { document: string, title: string, citations: DocumentCitation[] }[] {
  const groups = new Map<string, { document: string, title: string, citations: DocumentCitation[] }>()
  for (const citation of citations) {
    let group = groups.get(citation.document)
    if (!group) groups.set(citation.document, group = { document: citation.document, title: citation.title, citations: [] })
    group.citations.push(citation)
  }
  return [...groups.values()]
}

/** Several references to one target are one row with their count. */
function sameTargets(links: readonly OutgoingLink[]): { link: OutgoingLink, count: number }[] {
  const rows = new Map<string, { link: OutgoingLink, count: number }>()
  for (const link of links) {
    const key = JSON.stringify([link.target.document, link.target.section ?? '', link.target.block ?? ''])
    const row = rows.get(key)
    if (row) row.count++
    else rows.set(key, { link, count: 1 })
  }
  return [...rows.values()]
}

function OutgoingItem({ link, count }: { link: OutgoingLink, count: number }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const gone = link.missing || link.trashed
  return <li>
    <button type="button" className="pm-ui-nav-item pmw-references__link" title={link.title} disabled={link.missing} aria-disabled={gone || undefined} onClick={() => void workbench.tree.openPlace(link.target)}>
      <PmIcon name={link.kind === 'embed' ? 'synced' : 'document'} />
      <span className="pmw-references__title">{link.title}</span>
      {gone ? <span className="pm-ui-nav-item__count">{link.missing ? t.missingTarget : t.trashedTarget}</span> : count > 1 && <span className="pm-ui-nav-item__count">{t.placeCount(count)}</span>}
    </button>
  </li>
}

/** Who cites this document (with the sentence around it), what it references, and the synced blocks it shows. */
export function ReferencesPanel() {
  return <ReferencesView read={useDocumentLinks()} />
}

function ReferencesView({ read }: { read: ReturnType<typeof useDocumentLinks> }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const { links, retry } = read
  if (links.state === 'loading') return <div className="pmw-references"><PmSkeleton shape="list" label={t.referencesLoading} /></div>
  if (links.state === 'unavailable') return <div className="pmw-references"><p className="pmw-muted">{t.referencesUnavailable}</p></div>
  if (links.state === 'failed') return <div className="pmw-references"><PmNotice tone="danger" action={<PmButton small onClick={retry}>{t.retry}</PmButton>}>{t.referencesFailed}</PmNotice></div>
  const { incoming, outgoing } = links.links
  const references = sameTargets(outgoing.filter(link => link.kind === 'reference'))
  const synced = sameTargets(outgoing.filter(link => link.kind === 'embed'))
  return (
    <div className="pmw-references">
      <section className="pmw-references__group" aria-labelledby="pmw-references-incoming">
        <h3 className="pmw-references__heading" id="pmw-references-incoming">{t.citedBy} · {incoming.length}</h3>
        {incoming.length ? <ul className="pmw-references__list">{groupCitations(incoming).map(group => (
          <li key={group.document}>
            <PmBacklinkItem title={group.title} count={group.citations.length > 1 ? t.placeCount(group.citations.length) : undefined} syncedLabel={t.syncedLabel}
              places={group.citations.map((citation, index) => ({ id: String(index), excerpt: citation.excerpt, synced: citation.kind === 'embed',
                meta: group.citations.length > 1 ? `${citation.kind === 'embed' ? t.syncedLabel : t.referenceLabel} · ${t.placeIndex(index + 1)}` : undefined }))}
              onActivate={id => { const citation = group.citations[Number(id)]!; void workbench.tree.openPlace({ document: citation.document, ...citation.section ? { section: citation.section } : {}, block: citation.block }) }} />
          </li>
        ))}</ul> : <p className="pmw-muted">{t.noCitations}</p>}
      </section>
      <section className="pmw-references__group" aria-labelledby="pmw-references-outgoing">
        <h3 className="pmw-references__heading" id="pmw-references-outgoing">{t.outgoing} · {references.length}</h3>
        {references.length ? <ul className="pmw-references__links">{references.map(({ link, count }, index) => <OutgoingItem key={index} link={link} count={count} />)}</ul> : <p className="pmw-muted">{t.noOutgoing}</p>}
      </section>
      <section className="pmw-references__group" aria-labelledby="pmw-references-synced">
        <h3 className="pmw-references__heading" id="pmw-references-synced">{t.syncedBlocks} · {synced.length}</h3>
        {synced.length ? <ul className="pmw-references__links">{synced.map(({ link, count }, index) => <OutgoingItem key={index} link={link} count={count} />)}</ul> : <p className="pmw-muted">{t.noSynced}</p>}
      </section>
    </div>
  )
}

/** On a narrow screen the references are one collapsed row at the end of the document. */
export function ReferencesSummary() {
  const t = useTreeMessages()
  const read = useDocumentLinks()
  const links = read.links
  if (links.state !== 'ready') return null
  return (
    <details className="pmw-references-summary">
      <summary className="pmw-references-summary__row">{t.referencesSummary(links.links.incoming.length, links.links.outgoing.filter(link => link.kind === 'reference').length)}<PmIcon name="chevron-right" /></summary>
      <ReferencesView read={read} />
    </details>
  )
}
