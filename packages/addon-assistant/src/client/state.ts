/**
 * The question panel's state in this window, shared by its places (the
 * toolbar's popover, the presenter panels): the `AGENT` client, the text
 * the reader selected in the deck (with its section and block), the
 * questions asked here and their answers, and how a citation moves the page
 * (the IR runtime's viewer in the web form, ./viewer.ts).
 */
import type { AgentClient, AgentContext, Citation, IRBlock, SourcePos } from '@presmium/kernel'
import { errorMessage } from '@presmium/kernel'
import { ref, shallowRef } from 'vue'

export const agent = shallowRef<AgentClient>()

/** How the page shows a place of the deck; set where the IR runtime runs. */
export interface Navigator {
  /** The current section and step. */
  position(): { section: string, step: number } | undefined
  /** The section's title. */
  title(section: string): string | undefined
  show(citation: Citation): void
  /** A block of the page's document (nested ones too), by its section and id. */
  block(section: string, block: string): IRBlock | undefined
  /** Where a section is in the source (its file relative to the deck). */
  source(section: string): SourcePos | undefined
}

let navigator: (() => Navigator | undefined) | undefined

export function setNavigator(get: () => Navigator | undefined): void {
  navigator = get
}

/** The navigator, inside a component setup; undefined in the slides form. */
export function useNavigator(): Navigator | undefined {
  try {
    return navigator?.()
  } catch {
    return undefined
  }
}

/** What the reader selected in the deck. */
export interface Selected {
  text: string
  section?: string
  block?: string
}

export const selected = shallowRef<Selected>()

/** Keeps the last text the reader selected in the deck's sections (not in the panel), until it is used or dropped. */
export function trackSelection(): () => void {
  const update = () => {
    const selection = document.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
    const text = selection.toString().trim()
    const node = selection.getRangeAt(0).commonAncestorContainer
    const element = node instanceof Element ? node : node.parentElement
    const section = element?.closest<HTMLElement>('[data-section]')
    if (!text || !section || element?.closest('.pm-assistant')) return
    const block = element?.closest<HTMLElement>('[data-block]')
    selected.value = { text: text.slice(0, 4000), section: section.dataset.section, ...block?.dataset.block ? { block: block.dataset.block } : {} }
  }
  document.addEventListener('selectionchange', update)
  return () => document.removeEventListener('selectionchange', update)
}

/** A question asked in this window and what came back. */
export interface Exchange {
  id: string
  question: string
  answers: string[]
  /** The tool the agent is using. */
  tool?: string
  state: 'running' | 'done' | 'failed'
  error?: string
  /** The reader cancelled it. */
  cancelled?: boolean
  cancel(): void
}

export const exchanges = ref<Exchange[]>([])

/** Asks a question; its answers arrive in `exchanges`. */
export function ask(client: AgentClient, question: string, context: AgentContext): void {
  const task = client.submit({ kind: 'question', prompt: question, context })
  exchanges.value.unshift({ id: task.id, question, answers: [], state: 'running', cancel: () => {
    exchange.cancelled = true
    task.cancel()
  } })
  const exchange = exchanges.value[0]!
  void (async () => {
    try {
      for await (const event of task.events) {
        if (event.type === 'message') exchange.answers.push(event.text)
        else if (event.type === 'progress') exchange.tool = event.status === 'running' ? event.tool ?? event.text : undefined
        else if (event.type === 'error') {
          exchange.state = 'failed'
          exchange.error = event.message
        } else if (event.type === 'done') exchange.state = 'done'
      }
    } catch (error) {
      exchange.state = 'failed'
      exchange.error = errorMessage(error)
    }
    if (exchange.state === 'running') exchange.state = 'done'
  })()
}
