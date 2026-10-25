import type { PlaybackControl, PlaybackLease } from './contracts.ts'

interface Participant {
  pause(): void
  cancel(): void
}

/** Coordinates starts and cancellation without owning time, media or a second player. */
export function createPlaybackControl(): PlaybackControl {
  const participants = new Set<Participant>()
  let gate: { authorize(signal: AbortSignal): Promise<void> } | undefined
  const pause = () => {
    for (const participant of [...participants]) {
      participant.cancel()
      participant.pause()
    }
  }
  return {
    pause,
    setGate(authorize) {
      pause()
      const installed = { authorize }
      gate = installed
      return () => {
        if (gate !== installed) return
        gate = undefined
        pause()
      }
    },
    register(stop) {
      let active: AbortController | undefined
      let disposed = false
      const cancel = () => { active?.abort(); active = undefined }
      const participant = { pause: stop, cancel }
      participants.add(participant)
      const lease: PlaybackLease = {
        async requestStart() {
          cancel()
          if (disposed) return false
          for (const other of [...participants]) if (other !== participant) {
            other.cancel()
            other.pause()
          }
          const request = new AbortController()
          active = request
          const requestedGate = gate
          try {
            await requestedGate?.authorize(request.signal)
            return !disposed && active === request && !request.signal.aborted && gate === requestedGate
          } catch (error) {
            if (request.signal.aborted || error instanceof Error && error.name === 'AbortError') return false
            throw error
          }
        },
        cancel,
        dispose() {
          if (disposed) return
          disposed = true
          cancel()
          participants.delete(participant)
          stop()
        },
      }
      return lease
    },
  }
}
