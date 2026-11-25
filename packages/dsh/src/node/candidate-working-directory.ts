import { WorkingDirectoryService } from '@deepseek-ai/dsh-working-directory'
import type { Presmium } from './service.ts'
import type { DshAgent } from './dsh-types.ts'

/** Take the candidate boundary before the official per-session directory queue, in every caller. */
export default class CandidateWorkingDirectory extends WorkingDirectoryService {
  static inject = [...WorkingDirectoryService.inject, 'presmium']

  ensure(...args: Parameters<WorkingDirectoryService['ensure']>): ReturnType<WorkingDirectoryService['ensure']> {
    const presmium = this.ctx.get('presmium') as Presmium
    return presmium.bindings.accessCandidate(args[0] as unknown as DshAgent, () => super.ensure(...args))
  }

  set(...args: Parameters<WorkingDirectoryService['set']>): ReturnType<WorkingDirectoryService['set']> {
    const presmium = this.ctx.get('presmium') as Presmium
    return presmium.bindings.accessCandidate(args[0] as unknown as DshAgent, () => super.set(...args))
  }
}
