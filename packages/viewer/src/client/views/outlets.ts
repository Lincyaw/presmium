import { safeDecodeURIComponent } from '@lincyaw/kernel'
import type { PropType } from 'vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, provide, watch } from 'vue'
import { findView } from '../registry.ts'
import { useViewer } from '../viewer-state.ts'
import { createPageTracker, PAGE_TRACKER } from './page-tracker.ts'

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

/** Mounts the current page view with the page's sections, follows the page's scrolling and restores the position. */
export const PageViewOutlet = defineComponent({
  name: 'PmPageViewOutlet',
  props: {
    sections: { type: Array as PropType<string[]>, required: true },
  },
  setup(props) {
    const viewer = useViewer()
    const pageView = computed(() => findView(viewer.pageView.value) ?? findView('document'))
    const isPage = () => findView(viewer.view.value)?.kind === 'page'
    const tracker = createPageTracker((section, step) => {
      const { position } = viewer
      viewer.go({ section, step: step ?? (section === position.value.section ? position.value.step : 0) })
    }, () => isPage() && !viewer.restoring.value)
    provide(PAGE_TRACKER, tracker)
    onBeforeUnmount(() => tracker.dispose())

    const linked = () => {
      const hash = safeDecodeURIComponent(location.hash.slice(1))
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

/** Mounts the current view when it is an overlay view. */
export const OverlayViewOutlet = defineComponent({
  name: 'PmOverlayViewOutlet',
  setup() {
    const viewer = useViewer()
    return () => {
      const view = findView(viewer.view.value)
      return view?.kind === 'overlay' ? h(view.component, { key: view.id }) : null
    }
  },
})
