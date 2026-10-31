import { createPreviewEvents, isPreviewActive, isPreviewEmbedded, reportStaleModule } from '@lincyaw/kernel'
import type { PreviewEventSubscription } from '@lincyaw/kernel'
import type { Viewer } from '@lincyaw/viewer'
import type { Store } from '@lincyaw/host'

export interface WebPreviewOptions {
  origins: string[]
  document: string
  /** The form the page shows: its pages, or its slides. */
  renderer?: 'web' | 'slides'
}

export interface WebPreviewPage {
  viewer: Viewer
  dark: Store<boolean>
  setActive(active: boolean): Promise<void>
}

/** What a preview dev server's theme gives the document theme (`ThemeInput.preview`). */
export interface WebPreview {
  /** False when the workbench paused the preview before the page loaded again. */
  active: boolean
  /** The page is in a workbench: it shows the document as a page, without the site's navigation. */
  embedded: boolean
  events?: PreviewEventSubscription
  connect(page: WebPreviewPage): void
}

export function webPreview(options: WebPreviewOptions): WebPreview {
  const events = createPreviewEvents(options.origins, options.document)
  const embedded = isPreviewEmbedded()
  // The preview protocol loads only in a page the workbench embeds (`preview-connect.ts`).
  const connect = (page: WebPreviewPage) => {
    if (!embedded || options.origins.length === 0) return
    void import('./preview-connect.ts').then(m => m.connectWebPreviewFrame(page, options, events)).catch((error: unknown) => {
      console.error('[presmium] the preview did not connect', error)
      reportStaleModule(error)
    })
  }
  return { active: isPreviewActive(), embedded, ...events ? { events: events.subscribe } : {}, connect }
}
