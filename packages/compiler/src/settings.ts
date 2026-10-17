/**
 * The operator's side of a compilation (docs/architecture.md 4.6, 10.2,
 * 10.5; docs/ir.md section 10): the settings of `presmium.workspace.yaml` at
 * the workspace root, read once per process; the LOCAL operator directory;
 * and the Node service registry each deck's plugins fill (`services`).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { Logger, ServiceToken } from '@presmium/kernel'
import { parse as parseYaml } from 'yaml'

/** The workspace configuration file at the workspace root. */
export const WORKSPACE_CONFIG = 'presmium.workspace.yaml'

/** Operator settings, by plugin id (`settings` of the workspace configuration). */
export type OperatorSettings = Record<string, Record<string, unknown>>

const read = new Map<string, { settings: OperatorSettings, problem?: string }>()

/**
 * `settings` of `<root>/presmium.workspace.yaml`: plugin id to that plugin's
 * settings; `{}` without the file. Read once per process and root, so a
 * change takes effect when the operator restarts (docs/ir.md section 10).
 * `problem` says why a file that exists could not be read.
 */
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

/** The packages the operator lists in `settings.presmium.workspace.plugins` (D14). */
export function operatorPlugins(settings: OperatorSettings): string[] {
  const list = settings['presmium.workspace']?.plugins
  return Array.isArray(list) ? list.filter((name): name is string => typeof name === 'string' && name.length > 0) : []
}

/** Whether `path` is `root` or lies under it. */
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

/**
 * The LOCAL operator directory of a workspace (10.5): `given` (`--operator-dir`,
 * else `PRESMIUM_OPERATOR_DIR`), else
 * `${XDG_STATE_HOME:-~/.local/state}/presmium/operator/<first 16 hex of the
 * sha256 of the workspace root's real path>/`. It is never created here.
 * Throws when it lies inside the workspace.
 */
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

/**
 * Node services of a deck (docs/architecture.md 4.5): one implementation per
 * token. The host's services come first; a plugin's implementation of a
 * token already registered is ignored and reported, one of a token the host
 * keeps (`reserved`) is left out.
 */
export class NodeServices {
  readonly #impls = new Map<string, { impl: unknown, owner: string }>()
  readonly #reserved: Set<string>

  constructor(host: [ServiceToken<unknown>, unknown][] = [], reserved: ServiceToken<unknown>[] = []) {
    this.#reserved = new Set(reserved.map(token => token.id))
    for (const [token, impl] of host) this.#impls.set(token.id, { impl, owner: 'host' })
  }

  /** Registers a plugin's implementations; returns the problems to report. */
  add(owner: string, entries: [ServiceToken<unknown>, unknown][]): string[] {
    const problems: string[] = []
    for (const [token, impl] of entries) {
      if (!token || typeof token.id !== 'string') {
        problems.push(`plugin ${owner}: services() gave an entry without a service token`)
        continue
      }
      if (this.#reserved.has(token.id)) continue
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

  /** The plugin (or `host`) that provides a token. */
  owner(token: ServiceToken<unknown>): string | undefined {
    return this.#impls.get(token.id)?.owner
  }
}

/** A plugin's logger: to stderr (stdout carries the commands' output), tagged with its id; debug only with `PRESMIUM_DEBUG`. */
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
