import { ServiceRegistry } from '@lincyaw/kernel'
import type { ServiceToken } from '@lincyaw/kernel'

/** The Node services of one compilation: the host's, then each plugin's; a later plugin cannot replace a service. */
export class NodeServices {
  readonly #registry = new ServiceRegistry()

  constructor(host: [ServiceToken<unknown>, unknown][] = []) {
    const latest = new Map(host.map(entry => [entry[0].id, entry]))
    for (const [token, implementation] of latest.values()) this.#registry.provide(token, implementation)
  }

  add(owner: string, entries: [ServiceToken<unknown>, unknown][]): string[] {
    const problems: string[] = []
    for (const [token, implementation] of entries) {
      if (!token || typeof token.id !== 'string') {
        problems.push(`plugin ${owner}: services() gave an entry without a service token`)
        continue
      }
      const known = this.#registry.owner(token)
      if (known !== undefined) {
        problems.push(`plugin ${owner}: ${token.id} is already provided by ${known}; this implementation is ignored`)
        continue
      }
      this.#registry.provide(token, implementation, owner)
    }
    return problems
  }

  tryGet<T>(token: ServiceToken<T>): T | undefined {
    return this.#registry.tryGet(token)
  }
}
