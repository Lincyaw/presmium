/**
 * What the lecture plugin's views and layers share in the page: the viewer
 * (from the viewer plugin context, @presmium/viewer is used for its types
 * only) and the lecture being played, named by the page URL's `track`
 * parameter (`?view=lecture&track=<id>`), so a reload plays it again.
 */
import type { Viewer, ViewerPluginContext } from '@presmium/viewer'
import { shallowRef } from 'vue'

let context: Pick<ViewerPluginContext, 'useViewer'> | undefined

export function setViewerContext(ctx: Pick<ViewerPluginContext, 'useViewer'>): void {
  context = ctx
}

/** The viewer; inside a component setup. */
export function useViewer(): Viewer {
  if (!context) throw new Error('[presmium] the lecture viewer plugin is not installed')
  return context.useViewer()
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
