import { currentLocale } from '@presmium/host'
import { STAGE_MESSAGES } from '../domain/index.ts'
import type { StageMessages } from '../domain/index.ts'

export function messages(): StageMessages {
  return STAGE_MESSAGES[currentLocale()]
}
