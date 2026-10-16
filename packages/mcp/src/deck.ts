/**
 * What the read tools return, read from a compiled document (docs/ir.md):
 * its sections and steps, the narration and the content on screen at a
 * step, code references, recorded outputs, diagnostics and source places.
 * Paths are relative to the deck directory, where an agent edits the source.
 */
import { dirname, relative } from 'node:path'
import { blockState, blockText, blockVisible, chapters, irBlocks, narrationAt, tokenize } from '@presmium/kernel'
import type { CodeNode, Finding, IRBlock, IRDocument, IRSection, RecordedRun, RunOutput, RunResult, SourcePos } from '@presmium/kernel'
import MiniSearch from 'minisearch'

export interface Place {
  file: string
  line: number
  endLine?: number
}

/** A source position relative to the deck directory. */
export function place(doc: IRDocument, pos: SourcePos): Place {
  return { file: relative(dirname(doc.meta.entry), pos.file) || pos.file, line: pos.line, ...pos.endLine ? { endLine: pos.endLine } : {} }
}

/** A section by its id, or by its 1-based number. */
export function findSection(doc: IRDocument, ref: string | number): IRSection {
  const section = doc.sections.find(s => s.id === String(ref)) ?? doc.sections.find(s => String(s.index) === String(ref))
  if (!section) throw new Error(`no section ${JSON.stringify(ref)}; list_sections names them`)
  return section
}

/** A block of a section by its id, components' children included. */
export function findBlock(section: IRSection, id: string): IRBlock {
  const block = [...irBlocks(section.blocks)].find(b => b.id === id)
  if (!block) throw new Error(`no block ${JSON.stringify(id)} in section ${section.id}; get_section lists them`)
  return block
}

export function sectionSummary(doc: IRDocument, section: IRSection) {
  return {
    id: section.id,
    index: section.index,
    title: section.title,
    depth: section.depth,
    steps: section.steps,
    source: place(doc, section.source),
    ...section.audience ? { audience: section.audience } : {},
  }
}

export function deckInfo(doc: IRDocument, document: string) {
  const count = (severity: Finding['severity']) => doc.diagnostics.filter(f => f.severity === severity).length
  return {
    document,
    title: doc.meta.title,
    lang: doc.meta.lang,
    entry: place(doc, { file: doc.meta.entry, line: 1 }).file,
    sections: doc.sections.length,
    steps: doc.sections.reduce((sum, s) => sum + s.steps + 1, 0),
    plugins: doc.config.plugins,
    renderers: Object.keys(doc.config.renderers),
    diagnostics: { errors: count('error'), warnings: count('warning'), infos: count('info') },
  }
}

/** A code block's reference to the workspace's code, when it has one. */
function origin(node: CodeNode) {
  if (!node.origin) return undefined
  const { anchor, file, startLine, endLine, status, drift, pin, permalink } = node.origin
  return { anchor, file, startLine, endLine, status, ...drift ? { drift } : {}, ...pin ? { pin } : {}, ...permalink ? { permalink } : {} }
}

/** A block as the tools show it; `step` gives the state of a block that spans steps. */
export function blockInfo(doc: IRDocument, block: IRBlock, step?: number) {
  const { node } = block
  const state = step === undefined ? undefined : blockState(block, step)
  const base = {
    id: block.id,
    role: block.role,
    kind: node.type === 'component' ? node.name : node.type,
    at: block.at,
    ...block.until !== undefined ? { until: block.until } : {},
    ...block.span ? { span: block.span } : {},
    ...block.only ? { only: block.only } : {},
    ...block.audience ? { audience: block.audience } : {},
    source: place(doc, block.source),
  }
  if (node.type !== 'code') return { ...base, text: blockText(block) }
  const variant = state !== undefined ? node.variants?.[state] : undefined
  return {
    ...base,
    lang: node.lang,
    ...node.title ? { title: node.title } : {},
    code: variant?.value ?? node.value,
    ...variant ? { variant: variant.label } : {},
    ...state !== undefined && node.highlight?.[state] ? { highlight: node.highlight[state] } : {},
    ...node.origin ? { origin: origin(node) } : {},
    ...node.run ? { run: node.run.when } : {},
    ...node.outputs?.length ? { recorded: true } : {},
  }
}

function narration(section: IRSection) {
  return section.blocks.filter(b => b.role === 'narration').map(b => ({ step: b.at, block: b.id, text: blockText(b) }))
}

/** A section: its narration by step and every block. */
export function sectionDetail(doc: IRDocument, section: IRSection) {
  return {
    ...sectionSummary(doc, section),
    narration: narration(section),
    blocks: section.blocks.filter(b => b.role === 'visual').map(b => blockInfo(doc, b)),
  }
}

/** A step of a section: what is on screen and the narration that belongs to it. */
export function stepDetail(doc: IRDocument, section: IRSection, step: number) {
  if (!Number.isInteger(step) || step < 0 || step > section.steps) throw new Error(`section ${section.id} has steps 0 to ${section.steps}`)
  return {
    section: section.id,
    title: section.title,
    step,
    steps: section.steps,
    screen: section.blocks.filter(b => b.role === 'visual' && blockVisible(b, step)).map(b => blockInfo(doc, b, step)),
    narration: narrationAt(section, step).map(b => blockText(b)),
  }
}

/** A code block with its reference to the workspace's code. */
export function codeRef(doc: IRDocument, section: IRSection, id: string) {
  const block = findBlock(section, id)
  if (block.node.type !== 'code') throw new Error(`block ${id} of section ${section.id} is not code`)
  const { node } = block
  return {
    section: section.id,
    block: id,
    lang: node.lang,
    ...node.title ? { title: node.title } : {},
    code: node.value,
    source: place(doc, block.source),
    origin: origin(node) ?? null,
    ...node.variants ? { variants: node.variants.map(v => ({ label: v.label, ...v.startLine ? { startLine: v.startLine, endLine: v.endLine } : {} })) } : {},
    ...node.highlight ? { highlight: node.highlight } : {},
  }
}

const TEXT = /^(text\/|application\/(json|javascript)$)/

/** A rich output with its text kept and binary data named only. */
function outputData(output: RunOutput) {
  if (output.output_type !== 'display_data' && output.output_type !== 'execute_result') return output
  const data = Object.fromEntries(Object.entries(output.data).map(([mime, value]) =>
    [mime, TEXT.test(mime) ? (typeof value === 'string' ? value : Array.isArray(value) ? value.join('') : JSON.stringify(value)) : `(${mime} data)`]))
  return { output_type: output.output_type, data }
}

/** A run as the tools show it: the streams, the exit and the rich outputs. */
export function runInfo(run: RunResult | RecordedRun) {
  return {
    ok: run.ok,
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    executor: run.executorId,
    stdout: run.stdout,
    stderr: run.stderr,
    ...run.outputs?.length ? { outputs: run.outputs.map(outputData) } : {},
  }
}

/** The recorded outputs of a section's code blocks, or of one. */
export function outputsOf(section: IRSection, id?: string) {
  const blocks = id ? [findBlock(section, id)] : [...irBlocks(section.blocks)]
  return {
    section: section.id,
    outputs: blocks.flatMap(block => block.node.type === 'code' && (id || block.node.outputs?.length)
      ? [{ block: block.id, lang: block.node.lang, runs: (block.node.outputs ?? []).map(runInfo) }]
      : []),
  }
}

/** Findings with their places relative to the deck. */
export function diagnosticsOf(doc: IRDocument, findings: Finding[]) {
  return findings.map(f => ({
    severity: f.severity,
    check: f.checkId,
    message: f.message,
    ...f.source ? place(doc, { file: f.source.file, line: f.source.line ?? 1 }) : {},
    ...f.hint ? { hint: f.hint } : {},
  }))
}

/**
 * Where a section, a step, a block or an anchor is in the source: the
 * section's heading, the blocks of a step, a block, or the code blocks that
 * reference an anchor with the lines of the referenced code.
 */
export function locate(doc: IRDocument, target: { section?: string, step?: number, block?: string, anchor?: string }) {
  if (target.anchor) {
    const found = doc.sections.flatMap(section => [...irBlocks(section.blocks)]
      .filter(b => b.node.type === 'code' && b.node.origin?.anchor === target.anchor)
      .map(b => ({ section: section.id, block: b.id, source: place(doc, b.source), code: origin(b.node as CodeNode) })))
    if (found.length === 0) throw new Error(`no code block references ${target.anchor}`)
    return { anchor: target.anchor, references: found }
  }
  if (!target.section) throw new Error('name a section, or an anchor')
  const section = findSection(doc, target.section)
  if (target.block) return { section: section.id, block: target.block, source: place(doc, findBlock(section, target.block).source) }
  if (target.step !== undefined) {
    const blocks = section.blocks.filter(b => b.at === target.step)
    return { section: section.id, step: target.step, blocks: blocks.map(b => ({ block: b.id, role: b.role, source: place(doc, b.source) })) }
  }
  return { section: section.id, source: place(doc, section.source) }
}

const indexes = new WeakMap<IRDocument, MiniSearch>()

/**
 * The web form's local search index: a document per section with its title,
 * its chapter's title above it and the text of its blocks, MiniSearch with the
 * deck's tokenizer and VitePress's search options (P-71).
 */
function searchIndex(doc: IRDocument): MiniSearch {
  let index = indexes.get(doc)
  if (index) return index
  index = new MiniSearch({ fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'], tokenize })
  index.addAll(chapters(doc).flatMap(chapter => chapter.sections.map((section, i) => ({
    id: section.id,
    title: section.title,
    titles: i === 0 ? [] : [chapter.title],
    text: section.blocks.map(blockText).filter(Boolean).join('\n'),
  }))))
  indexes.set(doc, index)
  return index
}

export function search(doc: IRDocument, query: string, limit = 10) {
  const results = searchIndex(doc).search(query, { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 } })
  return {
    query,
    results: results.slice(0, limit).map(r => ({ section: r.id as string, title: r.title as string, titles: r.titles as string[], score: Math.round(r.score * 100) / 100 })),
  }
}
