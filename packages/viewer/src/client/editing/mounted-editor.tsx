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
import { PmIcon, PmMenu, useAppearance, useMessages, useStore } from '@lincyaw/host'
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
} from 'react'
import type { SideMenuProps } from '@blocknote/react'
import { BlockView } from '../block.ts'
import { useViewer } from '../viewer-state.ts'
import { bodySaveQueue } from './save-queue.ts'
import { EDITOR_MESSAGES } from './messages.ts'
import '@blocknote/mantine/style.css'
import './style.css'

interface SceneChoice {
  name: string
  label: string
  durations: number[]
  original?: IRBlock
}
interface EditingContext {
  section: IRSection
  blocks: Map<string, IRBlock>
  scenes: SceneChoice[]
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
      const selected = context.scenes.find((s) => s.name === name)
      const durations = block.props.durations
        ? (JSON.parse(block.props.durations) as number[])
        : (selected?.durations ?? [1000])
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
          <div className="pm-block-editor__scene-tools">
            <span className="pm-block-editor__scene-name" title={name}>
              <PmIcon name="video" />
              <span>{selected?.label ?? name}</span>
            </span>
            <PmMenu
              label={t.replaceAnimation}
              items={context.scenes.map((scene) => ({
                id: scene.name,
                label: scene.label,
                icon: scene.name === name ? 'check' : 'video',
              }))}
              onSelect={(name) => {
                const choice = context.scenes.find((s) => s.name === name)
                if (!choice || choice.name === block.props.scene) return
                editor.updateBlock(block, {
                  props: {
                    scene: choice.name,
                    durations: JSON.stringify(choice.durations),
                  },
                })
              }}
            />
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
          </div>
          <BlockView
            block={rendered}
            section={context.section}
            step={Infinity}
            expanded
          />
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
      const t = useMessages(EDITOR_MESSAGES)
      const original = context.blocks.get(block.props.source)
      return (
        <div
          className="pm-block-editor__opaque"
          contentEditable={false}
          title={t.retained}
        >
          {original ? (
            <BlockView
              block={original}
              section={context.section}
              step={Infinity}
              expanded
            />
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
  const scenes = useMemo(() => {
    const found = new Map<string, SceneChoice>()
    for (const page of doc.sections)
      for (const block of page.blocks)
        if (block.node.type === 'component' && block.node.name === 'PmScene')
          found.set(String(block.node.props.scene), {
            name: String(block.node.props.scene),
            label: page.title,
            durations: block.node.durations ?? [1000],
            original: block,
          })
    const configured = doc.config.presmium['presmium.motion'] as
      { scenes?: string[] } | undefined
    for (const name of configured?.scenes ?? [])
      if (!found.has(name)) found.set(name, { name, label: name, durations: [1000] })
    return [...found.values()]
  }, [doc])
  const context = useMemo(
    () => ({
      section,
      blocks: known,
      scenes,
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
    [section, known, scenes],
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
  const insertScene = (name: string) => {
    const choice = scenes.find((scene) => scene.name === name)
    if (!choice) return
    editor.insertBlocks(
      [
        {
          type: 'presmiumScene',
          props: {
            scene: choice.name,
            durations: JSON.stringify(choice.durations),
          },
        },
      ],
      editor.getTextCursorPosition().block,
      'after',
    )
  }
  return (
    <EDITING.Provider value={context}>
      <div
        className="pm-block-editor pm-ui"
        aria-label={t.editor}
        onKeyDown={(event) => {
          if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            save()
          }
        }}
      >
        <div className="pm-block-editor__tools">
          <PmMenu
            label={t.insertAnimation}
            icon="plus"
            placement="below-end"
            items={
              scenes.length
                ? scenes.map((scene) => ({
                    id: scene.name,
                    label: scene.label,
                    icon: 'video',
                  }))
                : [{ id: '', label: t.noScene, disabled: true }]
            }
            onSelect={insertScene}
          />
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
        <BlockNoteView
          editor={editor}
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
            if (!ready.current) return
            const current = editor.getTextCursorPosition().block
            if (current.id === lastSelected.current) return
            lastSelected.current = current.id
            reportPreview({
              type: 'narrate',
              section: section.id,
              step: context.stepFor(current.id),
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
                  ...scenes.map((scene) => ({
                    title: scene.label,
                    onItemClick: () => insertScene(scene.name),
                    aliases: ['animation', 'scene', '动画', scene.name],
                    group: t.animation,
                    icon: <PmIcon name="video" />,
                  })),
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
