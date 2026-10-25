import { toMarkdown } from 'mdast-util-to-markdown'
import { gfmToMarkdown } from 'mdast-util-gfm'
import type { Root } from 'mdast'
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
} from '@blocknote/core'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { en, zh } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import {
  AddBlockButton,
  createReactBlockSpec,
  DragHandleButton,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
  useExtensionState,
} from '@blocknote/react'
import { PmIcon, useAppearance, useMessages, useStore } from '@lincyaw/host'
import { PREVIEW_REVISION, reportPreview } from '@lincyaw/kernel'
import type {
  IRBlock,
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
import type { SideMenuProps } from '@blocknote/react'
import { BlockView } from '../block.ts'
import { useViewer } from '../viewer-state.ts'
import { bodySaveQueue } from './save-queue.ts'
import { pageCreation } from './pages.ts'
import { EDITOR_MESSAGES } from './messages.ts'
import { SourceBlock } from './source/source-block.tsx'
import { sourceSession } from './source/session.ts'
import { SOURCE_MESSAGES } from './source/messages.ts'
import '@blocknote/mantine/style.css'
import './style.css'

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
      const t = useMessages(EDITOR_MESSAGES)
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
                  1,
                  JSON.parse(entry.props.durations || '[1000]').length,
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
          <SourceBlock section={context.section} block={rendered} actions={
            <button
              type="button"
              className="pm-ui-icon-button pm-ui-icon-button--small"
              aria-label={t.editNarration}
              title={t.editNarration}
              onClick={() =>
                reportPreview({
                  type: 'narrate',
                  section: context.section.id,
                  step: rendered.at,
                })
              }
            >
              <PmIcon name="captions" />
            </button>
          }>
            <BlockView
              block={rendered}
              section={context.section}
              step={Infinity}
              expanded
            />
          </SourceBlock>
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
            <SourceBlock section={context.section} block={original}>
              <BlockView
                block={original}
                section={context.section}
                step={Infinity}
                expanded
              />
            </SourceBlock>
          ) : null}
        </div>
      )
    },
  },
)()

function BlockStepMenu(props: SideMenuProps) {
  const context = useContext(EDITING)!
  const hovered = useExtensionState(SideMenuExtension)
  const t = useMessages(EDITOR_MESSAGES)
  const step = hovered?.block ? context.stepFor(hovered.block.id) : 0
  const place = `${context.section.index} · ${step + 1}`
  const label = `${t.editNarration} · ${place}`
  return (
    <SideMenu {...props}>
      <button
        type="button"
        className="pm-block-editor__step pm-ui-button pm-ui-button--ghost pm-ui-button--small"
        title={label}
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          reportPreview({ type: 'narrate', section: context.section.id, step })
        }
      >
        <PmIcon name="slides" />
        <span>{place}</span>
      </button>
      <AddBlockButton />
      <DragHandleButton {...props} />
    </SideMenu>
  )
}

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    presmiumScene: sceneSpec,
    presmiumContent: opaqueSpec,
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
])
function simple(node: MdastNode): boolean {
  return SUPPORTED.has(node.type) && (node.children ?? []).every(simple)
}
function body(section: IRSection) {
  return section.blocks.filter(
    (b) => b.role === 'visual' || (b.only && !b.only.includes('lecture')),
  )
}
const bodySignature = (section: IRSection) =>
  JSON.stringify(
    body(section),
    (key, value) => key === 'source' || key === 'position' ? undefined : value,
  )
const signature = (block: EditorBlock) =>
  JSON.stringify([block.type, block.props, block.content, block.children])

function prepare(editor: Editor, section: IRSection) {
  const sources = new Map<string, { source: string; signature: string }>()
  const blocks: EditorBlock[] = []
  for (const block of body(section)) {
    let added: EditorBlock[]
    if (block.node.type === 'component' && block.node.name === 'PmScene')
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
      sources.set(entry.id, { source: block.id, signature: signature(entry) })
      blocks.push(entry)
    })
  }
  return { blocks, sources }
}

export default function MountedEditor({ section }: { section: IRSection }) {
  const viewer = useViewer()
  const doc = useStore(viewer.doc)
  const t = useMessages(EDITOR_MESSAGES)
  const appearance = useAppearance()
  const sourceMessages = useMessages(SOURCE_MESSAGES)
  const dictionary = doc.meta.lang?.startsWith('zh') ? zh : en
  const editor = useCreateBlockNote(
    {
      schema,
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
  const pages = useMemo(() => pageCreation(viewer), [viewer])
  const pageBusy = useStore(pages.busy)
  useEffect(() => pages.register(section.id, () => {
    const first = editor.document[0]
    if (first) editor.setTextCursorPosition(first, 'start')
    editor.focus()
  }), [pages, section.id, editor])
  const saved = useStore(queue.state)[section.id]
  const state = saved?.status ?? 'saved'
  const failure =
    saved?.error === 'revision-conflict'
      ? t.conflict
      : saved?.error === 'save-timeout'
        ? t.timeout
        : (saved?.error ?? '')
  const revision = useRef(String(doc.meta[PREVIEW_REVISION] ?? ''))
  const loadedBody = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const lastSelected = useRef('')
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
        const original = source ? known.get(source) : known.get(id)
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
    return editor.document.map((block) => {
      const original = prepared.current?.sources.get(block.id)
      const source = original?.source
      const at = source ? (known.get(source)?.at ?? nextAt) : nextAt
      const span =
        block.type === 'presmiumScene'
          ? Math.max(1, JSON.parse(block.props.durations || '[1000]').length)
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
      if (block.type === 'presmiumContent')
        return { id: block.id, source: block.props.source }
      // A source list can expand to several editor blocks. Serialize those pieces individually, preserving the first id.
      const repeated =
        source &&
        [...prepared.current!.sources.values()].filter(
          (s) => s.source === source,
        ).length > 1
      return {
        id: block.id,
        at,
        ...(source ? { source } : {}),
        ...(!repeated && original?.signature === signature(block)
          ? {}
          : { markdown: editor.blocksToMarkdownLossy([block]) }),
      }
    })
  }
  const record = () => {
    try {
      queue.record(section.id, outgoing())
    } catch (error) {
      queue.fail(
        section.id,
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  const save = () => {
    clearTimeout(timer.current)
    queue.flush()
  }
  const load = (discard = false) => {
    ready.current = false
    if (discard) queue.discard(section.id)
    prepared.current = prepare(editor, section)
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
            })
          return block
        })
      })
    }
    editor.replaceBlocks(
      editor.document,
      blocks.length ? blocks : [{ type: 'paragraph' }],
    )
    revision.current = String(doc.meta[PREVIEW_REVISION] ?? '')
    loadedBody.current = bodySignature(section)
    ready.current = true
  }
  useLayoutEffect(() => {
    load()
  }, [editor])
  useEffect(() => {
    const updated = String(doc.meta[PREVIEW_REVISION] ?? '')
    if (updated === revision.current || queue.draft(section.id)) return
    // Saving another page changes the document revision without changing this editor's content.
    // Retain its selection and NodeViews rather than replacing every block under the user's caret.
    if (loadedBody.current === bodySignature(section)) {
      revision.current = updated
      return
    }
    load()
  }, [section, doc])
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      queue.flush()
    },
    [queue, section.id],
  )
  const [creating, setCreating] = useState(false)
  const [creationError, setCreationError] = useState('')
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
        className="pm-block-editor pm-ui"
        aria-label={t.editor}
        onFocusCapture={(event) => {
          if (!ready.current || !(event.target instanceof HTMLElement) || !event.target.isContentEditable || event.target.closest('.pm-source-block')) return
          const current = editor.getTextCursorPosition().block
          reportPreview({ type: 'narrate', section: section.id, step: context.stepFor(current.id), navigate: false })
        }}
        onKeyDown={(event) => {
          if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            save()
          }
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
          <button
            type="button"
            className="pm-ui-icon-button pm-ui-icon-button--small"
            title={t.save}
            aria-label={t.save}
            disabled={state !== 'dirty'}
            onClick={save}
          >
            <PmIcon name="save" />
          </button>
          {failure && (
            <button
              type="button"
              className="pm-ui-button pm-ui-button--small"
              onClick={() => load(true)}
            >
              {t.reload}
            </button>
          )}
        </div>
        {failure && (
          <div className="pm-ui-notice pm-ui-notice--danger" role="alert">
            {failure}
          </div>
        )}
        {creationError && <div className="pm-ui-notice pm-ui-notice--danger" role="alert">{creationError}</div>}
        <BlockNoteView
          editor={editor}
          editable={!pageBusy}
          theme={appearance.dark ? 'dark' : 'light'}
          slashMenu={false}
          sideMenu={false}
          formattingToolbar={false}
          onChange={() => {
            if (!ready.current) return
            record()
            clearTimeout(timer.current)
            timer.current = setTimeout(() => queue.flush(), 700)
          }}
          onSelectionChange={() => {
            if (!ready.current || !editor.isFocused()) return
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
            floatingUIOptions={{
              useFloatingOptions: { placement: 'bottom-start' },
            }}
          />
          <SideMenuController sideMenu={BlockStepMenu} />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...getDefaultReactSlashMenuItems(editor),
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
