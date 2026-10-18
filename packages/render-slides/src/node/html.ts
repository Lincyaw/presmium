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
