/**
 * What a page tells the page that embeds it in a frame, as `postMessage` to its parent: whether its current slide is
 * drawn (no component is still loading) and the state of its lecture. An embedding page (a site's home page playing a
 * document's presentation) keeps its own cover until `drawn`, and offers Play when the lecture is `waiting`.
 */
export const EMBED_MESSAGE = 'presmium:state'

export type EmbeddedLecture = 'loading' | 'waiting' | 'playing' | 'paused' | 'failed'

export interface EmbedState {
  type: typeof EMBED_MESSAGE
  drawn: boolean
  section?: string
  step?: number
  /** Absent when the page plays no lecture. `waiting`: the browser refused autoplay; the reader's Play starts it. */
  lecture?: EmbeddedLecture
}

let last: EmbedState = { type: EMBED_MESSAGE, drawn: false }

/** Sends the page's state, merged with what was sent before, to the embedding page; nothing when not in a frame. */
export function notifyEmbedder(change: Partial<Omit<EmbedState, 'type'>>): void {
  if (typeof window === 'undefined' || window.parent === window) return
  last = { ...last, ...change }
  window.parent.postMessage(last, '*')
}
