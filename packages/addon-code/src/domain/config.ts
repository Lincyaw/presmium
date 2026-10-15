/** Id under which this addon reads its options from `presmium` config. */
export const CODE_ID = 'presmium.code'

export interface CodeConfig {
  /** Web URL of the repository for permalinks; the `origin` remote by default. */
  repo?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function own(matter: unknown): Record<string, unknown> {
  const presmium = isRecord(matter) ? matter.presmium : undefined
  const config = isRecord(presmium) ? presmium[CODE_ID] : undefined
  return isRecord(config) ? config : {}
}

/** `presmium: { presmium.code: {...} }` of the headmatter, overridden by the slide frontmatter. */
export function codeConfig(headmatter: unknown, frontmatter?: unknown): CodeConfig {
  const merged = { ...own(headmatter), ...own(frontmatter) }
  return typeof merged.repo === 'string' ? { repo: merged.repo } : {}
}
