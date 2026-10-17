/**
 * The workspace's routes as the page calls them (`/__presmium/presmium.workspace/`,
 * docs/architecture.md 10.2), and what a panel says of a refusal.
 */
import { useServer } from '@presmium/host'
import { onBeforeUnmount, onMounted } from 'vue'
import type { ConflictAnswer, LockedAnswer } from '../domain/api.ts'
import { lockKind, WORKSPACE_ID } from '../domain/api.ts'
import type { WorkspaceMessages } from '../domain/messages.ts'

/** The window event after which the home page and the panels read the documents and the changes again. */
export const DOCUMENTS_EVENT = 'presmium:documents'

/**
 * A refusal of the workspace's routes: `locked` when another writer holds a
 * document it would change (409, F-09), `conflict` when a file changed on
 * disk since the editor opened it (409).
 */
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

/** What a panel says of a failure: a document's lock in the reader's language (N-07), else the server's text. */
export function failure(error: unknown, t: WorkspaceMessages): string {
  if (error instanceof RouteError && error.locked) return t.locked(error.locked.document, lockKind(error.locked.holder))
  return error instanceof Error ? error.message : String(error)
}

/** Tells the page's panels that the documents or their files changed (an operation, an undo, a commit). */
export function documentsChanged(): void {
  window.dispatchEvent(new Event(DOCUMENTS_EVENT))
}

/** Calls `load` again whenever a plugin says the documents changed. Must be called inside a component setup. */
export function onDocumentsChange(load: () => void): void {
  onMounted(() => window.addEventListener(DOCUMENTS_EVENT, load))
  onBeforeUnmount(() => window.removeEventListener(DOCUMENTS_EVENT, load))
}
