import DeltaboxRuntime from 'dsh-deltabox/runtime'
import type { DshAgent, DshContext } from './dsh-types.ts'
import type { Presmium } from './service.ts'

type RuntimeAgent = Parameters<DeltaboxRuntime['sessionFor']>[0]

/** The public runtime seam keeps DeltaBox inside the session's private Presmium candidate. */
export default class PresmiumDeltabox extends DeltaboxRuntime {
  static inject = [...DeltaboxRuntime.inject, 'presmium']

  projectRootFor(agent: RuntimeAgent): string {
    const presmium = this.ctx.get('presmium') as Presmium | undefined
    return presmium?.bindings.candidateRootOf(agent as unknown as DshAgent) ?? super.projectRootFor(agent)
  }
}

export const deltaboxOf = (ctx: DshContext): DeltaboxRuntime | undefined => ctx.get('deltabox') as DeltaboxRuntime | undefined
export const runtimeAgent = (agent: DshAgent): RuntimeAgent => agent as unknown as RuntimeAgent
