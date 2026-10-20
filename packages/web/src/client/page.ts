import { useMessages } from '@lincyaw/host'
import { listViews, useViewer, ViewHost } from '@lincyaw/viewer'
import { useData } from 'vitepress'
import type { ComputedRef, InjectionKey } from 'vue'
import { computed, defineComponent, h, inject } from 'vue'
import { pageOf, toPages, WEB_MESSAGES } from '../domain/index.ts'
import type { WebPage } from '../domain/index.ts'

export const PAGES: InjectionKey<{ pages: ComputedRef<WebPage[]>, prefix: ComputedRef<string> }> = Symbol('presmium.pages')

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
