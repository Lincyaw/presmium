import { presmiumService, PLAYBACK_CONTROL, runtimeRevision } from '@lincyaw/host'
import type { PlaybackControl } from '@lincyaw/host'
import { irBlocks, PREVIEW_REVISION, toBlockPreviewPlaybackGranted } from '@lincyaw/kernel'
import type { BlockPreviewPlaybackCancelled, BlockPreviewPlaybackRequest, IRDocument } from '@lincyaw/kernel'
import type { Viewer } from '@lincyaw/viewer'
import type { AppConfig } from '../domain/index.ts'

/** Authorise the existing player; this bridge owns no clock or content. */
export function blockPlaybackGate(config: AppConfig, doc: IRDocument, viewer: Viewer, origin: string | undefined, onGranted: () => void) {
  const random = crypto.getRandomValues(new Uint32Array(2))
  let sequence = (random[0]! & 0x000f_ffff) * 0x1_0000_0000 + random[1]!
  const pending = new Map<number, (error?: Error) => void>()
  const active = new Map<number, () => void>()
  let disposed = false, armed = false, control: PlaybackControl | undefined
  let stopGate = () => {}, stopRuntime = () => {}
  const revision = doc.meta[PREVIEW_REVISION]
  const abortError = () => new DOMException('Playback cancelled', 'AbortError')
  const cancelled = (request: number) => {
    if (!origin || typeof revision !== 'string') return
    const message: BlockPreviewPlaybackCancelled = { type: 'presmium:block-preview-playback-cancelled', document: config.document, blockId: config.block!, revision, request }
    try { window.parent.postMessage(message, origin) } catch {}
  }
  const cancel = () => {
    for (const finish of [...pending.values()]) finish(abortError())
    for (const release of [...active.values()]) release()
  }
  const authorize = (signal: AbortSignal): Promise<void> => {
    if (disposed || !origin || typeof revision !== 'string' || signal.aborted) return Promise.reject(abortError())
    const position = viewer.position.getSnapshot(), section = viewer.section(position.section)
    const stepId = section?.stepIds?.[position.step]
    if (!section || !stepId || ![...irBlocks(section.blocks)].some(block => block.id === config.block)) return Promise.reject(new Error('The selected preview step is unavailable.'))
    const request = ++sequence
    return new Promise<void>((resolve, reject) => {
      let granted = false
      const abort = () => { if (granted) active.get(request)?.(); else finish(abortError()) }
      const finish = (error?: Error) => {
        if (!pending.delete(request)) return
        clearTimeout(timeout)
        if (error) {
          signal.removeEventListener('abort', abort)
          cancelled(request)
          reject(error)
        } else {
          granted = true
          active.set(request, () => {
            if (!active.delete(request)) return
            signal.removeEventListener('abort', abort)
            cancelled(request)
          })
          onGranted()
          resolve()
        }
      }
      const timeout = setTimeout(() => finish(new Error('Playback authorization timed out.')), 15_000)
      pending.set(request, finish)
      signal.addEventListener('abort', abort, { once: true })
      const message: BlockPreviewPlaybackRequest = { type: 'presmium:block-preview-playback-request', document: config.document, blockId: config.block!, revision, request, sectionId: section.id, stepId }
      try { window.parent.postMessage(message, origin) } catch { finish(new Error('Playback authorization is unavailable.')) }
    })
  }
  const attach = () => {
    const next = presmiumService(PLAYBACK_CONTROL)
    if (next === control) return
    stopGate(); cancel(); control = next
    stopGate = next?.setGate(authorize) ?? (() => {})
  }
  return {
    /** A validated parent control command opts this embedded reader into author playback focus. */
    enable() {
      if (armed || disposed || !origin || window.parent === window) return
      armed = true
      attach()
      stopRuntime = runtimeRevision.subscribe(attach)
    },
    grant(data: unknown) {
      const value = toBlockPreviewPlaybackGranted(data)
      if (!disposed && value?.document === config.document && value.blockId === config.block && value.revision === revision) pending.get(value.request)?.(value.error === undefined ? undefined : new Error(value.error || 'Playback authorization is unavailable.'))
    },
    dispose() { if (disposed) return; disposed = true; stopRuntime(); stopGate(); cancel() },
  }
}
