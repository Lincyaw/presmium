import { createSharedStates, installHost, OPERATIONS, presmiumService } from '@lincyaw/host'
import { previewAppearance } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { createViewer, findView, installViewer, OverlayViewOutlet, PageViewOutlet, registerComponent, syncViewerWithOperations } from '@lincyaw/viewer'
import type { Position } from '@lincyaw/viewer/domain'
import { packages } from 'virtual:presmium-app/registry'
import { computed, createApp, defineComponent, h, nextTick, ref, shallowRef, watch } from 'vue'
import { parsePositionQuery, webPages, withPositionQuery } from '../domain/index.ts'
import { createWebHostAdapter } from '../client/host.ts'
import { webPreview } from '../client/preview-frame.ts'
import { clientOnly, createRuntimeLifecycle } from '../client/runtime.ts'
import type { ViewerModule } from '../client/runtime.ts'
import { setDocumentModules } from './document-modules.ts'
import './base.css'
import '../client/style.css'

/**
 * The workbench's viewer app: the web form's runtime prebuilt once for the workspace's plugins, as a PDF viewer is for
 * every PDF. The document is data: its IR from the workspace service, its own components and plugins' document modules
 * from its bundle. Shown a page at a time on the editor's canvas, as the web form pages it, its presentation in the same page.
 */

/** What the service writes into the page: the document, where its IR, its changes and its bundle are, who may embed it. */
interface AppConfig {
  document: string
  ir: string
  events: string
  bundle?: string
  origins: string[]
}

/** The document's own code (`document-bundle.ts`). */
interface DocumentBundle {
  components?: Record<string, () => Promise<unknown>>
  plugins?: (() => Promise<unknown>)[]
  viewers?: ViewerModule[]
  documentModules?: Record<string, unknown>
  restartable?: boolean
}

interface IrAnswer {
  revision: string
  doc: IRDocument
}

const IN_WORKBENCH = 'pm-in-workbench'

const config = JSON.parse(document.getElementById('presmium-app')!.textContent!) as AppConfig

async function fetchIr(revision?: string): Promise<IrAnswer | undefined> {
  const response = await fetch(config.ir, { cache: 'no-store', ...revision ? { headers: { 'If-None-Match': `"${revision}"` } } : {} })
  if (response.status === 304) return undefined
  if (!response.ok) throw new Error(`the document could not be read (${response.status})`)
  return await response.json() as IrAnswer
}

async function boot(): Promise<void> {
  const [answer, bundle] = await Promise.all([fetchIr(), config.bundle ? import(/* @vite-ignore */ config.bundle) as Promise<DocumentBundle> : Promise.resolve({} as DocumentBundle)])
  const first = answer!
  let revision = first.revision
  setDocumentModules(bundle.documentModules ?? {})
  const doc = first.doc
  document.documentElement.lang = typeof doc.meta.lang === 'string' && doc.meta.lang ? doc.meta.lang : 'zh-CN'
  document.title = doc.meta.title

  // The document's plugins, as the dev servers' generated modules list them: their components, then the document's own.
  const used = doc.config.plugins.flatMap(name => packages[name] ? [[name, packages[name]!] as const] : [])
  const components: Record<string, () => Promise<unknown>> = {}
  for (const [, own] of used) for (const [name, load] of Object.entries(own.components)) components[name] ??= load
  Object.assign(components, bundle.components ?? {})
  const viewers: ViewerModule[] = [...used.flatMap(([name, own]) => own.viewers.map(load => ({ name, load }))), ...bundle.viewers ?? []]
  const plugins = [...used.flatMap(([, own]) => own.plugins), ...bundle.plugins ?? []]
  const restartable = used.every(([, own]) => own.restartable) && bundle.restartable !== false

  const preview = webPreview({ origins: config.origins, document: config.document })
  document.documentElement.classList.toggle(IN_WORKBENCH, preview.embedded)
  const active = ref(preview.active)
  // As the workbench loaded the page, or as the system is (the page's head took it already); the workbench's `appearance` follows.
  const dark = ref((previewAppearance() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark')
  watch(dark, on => document.documentElement.classList.toggle('dark', on), { immediate: true })

  // The pages of the web form; the one shown is the current section's.
  const page = ref<string>()
  const pageOf = (section: string) => webPages(viewer.doc.value).find(p => p.sections.includes(section))?.path
  const shown = computed(() => {
    const pages = webPages(viewer.doc.value)
    return pages.find(p => p.path === page.value) ?? pages[0]
  })
  const turnTo = (position: Position) => {
    const path = pageOf(position.section)
    if (path === undefined || path === shown.value?.path) return
    page.value = path
    if (!viewer.restoring.value) void nextTick(() => window.scrollTo(0, 0))
  }

  const viewer = createViewer(doc, { renderer: 'web', sectionHref: id => `#${encodeURIComponent(id)}`, diagnostics: true, navigate: turnTo })
  const original = shallowRef(doc)
  const shared = createSharedStates(doc.meta.title)
  const refresh = async (force = false) => {
    try {
      const next = await fetchIr(revision)
      if (!next || next.revision === revision) return
      revision = next.revision
      original.value = next.doc
      viewer.replace(next.doc)
    } catch (error) {
      console.warn('[presmium] could not get the current document', error)
      if (force) throw error
    }
  }
  let viewersReady: Promise<unknown> = Promise.resolve()
  const lifecycle = createRuntimeLifecycle({ modules: { plugins, viewers, restartable }, doc, viewer, shared, original, active, server: { document: config.document }, refresh, onViewers: (ready) => {
    viewersReady = ready
  } })

  // A link to a section of another page turns to it.
  window.addEventListener('hashchange', () => {
    const section = decodeURIComponent(location.hash.slice(1))
    if (!viewer.section(section) || pageOf(section) === shown.value?.path) return
    viewer.restoring.value = true
    viewer.go({ section, step: 0 })
    turnTo({ section, step: 0 })
  })

  const App = defineComponent({
    name: 'PresmiumViewerApp',
    setup() {
      return () => !active.value ? null : h('div', { class: 'pm-sheet-canvas' }, [
        h('article', { class: 'pm-sheet vp-doc' }, [h(PageViewOutlet, { key: shown.value?.path, sections: shown.value?.sections ?? [] })]),
        h('div', { class: 'vp-doc pm-overlay-views' }, [h(OverlayViewOutlet)]),
      ])
    },
  })
  const app = createApp(App)
  installHost(app, createWebHostAdapter(viewer, { lang: document.documentElement.lang, shared, isDark: () => dark }))
  installViewer(app, viewer)
  for (const [name, load] of Object.entries(components)) registerComponent(name, clientOnly(name, load))
  watch(() => presmiumService(OPERATIONS), (operations, _, onCleanup) => {
    if (operations) onCleanup(syncViewerWithOperations(viewer, operations))
  }, { immediate: true })
  app.mount('#app')
  preview.connect({ viewer, dark, setActive: lifecycle.setActive })

  // The document's changes, as the service compiles them; each connection (`open`) reads it again in case one was missed.
  const events = new EventSource(config.events)
  events.addEventListener('ir', () => void (lifecycle.isRequested() && refresh()))
  events.addEventListener('reload', () => location.reload())
  events.addEventListener('open', () => void (lifecycle.isRequested() && refresh()))
  if (lifecycle.isRequested()) await lifecycle.setActive(true).catch(error => console.error('[presmium] the document runtime did not start', error))

  // The place and the view the address asks for (`?view=present&section=…`), as on the site; while an overlay view is
  // shown its place stays in the address, so that a reload comes back to it.
  const asked = parsePositionQuery(location.search, doc)
  if (asked.section) viewer.show({ section: asked.section, step: asked.step ?? 0 })
  if (asked.view) {
    await viewersReady
    if (findView(asked.view)) viewer.setView(asked.view)
  }
  watch([viewer.view, viewer.position], ([view, position]) => {
    const search = withPositionQuery(location.search, findView(view)?.kind === 'overlay' ? { view, ...position } : undefined)
    if (search !== location.search) history.replaceState(history.state, '', location.pathname + search + location.hash)
  }, { immediate: true })
}

void boot().catch((error: unknown) => {
  console.error('[presmium] the viewer did not start', error)
  document.getElementById('app')!.textContent = String(error)
})
