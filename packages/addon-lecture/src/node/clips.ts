import { basename } from 'node:path'
import type { SpeechService, Synthesis } from '@lincyaw/kernel'
import { CLIP_FILE } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'

export async function cachedClip(speech: SpeechService, name: string, signal?: AbortSignal): Promise<(Synthesis & { audio: string }) | undefined> {
  if (!CLIP_FILE.test(name)) return undefined
  if (!speech.cached) throw new Error('the speech service cannot look a clip up in its cache')
  const found = await speech.cached(name.replace(/\.\w+$/, ''), signal)
  return found && typeof found.audio === 'string' && basename(found.audio) === name ? { ...found, audio: found.audio } : undefined
}

export function clipKeys(tracks: Iterable<LectureTrack>): Set<string> {
  const keys = new Set<string>()
  for (const track of tracks) for (const u of track.utterances) if (u.clip) keys.add(u.clip.replace(/\.\w+$/, ''))
  return keys
}
