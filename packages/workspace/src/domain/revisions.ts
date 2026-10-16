/**
 * Commit messages of the revision history (docs/architecture.md 4.8): a
 * summary line, a body, and trailers that say where a change came from, so
 * the history is filtered by them and needs no database of the server.
 */
import type { Member, RevisionOrigin } from '@presmium/kernel/contracts'

export const ORIGIN_TRAILER = 'Presmium-Origin'
export const TASK_TRAILER = 'Presmium-Task'
export const REVERT_TRAILER = 'Presmium-Revert'
const CO_AUTHOR = 'Co-authored-by'

const ORIGINS = new Set<RevisionOrigin['kind']>(['agent', 'document', 'editor'])

/** The `Name <email>` of a member, for git; a member without an email gets one of this machine. */
export function memberAddress(member: Member): string {
  const clean = (value: string) => value.replace(/[<>\n]/g, '').trim()
  return `${clean(member.name) || clean(member.id)} <${clean(member.email ?? '') || `${clean(member.id).replace(/\s+/g, '-') || 'member'}@presmium.invalid`}>`
}

/** A commit message: the summary, the body, and the trailers of its origin (and of the reverted commit). */
export function commitMessage(summary: string, body: string, origin: RevisionOrigin, revert?: string): string {
  const trailers = [`${ORIGIN_TRAILER}: ${origin.kind}`]
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

/** The origin a message names; undefined for a commit without Presmium's trailer. */
export function originOf(message: string): (RevisionOrigin & { revert?: string, coAuthor?: string }) | undefined {
  const found = trailers(message)
  const kind = found[ORIGIN_TRAILER]?.[0]
  if (!kind || !ORIGINS.has(kind as RevisionOrigin['kind'])) return undefined
  return {
    kind: kind as RevisionOrigin['kind'],
    ...found[TASK_TRAILER]?.[0] ? { task: found[TASK_TRAILER][0] } : {},
    ...found[REVERT_TRAILER]?.[0] ? { revert: found[REVERT_TRAILER][0] } : {},
    ...found[CO_AUTHOR]?.[0] ? { coAuthor: found[CO_AUTHOR][0] } : {},
  }
}
