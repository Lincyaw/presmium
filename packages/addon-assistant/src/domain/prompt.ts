import { blockText } from '@lincyaw/kernel'
import type { IRSection } from '@lincyaw/kernel'

const LANGUAGES: Record<string, string> = { zh: 'Simplified Chinese (zh-CN)', en: 'English' }

export function promptLanguage(lang: string | undefined): string {
  const tag = lang?.trim() || 'zh-CN'
  return LANGUAGES[tag.toLowerCase().split('-')[0]!] ?? tag
}

export interface AskPlace {
  title?: string
  lang?: string
  sections: { id: string, title: string }[]
  section?: { id: string, title: string, step?: number, text: string }
  selection?: string
}

const SECTION_CHARS = 12_000
const SELECTION_CHARS = 4000
const TOC_SECTIONS = 400

export function sectionText(section: IRSection): string {
  return section.blocks.map(blockText).filter(Boolean).join('\n\n').slice(0, SECTION_CHARS)
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

export function askMessages(question: string, place: AskPlace): { role: 'system' | 'user', content: string }[] {
  const lines = [
    `A reader of a course document${place.title ? ` ("${place.title}")` : ''} asks a question. Answer from the content below, which is what the reader's page shows; say so when it does not tell.`,
    'When your answer relies on a section, link it as [its title](presmium://sections/<section id>), with an id of the table of contents; the reader can follow these links.',
    `Answer in ${promptLanguage(place.lang)}, briefly.`,
  ]
  if (place.sections.length) {
    lines.push('', 'Table of contents (section id: title):', ...place.sections.slice(0, TOC_SECTIONS).map(s => `- ${s.id}: ${s.title}`))
  }
  if (place.section) {
    const { id, title, step, text } = place.section
    lines.push('', `The section the reader is at: ${title} (id ${id}${step !== undefined ? `, step ${step}` : ''}). Its content:`, '"""', cut(text, SECTION_CHARS), '"""')
  }
  if (place.selection) lines.push('', 'The reader selected this on the page:', '"""', cut(place.selection, SELECTION_CHARS), '"""')
  return [{ role: 'system', content: lines.join('\n') }, { role: 'user', content: question }]
}
