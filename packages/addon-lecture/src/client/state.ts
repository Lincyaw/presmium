import { createStore, serverClient, useServer, useStore } from '@lincyaw/host'
import type { Viewer, ViewerPluginContext } from '@lincyaw/viewer'
import { useEffect } from 'react'
import type { LecturePlayer } from './player.ts'
import { serverSource } from './source.ts'

let context: Pick<ViewerPluginContext, 'useViewer'> | undefined
export function setViewerContext(ctx: Pick<ViewerPluginContext, 'useViewer'>): void { context = ctx }
export function useViewer(): Viewer {
  if (!context) throw new Error('[presmium] the lecture viewer plugin is not installed')
  return context.useViewer()
}
const compiled = createStore(false)
export const lecturesAvailable = createStore(false)
export function readLecturesFlag(config: Record<string, unknown>): void {
  compiled.set(config.lectures === true)
  if (!serverClient().available) lecturesAvailable.set(compiled.getSnapshot())
}
export async function refreshLectures(): Promise<void> {
  const server = serverClient()
  if (!server.available) { lecturesAvailable.set(compiled.getSnapshot()); return }
  lecturesAvailable.set((await serverSource(server).list().catch(() => [])).length > 0)
}
export function watchLectureList(): void { void refreshLectures() }
export function useLecturesAvailable(): boolean {
  const server = useServer()
  useEffect(() => { void refreshLectures() }, [server.available])
  return useStore(lecturesAvailable)
}
const PARAM = 'track'
function fromUrl(): string | undefined { return typeof location === 'undefined' ? undefined : new URLSearchParams(location.search).get(PARAM) ?? undefined }
export const playing = createStore<string | undefined>(fromUrl())
export const exporting = typeof location !== 'undefined' && new URLSearchParams(location.search).has('export')
/** `&autoplay`: a page that embeds the presentation asks for the lecture to start as soon as it is ready. */
export const autoplay = typeof location !== 'undefined' && new URLSearchParams(location.search).has('autoplay')
export const burnedCaptions = exporting ? new URLSearchParams(location.search).get('captions') ?? undefined : undefined
export function play(id: string | undefined): void {
  playing.set(id)
  const url = new URL(location.href)
  if (id) url.searchParams.set(PARAM, id)
  else url.searchParams.delete(PARAM)
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
}
/** The player a presentation shows, which Space plays and pauses; none while Video Production drives the player. */
export const keyboardPlayer = createStore<LecturePlayer | undefined>(undefined)
