import type { EnvironmentSpec, IRPass } from '@lincyaw/kernel'
import { jupyterSpecs } from '../domain/index.ts'

const declared = new Map<string, ReadonlyMap<string, EnvironmentSpec>>()

/** The `kind: jupyter` environments of the deck's latest compile, which the server's proxies follow. */
export function declaredEnvironments(deckDir: string): ReadonlyMap<string, EnvironmentSpec> {
  return declared.get(deckDir) ?? new Map()
}

export const declaredEnvironmentsPass: IRPass = {
  name: 'presmium.execJupyter.environments',
  run(doc, ctx) {
    declared.set(ctx.deckDir, new Map(Object.entries(jupyterSpecs(doc.config.execute?.environments))))
  },
}
