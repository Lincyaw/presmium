/**
 * Readers' questions (P-112, decision E-9), answered by the model service a
 * reader filled in for himself: an OpenAI-compatible Chat Completions
 * service, asked from the browser with what the page shows. Here: the
 * settings as the browser keeps them, the service's endpoint and provider
 * name, the messages of a question (how to answer and cite, the place's
 * content, the table of contents), and the pieces of a streamed answer.
 */
import { blockText } from '@presmium/kernel'
import type { IRSection } from '@presmium/kernel'
import { language } from './prompt.ts'

/** The reader's model service, as this site's browser storage keeps it. */
export interface AskSettings {
  /** The service's address: its base (`…/v1`) or its `…/chat/completions`. */
  url: string
  key: string
  model: string
}

/** The browser storage key of the settings (`localStorage` of the site). */
export const ASK_STORAGE_KEY = 'presmium.assistant.ask'

/** The settings from what the storage held; undefined unless complete. */
export function askSettingsOf(value: unknown): AskSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { url, key, model } = value as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const settings = { url: text(url), key: text(key), model: text(model) }
  return settings.url && settings.key && settings.model && askUrlValid(settings.url) ? settings as AskSettings : undefined
}

/** An address the page may send the question to: http(s). */
export function askUrlValid(url: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/** The Chat Completions endpoint of an address: as given when it names it, else under the base. */
export function completionsUrl(url: string): string {
  const base = url.trim().replace(/\/+$/, '')
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
}

/** The service's provider as the panels name it (N-08): the host of its address. */
export function askProvider(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** What the page gives with a question: the deck, its sections for citations, the place and the selection. */
export interface AskPlace {
  /** The deck's title and language. */
  title?: string
  lang?: string
  /** The table of contents: each section's id and title, which citations name. */
  sections: { id: string, title: string }[]
  /** The section the question is about, with the text the page shows of it. */
  section?: { id: string, title: string, step?: number, text: string }
  /** The text the reader selected. */
  selection?: string
}

/** At most this many characters of a section, of the selection, and sections in the table of contents. */
const SECTION_CHARS = 12_000
const SELECTION_CHARS = 4000
const TOC_SECTIONS = 400

/** The text of a section as the reader's view has it: its narration and the text of its blocks, in order. */
export function sectionText(section: IRSection): string {
  return section.blocks.map(blockText).filter(Boolean).join('\n\n').slice(0, SECTION_CHARS)
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

/** The messages of a question: how to answer and cite with what the page shows, then the question. */
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

/**
 * A line of a streamed answer (server-sent events): the piece of text its
 * `data:` carries (`choices[0].delta.content`), `null` at `[DONE]`,
 * undefined for anything else (comments, empty deltas, other events).
 */
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

/** A whole answer (a service that does not stream): `choices[0].message.content`. */
export function completionText(body: unknown): string | undefined {
  const content = (body as { choices?: { message?: { content?: unknown } }[] } | undefined)?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : undefined
}

/** A service's error answer as one line: its `error.message`, else the start of its text. */
export function serviceError(status: number, text: string): string {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message
    if (typeof message === 'string' && message) return `${status}: ${message}`
  } catch {
    // Not JSON.
  }
  return `${status}${text.trim() ? `: ${text.trim().slice(0, 300)}` : ''}`
}
