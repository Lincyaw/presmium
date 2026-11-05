import { isRecord } from '@lincyaw/kernel'
import type { MediaClip } from '@lincyaw/kernel'
import type { MediaClipDraft } from './MediaClipEditor.tsx'
import type { WorkspaceClient } from './workspace-client.ts'

export interface MediaDrafts { selectedClipId?: string, entries: Record<string, MediaClipDraft> }
interface Entry { value: MediaDrafts, failed: boolean, volatile: boolean, unreadable?: string, raw?: string | null }
const memory = new WeakMap<WorkspaceClient, Map<string, Entry>>()
const prefix = 'presmium.media-drafts.v1:', limit = 64
const keyOf = (identity: string, stepId: string) => prefix + JSON.stringify([identity, stepId])
const string = (value: unknown): value is string => typeof value === 'string'
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function validClip(value: unknown): value is MediaClip {
  return isRecord(value) && string(value.id) && string(value.assetId) && isRecord(value.sourceRange) && number(value.sourceRange.startMs) && number(value.sourceRange.endMs)
    && isRecord(value.attachment) && string(value.attachment.stepId) && number(value.attachment.offsetMs) && number(value.volume) && value.volume <= 1 && (value.muted === undefined || typeof value.muted === 'boolean')
}
function valid(value: unknown): value is MediaDrafts {
  return isRecord(value) && (value.selectedClipId === undefined || string(value.selectedClipId)) && isRecord(value.entries)
    && Object.entries(value.entries).every(([key, draft]) => string(key) && isRecord(draft) && string(draft.version) && validClip(draft.clip) && (draft.baseClip === undefined || validClip(draft.baseClip))
      && [draft.startText, draft.endText, draft.offsetText].every(text => text === undefined || string(text)))
}
function store(client: WorkspaceClient): Map<string, Entry> {
  let known = memory.get(client)
  if (!known) memory.set(client, known = new Map())
  return known
}
function trim(known: Map<string, Entry>): void {
  // Persisted forms can be reloaded; failed writes must keep their only current copy.
  for (const [key, value] of known) {
    if (known.size <= limit) break
    if (!value.volatile) known.delete(key)
  }
}
function load(client: WorkspaceClient, key: string): Entry {
  const known = store(client), previous = known.get(key)
  if (previous) { known.delete(key); known.set(key, previous); return previous }
  const entry: Entry = { value: { entries: {} }, failed: false, volatile: false }
  try {
    const raw = sessionStorage.getItem(key)
    entry.raw = raw
    if (raw !== null) {
      entry.unreadable = raw
      if (raw.length > 131072) throw new Error('media-drafts-size')
      const value: unknown = JSON.parse(raw)
      if (!valid(value)) throw new Error('media-drafts-shape')
      entry.value = value; delete entry.unreadable
    }
  } catch { entry.failed = true }
  known.set(key, entry)
  trim(known)
  return entry
}

/** Only form input is cached. Current canonical IDs, versions, media and step limits are checked on apply. */
export function readMediaDrafts(client: WorkspaceClient, identity: string, stepId: string): MediaDrafts {
  return structuredClone(load(client, keyOf(identity, stepId)).value)
}
export function mediaDraftStorageFailed(client: WorkspaceClient, identity: string, stepId: string): boolean {
  return load(client, keyOf(identity, stepId)).failed
}
export function keepMediaDrafts(client: WorkspaceClient, identity: string, stepId: string, value: MediaDrafts): boolean {
  if (!valid(value)) return false
  const key = keyOf(identity, stepId), entry = load(client, key)
  entry.value = structuredClone(value); entry.volatile = true
  const known = store(client); known.set(key, entry)
  try {
    const raw = JSON.stringify(value)
    if (raw.length > 131072) throw new Error('media-drafts-size')
    if (entry.unreadable !== undefined) sessionStorage.setItem(`${key}:unreadable`, entry.unreadable)
    sessionStorage.setItem(key, raw)
    entry.raw = raw
    const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)!).filter(name => name.startsWith(prefix) && !name.endsWith(':unreadable') && name !== key)
    let excess = keys.length - limit + 1
    for (const old of keys) {
      if (excess <= 0) break
      let previous: unknown
      try { previous = JSON.parse(sessionStorage.getItem(old) ?? 'null') } catch { continue }
      if (valid(previous) && !Object.keys(previous.entries).length && sessionStorage.getItem(`${old}:unreadable`) === null) { sessionStorage.removeItem(old); excess-- }
    }
    entry.failed = false; entry.volatile = false; delete entry.unreadable
    trim(known)
    return true
  } catch { entry.failed = true; trim(known); return false }
}

/** This is the same step/form bank used when the author reopens Media, including session-only input. */
export function mediaDraftSnapshot(client: WorkspaceClient, identity: string): { entries: { stepId: string, value: MediaDrafts, persisted: boolean }[], partial: boolean } {
  const scoped = `${prefix}${JSON.stringify([identity]).slice(0, -1)},`
  const keys = new Set([...store(client).keys()].filter(key => key.startsWith(scoped)))
  let partial = false
  try {
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(scoped) && !key.endsWith(':unreadable')) keys.add(key)
    }
  } catch { partial = true }
  const entries: { stepId: string, value: MediaDrafts, persisted: boolean }[] = []
  for (const key of keys) {
    let target: unknown
    try { target = JSON.parse(key.slice(prefix.length)) } catch { partial = true; continue }
    if (!Array.isArray(target) || target.length !== 2 || target[0] !== identity || typeof target[1] !== 'string') { partial = true; continue }
    const entry = load(client, key)
    let persisted = false
    try { const raw = sessionStorage.getItem(key); persisted = !entry.failed && raw === entry.raw; if (raw !== entry.raw) partial = true } catch { partial = true }
    if (entry.unreadable !== undefined || entry.raw === undefined) partial = true
    if (Object.keys(entry.value.entries).length) entries.push({ stepId: target[1], value: structuredClone(entry.value), persisted })
  }
  return { entries, partial }
}

/** Retire one exact clip proposal, preserving sibling forms and any independently changed storage. */
export function discardMediaDraft(client: WorkspaceClient, identity: string, stepId: string, name: string, expected: MediaDrafts): boolean {
  const key = keyOf(identity, stepId), entry = load(client, key)
  if (!Object.hasOwn(expected.entries, name) || JSON.stringify(entry.value) !== JSON.stringify(expected)) return false
  try {
    if (entry.raw === undefined || entry.unreadable !== undefined || sessionStorage.getItem(key) !== entry.raw) return false
    const next = structuredClone(entry.value)
    delete next.entries[name]
    const raw = JSON.stringify(next)
    sessionStorage.setItem(key, raw)
    entry.value = next; entry.raw = raw; entry.failed = false; entry.volatile = false
    return true
  } catch { entry.failed = true; return false }
}
