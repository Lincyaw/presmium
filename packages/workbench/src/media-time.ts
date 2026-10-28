/** Untouched values keep their original numeric precision; edited values use the shared media grammar. */
export function mediaTime(value: number): string {
  const ms = Math.max(0, Math.round(value))
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms % 60000 / 1000).toFixed(3).padStart(6, '0')}`
}
export function mediaTimeValue(raw: string | undefined, original: number): number | undefined {
  if (raw === undefined || raw === mediaTime(original)) return original
  const match = /^(\d+):([0-5]\d)(?:\.(\d{1,6}))?$/.exec(raw.normalize('NFKC').trim())
  if (!match) return undefined
  const value = Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(`0.${match[3] ?? '0'}`) * 1000
  return Number.isFinite(value) ? value : undefined
}
