import { presmiumReport, presmiumService } from '@presmium/host'
import type { HostAdapter, Navigation, ViewRole } from '@presmium/host'
import type { PresentationMode } from '@presmium/kernel'
import { FINAL_STEP, getView, useSectionContext } from '@presmium/viewer'
import type { Viewer } from '@presmium/viewer'
import { computed, readonly, ref } from 'vue'
import type { SharedStates } from './shared.ts'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export interface ViewerHostOptions {
  /** The site language, for the server render. */
  lang: string
  shared: SharedStates
}

/**
 * Host adapter of the web form, fed by the IR runtime: the step of a
 * component is its section's step (every step reached in the document view;
 * the IR runtime gives each block its step scope), the cursor is the
 * enclosing section and its step, and the role follows the view (reader,
 * audience of the present view, presenter window). A section's `{config}`
 * comes with its IR section. The web form renders no static copies.
 */
export function createViewerHost(viewer: Viewer, options: ViewerHostOptions): HostAdapter {
  const overlay = () => getView(viewer.view.value)?.kind === 'overlay'
  const role = computed((): ViewRole => (viewer.view.value === 'presenter' ? 'presenter' : overlay() ? 'audience' : 'reader'))
  const staticRender = readonly(ref(false))
  return {
    get mode(): PresentationMode {
      return overlay() ? 'slides' : 'document'
    },
    lang: options.lang,
    useCursor() {
      const section = useSectionContext()
      return computed(() => {
        if (section) return { slide: section.section.value.index, step: section.step.value }
        const { position } = viewer
        return { slide: viewer.section(position.value.section)?.index ?? 1, step: position.value.step }
      })
    },
    useStep() {
      const section = useSectionContext()
      return computed(() => section?.step.value ?? FINAL_STEP)
    },
    useViewRole: () => role,
    useStaticRender: () => staticRender,
    useSectionConfig(pluginId) {
      const context = useSectionContext()
      return computed(() => {
        const section = context?.section.value ?? viewer.section(viewer.position.value.section)
        return { ...record(viewer.doc.value.config.presmium[pluginId]), ...section?.config?.[pluginId] }
      })
    },
    useSharedState: options.shared.sharedState,
    getService: presmiumService,
    startReport: presmiumReport,
  }
}

/**
 * The `navigation` service of the web form: the IR runtime's section (by its
 * number, as the slides form counts slides), step and view. Moving switches
 * the view first, unless it is hidden (the presenter window), then shows the
 * position, going to its page if needed.
 */
export function createViewerNavigation(viewer: Viewer): Navigation {
  return {
    position: computed(() => {
      const { section, step } = viewer.position.value
      return { slide: viewer.section(section)?.index ?? 1, step, view: viewer.view.value }
    }),
    go({ slide, step, view }) {
      const target = view === undefined ? undefined : getView(view)
      if (target && !target.hidden) viewer.setView(target.id)
      const section = viewer.doc.value.sections.find(s => s.index === slide)
      if (section) viewer.show({ section: section.id, step })
    },
  }
}
