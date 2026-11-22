import DeltaboxRuntime from 'dsh-deltabox/runtime'
import { realpathSync } from 'node:fs'
import type { DshAgent, DshContext } from './dsh-types.ts'
import type { Presmium } from './service.ts'

type RuntimeAgent = Parameters<DeltaboxRuntime['sessionFor']>[0]

/** The public runtime seam keeps DeltaBox inside the session's private Presmium candidate. */
export default class PresmiumDeltabox extends DeltaboxRuntime {
  static inject = [...DeltaboxRuntime.inject, 'presmium']

  projectRootFor(agent: RuntimeAgent): string {
    const presmium = this.ctx.get('presmium') as Presmium | undefined
    return realpathSync(presmium?.bindings.candidateRootOf(agent as unknown as DshAgent) ?? super.projectRootFor(agent))
  }

  /**
   * Harness's own filesystem calls (a resumed chat checks its working directory before the first step) can start
   * DeltaBox before Presmium binds the agent; on the author's workspace that would put DeltaBox's live tree there.
   */
  async acquireFor(agent: RuntimeAgent): ReturnType<DeltaboxRuntime['acquireFor']> {
    const presmium = this.ctx.get('presmium') as Presmium | undefined
    await presmium?.bindings.prepareCandidateRoot(agent as unknown as DshAgent, super.projectRootFor(agent))
    const previous = this.existingSession(agent)
    if (previous && previous.projectRoot !== this.projectRootFor(agent)) await previous.close()
    return super.acquireFor(agent)
  }
}

export const deltaboxOf = (ctx: DshContext): DeltaboxRuntime | undefined => ctx.get('deltabox') as DeltaboxRuntime | undefined
export const runtimeAgent = (agent: DshAgent): RuntimeAgent => agent as unknown as RuntimeAgent
