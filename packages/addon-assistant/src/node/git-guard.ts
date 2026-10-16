/**
 * The git directory's files through which git runs code (`config`: hooks
 * path, filter drivers, aliases; `hooks/`; `info/`: attributes naming
 * filter drivers), kept as a change task found them when the document
 * directory holds the git directory (a single-deck repository, LOCAL). An
 * agent's file tools may write there without asking (the bundled DeepSeek
 * Harness's sandbox lets it write anywhere in its working directory), git
 * does not track `.git/`, so no review shows the write, and git would run
 * what it planted: the review's own commands at once, the user's later.
 * The git review puts them back before its commands; a git directory that
 * is no longer the one the task found (replaced, or made a link) stops the
 * review instead.
 */
import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const GUARDED = ['config', 'hooks', 'info']

type Entry = { kind: 'file', data: Buffer, mode: number } | { kind: 'link', target: string } | { kind: 'dir' } | { kind: 'other' }

/** The guarded entries of a git directory, by path relative to it. */
function scan(gitDir: string): Map<string, Entry> {
  const entries = new Map<string, Entry>()
  const visit = (rel: string) => {
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
  for (const name of GUARDED) visit(name)
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
}

/** A guard of `gitDir` (a real path), as it is now. */
export function guardGitDir(gitDir: string): GitGuard {
  const identity = (() => {
    const stat = lstatSync(gitDir)
    return `${stat.dev}:${stat.ino}`
  })()
  const before = scan(gitDir)
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
  }
}
