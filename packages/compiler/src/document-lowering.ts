import { blockFirstText, blockSubtree, captionSourceFingerprint, DEFAULT_LANG, documentBlockSection, documentColorValue, finalVisuals, isRecord, referenceTargetTitle, voiceTarget } from '@lincyaw/kernel'
import type { CodeNode, ComponentNode, DocumentBlock, EmbedBlock, ReferenceNode, Finding, InlineNode, IRBlock, IRSection, JsonObject, MdastNode, NarrationNode, RichTextNode, SourcePos, PresmiumDocument, TextStyle, VisualState } from '@lincyaw/kernel'
import { dirname, relative, resolve, sep } from 'node:path'
import type { DocumentLinks } from './document-links.ts'

const pointerKey = (id: string) => id.replaceAll('~', '~0').replaceAll('/', '~1')
const source = (entry: string, pointer: string): SourcePos => ({ file: entry, line: 1, format: 'json', pointer })
const root = (children: MdastNode[]): MdastNode => ({ type: 'root', children })

/** How far synced blocks may show synced blocks. */
const EMBED_DEPTH = 4

interface LoweringContext {
  doc: PresmiumDocument
  entry: string
  deckDir: string
  english: boolean
  report: (finding: Finding) => void
  watch: (...files: string[]) => void
  links?: DocumentLinks
  /** Each synced block being shown and its source, outermost first, as `<document>#<block>`: a repeat is a cycle. */
  chain: string[]
}

/** Inline content's surroundings: the document and the block it is in, for references. */
interface InlineContext { doc: PresmiumDocument, entry: string, links?: DocumentLinks, report?: (finding: Finding) => void, where?: SourcePos, english?: boolean }

/** Lower the validated authoring graph directly; no Markdown is generated or parsed. */
/** `stored` is the document as saved, before inherited settings are filled in: caption timings were fingerprinted from it. */
/** `links` finds the workspace's other documents, for references to them and synced blocks from them. */
export function lowerDocument(doc: PresmiumDocument, entry: string, deckDir: string, report: (finding: Finding) => void, watch: (...files: string[]) => void, stored: PresmiumDocument = doc, links?: DocumentLinks): IRSection[] {
  const english = (doc.metadata.lang ?? DEFAULT_LANG).startsWith('en')
  const context: LoweringContext = { doc, entry, deckDir, english, report, watch, ...links ? { links } : {}, chain: [] }
  const resolved = new Map<string, Map<string, VisualState>>()
  const visuals = (id: string): Map<string, VisualState> => {
    const known = resolved.get(id)
    if (known) return known
    const step = doc.steps[id]!
    const result = step.inherits ? new Map(visuals(step.inherits)) : new Map<string, VisualState>()
    for (const visual of step.visuals) result.set(visual.blockId, { ...result.get(visual.blockId), ...visual, parameters: { ...result.get(visual.blockId)?.parameters, ...visual.parameters } })
    resolved.set(id, result)
    return result
  }
  return doc.sectionOrder.map((sectionId, index) => {
    const section = doc.sections[sectionId]!
    const states = section.stepOrder.map(visuals)
    const lower = blockLowerer(context, states, section.stepOrder, id => id)
    const blocks = section.children.map(lower)
    for (const [at, stepId] of section.stepOrder.entries()) {
      const step = doc.steps[stepId]!
      for (const narrationId of step.narrationIds) {
        const narration = doc.narrations[narrationId]!
        const production = { ...doc.production.defaults, ...doc.production.sectionOverrides?.[sectionId], ...doc.production.narrationOverrides?.[narrationId], ...doc.production.stepOverrides[stepId] }
        const mode = production.narrationStart === 'after-animation' ? 'after' : 'during'
        blocks.push({ id: `${stepId}:${narrationId}`, role: 'narration', at, only: ['lecture'], source: source(entry, `/narrations/${pointerKey(narrationId)}`), node: { type: 'markdown', narration: { mode }, mdast: root([{ type: 'paragraph', children: narration.content.map(node => narrationText(node, doc)) }]) } })
      }
    }
    const defaultVoice = doc.production.sectionOverrides?.[sectionId]?.voiceSource ?? doc.production.defaults.voiceSource
    const stepNarrations = Object.fromEntries(section.stepOrder.map(stepId => [stepId, doc.steps[stepId]!.narrationIds.map(id => ({ id, text: doc.narrations[id]!.content.map(node => node.type === 'text' ? node.text : node.type === 'pronunciation' ? node.display : '').join('') }))]))
    const resolvedNarrationVoices = Object.fromEntries(blocks.filter(block => block.role === 'narration').map(block => {
      const stepId = section.stepOrder[block.at]!
      const voice = doc.production.stepOverrides[stepId]?.voiceSource ?? defaultVoice
      const id = block.source.pointer!.split('/').at(-1)!.replaceAll('~1', '/').replaceAll('~0', '~')
      const advances = doc.narrations[id]!.content.some(node => node.type === 'cue' && node.action === 'next')
      const target = advances ? undefined : voiceTarget({ id: sectionId, steps: section.stepOrder.length - 1, stepIds: section.stepOrder, blocks }, block.at)
      return [block.id, { ...target ? { target } : {}, ...advances && section.stepOrder.some(id => doc.production.stepOverrides[id]?.voiceSource) ? { issue: 'cue-step' } : voice?.type === 'tts' ? { voice: voice.voice } : { issue: voice?.type === 'recording' ? 'recording-unavailable' : 'voice-unset' } }]
    }))
    return { id: sectionId, index: index + 1, title: section.title, depth: index === 0 && (section.level ?? 1) === 1 ? 0 : section.level ?? 1, source: source(entry, `/sections/${pointerKey(sectionId)}`), steps: Math.max(0, section.stepOrder.length - 1), stepIds: [...section.stepOrder], stepNarrations, captionSources: Object.fromEntries(section.stepOrder.map(id => [id, captionSourceFingerprint(stored, id)])), hints: section.layout.renderers ?? {}, ...section.audience ? { audience: section.audience } : {}, config: { ...section.config, 'presmium.lecture': { ...section.config?.['presmium.lecture'], resolvedNarrationVoices } }, blocks }
  })
}

/**
 * Lowers blocks of `c.doc` against the steps of the page being built: `states` holds each step's visual state per block
 * (of `c.doc`), `stepIds` the page's steps, `idOf` the ID a block has in the output (namespaced inside a synced block).
 */
function blockLowerer(c: LoweringContext, states: Map<string, VisualState>[], stepIds: string[], idOf: (id: string) => string): (id: string) => IRBlock {
  const { doc } = c
  const lower = (id: string): IRBlock => {
    const block = doc.blocks[id]!
    const where = source(c.entry, `/blocks/${pointerKey(id)}`)
    if (block.type === 'embed') return lowerEmbed(c, block, where, states.map(state => state.get(id)), stepIds, idOf(id))
    const definition = block.type === 'component' ? doc.definitions[block.definitionId] : undefined
    const stepStates = states.map((state, stepIndex) => {
      const visual = state.get(id)
      const stateIndex = definition?.states.findIndex(state => state.id === visual?.state) ?? -1
      const local = stateIndex < 0 ? 0 : definition!.states[stateIndex]!.legacyIndex ?? stateIndex
      const parameters = { ...block.type === 'component' ? block.parameters : {}, ...visual?.parameters }
      return { visible: visual?.visible ?? false, localStep: block.type === 'code' ? stepIndex : local, ...visual?.state !== undefined ? { state: visual.state } : {}, ...block.type === 'component' || visual?.parameters ? { parameters } : {} }
    })
    const visible = stepStates.flatMap((state, at) => state.visible ? [at] : [])
    const at = visible[0] ?? 0
    const node = lowerBlock(block, where)
    return { id: idOf(id), role: 'visual', at, span: Math.max(0, (visible.at(-1) ?? at) - at), ...block.only ? { only: block.only } : {}, ...block.audience ? { audience: block.audience } : {}, source: where, node, stepStates }
  }
  const lowerBlock = (block: Exclude<DocumentBlock, { type: 'embed' }>, where: SourcePos): IRBlock['node'] => {
    const inline: InlineContext = { doc, entry: c.entry, ...c.links ? { links: c.links } : {}, report: c.report, where, english: c.english }
    switch (block.type) {
      case 'text': return { type: 'markdown', mdast: root(block.content.map(node => richNode(node, inline))), ...block.reveal ? { reveal: 'items' } : {} }
      case 'image': {
        if (!block.assetId) {
          const message = c.english ? 'No image selected.' : '未选择图片。'
          c.report({ checkId: 'presmium.document.image', severity: 'warning', message, source: where })
          return { type: 'markdown', mdast: root([{ type: 'paragraph', children: [{ type: 'text', value: message }] }]) }
        }
        return { type: 'markdown', mdast: root([{ type: 'paragraph', children: [{ type: 'image', url: doc.assets[block.assetId]!.location, alt: block.alt, ...block.width ? { width: block.width } : {} }] }, ...block.caption ? [{ type: 'paragraph', children: inlineNodes(block.caption, inline) }] : []]) }
      }
      case 'code': {
        const node: CodeNode = { type: 'code', lang: block.language, value: block.value ?? '', ...block.title ? { title: block.title } : {}, ...block.execution ? { run: { lang: block.language, ...block.execution } } : {}, ...block.echo === false ? { echo: false } : {} }
        if (block.origin) {
          node.reference = { anchor: block.origin.anchor as `${string}:${string}`, ...block.origin.pin ? { pin: block.origin.pin } : {}, ...block.origin.repo ? { repo: block.origin.repo } : {}, ...block.origin.highlightRegions ? { highlightRegions: stepIds.map(id => block.origin!.highlightRegions![id] ?? 'none') } : {} }
        }
        if (block.variants?.some(variant => variant.origin)) node.reference = { ...node.reference, anchor: (block.origin?.anchor ?? block.variants.find(variant => variant.origin)!.origin!.anchor) as `${string}:${string}`, variants: block.variants.map(variant => ({ ...variant.origin ? { anchor: variant.origin.anchor as `${string}:${string}`, ...variant.origin.pin ? { pin: variant.origin.pin } : {}, ...variant.origin.repo ? { repo: variant.origin.repo } : {} } : { value: variant.value! }, label: variant.title })) }
        if (block.origin) {
          if (!/^[a-z][a-z0-9+-]*:/i.test(block.origin.anchor)) c.report({ checkId: 'presmium.document', severity: 'error', message: 'A code origin requires a registered anchor scheme.', source: where })
          else node.origin = { anchor: block.origin.anchor as `${string}:${string}`, file: '', startLine: 0, endLine: 0, status: 'lost', ...block.origin.pin ? { pin: block.origin.pin } : {} }
        }
        if (block.highlight) node.highlight = stepIds.map(id => block.highlight?.[id] ?? [])
        if (block.variants) node.variants = block.variants.map(variant => ({ label: variant.title, value: variant.value ?? '' }))
        return node
      }
      case 'container': return { type: 'component', plugin: 'presmium.layout', name: block.layout === 'columns' ? 'PmColumns' : block.layout === 'tabs' ? 'PmTabs' : 'PmStack', props: { ...block.properties }, children: block.children.map(lower) }
      case 'component': {
        const definition = doc.definitions[block.definitionId]!
        const implementation = definition.implementation
        const data = definition.data ?? {}
        const plugin = typeof data.plugin === 'string' ? data.plugin : implementation.type === 'plugin' ? implementation.plugin : 'deck'
        const name = typeof data.name === 'string' ? data.name : implementation.type === 'plugin' ? implementation.name : `presmium-definition:${definition.id}`
        const node: ComponentNode = { type: 'component', plugin, name, props: { ...block.parameters }, ...block.children ? { children: block.children.map(lower) } : {} }
        if (Array.isArray(data.durations) && data.durations.every(value => typeof value === 'number')) node.durations = data.durations
        if (isRecord(data.fallback) && typeof data.fallback.type === 'string') node.fallback = structuredClone(data.fallback) as MdastNode
        if (isRecord(data.assets) && Object.values(data.assets).every(value => typeof value === 'string')) node.assets = { ...data.assets } as Record<string, string>
        if (data.layer === 'overlay') node.layer = 'overlay'
        if (data.ownsCode === true) node.ownsCode = true
        if (implementation.type === 'file') {
          const file = resolve(c.deckDir, implementation.path)
          c.watch(file)
          node.definition = { file, kind: definition.kind, language: typeof data.language === 'string' ? data.language : /\.[cm]?tsx?$/.test(file) ? 'typescript' : 'javascript', ...implementation.exportName !== undefined ? { exportName: implementation.exportName } : {} }
        }
        if (implementation.type === 'module') c.report({ checkId: 'presmium.document', severity: 'error', message: 'Module component implementations are not available in the current document runtime; use a project file or a registered plugin component.', source: where })
        return node
      }
    }
  }
  return lower
}

/** A visible placeholder where a synced block cannot be shown, and the diagnostic saying why. */
function embedProblem(c: LoweringContext, checkId: 'embed.missing' | 'embed.cycle' | 'embed.depth', message: string, block: EmbedBlock, where: SourcePos, host: (VisualState | undefined)[], id: string): IRBlock {
  c.report({ checkId, severity: 'error', message, source: where })
  const stepStates = host.map(visual => ({ visible: visual?.visible ?? false, localStep: 0 }))
  const visible = stepStates.flatMap((state, at) => state.visible ? [at] : [])
  const at = visible[0] ?? 0
  return { id, role: 'visual', at, span: Math.max(0, (visible.at(-1) ?? at) - at), ...block.only ? { only: block.only } : {}, ...block.audience ? { audience: block.audience } : {}, source: where, node: { type: 'markdown', mdast: root([{ type: 'paragraph', children: [{ type: 'text', value: message }], data: { hProperties: { className: ['pm-embed-problem'] } } }]) }, stepStates }
}

/**
 * A synced block: the source block and its subtree, lowered in the source document's own context (its folder, assets,
 * definitions and settings), with IDs `<id>~<source block ID>` below it. The host's state for the synced block drives
 * the source block's visibility, named state and parameters; without a state of its own the source's final one shows.
 * The blocks below it show wherever it does, in their final state in the source.
 */
function lowerEmbed(c: LoweringContext, block: EmbedBlock, where: SourcePos, host: (VisualState | undefined)[], stepIds: string[], id: string): IRBlock {
  const { document: sourceId, block: sourceBlock } = block.source

  const linked = sourceId === c.doc.id ? { entry: c.entry, deckDir: c.deckDir, document: c.doc, trashed: false } : c.links?.resolve(sourceId)
  if (!linked) return embedProblem(c, 'embed.missing', c.english ? `Synced block: the document ${sourceId} is not in this workspace.` : `同步块：工作区中没有文稿 ${sourceId}。`, block, where, host, id)
  if (!Object.hasOwn(linked.document.blocks, sourceBlock)) return embedProblem(c, 'embed.missing', c.english ? `Synced block: ${linked.document.metadata.title} has no block ${sourceBlock}.` : `同步块：《${linked.document.metadata.title}》中没有内容块 ${sourceBlock}。`, block, where, host, id)
  const named = c.english ? `“${blockFirstText(linked.document, sourceBlock) || sourceBlock}” in ${linked.document.metadata.title}` : `《${linked.document.metadata.title}》中的“${blockFirstText(linked.document, sourceBlock) || sourceBlock}”`
  const key = `${sourceId}#${sourceBlock}`
  // The synced block itself is on the way too: a source that shows it again is a cycle at once.
  const own = `${c.doc.id}#${block.id}`
  if (key === own || c.chain.includes(key) || (sourceId === c.doc.id && blockSubtree(c.doc, sourceBlock)?.[block.id])) return embedProblem(c, 'embed.cycle', c.english ? `Synced block: ${named} shows this synced block again, through synced blocks; it cannot be shown.` : `同步块：${named} 经由同步块又显示了这个同步块，无法显示。`, block, where, host, id)
  if (c.chain.length / 2 >= EMBED_DEPTH) return embedProblem(c, 'embed.depth', c.english ? `Synced block: synced blocks are nested more than ${EMBED_DEPTH} deep at ${named}.` : `同步块：在 ${named} 处嵌套超过 ${EMBED_DEPTH} 层。`, block, where, host, id)
  if (linked.trashed) c.report({ checkId: 'embed.source-trashed', severity: 'warning', message: c.english ? `Synced block: ${linked.document.metadata.title} is in the trash; the block still shows until the document is deleted for good, when it becomes a copy.` : `同步块：《${linked.document.metadata.title}》在回收站中；彻底删除前仍然显示，彻底删除时转为副本。`, source: where })
  if (linked.entry !== c.entry) c.watch(linked.entry)
  const source = linked.document
  const subtree = blockSubtree(source, sourceBlock)!
  const final = finalVisuals(source, documentBlockSection(source, sourceBlock))
  // A source block no step shows (it is not on a page) shows with everything below it.
  const shownUnplaced = !final.has(sourceBlock)
  const states = host.map((visual) => {
    const shown = visual?.visible ?? false
    const state = new Map<string, VisualState>()
    const rootFinal = final.get(sourceBlock)
    const stateName = visual?.state ?? rootFinal?.state
    state.set(sourceBlock, { blockId: sourceBlock, visible: shown, ...stateName !== undefined ? { state: stateName } : {}, parameters: { ...rootFinal?.parameters, ...visual?.parameters } })
    for (const child of Object.keys(subtree)) {
      if (child === sourceBlock) continue
      const was = final.get(child)
      if (was || shownUnplaced) state.set(child, { ...was, blockId: child, visible: shown })
    }
    return state
  })
  const inner: LoweringContext = { ...c, doc: source, entry: linked.entry, deckDir: linked.deckDir, chain: [...c.chain, own, key] }
  const lowered = blockLowerer(inner, states, stepIds, child => child === sourceBlock ? id : `${id}~${child}`)(sourceBlock)
  return { ...lowered, ...block.only ? { only: block.only } : {}, ...block.audience ? { audience: block.audience } : {} }
}

function styled(node: MdastNode, style: TextStyle | undefined): MdastNode {
  if (!style) return node
  const properties: Record<string, string> = {}
  const css = [style.alignment ? `text-align:${style.alignment}` : '', style.color ? `color:${documentColorValue(style.color, 'text')}` : '', style.background ? `background-color:${documentColorValue(style.background, 'background')}` : ''].filter(Boolean).join(';')
  if (css) properties.style = css
  return { ...node, data: { hProperties: properties } }
}

function sectionOwns(doc: PresmiumDocument, children: string[], id: string): boolean {
  return children.some((child) => {
    if (child === id) return true
    const block = doc.blocks[child]
    return block !== undefined && (block.type === 'container' || block.type === 'component') && sectionOwns(doc, block.children ?? [], id)
  })
}

/**
 * A reference: a link marked `presmiumReference` (renderers other than the web turn it into its text, see `viewFor`)
 * to the target's page and anchor, showing its label or the target's current title. A target that is gone (or in the
 * trash) shows the last known title as plain text, with `reference.missing`.
 */
function referenceNode(node: ReferenceNode, c: InlineContext): MdastNode {
  const own = node.target.document === c.doc.id
  if (!own && !c.links) return { type: 'text', value: node.label ?? node.fallback }
  const linked = own ? { entry: c.entry, document: c.doc, trashed: false } : c.links!.resolve(node.target.document)
  const title = linked && !linked.trashed ? referenceTargetTitle(linked.document, node.target) : undefined
  const text: MdastNode = { type: 'text', value: node.label ?? title ?? node.fallback }
  if (!linked || title === undefined) {
    const message = c.english
      ? `The reference to ${node.fallback || node.target.document} has no target: the ${linked?.trashed ? 'document is in the trash' : !linked ? 'document is gone' : node.target.block !== undefined ? 'block is gone' : 'page is gone'}; it shows its last title.`
      : `引用“${node.fallback || node.target.document}”的目标${linked?.trashed ? '文稿在回收站中' : !linked ? '文稿不存在' : node.target.block !== undefined ? '内容块不存在' : '页面不存在'}，显示最后的标题。`
    c.report?.({ checkId: 'reference.missing', severity: 'warning', message, ...c.where ? { source: c.where } : {} })
    return text
  }
  const data = { presmiumReference: true }
  if (own) {
    const section = node.target.section ?? (node.target.block ? Object.values(c.doc.sections).find(section => sectionOwns(c.doc, section.children, node.target.block!))?.id : undefined)
    return section !== undefined && Object.hasOwn(c.doc.sections, section) ? { type: 'link', url: `#${section}`, children: [text], data } : text
  }
  const path = relative(dirname(c.entry), linked.entry).split(sep).map(encodeURIComponent).join('/')
  const anchor = node.target.block ?? node.target.section
  return { type: 'link', url: `${path}${anchor !== undefined ? `#${encodeURIComponent(anchor)}` : ''}`, children: [text], data }
}

export function inlineNodes(nodes: InlineNode[], c: InlineContext): MdastNode[] {
  const inlineText = (nodes: InlineNode[]) => inlineNodes(nodes, c)
  return nodes.map(node => {
    if (node.type === 'text') {
      let result: MdastNode = { type: node.marks?.some(mark => mark.type === 'code') ? 'inlineCode' : 'text', value: node.text }
      for (const mark of node.marks ?? []) {
        if (mark.type === 'code') continue
        if (mark.type === 'color' || mark.type === 'background') result = { type: 'emphasis', children: [result], data: { hName: 'span', hProperties: { style: mark.type === 'color' ? `color:${documentColorValue(mark.value, 'text')}` : `background-color:${documentColorValue(mark.value, 'background')}` } } }
        else result = { type: { bold: 'strong', italic: 'emphasis', underline: 'underline', strike: 'delete' }[mark.type], children: [result] }
      }
      return result
    }
    if (node.type === 'link') return { type: 'link', url: node.href, children: inlineText(node.children) }
    if (node.type === 'math') return { type: 'inlineMath', value: node.value }
    if (node.type === 'break') return { type: 'break' }
    if (node.type === 'reference') return referenceNode(node, c)
    return extensionNode(node.kind, node.schemaVersion, node.data, [{ type: 'text', value: node.fallback }])
  })
}

export function richNode(node: RichTextNode, c: InlineContext): MdastNode {
  const inlineText = (nodes: InlineNode[]) => inlineNodes(nodes, c)
  const richText = (node: RichTextNode) => richNode(node, c)
  let result: MdastNode
  switch (node.type) {
    case 'paragraph': result = styled({ type: 'paragraph', children: inlineText(node.children) }, node.style); break
    case 'heading': result = styled({ type: 'heading', depth: node.level, children: inlineText(node.children) }, node.style); break
    case 'list': result = { type: 'list', ordered: node.ordered, start: node.start, spread: false, children: node.children.map(item => ({ type: 'listItem', checked: item.checked, children: item.children.map(richText), identifier: item.id })) }; break
    case 'blockquote': result = { type: 'blockquote', children: node.children.map(richText) }; break
    case 'code': result = { type: 'code', lang: node.language, value: node.value }; break
    case 'math': result = { type: 'math', value: node.value }; break
    case 'table': result = { type: 'table', headerRows: node.headerRows, headerColumns: node.headerColumns, columnWidths: node.columnWidths, children: node.children.map(row => ({ type: 'tableRow', identifier: row.id, children: row.children.map(cell => styled({ type: 'tableCell', identifier: cell.id, colspan: cell.colspan, rowspan: cell.rowspan, children: inlineText(cell.children) }, cell.style)) })) }; break
    case 'extension': result = extensionNode(node.kind, node.schemaVersion, node.data, node.fallback.map(richText)); break
  }
  return { ...result, ...node.type === 'extension' ? {} : { identifier: node.id }, data: { ...isRecord(result.data) ? result.data : {}, presmiumId: node.id } }
}

/** Known imported semantic trees remain structured data, never a reparsed authoring string. */
function extensionNode(kind: string, schemaVersion: number, data: JsonObject, fallback: MdastNode[]): MdastNode {
  if (kind === 'presmium.mdast' && schemaVersion === 1 && isRecord(data.node) && typeof data.node.type === 'string') return structuredClone(data.node) as MdastNode
  return { type: 'presmiumExtension', kind, schemaVersion, data: structuredClone(data), children: fallback }
}

function narrationText(node: NarrationNode, doc: PresmiumDocument): MdastNode {
  if (node.type === 'text') return { type: 'text', value: node.text }
  if (node.type === 'pronunciation') return { type: 'presmiumRole', plugin: 'presmium.lecture', name: 'say', options: { value: node.display, alias: node.spoken }, children: [{ type: 'text', value: node.display }] }
  const arg = node.action === 'pause' ? `${doc.production.cueTimings?.[node.id]?.pauseMs ?? node.parameters?.arg ?? 0}${doc.production.cueTimings?.[node.id] ? 'ms' : ''}` : node.parameters?.arg
  return { type: 'presmiumRole', plugin: 'presmium.lecture', name: 'cue', options: { ...node.parameters, value: `${node.action}${arg === undefined || arg === '' ? '' : ` ${String(arg)}`}`, ...node.target ? { to: node.target.blockId, ...node.target.element ? { sel: node.target.element } : {} } : {} }, children: [] }
}
