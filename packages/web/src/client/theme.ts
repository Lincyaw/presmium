import { installHost, PmBoundary, registerPresmiumPlugin, startPresmium } from '@presmium/host'
import type { PluginDefinition } from '@presmium/kernel'
import type { Theme } from 'vitepress'
import { inBrowser, useData, useRouter, withBase } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import type { Component } from 'vue'
import { defineAsyncComponent, defineComponent, h, onMounted, ref } from 'vue'
import { requestedSection, SERVICE_WORKER } from '../domain/index.ts'
import type { FormLink } from '../domain/index.ts'
import { installClicks } from './clicks.ts'
import { installSlideContext } from './context.ts'
import { createVitePressHost } from './host.ts'
import { PmSection } from './section.ts'
import './style.css'

/** The deck's addon modules, imported lazily by the generated theme. */
export interface AddonModules {
  /** Component name to loader, from each addon's `components/` directory. */
  components: Record<string, () => Promise<unknown>>
  /** Loaders of each addon's `src/client/plugin.ts`. */
  plugins: (() => Promise<unknown>)[]
}

function isPluginDefinition(value: unknown): value is PluginDefinition {
  const plugin = value as Partial<PluginDefinition> | null
  return typeof plugin === 'object' && plugin !== null && typeof plugin.setup === 'function' && typeof plugin.manifest?.id === 'string'
}

/** Kernel plugins exported by a `plugin.ts` module: default or named, single or in arrays. */
function pluginsOf(module: unknown): PluginDefinition[] {
  const values = Object.values(module as Record<string, unknown>).flatMap(v => (Array.isArray(v) ? v : [v]))
  return [...new Set(values.filter(isPluginDefinition))]
}

async function startKernel(loaders: AddonModules['plugins'], config: Record<string, unknown>): Promise<void> {
  const modules = await Promise.all(loaders.map(load => load().catch((error) => {
    console.error('[presmium] a plugin module failed to load', error)
    return {}
  })))
  modules.flatMap(pluginsOf).forEach(registerPresmiumPlugin)
  await startPresmium({ mode: 'document', config })
}

/**
 * Addon components render in the browser only: they may use browser APIs that
 * the server render of VitePress does not have. Load and render errors stay
 * inside the component's error boundary.
 */
function clientOnly(name: string, load: () => Promise<unknown>): Component {
  const loaded = defineAsyncComponent(() => load() as Promise<Component>)
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const mounted = ref(false)
      onMounted(() => {
        mounted.value = true
      })
      return () => (mounted.value
        ? h(PmBoundary, { name }, () => h(loaded, attrs, slots))
        : h('span', { 'class': 'pm-client-only', 'data-component': name }))
    },
  })
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const register = () => navigator.serviceWorker.register(withBase(`/${SERVICE_WORKER}`)).catch((error) => {
    console.warn('[presmium] offline support unavailable', error)
  })
  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', register, { once: true })
}

/** Default layout; `?slide=N` (from the slides form) opens the section of slide N. */
const Layout = defineComponent({
  name: 'PresmiumLayout',
  setup() {
    const router = useRouter()
    const { theme } = useData()
    onMounted(() => {
      const links: FormLink[] = theme.value.presmium?.links ?? []
      const link = requestedSection(location.search, links)
      if (!link) return
      history.replaceState(history.state, '', location.pathname)
      void router.go(withBase(link))
    })
    return () => h(DefaultTheme.Layout)
  },
})

/** The VitePress theme of the web form: default theme plus the document-form host. */
export function createPresmiumTheme(addons: AddonModules): Theme {
  return {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app, router, siteData }) {
      const presmium = siteData.value.themeConfig.presmium ?? {}
      installHost(app, createVitePressHost())
      installClicks(app)
      installSlideContext(app, router, presmium.deck ?? {}, presmium.links ?? [])
      app.component('PmSection', PmSection)
      for (const [name, load] of Object.entries(addons.components)) app.component(name, clientOnly(name, load))
      if (!inBrowser) return
      void startKernel(addons.plugins, presmium.config ?? {})
      if (import.meta.env.PROD) registerServiceWorker()
    },
  }
}
