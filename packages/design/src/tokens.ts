export const COLORS = [
  'bg',
  'surface',
  'sunk',
  'chrome',
  'canvas',
  'hover',
  'backdrop',
  'code',
  'ink',
  'muted',
  'line',
  'line-strong',
  'accent',
  'accent-soft',
  'accent-line',
  'on-accent',
  'selected',
  'ok',
  'ok-soft',
  'warn',
  'warn-soft',
  'danger',
  'danger-soft',
  'add',
  'del',
  'gutter',
  'syntax-key',
  'syntax-string',
  'syntax-keyword',
] as const

export type ColorName = typeof COLORS[number]

export function colorToken(name: ColorName): `--pm-color-${ColorName}` {
  return `--pm-color-${name}`
}

export function color(name: ColorName): string {
  return `var(${colorToken(name)})`
}
