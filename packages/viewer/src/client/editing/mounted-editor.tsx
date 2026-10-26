import { toMarkdown } from 'mdast-util-to-markdown'
import { gfmToMarkdown } from 'mdast-util-gfm'
import type { Root } from 'mdast'
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultStyleSpecs,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from '@blocknote/core'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { en, zh } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import {
  AddBlockButton,
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  createReactBlockSpec,
  DragHandleButton,
  DragHandleMenu,
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  NestBlockButton,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  UnnestBlockButton,
  useCreateBlockNote,
  useExtensionState,
} from '@blocknote/react'
import { PmBadge, PmButton, PmDialog, PmIcon, PmIconButton, useMessages, useStore } from '@lincyaw/host'
import { PREVIEW_REVISION, reportPreview } from '@lincyaw/kernel'
import type {
  IRBlock,
  IRDocument,
  IRSection,
  MdastNode,
  PreviewEditedBlock,
} from '@lincyaw/kernel'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ComponentProps } from 'react'
import type { SideMenuProps } from '@blocknote/react'
import { isLegacyNarration } from '../../domain/document-content.ts'
import { BlockView } from '../block.ts'
import { useViewer } from '../viewer-state.ts'
import { bodySaveQueue } from './save-queue.ts'
import { pageCreation } from './pages.ts'
import { activateBodyEditor, registerBodyEditor } from './history.ts'
import { EDITOR_MESSAGES } from './messages.ts'
import { GeneratedPreview } from './generated-preview.tsx'
import { sourceSession } from './source/session.ts'
import { SOURCE_MESSAGES } from './source/messages.ts'
import '@blocknote/mantine/style.css'
import './style.css'

const EDITOR_THEME = {
  colors: {
    editor: { background: 'var(--pm-color-surface)', text: 'var(--pm-color-ink)' },
    menu: { background: 'var(--pm-color-surface)', text: 'var(--pm-color-ink)' },
    tooltip: { background: 'var(--pm-color-surface)', text: 'var(--pm-color-ink)' },
    hovered: { background: 'var(--pm-color-sunk)', text: 'var(--pm-color-ink)' },
    selected: { background: 'var(--pm-color-accent-soft)', text: 'var(--pm-color-accent)' },
    disabled: { background: 'var(--pm-color-sunk)', text: 'var(--pm-color-muted)' },
    border: 'var(--pm-color-line)',
    shadow: 'var(--pm-color-backdrop)',
    sideMenu: 'var(--pm-color-muted)',
  },
  fontFamily: 'var(--pm-font-sans)',
}

interface EditingContext {
  section: IRSection
  blocks: Map<string, IRBlock>
  stepFor(id: string): number
}
const EDITING = createContext<EditingContext | undefined>(undefined)

const sceneSpec = createReactBlockSpec(
  {
    type: 'presmiumScene',
    propSchema: {
      source: { default: '' },
      scene: { default: '' },
      durations: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const context = useContext(EDITING)!
      const original = context.blocks.get(block.props.source)
      const name =
        block.props.scene ||
        (original?.node.type === 'component'
          ? String(original.node.props.scene ?? '')
          : '')
      const durations = block.props.durations
        ? (JSON.parse(block.props.durations) as number[])
        : (original?.node.type === 'component' ? original.node.durations ?? [1000] : [1000])
      const previous = editor.document.slice(
        0,
        editor.document.findIndex((entry) => entry.id === block.id),
      )
      const start = previous.reduce((at, entry) => {
        const known = context.blocks.get(
          'source' in entry.props ? String(entry.props.source) : entry.id,
        )
        return Math.max(
          at,
          (known?.at ?? at) +
            (entry.type === 'presmiumScene'
              ? Math.max(
                  0,
                  JSON.parse(entry.props.durations || '[1000]').length - 1,
                )
              : (known?.span ?? 0)),
        )
      }, 0)
      const rendered: IRBlock = {
        ...(original ?? {
          id: block.id,
          role: 'visual',
          at: start,
          source: context.section.source,
        }),
        id: original?.id ?? block.id,
        span: Math.max(0, durations.length - 1),
        node: {
          ...(original?.node.type === 'component' ? original.node : {}),
          type: 'component',
          plugin: 'presmium.motion',
          name: 'PmScene',
          props: {
            ...(original?.node.type === 'component' ? original.node.props : {}),
            scene: name,
          },
          durations,
        },
      }
      return (
        <div
          className="pm-block-editor__scene"
          data-block={rendered.id}
          contentEditable={false}
        >
          <GeneratedPreview section={context.section} block={rendered} />
        </div>
      )
    },
  },
)()

const opaqueSpec = createReactBlockSpec(
  {
    type: 'presmiumContent',
    propSchema: { source: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block }) => {
      const context = useContext(EDITING)!
      const original = context.blocks.get(block.props.source)
      return (
        <div
          className="pm-block-editor__opaque"
          contentEditable={false}
        >
          {original ? (
            <GeneratedPreview section={context.section} block={original} />
          ) : null}
        </div>
      )
    },
  },
)()

const legacyNarrationSpec = createReactBlockSpec(
  {
    type: 'presmiumLegacyNarration',
    propSchema: { source: { default: '' } },
    content: 'none',
    meta: { selectable: false, draggable: false, isolating: true },
  },
  {
    render: ({ block }) => {
      const context = useContext(EDITING)!
      const t = useMessages(EDITOR_MESSAGES)
      const original = context.blocks.get(block.props.source)
      if (!original) return null
      const parts = original.node.type === 'markdown' ? original.node.mdast.type === 'root' ? original.node.mdast.children ?? [] : [original.node.mdast] : []
      const editable = parts.length > 0 && parts.every(part => ['paragraph', 'heading', 'list', 'blockquote', 'table'].includes(part.type))
      return <div className="pm-legacy-narration" contentEditable={false}>
        <div className="pm-legacy-narration__header" data-preview-ui="">
          <PmBadge tone="outline">{t.sourcePreserved}</PmBadge>
          <PmIconButton small icon="edit-text" label={t.editText} disabled={!editable} hint={editable ? t.sourcePreservedHint : t.sourceUnsupportedHint} onClick={() => reportPreview({ type: 'picked', section: context.section.id, block: original.id, clicks: 2 })} />
        </div>
        <BlockView block={original} section={context.section} step={Infinity} expanded />
      </div>
    },
  },
)()

function BlockSideMenu(props: SideMenuProps) {
  const hovered = useExtensionState(SideMenuExtension)
  return (
    <SideMenu {...props}>
      <AddBlockButton />
      {hovered?.block?.type !== 'presmiumLegacyNarration' && <DragHandleButton {...props} dragHandleMenu={EditorDragHandleMenu} />}
    </SideMenu>
  )
}

function EditorDragHandleMenu() {
  const t = useMessages(EDITOR_MESSAGES)
  return <DragHandleMenu><RemoveBlockItem>{t.removeBlock}</RemoveBlockItem></DragHandleMenu>
}

function EditorFormattingToolbar(props: ComponentProps<typeof FormattingToolbar>) {
  return <div data-preview-selection-tools=""><FormattingToolbar {...props}>
    <BlockTypeSelect items={props.blockTypeSelectItems} />
    <BasicTextStyleButton basicTextStyle="bold" />
    <BasicTextStyleButton basicTextStyle="italic" />
    <BasicTextStyleButton basicTextStyle="strike" />
    <BasicTextStyleButton basicTextStyle="code" />
    <NestBlockButton /><UnnestBlockButton /><CreateLinkButton />
  </FormattingToolbar></div>
}

const schema = BlockNoteSchema.create({
  styleSpecs: {
    bold: defaultStyleSpecs.bold,
    italic: defaultStyleSpecs.italic,
    strike: defaultStyleSpecs.strike,
    code: defaultStyleSpecs.code,
  },
  blockSpecs: {
    ...defaultBlockSpecs,
    presmiumScene: sceneSpec,
    presmiumContent: opaqueSpec,
    presmiumLegacyNarration: legacyNarrationSpec,
  },
})
type Editor = typeof schema.BlockNoteEditor
type EditorBlock = typeof schema.Block

function markdown(node: MdastNode): string {
  return toMarkdown(node as unknown as Root, { extensions: [gfmToMarkdown()] })
}
const SUPPORTED = new Set([
  'root',
  'text',
  'paragraph',
  'heading',
  'strong',
  'emphasis',
  'delete',
  'inlineCode',
  'link',
  'image',
  'blockquote',
  'list',
  'listItem',
  'break',
  'thematicBreak',
  'table',
  'tableRow',
  'tableCell',
])
const TABLE_INLINE = new Set(['text', 'strong', 'emphasis', 'delete', 'inlineCode', 'link', 'break'])
function simpleTable(node: MdastNode): boolean {
  const inline = (part: MdastNode): boolean => TABLE_INLINE.has(part.type) && (part.children ?? []).every(inline)
  const rows = node.children ?? []
  const width = rows[0]?.children?.length ?? 0
  return width > 0 && rows.every(row => row.type === 'tableRow' && row.children?.length === width && row.children.every(cell => cell.type === 'tableCell' && (cell.align === undefined || cell.align === null || cell.align === 'left') && (cell.children ?? []).every(inline))) &&
    (!Array.isArray(node.align) || node.align.every(value => value === null || value === 'left'))
}
function simple(node: MdastNode): boolean {
  if (node.type === 'table') return simpleTable(node)
  return SUPPORTED.has(node.type) && (node.children ?? []).every(simple)
}
function editableNarration(block: IRBlock): boolean {
  const plain = (node: MdastNode): boolean => node.type === 'table' ? simpleTable(node) : node.type !== 'heading' && SUPPORTED.has(node.type) && (node.children ?? []).every(plain)
  return block.node.type === 'markdown' && !block.node.reveal && block.until === undefined && !(block.span && block.span > 0) && plain(block.node.mdast)
}
function body(section: IRSection, document: IRDocument) {
  return section.blocks.filter(
    (b) => b.role === 'visual' || (b.only && !b.only.includes('lecture')) || isLegacyNarration(document, b),
  )
}
const bodySignature = (section: IRSection, document: IRDocument) =>
  JSON.stringify(
    body(section, document),
    (key, value) => key === 'source' || key === 'position' ? undefined : value,
  )
const signature = (block: EditorBlock) =>
  JSON.stringify([block.type, block.props, block.content, block.children])
const sourceSignature = (block: IRBlock | undefined) => JSON.stringify(block, (key, value) => key === 'source' || key === 'position' ? undefined : value)

function prepare(editor: Editor, section: IRSection, document: IRDocument) {
  const sources = new Map<string, { source: string; signature: string; baseline?: string; inherited?: boolean }>()
  const blocks: EditorBlock[] = []
  for (const block of body(section, document)) {
    let added: EditorBlock[]
    if (block.role === 'narration' && !editableNarration(block))
      added = [{ id: block.id, type: 'presmiumLegacyNarration', props: { source: block.id }, content: undefined, children: [] }]
    else if (block.node.type === 'component' && block.node.name === 'PmScene')
      added = [
        {
          id: block.id,
          type: 'presmiumScene',
          props: {
            source: block.id,
            scene: String(block.node.props.scene ?? ''),
            durations: JSON.stringify(block.node.durations ?? [1000]),
          },
          content: undefined,
          children: [],
        },
      ]
    else if (
      block.node.type === 'markdown' &&
      !block.node.reveal &&
      simple(block.node.mdast)
    )
      added = editor.tryParseMarkdownToBlocks(markdown(block.node.mdast))
    else if (
      block.node.type === 'code' &&
      !block.node.run &&
      !block.node.origin &&
      !block.node.variants
    )
      added = editor.tryParseMarkdownToBlocks(
        toMarkdown({
          type: 'code',
          lang: block.node.lang,
          value: block.node.value,
        }),
      )
    else
      added = [
        {
          id: block.id,
          type: 'presmiumContent',
          props: { source: block.id },
          content: undefined,
          children: [],
        },
      ]
    added.forEach((entry, k) => {
      entry.id = k === 0 ? block.id : `${block.id}--${k}`
      const remember = (item: EditorBlock) => {
        sources.set(item.id, { source: block.id, signature: signature(item), baseline: sourceSignature(block) })
        item.children.forEach(remember)
      }
      remember(entry)
      blocks.push(entry)
    })
  }
  return { blocks, sources }
}

export default function MountedEditor({ section }: { section: IRSection }) {
  const viewer = useViewer()
  const doc = useStore(viewer.doc)
  const t = useMessages(EDITOR_MESSAGES)
  const sourceMessages = useMessages(SOURCE_MESSAGES)
  const dictionary = doc.meta.lang?.startsWith('zh') ? zh : en
  const editor = useCreateBlockNote(
    {
      schema,
      tables: { splitCells: false, cellBackgroundColor: false, cellTextColor: false, headers: false },
      domAttributes: { block: { 'data-presmium-editor-block': '' } },
      dictionary: {
        ...dictionary,
        placeholders: { ...dictionary.placeholders, default: t.empty },
      },
    },
    [section.id],
  )
  const prepared = useRef<ReturnType<typeof prepare>>()
  const ready = useRef(false)
  const queue = useMemo(() => bodySaveQueue(viewer), [viewer])
  useEffect(() => queue.announce(), [queue])
  const pages = useMemo(() => pageCreation(viewer), [viewer])
  useEffect(() => registerBodyEditor(viewer, editor, section.id), [viewer, editor, section.id])
  const pageBusy = useStore(pages.busy)
  useEffect(() => pages.register(section.id, () => {
    const first = editor.document[0]
    if (first) editor.setTextCursorPosition(first, 'start')
    editor.focus()
  }), [pages, section.id, editor])
  const saved = useStore(queue.state)[section.id]
  const unscopedDraft = useStore(queue.unscopedDraft)
  const state = saved?.status ?? 'saved'
  const failure =
    saved?.error === 'revision-conflict'
      ? t.conflict
      : saved?.error === 'save-timeout'
        ? t.timeout
        : saved?.error === 'draft-storage'
          ? t.draftStorage
          : saved?.error === 'Failed to fetch'
            ? t.disconnected
            : (saved?.error ?? '')
  const revision = useRef(String(doc.meta[PREVIEW_REVISION] ?? ''))
  const loadedBody = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const composing = useRef(false)
  const blurred = useRef(false)
  const lastSelected = useRef('')
  const root = useRef<HTMLDivElement>(null)
  const [commentPending, setCommentPending] = useState(false)
  const splitting = useRef<{ source: string, anchor: string, before: Set<string>, projection: ReturnType<typeof prepare> }>()
  const lastRecorded = useRef('')
  const known = useMemo(
    () => new Map(section.blocks.map((b) => [b.id, b])),
    [section],
  )
  const context = useMemo(
    () => ({
      section,
      blocks: known,
      stepFor(id: string) {
        const source = prepared.current?.sources.get(id)?.source
        const original = known.get(id) ?? (source ? known.get(source) : undefined)
        if (original) return original.at
        try {
          return outgoing().find((block) => block.id === id)?.at ?? 0
        } catch {
          return 0
        }
      },
    }),
    [section, known],
  )
  const outgoing = (): PreviewEditedBlock[] => {
    let nextAt = 0
    const pending = queue.draft(section.id)
    const waitingForIr = queue.awaitingIr(section.id)
    return editor.document.map((block) => {
      const original = prepared.current?.sources.get(block.id)
      const source = known.has(block.id) ? block.id : original?.source
      const at = source ? (known.get(source)?.at ?? nextAt) : nextAt
      const span =
        block.type === 'presmiumScene'
          ? Math.max(0, JSON.parse(block.props.durations || '[1000]').length - 1)
          : source
            ? (known.get(source)?.span ?? 0)
            : 0
      nextAt = Math.max(nextAt, at + span)
      if (block.type === 'presmiumScene')
        return {
          id: block.id,
          at,
          source: block.props.source || undefined,
          scene: block.props.scene,
          durations: JSON.parse(block.props.durations || '[1000]') as number[],
        }
      if (block.type === 'presmiumContent' || block.type === 'presmiumLegacyNarration')
        return { id: block.id, source: block.props.source }
      // A source list can expand to several editor blocks. Serialize those pieces individually, preserving the first id.
      const repeated =
        source &&
        editor.document.filter(
          (item) => prepared.current!.sources.get(item.id)?.source === source,
        ).length > 1
      // A previous save can still write different text after an immediate
      // Undo. Keep that newer local intent explicit in the next frozen draft,
      // even while the IR still describes this editor's original baseline.
      const pendingChange = pending && (!pending.some(item => item.id === block.id) || pending.some(item => (item.id === block.id || source && item.source === source) && item.markdown !== undefined))
      return {
        id: block.id,
        at,
        ...(source ? { source } : {}),
        ...(!repeated && !pendingChange && !waitingForIr && original?.signature === signature(block) && original.baseline === sourceSignature(source ? known.get(source) : undefined)
          ? {}
          : { markdown: editor.blocksToMarkdownLossy([block]) }),
      }
    })
  }
  const inheritSplitSource = () => {
    const intent = splitting.current
    if (!intent) return
    if (prepared.current !== intent.projection) { splitting.current = undefined; return }
    const find = (blocks: EditorBlock[]): EditorBlock | undefined => {
      const at = blocks.findIndex(block => block.id === intent.anchor)
      if (at >= 0) return blocks[at + 1]
      for (const block of blocks) { const next = find(block.children); if (next) return next }
      return undefined
    }
    const block = find(editor.document)
    if (!block || intent.before.has(block.id) || prepared.current.sources.has(block.id)) return
    if (block.type === 'presmiumScene' || block.type === 'presmiumContent' || block.type === 'presmiumLegacyNarration') return
    prepared.current.sources.set(block.id, { source: intent.source, signature: '__split__', inherited: true })
    splitting.current = undefined
  }
  const record = () => {
    try {
      inheritSplitSource()
      // Only editor input is a new draft. IR acknowledgement can change source
      // aliases and source-only optimisations without changing authored text.
      const serialized = JSON.stringify(editor.document)
      if (serialized === lastRecorded.current) return
      const blocks = outgoing()
      lastRecorded.current = serialized
      queue.record(section.id, blocks)
    } catch (error) {
      queue.fail(
        section.id,
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  const syncAnchors = () => {
    if (!ready.current || !root.current) return
    let changed = false
    for (const element of root.current.querySelectorAll<HTMLElement>('[data-presmium-editor-block]')) {
      const id = element.dataset.id ?? element.querySelector<HTMLElement>('[data-id]')?.dataset.id
      const source = id && prepared.current?.sources.get(id)
      const parent = element.parentElement?.closest<HTMLElement>('[data-presmium-editor-block][data-block]')
      const anchor = id && known.has(id) ? id : source && !source.inherited && known.has(source.source) ? source.source : !queue.draft(section.id) ? parent?.dataset.block : undefined
      if (element.dataset.block !== anchor) {
        if (anchor) element.dataset.block = anchor
        else delete element.dataset.block
        changed = true
      }
      element.toggleAttribute('data-comment-pending', !anchor)
    }
    const selection = document.getSelection()
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : undefined
    const pending = Boolean(range && selection?.toString().trim() && [...root.current.querySelectorAll('[data-comment-pending]')].some(element => range.intersectsNode(element)))
    setCommentPending(pending)
    if (changed && range) document.dispatchEvent(new Event('selectionchange'))
  }
  const save = () => {
    clearTimeout(timer.current)
    if (composing.current) return
    if (ready.current) record()
    queue.flush()
  }
  const load = (discard = false) => {
    ready.current = false
    splitting.current = undefined
    if (discard) queue.discard(section.id)
    prepared.current = prepare(editor, section, doc)
    const draft = queue.draft(section.id)
    let blocks = prepared.current.blocks
    if (draft) {
      blocks = draft.flatMap((item) => {
        let entries: EditorBlock[]
        if (item.scene !== undefined)
          entries = [
            {
              id: item.id,
              type: 'presmiumScene',
              props: {
                source: item.source ?? '',
                scene: item.scene,
                durations: JSON.stringify(item.durations ?? [1000]),
              },
              content: undefined,
              children: [],
            },
          ]
        else if (item.markdown !== undefined)
          entries = editor.tryParseMarkdownToBlocks(item.markdown)
        else
          entries = prepared.current!.blocks.filter(
            (block) => block.id === item.id || block.id === item.source,
          )
        return entries.map((block, k) => {
          block.id = k === 0 ? item.id : `${item.id}--${k}`
          if (item.source && !prepared.current!.sources.has(block.id))
            prepared.current!.sources.set(block.id, {
              source: item.source,
              signature: '__draft__',
              inherited: true,
            })
          return block
        })
      })
    }
    editor.transact(tr => {
      tr.setMeta('addToHistory', false)
      editor.replaceBlocks(editor.document, blocks.length ? blocks : [{ type: 'paragraph' }])
    })
    revision.current = String(doc.meta[PREVIEW_REVISION] ?? '')
    loadedBody.current = bodySignature(section, doc)
    lastRecorded.current = JSON.stringify(editor.document)
    ready.current = true
  }
  useLayoutEffect(() => {
    load()
  }, [editor])
  useLayoutEffect(syncAnchors, [editor, known, saved?.status, saved?.version])
  useEffect(() => {
    if (!root.current) return
    const observer = new MutationObserver(syncAnchors)
    observer.observe(root.current, { childList: true, subtree: true })
    syncAnchors()
    return () => observer.disconnect()
  }, [editor, known, queue, section.id])
  useEffect(() => {
    const updated = String(doc.meta[PREVIEW_REVISION] ?? '')
    if (updated === revision.current || queue.draft(section.id)) return
    // Saving another page changes the document revision without changing this editor's content.
    // Retain its selection and NodeViews rather than replacing every block under the user's caret.
    if (loadedBody.current === bodySignature(section, doc)) {
      revision.current = updated
      return
    }
    load()
  }, [section, doc])
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      queue.hold(section.id, false)
      if (!composing.current) queue.flush()
    },
    [queue, section.id],
  )
  const [creating, setCreating] = useState(false)
  const [creationError, setCreationError] = useState('')
  const [discarding, setDiscarding] = useState(false)
  const [copyFailure, setCopyFailure] = useState('')
  const [readonlyFailure, setReadonlyFailure] = useState('')
  useEffect(() => editor.onBeforeChange(({ tr }) => {
    if (!ready.current) return
    let unsupported = false
    let unsupportedTable = false
    tr.doc.descendants(node => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        if (node.attrs.colwidth !== undefined && node.attrs.colwidth !== null
          || node.attrs.colspan > 1 || node.attrs.rowspan > 1
          || node.attrs.textAlignment !== undefined && node.attrs.textAlignment !== 'left'
          || node.attrs.textColor !== undefined && node.attrs.textColor !== 'default'
          || node.attrs.backgroundColor !== undefined && node.attrs.backgroundColor !== 'default') unsupportedTable = true
      }
      if (!Object.prototype.hasOwnProperty.call(schema.blockSchema, node.type.name)) return
      if (node.attrs.textAlignment !== undefined && node.attrs.textAlignment !== 'left'
        || node.attrs.textColor !== undefined && node.attrs.textColor !== 'default'
        || node.attrs.backgroundColor !== undefined && node.attrs.backgroundColor !== 'default') unsupported = true
    })
    if (unsupportedTable) {
      setReadonlyFailure(t.unsupportedTableFormatting)
      return false
    }
    if (unsupported) {
      setReadonlyFailure(t.unsupportedFormatting)
      return false
    }
    // Enter creates a blockContainer before BlockNote's ID extension runs.
    // Inspect the public ProseMirror transaction directly, without converting
    // these provisional nodes through pre-change getChanges().
    const before: { id: unknown, node: typeof tr.doc, position: number }[] = []
    const after: { id: unknown, node: typeof tr.doc, position: number }[] = []
    tr.before.descendants((node, position, parent) => {
      if (node.type.name === 'presmiumLegacyNarration') before.push({ id: parent?.attrs.id, node, position })
    })
    if (!before.length) return
    tr.doc.descendants((node, position, parent) => {
      if (node.type.name === 'presmiumLegacyNarration') after.push({ id: parent?.attrs.id, node, position })
    })
    if (before.length !== after.length || before.some((item, index) => {
      const next = after[index]
      const mapped = tr.mapping.mapResult(item.position)
      return !next || next.id !== item.id || !item.node.eq(next.node) || mapped.deleted || mapped.pos !== next.position
    })) {
      setReadonlyFailure(t.legacyProtected)
      return false
    }
  }), [editor, t.legacyProtected, t.unsupportedFormatting, t.unsupportedTableFormatting])
  const copyDraft = async () => {
    setCopyFailure('')
    try {
      const editable = editor.document.filter(block => block.type !== 'presmiumScene' && block.type !== 'presmiumContent' && block.type !== 'presmiumLegacyNarration')
      await navigator.clipboard.writeText(editor.blocksToMarkdownLossy(editable))
    } catch { setCopyFailure(t.copyFailed) }
  }
  const insertScene = async () => {
    if (creating || pages.busy.getSnapshot()) return
    setCreating(true)
    setCreationError('')
    const selected = editor.getTextCursorPosition().block
    const after = prepared.current?.sources.get(selected.id)?.source
    try { await sourceSession(viewer).create(section.id, after) }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCreationError(message === 'source-timeout' ? sourceMessages.timeout : message === 'source-storage' ? sourceMessages.storage : message === 'source-unavailable' ? sourceMessages.unavailable : message)
    }
    finally { setCreating(false) }
  }
  const insertPage = async () => {
    if (creating || pages.busy.getSnapshot()) return
    setCreating(true)
    setCreationError('')
    try { await pages.create(section.id) }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCreationError(message === 'page-timeout' ? t.pageTimeout : message === 'page-unavailable' ? t.pageUnavailable : message === 'save-timeout' ? t.timeout : message === 'revision-conflict' ? t.conflict : message)
    }
    finally { setCreating(false) }
  }
  return (
    <EDITING.Provider value={context}>
      <div
        ref={root}
        className="pm-block-editor pm-ui-block-editor pm-ui"
        aria-label={t.editor}
        onCompositionStart={() => {
          composing.current = true
          queue.hold(section.id, true)
          clearTimeout(timer.current)
        }}
        onCompositionEnd={() => {
          composing.current = false
          queue.hold(section.id, false)
          record()
          clearTimeout(timer.current)
          if (blurred.current) save()
          else timer.current = setTimeout(() => queue.flush(), 600)
        }}
        onBlurCapture={event => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          inheritSplitSource()
          splitting.current = undefined
          blurred.current = true
          save()
        }}
        onPointerDownCapture={() => { inheritSplitSource(); splitting.current = undefined }}
        onPasteCapture={() => { inheritSplitSource(); splitting.current = undefined }}
        onFocusCapture={(event) => {
          blurred.current = false
          if (!ready.current || !(event.target instanceof HTMLElement) || !event.target.isContentEditable || event.target.closest('.pm-source-block, [data-preview-editing]')) return
          activateBodyEditor(viewer, editor)
          const current = editor.getTextCursorPosition().block
          reportPreview({ type: 'narrate', section: section.id, step: context.stepFor(current.id), navigate: false })
        }}
        onKeyDown={(event) => {
          if (composing.current || event.nativeEvent.isComposing) return
          if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            save()
          }
        }}
        onKeyDownCapture={event => {
          inheritSplitSource()
          splitting.current = undefined
          if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || composing.current || event.nativeEvent.isComposing || !ready.current || !(event.target instanceof HTMLElement) || !event.target.isContentEditable) return
          const current = editor.getTextCursorPosition().block
          const source = known.has(current.id) ? current.id : prepared.current?.sources.get(current.id)?.source
          const original = source && known.get(source)
          if (!source || !original || original.role !== 'narration' || !editableNarration(original)) return
          const ids = new Set<string>()
          const remember = (blocks: EditorBlock[]) => { for (const block of blocks) { ids.add(block.id); remember(block.children) } }
          remember(editor.document)
          const intent = { source, anchor: current.id, before: ids, projection: prepared.current! }
          splitting.current = intent
        }}
      >
        <div className="pm-block-editor__tools">
          <span className="pm-block-editor__status" role="status">
            {state === 'saving'
              ? t.saving
              : state === 'dirty'
                ? t.dirty
                : state === 'failed'
                  ? t.error
                  : t.saved}
          </span>
          <PmIconButton
            small
            icon="save"
            label={t.save}
            hint={t.save}
            disabled={state !== 'dirty'}
            onClick={save}
          />
          {failure && (
            <>
              <PmButton small onClick={() => void copyDraft()}>{t.copyDraft}</PmButton>
              {saved?.error !== 'revision-conflict' && <PmButton small onClick={() => queue.retry(section.id)}>{t.retry}</PmButton>}
              <PmButton small onClick={() => setDiscarding(true)}>{t.reload}</PmButton>
            </>
          )}
        </div>
        {saved?.restored && <div className="pm-ui-notice pm-ui-notice--accent" role="status">{t.restored}</div>}
        {section.index === 1 && unscopedDraft && <div className="pm-ui-notice pm-ui-notice--warn" role="status">
          <p>{t.unscopedDraft}</p>
          <div className="pm-block-editor__recovery">
            <PmButton small onClick={() => { setCopyFailure(''); void navigator.clipboard.writeText(unscopedDraft).catch(() => setCopyFailure(t.copyFailed)) }}>{t.copyUnscopedDraft}</PmButton>
            <PmButton small onClick={() => queue.unscopedDraft.set(undefined)}>{t.dismissUnscopedDraft}</PmButton>
          </div>
        </div>}
        {failure && (
          <div className="pm-ui-notice pm-ui-notice--danger" role="alert">
            {failure}
          </div>
        )}
        {creationError && <div className="pm-ui-notice pm-ui-notice--danger" role="alert">{creationError}</div>}
        {copyFailure && <div className="pm-ui-notice pm-ui-notice--danger" role="alert">{copyFailure}</div>}
        {readonlyFailure && <div className="pm-ui-notice pm-ui-notice--warn" role="status">{readonlyFailure}</div>}
        {commentPending && <div className="pm-ui-notice pm-ui-notice--accent" role="status">{t.commentPending}</div>}
        <PmDialog open={discarding} label={t.reload} closeLabel={t.cancel} onClose={() => setDiscarding(false)}>
          <p>{t.discardDraft}</p>
          <div className="pm-block-editor__recovery">
            <PmButton onClick={() => setDiscarding(false)}>{t.cancel}</PmButton>
            <PmButton variant="danger" onClick={() => { load(true); setDiscarding(false) }}>{t.discardAndReload}</PmButton>
          </div>
        </PmDialog>
        <BlockNoteView
          editor={editor}
          editable={!pageBusy}
          theme={EDITOR_THEME}
          slashMenu={false}
          sideMenu={false}
          formattingToolbar={false}
          onChange={() => {
            if (!ready.current) return
            record()
            syncAnchors()
            clearTimeout(timer.current)
            if (!composing.current) timer.current = setTimeout(() => queue.flush(), 600)
          }}
          onSelectionChange={() => {
            if (!ready.current || !editor.isFocused()) return
            syncAnchors()
            const current = editor.getTextCursorPosition().block
            if (current.id === lastSelected.current) return
            lastSelected.current = current.id
            // Generated blocks have explicit step controls. Editing their source keeps that selected step.
            if (current.type === 'presmiumScene' || current.type === 'presmiumContent') return
            reportPreview({
              type: 'narrate',
              section: section.id,
              step: context.stepFor(current.id),
              navigate: false,
            })
          }}
        >
          <FormattingToolbarController
            formattingToolbar={EditorFormattingToolbar}
            floatingUIOptions={{
              useFloatingOptions: { placement: 'bottom-start' },
            }}
          />
          <SideMenuController sideMenu={BlockSideMenu} />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...getDefaultReactSlashMenuItems(editor).map(item => item.title === dictionary.slash_menu.table.title ? {
                    ...item,
                    // GFM always has a header row. Create that real structure
                    // through BlockNote's public insertion API so saving does
                    // not add an invisible empty header above the author's rows.
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, {
                      type: 'table',
                      content: { type: 'tableContent', headerRows: 1, rows: Array.from({ length: 3 }, () => ({ cells: ['', '', ''] })) },
                    }),
                  } : item),
                  {
                    title: t.newPage,
                    onItemClick: insertPage,
                    aliases: ['page', 'new page', '页面', '新建页面'],
                    group: t.pages,
                    icon: <PmIcon name="document" />,
                  },
                  ...(doc.config.presmium['presmium.motion'] !== undefined ? [{
                    title: t.animation,
                    onItemClick: insertScene,
                    aliases: ['animation', 'scene', '动画'],
                    group: t.animation,
                    icon: <PmIcon name="video" />,
                  }] : []),
                ],
                query,
              )
            }
          />
        </BlockNoteView>
      </div>
    </EDITING.Provider>
  )
}
