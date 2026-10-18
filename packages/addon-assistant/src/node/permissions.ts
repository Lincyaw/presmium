import { realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { deckLocale, isRecord } from '@presmium/kernel'
import type { ApprovalRequest } from '@presmium/kernel'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import { inside as within } from './paths.ts'

export interface ToolCallInfo {
  title?: string | null
  kind?: string | null
  rawInput?: unknown
  locations?: { path: string }[] | null
}

export type AgentApproval = ApprovalRequest & { path?: string }

export type Classified = { refuse: string } | { request: AgentApproval }

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)

export function realPath(path: string): string {
  let rest = ''
  for (let at = resolve(path); ; at = dirname(at)) {
    try {
      return join(realpathSync(at), rest)
    } catch {
      if (dirname(at) === at) return resolve(path)
      rest = join(basename(at), rest)
    }
  }
}

export function classify(call: ToolCallInfo, where: { cwd: string, operatorDir?: string, lang?: string, member?: string }): Classified {
  const t = ASSISTANT_MESSAGES[deckLocale(where.lang)].approval
  const name = text(call.title) ?? 'tool'
  const input = isRecord(call.rawInput) ? call.rawInput : {}
  const justification = text(input.justification) ?? text(input.description)
  const base = { from: ASSISTANT_ID, ...where.member ? { member: where.member } : {} }
  const detail = (...lines: (string | undefined)[]) => lines.filter(Boolean).join('\n') || undefined
  const shell = call.kind === 'execute' || /^(?:bash|pwsh|shell|terminal|job_)/i.test(name) || typeof input.command === 'string'
  const network = call.kind === 'fetch' || /^web_/i.test(name) || typeof input.url === 'string'
  const target = call.locations?.find(location => text(location.path))?.path ?? text(input.file_path) ?? text(input.path) ?? text(input.notebook_path)
  if (target) {
    const path = resolve(where.cwd, target)
    const real = realPath(path)
    if (where.operatorDir && (within(path, where.operatorDir) || within(real, realPath(where.operatorDir)))) return { refuse: `${path} is in the operator directory` }
    if (!shell && !network) {
      const cwd = realPath(where.cwd)
      const content = within(path, where.cwd) && within(real, cwd) && !relative(cwd, real).split(sep).some(part => part.toLowerCase() === '.git')
      return { request: { ...base, kind: 'write', scope: content ? 'content' : 'workspace', title: t.write(real), path: real, ...detail(justification) ? { detail: detail(justification) } : {} } }
    }
  }
  if (shell) return { request: { ...base, kind: 'agent', scope: 'workspace', title: t.shell, detail: detail(text(input.command), justification) } }
  if (network) return { request: { ...base, kind: 'agent', scope: 'workspace', title: t.network, detail: detail(text(input.url), text(input.query), justification) } }
  return { request: { ...base, kind: 'agent', scope: 'workspace', title: t.tool(name), detail: detail(justification) } }
}
