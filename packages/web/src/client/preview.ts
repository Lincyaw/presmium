/**
 * The preview agent of the web form (docs/design-dsh.md 4.6): the kernel's
 * agent (`startPreviewAgent`) over the IR runtime's anchors
 * (`.pm-section[data-section]`, `.pm-block[data-block]`), with the IR
 * runtime's position and navigation (the form's `navigation` service), the
 * appearance switch of the navigation bar, and the revision of the IR the
 * viewer shows (`PREVIEW_REVISION`, which the workspace service writes).
 * Only the pages of a preview's dev server load it (the generated theme
 * imports it, ../node/site.ts); a build and `presmium dev` never do.
 */
import { componentErrors, presmiumReport } from '@presmium/host'
import type { NavigationPosition } from '@presmium/host'
import { irBlocks, PREVIEW_REVISION, startPreviewAgent } from '@presmium/kernel'
import type { PreviewAgent } from '@presmium/kernel'
import type { FollowAnchor, Viewer } from '@presmium/viewer'
import type { Ref } from 'vue'
import { nextTick, watch } from 'vue'
import { createViewerNavigation } from './host.ts'

export interface WebPreviewOptions {
  /** The workbench's origins (`RenderContext.preview.origins`). */
  origins: string[]
  /** The document's directory, relative to the workspace root. */
  document: string
}

/** What the theme gives the agent once its layout has mounted. */
export interface WebPreviewPage {
  viewer: Viewer
  /** The navigation bar's appearance switch. */
  dark: Ref<boolean>
}

export function startWebPreview(page: WebPreviewPage, options: WebPreviewOptions): void {
  const { viewer, dark } = page
  const navigation = createViewerNavigation(viewer)
  const revision = () => {
    const value = viewer.doc.value.meta[PREVIEW_REVISION]
    return typeof value === 'string' ? value : undefined
  }
  /** The step a block appears at in the viewer's document. */
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
    stepOf: anchor => (anchor.block ? blockStep(anchor.section, anchor.block) : undefined),
  })
  if (!agent) return
  watch(() => navigation.position.value, () => agent.moved())
  // The page shows a new IR once it has rendered it.
  watch(revision, () => void nextTick(() => requestAnimationFrame(() => agent.updated())))
  watchProblems(agent)
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
