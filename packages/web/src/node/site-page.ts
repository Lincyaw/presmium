import escapeHtml from 'escape-html'
import { APP_CONFIG_ELEMENT } from '../domain/index.ts'
import type { AppConfig } from '../domain/index.ts'
import type { AppEntry } from './viewer-app.ts'

/**
 * The HTML of a page of the web form: the app's script and styles (from its build manifest), the import map that names
 * the modules a document's own bundle imports, what the page is (`AppConfig`), and the page's body when it was rendered
 * on the server. Built sites, dev servers and the workbench's previews all serve this one shape.
 */

/** A `<meta>` of the page's head, by its attributes. */
export type MetaTag = Record<string, string>

export interface PageHtmlInput {
  entry: AppEntry
  /** Where the app's files are, ending with `/`. */
  appUrl: string
  /** The import map's entries: specifier to the file below the app's directory. */
  shared: Record<string, string>
  config: AppConfig
  title: string
  meta?: MetaTag[]
  /** The page rendered on the server, which the app hydrates. */
  body?: string
}

/** The reader's appearance before the first paint: as the workbench asks, as the reader chose, else as the system is. */
const APPEARANCE = `(() => {
  let chosen
  try { chosen = localStorage.getItem('presmium-appearance') } catch {}
  const asked = new URLSearchParams(location.search).get('presmium-appearance') || chosen
  if (asked === 'dark' || (asked !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark')
})()`

const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

export function pageHtml(input: PageHtmlInput): string {
  const { entry, appUrl, config } = input
  const imports = Object.fromEntries(Object.entries(input.shared).map(([specifier, file]) => [specifier, `${appUrl}${file}`]))
  const attributes = (tag: MetaTag) => Object.entries(tag).map(([name, value]) => `${name}="${escapeHtml(value)}"`).join(' ')
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.title)}</title>`,
    ...(input.meta ?? []).map(tag => `<meta ${attributes(tag)}>`),
    `<script>${APPEARANCE}</script>`,
    `<script type="importmap">${json({ imports })}</script>`,
    ...entry.css.map(file => `<link rel="stylesheet" href="${escapeHtml(`${appUrl}${file}`)}">`),
    ...entry.preload.map(file => `<link rel="modulepreload" href="${escapeHtml(`${appUrl}${file}`)}">`),
    `<script type="application/json" id="${APP_CONFIG_ELEMENT}">${json(config)}</script>`,
    `<script type="module" src="${escapeHtml(`${appUrl}${entry.script}`)}"></script>`,
  ]
  return `<!doctype html>
<html lang="${escapeHtml(config.lang)}">
  <head>
    ${head.join('\n    ')}
  </head>
  <body>
    <div id="app">${input.body ?? ''}</div>
  </body>
</html>
`
}

/** A page that sends the reader on to `target` at once (a workspace's home page that is one of its documents). */
export function redirectHtml(target: string, title: string, lang: string): string {
  const href = escapeHtml(target)
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=${href}">
    <title>${escapeHtml(title)}</title>
    <script>location.replace(${json(target)})</script>
  </head>
  <body>
    <p><a href="${href}">${escapeHtml(title)}</a></p>
  </body>
</html>
`
}
