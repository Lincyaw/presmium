import { useServer } from '@lincyaw/host'
import type { Viewer, ViewerPluginContext } from '@lincyaw/viewer'
import { computed, shallowRef, watch } from 'vue'
import { serverSource } from './source.ts'

let context: Pick<ViewerPluginContext, 'useViewer'> | undefined

export function setViewerContext(ctx: Pick<ViewerPluginContext, 'useViewer'>): void {
  context = ctx
}

export function useViewer(): Viewer {
  if (!context) throw new Error('[presmium] the lecture viewer plugin is not installed')
  return context.useViewer()
}

const compiled = shallowRef(false)
const listed = shallowRef<boolean>()

export const lecturesAvailable = computed(() => (useServer().available ? listed.value === true : compiled.value))

export function readLecturesFlag(config: Record<string, unknown>): void {
  compiled.value = config.lectures === true
}

export async function refreshLectures(): Promise<void> {
  const server = useServer()
  if (!server.available) return
  listed.value = (await serverSource(server).list().catch(() => [])).length > 0
}

export function watchLectureList(): void {
  watch(() => useServer().available, (available) => {
    if (available) void refreshLectures()
  }, { immediate: true })
}

const PARAM = 'track'

function fromUrl(): string | undefined {
  return typeof location === 'undefined' ? undefined : new URLSearchParams(location.search).get(PARAM) ?? undefined
}

export const playing = shallowRef<string | undefined>(fromUrl())

export const exporting = typeof location !== 'undefined' && new URLSearchParams(location.search).has('export')

/** The language whose captions an export draws on the frames (`presmium-lecture export --burn`). */
export const burnedCaptions = exporting ? new URLSearchParams(location.search).get('captions') ?? undefined : undefined

export function play(id: string | undefined): void {
  playing.value = id
  const url = new URL(location.href)
  if (id) url.searchParams.set(PARAM, id)
  else url.searchParams.delete(PARAM)
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
}
