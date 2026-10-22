export const COLORS = [
  'bg',
  'surface',
  'sunk',
  'code',
  'ink',
  'muted',
  'line',
  'line-strong',
  'accent',
  'accent-soft',
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
