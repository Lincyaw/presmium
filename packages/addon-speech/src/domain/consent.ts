import { isRecord } from '@presmium/kernel'
import { engineId } from './engines.ts'

export interface ConsentRecord {
  speaker: string
  scope: string
  date: string
  statementSha256: string
}

export function safeName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)
}

export function consentProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return 'a consent record is a JSON object { speaker, scope, date, statementSha256 }'
  const missing = (['speaker', 'scope', 'date', 'statementSha256'] as const).filter(key => typeof value[key] !== 'string' || !(value[key] as string).trim())
  if (missing.length) return `the consent record lacks ${missing.join(', ')}`
  if (Number.isNaN(Date.parse(value.date as string))) return `the consent record's date "${value.date as string}" is not an ISO 8601 date`
  if (!/^[0-9a-f]{64}$/i.test(value.statementSha256 as string)) return 'the consent record\'s statementSha256 is not a sha256 in hex'
  return undefined
}

export function consentPath(engine: string, voice: string): string {
  return `${engineId(engine)}/${voice}.json`
}
