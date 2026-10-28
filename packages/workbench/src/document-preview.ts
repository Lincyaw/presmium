import { WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient, WorkspaceRequestEvent } from './workspace-client.ts'
import type { IrAnswer, PreviewAnswer, PreviewRenderer } from '@lincyaw/kernel'

export interface DocumentPreview { address: string, revision: string, preview: PreviewAnswer }
export interface CompiledDocumentPreview extends DocumentPreview { ir: IrAnswer }
interface PreviewSource { directory: string, version: string, fingerprint: string, project: number }
interface Prepared { work: Promise<DocumentPreview>, preparing: boolean, listeners: Set<() => void> }
const prepared = new WeakMap<WorkspaceClient, Map<string, Prepared>>()
const PREPARING_MAX_DELAY_MS = 5000

/** The server is still building what the preview needs (the viewer app, the document's code) and asks to be asked again. */
export function isPreviewPreparing(error: unknown): error is WorkspaceServerError {
  return error instanceof WorkspaceServerError && error.status === 503 && error.answer.error === 'preview-preparing'
}

/**
 * The document's preview addresses. While the server is still preparing them it is asked again, sooner first, until they
 * are ready, `signal` aborts or `waiting()` says the answer is no longer wanted.
 */
export async function readPreviewWhenReady(client: WorkspaceClient, directory: string, renderer: PreviewRenderer, options: { signal?: AbortSignal, feedbackOwner?: WorkspaceRequestEvent['feedbackOwner'], onPreparing?(): void, waiting?(): boolean } = {}): Promise<PreviewAnswer> {
  const { signal, feedbackOwner } = options
  let timeouts = 0
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted()
    const request = new AbortController(), timeout = setTimeout(() => request.abort(new DOMException('Preview preparation timed out', 'TimeoutError')), 45_000)
    const cancel = () => request.abort(signal?.reason)
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      return await client.readPreview(directory, renderer, request.signal, feedbackOwner)
    } catch (error) {
      // A busy server (building on a slow machine) may not answer in time: asked again twice before it counts as a failure.
      const timedOut = request.signal.reason instanceof DOMException && request.signal.reason.name === 'TimeoutError' && !signal?.aborted
      if (!isPreviewPreparing(error) && !(timedOut && ++timeouts < 3) || options.waiting?.() === false) throw error
      if (!timedOut) timeouts = 0
      options.onPreparing?.()
      const delay = Math.min((isPreviewPreparing(error) ? error.answer.retryAfterMs ?? 1000 : 1000) * 2 ** Math.min(attempt, 3), PREPARING_MAX_DELAY_MS)
      await waitForPreviewRequest(new Promise<void>(resolve => setTimeout(resolve, delay)), signal)
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel) }
  }
}

export function waitForPreviewRequest<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const cancel = () => { signal.removeEventListener('abort', cancel); reject(signal.reason) }
    if (signal.aborted) { work.catch(() => {}); cancel(); return }
    signal.addEventListener('abort', cancel, { once: true })
    work.then(value => { signal.removeEventListener('abort', cancel); resolve(value) }, error => { signal.removeEventListener('abort', cancel); reject(error) })
  })
}

/** Speech preflights need a confirmed source snapshot without building a visual output. */
export async function readDocumentSnapshot(client: WorkspaceClient, source: Pick<PreviewSource, 'directory' | 'version' | 'fingerprint'>, signal?: AbortSignal): Promise<IrAnswer> {
  const entry = source.directory ? `${source.directory}/lecture.json` : 'lecture.json', started = Date.now()
  for (;;) {
    signal?.throwIfAborted()
    const ir = await waitForPreviewRequest(client.readIr(source.directory), signal)
    if (ir.sourceFingerprints?.[entry] === source.fingerprint && ir.doc.source?.version === source.version && ir.doc.source.fingerprint === source.fingerprint) return ir
    if (Date.now() - started > 15_000) throw new Error('voice-source-pending')
    await waitForPreviewRequest(new Promise<void>(resolve => setTimeout(resolve, 150)), signal)
  }
}

/** The explicit request owner can abort while the compiler confirms one exact source snapshot. */
export async function compileDocumentPreview(client: WorkspaceClient, source: PreviewSource, signal?: AbortSignal, feedbackOwner?: WorkspaceRequestEvent['feedbackOwner'], onPreparing?: () => void): Promise<CompiledDocumentPreview> {
  const { directory, fingerprint } = source, entry = directory ? `${directory}/lecture.json` : 'lecture.json'
  let started = Date.now()
  for (;;) {
    signal?.throwIfAborted()
    const ir = await waitForPreviewRequest(client.readIr(directory), signal)
    if (ir.sourceFingerprints?.[entry] === fingerprint && ir.doc.source?.version === source.version && ir.doc.source.fingerprint === fingerprint) {
      const preview = await readPreviewWhenReady(client, directory, 'web', { signal, feedbackOwner, onPreparing })
      // Time spent while the server prepared the preview does not count against the source's confirmation.
      started = Math.max(started, Date.now() - 1000)
      const confirmed = await waitForPreviewRequest(client.readIr(directory), signal)
      if (confirmed.sourceFingerprints?.[entry] !== fingerprint || confirmed.doc.source?.version !== source.version || confirmed.doc.source.fingerprint !== fingerprint) throw new Error('presentation-source-changed')
      if (confirmed.revision === ir.revision) return { address: preview.web, revision: confirmed.revision, preview, ir: confirmed }
    }
    if (Date.now() - started > 15_000) throw new Error('document-preview-source-pending')
    await waitForPreviewRequest(new Promise<void>(resolve => setTimeout(resolve, 150)), signal)
  }
}

/**
 * Visible widgets share lightweight references, without retaining old IR payloads or another event stream. `onPreparing`
 * hears that the server is still building what the preview needs; the preview follows once it is ready.
 */
export function prepareDocumentPreview(client: WorkspaceClient, source: PreviewSource, retry = false, onPreparing?: () => void): Promise<DocumentPreview> {
  let cache = prepared.get(client)
  if (!cache) prepared.set(client, cache = new Map())
  const { directory, version, fingerprint, project } = source
  const key = JSON.stringify([directory, version, fingerprint, project])
  if (retry) cache.delete(key)
  let entry = cache.get(key)
  if (!entry) {
    const created: Prepared = { work: undefined!, preparing: false, listeners: new Set() }
    created.work = compileDocumentPreview(client, source, undefined, 'inline-preview', () => {
      created.preparing = true
      for (const listener of created.listeners) listener()
    }).then(({ address, revision, preview }) => ({ address, revision, preview }))
    entry = created
    cache.set(key, entry)
    created.work.catch(() => { if (cache?.get(key) === created) cache.delete(key) }).finally(() => created.listeners.clear())
    while (cache.size > 8) cache.delete(cache.keys().next().value!)
  }
  if (onPreparing) {
    if (entry.preparing) onPreparing()
    entry.listeners.add(onPreparing)
  }
  return entry.work
}
