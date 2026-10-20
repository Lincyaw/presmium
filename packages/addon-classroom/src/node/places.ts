import { deckLocale, docBlocks, isRecord } from '@lincyaw/kernel'
import type { IRBlock, IRPass, IRSection } from '@lincyaw/kernel'
import { CLASSROOM_ID, isLabel, MESSAGES, readersHave } from '../domain/index.ts'
import type { Place } from '../domain/index.ts'
import { fallbackOf } from './fallbacks.ts'

function sectionBlocks(section: IRSection): IRBlock[] {
  return section.blocks.flatMap((block) => {
    const { node } = block
    const predict = node.type === 'component' && node.plugin === CLASSROOM_ID && node.name === 'PmPredict'
    return predict ? [...(node.children ?? []).filter(child => child.id !== 'prompt'), block] : [block]
  })
}

function labelled(lines: readonly string[], from: number, at: number, id: string): boolean {
  let end = at
  while (end < lines.length && lines[end]!.trim().startsWith(':')) end++
  return lines.slice(from - 1, end).some(line => line.trim() === `(${id})=` || line.trim() === `:label: ${id}`)
}

export const placesPass: IRPass = {
  name: 'classroom-places',
  async run(doc, ctx) {
    const t = MESSAGES[deckLocale(ctx.lang)]
    const own = doc.config.presmium[CLASSROOM_ID]
    doc.config.presmium[CLASSROOM_ID] = {
      ...isRecord(own) ? own : {},
      sections: Object.fromEntries(doc.sections.filter(readersHave).map(section => [section.id, section.index])),
    }
    const sources = new Map<string, Promise<string[]>>()
    const linesOf = (file: string) => {
      let lines = sources.get(file)
      if (!lines) sources.set(file, lines = ctx.src.read(file).then(text => text?.split('\n') ?? []))
      return lines
    }
    for (const section of doc.sections) {
      const blocks = sectionBlocks(section)
      for (const block of blocks) {
        const { node, source } = block
        const from = source.file === section.source.file ? section.source.line : 1
        if (!isLabel(block.id) && labelled(await linesOf(source.file), from, source.line, block.id)) {
          ctx.report({
            checkId: 'presmium.classroom',
            severity: 'warning',
            message: `label (${block.id})= ends in -<number> like a generated block id: it takes no notes and the presenter's lists do not name it; choose another label`,
            source: { file: source.file, line: source.line },
          })
        }
        if (node.type !== 'component' || node.plugin !== CLASSROOM_ID) continue
        node.props.place = { section: section.id, block: block.id, title: section.title, index: section.index } satisfies Place
        if (node.name === 'PmPulse') {
          node.props.question ??= t.pulse.question
          node.props.levels ??= t.pulse.levels
        }
        node.fallback = fallbackOf(node, t)
        const { target } = node.props
        if (typeof target === 'string' && !blocks.some(b => b.id === target)) {
          ctx.report({
            checkId: 'presmium.classroom',
            severity: 'warning',
            message: `{question-box}: no block (${target})= in section ${section.id}; questions are attached to the section`,
            source: { file: source.file, line: source.line },
          })
          delete node.props.target
        }
      }
    }
  },
}

export const predictFallbacksPass: IRPass = {
  name: 'classroom-predict-fallbacks',
  after: 'execute',
  order: 1,
  run(doc, ctx) {
    const t = MESSAGES[deckLocale(ctx.lang)]
    for (const { block: { node } } of docBlocks(doc)) {
      if (node.type === 'component' && node.plugin === CLASSROOM_ID && node.name === 'PmPredict') node.fallback = fallbackOf(node, t)
    }
  },
}
