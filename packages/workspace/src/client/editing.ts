/**
 * The source editor's places in the shell (P-124, docs/architecture.md 5.11,
 * docs/design/edit.dc.html): the source pane of edit mode (the `source`
 * slot: the file's notice, the editor, the problems of the compilation), the
 * open files' tabs (`tabs`, in edit mode's top bar), the cursor's line in the
 * status bar (`status`), "commit N changes" (`tools`) and the changes not
 * committed (also at the head of the history); on the home page the file
 * tree (`files`), whose files open in the editor: a document's on its page in
 * edit mode, the workspace's configuration on the home page itself.
 */
import { PmBadge, PmButton, PmEmpty, PmIcon, PmMenu, PmNotice, PmToolbarEntry, useMessages } from '@presmium/host'
import type { MenuItem } from '@presmium/host'
import type { Finding } from '@presmium/kernel'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { WORKSPACE_FILE } from '../domain/api.ts'
import type { SourceFile } from '../domain/api.ts'
import { WORKSPACE_MESSAGES } from '../domain/messages.ts'
import type { WorkspaceMessages } from '../domain/messages.ts'
import type { Problem, SourceEditor } from './editor.ts'
import { elementOf, inView, mark, placeAt, placeOfClick, usePreview } from './preview.ts'
import type { Place } from './preview.ts'
import { failure, onDocumentsChange } from './routes.ts'
import { activePath, bindEditor, checkDisk, closeFile, commitChanges, cursorLine, deckPath, discardChanges, edited, editing, find, listing, loadListing, loadUncommitted, mergeFile, openFailure, openFile, openFiles, reloadFile, requested, reveal, saveFile, textOf, uncommitted, workspacePath } from './source.ts'

/** A file's name in its tab and menus: its path in the document (on the home page, in the workspace). */
function shortName(path: string): string {
  return deckPath(listing.value?.document ?? '', path) ?? path
}

/** The language the status bar names. */
function languageOf(path: string): string {
  if (/\.(?:md|markdown)$/i.test(path)) return 'MyST'
  if (/\.ya?ml$/i.test(path)) return 'YAML'
  return path.split('.').at(-1)?.toUpperCase() ?? ''
}

const SEVERITY_ICON: Record<Finding['severity'], string> = { error: '●', warning: '▲', info: '○' }
const severityColor = (severity: Finding['severity']) => (severity === 'error' ? 'var(--pm-color-danger)' : severity === 'warning' ? 'var(--pm-color-warn)' : 'var(--pm-color-accent)')

/** What the pane says of the file shown, with what the author may do. */
function notice(t: WorkspaceMessages) {
  const file = find(activePath.value)
  const message = openFailure.value
  if (message) return h(PmNotice, { 'class': 'pm-source__notice', 'tone': 'danger', 'data-kind': 'open' }, () => message)
  const said = file?.notice
  if (!file || !said) return null
  const actions = (...buttons: [string, string, () => void][]) => h('span', { style: { display: 'inline-flex', gap: 'var(--pm-space-2)', marginInlineStart: 'var(--pm-space-2)' } }, buttons.map(([name, label, run]) => h(PmButton, { class: `pm-source__${name}`, small: true, onClick: run }, () => label)))
  const box = (tone: 'warn' | 'accent' | 'ok' | 'danger', text: string, buttons?: ReturnType<typeof actions>) => h(PmNotice, { 'class': 'pm-source__notice', tone, 'data-kind': said.kind, 'role': tone === 'danger' || said.kind === 'locked' || said.kind === 'changed' ? 'alert' : 'status' }, () => [text, buttons ?? null])
  switch (said.kind) {
    case 'locked': return box('warn', t.saveLocked(said.by), actions(['retry', t.retry, () => void saveFile(file.path)]))
    case 'changed': return box('warn', t.changedOnDisk(shortName(file.path)), actions(['merge', t.merge, () => mergeFile(file.path, t)], ['reload', t.reload, () => reloadFile(file.path)]))
    case 'merged': return box('accent', t.merged(said.conflicts))
    case 'config': return box('ok', t.configSaved)
    case 'failed': return box('danger', t.saveFailed(said.message))
  }
}

/**
 * The source pane (the `source` slot of edit mode): the notice of the file
 * shown, the editor (loaded with the pane), and the problems of the
 * compilation, each opening its line. On a document's page the preview and
 * the source follow each other, and the open files follow the disk after
 * each compilation and when the window comes back.
 */
export const SourcePane = defineComponent({
  name: 'PmWorkspaceSource',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const preview = usePreview()
    const host = ref<HTMLElement>()
    const ready = ref(false)
    let editor: SourceEditor | undefined
    let unbind: (() => void) | undefined
    let alive = true
    const document = computed(() => listing.value?.document ?? '')
    /** The compilation's problems that name a file, by its path in the workspace. */
    const problems = computed(() => (preview.value?.doc.value.diagnostics ?? []).flatMap(finding => (finding.source ? [{ finding, path: workspacePath(document.value, finding.source.file), line: finding.source.line }] : [])))

    /** The file first shown: the one a link asked for, else the current section's, else the deck's entry. */
    const openFirst = async () => {
      const files = await loadListing()
      const doc = document.value
      if (requested.value !== undefined) {
        const path = workspacePath(doc, requested.value)
        requested.value = undefined
        if (await openFile(path)) return
      }
      const viewer = preview.value
      const section = viewer && viewer.section(viewer.position.value.section)
      if (section && await openFile(workspacePath(doc, section.source.file), { line: section.source.line })) return
      const entry = files?.files.find(file => file.path === workspacePath(doc, 'lecture.md')) ?? files?.files.find(file => !file.binary)
      if (entry) await openFile(entry.path)
    }

    onMounted(async () => {
      const { createEditor } = await import('./editor.ts')
      if (!alive || !host.value) return
      editor = createEditor(host.value, {
        label: t.value.source,
        save: () => void saveFile(),
        changed: edited,
        moved: (line) => {
          cursorLine.value = line
        },
      })
      unbind = bindEditor({ text: path => editor?.text(path), replace: (path, text, fresh) => editor?.replace(path, text, fresh) })
      ready.value = true
      void loadUncommitted()
      if (openFiles.value.length === 0) await openFirst()
    })
    onBeforeUnmount(() => {
      alive = false
      // The texts not saved stay, for when the pane comes back.
      for (const file of openFiles.value) file.draft = file.dirty ? editor?.text(file.path) ?? file.draft : undefined
      unbind?.()
      editor?.destroy()
      editor = undefined
      mark(undefined)
    })

    // The file shown, then the place asked for in it.
    let shownReveal = 0
    watch([activePath, reveal, ready], () => {
      const file = find(activePath.value)
      if (!editor || !file) return
      editor.show(file.path, file.draft ?? file.base)
      const place = reveal.value
      if (place && place.path === file.path && place.seq !== shownReveal) {
        shownReveal = place.seq
        editor.reveal(place.line, place.endLine, place.mark)
      }
    }, { flush: 'post' })
    // Closed files leave the editor.
    watch(() => openFiles.value.map(file => file.path), (now, before) => {
      for (const path of before ?? []) if (!now.includes(path)) editor?.forget(path)
    })
    // The problems on their lines.
    watch([problems, ready, () => openFiles.value.length], () => {
      for (const file of openFiles.value) {
        editor?.problems(file.path, problems.value.filter(problem => problem.path === file.path && problem.line).map((problem): Problem => ({ line: problem.line!, severity: problem.finding.severity, message: problem.finding.message })))
      }
    })

    // The preview follows the cursor; a pick in the preview opens its lines (a document's page only).
    let last: string | undefined
    let waiting: Place | undefined
    /** The control that had the focus when the preview went to another of the document's pages, which may take it. */
    let keep: { element: HTMLElement, until: number } | undefined
    const keyOf = (place: Place) => `${place.section}\0${place.block ?? ''}`
    /** Marks the place waited for once its page shows it (a page loads in a few frames). */
    const settle = (deadline: number) => requestAnimationFrame(() => {
      if (!waiting) return
      const element = elementOf(waiting)
      if (!element) {
        if (Date.now() < deadline) settle(deadline)
        return
      }
      waiting = undefined
      mark(element)
      if (!inView(element)) element.scrollIntoView({ block: 'center' })
    })
    const show = (place: Place) => {
      const element = elementOf(place)
      if (!element) {
        waiting = place
        // Another page: the site moves the focus to its top when a page opens; the source pane keeps it.
        const focused = window.document.activeElement
        if (focused instanceof HTMLElement && host.value?.closest('.pm-source')?.contains(focused)) keep = { element: focused, until: Date.now() + 3000 }
        preview.value?.show({ section: place.section, step: 0 })
        settle(Date.now() + 5000)
        return
      }
      waiting = undefined
      mark(element)
      if (!inView(element)) element.scrollIntoView({ block: 'center' })
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!keep) return
      const { element, until } = keep
      if (Date.now() > until || !element.isConnected) {
        keep = undefined
        return
      }
      if (element.contains(event.target as Node)) return
      keep = undefined
      element.focus({ preventScroll: true })
    }
    // The author's own press elsewhere ends it.
    const onPointer = () => keep = undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    watch([cursorLine, activePath], () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const viewer = preview.value
        const file = activePath.value && deckPath(document.value, activePath.value)
        if (!viewer || !file) return
        const place = placeAt(viewer.doc.value, file, cursorLine.value)
        if (!place || keyOf(place) === last) return
        last = keyOf(place)
        show(place)
      }, 150)
    })
    const onClick = (event: MouseEvent) => {
      const doc = preview.value?.doc.value
      const place = doc && placeOfClick(doc, event)
      if (!place) return
      last = keyOf(place)
      mark(elementOf(place))
      void openFile(workspacePath(document.value, place.source.file), { line: place.source.line, endLine: place.source.endLine, mark: true })
    }
    // After a compilation the page renders again: the mark comes back, and the files are compared with the disk.
    const remark = () => {
      const viewer = preview.value
      const file = activePath.value && deckPath(document.value, activePath.value)
      const place = waiting ?? (viewer && file ? placeAt(viewer.doc.value, file, cursorLine.value) : undefined)
      const element = place && elementOf(place)
      if (element && !waiting) mark(element)
    }
    watch(() => preview.value?.doc.value, async () => {
      await nextTick()
      requestAnimationFrame(remark)
      void checkDisk()
    })
    const onFocus = () => void checkDisk()
    // An undo of the history, a commit or a discard: the open files follow the disk.
    onDocumentsChange(onFocus)
    onMounted(() => {
      window.document.addEventListener('click', onClick)
      window.document.addEventListener('focusin', onFocusIn)
      window.document.addEventListener('pointerdown', onPointer, true)
      window.addEventListener('focus', onFocus)
    })
    onBeforeUnmount(() => {
      clearTimeout(timer)
      window.document.removeEventListener('click', onClick)
      window.document.removeEventListener('focusin', onFocusIn)
      window.document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('focus', onFocus)
    })

    const problemsList = () => h('div', { 'class': 'pm-source__problems', 'role': 'region', 'aria-label': t.value.problems(problems.value.length), 'style': { flex: 'none', maxHeight: '35%', overflow: 'auto', padding: 'var(--pm-space-2) var(--pm-space-4)', borderTop: '1px solid var(--pm-color-line)', background: 'var(--pm-color-bg)', fontSize: 'var(--pm-text-sm)' } }, [
      h('div', { style: { display: 'flex', gap: 'var(--pm-space-4)', marginBottom: 'var(--pm-space-1)' } }, [
        h('span', { class: 'pm-source__problems-tab', style: { color: 'var(--pm-color-ink)', fontWeight: 600, borderBottom: '2px solid var(--pm-color-accent)' } }, t.value.problems(problems.value.length)),
      ]),
      problems.value.length === 0
        ? h('p', { style: { margin: 0, color: 'var(--pm-color-muted)' } }, t.value.noProblems)
        : h('ul', { class: 'pm-ui-list', style: { display: 'grid', gap: '2px' } }, problems.value.map(({ finding, path, line }, i) => h('li', { key: i, style: { padding: 0, border: 0 } }, [
            h('button', {
              'type': 'button',
              'class': 'pm-source__problem',
              'data-severity': finding.severity,
              'style': { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--pm-space-2)', width: '100%', padding: '2px 4px', border: 0, borderRadius: 'var(--pm-radius-small)', background: 'transparent', color: 'var(--pm-color-ink)', font: 'inherit', textAlign: 'start', cursor: 'pointer' },
              'onClick': () => void openFile(path, line ? { line } : undefined),
            }, [
              h('span', { 'aria-hidden': 'true', 'style': { color: severityColor(finding.severity) } }, SEVERITY_ICON[finding.severity]),
              h('span', { class: 'pm-source__problem-place', style: { fontFamily: 'var(--pm-font-mono)', color: 'var(--pm-color-muted)' } }, `${shortName(path)}${line ? `:${line}` : ''}`),
              h('span', { class: 'pm-source__problem-message' }, finding.message),
              finding.hint ? h('span', { style: { color: 'var(--pm-color-muted)' } }, finding.hint) : null,
            ]),
          ]))),
    ])

    return () => h('div', { class: 'pm-source', style: { display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, background: 'var(--pm-color-code)' } }, [
      h('div', { style: { flex: 'none', padding: notice(t.value) ? 'var(--pm-space-2) var(--pm-space-3) 0' : 0 } }, [notice(t.value)]),
      openFiles.value.length === 0 && ready.value ? h(PmEmpty, { class: 'pm-source__empty', icon: 'document' }, () => t.value.noFile) : null,
      h('div', { ref: host, class: 'pm-source__editor', style: { flex: 1, minHeight: 0, overflow: 'hidden', display: openFiles.value.length === 0 ? 'none' : undefined } }),
      listing.value?.home ? null : problemsList(),
    ])
  },
})

/** The open files' tabs (the `tabs` slot of edit mode's top bar): a dot on one not saved; a menu opens the others. */
export const FileTabs = defineComponent({
  name: 'PmWorkspaceTabs',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const list = ref<HTMLElement>()
    onMounted(() => void loadListing())
    const move = (event: KeyboardEvent) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      const files = openFiles.value
      if (!step || files.length === 0) return
      event.preventDefault()
      const at = files.findIndex(file => file.path === activePath.value)
      activePath.value = files[(at + step + files.length) % files.length]!.path
      void nextTick(() => list.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
    }
    const items = computed((): MenuItem[] => [
      ...(listing.value?.files ?? []).map((file: SourceFile) => ({ id: file.path, label: shortName(file.path), icon: 'document' as const, ...file.binary ? { disabled: true } : {} })),
      { id: '', label: t.value.closeFile, icon: 'close', disabled: !activePath.value },
    ])
    const choose = (id: string) => {
      if (id === '') {
        if (activePath.value) closeFile(activePath.value)
        if (openFiles.value.length === 0 && listing.value?.home) editing.value = false
        return
      }
      void openFile(id)
    }
    return () => (editing.value
      ? h('div', { class: 'pm-workspace-tabs', style: { display: 'flex', alignItems: 'center', gap: 'var(--pm-space-1)', minWidth: 0 } }, [
          h('div', { 'ref': list, 'class': 'pm-workspace-tabs__list', 'role': 'tablist', 'aria-label': t.value.openFiles, 'style': { display: 'flex', gap: '2px', minWidth: 0, overflowX: 'auto' }, 'onKeydown': move }, openFiles.value.map((file) => {
            const selected = file.path === activePath.value
            return h('button', {
              'key': file.path,
              'type': 'button',
              'role': 'tab',
              'class': 'pm-workspace-tab',
              'data-path': file.path,
              'aria-selected': selected ? 'true' : 'false',
              'tabindex': selected ? 0 : -1,
              'title': file.path,
              'style': { display: 'inline-flex', flex: 'none', alignItems: 'center', gap: 'var(--pm-space-2)', padding: '5px 12px', border: `1px solid ${selected ? 'var(--pm-color-line)' : 'transparent'}`, borderRadius: 'var(--pm-radius-control)', background: selected ? 'var(--pm-color-surface)' : 'transparent', color: selected ? 'var(--pm-color-ink)' : 'var(--pm-color-muted)', fontFamily: 'var(--pm-font-mono)', fontSize: '0.78125rem', cursor: 'pointer' },
              'onClick': () => activePath.value = file.path,
            }, [
              shortName(file.path),
              file.dirty ? h('span', { 'class': 'pm-workspace-tab__dirty', 'aria-hidden': 'true', 'style': { width: '7px', height: '7px', borderRadius: '50%', background: 'var(--pm-color-warn)' } }) : null,
              file.dirty ? h('span', { class: 'pm-ui-sr-only' }, `（${t.value.unsaved}）`) : null,
            ])
          })),
          h(PmMenu, { label: t.value.filesMenu, icon: 'chevron-down', items: items.value, onSelect: choose }),
        ])
      : null)
  },
})

/** The status bar's part of the editor: the file's language, its encoding and the cursor's line. */
export const EditorStatus = defineComponent({
  name: 'PmWorkspaceCursor',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    return () => (editing.value && activePath.value
      ? h('span', { class: 'pm-workspace-cursor' }, `${languageOf(activePath.value)} · UTF-8 · ${t.value.line(cursorLine.value)}`)
      : null)
  },
})

/**
 * The changes not committed (P-124): each file with its lines added and
 * removed, a line saying what changed and the commit (one commit,
 * `Presmium-Origin: editor`, which the history lists and may undo), or the
 * discard (the files as committed).
 */
export const Uncommitted = defineComponent({
  name: 'PmWorkspaceUncommitted',
  props: {
    /** Where it is drawn: a heading of its own in the history. */
    heading: Boolean,
  },
  setup(props) {
    const t = useMessages(WORKSPACE_MESSAGES)
    const message = ref('')
    const busy = ref(false)
    const note = ref<string>()
    onMounted(() => void loadUncommitted())
    onDocumentsChange(() => void loadUncommitted())
    const run = async (work: () => Promise<unknown>) => {
      busy.value = true
      note.value = undefined
      try {
        await work()
      } catch (error) {
        note.value = failure(error, t.value)
      } finally {
        busy.value = false
        await loadUncommitted()
      }
    }
    const commit = () => run(async () => {
      await commitChanges(message.value.trim())
      message.value = ''
    })
    const discard = () => {
      if (window.confirm(t.value.confirmDiscard(uncommitted.value.length))) void run(() => discardChanges())
    }
    return () => h('section', { 'class': 'pm-workspace-uncommitted', 'aria-label': t.value.uncommitted, 'style': { display: 'grid', gap: 'var(--pm-space-2)' } }, [
      props.heading ? h('h3', { class: 'pm-ui-heading', style: { margin: 0 } }, t.value.uncommitted) : null,
      uncommitted.value.length === 0
        ? h('p', { style: { margin: 0, color: 'var(--pm-color-muted)' } }, t.value.noUncommitted)
        : h('ul', { class: 'pm-workspace-uncommitted__list pm-ui-list', style: { fontSize: 'var(--pm-text-sm)' } }, uncommitted.value.map(file => h('li', { 'key': file.path, 'class': 'pm-workspace-uncommitted__file', 'data-path': file.path, 'style': { display: 'flex', alignItems: 'baseline', gap: 'var(--pm-space-2)' } }, [
            h(PmBadge, { tone: file.kind === 'deleted' ? 'danger' : file.kind === 'added' ? 'ok' : 'outline', pill: true }, () => t.value.changeKind[file.kind]),
            h('span', { style: { flex: 1, minWidth: 0, fontFamily: 'var(--pm-font-mono)', overflowWrap: 'anywhere' } }, shortName(file.path)),
            file.added !== undefined ? h('span', { style: { fontFamily: 'var(--pm-font-mono)', whiteSpace: 'nowrap' } }, [h('span', { style: { color: 'var(--pm-color-add)' } }, `+${file.added}`), ' ', h('span', { style: { color: 'var(--pm-color-del)' } }, `−${file.removed ?? 0}`)]) : null,
          ]))),
      uncommitted.value.length === 0
        ? null
        : h('form', {
            class: 'pm-workspace-commit-form',
            style: { display: 'grid', gap: 'var(--pm-space-2)' },
            onSubmit: (event: Event) => {
              event.preventDefault()
              if (message.value.trim()) void commit()
            },
          }, [
            h('textarea', { 'name': 'message', 'class': 'pm-ui-textarea', 'rows': 2, 'maxlength': 4000, 'value': message.value, 'aria-label': t.value.commitMessage, 'placeholder': t.value.commitMessage, 'onInput': (event: Event) => message.value = (event.target as HTMLTextAreaElement).value, 'onKeydown': (event: KeyboardEvent) => event.stopPropagation() }),
            h('div', { style: { display: 'flex', gap: 'var(--pm-space-2)' } }, [
              h(PmButton, { class: 'pm-workspace-commit-form__commit', type: 'submit', variant: 'primary', small: true, icon: 'check', disabled: busy.value || !message.value.trim() }, () => t.value.commit),
              h(PmButton, { class: 'pm-workspace-commit-form__discard', variant: 'danger', small: true, icon: 'undo', disabled: busy.value, onClick: discard }, () => t.value.discard),
            ]),
          ]),
      note.value ? h(PmNotice, { tone: 'danger' }, () => note.value) : null,
    ])
  },
})

/** "Commit N changes" in edit mode's toolbar: the changes not committed, to commit or discard. */
export const CommitEntry = defineComponent({
  name: 'PmWorkspaceCommit',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const open = ref(false)
    watch(editing, (on) => {
      if (on) void loadUncommitted()
    }, { immediate: true })
    onDocumentsChange(() => void loadUncommitted())
    return () => (editing.value && uncommitted.value.length > 0
      ? h(PmToolbarEntry, { 'name': 'pm-workspace-commit', 'label': t.value.commitChanges(uncommitted.value.length), 'closeLabel': t.value.close, 'open': open.value, 'onUpdate:open': (next: boolean) => open.value = next }, () => [h(Uncommitted)])
      : null)
  },
})

interface TreeNode {
  name: string
  path: string
  children?: TreeNode[]
}

/** The files of a document as a tree of its directories, each directory before the files. */
function tree(dir: string, files: SourceFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: dir, children: [] }
  for (const file of files) {
    const rest = dir ? file.path.slice(dir.length + 1) : file.path
    const parts = rest.split('/')
    let at = root
    parts.forEach((part, i) => {
      const path = `${at.path ? `${at.path}/` : ''}${part}`
      if (i === parts.length - 1) {
        at.children!.push({ name: part, path })
        return
      }
      let next = at.children!.find(child => child.children && child.name === part)
      if (!next) at.children!.push(next = { name: part, path, children: [] })
      at = next
    })
  }
  const order = (nodes: TreeNode[]): TreeNode[] => nodes.sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name)).map(node => (node.children ? { ...node, children: order(node.children) } : node))
  return order(root.children!)
}

/** The page of a document, at a file in edit mode. */
function editUrl(document: string, file: string): string {
  const url = new URL(`${document.split('/').map(encodeURIComponent).join('/')}/`, location.href)
  url.searchParams.set('edit', file)
  return url.href
}

/**
 * The home page's file tree (the `files` slot, the workbench's side bar):
 * each document a folder of its files and directories, then the workspace's
 * configuration. A document's file opens on its page in edit mode; the
 * configuration in the home page's editor.
 */
export const FileTree = defineComponent({
  name: 'PmWorkspaceFiles',
  props: {
    /** The folders open at first. */
    expanded: { type: Array as PropType<string[]>, default: () => [] },
  },
  setup(props) {
    const t = useMessages(WORKSPACE_MESSAGES)
    const open = ref(new Set<string>(props.expanded))
    onMounted(() => void loadListing(true))
    onDocumentsChange(() => void loadListing(true))
    const toggle = (path: string) => {
      const next = new Set(open.value)
      if (!next.delete(path)) next.add(path)
      open.value = next
    }
    const choose = (document: string | undefined, path: string) => {
      if (document === undefined) {
        editing.value = true
        void openFile(path)
        return
      }
      location.assign(editUrl(document, path.slice(document ? document.length + 1 : 0)))
    }
    const row = (depth: number, content: unknown[], attrs: Record<string, unknown>) => h('button', {
      type: 'button',
      class: 'pm-workbench__file',
      style: { width: '100%', paddingInlineStart: `calc(8px + ${depth} * 14px)`, border: 0, background: 'transparent', font: 'inherit', textAlign: 'start', cursor: 'pointer' },
      ...attrs,
    }, content as never)
    const nodes = (document: string, list: TreeNode[], depth: number): unknown[] => list.map(node => h('li', { key: node.path }, node.children
      ? [
          row(depth, [h(PmIcon, { name: open.value.has(node.path) ? 'chevron-down' : 'chevron-right', size: 14 }), `${node.name}/`], { 'aria-expanded': open.value.has(node.path) ? 'true' : 'false', 'onClick': () => toggle(node.path) }),
          open.value.has(node.path) ? h('ul', { role: 'list', class: 'pm-workbench__tree' }, nodes(document, node.children, depth + 1) as never) : null,
        ]
      : [row(depth, [h(PmIcon, { name: 'document', size: 14 }), node.name], { 'data-path': node.path, 'onClick': () => choose(document, node.path) })]))
    return () => {
      const known = listing.value
      if (!known?.home) return null
      const documents = known.documents ?? []
      return h('nav', { 'class': 'pm-workspace-tree', 'aria-label': t.value.fileTree }, [
        h('ul', { role: 'list', class: 'pm-workbench__tree' }, [
          ...documents.map(dir => h('li', { key: dir }, [
            row(0, [h(PmIcon, { name: open.value.has(dir) ? 'chevron-down' : 'chevron-right', size: 14 }), `${dir}/`], { 'class': 'pm-workbench__file pm-workspace-tree__document', 'data-document': dir, 'aria-expanded': open.value.has(dir) ? 'true' : 'false', 'onClick': () => toggle(dir) }),
            open.value.has(dir) ? h('ul', { role: 'list', class: 'pm-workbench__tree' }, nodes(dir, tree(dir, known.files.filter(file => file.path.startsWith(`${dir}/`))), 1) as never) : null,
          ])),
          ...known.files.some(file => file.path === WORKSPACE_FILE)
            ? [h('li', { key: WORKSPACE_FILE }, [row(0, [h(PmIcon, { name: 'sliders', size: 14 }), WORKSPACE_FILE], { 'data-path': WORKSPACE_FILE, 'onClick': () => choose(undefined, WORKSPACE_FILE) })])]
            : [],
        ]),
        known.truncated ? h('p', { style: { margin: 'var(--pm-space-2) 6px', color: 'var(--pm-color-muted)', fontSize: 'var(--pm-text-xs)' } }, t.value.truncated) : null,
      ])
    }
  },
})

/** Before the page goes, a file changed in the editor and not saved makes the browser ask. */
export function guardUnsaved(): () => void {
  const onLeave = (event: BeforeUnloadEvent) => {
    if (openFiles.value.some(file => file.dirty && textOf(file) !== file.base)) event.preventDefault()
  }
  window.addEventListener('beforeunload', onLeave)
  return () => window.removeEventListener('beforeunload', onLeave)
}
