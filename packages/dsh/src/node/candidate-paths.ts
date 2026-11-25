import { createHash, randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { lstat, mkdir, readlink, realpath, rename, rm, symlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, win32 } from 'node:path'
import { acquireCandidateLease, isInside } from '@lincyaw/kernel/node'
import { WindowsCandidateDevices } from './windows-candidate-device.ts'

const key = (value: string) => createHash('sha256').update(value).digest('hex')
const nativePath = (value: string) => process.platform !== 'win32' ? value : value.startsWith('\\\\?\\UNC\\') ? `\\\\${value.slice(8)}` : /^[\\]{2}\?[\\][a-z]:/i.test(value) ? value.slice(4) : value
const coordinate = (value: string) => {
  const absolute = nativePath(resolve(value))
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}
const candidateRoot = (value: string) => {
  try { return coordinate(realpathSync.native(value)) } catch { return coordinate(value) }
}

/** An execution-world entry, separate from DeltaBox's replaceable private view. */
export class CandidatePaths {
  readonly #views = new Map<string, { root: string, view: string, canonicalView: string, path: string, active: boolean, release: () => Promise<void> }>()
  readonly #mutations = new Map<string, Promise<unknown>>()
  readonly #lifecycle = new AbortController()
  readonly #attempts = new Map<string, AbortController>()
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
  async install(root: string, view: string, valid: () => boolean = () => true): Promise<string> {
    this.#lifecycle.signal.throwIfAborted()
    root = candidateRoot(root)
    let attempt = this.#attempts.get(root)
    if (!attempt) this.#attempts.set(root, attempt = new AbortController())
    const signal = AbortSignal.any([this.#lifecycle.signal, attempt.signal])
    return this.#mutate(root, () => this.#install(root, view, valid, signal))
  }

  async #mutate<T>(root: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#mutations.get(root) ?? Promise.resolve()
    const pending = previous.catch(() => {}).then(operation)
    this.#mutations.set(root, pending)
    try { return await pending } finally { if (this.#mutations.get(root) === pending) this.#mutations.delete(root) }
  }

  async #install(root: string, view: string, valid: () => boolean, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    if (!valid()) throw new Error('The candidate view has retired')
    let known = this.#views.get(root)
    const path = this.pathFor(root)
    // WinFsp presents a network volume: use a real DOS device instead of an NTFS junction.
    if (process.platform === 'win32') {
      const target = this.#devices!.volumeTarget(view)
      const canonicalView = nativePath(realpathSync.native(view))
      const metadata = join(this.#base, key(root), 'workspace')
      await this.#directory(this.#base)
      const release = known?.release ?? await acquireCandidateLease(metadata, signal)
      try {
        signal.throwIfAborted()
        if (!valid()) throw new Error('The candidate view has retired')
        this.#devices!.set(`pm${key(root).slice(0, 32)}`, target)
        this.#views.set(root, { root, view, canonicalView, path, active: true, release })
        return path
      } catch (error) { if (!known) await release(); throw error }
    }
    if (known?.active && known.view === view) {
      const entry = await lstat(known.path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (entry && !entry.isSymbolicLink()) throw new Error('The candidate entry is not a host-owned link')
      if (entry && entry.uid !== process.getuid!()) throw new Error('The candidate entry has another owner')
      if (entry && coordinate(await readlink(known.path)) === coordinate(view)) {
        signal.throwIfAborted()
        if (!valid()) throw new Error('The candidate view has retired')
        return known.path
      }
    }
    await this.#directory(this.#base)
    await this.#directory(resolve(path, '..'))
    const release = known?.release ?? await acquireCandidateLease(path, signal)
    let replaced = false
    try {
      signal.throwIfAborted()
      if (!valid()) throw new Error('The candidate view has retired')
      const entry = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (entry && !entry.isSymbolicLink()) throw new Error('The candidate entry is not a host-owned link')
      if (entry && entry.uid !== process.getuid!()) throw new Error('The candidate entry has another owner')
      if (!entry || coordinate(await readlink(path)) !== coordinate(view)) {
        const next = `${path}.${randomUUID()}`
        await symlink(view, next, 'dir')
        try {
          await rename(next, path)
          replaced = true
        } finally { await rm(next, { force: true }) }
      }
      if (coordinate(await realpath(path)) !== coordinate(await realpath(view))) throw new Error('The candidate entry did not reach its private view')
      signal.throwIfAborted()
      if (!valid()) throw new Error('The candidate view has retired')
      known = { root, view, canonicalView: view, path, active: true, release }
      this.#views.set(root, known)
      return path
    } catch (error) {
      if (!known) {
        try { if (replaced && (await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error }))?.isSymbolicLink()) await rm(path, { force: true }) }
        finally { await release() }
      }
      throw error
    }
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
      return { name, root: item.view, path: `${name}:\\${relative(item.view, path)}` }
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
    const absolute = nativePath(isAbsolute(path) ? resolve(path) : resolve(directory ?? process.cwd(), path))
    for (const item of this.#views.values()) for (const source of [item.path, item.root, item.canonicalView]) if (isInside(absolute, source)) {
      if (!item.active) throw new Error('The candidate directory is unavailable')
      return join(item.view, relative(source, absolute))
    }
    if (process.platform === 'win32' && /^\\\\[?.]\\pm[0-9a-f]{32}(?:\\|$)/i.test(absolute)) throw new Error('The candidate directory is unavailable')
    return absolute
  }

  visible(path: string, hint?: string): string {
    path = nativePath(path)
    const preferred = this.#scope.getStore() ?? (hint && [...this.#views.values()].find(item => hint === item.root || isInside(hint, item.root))?.root)
    const views = preferred ? [this.#views.get(preferred)].filter(item => item !== undefined) : [...this.#views.values()]
    const matches: string[] = []
    for (const item of views) {
      if (!item.active) continue
      for (const source of [item.view, item.canonicalView, item.root]) if (isInside(path, source)) { matches.push(join(item.path, relative(source, path))); break }
    }
    return matches.length === 1 ? matches[0]! : path
  }

  async close(): Promise<void> {
    this.cancelPending()
    await Promise.allSettled(this.#mutations.values())
    await Promise.all([...this.#views.keys()].map(root => this.remove(root)))
    await Promise.allSettled(this.#mutations.values())
    this.#attempts.clear()
  }

  async remove(root: string): Promise<void> {
    root = candidateRoot(root)
    this.unavailable(root)
    return this.#mutate(root, async () => {
      const item = this.#views.get(root)
      if (!item) return
      this.#views.delete(root)
      try { if (this.#devices) this.#devices.remove(`pm${key(item.root).slice(0, 32)}`); else await rm(item.path, { force: true }) } finally { await item.release() }
    })
  }

  async detach(root: string): Promise<void> {
    root = candidateRoot(root)
    this.unavailable(root)
    return this.#mutate(root, async () => {
      const item = this.#views.get(root)
      if (!item) return
      item.active = false
      if (this.#devices) this.#devices.remove(`pm${key(item.root).slice(0, 32)}`)
      else await rm(item.path, { force: true })
    })
  }

  unavailable(root: string): void {
    root = candidateRoot(root)
    this.#attempts.get(root)?.abort()
    this.#attempts.delete(root)
    const item = this.#views.get(root)
    if (item) item.active = false
  }

  cancelPending(): void { this.#lifecycle.abort() }
}
