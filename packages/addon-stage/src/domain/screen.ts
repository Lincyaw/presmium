/** What the audience sees: the live slide, a black screen, or the slide frozen when it was frozen. */
export type ScreenMode = 'live' | 'black' | 'frozen'

export function toggleScreen(current: ScreenMode, wanted: Exclude<ScreenMode, 'live'>): ScreenMode {
  return current === wanted ? 'live' : wanted
}

export function toScreenMode(value: unknown): ScreenMode {
  return value === 'black' || value === 'frozen' ? value : 'live'
}
