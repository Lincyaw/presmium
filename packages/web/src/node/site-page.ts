import escapeHtml from 'escape-html'
import { STALE_MODULE_EVENT, STALE_MODULE_PATTERN } from '@lincyaw/kernel'
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
  /** More modules the page will import, fetched with the app instead of one after another (a document's scene code). */
  preload?: string[]
}

/** The reader's appearance before the first paint: as the workbench asks, as the reader chose, else as the system is. */
const APPEARANCE = `(() => {
  let chosen
  try { chosen = localStorage.getItem('presmium-appearance') } catch {}
  const asked = new URLSearchParams(location.search).get('presmium-appearance') || chosen
  if (asked === 'dark' || (asked !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark')
})()`

/**
 * A page cached before a new deployment names an app version the deployment removed: its scripts and the modules they
 * import then fail. The page loads once more, from the network, and gets the current version: at most once in 30 s,
 * not while offline (a lost connection fails the same way) and not without session storage to remember it.
 * Failures come as Vite's preload event, a rejected dynamic import, a module script that cannot load, or the event
 * Presmium's own loaders dispatch (`reportStaleModule`).
 */
const STALE_RELOAD = `(() => {
  const key = 'presmium-stale-reload'
  // Reloads at most once in 30 s, only while online, and only where it can remember that it did: without storage a
  // module that keeps failing would reload the page forever. Returns whether it reloads.
  const reload = () => {
    if (navigator.onLine === false) return false
    try {
      if (Date.now() - (Number(sessionStorage.getItem(key)) || 0) < 30000) return false
      sessionStorage.setItem(key, String(Date.now()))
    } catch { return false }
    location.reload()
    return true
  }
  const stale = new RegExp(${JSON.stringify(STALE_MODULE_PATTERN.source)}, ${JSON.stringify(STALE_MODULE_PATTERN.flags)})
  addEventListener(${JSON.stringify(STALE_MODULE_EVENT)}, reload)
  // Vite rethrows the failure unless the event is cancelled: cancel it only when the page is about to reload.
  addEventListener('vite:preloadError', (event) => { if (reload()) event.preventDefault() })
  addEventListener('unhandledrejection', (event) => { if (stale.test(String(event.reason && event.reason.message || event.reason))) reload() })
  addEventListener('error', (event) => { const el = event.target; if (el && el.tagName === 'SCRIPT' && el.type === 'module') reload() }, true)
})()`

const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

export function pageHtml(input: PageHtmlInput): string {
  const { entry, appUrl, config } = input
  const imports = Object.fromEntries(Object.entries(input.shared).map(([specifier, file]) => [specifier, `${appUrl}${file}`]))
  const attributes = (tag: MetaTag) => Object.entries(tag).map(([name, value]) => `${name}="${escapeHtml(value)}"`).join(' ')
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">',
    `<title>${escapeHtml(input.title)}</title>`,
    ...(input.meta ?? []).map(tag => `<meta ${attributes(tag)}>`),
    `<script>${APPEARANCE}</script>`,
    `<script>${STALE_RELOAD}</script>`,
    `<script type="importmap">${json({ imports })}</script>`,
    ...entry.css.map(file => `<link rel="stylesheet" href="${escapeHtml(`${appUrl}${file}`)}">`),
    // A workspace theme's fonts, tokens and styles come after the app's, so that they override them.
    ...(config.site?.shell.theme?.stylesheets ?? []).map(url => `<link rel="stylesheet" href="${escapeHtml(url)}">`),
    // The app's modules, the document's own code (its bundle) and, when given, what its scenes load, all in parallel;
    // each once, though the scenes' modules import the app's.
    ...[...new Set([...entry.preload.map(file => `${appUrl}${file}`), ...config.bundle ? [config.bundle] : [], ...input.preload ?? []])].map(url => `<link rel="modulepreload" href="${escapeHtml(url)}">`),
    // The document itself, fetched with the app instead of after it has started.
    ...config.ir ? [`<link rel="preload" as="fetch" crossorigin href="${escapeHtml(config.ir)}">`] : [],
    `<script type="application/json" id="${APP_CONFIG_ELEMENT}">${json(config)}</script>`,
    `<script type="module" src="${escapeHtml(`${appUrl}${entry.script}`)}"></script>`,
  ]
  return `<!doctype html>
<html lang="${escapeHtml(config.lang)}">
  <head>
    ${head.join('\n    ')}
  </head>
  <body${config.site?.shell.theme?.name ? ` data-pm-site-theme-name="${escapeHtml(config.site.shell.theme.name)}"` : ''}>
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
