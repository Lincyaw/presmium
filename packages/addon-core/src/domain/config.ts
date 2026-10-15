/** Id under which this addon reads its own options from `presmium` config. */
export const CORE_ID = 'presmium.core'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The `presmium` object of a headmatter; `{}` when absent or malformed. */
export function presmiumConfig(matter: unknown): Record<string, unknown> {
  return isRecord(matter) && isRecord(matter.presmium) ? matter.presmium : {}
}

/** Whether the demo plugins should start: `presmium: { presmium.core: { demo: true } }` in the frontmatter. */
export function wantsDemo(presmium: Record<string, unknown>): boolean {
  const core = presmium[CORE_ID]
  return isRecord(core) && core.demo === true
}
