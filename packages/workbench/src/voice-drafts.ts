import { isRecord } from '@lincyaw/kernel'
import type { SpeechVoice, VoiceScope, VoiceTarget } from '@lincyaw/kernel'
import type { WorkspaceClient } from './workspace-client.ts'

export interface VoiceDraft { revision: string, base: string, scope: VoiceScope, voice: SpeechVoice | null, replaceOverrides: boolean, rateInput?: string }
const drafts = new WeakMap<WorkspaceClient, Map<string, VoiceDraft>>()
const keyOf = (document: string, target: VoiceTarget) => JSON.stringify([document, target.section, target.step])
const storageKey = (key: string) => `presmium.voice-draft:${key}`
const target = (value: unknown): value is VoiceTarget => isRecord(value) && typeof value.section === 'string' && Number.isInteger(value.step) && Number(value.step) >= 0 && typeof value.binding === 'string'
function valid(value: unknown): value is VoiceDraft {
  if (!isRecord(value) || typeof value.revision !== 'string' || typeof value.base !== 'string' || typeof value.replaceOverrides !== 'boolean' || !isRecord(value.scope) || value.rateInput !== undefined && typeof value.rateInput !== 'string') return false
  const scope = value.scope
  if (!(scope.kind === 'document' || scope.kind === 'page' && typeof scope.section === 'string' || scope.kind === 'step' && target(scope.target) || scope.kind === 'steps' && Array.isArray(scope.targets) && scope.targets.every(target))) return false
  const voice = value.voice
  return voice === null || isRecord(voice) && typeof voice.voice === 'string' && (voice.engine === undefined || typeof voice.engine === 'string') && (voice.rate === undefined || typeof voice.rate === 'number' && Number.isFinite(voice.rate)) && (voice.style === undefined || typeof voice.style === 'string')
}
function store(client: WorkspaceClient): Map<string, VoiceDraft> {
  let known = drafts.get(client)
  if (!known) drafts.set(client, known = new Map())
  return known
}
export function readVoiceDraft(client: WorkspaceClient, document: string, selected: VoiceTarget): VoiceDraft | undefined {
  const key = keyOf(document, selected), known = store(client)
  if (known.has(key)) return known.get(key)
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey(key)) ?? 'null')
    if (valid(value)) { known.set(key, value); return value }
  } catch { /* The caller can still edit without browser recovery storage. */ }
}
/** Returns whether the browser also kept the draft for a reload. */
export function keepVoiceDraft(client: WorkspaceClient, document: string, selected: VoiceTarget, value: VoiceDraft): boolean {
  const key = keyOf(document, selected)
  store(client).set(key, value)
  try { sessionStorage.setItem(storageKey(key), JSON.stringify(value)); return true } catch { return false }
}
export function clearVoiceDraft(client: WorkspaceClient, document: string, selected: VoiceTarget, expected?: VoiceDraft): void {
  const key = keyOf(document, selected)
  if (expected && JSON.stringify(store(client).get(key)) !== JSON.stringify(expected)) return
  if (expected) {
    try {
      const persisted = sessionStorage.getItem(storageKey(key))
      if (persisted && JSON.stringify(JSON.parse(persisted)) !== JSON.stringify(expected)) return
    } catch { /* Keep the in-memory acknowledgement scoped even when browser storage is unavailable. */ }
  }
  store(client).delete(key)
  try { sessionStorage.removeItem(storageKey(key)) } catch { /* The applied source remains authoritative. */ }
}
