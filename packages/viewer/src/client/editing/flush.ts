import type { Viewer } from '../viewer-state.ts'

/** Explicit author transitions await acknowledged writes, leaving untouched readers lightweight. */
export async function flushViewerEdits(viewer: Viewer): Promise<void> {
  const [{ settleBodyEdits }, { settleSourceEdits }] = await Promise.all([
    import('./save-queue.ts'),
    import('./source/session.ts'),
  ])
  await settleBodyEdits(viewer)
  await settleSourceEdits(viewer)
}
