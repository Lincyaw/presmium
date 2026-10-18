import { blockText } from '@presmium/kernel'
import type { IRSection } from '@presmium/kernel'
import { language } from './prompt.ts'

export interface AskSettings {
  url: string
  key: string
  model: string
}

export const ASK_STORAGE_KEY = 'presmium.assistant.ask'

export function askSettingsOf(value: unknown): AskSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { url, key, model } = value as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const settings = { url: text(url), key: text(key), model: text(model) }
  return settings.url && settings.key && settings.model && askUrlValid(settings.url) ? settings as AskSettings : undefined
}

export function askUrlValid(url: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

export function completionsUrl(url: string): string {
  const base = url.trim().replace(/\/+$/, '')
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
}

export function askProvider(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
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
    `Answer in ${language(place.lang)}, briefly.`,
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

export function chunkText(line: string): string | null | undefined {
  if (!line.startsWith('data:')) return undefined
  const data = line.slice(5).trim()
  if (data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data) as { choices?: { delta?: { content?: unknown } }[], error?: { message?: unknown } }
    if (parsed.error) throw new Error(typeof parsed.error.message === 'string' ? parsed.error.message : JSON.stringify(parsed.error))
    const content = parsed.choices?.[0]?.delta?.content
    return typeof content === 'string' && content ? content : undefined
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

export function completionText(body: unknown): string | undefined {
  const content = (body as { choices?: { message?: { content?: unknown } }[] } | undefined)?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : undefined
}

export function serviceError(status: number, text: string): string {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message
    if (typeof message === 'string' && message) return `${status}: ${message}`
  } catch {
  }
  return `${status}${text.trim() ? `: ${text.trim().slice(0, 300)}` : ''}`
}
