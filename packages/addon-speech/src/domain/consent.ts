/**
 * Consent records for cloned voices (N-08, docs/ir.md 9.1): operator data
 * at `<consentDir>/<engine>/<voice>.json` of the operator directory, never in
 * a deck. A record names the speaker, the scope of the consent, its date and
 * the sha256 of the recorded consent statement.
 */
import { isRecord } from '@presmium/kernel'

export interface ConsentRecord {
  speaker: string
  scope: string
  /** ISO 8601 date. */
  date: string
  /** sha256 (hex) of the recording of the speaker's consent statement. */
  statementSha256: string
}

/** An engine id or voice id usable as a file name: no path separators, no leading dot. */
export function safeName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)
}

/** What is wrong with a record; undefined for a valid one. */
export function consentProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return 'a consent record is a JSON object { speaker, scope, date, statementSha256 }'
  const missing = (['speaker', 'scope', 'date', 'statementSha256'] as const).filter(key => typeof value[key] !== 'string' || !(value[key] as string).trim())
  if (missing.length) return `the consent record lacks ${missing.join(', ')}`
  if (Number.isNaN(Date.parse(value.date as string))) return `the consent record's date "${value.date as string}" is not an ISO 8601 date`
  if (!/^[0-9a-f]{64}$/i.test(value.statementSha256 as string)) return 'the consent record\'s statementSha256 is not a sha256 in hex'
  return undefined
}

/** The record's path in the consent directory. */
export function consentPath(engine: string, voice: string): string {
  return `${engine}/${voice}.json`
}
