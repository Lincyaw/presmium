interface Options {
  userRoot: string
  roots: string[]
}

function fromDeck(deck: string, path: string): string {
  const from = deck.split(/[\\/]/).filter(Boolean)
  const to = path.split(/[\\/]/).filter(Boolean)
  let same = 0
  while (same < from.length && same < to.length && from[same] === to[same]) same++
  return [...from.slice(same).map(() => '..'), ...to.slice(same)].join('/') || '.'
}

const CLIENT_SETUPS = '{main,root,routes,shortcuts,code-runners,monaco,mermaid,mermaid-renderer,context-menu}'

export default function setup(options: Options) {
  const entries = options.roots.filter(root => !/[\\/]node_modules[\\/]/.test(root)).flatMap((root) => {
    const at = fromDeck(options.userRoot, root)
    return [`${at}/setup/${CLIENT_SETUPS}.{ts,js,mjs}`, `${at}/components/**/*.vue`, `${at}/layouts/*.vue`]
  })
  return [{
    name: 'presmium:book-dependencies',
    config: () => ({ optimizeDeps: { entries } }),
  }]
}
