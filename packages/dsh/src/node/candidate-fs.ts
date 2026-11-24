import SandboxedFileSystem from '@deepseek-ai/dsh-fs-sandbox'
import { FsError } from '@deepseek-ai/dsh-fs'

type Target = Parameters<SandboxedFileSystem['writeText']>[0]
type Policy = Parameters<SandboxedFileSystem['writeText']>[4]

/** Through-mode files keep stable observation identities and the same candidate-only write fence as DeltaBox. */
export default class CandidateFileSystem extends SandboxedFileSystem {
  private protectState(target: Target): void {
    if (this.processPath(target).split(/[\\/]/).some(part => part === '.deltabox' || part === '.deltabox-lite-state')) {
      throw new FsError(`cannot access "${target.displayPath}": DeltaBox state is protected`, 'FS_SANDBOX_DENIED')
    }
  }

  private async candidateTarget(target: Target, policy: Policy): Promise<Target> {
    this.protectState(target)
    const active = policy ?? (this.ctx.get('sandboxPolicy') as { resolve(): NonNullable<Policy> }).resolve()
    if (active.mode !== 'workspace-write') return target
    const [root, fresh] = await Promise.all([this.resolve(active.workspaceRoot), this.resolve(target.displayPath)])
    this.protectState(fresh)
    if (!this.contains(root, fresh)) throw new FsError(`cannot write "${target.displayPath}": file access denied outside the candidate workspace`, 'FS_SANDBOX_DENIED')
    return fresh
  }

  async readText(...args: Parameters<SandboxedFileSystem['readText']>): ReturnType<SandboxedFileSystem['readText']> {
    this.protectState(args[0])
    return super.readText(...args)
  }

  async streamText(...args: Parameters<SandboxedFileSystem['streamText']>): ReturnType<SandboxedFileSystem['streamText']> {
    this.protectState(args[0])
    return super.streamText(...args)
  }

  async readBytes(...args: Parameters<SandboxedFileSystem['readBytes']>): ReturnType<SandboxedFileSystem['readBytes']> {
    this.protectState(args[0])
    return super.readBytes(...args)
  }

  async readByteRange(...args: Parameters<SandboxedFileSystem['readByteRange']>): ReturnType<SandboxedFileSystem['readByteRange']> {
    this.protectState(args[0])
    return super.readByteRange(...args)
  }

  async writeText(...args: Parameters<SandboxedFileSystem['writeText']>): ReturnType<SandboxedFileSystem['writeText']> {
    args[0] = await this.candidateTarget(args[0], args[4])
    return super.writeText(...args)
  }

  async editText(...args: Parameters<SandboxedFileSystem['editText']>): ReturnType<SandboxedFileSystem['editText']> {
    args[0] = await this.candidateTarget(args[0], args[4])
    return super.editText(...args)
  }

  async patchText(...args: Parameters<SandboxedFileSystem['patchText']>): ReturnType<SandboxedFileSystem['patchText']> {
    args[0] = await this.candidateTarget(args[0], args[4])
    return super.patchText(...args)
  }

  async deleteFile(...args: Parameters<SandboxedFileSystem['deleteFile']>): ReturnType<SandboxedFileSystem['deleteFile']> {
    args[0] = await this.candidateTarget(args[0], args[3])
    return super.deleteFile(...args)
  }

  async moveFile(...args: Parameters<SandboxedFileSystem['moveFile']>): ReturnType<SandboxedFileSystem['moveFile']> {
    const [source, destination] = await Promise.all([this.candidateTarget(args[0], args[4]), this.candidateTarget(args[1], args[4])])
    args[0] = source
    args[1] = destination
    return super.moveFile(...args)
  }
}
