import DeltaboxBashExecutor from 'dsh-deltabox/bash'
import { deltaboxOf } from './deltabox-runtime.ts'
type ShellExecSpec = Parameters<DeltaboxBashExecutor['execute']>[0]

/** Keep the native launch directory and policy, then enter the public workspace entry. */
export default class CandidateShell extends DeltaboxBashExecutor {
  async execute(spec: ShellExecSpec) {
    const runtime = deltaboxOf(this.ctx)
    if (process.platform === 'darwin' || !runtime) return super.execute(spec)
    await runtime.acquireCurrent()
    const command = spec.command
    const workdir = spec.workdir
    const physical = runtime.paths.physical(workdir)
    const visible = runtime.paths.visible(physical)
    if (visible === physical) return super.execute(spec)
    // Network grants belong to this exact spec object. Never clone it for path translation.
    spec.workdir = physical
    spec.command = process.platform === 'win32'
      ? `Set-Location -LiteralPath '${visible.replaceAll("'", "''")}'; if (-not $?) { exit 1 }; ${command}`
      : `cd -L -- '${visible.replaceAll("'", "'\\''")}' || exit; ${command}`
    try { return await super.execute(spec) }
    finally { spec.command = command; spec.workdir = workdir }
  }
}
