import { useServer } from '@presmium/host'
import { onBeforeUnmount, onMounted } from 'vue'
import type { ConflictAnswer, LockedAnswer } from '../domain/api.ts'
import { lockKind, WORKSPACE_ID } from '../domain/api.ts'
import type { WorkspaceMessages } from '../domain/messages.ts'

export const DOCUMENTS_EVENT = 'presmium:documents'

export class RouteError extends Error {
  readonly status: number
  readonly locked?: LockedAnswer['locked']
  readonly conflict?: ConflictAnswer['conflict']
  constructor(message: string, status: number, detail: { locked?: LockedAnswer['locked'], conflict?: ConflictAnswer['conflict'] } = {}) {
    super(message)
    this.status = status
    this.locked = detail.locked
    this.conflict = detail.conflict
  }
}

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await useServer().fetch(WORKSPACE_ID, path, init)
  const data = await response.json().catch(() => ({})) as T & { error?: string, locked?: LockedAnswer['locked'], conflict?: ConflictAnswer['conflict'] }
  if (!response.ok && !(response.status === 409 && 'conflicts' in (data as object))) {
    const locked = typeof data.locked?.document === 'string' && typeof data.locked.holder === 'string' ? data.locked : undefined
    const conflict = typeof data.conflict?.version === 'string' && typeof data.conflict.content === 'string' ? data.conflict : undefined
    throw new RouteError(data.error ?? `${response.status}`, response.status, { ...locked ? { locked } : {}, ...conflict ? { conflict } : {} })
  }
  return data
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

export function failure(error: unknown, t: WorkspaceMessages): string {
  if (error instanceof RouteError && error.locked) return t.locked(error.locked.document, lockKind(error.locked.holder))
  return error instanceof Error ? error.message : String(error)
}

export function documentsChanged(): void {
  window.dispatchEvent(new Event(DOCUMENTS_EVENT))
}

export function onDocumentsChange(load: () => void): void {
  onMounted(() => window.addEventListener(DOCUMENTS_EVENT, load))
  onBeforeUnmount(() => window.removeEventListener(DOCUMENTS_EVENT, load))
}
