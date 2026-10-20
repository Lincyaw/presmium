import { useServer } from '@lincyaw/host'
import type { Viewer, ViewerPluginContext } from '@lincyaw/viewer'
import { computed, shallowRef, watch } from 'vue'
import { LECTURE_ID } from '../domain/index.ts'

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

export const offered = computed(() => (useServer().available ? listed.value === true : compiled.value))

export function offerLectures(config: Record<string, unknown>): void {
  compiled.value = config.lectures === true
}

export async function refreshLectures(): Promise<void> {
  const server = useServer()
  if (!server.available) return
  const response = await server.fetch(LECTURE_ID, 'tracks').catch(() => undefined)
  const list: unknown = response?.ok ? await response.json().catch(() => []) : []
  listed.value = Array.isArray(list) && list.length > 0
}

export function followLectures(): void {
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

export function play(id: string | undefined): void {
  playing.value = id
  const url = new URL(location.href)
  if (id) url.searchParams.set(PARAM, id)
  else url.searchParams.delete(PARAM)
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
}
