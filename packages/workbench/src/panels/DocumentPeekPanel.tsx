import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { EmbedBlock, PresmiumDocument, ReferenceTarget } from '@lincyaw/kernel'
import { PmButton, PmDocMention, PmDocPeek, PmIcon, PmNotice, PmSkeleton } from '../components.tsx'
import { useTreeMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { ReadOnlyBlock } from '../document-editor/references.tsx'
import type { ReadOnlyBlocks } from '../document-editor/references.tsx'

/** A burst of saves to the document on the side is read once, after it settles. */
const RELOAD_DELAY = 300
/**
 * A long document is drawn over several frames so that none holds the page for long: the first frame draws this
 * many blocks; when drawing them (until the page is painted) was quick the next frame draws twice as many, when it
 * was slow half as many.
 */
const FIRST_BLOCKS = 60
const MOST_BLOCKS = 960
const LEAST_BLOCKS = 15
const QUICK_DRAW_MS = 12
const SLOW_DRAW_MS = 30

type Read = { state: 'loading' } | { state: 'failed' } | { state: 'ready', document: string, version: string, content: PresmiumDocument }
type Item = { kind: 'page', id: string, title: string } | { kind: 'block', id: string }

/** The pages and their top-level blocks in reading order: what the side draws, a few frames at a time. */
function itemsOf(content: PresmiumDocument): Item[] {
  return content.sectionOrder.flatMap(id => {
    const section = content.sections[id]
    return section ? [{ kind: 'page' as const, id, title: section.title }, ...section.children.map(child => ({ kind: 'block' as const, id: child }))] : []
  })
}

/** The top-level block that holds `block` (itself when it is one), where the side scrolls to. */
function topBlockOf(content: PresmiumDocument, block: string): string | undefined {
  const parents = new Map<string, string>()
  for (const item of Object.values(content.blocks)) {
    const children = item.type === 'container' ? item.children : item.type === 'component' ? item.children ?? [] : []
    for (const child of children) parents.set(child, item.id)
  }
  let current = block
  for (let depth = 0; parents.has(current) && depth < 64; depth++) current = parents.get(current)!
  return content.blocks[current] ? current : undefined
}

/**
 * The document a reference leads to, read-only in the right pane beside the open one ("Open on the Side"): its
 * breadcrumb, title, Open and Close, and its pages, scrolled to the page or block of the reference. References in it
 * open their target here in its place; Esc closes it. It is read when it opens and again after its saves settle
 * (`document` events), never while the open document is typed in; a newer target cancels the read in flight.
 */
export function DocumentPeekPanel({ target }: { target: ReferenceTarget }) {
  const workbench = useWorkbench()
  const t = useTreeMessages()
  const dir = useWorkbenchState(state => state.documents?.documents.find(doc => doc.id === target.document)?.dir ?? state.documentTree?.nodes[target.document]?.path)
  const treeTitle = useWorkbenchState(state => state.documentTree?.nodes[target.document]?.title)
  const trashed = useWorkbenchState(state => Boolean(state.documentTree?.trash.some(entry => entry.id === target.document)))
  const treeKnown = useWorkbenchState(state => Boolean(state.documentTree))
  const pathText = useWorkbenchState(state => state.documentTree && JSON.stringify(workbench.tree.ancestors(target.document)))
  const path = useMemo<{ id: string, title: string }[]>(() => pathText ? JSON.parse(pathText) : [], [pathText])
  // Titles of the references in it follow the tree.
  const tree = useWorkbenchState(state => state.documentTree)
  const [read, setRead] = useState<Read>({ state: 'loading' })
  const [reload, setReload] = useState(0)
  // The version on screen, and the latest one its `document` events announced.
  const loaded = useRef<{ document?: string, version?: string }>({})
  const announced = useRef<{ document?: string, version?: string }>({})
  const reloadTimer = useRef<ReturnType<typeof setTimeout>>()
  const reloadSoon = () => { clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => setReload(value => value + 1), RELOAD_DELAY) }
  useEffect(() => () => clearTimeout(reloadTimer.current), [])
  const frame = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (dir === undefined) return
    const controller = new AbortController()
    // The same document read again stays on screen until the new one is there; another one starts from loading.
    setRead(current => current.state === 'ready' && current.document === target.document ? current : { state: 'loading' })
    workbench.client.readDocument(dir, controller.signal).then(answer => {
      if (controller.signal.aborted) return
      loaded.current = { document: target.document, version: answer.version }
      if (announced.current.document === target.document && announced.current.version !== answer.version) reloadSoon()
      setRead({ state: 'ready', document: target.document, version: answer.version, content: answer.content })
    }, () => { if (!controller.signal.aborted) setRead({ state: 'failed' }) })
    return () => controller.abort()
  }, [workbench, dir, target.document, reload])

  useEffect(() => {
    if (dir === undefined) return
    const stop = workbench.client.subscribeDocument(dir, event => {
      announced.current = { document: target.document, version: event.version }
      // While the document is being read, the read compares when it arrives.
      if (loaded.current.document !== target.document || event.version === loaded.current.version) return
      reloadSoon()
    })
    return () => { clearTimeout(reloadTimer.current); stop() }
  }, [workbench, dir, target.document])

  // Focus moves into the side when it opens and back where it was when it closes; Esc closes it.
  useEffect(() => {
    const before = document.activeElement
    frame.current?.focus({ preventScroll: true })
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return
      event.preventDefault()
      workbench.tree.closePeek()
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      const focused = document.activeElement
      if (before instanceof HTMLElement && before.isConnected && (!focused || focused === document.body || frame.current?.contains(focused))) before.focus({ preventScroll: true })
    }
  }, [workbench])

  const content = read.state === 'ready' ? read.content : undefined
  const items = useMemo(() => content ? itemsOf(content) : [], [content])
  const targetBlock = useMemo(() => content && target.block ? topBlockOf(content, target.block) : undefined, [content, target.block])
  const targetIndex = useMemo(() => {
    if (targetBlock) return items.findIndex(item => item.kind === 'block' && item.id === targetBlock)
    if (target.section) return items.findIndex(item => item.kind === 'page' && item.id === target.section)
    // The whole document: it opens at its start, with nothing marked.
    return -1
  }, [items, targetBlock, target.section])

  // Drawn a few frames at a time; a document read again keeps what is drawn.
  const [shown, setShown] = useState(0)
  const pace = useRef({ size: FIRST_BLOCKS, requested: 0 })
  useEffect(() => { setShown(0); pace.current = { size: FIRST_BLOCKS, requested: 0 } }, [read.state === 'ready' ? read.document : undefined])
  useEffect(() => {
    // Effects run after the paint: the time since the request is what drawing the last blocks cost.
    const current = pace.current
    if (current.requested) {
      const cost = performance.now() - current.requested
      current.size = cost > SLOW_DRAW_MS ? Math.max(LEAST_BLOCKS, current.size / 2) : cost < QUICK_DRAW_MS ? Math.min(MOST_BLOCKS, current.size * 2) : current.size
      current.requested = 0
    }
    if (shown >= items.length) return
    const id = requestAnimationFrame(() => {
      current.requested = performance.now()
      setShown(drawn => Math.min(items.length, drawn + current.size))
    })
    return () => cancelAnimationFrame(id)
  }, [shown, items.length])

  // Scrolled to the reference's place once it is drawn, again for each new target, not for a document read again.
  const scrolled = useRef('')
  const targetKey = JSON.stringify([target.document, target.section ?? '', target.block ?? ''])
  useLayoutEffect(() => {
    if (!content || scrolled.current === targetKey || shown <= Math.max(0, targetIndex)) return
    scrolled.current = targetKey
    const scroller = body.current
    const place = scroller?.querySelector<HTMLElement>('[data-peek-target]')
    if (!scroller) return
    scroller.scrollTop = place ? place.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - scroller.clientHeight / 8 : 0
  }, [content, targetKey, targetIndex, shown])

  const view = useMemo<ReadOnlyBlocks | undefined>(() => content && dir !== undefined ? {
    blocks: content.blocks,
    asset: id => content.assets[id] ? workbench.client.documentAssetURL(dir, id) : undefined,
    componentLabel: title => t.syncedComponent(title || content.metadata.title),
    title: reference => reference.section || reference.block ? undefined : workbench.tree.title(reference.document),
    onReference: reference => workbench.tree.peek(reference),
    embed: (block: EmbedBlock) => <p className="pmw-peek__synced"><PmIcon name="synced" /><span>{t.syncedFrom}</span>
      <PmDocMention title={workbench.tree.title(block.source.document) ?? t.missingDocument} onActivate={() => workbench.tree.peek({ document: block.source.document, block: block.source.block })} /></p>,
  // The tree is a dependency: the titles of references follow it.
  } : undefined, [content, dir, workbench, t, tree])

  const missing = treeKnown && dir === undefined && !trashed
  const title = treeTitle ?? content?.metadata.title ?? (trashed ? workbench.getState().documentTree?.trash.find(entry => entry.id === target.document)?.title : undefined) ?? t.untitled
  const notice: ReactNode = trashed ? <PmNotice tone="warn">{t.previewTrashed}</PmNotice>
    : missing ? <PmNotice tone="warn">{t.previewMissing}</PmNotice> : undefined
  const open = () => void workbench.tree.openPlace(target, { focus: 'body' })
  let main: ReactNode
  if (dir === undefined) main = null
  else if (read.state === 'loading') main = <PmSkeleton shape="document" label={t.peekLoading} />
  else if (read.state === 'failed') main = <PmNotice tone="danger" action={<PmButton small onClick={() => setReload(value => value + 1)}>{t.retry}</PmButton>}>{t.peekFailed}</PmNotice>
  else if (!items.length) main = <p className="pmw-muted">{t.peekEmpty}</p>
  else main = <div className="pmw-peek pm-document-editor__synced-content">{view && items.slice(0, shown).map((item, index) => item.kind === 'page'
    ? <h3 key={`page:${item.id}`} className="pmw-peek__page" data-peek-target={index === targetIndex && !targetBlock || undefined}>{item.title || t.untitled}</h3>
    : <div key={item.id} className="pmw-peek__block" data-peek-target={index === targetIndex && targetBlock !== undefined || undefined}><ReadOnlyBlock view={view} id={item.id} /></div>)}</div>
  return (
    <PmDocPeek ref={frame} label={t.peekLabel} path={path} title={title} closeLabel={t.close} onClose={() => workbench.tree.closePeek()}
      onPath={id => workbench.tree.peek({ document: id })} busy={read.state === 'loading' || shown < items.length} notice={notice}
      actions={!missing && !trashed && <PmButton small variant="primary" onClick={open}>{t.open}</PmButton>}
      bodyRef={node => { body.current = node }}>
      {main}
    </PmDocPeek>
  )
}
