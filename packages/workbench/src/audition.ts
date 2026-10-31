import type { Workbench } from './workbench.ts'
import { speechFailureCode } from '@lincyaw/kernel'

export interface AuditionState { status: 'idle' | 'loading' | 'playing' | 'failed', error?: string }
export interface AuditionSource { audio: Blob | string }

/** An explicit audio audition owns its request and media; formal playback owns the lecture clock. */
export class Audition {
  readonly #workbench: Workbench
  readonly #listeners = new Set<() => void>()
  readonly #unregister: () => void
  #state: AuditionState = { status: 'idle' }
  #version = 0
  #request?: AbortController
  #audio?: HTMLAudioElement
  #objectUrl?: string
  #disposed = false

  constructor(workbench: Workbench) {
    this.#workbench = workbench
    this.#unregister = workbench.registerAudition(() => this.stop())
  }

  snapshot = (): AuditionState => this.#state
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener) } }
  #set(state: AuditionState): void { this.#state = state; for (const listener of this.#listeners) listener() }

  #release(): void {
    this.#request?.abort()
    this.#request = undefined
    const audio = this.#audio
    this.#audio = undefined
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load() }
    if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl)
    this.#objectUrl = undefined
  }

  stop(): void {
    this.#version++
    this.#release()
    if (!this.#disposed) this.#set({ status: 'idle' })
  }

  async play(produce: (signal: AbortSignal) => Promise<AuditionSource>): Promise<void> {
    this.#workbench.stopAuditions()
    if (this.#disposed) return
    const version = this.#version
    const request = new AbortController()
    this.#request = request
    const current = () => !this.#disposed && this.#version === version && !request.signal.aborted
    this.#set({ status: 'loading' })
    try {
      await this.#workbench.pausePlayback(true)
      if (!current()) return
      const source = await produce(request.signal)
      if (!current()) return
      const audio = new Audio()
      this.#audio = audio
      audio.preload = 'auto'
      audio.src = typeof source.audio === 'string' ? source.audio : this.#objectUrl = URL.createObjectURL(source.audio)
      audio.onended = () => { if (current()) this.stop() }
      audio.onerror = () => {
        if (!current()) return
        this.#release()
        this.#set({ status: 'failed', error: 'audition-audio' })
      }
      await audio.play()
      if (!current()) { audio.pause(); return }
      this.#set({ status: 'playing' })
    } catch (error) {
      if (!current()) return
      this.#release()
      this.#set({ status: 'failed', error: speechFailureCode(error) ?? (error instanceof Error && error.message.startsWith('preview-playback-') ? error.message : 'audition-request') })
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.stop()
    this.#disposed = true
    this.#unregister()
    this.#listeners.clear()
  }
}
