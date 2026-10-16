import { isRecord } from '@presmium/kernel'
import type { EnvironmentSpec } from '@presmium/kernel'

/** Id under which this addon reads its own options from `presmium` config. */
export const CORE_ID = 'presmium.core'

/** The `presmium` object of a headmatter; `{}` when absent or malformed. */
export function presmiumConfig(matter: unknown): Record<string, unknown> {
  return isRecord(matter) && isRecord(matter.presmium) ? matter.presmium : {}
}

/**
 * The deck's named environments, which the slides renderer writes into the
 * headmatter as `presmiumEnvironments`; undefined when it declares none.
 */
export function presmiumEnvironments(matter: unknown): Record<string, EnvironmentSpec> | undefined {
  if (!isRecord(matter) || !isRecord(matter.presmiumEnvironments)) return undefined
  return Object.fromEntries(Object.entries(matter.presmiumEnvironments).filter(([, spec]) => isRecord(spec) && typeof spec.kind === 'string')) as Record<string, EnvironmentSpec>
}

/** Whether the demo plugins should start: `presmium: { presmium.core: { demo: true } }` in the frontmatter. */
export function wantsDemo(presmium: Record<string, unknown>): boolean {
  const core = presmium[CORE_ID]
  return isRecord(core) && core.demo === true
}
