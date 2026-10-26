import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DOCUMENT_ENTRY, fnv1a64, isRecord } from '@lincyaw/kernel'
import type { CanonicalSource, IRDocument } from '@lincyaw/kernel'

export class VoiceSourceRefusal extends Error {}

export function canonicalSource(value: unknown): value is CanonicalSource {
  return isRecord(value) && typeof value.documentId === 'string' && value.documentId.length > 0
    && typeof value.version === 'string' && /^[\da-f]{20}$/.test(value.version)
    && typeof value.fingerprint === 'string' && /^[\da-f]{16}$/.test(value.fingerprint)
}

export function sameCanonicalSource(a: CanonicalSource, b: CanonicalSource): boolean {
  return a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
}

/** Generation and audition verify disk provenance; renderers continue consuming IR and exact cache only. */
export async function assertVoiceSource(doc: IRDocument, deckDir: string, expected?: CanonicalSource): Promise<CanonicalSource> {
  const source = doc.source
  if (!canonicalSource(source)) throw new VoiceSourceRefusal('voice-source-unavailable')
  if (expected && !sameCanonicalSource(expected, source)) throw new VoiceSourceRefusal('voice-source-changed')
  const file = join(resolve(deckDir), DOCUMENT_ENTRY)
  if (resolve(doc.meta.entry) !== file || doc.meta.documentId !== source.documentId) throw new VoiceSourceRefusal('voice-source-changed')
  let raw: string
  try { raw = await readFile(file, 'utf8') } catch { throw new VoiceSourceRefusal('voice-source-unavailable') }
  if (createHash('sha256').update(raw).digest('hex').slice(0, 20) !== source.version || fnv1a64(raw) !== source.fingerprint) throw new VoiceSourceRefusal('voice-source-changed')
  try {
    const value: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!isRecord(value) || value.id !== source.documentId) throw new Error('identity')
  } catch { throw new VoiceSourceRefusal('voice-source-changed') }
  return { ...source }
}
