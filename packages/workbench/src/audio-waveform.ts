/** Read-only peaks from decoded media, never a replacement for the lecture's timing plan. */
export interface AudioWaveform {
  readonly durationMs: number
  readonly peaks: readonly number[]
}

const MAX_BYTES = 16 * 1024 * 1024
const MAX_DURATION_MS = 10 * 60 * 1000
const MAX_PENDING = 128
const MAX_CACHED = 24
const CONCURRENCY = 2

interface Job {
  key: string
  durationMs: number
  bins: number
  load(signal: AbortSignal): Promise<Blob>
  signal?: AbortSignal
  unlisten(): void
  resolve(value: AudioWaveform): void
  reject(error: unknown): void
}

function aborted(): DOMException { return new DOMException('Waveform reading cancelled', 'AbortError') }

async function decode(blob: Blob, durationMs: number, bins: number, signal: AbortSignal): Promise<AudioWaveform> {
  signal.throwIfAborted()
  if (!blob.size || blob.size > MAX_BYTES) throw new Error('waveform-size-limit')
  if (typeof OfflineAudioContext !== 'function') throw new Error('waveform-decoder-unavailable')
  const bytes = await blob.arrayBuffer()
  signal.throwIfAborted()
  // Offline decoding never starts an AudioContext destination or requests permission to play.
  const context = new OfflineAudioContext(1, 1, 8000)
  let audio: AudioBuffer
  try { audio = await context.decodeAudioData(bytes) }
  catch { signal.throwIfAborted(); throw new Error('waveform-invalid-audio') }
  signal.throwIfAborted()
  const decodedMs = audio.duration * 1000
  if (!Number.isFinite(decodedMs) || decodedMs <= 0 || decodedMs > MAX_DURATION_MS) throw new Error('waveform-duration-limit')
  // A materially different file must not draw a plausible waveform against the old plan's duration.
  if (Math.abs(decodedMs - durationMs) > Math.max(100, durationMs * 0.01)) throw new Error('waveform-duration-changed')
  const peaks = Array.from({ length: bins }, () => 0)
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel)
    for (let index = 0; index < samples.length; index++) {
      const bin = Math.min(bins - 1, Math.floor(index * bins / samples.length))
      const sample = samples[index]!
      if (!Number.isFinite(sample)) throw new Error('waveform-invalid-audio')
      peaks[bin] = Math.max(peaks[bin]!, Math.min(1, Math.abs(sample)))
    }
  }
  signal.throwIfAborted()
  return Object.freeze({ durationMs: Math.round(decodedMs), peaks: Object.freeze(peaks) })
}

/** A visible production workspace owns this queue; closing it cancels reads and releases cached peaks. */
export class AudioWaveforms {
  readonly #queue: Job[] = []
  readonly #active = new Set<AbortController>()
  readonly #cache = new Map<string, AudioWaveform>()
  #closed = false

  /** key includes the confirmed plan and clip identity; media is fetched only after a queue slot is available. */
  read(key: string, load: Job['load'], durationMs: number, signal?: AbortSignal, bins = 128): Promise<AudioWaveform> {
    if (this.#closed || signal?.aborted) return Promise.reject(signal?.reason ?? aborted())
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) return Promise.reject(new Error('waveform-duration-limit'))
    if (!Number.isInteger(bins) || bins < 16 || bins > 2048) return Promise.reject(new Error('waveform-bin-limit'))
    const identity = JSON.stringify([key, durationMs, bins]), cached = this.#cache.get(identity)
    if (cached) {
      this.#cache.delete(identity); this.#cache.set(identity, cached)
      return Promise.resolve(cached)
    }
    if (this.#queue.length >= MAX_PENDING) return Promise.reject(new Error('waveform-queue-limit'))
    return new Promise((resolve, reject) => {
      const cancel = () => {
        const index = this.#queue.indexOf(job)
        if (index < 0) return
        this.#queue.splice(index, 1); job.unlisten(); reject(signal?.reason ?? aborted())
      }
      const job: Job = { key: identity, load, durationMs, bins, signal, resolve, reject, unlisten: () => signal?.removeEventListener('abort', cancel) }
      signal?.addEventListener('abort', cancel, { once: true })
      this.#queue.push(job); this.#pump()
    })
  }

  dispose(): void {
    this.#closed = true
    for (const job of this.#queue.splice(0)) { job.unlisten(); job.reject(aborted()) }
    for (const controller of this.#active) controller.abort(aborted())
    this.#cache.clear()
  }

  #pump(): void {
    while (!this.#closed && this.#active.size < CONCURRENCY && this.#queue.length) {
      const job = this.#queue.shift()!
      job.unlisten()
      const controller = new AbortController(), signal = job.signal ? AbortSignal.any([controller.signal, job.signal]) : controller.signal
      this.#active.add(controller)
      void (async () => {
        signal.throwIfAborted()
        const value = await decode(await job.load(signal), job.durationMs, job.bins, signal)
        signal.throwIfAborted()
        if (this.#closed) throw aborted()
        this.#cache.delete(job.key); this.#cache.set(job.key, value)
        if (this.#cache.size > MAX_CACHED) this.#cache.delete(this.#cache.keys().next().value!)
        return value
      })().then(job.resolve, job.reject).finally(() => { this.#active.delete(controller); this.#pump() })
    }
  }
}
