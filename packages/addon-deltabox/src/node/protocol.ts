export interface Unqualified {
  ok: false
  reason: 'platform' | 'macos' | 'glibc' | 'binding' | 'start' | 'isolation' | 'degraded' | 'helper'
  detail: string
}

export type Availability =
  | { ok: true, kind: string, version: string, isolation: string }
  | Unqualified

export type Probe = Availability & { recovered?: string[] }

export interface Request {
  id: number
  method: string
  params: Record<string, unknown>
}

export type Answer =
  | { id: number, result: unknown }
  | { id: number, error: string }

export interface RunParams {
  read: string[]
  argv: string[]
  files: Record<string, string>
  collect: string[]
  env: Record<string, string>
  timeoutMs: number
}

export interface RunAnswer {
  exitCode: number | null
  stdout: string
  stderr: string
  files: Record<string, string>
}

export interface BoxChange {
  path: string
  kind: 'added' | 'modified' | 'deleted'
  old_size: number | null
  new_size: number | null
  is_binary: boolean
  added_lines: number
  removed_lines: number
  text_diff?: string
}

export interface ReviewOpened {
  session: string
  root: string
  visibility: 'immediate' | 'on-commit'
}
