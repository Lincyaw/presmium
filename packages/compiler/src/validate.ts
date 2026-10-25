import { IR_VERSION, isRecord } from '@lincyaw/kernel'
import type { Finding, IRBlock, IRDocument, IRSection, MdastNode, SourcePos } from '@lincyaw/kernel'

export function validateIR(doc: IRDocument, entry?: string): Finding[] {
  const findings: Finding[] = []
  const file = entry ?? (isRecord(doc.meta) && typeof doc.meta.entry === 'string' ? doc.meta.entry : 'ir.json')
  const fail = (message: string, source: SourcePos = { file, line: 1 }) =>
    findings.push({ checkId: 'presmium.ir', severity: 'error', message, source: { file: source.file, line: source.line } })

  if (doc.ir !== IR_VERSION) fail(`ir must be ${IR_VERSION}`)
  if (!isRecord(doc.meta) || typeof doc.meta.title !== 'string' || typeof doc.meta.entry !== 'string') fail('meta needs a title and an entry')
  const config = doc.config as unknown
  if (!isRecord(config) || !Array.isArray(config.plugins) || !isRecord(config.presmium) || !isRecord(config.renderers)) {
    fail('config needs plugins, presmium and renderers')
  }
  if (!Array.isArray(doc.sections)) {
    fail('sections must be a list')
    return findings
  }

  const ids = new Set<string>()
  doc.sections.forEach((section, i) => {
    if (!isRecord(section)) return fail(`section ${i + 1} is not an object`)
    const where = isSource(section.source) ? section.source : undefined
    if (!where) fail(`section ${i + 1} has no source position`)
    if (typeof section.id !== 'string' || section.id === '') fail(`section ${i + 1} has no id`, where)
    else if (ids.has(section.id)) fail(`section id ${section.id} is not unique`, where)
    ids.add(section.id)
    if (section.index !== i + 1) fail(`section ${section.id} has index ${section.index}, expected ${i + 1}`, where)
    if (typeof section.title !== 'string') fail(`section ${section.id} has no title`, where)
    if (!isCount(section.steps)) fail(`section ${section.id}: steps must be a non-negative integer`, where)
    if (!isRecord(section.hints) || !Object.values(section.hints).every(isRecord)) fail(`section ${section.id}: hints must map renderer ids to objects`, where)
    if (section.config !== undefined && !(isRecord(section.config) && Object.values(section.config).every(isRecord))) fail(`section ${section.id}: config must map plugin ids to objects`, where)
    if (!Array.isArray(section.blocks)) fail(`section ${section.id}: blocks must be a list`, where)
    else validateBlocks(section.blocks, section, fail)
  })
  return findings
}

function validateBlocks(blocks: IRBlock[], section: IRSection, fail: (message: string, source?: SourcePos) => void): void {
  const ids = new Set<string>()
  for (const block of blocks) {
    if (!isRecord(block)) {
      fail(`a block of section ${section.id} is not an object`, section.source)
      continue
    }
    const where = isSource(block.source) ? block.source : section.source
    const name = `block ${block.id} of section ${section.id}`
    if (!isSource(block.source)) fail(`${name} has no source position`, where)
    if (typeof block.id !== 'string' || block.id === '') fail(`a block of section ${section.id} has no id`, where)
    else if (ids.has(block.id)) fail(`${name}: id is not unique in the section`, where)
    ids.add(block.id)
    if (block.role !== 'visual' && block.role !== 'narration') fail(`${name}: role must be visual or narration`, where)
    if (!isCount(block.at)) fail(`${name}: at must be a non-negative integer`, where)
    if (block.span !== undefined && !isCount(block.span)) fail(`${name}: span must be a non-negative integer`, where)
    if (isCount(block.at) && block.at + (block.span ?? 0) > section.steps) fail(`${name} ends at step ${block.at + (block.span ?? 0)}, after the last step ${section.steps}`, where)
    if (block.until !== undefined && !(isCount(block.until) && block.until > block.at)) fail(`${name}: until must be an integer after at`, where)
    if (block.only !== undefined && !(Array.isArray(block.only) && block.only.every(id => typeof id === 'string'))) fail(`${name}: only must list renderer ids`, where)
    const problem = nodeProblem(block)
    if (problem) fail(`${name}: ${problem}`, where)
    if (block.node?.type === 'component' && block.node.children) validateBlocks(block.node.children, section, fail)
  }
}

function nodeProblem({ node }: IRBlock): string | undefined {
  if (!isRecord(node)) return 'node is missing'
  switch (node.type) {
    case 'markdown':
      if (node.narration !== undefined && (!isRecord(node.narration) || !['during', 'after'].includes(String(node.narration.mode)))) return 'narration mode must be during or after'
      return isRecord(node.mdast) ? mdastProblem(node.mdast, 'mdast') : 'markdown node needs an mdast tree'
    case 'code':
      if (typeof node.lang !== 'string' || typeof node.value !== 'string') return 'code node needs lang and value'
      if (node.highlight && !node.highlight.every(lines => Array.isArray(lines) && lines.every(n => Number.isInteger(n) && n >= 1))) return 'highlight must list 1-based line numbers per step'
      if (node.run && !(typeof node.run.lang === 'string' && ['compile', 'live', 'both'].includes(node.run.when))) return 'run needs lang and when (compile, live or both)'
      if (node.outputs && !node.outputs.every(o => isRecord(o) && typeof o.stdout === 'string' && typeof o.cacheKey === 'string')) return 'outputs must be recorded runs'
      if (node.variants && !node.variants.every(v => isRecord(v) && typeof v.label === 'string' && typeof v.value === 'string')) return 'variants need label and value'
      return undefined
    case 'component':
      if (typeof node.plugin !== 'string' || typeof node.name !== 'string' || node.name === '') return 'component node needs plugin and name'
      if (!isRecord(node.props)) return 'component props must be an object'
      if (node.assets !== undefined && !(isRecord(node.assets) && Object.values(node.assets).every(url => typeof url === 'string'))) return 'component assets must map props to URLs'
      if (node.durations !== undefined && !(Array.isArray(node.durations) && node.durations.every(ms => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0))) return 'component durations must list non-negative milliseconds'
      if (node.fallback !== undefined) return isRecord(node.fallback) ? mdastProblem(node.fallback, 'fallback') : 'component fallback must be mdast'
      return undefined
    default:
      return `unknown node type ${String((node as { type?: unknown }).type)}`
  }
}

function mdastProblem(node: MdastNode, path: string): string | undefined {
  if (typeof node.type !== 'string') return `${path} has a node without a type`
  if (node.children === undefined) return undefined
  if (!Array.isArray(node.children)) return `${path}: the children of a ${node.type} node must be a list`
  for (const [i, child] of node.children.entries()) {
    const problem = isRecord(child) ? mdastProblem(child, `${path} > ${node.type}[${i}]`) : `${path} > ${node.type}[${i}] is not a node`
    if (problem) return problem
  }
  return undefined
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isSource(value: unknown): value is SourcePos {
  return isRecord(value) && typeof value.file === 'string' && Number.isInteger(value.line) && (value.line as number) >= 1
}
