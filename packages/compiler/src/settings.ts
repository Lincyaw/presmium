import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { Logger, ServiceToken } from '@presmium/kernel'
import { parse as parseYaml } from 'yaml'

export const WORKSPACE_CONFIG = 'presmium.workspace.yaml'

export type OperatorSettings = Record<string, Record<string, unknown>>

const read = new Map<string, { settings: OperatorSettings, problem?: string }>()

export function workspaceSettings(root: string): { settings: OperatorSettings, problem?: string } {
  const file = join(root, WORKSPACE_CONFIG)
  const known = read.get(file)
  if (known) return known
  let result: { settings: OperatorSettings, problem?: string } = { settings: {} }
  if (existsSync(file)) {
    try {
      const data: unknown = parseYaml(readFileSync(file, 'utf8'))
      const settings = isRecord(data) && isRecord(data.settings) ? data.settings : {}
      result = { settings: Object.fromEntries(Object.entries(settings).map(([id, value]) => [id, isRecord(value) ? value : {}])) }
    } catch (error) {
      result = { settings: {}, problem: `${file}: ${errorMessage(error)}` }
    }
  }
  read.set(file, result)
  return result
}

export function operatorPlugins(settings: OperatorSettings): string[] {
  const list = settings['presmium.workspace']?.plugins
  return Array.isArray(list) ? list.filter((name): name is string => typeof name === 'string' && name.length > 0) : []
}

export function inside(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function real(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

export function operatorDir(workspaceRoot: string, given = process.env.PRESMIUM_OPERATOR_DIR): string {
  const root = real(workspaceRoot)
  if (given) {
    const dir = resolve(given)
    if (inside(real(dir), root)) throw new Error(`the operator directory ${dir} lies inside the workspace ${root}; it must be outside every workspace`)
    return dir
  }
  const state = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
  return join(state, 'presmium', 'operator', createHash('sha256').update(root).digest('hex').slice(0, 16))
}

export class NodeServices {
  readonly #impls = new Map<string, { impl: unknown, owner: string }>()

  constructor(host: [ServiceToken<unknown>, unknown][] = []) {
    for (const [token, impl] of host) this.#impls.set(token.id, { impl, owner: 'host' })
  }

  add(owner: string, entries: [ServiceToken<unknown>, unknown][]): string[] {
    const problems: string[] = []
    for (const [token, impl] of entries) {
      if (!token || typeof token.id !== 'string') {
        problems.push(`plugin ${owner}: services() gave an entry without a service token`)
        continue
      }
      const known = this.#impls.get(token.id)
      if (known) {
        problems.push(`plugin ${owner}: ${token.id} is already provided by ${known.owner}; this implementation is ignored`)
        continue
      }
      this.#impls.set(token.id, { impl, owner })
    }
    return problems
  }

  get<T>(token: ServiceToken<T>): T | undefined {
    return this.#impls.get(token.id)?.impl as T | undefined
  }

  owner(token: ServiceToken<unknown>): string | undefined {
    return this.#impls.get(token.id)?.owner
  }
}

export function pluginLogger(id: string): Logger {
  const tag = `[${id}]`
  return {
    debug: (...args) => {
      if (process.env.PRESMIUM_DEBUG) console.error(tag, ...args)
    },
    info: (...args) => console.error(tag, ...args),
    warn: (...args) => console.error(tag, ...args),
    error: (...args) => console.error(tag, ...args),
  }
}
