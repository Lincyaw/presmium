/**
 * The agent's own permission requests (ACP `session/request_permission`) by
 * approval scope (docs/architecture.md 4.8, 10.4). A request names only its
 * tool call (DeepSeek Harness sends the call's id alone), so the tool call
 * the agent announced before (`tool_call`: title, kind, input, locations)
 * says what it is: a file within the session's directory is `content`
 * (`write`); a file elsewhere, a shell command, the network or any other
 * tool is `workspace` (owners only); the operator directory is refused
 * outright, asking no one.
 */
import { isAbsolute, relative, resolve } from 'node:path'
import { deckLocale, isRecord } from '@presmium/kernel'
import type { ApprovalRequest } from '@presmium/kernel'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'

/** What the agent announced of a tool call. */
export interface ToolCallInfo {
  title?: string | null
  kind?: string | null
  rawInput?: unknown
  locations?: { path: string }[] | null
}

export type Classified = { refuse: string } | { request: ApprovalRequest }

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)

/** Whether `path` is `dir` or below it. */
function within(path: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(path))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
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
    if (where.operatorDir && within(path, where.operatorDir)) return { refuse: `${path} is in the operator directory` }
    if (!shell && !network) {
      const inside = within(path, where.cwd)
      return { request: { ...base, kind: 'write', scope: inside ? 'content' : 'workspace', title: t.write(path), ...detail(justification) ? { detail: detail(justification) } : {} } }
    }
  }
  if (shell) return { request: { ...base, kind: 'agent', scope: 'workspace', title: t.shell, detail: detail(text(input.command), justification) } }
  if (network) return { request: { ...base, kind: 'agent', scope: 'workspace', title: t.network, detail: detail(text(input.url), text(input.query), justification) } }
  return { request: { ...base, kind: 'agent', scope: 'workspace', title: t.tool(name), detail: detail(justification) } }
}
