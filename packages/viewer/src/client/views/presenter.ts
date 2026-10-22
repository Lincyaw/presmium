import { FocusScope } from 'reka-ui'
import { PmApprovals } from '@lincyaw/host'
import { blockText, sectionNarration } from '@lincyaw/kernel'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { nextPosition } from '../../domain/index.ts'
import { BlockView } from '../block.ts'
import { viewerMessages } from '../viewer-messages.ts'
import { useViewer } from '../viewer-state.ts'
import { useActions } from './actions.ts'
import { button, focusScope, layers, useCurrentSection, useModal, useOverlayBar, visuals } from './overlay.ts'

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const PresenterView = defineComponent({
  name: 'PmPresenterView',
  setup() {
    const viewer = useViewer()
    const { section, step } = useCurrentSection(viewer, 'presenter')
    const root = shallowRef<HTMLElement>()
    const bar = shallowRef<HTMLElement>()
    useActions(viewer, 'presenter')
    useOverlayBar(bar)
    useModal(root)
    const started = ref(Date.now())
    const now = ref(Date.now())
    let timer: ReturnType<typeof setInterval> | undefined
    onMounted(() => {
      timer = setInterval(() => now.value = Date.now(), 1000)
    })
    onBeforeUnmount(() => clearInterval(timer))

    const upcoming = computed(() => {
      const t = viewerMessages()
      const next = nextPosition(viewer.doc.value, viewer.position.value)
      if (!next) return t.presenter.end
      const target = viewer.section(next.section)!
      if (next.section !== section.value?.id) return t.presenter.nextSection(target.title)
      return sectionNarration(target).filter(block => block.at === next.step).map(blockText).join('\n') || t.presenter.nextStep(next.step)
    })

    return () => {
      const current = section.value
      if (!current) return null
      const t = viewerMessages()
      const notes = sectionNarration(current)
      return h(FocusScope, focusScope(root), () => [h('div', { 'ref': root, 'tabindex': -1, 'class': 'pm-presenter', 'data-section': current.id, 'data-step': step.value }, [
        h('div', { ref: bar, class: 'pm-presenter__bar' }, [
          h('strong', { class: 'pm-presenter__title' }, `${current.index}. ${current.title}`),
          current.steps > 0 ? h('span', { class: 'pm-presenter__counter' }, t.presenter.step(step.value, current.steps)) : null,
          h('span', { 'class': 'pm-presenter__timer', 'aria-label': t.presenter.timer }, clock(now.value - started.value)),
          button(t.presenter.restart, () => started.value = now.value = Date.now()),
          button(t.present.prev, () => viewer.prev()),
          button(t.present.next, () => viewer.next()),
          h(PmApprovals),
        ]),
        h('div', { class: 'pm-presenter__main' }, [
          h('div', { key: current.id, class: 'pm-presenter__slide' }, [h('h1', { class: 'pm-present__title' }, current.title), ...visuals(current, step.value)]),
          h('div', { class: 'pm-presenter__side' }, [
            h('p', { class: 'pm-presenter__label' }, t.presenter.notes),
            h('div', { class: 'pm-presenter__notes' }, notes.length
              ? notes.map(block => h('div', {
                  'key': block.id,
                  'class': ['pm-presenter__note', { 'pm-current': block.at === step.value }],
                  'data-step': block.at,
                  'aria-current': block.at === step.value ? 'step' : undefined,
                }, [h(BlockView, { block, section: current, step: step.value, expanded: true })]))
              : [h('p', { class: 'pm-presenter__empty' }, t.presenter.noNotes)]),
            h('p', { class: 'pm-presenter__label' }, t.presenter.upcoming),
            h('p', { class: 'pm-presenter__next' }, upcoming.value),
          ]),
        ]),
        ...layers('presenter', 'view'),
      ]), ...layers('presenter', 'viewport')])
    }
  },
})
