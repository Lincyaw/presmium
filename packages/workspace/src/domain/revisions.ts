import type { Member, RevisionOrigin } from '@lincyaw/kernel/contracts'

export const ORIGIN_TRAILER = 'Presmium-Origin'
export const TASK_TRAILER = 'Presmium-Task'
export const REVERT_TRAILER = 'Presmium-Revert'
const CO_AUTHOR = 'Co-authored-by'

const ORIGINS = new Set<RevisionOrigin['kind']>(['agent', 'document', 'editor'])

export type RevisionOperation =
  | { op: 'create', dir: string }
  | { op: 'delete', dir: string }
  | { op: 'rename', dir: string, to: string }
  | { op: 'copy', dir: string, to: string }

export type CommitOrigin = RevisionOrigin & { operation?: RevisionOperation }

export function memberAddress(member: Member): string {
  const clean = (value: string) => value.replace(/[<>\n]/g, '').trim()
  return `${clean(member.name) || clean(member.id)} <${clean(member.email ?? '') || `${clean(member.id).replace(/\s+/g, '-') || 'member'}@presmium.invalid`}>`
}

const word = (dir: string) => dir.replace(/[%\s]/gu, char => encodeURIComponent(char))
function unword(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function originValue(origin: CommitOrigin): string {
  const operation = origin.operation
  if (!operation) return origin.kind
  return [origin.kind, operation.op, word(operation.dir), ...'to' in operation ? [word(operation.to)] : []].join(' ')
}

export function commitMessage(summary: string, body: string, origin: CommitOrigin, revert?: string): string {
  const trailers = [`${ORIGIN_TRAILER}: ${originValue(origin)}`]
  if (origin.task) trailers.push(`${TASK_TRAILER}: ${origin.task}`)
  if (revert) trailers.push(`${REVERT_TRAILER}: ${revert}`)
  if (origin.member) trailers.push(`${CO_AUTHOR}: ${memberAddress(origin.member)}`)
  const head = summary.split('\n')[0]!.trim() || 'Presmium change'
  return `${head}\n\n${body.trim() ? `${body.trim()}\n\n` : ''}${trailers.join('\n')}\n`
}

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

function operationOf(words: string[]): RevisionOperation | undefined {
  const [op, dir, to] = [words[0], ...words.slice(1).map(unword)]
  if (!dir) return undefined
  if (op === 'create' || op === 'delete') return { op, dir }
  if (op === 'rename' && to) return { op, dir, to }
  if (op === 'copy' && to) return { op, dir, to }
  return undefined
}

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
