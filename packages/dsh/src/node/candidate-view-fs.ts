import DeltaboxFileSystem from 'dsh-deltabox/fs'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { isAbsolute } from 'node:path'
import { deltaboxOf } from './deltabox-runtime.ts'

/** Translate public coordinates only. The official provider retains every target and version guard. */
export default abstract class CandidateViewFileSystem extends DeltaboxFileSystem {
  async resolve(path: string, opts?: { cwd?: string, signal?: AbortSignal }): Promise<FsTarget> {
    const paths = deltaboxOf(this.ctx)?.paths
    return super.resolve(paths && (isAbsolute(path) || opts?.cwd) ? paths.physical(path, opts?.cwd) : path, opts)
  }

  processPath(target: FsTarget): string {
    const path = super.processPath(target)
    return deltaboxOf(this.ctx)?.paths.visible(path) ?? path
  }

  lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal) {
    const paths = deltaboxOf(this.ctx)?.paths
    return super.lstat(paths && (isAbsolute(path) || opts?.cwd) ? paths.physical(path, opts?.cwd) : path, opts, signal)
  }
}
