import { isRecord } from '@lincyaw/kernel'
import type { EnvironmentSpec } from '@lincyaw/kernel'

export const CORE_ID = 'presmium.core'

export function presmiumConfig(matter: unknown): Record<string, unknown> {
  return isRecord(matter) && isRecord(matter.presmium) ? matter.presmium : {}
}

export function presmiumEnvironments(matter: unknown): Record<string, EnvironmentSpec> | undefined {
  if (!isRecord(matter) || !isRecord(matter.presmiumEnvironments)) return undefined
  return Object.fromEntries(Object.entries(matter.presmiumEnvironments).filter(([, spec]) => isRecord(spec) && typeof spec.kind === 'string')) as Record<string, EnvironmentSpec>
}
