/**
 * The present view (P-77): full screen, one section at a time, step by step,
 * driven by the keyboard; and the presenter window, which shows the narration
 * of the current step, a preview of the next one and a timer. Windows of the
 * same document in these views follow each other (see `createViewer`).
 */
import type { IRSection } from '@presmium/kernel'
import type { Ref } from 'vue'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue'
import { BlockView } from './block.ts'
import { SECTION_CONTEXT } from './context.ts'
import { blockText, narrationAt, nextPosition } from './domain/index.ts'
import { useViewer } from './viewer.ts'
import type { Viewer } from './viewer.ts'

const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' '])
const PREV = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])

/** Keyboard navigation while the view is shown; `extra` handles the other keys. */
function useKeys(viewer: Viewer, extra?: (key: string) => boolean): void {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return
    const { sections } = viewer.doc.value
    let handled = true
    if (NEXT.has(event.key)) viewer.next()
    else if (PREV.has(event.key)) viewer.prev()
    else if (event.key === 'Home') viewer.go({ section: sections[0]?.id ?? '', step: 0 })
    else if (event.key === 'End') viewer.go({ section: sections.at(-1)?.id ?? '', step: Number.POSITIVE_INFINITY })
    else handled = extra?.(event.key) ?? false
    if (handled) event.preventDefault()
  }
  onMounted(() => {
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('pm-presenting')
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    document.documentElement.classList.remove('pm-presenting')
  })
}

/** The current section and step, given to the components inside as `SECTION_CONTEXT`. */
function useCurrent(viewer: Viewer) {
  const section = computed(() => viewer.section(viewer.position.value.section))
  const step = computed(() => viewer.position.value.step)
  // Rendered only while the section exists.
  provide(SECTION_CONTEXT, { section: section as Readonly<Ref<IRSection>>, step })
  return { section, step }
}

function visuals(section: IRSection, step: number) {
  return section.blocks.filter(b => b.role === 'visual').map(block => h(BlockView, { key: `${section.id}/${block.id}`, block, section, step }))
}

function button(label: string, onClick: () => void) {
  return h('button', { type: 'button', class: 'pm-present__button', onClick }, label)
}

export const PresentView = defineComponent({
  name: 'PmPresentView',
  setup() {
    const viewer = useViewer()
    const { section, step } = useCurrent(viewer)
    const root = shallowRef<HTMLElement>()
    const presenter = () => viewer.options.openPresenter?.(viewer.position.value)
    useKeys(viewer, (key) => {
      if (key === 'Escape') viewer.setView(viewer.pageView.value)
      else if (key === 'p') presenter()
      else return false
      return true
    })
    onMounted(() => root.value?.focus())
    return () => {
      const current = section.value
      if (!current) return null
      const total = viewer.doc.value.sections.length
      return h('div', {
        'ref': root,
        'class': 'pm-present',
        'role': 'region',
        'aria-label': '放映',
        'tabindex': -1,
        'data-section': current.id,
        'data-step': step.value,
      }, [
        h('div', { key: current.id, class: 'pm-present__slide' }, [
          h('h1', { class: 'pm-present__title' }, current.title),
          ...visuals(current, step.value),
        ]),
        h('div', { class: 'pm-present__bar' }, [
          h('span', { class: 'pm-present__counter' }, `${current.index} / ${total} · 第 ${step.value} 步，共 ${current.steps} 步`),
          button('上一步', () => viewer.prev()),
          button('下一步', () => viewer.next()),
          viewer.options.openPresenter ? button('演讲者窗口', presenter) : null,
          button('全屏', () => void root.value?.requestFullscreen?.().catch(() => {})),
          button('退出放映', () => viewer.setView(viewer.pageView.value)),
        ]),
      ])
    }
  },
})

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const PresenterView = defineComponent({
  name: 'PmPresenterView',
  setup() {
    const viewer = useViewer()
    const { section, step } = useCurrent(viewer)
    useKeys(viewer)
    const started = ref(Date.now())
    const now = ref(Date.now())
    let timer: ReturnType<typeof setInterval> | undefined
    onMounted(() => {
      timer = setInterval(() => now.value = Date.now(), 1000)
    })
    onBeforeUnmount(() => clearInterval(timer))

    /** What comes next: the narration of the next step, or the next section. */
    const upcoming = computed(() => {
      const next = nextPosition(viewer.doc.value, viewer.position.value)
      if (!next) return '已到结尾'
      const target = viewer.section(next.section)!
      if (next.section !== section.value?.id) return `下一节：${target.title}`
      return narrationAt(target, next.step).map(blockText).join('\n') || `第 ${next.step} 步`
    })

    return () => {
      const current = section.value
      if (!current) return null
      const notes = current.blocks.filter(b => b.role === 'narration')
      return h('div', { 'class': 'pm-presenter', 'data-section': current.id, 'data-step': step.value }, [
        h('div', { class: 'pm-presenter__bar' }, [
          h('strong', { class: 'pm-presenter__title' }, `${current.index}. ${current.title}`),
          h('span', { class: 'pm-presenter__counter' }, `第 ${step.value} 步，共 ${current.steps} 步`),
          h('span', { 'class': 'pm-presenter__timer', 'aria-label': '计时' }, clock(now.value - started.value)),
          button('重新计时', () => started.value = now.value = Date.now()),
          button('上一步', () => viewer.prev()),
          button('下一步', () => viewer.next()),
        ]),
        h('div', { class: 'pm-presenter__main' }, [
          h('div', { key: current.id, class: 'pm-presenter__slide' }, visuals(current, step.value)),
          h('div', { class: 'pm-presenter__side' }, [
            h('p', { class: 'pm-presenter__label' }, '讲解'),
            h('div', { class: 'pm-presenter__notes' }, notes.length
              ? notes.map(block => h('div', {
                  'key': block.id,
                  'class': ['pm-presenter__note', { 'pm-current': block.at === step.value }],
                  'data-step': block.at,
                  'aria-current': block.at === step.value ? 'step' : undefined,
                }, [h(BlockView, { block, section: current, step: step.value, expanded: true })]))
              : [h('p', { class: 'pm-presenter__empty' }, '本节没有讲解')]),
            h('p', { class: 'pm-presenter__label' }, '下一步'),
            h('p', { class: 'pm-presenter__next' }, upcoming.value),
          ]),
        ]),
      ])
    }
  },
})
