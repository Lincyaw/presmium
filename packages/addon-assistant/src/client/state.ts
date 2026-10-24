import type { Navigation } from '@lincyaw/host'
import type { AgentContext, AskClient, Citation, IRDocument } from '@lincyaw/kernel'
import { errorMessage } from '@lincyaw/kernel'
import { ref, shallowRef } from 'vue'

export const askClient = shallowRef<AskClient>()
export const slideNavigation = shallowRef<Navigation>()

export interface WebViewerAccess {
  doc(): IRDocument
  position(): { section: string, step: number } | undefined
  title(section: string): string | undefined
  show(citation: Citation): void
}

let resolveWebViewer: (() => WebViewerAccess | undefined) | undefined
let keptWebViewer: WebViewerAccess | undefined

export function setWebViewerAccess(resolve: () => WebViewerAccess | undefined): void {
  resolveWebViewer = resolve
  keptWebViewer = undefined
}

export function useWebViewerAccess(): WebViewerAccess | undefined {
  try {
    return keptWebViewer ??= resolveWebViewer?.()
  } catch {
    return undefined
  }
}

export function keptWebViewerAccess(): WebViewerAccess | undefined {
  return keptWebViewer
}

export function showCitation(citation: Citation): void {
  if (keptWebViewer) return keptWebViewer.show(citation)
  const go = slideNavigation.value
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
    const section = element?.closest<HTMLElement>('[data-section]')?.dataset.section
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

export function startExchange(client: AskClient, question: string, context: AgentContext): void {
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
