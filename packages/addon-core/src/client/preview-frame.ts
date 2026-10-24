import { componentErrors, presmiumReport } from '@lincyaw/host'
import type { NavigationPosition } from '@lincyaw/host'
import { connectPreviewFrame } from '@lincyaw/kernel'
import type { FollowAnchor, PreviewAnchor, PreviewFrame } from '@lincyaw/kernel'
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

export function connectSlidesPreviewFrame(options: SlidesPreviewOptions): void {
  const sections = useSlideSections()
  const navigation = createSlidevNavigation(sections)
  const { isDark } = useDarkMode()
  const { currentSlideNo, clicks } = useNav()
  let irRevision: string | undefined
  let told = false
  const blockStep = (section: string, block: string) => {
    const own = sections()
    const no = own.noOf(section)
    if (no === undefined || !own.anchorOf(no, Number.MAX_SAFE_INTEGER).trail?.includes(block)) return 0
    for (let step = 0; ; step++) if (own.anchorOf(no, step).trail?.includes(block)) return step
  }
  const frame: PreviewFrame | undefined = connectPreviewFrame({
    renderer: 'slides',
    document: options.document,
    origins: options.origins,
    revision: () => irRevision,
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
  if (!frame) return
  const style = document.createElement('style')
  // In a workbench the slide lies on the editor's canvas: no letterbox, and the workbench has its own navigation.
  style.textContent = [
    '.slidev-layout { user-select: text; }',
    ':root { --slidev-slide-container-background: var(--pm-color-canvas); }',
    '#slide-container > div:has(> nav) { display: none !important; }',
  ].join('\n')
  document.head.append(style)
  watch(() => navigation.position.value, () => frame.moved())
  watch([currentSlideNo, clicks], () => void nextTick(frame.redraw))
  watchProblems(frame)
  const hot = import.meta.hot
  hot?.on('presmium:revision', (data: { revision?: string }) => {
    irRevision = typeof data?.revision === 'string' ? data.revision : undefined
    if (!told) {
      told = true
      return frame.moved()
    }
    requestAnimationFrame(() => requestAnimationFrame(() => frame.updated()))
  })
  hot?.send('presmium:preview', {})
  setTimeout(() => {
    if (told) return
    told = true
    frame.moved()
  }, 5000)
}

function watchProblems(frame: PreviewFrame): void {
  let told = new Map<string, { level: 'error' | 'warning', plugin: string, message: string }>()
  watch(() => [presmiumReport()?.plugins ?? [], componentErrors()] as const, ([plugins, errors]) => {
    const problems = [
      ...plugins.filter(p => p.status === 'failed' || p.status === 'disabled').map(p => ({ level: p.status === 'failed' ? 'error' as const : 'warning' as const, plugin: p.id, message: p.reason ?? p.status })),
      ...errors.map(e => ({ level: 'error' as const, plugin: e.component, message: e.message })),
    ]
    const current = new Map(problems.map(problem => [JSON.stringify(problem), problem]))
    for (const [key, problem] of told) if (!current.has(key)) frame.report({ ...problem, resolved: true })
    for (const [key, problem] of current) if (!told.has(key)) frame.report(problem)
    told = current
  }, { immediate: true })
}
