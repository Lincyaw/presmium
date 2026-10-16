import { currentLocale } from '@presmium/host'
import { STAGE_MESSAGES } from '../domain/index.ts'
import type { StageMessages } from '../domain/index.ts'

/** The stage's interface text in the UI language (`currentLocale` of @presmium/host). */
export function messages(): StageMessages {
  return STAGE_MESSAGES[currentLocale()]
}
