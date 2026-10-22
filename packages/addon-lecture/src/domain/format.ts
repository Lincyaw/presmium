export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = String(total % 60).padStart(2, '0')
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function fileStem(section: string): string {
  // eslint-disable-next-line no-control-regex
  const stem = section.replace(/[/\\?%*:|"<>#\u0000-\u001F\s]/g, '_').replace(/^\.+/, '_')
  return stem.slice(0, 80) || 'section'
}
