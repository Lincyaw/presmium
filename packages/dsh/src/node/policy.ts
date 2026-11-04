import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isInside } from '@lincyaw/kernel/node'
import { describeOperation } from '@lincyaw/mcp/client'
import type { DshContext, DshPreDecision, DshToolExecution } from './dsh-types.ts'
import { PREFIX } from './tools.ts'

export const name = 'presmium-policy'
export const inject = ['presmium', 'tools']

const FILE_WRITE_TOOLS = new Set(['write', 'edit', 'str_replace_editor'])

export function operatorRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.PRESMIUM_OPERATOR_DIR || join(env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'presmium', 'operator'))
}

function fileOf(exec: Readonly<DshToolExecution>): string | undefined {
  const args = exec.arguments as { file_path?: unknown, path?: unknown } | undefined
  const path = args?.file_path ?? args?.path
  return typeof path === 'string' && path !== '' ? path : undefined
}

const displayText = (text: string, lang?: string) => ({ en: text, ...lang ? { [lang]: text } : {} })

export function apply(ctx: DshContext): void {
  const operatorDir = operatorRoot()
  let authorRoot: string | undefined
  void ctx.presmium.server.ready.then(endpoint => { authorRoot = endpoint.root })

  ctx.on('tools/pre-execute', async (exec: DshToolExecution, next: () => Promise<DshPreDecision>): Promise<DshPreDecision> => {
    const { bindings } = ctx.presmium
    const binding = bindings.bindingOf(exec.agent)
    if (exec.name.startsWith(PREFIX)) {
      const tool = binding?.tools.find(own => `${PREFIX}${own.name}` === exec.name)
      if (!binding || !tool) return { kind: 'deny', reason: `Presmium: ${exec.name} is no tool of this session's document` }
      if (tool.kind === 'read') return next()
      if (tool.approval === 'allow') return { kind: 'allow' }
      const lang = binding.document.lang
      const title = describeOperation(tool.name, (exec.arguments ?? {}) as Record<string, unknown>, lang)
      return { kind: 'ask', reason: `presmium:${tool.kind} ${tool.name}`, displayReason: displayText(`Presmium · ${title}`, lang) }
    }
    const file = FILE_WRITE_TOOLS.has(exec.name) ? fileOf(exec) : undefined
    if (file && isInside(resolve(exec.agent ? bindings.workingDirectoryOf(exec.agent) : process.cwd(), file), operatorDir)) return next()
    if (binding && file && !isInside(resolve(bindings.workingDirectoryOf(exec.agent!), file), bindings.workingDirectoryOf(exec.agent!))) {
      return { kind: 'ask', reason: `presmium:write ${file}`, displayReason: displayText(`Presmium · ${file}`, binding.document.lang) }
    }
    return next()
  })

  ctx.tools.guard((exec) => {
    const file = FILE_WRITE_TOOLS.has(exec.name) ? fileOf(exec) : undefined
    const dir = exec.agent ? ctx.presmium.bindings.workingDirectoryOf(exec.agent) : process.cwd()
    const candidate = ctx.presmium.bindings.candidateRootOf(exec.agent)
    if (candidate && authorRoot && file && isInside(resolve(dir, file), authorRoot) && !isInside(resolve(dir, file), candidate)) return 'Presmium: write in your current candidate workspace using relative paths. The author workspace changed independently; read the current candidate file and retry.'
    if (file && isInside(resolve(dir, file), operatorDir)) return `Presmium: the operator directory (${operatorDir}) is not the agent's to write`
    const command = exec.name === 'bash' ? (exec.arguments as { command?: unknown } | undefined)?.command : undefined
    if (candidate && authorRoot && typeof command === 'string' && command.replaceAll(candidate, '').includes(authorRoot)) return 'Presmium: use your current candidate workspace instead of the author workspace absolute path. Read the file there and retry.'
    if (typeof command === 'string' && command.includes(operatorDir)) return `Presmium: the operator directory (${operatorDir}) is not the agent's to touch`
    return undefined
  })
}
