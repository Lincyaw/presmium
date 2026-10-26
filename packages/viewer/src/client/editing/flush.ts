import type { Viewer } from '../viewer-state.ts'

/** Explicit author transitions await acknowledged writes, leaving untouched readers lightweight. */
export async function flushViewerEdits(viewer: Viewer): Promise<void> {
  const [{ settleBodyEdits }, { settleSourceEdits }, { settleNativeTextEdits }] = await Promise.all([
    import('./save-queue.ts'),
    import('./source/session.ts'),
    import('./native-text-session.ts'),
  ])
  await settleBodyEdits(viewer)
  await settleSourceEdits(viewer)
  await settleNativeTextEdits(viewer)
}
