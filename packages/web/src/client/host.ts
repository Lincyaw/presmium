import { createStore, presmiumReport, presmiumService, useStore } from '@lincyaw/host'
import type { HostAdapter, Navigation, NavigationPosition, SharedStates, Store, ViewRole } from '@lincyaw/host'
import { backSection, followedPlace, isRecord, stepKeys, stepTrail } from '@lincyaw/kernel'
import type { FollowAnchor, IRSection, PresentationMode, StepKeys } from '@lincyaw/kernel'
import { findView, useSectionContext } from '@lincyaw/viewer'
import type { Viewer } from '@lincyaw/viewer'
import { FINAL_STEP } from '@lincyaw/viewer/domain'
export interface WebHostAdapterOptions { lang: string, shared: SharedStates, printed?: boolean, isDark(): Store<boolean> }
function roleOf(view: string): ViewRole { return view === 'presenter' ? 'presenter' : findView(view)?.kind === 'overlay' ? 'audience' : 'reader' }
export function createWebHostAdapter(viewer: Viewer, options: WebHostAdapterOptions): HostAdapter { return {
  get mode(): PresentationMode { return findView(viewer.view.getSnapshot())?.kind === 'overlay' ? 'slides' : 'document' }, lang: options.lang,
  useDoc() { return useStore(viewer.doc) },
  useCursor() { const section = useSectionContext(); const position = useStore(section ? undefined : viewer.position, viewer.position.getSnapshot()); return section ? { slide: section.section.index, step: section.step } : { slide: viewer.section(position.section)?.index ?? 1, step: position.step } },
  useStep() { return useSectionContext()?.step ?? FINAL_STEP },
  useViewRole() { const section = useSectionContext(); const view = useStore(viewer.view); return roleOf(section?.view ?? view) },
  useStaticRender: () => options.printed === true,
  useSectionConfig(pluginId) { const context = useSectionContext(); const doc = useStore(viewer.doc); const position = useStore(viewer.position); const section = context?.section ?? viewer.section(position.section); const global = doc.config.presmium[pluginId]; return { ...(isRecord(global) ? global : {}), ...section?.config?.[pluginId] } },
  useSharedState(key, initial, scope) { const store = options.shared.sharedState(key, initial, scope); return [useStore(store), value => store.set(value)] },
  sharedStateStore: options.shared.sharedState, getService: presmiumService, startReport: presmiumReport,
  useDarkMode() { const store = options.isDark(); return [useStore(store), value => store.set(value)] },
} }
export function createViewerNavigation(viewer: Viewer): Navigation { const keys = new WeakMap<IRSection, StepKeys>(); const keysOf = (section: IRSection) => { let known = keys.get(section); if (!known) keys.set(section, known = stepKeys(section)); return known }; const read = (): NavigationPosition & FollowAnchor => { const { section: id, step, boundary } = viewer.position.getSnapshot(); const section = viewer.section(id); const back = backSection(viewer.doc.getSnapshot().sections, id); return { slide: section?.index ?? 1, step, ...boundary ? { boundary } : {}, view: viewer.view.getSnapshot(), section: id, ...(section ? { trail: stepTrail(keysOf(section), step) } : {}), ...(back ? { back } : {}) } }; const position = createStore(read()); const update = () => position.set(read()); viewer.position.subscribe(update); viewer.view.subscribe(update); viewer.doc.subscribe(update); return { position, go(input: NavigationPosition & FollowAnchor) { const { slide, step, view, boundary, section: id } = input; const target = view === undefined ? undefined : findView(view); if (target && !target.hidden) viewer.setView(target.id); const destination = id === undefined ? { section: viewer.doc.getSnapshot().sections.find(s => s.index === slide)?.id, step } : followedPlace(input, other => { const section = viewer.section(other); return section && keysOf(section) }); if (destination?.section !== undefined) viewer.show({ section: destination.section, step: destination.step, ...boundary ? { boundary } : {} }) } } }
