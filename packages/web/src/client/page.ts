import { useMessages } from '@presmium/host'
import { listViews, useViewer, ViewHost } from '@presmium/viewer'
import { useData } from 'vitepress'
import { computed, defineComponent, h } from 'vue'
import { pageOf, toPages, WEB_MESSAGES } from '../domain/index.ts'

/**
 * Body of every generated page: the page's sections, taken from the live
 * document so that sections added while editing appear at once.
 */
export const PresmiumPage = defineComponent({
  name: 'PresmiumPage',
  setup() {
    const { page } = useData()
    const viewer = useViewer()
    const sections = computed(() => pageOf(toPages(viewer.doc.value), page.value.relativePath)?.sections ?? [])
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
