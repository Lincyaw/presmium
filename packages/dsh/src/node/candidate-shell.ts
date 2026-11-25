import { join, relative } from 'node:path'
import DeltaboxBashExecutor from 'dsh-deltabox/bash'
import { deltaboxOf } from './deltabox-runtime.ts'
type ShellExecSpec = Parameters<DeltaboxBashExecutor['execute']>[0]

/** Resolve the complete native command before an execution-bound network grant is issued. */
export default class CandidateShell extends DeltaboxBashExecutor {
  resolve(request: Parameters<DeltaboxBashExecutor['resolve']>[0]): ShellExecSpec {
    const runtime = deltaboxOf(this.ctx)
    const paths = runtime?.paths
    const spec = super.resolve(paths && request.workdir && paths.isShellPath(request.workdir) ? { ...request, workdir: paths.visible(paths.physical(request.workdir)) } : request)
    if (process.platform === 'darwin' || !runtime) return spec
    const session = runtime.currentSession()
    const command = spec.command
    const workdir = spec.workdir
    const physical = runtime.paths.physical(workdir)
    const visible = runtime.paths.visible(physical, session.projectRoot)
    if (visible === physical) return spec
    // Grants bind both this spec's identity and its resolved content. Execution must not change either.
    if (process.platform === 'win32') {
      const drive = runtime.paths.shellDirectory(physical, session.projectRoot)
      if (!drive) throw new Error('The candidate PowerShell directory is unavailable')
      spec.command = `New-PSDrive -Name '${drive.name}' -PSProvider FileSystem -Root '${drive.root.replaceAll("'", "''")}' -Scope Script -ErrorAction Stop | Out-Null; Set-Location -LiteralPath '${drive.path.replaceAll("'", "''")}'; if (-not $?) { exit 1 }; ${command}`
      spec.workdir = join(session.projectRoot, relative(drive.root, drive.workdir))
    } else spec.command = `cd -L -- '${visible.replaceAll("'", "'\\''")}' || exit; ${command}`
    if (process.platform !== 'win32') spec.workdir = physical
    return spec
  }
}
