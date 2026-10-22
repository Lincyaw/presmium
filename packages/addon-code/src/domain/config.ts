export const CODE_ID = 'presmium.code'

export interface CodeConfig {
  repo?: string
}

export function toCodeConfig(config: Record<string, unknown>): CodeConfig {
  return typeof config.repo === 'string' && config.repo.trim() ? { repo: config.repo.trim() } : {}
}
