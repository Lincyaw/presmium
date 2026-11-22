import type { VoiceInfo } from '@lincyaw/kernel'
import type { Locale } from './messages.ts'
import { VOICE_MESSAGES } from './voice-messages.ts'

/** A language the way an author says it (the catalogue's tags are lower case): “普通话”, “粤语”, else the language and region by name. */
export function voiceLanguageName(tag: string, locale: Locale): string {
  const named = (VOICE_MESSAGES[locale].languages as Record<string, string | undefined>)[tag.toLowerCase()]
  if (named) return named
  try { return new Intl.DisplayNames([locale], { type: 'language' }).of(tag) ?? tag } catch { return tag }
}

/** “女声 · 普通话”: the gender the provider gives and the voice's languages, never its identifier. */
export function voiceDescription(voice: Pick<VoiceInfo, 'gender' | 'lang'>, locale: Locale): string {
  const t = VOICE_MESSAGES[locale]
  return [voice.gender && t[voice.gender], ...voice.lang.slice(0, 2).map(tag => voiceLanguageName(tag, locale))].filter(Boolean).join(' · ')
}

/** The voice's name with its description, for a voice the catalogue knows; the saved value otherwise. */
export function voiceTitle(id: string, info: VoiceInfo | undefined, locale: Locale): string {
  if (!info) return id
  const description = voiceDescription(info, locale)
  return description ? `${info.label} · ${description}` : info.label
}
