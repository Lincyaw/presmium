import { componentErrors, componentErrorRevision, presmiumService, PLAYBACK_CONTROL, STEP_CLOCK } from '@lincyaw/host'
import { deckLocale, irBlocks, PREVIEW_REVISION, toBlockPreviewCommand } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import type { Viewer } from '@lincyaw/viewer'
import { WEB_MESSAGES } from '../domain/index.ts'
import type { AppConfig } from '../domain/index.ts'
import { blockPlaybackGate } from './block-playback.ts'

/** A read-only widget reports snapshot status, geometry and discrete navigation to its authorised parent. */
export function blockPreviewReporter(config: AppConfig, doc: IRDocument, viewer: Viewer): { ready(): Promise<void>, failed(): void } {
  let origin: string | undefined
  try { const referrer = new URL(document.referrer).origin; if (config.origins.includes(referrer)) origin = referrer } catch {}
  const root = document.getElementById('app')!
  let localPosition = false
  const playback = blockPlaybackGate(config, doc, viewer, origin, () => { localPosition = true })
  playback.enable()
  let enabled = false, fatal = false, queued = false, disposed = false
  let lastReport: string | undefined
  let stopPosition: (() => void) | undefined
  const failed = () => { fatal = true; send() }
  const send = () => {
    if (!enabled || !origin || window.parent === window || disposed) return
    const unavailable = root.querySelector('[data-status="failed"], [data-status="missing"], .pm-component-missing')
    const error = fatal || unavailable || componentErrors().length > 0
    const loading = root.querySelector('.pm-client-only, [data-status="loading"]')
    const revision = doc.meta[PREVIEW_REVISION], status = error ? 'failed' : loading ? 'loading' : 'ready'
    const height = Math.ceil(root.querySelector('.pm-block-preview')?.getBoundingClientRect().height ?? root.scrollHeight)
    const report = JSON.stringify([revision, status, height])
    if (report === lastReport) return
    lastReport = report
    window.parent.postMessage({ type: 'presmium:block-preview', blockId: config.block, document: config.document, revision, status, height, ...error ? { message: WEB_MESSAGES[deckLocale(config.lang)].blockPreviewFailed } : {} }, origin)
  }
  const changed = () => { if (queued || disposed) return; queued = true; queueMicrotask(() => { queued = false; send() }) }
  const resize = new ResizeObserver(changed)
  const mutations = new MutationObserver(changed)
  resize.observe(root)
  mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-status', 'class'] })
  const stopErrors = componentErrorRevision.subscribe(changed)
  const command = (event: MessageEvent) => {
    if (!enabled || disposed || fatal || !origin || event.source !== window.parent || event.origin !== origin) return
    playback.grant(event.data)
    const value = toBlockPreviewCommand(event.data), revision = doc.meta[PREVIEW_REVISION]
    if (!value || value.type !== 'presmium:block-preview-command' || value.document !== config.document || value.blockId !== config.block || typeof revision !== 'string' || value.revision !== revision) return
    // A draft may name a step not in this older snapshot yet; its author can
    // still pause this exact frame without adopting that target.
    if (value.action === 'pause') {
      playback.enable()
      presmiumService(PLAYBACK_CONTROL)?.pause()
      return
    }
    const section = viewer.section(value.sectionId), step = section?.stepIds?.indexOf(value.stepId) ?? -1
    if (!section || step < 0 || ![...irBlocks(section.blocks)].some(block => block.id === config.block)) return
    // An externally selected step may cause intermediate local React navigation.
    // Only a new local author action or granted clock can publish a new target.
    localPosition = false
    playback.enable()
    presmiumService(PLAYBACK_CONTROL)?.pause()
    viewer.show({ section: section.id, step, boundary: value.at ?? 'end' })
  }
  const localIntent = (event: Event) => { if (event.isTrusted) localPosition = true }
  document.addEventListener('pointerdown', localIntent, true)
  document.addEventListener('keydown', localIntent, true)
  window.addEventListener('message', command)
  window.addEventListener('error', failed)
  window.addEventListener('unhandledrejection', failed)
  window.addEventListener('pagehide', () => { disposed = true; playback.dispose(); resize.disconnect(); mutations.disconnect(); stopErrors(); stopPosition?.(); document.removeEventListener('pointerdown', localIntent, true); document.removeEventListener('keydown', localIntent, true); window.removeEventListener('message', command); window.removeEventListener('error', failed); window.removeEventListener('unhandledrejection', failed) }, { once: true })
  return {
    async ready() {
      await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
      await presmiumService(STEP_CLOCK)?.settled()
      if (disposed) return
      enabled = true
      send()
      // The initial viewer position is only a loading default. Publish subsequent
      // navigation, using the canonical step identity of this block's section.
      stopPosition ??= viewer.position.subscribe(() => {
        if (!origin || disposed || fatal || !localPosition || window.parent === window) return
        const position = viewer.position.getSnapshot(), section = viewer.section(position.section)
        if (!section || ![...irBlocks(section.blocks)].some(block => block.id === config.block)) return
        const stepId = section.stepIds?.[position.step], revision = doc.meta[PREVIEW_REVISION]
        if (typeof stepId !== 'string' || typeof revision !== 'string') return
        window.parent.postMessage({ type: 'presmium:block-preview-position', document: config.document, blockId: config.block, revision, sectionId: section.id, stepId }, origin)
      })
    },
    failed() { enabled = true; failed() },
  }
}
