import { componentErrors, presmiumReport } from '@lincyaw/host'
import type { NavigationPosition } from '@lincyaw/host'
import { irBlocks, PREVIEW_REVISION, startPreviewAgent, stepKeys, stepTrail } from '@lincyaw/kernel'
import type { PreviewAgent } from '@lincyaw/kernel'
import type { FollowAnchor, Viewer } from '@lincyaw/viewer'
import type { Ref } from 'vue'
import { nextTick, watch } from 'vue'
import { createViewerNavigation } from './host.ts'

export interface WebPreviewOptions {
  origins: string[]
  document: string
}

export interface WebPreviewPage {
  viewer: Viewer
  dark: Ref<boolean>
}

export function startWebPreview(page: WebPreviewPage, options: WebPreviewOptions): void {
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
  const agent: PreviewAgent | undefined = startPreviewAgent({
    renderer: 'web',
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
    stepOf({ section, block }) {
      const step = blockStep(section, block)
      const found = viewer.section(section)
      return step === undefined || !found ? undefined : { step, trail: stepTrail(stepKeys(found), step) }
    },
  })
  if (!agent) return
  watch(() => navigation.position.value, () => agent.moved())
  watch(revision, () => void nextTick(() => requestAnimationFrame(() => agent.updated())))
  watchProblems(agent)
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
