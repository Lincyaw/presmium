export interface WasiRequest {
  lang: string
  code: string
  stdin?: string
  files?: Record<string, string>
  env?: Record<string, string>
}

export interface WasiOutput {
  stdout: string
  stderr: string
  exitCode: number
  outputs: { output_type: 'stream', name: 'stdout' | 'stderr', text: string }[]
}

export type RuntimeLoader = (file: string) => Promise<Uint8Array>

export type Runtime = 'clang' | 'ruby' | 'sqlite'

export const RUNTIMES: Record<Runtime, string[]>
export function wasiLanguage(lang: string): 'c' | 'cpp' | 'ruby' | 'sql' | undefined
export function runtimeOf(lang: string): Runtime | undefined
export function runsLanguage(lang: string, languages?: string[]): boolean
export function prepare(lang: string, load: RuntimeLoader): Promise<void>
export function runWasi(request: WasiRequest, load: RuntimeLoader): Promise<WasiOutput>
