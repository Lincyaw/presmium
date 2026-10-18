export { placeFootnotes } from './footnotes.ts'

export const STAGE_ID = 'presmium.stage'

export type ScreenMode = 'live' | 'black' | 'frozen'

export function toggleScreen(current: ScreenMode, wanted: Exclude<ScreenMode, 'live'>): ScreenMode {
  return current === wanted ? 'live' : wanted
}

export const DRAWINGS_DIR = '.presmium/drawings'

export const CLEAR_DRAWING = '/@presmium-stage/clear-drawing'

export const SCREEN_KEY = 'presmium.stage.screen'

export function screenMode(value: unknown): ScreenMode {
  return value === 'black' || value === 'frozen' ? value : 'live'
}

export { STAGE_MESSAGES } from './messages.ts'
export type { StageMessages } from './messages.ts'
