import { presmiumReport, presmiumService } from '@presmium/host'
import type { HostAdapter, Navigation, NavigationPosition, SharedStates, ViewRole } from '@presmium/host'
import { isRecord } from '@presmium/kernel'
import type { IRSection, PresentationMode } from '@presmium/kernel'
import { backSection, FINAL_STEP, followedPlace, getView, stepKeys, stepTrail, useSectionContext } from '@presmium/viewer'
import type { FollowAnchor, StepKeys, Viewer } from '@presmium/viewer'
import { useData } from 'vitepress'
import { computed, readonly, ref } from 'vue'

export interface ViewerHostOptions {
  /** The site language, for the server render. */
  lang: string
  shared: SharedStates
}

/** The role of a view: the presenter window, the audience of an overlay view (the present view), a reader of a page view. */
function roleOf(view: string): ViewRole {
  return view === 'presenter' ? 'presenter' : getView(view)?.kind === 'overlay' ? 'audience' : 'reader'
}

/**
 * Host adapter of the web form, fed by the IR runtime: the step of a
 * component is its section's step (every step reached in the document view;
 * the IR runtime gives each block its step scope), the cursor is the
 * enclosing section and its step, and the role is that of the view that
 * renders the component (a reader of the page under the present view stays
 * a reader; outside a section, the active view's). A section's `{config}`
 * comes with its IR section. The web form renders no static copies.
 */
export function createViewerHost(viewer: Viewer, options: ViewerHostOptions): HostAdapter {
  const overlay = () => getView(viewer.view.value)?.kind === 'overlay'
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
    // The appearance switch of the navigation bar, so `useTheme` changes it as the reader would.
    useDarkMode: () => useData().isDark,
  }
}

/**
 * The `navigation` service of the web form: the IR runtime's section (by its
 * number, as the slides form counts slides), step and view, and the position
 * by ids (D-4, F-85): the section's id, the keys of the steps reached in it,
 * and for a section only some audiences have, the section to go back to
 * (`FollowAnchor`). Moving switches the view first, unless it is hidden (the
 * presenter window), then shows the position, going to its page if needed. A
 * position with a section id goes by ids (`followedPlace`): the full and the
 * student build number their sections and steps apart; a section this build
 * lacks goes to the end of the one to go back to, or nowhere. A position
 * without an id goes by the numbers.
 */
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
      const target = view === undefined ? undefined : getView(view)
      if (target && !target.hidden) viewer.setView(target.id)
      const place = id === undefined
        ? { section: viewer.doc.value.sections.find(s => s.index === slide)?.id, step }
        : followedPlace(position, other => {
            const section = viewer.section(other)
            return section && keysOf(section)
          })
      if (place?.section !== undefined) viewer.show({ section: place.section, step: place.step })
    },
  }
}
