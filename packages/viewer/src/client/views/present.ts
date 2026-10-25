import { FocusScope } from '@radix-ui/react-focus-scope'
import { PmApprovals, PmIcon, PmMenu } from '@lincyaw/host'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@lincyaw/host'
import { h } from '../element.ts'
import { viewerMessages } from '../viewer-messages.ts'
import { useViewer } from '../viewer-state.ts'
import type { Viewer } from '../viewer-state.ts'
import { overviewOpen, useActions } from './actions.ts'
import { button, layers, useCurrentSection, useModal, useOverlayBar } from './overlay.ts'
import { SlideFace, SlideFit, useSlides } from './slide.ts'

function moveInOverview(root: HTMLElement | null | undefined, key: string): boolean {
  const items = [...root?.querySelectorAll<HTMLElement>('.pm-overview__item') ?? []]
  if (!items.length) return false
  const at = Math.max(items.indexOf(document.activeElement as HTMLElement), 0)
  const columns = items.filter(item => item.offsetTop === items[0]!.offsetTop).length
  const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns, Home: -at, End: items.length }
  if (!(key in moves)) return false
  items[Math.min(Math.max(at + moves[key]!, 0), items.length - 1)]!.focus()
  return true
}

/** The slides form's way out: a link to the same place on the document's page, when there is one. */
function pageLink(viewer: Viewer) {
  const link = viewer.options.pageLink?.(viewer.position.getSnapshot())
  return link ? h('a', { 'class': 'pm-ui-icon-button pm-ui-icon-button--small', 'href': link.href, 'aria-label': link.label, 'title': link.label }, [h(PmIcon, { name: 'document' })]) : null
}

export function PresentView() {
    const viewer = useViewer()
    const { section, step } = useCurrentSection(viewer, 'present')
    const root = useRef<HTMLDivElement>(null)
    const bar = useRef<HTMLDivElement>(null)
    const { shape } = useSlides()
    useOverlayBar(bar)
    const ownsFullscreen = useRef(false)
    const [fullscreen, setFullscreen] = useState(false)
    const overview = useStore(overviewOpen)
    const doc = useStore(viewer.doc)
    const position = useStore(viewer.position)
    const pageView = useStore(viewer.pageView)
    const syncFullscreen = () => { setFullscreen(Boolean(document.fullscreenElement)) }
    const enterFullscreen = () => {
      if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {})
      void document.documentElement.requestFullscreen().then(() => {
        if (!root.current) return document.exitFullscreen()
        ownsFullscreen.current = true
      }).catch(() => {})
    }
    const closeOverview = () => {
      overviewOpen.set(false)
      root.current?.focus()
    }
    useActions(viewer, 'present', [{ id: 'fullscreen', keys: ['F'], run: enterFullscreen }])
    const onOverviewKey = (event: KeyboardEvent) => {
      if (!overview || event.key === 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      event.stopImmediatePropagation()
      if (event.key === 'Escape' || event.key === 'o') closeOverview()
      else if (!moveInOverview(root.current, event.key)) return
      event.preventDefault()
    }
    useModal(root)
    useEffect(() => {
      window.addEventListener('keydown', onOverviewKey, { capture: true })
      document.addEventListener('fullscreenchange', syncFullscreen)
      return () => {
      window.removeEventListener('keydown', onOverviewKey, { capture: true })
      document.removeEventListener('fullscreenchange', syncFullscreen)
      }
    }, [overview])
    useEffect(() => () => { overviewOpen.set(false); if (ownsFullscreen.current && document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {}) }, [])
    useEffect(() => { if (overview) root.current?.querySelector<HTMLElement>('.pm-overview__item[aria-current="true"]')?.focus() }, [overview])
    const jump = (id: string) => {
      viewer.go({ section: id, step: 0 })
      closeOverview()
    }

      const current = section
      if (!current) return null
      const t = viewerMessages()
      const { sections } = doc
      return h(FocusScope, { trapped: true, loop: true, asChild: true }, h('div', null, [h('div', {
        'ref': root,
        'class': 'pm-present',
        'role': 'region',
        'aria-label': t.present.region,
        'tabindex': -1,
        'data-section': current.id,
        'data-step': step,
      }, [
        h('div', { class: 'pm-present__slide' }, [
          h(SlideFit, { shape: shape }, h(SlideFace, { key: current.id, section: current, step: step })),
          overview
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
          h('span', { 'class': 'pm-present__counter', 'title': t.present.counter(current.index, sections.length, step, current.steps) }, `${current.index} / ${sections.length}${current.steps > 0 ? ` · ${step + 1} / ${current.steps + 1}` : ''}`),
          button(t.present.prev, () => viewer.prev(), 'chevron-left', 'ArrowLeft'),
          button(t.present.next, () => viewer.next(), 'chevron-right', 'ArrowRight'),
          current.steps > 0 ? h(PmMenu, { label: t.present.jumpStep, icon: 'steps', placement: 'above-start', items: Array.from({ length: current.steps + 1 }, (_, k) => ({ id: String(k), label: t.present.step(k + 1), icon: k === step ? 'check' as const : undefined })), onSelect: (id: string) => viewer.go({ section: current.id, step: Number(id) }) }) : null,
          h('button', { 'type': 'button', 'class': 'pm-ui-icon-button pm-ui-icon-button--small pm-present__narrate', 'data-narration-section': current.id, 'data-narration-step': step, 'aria-label': t.contentRoles.narration, 'title': t.contentRoles.narration }, [h(PmIcon, { name: 'captions' })]),
          button(t.present.overview, () => overviewOpen.set(!overview), 'overview', 'o', { 'aria-pressed': overview }),
          viewer.options.openPresenter ? button(t.present.presenter, () => viewer.options.openPresenter!(position), 'slides', 'p') : null,
          button(fullscreen ? t.present.exitFullscreen : t.present.fullscreen, enterFullscreen, fullscreen ? 'exit-fullscreen' : 'fullscreen', 'Shift+F', { 'aria-pressed': fullscreen }),
          viewer.options.slidesOnly ? pageLink(viewer) : button(t.present.exit, () => viewer.setView(pageView), 'close', 'Escape'),
          ...layers('present', 'bar'),
          h(PmApprovals, { placement: 'above' }),
        ]),
        ...layers('present', 'view'),
      ]), ...layers('present', 'viewport')]))
}
