import type { WorkspaceClient, WorkspaceRequestEvent } from './workspace-client.ts'
import type { IrAnswer, PreviewAnswer } from '@lincyaw/kernel'

export interface DocumentPreview { address: string, revision: string, preview: PreviewAnswer }
export interface CompiledDocumentPreview extends DocumentPreview { ir: IrAnswer }
interface PreviewSource { directory: string, version: string, fingerprint: string, project: number }
const prepared = new WeakMap<WorkspaceClient, Map<string, Promise<DocumentPreview>>>()

function wait<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
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
    const ir = await wait(client.readIr(source.directory), signal)
    if (ir.sourceFingerprints?.[entry] === source.fingerprint && ir.doc.source?.version === source.version && ir.doc.source.fingerprint === source.fingerprint) return ir
    if (Date.now() - started > 15_000) throw new Error('voice-source-pending')
    await wait(new Promise<void>(resolve => setTimeout(resolve, 150)), signal)
  }
}

/** The explicit request owner can abort while the compiler confirms one exact source snapshot. */
export async function compileDocumentPreview(client: WorkspaceClient, source: PreviewSource, signal?: AbortSignal, feedbackOwner?: WorkspaceRequestEvent['feedbackOwner']): Promise<CompiledDocumentPreview> {
  const { directory, fingerprint } = source, entry = directory ? `${directory}/lecture.json` : 'lecture.json'
  const started = Date.now()
  for (;;) {
    signal?.throwIfAborted()
    const ir = await wait(client.readIr(directory), signal)
    if (ir.sourceFingerprints?.[entry] === fingerprint) {
      const request = new AbortController(), timeout = setTimeout(() => request.abort(new DOMException('Preview preparation timed out', 'TimeoutError')), 45_000)
      const cancel = () => request.abort(signal?.reason)
      signal?.addEventListener('abort', cancel, { once: true })
      try {
        signal?.throwIfAborted()
        const preview = await client.readPreview(directory, 'web', request.signal, feedbackOwner)
        const confirmed = await wait(client.readIr(directory), signal)
        if (confirmed.sourceFingerprints?.[entry] !== fingerprint) throw new Error('presentation-source-changed')
        if (confirmed.revision === ir.revision) return { address: preview.web, revision: confirmed.revision, preview, ir: confirmed }
      } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel) }
    }
    if (Date.now() - started > 15_000) throw new Error('document-preview-source-pending')
    await wait(new Promise<void>(resolve => setTimeout(resolve, 150)), signal)
  }
}

/** Visible widgets share lightweight references, without retaining old IR payloads or another event stream. */
export function prepareDocumentPreview(client: WorkspaceClient, source: PreviewSource, retry = false): Promise<DocumentPreview> {
  let cache = prepared.get(client)
  if (!cache) prepared.set(client, cache = new Map())
  const { directory, version, fingerprint, project } = source
  const key = JSON.stringify([directory, version, fingerprint, project])
  if (retry) cache.delete(key)
  let work = cache.get(key)
  if (!work) {
    work = compileDocumentPreview(client, source, undefined, 'inline-preview').then(({ address, revision, preview }) => ({ address, revision, preview }))
    cache.set(key, work)
    work.catch(() => { if (cache?.get(key) === work) cache.delete(key) })
    while (cache.size > 8) cache.delete(cache.keys().next().value!)
  }
  return work
}
