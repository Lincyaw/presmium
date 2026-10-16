/**
 * The revision history (`REVISIONS`, P-115, docs/architecture.md 4.8): each
 * change of the source is one commit whose trailers say where it came from
 * (`Presmium-Origin`, `Presmium-Task`, `Co-authored-by`); the history is the
 * commits with those trailers; a revert is `git revert`, and when it
 * conflicts with later commits nothing changes and the files are reported.
 */
import type { Member, RevertResult, Revision, RevisionOrigin, RevisionService } from '@presmium/kernel'
import { commitMessage, memberAddress, originOf } from '../domain/revisions.ts'
import type { Git } from './git.ts'

const FIELD = '\x00'
const RECORD = '\x1e'
// The separators are written by the formatter: an argument cannot hold a NUL byte.
const FORMAT = '--format=%x1e%H%x00%an <%ae>%x00%aI%x00%B%x00'

interface LogEntry {
  id: string
  author: string
  date: string
  message: string
  files: string[]
}

function parseLog(output: string): LogEntry[] {
  return output.split(RECORD).filter(Boolean).map((record) => {
    const [id = '', author = '', date = '', message = '', rest = ''] = record.split(FIELD)
    return { id, author, date, message: message.trim(), files: rest.split('\n').map(line => line.trim()).filter(Boolean) }
  })
}

/** The files a commit changed, both sides of a rename. */
function revision(entry: LogEntry, revertedBy?: string): Revision | undefined {
  const origin = originOf(entry.message)
  if (!origin) return undefined
  const { revert: _revert, coAuthor: _coAuthor, ...plain } = origin
  return {
    id: entry.id,
    message: entry.message,
    author: entry.author,
    date: entry.date,
    origin: plain as RevisionOrigin,
    files: entry.files,
    ...revertedBy ? { revertedBy } : {},
  }
}

export class Revisions implements RevisionService {
  readonly #git: Git

  constructor(git: Git) {
    this.#git = git
  }

  commit(change: { files: string[], message: string, origin: RevisionOrigin }): Promise<Revision | undefined> {
    const [summary = '', ...body] = change.message.trim().split('\n')
    return this.#git.exclusive(() => this.commitNow(change.files, summary, body.join('\n'), change.origin))
  }

  /**
   * Commits the changes of these paths (files or directories, relative to
   * the root) as one commit; for callers already holding the git queue.
   */
  async commitNow(paths: string[], summary: string, body: string, origin: RevisionOrigin, revert?: string): Promise<Revision | undefined> {
    const unique = [...new Set(paths.map(path => path.replace(/^\.?\/+|\/+$/g, '')).filter(path => path && !path.startsWith('..')))]
    if (unique.length === 0) return undefined
    // A path that neither exists nor is tracked any more does not match; the others are staged.
    for (const path of unique) await this.#git.attempt(['add', '-A', '--', path])
    const staged = (await this.#git.raw(['diff', '--cached', '--name-only', '--', ...unique])).trim()
    if (!staged) return undefined
    const message = commitMessage(summary, body, origin, revert)
    await this.#git.raw([...await this.#identity(), 'commit', '-q', '--no-verify', '-m', message, ...this.#author(origin.member), '--', ...unique])
    return this.#revision('HEAD')
  }

  async history(filter: { document?: string, task?: string, limit?: number } = {}): Promise<Revision[]> {
    const log = await this.#git.attempt(['log', FORMAT, '--name-only', '--no-renames', ...filter.document ? ['--', filter.document] : []])
    if (!log.ok) return []
    const entries = parseLog(log.output)
    const revertedBy = new Map<string, string>()
    for (const entry of entries) {
      const reverted = originOf(entry.message)?.revert ?? /This reverts commit ([0-9a-f]{7,64})/.exec(entry.message)?.[1]
      if (reverted && !revertedBy.has(reverted)) revertedBy.set(reverted, entry.id)
    }
    const revisions = entries.flatMap((entry) => {
      const found = revision(entry, revertedBy.get(entry.id))
      return found && (!filter.task || found.origin.task === filter.task) ? [found] : []
    })
    return filter.limit ? revisions.slice(0, filter.limit) : revisions
  }

  revert(id: string, member: Member): Promise<RevertResult> {
    return this.#git.exclusive(async () => {
      const verified = await this.#git.attempt(['rev-parse', '--verify', '--quiet', `${id}^{commit}`])
      if (!verified.ok) throw new Error(`no commit ${id}`)
      const target = (await this.#log(verified.output.trim()))!
      const attempt = await this.#git.attempt(['revert', '--no-commit', target.id])
      if (!attempt.ok) {
        const unmerged = (await this.#git.raw(['diff', '--name-only', '--diff-filter=U'])).split('\n').map(line => line.trim()).filter(Boolean)
        // Local changes git refuses to overwrite are listed with a tab before each.
        const blocked = [...attempt.output.matchAll(/^\t(.+)$/gm)].map(match => match[1]!.trim())
        await this.#git.attempt(['revert', '--abort'])
        await this.#git.attempt(['reset', '-q', '--merge'])
        const conflicts = [...new Set([...unmerged, ...blocked])]
        if (conflicts.length === 0) throw new Error(`git revert failed: ${attempt.output.trim()}`)
        return { ok: false, conflicts }
      }
      const subject = target.message.split('\n')[0] ?? target.id
      const kind = originOf(target.message)?.kind ?? 'editor'
      const message = commitMessage(`Revert "${subject}"`, `This reverts commit ${target.id}.`, { kind, member }, target.id)
      await this.#git.raw([...await this.#identity(), 'commit', '-q', '--no-verify', '-m', message, ...this.#author(member)])
      await this.#git.attempt(['revert', '--quit'])
      return { ok: true, revision: (await this.#revision('HEAD'))! }
    })
  }

  async #log(id: string): Promise<LogEntry | undefined> {
    return parseLog(await this.#git.raw(['show', '--no-renames', '--name-only', FORMAT, id]))[0]
  }

  async #revision(id: string): Promise<Revision | undefined> {
    const entry = await this.#log(id)
    return entry && revision(entry)
  }

  /** The member as the author; the committer is git's configured identity. */
  #author(member: Member | undefined): string[] {
    return member ? [`--author=${memberAddress(member)}`] : []
  }

  /** A committer identity for a repository (and machine) that configures none. */
  async #identity(): Promise<string[]> {
    const email = await this.#git.attempt(['config', 'user.email'])
    return email.ok && email.output.trim() ? [] : ['-c', 'user.name=Presmium', '-c', 'user.email=presmium@presmium.invalid']
  }
}
