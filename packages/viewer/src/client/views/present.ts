import { FocusScope } from '@radix-ui/react-focus-scope'
import { PmApprovals, PmCaption, PmCaptionProvider, PmIcon, TIMED_CAPTIONS, useService, PLAYBACK_CONTROL, presmiumService } from '@lincyaw/host'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@lincyaw/host'
import { h } from '../element.ts'
import { viewerMessages } from '../viewer-messages.ts'
import { useViewer, presentationConfirmed } from '../viewer-state.ts'
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
    const [captionContainer, setCaptionContainer] = useState<HTMLDivElement | null>(null)
    const { shape } = useSlides()
    useOverlayBar(bar)
    const ownsFullscreen = useRef(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [captions, setCaptions] = useState(true)
    const timedCaptions = useStore(useService(TIMED_CAPTIONS)?.active, false)
    const overview = useStore(overviewOpen)
    const doc = useStore(viewer.doc)
    useStore(viewer.options.confirmedRevision)
    const pending = !presentationConfirmed(viewer)
    useEffect(() => { if (pending) { overviewOpen.set(false); presmiumService(PLAYBACK_CONTROL)?.pause() } }, [pending])
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
      if (pending || !overview || event.key === 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      event.stopImmediatePropagation()
      if (event.key === 'Escape' || event.key === 'o') closeOverview()
      else if (!moveInOverview(root.current, event.key)) return
      event.preventDefault()
    }
    useModal(root, viewer.options.embedded)
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
      const stepId = current.stepIds?.[step]
      const narration = stepId ? current.stepNarrations?.[stepId] ?? [] : []
      const hasNarration = sections.some(section => Object.values(section.stepNarrations ?? {}).some(lines => lines.some(line => line.text.trim())))
      return h(PmCaptionProvider, { container: captionContainer }, h(FocusScope, { trapped: !viewer.options.embedded, loop: !viewer.options.embedded, asChild: true,
        onMountAutoFocus: (event: Event) => { if (viewer.options.embedded) event.preventDefault() },
        onUnmountAutoFocus: (event: Event) => { if (viewer.options.embedded) event.preventDefault() },
      }, h('div', null, [h('div', {
        'ref': root,
        'class': 'pm-present',
        'role': 'region',
        'aria-label': t.present.region,
        'tabindex': -1,
        'data-section': current.id,
        'data-step': step,
        'data-pending-confirmation': pending || undefined,
      }, [
        h('div', { class: 'pm-present__slide', inert: pending ? '' : undefined, 'aria-hidden': pending || undefined }, [
          h(SlideFit, { shape: shape, overlay: h('div', { ref: setCaptionContainer, className: 'pm-present__captions' }) }, h(SlideFace, { key: current.id, section: current, step: step })),
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
        !pending && captions && !timedCaptions && narration.some(item => item.text.trim()) ? h(PmCaption, { overlay: true, label: t.present.captions, lines: narration.map(item => item.text).filter(text => text.trim()), lang: doc.meta.lang }) : null,
        h('div', { ref: bar, class: 'pm-present__bar', hidden: viewer.options.externalControls || undefined }, [
          button(t.present.prev, () => viewer.prev(), 'chevron-left', 'ArrowLeft', { className: 'pm-present__previous', disabled: pending }),
          button(t.present.next, () => viewer.next(), 'chevron-right', 'ArrowRight', { className: 'pm-present__next', disabled: pending }),
          ...pending ? [] : layers('present', 'bar'),
          hasNarration && !timedCaptions ? button(t.present.captions, () => setCaptions(value => !value), 'captions', undefined, { 'aria-pressed': captions, disabled: pending }) : null,
          button(t.present.overview, () => overviewOpen.set(!overview), 'overview', 'o', { disabled: pending, 'aria-pressed': overview, className: 'pm-present__overview' }),
          viewer.options.openPresenter ? button(t.present.presenter, () => viewer.options.openPresenter!(position), 'slides', 'p', { className: 'pm-present__presenter', disabled: pending }) : null,
          viewer.options.refreshPresentation ? button(t.present.refresh, () => viewer.options.refreshPresentation!(), 'refresh') : null,
          button(fullscreen ? t.present.exitFullscreen : t.present.fullscreen, enterFullscreen, fullscreen ? 'exit-fullscreen' : 'fullscreen', 'Shift+F', { 'aria-pressed': fullscreen, disabled: pending }),
          viewer.options.slidesOnly ? pageLink(viewer) : button(t.present.exit, () => viewer.options.exitPresentation ? viewer.options.exitPresentation() : viewer.setView(pageView), 'close', 'Escape'),
          pending ? null : h(PmApprovals, { placement: 'above' }),
        ]),
        ...pending ? [] : layers('present', 'view'),
      ]), ...pending ? [] : layers('present', 'viewport')])))
}
