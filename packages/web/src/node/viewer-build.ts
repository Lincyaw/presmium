import { errorMessage } from '@lincyaw/kernel'
import { buildDocumentBundle } from './document-bundle.ts'
import type { DocumentBundleInput } from './document-bundle.ts'
import { buildViewerApp } from './viewer-app.ts'
import type { AppPlugin } from './viewer-app.ts'

/** The process that builds the viewer app or a document's bundle, apart from the workspace service, which stays responsive. */

// Its dependencies' deprecation notes are not the author's to act on.
process.noDeprecation = true

export type ViewerBuildRequest =
  | { kind: 'app', cacheDir: string, plugins: AppPlugin[] }
  | { kind: 'document', input: DocumentBundleInput }

// Kept for the next build a while, then gone (a build holds much memory).
const IDLE_MS = 30_000
let running = 0
let idle: ReturnType<typeof setTimeout> | undefined
const rest = () => {
  clearTimeout(idle)
  if (running === 0) idle = setTimeout(() => process.exit(0), IDLE_MS)
}

process.on('message', ({ id, ...request }: ViewerBuildRequest & { id: number }) => {
  running++
  clearTimeout(idle)
  const building = request.kind === 'app' ? buildViewerApp(request.cacheDir, request.plugins) : buildDocumentBundle(request.input)
  building.then(
    result => process.send!({ id, ok: true, result }),
    (error: unknown) => process.send!({ id, ok: false, error: errorMessage(error) }),
  ).finally(() => {
    running--
    rest()
  })
})
process.on('disconnect', () => process.exit(0))
rest()
