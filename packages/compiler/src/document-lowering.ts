import { captionSourceFingerprint, DEFAULT_LANG, documentColorValue, isRecord, voiceTarget } from '@lincyaw/kernel'
import type { CodeNode, ComponentNode, DocumentBlock, ReferenceNode, Finding, InlineNode, IRBlock, IRSection, JsonObject, MdastNode, NarrationNode, RichTextNode, SourcePos, PresmiumDocument, TextStyle, VisualState } from '@lincyaw/kernel'
import { resolve } from 'node:path'

const pointerKey = (id: string) => id.replaceAll('~', '~0').replaceAll('/', '~1')
const source = (entry: string, pointer: string): SourcePos => ({ file: entry, line: 1, format: 'json', pointer })
const root = (children: MdastNode[]): MdastNode => ({ type: 'root', children })

/** Lower the validated authoring graph directly; no Markdown is generated or parsed. */
/** `stored` is the document as saved, before inherited settings are filled in: caption timings were fingerprinted from it. */
export function lowerDocument(doc: PresmiumDocument, entry: string, deckDir: string, report: (finding: Finding) => void, watch: (...files: string[]) => void, stored: PresmiumDocument = doc): IRSection[] {
  const english = (doc.metadata.lang ?? DEFAULT_LANG).startsWith('en')
  const inlineText = (nodes: InlineNode[]) => inlineNodes(nodes, doc)
  const richText = (node: RichTextNode) => richNode(node, doc)
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
    const lower = (id: string): IRBlock => {
      const block = doc.blocks[id]!
      const where = source(entry, `/blocks/${pointerKey(id)}`)
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
      const node = lowerBlock(block, where, section.stepOrder, lower)
      return { id, role: 'visual', at, span: Math.max(0, (visible.at(-1) ?? at) - at), ...block.only ? { only: block.only } : {}, ...block.audience ? { audience: block.audience } : {}, source: where, node, stepStates }
    }
    const lowerBlock = (block: DocumentBlock, where: SourcePos, stepIds: string[], child: (id: string) => IRBlock): IRBlock['node'] => {
      switch (block.type) {
        case 'text': return { type: 'markdown', mdast: root(block.content.map(richText)), ...block.reveal ? { reveal: 'items' } : {} }
        case 'image': {
          if (!block.assetId) {
            const message = english ? 'No image selected.' : '未选择图片。'
            report({ checkId: 'presmium.document.image', severity: 'warning', message, source: where })
            return { type: 'markdown', mdast: root([{ type: 'paragraph', children: [{ type: 'text', value: message }] }]) }
          }
          return { type: 'markdown', mdast: root([{ type: 'paragraph', children: [{ type: 'image', url: doc.assets[block.assetId]!.location, alt: block.alt, ...block.width ? { width: block.width } : {} }] }, ...block.caption ? [{ type: 'paragraph', children: inlineText(block.caption) }] : []]) }
        }
        case 'code': {
          const node: CodeNode = { type: 'code', lang: block.language, value: block.value ?? '', ...block.title ? { title: block.title } : {}, ...block.execution ? { run: { lang: block.language, ...block.execution } } : {}, ...block.echo === false ? { echo: false } : {} }
          if (block.origin) {
            node.reference = { anchor: block.origin.anchor as `${string}:${string}`, ...block.origin.pin ? { pin: block.origin.pin } : {}, ...block.origin.repo ? { repo: block.origin.repo } : {}, ...block.origin.highlightRegions ? { highlightRegions: stepIds.map(id => block.origin!.highlightRegions![id] ?? 'none') } : {} }
          }
          if (block.variants?.some(variant => variant.origin)) node.reference = { ...node.reference, anchor: (block.origin?.anchor ?? block.variants.find(variant => variant.origin)!.origin!.anchor) as `${string}:${string}`, variants: block.variants.map(variant => ({ ...variant.origin ? { anchor: variant.origin.anchor as `${string}:${string}`, ...variant.origin.pin ? { pin: variant.origin.pin } : {}, ...variant.origin.repo ? { repo: variant.origin.repo } : {} } : { value: variant.value! }, label: variant.title })) }
          if (block.origin) {
            if (!/^[a-z][a-z0-9+-]*:/i.test(block.origin.anchor)) report({ checkId: 'presmium.document', severity: 'error', message: 'A code origin requires a registered anchor scheme.', source: where })
            else node.origin = { anchor: block.origin.anchor as `${string}:${string}`, file: '', startLine: 0, endLine: 0, status: 'lost', ...block.origin.pin ? { pin: block.origin.pin } : {} }
          }
          if (block.highlight) node.highlight = stepIds.map(id => block.highlight?.[id] ?? [])
          if (block.variants) node.variants = block.variants.map(variant => ({ label: variant.title, value: variant.value ?? '' }))
          return node
        }
        case 'embed': {
          // Synced blocks are shown in place by a later version; until then the page says so where the block is.
          const message = english ? `Synced block from ${block.source.document}: synced blocks are shown in a later version of Presmium.` : `来自 ${block.source.document} 的同步块：同步块将在后续版本中显示。`
          report({ checkId: 'embed.unresolved', severity: 'warning', message, source: where })
          return { type: 'markdown', mdast: root([{ type: 'paragraph', children: [{ type: 'text', value: message }], data: { hProperties: { className: ['pm-embed-placeholder'] } } }]) }
        }
        case 'container': return { type: 'component', plugin: 'presmium.layout', name: block.layout === 'columns' ? 'PmColumns' : block.layout === 'tabs' ? 'PmTabs' : 'PmStack', props: { ...block.properties }, children: block.children.map(child) }
        case 'component': {
          const definition = doc.definitions[block.definitionId]!
          const implementation = definition.implementation
          const data = definition.data ?? {}
          const plugin = typeof data.plugin === 'string' ? data.plugin : implementation.type === 'plugin' ? implementation.plugin : 'deck'
          const name = typeof data.name === 'string' ? data.name : implementation.type === 'plugin' ? implementation.name : `presmium-definition:${definition.id}`
          const node: ComponentNode = { type: 'component', plugin, name, props: { ...block.parameters }, ...block.children ? { children: block.children.map(child) } : {} }
          if (Array.isArray(data.durations) && data.durations.every(value => typeof value === 'number')) node.durations = data.durations
          if (isRecord(data.fallback) && typeof data.fallback.type === 'string') node.fallback = structuredClone(data.fallback) as MdastNode
          if (isRecord(data.assets) && Object.values(data.assets).every(value => typeof value === 'string')) node.assets = { ...data.assets } as Record<string, string>
          if (data.layer === 'overlay') node.layer = 'overlay'
          if (data.ownsCode === true) node.ownsCode = true
          if (implementation.type === 'file') {
            const file = resolve(deckDir, implementation.path)
            watch(file)
            node.definition = { file, kind: definition.kind, language: typeof data.language === 'string' ? data.language : /\.[cm]?tsx?$/.test(file) ? 'typescript' : 'javascript', ...implementation.exportName !== undefined ? { exportName: implementation.exportName } : {} }
          }
          if (implementation.type === 'module') report({ checkId: 'presmium.document', severity: 'error', message: 'Module component implementations are not available in the current document runtime; use a project file or a registered plugin component.', source: where })
          return node
        }
      }
    }
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

function styled(node: MdastNode, style: TextStyle | undefined): MdastNode {
  if (!style) return node
  const properties: Record<string, string> = {}
  const css = [style.alignment ? `text-align:${style.alignment}` : '', style.color ? `color:${documentColorValue(style.color, 'text')}` : '', style.background ? `background-color:${documentColorValue(style.background, 'background')}` : ''].filter(Boolean).join(';')
  if (css) properties.style = css
  return { ...node, data: { hProperties: properties } }
}

/** A reference's text: its label, the current title of a target in this document, or the last known title. */
function referenceText(node: ReferenceNode, doc: PresmiumDocument): string {
  if (node.label) return node.label
  if (node.target.document !== doc.id) return node.fallback
  const section = node.target.section ?? (node.target.block ? Object.values(doc.sections).find(section => sectionOwns(doc, section.children, node.target.block!))?.id : undefined)
  if (node.target.block === undefined && section !== undefined && Object.hasOwn(doc.sections, section)) return doc.sections[section]!.title
  if (node.target.block === undefined && section === undefined) return doc.metadata.title
  return node.fallback
}

function sectionOwns(doc: PresmiumDocument, children: string[], id: string): boolean {
  return children.some((child) => {
    if (child === id) return true
    const block = doc.blocks[child]
    return block !== undefined && (block.type === 'container' || block.type === 'component') && sectionOwns(doc, block.children ?? [], id)
  })
}

/** Cross-document references are plain text until the site links documents; a page of this document is linked as before. */
function referenceNode(node: ReferenceNode, doc: PresmiumDocument): MdastNode {
  const text: MdastNode = { type: 'text', value: referenceText(node, doc) }
  if (node.target.document !== doc.id) return text
  const section = node.target.section ?? (node.target.block ? Object.values(doc.sections).find(section => sectionOwns(doc, section.children, node.target.block!))?.id : undefined)
  return section !== undefined && Object.hasOwn(doc.sections, section) ? { type: 'link', url: `#${section}`, children: [text] } : text
}

export function inlineNodes(nodes: InlineNode[], doc: PresmiumDocument): MdastNode[] {
  const inlineText = (nodes: InlineNode[]) => inlineNodes(nodes, doc)
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
    if (node.type === 'reference') return referenceNode(node, doc)
    return extensionNode(node.kind, node.schemaVersion, node.data, [{ type: 'text', value: node.fallback }])
  })
}

export function richNode(node: RichTextNode, doc: PresmiumDocument): MdastNode {
  const inlineText = (nodes: InlineNode[]) => inlineNodes(nodes, doc)
  const richText = (node: RichTextNode) => richNode(node, doc)
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
