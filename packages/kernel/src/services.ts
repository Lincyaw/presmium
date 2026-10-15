import satisfies from 'semver/functions/satisfies.js'
import validRange from 'semver/ranges/valid.js'
import { KERNEL_VERSION } from './contracts.ts'
import type { PluginManifest, ServiceToken } from './contracts.ts'

/** Owner recorded for services provided by the host rather than by a plugin. */
export const HOST_OWNER = 'host'

export interface StartPlan {
  /** Plugins to initialize, dependencies first; ties keep registration order. */
  order: string[]
  /** Plugins disabled before initialization, with the reason. */
  excluded: Map<string, string>
  /** Dependency cycles, each listed as plugin ids along the cycle. */
  cycles: string[][]
}

interface Entry {
  impl: unknown
  owner: string
}

/**
 * Holds service implementations (one per token id) and resolves the start
 * order of plugins from their manifests.
 */
export class ServiceRegistry {
  #entries = new Map<string, Entry>()

  provide<T>(token: ServiceToken<T>, impl: T, owner: string = HOST_OWNER): void {
    const existing = this.#entries.get(token.id)
    if (existing) throw new Error(`service ${token.id} is already provided by ${existing.owner}`)
    this.#entries.set(token.id, { impl, owner })
  }

  has(token: ServiceToken<unknown>): boolean {
    return this.#entries.has(token.id)
  }

  get<T>(token: ServiceToken<T>): T {
    const entry = this.#entries.get(token.id)
    if (!entry) throw new Error(`service ${token.id} is not available`)
    return entry.impl as T
  }

  tryGet<T>(token: ServiceToken<T>): T | undefined {
    return this.#entries.get(token.id)?.impl as T | undefined
  }

  owner(token: ServiceToken<unknown>): string | undefined {
    return this.#entries.get(token.id)?.owner
  }

  /** Removes every service provided by `owner`. */
  revoke(owner: string): void {
    for (const [id, entry] of this.#entries) {
      if (entry.owner === owner) this.#entries.delete(id)
    }
  }

  ids(): string[] {
    return [...this.#entries.keys()]
  }

  /**
   * Resolves plugin dependencies against the services already registered here.
   * Disables plugins whose kernel range does not match, plugins that provide a
   * service someone else already provides, and every plugin on a dependency
   * cycle (optional requirements count as edges). Required services that no one
   * provides are left for the kernel to report when the plugin's turn comes.
   */
  plan(manifests: PluginManifest[], kernelVersion: string = KERNEL_VERSION): StartPlan {
    const excluded = new Map<string, string>()
    for (const m of manifests) {
      const reason = incompatibility(m.kernel, kernelVersion)
      if (reason) excluded.set(m.id, reason)
    }

    const providers = new Map<string, string>([...this.#entries].map(([id, entry]) => [id, entry.owner]))
    for (const m of manifests) {
      if (excluded.has(m.id)) continue
      const taken = m.provides?.find(t => providers.has(t.id))
      if (taken) {
        excluded.set(m.id, `service ${taken.id} is already provided by ${providers.get(taken.id)}`)
        continue
      }
      for (const t of m.provides ?? []) providers.set(t.id, m.id)
    }

    const ids = manifests.map(m => m.id).filter(id => !excluded.has(id))
    const plugins = new Set(ids)
    const deps = new Map<string, string[]>()
    for (const m of manifests) {
      if (!plugins.has(m.id)) continue
      const on = (m.requires ?? [])
        .map(r => providers.get(r.token.id))
        .filter((p): p is string => p !== undefined && plugins.has(p))
      deps.set(m.id, [...new Set(on)])
    }

    const cycles = findCycles(ids, deps)
    for (const cycle of cycles) {
      const path = [...cycle, cycle[0]].join(' -> ')
      for (const id of cycle) excluded.set(id, `dependency cycle: ${path}`)
    }

    return { order: topologicalOrder(ids.filter(id => !excluded.has(id)), deps), excluded, cycles }
  }
}

/** Why a plugin's kernel range does not admit `version`; undefined when it does. */
export function kernelIncompatibility(range: string, version: string = KERNEL_VERSION): string | undefined {
  return incompatibility(range, version)
}

function incompatibility(range: string, version: string): string | undefined {
  if (validRange(range) === null) return `invalid kernel range "${range}"`
  if (!satisfies(version, range, { includePrerelease: true })) return `kernel ${version} does not satisfy "${range}"`
  return undefined
}

/** Ids reachable from `start` through at least one edge. */
function reachable(start: string, deps: Map<string, string[]>): Set<string> {
  const seen = new Set<string>()
  const stack = [...(deps.get(start) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(deps.get(id) ?? []))
  }
  return seen
}

/** Groups plugins that lie on a cycle into strongly connected components, each in edge order. */
function findCycles(ids: string[], deps: Map<string, string[]>): string[][] {
  const reach = new Map(ids.map(id => [id, reachable(id, deps)]))
  const onCycle = ids.filter(id => reach.get(id)!.has(id))
  const cycles: string[][] = []
  const grouped = new Set<string>()
  for (const id of onCycle) {
    if (grouped.has(id)) continue
    const members = new Set(onCycle.filter(o => reach.get(id)!.has(o) && reach.get(o)!.has(id)))
    const path = [id]
    for (;;) {
      const next = deps.get(path.at(-1)!)!.find(d => members.has(d) && !path.includes(d))
      if (next === undefined) break
      path.push(next)
    }
    for (const m of members) if (!path.includes(m)) path.push(m)
    path.forEach(m => grouped.add(m))
    cycles.push(path)
  }
  return cycles
}

/** Kahn's algorithm; picks the earliest registered ready plugin each round. */
function topologicalOrder(ids: string[], deps: Map<string, string[]>): string[] {
  const pending = [...ids]
  const order: string[] = []
  while (pending.length > 0) {
    const index = pending.findIndex(id => deps.get(id)!.every(d => !pending.includes(d)))
    order.push(...pending.splice(index, 1))
  }
  return order
}
