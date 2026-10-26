import { isRecord } from '@lincyaw/kernel'
import type { VoiceSource } from '@lincyaw/kernel'
import type { DocumentVoiceScope } from './document-voices.ts'
import type { WorkspaceClient } from './workspace-client.ts'

export interface VoiceDraft { version: string, scope: DocumentVoiceScope, source: VoiceSource | null, replaceOverrides: boolean, rateInput?: string }
export type VoiceDraftStorageStatus = 'available' | 'unavailable' | 'corrupt'
interface StoredDraft { draft?: VoiceDraft, status: VoiceDraftStorageStatus, unreadable?: string }
const drafts = new WeakMap<WorkspaceClient, Map<string, StoredDraft>>()
const keyOf = (identity: string, stepId: string) => JSON.stringify([identity, stepId])
const storageKey = (key: string) => `presmium.voice-draft.v2:${key}`

/** Only safe shape is checked here; current source IDs, assets and supported values are rechecked on apply. */
function valid(value: unknown): value is VoiceDraft {
  if (!isRecord(value) || typeof value.version !== 'string' || typeof value.replaceOverrides !== 'boolean' || !isRecord(value.scope) || value.rateInput !== undefined && typeof value.rateInput !== 'string') return false
  const scope = value.scope
  if (!(scope.kind === 'document' || scope.kind === 'page' && typeof scope.sectionId === 'string' || scope.kind === 'step' && typeof scope.stepId === 'string' || scope.kind === 'steps' && Array.isArray(scope.stepIds) && scope.stepIds.every(id => typeof id === 'string'))) return false
  const source = value.source
  if (source === null) return true
  if (!isRecord(source)) return false
  if (source.type === 'none') return true
  if (source.type === 'recording') return typeof source.assetId === 'string'
  if (source.type !== 'tts' || !isRecord(source.voice)) return false
  const voice = source.voice
  return typeof voice.voice === 'string' && (voice.engine === undefined || typeof voice.engine === 'string') && (voice.rate === undefined || typeof voice.rate === 'number' && Number.isFinite(voice.rate)) && (voice.style === undefined || typeof voice.style === 'string')
}
function store(client: WorkspaceClient): Map<string, StoredDraft> {
  let known = drafts.get(client)
  if (!known) drafts.set(client, known = new Map())
  return known
}
function load(client: WorkspaceClient, key: string): StoredDraft {
  const known = store(client), previous = known.get(key)
  if (previous) return previous
  const entry: StoredDraft = { status: 'available' }
  known.set(key, entry)
  try {
    const raw = sessionStorage.getItem(storageKey(key))
    if (raw !== null) {
      entry.unreadable = raw
      const value: unknown = JSON.parse(raw)
      if (!valid(value)) { entry.status = 'corrupt'; return entry }
      entry.draft = value
      delete entry.unreadable
    }
  } catch { entry.status = entry.unreadable === undefined ? 'unavailable' : 'corrupt' }
  return entry
}

export function readVoiceDraft(client: WorkspaceClient, identity: string, stepId: string): VoiceDraft | undefined {
  const value = load(client, keyOf(identity, stepId)).draft
  return value && structuredClone(value)
}

/** Corrupt storage is left untouched on read; a later write preserves its raw text in one recovery slot. */
export function voiceDraftStorageStatus(client: WorkspaceClient, identity: string, stepId: string): VoiceDraftStorageStatus {
  return load(client, keyOf(identity, stepId)).status
}

/** Returns whether the browser also kept the draft for a reload. */
export function keepVoiceDraft(client: WorkspaceClient, identity: string, stepId: string, value: VoiceDraft): boolean {
  if (!valid(value)) throw new Error('voice-draft-invalid')
  const key = keyOf(identity, stepId), entry = load(client, key)
  entry.draft = structuredClone(value)
  try {
    if (entry.unreadable !== undefined) sessionStorage.setItem(`${storageKey(key)}:unreadable`, entry.unreadable)
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry.draft))
    entry.status = 'available'; delete entry.unreadable
    return true
  } catch { entry.status = 'unavailable'; return false }
}

/** A late acknowledgement cannot clear newer memory or persisted input. Failure keeps memory for retry. */
export function clearVoiceDraft(client: WorkspaceClient, identity: string, stepId: string, expected?: VoiceDraft): boolean {
  const key = keyOf(identity, stepId), entry = load(client, key)
  if (expected && JSON.stringify(entry.draft) !== JSON.stringify(expected)) return false
  try {
    const raw = sessionStorage.getItem(storageKey(key))
    if (expected && raw !== null) {
      let persisted: unknown
      try { persisted = JSON.parse(raw) } catch { entry.status = 'corrupt'; entry.unreadable = raw; return false }
      if (!valid(persisted)) { entry.status = 'corrupt'; entry.unreadable = raw; return false }
      if (JSON.stringify(persisted) !== JSON.stringify(expected)) return false
    }
    sessionStorage.removeItem(storageKey(key))
    delete entry.draft; delete entry.unreadable; entry.status = 'available'
    return true
  } catch { entry.status = 'unavailable'; return false }
}
