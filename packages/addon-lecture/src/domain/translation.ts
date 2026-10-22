import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { LectureTrack, Utterance } from './track.ts'

export function translationDigest(text: string): string {
  return `sha256:${bytesToHex(sha256(utf8ToBytes(text)))}`
}

export function isStale(utterance: Utterance, lang: string): boolean {
  const translation = utterance.translations?.[lang]
  return Boolean(translation && translation.source !== translationDigest(utterance.text))
}

export interface TranslationItem {
  id: string
  section?: string
  text: string
  source: string
  translation?: string
  stale?: boolean
}

export function translationItems(track: LectureTrack, lang: string): TranslationItem[] {
  return track.utterances.map((u) => {
    const done = u.translations?.[lang]
    return {
      id: u.id,
      ...u.section ? { section: u.section } : {},
      text: u.text,
      source: translationDigest(u.text),
      ...done ? { translation: done.text, stale: isStale(u, lang) } : {},
    }
  })
}
