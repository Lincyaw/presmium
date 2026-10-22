import { FocusScope } from 'reka-ui'
import { PmApprovals } from '@lincyaw/host'
import type { Ref } from 'vue'
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { viewerMessages } from '../viewer-messages.ts'
import { useViewer } from '../viewer-state.ts'
import { overviewOpen, useActions } from './actions.ts'
import { button, focusScope, layers, useCurrentSection, useModal, useOverlayBar, visuals } from './overlay.ts'

interface Fitted {
  width?: number
  scale: number
  height: number
  shift: number
}

function useFit(frame: Readonly<Ref<HTMLElement | undefined>>, content: Readonly<Ref<HTMLElement | undefined>>) {
  const fitted = ref<Fitted>()
  const fit = () => {
    const [outer, inner] = [frame.value, content.value]
    if (!outer || !inner) return
    const style = getComputedStyle(outer)
    const available = {
      height: outer.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom) - 1,
      width: outer.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
    }
    if (available.height <= 0 || available.width <= 0) return
    inner.style.width = ''
    const wide = Math.max(0, ...[...inner.querySelectorAll<HTMLElement>('pre, table, .pm-block, .pm-mermaid, .pm-math--display')].map(el => el.scrollWidth - el.clientWidth))
    const width = available.width + wide
    if (wide > 0) inner.style.width = `${width}px`
    const natural = inner.offsetHeight
    const scale = Math.min(1, available.width / width, available.height / natural)
    const next = scale < 1 ? { width: wide > 0 ? width : undefined, scale, height: natural * scale, shift: (available.width - width * scale) / 2 } : undefined
    if (JSON.stringify(next) !== JSON.stringify(fitted.value)) fitted.value = next
    else if (next?.width) inner.style.width = `${next.width}px`
  }
  let observer: ResizeObserver | undefined
  onMounted(() => {
    observer = new ResizeObserver(fit)
    if (frame.value) observer.observe(frame.value)
  })
  watch(content, (el, old) => {
    if (old) observer?.unobserve(old)
    if (el) observer?.observe(el)
  }, { flush: 'post' })
  onBeforeUnmount(() => observer?.disconnect())
  return fitted
}

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
    const frame = shallowRef<HTMLElement>()
    const content = shallowRef<HTMLElement>()
    const bar = shallowRef<HTMLElement>()
    const fitted = useFit(frame, content)
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
        h('div', { ref: frame, class: 'pm-present__slide' }, [
          h('div', { class: 'pm-present__fit', style: fitted.value ? { height: `${fitted.value.height}px`, overflow: 'clip' } : undefined }, h('div', {
            key: current.id,
            ref: content,
            class: 'pm-present__content',
            style: fitted.value
              ? { width: fitted.value.width ? `${fitted.value.width}px` : undefined, transform: `translateX(${fitted.value.shift}px) scale(${fitted.value.scale})` }
              : undefined,
          }, [
            h('h1', { class: 'pm-present__title' }, current.title),
            ...visuals(current, step.value),
          ])),
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
          button(t.present.exit, () => viewer.setView(viewer.pageView.value)),
          h(PmApprovals, { placement: 'above' }),
        ]),
        ...layers('present', 'view'),
      ]), ...layers('present', 'viewport')])
    }
  },
})
