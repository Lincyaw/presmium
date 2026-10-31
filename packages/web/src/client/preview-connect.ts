import { componentErrors, componentErrorRevision, presmiumReport, presmiumService, PLAYBACK_CONTROL, PRODUCTION_PLAYBACK, createStore, runtimeRevision } from '@lincyaw/host'
import type { NavigationPosition, PlaybackControl } from '@lincyaw/host'
import { connectPreviewFrame, irBlocks, PREVIEW_REVISION, stepKeys, stepTrail } from '@lincyaw/kernel'
import type { FollowAnchor, PreviewFrame, PreviewEvents } from '@lincyaw/kernel'
import { findView, registryRevision } from '@lincyaw/viewer'
import { createViewerNavigation } from './host.ts'
import type { WebPreviewOptions, WebPreviewPage } from './preview-frame.ts'

/** A page the workbench embeds, connected to it as its preview (`webPreview`, which loads this only then). */
export function connectWebPreviewFrame(page: WebPreviewPage, options: WebPreviewOptions, events?: PreviewEvents): void {
  const { viewer, dark } = page
  const navigation = createViewerNavigation(viewer)
  const pendingGo = createStore<Parameters<typeof navigation.go>[0] | undefined>(undefined)
  // Preview ready can precede async viewer-plugin registration and the lecture list. Keep the latest requested view
  // until it is available instead of losing a first switch to video while this window is still starting.
  const applyPending = () => {
    const destination = pendingGo.getSnapshot()
    if (!destination) return
    const view = destination.view && findView(destination.view)
    if (destination.view && (!view || view.hidden)) return
    pendingGo.set(undefined)
    navigation.go(destination)
  }
  registryRevision.subscribe(applyPending)
  pendingGo.subscribe(applyPending)
  const revision = () => {
    const value = viewer.doc.getSnapshot().meta[PREVIEW_REVISION]
    return typeof value === 'string' ? value : undefined
  }
  const blockStep = (section: string, block: string) => {
    const found = viewer.section(section)
    return found ? [...irBlocks(found.blocks)].find(b => b.id === block)?.at : undefined
  }
  const frame: PreviewFrame | undefined = connectPreviewFrame({
    renderer: options.renderer ?? 'web',
    events,
    ...viewer.options.confirmedRevision ? { confirmPresentation: (revision: string) => { viewer.options.confirmedRevision!.set(revision); frame?.moved() } } : {},
    document: options.document,
    origins: options.origins,
    revision,
    position() {
      if (viewer.options.confirmedRevision && viewer.options.confirmedRevision.getSnapshot() !== revision()) return
      const { section, step, trail, view } = navigation.position.getSnapshot() as NavigationPosition & FollowAnchor
      return section === undefined ? undefined : { section, step, trail: trail ?? [], ...view ? { view } : {} }
    },
    go: ({ section, step, trail, view }) => { presmiumService(PLAYBACK_CONTROL)?.pause(); pendingGo.set({ slide: 0, step: step ?? 0, section, ...trail ? { trail } : {}, ...view ? { view } : {} }) },
    reveal: ({ section, block }) => viewer.show({ section, step: (block && blockStep(section, block)) || 0 }),
    setDark(value) {
      dark.set(value)
    },
    setActive: page.setActive,
    activityChanged: value => viewer.options.editingActive?.set(value),
    pausePlayback: () => presmiumService(PLAYBACK_CONTROL)?.pause(),
    async productionPlayback(command, signal) {
      // The page's ready handshake can precede asynchronous browser-plugin setup.
      if (!presmiumService(PRODUCTION_PLAYBACK) && !presmiumReport()) await new Promise<void>((resolve, reject) => {
        const ready = () => {
          if (!signal.aborted && !presmiumReport()) return
          stop(); signal.removeEventListener('abort', ready)
          signal.aborted ? reject(signal.reason ?? new DOMException('Playback cancelled', 'AbortError')) : resolve()
        }
        const stop = runtimeRevision.subscribe(ready)
        signal.addEventListener('abort', ready, { once: true }); ready()
      })
      signal.throwIfAborted()
      const service = presmiumService(PRODUCTION_PLAYBACK)
      if (!service || service.version !== 1) throw new Error('production-playback-unavailable')
      return service.control(command, signal)
    },
    subscribeProductionPlayback(listener) {
      let current = presmiumService(PRODUCTION_PLAYBACK), release = () => {}
      const attach = () => {
        const next = presmiumService(PRODUCTION_PLAYBACK)
        release(); current = next
        release = current?.state.subscribe(() => listener(current?.state.getSnapshot())) ?? (() => {})
        listener(current?.state.getSnapshot())
      }
      const stop = runtimeRevision.subscribe(attach)
      attach()
      return () => { stop(); release() }
    },
    setPlaybackGate(authorize) {
      let current: PlaybackControl | undefined
      let release = () => {}
      const attach = () => {
        const next = presmiumService(PLAYBACK_CONTROL)
        if (next === current) return
        release()
        current = next
        release = current?.setGate(authorize) ?? (() => {})
      }
      const stop = runtimeRevision.subscribe(attach)
      attach()
      return () => { stop(); release() }
    },
    stepOf({ section, block }) {
      const step = blockStep(section, block)
      const found = viewer.section(section)
      return step === undefined || !found ? undefined : { step, trail: stepTrail(stepKeys(found), step) }
    },
  })
  if (!frame) return
  navigation.position.subscribe(() => frame.moved())
  viewer.doc.subscribe(() => { presmiumService(PLAYBACK_CONTROL)?.pause(); requestAnimationFrame(() => frame.updated()) })
  watchProblems(frame)
}

function watchProblems(frame: PreviewFrame): void {
  let told = new Map<string, { level: 'error' | 'warning', plugin: string, message: string }>()
  const report = () => {
    const plugins = presmiumReport()?.plugins ?? [], errors = componentErrors()
    const problems = [
      ...plugins.filter(p => p.status === 'failed' || p.status === 'disabled').map(p => ({ level: p.status === 'failed' ? 'error' as const : 'warning' as const, plugin: p.id, message: p.reason ?? p.status })),
      ...errors.map(e => ({ level: 'error' as const, plugin: e.component, message: e.message })),
    ]
    const current = new Map(problems.map(problem => [JSON.stringify(problem), problem]))
    for (const [key, problem] of told) if (!current.has(key)) frame.report({ ...problem, resolved: true })
    for (const [key, problem] of current) if (!told.has(key)) frame.report(problem)
    told = current
  }
  runtimeRevision.subscribe(report)
  componentErrorRevision.subscribe(report)
  report()
}
