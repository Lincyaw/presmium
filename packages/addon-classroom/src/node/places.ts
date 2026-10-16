import { deckLocale, docBlocks } from '@presmium/kernel'
import type { IRBlock, IRPass, IRSection } from '@presmium/kernel'
import { CLASSROOM_ID, isLabel, MESSAGES } from '../domain/index.ts'
import type { Place } from '../domain/index.ts'
import { fallbackOf } from './fallbacks.ts'

/**
 * The blocks of a section, with what its predicts reveal (`./reveals.ts`)
 * before each predict, whose static form shows them.
 */
function sectionBlocks(section: IRSection): IRBlock[] {
  return section.blocks.flatMap((block) => {
    const { node } = block
    const predict = node.type === 'component' && node.plugin === CLASSROOM_ID && node.name === 'PmPredict'
    return predict ? [...(node.children ?? []).filter(child => child.id !== 'prompt'), block] : [block]
  })
}

/**
 * Whether the author wrote the label `id` (`(id)=`, or `:label: id` among a
 * directive's options) between the 1-based lines `from` and `at`, the
 * block's line, or among the options after it.
 */
function labelled(lines: readonly string[], from: number, at: number, id: string): boolean {
  let end = at
  while (end < lines.length && lines[end]!.trim().startsWith(':')) end++
  return lines.slice(from - 1, end).some(line => line.trim() === `(${id})=` || line.trim() === `:label: ${id}`)
}

/**
 * Gives every classroom component, also one a predict reveals, its place
 * (section and block ids, section title and number) as the prop `place`:
 * block ids exist only after the compiler has scheduled the steps. It also
 * writes each component's static form (`fallback`) and a pulse's default
 * question and levels in the deck's language (`lang` in the headmatter). A
 * question box's `:target:` must name a block of its section. A label in
 * the form of a generated id (`step-2`)
 * counts as generated, so it takes no notes and is not named in the
 * presenter's lists; the pass warns about such labels.
 */
export const placesPass: IRPass = {
  name: 'classroom-places',
  async run(doc, ctx) {
    const t = MESSAGES[deckLocale(ctx.lang)]
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
        // Ids are unique in a section, so a label written in the section names this block.
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

/**
 * A predict's static form again once compile-time execution has run
 * (`after: 'execute'`), so code it reveals shows with its recorded output and
 * a run panel it reveals with its static form, which the execution plugin's
 * `presmium.exec.fallbacks` writes first (`order`). Without execution (an IR
 * with errors) the form `classroom-places` wrote stays.
 */
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
