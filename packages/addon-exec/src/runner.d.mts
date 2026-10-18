export interface ScriptRequest {
  code: string
  args?: Record<string, string>
  typescript?: boolean
  imports?: Record<string, string>
}

export interface ScriptOutput {
  stdout: string
  stderr: string
  exitCode: number
  outputs: { output_type: 'stream', name: 'stdout' | 'stderr', text: string }[]
}

export function prepare(request: ScriptRequest): string
export function runScript(request: ScriptRequest): Promise<ScriptOutput>
