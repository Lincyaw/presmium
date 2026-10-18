import type { IRSection } from '@presmium/kernel'
import type { PropType } from 'vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, provide, watch } from 'vue'
import { decoded } from './markdown.ts'
import { getView } from './registry.ts'
import { createPageTracker, PAGE_TRACKER, SectionView } from './section.ts'
import type { SectionLayout } from './section.ts'
import { useViewer } from './viewer.ts'

const sectionsProp = { sections: { type: Array as PropType<IRSection[]>, required: true } } as const

export const DocumentView = defineComponent({
  name: 'PmDocumentView',
  props: sectionsProp,
  setup(props) {
    const viewer = useViewer()
    const layout = (section: IRSection): SectionLayout => (section.hints[viewer.options.renderer]?.layout === 'scrolly' ? 'scrolly' : 'document')
    return () => h('div', { class: 'pm-view pm-view--document' }, props.sections.map(section => h(SectionView, { key: section.id, section, layout: layout(section) })))
  },
})

export const ScrollyView = defineComponent({
  name: 'PmScrollyView',
  props: sectionsProp,
  setup(props) {
    return () => h('div', { class: 'pm-view pm-view--scrolly' }, props.sections.map(section => h(SectionView, { key: section.id, section, layout: 'scrolly' })))
  },
})

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

export const ViewHost = defineComponent({
  name: 'PmViewHost',
  props: {
    sections: { type: Array as PropType<string[]>, required: true },
  },
  setup(props) {
    const viewer = useViewer()
    const pageView = computed(() => getView(viewer.pageView.value) ?? getView('document'))
    const isPage = () => getView(viewer.view.value)?.kind === 'page'
    const tracker = createPageTracker((section, step) => {
      const { position } = viewer
      viewer.go({ section, step: step ?? (section === position.value.section ? position.value.step : 0) })
    }, () => isPage() && !viewer.restoring.value)
    provide(PAGE_TRACKER, tracker)
    onBeforeUnmount(() => tracker.dispose())

    const linked = () => {
      const hash = decoded(location.hash.slice(1))
      return props.sections.includes(hash) ? hash : undefined
    }
    const onHash = () => {
      const section = linked()
      if (section && isPage()) viewer.show({ section, step: 0 })
    }
    onMounted(() => {
      window.addEventListener('hashchange', onHash)
      if (viewer.restoring.value || props.sections.length === 0) return
      const section = linked()
      if (section) viewer.show({ section, step: 0 })
      else if (!props.sections.includes(viewer.position.value.section)) viewer.go({ section: props.sections[0]!, step: 0 })
    })
    onBeforeUnmount(() => window.removeEventListener('hashchange', onHash))

    watch(viewer.doc, async () => {
      if (!isPage() || viewer.restoring.value) return
      const restore = tracker.hold()
      await nextTick()
      restore()
      await frame()
      restore()
    }, { flush: 'pre' })

    watch([viewer.restoring, viewer.view], async () => {
      if (!viewer.restoring.value || !isPage()) return
      await nextTick()
      await frame()
      await frame()
      const { position } = viewer
      if (tracker.scrollTo(position.value)) viewer.restoring.value = false
      else if (!props.sections.includes(position.value.section) && viewer.options.navigate) viewer.options.navigate(position.value)
      else viewer.restoring.value = false
    }, { immediate: true })

    const sections = computed(() => props.sections.flatMap(id => viewer.section(id) ?? []))
    return () => h('div', { 'class': 'pm-view-host', 'aria-busy': viewer.restoring.value ? 'true' : undefined }, [
      pageView.value ? h(pageView.value.component, { sections: sections.value }) : null,
    ])
  },
})

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
