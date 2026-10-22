import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'

type Entry = { kind: 'file', data: Buffer, mode: number } | { kind: 'link', target: string } | { kind: 'dir' } | { kind: 'other' }

export interface SavedGitDir {
  identity: string
  entries: [string, { kind: 'file', data: string, mode: number } | { kind: 'link', target: string } | { kind: 'dir' } | { kind: 'other' }][]
}

const UNGUARDED = new Set(['refs', 'logs', 'lfs'])

function isUnguarded(parts: string[]): boolean {
  const name = parts.at(-1)!
  if (name === 'index' || name.endsWith('.lock')) return true
  return parts.some((part, i) => UNGUARDED.has(part) || (part === 'objects' && i + 1 < parts.length && parts[i + 1] !== 'info'))
}

function scan(gitDir: string): Map<string, Entry> {
  const entries = new Map<string, Entry>()
  const visit = (rel: string) => {
    if (isUnguarded(rel.split(sep))) return
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

function isSameEntry(a: Entry, b: Entry): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'file' && b.kind === 'file') return a.mode === b.mode && a.data.equals(b.data)
  if (a.kind === 'link' && b.kind === 'link') return a.target === b.target
  return a.kind === 'dir'
}

/** What a git directory held, to put it back as it was: `restore` returns the paths it changed. */
export interface GitDirSnapshot {
  restore(): string[]
  saved(): SavedGitDir
}

function identityOf(gitDir: string): string {
  const stat = lstatSync(gitDir)
  return `${stat.dev}:${stat.ino}`
}

export function snapshotGitDir(gitDir: string, saved?: SavedGitDir): GitDirSnapshot {
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
      for (const [rel, entry] of [...now].sort((a, b) => b[0].length - a[0].length)) {
        const was = before.get(rel)
        if (was && isSameEntry(was, entry)) continue
        rmSync(join(gitDir, rel), { recursive: true, force: true })
        changed.add(rel)
      }
      for (const [rel, entry] of [...before].sort((a, b) => a[0].length - b[0].length)) {
        const path = join(gitDir, rel)
        try {
          lstatSync(path)
          continue
        } catch {
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
