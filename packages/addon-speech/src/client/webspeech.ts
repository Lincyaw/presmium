/**
 * `webspeech`: a preview of narration with the browser's own speech
 * synthesis while editing (docs/design-v0.7.md 7.4). Only voices that run on
 * this device (`localService`) are used, so the text never leaves the
 * browser; it gives no audio file, so it is not an engine of `SPEECH` and
 * nothing it says is cached or exported.
 */
import type { VoiceInfo } from '@presmium/kernel'

function synthesis(): SpeechSynthesis | undefined {
  return typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis
}

function local(lang?: string): SpeechSynthesisVoice[] {
  const primary = (tag: string) => tag.toLowerCase().split('-')[0]
  return (synthesis()?.getVoices() ?? []).filter(voice => voice.localService && (!lang || primary(voice.lang) === primary(lang)))
}

/** The device's own voices, for a language; empty where the browser has none (or its voices are not loaded yet). */
export function webSpeechVoices(lang?: string): VoiceInfo[] {
  return local(lang).map(voice => ({ id: voice.voiceURI, label: voice.name, lang: [voice.lang] }))
}

/**
 * Speaks a text with a device's voice (`voice`, else the first for `lang`);
 * resolves when it has been spoken, rejects without such a voice. Aborting
 * `signal` stops it.
 */
export function previewWebSpeech(request: { text: string, lang: string, voice?: string, rate?: number }, signal?: AbortSignal): Promise<void> {
  const speech = synthesis()
  const voice = local(request.voice ? undefined : request.lang).find(v => !request.voice || v.voiceURI === request.voice)
  if (!speech || !voice) return Promise.reject(new Error(`this browser has no voice on the device for ${request.voice ?? request.lang}; a preview sends no text elsewhere`))
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(request.text)
    utterance.voice = voice
    utterance.lang = request.lang
    if (request.rate) utterance.rate = request.rate
    utterance.onend = () => resolve()
    utterance.onerror = event => (event.error === 'interrupted' || event.error === 'canceled' ? resolve() : reject(new Error(event.error)))
    signal?.addEventListener('abort', () => speech.cancel(), { once: true })
    speech.speak(utterance)
  })
}
