import { PREVIEW_SLIDE_FIT_PARAM, randomUUID, toSlideFitAnswer } from '@lincyaw/kernel'
import type { SlideFitAnswer } from '@lincyaw/kernel'
import { compileDocumentPreview, waitForPreviewRequest } from './document-preview.ts'
import { hasSlides } from './workbench.ts'
import type { Workbench } from './workbench.ts'

// How long the author has stopped editing before the slides are measured; and how long a measurement may take.
const IDLE_MS = 2000
const MEASURE_MS = 60_000
// The contribution the measurement makes to the document's diagnostics, beside the presentation's own.
const INSTANCE = 'slide-fit'

/**
 * While the author edits, tells which slides are too crowded to present readably, as the presentation does for the slides
 * it shows: when the document is saved and the author has stopped for a moment, the saved version is compiled and its
 * slides measured in a hidden page of the preview (`PREVIEW_SLIDE_FIT_PARAM`); the crowded ones become warnings on their
 * pages. Typing, a new version or another document cancels the measurement under way. Returns the way to stop.
 */
export function watchSlideFit(workbench: Workbench, container: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: AbortController | undefined
  let scheduled: string | undefined
  let measured: string | undefined
  const sourceKey = () => {
    const { document, authoring: source, webView } = workbench.getState()
    if (document === undefined || webView === 'present' || !source?.identity || !source.version || !source.fingerprint || !source.content
      || source.loading || source.dirty || source.saving || source.composing || source.restored || source.error || source.recovering) return undefined
    return `${document}\n${source.identity}\n${source.version}\n${source.fingerprint}\n${source.projectRevision ?? 0}`
  }
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
    running?.abort(new Error('slide-fit-superseded'))
    running = undefined
  }
  const schedule = () => {
    const key = sourceKey()
    if (key === scheduled) return
    cancel()
    scheduled = key
    if (key !== undefined && key !== measured) timer = setTimeout(() => void measure(key), IDLE_MS)
  }
  const typed = () => {
    if (!timer && !running) return
    cancel()
    // The same version is measured again once the author stops.
    scheduled = undefined
    schedule()
  }
  const measure = async (key: string) => {
    timer = undefined
    const { document: directory, authoring: source } = workbench.getState()
    if (directory === undefined || !source?.version || !source.fingerprint) return
    const controller = running = new AbortController()
    const { signal } = controller
    const expiry = setTimeout(() => controller.abort(new DOMException('Slide measurement timed out', 'TimeoutError')), MEASURE_MS)
    let frame: HTMLIFrameElement | undefined
    try {
      const snapshot = await compileDocumentPreview(workbench.client, { directory, version: source.version, fingerprint: source.fingerprint, project: source.projectRevision ?? 0 }, signal)
      if (!hasSlides(snapshot.ir)) { measured = key; return }
      const nonce = randomUUID()
      const address = new URL(snapshot.address, location.href)
      address.searchParams.set(PREVIEW_SLIDE_FIT_PARAM, nonce)
      const answer = new Promise<SlideFitAnswer>((resolve) => {
        const received = (event: MessageEvent) => {
          const answer = event.source === frame?.contentWindow && event.origin === address.origin ? toSlideFitAnswer(event.data, nonce) : undefined
          if (!answer) return
          window.removeEventListener('message', received)
          resolve(answer)
        }
        window.addEventListener('message', received)
        signal.addEventListener('abort', () => window.removeEventListener('message', received), { once: true })
      })
      const element = frame = document.createElement('iframe')
      element.className = 'pmw-slide-fit-frame'
      element.tabIndex = -1
      element.setAttribute('aria-hidden', 'true')
      element.src = address.href
      container.append(element)
      const { problems } = await waitForPreviewRequest(answer, signal)
      measured = key
      await workbench.reportPreviewDiagnostics({ document: directory, renderer: 'web', instance: INSTANCE, revision: snapshot.revision,
        findings: problems.map(problem => ({ checkId: problem.plugin, severity: problem.level, message: problem.message, section: problem.section })) })
    } catch {
      // Cancelled, or the version could not be compiled or measured: the next version is measured again.
    } finally {
      clearTimeout(expiry)
      frame?.remove()
      if (running === controller) running = undefined
    }
  }
  const stop = workbench.subscribe(schedule)
  document.addEventListener('beforeinput', typed, true)
  document.addEventListener('compositionstart', typed, true)
  schedule()
  return () => {
    stop()
    document.removeEventListener('beforeinput', typed, true)
    document.removeEventListener('compositionstart', typed, true)
    cancel()
  }
}
