export interface AskSettings {
  url: string
  key: string
  model: string
}

export const ASK_STORAGE_KEY = 'presmium.assistant.ask'

export function toAskSettings(value: unknown): AskSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { url, key, model } = value as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const settings = { url: text(url), key: text(key), model: text(model) }
  return settings.url && settings.key && settings.model && isAskUrlValid(settings.url) ? settings as AskSettings : undefined
}

export function isAskUrlValid(url: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

export function completionsUrl(url: string): string {
  const base = url.trim().replace(/\/+$/, '')
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
}

export function askProvider(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
