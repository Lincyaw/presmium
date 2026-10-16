/** Id under which this addon reads its options from `presmium` config. */
export const CODE_ID = 'presmium.code'

export interface CodeConfig {
  /** Web URL of the repository for permalinks; the `origin` remote by default. */
  repo?: string
}

/** `presmium.code` of the headmatter, with a section's `{config}` over it where the compiler gives it so. */
export function codeConfig(config: Record<string, unknown>): CodeConfig {
  return typeof config.repo === 'string' && config.repo.trim() ? { repo: config.repo.trim() } : {}
}
