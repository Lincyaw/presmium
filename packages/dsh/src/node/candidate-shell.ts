import DeltaboxBashExecutor from 'dsh-deltabox/bash'
import { deltaboxOf } from './deltabox-runtime.ts'
type ShellExecSpec = Parameters<DeltaboxBashExecutor['execute']>[0]

/** Keep the native launch directory and policy, then enter the public workspace entry. */
export default class CandidateShell extends DeltaboxBashExecutor {
  resolve(request: Parameters<DeltaboxBashExecutor['resolve']>[0]): ShellExecSpec {
    const paths = deltaboxOf(this.ctx)?.paths
    return super.resolve(paths && request.workdir && paths.isShellPath(request.workdir) ? { ...request, workdir: paths.visible(paths.physical(request.workdir)) } : request)
  }

  async execute(spec: ShellExecSpec) {
    const runtime = deltaboxOf(this.ctx)
    if (process.platform === 'darwin' || !runtime) return super.execute(spec)
    const session = await runtime.acquireCurrent()
    const command = spec.command
    const workdir = spec.workdir
    const physical = runtime.paths.physical(workdir)
    const visible = runtime.paths.visible(physical, session.projectRoot)
    if (visible === physical) return super.execute(spec)
    // Network grants belong to this exact spec object. Never clone it for path translation.
    if (process.platform === 'win32') {
      const drive = runtime.paths.shellDirectory(physical, session.projectRoot)
      if (!drive) throw new Error('The candidate PowerShell directory is unavailable')
      spec.command = `New-PSDrive -Name '${drive.name}' -PSProvider FileSystem -Root '${drive.root.replaceAll("'", "''")}' -Scope Script -ErrorAction Stop | Out-Null; Set-Location -LiteralPath '${drive.path.replaceAll("'", "''")}'; if (-not $?) { exit 1 }; ${command}`
    } else spec.command = `cd -L -- '${visible.replaceAll("'", "'\\''")}' || exit; ${command}`
    spec.workdir = physical
    try { return await super.execute(spec) }
    finally { spec.command = command; spec.workdir = workdir }
  }
}
