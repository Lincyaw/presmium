/** Admission is frozen atomically with the idle check, before releasing the workspace host. */
export function createHostActivity() {
  let active = 0, stopped = false
  return {
    begin(): (() => void) | undefined {
      if (stopped) return undefined
      active++
      let finished = false
      return () => { if (!finished) { finished = true; active-- } }
    },
    quiesce(): boolean {
      if (active) return false
      stopped = true
      return true
    },
  }
}
