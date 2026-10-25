import { FocusScope } from '@radix-ui/react-focus-scope'
import { PmApprovals } from '@lincyaw/host'
import { blockText, sectionNarration } from '@lincyaw/kernel'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@lincyaw/host'
import { h } from '../element.ts'
import { nextPosition } from '../../domain/index.ts'
import { BlockView } from '../block.ts'
import { viewerMessages } from '../viewer-messages.ts'
import { useViewer } from '../viewer-state.ts'
import { useActions } from './actions.ts'
import { button, layers, useCurrentSection, useModal, useOverlayBar } from './overlay.ts'
import { SlideFace, SlideFit, useSlides } from './slide.ts'

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function PresenterView() {
    const viewer = useViewer()
    const { section, step } = useCurrentSection(viewer, 'presenter')
    const root = useRef<HTMLDivElement>(null)
    const bar = useRef<HTMLDivElement>(null)
    useActions(viewer, 'presenter')
    useOverlayBar(bar)
    useModal(root)
    const [started, setStarted] = useState(Date.now)
    const [now, setNow] = useState(Date.now)
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
    const { shape } = useSlides()
    const doc = useStore(viewer.doc)
    const position = useStore(viewer.position)
    const following = nextPosition(doc, position)
    const t = viewerMessages()
    const target = following ? viewer.section(following.section) : undefined
    const upcoming = !following ? t.presenter.end : following.section !== section?.id ? t.presenter.nextSection(target!.title) : sectionNarration(target!).filter(block => block.at === following.step).map(blockText).join('\n') || t.presenter.nextStep(following.step)
      const current = section
      if (!current) return null
      const notes = sectionNarration(current)
      return h(FocusScope, { trapped: true, loop: true, asChild: true }, h('div', null, [h('div', { 'ref': root, 'tabindex': -1, 'class': 'pm-presenter', 'data-section': current.id, 'data-step': step }, [
        h('div', { ref: bar, class: 'pm-presenter__bar' }, [
          h('strong', { class: 'pm-presenter__title' }, `${current.index}. ${current.title}`),
          current.steps > 0 ? h('span', { class: 'pm-presenter__counter' }, t.presenter.step(step, current.steps)) : null,
          h('span', { 'class': 'pm-presenter__timer', 'aria-label': t.presenter.timer }, clock(now - started)),
          button(t.presenter.restart, () => { const time = Date.now(); setStarted(time); setNow(time) }, 'redo'),
          button(t.present.prev, () => viewer.prev(), 'chevron-left', 'ArrowLeft'),
          button(t.present.next, () => viewer.next(), 'chevron-right', 'ArrowRight'),
          ...layers('presenter', 'bar'),
          h(PmApprovals),
        ]),
        h('div', { class: 'pm-presenter__main' }, [
          h('div', { class: 'pm-presenter__slide' }, h(SlideFit, { shape: shape }, h(SlideFace, { key: current.id, section: current, step: step, view: 'presenter' }))),
          h('div', { class: 'pm-presenter__side' }, [
            h('p', { class: 'pm-presenter__label' }, t.presenter.notes),
            h('div', { class: 'pm-presenter__notes' }, notes.length
              ? notes.map(block => h('div', {
                  'key': block.id,
                  'class': ['pm-presenter__note', { 'pm-current': block.at === step }],
                  'data-step': block.at,
                  'aria-current': block.at === step ? 'step' : undefined,
                }, [h(BlockView, { block, section: current, step: step, expanded: true })]))
              : [h('p', { class: 'pm-presenter__empty' }, t.presenter.noNotes)]),
            h('p', { class: 'pm-presenter__label' }, t.presenter.upcoming),
            following
              ? h('div', { class: 'pm-presenter__upcoming', inert: '' }, h(SlideFit, { shape: shape }, h(SlideFace, { key: `${following!.section}@${following!.step}`, section: viewer.section(following!.section)!, step: following!.step, view: 'presenter-next' })))
              : null,
            h('p', { class: 'pm-presenter__next' }, upcoming),
          ]),
        ]),
        ...layers('presenter', 'view'),
      ]), ...layers('presenter', 'viewport')]))
}
