import { EventSourceParserStream } from 'eventsource-parser/stream'
import { currentLocale } from '@lincyaw/host'
import type { Navigation } from '@lincyaw/host'
import type { AgentContext, AskClient } from '@lincyaw/kernel'
import { askMessages, askProvider, completionsUrl, completionText, sectionText, serviceError, streamDelta } from '../domain/index.ts'
import type { AskPlace } from '../domain/index.ts'
import { askSettings } from './settings.ts'
import type { WebViewerAccess } from './state.ts'

function placeOf(context: AgentContext, webViewer: WebViewerAccess | undefined, slideNavigation: Navigation | undefined): AskPlace {
  const selection = context.selection ? { selection: context.selection } : {}
  const doc = webViewer?.doc()
  if (doc) {
    const section = context.section === undefined ? undefined : doc.sections.find(s => s.id === context.section)
    return {
      title: doc.meta.title,
      lang: doc.meta.lang,
      sections: doc.sections.map(s => ({ id: s.id, title: s.title })),
      ...section ? { section: { id: section.id, title: section.title, ...context.step !== undefined ? { step: context.step } : {}, text: sectionText(section) } } : {},
      ...selection,
    }
  }
  const position = slideNavigation?.position.getSnapshot()
  const page = position && typeof document !== 'undefined' ? document.querySelector<HTMLElement>(`.pm-slide[data-slide="${position.slide}"]`) : undefined
  const text = page?.innerText.trim() ?? ''
  const id = position?.section ?? context.section
  const title = page?.querySelector('h1, h2, h3')?.textContent?.trim() || document.title
  return {
    lang: currentLocale(),
    sections: id ? [{ id, title }] : [],
    ...id && text ? { section: { id, title, text } } : {},
    ...selection,
  }
}

async function* streamed(body: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncIterable<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const delta = streamDelta(value.data)
      if (delta.done) return
      if (delta.text) yield delta.text
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export interface ChatClientOptions {
  webViewer(): WebViewerAccess | undefined
  slideNavigation(): Navigation | undefined
  missing(): string
  signal?: AbortSignal
}

export function createAskClient(options: ChatClientOptions): AskClient {
  return {
    provider: () => (askSettings.getSnapshot() ? askProvider(askSettings.getSnapshot()!.url) : undefined),
    async* ask(question, context, signal) {
      const settings = askSettings.getSnapshot()
      if (!settings) throw new Error(options.missing())
      const requestSignal = signal && options.signal ? AbortSignal.any([signal, options.signal]) : signal ?? options.signal
      const response = await fetch(completionsUrl(settings.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'Authorization': `Bearer ${settings.key}` },
        body: JSON.stringify({ model: settings.model, stream: true, messages: askMessages(question, placeOf(context, options.webViewer(), options.slideNavigation())) }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        ...requestSignal ? { signal: requestSignal } : {},
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        requestSignal?.throwIfAborted()
        throw new Error(serviceError(response.status, body))
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
        const body = await response.json().catch(() => undefined)
        requestSignal?.throwIfAborted()
        const text = completionText(body)
        if (text === undefined) throw new Error(serviceError(response.status, ''))
        yield text
        return
      }
      yield* streamed(response.body)
    },
  }
}
