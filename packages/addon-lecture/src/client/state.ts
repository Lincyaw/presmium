/**
 * What the lecture plugin's views and layers share in the page: the viewer
 * (from the viewer plugin context, @presmium/viewer is used for its types
 * only), whether the deck has lectures to offer, and the lecture being
 * played, named by the page URL's `track` parameter
 * (`?view=lecture&track=<id>`), so a reload plays it again.
 */
import { useServer } from '@presmium/host'
import type { Viewer, ViewerPluginContext } from '@presmium/viewer'
import { computed, shallowRef, watch } from 'vue'
import { LECTURE_ID } from '../domain/index.ts'

let context: Pick<ViewerPluginContext, 'useViewer'> | undefined

export function setViewerContext(ctx: Pick<ViewerPluginContext, 'useViewer'>): void {
  context = ctx
}

/** The viewer; inside a component setup. */
export function useViewer(): Viewer {
  if (!context) throw new Error('[presmium] the lecture viewer plugin is not installed')
  return context.useViewer()
}

/** The compiler's word (`presmium.lecture.lectures`): the deck publishes lectures, recorded or said by a voice, here or elsewhere. */
const compiled = shallowRef(false)
/** The server's list: under `presmium dev` and `presmium serve`, the lectures this member gets. */
const listed = shallowRef<boolean>()

/** Whether there are lectures to offer (the view menu has the lecture view only then, P-131): the server's list where a server serves the page, else the compiler's word. */
export const offered = computed(() => (useServer().available ? listed.value === true : compiled.value))

/** Takes the compiler's word, from the plugin's configuration; asks the server for its list once one serves the page. */
export function offerLectures(config: Record<string, unknown>): void {
  compiled.value = config.lectures === true
}

/** Asks the server for its list of lectures again (after a recording); nothing where no server serves the page. */
export async function refreshLectures(): Promise<void> {
  const server = useServer()
  if (!server.available) return
  const response = await server.fetch(LECTURE_ID, 'tracks').catch(() => undefined)
  const list: unknown = response?.ok ? await response.json().catch(() => []) : []
  listed.value = Array.isArray(list) && list.length > 0
}

/** Asks the server for the lectures once one serves the page (the web form's view menu). */
export function followLectures(): void {
  watch(() => useServer().available, (available) => {
    if (available) void refreshLectures()
  }, { immediate: true })
}

const PARAM = 'track'

function fromUrl(): string | undefined {
  return typeof location === 'undefined' ? undefined : new URLSearchParams(location.search).get(PARAM) ?? undefined
}

/** The lecture being played, if any. */
export const playing = shallowRef<string | undefined>(fromUrl())

/**
 * The page plays a lecture for `presmium-lecture export` (`&export`): no
 * controls, and the player steps through the lecture on the exporter's
 * call (`window.presmiumLecture`) instead of playing it.
 */
export const exporting = typeof location !== 'undefined' && new URLSearchParams(location.search).has('export')

/** Plays a lecture (or none), keeping the page URL in step. */
export function play(id: string | undefined): void {
  playing.value = id
  const url = new URL(location.href)
  if (id) url.searchParams.set(PARAM, id)
  else url.searchParams.delete(PARAM)
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
}
