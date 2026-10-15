import { isRenderable } from './contracts.ts'
import type { AnchorLockFile, RecordedAnchor, Resolution } from './contracts.ts'
import { errorMessage } from './errors.ts'

/** Lock file location relative to the deck directory. */
export const ANCHOR_LOCK_PATH = '.presmium/anchors.lock.json'

/**
 * Read/write model of `.presmium/anchors.lock.json`. Serialization sorts
 * anchors and fixes field order, so rewriting an unchanged lock is a no-op.
 */
export class AnchorLock {
  #anchors = new Map<string, RecordedAnchor>()

  private constructor(anchors: Iterable<[string, RecordedAnchor]>) {
    for (const [anchor, recorded] of anchors) this.set(anchor, recorded)
  }

  static empty(): AnchorLock {
    return new AnchorLock([])
  }

  static from(file: AnchorLockFile): AnchorLock {
    return new AnchorLock(Object.entries(file.anchors))
  }

  /** Parses lock file text; missing or blank text yields an empty lock. Throws on invalid content. */
  static parse(text: string | undefined): AnchorLock {
    if (text === undefined || text.trim() === '') return AnchorLock.empty()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error(`invalid anchor lock: ${errorMessage(error)}`)
    }
    return AnchorLock.from(validate(data))
  }

  get size(): number {
    return this.#anchors.size
  }

  get(anchor: string): RecordedAnchor | undefined {
    return this.#anchors.get(anchor)
  }

  set(anchor: string, recorded: RecordedAnchor): void {
    this.#anchors.set(anchor, { fingerprint: recorded.fingerprint, file: recorded.file, startLine: recorded.startLine })
  }

  /**
   * Records a renderable resolution (`exact` or `moved`). Fuzzy and lost
   * resolutions keep the previous record, which awaits human confirmation.
   */
  record(anchor: string, resolution: Resolution): boolean {
    const { location, fingerprint } = resolution
    if (!isRenderable(resolution) || !location || !fingerprint) return false
    this.set(anchor, { fingerprint, file: location.file, startLine: location.startLine })
    return true
  }

  /** Drops records for anchors no longer used by the deck. */
  retain(anchors: Iterable<string>): void {
    const keep = new Set(anchors)
    for (const anchor of [...this.#anchors.keys()]) {
      if (!keep.has(anchor)) this.#anchors.delete(anchor)
    }
  }

  toJSON(): AnchorLockFile {
    const keys = [...this.#anchors.keys()].sort()
    return { version: 1, anchors: Object.fromEntries(keys.map(k => [k, this.#anchors.get(k)!])) }
  }

  serialize(): string {
    return `${JSON.stringify(this.toJSON(), null, 2)}\n`
  }
}

function validate(data: unknown): AnchorLockFile {
  if (!isObject(data) || data.version !== 1 || !isObject(data.anchors)) {
    throw new Error('invalid anchor lock: expected { "version": 1, "anchors": { ... } }')
  }
  for (const [anchor, record] of Object.entries(data.anchors)) {
    const valid = isObject(record)
      && typeof record.fingerprint === 'string' && record.fingerprint !== ''
      && typeof record.file === 'string'
      && Number.isInteger(record.startLine) && (record.startLine as number) >= 1
    if (!valid) throw new Error(`invalid anchor lock: bad record for "${anchor}"`)
  }
  return data as unknown as AnchorLockFile
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
