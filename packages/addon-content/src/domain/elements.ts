export const CONTENT_ID = 'presmium.content'

const ELEMENT_PREFIX = 'presmium-'

export const DEMO_COUNTER_TAG = `${ELEMENT_PREFIX}demo-counter`

export function isCustomElementTag(tag: string): boolean {
  return tag.startsWith(ELEMENT_PREFIX)
}
