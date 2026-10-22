import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isInside } from '@lincyaw/kernel/node'
import { describeOperation } from '@lincyaw/mcp/client'
import type { DshContext, DshPreDecision, DshToolExecution } from './dsh.ts'
import { PREFIX } from './tools.ts'

export const name = 'presmium-policy'
export const inject = ['presmium', 'tools']

const FILE_TOOLS = new Set(['write', 'edit', 'str_replace_editor'])

export function operatorRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.PRESMIUM_OPERATOR_DIR || join(env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'presmium', 'operator'))
}

function fileOf(exec: Readonly<DshToolExecution>): string | undefined {
  const args = exec.arguments as { file_path?: unknown, path?: unknown } | undefined
  const path = args?.file_path ?? args?.path
  return typeof path === 'string' && path !== '' ? path : undefined
}

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
    if (file && isInside(resolve(exec.agent ? ctx.presmium.directoryOf(exec.agent) : process.cwd(), file), operators)) return next()
    if (session && file && !isInside(resolve(ctx.presmium.directoryOf(exec.agent!), file), ctx.presmium.directoryOf(exec.agent!))) {
      return { kind: 'ask', reason: `presmium:write ${file}`, displayReason: shown(`Presmium · ${file}`, session.document.lang) }
    }
    return next()
  })

  ctx.tools.guard((exec) => {
    const file = FILE_TOOLS.has(exec.name) ? fileOf(exec) : undefined
    const dir = exec.agent ? ctx.presmium.directoryOf(exec.agent) : process.cwd()
    if (file && isInside(resolve(dir, file), operators)) return `Presmium: the operator directory (${operators}) is not the agent's to write`
    const command = exec.name === 'bash' ? (exec.arguments as { command?: unknown } | undefined)?.command : undefined
    if (typeof command === 'string' && command.includes(operators)) return `Presmium: the operator directory (${operators}) is not the agent's to touch`
    return undefined
  })
}
