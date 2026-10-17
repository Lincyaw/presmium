/**
 * Commit messages of the revision history (docs/architecture.md 4.8): a
 * summary line, a body, and trailers that say where a change came from, so
 * the history is filtered by them and needs no database of the server. A
 * document operation's `Presmium-Origin` names the operation and its
 * directories after `document` (`document rename guide manual`), so the
 * history panel labels it in the reader's language (N-07) while the commit's
 * summary stays as written; a revert's names those of the change it undoes.
 */
import type { Member, RevisionOrigin } from '@presmium/kernel/contracts'

export const ORIGIN_TRAILER = 'Presmium-Origin'
export const TASK_TRAILER = 'Presmium-Task'
export const REVERT_TRAILER = 'Presmium-Revert'
const CO_AUTHOR = 'Co-authored-by'

const ORIGINS = new Set<RevisionOrigin['kind']>(['agent', 'document', 'editor'])

/** What a document operation did (P-121): the operation and its directories, which have no spaces. */
export type RevisionOperation =
  | { op: 'create', dir: string }
  | { op: 'delete', dir: string }
  | { op: 'rename', dir: string, to: string }
  | { op: 'copy', dir: string, to: string }

/** The origin of a commit of the workspace: the contract's, and a document operation's own. */
export type CommitOrigin = RevisionOrigin & { operation?: RevisionOperation }

/** The `Name <email>` of a member, for git; a member without an email gets one of this machine. */
export function memberAddress(member: Member): string {
  const clean = (value: string) => value.replace(/[<>\n]/g, '').trim()
  return `${clean(member.name) || clean(member.id)} <${clean(member.email ?? '') || `${clean(member.id).replace(/\s+/g, '-') || 'member'}@presmium.invalid`}>`
}

/** `Presmium-Origin`'s value: the kind, then a document operation and its directories. */
function originValue(origin: CommitOrigin): string {
  const operation = origin.operation
  if (!operation) return origin.kind
  return [origin.kind, operation.op, operation.dir, ...'to' in operation ? [operation.to] : []].join(' ')
}

/** A commit message: the summary, the body, and the trailers of its origin (and of the reverted commit). */
export function commitMessage(summary: string, body: string, origin: CommitOrigin, revert?: string): string {
  const trailers = [`${ORIGIN_TRAILER}: ${originValue(origin)}`]
  if (origin.task) trailers.push(`${TASK_TRAILER}: ${origin.task}`)
  if (revert) trailers.push(`${REVERT_TRAILER}: ${revert}`)
  if (origin.member) trailers.push(`${CO_AUTHOR}: ${memberAddress(origin.member)}`)
  const head = summary.split('\n')[0]!.trim() || 'Presmium change'
  return `${head}\n\n${body.trim() ? `${body.trim()}\n\n` : ''}${trailers.join('\n')}\n`
}

/** The trailers of a message: its last paragraph's `Key: value` lines. */
export function trailers(message: string): Record<string, string[]> {
  const paragraphs = message.trim().split(/\n\s*\n/)
  const last = paragraphs.at(-1) ?? ''
  const out: Record<string, string[]> = {}
  for (const line of last.split('\n')) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    ;(out[match[1]!] ??= []).push(match[2]!)
  }
  return out
}

/** The document operation a `Presmium-Origin` value names after its kind; undefined for none. */
function operationOf(words: string[]): RevisionOperation | undefined {
  const [op, dir, to] = words
  if (!dir) return undefined
  if (op === 'create' || op === 'delete') return { op, dir }
  if (op === 'rename' && to) return { op, dir, to }
  if (op === 'copy' && to) return { op, dir, to }
  return undefined
}

/** The origin a message names; undefined for a commit without Presmium's trailer. */
export function originOf(message: string): (CommitOrigin & { revert?: string, coAuthor?: string }) | undefined {
  const found = trailers(message)
  const [kind, ...rest] = (found[ORIGIN_TRAILER]?.[0] ?? '').trim().split(/\s+/)
  if (!kind || !ORIGINS.has(kind as RevisionOrigin['kind'])) return undefined
  const operation = kind === 'document' ? operationOf(rest) : undefined
  return {
    kind: kind as RevisionOrigin['kind'],
    ...operation ? { operation } : {},
    ...found[TASK_TRAILER]?.[0] ? { task: found[TASK_TRAILER][0] } : {},
    ...found[REVERT_TRAILER]?.[0] ? { revert: found[REVERT_TRAILER][0] } : {},
    ...found[CO_AUTHOR]?.[0] ? { coAuthor: found[CO_AUTHOR][0] } : {},
  }
}
