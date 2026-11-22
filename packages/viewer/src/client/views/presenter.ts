import { FocusScope } from '@radix-ui/react-focus-scope'
import { PmApprovals, useAudienceRemote } from '@lincyaw/host'
import { blockText, sectionNarration, stepScript } from '@lincyaw/kernel'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '@lincyaw/host'
import { h } from '../element.ts'
import { nextPosition } from '../../domain/index.ts'
import { BlockView } from '../block.ts'
import { viewerMessages } from '../viewer-messages.ts'
import { useViewer } from '../viewer-state.ts'
import { useActions } from './actions.ts'
import { button, layers, useCurrentSection, useModal, useOverlayBar } from './overlay.ts'
import { SlideFace, SlideFit, useSlides } from './slide.ts'
import { captionsControl } from './remote.ts'
import type { CaptionsControl } from './remote.ts'

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
    useModal(root, viewer.options.embedded)
    const [started, setStarted] = useState(Date.now)
    const [now, setNow] = useState(Date.now)
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
    const { shape } = useSlides()
    const doc = useStore(viewer.doc)
    const position = useStore(viewer.position)
    const following = nextPosition(doc, position)
    const t = viewerMessages()
    const [captions, toggleCaptions] = useAudienceRemote<CaptionsControl>(captionsControl(doc))
    const target = following ? viewer.section(following.section) : undefined
    const upcoming = !following ? t.presenter.end : following.section !== section?.id ? t.presenter.nextSection(target!.title) : stepScript(target!).find(entry => entry.step === following.step)?.text || sectionNarration(target!).filter(block => block.at === following.step).map(blockText).join('\n') || t.presenter.nextStep(following.step)
      const current = section
      if (!current) return null
      // The script written for each step, as the slides' speaker notes are; narration blocks of the older format otherwise.
      const script = stepScript(current)
      const note = (key: string, at: number, content: ReactNode) => h('div', {
        'key': key,
        'class': ['pm-presenter__note', { 'pm-current': at === step }],
        'data-step': at,
        'aria-current': at === step ? 'step' : undefined,
      }, content)
      const notes = script.length
        ? script.map(entry => note(`step-${entry.step}`, entry.step, entry.text.split('\n').map((line, i) => h('p', { key: i }, line))))
        : sectionNarration(current).map(block => note(block.id, block.at, [h(BlockView, { block, section: current, step: step, expanded: true })]))
      return h(FocusScope, { trapped: !viewer.options.embedded, loop: !viewer.options.embedded, asChild: true,
        onMountAutoFocus: (event: Event) => { if (viewer.options.embedded) event.preventDefault() },
        onUnmountAutoFocus: (event: Event) => { if (viewer.options.embedded) event.preventDefault() },
      }, h('div', null, [h('div', { 'ref': root, 'tabindex': -1, 'class': 'pm-presenter', 'data-section': current.id, 'data-step': step }, [
        h('div', { ref: bar, class: 'pm-presenter__bar' }, [
          h('strong', { class: 'pm-presenter__title' }, `${current.index}. ${current.title}`),
          current.steps > 0 ? h('span', { class: 'pm-presenter__counter' }, t.presenter.step(step, current.steps)) : null,
          h('span', { 'class': 'pm-presenter__timer', 'aria-label': t.presenter.timer }, clock(now - started)),
          button(t.presenter.restart, () => { const time = Date.now(); setStarted(time); setNow(time) }, 'redo'),
          button(t.present.prev, () => viewer.prev(), 'chevron-left', 'ArrowLeft'),
          button(t.present.next, () => viewer.next(), 'chevron-right', 'ArrowRight'),
          ...layers('presenter', 'bar'),
          captions ? button(t.present.captions, () => toggleCaptions('captions'), 'captions', undefined, { 'aria-pressed': captions.on }) : null,
          h(PmApprovals),
        ]),
        h('div', { class: 'pm-presenter__main' }, [
          h('div', { class: 'pm-presenter__slide' }, h(SlideFit, { shape: shape }, h(SlideFace, { key: current.id, section: current, step: step, view: 'presenter' }))),
          h('div', { class: 'pm-presenter__side' }, [
            h('p', { class: 'pm-presenter__label' }, t.presenter.notes),
            h('div', { class: 'pm-presenter__notes' }, notes.length ? notes : [h('p', { class: 'pm-presenter__empty' }, t.presenter.noNotes)]),
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
