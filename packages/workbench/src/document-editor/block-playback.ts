import type { BlockPreviewCommand, BlockPreviewPlaybackGranted, BlockPreviewPlaybackRequest } from '@lincyaw/kernel'

interface Member {
  request: BlockPreviewPlaybackRequest
  release?: () => void
  stopped: boolean
  waiting?: { promise: Promise<void>, finish(error?: Error): void }
}

interface PlaybackOptions {
  activate(stop: () => Promise<void>): Promise<() => void>
  current(request: BlockPreviewPlaybackRequest): boolean
  adopt(request: BlockPreviewPlaybackRequest): void
  post(message: BlockPreviewCommand | BlockPreviewPlaybackGranted): void
  failure: string
}

/** Wait for the existing child's cancellation acknowledgement before admitting another player. */
export class DocumentBlockPlayback {
  readonly #options: PlaybackOptions
  readonly #members = new Map<number, Member>()
  #disposed = false
  constructor(options: PlaybackOptions) { this.#options = options }

  request(request: BlockPreviewPlaybackRequest): void {
    if (this.#disposed || this.#members.has(request.request)) return
    if (!this.#options.current(request)) { this.#grant(request, this.#options.failure); return }
    const member: Member = { request, stopped: false }
    this.#members.set(request.request, member)
    void this.#options.activate(() => this.#stop(member)).then(release => {
      member.release = release
      if (this.#disposed || member.stopped) { release(); return }
      if (!this.#options.current(request)) {
        release(); this.#members.delete(request.request)
        this.#grant(request, this.#options.failure)
        return
      }
      this.#options.adopt(request)
      this.#grant(request)
    }, error => {
      this.#members.delete(request.request)
      if (this.#disposed || member.stopped) return
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') this.#pause(request)
      else this.#grant(request, this.#options.failure)
    })
  }

  cancelled(request: number): void {
    const member = this.#members.get(request)
    if (!member) return
    member.stopped = true; member.waiting?.finish(); member.release?.()
    this.#members.delete(request)
  }

  #grant(request: BlockPreviewPlaybackRequest, error?: string): void {
    if (this.#disposed) return
    const { document, blockId, revision } = request
    this.#options.post({ type: 'presmium:block-preview-playback-granted', document, blockId, revision, request: request.request, ...error ? { error } : {} })
  }

  #pause(request: BlockPreviewPlaybackRequest): void {
    const { document, blockId, revision, sectionId, stepId } = request
    this.#options.post({ type: 'presmium:block-preview-command', document, blockId, revision, sectionId, stepId, action: 'pause' })
  }

  #stop(member: Member): Promise<void> {
    if (this.#disposed || member.stopped) return Promise.resolve()
    if (member.waiting) return member.waiting.promise
    let finish!: (error?: Error) => void
    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('block-playback-pause-timeout')), 5000)
      finish = error => {
        clearTimeout(timer); member.waiting = undefined
        if (error) reject(error); else resolve()
      }
    })
    member.waiting = { promise, finish }
    this.#pause(member.request)
    return promise
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const member of this.#members.values()) {
      member.stopped = true; member.waiting?.finish(); member.release?.()
    }
    this.#members.clear()
  }
}
