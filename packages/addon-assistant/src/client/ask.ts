import { EventSourceParserStream } from 'eventsource-parser/stream'
import type { Navigation } from '@presmium/host'
import type { AgentContext, AskClient } from '@presmium/kernel'
import { shallowRef } from 'vue'
import { ASK_STORAGE_KEY, askMessages, askProvider, askSettingsOf, chunkText, completionText, completionsUrl, sectionText, serviceError } from '../domain/index.ts'
import type { AskPlace, AskSettings } from '../domain/index.ts'
import { currentNavigator } from './state.ts'

function stored(): AskSettings | undefined {
  try {
    return askSettingsOf(JSON.parse(localStorage.getItem(ASK_STORAGE_KEY) ?? 'null'))
  } catch {
    return undefined
  }
}

export const askSettings = shallowRef<AskSettings | undefined>(typeof window === 'undefined' ? undefined : stored())

export function saveAskSettings(settings: AskSettings | undefined): void {
  askSettings.value = settings
  try {
    if (settings) localStorage.setItem(ASK_STORAGE_KEY, JSON.stringify(settings))
    else localStorage.removeItem(ASK_STORAGE_KEY)
  } catch {
  }
}

function placeOf(context: AgentContext, navigation: Navigation | undefined): AskPlace {
  const selection = context.selection ? { selection: context.selection } : {}
  const doc = currentNavigator()?.doc()
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
  const position = navigation?.position.value
  const page = position && typeof document !== 'undefined' ? document.querySelector<HTMLElement>(`.slidev-page-${position.slide}`) : undefined
  const text = page?.innerText.trim() ?? ''
  const id = position?.section ?? context.section
  const title = page?.querySelector('h1, h2, h3')?.textContent?.trim() || document.title
  return {
    lang: document.documentElement.lang || undefined,
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
      const piece = chunkText(`data: ${value.data}`)
      if (piece === null) return
      if (piece) yield piece
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function createAskClient(navigation: () => Navigation | undefined, missing: () => string): AskClient {
  return {
    provider: () => (askSettings.value ? askProvider(askSettings.value.url) : undefined),
    async* ask(question, context, signal) {
      const settings = askSettings.value
      if (!settings) throw new Error(missing())
      const response = await fetch(completionsUrl(settings.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'Authorization': `Bearer ${settings.key}` },
        body: JSON.stringify({ model: settings.model, stream: true, messages: askMessages(question, placeOf(context, navigation())) }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        ...signal ? { signal } : {},
      })
      if (!response.ok) throw new Error(serviceError(response.status, await response.text().catch(() => '')))
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
        const text = completionText(await response.json().catch(() => undefined))
        if (text === undefined) throw new Error(serviceError(response.status, 'no answer'))
        yield text
        return
      }
      yield* streamed(response.body)
    },
  }
}
