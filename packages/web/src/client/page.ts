import { useMessages } from '@presmium/host'
import { listViews, useViewer, ViewHost } from '@presmium/viewer'
import { useData } from 'vitepress'
import type { ComputedRef, InjectionKey } from 'vue'
import { computed, defineComponent, h, inject } from 'vue'
import { pageOf, toPages, WEB_MESSAGES } from '../domain/index.ts'
import type { WebPage } from '../domain/index.ts'

/** The pages of the document the viewer shows, and the path of their locale (`/en` for a translation, P-123). */
export const PAGES: InjectionKey<{ pages: ComputedRef<WebPage[]>, prefix: ComputedRef<string> }> = Symbol('presmium.pages')

/**
 * Body of every generated page: the page's sections, taken from the live
 * document so that sections added while editing appear at once; on a page of
 * a translation, from the translation.
 */
export const PresmiumPage = defineComponent({
  name: 'PresmiumPage',
  setup() {
    const { page } = useData()
    const viewer = useViewer()
    const known = inject(PAGES, undefined)
    const sections = computed(() => {
      const prefix = known?.prefix.value.slice(1) ?? ''
      const path = prefix && page.value.relativePath.startsWith(`${prefix}/`) ? page.value.relativePath.slice(prefix.length + 1) : page.value.relativePath
      return pageOf(known?.pages.value ?? toPages(viewer.doc.value), path)?.sections ?? []
    })
    return () => h(ViewHost, { sections: sections.value })
  },
})

/** The view menu in the navigation bar: every registered view except hidden ones. */
export const ViewMenu = defineComponent({
  name: 'PresmiumViewMenu',
  setup() {
    const viewer = useViewer()
    const t = useMessages(WEB_MESSAGES)
    return () => h('select', {
      'class': 'pm-view-menu',
      'aria-label': t.value.viewMenu,
      'value': viewer.view.value,
      'onChange': (event: Event) => viewer.setView((event.target as HTMLSelectElement).value),
    }, listViews().filter(view => !view.hidden || view.id === viewer.view.value).map(view => h('option', { value: view.id }, view.label)))
  },
})
