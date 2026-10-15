/** Id under which this addon reads its options from `presmium` config. */
export const CODE_ID = 'presmium.code'

export interface CodeConfig {
  /** Web URL of the repository for permalinks; the `origin` remote by default. */
  repo?: string
}

/** `presmium: { presmium.code: {...} }` of the headmatter, as the compiler hands it to the plugin. */
export function codeConfig(config: Record<string, unknown>): CodeConfig {
  return typeof config.repo === 'string' && config.repo.trim() ? { repo: config.repo.trim() } : {}
}
