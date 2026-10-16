export { placeFootnotes } from './footnotes.ts'

/** Id under which this addon reads its own options from `presmium` config. */
export const STAGE_ID = 'presmium.stage'

/** What the audience view shows (P-03): the live slides, a black screen, or a frozen frame. */
export type ScreenMode = 'live' | 'black' | 'frozen'

/** Pressing the key of the active mode returns to live; any other mode key switches to that mode. */
export function toggleScreen(current: ScreenMode, wanted: Exclude<ScreenMode, 'live'>): ScreenMode {
  return current === wanted ? 'live' : wanted
}

/**
 * Where annotations are saved (P-04), relative to the deck directory. Slidev's
 * default `.slidev/drawings` is build cache that projects usually ignore; this
 * directory sits next to `.presmium/anchors.lock.json` and is committed with the deck.
 */
export const DRAWINGS_DIR = '.presmium/drawings'

/** Dev server endpoint that removes the saved drawing of a slide whose drawing was cleared (`?page=<n>`). */
export const CLEAR_DRAWING = '/@presmium-stage/clear-drawing'

/** Key of the audience screen mode, a shared state of the host (`useSharedState`) in both forms. */
export const SCREEN_KEY = 'presmium.stage.screen'

/** The screen mode a shared value stands for; anything else is live. */
export function screenMode(value: unknown): ScreenMode {
  return value === 'black' || value === 'frozen' ? value : 'live'
}

export { STAGE_MESSAGES } from './messages.ts'
export type { StageMessages } from './messages.ts'
