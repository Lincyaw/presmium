import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems } from '@blocknote/core'
import { en, zh } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import { createReactBlockSpec, getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react'
import { PmIcon, useAppearance, useMessages, useStore } from '@lincyaw/host'
import { PREVIEW_REVISION, reportPreview } from '@lincyaw/kernel'
import type { IRBlock, IRSection, MdastNode, PreviewCommand, PreviewEditedBlock } from '@lincyaw/kernel'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BlockView } from '../block.ts'
import { useViewer } from '../viewer-state.ts'
import { EDITOR_MESSAGES } from './messages.ts'
import '@blocknote/mantine/style.css'
import './style.css'

interface SceneChoice { name: string, durations: number[], original?: IRBlock }
interface EditingContext { section: IRSection, blocks: Map<string, IRBlock>, scenes: SceneChoice[] }
const EDITING = createContext<EditingContext | undefined>(undefined)

const sceneSpec = createReactBlockSpec({ type: 'presmiumScene', propSchema: { source: { default: '' }, scene: { default: '' }, durations: { default: '' } }, content: 'none' }, {
  render: ({ block, editor }) => {
    const context = useContext(EDITING)!
    const t = useMessages(EDITOR_MESSAGES)
    const original = context.blocks.get(block.props.source)
    const name = block.props.scene || (original?.node.type === 'component' ? String(original.node.props.scene ?? '') : '')
    const selected = context.scenes.find(s => s.name === name)
    const durations = block.props.durations ? JSON.parse(block.props.durations) as number[] : selected?.durations ?? [1000]
    const previous = editor.document.slice(0, editor.document.findIndex(entry => entry.id === block.id))
    const start = previous.reduce((at, entry) => { const known = context.blocks.get('source' in entry.props ? String(entry.props.source) : entry.id); return Math.max(at, (known?.at ?? at) + (entry.type === 'presmiumScene' ? Math.max(1, JSON.parse(entry.props.durations || '[1000]').length) : known?.span ?? 0)) }, 0)
    const rendered: IRBlock = { ...original ?? selected?.original ?? { id: block.id, role: 'visual', at: start, source: context.section.source }, id: original?.id ?? block.id, node: { type: 'component', plugin: 'presmium.motion', name: 'PmScene', props: { ...original?.node.type === 'component' ? original.node.props : {}, scene: name }, durations } }
    return <div className="pm-block-editor__scene" data-block={rendered.id} contentEditable={false}>
      <div className="pm-block-editor__scene-tools">
        <label><PmIcon name="video" /><select aria-label={t.scene} value={name} onChange={event => { const choice = context.scenes.find(s => s.name === event.target.value); editor.updateBlock(block, { props: { scene: event.target.value, durations: JSON.stringify(choice?.durations ?? [1000]) } }) }}>{context.scenes.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}</select></label>
        <button type="button" className="pm-ui-icon-button pm-ui-icon-button--small" aria-label={t.editNarration} title={t.editNarration} onClick={() => reportPreview({ type: 'narrate', section: context.section.id, step: rendered.at })}><PmIcon name="captions" /></button>
      </div>
      <BlockView block={rendered} section={context.section} step={Infinity} expanded />
    </div>
  },
})()

const opaqueSpec = createReactBlockSpec({ type: 'presmiumContent', propSchema: { source: { default: '' } }, content: 'none' }, {
  render: ({ block }) => {
    const context = useContext(EDITING)!
    const t = useMessages(EDITOR_MESSAGES)
    const original = context.blocks.get(block.props.source)
    return <div className="pm-block-editor__opaque" contentEditable={false} title={t.retained}>{original ? <BlockView block={original} section={context.section} step={Infinity} expanded /> : null}</div>
  },
})()

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, presmiumScene: sceneSpec, presmiumContent: opaqueSpec } })
type Editor = typeof schema.BlockNoteEditor
type EditorBlock = typeof schema.Block


function markdown(node: MdastNode): string {
  const inner = () => (node.children ?? []).map(markdown).join('')
  switch (node.type) {
    case 'root': return (node.children ?? []).map(markdown).join('\n\n')
    case 'text': return String(node.value ?? '').replace(/[\\`*_[\]<>]/g, '\\$&')
    case 'paragraph': return inner()
    case 'heading': return `${'#'.repeat(Number(node.depth ?? 2))} ${inner()}`
    case 'strong': return `**${inner()}**`
    case 'emphasis': return `*${inner()}*`
    case 'delete': return `~~${inner()}~~`
    case 'inlineCode': return `\`${String(node.value ?? '')}\``
    case 'link': return `[${inner()}](${String(node.url ?? '')})`
    case 'image': return `![${String(node.alt ?? '')}](${String(node.url ?? '')})`
    case 'blockquote': return inner().split('\n').map(line => `> ${line}`).join('\n')
    case 'list': return (node.children ?? []).map((item, k) => `${node.ordered ? `${Number(node.start ?? 1) + k}.` : '-'} ${markdown(item).replaceAll('\n', '\n  ')}`).join('\n')
    case 'listItem': return (node.children ?? []).map(markdown).join('\n')
    case 'break': return '  \n'
    case 'thematicBreak': return '---'
    default: return String(node.value ?? inner())
  }
}
const SUPPORTED = new Set(['root', 'text', 'paragraph', 'heading', 'strong', 'emphasis', 'delete', 'inlineCode', 'link', 'image', 'blockquote', 'list', 'listItem', 'break', 'thematicBreak'])
function simple(node: MdastNode): boolean { return SUPPORTED.has(node.type) && (node.children ?? []).every(simple) }
function body(section: IRSection) { return section.blocks.filter(b => b.role === 'visual' || (b.only && !b.only.includes('lecture'))) }
const signature = (block: EditorBlock) => JSON.stringify([block.type, block.props, block.content, block.children])

function prepare(editor: Editor, section: IRSection) {
  const sources = new Map<string, { source: string, signature: string }>()
  const blocks: EditorBlock[] = []
  for (const block of body(section)) {
    let added: EditorBlock[]
    if (block.node.type === 'component' && block.node.name === 'PmScene') added = [{ id: block.id, type: 'presmiumScene', props: { source: block.id, scene: String(block.node.props.scene ?? ''), durations: JSON.stringify(block.node.durations ?? [1000]) }, content: undefined, children: [] }]
    else if (block.node.type === 'markdown' && !block.node.reveal && simple(block.node.mdast)) added = editor.tryParseMarkdownToBlocks(markdown(block.node.mdast))
    else if (block.node.type === 'code' && !block.node.run && !block.node.origin && !block.node.variants) added = editor.tryParseMarkdownToBlocks(`\`\`\`${block.node.lang}\n${block.node.value}\n\`\`\``)
    else added = [{ id: block.id, type: 'presmiumContent', props: { source: block.id }, content: undefined, children: [] }]
    added.forEach((entry, k) => { entry.id = k === 0 ? block.id : `${block.id}--${k}`; sources.set(entry.id, { source: block.id, signature: signature(entry) }); blocks.push(entry) })
  }
  return { blocks, sources }
}


export default function MountedEditor({ section }: { section: IRSection }) {
  const viewer = useViewer()
  const doc = useStore(viewer.doc)
  const t = useMessages(EDITOR_MESSAGES)
  const appearance = useAppearance()
  const dictionary = doc.meta.lang?.startsWith('zh') ? zh : en
  const editor = useCreateBlockNote({ schema, dictionary: { ...dictionary, placeholders: { ...dictionary.placeholders, default: t.empty } } }, [section.id])
  const prepared = useRef<ReturnType<typeof prepare>>()
  const ready = useRef(false)
  const dirty = useRef(false)
  const inFlight = useRef<number>()
  const generation = useRef(0)
  const savedGeneration = useRef(0)
  const revision = useRef(String(doc.meta[PREVIEW_REVISION] ?? ''))
  const nextRequest = useRef(0)
  const saveRef = useRef<() => void>(() => {})
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'failed'>('saved')
  const [failure, setFailure] = useState('')
  const lastSelected = useRef('')
  const known = useMemo(() => new Map(section.blocks.map(b => [b.id, b])), [section])
  const scenes = useMemo(() => {
    const found = new Map<string, SceneChoice>()
    for (const page of doc.sections) for (const block of page.blocks) if (block.node.type === 'component' && block.node.name === 'PmScene') found.set(String(block.node.props.scene), { name: String(block.node.props.scene), durations: block.node.durations ?? [1000], original: block })
    const configured = doc.config.presmium['presmium.motion'] as { scenes?: string[] } | undefined
    for (const name of configured?.scenes ?? []) if (!found.has(name)) found.set(name, { name, durations: [1000] })
    return [...found.values()]
  }, [doc])
  const context = useMemo(() => ({ section, blocks: known, scenes }), [section, known, scenes])
  const outgoing = (): PreviewEditedBlock[] => {
    let nextAt = 0
    return editor.document.map(block => {
      const original = prepared.current?.sources.get(block.id)
      const source = original?.source
      const at = source ? known.get(source)?.at ?? nextAt : nextAt
      const span = block.type === 'presmiumScene' ? Math.max(1, JSON.parse(block.props.durations || '[1000]').length) : source ? known.get(source)?.span ?? 0 : 0
      nextAt = Math.max(nextAt, at + span)
      if (block.type === 'presmiumScene') return { id: block.id, at, source: block.props.source || undefined, scene: block.props.scene, durations: JSON.parse(block.props.durations || '[1000]') as number[] }
      if (block.type === 'presmiumContent') return { id: block.id, source: block.props.source }
      // A source list can expand to several editor blocks. Serialize those pieces individually, preserving the first id.
      const repeated = source && [...prepared.current!.sources.values()].filter(s => s.source === source).length > 1
      return { id: block.id, at, ...source ? { source } : {}, ...!repeated && original?.signature === signature(block) ? {} : { markdown: editor.blocksToMarkdownLossy([block]) } }
    })
  }
  const save = () => {
    clearTimeout(timer.current)
    if (!dirty.current || inFlight.current !== undefined || failure) return
    let blocks: PreviewEditedBlock[]
    try { blocks = outgoing() } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); setState('failed'); return }
    const request = ++nextRequest.current
    inFlight.current = request
    savedGeneration.current = generation.current
    setState('saving')
    reportPreview({ type: 'blocks-edited', section: section.id, request, revision: revision.current, blocks })
  }
  const load = () => {
    ready.current = false
    prepared.current = prepare(editor, section)
    editor.replaceBlocks(editor.document, prepared.current.blocks.length ? prepared.current.blocks : [{ type: 'paragraph' }])
    revision.current = String(doc.meta[PREVIEW_REVISION] ?? '')
    dirty.current = false
    inFlight.current = undefined
    setFailure(''); setState('saved')
    ready.current = true
  }
  useLayoutEffect(() => { load() }, [editor])
  useEffect(() => {
    const updated = String(doc.meta[PREVIEW_REVISION] ?? '')
    if (updated === revision.current) return
    if (inFlight.current !== undefined) return
    if (dirty.current) { setFailure(t.conflict); setState('failed') }
    else load()
  }, [section, doc])
  saveRef.current = save
  useEffect(() => {
    const result = (event: Event) => {
      const answer = (event as CustomEvent<Extract<PreviewCommand, { type: 'blocks-result' }>>).detail
      if (answer.section !== section.id || answer.request !== inFlight.current) return
      inFlight.current = undefined
      if (answer.error) { setFailure(answer.error); setState('failed'); return }
      revision.current = answer.revision ?? revision.current
      dirty.current = generation.current !== savedGeneration.current
      setState(dirty.current ? 'dirty' : 'saved')
      if (dirty.current) timer.current = setTimeout(() => saveRef.current(), 500)
    }
    window.addEventListener('presmium:blocks-result', result)
    return () => { window.removeEventListener('presmium:blocks-result', result); clearTimeout(timer.current) }
  }, [section.id])
  useEffect(() => () => { if (dirty.current) saveRef.current() }, [section.id])
  const insertScene = () => {
    const choice = scenes[0]
    if (!choice) return
    editor.insertBlocks([{ type: 'presmiumScene', props: { scene: choice.name, durations: JSON.stringify(choice.durations) } }], editor.getTextCursorPosition().block, 'after')
  }
  return <EDITING.Provider value={context}><div className="pm-block-editor pm-ui" aria-label={t.editor} onKeyDown={event => { if (event.key === 's' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() } }}>
    <div className="pm-block-editor__tools">
      <button type="button" className="pm-ui-icon-button pm-ui-icon-button--small" title={scenes.length ? t.insertAnimation : t.noScene} aria-label={t.insertAnimation} disabled={!scenes.length} onClick={insertScene}><PmIcon name="video" /></button>
      <span className="pm-block-editor__status" role="status">{state === 'saving' ? t.saving : state === 'dirty' ? t.dirty : state === 'failed' ? t.error : t.saved}</span>
      <button type="button" className="pm-ui-icon-button pm-ui-icon-button--small" title={t.save} aria-label={t.save} disabled={state !== 'dirty'} onClick={save}><PmIcon name="save" /></button>
      {failure && <button type="button" className="pm-ui-button pm-ui-button--small" onClick={load}>{t.reload}</button>}
    </div>
    {failure && <div className="pm-ui-notice pm-ui-notice--danger" role="alert">{failure}</div>}
    <BlockNoteView editor={editor} theme={appearance.dark ? 'dark' : 'light'} slashMenu={false} onChange={() => {
      if (!ready.current) return
      generation.current++; dirty.current = true; setState('dirty')
      clearTimeout(timer.current); timer.current = setTimeout(save, 700)
    }} onSelectionChange={() => {
      if (!ready.current) return
      const current = editor.getTextCursorPosition().block
      if (current.id === lastSelected.current) return
      lastSelected.current = current.id
      const original = prepared.current?.sources.get(current.id)
      reportPreview({ type: 'narrate', section: section.id, step: original ? known.get(original.source)?.at ?? 0 : 0 })
    }}>
      <SuggestionMenuController triggerCharacter="/" getItems={async query => filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), ...scenes.length ? [{ title: t.animation, onItemClick: insertScene, aliases: ['animation', 'scene', '动画'], group: t.animation, icon: <PmIcon name="video" /> }] : []], query)} />
    </BlockNoteView>
  </div></EDITING.Provider>
}
