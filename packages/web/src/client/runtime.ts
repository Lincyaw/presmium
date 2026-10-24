import { componentErrors, createServerClient, pluginsOf, presmiumReport, provideServer, registerPresmiumPlugin, reportPluginFailure, setHostActive, startHost } from '@lincyaw/host'
import type { ServerClient, SharedStates, SyncTransports } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { PmComponentFallback, tryInstallViewerPlugin, withSlideGlobals } from '@lincyaw/viewer'
import type { Viewer } from '@lincyaw/viewer'
import type { Component, Ref, ShallowRef } from 'vue'
import { defineAsyncComponent, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import { createViewerNavigation } from './host.ts'

/** The document's runtime, apart from the shell that shows it (VitePress's site, or the workbench's viewer app). */

export interface ViewerModule {
  name: string
  load: () => Promise<unknown>
}

/** What the runtime starts: the document's browser plugins and viewer plugins, and whether all of them restart safely. */
export interface RuntimeModules {
  plugins: (() => Promise<unknown>)[]
  viewers?: ViewerModule[]
  restartable?: boolean
}

/** Registers the browser plugins of the document and starts them, unless the runtime was disabled while their modules loaded. */
export async function startRuntime(loaders: RuntimeModules['plugins'], doc: IRDocument, viewer: Viewer, transports: SyncTransports, server: ServerClient | undefined, enabled: () => boolean): Promise<{ started: boolean, restartable: boolean }> {
  const config = doc.config.presmium
  let failed = false
  const modules = await Promise.all(loaders.map(load => load().catch((error) => {
    failed = true
    console.error('[presmium] a plugin module failed to load', error)
    return {}
  })))
  const plugins = modules.flatMap(module => pluginsOf(module))
  const restartable = !failed && plugins.every(plugin => plugin.restartable === true)
  if (!enabled()) return { started: false, restartable }
  plugins.forEach(registerPresmiumPlugin)
  await startHost({ mode: 'document', config, navigation: createViewerNavigation(viewer), transports, server, environments: doc.config.execute?.environments })
  return { started: true, restartable }
}

/** A component of the document, rendered once mounted (its module may touch the browser), with a placeholder until then. */
export function clientOnly(name: string, load: () => Promise<unknown>): Component {
  const loaded = defineAsyncComponent(() => load().then(module => withSlideGlobals((module as { default: Component }).default)))
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const mounted = ref(false)
      onMounted(() => {
        mounted.value = true
      })
      return () => (mounted.value
        ? h(loaded, attrs, slots)
        : h('div', { 'class': 'pm-client-only', 'data-component': name }, [h(PmComponentFallback)]))
    },
  })
}

export async function loadViewerPlugins(modules: ViewerModule[]): Promise<boolean> {
  let valid = true
  await Promise.all(modules.map(async ({ name, load }) => {
    const id = `${name} (viewer)`
    try {
      const reason = tryInstallViewerPlugin(((await load()) as { default?: unknown }).default, id)
      if (reason) {
        valid = false
        reportPluginFailure(id, reason)
      }
    } catch (error) {
      valid = false
      console.error(`[presmium] ${id} failed to load`, error)
      reportPluginFailure(id, errorMessage(error))
    }
  }))
  return valid
}

export interface RuntimeLifecycleInput {
  modules: RuntimeModules
  /** The document the runtime started with: a pause cannot carry it over a change of configuration or language. */
  doc: IRDocument
  viewer: Viewer
  shared: SharedStates
  /** The document as last fetched, in its own language. */
  original: ShallowRef<IRDocument>
  /** Whether the page shows its content; a paused page unmounts it. */
  active: Ref<boolean>
  /** The server client of the document, when the page has a server. */
  server?: { document?: string }
  /** Fetches the current IR; `force` fails when it cannot. */
  refresh(force?: boolean): Promise<void>
  /** Called once the viewer plugins are loaded (their views may be asked for). */
  onViewers?(ready: Promise<boolean>): void
}

export interface RuntimeLifecycle {
  /** Whether the runtime was last asked to be active. */
  isRequested(): boolean
  setActive(active: boolean): Promise<void>
}

/**
 * Starts and pauses the document's runtime, the browser plugins and the page, as a preview asks: a paused page unmounts and
 * stops its plugins; on resuming it fetches the current IR and restarts them, or fails when they cannot restart safely.
 */
export function createRuntimeLifecycle({ modules, doc, viewer, shared, original, active, server: serverOptions, refresh, onViewers }: RuntimeLifecycleInput): RuntimeLifecycle {
  let requested = active.value
  let runtimeStarted = false
  let restartable = false
  let viewersLoaded = false
  let viewersValid = false
  let wasPaused = !requested
  let queue = Promise.resolve()
  const runtimeConfig = JSON.stringify(doc.config)
  const pauseMedia = () => {
    for (const media of document.querySelectorAll('audio, video')) (media as HTMLMediaElement).pause()
  }
  const setActive = (on: boolean): Promise<void> => {
    requested = on
    const change = queue.then(async () => {
      if (!on) {
        if (!restartable || componentErrors().length > 0 || presmiumReport()?.plugins.some(plugin => plugin.status !== 'started')) {
          throw new Error('the document runtime cannot safely restart; reload the preview')
        }
        pauseMedia()
        active.value = false
        await nextTick()
        await setHostActive(false)
        wasPaused = true
        return
      }
      if (wasPaused) {
        await refresh(true)
        if (JSON.stringify(original.value.config) !== runtimeConfig || original.value.meta.lang !== doc.meta.lang) {
          throw new Error('the document runtime configuration changed; reload the preview')
        }
      }
      if (!runtimeStarted) {
        if (!viewersLoaded) {
          const ready = loadViewerPlugins(modules.viewers ?? [])
          onViewers?.(ready)
          viewersValid = await ready === true
          viewersLoaded = true
        }
        const server = requested && serverOptions ? createServerClient(serverOptions) : undefined
        if (requested) provideServer(server)
        const runtime = await startRuntime(modules.plugins, viewer.doc.value, viewer, shared.transports, server, () => requested)
        runtimeStarted = runtime.started
        restartable = modules.restartable === true && viewersValid && runtime.restartable
      } else await setHostActive(true)
      wasPaused = false
      // A queued pause checks the completed initial load before disposing anything.
      if (requested) {
        active.value = true
        await nextTick()
      }
    })
    queue = change.catch(() => undefined)
    return change
  }
  return { isRequested: () => requested, setActive }
}
