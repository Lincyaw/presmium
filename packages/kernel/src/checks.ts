import type { Check, CheckContext, Finding, Unsubscribe } from './contracts.ts'
import { errorMessage } from './errors.ts'

export class CheckRegistry {
  #checks = new Map<string, Check>()

  constructor(checks: Check[] = []) {
    for (const check of checks) this.register(check)
  }

  register(check: Check): Unsubscribe {
    if (this.#checks.has(check.id)) throw new Error(`check ${check.id} is already registered`)
    this.#checks.set(check.id, check)
    return () => {
      if (this.#checks.get(check.id) === check) this.#checks.delete(check.id)
    }
  }

  list(): Check[] {
    return [...this.#checks.values()]
  }

  async run(ctx: CheckContext): Promise<Finding[]> {
    const results = await Promise.all(this.list().map(check => runIsolated(check, ctx)))
    return results.flat()
  }
}

async function runIsolated(check: Check, ctx: CheckContext): Promise<Finding[]> {
  try {
    return await check.run(ctx)
  } catch (error) {
    return [{ checkId: check.id, severity: 'error', message: `check ${check.id} crashed: ${errorMessage(error)}` }]
  }
}
