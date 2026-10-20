import { componentErrors, presmiumReport } from '@lincyaw/host'
import type { NavigationPosition } from '@lincyaw/host'
import { startPreviewAgent } from '@lincyaw/kernel'
import type { PreviewAgent, PreviewAnchor } from '@lincyaw/kernel'
import type { FollowAnchor } from '@lincyaw/viewer/domain'
import { useDarkMode, useNav } from '@slidev/client'
import { nextTick, watch } from 'vue'
import { createSlidevNavigation, useSlideSections } from './navigation.ts'

export interface SlidesPreviewOptions {
  origins: string[]
  document: string
}

const CLICK_HIDDEN = 'slidev-vclick-hidden'

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
  let told = false
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
    seen(element) {
      if (element.closest(`.${CLICK_HIDDEN}`)) return false
      const block = element.closest<HTMLElement>('.pm-block[data-step]')
      if (!block) return true
      if ([...block.children].some(child => child.classList.contains(CLICK_HIDDEN))) return false
      return pageNumber(block.closest('.slidev-page')) !== currentSlideNo.value || Number(block.dataset.step) <= clicks.value
    },
    stepOf({ section, block }: Required<PreviewAnchor>) {
      const no = sections().noOf(section)
      if (no === undefined) return undefined
      const step = blockStep(section, block)
      return { step, trail: sections().anchorOf(no, step).trail ?? [] }
    },
  })
  if (!agent) return
  const style = document.createElement('style')
  style.textContent = '.slidev-layout { user-select: text; }'
  document.head.append(style)
  watch(() => navigation.position.value, () => agent.moved())
  watch([currentSlideNo, clicks], () => void nextTick(agent.redraw))
  watchProblems(agent)
  const hot = import.meta.hot
  hot?.on('presmium:revision', (data: { revision?: string }) => {
    revision = typeof data?.revision === 'string' ? data.revision : undefined
    if (!told) {
      told = true
      return agent.moved()
    }
    requestAnimationFrame(() => requestAnimationFrame(() => agent.updated()))
  })
  hot?.send('presmium:preview', {})
  setTimeout(() => {
    if (told) return
    told = true
    agent.moved()
  }, 5000)
}

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
