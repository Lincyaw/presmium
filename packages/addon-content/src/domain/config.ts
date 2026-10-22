export const CONTENT_ID = 'presmium.content'

const CUSTOM_ELEMENT_PREFIX = 'presmium-'

/** Tags the slides form leaves to the browser as custom elements (web components), not Vue components. */
export function isCustomElementTag(tag: string): boolean {
  return tag.startsWith(CUSTOM_ELEMENT_PREFIX)
}
