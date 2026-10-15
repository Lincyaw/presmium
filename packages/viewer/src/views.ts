import type { IRSection } from '@presmium/kernel'
import type { PropType } from 'vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import { getView } from './registry.ts'
import type { ViewDefinition } from './registry.ts'
import { createPageTracker, PAGE_TRACKER, SectionView } from './section.ts'
import type { SectionLayout } from './section.ts'
import { useViewer } from './viewer.ts'

const sectionsProp = { sections: { type: Array as PropType<IRSection[]>, required: true } } as const

/** The document view: every section expanded, narration as body text; sections hinted `layout: scrolly` scroll. */
export const DocumentView = defineComponent({
  name: 'PmDocumentView',
  props: sectionsProp,
  setup(props) {
    const viewer = useViewer()
    const layout = (section: IRSection): SectionLayout => (section.hints[viewer.options.renderer]?.layout === 'scrolly' ? 'scrolly' : 'document')
    return () => h('div', { class: 'pm-view pm-view--document' }, props.sections.map(section => h(SectionView, { key: section.id, section, layout: layout(section) })))
  },
})

/** The scrollytelling view: every section pins its content and steps through it as the narration scrolls. */
export const ScrollyView = defineComponent({
  name: 'PmScrollyView',
  props: sectionsProp,
  setup(props) {
    return () => h('div', { class: 'pm-view pm-view--scrolly' }, props.sections.map(section => h(SectionView, { key: section.id, section, layout: 'scrolly' })))
  },
})

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

/**
 * Renders the sections of one page in the active page view (or, while an
 * overlay view is active, in the last page view, under the overlay). Follows
 * the reading position while a page view is active, and scrolls to the
 * position after a view switch or a navigation.
 */
export const ViewHost = defineComponent({
  name: 'PmViewHost',
  props: {
    /** Ids of the sections on this page. */
    sections: { type: Array as PropType<string[]>, required: true },
  },
  setup(props) {
    const viewer = useViewer()
    const isPage = (view: ViewDefinition | undefined): view is ViewDefinition => view?.kind === 'page'
    const lastPage = ref(isPage(getView(viewer.view.value)) ? viewer.view.value : 'document')
    watch(viewer.view, (id) => {
      if (isPage(getView(id))) lastPage.value = id
    })
    const pageView = computed(() => getView(isPage(getView(viewer.view.value)) ? viewer.view.value : lastPage.value) ?? getView('document'))
    const tracker = createPageTracker((section, step) => {
      const { position } = viewer
      viewer.go({ section, step: step ?? (section === position.value.section ? position.value.step : 0) })
    }, () => isPage(getView(viewer.view.value)) && !viewer.restoring.value)
    provide(PAGE_TRACKER, tracker)
    onBeforeUnmount(() => tracker.dispose())

    watch([viewer.restoring, viewer.view], async () => {
      if (!viewer.restoring.value || !isPage(getView(viewer.view.value))) return
      await nextTick()
      await frame()
      await frame()
      if (tracker.scrollTo(viewer.position.value)) viewer.restoring.value = false
      else if (viewer.options.navigate) viewer.options.navigate(viewer.position.value)
      else viewer.restoring.value = false
    }, { immediate: true })

    const sections = computed(() => props.sections.flatMap(id => viewer.section(id) ?? []))
    // Busy until a pending position has been scrolled to.
    return () => h('div', { 'class': 'pm-view-host', 'aria-busy': viewer.restoring.value ? 'true' : undefined }, [
      pageView.value ? h(pageView.value.component, { sections: sections.value }) : null,
    ])
  },
})

/** Renders the active overlay view (the present view, the presenter window), if any. */
export const OverlayHost = defineComponent({
  name: 'PmOverlayHost',
  setup() {
    const viewer = useViewer()
    return () => {
      const view = getView(viewer.view.value)
      return view?.kind === 'overlay' ? h(view.component, { key: view.id }) : null
    }
  },
})
