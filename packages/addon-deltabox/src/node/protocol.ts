/**
 * What the plugin (./client.ts) and its helper process (./helper.ts) say to
 * each other: one JSON object per line, requests on the helper's standard
 * input, answers on its standard output. File contents travel in base64.
 */

/** Why this host does not qualify (docs/architecture.md 10.6); `detail` is deltabox's or the system's own words. */
export interface Unqualified {
  ok: false
  reason: 'platform' | 'macos' | 'glibc' | 'binding' | 'start' | 'isolation' | 'degraded' | 'helper'
  detail: string
}

export type Availability =
  | { ok: true, kind: string, version: string, isolation: string }
  | Unqualified

/** What `helper.ts probe` prints: whether the host qualifies, and the document directories of crashed sessions it restored. */
export type Probe = Availability & { recovered?: string[] }

export interface Request {
  id: number
  method: string
  params: Record<string, unknown>
}

export type Answer =
  | { id: number, result: unknown }
  | { id: number, error: string }

/** `run`: one command in a warm session whose project is a run directory of its own (`SandboxRun`). */
export interface RunParams {
  /** Absolute paths it may read besides the system's and the run directory. */
  read: string[]
  argv: string[]
  /** Relative path to base64. */
  files: Record<string, string>
  collect: string[]
  env: Record<string, string>
  timeoutMs: number
}

export interface RunAnswer {
  exitCode: number | null
  stdout: string
  stderr: string
  /** Relative path to base64, for the files of `collect` that exist. */
  files: Record<string, string>
}

/**
 * A change as deltabox reports it, with the path relative to the document
 * directory. A directory is listed too, with neither size; the helper leaves
 * it out, so the plugin gets files and links only.
 */
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
  /** The session's view of the document directory. */
  root: string
  visibility: 'immediate' | 'on-commit'
}
