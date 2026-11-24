import DeltaboxRuntime from 'dsh-deltabox/runtime'
import { realpathSync } from 'node:fs'
import { acquireCandidateLease } from '@lincyaw/kernel/node'
import type { DshAgent, DshContext } from './dsh-types.ts'
import type { Presmium } from './service.ts'

type RuntimeAgent = Parameters<DeltaboxRuntime['sessionFor']>[0]

/** The public runtime seam keeps DeltaBox inside the session's private Presmium candidate. */
export default class PresmiumDeltabox extends DeltaboxRuntime {
  static inject = [...DeltaboxRuntime.inject, 'presmium']
  private readonly candidateLeases = new Map<string, { agent: RuntimeAgent, cancel: AbortController, lease: Promise<() => Promise<void>> }>()
  private readonly candidateClosures = new Map<string, Promise<void>>()

  constructor(...args: ConstructorParameters<typeof DeltaboxRuntime>) {
    super(...args)
    this.ctx.on('agent/disposed', async ({ agent }) => this.closeCandidate(agent))
    this.ctx.effect(() => () => Promise.all([...this.candidateLeases.values()].map(({ agent }) => this.closeCandidate(agent))))
  }

  /** Close native ownership before a host review, refresh or removal touches the candidate. */
  async closeCandidate(agent: RuntimeAgent): Promise<void> {
    const id = agent.session.id
    const closing = this.candidateClosures.get(id)
    if (closing) return closing
    const held = this.candidateLeases.get(id)
    if (!held) return
    held.cancel.abort()
    const close = (async () => {
      try { await this.existingSession(held.agent)?.close() }
      finally {
        this.candidateLeases.delete(id)
        const release = await held.lease.catch(error => { if (!held.cancel.signal.aborted) throw error })
        await release?.()
      }
    })()
    this.candidateClosures.set(id, close)
    try { await close } finally { this.candidateClosures.delete(id) }
  }

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
    if (process.platform === 'darwin' && presmium?.bindings.candidateRootOf(agent as unknown as DshAgent)) {
      const id = agent.session.id
      await this.candidateClosures.get(id)
      let held = this.candidateLeases.get(id)
      if (!held) {
        const cancel = new AbortController()
        held = { agent, cancel, lease: acquireCandidateLease(this.projectRootFor(agent), cancel.signal) }
        this.candidateLeases.set(id, held)
      }
      try { await held.lease; return await super.acquireFor(agent) }
      catch (error) { await this.closeCandidate(agent); throw error }
    }
    return super.acquireFor(agent)
  }
}

export const deltaboxOf = (ctx: DshContext): PresmiumDeltabox | undefined => ctx.get('deltabox') as PresmiumDeltabox | undefined
export const runtimeAgent = (agent: DshAgent): RuntimeAgent => agent as unknown as RuntimeAgent
