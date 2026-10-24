import { componentErrors, presmiumReport } from '@lincyaw/host'
import type { NavigationPosition } from '@lincyaw/host'
import { connectPreviewFrame, irBlocks, isPreviewActive, isPreviewEmbedded, PREVIEW_REVISION, stepKeys, stepTrail } from '@lincyaw/kernel'
import type { FollowAnchor, PreviewFrame } from '@lincyaw/kernel'
import type { Viewer } from '@lincyaw/viewer'
import type { Ref } from 'vue'
import { nextTick, watch } from 'vue'
import { createViewerNavigation } from './host.ts'

export interface WebPreviewOptions {
  origins: string[]
  document: string
  /** The form the page shows: its pages, or its slides. */
  renderer?: 'web' | 'slides'
}

export interface WebPreviewPage {
  viewer: Viewer
  dark: Ref<boolean>
  setActive(active: boolean): Promise<void>
}

/** What a preview dev server's theme gives the document theme (`ThemeInput.preview`). */
export interface WebPreview {
  /** False when the workbench paused the preview before the page loaded again. */
  active: boolean
  /** The page is in a workbench: it shows the document as a page, without the site's navigation. */
  embedded: boolean
  connect(page: WebPreviewPage): void
}

export function webPreview(options: WebPreviewOptions): WebPreview {
  return { active: isPreviewActive(), embedded: isPreviewEmbedded(), connect: page => connectWebPreviewFrame(page, options) }
}

function connectWebPreviewFrame(page: WebPreviewPage, options: WebPreviewOptions): void {
  const { viewer, dark } = page
  const navigation = createViewerNavigation(viewer)
  const revision = () => {
    const value = viewer.doc.value.meta[PREVIEW_REVISION]
    return typeof value === 'string' ? value : undefined
  }
  const blockStep = (section: string, block: string) => {
    const found = viewer.section(section)
    return found ? [...irBlocks(found.blocks)].find(b => b.id === block)?.at : undefined
  }
  const frame: PreviewFrame | undefined = connectPreviewFrame({
    renderer: options.renderer ?? 'web',
    document: options.document,
    origins: options.origins,
    revision,
    position() {
      const { section, step, trail, view } = navigation.position.value as NavigationPosition & FollowAnchor
      return section === undefined ? undefined : { section, step, trail: trail ?? [], ...view ? { view } : {} }
    },
    go: ({ section, step, trail, view }) => navigation.go({ slide: 0, step: step ?? 0, section, ...trail ? { trail } : {}, ...view ? { view } : {} }),
    reveal: ({ section, block }) => viewer.show({ section, step: (block && blockStep(section, block)) || 0 }),
    setDark(value) {
      dark.value = value
    },
    setActive: page.setActive,
    stepOf({ section, block }) {
      const step = blockStep(section, block)
      const found = viewer.section(section)
      return step === undefined || !found ? undefined : { step, trail: stepTrail(stepKeys(found), step) }
    },
  })
  if (!frame) return
  watch(() => navigation.position.value, () => frame.moved())
  watch(revision, () => void nextTick(() => requestAnimationFrame(() => frame.updated())))
  watchProblems(frame)
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
