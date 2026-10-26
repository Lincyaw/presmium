import { irBlocks } from './blocks.ts'
import type { IRBlock, IRDocument, IRSection, MdastNode } from './ir.ts'
import { propText } from './props.ts'

export interface Chapter {
  title: string
  sections: IRSection[]
}

function sectionDepth(doc: IRDocument): number {
  return doc.sections.reduce((depth, section) => Math.max(depth, section.depth), 0)
}

function titles(depth: number, section: IRSection): boolean {
  return section.depth === 0 || section.depth < depth
}

export function isChapterTitle(doc: IRDocument, section: IRSection): boolean {
  return titles(sectionDepth(doc), section)
}

export function chapters(doc: IRDocument): Chapter[] {
  const depth = sectionDepth(doc)
  const result: Chapter[] = []
  let previous: IRSection | undefined
  for (const section of doc.sections) {
    const current = result.at(-1)
    if (!current || section.source.file !== previous?.source.file || titles(depth, section)) {
      result.push({ title: section.title, sections: [section] })
    } else {
      current.sections.push(section)
    }
    previous = section
  }
  return result
}

export function blockVisible(block: IRBlock, step: number): boolean {
  const state = blockStepState(block, step)
  if (state) return state.visible
  return step >= block.at && (block.until === undefined || step < block.until)
}

export function blockState(block: IRBlock, step: number): number {
  const state = blockStepState(block, step)
  if (state) return state.localStep
  return Math.min(Math.max(step - block.at, 0), block.span ?? 0)
}

export function blockStepState(block: IRBlock, step: number): NonNullable<IRBlock['stepStates']>[number] | undefined {
  const states = block.stepStates
  if (!states?.length) return undefined
  const index = step === Number.POSITIVE_INFINITY ? states.length - 1 : Number.isFinite(step) ? Math.max(0, Math.min(Math.trunc(step), states.length - 1)) : 0
  return states[index]
}

export function narrationAt(section: IRSection, step: number): IRBlock[] {
  return section.blocks.filter(block => block.role === 'narration' && block.at === step)
}

export function sectionNarration(section: IRSection): IRBlock[] {
  return [...irBlocks(section.blocks)].filter(block => block.role === 'narration')
}

const BREAKS = new Set(['paragraph', 'heading', 'listItem', 'tableRow', 'tableCell', 'code', 'math', 'blockquote', 'break'])

function htmlText(html: string): string {
  return html.replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
}

export function mdastText(node: MdastNode): string {
  if (node.type === 'html' && typeof node.value === 'string') return htmlText(node.value)
  if (typeof node.value === 'string' && !node.children) return node.value
  const text = (node.children ?? []).map(mdastText).join('')
  return BREAKS.has(node.type) ? `${text}\n` : text
}

export function blockText(block: IRBlock): string {
  const { node } = block
  switch (node.type) {
    case 'markdown': return mdastText(node.mdast).trim()
    case 'code': return [node.title, node.value, ...(node.outputs ?? []).map(o => o.stdout)].filter(Boolean).join('\n')
    case 'component': return [...propText(node.props), ...(node.children ?? []).map(blockText)].join('\n')
  }
}

export function tokenize(text: string): string[] {
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  const words: string[] = []
  for (const piece of text.split(/[\n\r\p{Z}\p{P}]+/u)) {
    for (const part of segmenter.segment(piece)) {
      if (part.isWordLike) words.push(part.segment)
    }
  }
  return words
}
