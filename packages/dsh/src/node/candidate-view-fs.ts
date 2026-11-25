import DeltaboxFileSystem from 'dsh-deltabox/fs'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { isAbsolute } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { deltaboxOf } from './deltabox-runtime.ts'

/** Translate public coordinates only. The official provider retains every target and version guard. */
export default abstract class CandidateViewFileSystem extends DeltaboxFileSystem {
  // The delegate also calls its own public coordinate methods. Keep its native coordinates
  // intact inside those operations; translate only when a consumer asks for a process path.
  private readonly delegate = new AsyncLocalStorage<boolean>()

  async resolve(path: string, opts?: { cwd?: string, signal?: AbortSignal }): Promise<FsTarget> {
    const paths = deltaboxOf(this.ctx)?.paths
    return this.delegate.run(true, () => super.resolve(paths && (isAbsolute(path) || opts?.cwd) ? paths.physical(path, opts?.cwd) : path, opts))
  }

  processPath(target: FsTarget): string {
    const path = super.processPath(target)
    if (this.delegate.getStore()) return path
    return deltaboxOf(this.ctx)?.paths.visible(path) ?? path
  }

  lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal) {
    const paths = deltaboxOf(this.ctx)?.paths
    return this.delegate.run(true, () => super.lstat(paths && (isAbsolute(path) || opts?.cwd) ? paths.physical(path, opts?.cwd) : path, opts, signal))
  }

  stat(...args: Parameters<DeltaboxFileSystem['stat']>) { return this.delegate.run(true, () => super.stat(...args)) }
  contains(...args: Parameters<DeltaboxFileSystem['contains']>) { return this.delegate.run(true, () => super.contains(...args)) }
  fileUrl(...args: Parameters<DeltaboxFileSystem['fileUrl']>) { return this.delegate.run(true, () => super.fileUrl(...args)) }
  async watch(target: FsTarget, changed: (error?: Error) => void, signal: AbortSignal) {
    const consumer = this.delegate.getStore() ?? false
    const close = await this.delegate.run(true, () => super.watch(target, error => this.delegate.run(consumer, () => changed(error)), signal))
    return () => this.delegate.run(true, close)
  }
  readText(...args: Parameters<DeltaboxFileSystem['readText']>) { return this.delegate.run(true, () => super.readText(...args)) }
  async streamText(...args: Parameters<DeltaboxFileSystem['streamText']>): Promise<AsyncIterable<string>> {
    const stream = await this.delegate.run(true, () => super.streamText(...args))
    const delegate = this.delegate
    return { [Symbol.asyncIterator]() {
      const iterator = delegate.run(true, () => stream[Symbol.asyncIterator]())
      const wrapped: AsyncIterator<string> = {
        next: value => delegate.run(true, () => iterator.next(value)),
        ...iterator.return ? { return: (value: string) => delegate.run(true, () => iterator.return!(value)) } : {},
        ...iterator.throw ? { throw: (error: unknown) => delegate.run(true, () => iterator.throw!(error)) } : {},
      }
      return wrapped
    } }
  }
  readBytes(...args: Parameters<DeltaboxFileSystem['readBytes']>) { return this.delegate.run(true, () => super.readBytes(...args)) }
  readByteRange(...args: Parameters<DeltaboxFileSystem['readByteRange']>) { return this.delegate.run(true, () => super.readByteRange(...args)) }
  listDir(...args: Parameters<DeltaboxFileSystem['listDir']>) { return this.delegate.run(true, () => super.listDir(...args)) }
  writeText(...args: Parameters<DeltaboxFileSystem['writeText']>) { return this.delegate.run(true, () => super.writeText(...args)) }
  editText(...args: Parameters<DeltaboxFileSystem['editText']>) { return this.delegate.run(true, () => super.editText(...args)) }
}
