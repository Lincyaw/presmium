/**
 * The names of the design's colour tokens (tokens.css), for code that refers
 * to a token rather than writing a colour: the workbench maps DeepSeek
 * Harness's own tokens onto them (docs/design-dsh.md 7.5). Their values are
 * only in tokens.css, light on `:root` and dark on `:root.dark`.
 */
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

/** The custom property of a colour token, e.g. `--pm-color-accent`. */
export function colorToken(name: ColorName): `--pm-color-${ColorName}` {
  return `--pm-color-${name}`
}

/** A colour token as a CSS value: `var(--pm-color-accent)`. */
export function color(name: ColorName): string {
  return `var(${colorToken(name)})`
}

/** The design's three font stacks (`--pm-font-*`). */
export const FONTS = ['sans', 'serif', 'mono'] as const
