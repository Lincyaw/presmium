import { sep } from 'node:path'
import type { ProcessSandbox, SandboxResult, SandboxRun } from '@presmium/kernel'
import type { Helper } from './client.ts'
import type { RunAnswer, RunParams } from './protocol.ts'

const base64 = (content: string | Uint8Array) => Buffer.from(typeof content === 'string' ? Buffer.from(content, 'utf8') : content).toString('base64')

const NODE_MODULES = `${sep}node_modules${sep}`

function withPackages(paths: string[]): string[] {
  return [...new Set(paths.flatMap((path) => {
    const at = path.indexOf(NODE_MODULES)
    return at < 0 ? [path] : [path, path.slice(0, at + NODE_MODULES.length - 1)]
  }))]
}

export function deltaboxSandbox(helper: Helper, kind: string, read: string[]): ProcessSandbox {
  return {
    kind,
    async run(request: SandboxRun): Promise<SandboxResult> {
      const params: RunParams = {
        read: withPackages([...read, ...request.read]),
        argv: request.argv,
        files: Object.fromEntries(Object.entries(request.files).map(([path, content]) => [path, base64(content)])),
        collect: request.collect,
        env: { ...request.env },
        timeoutMs: request.timeoutMs,
      }
      const answer = await helper.call<RunAnswer>('run', params, request.signal)
      const files = Object.fromEntries(Object.entries(answer.files).map(([path, content]) => [path, new Uint8Array(Buffer.from(content, 'base64'))]))
      return { exitCode: answer.exitCode, stdout: answer.stdout, stderr: answer.stderr, files }
    },
  }
}
