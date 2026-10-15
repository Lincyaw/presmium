export const CONTENT_ID = 'presmium.content'

/**
 * Tags with this prefix are custom elements (P-43): Vue leaves them to the
 * browser instead of resolving them as components.
 */
const ELEMENT_PREFIX = 'presmium-'

/** The demo web component: a counter that keeps its own state. */
export const DEMO_COUNTER_TAG = `${ELEMENT_PREFIX}demo-counter`

/** Vue's `compilerOptions.isCustomElement` for both forms. */
export function isCustomElementTag(tag: string): boolean {
  return tag.startsWith(ELEMENT_PREFIX)
}
