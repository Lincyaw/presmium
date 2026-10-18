/**
 * The preview agent of the slides form (docs/design-dsh.md 4.6): the
 * kernel's agent (`startPreviewAgent`) over the anchors the slides renderer
 * writes (each slide's section in `[data-section]`, each block in
 * `.pm-block[data-block]` with its `data-section` and `data-step`), with the
 * slides' navigation by ids, what a click has not shown yet, Slidev's dark
 * mode, and the revision of the IR that the preview's dev server sends over
 * Vite's WebSocket (`presmium:revision`). Only a preview's deck loads it,
 * from a setup of its own (render-slides); a build and `presmium dev` never
 * do. Must be called in the root setup.
 */
import { componentErrors, presmiumReport } from '@presmium/host'
import type { NavigationPosition } from '@presmium/host'
import { startPreviewAgent } from '@presmium/kernel'
import type { PreviewAgent, PreviewAnchor } from '@presmium/kernel'
import type { FollowAnchor } from '@presmium/viewer/domain'
import { useDarkMode, useNav } from '@slidev/client'
import { nextTick, watch } from 'vue'
import { createSlidevNavigation, useSlideSections } from './navigation.ts'

export interface SlidesPreviewOptions {
  /** The workbench's origins (`RenderContext.preview.origins`). */
  origins: string[]
  /** The document's directory, relative to the workspace root. */
  document: string
}

/** Slidev's documented class of a click's element that is hidden: not shown yet, or hidden again. */
const CLICK_HIDDEN = 'slidev-vclick-hidden'

/** The slide number of a slide's page element (`.slidev-page-<n>`). */
function pageNumber(element: Element | null | undefined): number | undefined {
  const name = [...element?.classList ?? []].find(name => /^slidev-page-\d+$/.test(name))
  return name ? Number(name.slice('slidev-page-'.length)) : undefined
}

export function startSlidesPreview(options: SlidesPreviewOptions): void {
  const sections = useSlideSections()
  const navigation = createSlidevNavigation(sections)
  const { isDark } = useDarkMode()
  const { currentSlideNo, clicks } = useNav()
  let revision: string | undefined
  /** Whether the dev server told the revision; until then the agent waits (its `ready` names it). */
  let told = false
  /** The step at which a block appears on its slide: the first whose trail (the slide's step keys) has it. */
  const blockStep = (section: string, block: string) => {
    const own = sections()
    const no = own.noOf(section)
    if (no === undefined || !own.anchorOf(no, Number.MAX_SAFE_INTEGER).trail?.includes(block)) return 0
    for (let step = 0; ; step++) if (own.anchorOf(no, step).trail?.includes(block)) return step
  }
  const agent: PreviewAgent | undefined = startPreviewAgent({
    renderer: 'slides',
    document: options.document,
    origins: options.origins,
    revision: () => revision,
    position() {
      const { section, step, trail } = navigation.position.value as NavigationPosition & FollowAnchor
      return section === undefined || !told ? undefined : { section, step, trail: trail ?? [] }
    },
    go: ({ section, step, trail }) => navigation.go({ slide: currentSlideNo.value, step: step ?? 0, section, ...trail ? { trail } : {} }),
    reveal: ({ section, block }) => navigation.go({ slide: currentSlideNo.value, step: block ? blockStep(section, block) : 0, section }),
    setDark(dark) {
      isDark.value = dark
    },
    sectionOf: element => sections().idOf(pageNumber(element.closest('.slidev-page')) ?? 0),
    sectionElement(section) {
      const no = sections().noOf(section)
      if (no === undefined) return undefined
      return [...document.querySelectorAll<HTMLElement>(`.slidev-page-${no} .slidev-layout`)].find(el => el.getClientRects().length > 0)
    },
    /**
     * Not what a click has not shown yet or has hidden again: a block's anchor holds the element of its click
     * (`v-click`), hidden with it; a list whose items come one by one is hidden before its first item's click.
     */
    seen(element) {
      if (element.closest(`.${CLICK_HIDDEN}`)) return false
      const block = element.closest<HTMLElement>('.pm-block[data-step]')
      if (!block) return true
      if ([...block.children].some(child => child.classList.contains(CLICK_HIDDEN))) return false
      return pageNumber(block.closest('.slidev-page')) !== currentSlideNo.value || Number(block.dataset.step) <= clicks.value
    },
    /** The click a block appears at on its slide, and the trail of that click (the keys of the slide's steps, D-4). */
    stepOf({ section, block }: Required<PreviewAnchor>) {
      const no = sections().noOf(section)
      if (no === undefined) return undefined
      const step = blockStep(section, block)
      return { step, trail: sections().anchorOf(no, step).trail ?? [] }
    },
  })
  if (!agent) return
  // The slides' text can be selected in a preview, for the workbench's `selection` (Slidev's play mode cannot).
  const style = document.createElement('style')
  style.textContent = '.slidev-layout { user-select: text; }'
  document.head.append(style)
  watch(() => navigation.position.value, () => agent.moved())
  // A new slide renders its blocks: the highlight and the pins are drawn on them.
  watch([currentSlideNo, clicks], () => void nextTick(agent.redraw))
  watchProblems(agent)
  // The revision of the slides shown, from the preview's dev server (its Vite plugin); asked for once connected.
  const hot = import.meta.hot
  hot?.on('presmium:revision', (data: { revision?: string }) => {
    revision = typeof data?.revision === 'string' ? data.revision : undefined
    if (!told) {
      told = true
      return agent.moved()
    }
    // Slidev has updated the slides that changed by now (the server sends the revision after them).
    requestAnimationFrame(() => requestAnimationFrame(() => agent.updated()))
  })
  hot?.send('presmium:preview', {})
  // A dev server that does not answer: the agent starts without a revision.
  setTimeout(() => {
    if (told) return
    told = true
    agent.moved()
  }, 5000)
}

/** The plugins that failed to start and the components' errors, each reported once as it comes. */
function watchProblems(agent: PreviewAgent): void {
  const told = new Set<string>()
  watch(() => [presmiumReport()?.plugins ?? [], componentErrors()] as const, ([plugins, errors]) => {
    const problems = [
      ...plugins.filter(p => p.status === 'failed' || p.status === 'disabled').map(p => ({ level: p.status === 'failed' ? 'error' as const : 'warning' as const, plugin: p.id, message: p.reason ?? p.status })),
      ...errors.map(e => ({ level: 'error' as const, plugin: e.component, message: e.message })),
    ]
    for (const problem of problems) {
      const key = JSON.stringify(problem)
      if (told.has(key)) continue
      told.add(key)
      agent.report(problem)
    }
  }, { immediate: true })
}
