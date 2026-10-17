/**
 * The assistant's state in this window, shared by its places (the toolbar's
 * popovers, the presenter panels, edit mode): the `AGENT` client of the
 * server's assistant, the `ASK` client of the reader's own model service,
 * the text the reader selected in the deck (with its section and block), the
 * questions asked here and their answers, and how the page shows a place
 * (the IR runtime's viewer in the web form, ./viewer.ts; the host's
 * navigation in the slides form).
 */
import type { Navigation } from '@presmium/host'
import type { AgentClient, AgentContext, AskClient, Citation, IRBlock, IRDocument, SourcePos } from '@presmium/kernel'
import { errorMessage } from '@presmium/kernel'
import { ref, shallowRef } from 'vue'
import type { AssistantClient } from './agent.ts'

export const agent = shallowRef<AgentClient>()
/** The same client with what the page's own panels use besides the contract (a change task under way, after a reload). */
export const assistant = shallowRef<AssistantClient>()
/** The reader's own model service (`ASK`). */
export const asker = shallowRef<AskClient>()
/** The host's navigation (both forms): where the window is, and moving it; the slides form has nothing else. */
export const navigation = shallowRef<Navigation>()

/** How the page shows a place of the deck; set where the IR runtime runs. */
export interface Navigator {
  /** The document the page shows (the student build's for a student site). */
  doc(): IRDocument
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
/** The navigator once a component of this window found it: the viewer is the app's, one a page. */
let found: Navigator | undefined

export function setNavigator(get: () => Navigator | undefined): void {
  navigator = get
  found = undefined
}

/** The navigator, inside a component setup (the first one remembers it); undefined in the slides form. */
export function useNavigator(): Navigator | undefined {
  try {
    return found ??= navigator?.()
  } catch {
    return undefined
  }
}

/** The navigator a component of this window found, outside a component setup (a classroom's AI answer). */
export function currentNavigator(): Navigator | undefined {
  return found
}

/** Moves the page to a citation: by the IR runtime, else by the host's navigation (the slides form: to its section's slide). */
export function showCitation(citation: Citation): void {
  const nav = found
  if (nav) return nav.show(citation)
  const go = navigation.value
  if (go) go.go({ slide: go.position.value.slide, step: citation.step ?? 0, section: citation.section })
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
    if (!text || element?.closest('.pm-assistant')) return
    // The web form marks its sections; the slides form's page is the current section.
    const section = element?.closest<HTMLElement>('[data-section]')?.dataset.section ?? (element?.closest('.slidev-page') ? navigation.value?.position.value.section : undefined)
    if (!section) return
    const block = element?.closest<HTMLElement>('[data-block]')
    selected.value = { text: text.slice(0, 4000), section, ...block?.dataset.block ? { block: block.dataset.block } : {} }
  }
  document.addEventListener('selectionchange', update)
  return () => document.removeEventListener('selectionchange', update)
}

/** A question asked in this window and what came back. */
export interface Exchange {
  id: number
  question: string
  /** The answer so far. */
  answer: string
  state: 'running' | 'done' | 'failed'
  error?: string
  /** The reader cancelled it. */
  cancelled?: boolean
  cancel(): void
}

export const exchanges = ref<Exchange[]>([])
let asked = 0

/** Asks a question; its answer streams into `exchanges`. */
export function ask(client: AskClient, question: string, context: AgentContext): void {
  const stop = new AbortController()
  exchanges.value.unshift({ id: ++asked, question, answer: '', state: 'running', cancel: () => {
    exchange.cancelled = true
    stop.abort()
  } })
  const exchange = exchanges.value[0]!
  void (async () => {
    try {
      for await (const piece of client.ask(question, context, stop.signal)) exchange.answer += piece
      exchange.state = 'done'
    } catch (error) {
      if (stop.signal.aborted) {
        exchange.state = 'done'
        return
      }
      exchange.state = 'failed'
      exchange.error = errorMessage(error)
    }
  })()
}
