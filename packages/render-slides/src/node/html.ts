/**
 * HTML a run produced (`text/html` outputs, docs/ir.md 6.1), sanitized as the
 * web form sanitizes it in the browser (DOMPurify with its defaults,
 * @presmium/viewer's outputs), here at build time in a DOM of jsdom
 * (DOMPurify's supported DOM for Node), without `<style>`: in a slide, which
 * Vue compiles as a template, a style element is an error (and would style
 * the whole deck); the deck's styles draw tables. Loaded on first use: most
 * decks have no HTML output.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let purify: ((html: string) => string) | undefined

export function sanitizedHtml(html: string): string {
  if (!purify) {
    const { JSDOM } = require('jsdom') as { JSDOM: new (html: string) => { window: unknown } }
    const createDOMPurify = require('dompurify') as (window: unknown) => { sanitize(html: string, config: { FORBID_TAGS: string[] }): string }
    const instance = createDOMPurify(new JSDOM('').window)
    purify = text => instance.sanitize(text, { FORBID_TAGS: ['style'] })
  }
  return purify(html)
}
