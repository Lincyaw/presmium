/** Id under which this addon reads its options from `presmium` config. */
export const EXEC_LOCAL_ID = 'presmium.execLocal'

export interface ExecLocalConfig {
  /**
   * Folder that holds the devcontainer definition and the edited files, relative
   * to the deck directory. Defaults to the git root of the deck.
   */
  workspace?: string
  /** Executor router priority of the container executor; higher wins over the browser executor. */
  priority: number
}

export const DEFAULT_PRIORITY = 10

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Reads `presmium: { presmium.execLocal: {...} }` options; `options` is that inner object. */
export function execLocalConfig(options: unknown): ExecLocalConfig {
  const config = isRecord(options) ? options : {}
  return {
    workspace: typeof config.workspace === 'string' ? config.workspace : undefined,
    priority: typeof config.priority === 'number' ? config.priority : DEFAULT_PRIORITY,
  }
}

/**
 * The deck's local-environment options: the headmatter wins, otherwise the first
 * page frontmatter that sets them (a page may own the local-environment demo).
 */
export function deckExecLocalConfig(headmatter: unknown, frontmatters: unknown[]): ExecLocalConfig {
  const own = (matter: unknown) => isRecord(matter) && isRecord(matter.presmium) ? matter.presmium[EXEC_LOCAL_ID] : undefined
  const found = [headmatter, ...frontmatters].map(own).find(isRecord)
  return execLocalConfig(found)
}
