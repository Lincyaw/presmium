/** What runner.mjs runs. */
export interface WasiRequest {
  lang: string
  code: string
  stdin?: string
  /** Files at the root of the program's file system, path -> content. */
  files?: Record<string, string>
  /** The program's whole environment; the compiler and linker get none. */
  env?: Record<string, string>
}

export interface WasiOutput {
  stdout: string
  stderr: string
  exitCode: number
  /** The text streams as nbformat stream outputs, in the order written. */
  outputs: { output_type: 'stream', name: 'stdout' | 'stderr', text: string }[]
}

/** Loads a file of the runtime directory (`RUNTIMES`). */
export type RuntimeLoader = (file: string) => Promise<Uint8Array>

export type Runtime = 'clang' | 'ruby' | 'sqlite'

export const RUNTIMES: Record<Runtime, string[]>
export function wasiLanguage(lang: string): 'c' | 'cpp' | 'ruby' | 'sql' | undefined
export function runtimeOf(lang: string): Runtime | undefined
export function runsLanguage(lang: string, languages?: string[]): boolean
export function prepare(lang: string, load: RuntimeLoader): Promise<void>
export function runWasi(request: WasiRequest, load: RuntimeLoader): Promise<WasiOutput>
