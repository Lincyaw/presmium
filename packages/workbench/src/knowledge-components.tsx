import * as Popover from '@radix-ui/react-popover'
import { cloneElement, forwardRef, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react'
import { PmButton, PmIcon, PmIconButton } from './base-controls.tsx'
import type { MenuItem } from './components.tsx'
import { PmContextMenu, PmMenu } from './components.tsx'

const cls = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(' ')

// The hover timing of the shared tooltip (docs/design-system.md 4.3): a preview opens after a rest, and stays while the
// pointer crosses the gap to it.
const PREVIEW_OPEN_DELAY = 500
const PREVIEW_CLOSE_DELAY = 300
const TOAST_DURATION = 4000
// Above this many visible rows the tree draws only those in view, with this many more on each side.
const VIRTUAL_ROWS = 200
const VIRTUAL_MARGIN = 12

export interface DocTreeNode { id: string, title: string, children: readonly string[], warning?: string }
export type DocTreeDrop = 'before' | 'inside' | 'after'
export interface DocTreeLabels {
  expand(title: string): string
  collapse(title: string): string
  newChild(title: string): string
  more(title: string): string
  renameField: string
  untitled: string
}
export interface DocTreeProps {
  label: string
  roots: readonly string[]
  nodes: Readonly<Record<string, DocTreeNode>>
  /** The open document: its row is selected. */
  selected?: string
  expanded: ReadonlySet<string>
  onExpandedChange(id: string, open: boolean): void
  onOpen(id: string): void
  labels: DocTreeLabels
  /** The row whose title is an input now (after F2, a double click, or creating it). */
  renaming?: string
  onRenamingChange(id: string | undefined): void
  onRename?(id: string, title: string): void
  onCreateChild?(id: string): void
  onTrash?(id: string): void
  /** `after`: the sibling the moved document follows; null to be the first of `parent`'s children. */
  onMove?(id: string, parent: string | null, after: string | null): void
  menu?(id: string): MenuItem[]
  onMenu?(id: string, action: string): void
  disabled?: boolean
}

interface Row { id: string, depth: number, parent: string | null, index: number, siblings: readonly string[] }

function visibleRows(roots: readonly string[], nodes: DocTreeProps['nodes'], expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = []
  const visit = (ids: readonly string[], depth: number, parent: string | null) => ids.forEach((id, index) => {
    const node = nodes[id]
    if (!node) return
    rows.push({ id, depth, parent, index, siblings: ids })
    if (node.children.length && expanded.has(id)) visit(node.children, depth + 1, id)
  })
  visit(roots, 0, null)
  return rows
}

function isWithin(nodes: DocTreeProps['nodes'], ancestor: string, id: string): boolean {
  if (ancestor === id) return true
  return (nodes[ancestor]?.children ?? []).some(child => isWithin(nodes, child, id))
}

/**
 * The workspace's documents as a tree (WAI-ARIA tree view): one tab stop that the arrow keys move, Home and End,
 * typing a title's first letters, * to expand the row's siblings, Enter to open, F2 to rename, Delete to move to the
 * trash, and Shift+F10 or the context menu key (or a right click) for the row's menu, the same as its "⋯" menu. A row can be dragged before, into or after another; the target row shows where it will land. Above 200 visible
 * rows only those in view are drawn.
 */
export function PmDocTree(props: DocTreeProps) {
  const { label, roots, nodes, selected, expanded, onExpandedChange, renaming, onRenamingChange, onMove, disabled } = props
  // Rows keep their identity while their place is unchanged, so that expanding one node renders only the new rows.
  const rowCache = useRef(new Map<string, Row>())
  const rows = useMemo(() => visibleRows(roots, nodes, expanded).map(row => {
    const old = rowCache.current.get(row.id)
    if (old && old.depth === row.depth && old.parent === row.parent && old.index === row.index && old.siblings === row.siblings) return old
    rowCache.current.set(row.id, row)
    return row
  }), [roots, nodes, expanded])
  const [focused, setFocused] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [drop, setDrop] = useState<{ id: string, at: DocTreeDrop }>()
  const [context, setContext] = useState<{ id: string, at: { x: number, y: number } }>()
  // The menu's row once it has closed (by then `context` is cleared): focus returns to it and the chosen item acts on it.
  const contextRow = useRef<string>()
  const container = useRef<HTMLDivElement>(null)
  const items = useRef(new Map<string, HTMLDivElement>())
  const typed = useRef({ text: '', at: 0 })
  const pendingFocus = useRef<string>()
  const current = focused && rows.some(row => row.id === focused) ? focused : selected && rows.some(row => row.id === selected) ? selected : rows[0]?.id

  // Windowing: above VIRTUAL_ROWS visible rows only the rows in view (and a margin) are in the DOM.
  const virtual = rows.length > VIRTUAL_ROWS
  const [rowHeight, setRowHeight] = useState(0)
  const [view, setView] = useState({ top: 0, height: 0 })
  useLayoutEffect(() => {
    const element = container.current
    if (!element || !virtual) return
    const first = element.querySelector<HTMLElement>('[role="treeitem"]')
    if (first) setRowHeight(first.getBoundingClientRect().height + parseFloat(getComputedStyle(element).rowGap || '0'))
    const measure = () => setView(before => before.top === element.scrollTop && before.height === element.clientHeight ? before : { top: element.scrollTop, height: element.clientHeight })
    measure()
    let frame: number | undefined
    const scrolled = () => { frame ??= requestAnimationFrame(() => { frame = undefined; measure() }) }
    element.addEventListener('scroll', scrolled, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => { element.removeEventListener('scroll', scrolled); observer.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [virtual])
  const step = rowHeight || 1
  const from = virtual && rowHeight ? Math.max(0, Math.floor(view.top / step) - VIRTUAL_MARGIN) : 0
  const to = virtual && rowHeight ? Math.min(rows.length, Math.ceil((view.top + view.height) / step) + VIRTUAL_MARGIN) : virtual ? Math.min(rows.length, VIRTUAL_ROWS) : rows.length

  // Opening the selected document reveals it: its ancestors expand.
  useEffect(() => {
    if (!selected) return
    const parents: string[] = []
    const find = (ids: readonly string[], trail: string[]): boolean => ids.some(id => id === selected ? (parents.push(...trail), true) : find(nodes[id]?.children ?? [], [...trail, id]))
    find(roots, [])
    for (const id of parents) if (!expanded.has(id)) onExpandedChange(id, true)
  }, [selected, nodes, roots])

  useEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    const element = items.current.get(id)
    if (element) { pendingFocus.current = undefined; element.focus() }
  })

  const latest = useRef({ props, rows, drop, dragging })
  latest.current = { props, rows, drop, dragging }
  const focus = useCallback((id: string | undefined) => {
    if (!id) return
    setFocused(id)
    const element = items.current.get(id)
    if (element) { element.focus(); return }
    // A row outside the window: scroll it in, then focus it once it is drawn.
    const index = latest.current.rows.findIndex(row => row.id === id)
    if (container.current && index >= 0) container.current.scrollTop = Math.max(0, index * step - container.current.clientHeight / 2)
    pendingFocus.current = id
  }, [step])

  const handlers = useMemo<RowHandlers>(() => ({
    register: (id, element) => { if (element) items.current.set(id, element); else items.current.delete(id) },
    focused: id => setFocused(id),
    open: id => latest.current.props.onOpen(id),
    toggle: (id, open) => latest.current.props.onExpandedChange(id, open),
    rename: id => { const p = latest.current.props; if (p.onRename && !p.disabled) p.onRenamingChange(id) },
    finishRename: (id, value, returnFocus) => {
      const p = latest.current.props
      p.onRenamingChange(undefined)
      const title = p.nodes[id]?.title
      if (value !== undefined && value.trim() && value.trim() !== title) p.onRename?.(id, value.trim())
      if (returnFocus) items.current.get(id)?.focus()
    },
    createChild: id => latest.current.props.onCreateChild?.(id),
    menu: id => latest.current.props.menu?.(id) ?? [],
    menuSelect: (id, action) => latest.current.props.onMenu?.(id, action),
    contextMenu: (id, at) => {
      const p = latest.current.props
      if (!p.menu || !p.onMenu || p.disabled || p.renaming === id) return false
      setFocused(id)
      items.current.get(id)?.focus()
      contextRow.current = id
      setContext({ id, at })
      return true
    },
    keyDown: (event, row) => {
      if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
        const box = event.currentTarget.getBoundingClientRect()
        if (handlers.contextMenu(row.id, { x: box.left + box.height, y: box.bottom })) event.preventDefault()
        return
      }
      const { props: p, rows: all } = latest.current
      const node = p.nodes[row.id]!
      const at = all.findIndex(item => item.id === row.id)
      const open = node.children.length > 0 && p.expanded.has(row.id)
      let handled = true
      switch (event.key) {
        case 'ArrowDown': focus(all[at + 1]?.id); break
        case 'ArrowUp': focus(all[at - 1]?.id); break
        case 'Home': focus(all[0]?.id); break
        case 'End': focus(all.at(-1)?.id); break
        case 'ArrowRight':
          if (node.children.length && !open) p.onExpandedChange(row.id, true)
          else if (open) focus(node.children[0])
          break
        case 'ArrowLeft':
          if (open) p.onExpandedChange(row.id, false)
          else focus(row.parent ?? undefined)
          break
        case '*': for (const id of row.siblings) if (p.nodes[id]?.children.length && !p.expanded.has(id)) p.onExpandedChange(id, true); break
        case 'Enter': p.onOpen(row.id); break
        case 'F2': if (p.onRename && !p.disabled) p.onRenamingChange(row.id); break
        case 'Delete': if (p.onTrash && !p.disabled) p.onTrash(row.id); break
        default:
          handled = false
          if (event.key.length === 1 && event.key.trim()) {
            const now = Date.now()
            typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + event.key.toLowerCase(), at: now }
            const ordered = [...all.slice(at + 1), ...all.slice(0, at + 1)]
            const match = ordered.find(item => p.nodes[item.id]!.title.toLowerCase().startsWith(typed.current.text))
              ?? (typed.current.text.length === 1 ? undefined : ordered.find(item => p.nodes[item.id]!.title.toLowerCase().startsWith(event.key.toLowerCase())))
            if (match) { focus(match.id); handled = true }
          }
      }
      if (handled) event.preventDefault()
    },
    dragStart: (event, id, title) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', title); setDragging(id) },
    dragEnd: () => { setDragging(undefined); setDrop(undefined) },
    dragOver: (event, row) => {
      const at = dropAt(event, row)
      if (!at) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const before = latest.current.drop
      if (before?.id !== row.id || before.at !== at) setDrop({ id: row.id, at })
    },
    dragLeave: (event, id) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop(value => value?.id === id ? undefined : value) },
    drop: (event, row) => {
      const at = dropAt(event, row)
      event.preventDefault()
      const moving = latest.current.dragging
      setDrop(undefined); setDragging(undefined)
      if (!at || !moving) return
      const p = latest.current.props
      if (at === 'inside') {
        const children = (p.nodes[row.id]?.children ?? []).filter(id => id !== moving)
        p.onMove?.(moving, row.id, children.at(-1) ?? null)
        if (!p.expanded.has(row.id)) p.onExpandedChange(row.id, true)
      } else {
        const siblings = row.siblings.filter(id => id !== moving)
        const index = siblings.indexOf(row.id)
        p.onMove?.(moving, row.parent, at === 'after' ? row.id : siblings[index - 1] ?? null)
      }
    },
  }), [focus])
  function dropAt(event: DragEvent<HTMLDivElement>, row: Row): DocTreeDrop | undefined {
    const moving = latest.current.dragging
    if (!moving || isWithin(latest.current.props.nodes, moving, row.id)) return undefined
    const box = event.currentTarget.getBoundingClientRect()
    const y = (event.clientY - box.top) / box.height
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'
  }

  return (
    <div ref={container} className="pm-ui-doc-tree" role="tree" aria-label={label} data-dragging={dragging ? '' : undefined} data-virtual={virtual || undefined}>
      {from > 0 && <div aria-hidden="true" style={{ height: from * step }} />}
      {rows.slice(from, to).map(row => {
        const node = nodes[row.id]!
        return <TreeRow key={row.id} row={row} node={node} open={node.children.length > 0 && expanded.has(row.id)} selected={row.id === selected}
          tabStop={row.id === current} menuOpen={context?.id === row.id} drop={drop?.id === row.id ? drop.at : undefined} dragged={dragging === row.id}
          draggable={Boolean(onMove) && !disabled && renaming !== row.id} renaming={renaming === row.id && Boolean(props.onRename)}
          actions={!disabled && renaming !== row.id} canCreate={Boolean(props.onCreateChild)} hasMenu={Boolean(props.menu && props.onMenu)}
          labels={props.labels} handlers={handlers} />
      })}
      {to < rows.length && <div aria-hidden="true" style={{ height: (rows.length - to) * step }} />}
      {props.menu && props.onMenu && <PmContextMenu label={context ? props.labels.more(nodes[context.id]?.title || props.labels.untitled) : label}
        items={context ? props.menu(context.id) : []} at={context?.at} onClose={() => setContext(undefined)}
        returnFocus={() => { if (contextRow.current) items.current.get(contextRow.current)?.focus() }}
        onSelect={action => { if (contextRow.current) props.onMenu?.(contextRow.current, action) }} />}
    </div>
  )
}

interface RowHandlers {
  register(id: string, element: HTMLDivElement | null): void
  focused(id: string): void
  open(id: string): void
  toggle(id: string, open: boolean): void
  rename(id: string): void
  finishRename(id: string, value: string | undefined, returnFocus: boolean): void
  createChild(id: string): void
  menu(id: string): MenuItem[]
  menuSelect(id: string, action: string): void
  /** Opens the row's menu at a point; false when the row has none now. */
  contextMenu(id: string, at: { x: number, y: number }): boolean
  keyDown(event: KeyboardEvent<HTMLDivElement>, row: Row): void
  dragStart(event: DragEvent<HTMLDivElement>, id: string, title: string): void
  dragEnd(): void
  dragOver(event: DragEvent<HTMLDivElement>, row: Row): void
  dragLeave(event: DragEvent<HTMLDivElement>, id: string): void
  drop(event: DragEvent<HTMLDivElement>, row: Row): void
}

/** One row; it renders again only when its own node, state or drop target changes. */
const TreeRow = memo(function TreeRow({ row, node, open, selected, tabStop, menuOpen: contextOpen, drop, dragged, draggable, renaming, actions, canCreate, hasMenu, labels, handlers }: {
  row: Row, node: DocTreeNode, open: boolean, selected: boolean, tabStop: boolean, menuOpen: boolean, drop?: DocTreeDrop, dragged: boolean, draggable: boolean,
  renaming: boolean, actions: boolean, canCreate: boolean, hasMenu: boolean, labels: DocTreeLabels, handlers: RowHandlers,
}) {
  const title = node.title || labels.untitled
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      ref={element => handlers.register(row.id, element)}
      className="pm-ui-doc-tree__item"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-setsize={row.siblings.length}
      aria-posinset={row.index + 1}
      aria-expanded={node.children.length ? open : undefined}
      aria-selected={selected}
      aria-current={selected ? 'page' : undefined}
      tabIndex={tabStop ? 0 : -1}
      data-depth={Math.min(row.depth, 8)}
      data-drop={drop}
      data-menu-open={contextOpen || undefined}
      data-dragged={dragged || undefined}
      draggable={draggable}
      title={node.warning}
      onFocus={event => { if (event.target === event.currentTarget) handlers.focused(row.id) }}
      onKeyDown={event => handlers.keyDown(event, row)}
      onClick={event => { if ((event.target as HTMLElement).closest('button, input, [role="menu"]')) return; handlers.focused(row.id); handlers.open(row.id) }}
      onDoubleClick={event => { if (!(event.target as HTMLElement).closest('button')) handlers.rename(row.id) }}
      onContextMenu={event => { if (!renaming && handlers.contextMenu(row.id, { x: event.clientX, y: event.clientY })) event.preventDefault() }}
      onDragStart={event => handlers.dragStart(event, row.id, title)}
      onDragEnd={handlers.dragEnd}
      onDragOver={event => handlers.dragOver(event, row)}
      onDragLeave={event => handlers.dragLeave(event, row.id)}
      onDrop={event => handlers.drop(event, row)}
    >
      <span className="pm-ui-doc-tree__twisty">
        {node.children.length > 0 && <button type="button" tabIndex={-1} className="pm-ui-doc-tree__toggle" aria-label={open ? labels.collapse(title) : labels.expand(title)} onClick={() => handlers.toggle(row.id, !open)}>
          <PmIcon name={open ? 'chevron-down' : 'chevron-right'} />
        </button>}
      </span>
      <span className="pm-ui-doc-tree__icon"><PmIcon name={node.warning ? 'warning' : 'document'} /></span>
      {renaming
        ? <TreeRename title={node.title} label={labels.renameField} onDone={(value, returnFocus) => handlers.finishRename(row.id, value, returnFocus)} />
        : <span className="pm-ui-doc-tree__title" title={title}>{title}</span>}
      {actions && <span className="pm-ui-doc-tree__actions" data-open={menuOpen || undefined}>
        {canCreate && <PmIconButton icon="plus" small tabIndex={-1} label={labels.newChild(title)} onClick={() => handlers.createChild(row.id)} />}
        {/* The menu's items are built when it opens, not for every row on every render. */}
        {hasMenu && <PmMenu label={labels.more(title)} items={menuOpen ? handlers.menu(row.id) : []} onOpenChange={setMenuOpen} onSelect={action => handlers.menuSelect(row.id, action)} />}
      </span>}
    </div>
  )
})

/** Enter and Escape give the focus back to the row; a blur keeps it where the author put it (the editor, another row). */
function TreeRename({ title, label, onDone }: { title: string, label: string, onDone(value: string | undefined, returnFocus: boolean): void }) {
  const [value, setValue] = useState(title)
  const done = useRef(false)
  const finish = (next: string | undefined, returnFocus = true) => { if (done.current) return; done.current = true; onDone(next, returnFocus) }
  return <input
    className="pm-ui-doc-tree__rename pm-ui-input"
    aria-label={label}
    value={value}
    autoFocus
    onFocus={event => event.currentTarget.select()}
    onChange={event => setValue(event.target.value)}
    onBlur={() => finish(value, false)}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Enter') { event.preventDefault(); finish(value) }
      else if (event.key === 'Escape') { event.preventDefault(); finish(undefined) }
    }}
  />
}

/** An inline reference to a document, a page or a block: its icon and current title; `missing` when the target is gone. */
export const PmDocMention = forwardRef<HTMLSpanElement, { title: string, missing?: boolean, missingLabel?: string, onActivate?(): void, describedBy?: string }>(function PmDocMention({ title, missing, missingLabel, onActivate, describedBy, ...rest }, ref) {
  return <span
    ref={ref}
    {...rest}
    className="pm-ui-doc-mention"
    role="link"
    tabIndex={0}
    aria-disabled={missing || undefined}
    aria-describedby={describedBy}
    data-missing={missing || undefined}
    onClick={event => { event.preventDefault(); if (!missing) onActivate?.() }}
    onKeyDown={event => { if (event.key === 'Enter' && !missing) { event.preventDefault(); onActivate?.() } }}
  ><PmIcon name="document" /><span className="pm-ui-doc-mention__title">{missing ? missingLabel ?? title : title}</span></span>
})

export interface DocPreview { path: string[], title: string, excerpt: string, meta: string, missing?: boolean }

/**
 * A preview of a reference's target on hover: it opens after the pointer rests 500 ms (or the trigger is focused for as
 * long), stays while the pointer crosses to it within 300 ms, and its buttons take the keyboard with Tab. A touch has
 * no hover: a tap on the trigger opens the card at once instead of activating the trigger, a second tap or one outside
 * closes it. `load` runs when it opens; `children` is the trigger.
 */
export function PmDocPreviewCard({ label, load, loadingLabel, failedLabel, actions, children }: { label: string, load(): Promise<DocPreview>, loadingLabel: string, failedLabel: string, actions?: ReactNode, children: ReactElement }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<DocPreview | 'loading' | 'failed'>('loading')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const id = useId()
  const loader = useRef(load)
  loader.current = load
  // The preview is read when the pointer arrives, so that it is usually there when the card opens 500 ms later.
  const reading = useRef<{ promise: Promise<DocPreview>, value?: DocPreview }>()
  // The pointer that pressed the trigger last: a touch taps it open, a mouse or pen keeps hovering and clicking.
  const pressed = useRef<{ touch: boolean, trigger?: Element }>({ touch: false })
  const read = () => {
    if (open || reading.current) return
    const entry: { promise: Promise<DocPreview>, value?: DocPreview } = { promise: loader.current() }
    entry.promise.then(value => { entry.value = value }, () => {})
    reading.current = entry
  }
  // Where the pending timer takes the card; a pointer resting on the trigger rearms an opening that nothing scheduled
  // (the card closed under it, or the trigger was drawn again beneath a still pointer, which sends no pointerenter).
  const heading = useRef<boolean>()
  const schedule = (next: boolean) => {
    clearTimeout(timer.current)
    if (next) read()
    heading.current = next
    timer.current = setTimeout(() => { heading.current = undefined; setOpen(next) }, next ? PREVIEW_OPEN_DELAY : PREVIEW_CLOSE_DELAY)
  }
  const hold = () => { clearTimeout(timer.current); heading.current = undefined }
  // Closed by the author (Escape, one of its buttons): the pointer still on the trigger does not bring it back.
  const dismissed = useRef(false)
  const dismiss = () => { hold(); dismissed.current = true; setOpen(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    let active = true
    const entry = reading.current
    reading.current = undefined
    // Already read during the hover delay: shown at once, without a loading line first.
    if (entry?.value) { setPreview(entry.value); return }
    setPreview('loading')
    const read = entry?.promise ?? loader.current()
    read.then(value => { if (active) setPreview(value) }, () => { if (active) setPreview('failed') })
    return () => { active = false }
  }, [open])
  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    describedBy: open ? id : undefined,
    onPointerEnter: (event: ReactPointerEvent) => { if (event.pointerType !== 'touch') schedule(true) },
    onPointerMove: (event: ReactPointerEvent) => {
      if (event.pointerType === 'touch' || event.buttons !== 0 || dismissed.current) return
      if (open ? heading.current === false : heading.current === undefined) { if (open) hold(); else schedule(true) }
    },
    onPointerLeave: (event: ReactPointerEvent) => { if (event.pointerType !== 'touch') { dismissed.current = false; schedule(false) } },
    onPointerDown: (event: ReactPointerEvent) => { pressed.current = { touch: event.pointerType === 'touch', trigger: event.currentTarget as Element } },
    // Capturing, so that the trigger's own click (going to the target) does not run.
    onClickCapture: (event: ReactMouseEvent) => {
      if (!pressed.current.touch) return
      pressed.current.touch = false
      event.preventDefault()
      event.stopPropagation()
      hold()
      if (!open) read()
      setOpen(!open)
    },
    onFocus: () => { if (!pressed.current.touch) schedule(true) },
    onBlur: (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node && document.getElementById(id)?.contains(event.relatedTarget))) schedule(false) },
    onKeyDownCapture: (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && open) { event.stopPropagation(); dismiss() } },
  })
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>{trigger}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content id={id} className="pm-ui-doc-preview pm-ui-floating pm-ui" aria-label={label} side="bottom" align="start" sideOffset={6} collisionPadding={16}
          onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
          onInteractOutside={event => { if (event.target instanceof Node && pressed.current.trigger?.contains(event.target)) event.preventDefault() }}
          onPointerEnter={hold} onPointerLeave={() => schedule(false)}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) schedule(false) }}
          onEscapeKeyDown={event => { event.stopPropagation(); hold(); dismissed.current = true }}>
          {preview === 'loading' ? <p className="pm-ui-doc-preview__excerpt" role="status">{loadingLabel}</p>
            : preview === 'failed' ? <p className="pm-ui-doc-preview__excerpt" role="status">{failedLabel}</p>
              : <>
                {preview.path.length > 0 && <p className="pm-ui-doc-preview__path">{preview.path.join(' › ')}</p>}
                <p className="pm-ui-doc-preview__title">{preview.title}</p>
                {preview.excerpt && <p className="pm-ui-doc-preview__excerpt">{preview.excerpt}</p>}
                <p className="pm-ui-doc-preview__meta">{preview.meta}</p>
                {/* An action leads elsewhere (the document, or the right pane): the card closes behind it. */}
                {!preview.missing && actions && <div className="pm-ui-doc-preview__actions" onClick={dismiss}>{actions}</div>}
              </>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export interface MentionOption { id: string, title: string, path: string[] }

/**
 * The list typing @ or [[ opens in the text: matching documents with the path that tells equal titles apart, and last
 * "new child document … and link". The editor owns the keyboard (↑↓, Enter, Esc) and passes the active index.
 */
export function PmMentionPicker({ heading, options, active, createLabel, hint, emptyLabel, loading, loadingLabel, failed, listId, optionId, onSelect, onCreate, onActiveChange }: {
  heading: string, options: readonly MentionOption[], active: number, createLabel?: string, hint: string, emptyLabel: string,
  loading?: boolean, loadingLabel: string, failed?: string,
  /** The ids the editor's aria-controls and aria-activedescendant name, when it owns them. */
  listId?: string, optionId?(index: number): string,
  onSelect(option: MentionOption): void, onCreate?(): void, onActiveChange?(index: number): void,
}) {
  const id = useId()
  const option = (index: number) => optionId?.(index) ?? `${id}-${index}`
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])
  return (
    <div className="pm-ui-mention-picker pm-ui-floating pm-ui" data-density="compact">
      <p className="pm-ui-mention-picker__heading" id={`${id}-heading`}>{heading}</p>
      <div ref={list} className="pm-ui-mention-picker__list" role="listbox" id={listId ?? `${id}-list`} aria-labelledby={`${id}-heading`} aria-activedescendant={option(active)} aria-busy={loading || undefined}>
        {options.map((item, index) => (
          <div key={item.id} id={option(index)} role="option" aria-selected={index === active} className="pm-ui-mention-picker__option"
            onPointerMove={() => { if (index !== active) onActiveChange?.(index) }} onMouseDown={event => { event.preventDefault(); onSelect(item) }}>
            <PmIcon name="document" />
            <span className="pm-ui-mention-picker__text"><span className="pm-ui-mention-picker__title">{item.title}</span>{item.path.length > 0 && <span className="pm-ui-mention-picker__path">{item.path.join(' › ')}</span>}</span>
          </div>
        ))}
        {!options.length && <p className="pm-ui-mention-picker__status" role="status">{failed ?? (loading ? loadingLabel : emptyLabel)}</p>}
        {createLabel && onCreate && <div id={option(options.length)} role="option" aria-selected={active === options.length} className="pm-ui-mention-picker__option" data-create=""
          onPointerMove={() => { if (active !== options.length) onActiveChange?.(options.length) }} onMouseDown={event => { event.preventDefault(); onCreate() }}>
          <PmIcon name="plus" /><span className="pm-ui-mention-picker__title">{createLabel}</span>
        </div>}
      </div>
      <p className="pm-ui-mention-picker__hint">{hint}</p>
    </div>
  )
}

/**
 * A block shown from another document: the source in its header, the actions (Edit Original, Convert to Copy) while
 * hovered or focused, and a dashed warning frame when the source was moved to the trash or no longer exists.
 */
export function PmSyncedBlockFrame({ source, state = 'default', stateLabel, actions, children, label }: { source: ReactNode, state?: 'default' | 'missing' | 'trashed', stateLabel?: string, actions?: ReactNode, children?: ReactNode, label: string }) {
  return (
    <figure className="pm-ui-synced-block" data-state={state === 'default' ? undefined : state} aria-label={label}>
      <figcaption className="pm-ui-synced-block__header">
        <PmIcon name={state === 'default' ? 'synced' : 'warning'} />
        <span className="pm-ui-synced-block__source">{state === 'default' ? source : stateLabel}</span>
        {actions && <span className="pm-ui-synced-block__actions">{actions}</span>}
      </figcaption>
      <div className="pm-ui-synced-block__body">{children}</div>
    </figure>
  )
}

/**
 * Another document shown read-only beside the open one (the right pane's "Open on the Side"): its ancestors as a
 * breadcrumb (each opens there in turn), its title, the actions (Open) and Close, a notice when it is in the trash or
 * gone, and its content, which scrolls on its own. The frame takes focus when it opens.
 */
export const PmDocPeek = forwardRef<HTMLElement, { label: string, path: readonly { id: string, title: string }[], title: string, actions?: ReactNode, closeLabel: string, onClose(): void, onPath?(id: string): void, notice?: ReactNode, busy?: boolean, children?: ReactNode, bodyRef?: (node: HTMLDivElement | null) => void }>(function PmDocPeek({ label, path, title, actions, closeLabel, onClose, onPath, notice, busy, children, bodyRef }, ref) {
  return (
    <section ref={ref} className="pm-ui-doc-peek" aria-label={label} aria-busy={busy || undefined} tabIndex={-1}>
      <header className="pm-ui-doc-peek__header">
        <div className="pm-ui-doc-peek__heading">
          {path.length > 0 && <ol className="pm-ui-doc-peek__path">
            {path.map(item => <li key={item.id}>{onPath ? <button type="button" className="pm-ui-doc-peek__crumb" title={item.title} onClick={() => onPath(item.id)}>{item.title}</button> : <span title={item.title}>{item.title}</span>}</li>)}
          </ol>}
          <h2 className="pm-ui-doc-peek__title"><PmIcon name="document" /><span>{title}</span></h2>
        </div>
        <div className="pm-ui-doc-peek__actions">
          {actions}
          <PmIconButton small icon="close" label={closeLabel} onClick={onClose} />
        </div>
      </header>
      {notice}
      <div ref={bodyRef} className="pm-ui-doc-peek__body">{children}</div>
    </section>
  )
})

/** One place that cites the document: the citing document's title and the sentence around the citation. */
export interface BacklinkPlace { id: string, excerpt: string, meta?: string, synced?: boolean }

/**
 * A document that cites this one: its title, then each place with the sentence around it (two lines at most) and what
 * tells equal sentences apart (`meta`). One place makes the whole card the button; several are a list under the title.
 * With `onPeek`, each place has a second, smaller action at its end (Open on the Side), always shown.
 */
export function PmBacklinkItem({ title, count, places, syncedLabel, peekLabel, onActivate, onPeek }: { title: string, count?: string, places: readonly BacklinkPlace[], syncedLabel?: string, peekLabel?: string, onActivate(id: string): void, onPeek?(id: string): void }) {
  const icon = (place: BacklinkPlace) => <PmIcon name={place.synced ? 'synced' : 'document'} />
  const label = (place: BacklinkPlace) => place.synced && syncedLabel ? <span className="pm-ui-sr-only">{syncedLabel}</span> : null
  const peek = (place: BacklinkPlace) => onPeek && peekLabel ? <PmIconButton small icon="rail" className="pm-ui-backlink__peek" label={peekLabel} onClick={() => onPeek(place.id)} /> : null
  if (places.length === 1) {
    const place = places[0]!
    const card = (
      <button type="button" className="pm-ui-backlink" title={title} onClick={() => onActivate(place.id)}>
        <span className="pm-ui-backlink__title">{icon(place)}<span className="pm-ui-backlink__name">{title}</span>{label(place)}</span>
        {place.excerpt && <span className="pm-ui-backlink__excerpt">{place.excerpt}</span>}
        {place.meta && <span className="pm-ui-backlink__meta">{place.meta}</span>}
      </button>
    )
    const action = peek(place)
    return action ? <div className="pm-ui-backlink__row">{card}{action}</div> : card
  }
  return (
    <div className="pm-ui-backlink" data-group="">
      <span className="pm-ui-backlink__title" title={title}><PmIcon name="document" /><span className="pm-ui-backlink__name">{title}</span>{count && <span className="pm-ui-backlink__count">{count}</span>}</span>
      <ul className="pm-ui-backlink__places">{places.map(place => (
        <li key={place.id} className="pm-ui-backlink__row"><button type="button" className="pm-ui-backlink__place" onClick={() => onActivate(place.id)}>
          {place.excerpt && <span className="pm-ui-backlink__excerpt">{place.excerpt}</span>}
          <span className="pm-ui-backlink__meta">{icon(place)}{place.meta}{label(place)}</span>
        </button>{peek(place)}</li>
      ))}</ul>
    </div>
  )
}

export interface ToastAction { label: string, run(): void }
/** `action` is one command (Undo) or a few (Open, Download), in their order. */
export interface ToastMessage { id: string, text: string, tone?: 'neutral' | 'danger', action?: ToastAction | readonly ToastAction[] }

/**
 * One message at a time at the bottom center, in the inverse colors: it closes by itself after 4 seconds (not while the
 * pointer or the keyboard is on it); errors stay until closed. Polite for results, assertive for errors.
 */
export function PmToast({ toast, closeLabel, onClose }: { toast?: ToastMessage, closeLabel: string, onClose(id: string): void }) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!toast || toast.tone === 'danger' || paused) return
    const timer = setTimeout(() => onClose(toast.id), TOAST_DURATION)
    return () => clearTimeout(timer)
  }, [toast, paused, onClose])
  useEffect(() => setPaused(false), [toast?.id])
  return (
    <div className="pm-ui-toast-region pm-ui">
      <div role="status" aria-live="polite" className="pm-ui-sr-only">{toast && toast.tone !== 'danger' ? toast.text : ''}</div>
      <div role="alert" aria-live="assertive" className="pm-ui-sr-only">{toast?.tone === 'danger' ? toast.text : ''}</div>
      {toast && <div className="pm-ui-toast" data-tone={toast.tone === 'danger' ? 'danger' : undefined}
        onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setPaused(false) }}>
        <PmIcon name={toast.tone === 'danger' ? 'warning' : 'check'} />
        <span className="pm-ui-toast__text" aria-hidden="true">{toast.text}</span>
        {(toast.action === undefined ? [] : 'run' in toast.action ? [toast.action] : toast.action).map(action => <PmButton key={action.label} small variant="text" className="pm-ui-toast__action" onClick={() => { action.run(); onClose(toast.id) }}>{action.label}</PmButton>)}
        <PmIconButton icon="close" small className="pm-ui-toast__close" label={closeLabel} onClick={() => onClose(toast.id)} />
      </div>}
    </div>
  )
}
