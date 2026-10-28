/** Semantic colours an author picks for text and backgrounds; the saved value is the design token itself. */
export type DocumentColorName = 'muted' | 'accent' | 'ok' | 'warn' | 'danger'
export type DocumentColorKind = 'text' | 'background'

const token = (name: string) => `var(--pm-color-${name})`
const BACKGROUND_TOKENS: Record<DocumentColorName, string> = { muted: 'sunk', accent: 'accent-soft', ok: 'ok-soft', warn: 'warn-soft', danger: 'danger-soft' }

export const DOCUMENT_COLOR_NAMES: readonly DocumentColorName[] = ['muted', 'accent', 'ok', 'warn', 'danger']

export function documentColorToken(name: DocumentColorName, kind: DocumentColorKind): string {
  return token(kind === 'text' ? name : BACKGROUND_TOKENS[name])
}

// Earlier editors saved BlockNote's palette names; they are shown as the nearest semantic colour.
const LEGACY_NAMES: Record<string, DocumentColorName> = { gray: 'muted', brown: 'warn', red: 'danger', orange: 'warn', yellow: 'warn', green: 'ok', blue: 'accent', purple: 'accent', pink: 'danger' }

/** The CSS colour that paints a saved document colour value; the saved value itself is never rewritten. */
export function documentColorValue(value: string, kind: DocumentColorKind): string {
  const legacy = LEGACY_NAMES[value]
  return legacy ? documentColorToken(legacy, kind) : value
}
