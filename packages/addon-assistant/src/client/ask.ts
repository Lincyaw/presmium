/**
 * `ASK` (P-112, decision E-9): the reader's own model service, an
 * OpenAI-compatible Chat Completions service asked from this browser
 * directly, never through the site's server, so a static site answers too.
 * Its address, key and model stay in this site's browser storage
 * (`localStorage`; nothing when the storage is blocked but this page). A
 * question goes with what the page shows: in the web form the IR of the
 * page's document (on a student site the student build's, without the
 * teachers' content), its section's text and the table of contents for
 * citations; in the slides form, which has no IR runtime, the text of the
 * current slide, and citations reach that slide only. The request carries
 * no cookie of the site and no referrer.
 */
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

/** The reader's settings in this browser; undefined until filled in. */
export const askSettings = shallowRef<AskSettings | undefined>(typeof window === 'undefined' ? undefined : stored())

/** Saves the settings in this browser (undefined clears them). */
export function saveAskSettings(settings: AskSettings | undefined): void {
  askSettings.value = settings
  try {
    if (settings) localStorage.setItem(ASK_STORAGE_KEY, JSON.stringify(settings))
    else localStorage.removeItem(ASK_STORAGE_KEY)
  } catch {
    // Storage blocked: the settings last as long as this page.
  }
}

/** What the page gives with a question about `context`: the IR where the IR runtime runs, else the current slide's text. */
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
  // The slides form: Slidev marks each slide's page with `slidev-page-<number>` (its documented class).
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

/** Reads a streamed answer (server-sent events), piece by piece. */
async function* streamed(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const piece = chunkText(buffer.slice(0, end).trim())
        buffer = buffer.slice(end + 1)
        if (piece === null) return
        if (piece) yield piece
      }
    }
    const last = chunkText(buffer.trim())
    if (last) yield last
  } finally {
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
      // A service that answers whole, not streamed.
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
