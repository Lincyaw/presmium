import { presmiumReport, presmiumService } from '@lincyaw/host'
import type { HostAdapter, Navigation, NavigationPosition, SharedStates, ViewRole } from '@lincyaw/host'
import { backSection, followedPlace, isRecord, stepKeys, stepTrail } from '@lincyaw/kernel'
import type { FollowAnchor, IRSection, PresentationMode, StepKeys } from '@lincyaw/kernel'
import { findView, useSectionContext } from '@lincyaw/viewer'
import type { Viewer } from '@lincyaw/viewer'
import { FINAL_STEP } from '@lincyaw/viewer/domain'
import { useData } from 'vitepress'
import { computed, readonly, ref } from 'vue'

export interface WebHostAdapterOptions {
  lang: string
  shared: SharedStates
}

function roleOf(view: string): ViewRole {
  return view === 'presenter' ? 'presenter' : findView(view)?.kind === 'overlay' ? 'audience' : 'reader'
}

/** The host adapter of the web form, on the IR runtime's viewer. */
export function createWebHostAdapter(viewer: Viewer, options: WebHostAdapterOptions): HostAdapter {
  const overlay = () => findView(viewer.view.value)?.kind === 'overlay'
  const role = computed(() => roleOf(viewer.view.value))
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
    useViewRole() {
      const section = useSectionContext()
      return section ? computed(() => roleOf(section.view.value)) : role
    },
    useStaticRender: () => staticRender,
    useSectionConfig(pluginId) {
      const context = useSectionContext()
      return computed(() => {
        const section = context?.section.value ?? viewer.section(viewer.position.value.section)
        const global = viewer.doc.value.config.presmium[pluginId]
        return { ...(isRecord(global) ? global : {}), ...section?.config?.[pluginId] }
      })
    },
    useSharedState: options.shared.sharedState,
    getService: presmiumService,
    startReport: presmiumReport,
    useDarkMode: () => useData().isDark,
  }
}

export function createViewerNavigation(viewer: Viewer): Navigation {
  const keys = new WeakMap<IRSection, StepKeys>()
  const keysOf = (section: IRSection) => {
    let known = keys.get(section)
    if (!known) keys.set(section, known = stepKeys(section))
    return known
  }
  return {
    position: computed((): NavigationPosition & FollowAnchor => {
      const { section: id, step } = viewer.position.value
      const section = viewer.section(id)
      const back = backSection(viewer.doc.value.sections, id)
      return {
        slide: section?.index ?? 1,
        step,
        view: viewer.view.value,
        section: id,
        ...section ? { trail: stepTrail(keysOf(section), step) } : {},
        ...back ? { back } : {},
      }
    }),
    go(position: NavigationPosition & FollowAnchor) {
      const { slide, step, view, section: id } = position
      const target = view === undefined ? undefined : findView(view)
      if (target && !target.hidden) viewer.setView(target.id)
      const destination = id === undefined
        ? { section: viewer.doc.value.sections.find(s => s.index === slide)?.id, step }
        : followedPlace(position, other => {
            const section = viewer.section(other)
            return section && keysOf(section)
          })
      if (destination?.section !== undefined) viewer.show({ section: destination.section, step: destination.step })
    },
  }
}
