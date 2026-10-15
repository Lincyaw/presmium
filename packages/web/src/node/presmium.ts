import type { PresmiumNodePlugin } from '@presmium/kernel'

/** The web form converts decks with its own command (`presmium-web`); it adds no checks or transforms. */
const plugin: PresmiumNodePlugin = { id: 'presmium.web' }

export default plugin
