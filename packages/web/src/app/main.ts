import { currentLocale, OPERATIONS, pluginsOf, presmiumService, registerPresmiumPlugin, startHost, createStore, observe, runtimeRevision } from '@lincyaw/host'
import { previewAppearance, reportStaleModule } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { findView, loadDocumentParts, syncViewerWithOperations } from '@lincyaw/viewer'
import type { LiveUpdate } from '@lincyaw/viewer/domain'
import { packages } from 'virtual:presmium-app/registry'
import { APP_CONFIG_ELEMENT, parsePositionQuery, parsePrintQuery, UPDATE_EVENT, WEB_MESSAGES, withPositionQuery } from '../domain/index.ts'
import type { AppConfig, DevUpdateEvent } from '../domain/index.ts'
import { webPreview } from '../client/preview-frame.ts'
import { createRuntimeLifecycle } from '../client/runtime.ts'
import type { ViewerModule } from '../client/runtime.ts'
import { setDocumentModules } from './document-modules.ts'
import { createPageApp } from './page-app.ts'
import { blockPreviewReporter } from './block-report.ts'
import { forgetIndex } from './site/search.tsx'
import './base.css'
import './site.css'

/**
 * The viewer app in the browser: the web form's runtime, prebuilt once for a set of plugins, as a PDF viewer is for every
 * PDF. The page it runs in says what to show (`AppConfig`): a document's page, with its IR and its own code from its
 * bundle; the workspace's home page; or a missing page. A built page was rendered on the server, and is hydrated here.
 */

/** The document's own code (`document-bundle.ts`). */
interface DocumentBundle {
  components?: Record<string, () => Promise<unknown>>
  plugins?: (() => Promise<unknown>)[]
  viewers?: ViewerModule[]
  documentModules?: Record<string, unknown>
  restartable?: boolean
}

interface IrAnswer {
  /** The IR's revision, as a dev server gives it; a built site's IR changes with the site. */
  revision?: string
  /** What the server calls this version of the IR (`ETag`), to ask for it again only when it changed. */
  etag?: string
  doc: IRDocument
}

// The header of a dev server's IR that holds its revision (`site-files.ts`).
const REVISION_HEADER = 'Presmium-Revision'

const IN_WORKBENCH = 'pm-in-workbench'

const config = JSON.parse(document.getElementById(APP_CONFIG_ELEMENT)!.textContent!) as AppConfig

async function fetchIr(url: string, etag?: string): Promise<IrAnswer | undefined> {
  const response = await fetch(url, { cache: 'no-store', ...etag ? { headers: { 'If-None-Match': etag } } : {} })
  if (response.status === 304) return undefined
  if (!response.ok) throw new Error(`the document could not be read (${response.status})`)
  return { revision: response.headers.get(REVISION_HEADER) ?? undefined, etag: response.headers.get('ETag') ?? undefined, doc: await response.json() as IRDocument }
}

/** The browser parts of the plugin packages the page runs, as the app was built with them. */
function used(names: readonly string[]) {
  return names.flatMap(name => packages[name] ? [[name, packages[name]!] as const] : [])
}

/** Whether the page is dark: as the workbench loaded it, as the reader chose (the head read it), or as the system is. */
function isDark(): boolean {
  const asked = previewAppearance()
  return asked ? asked === 'dark' : document.documentElement.classList.contains('dark')
}

function registerServiceWorker(url: string): void {
  if (!('serviceWorker' in navigator)) return
  const register = () => navigator.serviceWorker.register(url).catch((error: unknown) => {
    console.warn('[presmium] offline support unavailable', error)
  })
  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', register, { once: true })
}

/** A page that shows no document: its plugins (the operator's) run with no position. */
async function bootPage(): Promise<void> {
  // A rendered page is hydrated as it was rendered, light; its appearance follows once it is the browser's.
  const dark = createStore(config.rendered ? false : isDark())
  const { app, shared } = createPageApp({ config, components: {}, embedded: false, ssr: config.rendered === true, dark })
  observe(dark, on => document.documentElement.classList.toggle('dark', on))
  await app.mount('#app')
  dark.set(isDark())
  const modules = await Promise.all(used(config.plugins ?? []).flatMap(([, own]) => own.plugins).map(load => load().catch((error: unknown) => {
    console.error('[presmium] a plugin module failed to load', error)
    reportStaleModule(error)
    return {}
  })))
  modules.flatMap(module => pluginsOf(module)).forEach(registerPresmiumPlugin)
  await startHost({ mode: 'document', config: {}, navigation: { position: createStore({ slide: 1, step: 0 }), go: () => {} }, transports: shared.transports })
}

async function bootDocument(): Promise<void> {
  const [answer, bundle] = await Promise.all([fetchIr(config.ir!), config.bundle ? import(/* @vite-ignore */ config.bundle) as Promise<DocumentBundle> : Promise.resolve({} as DocumentBundle)])
  const first = answer!
  let { revision, etag } = first
  setDocumentModules(bundle.documentModules ?? {})
  const doc = first.doc
  // What of the viewer this document needs beyond the app's first part, as the server rendered it with.
  await loadDocumentParts(doc)
  document.documentElement.lang = config.lang
  if (config.page === undefined) document.title = doc.meta.title

  // The plugins' components, then the document's own; its plugins, then its own.
  const own = used(config.plugins ?? doc.config.plugins)
  const components: Record<string, () => Promise<unknown>> = {}
  for (const [, pkg] of own) for (const [name, load] of Object.entries(pkg.components)) components[name] ??= load
  Object.assign(components, bundle.components ?? {})
  const viewers: ViewerModule[] = [...own.flatMap(([, pkg]) => pkg.viewers.map(load => ({ name: pkg.name, load }))), ...bundle.viewers ?? []]
  const plugins = [...own.flatMap(([, pkg]) => pkg.plugins), ...bundle.plugins ?? []]
  const restartable = own.every(([, pkg]) => pkg.restartable) && bundle.restartable !== false

  const preview = config.block ? undefined : webPreview({ origins: config.origins, document: config.document, renderer: config.form ?? 'web' })
  document.documentElement.classList.toggle(IN_WORKBENCH, preview?.embedded ?? false)
  document.documentElement.classList.toggle('pm-block-document', config.block !== undefined)
  const dark = createStore(config.rendered ? false : isDark())
  observe(dark, on => document.documentElement.classList.toggle('dark', on))
  // A slides page asked to print its slides: an export.
  const print = config.form === 'slides' ? parsePrintQuery(location.search) : undefined
  const { app, viewer, router, shared, active } = createPageApp({ config, doc, components, embedded: preview?.embedded ?? false, ssr: config.rendered === true, dark, print })
  active.set(preview?.active ?? true)
  const original = createStore(doc)
  const refresh = async (force = false) => {
    try {
      const next = await fetchIr(config.ir!, etag)
      if (!next || (next.revision !== undefined && next.revision === revision)) return
      revision = next.revision
      etag = next.etag
      original.set(next.doc)
      viewer!.replace(next.doc)
    } catch (error) {
      console.warn('[presmium] could not get the current document', error)
      if (force) throw error
    }
  }
  let viewersReady: Promise<unknown> = Promise.resolve()
  const lifecycle = createRuntimeLifecycle({ modules: { plugins, viewers, restartable }, doc, viewer: viewer!, shared, original, active, ...!config.block && config.events ? { server: { document: config.document, root: config.server, subscribeEvents: preview?.events } } : {}, refresh, onViewers: (ready) => {
    viewersReady = ready
  } })
  let stopOperations: (() => void) | undefined
  if (!config.block) observe(runtimeRevision, () => { stopOperations?.(); const operations = presmiumService(OPERATIONS); stopOperations = operations ? syncViewerWithOperations(viewer!, operations) : undefined }, true)
  await app.mount('#app')
  dark.set(isDark())
  preview?.connect({ viewer: viewer!, dark, setActive: lifecycle.setActive })
  router?.listen()

  // The dev server's changes: the sections that changed when the page has the revision they change, else the whole IR.
  if (!config.block && config.events) {
    const updated = (data: string) => {
      if (config.search) forgetIndex(config.search)
      if (!lifecycle.isRequested()) return
      const change = JSON.parse(data) as DevUpdateEvent<LiveUpdate>
      if (change.update && change.base === revision) {
        revision = change.revision
        etag = `"${change.revision}"`
        viewer!.update(change.update)
        original.set(viewer!.doc.getSnapshot())
      } else void refresh()
    }
    const opened = () => void (lifecycle.isRequested() && refresh())
    if (preview?.events) {
      const address = new URL(config.events, location.href)
      preview.events({ topic: 'viewer-site', document: config.document ?? '', app: address.searchParams.get('app') ?? '', lang: address.searchParams.get('lang') ?? '', form: address.searchParams.get('form') === 'slides' ? 'slides' : 'web' }, message => {
        if (message.type === 'open') opened()
        else if (message.type === 'event' && message.event === UPDATE_EVENT) updated(message.data)
        else if (message.type === 'event' && message.event === 'reload') location.reload()
      })
    } else {
      const events = new EventSource(config.events)
      events.addEventListener(UPDATE_EVENT, (message: MessageEvent<string>) => updated(message.data))
      events.addEventListener('reload', () => location.reload())
      events.addEventListener('open', opened)
    }
  }
  if (config.block) {
    const reporter = blockPreviewReporter(config, doc, viewer!)
    try { if (lifecycle.isRequested()) await lifecycle.setActive(true); await reporter.ready() }
    catch (error) { reporter.failed(); console.error('[presmium] the block runtime did not start', error) }
    return
  }
  if (lifecycle.isRequested()) await lifecycle.setActive(true).catch(error => console.error('[presmium] the document runtime did not start', error))
  if (config.serviceWorker) registerServiceWorker(config.serviceWorker)

  // The place and the view the address asks for (`?view=present&section=…`); while an overlay view is shown its place
  // stays in the address, so that a reload comes back to it.
  const asked = parsePositionQuery(location.search, doc)
  if (asked.section) viewer!.show({ section: asked.section, step: asked.step ?? 0 })
  if (asked.view) {
    await viewersReady
    if (findView(asked.view)) viewer!.setView(asked.view)
  }
  const syncAddress = () => { const view = viewer!.view.getSnapshot(); const position = viewer!.position.getSnapshot(); const search = withPositionQuery(location.search, findView(view)?.kind === 'overlay' ? { view, ...position } : undefined); if (search !== location.search) history.replaceState(history.state, '', location.pathname + search + location.hash) }
  viewer!.view.subscribe(syncAddress)
  viewer!.position.subscribe(syncAddress)
  syncAddress()
}

void (config.kind === 'document' ? bootDocument() : bootPage()).catch((error: unknown) => {
  console.error('[presmium] the viewer did not start', error)
  document.getElementById('app')!.textContent = WEB_MESSAGES[currentLocale()].startFailed
})
