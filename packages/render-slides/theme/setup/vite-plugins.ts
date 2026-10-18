// The deck's dependencies, found when Slidev's server starts (vendor/docs/slidev/custom/config-vite.md, "Add Custom
// Plugins based on Slide data"). Vite pre-bundles the packages it finds from its entries; Slidev's entry is its
// client, which reaches the addons' setups and components only through virtual modules that Vite's scan does not
// follow. Without this, the packages the addons import (yjs, driver.js, markmap-view, ...) are found while the first
// page loads, bundled in rounds, and the page is reloaded after a round (an export's print page too, which then loads
// again: addon-publish's setup/print.ts). The setups
// that run in the page, the components and the layouts of every root (the deck's, the theme's, the addons') are
// entries too, so those packages are bundled at once, when the server starts. The default export is the setup
// function; `defineVitePluginsSetup` would only type it.

/** What of Slidev's resolved options the setup reads. */
interface Options {
  userRoot: string
  roots: string[]
}

/** A path for a glob pattern, relative to the deck (the Vite root), with forward slashes. */
function fromDeck(deck: string, path: string): string {
  const from = deck.split(/[\\/]/).filter(Boolean)
  const to = path.split(/[\\/]/).filter(Boolean)
  let same = 0
  while (same < from.length && same < to.length && from[same] === to[same]) same++
  return [...from.slice(same).map(() => '..'), ...to.slice(same)].join('/') || '.'
}

/** Slidev's setups that run in the page (custom/index.md); the others (vite-plugins, unocss, katex, ...) run in Node. */
const CLIENT_SETUPS = '{main,root,routes,shortcuts,code-runners,monaco,mermaid,mermaid-renderer,context-menu}'

export default function setup(options: Options) {
  const entries = options.roots.flatMap((root) => {
    const at = fromDeck(options.userRoot, root)
    return [`${at}/setup/${CLIENT_SETUPS}.{ts,js,mjs}`, `${at}/components/**/*.vue`, `${at}/layouts/*.vue`]
  })
  return [{
    name: 'presmium:book-dependencies',
    config: () => ({ optimizeDeps: { entries } }),
  }]
}
