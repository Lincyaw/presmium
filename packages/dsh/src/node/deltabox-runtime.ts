import DeltaboxRuntime from 'dsh-deltabox/runtime'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { acquireCandidateLease } from '@lincyaw/kernel/node'
import type { DshAgent, DshContext } from './dsh-types.ts'
import type { Presmium } from './service.ts'
import { CandidatePaths } from './candidate-paths.ts'

type RuntimeAgent = Parameters<DeltaboxRuntime['sessionFor']>[0]

/** The public runtime seam keeps DeltaBox inside the session's private Presmium candidate. */
export default class PresmiumDeltabox extends DeltaboxRuntime {
  static inject = [...DeltaboxRuntime.inject, 'presmium']
  private readonly candidateLeases = new Map<string, { agent: RuntimeAgent, cancel: AbortController, lease: Promise<() => Promise<void>> }>()
  private readonly candidateClosures = new Map<string, Promise<void>>()
  readonly paths = new CandidatePaths()
  private readonly candidateAgents = new Map<string, { agent: RuntimeAgent, session: Awaited<ReturnType<DeltaboxRuntime['acquireFor']>> }>()
  private readonly closingViews = new Map<string, Promise<void>>()

  constructor(...args: ConstructorParameters<typeof DeltaboxRuntime>) {
    super(...args)
    this.ctx.on('agent/disposed', async ({ agent }) => {
      await this.closeCandidate(agent)
    })
    this.ctx.effect(() => () => Promise.all([...this.candidateLeases.values()].map(({ agent }) => this.closeCandidate(agent))))
    this.ctx.effect(() => async () => {
      this.paths.cancelPending()
      await Promise.all([...this.candidateAgents].map(([root, owner]) => this.closeRootView(root, owner.session)))
      await this.paths.close()
    })
    const context = this.ctx as unknown as DshContext
    context.on('working-directory/access', async ({ agent }: { agent: RuntimeAgent }, next: () => Promise<string>) => {
      const presmium = this.ctx.get('presmium') as Presmium | undefined
      if (process.platform === 'darwin' || !presmium) return next()
      return presmium.bindings.accessCandidate(agent as unknown as DshAgent, async () => {
        const session = await this.acquireFor(agent)
        return this.paths.withRoot(session.projectRoot, next)
      })
    })
  }

  /** Handoff the candidate under its root queue; every native handle keeps its exact Agent identity. */
  async selectCandidateAgent(agent: RuntimeAgent): Promise<void> {
    const presmium = this.ctx.get('presmium') as Presmium | undefined
    if (!presmium) return
    return presmium.bindings.accessCandidate(agent as unknown as DshAgent, () => this.selectCandidateOwner(agent))
  }

  private async selectCandidateOwner(agent: RuntimeAgent): Promise<void> {
    if (process.platform === 'darwin') return
    const presmium = this.ctx.get('presmium') as Presmium | undefined
    await presmium?.bindings.prepareCandidateRoot(agent as unknown as DshAgent, super.projectRootFor(agent))
    const root = presmium?.bindings.candidateRootOf(agent as unknown as DshAgent)
    const previous = root && this.candidateAgents.get(realpathSync.native(root))
    if (previous && previous.agent !== agent) {
      if (previous.session.reviewActive) await previous.session.reviewCommit()
      await presmium!.bindings.retireCandidate(previous.agent as unknown as DshAgent)
    }
  }

  ownsCandidate(agent: RuntimeAgent): boolean {
    return [...this.candidateAgents.values()].some(owner => owner.agent === agent)
  }
  candidateSession(agent: RuntimeAgent): ReturnType<DeltaboxRuntime['existingSession']> { return super.existingSession(agent) }

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
    return realpathSync.native(presmium?.bindings.candidateRootOf(agent as unknown as DshAgent) ?? super.projectRootFor(agent))
  }

  /**
   * Harness's own filesystem calls (a resumed chat checks its working directory before the first step) can start
   * DeltaBox before Presmium binds the agent; on the author's workspace that would put DeltaBox's live tree there.
   */
  async acquireFor(agent: RuntimeAgent): ReturnType<DeltaboxRuntime['acquireFor']> {
    const presmium = this.ctx.get('presmium') as Presmium | undefined
    return presmium ? presmium.bindings.accessCandidate(agent as unknown as DshAgent, () => this.acquireCandidate(agent)) : this.acquireCandidate(agent)
  }

  private async acquireCandidate(agent: RuntimeAgent): ReturnType<DeltaboxRuntime['acquireFor']> {
    const presmium = this.ctx.get('presmium') as Presmium | undefined
    await presmium?.bindings.prepareCandidateRoot(agent as unknown as DshAgent, super.projectRootFor(agent))
    await this.selectCandidateAgent(agent)
    await this.closingViews.get(this.projectRootFor(agent))
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
    const session = await super.acquireFor(agent)
    const root = presmium?.bindings.candidateRootOf(agent as unknown as DshAgent)
    if (root && process.platform !== 'darwin') {
      this.candidateAgents.set(session.projectRoot, { agent, session })
      await this.paths.install(root, (await session.target()).mountpoint, () => session.lifecycle === 'open')
    }
    return session
  }

  async retirePaths(root: string): Promise<void> {
    const owner = this.candidateAgents.get(root)
    await this.closeRootView(root, owner?.session)
    this.candidateAgents.delete(root)
    await this.paths.remove(root)
  }

  async closeView(agent: RuntimeAgent): Promise<void> {
    const session = super.existingSession(agent)
    const presmium = this.ctx.get('presmium') as Presmium | undefined
    const root = presmium?.bindings.candidateRootOf(agent as unknown as DshAgent) ?? session?.projectRoot
    if (root) await this.closeRootView(root, this.candidateAgents.get(realpathSync.native(root))?.session ?? session)
  }

  private async closeRootView(root: string, session: ReturnType<DeltaboxRuntime['existingSession']>): Promise<void> {
    if (process.platform === 'darwin') { await session?.close(); return }
    try { root = session?.projectRoot ?? realpathSync.native(root) } catch { root = resolve(root) }
    session = this.candidateAgents.get(root)?.session ?? session
    const previous = this.closingViews.get(root)
    if (previous) return previous
    this.paths.unavailable(root)
    const close = (async () => { try { await session?.close() } finally { await this.paths.detach(root) } })()
    this.closingViews.set(root, close)
    try { await close } finally {
      if (this.closingViews.get(root) === close) this.closingViews.delete(root)
      if (this.candidateAgents.get(root)?.session === session) this.candidateAgents.delete(root)
    }
  }
}

export const deltaboxOf = (ctx: Pick<DshContext, 'get'>): PresmiumDeltabox | undefined => ctx.get('deltabox') as PresmiumDeltabox | undefined
export const runtimeAgent = (agent: DshAgent): RuntimeAgent => agent as unknown as RuntimeAgent
