import type { IRPass } from '@presmium/kernel'
import { CLASSROOM_ID, isLabel } from '../domain/index.ts'
import type { Place } from '../domain/index.ts'

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
 * Gives every classroom component its place (section and block ids, section
 * title and number) as the prop `place`: block ids exist only after the
 * compiler has scheduled the steps. A question box's `:target:` must name a
 * block of its section. A label in the form of a generated id (`step-2`)
 * counts as generated, so it takes no notes and is not named in the
 * presenter's lists; the pass warns about such labels.
 */
export const placesPass: IRPass = {
  name: 'classroom-places',
  async run(doc, ctx) {
    const sources = new Map<string, Promise<string[]>>()
    const linesOf = (file: string) => {
      let lines = sources.get(file)
      if (!lines) sources.set(file, lines = ctx.src.read(file).then(text => text?.split('\n') ?? []))
      return lines
    }
    for (const section of doc.sections) {
      for (const block of section.blocks) {
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
        const { target } = node.props
        if (typeof target === 'string' && !section.blocks.some(b => b.id === target)) {
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
