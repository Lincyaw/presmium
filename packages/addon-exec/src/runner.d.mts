/** What runner.mjs runs: code with its arguments; TypeScript has its types removed first. */
export interface ScriptRequest {
  code: string
  args?: Record<string, string>
  typescript?: boolean
  /** Module names the code imports and their URLs, as an import map gives them (the browser's script worker). */
  imports?: Record<string, string>
}

export interface ScriptOutput {
  stdout: string
  stderr: string
  exitCode: number
  /** The text streams as nbformat stream outputs, in the order written. */
  outputs: { output_type: 'stream', name: 'stdout' | 'stderr', text: string }[]
}

export function prepare(request: ScriptRequest): string
export function runScript(request: ScriptRequest): Promise<ScriptOutput>
