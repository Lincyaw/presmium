import DeltaboxFileSystem from 'dsh-deltabox/fs'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { isAbsolute } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { deltaboxOf } from './deltabox-runtime.ts'

/** Translate public coordinates only. The official provider retains every target and version guard. */
export default abstract class CandidateViewFileSystem extends DeltaboxFileSystem {
  // The delegate also calls its own public coordinate methods. Keep its native coordinates
  // intact inside those operations; translate only when a consumer asks for a process path.
  readonly #delegate = new AsyncLocalStorage<boolean>()

  async resolve(path: string, opts?: { cwd?: string, signal?: AbortSignal }): Promise<FsTarget> {
    const paths = deltaboxOf(this.ctx)?.paths
    return this.#delegate.run(true, () => super.resolve(paths && (isAbsolute(path) || opts?.cwd) ? paths.physical(path, opts?.cwd) : path, opts))
  }

  processPath(target: FsTarget): string {
    const path = super.processPath(target)
    if (this.#delegate.getStore()) return path
    return deltaboxOf(this.ctx)?.paths.visible(path) ?? path
  }

  lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal) {
    const paths = deltaboxOf(this.ctx)?.paths
    return this.#delegate.run(true, () => super.lstat(paths && (isAbsolute(path) || opts?.cwd) ? paths.physical(path, opts?.cwd) : path, opts, signal))
  }

  stat(...args: Parameters<DeltaboxFileSystem['stat']>) { return this.#delegate.run(true, () => super.stat(...args)) }
  contains(...args: Parameters<DeltaboxFileSystem['contains']>) { return this.#delegate.run(true, () => super.contains(...args)) }
  fileUrl(...args: Parameters<DeltaboxFileSystem['fileUrl']>) { return this.#delegate.run(true, () => super.fileUrl(...args)) }
  watch(...args: Parameters<DeltaboxFileSystem['watch']>) { return this.#delegate.run(true, () => super.watch(...args)) }
  readText(...args: Parameters<DeltaboxFileSystem['readText']>) { return this.#delegate.run(true, () => super.readText(...args)) }
  streamText(...args: Parameters<DeltaboxFileSystem['streamText']>) { return this.#delegate.run(true, () => super.streamText(...args)) }
  readBytes(...args: Parameters<DeltaboxFileSystem['readBytes']>) { return this.#delegate.run(true, () => super.readBytes(...args)) }
  readByteRange(...args: Parameters<DeltaboxFileSystem['readByteRange']>) { return this.#delegate.run(true, () => super.readByteRange(...args)) }
  listDir(...args: Parameters<DeltaboxFileSystem['listDir']>) { return this.#delegate.run(true, () => super.listDir(...args)) }
  writeText(...args: Parameters<DeltaboxFileSystem['writeText']>) { return this.#delegate.run(true, () => super.writeText(...args)) }
  editText(...args: Parameters<DeltaboxFileSystem['editText']>) { return this.#delegate.run(true, () => super.editText(...args)) }
}
