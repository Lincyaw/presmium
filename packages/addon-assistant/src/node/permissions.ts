/**
 * The agent's own permission requests (ACP `session/request_permission`) by
 * approval scope (docs/architecture.md 4.8, 10.4). A request names only its
 * tool call (DeepSeek Harness sends the call's id alone), so the tool call
 * the agent announced before (`tool_call`: title, kind, input, locations)
 * says what it is: a file within the session's directory is `content`
 * (`write`), except in a git directory (`.git/`: in a single-deck repository
 * the document directory holds the repository's, whose configuration and
 * hooks git runs, and no review shows it); a file elsewhere, a shell command,
 * the network or any other tool is `workspace` (owners only); the operator
 * directory is refused outright, asking no one. Where a path is is decided
 * by its real path (its nearest existing directory with the links in it
 * resolved): a link in the document directory to a directory elsewhere does
 * not make a file there `content`.
 */
import { realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { deckLocale, isRecord } from '@presmium/kernel'
import type { ApprovalRequest } from '@presmium/kernel'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import { inside as within } from './paths.ts'

/** What the agent announced of a tool call. */
export interface ToolCallInfo {
  title?: string | null
  kind?: string | null
  rawInput?: unknown
  locations?: { path: string }[] | null
}

/**
 * A permission request as an approval; a write names its path (absolute), so a
 * change task commits the writes outside its directory that an owner allowed.
 */
export type AgentApproval = ApprovalRequest & { path?: string }

export type Classified = { refuse: string } | { request: AgentApproval }

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)

/** The real path of `path`: that of its nearest existing ancestor (links resolved), with the rest of the path after it. */
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
