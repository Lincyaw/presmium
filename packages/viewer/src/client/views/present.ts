import { FocusScope } from 'reka-ui'
import { PmApprovals } from '@lincyaw/host'
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { viewerMessages } from '../viewer-messages.ts'
import { useViewer } from '../viewer-state.ts'
import { overviewOpen, useActions } from './actions.ts'
import { button, focusScope, layers, useCurrentSection, useModal, useOverlayBar } from './overlay.ts'
import { SlideFace, SlideFit, useSlides } from './slide.ts'

function moveInOverview(root: HTMLElement | undefined, key: string): boolean {
  const items = [...root?.querySelectorAll<HTMLElement>('.pm-overview__item') ?? []]
  if (!items.length) return false
  const at = Math.max(items.indexOf(document.activeElement as HTMLElement), 0)
  const columns = items.filter(item => item.offsetTop === items[0]!.offsetTop).length
  const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns, Home: -at, End: items.length }
  if (!(key in moves)) return false
  items[Math.min(Math.max(at + moves[key]!, 0), items.length - 1)]!.focus()
  return true
}

export const PresentView = defineComponent({
  name: 'PmPresentView',
  setup() {
    const viewer = useViewer()
    const { section, step } = useCurrentSection(viewer, 'present')
    const root = shallowRef<HTMLElement>()
    const bar = shallowRef<HTMLElement>()
    const { shape } = useSlides()
    useOverlayBar(bar)
    let ownsFullscreen = false
    const enterFullscreen = () => {
      if (document.fullscreenElement) return
      void document.documentElement.requestFullscreen().then(() => {
        if (!root.value) return document.exitFullscreen()
        ownsFullscreen = true
      }).catch(() => {})
    }
    overviewOpen.value = false
    const closeOverview = () => {
      overviewOpen.value = false
      root.value?.focus()
    }
    useActions(viewer, 'present')
    const onOverviewKey = (event: KeyboardEvent) => {
      if (!overviewOpen.value || event.key === 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      event.stopImmediatePropagation()
      if (event.key === 'Escape' || event.key === 'o') closeOverview()
      else if (!moveInOverview(root.value, event.key)) return
      event.preventDefault()
    }
    useModal(root)
    onMounted(() => {
      window.addEventListener('keydown', onOverviewKey, { capture: true })
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onOverviewKey, { capture: true })
      overviewOpen.value = false
      if (ownsFullscreen && document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {})
    })
    watch(overviewOpen, async (open) => {
      if (!open) return
      await nextTick()
      root.value?.querySelector<HTMLElement>('.pm-overview__item[aria-current="true"]')?.focus()
    })
    const jump = (id: string) => {
      viewer.go({ section: id, step: 0 })
      closeOverview()
    }

    return () => {
      const current = section.value
      if (!current) return null
      const t = viewerMessages()
      const { sections } = viewer.doc.value
      return h(FocusScope, focusScope(root), () => [h('div', {
        'ref': root,
        'class': 'pm-present',
        'role': 'region',
        'aria-label': t.present.region,
        'tabindex': -1,
        'data-section': current.id,
        'data-step': step.value,
      }, [
        h('div', { class: 'pm-present__slide' }, [
          h(SlideFit, { shape: shape.value }, () => h(SlideFace, { key: current.id, section: current, step: step.value })),
          overviewOpen.value
            ? h('div', { 'class': 'pm-overview', 'role': 'dialog', 'aria-label': t.present.overview }, h('ol', { class: 'pm-overview__grid' }, sections.map(s => h('li', { key: s.id }, h('button', {
                'type': 'button',
                'class': 'pm-overview__item',
                'data-section': s.id,
                'aria-current': s.id === current.id ? 'true' : undefined,
                'onClick': () => jump(s.id),
              }, [h('span', { class: 'pm-overview__index' }, String(s.index)), h('span', { class: 'pm-overview__title' }, s.title)])))))
            : null,
        ]),
        h('div', { ref: bar, class: 'pm-present__bar' }, [
          h('span', { class: 'pm-present__counter' }, t.present.counter(current.index, sections.length, step.value, current.steps)),
          button(t.present.prev, () => viewer.prev()),
          button(t.present.next, () => viewer.next()),
          button(t.present.overview, () => overviewOpen.value = !overviewOpen.value),
          viewer.options.openPresenter ? button(t.present.presenter, () => viewer.options.openPresenter!(viewer.position.value)) : null,
          button(t.present.fullscreen, enterFullscreen),
          viewer.options.slidesOnly ? null : button(t.present.exit, () => viewer.setView(viewer.pageView.value)),
          ...layers('present', 'bar'),
          h(PmApprovals, { placement: 'above' }),
        ]),
        ...layers('present', 'view'),
      ]), ...layers('present', 'viewport')])
    }
  },
})
