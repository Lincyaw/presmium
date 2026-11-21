import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentSearchHit, DocumentTree, TrashEntry } from '@lincyaw/kernel/contracts'
import { PmButton, PmDialog, PmDocTree, PmEmpty, PmIcon, PmIconButton, PmNotice, PmPopover, PmSearchList, PmSelect, PmSkeleton, PmToast } from '../components.tsx'
import type { DocTreeNode, MenuItem } from '../components.tsx'
import { useTreeMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'

/** Typing waits this long before it searches; the previous results stay while the next arrive. */
const SEARCH_DEBOUNCE = 100

export interface DocumentTreeView {
  roots: string[]
  nodes: Record<string, DocTreeNode>
  /** The tree comes from the workspace's tree route and can be changed; otherwise it is read from the document list. */
  editable: boolean
  trash: TrashEntry[]
  loading: boolean
  failed: boolean
}

/** The tree to draw: the workspace's, or (on a host without one) the document list's parents. */
export function useDocumentTreeView(): DocumentTreeView {
  const tree = useWorkbenchState(state => state.documentTree)
  const failure = useWorkbenchState(state => state.documentTreeFailure)
  const loading = useWorkbenchState(state => Boolean(state.isDocumentTreeLoading))
  const documents = useWorkbenchState(state => state.documents)
  const t = useTreeMessages()
  return useMemo(() => {
    if (tree) return { ...fromTree(tree, t.treeIssue), editable: true, trash: tree.trash, loading: false, failed: false }
    const list = documents?.documents ?? []
    const nodes: Record<string, DocTreeNode> = {}
    const roots: string[] = []
    for (const doc of list) nodes[doc.id ?? doc.dir] = { id: doc.id ?? doc.dir, title: doc.title, children: [] }
    for (const doc of list) {
      const id = doc.id ?? doc.dir
      const parent = doc.parent ? nodes[doc.parent] : undefined
      if (parent) (parent.children as string[]).push(id); else roots.push(id)
    }
    return { roots, nodes, editable: false, trash: [], loading: loading || (!documents && !failure), failed: Boolean(failure && failure !== 'tree-unavailable' && !documents) }
  }, [tree, documents, failure, loading, t])
}

function fromTree(tree: DocumentTree, issue: string): { roots: string[], nodes: Record<string, DocTreeNode> } {
  const nodes: Record<string, DocTreeNode> = {}
  for (const node of Object.values(tree.nodes)) nodes[node.id] = { id: node.id, title: node.title, children: node.children, ...node.issues?.length ? { warning: issue } : {} }
  return { roots: tree.roots, nodes }
}

/**
 * The workspace's sidebar: its name, search (Ctrl+K), Home, Recent, the document tree with New Document, and the
 * trash. `onNavigate` closes a drawer that holds it.
 */
export function WorkspaceSidebar({ onHome, onNavigate, closeLabel, onClose }: { onHome(): void, onNavigate?(): void, closeLabel?: string, onClose?(): void }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const view = useDocumentTreeView()
  const title = useWorkbenchState(state => state.documents?.title)
  const open = useWorkbenchState(state => state.document)
  const renaming = useWorkbenchState(state => state.renamingDocument)
  const busy = useWorkbenchState(state => Boolean(state.isDocumentTreeBusy))
  const readOnly = workbench.client.capabilities?.readOnly === true
  const atHome = open === undefined
  const selected = workbench.tree.idOf(open)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [searching, setSearching] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [moving, setMoving] = useState<string>()
  const [recentOpen, setRecentOpen] = useState(false)
  const editable = view.editable && !readOnly
  const labels = useMemo(() => ({ expand: t.expand, collapse: t.collapse, newChild: t.newChildIn, more: t.more, renameField: t.renameField, untitled: t.untitled }), [t])
  const count = Object.keys(view.nodes).length

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setSearching(true)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const openDocument = (id: string) => { void workbench.tree.openPlace({ document: id }); onNavigate?.() }
  const menu = (id: string): MenuItem[] => [
    { id: 'rename', label: t.rename, icon: 'edit', disabled: busy },
    { id: 'child', label: t.newChild, icon: 'document-add', disabled: busy },
    { id: 'duplicate', label: t.duplicate, icon: 'copy', disabled: busy },
    { id: 'move', label: t.moveTo, icon: 'move', disabled: busy || count < 2 },
    { id: 'trash', label: t.moveToTrash, icon: 'trash', danger: true, separator: true, disabled: busy },
  ]
  const onMenu = (id: string, action: string) => {
    if (action === 'rename') workbench.tree.startRenaming(id)
    else if (action === 'child') void createChild(id)
    else if (action === 'duplicate') void workbench.tree.duplicate(id)
    else if (action === 'move') setMoving(id)
    else if (action === 'trash') void workbench.tree.trash(id)
  }
  const createChild = async (parent: string | null) => {
    if (parent) setExpanded(current => new Set(current).add(parent))
    await workbench.tree.create(parent)
    onNavigate?.()
  }

  return (
    <nav className="pmw-sidebar" aria-label={t.sidebar}>
      <header className="pmw-sidebar__header">
        <span className="pmw-sidebar__mark" aria-hidden="true">{(title ?? '').trim().slice(0, 1) || <PmIcon name="folder" />}</span>
        <span className="pmw-sidebar__workspace">
          <span className="pmw-sidebar__name" title={title}>{title ?? ''}</span>
          <span className="pmw-sidebar__meta">{t.documentCount(count)}</span>
        </span>
        {onClose && closeLabel && <PmIconButton icon="close" small label={closeLabel} onClick={onClose} />}
      </header>
      <button type="button" className="pm-ui-search-trigger pmw-sidebar__search" onClick={() => setSearching(true)}>
        <PmIcon name="search" /><span className="pm-ui-search-trigger__label">{t.search}</span><kbd className="pm-ui-shortcut">{t.searchShortcut}</kbd>
      </button>
      <ul className="pmw-sidebar__places">
        <li><button type="button" className="pm-ui-nav-item" aria-current={atHome ? 'page' : undefined} onClick={() => { onHome(); onNavigate?.() }}><PmIcon name="home" />{t.home}</button></li>
        <li>
          <PmPopover open={recentOpen} label={t.recent} placement="below-start" onOpenChange={setRecentOpen}
            trigger={<button type="button" className="pm-ui-nav-item" aria-expanded={recentOpen}><PmIcon name="recent" />{t.recent}</button>}>
            <RecentList onOpen={id => { setRecentOpen(false); openDocument(id) }} />
          </PmPopover>
        </li>
      </ul>
      <div className="pmw-sidebar__section">
        <h2 className="pmw-sidebar__heading" id="pmw-sidebar-tree">{t.documents}</h2>
        {editable && <PmIconButton icon="plus" small label={t.newDocument} loading={busy} onClick={() => void createChild(null)} />}
      </div>
      <div className="pmw-sidebar__tree">
        {view.loading ? <PmSkeleton shape="list" label={t.treeLoading} />
          : view.failed ? <PmNotice tone="danger" action={<PmButton small onClick={() => void workbench.loadDocuments()}>{t.retry}</PmButton>}>{t.treeFailed}</PmNotice>
            : view.roots.length === 0 ? <MigrationOrEmpty />
              : <PmDocTree
                label={t.tree}
                roots={view.roots}
                nodes={view.nodes}
                selected={selected}
                expanded={expanded}
                onExpandedChange={(id, next) => setExpanded(current => { const value = new Set(current); if (next) value.add(id); else value.delete(id); return value })}
                onOpen={openDocument}
                labels={labels}
                renaming={renaming}
                onRenamingChange={id => workbench.tree.startRenaming(id)}
                disabled={!editable}
                {...editable ? {
                  onRename: (id: string, value: string) => void workbench.tree.rename(id, value),
                  onCreateChild: (id: string) => void createChild(id),
                  onTrash: (id: string) => void workbench.tree.trash(id),
                  onMove: (id: string, parent: string | null, after: string | null) => void workbench.tree.move(id, parent, after),
                  menu, onMenu,
                } : {}}
              />}
      </div>
      {view.editable && <button type="button" className="pm-ui-nav-item pmw-sidebar__trash" onClick={() => setTrashOpen(true)}>
        <PmIcon name="trash" />{t.trash}{view.trash.length > 0 && <span className="pm-ui-nav-item__count">{view.trash.length}</span>}
      </button>}
      {searching && <SearchDialog onClose={() => setSearching(false)} onOpen={(id, section, block) => { setSearching(false); void workbench.tree.openPlace({ document: id, ...section ? { section } : {}, ...block ? { block } : {} }); onNavigate?.() }} />}
      {trashOpen && <TrashDialog entries={view.trash} onClose={() => setTrashOpen(false)} />}
      {moving && <MoveDialog id={moving} view={view} onClose={() => setMoving(undefined)} />}
    </nav>
  )
}

/** While documents wait for the upgrade the list is not empty: it says how many and offers Upgrade. */
function MigrationOrEmpty() {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const migration = useWorkbenchState(state => state.documents?.migration)
  const [working, setWorking] = useState(false)
  if (migration?.documents.length && workbench.client.migrateWorkspace) return <PmNotice tone="warn" action={<PmButton small loading={working} onClick={async () => {
    setWorking(true)
    try { const answer = await workbench.migrateWorkspace(); workbench.tree.toast(t.upgraded(answer.documents.length)) } catch { workbench.tree.toast(t.operationFailed(t.failureGeneric), 'danger') } finally { setWorking(false) }
  }}>{t.upgrade}</PmButton>}>{t.upgradePending(migration.documents.length)}</PmNotice>
  return <p className="pmw-muted pmw-sidebar__empty">{t.treeEmpty}</p>
}

export function RecentList({ onOpen }: { onOpen(id: string): void }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const recent = useWorkbenchState(state => state.recentDocuments ?? [])
  const locale = useWorkbenchState(state => state.locale)
  useWorkbenchState(state => state.documentTree)
  const known = recent.filter(entry => workbench.tree.title(entry.id) !== undefined)
  if (!known.length) return <p className="pmw-muted pmw-recent__empty">{t.recentEmpty}</p>
  return <ul className="pmw-recent">{known.map(entry => (
    <li key={entry.id}><button type="button" className="pm-ui-nav-item pmw-recent__item" onClick={() => onOpen(entry.id)}>
      <PmIcon name="document" /><span className="pmw-recent__title" title={workbench.tree.title(entry.id)}>{workbench.tree.title(entry.id)}</span>
      <span className="pmw-recent__path">{workbench.tree.ancestors(entry.id).map(item => item.title).join(' › ')}</span>
      <span className="pmw-recent__time">{timeAgo(entry.at, locale)}</span>
    </button></li>
  ))}</ul>
}

/** Search across the workspace's titles and text (`documents/search`); Enter opens the result at its place. */
export function SearchDialog({ onClose, onOpen }: { onClose(): void, onOpen(id: string, section?: string, block?: string): void }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<DocumentSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [value, setValue] = useState('')
  useEffect(() => {
    const text = query.trim()
    if (!text || !workbench.client.searchDocuments) { setHits([]); setLoading(false); return }
    const controller = new AbortController()
    setLoading(true); setFailed(false)
    const timer = setTimeout(() => {
      workbench.client.searchDocuments!(text, 20, controller.signal).then(answer => { setHits(answer); setValue(answer[0] ? key(answer[0]) : '') }, () => { if (!controller.signal.aborted) setFailed(true) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, SEARCH_DEBOUNCE)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, workbench])
  const key = (hit: DocumentSearchHit) => `${hit.id}\0${hit.section ?? ''}\0${hit.block ?? ''}`
  const items = hits.map(hit => ({ value: key(hit), label: hit.title, icon: 'document' as const,
    description: [hit.ancestors.join(' › '), hit.match === 'content' && hit.excerpt ? t.contentMatch(hit.excerpt) : ''].filter(Boolean).join(' · ') }))
  const activate = (selected: string) => {
    const hit = hits.find(item => key(item) === selected)
    if (hit) onOpen(hit.id, hit.section, hit.block)
  }
  return (
    <PmDialog open label={t.searchTitle} closeLabel={t.close} name="pmw-search" onClose={onClose}>
      <PmSearchList label={t.documents} searchLabel={t.searchField} searchPlaceholder={t.searchPlaceholder} items={items} value={value} filter={false}
        query={query} onQueryChange={setQuery} onValueChange={setValue} onActivate={activate} autoFocus
        resultsLabel={t.searchResults} emptyLabel={query.trim() ? t.searchEmpty : ''} loadingLabel={t.searching} loading={loading} error={failed ? t.searchFailed : undefined} />
    </PmDialog>
  )
}

/** The trash: restore a document (with its children) or delete it permanently after a warning. */
function TrashDialog({ entries, onClose }: { entries: TrashEntry[], onClose(): void }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const locale = useWorkbenchState(state => state.locale)
  const busy = useWorkbenchState(state => Boolean(state.isDocumentTreeBusy))
  const [purging, setPurging] = useState<TrashEntry>()
  const readOnly = workbench.client.capabilities?.readOnly === true
  return (
    <PmDialog open label={t.trashTitle} closeLabel={t.close} name="pmw-trash" description={t.trashHint} busy={busy} onClose={onClose}>
      {entries.length === 0 ? <PmEmpty icon="trash" title={t.trashEmpty} />
        : <ul className="pmw-trash">{entries.map(entry => (
          <li key={entry.id} className="pmw-trash__item">
            <PmIcon name="document" />
            <span className="pmw-trash__text">
              <span className="pmw-trash__title">{entry.title}</span>
              <span className="pmw-trash__meta">{[t.deletedAt(timeAgo(entry.deletedAt, locale)), entry.children.length ? t.childCount(entry.children.length) : ''].filter(Boolean).join(' · ')}</span>
            </span>
            <PmButton small icon="restore" disabled={busy || readOnly} onClick={async () => { await workbench.tree.restore(entry.id); workbench.tree.toast(t.restored(entry.title)) }}>{t.restore}</PmButton>
            <PmButton small variant="text" disabled={busy || readOnly} onClick={() => setPurging(entry)}>{t.deletePermanently}</PmButton>
          </li>
        ))}</ul>}
      {purging && <PmDialog open label={t.deletePermanentlyTitle} closeLabel={t.close} busy={busy} onClose={() => setPurging(undefined)}
        footer={<>
          <PmButton disabled={busy} onClick={() => setPurging(undefined)}>{t.cancel}</PmButton>
          <PmButton variant="danger" loading={busy} onClick={async () => { if (await workbench.tree.purge(purging.id)) setPurging(undefined) }}>{t.deleteAction}</PmButton>
        </>}>
        <p>{t.deleteConfirm(purging.title)}</p>
        <PmNotice tone="warn">{t.deleteSynced}</PmNotice>
      </PmDialog>}
    </PmDialog>
  )
}

/** Move To…: choose the new parent; the document goes last among its children. */
function MoveDialog({ id, view, onClose }: { id: string, view: DocumentTreeView, onClose(): void }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const busy = useWorkbenchState(state => Boolean(state.isDocumentTreeBusy))
  const node = view.nodes[id]
  const parentOf = (child: string) => Object.values(view.nodes).find(item => item.children.includes(child))?.id ?? ''
  const [target, setTarget] = useState(parentOf(id))
  const choices = useMemo(() => {
    const list: { id: string, label: string }[] = []
    const visit = (ids: readonly string[], depth: number) => ids.forEach(child => {
      if (child === id) return
      const item = view.nodes[child]
      if (!item) return
      list.push({ id: child, label: `${'　'.repeat(depth)}${item.title || t.untitled}` })
      visit(item.children, depth + 1)
    })
    visit(view.roots, 0)
    return list
  }, [view, id, t])
  const select = useRef<HTMLSelectElement>(null)
  if (!node) return null
  return (
    <PmDialog open label={t.moveTitle(node.title)} closeLabel={t.close} busy={busy} onClose={onClose}
      footer={<>
        <PmButton disabled={busy} onClick={onClose}>{t.cancel}</PmButton>
        <PmButton variant="primary" loading={busy} onClick={async () => {
          const parent = target || null
          const siblings = (parent ? view.nodes[parent]?.children ?? [] : view.roots).filter(child => child !== id)
          await workbench.tree.move(id, parent, siblings.at(-1) ?? null)
          onClose()
        }}>{t.move}</PmButton>
      </>}>
      <PmSelect ref={select} label={t.moveTarget} density="regular" value={target} onChange={event => setTarget(event.target.value)}>
        <option value="">{t.topLevel}</option>
        {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </PmSelect>
    </PmDialog>
  )
}

/** The open document's ancestors in the app bar, each one a way to open it (items of the bar's place list). */
export function DocumentBreadcrumb({ compact }: { compact?: boolean }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const open = useWorkbenchState(state => state.document)
  useWorkbenchState(state => state.documentTree)
  useWorkbenchState(state => state.documents)
  const id = workbench.tree.idOf(open)
  const trail = id ? workbench.tree.ancestors(id) : []
  const shown = compact ? trail.slice(-1) : trail
  return <>{shown.map(item => (
    <li key={item.id} className="pmw-appbar__ancestor">
      <button type="button" className="pmw-appbar__place" title={item.title} aria-label={`${t.location}: ${item.title}`} onClick={() => void workbench.tree.openPlace({ document: item.id })}>
        <span className="pmw-appbar__label">{item.title}</span>
      </button>
    </li>
  ))}</>
}

/** The workbench's one toast (what a tree operation did, with Undo). */
export function WorkbenchToast() {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const toast = useWorkbenchState(state => state.toast)
  return <PmToast toast={toast} closeLabel={t.close} onClose={workbench.tree.closeToast} />
}
