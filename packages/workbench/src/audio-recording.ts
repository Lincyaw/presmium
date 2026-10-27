/** A microphone take remains an in-memory candidate until the author saves its original bytes. */
export interface RecordingCandidate { file: File, recordedAt: string, elapsedMs: number, assetId?: string }
export interface AudioRecordingState {
  phase: 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'failed'
  candidate?: RecordingCandidate
  elapsedMs: number
  error?: string
}
const MAX_BYTES = 16 << 20
const MAX_DURATION_MS = 10 * 60_000
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']

export function recordingUnavailable(): string | undefined {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) return 'recording-context'
  if (typeof MediaRecorder === 'undefined' || !MIME_TYPES.some(type => MediaRecorder.isTypeSupported(type))) return 'recording-unsupported'
  return undefined
}

interface Take {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  bytes: number
  started: number
  recordedAt: string
  discard: boolean
  error?: string
  interval?: ReturnType<typeof setInterval>
  release: () => void
  ended: () => void
}

export class AudioRecording {
  #state: AudioRecordingState = { phase: 'idle', elapsedMs: 0 }
  readonly #listeners = new Set<() => void>()
  #generation = 0
  #disposed = false
  #take?: Take
  #release?: () => void
  #warning = false
  readonly #beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }

  snapshot = (): AudioRecordingState => this.#state
  subscribe = (listener: () => void): (() => void) => { if (this.#disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener) } }
  #set(state: AudioRecordingState): void {
    if (this.#disposed) return
    this.#state = state
    const warning = ['requesting', 'recording', 'stopping'].includes(state.phase) || Boolean(state.candidate && !state.candidate.assetId)
    if (warning !== this.#warning) {
      this.#warning = warning
      if (warning) window.addEventListener('beforeunload', this.#beforeUnload)
      else window.removeEventListener('beforeunload', this.#beforeUnload)
    }
    for (const listener of this.#listeners) listener()
  }
  #settle(error?: string): void {
    this.#set({ phase: error ? 'failed' : this.#state.candidate ? 'ready' : 'idle', candidate: this.#state.candidate, elapsedMs: this.#state.candidate?.elapsedMs ?? 0, ...error ? { error } : {} })
  }

  async start(prepare: () => Promise<() => void>): Promise<void> {
    if (this.#disposed || this.#take || this.#state.phase === 'requesting') return
    const unavailable = recordingUnavailable()
    if (unavailable) { this.#settle(unavailable); return }
    const generation = ++this.#generation
    this.#set({ ...this.#state, phase: 'requesting', error: undefined })
    let stream: MediaStream | undefined
    let release: (() => void) | undefined
    try {
      release = await prepare()
      if (generation !== this.#generation) { release(); return }
      this.#release = release
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 } }, video: false })
      if (generation !== this.#generation) { stream.getTracks().forEach(track => track.stop()); return }
      const mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type))!
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 })
      const take: Take = {
        recorder, stream, chunks: [], bytes: 0, started: performance.now(), recordedAt: new Date().toISOString(), discard: false,
        release: () => { release?.(); if (this.#release === release) this.#release = undefined },
        ended: () => { if (this.#take === take) this.stop('recording-device-ended') },
      }
      this.#take = take
      recorder.ondataavailable = event => {
        if (this.#take !== take || !event.data.size) return
        take.chunks.push(event.data); take.bytes += event.data.size
        if (take.bytes > MAX_BYTES) this.stop('recording-size')
      }
      recorder.onerror = () => { if (this.#take === take) this.stop('recording-failed') }
      recorder.onstop = () => this.#finish(take)
      for (const track of stream.getTracks()) track.addEventListener('ended', take.ended)
      recorder.start(1000)
      this.#set({ ...this.#state, phase: 'recording', elapsedMs: 0, error: undefined })
      take.interval = setInterval(() => {
        if (this.#take !== take || recorder.state !== 'recording') return
        const elapsedMs = performance.now() - take.started
        this.#set({ ...this.#state, elapsedMs })
        if (elapsedMs >= MAX_DURATION_MS) this.stop('recording-duration')
      }, 1000)
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop())
      release?.(); if (this.#release === release) this.#release = undefined
      if (generation !== this.#generation) return
      this.#take = undefined
      const name = error instanceof DOMException ? error.name : ''
      this.#settle(name === 'NotAllowedError' || name === 'SecurityError' ? 'recording-permission' : name === 'NotFoundError' ? 'recording-device' : name === 'NotReadableError' ? 'recording-device-busy' : name === 'NotSupportedError' ? 'recording-device-unsupported' : 'recording-failed')
    }
  }

  stop(error?: string): void {
    const take = this.#take
    if (!take) {
      if (this.#state.phase === 'requesting') { this.#generation++; this.#release?.(); this.#release = undefined; this.#settle(error) }
      return
    }
    if (error) take.error ??= error
    clearInterval(take.interval)
    if (take.recorder.state !== 'inactive') {
      this.#set({ ...this.#state, phase: 'stopping' })
      try { take.recorder.stop() }
      catch { take.error ??= 'recording-failed'; this.#finish(take) }
    }
    take.stream.getTracks().forEach(track => track.stop())
    take.release()
  }

  #finish(take: Take): void {
    if (this.#take !== take) return
    this.#take = undefined
    clearInterval(take.interval)
    for (const track of take.stream.getTracks()) { track.removeEventListener('ended', take.ended); track.stop() }
    take.recorder.ondataavailable = null; take.recorder.onstop = null; take.recorder.onerror = null
    take.release()
    if (take.discard) { this.#settle(); return }
    if (take.error && this.#state.candidate) { this.#settle(take.error); return }
    if (!take.bytes || take.bytes > MAX_BYTES) { this.#settle(take.bytes ? 'recording-size' : 'recording-empty'); return }
    const mime = take.recorder.mimeType || take.chunks[0]!.type
    const extension = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm'
    const file = new File(take.chunks, `recording-${take.recordedAt.replace(/[:.]/g, '-')}.${extension}`, { type: mime })
    this.#set({ phase: 'ready', candidate: { file, recordedAt: take.recordedAt, elapsedMs: performance.now() - take.started }, elapsedMs: performance.now() - take.started, ...take.error ? { error: take.error } : {} })
  }

  cancelTake(): void {
    if (this.#take) this.#take.discard = true
    this.stop()
  }
  imported(file: File, assetId: string): void {
    if (this.#state.candidate?.file !== file) return
    this.#set({ ...this.#state, candidate: { ...this.#state.candidate, assetId }, error: undefined })
  }
  forgetImport(assetId: string): void {
    if (this.#state.candidate?.assetId !== assetId) return
    this.#set({ ...this.#state, candidate: { ...this.#state.candidate, assetId: undefined } })
  }
  discard(): void {
    this.cancelTake()
    this.#set({ phase: 'idle', elapsedMs: 0 })
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#generation++
    const take = this.#take
    if (take) { take.discard = true; this.stop(); this.#finish(take) }
    this.#release?.(); this.#release = undefined
    if (this.#warning) window.removeEventListener('beforeunload', this.#beforeUnload)
    this.#warning = false
    this.#state = { phase: 'idle', elapsedMs: 0 }
    this.#listeners.clear()
  }
}

const recordings = new WeakMap<object, Map<string, AudioRecording>>()
/** Includes preparation and recorder finalization, when a playback lease alone cannot describe the take. */
export function documentRecordingActive(owner: object): boolean {
  return [...recordings.get(owner)?.values() ?? []].some(recording => ['requesting', 'recording', 'stopping'].includes(recording.snapshot().phase))
}

/** Volatile UI material, isolated by the real workspace/document identity; never a persisted source model. */
export function documentRecording(owner: object, identity: string): AudioRecording {
  let documents = recordings.get(owner)
  if (!documents) { documents = new Map(); recordings.set(owner, documents) }
  let recording = documents.get(identity)
  if (!recording) { recording = new AudioRecording(); documents.set(identity, recording) }
  return recording
}

export function disposeDocumentRecordings(owner: object): void {
  const documents = recordings.get(owner)
  recordings.delete(owner)
  for (const recording of documents?.values() ?? []) recording.dispose()
  documents?.clear()
}
