import { MODEL_SETTINGS } from './contract.ts'

type OpenSection = (id: string) => void

let remembered: OpenSection | undefined

/**
 * Keeps the settings shell's `openSection`, which it hands only to the onboarding steps it mounts (Presmium's welcome
 * notice and the step in place of the DeepSeek sign-in, both at every page load), so other places can open a section.
 */
export function rememberOpenSection(openSection: OpenSection | undefined): void {
  if (openSection) remembered = openSection
}

/** Opens Settings at Models, as the welcome notice's "Set up a model" does; false before the shell has offered a way. */
export function openModelSettings(): boolean {
  if (!remembered) return false
  remembered(MODEL_SETTINGS.section)
  return true
}

export function openSpeechSettings(): boolean {
  if (!remembered) return false
  remembered('presmium-speech')
  return true
}
