// The colours of code in 书卷: the host's syntax tokens (`--pm-color-syntax-*`, packages/host/src/design/tokens.css)
// as Shiki themes, light and dark, which Slidev's Monaco editors take too. Shiki and Monaco need the colours
// themselves, not the custom properties; each reaches WCAG AA on the code's panel (`surface`). The default export
// is the setup function of vendor/docs/slidev/custom/config-highlighter.md (`defineShikiSetup` only types it).

interface Palette {
  type: 'light' | 'dark'
  background: string
  ink: string
  muted: string
  keyword: string
  string: string
  key: string
  number: string
  deleted: string
}

function theme(name: string, c: Palette) {
  const rule = (scope: string[], foreground: string, fontStyle?: string) => ({ scope, settings: { foreground, ...fontStyle ? { fontStyle } : {} } })
  return {
    name,
    type: c.type,
    colors: { 'editor.background': c.background, 'editor.foreground': c.ink },
    tokenColors: [
      { settings: { foreground: c.ink, background: c.background } },
      rule(['comment', 'punctuation.definition.comment'], c.muted, 'italic'),
      rule(['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.operator.word', 'keyword.operator.logical.python', 'entity.name.tag'], c.keyword),
      rule(['string', 'punctuation.definition.string', 'string.quoted', 'markup.inserted'], c.string),
      rule(['entity.name.function', 'support.function', 'entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.other.attribute-name', 'meta.object-literal.key', 'support.type.property-name'], c.key),
      rule(['constant.numeric', 'constant.language', 'constant.character', 'support.constant', 'variable.language'], c.number),
      rule(['markup.deleted', 'invalid'], c.deleted),
    ],
  }
}

export default () => ({
  themes: {
    light: theme('presmium-book-light', { type: 'light', background: '#ffffff', ink: '#1c1b19', muted: '#5c584f', keyword: '#8a3b12', string: '#2f6b3a', key: '#7a3e8e', number: '#0f5f5c', deleted: '#a3321c' }),
    dark: theme('presmium-book-dark', { type: 'dark', background: '#1f1e1b', ink: '#edeae3', muted: '#a9a498', keyword: '#e59a6b', string: '#9ccb8f', key: '#d3a3e3', number: '#6fc1b9', deleted: '#ee9a86' }),
  },
})
