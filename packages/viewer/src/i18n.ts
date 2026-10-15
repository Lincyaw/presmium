import { currentLocale } from '@presmium/host'
import type { IRDocument } from '@presmium/kernel'
import { localeOf, messagesFor } from './domain/index.ts'
import type { Messages } from './domain/index.ts'

/** The document's language, for the server render, which has no `<html lang>` to read. */
let documentLang: string | undefined

/** Remembers the language of the document a viewer renders (its `lang`, else its renderer's). */
export function setDocumentLanguage(doc: IRDocument, renderer: string): void {
  const lang = doc.meta.lang ?? doc.config.renderers[renderer]?.lang
  documentLang = typeof lang === 'string' ? lang : undefined
}

/**
 * The interface text in the page's language: `<html lang>`, else the
 * browser's language (`currentLocale` of @presmium/host). It is reactive, so
 * what renders it follows a host that sets `<html lang>` after the first
 * render (VitePress's dev server). The server render, which renders the
 * `<html lang>` the page will have, uses the document's language.
 */
export function messages(): Messages {
  return messagesFor(typeof document === 'undefined' ? localeOf(documentLang) : currentLocale())
}
