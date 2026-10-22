import { deckLocale, isRecord } from '@lincyaw/kernel'
import type { ComponentNode, IRBlock, IRDocument, IRPass, IRSection, PassContext } from '@lincyaw/kernel'
import { CLASSROOM_ID, isAuthorLabel, isForStudents, MESSAGES } from '../domain/index.ts'
import type { ClassroomMessages, Place } from '../domain/index.ts'
import { isClassroomComponent, isPredict } from './components.ts'
import { fallbackOf } from './fallbacks.ts'

/** The blocks of a section, with what a {predict} reveals in front of it. */
function sectionBlocks(section: IRSection): IRBlock[] {
  return section.blocks.flatMap((block) => {
    const { node } = block
    return isPredict(node) ? [...(node.children ?? []).filter(child => child.id !== 'prompt'), block] : [block]
  })
}

/** Writes the number of every section students have into the plugin's configuration (`presmium.classroom.sections`). */
function writeSectionNumbers(doc: IRDocument): void {
  const own = doc.config.presmium[CLASSROOM_ID]
  doc.config.presmium[CLASSROOM_ID] = {
    ...isRecord(own) ? own : {},
    sections: Object.fromEntries(doc.sections.filter(isForStudents).map(section => [section.id, section.index])),
  }
}

function isLabelled(lines: readonly string[], from: number, at: number, id: string): boolean {
  let end = at
  while (end < lines.length && lines[end]!.trim().startsWith(':')) end++
  return lines.slice(from - 1, end).some(line => line.trim() === `(${id})=` || line.trim() === `:label: ${id}`)
}

/** Warns of a label the author wrote that looks like a generated block id. */
async function checkLabel(block: IRBlock, section: IRSection, linesOf: (file: string) => Promise<string[]>, ctx: PassContext): Promise<void> {
  const { source } = block
  if (isAuthorLabel(block.id)) return
  const from = source.file === section.source.file ? section.source.line : 1
  if (!isLabelled(await linesOf(source.file), from, source.line, block.id)) return
  ctx.report({
    checkId: CLASSROOM_ID,
    severity: 'warning',
    message: `label (${block.id})= ends in -<number> like a generated block id: it takes no notes and the presenter's lists do not name it; choose another label`,
    source: { file: source.file, line: source.line },
  })
}

/** Gives a classroom component its place, its default props and its fallback, and checks its target. */
function placeComponent(node: ComponentNode, block: IRBlock, section: IRSection, blocks: readonly IRBlock[], t: ClassroomMessages, ctx: PassContext): void {
  node.props.place = { section: section.id, block: block.id, title: section.title, index: section.index } satisfies Place
  if (node.name === 'PmPulse') {
    node.props.question ??= t.pulse.question
    node.props.levels ??= t.pulse.levels
  }
  node.fallback = fallbackOf(node, t)
  const { target } = node.props
  if (typeof target === 'string' && !blocks.some(b => b.id === target)) {
    ctx.report({
      checkId: CLASSROOM_ID,
      severity: 'warning',
      message: `{question-box}: no block (${target})= in section ${section.id}; questions are attached to the section`,
      source: { file: block.source.file, line: block.source.line },
    })
    delete node.props.target
  }
}

export const classroomPass: IRPass = {
  name: 'presmium.classroom.places',
  async run(doc, ctx) {
    const t = MESSAGES[deckLocale(ctx.lang)]
    writeSectionNumbers(doc)
    const sources = new Map<string, Promise<string[]>>()
    const linesOf = (file: string) => {
      let lines = sources.get(file)
      if (!lines) sources.set(file, lines = ctx.src.read(file).then(text => text?.split('\n') ?? []))
      return lines
    }
    for (const section of doc.sections) {
      const blocks = sectionBlocks(section)
      for (const block of blocks) {
        await checkLabel(block, section, linesOf, ctx)
        if (isClassroomComponent(block.node)) placeComponent(block.node, block, section, blocks, t, ctx)
      }
    }
  },
}
