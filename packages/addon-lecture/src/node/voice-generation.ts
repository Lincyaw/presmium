import { resolve } from 'node:path'

const active = new Map<string, symbol>()
export class VoiceGenerationBusy extends Error {
  constructor() { super('voice-job-busy') }
}

/** One spending operation per document, including preflight awaits and cancellation acknowledgement. */
export function claimVoiceGeneration(deckDir: string): () => void {
  const key = resolve(deckDir)
  if (active.has(key)) throw new VoiceGenerationBusy()
  const owner = Symbol()
  active.set(key, owner)
  return () => { if (active.get(key) === owner) active.delete(key) }
}
