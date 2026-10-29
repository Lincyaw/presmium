import { spawn } from 'node:child_process'
import { runtimeBin } from './runtime.ts'

export async function installProjectSkills(options: { directory: string, extensionPath: string, runtime: string, signal: AbortSignal }): Promise<{ installed: string[], skipped: string[] }> {
  options.signal.throwIfAborted()
  const bin = runtimeBin('@lincyaw/skills', 'presmium-skills', options.directory, options.extensionPath)
  if (!bin) throw new Error('skills-not-installed')
  const stdout = await new Promise<string>((resolve, reject) => {
    // EOF is cooperative on every platform. Windows SIGTERM would terminate before the installer rolls back.
    const child = spawn(options.runtime, [bin, 'install', options.directory, '--json', '--parent-stdin'], {
      cwd: options.directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = '', length = 0, failure: string | undefined, force: ReturnType<typeof setTimeout> | undefined
    const cancel = (reason: string) => {
      if (failure) return
      failure = reason
      child.stdin.end()
      force = setTimeout(() => child.kill('SIGKILL'), 5_000)
    }
    const aborted = () => cancel('skills-install-cancelled')
    const timeout = setTimeout(() => cancel('skills-install-timeout'), 30_000)
    const cleanup = () => { clearTimeout(timeout); if (force) clearTimeout(force); options.signal.removeEventListener('abort', aborted) }
    options.signal.addEventListener('abort', aborted, { once: true })
    if (options.signal.aborted) aborted()
    child.stdin.on('error', () => { /* A child can finish before cancellation closes its input. */ })
    child.stdout.on('data', (data: Buffer) => {
      length += data.length
      if (length > 64 << 10) cancel('skills-install-response-invalid')
      else output += data.toString('utf8')
    })
    child.stderr.resume()
    child.once('error', error => { cleanup(); reject(error) })
    child.once('close', code => {
      cleanup()
      if (failure || code !== 0) reject(new Error(failure ?? 'skills-install-failed'))
      else resolve(output)
    })
  })
  const answer: unknown = JSON.parse(stdout)
  if (!answer || typeof answer !== 'object' || !('installed' in answer) || !('skipped' in answer)
    || !Array.isArray(answer.installed) || !Array.isArray(answer.skipped)
    || ![...answer.installed, ...answer.skipped].every(name => typeof name === 'string')) throw new Error('skills-install-response-invalid')
  return { installed: answer.installed, skipped: answer.skipped }
}
