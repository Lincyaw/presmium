import { OPERATIONS, pluginsOf, presmiumService, registerPresmiumPlugin, startHost } from '@lincyaw/host'
import { previewAppearance } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { findView, syncViewerWithOperations } from '@lincyaw/viewer'
import type { LiveUpdate } from '@lincyaw/viewer/domain'
import { packages } from 'virtual:presmium-app/registry'
import { computed, ref, shallowRef, watch } from 'vue'
import { APP_CONFIG_ELEMENT, parsePositionQuery, UPDATE_EVENT, withPositionQuery } from '../domain/index.ts'
import type { AppConfig, DevUpdateEvent } from '../domain/index.ts'
import { webPreview } from '../client/preview-frame.ts'
import { createRuntimeLifecycle } from '../client/runtime.ts'
import type { ViewerModule } from '../client/runtime.ts'
import { setDocumentModules } from './document-modules.ts'
import { createPageApp } from './page-app.ts'
import { forgetIndex } from './site/search.ts'
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
  const dark = ref(config.rendered ? false : isDark())
  const { app, shared } = createPageApp({ config, components: {}, embedded: false, ssr: config.rendered === true, dark })
  watch(dark, on => document.documentElement.classList.toggle('dark', on))
  app.mount('#app')
  dark.value = isDark()
  const modules = await Promise.all(used(config.plugins ?? []).flatMap(([, own]) => own.plugins).map(load => load().catch((error: unknown) => {
    console.error('[presmium] a plugin module failed to load', error)
    return {}
  })))
  modules.flatMap(module => pluginsOf(module)).forEach(registerPresmiumPlugin)
  await startHost({ mode: 'document', config: {}, navigation: { position: computed(() => ({ slide: 1, step: 0 })), go: () => {} }, transports: shared.transports })
}

async function bootDocument(): Promise<void> {
  const [answer, bundle] = await Promise.all([fetchIr(config.ir!), config.bundle ? import(/* @vite-ignore */ config.bundle) as Promise<DocumentBundle> : Promise.resolve({} as DocumentBundle)])
  const first = answer!
  let { revision, etag } = first
  setDocumentModules(bundle.documentModules ?? {})
  const doc = first.doc
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

  const preview = webPreview({ origins: config.origins, document: config.document })
  document.documentElement.classList.toggle(IN_WORKBENCH, preview.embedded)
  const dark = ref(config.rendered ? false : isDark())
  watch(dark, on => document.documentElement.classList.toggle('dark', on))
  const { app, viewer, router, shared, active } = createPageApp({ config, doc, components, embedded: preview.embedded, ssr: config.rendered === true, dark })
  active.value = preview.active
  const original = shallowRef(doc)
  const refresh = async (force = false) => {
    try {
      const next = await fetchIr(config.ir!, etag)
      if (!next || (next.revision !== undefined && next.revision === revision)) return
      revision = next.revision
      etag = next.etag
      original.value = next.doc
      viewer!.replace(next.doc)
    } catch (error) {
      console.warn('[presmium] could not get the current document', error)
      if (force) throw error
    }
  }
  let viewersReady: Promise<unknown> = Promise.resolve()
  const lifecycle = createRuntimeLifecycle({ modules: { plugins, viewers, restartable }, doc, viewer: viewer!, shared, original, active, ...config.events ? { server: { document: config.document } } : {}, refresh, onViewers: (ready) => {
    viewersReady = ready
  } })
  watch(() => presmiumService(OPERATIONS), (operations, _, onCleanup) => {
    if (operations) onCleanup(syncViewerWithOperations(viewer!, operations))
  }, { immediate: true })
  app.mount('#app')
  dark.value = isDark()
  preview.connect({ viewer: viewer!, dark, setActive: lifecycle.setActive })
  router!.listen()

  // The dev server's changes: the sections that changed when the page has the revision they change, else the whole IR.
  if (config.events) {
    const events = new EventSource(config.events)
    events.addEventListener(UPDATE_EVENT, (message: MessageEvent<string>) => {
      if (config.search) forgetIndex(config.search)
      if (!lifecycle.isRequested()) return
      const change = JSON.parse(message.data) as DevUpdateEvent<LiveUpdate>
      if (change.update && change.base === revision) {
        revision = change.revision
        etag = `"${change.revision}"`
        viewer!.update(change.update)
        original.value = viewer!.doc.value
      } else void refresh()
    })
    events.addEventListener('reload', () => location.reload())
    events.addEventListener('open', () => void (lifecycle.isRequested() && refresh()))
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
  watch([viewer!.view, viewer!.position], ([view, position]) => {
    const search = withPositionQuery(location.search, findView(view)?.kind === 'overlay' ? { view, ...position } : undefined)
    if (search !== location.search) history.replaceState(history.state, '', location.pathname + search + location.hash)
  }, { immediate: true })
}

void (config.kind === 'document' ? bootDocument() : bootPage()).catch((error: unknown) => {
  console.error('[presmium] the viewer did not start', error)
  document.getElementById('app')!.textContent = String(error)
})
