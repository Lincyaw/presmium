import { createStore } from '@lincyaw/host'
import type { Navigation } from '@lincyaw/host'
import type { AgentContext, AskClient, Citation, IRDocument } from '@lincyaw/kernel'
import { errorMessage } from '@lincyaw/kernel'
export const askClient = createStore<AskClient | undefined>(undefined)
export const slideNavigation = createStore<Navigation | undefined>(undefined)
export interface WebViewerAccess { doc(): IRDocument, position(): { section: string, step: number } | undefined, title(section: string): string | undefined, show(citation: Citation): void }
let resolveWebViewer: (() => WebViewerAccess | undefined) | undefined
let keptWebViewer: WebViewerAccess | undefined
export function setWebViewerAccess(resolve: () => WebViewerAccess | undefined) { resolveWebViewer = resolve; keptWebViewer = undefined }
export function useWebViewerAccess(): WebViewerAccess | undefined { try { return keptWebViewer = resolveWebViewer?.() } catch { return undefined } }
export function keptWebViewerAccess() { return keptWebViewer }
export function showCitation(citation: Citation) {
  if (keptWebViewer) return keptWebViewer.show(citation)
  const go = slideNavigation.getSnapshot()
  if (go) go.go({ slide: go.position.getSnapshot().slide, step: citation.step ?? 0, section: citation.section })
}
export interface Selected { text: string, section?: string, block?: string }
export const selected = createStore<Selected | undefined>(undefined)
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
    selected.set({ text: text.slice(0,4000), section, ...block?.dataset.block ? { block: block.dataset.block } : {} })
  }
  document.addEventListener('selectionchange', update)
  return () => document.removeEventListener('selectionchange', update)
}
export interface Exchange { id: number, question: string, answer: string, state: 'running' | 'done' | 'failed', error?: string, cancelled?: boolean, cancel(): void }
export const exchanges = createStore<Exchange[]>([])
let asked = 0
export function startExchange(client: AskClient, question: string, context: AgentContext) {
  const stop = new AbortController()
  const id = ++asked
  const update = (patch: Partial<Exchange>) => exchanges.set(exchanges.getSnapshot().map(e => e.id === id ? { ...e, ...patch } : e))
  const exchange: Exchange = { id, question, answer: '', state: 'running', cancel: () => { update({ cancelled: true }); stop.abort() } }
  exchanges.set([exchange, ...exchanges.getSnapshot()])
  void (async () => {
    let answer = ''
    try { for await (const piece of client.ask(question, context, stop.signal)) { answer += piece; update({ answer }) }; update({ state: 'done' }) }
    catch (error) {
      const cancelled = stop.signal.aborted || (error instanceof Error && error.name === 'AbortError')
      update(cancelled ? { state: 'done', cancelled: true } : { state: 'failed', error: errorMessage(error) })
    }
  })()
}
