import type { Viewer } from '../viewer-state.ts'

/** Browser storage already isolates the workspace server's origin. A document needs its own stable identity too. */
export function draftScope(viewer: Viewer): string {
  const identity = viewer.options.documentIdentity ?? JSON.stringify([location.pathname, new URL(location.href).searchParams.get('document') ?? ''])
  return JSON.stringify([identity, viewer.doc.getSnapshot().meta.entry])
}
