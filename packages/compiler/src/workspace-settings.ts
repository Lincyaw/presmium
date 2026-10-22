import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { errorMessage, isRecord } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import { parse as parseYaml } from 'yaml'

export const WORKSPACE_CONFIG = 'presmium.workspace.yaml'

export type OperatorSettings = Record<string, Record<string, unknown>>

const cached = new Map<string, { settings: OperatorSettings, problem?: string }>()

export function workspaceSettings(root: string): { settings: OperatorSettings, problem?: string } {
  const file = join(root, WORKSPACE_CONFIG)
  const known = cached.get(file)
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
  cached.set(file, result)
  return result
}

export function operatorPlugins(settings: OperatorSettings): string[] {
  const list = settings['presmium.workspace']?.plugins
  return Array.isArray(list) ? list.filter((name): name is string => typeof name === 'string' && name.length > 0) : []
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
    if (isInside(real(dir), root)) throw new Error(`the operator directory ${dir} lies inside the workspace ${root}; it must be outside every workspace`)
    return dir
  }
  const state = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
  return join(state, 'presmium', 'operator', createHash('sha256').update(root).digest('hex').slice(0, 16))
}
