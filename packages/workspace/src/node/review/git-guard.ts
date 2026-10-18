/**
 * The git directory as a change task found it, when the document directory
 * holds the git directory (a single-deck repository, LOCAL). An agent's file
 * tools may write there without asking (the bundled DeepSeek Harness's
 * sandbox lets it write anywhere in its working directory), git does not
 * track `.git/`, so no review shows the write, and git would follow what it
 * planted: run a hook or a filter driver of `config` or `info/attributes`,
 * or take another directory's configuration through `commondir`; the
 * review's own commands at once, the user's later.
 *
 * So everything in the git directory through which git runs code or finds
 * its configuration is guarded: every entry but the object store
 * (`objects/`, whose `info/` is guarded: alternates), `refs/` and `logs/`
 * (branches move with the author's own commits meanwhile), `lfs/`, the index
 * and lock files, by the same rule in the git directories of submodules
 * (`modules/`) and linked work trees (`worktrees/`). That is `config`,
 * `config.worktree`, `commondir`, `gitdir`, `HEAD`, `packed-refs`, `shallow`,
 * `hooks/`, `info/` and whatever else the agent adds. The git review puts
 * them back before its commands; a git directory that is no longer the one
 * the task found (replaced, or made a link) stops the review instead. What
 * the guard found can be saved and given back (a crashed server's review is
 * recovered from its record, ./review-record.ts).
 */
import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'

type Entry = { kind: 'file', data: Buffer, mode: number } | { kind: 'link', target: string } | { kind: 'dir' } | { kind: 'other' }

/** What a guard found, as JSON (file contents in base64). */
export interface SavedGuard {
  identity: string
  entries: [string, { kind: 'file', data: string, mode: number } | { kind: 'link', target: string } | { kind: 'dir' } | { kind: 'other' }][]
}

const UNGUARDED = new Set(['refs', 'logs', 'lfs'])

/** Whether a path of the git directory (relative, by its parts) is left alone: objects but `objects/info`, refs, logs, LFS objects, indexes and locks. */
function unguarded(parts: string[]): boolean {
  const name = parts.at(-1)!
  if (name === 'index' || name.endsWith('.lock')) return true
  return parts.some((part, i) => UNGUARDED.has(part) || (part === 'objects' && i + 1 < parts.length && parts[i + 1] !== 'info'))
}

/** The guarded entries of a git directory, by path relative to it. */
function scan(gitDir: string): Map<string, Entry> {
  const entries = new Map<string, Entry>()
  const visit = (rel: string) => {
    if (unguarded(rel.split(sep))) return
    const path = join(gitDir, rel)
    let stat
    try {
      stat = lstatSync(path)
    } catch {
      return
    }
    if (stat.isSymbolicLink()) {
      entries.set(rel, { kind: 'link', target: readlinkSync(path) })
    } else if (stat.isDirectory()) {
      entries.set(rel, { kind: 'dir' })
      for (const name of readdirSync(path)) visit(join(rel, name))
    } else {
      entries.set(rel, stat.isFile() ? { kind: 'file', data: readFileSync(path), mode: stat.mode & 0o7777 } : { kind: 'other' })
    }
  }
  for (const name of readdirSync(gitDir)) visit(name)
  return entries
}

function same(a: Entry, b: Entry): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'file' && b.kind === 'file') return a.mode === b.mode && a.data.equals(b.data)
  if (a.kind === 'link' && b.kind === 'link') return a.target === b.target
  return a.kind === 'dir'
}

export interface GitGuard {
  /** Puts the guarded files back as they were; returns the paths it changed (relative to the git directory). Throws when the git directory was replaced. */
  restore(): string[]
  /** What the guard found, to give back to `guardGitDir` in another process. */
  saved(): SavedGuard
}

function identityOf(gitDir: string): string {
  const stat = lstatSync(gitDir)
  return `${stat.dev}:${stat.ino}`
}

/** A guard of `gitDir` (a real path), as it is now, or as a guard saved it. */
export function guardGitDir(gitDir: string, saved?: SavedGuard): GitGuard {
  const identity = saved?.identity ?? identityOf(gitDir)
  const before: Map<string, Entry> = saved
    ? new Map(saved.entries.map(([rel, entry]) => [rel, entry.kind === 'file' ? { ...entry, data: Buffer.from(entry.data, 'base64') } : entry]))
    : scan(gitDir)
  return {
    restore() {
      let stat
      try {
        stat = lstatSync(gitDir)
      } catch {
        throw new Error(`the git directory ${gitDir} is gone`)
      }
      if (!stat.isDirectory() || `${stat.dev}:${stat.ino}` !== identity) throw new Error(`the git directory ${gitDir} was replaced`)
      const now = scan(gitDir)
      const changed = new Set<string>()
      // What was added or changed goes, the deepest first; then what is missing comes back, the shallowest first.
      for (const [rel, entry] of [...now].sort((a, b) => b[0].length - a[0].length)) {
        const was = before.get(rel)
        if (was && same(was, entry)) continue
        rmSync(join(gitDir, rel), { recursive: true, force: true })
        changed.add(rel)
      }
      for (const [rel, entry] of [...before].sort((a, b) => a[0].length - b[0].length)) {
        const path = join(gitDir, rel)
        try {
          lstatSync(path)
          continue
        } catch {
          // Missing: written back below.
        }
        if (entry.kind === 'dir') mkdirSync(path)
        else if (entry.kind === 'link') symlinkSync(entry.target, path)
        else if (entry.kind === 'file') {
          writeFileSync(path, entry.data, { mode: entry.mode })
          chmodSync(path, entry.mode)
        } else continue
        changed.add(rel)
      }
      return [...changed].sort()
    },
    saved() {
      return { identity, entries: [...before].map(([rel, entry]) => [rel, entry.kind === 'file' ? { ...entry, data: entry.data.toString('base64') } : entry]) }
    },
  }
}
