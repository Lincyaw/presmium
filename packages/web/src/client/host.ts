import { presmiumReport, presmiumService } from '@presmium/host'
import type { HostAdapter, ViewRole } from '@presmium/host'
import type { PresentationMode } from '@presmium/kernel'
import { stepStateAt } from '@presmium/kernel'
import { FINAL_STEP, getView, useBlockContext, useSectionContext } from '@presmium/viewer'
import type { Viewer } from '@presmium/viewer'
import { computed } from 'vue'

/**
 * Host adapter of the web form, fed by the IR runtime: a component's steps
 * are its block's own steps (all reached in the document view), the cursor is
 * the enclosing section and its step, and the role follows the view
 * (reader, audience of the present view, presenter window).
 */
export function createViewerHost(viewer: Viewer): HostAdapter {
  const overlay = () => getView(viewer.view.value)?.kind === 'overlay'
  const role = computed((): ViewRole => (viewer.view.value === 'presenter' ? 'presenter' : overlay() ? 'audience' : 'reader'))
  return {
    get mode(): PresentationMode {
      return overlay() ? 'slides' : 'document'
    },
    useCursor() {
      const section = useSectionContext()
      return computed(() => {
        if (section) return { slide: section.section.value.index, step: section.step.value }
        const { position } = viewer
        return { slide: viewer.section(position.value.section)?.index ?? 1, step: position.value.step }
      })
    },
    useStepState(range) {
      const block = useBlockContext()
      const section = useSectionContext()
      return computed(() => stepStateAt(range, block?.local.value ?? section?.step.value ?? FINAL_STEP))
    },
    useViewRole: () => role,
    getService: presmiumService,
    startReport: presmiumReport,
  }
}
