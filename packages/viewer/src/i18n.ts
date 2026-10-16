import { currentLocale } from '@presmium/host'
import { VIEWER_MESSAGES } from './domain/index.ts'
import type { Messages } from './domain/index.ts'

/**
 * The interface text in the UI language (`currentLocale` of @presmium/host:
 * `<html lang>`, else the browser's; in the server render, the deck's). It is
 * reactive, so what renders it follows a host that sets `<html lang>` after
 * the first render (VitePress's dev server).
 */
export function messages(): Messages {
  return VIEWER_MESSAGES[currentLocale()]
}
