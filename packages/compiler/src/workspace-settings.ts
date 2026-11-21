import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { errorMessage, isRecord } from '@lincyaw/kernel'
import type { DocumentDefaults } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import { parse as parseYaml } from 'yaml'

export const WORKSPACE_CONFIG = 'presmium.workspace.yaml'

export type OperatorSettings = Record<string, Record<string, unknown>>

export interface WorkspaceSettings {
  settings: OperatorSettings
  /** The root of every document's inherited settings (`defaults:`). */
  defaults: DocumentDefaults
  /** The file still lists `documents:`, which `presmium migrate` turns into document placements. */
  needsMigration?: boolean
  problem?: string
}

const cached = new Map<string, { mtimeMs: number, result: WorkspaceSettings }>()

/** `defaults:` as written, keeping only the inherited fields of the expected shapes. */
export function workspaceDefaults(value: unknown): DocumentDefaults {
  if (!isRecord(value)) return {}
  const records = (item: unknown) => isRecord(item) ? Object.fromEntries(Object.entries(item).filter(([, entry]) => isRecord(entry))) as DocumentDefaults['presmium'] : undefined
  const production = isRecord(value.production) ? value.production : {}
  const result: DocumentDefaults = {}
  if (typeof value.lang === 'string' && value.lang.trim()) result.lang = value.lang.trim()
  if (Array.isArray(value.plugins)) result.plugins = value.plugins.filter((name): name is string => typeof name === 'string' && name.length > 0)
  for (const key of ['presmium', 'renderers'] as const) { const found = records(value[key]); if (found) result[key] = found }
  if (isRecord(value.execute)) result.execute = value.execute as DocumentDefaults['execute']
  if (isRecord(value.checks)) result.checks = value.checks as DocumentDefaults['checks']
  if (isRecord(production.defaults) || isRecord(production.captions)) result.production = { ...isRecord(production.defaults) ? { defaults: production.defaults as NonNullable<DocumentDefaults['production']>['defaults'] } : {}, ...isRecord(production.captions) && typeof production.captions.scale === 'number' ? { captions: { scale: production.captions.scale } } : {} }
  return result
}

export function workspaceSettings(root: string): WorkspaceSettings {
  const file = join(root, WORKSPACE_CONFIG)
  const mtimeMs = existsSync(file) ? statSync(file).mtimeMs : -1
  const known = cached.get(file)
  if (known?.mtimeMs === mtimeMs) return known.result
  let result: WorkspaceSettings = { settings: {}, defaults: {} }
  if (mtimeMs >= 0) {
    try {
      const data: unknown = parseYaml(readFileSync(file, 'utf8'))
      const settings = isRecord(data) && isRecord(data.settings) ? data.settings : {}
      const renderers = isRecord(data) && isRecord(data.renderers) ? data.renderers : {}
      for (const [path, value] of [['renderers.lecture', renderers.lecture], ['settings.presmium.lecture', settings['presmium.lecture']]] as const) {
        if (isRecord(value) && Object.hasOwn(value, 'script')) throw new Error(`${path}.script: External lecture scripts are not supported. Author narration in each document's narrations.`)
      }
      result = {
        settings: Object.fromEntries(Object.entries(settings).map(([id, value]) => [id, isRecord(value) ? value : {}])),
        defaults: workspaceDefaults(isRecord(data) ? data.defaults : undefined),
        ...isRecord(data) && data.documents !== undefined ? { needsMigration: true } : {},
      }
    } catch (error) {
      result = { settings: {}, defaults: {}, problem: `${file}: ${errorMessage(error)}` }
    }
  }
  cached.set(file, { mtimeMs, result })
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
