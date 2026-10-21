import { createHash } from 'node:crypto'
import type { IRDocument } from '../ir.ts'

export function irRevision(doc: IRDocument): string {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, 16)
}
