import { messagesFor } from '../domain/index.ts'
import type { StageMessages } from '../domain/index.ts'

/** The stage's interface text in the page's language (`<html lang>`), else the browser's. Browser only. */
export function messages(): StageMessages {
  return messagesFor(document.documentElement.lang || navigator.language)
}
