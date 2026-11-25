import { createHash, randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { lstat, mkdir, readlink, realpath, rename, rm, symlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, win32 } from 'node:path'
import { acquireCandidateLease, isInside } from '@lincyaw/kernel/node'
import { WindowsCandidateDevices } from './windows-candidate-device.ts'

const key = (value: string) => createHash('sha256').update(value).digest('hex')
const coordinate = (value: string) => {
  const absolute = resolve(value)
  return process.platform === 'win32' ? (absolute.startsWith('\\\\?\\') ? absolute.slice(4) : absolute).toLowerCase() : absolute
}
const candidateRoot = (value: string) => {
  try { return coordinate(realpathSync(value)) } catch { return coordinate(value) }
}

/** An execution-world entry, separate from DeltaBox's replaceable private view. */
export class CandidatePaths {
  readonly #views = new Map<string, { root: string, view: string, path: string, active: boolean, release: () => Promise<void> }>()
  readonly #pending = new Map<string, Promise<string>>()
  readonly #lifecycle = new AbortController()
  readonly #scope = new AsyncLocalStorage<string>()
  readonly #devices = process.platform === 'win32' ? new WindowsCandidateDevices() : undefined
  readonly #base = process.platform === 'win32'
    ? join(homedir(), 'AppData', 'Local', 'Presmium', 'agent-entries')
    : join('/tmp', `presmium-agent-${process.getuid!()}`)

  pathFor(root: string): string {
    return process.platform === 'win32' ? `\\\\?\\pm${key(candidateRoot(root)).slice(0, 32)}\\` : join(this.#base, key(candidateRoot(root)), 'workspace')
  }
  withRoot<T>(root: string, operation: () => T): T { return this.#scope.run(candidateRoot(root), operation) }

  /** Only the host may replace this entry; an ordinary sandboxed command cannot unlink it. */
  async install(root: string, view: string): Promise<string> {
    root = candidateRoot(root)
    const previous = this.#pending.get(root) ?? Promise.resolve('')
    const pending = previous.catch(() => '').then(() => this.#install(root, view))
    this.#pending.set(root, pending)
    try { return await pending } finally { if (this.#pending.get(root) === pending) this.#pending.delete(root) }
  }

  async #install(root: string, view: string): Promise<string> {
    this.#lifecycle.signal.throwIfAborted()
    let known = this.#views.get(root)
    const path = this.pathFor(root)
    // WinFsp presents a network volume: use a real DOS device instead of an NTFS junction.
    if (process.platform === 'win32') {
      const metadata = join(this.#base, key(root), 'workspace')
      await this.#directory(this.#base)
      const release = known?.release ?? await acquireCandidateLease(metadata, this.#lifecycle.signal)
      try {
        this.#devices!.set(`pm${key(root).slice(0, 32)}`, view)
        this.#views.set(root, { root, view, path, active: true, release })
        return path
      } catch (error) { if (!known) await release(); throw error }
    }
    if (known?.active && known.view === view) {
      const entry = await lstat(known.path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (entry && !entry.isSymbolicLink()) throw new Error('The candidate entry is not a host-owned link')
      if (entry && entry.uid !== process.getuid!()) throw new Error('The candidate entry has another owner')
      if (entry && coordinate(await readlink(known.path)) === coordinate(view)) return known.path
    }
    await this.#directory(this.#base)
    await this.#directory(resolve(path, '..'))
    const release = known?.release ?? await acquireCandidateLease(path, this.#lifecycle.signal)
    try {
      const entry = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (entry && !entry.isSymbolicLink()) throw new Error('The candidate entry is not a host-owned link')
      if (entry && entry.uid !== process.getuid!()) throw new Error('The candidate entry has another owner')
      if (!entry || coordinate(await readlink(path)) !== coordinate(view)) {
        const next = `${path}.${randomUUID()}`
        await symlink(view, next, 'dir')
        try {
          await rename(next, path)
        } finally { await rm(next, { force: true }) }
      }
      if (coordinate(await realpath(path)) !== coordinate(await realpath(view))) throw new Error('The candidate entry did not reach its private view')
      known = { root, view, path, active: true, release }
      this.#views.set(root, known)
      return path
    } catch (error) { if (!known) await release(); throw error }
  }

  async #directory(path: string): Promise<void> {
    await mkdir(path, { recursive: true, mode: 0o700 })
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The candidate entry directory is not a private directory')
    if (process.platform !== 'win32' && (info.uid !== process.getuid!() || (info.mode & 0o077) !== 0)) throw new Error('The candidate entry directory is not private to its owner')
  }

  shellDirectory(path: string, root: string): { name: string, root: string, path: string } | undefined {
    const item = this.#views.get(candidateRoot(root))
    if (item?.active && isInside(path, item.view)) {
      const name = `pm${key(item.root).slice(0, 32)}`
      return { name, root: item.path, path: `${name}:\\${relative(item.view, path)}` }
    }
    return undefined
  }

  isShellPath(path: string): boolean {
    return process.platform === 'win32' && [...this.#views.values()].some(item => path.toLowerCase().startsWith(`pm${key(item.root).slice(0, 32)}:\\`))
  }

  /** Resolve '..' in the public namespace before translating into the private view. */
  physical(path: string, cwd?: string): string {
    if (this.isShellPath(path)) {
      for (const item of this.#views.values()) {
        const prefix = `pm${key(item.root).slice(0, 32)}:\\`
        if (path.toLowerCase().startsWith(prefix)) {
          if (!item.active) throw new Error('The candidate directory is unavailable')
          return join(item.view, win32.relative('P:\\', win32.resolve('P:\\', path.slice(prefix.length))))
        }
      }
    }
    const directory = cwd && this.isShellPath(cwd) ? this.visible(this.physical(cwd)) : cwd
    const absolute = isAbsolute(path) ? resolve(path) : resolve(directory ?? process.cwd(), path)
    for (const item of this.#views.values()) for (const source of [item.path, item.root]) if (isInside(absolute, source)) {
      if (!item.active) throw new Error('The candidate directory is unavailable')
      return join(item.view, relative(source, absolute))
    }
    if (process.platform === 'win32' && /^\\\\[?.]\\pm[0-9a-f]{32}(?:\\|$)/i.test(absolute)) throw new Error('The candidate directory is unavailable')
    return absolute
  }

  visible(path: string, hint?: string): string {
    const preferred = this.#scope.getStore() ?? (hint && [...this.#views.values()].find(item => hint === item.root || isInside(hint, item.root))?.root)
    const views = preferred ? [this.#views.get(preferred)].filter(item => item !== undefined) : [...this.#views.values()]
    const matches: string[] = []
    for (const item of views) {
      if (!item.active) continue
      for (const source of [item.view, item.root]) if (isInside(path, source)) { matches.push(join(item.path, relative(source, path))); break }
    }
    return matches.length === 1 ? matches[0]! : path
  }

  async close(): Promise<void> {
    this.#lifecycle.abort()
    await Promise.allSettled(this.#pending.values())
    await Promise.all([...this.#views.values()].map(async item => {
      try { if (this.#devices) this.#devices.remove(`pm${key(item.root).slice(0, 32)}`); else await rm(item.path, { force: true }) } finally { await item.release() }
    }))
    this.#views.clear()
  }

  async remove(root: string): Promise<void> {
    root = candidateRoot(root)
    await this.#pending.get(root)
    const item = this.#views.get(root)
    if (!item) return
    try { if (this.#devices) this.#devices.remove(`pm${key(item.root).slice(0, 32)}`); else await rm(item.path, { force: true }) } finally { this.#views.delete(root); await item.release() }
  }

  async detach(root: string): Promise<void> {
    root = candidateRoot(root)
    await this.#pending.get(root)
    const item = this.#views.get(root)
    if (!item) return
    item.active = false
    if (this.#devices) this.#devices.remove(`pm${key(item.root).slice(0, 32)}`)
    else await rm(item.path, { force: true })
  }
}
