/** What runner.mjs runs: code with its arguments; TypeScript has its types removed first. */
export interface ScriptRequest {
  code: string
  args?: Record<string, string>
  typescript?: boolean
}

export interface ScriptOutput {
  stdout: string
  stderr: string
  exitCode: number
}

export function prepare(request: ScriptRequest): string
export function runScript(request: ScriptRequest): Promise<ScriptOutput>
