/** A value of an operation's attribute; undefined ones are left out. */
export type OperationValue = string | number | boolean | undefined

/** A batch of the author's operations, as the workbench sends it to the host. */
export interface OperationBatch {
  client: { id: string, browser?: string, locale?: string }
  records: { name: string, time: number, seq: number, attributes: Record<string, string | number | boolean> }[]
}

const FLUSH_MS = 2000
const BATCH = 200
// Operations kept while the host has not answered, or while it cannot be reached.
const QUEUE = 5000
const BROWSER_KEY = 'presmium.telemetry.browser'
const CONTROLS = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], input[type="checkbox"], input[type="radio"], select, summary'

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** An id of this browser, kept in its storage, so that the loads of the workbench in it can be told apart from another's. */
function browserId(): string | undefined {
  try {
    const known = localStorage.getItem(BROWSER_KEY)
    if (known) return known
    const id = newId()
    localStorage.setItem(BROWSER_KEY, id)
    return id
  } catch {
    return undefined
  }
}

/** The name a control shows the author: its label, else its text. */
function controlName(control: Element): string {
  const label = control.getAttribute('aria-label') ?? control.getAttribute('title')
  return (label ?? (control as HTMLElement).innerText ?? control.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/**
 * The author's operations in the workbench, for the operator's collector: kept in order with their time, and sent in
 * batches to the host (`/api/presmium/telemetry`), which exports them with each session's events. Nothing leaves the
 * page unless the host says it collects them; until it answers, operations wait.
 */
export class OperationLog {
  readonly #read: () => Promise<{ enabled: boolean }>
  readonly #send: (batch: OperationBatch, beacon: boolean) => Promise<void>
  readonly #client: OperationBatch['client']
  #enabled: boolean | undefined
  #queue: OperationBatch['records'] = []
  #seq = 0
  #timer: ReturnType<typeof setTimeout> | undefined
  #sending = false
  #stop: (() => void) | undefined

  constructor(read: () => Promise<{ enabled: boolean }>, send: (batch: OperationBatch, beacon: boolean) => Promise<void>, locale?: string) {
    this.#read = read
    this.#send = send
    const browser = browserId()
    this.#client = { id: newId(), ...browser ? { browser } : {}, ...locale ? { locale } : {} }
  }

  /** The id of this load of the workbench, carried by each of its operations. */
  get client(): string {
    return this.#client.id
  }

  /** Asks the host whether it collects operations; when it does, sends them, and also records clicks on the page's controls. */
  async start(): Promise<void> {
    try {
      this.#enabled = (await this.#read()).enabled === true
    } catch {
      this.#enabled = false
    }
    if (!this.#enabled) {
      this.#queue = []
      return
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') this.flush(true)
    }
    const away = () => this.flush(true)
    const clicked = (event: MouseEvent) => {
      const control = event.target instanceof Element ? event.target.closest(CONTROLS) : null
      if (!control) return
      const region = control.closest('[aria-label][role="region"], [data-pmw-slot], [role="dialog"]')
      this.record('ui.click', {
        'presmium.control': controlName(control),
        'presmium.control.role': control.getAttribute('role') ?? control.tagName.toLowerCase(),
        'presmium.control.activity': control.getAttribute('data-activity') ?? undefined,
        'presmium.region': region ? (region.getAttribute('aria-label') ?? region.getAttribute('data-pmw-slot') ?? undefined) : undefined,
      })
    }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', away)
    document.addEventListener('click', clicked, true)
    this.#stop = () => {
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', away)
      document.removeEventListener('click', clicked, true)
    }
    this.#schedule()
  }

  /** Records one operation now; `attributes` with no value are left out. */
  record(name: string, attributes: Record<string, OperationValue> = {}): void {
    if (this.#enabled === false) return
    const kept: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(attributes)) if (value !== undefined) kept[key] = value
    this.#queue.push({ name, time: Date.now(), seq: ++this.#seq, attributes: kept })
    if (this.#queue.length > QUEUE) this.#queue.splice(0, this.#queue.length - QUEUE)
    if (this.#enabled === undefined) return
    if (this.#queue.length >= BATCH) this.flush()
    else this.#schedule()
  }

  /** Sends what is queued; `beacon` when the page goes away, without waiting for an answer. */
  flush(beacon = false): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
    if (!this.#enabled || this.#queue.length === 0 || (this.#sending && !beacon)) return
    const records = this.#queue.splice(0, beacon ? this.#queue.length : BATCH)
    const batch = { client: this.#client, records }
    if (beacon) {
      void this.#send(batch, true).catch(() => undefined)
      return
    }
    this.#sending = true
    this.#send(batch, false).then(() => {
      this.#sending = false
      if (this.#queue.length > 0) this.#schedule()
    }, () => {
      // Kept for the next try, in their order, before what came since.
      this.#sending = false
      this.#queue.unshift(...records)
      if (this.#queue.length > QUEUE) this.#queue.splice(0, this.#queue.length - QUEUE)
      this.#schedule()
    })
  }

  #schedule(): void {
    if (this.#timer === undefined && this.#queue.length > 0) this.#timer = setTimeout(() => this.flush(), FLUSH_MS)
  }

  /** Sends what is left and stops recording clicks. */
  stop(): void {
    this.flush(true)
    this.#stop?.()
    this.#stop = undefined
    this.#enabled = false
  }
}
