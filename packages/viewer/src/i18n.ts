import { currentLocale } from '@presmium/host'
import { VIEWER_MESSAGES } from './domain/index.ts'
import type { Messages } from './domain/index.ts'

export function messages(): Messages {
  return VIEWER_MESSAGES[currentLocale()]
}
