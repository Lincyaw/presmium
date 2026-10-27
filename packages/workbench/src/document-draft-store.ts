export type DraftStoreResult = 'committed' | 'superseded' | 'failed'
export interface DraftStoreCommit { generation: number, done: Promise<DraftStoreResult> }
interface Operation extends DraftStoreCommit {
  key: string
  raw?: string
  markers: readonly [string, string][]
  finish(result: DraftStoreResult): void
}
const DATABASE = 'presmium.document-drafts.v1'
const ENTRIES = 'backups'

/** One actor's latest snapshot replaces only its pending snapshot, never its in-flight transaction. */
export class DocumentDraftStore {
  #database?: Promise<IDBDatabase>
  #channel?: BroadcastChannel
  #closing = false
  #generation = 0
  #flight?: Operation
  #pending?: Operation
  readonly #confirmed = new Map<string, string>()
  readonly #foreign = new Set<string>()
  readonly #scope: string

  constructor(scope: string, changed?: () => void) {
    this.#scope = scope
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.#channel = new BroadcastChannel(DATABASE)
        this.#channel.onmessage = event => { if (!this.#closing && event.data?.scope === scope) changed?.() }
      } catch { /* Reopening still reads actual storage when cross-tab notification is unavailable. */ }
    }
  }

  conflicted(key: string): boolean { return this.#foreign.has(key) }
  owns(key: string, raw: string): boolean { return this.#confirmed.get(key) === raw }
  release(key: string): void { if (this.#flight?.key !== key && this.#pending?.key !== key) this.#confirmed.delete(key) }

  #db(): Promise<IDBDatabase> {
    if (!this.#database) {
      const work = new Promise<IDBDatabase>((resolve, reject) => {
        let finished = false
        const request = indexedDB.open(DATABASE, 1)
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(ENTRIES)) request.result.createObjectStore(ENTRIES) }
        request.onerror = () => { finished = true; reject(request.error) }
        request.onblocked = () => { finished = true; reject(new Error('document-draft-storage-blocked')) }
        request.onsuccess = () => {
          const db = request.result
          if (finished) { db.close(); return }
          finished = true
          const reset = () => { if (this.#database === work) this.#database = undefined }
          db.onversionchange = () => { db.close(); reset() }
          db.onclose = reset
          resolve(db)
        }
      })
      this.#database = work
      void work.catch(() => { if (this.#database === work) this.#database = undefined })
    }
    return this.#database
  }

  async read(prefixes: readonly string[]): Promise<Map<string, unknown>> {
    if (this.#closing) throw new Error('document-draft-storage-closed')
    const db = await this.#db()
    if (this.#closing) throw new Error('document-draft-storage-closed')
    return new Promise((resolve, reject) => {
      const values = new Map<string, unknown>(), tx = db.transaction(ENTRIES, 'readonly'), store = tx.objectStore(ENTRIES)
      tx.oncomplete = () => resolve(values)
      tx.onabort = () => reject(tx.error ?? new Error('document-draft-read-aborted'))
      tx.onerror = () => reject(tx.error)
      for (const prefix of prefixes) {
        const request = store.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`))
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) { values.set(String(cursor.key), cursor.value); cursor.continue() }
        }
      }
    })
  }

  #notify(): void { if (!this.#closing) this.#channel?.postMessage({ scope: this.#scope }) }

  async #commit(key: string | undefined, raw: string | undefined, markers: readonly [string, string][]): Promise<{ committed: boolean, foreign: boolean }> {
    try {
      const db = await this.#db()
      return await new Promise(resolve => {
        const tx = db.transaction(ENTRIES, 'readwrite', { durability: 'strict' }), store = tx.objectStore(ENTRIES)
        let foreign = false
        tx.oncomplete = () => resolve({ committed: true, foreign })
        tx.onabort = () => resolve({ committed: false, foreign })
        tx.onerror = () => { /* The abort event delivers the terminal transaction result. */ }
        if (tx.durability !== 'strict') { tx.abort(); return }
        const apply = () => {
          for (const [marker, value] of markers) store.put(value, marker)
        }
        if (key === undefined) { apply(); return }
        const request = store.get(key), expected = this.#confirmed.get(key)
        request.onsuccess = () => {
          foreign = request.result !== expected
          if (raw !== undefined) {
            if (foreign) { tx.abort(); return }
            store.put(raw, key)
          } else if (!foreign) store.delete(key)
          apply()
        }
      })
    } catch { return { committed: false, foreign: false } }
  }

  #stage(key: string, raw: string | undefined, markers: readonly [string, string][]): DraftStoreCommit | undefined {
    if (this.#closing) return
    let finish!: (result: DraftStoreResult) => void
    const done = new Promise<DraftStoreResult>(resolve => finish = resolve)
    const next: Operation = { generation: ++this.#generation, key, raw, markers, done, finish }
    this.#pending?.finish('superseded')
    this.#pending = next
    void this.#drain()
    return next
  }

  put(key: string, raw: string): DraftStoreCommit | undefined { return this.#stage(key, raw, []) }
  remove(key: string, markers: readonly [string, string][]): DraftStoreCommit | undefined { return this.#stage(key, undefined, markers) }

  async #drain(): Promise<void> {
    if (this.#flight || !this.#pending) return
    const operation = this.#pending
    this.#pending = undefined; this.#flight = operation
    const result = await this.#commit(operation.key, operation.raw, operation.markers)
    if (result.foreign) { this.#foreign.add(operation.key); this.#confirmed.delete(operation.key) }
    if (result.committed) {
      if (operation.raw === undefined) this.#confirmed.delete(operation.key)
      else this.#confirmed.set(operation.key, operation.raw)
    }
    this.#flight = undefined
    operation.finish(result.committed ? 'committed' : 'failed')
    if (result.committed) this.#notify()
    if (this.#pending) void this.#drain()
    else if (this.#closing) this.#closeDatabase()
  }

  /** A candidate copy must be strictly committed before the actor switches to it. */
  async create(key: string, raw: string): Promise<boolean> {
    if (this.#closing) return false
    const result = await this.#commit(key, raw, [])
    if (result.committed) { this.#confirmed.set(key, raw); this.#notify() }
    return result.committed
  }

  async mark(markers: readonly [string, string][]): Promise<boolean> {
    if (this.#closing) return false
    const result = await this.#commit(undefined, undefined, markers)
    if (result.committed) this.#notify()
    return result.committed
  }

  #closeDatabase(): void { void this.#database?.then(db => db.close(), () => {}) }
  close(): void {
    this.#closing = true; this.#channel?.close()
    if (!this.#flight && !this.#pending) this.#closeDatabase()
  }
}
