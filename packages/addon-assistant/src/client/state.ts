import type { Navigation } from '@presmium/host'
import type { AgentClient, AgentContext, AskClient, Citation, IRBlock, IRDocument, SourcePos } from '@presmium/kernel'
import { errorMessage } from '@presmium/kernel'
import { ref, shallowRef } from 'vue'
import type { AssistantClient } from './agent.ts'

export const agent = shallowRef<AgentClient>()
export const assistant = shallowRef<AssistantClient>()
export const asker = shallowRef<AskClient>()
export const navigation = shallowRef<Navigation>()

export interface Navigator {
  doc(): IRDocument
  position(): { section: string, step: number } | undefined
  title(section: string): string | undefined
  show(citation: Citation): void
  block(section: string, block: string): IRBlock | undefined
  source(section: string): SourcePos | undefined
}

let navigator: (() => Navigator | undefined) | undefined
let found: Navigator | undefined

export function setNavigator(get: () => Navigator | undefined): void {
  navigator = get
  found = undefined
}

export function useNavigator(): Navigator | undefined {
  try {
    return found ??= navigator?.()
  } catch {
    return undefined
  }
}

export function currentNavigator(): Navigator | undefined {
  return found
}

export function showCitation(citation: Citation): void {
  const nav = found
  if (nav) return nav.show(citation)
  const go = navigation.value
  if (go) go.go({ slide: go.position.value.slide, step: citation.step ?? 0, section: citation.section })
}

export interface Selected {
  text: string
  section?: string
  block?: string
}

export const selected = shallowRef<Selected>()

export function trackSelection(): () => void {
  const update = () => {
    const selection = document.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
    const text = selection.toString().trim()
    const node = selection.getRangeAt(0).commonAncestorContainer
    const element = node instanceof Element ? node : node.parentElement
    if (!text || element?.closest('.pm-assistant')) return
    const section = element?.closest<HTMLElement>('[data-section]')?.dataset.section ?? (element?.closest('.slidev-page') ? navigation.value?.position.value.section : undefined)
    if (!section) return
    const block = element?.closest<HTMLElement>('[data-block]')
    selected.value = { text: text.slice(0, 4000), section, ...block?.dataset.block ? { block: block.dataset.block } : {} }
  }
  document.addEventListener('selectionchange', update)
  return () => document.removeEventListener('selectionchange', update)
}

export interface Exchange {
  id: number
  question: string
  answer: string
  state: 'running' | 'done' | 'failed'
  error?: string
  cancelled?: boolean
  cancel(): void
}

export const exchanges = ref<Exchange[]>([])
let asked = 0

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
