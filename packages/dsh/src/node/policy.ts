/**
 * The `presmium-policy` row (docs/design-dsh.md 6.3): Presmium's approval
 * policy (`APPROVALS`, per kind `off`, `ask` or `allow`; architecture 10.4)
 * on DeepSeek Harness's decisions.
 *
 * - A kind whose policy is `off` is neither listed nor registered (`presmium-tools`).
 * - `allow`: `tools/pre-execute` allows the call itself, without an
 *   answerer, so it runs in the full-access mode too.
 * - `ask`: pre-execute asks; DeepSeek Harness's approval card answers, with
 *   the operation described in the deck's language. Without an answerer
 *   (headless) that is a denial. The service asks no window again: the
 *   session's token is confirmed (5.3).
 * - A file tool writing outside the session's document directory asks too
 *   (`workspace` scope).
 * - The operator directory (architecture 10.5) is denied by a guard, which
 *   no answerer and no later listener turns back, in the full-access mode too.
 */
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { describeOperation } from '@presmium/mcp/client'
import type { DshContext, DshPreDecision, DshToolExecution } from './dsh.ts'
import { PREFIX } from './tools.ts'

export const name = 'presmium-policy'
export const inject = ['presmium', 'tools']

/** DeepSeek Harness's tools that write a file, by the argument naming it. */
const FILE_TOOLS = new Set(['write', 'edit', 'str_replace_editor'])

/** The operator directories: `PRESMIUM_OPERATOR_DIR`, else those of every workspace in the user's state directory (10.5). */
export function operatorRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.PRESMIUM_OPERATOR_DIR || join(env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'presmium', 'operator'))
}

function inside(path: string, dir: string): boolean {
  const rel = relative(dir, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** The file a file tool's call writes, as given. */
function fileOf(exec: Readonly<DshToolExecution>): string | undefined {
  const args = exec.arguments as { file_path?: unknown, path?: unknown } | undefined
  const path = args?.file_path ?? args?.path
  return typeof path === 'string' && path !== '' ? path : undefined
}

/** The same text for every language key: Presmium's descriptions are in the deck's language. */
const shown = (text: string, lang?: string) => ({ en: text, ...lang ? { [lang]: text } : {} })

export function apply(ctx: DshContext): void {
  const operators = operatorRoot()

  ctx.on('tools/pre-execute', async (exec: DshToolExecution, next: () => Promise<DshPreDecision>): Promise<DshPreDecision> => {
    const session = ctx.presmium.session(exec.agent)
    if (exec.name.startsWith(PREFIX)) {
      const tool = session?.tools.find(own => `${PREFIX}${own.name}` === exec.name)
      if (!session || !tool) return { kind: 'deny', reason: `Presmium: ${exec.name} is no tool of this session's document` }
      if (tool.kind === 'read') return next()
      if (tool.approval === 'allow') return { kind: 'allow' }
      const lang = session.document.lang
      const title = describeOperation(tool.name, (exec.arguments ?? {}) as Record<string, unknown>, lang)
      return { kind: 'ask', reason: `presmium:${tool.kind} ${tool.name}`, displayReason: shown(`Presmium · ${title}`, lang) }
    }
    const file = FILE_TOOLS.has(exec.name) ? fileOf(exec) : undefined
    // The operator directory is the guard's: no question, which an answerer could allow.
    if (file && inside(resolve(session?.dir ?? process.cwd(), file), operators)) return next()
    if (session && file && !inside(resolve(session.dir, file), session.dir)) {
      return { kind: 'ask', reason: `presmium:write ${file}`, displayReason: shown(`Presmium · ${file}`, session.document.lang) }
    }
    return next()
  })

  ctx.tools.guard((exec) => {
    const file = FILE_TOOLS.has(exec.name) ? fileOf(exec) : undefined
    const dir = ctx.presmium.session(exec.agent)?.dir ?? process.cwd()
    if (file && inside(resolve(dir, file), operators)) return `Presmium: the operator directory (${operators}) is not the agent's to write`
    const command = exec.name === 'bash' ? (exec.arguments as { command?: unknown } | undefined)?.command : undefined
    if (typeof command === 'string' && command.includes(operators)) return `Presmium: the operator directory (${operators}) is not the agent's to touch`
    return undefined
  })
}
